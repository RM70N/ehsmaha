'use strict';
// محاكي كيك للاختبارات: يشغّل مكتبة kichat.js الحقيقية بلا أي تعديل عليها.
//  • fetch لـ kick.com/api/v2/channels/{slug}/info  → ردود قابلة للتحكم (200/404/403/5xx/HTML…)
//  • wss://ws-us2.pusher.com  → خادم Pusher محلي حقيقي (TLS بشهادة مؤقتة تُولَّد وقت التشغيل ولا تُحفظ بالمستودع)
// يرقّع فقط: globalThis.fetch و tls.connect (تحويل الوجهة)، ويعيدهما stop().
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const tls = require('tls');
const { execFileSync } = require('child_process');
const { WebSocketServer } = require('ws');

function makeCert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kickmock-'));
  const key = path.join(dir, 'k.pem'), crt = path.join(dir, 'c.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '2', '-subj', '/CN=ws-us2.pusher.com'], { stdio: 'ignore' });
  const out = { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
  fs.rmSync(dir, { recursive: true, force: true });
  return out;
}

async function startKickMock() {
  const server = https.createServer(makeCert());
  const wss = new WebSocketServer({ server });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const M = {
    port, channels: new Map(), sockets: new Set(), connectionsTotal: 0, subscribes: [], infoCalls: [], blackholed: false, rejectNew: false,
    infoDelayMs: 0,
    // status: 200|404|403|429|500|'html'|'throw'
    setChannel(slug, o) { M.channels.set(slug.toLowerCase(), Object.assign({ status: 200, live: true, chatroomId: 100000 + M.channels.size, id: 50000 + M.channels.size, username: slug }, o || {})); return M.channels.get(slug.toLowerCase()); },
    openCount() { return [...M.sockets].filter((s) => s.readyState === 1).length; },
    chatroomId(slug) { return M.channels.get(slug.toLowerCase()).chatroomId; },
    // رسالة شات كما ترسلها كيك (قناتان: v2 والقديمة لو dual=true، مثل اشتراك المكتبة الاثنين)
    chat(slug, o) {
      const ch = M.channels.get(slug.toLowerCase());
      const msg = Object.assign({ id: 'mid-' + Math.random().toString(36).slice(2), chatroom_id: ch.chatroomId, content: 'مرحبا', type: 'message', created_at: new Date().toISOString(),
        sender: { id: 1, username: 'viewer', slug: 'viewer', identity: { color: '#fff', badges: [] } }, metadata: {} }, o || {});
      const frame = (name) => JSON.stringify({ event: 'App\\Events\\ChatMessageEvent', data: JSON.stringify(msg), channel: name });
      let n = 0;
      for (const s of M.sockets) {
        if (s.readyState !== 1 || s._subs.size === 0) continue;
        for (const c of s._subs) if (c.includes(String(ch.chatroomId))) { if (!M.blackholed) s.send(frame(c)); n++; if (!(o && o.dual)) break; }
      }
      return n;
    },
    event(slug, name, data) {
      const ch = M.channels.get(slug.toLowerCase());
      for (const s of M.sockets) if (s.readyState === 1 && !M.blackholed) s.send(JSON.stringify({ event: name, data: JSON.stringify(data || {}), channel: 'chatrooms.' + ch.chatroomId + '.v2' }));
    },
    dropAll() { for (const s of M.sockets) { try { s.terminate(); } catch (e) { /* ignore */ } } },
    // اتصال ميت بصمت: لا نرسل ولا نردّ (لا pong) ولا نغلق
    blackhole(on) { M.blackholed = !!on; },
  };
  wss.on('connection', (ws) => {
    if (M.rejectNew) { ws.terminate(); return; }
    M.connectionsTotal++; M.sockets.add(ws); ws._subs = new Set();
    ws.on('close', () => M.sockets.delete(ws));
    ws.on('error', () => {});
    if (!M.blackholed) ws.send(JSON.stringify({ event: 'pusher:connection_established', data: JSON.stringify({ socket_id: '1.' + M.connectionsTotal, activity_timeout: M.activityTimeout || 120 }) }));
    ws.on('message', (raw) => {
      if (M.blackholed) return;
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m.event === 'pusher:subscribe') { ws._subs.add(m.data.channel); M.subscribes.push(m.data.channel); ws.send(JSON.stringify({ event: 'pusher_internal:subscription_succeeded', data: '{}', channel: m.data.channel })); }
      else if (m.event === 'pusher:unsubscribe') ws._subs.delete(m.data.channel);
      else if (m.event === 'pusher:ping') ws.send(JSON.stringify({ event: 'pusher:pong', data: '{}' }));
    });
  });

  const origFetch = globalThis.fetch;
  globalThis.fetch = async function (url, init) {
    const u = String(url);
    const m = /^https:\/\/kick\.com\/api\/v2\/channels\/([^/]+)\/info/.exec(u);
    if (!m) return origFetch.apply(this, arguments);
    const slug = decodeURIComponent(m[1]).toLowerCase();
    M.infoCalls.push(slug);
    if (M.infoDelayMs) await new Promise((r) => setTimeout(r, M.infoDelayMs));
    const ch = M.channels.get(slug);
    if (!ch) return new Response('{"message":"not found"}', { status: 404 });
    if (ch.status === 'throw') throw new TypeError('fetch failed');
    if (ch.status === 'html') return new Response('<html>Just a moment...</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    if (ch.status !== 200) return new Response('{}', { status: ch.status });
    return new Response(JSON.stringify({ id: ch.id, slug: slug.replace(/_/g, '-'), user: { username: ch.username }, chatroom: { id: ch.chatroomId },
      livestream: ch.live ? { is_live: true, id: 9 } : null }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const origConnect = tls.connect;
  const prevReject = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  tls.connect = function (...args) {
    const o = args[0] && typeof args[0] === 'object' ? args[0] : null;
    if (o && (o.host === 'ws-us2.pusher.com' || o.servername === 'ws-us2.pusher.com')) { o.host = '127.0.0.1'; o.port = port; o.servername = 'ws-us2.pusher.com'; o.rejectUnauthorized = false; }
    return origConnect.apply(this, args);
  };

  M.stop = async () => {
    globalThis.fetch = origFetch; tls.connect = origConnect;
    if (prevReject === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED; else process.env.NODE_TLS_REJECT_UNAUTHORIZED = prevReject;
    for (const s of M.sockets) { try { s.terminate(); } catch (e) { /* ignore */ } }
    await new Promise((r) => wss.close(() => server.close(() => r())));
  };
  return M;
}
module.exports = { startKickMock };
