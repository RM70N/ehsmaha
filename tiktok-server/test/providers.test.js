'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ProviderPool, loadProviderDefs, buildConnectionOptions } = require('../lib/providers');
const { FakeClock } = require('./helpers');

const mk = (env) => loadProviderDefs(env, { signUrl: 'https://sign.example' });

test('env: no key -> free tier is the primary provider', () => {
  const r = mk({});
  assert.equal(r.keyCount, 0);
  assert.deepEqual(r.defs.map((d) => [d.name, d.tier, d.free]), [['free/direct', 0, true]]);
});

test('env: EULER_API_KEY beats legacy names; legacy names still work alone', () => {
  assert.equal(mk({ EULER_API_KEY: 'A', EULER_SIGN_API_KEY: 'B' }).defs[0].apiKey, 'A');
  assert.equal(mk({ EULER_SIGN_API_KEY: 'B' }).defs[0].apiKey, 'B');
  assert.equal(mk({ SIGN_API_KEY: 'C' }).defs[0].apiKey, 'C');
  assert.equal(mk({ EULER_API_KEY: '  ' }).keyCount, 0);
});

test('env: several keys + fallback url + proxies + free last resort', () => {
  const r = mk({ EULER_API_KEY: 'SECRET-A', EULER_API_KEYS: 'SECRET-B,SECRET-A, SECRET-C', EULER_API_KEY_2: 'SECRET-D', TIKTOK_SIGN_FALLBACK_URLS: 'https://b.example', TIKTOK_PROXIES: 'http://user:pw@proxyhost:8080' });
  assert.equal(r.keyCount, 4, 'deduped');
  const names = r.defs.map((d) => d.name);
  assert.ok(names.includes('key1/direct') && names.includes('key1/proxy1') && names.includes('key4/proxy1'));
  assert.ok(names.includes('fallback1/direct'));
  assert.equal(r.defs.at(-1).name, 'free/direct');
  assert.equal(r.defs.at(-1).tier, 5, 'sequential: after 4 keys + 1 fallback url');
  assert.ok(r.defs.every((d) => !/SECRET|proxyhost|pw@/.test(d.name)), 'names never leak secrets');
  assert.equal(mk({ EULER_API_KEY: 'k', TIKTOK_FREE_FALLBACK: '0' }).defs.length, 1);
});

test('env: provider count is capped', () => {
  const keys = Array.from({ length: 30 }, (_, i) => 'k' + i).join(',');
  assert.ok(mk({ EULER_API_KEYS: keys }).defs.length <= 16);
});

function pool(defs, clock, opts) {
  return new ProviderPool(defs, Object.assign({ now: clock.now, ratePerMin: 600, burst: 100, inFlight: 100 }, opts || {}));
}
const D = (name, tier = 0, extra) => Object.assign({ name, tier, apiKey: name, signUrl: 'u', route: 'direct', proxyUrl: '', free: false }, extra || {});

test('pick spreads load within a tier (least in-flight, then least recently used)', () => {
  const c = new FakeClock();
  const p = pool([D('a'), D('b')], c);
  const seen = [];
  for (let i = 0; i < 4; i++) { const r = p.pick(); seen.push(r.provider.name); p.begin(r.provider); c.t += 10; }
  assert.deepEqual(seen, ['a', 'b', 'a', 'b']);
});

test('exclude skips providers; all excluded -> waitMs null', () => {
  const c = new FakeClock();
  const p = pool([D('a'), D('b')], c);
  assert.equal(p.pick(new Set([0])).provider.name, 'b');
  assert.equal(p.pick(new Set([0, 1])).waitMs, null);
});

test('429 trips that provider only; traffic moves to the backup immediately', () => {
  const c = new FakeClock();
  const p = pool([D('a'), D('b')], c);
  const a = p.pick().provider; p.begin(a);
  p.end(a, { kind: 'rate_limited', retryAfterMs: 45000 });
  assert.equal(a.breaker.state, 'open');
  assert.equal(p.pick().provider.name, 'b');
  assert.equal(a.limiter.penalties, 1);
});

test('tiers: a lower tier is used only while the higher tier is breaker-blocked, not for momentary congestion', () => {
  const c = new FakeClock();
  const p = new ProviderPool([D('primary', 0), D('backup', 1)], { now: c.now, ratePerMin: 60, burst: 1, inFlight: 1 });
  const a = p.pick().provider; p.begin(a);           // يستهلك الرمز الوحيد + خانة in-flight
  const r = p.pick();
  assert.equal(r.provider, undefined, 'must wait for primary, not fall to backup');
  assert.ok(r.waitMs > 0);
  p.end(a, { kind: 'sign_failed' }); p.begin(p.providers[0]); p.end(p.providers[0], { kind: 'sign_failed' }); p.begin(p.providers[0]); p.end(p.providers[0], { kind: 'sign_failed' });
  assert.equal(p.providers[0].breaker.state, 'open');
  c.t += 5000;
  assert.equal(p.pick().provider.name, 'backup');
});

test('provider_denied (key lacks permission) opens the breaker for a long cooldown', () => {
  const c = new FakeClock();
  const p = pool([D('a')], c, { deniedCooldownMs: 600000, breakerMaxCooldownMs: 900000 });
  p.begin(p.providers[0]); p.end(p.providers[0], { kind: 'provider_denied' });
  assert.equal(p.providers[0].breaker.waitMs(), 600000);
});

test('user errors (offline/not_found/blocked) do not damage provider health', () => {
  const c = new FakeClock();
  const p = pool([D('a')], c);
  for (const kind of ['offline', 'user_not_found', 'blocked', 'transient']) { p.begin(p.providers[0]); p.end(p.providers[0], { kind }); }
  assert.equal(p.providers[0].breaker.state, 'closed');
  assert.equal(p.providers[0].limiter.penalties, 0);
});

test('snapshot exposes health without secrets', () => {
  const c = new FakeClock();
  const p = pool([D('key1/direct', 0, { apiKey: 'SECRET', proxyUrl: 'http://u:pw@px' })], c);
  const s = JSON.stringify(p.snapshot());
  assert.ok(!s.includes('SECRET') && !s.includes('pw@px'));
  assert.ok(s.includes('key1/direct'));
});

test('buildConnectionOptions: per-provider Euler client with key/basePath/timeout; proxy agent for HTTP+WS', () => {
  const lib = require('tiktok-live-connector');
  const sdk = require('tiktok-live-api-sdk');
  const { HttpsProxyAgent } = require('https-proxy-agent');
  const c = new FakeClock();
  const p = pool([D('key1/direct', 0, { apiKey: 'KEY-1', signUrl: 'https://sign.example' }), D('key2/proxy1', 0, { apiKey: 'KEY-2', signUrl: 'https://sign.example', route: 'proxy1', proxyUrl: 'http://127.0.0.1:3128' })], c);
  const o1 = buildConnectionOptions(p.providers[0], { lib, sdk, HttpsProxyAgent, signTimeoutMs: 7000 });
  const cfg = o1.eulerApiInstance.configuration;
  assert.equal(cfg.basePath, 'https://sign.example');
  assert.equal(cfg.baseOptions.headers['X-Api-Key'], 'KEY-1');
  assert.equal(cfg.baseOptions.timeout, 7000);
  assert.equal(cfg.baseOptions.validateStatus(429), true, 'library reads response.status itself');
  assert.ok(/^tiktok-live-connector\//.test(cfg.baseOptions.headers['User-Agent']));
  assert.equal(o1.processInitialData, false);
  assert.equal(o1.webClientOptions, undefined);
  assert.equal(buildConnectionOptions(p.providers[0], { lib, sdk, HttpsProxyAgent }).eulerApiInstance, o1.eulerApiInstance, 'client cached per provider');
  const o2 = buildConnectionOptions(p.providers[1], { lib, sdk, HttpsProxyAgent });
  assert.equal(o2.eulerApiInstance.configuration.baseOptions.headers['X-Api-Key'], 'KEY-2');
  assert.ok(o2.eulerApiInstance.configuration.baseOptions.httpsAgent instanceof HttpsProxyAgent);
  assert.equal(o2.eulerApiInstance.configuration.baseOptions.proxy, false);
  assert.ok(o2.wsClientOptions.agent instanceof HttpsProxyAgent);
  assert.ok(o2.webClientOptions.agent.https instanceof HttpsProxyAgent);
  assert.notEqual(o1.eulerApiInstance, o2.eulerApiInstance);
});

test('sequential (default): each key is its own tier — key1 first, key2 only when key1 is down, free tier last', () => {
  const r = mk({ EULER_API_KEY: 'A', EULER_API_KEYS: 'B,C' });
  assert.equal(r.sequential, true);
  assert.deepEqual(r.defs.map((d) => [d.name, d.tier]), [['key1/direct', 0], ['key2/direct', 1], ['key3/direct', 2], ['free/direct', 3]]);
  assert.deepEqual(mk({ EULER_API_KEY: 'A', EULER_API_KEYS: 'B,C', TIKTOK_KEY_STRATEGY: 'balanced' }).defs.map((d) => d.tier), [0, 0, 0, 1]);
});

test('six extra keys (EULER_API_KEYS) after the primary = 7 keys in strict order', () => {
  const r = mk({ EULER_API_KEY: 'K1', EULER_API_KEYS: 'K2,K3,K4,K5,K6,K7' });
  assert.equal(r.keyCount, 7);
  assert.deepEqual(r.defs.filter((d) => !d.free).map((d) => d.apiKey), ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7']);
});

test('sequential failover: uses key1 alone; when key1 is exhausted (429) moves to key2, then key3; returns to key1 when it recovers', () => {
  const c = new FakeClock();
  const p = new ProviderPool(mk({ EULER_API_KEY: 'A', EULER_API_KEYS: 'B,C', TIKTOK_FREE_FALLBACK: '0' }).defs, { now: c.now, ratePerMin: 6000, burst: 100, inFlight: 100 });
  const use = () => { const r = p.pick(); p.begin(r.provider); return r.provider; };
  for (let i = 0; i < 5; i++) { const a = use(); assert.equal(a.name, 'key1/direct'); p.end(a, { ok: true }); c.t += 10; }
  const a = use(); p.end(a, { kind: 'rate_limited', retryAfterMs: 20000 });
  assert.equal(p.pick().provider.name, 'key2/direct');
  const b = use(); p.end(b, { kind: 'provider_denied' });
  assert.equal(p.pick().provider.name, 'key3/direct');
  const snap = p.snapshot();
  assert.deepEqual(snap.map((x) => x.role), ['cooling', 'cooling', 'active']);
  c.t += 21000; // key1 تعافى (retry-after انتهى) → يرجع الأول
  assert.equal(p.pick().provider.name, 'key1/direct');
  const probe = use(); p.end(probe, { ok: true });
  assert.deepEqual(p.snapshot().map((x) => x.role), ['active', 'cooling', 'standby']);
});

test('end() reports when a key just ran out / recovered (for logging)', () => {
  const c = new FakeClock();
  const p = new ProviderPool(mk({ EULER_API_KEY: 'A' }).defs, { now: c.now, ratePerMin: 6000, burst: 100, inFlight: 100 });
  const a = p.providers[0];
  p.begin(a); const down = p.end(a, { kind: 'rate_limited', retryAfterMs: 5000 });
  assert.equal(down.opened, true); assert.equal(down.cooldownMs, 5000);
  c.t += 6000;
  p.begin(a); const up = p.end(a, { ok: true });
  assert.equal(up.recovered, true);
});

test('daily limit silences the key for a long time (not the usual 5-minute probe), other keys keep serving', () => {
  const c = new FakeClock();
  const p = new ProviderPool(mk({ EULER_API_KEY: 'A', EULER_API_KEYS: 'B', TIKTOK_FREE_FALLBACK: '0' }).defs, { now: c.now, ratePerMin: 6000, burst: 100, inFlight: 100, dailyCooldownMs: 1800000 });
  p.begin(p.providers[0]); p.end(p.providers[0], { kind: 'rate_limited', retryAfterMs: 0, daily: true });
  assert.equal(p.providers[0].breaker.waitMs(), 1800000);
  assert.equal(p.pick().provider.name, 'key2/direct');
  p.begin(p.providers[1]); p.end(p.providers[1], { kind: 'rate_limited', retryAfterMs: 7200000, daily: true });
  assert.equal(p.providers[1].breaker.waitMs(), 3600000, 'retry-after honoured but bounded to 1h');
  assert.ok(p.earliestReadyMs() > 5 * 60 * 1000, 'nothing ready within 5 minutes');
});

// ---- ٦ مفاتيح Euler بأي صيغة: كلها تُقرأ (كان لصقها بمتغير واحد يُقرأ مفتاحاً واحداً عملاقاً فيبقى السيرفر على مفتاح واحد) ----
const SIX = ['ka1', 'kb2', 'kc3', 'kd4', 'ke5', 'kf6'];
const names = (r) => r.defs.map((d) => d.name).join(',');
const EXPECT_SIX = 'key1/direct,key2/direct,key3/direct,key4/direct,key5/direct,key6/direct,free/direct';

test('٦ مفاتيح مفصولة بفواصل داخل EULER_SIGN_API_KEY (أو EULER_API_KEY) = ٦ مزودات', () => {
  for (const name of ['EULER_SIGN_API_KEY', 'EULER_API_KEY', 'SIGN_API_KEY']) {
    const r = mk({ [name]: SIX.join(',') });
    assert.equal(r.keyCount, 6, name);
    assert.equal(names(r), EXPECT_SIX, name);
    assert.deepEqual(r.defs.slice(0, 6).map((d) => d.apiKey), SIX);
    assert.deepEqual(r.defs.slice(0, 6).map((d) => d.tier), [0, 1, 2, 3, 4, 5]);
  }
});

test('٦ مفاتيح بفواصل منقوطة/أسطر/مسافات/CRLF مع مسافات زائدة', () => {
  for (const sep of [';', '\n', ' ', '\r\n', ' , ', ',\n']) {
    const r = mk({ EULER_SIGN_API_KEY: '  ' + SIX.join(sep) + '  ' });
    assert.equal(r.keyCount, 6, JSON.stringify(sep));
    assert.deepEqual(r.defs.slice(0, 6).map((d) => d.apiKey), SIX);
  }
});

test('٦ مفاتيح بقائمة EULER_API_KEYS أو EULER_SIGN_API_KEYS', () => {
  assert.equal(names(mk({ EULER_API_KEYS: SIX.join(',') })), EXPECT_SIX);
  assert.equal(names(mk({ EULER_SIGN_API_KEYS: SIX.join('\n') })), EXPECT_SIX);
});

test('٦ مفاتيح بمتغيّرات مرقّمة بأي بادئة (…_1 أو …_2…_6)', () => {
  const numbered = (pre, from) => Object.fromEntries(SIX.map((k, i) => [pre + (i + from), k]));
  assert.equal(names(mk(numbered('EULER_API_KEY_', 1))), EXPECT_SIX);
  assert.equal(names(mk(numbered('EULER_SIGN_API_KEY_', 1))), EXPECT_SIX);
  assert.equal(names(mk(Object.assign({ EULER_SIGN_API_KEY: SIX[0] }, Object.fromEntries(SIX.slice(1).map((k, i) => ['EULER_SIGN_API_KEY_' + (i + 2), k]))))), EXPECT_SIX);
  assert.equal(names(mk(Object.assign({ EULER_API_KEY: SIX[0] }, Object.fromEntries(SIX.slice(1).map((k, i) => ['EULER_API_KEY_' + (i + 2), k]))))), EXPECT_SIX);
});

test('خلط الصيغ: بلا تكرار والترتيب ثابت، وkeyTails تعرض آخر ٤ خانات فقط', () => {
  const r = mk({ EULER_API_KEY: 'AAAA1111', EULER_API_KEYS: 'AAAA1111,BBBB2222', EULER_API_KEY_2: 'BBBB2222', EULER_API_KEY_3: 'CCCC3333' });
  assert.equal(r.keyCount, 3);
  assert.deepEqual(r.defs.slice(0, 3).map((d) => d.apiKey), ['AAAA1111', 'BBBB2222', 'CCCC3333']);
  assert.deepEqual(r.keyTails, ['…1111', '…2222', '…3333']);
  assert.ok(!JSON.stringify(r.keyTails).includes('AAAA'));
});

test('٦ مفاتيح + بروكسيات: الأولوية للمفتاح الأول وكل مفتاح مساره، والسقف ١٦ مزوداً', () => {
  const r = mk({ EULER_API_KEYS: SIX.join(','), TIKTOK_PROXIES: 'http://p1,http://p2' });
  assert.ok(r.defs.length <= 16);
  assert.equal(r.defs[0].name, 'key1/direct');
  assert.ok(r.defs.every((d) => d.name !== undefined));
});

test('الاستراتيجية المتسلسلة: المفتاح ٢ يُستخدم فقط بعد تعطّل المفتاح ١ وهكذا حتى ٦ ثم الطبقة المجانية', () => {
  const r = mk({ EULER_API_KEYS: SIX.join(',') });
  let t = 1000000;
  const pool = new ProviderPool(r.defs, { now: () => t });
  const used = [];
  for (let i = 0; i < 7; i++) {
    const pick = pool.pick(new Set());
    assert.ok(pick.provider, 'pick ' + i);
    used.push(pick.provider.name);
    // نفتح قاطع المزوّد المختار (محاكاة: المفتاح «خلص» بـ429 يومي) لننتقل للتالي
    pool.begin(pick.provider);
    pool.end(pick.provider, { kind: 'rate_limited', daily: true, retryAfterMs: 3600000 });
  }
  assert.deepEqual(used, ['key1/direct', 'key2/direct', 'key3/direct', 'key4/direct', 'key5/direct', 'key6/direct', 'free/direct']);
});
