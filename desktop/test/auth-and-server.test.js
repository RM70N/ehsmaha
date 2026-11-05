'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { AuthBridge, signInScript } = require('../src/auth-bridge');
const { LocalSiteServer } = require('../src/server');
const { ROOT_FILES, DIRS } = require('../scripts/site-files');
const { makeSite, BASE } = require('./helpers');

test('auth: state single-use, port range, origin, expiry', () => {
  let t = 0;
  const a = new AuthBridge({ now: () => t });
  assert.equal(a.begin(80), null);
  const { state, url } = a.begin(43711);
  assert.match(url, /^https:\/\/ehsmaha\.com\/desktop-auth\.html\?port=43711&state=[a-f0-9]{32}$/);
  const body = `state=${state}&idToken=abc&accessToken=def`;
  assert.equal(a.complete({ origin: 'https://evil.com', host: '127.0.0.1:43711', body }).reason, 'bad-origin');
  assert.equal(a.complete({ origin: 'https://ehsmaha.com', host: '127.0.0.1:43712', body }).reason, 'port-mismatch');
  // the failed attempt above consumed nothing? port-mismatch consumes state => safer
  const b = a.begin(43711);
  const ok = a.complete({ origin: 'https://ehsmaha.com', host: '127.0.0.1:43711', body: `state=${b.state}&idToken=abc` });
  assert.equal(ok.ok, true);
  assert.equal(a.complete({ origin: 'https://ehsmaha.com', host: '127.0.0.1:43711', body: `state=${b.state}&idToken=abc` }).reason, 'unknown-state');
  const c = a.begin(43711); t += 6 * 60 * 1000;
  assert.equal(a.complete({ origin: 'https://ehsmaha.com', host: '127.0.0.1:43711', body: `state=${c.state}&idToken=x` }).reason, 'expired');
  assert.equal(a.complete({ origin: 'https://ehsmaha.com', host: '127.0.0.1:43711', body: 'state=zz&idToken=x' }).reason, 'unknown-state');
});

test('auth: sign-in script safely embeds tokens as JSON strings', () => {
  const s = signInScript('a"+alert(1)+"', 'b');
  assert.ok(s.includes('"a\\"+alert(1)+\\""'));
  new Function(s); // syntax valid
});

function req(port, { method = 'GET', p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method, headers }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch).toString() }));
    });
    r.on('error', reject); if (body) r.write(body); r.end();
  });
}

test('server: SPA fallback only for extension-less paths; missing assets 404; callback POST', async () => {
  const { dir } = makeSite(BASE);
  const s = new LocalSiteServer();
  const port = await s.start(dir, 45100);
  try {
    assert.equal((await req(port, { p: '/lib/app.js' })).status, 200);
    assert.equal((await req(port, { p: '/lib/nope.js' })).status, 404);
    const spa = await req(port, { p: '/games/some-game' });
    assert.equal(spa.status, 200); assert.match(spa.headers['content-type'], /html/);
    assert.equal((await req(port, { p: '/../../etc/passwd' })).status, 200); // normalized to index fallback, not file
    assert.equal((await req(port, { p: '/', headers: { Host: 'evil.com' } })).status, 403);
    assert.equal((await req(port, { method: 'POST', p: '/x' })).status, 405);
    s.setPostHandler((rq, body) => ({ status: 200, html: 'got:' + body.length }));
    const r = await req(port, { method: 'POST', p: '/__auth/callback', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'state=1' });
    assert.equal(r.status, 200); assert.equal(r.body, 'got:7');
    const big = await req(port, { method: 'POST', p: '/__auth/callback', body: 'x'.repeat(20000) });
    assert.equal(big.status, 400);
  } finally { s.stop(); }
});

test('site-files list matches pages.yml (copy line + dirs + paths filter)', () => {
  const yml = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'workflows', 'pages.yml'), 'utf8');
  const cpLine = yml.split('\n').find((l) => /^\s*cp index\.html /.test(l));
  const copied = cpLine.trim().replace(/^cp /, '').split(/\s+/).filter((x) => x !== '_site/' && x !== 'CNAME');
  assert.deepEqual([...copied].sort(), [...ROOT_FILES].sort());
  const dirs = [...yml.matchAll(/cp -r ([\w-]+) _site\/[\w-]+/g)].map((m) => m[1]);
  for (const d of dirs) assert.ok(DIRS.includes(d), 'dir missing from site-files: ' + d);
  for (const d of DIRS.filter((x) => !x.includes('/'))) assert.ok(dirs.includes(d), 'dir missing from pages.yml: ' + d);
  for (const f of ROOT_FILES) assert.ok(yml.includes('      - ' + f), 'paths filter missing: ' + f);
});

test('every file in site-files exists in repo root', () => {
  const root = path.join(__dirname, '..', '..');
  for (const f of ROOT_FILES) assert.ok(fs.existsSync(path.join(root, f)), f);
  for (const d of DIRS) assert.ok(fs.existsSync(path.join(root, d)), d);
});

test('desktop-auth.html must not set referrer=no-referrer (browser would send Origin: null)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop-auth.html'), 'utf8');
  assert.ok(!/<meta[^>]+name=["']referrer["'][^>]+no-referrer/i.test(html));
  assert.ok(/43711/.test(html) && /__auth\/callback/.test(html));
});

test('redeemLinkCode: validates locally, maps server errors, never throws', async () => {
  const { redeemLinkCode, customTokenScript } = require('../src/auth-bridge');
  const api = 'http://x';
  assert.equal((await redeemLinkCode('123', { postJson: async () => { throw new Error('no'); }, api })).error, 'invalid_code');
  assert.equal((await redeemLinkCode('ABCD-EFGH', { postJson: async () => { throw new Error('no'); }, api })).error, 'network');
  assert.equal((await redeemLinkCode('ABCDEFGH', { postJson: async () => ({ status: 400, json: { error: 'invalid_code' } }), api })).error, 'invalid_code');
  assert.equal((await redeemLinkCode('ABCDEFGH', { postJson: async () => ({ status: 429, json: { error: 'rate_limited' } }), api })).error, 'rate_limited');
  let sent; const ok = await redeemLinkCode('abcd-efgh', { postJson: async (u, b) => { sent = [u, b]; return { status: 200, json: { customToken: 'x'.repeat(40) } }; }, api });
  assert.deepEqual(sent, ['http://x/desktop-auth/redeem', { code: 'ABCDEFGH' }]); assert.equal(ok.ok, true);
  const sc = customTokenScript('t"+alert(1)+"'); new Function(sc); assert.ok(sc.includes('\\"+alert(1)+\\"'));
});

test('requestLinkCode: validates username locally and maps responses', async () => {
  const { requestLinkCode } = require('../src/auth-bridge');
  const api = 'http://x';
  assert.equal((await requestLinkCode('a', { postJson: async () => ({}), api })).error, 'invalid_username');
  assert.equal((await requestLinkCode('a b', { postJson: async () => ({}), api })).error, 'invalid_username');
  let sent; const ok = await requestLinkCode(' @Sultan ', { postJson: async (u, b) => { sent = [u, b]; return { status: 200, json: { ok: true, delivered: true } }; }, api });
  assert.deepEqual(sent, ['http://x/desktop-auth/request', { username: 'Sultan' }]); assert.deepEqual(ok, { ok: true, delivered: true });
  assert.equal((await requestLinkCode('sultan', { postJson: async () => { throw new Error('n'); }, api })).error, 'network');
  assert.equal((await requestLinkCode('sultan', { postJson: async () => ({ status: 429, json: { error: 'rate_limited' } }), api })).error, 'rate_limited');
});

test('site-manifest CLI works exactly as pages.yml calls it (dir only, and with --out)', () => {
  const { execFileSync } = require('child_process');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-site-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html></html>');
  const cli = path.join(__dirname, '..', 'scripts', 'site-manifest.js');
  execFileSync(process.execPath, [cli, dir]);
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'content-manifest.json'), 'utf8'));
  assert.equal(m.files.length, 1);
  const out = path.join(dir, 'x.json');
  execFileSync(process.execPath, [cli, dir, '--out', out]);
  assert.ok(fs.existsSync(out));
});

test('requestLinkCode: accepts an email, maps lookup_unavailable', async () => {
  const { requestLinkCode } = require('../src/auth-bridge');
  let sent; const ok = await requestLinkCode('Me@Mail.com', { postJson: async (u, b) => { sent = b; return { status: 200, json: { ok: true, delivered: true } }; }, api: 'http://x' });
  assert.deepEqual(sent, { username: 'Me@Mail.com' }); assert.equal(ok.ok, true);
  assert.equal((await requestLinkCode('x', { postJson: async () => ({}), api: 'http://x' })).error, 'invalid_username');
  assert.equal((await requestLinkCode('sultan', { postJson: async () => ({ status: 503, json: { error: 'lookup_unavailable' } }), api: 'http://x' })).error, 'lookup_unavailable');
});

test('auto-install policy: never during a round, only when user is away or long idle', () => {
  const { shouldInstallNow, MIN_UPTIME_MS, IDLE_FOCUSED_MS } = require('../src/auto-install');
  const away = { visible: false, focused: false, minimized: false };
  const base = { ready: true, idle: true, win: away, uptimeMs: MIN_UPTIME_MS + 1, idleSinceMs: 0 };
  assert.equal(shouldInstallNow({ ...base, ready: false }).install, false);
  assert.equal(shouldInstallNow({ ...base, uptimeMs: 1000 }).reason, 'just-started');
  assert.equal(shouldInstallNow({ ...base, idle: false }).reason, 'busy');           // جولة/بث نشط
  assert.equal(shouldInstallNow({ ...base, idle: false, win: away }).install, false);  // حتى لو المستخدم بعيد
  assert.deepEqual(shouldInstallNow(base), { install: true, reason: 'user-away' });
  assert.equal(shouldInstallNow({ ...base, win: { visible: true, focused: false, minimized: true } }).install, true);
  const present = { visible: true, focused: true, minimized: false };
  assert.equal(shouldInstallNow({ ...base, win: present }).reason, 'user-present');
  assert.equal(shouldInstallNow({ ...base, win: present, idleSinceMs: IDLE_FOCUSED_MS }).reason, 'long-idle');
});

test('AppLink: hello, validates/dedups owner notifications, sanitises config, reconnects with backoff, stops cleanly', () => {
  const { AppLink, cmpVer } = require('../src/app-link');
  const sent = []; const inst = [];
  class FakeWS { constructor(u) { this.u = u; this.readyState = 1; inst.push(this); } send(d) { sent.push(JSON.parse(d)); } close() { this.closed = true; } }
  const timers = []; const notes = []; const cfgs = [];
  const l = new AppLink({ WebSocketImpl: FakeWS, url: 'ws://x/desktop-app/ws', installId: 'a'.repeat(32), version: '1.1.2', platform: 'win32',
    onNotify: (m) => notes.push(m), onConfig: (c) => cfgs.push(c), setTimeoutImpl: (fn, ms) => { timers.push([fn, ms]); return { unref() {} }; }, clearTimeoutImpl: () => {} });
  l.start(); inst[0].onopen();
  assert.deepEqual(sent[0], { type: 'hello', installId: 'a'.repeat(32), version: '1.1.2', platform: 'win32' });
  const msg = (o) => inst[0].onmessage({ data: JSON.stringify(o) });
  msg({ type: 'notify', id: 'n1', title: 'مرحبا', body: 'x', target: 'home', sentAt: 5 });
  msg({ type: 'notify', id: 'n1', title: 'مكرر' });            // dedup
  msg({ type: 'notify', title: 'بلا id' }); msg({ type: 'notify', id: 'n2' }); msg({ type: 'evil' }); inst[0].onmessage({ data: 'not json' });
  assert.deepEqual(notes.map((n) => n.id), ['n1']);
  msg({ type: 'config', config: { motd: { text: 'صيانة', id: 'm1', active: true }, minVersion: 'abc', codeLoginEnabled: false, junk: 1 } });
  assert.deepEqual(cfgs[0], { motd: { text: 'صيانة', id: 'm1', active: true }, minVersion: '', codeLoginEnabled: false });
  inst[0].onclose(); assert.equal(timers.length, 1); assert.ok(timers[0][1] >= 2000 && timers[0][1] < 3100);
  timers[0][0](); assert.equal(inst.length, 2);
  inst[1].onclose(); assert.ok(timers[1][1] >= 4000);
  timers[1][0](); assert.equal(inst.length, 3);
  l.stop(); assert.equal(inst[2].closed, true); assert.equal(inst[2].onclose, null); assert.equal(timers.length, 2, 'no reconnect after stop');
  assert.equal(cmpVer('1.1.2', '1.1.10') < 0, true); assert.equal(cmpVer('2.0.0', '1.9.9') > 0, true);
});

test('download page always points at the LATEST release asset and never shows a hard-coded old version', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'windows-app.html'), 'utf8');
  assert.match(html, /windowsUrl:\s*"https:\/\/github\.com\/rm70n\/ehsmaha\/releases\/latest\/download\/ehsmaha-setup\.exe"/);
  assert.ok(!/releases\/download\/v\d/.test(html), 'no pinned version URL');
  assert.match(html, /fallbackRelease:\s*\{\}/);
  assert.match(html, /releases\/latest"/); // يقرأ آخر إصدار من API للرقم والحجم
  // اسم الأصل ثابت بين الإصدارات (يعتمد عليه الرابط الثابت)
  const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');
  assert.match(yml, /artifactName:\s*ehsmaha-setup\.\$\{ext\}/);
});
