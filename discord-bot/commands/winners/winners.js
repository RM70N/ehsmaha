'use strict';

// /الفائزين [ستريمر] — نفس "لوحة الفائزين" بالموقع (leaderboards):
//   • بدون ستريمر: مجموع فوزات كل متابع عبر كل الستريمرز ("كل الستريمرز" بالموقع).
//   • مع ستريمر: قائمة الفائزين ببث ذاك الستريمر فقط ("الستريمر الحالي" بالموقع).
// منصّة المراكز الثلاثة الأولى بميداليات، ثم بقية الترتيب، 10 بكل صفحة مع أزرار
// السابق/التالي. اسم الستريمر فيه اقتراحات أثناء الكتابة.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const cache = require('../../utils/cache');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const logger = require('../../utils/logger');
const { friendlyMessage } = require('../../utils/errors');
const { loadConfig } = require('../../config');

const OPTION = 'ستريمر';
const PAGE_SIZE = 10;
const FETCH_LIMIT = 50;
const MEDALS = ['🥇', '🥈', '🥉'];

function cleanStreamer(raw) {
  return String(raw || '').trim().replace(/^@+/, '').slice(0, 64);
}

async function fetchWinners(streamer) {
  const ttl = loadConfig().leaderboardCacheSeconds;
  return cache.remember(`wn:${streamer.toLowerCase()}`, ttl, () => api.getWinners(streamer || null, FETCH_LIMIT));
}

function entryLine(e) {
  const name = eb.safeName(e.nickname);
  const game = e.topGame ? ` · 🎯 ${eb.safeName(e.topGame.name)}` : '';
  if (e.rank <= 3) return `${MEDALS[e.rank - 1]} **${name}** — **${eb.formatNumber(e.wins)}** 🏆${game}`;
  return `\`#${String(e.rank).padStart(2, ' ')}\` ${name} — ${eb.formatNumber(e.wins)} 🏆${game}`;
}

function buildPage(board, streamer, page, ownerId) {
  const config = loadConfig();
  const entries = Array.isArray(board.entries) ? board.entries : [];
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = entries.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const scopeLine = board.scope === 'streamer' ? `📺 بث **@${eb.safeName(board.streamer)}**` : `🌍 كل الستريمرز (${eb.formatNumber(board.streamersCount || 0)} ستريمر)`;

  let description;
  if (!slice.length) {
    description = `${scopeLine}\n\nلا توجد فوزات بعد 🎮\nالعب أي لعبة ببث وبتظهر الأسماء هنا`;
  } else {
    description =
      `${scopeLine} · 👥 ${eb.formatNumber(board.totalPlayers)} فائز · 🏆 ${eb.formatNumber(board.totalWins)} فوز\n\n` +
      slice.map(entryLine).join('\n');
  }

  const embed = eb.brand({
    tone: 'gold',
    title: '🏆 لوحة الفائزين',
    url: config.siteUrl,
    description,
    thumbnail: config.logoUrl,
    timestamp: board.generatedAt ? new Date(board.generatedAt) : true
  });
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  const components = [];
  if (totalPages > 1) {
    const enc = encodeURIComponent(streamer || '');
    const id = (p) => {
      try {
        return customId.build('wn', 'page', p, ownerId, enc);
      } catch (_) {
        return null; // اسم ستريمر طويل جداً — بدون أزرار صفحات
      }
    };
    const prevId = id(current - 1);
    const nextId = id(current + 1);
    if (prevId && nextId) {
      components.push(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(prevId).setStyle(ButtonStyle.Secondary).setLabel('السابق').setEmoji('◀️').setDisabled(current === 0),
          new ButtonBuilder()
            .setCustomId(customId.build('wn', 'noop', current))
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`${current + 1} / ${totalPages}`)
            .setDisabled(true),
          new ButtonBuilder().setCustomId(nextId).setStyle(ButtonStyle.Secondary).setLabel('التالي').setEmoji('▶️').setDisabled(current >= totalPages - 1)
        )
      );
    }
  }
  return { embeds: [embed], components };
}

function streamerNotFound(streamer) {
  return {
    embeds: [
      eb.warning(
        `ما لقينا قائمة فائزين للستريمر \`${eb.clip(streamer.replace(/`/g, ''), 64)}\`.\n` +
          '💡 اختر الاسم من الاقتراحات أثناء الكتابة، أو اترك الخيار فاضي لعرض كل الستريمرز.',
        '📺 ستريمر غير موجود'
      )
    ]
  };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('الفائزين')
    .setDescription('لوحة الفائزين — أكثر المتابعين فوزاً بكل الستريمرز أو ببث ستريمر محدد')
    .addStringOption((o) =>
      o
        .setName(OPTION)
        .setDescription('اسم الستريمر (اتركه فاضي لعرض كل الستريمرز)')
        .setRequired(false)
        .setMaxLength(64)
        .setAutocomplete(true)
    ),

  async execute(interaction) {
    const streamer = cleanStreamer(interaction.options.getString(OPTION));
    if (!(await respond.defer(interaction))) return;
    try {
      const board = await fetchWinners(streamer);
      if (streamer && board.found === false) return respond.send(interaction, streamerNotFound(streamer));
      return respond.send(interaction, buildPage(board, streamer, 0, interaction.user.id));
    } catch (err) {
      return respond.send(interaction, { embeds: [eb.error(friendlyMessage(err))] });
    }
  },

  // اقتراحات أسماء الستريمرز — فشلها يرجّع قائمة فاضية بهدوء
  async autocomplete(interaction) {
    const q = cleanStreamer(interaction.options.getFocused()).toLowerCase();
    let choices = [];
    try {
      const data = await cache.remember(`wnac:${q}`, 60, () => api.searchStreamers(q));
      choices = (data.results || [])
        .filter((r) => r && r.value && String(r.value).length <= 100)
        .slice(0, 25)
        .map((r) => ({ name: eb.clip(`📺 ${r.label}`, 100), value: String(r.value) }));
    } catch (err) {
      logger.debug('winners autocomplete failed', { code: err.code });
    }
    await interaction.respond(choices).catch(() => null);
  },

  buttons: {
    // wn:page:<page>:<ownerId>:<streamer مشفّر>
    async wn(interaction, args) {
      const [action, pageRaw, ownerId, ...rest] = args;
      if (action !== 'page') return;
      if (ownerId && ownerId !== interaction.user.id) {
        return respond.send(
          interaction,
          { embeds: [eb.warning('هذي القائمة لشخص ثاني — استخدم **`/الفائزين`** عشان تتصفح قائمتك الخاصة.')] },
          { ephemeral: true }
        );
      }
      let streamer = '';
      try {
        streamer = cleanStreamer(decodeURIComponent(rest.join(':')));
      } catch (_) {
        return;
      }
      if (!(await respond.deferUpdate(interaction))) return;
      try {
        const board = await fetchWinners(streamer);
        return respond.send(interaction, buildPage(board, streamer, Number.parseInt(pageRaw, 10) || 0, ownerId));
      } catch (err) {
        return interaction.followUp({ embeds: [eb.error(friendlyMessage(err))], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },

  _internal: { buildPage, entryLine }
};
