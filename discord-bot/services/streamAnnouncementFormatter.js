'use strict';

// تصميم رسائل الإعلان التلقائي + رسائل أوامر الإضافة/الإزالة (بهوية احسمها البنفسجية).

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const eb = require('../utils/embedBuilder');
const { PLATFORM_LABELS } = require('./streamLinkResolver');

const GREETING = 'حياكم ستريمر يبث احسمها';
// اليوزر يمر بالتحقق (أحرف وأرقام ونقطة وشرطة فقط) لكن نقصّه ونشيل أي رموز منسّقة احتياطاً
const safe = (s) => String(s || '').replace(/[`*_~|>\\@<]/g, '').slice(0, 60);

/**
 * @param {{platform:string, username:string, url:string, mention:boolean}} o
 * mention=false لو البوت ما عنده صلاحية منشن everyone ← نرسل الإعلان بدون ادّعاء المنشن
 */
function announcementPayload({ platform, username, url, mention = true }) {
  const embed = eb.brand({
    tone: 'primary',
    title: 'ستريمر من احسمها على الهواء!',
    description: `**الستريمر:** \`${safe(username)}\`\n**المنصة:** \`${PLATFORM_LABELS[platform] || platform}\`\n**الحالة:** \`LIVE\`\n\n**رابط البث:**\n${url}`
  });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('شاهد البث الآن').setURL(url));
  return {
    content: mention ? `${GREETING} @everyone` : GREETING,
    embeds: [embed],
    components: [row],
    // المنشن الوحيد المسموح: everyone — ما فيه user/role mentions من أي بيانات خارجية
    allowedMentions: mention ? { parse: ['everyone'], users: [], roles: [] } : { parse: [] }
  };
}

const addedPayload = ({ username, platform, channelId }) => ({
  embeds: [
    eb.brand({
      tone: 'primary',
      title: 'تمت إضافة الستريمر بنجاح',
      description:
        `**الستريمر:** \`${safe(username)}\`\n**المنصة:** \`${PLATFORM_LABELS[platform]}\`\n**الحالة:** \`تم تفعيل المراقبة\`\n**روم الإعلانات:** <#${channelId}>\n\n` +
        'من الآن، إذا ربط هذا الستريمر بثه بأحسمها على المنصة المحددة، راح يتم نشر رابط بثه تلقائياً في روم الإعلانات.'
    })
  ]
});

const removedPayload = ({ username, platform }) => ({
  embeds: [
    eb.brand({
      tone: 'primary',
      title: 'تمت إزالة الستريمر',
      description: `**الستريمر:** \`${safe(username)}\`\n**المنصة:** \`${PLATFORM_LABELS[platform]}\`\n**الحالة:** \`تم إيقاف الإعلانات التلقائية\`\n\nلن يتم إرسال إعلانات جديدة لهذا الحساب إلا بعد تسجيله مرة ثانية.`
    })
  ]
});

module.exports = { GREETING, announcementPayload, addedPayload, removedPayload, safe };
