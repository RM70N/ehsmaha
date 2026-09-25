'use strict';

// روم انضاف/انحذف/تعدّل بالسيرفر الرسمي ← تحديث قائمة الرومات اللي يعرضها
// الموقع بقسم "الانضمام عبر ديسكورد" (services/discordJoin.js).

const { Events } = require('discord.js');
const discordJoin = require('../services/discordJoin');

module.exports = {
  name: Events.ChannelCreate,
  async execute(ctx, channel) {
    if (channel && channel.guild) discordJoin.scheduleChannelSync(channel.guild);
  }
};
