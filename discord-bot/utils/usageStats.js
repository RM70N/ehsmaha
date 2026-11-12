'use strict';

// إحصائيات استخدام البوت: عدّادات اليوم بالذاكرة (للتوافق مع /ادمن_احصائيات) + حفظ دائم بجدول command_usage.
// التجميع بالذاكرة ويُفرَّغ للقاعدة كل 30 ثانية وعند الإيقاف النظيف، فإعادة التشغيل ما تصفّر العدّادات:
// عند الإقلاع (start) نحمّل عدّادات اليوم من القاعدة. نخزّن **رمز** آخر خطأ فقط (لا نص ولا بيانات مستخدمين).
// السجلات الأقدم من 90 يوماً تُحذف تلقائياً.

const logger = require('./logger');

const FLUSH_MS = 30 * 1000;
const RETENTION_DAYS = 90;
const startedAt = Date.now();
const state = { day: today(), commands: 0, buttons: 0, errors: 0, byCommand: new Map() };
const pending = new Map(); // `${day}|${name}` -> { day, name, uses, errors, denied, lastUsedAt, lastErrorAt, lastErrorCode }
let timer = null;
let pruneTimer = null;
let flushing = Promise.resolve();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function roll() {
  const d = today();
  if (state.day !== d) {
    state.day = d;
    state.commands = 0;
    state.buttons = 0;
    state.errors = 0;
    state.byCommand.clear();
  }
}

function bucket(name) {
  const day = state.day;
  const key = `${day}|${name}`;
  let b = pending.get(key);
  if (!b) {
    b = { day, name, uses: 0, errors: 0, denied: 0, lastUsedAt: null, lastErrorAt: null, lastErrorCode: null };
    pending.set(key, b);
  }
  return b;
}

const safeCode = (c) => (c == null ? 'ERROR' : String(c).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 40) || 'ERROR');

async function flush() {
  // تسلسل: ما نكتب دفعتين بنفس الوقت
  flushing = flushing.then(async () => {
    if (!pending.size) return;
    const db = require('../database/botDb');
    if (!db.isReady()) return;
    const batch = [...pending.entries()];
    for (const [key, b] of batch) {
      try {
        await db.run(
          `INSERT INTO command_usage (day, command_name, uses, errors, denied, last_used_at, last_error_at, last_error_code)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (day, command_name) DO UPDATE SET uses = command_usage.uses + excluded.uses, errors = command_usage.errors + excluded.errors,
             denied = command_usage.denied + excluded.denied,
             last_used_at = COALESCE(excluded.last_used_at, command_usage.last_used_at),
             last_error_at = COALESCE(excluded.last_error_at, command_usage.last_error_at),
             last_error_code = COALESCE(excluded.last_error_code, command_usage.last_error_code)`,
          [b.day, b.name, b.uses, b.errors, b.denied, b.lastUsedAt, b.lastErrorAt, b.lastErrorCode]
        );
        pending.delete(key); // ننشيل بس بعد نجاح الكتابة (فشلها = تبقى للمحاولة الجاية)
      } catch (err) {
        logger.warn('إحصاءات الأوامر: تعذّر الحفظ (بنعيد)', { error: err && err.message });
        return;
      }
    }
  });
  return flushing.catch(() => {});
}

/** يحمّل عدّادات اليوم من القاعدة (بعد إعادة التشغيل) ويشغّل الحفظ الدوري */
async function start() {
  const db = require('../database/botDb');
  try {
    const rows = await db.query('SELECT command_name, uses, errors FROM command_usage WHERE day = ?', [today()]);
    roll();
    for (const r of rows) {
      const uses = Number(r.uses || 0);
      state.commands += uses;
      state.errors += Number(r.errors || 0);
      if (uses) state.byCommand.set(r.command_name, (state.byCommand.get(r.command_name) || 0) + uses);
    }
    await prune();
  } catch (err) {
    logger.warn('إحصاءات الأوامر: تعذّر تحميل عدّادات اليوم', { error: err && err.message });
  }
  if (!timer) {
    timer = setInterval(() => flush(), FLUSH_MS);
    if (timer.unref) timer.unref();
    pruneTimer = setInterval(() => prune().catch(() => {}), 24 * 60 * 60 * 1000);
    if (pruneTimer.unref) pruneTimer.unref();
  }
}

async function prune() {
  const db = require('../database/botDb');
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400000).toISOString().slice(0, 10);
  await db.run('DELETE FROM command_usage WHERE day < ?', [cutoff]);
}

/** إيقاف نظيف: تفريغ آخر دفعة */
async function stop() {
  if (timer) clearInterval(timer);
  if (pruneTimer) clearInterval(pruneTimer);
  timer = null;
  pruneTimer = null;
  await flush();
}

/** استخدام الأوامر لآخر N يوم (من القاعدة بعد تفريغ المعلّق) */
async function usage(days = 7) {
  await flush();
  const db = require('../database/botDb');
  const n = Math.min(Math.max(Number(days) || 7, 1), RETENTION_DAYS);
  const from = new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await db.query('SELECT * FROM command_usage WHERE day >= ? ORDER BY day DESC, uses DESC', [from]);
  const byCommand = new Map();
  for (const r of rows) {
    const c = byCommand.get(r.command_name) || { name: r.command_name, uses: 0, errors: 0, denied: 0, lastUsedAt: null, lastErrorAt: null, lastErrorCode: null };
    c.uses += Number(r.uses);
    c.errors += Number(r.errors);
    c.denied += Number(r.denied);
    const lu = r.last_used_at == null ? null : Number(r.last_used_at);
    const le = r.last_error_at == null ? null : Number(r.last_error_at);
    if (lu && lu > (c.lastUsedAt || 0)) c.lastUsedAt = lu;
    if (le && le > (c.lastErrorAt || 0)) { c.lastErrorAt = le; c.lastErrorCode = r.last_error_code; }
    byCommand.set(r.command_name, c);
  }
  return {
    days: n,
    from,
    commands: [...byCommand.values()].sort((a, b) => b.uses - a.uses),
    daily: rows.map((r) => ({ day: r.day, name: r.command_name, uses: Number(r.uses), errors: Number(r.errors), denied: Number(r.denied) }))
  };
}

module.exports = {
  command(name) {
    roll();
    state.commands += 1;
    state.byCommand.set(name, (state.byCommand.get(name) || 0) + 1);
    const b = bucket(name);
    b.uses += 1;
    b.lastUsedAt = Date.now();
  },
  button() {
    roll();
    state.buttons += 1;
  },
  // error() بدون وسائط يبقى متوافق مع الاستدعاء القديم؛ مع اسم أمر يُسجَّل بجدول الاستخدام (الرمز فقط)
  error(name, code) {
    roll();
    state.errors += 1;
    if (name) {
      const b = bucket(name);
      b.errors += 1;
      b.lastErrorAt = Date.now();
      b.lastErrorCode = safeCode(code);
    }
  },
  // رفض بضوابط الإدارة — يُحسب denied وليس خطأ
  denied(name) {
    roll();
    if (name) bucket(name).denied += 1;
  },
  snapshot() {
    roll();
    const top = [...state.byCommand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { day: state.day, commands: state.commands, buttons: state.buttons, errors: state.errors, top, startedAt };
  },
  start,
  stop,
  flush,
  usage,
  _internal: { pending, state, prune }
};
