import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffDelay, pollDelay } from '../src/backoff.js';

test('يتصاعد مع رقم المحاولة بسقف maxMs', () => {
  const rng = () => 0.5; // يلغي الـjitter تقريباً (منتصف النطاق)
  const d1 = backoffDelay(1, { baseMs: 1000, maxMs: 8000, factor: 2, jitter: 0, rng });
  const d2 = backoffDelay(2, { baseMs: 1000, maxMs: 8000, factor: 2, jitter: 0, rng });
  const d3 = backoffDelay(3, { baseMs: 1000, maxMs: 8000, factor: 2, jitter: 0, rng });
  const d10 = backoffDelay(10, { baseMs: 1000, maxMs: 8000, factor: 2, jitter: 0, rng });
  assert.equal(d1, 1000);
  assert.equal(d2, 2000);
  assert.equal(d3, 4000);
  assert.equal(d10, 8000); // مسقوف
});

test('jitter يبقى ضمن الحد الأدنى minMs ولا يكسر السقف', () => {
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const d = backoffDelay(5, { baseMs: 1000, maxMs: 8000, factor: 2, jitter: 0.5, minMs: 250, rng: () => r });
    assert.ok(d >= 250 && d <= 8000, 'd=' + d + ' خارج النطاق لـ rng=' + r);
  }
});

test('pollDelay يقع ضمن [min, max]', () => {
  for (const r of [0, 0.5, 1]) {
    const d = pollDelay(30000, 60000, () => r);
    assert.ok(d >= 30000 && d <= 60000);
  }
});
