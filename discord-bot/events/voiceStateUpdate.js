'use strict';

// حالة الصوت: نظام الموسيقى يغادر لو الروم فضي من البشر، ويتابع لو انتقل البوت لروم ثاني.

const { Events } = require('discord.js');
const music = require('../music/MusicEvents');

module.exports = {
  name: Events.VoiceStateUpdate,
  execute(ctx, oldState, newState) {
    music.onVoiceStateUpdate(oldState, newState, ctx.client);
  }
};
