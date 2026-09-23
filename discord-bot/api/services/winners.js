'use strict';

// "لوحة الفائزين" — نفس فكرة صفحة الموقع (scoreBuildRanking):
//   leaderboards/{streamer} = { [viewerId]: { nickname, wins, games: { اسم اللعبة: فوزات } } }
//   • كل الستريمرز: مجموع فوزات كل متابع عبر كل القوائم.
//   • ستريمر محدد: قائمة ذاك الستريمر فقط.
// وكمان منها: فوزات البث لكل لاعب، وأكثر ستريمر فاز عنده (للإحصائيات).
//
// قراءة التجميعة كاملة مكلفة نسبياً، فتنقرأ مرة كل دقيقتين كحد أقصى وتُشارك
// بين كل الطلبات (مع منع الطلبات المتزامنة المكررة).

const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const memo = require('./memo');
const { levelsKey } = require('./levels');

// كل قراءة = مستند لكل ستريمر؛ 10 دقائق توفّر حصة Firestore (الفوزات ما تتغير بالثانية)
const TTL_MS = 10 * 60 * 1000;
const GLOBAL_BUCKET = '__global__'; // فوزات انسجلت بدون ستريمر محدد (بالموقع نفسه)
const num = (v) => Math.max(0, Number(v) || 0);

// اللقطة المعالجة: قوائم الستريمرز + فهرس لكل متابع
function snapshot() {
  return memo.remember('leaderboardsSnapshot', TTL_MS, async () => {
    const snap = await firestore.db().collection(C.LEADERBOARDS).get();
    const streamers = []; // [{ id, key, rows: [{ key, nickname, wins, games }] , totalWins }]
    const viewers = new Map(); // viewerKey -> { nickname, wins, byStreamer: Map<streamerId, wins>, games: {} }

    snap.forEach((doc) => {
      const board = doc.data() || {};
      const rows = [];
      let totalWins = 0;
      for (const [viewerId, entry] of Object.entries(board)) {
        if (!entry || typeof entry !== 'object') continue;
        const key = levelsKey(viewerId);
        if (!key) continue;
        const wins = num(entry.wins);
        const games = entry.games && typeof entry.games === 'object' ? entry.games : {};
        rows.push({ key, nickname: String(entry.nickname || viewerId), wins, games });
        totalWins += wins;

        const v = viewers.get(key) || { nickname: String(entry.nickname || viewerId), wins: 0, byStreamer: new Map(), games: {} };
        v.wins += wins;
        if (doc.id !== GLOBAL_BUCKET && wins > 0) v.byStreamer.set(doc.id, (v.byStreamer.get(doc.id) || 0) + wins);
        for (const [g, c] of Object.entries(games)) v.games[g] = (v.games[g] || 0) + num(c);
        viewers.set(key, v);
      }
      streamers.push({ id: doc.id, key: levelsKey(doc.id), rows, totalWins });
    });
    return { streamers, viewers, generatedAt: new Date().toISOString() };
  });
}

function topGameOf(games) {
  let best = null;
  for (const [name, c] of Object.entries(games || {})) {
    const count = num(c);
    if (count > 0 && (!best || count > best.count)) best = { name, count };
  }
  return best;
}

// ---------- للإحصائيات: بيانات البث للاعب بمفاتيحه (موقع + تيك توك) ----------
async function streamSummaryFor(keys) {
  const snap = await snapshot();
  const byStreamer = new Map();
  const games = {};
  let wins = 0;
  for (const k of keys) {
    const v = snap.viewers.get(k);
    if (!v) continue;
    wins += v.wins;
    for (const [s, w] of v.byStreamer) byStreamer.set(s, (byStreamer.get(s) || 0) + w);
    for (const [g, c] of Object.entries(v.games)) games[g] = (games[g] || 0) + c;
  }
  let topStreamer = null;
  for (const [name, w] of byStreamer) if (!topStreamer || w > topStreamer.wins) topStreamer = { name, wins: w };

  // لو اللاعب نفسه ستريمر: كم متابع فاز ببثه وكم فوز وزّع
  let asStreamer = null;
  const own = snap.streamers.find((s) => s.id !== GLOBAL_BUCKET && keys.includes(s.key));
  if (own && own.rows.length) asStreamer = { name: own.id, players: own.rows.length, wins: own.totalWins };

  return { wins, topStreamer, streamersCount: byStreamer.size, topGame: topGameOf(games), asStreamer };
}

// ---------- لوحة الفائزين ----------
async function getWinners({ streamer, limit }) {
  const snap = await snapshot();
  let rows;
  let scope = 'all';
  let streamerName = null;

  if (streamer) {
    const wanted = levelsKey(streamer);
    const found = snap.streamers.find((s) => s.id !== GLOBAL_BUCKET && s.key === wanted);
    if (!found) return { scope: 'streamer', streamer: streamer, found: false, entries: [], totalPlayers: 0, totalWins: 0, generatedAt: snap.generatedAt };
    scope = 'streamer';
    streamerName = found.id;
    rows = found.rows.map((r) => ({ key: r.key, nickname: r.nickname, wins: r.wins, games: r.games }));
  } else {
    rows = [...snap.viewers.entries()].map(([key, v]) => ({ key, nickname: v.nickname, wins: v.wins, games: v.games }));
  }

  rows = rows.filter((r) => r.wins > 0).sort((a, b) => b.wins - a.wins || a.nickname.localeCompare(b.nickname));
  const totalWins = rows.reduce((s, r) => s + r.wins, 0);
  const entries = rows.slice(0, limit).map((r, i) => ({ rank: i + 1, key: r.key, nickname: r.nickname, wins: r.wins, topGame: topGameOf(r.games) }));

  return {
    scope,
    streamer: streamerName,
    found: true,
    entries,
    totalPlayers: rows.length,
    totalWins,
    streamersCount: snap.streamers.filter((s) => s.id !== GLOBAL_BUCKET && s.rows.length).length,
    generatedAt: snap.generatedAt
  };
}

// اقتراحات أسماء الستريمرز (Autocomplete) — الأكثر فوزات أولاً
async function searchStreamers(q, limit = 20) {
  const snap = await snapshot();
  const prefix = levelsKey(q);
  return {
    results: snap.streamers
      .filter((s) => s.id !== GLOBAL_BUCKET && s.rows.length && (!prefix || s.key.includes(prefix)))
      .sort((a, b) => (prefix ? Number(b.key.startsWith(prefix)) - Number(a.key.startsWith(prefix)) : 0) || b.totalWins - a.totalWins)
      .slice(0, limit)
      .map((s) => ({ value: s.id, label: `${s.id} · ${s.rows.length} لاعب` }))
  };
}

module.exports = { snapshot, streamSummaryFor, getWinners, searchStreamers, GLOBAL_BUCKET };
