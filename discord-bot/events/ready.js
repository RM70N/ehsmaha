'use strict';

// عند جاهزية البوت: نسجّل معلومات الاتصال، نفحص صلاحيات البوت بكل سيرفر،
// نضبط الحالة (Presence)، ونتأكد إن طبقة الـAPI تستجيب.

const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const api = require('../utils/apiClient');
const { auditGuildPermissions, inviteUrl } = require('../utils/permissions');

const PRESENCE_REFRESH_MS = 30 * 60 * 1000;
// Render المجاني "ينوّم" خدمة الويب بعد 15 دقيقة بلا طلبات، وأول طلب بعدها
// ياخذ ثواني طويلة (أطول من مهلة الـ5 ثوانٍ). نبضة كل 10 دقائق تبقيها صاحية.
const API_KEEPALIVE_MS = 10 * 60 * 1000;

function setPresence(client) {
  try {
    client.user.setPresence({
      activities: [{ name: 'ehsmaha.com | /مساعدة', type: ActivityType.Playing }],
      status: 'online'
    });
  } catch (err) {
    logger.warn('تعذّر ضبط حالة البوت', { error: err });
  }
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(ctx, client) {
    logger.info(`✅ البوت جاهز باسم ${client.user.tag}`, {
      guilds: client.guilds.cache.size,
      commands: ctx.commands.size
    });
    logger.info('رابط دعوة البوت', { url: inviteUrl(ctx.config.clientId) });

    setPresence(client);
    // Discord أحياناً يمسح الحالة بعد إعادة الاتصال — نعيد ضبطها دورياً
    setInterval(() => setPresence(client), PRESENCE_REFRESH_MS).unref();

    await auditGuildPermissions(client);

    setInterval(() => {
      api.health().catch((err) => logger.warn('نبضة الـAPI فشلت', { code: err.code }));
    }, API_KEEPALIVE_MS).unref();

    try {
      await api.health();
      logger.info('طبقة الـAPI تستجيب ✅', { baseUrl: ctx.config.apiBaseUrl });
    } catch (err) {
      logger.warn('⚠️ طبقة الـAPI لا تستجيب حالياً — الأوامر بتعرض رسالة خطأ ودّية لين ترجع', {
        baseUrl: ctx.config.apiBaseUrl,
        code: err.code
      });
    }
  }
};
