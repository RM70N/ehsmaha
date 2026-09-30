'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { backoffDelay } = require('../lib/backoff');

test('backoff doubles per attempt (no jitter) and caps at max', () => {
  const o = { baseMs: 2000, maxMs: 60000, jitter: 0, rng: () => 0.5 };
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 20].map((n) => backoffDelay(n, o)), [2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
});

test('jitter stays within +-25% and never below the floor', () => {
  for (let n = 1; n <= 8; n++) {
    const raw = Math.min(60000, 2000 * 2 ** (n - 1));
    const lo = backoffDelay(n, { rng: () => 0 });
    const hi = backoffDelay(n, { rng: () => 1 });
    assert.equal(lo, Math.round(raw * 0.75));
    assert.equal(hi, Math.round(raw * 1.25));
  }
  assert.equal(backoffDelay(1, { baseMs: 100, jitter: 0.25, rng: () => 0 }), 250); // minMs
});

test('jitter actually spreads values (thundering herd)', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(backoffDelay(3));
  assert.ok(seen.size > 50, 'expected varied delays, got ' + seen.size);
});

test('bad attempt numbers are treated as 1', () => {
  assert.equal(backoffDelay(0, { jitter: 0 }), 2000);
  assert.equal(backoffDelay(NaN, { jitter: 0 }), 2000);
  assert.equal(backoffDelay(-3, { jitter: 0 }), 2000);
});
