// سجل الأقسام والإجراءات: مصدر وحيد تُشتق منه الواجهة والصلاحيات والتوثيق والاختبارات.
import { z } from 'zod';

const SNOWFLAKE = /^\d{16,21}$/;

export function fieldToZod(f) {
  let s;
  switch (f.type) {
    case 'number': s = z.coerce.number({ invalid_type_error: `${f.label}: رقم غير صحيح` }).finite(); if (f.min != null) s = s.min(f.min); if (f.max != null) s = s.max(f.max); break;
    case 'integer': s = z.coerce.number({ invalid_type_error: `${f.label}: رقم غير صحيح` }).int(`${f.label}: يجب أن يكون عدداً صحيحاً`); if (f.min != null) s = s.min(f.min, `${f.label}: الحد الأدنى ${f.min}`); if (f.max != null) s = s.max(f.max, `${f.label}: الحد الأقصى ${f.max}`); break;
    case 'boolean': s = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]); break;
    case 'select': s = z.enum((f.options || []).map((o) => String(o.value)), { errorMap: () => ({ message: `${f.label}: قيمة غير مسموحة` }) }); break;
    case 'multiselect': s = z.array(z.string().max(100)).max(100); break;
    case 'snowflake': s = z.string().regex(SNOWFLAKE, `${f.label}: معرّف ديسكورد غير صالح`); break;
    case 'datetime': s = z.union([z.string().min(1), z.number()]).transform((v, ctx) => { const t = typeof v === 'number' ? v : Date.parse(v); if (!Number.isFinite(t)) { ctx.addIssue({ code: 'custom', message: `${f.label}: تاريخ غير صالح` }); return z.NEVER; } return t; }); break;
    case 'url': s = z.string().url(`${f.label}: رابط غير صالح`).refine((u) => /^https?:\/\//i.test(u), `${f.label}: يجب أن يبدأ بـhttp(s)`); break;
    default: { // text | textarea | username
      s = z.string().trim();
      if (f.min != null) s = s.min(f.min, `${f.label}: الحد الأدنى ${f.min} حرف`);
      s = s.max(f.max ?? (f.type === 'textarea' ? 4000 : 200), `${f.label}: النص طويل`);
      if (f.pattern) s = s.regex(new RegExp(f.pattern), `${f.label}: صيغة غير صحيحة`);
    }
  }
  if (!f.required) s = z.preprocess((v) => (v === '' || v === null ? undefined : v), s.optional());
  else if (['text', 'textarea', 'username'].includes(f.type)) s = s.pipe(z.string().min(1, `${f.label}: مطلوب`));
  return s;
}

export function buildSchema(fields = []) {
  return z.object(Object.fromEntries(fields.map((f) => [f.name, fieldToZod(f)]))).strict();
}

const DANGER = ['low', 'medium', 'high', 'critical'];

export function createRegistry(sectionDefs) {
  const secs = new Map();
  const acts = new Map();
  const views = new Map();
  for (const def of sectionDefs) {
    if (secs.has(def.id)) throw new Error('duplicate section ' + def.id);
    secs.set(def.id, { adminDefault: false, ...def, actions: undefined, views: undefined });
    for (const v of def.views || []) { views.set(`${def.id}.${v.id}`, { ...v, section: def.id, fullId: `${def.id}.${v.id}` }); }
    for (const a of def.actions || []) {
      const id = `${def.id}.${a.id}`;
      if (acts.has(id)) throw new Error('duplicate action ' + id);
      if (!DANGER.includes(a.danger)) throw new Error('bad danger ' + id);
      if (!a.label || !a.execute && a.kind !== 'read') throw new Error('incomplete action ' + id);
      acts.set(id, { kind: 'write', requires: [], fields: [], reversible: false, ...a, id, shortId: a.id, section: def.id, schema: buildSchema(a.fields) });
    }
  }
  return {
    section: (id) => secs.get(id),
    sections: () => [...secs.values()],
    action: (id) => acts.get(id),
    actions: () => [...acts.values()],
    actionsOf: (sid) => [...acts.values()].filter((a) => a.section === sid),
    view: (id) => views.get(id),
    viewsOf: (sid) => [...views.values()].filter((v) => v.section === sid),
    // وصف آمن للواجهة (بلا دوال)
    describeAction(a, caps) {
      const cap = a.requires.map((r) => (caps[r] ? caps[r]() : { ok: false, reason: 'قدرة غير معروفة' })).find((c) => !c.ok);
      return {
        id: a.id, shortId: a.shortId, section: a.section, label: a.label, description: a.description || '', icon: a.icon || 'bolt', group: a.group || 'عام',
        danger: a.danger, kind: a.kind, reversible: !!a.reversible, reasonRequired: !!a.reasonRequired, effect: a.effect || '', apply: a.apply || null,
        fields: a.fields.map(({ name, label, type, required, options, min, max, placeholder, help, default: def, optionsFrom }) => ({ name, label, type, required: !!required, options, min, max, placeholder, help, default: def, optionsFrom })),
        available: !cap, unavailableReason: cap ? cap.reason : null
      };
    }
  };
}
