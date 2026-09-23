'use strict';

// الردود التلقائية: اللوحة، النافذة، الإضافة/الحذف، والرد الفعلي على الرسائل.

const test = require('node:test');
const assert = require('node:assert/strict');
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
const messageEvent = require('../events/messageCreate');
const autoReply = require('../services/autoReply');
const autoMod = require('../services/autoMod');

let ctx;
const dispatch = (i) => handler.execute(ctx, i);

test.before(async () => {
  await botDb.init(process.env.TEST_DATABASE_URL ? { databaseUrl: process.env.TEST_DATABASE_URL } : { sqlitePath: ':memory:' });
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
test.after(async () => {
  autoMod.stopSweeper();
  if (process.env.TEST_DATABASE_URL) {
    await botDb.run('DROP TABLE IF EXISTS tickets, ticket_panels, warnings, moderation_log, bot_admin_config, guild_config, guild_settings, auto_mod_violations, auto_mod_exemptions, auto_replies, schema_migrations');
  }
  await botDb.close();
});

function world() {
  const guild = makeGuild();
  const modRole = makeRole(guild, { name: 'مشرف', position: 20 });
  const mod = makeMember(guild, { username: 'mod', roles: [modRole] });
  const member = makeMember(guild, { username: 'player' });
  const channel = makeChannel(guild, { name: 'عام' });
  return { guild, mod, member, channel, owner: guild.owner };
}

const say = async (w, member, content, channel = w.channel) => {
  autoMod._internal.tracker.clear(); // الاختبار يرسل رسائل كثيرة ورا بعض — نعزله عن كشف السبام
  const msg = makeUserMessage(channel, member, content);
  await messageEvent.execute(ctx, msg);
  return w.guild.log.filter(([t, , id]) => t === 'messageReply' && id === msg.id).map(([, , , p]) => p);
};
const panelText = (i) => lastPayload(i).text;
const button = (w, who, id) => makeInteraction({ guild: w.guild, member: who, kind: 'button', customId: id });
const modal = (w, who, type, trigger, response) =>
  makeInteraction({ guild: w.guild, member: who, kind: 'modal', customId: `ar:modal:${type}`, fields: { trigger, response } });

test('الردود التلقائية: اللوحة ← نافذة بنص الشاشة ← حفظ ← البوت يرد فعلاً ← حذف', async () => {
  const w = world();

  // غير الإدارة مرفوض (الأمر والأزرار)
  let i = makeInteraction({ guild: w.guild, member: w.member, commandName: 'الردود_التلقائية' });
  await dispatch(i);
  assert.match(panelText(i), /غير مصرّح/);
  i = button(w, w.member, 'ar:add:exact');
  await dispatch(i);
  assert.match(panelText(i), /غير مصرّح/);
  i = modal(w, w.member, 'exact', 'x', 'y');
  await dispatch(i);
  assert.match(panelText(i), /غير مصرّح/);
  assert.equal((await store.autoReplies.list(w.guild.id)).length, 0);

  // اللوحة (رسالة مخفية) بأزرار الإضافة والحذف
  i = makeInteraction({ guild: w.guild, member: w.owner, commandName: 'الردود_التلقائية' });
  await dispatch(i);
  let out = lastPayload(i);
  assert.match(out.text, /الردود التلقائية \(0\//);
  const ids = out.components[0].components.map((c) => c.custom_id);
  assert.deepEqual(ids, ['ar:add:exact', 'ar:add:contains', 'ar:del:0', 'ar:refresh']);
  assert.equal(out.components[0].components[2].disabled, true, 'الحذف معطّل والقائمة فاضية');

  // ➕ ← نافذة (Modal) فيها خانة الكلمة وخانة الرد
  i = button(w, w.owner, 'ar:add:exact');
  await dispatch(i);
  const shown = i.log.find(([t]) => t === 'showModal')[1];
  assert.equal(shown.custom_id, 'ar:modal:exact');
  assert.deepEqual(shown.components.map((r) => r.components[0].custom_id), ['trigger', 'response']);

  // إرسال النافذة ← انحفظ واللوحة تتحدث
  i = modal(w, w.owner, 'exact', 'السلام عليكم', 'وعليكم السلام ورحمة الله {يوزر} 🌹');
  await dispatch(i);
  out = lastPayload(i);
  assert.equal(out.type, 'update', 'حدّث نفس اللوحة');
  assert.match(out.text, /تمت الإضافة/);
  assert.match(out.text, /السلام عليكم/);
  i = modal(w, w.owner, 'contains', 'احسمها', 'العب على ehsmaha.com 👑');
  await dispatch(i);
  assert.match(lastPayload(i).text, /الردود التلقائية \(2\//);
  // تكرار نفس الكلمة (حتى بتشكيل مختلف) مرفوض
  i = modal(w, w.owner, 'exact', 'السَّلامُ عليكم', 'رد ثاني');
  await dispatch(i);
  assert.match(lastPayload(i).text, /مضافة من قبل/);
  assert.equal((await store.autoReplies.list(w.guild.id)).length, 2);

  // البوت يرد فعلاً على الأعضاء
  let replies = await say(w, w.member, 'السَّلامُ عليكم!!');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].content, `وعليكم السلام ورحمة الله <@${w.member.id}> 🌹`);
  assert.deepEqual(replies[0].allowedMentions, { users: [w.member.id], repliedUser: false });
  assert.equal((await say(w, w.member, 'السلام عليكم يا شباب')).length, 0, 'مطابق = الرسالة كاملة فقط');
  replies = await say(w, w.mod, 'وش هو موقع أحسمها؟');
  assert.equal(replies[0].content, 'العب على ehsmaha.com 👑', 'يحتوي + توحيد الهمزات');
  assert.equal((await say(w, w.member, 'احسمهاااا')).length, 0, 'كلمة كاملة بس');

  // مهلة 5 ثوانٍ لنفس الرد بنفس القناة (ما يغرق الشات)
  assert.equal((await say(w, w.member, 'السلام عليكم')).length, 0);
  const other = makeChannel(w.guild, { name: 'ثانية' });
  assert.equal((await say(w, w.member, 'السلام عليكم', other)).length, 1, 'قناة ثانية تشتغل');

  // البوتات ما ينرد عليها
  const bot = makeMember(w.guild, { bot: true });
  assert.equal((await say(w, bot, 'السلام عليكم', makeChannel(w.guild))).length, 0);

  // رسالة انحذفت بالحماية (رابط) ما ينرد عليها
  autoMod._internal.recentPunish.clear();
  assert.equal((await say(w, w.member, 'https://spam.com احسمها', makeChannel(w.guild))).length, 0);

  // 🗑️ حذف ← قائمة اختيار ← انحذف والبوت ما يرد بعدها
  i = button(w, w.owner, 'ar:del:0');
  await dispatch(i);
  out = lastPayload(i);
  const select = out.components[1].components[0];
  assert.equal(select.custom_id, 'ar:delsel:0');
  assert.equal(select.options.length, 2);
  const salamId = select.options.find((o) => o.label === 'السلام عليكم').value;
  i = makeInteraction({ guild: w.guild, member: w.owner, kind: 'select', customId: 'ar:delsel:0', values: [salamId] });
  await dispatch(i);
  assert.match(lastPayload(i).text, /انحذف: \*\*السلام عليكم\*\*/);
  assert.match(lastPayload(i).text, /الردود التلقائية \(1\//);
  assert.equal((await say(w, w.member, 'السلام عليكم', makeChannel(w.guild))).length, 0, 'ما عاد يرد');
  assert.equal((await say(w, w.member, 'احسمها', makeChannel(w.guild))).length, 1, 'الباقي شغال');

  // الرتبة الإدارية تقدر تدير الردود
  await store.adminConfig.add(w.guild.id, 'role', w.mod.roles.cache.find((r) => r.name === 'مشرف').id, 'x');
  require('../utils/adminPermissions').invalidate(w.guild.id);
  i = button(w, w.mod, 'ar:refresh');
  await dispatch(i);
  assert.match(lastPayload(i).text, /الردود التلقائية \(1\//);
});

test('الردود التلقائية: بعد إعادة تشغيل البوت (مسح الكاش) الردود باقية، وتنبيه الـIntent', async () => {
  const w = world();
  await store.autoReplies.add({ guildId: w.guild.id, trigger: 'هلا', triggerNorm: autoReply.normalize('هلا'), response: 'هلا والله', matchType: 'exact', createdBy: 'x' });
  autoReply._internal.cache.clear();
  assert.equal((await say(w, w.member, 'هلا'))[0].content, 'هلا والله');

  ctx.messageContentIntent = false;
  try {
    const i = makeInteraction({ guild: w.guild, member: w.owner, commandName: 'الردود_التلقائية' });
    await dispatch(i);
    assert.match(lastPayload(i).text, /Message Content Intent/);
  } finally {
    ctx.messageContentIntent = true;
  }
});

test('الردود التلقائية: التطبيع', () => {
  const n = autoReply.normalize;
  assert.equal(n('  السَّلامُ   عليكم!! '), n('السلام عليكم'));
  assert.equal(n('إحسمها'), n('احسمها'));
  assert.equal(n('مرحبا'), n('مرحبا'));
  assert.equal(n('HeLLo'), 'hello');
  assert.equal(n('مدرسة'), n('مدرسه'));
  assert.equal(n('على'), n('علي'));
});
