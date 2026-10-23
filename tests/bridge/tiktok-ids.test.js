'use strict';
// صيغ يوزر تيك توك المختلفة (رابط/@/حروف كبيرة/رموز اتجاه خفية/مسافات) على server.js الحقيقي:
// كلها غرفة واحدة واتصال واحد بتيك توك، والصيغ المستحيلة تُرد فوراً بـ«يوزر غير موجود» (4404) بلا فتح غرفة.
//   PORT=18097 CTL_PORT=19097 node tests/bridge/start-server.js &
//   T_PORT=18097 T_CTL=19097 node tests/bridge/tiktok-ids.test.js
const path = require('path');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));
const PORT = Number(process.env.T_PORT || 18097), CTL = Number(process.env.T_CTL || 19097);
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : '')); };
const same = ['Streamer1', '@streamer1', ' streamer1 ', 'https://www.tiktok.com/@streamer1/live', 'https://www.tiktok.com/@streamer1', 'tiktok.com/@streamer1', 'https://tiktok.com/@Streamer1/live?lang=ar', 'www.tiktok.com/@streamer1?is_from_webapp=1', 'streamer1‏', '‎Streamer1', 'streamer1​', '@@streamer1', 'streamer1/'];
const bad = ['streamer 1', 'اسم عربي', 'a', 'https://vm.tiktok.com/ZMabc/', 'user!x', 'x'.repeat(40)];
function probe(v, ms = 2500) {
  return new Promise((res) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?u=' + encodeURIComponent(v));
    const st = []; let code = null;
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} }, ms);
    ws.on('message', (m) => { try { const d = JSON.parse(m); if (d.type === 'bridge_status') st.push(d.state + (d.code ? ':' + d.code : '')); } catch (e) {} });
    ws.on('close', (c) => { code = c; clearTimeout(t); res({ st, code }); });
    ws.on('error', () => {});
  });
}
(async () => {
  await fetch('http://127.0.0.1:' + CTL + '/ctl', { method: 'POST', body: JSON.stringify({ cmd: 'reset' }) });
  const before = await (await fetch('http://127.0.0.1:' + PORT + '/healthz')).json();
  const outs = [];
  for (const v of ['streamer1'].concat(same)) outs.push([v, await probe(v)]);
  const stats = await (await fetch('http://127.0.0.1:' + CTL + '/stats')).json();
  const after = await (await fetch('http://127.0.0.1:' + PORT + '/healthz')).json();
  check('كل الصيغ (' + (same.length + 1) + ') اتصلت فعلاً', outs.every(([, o]) => o.st.includes('connected')), outs.filter(([, o]) => !o.st.includes('connected')).map(([v]) => v));
  check('غرفة واحدة فقط على السيرفر (لا غرف مكرّرة)', after.rooms - before.rooms === 1, { before: before.rooms, after: after.rooms });
  check('اتصال واحد فقط بتيك توك/Euler لنفس الستريمر', stats.connectCalls === 1 && Object.keys(stats.connectCallsByUser).join() === 'streamer1', stats.connectCallsByUser);
  const outsBad = [];
  for (const v of bad) outsBad.push([v, await probe(v, 1500)]);
  check('الصيغ المستحيلة: «يوزر غير موجود» فوراً + إغلاق 4404', outsBad.every(([, o]) => o.st.includes('error:user_not_found') && o.code === 4404), outsBad.map(([v, o]) => [v.slice(0, 12), o]));
  const afterBad = await (await fetch('http://127.0.0.1:' + PORT + '/healthz')).json();
  check('الصيغ المستحيلة ما فتحت غرفاً ولا اتصالات', afterBad.rooms === after.rooms, { rooms: afterBad.rooms });
  const bad0 = results.filter((x) => !x).length;
  console.log('\n' + (results.length - bad0) + '/' + results.length + ' passed');
  process.exit(bad0 ? 1 : 0);
})();
