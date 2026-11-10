'use strict';

// البثوث النشطة الآن — نفس مصدر قائمة "ستريمرز يبثون الآن" بقسم البثوث في لوحة المالك (index.html:
// ownerRenderStreamers) ونفس قواعد دمجها، وهي مصدر أمر /بث بالبوت (لحظياً).
//
// المصدران (الموقع هو اللي يكتبهما، والبوت يقرأ فقط):
//   1) RTDB  fsMirror/activeStreamers/link_<uid> = { username, platform, gameTag:'link', gameName, uid, updatedAtMs }
//      يُكتب **لحظة نجاح ربط اليوزر** (قبل أي لعبة) ويتحدّث باسم اللعبة لما يشغّل لعبة، ويُحذف تلقائياً
//      بـonDisconnect عند إغلاق الصفحة/انقطاع الاتصال أو عند فك الربط ← مصدر موثوق ولحظي بدون حصة قراءات.
//      (نفس قاعدة اللوحة: الصف الأقدم من 12 ساعة يتجاهل.)
//   2) Firestore activeStreamers/{gameTag} = { username, platform, gameTag, gameName, uid, updatedAt }
//      لحظة تشغيل لعبة. المتصفح ممكن ينهار بدون ما يحذفها، فنتحقق من presence/{uid}.lastSeen
//      (نبضة كل 90 ثانية): الجلسة تعتبر نشطة فقط لو صاحبها موجود بالموقع خلال آخر 3 دقائق.
//
// الدمج (مثل اللوحة): ستريمر واحد لكل (منصة + يوزر)؛ اللي عنده لعبة يغلب اللي بدون، وإلا الأحدث.
// ستريمر بدون لعبة = "متصل بالبث" (status: 'linked')، وبلعبة = 'playing'.
//
// اللحظية: مستمعان (Firestore onSnapshot + RTDB on('value')) — أي تغيير يفرّغ الكاش ويُطلق حدث 'change'
// (onChange) فيتحدّث البوت فوراً بدون انتظار مزامنة دورية. وتوفيراً للحصة: presence تنقرا فقط لستريمرز
// Firestore الموجودين ومخزّنة 90 ثانية، وRTDB ما لها حد قراءات.

const EventEmitter = require('node:events');
const firestore = require('../../database/firestore');
const memo = require('./memo');

const PRESENCE_WINDOW_MS = 3 * 60 * 1000; // نفس SITE_PRESENCE_ONLINE_WINDOW_MS بالموقع
const NO_UID_WINDOW_MS = 15 * 60 * 1000; // جلسة Firestore بدون uid (نادر): نقبلها لو حديثة فقط
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // أقصى عمر لصف Firestore
const LINK_STALE_MS = 12 * 60 * 60 * 1000; // قاعدة اللوحة للصفوف المربوطة (RTDB)
const UNVERIFIED_WINDOW_MS = 10 * 60 * 1000; // لو تعذّرت قراءة presence (الحصة): نقبل صفوف Firestore الحديثة فقط
const PLATFORMS = new Set(['tiktok', 'twitch', 'kick', 'youtube']);
const TTL_MS = 30 * 1000;
const PRESENCE_TTL_MS = 90 * 1000;
const FALLBACK_TTL_MS = 2 * 60 * 1000;
const LISTENER_RETRY_MS = 5 * 60 * 1000;
const RTDB_GET_TIMEOUT_MS = 5 * 1000;

const bus = new EventEmitter();
bus.setMaxListeners(50);

const ms = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function changed() {
  memo.invalidate('activeStreams');
  bus.emit('change');
}

/** يسجّل مستمع لأي تغيير بالبثوث (لحظي). يرجّع دالة إلغاء. */
function onChange(cb) {
  bus.on('change', cb);
  return () => bus.off('change', cb);
}

// ---------------- مستمع Firestore (لعبة شغّالة) ----------------
const live = { unsubscribe: null, ready: false, rows: [], lastErrorAt: 0 };

function ensureListener() {
  if (live.unsubscribe || Date.now() - live.lastErrorAt < LISTENER_RETRY_MS) return;
  try {
    live.unsubscribe = firestore.db().collection('activeStreamers').onSnapshot(
      (snap) => {
        live.rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        live.ready = true;
        changed();
      },
      () => {
        // خطأ (مثلاً تجاوز الحصة): نوقف المستمع ونرجع للقراءة المخزّنة، ونعيد المحاولة بعد 5 دقائق
        live.unsubscribe = null;
        live.ready = false;
        live.lastErrorAt = Date.now();
        changed();
      }
    );
  } catch (_) {
    live.unsubscribe = null;
    live.lastErrorAt = Date.now();
  }
}

async function firestoreRows() {
  ensureListener();
  if (live.ready) return live.rows;
  return memo.remember('activeStreamers:fallback', FALLBACK_TTL_MS, async () => {
    const snap = await firestore.db().collection('activeStreamers').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
}

// ---------------- مستمع RTDB (بثّ مربوط) ----------------
const rt = { ref: null, handler: null, ready: false, rows: [], lastErrorAt: 0 };
const RT_PATH = 'fsMirror/activeStreamers';

function toRtRows(val) {
  if (!val || typeof val !== 'object') return [];
  return Object.entries(val)
    .filter(([, r]) => r && typeof r === 'object')
    .map(([id, r]) => ({ id, ...r }));
}

function ensureRtdbListener() {
  if (rt.ref || Date.now() - rt.lastErrorAt < LISTENER_RETRY_MS) return;
  let db = null;
  try {
    db = firestore.rtdb();
  } catch (_) {
    db = null;
  }
  if (!db) return; // Realtime Database غير مفعّلة (ما فيه FIREBASE_DATABASE_URL)
  try {
    const ref = db.ref(RT_PATH);
    const handler = (snap) => {
      rt.rows = toRtRows(snap.val());
      rt.ready = true;
      changed();
    };
    ref.on('value', handler, () => {
      // رفض/إلغاء من الخادم: نوقف ونعيد المحاولة لاحقاً (الاتصال العادي يعيد نفسه تلقائياً بدون خطأ)
      try {
        ref.off('value', handler);
      } catch (_) { /* ما يهم */ }
      rt.ref = null;
      rt.handler = null;
      rt.ready = false;
      rt.rows = [];
      rt.lastErrorAt = Date.now();
      changed();
    });
    rt.ref = ref;
    rt.handler = handler;
  } catch (_) {
    rt.ref = null;
    rt.lastErrorAt = Date.now();
  }
}

const withTimeout = (p, t) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('RTDB timeout'), { code: 'RTDB_TIMEOUT' })), t).unref())]);

async function realtimeRows() {
  ensureRtdbListener();
  if (rt.ready) return rt.rows;
  // المستمع ما جهز بعد (أول طلب) أو متوقف: قراءة وحدة مخزّنة — فشلها ما يوقف باقي المصادر
  let db = null;
  try {
    db = firestore.rtdb();
  } catch (_) {
    db = null;
  }
  if (!db) return [];
  try {
    return await memo.remember('activeStreamers:rtdb', TTL_MS, async () => toRtRows((await withTimeout(db.ref(RT_PATH).get(), RTDB_GET_TIMEOUT_MS)).val()));
  } catch (_) {
    return [];
  }
}

async function presenceFor(uids) {
  if (!uids.length) return new Map(); // ما فيه ستريمرز = صفر قراءات
  const key = 'presence:' + [...uids].sort().join(',');
  const entries = await memo.remember(key, PRESENCE_TTL_MS, async () => {
    const db = firestore.db();
    const docs = await db.getAll(...uids.map((uid) => db.collection('presence').doc(uid)));
    return docs.map((d) => [d.id, d.exists ? ms(d.get('lastSeen')) : 0]);
  });
  return new Map(entries);
}

// ---------------- الدمج (نقي — قابل للاختبار) ----------------
const cleanName = (u) => String(u || '').trim().replace(/^@+/, '');
const platformOf = (p) => (PLATFORMS.has(String(p || '').toLowerCase()) ? String(p).toLowerCase() : 'tiktok');

/**
 * @param {object} p
 * @param {object[]} p.fsRows  صفوف Firestore activeStreamers ({id, username, platform, gameTag, gameName, uid, updatedAt:Timestamp})
 * @param {object[]} p.rtRows  صفوف RTDB fsMirror/activeStreamers ({id, username, platform, gameName, uid, updatedAtMs})
 * @param {Map<string,number>|null} p.presence  uid → lastSeen (ms)، أو null لو تعذّرت القراءة
 * @param {number} p.now
 * @returns {{ streams: object[] }}
 */
function buildStreams({ fsRows = [], rtRows = [], presence = new Map(), now = Date.now() }) {
  const byStreamer = new Map(); // platform:username(lower) -> { t, gameName, stream }
  const consider = ({ username, platform, gameName, gameTag, uid, t, via }) => {
    const user = cleanName(username);
    if (!user || !t) return;
    const plat = platformOf(platform);
    const key = `${plat}:${user.toLowerCase()}`;
    const game = gameName ? String(gameName) : null;
    const item = {
      t,
      hasGame: !!game,
      stream: {
        sessionId: `site:${plat}:${user.toLowerCase()}`.slice(0, 128),
        platform: plat,
        platformUsername: user,
        gameName: game,
        gameId: gameTag && gameTag !== 'link' ? String(gameTag) : null,
        status: game ? 'playing' : 'linked',
        startedAt: new Date(t).toISOString(),
        via
      }
    };
    const ex = byStreamer.get(key);
    if (!ex) return void byStreamer.set(key, item);
    if (item.hasGame && !ex.hasGame) return void byStreamer.set(key, item); // اللي عنده لعبة يغلب
    if (!item.hasGame && ex.hasGame) return;
    if (item.t > ex.t) byStreamer.set(key, item); // وإلا الأحدث
  };

  // 1) بثّ مربوط (RTDB): الصف الأقدم من 12 ساعة يتجاهل (قاعدة اللوحة). يُحذف تلقائياً عند الانقطاع.
  for (const r of rtRows) {
    const t = num(r.updatedAtMs);
    if (t && now - t > LINK_STALE_MS) continue;
    consider({ username: r.username, platform: r.platform, gameName: r.gameName, gameTag: r.gameTag, uid: r.uid, t: t || now, via: 'link' });
  }

  // 2) لعبة شغّالة (Firestore) + تحقق الحضور
  for (const r of fsRows) {
    const t = ms(r.updatedAt);
    if (!r.username || !t || now - t > MAX_AGE_MS) continue;
    if (r.uid) {
      if (presence) {
        if (now - (presence.get(r.uid) || 0) > PRESENCE_WINDOW_MS) continue;
      } else if (now - t > UNVERIFIED_WINDOW_MS) {
        continue; // ما قدرنا نتحقق من الحضور: نقبل الحديث فقط
      }
    } else if (now - t > NO_UID_WINDOW_MS) {
      continue;
    }
    consider({ username: r.username, platform: r.platform, gameName: r.gameName || r.gameTag || r.id, gameTag: r.gameTag || r.id, uid: r.uid, t, via: 'game' });
  }

  const streams = [...byStreamer.values()]
    .sort((a, b) => b.t - a.t)
    .map((v) => v.stream);
  return { streams };
}

async function getActiveStreams() {
  return memo.remember('activeStreams', TTL_MS, async () => {
    const now = Date.now();
    const [rtRows, fsRowsAll] = await Promise.all([realtimeRows(), firestoreRows().catch(() => null)]);
    const fsRows = (fsRowsAll || []).filter((r) => r.username && ms(r.updatedAt) && now - ms(r.updatedAt) <= MAX_AGE_MS);
    let presence = null;
    try {
      presence = await presenceFor([...new Set(fsRows.map((r) => r.uid).filter(Boolean))]);
    } catch (_) {
      presence = null; // حصة Firestore خلصت مثلاً: RTDB يكفي، وصفوف Firestore الحديثة فقط
    }
    // لو تعذّر Firestore بالكامل وRTDB ما فيها شي، نرمي خطأ بدل ما نمسح كل البثوث بصمت (البوت يحتفظ بحالته)
    if (fsRowsAll === null && !rt.ready && !rtRows.length) throw Object.assign(new Error('تعذّر قراءة البثوث'), { code: 'STREAMS_UNAVAILABLE' });
    const { streams } = buildStreams({ fsRows, rtRows, presence, now });
    return { streams, generatedAt: new Date(now).toISOString(), sources: { firestore: live.ready, realtime: rt.ready } };
  });
}

/** يشغّل المستمعين فوراً (بدل انتظار أول طلب) — يُستدعى عند إقلاع البوت */
function start() {
  ensureListener();
  ensureRtdbListener();
}

function stopListener() {
  if (live.unsubscribe) live.unsubscribe();
  live.unsubscribe = null;
  live.ready = false;
  if (rt.ref && rt.handler) {
    try {
      rt.ref.off('value', rt.handler);
    } catch (_) { /* ما يهم */ }
  }
  rt.ref = null;
  rt.handler = null;
  rt.ready = false;
}

module.exports = { getActiveStreams, start, stopListener, onChange, buildStreams, _internal: { live, rt, PRESENCE_WINDOW_MS, LINK_STALE_MS } };
