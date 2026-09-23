'use strict';

// كاش بالذاكرة (node-cache) لتخفيف الضغط على الـAPI وقاعدة البيانات.
// الاستخدام الأساسي: نتائج المتصدرين (تتغير ببطء نسبياً ويطلبها كثيرون).

const NodeCache = require('node-cache');

const store = new NodeCache({
  stdTTL: 60,
  checkperiod: 30,
  useClones: false, // القيم ما تُعدَّل بعد التخزين — نوفّر نسخ الذاكرة
  maxKeys: 5000
});

// طلبات قيد التنفيذ لنفس المفتاح: لو وصل 20 طلب متصدرين بنفس اللحظة
// والكاش فاضي، نرسل طلب API واحد ويستنى الباقي نتيجته (منع "cache stampede").
const inflight = new Map();

async function remember(key, ttlSeconds, producer) {
  const hit = store.get(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await producer();
      if (ttlSeconds > 0 && value !== undefined) {
        try { store.set(key, value, ttlSeconds); } catch (_) { /* maxKeys ممتلئ — نرجّع القيمة بدون تخزين */ }
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

module.exports = {
  remember,
  get: (key) => store.get(key),
  set: (key, value, ttl) => store.set(key, value, ttl),
  del: (key) => store.del(key),
  delPrefix: (prefix) => store.del(store.keys().filter((k) => k.startsWith(prefix))),
  stats: () => store.getStats(),
  flush: () => store.flushAll()
};
