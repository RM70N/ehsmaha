'use strict';

// اختبارات نظام الترحيب البصري + الحماية التلقائية + الحفظ الدائم لقاعدة البوت.

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { makeGuild, makeRole, makeMember, makeChannel, makeUserMessage, makeInteraction, lastPayload } = require('./helpers/discordMock');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  COMMAND_COOLDOWN_MS: '0',
  BUTTON_COOLDOWN_MS: '0',
  LOG_LEVEL: 'error'
});

const botDb = require('../database/botDb');
const store = require('../database/botStore');
const { loadConfig } = require('../config');
const { loadCommands } = require('../utils/commandLoader');
const handler = require('../events/interactionCreate');
const welcomeCard = require('../utils/welcomeCard');
const welcome = require('../services/welcome');
const autoMod = require('../services/autoMod');
const cfg = require('../config/autoMod');
const stateBackup = require('../services/stateBackup');

let ctx;
const dispatch = (i) => handler.execute(ctx, i);
const cmd = (guild, member, commandName, options = {}) => makeInteraction({ guild, member, commandName, options });
const MIN = 60 * 1000;

test.before(async () => {
  await botDb.init(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { sqlitePath: ':memory:' });
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
test.after(async () => {
  autoMod.stopSweeper();
  if (process.env.TEST_DATABASE_URL) {
    await botDb.run('DROP TABLE IF EXISTS tickets, ticket_panels, warnings, moderation_log, bot_admin_config, guild_config, guild_settings, auto_mod_violations, auto_mod_exemptions, schema_migrations');
  }
  await botDb.close();
});

function world() {
  const guild = makeGuild();
  const modRole = makeRole(guild, { name: 'مشرف', position: 20 });
  const mod = makeMember(guild, { username: 'mod', roles: [modRole] });
  const member = makeMember(guild, { username: 'player' });
  const channel = makeChannel(guild, { name: 'العام' });
  return { guild, modRole, mod, member, channel, owner: guild.owner };
}

async function pngAvatar(color = '#ff3366') {
  const c = createCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = color;
  x.fillRect(0, 0, 256, 256);
  return c.toBuffer('image/png');
}
const fetchOk = (buf) => async () => ({ ok: true, arrayBuffer: async () => buf });

// =================== 1) بطاقة الترحيب ===================

test('بطاقة الترحيب: أفتار مقصوص دائرياً بمكان الدائرة بالضبط + اسم عربي بالمنتصف', async () => {
  const { AVATAR_X, AVATAR_Y, AVATAR_RADIUS } = welcomeCard._internal;
  const card = await welcomeCard.renderWelcomeCard({ username: 'مشاري الأحمد 👑', avatarUrl: 'x', fetchImpl: fetchOk(await pngAvatar('#00ff00')) });
  assert.equal(card.avatarFallback, false);
  assert.equal(card.text, 'مشاري الأحمد', 'الإيموجي انشال (الخط ما يدعمه)');
  assert.equal(card.fontSize, 88, 'اسم قصير = الحجم الأساسي');

  const img = await loadImage(card.buffer);
  const c = createCanvas(img.width, img.height);
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const s = card.width / 1759; // الناتج مصغّر
  const px = (X, Y) => Array.from(x.getImageData(Math.round(X * s), Math.round(Y * s), 1, 1).data);
  // مركز الدائرة وداخلها = لون الأفتار (أخضر صافي، بدون ضباب أبيض)
  for (const [dx, dy] of [[0, 0], [100, 0], [-100, 0], [0, -110], [60, 60]]) {
    const [r, g, b] = px(AVATAR_X + dx, AVATAR_Y + dy);
    assert.ok(g > 200 && r < 60 && b < 60, `داخل الدائرة (${dx},${dy}) لونه أخضر: ${r},${g},${b}`);
  }
  // زوايا المربع المحيط بالدائرة (برا الدائرة) = مو لون الأفتار (القص دائري فعلاً)
  const d = AVATAR_RADIUS * 0.85;
  for (const [dx, dy] of [[-d, -d], [d, -d], [d, d]]) {
    const [r, g, b] = px(AVATAR_X + dx, AVATAR_Y + dy);
    assert.ok(!(g > 200 && r < 60 && b < 60), `برا الدائرة (${Math.round(dx)},${Math.round(dy)}) ما فيه أفتار`);
  }
});

test('بطاقة الترحيب: اسم إنجليزي طويل يصغر تلقائياً داخل الشريط، والأفتار الافتراضي عند فشل التحميل', async () => {
  const long = 'Alexander_The_Great_2026_Ehs';
  const card = await welcomeCard.renderWelcomeCard({ username: long, avatarUrl: 'x', fetchImpl: async () => { throw new Error('network'); } });
  assert.equal(card.avatarFallback, true);
  assert.ok(card.fontSize < 88, `الخط صغر: ${card.fontSize}`);
  const c = createCanvas(10, 10).getContext('2d');
  c.font = `bold ${card.fontSize}px ${welcomeCard._internal.FONT_FAMILY}`;
  assert.ok(c.measureText(card.text).width <= welcomeCard._internal.USERNAME_MAX_WIDTH, 'الاسم داخل العرض المتاح');
  assert.equal(card.text, long, 'ما انقص — صغر الخط بس');
  // اسم مستحيل الطول: يصغر للحد الأدنى ثم يُقص بـ…
  const huge = await welcomeCard.renderWelcomeCard({ username: 'W'.repeat(120), avatarUrl: null });
  assert.equal(huge.fontSize, 34);
  assert.ok(huge.text.endsWith('…'));
});

// =================== 2) إرسال الترحيب ===================

test('الترحيب: الصورة أولاً ثم رسالة منشن حقيقية، و{يوزر} يتبدّل', async () => {
  const w = world();
  const ch = makeChannel(w.guild, { name: 'الترحيب' });
  await store.guildSettings.update(w.guild.id, { welcome_channel_id: ch.id, welcome_message: 'نورت يا {يوزر} بـ{السيرفر}!' }, 'x');
  const r = await welcome.welcomeMember(w.member);
  assert.deepEqual([r.image, r.text], [true, true]);
  const sent = w.guild.log.filter(([t, id]) => t === 'send' && id === ch.id).map(([, , p]) => p);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].files.length, 1, 'الأولى صورة');
  assert.equal(sent[0].content, undefined, 'الصورة بدون نص فوقها');
  assert.equal(sent[1].content, `نورت يا <@${w.member.id}> بـسيرفر احسمها!`);
  assert.deepEqual(sent[1].allowedMentions, { users: [w.member.id] }, 'المنشن يشتغل فعلاً للعضو فقط');
});

test('الترحيب: بدون قناة = تجاهل بصمت، وفشل الصورة/صلاحية المرفقات ما يمنع رسالة المنشن', async () => {
  const w = world();
  let r = await welcome.welcomeMember(w.member);
  assert.equal(r.skipped, 'NO_CHANNEL');
  assert.equal(w.guild.log.filter(([t]) => t === 'send').length, 0);

  // قناة الصورة بدون Attach Files + قناة منفصلة للرسالة
  const imgCh = makeChannel(w.guild, { botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  const msgCh = makeChannel(w.guild);
  await store.guildSettings.update(w.guild.id, { welcome_channel_id: imgCh.id, welcome_message_channel_id: msgCh.id }, 'x');
  r = await welcome.welcomeMember(w.member);
  assert.equal(r.image, false);
  assert.equal(r.text, true);
  const text = w.guild.log.find(([t, id]) => t === 'send' && id === msgCh.id)[2];
  assert.match(text.content, new RegExp(`نورت السيرفر يا <@${w.member.id}>`), 'النص الافتراضي');

  // فشل إرسال الصورة (خطأ ديسكورد) ← الرسالة تنرسل
  const ch2 = makeChannel(w.guild);
  await store.guildSettings.update(w.guild.id, { welcome_channel_id: ch2.id, welcome_message_channel_id: null }, 'x');
  w.guild.failNext = 'send';
  r = await welcome.welcomeMember(w.member);
  assert.equal(r.image, false);
  assert.equal(r.text, true);
});

test('أوامر الترحيب: تحديد القناة، تخصيص النص، التجربة، والصلاحيات', async () => {
  const w = world();
  const ch = makeChannel(w.guild, { name: 'الترحيب' });
  let i = cmd(w.guild, w.member, 'قناة_الترحيب', { 'قناة': ch });
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);

  i = cmd(w.guild, w.owner, 'قناة_الترحيب', { 'قناة': ch });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم تحديد قناة الترحيب/);
  assert.equal((await store.guildSettings.get(w.guild.id)).welcome_channel_id, ch.id);

  const noFiles = makeChannel(w.guild, { botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  i = cmd(w.guild, w.owner, 'قناة_الترحيب', { 'قناة': noFiles });
  await dispatch(i);
  assert.match(lastPayload(i).text, /إرفاق الملفات \(Attach Files\)/);

  i = cmd(w.guild, w.owner, 'تخصيص_رسالة_الترحيب', { 'نص': 'هلا والله {يوزر}\\nحيّاك' });
  await dispatch(i);
  assert.match(lastPayload(i).text, new RegExp(`هلا والله <@${w.owner.id}>\\\\nحيّاك`));
  assert.equal((await store.guildSettings.get(w.guild.id)).welcome_message, 'هلا والله {يوزر}\nحيّاك');

  i = cmd(w.guild, w.owner, 'تجربة_الترحيب');
  await dispatch(i);
  assert.match(lastPayload(i).text, /البطاقة: انرسلت ✅/);
  assert.match(lastPayload(i).text, /رسالة المنشن: انرسلت ✅/);

  // بدون Server Members Intent: تنبيه واضح
  ctx.membersIntent = false;
  try {
    i = cmd(w.guild, w.owner, 'قناة_الترحيب', { 'قناة': ch });
    await dispatch(i);
    assert.match(lastPayload(i).text, /Server Members Intent/);
  } finally {
    ctx.membersIntent = true;
  }

  i = cmd(w.guild, w.owner, 'تخصيص_رسالة_الترحيب', { 'افتراضي': true });
  await dispatch(i);
  assert.equal((await store.guildSettings.get(w.guild.id)).welcome_message, null);
  i = cmd(w.guild, w.owner, 'قناة_الترحيب', { 'تعطيل': true });
  await dispatch(i);
  assert.equal((await store.guildSettings.get(w.guild.id)).welcome_channel_id, null);
});

// =================== 3) الحماية التلقائية ===================

const send = (w, member, content, channel = w.channel) => autoMod.handleMessage(makeUserMessage(channel, member, content));
const timeouts = (w, id) => w.guild.log.filter(([t, uid]) => t === 'timeout' && uid === id).map(([, , ms]) => ms);
const deletions = (w) => w.guild.log.filter(([t]) => t === 'deleteMessage').length;
const later = () => autoMod._internal.recentPunish.clear(); // "جلسة لاحقة" بعد مهلة منع التصعيد

test('الروابط: تصعيد 10 دقائق ← 30 دقيقة ← 24 ساعة ← يبقى 24، والحذف مع كل مرة', async () => {
  const w = world();
  const expected = [10 * MIN, 30 * MIN, 24 * 60 * MIN, 24 * 60 * MIN];
  for (let n = 1; n <= 4; n++) {
    later();
    const r = await send(w, w.member, `شوفوا https://spam-site${n}.com/free`);
    assert.equal(r.type, 'link');
    assert.equal(r.result.count, n);
    assert.equal(r.result.durationMs, expected[n - 1]);
    assert.equal(r.result.timedOut, true);
    assert.equal(deletions(w), n, 'الرسالة انحذفت');
  }
  assert.deepEqual(timeouts(w, w.member.id), expected);
  // إشعار القناة + DM + سجل تلقائي
  const notice = w.guild.log.find(([t, id, p]) => t === 'send' && id === w.channel.id && JSON.stringify(p).includes('الحماية التلقائية'));
  assert.ok(notice, 'إشعار بالقناة');
  assert.ok(w.guild.log.some(([t, id]) => t === 'dm' && id === w.member.id), 'DM للعضو');
  const logs = await store.moderationLog.forTarget(w.guild.id, w.member.id, 10);
  assert.equal(logs.filter((l) => l.action === 'auto_timeout').length, 4);
  assert.equal(JSON.parse(logs[0].details).auto, true);
});

test('إشعار القناة ينحذف تلقائياً بعد 5 ثوانٍ', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = world();
  later();
  await send(w, w.member, 'discord.gg/free-nitro');
  assert.equal(w.guild.log.filter(([tp]) => tp === 'deleteSent').length, 0);
  t.mock.timers.tick(cfg.noticeTtlMs);
  await new Promise((r) => setImmediate(r));
  assert.equal(w.guild.log.filter(([tp]) => tp === 'deleteSent').length, 1);
});

test('السبام: تصعيد مستقل تماماً عن الروابط (سرعة + تكرار)', async () => {
  const w = world();
  later();
  await send(w, w.member, 'https://bad.com'); // مخالفة روابط أولى
  let v = await store.autoMod.get(w.guild.id, w.member.id);
  assert.deepEqual([v.link.count, v.spam.count], [1, 0]);

  // سبام سرعة: 5 رسائل ورا بعض
  later();
  let r;
  for (let k = 1; k <= cfg.spam.maxMessages; k++) r = await send(w, w.member, `رسالة ${k}`);
  assert.equal(r.type, 'spam');
  assert.equal(r.result.count, 1);
  assert.equal(r.result.durationMs, 10 * MIN, 'السبام بدأ من المستوى الأول رغم مخالفة الروابط');
  assert.ok(w.guild.log.some(([tp]) => tp === 'bulkDelete'), 'رسائل السبام السابقة انحذفت');

  // سبام تكرار: نفس الرسالة 3 مرات
  later();
  for (let k = 1; k <= cfg.spam.duplicateCount; k++) r = await send(w, w.member, 'نفس الكلام');
  assert.equal(r.type, 'spam');
  assert.equal(r.result.count, 2);
  assert.equal(r.result.durationMs, 30 * MIN);

  v = await store.autoMod.get(w.guild.id, w.member.id);
  assert.deepEqual([v.link.count, v.spam.count], [1, 2], 'كل عدّاد لحاله');
  later();
  r = await send(w, w.member, 'www.again.net');
  assert.equal(r.result.count, 2, 'الروابط كملت من 1 ← 2 (ما تأثرت بالسبام)');
});

test('منع القفز: روابط متلاحقة بنفس اللحظة تنحذف بدون ما تصعّد العدّاد', async () => {
  const w = world();
  later();
  await send(w, w.member, 'a.com/1');
  const r2 = await send(w, w.member, 'b.com/2');
  assert.equal(r2.result.counted, false);
  assert.equal(r2.result.deleted, 1, 'انحذفت');
  assert.equal((await store.autoMod.get(w.guild.id, w.member.id)).link.count, 1);
  assert.deepEqual(timeouts(w, w.member.id), [10 * MIN]);
});

test('الاستثناءات: الأدمن، الرتب الإدارية، الرتب والقنوات المستثناة، والنطاقات المسموحة', async () => {
  const w = world();
  await store.adminConfig.add(w.guild.id, 'role', w.modRole.id, 'x');
  require('../utils/adminPermissions').invalidate(w.guild.id);
  later();
  // المالك والرتبة الإدارية: لا روابط ولا سبام
  assert.equal(await send(w, w.owner, 'https://anything.com'), null);
  for (let k = 0; k < 8; k++) assert.equal(await send(w, w.mod, 'سبام سبام'), null);
  assert.equal(timeouts(w, w.mod.id).length, 0);

  // ehsmaha.com مسموح دائماً + روابط رسائل ديسكورد
  assert.equal(await send(w, w.member, 'العب على https://ehsmaha.com/profile'), null);
  assert.equal(await send(w, w.member, 'https://discord.com/channels/1/2/3'), null);
  // نطاق مضاف بالقائمة البيضاء (ونطاقاته الفرعية)
  await store.autoMod.addExemption(w.guild.id, 'domain', 'youtube.com', 'x');
  autoMod.invalidate(w.guild.id);
  assert.equal(await send(w, w.member, 'https://m.youtube.com/watch?v=1'), null);
  // رتبة مستثناة
  const creators = makeRole(w.guild, { name: 'صانع محتوى', position: 5 });
  const creator = makeMember(w.guild, { roles: [creators] });
  await store.autoMod.addExemption(w.guild.id, 'role', creators.id, 'x');
  // قناة مستثناة
  const share = makeChannel(w.guild, { name: 'شير' });
  await store.autoMod.addExemption(w.guild.id, 'channel', share.id, 'x');
  autoMod.invalidate(w.guild.id);
  assert.equal(await send(w, creator, 'https://tiktok.com/@me'), null);
  assert.equal(await send(w, w.member, 'https://tiktok.com/@me', share), null);
  // نفس الرابط بقناة عادية لعضو عادي = مخالفة
  later();
  assert.equal((await send(w, w.member, 'https://tiktok.com/@me')).type, 'link');
  assert.equal(deletions(w), 1, 'ما انحذف شي قبل كذا');
});

test('الحماية المعطّلة، عضو أعلى من البوت، وصلاحيات البوت الناقصة', async () => {
  const w = world();
  await store.guildSettings.update(w.guild.id, { link_protection: false, spam_protection: false }, 'x');
  autoMod.invalidate(w.guild.id);
  assert.equal(await send(w, w.member, 'https://x.com'), null);

  await store.guildSettings.update(w.guild.id, { link_protection: true }, 'x');
  autoMod.invalidate(w.guild.id);
  const high = makeRole(w.guild, { name: 'VIP', position: 90 });
  const vip = makeMember(w.guild, { roles: [high] });
  later();
  const r = await send(w, vip, 'https://x.com');
  assert.equal(r.result.timedOut, false, 'رتبته أعلى من البوت — ما ينكتم');
  assert.equal(r.result.deleted, 1, 'بس رسالته تنحذف');

  // بدون Manage Messages بالقناة: ما يحذف بس ما يطيح
  const locked = makeChannel(w.guild, { botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ModerateMembers] });
  later();
  const r2 = await send(w, w.member, 'https://x.com', locked);
  assert.equal(r2.result.deleted, 0);
  assert.equal(r2.result.timedOut, true);
});

test('ذاكرة تتبّع السبام تتنظّف دورياً (بدون تسرّب)', () => {
  const w = world();
  const { tracker, trackSpam, sweepTracker } = autoMod._internal;
  tracker.clear();
  const t0 = Date.now();
  for (let k = 0; k < 200; k++) {
    const m = makeMember(w.guild);
    trackSpam(makeUserMessage(w.channel, m, 'hi'), t0);
  }
  assert.equal(tracker.size, 200);
  // عضو واحد يرسل كثير: السجل محدود
  const busy = makeMember(w.guild);
  for (let k = 0; k < 300; k++) trackSpam(makeUserMessage(w.channel, busy, `m${k}`), t0 + k * 10000);
  assert.ok(tracker.get(`${w.guild.id}:${busy.id}`).hits.length <= 50);
  const removed = sweepTracker(t0 + cfg.spam.idleTtlMs + 1);
  assert.equal(removed, 200, 'الخاملين انشالوا');
  assert.equal(tracker.size, 1, 'بقي النشط فقط');
});

test('أوامر الحماية: تفعيل/تعطيل، الحالة، الاستثناءات، المخالفات والتصفير', async () => {
  const w = world();
  let i = cmd(w.guild, w.member, 'تعطيل_حماية_روابط');
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);

  i = cmd(w.guild, w.owner, 'تعطيل_حماية_روابط');
  await dispatch(i);
  assert.equal((await store.guildSettings.get(w.guild.id)).link_protection, false);
  i = cmd(w.guild, w.owner, 'تفعيل_حماية_روابط');
  await dispatch(i);
  assert.equal((await store.guildSettings.get(w.guild.id)).link_protection, true);
  i = cmd(w.guild, w.owner, 'تعطيل_حماية_سبام');
  await dispatch(i);
  i = cmd(w.guild, w.owner, 'تفعيل_حماية_سبام');
  await dispatch(i);
  assert.equal((await store.guildSettings.get(w.guild.id)).spam_protection, true);

  i = cmd(w.guild, w.owner, 'اضافة_رابط_مسموح', { 'رابط': 'https://www.YouTube.com/watch?v=1' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /youtube\.com/);
  i = cmd(w.guild, w.owner, 'اضافة_رابط_مسموح', { 'رابط': '3.5' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /نطاق صحيح/);
  const role = makeRole(w.guild, { name: 'ستريمر', position: 3 });
  i = cmd(w.guild, w.owner, 'استثناء_روابط', { 'رتبة': role });
  await dispatch(i);
  i = cmd(w.guild, w.owner, 'استثناء_قناة_روابط', { 'قناة': w.channel });
  await dispatch(i);
  let ex = await store.autoMod.exemptions(w.guild.id);
  assert.deepEqual(ex, { domains: ['youtube.com'], roles: [role.id], channels: [w.channel.id] });
  i = cmd(w.guild, w.owner, 'استثناء_قناة_روابط', { 'قناة': w.channel, 'ازالة': true });
  await dispatch(i);
  ex = await store.autoMod.exemptions(w.guild.id);
  assert.deepEqual(ex.channels, []);

  i = cmd(w.guild, w.owner, 'حالة_الحماية');
  await dispatch(i);
  const status = lastPayload(i).text;
  assert.match(status, /الروابط:\*\* 🟢 مفعّلة/);
  assert.match(status, /youtube\.com/);
  assert.match(status, /ehsmaha\.com/);
  assert.match(status, /10 دقائق/);

  // مخالفات وتصفير
  later();
  await send(w, w.member, 'https://bad.com');
  i = cmd(w.guild, w.owner, 'مخالفات_عضو', { 'عضو': w.member.user });
  await dispatch(i);
  let text = lastPayload(i).text;
  assert.match(text, /الروابط: \*\*1\*\*/);
  assert.match(text, /السبام: \*\*0\*\*/);
  assert.match(text, /🤖 تلقائي/);
  i = cmd(w.guild, w.owner, 'تصفير_مخالفات', { 'عضو': w.member.user, 'نوع': 'link' });
  await dispatch(i);
  assert.equal((await store.autoMod.get(w.guild.id, w.member.id)).link.count, 0);
});

// =================== 4) الحفظ الدائم (SQLite ← Firestore عبر الـAPI) ===================

test('الحفظ الدائم: استرجاع عند الإقلاع، رفع بعد التعديل، ونسخة قديمة تتوقف (409)', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-backup-'));
  t.after(() => {
    stateBackup._reset();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  // نسخة محفوظة "سحابياً" فيها رتبة دعم
  const seedFile = path.join(dir, 'seed.sqlite');
  const seed = new Database(seedFile);
  seed.exec("CREATE TABLE guild_config (guild_id TEXT, key TEXT, value TEXT); INSERT INTO guild_config VALUES ('g','support_roles','[\"123\"]')");
  const seedBuf = seed.serialize();
  seed.close();
  const crypto = require('node:crypto');
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

  const saved = [];
  let failClaims = 2;
  const fakeApi = {
    async claimBotState(bootAt) {
      assert.ok(bootAt > 0);
      if (failClaims-- > 0) throw Object.assign(new Error('asleep'), { code: 'TIMEOUT' });
      return { snapshot: { data: seedBuf.toString('base64'), sha256: sha(seedBuf), updatedAt: 1 } };
    },
    async saveBotState(p) {
      saved.push(p);
      if (saved.length === 3) throw Object.assign(new Error('stale'), { code: 'STALE_INSTANCE' });
      return { saved: true };
    }
  };
  const file = path.join(dir, 'bot.sqlite');
  fs.writeFileSync(file, 'garbage from old disk');
  let live;
  stateBackup.configure({ api: fakeApi, getBuffer: () => live.serialize(), bootAt: 1000 });
  const sleeps = [];
  const res = await stateBackup.restore(file, { sleep: async (ms) => sleeps.push(ms) });
  assert.equal(res.restored, true);
  assert.equal(sleeps.length, 2, 'أعاد المحاولة لين صحى الـAPI');
  live = new Database(file);
  assert.equal(live.prepare('SELECT value FROM guild_config').get().value, '["123"]', 'البيانات رجعت');

  // بدون تعديل: ما يرفع شي (نفس البصمة)
  assert.equal(await stateBackup.flush(), false);
  // تعديل ← رفع
  live.prepare("INSERT INTO guild_config VALUES ('g','x','1')").run();
  stateBackup.markDirty();
  assert.equal(await stateBackup.flush(), true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].bootAt, 1000);
  assert.equal(Buffer.from(saved[0].data, 'base64').length > 0, true);
  // تعديل ثاني ← رفع
  live.prepare("INSERT INTO guild_config VALUES ('g','y','2')").run();
  stateBackup.markDirty();
  await stateBackup.flush();
  // الثالث يرجع 409 ← يتوقف نهائياً
  live.prepare("INSERT INTO guild_config VALUES ('g','z','3')").run();
  stateBackup.markDirty();
  await stateBackup.flush();
  assert.equal(stateBackup.isActive(), false);
  live.prepare("INSERT INTO guild_config VALUES ('g','w','4')").run();
  stateBackup.markDirty();
  await stateBackup.flush();
  assert.equal(saved.length, 3, 'ما رفع بعد ما صار قديم');
  live.close();

  // التفعيل التلقائي
  assert.equal(stateBackup.shouldEnable({ databaseUrl: null }, { RENDER: 'true' }), true);
  assert.equal(stateBackup.shouldEnable({ databaseUrl: 'postgres://x' }, { RENDER: 'true' }), false);
  assert.equal(stateBackup.shouldEnable({ databaseUrl: null }, {}), false);
  assert.equal(stateBackup.shouldEnable({ databaseUrl: null }, { RENDER: 'true', BOT_STATE_BACKUP: 'off' }), false);
});

test('الحفظ الدائم: الـAPI ما رد وقت الإقلاع ← البوت يشتغل بعد المهلة، والاسترجاع يكمل بالخلفية بدون ما يمسح المحفوظ', async (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const crypto = require('node:crypto');
  const Database = require('better-sqlite3');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-recovery-'));
  t.after(() => {
    stateBackup._reset();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const seed = new Database(':memory:');
  seed.exec("CREATE TABLE guild_config (guild_id TEXT, key TEXT, value TEXT); INSERT INTO guild_config VALUES ('g','support_roles','[\"999\"]')");
  const seedBuf = seed.serialize();
  seed.close();

  let apiUp = false;
  const saved = [];
  const fakeApi = {
    async claimBotState() {
      if (!apiUp) throw Object.assign(new Error('Not Found'), { code: 'NOT_FOUND', status: 404 });
      return { snapshot: { data: seedBuf.toString('base64'), sha256: crypto.createHash('sha256').update(seedBuf).digest('hex') } };
    },
    async saveBotState(p) {
      saved.push(p);
      return { saved: true };
    }
  };
  const file = path.join(dir, 'bot.sqlite');
  let live = null;
  stateBackup.configure({ api: fakeApi, getBuffer: () => live.serialize(), bootAt: 5 });

  // ساعة وهمية: كل انتظار يقدّم الوقت
  let clock = 0;
  const res = await stateBackup.restore(file, { now: () => clock, sleep: async (ms) => { clock += ms; }, deadlineMs: 90_000 });
  assert.equal(res.degraded, true, 'ما علّق للأبد');
  assert.equal(stateBackup.isActive(), false);
  assert.equal(stateBackup.status().lastError, 'NOT_FOUND', 'السبب واضح للتشخيص');

  // البوت يشتغل بقاعدة محلية ويكتب — الرفع موقوف (ما يمسح المحفوظ)
  live = new Database(file);
  live.exec('CREATE TABLE guild_config (guild_id TEXT, key TEXT, value TEXT)');
  live.prepare("INSERT INTO guild_config VALUES ('g','tmp','1')").run();
  stateBackup.markDirty();
  assert.equal(await stateBackup.flush(), false);
  assert.equal(saved.length, 0, 'ما رفع قاعدة ناقصة فوق المحفوظة');

  // الـAPI رجع ← الاسترجاع بالخلفية يبدّل القاعدة بالمحفوظة
  let swapped = 0;
  const tick = stateBackup.startRecovery({
    file,
    intervalMs: 3_600_000,
    swap: async (writeFile) => {
      live.close();
      writeFile();
      live = new Database(file);
      swapped += 1;
    }
  });
  await tick(); // ما زال طايح
  assert.equal(swapped, 0);
  apiUp = true;
  await tick();
  assert.equal(swapped, 1);
  assert.equal(live.prepare("SELECT value FROM guild_config WHERE key = 'support_roles'").get().value, '["999"]', 'الإعدادات المحفوظة رجعت');
  assert.equal(stateBackup.isActive(), true);
  // الحين الرفع شغال
  live.prepare("INSERT INTO guild_config VALUES ('g','after','1')").run();
  stateBackup.markDirty();
  assert.equal(await stateBackup.flush(), true);
  assert.equal(saved.length, 1);
  live.close();
});
