'use strict';

// البحث عن لاعب باليوزرنيم مباشرة في قاعدة الموقع الفعلية، وتجهيز بيانات
// البروفايل والإحصائيات.
//
// ترتيب البحث (بعد التنظيف: فراغات زائدة، @ بالبداية، أحرف صغيرة):
//   1) usernames/{usernameLower} → uid → users/{uid}   (حساب مسجّل بالموقع — نفس فهرس الموقع)
//   2) users where usernameLower == ...                 (احتياط لو مستند الفهرس ناقص)
//   3) levels/{levelsKey(يوزر)}                          (لاعب بث بدون حساب: متابع تيك توك/كيك/يوتيوب)
//
// كل لاعب مسجّل ممكن يكون له سجلّا levels: مفتاح يوزر الموقع ومفتاح تيك توك
// المربوط — نعرض الأعلى XP مثل ما يعرض الموقع. Realtime Database (levels/{key})
// تُدمج كاحتياط مثل framesMergeLevelDocs بالموقع: Firestore أولاً وRTDB يكمّل.

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const { errors } = require('../errors');
const { progressFromXp, levelsKey, isValidDocId } = require('./levels');
const { gameName } = require('./games');
const { toIso } = require('./time');
const memo = require('./memo');

const STREAM_WINS_TTL_MS = 10 * 60 * 1000;
const RANKED_TOTAL_TTL_MS = 5 * 60 * 1000;
const AVATAR_CHECK_TTL_MS = 30 * 60 * 1000;
const SEARCH_TTL_MS = 60 * 1000;
const MAX_USERNAME_LENGTH = 64;

const db = () => firestore.db();
const num = (v) => Math.max(0, Number(v) || 0);

// ---------- تنظيف المدخل ----------

// NFC يوحّد تمثيل الحروف العربية المركّبة (مثل الهمزات) قبل المقارنة، والفراغات
// الزائدة/المخفية (ZWJ/ZWNJ/RLM...) تنشال لأن اليوزر نفسه ما يحتويها.
function normalizeUsername(raw) {
  return String(raw == null ? '' : raw)
    .normalize('NFC')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// ---------- قراءة البيانات الخام ----------

async function readRtdbLevel(key) {
  const rtdb = firestore.rtdb();
  if (!rtdb) return null;
  try {
    const snap = await Promise.race([
      rtdb.ref('levels/' + key).get(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('rtdb timeout')), 2500))
    ]);
    return snap.exists() ? snap.val() : null;
  } catch (_) {
    return null; // RTDB اختياري — فشله ما يوقف العرض
  }
}

async function readLevelDoc(key) {
  if (!isValidDocId(key)) return null;
  const [fsSnap, rt] = await Promise.all([db().collection(C.LEVELS).doc(key).get(), readRtdbLevel(key)]);
  const fs = fsSnap.exists ? fsSnap.data() : null;
  if (!fs && !rt) return null;
  return { key, ...(rt || {}), ...(fs || {}) };
}

async function findRegisteredUser(lower) {
  if (isValidDocId(lower)) {
    const idx = await db().collection(C.USERNAMES).doc(lower).get();
    const uid = idx.exists && idx.data().uid;
    if (uid) {
      const snap = await db().collection(C.USERS).doc(uid).get();
      if (snap.exists) return { uid, user: snap.data() };
    }
  }
  const q = await db().collection(C.USERS).where('usernameLower', '==', lower).limit(1).get();
  return q.empty ? null : { uid: q.docs[0].id, user: q.docs[0].data() };
}

/**
 * يرجع { registered, uid, user, level, keys } أو يرمي PLAYER_NOT_FOUND.
 */
async function resolvePlayer(rawUsername) {
  const lower = normalizeUsername(rawUsername);
  if (!lower) throw errors.invalidInput('اكتب اليوزرنيم');
  if (lower.length > MAX_USERNAME_LENGTH) throw errors.invalidInput('اليوزرنيم طويل جداً');

  const account = await findRegisteredUser(lower);
  if (account) {
    const siteKey = levelsKey(account.user.username || lower);
    const tiktokKey = levelsKey(account.user.linkedTiktokUsername);
    const keys = [...new Set([siteKey, tiktokKey].filter(Boolean))];
    const docs = (await Promise.all(keys.map(readLevelDoc))).filter(Boolean);
    docs.sort((a, b) => num(b.xp) - num(a.xp)); // الأعلى XP = المعروض بالموقع
    return { registered: true, uid: account.uid, user: account.user, level: docs[0] || null, keys };
  }

  // لاعب بث بدون حساب بالموقع (له سجل لفلات فقط)
  const key = levelsKey(lower);
  const level = await readLevelDoc(key);
  if (level && (num(level.xp) > 0 || num(level.roundsPlayed) > 0)) {
    return { registered: false, uid: null, user: null, level, keys: [key] };
  }
  throw errors.playerNotFound();
}

// ---------- أفتار ----------

// نتأكد إن رابط الأفتار (غالباً CDN تيك توك) ما انتهت صلاحيته، وإلا يستخدم
// البوت الشعار. النتيجة مخزنة 30 دقيقة لكل رابط.
async function usableAvatar(url) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  return memo.remember('avatar:' + url, AVATAR_CHECK_TTL_MS, async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal, redirect: 'follow' });
      clearTimeout(t);
      const type = res.headers.get('content-type') || '';
      return res.ok && type.startsWith('image/') ? url : null;
    } catch (_) {
      return null;
    }
  });
}

// ---------- فوزات البث (leaderboards) ----------

// فهرس: levelsKey(معرّف المتابع) → مجموع فوزاته بكل قوائم الستريمرز. قراءة
// كامل التجميعة مكلفة نسبياً فتُخزّن 10 دقائق وتُشارك بين كل الطلبات.
function streamWinsIndex() {
  return memo.remember('streamWinsIndex', STREAM_WINS_TTL_MS, async () => {
    const snap = await db().collection(C.LEADERBOARDS).get();
    const index = new Map();
    snap.forEach((doc) => {
      const board = doc.data() || {};
      for (const [viewerId, entry] of Object.entries(board)) {
        if (!entry || typeof entry !== 'object') continue;
        const key = levelsKey(viewerId);
        if (!key) continue;
        index.set(key, (index.get(key) || 0) + num(entry.wins));
      }
    });
    return index;
  });
}

async function streamWinsFor(keys) {
  try {
    const index = await streamWinsIndex();
    return keys.reduce((sum, k) => sum + (index.get(k) || 0), 0);
  } catch (_) {
    return 0;
  }
}

// ---------- الترتيب العام ----------

function totalRanked() {
  return memo.remember('rankedTotal', RANKED_TOTAL_TTL_MS, async () => {
    const agg = await db().collection(C.LEVELS).where('xp', '>', 0).count().get();
    return agg.data().count;
  });
}

async function globalRank(xp) {
  if (!(xp > 0)) return { rank: null, total: await totalRanked().catch(() => 0) };
  const [above, total] = await Promise.all([db().collection(C.LEVELS).where('xp', '>', xp).count().get(), totalRanked()]);
  return { rank: above.data().count + 1, total };
}

// ---------- تجهيز الردود ----------

function avatarCandidate(ctx) {
  return (ctx.user && ctx.user.linkedTiktokAvatar) || (ctx.level && ctx.level.avatar) || null;
}

function baseFields(ctx, profileUrl) {
  const { user, level } = ctx;
  const progress = progressFromXp(level ? level.xp : 0);
  return {
    username: (user && user.username) || (level && level.username) || (level && level.key) || '—',
    registered: ctx.registered,
    tiktokUsername: (user && user.linkedTiktokUsername) || null,
    level: progress.level,
    xp: progress.xp,
    xpIntoLevel: progress.xpIntoLevel,
    xpForNextLevel: progress.xpForNextLevel,
    levelPercent: progress.percent,
    isMaxLevel: progress.isMax,
    points: num(user && user.onlinePoints),
    roundsPlayed: num(level && level.roundsPlayed),
    profileUrl
  };
}

async function getProfile(username, { profileUrl }) {
  const ctx = await resolvePlayer(username);
  return {
    ...baseFields(ctx, profileUrl),
    avatarUrl: await usableAvatar(avatarCandidate(ctx)),
    joinedAt: toIso((ctx.user && ctx.user.createdAt) || (ctx.level && ctx.level.createdAt))
  };
}

function mostPlayed(gamesPlayCount) {
  let best = null;
  for (const [tag, count] of Object.entries(gamesPlayCount || {})) {
    const c = num(count);
    if (c > 0 && (!best || c > best.count)) best = { tag, name: gameName(tag), count: c };
  }
  return best;
}

async function getStats(username, { profileUrl }) {
  const ctx = await resolvePlayer(username);
  const base = baseFields(ctx, profileUrl);

  const [avatarUrl, streamWins, rank] = await Promise.all([
    usableAvatar(avatarCandidate(ctx)),
    streamWinsFor(ctx.keys),
    globalRank(base.xp)
  ]);

  const solo = num(ctx.user && ctx.user.soloWinCount);
  const online = num(ctx.user && ctx.user.onlineWinCount);
  const totalWins = solo + online + streamWins;
  // الموقع ما يسجّل "خسارة" صريحة: كل جولة لعبها اللاعب بدون فوز = هزيمة.
  const rounds = base.roundsPlayed;
  const losses = Math.max(0, rounds - totalWins);
  const winRate = rounds > 0 ? Math.min(100, Math.round((totalWins / rounds) * 1000) / 10) : 0;

  const recentGames = (Array.isArray(ctx.level && ctx.level.activityLog) ? ctx.level.activityLog : [])
    .slice(0, 5)
    .map((a) => ({ tag: a.game, name: gameName(a.game), at: Number(a.at) ? new Date(Number(a.at)).toISOString() : null }));

  return {
    ...base,
    avatarUrl,
    wins: { total: totalWins, solo, online, stream: streamWins },
    losses,
    winRate,
    mostPlayedGame: mostPlayed(ctx.level && ctx.level.gamesPlayCount),
    bestRoundPoints: num(ctx.user && ctx.user.bestRoundPoints) || null,
    globalRank: rank.rank,
    totalRanked: rank.total,
    recentGames
  };
}

// ---------- اقتراحات (Autocomplete) ----------

// أسماء تبدأ بالنص المكتوب: حسابات الموقع أولاً (users.usernameLower) ثم لاعبي
// البث (معرّفات levels). استعلام نطاق على حقل واحد — يغطيه الفهرس التلقائي.
async function searchUsernames(rawQuery, limit = 20) {
  const prefix = normalizeUsername(rawQuery).slice(0, MAX_USERNAME_LENGTH);
  if (!prefix) return { results: [] };
  return memo.remember(`search:${prefix}:${limit}`, SEARCH_TTL_MS, async () => {
    const end = prefix + '';
    const [usersSnap, levelsSnap] = await Promise.all([
      db().collection(C.USERS).orderBy('usernameLower').startAt(prefix).endAt(end).limit(limit).select('username', 'usernameLower').get(),
      db().collection(C.LEVELS).orderBy(firestore.FieldPath.documentId()).startAt(prefix).endAt(end).limit(limit).select('username', 'xp').get()
    ]);

    const seen = new Set();
    const results = [];
    usersSnap.forEach((d) => {
      const name = d.get('username');
      const lower = d.get('usernameLower');
      if (!name || seen.has(lower)) return;
      seen.add(lower);
      results.push({ value: name, label: name, registered: true });
    });
    levelsSnap.forEach((d) => {
      if (seen.has(d.id) || !(num(d.get('xp')) > 0)) return;
      seen.add(d.id);
      const nick = d.get('username');
      results.push({ value: d.id, label: nick && nick.toLowerCase() !== d.id ? `${nick} (@${d.id})` : d.id, registered: false });
    });
    return { results: results.slice(0, limit) };
  });
}

module.exports = { getProfile, getStats, searchUsernames, resolvePlayer, normalizeUsername, _internal: { mostPlayed, baseFields } };
