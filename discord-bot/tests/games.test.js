'use strict';

// /العاب + /روليت (روليت الإقصاء): اللوبي، العداد، الطرد، دورة الإقصاء، المهلات،
// مغادرة السيرفر، منع الجلسات المتزامنة، وتنظيف المؤقتات.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGuild, makeMember, makeChannel, makeInteraction, lastPayload } = require('./helpers/discordMock');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
  GEMINI_API_KEY: 'test-gemini-key',
  CLIENT_ID: '1552260327008247879',
  API_BASE_URL: 'http://127.0.0.1:9',
  API_KEY: 'k'.repeat(40),
  COMMAND_COOLDOWN_MS: '0',
  BUTTON_COOLDOWN_MS: '0',
  LOG_LEVEL: 'error'
});

const { loadConfig } = require('../config');
const { loadCommands } = require('../utils/commandLoader');
const handler = require('../events/interactionCreate');
const memberRemove = require('../events/guildMemberRemove');
const roulette = require('../services/roulette');
const gamesConfig = require('../config/games');
const gamesCmd = require('../commands/games/games');

let ctx;
const dispatch = (i) => handler.execute(ctx, i);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(cond, ms = 3000, label = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await sleep(5);
  }
  throw new Error('انتهى الانتظار: ' + label);
}

// توقيتات سريعة للاختبار (نفس المنطق بالضبط)
const FAST = { countdownMs: 120, pickMs: 150, spinDelays: [5, 5, 5, 5], afterPickMs: 10, afterSkipMs: 10, lobbyTtlMs: 60_000, maxSkips: 5 };

test.before(() => {
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
test.beforeEach(() => {
  roulette.stopAll();
  roulette.resetSettings();
  roulette.configure(FAST);
});
test.after(() => {
  roulette.stopAll();
  roulette.resetSettings();
});

function world(n = 5) {
  const guild = makeGuild();
  const channel = makeChannel(guild, { name: 'العاب' });
  const members = Array.from({ length: n }, (_, i) => makeMember(guild, { username: `لاعب${i + 1}` }));
  return { guild, channel, host: members[0], members };
}
const cmd = (w, who, name = 'روليت', channel = w.channel) => makeInteraction({ guild: w.guild, member: who, commandName: name, channelId: channel.id });
const btn = (w, who, customId, values) =>
  makeInteraction({ guild: w.guild, member: who, kind: values ? 'select' : 'button', customId, values, channelId: w.channel.id });
const isEphemeralReply = (i) => i.log.some(([t, p]) => t === 'reply' && p && p.flags && (Number(p.flags) & 64));

async function openLobby(w, host = w.host) {
  const i = cmd(w, host);
  await dispatch(i);
  const game = roulette.get(w.channel.id);
  assert.ok(game, 'اللعبة انفتحت');
  return { game, i };
}
async function joinAll(w, game, who) {
  for (const m of who) {
    const i = btn(w, m, `rt:join:${game.id}`);
    await dispatch(i);
  }
}

// =================== /العاب ===================

test('/العاب: يعرض روليت الإقصاء من config/games.js، وأي لعبة تنضاف للملف تظهر تلقائياً', async () => {
  const w = world(1);
  const i = cmd(w, w.host, 'العاب');
  await dispatch(i);
  const e = lastPayload(i).embeds[0];
  assert.equal(e.title, '🎮 ألعاب احسمها بديسكورد');
  assert.equal(e.footer.text, 'احسمها | ehsmaha.com', 'نفس فوتر /مساعدة');
  assert.equal(e.fields.length, gamesConfig.length);
  assert.match(e.fields[0].name, /روليت الإقصاء — `\/روليت`/);
  assert.match(e.fields[0].value, /أقل عدد: \*\*3\*\*/);

  // لعبة جديدة بالملف فقط ← تظهر بدون أي تعديل على الأمر
  gamesConfig.push({ command: '/اكس_او', name: 'إكس أو', description: 'لعبة تجريبية', minPlayers: 2 });
  try {
    const out = gamesCmd._internal.buildGamesList().embeds[0].toJSON();
    assert.equal(out.fields.length, gamesConfig.length);
    assert.match(out.fields.at(-1).name, /إكس أو — `\/اكس_او`/);
  } finally {
    gamesConfig.pop();
  }
});

// =================== اللوبي والعداد ===================

test('روليت: أقل من 3 بدون عداد، 3 بالضبط يبدأ عداد، الزيادة ما تعيده، الخروج تحت 3 يلغيه، ورجوع 3 يبدأ عداد جديد', async () => {
  roulette.configure({ countdownMs: 60_000 }); // ما نبي يخلص بهالاختبار
  const w = world(5);
  const { game } = await openLobby(w);
  let lobby = roulette.lobbyPayload(game).embeds[0].toJSON();
  assert.equal(lobby.title, '🎯 روليت الإقصاء — بانتظار لاعبين');
  assert.match(lobby.fields[0].name, /المشاركون \(0\)/);

  await joinAll(w, game, w.members.slice(0, 2));
  assert.equal(game.phase, 'lobby');
  assert.equal(game.countdownTimer, null, 'لاعبين = بدون عداد');

  await joinAll(w, game, [w.members[2]]);
  assert.equal(game.phase, 'countdown');
  assert.ok(game.countdownTimer);
  const firstEnd = game.countdownEndsAt;
  assert.ok(Math.abs(firstEnd - Date.now() - 60_000) < 500, 'عداد 30 ثانية (هنا 60 للاختبار) من لحظة وصول 3');
  lobby = roulette.lobbyPayload(game).embeds[0].toJSON();
  assert.match(lobby.description, new RegExp(`<t:${Math.ceil(firstEnd / 1000)}:R>`), 'وقت نسبي يتحدث تلقائياً');

  await sleep(20);
  await joinAll(w, game, [w.members[3]]);
  assert.equal(game.countdownEndsAt, firstEnd, 'دخول لاعب رابع ما يعيد العداد');

  // خروج 2 (4 ← 2): يتلغى العداد ويرجع انتظار
  await dispatch(btn(w, w.members[3], `rt:leave:${game.id}`));
  assert.equal(game.phase, 'countdown', '3 باقين = العداد مستمر');
  await dispatch(btn(w, w.members[2], `rt:leave:${game.id}`));
  assert.equal(game.phase, 'lobby');
  assert.equal(game.countdownTimer, null);
  assert.equal(game.countdownEndsAt, null);
  assert.equal(game.timers.size, 1, 'بقي مؤقت مهلة اللوبي بس (العداد انلغى)');

  await sleep(20);
  await joinAll(w, game, [w.members[4]]);
  assert.equal(game.phase, 'countdown');
  assert.ok(game.countdownEndsAt > firstEnd, 'عداد جديد من البداية');
});

test('روليت: انضمام مكرر وخروج بدون انضمام يردون برسائل خاصة، والرسالة نفسها تتحدث', async () => {
  const w = world(3);
  const { game } = await openLobby(w);
  let i = btn(w, w.members[1], `rt:join:${game.id}`);
  await dispatch(i);
  assert.equal(lastPayload(i).type, 'update', 'نفس الرسالة تتحدث (مو رسالة جديدة)');
  assert.match(lastPayload(i).text, /المشاركون \(1\)/);
  assert.match(lastPayload(i).text, /لاعب2/);
  i = btn(w, w.members[1], `rt:join:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /أنت منضم بالفعل/);
  i = btn(w, w.members[2], `rt:leave:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /مو منضم/);
});

test('روليت: زر "طرد لاعب" يظهر للكل بس يشتغل للهوست فقط', async () => {
  roulette.configure({ countdownMs: 60_000 });
  const w = world(4);
  const { game } = await openLobby(w);
  await joinAll(w, game, w.members);

  // غير الهوست: الزر والقائمة (حتى لو زوّرها) مرفوضين
  let i = btn(w, w.members[2], `rt:kick:${game.id}`);
  await dispatch(i);
  assert.match(lastPayload(i).text, /متاح فقط لصاحب اللعبة/);
  i = btn(w, w.members[2], `rt:kicksel:${game.id}`, [w.members[3].id]);
  await dispatch(i);
  assert.match(lastPayload(i).text, /متاح فقط لصاحب اللعبة/);
  assert.equal(game.players.size, 4);

  // الهوست: قائمة منسدلة بالمشاركين (بدونه) ← الطرد يحدّث رسالة اللوبي
  i = btn(w, w.host, `rt:kick:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  const select = lastPayload(i).components[0].components[0];
  assert.equal(select.custom_id, `rt:kicksel:${game.id}`);
  assert.deepEqual(select.options.map((o) => o.value).sort(), w.members.slice(1).map((m) => m.id).sort());
  i = btn(w, w.host, `rt:kicksel:${game.id}`, [w.members[3].id]);
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم طرد/);
  assert.equal(game.players.has(w.members[3].id), false);
  const edit = w.guild.log.filter(([t]) => t === 'replyEdit').pop();
  assert.match(JSON.stringify(edit[2].embeds[0].toJSON()), /المشاركون \(3\)/, 'رسالة اللوبي تحدثت');
});

test('روليت: ما يمكن فتح جولتين بنفس القناة (وقنوات مختلفة عادي)', async () => {
  const w = world(2);
  await openLobby(w);
  const i = cmd(w, w.members[1]);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /يوجد جولة نشطة بالفعل بهذه القناة/);
  const other = makeChannel(w.guild);
  const j = cmd(w, w.members[1], 'روليت', other);
  await dispatch(j);
  assert.ok(roulette.get(other.id), 'قناة ثانية تقدر تلعب');
});

// =================== دورة الإقصاء ===================

test('روليت: دورة كاملة — العداد يقفل الأزرار، الدوران عشوائي، صاحب الدور بس يختار، ولين يبقى فائز', async () => {
  // عشوائية متحكَّم فيها لنعرف مين بيختاره الروليت
  const seq = [0.1, 0.9, 0.5];
  let k = 0;
  roulette.configure({ random: () => seq[k++ % seq.length] });
  const w = world(4);
  const { game } = await openLobby(w);
  await joinAll(w, game, w.members);
  assert.equal(game.phase, 'countdown');

  // انتهاء العداد ← الأزرار تتقفل وتبدأ الجولات
  await waitFor(() => game.chooserId, 3000, 'أول اختيار');
  const lockEdit = w.guild.log.find(([t, , p]) => t === 'replyEdit' && p.components[0].toJSON().components.every((c) => c.disabled));
  assert.ok(lockEdit, 'أزرار اللوبي انقفلت');
  const order = [...game.players.keys()];
  assert.equal(game.chooserId, order[Math.floor(0.1 * 4)], 'الروليت وقف على اللاعب العشوائي');

  // تأثير الدوران: عدة تعديلات لنفس رسالة الجولة بمؤشر 🔻 متنقل
  const roundMsgId = game.roundMessage.id;
  const spinFrames = w.guild.log.filter(([t, , id, p]) => t === 'editSent' && id === roundMsgId && JSON.stringify(p.embeds[0].toJSON()).includes('🔻'));
  assert.ok(spinFrames.length >= FAST.spinDelays.length, `إطارات دوران: ${spinFrames.length}`);

  // غير صاحب الدور ما يقدر يختار
  const notChooser = w.members.find((m) => m.id !== game.chooserId);
  let i = btn(w, notChooser, `rt:pick:${game.id}:${game.round}`, [game.chooserId]);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /ليس دورك الآن/);
  assert.equal(game.players.size, 4);

  // القائمة فيها كل المتبقين ما عدا صاحب الدور
  const lastRound = game.roundMessage.payload;
  const pickMenu = lastRound.components[0].toJSON().components[0];
  assert.equal(pickMenu.options.length, 3);
  assert.ok(!pickMenu.options.some((o) => o.value === game.chooserId));

  // جولات لين يبقى واحد: صاحب الدور يطرد أول واحد بالقائمة
  const chooserAt = new Map();
  while (roulette.get(w.channel.id) && game.players.size > 1) {
    await waitFor(() => game.chooserId || !game.alive, 3000, 'دور');
    if (!game.alive) break;
    const chooser = w.members.find((m) => m.id === game.chooserId);
    const target = [...game.players.keys()].find((id) => id !== chooser.id);
    chooserAt.set(game.round, chooser.id);
    i = btn(w, chooser, `rt:pick:${game.id}:${game.round}`, [target]);
    await dispatch(i);
    assert.equal(lastPayload(i).type, 'update');
    assert.match(lastPayload(i).text, /طرد/);
    await waitFor(() => !game.chooserId || !game.alive, 1000);
    await waitFor(() => game.chooserId || !game.alive, 3000, 'الجولة الجاية');
  }
  await waitFor(() => !game.alive, 3000, 'نهاية');

  // إعلان الفائز: منشن + ترتيب الإقصاء
  const win = w.guild.log.filter(([t, id, p]) => t === 'send' && id === w.channel.id && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('عندنا فائز')).pop();
  assert.ok(win, 'رسالة الفائز');
  const winner = [...game.players.values()][0];
  assert.equal(win[2].content, `🏆 <@${winner.id}>`);
  assert.deepEqual(win[2].allowedMentions, { users: [winner.id] });
  const summary = JSON.stringify(win[2].embeds[0].toJSON());
  assert.match(summary, /ترتيب الإقصاء/);
  assert.equal(game.eliminated.length, 3);
  assert.match(summary, /`1`/);
  assert.match(summary, /`3`/);

  // ما في تسريب: اللعبة انشالت والمؤقتات كلها انلغت
  assert.equal(roulette.get(w.channel.id), null);
  assert.equal(game.timers.size, 0);
  assert.equal(roulette._internal.games.size, 0);
});

test('روليت: الدوران عشوائي فعلاً (Math.random) وبين المتبقين فقط', async () => {
  const w = world(6);
  const seen = new Set();
  for (let run = 0; run < 12; run++) {
    roulette.stopAll();
    roulette.resetSettings();
    roulette.configure({ ...FAST, countdownMs: 60_000 });
    const { game } = await openLobby(w);
    await joinAll(w, game, w.members);
    game.phase = 'running';
    game.roundMessage = await w.channel.send({ content: 'x' });
    // نشيل لاعب قبل الدوران ← ما يُختار أبداً
    const removed = w.members[5].id;
    game.players.delete(removed);
    await roulette.nextSpin(game);
    assert.ok(game.chooserId && game.players.has(game.chooserId) && game.chooserId !== removed);
    seen.add(game.chooserId);
    roulette.endGame(game, 'test');
  }
  assert.ok(seen.size >= 2, `نتائج مختلفة عبر الجولات: ${seen.size}`);
});

test('روليت: مهلة الاختيار تُحترم — ما أحد انطرد، والروليت يدور من جديد بنفس اللاعبين', async () => {
  const w = world(3);
  const { game } = await openLobby(w);
  await joinAll(w, game, w.members);
  await waitFor(() => game.chooserId, 3000);
  const firstRound = game.round;
  const landedAt = Date.now();
  const firstChooser = game.chooserId;
  // قبل انتهاء المهلة: الدور باقي
  await sleep(FAST.pickMs / 2);
  assert.equal(game.round, firstRound);
  assert.equal(game.chooserId, firstChooser);
  // بعد المهلة: دوران جديد بدون أي طرد
  await waitFor(() => game.round > firstRound && game.chooserId, 3000, 'دوران جديد');
  assert.ok(Date.now() - landedAt >= FAST.pickMs - 5, 'ما انتهت المهلة قبل وقتها');
  assert.equal(game.players.size, 3, 'ما انطرد أحد');
  assert.equal(game.eliminated.length, 0);
  const skipNote = w.guild.log.some(([t, , , p]) => t === 'editSent' && p && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('ما انطرد أحد'));
  assert.ok(skipNote);
  // اختيار من جولة قديمة ما يمشي
  const i = btn(w, w.members.find((m) => m.id === firstChooser), `rt:pick:${game.id}:${firstRound}`, [w.members.find((m) => m.id !== firstChooser).id]);
  await dispatch(i);
  assert.equal(game.players.size, 3);
  roulette.endGame(game, 'test');
  assert.equal(game.timers.size, 0);
});

test('روليت: بعد عدة جولات ما أحد اختار فيها، اللعبة تنتهي (ما تدور للأبد)', async () => {
  roulette.configure({ pickMs: 20, maxSkips: 3 });
  const w = world(3);
  const { game } = await openLobby(w);
  await joinAll(w, game, w.members);
  await waitFor(() => !game.alive, 5000, 'انتهاء لعدم التفاعل');
  assert.equal(game.skips, 3);
  assert.equal(game.timers.size, 0);
  assert.equal(roulette.get(w.channel.id), null);
});

test('روليت: مغادرة السيرفر — باللوبي تلغي العداد، وصاحب الدور يطلع = دوران جديد، ولو بقي واحد = فائز', async () => {
  roulette.configure({ countdownMs: 60_000 });
  const w = world(4);
  let { game } = await openLobby(w);
  await joinAll(w, game, w.members.slice(0, 3));
  assert.equal(game.phase, 'countdown');
  await memberRemove.execute(ctx, w.members[2]);
  assert.equal(game.phase, 'lobby', 'رجع للانتظار');
  assert.equal(game.countdownTimer, null);
  roulette.endGame(game, 'test');

  // أثناء الجولات
  roulette.configure({ countdownMs: 30 });
  ({ game } = await openLobby(w));
  await joinAll(w, game, w.members);
  await waitFor(() => game.chooserId, 3000);
  const chooser = w.members.find((m) => m.id === game.chooserId);
  const round = game.round;
  await memberRemove.execute(ctx, chooser);
  assert.equal(game.players.has(chooser.id), false);
  assert.equal(game.eliminated.at(-1).reason, 'left');
  await waitFor(() => game.round > round && game.chooserId, 3000, 'دوران بعد خروج صاحب الدور');
  assert.notEqual(game.chooserId, chooser.id);

  // يطلعون الباقين لين يبقى واحد ← فائز بدون كسر
  const others = [...game.players.keys()];
  await memberRemove.execute(ctx, { id: others[0], guild: w.guild });
  await memberRemove.execute(ctx, { id: others[1], guild: w.guild });
  await waitFor(() => !game.alive, 3000, 'فائز بعد المغادرة');
  const win = w.guild.log.filter(([t, , p]) => t === 'send' && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('عندنا فائز')).pop();
  assert.ok(win);
  assert.match(JSON.stringify(win[2].embeds[0].toJSON()), /طلع من السيرفر/);
  assert.equal(game.timers.size, 0);
});

test('روليت: لوبي مهجور ينتهي تلقائياً ويفك القناة، ورسالة محذوفة تنهي اللعبة بهدوء', async () => {
  roulette.configure({ lobbyTtlMs: 40 });
  const w = world(2);
  const { game } = await openLobby(w);
  await joinAll(w, game, [w.members[1]]);
  await waitFor(() => !game.alive, 2000, 'مهلة اللوبي');
  assert.equal(game.phase, 'cancelled');
  assert.equal(roulette.get(w.channel.id), null);
  assert.equal(game.timers.size, 0);
  const lastEdit = w.guild.log.filter(([t]) => t === 'replyEdit').pop();
  assert.ok(lastEdit[2].components[0].toJSON().components.every((c) => c.disabled), 'الأزرار انقفلت');
  assert.equal(lastEdit[2].embeds[0].toJSON().title, '🎯 روليت الإقصاء — انتهت مهلة الانتظار');

  // رسالة الجولة انحذفت أثناء الدوران
  roulette.configure({ lobbyTtlMs: 60_000, countdownMs: 20 });
  const w2 = world(3);
  const { game: g2 } = await openLobby(w2);
  await joinAll(w2, g2, w2.members);
  await waitFor(() => g2.roundMessage, 2000);
  w2.guild.failNext = 'edit';
  await waitFor(() => !g2.alive, 2000, 'انتهت بهدوء');
  assert.equal(g2.timers.size, 0);
  assert.equal(roulette.get(w2.channel.id), null);

  // زر من لعبة منتهية
  const i = btn(w2, w2.members[0], `rt:join:${g2.id}`);
  await dispatch(i);
  assert.match(lastPayload(i).text, /هذي الجولة انتهت/);
});

test('روليت: التوقيتات الافتراضية = 30 ثانية للعداد و15 ثانية للاختيار و3 لاعبين', () => {
  assert.equal(roulette.DEFAULTS.countdownMs, 30_000);
  assert.equal(roulette.DEFAULTS.pickMs, 15_000);
  assert.equal(roulette.DEFAULTS.minPlayers, 3);
  const total = roulette.DEFAULTS.spinDelays.reduce((a, b) => a + b, 0);
  assert.ok(total >= 3000 && total <= 4000, `مدة الدوران ${total}ms`);
});
