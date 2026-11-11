import { E } from '../../lib/errors.js';
import { now, isDocId } from '../../lib/util.js';
import { tsMs, pageSize } from '../siteHelpers.js';

const TYPES = [{ value: 'immunity', label: 'حصانة' }, { value: 'retry', label: 'إعادة محاولة' }, { value: 'doublepoints', label: 'نقاط مضاعفة' }];
const prod = (ctx, id) => ctx.fb.db().collection('shopProducts').doc(id);
const PID = { name: 'productId', label: 'معرّف المنتج', type: 'text', required: true, max: 120, help: 'من جدول المنتجات' };
async function loadProduct(p, ctx) { if (!isDocId(p.productId)) throw E.invalid('معرّف غير صالح'); const s = await prod(ctx, p.productId).get(); if (!s.exists) throw E.notFound('المنتج غير موجود'); const d = s.data(); return { id: p.productId, ...d, createdMs: tsMs(d.createdAt), expiresMs: tsMs(d.expiresAt) }; }
const verifyField = (f) => async (p, ctx, b, r) => { const d = (await prod(ctx, p.productId).get()).data(); const got = f === 'expiresAt' ? tsMs(d.expiresAt) : d[f]; return { ok: got === r._want, after: { [f]: got }, message: `الحقل ${f} في Firestore لم يتغير فعلياً` }; };
const frameDoc = (ctx, id) => ctx.fb.db().collection('framesCatalogExtra').doc(id);
const FID = { name: 'frameId', label: 'معرّف الإطار الإضافي', type: 'text', required: true, max: 120 };
async function loadFrameX(p, ctx) { if (!isDocId(p.frameId)) throw E.invalid('معرّف غير صالح'); const s = await frameDoc(ctx, p.frameId).get(); if (!s.exists) throw E.notFound('الإطار الإضافي غير موجود (الإطارات المدمجة لا تُخفى من هنا)'); return { id: p.frameId, name: s.data().name, visibility: s.data().visibility || 'public' }; }

export default {
  id: 'shop', workspace: 'website', label: 'المتجر والإطارات', icon: 'store', adminDefault: false, description: 'منتجات المتجر (حصانة/إعادة/نقاط مضاعفة) وظهور الإطارات',
  views: [
    {
      id: 'products', label: 'المنتجات', requires: ['firebase'], search: true, source: 'Firestore shopProducts',
      columns: [{ key: 'id', label: 'المعرّف', mono: true }, { key: 'name', label: 'المنتج' }, { key: 'type', label: 'النوع' }, { key: 'price', label: 'السعر' }, { key: 'sold', label: 'المباع/الحد' }, { key: 'state', label: 'الحالة' }, { key: 'expiresAt', label: 'ينتهي', type: 'date' }],
      async fetch(q, ctx) {
        const snap = await ctx.fb.db().collection('shopProducts').get(); const t = (q.q || '').toLowerCase(); const n = now();
        return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !t || `${x.name}${x.id}`.toLowerCase().includes(t)).map((x) => { const exp = tsMs(x.expiresAt); const sold = x.purchasedCount || 0; return { id: x.id, name: x.name, type: x.type, price: x.price, sold: `${sold}/${x.maxTotalPurchases}`, state: exp && exp <= n ? '⛔ متوقف/منتهٍ' : sold >= x.maxTotalPurchases ? '⛔ نفد' : '🟢 متاح', expiresAt: exp }; }) };
      }
    },
    {
      id: 'sales', label: 'عمليات الشراء والإهداء', requires: ['firebase'], search: true, source: 'Firestore storeSales',
      columns: [{ key: 'siteUsername', label: 'المشتري' }, { key: 'productName', label: 'المنتج' }, { key: 'productType', label: 'النوع' }, { key: 'targetStreamerRaw', label: 'الستريمر الهدف' }, { key: 'isGift', label: 'إهداء' }, { key: 'purchasedAt', label: 'الوقت', type: 'date' }],
      async fetch(q, ctx) { const snap = await ctx.fb.db().collection('storeSales').orderBy('purchasedAt', 'desc').limit(pageSize(q, 50)).get(); const t = (q.q || '').toLowerCase(); return { rows: snap.docs.map((d) => ({ id: d.id, ...d.data(), isGift: d.data().isGift ? 'نعم' : 'لا', purchasedAt: tsMs(d.data().purchasedAt) })).filter((x) => !t || JSON.stringify(x).toLowerCase().includes(t)) }; }
    },
    {
      id: 'frames', label: 'الإطارات الإضافية وظهورها', requires: ['firebase'], source: 'Firestore framesCatalogExtra',
      columns: [{ key: 'id', label: 'المعرّف', mono: true }, { key: 'name', label: 'الاسم' }, { key: 'visibility', label: 'الظهور في المتجر' }],
      async fetch(q, ctx) { const s = await ctx.fb.db().collection('framesCatalogExtra').limit(200).get(); return { rows: s.docs.map((d) => ({ id: d.id, name: d.data().name, visibility: d.data().visibility === 'public' ? '🟢 ظاهر' : '🔒 مخفي/خاص' })) }; }
    }
  ],
  actions: [
    {
      id: 'add_product', label: 'إضافة منتج للمتجر', icon: 'plus', group: 'المنتجات', danger: 'medium', reversible: true, requires: ['firebase'],
      description: 'ينشئ مستند shopProducts بنفس بنية الموقع (يختفي تلقائياً بعد المدة أو عند نفاد الكمية)', effect: 'يظهر المنتج للاعبين فوراً',
      fields: [{ name: 'name', label: 'اسم المنتج', type: 'text', required: true, max: 80 }, { name: 'type', label: 'النوع', type: 'select', required: true, options: TYPES }, { name: 'price', label: 'السعر', type: 'integer', required: true, min: 1, max: 100_000_000 }, { name: 'durationHours', label: 'مدة العرض (ساعات)', type: 'integer', required: true, min: 1, max: 8760 }, { name: 'maxTotalPurchases', label: 'أقصى عدد مشتريات (المخزون)', type: 'integer', required: true, min: 1, max: 1_000_000 }], target: (p) => p.name,
      async execute(p, ctx) { const ref = ctx.fb.db().collection('shopProducts').doc(); await ref.set({ name: p.name, type: p.type, price: p.price, durationHours: p.durationHours, maxTotalPurchases: p.maxTotalPurchases, purchasedCount: 0, createdAt: ctx.fb.FieldValue.serverTimestamp(), expiresAt: new Date(now() + p.durationHours * 3600_000) }); return { message: `أُضيف «${p.name}»`, undo: { action: 'shop.delete_product', params: { productId: ref.id } }, _id: ref.id }; },
      async verify(p, ctx, b, r) { const s = await prod(ctx, r._id).get(); return { ok: s.exists && s.data().name === p.name && s.data().price === p.price, after: { id: r._id, ...s.data() && { name: s.data().name, price: s.data().price } } }; }
    },
    {
      id: 'set_price', label: 'تعديل سعر منتج', icon: 'tag', group: 'المنتجات', danger: 'medium', reversible: true, reasonRequired: true, requires: ['firebase'], description: 'تغيير حقل price', effect: 'يتغير سعر الشراء فوراً للاعبين',
      fields: [PID, { name: 'price', label: 'السعر الجديد', type: 'integer', required: true, min: 1, max: 100_000_000 }], target: (p) => `${p.productId}=${p.price}`, load: loadProduct,
      async execute(p, ctx, b) { if (b.price === p.price) throw E.conflict('السعر مطابق'); await prod(ctx, p.productId).update({ price: p.price }); return { message: `السعر: ${b.price} ← ${p.price}`, _want: p.price, undo: { action: 'shop.set_price', params: { productId: p.productId, price: b.price } } }; },
      verify: verifyField('price')
    },
    {
      id: 'set_stock', label: 'تعديل المخزون (الحد الأقصى للمشتريات)', icon: 'box', group: 'المنتجات', danger: 'medium', reversible: true, requires: ['firebase'], description: 'maxTotalPurchases — لا يقل عن عدد المباع', effect: 'تتغير الكمية المتاحة للشراء',
      fields: [PID, { name: 'max', label: 'الحد الجديد', type: 'integer', required: true, min: 1, max: 1_000_000 }], target: (p) => `${p.productId}=${p.max}`, load: loadProduct,
      async execute(p, ctx, b) { if (p.max < (b.purchasedCount || 0)) throw E.invalid(`الحد لا يقل عن المباع (${b.purchasedCount})`); await prod(ctx, p.productId).update({ maxTotalPurchases: p.max }); return { message: `الحد: ${b.maxTotalPurchases} ← ${p.max}`, _want: p.max, undo: { action: 'shop.set_stock', params: { productId: p.productId, max: b.maxTotalPurchases } } }; },
      async verify(p, ctx, b, r) { const d = (await prod(ctx, p.productId).get()).data(); return { ok: d.maxTotalPurchases === r._want, after: { max: d.maxTotalPurchases } }; }
    },
    {
      id: 'stop_selling', label: 'إيقاف بيع منتج', icon: 'pause', group: 'المنتجات', danger: 'high', reversible: true, reasonRequired: true, requires: ['firebase'], description: 'يضبط expiresAt إلى الآن — يخفيه الموقع من واجهة اللاعبين (كما لو انتهت مدته)', effect: 'يتوقف الشراء فوراً؛ لا تتأثر المشتريات السابقة',
      fields: [PID], target: (p) => p.productId, load: loadProduct,
      async execute(p, ctx, b) { if (b.expiresMs && b.expiresMs <= now()) throw E.conflict('المنتج متوقف أصلاً'); const t = now() - 1000; await prod(ctx, p.productId).update({ expiresAt: new Date(t) }); return { message: `أُوقف بيع «${b.name}»`, _want: t, undo: b.expiresMs ? { action: 'shop.reactivate', params: { productId: p.productId, hours: Math.max(1, Math.ceil((b.expiresMs - now()) / 3600_000)) } } : undefined }; },
      verify: verifyField('expiresAt')
    },
    {
      id: 'reactivate', label: 'إعادة تفعيل منتج', icon: 'play', group: 'المنتجات', danger: 'medium', reversible: true, requires: ['firebase'], description: 'يمدّ expiresAt من الآن بعدد الساعات', effect: 'يعود المنتج متاحاً للشراء',
      fields: [PID, { name: 'hours', label: 'مدة التفعيل (ساعات)', type: 'integer', required: true, min: 1, max: 8760, default: 24 }], target: (p) => `${p.productId} +${p.hours}س`, load: loadProduct,
      async execute(p, ctx, b) { const t = now() + p.hours * 3600_000; await prod(ctx, p.productId).update({ expiresAt: new Date(t) }); return { message: `فُعّل «${b.name}» لـ${p.hours} ساعة`, _want: t, undo: { action: 'shop.stop_selling', params: { productId: p.productId } } }; },
      verify: verifyField('expiresAt')
    },
    {
      id: 'delete_product', label: 'حذف منتج', icon: 'trash', group: 'المنتجات', danger: 'critical', reversible: false, reasonRequired: true, requires: ['firebase'], description: 'حذف مستند المنتج نهائياً (سجل المبيعات يبقى)', effect: 'يُحذف المنتج ولا يمكن استرجاعه (يُحفظ نسخة منه في سجل التدقيق)',
      fields: [PID], target: (p) => p.productId, load: loadProduct,
      async execute(p, ctx) { await prod(ctx, p.productId).delete(); return { message: 'حُذف المنتج' }; },
      verify: async (p, ctx) => ({ ok: !(await prod(ctx, p.productId).get()).exists, after: { exists: false } })
    },
    {
      id: 'hide_frame', label: 'إخفاء إطار إضافي من المتجر', icon: 'eyeoff', group: 'الإطارات', danger: 'medium', reversible: true, requires: ['firebase'], description: 'visibility=private (الموقع يعرض العام فقط)', effect: 'يختفي الإطار من القوائم العامة (من يملكه يحتفظ به)',
      fields: [FID], target: (p) => p.frameId, load: loadFrameX,
      async execute(p, ctx, b) { if (b.visibility === 'private') throw E.conflict('الإطار مخفي أصلاً'); await frameDoc(ctx, p.frameId).set({ visibility: 'private' }, { merge: true }); return { message: `أُخفي «${b.name}»`, undo: { action: 'shop.show_frame', params: { frameId: p.frameId } } }; },
      verify: async (p, ctx) => ({ ok: (await frameDoc(ctx, p.frameId).get()).data().visibility === 'private', after: { visibility: 'private' } })
    },
    {
      id: 'show_frame', label: 'إظهار إطار إضافي في المتجر', icon: 'eye', group: 'الإطارات', danger: 'low', reversible: true, requires: ['firebase'], description: 'visibility=public', effect: 'يظهر الإطار في القوائم العامة',
      fields: [FID], target: (p) => p.frameId, load: loadFrameX,
      async execute(p, ctx, b) { if (b.visibility === 'public') throw E.conflict('الإطار ظاهر أصلاً'); await frameDoc(ctx, p.frameId).set({ visibility: 'public' }, { merge: true }); return { message: `أُظهر «${b.name}»`, undo: { action: 'shop.hide_frame', params: { frameId: p.frameId } } }; },
      verify: async (p, ctx) => ({ ok: (await frameDoc(ctx, p.frameId).get()).data().visibility === 'public', after: { visibility: 'public' } })
    },
    {
      id: 'sales_report', label: 'تقرير المبيعات والمنح (CSV)', icon: 'download', group: 'التقارير', kind: 'read', danger: 'low', requires: ['firebase'], fields: [{ name: 'days', label: 'آخر كم يوم', type: 'integer', required: true, min: 1, max: 365, default: 30 }], description: 'مبيعات storeSales ضمن الفترة', effect: 'قراءة فقط',
      async execute(p, ctx) { const since = new Date(now() - p.days * 86400_000); const s = await ctx.fb.db().collection('storeSales').where('purchasedAt', '>=', since).orderBy('purchasedAt', 'desc').limit(5000).get(); const rows = [['id', 'buyer', 'product', 'type', 'streamer', 'gift', 'at'], ...s.docs.map((d) => { const v = d.data(); return [d.id, v.siteUsername, v.productName, v.productType, v.targetStreamerRaw, v.isGift ? 1 : 0, new Date(tsMs(v.purchasedAt)).toISOString()]; })]; const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n'); return { message: `${s.size} عملية`, download: { filename: `sales-${p.days}d.csv`, mime: 'text/csv', text: csv } }; }
    }
  ]
};
