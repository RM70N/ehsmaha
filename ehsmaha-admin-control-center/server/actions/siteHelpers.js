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

// حصة Firestore اليومية مستنفدة (gRPC 8 RESOURCE_EXHAUSTED) — تتجدد يومياً. نعمل بمصادر لا تعتمد عليها: Firebase Auth و RTDB
export const isQuota = (e) => !!e && (e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e.message || '')));

// بحث اللاعب عبر Firebase Auth فقط (حصة منفصلة عن Firestore): بريد أو UID أو اسم العرض
async function findPlayerViaAuth(fb, raw) {
  const q = String(raw || '').trim(); const auth = fb.auth(); let u = null;
  try {
    if (q.includes('@')) u = await auth.getUserByEmail(q);
    else if (/^[A-Za-z0-9]{20,40}$/.test(q) || q.startsWith('p-')) u = await auth.getUser(q);
  } catch (e) { if (e.code !== 'auth/user-not-found' && e.code !== 'auth/invalid-uid') throw e; }
  if (!u) { const lower = normUsername(q); let token; do { const r = await auth.listUsers(1000, token); u = r.users.find((x) => normUsername(x.displayName) === lower || (x.email || '').split('@')[0].toLowerCase() === lower); token = r.pageToken; } while (!u && token); }
  if (!u) {
    // احتياط RTDB (نفس مسارات الموقع): pendingUsernames/{lower} ثم levels/{key}
    const lower = normUsername(q); const rt = fb.rtdb();
    try { const ps = await rt.ref('pendingUsernames/' + lower).get(); const uid = ps.exists() && ps.val()?.uid; if (uid) { try { u = await auth.getUser(uid); } catch { /* */ } } } catch { /* */ }
    if (!u) {
      const key = levelsKey(q); let lv = null;
      try { const r = await rt.ref('levels/' + key).get(); lv = r.exists() ? r.val() : null; } catch { /* */ }
      if (lv) return { uid: null, soft: true, user: { username: q, usernameLower: lower }, username: q, usernameLower: lower, levelKeys: [key], viaAuth: true };
      throw E.notFound('Firestore غير متاح (الحصة مستنفدة) ولم يُعثر على اللاعب في Auth ولا RTDB — جرّب البريد الإلكتروني أو معرّف الحساب (UID)');
    }
  }
  const username = u.displayName || (u.email || '').split('@')[0] || u.uid; const lower = normUsername(username);
  return { uid: u.uid, user: { username, usernameLower: lower, email: u.email }, username, usernameLower: lower, levelKeys: [levelsKey(username)].filter(Boolean), viaAuth: true };
}

// مرجع levels مقاوم لنفاد الحصة: Firestore أولاً ثم RTDB (نفس آلية الموقع الاحتياطية: levels/{key})
const marker = (o) => !!o && typeof o === 'object' && '_op' in o;
export const ADD = (v) => ({ _op: 'add', v }); export const RM = (v) => ({ _op: 'rm', v }); export const TS = { _op: 'ts' };
export function levelRef(fb, key) {
  return {
    async get() {
      try { const s = await fb.db().collection('levels').doc(key).get(); return { exists: s.exists, data: () => s.data(), via: 'firestore' }; }
      catch (e) { if (!isQuota(e)) throw e; const r = await fb.rtdb().ref('levels/' + key).get(); const v = r.exists() ? r.val() : null; return { exists: !!v, data: () => v || undefined, via: 'rtdb' }; }
    },
    async set(patch) {
      const conv = (v) => (!marker(v) ? v : v._op === 'add' ? fb.FieldValue.arrayUnion(v.v) : v._op === 'rm' ? fb.FieldValue.arrayRemove(v.v) : fb.FieldValue.serverTimestamp());
      try { await fb.db().collection('levels').doc(key).set(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, conv(v)])), { merge: true }); return 'firestore'; }
      catch (e) {
        if (!isQuota(e)) throw e;
        await fb.rtdb().ref('levels/' + key).transaction((cur) => { const o = { ...(cur || {}) }; for (const [k, v] of Object.entries(patch)) { if (marker(v)) { if (v._op === 'ts') o[k] = Date.now(); else { const a = Array.isArray(o[k]) ? o[k].slice() : []; const i = a.indexOf(v.v); if (v._op === 'add' && i < 0) a.push(v.v); if (v._op === 'rm' && i >= 0) a.splice(i, 1); o[k] = a; } } else o[k] = v; } return o; });
        return 'rtdb';
      }
    },
    // تعديل الخبرة بمعاملة ذرّية (لا تنزل عن 0) + إعادة حساب اللفل
    async adjustXp(delta) {
      try {
        const ref = fb.db().collection('levels').doc(key);
        const out = await fb.db().runTransaction(async (tx) => { const s = await tx.get(ref); const cur = Number(s.exists ? s.data().xp : 0) || 0; const next = Math.max(0, cur + delta); tx.set(ref, { xp: next, level: levelFromXp(next), updatedAt: fb.FieldValue.serverTimestamp() }, { merge: true }); return { cur, next }; });
        return { ...out, via: 'firestore' };
      } catch (e) {
        if (!isQuota(e)) throw e; let r = { cur: 0, next: 0 };
        await fb.rtdb().ref('levels/' + key).transaction((cur) => { const o = { ...(cur || {}) }; const c = Number(o.xp) || 0; const n = Math.max(0, c + delta); r = { cur: c, next: n }; o.xp = n; o.level = levelFromXp(n); o.updatedAt = Date.now(); return o; });
        return { ...r, via: 'rtdb' };
      }
    }
  };
}

// يجد لاعباً مسجّلاً: فهرس usernames ثم استعلام usernameLower ثم uid مباشر (ثم Firebase Auth إن نفدت حصة Firestore)
export async function findPlayer(fb, raw, { needUid = false } = {}) {
  let pl;
  try { pl = await findPlayerFs(fb, raw); } catch (e) { if (!isQuota(e)) throw e; pl = await findPlayerViaAuth(fb, raw); }
  if (needUid && !pl.uid) throw E.notFound('هذه العملية تحتاج حساب Firebase للاعب (حصة Firestore مستنفدة ولم يُعثر على UID) — أدخل البريد الإلكتروني أو الـUID');
  return pl;
}
async function findPlayerFs(fb, raw) {
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
  const s = await levelRef(fb, key).get();
  return s.exists ? s.data() : null;
}
export const playerSummary = (p) => ({ uid: p.uid, username: p.username, usernameLower: p.usernameLower, email: p.user.email ? maskEmail(p.user.email) : null, linkedTiktok: p.user.linkedTiktokUsername || null, createdAt: tsMs(p.user.createdAt) });
export function maskEmail(e) { const [a, b] = String(e).split('@'); return b ? `${a.slice(0, 2)}***@${b}` : '***'; }

// ترقيم صفحات بمؤشر (Firestore startAfter) — للعرض في الجداول بدون تحميل كل البيانات
export function pageSize(q, d = 25) { return Math.min(100, Math.max(1, Number(q.pageSize) || d)); }
