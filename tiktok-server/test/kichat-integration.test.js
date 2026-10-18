'use strict';
// مكتبة kichat.js الحقيقية (بلا تعديل) ضد محاكي كيك محلي حقيقي (HTTPS + WebSocket Pusher) — ليس كيك الفعلي.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startKickMock } = require('./kick-mock');
const { KickChatSession } = require('../lib/kichat-session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(20); } return false; }
const FAST = { backoffBaseMs: 40, backoffMaxMs: 200, flushMs: 10, connectTimeoutMs: 3000, joinTimeoutMs: 3000, preflightTimeoutMs: 3000, rng: () => 0.5 };
const sender = (id, name, badges) => ({ id, username: name, slug: name.toLowerCase().replace(/_/g, '-'), identity: { color: '#fff', badges: (badges || []).map((type) => ({ type, text: type })) } });

function setup(M, slug, opts) {
  const s = new KickChatSession(slug, Object.assign({}, FAST, opts || {}));
  const rec = { states: [], msgs: [], events: [] };
  s.on('state', (x) => rec.states.push(x)); s.on('messages', (b) => rec.msgs.push(...b));
  for (const e of ['fatal', 'blocked', 'gaveup']) s.on(e, (x) => rec.events.push(e));
  rec.last = () => rec.states.at(-1) && rec.states.at(-1).state;
  return { s, rec };
}

let M;
test.before(async () => { M = await startKickMock(); });
test.after(async () => { await M.stop(); });

test('اتصال حقيقي بكامل البروتوكول: info → WS → subscribe → رسائل عربية/إيموجي/تشكيل تصل كما هي', async () => {
  M.setChannel('arab');
  const { s, rec } = setup(M, ' @ARAB ');
  await s.start();
  assert.equal(await until(() => rec.last() === 'connected'), true, JSON.stringify(rec.states));
  for (const t of ['انضم', 'انضَمّ', '١٢٣', '123', 'مرحبا 😍🔥 يا شباب', '[emote:37226:KEKW] يمين 1 4 6']) M.chat('arab', { sender: sender(7 + t.length, 'مشاهد_' + t.length > 0 ? 'viewer' + t.length : 'x'), content: t });
  assert.equal(await until(() => rec.msgs.length === 6), true, 'got ' + rec.msgs.length);
  assert.deepEqual(rec.msgs.map((m) => m.text), ['انضم', 'انضَمّ', '١٢٣', '123', 'مرحبا 😍🔥 يا شباب', 'يمين 1 4 6']);
  assert.ok(rec.msgs.every((m) => m.platform === 'kick' && m.userId && m.username));
  s.stop();
});

test('الرسالة المزدوجة (قناتا اشتراك المكتبة) تصل مرة واحدة فقط', async () => {
  M.setChannel('dual');
  const { s, rec } = setup(M, 'dual'); await s.start(); await until(() => rec.last() === 'connected');
  M.chat('dual', { id: 'same-1', content: 'مرة واحدة', dual: true, sender: sender(1, 'one') });
  await sleep(150);
  assert.equal(rec.msgs.length, 1); assert.equal(s.counters.dupId >= 1, true);
  s.stop();
});

test('شارات المشرف/المشترك تصل (isMod/isSub)', async () => {
  M.setChannel('badges');
  const { s, rec } = setup(M, 'badges'); await s.start(); await until(() => rec.last() === 'connected');
  M.chat('badges', { content: 'a', sender: sender(1, 'modguy', ['moderator']) }); M.chat('badges', { content: 'b', sender: sender(2, 'subguy', ['subscriber', 'founder']) });
  await until(() => rec.msgs.length === 2);
  assert.equal(rec.msgs[0].isMod, true); assert.equal(rec.msgs[0].isSub, false); assert.equal(rec.msgs[1].isSub, true);
  s.stop();
});

test('قناة غير مباشرة: not_live ثم تتحول لـconnected بحدث streamerIsLive وبأول رسالة', async () => {
  M.setChannel('offline', { live: false });
  const { s, rec } = setup(M, 'offline'); await s.start();
  assert.equal(await until(() => rec.last() === 'not_live'), true, JSON.stringify(rec.states));
  M.event('offline', 'App\\Events\\StreamerIsLive', { livestream: { id: 1 } });
  assert.equal(await until(() => rec.last() === 'connected'), true);
  M.event('offline', 'App\\Events\\StopStreamBroadcast', {});
  assert.equal(await until(() => rec.last() === 'not_live'), true);
  M.chat('offline', { content: 'x', sender: sender(1, 'late') });
  assert.equal(await until(() => rec.last() === 'connected'), true);
  s.stop();
});

test('قناة غير موجودة (404): fatal فوري بلا أي اتصال WS', async () => {
  const before = M.connectionsTotal;
  const { s, rec } = setup(M, 'ghost_channel_xyz'); await s.start(); await sleep(200);
  assert.deepEqual(rec.events, ['fatal']); assert.equal(M.connectionsTotal, before);
  assert.equal(rec.states.at(-1).code, 'user_not_found');
  s.stop();
});

test('مدخلات متنوعة تنتهي لنفس القناة (رابط/@/حروف كبيرة)', async () => {
  M.setChannel('varia');
  for (const raw of ['https://kick.com/Varia', '@VARIA', 'kick.com/varia/', '  varia  ']) {
    const { s, rec } = setup(M, raw); await s.start();
    assert.equal(await until(() => rec.last() === 'connected'), true, raw); s.stop();
  }
});

test('محجوب: 403 و429 وصفحة HTML → blocked (للرجوع للناقل الاحتياطي) بلا اتصال', async () => {
  const before = M.connectionsTotal;
  for (const [i, status] of [403, 429, 'html'].entries()) {
    M.setChannel('blk' + i, { status });
    const { s, rec } = setup(M, 'blk' + i); await s.start(); await sleep(100);
    assert.deepEqual(rec.events, ['blocked'], String(status)); s.stop();
  }
  assert.equal(M.connectionsTotal, before);
});

test('كيك 500 ثم يتعافى: إعادة محاولة بتراجع ثم اتصال ناجح بدون تدخل', async () => {
  M.setChannel('flaky', { status: 500 });
  const { s, rec } = setup(M, 'flaky'); await s.start();
  assert.equal(await until(() => rec.states.some((x) => x.state === 'reconnecting')), true);
  M.setChannel('flaky', { status: 200 });
  assert.equal(await until(() => rec.last() === 'connected', 4000), true, JSON.stringify(rec.states.slice(-4)));
  s.stop();
});

test('قطع الاتصال (TCP) يعيد الاتصال تلقائياً ويستأنف الرسائل، ولا يتراكم أكثر من اتصال حي واحد', async () => {
  M.setChannel('dropper');
  const { s, rec } = setup(M, 'dropper'); await s.start(); await until(() => rec.last() === 'connected');
  const total0 = M.connectionsTotal;
  for (let i = 0; i < 3; i++) {
    M.dropAll();
    assert.equal(await until(() => M.openCount() === 1 && rec.last() === 'connected', 4000), true, 'cycle ' + i + JSON.stringify(rec.states.slice(-3)));
    M.chat('dropper', { content: 'بعد القطع ' + i, sender: sender(10 + i, 'u' + i) });
    assert.equal(await until(() => rec.msgs.some((m) => m.text === 'بعد القطع ' + i)), true);
  }
  assert.equal(M.connectionsTotal - total0, 3);
  assert.equal(M.openCount(), 1);
  s.stop();
});

test('اتصال ميت بصمت (لا pong ولا إغلاق): الـwatchdog يكتشفه ويعيد الاتصال', async () => {
  M.setChannel('mute');
  M.activityTimeout = 1;                        // pusher يطلب ping كل ثانية → إطار كل ~1ث
  const { s, rec } = setup(M, 'mute', { idleLimitMs: 1500, watchdogEveryMs: 100 });
  await s.start(); await until(() => rec.last() === 'connected');
  const total0 = M.connectionsTotal;
  await sleep(1200);
  assert.equal(s.counters.stale, 0, 'اتصال سليم بصمت الشات لا يُعتبر ميتاً (pong دوري)');
  M.blackhole(true);
  assert.equal(await until(() => s.counters.stale >= 1, 6000), true);
  M.blackhole(false);
  assert.equal(await until(() => M.connectionsTotal > total0 && rec.last() === 'connected', 5000), true, JSON.stringify(rec.states.slice(-3)));
  M.chat('mute', { content: 'حي', sender: sender(1, 'alive') });
  assert.equal(await until(() => rec.msgs.some((m) => m.text === 'حي')), true);
  s.stop(); M.activityTimeout = 0;
});

test('رفض الاتصالات: محاولات بتراجع ثم استسلام (gaveup) بعدد محدّد، وبعدها لا محاولات إضافية', async () => {
  M.setChannel('rej'); M.rejectNew = true;
  const { s, rec } = setup(M, 'rej', { maxAttempts: 3 }); const t0 = M.connectionsTotal; await s.start();
  assert.equal(await until(() => rec.events.includes('gaveup'), 8000), true, JSON.stringify(rec.states.map((x) => x.state)));
  M.rejectNew = false; await sleep(500);
  assert.equal(rec.states.filter((x) => x.state === 'reconnecting').length, 3);
  assert.equal(M.openCount(), 0);
  s.stop();
});

test('stop(): يُغلق الاتصال الحي فوراً ولا يعيد الاتصال بعدها أبداً (لا اتصال شبح)', async () => {
  M.setChannel('stopper');
  const { s, rec } = setup(M, 'stopper'); await s.start(); await until(() => rec.last() === 'connected');
  const total = M.connectionsTotal; s.stop();
  assert.equal(await until(() => M.openCount() === 0, 2000), true);
  await sleep(600); assert.equal(M.connectionsTotal, total);
  // stop أثناء مهلة إعادة الاتصال
  M.setChannel('stopper2'); const b = setup(M, 'stopper2', { backoffBaseMs: 300, backoffMaxMs: 300 }); await b.s.start(); await until(() => b.rec.last() === 'connected');
  M.dropAll(); await until(() => b.rec.last() === 'reconnecting'); b.s.stop(); const t2 = M.connectionsTotal;
  await sleep(900); assert.equal(M.connectionsTotal, t2); assert.equal(M.openCount(), 0);
});

test('٣٠ دورة start/stop سريعة: لا تسرّب اتصالات ولا مؤقتات', async () => {
  M.setChannel('cycle');
  const before = process._getActiveHandles().length;
  for (let i = 0; i < 30; i++) { const { s } = setup(M, 'cycle'); const p = s.start(); if (i % 3 === 0) await sleep(30); s.stop(); await p; }
  await sleep(500);
  assert.equal(M.openCount(), 0);
  assert.ok(process._getActiveHandles().length - before <= 3, 'handles +' + (process._getActiveHandles().length - before));
});

test('ضغط: ٣٠٠٠ رسالة من ٤٠٠ مستخدم خلال ثانيتين — لا انهيار، الإغراق يُحجب، كل لاعب عادي يمر، الذاكرة مستقرة', async () => {
  M.setChannel('flood');
  const { s, rec } = setup(M, 'flood', { gate: { burst: 5, ratePerSec: 2 } }); await s.start(); await until(() => rec.last() === 'connected');
  const rss0 = process.memoryUsage().rss;
  const t0 = Date.now();
  for (let i = 0; i < 3000; i++) M.chat('flood', { id: 'f' + i, content: i % 10 === 0 ? 'spam' + i : '١', sender: sender(1 + (i % 400), 'user' + (i % 400)) });
  M.chat('flood', { id: 'normal-1', content: 'صوتي', sender: sender(99999, 'normal_player') });
  assert.equal(await until(() => rec.msgs.some((m) => m.text === 'صوتي'), 8000), true);
  const ms = Date.now() - t0;
  assert.ok(ms < 6000, 'elapsed ' + ms);
  const per = {}; for (const m of rec.msgs) per[m.userId] = (per[m.userId] || 0) + 1;
  // ٣٠٠٠ رسالة / ٤٠٠ مستخدم ≈ ٧.٥ لكل مستخدم بنافذة ثانيتين: burst 5 + معدل 2/ث ⇒ بحدود ≤ ~9
  assert.ok(Math.max(...Object.values(per)) <= 10, 'max per user ' + Math.max(...Object.values(per)));
  assert.ok(rec.msgs.length < 3000 && rec.msgs.length > 400);
  assert.ok(process.memoryUsage().rss - rss0 < 150 * 1024 * 1024);
  console.log('    # flood:', JSON.stringify({ sent: 3001, delivered: rec.msgs.length, ms, counters: s.counters }));
  s.stop();
});
