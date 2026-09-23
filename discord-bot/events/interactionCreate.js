'use strict';

// الموزّع المركزي لكل التفاعلات (أوامر Slash + أزرار + قوائم منسدلة + اقتراحات Autocomplete).
// الأزرار والقوائم تُوجَّه حسب بادئة customId الثابتة (prefix:args) لمعالج مسجّل
// بملف الأمر — بدون Collectors مؤقتة، فتشتغل حتى بعد إعادة تشغيل البوت.
// كل تفاعل محاط بـtry/catch كامل — أي خطأ غير متوقع بأي أمر يتحول لرسالة
// ودّية للمستخدم ويُسجَّل بالـlogger، وما يوصل أبداً لمستوى يوقف البوت.

const { Events, MessageFlags } = require('discord.js');
const logger = require('../utils/logger');
const eb = require('../utils/embedBuilder');
const respond = require('../utils/respond');
const rateLimiter = require('../utils/rateLimiter');
const usageStats = require('../utils/usageStats');
const customId = require('../utils/customId');
const { missingChannelPerms } = require('../utils/permissions');
const { GENERIC } = require('../utils/errors');

// نسجّل تحذير الصلاحيات مرة وحدة لكل قناة بدل كل تفاعل
const warnedChannels = new Set();

function cooldownPayload(ms) {
  const secs = Math.max(1, Math.ceil(ms / 1000));
  return { embeds: [eb.warning(`على هونك 😅 جرّب مرة ثانية بعد **${secs}** ثانية.`, '⏳ لحظة')] };
}

async function replyWithGenericError(interaction, err) {
  let message = GENERIC;
  if (err && err.code === 'DB_UNAVAILABLE') {
    message = 'البوت يجهّز بياناته الحين (يسترجعها بعد التحديث أو إعادة التشغيل) — جرّب مرة ثانية بعد دقيقة 🙏';
    const backup = require('../services/stateBackup').status();
    const reason = backup.lastError || (err.cause && (err.cause.code || err.cause.message));
    if (reason) message += `\n\n🔎 السبب التقني: \`${String(reason).slice(0, 80)}\``;
  }
  try {
    await respond.send(interaction, { embeds: [eb.error(message)], components: [] }, { ephemeral: true });
  } catch (err) {
    logger.debug('تعذّر إرسال رسالة الخطأ للمستخدم', { error: err });
  }
}

function logPermissionGaps(interaction) {
  const missing = missingChannelPerms(interaction);
  if (!missing.length || warnedChannels.has(interaction.channelId)) return;
  warnedChannels.add(interaction.channelId);
  logger.warn('البوت ناقصه صلاحيات بقناة استُخدم فيها', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    missing
  });
}

async function handleCommand(interaction, ctx) {
  const command = ctx.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('أمر غير معروف (غالباً مسجّل قديماً ولم يُحدَّث)', { command: interaction.commandName });
    return respond.send(
      interaction,
      { embeds: [eb.warning('هذا الأمر لم يعد متاحاً — جرّب `/مساعدة` لقائمة الأوامر الحالية.')] },
      { ephemeral: true }
    );
  }

  const cooldownMs = (command.options && command.options.cooldownMs) ?? ctx.config.commandCooldownMs;
  const limit = rateLimiter.consume('cmd', interaction.user.id, cooldownMs);
  if (!limit.allowed) {
    return respond.send(interaction, cooldownPayload(limit.retryAfterMs), { ephemeral: true });
  }

  usageStats.command(interaction.commandName);
  logPermissionGaps(interaction);
  logger.info('command', {
    command: interaction.commandName,
    userId: interaction.user.id,
    guildId: interaction.guildId || 'DM'
  });

  await command.execute(interaction, ctx);
}

// اقتراحات أثناء الكتابة: بدون rate limit (Discord يرسلها مع كل حرف) وبدون
// أي رسالة خطأ — أسوأ حالة قائمة فاضية والمستخدم يكمل الكتابة يدوياً.
async function handleAutocomplete(interaction, ctx) {
  const command = ctx.commands.get(interaction.commandName);
  if (!command || typeof command.autocomplete !== 'function') {
    return interaction.respond([]).catch(() => null);
  }
  await command.autocomplete(interaction, ctx);
}

async function handleButton(interaction, ctx) {
  const { prefix, args } = customId.parse(interaction.customId);
  const handler = ctx.buttons.get(prefix);
  if (!handler) {
    logger.debug('زر بدون معالج', { customId: interaction.customId });
    return respond.send(interaction, { embeds: [eb.warning('هذا الزر قديم ولم يعد يعمل — استخدم الأمر من جديد.')] }, { ephemeral: true });
  }

  const limit = rateLimiter.consume('btn', interaction.user.id, ctx.config.buttonCooldownMs);
  if (!limit.allowed) {
    return respond.send(interaction, cooldownPayload(limit.retryAfterMs), { ephemeral: true });
  }

  usageStats.button();
  await handler(interaction, args, ctx);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(ctx, interaction) {
    try {
      if (interaction.isChatInputCommand()) return await handleCommand(interaction, ctx);
      if (interaction.isAutocomplete()) return await handleAutocomplete(interaction, ctx);
      if (interaction.isButton() || interaction.isStringSelectMenu()) return await handleButton(interaction, ctx);
      // أنواع أخرى (قوائم/نماذج) غير مستخدمة حالياً — نتجاهلها بأمان
      if (interaction.isRepliable()) {
        return await interaction.reply({ content: 'هذا النوع من التفاعل غير مدعوم.', flags: MessageFlags.Ephemeral });
      }
    } catch (err) {
      usageStats.error();
      logger.error('خطأ غير متوقع أثناء معالجة تفاعل', {
        type: interaction.type,
        command: interaction.commandName,
        customId: interaction.customId,
        userId: interaction.user && interaction.user.id,
        error: err
      });
      if (interaction.isAutocomplete()) {
        await interaction.respond([]).catch(() => null);
      } else if (interaction.isRepliable()) {
        await replyWithGenericError(interaction, err);
      }
    }
  }
};
