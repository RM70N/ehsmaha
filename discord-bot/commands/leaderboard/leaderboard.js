'use strict';

// /المتصدرين [نوع: عام/أسبوعي] — أعلى اللاعبين مع ميداليات، 10 بكل صفحة،
// وأزرار السابق/التالي لو القائمة أطول. النتائج مخزّنة مؤقتاً (LEADERBOARD_CACHE_SECONDS)
// فالتنقل بين الصفحات وطلبات الناس المتكررة ما تضغط على قاعدة البيانات.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const cache = require('../../utils/cache');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const { friendlyMessage } = require('../../utils/errors');
const { loadConfig } = require('../../config');

const PAGE_SIZE = 10;
const FETCH_LIMIT = 50; // 5 صفحات
const MEDALS = ['🥇', '🥈', '🥉'];
const PERIODS = {
  global: { label: 'عام', title: '🏆 المتصدرين — الترتيب العام', unit: 'XP' },
  weekly: { label: 'أسبوعي', title: '🔥 المتصدرين — هذا الأسبوع', unit: 'XP هذا الأسبوع' }
};

async function fetchBoard(period) {
  const ttl = loadConfig().leaderboardCacheSeconds;
  const board = await cache.remember(`lb:${period}`, ttl, () => api.getLeaderboard(period, FETCH_LIMIT));
  // الترتيب الأسبوعي قيد التجهيز (أول لقطة للأسبوع) — ما نخزّن هذي الحالة المؤقتة
  if (board && board.building) cache.del(`lb:${period}`);
  return board;
}

function rankLabel(rank) {
  return MEDALS[rank - 1] || `\`#${String(rank).padStart(2, ' ')}\``;
}

function buildPage(board, period, page, ownerId) {
  const meta = PERIODS[period];
  const entries = Array.isArray(board.entries) ? board.entries : [];
  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = entries.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  let description;
  if (board.building) {
    description = '⏳ جاري تجهيز الترتيب الأسبوعي لأول مرة هذا الأسبوع — جرّب بعد دقيقتين.';
  } else if (!slice.length) {
    description = period === 'weekly'
      ? 'ما فيه أحد جمع نقاط هذا الأسبوع بعد — كن أول واحد! 🎮'
      : 'لا يوجد لاعبين بالقائمة بعد 🎮';
  } else {
    description = slice
      .map((e) => {
        const name = eb.safeName(e.username);
        const pts = `**${eb.formatNumber(e.points)}** ${meta.unit}`;
        const lvl = e.level ? ` · لفل ${e.level}` : '';
        return `${rankLabel(e.rank)} ${e.rank <= 3 ? `**${name}**` : name} — ${pts}${lvl}`;
      })
      .join('\n');
  }

  if (period === 'weekly' && board.since && !board.building) {
    description += `\n\n🗓️ محسوبة منذ ${eb.discordDate(board.since, 'f')}` +
      (board.partial ? ' (بداية التتبّع لهذا الأسبوع)' : '');
  }

  const embed = eb.brand({
    tone: 'gold',
    title: meta.title,
    url: loadConfig().siteUrl,
    description,
    thumbnail: loadConfig().logoUrl,
    timestamp: board.generatedAt ? new Date(board.generatedAt) : true
  });
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId.build('lb', 'page', period, current - 1, ownerId))
          .setStyle(ButtonStyle.Secondary)
          .setLabel('السابق')
          .setEmoji('◀️')
          .setDisabled(current === 0),
        new ButtonBuilder()
          .setCustomId(customId.build('lb', 'noop', period, current, ownerId))
          .setStyle(ButtonStyle.Secondary)
          .setLabel(`${current + 1} / ${totalPages}`)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(customId.build('lb', 'page', period, current + 1, ownerId))
          .setStyle(ButtonStyle.Secondary)
          .setLabel('التالي')
          .setEmoji('▶️')
          .setDisabled(current >= totalPages - 1)
      )
    );
  }
  return { embeds: [embed], components };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('المتصدرين')
    .setDescription('يعرض قائمة أعلى اللاعبين في احسمها')
    .addStringOption((o) =>
      o
        .setName('نوع')
        .setDescription('نوع الترتيب (الافتراضي: عام)')
        .setRequired(false)
        .addChoices({ name: 'عام', value: 'global' }, { name: 'أسبوعي', value: 'weekly' })
    ),

  async execute(interaction) {
    const period = interaction.options.getString('نوع') || 'global';
    if (!PERIODS[period]) return respond.send(interaction, { embeds: [eb.error('نوع ترتيب غير معروف.')] }, { ephemeral: true });
    if (!(await respond.defer(interaction))) return;

    try {
      const board = await fetchBoard(period);
      return respond.send(interaction, buildPage(board, period, 0, interaction.user.id));
    } catch (err) {
      return respond.send(interaction, { embeds: [eb.error(friendlyMessage(err))] });
    }
  },

  buttons: {
    // lb:page:<period>:<page>:<ownerId>
    async lb(interaction, args) {
      const [action, period, pageRaw, ownerId] = args;
      if (action !== 'page' || !PERIODS[period]) return;

      // التنقل محصور بصاحب الأمر حتى ما يقلب أحد الصفحة على غيره بنص المحادثة
      if (ownerId && ownerId !== interaction.user.id) {
        return respond.send(
          interaction,
          { embeds: [eb.warning('هذي القائمة لشخص ثاني — استخدم **`/المتصدرين`** عشان تتصفح قائمتك الخاصة.')] },
          { ephemeral: true }
        );
      }

      if (!(await respond.deferUpdate(interaction))) return;
      try {
        const board = await fetchBoard(period);
        return respond.send(interaction, buildPage(board, period, Number.parseInt(pageRaw, 10) || 0, ownerId));
      } catch (err) {
        return interaction.followUp({ embeds: [eb.error(friendlyMessage(err))], flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  },

  _internal: { buildPage, rankLabel }
};
