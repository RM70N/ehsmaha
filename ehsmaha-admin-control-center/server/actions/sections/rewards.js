import { E } from '../../lib/errors.js';
import { now, isDocId } from '../../lib/util.js';
import { findPlayer, tsMs, pageSize } from '../siteHelpers.js';
import { SNAP } from '../../data/siteSnapshot.js';

const BUILTIN = SNAP.frames;
const lv = (ctx, k) => ctx.fb.db().collection('levels').doc(k);
const U = { name: 'username', label: 'يوزرنيم اللاعب', type: 'text', required: true, max: 120 };
const FRAME = { name: 'frameId', label: 'معرّف الإطار', type: 'text', required: true, max: 120, help: 'مثل anime01 — أو معرّف إطار خاص من framesCatalogExtra' };

export async function frameExists(ctx, id) {
  if (BUILTIN.some((f) => f.id === id)) return BUILTIN.find((f) => f.id === id).name;
  if (!isDocId(id)) return null;
  for (const c of ['framesCatalogExtra', 'framesCatalog']) { const s = await ctx.fb.db().collection(c).doc(id).get(); if (s.exists) return s.data().name || id; }
  const r = await ctx.fb.rtdb().ref('framesCatalogExtra/' + id).get().catch(() => null); // الموقع يخزّن الإطار الخاص بـRTDB أحياناً
  return r && r.exists() ? r.val().name || id : null;
}
async function loadFrame(p, ctx) {
  const frameName = await frameExists(ctx, p.frameId); if (!frameName) throw E.notFound('إطار غير موجود في كتالوج الموقع (مدمج/إضافي)');
  const pl = await findPlayer(ctx.fb, p.username); if (!pl.levelKeys.length) throw E.notFound('لا يوجد مفتاح خبرة لهذا اللاعب');
  const owned = {}; for (const k of pl.levelKeys) { const s = await lv(ctx, k).get(); owned[k] = s.exists ? s.data().ownedFrames || [] : []; }
  return { uid: pl.uid, name: pl.username, keys: pl.levelKeys, frameName, owned };
}
const ledger = (ctx) => ctx.store.col('frameGrants');

export default {
  id: 'rewards', workspace: 'website', label: 'الجوائز والمكافآت', icon: 'gift', adminDefault: true, description: 'منح وسحب الإطارات، سجل التسليم، التحقق من التكرار',
  views: [
    {
      id: 'ledger', label: 'سجل منح الإطارات', requires: ['store'], search: true,
      columns: [{ key: 'username', label: 'اللاعب' }, { key: 'frameName', label: 'الإطار' }, { key: 'op', label: 'العملية' }, { key: 'by', label: 'بواسطة' }, { key: 'reason', label: 'السبب' }, { key: 'at', label: 'التاريخ', type: 'date' }],
      async fetch(q, ctx) { return { rows: ledger(ctx).list({ search: q.q, limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q), orderBy: 'at' }), total: ledger(ctx).count(undefined, q.q) }; }
    },
    {
      id: 'xpledger', label: 'سجل تعديلات الخبرة', requires: ['store'], search: true,
      columns: [{ key: 'key', label: 'مفتاح اللاعب' }, { key: 'from', label: 'من' }, { key: 'to', label: 'إلى' }, { key: 'delta', label: 'الفرق' }, { key: 'by', label: 'بواسطة' }, { key: 'reason', label: 'السبب' }, { key: 'at', label: 'التاريخ', type: 'date' }],
      async fetch(q, ctx) { const c = ctx.store.col('xpLedger'); return { rows: c.list({ search: q.q, limit: pageSize(q), orderBy: 'at' }), total: c.count(undefined, q.q) }; }
    },
    {
      id: 'failed', label: 'عمليات منح فاشلة (قابلة لإعادة المحاولة)', requires: ['store'], source: 'سجل التدقيق',
      columns: [{ key: 'id', label: 'معرّف التدقيق', mono: true }, { key: 'label', label: 'العملية' }, { key: 'target', label: 'الهدف' }, { key: 'errorMessage', label: 'سبب الفشل' }, { key: 'ts', label: 'الوقت', type: 'date' }],
      async fetch(q, ctx) { return { rows: ctx.audit.list({ where: { action: 'rewards.grant_frame', status: 'failed' }, limit: 50 }) }; }
    },
    {
      id: 'frames', label: 'كتالوج الإطارات المعروفة', requires: ['firebase'], source: 'FRAMES_CATALOG + framesCatalogExtra',
      columns: [{ key: 'id', label: 'المعرّف', mono: true }, { key: 'name', label: 'الاسم' }, { key: 'kind', label: 'النوع' }, { key: 'visibility', label: 'الظهور' }],
      async fetch(q, ctx) { const ex = await ctx.fb.db().collection('framesCatalogExtra').limit(200).get(); return { rows: [...BUILTIN.map((f) => ({ id: f.id, name: f.name, kind: 'مدمج', visibility: 'عام' })), ...ex.docs.map((d) => ({ id: d.id, name: d.data().name, kind: 'إضافي', visibility: d.data().visibility === 'public' ? 'عام' : 'خاص' }))] }; }
    }
  ],
  actions: [
    {
      id: 'grant_frame', label: 'منح إطار للاعب', icon: 'gift', group: 'الإطارات', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'arrayUnion على ownedFrames بكل مفاتيح اللاعب (نفس آلية ownerGrantFrame) — لا يتكرر الإطار مهما أُعيدت العملية', effect: 'يمتلك اللاعب الإطار فوراً ويستطيع تفعيله',
      fields: [U, FRAME], target: (p) => `${p.username} ← ${p.frameId}`, load: loadFrame,
      async execute(p, ctx, b) {
        if (Object.values(b.owned).some((a) => a.includes(p.frameId))) throw E.conflict('اللاعب يملك هذا الإطار مسبقاً — لا حاجة للمنح');
        for (const k of b.keys) await lv(ctx, k).set({ ownedFrames: ctx.fb.FieldValue.arrayUnion(p.frameId) }, { merge: true });
        ledger(ctx).set(`${b.uid}-${p.frameId}-${now()}`, { uid: b.uid, username: b.name, frameId: p.frameId, frameName: b.frameName, op: 'grant', by: ctx.actor.id, reason: ctx.reason || '', at: now() });
        return { message: `مُنح «${b.frameName}» لـ${b.name}`, undo: { action: 'rewards.revoke_frame', params: { username: b.name, frameId: p.frameId } } };
      },
      async verify(p, ctx, b) { const got = {}; for (const k of b.keys) got[k] = ((await lv(ctx, k).get()).data()?.ownedFrames || []).includes(p.frameId); return { ok: Object.values(got).some(Boolean), after: got, message: 'الإطار غير موجود في ownedFrames بعد الكتابة' }; }
    },
    {
      id: 'revoke_frame', label: 'سحب إطار من لاعب', icon: 'minus', group: 'الإطارات', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'],
      description: 'يزيل الإطار من ownedFrames وlevelFrames ويلغي تفعيله إن كان مفعّلاً — مع تسجيل السبب', effect: 'يفقد اللاعب الإطار فوراً',
      fields: [U, FRAME], target: (p) => `${p.username} ✕ ${p.frameId}`,
      async load(p, ctx) { const b = await loadFrame(p, ctx); if (!Object.values(b.owned).some((a) => a.includes(p.frameId))) throw E.conflict('اللاعب لا يملك هذا الإطار'); return b; },
      async execute(p, ctx, b) {
        for (const k of b.keys) { const s = (await lv(ctx, k).get()).data() || {}; const patch = { ownedFrames: ctx.fb.FieldValue.arrayRemove(p.frameId), levelFrames: ctx.fb.FieldValue.arrayRemove(p.frameId) }; if (s.activeFrame === p.frameId) { patch.activeFrame = ''; patch.activeFrameAt = now(); } await lv(ctx, k).set(patch, { merge: true }); }
        ledger(ctx).set(`${b.uid}-${p.frameId}-${now()}`, { uid: b.uid, username: b.name, frameId: p.frameId, frameName: b.frameName, op: 'revoke', by: ctx.actor.id, reason: ctx.reason, at: now() });
        return { message: `سُحب «${b.frameName}» من ${b.name}`, undo: { action: 'rewards.grant_frame', params: { username: b.name, frameId: p.frameId } } };
      },
      async verify(p, ctx, b) { const got = {}; for (const k of b.keys) { const d = (await lv(ctx, k).get()).data() || {}; got[k] = !(d.ownedFrames || []).includes(p.frameId) && d.activeFrame !== p.frameId; } return { ok: Object.values(got).every(Boolean), after: got }; }
    },
    {
      id: 'grant_frame_bulk', label: 'منح إطار لمجموعة لاعبين', icon: 'users', group: 'الإطارات', danger: 'high', reversible: false, reasonRequired: true, requires: ['firebase'],
      description: 'قائمة يوزرات (واحد لكل سطر، حتى 50). تُنفَّذ كل عملية على حدة ويُعرض نجاح/فشل كل لاعب — لا تكرار لمن يملك الإطار', effect: 'يمنح الإطار لكل اللاعبين المذكورين الصالحين',
      fields: [{ name: 'usernames', label: 'اليوزرات (سطر لكل لاعب)', type: 'textarea', required: true, max: 3000 }, FRAME], target: (p) => `${p.frameId} ← ${p.usernames.split('\n').filter(Boolean).length} لاعب`,
      async load(p, ctx) { const list = [...new Set(p.usernames.split(/\r?\n/).map((x) => x.trim()).filter(Boolean))]; if (!list.length) throw E.invalid('القائمة فارغة'); if (list.length > 50) throw E.invalid('الحد 50 لاعباً في العملية'); const frameName = await frameExists(ctx, p.frameId); if (!frameName) throw E.notFound('إطار غير موجود'); return { list, frameName }; },
      async execute(p, ctx, b) {
        const results = [];
        for (const u of b.list) {
          try { const pl = await findPlayer(ctx.fb, u); const owned = []; for (const k of pl.levelKeys) owned.push(...(((await lv(ctx, k).get()).data()?.ownedFrames) || [])); if (owned.includes(p.frameId)) { results.push({ username: u, result: 'skipped', note: 'يملكه مسبقاً' }); continue; } for (const k of pl.levelKeys) await lv(ctx, k).set({ ownedFrames: ctx.fb.FieldValue.arrayUnion(p.frameId) }, { merge: true }); ledger(ctx).set(`${pl.uid}-${p.frameId}-${now()}`, { uid: pl.uid, username: pl.username, frameId: p.frameId, frameName: b.frameName, op: 'grant', by: ctx.actor.id, reason: ctx.reason, at: now(), bulk: true }); results.push({ username: u, result: 'granted', uid: pl.uid, keys: pl.levelKeys }); }
          catch (e) { results.push({ username: u, result: 'failed', note: e.message }); }
        }
        return { message: `منح ${results.filter((r) => r.result === 'granted').length} · تخطّي ${results.filter((r) => r.result === 'skipped').length} · فشل ${results.filter((r) => r.result === 'failed').length}`, detail: results, _r: results };
      },
      async verify(p, ctx, b, r) { let bad = 0; for (const x of r._r.filter((y) => y.result === 'granted')) { const has = await Promise.all(x.keys.map(async (k) => ((await lv(ctx, k).get()).data()?.ownedFrames || []).includes(p.frameId))); if (!has.some(Boolean)) bad++; } return { ok: bad === 0 && r._r.some((x) => x.result !== 'failed'), detail: r._r, after: { verifiedGranted: r._r.filter((x) => x.result === 'granted').length - bad }, message: bad ? `${bad} لاعب لم يتحقق منح الإطار له` : 'لم ينجح أي منح' }; }
    },
    {
      id: 'retry_failed', label: 'إعادة معالجة منح فاشل', icon: 'retry', group: 'المتابعة', danger: 'medium', requires: ['firebase', 'store'],
      description: 'يعيد تنفيذ عملية منح فاشلة من سجل التدقيق مرة واحدة فقط بمفتاح مشتق (لا يمكن صرف المكافأة مرتين)', effect: 'يُعاد المنح بنفس المدخلات الأصلية',
      fields: [{ name: 'auditId', label: 'معرّف سجل التدقيق', type: 'text', required: true, max: 80 }], target: (p) => p.auditId,
      async load(p, ctx) { const a = ctx.audit.get(p.auditId); if (!a || a.action !== 'rewards.grant_frame' || a.status !== 'failed' || !a.params) throw E.notFound('ليست عملية منح فاشلة قابلة للإعادة'); return { params: a.params }; },
      async execute(p, ctx, b) { const out = await ctx.engine().run({ actionId: 'rewards.grant_frame', params: b.params, auth: { accountId: ctx.actor.id, display: ctx.actor.display, role: ctx.actor.role }, meta: { requestId: ctx.requestId }, idempotencyKey: `retry-${p.auditId}`, confirm: true, reason: `إعادة محاولة ${p.auditId}` }); return { message: out.message, detail: { retriedAuditId: out.auditId } }; }
    },
    {
      id: 'verify_delivery', label: 'التحقق من تسليم الإطارات (مقارنة السجل بالموقع)', icon: 'check', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase', 'store'],
      description: 'يفحص آخر 50 عملية منح في السجل: هل ما زال الإطار موجوداً فعلياً عند اللاعب؟', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) {
        const grants = ledger(ctx).list({ where: { op: 'grant' }, limit: 50, orderBy: 'at' }); const out = [];
        for (const g of grants) { const pl = await findPlayer(ctx.fb, g.username).catch(() => null); let has = false; if (pl) for (const k of pl.levelKeys) if (((await lv(ctx, k).get()).data()?.ownedFrames || []).includes(g.frameId)) has = true; out.push({ username: g.username, frameId: g.frameId, at: g.at, delivered: has }); }
        return { message: `${out.filter((x) => x.delivered).length}/${out.length} مُسلَّمة`, data: out };
      }
    },
    {
      id: 'detect_duplicates', label: 'اكتشاف منح مكررة في السجل', icon: 'copy', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['store'], fields: [], description: 'نفس اللاعب والإطار ممنوحان أكثر من مرة دون سحب بينهما', effect: 'قراءة فقط',
      async execute(p, ctx) { const all = ledger(ctx).list({ limit: 1000, orderBy: 'at', dir: 'asc' }); const st = new Map(); const dup = []; for (const g of all) { const k = `${g.uid}|${g.frameId}`; const cur = st.get(k) || 0; if (g.op === 'grant') { if (cur >= 1) dup.push({ username: g.username, frameId: g.frameId, at: g.at }); st.set(k, cur + 1); } else st.set(k, 0); } return { message: dup.length ? `${dup.length} منحة مكررة` : 'لا توجد منح مكررة', data: dup }; }
    },
    {
      id: 'player_frames', label: 'عرض إطارات لاعب', icon: 'eye', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase'], fields: [U], target: (p) => p.username, description: 'الإطارات المملوكة والمفعّلة بكل مفاتيح اللاعب', effect: 'قراءة فقط',
      async execute(p, ctx) { const pl = await findPlayer(ctx.fb, p.username); const out = {}; for (const k of pl.levelKeys) { const d = (await lv(ctx, k).get()).data() || {}; out[k] = { owned: d.ownedFrames || [], levelFrames: d.levelFrames || [], active: d.activeFrame || '' }; } return { message: pl.username, data: out }; }
    },
    {
      id: 'export_rewards', label: 'تصدير سجل المكافآت (CSV)', icon: 'download', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['store'], fields: [], description: 'منح الإطارات وتعديلات الخبرة', effect: 'قراءة فقط',
      async execute(p, ctx) { const rows = [['type', 'username/key', 'detail', 'by', 'reason', 'at']]; for (const g of ledger(ctx).list({ limit: 1000, orderBy: 'at' })) rows.push(['frame_' + g.op, g.username, g.frameId, g.by, g.reason, new Date(g.at).toISOString()]); for (const x of ctx.store.col('xpLedger').list({ limit: 1000, orderBy: 'at' })) rows.push(['xp', x.key, `${x.from}→${x.to}`, x.by, x.reason, new Date(x.at).toISOString()]); const csv = '﻿' + rows.map((r) => r.map((c) => (/[",\n]/.test(String(c ?? '')) || /^[=+\-@]/.test(String(c ?? '')) ? `"${(/^[=+\-@]/.test(String(c)) ? "'" : '') + String(c ?? '').replace(/"/g, '""')}"` : String(c ?? ''))).join(',')).join('\n'); return { message: `${rows.length - 1} سجل`, download: { filename: 'rewards.csv', mime: 'text/csv', text: csv } }; }
    }
  ]
};
