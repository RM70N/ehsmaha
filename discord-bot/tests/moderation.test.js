'use strict';

// اختبار الأوامر الإدارية كاملة عبر الموزّع الحقيقي (interactionCreate) مع
// قاعدة بيانات SQLite حقيقية (بالذاكرة) ومحاكاة سيرفر ديسكورد (tests/helpers).
// لكل أمر: تنفيذ ناجح، صلاحيات ناقصة (المشرف أو البوت)، وخطأ تقني بدون Crash.

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits, ChannelType } = require('discord.js');
const { makeGuild, makeRole, makeMember, makeChannel, makeMessage, makeInteraction, lastPayload } = require('./helpers/discordMock');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  COMMAND_COOLDOWN_MS: '0',
  BUTTON_COOLDOWN_MS: '0',
  LOG_LEVEL: 'error',
  TICKET_CLOSE_MODE: 'archive'
});

const botDb = require('../database/botDb');
const store = require('../database/botStore');
const { loadConfig } = require('../config');
const { loadCommands } = require('../utils/commandLoader');
const handler = require('../events/interactionCreate');
const adminPerms = require('../utils/adminPermissions');

let ctx;
const dispatch = (i) => handler.execute(ctx, i);
const cmd = (guild, member, commandName, options = {}) => makeInteraction({ guild, member, commandName, options });
const isEphemeral = (i) => i.log.some(([t, p]) => (t === 'deferReply' || t === 'reply') && p && p.flags && (Number(p.flags) & 64));

test.before(async () => {
  await botDb.init(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { sqlitePath: ':memory:' });
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true };
});
test.after(async () => {
  if (process.env.TEST_DATABASE_URL) {
    await botDb.run('DROP TABLE IF EXISTS tickets, ticket_panels, warnings, moderation_log, bot_admin_config, guild_config, schema_migrations');
  }
  await botDb.close();
});

// سيرفر جديد لكل اختبار: مالك + رتبة "مشرف" (ليست Administrator) + عضو عادي
function world(opts) {
  const guild = makeGuild(opts);
  const modRole = makeRole(guild, { name: 'مشرف', position: 20 });
  const mod = makeMember(guild, { username: 'mod', roles: [modRole] });
  const regular = makeMember(guild, { username: 'regular' });
  const target = makeMember(guild, { username: 'target' });
  return { guild, modRole, mod, regular, target, owner: guild.owner };
}

// =================== 1) نظام صلاحيات الأدمن ===================

test('الصلاحيات: عضو عادي مرفوض، إضافة رتبة إدارية تفعّل فوراً (invalidate on write)، وأدمن الرتبة ما يقدر يصعّد', async () => {
  const w = world();
  // قبل الإضافة: المشرف مرفوض (والنتيجة تنخزن بالكاش)
  let i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 5, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);
  assert.ok(isEphemeral(i));
  assert.equal(w.guild.log.filter(([t]) => t === 'timeout').length, 0);

  // المالك يضيف رتبة المشرف كرتبة إدارية
  i = cmd(w.guild, w.owner, 'اضافة_رتبة_ادارية', { 'رتبة': w.modRole });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تمت إضافة/);

  // مباشرة بعدها (بدون انتظار انتهاء الكاش) المشرف مسموح
  i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 5, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم الكتم/);

  // أدمن عبر الرتبة يحاول يدير صلاحيات الأدمن → مرفوض (منع التصعيد)
  for (const [name, opt] of [['اضافة_ادمن', { 'عضو': w.regular }], ['اضافة_رتبة_ادارية', { 'رتبة': w.modRole }], ['ازالة_ادمن', { 'عضو': w.regular }], ['ازالة_رتبة_ادارية', { 'رتبة': w.modRole }]]) {
    i = cmd(w.guild, w.mod, name, opt);
    await dispatch(i);
    assert.match(lastPayload(i).text, /Administrator/, name);
  }

  // مكرر → رسالة واضحة، @everyone مرفوضة، إزالة ثم رفض من جديد
  i = cmd(w.guild, w.owner, 'اضافة_رتبة_ادارية', { 'رتبة': w.modRole });
  await dispatch(i);
  assert.match(lastPayload(i).text, /مضافة مسبقاً/);
  i = cmd(w.guild, w.owner, 'اضافة_رتبة_ادارية', { 'رتبة': w.guild.roles.everyone });
  await dispatch(i);
  assert.match(lastPayload(i).text, /everyone/);
  i = cmd(w.guild, w.owner, 'ازالة_رتبة_ادارية', { 'رتبة': w.modRole });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تمت إزالة/);
  assert.equal((await adminPerms.checkAdminPermission(w.mod)).allowed, false);
});

test('الصلاحيات: ترتيب التحقق Administrator ← admin_users ← admin_roles', async () => {
  const w = world();
  const adminRole = makeRole(w.guild, { name: 'أدمن', position: 30, permissions: [PermissionFlagsBits.Administrator] });
  const realAdmin = makeMember(w.guild, { roles: [adminRole] });
  assert.deepEqual(await adminPerms.checkAdminPermission(realAdmin), { allowed: true, via: 'administrator' });
  assert.deepEqual(await adminPerms.checkAdminPermission(w.owner), { allowed: true, via: 'owner' });

  let i = cmd(w.guild, realAdmin, 'اضافة_ادمن', { 'عضو': w.regular });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تمت إضافة/);
  assert.deepEqual(await adminPerms.checkAdminPermission(w.regular), { allowed: true, via: 'user' });

  i = cmd(w.guild, realAdmin, 'اضافة_ادمن', { 'عضو': w.guild.members.me });
  await dispatch(i);
  assert.match(lastPayload(i).text, /بوت/);

  i = cmd(w.guild, realAdmin, 'ازالة_ادمن', { 'عضو': w.regular });
  await dispatch(i);
  assert.equal((await adminPerms.checkAdminPermission(w.regular)).allowed, false);
});

// =================== 2) /كتم ===================

async function makeAdminWorld(opts) {
  const w = world(opts);
  await store.adminConfig.add(w.guild.id, 'role', w.modRole.id, w.owner.id);
  adminPerms.invalidate(w.guild.id);
  return w;
}

test('/كتم: تحويل دقيق للمدة + DM + سجل الإشراف', async () => {
  const w = await makeAdminWorld();
  const i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 2, 'الوحدة': 'hours', 'السبب': 'سبام' });
  await dispatch(i);
  const [, , ms, reason] = w.guild.log.find(([t]) => t === 'timeout');
  assert.equal(ms, 2 * 60 * 60 * 1000);
  assert.match(reason, /سبام/);
  assert.ok(w.guild.log.some(([t, id]) => t === 'dm' && id === w.target.id));
  const out = lastPayload(i);
  assert.match(out.text, /ساعة/);
  assert.doesNotMatch(out.text, /تعذر إرسال إشعار/);
  const logs = await store.moderationLog.recent(w.guild.id);
  assert.equal(logs[0].action, 'mute');
  assert.equal(logs[0].target_id, w.target.id);
});

test('/كتم: تجاوز 28 يوم يوضّح الحد لكل وحدة ولا ينفّذ، و672 ساعة مقبولة', async () => {
  const w = await makeAdminWorld();
  for (const [amount, unit, max] of [[673, 'hours', '672'], [40321, 'minutes', '40,320'], [2419201, 'seconds', '2,419,200']]) {
    const i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': amount, 'الوحدة': unit });
    await dispatch(i);
    const t = lastPayload(i).text;
    assert.match(t, /28 يوم/);
    assert.match(t, new RegExp(max));
    assert.match(t, /أعد تنفيذ الأمر بمدة أقل/);
  }
  assert.equal(w.guild.log.filter(([t]) => t === 'timeout').length, 0);
  const ok = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 672, 'الوحدة': 'hours' });
  await dispatch(ok);
  assert.equal(w.guild.log.find(([t]) => t === 'timeout')[2], 2419200000);

  const zero = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 0, 'الوحدة': 'hours' });
  await dispatch(zero);
  assert.match(lastPayload(zero).text, /أكبر من صفر/);
});

test('/كتم: رتبة البوت أقل، عضو Administrator، صلاحية البوت ناقصة، DM مغلق، وخطأ تقني', async () => {
  const w = await makeAdminWorld();
  const high = makeRole(w.guild, { name: 'كبير', position: 60 });
  const bigMember = makeMember(w.guild, { roles: [high] });
  let i = cmd(w.guild, w.owner, 'كتم', { 'عضو': bigMember, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /رتبة البوت/);

  const adminRole = makeRole(w.guild, { name: 'admin', position: 10, permissions: [PermissionFlagsBits.Administrator] });
  const adm = makeMember(w.guild, { roles: [adminRole] });
  i = cmd(w.guild, w.owner, 'كتم', { 'عضو': adm, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /Administrator/);

  // المشرف ما يقدر يكتم شخص أعلى منه أو يساويه
  const peer = makeMember(w.guild, { roles: [w.modRole] });
  i = cmd(w.guild, w.mod, 'كتم', { 'عضو': peer, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /أعلى من رتبتك أو تساويها/);

  const closed = makeMember(w.guild, { dmOpen: false });
  i = cmd(w.guild, w.mod, 'كتم', { 'عضو': closed, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تعذر إرسال إشعار خاص للعضو/);
  assert.match(lastPayload(i).text, /تم الكتم/);

  w.guild.failNext = 'timeout';
  i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تعذّر تنفيذ الكتم/);

  const w2 = await makeAdminWorld({ botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
  i = cmd(w2.guild, w2.mod, 'كتم', { 'عضو': w2.target, 'المدة': 1, 'الوحدة': 'minutes' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /كتم الأعضاء مؤقتاً \(Timeout Members\)/);
});

// =================== 3) /طرد ===================

test('/طرد: DM قبل الطرد، فحوصات الرتب وkickable، والصلاحية الناقصة', async () => {
  const w = await makeAdminWorld();
  let i = cmd(w.guild, w.mod, 'طرد', { 'عضو': w.target, 'سبب': 'مخالفة القوانين' });
  await dispatch(i);
  const order = w.guild.log.filter(([t, id]) => (t === 'dm' || t === 'kick') && id === w.target.id).map(([t]) => t);
  assert.deepEqual(order, ['dm', 'kick']);
  assert.match(lastPayload(i).text, /تم الطرد/);
  assert.equal((await store.moderationLog.recent(w.guild.id))[0].action, 'kick');

  const high = makeRole(w.guild, { name: 'كبير', position: 60 });
  const big = makeMember(w.guild, { roles: [high] });
  i = cmd(w.guild, w.owner, 'طرد', { 'عضو': big, 'سبب': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /رتبة البوت/);
  assert.ok(w.guild.members.cache.has(big.id));

  i = cmd(w.guild, w.mod, 'طرد', { 'عضو': w.owner, 'سبب': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /مالك السيرفر/);

  const closed = makeMember(w.guild, { dmOpen: false });
  i = cmd(w.guild, w.mod, 'طرد', { 'عضو': closed, 'سبب': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تعذر إرسال إشعار خاص/);

  const w2 = await makeAdminWorld({ botPerms: [PermissionFlagsBits.ViewChannel] });
  i = cmd(w2.guild, w2.mod, 'طرد', { 'عضو': w2.target, 'سبب': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /طرد الأعضاء \(Kick Members\)/);

  i = cmd(w2.guild, w2.regular, 'طرد', { 'عضو': w2.target, 'سبب': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);
});

// =================== 4) /تحذير + السجل + الحذف ===================

test('/تحذير: إنشاء الرتب تلقائياً، إزالة القديمة قبل منح الجديدة، والعدّ الفعلي', async () => {
  const w = await makeAdminWorld();
  let i = cmd(w.guild, w.mod, 'تحذير', { 'عضو': w.target, 'سبب': 'ألفاظ', 'رتبة_التحذير': 'w1' });
  await dispatch(i);
  let out = lastPayload(i);
  assert.match(out.text, /تحذير1/);
  assert.match(out.text, /\*\*1\*\* تحذير/);
  assert.match(out.text, /أُنشئت تلقائياً رتب: تحذير1، تحذير2، تحذير3/);
  const names = () => [...w.target.roles.cache.values()].map((r) => r.name).filter((n) => n.startsWith('تحذير'));
  assert.deepEqual(names(), ['تحذير1']);

  // المشرف يختار تحذير3 (مع إن الفعلي 2) → تنشال تحذير1 أولاً ثم تنعطى تحذير3
  w.guild.log.length = 0;
  i = cmd(w.guild, w.mod, 'تحذير', { 'عضو': w.target, 'سبب': 'تكرار', 'رتبة_التحذير': 'w3' });
  await dispatch(i);
  out = lastPayload(i);
  const ops = w.guild.log.filter(([t]) => t.startsWith('roles.')).map(([t, , r]) => `${t}:${r.join(',')}`);
  assert.deepEqual(ops, ['roles.remove:تحذير1', 'roles.add:تحذير3']);
  assert.deepEqual(names(), ['تحذير3']);
  assert.match(out.text, /\*\*2\*\* تحذير/);
  assert.match(out.text, /لا تطابق العدد الفعلي/);
  // ولا لحظة كان عنده رتبتا تحذير سوا
  for (const [, roles] of w.guild.roleSnapshots) assert.ok(roles.filter((n) => n.startsWith('تحذير')).length <= 1);

  // نفس الرتبة مرة ثانية: ما فيه إزالة ولا إضافة، والعدد 3
  w.guild.log.length = 0;
  i = cmd(w.guild, w.mod, 'تحذير', { 'عضو': w.target, 'سبب': 'ثالث', 'رتبة_التحذير': 'w3' });
  await dispatch(i);
  assert.equal(w.guild.log.filter(([t]) => t.startsWith('roles.')).length, 0);
  assert.match(lastPayload(i).text, /\*\*3\*\* تحذير/);
  assert.equal(await store.warnings.count(w.guild.id, w.target.id), 3);
});

test('/تحذير: فشل تعديل الرتب يبقي التحذير مسجلاً مع ملاحظة، ونقص صلاحية إدارة الرتب', async () => {
  const w = await makeAdminWorld();
  w.guild.failNext = 'roles.add';
  const i = cmd(w.guild, w.mod, 'تحذير', { 'عضو': w.target, 'سبب': 'x', 'رتبة_التحذير': 'w1' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تعذّر تعديل رتب العضو/);
  assert.equal(await store.warnings.count(w.guild.id, w.target.id), 1);

  const w2 = await makeAdminWorld({ botPerms: [PermissionFlagsBits.ViewChannel] });
  const i2 = cmd(w2.guild, w2.mod, 'تحذير', { 'عضو': w2.target, 'سبب': 'x', 'رتبة_التحذير': 'w1' });
  await dispatch(i2);
  assert.match(lastPayload(i2).text, /إدارة الرتب \(Manage Roles\)/);
  assert.equal(await store.warnings.count(w2.guild.id, w2.target.id), 0);
});

test('/سجل_تحذيرات: الأحدث أولاً + صفحات، و/حذف_تحذير يصحّح العدد', async () => {
  const w = await makeAdminWorld();
  for (let k = 1; k <= 12; k++) {
    await store.warnings.add({ guildId: w.guild.id, discordId: w.target.id, reason: `سبب ${k}`, role: 'تحذير1', issuedBy: w.mod.id });
    await new Promise((r) => setTimeout(r, 2));
  }
  let i = cmd(w.guild, w.mod, 'سجل_تحذيرات', { 'عضو': w.target });
  await dispatch(i);
  let out = lastPayload(i);
  assert.match(out.text, /العدد الكلي: \*\*12\*\*/);
  assert.equal(out.embeds[0].fields[0].name.startsWith('#12'), true);
  assert.equal(out.embeds[0].fields.length, 10);
  const next = out.components[0].components[2];

  const click = makeInteraction({ guild: w.guild, member: w.mod, kind: 'button', customId: next.custom_id });
  await dispatch(click);
  out = lastPayload(click);
  assert.deepEqual(out.embeds[0].fields.map((f) => f.name.split(' ')[0]), ['#2', '#1']);

  i = cmd(w.guild, w.mod, 'حذف_تحذير', { 'عضو': w.target, 'رقم_التحذير': 2 });
  await dispatch(i);
  assert.match(lastPayload(i).text, /سبب 2/);
  assert.match(lastPayload(i).text, /\*\*11\*\* تحذير/);
  assert.equal(await store.warnings.count(w.guild.id, w.target.id), 11);

  i = cmd(w.guild, w.mod, 'حذف_تحذير', { 'عضو': w.target, 'رقم_التحذير': 40 });
  await dispatch(i);
  assert.match(lastPayload(i).text, /ما فيه تحذير رقم \*\*40\*\*/);

  i = cmd(w.guild, w.regular, 'سجل_تحذيرات', { 'عضو': w.target });
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);
});

// =================== 5) /مسح ===================

test('/مسح: دفعات ≤100 مع تأخير، الرسائل الأقدم من 14 يوم تنعدّ بشكل منفصل', async () => {
  const w = await makeAdminWorld();
  const ch = makeChannel(w.guild, { name: 'العام' });
  const DAY = 24 * 60 * 60 * 1000;
  for (let k = 0; k < 180; k++) ch.messagesStore.push(makeMessage(ch, { ageMs: k * 1000 }));
  ch.messagesStore.push(makeMessage(ch, { ageMs: 181000, system: true }));
  for (let k = 0; k < 69; k++) ch.messagesStore.push(makeMessage(ch, { ageMs: 15 * DAY + k }));

  const i = cmd(w.guild, w.mod, 'مسح', { 'قناة': ch, 'عدد': 250 });
  await dispatch(i);
  const out = lastPayload(i).text;
  assert.match(out, /تم حذف \*\*180\*\* رسالة من أصل \*\*250\*\*/);
  assert.match(out, /69 رسالة أقدم من 14 يوم/);
  assert.match(out, /1 رسالة نظام غير قابلة للحذف/);
  const bulks = w.guild.log.filter(([t]) => t === 'bulkDelete');
  assert.ok(bulks.every(([, , n]) => n <= 100));
  assert.equal(bulks.reduce((s, [, , n]) => s + n, 0), 180);
  const fetches = w.guild.log.filter(([t]) => t === 'fetch').map(([, , limit]) => limit);
  assert.deepEqual(fetches, [100, 100, 50]);
  assert.ok(bulks.length >= 2 && bulks[1][4] - bulks[0][4] >= 450, 'تأخير بين الدفعات');
  const log = (await store.moderationLog.recent(w.guild.id))[0];
  assert.equal(log.action, 'purge');
  assert.equal(JSON.parse(log.details).deleted, 180);
  assert.ok(isEphemeral(i));
});

test('/مسح: قناة فيها رسائل أقل، رفض ديسكورد 50034، وصلاحية ناقصة بالقناة', async () => {
  const w = await makeAdminWorld();
  const ch = makeChannel(w.guild);
  for (let k = 0; k < 30; k++) ch.messagesStore.push(makeMessage(ch, { ageMs: k }));
  let i = cmd(w.guild, w.mod, 'مسح', { 'قناة': ch, 'عدد': 500 });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم حذف \*\*30\*\* رسالة من أصل \*\*500\*\*/);
  assert.match(lastPayload(i).text, /القناة ما فيها غير 30 رسالة/);

  const ch2 = makeChannel(w.guild);
  for (let k = 0; k < 5; k++) ch2.messagesStore.push(makeMessage(ch2, { ageMs: k }));
  w.guild.bulkTooOld = true;
  i = cmd(w.guild, w.mod, 'مسح', { 'قناة': ch2, 'عدد': 5 });
  await dispatch(i);
  assert.match(lastPayload(i).text, /5 رسالة أقدم من 14 يوم/);

  const locked = makeChannel(w.guild, { botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] });
  i = cmd(w.guild, w.mod, 'مسح', { 'قناة': locked, 'عدد': 10 });
  await dispatch(i);
  assert.match(lastPayload(i).text, /إدارة الرسائل \(Manage Messages\)/);
});

// =================== 6) التكتات ===================

test('التكتات: لوحة → فتح → سبب → روم بصلاحيات دقيقة → منع التكرار → إغلاق بتأكيد (بعد "إعادة تشغيل")', async () => {
  const w = await makeAdminWorld();
  const supportRole = makeRole(w.guild, { name: 'الدعم', position: 15 });
  const supporter = makeMember(w.guild, { roles: [supportRole] });
  const panelChannel = makeChannel(w.guild, { name: 'الدعم', parentId: 'cat-support' });

  // رتب الدعم
  let i = cmd(w.guild, w.mod, 'اعداد_رتب_الدعم', { 'رتبة1': supportRole });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم حفظ رتب الدعم/);
  i = cmd(w.guild, w.mod, 'اعداد_رتب_الدعم', { 'رتبة1': w.guild.roles.everyone });
  await dispatch(i);
  assert.match(lastPayload(i).text, /everyone/);

  // نشر اللوحة
  i = cmd(w.guild, w.mod, 'دعم', { 'قناة': panelChannel, 'رسالة': 'عندك مشكلة؟\\nافتح تكت' });
  await dispatch(i);
  const sent = w.guild.log.find(([t, id]) => t === 'send' && id === panelChannel.id)[2];
  const openId = sent.components[0].toJSON().components[0].custom_id;
  assert.match(openId, /^tk:open:\d+$/);
  assert.match(JSON.stringify(sent.embeds[0].toJSON()), /عندك مشكلة؟\\nافتح تكت/);

  // فتح → قائمة أسباب
  const member = makeMember(w.guild, { username: 'أحمد علي!!' });
  i = makeInteraction({ guild: w.guild, member, kind: 'button', customId: openId });
  await dispatch(i);
  let out = lastPayload(i);
  const select = out.components[0].components[0];
  assert.match(select.custom_id, /^tk:reason:\d+$/);
  assert.equal(select.options.length, require('../config/ticketReasons').length);
  assert.ok(isEphemeral(i));

  // اختيار السبب → روم
  i = makeInteraction({ guild: w.guild, member, kind: 'select', customId: select.custom_id, values: ['account'] });
  await dispatch(i);
  out = lastPayload(i);
  assert.match(out.text, /تم فتح تكتك/);
  const created = w.guild.log.find(([t]) => t === 'createChannel');
  const opts = created[2];
  assert.equal(opts.name, 'دعم-أحمد-علي');
  assert.equal(opts.parent, 'cat-support');
  const ow = Object.fromEntries(opts.permissionOverwrites.map((o) => [o.id, o]));
  const has = (o, bit) => (o.allow || []).includes(bit);
  assert.deepEqual(ow[w.guild.id].deny, [PermissionFlagsBits.ViewChannel]);
  for (const id of [member.id, supportRole.id]) {
    for (const bit of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]) assert.ok(has(ow[id], bit), `${id} ${bit}`);
  }
  assert.ok(has(ow[w.guild.members.me.id], PermissionFlagsBits.ManageChannels));
  assert.equal(Object.keys(ow).length, 4); // @everyone + صاحب التكت + رتبة الدعم + البوت فقط
  const ticketChannelId = created[1];
  const welcome = w.guild.log.find(([t, id]) => t === 'send' && id === ticketChannelId)[2];
  assert.match(welcome.content, new RegExp(`<@${member.id}>`));
  assert.match(JSON.stringify(welcome.embeds[0].toJSON()), /مشكلة بالحساب/);
  const closeId = welcome.components[0].toJSON().components[0].custom_id;
  const ticketId = Number(closeId.split(':')[2]);
  assert.equal((await store.tickets.get(ticketId)).status, 'open');

  // محاولة تكت ثاني بنفس القناة الأصلية → مرفوض برابط التكت الحالي
  i = makeInteraction({ guild: w.guild, member, kind: 'button', customId: openId });
  await dispatch(i);
  assert.match(lastPayload(i).text, new RegExp(`لديك تكت مفتوح بالفعل هنا: <#${ticketChannelId}>`));
  i = makeInteraction({ guild: w.guild, member, kind: 'select', customId: select.custom_id, values: ['game'] });
  await dispatch(i);
  assert.match(lastPayload(i).text, /لديك تكت مفتوح بالفعل/);
  assert.equal(w.guild.log.filter(([t]) => t === 'createChannel').length, 1);

  // "إعادة تشغيل البوت": مسح كل كاش بالذاكرة — الأزرار تعتمد على customId + القاعدة فقط
  adminPerms.invalidate(w.guild.id);
  delete require.cache[require.resolve('../services/tickets')];

  // عضو غريب يحاول يغلق → مرفوض
  i = makeInteraction({ guild: w.guild, member: w.regular, kind: 'button', customId: closeId });
  await dispatch(i);
  assert.match(lastPayload(i).text, /غير مصرّح/);

  // الدعم يضغط إغلاق → تأكيد → إلغاء
  i = makeInteraction({ guild: w.guild, member: supporter, kind: 'button', customId: closeId });
  await dispatch(i);
  out = lastPayload(i);
  const [yes, no] = out.components[0].components;
  i = makeInteraction({ guild: w.guild, member: supporter, kind: 'button', customId: no.custom_id });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم إلغاء الإغلاق/);
  assert.equal((await store.tickets.get(ticketId)).status, 'open');

  // تأكيد → أرشفة
  i = makeInteraction({ guild: w.guild, member: supporter, kind: 'button', customId: yes.custom_id });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم إغلاق التكت/);
  const t = await store.tickets.get(ticketId);
  assert.equal(t.status, 'closed');
  assert.equal(t.closed_by, supporter.id);
  const archive = [...w.guild.channels.cache.values()].find((c) => c.name === 'تكتات مغلقة');
  assert.ok(archive, 'تصنيف الأرشيف انشأ');
  assert.equal(w.guild.channels.cache.get(ticketChannelId).parentId, archive.id);
  const locks = w.guild.log.filter(([tp, id]) => tp === 'overwrite' && id === ticketChannelId);
  assert.ok(locks.some(([, , target, perms]) => target === member.id && perms.SendMessages === false));

  // الضغط مرة ثانية على التأكيد → "مغلق مسبقاً"
  i = makeInteraction({ guild: w.guild, member: supporter, kind: 'button', customId: yes.custom_id });
  await dispatch(i);
  assert.match(lastPayload(i).text, /مغلق مسبقاً/);

  // بعد الإغلاق يقدر يفتح تكت جديد
  i = makeInteraction({ guild: w.guild, member, kind: 'select', customId: select.custom_id, values: ['store'] });
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم فتح تكتك/);
});

test('التكتات: قناة محذوفة يدوياً تُغلق تلقائياً، فشل إنشاء الروم يلغي الحجز، وصلاحيات البوت الناقصة', async () => {
  const w = await makeAdminWorld();
  const panelChannel = makeChannel(w.guild);
  const panelId = await store.tickets.createPanel({ guildId: w.guild.id, channelId: panelChannel.id, content: 'x', createdBy: w.owner.id });
  const member = makeMember(w.guild);
  const pick = (value) => makeInteraction({ guild: w.guild, member, kind: 'select', customId: `tk:reason:${panelId}`, values: [value] });

  let i = pick('account');
  await dispatch(i);
  const chId = w.guild.log.find(([t]) => t === 'createChannel')[1];
  await w.guild.channels.cache.get(chId).delete();
  i = pick('game');
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم فتح تكتك/, 'التكت اليتيم انقفل وانفتح جديد');

  const member2 = makeMember(w.guild);
  w.guild.failNext = 'createChannel';
  i = makeInteraction({ guild: w.guild, member: member2, kind: 'select', customId: `tk:reason:${panelId}`, values: ['account'] });
  await dispatch(i);
  assert.match(lastPayload(i).text, /إدارة القنوات/);
  assert.equal(await store.tickets.findOpen(w.guild.id, member2.id, panelChannel.id), null, 'الحجز انلغى');

  const w2 = await makeAdminWorld({ botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] });
  const ch2 = makeChannel(w2.guild);
  i = cmd(w2.guild, w2.mod, 'دعم', { 'قناة': ch2, 'رسالة': 'x' });
  await dispatch(i);
  assert.match(lastPayload(i).text, /إدارة القنوات \(Manage Channels\)/);
  assert.match(lastPayload(i).text, /إدارة الرتب \(Manage Roles\)/);
});

test('التكتات: تنظيف القنوات المعلّقة بوضع الحذف عند الإقلاع', async () => {
  const w = await makeAdminWorld();
  const ch = makeChannel(w.guild, { name: 'دعم-x' });
  const id = await store.tickets.reserve({ guildId: w.guild.id, panelId: 1, originChannelId: 'o', discordId: 'u1', reason: 'other' });
  await store.tickets.attachChannel(id, ch.id);
  await store.tickets.close(id, 'someone', 'delete');
  const tickets = require('../services/tickets');
  await tickets.sweepPendingDeletions({ guilds: { cache: new Map([[w.guild.id, w.guild]]) } });
  assert.ok(!w.guild.channels.cache.has(ch.id));
  assert.equal((await store.tickets.get(id)).channel_id, null);
});

// =================== 7) /عرض_الرتب ===================

test('/عرض_الرتب: ترتيب تنازلي، 🛡️ للرتب الإدارية، وعدد الأعضاء حسب الـIntent', async () => {
  const w = await makeAdminWorld();
  const i = cmd(w.guild, w.mod, 'عرض_الرتب');
  await dispatch(i);
  const d = lastPayload(i).embeds[0].description;
  const lines = d.split('\n').filter((l) => l.includes('<@&'));
  assert.ok(lines[0].includes(`<@&${w.guild.botRole.id}>`), 'رتبة البوت (50) أولاً');
  assert.ok(lines.some((l) => l.startsWith('🛡️') && l.includes(w.modRole.id) && l.includes('**1** عضو')));
  assert.ok(!d.includes(`<@&${w.guild.id}>`), '@everyone مستبعدة');

  ctx.membersIntent = false;
  const i2 = cmd(w.guild, w.mod, 'عرض_الرتب');
  await dispatch(i2);
  assert.match(lastPayload(i2).text, /Server Members Intent/);
  ctx.membersIntent = true;

  const i3 = cmd(w.guild, w.regular, 'عرض_الرتب');
  await dispatch(i3);
  assert.match(lastPayload(i3).text, /غير مصرّح/);
});

// =================== 8) قاعدة البيانات غير متاحة ===================

test('قاعدة البيانات طايحة: رسالة ودّية بدون Crash', async () => {
  const w = world();
  adminPerms.invalidate(w.guild.id);
  await botDb.close(); // نفس حالة فشل تشغيل القاعدة عند الإقلاع
  try {
    const i = cmd(w.guild, w.mod, 'كتم', { 'عضو': w.target, 'المدة': 1, 'الوحدة': 'minutes' });
    await dispatch(i);
    assert.match(lastPayload(i).text, /قاعدة بيانات البوت غير متاحة/);
    // أوامر اللاعبين (ما تعتمد على قاعدة البوت) تشتغل عادي
    const j = cmd(w.guild, w.regular, 'الموقع');
    await dispatch(j);
    assert.match(lastPayload(j).text, /تيك توك/);
  } finally {
    await botDb.init(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { sqlitePath: ':memory:' });
  }
});
