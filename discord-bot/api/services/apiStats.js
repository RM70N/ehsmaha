'use strict';

// عدّاد استدعاءات الـAPI اليومي: يتجمع بالذاكرة ويُكتب لـFirestore كل 30 ثانية
// (FieldValue.increment) بدل كتابة لكل طلب — يبقى دقيق حتى مع إعادة التشغيل
// أو أكثر من نسخة، وبتكلفة كتابة ضئيلة.

const firestore = require('../../database/firestore');
const C = require('../../database/collections');

const FLUSH_MS = 30_000;
let pending = new Map(); // day -> { calls, errors }
let timer = null;
let logger = console;

function dayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function record(isError) {
  const day = dayKey();
  const p = pending.get(day) || { calls: 0, errors: 0 };
  p.calls += 1;
  if (isError) p.errors += 1;
  pending.set(day, p);
}

async function flush() {
  if (!pending.size) return;
  const batch = pending;
  pending = new Map();
  const { FieldValue } = firestore;
  try {
    await Promise.all(
      [...batch.entries()].map(([day, p]) =>
        firestore
          .db()
          .collection(C.DISCORD_API_STATS)
          .doc(day)
          .set({ day, calls: FieldValue.increment(p.calls), errors: FieldValue.increment(p.errors), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      )
    );
  } catch (err) {
    // فشلت الكتابة — نرجّع الأرقام للطابور حتى ما تضيع
    for (const [day, p] of batch) {
      const cur = pending.get(day) || { calls: 0, errors: 0 };
      pending.set(day, { calls: cur.calls + p.calls, errors: cur.errors + p.errors });
    }
    logger.warn('تعذّر حفظ عدّادات الـAPI', { error: err });
  }
}

async function today() {
  const day = dayKey();
  const snap = await firestore.db().collection(C.DISCORD_API_STATS).doc(day).get();
  const saved = snap.exists ? snap.data() : {};
  const p = pending.get(day) || { calls: 0, errors: 0 };
  return { calls: (Number(saved.calls) || 0) + p.calls, errors: (Number(saved.errors) || 0) + p.errors };
}

function start(log) {
  if (log) logger = log;
  if (timer) return;
  timer = setInterval(flush, FLUSH_MS);
  timer.unref();
}

async function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  await flush();
}

// Middleware: يحسب كل طلب /api بعد ما ينتهي (نجاح أو خطأ ≥ 500)
function middleware(req, res, next) {
  res.on('finish', () => record(res.statusCode >= 500));
  next();
}

module.exports = { record, flush, today, start, stop, middleware, dayKey };
