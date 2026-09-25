'use strict';

// محرّك مشترك لألعاب الإقصاء الجماعية (روليت الإقصاء، لعبة الدول، …).
// كل لعبة = createEliminationGame(spec) ← نسخة مستقلة بـMap خاصة فيها
// (مفتاحها القناة)، فجولات الألعاب المختلفة ما تتعارض أبداً.
//
// المراحل:
//   lobby     : بانتظار لاعبين (أزرار: انضمام / خروج / طرد لاعب)
//   countdown : وصلنا الحد الأدنى ← عداد 30 ثانية (الانضمام مستمر). لو نزل
//               العدد تحته يرجع lobby ويتلغى العداد، ولو رجع يبدأ عداد جديد.
//   running   : الأزرار تتقفل ← (spec.onStart) ← جولات: دوران ← صاحب الدور
//               يختار مين يُقصى خلال 15 ثانية (أو ما يختار = دوران جديد بدون
//               إقصاء) ← لين يبقى واحد.
//   ended     : إعلان الفائز + ترتيب الإقصاء، وتنظيف كل المؤقتات.
//
// الأمان: كل مؤقت مسجّل بـgame.timers ويتلغى مع كل انتقال حالة وعند النهاية،
// وكل خطوة async تتأكد إن اللعبة لسا حية (game.alive) قبل ما تكمل.
//
// الـspec (كل الحقول النصية لها قيم افتراضية بأسلوب الروليت):
//   key, logName, prefix (بادئة الأزرار), command, title, wheelTitle, lobbyIntro
//   defaults            : توقيتات/حدود (تُدمج فوق DEFAULTS)
//   allowSelfPick       : صاحب الدور يقدر يختار نفسه؟
//   optionEmoji         : رمز خيارات قائمة الإقصاء
//   pickPlaceholder, choosePrompt(game, chooserId)
//   startText(game), skipNote(game, chooser), pickNote(game, by, target)
//   outLabel(game, entry)          : اسم اللاعب المُقصى بسطر "خرجوا"
//   orderLine(game, entry, index)  : سطر بترتيب الإقصاء بإعلان الفائز
//   winnerTitle, winnerText(game, winner), winnerFields(game, winner), winnerThumbnail(game, winner)
//   hooks: onCreate(game), onStart(game), onEliminated(game, entry), onEnd(game)

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const crypto = require('node:crypto');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');

const BASE_DEFAULTS = Object.freeze({
  minPlayers: 3,
  maxPlayers: 25, // حد قائمة ديسكورد المنسدلة (25 خيار بالقائمة الواحدة)
  countdownMs: 30 * 1000,
  pickMs: 15 * 1000,
  // تأثير الدوران: تعديلات متتالية تتباطأ تدريجياً (~3.5 ثانية)
  spinDelays: [300, 350, 400, 450, 550, 650, 800],
  afterPickMs: 2500,
  afterSkipMs: 2000,
  lobbyTtlMs: 10 * 60 * 1000, // لوبي ما بدأ خلال 10 دقائق ← يتلغى (ما يعلّق القناة)
  maxSkips: 5 // 5 مرات ورا بعض ما أحد اختار ← اللعبة تنتهي (ما تدور للأبد)
});

const MENU_SIZE = 25; // خيارات القائمة الواحدة
const MAX_MENUS = 5; // صفوف الرسالة

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

function createEliminationGame(spec) {
  const S = {
    logName: 'لعبة',
    title: '🎮 لعبة',
    wheelTitle: '🎡 لعبة',
    lobbyIntro: 'اضغط **انضمام** وادخل اللعبة! **آخر واحد يبقى يفوز 🏆**',
    allowSelfPick: false,
    optionEmoji: '👢',
    pickPlaceholder: 'اختر اللاعب',
    choosePrompt: () => 'اختر مين يطلع من القائمة تحت',
    startText: (game) => `بدأت اللعبة بـ **${game.players.size}** لاعبين! الروليت يدور... 🎲`,
    skipNote: (game, chooser) =>
      `⌛ ${chooser ? displayName(chooser) : 'اللاعب'} ما اختار خلال ${Math.round(settings.pickMs / 1000)} ثانية — **ما انطرد أحد**، والروليت يدور من جديد 🎲`,
    pickNote: (game, by, target) => `💥 **${displayName(by)}** طرد **${displayName(target)}**!`,
    outLabel: (game, e) => `~~${displayName(e)}~~`,
    orderLine: (game, e, i) => `\`${i + 1}\` ${displayName(e)}`,
    winnerTitle: '🏆 عندنا فائز!',
    winnerText: (game, w) => `🎉 مبروك <@${w.id}>!`,
    winnerFields: () => [],
    ...spec
  };
  const hook = (name, ...args) => (typeof S[name] === 'function' ? S[name](...args) : undefined);
  const DEFAULTS = Object.freeze({ ...BASE_DEFAULTS, ...(spec.defaults || {}) });

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

  // ---------------- العرض ----------------
  function lobbyPayload(game) {
    const list = names(game);
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
    const locked = started || game.phase === 'cancelled';
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${S.prefix}:join:${game.id}`).setStyle(ButtonStyle.Success).setLabel('انضمام').setEmoji('✅').setDisabled(locked),
      new ButtonBuilder().setCustomId(`${S.prefix}:leave:${game.id}`).setStyle(ButtonStyle.Secondary).setLabel('خروج').setEmoji('🚪').setDisabled(locked),
      new ButtonBuilder().setCustomId(`${S.prefix}:kick:${game.id}`).setStyle(ButtonStyle.Danger).setLabel('طرد لاعب').setEmoji('👢').setDisabled(locked)
    );
    return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
  }

  function eliminatedLine(game) {
    if (!game.eliminated.length) return null;
    return game.eliminated.map((e) => S.outLabel(game, e)).join(' · ');
  }

  // قوائم الاختيار: 25 خيار بكل قائمة، لين 5 قوائم (بترتيب الانضمام فقط)
  function pickMenus(game, chooserId, disabled) {
    const options = names(game)
      .filter((p) => S.allowSelfPick || p.id !== chooserId)
      .map((p) => ({
        label: (p.id === chooserId ? `${p.name} (أنت)` : p.name).slice(0, 100),
        value: p.id,
        emoji: S.optionEmoji
      }));
    const rows = [];
    for (let i = 0; i < options.length && rows.length < MAX_MENUS; i += MENU_SIZE) {
      const chunk = options.slice(i, i + MENU_SIZE);
      const part = rows.length;
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            // الجزء بآخر المعرّف عشان كل قائمة لها معرّف فريد
            .setCustomId(`${S.prefix}:pick:${game.id}:${game.round}${part ? `:${part}` : ''}`)
            .setPlaceholder(options.length > MENU_SIZE ? `${S.pickPlaceholder} (${i + 1}–${i + chunk.length})` : S.pickPlaceholder)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(chunk)
            .setDisabled(!!disabled)
        )
      );
    }
    return rows;
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
      body += `\n\n🎯 الروليت وقف على <@${pointerId}>!\n${S.choosePrompt(game, pointerId)} — ينتهي الوقت ${`<t:${Math.ceil(game.pickEndsAt / 1000)}:R>`} ⏳`;
    }
    if (note) body += `\n\n${note}`;
    const embed = eb.brand({
      tone: landed ? 'gold' : 'deep',
      title: `${S.wheelTitle} — الجولة ${game.round}`,
      description: body
    });
    const out = eliminatedLine(game);
    if (out) embed.addFields(eb.field(`💀 خرجوا (${game.eliminated.length})`, out, false));
    const components = choosing ? pickMenus(game, pointerId, finalChoice) : [];
    return { embeds: [embed], components, allowedMentions: { parse: [] } };
  }

  function winnerPayload(game, winner) {
    const order = fitLines(game.eliminated.map((e, i) => S.orderLine(game, e, i)));
    const embed = eb.brand({
      tone: 'gold',
      title: S.winnerTitle,
      description: S.winnerText(game, winner),
      thumbnail: hook('winnerThumbnail', game, winner) || undefined
    });
    embed.addFields(
      eb.field('📜 ترتيب الإقصاء (من خرج أول)', order || '—', false),
      ...S.winnerFields(game, winner),
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
      kind: S.key,
      channelId: channel.id,
      channel,
      guildId,
      hostId,
      players: new Map(), // id -> { id, name, user? } (بترتيب الانضمام)
      eliminated: [], // { id, name, by?, reason: 'picked'|'self'|'left' }
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
    hook('onCreate', game);
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
      await hook('onStart', game);
    } catch (err) {
      logger.error(`${S.logName}: خطأ ببداية اللعبة`, { channelId: game.channelId, error: err });
    }
    if (!game.alive) return;
    try {
      game.roundMessage = await game.channel.send({
        embeds: [eb.brand({ tone: 'deep', title: S.wheelTitle, description: S.startText(game) })],
        allowedMentions: { parse: [] }
      });
    } catch (err) {
      logger.warn(`${S.logName}: تعذّر إرسال رسالة الجولة`, { channelId: game.channelId, code: err.code });
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
      note: S.skipNote(game, chooser)
    }));
    await wait(game, settings.afterSkipMs);
    await nextSpin(game);
  }

  // بعد أي إقصاء: الإعلان الخاص باللعبة (لو فيه) ← مهلة قصيرة ← جولة جديدة/فائز
  function afterElimination(game, entry) {
    setTimer(game, async () => {
      try {
        await hook('onEliminated', game, entry);
      } catch (err) {
        logger.warn(`${S.logName}: تعذّر إعلان الإقصاء`, { channelId: game.channelId, code: err.code });
      }
      if (!game.alive) return;
      await wait(game, settings.afterPickMs);
      if (!game.alive) return;
      await (game.players.size <= 1 ? finish(game) : nextSpin(game));
    }, 0);
  }

  /**
   * صاحب الدور يختار مين يُقصى.
   * @returns {{ok:boolean, reason?:string, payload?:object, target?:object, entry?:object}}
   */
  function pick(game, userId, targetId, round) {
    if (game.phase !== 'running' || !game.chooserId || String(round) !== String(game.round)) return { ok: false, reason: 'EXPIRED' };
    if (userId !== game.chooserId) return { ok: false, reason: 'NOT_YOUR_TURN' };
    if ((targetId === userId && !S.allowSelfPick) || !game.players.has(targetId)) return { ok: false, reason: 'BAD_TARGET' };
    clearTimer(game, game.pickTimer);
    game.pickTimer = null;
    const by = game.players.get(userId);
    const target = game.players.get(targetId);
    game.players.delete(targetId);
    const self = targetId === userId;
    const entry = { id: target.id, name: target.name, by: self ? null : { id: by.id, name: by.name }, reason: self ? 'self' : 'picked' };
    game.eliminated.push(entry);
    game.chooserId = null;
    game.skips = 0;
    const payload = roundPayload(game, {
      pointerId: self ? null : by.id,
      landed: true,
      note: S.pickNote(game, by, target)
    });
    afterElimination(game, entry);
    return { ok: true, payload, target, entry };
  }

  async function finish(game) {
    if (!game.alive) return;
    const [winner] = names(game);
    game.phase = 'ended';
    if (winner) {
      try {
        await game.channel.send(winnerPayload(game, winner));
      } catch (err) {
        logger.warn(`${S.logName}: تعذّر إعلان الفائز`, { channelId: game.channelId, code: err.code });
      }
    }
    await endGame(game, 'finished');
  }

  // عضو طلع من السيرفر ← ينشال من أي جولة بهالسيرفر بدون ما تنكسر
  async function removeMember(guildId, userId) {
    for (const game of [...games.values()]) {
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
        const entry = { id: p.id, name: p.name, reason: 'left' };
        game.eliminated.push(entry);
        const wasChooser = game.chooserId === userId;
        if (game.players.size <= 1 || wasChooser) {
          clearTimer(game, game.pickTimer);
          game.pickTimer = null;
          game.chooserId = null;
        }
        if (game.players.size <= 1) {
          try {
            await hook('onEliminated', game, entry);
          } catch (err) {
            logger.warn(`${S.logName}: تعذّر إعلان الإقصاء`, { channelId: game.channelId, code: err.code });
          }
          await finish(game);
        } else if (wasChooser) {
          // صاحب الدور طلع ← نلغي مهلته وندوّر من جديد (بعد إعلان خروجه)
          setTimer(game, async () => {
            try {
              await hook('onEliminated', game, entry);
            } catch (err) {
              logger.warn(`${S.logName}: تعذّر إعلان الإقصاء`, { channelId: game.channelId, code: err.code });
            }
            await wait(game, settings.afterSkipMs);
            await nextSpin(game);
          }, 0);
        } else {
          if (game.chooserId) {
            // تحديث قائمة الاختيار بدون اللاعب اللي طلع
            await safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: game.chooserId, landed: true, choosing: true }));
          }
          setTimer(game, () => hook('onEliminated', game, entry), 0);
        }
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
    logger.info(`${S.logName}: انتهت اللعبة`, { channelId: game.channelId, reason, rounds: game.round });
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
    allowSelfPick: S.allowSelfPick,
    DEFAULTS,
    configure,
    resetSettings,
    settings: () => settings,
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
    wait,
    setTimer,
    _internal: { games, settings: () => settings }
  };
}

module.exports = { createEliminationGame, BASE_DEFAULTS, displayName, fitLines };
