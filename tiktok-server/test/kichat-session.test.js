'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { KickChatSession, checkChannel } = require('../lib/kichat-session');
const { FakeClock, flush } = require('./helpers');

// عميل KiChatjs مزيّف يطابق واجهة المكتبة الحقيقية (on/off/emit/connect/join/close + حقل listeners)
class FakeKi {
  static instances = [];
  constructor(opts) { this.opts = opts; this.listeners = new Map(); this.closed = false; this.wasCloseCalled = false; this.joined = null; FakeKi.instances.push(this); this.behavior = FakeKi.nextBehavior || 'ok'; }
  on(e, f) { if (!this.listeners.has(e)) this.listeners.set(e, new Set()); this.listeners.get(e).add(f); return this; }
  off(e, f) { this.listeners.get(e)?.delete(f); return this; }
  emit(e, ...a) { if (!this.listeners.has(e)) { if (e === 'error') throw a[0]; return false; } for (const f of [...this.listeners.get(e)]) f(...a); return true; }
  connect() {
    if (this.behavior === 'socketError') setImmediate(() => this.emit('socketError', new Error('ECONNREFUSED')));
    else if (this.behavior !== 'hang') setImmediate(() => this.emit('connected'));
  }
  async join(slug) { if (this.behavior === 'joinFail') throw new Error('Timed out waiting for event: join'); this.joined = slug; setImmediate(() => this.emit('raw', '{}')); }
  close() { this.closed = true; }
}
const chanInfo = (over) => Object.assign({ id: 1, slug: 'chan', user: { username: 'Chan' }, chatroom: { id: 123456 }, livestream: { is_live: true } }, over || {});
const okFetch = (info) => async () => ({ ok: true, status: 200, json: async () => info || chanInfo() });
const statusFetch = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('not json'); return body; } });
const mkTimers = (clock) => ({ now: clock.now, set: clock.setTimer, clear: clock.clearTimer });
const chat = (id, uid, text) => ({ id, content: text, type: 'message', created_at: new Date(0).toISOString(), sender: { id: uid, username: 'u' + uid, slug: 'u' + uid, identity: { badges: [] } } });
function mk(over) {
  FakeKi.instances = []; FakeKi.nextBehavior = null;
  const clock = new FakeClock();
  const s = new KickChatSession('Chan', Object.assign({ KiChatjs: FakeKi, fetch: okFetch(), timers: mkTimers(clock), rng: () => 0.5 }, over || {}));
  const states = [], batches = [], events = [];
  s.on('state', (x) => states.push(x)); s.on('messages', (b) => batches.push(b));
  for (const e of ['fatal', 'blocked', 'gaveup']) s.on(e, (x) => events.push([e, x]));
  return { s, clock, states, batches, events, last: () => FakeKi.instances[FakeKi.instances.length - 1] };
}

test('checkChannel: 200 → ok، 404 → not_found، 403/429 → blocked، HTML → blocked، 5xx/شبكة → unavailable', async () => {
  assert.deepEqual(await checkChannel('@Chan', { fetch: okFetch() }).then((r) => [r.ok, r.slug, r.live]), [true, 'chan', true]);
  assert.equal((await checkChannel('chan', { fetch: okFetch(chanInfo({ livestream: null })) })).live, false);
  assert.equal((await checkChannel('chan', { fetch: statusFetch(404) })).code, 'not_found');
  assert.equal((await checkChannel('chan', { fetch: statusFetch(403) })).code, 'blocked');
  assert.equal((await checkChannel('chan', { fetch: statusFetch(429) })).code, 'blocked');
  assert.equal((await checkChannel('chan', { fetch: statusFetch(200) })).code, 'blocked');          // 200 لكن ليس JSON (صفحة تحدّي)
  assert.equal((await checkChannel('chan', { fetch: statusFetch(503) })).code, 'unavailable');
  assert.equal((await checkChannel('chan', { fetch: async () => { throw new Error('ENOTFOUND'); } })).code, 'unavailable');
  assert.equal((await checkChannel('chan', { fetch: statusFetch(200, { weird: true }) })).code, 'unavailable');
  assert.equal((await checkChannel('', { fetch: okFetch() })).code, 'invalid');
  assert.equal((await checkChannel('a b', { fetch: okFetch() })).code, 'invalid');
});

test('checkChannel: اسم فيه _ يجرّب صيغة - عند 404', async () => {
  const urls = [];
  const f = async (u) => { urls.push(u); return u.includes('some-user') ? { ok: true, status: 200, json: async () => chanInfo({ slug: 'some-user' }) } : { ok: false, status: 404, json: async () => ({}) }; };
  const r = await checkChannel('Some_User', { fetch: f });
  assert.equal(r.ok, true); assert.equal(r.slug, 'some-user'); assert.equal(urls.length, 2);
});

test('اتصال ناجح: preflight ثم connect ثم join بنفس slug، حالة connected، وبلا جلب مكرر للمكتبة', async () => {
  const t = mk(); await t.s.start(); await flush();
  const c = t.last();
  assert.equal(c.opts.reconnect, false);                       // إعادة الاتصال بيدنا لا بالمكتبة
  assert.equal(c.opts.subscribePusher.predictions, false);
  assert.equal(c.joined, 'chan');
  assert.deepEqual(t.states.map((x) => x.state), ['connecting', 'connected']);
  assert.equal(await c.fetchUserInfo().then((i) => i.slug), 'chan'); // fetchUserInfo مُستبدلة بنتيجة فحصنا
  t.s.stop();
});

test('قناة غير مباشرة: not_live ثم أول رسالة تقلبها connected', async () => {
  const t = mk({ fetch: okFetch(chanInfo({ livestream: null })) }); await t.s.start(); await flush();
  assert.equal(t.states.at(-1).state, 'not_live');
  t.last().emit('message', chat('1', 5, 'انضم'), {}); await t.clock.advance(60);
  assert.equal(t.states.at(-1).state, 'connected');
  assert.equal(t.batches.flat().length, 1);
  t.last().emit('stopStreamBroadcast', {}, {}); assert.equal(t.states.at(-1).state, 'not_live');
  t.last().emit('streamerIsLive', {}, {}); assert.equal(t.states.at(-1).state, 'connected');
  t.s.stop();
});

test('قناة غير موجودة: fatal user_not_found بلا أي اتصال ولا إعادة محاولة', async () => {
  const t = mk({ fetch: statusFetch(404) }); await t.s.start(); await t.clock.advance(120000);
  assert.deepEqual(t.events, [['fatal', { code: 'user_not_found', detail: '404' }]]);
  assert.equal(FakeKi.instances.length, 0);
  assert.equal(t.states.at(-1).code, 'user_not_found');
});

test('مدخل غير صالح: fatal بلا اتصال', async () => {
  const t = mk(); t.s.rawSlug = 'اسم عربي'; await t.s.start();
  assert.equal(t.events[0][0], 'fatal'); assert.equal(FakeKi.instances.length, 0);
});

test('محجوب (403): يُطلق blocked ليتحوّل الناقل للقديم — بلا إعادة محاولة ذاتية', async () => {
  const t = mk({ fetch: statusFetch(403) }); await t.s.start(); await t.clock.advance(300000);
  assert.deepEqual(t.events.map((e) => e[0]), ['blocked']);
  assert.equal(FakeKi.instances.length, 0);
});

test('تراجع أسّي عند فشل الاتصال، حد أقصى، ثم استسلام (gaveup) بلا مؤقتات متبقية', async () => {
  const t = mk({ maxAttempts: 4, backoffBaseMs: 1000, backoffMaxMs: 60000 });
  FakeKi.nextBehavior = 'socketError';                          // كل عميل جديد يفشل
  const delays = [];
  t.s.on('state', (x) => { if (x.state === 'reconnecting') delays.push(x.delayMs); });
  await t.s.start(); await t.clock.advance(10 * 60 * 1000);
  assert.deepEqual(delays, [1000, 2000, 4000, 8000]);
  assert.deepEqual(t.events.map((e) => e[0]), ['gaveup']);
  assert.equal(t.states.at(-1).state, 'error'); assert.equal(t.states.at(-1).code, 'connect_failed');
  assert.equal(FakeKi.instances.length, 5);                     // محاولة أولى + 4 إعادات
  assert.equal(t.clock.timers.length, 0, 'لا مؤقتات متبقية');
});

test('نجاح بعد فشل يُصفّر العدّاد (التراجع يبدأ من جديد عند الانقطاع التالي)', async () => {
  const t = mk({ maxAttempts: 5 });
  const delays = []; t.s.on('state', (x) => { if (x.state === 'reconnecting') delays.push(x.delayMs); });
  FakeKi.nextBehavior = 'socketError';
  await t.s.start(); await flush();
  FakeKi.nextBehavior = 'ok';
  await t.clock.advance(5000); await flush();
  assert.equal(t.s.state, 'connected'); assert.equal(t.s.attempts, 0);
  t.last().emit('disconnected', 'closed'); await flush();
  assert.equal(delays.length, 2); assert.equal(delays[1], 1000);  // رجع للبداية
  t.s.stop();
});

test('فشل join (مهلة) = فشل محاولة وليس اتصالاً ناجحاً', async () => {
  const t = mk({ maxAttempts: 2 });
  FakeKi.nextBehavior = 'joinFail';
  await t.s.start(); await flush();
  assert.equal(t.states.some((x) => x.state === 'connected'), false);
  assert.equal(t.states.at(-1).state, 'reconnecting');
  t.s.stop();
});

test('الانقطاع بعد الاتصال يستبدل العميل بالكامل ويغلق القديم', async () => {
  const t = mk(); await t.s.start(); await flush();
  const first = t.last(); first.emit('disconnected', 'Socket closed with code 1006'); await flush();
  assert.equal(t.states.at(-1).state, 'reconnecting');
  await t.clock.advance(3000); await flush();
  assert.equal(FakeKi.instances.length, 2);
  assert.equal(first.closed, true); assert.equal(first.wasCloseCalled, true); assert.equal(first.listeners.size === 0 || [...first.listeners.keys()].every((k) => k === 'error' || k === 'socketError'), true);
  assert.equal(t.states.at(-1).state, 'connected');
  t.s.stop();
});

test('أحداث العميل القديم بعد استبداله لا تؤثر (لا رسائل ولا تغيير حالة)', async () => {
  const t = mk(); await t.s.start(); await flush();
  const old = t.last(); old.emit('disconnected', 'x'); await t.clock.advance(3000); await flush();
  const before = t.states.length;
  old.listeners.forEach((set, k) => { if (k === 'message') set.forEach((f) => f(chat('zz', 1, 'ghost'), {})); });
  old.emit('socketError', new Error('late')); old.emit('disconnected', 'late');
  await t.clock.advance(200);
  assert.equal(t.batches.flat().length, 0); assert.equal(t.states.length, before);
  t.s.stop();
});

test('watchdog: صمت أطول من idleLimit = اتصال ميت → إعادة اتصال؛ الإطارات تمنعه', async () => {
  const t = mk({ idleLimitMs: 100000, watchdogEveryMs: 10000 }); await t.s.start(); await flush();
  const c = t.last();
  for (let i = 0; i < 20; i++) { await t.clock.advance(8000); c.emit('raw', '{"event":"pusher:pong"}'); }   // 160ث بإطارات منتظمة
  assert.equal(FakeKi.instances.length, 1);
  await t.clock.advance(120000);                                                                            // ثم صمت تام
  assert.equal(t.s.counters.stale, 1);
  assert.ok(FakeKi.instances.length >= 2);
  t.s.stop();
});

test('stop(): يغلق العميل ويلغي كل المؤقتات ويمنع أي إعادة اتصال لاحقة (لا تسرب)', async () => {
  const t = mk(); await t.s.start(); await flush();
  const c = t.last(); t.s.stop();
  assert.equal(c.closed, true); assert.equal(t.clock.timers.length, 0);
  await t.clock.advance(10 * 60 * 1000);
  assert.equal(FakeKi.instances.length, 1);
  // stop أثناء مهلة إعادة الاتصال
  const u = mk(); await u.s.start(); await flush(); u.last().emit('disconnected', 'x'); await flush();
  assert.equal(u.s.state, 'reconnecting'); u.s.stop(); await u.clock.advance(10 * 60 * 1000);
  assert.equal(FakeKi.instances.length, 1); assert.equal(u.clock.timers.length, 0);
  // stop قبل انتهاء preflight
  FakeKi.instances = []; const clk = new FakeClock();
  let release; const slow = () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => chanInfo() }); });
  const s3 = new KickChatSession('chan', { KiChatjs: FakeKi, fetch: slow, timers: mkTimers(clk) });
  const p = s3.start(); s3.stop(); release(); await p; await flush();
  assert.equal(FakeKi.instances.length, 0);
});

test('تكرار الاتصال: start() مرتين متتاليتين لا ينشئ عميلين حيّين', async () => {
  const t = mk(); await Promise.all([t.s.start(), t.s.start()]); await flush();
  const alive = FakeKi.instances.filter((c) => !c.closed);
  assert.equal(alive.length, 1);
  t.s.stop();
});

test('الرسائل: تُجمَّع بدفعات، المكررة (معرّف أو نص) والإغراق تُحجب، والعربية تصل كما هي', async () => {
  const t = mk({ gate: { burst: 5, ratePerSec: 2 } }); await t.s.start(); await flush();
  const c = t.last();
  c.emit('message', chat('a', 1, 'انضم'), {});
  c.emit('message', chat('a', 1, 'انضم'), {});                  // نفس المعرّف (اشتراكان)
  c.emit('message', chat('b', 1, 'انضم'), {});                  // نفس النص فوراً
  c.emit('message', chat('c', 2, '[emote:1:x] ١٢٣ 😍'), {});
  c.emit('message', chat('d', 3, '   '), {});                   // فارغة
  for (let i = 0; i < 100; i++) c.emit('message', chat('f' + i, 9, 'سبام' + i), {});
  await t.clock.advance(100);
  const all = t.batches.flat();
  assert.equal(t.batches.length, 1, 'دفعة واحدة');
  assert.equal(all.filter((m) => m.userId === '1').length, 1);
  assert.equal(all.find((m) => m.userId === '2').text, '١٢٣ 😍');
  assert.equal(all.filter((m) => m.userId === '9').length, 5);   // burst فقط
  assert.equal(t.s.counters.dupId, 1); assert.equal(t.s.counters.dupText, 1); assert.ok(t.s.counters.rateLimited >= 95);
  t.s.stop();
});

test('طابور محدود: تحت ضغط هائل لا ينمو بلا حد ويُحصى المحذوف', async () => {
  const t = mk({ queueMax: 100, gate: { burst: 1e9, ratePerSec: 1e9, dupWindowMs: 0 } }); await t.s.start(); await flush();
  for (let i = 0; i < 1000; i++) t.last().emit('message', chat('m' + i, i, 'x' + i), {});
  assert.ok(t.s.queue.length <= 100); assert.equal(t.s.counters.dropped, 900);
  await t.clock.advance(100); assert.equal(t.batches.flat().length, 100);
  t.s.stop();
});
