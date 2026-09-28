'use strict';
// يشغّل tiktok-server/server.js الحقيقي كما هو، مع استبدال tiktok-live-connector
// فقط بـ fake-connector.js، ويفتح منفذ تحكم HTTP للاختبارات.
//
//   PORT=18081 CTL_PORT=19081 node tests/bridge/start-server.js
//
// أوامر التحكم (POST /ctl بجسم JSON):
//   {cmd:'mode', user, mode}                     live|not_live|rate_limited|user_not_found|fail|hang
//   {cmd:'defaultMode', mode} / {cmd:'connectDelay', ms}
//   {cmd:'chat', user, viewer, text, nickname?, identity?, followStatus?}
//   {cmd:'burst', user, count, prefix, text, identity?, perMs?}   دفعة رسائل من مشاهدين مختلفين
//   {cmd:'blackhole', ms}   لا شيء يوصل للعملاء (ولا ping) مدة ms — اتصال ميت بصمت
//   {cmd:'follow', user, viewer} / {cmd:'dropUpstream', user} / {cmd:'streamEnd', user}
//   GET /stats  -> { upstreamLive, connectCalls, connectCallsByUser, rss }
const path = require('path');
const http = require('http');
const Module = require('module');

const serverDir = path.join(__dirname, '../../tiktok-server');
const fake = require('./fake-connector');
const resolved = require.resolve('tiktok-live-connector', { paths: [serverDir] });
const m = new Module(resolved);
m.filename = resolved; m.loaded = true; m.exports = fake;
require.cache[resolved] = m;

const ctl = fake.__ctl;
// "ثقب أسود": يحاكي اتصال TCP ميت بصمت — السيرفر يظن إنه يرسل (send/ping) لكن ولا
// شيء يوصل، والاتصال ما ينقفل من جهة العميل. نرقّع نفس مكتبة ws اللي يستخدمها السيرفر.
const WSLib = require(require.resolve('ws', { paths: [serverDir] }));
// يطبّق فقط على الاتصالات الموجودة لحظة بدء الثقب — الاتصالات الجديدة (إعادة اتصال
// العميل) تشتغل طبيعي، مثل الواقع: الجهاز رجع يفتح اتصال جديد سليم.
let blackholeUntil = 0, blackholeStart = 0;
for (const fn of ['send', 'ping']) {
  const orig = WSLib.WebSocket.prototype[fn];
  WSLib.WebSocket.prototype[fn] = function () {
    if (!this.__born) this.__born = Date.now();
    if (Date.now() < blackholeUntil && this.__born <= blackholeStart) return;
    return orig.apply(this, arguments);
  };
}
require(path.join(serverDir, 'server.js'));

const CTL_PORT = Number(process.env.CTL_PORT || 19081);
http.createServer((req, res) => {
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET' && req.url === '/stats') {
    return send(200, { upstreamLive: ctl.live.size, connectCalls: ctl.connectCalls, connectCallsByUser: ctl.connectCallsByUser, rss: process.memoryUsage().rss, signKeyUsed: ctl.signOptions });
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let b; try { b = JSON.parse(body || '{}'); } catch (e) { return send(400, { error: 'bad json' }); }
    const u = String(b.user || '').toLowerCase();
    switch (b.cmd) {
      case 'mode': ctl.mode[u] = b.mode; return send(200, { ok: true });
      case 'defaultMode': ctl.defaultMode = b.mode; return send(200, { ok: true });
      case 'blackhole': blackholeStart = Date.now(); blackholeUntil = blackholeStart + (Number(b.ms) || 0); return send(200, { until: blackholeUntil });
      case 'connectDelay': ctl.connectDelayMs = Number(b.ms) || 0; return send(200, { ok: true });
      case 'chat': return send(200, { delivered: ctl.chat(u, b) });
      case 'follow': return send(200, { delivered: ctl.follow(u, b.viewer) });
      case 'dropUpstream': return send(200, { dropped: ctl.dropUpstream(u) });
      case 'streamEnd': return send(200, { ended: ctl.streamEnd(u) });
      case 'burst': {
        const count = Number(b.count) || 1, perMs = Number(b.perMs) || 0;
        let i = 0;
        const one = () => ctl.chat(u, { viewer: (b.prefix || 'v') + i, nickname: (b.prefix || 'v') + i, text: b.text, identity: b.identity, followStatus: b.followStatus });
        if (!perMs) { for (; i < count; i++) one(); return send(200, { sent: count }); }
        const t = setInterval(() => { if (i >= count) { clearInterval(t); return; } one(); i++; }, perMs);
        return send(200, { scheduled: count });
      }
      default: return send(404, { error: 'unknown cmd' });
    }
  });
}).listen(CTL_PORT, () => console.log('[fake-ctl] listening on ' + CTL_PORT));
