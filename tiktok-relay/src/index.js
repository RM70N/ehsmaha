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
import { TestHarness } from './testHarness.js';
import { DesktopAuthService, DesktopLinkHub, corsHeaders } from './desktopAuth.js';
import { LegacyBridgeServer } from './legacyBridge.js';
import fs from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 10000);
const ENABLE_FALLBACK = process.env.ENABLE_FALLBACK === '1';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || '';
// أداة الاختبار (/test صفحة، /testws اتصال بلا مصادقة) — للتجربة على بث حقيقي قبل أي ربط
// بالموقع الرئيسي. تُعطَّل بوضوح في نشر إنتاجي حقيقي مستقبلاً عبر DISABLE_TEST_HARNESS=1.
const TEST_HARNESS_ENABLED = process.env.DISABLE_TEST_HARNESS !== '1';

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
// رمز ربط التطبيق (يحتاج admin لإصدار Custom Token)
const desktopLinkHub = new DesktopLinkHub({ verifyToken, log });
const desktopAuth = db ? new DesktopAuthService({
  createCustomToken: (uid) => admin.auth().createCustomToken(uid),
  resolveUid: async (nameLower) => { const d = await db.collection('usernames').doc(nameLower).get(); return d.exists && d.data() && d.data().uid ? String(d.data().uid) : null; },
  push: (uid, msg) => desktopLinkHub.push(uid, msg),
}) : null;
function clientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); }
let testHarness = null;

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
  onEvent: (ev) => {
    broadcaster.broadcast(ev.streamer, ev);
    if (testHarness) testHarness.forwardEvent(ev);
  },
});

if (TEST_HARNESS_ENABLED) testHarness = new TestHarness({ manager, log });

function withTimeout(promise, ms, message) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message || 'timeout')), ms);
    promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// فحص تفعيل الستريمر (bridgeStreamers/{id}.enabled) — نفس مستند/حقل tiktok-server القديم، بمهلة
// 4 ثوانٍ صريحة: طلب Firestore معلّق بلا مهلة يعلّق فتح الاتصال بالكامل بصمت (عطل حقيقي وُجد
// وأُصلح بـtiktok-server سابقاً — طبَّقناه هنا من البداية بدل تكراره).
async function isStreamerEnabled(identifier) {
  if (!db) return true;
  try {
    const snap = await withTimeout(db.collection('bridgeStreamers').doc(identifier).get(), 4000, 'فحص Firestore تجاوز 4 ثوانٍ');
    if (!snap.exists) return true;
    const data = snap.data() || {};
    return data.enabled !== false;
  } catch (e) {
    log('warn', 'firestore_enabled_check_failed', { identifier, message: e && e.message });
    return true; // لا نمنع الخدمة بالكامل لعطل Firestore
  }
}

const legacyBridge = new LegacyBridgeServer({ log, isStreamerEnabled });

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

  if (TEST_HARNESS_ENABLED && (path === '/test' || path === '/test.html')) {
    try {
      const html = fs.readFileSync(nodePath.join(__dirname, '..', 'test.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    } catch (e) {
      res.writeHead(500); return res.end('test.html missing');
    }
  }

  if (path === '/health') {
    return sendJson(res, 200, {
      ok: true,
      enableFallback: ENABLE_FALLBACK,
      firebaseConfigured: !!db,
      manager: manager.snapshot(),
      legacyBridgeRooms: legacyBridge.rooms.size,
    });
  }

  if (path === '/desktop-auth/issue' || path === '/desktop-auth/redeem' || path === '/desktop-auth/request') {
    const cors = corsHeaders(req.headers.origin || '');
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors }); res.end(JSON.stringify(obj)); };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (req.method !== 'POST') return send(405, { error: 'method_not_allowed' });
    if (!desktopAuth) return send(503, { error: 'firebase_not_configured' });
    try {
      if (path === '/desktop-auth/issue') {
        // يُستدعى من صفحة الموقع فقط (أصل ehsmaha.com) وبتوكن مستخدم مسجّل.
        if (!cors['Access-Control-Allow-Origin']) return send(403, { error: 'forbidden_origin' });
        const user = await verifyToken(bearerToken(req));
        if (!user) return send(401, { error: 'unauthorized' });
        const r = desktopAuth.issue(user.uid);
        return r.ok ? send(200, r) : send(r.error === 'rate_limited' ? 429 : 400, { error: r.error });
      }
      if (path === '/desktop-auth/request') {
        const b = await readJsonBody(req, 1024);
        const r = await desktopAuth.requestByUsername(b.username, clientIp(req));
        if (r.ok) return send(200, { ok: true, delivered: r.delivered, expiresInSec: r.expiresInSec });
        return send(r.error === 'rate_limited' ? 429 : r.error === 'invalid_username' ? 400 : 500, { error: r.error });
      }
      const body = await readJsonBody(req, 2048);
      const r = await desktopAuth.redeem(body.code, clientIp(req));
      if (r.ok) return send(200, { customToken: r.customToken });
      return send(r.error === 'rate_limited' ? 429 : r.error === 'invalid_code' ? 400 : 500, { error: r.error });
    } catch (e) {
      return send(400, { error: 'bad_request' });
    }
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
  // /ws: بروتوكول الأسلاك القديم المتوافق مع كل ألعاب index.html (راجع legacyBridge.js) —
  // هذا المسار الذي يربط به الموقع الرئيسي فعلياً (TIKTOK_BRIDGE_SERVERS).
  if (path === '/ws') legacyBridge.handleUpgrade(req, socket, head);
  else if (path === '/relay') broadcaster.handleUpgrade(req, socket, head);
  else if (path === '/desktop-auth/ws') desktopLinkHub.handleUpgrade(req, socket, head);
  else if (TEST_HARNESS_ENABLED && path === '/testws' && testHarness) testHarness.handleUpgrade(req, socket, head);
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
  log('info', 'listening', { port: PORT, provider: 'piratetok', enableFallback: ENABLE_FALLBACK, legacyBridgePath: '/ws' });
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('info', 'shutdown_start', { signal });
  await manager.shutdown();
  broadcaster.closeAll();
  legacyBridge.closeAll();
  if (testHarness) testHarness.closeAll();
  server.close(() => {
    log('info', 'shutdown_done', {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
