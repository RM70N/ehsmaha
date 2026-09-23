'use strict';

// جلسات البث النشطة على احسمها (لأمر /بث) — بالذاكرة داخل عملية البوت.
//
// مصدران للبيانات:
//   1) Webhook لحظي من الموقع: POST /api/discord/stream-event (web/server.js)
//      { platformUsername, platform, gameName, gameId, startedAt, sessionId }
//      و { sessionId, ended: true } عند الخروج.
//   2) مزامنة دورية احتياطية (كل STREAM_POLL_SECONDS، افتراضياً 30 ثانية):
//      GET /api/discord/active-streams من طبقة الـAPI (تقرأ بيانات الموقع الحقيقية).
//      • جلسة محلية مو موجودة بنتيجة المزامنة → تنحذف (تصحيح تلقائي لأي تعارض)،
//        بعد مهلة سماح قصيرة للجلسات الجديدة جداً (الويب هوك يسبق بيانات الموقع).
//      • جلسة بالمزامنة مو موجودة محلياً → تنضاف (تعويض ويب هوك متأخر/فاشل).
//
// أمان إضافي: كل جلسة لها مؤقت انتهاء (STREAM_MAX_HOURS، افتراضياً 6 ساعات من
// بدايتها) — لو ما وصل حدث "انتهى" أبداً (كراش متصفح/انقطاع)، الجلسة تنحذف
// تلقائياً. المؤقت يُلغى (clearTimeout) لو وصل حدث الانتهاء الحقيقي قبله.

const logger = require('../utils/logger');

const PLATFORMS = Object.freeze(['tiktok', 'twitch', 'kick', 'youtube']);
const NEW_SESSION_GRACE_MS = 60 * 1000;

const sessions = new Map(); // sessionId -> session
let maxAgeMs = 6 * 60 * 60 * 1000;

function configure({ maxHours } = {}) {
  if (maxHours) maxAgeMs = maxHours * 60 * 60 * 1000;
}

// مفتاح الستريمر: منصة + يوزر (بدون @، أحرف صغيرة)
function streamerKey(platform, username) {
  return `${platform}:${String(username || '').trim().replace(/^@+/, '').toLowerCase()}`;
}

function clearTimer(s) {
  if (s && s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
}

function remove(sessionId, reason) {
  const s = sessions.get(sessionId);
  if (!s) return false;
  clearTimer(s);
  sessions.delete(sessionId);
  logger.info('انتهت جلسة بث', { sessionId, streamer: s.platformUsername, platform: s.platform, reason });
  return true;
}

/**
 * يضيف/يحدّث جلسة. يرجّع { ok, reason? }.
 * @param {object} input { sessionId, platform, platformUsername, gameName, gameId?, startedAt? (ms/ISO), source }
 */
function upsert(input) {
  const now = Date.now();
  const startedAt = input.startedAt == null ? now : new Date(input.startedAt).getTime();
  if (!Number.isFinite(startedAt)) return { ok: false, reason: 'INVALID_STARTED_AT' };
  const expiresIn = startedAt + maxAgeMs - now;
  if (expiresIn <= 0) {
    remove(input.sessionId, 'expired-on-arrival');
    return { ok: false, reason: 'TOO_OLD' };
  }

  // ستريمر واحد = جلسة وحدة: لو بدأ لعبة ثانية بجلسة جديدة، القديمة تنشال
  const key = streamerKey(input.platform, input.platformUsername);
  for (const [id, s] of sessions) {
    if (id !== input.sessionId && s.key === key) remove(id, 'replaced-by-new-session');
  }

  const prev = sessions.get(input.sessionId);
  clearTimer(prev);
  const session = {
    sessionId: input.sessionId,
    platform: input.platform,
    platformUsername: String(input.platformUsername).trim().replace(/^@+/, ''),
    gameName: input.gameName || 'لعبة',
    gameId: input.gameId || null,
    startedAt: Math.min(startedAt, now),
    source: input.source || 'webhook',
    receivedAt: prev ? prev.receivedAt : now,
    key,
    timer: null
  };
  // مؤقت الانتهاء التلقائي (أمان ضد الجلسات العالقة)
  session.timer = setTimeout(() => remove(session.sessionId, 'auto-expiry'), Math.min(expiresIn, 2 ** 31 - 1));
  if (session.timer && typeof session.timer.unref === 'function') session.timer.unref();
  sessions.set(session.sessionId, session);
  if (!prev) logger.info('بدأت جلسة بث', { sessionId: session.sessionId, streamer: session.platformUsername, platform: session.platform, game: session.gameName, source: session.source });
  return { ok: true };
}

function end(sessionId) {
  return remove(sessionId, 'ended-event');
}

// الأحدث بداية أولاً
function list() {
  return [...sessions.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map(({ timer, key, ...rest }) => rest);
}

/**
 * مزامنة مع نتيجة GET /active-streams (المصدر الموثوق).
 * @param {Array} remote [{ sessionId, platform, platformUsername, gameName, gameId, startedAt }]
 */
function reconcile(remote) {
  const now = Date.now();
  const remoteByKey = new Map();
  for (const r of remote) {
    if (!r || !PLATFORMS.includes(r.platform) || !r.platformUsername) continue;
    remoteByKey.set(streamerKey(r.platform, r.platformUsername), r);
  }

  let removed = 0;
  let added = 0;
  for (const [id, s] of sessions) {
    if (remoteByKey.has(s.key)) continue;
    // جلسة ويب هوك جديدة جداً: نعطيها فرصة حتى تظهر ببيانات الموقع
    if (s.source === 'webhook' && now - s.receivedAt < NEW_SESSION_GRACE_MS) continue;
    if (remove(id, 'not-in-poll')) removed += 1;
  }

  const localKeys = new Set([...sessions.values()].map((s) => s.key));
  for (const [key, r] of remoteByKey) {
    if (localKeys.has(key)) {
      // جلسة مصدرها المزامنة نفسها: نحدّث اسم اللعبة لو تغيّر
      const local = [...sessions.values()].find((s) => s.key === key);
      if (local && local.source === 'poll' && r.gameName && local.gameName !== r.gameName) local.gameName = r.gameName;
      continue;
    }
    const res = upsert({ ...r, source: 'poll' });
    if (res.ok) added += 1;
  }
  return { removed, added, total: sessions.size };
}

function clearAll() {
  for (const s of sessions.values()) clearTimer(s);
  sessions.clear();
}

// ---------------- المزامنة الدورية ----------------
let pollTimer = null;
let lastPoll = { at: null, ok: null, error: null };

function startPolling(fetchRemote, intervalMs) {
  stopPolling();
  const run = async () => {
    try {
      const data = await fetchRemote();
      const result = reconcile(Array.isArray(data && data.streams) ? data.streams : []);
      lastPoll = { at: Date.now(), ok: true, error: null };
      if (result.added || result.removed) logger.info('مزامنة جلسات البث', result);
    } catch (err) {
      // فشل المزامنة ما يمسح شي — نحتفظ بالحالة الحالية لين تنجح المحاولة الجاية
      lastPoll = { at: Date.now(), ok: false, error: err.code || err.message };
      logger.warn('تعذّرت مزامنة جلسات البث — الحالة الحالية باقية', { code: err.code });
    }
  };
  run();
  pollTimer = setInterval(run, intervalMs);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// ---------------- التحقق من حمولة الويب هوك ----------------
const SESSION_ID_RE = /^[A-Za-z0-9:_.\-]{1,128}$/;

/**
 * يرجّع { ok: true, value } أو { ok: false, error }
 */
function validatePayload(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'جسم الطلب لازم يكون JSON' };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!SESSION_ID_RE.test(sessionId)) return { ok: false, error: 'sessionId غير صالح (1-128 حرف: أحرف إنجليزية/أرقام/:_.-)' };
  if (body.ended === true) return { ok: true, value: { sessionId, ended: true } };

  const platform = typeof body.platform === 'string' ? body.platform.trim().toLowerCase() : '';
  if (!PLATFORMS.includes(platform)) return { ok: false, error: `platform لازم يكون واحد من: ${PLATFORMS.join(', ')}` };
  const platformUsername = typeof body.platformUsername === 'string' ? body.platformUsername.trim().replace(/^@+/, '') : '';
  if (!platformUsername || platformUsername.length > 64) return { ok: false, error: 'platformUsername مطلوب (حتى 64 حرف)' };
  const gameName = typeof body.gameName === 'string' ? body.gameName.trim() : '';
  if (!gameName || gameName.length > 100) return { ok: false, error: 'gameName مطلوب (حتى 100 حرف)' };
  const gameId = body.gameId == null ? null : String(body.gameId).slice(0, 64);
  let startedAt = Date.now();
  if (body.startedAt != null) {
    startedAt = new Date(body.startedAt).getTime();
    if (!Number.isFinite(startedAt)) return { ok: false, error: 'startedAt لازم يكون تاريخ ISO أو رقم مللي ثانية' };
    if (startedAt > Date.now() + 5 * 60 * 1000) return { ok: false, error: 'startedAt بالمستقبل' };
  }
  return { ok: true, value: { sessionId, platform, platformUsername, gameName, gameId, startedAt } };
}

module.exports = {
  PLATFORMS,
  configure,
  upsert,
  end,
  list,
  reconcile,
  clearAll,
  startPolling,
  stopPolling,
  validatePayload,
  lastPoll: () => ({ ...lastPoll }),
  size: () => sessions.size
};
