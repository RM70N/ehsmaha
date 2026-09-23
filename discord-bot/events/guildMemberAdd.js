'use strict';

// انضمام عضو جديد ← الترحيب البصري (services/welcome.js).
// يحتاج Server Members Intent مفعّل من Developer Portal → Bot.

const { Events } = require('discord.js');
const logger = require('../utils/logger');
const welcome = require('../services/welcome');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(ctx, member) {
    if (!member || !member.guild || (member.user && member.user.bot)) return;
    // ما ننتظر (non-blocking): توليد الصورة ما يأخر معالجة باقي الأحداث
    Promise.resolve(ctx && ctx.dbReady)
      .then(() => welcome.welcomeMember(member))
      .catch((err) => logger.error('خطأ غير متوقع بالترحيب', { guildId: member.guild.id, userId: member.id, error: err }));
  }
};
