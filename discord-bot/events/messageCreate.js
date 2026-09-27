'use strict';

// كل رسالة بالسيرفر:
//   1) ربط ديسكورد بألعاب الموقع — services/discordRelay.js (روم مربوط بموقع مفتوح:
//      الرسالة تنتقل للعبة لحظياً، وتكمل باقي المعالجة عادي)
//   2) الحماية التلقائية (روابط/سبام) — services/autoMod.js
//   3) مساعد احسمها الذكي — services/aiAssistant.js:
//        • قناة تكت دعم نشط ← رسائل صاحب التكت لـGemini (بسياق المحادثة)
//        • منشن البوت بقناة عادية ← سؤال مستقل
//        • ردود مالك السيرفر على اللاعبين ← أمثلة أسلوب (services/aiStyle.js)
//   4) الردود التلقائية — services/autoReply.js (لو المساعد ما رد)
// كشف الروابط والتكرار ورسائل التكت يحتاج Message Content Intent؛ سبام السرعة
// ورسائل المنشن (ديسكورد يرسل محتواها للبوت دايماً) تشتغل بدونه.

const { Events } = require('discord.js');
const autoMod = require('../services/autoMod');
const autoReply = require('../services/autoReply');
const aiAssistant = require('../services/aiAssistant');
const aiStyle = require('../services/aiStyle');
const discordRelay = require('../services/discordRelay');
const logger = require('../utils/logger');

let started = false;

module.exports = {
  name: Events.MessageCreate,
  async execute(ctx, message) {
    if (!message.guild || !message.author || message.author.bot) return;
    if (!started) {
      started = true;
      autoMod.startSweeper(); // تنظيف دوري لذاكرة تتبّع السبام
    }
    // روم مربوط بلعبة بالموقع: نوصّل الرسالة فوراً (الانضمام بالكلمة المفتاحية + اللعب)
    // — قبل أي شي ثاني عشان ما يأخرها أو يوقفها فحص قاعدة بيانات/صلاحيات.
    try {
      discordRelay.handleMessage(message);
    } catch (err) {
      logger.warn('ربط ديسكورد: تعذّر تمرير رسالة', { channelId: message.channelId, error: err });
    }

    // الحماية: لو الرسالة انحذفت/صاحبها انكتم، ما نرد عليها
    const punished = await autoMod.handleMessage(message, { contentIntent: !!(ctx && ctx.messageContentIntent) });
    if (punished) return;

    try {
      // قناة تكت: المساعد (أو تجاهل لرسائل الدعم) — والمنشن داخلها ما ينعالج مرتين
      const inTicket = await aiAssistant.handleTicketMessage(message);
      if (inTicket === true) return;
      if (inTicket === null) {
        // Reply من صاحب الأسلوب على لاعب ← المساعد يتعلم طريقة كلامه
        if (message.reference) await aiStyle.captureReply(message);
        const botUser = message.client && message.client.user;
        if (await aiAssistant.handleMention(message, botUser)) return;
      }
    } catch (err) {
      logger.error('🤖 خطأ بمعالجة رسالة المساعد', { guildId: message.guild.id, channelId: message.channel && message.channel.id, error: err });
    }
    await autoReply.handleMessage(message);
  }
};
