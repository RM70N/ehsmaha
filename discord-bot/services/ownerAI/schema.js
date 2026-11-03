'use strict';

// مدقق JSON Schema مصغّر (بدون مكتبات إضافية) لمدخلات الأدوات القادمة من Gemini.
// يدعم: type (string/integer/number/boolean/array/object)، enum، min/maxLength،
// minimum/maximum، minItems/maxItems، items، required، properties.
// additionalProperties: الحقول غير المعروفة تُحذف بصمت (النماذج تضيف حقول زايدة أحياناً).
// يحوّل القيم المنطقية والرقمية القادمة كنص ("5" ← 5، "true" ← true) لأن النماذج تخلط بينها.

function typeOf(v) {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v;
}

function coerce(schema, value) {
  const t = schema.type;
  if (t === 'string' && (typeof value === 'number' || typeof value === 'bigint')) return String(value);
  if ((t === 'integer' || t === 'number') && typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) return Number(value);
  if (t === 'boolean' && typeof value === 'string') {
    if (/^(true|yes|نعم)$/i.test(value.trim())) return true;
    if (/^(false|no|لا)$/i.test(value.trim())) return false;
  }
  return value;
}

/** @returns {{ok:boolean, value:any, errors:string[]}} */
function validate(schema, input, path = 'args') {
  const errors = [];
  const value = walk(schema, input, path, errors);
  return { ok: errors.length === 0, value, errors };
}

function walk(schema, raw, path, errors) {
  if (!schema || !schema.type) return raw;
  const value = coerce(schema, raw);
  const actual = typeOf(value);
  const expected = schema.type;
  const typeOk = expected === 'integer' ? actual === 'number' && Number.isInteger(value) : expected === 'number' ? actual === 'number' && Number.isFinite(value) : actual === expected;
  if (!typeOk) {
    errors.push(`${path}: المتوقع ${expected} والموجود ${actual}`);
    return value;
  }
  if (expected === 'string') {
    const v = value.trim();
    if (schema.minLength != null && v.length < schema.minLength) errors.push(`${path}: أقصر من الحد (${schema.minLength})`);
    if (schema.maxLength != null && v.length > schema.maxLength) errors.push(`${path}: أطول من الحد (${schema.maxLength})`);
    if (schema.enum && !schema.enum.includes(v)) errors.push(`${path}: قيمة غير مسموحة`);
    return v;
  }
  if (expected === 'integer' || expected === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: أقل من ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: أكبر من ${schema.maximum}`);
    return value;
  }
  if (expected === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: عدد العناصر أقل من ${schema.minItems}`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path}: عدد العناصر أكبر من ${schema.maxItems}`);
    return schema.items ? value.map((item, i) => walk(schema.items, item, `${path}[${i}]`, errors)) : value;
  }
  if (expected === 'object') {
    const out = {};
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (value[key] === undefined || value[key] === null || value[key] === '') errors.push(`${path}.${key}: مطلوب`);
    }
    for (const [key, sub] of Object.entries(props)) {
      if (value[key] === undefined || value[key] === null) continue;
      out[key] = walk(sub, value[key], `${path}.${key}`, errors);
    }
    return out;
  }
  return value;
}

module.exports = { validate };
