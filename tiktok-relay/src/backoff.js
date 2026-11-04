'use strict';
// تراجع أسّي مع jitter — دالة نقية (rng قابل للحقن للاختبار). نفس نمط tiktok-server/lib/backoff.js.
//   attempt: رقم المحاولة الفاشلة (1 = أول فشل).
//   الناتج: baseMs * factor^(attempt-1) بسقف maxMs، ثم ±jitter (نسبة) عشوائياً، بحد أدنى minMs.
// jitter متناسب (لا إضافة ثابتة) حتى لا تُعيد كل الغرف الاتصال بنفس اللحظة (thundering herd).
export function backoffDelay(attempt, opts) {
  const o = Object.assign({ baseMs: 2000, maxMs: 60000, factor: 2, jitter: 0.25, minMs: 250, rng: Math.random }, opts || {});
  const n = Math.max(1, Math.floor(Number(attempt) || 1));
  const raw = Math.min(o.maxMs, o.baseMs * Math.pow(o.factor, n - 1));
  const spread = raw * o.jitter;
  const jittered = raw - spread + o.rng() * spread * 2;
  // الـjitter يقدر يتجاوز maxMs لو raw قريب من السقف (مثال: raw=maxMs وrng()=1 يعطي maxMs*(1+jitter))،
  // فنُقفل النطاق من الطرفين بعد الـjitter، لا من طرف minMs فقط.
  return Math.min(o.maxMs, Math.max(o.minMs, Math.round(jittered)));
}

// jitter للفحص الدوري (±نسبة حول قيمة بين min/max) — لتفادي اصطفاف كل الحسابات على نفس اللحظة.
export function pollDelay(minMs, maxMs, rng = Math.random) {
  return Math.round(minMs + rng() * Math.max(0, maxMs - minMs));
}
