'use strict';

// /احصائيات يوزر:<اليوزرنيم> — الانتصارات، الهزائم، معدل الفوز، الترتيب، أكثر لعبة،
// أكثر ستريمر يلعب عنده، أعلى نقاط بجولة، الإنجازات، الإطارات، وإحصائياته كستريمر.
// نفس العرض يُستخدم لزر "عرض الإحصائيات" بالبروفايل.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const { friendlyMessage } = require('../../utils/errors');
const { loadConfig } = require('../../config');
const { addUsernameOption, readUsername, notFoundPayload, autocompleteUsernames } = require('../../utils/player');

const SPACER = { name: '\u200b', value: '\u200b', inline: true };

// Discord يرص حتى 3 حقول inline بالصف؛ نضيف فاصل شفاف بعد كل حقلين
// حتى يطلع العرض بعمودين مرتبين على الكمبيوتر (والجوال يعرضها تحت بعض أصلاً).
function twoColumns(fields) {
  const out = [];
  fields.forEach((f, i) => {
    out.push(f);
    if (i % 2 === 1 && i !== fields.length - 1) out.push(SPACER);
  });
  return out;
}

function buildStatsEmbed(stats) {
  const wins = stats.wins || {};
  const winsBreakdown = [
    wins.stream ? `بث: ${eb.formatNumber(wins.stream)}` : null,
    wins.solo ? `فردي: ${eb.formatNumber(wins.solo)}` : null,
    wins.online ? `أونلاين: ${eb.formatNumber(wins.online)}` : null
  ].filter(Boolean).join(' · ');

  const most = stats.mostPlayedGame
    ? `**${eb.safeName(stats.mostPlayedGame.name)}**\n${eb.formatNumber(stats.mostPlayedGame.count)} ${stats.mostPlayedGame.source === 'wins' ? 'فوز' : 'مرة'}`
    : 'لا يوجد بعد';

  const rank = stats.globalRank
    ? `**#${eb.formatNumber(stats.globalRank)}** من ${eb.formatNumber(stats.totalRanked)}`
    : 'غير مصنّف بعد';

  const best = stats.bestRoundPoints ? `**${eb.formatNumber(stats.bestRoundPoints)}** نقطة` : 'لم تُسجَّل بعد';
  // null = بيانات الجولات ما تكفي لحساب دقيق (فوزات أكثر من الجولات المسجّلة)
  const losses = stats.losses == null ? '—' : `**${eb.formatNumber(stats.losses)}**`;
  const winRate = stats.winRate == null ? '—' : `**${Number(stats.winRate).toFixed(1)}%**`;

  const topStreamer = stats.topStreamer
    ? `**@${eb.safeName(stats.topStreamer.name)}**\n${eb.formatNumber(stats.topStreamer.wins)} فوز عنده` +
      (stats.streamersCount > 1 ? ` · لعب مع ${eb.formatNumber(stats.streamersCount)} ستريمر` : '')
    : 'لا يوجد بعد';

  const ach = stats.achievements || { earned: [], total: 0 };
  const achValue = ach.total
    ? `**${ach.earned.length}** من ${ach.total}` + (ach.earned.length ? `\n${ach.earned.map((a) => a.icon).join(' ')}` : '')
    : '—';

  const embed = eb
    .brand({
      tone: 'deep',
      title: `📊 إحصائيات ${eb.safeName(stats.username)}`,
      url: stats.profileUrl,
      thumbnail: stats.avatarUrl || loadConfig().logoUrl,
      description:
        `⭐ لفل **${stats.level}** · 🎮 **${eb.formatNumber(stats.roundsPlayed)}** جولة ملعوبة` +
        (stats.points ? ` · 💎 **${eb.formatNumber(stats.points)}** نقطة` : '')
    })
    .addFields(
      twoColumns([
        eb.field('🏆 الانتصارات', `**${eb.formatNumber(wins.total)}**${winsBreakdown ? `\n${winsBreakdown}` : ''}`),
        eb.field('💔 الهزائم', losses),
        eb.field('📈 معدل الفوز', winRate),
        eb.field('🥇 الترتيب العام', rank),
        eb.field('🎯 أكثر لعبة لعبها', most),
        eb.field('📺 أكثر ستريمر يلعب عنده', topStreamer),
        eb.field('🔥 أعلى نقاط بجولة', best),
        eb.field('🎲 ألعاب مختلفة جرّبها', `**${eb.formatNumber(stats.gamesVariety || 0)}** لعبة`),
        eb.field('🏅 الإنجازات', achValue),
        eb.field('🖼️ الإطارات المملوكة', `**${eb.formatNumber(stats.framesCount || 0)}** إطار`)
      ])
    );

  if (stats.asStreamer) {
    embed.addFields(
      eb.field(
        '🎙️ كستريمر',
        `**${eb.formatNumber(stats.asStreamer.players)}** لاعب فازوا ببثه · **${eb.formatNumber(stats.asStreamer.wins)}** فوز وزّعها`,
        false
      )
    );
  }

  if (Array.isArray(stats.recentGames) && stats.recentGames.length) {
    const recent = stats.recentGames
      .slice(0, 5)
      .map((g) => `• ${eb.safeName(g.name)}${g.at ? ` — ${eb.discordDate(g.at, 'R')}` : ''}`)
      .join('\n');
    embed.addFields(eb.field('🕒 آخر الألعاب', recent, false));
  }
  return embed;
}

function siteButton(url) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('فتح الموقع').setEmoji('🌐').setURL(url)
  );
}

// منطق مشترك بين الأمر والزر
async function renderStats(interaction, username) {
  try {
    const stats = await api.getStatsByUsername(username);
    return respond.send(interaction, { embeds: [buildStatsEmbed(stats)], components: [siteButton(stats.profileUrl)] });
  } catch (err) {
    if (err.code === 'PLAYER_NOT_FOUND') return respond.send(interaction, notFoundPayload(username));
    return respond.send(interaction, { embeds: [eb.error(friendlyMessage(err))] });
  }
}

module.exports = {
  data: addUsernameOption(
    new SlashCommandBuilder().setName('احصائيات').setDescription('يعرض الإحصائيات التفصيلية لأي لاعب في احسمها باليوزرنيم'),
    'اليوزرنيم كما هو مسجل بموقع احسمها'
  ),

  async execute(interaction) {
    const username = readUsername(interaction);
    if (!username) return respond.send(interaction, notFoundPayload(''), { ephemeral: true });
    if (!(await respond.defer(interaction))) return;
    return renderStats(interaction, username);
  },

  autocomplete: autocompleteUsernames,

  buttons: {
    // stats:show:<username مشفّر> — زر "عرض الإحصائيات" تحت البروفايل.
    // الرد خاص (ephemeral) لمن ضغط، حتى ما تمتلئ القناة برسائل مكررة.
    async stats(interaction, args) {
      const [action, ...rest] = args;
      if (action !== 'show' || !rest.length) return;
      let username;
      try {
        username = decodeURIComponent(rest.join(':'));
      } catch (_) {
        return;
      }
      if (!(await respond.defer(interaction, { ephemeral: true }))) return;
      return renderStats(interaction, username);
    }
  },

  _internal: { buildStatsEmbed, twoColumns }
};
