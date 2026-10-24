'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { GeminiRouter } = require('../lib/cc/gemini.js');

const KEYS = { GEMINI_API_KEY: 'AIzaSy' + 'A'.repeat(33), GEMINI_API_KEY_2: 'AIzaSy' + 'B'.repeat(33), GEMINI_API_KEY_3: 'AIzaSy' + 'C'.repeat(33) };
const ok = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), headers: { get: () => null } });
const hang = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));

test('مفتاح معلّق: يتجاوز المهلة وينجح بالمفتاح التالي', async () => {
  const used = [];
  const r = new GeminiRouter({ env: KEYS, fetch: (url, init) => { used.push(init.headers['x-goog-api-key'].slice(-2)); return used.length === 1 ? hang(init) : Promise.resolve(ok()); } });
  const t = Date.now();
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 300, budgetMs: 5000 });
  assert.ok(out.data.candidates);
  assert.equal(used.length, 2);
  assert.ok(Date.now() - t < 2000);
});

test('كل المفاتيح تعلّق: يفشل بنوع timeout ضمن الميزانية', async () => {
  const r = new GeminiRouter({ env: KEYS, fetch: (u, init) => hang(init) });
  const t = Date.now();
  await assert.rejects(r.generate('chat', { contents: [] }, { timeoutMs: 200, budgetMs: 450 }), (e) => e.kind === 'timeout');
  assert.ok(Date.now() - t < 1500);
});

test('429 على نموذج: ينتقل لنموذج/مفتاح آخر', async () => {
  let n = 0;
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, fetch: async () => (++n === 1 ? { ok: false, status: 429, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }), headers: { get: () => null } } : ok()) });
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 300, budgetMs: 5000 });
  assert.ok(out.model !== r.models.chat[0]);
});

test('diagnose: يرجع تقرير بدون كشف المفاتيح', async () => {
  const r = new GeminiRouter({ env: KEYS, fetch: async () => ok() });
  const d = await r.diagnose();
  assert.equal(d.keys.length, 3);
  assert.equal(d.okKeys, 3);
  assert.ok(!JSON.stringify(d).includes('AAAAAAAAAA'));
});
