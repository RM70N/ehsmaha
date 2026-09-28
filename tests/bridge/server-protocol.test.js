'use strict';
// اختبار بروتوكول السيرفر مباشرة (بدون متصفح): followKnown، النبض، ids، الإعادة، مهلة الانقطاع.
//   BRIDGE_HEARTBEAT_MS=1000 PORT=18091 CTL_PORT=19091 node tests/bridge/start-server.js &
//   node tests/bridge/server-protocol.test.js
const path = require('path');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));
const PORT = Number(process.env.T_PORT || 18091), CTL = Number(process.env.T_CTL || 19091);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (b) => fetch('http://127.0.0.1:' + CTL + '/ctl', { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const stats = () => fetch('http://127.0.0.1:' + CTL + '/stats').then((r) => r.json());
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
function open(user, since) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?u=' + user + (since ? '&since=' + since : ''));
  ws.msgs = [];
  ws.on('message', (d) => ws.msgs.push(JSON.parse(d)));
  return new Promise((r) => ws.on('open', () => r(ws)));
}
(async () => {
  const a = await open('proto1');
  await sleep(300);
  check('status connected', a.msgs.some((m) => m.type === 'bridge_status' && m.state === 'connected'));
  await ctl({ cmd: 'chat', user: 'proto1', viewer: 'v1', text: 'مرحبا', identity: { isFollowerOfAnchor: true } });
  await sleep(150);
  const chat1 = a.msgs.find((m) => m.messages);
  const id1 = chat1 && chat1.messages[0].id;
  check('event has id', /^[a-z0-9]+\.\d+$/.test(id1 || ''), id1);
  check('follower via userIdentity', chat1 && chat1.messages[0].user.isFollower === true && chat1.messages[0].user.followKnown === true);
  await sleep(1300);
  check('bridge_ping received', a.msgs.some((m) => m.type === 'bridge_ping'));
  // انقطاع غير طبيعي (terminate) ثم أحداث أثناء الغياب ثم رجوع بـsince
  a.terminate();
  await sleep(200);
  await ctl({ cmd: 'chat', user: 'proto1', viewer: 'v2', text: 'فاتتك 1' });
  await ctl({ cmd: 'chat', user: 'proto1', viewer: 'v3', text: 'فاتتك 2' });
  await sleep(5600); // أطول من مهلة الإغلاق العادية 5ث
  check('room kept after abnormal drop (>5s)', (await stats()).upstreamLive === 1);
  const b = await open('proto1', id1);
  await sleep(300);
  const rep = b.msgs.find((m) => m.replay);
  check('replay of missed events', rep && rep.messages.map((x) => x.comment).join('|') === 'فاتتك 1|فاتتك 2', rep && rep.messages.map((x) => x.comment));
  const c = await open('proto1', 'zzz.1');
  await sleep(300);
  check('no replay for foreign boot id', !c.msgs.some((m) => m.replay));
  c.close(1000);
  // إغلاق طبيعي ← الغرفة تنقفل بعد ~5ث
  b.close(1000);
  await sleep(5600);
  check('room torn down after normal close', (await stats()).upstreamLive === 0);
  // عميل ميت لا يرد pong ← يُطرد بالنبض
  const d = await open('proto2');
  d._socket.pause(); // يوقف القراءة فما يرد pong
  d.pong = () => {}; d.on('ping', () => {});
  await sleep(3500);
  // من جهة السيرفر: العميل الموقوف ما رد pong فطُرد (1006) — نقرأ لوغ السيرفر
  const logFile = process.env.T_LOG || '/tmp/ehsmaha-bridge-test/proto.log';
  const logText = require('fs').readFileSync(logFile, 'utf8');
  check('dead client terminated by heartbeat', /tiktok:proto2 — عميل انفصل \(1006\)/.test(logText));
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  process.exit(bad ? 1 : 0);
})();
