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
  assert.equal(r.defs.at(-1).tier, 2);
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
