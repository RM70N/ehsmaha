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
  lastError: null
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

/**
 * يسترجع آخر نسخة ويكتبها مكان ملف SQLite قبل فتحه.
 * يعيد المحاولة لين ينجح (الـAPI ممكن يكون نايم أو طايح مؤقتاً).
 * @returns {Promise<{restored:boolean,size?:number}>}
 */
async function restore(file, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxAttempts = Infinity } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await state.api.claimBotState(state.bootAt);
      const snap = res && res.snapshot;
      if (snap && snap.data) {
        const buf = Buffer.from(snap.data, 'base64');
        if (sha256(buf) !== snap.sha256) throw new Error('بصمة النسخة المسترجعة غير مطابقة');
        fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
        removeLocal(file);
        fs.writeFileSync(file, buf);
        state.lastSha = snap.sha256;
        state.restored = true;
        logger.info('✅ تم استرجاع قاعدة بيانات البوت من النسخة الاحتياطية الدائمة', { size: buf.length, savedAt: snap.updatedAt });
        return { restored: true, size: buf.length };
      }
      state.restored = true;
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
      state.lastError = err.code || err.message;
      const wait = RESTORE_BACKOFF_MS[Math.min(attempt - 1, RESTORE_BACKOFF_MS.length - 1)];
      logger.warn('تعذّر استرجاع النسخة الاحتياطية لقاعدة البوت — إعادة المحاولة', { attempt, code: err.code, waitMs: wait });
      if (attempt >= maxAttempts) throw err;
      await sleep(wait);
    }
  }
  return { restored: false };
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
    lastError: state.lastError
  };
}

function reset() {
  if (state.timer) clearTimeout(state.timer);
  if (state.safety) clearInterval(state.safety);
  Object.assign(state, { enabled: false, api: null, getBuffer: null, restored: false, stale: false, dirty: false, lastSha: null, timer: null, safety: null, flushing: null, lastSavedAt: null, lastError: null });
}

module.exports = { shouldEnable, configure, restore, markDirty, flush, shutdown, startSafetyFlush, status, isActive: () => state.enabled && !state.stale, _reset: reset };
