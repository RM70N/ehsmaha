'use strict';

// خادم الويب للراوندات: صفحة الراوند + REST + WebSocket + OAuth. يتركّب على خادم البوت (web/server.js).
//
//   GET  /discord/round/:id | /discord/watch/:id     صفحة الراوند (SPA) — الدخول/اللعب | المشاهدة
//   GET  /discord/rounds-assets/*                    ملفات الواجهة
//   GET  /api/rounds/:id/info                        معلومات عامة (بدون أسرار)
//   GET  /api/session                                هوية الجلسة الحالية
//   POST /api/rounds/:id/(join|leave|start|cancel|kick|act)
//   GET  /auth/discord/login?round=ID  ·  /auth/discord/callback  ·  POST /auth/logout
//   WS   /ws/rounds/:id[?watch=1]                    بث الحالة والأحداث + حركات اللعب
//
// كل فحص صلاحيات يتم هنا ثم بالمدير (الخادم). العميل ما يقرر شي حساس.

const path = require('node:path');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { WebSocketServer } = require('ws');
const logger = require('../../utils/logger');
const { createAuth } = require('./auth');
const { ID_RE } = require('./roundManager');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'web', 'discord-rounds');
const MAX_WS_PER_IP = 40;
const MAX_WS_PER_ROUND = 300;
const WS_MSG_BURST = 30; // رسائل مسموحة بالثانية لكل اتصال
const HEARTBEAT_MS = 25000;

const FAIL = {
  NOT_FOUND: [404, 'هذا الراوند غير موجود أو انتهى.'],
  KICKED: [403, 'تم طردك من هذا الراوند.'],
  STARTED: [409, 'الراوند بدأ — ما يمكن الانضمام الآن.'],
  ENDED: [410, 'هذا الراوند انتهى.'],
  FULL: [409, 'الراوند ممتلئ.'],
  NOT_HOST: [403, 'هذا الإجراء لصاحب الراوند فقط.'],
  NOT_JOINED: [404, 'اللاعب غير موجود في الراوند.'],
  NOT_PLAYER: [403, 'أنت لست لاعباً في هذا الراوند.'],
  NOT_RUNNING: [409, 'الراوند غير جاري.'],
  NOT_ENOUGH: [409, 'ما اكتمل العدد المطلوب للبدء.'],
  ALREADY_STARTED: [409, 'الراوند بدأ بالفعل.'],
  HOST_CANNOT_LEAVE: [409, 'صاحب الراوند لا يخرج — يمكنه إلغاء الراوند.'],
  CANNOT_KICK_HOST: [409, 'لا يمكن طرد صاحب الراوند.'],
  NOT_MEMBER: [403, 'يجب أن تكون عضواً في سيرفر ديسكورد الخاص بهذا الراوند.'],
  UNAUTHENTICATED: [401, 'سجّل الدخول بحساب ديسكورد أولاً.'],
  EXPIRED: [409, 'انتهى وقت هذا الإجراء.'],
  NOT_YOUR_TURN: [403, 'ليس دورك الآن.'],
  BAD_TARGET: [400, 'اختيار غير صالح.'],
  BAD_ACTION: [400, 'إجراء غير معروف.'],
  BAD_BOX: [400, 'مربع غير صالح أو محجوز.'],
  TAKEN: [409, 'هذا المربع محجوز.'],
  SNIPER: [403, 'أنت القناص.'],
  NOT_SNIPER: [403, 'هذا الإجراء للقناص فقط.'],
  BAD_WEAPON: [400, 'سلاح غير معروف.'],
  BAD_COUNT: [400, 'عدد المربعات غير صحيح لهذا السلاح.'],
  NO_AMMO: [409, 'انتهت ذخيرة هذا السلاح.'],
  INTERNAL: [500, 'خطأ داخلي.']
};
const failBody = (reason) => {
  const [status, message] = FAIL[reason] || [400, 'تعذّر تنفيذ الطلب.'];
  return { status, body: { ok: false, error: { code: reason, message } } };
};

/**
 * @param {object} o
 * @param {() => object|null} o.getRuntime   يرجّع { manager, config } أو null قبل الجاهزية
 * @param {{ fetchMember(guildId, userId): Promise<null|{id,name,username,avatarUrl}> }} o.directory
 */
function createRoundsWeb({ getRuntime, directory, authOptions = {}, assetsDir = ASSETS_DIR }) {
  const rt0 = () => getRuntime();
  let authCache = null;
  const getAuth = () => {
    const rt = rt0();
    if (!rt || !rt.configured) return null;
    if (!authCache) {
      const c = rt.config;
      authCache = createAuth({ clientId: c.clientId, clientSecret: c.rounds.clientSecret, publicUrl: c.rounds.publicUrl, sessionSecret: c.rounds.sessionSecret, ...authOptions });
    }
    return authCache;
  };
  const originOf = () => {
    const rt = rt0();
    try {
      return new URL(rt.config.rounds.publicUrl).origin;
    } catch {
      return null;
    }
  };

  // ---------------- منطق مشترك (REST + WebSocket) ----------------
  async function command(session, roundId, kind, body) {
    const rt = rt0();
    if (!rt || !rt.configured) return { status: 503, body: { ok: false, error: { code: 'NOT_READY', message: 'النظام يجهّز…' } } };
    const m = rt.manager;
    const round = m.get(roundId);
    if (!round) return failBody('NOT_FOUND');
    if (!session) return failBody('UNAUTHENTICATED');
    let res;
    switch (kind) {
      case 'join': {
        // الهوية من الجلسة فقط + العضوية من البوت — لا نقبل اسم/معرّف من العميل
        const member = await directory.fetchMember(round.guildId, session.uid).catch(() => null);
        if (!member) return failBody('NOT_MEMBER');
        res = m.join(roundId, member);
        break;
      }
      case 'leave':
        res = m.leave(roundId, session.uid);
        break;
      case 'start':
        res = m.start(roundId, session.uid);
        break;
      case 'cancel':
        res = m.cancel(roundId, session.uid);
        break;
      case 'kick':
        res = m.kick(roundId, session.uid, String((body && body.playerId) || ''));
        break;
      case 'act':
        res = m.act(roundId, session.uid, String((body && body.type) || ''), body && body.payload);
        break;
      default:
        return failBody('BAD_ACTION');
    }
    if (!res.ok) {
      const f = failBody(res.reason);
      if (res.need) f.body.error.need = res.need;
      return f;
    }
    return { status: 200, body: { ok: true, data: { already: !!res.already, hits: res.hits, misses: res.misses } } };
  }

  // ---------------- Express ----------------
  function mount(app) {
    const router = express.Router();
    const limit = (windowMs, max) =>
      rateLimit({ windowMs, limit: max, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'طلبات كثيرة — انتظر شوي.' } }) });

    router.use('/discord/rounds-assets', express.static(assetsDir, { index: false, maxAge: '10m', setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));

    const page = (req, res) => {
      if (!ID_RE.test(req.params.id)) return res.status(404).type('text/plain').send('الراوند غير موجود');
      res.set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://flagcdn.com data:; connect-src 'self' wss: ws:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      return res.sendFile(path.join(assetsDir, 'index.html'));
    };
    router.get('/discord/round/:id', limit(60_000, 120), page);
    router.get('/discord/watch/:id', limit(60_000, 120), page);

    router.get('/api/session', limit(60_000, 120), (req, res) => {
      const auth = getAuth();
      const s = auth && auth.sessionFrom(req.headers.cookie);
      res.set('Cache-Control', 'no-store').json({ ok: true, data: { user: s ? { id: s.uid, name: s.name } : null } });
    });

    router.get('/api/rounds/:id/info', limit(60_000, 120), (req, res) => {
      const rt = rt0();
      const round = rt && rt.manager.get(req.params.id);
      if (!round) return res.status(404).json(failBody('NOT_FOUND').body);
      const v = rt.manager.viewFor(round, null);
      return res.set('Cache-Control', 'no-store').json({ ok: true, data: { roundId: v.roundId, game: v.game, status: v.status, host: v.host && { name: v.host.name, avatarUrl: v.host.avatarUrl }, players: v.players.length, maxPlayers: v.maxPlayers } });
    });

    // الطلبات المغيِّرة للحالة: JSON + هيدر مخصص (يمنع تزوير النماذج عبر المواقع) + فحص Origin
    const guard = (req, res, next) => {
      const origin = req.get('origin');
      if (origin && origin !== originOf()) return res.status(403).json({ ok: false, error: { code: 'BAD_ORIGIN', message: 'مصدر الطلب غير مسموح.' } });
      if (req.get('x-requested-with') !== 'ehsmaha-round') return res.status(403).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'طلب غير صالح.' } });
      return next();
    };
    router.post('/api/rounds/:id/:kind', limit(60_000, 90), guard, express.json({ limit: '4kb' }), async (req, res) => {
      const auth = getAuth();
      const session = auth && auth.sessionFrom(req.headers.cookie);
      if (!['join', 'leave', 'start', 'cancel', 'kick', 'act'].includes(req.params.kind)) return res.status(404).json(failBody('BAD_ACTION').body);
      try {
        const r = await command(session, req.params.id, req.params.kind, req.body);
        res.status(r.status).set('Cache-Control', 'no-store').json(r.body);
      } catch (err) {
        logger.error('راوند: خطأ بطلب ويب', { kind: req.params.kind, error: err });
        res.status(500).json(failBody('INTERNAL').body);
      }
    });

    // ---- OAuth ----
    router.get('/auth/discord/login', limit(60_000, 30), (req, res) => {
      const auth = getAuth();
      const rid = String(req.query.round || '');
      if (!auth) return res.status(503).type('text/plain').send('تسجيل الدخول غير مفعّل — تواصل مع إدارة البوت.');
      if (!ID_RE.test(rid)) return res.status(400).type('text/plain').send('راوند غير صالح');
      const { url, setCookie } = auth.beginLogin(rid);
      res.set({ 'Set-Cookie': setCookie, 'Cache-Control': 'no-store' });
      return res.redirect(302, url);
    });
    router.get('/auth/discord/callback', limit(60_000, 30), async (req, res) => {
      const auth = getAuth();
      if (!auth) return res.status(503).type('text/plain').send('تسجيل الدخول غير مفعّل.');
      if (req.query.error) return res.status(400).type('text/plain').send('تم إلغاء تسجيل الدخول.');
      try {
        const r = await auth.finishLogin({ code: req.query.code, state: req.query.state, cookieHeader: req.headers.cookie });
        res.set({ 'Set-Cookie': r.setCookies, 'Cache-Control': 'no-store' });
        // وجهة العودة دائماً مسار داخلي بمعرّف مُتحقَّق منه (لا open redirect)
        return res.redirect(302, ID_RE.test(r.roundId) ? `/discord/round/${r.roundId}` : '/');
      } catch (err) {
        logger.warn('راوند: فشل تسجيل الدخول', { code: err.code, status: err.status });
        return res.status(400).type('text/plain').send('فشل تسجيل الدخول — ارجع للرابط وجرّب مرة ثانية.');
      }
    });
    router.post('/auth/logout', guard, (req, res) => {
      const auth = getAuth();
      if (auth) res.set('Set-Cookie', auth.logoutCookies());
      res.json({ ok: true });
    });

    app.use(router);
  }

  // ---------------- WebSocket ----------------
  function attachWebSocket(server) {
    const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
    const perIp = new Map();
    const hb = setInterval(() => {
      for (const ws of wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          /* يُنظَّف عند الإغلاق */
        }
      }
    }, HEARTBEAT_MS);
    if (hb.unref) hb.unref();

    server.on('upgrade', (req, socket, head) => {
      const reject = (code, text) => {
        socket.write(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\n\r\n`);
        socket.destroy();
      };
      let url;
      try {
        url = new URL(req.url, 'http://x');
      } catch {
        return reject(400, 'Bad Request');
      }
      const m = /^\/ws\/rounds\/([A-Za-z0-9_-]{22})$/.exec(url.pathname);
      if (!m) return reject(404, 'Not Found');
      const rt = rt0();
      if (!rt || !rt.configured) return reject(503, 'Service Unavailable');
      const origin = req.headers.origin;
      if (origin && origin !== originOf()) return reject(403, 'Forbidden'); // يمنع الاتصال من مواقع أخرى
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
      if ((perIp.get(ip) || 0) >= MAX_WS_PER_IP) return reject(429, 'Too Many Requests');
      const round = rt.manager.get(m[1]);
      if (!round) return reject(404, 'Not Found');
      if (round.rt.conns.size >= MAX_WS_PER_ROUND) return reject(503, 'Round Full');
      const auth = getAuth();
      const session = url.searchParams.get('watch') === '1' ? null : auth && auth.sessionFrom(req.headers.cookie);
      wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, { roundId: m[1], session, ip, since: url.searchParams.get('since') }));
      return undefined;
    });

    function onConnection(ws, { roundId, session, ip, since }) {
      const rt = rt0();
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      const sink = { send: (s) => ws.readyState === 1 && ws.send(s), close: (c, r) => ws.close(c, r) };
      const conn = rt.manager.connect(roundId, session ? session.uid : null, sink, { since: since == null || since === '' ? null : Number(since) });
      if (!conn.ok) {
        ws.close(conn.reason === 'KICKED' ? 4003 : 4004, conn.reason);
        perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
        return;
      }
      let tokens = WS_MSG_BURST;
      const refill = setInterval(() => {
        tokens = WS_MSG_BURST;
      }, 1000);
      ws.on('message', async (data) => {
        if (--tokens < 0) return ws.close(4008, 'rate-limit');
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return undefined;
        }
        if (!msg || typeof msg !== 'object') return undefined;
        if (msg.t === 'ping') return sink.send(JSON.stringify({ t: 'pong', now: Date.now() }));
        if (msg.t === 'act') {
          const r = await command(session, roundId, 'act', { type: msg.type, payload: msg.payload });
          sink.send(JSON.stringify({ t: 'ack', reqId: msg.reqId, ok: r.body.ok, error: r.body.error && r.body.error.code }));
        }
        return undefined;
      });
      ws.on('close', () => {
        clearInterval(refill);
        conn.disconnect();
        const n = (perIp.get(ip) || 1) - 1;
        if (n <= 0) perIp.delete(ip);
        else perIp.set(ip, n);
      });
      ws.on('error', () => ws.terminate());
    }

    return { wss, close: () => { clearInterval(hb); for (const ws of wss.clients) ws.terminate(); wss.close(); } };
  }

  return { mount, attachWebSocket, command, getAuth };
}

// البحث عن عضو السيرفر من البوت (مصدر موثوق، بدون privileged intent: طلب REST فردي)
function createDirectory(getClient) {
  return {
    async fetchMember(guildId, userId) {
      const client = getClient();
      if (!client) return null;
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!guild) return null;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) return null;
      return {
        id: member.id,
        name: member.displayName || member.user.globalName || member.user.username,
        username: member.user.username,
        avatarUrl: member.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true })
      };
    }
  };
}

module.exports = { createRoundsWeb, createDirectory, FAIL };
