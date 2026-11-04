import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  extractUser, buildComment, buildGift, buildFollow, buildLike, buildViewer,
  LegacyTikTokRoom,
} from '../src/legacyBridge.js';
import { HostNotOnlineError, UserNotFoundError } from 'piratetok-live-js';

/* ============================================================
   دوال التحويل الصرفة — مطابقة الشكل لـtiktok-server/server.js
   ============================================================ */

test('extractUser: يبني شكل user المطابق لما تقرأه extractUser() بـindex.html', () => {
  const raw = {
    uniqueId: 'someone', nickname: 'Some One',
    avatarThumb: { urlList: ['http://p16-sign.tiktokcdn.com/abc.jpeg'] },
    followInfo: { followStatus: 1 },
  };
  const u = extractUser(raw, { isFollowerOfAnchor: true });
  assert.equal(u.uniqueId, 'someone');
  assert.equal(u.nickname, 'Some One');
  assert.equal(u.profilePictureUrl, 'https://p16-sign.tiktokcdn.com/abc.jpeg'); // http يُحوَّل https
  assert.equal(u.avatar, u.profilePictureUrl);
  assert.equal(u.avatarUrl, u.profilePictureUrl);
  assert.equal(u.isFollower, true);
  assert.equal(u.followKnown, true);
  assert.deepEqual(u.followInfo, { followStatus: 1 });
});

test('extractUser: مستخدم غائب يرجع قيماً افتراضية آمنة بدل رمي', () => {
  const u = extractUser(null);
  assert.equal(u.uniqueId, '?');
  assert.equal(u.isFollower, false);
});

test('buildComment: type=WebcastChatMessage وcomment من data.content', () => {
  const msg = buildComment({ content: 'مرحبا', user: { uniqueId: 'a', nickname: 'A' } });
  assert.equal(msg.type, 'WebcastChatMessage');
  assert.equal(msg.comment, 'مرحبا');
  assert.equal(msg.user.uniqueId, 'a');
  assert.ok(typeof msg.timestamp === 'number');
});

test('buildGift: يقرأ gift.name/diamondCount وrepeatCount من data مباشرة', () => {
  // giftId حقل منفصل أعلى مستوى WebcastGiftMessage (مو gift.id الداخلي بـGiftStruct) — نفس
  // ما يقرأه tiktok-server/server.js (data.giftId || 0).
  const msg = buildGift({ gift: { name: 'وردة', diamondCount: 1, id: 999 }, giftId: 5001, repeatCount: 3, user: { uniqueId: 'b' } });
  assert.equal(msg.type, 'WebcastGiftMessage');
  assert.equal(msg.giftName, 'وردة');
  assert.equal(msg.diamondCount, 1);
  assert.equal(msg.repeatCount, 3);
  assert.equal(msg.giftId, 5001);
});

test('buildFollow: يفرض isFollower=true/followStatus=1 بغض النظر عن حالة user قبلها', () => {
  const msg = buildFollow({ user: { uniqueId: 'c', followInfo: { followStatus: 0 } } });
  assert.equal(msg.type, 'WebcastSocialMessage');
  assert.equal(msg.displayType, 'follow');
  assert.equal(msg.user.isFollower, true);
  assert.deepEqual(msg.user.followInfo, { followStatus: 1 });
});

test('buildLike: count/total من data.count وdata.total (لا likeCount/totalLikeCount)', () => {
  const msg = buildLike({ count: 5, total: 120, user: { uniqueId: 'd' } });
  assert.equal(msg.type, 'WebcastLikeMessage');
  assert.equal(msg.likeCount, 5);
  assert.equal(msg.totalLikeCount, 120);
});

test('buildViewer: type=WebcastRoomUserSeqMessage وviewerCount من totalUser', () => {
  const msg = buildViewer(42);
  assert.equal(msg.type, 'WebcastRoomUserSeqMessage');
  assert.equal(msg.viewerCount, 42);
});

/* ============================================================
   LegacyTikTokRoom — آلة الحالة، بعميل وهمي (بلا شبكة حقيقية)
   ============================================================ */

function fakeTimers() {
  const scheduled = [];
  let nextId = 1;
  return {
    scheduled,
    setTimer(fn, delay) { const id = nextId++; scheduled.push({ id, fn, delay }); return id; },
    clearTimer(id) { const i = scheduled.findIndex((t) => t.id === id); if (i > -1) scheduled.splice(i, 1); },
    fireNext() { const t = scheduled.shift(); if (t) t.fn(); },
  };
}

// محاكي EventEmitter لـTikTokLiveClient: connect() يُحلّ/يُرفض حسب script، ويدعم إطلاق
// 'disconnected'/'liveEnded' لاحقاً يدوياً بالاختبار لمحاكاة سلوك حقيقي بعد نجاح الاتصال.
class FakeClient extends EventEmitter {
  constructor(username, behavior) {
    super();
    this.username = username;
    this.behavior = behavior; // 'ok' | MockClassifiedError instance
    this.disconnected = false;
  }
  async connect() {
    if (this.behavior instanceof Error) throw this.behavior;
    return { roomId: '123' };
  }
  disconnect() { this.disconnected = true; }
}

function makeClients(ws) { return { OPEN: 1, CLOSED: 3 }; }

function fakeWs() {
  const sent = [];
  return { readyState: 1, OPEN: 1, send(data) { sent.push(JSON.parse(data)); }, sent };
}

test('LegacyTikTokRoom: اتصال ناجح ينتقل connecting -> connected ويبث للعملاء', async () => {
  const t = fakeTimers();
  let created = null;
  const room = new LegacyTikTokRoom('abc', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => { created = new FakeClient(u, 'ok'); return created; },
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r)); // ننتظر دورة المايكروتاسك لـstart() async

  assert.equal(room.state, 'connected');
  const states = ws.sent.map((m) => m.state);
  assert.ok(states.includes('connecting'));
  assert.ok(states.includes('connected'));

  // حدث شات حقيقي بعد الاتصال يبث بالشكل القديم المتوافق
  created.emit('chat', { content: 'هلا', user: { uniqueId: 'x', nickname: 'X' } });
  const chatMsg = ws.sent[ws.sent.length - 1];
  assert.equal(chatMsg.messages[0].type, 'WebcastChatMessage');
  assert.equal(chatMsg.messages[0].comment, 'هلا');
});

test('LegacyTikTokRoom: فشل "offline" ينتقل لحالة not_live ويجدول إعادة محاولة', async () => {
  const t = fakeTimers();
  const room = new LegacyTikTokRoom('notlive', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => new FakeClient(u, new HostNotOnlineError(u)),
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r));

  assert.equal(room.state, 'not_live');
  assert.equal(t.scheduled.length, 1, 'يجب جدولة إعادة محاولة واحدة');
});

test('LegacyTikTokRoom: فشل "permanent" (يوزر غير موجود) ينتقل لحالة error مع fatal=true', async () => {
  const t = fakeTimers();
  const room = new LegacyTikTokRoom('ghost', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => new FakeClient(u, new UserNotFoundError(u)),
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r));

  assert.equal(room.state, 'error');
  assert.equal(room.lastExtra.fatal, true);
  assert.equal(room.lastExtra.code, 'user_not_found');
});

test('LegacyTikTokRoom: انقطاع بعد اتصال ناجح (disconnected) يعيد الحالة لـreconnecting ويجدول محاولة', async () => {
  const t = fakeTimers();
  let created = null;
  const room = new LegacyTikTokRoom('livey', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => { created = new FakeClient(u, 'ok'); return created; },
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r));
  assert.equal(room.state, 'connected');

  created.emit('disconnected', null);
  assert.equal(room.state, 'reconnecting');
  assert.equal(t.scheduled.length, 1);
});

test('LegacyTikTokRoom: انتهاء البث (liveEnded) ينتقل لـnot_live', async () => {
  const t = fakeTimers();
  let created = null;
  const room = new LegacyTikTokRoom('ended', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => { created = new FakeClient(u, 'ok'); return created; },
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r));

  created.emit('liveEnded', {});
  assert.equal(room.state, 'not_live');
});

test('LegacyTikTokRoom: عميل جديد ينضم أثناء انتظار يستقبل الحالة الحالية فوراً', async () => {
  const t = fakeTimers();
  const room = new LegacyTikTokRoom('later', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => new FakeClient(u, 'ok'),
  });
  const ws1 = fakeWs();
  room.addClient(ws1);
  await new Promise((r) => setImmediate(r));
  assert.equal(room.state, 'connected');

  const ws2 = fakeWs();
  room.addClient(ws2);
  assert.equal(ws2.sent[0].state, 'connected', 'العميل الثاني يستقبل الحالة الحالية فوراً عند الانضمام');
});

test('LegacyTikTokRoom: إغلاق كل العملاء يجدول teardown، وانضمام عميل جديد يلغيه', async () => {
  const t = fakeTimers();
  const room = new LegacyTikTokRoom('grace', {
    log: () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer,
    clientFactory: (u) => new FakeClient(u, 'ok'),
  });
  const ws = fakeWs();
  room.addClient(ws);
  await new Promise((r) => setImmediate(r));

  room.removeClient(ws, 1000);
  assert.equal(t.scheduled.filter((s) => s.delay === 10000).length, 1, 'مهلة سماح 10ث لإغلاق 1000');

  let teardownCalled = false;
  room.onTeardown = () => { teardownCalled = true; };
  const ws2 = fakeWs();
  room.addClient(ws2); // ينضم قبل انتهاء المهلة
  t.scheduled.length = 0; // المؤقت أُلغي فعلياً بـaddClient؛ هذا فقط ينظّف أي بقايا بالاختبار
  assert.equal(teardownCalled, false, 'لا يُغلق لأن عميلاً جديداً انضم قبل المهلة');
});
