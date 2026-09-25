'use strict';

// البثوث النشطة الآن على الموقع (مصدر المزامنة الدورية لأمر /بث).
//
// الموقع يكتب activeStreamers/{gameTag} = { username, platform, gameTag, gameName, uid, updatedAt }
// لحظة تشغيل الستريمر أي لعبة (ownerRegisterActiveStreamer)، ويحذفها لما يطلع
// من الصفحة أو يسجّل خروج. ولأن المتصفح ممكن ينهار بدون ما يحذفها، نتحقق من
// presence/{uid}.lastSeen (نبضة كل 90 ثانية طول ما الموقع مفتوح): الجلسة تعتبر
// نشطة فقط لو صاحبها موجود بالموقع خلال آخر 3 دقائق.

const firestore = require('../../database/firestore');
const memo = require('./memo');

const PRESENCE_WINDOW_MS = 3 * 60 * 1000; // نفس SITE_PRESENCE_ONLINE_WINDOW_MS بالموقع
const NO_UID_WINDOW_MS = 15 * 60 * 1000;  // جلسة بدون uid (نادر): نقبلها لو حديثة فقط
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const PLATFORMS = new Set(['tiktok', 'twitch', 'kick', 'youtube']);
// توفير قراءات Firestore (حد الخطة المجانية 50 ألف قراءة باليوم للموقع كامل):
//   • activeStreamers عبر مستمع لحظي (onSnapshot): قراءة وحدة بس لكل تغيير،
//     بدل قراءة المجموعة كاملة مع كل مزامنة.
//   • presence تنقرا فقط للستريمرز الموجودين، ومخزّنة 90 ثانية.
const TTL_MS = 30 * 1000;
const PRESENCE_TTL_MS = 90 * 1000;
const FALLBACK_TTL_MS = 2 * 60 * 1000;
const LISTENER_RETRY_MS = 5 * 60 * 1000;

const ms = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

// ---------------- المستمع اللحظي ----------------
const live = { unsubscribe: null, ready: false, rows: [], lastErrorAt: 0 };

function ensureListener() {
  if (live.unsubscribe || Date.now() - live.lastErrorAt < LISTENER_RETRY_MS) return;
  try {
    live.unsubscribe = firestore.db().collection('activeStreamers').onSnapshot(
      (snap) => {
        live.rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        live.ready = true;
      },
      () => {
        // خطأ (مثلاً تجاوز الحصة): نوقف المستمع ونرجع للقراءة المخزّنة، ونعيد المحاولة بعد 5 دقائق
        live.unsubscribe = null;
        live.ready = false;
        live.lastErrorAt = Date.now();
      }
    );
  } catch (_) {
    live.unsubscribe = null;
    live.lastErrorAt = Date.now();
  }
}

async function streamerRows() {
  ensureListener();
  if (live.ready) return live.rows;
  return memo.remember('activeStreamers:fallback', FALLBACK_TTL_MS, async () => {
    const snap = await firestore.db().collection('activeStreamers').get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  });
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

async function getActiveStreams() {
  return memo.remember('activeStreams', TTL_MS, async () => {
    const now = Date.now();
    const rows = (await streamerRows()).filter((r) => r.username && ms(r.updatedAt) && now - ms(r.updatedAt) <= MAX_AGE_MS);
    const presence = await presenceFor([...new Set(rows.map((r) => r.uid).filter(Boolean))]);

    const byStreamer = new Map(); // platform:username -> أحدث جلسة
    for (const r of rows) {
      const updatedAt = ms(r.updatedAt);
      if (r.uid) {
        if (now - (presence.get(r.uid) || 0) > PRESENCE_WINDOW_MS) continue;
      } else if (now - updatedAt > NO_UID_WINDOW_MS) {
        continue;
      }
      const platform = PLATFORMS.has(String(r.platform || '').toLowerCase()) ? String(r.platform).toLowerCase() : 'tiktok';
      const username = String(r.username).trim().replace(/^@+/, '');
      const key = `${platform}:${username.toLowerCase()}`;
      const prev = byStreamer.get(key);
      if (prev && prev.updatedAt >= updatedAt) continue;
      byStreamer.set(key, {
        updatedAt,
        stream: {
          sessionId: `site:${r.id}:${r.uid || username.toLowerCase()}`.slice(0, 128),
          platform,
          platformUsername: username,
          gameName: r.gameName || r.gameTag || r.id,
          gameId: r.gameTag || r.id,
          startedAt: new Date(updatedAt).toISOString()
        }
      });
    }
    const streams = [...byStreamer.values()].map((v) => v.stream).sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    return { streams, generatedAt: new Date(now).toISOString() };
  });
}

function stopListener() {
  if (live.unsubscribe) live.unsubscribe();
  live.unsubscribe = null;
  live.ready = false;
}

module.exports = { getActiveStreams, stopListener, presenceFor };
