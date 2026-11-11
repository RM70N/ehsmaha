'use strict';

// اختبارات الإعلان التلقائي عن الستريمرز: التسجيل الدائم، منع التكرار، الاستعادة، الصلاحيات، الأعطال.
// ديسكورد وروابط المنصات مزيّفة بالكامل — ما فيه أي اتصال خارجي.

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  LOG_LEVEL: 'error'
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { MessageFlags } = require('discord.js');
const botDb = require('../database/botDb');
const store = require('../database/streamerAnnouncements');
const liveStreams = require('../services/liveStreams');
const announcerMod = require('../services/streamerAnnouncer');
const resolver = require('../services/streamLinkResolver');
const { loadCommands } = require('../utils/commandLoader');
const { makeGuild, makeMember, makeInteraction } = require('./helpers/discordMock');

const CHANNEL = '1552252935377780777';
const OWNER = '944639301528977420';
const FAST = { confirmMs: 25, absentGraceMs: 250, touchEveryMs: 60_000, retryDelaysMs: [30, 60, 90], sendTimeoutMs: 400, unresolvedRetryMs: 100, dbRetryMs: [40, 80, 160] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeoutMs = 3000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error('انتهت المهلة');
    await wait(10);
  }
}

test.before(async () => {
  await botDb.init(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { sqlitePath: ':memory:' });
});
test.after(async () => {
  liveStreams.clearAll();
  if (process.env.TEST_DATABASE_URL) await botDb.run('DELETE FROM streamer_announcement_events').then(() => botDb.run('DELETE FROM streamer_announcements')); // نترك الجداول: ملفات اختبار ثانية تشتغل بنفس القاعدة بالتوازي
  await botDb.close();
});
test.beforeEach(async () => {
  announcerMod._reset();
  liveStreams.clearAll();
  await botDb.run('DELETE FROM streamer_announcement_events');
  await botDb.run('DELETE FROM streamer_announcements');
});

function fakeChannel({ mention = true, failWith = null, hang = false, perms = ['ViewChannel', 'SendMessages', 'EmbedLinks'] } = {}) {
  const have = new Set([...perms, ...(mention ? ['MentionEveryone'] : [])]);
  const ch = {
    id: CHANNEL,
    sent: [],
    attempts: 0,
    failWith,
    hang,
    guild: { members: { me: { id: 'bot' }, fetchMe: async () => ({ id: 'bot' }) } },
    permissionsFor: () => ({ has: (p) => have.has(p) }),
    async send(payload) {
      ch.attempts += 1;
      if (ch.hang) return new Promise(() => {});
      if (ch.failWith && ch.attempts <= (ch.failTimes ?? 99)) throw Object.assign(new Error('discord'), ch.failWith);
      const m = { id: `msg${ch.sent.length + 1}`, payload };
      ch.sent.push(m);
      return m;
    }
  };
  return ch;
}

function setup(channel = fakeChannel(), settings = {}) {
  const client = { channels: { cache: new Map(channel ? [[CHANNEL, channel]] : []), fetch: async () => null } };
  const a = announcerMod.createAnnouncer({ liveStreams, store, getClient: () => client, channelId: CHANNEL, settings: { ...FAST, ...settings } });
  return { a, channel, client };
}
const reg = async (platform, username, guildId = 'g1') => {
  const n = resolver.normalizeUsername(username);
  const { row } = await store.streamers.add({ guildId, platform, username: n.display, normalized: n.normalized, addedBy: OWNER });
  return row;
};
const live = (platform, username, extra = {}) => liveStreams.upsert({ sessionId: `site:${platform}:${username.toLowerCase()}`, platform, platformUsername: username, gameName: null, source: 'poll', ...extra });
const text = (m) => JSON.stringify(m.payload.embeds.map((e) => e.toJSON()));

test('التسجيل: يُحفظ، المكرر ما يتكرر (حتى بكتابة @ وأحرف كبيرة)، ونفس اليوزر بمنصة ثانية تسجيل مستقل', async () => {
  const a = await store.streamers.add({ guildId: 'g1', platform: 'tiktok', username: 'som3h.4', normalized: 'som3h.4', addedBy: OWNER });
  assert.equal(a.created, true);
  const n = resolver.normalizeUsername(' @SOM3H.4 ');
  assert.equal(n.normalized, 'som3h.4');
  const dup = await store.streamers.add({ guildId: 'g1', platform: 'tiktok', username: n.display, normalized: n.normalized, addedBy: OWNER });
  assert.equal(dup.created, false);
  const other = await store.streamers.add({ guildId: 'g1', platform: 'twitch', username: 'som3h4', normalized: 'som3h4', addedBy: OWNER });
  assert.equal(other.created, true);
  const same = await store.streamers.add({ guildId: 'g1', platform: 'kick', username: 'som3h.4', normalized: 'som3h.4', addedBy: OWNER });
  assert.equal(same.created, true, 'نفس اليوزر على منصة ثانية');
  assert.equal(await store.streamers.countAll(), 3);
});

test('رابط البث: صيغة كل منصة، رفض المسافات والرموز، وروابط الجلسة تُقبل فقط لنفس الحساب والمنصة', async () => {
  assert.equal(resolver.canonicalUrl('tiktok', 'som3h.4'), 'https://www.tiktok.com/@som3h.4/live');
  assert.equal(resolver.canonicalUrl('twitch', 'some_user'), 'https://www.twitch.tv/some_user');
  assert.equal(resolver.canonicalUrl('kick', 'some-user'), 'https://kick.com/some-user');
  assert.equal(resolver.canonicalUrl('youtube', 'mychannel'), 'https://www.youtube.com/@mychannel/live');
  assert.equal(resolver.canonicalUrl('youtube', `uc${'a'.repeat(22)}`, `UC${'A'.repeat(22)}`), `https://www.youtube.com/channel/UC${'A'.repeat(22)}/live`);
  assert.equal(resolver.canonicalUrl('tiktok', 'bad name'), null);
  assert.equal(resolver.canonicalUrl('tiktok', 'a'), null);
  assert.equal(resolver.canonicalUrl('twitch', 'abc'), null, 'تويتش 4 أحرف على الأقل');
  assert.equal(resolver.sessionUrl('tiktok', 'abc', { streamUrl: 'https://www.tiktok.com/@abc/live' }), 'https://www.tiktok.com/@abc/live');
  assert.equal(resolver.sessionUrl('tiktok', 'abc', { streamUrl: 'https://www.tiktok.com/@other/live' }), null, 'رابط شخص مختلف');
  assert.equal(resolver.sessionUrl('tiktok', 'abc', { streamUrl: 'https://evil.com/@abc/live' }), null, 'نطاق غير المنصة');
  assert.equal(resolver.sessionUrl('tiktok', 'abc', { streamUrl: 'http://www.tiktok.com/@abc/live' }), null, 'بدون https');
  assert.equal(resolver.sessionUrl('twitch', 'abc', { streamUrl: 'https://www.tiktok.com/@abc/live' }), null, 'منصة غير مطابقة');
  assert.equal((await resolver.resolve({ platform: 'tiktok', username: 'x y' })).reason, 'INVALID_USERNAME');
});

test('ربط ستريمر مسجل ← إعلان واحد بالنص الحرفي + Embed + زر + منشن everyone فقط، وبدون بدء أي لعبة', async (t) => {
  await reg('tiktok', 'som3h.4');
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4'); // "متصل بالبث" (linked) بدون أي لعبة
  liveStreams.upsert({ sessionId: 'x', platform: 'tiktok', platformUsername: 'som3h.4', gameName: null, source: 'poll' });
  await until(() => channel.sent.length === 1);
  const m = channel.sent[0].payload;
  assert.equal(m.content, 'حياكم ستريمر يبث احسمها @everyone');
  assert.deepEqual(m.allowedMentions, { parse: ['everyone'], users: [], roles: [] });
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, 'ستريمر من احسمها على الهواء!');
  assert.match(e.description, /`som3h\.4`/);
  assert.match(e.description, /`TikTok`/);
  assert.match(e.description, /`LIVE`/);
  assert.match(e.description, /https:\/\/www\.tiktok\.com\/@som3h\.4\/live/);
  const btn = m.components[0].toJSON().components[0];
  assert.equal(btn.label, 'شاهد البث الآن');
  assert.equal(btn.url, 'https://www.tiktok.com/@som3h.4/live');
  assert.equal(e.color, 1707315, 'بنفسجي احسمها');
  const ev = await store.events.getOpen('tiktok', 'som3h.4');
  assert.equal(ev.status, 'sent');
  assert.equal(ev.message_id, 'msg1');
});

test('ستريمر غير مسجل، أو نفس اليوزر بمنصة ثانية، أو جزء من الاسم ← لا إعلان', async (t) => {
  await reg('tiktok', 'som3h.4');
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'someone_else');
  live('twitch', 'som3h4');
  liveStreams.upsert({ sessionId: 'tw', platform: 'twitch', platformUsername: 'som3h.4', source: 'poll' }); // نفس اليوزر لكن تويتش
  live('tiktok', 'som3h.44'); // اسم يحتوي الاسم المسجل (مطابقة جزئية ممنوعة)
  await wait(250);
  assert.equal(channel.sent.length, 0);
  assert.equal(liveStreams.list().length >= 3, true, 'تظهر طبيعي بـ/بث');
});

test('تحديثات متكررة، تغيير لعبة، ربط ← لعب، Webhook + مزامنة: إعلان واحد فقط', async (t) => {
  await reg('tiktok', 'som3h.4');
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4');
  await until(() => channel.sent.length === 1);
  live('tiktok', 'som3h.4', { gameName: 'الدول', source: 'webhook' }); // يشغّل لعبة
  liveStreams.reconcile([{ sessionId: 's', platform: 'tiktok', platformUsername: 'som3h.4', gameName: 'الروليت' }]);
  liveStreams.reconcile([{ sessionId: 's', platform: 'tiktok', platformUsername: 'som3h.4', gameName: 'القناص' }]);
  for (let i = 0; i < 20; i++) a.evaluate();
  await wait(300);
  assert.equal(channel.sent.length, 1);
});

test('التزامن: محرّكان على نفس القاعدة (عمليتين) ونفس الحدث ← إعلان واحد (الفهرس الفريد الجزئي)', async (t) => {
  await reg('tiktok', 'som3h.4');
  const ch = fakeChannel();
  const s1 = setup(ch);
  const s2 = setup(ch);
  t.after(() => { s1.a.stop(); s2.a.stop(); });
  await Promise.all([s1.a.start(), s2.a.start()]);
  live('tiktok', 'som3h.4');
  await wait(400);
  assert.equal(ch.sent.length, 1);
});

test('إعادة تشغيل البوت والجلسة قائمة ← ما يعيد الإعلان؛ والبث الجديد بعد انتهاء السابق ← إعلان جديد', async (t) => {
  await reg('tiktok', 'som3h.4');
  const ch = fakeChannel();
  const s1 = setup(ch);
  await s1.a.start();
  live('tiktok', 'som3h.4');
  await until(() => ch.sent.length === 1);
  s1.a.stop(); // "إعادة التشغيل" — الجلسة لسا موجودة بقائمة البث
  const s2 = setup(ch);
  t.after(() => s2.a.stop());
  await s2.a.start();
  await wait(300);
  assert.equal(ch.sent.length, 1, 'ما تكرر بعد الإقلاع');
  // انتهاء البث فعلاً (أطول من المهلة) ثم بث جديد
  liveStreams.end('site:tiktok:som3h.4');
  await until(async () => !(await store.events.getOpen('tiktok', 'som3h.4')), 2000);
  live('tiktok', 'som3h.4');
  await until(() => ch.sent.length === 2, 2000);
  assert.equal((await store.events.getOpen('tiktok', 'som3h.4')).status, 'sent');
});

test('انقطاع لحظي (أقل من مهلة السماح) ما يعيد الإعلان', async (t) => {
  await reg('tiktok', 'som3h.4');
  const { a, channel } = setup(fakeChannel(), { absentGraceMs: 400 });
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4');
  await until(() => channel.sent.length === 1);
  liveStreams.end('site:tiktok:som3h.4');
  await wait(100);
  live('tiktok', 'som3h.4'); // رجع
  await wait(600);
  assert.equal(channel.sent.length, 1);
});

test('حلقة قديمة جداً (أطول من مهلة الإقلاع) ← تُغلق ويُعتبر البث الحالي جديداً', async (t) => {
  const row = await reg('tiktok', 'som3h.4');
  const ev = await store.events.open({ platform: 'tiktok', normalized: 'som3h.4', streamerId: row.id, startedAt: Date.now() - 3 * 3600 * 1000 });
  await botDb.run('UPDATE streamer_announcement_events SET last_seen_at = ? WHERE id = ?', [Date.now() - 2 * 3600 * 1000, ev.id]);
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4');
  await until(() => channel.sent.length === 1);
});

test('حذف الستريمر: يتوقف الإعلان (حتى وهو يبث)، ولا يتأثر /بث ولا جلسته', async (t) => {
  await reg('tiktok', 'som3h.4');
  const { a, channel } = setup(fakeChannel(), { confirmMs: 150 });
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4');
  await wait(40); // ظهر وبانتظار التأكيد
  assert.equal(await store.streamers.remove('g1', 'tiktok', 'som3h.4'), true);
  await a.unregister({ guildId: 'g1', platform: 'tiktok', normalized: 'som3h.4' });
  await wait(300);
  assert.equal(channel.sent.length, 0, 'ما انرسل شي بعد الإزالة');
  assert.equal(liveStreams.list().some((s) => s.platformUsername === 'som3h.4'), true, 'الجلسة باقية بـ/بث');
  assert.equal(await store.streamers.get('g1', 'tiktok', 'som3h.4'), null);
  // بث جديد بعد الإزالة ما ينعلن
  liveStreams.end('site:tiktok:som3h.4');
  live('tiktok', 'som3h.4');
  await wait(250);
  assert.equal(channel.sent.length, 0);
});

test('رابط غير صالح (حساب بصيغة خاطئة) ← لا إعلان مضلل، وما يتعطل شي', async (t) => {
  await reg('tiktok', 'bad name'); // سُجّل مباشرة بالقاعدة (الأمر يرفضه) — المحرك يرفض الرابط
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  liveStreams.upsert({ sessionId: 'z', platform: 'tiktok', platformUsername: 'bad name', source: 'poll' });
  await wait(300);
  assert.equal(channel.sent.length, 0);
  assert.equal(await store.events.getOpen('tiktok', 'bad name'), null, 'ما انفتحت حلقة');
});

test('المحقّق الاختياري: يقول "مو يبث" ← لا إعلان', async (t) => {
  await reg('twitch', 'some_user');
  resolver.setLiveVerifier(async () => false);
  t.after(() => resolver.setLiveVerifier(null));
  const { a, channel } = setup();
  t.after(() => a.stop());
  await a.start();
  live('twitch', 'some_user');
  await wait(300);
  assert.equal(channel.sent.length, 0);
});

test('بدون صلاحية Mention Everyone: يسجّل المشكلة ويرسل بدون @everyone ولا يدّعي المنشن', async (t) => {
  await reg('kick', 'some-user');
  const { a, channel } = setup(fakeChannel({ mention: false }));
  t.after(() => a.stop());
  await a.start();
  live('kick', 'some-user');
  await until(() => channel.sent.length === 1);
  assert.ok(!channel.sent[0].payload.content.includes('@everyone'));
  assert.deepEqual(channel.sent[0].payload.allowedMentions, { parse: [] });
  assert.equal((await store.events.getOpen('kick', 'some-user')).status, 'sent_no_mention');
});

test('الروم غير متاح أو ناقص الصلاحيات ← ما يرسل لروم بديل ويسجّل الفشل', async (t) => {
  await reg('twitch', 'some_user');
  const gone = setup(null);
  t.after(() => gone.a.stop());
  await gone.a.start();
  live('twitch', 'some_user');
  await wait(250);
  assert.equal((await store.events.getOpen('twitch', 'some_user')).status, 'failed');
  // ناقص SendMessages
  gone.a.stop();
  announcerMod._reset();
  liveStreams.clearAll();
  await botDb.run('DELETE FROM streamer_announcement_events');
  const noSend = fakeChannel({ perms: ['ViewChannel'] });
  const s = setup(noSend);
  t.after(() => s.a.stop());
  await s.a.start();
  live('twitch', 'some_user');
  await wait(250);
  assert.equal(noSend.sent.length, 0);
});

test('فشل مؤكد من ديسكورد ← إعادة محدودة ثم نجاح بدون تكرار؛ مهلة/نتيجة غير واضحة ← لا إعادة', async (t) => {
  await reg('twitch', 'some_user');
  const flaky = fakeChannel({ failWith: { code: 50013, status: 403 } });
  flaky.failTimes = 2;
  const s = setup(flaky);
  t.after(() => s.a.stop());
  await s.a.start();
  live('twitch', 'some_user');
  await until(() => flaky.sent.length === 1, 3000);
  await wait(250);
  assert.equal(flaky.sent.length, 1, 'نجح مرة وحدة');
  assert.equal(flaky.attempts, 3);
  s.a.stop();
  announcerMod._reset();
  liveStreams.clearAll();
  await botDb.run('DELETE FROM streamer_announcement_events');
  const hang = fakeChannel({ hang: true });
  const u = setup(hang);
  t.after(() => u.a.stop());
  await u.a.start();
  live('twitch', 'some_user');
  await until(async () => (await store.events.getOpen('twitch', 'some_user'))?.status === 'unknown', 3000);
  await wait(300);
  assert.equal(hang.attempts, 1, 'ما أُعيدت المحاولة (منع التكرار)');
});

test('قاعدة البيانات تعطلت: ما ينشر بدون التحقق، ما يفقد التسجيلات، ويكمل لما ترجع', async (t) => {
  await reg('tiktok', 'som3h.4');
  const failing = { streamers: store.streamers, events: { ...store.events, open: async () => { throw new Error('db down'); } } };
  const channel = fakeChannel();
  const client = { channels: { cache: new Map([[CHANNEL, channel]]), fetch: async () => null } };
  const a = announcerMod.createAnnouncer({ liveStreams, store: failing, getClient: () => client, channelId: CHANNEL, settings: FAST });
  t.after(() => a.stop());
  await a.start();
  live('tiktok', 'som3h.4');
  await wait(300);
  assert.equal(channel.sent.length, 0);
  assert.equal(await store.streamers.countAll(), 1, 'التسجيل محفوظ');
  // فشل تحميل السجل بالإقلاع ← لا ينشر، يعيد المحاولة، ثم يشتغل
  let calls = 0;
  const flakyLoad = { streamers: { ...store.streamers, listEnabled: async () => { if (++calls < 3) throw new Error('db down'); return store.streamers.listEnabled(); } }, events: store.events };
  announcerMod._reset();
  liveStreams.clearAll();
  const b = announcerMod.createAnnouncer({ liveStreams, store: { streamers: { ...store.streamers, listEnabled: async () => { if (++calls < 3) throw new Error('db down'); return (await botDb.query('SELECT * FROM streamer_announcements WHERE enabled = 1')).map((r) => ({ ...r, id: Number(r.id) })); } }, events: store.events }, getClient: () => client, channelId: CHANNEL, settings: FAST });
  void flakyLoad;
  t.after(() => b.stop());
  await b.start();
  assert.equal(b._internal.isReady(), false);
  live('tiktok', 'som3h.4');
  await wait(100);
  assert.equal(channel.sent.length, 0, 'ما نعتبره غير مسجّل ولا ننشر قبل التحميل');
  await until(() => channel.sent.length === 1, 3000);
});

test('الأوامر: غير المالك مرفوض (Ephemeral)، المالك يضيف/يزيل، الرسائل نصها المطلوب، ولا تكرار', async (t) => {
  const { commands } = loadCommands();
  const add = commands.get('اضافة');
  const rem = commands.get('ازالة');
  assert.ok(add && rem, 'الأمران مسجلان');
  const json = add.data.toJSON();
  assert.equal(json.options[0].name, 'ستريمر');
  assert.deepEqual(json.options[0].options.map((o) => [o.name, o.required]), [['يوزر', true], ['المنصة', true]]);
  assert.deepEqual(json.options[0].options[1].choices.map((c) => c.value), ['tiktok', 'twitch', 'youtube', 'kick']);

  const guild = makeGuild();
  const stranger = makeMember(guild, { username: 'x' });
  const owner = makeMember(guild, { id: OWNER, username: 'owner' });
  const run = async (cmd, who, opts) => {
    const i = makeInteraction({ guild, member: who, commandName: cmd.name, options: opts });
    i.options.getString = (n) => opts[n];
    await cmd.execute(i);
    return i;
  };
  const replies = (i) => i.log.filter(([k]) => ['reply', 'editReply'].includes(k)).map(([, p]) => p);
  const txt = (i) => JSON.stringify(replies(i).map((p) => (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e))));

  const denied = await run(add, stranger, { 'يوزر': 'som3h.4', 'المنصة': 'tiktok' });
  assert.match(txt(denied), /هذا الأمر مخصص لمالك البوت فقط\./);
  assert.equal(replies(denied)[0].flags, MessageFlags.Ephemeral);
  assert.equal(await store.streamers.countAll(), 0, 'ما انسجّل شي');
  const deniedRm = await run(rem, stranger, { 'يوزر': 'som3h.4', 'المنصة': 'tiktok' });
  assert.match(txt(deniedRm), /مخصص لمالك البوت فقط/);

  const ok = await run(add, owner, { 'يوزر': '@SOM3H.4 ', 'المنصة': 'tiktok' });
  const out = txt(ok);
  assert.match(out, /تمت إضافة الستريمر بنجاح/);
  assert.match(out, /`SOM3H\.4`/);
  assert.match(out, /`TikTok`/);
  assert.match(out, /تم تفعيل المراقبة/);
  assert.match(out, new RegExp(`<#${CHANNEL}>`));
  assert.ok(ok.log.some(([k, p]) => k === 'deferReply' && p.flags === MessageFlags.Ephemeral), 'الرد خاص');
  assert.equal((await store.streamers.get(guild.id, 'tiktok', 'som3h.4')).added_by, OWNER);

  const dup = await run(add, owner, { 'يوزر': 'som3h.4', 'المنصة': 'tiktok' });
  assert.match(txt(dup), /هذا الستريمر مسجل مسبقاً على نفس المنصة\./);
  const bad = await run(add, owner, { 'يوزر': 'bad name!', 'المنصة': 'tiktok' });
  assert.match(txt(bad), /غير صالح/);
  assert.equal(await store.streamers.countAll(), 1);

  const removed = await run(rem, owner, { 'يوزر': 'som3h.4', 'المنصة': 'tiktok' });
  assert.match(txt(removed), /تمت إزالة الستريمر/);
  assert.match(txt(removed), /تم إيقاف الإعلانات التلقائية/);
  assert.match(txt(removed), /لن يتم إرسال إعلانات جديدة لهذا الحساب إلا بعد تسجيله مرة ثانية\./);
  const missing = await run(rem, owner, { 'يوزر': 'som3h.4', 'المنصة': 'tiktok' });
  assert.match(txt(missing), /هذا الستريمر مو موجود بقائمة الإعلانات على المنصة المحددة\./);
});

test('إعداد الروم: الروم الرسمي بالـID، والأوامر القديمة (/بث وغيره) باقية بدون تغيير', () => {
  const { loadConfig } = require('../config');
  assert.equal(loadConfig().streamAnnounceChannelId, CHANNEL);
  const { commands } = loadCommands();
  for (const name of ['بث', 'العاب', 'دول', 'روليت', 'قناص', 'مساعدة']) assert.ok(commands.has(name), `الأمر ${name} باقي`);
  const live = require('../commands/streams/live');
  assert.ok(live._internal && live._internal.buildPage, '/بث بدون تعديل');
});
