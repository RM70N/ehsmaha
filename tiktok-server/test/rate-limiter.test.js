'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RateLimiter } = require('../lib/rate-limiter');
const { FakeClock } = require('./helpers');

test('burst then steady rate', () => {
  const c = new FakeClock();
  const l = new RateLimiter({ maxRatePerSec: 2, burst: 3, inFlightMax: 100, now: c.now });
  for (let i = 0; i < 3; i++) { assert.equal(l.waitMs(), 0); l.take(); l.release(); }
  assert.equal(l.waitMs(), 500, 'next token after 1/2s');
  c.t += 500;
  assert.equal(l.waitMs(), 0);
});

test('in-flight cap blocks until release', () => {
  const c = new FakeClock();
  const l = new RateLimiter({ maxRatePerSec: 100, burst: 100, inFlightMax: 2, now: c.now });
  l.take(); l.take();
  assert.ok(l.waitMs() > 0);
  l.release();
  assert.equal(l.waitMs(), 0);
});

test('AIMD: 429 halves the rate (floored); successes recover it (capped)', () => {
  const c = new FakeClock();
  const l = new RateLimiter({ maxRatePerSec: 2, minRatePerSec: 0.25, burst: 4, increasePerSuccess: 0.25, now: c.now });
  l.onRateLimited(); assert.equal(l.rate, 1);
  l.onRateLimited(); assert.equal(l.rate, 0.5);
  l.onRateLimited(); l.onRateLimited(); assert.equal(l.rate, 0.25, 'floor');
  for (let i = 0; i < 20; i++) l.onSuccess();
  assert.equal(l.rate, 2, 'capped at max');
  assert.equal(l.penalties, 4);
});

test('no instant burst right after a 429', () => {
  const c = new FakeClock();
  const l = new RateLimiter({ maxRatePerSec: 2, burst: 5, now: c.now });
  l.onRateLimited();
  assert.ok(l.waitMs() > 0);
});
