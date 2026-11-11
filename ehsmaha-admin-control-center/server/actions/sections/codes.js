import { E } from '../../lib/errors.js';
import { now } from '../../lib/util.js';
import { tsMs } from '../siteHelpers.js';
import { frameExists } from './rewards.js';

// نفس تطبيع الموقع (scodeCodeKey): يجب أن يطابق مفتاح RTDB الذي يبحث به اللاعب
const CHAR_MAP = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه' };
export function codeKey(raw) {
  const n = String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase(); let out = '';
  for (const ch of n) { const c = ch.codePointAt(0); if (c <= 31 || c === 127 || (c >= 8203 && c <= 8207) || (c >= 8234 && c <= 8238) || (c >= 8294 && c <= 8297) || c === 65279 || c === 1600 || (c >= 1611 && c <= 1621) || c === 1648 || '.#$[]/'.includes(ch)) continue; out += CHAR_MAP[ch] || ch; }
  return out.slice(0, 60);
}
const ref = (ctx, k) => ctx.fb.rtdb().ref('secretCodes/' + k);
const CODE = { name: 'code', label: 'الكود', type: 'text', required: true, max: 60 };
async function loadCode(p, ctx) { const k = codeKey(p.code); if (!k) throw E.invalid('كود غير صالح'); const s = await ref(ctx, k).get(); if (!s.exists()) throw E.notFound('الكود غير موجود'); const v = s.val(); return { key: k, ...v, usedBy: undefined, usedCount: v.usedCount || 0, usedUsers: Object.keys(v.usedBy || {}).length }; }
const status = (v) => (v.active === false ? 'متوقف' : v.expiresAt && v.expiresAt <= now() ? 'منتهي' : (v.usedCount || 0) >= (v.maxUses || 0) ? 'مستنفد' : 'فعّال');
const verifyField = (f) => async (p, ctx, b, r) => { const v = (await ref(ctx, b.key).get()).val(); return { ok: v && JSON.stringify(v[f]) === JSON.stringify(r._want), after: { [f]: v?.[f] }, message: `الحقل ${f} في RTDB لم يتغير فعلياً` }; };

export default {
  id: 'codes', workspace: 'website', label: 'الأكواد السرية', icon: 'key', adminDefault: false, description: 'أكواد الإطارات (Realtime Database: secretCodes)',
  views: [
    {
      id: 'all', label: 'كل الأكواد', requires: ['firebase'], search: true, source: 'RTDB secretCodes',
      columns: [{ key: 'name', label: 'الكود' }, { key: 'frameName', label: 'الإطار' }, { key: 'usage', label: 'الاستخدام' }, { key: 'state', label: 'الحالة' }, { key: 'expiresAt', label: 'ينتهي', type: 'date' }, { key: 'createdByUsername', label: 'أنشأه' }],
      async fetch(q, ctx) { const all = (await ctx.fb.rtdb().ref('secretCodes').get()).val() || {}; const t = (q.q || '').toLowerCase(); return { rows: Object.entries(all).map(([k, v]) => ({ id: k, name: v.name || k, frameName: v.frameName, usage: `${v.usedCount || 0}/${v.maxUses}`, state: status(v), expiresAt: v.expiresAt, createdByUsername: v.createdByUsername || '—' })).filter((r) => !t || `${r.name}${r.frameName}`.toLowerCase().includes(t)) }; }
    },
    {
      id: 'attention', label: 'أكواد منتهية أو مستنفدة', requires: ['firebase'], source: 'RTDB secretCodes',
      columns: [{ key: 'name', label: 'الكود' }, { key: 'state', label: 'السبب' }, { key: 'usage', label: 'الاستخدام' }, { key: 'expiresAt', label: 'انتهى', type: 'date' }],
      async fetch(q, ctx) { const all = (await ctx.fb.rtdb().ref('secretCodes').get()).val() || {}; return { rows: Object.entries(all).filter(([, v]) => ['منتهي', 'مستنفد'].includes(status(v))).map(([k, v]) => ({ id: k, name: v.name || k, state: status(v), usage: `${v.usedCount || 0}/${v.maxUses}`, expiresAt: v.expiresAt })) }; }
    }
  ],
  actions: [
    {
      id: 'create', label: 'إنشاء كود جديد', icon: 'plus', group: 'الإنشاء', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'يكتب secretCodes/{key} بنفس بنية الموقع ويتحقق بقراءة فعلية (مفتاح واحد = مصدر حقيقة واحد)', effect: 'يصبح الكود صالحاً للاستخدام من اللاعبين فوراً',
      fields: [{ name: 'name', label: 'نص الكود', type: 'text', required: true, max: 60 }, { name: 'frameId', label: 'معرّف الإطار الجائزة', type: 'text', required: true, max: 120 }, { name: 'durationDays', label: 'صلاحية الكود (أيام)', type: 'number', required: true, min: 0.01, max: 3650, default: 7 }, { name: 'maxUses', label: 'أقصى عدد استخدامات', type: 'integer', required: true, min: 1, max: 1_000_000, default: 10 }], target: (p) => p.name,
      async load(p, ctx) { const k = codeKey(p.name); if (!k) throw E.invalid('اسم الكود غير صالح بعد التطبيع'); if ((await ref(ctx, k).get()).exists()) throw E.conflict('هذا الاسم مستخدم لكود آخر بالفعل'); const frameName = await frameExists(ctx, p.frameId); if (!frameName) throw E.notFound('الإطار غير موجود في كتالوج الموقع'); return { key: k, frameName }; },
      async execute(p, ctx, b) { await ref(ctx, b.key).set({ name: p.name.trim(), frameId: p.frameId, frameName: b.frameName, durationDays: p.durationDays, maxUses: p.maxUses, usedCount: 0, active: true, createdAt: ctx.fb.ServerValue.TIMESTAMP, createdBy: 'admin-center', createdByUsername: ctx.actor.display + ' (لوحة الإدارة)', expiresAt: now() + Math.round(p.durationDays * 86400_000) }); return { message: `نُشر الكود «${p.name}»`, undo: { action: 'codes.delete', params: { code: p.name } } }; },
      async verify(p, ctx, b) { const v = (await ref(ctx, b.key).get()).val(); return { ok: !!v && v.active === true && v.frameId === p.frameId && v.maxUses === p.maxUses, after: v && { active: v.active, maxUses: v.maxUses, expiresAt: v.expiresAt }, message: 'الكود غير موجود/مختلف عند القراءة بعد النشر' }; }
    },
    {
      id: 'stop', label: 'تعطيل كود', icon: 'pause', group: 'التفعيل', danger: 'medium', reversible: true, requires: ['firebase'], description: 'active=false — لا يستطيع أحد استخدامه (ويُلغي مكافأته لمن لم يستلمها بعد)', effect: 'يتوقف الكود فوراً', fields: [CODE], target: (p) => p.code, load: loadCode,
      async execute(p, ctx, b) { if (b.active === false) throw E.conflict('الكود معطّل أصلاً'); await ref(ctx, b.key).update({ active: false }); return { message: `عُطّل «${b.name}»`, _want: false, undo: { action: 'codes.reactivate', params: { code: p.code } } }; },
      verify: verifyField('active')
    },
    {
      id: 'reactivate', label: 'إعادة تفعيل كود', icon: 'play', group: 'التفعيل', danger: 'medium', reversible: true, requires: ['firebase'], description: 'active=true', effect: 'يعود الكود صالحاً (يخضع لانتهائه وحدّ استخدامه)', fields: [CODE], target: (p) => p.code, load: loadCode,
      async execute(p, ctx, b) { if (b.active !== false) throw E.conflict('الكود فعّال أصلاً'); await ref(ctx, b.key).update({ active: true }); return { message: `فُعّل «${b.name}»`, _want: true, undo: { action: 'codes.stop', params: { code: p.code } } }; },
      verify: verifyField('active')
    },
    {
      id: 'delete', label: 'حذف كود', icon: 'trash', group: 'الحذف', danger: 'critical', reversible: false, reasonRequired: true, requires: ['firebase'], description: 'سياسة الحذف: نهائي بعد تأكيد، وتُحفظ نسخة منه في سجل التدقيق (before)', effect: 'يُحذف الكود وسجل مستخدميه نهائياً', fields: [CODE], target: (p) => p.code, load: loadCode,
      async execute(p, ctx, b) { await ref(ctx, b.key).remove(); return { message: `حُذف «${b.name}»` }; },
      verify: async (p, ctx, b) => ({ ok: !(await ref(ctx, b.key).get()).exists(), after: { exists: false } })
    },
    {
      id: 'set_max_uses', label: 'تعديل عدد الاستخدامات المسموح', icon: 'sliders', group: 'التعديل', danger: 'medium', reversible: true, requires: ['firebase'], description: 'maxUses — لا يقل عن عدد من استخدموه فعلاً', effect: 'يتغير الحد الأقصى فوراً',
      fields: [CODE, { name: 'maxUses', label: 'الحد الجديد', type: 'integer', required: true, min: 1, max: 1_000_000 }], target: (p) => `${p.code}=${p.maxUses}`, load: loadCode,
      async execute(p, ctx, b) { if (p.maxUses < b.usedCount) throw E.invalid(`الحد لا يقل عن المستخدم فعلاً (${b.usedCount})`); await ref(ctx, b.key).update({ maxUses: p.maxUses }); return { message: `الحد: ${b.maxUses} ← ${p.maxUses}`, _want: p.maxUses, undo: { action: 'codes.set_max_uses', params: { code: p.code, maxUses: b.maxUses } } }; },
      verify: verifyField('maxUses')
    },
    {
      id: 'set_expiry', label: 'تحديد تاريخ انتهاء الكود', icon: 'calendar', group: 'التعديل', danger: 'medium', reversible: true, requires: ['firebase'], description: 'expiresAt', effect: 'يتغير موعد انتهاء الكود',
      fields: [CODE, { name: 'expiresAt', label: 'تاريخ الانتهاء', type: 'datetime', required: true }], target: (p) => p.code, load: loadCode,
      async execute(p, ctx, b) { if (p.expiresAt <= now()) throw E.invalid('التاريخ يجب أن يكون في المستقبل'); await ref(ctx, b.key).update({ expiresAt: p.expiresAt }); return { message: `ينتهي في ${new Date(p.expiresAt).toLocaleString('ar-SA')}`, _want: p.expiresAt, undo: b.expiresAt > now() ? { action: 'codes.set_expiry', params: { code: p.code, expiresAt: b.expiresAt } } : undefined }; },
      verify: verifyField('expiresAt')
    },
    {
      id: 'reset_usage', label: 'تصفير عداد استخدام الكود', icon: 'rotate', group: 'التعديل', danger: 'critical', reversible: false, reasonRequired: true, requires: ['firebase'], description: 'usedCount=0 وحذف usedBy — يسمح لمن استخدموه بالاستخدام مرة أخرى', effect: 'يُمسح سجل المستخدمين (نسخة منه في التدقيق) ويمكن استخدام الكود من جديد', fields: [CODE], target: (p) => p.code,
      async load(p, ctx) { const b = await loadCode(p, ctx); const raw = (await ref(ctx, b.key).child('usedBy').get()).val(); return { ...b, usedBy: raw }; },
      async execute(p, ctx, b) { await ref(ctx, b.key).update({ usedCount: 0, usedBy: null }); return { message: `صُفّر عداد «${b.name}» (كان ${b.usedCount})` }; },
      async verify(p, ctx, b) { const v = (await ref(ctx, b.key).get()).val(); return { ok: v.usedCount === 0 && !v.usedBy, after: { usedCount: v.usedCount } }; }
    },
    {
      id: 'code_users', label: 'عرض من استخدم الكود', icon: 'users', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase'], fields: [CODE], target: (p) => p.code, description: 'قائمة المستخدمين ووقت الاستخدام', effect: 'قراءة فقط',
      async execute(p, ctx) { const b = await loadCode(p, ctx); const u = (await ref(ctx, b.key).child('usedBy').get()).val() || {}; const rows = Object.entries(u).map(([uid, x]) => ({ uid, username: x.username, usedAt: x.usedAt })).sort((a, c) => (c.usedAt || 0) - (a.usedAt || 0)); return { message: `${rows.length} مستخدم`, data: rows }; }
    },
    {
      id: 'export_codes', label: 'تصدير الأكواد (JSON)', icon: 'download', group: 'المتابعة', kind: 'read', danger: 'low', requires: ['firebase'], fields: [], description: 'كل الأكواد وحالتها (دون قائمة المستخدمين)', effect: 'قراءة فقط',
      async execute(p, ctx) { const all = (await ctx.fb.rtdb().ref('secretCodes').get()).val() || {}; const data = Object.entries(all).map(([k, v]) => ({ key: k, name: v.name, frameId: v.frameId, state: status(v), usedCount: v.usedCount || 0, maxUses: v.maxUses, expiresAt: v.expiresAt })); return { message: `${data.length} كود`, data, download: { filename: 'codes.json', mime: 'application/json', text: JSON.stringify(data, null, 2) } }; }
    }
  ]
};
