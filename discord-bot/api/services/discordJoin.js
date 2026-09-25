'use strict';

// "الانضمام عبر ديسكورد" — الجسر بين الموقع وبوت ديسكورد (البوت ما يتصل
// بـFirebase مباشرة، كل شي يمر من هنا مثل باقي خدماته).
//
// التخزين: Firestore أولاً، و**Realtime Database تلقائياً** لو Firestore فشل
// (انتهت الحصة / ما رد). الموقع يسوي نفس الشي، فنقرا المخزنين وندمجهم.
//
//   config/discordChannels                      ← البوت (قائمة رومات السيرفر الرسمي)
//     { guildId, guildName, channels: [{ id, name }], updatedAt }
//   discordSessions/{sessionId}                 ← الموقع (لحظة فتح لعبة بروم ديسكورد)
//     { streamerId, streamerUsername, guildId, channelId, keyword, keywords[], gameId,
//       status: 'active'|'ended', createdAt, endedAt? }
//   discordSessions/{sessionId}/participants/{discordUserId}   ← البوت (عبر هذي الخدمة)
//     { username, displayName, avatarUrl, keyword, joinedAt }
//   (RTDB: نفس المسارات — participants عقدة داخل الجلسة)
//
// الجلسات النشطة من مستمعين لحظيين (Firestore + RTDB) — البوت يسأل كل ثوانٍ
// والرد من الذاكرة، فما فيه قراءات Firestore مع كل سؤال.

const firestore = require('../../database/firestore');
const memo = require('./memo');
const { errors } = require('../errors');
const logger = require('../../utils/logger').createLogger('api');

const MAX_AGE_MS = 6 * 60 * 60 * 1000; // جلسة أقدم من 6 ساعات = منتهية (متصفح انقفل بدون إنهاء)
const LISTENER_RETRY_MS = 60 * 1000;
const FALLBACK_TTL_MS = 15 * 1000;
const FS_TIMEOUT_MS = 8 * 1000;
const RTDB_TIMEOUT_MS = 8 * 1000;
const RTDB_SESSIONS = 'discordSessions';

function withTimeout(promise, ms, code) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => reject(Object.assign(new Error('المخزن ما رد'), { code })), ms);
    })
  ]).finally(() => clearTimeout(t));
}
const fsTimeout = (p) => withTimeout(p, FS_TIMEOUT_MS, 'FIRESTORE_TIMEOUT');
const rtdbTimeout = (p) => withTimeout(p, RTDB_TIMEOUT_MS, 'RTDB_TIMEOUT');

const toMs = (v) => (v && typeof v.toMillis === 'function' ? v.toMillis() : typeof v === 'number' ? v : 0);
const cleanStr = (v, max = 100) => String(v == null ? '' : v).trim().slice(0, max);

function normalizeSession(id, d, source) {
  if (!d || typeof d !== 'object') return null;
  const keywords = (Array.isArray(d.keywords) ? d.keywords : [d.keyword])
    .map((k) => cleanStr(k, 60))
    .filter(Boolean)
    .slice(0, 5);
  const channelId = cleanStr(d.channelId, 30);
  if (!/^\d{17,20}$/.test(channelId) || !keywords.length) return null;
  return {
    sessionId: id,
    source,
    streamerId: cleanStr(d.streamerId, 128) || null,
    guildId: cleanStr(d.guildId, 30) || null,
    channelId,
    keywords,
    gameId: cleanStr(d.gameId, 40) || null,
    status: d.status === 'active' ? 'active' : 'ended',
    createdAt: toMs(d.createdAt)
  };
}

// ---------------- المستمعون اللحظيون ----------------
const live = {
  fs: { unsubscribe: null, ready: false, rows: new Map(), lastErrorAt: 0 },
  rtdb: { ref: null, handler: null, ready: false, rows: new Map(), lastErrorAt: 0 }
};

function ensureFsListener() {
  const L = live.fs;
  if (L.unsubscribe || Date.now() - L.lastErrorAt < LISTENER_RETRY_MS) return;
  try {
    L.unsubscribe = firestore
      .db()
      .collection('discordSessions')
      .where('status', '==', 'active')
      .onSnapshot(
        (snap) => {
          L.rows = new Map(snap.docs.map((doc) => [doc.id, normalizeSession(doc.id, doc.data(), 'firestore')]).filter(([, s]) => s));
          L.ready = true;
        },
        (err) => {
          logger.warn('ديسكورد-انضمام: مستمع Firestore توقف (نكمل على RTDB)', { code: err && err.code });
          L.unsubscribe = null;
          L.ready = false;
          L.lastErrorAt = Date.now();
        }
      );
  } catch (_) {
    L.unsubscribe = null;
    L.lastErrorAt = Date.now();
  }
}

function ensureRtdbListener() {
  const L = live.rtdb;
  const rtdb = firestore.rtdb();
  if (!rtdb || L.ref || Date.now() - L.lastErrorAt < LISTENER_RETRY_MS) return;
  try {
    L.ref = rtdb.ref(RTDB_SESSIONS).orderByChild('status').equalTo('active');
    L.handler = (snap) => {
      const val = snap.val() || {};
      L.rows = new Map(Object.entries(val).map(([id, d]) => [id, normalizeSession(id, d, 'rtdb')]).filter(([, s]) => s));
      L.ready = true;
    };
    L.ref.on('value', L.handler, (err) => {
      logger.warn('ديسكورد-انضمام: مستمع RTDB توقف', { code: err && err.code });
      L.ref = null;
      L.ready = false;
      L.lastErrorAt = Date.now();
    });
  } catch (_) {
    L.ref = null;
    L.lastErrorAt = Date.now();
  }
}

// احتياط لو المستمع مو جاهز: قراءة مباشرة (مخزّنة 15 ثانية)
async function fsFallbackRows() {
  return memo.remember('discordSessions:fs', FALLBACK_TTL_MS, async () => {
    const snap = await fsTimeout(firestore.db().collection('discordSessions').where('status', '==', 'active').get());
    return snap.docs.map((d) => normalizeSession(d.id, d.data(), 'firestore')).filter(Boolean);
  }).catch(() => []);
}
async function rtdbFallbackRows() {
  const rtdb = firestore.rtdb();
  if (!rtdb) return [];
  return memo.remember('discordSessions:rtdb', FALLBACK_TTL_MS, async () => {
    const snap = await rtdbTimeout(rtdb.ref(RTDB_SESSIONS).orderByChild('status').equalTo('active').get());
    return Object.entries(snap.val() || {}).map(([id, d]) => normalizeSession(id, d, 'rtdb')).filter(Boolean);
  }).catch(() => []);
}

// صاحب الجلسة لسا بالموقع؟ (نفس نبضة presence اللي تستخدمها /بث) — لو القراءة
// فشلت (حصة Firestore) نعتبره موجود ونعتمد على مهلة الـ6 ساعات.
async function aliveStreamers(uids) {
  if (!uids.length) return null;
  try {
    const { presenceFor } = require('./activeStreams');
    return await presenceFor(uids);
  } catch {
    return null;
  }
}
const PRESENCE_WINDOW_MS = 3 * 60 * 1000;

/**
 * الجلسات النشطة الآن (Firestore + RTDB مدموجة).
 * @returns {Promise<object[]>}
 */
async function getActiveSessions({ now = Date.now() } = {}) {
  ensureFsListener();
  ensureRtdbListener();
  const fsRows = live.fs.ready ? [...live.fs.rows.values()] : await fsFallbackRows();
  const rtRows = live.rtdb.ready ? [...live.rtdb.rows.values()] : await rtdbFallbackRows();
  const byId = new Map();
  for (const s of [...rtRows, ...fsRows]) if (s && s.status === 'active') byId.set(s.sessionId, s);
  let rows = [...byId.values()].filter((s) => s.createdAt && now - s.createdAt <= MAX_AGE_MS);
  const presence = await aliveStreamers([...new Set(rows.map((s) => s.streamerId).filter(Boolean))]);
  if (presence) {
    rows = rows.filter((s) => {
      if (!s.streamerId || !presence.has(s.streamerId)) return true; // ما نعرف — نعتمد على المهلة
      const seen = presence.get(s.streamerId);
      return !seen || now - seen <= PRESENCE_WINDOW_MS || now - s.createdAt <= PRESENCE_WINDOW_MS;
    });
  }
  // جلسة وحدة لكل روم: الأحدث تغلب
  const byChannel = new Map();
  for (const s of rows.sort((a, b) => a.createdAt - b.createdAt)) byChannel.set(s.channelId, s);
  return [...byChannel.values()];
}

async function findActiveSession(sessionId) {
  const rows = await getActiveSessions();
  return rows.find((s) => s.sessionId === sessionId) || null;
}

// ---------------- المشاركون ----------------
/**
 * البوت يسجّل عضو ديسكورد انضم بالكلمة المفتاحية.
 * يكتب بنفس مخزن الجلسة، ولو فشل ينتقل للثاني تلقائياً.
 * @returns {Promise<{stored:string, duplicate:boolean}>}
 */
async function addParticipant(sessionId, discordUserId, data = {}) {
  const sid = cleanStr(sessionId, 200);
  const uid = cleanStr(discordUserId, 30);
  if (!sid || !/^[\w-]+$/.test(sid)) throw errors.invalidInput('sessionId غير صالح');
  if (!/^\d{17,20}$/.test(uid)) throw errors.invalidInput('معرّف ديسكورد غير صالح');
  const session = await findActiveSession(sid);
  if (!session) throw errors.conflict('SESSION_NOT_ACTIVE', 'الجلسة انتهت أو غير موجودة');

  const doc = {
    username: cleanStr(data.username, 64) || uid,
    displayName: cleanStr(data.displayName, 64) || cleanStr(data.username, 64) || uid,
    avatarUrl: /^https:\/\//.test(String(data.avatarUrl || '')) ? cleanStr(data.avatarUrl, 400) : '',
    keyword: cleanStr(data.keyword, 60) || session.keywords[0]
  };

  const writeFs = async () => {
    const ref = firestore.db().collection('discordSessions').doc(sid).collection('participants').doc(uid);
    try {
      await fsTimeout(ref.create({ ...doc, joinedAt: firestore.FieldValue.serverTimestamp() }));
      return { stored: 'firestore', duplicate: false };
    } catch (err) {
      if (err && (err.code === 6 || err.code === 'already-exists')) return { stored: 'firestore', duplicate: true };
      throw err;
    }
  };
  const writeRtdb = async () => {
    const rtdb = firestore.rtdb();
    if (!rtdb) throw Object.assign(new Error('RTDB غير مفعّل'), { code: 'RTDB_DISABLED' });
    const ref = rtdb.ref(`${RTDB_SESSIONS}/${sid}/participants/${uid}`);
    const r = await rtdbTimeout(ref.transaction((cur) => (cur ? undefined : { ...doc, joinedAt: Date.now() })));
    return { stored: 'rtdb', duplicate: !r.committed };
  };

  const order = session.source === 'rtdb' ? [writeRtdb, writeFs] : [writeFs, writeRtdb];
  let lastErr = null;
  for (const write of order) {
    try {
      return await write();
    } catch (err) {
      lastErr = err;
      logger.warn('ديسكورد-انضمام: تعذّرت كتابة المشارك — نجرب المخزن الثاني', { sessionId: sid, code: err && err.code });
    }
  }
  throw lastErr || new Error('تعذّر حفظ المشارك');
}

// ---------------- قائمة الرومات ----------------
/**
 * البوت يحدّث قائمة الرومات النصية للسيرفر الرسمي — نكتبها بالمخزنين
 * (نسخة RTDB دائماً، عشان الموقع يلقاها حتى لو Firestore خلصت حصته).
 */
async function setChannels({ guildId, guildName, channels }) {
  const gid = cleanStr(guildId, 30);
  if (!/^\d{17,20}$/.test(gid)) throw errors.invalidInput('guildId غير صالح');
  const list = (Array.isArray(channels) ? channels : [])
    .map((c) => ({ id: cleanStr(c && c.id, 30), name: cleanStr(c && c.name, 100) }))
    .filter((c) => /^\d{17,20}$/.test(c.id) && c.name)
    .slice(0, 500);
  const payload = { guildId: gid, guildName: cleanStr(guildName, 100), channels: list };
  const results = await Promise.allSettled([
    fsTimeout(firestore.db().collection('config').doc('discordChannels').set({ ...payload, updatedAt: firestore.FieldValue.serverTimestamp() })),
    firestore.rtdb() ? rtdbTimeout(firestore.rtdb().ref('config/discordChannels').set({ ...payload, updatedAt: Date.now() })) : Promise.reject(new Error('no rtdb'))
  ]);
  const stored = [];
  if (results[0].status === 'fulfilled') stored.push('firestore');
  if (results[1].status === 'fulfilled') stored.push('rtdb');
  if (!stored.length) throw results[0].reason || new Error('تعذّر حفظ قائمة الرومات');
  return { stored, count: list.length };
}

function stopListeners() {
  if (live.fs.unsubscribe) live.fs.unsubscribe();
  live.fs.unsubscribe = null;
  live.fs.ready = false;
  if (live.rtdb.ref) live.rtdb.ref.off('value', live.rtdb.handler);
  live.rtdb.ref = null;
  live.rtdb.ready = false;
}

module.exports = { getActiveSessions, addParticipant, setChannels, stopListeners, _internal: { normalizeSession, live, MAX_AGE_MS } };
