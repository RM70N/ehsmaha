'use strict';

// محرّك لعبة "روليت الإقصاء" — كل الحالة بالذاكرة (Map مفتاحها القناة)، لأنها
// لحظية وتنتهي بانتهاء الجولة.
//
// المراحل:
//   lobby     : بانتظار لاعبين (أزرار: انضمام / خروج / طرد لاعب)
//   countdown : وصلنا 3 لاعبين ← عداد 30 ثانية (الانضمام مستمر). لو نزل العدد
//               تحت 3 يرجع lobby ويتلغى العداد، ولو رجع 3 يبدأ عداد جديد.
//   running   : الأزرار تتقفل ← جولات: دوران ← اللاعب المختار يطرد واحد خلال
//               15 ثانية (أو ما يختار = دوران جديد بدون طرد) ← لين يبقى واحد.
//   ended     : إعلان الفائز + ترتيب الإقصاء، وتنظيف كل المؤقتات.
//
// الأمان: كل مؤقت مسجّل بـgame.timers ويتلغى مع كل انتقال حالة وعند النهاية،
// وكل خطوة async تتأكد إن اللعبة لسا حية (game.alive) قبل ما تكمل.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('node:crypto');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');

const DEFAULTS = Object.freeze({
  minPlayers: 3,
  maxPlayers: 25, // حد قائمة ديسكورد المنسدلة (اللاعب المختار + 24 خيار)
  countdownMs: 30 * 1000,
  pickMs: 15 * 1000,
  // تأثير الدوران: تعديلات متتالية تتباطأ تدريجياً (~3.5 ثانية)
  spinDelays: [300, 350, 400, 450, 550, 650, 800],
  afterPickMs: 2500,
  afterSkipMs: 2000,
  lobbyTtlMs: 10 * 60 * 1000, // لوبي ما بدأ خلال 10 دقائق ← يتلغى (ما يعلّق القناة)
  maxSkips: 5 // 5 مرات ورا بعض ما أحد اختار ← اللعبة تنتهي (ما تدور للأبد)
});

let settings = { ...DEFAULTS, random: Math.random };
function configure(overrides = {}) {
  settings = { ...settings, ...overrides };
}
function resetSettings() {
  settings = { ...DEFAULTS, random: Math.random };
}

const games = new Map(); // channelId -> game

// ---------------- المؤقتات ----------------
function setTimer(game, fn, ms) {
  const t = setTimeout(() => {
    game.timers.delete(t);
    if (!game.alive) return;
    Promise.resolve()
      .then(fn)
      .catch((err) => logger.error('روليت: خطأ بمؤقت', { channelId: game.channelId, error: err }));
  }, ms);
  game.timers.add(t);
  return t;
}
function clearTimer(game, t) {
  if (!t) return;
  clearTimeout(t);
  game.timers.delete(t);
}
function clearAllTimers(game) {
  for (const t of game.timers) clearTimeout(t);
  game.timers.clear();
  game.countdownTimer = null;
  game.pickTimer = null;
  game.lobbyTimer = null;
}
// انتظار قابل للإلغاء (يتلغى مع clearAllTimers)
function wait(game, ms) {
  return new Promise((resolve) => setTimer(game, resolve, ms));
}

// ---------------- أدوات ----------------
const names = (game) => [...game.players.values()];
const displayName = (p) => eb.safeName(p.name).replace(/[*_~`|>]/g, '');

async function safeEdit(game, message, payload) {
  if (!message) return false;
  try {
    await message.edit(payload);
    return true;
  } catch (err) {
    logger.warn('روليت: تعذّر تعديل الرسالة', { channelId: game.channelId, code: err.code });
    // الرسالة انحذفت/القناة ما عاد نوصلها ← ننهي اللعبة بهدوء
    if ([10003, 10008, 50001, 50013].includes(err.code)) await endGame(game, 'message_gone');
    return false;
  }
}

// ---------------- العرض ----------------
function lobbyPayload(game) {
  const list = names(game);
  const started = game.phase !== 'lobby' && game.phase !== 'countdown';
  const title =
    game.phase === 'countdown'
      ? '🎯 روليت الإقصاء — اللعبة تبدأ قريباً!'
      : started
        ? '🎯 روليت الإقصاء — بدأت اللعبة 🔒'
        : game.phase === 'cancelled'
          ? '🎯 روليت الإقصاء — انتهت مهلة الانتظار'
          : '🎯 روليت الإقصاء — بانتظار لاعبين';
  let status;
  if (game.phase === 'countdown') {
    status = `⏳ اللعبة تبدأ ${`<t:${Math.ceil(game.countdownEndsAt / 1000)}:R>`} — تقدر تنضم لين ذاك الوقت!`;
  } else if (started) {
    status = `🔒 الانضمام انقفل — تابعوا الجولات تحت 👇`;
  } else if (game.phase === 'cancelled') {
    status = '⌛ ما اكتمل العدد — اكتب `/روليت` من جديد.';
  } else {
    const need = Math.max(0, settings.minPlayers - list.length);
    status = `🕹️ نحتاج **${need}** ${need === 1 ? 'لاعب' : 'لاعبين'} كمان عشان يبدأ العد التنازلي.`;
  }
  const embed = eb.brand({
    tone: game.phase === 'countdown' ? 'gold' : 'primary',
    title,
    description:
      `اضغط **انضمام** وادخل الروليت! كل جولة يدور ويختار لاعب، واللاعب المختار يطرد واحد — **آخر واحد يبقى يفوز 🏆**\n\n${status}`
  });
  embed.addFields(
    eb.field(`👥 المشاركون (${list.length})`, list.length ? list.map((p, i) => `\`${i + 1}\` ${displayName(p)}`).join('\n') : 'ما أحد انضم بعد — كن الأول!', false),
    eb.field('🎮 الحد الأدنى', `${settings.minPlayers} لاعبين`, true),
    eb.field('👑 صاحب اللعبة', `<@${game.hostId}>`, true)
  );
  const locked = started || game.phase === 'cancelled';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`rt:join:${game.id}`).setStyle(ButtonStyle.Success).setLabel('انضمام').setEmoji('✅').setDisabled(locked),
    new ButtonBuilder().setCustomId(`rt:leave:${game.id}`).setStyle(ButtonStyle.Secondary).setLabel('خروج').setEmoji('🚪').setDisabled(locked),
    new ButtonBuilder().setCustomId(`rt:kick:${game.id}`).setStyle(ButtonStyle.Danger).setLabel('طرد لاعب').setEmoji('👢').setDisabled(locked)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function eliminatedLine(game) {
  if (!game.eliminated.length) return null;
  return game.eliminated.map((e) => `~~${displayName(e)}~~`).join(' · ');
}

// إطار الروليت: القائمة مع المؤشر 🔻 عند اللاعب الحالي
function roundPayload(game, { pointerId = null, landed = false, note = null, choosing = false, finalChoice = null } = {}) {
  const list = names(game);
  const wheel = list
    .map((p) => {
      if (p.id === pointerId) return landed ? `🎯 **${displayName(p)}** ⬅️` : `🔻 **${displayName(p)}**`;
      return `▫️ ${displayName(p)}`;
    })
    .join('\n');
  let body = `**المتبقين: ${list.length}**\n\n${wheel}`;
  if (landed && choosing) {
    body += `\n\n🎯 الروليت وقف على <@${pointerId}>!\nاختر مين تطرد من القائمة تحت — ينتهي الوقت ${`<t:${Math.ceil(game.pickEndsAt / 1000)}:R>`} ⏳`;
  }
  if (note) body += `\n\n${note}`;
  const embed = eb.brand({
    tone: landed ? 'gold' : 'deep',
    title: `🎡 روليت الإقصاء — الجولة ${game.round}`,
    description: body
  });
  const out = eliminatedLine(game);
  if (out) embed.addFields(eb.field(`💀 خرجوا (${game.eliminated.length})`, out, false));

  const components = [];
  if (choosing) {
    const options = list.filter((p) => p.id !== pointerId).slice(0, 25).map((p) => ({ label: p.name.slice(0, 100), value: p.id, emoji: '👢' }));
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`rt:pick:${game.id}:${game.round}`)
          .setPlaceholder('اختر اللاعب اللي تبي تطرده')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options)
          .setDisabled(!!finalChoice)
      )
    );
  }
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}

function winnerPayload(game, winner) {
  const order = game.eliminated
    .map((e, i) => `\`${i + 1}\` ${displayName(e)}${e.by ? ` — طرده ${displayName(e.by)}` : e.reason === 'left' ? ' — طلع من السيرفر' : ''}`)
    .join('\n');
  const embed = eb.brand({
    tone: 'gold',
    title: '🏆 روليت الإقصاء — عندنا فائز!',
    description: `🎉 مبروك <@${winner.id}>! صمدت لآخر الروليت وفزت باللعبة 👑\n\nالعب ألعاب أكثر على ehsmaha.com`
  });
  embed.addFields(
    eb.field('📜 ترتيب الإقصاء (من خرج أول)', order || '—', false),
    eb.field('👑 الفائز', `<@${winner.id}>`, true),
    eb.field('🎮 عدد اللاعبين', String(game.eliminated.length + 1), true)
  );
  return { content: `🏆 <@${winner.id}>`, embeds: [embed], allowedMentions: { users: [winner.id] } };
}

// ---------------- إنشاء اللعبة ----------------
function create({ channel, guildId, hostId }) {
  if (games.has(channel.id)) return null;
  const game = {
    id: crypto.randomBytes(4).toString('hex'),
    channelId: channel.id,
    channel,
    guildId,
    hostId,
    players: new Map(), // id -> { id, name } (بترتيب الانضمام)
    eliminated: [], // { id, name, by?, reason }
    phase: 'lobby',
    round: 0,
    chooserId: null,
    countdownEndsAt: null,
    pickEndsAt: null,
    skips: 0,
    message: null, // رسالة اللوبي
    roundMessage: null,
    timers: new Set(),
    countdownTimer: null,
    pickTimer: null,
    lobbyTimer: null,
    alive: true,
    createdAt: Date.now()
  };
  games.set(channel.id, game);
  game.lobbyTimer = setTimer(game, () => cancelLobby(game), settings.lobbyTtlMs);
  return game;
}

const get = (channelId) => games.get(channelId) || null;
const isOpen = (game) => game.phase === 'lobby' || game.phase === 'countdown';

// ---------------- اللوبي ----------------
// بعد أي تغيير بعدد اللاعبين: يبدأ/يلغي العداد حسب العدد
function syncCountdown(game) {
  const n = game.players.size;
  if (game.phase === 'lobby' && n >= settings.minPlayers) {
    game.phase = 'countdown';
    game.countdownEndsAt = Date.now() + settings.countdownMs;
    game.countdownTimer = setTimer(game, () => startRounds(game), settings.countdownMs);
  } else if (game.phase === 'countdown' && n < settings.minPlayers) {
    clearTimer(game, game.countdownTimer);
    game.countdownTimer = null;
    game.countdownEndsAt = null;
    game.phase = 'lobby';
  }
}

function join(game, user) {
  if (!isOpen(game)) return { ok: false, reason: 'STARTED' };
  if (game.players.has(user.id)) return { ok: false, reason: 'ALREADY' };
  if (game.players.size >= settings.maxPlayers) return { ok: false, reason: 'FULL' };
  game.players.set(user.id, { id: user.id, name: user.name });
  syncCountdown(game);
  return { ok: true };
}

function leave(game, userId) {
  if (!isOpen(game)) return { ok: false, reason: 'STARTED' };
  if (!game.players.has(userId)) return { ok: false, reason: 'NOT_JOINED' };
  game.players.delete(userId);
  syncCountdown(game);
  return { ok: true };
}

function kick(game, byId, targetId) {
  if (byId !== game.hostId) return { ok: false, reason: 'NOT_HOST' };
  if (!isOpen(game)) return { ok: false, reason: 'STARTED' };
  const target = game.players.get(targetId);
  if (!target) return { ok: false, reason: 'NOT_JOINED' };
  game.players.delete(targetId);
  syncCountdown(game);
  return { ok: true, target };
}

async function cancelLobby(game) {
  if (!isOpen(game)) return;
  game.phase = 'cancelled';
  await safeEdit(game, game.message, lobbyPayload(game));
  await endGame(game, 'lobby_timeout');
}

// ---------------- الجولات ----------------
async function startRounds(game) {
  if (!game.alive || game.phase !== 'countdown') return;
  clearTimer(game, game.lobbyTimer);
  game.phase = 'running';
  game.countdownTimer = null;
  await safeEdit(game, game.message, lobbyPayload(game)); // قفل الأزرار
  if (!game.alive) return;
  if (game.players.size < 2) return endGame(game, 'not_enough');
  try {
    game.roundMessage = await game.channel.send({
      embeds: [eb.brand({ tone: 'deep', title: '🎡 روليت الإقصاء', description: `بدأت اللعبة بـ **${game.players.size}** لاعبين! الروليت يدور... 🎲` })],
      allowedMentions: { parse: [] }
    });
  } catch (err) {
    logger.warn('روليت: تعذّر إرسال رسالة الجولة', { channelId: game.channelId, code: err.code });
    return endGame(game, 'send_failed');
  }
  await nextSpin(game);
}

// دوران واحد: المؤشر يتنقل بين اللاعبين ويتباطأ، ويقف على لاعب عشوائي
async function nextSpin(game) {
  if (!game.alive || game.phase !== 'running') return;
  if (game.players.size <= 1) return finish(game);
  game.round += 1;
  game.chooserId = null;
  const list = names(game);
  const finalIndex = Math.floor(settings.random() * list.length);
  const frames = settings.spinDelays.length;
  // نبدأ من مكان يخلي آخر إطار يقع بالضبط على اللاعب العشوائي
  const start = (((finalIndex - (frames - 1)) % list.length) + list.length) % list.length;
  for (let f = 0; f < frames; f++) {
    const current = list[(start + f) % list.length];
    if (!(await safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: current.id })))) return;
    await wait(game, settings.spinDelays[f]);
    if (!game.alive) return;
  }
  const chosen = list[finalIndex];
  // لو اللاعب المختار طلع من السيرفر أثناء الدوران ← نعيد الدوران
  if (!game.players.has(chosen.id)) return nextSpin(game);
  game.chooserId = chosen.id;
  game.pickEndsAt = Date.now() + settings.pickMs;
  game.pickTimer = setTimer(game, () => onPickTimeout(game, game.round), settings.pickMs);
  await safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: chosen.id, landed: true, choosing: true }));
}

async function onPickTimeout(game, round) {
  if (!game.alive || game.round !== round || !game.chooserId) return;
  const chooser = game.players.get(game.chooserId);
  game.chooserId = null;
  game.pickTimer = null;
  game.skips += 1;
  if (game.skips >= settings.maxSkips) {
    await safeEdit(game, game.roundMessage, roundPayload(game, { note: '⌛ ما أحد اختار كذا مرة ورا بعض — انتهت اللعبة بدون فائز.' }));
    return endGame(game, 'inactive');
  }
  await safeEdit(game, game.roundMessage, roundPayload(game, {
    pointerId: chooser && chooser.id,
    landed: true,
    note: `⌛ ${chooser ? displayName(chooser) : 'اللاعب'} ما اختار خلال ${Math.round(settings.pickMs / 1000)} ثانية — **ما انطرد أحد**، والروليت يدور من جديد 🎲`
  }));
  await wait(game, settings.afterSkipMs);
  await nextSpin(game);
}

/**
 * اللاعب المختار يطرد لاعب.
 * @returns {{ok:boolean, reason?:string, payload?:object}}
 */
function pick(game, userId, targetId, round) {
  if (game.phase !== 'running' || !game.chooserId || String(round) !== String(game.round)) return { ok: false, reason: 'EXPIRED' };
  if (userId !== game.chooserId) return { ok: false, reason: 'NOT_YOUR_TURN' };
  if (targetId === userId || !game.players.has(targetId)) return { ok: false, reason: 'BAD_TARGET' };
  clearTimer(game, game.pickTimer);
  game.pickTimer = null;
  const by = game.players.get(userId);
  const target = game.players.get(targetId);
  game.players.delete(targetId);
  game.eliminated.push({ id: target.id, name: target.name, by: { id: by.id, name: by.name }, reason: 'picked' });
  game.chooserId = null;
  game.skips = 0;
  const payload = roundPayload(game, {
    pointerId: by.id,
    landed: true,
    note: `💥 **${displayName(by)}** طرد **${displayName(target)}** من الروليت!`
  });
  // الجولة الجاية بعد لحظات (أو إعلان الفائز)
  setTimer(game, () => (game.players.size <= 1 ? finish(game) : nextSpin(game)), settings.afterPickMs);
  return { ok: true, payload, target };
}

async function finish(game) {
  if (!game.alive) return;
  const [winner] = names(game);
  game.phase = 'ended';
  if (winner) {
    try {
      await game.channel.send(winnerPayload(game, winner));
    } catch (err) {
      logger.warn('روليت: تعذّر إعلان الفائز', { channelId: game.channelId, code: err.code });
    }
  }
  await endGame(game, 'finished');
}

// عضو طلع من السيرفر ← ينشال من أي لعبة بهالسيرفر بدون ما تنكسر
async function removeMember(guildId, userId) {
  for (const game of games.values()) {
    if (game.guildId !== guildId || !game.players.has(userId)) continue;
    try {
      const p = game.players.get(userId);
      game.players.delete(userId);
      if (isOpen(game)) {
        syncCountdown(game);
        await safeEdit(game, game.message, lobbyPayload(game));
        continue;
      }
      if (game.phase !== 'running') continue;
      game.eliminated.push({ id: p.id, name: p.name, reason: 'left' });
      if (game.players.size <= 1) {
        clearTimer(game, game.pickTimer);
        await finish(game);
      } else if (game.chooserId === userId) {
        // صاحب الدور طلع ← نلغي مهلته وندوّر من جديد
        clearTimer(game, game.pickTimer);
        game.pickTimer = null;
        game.chooserId = null;
        setTimer(game, () => nextSpin(game), settings.afterSkipMs);
      } else if (game.chooserId) {
        // تحديث قائمة الاختيار بدون اللاعب اللي طلع
        await safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: game.chooserId, landed: true, choosing: true }));
      }
    } catch (err) {
      logger.error('روليت: خطأ بإزالة عضو غادر', { channelId: game.channelId, error: err });
    }
  }
}

async function endGame(game, reason) {
  if (!game.alive) return;
  game.alive = false;
  clearAllTimers(game);
  if (game.phase !== 'cancelled') game.phase = 'ended';
  if (games.get(game.channelId) === game) games.delete(game.channelId);
  logger.info('روليت: انتهت اللعبة', { channelId: game.channelId, reason, rounds: game.round });
}

// للإيقاف/الاختبارات: ينهي كل الألعاب ويلغي كل المؤقتات
function stopAll() {
  for (const game of [...games.values()]) {
    game.alive = false;
    clearAllTimers(game);
  }
  games.clear();
}

module.exports = {
  DEFAULTS,
  configure,
  resetSettings,
  create,
  get,
  join,
  leave,
  kick,
  pick,
  startRounds,
  nextSpin,
  removeMember,
  endGame,
  stopAll,
  lobbyPayload,
  roundPayload,
  winnerPayload,
  _internal: { games, settings: () => settings }
};
