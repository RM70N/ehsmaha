'use strict';

// /قناص (لعبة القناص): اللوبي المشترك، حجم الشبكة، عزل القناص وقت الاختباء،
// المخابئ السرية بدون تعارض، الطرد التلقائي، الأسلحة والذخيرة، سرية الإصابات
// الفاضية، حالات النهاية الثلاث، المغادرة، وتنظيف الذاكرة.

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeGuild, makeMember, makeChannel, makeInteraction, lastPayload } = require('./helpers/discordMock');

Object.assign(process.env, {
  DISCORD_TOKEN: 'test-token',
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
const sniper = require('../services/sniperGame');
const roulette = require('../services/roulette');
const grid = require('../utils/sniperGrid');
const SNIPER_CONFIG = require('../config/sniper');
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

// توقيتات سريعة (نفس المنطق بالضبط). random=0 ← أول واحد انضم هو القناص
const FAST = { countdownMs: 30, hideMs: 60_000, huntMs: 60_000, statusEveryMs: 40, lobbyTtlMs: 60_000, random: () => 0 };

test.before(() => {
  const loaded = loadCommands();
  ctx = { config: loadConfig(), commands: loaded.commands, buttons: loaded.buttons, logger: require('../utils/logger'), membersIntent: true, messageContentIntent: true };
});
test.beforeEach(() => {
  sniper.stopAll();
  sniper.resetSettings();
  sniper.configure(FAST);
  roulette.stopAll();
  roulette.resetSettings();
});
test.after(() => {
  sniper.stopAll();
  sniper.resetSettings();
  roulette.stopAll();
  roulette.resetSettings();
});

function world(n = 4) {
  const guild = makeGuild();
  const channel = makeChannel(guild, { name: 'قناص' });
  const members = Array.from({ length: n }, (_, i) => makeMember(guild, { username: `لاعب${i + 1}` }));
  return { guild, channel, host: members[0], members };
}
const cmd = (w, who, name = 'قناص', channel = w.channel) => makeInteraction({ guild: w.guild, member: who, commandName: name, channelId: channel.id });
const btn = (w, who, customId, values, channel = w.channel) =>
  makeInteraction({ guild: w.guild, member: who, kind: values ? 'select' : 'button', customId, values, channelId: channel.id });
const isEphemeralReply = (i) => i.log.some(([t, p]) => t === 'reply' && p && p.flags && (Number(p.flags) & 64));
const member = (w, id) => w.members.find((m) => m.id === id);
const sent = (w, text) => w.guild.log.filter(([t, , p]) => t === 'send' && JSON.stringify({ c: p.content, e: (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)) }).includes(text));
const allCustomIds = (w) =>
  w.guild.log.flatMap(([t, , a, b]) => {
    const p = t === 'editSent' ? b : a;
    return p && p.components ? p.components.flatMap((r) => (r.toJSON ? r.toJSON() : r).components.map((c) => c.custom_id)) : [];
  });

// لوبي ← انضمام ← عداد ← مرحلة الاختباء
async function startGame(w, players = w.members) {
  await dispatch(cmd(w, w.host));
  const game = sniper.get(w.channel.id);
  assert.ok(game);
  for (const m of players) await dispatch(btn(w, m, `sn:join:${game.id}`));
  await waitFor(() => game.phase === 'hiding' && game.hideMessage, 3000, 'مرحلة الاختباء');
  return game;
}
async function hideAt(w, game, m, box) {
  const i = btn(w, m, `sn:box:${game.id}:${m.id}:${box > 25 ? 1 : 0}`, [String(box)]);
  await dispatch(i);
  return i;
}
async function hideAll(w, game, boxes) {
  const hs = w.members.filter((m) => m.id !== game.sniperId && game.players.has(m.id));
  for (let k = 0; k < hs.length; k++) await hideAt(w, game, hs[k], boxes[k]);
  await waitFor(() => game.phase === 'hunting' && game.huntMessage, 2000, 'مرحلة الصيد');
  return hs;
}
async function shoot(w, game, weapon, boxes) {
  const i = btn(w, member(w, game.sniperId), `sn:shoot:${game.id}:${weapon}:0`, boxes.map(String));
  await dispatch(i);
  return i;
}
function panelOf(i) {
  const p = lastPayload(i);
  return { ...p, rows: p.components.map((r) => r.components) };
}

// =================== /العاب + اللوبي ===================

test('/العاب: لعبة القناص تظهر تلقائياً من config/games.js بوصفها', async () => {
  const w = world(1);
  const i = cmd(w, w.host, 'العاب');
  await dispatch(i);
  const e = lastPayload(i).embeds[0];
  assert.equal(e.fields.length, gamesConfig.length);
  const f = e.fields.find((x) => x.name.includes('لعبة القناص'));
  assert.equal(f.name, '🔫 لعبة القناص — `/قناص`');
  assert.match(f.value, /4 دقائق/);
  assert.match(f.value, /أقل عدد: \*\*3\*\*/);
  assert.ok(gamesConfig.find((g) => g.command === '/قناص' && g.name === 'لعبة القناص' && g.minPlayers === 3));
});

test('القناص: نفس اللوبي المشترك — العنوان والأزرار الثلاثة والعداد عند 3 والطرد للهوست وجولة وحدة بالقناة', async () => {
  sniper.configure({ countdownMs: 60_000 });
  const w = world(4);
  await dispatch(cmd(w, w.host));
  const game = sniper.get(w.channel.id);
  const lobby = sniper.lobbyPayload(game);
  assert.equal(lobby.embeds[0].toJSON().title, '🎯 لعبة القناص — بانتظار لاعبين');
  assert.deepEqual(lobby.components[0].toJSON().components.map((c) => c.custom_id), [`sn:join:${game.id}`, `sn:leave:${game.id}`, `sn:kick:${game.id}`]);
  for (const m of w.members.slice(0, 3)) await dispatch(btn(w, m, `sn:join:${game.id}`));
  assert.equal(game.phase, 'countdown');
  await dispatch(btn(w, w.members[2], `sn:leave:${game.id}`));
  assert.equal(game.phase, 'lobby');
  assert.equal(game.countdownTimer, null);
  let i = btn(w, w.members[1], `sn:kick:${game.id}`);
  await dispatch(i);
  assert.match(lastPayload(i).text, /متاح فقط لصاحب اللعبة/);
  i = cmd(w, w.members[1]);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.match(lastPayload(i).text, /يوجد جولة نشطة بالفعل بهذه القناة/);
  // الروليت بنفس السيرفر بقناة ثانية: خرائط منفصلة
  const other = makeChannel(w.guild);
  await dispatch(cmd(w, w.host, 'روليت', other));
  assert.ok(roulette.get(other.id));
  assert.equal(sniper.get(other.id), null);
  assert.equal(roulette.get(w.channel.id), null);
});

// =================== الإعدادات ===================

test('القناص: حجم الشبكة (أقل من 20 ← 20، و20 فأكثر ← 50) والذخيرة حسب الجدول — من ملف config', async () => {
  assert.deepEqual(SNIPER_CONFIG.GRID_SIZE_THRESHOLDS.map((t) => t.boxes).sort(), [20, 50]);
  for (const n of [3, 10, 19]) assert.equal(sniper.gridSizeFor(n), 20, `${n} لاعب`);
  for (const n of [20, 35, 50]) assert.equal(sniper.gridSizeFor(n), 50, `${n} لاعب`);
  assert.equal(sniper.gridSizeFor(12, [{ minPlayers: 10, boxes: 30 }, { minPlayers: 0, boxes: 15 }]), 30, 'الحدود قابلة للتعديل');
  assert.deepEqual(sniper.ammoFor(20), { sniper: 10, bomb: 5, nuke: 3 });
  assert.deepEqual(sniper.ammoFor(50), { sniper: 20, bomb: 10, nuke: 6 });
  assert.deepEqual(sniper.ammoFor(35), { sniper: 10, bomb: 5, nuke: 3 }, 'حجم غير موجود ← أقرب أصغر');
  assert.deepEqual(SNIPER_CONFIG.WEAPONS.sniper.targets, 1);
  assert.deepEqual(SNIPER_CONFIG.WEAPONS.bomb.targets, 3);
  assert.deepEqual(SNIPER_CONFIG.WEAPONS.nuke.targets, 5);
  assert.equal(sniper.DEFAULTS.hideMs, 30_000);
  assert.equal(sniper.DEFAULTS.huntMs, 240_000);
  assert.equal(sniper.DEFAULTS.countdownMs, 30_000);
  assert.equal(sniper.DEFAULTS.minPlayers, 3);

  // داخل اللعبة: 4 لاعبين ← 20 مربع، و20 لاعب ← 50 مربع بقائمتين (1-25 و26-50)
  const w = world(4);
  const g = await startGame(w);
  assert.equal(g.gridSize, 20);
  assert.deepEqual(g.ammo, { sniper: 10, bomb: 5, nuke: 3 });
  sniper.endGame(g, 'test');
  const big = world(20);
  const g2 = await startGame(big);
  assert.equal(g2.gridSize, 50);
  assert.deepEqual(g2.ammo, { sniper: 20, bomb: 10, nuke: 6 });
  const i = btn(big, big.members[5], `sn:hide:${g2.id}`);
  await dispatch(i);
  const menus = lastPayload(i).components.map((r) => r.components[0]);
  assert.equal(menus.length, 2);
  assert.deepEqual(menus.map((m) => [m.options[0].value, m.options.at(-1).value]), [['1', '25'], ['26', '50']]);
  sniper.endGame(g2, 'test');
});

// =================== الاختباء ===================

test('القناص: إعلان علني للقناص، والقناص ما يوصله أي زر أو قائمة وقت الاختباء', async () => {
  const w = world(4);
  const game = await startGame(w);
  assert.equal(game.sniperId, w.members[0].id, 'random=0 ← أول لاعب');
  const ann = sent(w, 'هو قناص هذه الجولة')[0];
  assert.ok(ann, 'إعلان القناص');
  assert.equal(ann[2].content, `🎯 <@${game.sniperId}>`);
  assert.match(JSON.stringify(ann[2].embeds[0].toJSON()), new RegExp(`# 🎯 <@${game.sniperId}> هو قناص هذه الجولة!`));
  // الشبكة العامة: صورة PNG مرقّمة
  const gridMsg = sent(w, 'ساحة القناص — 20 مربع')[0];
  assert.ok(gridMsg[2].files && gridMsg[2].files[0].attachment.subarray(1, 4).toString() === 'PNG');

  // خاص القناص: رسالة انتظار بدون أي أزرار
  const dm = w.guild.log.filter(([t, id]) => t === 'dm' && id === game.sniperId);
  assert.equal(dm.length, 1);
  assert.ok(!dm[0][2].components || dm[0][2].components.length === 0);
  assert.match(JSON.stringify(dm[0][2].embeds[0].toJSON()), /يختبئون/);

  // القناص يضغط "اختر مخبأك" ← رسالة انتظار خاصة بدون أي قائمة
  const s = member(w, game.sniperId);
  let i = btn(w, s, `sn:hide:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  assert.equal(lastPayload(i).components.length, 0);
  assert.match(lastPayload(i).text, /أنت القناص/);
  // لوحته والأسلحة (حتى لو زوّرها) مقفلة وقت الاختباء
  for (const id of [`sn:panel:${game.id}`, `sn:weapon:${game.id}:sniper:0`]) {
    i = btn(w, s, id);
    await dispatch(i);
    assert.equal(lastPayload(i).components.length, 0);
    assert.match(lastPayload(i).text, /يختبئون الحين/);
  }
  i = btn(w, s, `sn:shoot:${game.id}:sniper:0`, ['1']);
  await dispatch(i);
  assert.equal(game.shots, 0);
  // وما فيه ولا زر قناص بأي رسالة عامة
  assert.ok(!allCustomIds(w).some((id) => /^sn:(panel|weapon|shoot)/.test(id)));
  assert.equal(game.phase, 'hiding');
});

test('القناص: المخابئ سرية — قائمة خاصة لكل لاعب، بدون تعارض، التغيير مسموح، وتنتهي أول ما يختبئ الكل', async () => {
  const w = world(4);
  const game = await startGame(w);
  const [, a, b, c] = w.members;

  let i = btn(w, a, `sn:hide:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i), 'قائمة خاصة');
  const menuA = lastPayload(i).components[0].components[0];
  assert.equal(menuA.custom_id, `sn:box:${game.id}:${a.id}:0`, 'القائمة باسم صاحبها');
  assert.equal(menuA.options.length, 20);
  assert.equal(menuA.min_values, 1);
  assert.equal(menuA.max_values, 1);

  await hideAt(w, game, a, 5);
  assert.equal(game.hides.get(a.id), 5);
  // b يستخدم قائمة a ← مرفوض
  i = btn(w, b, `sn:box:${game.id}:${a.id}:0`, ['9']);
  await dispatch(i);
  assert.match(lastPayload(i).text, /مو لك/);
  assert.equal(game.hides.get(a.id), 5);
  // قائمة b بدون مربع a (5)
  i = btn(w, b, `sn:hide:${game.id}`);
  await dispatch(i);
  let opts = lastPayload(i).components[0].components[0].options.map((o) => o.value);
  assert.ok(!opts.includes('5'));
  assert.equal(opts.length, 19);
  // b يحاول 5 (قائمة قديمة) ← مرفوض بتحديث القائمة
  i = await hideAt(w, game, b, 5);
  assert.match(lastPayload(i).text, /انحجز قبلك/);
  assert.equal(game.hides.has(b.id), false);
  // a يغيّر لـ6 ← 5 يتحرر
  await hideAt(w, game, a, 6);
  assert.equal(game.hides.get(a.id), 6);
  assert.equal(game.boxOwner.has(5), false);
  i = btn(w, b, `sn:hide:${game.id}`);
  await dispatch(i);
  opts = lastPayload(i).components[0].components[0].options.map((o) => o.value);
  assert.ok(opts.includes('5') && !opts.includes('6'));
  await hideAt(w, game, b, 5);

  // الرسائل العامة ما فيها أي رقم مخبأ
  const hideStatus = JSON.stringify(game.hideMessage.payload.embeds[0].toJSON());
  assert.match(hideStatus, /2 من 3/);
  assert.ok(!/مربع #?[56]\b|#5|#6/.test(hideStatus));

  // آخر واحد يختبئ ← الصيد يبدأ فوراً (المهلة 60 ثانية)
  const t0 = Date.now();
  await hideAt(w, game, c, 12);
  await waitFor(() => game.phase === 'hunting', 1000, 'بداية مبكرة');
  assert.ok(Date.now() - t0 < 1000, 'ما انتظر المهلة');
  assert.equal(game.hideTimer, null);
  const locked = game.hideMessage.payload.components[0].toJSON().components[0];
  assert.equal(locked.disabled, true);
  // بعد النهاية: القائمة ما تشتغل
  i = await hideAt(w, game, a, 7);
  assert.equal(game.hides.get(a.id), 6);
  // وأي شي عام ما يكشف المخابئ
  const pub = w.guild.log.filter(([t]) => t === 'send' || t === 'editSent').map((e) => JSON.stringify(e.slice(2)));
  assert.ok(!pub.some((x) => /المربع #(5|6|12)\b/.test(x)), 'ما انكشف مخبأ علناً');
  sniper.endGame(game, 'test');
});

test('القناص: اللي ما يختبئ قبل نهاية الـ30 ثانية ينطرد تلقائياً برسالة فيها اسمه', async () => {
  sniper.configure({ hideMs: 120 });
  const w = world(4);
  const game = await startGame(w);
  const [, a, b, c] = w.members;
  await hideAt(w, game, a, 1);
  await hideAt(w, game, b, 2);
  await waitFor(() => game.phase === 'hunting', 2000, 'انتهاء المهلة');
  assert.equal(game.players.has(c.id), false);
  assert.deepEqual(game.eliminated, [{ id: c.id, name: c.user.username, reason: 'no_hide' }]);
  const kick = sent(w, '⏰ طرد تلقائي')[0];
  assert.ok(kick);
  assert.match(JSON.stringify(kick[2].embeds[0].toJSON()), /لاعب4/);
  assert.equal(game.players.size, 3, 'القناص + 2');
  sniper.endGame(game, 'test');

  // ما أحد اختبأ ← الجولة تنتهي بدون فائز
  const w2 = world(3);
  const g2 = await startGame(w2);
  await waitFor(() => !g2.alive, 2000, 'نهاية بدون مختبئين');
  assert.ok(sent(w2, 'ما أحد اختبأ')[0]);
  assert.equal(g2.timers.size, 0);
});

// =================== الصيد ===================

test('القناص: الأسلحة — الذخيرة حسب الشبكة، 1/3/5 مربعات بالطلقة، ذخيرة منفصلة، والمضروب ينشال من القائمة', async () => {
  const w = world(5);
  const game = await startGame(w);
  await hideAll(w, game, [20, 19, 18, 17]);
  const s = member(w, game.sniperId);

  // اللوحة: خاصة بالقناص فقط
  let i = btn(w, w.members[1], `sn:panel:${game.id}`);
  await dispatch(i);
  assert.match(lastPayload(i).text, /للقناص فقط/);
  i = btn(w, s, `sn:panel:${game.id}`);
  await dispatch(i);
  assert.ok(isEphemeralReply(i));
  let panel = panelOf(i);
  assert.deepEqual(panel.rows[0].map((b) => b.label), ['سنايبر (10)', 'قنبلة (5)', 'نيوك (3)']);
  assert.equal(panel.embeds[0].image.url, 'attachment://sniper-grid.png');
  assert.equal(panel.p.files[0].name, 'sniper-grid.png');

  // كل سلاح: قائمة بعدد المربعات الصحيح بالضبط
  for (const [w8, n] of [['sniper', 1], ['bomb', 3], ['nuke', 5]]) {
    i = btn(w, s, `sn:weapon:${game.id}:${w8}:0`);
    await dispatch(i);
    const menu = panelOf(i).rows[1][0];
    assert.equal(menu.custom_id, `sn:shoot:${game.id}:${w8}:0`);
    assert.equal(menu.min_values, n, w8);
    assert.equal(menu.max_values, n, w8);
    assert.equal(menu.options.length, 20);
  }
  // عدد غلط ← مرفوض بدون خصم
  i = await shoot(w, game, 'bomb', [1, 2]);
  assert.match(lastPayload(i).text, /عدد المربعات غير صحيح/);
  assert.deepEqual(game.ammo, { sniper: 10, bomb: 5, nuke: 3 });

  // قنبلة على 3 مربعات فاضية ← قنبلة وحدة تنخصم بس
  i = await shoot(w, game, 'bomb', [1, 2, 3]);
  assert.deepEqual(game.ammo, { sniper: 10, bomb: 4, nuke: 3 });
  assert.deepEqual([...game.shot.keys()].sort((a, b) => a - b), [1, 2, 3]);
  // نيوك على 5 ← نيوك وحدة
  await shoot(w, game, 'nuke', [4, 5, 6, 7, 8]);
  assert.deepEqual(game.ammo, { sniper: 10, bomb: 4, nuke: 2 });
  // سنايبر
  await shoot(w, game, 'sniper', [9]);
  assert.deepEqual(game.ammo, { sniper: 9, bomb: 4, nuke: 2 });
  assert.equal(game.shots, 3);
  // المربعات المضروبة ما تنعرض مرة ثانية، وضربها مرفوض
  i = btn(w, s, `sn:weapon:${game.id}:sniper:0`);
  await dispatch(i);
  const left = panelOf(i).rows[1][0].options.map((o) => Number(o.value));
  assert.equal(left.length, 11);
  assert.ok(left.every((b) => b > 9));
  i = await shoot(w, game, 'sniper', [3]);
  assert.match(lastPayload(i).text, /سبق ضربه/);
  assert.equal(game.ammo.sniper, 9);

  // النيوك يخلص ← الزر يتعطل
  await shoot(w, game, 'nuke', [10, 11, 12, 13, 14]);
  await shoot(w, game, 'nuke', [15, 16, 17, 18, 19]); // يصيب 17-19 ويبقى صاحب 20
  assert.equal(game.ammo.nuke, 0);
  assert.ok(game.alive);
  i = btn(w, s, `sn:panel:${game.id}`);
  await dispatch(i);
  assert.equal(panelOf(i).rows[0][2].disabled, true, 'زر النيوك معطّل');
  assert.equal(panelOf(i).rows[0][0].disabled, false, 'السنايبر شغال');
  sniper.endGame(game, 'test');
});

test('القناص: شبكة 50 ← ذخيرة 20/10/6، والمربعات الباقية بصفحتين متوازنتين والطلقة من الصفحة الثانية تشتغل', async () => {
  const w = world(20);
  const game = await startGame(w);
  const boxes = Array.from({ length: 19 }, (_, k) => 50 - k); // 50..32
  await hideAll(w, game, boxes);
  const s = member(w, game.sniperId);
  let i = btn(w, s, `sn:weapon:${game.id}:nuke:0`);
  await dispatch(i);
  let rows = panelOf(i).rows;
  assert.deepEqual(rows[0].map((b) => b.label), ['سنايبر (20)', 'قنبلة (10)', 'نيوك (6)']);
  assert.equal(rows[1][0].options.length, 25);
  assert.equal(rows[1][0].min_values, 5);
  assert.equal(rows[2].length, 2, 'زرين للصفحات');
  i = btn(w, s, `sn:weapon:${game.id}:nuke:1`);
  await dispatch(i);
  rows = panelOf(i).rows;
  assert.equal(rows[1][0].custom_id, `sn:shoot:${game.id}:nuke:1`);
  assert.deepEqual(rows[1][0].options.map((o) => o.value).slice(0, 2), ['26', '27']);
  i = btn(w, s, `sn:shoot:${game.id}:nuke:1`, ['46', '47', '48', '49', '50']);
  await dispatch(i);
  assert.equal(game.ammo.nuke, 5);
  assert.equal(game.eliminated.filter((e) => e.reason === 'shot').length, 5, '5 إصابات بطلقة وحدة');
  const hit = sent(w, 'القناص أصاب!').pop();
  assert.equal(hit[2].embeds.length, 5, 'إعلان لكل لاعب انصاب');
  // 45 باقي ← صفحتين (23 + 22)
  assert.deepEqual(sniper.pagesOf(Array.from({ length: 45 }, (_, k) => k + 1)).map((p) => p.length), [23, 22]);
  sniper.endGame(game, 'test');
});

test('القناص: المربع الفاضي ما يكشف شي علناً، والإصابة تنعلن بمنتصف الشاشة (الاسم + المربع + السلاح)', async () => {
  const w = world(4);
  const game = await startGame(w);
  const [a] = await hideAll(w, game, [7, 8, 9]);
  const before = w.guild.log.filter(([t]) => t === 'send').length;
  const huntBefore = JSON.stringify(game.huntMessage.payload.embeds[0].toJSON().fields);

  // فاضي ← تأكيد للقناص بس
  let i = await shoot(w, game, 'sniper', [1]);
  assert.match(lastPayload(i).text, /المربع \*\*#1\*\*: كان فاضي/);
  assert.equal(lastPayload(i).type, 'update', 'على لوحته الخاصة');
  await sleep(20);
  assert.equal(w.guild.log.filter(([t]) => t === 'send').length, before, 'ما انرسل شي علني');
  const pubEdits = w.guild.log.filter(([t]) => t === 'editSent').map((e) => JSON.stringify(e[3]));
  assert.ok(!pubEdits.some((x) => x.includes('#1') || x.includes('فاضي')), 'ولا تعديل علني يذكر المربع');
  assert.equal(JSON.stringify(game.huntMessage.payload.embeds[0].toJSON().fields).replace(/\*\*\d+\*\*/g, ''), huntBefore.replace(/\*\*\d+\*\*/g, ''), 'الحالة العامة نفسها (بس الذخيرة)');

  // إصابة ← إعلان علني بارز
  i = await shoot(w, game, 'bomb', [2, 7, 3]);
  assert.match(lastPayload(i).text, /أصبت <@/);
  assert.match(lastPayload(i).text, /#2\*\*: كان فاضي/);
  const hit = sent(w, 'القناص أصاب!')[0];
  assert.ok(hit);
  assert.equal(hit[2].content, `💥 <@${a.id}>`);
  assert.deepEqual(hit[2].allowedMentions, { users: [a.id] });
  const e = hit[2].embeds[0].toJSON();
  assert.match(e.title, /💣 قنبلة/);
  assert.match(e.description, new RegExp(`# 💀 ${a.user.username}`));
  assert.match(e.description, /المربع \*\*#7\*\*/);
  assert.ok(!JSON.stringify(hit[2]).includes('#2') && !JSON.stringify(hit[2]).includes('#3'), 'المربعات الفاضية مو بالإعلان');
  assert.equal(game.players.has(a.id), false);
  sniper.endGame(game, 'test');
});

// =================== النهاية ===================

test('القناص: نهاية 1 — القناص يصيد الكل ← يفوز', async () => {
  const w = world(4);
  const game = await startGame(w);
  await hideAll(w, game, [3, 4, 5]);
  await shoot(w, game, 'bomb', [3, 4, 5]);
  await waitFor(() => !game.alive, 2000);
  const win = sent(w, 'القناص فاز!')[0];
  assert.ok(win);
  assert.equal(win[2].content, `🏆 <@${game.sniperId}>`);
  assert.match(JSON.stringify(win[2].embeds[0].toJSON()), /انصاب بالمربع #3/);
  assert.equal(game.timers.size, 0);
  assert.equal(sniper._internal.games.size, 0);
});

test('القناص: نهاية 2 و3 — الذخيرة تخلص والجولة تكمل لنهاية الوقت، والناجين يفوزون معاً', async () => {
  sniper.configure({ huntMs: 400, ammoTable: { 20: { sniper: 1, bomb: 0, nuke: 1 } } });
  const w = world(5);
  const game = await startGame(w);
  const hs = await hideAll(w, game, [11, 12, 13, 14]);
  await shoot(w, game, 'sniper', [11]);
  await shoot(w, game, 'nuke', [1, 2, 3, 4, 5]);
  assert.equal(game.ammo.sniper + game.ammo.bomb + game.ammo.nuke, 0);
  assert.ok(game.alive, 'الجولة مستمرة بعد نفاد الذخيرة');
  await waitFor(() => JSON.stringify(game.huntMessage.payload.embeds[0].toJSON()).includes('خلصت ذخيرته'), 1000, 'تحديث الحالة');
  assert.equal(game.huntMessage.payload.components[0].toJSON().components[0].disabled, true, 'زر اللوحة معطّل');
  const i = await shoot(w, game, 'sniper', [12]);
  assert.match(lastPayload(i).text, /خلصت/);
  assert.equal(game.players.size, 4);
  const t0 = Date.now();
  await waitFor(() => !game.alive, 2000, 'نهاية الوقت');
  assert.ok(Date.now() - t0 > 50, 'انتظر الوقت');
  const win = sent(w, 'الناجين فازوا!')[0];
  assert.ok(win);
  const survivors = hs.slice(1).map((m) => m.id);
  assert.deepEqual(win[2].allowedMentions, { users: survivors });
  for (const id of survivors) assert.ok(win[2].content.includes(`<@${id}>`));
  assert.match(JSON.stringify(win[2].embeds[0].toJSON()), /المربع #12/, 'المخابئ تنكشف بعد النهاية');
  assert.equal(game.timers.size, 0);
});

test('القناص: عداد الـ4 دقائق مرئي — الرسالة العامة تتحدث دورياً بالوقت والأحياء', async () => {
  sniper.configure({ huntMs: 60_000, statusEveryMs: 30 });
  const w = world(4);
  const game = await startGame(w);
  await hideAll(w, game, [1, 2, 3]);
  const msgId = game.huntMessage.id;
  const count = () => w.guild.log.filter(([t, , id]) => t === 'editSent' && id === msgId).length;
  const c0 = count();
  await waitFor(() => count() >= c0 + 3, 2000, 'تحديثات دورية');
  const txt = JSON.stringify(game.huntMessage.payload.embeds[0].toJSON());
  assert.match(txt, /الوقت المتبقي: \*\*\d:\d\d\*\*/);
  assert.match(txt, /الأحياء: \*\*3\*\*/);
  sniper.endGame(game, 'test');
  const c1 = count();
  await sleep(100);
  assert.equal(count(), c1, 'التحديث وقف بعد النهاية');
});

// =================== المغادرة ===================

test('القناص: لاعب عادي يغادر ← مربعه يتحرر، وآخر لاعب يغادر ← القناص يفوز', async () => {
  const w = world(4);
  const game = await startGame(w);
  const [, a, b, c] = w.members;
  await hideAt(w, game, a, 4);
  await memberRemove.execute(ctx, a);
  assert.equal(game.players.has(a.id), false);
  assert.equal(game.boxOwner.has(4), false, 'مربعه تحرر');
  assert.equal(game.eliminated.at(-1).reason, 'left');
  await hideAt(w, game, b, 4);
  assert.equal(game.hides.get(b.id), 4, 'غيره يقدر ياخذه');
  await hideAt(w, game, c, 9);
  await waitFor(() => game.phase === 'hunting', 1000);
  await memberRemove.execute(ctx, b);
  assert.equal(game.players.has(b.id), false);
  assert.ok(game.alive);
  await memberRemove.execute(ctx, c);
  await waitFor(() => !game.alive, 1000);
  assert.ok(sent(w, 'القناص فاز!')[0]);
  assert.equal(game.timers.size, 0);
});

test('القناص: القناص يغادر السيرفر ← تنتهي الجولة فوراً بإعلان واضح (بالاختباء وبالصيد)', async () => {
  for (const phase of ['hiding', 'hunting']) {
    const w = world(4);
    const game = await startGame(w);
    if (phase === 'hunting') await hideAll(w, game, [1, 2, 3]);
    await memberRemove.execute(ctx, member(w, game.sniperId));
    assert.equal(game.alive, false, phase);
    assert.ok(sent(w, 'انتهت الجولة بسبب مغادرة القناص للسيرفر')[0], phase);
    assert.equal(game.timers.size, 0);
    assert.equal(sniper._internal.games.size, 0);
    assert.equal(game.hides.size, 0);
  }
});

// =================== الموثوقية والذاكرة ===================

test('القناص: فشل توليد الصورة ما يوقف اللعبة (شبكة نصية بدالها)', async () => {
  const orig = grid.gridAttachment;
  grid.gridAttachment = () => null;
  try {
    const w = world(3);
    const game = await startGame(w);
    const g = sent(w, 'ساحة القناص')[0];
    assert.ok(!g[2].files);
    assert.match(JSON.stringify(g[2].embeds[0].toJSON()), /```/);
    await hideAll(w, game, [1, 2]);
    const i = btn(w, member(w, game.sniperId), `sn:panel:${game.id}`);
    await dispatch(i);
    assert.match(lastPayload(i).text, /الشبكة/);
    assert.equal(lastPayload(i).embeds[0].image, undefined);
    sniper.endGame(game, 'test');
  } finally {
    grid.gridAttachment = orig;
  }
});

test('القناص: ما فيه تسريب — كل نهاية/إلغاء/stopAll تنظف المؤقتات والخرائط والأسرار', async () => {
  // لوبي منتهي
  sniper.configure({ lobbyTtlMs: 40 });
  const w = world(2);
  await dispatch(cmd(w, w.host));
  const g0 = sniper.get(w.channel.id);
  await waitFor(() => !g0.alive, 2000);
  assert.equal(g0.phase, 'cancelled');
  assert.equal(g0.timers.size, 0);

  // stopAll بنص الصيد
  sniper.configure({ lobbyTtlMs: 60_000 });
  const w2 = world(4);
  const game = await startGame(w2);
  await hideAll(w2, game, [1, 2, 3]);
  assert.ok(game.timers.size >= 2, 'مؤقت الصيد + التحديث');
  sniper.stopAll();
  assert.equal(game.timers.size, 0);
  assert.equal(game.hides.size + game.boxOwner.size + game.shot.size, 0);
  assert.equal(sniper._internal.games.size, 0);
  for (const k of ['hideTimer', 'huntTimer', 'statusTimer', 'countdownTimer', 'lobbyTimer']) assert.equal(game[k], null, k);

  // زر من جولة منتهية
  const i = btn(w2, w2.members[1], `sn:hide:${game.id}`);
  await dispatch(i);
  assert.match(lastPayload(i).text, /هذي الجولة انتهت/);
});
