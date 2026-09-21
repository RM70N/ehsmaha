// ==================== أدوات مشتركة لإيجاد/قراءة حسابات اللاعبين ====================
import { AdminFB } from './firebase.js';

const fb = AdminFB;

export async function resolveUidByUsername(usernameRaw) {
  const usernameLower = (usernameRaw || '').trim().toLowerCase();
  if (!usernameLower) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'usernames', usernameLower));
  return snap.exists() ? snap.data().uid : null;
}

export async function getUserByUsername(usernameRaw) {
  const uid = await resolveUidByUsername(usernameRaw);
  if (!uid) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : { uid };
}

// بحث ببادئة اليوزرنيم (نطاق Firestore على usernameLower — نفس أسلوب فهرسة
// النص الوحيد المتاح بلا محرك بحث خارجي، يكفي لبحث الإدارة).
export async function searchUsersByPrefix(prefixRaw, limitN) {
  const prefix = (prefixRaw || '').trim().toLowerCase();
  if (!prefix) return [];
  const qy = fb.query(
    fb.collection(fb.db, 'users'),
    fb.where('usernameLower', '>=', prefix),
    fb.where('usernameLower', '<', prefix + ''),
    fb.limit(limitN || 25)
  );
  const snap = await fb.getDocs(qy);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export function playerSearchBox({ onSelect, placeholder }) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="admin-field"><span class="admin-field__label">اسم المستخدم</span>
      <input class="admin-input" id="pl-search-input" placeholder="${placeholder || 'اكتب اليوزر أو جزء منه...'}" />
    </div>
    <div id="pl-search-results" style="margin-top:8px;"></div>
  `;
  const input = wrap.querySelector('#pl-search-input');
  const results = wrap.querySelector('#pl-search-results');
  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const val = input.value.trim();
      if (val.length < 2) { results.innerHTML = ''; return; }
      results.innerHTML = 'جارٍ البحث...';
      const rows = await searchUsersByPrefix(val, 15);
      results.innerHTML = rows.length ? rows.map((r) => `<button type="button" class="admin-tool-card" style="padding:8px 12px;min-height:auto;width:100%;text-align:right;margin-bottom:4px;" data-uid="${r.uid}">${r.username || r.uid}</button>`).join('') : '<p class="admin-field__hint">ولا نتيجة</p>';
      results.querySelectorAll('[data-uid]').forEach((btn) => btn.addEventListener('click', () => {
        const row = rows.find((r) => r.uid === btn.getAttribute('data-uid'));
        onSelect(row);
      }));
    }, 300);
  });
  return wrap;
}

// ==================== مفاتيح نظام المستويات/الإطارات (levels/{key}) ====================
// نسخة مطابقة حرفياً لـlevelsKey() بالموقع الرئيسي. مهم جداً: ملكية الإطارات
// (ownedFrames/levelFrames/activeFrame) وكل XP/اللفل محفوظة على
// **levels/{key}** — لا على users/{uid}. وبما إن الموقع يقرأ الإطار بمفتاحين
// محتملين (يوزر الموقع، ويوزر تيك توك المربوط لبطاقات البث) لازم أي منح/سحب
// من اللوحة يطبَّق على المفتاحين معاً وإلا "الإطار ما يوصل" — نفس المشكلة
// الموثَّقة حرفياً بتعليقات الموقع الرئيسي (framesSelfKeys/framesGrantToUser).
export function levelsKey(idOrUsername) {
  if (!idOrUsername) return '';
  return String(idOrUsername)
    .replace(/^(tiktok|twitch|kick|youtube):/, '')
    .trim().toLowerCase().replace(/^@/, '');
}

export async function levelsKeysForUsername(usernameRaw) {
  const keys = [];
  const siteKey = levelsKey(usernameRaw);
  if (siteKey) keys.push(siteKey);
  const user = await getUserByUsername(usernameRaw);
  const tkKey = user && user.linkedTiktokUsername ? levelsKey(user.linkedTiktokUsername) : '';
  if (tkKey && !keys.includes(tkKey)) keys.push(tkKey);
  return keys;
}

export async function framesGrant(usernameRaw, frameId) {
  const keys = await levelsKeysForUsername(usernameRaw);
  for (const k of keys) {
    await fb.setDoc(fb.doc(fb.db, 'levels', k), { ownedFrames: fb.arrayUnion(frameId) }, { merge: true });
  }
  return keys;
}

export async function framesRevoke(usernameRaw, frameId) {
  const keys = await levelsKeysForUsername(usernameRaw);
  for (const k of keys) {
    await fb.setDoc(fb.doc(fb.db, 'levels', k), { ownedFrames: fb.arrayRemove(frameId) }, { merge: true });
  }
  return keys;
}

// مالكو إطار معيّن — من كولكشن levels (مكان الملكية الحقيقي)، مع توحيد
// المفتاحين المحتملين لنفس الشخص حتى ما يُحسب مرتين.
export async function listFrameOwners(frameId) {
  const snap = await fb.getDocs(fb.collection(fb.db, 'levels'));
  return snap.docs
    .map((d) => ({ key: d.id, ...d.data() }))
    .filter((v) => Array.isArray(v.ownedFrames) && v.ownedFrames.includes(frameId));
}
export async function countFrameOwners(frameId) {
  const rows = await listFrameOwners(frameId);
  const uniq = new Set(rows.map((r) => levelsKey(r.username || r.key)));
  return uniq.size;
}

// ==================== حساب اللفل من XP — نسخة طبق الأصل من معادلة الموقع ====================
// الموقع (levelsProgressFromXp / levelsRequiredXpFor) يحسب اللفل من XP التراكمي
// بمنحنى requiredXp(level) = BASE_XP * level^CURVE_EXPONENT، ويكتب الحقلين
// (xp و level) معاً داخل معاملة levelsCommit — وهي تُستدعى فقط لما يلعب الشخص
// راونداً فعلياً. يعني أي تعديل XP من اللوحة بدون تحديث level يخلّي اللفل
// المعروض بالبروفايل وقائمة المستويات غلط لحد ما يلعب الشخص من جديد. لهذا كل
// كتابة XP من اللوحة تمرّ من xpSetForKeys/xpSetForUsername تحت.
export const ADMIN_LEVELS_CONFIG = { BASE_XP: 30, CURVE_EXPONENT: 1.5, MAX_LEVEL: 100, START_LEVEL: 1 };

export function levelsRequiredXpFor(level) {
  return Math.max(1, Math.round(ADMIN_LEVELS_CONFIG.BASE_XP * Math.pow(Math.max(1, level), ADMIN_LEVELS_CONFIG.CURVE_EXPONENT)));
}

export function levelFromXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let level = ADMIN_LEVELS_CONFIG.START_LEVEL;
  let spent = 0;
  while (level < ADMIN_LEVELS_CONFIG.MAX_LEVEL) {
    const need = levelsRequiredXpFor(level);
    if ((xp - spent) < need) break;
    spent += need;
    level++;
  }
  return level;
}

// يضبط XP لقيمة مطلقة ويعيد حساب اللفل معها، على مفاتيح اللاعب كلها.
export async function xpSetForKeys(keys, newXp) {
  const xp = Math.max(0, Number(newXp) || 0);
  const level = levelFromXp(xp);
  for (const k of keys) {
    await fb.setDoc(fb.doc(fb.db, 'levels', k), { xp, level }, { merge: true });
  }
  return { xp, level, keys };
}

export async function xpSetForUsername(usernameRaw, newXp) {
  const keys = await levelsKeysForUsername(usernameRaw);
  return xpSetForKeys(keys, newXp);
}

// يضيف/يخصم XP نسبياً (يقرأ الرصيد الحالي أولاً عشان يعيد حساب اللفل صح —
// increment لحاله ما يقدر يعيد حساب حقل level).
export async function xpAddForUsername(usernameRaw, deltaXp) {
  const keys = await levelsKeysForUsername(usernameRaw);
  if (!keys.length) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'levels', keys[0]));
  const cur = Math.max(0, Number(snap.exists() ? snap.data().xp : 0) || 0);
  return xpSetForKeys(keys, cur + (Number(deltaXp) || 0));
}

// يقرأ سجل levels الحالي للاعب (المفتاح الأول = مفتاح يوزر الموقع).
export async function getLevelsDocForUsername(usernameRaw) {
  const keys = await levelsKeysForUsername(usernameRaw);
  if (!keys.length) return null;
  const snap = await fb.getDoc(fb.doc(fb.db, 'levels', keys[0]));
  return { key: keys[0], keys, exists: snap.exists(), data: snap.exists() ? snap.data() : {} };
}

window.AdminPlayers = { resolveUidByUsername, getUserByUsername, searchUsersByPrefix, levelsKey, framesGrant, framesRevoke, listFrameOwners, countFrameOwners, levelFromXp, xpSetForUsername, xpAddForUsername, getLevelsDocForUsername };
