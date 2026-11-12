'use strict';

// /ايقاف — إيقاف الموسيقى والخروج من الروم الصوتي. نفس !ايقاف.

const { SlashCommandBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { runCommand } = require('../../music/MusicControls');

module.exports = {
  data: new SlashCommandBuilder().setName('ايقاف').setDescription('⏹️ إيقاف الموسيقى وخروج البوت من الروم'),
  options: { cooldownMs: 2000 },

  async execute(interaction) {
    if (!interaction.guild) return respond.send(interaction, { content: 'الموسيقى تشتغل داخل السيرفرات فقط.' }, { ephemeral: true });
    if (!(await respond.defer(interaction))) return undefined;
    const r = await runCommand('ايقاف', { guild: interaction.guild, member: interaction.member, textChannel: interaction.channel });
    if (r.ephemeral) {
      await interaction.deleteReply().catch(() => {});
      return interaction.followUp({ ...r.payload, flags: 64 }).catch(() => null);
    }
    return respond.send(interaction, r.payload);
  }
};
