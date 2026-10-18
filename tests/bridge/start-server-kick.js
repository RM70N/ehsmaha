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
  const hash = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  global.__routeChat = (user, b) => {
    if (!M.channels.has(user)) M.setChannel(user);
    return M.chat(user, { content: b.text, sender: { id: hash(b.viewer), username: String(b.viewer), slug: String(b.viewer).toLowerCase(), identity: { badges: [] } } });
  };
  require('./start-server');
})();
