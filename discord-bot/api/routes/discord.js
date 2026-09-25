'use strict';

// كل مسارات /api/discord — كلها للبوت فقط ومحمية بـx-api-key.
//
//   GET /profile-by-username/:username
//   GET /stats-by-username/:username
//   GET /search-usernames?q=...&limit=20     (اقتراحات Autocomplete)
//   GET /leaderboard?period=global|weekly&limit=10
//   GET /winners?streamer=...&limit=50           (لوحة الفائزين — كل الستريمرز أو ستريمر محدد)
//   GET /winners/streamers?q=...                 (اقتراحات أسماء الستريمرز)
//   GET /active-streams                           (البثوث النشطة الآن — مزامنة /بث بالبوت)
//   POST /bot-state/claim · PUT /bot-state        (نسخة احتياطية دائمة لقاعدة بيانات البوت)
//   GET /join/sessions · PUT /join/channels · POST /join/sessions/:id/participants
//                                                (الانضمام عبر ديسكورد لألعاب الموقع)
//   GET /events
//   GET /admin/stats
//
// اليوزرنيم يوصل مشفّراً بـencodeURIComponent (يدعم العربي وأي رموز)،
// وExpress يفك تشفيره تلقائياً بـreq.params. Express 5 يمرر أخطاء async تلقائياً.

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { requireApiKey } = require('../middleware/auth');
const { errors } = require('../errors');
const players = require('../services/players');
const leaderboard = require('../services/leaderboard');
const events = require('../services/events');
const winners = require('../services/winners');
const activeStreams = require('../services/activeStreams');
const admin = require('../services/admin');
const botState = require('../services/botState');
const discordJoin = require('../services/discordJoin');

const ok = (res, data, status = 200) => res.status(status).json({ ok: true, data });

function usernameParam(req) {
  const value = String(req.params.username || '');
  if (!value.trim()) throw errors.invalidInput('اكتب اليوزرنيم');
  if (value.length > 100) throw errors.invalidInput('اليوزرنيم طويل جداً');
  return value;
}

function createDiscordRouter(config) {
  const router = express.Router();
  router.use(requireApiKey(config.apiKey));
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 1500,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res, next) => next(errors.rateLimited('ضغط كبير على الـAPI'))
    })
  );

  router.get('/profile-by-username/:username', async (req, res) => {
    ok(res, await players.getProfile(usernameParam(req), { profileUrl: config.profileUrl }));
  });

  router.get('/stats-by-username/:username', async (req, res) => {
    ok(res, await players.getStats(usernameParam(req), { profileUrl: config.profileUrl }));
  });

  router.get('/search-usernames', async (req, res) => {
    const q = String(req.query.q || '').slice(0, 100);
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(25, Math.max(1, rawLimit)) : 20;
    ok(res, await players.searchUsernames(q, limit));
  });

  router.get('/leaderboard', async (req, res) => {
    const period = req.query.period === 'weekly' ? 'weekly' : 'global';
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 10;
    ok(res, await leaderboard.getLeaderboard({ period, limit }, config));
  });

  router.get('/winners', async (req, res) => {
    const streamer = String(req.query.streamer || '').trim().slice(0, 100);
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : 50;
    ok(res, await winners.getWinners({ streamer: streamer || null, limit }));
  });

  router.get('/winners/streamers', async (req, res) => {
    ok(res, await winners.searchStreamers(String(req.query.q || '').slice(0, 100), 20));
  });

  router.get('/active-streams', async (req, res) => {
    ok(res, await activeStreams.getActiveStreams());
  });

  router.get('/events', async (req, res) => {
    ok(res, await events.getActiveEvents());
  });

  router.get('/admin/stats', async (req, res) => {
    ok(res, await admin.getAdminStats());
  });

  // النسخة الاحتياطية الدائمة لقاعدة بيانات البوت (يستخدمها البوت فقط)
  const stateBody = express.json({ limit: '12mb' });
  const bootAtOf = (body) => {
    const n = Number(body && body.bootAt);
    if (!Number.isSafeInteger(n) || n <= 0) throw errors.invalidInput('bootAt غير صالح');
    return n;
  };
  router.post('/bot-state/claim', stateBody, async (req, res) => {
    ok(res, await botState.claim(bootAtOf(req.body)));
  });
  router.put('/bot-state', stateBody, async (req, res) => {
    const { data, sha256 } = req.body || {};
    if (typeof data !== 'string' || typeof sha256 !== 'string') throw errors.invalidInput('data و sha256 مطلوبة');
    ok(res, await botState.save({ bootAt: bootAtOf(req.body), data, sha: sha256 }));
  });

  // الانضمام عبر ديسكورد: جلسات الألعاب النشطة (من الموقع) ← البوت، والمنضمين ← الموقع
  const joinBody = express.json({ limit: '256kb' });
  router.get('/join/sessions', async (req, res) => {
    ok(res, await discordJoin.getActiveSessions());
  });
  router.put('/join/channels', joinBody, async (req, res) => {
    ok(res, await discordJoin.setChannels(req.body || {}));
  });
  router.post('/join/sessions/:sessionId/participants', joinBody, async (req, res) => {
    const b = req.body || {};
    ok(res, await discordJoin.addParticipant(req.params.sessionId, b.discordUserId, b), 201);
  });

  return router;
}

module.exports = { createDiscordRouter };
