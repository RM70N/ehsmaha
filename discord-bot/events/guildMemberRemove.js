'use strict';

// عضو طلع من السيرفر ← يُزال من أي راوند ألعاب نشط (دول / روليت / قناص) بدون ما تنكسر الجولة.
// (يحتاج Server Members Intent — نفس اللي يحتاجه الترحيب.)

const { Events } = require('discord.js');
const rounds = require('../services/discordRounds');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member || !member.guild) return;
    const rt = rounds.get();
    if (rt) rt.manager.removeMember(member.guild.id, member.id);
  }
};
