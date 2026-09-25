'use strict';

// /العاب — قائمة الألعاب المتوفرة بالبوت (بنفس تصميم /مساعدة).
// المحتوى من config/games.js: أي لعبة تنضاف هناك تظهر هنا تلقائياً.

const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const games = require('../../config/games');
const { loadConfig } = require('../../config');

const MAX_FIELDS = 25; // حد ديسكورد للحقول بالـEmbed

function buildGamesList(list = games) {
  const config = loadConfig();
  const valid = (Array.isArray(list) ? list : []).filter((g) => g && g.command && g.name);
  const embed = eb.brand({
    tone: 'primary',
    title: '🎮 ألعاب احسمها بديسكورد',
    description: valid.length
      ? `العب مع أصحابك داخل السيرفر مباشرة — اكتب أمر اللعبة بأي قناة 👇\n**${valid.length}** ${valid.length === 1 ? 'لعبة متوفرة' : 'ألعاب متوفرة'} حالياً.`
      : 'ما فيه ألعاب متوفرة حالياً — ترقبوا الجديد 🎮',
    thumbnail: config.logoUrl
  });
  for (const g of valid.slice(0, MAX_FIELDS)) {
    const players = g.minPlayers ? `\n👥 أقل عدد: **${g.minPlayers}** لاعبين` : '';
    embed.addFields(eb.field(`${g.emoji ? g.emoji + ' ' : ''}${g.name} — \`${g.command}\``, `${g.description}${players}`, false));
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('ألعاب أكثر بالموقع').setEmoji('🌐').setURL(config.siteUrl)
  );
  return { embeds: [embed], components: [row] };
}

module.exports = {
  data: new SlashCommandBuilder().setName('العاب').setDescription('🎮 قائمة ألعاب ديسكورد (روليت الإقصاء، لعبة الدول، …) وطريقة لعب كل وحدة'),
  async execute(interaction) {
    return respond.send(interaction, buildGamesList());
  },
  _internal: { buildGamesList }
};
