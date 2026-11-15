'use strict';
// التحقق من قيم الإعدادات على الخادم قبل الحفظ — لا نثق بأي قيمة تصل من الواجهة.
import { GAMES } from './schema.js';

export class ValidationError extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; this.detail = detail; }
}

export function fieldOf(tag, key) {
  const g = GAMES[tag];
  if (!g) throw new ValidationError('unknown_game', { tag });
  const f = g.fields.find((x) => x.key === key);
  if (!f) throw new ValidationError('unknown_setting', { tag, key });
  return f;
}

// يرجع القيمة المنظَّفة أو يرمي ValidationError. لا يقصّ القيم (clamp): خارج المدى = رفض.
export function validateValue(f, v) {
  if (f.type === 'toggle') {
    if (typeof v !== 'boolean') throw new ValidationError('invalid_type', { key: f.key, expected: 'boolean' });
    return v;
  }
  if (f.type === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new ValidationError('invalid_type', { key: f.key, expected: 'number' });
    if (v < f.min || v > f.max) throw new ValidationError('out_of_range', { key: f.key, min: f.min, max: f.max });
    if (f.integer !== false && !Number.isInteger(v)) throw new ValidationError('not_integer', { key: f.key });
    return v;
  }
  if (f.type === 'numberArray') {
    if (!Array.isArray(v) || v.length !== f.length) throw new ValidationError('invalid_length', { key: f.key, length: f.length });
    v.forEach((n) => {
      if (typeof n !== 'number' || !Number.isFinite(n) || !Number.isInteger(n)) throw new ValidationError('invalid_type', { key: f.key, expected: 'integer[]' });
      if (n < f.min || n > f.max) throw new ValidationError('out_of_range', { key: f.key, min: f.min, max: f.max });
    });
    if (f.monotonic === 'desc') for (let i = 1; i < v.length; i++) if (v[i] > v[i - 1]) throw new ValidationError('not_descending', { key: f.key });
    return v.slice();
  }
  throw new ValidationError('unsupported_type', { key: f.key });
}

export function validateValues(tag, values) {
  if (!GAMES[tag]) throw new ValidationError('unknown_game', { tag });
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new ValidationError('invalid_values');
  const out = {};
  const keys = Object.keys(values);
  if (keys.length > 64) throw new ValidationError('too_many_keys');
  for (const k of keys) out[k] = validateValue(fieldOf(tag, k), values[k]);
  return out;
}

export function defaultsOf(tag) {
  const g = GAMES[tag];
  if (!g) throw new ValidationError('unknown_game', { tag });
  const o = {};
  for (const f of g.fields) o[f.key] = Array.isArray(f.default) ? f.default.slice() : f.default;
  return o;
}

export function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

export function validateName(name) {
  const s = String(name == null ? '' : name).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!s || s.length > 40) throw new ValidationError('invalid_name');
  return s;
}
