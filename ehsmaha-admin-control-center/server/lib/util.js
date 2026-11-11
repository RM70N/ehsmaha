import crypto from 'node:crypto';

export const now = () => Date.now();
export const uid = (n = 12) => crypto.randomBytes(n).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
export const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a ?? '')).digest();
  const hb = crypto.createHash('sha256').update(String(b ?? '')).digest();
  return crypto.timingSafeEqual(ha, hb);
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON ثابت الترتيب (لحساب بصمة الطلب وسلسلة التدقيق)
export function stable(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

const maskEmail = (e) => { const [a, b] = String(e).split('@'); return b ? `${a.slice(0, 2)}***@${b}` : '***'; };
const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|private[-_]?key|service[-_]?account|authorization|cookie)/i;
// يحجب أي حقل يشبه سراً قبل التسجيل أو الإرسال للمتصفح
export function scrub(v, depth = 0) {
  if (v == null || depth > 6) return v;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => scrub(x, depth + 1));
  if (typeof v === 'object') {
    if (typeof v.toMillis === 'function') return v.toMillis();
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = SECRET_KEY.test(k) ? '«محجوب»' : /e-?mail/i.test(k) && typeof val === 'string' ? maskEmail(val) : scrub(val, depth + 1);
    return out;
  }
  if (typeof v === 'string' && v.length > 2000) return v.slice(0, 2000) + '…';
  return v;
}

// تنظيف يوزرنيم الموقع (نفس منطق البوت/الموقع: NFC + حذف الأحرف المخفية + @ + lowercase)
export function normUsername(raw) {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
export const isDocId = (k) => !!k && k.length <= 1500 && !k.includes('/') && k !== '.' && k !== '..' && !/^__.*__$/.test(k);

// IP مقنّع للخصوصية: IPv4 → /24 ، IPv6 → أول 4 مقاطع
export function maskIp(ip) {
  if (!ip) return null;
  const s = String(ip).replace(/^::ffff:/, '');
  if (s.includes('.')) return s.split('.').slice(0, 3).join('.') + '.x';
  return s.split(':').slice(0, 4).join(':') + '::x';
}
export function deviceLabel(ua = '') {
  const u = String(ua);
  const os = /Android/i.test(u) ? 'Android' : /iPhone|iPad|iOS/i.test(u) ? 'iOS' : /Windows/i.test(u) ? 'Windows' : /Mac OS/i.test(u) ? 'macOS' : /Linux/i.test(u) ? 'Linux' : 'جهاز';
  const br = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'متصفح';
  return `${br} · ${os}`;
}
