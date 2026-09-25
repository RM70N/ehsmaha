'use strict';

// /دول (لعبة الدول): توزيع الدول بدون تكرار + البديل، سرية الدول، اختيار النفس،
// المهلة، إعلان الإقصاء، التوازي مع /روليت، مغادرة السيرفر، صور الأعلام،
// وتنظيف المؤقتات والذاكرة.

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
const countries = require('../services/countriesGame');
const roulette = require('../services/roulette');
const COUNTRIES = require('../config/countries');
const gamesConfig = require('../config/games');

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

// توقيتات سريعة للاختبار (نفس المنطق بالضبط) + فحص صور بدون شبكة
const FAST = {
  countdownMs: 60,
  pickMs: 150,
  spinDelays: [5, 5, 5, 5],
  afterPickMs: 10,
  afterSkipMs: 10,
  lobbyTtlMs: 60_000,
  maxSkips: 5,
  imageCheck: async () => true
};

test.before(() => {
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
function reset() {
  countries.stopAll();
  countries.resetSettings();
  countries.configure(FAST);
  countries._images.clear();
  roulette.stopAll();
  roulette.resetSettings();
}
test.beforeEach(reset);
test.after(() => {
  countries.stopAll();
  countries.resetSettings();
  roulette.stopAll();
  roulette.resetSettings();
});

function world(n = 4) {
  const guild = makeGuild();
  const channel = makeChannel(guild, { name: 'دول' });
  const members = Array.from({ length: n }, (_, i) => makeMember(guild, { username: `لاعب${i + 1}` }));
  return { guild, channel, host: members[0], members };
}
const cmd = (w, who, name = 'دول', channel = w.channel) => makeInteraction({ guild: w.guild, member: who, commandName: name, channelId: channel.id });
const btn = (w, who, customId, values, channel = w.channel) =>
  makeInteraction({ guild: w.guild, member: who, kind: values ? 'select' : 'button', customId, values, channelId: channel.id });
const isEphemeralReply = (i) => i.log.some(([t, p]) => t === 'reply' && p && p.flags && (Number(p.flags) & 64));
const json = (p) => JSON.stringify({ content: p.content, embeds: (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)), components: (p.components || []).map((c) => (c.toJSON ? c.toJSON() : c)) });

async function openLobby(w, { name = 'دول', engine = countries, channel = w.channel, prefix = 'dl' } = {}) {
  await dispatch(cmd(w, w.host, name, channel));
  const game = engine.get(channel.id);
  assert.ok(game, 'اللعبة انفتحت');
  return { game, join: (who) => Promise.all(who.map((m) => dispatch(btn(w, m, `${prefix}:join:${game.id}`, undefined, channel)))) };
}
const member = (w, id) => w.members.find((m) => m.id === id);
// كل اللي انعرض علناً بالقناة (رسائل + تعديلات + ردود) — بدون الخاص
function publicLog(w, from = 0) {
  return w.guild.log.slice(from).filter(([t]) => t !== 'dm').map(([t, , a, b]) => (t === 'editSent' ? json(b) : t === 'send' || t === 'replyEdit' ? json(a) : ''));
}
// اختيار دولة لاعب معيّن من قائمة صاحب الدور (القيمة رمز عشوائي — نجيبه من الذاكرة)
const tokenOf = (game, playerId) => [...game.countryTokens].find(([, id]) => id === playerId)?.[0] || 'x';
const pickBtn = (w, who, game, playerId, round = game.round, channel = w.channel) =>
  btn(w, who, `dl:pick:${game.id}:${round}`, [tokenOf(game, playerId)], channel);
const sendsOf = (w) => w.guild.log.filter(([t]) => t === 'send');
const announcements = (w) =>
  w.guild.log.filter(([t, , p]) => t === 'send' && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('لعبة الدول — إقصاء'));

// =================== /العاب + ملف الدول ===================

test('/العاب: لعبة الدول تظهر تلقائياً من config/games.js بوصفها', async () => {
  const w = world(1);
  const i = cmd(w, w.host, 'العاب');
  await dispatch(i);
  const e = lastPayload(i).embeds[0];
  assert.equal(e.fields.length, gamesConfig.length);
  const f = e.fields.find((x) => x.name.includes('لعبة الدول'));
  assert.ok(f, 'لعبة الدول موجودة');
  assert.equal(f.name, '🌍 لعبة الدول — `/دول`');
  assert.match(f.value, /دولة سرية/);
  assert.doesNotMatch(f.value, /بالخاص/);
  assert.match(f.value, /أقل عدد: \*\*3\*\*/);
  assert.ok(gamesConfig.find((g) => g.command === '/دول' && g.name === 'لعبة الدول' && g.minPlayers === 3));
});

test('الدول: ملف config/countries.js سليم — 30+ دولة، أسماء فريدة، أعلام، وروابط https', () => {
  assert.ok(COUNTRIES.length >= 30, `عدد الدول ${COUNTRIES.length}`);
  assert.ok(COUNTRIES.length >= countries.DEFAULTS.maxPlayers, 'الدول تكفي أقصى عدد لاعبين');
  assert.equal(new Set(COUNTRIES.map((c) => c.name)).size, COUNTRIES.length);
  for (const c of COUNTRIES) {
    assert.match(c.flagEmoji, /^([\u{1F1E6}-\u{1F1FF}]{2}|🏴)$/u, c.name);
    assert.match(c.flagImageUrl, /^https:\/\/flagcdn\.com\/w320\/[a-z]{2}(-[a-z]{3})?\.png$/, c.name);
  }
  assert.equal(countries.normalizeCountries(COUNTRIES).length, COUNTRIES.length);
  // عناصر ناقصة/مكررة تنشال، والصورة غير https تنلغى (يبقى الرمز)
  const n = countries.normalizeCountries([{ name: 'أ', flagEmoji: '🇦🇦', flagImageUrl: 'http://x/y.png' }, { name: 'أ', flagEmoji: '🇧🇧' }, { name: '', flagEmoji: '🇨🇨' }, null, { name: 'ب' }]);
  assert.deepEqual(n, [{ name: 'أ', flagEmoji: '🇦🇦', flagImageUrl: null }]);
});

test('الدول: التوزيع بدون تكرار (حتى 50 لاعب)، وعشوائي، والبديل لو اللاعبين أكثر من الدول بدون كراش', () => {
  const ids = Array.from({ length: countries.DEFAULTS.maxPlayers }, (_, i) => `p${i}`);
  const seenFirst = new Set();
  for (let run = 0; run < 30; run++) {
    const m = countries.assignCountries(ids, COUNTRIES);
    assert.equal(m.size, ids.length);
    assert.equal(new Set([...m.values()].map((c) => c.name)).size, ids.length, 'كل لاعب دولة مختلفة');
    seenFirst.add(m.get('p0').name);
  }
  assert.ok(seenFirst.size > 5, 'التوزيع عشوائي');

  // 10 لاعبين و3 دول ← يكرر عشوائياً بالتساوي تقريباً (كل دولة 3–4 مرات)
  const small = COUNTRIES.slice(0, 3);
  const many = Array.from({ length: 10 }, (_, i) => `q${i}`);
  const m = countries.assignCountries(many, small);
  assert.equal(m.size, 10);
  const counts = {};
  for (const c of m.values()) counts[c.name] = (counts[c.name] || 0) + 1;
  assert.deepEqual(Object.keys(counts).sort(), small.map((c) => c.name).sort());
  assert.ok(Object.values(counts).every((n) => n >= 3 && n <= 4), JSON.stringify(counts));
  // أول 3 لاعبين (بخلطة وحدة) ما يتكررون
  assert.equal(new Set(many.slice(0, 3).map((id) => m.get(id).name)).size, 3);
  assert.throws(() => countries.assignCountries(['a'], []), /فاضية/);
});

// =================== اللوبي ===================

test('الدول: اللوبي بنفس آلية الروليت — العنوان، العداد عند 3، الطرد للهوست فقط، وجولة وحدة بالقناة', async () => {
  countries.configure({ countdownMs: 60_000 });
  const w = world(4);
  const { game, join } = await openLobby(w);
  const lobby = countries.lobbyPayload(game).embeds[0].toJSON();
  assert.equal(lobby.title, '🌍 لعبة الدول — بانتظار لاعبين');
  assert.deepEqual(countries.lobbyPayload(game).components[0].toJSON().components.map((c) => c.custom_id), [`dl:join:${game.id}`, `dl:leave:${game.id}`, `dl:kick:${game.id}`]);

  await join(w.members.slice(0, 2));
  assert.equal(game.phase, 'lobby');
  await join([w.members[2]]);
  assert.equal(game.phase, 'countdown');
  let i = btn(w, w.members[2], `dl:leave:${game.id}`);
  await dispatch(i);
  assert.equal(lastPayload(i).type, 'update', 'نفس الرسالة تتحدث');
  assert.equal(game.phase, 'lobby', 'نزل تحت 3 ← رجع انتظار');
  assert.equal(game.countdownTimer, null);
  await join([w.members[2], w.members[3]]);
  assert.equal(game.phase, 'countdown');

  i = btn(w, w.members[1], `dl:kick:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /متاح فقط لصاحب اللعبة/);
  i = btn(w, w.host, `dl:kicksel:${game.id}`, [w.members[3].id]);
  await dispatch(i);
  assert.match(lastPayload(i).text, /تم طرد/);
  assert.equal(game.players.has(w.members[3].id), false);

  i = cmd(w, w.members[1]);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /يوجد جولة نشطة بالفعل بهذه القناة/);
});

// =================== دورة كاملة ===================

test('الدول: دورة كاملة — توزيع سري (بدون خاص)، القائمة دول مو لاعبين، إقصاء دولة غيرك ودولتك، إعلان الإقصاء، والفائز', async () => {
  const w = world(5);
  const { game, join } = await openLobby(w);
  await join(w.members);
  await waitFor(() => game.chooserId, 3000, 'أول دور');
  const secret = new Map(game.countries); // نحتفظ بنسخة (تنمسح بعد النهاية)

  // 1) التوزيع: كل لاعب دولة مختلفة — وما ينرسل ولا خاص لأحد
  assert.equal(secret.size, 5);
  assert.equal(new Set([...secret.values()].map((c) => c.name)).size, 5);
  assert.equal(w.guild.log.filter(([t]) => t === 'dm').length, 0, 'ولا رسالة خاصة');
  assert.match(JSON.stringify(sendsOf(w).map((x) => x[2])), /تم توزيع الدول سراً على الجميع/);

  // 2) القائمة: الدول الباقية بأعلامها (أبجدياً)، بدون أسماء لاعبين، والقيم رموز عشوائية
  const menus = game.roundMessage.payload.components.map((c) => c.toJSON().components[0]);
  const options = menus.flatMap((m) => m.options);
  assert.equal(options.length, 5);
  const names = [...secret.values()].map((c) => `${c.flagEmoji} ${c.name}`);
  assert.deepEqual(options.map((o) => o.label).sort(), names.slice().sort(), 'كل خيار = دولة');
  const sortedNames = [...secret.values()].sort((x, y) => x.name.localeCompare(y.name, 'ar')).map((c) => `${c.flagEmoji} ${c.name}`);
  assert.deepEqual(options.map((o) => o.label), sortedNames, 'مرتبة أبجدياً (مو بترتيب اللاعبين)');
  for (const m of w.members) {
    assert.ok(!options.some((o) => o.label.includes(m.user.username) || o.value === m.id || o.value.includes(m.id)), 'ما فيه أسماء ولا معرّفات لاعبين');
  }
  const board = game.roundMessage.payload.embeds[0].toJSON().fields.find((f) => f.name.startsWith('🌍 الدول الباقية'));
  assert.ok(board, 'رسالة الجولة تعرض الدول الباقية');
  assert.equal(board.value, sortedNames.join(' · '));

  // غير صاحب الدور ما يقدر
  const notChooser = w.members.find((m) => m.id !== game.chooserId);
  let i = pickBtn(w, notChooser, game, notChooser.id);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /ليس دورك الآن/);
  assert.equal(game.players.size, 5);
  // رمز مزوّر (مثلاً معرّف لاعب) ← مرفوض
  i = btn(w, member(w, game.chooserId), `dl:pick:${game.id}:${game.round}`, [notChooser.id]);
  await dispatch(i);
  assert.match(lastPayload(i).text, /اختيار غير صالح/);
  assert.equal(game.players.size, 5);

  // 3) صاحب الدور يختار دولته هو (بدون ما يدري) ← يُقصى هو + إعلان يكشف دولته
  const selfPicker = member(w, game.chooserId);
  i = pickBtn(w, selfPicker, game, selfPicker.id);
  await dispatch(i);
  assert.equal(lastPayload(i).type, 'update');
  assert.match(lastPayload(i).text, /وطلعت دولته هو/);
  assert.equal(game.players.has(selfPicker.id), false, 'انقصى فوراً');
  assert.deepEqual(game.eliminated[0], { id: selfPicker.id, name: selfPicker.user.username, by: null, reason: 'self' });
  await waitFor(() => announcements(w).length === 1, 2000, 'إعلان الإقصاء');
  let ann = announcements(w)[0][2];
  let annText = JSON.stringify(ann.embeds[0].toJSON());
  const c1 = secret.get(selfPicker.id);
  assert.equal(ann.content, `💥 <@${selfPicker.id}>`, 'منشن صاحب الدولة');
  assert.deepEqual(ann.allowedMentions, { users: [selfPicker.id] });
  assert.ok(annText.includes(`# ${c1.flagEmoji} ${c1.name}`), 'العلم والدولة بعنوان كبير');
  assert.match(annText, /أقصى دولته هو بنفسه/);
  assert.equal(ann.embeds[0].toJSON().image.url, c1.flagImageUrl, 'صورة العلم');
  // الدولة المُقصاة تنشال من القائمة واللوحة
  await waitFor(() => game.chooserId, 3000, 'الدور الثاني');
  const opts2 = game.roundMessage.payload.components.flatMap((c) => c.toJSON().components[0].options);
  assert.equal(opts2.length, 4);
  assert.ok(!opts2.some((o) => o.label.includes(c1.name)));

  // 4) صاحب الدور يقصي دولة غيره ← الإعلان يكشف صاحبها ومن أقصاها
  const chooser2 = member(w, game.chooserId);
  const target2 = [...game.players.keys()].find((id) => id !== chooser2.id);
  i = pickBtn(w, chooser2, game, target2);
  await dispatch(i);
  assert.match(lastPayload(i).text, new RegExp(`أقصى دولة ${secret.get(target2).flagEmoji} ${secret.get(target2).name} — وكانت دولة`));
  await waitFor(() => announcements(w).length === 2, 2000, 'إعلان ثاني');
  ann = announcements(w)[1][2];
  annText = JSON.stringify(ann.embeds[0].toJSON());
  assert.ok(annText.includes(secret.get(target2).name));
  assert.ok(annText.includes(`أقصاها <@${chooser2.id}>`), 'يذكر مين أقصاها');
  assert.equal(ann.content, `💥 <@${target2}>`);

  // باقي الجولات لين تبقى دولة وحدة
  while (game.alive && game.players.size > 1) {
    await waitFor(() => game.chooserId || !game.alive, 3000, 'دور');
    if (!game.alive) break;
    const ch = member(w, game.chooserId);
    const t = [...game.players.keys()].find((id) => id !== ch.id);
    await dispatch(pickBtn(w, ch, game, t));
    await waitFor(() => !game.chooserId || !game.alive, 1000);
  }
  await waitFor(() => !game.alive, 3000, 'نهاية');

  // 5) الفائز: منشن + دولته مكشوفة + الترتيب بدول الكل
  const win = w.guild.log.filter(([t, , p]) => t === 'send' && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('عندنا فائز')).pop();
  assert.ok(win, 'رسالة الفائز');
  const winner = [...game.players.values()][0];
  const wc = secret.get(winner.id);
  const wText = JSON.stringify(win[2].embeds[0].toJSON());
  assert.equal(win[2].content, `🏆 <@${winner.id}>`);
  assert.equal(win[2].embeds[0].toJSON().title, '🏆 لعبة الدول — عندنا فائز!');
  assert.ok(wText.includes(`${wc.flagEmoji} ${wc.name}`), 'دولة الفائز مكشوفة');
  assert.equal(win[2].embeds[0].toJSON().thumbnail.url, wc.flagImageUrl);
  assert.equal(game.eliminated.length, 4);
  for (const e of game.eliminated) assert.ok(wText.includes(secret.get(e.id).name), 'دولة كل مُقصى بالملخص');
  assert.match(wText, /`1`[^`]*أقصى دولته بنفسه/, 'الأول أقصى دولته');
  assert.match(wText, new RegExp(`أقصاها ${chooser2.user.username}`));

  // 6) السرية: قبل إقصاء أي لاعب، ما فيه رسالة عامة تربط اسمه أو منشنه بدولته
  const log = w.guild.log;
  for (const [id, c] of secret) {
    const m = member(w, id);
    const revealAt = log.findIndex(([t, , p]) => t === 'send' && (p.content === `💥 <@${id}>` || p.content === `🏆 <@${id}>`));
    assert.ok(revealAt > 0, 'انكشفت بالنهاية');
    for (const line of publicLog({ guild: { log: log.slice(0, revealAt) } })) {
      for (const needle of [`<@${id}>`, m.user.username]) {
        const re = new RegExp(`${needle}[^\\n"]{0,40}${c.name}|${c.name}[^\\n"]{0,40}${needle}`);
        assert.ok(!re.test(line), `دولة ${m.user.username} ما انربطت فيه قبل إقصائه`);
      }
    }
  }

  // 7) التنظيف
  assert.equal(countries.get(w.channel.id), null);
  assert.equal(game.timers.size, 0);
  assert.equal(countries._internal.games.size, 0);
  assert.equal(game.countries.size, 0, 'الدول السرية انمسحت من الذاكرة');
});

test('الدول: مهلة 15 ثانية — اختيار خلالها يقصي فوراً، وانتهاؤها يعيد التدوير بدون إقصاء', async () => {
  const w = world(3);
  const { game, join } = await openLobby(w);
  await join(w.members);
  await waitFor(() => game.chooserId, 3000);
  const r1 = game.round;
  const landedAt = Date.now();
  await sleep(FAST.pickMs / 2);
  assert.equal(game.round, r1, 'الدور باقي قبل المهلة');
  await waitFor(() => game.round > r1 && game.chooserId, 3000, 'دوران جديد');
  assert.ok(Date.now() - landedAt >= FAST.pickMs - 5);
  assert.equal(game.players.size, 3, 'ما انقصت أي دولة');
  assert.equal(game.eliminated.length, 0);
  assert.equal(announcements(w).length, 0, 'ما فيه إعلان إقصاء');
  assert.ok(w.guild.log.some(([t, , , p]) => t === 'editSent' && p && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('ما انقصت أي دولة')));

  // اختيار من جولة قديمة ما يمشي، واختيار بالوقت يقصي فوراً
  const ch = member(w, game.chooserId);
  const other = w.members.find((m) => m.id !== ch.id);
  await dispatch(pickBtn(w, ch, game, other.id, r1));
  assert.equal(game.players.size, 3);
  await dispatch(pickBtn(w, ch, game, other.id));
  assert.equal(game.players.size, 2);
  assert.equal(game.eliminated[0].by.id, ch.id);
  await waitFor(() => !game.alive, 3000, 'فائز');
  assert.equal(game.timers.size, 0);
});

test('الدول: مغادرة السيرفر — تُقصى تلقائياً وتنكشف دولتها، ما تنكسر السلسلة، وتظهر بالملخص', async () => {
  const w = world(4);
  const { game, join } = await openLobby(w);
  await join(w.members);
  await waitFor(() => game.chooserId, 3000);
  const secret = new Map(game.countries);

  // لاعب عادي (مو صاحب الدور) يطلع
  const bystander = w.members.find((m) => m.id !== game.chooserId);
  await memberRemove.execute(ctx, bystander);
  assert.equal(game.players.has(bystander.id), false);
  assert.equal(game.eliminated.at(-1).reason, 'left');
  const menu = game.roundMessage.payload.components[0].toJSON().components[0];
  assert.equal(menu.options.length, 3, 'دولته انشالت من قائمة الاختيار');
  assert.ok(!menu.options.some((o) => o.label.includes(secret.get(bystander.id).name)));
  await waitFor(() => announcements(w).length === 1, 2000);
  assert.match(JSON.stringify(announcements(w)[0][2].embeds[0].toJSON()), /غادر السيرفر — دولته انقصت تلقائياً/);
  assert.ok(JSON.stringify(announcements(w)[0][2].embeds[0].toJSON()).includes(secret.get(bystander.id).name));

  // صاحب الدور يطلع ← دوران جديد
  const chooser = member(w, game.chooserId);
  const round = game.round;
  await memberRemove.execute(ctx, chooser);
  await waitFor(() => game.round > round && game.chooserId, 3000, 'دوران بعد خروج صاحب الدور');
  assert.notEqual(game.chooserId, chooser.id);

  // الباقي يختار ← فائز، والملخص فيه المغادرين
  const ch = member(w, game.chooserId);
  const t = [...game.players.keys()].find((id) => id !== ch.id);
  await dispatch(pickBtn(w, ch, game, t));
  await waitFor(() => !game.alive, 3000, 'فائز');
  const win = w.guild.log.filter(([ty, , p]) => ty === 'send' && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('عندنا فائز')).pop();
  const wText = JSON.stringify(win[2].embeds[0].toJSON());
  assert.equal((wText.match(/مُقصى تلقائياً \(غادر السيرفر\)/g) || []).length, 2);
  assert.ok(wText.includes(secret.get(bystander.id).name) && wText.includes(secret.get(chooser.id).name));
  assert.equal(game.timers.size, 0);

  // باللوبي: المغادرة تلغي العداد
  countries.configure({ countdownMs: 60_000 });
  const w2 = world(3);
  const { game: g2, join: join2 } = await openLobby(w2);
  await join2(w2.members);
  assert.equal(g2.phase, 'countdown');
  await memberRemove.execute(ctx, w2.members[1]);
  assert.equal(g2.phase, 'lobby');
  assert.equal(g2.countdownTimer, null);
});

// =================== التوازي ===================

test('الدول + الروليت بالتوازي بقنوات مختلفة: حالات منفصلة تماماً وكل وحدة تكمل لفائز', async () => {
  roulette.configure({ countdownMs: 60, pickMs: 150, spinDelays: [5, 5, 5, 5], afterPickMs: 10, afterSkipMs: 10 });
  const w = world(4);
  const chA = w.channel;
  const chB = makeChannel(w.guild, { name: 'روليت' });
  const A = await openLobby(w, { channel: chA });
  const B = await openLobby(w, { name: 'روليت', engine: roulette, channel: chB, prefix: 'rt' });
  assert.equal(countries.get(chB.id), null, 'الروليت مو بخريطة الدول');
  assert.equal(roulette.get(chA.id), null, 'الدول مو بخريطة الروليت');
  // نفس اللاعبين باللعبتين
  await Promise.all([A.join(w.members), B.join(w.members)]);

  // زر روليت بمعرّف لعبة الدول ← ما يأثر
  const cross = btn(w, w.members[1], `rt:leave:${A.game.id}`, undefined, chA);
  await dispatch(cross);
  assert.match(lastPayload(cross).text, /هذي الجولة انتهت/);

  async function play(engine, game, ch, prefix) {
    while (game.alive) {
      await waitFor(() => game.chooserId || !game.alive, 3000, `دور ${prefix}`);
      if (!game.alive) break;
      const c = member(w, game.chooserId);
      const t = [...game.players.keys()].find((id) => id !== c.id);
      await dispatch(prefix === 'dl' ? pickBtn(w, c, game, t, game.round, ch) : btn(w, c, `${prefix}:pick:${game.id}:${game.round}`, [t], ch));
      await waitFor(() => !game.chooserId || !game.alive, 1000);
    }
  }
  await Promise.all([play(countries, A.game, chA, 'dl'), play(roulette, B.game, chB, 'rt')]);
  assert.equal(A.game.eliminated.length, 3);
  assert.equal(B.game.eliminated.length, 3);
  assert.ok(A.game.eliminated.every((e) => e.reason === 'picked'));
  const winners = w.guild.log.filter(([t, , p]) => t === 'send' && p.embeds && JSON.stringify(p.embeds[0].toJSON()).includes('عندنا فائز'));
  assert.equal(winners.length, 2);
  assert.ok(winners.some(([, id, p]) => id === chA.id && p.embeds[0].toJSON().title.includes('لعبة الدول')));
  assert.ok(winners.some(([, id, p]) => id === chB.id && p.embeds[0].toJSON().title.includes('روليت')));
  // الروليت ما صار فيها أي إعلان دول
  assert.ok(!w.guild.log.some(([t, id, p]) => t === 'send' && id === chB.id && JSON.stringify(p).includes('لعبة الدول')));
  assert.equal(countries._internal.games.size, 0);
  assert.equal(roulette._internal.games.size, 0);
});

// =================== صور الأعلام ===================

test('الدول: صورة العلم تنفحص — لو فشلت يظهر الرمز التعبيري بدون صورة، والنتيجة تنحفظ', async () => {
  let calls = 0;
  countries.configure({
    imageCheck: async (url) => {
      calls++;
      if (url.endsWith('/sa.png')) throw new Error('ENOTFOUND');
      return !url.endsWith('/ae.png');
    }
  });
  assert.equal(await countries.checkFlagImage('https://flagcdn.com/w320/sa.png'), false, 'خطأ شبكة = فشل');
  assert.equal(await countries.checkFlagImage('https://flagcdn.com/w320/ae.png'), false, '404 = فشل');
  assert.equal(await countries.checkFlagImage('https://flagcdn.com/w320/kw.png'), true);
  assert.equal(await countries.checkFlagImage('http://flagcdn.com/w320/kw.png'), false, 'غير https ما ينفحص');
  assert.equal(await countries.checkFlagImage('https://flagcdn.com/w320/kw.png'), true);
  assert.equal(calls, 3, 'الكاش يمنع تكرار الفحص');

  // لعبة كاملة بدولة صورتها خربانة ← الإعلان بالرمز بس وما تتعطل
  countries._images.clear();
  countries.configure({
    countries: [
      { name: 'السعودية', flagEmoji: '🇸🇦', flagImageUrl: 'https://flagcdn.com/w320/sa.png' },
      { name: 'الإمارات', flagEmoji: '🇦🇪', flagImageUrl: 'https://flagcdn.com/w320/ae.png' },
      { name: 'الكويت', flagEmoji: '🇰🇼', flagImageUrl: 'https://flagcdn.com/w320/kw.png' }
    ]
  });
  const w = world(3);
  const { game, join } = await openLobby(w);
  await join(w.members);
  await waitFor(() => game.chooserId, 3000);
  const ch = member(w, game.chooserId);
  const secret = new Map(game.countries);
  await dispatch(pickBtn(w, ch, game, ch.id));
  await waitFor(() => announcements(w).length === 1, 2000);
  const e = announcements(w)[0][2].embeds[0].toJSON();
  const c = secret.get(ch.id);
  assert.ok(JSON.stringify(e).includes(`${c.flagEmoji} ${c.name}`), 'الرمز التعبيري موجود دايماً');
  if (c.name === 'الكويت') assert.equal(e.image.url, c.flagImageUrl);
  else assert.equal(e.image, undefined, 'صورة فاشلة ← بدون صورة');
  countries.endGame(game, 'test');
  assert.equal(w.guild.log.filter(([t]) => t === 'dm').length, 0, 'ولا خاص');
});

// =================== الذاكرة ===================

test('الدول: ما فيه تسريب — الإلغاء، انتهاء اللوبي، الرسالة المحذوفة، وstopAll كلها تنظف المؤقتات والخرائط', async () => {
  countries.configure({ lobbyTtlMs: 40 });
  const w = world(2);
  const { game, join } = await openLobby(w);
  await join([w.members[1]]);
  await waitFor(() => !game.alive, 2000, 'مهلة اللوبي');
  assert.equal(game.phase, 'cancelled');
  assert.equal(game.timers.size, 0);
  assert.equal(countries._internal.games.size, 0);
  const lastEdit = w.guild.log.filter(([t]) => t === 'replyEdit').pop();
  assert.equal(lastEdit[2].embeds[0].toJSON().title, '🌍 لعبة الدول — انتهت مهلة الانتظار');
  assert.match(JSON.stringify(lastEdit[2].embeds[0].toJSON()), /`\/دول`/);
  assert.ok(lastEdit[2].components[0].toJSON().components.every((c) => c.disabled), 'الأزرار انقفلت');

  // الرسالة انحذفت أثناء الدوران
  countries.configure({ lobbyTtlMs: 60_000 });
  const w2 = world(3);
  const { game: g2, join: j2 } = await openLobby(w2);
  await j2(w2.members);
  await waitFor(() => g2.roundMessage, 2000);
  w2.guild.failNext = 'edit';
  await waitFor(() => !g2.alive, 2000, 'انتهت بهدوء');
  assert.equal(g2.timers.size, 0);
  assert.equal(g2.countries.size, 0);
  assert.equal(countries._internal.games.size, 0);

  // stopAll أثناء لعبة شغالة
  const w3 = world(3);
  const { game: g3, join: j3 } = await openLobby(w3);
  await j3(w3.members);
  await waitFor(() => g3.chooserId, 2000);
  countries.stopAll();
  assert.equal(g3.timers.size, 0);
  assert.equal(g3.countries.size, 0);
  assert.equal(countries._internal.games.size, 0);
  await sleep(FAST.pickMs + 50);
  assert.equal(g3.eliminated.length, 0, 'ما صار شي بعد الإيقاف');
});

test('الدول: التوقيتات الافتراضية = 30 ثانية للعداد و15 ثانية للاختيار و3 لاعبين، و50 لاعب كحد (قائمتين)', async () => {
  assert.equal(countries.DEFAULTS.countdownMs, 30_000);
  assert.equal(countries.DEFAULTS.pickMs, 15_000);
  assert.equal(countries.DEFAULTS.minPlayers, 3);
  assert.equal(countries.DEFAULTS.maxPlayers, 50);
  assert.deepEqual(countries.DEFAULTS.spinDelays, roulette.DEFAULTS.spinDelays, 'نفس تأثير دوران الروليت');
  assert.equal(roulette.DEFAULTS.maxPlayers, 25, 'الروليت ما تغيّرت');

  // 30 لاعب ← 30 دولة بقائمتين اختيار بمعرّفات مختلفة
  countries.configure({ countdownMs: 60_000 });
  const w = world(30);
  const { game, join } = await openLobby(w);
  await join(w.members);
  assert.equal(game.players.size, 30);
  game.countries = countries.assignCountries([...game.players.keys()], COUNTRIES);
  game.countryTokens = new Map([...game.countries.keys()].map((id, k) => [`t${k}`, id]));
  game.phase = 'running';
  game.round = 1;
  game.pickEndsAt = Date.now() + 1000;
  const rows = countries.roundPayload(game, { pointerId: w.members[0].id, landed: true, choosing: true }).components.map((r) => r.toJSON().components[0]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.custom_id), [`dl:pick:${game.id}:1`, `dl:pick:${game.id}:1:1`]);
  assert.equal(rows.flatMap((r) => r.options).length, 30);
  // وقائمة الطرد كمان تتقسم (29 لاعب غير الهوست)
  game.phase = 'lobby';
  const k = btn(w, w.host, `dl:kick:${game.id}`);
  await dispatch(k);
  const kickRows = lastPayload(k).components.map((r) => r.components[0]);
  assert.deepEqual(kickRows.map((r) => r.custom_id), [`dl:kicksel:${game.id}`, `dl:kicksel:${game.id}:1`]);
  assert.equal(kickRows.flatMap((r) => r.options).length, 29);
  await dispatch(btn(w, w.host, `dl:kicksel:${game.id}:1`, [w.members[29].id]));
  assert.equal(game.players.has(w.members[29].id), false, 'الطرد من القائمة الثانية يشتغل');
  game.players.set(w.members[29].id, { id: w.members[29].id, name: 'x' });
  game.phase = 'running';
  // اختيار دولة من القائمة الثانية يشتغل (عبر الزر، بالرمز)
  game.chooserId = w.members[0].id;
  const second = rows[1].options[0];
  const owner = game.countryTokens.get(second.value);
  const pi = btn(w, w.members[0], rows[1].custom_id, [second.value]);
  await dispatch(pi);
  assert.equal(lastPayload(pi).type, 'update');
  assert.equal(game.players.has(owner), false, 'صاحب الدولة انقصى');
  countries.endGame(game, 'test');
  assert.equal(game.timers.size, 0);
});
