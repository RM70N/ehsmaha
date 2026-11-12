import { E } from '../../lib/errors.js';
import { now, normUsername, isDocId } from '../../lib/util.js';
import { tsMs, pageSize, isQuota } from '../siteHelpers.js';

// الموقع يدمج مصدرين للنشطين: Firestore activeStreamers + RTDB fsMirror/activeStreamers (بث مربوط). اللوحة تقرأ/تنهي الاثنين.
async function rtActive(ctx) { try { const r = await ctx.fb.rtdb().ref('fsMirror/activeStreamers').get(); const v = r.exists() ? r.val() || {} : {}; return Object.entries(v).map(([k, x]) => ({ k, ...(x || {}) })); } catch { return []; } }
async function fsActive(ctx) { try { const snap = await ctx.fb.db().collection('activeStreamers').limit(200).get(); return { docs: snap.docs, quota: false }; } catch (e) { if (!isQuota(e)) throw e; return { docs: [], quota: true }; } }

// بوابة الربط الفعلية: tiktok-server يقرأ bridgeStreamers/{معرّف}.enabled ويرفض الاتصال لو === false
const bridge = (ctx, id) => ctx.fb.db().collection('bridgeStreamers').doc(id);
const ID = { name: 'streamer', label: 'معرّف الستريمر (uniqueId)', type: 'text', required: true, max: 120, placeholder: 'مثال: ahmed أو kick.com/ahmed' };
const idOf = (raw) => { const id = normUsername(raw).replace(/^(tiktok|twitch|kick|youtube):/, '').replace(/^@/, ''); if (!isDocId(id)) throw E.invalid('معرّف ستريمر غير صالح'); return id; };
async function loadBridge(p, ctx) { const id = idOf(p.streamer); const s = await bridge(ctx, id).get(); return { id, exists: s.exists, enabled: s.exists ? s.data().enabled !== false : true, data: s.exists ? s.data() : null }; }
const stamp = (ctx) => ({ updatedAt: ctx.fb.FieldValue.serverTimestamp(), updatedBy: 'admin-center:' + ctx.actor.id });
const verifyEnabled = (want) => async (p, ctx, b) => { const s = await bridge(ctx, b.id).get(); const en = s.exists ? s.data().enabled !== false : true; return { ok: en === want, after: { enabled: en }, message: 'حالة بوابة الربط في Firestore لم تتغير' }; };

export default {
  id: 'streamers', workspace: 'website', label: 'إدارة الستريمرز', icon: 'broadcast', adminDefault: true, description: 'بوابة ربط البث، الجلسات النشطة، والملاحظات',
  views: [
    {
      id: 'bridge', label: 'بوابة الربط (bridgeStreamers)', requires: ['firebase'], search: true, source: 'Firestore bridgeStreamers',
      columns: [{ key: 'id', label: 'الستريمر', mono: true }, { key: 'enabled', label: 'الربط' }, { key: 'updatedBy', label: 'آخر تعديل بواسطة' }, { key: 'updatedAt', label: 'وقت التعديل', type: 'date' }],
      async fetch(q, ctx) {
        let qq = ctx.fb.db().collection('bridgeStreamers').orderBy(ctx.fb.db().constructor && '__name__').limit(pageSize(q, 50));
        if (q.cursor) qq = qq.startAfter(String(q.cursor));
        const snap = await qq.get(); const t = normUsername(q.q);
        const rows = snap.docs.filter((d) => !t || d.id.includes(t)).map((d) => ({ id: d.id, enabled: d.data().enabled === false ? '⛔ معطّل' : '✅ مفعّل', updatedBy: d.data().updatedBy || d.data().uid || '—', updatedAt: tsMs(d.data().updatedAt) }));
        return { rows, nextCursor: snap.size >= pageSize(q, 50) ? snap.docs[snap.size - 1].id : null };
      }
    },
    {
      id: 'active', label: 'الستريمرز النشطون الآن (activeStreamers)', requires: ['firebase'], source: 'Firestore activeStreamers',
      columns: [{ key: 'id', label: 'الوسم (gameTag)', mono: true }, { key: 'name', label: 'الستريمر' }, { key: 'platform', label: 'المنصة' }, { key: 'uid', label: 'UID', mono: true }, { key: 'since', label: 'منذ', type: 'date' }],
      async fetch(q, ctx) {
        const [fs, rt] = await Promise.all([fsActive(ctx), rtActive(ctx)]);
        const rows = fs.docs.map((d) => { const v = d.data(); return { id: d.id, name: v.username || v.name || v.streamer || '—', platform: v.platform || '—', uid: v.uid || '—', since: tsMs(v.startedAt || v.updatedAt || v.createdAt) }; });
        for (const x of rt) if (x.username) rows.push({ id: x.k, name: x.username, platform: x.platform || 'RTDB (بث مربوط)', uid: x.uid || '—', since: tsMs(x.startedAt || x.updatedAt || x.t) });
        return { rows, total: rows.length, meta: fs.quota ? { note: 'Firestore غير متاح (حصة مستنفدة) — المعروض من RTDB فقط (البث المربوط).' } : null };
      }
    },
    {
      id: 'applications', label: 'طلبات الانضمام (قراءة)', requires: ['firebase'], source: 'Firestore streamerApplications',
      columns: [{ key: 'id', label: 'الطلب', mono: true }, { key: 'summary', label: 'المحتوى' }],
      async fetch(q, ctx) { const snap = await ctx.fb.db().collection('streamerApplications').limit(pageSize(q, 50)).get(); return { rows: snap.docs.map((d) => ({ id: d.id, summary: Object.entries(d.data()).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 6).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join(' · ') })) }; }
    },
    {
      id: 'notes', label: 'ملاحظات الستريمرز', requires: ['store'], search: true,
      columns: [{ key: 'streamer', label: 'الستريمر' }, { key: 'note', label: 'الملاحظة' }, { key: 'by', label: 'بواسطة' }, { key: 'at', label: 'التاريخ', type: 'date' }],
      async fetch(q, ctx) { const n = ctx.store.col('streamerNotes'); return { rows: n.list({ search: q.q, limit: pageSize(q), orderBy: 'at' }), total: n.count(undefined, q.q) }; }
    }
  ],
  actions: [
    {
      id: 'bridge_disable', label: 'حظر/إيقاف ربط ستريمر', icon: 'ban', group: 'الربط والحظر', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'يكتب enabled=false في bridgeStreamers — خادم الربط يرفض أي اتصال لهذا المعرّف فوراً (نفس بوابة الموقع)', effect: 'لا يستطيع الستريمر ربط بثه حتى إعادة التفعيل',
      fields: [ID], target: (p) => p.streamer, load: loadBridge,
      async execute(p, ctx, b) { if (!b.enabled) throw E.conflict('الربط معطّل أصلاً'); await bridge(ctx, b.id).set({ enabled: false, ...stamp(ctx) }, { merge: true }); ctx.store.col('punishments').set(`bridge-${b.id}-${now()}`, { uid: b.id, username: b.id, type: 'bridge_disable', reason: ctx.reason, by: ctx.actor.id, at: now(), status: 'active' }); return { message: `عُطّل ربط ${b.id}`, undo: { action: 'streamers.bridge_enable', params: { streamer: b.id } } }; },
      verify: verifyEnabled(false)
    },
    {
      id: 'bridge_disable_temp', label: 'إيقاف الربط مؤقتاً (بمدة)', icon: 'clock', group: 'الربط والحظر', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'يعطّل الربط ثم تعيده مهمة خلفية تلقائياً عند انتهاء المدة', effect: 'يُمنع الربط طوال المدة ثم يُفعَّل تلقائياً',
      fields: [ID, { name: 'hours', label: 'المدة بالساعات', type: 'integer', required: true, min: 1, max: 720, default: 6 }], target: (p) => `${p.streamer} (${p.hours}س)`, load: loadBridge,
      async execute(p, ctx, b) { if (!b.enabled) throw E.conflict('الربط معطّل أصلاً'); await bridge(ctx, b.id).set({ enabled: false, ...stamp(ctx) }, { merge: true }); const until = now() + p.hours * 3600_000; ctx.store.col('tempActions').set(`bridge-${b.id}-${now()}`, { type: 'bridge', uid: b.id, username: b.id, expiresAt: until, status: 'active' }); return { message: `أُوقف ربط ${b.id} حتى ${new Date(until).toLocaleString('ar-SA')}`, undo: { action: 'streamers.bridge_enable', params: { streamer: b.id } } }; },
      verify: verifyEnabled(false)
    },
    {
      id: 'bridge_enable', label: 'رفع الحظر / إعادة تفعيل الربط', icon: 'unlock', group: 'الربط والحظر', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'enabled=true في bridgeStreamers وإلغاء أي إيقاف مؤقت معلّق', effect: 'يستعيد الستريمر قدرة الربط',
      fields: [ID], target: (p) => p.streamer, load: loadBridge,
      async execute(p, ctx, b) { await bridge(ctx, b.id).set({ enabled: true, ...stamp(ctx) }, { merge: true }); for (const j of ctx.store.col('tempActions').list({ where: { uid: b.id, status: 'active', type: 'bridge' } })) ctx.store.col('tempActions').merge(j.id, { status: 'cancelled', endedAt: now() }); for (const j of ctx.store.col('punishments').list({ where: { uid: b.id, status: 'active', type: 'bridge_disable' } })) ctx.store.col('punishments').merge(j.id, { status: 'lifted', liftedAt: now(), liftedBy: ctx.actor.id }); return { message: `فُعّل ربط ${b.id}`, undo: !b.enabled ? { action: 'streamers.bridge_disable', params: { streamer: b.id } } : undefined }; },
      verify: verifyEnabled(true)
    },
    {
      id: 'bridge_register', label: 'تسجيل ستريمر في بوابة الربط', icon: 'plus', group: 'إدارة السجل', danger: 'low', reversible: true, requires: ['firebase'],
      description: 'ينشئ مستند bridgeStreamers مفعّلاً صراحةً لمعرّف جديد', effect: 'يصبح المعرّف مسجّلاً ومفعّلاً في بوابة الربط',
      fields: [ID], target: (p) => p.streamer, load: loadBridge,
      async execute(p, ctx, b) { if (b.exists) throw E.conflict('الستريمر مسجّل مسبقاً'); await bridge(ctx, b.id).set({ enabled: true, ...stamp(ctx) }); return { message: `سُجّل ${b.id}`, undo: { action: 'streamers.bridge_reset', params: { streamer: b.id } } }; },
      verify: async (p, ctx, b) => { const s = await bridge(ctx, b.id).get(); return { ok: s.exists && s.data().enabled === true, after: s.data() }; }
    },
    {
      id: 'bridge_reset', label: 'إزالة سجل الستريمر من بوابة الربط', icon: 'trash', group: 'إدارة السجل', danger: 'high', reversible: false, reasonRequired: true, requires: ['firebase'],
      description: 'يحذف مستند bridgeStreamers (يعود المعرّف للسلوك الافتراضي: مسموح) — لا يحذف أي بيانات لعب أو خبرة', effect: 'يُزال التقييد/التسجيل الخاص بالمعرّف في البوابة',
      fields: [ID], target: (p) => p.streamer, load: async (p, ctx) => { const b = await loadBridge(p, ctx); if (!b.exists) throw E.notFound('لا يوجد سجل لهذا المعرّف في البوابة'); return b; },
      async execute(p, ctx, b) { await bridge(ctx, b.id).delete(); return { message: `أُزيل سجل ${b.id}` }; },
      verify: async (p, ctx, b) => ({ ok: !(await bridge(ctx, b.id).get()).exists, after: { exists: false } })
    },
    {
      id: 'clear_active', label: 'إنهاء جلسة ستريمر نشطة عالقة', icon: 'stop', group: 'الجلسات', danger: 'medium', reversible: false, reasonRequired: true, requires: ['firebase'],
      description: 'يحذف مستند activeStreamers/{gameTag} (يختفي من قائمة الستريمرز النشطين — كما يفعل الموقع عند إغلاق الصفحة)', effect: 'يُزال الستريمر من قائمة النشطين الآن؛ إن كان بثه فعلياً شغّالاً سيعود بتحديثه التالي',
      fields: [{ name: 'gameTag', label: 'الوسم (gameTag) من جدول النشطين', type: 'text', required: true, max: 200 }], target: (p) => p.gameTag,
      async load(p, ctx) {
        if (!/^[A-Za-z0-9_\-.]{1,200}$/.test(p.gameTag)) throw E.invalid('وسم غير صالح');
        let fsData = null; try { const s = await ctx.fb.db().collection('activeStreamers').doc(p.gameTag).get(); if (s.exists) fsData = s.data(); } catch (e) { if (!isQuota(e)) throw e; }
        const rt = (await rtActive(ctx)).filter((x) => x.k === p.gameTag || x.username === p.gameTag);
        if (!fsData && !rt.length) throw E.notFound('لا توجد جلسة نشطة بهذا الوسم (Firestore/RTDB)');
        return { ...(fsData || {}), _rtKeys: rt.map((x) => x.k) };
      },
      async execute(p, ctx, b) {
        const jobs = [(async () => ctx.fb.db().collection('activeStreamers').doc(p.gameTag).delete())(), ...(b._rtKeys || []).map((k) => ctx.fb.rtdb().ref('fsMirror/activeStreamers/' + k).remove())];
        const res = await Promise.allSettled(jobs);
        const bad = res.filter((r) => r.status === 'rejected');
        const fsFailed = res[0].status === 'rejected';
        if (bad.length && !(fsFailed && isQuota(res[0].reason) && (b._rtKeys || []).length && bad.length === 1)) throw bad[0].reason;
        return { message: 'أُنهيت الجلسة العالقة' + (fsFailed ? ' (RTDB فقط — حصة Firestore مستنفدة)' : '') };
      },
      verify: async (p, ctx, b) => {
        let gone = true; try { gone = !(await ctx.fb.db().collection('activeStreamers').doc(p.gameTag).get()).exists; } catch (e) { if (!isQuota(e)) throw e; }
        for (const k of b._rtKeys || []) if ((await ctx.fb.rtdb().ref('fsMirror/activeStreamers/' + k).get()).exists()) gone = false;
        return { ok: gone, after: { exists: !gone } };
      }
    },
    {
      id: 'add_note', label: 'إضافة ملاحظة على ستريمر', icon: 'note', group: 'السجلات', danger: 'low', requires: ['store'],
      description: 'ملاحظة داخلية في قاعدة اللوحة', effect: 'تُحفظ في سجل المسؤولين',
      fields: [ID, { name: 'note', label: 'الملاحظة', type: 'textarea', required: true, max: 1000 }], target: (p) => p.streamer,
      async execute(p, ctx) { const id = `${normUsername(p.streamer)}-${now()}`; ctx.store.col('streamerNotes').set(id, { streamer: normUsername(p.streamer), note: p.note, by: ctx.actor.id, at: now() }); return { message: 'تمت إضافة الملاحظة', _id: id }; },
      verify: async (p, ctx, b, r) => ({ ok: ctx.store.col('streamerNotes').get(r._id)?.note === p.note })
    },
    {
      id: 'streamer_log', label: 'سجل عمليات الستريمر', icon: 'history', group: 'السجلات', kind: 'read', danger: 'low', requires: ['store'],
      description: 'كل العمليات الإدارية والعقوبات والملاحظات المرتبطة بمعرّف الستريمر', effect: 'قراءة فقط', fields: [ID], target: (p) => p.streamer,
      async execute(p, ctx) { const id = idOf(p.streamer); const data = { operations: ctx.audit.list({ search: id, limit: 50 }).map((a) => ({ ts: a.ts, action: a.label, status: a.status, by: a.actorName })), punishments: ctx.store.col('punishments').list({ where: { uid: id }, limit: 50 }), notes: ctx.store.col('streamerNotes').list({ where: { streamer: id }, limit: 50 }) }; return { message: `${data.operations.length} عملية`, data }; }
    },
    {
      id: 'export_streamers', label: 'تصدير حالة الستريمرز (JSON)', icon: 'download', group: 'السجلات', kind: 'read', danger: 'low', requires: ['firebase'], fields: [], description: 'بوابة الربط + الجلسات النشطة', effect: 'قراءة فقط',
      async execute(p, ctx) { const [b, a] = await Promise.all([ctx.fb.db().collection('bridgeStreamers').get(), ctx.fb.db().collection('activeStreamers').get()]); const data = { bridge: b.docs.map((d) => ({ id: d.id, enabled: d.data().enabled !== false })), active: a.docs.map((d) => ({ id: d.id, ...d.data() })) }; return { message: `${b.size} مسجّل · ${a.size} نشط`, data, download: { filename: 'streamers.json', mime: 'application/json', text: JSON.stringify(data, null, 2) } }; }
    }
  ]
};
