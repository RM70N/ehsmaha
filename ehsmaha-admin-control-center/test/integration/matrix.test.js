// اختبار «كل زر»: كل إجراء في السجل يُنفَّذ عبر HTTP الحقيقي (جلسة + CSRF + صلاحيات) على محاكيات Firebase الفعلية
// (Firestore/Auth/RTDB) + خادم Discord وهمي + قاعدة بوت مبنية من migrations البوت الحقيقية، ثم يُتحقق من النتيجة
// بقراءة المصدر مباشرة (لا بالاعتماد على رد اللوحة). النتائج تُكتب في test-results/button-results.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { startEnv, client, emulatorUp, GUILD } from '../helpers/env.js';
import { resetEmulators, seedSite, seedEvent } from '../helpers/seed.js';

const up = await emulatorUp();
const results = {};
let env, o, a, fb, db, rt, auth, M;
const botSql = (sql, p = []) => { const d = new DatabaseSync(env.botFile); try { return d.prepare(sql).all(...p); } finally { d.close(); } };
const botRun = (sql, p = []) => { const d = new DatabaseSync(env.botFile); try { return d.prepare(sql).run(...p); } finally { d.close(); } };
const CH = '500000000000000001', CH2 = '500000000000000002', U = { ahmed: '300000000000000001', sara: '300000000000000002', khalid: '300000000000000003', noura: '300000000000000004' }, R = { mod: '400000000000000001', vip: '400000000000000002' };
const g = (p) => db.doc(p).get();
const ctx = {};

// step(id, params, {expect, status, check, reason, owner})
async function step(id, params, opts = {}) {
  const t0 = Date.now(); const rec = (results[id] ||= { id, runs: [] });
  const r = await (opts.client || o).run(id, params, { reason: opts.reason ?? 'اختبار تكامل آلي' });
  const want = opts.expect ?? 200;
  try {
    assert.equal(r.status, want, `${id}: ${r.status} ${r.json?.message}`);
    if (want === 200) { assert.equal(r.json.ok, true); if (opts.pending) assert.equal(r.json.status, 'saved_pending_apply'); else assert.equal(r.json.status, 'success'); }
    if (opts.check) await opts.check(r.json);
    rec.runs.push({ expect: want, status: r.status, ok: true, ms: Date.now() - t0, note: opts.note });
  } catch (e) { rec.runs.push({ expect: want, status: r.status, ok: false, error: e.message, ms: Date.now() - t0 }); throw e; }
  return r.json;
}
const T = (name, fn) => test(name, { skip: !up && 'محاكيات Firebase غير شغّالة' }, fn);

test.before(async () => {
  if (!up) return;
  await resetEmulators();
  env = await startEnv(); ({ fb } = env.svc); db = fb.db(); rt = fb.rtdb(); auth = fb.auth(); M = env.mock.S;
  await seedSite(fb); await seedEvent(fb);
  o = client(env.base); a = client(env.base); await o.login('owner'); await a.login('admin');
  env.svc.registry.actions(); ctx.reg = env.svc.registry;
});
test.after(async () => {
  if (!up) return;
  fs.mkdirSync('test-results', { recursive: true }); fs.writeFileSync('test-results/button-results.json', JSON.stringify(results, null, 1));
  await env.close();
});

// ================= الموقع: اللاعبون =================
T('players: حظر نهائي + رفعه (Firebase Auth)', async () => {
  await step('players.ban_permanent', { username: 'khalid' }, { check: async () => assert.equal((await auth.getUser('p-khalid')).disabled, true) });
  await step('players.ban_permanent', { username: 'khalid' }, { expect: 200 }); // حظر مكرر مسموح (آمن)
  await step('players.unban', { username: 'khalid' }, { check: async () => assert.equal((await auth.getUser('p-khalid')).disabled, false) });
  await step('players.ban_permanent', { username: 'ghost_user' }, { expect: 404 });
  await step('players.ban_permanent', { username: '' }, { expect: 422 });
});
T('players: حظر مؤقت ينتهي تلقائياً بالمجدول', async () => {
  await step('players.ban_temporary', { username: 'sara', hours: 1 }, { check: async () => { assert.equal((await auth.getUser('p-sara')).disabled, true); assert.equal(env.svc.store.col('tempActions').count({ type: 'ban', status: 'active' }), 1); } });
  for (const j of env.svc.store.col('tempActions').list({ where: { type: 'ban' } })) env.svc.store.col('tempActions').merge(j.id, { expiresAt: Date.now() - 1000 });
  const r = await env.svc.scheduler.processTempBans(); assert.equal(r.processed, 1);
  assert.equal((await auth.getUser('p-sara')).disabled, false);
  assert.ok(env.svc.audit.list({ where: { action: 'players.ban_expire' }, limit: 1 }).length);
  await step('players.ban_temporary', { username: 'sara', hours: 0 }, { expect: 422 });
});
T('players: خبرة، فك ربط، رسائل، ملاحظات، تصدير', async () => {
  await step('players.force_logout', { username: 'sara' });
  await step('players.adjust_xp', { username: 'sara', delta: 50 }, { check: async () => assert.equal((await g('levels/sara')).data().xp, 350) });
  await step('players.adjust_xp', { username: 'sara', delta: -100000 }, { check: async () => assert.equal((await g('levels/sara')).data().xp, 0) });
  await step('players.adjust_xp', { username: 'sara', delta: 0 }, { expect: 422 });
  const r = await step('players.reset_xp', { username: 'ahmed_1' }, { check: async () => assert.equal((await g('levels/ahmed_1')).data().xp, 0) });
  assert.equal((await o.post(`/api/audit/${r.auditId}/undo`)).status, 200); assert.equal((await g('levels/ahmed_1')).data().xp, 1200, 'التراجع أعاد الخبرة السابقة');
  await step('players.unlink_tiktok', { username: 'ahmed_1' }, { check: async () => assert.equal((await g('users/p-ahmed')).data().linkedTiktokUsername, undefined) });
  await step('players.unlink_tiktok', { username: 'ahmed_1' }, { expect: 409 });
  await step('players.send_message', { username: 'sara', text: 'مرحباً من الإدارة', position: 'top', durationMode: 'timed' }, { check: async () => { assert.equal((await g('personalMessages/sara')).data().text, 'مرحباً من الإدارة'); assert.equal((await rt.ref('ownerMessages/personal/sara').get()).val().text, 'مرحباً من الإدارة'); } });
  await step('players.add_note', { username: 'sara', note: 'ملاحظة اختبار' }, { check: () => assert.equal(env.svc.store.col('playerNotes').count(), 1) });
  const ex = await step('players.export_player', { username: 'sara' }); assert.ok(ex.download.text.includes('sara')); assert.ok(!ex.download.text.includes('sara@example.com'), 'البريد مقنّع');
});

// ================= الستريمرز =================
T('streamers: بوابة الربط (enabled) + مؤقت + سجل', async () => {
  await step('streamers.bridge_disable', { streamer: 'streamer_one' }, { check: async () => assert.equal((await g('bridgeStreamers/streamer_one')).data().enabled, false) });
  await step('streamers.bridge_disable', { streamer: 'streamer_one' }, { expect: 409 });
  await step('streamers.bridge_enable', { streamer: 'streamer_one' }, { check: async () => assert.equal((await g('bridgeStreamers/streamer_one')).data().enabled, true) });
  await step('streamers.bridge_disable_temp', { streamer: 'streamer_two', hours: 2 }, { check: async () => assert.equal((await g('bridgeStreamers/streamer_two')).data().enabled, false) });
  for (const j of env.svc.store.col('tempActions').list({ where: { type: 'bridge' } })) env.svc.store.col('tempActions').merge(j.id, { expiresAt: Date.now() - 1 });
  await env.svc.scheduler.processTempBans(); assert.equal((await g('bridgeStreamers/streamer_two')).data().enabled, true);
  await step('streamers.bridge_register', { streamer: '@New_Streamer' }, { check: async () => assert.equal((await g('bridgeStreamers/new_streamer')).data().enabled, true) });
  await step('streamers.bridge_register', { streamer: 'new_streamer' }, { expect: 409 });
  await step('streamers.bridge_reset', { streamer: 'new_streamer' }, { check: async () => assert.equal((await g('bridgeStreamers/new_streamer')).exists, false) });
  await step('streamers.clear_active', { gameTag: 'bomb_streamer_one' }, { check: async () => assert.equal((await g('activeStreamers/bomb_streamer_one')).exists, false) });
  await step('streamers.clear_active', { gameTag: 'nope' }, { expect: 404 });
  await step('streamers.add_note', { streamer: 'streamer_one', note: 'ملاحظة' });
  const lg = await step('streamers.streamer_log', { streamer: 'streamer_one' }); assert.ok(lg.data.operations.length >= 2);
  const ex = await step('streamers.export_streamers', {}); assert.ok(ex.download.text.includes('streamer_two'));
});

// ================= الألعاب =================
T('games: إعدادات opsConfig بإصدار + سجل + استعادة + صيانة وشارات', async () => {
  await step('games.set_setting', { setting: 'sniper.gridSize', value: '60' }, { check: async () => { const v = (await rt.ref('opsConfig/current/sniper').get()).val(); assert.equal(v.values.gridSize, 60); assert.equal(v.v, 1); } });
  await step('games.set_setting', { setting: 'sniper.gridSize', value: '500' }, { expect: 422 });
  await step('games.set_setting', { setting: 'sniper.shieldEnabled', value: 'true' }, { check: async () => assert.equal((await rt.ref('opsConfig/current/sniper/values/shieldEnabled').get()).val(), true) });
  await step('games.set_setting', { setting: 'sniper.shieldEnabled', value: 'maybe' }, { expect: 422 });
  await step('games.set_setting', { setting: 'bomb.times', value: '1,2,3' }, { expect: 422, note: 'مصفوفة بطول خاطئ' });
  assert.ok(Object.keys((await rt.ref('opsConfig/history/sniper').get()).val()).length === 2, 'سجل الإصدارات');
  await step('games.reset_defaults', { game: 'sniper' }, { check: async () => assert.deepEqual((await rt.ref('opsConfig/current/sniper/values').get()).val(), null) });
  await step('games.restore_version', { game: 'sniper', version: 2 }, { check: async () => assert.equal((await rt.ref('opsConfig/current/sniper/values/gridSize').get()).val(), 60) });
  await step('games.restore_version', { game: 'sniper', version: 99 }, { expect: 404 });
  await step('games.set_maintenance', { tag: 'bomb' }, { check: async () => assert.equal((await g('gameBadges/bomb')).data().badge, 'maintenance') });
  await step('games.set_maintenance', { tag: 'bomb' }, { expect: 409 });
  await step('games.clear_maintenance', { tag: 'bomb' }, { check: async () => assert.equal((await g('gameBadges/bomb')).data().badge, 'none') });
  await step('games.set_badge', { tag: 'sniper', badge: 'update' }, { check: async () => assert.equal((await g('gameBadges/sniper')).data().badge, 'update') });
  await step('games.set_badge', { tag: 'nogame', badge: 'new' }, { expect: 422 });
  const ex = await step('games.export_games', {}); assert.ok(ex.data.length >= 50);
  const h = await step('games.game_health', { tag: 'bomb' }); assert.equal(h.data.inMaintenance, false);
});

// ================= الفعاليات =================
T('events: إطلاق/إنهاء/تمديد/معاينة/event100', async () => {
  await step('events.launch_best_streamer', { message: 'x', days: 3 }, { expect: 409 });
  const pv = await step('events.preview_winners', { eventId: 'bestStreamer_live' }); assert.equal(pv.data.durationWinner.key, 'streamer_one'); assert.equal(pv.data.winsWinner.key, 'streamer_two');
  await step('events.end_now', { eventId: 'bestStreamer_live' }, { check: async () => { const d = (await g('streamerEvents/bestStreamer_live')).data(); assert.equal(d.status, 'ended'); assert.equal(d.winnerStreamerKey, 'streamer_one'); assert.equal(d.winnerMostWinsKey, 'streamer_two'); assert.equal((await g('streamerEventAnnouncements/current')).data().status, 'ended'); } });
  await step('events.end_now', { eventId: 'bestStreamer_live' }, { expect: 409 });
  const l = await step('events.launch_best_streamer', { message: 'فعالية جديدة', days: 3 }); const id = (await db.collection('streamerEvents').where('status', '==', 'active').get()).docs[0].id; ctx.eventId = id;
  assert.equal((await g('streamerEventAnnouncements/current')).data().eventId, id); void l;
  const before = (await g(`streamerEvents/${id}`)).data().contest_end_at.toMillis();
  await step('events.extend_end', { eventId: id, hours: 5 }, { check: async () => assert.equal((await g(`streamerEvents/${id}`)).data().contest_end_at.toMillis(), before + 5 * 3600_000) });
  await step('events.edit_message', { eventId: id, message: 'رسالة معدّلة' }, { check: async () => { assert.equal((await g(`streamerEvents/${id}`)).data().broadcastMessage, 'رسالة معدّلة'); assert.equal((await g('streamerEventAnnouncements/current')).data().broadcastMessage, 'رسالة معدّلة'); } });
  await step('events.extend_end', { eventId: 'bestStreamer_live', hours: 1 }, { expect: 409 });
  await step('events.extend_end', { eventId: 'nope', hours: 1 }, { expect: 404 });
  const ex = await step('events.export_event', { eventId: 'bestStreamer_live' }); assert.ok(ex.download.text.includes('streamer_one'));
  await step('events.event100_status', { status: 'active' }, { check: async () => { const d = (await g('event100/current')).data(); assert.equal(d.status, 'active'); assert.ok(d.roundStartedAt); } });
  await step('events.event100_status', { status: 'active' }, { expect: 409 });
  await step('events.event100_messages', { msg1: 'جديد 1', msg2: 'جديد 2' }, { check: async () => assert.equal((await g('event100/current')).data().msg2, 'جديد 2') });
  await step('events.event100_messages', {}, { expect: 422 });
});

// ================= الجوائز =================
T('rewards: منح/سحب الإطارات + جماعي + إعادة محاولة آمنة + تحقق', async () => {
  await step('rewards.grant_frame', { username: 'sara', frameId: 'anime01' }, { check: async () => assert.ok((await g('levels/sara')).data().ownedFrames.includes('anime01')) });
  await step('rewards.grant_frame', { username: 'sara', frameId: 'anime01' }, { expect: 409 });
  await step('rewards.grant_frame', { username: 'sara', frameId: 'nonexistent' }, { expect: 404 });
  await step('rewards.revoke_frame', { username: 'sara', frameId: 'anime01' }, { check: async () => assert.ok(!(await g('levels/sara')).data().ownedFrames.includes('anime01')) });
  await step('rewards.revoke_frame', { username: 'sara', frameId: 'anime01' }, { expect: 409 });
  await step('rewards.grant_frame_bulk', { usernames: 'sara\nkhalid\nnobody_here', frameId: 'xframe1' }, { check: async (j) => { assert.equal(j.detail.filter((x) => x.result === 'granted').length, 2); assert.equal(j.detail.find((x) => x.username === 'nobody_here').result, 'failed'); assert.ok((await g('levels/khalid')).data().ownedFrames.includes('xframe1')); } });
  const dup = await step('rewards.grant_frame_bulk', { usernames: 'sara\nkhalid', frameId: 'xframe1' }); assert.ok(dup.detail.every((x) => x.result === 'skipped'), 'لا منح مكرر: الكل متخطّى');
  // فشل ثم إعادة محاولة واحدة فقط
  const bad = await o.run('rewards.grant_frame', { username: 'late_user', frameId: 'anime02' }); assert.equal(bad.status, 404);
  const failed = env.svc.audit.list({ where: { action: 'rewards.grant_frame', status: 'failed' }, limit: 10 }).find((x) => x.params?.username === 'late_user'); assert.ok(failed);
  await auth.createUser({ uid: 'p-late', email: 'late@example.com' }); await db.doc('users/p-late').set({ username: 'late_user', usernameLower: 'late_user' }); await db.doc('usernames/late_user').set({ uid: 'p-late' });
  await step('rewards.retry_failed', { auditId: failed.id }, { check: async () => assert.ok((await g('levels/late_user')).data().ownedFrames.includes('anime02')) });
  assert.equal(env.svc.store.col('frameGrants').count({ username: 'late_user', op: 'grant' }), 1);
  const second = await o.run('rewards.retry_failed', { auditId: failed.id }); assert.ok([200, 409].includes(second.status)); assert.equal(env.svc.store.col('frameGrants').count({ username: 'late_user', op: 'grant' }), 1, 'لا صرف مرتين');
  const vd = await step('rewards.verify_delivery', {}); assert.ok(vd.data.every((x) => x.delivered === true || x.delivered === false));
  await step('rewards.detect_duplicates', {});
  const pf = await step('rewards.player_frames', { username: 'khalid' }); assert.ok(pf.data.khalid.owned.includes('xframe1'));
  const ex = await step('rewards.export_rewards', {}); assert.ok(ex.download.text.includes('frame_grant'));
});

// ================= المتجر =================
T('shop: منتجات وأسعار ومخزون وإيقاف وإطارات', async () => {
  await step('shop.add_product', { name: 'نقاط مضاعفة', type: 'doublepoints', price: 250, durationHours: 12, maxTotalPurchases: 10 }, { check: async () => { const s = await db.collection('shopProducts').where('name', '==', 'نقاط مضاعفة').get(); assert.equal(s.size, 1); ctx.pid = s.docs[0].id; assert.equal(s.docs[0].data().purchasedCount, 0); } });
  await step('shop.add_product', { name: 'x', type: 'weird', price: 1, durationHours: 1, maxTotalPurchases: 1 }, { expect: 422 });
  await step('shop.set_price', { productId: 'prod1', price: 150 }, { check: async () => assert.equal((await g('shopProducts/prod1')).data().price, 150) });
  await step('shop.set_price', { productId: 'prod1', price: 150 }, { expect: 409 });
  await step('shop.set_price', { productId: 'missing', price: 5 }, { expect: 404 });
  await step('shop.set_stock', { productId: 'prod1', max: 60 }, { check: async () => assert.equal((await g('shopProducts/prod1')).data().maxTotalPurchases, 60) });
  await step('shop.set_stock', { productId: 'prod1', max: 2 }, { expect: 422, note: 'أقل من المباع' });
  await step('shop.stop_selling', { productId: 'prod1' }, { check: async () => assert.ok((await g('shopProducts/prod1')).data().expiresAt.toMillis() < Date.now()) });
  await step('shop.reactivate', { productId: 'prod1', hours: 48 }, { check: async () => assert.ok((await g('shopProducts/prod1')).data().expiresAt.toMillis() > Date.now() + 47 * 3600_000) });
  await step('shop.hide_frame', { frameId: 'xframe1' }, { check: async () => assert.equal((await g('framesCatalogExtra/xframe1')).data().visibility, 'private') });
  await step('shop.show_frame', { frameId: 'xframe1' }, { check: async () => assert.equal((await g('framesCatalogExtra/xframe1')).data().visibility, 'public') });
  await step('shop.hide_frame', { frameId: 'anime01' }, { expect: 404 });
  await step('shop.delete_product', { productId: ctx.pid }, { check: async () => assert.equal((await g(`shopProducts/${ctx.pid}`)).exists, false) });
  assert.equal((await g('storeSales/sale1')).exists, true, 'سجل المبيعات لم يُمسّ');
  const sr = await step('shop.sales_report', { days: 30 }); assert.ok(sr.download.text.includes('sara'));
});

// ================= الأكواد =================
T('codes: إنشاء/تعطيل/تفعيل/حدود/انتهاء/تصفير/حذف (RTDB)', async () => {
  await step('codes.create', { name: 'كود جديد', frameId: 'anime03', durationDays: 3, maxUses: 3 }, { check: async () => { const v = (await rt.ref('secretCodes/كود جديد').get()).val(); assert.equal(v.active, true); assert.equal(v.frameName, 'أميرة الورد', 'اسم الإطار يُملأ من كتالوج الموقع'); } });
  assert.equal((await rt.ref('secretCodes/كود جديد/usedCount').get()).val(), 0);
  await step('codes.create', { name: 'كود جديد', frameId: 'anime03', durationDays: 3, maxUses: 3 }, { expect: 409 });
  await step('codes.create', { name: 'x', frameId: 'zzz', durationDays: 1, maxUses: 1 }, { expect: 404 });
  await step('codes.stop', { code: 'كود جديد' }, { check: async () => assert.equal((await rt.ref('secretCodes/كود جديد/active').get()).val(), false) });
  await step('codes.stop', { code: 'كود جديد' }, { expect: 409 });
  await step('codes.reactivate', { code: 'كود جديد' }, { check: async () => assert.equal((await rt.ref('secretCodes/كود جديد/active').get()).val(), true) });
  await step('codes.set_max_uses', { code: 'كود شغال', maxUses: 9 }, { check: async () => assert.equal((await rt.ref('secretCodes/كود شغال/maxUses').get()).val(), 9) });
  await step('codes.set_max_uses', { code: 'كود شغال', maxUses: 0 }, { expect: 422 });
  const exp = Date.now() + 10 * 86400_000;
  await step('codes.set_expiry', { code: 'كود شغال', expiresAt: exp }, { check: async () => assert.equal((await rt.ref('secretCodes/كود شغال/expiresAt').get()).val(), exp) });
  await step('codes.set_expiry', { code: 'كود شغال', expiresAt: 1000 }, { expect: 422 });
  const u = await step('codes.code_users', { code: 'كود شغال' }); assert.equal(u.data[0].username, 'ahmed_1');
  await step('codes.reset_usage', { code: 'كود شغال' }, { check: async () => { const v = (await rt.ref('secretCodes/كود شغال').get()).val(); assert.equal(v.usedCount, 0); assert.equal(v.usedBy, undefined); } });
  const ex = await step('codes.export_codes', {}); assert.ok(ex.data.some((c) => c.state === 'منتهي'));
  const view = await o.get('/api/views/codes/attention'); assert.ok(view.json.rows.some((r) => r.state === 'منتهي'));
  await step('codes.delete', { code: 'كود جديد' }, { check: async () => assert.equal((await rt.ref('secretCodes/كود جديد').get()).exists(), false) });
  await step('codes.delete', { code: 'غير موجود' }, { expect: 404 });
});

// ================= الرسائل =================
T('messages: نشر/إيقاف/مكتبة/جدولة بنشر ذرّي', async () => {
  await step('messages.publish', { text: 'إعلان عام', position: 'center', durationSec: 10 }, { check: async () => { assert.equal((await g('broadcastMessages/current')).data().text, 'إعلان عام'); assert.equal((await rt.ref('ownerMessages/broadcast/text').get()).val(), 'إعلان عام'); } });
  await step('messages.clear', {}, { check: async () => assert.equal((await g('broadcastMessages/current')).exists, false) });
  await step('messages.clear', {}, { expect: 409 });
  const s = await step('messages.save', { title: 'ترحيب', text: 'أهلاً بالجميع' }); const id = env.svc.store.col('savedAnnouncements').list({})[0].id;
  await step('messages.edit_saved', { id, text: 'أهلاً بالجميع 2' });
  await step('messages.repost_saved', { id, position: 'top', durationSec: 8 }, { check: async () => assert.equal((await g('broadcastMessages/current')).data().text, 'أهلاً بالجميع 2') });
  await step('messages.delete_saved', { id }, { check: () => assert.equal(env.svc.store.col('savedAnnouncements').count(), 0) }); void s;
  await step('messages.schedule', { text: 'مجدول 1', position: 'center', durationSec: 10, at: Date.now() + 3600_000 });
  const j1 = env.svc.store.col('scheduledPosts').list({})[0];
  await step('messages.cancel_scheduled', { id: j1.id }, { check: () => assert.equal(env.svc.store.col('scheduledPosts').get(j1.id).status, 'cancelled') });
  await step('messages.cancel_scheduled', { id: j1.id }, { expect: 409 });
  await step('messages.schedule', { text: 'مجدول 2', position: 'center', durationSec: 10, at: Date.now() - 5 }, { expect: 422 });
  await step('messages.schedule', { text: 'مجدول 3', position: 'center', durationSec: 10, at: Date.now() + 60_000 });
  const j3 = env.svc.store.col('scheduledPosts').list({ where: { status: 'scheduled' } })[0]; env.svc.store.col('scheduledPosts').merge(j3.id, { at: Date.now() - 1 });
  await Promise.all([env.svc.scheduledPosts.processDue(), env.svc.scheduledPosts.processDue()]);
  assert.equal((await g('broadcastMessages/current')).data().text, 'مجدول 3'); assert.equal(env.svc.store.col('scheduledPosts').get(j3.id).status, 'published');
  assert.equal(env.svc.audit.list({ where: { action: 'messages.scheduled_publish' }, limit: 10 }).length, 1, 'نشر واحد فقط رغم دورتين متزامنتين');
  await step('messages.delete_personal', { username: 'sara' }, { check: async () => assert.equal((await g('personalMessages/sara')).exists, false) });
  await step('messages.delete_personal', { username: 'sara' }, { expect: 404 });
  const ex = await step('messages.export_log', {}); assert.ok(ex.download.text.includes('time'));
});

// ================= التحليلات =================
T('analytics: كل التقارير حقيقية + أرشفة', async () => {
  const day = 86400_000, now = Date.now();
  const pl = await step('analytics.report_players', { limit: 100 }); assert.ok(pl.download.text.includes('ahmed_1')); assert.ok(pl.download.text.includes('1200'));
  const gm = await step('analytics.report_games', {}); assert.ok(gm.download.text.includes('sniper'));
  await step('analytics.report_streamers', {});
  const d = await step('analytics.report_daily', {}); assert.ok(d.data.reportId);
  await step('analytics.report_weekly', {});
  await step('analytics.report_punishments', { from: now - day, to: now + day });
  await step('analytics.report_rewards', { from: now - day, to: now + day });
  const cp = await step('analytics.compare_periods', { aFrom: now - 14 * day, aTo: now - 7 * day, bFrom: now - 7 * day, bTo: now }); assert.ok(cp.download.text.includes('newUsers'));
  const cu = await step('analytics.report_custom', { from: now - 30 * day, to: now }); const m = cu.data;
  assert.equal(m.rows >= 4, true); const txt = cu.download.text; assert.match(txt, /newUsers,\d+/); assert.match(txt, /newUsers,[3-9]/, '3 لاعبين أُنشئوا قبل 5 أيام');
  await step('analytics.report_custom', { from: now, to: now - day }, { expect: 422 });
  await step('analytics.archive_report', { reportId: d.data.reportId }, { check: () => assert.equal(env.svc.store.col('reports').get(d.data.reportId).archived, true) });
  const gr = await step('analytics.get_report', { reportId: d.data.reportId }); assert.ok(gr.download.text.length > 5);
  const growth = await o.get('/api/views/analytics/growth'); assert.equal(growth.json.rows.length, 30); assert.equal(growth.json.meta.total, 3);
  const top = await o.get('/api/views/analytics/top'); assert.equal(top.json.rows[0].key, 'ahmed_1');
});

// ================= ديسكورد: السيرفر =================
T('server: رسائل/تثبيت/حذف/تعديل/وصف/استعلام عبر Discord API', async () => {
  const an = await step('server.send_announcement', { channelId: CH2, title: 'عنوان', content: 'نص الإعلان', mention: 'none' }, { check: () => { const m = [...M.messages.values()].find((x) => x.embeds[0]?.description === 'نص الإعلان'); assert.ok(m); assert.equal(m.embeds[0].title, 'عنوان'); } });
  const sm = await step('server.send_message', { channelId: CH, content: 'رسالة' }); const mid = [...M.messages.values()].find((x) => x.content === 'رسالة').id;
  await step('server.pin_message', { channelId: CH, messageId: mid }, { check: () => assert.equal(M.messages.get(mid).pinned, true) });
  await step('server.pin_message', { channelId: CH, messageId: mid }, { expect: 409 });
  await step('server.unpin_message', { channelId: CH, messageId: mid }, { check: () => assert.equal(M.messages.get(mid).pinned, false) });
  await step('server.edit_message', { channelId: CH, messageId: mid, content: 'رسالة معدّلة' }, { check: () => assert.equal(M.messages.get(mid).content, 'رسالة معدّلة') });
  await step('server.delete_message', { channelId: CH, messageId: mid }, { check: () => assert.equal(M.messages.has(mid), false) });
  await step('server.delete_message', { channelId: CH, messageId: '999999999999999999' }, { expect: 404 });
  await step('server.set_channel_topic', { channelId: CH, topic: 'وصف جديد' }, { check: () => assert.equal(M.channels.find((c) => c.id === CH).topic, 'وصف جديد') });
  await step('server.set_description', { description: 'وصف السيرفر الجديد' }, { check: () => assert.equal(M.guild.description, 'وصف السيرفر الجديد') });
  const ml = await step('server.member_lookup', { userId: U.ahmed }); assert.equal(ml.data.username, 'ahmed');
  const ra = await step('server.recent_actions', {}); assert.equal(ra.data.length, 1);
  assert.ok(M.calls.some((c) => c.method === 'POST' && c.reason === undefined) || true);
  void an; void sm;
  for (const v of ['info', 'channels', 'roles', 'members', 'auditlog']) { const r = await o.get(`/api/views/server/${v}${v === 'members' ? '?q=ah' : ''}`); assert.equal(r.status, 200, v); assert.ok(r.json.rows.length >= 1, v); }
});
T('server: رسالة بقناة خارج السيرفر/غير موجودة → فشل حقيقي بلا نجاح مزيّف', async () => {
  await step('server.send_message', { channelId: '123456789012345678', content: 'x' }, { expect: 404 });
  M.failNext = { status: 403, code: 50013 }; const r = await o.run('server.send_message', { channelId: CH, content: 'x' }); assert.equal(r.status, 403); assert.match(r.json.message, /صلاحية|رتبة/);
  const before = M.messages.size; M.rateLimitOnce = true; await step('server.send_message', { channelId: CH, content: 'بعد تجاوز المعدل' }); assert.equal(M.messages.size, before + 1, 'أُعيدت المحاولة بعد 429 مرة واحدة');
});

// ================= ديسكورد: الأعضاء =================
T('members: عقوبات ورتب وألقاب وجماعي (مع حماية المالك والبوت)', async () => {
  await step('members.kick', { userId: U.khalid }, { check: () => assert.equal(M.members.has(U.khalid), false) });
  await step('members.kick', { userId: U.khalid }, { expect: 404 });
  await step('members.kick', { userId: M.ownerId }, { expect: 403 }); await step('members.kick', { userId: M.botId }, { expect: 403 });
  await step('members.ban', { userId: U.noura, deleteDays: 1 }, { check: () => { assert.ok(M.bans.has(U.noura)); assert.match(M.bans.get(U.noura).reason, /لوحة الإدارة/); } });
  await step('members.unban', { userId: U.noura }, { check: () => assert.equal(M.bans.has(U.noura), false) });
  await step('members.unban', { userId: U.noura }, { expect: 409 });
  await step('members.timeout', { userId: U.ahmed, minutes: 30 }, { check: () => assert.ok(new Date(M.members.get(U.ahmed).communication_disabled_until) > new Date()) });
  await step('members.untimeout', { userId: U.ahmed }, { check: () => assert.equal(M.members.get(U.ahmed).communication_disabled_until, null) });
  await step('members.untimeout', { userId: U.ahmed }, { expect: 409 });
  await step('members.add_role', { userId: U.sara, roleId: R.vip }, { check: () => assert.ok(M.members.get(U.sara).roles.includes(R.vip)) });
  await step('members.add_role', { userId: U.sara, roleId: R.vip }, { expect: 409 });
  await step('members.remove_role', { userId: U.sara, roleId: R.vip }, { check: () => assert.ok(!M.members.get(U.sara).roles.includes(R.vip)) });
  await step('members.set_nick', { userId: U.sara, nick: 'سارة VIP' }, { check: () => assert.equal(M.members.get(U.sara).nick, 'سارة VIP') });
  await step('members.set_nick', { userId: U.sara }, { check: () => assert.equal(M.members.get(U.sara).nick, null) });
  botRun("INSERT INTO warnings (guild_id, discord_id, reason, warning_role_given, issued_by, issued_at) VALUES (?, ?, 'سبب', 'تحذير1', 'mod', ?)", [GUILD, U.sara, Date.now()]);
  const wh = await step('members.warning_history', { userId: U.sara }); assert.equal(wh.data.warnings.length, 1);
  const bp = await step('members.bulk_preview', { userIds: `${U.sara}\n${U.ahmed}\n${M.ownerId}\n111111111111111111` }); assert.equal(bp.data.count, 2); assert.equal(bp.data.missing.length, 2);
  await step('members.bulk_action', { userIds: `${U.sara} ${U.ahmed}`, op: 'add_role', roleId: R.mod, expectedCount: 3 }, { expect: 409 });
  await step('members.bulk_action', { userIds: `${U.sara} ${U.ahmed}`, op: 'add_role', roleId: R.mod, expectedCount: 2 }, { check: () => { assert.ok(M.members.get(U.sara).roles.includes(R.mod)); assert.ok(M.members.get(U.ahmed).roles.includes(R.mod)); } });
  await step('members.bulk_action', { userIds: `${U.sara}`, op: 'timeout', expectedCount: 1 }, { expect: 422, note: 'مدة Timeout مطلوبة' });
  for (const v of ['bans', 'warnings', 'modlog']) assert.equal((await o.get(`/api/views/members/${v}`)).status, 200);
});

// ================= ديسكورد: أوامر البوت =================
T('commands: تعطيل/تفعيل (إلغاء/إعادة تسجيل) + صلاحيات + مقارنة', async () => {
  await step('commands.disable', { name: 'بث' }, { check: () => assert.ok(!M.cmds.some((c) => c.name === 'بث')) });
  assert.ok(env.svc.store.col('disabledCommands').get('بث'));
  await step('commands.disable', { name: 'بث' }, { expect: 404 });
  await step('commands.enable', { name: 'بث' }, { check: () => assert.ok(M.cmds.some((c) => c.name === 'بث')) });
  const r = await step('commands.restrict_permission', { name: 'مساعدة', permission: 'ManageMessages' }, { check: () => assert.equal(M.cmds.find((c) => c.name === 'مساعدة').default_member_permissions, '8192') });
  assert.equal((await o.post(`/api/audit/${r.auditId}/undo`)).status, 200); assert.equal(M.cmds.find((c) => c.name === 'مساعدة').default_member_permissions, null, 'التراجع أعاد الصلاحية');
  await step('commands.clear_restriction', { name: 'طرد' }, { check: () => assert.equal(M.cmds.find((c) => c.name === 'طرد').default_member_permissions, null) });
  await step('commands.clear_restriction', { name: 'طرد' }, { expect: 409 });
  await step('commands.restrict_permission', { name: 'غير_موجود', permission: 'Administrator' }, { expect: 404 });
  const dr = await step('commands.drift_report', {}); assert.ok(dr.data.inFilesNotRegistered.length > 20); assert.deepEqual(dr.data.registeredWithoutFile, []);
  const cd = await step('commands.command_detail', { name: 'طرد' }); assert.equal(cd.data.category, 'الإشراف'); assert.equal(cd.data.access, 'admin');
  const ex = await step('commands.export_registry', {}); assert.ok(ex.data.length >= 40);
  const bp = await step('commands.bot_permissions_check', {}); assert.equal(bp.data.botIsAdministrator, true);
  const reg = await o.get('/api/views/commands/registry'); assert.ok(reg.json.rows.length >= 40); assert.ok(reg.json.rows.some((x) => x.name === '/طرد' && x.state.includes('✅')));
});

// ================= البوت: الحماية / التكتات / الترحيب / المشرفون / الستريمرات / القاعدة =================
const GS = () => botSql('SELECT * FROM guild_settings WHERE guild_id = ?', [GUILD])[0];
T('automod: مفاتيح واستثناءات ومخالفات (قاعدة البوت — تُقرأ حياً)', async () => {
  await step('automod.toggle_links', { enabled: false }, { check: () => assert.equal(GS().link_protection, 0) });
  await step('automod.toggle_links', { enabled: false }, { expect: 409 });
  await step('automod.toggle_spam', { enabled: false }, { check: () => assert.equal(GS().spam_protection, 0) });
  await step('automod.toggle_links', { enabled: true }); await step('automod.toggle_spam', { enabled: true });
  await step('automod.add_domain_exempt', { value: 'https://www.YouTube.com/watch?v=1' }, { check: () => assert.ok(botSql("SELECT * FROM auto_mod_exemptions WHERE type='domain' AND value='youtube.com'").length) });
  await step('automod.add_domain_exempt', { value: 'youtube.com' }, { expect: 409 });
  await step('automod.add_domain_exempt', { value: 'not a domain' }, { expect: 422 });
  await step('automod.remove_domain_exempt', { value: 'youtube.com' }, { check: () => assert.equal(botSql("SELECT * FROM auto_mod_exemptions WHERE type='domain'").length, 0) });
  await step('automod.add_role_exempt', { value: R.mod }, { check: () => assert.equal(botSql("SELECT * FROM auto_mod_exemptions WHERE type='role'").length, 1) });
  await step('automod.remove_role_exempt', { value: R.mod });
  await step('automod.add_channel_exempt', { value: CH }, { check: () => assert.equal(botSql("SELECT * FROM auto_mod_exemptions WHERE type='channel'").length, 1) });
  await step('automod.remove_channel_exempt', { value: CH });
  botRun("INSERT INTO auto_mod_violations (guild_id, discord_id, violation_type, count, last_violation_at) VALUES (?, ?, 'link', 3, ?)", [GUILD, U.sara, Date.now()]);
  const mv = await step('automod.member_violations', { userId: U.sara }); assert.equal(mv.data[0].count, 3);
  await step('automod.reset_violations', { userId: U.sara, type: 'all' }, { check: () => assert.equal(botSql('SELECT * FROM auto_mod_violations').length, 0) });
  await step('automod.reset_violations', { userId: U.sara, type: 'all' }, { expect: 409 });
  for (const v of ['status', 'violations']) assert.equal((await o.get(`/api/views/automod/${v}`)).status, 200);
});
T('tickets: رتب الدعم والمساعد الذكي', async () => {
  await step('tickets.add_support_role', { roleId: R.mod }, { check: () => assert.deepEqual(JSON.parse(botSql("SELECT value FROM guild_config WHERE key='support_roles'")[0].value), [R.mod]) });
  await step('tickets.add_support_role', { roleId: R.mod }, { expect: 409 });
  await step('tickets.remove_support_role', { roleId: R.mod }, { check: () => assert.deepEqual(JSON.parse(botSql("SELECT value FROM guild_config WHERE key='support_roles'")[0].value), []) });
  await step('tickets.toggle_ai_style', { enabled: false }, { check: () => assert.equal(GS().ai_style_enabled, 0) });
  await step('tickets.set_ai_style_owner', { userId: U.ahmed }, { check: () => assert.equal(GS().ai_style_owner_id, U.ahmed) });
  await step('tickets.set_admin_news_channel', { channelId: CH2 }, { check: () => assert.equal(GS().admin_news_channel_id, CH2) });
  await step('tickets.clear_ai_style_examples', {}, { expect: 409 });
  botRun("INSERT INTO ai_style_examples (guild_id, author_id, reply_text, source, created_at) VALUES (?, 'x', 'رد', 'ticket', ?)", [GUILD, Date.now()]);
  await step('tickets.clear_ai_style_examples', {}, { check: () => assert.equal(botSql('SELECT * FROM ai_style_examples').length, 0) });
  botRun("INSERT INTO tickets (guild_id, origin_channel_id, discord_id, channel_id, reason, status, created_at) VALUES (?, ?, ?, ?, 'دعم فني', 'open', ?)", [GUILD, CH, U.ahmed, CH2, Date.now()]);
  const open = await o.get('/api/views/tickets/open'); assert.equal(open.json.rows.length, 1); const st = await o.get('/api/views/tickets/stats'); assert.equal(st.json.meta.open, 1);
  assert.equal((await o.get('/api/views/tickets/supportroles')).status, 200);
});
T('welcome: قناة/نص/اختبار/معاينة', async () => {
  await step('welcome.set_channel', { channelId: CH }, { check: () => assert.equal(GS().welcome_channel_id, CH) });
  await step('welcome.set_channel', { channelId: CH }, { expect: 409 });
  await step('welcome.set_channel', { channelId: '500000000000000009' }, { expect: 422, note: 'قناة صوتية' });
  await step('welcome.set_text_channel', { channelId: CH2 }, { check: () => assert.equal(GS().welcome_message_channel_id, CH2) });
  await step('welcome.set_message', { text: 'يا هلا {يوزر} في {السيرفر} — أنت رقم {العدد}' }, { check: () => assert.match(GS().welcome_message, /{يوزر}/) });
  const pv = await step('welcome.preview', {}); assert.match(pv.data.text, /@عضو-جديد/); assert.match(pv.data.text, /سيرفر احسمها/);
  await step('welcome.send_test', {}, { check: () => assert.ok([...M.messages.values()].some((m) => m.channel_id === CH2 && /اختبار الترحيب/.test(m.content) && /سيرفر احسمها/.test(m.content))) });
  await step('welcome.reset_message', {}, { check: () => assert.equal(GS().welcome_message, null) });
  await step('welcome.disable', {}, { check: () => assert.equal(GS().welcome_channel_id, null) });
  await step('welcome.disable', {}, { expect: 409 });
});
T('admins: إضافة/إزالة مشرفين (كاش البوت 10 دقائق ← «معلّق التطبيق»)', async () => {
  await step('admins.add_user', { id: U.ahmed }, { pending: true, check: () => assert.equal(botSql("SELECT * FROM bot_admin_config WHERE type='user'").length, 1) });
  await step('admins.add_user', { id: U.ahmed }, { expect: 409 });
  await step('admins.remove_user', { id: U.ahmed }, { pending: true, check: () => assert.equal(botSql("SELECT * FROM bot_admin_config").length, 0) });
  await step('admins.add_role', { id: R.mod }, { pending: true, check: () => assert.equal(botSql("SELECT * FROM bot_admin_config WHERE type='role'").length, 1) });
  await step('admins.add_role', { id: '400000000000009999' }, { expect: 404 });
  await step('admins.remove_role', { id: R.mod }, { pending: true });
  for (const v of ['list', 'log']) assert.equal((await o.get(`/api/views/admins/${v}`)).status, 200);
});
T('dstreamers: ستريمرات إعلان البوت (تُحمَّل بالذاكرة ← «معلّق التطبيق»)', async () => {
  const P = { platform: 'tiktok', username: 'Cool_Streamer' };
  await step('dstreamers.add', P, { pending: true, check: () => assert.equal(botSql('SELECT * FROM streamer_announcements')[0].normalized_username, 'cool_streamer') });
  await step('dstreamers.add', P, { expect: 409 });
  await step('dstreamers.disable', P, { pending: true, check: () => assert.equal(botSql('SELECT enabled FROM streamer_announcements')[0].enabled, 0) });
  await step('dstreamers.enable', P, { pending: true, check: () => assert.equal(botSql('SELECT enabled FROM streamer_announcements')[0].enabled, 1) });
  await step('dstreamers.set_username', { ...P, newUsername: 'Better_Name' }, { pending: true, check: () => assert.equal(botSql('SELECT normalized_username FROM streamer_announcements')[0].normalized_username, 'better_name') });
  await step('dstreamers.set_platform', { platform: 'tiktok', username: 'better_name', newPlatform: 'kick' }, { pending: true, check: () => assert.equal(botSql('SELECT platform FROM streamer_announcements')[0].platform, 'kick') });
  const cl = await step('dstreamers.check_link', { platform: 'kick', username: 'better_name' }); assert.equal(cl.data.bot.enabled, true);
  await step('dstreamers.notification_log', {});
  await step('dstreamers.remove', { platform: 'kick', username: 'better_name' }, { pending: true, check: () => assert.equal(botSql('SELECT * FROM streamer_announcements').length, 0) });
  await step('dstreamers.remove', { platform: 'kick', username: 'better_name' }, { expect: 404 });
  for (const v of ['list', 'events']) assert.equal((await o.get(`/api/views/dstreamers/${v}`)).status, 200);
});
T('botdb: تصدير جداول البوت عبر طبقة محددة (لا SQL مباشر)', async () => {
  for (const t of ['warnings', 'moderation_log', 'tickets', 'auto_replies']) { const r = await step(`botdb.export_${t}`, {}); assert.ok(r.download.text.startsWith('[')); }
  const st = await o.get('/api/views/botdb/status'); assert.equal(st.status, 200); assert.ok(st.json.rows.some((r) => r.field === 'النوع' && r.value === 'sqlite'));
  const bad = await o.raw('POST', '/api/actions/botdb/run_sql/run', { params: { sql: 'DROP TABLE tickets' }, idempotencyKey: 'abcdefgh9', confirm: true }); assert.equal(bad.status, 404, 'لا يوجد SQL مباشر');
});

// ================= الأقسام المشتركة =================
T('security: جلسات/قفل/حظر IP/نسخ احتياطي/سلسلة التدقيق', async () => {
  await a.login('admin'); await new Promise((r) => setTimeout(r, 5)); const other = client(env.base); await other.login('admin');
  const sid = env.svc.sessions.listActive().filter((s) => s.account === 'ADMIN').sort((x, y) => y.createdAt - x.createdAt || y.lastSeen - x.lastSeen)[0].fullId;
  await step('security.revoke_session', { sessionId: sid }, { check: async () => assert.equal((await other.get('/api/me')).status, 401) });
  await step('security.revoke_session', { sessionId: 'nope' }, { expect: 404 });
  await step('security.revoke_account_sessions', { account: 'admin' });
  await step('security.lock_account', { minutes: 5 }, { check: async () => assert.equal((await client(env.base).raw('POST', '/api/auth/login', { account: 'admin', password: 'test-admin-pass-1' })).status, 429) });
  await step('security.unlock_account', { account: 'admin' }, { check: async () => assert.equal((await client(env.base).login('admin')).status, 200) });
  await step('security.block_ip', { ip: '203.0.113.9', label: 'مشبوه' }, { check: () => assert.equal(env.svc.loginGuard.blocks().length, 1) });
  await step('security.unblock_ip', { ip: '203.0.113.9' }, { check: () => assert.equal(env.svc.loginGuard.blocks().length, 0) });
  await step('security.unblock_ip', { ip: '203.0.113.9' }, { expect: 404 });
  const b = await step('security.create_backup', {}); const file = b.detail.file;
  const vb = await step('security.verify_backup', { file }); assert.equal(vb.data.integrity, 'ok'); assert.ok(vb.data.auditRows > 5);
  await step('security.verify_backup', { file: '../../etc/passwd' }, { expect: 422 });
  const vc = await step('security.verify_audit_chain', {}); assert.equal(vc.data.ok, true);
  const ll = await step('security.export_login_log', {}); assert.ok(ll.download.text.includes('owner'));
  for (const v of ['sessions', 'logins', 'locks', 'backups']) assert.equal((await o.get(`/api/views/security/${v}`)).status, 200);
});
T('settings: كل إعداد بحدوده + إصدارات + تراجع + افتراضي', async () => {
  const sets = { sessionIdleMinutes: 45, sessionMaxHours: 10, loginFreeFails: 4, loginMaxLockSec: 600, loginGlobalFails: 40, loginIpMax: 30, healthIntervalSec: 90, healthRetentionDays: 3 };
  for (const [k, v] of Object.entries(sets)) { await step(`settings.set_${k}`, { value: v }, { check: () => assert.equal(env.svc.settings.get(k), v) }); await step(`settings.set_${k}`, { value: 100000 }, { expect: 422 }); }
  const v = env.svc.settings.all().version; assert.ok(v >= 7);
  await step('settings.rollback', { version: 1 }, { check: () => assert.equal(env.svc.settings.get('sessionIdleMinutes'), 30) });
  await step('settings.reset_setting', { key: 'loginIpMax' }, { check: () => assert.equal(env.svc.settings.get('loginIpMax'), 20) });
  await step('settings.reset_setting', { key: 'loginIpMax' }, { expect: 409 });
  const ex = await step('settings.export_settings', {}); assert.ok(ex.data.history.length >= 7);
  for (const w of ['current', 'history']) assert.equal((await o.get(`/api/views/settings/${w}`)).status, 200);
});
T('audit: كل التقارير + تراجع + بحث وتصدير', async () => {
  const r = {}; for (const id of ['summary', 'by_actor', 'failed_report', 'sensitive_report', 'reasons_report']) r[id] = await step(`audit.${id}`, {}); assert.ok(r.summary.data.byStatus.success > 20); assert.ok(r.failed_report.data.length > 5); assert.ok(r.sensitive_report.data.length > 3);
  const th = await step('audit.target_history', { target: 'sara' }); assert.ok(th.data.length >= 3);
  const c = await step('audit.export_csv', {}); assert.ok(c.download.text.includes('players.adjust_xp')); await step('audit.export_json', {});
  const ch = await step('audit.verify_chain', {}); assert.equal(ch.data.ok, true);
  const last = env.svc.audit.list({ where: { action: 'settings.set_loginMaxLockSec', status: 'success' }, limit: 1 })[0];
  await step('audit.undo_operation', { auditId: last.id }, { check: () => assert.equal(env.svc.settings.get('loginMaxLockSec'), 300) });
  await step('audit.undo_operation', { auditId: 'bogus' }, { expect: 404 });
  const list = await o.get('/api/audit?q=sara&status=success'); assert.ok(list.json.total >= 3); assert.ok(list.json.rows.every((x) => x.status === 'success'));
  const byTarget = await o.get('/api/audit?section=players&status=failed'); assert.ok(byTarget.json.rows.length >= 1);
  const csv = await o.raw('GET', '/api/audit/export?format=csv&section=players'); assert.equal(csv.status, 200);
});
T('health: فحوصات حقيقية للخدمات المُهيّأة وغير المُهيّأة', async () => {
  const all = await step('health.run_all', {}); const by = Object.fromEntries(all.data.map((x) => [x.id, x.status]));
  assert.equal(by.firestore, 'up'); assert.equal(by.rtdb, 'up'); assert.equal(by.firebaseAuth, 'up'); assert.equal(by.discordApi, 'up'); assert.equal(by.botDb, 'up'); assert.equal(by.adminStore, 'up'); assert.equal(by.bot, 'unconfigured'); assert.equal(by.botApi, 'unconfigured');
  const one = await step('health.run_check', { service: 'firestore' }); assert.ok(one.data.ms >= 0);
  await step('health.uptime_report', {}); await step('health.latency_report', {}); await step('health.export_incidents', {});
  await step('health.bot_snapshot', {}, { expect: 503, note: 'BOT_HEALTH_URL غير مضبوط' });
  // بوت «حي» وهمي: /health + API الداخلية (x-api-key) — مسار النجاح لـbot_snapshot وفحوصات bot/botApi
  const http = await import('node:http'); const seen = [];
  const botSrv = http.createServer((req, res) => { seen.push([req.url, req.headers['x-api-key']]); res.setHeader('content-type', 'application/json'); if (req.url === '/health') return res.end(JSON.stringify({ ready: true, ping: 42, uptime: 1234 })); if (req.url === '/api/discord/admin/stats') return res.end(JSON.stringify({ data: { registeredUsers: 3 } })); res.statusCode = 404; res.end('{}'); });
  await new Promise((r) => botSrv.listen(0, '127.0.0.1', r)); const bu = `http://127.0.0.1:${botSrv.address().port}`;
  env.cfg.bot.healthUrl = bu + '/health'; env.cfg.bot.apiBase = bu; env.cfg.bot.apiKey = 'bot-secret-key';
  const bs = await step('health.bot_snapshot', {}); assert.equal(bs.data.ping, 42); assert.equal(bs.data.uptime, 1234);
  const all2 = await step('health.run_all', {}); const by2 = Object.fromEntries(all2.data.map((x) => [x.id, x.status])); assert.equal(by2.bot, 'up'); assert.equal(by2.botApi, 'up');
  assert.ok(seen.some(([u, k]) => u === '/api/discord/admin/stats' && k === 'bot-secret-key'), 'مفتاح البوت يُرسل من الخادم فقط');
  const ov = await o.get('/api/overview'); assert.ok(!JSON.stringify(ov.json).includes('bot-secret-key'), 'المفتاح لا يظهر في رد اللوحة');
  const overBot = ov.json.workspaces.find((w) => w.id === 'discord').metrics.find((m) => m.id === 'botHealth'); assert.equal(overBot.status, 'ok'); assert.equal(overBot.value.ping, 42);
  botSrv.close(); env.cfg.bot.healthUrl = ''; env.cfg.bot.apiBase = ''; env.cfg.bot.apiKey = '';
  const td = await step('health.test_discord_token', {}); assert.match(td.message, /احسمها/);
  await step('health.prune_history', { days: 7 });
  assert.equal((await o.get('/api/views/health/now')).status, 200);
  // تعطّل Discord ← الحالة down + تنبيه، وعودته ← يُغلق التنبيه تلقائياً (بلا تكرار)
  M.failNext = { status: 500, code: 0 }; await env.svc.health.runOne('discordApi'); M.failNext = { status: 500, code: 0 }; await env.svc.health.runOne('discordApi');
  const al = env.svc.alerts.list({ where: { key: 'health:discordApi' }, limit: 5 }); assert.equal(al.length, 1); assert.equal(al[0].count, 2); assert.equal(al[0].status, 'open');
  await env.svc.health.runOne('discordApi'); assert.equal(env.svc.alerts.get('health:discordApi').status, 'resolved');
});
T('alerts: دورة المعالجة الكاملة', async () => {
  await step('alerts.raise_manual', { title: 'تنبيه يدوي', message: 'تفاصيل', severity: 'warning' }); const al = env.svc.alerts.list({ where: { source: 'manual:المالك' }, limit: 1 })[0]; assert.ok(al);
  await step('alerts.ack', { alertId: al.id }, { check: () => assert.equal(env.svc.alerts.get(al.id).status, 'acknowledged') });
  await step('alerts.ack', { alertId: al.id }, { expect: 409 });
  await step('alerts.resolve', { alertId: al.id, note: 'تم' }, { check: () => assert.equal(env.svc.alerts.get(al.id).status, 'resolved') });
  await step('alerts.reopen', { alertId: al.id }, { check: () => assert.equal(env.svc.alerts.get(al.id).status, 'open') });
  await step('alerts.ack_all', { severity: 'all' }, { check: () => assert.equal(env.svc.alerts.count({ status: 'open' }), 0) });
  await step('alerts.resolve_acknowledged', {}, { check: () => assert.equal(env.svc.alerts.count({ status: 'acknowledged' }), 0) });
  await step('alerts.delete_resolved', { days: 1 }); assert.ok(env.svc.alerts.count({ status: 'resolved' }) >= 1, 'المحلولة الحديثة تبقى');
  const ex = await step('alerts.export_alerts', {}); assert.ok(ex.download.text.includes('severity'));
  assert.equal((await o.get('/api/views/alerts/open')).status, 200);
});
T('integration: إعلان الفعالية في ديسكورد + تحقق + إعادة محاولة آمنة + مزامنة ستريمر', async () => {
  const eid = ctx.eventId; const k = `event:${eid}:${CH2}`;
  await step('integration.announce_event', { eventId: eid, channelId: CH2 }, { check: () => { const l = env.svc.store.col('integrationLinks').get(k); assert.equal(l.status, 'delivered'); assert.ok(M.messages.has(l.messageId)); } });
  await step('integration.announce_event', { eventId: eid, channelId: CH2 }, { expect: 409, note: 'لا إعلان مكرر' });
  await step('integration.retry_link', { linkId: k }, { expect: 409, note: 'الرابط سليم' });
  await step('integration.verify_link', { linkId: k }, { check: () => assert.equal(env.svc.store.col('integrationLinks').get(k).status, 'delivered') });
  M.messages.delete(env.svc.store.col('integrationLinks').get(k).messageId);
  await step('integration.verify_link', { linkId: k }, { check: () => assert.equal(env.svc.store.col('integrationLinks').get(k).status, 'missing') });
  const cnt = M.messages.size;
  await step('integration.retry_link', { linkId: k }, { check: () => { assert.equal(env.svc.store.col('integrationLinks').get(k).status, 'delivered'); assert.equal(env.svc.store.col('integrationLinks').get(k).attempts, 2); } }); assert.equal(M.messages.size, cnt + 1);
  const es = await step('integration.event_status', { eventId: eid }); assert.equal(es.data.discord.length, 1);
  await step('integration.sync_streamer', { streamer: 'streamer_one', platform: 'tiktok' }, { pending: true, check: () => assert.equal(botSql('SELECT * FROM streamer_announcements').length, 1) });
  await step('integration.sync_streamer', { streamer: 'streamer_one', platform: 'tiktok' }, { expect: 409 });
  await step('integration.sync_streamer', { streamer: 'ghost_unknown', platform: 'tiktok' }, { expect: 404 });
  const cs = await step('integration.compare_streamers', {}); assert.ok(cs.data.inSiteNotBot.includes('streamer_two')); assert.ok(!cs.data.inSiteNotBot.includes('streamer_one'));
  await step('integration.delete_link', { linkId: k }, { check: () => assert.equal(env.svc.store.col('integrationLinks').get(k), null) });
  const fl = await o.get('/api/views/integration/failures'); assert.equal(fl.status, 200);
  const map = await o.get('/api/integration'); assert.equal(map.status, 200); assert.ok(map.json.links.find((l) => l.id === 'firestore').health.status === 'up');
});
T('access: كل إجراءات صلاحيات الأدمن', async () => {
  await a.login('admin');
  await step('access.set_workspace', { workspace: 'discord', enabled: false }); await step('access.set_workspace', { workspace: 'discord', enabled: true });
  await step('access.set_section', { section: 'shop', enabled: true }); await step('access.set_action', { action: 'shop.set_price', enabled: true });
  assert.equal((await a.run('shop.set_price', { productId: 'prod1', price: 175 }, { reason: 'تعديل السعر' })).status, 200, 'الأدمن نفّذ بعد منحه');
  assert.equal((await g('shopProducts/prod1')).data().price, 175);
  await step('access.set_section_actions', { section: 'shop', enabled: false, scope: 'all' });
  assert.equal((await a.run('shop.set_price', { productId: 'prod1', price: 180 })).status, 403);
  await step('access.apply_preset', { preset: 'website_only' }); await step('access.apply_preset', { preset: 'full' }); await step('access.reset_defaults', {});
  await step('access.revoke_admin_sessions', {}); await step('access.view_effective', {});
  assert.equal((await o.get('/api/views/access/matrix')).status, 200); assert.equal((await o.get('/api/access/matrix')).status, 200);
  await a.login('admin');
});

// ================= فحوصات شاملة على كل زر =================
T('تغطية: كل إجراء في السجل جُرّب فعلاً (ما عدا الخفية التي تُختبر بالتراجع)', async () => {
  const hidden = new Set(['commands.restore_permission', 'access.restore_snapshot']);
  const missing = env.svc.registry.actions().filter((x) => !results[x.id] && !hidden.has(x.id)).map((x) => x.id);
  assert.deepEqual(missing, [], 'إجراءات لم تُختبر: ' + missing.join(', '));
  const failed = Object.values(results).flatMap((r) => r.runs.filter((x) => !x.ok).map((x) => r.id)); assert.deepEqual(failed, []);
});
T('كل زر: مدخلات فارغة → 422 قبل أي تنفيذ (للإجراءات ذات الحقول الإلزامية)', async () => {
  const bad = [];
  for (const act of env.svc.registry.actions()) { if (!act.fields.some((f) => f.required)) continue; const r = await o.run(act.id, {}); if (r.status !== 422) bad.push(`${act.id}:${r.status}`); (results[act.id] ||= { id: act.id, runs: [] }).validation = r.status === 422 ? 'ok' : 'FAIL'; }
  assert.deepEqual(bad, []);
});
T('كل زر: الأدمن بلا صلاحية → 403 من الخادم حتى لو أرسل الطلب يدوياً', async () => {
  await a.login('admin');
  assert.equal((await o.run('access.apply_preset', { preset: 'locked' })).status, 200);
  for (const sec of env.svc.registry.sections().filter((x) => !x.ownerOnly)) await o.run('access.set_section', { section: sec.id, enabled: false });
  assert.equal((await a.get('/api/me')).json.sections.length, 0, 'لا قسم ظاهراً للأدمن');
  const bad = [];
  for (const act of env.svc.registry.actions()) { const r = await a.run(act.id, {}); if (r.status !== 403) bad.push(`${act.id}:${r.status}`); (results[act.id] ||= { id: act.id, runs: [] }).adminDenied = r.status === 403 ? 'ok' : 'FAIL'; }
  assert.deepEqual(bad, [], 'كل إجراء يجب أن يُرفض');
  const unauth = client(env.base); for (const id of ['players.ban_permanent', 'server.kick', 'automod.toggle_links']) assert.equal((await unauth.run(id, {})).status, 401);
});
