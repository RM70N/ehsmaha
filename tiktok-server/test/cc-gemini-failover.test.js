'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { GeminiRouter } = require('../lib/cc/gemini.js');

const KEYS = { GEMINI_API_KEY: 'AIzaSy' + 'A'.repeat(33), GEMINI_API_KEY_2: 'AIzaSy' + 'B'.repeat(33), GEMINI_API_KEY_3: 'AIzaSy' + 'C'.repeat(33) };
const ok = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), headers: { get: () => null } });
const hang = (init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));

test('مفتاح معلّق: يتجاوز المهلة وينجح بالمفتاح التالي', async () => {
  const used = [];
  const r = new GeminiRouter({ env: Object.assign({ GEMINI_CHAT_MODELS: 'm1' }, KEYS), fetch: (url, init) => { used.push(init.headers['x-goog-api-key'].slice(-2)); return used.length === 1 ? hang(init) : Promise.resolve(ok()); } });
  const t = Date.now();
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 300, budgetMs: 5000 });
  assert.ok(out.data.candidates);
  assert.equal(used.length, 2);
  assert.ok(Date.now() - t < 2000);
});

test('كل المفاتيح تعلّق: يفشل بنوع timeout ضمن الميزانية', async () => {
  const r = new GeminiRouter({ env: Object.assign({ GEMINI_CHAT_MODELS: 'm1' }, KEYS), fetch: (u, init) => hang(init) });
  const t = Date.now();
  await assert.rejects(r.generate('chat', { contents: [] }, { timeoutMs: 200, budgetMs: 450 }), (e) => e.kind === 'timeout');
  assert.ok(Date.now() - t < 1500);
});

test('429 على نموذج: ينتقل لنموذج/مفتاح آخر', async () => {
  let n = 0;
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY, GEMINI_CHAT_MODELS: 'm1,m2' }, fetch: async () => (++n === 1 ? { ok: false, status: 429, json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota' } }), headers: { get: () => null } } : ok()) });
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

const list = (names) => ({ ok: true, status: 200, json: async () => ({ models: names.map((n) => ({ name: 'models/' + n, supportedGenerationMethods: ['generateContent'] })) }), headers: { get: () => null } });
const gone = { ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND', message: 'This model is no longer available to new users.' } }), headers: { get: () => null } };

test('اكتشاف النماذج: يختار الأرخص المتاح ويتجاوز الممنوع للحسابات الجديدة', async () => {
  const called = [];
  const names = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-3-flash-lite', 'gemini-3-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-preview-tts', 'text-embedding-004', 'gemini-3-flash-image'];
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, fetch: async (url, init) => {
    if (/\/v1beta\/models\?/.test(url)) return list(names);
    const m = decodeURIComponent(url.match(/models\/([^:]+):/)[1]); called.push(m);
    return m === 'gemini-3-flash-lite' ? ok() : gone;
  } });
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 500, budgetMs: 5000 });
  assert.equal(r.models.chat[0], 'gemini-3-flash-lite');
  assert.equal(out.model, 'gemini-3-flash-lite');
  assert.ok(!r.models.chat.some((n) => /embed|image|pro|tts/.test(n)));
  assert.equal(r.models.tts[0], 'gemini-2.5-flash-preview-tts');
});

test('النموذج الأول مسحوب (404): ينتقل للتالي ولا يفشل الدور', async () => {
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, fetch: async (url) => {
    if (/\/v1beta\/models\?/.test(url)) return { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } };
    return /flash-lite-latest/.test(url) ? gone : ok();
  } });
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 500, budgetMs: 5000 });
  assert.equal(out.model, 'gemini-flash-latest');
});

test('كل النماذج مسحوبة ثم يظهر نموذج جديد: يعيد الاكتشاف تلقائياً', async () => {
  let phase = 0;
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, fetch: async (url) => {
    if (/\/v1beta\/models\?/.test(url)) return phase === 0 ? { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } } : list(['gemini-9-flash-lite']);
    return /gemini-9-flash-lite/.test(url) ? ok() : (phase = 1, gone);
  } });
  const out = await r.generate('chat', { contents: [] }, { timeoutMs: 500, budgetMs: 5000 });
  assert.equal(out.model, 'gemini-9-flash-lite');
});

test('القياس: يقدّم النموذج الأسرع ويؤخر البطيء/الفاشل', async () => {
  const names = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-3.5-flash'];
  const delay = { 'gemini-3.5-flash-lite': 120, 'gemini-3.1-flash-lite': 10, 'gemini-3.5-flash': 60 };
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY }, fetch: async (url) => {
    if (/\/v1beta\/models\?/.test(url)) return list(names);
    const m = decodeURIComponent(url.match(/models\/([^:]+):/)[1]);
    if (m === 'gemini-2.5-flash-lite') return gone;
    await new Promise((x) => setTimeout(x, delay[m] || 0));
    return ok();
  } });
  await r.generate('chat', { contents: [] }, { timeoutMs: 500, budgetMs: 5000 });
  assert.equal(r.models.chat[0], 'gemini-3.1-flash-lite');
  assert.ok(r.models.chat.indexOf('gemini-2.5-flash-lite') > r.models.chat.indexOf('gemini-3.5-flash-lite'));
});

test('التفكير: يُطفأ لنماذج 3.x، ويُعاد الطلب بدونه لو رفضه النموذج', async () => {
  const seen = [];
  const r = new GeminiRouter({ env: { GEMINI_API_KEY: KEYS.GEMINI_API_KEY, GEMINI_CHAT_MODELS: 'gemini-3.5-flash-lite' }, fetch: async (url, init) => {
    const b = JSON.parse(init.body); seen.push(b.generationConfig.thinkingConfig || null);
    return seen.length === 1 ? { ok: false, status: 400, json: async () => ({ error: { message: 'thinking level not supported' } }), headers: { get: () => null } } : ok();
  } });
  await r.generate('chat', { contents: [], generationConfig: { maxOutputTokens: 8 } }, { timeoutMs: 500, budgetMs: 5000 });
  assert.deepEqual(seen[0], { thinkingLevel: 'minimal' });
  assert.equal(seen[1], null);
});
