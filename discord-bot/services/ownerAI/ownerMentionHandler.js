'use strict';

// نقطة الدخول: منشن مباشر للبوت من حساب المالك ← فهم الطلب ← خطة ← (تأكيد للحساس) ← تنفيذ فعلي ← تقرير.
//   • يعمل تلقائياً بمجرد تشغيل البوت: بدون أمر Slash ولا بادئة — الشرط الوحيد: منشن مباشر من المالك
//   • أولوية على رد المساعد العادي (ما يرد مرتين): لو الطلب سؤال/كلام عادي نرجّع false ويكمل المسار القديم
//   • يشتغل حتى داخل قنوات التكتات (بدون كسر إدارة التذاكر)
//   • طابور تسلسلي لكل سيرفر + منع تكرار الرسالة نفسها (ذاكرة + قاعدة بيانات)

const { loadConfig } = require('../../config');
const logger = require('../../utils/logger');
const { splitMessage } = require('../../utils/splitMessage');
const guard = require('./ownerGuard');
const parser = require('./intentParser');
const planner = require('./taskPlanner');
const memory = require('./conversationMemory');
const queue = require('./executionQueue');
const audit = require('./auditLogger');
const confirmation = require('./confirmationManager');
const gemini = require('../gemini');
const { OwnerAIError, describe, buildReport, fromDiscord } = require('./errorHandler');

const toErr = (err) => (err instanceof OwnerAIError ? err : fromDiscord(err));
const typing = (channel) => (channel && typeof channel.sendTyping === 'function' ? channel.sendTyping().catch(() => null) : null);
const NO_MENTIONS = { parse: [], repliedUser: false };
// أوامر تعليم المساعد بالمنشن ("تعلم: سؤال = جواب" / "تعليمة: ...") تخص ذاكرة المساعد (services/aiMemory) — ما نعترضها:
// تكمل للمسار العادي بنفس صيغتها القديمة حتى لو المرسل هو المالك.
const TEACH_PASSTHROUGH = /^\s*(?:تعلم|تعلّم|علم|علّم|تعليمة|تعليمه|أمر|امر)\s*[:：]/;
// ❓ للأسئلة (غموض) و❌ لأي فشل — كل رسالة خطأ تبدأ بعلامة واضحة
const failText = (e) => `${e.code === 'AMBIGUOUS' ? '❓' : '❌'} ${describe(e)}`;

/** رد على المالك (Reply)، وإذا فشل (رسالته انحذفت) نرسل بالروم؛ الطويل يتقسم */
async function say(message, text) {
  const parts = splitMessage(String(text || '…'));
  for (let i = 0; i < parts.length; i++) {
    const payload = { content: parts[i], allowedMentions: NO_MENTIONS };
    try {
      if (i === 0) await message.reply(payload);
      else await message.channel.send(payload);
    } catch (err) {
      try {
        await message.channel.send(payload);
      } catch (err2) {
        logger.warn('🛠️ Owner AI: تعذّر إرسال الرد للمالك', { code: err2 && err2.code });
      }
    }
  }
}

/** ينفّذ خطوات جاهزة ويرجّع تقرير نصي حقيقي (كل سطر نتيجة فعلية) */
async function runPlan({ guild, client, actor, taskId, steps, replyRef, message }) {
  audit.log('بدء التنفيذ', { taskId, guildId: guild.id, ownerId: actor.userId, steps: steps.map((s) => s.tool) });
  await audit.save(taskId, { status: 'running' });
  let reaction = null;
  if (message && steps.length >= 3 && typeof message.react === 'function') reaction = await message.react('⏳').catch(() => null);
  let results;
  try {
    results = await planner.execute({
      steps, actor, guild, client, taskId, replyRef,
      onProgress: (r) => audit.save(taskId, { results_json: JSON.stringify(audit.sanitizeResults(r)) })
    });
  } finally {
    if (reaction && reaction.users && client && client.user) reaction.users.remove(client.user.id).catch(() => null);
  }
  memory.record(guild.id, results);
  const ok = results.filter((r) => r.status === 'ok').length;
  const status = ok === results.length ? 'done' : ok ? 'partial' : 'failed';
  const firstBad = results.find((r) => r.status !== 'ok');
  await audit.save(taskId, { status, results_json: JSON.stringify(audit.sanitizeResults(results)), error_code: firstBad && firstBad.error ? firstBad.error.code : null });
  audit.log('انتهت المهمة', { taskId, status, results: audit.sanitizeResults(results).map((r) => `${r.tool}:${r.status}${r.error ? `(${r.error})` : ''}`) });
  return buildReport(results);
}

// مالك سأل داخل تكت: نجاوب بنفس قاعدة معرفة المساعد (المسار العادي ما يشتغل بالتكتات)
async function answerInTicket(message, text, taskId) {
  const aiAssistant = require('../aiAssistant');
  const r = await gemini.generate({
    systemInstruction: await aiAssistant.systemPromptFor(message.guild.id),
    messages: [{ role: 'user', text }],
    meta: { context: 'owner_ai_chat', guildId: message.guild.id, channelId: message.channel.id, userId: message.author.id }
  });
  if (!r.ok) {
    await audit.save(taskId, { status: 'failed', error_code: 'GEMINI_FAILED' });
    await say(message, failText(new OwnerAIError('GEMINI_FAILED')));
    return;
  }
  await audit.save(taskId, { status: 'chat' });
  await say(message, aiAssistant.extractSuggestions(r.text).clean || aiAssistant.FRIENDLY_ERROR);
}

async function pipeline({ message, text, replyRef, taskId }) {
  const guild = message.guild;
  const actor = { userId: message.author.id, channelId: message.channel.id, messageId: message.id };
  typing(message.channel);

  let parsed;
  try {
    parsed = await parser.parse({ text, guild, replyRef, userId: actor.userId, channelId: actor.channelId });
  } catch (err) {
    const e = toErr(err);
    await audit.save(taskId, { status: 'failed', error_code: e.code });
    audit.log('فشل فهم الطلب', { taskId, code: e.code });
    await say(message, failText(e));
    return true;
  }

  if (parsed.mode === 'chat') {
    // سؤال أو كلام عادي: خارج التكتات يكمل المساعد العادي (نفس الرد، بنفس قاعدة المعرفة والأسلوب)
    const aiAssistant = require('../aiAssistant');
    if (await aiAssistant.activeTicketFor(message.channel).catch(() => null)) {
      await answerInTicket(message, text, taskId);
      return true;
    }
    await audit.save(taskId, { status: 'chat' });
    return false;
  }
  if (parsed.mode === 'clarify' || parsed.mode === 'unsupported') {
    if (parsed.mode === 'clarify') memory.setPending(guild.id, { originalText: text, question: parsed.reply || '', candidates: [] });
    await audit.save(taskId, { status: parsed.mode === 'clarify' ? 'clarify' : 'unsupported' });
    await say(message, parsed.reply || describe(new OwnerAIError('UNKNOWN_TOOL')));
    return true;
  }

  // act
  let pre;
  try {
    pre = await planner.preflight(parsed.steps, { guild, actor });
  } catch (err) {
    const e = toErr(err);
    if (e.code === 'AMBIGUOUS') memory.setPending(guild.id, { originalText: text, question: describe(e), candidates: (e.meta && e.meta.candidates) || [] });
    await audit.save(taskId, { status: 'failed', error_code: e.code, plan_json: planner.serializePlan(parsed.steps) });
    audit.log('فشل الفحص المبدئي — ما نفذ شي', { taskId, code: e.code });
    await say(message, failText(e));
    return true;
  }
  // الخطة المجمّدة: معرّفات الأهداف النهائية (هي اللي تُعرض للتأكيد وتنحفظ وتنفَّذ)
  const steps = pre.steps;
  const planJson = planner.serializePlan(steps);
  if (pre.reasons.length) {
    await confirmation.request({ message, taskId, planJson, lines: pre.lines, reasons: pre.reasons });
    return true;
  }
  await audit.save(taskId, { plan_json: planJson, plan_hash: confirmation.sha(planJson) });
  const report = await runPlan({ guild, client: message.client, actor, taskId, steps, replyRef, message });
  await say(message, report);
  return true;
}

/**
 * @returns {Promise<boolean>} true = تعاملنا مع الرسالة (ما يكمل المسار العادي) · false = مو لنا
 */
async function handleMessage(message) {
  try {
    if (!loadConfig().ownerAiEnabled) return false;
    if (!message || !message.guild || !guard.isOwnerMessage(message)) return false;
    const botUser = message.client && message.client.user;
    if (!guard.mentionsBot(message, botUser)) return false;
    const text = guard.stripMention(message.content, botUser.id);
    if (!text) return false; // منشن فاضي ← ترحيب المساعد العادي
    if (TEACH_PASSTHROUGH.test(text)) return false; // تعليم المساعد ← مسار الذاكرة العادي
    const replyRef = message.reference && message.reference.messageId ? `${message.reference.channelId || message.channel.id}/${message.reference.messageId}` : null;

    if (!queue.markSeen(message.id)) return true; // نفس الرسالة وصلت مرتين
    const task = await audit.begin({ message, text });
    if (!task.fresh) return true; // معالجة سابقة (حتى بعد إعادة تشغيل)
    audit.log('طلب جديد من المالك', { taskId: task.taskId, guildId: message.guild.id, channelId: message.channel.id, messageId: message.id, request: text.slice(0, 120) });

    try {
      return await queue.enqueue(message.guild.id, async () => {
        const consumed = await pipeline({ message, text, replyRef, taskId: task.taskId });
        return consumed;
      });
    } catch (err) {
      const e = toErr(err);
      logger.error('🛠️ Owner AI: خطأ بمعالجة طلب المالك', { taskId: task.taskId, code: e.code, error: err });
      await audit.save(task.taskId, { status: 'failed', error_code: e.code });
      await say(message, failText(e));
      return true;
    }
  } catch (err) {
    logger.error('🛠️ Owner AI: خطأ غير متوقع', { error: err });
    return false;
  }
}

/** تنفيذ خطة مؤكدة محفوظة (زر "تأكيد التنفيذ") */
async function executeStored({ task, planJson, interaction }) {
  const guild = interaction.guild;
  const actor = { userId: interaction.user.id, channelId: task.channel_id, messageId: task.message_id };
  return queue.enqueue(guild.id, async () => {
    let steps;
    try {
      steps = planner.parseStoredPlan(planJson);
      await planner.preflight(steps, { guild, actor });
    } catch (err) {
      const e = toErr(err);
      await audit.save(task.task_id, { status: 'failed', error_code: e.code });
      return `❌ ${describe(e)}`;
    }
    return runPlan({ guild, client: interaction.client, actor, taskId: task.task_id, steps, replyRef: null });
  });
}

confirmation.setRunner(executeStored);

module.exports = { handleMessage, executeStored, runPlan, say, _internal: { pipeline } };
