'use strict';

// اختبار تكامل لطبقة الـAPI ضد Firebase Emulator (Firestore).
// يتخطّى نفسه تلقائياً لو المحاكي مو شغّال، فما يأثر على `npm test` العادي.
//
// التشغيل:
//   npx firebase-tools emulators:start --project demo-ehsmaha --only firestore
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const path = require('node:path');

const EMULATED = !!process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'demo-ehsmaha';
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const API_KEY = crypto.randomBytes(24).toString('hex');

// Service Account وهمي (مفتاح RSA عشوائي) — المحاكي ما يتحقق من التوقيع
function fakeServiceAccount() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({
    type: 'service_account',
    project_id: PROJECT,
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: `test@${PROJECT}.iam.gserviceaccount.com`
  });
}

async function call(method, url, { key = API_KEY } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  const res = await fetch(BASE + url, { method, headers });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('API integration (Firebase emulator)', { skip: !EMULATED && 'Firebase emulator غير مشغّل' }, async (t) => {
  process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccount();
  const firestore = require('../database/firestore');
  firestore.init({});
  const db = firestore.db();
  const { Timestamp } = firestore;

  // تنظيف المحاكي
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });

  // ---- بيانات بنفس شكل بيانات الموقع ----
  const now = Timestamp.now();
  await db.collection('users').doc('uidAlice').set({
    username: 'Alice_1', usernameLower: 'alice_1', createdAt: Timestamp.fromDate(new Date('2025-01-15T10:00:00Z')),
    onlinePoints: 350, soloWinCount: 3, onlineWinCount: 2, bestRoundPoints: 120,
    linkedTiktokUsername: 'alice.tt', linkedTiktokAvatar: ''
  });
  await db.collection('usernames').doc('alice_1').set({ uid: 'uidAlice' });
  // حساب بدون مستند فهرس usernames (يختبر مسار الاحتياط)
  await db.collection('users').doc('uidBob').set({ username: 'Bob', usernameLower: 'bob', createdAt: now });
  await db.collection('levels').doc('alice_1').set({ key: 'alice_1', xp: 40, level: 1, roundsPlayed: 4 });
  await db.collection('levels').doc('alice.tt').set({
    key: 'alice.tt', username: 'Alice TT', xp: 900, level: 7, roundsPlayed: 40, updatedAt: now,
    gamesPlayCount: { bomb: 12, cw: 5 }, activityLog: [{ game: 'bomb', at: Date.now() }, { game: 'cw', at: Date.now() - 60000 }]
  });
  // لاعب بث بدون حساب، ومعرّفه عربي
  await db.collection('levels').doc('أحمد_تيك').set({ key: 'أحمد_تيك', username: 'أحمد 🔥', xp: 300, roundsPlayed: 9, updatedAt: now, createdAt: now });
  for (let i = 0; i < 13; i++) {
    await db.collection('levels').doc(`viewer${i}`).set({ key: `viewer${i}`, username: `Viewer ${i}`, xp: 100 + i * 50, roundsPlayed: i + 1, updatedAt: now });
  }
  await db.collection('leaderboards').doc('streamer1').set({ 'alice.tt': { nickname: 'Alice', wins: 7, games: {} }, viewer1: { nickname: 'V1', wins: 2 }, 'أحمد_تيك': { nickname: 'أحمد', wins: 4 } });
  await db.collection('leaderboards').doc('streamer2').set({ 'tiktok:alice.tt': { nickname: 'Alice', wins: 1 } });
  await db.collection('streamerEvents').doc('bestStreamer_1').set({
    type: 'bestStreamer', status: 'active', title: 'أفضل ستريمر', broadcastMessage: 'يلا نحسمها!',
    createdAt: now, contest_end_at: Timestamp.fromDate(new Date(Date.now() + 86400000))
  });
  await db.collection('streamerEvents').doc('old').set({ type: 'bestStreamer', status: 'ended' });

  // ---- تشغيل السيرفر ----
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'api', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), API_KEY, LOG_LEVEL: 'warn', NODE_ENV: 'test', API_LEADERBOARD_CACHE_SECONDS: '0' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  server.stdout.on('data', (d) => (serverLog += d));
  server.stderr.on('data', (d) => (serverLog += d));
  t.after(() => server.kill('SIGTERM'));
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/health')).ok) break; } catch (_) { /* لسا يقلع */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  await t.test('health', async () => {
    const r = await call('GET', '/health', { key: null });
    assert.equal(r.status, 200, serverLog);
  });

  await t.test('مفتاح API خاطئ → 401', async () => {
    const r = await call('GET', '/api/discord/profile-by-username/alice_1', { key: 'wrong-key' });
    assert.equal(r.status, 401);
    assert.equal(r.body.error.code, 'UNAUTHORIZED');
  });

  const enc = encodeURIComponent;

  await t.test('يوزر غير موجود → PLAYER_NOT_FOUND', async () => {
    for (const path of ['profile-by-username', 'stats-by-username']) {
      const r = await call('GET', `/api/discord/${path}/${enc('nobody_here')}`);
      assert.equal(r.status, 404);
      assert.equal(r.body.error.code, 'PLAYER_NOT_FOUND');
    }
  });

  await t.test('ترميز رابط تالف → INVALID_INPUT بدل خطأ داخلي', async () => {
    const r = await call('GET', '/api/discord/profile-by-username/%E0%A4%A');
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'INVALID_INPUT');
  });

  await t.test('بروفايل: البحث case-insensitive ويتجاهل الفراغات و@', async () => {
    for (const input of ['Alice_1', 'ALICE_1', '  alice_1  ', '@Alice_1']) {
      const r = await call('GET', `/api/discord/profile-by-username/${enc(input)}`);
      assert.equal(r.status, 200, input + ' ' + JSON.stringify(r.body));
      const p = r.body.data;
      assert.equal(p.username, 'Alice_1');
      assert.equal(p.registered, true);
      assert.equal(p.xp, 900); // المستند الأعلى XP (مفتاح تيك توك)
      assert.equal(p.roundsPlayed, 40);
      assert.equal(p.points, 350);
      assert.equal(p.tiktokUsername, 'alice.tt');
      assert.equal(p.joinedAt, '2025-01-15T10:00:00.000Z');
      assert.ok(p.level >= 1 && p.xpForNextLevel > 0);
    }
  });

  await t.test('حساب بدون مستند فهرس usernames يلقاه بالاحتياط', async () => {
    const r = await call('GET', `/api/discord/profile-by-username/${enc('BOB')}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.data.username, 'Bob');
    assert.equal(r.body.data.roundsPlayed, 0);
  });

  await t.test('لاعب بث بيوزر عربي (ترميز URL سليم)', async () => {
    const r = await call('GET', `/api/discord/profile-by-username/${enc('أحمد_تيك')}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.username, 'أحمد 🔥');
    assert.equal(r.body.data.registered, false);
    assert.equal(r.body.data.xp, 300);
    const s = await call('GET', `/api/discord/stats-by-username/${enc(' @أحمد_تيك ')}`);
    assert.equal(s.status, 200);
    assert.equal(s.body.data.wins.stream, 4);
    assert.equal(s.body.data.losses, 5);
  });

  await t.test('إحصائيات لاعب مسجّل', async () => {
    const r = await call('GET', `/api/discord/stats-by-username/${enc('alice_1')}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const s = r.body.data;
    assert.deepEqual(s.wins, { total: 13, solo: 3, online: 2, stream: 8 });
    assert.equal(s.losses, 27);
    assert.equal(s.winRate, 32.5);
    assert.equal(s.mostPlayedGame.tag, 'bomb');
    assert.equal(s.mostPlayedGame.name, 'القنبلة المتحركة');
    assert.equal(s.mostPlayedGame.count, 12);
    assert.equal(s.bestRoundPoints, 120);
    assert.equal(s.globalRank, 1); // 900 أعلى من الكل
    assert.equal(s.totalRanked, 16);
    assert.equal(s.recentGames.length, 2);
  });

  await t.test('اقتراحات الأسماء (Autocomplete)', async () => {
    let r = await call('GET', `/api/discord/search-usernames?q=${enc('AL')}`);
    assert.equal(r.status, 200);
    const values = r.body.data.results.map((x) => x.value);
    assert.equal(values[0], 'Alice_1'); // الحسابات المسجّلة أولاً
    assert.ok(values.includes('alice.tt'));
    assert.ok(!values.includes('alice_1')); // بدون تكرار للحساب نفسه
    r = await call('GET', `/api/discord/search-usernames?q=${enc('أح')}`);
    assert.deepEqual(r.body.data.results.map((x) => x.value), ['أحمد_تيك']);
    r = await call('GET', '/api/discord/search-usernames?q=');
    assert.deepEqual(r.body.data.results, []);
  });

  await t.test('المتصدرين العام', async () => {
    const r = await call('GET', '/api/discord/leaderboard?period=global&limit=50');
    assert.equal(r.status, 200);
    const e = r.body.data.entries;
    assert.equal(e.length, 16); // alice_1 + alice.tt + أحمد_تيك + 13 مشاهد
    assert.equal(e[0].key, 'alice.tt');
    assert.equal(e[0].rank, 1);
    assert.ok(e.every((x, i) => i === 0 || e[i - 1].points >= x.points));
  });

  await t.test('المتصدرين الأسبوعي (لقطة ثم تغيّر XP)', async () => {
    // أول طلب يبني اللقطة (أو يرجع building لو job سبقنا ولسا يبني)
    let r;
    for (let i = 0; i < 20; i++) {
      r = await call('GET', '/api/discord/leaderboard?period=weekly&limit=10');
      if (!r.body.data.building) break;
      await new Promise((res) => setTimeout(res, 300));
    }
    assert.equal(r.status, 200);
    assert.equal(r.body.data.entries.length, 0); // اللقطة = XP الحالي → ما فيه تقدّم بعد
    const base = await db.collection('discordWeeklyBaselines').get();
    assert.equal(base.size, 1);
    assert.equal(base.docs[0].data().status, 'ready');

    // لاعبان يكسبون XP بعد اللقطة → يظهرون بالترتيب حسب المكسب الأسبوعي فقط
    await db.collection('levels').doc('viewer0').update({ xp: 100 + 300, updatedAt: Timestamp.now() });
    await db.collection('levels').doc('alice.tt').update({ xp: 900 + 50, updatedAt: Timestamp.now() });
    const after = await call('GET', '/api/discord/leaderboard?period=weekly&limit=10');
    const e = after.body.data.entries;
    assert.deepEqual(e.map((x) => [x.key, x.points]), [['viewer0', 300], ['alice.tt', 50]]);
    assert.ok(after.body.data.since);
  });

  await t.test('الفعاليات', async () => {
    const r = await call('GET', '/api/discord/events');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.events.length, 1);
    assert.equal(r.body.data.events[0].title, 'أفضل ستريمر');
    assert.ok(r.body.data.events[0].endsAt);
  });

  await t.test('إحصائيات الإدارة', async () => {
    const r = await call('GET', '/api/discord/admin/stats');
    assert.equal(r.status, 200);
    assert.equal(r.body.data.registeredUsers, 2);
    assert.equal(r.body.data.rankedPlayers, 16);
    assert.ok(r.body.data.activeToday >= 15);
    assert.ok(r.body.data.apiCallsToday >= 1);
  });



  await t.test('مسار غير موجود → 404 JSON', async () => {
    const r = await call('GET', '/api/discord/nothing-here');
    assert.equal(r.status, 404);
    assert.equal(r.body.ok, false);
  });
});
