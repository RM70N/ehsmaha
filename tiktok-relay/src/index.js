#!/usr/bin/env node
'use strict';
// خدمة ربط بثوث TikTok LIVE لمنصة احسمها — مزوّد أساسي piratetok-live-js (بلا حصة/مفتاح)،
// احتياطي tiktok-live-connector (بلا مفتاح، طبقة Euler المجانية) خلف ENABLE_FALLBACK.
import http from 'node:http';
import { log } from './log.js';
import { normalizeTikTokUsername, InvalidUsernameError } from './normalize.js';
import { LinkingService, AlreadyLinkedError, NotOwnerError } from './linking.js';
import { ConnectionManager } from './manager.js';
import { RelayBroadcaster } from './wsServer.js';
import { createTokenVerifier } from './firebaseAuth.js';
import * as piratetokProvider from './providers/piratetokProvider.js';
import * as eulerProvider from './providers/eulerProvider.js';

const PORT = Number(process.env.PORT || 10000);
const ENABLE_FALLBACK = process.env.ENABLE_FALLBACK === '1';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || '';

let admin = null;
let db = null;
const svcJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (svcJson) {
  try {
    admin = await import('firebase-admin');
    admin = admin.default || admin;
    if (!admin.apps || !admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(svcJson)) });
    db = admin.firestore();
  } catch (e) {
    log('error', 'firebase_init_failed', { message: e && e.message });
  }
} else {
  log('warn', 'firebase_missing', { hint: 'FIREBASE_SERVICE_ACCOUNT غير مضبوط — حجز الحسابات وربط اللعبة معطَّلان' });
}

const verifyToken = createTokenVerifier({ admin: db ? admin : null, firebaseWebApiKey: FIREBASE_WEB_API_KEY });
const linking = db ? new LinkingService(db) : null;
const broadcaster = new RelayBroadcaster({ verifyToken, log });

const manager = new ConnectionManager({
  primaryProvider: piratetokProvider,
  fallbackProvider: eulerProvider,
  enableFallback: ENABLE_FALLBACK,
  pollIntervalMinMs: Number(process.env.POLL_INTERVAL_MIN_MS || 30000),
  pollIntervalMaxMs: Number(process.env.POLL_INTERVAL_MAX_MS || 60000),
  pollMaxConcurrency: Number(process.env.POLL_MAX_CONCURRENCY || 5),
  globalRatePerSec: Number(process.env.GLOBAL_RATE_PER_SEC || 2),
  globalRateBurst: Number(process.env.GLOBAL_RATE_BURST || 5),
  breakerOpts: {
    failureThreshold: Number(process.env.BREAKER_FAILURE_THRESHOLD || 3),
    cooldownMs: Number(process.env.BREAKER_COOLDOWN_MS || 30000),
    maxCooldownMs: Number(process.env.BREAKER_MAX_COOLDOWN_MS || 300000),
  },
  log,
  onEvent: (ev) => { broadcaster.broadcast(ev.streamer, ev); },
});

async function readJsonBody(req, limit = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('الجسم كبير جداً');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function bearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/healthz') return sendJson(res, 200, { ok: true });

  if (path === '/health') {
    return sendJson(res, 200, {
      ok: true,
      enableFallback: ENABLE_FALLBACK,
      firebaseConfigured: !!db,
      manager: manager.snapshot(),
    });
  }

  if (path === '/link' && req.method === 'POST') {
    if (!linking) return sendJson(res, 503, { error: 'firebase_not_configured' });
    try {
      const user = await verifyToken(bearerToken(req));
      if (!user) return sendJson(res, 401, { error: 'unauthorized' });
      const body = await readJsonBody(req);
      const username = await linking.link(body.username, user.uid);
      manager.track(username);
      return sendJson(res, 200, { ok: true, username });
    } catch (e) {
      if (e instanceof InvalidUsernameError) return sendJson(res, 400, { error: e.message });
      if (e instanceof AlreadyLinkedError) return sendJson(res, 409, { error: e.message });
      return sendJson(res, 500, { error: 'internal' });
    }
  }

  if (path === '/unlink' && req.method === 'POST') {
    if (!linking) return sendJson(res, 503, { error: 'firebase_not_configured' });
    try {
      const user = await verifyToken(bearerToken(req));
      if (!user) return sendJson(res, 401, { error: 'unauthorized' });
      const body = await readJsonBody(req);
      const username = await linking.unlink(body.username, user.uid);
      manager.untrack(username);
      return sendJson(res, 200, { ok: true, username });
    } catch (e) {
      if (e instanceof InvalidUsernameError) return sendJson(res, 400, { error: e.message });
      if (e instanceof NotOwnerError) return sendJson(res, 403, { error: e.message });
      return sendJson(res, 500, { error: 'internal' });
    }
  }

  res.writeHead(404);
  res.end('not found');
});

server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/relay') broadcaster.handleUpgrade(req, socket, head);
  else socket.destroy();
});

// استرجاع الحسابات المربوطة عند الإقلاع — نفس القائمة التي يحتفظ بها المدير أثناء التشغيل.
if (linking) {
  try {
    const usernames = await linking.listLinkedUsernames();
    usernames.forEach((u) => { try { manager.track(normalizeTikTokUsername(u)); } catch (e) { /* تجاهل مستند تالف */ } });
    log('info', 'loaded_links', { count: usernames.length });
  } catch (e) {
    log('error', 'load_links_failed', { message: e && e.message });
  }
}

server.listen(PORT, () => {
  log('info', 'listening', { port: PORT, provider: 'piratetok', enableFallback: ENABLE_FALLBACK });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown_start', { signal });
  await manager.shutdown();
  broadcaster.closeAll();
  server.close(() => {
    log('info', 'shutdown_done', {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
