'use strict';
// اختبار بالمكتبة الحقيقية tiktok-live-connector 2.5.0 (بدون محاكي) مع سيرفر Euler محاكى محلياً عبر HTTP حقيقي:
// يثبت أن الأخطاء الحقيقية (429 برأس retry-after، 402، 500، انقطاع سيرفر التوقيع، تعليق الطلب) تُصنَّف صحيحاً،
// وأن المزودين (مفتاح ثانٍ / عنوان توقيع بديل / بروكسي) يعملون فعلاً على مستوى HTTP والـWebSocket.
//   node tests/bridge/real-library.test.js
// يحتاج الاتصالات المحلية فقط (127.0.0.1)؛ لا إنترنت ولا تيك توك.
const path = require('path');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');
const serverDir = path.join(__dirname, '../../tiktok-server');
const lib = require(require.resolve('tiktok-live-connector', { paths: [serverDir] }));
const { WebSocketServer } = require(require.resolve('ws', { paths: [serverDir] }));
const WebSocket = require(require.resolve('ws', { paths: [serverDir] }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

// ---------------------------------------------------------------- سيرفر Euler محاكى + سيرفر push (ويب سوكيت) + بروكسي CONNECT
const euler = { requests: [], script: [], defaultAction: 'ok', pushPort: 0 };
function fetchResultBytes() {
  const msg = lib.ProtoMessageFetchResult.decode(new Uint8Array(0));
  msg.cursor = 'cursor-1';
  msg.internalExt = 'ext-1';
  msg.pushServer = 'ws://127.0.0.1:' + euler.pushPort + '/webcast/im/ws_proxy/';
  return Buffer.from(lib.ProtoMessageFetchResult.encode(msg).finish());
}
const eulerServer = http.createServer((req, res) => {
  const key = String(req.headers['x-api-key'] || '');
  euler.requests.push({ at: Date.now(), url: req.url, key, ua: req.headers['user-agent'] });
  const action = euler.script.length ? euler.script.shift() : euler.defaultAction;
  const act = typeof action === 'function' ? action(key) : action;
  if (act === 'hang') return; // لا رد أبداً
  if (act === 'drop') { req.socket.destroy(); return; }
  if (act === '429') { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3) }); res.end(JSON.stringify({ message: 'Rate limit exceeded on this key, slow down please.', limit_label: 'test' })); return; }
  if (act === '402') { res.writeHead(402, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'This key does not have permission to use this feature.' })); return; }
  if (act === '500') { res.writeHead(500, { 'content-type': 'text/plain' }); res.end('internal error'); return; }
  res.writeHead(200, { 'content-type': 'application/protobuf', 'x-set-tt-cookie': 'ttwid=abc; Path=/', 'x-room-id': '7770001', 'x-request-id': 'req-1' });
  res.end(fetchResultBytes());
});
const pushConns = [];
const pushWss = new WebSocketServer({ noServer: true });
const pushServer = http.createServer();
pushServer.on('upgrade', (req, socket, head) => { pushWss.handleUpgrade(req, socket, head, (ws) => { pushConns.push({ ws, viaProxy: !!req.headers['x-test-proxy'] }); }); });

const proxy = { connects: [] };
const proxyServer = http.createServer((req, res) => { res.writeHead(405); res.end(); });
proxyServer.on('connect', (req, clientSocket, head) => {
  proxy.connects.push(req.url);
  const [host, port] = req.url.split(':');
  const upstream = net.connect(Number(port), host, () => { clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); upstream.write(head); upstream.pipe(clientSocket); clientSocket.pipe(upstream); });
  upstream.on('error', () => clientSocket.destroy());
  clientSocket.on('error', () => upstream.destroy());
});
const listen = (srv) => new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv.address().port)));

// ---------------------------------------------------------------- تشغيل سيرفر الجسر الحقيقي
let nextPort = 18400;
async function startBridge(env) {
  const port = nextPort++;
  const child = spawn(process.execPath, [path.join(__dirname, 'start-server-real.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), BRIDGE_HEARTBEAT_MS: '5000', EULER_API_KEY: '', EULER_SIGN_API_KEY: '', SIGN_API_KEY: '', EULER_API_KEYS: '', TIKTOK_PROXIES: '', TIKTOK_SIGN_FALLBACK_URLS: '', TIKTOK_FREE_FALLBACK: '0', TIKTOK_PROGRESS_TICK_MS: '500', TIKTOK_RETRY_BASE_MS: '300', TIKTOK_RETRY_MAX_MS: '800', TIKTOK_MAINTENANCE_MS: '60000' }, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/healthz'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
  return { port, child, log: () => log, health: () => fetch('http://127.0.0.1:' + port + '/health').then((r) => r.json()), stop: () => { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } } };
}
function client(b, user) {
  const ws = new WebSocket('ws://127.0.0.1:' + b.port + '/ws?u=' + user);
  const c = { ws, statuses: [], t0: Date.now() };
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.type === 'bridge_status') c.statuses.push(Object.assign({ at: Date.now() - c.t0 }, m)); });
  c.opened = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  c.connectedAt = () => { const s = c.statuses.find((x) => x.state === 'connected'); return s ? s.at : null; };
  return c;
}
async function until(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(50); } return !!fn(); }
const evLines = (b, ev) => b.log().split('\n').filter((l) => l.includes('event=' + ev));
const bridges = [];
const mk = async (env) => { const b = await startBridge(env); bridges.push(b); return b; };

(async () => {
  const eulerPort = await listen(eulerServer);
  euler.pushPort = await listen(pushServer);
  const proxyPort = await listen(proxyServer);
  const EU = 'http://127.0.0.1:' + eulerPort;

  // ================================================================ 1) نجاح كامل بالمكتبة الحقيقية + مفتاح API
  {
    euler.requests.length = 0; euler.script = []; euler.defaultAction = 'ok';
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE' });
    const c = client(b, 'realok1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 15000);
    check('[1] المكتبة الحقيقية: توقيع HTTP حقيقي + ويب سوكيت حقيقي ← متصل', ok, { afterMs: c.connectedAt(), pushConns: pushConns.length });
    check('[1] طلب التوقيع يحمل X-Api-Key الصحيح واسم المكتبة (المفتاح من EULER_API_KEY)', euler.requests.length === 1 && euler.requests[0].key === 'REAL-KEY-ONE' && /^\/webcast\/rooms\/7770001\/connect/.test(euler.requests[0].url) && /tiktok-live-connector/.test(euler.requests[0].ua || ''), euler.requests.map((r) => ({ url: r.url.split('?')[0], key: r.key })));
    const h = await b.health();
    check('[1] /health: مزود key1 نجح مرة وقاطعه مغلق', h.providers[0].successes === 1 && h.providers[0].breaker === 'closed' && !JSON.stringify(h).includes('REAL-KEY-ONE'), h.providers[0]);
    check('[1] المفتاح لا يظهر في اللوغات إطلاقاً', !b.log().includes('REAL-KEY-ONE'));
    c.ws.close(1000);
  }

  // ================================================================ 2) 429 حقيقي (رأس retry-after) ثم نجاح
  {
    euler.requests.length = 0; euler.script = ['429']; euler.defaultAction = 'ok';
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE' });
    const c = client(b, 'real429'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 20000);
    const fail = evLines(b, 'connect_fail')[0] || '';
    check('[2] 429 حقيقي يُصنَّف rate_limited ويُحترم retry-after=3ث ثم يتصل تلقائياً', ok && /kind=rate_limited/.test(fail) && euler.requests.length === 2 && euler.requests[1].at - euler.requests[0].at >= 2800, { afterMs: c.connectedAt(), gapMs: euler.requests[1] && euler.requests[0] ? euler.requests[1].at - euler.requests[0].at : null });
    check('[2] المستخدم رأى "جاري الاتصال" فقط (لا error) وعُرض العدّ التنازلي', !c.statuses.some((s) => s.state === 'error') && c.statuses.some((s) => s.retryInSec >= 1 || s.etaSec >= 1), c.statuses.filter((s) => s.retryInSec || s.etaSec).slice(0, 2).map((s) => s.message));
    c.ws.close(1000);
  }

  // ================================================================ 3) مفتاحان: الأول يفشل 500 ← تبديل فوري للثاني
  {
    euler.requests.length = 0; euler.script = []; euler.defaultAction = (key) => (key === 'REAL-KEY-ONE' ? '500' : 'ok');
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE', EULER_API_KEYS: 'REAL-KEY-TWO' });
    const c = client(b, 'realfo1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 15000);
    check('[3] خطأ 5xx من مفتاح ← تبديل فوري للمفتاح الثاني ويتصل (بلا انتظار تراجع)', ok && euler.requests.map((r) => r.key).join(',') === 'REAL-KEY-ONE,REAL-KEY-TWO' && c.connectedAt() < 3000, { keys: euler.requests.map((r) => r.key), afterMs: c.connectedAt() });
    check('[3] السبب مسجّل sign_failed وعُدّ تبديل مزود', /kind=sign_failed/.test(evLines(b, 'connect_fail')[0] || '') && evLines(b, 'provider_switch').length === 1);
    c.ws.close(1000);
  }

  // ================================================================ 4) 402 (المفتاح بلا صلاحية) ← provider_denied ثم البديل
  {
    euler.requests.length = 0; euler.script = []; euler.defaultAction = (key) => (key === 'REAL-KEY-ONE' ? '402' : 'ok');
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE', EULER_API_KEYS: 'REAL-KEY-TWO' });
    const c = client(b, 'realdeny1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 15000);
    const h = await b.health();
    check('[4] 402 حقيقي يُصنَّف provider_denied، ويُفتح قاطع ذلك المفتاح لفترة طويلة، ويتصل بالبديل', ok && /kind=provider_denied/.test(evLines(b, 'connect_fail')[0] || '') && h.providers[0].breaker === 'open' && h.providers[0].cooldownSec > 300, { breaker: h.providers[0].breaker, cooldownSec: h.providers[0].cooldownSec });
    c.ws.close(1000);
  }

  // ================================================================ 5) سيرفر التوقيع واقع (ECONNREFUSED) ← عنوان بديل
  {
    euler.requests.length = 0; euler.script = []; euler.defaultAction = 'ok';
    const b = await mk({ SIGN_API_URL: 'http://127.0.0.1:9', TIKTOK_SIGN_FALLBACK_URLS: EU });
    const c = client(b, 'realdown1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 15000);
    const h = await b.health();
    check('[5] سيرفر التوقيع الأساسي واقع (ECONNREFUSED حقيقي) ← تحويل تلقائي لعنوان التوقيع البديل ويتصل', ok && /kind=sign_failed/.test(evLines(b, 'connect_fail')[0] || '') && euler.requests.length === 1 && h.providers.map((p) => p.name).join(',') === 'free/direct,fallback1/direct', { afterMs: c.connectedAt(), providers: h.providers.map((p) => p.name + ':' + p.successes + '/' + JSON.stringify(p.failures)) });
    c.ws.close(1000);
  }

  // ================================================================ 6) سيرفر التوقيع يعلّق ← مهلة الطلب ثم نجاح
  {
    euler.requests.length = 0; euler.script = ['hang']; euler.defaultAction = 'ok';
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE', TIKTOK_SIGN_TIMEOUT_MS: '1500' });
    const c = client(b, 'realhang1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 20000);
    check('[6] طلب توقيع معلّق: ينتهي بمهلة 1.5ث (لا يعلّق للأبد) ثم يعيد ويتصل', ok && euler.requests.length === 2 && /kind=sign_failed/.test(evLines(b, 'connect_fail')[0] || ''), { afterMs: c.connectedAt() });
    c.ws.close(1000);
  }

  // ================================================================ 7) بروكسي: فشل المباشر ← المسار عبر البروكسي (HTTP + WS)
  {
    euler.requests.length = 0; euler.script = ['500']; euler.defaultAction = 'ok';
    proxy.connects.length = 0;
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE', TIKTOK_PROXIES: 'http://proxyuser:secretpw@127.0.0.1:' + proxyPort });
    const h0 = await b.health();
    check('[7] بروكسي مضبوط ← مزودان: مباشر + عبر البروكسي (بلا كشف عنوانه)', h0.providers.map((p) => p.name).join(',') === 'key1/direct,key1/proxy1' && !JSON.stringify(h0).includes(String(proxyPort)), h0.providers.map((p) => p.name));
    const c = client(b, 'realproxy1'); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 15000);
    const sawSign = proxy.connects.some((x) => x === '127.0.0.1:' + eulerPort);
    const sawWs = proxy.connects.some((x) => x === '127.0.0.1:' + euler.pushPort);
    check('[7] بيانات دخول البروكسي (user:pass) لا تظهر في اللوغات', !b.log().includes('secretpw'));
    check('[7] المسار المباشر فشل ← الاتصال يمر عبر البروكسي فعلاً: طلب التوقيع (HTTP) والويب سوكيت كلاهما عبر CONNECT', ok && sawSign && sawWs, { proxyConnects: proxy.connects.length, sawSign, sawWs });
    c.ws.close(1000);
  }

  // ================================================================ 8) انقطاع upstream الحقيقي (السيرفر يقطع الويب سوكيت) ← إعادة اتصال تلقائية
  {
    euler.requests.length = 0; euler.script = []; euler.defaultAction = 'ok';
    const b = await mk({ SIGN_API_URL: EU, EULER_API_KEY: 'REAL-KEY-ONE' });
    const before = pushConns.length;
    const c = client(b, 'realdrop1'); await c.opened;
    await until(() => c.connectedAt() != null, 15000);
    pushConns.slice(before).forEach((p) => p.ws.terminate()); // تيك توك قطع الاتصال
    const back = await until(() => c.statuses.filter((s) => s.state === 'connected').length >= 2, 20000);
    check('[8] قطع تيك توك للويب سوكيت (حقيقي) ← يرجع تلقائياً، والمستخدم يرى reconnecting لا error', back && c.statuses.some((s) => s.state === 'reconnecting') && !c.statuses.some((s) => s.state === 'error'), c.statuses.map((s) => s.state + (s.code ? ':' + s.code : '')));
    c.ws.close(1000);
  }

  bridges.forEach((x) => x.stop());
  [eulerServer, pushServer, proxyServer].forEach((s) => s.close());
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED / ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); bridges.forEach((x) => x.stop()); process.exit(1); });
