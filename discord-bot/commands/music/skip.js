'use strict';

// /تخطي — تخطي الأغنية الحالية (لأعضاء الروم الصوتي). نفس !تخطي.

const { SlashCommandBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { runCommand } = require('../../music/MusicControls');

module.exports = {
  data: new SlashCommandBuilder().setName('تخطي').setDescription('⏭️ تخطي الأغنية الحالية'),
  options: { cooldownMs: 2000 },

  async execute(interaction) {
    if (!interaction.guild) return respond.send(interaction, { content: 'الموسيقى تشتغل داخل السيرفرات فقط.' }, { ephemeral: true });
    if (!(await respond.defer(interaction))) return undefined;
    const r = await runCommand('تخطي', { guild: interaction.guild, member: interaction.member, textChannel: interaction.channel });
    if (r.ephemeral) {
      await interaction.deleteReply().catch(() => {});
      return interaction.followUp({ ...r.payload, flags: 64 }).catch(() => null);
    }
    return respond.send(interaction, r.payload);
  }
};
