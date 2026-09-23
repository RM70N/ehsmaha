'use strict';

// اختبارات /بث: مخزن الجلسات (انتهاء تلقائي، مزامنة، تحقق الحمولة)،
// Webhook البوت (السر، التحقق، الانتهاء، CORS)، وعرض الأمر (فاضي/صفحات).

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const live = require('../services/liveStreams');
const { createApp } = require('../web/server');
const liveCmd = require('../commands/streams/live');

const SECRET = 's'.repeat(32);
const payload = (o = {}) => ({ sessionId: 'sess-1', platform: 'tiktok', platformUsername: '@MZX', gameName: 'هبد', gameId: 'g1', startedAt: new Date().toISOString(), ...o });

test.afterEach(() => live.clearAll());

// ---------------- المخزن ----------------
test('validatePayload: يقبل الصحيح ويرفض الناقص/الغلط', () => {
  const ok = live.validatePayload(payload());
  assert.equal(ok.ok, true);
  assert.equal(ok.value.platformUsername, 'MZX');
  assert.deepEqual(live.validatePayload({ sessionId: 'x', ended: true }).value, { sessionId: 'x', ended: true });
  assert.equal(live.validatePayload(payload({ platform: 'facebook' })).ok, false);
  assert.equal(live.validatePayload(payload({ platformUsername: '' })).ok, false);
  assert.equal(live.validatePayload(payload({ gameName: '' })).ok, false);
  assert.equal(live.validatePayload(payload({ sessionId: 'a b' })).ok, false);
  assert.equal(live.validatePayload(payload({ startedAt: 'مو تاريخ' })).ok, false);
  assert.equal(live.validatePayload(payload({ startedAt: Date.now() + 3600e3 })).ok, false);
  assert.equal(live.validatePayload(null).ok, false);
});

test('انتهاء تلقائي بعد الحد الأقصى، ويُلغى المؤقت عند وصول حدث الانتهاء', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 });
  live.configure({ maxHours: 6 });
  assert.equal(live.upsert({ ...payload(), startedAt: Date.now(), source: 'webhook' }).ok, true);
  assert.equal(live.upsert({ ...payload({ sessionId: 'sess-2', platformUsername: 'other' }), startedAt: Date.now(), source: 'webhook' }).ok, true);
  assert.equal(live.size(), 2);
  assert.equal(live.end('sess-2'), true); // حدث انتهاء حقيقي
  t.mock.timers.tick(6 * 3600e3 - 1000);
  assert.equal(live.size(), 1);
  t.mock.timers.tick(2000);
  assert.equal(live.size(), 0, 'الجلسة العالقة انحذفت بعد 6 ساعات');
  // جلسة بدأت قبل أكثر من 6 ساعات ما تنقبل
  assert.equal(live.upsert({ ...payload(), startedAt: Date.now() - 7 * 3600e3 }).reason, 'TOO_OLD');
});

test('ستريمر واحد = جلسة وحدة (الجلسة الجديدة تستبدل القديمة)', () => {
  live.upsert({ ...payload(), startedAt: Date.now() - 1000 });
  live.upsert({ ...payload({ sessionId: 'sess-new', platformUsername: 'mzx', gameName: 'لعبة ثانية' }), startedAt: Date.now() });
  const list = live.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].sessionId, 'sess-new');
  assert.equal(list[0].timer, undefined, 'ما نسرّب المؤقت');
});

test('المزامنة: تحذف اللي مو موجود بالموقع (بعد مهلة السماح) وتضيف الناقص', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 });
  live.upsert({ ...payload({ sessionId: 'ghost', platformUsername: 'ghost' }), startedAt: Date.now(), source: 'webhook' });
  // جلسة جديدة جداً: تبقى لين تظهر ببيانات الموقع
  let r = live.reconcile([]);
  assert.equal(r.removed, 0);
  t.mock.timers.tick(3 * 60_000 + 1000);
  r = live.reconcile([{ sessionId: 'p1', platform: 'twitch', platformUsername: 'abo', gameName: 'X', startedAt: Date.now() - 5000 }]);
  assert.deepEqual(r, { removed: 1, added: 1, total: 1 });
  assert.equal(live.list()[0].source, 'poll');
  // مزامنة فاضية: تحذف جلسة المزامنة فوراً
  assert.equal(live.reconcile([]).removed, 1);
});

test('فشل المزامنة ما يمسح الجلسات (الويب هوك يكمّل)', async () => {
  live.upsert({ ...payload(), startedAt: Date.now() });
  live.startPolling(async () => { throw Object.assign(new Error('down'), { code: 'ECONNREFUSED' }); }, 60_000);
  await new Promise((r) => setImmediate(r));
  live.stopPolling();
  assert.equal(live.size(), 1);
  assert.equal(live.lastPoll().ok, false);
});

// ---------------- Webhook ----------------
async function withServer(config, fn) {
  const app = createApp({ client: { isReady: () => true, ws: { ping: 42 } }, config });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise((r) => server.close(r)); }
}
const post = (base, body, headers = {}) =>
  fetch(base + '/api/discord/stream-event', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('webhook: 503 بدون سر، 401 سر غلط، 400 حمولة غلط، 200 بدأ/انتهى', async () => {
  await withServer({ streamWebhookSecret: '', webhookAllowedOrigins: [] }, async (base) => {
    assert.equal((await post(base, payload(), { 'x-webhook-secret': 'x' })).status, 503);
  });
  await withServer({ streamWebhookSecret: SECRET, webhookAllowedOrigins: ['https://ehsmaha.com'] }, async (base) => {
    assert.equal((await post(base, payload())).status, 401);
    assert.equal((await post(base, payload(), { 'x-webhook-secret': SECRET + 'x' })).status, 401);
    assert.equal((await post(base, payload({ platform: 'nope' }), { 'x-webhook-secret': SECRET })).status, 400);
    assert.equal((await post(base, '{bad json', { 'x-webhook-secret': SECRET })).status, 400);

    const started = await post(base, payload(), { 'x-webhook-secret': SECRET });
    assert.equal(started.status, 200);
    assert.equal(live.size(), 1);
    const ended = await (await post(base, { sessionId: 'sess-1', ended: true }, { 'x-webhook-secret': SECRET })).json();
    assert.deepEqual(ended.data, { ended: true, existed: true });
    assert.equal(live.size(), 0);

    // CORS: نطاق الموقع مسموح، غيره لا
    const pre = await fetch(base + '/api/discord/stream-event', { method: 'OPTIONS', headers: { origin: 'https://ehsmaha.com' } });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get('access-control-allow-origin'), 'https://ehsmaha.com');
    const evil = await fetch(base + '/api/discord/stream-event', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);

    const health = await (await fetch(base + '/health')).json();
    assert.equal(health.ok, true);
  });
});

// ---------------- عرض الأمر ----------------
test('/بث فاضي: Embed رمادي بالرسالة المطلوبة', () => {
  const { embeds, components } = liveCmd._internal.buildPage([], 0, 'u1');
  const e = embeds[0].toJSON();
  assert.equal(e.title, '🔴 البث المباشر الآن على احسمها');
  assert.match(e.description, /لا يوجد بث نشط على احسمها حالياً 🎮/);
  assert.equal(components.length, 0);
});

test('/بث: روابط قابلة للضغط، وقت نسبي، وصفحات لأكثر من 10', () => {
  const now = Date.now();
  const platforms = ['tiktok', 'twitch', 'kick', 'youtube'];
  for (let i = 0; i < 23; i += 1) {
    live.upsert({ sessionId: 's' + i, platform: platforms[i % 4], platformUsername: 'st' + i, gameName: 'لعبة ' + i, startedAt: now - i * 1000 });
  }
  const p0 = liveCmd._internal.buildPage(live.list(), 0, 'u1');
  const e0 = p0.embeds[0].toJSON();
  assert.match(e0.description, /\*\*23\*\*/);
  assert.match(e0.description, /\[@st0\]\(https:\/\/www\.tiktok\.com\/@st0\/live\)/);
  assert.match(e0.description, /\[@st1\]\(https:\/\/www\.twitch\.tv\/st1\)/);
  assert.match(e0.description, /<t:\d+:R>/);
  assert.equal(e0.description.split('\n').filter((l) => l.includes('🎮 لعبة')).length, 10);
  assert.equal(p0.components.length, 1);
  const last = liveCmd._internal.buildPage(live.list(), 99, 'u1').embeds[0].toJSON();
  assert.equal(last.author.name, 'صفحة 3 من 3');
  assert.equal(last.description.split('\n').filter((l) => l.includes('🎮 لعبة')).length, 3);
});

test('/بث: زر الصفحات محمي لصاحب القائمة', async () => {
  const calls = [];
  const i = { user: { id: 'other' }, deferred: false, replied: false, isRepliable: () => true,
    reply: async (p) => calls.push(['reply', p]), update: async (p) => calls.push(['update', p]) };
  await liveCmd.buttons.bt(i, ['page', '1', 'owner']);
  assert.equal(calls[0][0], 'reply');
  const i2 = { ...i, user: { id: 'owner' } };
  await liveCmd.buttons.bt(i2, ['page', '0', 'owner']);
  assert.equal(calls[1][0], 'update');
});
