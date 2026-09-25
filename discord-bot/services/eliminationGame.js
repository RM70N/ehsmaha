'use strict';

// محرّك ألعاب الإقصاء بالدوران (روليت الإقصاء، لعبة الدول، …) — مبني على
// مدير اللوبي المشترك services/lobbyManager.js (اللوبي، العداد، المؤقتات،
// المغادرة باللوبي كلها هناك). هنا بس مرحلة الجولات:
//   دوران ← صاحب الدور يختار مين يُقصى خلال 15 ثانية (أو ما يختار = دوران
//   جديد بدون إقصاء) ← لين يبقى واحد ← إعلان الفائز + ترتيب الإقصاء.
//
// الـspec (فوق حقول lobbyManager):
//   wheelTitle, allowSelfPick, optionEmoji, pickPlaceholder, choosePrompt(game, chooserId)
//   pickOptions(game, chooserId) : خيارات قائمة صاحب الدور (الافتراضي: اللاعبين)
//   resolvePick(game, value)     : قيمة الخيار ← معرّف اللاعب المُقصى (الافتراضي: نفس القيمة)
//   roundFields(game)            : حقول إضافية برسالة الجولة
//   startText(game), skipNote(game, chooser), pickNote(game, by, target)
//   outLabel(game, entry), orderLine(game, entry, index)
//   winnerTitle, winnerText(game, winner), winnerFields(game, winner), winnerThumbnail(game, winner)
//   hooks: onCreate(game), onStart(game), onEliminated(game, entry), onEnd(game)

const { ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const { createLobbyManager, displayName, fitLines } = require('./lobbyManager');

const ROUND_DEFAULTS = Object.freeze({
  maxPlayers: 25, // حد قائمة ديسكورد المنسدلة (25 خيار بالقائمة الواحدة)
  pickMs: 15 * 1000,
  // تأثير الدوران: تعديلات متتالية تتباطأ تدريجياً (~3.5 ثانية)
  spinDelays: [300, 350, 400, 450, 550, 650, 800],
  afterPickMs: 2500,
  afterSkipMs: 2000,
  maxSkips: 5 // 5 مرات ورا بعض ما أحد اختار ← اللعبة تنتهي (ما تدور للأبد)
});

const MENU_SIZE = 25; // خيارات القائمة الواحدة
const MAX_MENUS = 5; // صفوف الرسالة

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
      `⌛ ${chooser ? displayName(chooser) : 'اللاعب'} ما اختار خلال ${Math.round(cfg().pickMs / 1000)} ثانية — **ما انطرد أحد**، والروليت يدور من جديد 🎲`,
    pickNote: (game, by, target) => `💥 **${displayName(by)}** طرد **${displayName(target)}**!`,
    outLabel: (game, e) => `~~${displayName(e)}~~`,
    orderLine: (game, e, i) => `\`${i + 1}\` ${displayName(e)}`,
    winnerTitle: '🏆 عندنا فائز!',
    winnerText: (game, w) => `🎉 مبروك <@${w.id}>!`,
    winnerFields: () => [],
    ...spec
  };
  const hook = (name, ...args) => (typeof S[name] === 'function' ? S[name](...args) : undefined);

  const lm = createLobbyManager({
    key: S.key,
    logName: S.logName,
    prefix: S.prefix,
    command: S.command,
    title: S.title,
    lobbyIntro: S.lobbyIntro,
    defaults: { ...ROUND_DEFAULTS, ...(spec.defaults || {}) },
    onCreate(game) {
      Object.assign(game, {
        eliminated: [], // { id, name, by?, reason: 'picked'|'self'|'left' }
        round: 0,
        chooserId: null,
        pickEndsAt: null,
        skips: 0,
        roundMessage: null,
        pickTimer: null
      });
      hook('onCreate', game);
    },
    onStart: beginRounds,
    onMemberLeft,
    onEnd: (game) => hook('onEnd', game),
    handleAction
  });
  const cfg = () => lm.settings();
  const names = (game) => [...game.players.values()];

  // ---------------- العرض ----------------
  function eliminatedLine(game) {
    if (!game.eliminated.length) return null;
    return game.eliminated.map((e) => S.outLabel(game, e)).join(' · ');
  }

  // قوائم الاختيار: 25 خيار بكل قائمة، لين 5 قوائم (بترتيب الانضمام فقط)
  function defaultPickOptions(game, chooserId) {
    return names(game)
      .filter((p) => S.allowSelfPick || p.id !== chooserId)
      .map((p) => ({
        label: (p.id === chooserId ? `${p.name} (أنت)` : p.name).slice(0, 100),
        value: p.id,
        emoji: S.optionEmoji
      }));
  }

  function pickMenus(game, chooserId, disabled) {
    const options = (S.pickOptions || defaultPickOptions)(game, chooserId);
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
    const extra = hook('roundFields', game);
    if (Array.isArray(extra) && extra.length) embed.addFields(...extra);
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


  // ---------------- الجولات ----------------
  async function beginRounds(game) {
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
      return lm.endGame(game, 'send_failed');
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
    const finalIndex = Math.floor(cfg().random() * list.length);
    const frames = cfg().spinDelays.length;
    // نبدأ من مكان يخلي آخر إطار يقع بالضبط على اللاعب العشوائي
    const start = (((finalIndex - (frames - 1)) % list.length) + list.length) % list.length;
    for (let f = 0; f < frames; f++) {
      const current = list[(start + f) % list.length];
      if (!(await lm.safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: current.id })))) return;
      await lm.wait(game, cfg().spinDelays[f]);
      if (!game.alive) return;
    }
    const chosen = list[finalIndex];
    // لو اللاعب المختار طلع من السيرفر أثناء الدوران ← نعيد الدوران
    if (!game.players.has(chosen.id)) return nextSpin(game);
    game.chooserId = chosen.id;
    game.pickEndsAt = Date.now() + cfg().pickMs;
    game.pickTimer = lm.setTimer(game, () => onPickTimeout(game, game.round), cfg().pickMs);
    await lm.safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: chosen.id, landed: true, choosing: true }));
  }

  async function onPickTimeout(game, round) {
    if (!game.alive || game.round !== round || !game.chooserId) return;
    const chooser = game.players.get(game.chooserId);
    game.chooserId = null;
    game.pickTimer = null;
    game.skips += 1;
    if (game.skips >= cfg().maxSkips) {
      await lm.safeEdit(game, game.roundMessage, roundPayload(game, { note: '⌛ ما أحد اختار كذا مرة ورا بعض — انتهت اللعبة بدون فائز.' }));
      return lm.endGame(game, 'inactive');
    }
    await lm.safeEdit(game, game.roundMessage, roundPayload(game, {
      pointerId: chooser && chooser.id,
      landed: true,
      note: S.skipNote(game, chooser)
    }));
    await lm.wait(game, cfg().afterSkipMs);
    await nextSpin(game);
  }

  // بعد أي إقصاء: الإعلان الخاص باللعبة (لو فيه) ← مهلة قصيرة ← جولة جديدة/فائز
  function afterElimination(game, entry) {
    lm.setTimer(game, async () => {
      try {
        await hook('onEliminated', game, entry);
      } catch (err) {
        logger.warn(`${S.logName}: تعذّر إعلان الإقصاء`, { channelId: game.channelId, code: err.code });
      }
      if (!game.alive) return;
      await lm.wait(game, cfg().afterPickMs);
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
    lm.clearTimer(game, game.pickTimer);
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
    await lm.endGame(game, 'finished');
  }


  // عضو طلع من السيرفر أثناء الجولات ← يُقصى تلقائياً بدون ما تنكسر السلسلة
  async function onMemberLeft(game, p) {
    if (game.phase !== 'running') return;
    game.players.delete(p.id);
    const entry = { id: p.id, name: p.name, reason: 'left' };
    game.eliminated.push(entry);
    const wasChooser = game.chooserId === p.id;
    if (game.players.size <= 1 || wasChooser) {
      lm.clearTimer(game, game.pickTimer);
      game.pickTimer = null;
      game.chooserId = null;
    }
    const announce = async () => {
      try {
        await hook('onEliminated', game, entry);
      } catch (err) {
        logger.warn(`${S.logName}: تعذّر إعلان الإقصاء`, { channelId: game.channelId, code: err.code });
      }
    };
    if (game.players.size <= 1) {
      await announce();
      await finish(game);
    } else if (wasChooser) {
      // صاحب الدور طلع ← نلغي مهلته وندوّر من جديد (بعد إعلان خروجه)
      lm.setTimer(game, async () => {
        await announce();
        await lm.wait(game, cfg().afterSkipMs);
        await nextSpin(game);
      }, 0);
    } else {
      if (game.chooserId) {
        // تحديث قائمة الاختيار بدون اللاعب اللي طلع
        await lm.safeEdit(game, game.roundMessage, roundPayload(game, { pointerId: game.chooserId, landed: true, choosing: true }));
      }
      lm.setTimer(game, announce, 0);
    }
  }

  // <prefix>:pick:<gameId>:<round>[:<part>] — قائمة صاحب الدور
  async function handleAction(interaction, action, args, game) {
    if (action !== 'pick') return false;
    const value = interaction.values && interaction.values[0];
    const targetId = S.resolvePick ? S.resolvePick(game, value) : value;
    const r = pick(game, interaction.user.id, targetId, args[2]);
    if (!r.ok) {
      const msg = {
        NOT_YOUR_TURN: 'ليس دورك الآن ⏳',
        EXPIRED: 'انتهى وقت هذا الاختيار.',
        BAD_TARGET: 'اختيار غير صالح (يمكن انقصى قبل شوي) — اختر من القائمة الحالية.'
      }[r.reason];
      await interaction.reply({ embeds: [eb.warning(msg)], flags: MessageFlags.Ephemeral }).catch(() => null);
      return true;
    }
    await interaction.update(r.payload);
    return true;
  }

  return {
    ...lm,
    allowSelfPick: S.allowSelfPick,
    startRounds: lm.start,
    nextSpin,
    pick,
    roundPayload,
    winnerPayload,
    handleAction
  };
}

module.exports = { createEliminationGame, ROUND_DEFAULTS, displayName, fitLines };
