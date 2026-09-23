'use strict';

// المتصدرين.
//
// • العام: levels مرتبة بالـXP تنازلياً — نفس مصدر صفحة "المستوى" بالموقع.
// • الأسبوعي: الموقع ما يخزن XP أسبوعي، فنحسبه هنا بدقة:
//     1) بداية كل أسبوع (الأحد 00:00 بتوقيت السعودية افتراضياً) ناخذ "لقطة" XP
//        لكل اللاعبين وتنحفظ بـdiscordWeeklyBaselines/{weekKey} (مقسمة chunks).
//     2) XP الأسبوع = XP الحالي − XP باللقطة، لكل من تحدّث سجله هذا الأسبوع
//        (levels.updatedAt >= بداية الأسبوع — الموقع يحدّثه مع كل جولة).
//   لو أول لقطة انأخذت بنص الأسبوع (أول تشغيل للـAPI) نعلّمها partial ونعرض
//   "محسوبة منذ ..." بدل ما نعرض أرقام غير صحيحة.

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const memo = require('./memo');
const { progressFromXp } = require('./levels');

const CHUNK_SIZE = 4000;          // مدخلات لكل مستند chunk (بعيد عن حد 1MB)
const PAGE_SIZE = 1000;           // قراءة levels على صفحات
const PARTIAL_GRACE_MS = 30 * 60 * 1000; // لقطة بعد 30 دقيقة من بداية الأسبوع = جزئية
const BUILD_STALE_MS = 30 * 60 * 1000;   // لقطة عالقة بحالة building (انهار السيرفر أثناءها)
const KEEP_WEEKS = 4;

const db = () => firestore.db();
const num = (v) => Math.max(0, Number(v) || 0);

let logger = console;
function setLogger(l) { logger = l || console; }

// ---------- حساب بداية الأسبوع ----------

// يرجع { weekKey: 'YYYY-MM-DD', start: Date } لبداية الأسبوع الحالي
function currentWeek({ weekStartDay, timezoneOffsetMinutes }, now = new Date()) {
  const offsetMs = timezoneOffsetMinutes * 60 * 1000;
  const local = new Date(now.getTime() + offsetMs); // "الوقت المحلي" مخزن كـUTC
  const daysBack = (local.getUTCDay() - weekStartDay + 7) % 7;
  const localStart = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysBack);
  return { weekKey: new Date(localStart).toISOString().slice(0, 10), start: new Date(localStart - offsetMs) };
}

// ---------- اللقطة الأسبوعية ----------

let baselineMemory = null; // { weekKey, map: Map<key, xp>, takenAt: Date, partial }
let buildPromise = null;

async function readAllLevelsXp() {
  const map = new Map();
  let last = null;
  // select('xp') يقلل حجم البيانات المنقولة؛ الترتيب بالمعرّف للترقيم
  for (;;) {
    let q = db().collection(C.LEVELS).select('xp').orderBy('__name__').limit(PAGE_SIZE);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    snap.forEach((d) => map.set(d.id, num(d.get('xp'))));
    if (snap.size < PAGE_SIZE) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return map;
}

async function loadBaselineFromDb(weekKey) {
  const ref = db().collection(C.DISCORD_WEEKLY_BASELINES).doc(weekKey);
  const meta = await ref.get();
  if (!meta.exists) return { status: 'missing' };
  const m = meta.data();
  if (m.status !== 'ready') {
    const startedMs = m.buildStartedAt && m.buildStartedAt.toMillis ? m.buildStartedAt.toMillis() : 0;
    return { status: Date.now() - startedMs > BUILD_STALE_MS ? 'stale' : 'building' };
  }
  const chunks = await ref.collection('chunks').get();
  const map = new Map();
  chunks.forEach((c) => {
    for (const [k, v] of Object.entries(c.data().entries || {})) map.set(k, num(v));
  });
  return { status: 'ready', baseline: { weekKey, map, takenAt: m.takenAt.toDate(), partial: !!m.partial } };
}

async function buildBaseline(week, { force = false } = {}) {
  const { FieldValue, Timestamp } = firestore;
  const ref = db().collection(C.DISCORD_WEEKLY_BASELINES).doc(week.weekKey);

  // حجز البناء: create() يفشل لو نسخة ثانية بدأت قبلنا (إلا لو اللقطة عالقة → force)
  const claim = { weekKey: week.weekKey, weekStart: Timestamp.fromDate(week.start), status: 'building', buildStartedAt: FieldValue.serverTimestamp() };
  try {
    if (force) await ref.set(claim);
    else await ref.create(claim);
  } catch (err) {
    if (err && (err.code === 6 || err.code === 'already-exists')) return null; // نسخة أخرى تبنيها
    throw err;
  }

  const takenAt = new Date();
  const map = await readAllLevelsXp();

  // حذف أي chunks قديمة (لو إعادة بناء) ثم كتابة الجديدة
  const old = await ref.collection('chunks').get();
  if (!old.empty) {
    const batch = db().batch();
    old.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const entries = [...map.entries()];
  const chunkCount = Math.ceil(entries.length / CHUNK_SIZE);
  for (let i = 0; i < chunkCount; i++) {
    const slice = Object.fromEntries(entries.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    await ref.collection('chunks').doc(String(i)).set({ entries: slice });
  }

  const partial = takenAt.getTime() - week.start.getTime() > PARTIAL_GRACE_MS;
  await ref.set(
    { status: 'ready', takenAt: Timestamp.fromDate(takenAt), partial, entryCount: entries.length, chunkCount },
    { merge: true }
  );
  logger.info('تم أخذ لقطة XP الأسبوعية', { weekKey: week.weekKey, players: entries.length, partial });
  return { weekKey: week.weekKey, map, takenAt, partial };
}

async function cleanupOldBaselines(week) {
  const cutoff = new Date(week.start.getTime() - KEEP_WEEKS * 7 * 86400000).toISOString().slice(0, 10);
  const old = await db().collection(C.DISCORD_WEEKLY_BASELINES).where('weekKey', '<', cutoff).get();
  for (const doc of old.docs) {
    const chunks = await doc.ref.collection('chunks').get();
    const batch = db().batch();
    chunks.docs.forEach((c) => batch.delete(c.ref));
    batch.delete(doc.ref);
    await batch.commit();
  }
}

// يضمن وجود لقطة الأسبوع الحالي بالذاكرة. يُستدعى من job دوري ومن الطلبات.
// يرجع اللقطة أو null لو لسا قيد البناء.
async function ensureBaseline(settings) {
  const week = currentWeek(settings);
  if (baselineMemory && baselineMemory.weekKey === week.weekKey) return baselineMemory;
  if (buildPromise) return buildPromise;

  buildPromise = (async () => {
    try {
      const loaded = await loadBaselineFromDb(week.weekKey);
      let baseline = null;
      if (loaded.status === 'ready') baseline = loaded.baseline;
      else if (loaded.status === 'missing') baseline = await buildBaseline(week);
      else if (loaded.status === 'stale') baseline = await buildBaseline(week, { force: true });
      // building: نسخة أخرى تبنيها الحين — نرجع null ونحاول بالطلب الجاي
      if (baseline) {
        baselineMemory = baseline;
        memo.invalidate('lb:weekly');
        cleanupOldBaselines(week).catch((err) => logger.warn('تعذّر حذف اللقطات القديمة', { error: err }));
      }
      return baseline;
    } finally {
      buildPromise = null;
    }
  })();
  return buildPromise;
}

// ---------- المتصدرين ----------

function toEntry(doc, rank, points) {
  const d = doc.data ? doc.data() : doc;
  const xp = num(d.xp);
  return {
    rank,
    key: doc.id || d.key,
    username: d.username || doc.id || d.key,
    avatarUrl: d.avatar || null,
    points,
    xp,
    level: progressFromXp(xp).level,
    isRegistered: !!d.isRegistered
  };
}

async function globalBoard(limit, settings) {
  return memo.remember(`lb:global:${limit}`, settings.leaderboardCacheSeconds * 1000, async () => {
    const snap = await db()
      .collection(C.LEVELS)
      .orderBy('xp', 'desc')
      .limit(limit)
      .select('xp', 'username', 'avatar', 'isRegistered')
      .get();
    const entries = snap.docs.filter((d) => num(d.get('xp')) > 0).map((d, i) => toEntry(d, i + 1, num(d.get('xp'))));
    return { period: 'global', metric: 'xp', generatedAt: new Date().toISOString(), entries };
  });
}

async function weeklyBoard(limit, settings) {
  const week = currentWeek(settings);
  const baseline = await ensureBaseline(settings);
  if (!baseline) {
    return { period: 'weekly', metric: 'xp', generatedAt: new Date().toISOString(), since: week.start.toISOString(), partial: true, building: true, entries: [] };
  }

  return memo.remember(`lb:weekly:${week.weekKey}:${limit}`, settings.leaderboardCacheSeconds * 1000, async () => {
    const { Timestamp } = firestore;
    const since = baseline.partial ? baseline.takenAt : week.start;
    const snap = await db()
      .collection(C.LEVELS)
      .where('updatedAt', '>=', Timestamp.fromDate(week.start))
      .select('xp', 'username', 'avatar', 'isRegistered')
      .get();

    const rows = [];
    snap.forEach((d) => {
      const gained = num(d.get('xp')) - (baseline.map.get(d.id) || 0);
      if (gained > 0) rows.push({ doc: d, gained });
    });
    rows.sort((a, b) => b.gained - a.gained);
    const entries = rows.slice(0, limit).map((r, i) => toEntry(r.doc, i + 1, r.gained));
    return { period: 'weekly', metric: 'xp', generatedAt: new Date().toISOString(), since: since.toISOString(), partial: baseline.partial, entries };
  });
}

async function getLeaderboard({ period, limit }, settings) {
  return period === 'weekly' ? weeklyBoard(limit, settings) : globalBoard(limit, settings);
}

module.exports = { getLeaderboard, ensureBaseline, currentWeek, setLogger };
