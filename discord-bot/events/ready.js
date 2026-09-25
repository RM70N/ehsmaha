'use strict';

// عند جاهزية البوت: نسجّل معلومات الاتصال، نفحص صلاحيات البوت بكل سيرفر،
// نضبط الحالة (Presence)، ونتأكد إن طبقة الـAPI تستجيب.

const { Events, ActivityType } = require('discord.js');
const logger = require('../utils/logger');
const api = require('../utils/apiClient');
const { auditGuildPermissions, inviteUrl } = require('../utils/permissions');
const liveStreams = require('../services/liveStreams');
const tickets = require('../services/tickets');
const discordJoin = require('../services/discordJoin');

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

    // تسجيل أوامر Slash تلقائياً (بديل تشغيل npm run deploy-commands يدوياً).
    // التسجيل يستبدل القائمة كاملة: أي أمر محذوف من /commands ينشال من ديسكورد.
    if (ctx.config.autoRegisterCommands) {
      try {
        if (ctx.config.guildId) {
          const guild = await client.guilds.fetch(ctx.config.guildId);
          await guild.commands.set(ctx.definitions);
          logger.info('✅ تم تسجيل الأوامر بسيرفر التطوير تلقائياً', { guildId: ctx.config.guildId, count: ctx.definitions.length });
        } else {
          await client.application.commands.set(ctx.definitions);
          logger.info('✅ تم تسجيل الأوامر عالمياً تلقائياً', { count: ctx.definitions.length });
        }
      } catch (err) {
        logger.error('تعذّر تسجيل الأوامر تلقائياً — جرّب npm run deploy-commands', { code: err.code, reason: err.message });
      }
    }

    setPresence(client);
    // Discord أحياناً يمسح الحالة بعد إعادة الاتصال — نعيد ضبطها دورياً
    setInterval(() => setPresence(client), PRESENCE_REFRESH_MS).unref();

    await auditGuildPermissions(client);

    setInterval(() => {
      api.health().catch((err) => logger.warn('نبضة الـAPI فشلت', { code: err.code }));
    }, API_KEEPALIVE_MS).unref();

    // /بث: مزامنة دورية مع بيانات الموقع (تعوّض أي webhook متأخر/فاشل وتنظّف العالق)
    liveStreams.startPolling(() => api.getActiveStreams(), ctx.config.streamPollSeconds * 1000);

    // الانضمام عبر ديسكورد لألعاب الموقع: قائمة الرومات + متابعة الجلسات النشطة
    discordJoin.start(client, { officialGuildId: ctx.config.officialGuildId, pollMs: ctx.config.joinPollSeconds * 1000 });
    if (ctx.messageContentIntent === false) {
      logger.warn('⚠️ Message Content Intent غير مفعّل — "الانضمام عبر ديسكورد" ما يقدر يقرأ الكلمة المفتاحية. فعّله من Developer Portal → Bot');
    }

    // تكتات انقفلت بوضع "حذف" والبوت انطفى قبل ما تنحذف قناتها — نكمل الحذف
    Promise.resolve(ctx.dbReady)
      .then((ok) => ok !== false && tickets.sweepPendingDeletions(client))
      .catch((err) => logger.warn('تعذّر تنظيف قنوات التكتات المغلقة', { error: err }));

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
