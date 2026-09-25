'use strict';

// عضو طلع من السيرفر ← يُزال من أي لعبة روليت نشطة بدون ما تنكسر الجولة.
// (يحتاج Server Members Intent — نفس اللي يحتاجه الترحيب.)

const { Events } = require('discord.js');
const roulette = require('../services/roulette');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member || !member.guild) return;
    await roulette.removeMember(member.guild.id, member.id);
  }
};
