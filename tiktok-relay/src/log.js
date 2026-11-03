'use strict';
// سجلات منظّمة JSON. لا تطبع أي مفتاح/توكن أبداً — نقنّع أي حقل بالاسم يوحي بسرّ قبل الطباعة.
const SECRET_KEY_RE = /token|secret|key|password|cookie|authorization/i;

function maskSecrets(value) {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET_KEY_RE.test(k) ? '[محجوب]' : maskSecrets(v)]));
  }
  return value;
}

export function log(level, event, fields) {
  const line = { ts: new Date().toISOString(), level, event, ...maskSecrets(fields || {}) };
  const out = JSON.stringify(line);
  if (level === 'error') console.error(out);
  else if (level === 'warn') console.warn(out);
  else console.log(out);
}
