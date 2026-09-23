'use strict';

// أحداث الاتصال (disconnect / reconnecting / resume). discord.js v14 يعيد
// الاتصال تلقائياً؛ هنا نسجّل كل مرحلة حتى تكون واضحة بسجلات Render.
// الملف يصدّر مصفوفة أحداث — محمّل الأحداث بـindex.js يدعم الشكلين.

const { Events } = require('discord.js');
const logger = require('../utils/logger');

// أكواد إغلاق ما تتعافى بإعادة المحاولة (توكن خاطئ، intents غير مسموحة...)
const FATAL_CLOSE_CODES = new Map([
  [4004, 'التوكن غير صحيح (DISCORD_TOKEN)'],
  [4010, 'Shard غير صالح'],
  [4011, 'البوت يحتاج Sharding'],
  [4013, 'Intents غير صالحة'],
  [4014, 'Intents غير مفعّلة من Developer Portal']
]);

module.exports = [
  {
    name: Events.ShardDisconnect,
    execute(ctx, closeEvent, shardId) {
      const fatal = FATAL_CLOSE_CODES.get(closeEvent && closeEvent.code);
      if (fatal) {
        logger.error(`🔌 انقطع الاتصال نهائياً: ${fatal}`, { shardId, code: closeEvent.code });
      } else {
        logger.warn('🔌 انقطع الاتصال بـDiscord — بيحاول يعيد الاتصال تلقائياً', { shardId, code: closeEvent && closeEvent.code });
      }
    }
  },
  {
    name: Events.ShardReconnecting,
    execute(ctx, shardId) {
      logger.warn('🔄 جاري إعادة الاتصال بـDiscord...', { shardId });
    }
  },
  {
    name: Events.ShardResume,
    execute(ctx, shardId, replayedEvents) {
      logger.info('✅ رجع الاتصال بـDiscord', { shardId, replayedEvents });
    }
  },
  {
    name: Events.ShardReady,
    execute(ctx, shardId) {
      logger.info('🟢 Shard جاهز', { shardId });
    }
  },
  {
    name: Events.ShardError,
    execute(ctx, error, shardId) {
      logger.error('خطأ بالاتصال (Shard)', { shardId, error });
    }
  },
  {
    name: Events.Invalidated,
    execute() {
      // الجلسة ألغيت من Discord (نادر جداً) — الأفضل نطلع ونخلي Render يعيد التشغيل
      logger.error('❌ جلسة البوت أُلغيت من Discord — إعادة تشغيل العملية');
      process.exit(1);
    }
  }
];
