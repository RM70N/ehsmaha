import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../src/manager.js';
import { makeMockProvider } from './mockProvider.js';

// مؤقّت وهمي: setTimer يسجّل (fn, delay) بدل التنفيذ الفعلي — الاختبار يتحكم بمتى "يمر" الوقت.
function fakeTimers() {
  const scheduled = []; // { fn, delay, id }
  let nextId = 1;
  return {
    scheduled,
    setTimer(fn, delay) { const id = nextId++; scheduled.push({ id, fn, delay }); return id; },
    clearTimer(id) { const i = scheduled.findIndex((t) => t.id === id); if (i > -1) scheduled.splice(i, 1); },
  };
}

test('track(): أول فحص يجب أن يكون شبه فوري (≤1000ms)، لا بنطاق الفحص الدوري الكامل (pollMin)', () => {
  const t = fakeTimers();
  const provider = makeMockProvider('mock', new Map());
  const m = new ConnectionManager({
    primaryProvider: provider,
    pollIntervalMinMs: 30000, // لو كان العطل القديم موجوداً، التأخير الأول كان يقدر يوصل هذي القيمة كاملة
    pollIntervalMaxMs: 60000,
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
    rng: () => 0.99, // أقصى قيمة عشوائية ممكنة — أسوأ سيناريو للعطل القديم
  });

  m.track('someuser');

  assert.equal(t.scheduled.length, 1, 'لازم يُجدوَل فحص واحد فوراً عند track()');
  assert.ok(t.scheduled[0].delay <= 1000, 'التأخير الأول ' + t.scheduled[0].delay + 'ms تجاوز الحد الأقصى المسموح (1000ms) — نفس عطل pollDelay(0, pollMin) القديم');
});

test('track(): يوزرات مختلفون لا يصطفّون كلهم بنفس اللحظة (جيتر فعلي)', () => {
  const t = fakeTimers();
  const provider = makeMockProvider('mock', new Map());
  let r = 0;
  const m = new ConnectionManager({
    primaryProvider: provider,
    setTimer: t.setTimer,
    clearTimer: t.clearTimer,
    rng: () => { r += 0.3; return r % 1; },
  });

  m.track('a');
  m.track('b');
  m.track('c');

  const delays = t.scheduled.map((s) => s.delay);
  assert.equal(new Set(delays).size, 3, 'التأخيرات يجب أن تتفاوت (جيتر حقيقي) لا نفس القيمة للجميع');
  delays.forEach((d) => assert.ok(d >= 0 && d <= 1000));
});
