'use strict';

// حارس الهوية — نظام تنفيذ أوامر المالك ما يشتغل إلا لحساب واحد فقط.
//   • الاعتماد على message.author.id فقط (مو الاسم ولا الرتب ولا ادعاء داخل النص)
//   • رتبة Administrator أو ملكية السيرفر ما تكفي
//   • الهوية تُفحص عند الاستقبال، وتنفحص مرة ثانية قبل كل خطوة تنفيذ (actionExecutor)
//   • ما فيه أي أداة تغيّر الحساب المصرّح (ولا Gemini يقدر يختار حساب بديل)

const { loadConfig } = require('../../config');
const { OwnerAIError } = require('./errorHandler');

const ownerId = () => loadConfig().ownerDiscordId;

function isOwnerId(id) {
  if (typeof id !== 'string' && typeof id !== 'number' && typeof id !== 'bigint') return false;
  return String(id) === ownerId();
}

/** رسالة حقيقية من المالك (مو بوت ولا Webhook) */
function isOwnerMessage(message) {
  return !!(message && message.author && !message.author.bot && !message.webhookId && isOwnerId(message.author.id));
}

/** منشن مباشر للبوت (مو @everyone ولا رتبة ولا رد بدون منشن) */
function mentionsBot(message, botUser) {
  if (!botUser || !message || !message.mentions || typeof message.mentions.has !== 'function') return false;
  return message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });
}

/** يرمي NOT_OWNER لو المنفّذ مو المالك — actor.userId لازم يجي من message.author / interaction.user فقط */
function assertOwner(actor) {
  if (!actor || !isOwnerId(actor.userId)) throw new OwnerAIError('NOT_OWNER');
}

const stripMention = (content, botId) => String(content || '').replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/[ \t]+/g, ' ').trim();

module.exports = { ownerId, isOwnerId, isOwnerMessage, mentionsBot, assertOwner, stripMention };
