'use strict';

// تأكيد الإجراءات الحساسة (حذف قناة، طرد، @everyone، صلاحيات @everyone، رتب إدارية، حذف جماعي).
//   • الخطة تتجمّد: تنحفظ بقاعدة البيانات مع hash (SHA-256) — وبعد الضغط يُتحقق منه، فأي تعديل = رفض
//   • الأزرار (تأكيد/إلغاء) للمالك فقط — أي حساب ثاني يُرفض
//   • الطلب ينتهي بعد 15 دقيقة، ويتنفّذ مرة وحدة فقط (انتقال ذرّي awaiting_confirm → running)
//   • الأزرار stateless (customId فيه معرّف المهمة) فتشتغل حتى بعد إعادة تشغيل البوت

const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const store = require('../../database/botStore');
const customId = require('../../utils/customId');
const logger = require('../../utils/logger');
const guard = require('./ownerGuard');
const audit = require('./auditLogger');
const { describe, OwnerAIError } = require('./errorHandler');

const PREFIX = 'ownerai';
const TTL_MS = 15 * 60 * 1000;

let runner = null; // يُحقن من ownerMentionHandler (تنفيذ خطة محفوظة)
const setRunner = (fn) => {
  runner = fn;
};

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');

function payload({ taskId, lines, reasons }) {
  const content =
    '⚠️ **هذا الطلب يحتاج تأكيدك قبل التنفيذ:**\n' +
    lines.map((l) => `• ${l}`).join('\n') +
    `\n\n🔒 **السبب:** ${[...new Set(reasons)].join(' · ')}\n_ينتهي الطلب بعد 15 دقيقة._`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customId.build(PREFIX, 'ok', taskId)).setStyle(ButtonStyle.Danger).setLabel('تأكيد التنفيذ').setEmoji('✅'),
    new ButtonBuilder().setCustomId(customId.build(PREFIX, 'no', taskId)).setStyle(ButtonStyle.Secondary).setLabel('إلغاء').setEmoji('✖️')
  );
  return { content, components: [row], allowedMentions: { parse: [] } };
}

/** يحفظ الخطة المجمّدة ويرسل رسالة التأكيد (رد على رسالة المالك) */
async function request({ message, taskId, planJson, lines, reasons }) {
  await audit.save(taskId, { plan_json: planJson, plan_hash: sha(planJson), status: 'awaiting_confirm' });
  audit.log('بانتظار تأكيد المالك', { taskId, reasons: reasons.length });
  return message.reply({ ...payload({ taskId, lines, reasons }) });
}

const ephemeral = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);

async function onButton(interaction, args) {
  const [action, taskId] = args;
  // التفويض: المالك فقط (بالمعرّف) — حتى لو الزر انرسل لحساب ثاني بالغلط
  if (!guard.isOwnerId(interaction.user && interaction.user.id)) return ephemeral(interaction, 'هذا الزر للمالك فقط.');
  const task = taskId ? await store.ownerAiTasks.get(taskId).catch(() => null) : null;
  if (!task || task.owner_id !== interaction.user.id || task.guild_id !== interaction.guildId) {
    return ephemeral(interaction, 'هذا الطلب قديم أو غير موجود.');
  }
  if (action === 'no') {
    if (!(await store.ownerAiTasks.transition(taskId, 'awaiting_confirm', 'cancelled'))) return ephemeral(interaction, 'تم التعامل مع هذا الطلب من قبل.');
    audit.log('أُلغيت بواسطة المالك', { taskId });
    return interaction.update({ content: '✖️ تم إلغاء الطلب — ما نفذت شي.', components: [] }).catch(() => null);
  }
  if (action !== 'ok') return ephemeral(interaction, 'زر غير معروف.');
  if (task.status !== 'awaiting_confirm') return ephemeral(interaction, 'تم التعامل مع هذا الطلب من قبل.');
  if (Date.now() - task.updated_at > TTL_MS) {
    await store.ownerAiTasks.transition(taskId, 'awaiting_confirm', 'expired');
    return interaction.update({ content: `⌛ ${describe(new OwnerAIError('EXPIRED'))}`, components: [] }).catch(() => null);
  }
  if (!task.plan_json || sha(task.plan_json) !== task.plan_hash) {
    await store.ownerAiTasks.transition(taskId, 'awaiting_confirm', 'rejected');
    logger.warn('🛠️ Owner AI: hash الخطة ما يطابق — رُفض التنفيذ', { taskId });
    return interaction.update({ content: '🚫 الخطة المحفوظة تغيّرت بعد عرضها — رفضت التنفيذ لسلامتك. أعد إرسال الطلب.', components: [] }).catch(() => null);
  }
  if (!(await store.ownerAiTasks.transition(taskId, 'awaiting_confirm', 'running'))) return ephemeral(interaction, 'تم التعامل مع هذا الطلب من قبل.');
  await interaction.update({ content: '⏳ جاري التنفيذ…', components: [] }).catch(() => null);
  let report;
  try {
    report = await runner({ task, planJson: task.plan_json, interaction });
  } catch (err) {
    logger.error('🛠️ Owner AI: فشل تنفيذ خطة مؤكدة', { taskId, error: err });
    report = `❌ ${describe(err)}`;
  }
  return interaction.editReply({ content: report, allowedMentions: { parse: [] } }).catch(() => null);
}

module.exports = { PREFIX, TTL_MS, request, onButton, setRunner, payload, sha };
