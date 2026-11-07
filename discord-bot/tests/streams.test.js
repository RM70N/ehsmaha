'use strict';

// اختبارات /بث: مخزن الجلسات (انتهاء تلقائي، مزامنة، تحقق الحمولة)،
// Webhook البوت (السر، التحقق، الانتهاء، CORS)، وعرض الأمر (فاضي/صفحات).

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
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
const board = require('../services/liveBoard');
const activeStreams = require('../api/services/activeStreams');

const flatComponents = (p) => p.components.flatMap((r) => r.toJSON().components);

test('/بث فاضي: بطاقة رمادية تشرح إنها لحظية، وفيها تحديث ورابط الموقع فقط', () => {
  const { embeds, components } = liveCmd._internal.buildPage([], 0, 'u1', { live: true });
  const e = embeds[0].toJSON();
  assert.equal(e.title, '🔴 البث المباشر الآن على احسمها');
  assert.match(e.description, /لا يوجد بث نشط على احسمها حالياً 🎮/);
  assert.match(e.description, /أول ما يربط ستريمر يوزره بتلقاه هنا \*\*لحظياً\*\*/);
  assert.match(e.footer.text, /يتحدّث لحظياً/);
  const btns = components.flatMap((r) => r.toJSON().components);
  assert.deepEqual(btns.map((b) => b.label), ['تحديث', 'العب على احسمها']);
  assert.equal(btns[1].url, 'https://ehsmaha.com');
});

test('/بث: بطاقة لكل ستريمر — "متصل بالبث" لحظة الربط و"يلعب" بعد اللعبة، مع ملخص وروابط وجديد 🆕', () => {
  const now = Date.now();
  live.upsert({ sessionId: 'a', platform: 'tiktok', platformUsername: 'dalal', gameName: 'الدول', startedAt: now - 60e3, source: 'poll' });
  live.upsert({ sessionId: 'b', platform: 'twitch', platformUsername: 'ahmed', gameName: null, startedAt: now - 5e3, source: 'poll' });
  const p = liveCmd._internal.buildPage(live.list(), 0, 'u1', { live: true });
  const e = p.embeds[0].toJSON();
  assert.equal(e.title, '🔴 البث المباشر الآن');
  assert.match(e.description, /### 🎙️ 2 ستريمر على البث/);
  assert.match(e.description, /🎮 \*\*1\*\* يلعبون ‧ 📡 \*\*1\*\* متصلون بالبث/);
  assert.match(e.description, /📱 1 ‧ 🟣 1/);
  assert.match(e.description, /\*\*1\*\* ‧ 🆕 🟣 \*\*\[@ahmed\]\(https:\/\/www\.twitch\.tv\/ahmed\)\*\*\n╰ 📡 متصل بالبث — يختار لعبة ‧ <t:\d+:R>/);
  assert.match(e.description, /\*\*2\*\* ‧ 🆕 📱 \*\*\[@dalal\]\(https:\/\/www\.tiktok\.com\/@dalal\/live\)\*\*\n╰ 🎮 \*\*الدول\*\* ‧ <t:\d+:R>/);
  assert.ok(e.description.indexOf('@ahmed') < e.description.indexOf('@dalal'), 'الأحدث أولاً');
  assert.equal(e.color, 0xef4444, 'لون "مباشر"');
  const [select, ...btns] = flatComponents(p);
  assert.equal(select.custom_id, 'bt:flt:u1');
  assert.deepEqual(select.options.map((o) => o.label), ['كل المنصات (2)', 'تيك توك (1)', 'Twitch (1)']);
});

test('/بث: صفحات (8 بالصفحة)، تصفية بالمنصة، وأزرار تحمل التصفية والصفحة', () => {
  const now = Date.now();
  const platforms = ['tiktok', 'twitch', 'kick', 'youtube'];
  for (let i = 0; i < 23; i += 1) {
    live.upsert({ sessionId: 's' + i, platform: platforms[i % 4], platformUsername: 'st' + i, gameName: 'لعبة ' + i, startedAt: now - i * 1000, source: 'poll' });
  }
  const p0 = liveCmd._internal.buildPage(live.list(), 0, 'u1');
  const e0 = p0.embeds[0].toJSON();
  assert.match(e0.description, /23 ستريمر على البث/);
  assert.equal(e0.description.split('\n').filter((l) => l.includes('🎮 **لعبة')).length, 8);
  assert.equal(e0.author.name, 'صفحة 1 من 3');
  const ids = flatComponents(p0).map((c) => c.custom_id || c.url);
  assert.ok(ids.includes('bt:page:1:u1:all'));
  assert.ok(ids.includes('bt:ref:0:u1:all'));
  const last = liveCmd._internal.buildPage(live.list(), 99, 'u1').embeds[0].toJSON();
  assert.equal(last.author.name, 'صفحة 3 من 3');
  assert.equal(last.description.split('\n').filter((l) => l.includes('🎮 **لعبة')).length, 7);

  // تصفية: تيك توك فقط (6 من 23) ← صفحة وحدة، والأزرار تحفظ التصفية
  const tt = liveCmd._internal.buildPage(live.list(), 0, 'u1', { filter: 'tiktok' });
  const te = tt.embeds[0].toJSON();
  assert.match(te.title, /تيك توك/);
  assert.equal(te.description.split('\n').filter((l) => l.includes('🎮 **لعبة')).length, 6);
  assert.ok(!te.description.includes('twitch.tv'));
  assert.ok(flatComponents(tt).some((c) => c.custom_id === 'bt:ref:0:u1:tiktok'));
  assert.equal(flatComponents(tt).find((c) => c.custom_id === 'bt:flt:u1').options.find((o) => o.default).value, 'tiktok');
});

test('/بث: تصفية منصة ما فيها أحد ← رسالة واضحة والقائمة تبقى للتبديل', () => {
  live.upsert({ sessionId: 'a', platform: 'tiktok', platformUsername: 'dalal', gameName: 'الدول', source: 'poll' });
  const p = liveCmd._internal.buildPage(live.list(), 0, 'u1', { filter: 'kick' });
  assert.match(p.embeds[0].toJSON().description, /ما فيه أحد يبث على \*\*Kick\*\* الحين/);
  assert.ok(flatComponents(p).some((c) => c.custom_id === 'bt:flt:u1'));
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

// ---------------- جلسات "متصل بالبث" والأحداث ----------------
test('الجلسة بدون لعبة = "متصل بالبث"، وتتحول "يلعب" لما يشغّل لعبة، وكل تغيير يُطلق حدث لحظي', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_700_000_000_000 });
  let changes = 0;
  const off = live.onChange(() => { changes += 1; });
  live.reconcile([{ sessionId: 'site:tiktok:dalal', platform: 'tiktok', platformUsername: 'dalal', gameName: null }]);
  assert.equal(live.list()[0].status, 'linked');
  assert.equal(live.list()[0].gameName, null);
  assert.equal(changes, 1);
  live.reconcile([{ sessionId: 'site:tiktok:dalal', platform: 'tiktok', platformUsername: 'dalal', gameName: null }]);
  assert.equal(changes, 1, 'نفس الحالة: ما فيه حدث');
  live.reconcile([{ sessionId: 'site:tiktok:dalal', platform: 'tiktok', platformUsername: 'dalal', gameName: 'الدول', gameId: 'cw' }]);
  assert.equal(live.list()[0].status, 'playing');
  assert.equal(live.list()[0].gameName, 'الدول');
  assert.equal(changes, 2);
  live.reconcile([{ sessionId: 'site:tiktok:dalal', platform: 'tiktok', platformUsername: 'dalal', gameName: 'الروليت', gameId: 'rou' }]);
  assert.equal(live.list()[0].gameName, 'الروليت', 'لعبة ثانية');
  assert.equal(changes, 3);
  t.mock.timers.tick(10 * 60 * 1000); // تجاوز مهلة السماح
  live.reconcile([]);
  assert.equal(live.size(), 0, 'انقطع ← اختفى');
  assert.equal(changes, 4);
  off();
  live.reconcile([{ sessionId: 'x', platform: 'kick', platformUsername: 'z', gameName: null }]);
  assert.equal(changes, 4, 'بعد الإلغاء ما يوصله شي');
});

test('webhook بدون تغيير: الجلسة دايماً بلعبة (يلعب)، والمزامنة ما تغيّر لعبة جلسة الويب هوك', () => {
  live.upsert({ ...payload(), source: 'webhook' });
  assert.equal(live.list()[0].status, 'playing');
  live.reconcile([{ sessionId: 'site:tiktok:mzx', platform: 'tiktok', platformUsername: 'mzx', gameName: 'لعبة ثانية' }]);
  assert.equal(live.list()[0].gameName, 'هبد');
});

test('startRealtime: تغيير بالمصدر ← مزامنة فورية (بدون انتظار الدورية)، وإيقافه يفك الاشتراك', async () => {
  let rows = [];
  let cb = null;
  let started = 0;
  let unsubscribed = 0;
  const source = {
    start: () => { started += 1; },
    getActiveStreams: async () => ({ streams: rows }),
    onChange: (fn) => { cb = fn; return () => { unsubscribed += 1; cb = null; }; }
  };
  live.startRealtime(source, { safetyPollMs: 60_000, debounceMs: 20 });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(started, 1, 'المستمعون يشتغلون من الإقلاع');
  assert.equal(live.size(), 0);
  rows = [{ sessionId: 'site:tiktok:new', platform: 'tiktok', platformUsername: 'new', gameName: null }];
  cb(); cb(); cb(); // أحداث متلاحقة تتجمع بمزامنة وحدة
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(live.list().map((s) => [s.platformUsername, s.status]), [['new', 'linked']]);
  rows = [];
  live.stopPolling();
  assert.equal(unsubscribed, 1);
  assert.equal(cb, null);
});

// ---------------- دمج مصادر لوحة المالك (نفس قواعد ownerRenderStreamers) ----------------
const ts = (msAgo) => ({ toMillis: () => Date.now() - msAgo });

test('دمج البثوث: بثّ مربوط بدون لعبة، تنظيف @ والحالة، والأقدم من 12 ساعة يتجاهل (قاعدة اللوحة)', () => {
  const now = Date.now();
  const { streams } = activeStreams.buildStreams({
    now,
    rtRows: [
      { id: 'link_u1', username: '@Linker', platform: 'tiktok', gameTag: 'link', gameName: null, uid: 'u1', updatedAtMs: now - 5000 },
      { id: 'link_u2', username: 'oldie', platform: 'kick', gameTag: 'link', uid: 'u2', updatedAtMs: now - 13 * 3600e3 },
      { id: 'link_u3', username: '', platform: 'tiktok', updatedAtMs: now },
      { id: 'link_u4', username: 'weird', platform: 'facebook', updatedAtMs: now - 1000 }
    ]
  });
  assert.deepEqual(streams.map((s) => [s.platformUsername, s.platform, s.status, s.gameName]), [['weird', 'tiktok', 'linked', null], ['Linker', 'tiktok', 'linked', null]]);
  assert.equal(streams[1].sessionId, 'site:tiktok:linker', 'جلسة ثابتة لكل ستريمر');
});

test('دمج البثوث: اللي عنده لعبة يغلب اللي بدون (من أي مصدر)، وبعدها الأحدث، وستريمر واحد لكل منصة+يوزر', () => {
  const now = Date.now();
  const presence = new Map([['uA', now - 30e3]]);
  const merged = activeStreams.buildStreams({
    now,
    presence,
    rtRows: [{ id: 'link_uA', username: 'Dalal', platform: 'tiktok', gameTag: 'link', gameName: null, uid: 'uA', updatedAtMs: now - 1000 }],
    fsRows: [
      { id: 'cw', username: 'dalal', platform: 'tiktok', gameTag: 'cw', gameName: 'الدول', uid: 'uA', updatedAt: ts(60e3) },
      { id: 'rou', username: 'dalal', platform: 'tiktok', gameTag: 'rou', gameName: 'الروليت', uid: 'uA', updatedAt: ts(5e3) }
    ]
  }).streams;
  assert.equal(merged.length, 1);
  assert.equal(merged[0].gameName, 'الروليت', 'الأحدث بين اللعبتين');
  assert.equal(merged[0].status, 'playing');
  // رابط (له لعبة) أحدث من صف Firestore قديم بلعبة ثانية
  const m2 = activeStreams.buildStreams({
    now, presence,
    rtRows: [{ id: 'link_uA', username: 'dalal', platform: 'tiktok', gameName: 'المدفع', uid: 'uA', updatedAtMs: now - 100 }],
    fsRows: [{ id: 'cw', username: 'dalal', platform: 'tiktok', gameTag: 'cw', gameName: 'الدول', uid: 'uA', updatedAt: ts(60e3) }]
  }).streams;
  assert.equal(m2[0].gameName, 'المدفع');
  // نفس اليوزر بمنصتين = ستريمران
  assert.equal(activeStreams.buildStreams({ now, rtRows: [{ username: 'x', platform: 'tiktok', updatedAtMs: now }, { username: 'x', platform: 'twitch', updatedAtMs: now }] }).streams.length, 2);
});

test('دمج البثوث: صف Firestore يحتاج حضور (3 دقائق)، وبدون قدرة على قراءة الحضور نقبل الحديث فقط', () => {
  const now = Date.now();
  const row = (id, uid, msAgo) => ({ id, username: id, platform: 'twitch', gameTag: id, gameName: 'لعبة ' + id, uid, updatedAt: ts(msAgo) });
  const fsRows = [row('here', 'u1', 60e3), row('gone', 'u2', 60e3), row('fresh', 'u3', 60e3), row('old', 'u4', 30 * 60e3), row('nouid', null, 5 * 60e3), row('nouidold', null, 20 * 60e3)];
  const presence = new Map([['u1', now - 20e3], ['u2', now - 10 * 60e3]]);
  const withPresence = activeStreams.buildStreams({ now, fsRows, presence }).streams.map((s) => s.platformUsername).sort();
  assert.deepEqual(withPresence, ['here', 'nouid']);
  const unverified = activeStreams.buildStreams({ now, fsRows, presence: null }).streams.map((s) => s.platformUsername).sort();
  assert.deepEqual(unverified, ['fresh', 'gone', 'here', 'nouid'], 'بدون حضور: الحديث (أقل من 10 دقائق) فقط');
});

// ---------------- العرض اللحظي (الرسالة نفسها تتعدّل) ----------------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function fakeInteraction(userId = 'u1', { fail = null } = {}) {
  const edits = [];
  return {
    edits,
    user: { id: userId },
    deferred: false,
    replied: false,
    reply: async function (p) { this.replied = true; edits.push(['reply', p]); return { id: 'msg-' + userId }; },
    fetchReply: async () => ({ id: 'msg-' + userId }),
    editReply: async (p) => { if (fail) throw fail; edits.push(['edit', p]); },
    update: async (p) => edits.push(['update', p]),
    message: { id: 'msg-' + userId }
  };
}
const descOf = (payload) => payload.embeds[0].toJSON().description || '';

test.afterEach(() => board.stopAll());

test('/بث لحظي: ستريمر يربط يوزره ← الرسالة تتعدّل تلقائياً وتظهر "متصل بالبث"، وبعدها اللعبة، وبعدها تختفي', async () => {
  const i = fakeInteraction('u1');
  await liveCmd.execute(i);
  assert.equal(i.edits[0][0], 'reply');
  assert.match(descOf(i.edits[0][1]), /لا يوجد بث نشط/);
  assert.equal(board._internal.views.size, 1, 'الرسالة متتبَّعة');

  live.reconcile([{ sessionId: 'site:tiktok:newbie', platform: 'tiktok', platformUsername: 'newbie', gameName: null }]);
  await wait(450);
  let edit = i.edits.filter((e) => e[0] === 'edit').pop();
  assert.ok(edit, 'تعدّلت الرسالة بدون ما أحد يعيد الأمر');
  assert.match(descOf(edit[1]), /📡 متصل بالبث — يختار لعبة/);
  assert.match(descOf(edit[1]), /\[@newbie\]/);
  assert.match(edit[1].embeds[0].toJSON().footer.text, /يتحدّث لحظياً/);

  await wait(1600); // فاصل التعديلات
  live.reconcile([{ sessionId: 'site:tiktok:newbie', platform: 'tiktok', platformUsername: 'newbie', gameName: 'الدول' }]);
  await wait(450);
  edit = i.edits.filter((e) => e[0] === 'edit').pop();
  assert.match(descOf(edit[1]), /🎮 \*\*الدول\*\*/);

  await wait(1600);
  live.clearAll();
  await wait(450);
  edit = i.edits.filter((e) => e[0] === 'edit').pop();
  assert.match(descOf(edit[1]), /لا يوجد بث نشط/, 'طلع من البث ← اختفى');
});

test('/بث لحظي: تغيير ما يخص الصفحة/التصفية الحالية ما يسبب تعديل، والتعديلات المتلاحقة تُجمّع بفاصل', async () => {
  const i = fakeInteraction('u1');
  live.reconcile([{ sessionId: 'site:tiktok:a', platform: 'tiktok', platformUsername: 'a', gameName: 'x' }]);
  await liveCmd.execute(i);
  const before = i.edits.length;
  await wait(350);
  assert.equal(i.edits.length, before, 'ما تغيّر شي ← ما فيه تعديل');
  // 5 تغييرات متلاحقة خلال نصف ثانية ← تعديل واحد أو اثنين بالكثير (حماية معدّل Discord)
  for (let n = 0; n < 5; n += 1) live.reconcile([{ sessionId: 'site:tiktok:a', platform: 'tiktok', platformUsername: 'a', gameName: 'x' }, { sessionId: 'site:kick:b' + n, platform: 'kick', platformUsername: 'b' + n, gameName: null }]);
  await wait(2300);
  const edits = i.edits.length - before;
  assert.ok(edits >= 1 && edits <= 2, `عدد التعديلات ${edits}`);
  assert.match(descOf(i.edits[i.edits.length - 1][1]), /\[@b4\]/, 'آخر حالة هي اللي تظهر');
});

test('/بث لحظي: رسالة واحدة لكل مستخدم، سقف الرسائل المتتبَّعة، وتفاعل ميت (انتهى توكنه) يُسقط التتبع بدون خطأ', async () => {
  const a = fakeInteraction('u1');
  const a2 = fakeInteraction('u1');
  a2.fetchReply = async () => ({ id: 'msg-second' });
  await liveCmd.execute(a);
  await liveCmd.execute(a2);
  assert.deepEqual([...board._internal.views.keys()], ['msg-second'], 'القديمة وقفت');
  for (let n = 0; n < board._internal.MAX_VIEWS + 5; n += 1) board.track(fakeInteraction('user' + n), 'm' + n, { ownerId: 'user' + n });
  assert.equal(board._internal.views.size, board._internal.MAX_VIEWS);

  board.stopAll();
  const dead = fakeInteraction('u9', { fail: Object.assign(new Error('Unknown Webhook'), { code: 10015 }) });
  dead.editReply = async () => { throw Object.assign(new Error('Invalid Webhook Token'), { code: 50027 }); };
  board.track(dead, 'dead', { ownerId: 'u9' });
  live.reconcile([{ sessionId: 'site:tiktok:q', platform: 'tiktok', platformUsername: 'q', gameName: null }]);
  await wait(450);
  assert.equal(board._internal.views.size, 0, 'سقط التتبع');
});

test('/بث لحظي: نهاية النافذة (14 دقيقة) ← تعديل أخير بدون "يتحدّث لحظياً" والأزرار تبقى', async () => {
  const i = fakeInteraction('u1');
  await liveCmd.execute(i);
  board._internal.views.get('msg-u1').expiresAt = Date.now() - 1;
  await board.refreshNow();
  const last = i.edits[i.edits.length - 1];
  assert.equal(last[0], 'edit');
  assert.doesNotMatch(last[1].embeds[0].toJSON().footer.text, /لحظياً/);
  assert.ok(last[1].components.length >= 1);
  assert.equal(board._internal.views.size, 0);
});

test('أزرار /بث: تحديث/صفحة/تصفية تحدّث الرسالة وتجدّد نافذة اللحظية بتوكن الضغطة الجديدة', async () => {
  for (let n = 0; n < 12; n += 1) live.reconcile([...live.list().map((s) => ({ sessionId: s.sessionId, platform: s.platform, platformUsername: s.platformUsername, gameName: s.gameName })), { sessionId: 'site:twitch:s' + n, platform: 'twitch', platformUsername: 's' + n, gameName: 'لعبة' }]);
  const i = fakeInteraction('owner');
  await liveCmd.buttons.bt(i, ['page', '1', 'owner', 'all']);
  assert.equal(i.edits[0][0], 'update');
  assert.match(i.edits[0][1].embeds[0].toJSON().author.name, /صفحة 2 من 2/);
  assert.equal(board._internal.views.get('msg-owner').interaction, i, 'التتبع انتقل للتوكن الجديد');
  assert.equal(board._internal.views.get('msg-owner').page, 1);

  const f = fakeInteraction('owner');
  f.values = ['tiktok'];
  await liveCmd.buttons.bt(f, ['flt', 'owner']);
  assert.match(f.edits[0][1].embeds[0].toJSON().description, /ما فيه أحد يبث على \*\*تيك توك\*\*/);
  assert.equal(board._internal.views.get('msg-owner').filter, 'tiktok');

  const r = fakeInteraction('owner');
  await liveCmd.buttons.bt(r, ['ref', '0', 'owner', 'all']);
  assert.equal(r.edits[0][0], 'update');

  // غير صاحب القائمة: مرفوض (حتى بالتصفية)، وما يسرق التتبع
  const other = fakeInteraction('intruder');
  other.values = ['kick'];
  let replied = null;
  other.reply = async (p) => { replied = p; };
  await liveCmd.buttons.bt(other, ['flt', 'owner']);
  assert.ok(replied && replied.embeds[0].toJSON().description.includes('لشخص ثاني'));
  assert.equal(board._internal.views.get('msg-owner').interaction, r);
});
