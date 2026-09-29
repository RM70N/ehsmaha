'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ConnectQueue } = require('../lib/connect-queue');
const { ProviderPool } = require('../lib/providers');
const { FakeClock, flush } = require('./helpers');

const D = (name, tier = 0) => ({ name, tier, apiKey: name, signUrl: 'u', route: 'direct', proxyUrl: '', free: false });
function setup(defs, poolOpts) {
  const c = new FakeClock();
  const pool = new ProviderPool(defs || [D('a')], Object.assign({ now: c.now, ratePerMin: 60, burst: 1, inFlight: 10 }, poolOpts || {}));
  const dispatched = [];
  const q = new ConnectQueue(pool, { now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer, onDispatch: (e, waited, p) => dispatched.push({ key: e.key, waited, provider: p.name, at: c.now() }) });
  return { c, pool, q, dispatched };
}
const ok = () => Promise.resolve({ ok: true });

test('rate limit: N requests at once are spaced by the provider rate, none rejected', async () => {
  const { c, q, dispatched } = setup([D('a')], { ratePerMin: 60, burst: 1 }); // 1/s
  const results = [];
  for (let i = 0; i < 5; i++) q.request('r' + i, { dispatch: ok }).then((r) => results.push(r.outcome.ok));
  await flush();
  assert.equal(dispatched.length, 1, 'only the burst goes immediately');
  assert.equal(q.stats().waiting, 4);
  await c.advance(10000);
  assert.equal(dispatched.length, 5);
  assert.deepEqual(results, [true, true, true, true, true]);
  const gaps = dispatched.slice(1).map((d, i) => d.at - dispatched[i].at);
  assert.ok(gaps.every((g) => g >= 990 && g <= 1100), 'spacing ~1s: ' + gaps);
});

test('position reflects the queue order and drops as requests are dispatched', async () => {
  const { c, q } = setup([D('a')], { ratePerMin: 60, burst: 1 });
  for (let i = 0; i < 4; i++) q.request('r' + i, { dispatch: ok });
  await flush();
  assert.equal(q.position('r0'), 0, 'running/finished');
  assert.deepEqual(['r1', 'r2', 'r3'].map((k) => q.position(k)), [1, 2, 3]);
  await c.advance(1100);
  assert.deepEqual(['r2', 'r3'].map((k) => q.position(k)), [1, 2]);
});

test('dedupe: same key returns the same promise; never two in flight for one key', async () => {
  const { q } = setup([D('a')], { burst: 5, ratePerMin: 600 });
  let calls = 0;
  let release;
  const slow = () => { calls++; return new Promise((r) => { release = () => r({ ok: true }); }); };
  const p1 = q.request('same', { dispatch: slow });
  const p2 = q.request('same', { dispatch: slow });
  await flush();
  const p3 = q.request('same', { dispatch: slow }); // أثناء التشغيل
  assert.strictEqual(p1, p2); assert.strictEqual(p1, p3);
  assert.equal(calls, 1);
  release(); await p1;
});

test('priority: reconnects of live rooms go before new connections; front jumps everything', async () => {
  const { c, q, dispatched } = setup([D('a')], { ratePerMin: 60, burst: 1 });
  q.request('busy', { dispatch: ok });          // يستهلك الرمز الوحيد
  await flush();
  q.request('new1', { dispatch: ok, priority: 1 });
  q.request('new2', { dispatch: ok, priority: 1 });
  q.request('recon', { dispatch: ok, priority: 0 });
  q.request('failover', { dispatch: ok, front: true });
  await c.advance(6000);
  assert.deepEqual(dispatched.map((d) => d.key), ['busy', 'failover', 'recon', 'new1', 'new2']);
});

test('cancel removes a waiting room so it burns no quota', async () => {
  const { c, q, dispatched } = setup([D('a')], { ratePerMin: 60, burst: 1 });
  q.request('r0', { dispatch: ok });
  const p1 = q.request('r1', { dispatch: ok });
  q.request('r2', { dispatch: ok });
  await flush();
  assert.ok(q.cancel('r1'));
  assert.deepEqual(await p1, { cancelled: true });
  assert.ok(!q.cancel('r1'));
  await c.advance(5000);
  assert.deepEqual(dispatched.map((d) => d.key), ['r0', 'r2']);
});

test('provider failure: caller re-requests at the front with the failed provider excluded -> backup used at once', async () => {
  const { c, q, dispatched } = setup([D('primary'), D('backup')], { ratePerMin: 600, burst: 5 });
  let outcome = await (await q.request('room', { dispatch: () => Promise.resolve({ kind: 'rate_limited', retryAfterMs: 30000 }) }));
  assert.equal(outcome.outcome.kind, 'rate_limited');
  const failedId = outcome.provider.id;
  const again = await q.request('room', { dispatch: ok, front: true, exclude: new Set([failedId]) });
  assert.equal(again.outcome.ok, true);
  assert.notEqual(again.provider.name, outcome.provider.name);
  // والمزود الأول مفتوح القاطع: طلبات الغرف الأخرى تذهب للبديل بدون انتظار
  const other = await q.request('other', { dispatch: ok });
  assert.equal(other.provider.name, 'backup');
  assert.equal(dispatched.length, 3);
});

test('all providers breaker-open: requests wait for the earliest reopening (no failure), then proceed', async () => {
  const { c, q, dispatched, pool } = setup([D('a')], { ratePerMin: 600, burst: 5 });
  pool.begin(pool.providers[0]); pool.end(pool.providers[0], { kind: 'rate_limited', retryAfterMs: 20000 });
  let done = false;
  q.request('r', { dispatch: ok }).then(() => { done = true; });
  await c.advance(19000);
  assert.equal(done, false);
  assert.equal(dispatched.length, 0);
  await c.advance(2000);
  assert.equal(done, true);
  assert.equal(dispatched.length, 1);
});

test('a dispatch that throws becomes a transient outcome (queue keeps working)', async () => {
  const { q } = setup([D('a')], { ratePerMin: 600, burst: 5 });
  const r = await q.request('boom', { dispatch: () => { throw new Error('x'); } });
  assert.equal(r.outcome.kind, 'transient');
  const r2 = await q.request('fine', { dispatch: ok });
  assert.equal(r2.outcome.ok, true);
});

test('AIMD end-to-end: a 429 slows the queue down, later successes speed it up again', async () => {
  const { c, q, pool } = setup([D('a'), D('b')], { ratePerMin: 120, burst: 2 });
  const a = pool.providers[0];
  const before = a.limiter.rate;
  const r = await q.request('x', { dispatch: () => Promise.resolve({ kind: 'rate_limited', retryAfterMs: 1000 }) });
  assert.ok(Math.abs(r.provider.limiter.rate - before * 0.6) < 1e-9);
  await c.advance(2000);
  for (let i = 0; i < 40; i++) { await q.request('s' + i, { dispatch: ok }); await c.advance(600); }
  assert.ok(r.provider.limiter.rate > before * 0.6, 'recovering');
});

test('stop() resolves waiting entries as cancelled', async () => {
  const { q } = setup([D('a')], { ratePerMin: 60, burst: 1 });
  q.request('r0', { dispatch: ok });
  const w = q.request('r1', { dispatch: ok });
  await flush();
  q.stop();
  assert.deepEqual(await w, { cancelled: true });
});
