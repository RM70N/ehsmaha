import { E } from '../../lib/errors.js';
import { now, isDocId } from '../../lib/util.js';
import { tsMs, pageSize } from '../siteHelpers.js';

const ev = (ctx, id) => ctx.fb.db().collection('streamerEvents').doc(id);
const mirror = (ctx) => ctx.fb.db().collection('streamerEventAnnouncements').doc('current');
const EID = { name: 'eventId', label: 'معرّف الفعالية', type: 'text', required: true, max: 200, help: 'من جدول الفعاليات' };
async function loadEvent(p, ctx) { if (!isDocId(p.eventId)) throw E.invalid('معرّف غير صالح'); const s = await ev(ctx, p.eventId).get(); if (!s.exists) throw E.notFound('الفعالية غير موجودة'); const d = s.data(); return { id: p.eventId, status: d.status, endAt: tsMs(d.contest_end_at), message: d.broadcastMessage, type: d.type }; }

// نفس منطق الموقع (sevtComputeWinners): الأطول بثاً فعلياً + الأكثر فوزاً
async function computeWinners(ctx, id) {
  const snap = await ev(ctx, id).collection('sessions').get();
  let dur = null, wins = null;
  for (const d of snap.docs) { const v = d.data(); const key = d.id; const secs = Number(v.totalPlayedSeconds) || 0, w = Number(v.totalWins) || 0; if (!dur || secs > dur.secs) dur = { key, secs }; if (!wins || w > wins.n) wins = { key, n: w }; }
  return { durationWinner: dur && dur.secs > 0 ? dur : null, winsWinner: wins && wins.n > 0 ? wins : null, sessions: snap.size };
}
const E100 = ['announcing', 'registration', 'active', 'finished'];

export default {
  id: 'events', workspace: 'website', label: 'الفعاليات والبطولات', icon: 'trophy', adminDefault: true, description: 'فعالية أفضل ستريمر، وفعالية «عدد جديد» (event100)',
  views: [
    {
      id: 'list', label: 'فعاليات الستريمرز', requires: ['firebase'], source: 'Firestore streamerEvents',
      columns: [{ key: 'id', label: 'المعرّف', mono: true }, { key: 'title', label: 'العنوان' }, { key: 'status', label: 'الحالة' }, { key: 'createdAt', label: 'بدأت', type: 'date' }, { key: 'endAt', label: 'تنتهي', type: 'date' }, { key: 'winner', label: 'الفائز (أطول بثاً)' }, { key: 'sessions', label: 'المشاركون' }],
      async fetch(q, ctx) {
        const snap = await ctx.fb.db().collection('streamerEvents').orderBy('createdAt', 'desc').limit(pageSize(q, 30)).get();
        const rows = await Promise.all(snap.docs.map(async (d) => { const v = d.data(); const n = (await d.ref.collection('sessions').count().get()).data().count; return { id: d.id, title: v.title || v.type, status: v.status === 'active' ? '🟢 جارية' : v.status === 'ended' ? '⚪ منتهية' : v.status, createdAt: tsMs(v.createdAt), endAt: tsMs(v.contest_end_at), winner: v.winnerStreamerKey || '—', sessions: n }; }));
        return { rows };
      }
    },
    {
      id: 'leaders', label: 'ترتيب المشاركين في الفعالية الجارية', requires: ['firebase'], source: 'streamerEvents/{id}/sessions',
      columns: [{ key: 'streamer', label: 'الستريمر' }, { key: 'secs', label: 'مدة البث (ث)' }, { key: 'wins', label: 'الفوزات' }],
      async fetch(q, ctx) {
        const a = await ctx.fb.db().collection('streamerEvents').where('status', '==', 'active').limit(1).get();
        if (a.empty) return { rows: [], meta: { note: 'لا توجد فعالية جارية الآن' } };
        const s = await a.docs[0].ref.collection('sessions').get();
        return { rows: s.docs.map((d) => ({ id: d.id, streamer: d.id, secs: Number(d.data().totalPlayedSeconds) || 0, wins: Number(d.data().totalWins) || 0 })).sort((x, y) => y.secs - x.secs), meta: { eventId: a.docs[0].id } };
      }
    },
    {
      id: 'event100', label: 'فعالية «عدد جديد» (event100)', requires: ['firebase'], source: 'Firestore event100/current',
      columns: [{ key: 'field', label: 'الحقل' }, { key: 'value', label: 'القيمة' }],
      async fetch(q, ctx) { const s = await ctx.fb.db().collection('event100').doc('current').get(); if (!s.exists) return { rows: [], meta: { note: 'لا توجد فعالية event100 حالياً' } }; return { rows: Object.entries(s.data()).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v) || typeof v.toMillis === 'function').map(([k, v]) => ({ id: k, field: k, value: v && v.toMillis ? new Date(v.toMillis()).toISOString() : String(v ?? '—').slice(0, 200) })) }; }
    }
  ],
  actions: [
    {
      id: 'launch_best_streamer', label: 'إطلاق فعالية «أفضل ستريمر»', icon: 'rocket', group: 'إنشاء وتفعيل', danger: 'high', reversible: true, requires: ['firebase'],
      description: 'ينشئ مستند الفعالية والمرآة الثابتة المسار بنفس بنية الموقع تماماً (type=bestStreamer) — يرفض لو هناك فعالية جارية', effect: 'تظهر الفعالية فوراً للزوار وتبدأ الجلسات بالاحتساب',
      fields: [{ name: 'message', label: 'رسالة الإعلان', type: 'textarea', required: true, max: 500 }, { name: 'days', label: 'المدة بالأيام', type: 'integer', required: true, min: 1, max: 30, default: 7 }], target: (p) => `${p.days} يوم`,
      async load(p, ctx) { const a = await ctx.fb.db().collection('streamerEvents').where('status', '==', 'active').limit(1).get(); if (!a.empty) throw E.conflict(`توجد فعالية جارية (${a.docs[0].id}) — أنهِها أولاً`); return { activeCount: 0 }; },
      async execute(p, ctx) {
        const id = 'bestStreamer_' + now(); const endAt = new Date(now() + p.days * 86400_000);
        await ev(ctx, id).set({ type: 'bestStreamer', status: 'active', title: 'أفضل ستريمر', broadcastMessage: p.message, contest_end_at: endAt, createdAt: ctx.fb.FieldValue.serverTimestamp(), createdByUid: 'admin-center', endedAt: null, winnerUniqueIdLower: null, winnerNickname: null, winnerStreamerKey: null, winnerDurationSeconds: 0, winnerMostWinsKey: null, winnerMostWinsCount: 0, forceEndRequested: false });
        await mirror(ctx).set({ eventId: id, status: 'active', broadcastMessage: p.message, updatedAt: ctx.fb.FieldValue.serverTimestamp() });
        return { message: `أُطلقت الفعالية ${id}`, undo: { action: 'events.end_now', params: { eventId: id } }, _id: id };
      },
      async verify(p, ctx, b, r) { const [e, m] = await Promise.all([ev(ctx, r._id).get(), mirror(ctx).get()]); return { ok: e.exists && e.data().status === 'active' && m.exists && m.data().eventId === r._id && m.data().status === 'active', after: { id: r._id, status: e.data()?.status, mirror: m.data()?.status }, message: 'مستند الفعالية أو مرآتها غير مطابق بعد الكتابة' }; }
    },
    {
      id: 'end_now', label: 'إنهاء الفعالية الآن وتحديد الفائز', icon: 'stop', group: 'إنشاء وتفعيل', danger: 'critical', reversible: false, reasonRequired: true, requires: ['firebase'],
      description: 'نفس منطق الموقع: يحسب الأطول بثاً والأكثر فوزاً من الجلسات، يكتب النتيجة النهائية ويحدّث المرآة', effect: 'تنتهي الفعالية ويُعلَن الفائز — لا يمكن التراجع',
      fields: [EID], target: (p) => p.eventId,
      async load(p, ctx) { const b = await loadEvent(p, ctx); if (b.status !== 'active') throw E.conflict('الفعالية ليست جارية'); return { ...b, winners: await computeWinners(ctx, p.eventId) }; },
      async execute(p, ctx, b) {
        const w = b.winners;
        await ev(ctx, p.eventId).update({ status: 'ended', endedAt: ctx.fb.FieldValue.serverTimestamp(), forceEndRequested: true, winnerStreamerKey: w.durationWinner?.key ?? null, winnerDurationSeconds: w.durationWinner?.secs ?? 0, winnerMostWinsKey: w.winsWinner?.key ?? null, winnerMostWinsCount: w.winsWinner?.n ?? 0 });
        await mirror(ctx).set({ eventId: p.eventId, status: 'ended', updatedAt: ctx.fb.FieldValue.serverTimestamp() }, { merge: true });
        return { message: `انتهت الفعالية — الفائز: ${w.durationWinner?.key || 'لا أحد'}` };
      },
      async verify(p, ctx, b) { const [e, m] = await Promise.all([ev(ctx, p.eventId).get(), mirror(ctx).get()]); return { ok: e.data().status === 'ended' && m.data()?.status === 'ended', after: { status: e.data().status, winner: e.data().winnerStreamerKey } }; }
    },
    {
      id: 'extend_end', label: 'تمديد موعد انتهاء الفعالية', icon: 'clock', group: 'التعديل', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'يزيد contest_end_at بعدد الساعات المحدد', effect: 'يتأخر موعد النهاية المعروض في الموقع',
      fields: [EID, { name: 'hours', label: 'ساعات التمديد', type: 'integer', required: true, min: 1, max: 720 }], target: (p) => `${p.eventId} +${p.hours}س`,
      async load(p, ctx) { const b = await loadEvent(p, ctx); if (b.status !== 'active') throw E.conflict('لا يمكن تمديد فعالية غير جارية'); return b; },
      async execute(p, ctx, b) { const next = new Date((b.endAt || now()) + p.hours * 3600_000); await ev(ctx, p.eventId).update({ contest_end_at: next }); return { message: `مُدّد الموعد إلى ${next.toLocaleString('ar-SA')}`, _next: next.getTime() }; },
      async verify(p, ctx, b, r) { const e = await ev(ctx, p.eventId).get(); return { ok: tsMs(e.data().contest_end_at) === r._next, after: { endAt: tsMs(e.data().contest_end_at) } }; }
    },
    {
      id: 'edit_message', label: 'تعديل رسالة إعلان الفعالية', icon: 'edit', group: 'التعديل', danger: 'low', reversible: true, requires: ['firebase'],
      description: 'يحدّث broadcastMessage في الفعالية والمرآة الثابتة', effect: 'يتغير نص الإعلان في الموقع',
      fields: [EID, { name: 'message', label: 'النص الجديد', type: 'textarea', required: true, max: 500 }], target: (p) => p.eventId, load: loadEvent,
      async execute(p, ctx, b) { await ev(ctx, p.eventId).update({ broadcastMessage: p.message }); const m = await mirror(ctx).get(); if (m.exists && m.data().eventId === p.eventId) await mirror(ctx).set({ broadcastMessage: p.message, updatedAt: ctx.fb.FieldValue.serverTimestamp() }, { merge: true }); return { message: 'تم تحديث الرسالة', undo: b.message ? { action: 'events.edit_message', params: { eventId: p.eventId, message: b.message } } : undefined }; },
      async verify(p, ctx) { const e = await ev(ctx, p.eventId).get(); return { ok: e.data().broadcastMessage === p.message, after: { message: e.data().broadcastMessage } }; }
    },
    {
      id: 'preview_winners', label: 'معاينة الفائزين الحاليين', icon: 'eye', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase'],
      description: 'يحسب من يفوز لو انتهت الفعالية الآن (دون إنهائها)', effect: 'قراءة فقط', fields: [EID], target: (p) => p.eventId,
      async execute(p, ctx) { await loadEvent(p, ctx); const w = await computeWinners(ctx, p.eventId); return { message: `${w.sessions} مشارك`, data: w }; }
    },
    {
      id: 'export_event', label: 'تصدير نتائج فعالية (JSON)', icon: 'download', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase'],
      description: 'مستند الفعالية وكل جلسات المشاركين', effect: 'قراءة فقط', fields: [EID], target: (p) => p.eventId,
      async execute(p, ctx) { const b = await loadEvent(p, ctx); const e = await ev(ctx, p.eventId).get(); const s = await ev(ctx, p.eventId).collection('sessions').get(); const data = { event: { id: p.eventId, ...JSON.parse(JSON.stringify(e.data(), (k, v) => (v && v._seconds ? v._seconds * 1000 : v))) }, sessions: s.docs.map((d) => ({ id: d.id, ...d.data() })) }; return { message: `${s.size} جلسة`, data, download: { filename: `event-${p.eventId}.json`, mime: 'application/json', text: JSON.stringify(data, null, 2) } }; }
    },
    {
      id: 'event100_status', label: 'تغيير مرحلة فعالية «عدد جديد»', icon: 'flag', group: 'فعالية عدد جديد', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'يحدّث event100/current.status (مع roundStartedAt عند التفعيل كما يفعل الموقع)', effect: 'تتغير مرحلة الفعالية للجميع فوراً',
      fields: [{ name: 'status', label: 'المرحلة', type: 'select', required: true, options: [{ value: 'announcing', label: 'إعلان' }, { value: 'registration', label: 'التسجيل مفتوح' }, { value: 'active', label: 'شغّالة' }, { value: 'finished', label: 'منتهية' }] }], target: (p) => p.status,
      async load(p, ctx) { const s = await ctx.fb.db().collection('event100').doc('current').get(); if (!s.exists) throw E.notFound('لا توجد فعالية event100'); if (s.data().status === p.status) throw E.conflict('المرحلة مطابقة للحالية'); return { status: s.data().status }; },
      async execute(p, ctx, b) { await ctx.fb.db().collection('event100').doc('current').update({ status: p.status, ...(p.status === 'active' ? { roundStartedAt: ctx.fb.FieldValue.serverTimestamp() } : {}) }); return { message: `المرحلة الآن: ${p.status}`, undo: E100.includes(b.status) ? { action: 'events.event100_status', params: { status: b.status } } : undefined }; },
      async verify(p, ctx) { const s = await ctx.fb.db().collection('event100').doc('current').get(); return { ok: s.data().status === p.status, after: { status: s.data().status } }; }
    },
    {
      id: 'event100_messages', label: 'تعديل رسائل فعالية «عدد جديد»', icon: 'edit', group: 'فعالية عدد جديد', danger: 'low', reversible: true, requires: ['firebase'],
      description: 'msg1 (الإعلان) و msg2 (أثناء التشغيل)', effect: 'تتغير النصوص المعروضة فوراً',
      fields: [{ name: 'msg1', label: 'رسالة الإعلان', type: 'textarea', max: 500 }, { name: 'msg2', label: 'رسالة التشغيل', type: 'textarea', max: 500 }], target: () => 'event100',
      async load(p, ctx) { if (p.msg1 === undefined && p.msg2 === undefined) throw E.invalid('اكتب رسالة واحدة على الأقل'); const s = await ctx.fb.db().collection('event100').doc('current').get(); if (!s.exists) throw E.notFound('لا توجد فعالية event100'); return { msg1: s.data().msg1, msg2: s.data().msg2 }; },
      async execute(p, ctx, b) { await ctx.fb.db().collection('event100').doc('current').update({ ...(p.msg1 !== undefined ? { msg1: p.msg1 } : {}), ...(p.msg2 !== undefined ? { msg2: p.msg2 } : {}) }); return { message: 'تم تحديث الرسائل', undo: { action: 'events.event100_messages', params: { msg1: b.msg1 ?? '', msg2: b.msg2 ?? '' } } }; },
      async verify(p, ctx) { const d = (await ctx.fb.db().collection('event100').doc('current').get()).data(); return { ok: (p.msg1 === undefined || d.msg1 === p.msg1) && (p.msg2 === undefined || d.msg2 === p.msg2), after: { msg1: d.msg1, msg2: d.msg2 } }; }
    }
  ]
};
