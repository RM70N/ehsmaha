'use strict';

// النسخ الاحتياطي الدائم لقاعدة بيانات البوت (SQLite) عبر طبقة الـAPI → Firestore.
//
// المشكلة: على Render المجاني القرص مؤقت — كل تحديث/إعادة تشغيل يمسح ملف
// SQLite، فتضيع رتب الدعم والأدمن والتحذيرات وإعدادات الترحيب والحماية.
// الحل (بدون أي إعداد منك): البوت عند الإقلاع يسترجع آخر نسخة محفوظة، وبعد
// كل تعديل يرفع نسخة جديدة (بعد 3 ثوانٍ من آخر كتابة)، وعند الإيقاف (SIGTERM
// اللي يرسله Render قبل أي تحديث) يرفع آخر نسخة فوراً.
//
// الأمان:
//   • القاعدة ما تُفتح للأوامر لين يكتمل الاسترجاع — ما نبدأ بقاعدة فاضية
//     ونمسح بها النسخة المحفوظة أبداً.
//   • أثناء التحديث تشتغل نسختين من البوت لحظات: الأحدث تستلم النسخة، وأي
//     رفع من الأقدم بعدها يُرفض (409) فيتوقف النسخ منها تلقائياً.
//
// يتفعّل تلقائياً على Render لما ما فيه DATABASE_URL (BOT_STATE_BACKUP=auto).

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const logger = require('../utils/logger');

const DEBOUNCE_MS = 3000;
const SAFETY_FLUSH_MS = 10 * 60 * 1000;
const RESTORE_BACKOFF_MS = [5000, 10000, 20000, 30000, 60000];
// أقصى انتظار للاسترجاع عند الإقلاع — بعده البوت يشتغل عادي ويكمل المحاولة بالخلفية
const RESTORE_DEADLINE_MS = 90 * 1000;
const RECOVERY_INTERVAL_MS = 60 * 1000;

const state = {
  enabled: false,
  api: null,
  getBuffer: null,
  bootAt: Date.now(),
  restored: false,
  stale: false, // نسخة أحدث من البوت استلمت — نوقف الرفع
  dirty: false,
  lastSha: null,
  timer: null,
  safety: null,
  flushing: null,
  lastSavedAt: null,
  lastError: null,
  recovery: null // مؤقت الاسترجاع بالخلفية (لو الـAPI ما رد وقت الإقلاع)
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function shouldEnable(config, env = process.env) {
  const mode = String(env.BOT_STATE_BACKUP || 'auto').trim().toLowerCase();
  if (config.databaseUrl) return false; // PostgreSQL دائم أصلاً
  if (mode === 'off' || mode === 'false') return false;
  if (mode === 'on' || mode === 'true') return true;
  return !!env.RENDER;
}

function configure({ api, getBuffer, bootAt = Date.now() }) {
  state.enabled = true;
  state.api = api;
  state.getBuffer = getBuffer;
  state.bootAt = bootAt;
}

// يحذف ملف القاعدة المحلي وملفاته المرافقة
function removeLocal(file) {
  for (const f of [file, `${file}-wal`, `${file}-shm`, `${file}-journal`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch (_) {
      /* ignore */
    }
  }
}

// محاولة استلام وحدة: ترجّع { snapshot } أو ترمي
async function claimOnce(timeoutMs) {
  const call = state.api.claimBotState(state.bootAt);
  if (!timeoutMs) return call;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('انتهت مهلة الاسترجاع'), { code: 'RESTORE_TIMEOUT' })), timeoutMs);
  });
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function writeSnapshot(file, snap) {
  const buf = Buffer.from(snap.data, 'base64');
  if (sha256(buf) !== snap.sha256) throw new Error('بصمة النسخة المسترجعة غير مطابقة');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  removeLocal(file);
  fs.writeFileSync(file, buf);
  state.lastSha = snap.sha256;
  return buf.length;
}

/**
 * يسترجع آخر نسخة ويكتبها مكان ملف SQLite قبل فتحه.
 * يعيد المحاولة لين ينجح أو تخلص المهلة (deadlineMs) — بعدها يرجّع
 * { degraded: true }: البوت يشتغل بقاعدة محلية والرفع موقوف لين ينجح
 * الاسترجاع بالخلفية (startRecovery) — فما نمسح النسخة المحفوظة أبداً.
 * @returns {Promise<{restored:boolean,size?:number,degraded?:boolean}>}
 */
async function restore(file, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxAttempts = Infinity, deadlineMs = RESTORE_DEADLINE_MS, now = Date.now } = {}) {
  const started = now();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const left = deadlineMs - (now() - started);
    try {
      const res = await claimOnce(Math.max(left, 1000));
      const snap = res && res.snapshot;
      state.restored = true;
      state.lastError = null;
      if (snap && snap.data) {
        const size = writeSnapshot(file, snap);
        logger.info('✅ تم استرجاع قاعدة بيانات البوت من النسخة الاحتياطية الدائمة', { size, savedAt: snap.updatedAt });
        return { restored: true, size };
      }
      logger.info('ما فيه نسخة احتياطية سابقة لقاعدة البوت — بداية جديدة');
      return { restored: false };
    } catch (err) {
      if (err && err.code === 'STALE_INSTANCE') {
        // نسخة أحدث من البوت شغالة — هذي النسخة ما لها داعي تكتب شي
        state.stale = true;
        state.restored = true;
        logger.warn('نسخة أحدث من البوت استلمت قاعدة البيانات — هذي النسخة ما بترفع نسخ احتياطية');
        return { restored: false };
      }
      state.lastError = (err && (err.code || err.message)) || 'UNKNOWN';
      const wait = RESTORE_BACKOFF_MS[Math.min(attempt - 1, RESTORE_BACKOFF_MS.length - 1)];
      const remaining = deadlineMs - (now() - started);
      logger.warn('تعذّر استرجاع النسخة الاحتياطية لقاعدة البوت', { attempt, code: state.lastError, status: err && err.status });
      if (attempt >= maxAttempts && maxAttempts !== Infinity) throw err;
      if (remaining <= wait) {
        logger.error('⚠️ الاسترجاع ما نجح خلال المهلة — البوت يشتغل الحين، والاسترجاع يكمل بالخلفية (الرفع موقوف لين ينجح)', { code: state.lastError });
        return { restored: false, degraded: true };
      }
      await sleep(wait);
    }
  }
  return { restored: false };
}

/**
 * استرجاع بالخلفية بعد إقلاع "مؤقت": كل دقيقة يحاول يستلم النسخة.
 *   • فيه نسخة محفوظة ← onSnapshot(كتابة الملف) لتبديل القاعدة بها (المحفوظ هو الأصل).
 *   • ما فيه نسخة ← تفعيل الرفع بالبيانات الحالية.
 */
function startRecovery({ file, swap, intervalMs = RECOVERY_INTERVAL_MS }) {
  if (state.recovery || state.restored) return;
  const tick = async () => {
    try {
      const res = await claimOnce(75 * 1000);
      const snap = res && res.snapshot;
      if (snap && snap.data && snap.sha256 !== state.lastSha) {
        await swap(() => writeSnapshot(file, snap));
        logger.info('✅ تم استرجاع قاعدة بيانات البوت بالخلفية — الإعدادات المحفوظة رجعت');
      }
      state.restored = true;
      state.lastError = null;
      clearInterval(state.recovery);
      state.recovery = null;
      if (!snap) markDirty(); // ما فيه نسخة سابقة: نرفع الحالية
    } catch (err) {
      if (err && err.code === 'STALE_INSTANCE') {
        state.stale = true;
        clearInterval(state.recovery);
        state.recovery = null;
        return;
      }
      state.lastError = (err && (err.code || err.message)) || 'UNKNOWN';
      logger.warn('الاسترجاع بالخلفية ما نجح بعد — بنعيد المحاولة', { code: state.lastError, status: err && err.status });
    }
  };
  state.recovery = setInterval(() => tick(), intervalMs);
  if (typeof state.recovery.unref === 'function') state.recovery.unref();
  return tick;
}

async function doFlush() {
  if (!state.enabled || !state.restored || state.stale) return false;
  const buf = state.getBuffer();
  if (!buf || !buf.length) return false;
  const sha = sha256(buf);
  if (sha === state.lastSha) {
    state.dirty = false;
    return false;
  }
  state.dirty = false;
  try {
    await state.api.saveBotState({ bootAt: state.bootAt, data: buf.toString('base64'), sha256: sha });
    state.lastSha = sha;
    state.lastSavedAt = Date.now();
    state.lastError = null;
    logger.debug('تم حفظ نسخة احتياطية لقاعدة البوت', { size: buf.length });
    return true;
  } catch (err) {
    if (err && err.code === 'STALE_INSTANCE') {
      state.stale = true;
      logger.warn('نسخة أحدث من البوت شغالة — إيقاف النسخ الاحتياطي من هذه النسخة');
      return false;
    }
    state.dirty = true; // نعيد المحاولة مع الكتابة الجاية أو الفحص الدوري
    state.lastError = err.code || err.message;
    logger.warn('تعذّر حفظ النسخة الاحتياطية لقاعدة البوت — بنعيد المحاولة', { code: err.code });
    return false;
  }
}

// رفع واحد بنفس اللحظة؛ لو صار تعديل أثناء الرفع نرفع مرة ثانية بعده
async function flush() {
  if (state.flushing) {
    await state.flushing;
    if (!state.dirty) return false;
  }
  state.flushing = doFlush().finally(() => {
    state.flushing = null;
  });
  return state.flushing;
}

function markDirty() {
  if (!state.enabled || state.stale) return;
  state.dirty = true;
  if (state.timer) clearTimeout(state.timer);
  state.timer = setTimeout(() => {
    state.timer = null;
    flush().catch(() => {});
  }, DEBOUNCE_MS);
  if (typeof state.timer.unref === 'function') state.timer.unref();
}

function startSafetyFlush() {
  if (state.safety) return;
  state.safety = setInterval(() => {
    if (state.dirty) flush().catch(() => {});
  }, SAFETY_FLUSH_MS);
  if (typeof state.safety.unref === 'function') state.safety.unref();
}

// عند الإيقاف: رفع فوري لأي تعديل معلّق (بحد أقصى timeoutMs)
async function shutdown(timeoutMs = 12000) {
  if (state.timer) clearTimeout(state.timer);
  if (state.safety) clearInterval(state.safety);
  if (state.recovery) clearInterval(state.recovery);
  state.recovery = null;
  state.timer = null;
  state.safety = null;
  if (!state.enabled || !state.dirty) return;
  await Promise.race([flush(), new Promise((r) => setTimeout(r, timeoutMs))]);
}

function status() {
  return {
    enabled: state.enabled,
    restored: state.restored,
    stale: state.stale,
    dirty: state.dirty,
    lastSavedAt: state.lastSavedAt,
    lastError: state.lastError,
    recovering: !!state.recovery
  };
}

function reset() {
  if (state.timer) clearTimeout(state.timer);
  if (state.safety) clearInterval(state.safety);
  if (state.recovery) clearInterval(state.recovery);
  Object.assign(state, { enabled: false, api: null, getBuffer: null, restored: false, stale: false, dirty: false, lastSha: null, timer: null, safety: null, flushing: null, lastSavedAt: null, lastError: null, recovery: null });
}

module.exports = {
  shouldEnable,
  configure,
  restore,
  startRecovery,
  markDirty,
  flush,
  shutdown,
  startSafetyFlush,
  status,
  // الحفظ الدائم شغال فعلاً (استرجع/استلم، ومو نسخة قديمة)
  isActive: () => state.enabled && state.restored && !state.stale,
  _reset: reset
};
