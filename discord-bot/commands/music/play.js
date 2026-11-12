'use strict';

// /اغنية — تشغيل أغنية بالاسم (نتائج بحث تختار منها) أو برابط YouTube / Spotify. نفس الأمر `!اغنية`.
// أزرار اللوحة وقائمة اختيار البحث (البادئة mu) تُعالَج هنا لكل أوامر الموسيقى.

const { SlashCommandBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { runCommand, onComponent } = require('../../music/MusicControls');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('اغنية')
    .setDescription('🎵 شغّل أغنية بالاسم أو برابط يوتيوب/سبوتيفاي (لازم تكون بروم صوتي)')
    .addStringOption((o) => o.setName('الاغنية').setDescription('اسم الأغنية/الفنان أو رابط YouTube أو Spotify').setRequired(true).setMaxLength(300)),
  options: { cooldownMs: 2000 },

  async execute(interaction) {
    if (!interaction.guild) return respond.send(interaction, { content: 'الموسيقى تشتغل داخل السيرفرات فقط.' }, { ephemeral: true });
    if (!(await respond.defer(interaction))) return undefined;
    const member = interaction.member;
    const r = await runCommand('اغنية', { guild: interaction.guild, member, textChannel: interaction.channel, args: interaction.options.getString('الاغنية', true) });
    return respond.send(interaction, r.payload);
  },

  buttons: {
    mu: (interaction, args) => onComponent(interaction, args)
  }
};
