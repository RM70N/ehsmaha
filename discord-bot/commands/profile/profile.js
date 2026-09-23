'use strict';

// /بروفايل يوزر:<اليوزرنيم> — بطاقة اللاعب: الأفتار، الاسم، اللفل مع شريط XP،
// النقاط، الألعاب الملعوبة، الإطارات المملوكة، الإنجازات، الألعاب المفضلة،
// الأصدقاء، تاريخ الانضمام + زر الإحصائيات وزر الموقع.
// البحث مباشر باليوزرنيم بقاعدة بيانات الموقع (بدون أي ربط بديسكورد).

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const api = require('../../utils/apiClient');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const { friendlyMessage } = require('../../utils/errors');
const { loadConfig } = require('../../config');
const { addUsernameOption, readUsername, notFoundPayload, autocompleteUsernames } = require('../../utils/player');

function framesValue(frames) {
  if (!frames || !frames.count) return 'لا يملك إطارات بعد';
  const lines = [`**${eb.formatNumber(frames.count)}** إطار`];
  if (frames.active) lines.push(`✅ المفعّل: **${eb.safeName(frames.active.name)}**`);
  const others = (frames.names || []).filter((n) => !frames.active || n !== frames.active.name);
  if (others.length) {
    const shown = others.slice(0, 8).map((n) => eb.safeName(n)).join('، ');
    lines.push(shown + (others.length > 8 ? ` و${others.length - 8} غيرها` : ''));
  }
  return lines.join('\n');
}

function achievementsValue(ach) {
  if (!ach || !ach.total) return '—';
  if (!ach.earned.length) return `**0** من ${ach.total}`;
  return `**${ach.earned.length}** من ${ach.total}\n` + ach.earned.map((a) => `${a.icon} ${a.name}`).join(' · ');
}

function buildProfileEmbed(profile) {
  const xpLine = profile.isMaxLevel
    ? `${eb.progressBar(1, 0)}  **اللفل الأقصى** 👑 · ${eb.formatNumber(profile.xp)} XP`
    : `${eb.progressBar(profile.xpIntoLevel, profile.xpForNextLevel)}  **${eb.formatNumber(profile.xpIntoLevel)} / ${eb.formatNumber(profile.xpForNextLevel)}** XP`;

  const lines = [`✨ **التقدّم للفل ${profile.isMaxLevel ? profile.level : profile.level + 1}**`, xpLine];
  if (profile.tiktokUsername) lines.push('', `📱 مربوط بتيك توك: \`@${eb.clip(profile.tiktokUsername, 40)}\``);
  if (Array.isArray(profile.roles) && profile.roles.length) lines.push(`🏷️ ${profile.roles.join(' · ')}`);
  if (!profile.registered) lines.push('🎮 لاعب بث (بدون حساب مسجّل بالموقع)');

  const embed = eb
    .brand({
      tone: 'primary',
      title: `👑 ${eb.safeName(profile.username)}`,
      url: profile.profileUrl,
      description: lines.join('\n'),
      thumbnail: profile.avatarUrl || loadConfig().logoUrl
    })
    .setAuthor({ name: 'بروفايل لاعب — احسمها', iconURL: loadConfig().logoUrl })
    .addFields(
      eb.field('⭐ اللفل', `**${profile.level}**`),
      eb.field('💎 النقاط', `**${eb.formatNumber(profile.points)}**`),
      eb.field('🎮 الألعاب الملعوبة', `**${eb.formatNumber(profile.roundsPlayed)}** جولة`),
      eb.field('🧪 مجموع الخبرة', `${eb.formatNumber(profile.xp)} XP`),
      eb.field('📅 تاريخ الانضمام', profile.joinedAt ? eb.discordDate(profile.joinedAt, 'D') : '—'),
      eb.field('👥 الأصدقاء', profile.friends == null ? '—' : `**${eb.formatNumber(profile.friends)}**`),
      eb.field('🕹️ آخر لعبة', profile.lastGame ? eb.safeName(profile.lastGame) : '—'),
      eb.field('🖼️ الإطارات', framesValue(profile.frames), false),
      eb.field('🏅 الإنجازات والشارات', achievementsValue(profile.achievements), false)
    );

  if (Array.isArray(profile.favoriteGames) && profile.favoriteGames.length) {
    embed.addFields(eb.field('❤️ الألعاب المفضلة', profile.favoriteGames.map((g) => eb.safeName(g)).join(' · '), false));
  }
  // صورة الإطار المفعّل (للإطارات المرفوعة برابط https فقط)
  if (profile.frames && profile.frames.active && profile.frames.active.imageUrl) embed.setImage(profile.frames.active.imageUrl);
  return embed;
}

function buildButtons(profile, username) {
  const row = new ActionRowBuilder();
  // زر الإحصائيات يحمل اليوزر داخل الـcustomId (حده 100 حرف) — نتخطاه لو الاسم طويل جداً
  let statsId = null;
  try {
    statsId = customId.build('stats', 'show', encodeURIComponent(username));
  } catch (_) {
    statsId = null;
  }
  if (statsId) {
    row.addComponents(
      new ButtonBuilder().setCustomId(statsId).setStyle(ButtonStyle.Primary).setLabel('عرض الإحصائيات').setEmoji('📊')
    );
  }
  row.addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('فتح الموقع').setEmoji('🌐').setURL(profile.profileUrl));
  return row;
}

module.exports = {
  data: addUsernameOption(
    new SlashCommandBuilder().setName('بروفايل').setDescription('يعرض بروفايل أي لاعب في احسمها باليوزرنيم'),
    'اليوزرنيم كما هو مسجل بموقع احسمها'
  ),

  async execute(interaction) {
    const username = readUsername(interaction);
    if (!username) return respond.send(interaction, notFoundPayload(''), { ephemeral: true });
    if (!(await respond.defer(interaction))) return;

    try {
      const profile = await api.getProfileByUsername(username);
      return respond.send(interaction, {
        embeds: [buildProfileEmbed(profile)],
        components: [buildButtons(profile, profile.username || username)]
      });
    } catch (err) {
      if (err.code === 'PLAYER_NOT_FOUND') return respond.send(interaction, notFoundPayload(username));
      return respond.send(interaction, { embeds: [eb.error(friendlyMessage(err))] });
    }
  },

  autocomplete: autocompleteUsernames,

  _internal: { buildProfileEmbed, buildButtons }
};
