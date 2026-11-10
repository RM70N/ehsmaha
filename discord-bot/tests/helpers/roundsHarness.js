'use strict';

// بيئة اختبار كاملة لراوندات الألعاب: خادم ويب حقيقي (HTTP + WebSocket) + مدير + OAuth ديسكورد مزيّف.
// ما فيه أي اتصال بديسكورد أو بأي خدمة خارجية.

const http = require('node:http');
const crypto = require('node:crypto');
const express = require('express');
const WebSocket = require('ws');
const { RoundManager } = require('../../services/discordRounds/roundManager');
const { createMemoryStore } = require('../../services/discordRounds/roundStore');
const { createRoundsWeb } = require('../../services/discordRounds/http');

const FAST = {
  startingMs: 25,
  saveDebounceMs: 5,
  playerGraceMs: 500,
  hostGraceMs: 600,
  retireMs: 60_000,
  timings: {
    countries: { pickMs: 400, spinMs: 40, afterPickMs: 30, afterSkipMs: 30 },
    roulette: { pickMs: 400, spinMs: 40, afterPickMs: 30, afterSkipMs: 30 },
    sniper: { hideMs: 500, huntMs: 700 }
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 3000, stepMs = 10) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error('انتهت المهلة بدون ما يتحقق الشرط');
    await wait(stepMs);
  }
}

// ديسكورد مزيّف: /oauth2/token و /users/@me — يتحقق من PKCE وسر التطبيق
function startFakeDiscord() {
  const codes = new Map(); // code -> { uid, challenge, redirect }
  const tokens = new Map(); // access_token -> uid
  const users = new Map();
  const calls = { token: 0, me: 0 };
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = new URLSearchParams(Buffer.concat(chunks).toString());
    const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/oauth2/token') {
      calls.token += 1;
      const c = codes.get(body.get('code'));
      if (!c || body.get('client_secret') !== 'test-secret' || body.get('grant_type') !== 'authorization_code') return send(400, { error: 'invalid_grant' });
      const verifierHash = crypto.createHash('sha256').update(body.get('code_verifier') || '').digest('base64url');
      if (verifierHash !== c.challenge) return send(400, { error: 'invalid_grant', hint: 'pkce' });
      if (body.get('redirect_uri') !== c.redirect) return send(400, { error: 'invalid_grant', hint: 'redirect' });
      codes.delete(body.get('code'));
      const tok = `tok-${c.uid}-${crypto.randomBytes(4).toString('hex')}`;
      tokens.set(tok, c.uid);
      return send(200, { access_token: tok, token_type: 'Bearer', scope: 'identify' });
    }
    if (req.url === '/users/@me') {
      calls.me += 1;
      const uid = tokens.get((req.headers.authorization || '').replace('Bearer ', ''));
      if (!uid) return send(401, { message: '401: Unauthorized' });
      return send(200, users.get(uid) || { id: uid, username: `user${uid.slice(-4)}`, global_name: `User ${uid.slice(-4)}` });
    }
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, codes, tokens, users, calls, port: server.address().port, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) })));
}

async function startHarness({ settings = {}, store = createMemoryStore(), manager: external = null, members = {}, countryList = null } = {}) {
  const discord = await startFakeDiscord();
  const manager = external || new RoundManager({ store, settings: { ...FAST, ...settings }, countryList });
  // guildId -> Map(uid -> profile) — فقط هؤلاء "أعضاء" بالسيرفر
  const guilds = new Map(Object.entries(members).map(([g, list]) => [g, new Map(list.map((m) => [m.id, m]))]));
  const directory = { fetchMember: async (g, u) => (guilds.get(g) && guilds.get(g).get(u)) || null };
  const state = { rt: null };
  const web = createRoundsWeb({
    getRuntime: () => state.rt,
    directory,
    authOptions: { apiBase: `http://127.0.0.1:${discord.port}`, authorizeUrl: `http://127.0.0.1:${discord.port}/oauth2/authorize` }
  });
  const app = express();
  app.set('trust proxy', 1);
  web.mount(app);
  const server = http.createServer(app);
  const ws = web.attachWebSocket(server);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  state.rt = { manager, configured: true, config: { clientId: '1552260327008247879', rounds: { publicUrl: baseUrl, clientSecret: 'test-secret', sessionSecret: null } } };

  // تسجيل دخول كامل عبر مسار OAuth الحقيقي (state + PKCE) ← كوكي الجلسة
  async function login(uid, roundId, { tamper = null } = {}) {
    const r1 = await fetch(`${baseUrl}/auth/discord/login?round=${roundId}`, { redirect: 'manual' });
    if (r1.status !== 302) throw new Error(`login status ${r1.status}`);
    const loc = new URL(r1.headers.get('location'));
    const flowCookie = r1.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const code = `code-${uid}-${crypto.randomBytes(3).toString('hex')}`;
    discord.codes.set(code, { uid, challenge: loc.searchParams.get('code_challenge'), redirect: loc.searchParams.get('redirect_uri') });
    const state = tamper === 'state' ? 'forged' : loc.searchParams.get('state');
    const r2 = await fetch(`${baseUrl}/auth/discord/callback?code=${code}&state=${state}`, { redirect: 'manual', headers: tamper === 'nocookie' ? {} : { cookie: flowCookie } });
    const cookies = r2.headers.getSetCookie();
    const session = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('ehs_rs=') && c.length > 10);
    return { status: r2.status, location: r2.headers.get('location'), cookie: session || null, setCookies: cookies, loc };
  }

  async function post(roundId, kind, cookie, body = {}, headers = {}) {
    const res = await fetch(`${baseUrl}/api/rounds/${roundId}/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'ehsmaha-round', ...(cookie ? { cookie } : {}), ...headers },
      body: JSON.stringify(body)
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  }

  // عميل WebSocket يجمع الرسائل
  function connect(roundId, cookie, { watch = false, since = null, origin = baseUrl } = {}) {
    const qs = new URLSearchParams();
    if (watch) qs.set('watch', '1');
    if (since != null) qs.set('since', String(since));
    const url = `${baseUrl.replace('http', 'ws')}/ws/rounds/${roundId}${qs.size ? `?${qs}` : ''}`;
    const sock = new WebSocket(url, { headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin } : {}) } });
    const c = { sock, messages: [], states: [], events: [], acks: [], closed: null, raw: [] };
    sock.on('message', (d) => {
      const s = d.toString();
      c.raw.push(s);
      const m = JSON.parse(s);
      c.messages.push(m);
      if (m.t === 'state') { c.states.push(m.state); c.events.push(...m.events); }
      if (m.t === 'ack') c.acks.push(m);
    });
    sock.on('close', (code) => { c.closed = code; });
    sock.on('error', () => {});
    c.opened = new Promise((resolve, reject) => { sock.on('open', resolve); sock.on('unexpected-response', (q, r) => resolve(r.statusCode)); sock.on('error', reject); });
    Object.defineProperties(c, { last: { get: () => c.states[c.states.length - 1] } });
    c.act = (type, payload) => { const reqId = crypto.randomBytes(4).toString('hex'); sock.send(JSON.stringify({ t: 'act', reqId, type, payload })); return reqId; };
    c.close = () => sock.close();
    return c;
  }

  async function close() {
    ws.close();
    await manager.shutdown({ persist: false });
    await new Promise((r) => { server.closeAllConnections?.(); server.close(r); });
    await discord.close();
  }

  return { baseUrl, manager, discord, login, post, connect, close, state, guilds, web, server };
}

const profile = (i, extra = {}) => ({ id: String(900000000000000000n + BigInt(i)), name: `لاعب${i}`, username: `player${i}`, avatarUrl: null, ...extra });

module.exports = { startHarness, startFakeDiscord, FAST, wait, until, profile };
