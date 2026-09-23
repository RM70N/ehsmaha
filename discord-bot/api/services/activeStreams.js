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
const TTL_MS = 10 * 1000;

const ms = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);

async function getActiveStreams() {
  return memo.remember('activeStreams', TTL_MS, async () => {
    const db = firestore.db();
    const snap = await db.collection('activeStreamers').get();
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.username);

    const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))];
    const presence = new Map();
    if (uids.length) {
      const refs = uids.map((uid) => db.collection('presence').doc(uid));
      const docs = await db.getAll(...refs);
      docs.forEach((d) => presence.set(d.id, d.exists ? ms(d.get('lastSeen')) : 0));
    }

    const now = Date.now();
    const byStreamer = new Map(); // platform:username -> أحدث جلسة
    for (const r of rows) {
      const updatedAt = ms(r.updatedAt);
      if (!updatedAt || now - updatedAt > MAX_AGE_MS) continue;
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

module.exports = { getActiveStreams };
