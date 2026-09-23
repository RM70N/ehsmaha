'use strict';

// الفعاليات النشطة بالموقع:
//   • streamerEvents (status == 'active')  — فعالية "أفضل ستريمر" وأخواتها
//   • event100/current (status ≠ finished) — فعالية "عدد جديد"
// لو ما فيه شي نشط ترجع مصفوفة فاضية، والبوت يعرض "لا توجد فعاليات نشطة حالياً".

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const memo = require('./memo');
const { toIso } = require('./time');

const TTL_MS = 60 * 1000;

const STREAMER_EVENT_TYPES = {
  bestStreamer: { icon: '🏆', title: 'أفضل ستريمر', description: 'منافسة بين الستريمرز — الأطول بثاً والأكثر فوزاً يحسمها!' }
};

const EVENT100_STATUS = {
  announcing: 'إعلان — استعدوا',
  registration: 'التسجيل مفتوح',
  active: 'شغّالة الآن'
};

async function activeStreamerEvents() {
  const snap = await firestore.db().collection(C.STREAMER_EVENTS).where('status', '==', 'active').limit(10).get();
  return snap.docs.map((d) => {
    const v = d.data();
    const meta = STREAMER_EVENT_TYPES[v.type] || {};
    return {
      id: d.id,
      type: v.type || 'event',
      icon: meta.icon || '🏆',
      title: v.title || meta.title || 'فعالية',
      description: v.broadcastMessage || meta.description || '',
      status: 'active',
      statusLabel: 'شغّالة الآن',
      startsAt: toIso(v.createdAt),
      endsAt: toIso(v.contest_end_at)
    };
  });
}

async function activeEvent100() {
  const snap = await firestore.db().collection(C.EVENT100).doc('current').get();
  if (!snap.exists) return [];
  const v = snap.data();
  if (!v.status || !EVENT100_STATUS[v.status]) return []; // finished أو حالة غير معروفة

  // وقت نهاية الجولة الحالية لو معروف (roundStartedAt + roundMinutes)
  let endsAt = null;
  const roundStartMs = v.roundStartedAt && v.roundStartedAt.toMillis ? v.roundStartedAt.toMillis() : 0;
  if (v.status === 'active' && roundStartMs && Number(v.roundMinutes) > 0) {
    endsAt = new Date(roundStartMs + Number(v.roundMinutes) * 60000).toISOString();
  }
  return [
    {
      id: 'event100',
      type: 'event100',
      icon: '🎪',
      title: 'فعالية عدد جديد',
      description: String(v.status === 'announcing' ? v.msg1 || '' : v.msg2 || v.msg1 || '').slice(0, 500),
      status: v.status,
      statusLabel: EVENT100_STATUS[v.status],
      startsAt: toIso(v.announceStartedAt),
      endsAt
    }
  ];
}

async function getActiveEvents() {
  return memo.remember('events:active', TTL_MS, async () => {
    // كل مصدر مستقل: فشل واحد ما يلغي الثاني
    const results = await Promise.allSettled([activeStreamerEvents(), activeEvent100()]);
    const events = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    if (results.every((r) => r.status === 'rejected')) throw results[0].reason;
    return { events, generatedAt: new Date().toISOString() };
  });
}

module.exports = { getActiveEvents };
