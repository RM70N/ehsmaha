'use strict';

// سجل عمليات المالك: لكل مهمة معرّف، صاحب الطلب، السيرفر، الرسالة الأصلية، الوقت، الأدوات، النتيجة،
// الأخطاء، ومعرّفات ديسكورد الناتجة. يُحفظ بقاعدة البوت (owner_ai_tasks — منها نمنع التكرار بعد
// إعادة التشغيل) وبالسجل. ما نسجّل توكنات ولا أسرار، ونقصّ نص الطلب.

const crypto = require('node:crypto');
const store = require('../../database/botStore');
const logger = require('../../utils/logger');
const { redact } = require('./errorHandler');

const newTaskId = () => `t${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;

/** يسجّل المهمة؛ fresh=false لو نفس الرسالة اتسجلت قبل (تكرار) */
async function begin({ message, text }) {
  const taskId = newTaskId();
  try {
    const fresh = await store.ownerAiTasks.claim({
      taskId,
      messageId: message.id,
      guildId: message.guild.id,
      channelId: message.channel.id,
      ownerId: message.author.id,
      requestText: redact(text).slice(0, 500)
    });
    return { taskId, fresh, persisted: true };
  } catch (err) {
    // قاعدة البيانات تعطلت: نكمل بدون سجل دائم (منع التكرار بالذاكرة يبقى شغال)
    logger.warn('🛠️ Owner AI: تعذّر تسجيل المهمة بالقاعدة', { error: err });
    return { taskId, fresh: true, persisted: false };
  }
}

async function save(taskId, patch) {
  try {
    await store.ownerAiTasks.update(taskId, patch);
  } catch (err) {
    logger.warn('🛠️ Owner AI: تعذّر تحديث سجل المهمة', { taskId, error: err });
  }
}

function sanitizeResults(results) {
  return results.map((r) => ({
    id: r.id,
    tool: r.tool,
    status: r.status,
    outputs: r.outputs || undefined,
    error: r.error ? r.error.code : undefined,
    ms: r.ms
  }));
}

function log(event, fields = {}) {
  logger.info(`🛠️ Owner AI: ${event}`, fields);
}

module.exports = { begin, save, sanitizeResults, log, newTaskId };
