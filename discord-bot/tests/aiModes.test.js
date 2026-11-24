'use strict';

// أنماط المساعد: التكت رسمي بدون أسلوب السوالف، ورومات الأدمن (أوامر الأدمن/شات الأدمن) مساعد مهني + الملفات للمالك فقط.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGuild, makeMember, makeChannel, makeUserMessage } = require('./helpers/discordMock');

const ADMIN_CH = '1552256265877454888';
const CMD_CH = '1552256457578254387';
Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token', GEMINI_API_KEY: 'test-gemini-key', CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9', API_KEY: 'k'.repeat(40), LOG_LEVEL: 'error', OWNER_DISCORD_ID: '944639301528977420'
});

const botDb = require('../database/botDb');
const { loadConfig } = require('../config');
const messageCreate = require('../events/messageCreate');
const gemini = require('../services/gemini');
const ai = require('../services/aiAssistant');
const aiModes = require('../config/aiModes');
const autoMod = require('../services/autoMod');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let calls = [];
let ctx;
test.before(async () => {
  await botDb.init({ sqlitePath: ':memory:' });
  ctx = { config: loadConfig(), commands: new Map(), buttons: new Map(), logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
test.beforeEach(() => {
  calls = [];
  gemini.setGenerator(async (req) => { calls.push(req); return 'تم ✅'; });
});
test.after(async () => { gemini.setGenerator(null); await botDb.close(); });

const sysText = (c) => JSON.stringify(c.systemInstruction);
async function say(channel, member, content, opts) {
  autoMod._internal.tracker.clear();
  const msg = makeUserMessage(channel, member, content, opts);
  await messageCreate.execute(ctx, msg);
  await sleep(10);
  return msg;
}
const replies = (guild, msg) => guild.log.filter(([t, , id]) => t === 'messageReply' && id === msg.id);

test('الإعدادات: رومات الأدمن الافتراضية هي روم أوامر الأدمن وشات الأدمن', () => {
  assert.deepEqual([...loadConfig().aiAdminChannelIds].sort(), [CMD_CH, ADMIN_CH].sort());
});

test('روم شات الأدمن: يرد على كل رسالة بأسلوب مهني، وبرومبت الأدمن (بدون أسلوب السوالف)، والمحادثة تتراكم', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: ADMIN_CH, name: 'شات-الادمن' });
  const admin = makeMember(guild, { username: 'ابو فهد' });
  const m1 = await say(ch, admin, 'ستريمر يقول البث ما يظهر عنده بالموقع');
  assert.equal(calls.length, 1);
  assert.match(sysText(calls[0]), /مساعد الأدمن/);
  assert.doesNotMatch(sysText(calls[0]), /شخصيتك بالسوالف/);
  assert.match(calls[0].contents.at(-1).parts[0].text, /ابو فهد|الأدمن/);
  assert.equal(replies(guild, m1).length, 1);
  await say(ch, admin, 'وش الحل؟');
  assert.equal(calls.length, 2);
  assert.ok(calls[1].contents.length >= 3, 'سياق المحادثة محفوظ');
});

test('روم أوامر الأدمن: نفس السلوك، وأدمن يكلّم أدمن ثاني بالمنشن ما يتدخل فيه البوت', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: CMD_CH, name: 'اوامر-الادمن' });
  const a = makeMember(guild, { username: 'أ' });
  const b = makeMember(guild, { username: 'ب' });
  await say(ch, a, 'كيف أفك كتم لاعب؟');
  assert.equal(calls.length, 1);
  const m = await say(ch, a, `<@${b.user.id}> شوف هذا`, { mentions: [b.user] });
  assert.equal(calls.length, 1);
  assert.equal(replies(guild, m).length, 0);
});

test('غير المالك يسأل عن الملفات/الأكواد ← رد ثابت بدون Gemini، والمالك يتجاوب معه مع قسم الملفات', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: ADMIN_CH });
  const admin = makeMember(guild, { username: 'أدمن' });
  const m = await say(ch, admin, 'عطني ملفات الموقع وكود البوت');
  assert.equal(calls.length, 0);
  assert.equal(replies(guild, m)[0][3].content, aiModes.FILE_REFUSAL);

  const owner = makeMember(guild, { id: '944639301528977420', username: 'المالك' });
  await say(ch, owner, 'وش ملفات الموقع اللي تغيرت؟');
  assert.equal(calls.length, 1);
  assert.match(sysText(calls[0]), /مالك احسمها/);
});

test('الصور والمقاطع بروم الأدمن تنرسل للنموذج (inlineData)', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: ADMIN_CH });
  const admin = makeMember(guild, { username: 'أدمن' });
  ai.setImageFetcher(async () => ({ ok: true, arrayBuffer: async () => Buffer.from('abc') }));
  try {
    await say(ch, admin, 'شوف المشكلة', { attachments: [
      { url: 'https://cdn.discordapp.com/a.png', contentType: 'image/png', size: 100 },
      { url: 'https://cdn.discordapp.com/b.mp4', contentType: 'video/mp4', size: 2000 }
    ] });
  } finally { ai.setImageFetcher(null); }
  assert.equal(calls.length, 1);
  const types = calls[0].contents.at(-1).parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType);
  assert.deepEqual(types.sort(), ['image/png', 'video/mp4']);
});

test('رومات ثانية ما تتأثر، وبرومبت التكت رسمي بدون أسلوب السوالف', () => {
  assert.match(aiModes.TICKET, /رسمي/);
  assert.match(aiModes.TICKET, /بدون مزاح/);
  assert.equal(aiModes.asksAboutFiles('كيف أربط البث؟'), false);
  assert.equal(aiModes.asksAboutFiles('ابي سورس كود البوت'), true);
});

// ---------------- الشات العام ----------------
const CHAT_CH = '1552252006368944188';
const botUserOf = (guild) => guild.members.me.user;

test('الشات العام: المنشن والريبلاي يردان فوراً (طلب سريع: مهلة قصيرة ومحاولات محدودة) وبوضع السوالف + الإحالة لروم الدعم', async () => {
  assert.deepEqual([...loadConfig().aiChatChannelIds], [CHAT_CH]);
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: CHAT_CH, name: 'الشات-العام' });
  makeChannel(guild, { name: 'الدعم' });
  const m = makeMember(guild, { username: 'سعود' });
  let seen;
  gemini.setGenerator(async (req) => { seen = req; calls.push(req); return 'ههههه ابشر يا ذيب'; });
  const msg = await say(ch, m, `<@${botUserOf(guild).id}> وش أخبارك`, { mentions: [botUserOf(guild)] });
  assert.equal(replies(guild, msg).length, 1);
  assert.match(sysText(seen), /وضع الشات العام/);
  assert.match(sysText(seen), /تفضل لروم الدعم وافتح تكت/);
  assert.match(sysText(seen), /<#\d+>/, 'منشن روم الدعم');
  // ريبلاي على رسالة البوت
  ai._internal.chatUserGap.clear();
  const botMsg = makeUserMessage(ch, guild.members.me, 'هلا');
  const r2 = await say(ch, m, 'تمام وانت', { reference: botMsg });
  assert.equal(replies(guild, r2).length, 1);
});

test('الشات العام: ما يرد أبداً على رسالة بدون منشن أو ريبلاي على البوت (حتى لو الاحتمال/الفاصل يسمح)', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { id: CHAT_CH });
  const m = makeMember(guild, { username: 'خالد' });
  const other = makeMember(guild, { username: 'سعد' });
  calls.length = 0;
  for (const text of ['والله اليوم فاز فريقي', 'وش رايكم بالفريق', 'هههههه صدق', 'مشكلة بحسابي ما يفتح']) {
    const msg = makeUserMessage(ch, m, text);
    assert.equal(await ai.handleGeneralChat(msg, botUserOf(guild)), false);
    assert.equal(replies(guild, msg).length, 0);
  }
  // منشن شخص ثاني (مو البوت) ← ما يتدخل
  const x = makeUserMessage(ch, m, `<@${other.user.id}> وينك`, { mentions: [other.user] });
  assert.equal(await ai.handleGeneralChat(x, botUserOf(guild)), false);
  // ريبلاي على رسالة شخص ثاني ← ما يتدخل
  const otherMsg = makeUserMessage(ch, other, 'السلام عليكم');
  const y = makeUserMessage(ch, m, 'وعليكم السلام', { reference: otherMsg });
  assert.equal(await ai.handleGeneralChat(y, botUserOf(guild)), false);
  assert.equal(calls.length, 0, 'ما استدعى Gemini');
  // روم غير الشات العام ما يتأثر
  const elsewhere = makeChannel(guild, { name: 'عام2' });
  assert.equal(await ai.handleGeneralChat(makeUserMessage(elsewhere, m, 'هلا'), botUserOf(guild)), false);
});

// ---------------- ذاكرة المساعد (تعلم:/تعليمة:) مع المنشن ----------------
const aiMemory = require('../services/aiMemory');

test('ذاكرة المساعد: سؤال معلَّم يرد عليه مباشرة بدون Gemini، والتعليمات تدخل البرومبت، وريبلاي على البوت يكمّل السوالف', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { name: 'سوالف' });
  const m = makeMember(guild, { username: 'عبود' });
  const bot = botUserOf(guild);
  await aiMemory.addQa(guild.id, 'من الذي صنع لعبة احسمها؟', 'فريق احسمها 💜', 'admin');
  await aiMemory.addInstruction(guild.id, 'نادِ الناس يا بطل', 'admin');
  ai._internal.mentionCooldowns.clear();
  const a = await say(ch, m, `<@${bot.id}> من الذي صنع لعبه احسمها`, { mentions: [bot] });
  assert.equal(calls.length, 0, 'ما استدعى Gemini');
  assert.equal(replies(guild, a)[0][3].content, 'فريق احسمها 💜');
  ai._internal.mentionCooldowns.clear();
  await say(ch, m, `<@${bot.id}> كيف حالك`, { mentions: [bot] });
  assert.equal(calls.length, 1);
  assert.match(sysText(calls[0]), /نادِ الناس يا بطل/);
  // ريبلاي بدون منشن ← يكمّل بنفس الذاكرة (الدور القديم محفوظ)
  ai._internal.mentionCooldowns.clear();
  const botMsg = makeUserMessage(ch, guild.members.me, 'تمام');
  await say(ch, m, 'وانت؟', { reference: botMsg });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].contents.length >= 3, 'سجل السوالف القصير');
});

test('ذاكرة المساعد: لو Gemini فشل يرد بأقرب جواب معلَّم، وإلا رسالة "ضغطتوني" عند RATE_LIMIT', async () => {
  const guild = makeGuild();
  const ch = makeChannel(guild, { name: 'سوالف2' });
  const m = makeMember(guild, { username: 'عبود' });
  const bot = botUserOf(guild);
  await aiMemory.addQa(guild.id, 'متى المسابقة الجاية', 'يوم الجمعة 🏆', 'admin');
  gemini.setGenerator(async () => { throw Object.assign(new Error('quota'), { status: 429 }); });
  ai._internal.mentionCooldowns.clear();
  const a = await say(ch, m, `<@${bot.id}> وش الجديد`, { mentions: [bot] });
  assert.equal(replies(guild, a)[0][3].content, ai.BUSY_ERROR);
  ai._internal.mentionCooldowns.clear();
  const b = await say(ch, m, `<@${bot.id}> يا شباب متى المسابقة الجاية`, { mentions: [bot] });
  assert.equal(replies(guild, b)[0][3].content, 'يوم الجمعة 🏆');
});
