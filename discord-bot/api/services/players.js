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
// المربوط. كل جولة تنحسب لمفتاح واحد فقط (تيك توك لو مربوط، وإلا يوزر الموقع)،
// فالدمج: اللفل/XP = الأعلى (مثل ما يعرض الموقع)، والجولات وعدّاد الألعاب =
// مجموع الاثنين، والإطارات = اتحادهم. Realtime Database (levels/{key}) تُدمج
// كاحتياط مثل framesMergeLevelDocs بالموقع: Firestore أولاً وRTDB يكمّل.

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const { errors } = require('../errors');
const { progressFromXp, levelsKey, isValidDocId } = require('./levels');
const { gameName } = require('./games');
const { toIso } = require('./time');
const memo = require('./memo');
const winners = require('./winners');
const { describeFrames } = require('./frames');
const { earnedAchievements } = require('./achievements');

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
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
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

const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);
const union = (...lists) => [...new Set(lists.flatMap(arr))];

// التفعيل بين مصدرين: الأحدث ختماً (activeFrameAt) يفوز — نفس منطق الموقع
function pickActiveFrame(primary, secondary) {
  const pa = Number(primary && primary.activeFrameAt) || 0;
  const sa = Number(secondary && secondary.activeFrameAt) || 0;
  if (pa || sa) return (pa >= sa ? primary && primary.activeFrame : secondary && secondary.activeFrame) || '';
  return (primary && primary.activeFrame) || (secondary && secondary.activeFrame) || '';
}

async function readLevelDoc(key) {
  if (!isValidDocId(key)) return null;
  const [fsSnap, rt] = await Promise.all([db().collection(C.LEVELS).doc(key).get(), readRtdbLevel(key)]);
  const fs = fsSnap.exists ? fsSnap.data() : null;
  if (!fs && !rt) return null;
  return {
    key,
    ...(rt || {}),
    ...(fs || {}),
    // الملكية تراكمية: اتحاد المصدرين (إطار انكتب بـRTDB كفولباك ما يضيع)
    ownedFrames: union(rt && rt.ownedFrames, fs && fs.ownedFrames),
    levelFrames: union(rt && rt.levelFrames, fs && fs.levelFrames),
    activeFrame: pickActiveFrame(fs, rt),
    activeFrameAt: Math.max(Number(fs && fs.activeFrameAt) || 0, Number(rt && rt.activeFrameAt) || 0)
  };
}

function sumMaps(...maps) {
  const out = {};
  for (const m of maps) for (const [k, v] of Object.entries(m || {})) out[k] = (out[k] || 0) + num(v);
  return out;
}

// يدمج سجل يوزر الموقع مع سجل تيك توك المربوط لسجل واحد يمثّل اللاعب
function mergeLevelDocs(siteDoc, streamDoc) {
  const docs = [siteDoc, streamDoc].filter(Boolean);
  if (!docs.length) return null;
  if (docs.length === 1) return { ...docs[0], gamesPlayCount: sumMaps(docs[0].gamesPlayCount) };
  const top = num(siteDoc.xp) >= num(streamDoc.xp) ? siteDoc : streamDoc;
  const log = [...arr2(siteDoc.activityLog), ...arr2(streamDoc.activityLog)].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  const lastAt = (d) => (d.lastGamePlayedAt && d.lastGamePlayedAt.toMillis ? d.lastGamePlayedAt.toMillis() : 0);
  const latest = lastAt(siteDoc) >= lastAt(streamDoc) ? siteDoc : streamDoc;
  return {
    ...siteDoc,
    ...streamDoc, // نفس أولوية الموقع: حقول سجل البث تغلب
    key: streamDoc.key,
    xp: num(top.xp),
    roundsPlayed: num(siteDoc.roundsPlayed) + num(streamDoc.roundsPlayed),
    gamesPlayCount: sumMaps(siteDoc.gamesPlayCount, streamDoc.gamesPlayCount),
    activityLog: log.slice(0, 15),
    lastGamePlayed: latest.lastGamePlayed || siteDoc.lastGamePlayed || streamDoc.lastGamePlayed || null,
    ownedFrames: union(siteDoc.ownedFrames, streamDoc.ownedFrames),
    levelFrames: union(siteDoc.levelFrames, streamDoc.levelFrames),
    activeFrame: pickActiveFrame(streamDoc, siteDoc),
    avatar: streamDoc.avatar || siteDoc.avatar || '',
    isStreamer: !!(siteDoc.isStreamer || streamDoc.isStreamer),
    isViewer: !!(siteDoc.isViewer || streamDoc.isViewer),
    createdAt: [siteDoc.createdAt, streamDoc.createdAt].filter((t) => t && t.toMillis).sort((a, b) => a.toMillis() - b.toMillis())[0] || null
  };
}
const arr2 = (v) => (Array.isArray(v) ? v.filter((x) => x && x.game) : []);

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
    const [siteDoc, streamDoc] = await Promise.all([readLevelDoc(siteKey), tiktokKey && tiktokKey !== siteKey ? readLevelDoc(tiktokKey) : null]);
    return { registered: true, uid: account.uid, user: account.user, level: mergeLevelDocs(siteDoc, streamDoc), keys };
  }

  // لاعب بث بدون حساب بالموقع (له سجل لفلات فقط)
  const key = levelsKey(lower);
  const level = await readLevelDoc(key);
  if (level && (num(level.xp) > 0 || num(level.roundsPlayed) > 0)) {
    return { registered: false, uid: null, user: null, level: mergeLevelDocs(level, null), keys: [key] };
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

async function friendsCount(uid) {
  if (!uid) return null;
  try {
    const agg = await db().collection('friendships').where('uids', 'array-contains', uid).count().get();
    return agg.data().count;
  } catch (_) {
    return null;
  }
}

function roleLabels(ctx) {
  const roles = [];
  if (ctx.registered) roles.push('حساب مسجّل');
  if (ctx.level && ctx.level.isStreamer) roles.push('ستريمر');
  if (ctx.level && ctx.level.isViewer) roles.push('لاعب بث');
  return roles;
}

// الإطارات المملوكة + المفعّل حالياً (بأسمائها)
async function framesInfo(ctx) {
  const owned = arr(ctx.level && ctx.level.ownedFrames);
  const described = await describeFrames(owned);
  const activeId = ctx.level && ctx.level.activeFrame;
  const active = activeId && owned.includes(activeId) ? described.find((f) => f.id === activeId) || null : null;
  return { count: owned.length, names: described.map((f) => f.name), active };
}

function achievementsFor(ctx, base, framesCount) {
  return earnedAchievements({
    level: base.level,
    roundsPlayed: base.roundsPlayed,
    soloWinCount: num(ctx.user && ctx.user.soloWinCount),
    onlineWinCount: num(ctx.user && ctx.user.onlineWinCount),
    ownedFramesCount: framesCount,
    gamesVariety: Object.keys((ctx.level && ctx.level.gamesPlayCount) || {}).length
  });
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
  const base = baseFields(ctx, profileUrl);
  const [avatarUrl, frames, friends] = await Promise.all([usableAvatar(avatarCandidate(ctx)), framesInfo(ctx), friendsCount(ctx.uid)]);
  const pinned = arr(ctx.user && ctx.user.pinnedGames).slice(0, 10).map((tag) => gameName(tag));
  return {
    ...base,
    avatarUrl,
    joinedAt: toIso((ctx.user && ctx.user.createdAt) || (ctx.level && ctx.level.createdAt)),
    roles: roleLabels(ctx),
    frames,
    achievements: achievementsFor(ctx, base, frames.count),
    favoriteGames: pinned,
    friends,
    lastGame: ctx.level && ctx.level.lastGamePlayed ? gameName(ctx.level.lastGamePlayed) : null
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

  const [avatarUrl, stream, rank, frames] = await Promise.all([
    usableAvatar(avatarCandidate(ctx)),
    winners.streamSummaryFor(ctx.keys).catch(() => ({ wins: 0, topStreamer: null, streamersCount: 0, topGame: null, asStreamer: null })),
    globalRank(base.xp),
    framesInfo(ctx)
  ]);

  const solo = num(ctx.user && ctx.user.soloWinCount);
  const online = num(ctx.user && ctx.user.onlineWinCount);
  const totalWins = solo + online + stream.wins;
  // الموقع ما يسجّل "خسارة" صريحة: كل جولة لعبها اللاعب بدون فوز = هزيمة.
  // لو الجولات المسجّلة أقل من الفوزات (بيانات قديمة قبل نظام الجولات) ما
  // نقدر نحسب هزائم/معدل بدقة → null ويعرضها البوت "—" بدل رقم غلط.
  const rounds = base.roundsPlayed;
  const reliable = rounds > 0 && rounds >= totalWins;
  const losses = reliable ? rounds - totalWins : null;
  const winRate = reliable ? Math.round((totalWins / rounds) * 1000) / 10 : null;

  const recentGames = (Array.isArray(ctx.level && ctx.level.activityLog) ? ctx.level.activityLog : [])
    .slice(0, 5)
    .map((a) => ({ tag: a.game, name: gameName(a.game), at: Number(a.at) ? new Date(Number(a.at)).toISOString() : null }));

  return {
    ...base,
    avatarUrl,
    wins: { total: totalWins, solo, online, stream: stream.wins },
    losses,
    winRate,
    // أكثر لعبة: من عدّاد جولات الموقع، وإلا (لاعب بث قديم) من فوزاته بالبثوث
    mostPlayedGame:
      mostPlayed(ctx.level && ctx.level.gamesPlayCount) ||
      (stream.topGame ? { tag: null, name: stream.topGame.name, count: stream.topGame.count, source: 'wins' } : null),
    topStreamer: stream.topStreamer,
    streamersCount: stream.streamersCount,
    asStreamer: stream.asStreamer,
    points: num(ctx.user && ctx.user.onlinePoints),
    framesCount: frames.count,
    achievements: achievementsFor(ctx, base, frames.count),
    gamesVariety: Object.keys((ctx.level && ctx.level.gamesPlayCount) || {}).length,
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
