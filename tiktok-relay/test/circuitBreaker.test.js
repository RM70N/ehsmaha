import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../src/circuitBreaker.js';

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

test('يفتح بعد N فشل متتالٍ ويمنع الطلبات', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: c.now });
  assert.equal(b.canRequest(), true);
  b.onFailure(); b.onFailure();
  assert.equal(b.state, 'closed'); // ما وصل العتبة بعد
  b.onFailure();
  assert.equal(b.state, 'open');
  assert.equal(b.canRequest(), false);
});

test('نجاح يصفّر العداد ويغلق القاطع', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: c.now });
  b.onFailure(); b.onFailure();
  b.onSuccess();
  b.onFailure(); b.onFailure();
  assert.equal(b.state, 'closed'); // العداد انصفر، فما وصلنا 3 متتالية
});

test('half_open: طلب تجريبي واحد ينجح فيغلق، يفشل فيفتح بمدة أطول', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000, maxCooldownMs: 10000, now: c.now });
  b.onFailure();
  assert.equal(b.state, 'open');
  c.advance(1001);
  assert.equal(b.state, 'half_open');
  assert.equal(b.canRequest(), true);
  b.onDispatch();
  assert.equal(b.canRequest(), false, 'طلب تجريبي واحد فقط أثناء half_open');
  b.onFailure(); // التجريبي فشل
  assert.equal(b.state, 'open');
  const wait1 = b.waitMs();
  assert.ok(wait1 > 1000, 'مدة الفتح الثانية أطول من الأولى: ' + wait1);
});

test('tripWithCooldown يفتح بمدة محددة فوراً (حظر صريح)', () => {
  const c = clock();
  const b = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000, now: c.now });
  b.tripWithCooldown(600000);
  assert.equal(b.state, 'open');
  assert.equal(b.waitMs(), 600000);
});
