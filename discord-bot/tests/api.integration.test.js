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
const RTDB_EMULATED = !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const RTDB_NS = 'demo-ehsmaha-default-rtdb';
const rtdbRest = async (path) => (await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/${path}.json?ns=${RTDB_NS}`)).json();
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

async function call(method, url, { key = API_KEY, body } = {}) {
  const headers = {};
  if (key) headers['x-api-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
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
  if (RTDB_EMULATED) await fetch(`http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/.json?ns=${RTDB_NS}`, { method: 'DELETE' });

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

  // حالة حقيقية (مثل حساب المالك): XP عالي بسجل يوزر الموقع بدون جولات، والجولات
  // والألعاب والإطارات بسجل تيك توك المربوط — والحساب نفسه ستريمر.
  await db.collection('users').doc('uidOwner').set({
    username: 'Owner7', usernameLower: 'owner7', createdAt: now, onlinePoints: 620,
    soloWinCount: 3, onlineWinCount: 23, linkedTiktokUsername: 'owner.tt', pinnedGames: ['bomb', 'cw']
  });
  await db.collection('usernames').doc('owner7').set({ uid: 'uidOwner' });
  await db.collection('levels').doc('owner7').set({ key: 'owner7', xp: 10000, roundsPlayed: 0, ownedFrames: ['saudi'] });
  await db.collection('levels').doc('owner.tt').set({
    key: 'owner.tt', xp: 500, roundsPlayed: 30, gamesPlayCount: { bomb: 20, draw: 10 }, isStreamer: true,
    ownedFrames: ['anime01', 'custom1'], activeFrame: 'custom1', activeFrameAt: 5, lastGamePlayed: 'draw'
  });
  await db.collection('framesCatalogExtra').doc('custom1').set({ name: 'إطار خاص', imageUrl: 'https://example.com/f.png', visibility: 'private' });
  await db.collection('friendships').doc('uidOwner_x').set({ uids: ['uidOwner', 'x'] });
  await db.collection('friendships').doc('uidOwner_y').set({ uids: ['uidOwner', 'y'] });
  await db.collection('leaderboards').doc('streamer1').set({ 'owner.tt': { nickname: 'Owner', wins: 40, games: { 'القنبلة المتحركة': 40 } } }, { merge: true });
  await db.collection('leaderboards').doc('streamer3').set({ 'owner.tt': { nickname: 'Owner', wins: 12, games: {} } });
  await db.collection('leaderboards').doc('owner.tt').set({ v1: { nickname: 'V One', wins: 5 }, v2: { nickname: 'V Two', wins: 3 } });

  // بثوث نشطة: واحد حاضر (نبضة حديثة)، واحد متصفحه انهار (نبضة قديمة)، وتكرار لنفس الستريمر
  const ago = (msAgo) => Timestamp.fromDate(new Date(Date.now() - msAgo));
  await db.collection('presence').doc('uidLive').set({ lastSeen: ago(30 * 1000) });
  await db.collection('presence').doc('uidStale').set({ lastSeen: ago(10 * 60 * 1000) });
  await db.collection('activeStreamers').doc('bomb').set({ username: '@LiveOne', platform: 'twitch', gameTag: 'bomb', gameName: 'القنبلة', uid: 'uidLive', updatedAt: ago(60 * 1000) });
  await db.collection('activeStreamers').doc('cw').set({ username: 'liveone', platform: 'twitch', gameTag: 'cw', gameName: 'كلمات', uid: 'uidLive', updatedAt: ago(5 * 1000) });
  await db.collection('activeStreamers').doc('draw').set({ username: 'Crashed', platform: 'tiktok', gameTag: 'draw', gameName: 'رسم', uid: 'uidStale', updatedAt: ago(60 * 1000) });

  // ---- تشغيل السيرفر ----
  const server = spawn(process.execPath, [path.join(__dirname, '..', 'api', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(PORT),
      API_KEY,
      LOG_LEVEL: 'warn',
      NODE_ENV: 'test',
      API_LEADERBOARD_CACHE_SECONDS: '0',
      // Realtime Database: محاكي لو شغّال، وإلا معطّلة (ما نتصل بقاعدة الموقع الحقيقية أبداً)
      FIREBASE_DATABASE_URL: RTDB_EMULATED ? `https://${RTDB_NS}.firebaseio.com` : ''
    },
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

  await t.test('active-streams: الحاضرين فقط، جلسة وحدة لكل ستريمر', async () => {
    assert.equal((await call('GET', '/api/discord/active-streams', { key: 'wrong-key' })).status, 401);
    const r = await call('GET', '/api/discord/active-streams');
    assert.equal(r.status, 200, serverLog);
    const streams = r.body.data.streams;
    assert.equal(streams.length, 1, JSON.stringify(streams));
    assert.equal(streams[0].platform, 'twitch');
    assert.equal(streams[0].platformUsername.toLowerCase(), 'liveone');
    assert.equal(streams[0].gameName, 'كلمات', 'الأحدث يغلب');
  });

  await t.test('bot-state: حفظ دائم مجزّأ، استرجاع، ورفض النسخة القديمة', async () => {
    const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
    assert.equal((await call('POST', '/api/discord/bot-state/claim', { key: 'wrong-key', body: { bootAt: 1 } })).status, 401);
    let r = await call('POST', '/api/discord/bot-state/claim', { body: { bootAt: 1000 } });
    assert.equal(r.status, 200, serverLog);
    assert.equal(r.body.data.snapshot, null, 'ما فيه نسخة بعد');

    const big = crypto.randomBytes(2 * 1024 * 1024 + 123); // يتقسم على 3 أجزاء
    r = await call('PUT', '/api/discord/bot-state', { body: { bootAt: 1000, data: big.toString('base64'), sha256: sha(big) } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.chunks, 3);
    assert.equal((await call('PUT', '/api/discord/bot-state', { body: { bootAt: 1000, data: big.toString('base64'), sha256: 'bad' } })).status, 400);

    // إقلاع جديد (تحديث) يستلم ويسترجع نفس البيانات بالضبط
    r = await call('POST', '/api/discord/bot-state/claim', { body: { bootAt: 2000 } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.snapshot.sha256, sha(big));
    assert.ok(Buffer.from(r.body.data.snapshot.data, 'base64').equals(big));

    // النسخة القديمة (bootAt 1000) ما تقدر تكتب فوق الأحدث
    const small = Buffer.from('small db');
    r = await call('PUT', '/api/discord/bot-state', { body: { bootAt: 1000, data: small.toString('base64'), sha256: sha(small) } });
    assert.equal(r.status, 409);
    assert.equal(r.body.error.code, 'STALE_INSTANCE');
    assert.equal((await call('POST', '/api/discord/bot-state/claim', { body: { bootAt: 1500 } })).status, 409);

    // الأحدث يكتب نسخة أصغر ← الأجزاء الزايدة تنحذف والاسترجاع سليم
    r = await call('PUT', '/api/discord/bot-state', { body: { bootAt: 2000, data: small.toString('base64'), sha256: sha(small) } });
    assert.equal(r.body.data.chunks, 1);
    r = await call('POST', '/api/discord/bot-state/claim', { body: { bootAt: 3000 } });
    assert.equal(Buffer.from(r.body.data.snapshot.data, 'base64').toString(), 'small db');
    if (RTDB_EMULATED) {
      // المخزن الأساسي Realtime Database: مشفّر، والأجزاء الزايدة انحذفت
      const node = await rtdbRest('discordBotState');
      assert.equal(node.meta.encrypted, true);
      assert.equal(node.meta.chunks, 1);
      assert.equal(Object.keys(node.chunks).length, 1);
      assert.ok(!Buffer.from(node.chunks[0] || node.chunks['0'], 'base64').toString().includes('small db'), 'المحتوى مشفّر');
      assert.equal((await db.collection('discordBotState').get()).size, 1, 'Firestore: meta (الاستلام) فقط — ما تنكتب نسخة فيه لما RTDB شغالة');
    } else {
      const leftovers = await db.collection('discordBotState').get();
      assert.equal(leftovers.size, 2, 'meta + chunk_000 فقط');
    }
  });

  await t.test('bot-state: لو Realtime Database طاحت، الحفظ والاسترجاع ينتقلون لـFirestore تلقائياً', async () => {
    const botState = require('../api/services/botState');
    const original = firestore.rtdb;
    const failing = () => Promise.reject(Object.assign(new Error('down'), { code: 'UNAVAILABLE' }));
    firestore.rtdb = () => ({ ref: () => ({ transaction: failing, get: failing, update: failing }) });
    process.env.API_KEY = API_KEY;
    try {
      const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
      const buf = Buffer.from('fallback-db-' + Date.now());
      const saved = await botState.save({ bootAt: 9e12, data: buf.toString('base64'), sha: sha(buf) });
      assert.equal(saved.store, 'firestore');
      const { snapshot } = await botState.claim(9e12 + 1);
      assert.equal(snapshot.store, 'firestore');
      assert.equal(Buffer.from(snapshot.data, 'base64').toString(), buf.toString());
    } finally {
      firestore.rtdb = original;
    }
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
      assert.equal(p.roundsPlayed, 44); // مجموع سجلّي الموقع وتيك توك
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
    assert.equal(s.losses, 31);
    assert.equal(s.winRate, 29.5);
    assert.equal(s.mostPlayedGame.tag, 'bomb');
    assert.equal(s.mostPlayedGame.name, 'القنبلة المتحركة');
    assert.equal(s.mostPlayedGame.count, 12);
    assert.equal(s.bestRoundPoints, 120);
    assert.equal(s.globalRank, 2); // بعد Owner7 (10000)
    assert.equal(s.totalRanked, 18);
    assert.deepEqual(s.topStreamer, { name: 'streamer1', wins: 7 });
    assert.equal(s.streamersCount, 2);
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

  await t.test('دمج سجلّي اللاعب: جولات/ألعاب/إطارات من تيك توك + XP من الموقع', async () => {
    const r = await call('GET', `/api/discord/profile-by-username/${enc('owner7')}`);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const p = r.body.data;
    assert.equal(p.xp, 10000);
    assert.equal(p.roundsPlayed, 30);
    assert.equal(p.frames.count, 3);
    assert.deepEqual(p.frames.active, { id: 'custom1', name: 'إطار خاص', imageUrl: 'https://example.com/f.png' });
    assert.ok(p.frames.names.includes('السعودية') && p.frames.names.includes('تنين النار'));
    assert.deepEqual(p.favoriteGames, ['القنبلة المتحركة', 'الدول']);
    assert.equal(p.friends, 2);
    assert.equal(p.lastGame, 'خمن الرسمة');
    assert.ok(p.roles.includes('ستريمر'));
    assert.deepEqual(p.achievements.earned.map((a) => a.id), ['lvl5', 'lvl10', 'rounds10', 'online5', 'online20', 'frames1']);
    assert.equal(p.achievements.total, 14);
  });

  await t.test('إحصائيات: أكثر لعبة، أكثر ستريمر، كستريمر، وهزائم غير قابلة للحساب', async () => {
    const r = await call('GET', `/api/discord/stats-by-username/${enc('OWNER7')}`);
    const s = r.body.data;
    assert.deepEqual(s.wins, { total: 78, solo: 3, online: 23, stream: 52 });
    assert.equal(s.losses, null); // فوزات (78) أكثر من الجولات المسجّلة (30)
    assert.equal(s.winRate, null);
    assert.equal(s.mostPlayedGame.name, 'القنبلة المتحركة');
    assert.equal(s.mostPlayedGame.count, 20);
    assert.deepEqual(s.topStreamer, { name: 'streamer1', wins: 40 });
    assert.equal(s.streamersCount, 2);
    assert.deepEqual(s.asStreamer, { name: 'owner.tt', players: 2, wins: 8 });
    assert.equal(s.framesCount, 3);
    assert.equal(s.gamesVariety, 2);
    assert.equal(s.globalRank, 1);
  });

  await t.test('لوحة الفائزين: كل الستريمرز وستريمر محدد وغير موجود', async () => {
    let r = await call('GET', '/api/discord/winners?limit=50');
    let w = r.body.data;
    assert.equal(w.scope, 'all');
    assert.deepEqual(w.entries.map((e) => [e.key, e.wins]), [['owner.tt', 52], ['alice.tt', 8], ['v1', 5], ['أحمد_تيك', 4], ['v2', 3], ['viewer1', 2]]);
    assert.equal(w.entries[0].topGame.name, 'القنبلة المتحركة');
    assert.equal(w.totalPlayers, 6);
    assert.equal(w.totalWins, 74);
    assert.equal(w.streamersCount, 4);

    r = await call('GET', `/api/discord/winners?streamer=${enc('@Streamer1')}`);
    w = r.body.data;
    assert.equal(w.scope, 'streamer');
    assert.equal(w.streamer, 'streamer1');
    assert.deepEqual(w.entries.map((e) => e.key), ['owner.tt', 'alice.tt', 'أحمد_تيك', 'viewer1']);

    r = await call('GET', `/api/discord/winners?streamer=${enc('nobody')}`);
    assert.equal(r.body.data.found, false);

    r = await call('GET', `/api/discord/winners/streamers?q=${enc('str')}`);
    assert.deepEqual(r.body.data.results.map((x) => x.value), ['streamer1', 'streamer3', 'streamer2']);
  });

  await t.test('المتصدرين العام', async () => {
    const r = await call('GET', '/api/discord/leaderboard?period=global&limit=50');
    assert.equal(r.status, 200);
    const e = r.body.data.entries;
    assert.equal(e.length, 18); // + owner7 و owner.tt
    assert.equal(e[0].key, 'owner7');
    assert.equal(e[1].key, 'alice.tt');
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
    assert.equal(r.body.data.registeredUsers, 3);
    assert.equal(r.body.data.rankedPlayers, 18);
    assert.ok(r.body.data.activeToday >= 15);
    assert.ok(r.body.data.apiCallsToday >= 1);
  });



  await t.test('مسار غير موجود → 404 JSON', async () => {
    const r = await call('GET', '/api/discord/nothing-here');
    assert.equal(r.status, 404);
    assert.equal(r.body.ok, false);
  });
});
