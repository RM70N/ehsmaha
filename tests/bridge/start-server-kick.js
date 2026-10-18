'use strict';
// نفس start-server.js لكن رسائل الشات (cmd:'chat'/'burst') تُمرَّر عبر مسار كيك الحقيقي:
//   محاكي كيك (HTTPS+Pusher) ← مكتبة kichat.js الحقيقية ← server.js ← WebSocket المتصفح.
// قناة كيك لكل ستريمر تُنشأ تلقائياً. محاكاة فقط — لا اتصال بكيك الحقيقي.
//   PORT=18081 CTL_PORT=19081 node tests/bridge/start-server-kick.js
const path = require('path');
const { startKickMock } = require(path.join(__dirname, '../../tiktok-server/test/kick-mock'));
(async () => {
  const M = await startKickMock();
  global.__kickMock = M;
  for (const c of String(process.env.KICK_CHANNELS || 'streamer1').split(',')) { const [n, flag] = c.trim().split(':'); M.setChannel(n, { live: flag !== 'offline' }); } // القنوات الموجودة بكيك (غيرها = 404)
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  global.__routeChat = (user, b) => {
    if (!M.channels.has(user)) M.setChannel(user);
    return M.chat(user, { content: b.text, sender: { id: hash(b.viewer), username: String(b.viewer), slug: String(b.viewer).toLowerCase(), identity: { badges: [] } } });
  };
  // منفذ تحكم بمحاكي كيك للاختبارات: dropAll / down / up / live?slug= / stats
  const http = require('http');
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); const cmd = u.pathname.slice(1); let out = { ok: true };
    if (cmd === 'dropAll') M.dropAll();
    else if (cmd === 'down') { M.rejectNew = true; M.downChannels = [...M.channels.entries()].map(([k, v]) => [k, v.status]); for (const [k] of M.channels) M.channels.get(k).status = 500; M.dropAll(); }
    else if (cmd === 'up') { M.rejectNew = false; for (const [k, v] of (M.downChannels || [])) M.channels.get(k).status = v; }
    else if (cmd === 'live') { const c = M.channels.get(u.searchParams.get('slug')); c.live = true; M.event(u.searchParams.get('slug'), 'App\\Events\\StreamerIsLive', {}); }
    else if (cmd === 'stats') out = { connectionsTotal: M.connectionsTotal, open: M.openCount(), infoCalls: M.infoCalls.length };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
  }).listen(19181, '127.0.0.1');
  require('./start-server');
})();
