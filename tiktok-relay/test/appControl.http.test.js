import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

// يشغّل خادم الجسر الحقيقي (src/index.js) كعملية، مع تزييف نداء التحقق من التوكن فقط، ويختبر مسارات التحكم بالتطبيق عبر HTTP/WS فعلاً.
let proc, port;
const base = () => 'http://127.0.0.1:' + port;
const H = (tok, extra = {}) => ({ Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', Origin: 'https://ehsmaha.com', ...extra });

before(async () => {
  port = 20000 + Math.floor(Math.random() * 5000);
  proc = spawn(process.execPath, ['--import', new URL('./fixtures/fake-identity.mjs', import.meta.url).pathname, 'src/index.js'], {
    cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(port), FIREBASE_WEB_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: '', DISABLE_TEST_HARNESS: '1' }, stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) { try { const r = await fetch(base() + '/healthz'); if (r.ok) return; } catch (e) { /* */ } await new Promise((r) => setTimeout(r, 100)); }
  throw new Error('server did not start');
});
after(() => { if (proc) proc.kill(); });

function connectApp(id, v = '1.1.3') {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + port + '/desktop-app/ws'); const msgs = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', installId: id, version: v, platform: 'win32' })));
    ws.on('message', (d) => { msgs.push(JSON.parse(String(d))); });
    ws.on('error', reject);
    setTimeout(() => resolve({ ws, msgs }), 400);
  });
}

test('admin endpoints: owner only (token + email), origin-locked, CORS', async () => {
  assert.equal((await fetch(base() + '/desktop-app/admin/stats', { headers: { Origin: 'https://ehsmaha.com' } })).status, 401);
  assert.equal((await fetch(base() + '/desktop-app/admin/stats', { headers: H('user-token') })).status, 401, 'non-owner refused');
  assert.equal((await fetch(base() + '/desktop-app/admin/stats', { headers: H('owner-token', { Origin: 'https://evil.com' }) })).status, 403, 'bad origin refused');
  const ok = await fetch(base() + '/desktop-app/admin/stats', { headers: H('owner-token') });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('access-control-allow-origin'), 'https://ehsmaha.com');
  const pre = await fetch(base() + '/desktop-app/admin/notify', { method: 'OPTIONS', headers: { Origin: 'https://ehsmaha.com', 'Access-Control-Request-Method': 'POST' } });
  assert.equal(pre.status, 204);
});

test('full flow over the real server: app connects → stats show online → owner notify reaches the app → config pushed', async () => {
  const a = await connectApp('a'.repeat(32)); const b = await connectApp('b'.repeat(32), '1.1.2');
  let st = await (await fetch(base() + '/desktop-app/admin/stats', { headers: H('owner-token') })).json();
  assert.equal(st.onlineNow, 2); assert.equal(st.installs >= 2, true); assert.equal(st.onlineVersions['1.1.3'], 1); assert.equal(st.onlineVersions['1.1.2'], 1);
  assert.equal(st.downloads.total, 5);
  const n = await fetch(base() + '/desktop-app/admin/notify', { method: 'POST', headers: H('owner-token'), body: JSON.stringify({ title: 'اختبار', body: 'نص', target: 'store' }) });
  const nj = await n.json(); assert.equal(n.status, 200); assert.equal(nj.delivered, 2);
  await new Promise((r) => setTimeout(r, 300));
  for (const x of [a, b]) { const got = x.msgs.find((m) => m.type === 'notify'); assert.ok(got && got.title === 'اختبار' && got.target === 'store', JSON.stringify(x.msgs)); }
  const c = await fetch(base() + '/desktop-app/admin/config', { method: 'POST', headers: H('owner-token'), body: JSON.stringify({ codeLoginEnabled: false, minVersion: '1.1.3' }) });
  assert.equal(c.status, 200);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(a.msgs.some((m) => m.type === 'config' && m.config.codeLoginEnabled === false && m.config.minVersion === '1.1.3'));
  // حجب الإشعارات من المالك
  await fetch(base() + '/desktop-app/admin/config', { method: 'POST', headers: H('owner-token'), body: JSON.stringify({ notificationsEnabled: false }) });
  const blocked = await fetch(base() + '/desktop-app/admin/notify', { method: 'POST', headers: H('owner-token'), body: JSON.stringify({ title: 'x' }) });
  assert.equal(blocked.status, 409);
  a.ws.close(); b.ws.close(); await new Promise((r) => setTimeout(r, 300));
  st = await (await fetch(base() + '/desktop-app/admin/stats', { headers: H('owner-token') })).json();
  assert.equal(st.onlineNow, 0);
});

test('anonymous app sockets: garbage/oversize hello is rejected; admin path requires owner even via WS-less probing', async () => {
  const bad = await new Promise((resolve) => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/desktop-app/ws'); ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', installId: 'nope' }))); ws.on('close', (c) => resolve(c)); });
  assert.equal(bad, 4003);
  const big = await new Promise((resolve) => { const ws = new WebSocket('ws://127.0.0.1:' + port + '/desktop-app/ws'); ws.on('open', () => ws.send('x'.repeat(5000))); ws.on('close', (c) => resolve(c)); });
  assert.ok(big === 1009 || big === 1006, 'oversize closed: ' + big);
});
