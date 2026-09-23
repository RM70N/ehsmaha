'use strict';

// كاش بسيط بالذاكرة لطبقة الـAPI مع منع الطلبات المتزامنة المكررة لنفس المفتاح
// (لو 30 طلب متصدرين وصلوا سوا والكاش فاضي → استعلام Firestore واحد فقط).

const store = new Map(); // key -> { value, expiresAt }
const inflight = new Map();
const MAX_KEYS = 5000;

async function remember(key, ttlMs, producer) {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  if (inflight.has(key)) return inflight.get(key);

  const p = (async () => {
    try {
      const value = await producer();
      if (ttlMs > 0) {
        if (store.size >= MAX_KEYS) store.delete(store.keys().next().value); // أقدم مفتاح
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

function invalidate(prefix) {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, v] of store) if (v.expiresAt <= now) store.delete(key);
}, 60_000).unref();

module.exports = { remember, invalidate, size: () => store.size };
