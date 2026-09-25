'use strict';

// مدير اللوبي المشترك لكل ألعاب ديسكورد الجماعية (روليت الإقصاء، الدول، القناص…).
// كل لعبة = createLobbyManager(spec) ← نسخة مستقلة بـMap خاصة فيها (مفتاحها
// القناة)، فجولات الألعاب المختلفة ما تتعارض أبداً.
//
// اللي هنا (مرة وحدة لكل الألعاب):
//   lobby     : بانتظار لاعبين (أزرار: انضمام / خروج / طرد لاعب للهوست)
//   countdown : وصلنا الحد الأدنى ← عداد 30 ثانية (الانضمام مستمر). لو نزل
//               العدد تحته يرجع lobby ويتلغى العداد، ولو رجع يبدأ عداد جديد.
//   بعدها     : الأزرار تتقفل ← spec.onStart(game) — واللعبة تكمل مراحلها.
//   cancelled : لوبي ما بدأ خلال 10 دقائق.
//   ended     : endGame ← كل المؤقتات تنلغى، والجولة تنشال من الذاكرة.
// + المؤقتات (setTimer/wait/clearAllTimers)، تعديل الرسائل الآمن، ومغادرة
//   السيرفر (باللوبي هنا، وبعد البداية ← spec.onMemberLeft).
//
// الـspec:
//   key, logName, prefix (بادئة الأزرار), command, title, lobbyIntro
//   defaults                    : توقيتات/حدود اللعبة (تُدمج فوق LOBBY_DEFAULTS)
//   onCreate(game)              : تجهيز حالة اللعبة الخاصة
//   onStart(game)   (async)     : بعد العداد وقفل الأزرار (واللاعبين ≥ 2)
//   onMemberLeft(game, player)  : لاعب غادر السيرفر بعد ما بدأت اللعبة
//   onEnd(game)                 : تنظيف الحالة الخاصة (أسرار، خرائط…)
//   handleAction(interaction, action, args, game) : أزرار/قوائم خاصة باللعبة

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const crypto = require('node:crypto');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');

const LOBBY_DEFAULTS = Object.freeze({
  minPlayers: 3,
  maxPlayers: 25,
  countdownMs: 30 * 1000,
  lobbyTtlMs: 10 * 60 * 1000 // لوبي ما بدأ خلال 10 دقائق ← يتلغى (ما يعلّق القناة)
});

const OPEN_PHASES = ['lobby', 'countdown'];

const displayName = (p) => eb.safeName(p.name).replace(/[*_~`|>]/g, '');

// قائمة أسطر ضمن حد حقل الـEmbed (1024) بدون ما تنقص بنص سطر
function fitLines(lines, max = 1000) {
  const out = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const rest = `\n… و${lines.length - i} كمان`;
    if (len + lines[i].length + 1 + (i < lines.length - 1 ? rest.length : 0) > max) {
      out.push(rest.trim());
      break;
    }
    out.push(lines[i]);
    len += lines[i].length + 1;
  }
  return out.join('\n');
}

function createLobbyManager(spec) {
  const S = {
    logName: 'لعبة',
    title: '🎮 لعبة',
    lobbyIntro: 'اضغط **انضمام** وادخل اللعبة!',
    ...spec
  };
  const hook = (name, ...args) => (typeof S[name] === 'function' ? S[name](...args) : undefined);
  const DEFAULTS = Object.freeze({ ...LOBBY_DEFAULTS, ...(spec.defaults || {}) });

  let settings = { ...DEFAULTS, random: Math.random };
  const configure = (overrides = {}) => {
    settings = { ...settings, ...overrides };
  };
  const resetSettings = () => {
    settings = { ...DEFAULTS, random: Math.random };
  };

  const games = new Map(); // channelId -> game

  // ---------------- المؤقتات ----------------
  // كل مؤقت مسجّل بـgame.timers ويتلغى مع النهاية، وما ينفذ لو اللعبة ماتت
  function setTimer(game, fn, ms) {
    const t = setTimeout(() => {
      game.timers.delete(t);
      if (!game.alive) return;
      Promise.resolve()
        .then(fn)
        .catch((err) => logger.error(`${S.logName}: خطأ بمؤقت`, { channelId: game.channelId, error: err }));
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
    // كل حقل اسمه ينتهي بـTimer (countdownTimer، pickTimer، hideTimer…) يتصفّر
    for (const k of Object.keys(game)) if (k.endsWith('Timer')) game[k] = null;
  }
  // انتظار قابل للإلغاء (يتلغى مع clearAllTimers)
  function wait(game, ms) {
    return new Promise((resolve) => setTimer(game, resolve, ms));
  }

  async function safeEdit(game, message, payload) {
    if (!message) return false;
    try {
      await message.edit(payload);
      return true;
    } catch (err) {
      logger.warn(`${S.logName}: تعذّر تعديل الرسالة`, { channelId: game.channelId, code: err.code });
      // الرسالة انحذفت/القناة ما عاد نوصلها ← ننهي اللعبة بهدوء
      if ([10003, 10008, 50001, 50013].includes(err.code)) await endGame(game, 'message_gone');
      return false;
    }
  }

  // إرسال بالقناة بدون ما يوقف اللعبة لو فشل
  async function safeSend(game, payload, what = 'رسالة') {
    try {
      return await game.channel.send(payload);
    } catch (err) {
      logger.warn(`${S.logName}: تعذّر إرسال ${what}`, { channelId: game.channelId, code: err.code });
      return null;
    }
  }

  // خاص للاعب (مع مهلة) — يرمي خطأ لو فشل، والمستدعي يقرر (غالباً سطر بالسجل)
  async function resolveUser(game, playerId) {
    const p = game.players.get(playerId);
    if (p && p.user && typeof p.user.send === 'function') return p.user;
    const guild = game.channel && game.channel.guild;
    if (!guild) return null;
    const m = await guild.members.fetch(playerId).catch(() => null);
    if (!m) return null;
    if (m.user && typeof m.user.send === 'function') return m.user;
    const fromCol = typeof m.get === 'function' ? m.get(playerId) : null; // Collection
    return fromCol && fromCol.user ? fromCol.user : null;
  }
  async function sendDm(game, playerId, payload, timeoutMs = settings.dmTimeoutMs || 5000) {
    const user = await resolveUser(game, playerId);
    if (!user) throw Object.assign(new Error('user not found'), { code: 'NO_USER' });
    let t;
    try {
      return await Promise.race([
        user.send(payload),
        new Promise((_, rej) => (t = setTimeout(() => rej(Object.assign(new Error('DM timeout'), { code: 'TIMEOUT' })), timeoutMs)))
      ]);
    } finally {
      clearTimeout(t);
    }
  }

  // ---------------- العرض ----------------
  const isOpen = (game) => OPEN_PHASES.includes(game.phase);

  function lobbyPayload(game) {
    const list = [...game.players.values()];
    const started = !['lobby', 'countdown', 'cancelled'].includes(game.phase);
    const title =
      game.phase === 'countdown'
        ? `${S.title} — اللعبة تبدأ قريباً!`
        : started
          ? `${S.title} — بدأت اللعبة 🔒`
          : game.phase === 'cancelled'
            ? `${S.title} — انتهت مهلة الانتظار`
            : `${S.title} — بانتظار لاعبين`;
    let status;
    if (game.phase === 'countdown') {
      status = `⏳ اللعبة تبدأ ${`<t:${Math.ceil(game.countdownEndsAt / 1000)}:R>`} — تقدر تنضم لين ذاك الوقت!`;
    } else if (started) {
      status = `🔒 الانضمام انقفل — تابعوا الجولات تحت 👇`;
    } else if (game.phase === 'cancelled') {
      status = `⌛ ما اكتمل العدد — اكتب \`${S.command}\` من جديد.`;
    } else {
      const need = Math.max(0, settings.minPlayers - list.length);
      status = `🕹️ نحتاج **${need}** ${need === 1 ? 'لاعب' : 'لاعبين'} كمان عشان يبدأ العد التنازلي.`;
    }
    const embed = eb.brand({
      tone: game.phase === 'countdown' ? 'gold' : 'primary',
      title,
      description: `${S.lobbyIntro}\n\n${status}`
    });
    embed.addFields(
      eb.field(
        `👥 المشاركون (${list.length})`,
        list.length ? fitLines(list.map((p, i) => `\`${i + 1}\` ${displayName(p)}`)) : 'ما أحد انضم بعد — كن الأول!',
        false
      ),
      eb.field('🎮 الحد الأدنى', `${settings.minPlayers} لاعبين`, true),
      eb.field('👑 صاحب اللعبة', `<@${game.hostId}>`, true)
    );
    const locked = !isOpen(game);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${S.prefix}:join:${game.id}`).setStyle(ButtonStyle.Success).setLabel('انضمام').setEmoji('✅').setDisabled(locked),
      new ButtonBuilder().setCustomId(`${S.prefix}:leave:${game.id}`).setStyle(ButtonStyle.Secondary).setLabel('خروج').setEmoji('🚪').setDisabled(locked),
      new ButtonBuilder().setCustomId(`${S.prefix}:kick:${game.id}`).setStyle(ButtonStyle.Danger).setLabel('طرد لاعب').setEmoji('👢').setDisabled(locked)
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
  }

  // ---------------- إنشاء اللعبة ----------------
  function create({ channel, guildId, hostId }) {
    if (games.has(channel.id)) return null;
    const game = {
      id: crypto.randomBytes(4).toString('hex'),
      kind: S.key,
      channelId: channel.id,
      channel,
      guildId,
      hostId,
      players: new Map(), // id -> { id, name, user? } (بترتيب الانضمام)
      phase: 'lobby',
      countdownEndsAt: null,
      message: null, // رسالة اللوبي
      timers: new Set(),
      countdownTimer: null,
      lobbyTimer: null,
      alive: true,
      createdAt: Date.now()
    };
    hook('onCreate', game);
    games.set(channel.id, game);
    game.lobbyTimer = setTimer(game, () => cancelLobby(game), settings.lobbyTtlMs);
    return game;
  }

  const get = (channelId) => games.get(channelId) || null;

  // بعد أي تغيير بعدد اللاعبين: يبدأ/يلغي العداد حسب العدد
  function syncCountdown(game) {
    const n = game.players.size;
    if (game.phase === 'lobby' && n >= settings.minPlayers) {
      game.phase = 'countdown';
      game.countdownEndsAt = Date.now() + settings.countdownMs;
      game.countdownTimer = setTimer(game, () => start(game), settings.countdownMs);
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
    game.players.set(user.id, { id: user.id, name: user.name, user: user.user || null });
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

  // انتهى العداد ← قفل الأزرار ← اللعبة تبدأ مراحلها الخاصة
  async function start(game) {
    if (!game.alive || game.phase !== 'countdown') return;
    clearTimer(game, game.lobbyTimer);
    game.lobbyTimer = null;
    game.countdownTimer = null;
    game.phase = 'running';
    await safeEdit(game, game.message, lobbyPayload(game)); // قفل الأزرار
    if (!game.alive) return;
    if (game.players.size < 2) return endGame(game, 'not_enough');
    try {
      await hook('onStart', game);
    } catch (err) {
      logger.error(`${S.logName}: خطأ ببداية اللعبة`, { channelId: game.channelId, error: err });
      await endGame(game, 'start_failed');
    }
  }

  // عضو طلع من السيرفر ← ينشال من أي جولة بهالسيرفر بدون ما تنكسر
  async function removeMember(guildId, userId) {
    for (const game of [...games.values()]) {
      if (game.guildId !== guildId || !game.players.has(userId)) continue;
      try {
        const p = game.players.get(userId);
        if (isOpen(game)) {
          game.players.delete(userId);
          syncCountdown(game);
          await safeEdit(game, game.message, lobbyPayload(game));
          continue;
        }
        if (game.phase === 'ended' || game.phase === 'cancelled') continue;
        await hook('onMemberLeft', game, p);
      } catch (err) {
        logger.error(`${S.logName}: خطأ بإزالة عضو غادر`, { channelId: game.channelId, error: err });
      }
    }
  }

  async function endGame(game, reason) {
    if (!game.alive) return;
    game.alive = false;
    clearAllTimers(game);
    if (game.phase !== 'cancelled') game.phase = 'ended';
    if (games.get(game.channelId) === game) games.delete(game.channelId);
    try {
      hook('onEnd', game);
    } catch (err) {
      logger.warn(`${S.logName}: خطأ بتنظيف اللعبة`, { channelId: game.channelId, error: err });
    }
    logger.info(`${S.logName}: انتهت اللعبة`, { channelId: game.channelId, reason });
  }

  // للإيقاف/الاختبارات: ينهي كل الجولات ويلغي كل المؤقتات
  function stopAll() {
    for (const game of [...games.values()]) {
      game.alive = false;
      clearAllTimers(game);
      try {
        hook('onEnd', game);
      } catch {
        /* تنظيف فقط */
      }
    }
    games.clear();
  }

  return {
    key: S.key,
    prefix: S.prefix,
    command: S.command,
    title: S.title,
    DEFAULTS,
    configure,
    resetSettings,
    settings: () => settings,
    create,
    get,
    isOpen,
    join,
    leave,
    kick,
    start,
    removeMember,
    endGame,
    stopAll,
    lobbyPayload,
    setTimer,
    clearTimer,
    clearAllTimers,
    wait,
    safeEdit,
    safeSend,
    sendDm,
    handleAction: S.handleAction || null,
    _internal: { games, settings: () => settings }
  };
}

module.exports = { createLobbyManager, LOBBY_DEFAULTS, displayName, fitLines };
