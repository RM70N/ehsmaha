'use strict';

// طابور التنفيذ:
//   • طابور تسلسلي لكل سيرفر — مهام المالك ما تتداخل (والذاكرة تبقى متسقة)، وبدون ما توقف
//     استقبال رسائل باقي اللاعبين (كل حدث رسالة يشتغل لحاله)
//   • منع تكرار نفس الرسالة (Message ID) داخل الذاكرة؛ والتكرار عبر إعادة التشغيل يمنعه
//     جدول owner_ai_tasks (message_id فريد)
//   • حد للمهام المنتظرة، وإعادة محاولة مضبوطة (Backoff) للأخطاء المؤقتة فقط
//   • فاصل بسيط بين الخطوات احتراماً لحدود Discord API

const { OwnerAIError } = require('./errorHandler');

const MAX_STEPS = 12;
const MAX_PENDING_PER_GUILD = 5;
const SEEN_TTL_MS = 10 * 60 * 1000;
const SEEN_MAX = 2000;

const chains = new Map(); // guildId -> { tail: Promise, pending: number }
const seen = new Map(); // messageId -> at
let stepDelayMs = 250;

function setStepDelay(ms) {
  stepDelayMs = Math.max(0, ms | 0);
}
const getStepDelay = () => stepDelayMs;

/** true لو أول مرة نشوف الرسالة، false لو مكررة */
function markSeen(messageId) {
  const now = Date.now();
  if (seen.size > SEEN_MAX) for (const [k, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(k);
  if (seen.has(messageId) && now - seen.get(messageId) < SEEN_TTL_MS) return false;
  seen.set(messageId, now);
  return true;
}

/** ينفذ fn بعد المهام السابقة بنفس السيرفر. يرجّع نتيجة fn (والخطأ يرجع لصاحب الطلب بدون ما يكسر الطابور). */
function enqueue(guildId, fn) {
  let c = chains.get(guildId);
  if (!c) {
    c = { tail: Promise.resolve(), pending: 0 };
    chains.set(guildId, c);
  }
  if (c.pending >= MAX_PENDING_PER_GUILD) return Promise.reject(new OwnerAIError('BUSY'));
  c.pending += 1;
  const run = c.tail.then(fn);
  c.tail = run.catch(() => null).then(() => {
    c.pending -= 1;
    if (c.pending === 0) chains.delete(guildId);
  });
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isTransient(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNABORTED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)) return true;
  const status = err.status || err.httpStatus;
  if (status >= 500 && status < 600) return true;
  return /fetch failed|socket hang up|network/i.test(String(err.message || ''));
}

/** إعادة محاولة بتأخير متزايد — للعمليات الآمنة التكرار فقط (idempotent) */
async function withRetry(fn, { attempts = 3, baseMs = 400 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      last = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      await sleep(baseMs * 2 ** i);
    }
  }
  throw last;
}

module.exports = { enqueue, markSeen, withRetry, isTransient, sleep, setStepDelay, getStepDelay, MAX_STEPS, MAX_PENDING_PER_GUILD, _internal: { chains, seen } };
