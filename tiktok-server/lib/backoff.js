'use strict';
// تراجع أسّي مع jitter — دالة نقية (rng قابل للحقن للاختبار).
//   attempt: رقم المحاولة الفاشلة (1 = أول فشل).
//   الناتج: baseMs * factor^(attempt-1) بسقف maxMs، ثم ±jitter (نسبة) عشوائياً، بحد أدنى minMs.
// jitter متناسب (لا إضافة ثابتة) حتى لا تُعيد كل الغرف الاتصال بنفس اللحظة (thundering herd)
// ولا نضاعف التأخيرات القصيرة.
function backoffDelay(attempt, opts) {
  const o = Object.assign({ baseMs: 2000, maxMs: 60000, factor: 2, jitter: 0.25, minMs: 250, rng: Math.random }, opts || {});
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const raw = Math.min(o.maxMs, o.baseMs * Math.pow(o.factor, n - 1));
  const spread = raw * o.jitter;
  const jittered = raw - spread + o.rng() * spread * 2;
  return Math.max(o.minMs, Math.round(jittered));
}

module.exports = { backoffDelay };
