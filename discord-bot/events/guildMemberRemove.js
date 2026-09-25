'use strict';

// عضو طلع من السيرفر ← يُزال من أي لعبة جماعية نشطة (روليت / دول / قناص) بدون ما
// تنكسر الجولة. (يحتاج Server Members Intent — نفس اللي يحتاجه الترحيب.)

const { Events } = require('discord.js');
const roulette = require('../services/roulette');
const countries = require('../services/countriesGame');
const sniper = require('../services/sniperGame');

const GAMES = [roulette, countries, sniper];

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(ctx, member) {
    if (!member || !member.guild) return;
    for (const game of GAMES) {
      await game.removeMember(member.guild.id, member.id).catch(() => null);
    }
  }
};
