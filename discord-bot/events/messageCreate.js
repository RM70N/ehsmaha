'use strict';

// كل رسالة بالسيرفر ← الحماية التلقائية (روابط/سبام) — services/autoMod.js
// ثم الردود التلقائية — services/autoReply.js
// كشف الروابط والتكرار يحتاج Message Content Intent؛ سبام السرعة يشتغل بدونه.

const { Events } = require('discord.js');
const autoMod = require('../services/autoMod');
const autoReply = require('../services/autoReply');

let started = false;

module.exports = {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || !message.author || message.author.bot) return;
    if (!started) {
      started = true;
      autoMod.startSweeper(); // تنظيف دوري لذاكرة تتبّع السبام
    }
    // الحماية أولاً: لو الرسالة انحذفت/صاحبها انكتم، ما نرد عليها
    const punished = await autoMod.handleMessage(message, { contentIntent: !!(ctx && ctx.messageContentIntent) });
    if (punished) return;
    await autoReply.handleMessage(message);
  }
};
