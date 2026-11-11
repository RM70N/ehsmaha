import { E } from '../../lib/errors.js';
import { now, normUsername } from '../../lib/util.js';
import { tsMs, pageSize } from '../siteHelpers.js';
import { publishSiteBroadcast } from '../../services/scheduledPosts.js';

const bc = (ctx) => ctx.fb.db().collection('broadcastMessages').doc('current');
const POS = { name: 'position', label: 'موضع الظهور', type: 'select', options: [{ value: 'center', label: 'وسط الشاشة' }, { value: 'top', label: 'أعلى الشاشة' }], default: 'center', required: true };
const SEC = { name: 'durationSec', label: 'مدة الظهور (ثوانٍ)', type: 'integer', min: 3, max: 120, default: 10, required: true };
const TXT = { name: 'text', label: 'نص الإعلان', type: 'textarea', required: true, max: 500 };
const saved = (ctx) => ctx.store.col('savedAnnouncements');
const sched = (ctx) => ctx.store.col('scheduledPosts');

async function verifyBroadcast(p, ctx) { const d = (await bc(ctx).get()).data(); return { ok: !!d && d.text === p.text, after: { text: d?.text, position: d?.position } }; }

export default {
  id: 'messages', workspace: 'website', label: 'الرسائل والإعلانات', icon: 'megaphone', adminDefault: true, description: 'إعلان للجميع داخل الموقع، الجدولة، ومكتبة الإعلانات المحفوظة',
  views: [
    {
      id: 'current', label: 'الإعلان الحالي', requires: ['firebase'], source: 'Firestore broadcastMessages/current',
      columns: [{ key: 'field', label: 'الحقل' }, { key: 'value', label: 'القيمة' }],
      async fetch(q, ctx) { const s = await bc(ctx).get(); return { rows: s.exists ? Object.entries(s.data()).map(([k, v]) => ({ id: k, field: k, value: v && v.toMillis ? new Date(v.toMillis()).toLocaleString('ar-SA') : String(v) })) : [], meta: { note: s.exists ? null : 'لا يوجد إعلان منشور الآن' } }; }
    },
    {
      id: 'scheduled', label: 'المجدولة', requires: ['store'],
      columns: [{ key: 'kind', label: 'النوع' }, { key: 'text', label: 'النص' }, { key: 'at', label: 'موعد النشر', type: 'date' }, { key: 'status', label: 'الحالة' }, { key: 'error', label: 'الخطأ' }],
      async fetch(q, ctx) { return { rows: sched(ctx).list({ limit: pageSize(q), orderBy: 'at' }).map((x) => ({ ...x, kind: x.kind === 'site_broadcast' ? 'موقع' : 'ديسكورد' })) }; }
    },
    {
      id: 'library', label: 'مكتبة الإعلانات المحفوظة', requires: ['store'], search: true,
      columns: [{ key: 'title', label: 'العنوان' }, { key: 'text', label: 'النص' }, { key: 'by', label: 'بواسطة' }, { key: 'at', label: 'التاريخ', type: 'date' }],
      async fetch(q, ctx) { return { rows: saved(ctx).list({ search: q.q, limit: pageSize(q), orderBy: 'at' }) }; }
    },
    {
      id: 'log', label: 'سجل النشر', requires: ['store'], source: 'سجل التدقيق',
      columns: [{ key: 'ts', label: 'الوقت', type: 'date' }, { key: 'label', label: 'العملية' }, { key: 'status', label: 'الحالة' }, { key: 'actorName', label: 'بواسطة' }, { key: 'target', label: 'الهدف' }],
      async fetch(q, ctx) { return { rows: ctx.audit.list({ where: { section: 'messages' }, limit: pageSize(q, 50), offset: (Number(q.page) || 0) * pageSize(q, 50) }), total: ctx.audit.count({ section: 'messages' }) }; }
    }
  ],
  actions: [
    {
      id: 'publish', label: 'نشر إعلان للجميع داخل الموقع', icon: 'send', group: 'النشر', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'يكتب في broadcastMessages/current + ownerMessages/broadcast (نفس مسار رسالة المالك) فيراه كل من هو داخل الموقع لحظياً', effect: 'يظهر الإعلان فوراً لكل الزوار الحاليين',
      fields: [TXT, POS, SEC], target: (p) => p.text.slice(0, 40),
      async load(p, ctx) { const s = await bc(ctx).get(); return s.exists ? { text: s.data().text, position: s.data().position } : null; },
      async execute(p, ctx) { await publishSiteBroadcast(ctx.fb, { ...p, sentBy: ctx.actor.display + ' (لوحة الإدارة)' }); return { message: 'نُشر الإعلان', undo: { action: 'messages.clear', params: {} } }; },
      verify: verifyBroadcast
    },
    {
      id: 'clear', label: 'إيقاف الإعلان المنشور', icon: 'stop', group: 'النشر', danger: 'medium', reversible: false, requires: ['firebase'], description: 'حذف broadcastMessages/current وموازيه في RTDB', effect: 'يختفي الإعلان لمن لم يره بعد',
      fields: [], load: async (p, ctx) => { const s = await bc(ctx).get(); if (!s.exists) throw E.conflict('لا يوجد إعلان منشور'); return { text: s.data().text }; },
      async execute(p, ctx) { await bc(ctx).delete(); try { await ctx.fb.rtdb().ref('ownerMessages/broadcast').remove(); } catch { /* */ } return { message: 'أُزيل الإعلان' }; },
      verify: async (p, ctx) => ({ ok: !(await bc(ctx).get()).exists, after: { exists: false } })
    },
    {
      id: 'save', label: 'حفظ إعلان في المكتبة', icon: 'save', group: 'المكتبة', danger: 'low', reversible: true, requires: ['store'], description: 'يحفظ نصاً قابلاً لإعادة النشر لاحقاً', effect: 'يُضاف لمكتبة الإعلانات',
      fields: [{ name: 'title', label: 'عنوان داخلي', type: 'text', required: true, max: 80 }, TXT], target: (p) => p.title,
      async execute(p, ctx) { const id = `a-${now()}`; saved(ctx).set(id, { title: p.title, text: p.text, by: ctx.actor.id, at: now() }); return { message: 'حُفظ', _id: id, undo: { action: 'messages.delete_saved', params: { id } } }; },
      verify: async (p, ctx, b, r) => ({ ok: saved(ctx).get(r._id)?.text === p.text, after: { id: r._id } })
    },
    {
      id: 'edit_saved', label: 'تعديل إعلان محفوظ', icon: 'edit', group: 'المكتبة', danger: 'low', reversible: true, requires: ['store'], fields: [{ name: 'id', label: 'معرّف المحفوظ', type: 'text', required: true, max: 60 }, TXT], target: (p) => p.id, description: 'تعديل نص إعلان في المكتبة', effect: 'يتغير النص المحفوظ فقط (لا ينشر)',
      load: async (p, ctx) => { const s = saved(ctx).get(p.id); if (!s) throw E.notFound('غير موجود'); return s; },
      async execute(p, ctx, b) { saved(ctx).merge(p.id, { text: p.text, editedBy: ctx.actor.id, editedAt: now() }); return { message: 'عُدّل', undo: { action: 'messages.edit_saved', params: { id: p.id, text: b.text } } }; },
      verify: async (p, ctx) => ({ ok: saved(ctx).get(p.id)?.text === p.text })
    },
    {
      id: 'delete_saved', label: 'حذف إعلان محفوظ', icon: 'trash', group: 'المكتبة', danger: 'medium', reversible: false, requires: ['store'], fields: [{ name: 'id', label: 'معرّف المحفوظ', type: 'text', required: true, max: 60 }], target: (p) => p.id, description: 'حذف من المكتبة فقط', effect: 'لا يؤثر على ما نُشر',
      load: async (p, ctx) => { const s = saved(ctx).get(p.id); if (!s) throw E.notFound('غير موجود'); return s; },
      async execute(p, ctx) { saved(ctx).del(p.id); return { message: 'حُذف' }; }, verify: async (p, ctx) => ({ ok: !saved(ctx).get(p.id) })
    },
    {
      id: 'repost_saved', label: 'إعادة نشر إعلان محفوظ', icon: 'retry', group: 'النشر', danger: 'medium', reversible: true, requires: ['firebase', 'store'], description: 'ينشر نص إعلان من المكتبة للجميع', effect: 'يظهر الإعلان فوراً للزوار',
      fields: [{ name: 'id', label: 'معرّف المحفوظ', type: 'text', required: true, max: 60 }, POS, SEC], target: (p) => p.id,
      load: async (p, ctx) => { const s = saved(ctx).get(p.id); if (!s) throw E.notFound('الإعلان غير موجود في المكتبة'); return s; },
      async execute(p, ctx, b) { await publishSiteBroadcast(ctx.fb, { text: b.text, position: p.position, durationSec: p.durationSec, sentBy: ctx.actor.display + ' (لوحة الإدارة)' }); return { message: `أُعيد نشر «${b.title}»`, undo: { action: 'messages.clear', params: {} } }; },
      verify: async (p, ctx, b) => verifyBroadcast({ text: b.text }, ctx)
    },
    {
      id: 'schedule', label: 'جدولة إعلان لوقت محدد', icon: 'calendar', group: 'الجدولة', danger: 'low', reversible: true, requires: ['firebase', 'store'], description: 'يُنشر تلقائياً في الموعد (مهمة خلفية بحجز ذرّي تمنع النشر المزدوج)', effect: 'يُخزَّن الإعلان ويُنشر عند الموعد',
      fields: [TXT, POS, SEC, { name: 'at', label: 'موعد النشر', type: 'datetime', required: true }], target: (p) => new Date(p.at).toISOString(),
      async load(p) { if (p.at < now() + 30_000) throw E.invalid('الموعد يجب أن يكون بعد 30 ثانية على الأقل'); return null; },
      async execute(p, ctx) { const id = `s-${now()}`; sched(ctx).set(id, { kind: 'site_broadcast', text: p.text, position: p.position, durationSec: p.durationSec, sentBy: ctx.actor.display + ' (لوحة الإدارة)', at: p.at, status: 'scheduled', by: ctx.actor.id }); return { message: `جُدول للنشر ${new Date(p.at).toLocaleString('ar-SA')}`, _id: id, undo: { action: 'messages.cancel_scheduled', params: { id } } }; },
      verify: async (p, ctx, b, r) => ({ ok: sched(ctx).get(r._id)?.status === 'scheduled', after: sched(ctx).get(r._id) })
    },
    {
      id: 'cancel_scheduled', label: 'إلغاء إعلان مجدول', icon: 'x', group: 'الجدولة', danger: 'medium', reversible: false, requires: ['store'], fields: [{ name: 'id', label: 'معرّف المجدول', type: 'text', required: true, max: 60 }], target: (p) => p.id, description: 'يلغي نشراً لم يحن بعد', effect: 'لن يُنشر الإعلان',
      load: async (p, ctx) => { const s = sched(ctx).get(p.id); if (!s || s.status !== 'scheduled') throw E.conflict('ليس مجدولاً (ربما نُشر أو أُلغي)'); return s; },
      async execute(p, ctx) { const ok = ctx.store.tx(() => { const s = sched(ctx).get(p.id); if (!s || s.status !== 'scheduled') return false; sched(ctx).merge(p.id, { status: 'cancelled', cancelledBy: ctx.actor.id, cancelledAt: now() }); return true; }); if (!ok) throw E.conflict('بدأ نشره للتو — لا يمكن إلغاؤه'); return { message: 'أُلغي الإعلان المجدول' }; },
      verify: async (p, ctx) => ({ ok: sched(ctx).get(p.id)?.status === 'cancelled' })
    },
    {
      id: 'delete_personal', label: 'سحب رسالة شخصية موجهة للاعب', icon: 'mailx', group: 'النشر', danger: 'medium', reversible: false, requires: ['firebase'], description: 'يحذف personalMessages/{username} (الرسالة المعلّقة غير المقروءة)', effect: 'لا يراها اللاعب لو لم يفتحها بعد',
      fields: [{ name: 'username', label: 'يوزرنيم اللاعب', type: 'text', required: true, max: 120 }], target: (p) => p.username,
      async load(p, ctx) { const k = normUsername(p.username); const s = await ctx.fb.db().collection('personalMessages').doc(k).get(); if (!s.exists) throw E.notFound('لا توجد رسالة شخصية معلّقة لهذا اللاعب'); return { k, text: s.data().text }; },
      async execute(p, ctx, b) { await ctx.fb.db().collection('personalMessages').doc(b.k).delete(); try { await ctx.fb.rtdb().ref('ownerMessages/personal/' + b.k.replace(/[.#$[\]/%]/g, (c) => '%' + c.charCodeAt(0).toString(16))).remove(); } catch { /* */ } return { message: 'سُحبت الرسالة' }; },
      verify: async (p, ctx, b) => ({ ok: !(await ctx.fb.db().collection('personalMessages').doc(b.k).get()).exists })
    },
    {
      id: 'export_log', label: 'تصدير سجل الرسائل (CSV)', icon: 'download', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['store'], fields: [], description: 'عمليات قسم الرسائل من سجل التدقيق', effect: 'قراءة فقط',
      async execute(p, ctx) { const rows = [['time', 'op', 'status', 'by', 'target'], ...ctx.audit.list({ where: { section: 'messages' }, limit: 1000 }).map((a) => [new Date(a.ts).toISOString(), a.label, a.status, a.actorName, a.target])]; return { message: `${rows.length - 1} سجل`, download: { filename: 'messages-log.csv', mime: 'text/csv', text: '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n') } }; }
    }
  ]
};
