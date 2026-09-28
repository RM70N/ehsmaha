'use strict';
// حمل السيرفر: N ستريمر × M عميل لكل واحد (تبويبات/أجهزة)، و R رسالة/ث لكل ستريمر.
// يقيس: اتصالات upstream (المفروض = N)، ذاكرة العملية، وزمن وصول الحدث (p50/p99).
//   BRIDGE_HEARTBEAT_MS=20000 PORT=18093 CTL_PORT=19093 node tests/bridge/start-server.js &
//   node tests/bridge/server-load.test.js [N=20] [M=15] [R=20] [seconds=15]
const path = require('path');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));
const PORT = Number(process.env.T_PORT || 18093), CTL = Number(process.env.T_CTL || 19093);
const [N, M, R, SEC] = [2, 3, 4, 5].map((i, k) => Number(process.argv[i] || [20, 15, 20, 15][k]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (b) => fetch('http://127.0.0.1:' + CTL + '/ctl', { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const stats = () => fetch('http://127.0.0.1:' + CTL + '/stats').then((r) => r.json());
(async () => {
  const rss0 = (await stats()).rss;
  const lat = []; let received = 0;
  const clients = [];
  for (let s = 0; s < N; s++) for (let c = 0; c < M; c++) {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?u=load' + s);
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (!m.messages) return;
      m.messages.forEach((x) => { received++; const t = Number(String(x.comment).split('|')[1]); if (t) lat.push(Date.now() - t); });
    });
    clients.push(ws);
  }
  await sleep(2000);
  const st1 = await stats();
  const t0 = Date.now();
  let sent = 0;
  while (Date.now() - t0 < SEC * 1000) {
    const tick = Date.now();
    for (let s = 0; s < N; s++) for (let k = 0; k < R / 10; k++) { await ctl({ cmd: 'chat', user: 'load' + s, viewer: 'v' + k, text: 'msg|' + Date.now() }); sent++; }
    await sleep(Math.max(0, 100 - (Date.now() - tick)));
  }
  await sleep(1500);
  const st2 = await stats();
  lat.sort((a, b) => a - b);
  const p = (q) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
  const res = { streamers: N, clientsPerStreamer: M, wsClients: N * M, msgsSentPerStreamerPerSec: +(sent / N / SEC).toFixed(1), eventsDelivered: received, expectedDeliveries: sent * M, upstreamConnections: st1.upstreamLive, connectCalls: st2.connectCalls, rssMB: { before: +(rss0 / 1048576).toFixed(0), connected: +(st1.rss / 1048576).toFixed(0), afterLoad: +(st2.rss / 1048576).toFixed(0) }, latencyMs: { p50: p(0.5), p99: p(0.99), max: lat[lat.length - 1] } };
  console.log(JSON.stringify(res, null, 1));
  clients.forEach((w) => w.close(1000));
  const ok = res.upstreamConnections === N && res.eventsDelivered === res.expectedDeliveries;
  console.log(ok ? 'PASS upstream = N and all events delivered' : 'FAIL');
  await sleep(300);
  process.exit(ok ? 0 : 1);
})();
