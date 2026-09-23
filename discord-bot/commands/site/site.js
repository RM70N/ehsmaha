'use strict';

// /احسمها و /الموقع — تعريف مختصر بالمنصة + زر زيارة الموقع.
// ملف واحد يسجّل اسمين للأمر نفسه (المحمّل يدعم مصفوفة builders).

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const { loadConfig } = require('../../config');

const DESCRIPTION = 'يعرض رابط موقع احسمها ونبذة عن المنصة';

function buildSiteMessage() {
  const config = loadConfig();
  const embed = eb
    .brand({
      tone: 'primary',
      title: '👑 احسمها — ehsmaha.com',
      url: config.siteUrl,
      description:
        '**منصة ألعاب تفاعلية للبث المباشر** 🎮\n' +
        'حوّل بثك لساحة منافسة: متابعينك يلعبون معك مباشرة من الشات بعشرات الألعاب الجماعية والفردية والأونلاين.\n\n' +
        '**المنصات المدعومة:**\n' +
        '📱 تيك توك · 🟣 Twitch · 🟢 Kick · ▶️ YouTube\n\n' +
        '⭐ لفلات وخبرة · 🏆 لوحات متصدرين · 🖼️ إطارات · 🎪 فعاليات وبطولات'
    })
    .setThumbnail(config.logoUrl);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('زيارة الموقع').setEmoji('🌐').setURL(config.siteUrl)
  );
  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: [
    new SlashCommandBuilder().setName('احسمها').setDescription(DESCRIPTION),
    new SlashCommandBuilder().setName('الموقع').setDescription(DESCRIPTION)
  ],
  async execute(interaction) {
    return respond.send(interaction, buildSiteMessage());
  }
};
