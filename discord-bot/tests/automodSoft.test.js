'use strict';

// الحماية الألطف: الضحك والإيموجي والملصقات ما تنحسب سبام، والعقوبة كتم كتابي بالروم (مو Timeout السيرفر) بمدد مخففة.

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { makeGuild, makeRole, makeMember, makeChannel, makeUserMessage } = require('./helpers/discordMock');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token', GEMINI_API_KEY: 'k', CLIENT_ID: '1552260327008247879', API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40), LOG_LEVEL: 'error'
});
delete process.env.AUTOMOD_ACTION; // الافتراضي: كتم كتابي

const botDb = require('../database/botDb');
const autoMod = require('../services/autoMod');
const textMute = require('../services/textMute');
const cfg = require('../config/autoMod');

test.before(async () => {
  await botDb.init({ sqlitePath: ':memory:' });
});
test.after(async () => {
  autoMod.stopSweeper();
  textMute.stop();
  await botDb.close();
});

function world() {
  const guild = makeGuild();
  const channel = makeChannel(guild, { name: 'العام' });
  const member = makeMember(guild, { username: 'player' });
  return { guild, channel, member };
}
const send = (w, member, content, extra = {}) => {
  const m = makeUserMessage(w.channel, member, content);
  Object.assign(m, extra);
  return autoMod.handleMessage(m);
};
const later = () => autoMod._internal.recentPunish.clear();

test('الافتراضات الأخف: السلّم دقيقتين ← 10 دقائق ← ساعة، والسبام 7 رسائل نصية / تكرار 4، والإجراء كتم كتابي', () => {
  assert.deepEqual([...cfg.escalationMs], [2 * 60e3, 10 * 60e3, 60 * 60e3]);
  assert.equal(cfg.spam.maxMessages, 7);
  assert.equal(cfg.spam.duplicateCount, 4);
  assert.equal(cfg.action(), 'textmute');
});

test('الضحك الطبيعي والإيموجي والملصقات وتكرار الحروف: ما تنعدّ سبام ولا تُعاقَب', async () => {
  const w = world();
  later();
  // ضحك طويل متكرر (مثل لقطة المستخدم)، 10 مرات متتالية
  const laugh = 'هههههههههههههههههههههههههههههههههه44444444444444444444هههههههه';
  for (let k = 0; k < 10; k++) assert.equal(await send(w, w.member, laugh), null);
  autoMod._internal.tracker.clear(); // دفعة جديدة (الإغراق الشديد لوحده ينلقط وله حد أعلى بكثير)
  for (let k = 0; k < 10; k++) assert.equal(await send(w, w.member, '😂😂😂'), null);
  autoMod._internal.tracker.clear();
  for (let k = 0; k < 10; k++) assert.equal(await send(w, w.member, '', { stickers: new Map([['1', { id: '1' }]]) }), null);
  autoMod._internal.tracker.clear();
  for (let k = 0; k < 10; k++) assert.equal(await send(w, w.member, 'اااااااااا'), null);
  assert.equal(w.guild.log.filter(([t]) => t === 'overwrite' || t === 'timeout').length, 0, 'ولا كتم ولا Timeout');
  assert.equal(w.guild.log.filter(([t]) => t === 'deleteMessage').length, 0, 'ولا حذف');
});

test('السبام الحقيقي لسا ينلقط: 7 رسائل نصية سريعة، وتكرار نفس الجملة 4 مرات', async () => {
  const w = world();
  later();
  let r;
  for (let k = 1; k <= cfg.spam.maxMessages; k++) r = await send(w, w.member, `كلام فعلي رقم ${k} يا جماعة`);
  assert.equal(r.type, 'spam');
  later();
  for (let k = 1; k <= cfg.spam.duplicateCount; k++) r = await send(w, w.member, 'نفس الجملة الفعلية');
  assert.equal(r.type, 'spam');
});

test('العقوبة كتم كتابي بالروم نفسه فقط (بدون Timeout)، بمدد مخففة، وينفك بوقته', async () => {
  await botDb.run('DELETE FROM text_mutes');
  const w = world();
  later();
  const r = await send(w, w.member, 'https://bad-site.com/free');
  assert.equal(r.type, 'link');
  assert.equal(r.result.durationMs, cfg.escalationMs[0]);
  assert.equal(r.result.timedOut, true, 'انطبق الكتم');
  assert.equal(w.guild.log.filter(([t]) => t === 'timeout').length, 0, 'بدون Timeout السيرفر');
  const ow = w.guild.log.find(([t, ch, id]) => t === 'overwrite' && ch === w.channel.id && id === w.member.id);
  assert.ok(ow, 'صلاحيات الروم تغيّرت');
  assert.equal(ow[3].SendMessages, false);
  assert.ok(!('Connect' in ow[3]) && !('Speak' in ow[3]), 'الصوت ما انمنع');
  // ينفك بعد انتهاء المدة
  w.guild.members.me; // موجود
  const client = { guilds: { cache: new Map([[w.guild.id, w.guild]]) } };
  assert.equal(await textMute.sweep(client, Date.now() + 60_000), 0, 'لسا ما انتهى');
  assert.equal(await textMute.sweep(client, Date.now() + cfg.escalationMs[0] + 5_000), 1);
  assert.ok(w.guild.log.some(([t, ch, id]) => t === 'overwriteDelete' && ch === w.channel.id && id === w.member.id), 'رجعت الصلاحيات');
  // ما يطلع صف معلّق
  assert.equal(await textMute.sweep(client, Date.now() + 10 * 60e3), 0);
});

test('بدون صلاحية «إدارة الصلاحيات» بالروم: يحذف الرسالة بس ما يطيح ولا يعمل Timeout', async () => {
  const w = world();
  const locked = makeChannel(w.guild, { botPerms: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] });
  w.channel = locked;
  later();
  const r = await send(w, w.member, 'https://x-bad.com');
  assert.equal(r.result.timedOut, false);
  assert.equal(w.guild.log.filter(([t]) => t === 'timeout' || t === 'overwrite').length, 0);
});

test('إغراق شديد بالملصقات/الضحك (21 رسالة خفيفة بـ8 ثوانٍ) لسا ينلقط', async () => {
  const w = world();
  later();
  let r = null;
  for (let k = 0; k < 21 && !r; k++) r = await send(w, w.member, 'ههههه');
  assert.equal(r && r.type, 'spam');
});
