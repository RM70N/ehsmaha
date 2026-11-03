'use strict';

// نظام تنفيذ أوامر المالك باللغة الطبيعية (Owner AI Engine).
// منشن مباشر للبوت من حساب المالك ← Gemini يخطّط ← discord.js ينفّذ فعلياً ← تقرير مؤكد.
// التفاصيل بالـREADME (قسم "🛠️ تحكم المالك باللغة الطبيعية").

const store = require('../../database/botStore');
const logger = require('../../utils/logger');
const handler = require('./ownerMentionHandler');
const confirmation = require('./confirmationManager');

/**
 * عند الإقلاع: مهام كانت "قيد التنفيذ" وقت إعادة التشغيل نعلّمها "منقطعة" ونبلّغ المالك بالنتيجة الجزئية.
 * ما نعيد تنفيذها تلقائياً (يمكن تتكرر رسالة/روم) — المالك يعيد الجزء الناقص بنفسه.
 */
async function recoverInterrupted(client) {
  let rows = [];
  try {
    rows = await store.ownerAiTasks.running();
    store.ownerAiTasks.prune(30).catch(() => null);
  } catch (err) {
    logger.warn('🛠️ Owner AI: تعذّر فحص المهام المنقطعة', { error: err });
    return 0;
  }
  let n = 0;
  for (const t of rows) {
    if (!(await store.ownerAiTasks.transition(t.task_id, 'running', 'interrupted'))) continue;
    n += 1;
    let done = 0;
    let total = 0;
    try {
      done = JSON.parse(t.results_json || '[]').filter((r) => r.status === 'ok').length;
      total = JSON.parse(t.plan_json || '[]').length;
    } catch {
      /* سجل ناقص */
    }
    logger.warn('🛠️ Owner AI: مهمة منقطعة بسبب إعادة التشغيل', { taskId: t.task_id, done, total });
    const channel = await client.channels.fetch(t.channel_id).catch(() => null);
    if (channel && typeof channel.send === 'function') {
      await channel
        .send({
          content: `⚠️ انقطع تنفيذ طلب <@${t.owner_id}> بسبب إعادة تشغيل البوت — نُفّذت ${done}${total ? ` من ${total}` : ''} خطوة قبل الانقطاع. راجع النتيجة وأعد الطلب للجزء الناقص فقط (ما أكرر شي تلقائياً).`,
          allowedMentions: { parse: [] }
        })
        .catch(() => null);
    }
  }
  return n;
}

module.exports = {
  BUTTON_PREFIX: confirmation.PREFIX,
  handleMessage: handler.handleMessage,
  onButton: confirmation.onButton,
  recoverInterrupted
};
