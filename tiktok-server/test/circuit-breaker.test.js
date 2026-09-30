'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { CircuitBreaker } = require('../lib/circuit-breaker');
const { FakeClock } = require('./helpers');

test('opens after threshold consecutive failures, rejects while open', () => {
  const c = new FakeClock();
  const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 30000, now: c.now });
  b.onFailure(); b.onFailure();
  assert.equal(b.state, 'closed');
  assert.ok(b.canRequest());
  b.onFailure();
  assert.equal(b.state, 'open');
  assert.ok(!b.canRequest());
  assert.equal(b.waitMs(), 30000);
});

test('success resets the failure streak', () => {
  const c = new FakeClock();
  const b = new CircuitBreaker({ failureThreshold: 3, now: c.now });
  b.onFailure(); b.onFailure(); b.onSuccess(); b.onFailure(); b.onFailure();
  assert.equal(b.state, 'closed');
});

test('half-open lets exactly one probe; success closes, failure re-opens with a longer cooldown', () => {
  const c = new FakeClock();
  const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 10000, maxCooldownMs: 40000, now: c.now });
  b.onFailure();
  assert.equal(b.waitMs(), 10000);
  c.t += 10000;
  assert.equal(b.state, 'half_open');
  assert.ok(b.canRequest());
  b.onDispatch();
  assert.ok(!b.canRequest(), 'only one probe at a time');
  b.onFailure(); // probe failed
  assert.equal(b.state, 'open');
  assert.equal(b.waitMs(), 20000, 'cooldown doubles');
  c.t += 20000; b.onDispatch(); b.onFailure();
  assert.equal(b.waitMs(), 40000);
  c.t += 40000; b.onDispatch(); b.onFailure();
  assert.equal(b.waitMs(), 40000, 'capped at max');
  c.t += 40000; b.onDispatch(); b.onSuccess();
  assert.equal(b.state, 'closed');
  b.onFailure();
  assert.equal(b.waitMs(), 10000, 'cooldown reset after recovery');
});

test('trip(ms) honours the provider-supplied retry-after (bounded)', () => {
  const c = new FakeClock();
  const b = new CircuitBreaker({ cooldownMs: 30000, maxCooldownMs: 300000, now: c.now });
  b.trip(45000);
  assert.equal(b.waitMs(), 45000);
  const b2 = new CircuitBreaker({ maxCooldownMs: 300000, now: c.now });
  b2.trip(99999999);
  assert.equal(b2.waitMs(), 300000);
});
