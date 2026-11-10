'use strict';

// فحص كامل لـ/بث اللحظي مقابل محاكي Firebase (Firestore + Realtime Database) — بنفس بيانات الموقع:
//   • لحظة ربط الستريمر ليوزره، الموقع يكتب RTDB: fsMirror/activeStreamers/link_<uid>
//     = { username, platform, gameTag:'link', gameName, uid, updatedAtMs } (index.html: ownerPresenceSet)
//   • لحظة تشغيل لعبة: Firestore activeStreamers/{gameTag} + presence/{uid}.lastSeen
// نتأكد إن البث يظهر بـ/بث (الجلسات + الرسالة نفسها) خلال ثانية-ثانيتين، ويتحدّث لما يشغّل لعبة، ويختفي لما
// ينقطع، وإن المتقادم يتجاهل. ما نتصل بقاعدة الموقع الحقيقية أبداً (المحاكي فقط).
//
// التشغيل: firebase emulators:exec --only firestore,database --project demo-ehsmaha "node --test tests/liveStreams.realtime.test.js"

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const EMULATED = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
// مشروع وNamespace مستقلان: باقي ملفات الاختبار تشتغل بنفس الوقت على نفس المحاكي وتمسح بياناتها
const PROJECT = 'demo-ehsmaha-live';
const RTDB_NS = 'demo-ehsmaha-live-default-rtdb';

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 4000, stepMs = 25) {
  const started = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return Date.now() - started;
    if (Date.now() - started > timeoutMs) throw new Error('انتهت المهلة بدون ما يتحقق الشرط');
    await wait(stepMs);
  }
}

function fakeServiceAccount() {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return JSON.stringify({ type: 'service_account', project_id: PROJECT, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: `test@${PROJECT}.iam.gserviceaccount.com` });
}

test('/بث اللحظي ضد محاكي Firebase', { skip: !EMULATED && 'محاكي Firebase (firestore + database) غير مشغّل' }, async (t) => {
  process.env.FIREBASE_SERVICE_ACCOUNT = fakeServiceAccount();
  const firestore = require('../database/firestore');
  firestore.init({ databaseURL: `https://${RTDB_NS}.firebaseio.com` });
  const db = firestore.db();
  const rtdb = firestore.rtdb();
  const { Timestamp } = firestore;
  const activeStreams = require('../api/services/activeStreams');
  const live = require('../services/liveStreams');
  const board = require('../services/liveBoard');
  const liveCmd = require('../commands/streams/live');

  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  await rtdb.ref('/').remove();

  live.clearAll();
  live.startRealtime(activeStreams, { safetyPollMs: 60_000, debounceMs: 50 });
  t.after(async () => {
    board.stopAll();
    live.stopPolling();
    activeStreams.stopListener();
    live.clearAll();
    await firestore.shutdown(); // يقفل اتصالات Firebase عشان العملية تنتهي
  });
  await until(() => activeStreams._internal.rt.ready && activeStreams._internal.live.ready, 8000);
  const names = () => live.list().map((s) => `${s.platform}:${s.platformUsername}:${s.status}:${s.gameName || ''}`);

  // رسالة /بث حقيقية (تفاعل وهمي) تتعدّل لحظياً
  const edits = [];
  const interaction = {
    user: { id: 'viewer1' },
    deferred: false,
    replied: false,
    reply: async () => ({ id: 'live-msg' }),
    fetchReply: async () => ({ id: 'live-msg' }),
    editReply: async (p) => edits.push(p)
  };
  await liveCmd.execute(interaction);
  const lastText = () => (edits.length ? edits[edits.length - 1].embeds[0].toJSON().description : '');

  await t.test('ستريمر يربط يوزره (RTDB link) ← يظهر "متصل بالبث" بـ/بث لحظياً قبل أي لعبة', async () => {
    const wroteAt = Date.now();
    await rtdb.ref('fsMirror/activeStreamers/link_uidA').set({ username: 'DalalTT', platform: 'tiktok', gameTag: 'link', gameName: null, uid: 'uidA', updatedAtMs: Date.now() });
    const sessionMs = await until(() => names().includes('tiktok:DalalTT:linked:'));
    t.diagnostic(`⏱️ ربط اليوزر ← ظهر بجلسات البوت بعد ${sessionMs}ms`);
    assert.ok(sessionMs < 2000, `ظهر بالجلسات بعد ${sessionMs}ms`);
    await until(() => /\[@DalalTT\]/.test(lastText()), 4000);
    const shownMs = Date.now() - wroteAt;
    assert.match(lastText(), /📡 متصل بالبث — يختار لعبة/);
    t.diagnostic(`⏱️ ربط اليوزر ← تعدّلت رسالة /بث نفسها بعد ${shownMs}ms`);
    assert.ok(shownMs < 3000, `ظهر بالرسالة نفسها بعد ${shownMs}ms (بدون ما أحد يعيد /بث)`);
    assert.match(edits[edits.length - 1].embeds[0].toJSON().footer.text, /يتحدّث لحظياً/);
  });

  await t.test('يشغّل لعبة (RTDB يتحدّث باسم اللعبة) ← "يلعب" بنفس الجلسة بدون تكرار', async () => {
    await rtdb.ref('fsMirror/activeStreamers/link_uidA').update({ gameName: 'الدول', updatedAtMs: Date.now() });
    await until(() => names().includes('tiktok:DalalTT:playing:الدول'));
    assert.equal(live.size(), 1);
    await until(() => /🎮 \*\*الدول\*\*/.test(lastText()), 4000);
  });

  await t.test('ستريمر ثاني بمنصة ثانية + Firestore (لعبة شغّالة) مع حضور ← يظهران، وصف Firestore بدون حضور لا يظهر', async () => {
    await db.collection('presence').doc('uidB').set({ lastSeen: Timestamp.fromDate(new Date(Date.now() - 20 * 1000)) });
    await db.collection('presence').doc('uidGone').set({ lastSeen: Timestamp.fromDate(new Date(Date.now() - 20 * 60 * 1000)) });
    await db.collection('activeStreamers').doc('sniper').set({ username: '@Ahmed', platform: 'twitch', gameTag: 'sniper', gameName: 'القناص', uid: 'uidB', updatedAt: Timestamp.now() });
    await db.collection('activeStreamers').doc('bomb').set({ username: 'Crashed', platform: 'kick', gameTag: 'bomb', gameName: 'القنبلة', uid: 'uidGone', updatedAt: Timestamp.now() });
    await until(() => names().includes('twitch:Ahmed:playing:القناص'));
    await wait(300);
    assert.ok(!names().some((n) => n.includes('Crashed')), 'متصفحه منهار (بدون حضور) ← ما يظهر');
    assert.equal(live.size(), 2);
  });

  await t.test('نفس الستريمر بمصدرين (ربط + Firestore) ← جلسة وحدة', async () => {
    await rtdb.ref('fsMirror/activeStreamers/link_uidB').set({ username: 'ahmed', platform: 'twitch', gameTag: 'link', gameName: null, uid: 'uidB', updatedAtMs: Date.now() });
    await wait(500);
    assert.equal(live.list().filter((s) => s.platformUsername.toLowerCase() === 'ahmed').length, 1);
    assert.equal(live.list().find((s) => s.platformUsername.toLowerCase() === 'ahmed').gameName, 'القناص', 'اللي عنده لعبة يغلب');
  });

  await t.test('صف ربط أقدم من 12 ساعة يتجاهل (قاعدة لوحة المالك)', async () => {
    await rtdb.ref('fsMirror/activeStreamers/link_uidOld').set({ username: 'Ancient', platform: 'kick', gameTag: 'link', uid: 'uidOld', updatedAtMs: Date.now() - 13 * 3600 * 1000 });
    await wait(500);
    assert.ok(!names().some((n) => n.includes('Ancient')));
  });

  await t.test('الستريمر ينقطع (RTDB onDisconnect يحذف صفه) ← يختفي من /بث لحظياً', async () => {
    const removedAt = Date.now();
    await rtdb.ref('fsMirror/activeStreamers/link_uidA').remove();
    const ms = await until(() => !names().some((n) => n.includes('DalalTT')));
    t.diagnostic(`⏱️ انقطاع الستريمر ← اختفى بعد ${ms}ms`);
    assert.ok(ms < 2000, `اختفى بعد ${ms}ms`);
    await until(() => !/DalalTT/.test(lastText()), 4000);
    assert.ok(Date.now() - removedAt < 3500);
    assert.match(lastText(), /Ahmed/, 'الباقي يظل ظاهر');
  });

  await t.test('طبقة الـAPI نفسها: active-streams ترجّع نفس القائمة (بدون كاش قديم) مع status', async () => {
    const data = await activeStreams.getActiveStreams();
    const ahmed = data.streams.find((s) => s.platformUsername.toLowerCase() === 'ahmed');
    assert.equal(ahmed.status, 'playing');
    assert.deepEqual(data.sources, { firestore: true, realtime: true });
    await rtdb.ref('fsMirror/activeStreamers/link_uidC').set({ username: 'Fresh', platform: 'youtube', gameTag: 'link', uid: 'uidC', updatedAtMs: Date.now() });
    await wait(150);
    const again = await activeStreams.getActiveStreams();
    assert.ok(again.streams.some((s) => s.platformUsername === 'Fresh' && s.status === 'linked'), 'الكاش يتفرّغ مع كل تغيير');
  });
});
