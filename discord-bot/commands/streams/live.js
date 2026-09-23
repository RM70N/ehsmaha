'use strict';

// /بث — الستريمرز اللي يبثون الآن على احسمها (من جلسات البث بذاكرة البوت:
// webhook لحظي + مزامنة دورية كل دقيقة). 10 ستريمرز بالصفحة مع أزرار
// السابق/التالي. أمر واحد كل 5 ثوانٍ لكل مستخدم.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const customId = require('../../utils/customId');
const liveStreams = require('../../services/liveStreams');
const { loadConfig } = require('../../config');

const PAGE_SIZE = 10;

const PLATFORM_META = {
  tiktok: { icon: '📱', label: 'تيك توك', url: (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}/live` },
  twitch: { icon: '🟣', label: 'Twitch', url: (u) => `https://www.twitch.tv/${encodeURIComponent(u)}` },
  kick: { icon: '🟢', label: 'Kick', url: (u) => `https://kick.com/${encodeURIComponent(u)}` },
  youtube: { icon: '▶️', label: 'YouTube', url: (u) => `https://www.youtube.com/@${encodeURIComponent(u)}/live` }
};

// اسم داخل رابط Markdown: نهرب الأقواس المربعة حتى ما ينكسر الرابط
const linkText = (s) => eb.safeName(s).replace(/[[\]]/g, '');

function streamLine(s) {
  const meta = PLATFORM_META[s.platform] || { icon: '🎮', label: s.platform, url: null };
  const user = linkText(s.platformUsername);
  const who = meta.url ? `[@${user}](${meta.url(s.platformUsername)})` : `@${user}`;
  return `${meta.icon} **${who}** — 🎮 ${eb.safeName(s.gameName)} · ${eb.discordDate(s.startedAt, 'R')}`;
}

function buildPage(streams, page, ownerId) {
  const config = loadConfig();
  if (!streams.length) {
    const embed = eb.brand({
      tone: 'muted',
      title: '🔴 البث المباشر الآن على احسمها',
      description: 'لا يوجد بث نشط على احسمها حالياً 🎮\n\nأول ما يبدأ ستريمر لعبة بتلقاه هنا.',
      thumbnail: config.logoUrl
    });
    return { embeds: [embed], components: [] };
  }

  const totalPages = Math.ceil(streams.length / PAGE_SIZE);
  const current = Math.min(Math.max(0, page), totalPages - 1);
  const slice = streams.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const embed = eb.brand({
    tone: 'deep',
    title: '🔴 البث المباشر الآن على احسمها',
    url: config.siteUrl,
    description: `🎙️ **${streams.length}** ستريمر يبث الحين\n\n` + slice.map(streamLine).join('\n'),
    thumbnail: config.logoUrl
  });
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  const components = [];
  if (totalPages > 1) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId.build('bt', 'page', current - 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('السابق').setEmoji('◀️').setDisabled(current === 0),
        new ButtonBuilder().setCustomId(customId.build('bt', 'noop', current)).setStyle(ButtonStyle.Secondary).setLabel(`${current + 1} / ${totalPages}`).setDisabled(true),
        new ButtonBuilder().setCustomId(customId.build('bt', 'page', current + 1, ownerId)).setStyle(ButtonStyle.Secondary).setLabel('التالي').setEmoji('▶️').setDisabled(current >= totalPages - 1)
      )
    );
  }
  return { embeds: [embed], components };
}

module.exports = {
  data: new SlashCommandBuilder().setName('بث').setDescription('يعرض الستريمرز اللي يبثون الآن على احسمها'),
  options: { cooldownMs: 5000 },

  async execute(interaction) {
    // البيانات بالذاكرة (فورية) — ما يحتاج defer
    return respond.send(interaction, buildPage(liveStreams.list(), 0, interaction.user.id));
  },

  buttons: {
    // bt:page:<page>:<ownerId>
    async bt(interaction, args) {
      const [action, pageRaw, ownerId] = args;
      if (action !== 'page') return;
      if (ownerId && ownerId !== interaction.user.id) {
        return respond.send(interaction, { embeds: [eb.warning('هذي القائمة لشخص ثاني — استخدم **`/بث`** عشان تتصفح قائمتك.')] }, { ephemeral: true });
      }
      return interaction.update(buildPage(liveStreams.list(), Number.parseInt(pageRaw, 10) || 0, ownerId));
    }
  },

  _internal: { buildPage, streamLine, PLATFORM_META }
};
