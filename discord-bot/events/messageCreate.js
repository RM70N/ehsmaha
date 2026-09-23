'use strict';

// كل رسالة بالسيرفر ← الحماية التلقائية (روابط/سبام) — services/autoMod.js
// كشف الروابط والتكرار يحتاج Message Content Intent؛ سبام السرعة يشتغل بدونه.

const { Events } = require('discord.js');
const autoMod = require('../services/autoMod');

let started = false;

module.exports = {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || !message.author || message.author.bot) return;
    if (!started) {
      started = true;
      autoMod.startSweeper(); // تنظيف دوري لذاكرة تتبّع السبام
    }
    await autoMod.handleMessage(message, { contentIntent: !!(ctx && ctx.messageContentIntent) });
  }
};
