// أدوات قراءة/كتابة بيانات الموقع — تطابق منطق الموقع والبوت (مفاتيح levels، فهرس usernames، منحنى اللفل).
import { normUsername, isDocId } from '../lib/util.js';
import { E } from '../lib/errors.js';

// منحنى اللفلات — نسخة مطابقة لـdiscord-bot/api/services/levels.js (مصدرها index.html)
export const LEVELS = Object.freeze({ BASE_XP: 30, EXP: 1.5, MAX: 100, START: 1 });
const reqXp = (l) => Math.max(1, Math.round(LEVELS.BASE_XP * Math.pow(Math.max(1, l), LEVELS.EXP)));
export function levelFromXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let level = LEVELS.START, spent = 0;
  while (level < LEVELS.MAX) { const need = reqXp(level); if (xp - spent < need) break; spent += need; level++; }
  return level;
}
export const levelsKey = (v) => (v ? String(v).replace(/^(tiktok|twitch|kick|youtube):/, '').trim().toLowerCase().replace(/^@/, '') : '');

export const tsMs = (t) => (t == null ? null : typeof t === 'number' ? t : t.toMillis ? t.toMillis() : t._seconds ? t._seconds * 1000 : null);

// يجد لاعباً مسجّلاً: فهرس usernames ثم استعلام usernameLower ثم uid مباشر
export async function findPlayer(fb, raw) {
  const q = normUsername(raw);
  if (!q) throw E.invalid('اكتب اليوزرنيم أو معرّف الحساب');
  const db = fb.db();
  if (isDocId(q)) {
    const idx = await db.collection('usernames').doc(q).get();
    const uid = idx.exists && idx.data().uid;
    if (uid) { const s = await db.collection('users').doc(uid).get(); if (s.exists) return pack(uid, s.data()); }
  }
  const byLower = await db.collection('users').where('usernameLower', '==', q).limit(1).get();
  if (!byLower.empty) return pack(byLower.docs[0].id, byLower.docs[0].data());
  const rawTrim = String(raw).trim();
  if (isDocId(rawTrim)) { const s = await db.collection('users').doc(rawTrim).get(); if (s.exists) return pack(rawTrim, s.data()); }
  throw E.notFound('لا يوجد لاعب مسجّل بهذا اليوزرنيم أو المعرّف');
}
function pack(uid, user) {
  const siteKey = levelsKey(user.username || user.usernameLower);
  const tkKey = levelsKey(user.linkedTiktokUsername);
  return { uid, user, username: user.username || user.usernameLower || uid, usernameLower: user.usernameLower || normUsername(user.username), levelKeys: [...new Set([siteKey, tkKey].filter(Boolean))] };
}

export async function readLevel(fb, key) {
  if (!isDocId(key)) return null;
  const s = await fb.db().collection('levels').doc(key).get();
  return s.exists ? s.data() : null;
}
export const playerSummary = (p) => ({ uid: p.uid, username: p.username, usernameLower: p.usernameLower, email: p.user.email ? maskEmail(p.user.email) : null, linkedTiktok: p.user.linkedTiktokUsername || null, createdAt: tsMs(p.user.createdAt) });
export function maskEmail(e) { const [a, b] = String(e).split('@'); return b ? `${a.slice(0, 2)}***@${b}` : '***'; }

// ترقيم صفحات بمؤشر (Firestore startAfter) — للعرض في الجداول بدون تحميل كل البيانات
export function pageSize(q, d = 25) { return Math.min(100, Math.max(1, Number(q.pageSize) || d)); }
