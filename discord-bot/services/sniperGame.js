'use strict';

// "لعبة القناص" (/قناص) — اللوبي والعداد والطرد والمؤقتات من services/lobbyManager.js
// (نفس /روليت و/دول بالضبط). بعد العداد:
//
//   hiding  : لاعب عشوائي يصير "القناص" (إعلان علني). الباقين يختارون مخبأ سري
//             (مربع من الشبكة) خلال 30 ثانية — أو أبكر لو اختبأ الكل. القناص
//             ما يوصله أي زر أو قائمة بهالفترة. اللي ما اختبأ ← يُطرد تلقائياً.
//   hunting : 4 دقائق. القناص يفتح لوحته الخاصة (Ephemeral) ويرمي بـ3 أسلحة
//             (سنايبر 1 مربع / قنبلة 3 / نيوك 5) بذخيرة منفصلة حسب حجم الشبكة.
//             إصابة لاعب ← إعلان علني بارز. مربع فاضي ← تأكيد للقناص بس.
//   النهاية : القناص يصيد الكل ← يفوز · انتهى الوقت ← الناجين يفوزون معاً
//             · القناص غادر السيرفر ← تنتهي الجولة.
//
// الأسرار (مخابئ اللاعبين) بالذاكرة فقط: game.hides (playerId → box) و
// game.boxOwner (box → playerId)، وما تنعرض علناً إلا بعد نهاية الجولة.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const grid = require('../utils/sniperGrid');
const SNIPER_CONFIG = require('../config/sniper');
const { createLobbyManager, displayName, fitLines } = require('./lobbyManager');

const MENU_SIZE = 25;
const WEAPON_KEYS = ['sniper', 'bomb', 'nuke'];

// ---------------- أدوات الإعدادات ----------------
function gridSizeFor(playerCount, thresholds = SNIPER_CONFIG.GRID_SIZE_THRESHOLDS) {
  const sorted = [...thresholds].sort((a, b) => b.minPlayers - a.minPlayers);
  const hit = sorted.find((t) => playerCount >= t.minPlayers);
  return (hit || sorted[sorted.length - 1]).boxes;
}

function ammoFor(size, table = SNIPER_CONFIG.AMMO_BY_GRID) {
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const key = table[size] ? size : sizes.filter((s) => s <= size).pop() || sizes[0];
  return { ...table[key] };
}

const weaponLabel = (w) => `${SNIPER_CONFIG.WEAPONS[w].emoji} ${SNIPER_CONFIG.WEAPONS[w].name}`;
const secondsLeft = (at) => Math.max(0, Math.ceil((at - Date.now()) / 1000));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------------- المحرّك ----------------
const lm = createLobbyManager({
  key: 'sniper',
  logName: 'القناص',
  prefix: 'sn',
  command: '/قناص',
  title: '🎯 لعبة القناص',
  lobbyIntro:
    'اضغط **انضمام** وادخل اللعبة! أول ما تبدأ، واحد منكم بالصدفة يصير **القناص** 🎯 والباقين يختبئون بمربعات سرية 🫥\n' +
    'القناص عنده 4 دقائق و3 أسلحة يصيدكم فيها — **صيد الكل = يفوز القناص، نجوت للنهاية = تفوز أنت 🏆**',
  defaults: {
    maxPlayers: 50, // شبكة 50 = 49 مخبأ + القناص
    hideMs: SNIPER_CONFIG.TIMINGS.hideMs,
    huntMs: SNIPER_CONFIG.TIMINGS.huntMs,
    statusEveryMs: SNIPER_CONFIG.TIMINGS.statusEveryMs,
    dmTimeoutMs: 5000,
    thresholds: SNIPER_CONFIG.GRID_SIZE_THRESHOLDS,
    ammoTable: SNIPER_CONFIG.AMMO_BY_GRID,
    weapons: SNIPER_CONFIG.WEAPONS
  },
  onCreate(game) {
    Object.assign(game, {
      sniperId: null,
      gridSize: 0,
      hides: new Map(), // playerId -> box (سري)
      boxOwner: new Map(), // box -> playerId (سري)
      shot: new Map(), // box -> 'hit' | 'miss' (يعرفه القناص بس)
      ammo: { sniper: 0, bomb: 0, nuke: 0 },
      shots: 0,
      eliminated: [], // { id, name, box?, weapon?, reason: 'shot'|'no_hide'|'left' }
      hideEndsAt: null,
      huntEndsAt: null,
      gridMessage: null,
      hideMessage: null,
      huntMessage: null,
      hideTimer: null,
      huntTimer: null,
      statusTimer: null
    });
  },
  onStart: startHiding,
  onMemberLeft,
  onEnd(game) {
    game.hides.clear();
    game.boxOwner.clear();
    game.shot.clear();
  },
  handleAction
});
const cfg = () => lm.settings();

const hiders = (game) => [...game.players.values()].filter((p) => p.id !== game.sniperId);
const unshotBoxes = (game) => Array.from({ length: game.gridSize }, (_, i) => i + 1).filter((b) => !game.shot.has(b));
const ammoLeft = (game) => WEAPON_KEYS.reduce((n, w) => n + game.ammo[w], 0);

// ---------------- الرسائل العامة ----------------
function sniperAnnouncement(game) {
  const embed = eb.brand({
    tone: 'gold',
    title: '🎯 لعبة القناص — عندنا قناص!',
    description:
      `# 🎯 <@${game.sniperId}> هو قناص هذه الجولة!\n\n` +
      `🫥 الباقين عندهم **${Math.round(cfg().hideMs / 1000)} ثانية** يختبئون بمربع سري من **${game.gridSize}** مربع.\n` +
      `🔫 بعدها القناص عنده **${Math.round(cfg().huntMs / 60000)} دقائق** يصيدكم — وما يشوف مين اختبأ وين!`
  });
  embed.addFields(
    eb.field('🗺️ حجم الشبكة', `${game.gridSize} مربع`, true),
    eb.field('👥 المختبئين', String(hiders(game).length), true),
    eb.field('🎒 الذخيرة', WEAPON_KEYS.map((w) => `${weaponLabel(w)}: **${game.ammo[w]}**`).join('\n'), true)
  );
  return { content: `🎯 <@${game.sniperId}>`, embeds: [embed], allowedMentions: { users: [game.sniperId] } };
}

function hideStatusPayload(game, { ended = false } = {}) {
  const total = hiders(game).length;
  const hidden = hiders(game).filter((p) => game.hides.has(p.id)).length;
  const embed = eb.brand({
    tone: ended ? 'deep' : 'primary',
    title: ended ? '🫥 انتهت مرحلة الاختباء' : '🫥 مرحلة الاختباء — اختبئوا بسرعة!',
    description: ended
      ? '🔒 الاختباء انقفل — القناص بدأ يصيد 🎯'
      : `اضغط **اختر مخبأك** واختر مربع سري من الشبكة — محد يشوف اختيارك غيرك 🤫\n` +
        `تقدر تغيّر مخبأك لين ينتهي الوقت ${`<t:${Math.ceil(game.hideEndsAt / 1000)}:R>`} ⏳\n\n` +
        `🎯 القناص <@${game.sniperId}> ما يشوف شي الحين.\n` +
        '⚠️ اللي ما يختبئ قبل نهاية الوقت ينطرد تلقائياً!'
  });
  embed.addFields(eb.field('✅ اختبأ', `${hidden} من ${total}`, true), eb.field('🗺️ الشبكة', `${game.gridSize} مربع`, true));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sn:hide:${game.id}`).setStyle(ButtonStyle.Primary).setLabel('اختر مخبأك').setEmoji('🫥').setDisabled(ended)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

function huntStatusPayload(game, { ended = false } = {}) {
  const alive = hiders(game);
  const left = secondsLeft(game.huntEndsAt);
  const out = ammoLeft(game) === 0;
  const embed = eb.brand({
    tone: ended ? 'deep' : 'gold',
    title: ended ? '🎯 لعبة القناص — انتهت الجولة' : '🎯 مرحلة الصيد — القناص يدوّر عليكم!',
    description: ended
      ? '🏁 الجولة خلصت — شوفوا النتيجة تحت 👇'
      : `⏱️ الوقت المتبقي: **${fmtTime(left)}** (ينتهي ${`<t:${Math.ceil(game.huntEndsAt / 1000)}:R>`})\n` +
        `👥 الأحياء: **${alive.length}**\n\n` +
        (out ? '💤 القناص خلصت ذخيرته — ينتظر نهاية الوقت!' : `🎯 القناص <@${game.sniperId}> يفتح لوحته من الزر تحت.`)
  });
  embed.addFields(
    eb.field('🎒 ذخيرة القناص', WEAPON_KEYS.map((w) => `${weaponLabel(w)}: **${game.ammo[w]}**`).join(' · '), false),
    eb.field(`💀 خرجوا (${game.eliminated.length})`, game.eliminated.length ? fitLines(game.eliminated.map((e) => `~~${displayName(e)}~~`), 1000) : '—', false)
  );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sn:panel:${game.id}`).setStyle(ButtonStyle.Danger).setLabel('لوحة القناص').setEmoji('🎯').setDisabled(ended || out)
  );
  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

// إعلان الإصابة "بمنتصف الشاشة" — embed لكل لاعب انصاب بهالطلقة
function hitPayload(game, hits, weapon) {
  const embeds = hits.slice(0, 10).map((h) =>
    eb.brand({
      tone: 'pink',
      title: `💥 القناص أصاب! — ${weaponLabel(weapon)}`,
      description:
        `# 💀 ${displayName(h)}\n` +
        `<@${h.id}> **انصاب وخرج من اللعبة!**\n\n` +
        `🫥 كان مختبئ بالمربع **#${h.box}**\n` +
        `🔫 السلاح: **${weaponLabel(weapon)}**\n` +
        `👥 الأحياء: **${hiders(game).length}**`
    })
  );
  return { content: `💥 ${hits.map((h) => `<@${h.id}>`).join(' ')}`, embeds, allowedMentions: { users: hits.map((h) => h.id) } };
}

function eliminatedLines(game) {
  return game.eliminated.map((e, i) => {
    const how =
      e.reason === 'shot' ? `انصاب بالمربع #${e.box} (${weaponLabel(e.weapon)})` : e.reason === 'no_hide' ? 'ما اختبأ — طُرد تلقائياً' : 'غادر السيرفر';
    return `\`${i + 1}\` ${displayName(e)} — ${how}`;
  });
}

function sniperWinPayload(game) {
  const hits = game.eliminated.filter((e) => e.reason === 'shot').length;
  const embed = eb.brand({
    tone: 'gold',
    title: '🏆 لعبة القناص — القناص فاز!',
    description: `# 🎯 <@${game.sniperId}>\nصاد الجميع وما خلّى أحد! 👑\n\nالعب ألعاب أكثر على ehsmaha.com`
  });
  embed.addFields(
    eb.field('📜 ترتيب الإقصاء', fitLines(eliminatedLines(game)) || '—', false),
    eb.field('🎯 الإصابات', String(hits), true),
    eb.field('🔫 الطلقات', String(game.shots), true),
    eb.field('⏱️ الوقت المتبقي', fmtTime(secondsLeft(game.huntEndsAt)), true)
  );
  return { content: `🏆 <@${game.sniperId}>`, embeds: [embed], allowedMentions: { users: [game.sniperId] } };
}

function survivorsWinPayload(game) {
  const alive = hiders(game);
  const embed = eb.brand({
    tone: 'gold',
    title: '🏆 لعبة القناص — الناجين فازوا!',
    description:
      `⏰ انتهى الوقت والقناص ما قدر يصيدهم! 🎉\n\n# 🫥 ${alive.length} ${alive.length === 1 ? 'ناجي' : 'ناجين'}\n` +
      `${alive.map((p) => `<@${p.id}>`).join(' · ')}\n\nالعب ألعاب أكثر على ehsmaha.com`
  });
  embed.addFields(
    eb.field('🫥 مخابئ الناجين', fitLines(alive.map((p) => `${displayName(p)} — المربع #${game.hides.get(p.id)}`)), false),
    eb.field('📜 اللي خرجوا', fitLines(eliminatedLines(game)) || 'ما خرج أحد!', false),
    eb.field('🎯 القناص', `<@${game.sniperId}> — ${game.shots} طلقة`, true)
  );
  return { content: `🏆 ${alive.map((p) => `<@${p.id}>`).join(' ')}`, embeds: [embed], allowedMentions: { users: alive.map((p) => p.id) } };
}

// ---------------- لوحات خاصة (Ephemeral) ----------------
// لوحة اختيار المخبأ: المربعات المتاحة فقط (المحجوزة عند غيره تنشال) — 1-25 و26-50
function hidePanel(game, userId, note = null) {
  const mine = game.hides.get(userId) || null;
  const embed = eb.brand({
    tone: 'primary',
    title: '🫥 اختر مخبأك',
    description:
      (mine ? `📍 مخبأك الحالي: **المربع #${mine}** — تقدر تغيّره لين ينتهي الوقت.\n` : '📍 ما اخترت مخبأ بعد!\n') +
      `⏳ ينتهي ${`<t:${Math.ceil(game.hideEndsAt / 1000)}:R>`}\n🤫 اختيارك سري — محد يشوفه غيرك.` +
      (note ? `\n\n${note}` : '')
  });
  const rows = [];
  for (let from = 1; from <= game.gridSize; from += MENU_SIZE) {
    const to = Math.min(from + MENU_SIZE - 1, game.gridSize);
    const options = [];
    for (let b = from; b <= to; b++) {
      const owner = game.boxOwner.get(b);
      if (owner && owner !== userId) continue; // محجوز عند غيرك
      options.push({ label: b === mine ? `المربع ${b} (مخبأك الحالي)` : `المربع ${b}`, value: String(b), emoji: b === mine ? '📍' : '🫥' });
    }
    if (!options.length) continue;
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sn:box:${game.id}:${userId}:${rows.length}`)
          .setPlaceholder(`اختر مربع (${from}–${to})`)
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(options)
      )
    );
  }
  return { embeds: [embed], components: rows };
}

// صفحات متوازنة للمربعات الباقية (كل صفحة ≤ 25، وكل الصفحات بنفس الحجم تقريباً
// عشان النيوك/القنبلة دايماً يلقون عدد كافي بالصفحة)
function pagesOf(list) {
  const pages = Math.max(1, Math.ceil(list.length / MENU_SIZE));
  const per = Math.ceil(list.length / pages);
  return Array.from({ length: pages }, (_, i) => list.slice(i * per, (i + 1) * per));
}
const requiredTargets = (game, weapon) => Math.min(cfg().weapons[weapon].targets, unshotBoxes(game).length);

function sniperPanel(game, { weapon = null, page = 0, note = null } = {}) {
  const alive = hiders(game).length;
  const embed = eb.brand({
    tone: 'gold',
    title: '🎯 لوحة القناص',
    description:
      `⏱️ الوقت المتبقي: **${fmtTime(secondsLeft(game.huntEndsAt))}** · 👥 الأحياء: **${alive}**\n` +
      (weapon
        ? `\n${weaponLabel(weapon)} — اختر **${requiredTargets(game, weapon)}** ${requiredTargets(game, weapon) === 1 ? 'مربع' : 'مربعات'} من القائمة.`
        : '\nاختر سلاحك 👇 (المربعات المعلّمة ✖️ سبق ضربها)') +
      (note ? `\n\n${note}` : ''),
    image: `attachment://${grid.FILE_NAME}`
  });
  const att = grid.gridAttachment({ size: game.gridSize, marks: game.shot, title: 'لوحة القناص' });
  if (!att) {
    embed.setImage(null);
    embed.addFields(eb.field('🗺️ الشبكة', grid.textGrid(game.gridSize, game.shot), false));
  }
  const remaining = unshotBoxes(game);
  const weaponsRow = new ActionRowBuilder().addComponents(
    ...WEAPON_KEYS.map((w) =>
      new ButtonBuilder()
        .setCustomId(`sn:weapon:${game.id}:${w}:0`)
        .setStyle(w === weapon ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setLabel(`${cfg().weapons[w].name} (${game.ammo[w]})`)
        .setEmoji(cfg().weapons[w].emoji)
        .setDisabled(game.ammo[w] <= 0 || !remaining.length)
    )
  );
  const components = [weaponsRow];
  if (weapon && game.ammo[weapon] > 0 && remaining.length) {
    const pages = pagesOf(remaining);
    const p = Math.min(Math.max(0, Number(page) || 0), pages.length - 1);
    const need = requiredTargets(game, weapon);
    const opts = pages[p];
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`sn:shoot:${game.id}:${weapon}:${p}`)
          .setPlaceholder(need === 1 ? 'اختر المربع' : `اختر ${need} مربعات`)
          .setMinValues(Math.min(need, opts.length))
          .setMaxValues(Math.min(need, opts.length))
          .addOptions(opts.map((b) => ({ label: `المربع ${b}`, value: String(b), emoji: cfg().weapons[weapon].emoji })))
      )
    );
    if (pages.length > 1) {
      components.push(
        new ActionRowBuilder().addComponents(
          ...pages.map((pg, i) =>
            new ButtonBuilder()
              .setCustomId(`sn:weapon:${game.id}:${weapon}:${i}`)
              .setStyle(i === p ? ButtonStyle.Primary : ButtonStyle.Secondary)
              .setLabel(`المربعات ${pg[0]}–${pg[pg.length - 1]}`)
              .setDisabled(i === p)
          )
        )
      );
    }
  }
  // attachments: [] ← عند التحديث تنشال الصورة القديمة وتنحط الجديدة
  return { embeds: [embed], components, files: att ? [att] : [], attachments: [] };
}

// ---------------- المراحل ----------------
async function startHiding(game) {
  const list = [...game.players.values()];
  const sniper = list[Math.floor(cfg().random() * list.length)];
  game.sniperId = sniper.id;
  game.gridSize = gridSizeFor(list.length, cfg().thresholds);
  game.ammo = ammoFor(game.gridSize, cfg().ammoTable);
  game.phase = 'hiding';

  await lm.safeSend(game, sniperAnnouncement(game), 'إعلان القناص');
  if (!game.alive) return;
  // الشبكة العامة (أرقام بس)
  const att = grid.gridAttachment({ size: game.gridSize });
  game.gridMessage = await lm.safeSend(
    game,
    att
      ? { embeds: [eb.brand({ tone: 'deep', title: `🗺️ ساحة القناص — ${game.gridSize} مربع`, image: `attachment://${grid.FILE_NAME}` })], files: [att] }
      : { embeds: [eb.brand({ tone: 'deep', title: `🗺️ ساحة القناص — ${game.gridSize} مربع`, description: grid.textGrid(game.gridSize) })] },
    'الشبكة'
  );
  if (!game.alive) return;
  game.hideEndsAt = Date.now() + cfg().hideMs;
  game.hideMessage = await lm.safeSend(game, hideStatusPayload(game), 'رسالة الاختباء');
  if (!game.hideMessage) return lm.endGame(game, 'send_failed');
  game.hideTimer = lm.setTimer(game, () => endHiding(game), cfg().hideMs);

  // القناص: رسالة انتظار بس (بدون أي زر أو قائمة)
  lm.sendDm(game, game.sniperId, {
    embeds: [
      eb.brand({
        tone: 'gold',
        title: '🎯 أنت القناص!',
        description: `اللاعبين يختبئون الحين بـ<#${game.channelId}> 🤫\nانتظر — لوحتك تنفتح بعد ما ينتهي وقت الاختباء ${`<t:${Math.ceil(game.hideEndsAt / 1000)}:R>`}.`
      })
    ]
  }).catch((err) => logger.warn('القناص: تعذّر إرسال رسالة الانتظار للقناص بالخاص', { channelId: game.channelId, code: err.code }));
}

// نهاية الاختباء (انتهى الوقت أو اختبأ الكل) — مرة وحدة بس
async function endHiding(game) {
  if (!game.alive || game.phase !== 'hiding') return;
  game.phase = 'hunting';
  lm.clearTimer(game, game.hideTimer);
  game.hideTimer = null;

  // اللي ما اختبأ ← يُطرد تلقائياً
  const noHide = hiders(game).filter((p) => !game.hides.has(p.id));
  for (const p of noHide) {
    game.players.delete(p.id);
    game.eliminated.push({ id: p.id, name: p.name, reason: 'no_hide' });
  }
  await lm.safeEdit(game, game.hideMessage, hideStatusPayload(game, { ended: true }));
  if (!game.alive) return;
  if (noHide.length) {
    await lm.safeSend(
      game,
      {
        embeds: [
          eb.brand({
            tone: 'pink',
            title: '⏰ طرد تلقائي',
            description: `ما اختبأوا بالوقت، فطُردوا من الجولة:\n${noHide.map((p) => `• ${displayName(p)}`).join('\n')}`
          })
        ],
        allowedMentions: { parse: [] }
      },
      'الطرد التلقائي'
    );
  }
  if (!game.alive) return;
  if (!hiders(game).length) {
    await lm.safeSend(
      game,
      { embeds: [eb.brand({ tone: 'deep', title: '🎯 لعبة القناص — انتهت الجولة', description: 'ما أحد اختبأ 🤷 — الجولة انتهت بدون فائز. اكتب `/قناص` لجولة جديدة.' })] },
      'نهاية الجولة'
    );
    return lm.endGame(game, 'no_hiders');
  }

  // الصيد: 4 دقائق + تحديث دوري للحالة العامة
  game.huntEndsAt = Date.now() + cfg().huntMs;
  game.huntTimer = lm.setTimer(game, () => finish(game, 'time'), cfg().huntMs);
  game.huntMessage = await lm.safeSend(game, huntStatusPayload(game), 'رسالة الصيد');
  if (!game.huntMessage) return lm.endGame(game, 'send_failed');
  scheduleStatus(game);
  lm.sendDm(game, game.sniperId, {
    embeds: [
      eb.brand({
        tone: 'gold',
        title: '🎯 بدأ الصيد!',
        description: `اللاعبين اختبأوا — افتح لوحتك من زر **🎯 لوحة القناص** بـ<#${game.channelId}>. عندك ${fmtTime(Math.round(cfg().huntMs / 1000))} دقائق!`
      })
    ]
  }).catch((err) => logger.warn('القناص: تعذّر تنبيه القناص بالخاص', { channelId: game.channelId, code: err.code }));
}

function scheduleStatus(game) {
  game.statusTimer = lm.setTimer(game, async () => {
    if (!game.alive || game.phase !== 'hunting') return;
    await lm.safeEdit(game, game.huntMessage, huntStatusPayload(game));
    scheduleStatus(game);
  }, cfg().statusEveryMs);
}

async function finish(game, outcome) {
  if (!game.alive) return;
  game.phase = 'ended';
  lm.clearTimer(game, game.huntTimer);
  lm.clearTimer(game, game.statusTimer);
  await lm.safeEdit(game, game.huntMessage, huntStatusPayload(game, { ended: true })).catch(() => null);
  const payload = outcome === 'sniper' || !hiders(game).length ? sniperWinPayload(game) : survivorsWinPayload(game);
  await lm.safeSend(game, payload, 'إعلان الفائز');
  await lm.endGame(game, outcome === 'sniper' ? 'sniper_won' : 'survivors_won');
}

// ---------------- الأفعال ----------------
function hide(game, userId, box) {
  if (game.phase !== 'hiding') return { ok: false, reason: 'OVER' };
  if (userId === game.sniperId) return { ok: false, reason: 'SNIPER' };
  if (!game.players.has(userId)) return { ok: false, reason: 'NOT_PLAYER' };
  const n = Number(box);
  if (!Number.isInteger(n) || n < 1 || n > game.gridSize) return { ok: false, reason: 'BAD_BOX' };
  const owner = game.boxOwner.get(n);
  if (owner && owner !== userId) return { ok: false, reason: 'TAKEN' };
  const prev = game.hides.get(userId);
  if (prev) game.boxOwner.delete(prev);
  game.hides.set(userId, n);
  game.boxOwner.set(n, userId);
  return { ok: true, box: n, changed: !!prev && prev !== n };
}

const allHidden = (game) => hiders(game).length > 0 && hiders(game).every((p) => game.hides.has(p.id));

/**
 * طلقة من القناص على مربع أو أكثر (حسب السلاح).
 * @returns {{ok:boolean, reason?:string, hits?:object[], misses?:number[]}}
 */
function shoot(game, userId, weapon, boxes) {
  if (game.phase !== 'hunting') return { ok: false, reason: 'OVER' };
  if (userId !== game.sniperId) return { ok: false, reason: 'NOT_SNIPER' };
  if (!cfg().weapons[weapon]) return { ok: false, reason: 'BAD_WEAPON' };
  if (game.ammo[weapon] <= 0) return { ok: false, reason: 'NO_AMMO' };
  const list = [...new Set((boxes || []).map(Number))];
  if (list.length !== requiredTargets(game, weapon)) return { ok: false, reason: 'BAD_COUNT' };
  if (list.some((b) => !Number.isInteger(b) || b < 1 || b > game.gridSize || game.shot.has(b))) return { ok: false, reason: 'BAD_BOX' };

  game.ammo[weapon] -= 1;
  game.shots += 1;
  const hits = [];
  const misses = [];
  for (const b of list.sort((a, c) => a - c)) {
    const owner = game.boxOwner.get(b);
    if (owner && game.players.has(owner)) {
      const p = game.players.get(owner);
      game.shot.set(b, 'hit');
      game.players.delete(owner);
      game.hides.delete(owner);
      game.boxOwner.delete(b);
      const entry = { id: p.id, name: p.name, box: b, weapon, reason: 'shot' };
      game.eliminated.push(entry);
      hits.push(entry);
    } else {
      game.shot.set(b, 'miss');
      misses.push(b);
    }
  }
  return { ok: true, hits, misses };
}

// لاعب غادر السيرفر أثناء الجولة
async function onMemberLeft(game, p) {
  if (p.id === game.sniperId) {
    game.phase = 'ended';
    await lm.safeSend(
      game,
      {
        embeds: [
          eb.brand({
            tone: 'danger',
            title: '🎯 لعبة القناص — انتهت الجولة',
            description: `🚪 انتهت الجولة بسبب مغادرة القناص للسيرفر.\nاكتب \`/قناص\` لجولة جديدة.`
          })
        ],
        allowedMentions: { parse: [] }
      },
      'نهاية الجولة'
    );
    return lm.endGame(game, 'sniper_left');
  }
  // لاعب عادي: ينشال من الأحياء ومربعه يتحرر (لو ما انضرب)
  game.players.delete(p.id);
  const box = game.hides.get(p.id);
  if (box) game.boxOwner.delete(box);
  game.hides.delete(p.id);
  game.eliminated.push({ id: p.id, name: p.name, reason: 'left' });
  if (game.phase === 'hiding') {
    if (!hiders(game).length) return endHiding(game);
    await lm.safeEdit(game, game.hideMessage, hideStatusPayload(game));
    if (allHidden(game)) await endHiding(game);
  } else if (game.phase === 'hunting') {
    if (!hiders(game).length) return finish(game, 'sniper');
    await lm.safeEdit(game, game.huntMessage, huntStatusPayload(game));
  }
}

const ephemeral = (interaction, message, title) =>
  interaction.reply({ embeds: [eb.warning(message, title)], flags: MessageFlags.Ephemeral }).catch(() => null);

// sn:hide:<gid> · sn:box:<gid>:<owner>:<part> · sn:panel:<gid>
// sn:weapon:<gid>:<weapon>:<page> · sn:shoot:<gid>:<weapon>:<page>
async function handleAction(interaction, action, args, game) {
  const uid = interaction.user.id;

  if (action === 'hide') {
    if (uid === game.sniperId) {
      // القناص ما يوصله أي زر أو قائمة وقت الاختباء — رسالة انتظار بس
      return interaction.reply({
        embeds: [eb.info('🎯 أنت القناص — اللاعبين يختبئون الحين 🤫\nلوحتك تنفتح بعد ما ينتهي وقت الاختباء.', '⏳ انتظر')],
        flags: MessageFlags.Ephemeral
      });
    }
    if (game.phase !== 'hiding') return ephemeral(interaction, 'مرحلة الاختباء انتهت.');
    if (!game.players.has(uid)) return ephemeral(interaction, 'أنت مو مشارك بهذي الجولة — انتظر الجولة الجاية 🎯');
    return interaction.reply({ ...hidePanel(game, uid), flags: MessageFlags.Ephemeral });
  }

  if (action === 'box') {
    const [, , ownerId] = args;
    if (ownerId !== uid) return ephemeral(interaction, 'هذي القائمة مو لك.');
    if (game.phase !== 'hiding') {
      return interaction.update({ embeds: [eb.warning('انتهى وقت الاختباء.')], components: [] });
    }
    const box = interaction.values && interaction.values[0];
    const r = hide(game, uid, box);
    if (!r.ok) {
      const msg = {
        TAKEN: `⚠️ المربع #${box} انحجز قبلك — اختر مربع ثاني.`,
        BAD_BOX: '⚠️ مربع غير صالح.',
        SNIPER: 'أنت القناص!',
        NOT_PLAYER: 'أنت مو مشارك بهذي الجولة.',
        OVER: 'انتهى وقت الاختباء.'
      }[r.reason];
      return interaction.update(hidePanel(game, uid, msg));
    }
    await interaction.update(hidePanel(game, uid, `✅ اختبأت بالمربع **#${r.box}** 🤫`));
    if (allHidden(game)) {
      // الكل اختبأ ← الصيد يبدأ فوراً (بدون انتظار باقي الوقت)
      lm.setTimer(game, () => endHiding(game), 0);
    } else {
      await lm.safeEdit(game, game.hideMessage, hideStatusPayload(game));
    }
    return undefined;
  }

  if (action === 'panel' || action === 'weapon') {
    if (uid !== game.sniperId) return ephemeral(interaction, 'هذي اللوحة للقناص فقط 🎯');
    if (game.phase === 'hiding') return ephemeral(interaction, 'اللاعبين يختبئون الحين — انتظر ⏳');
    if (game.phase !== 'hunting') return ephemeral(interaction, 'الجولة انتهت.');
    if (action === 'panel') {
      const panel = sniperPanel(game);
      delete panel.attachments; // رد جديد — ما فيه صور قديمة تنشال
      return interaction.reply({ ...panel, flags: MessageFlags.Ephemeral });
    }
    const [, , weapon, page] = args;
    if (!cfg().weapons[weapon]) return ephemeral(interaction, 'سلاح غير معروف.');
    if (game.ammo[weapon] <= 0) return interaction.update(sniperPanel(game, { note: `❌ ذخيرة ${weaponLabel(weapon)} خلصت.` }));
    return interaction.update(sniperPanel(game, { weapon, page }));
  }

  if (action === 'shoot') {
    if (uid !== game.sniperId) return ephemeral(interaction, 'هذي اللوحة للقناص فقط 🎯');
    const [, , weapon, page] = args;
    const r = shoot(game, uid, weapon, interaction.values);
    if (!r.ok) {
      const msg = {
        OVER: 'الجولة انتهت.',
        NO_AMMO: `❌ ذخيرة ${cfg().weapons[weapon] ? weaponLabel(weapon) : ''} خلصت.`,
        BAD_COUNT: '⚠️ عدد المربعات غير صحيح لهالسلاح.',
        BAD_BOX: '⚠️ مربع غير صالح أو سبق ضربه.',
        BAD_WEAPON: 'سلاح غير معروف.',
        NOT_SNIPER: 'هذي اللوحة للقناص فقط 🎯'
      }[r.reason];
      if (r.reason === 'OVER') return interaction.update({ embeds: [eb.warning(msg)], components: [], files: [], attachments: [] });
      return interaction.update(sniperPanel(game, { weapon: game.ammo[weapon] > 0 ? weapon : null, page, note: msg }));
    }
    const lines = [
      ...r.hits.map((h) => `💥 المربع **#${h.box}**: أصبت <@${h.id}>!`),
      ...r.misses.map((b) => `💨 المربع **#${b}**: كان فاضي.`)
    ];
    const done = !hiders(game).length;
    await interaction.update(
      done
        ? { embeds: [eb.success(`${lines.join('\n')}\n\n🏆 صدت الجميع!`, '🎯 لوحة القناص')], components: [], files: [], attachments: [] }
        : sniperPanel(game, { note: `${weaponLabel(weapon)}\n${lines.join('\n')}` })
    );
    // علني: الإصابات بس (المربعات الفاضية ما تنعلن)
    if (r.hits.length) await lm.safeSend(game, hitPayload(game, r.hits, weapon), 'إعلان الإصابة');
    if (!game.alive) return undefined;
    if (done) return finish(game, 'sniper');
    await lm.safeEdit(game, game.huntMessage, huntStatusPayload(game));
    return undefined;
  }
  return undefined;
}

module.exports = {
  ...lm,
  handleAction,
  hide,
  shoot,
  endHiding,
  finish,
  gridSizeFor,
  ammoFor,
  pagesOf,
  hidePanel,
  sniperPanel,
  hideStatusPayload,
  huntStatusPayload
};
