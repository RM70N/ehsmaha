'use strict';

// نظام الترحيب: عند انضمام عضو ← بطاقة ترحيب (صورة) بقناة الترحيب، ثم رسالة
// منفصلة تمنشن العضو (نصها قابل للتخصيص بـ/تخصيص_رسالة_الترحيب).
//
//   • بدون قناة ترحيب مضبوطة: تجاهل بصمت (سطر debug بالسجل فقط).
//   • فشل توليد/إرسال الصورة: الرسالة النصية تنرسل رغم ذلك.
//   • كل خطوة بـtry/catch منفصل — ما يوقف أي خطأ هنا باقي البوت.
//   • توليد الصور محدود بـ2 بنفس اللحظة (لو دخل أعضاء كثير سوا ما يثقل البوت).

const { AttachmentBuilder } = require('discord.js');
const store = require('../database/botStore');
const logger = require('../utils/logger');
const { renderWelcomeCard } = require('../utils/welcomeCard');
const { missingBotPermissions } = require('../utils/permissions');

const DEFAULT_MESSAGE = 'نورت السيرفر يا {يوزر}! 🎉\nحيّاك الله بمجتمع **احسمها** 👑 — العب معنا على ehsmaha.com';
const MAX_MESSAGE_LENGTH = 1500;
const MAX_CONCURRENT_RENDERS = 2;

// ---------------- نص الرسالة ----------------
// {يوزر} ← منشن العضو · {السيرفر} ← اسم السيرفر · {العدد} ← عدد الأعضاء
function formatMessage(template, member) {
  const text = (template && template.trim()) || DEFAULT_MESSAGE;
  const guild = member.guild || {};
  return text
    .replace(/\{(يوزر|user)\}/gi, `<@${member.id}>`)
    .replace(/\{(السيرفر|server)\}/gi, guild.name || '')
    .replace(/\{(العدد|count)\}/gi, String(guild.memberCount || ''))
    .slice(0, 2000);
}

// ---------------- حد التوليد المتزامن ----------------
let active = 0;
const waiting = [];
async function withRenderSlot(fn) {
  if (active >= MAX_CONCURRENT_RENDERS) await new Promise((r) => waiting.push(r));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    const next = waiting.shift();
    if (next) next();
  }
}

async function fetchChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

function nameFor(member) {
  const u = member.user || {};
  return u.username || member.displayName || 'عضو جديد';
}

function avatarFor(member) {
  try {
    return member.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
  } catch (_) {
    return null;
  }
}

/**
 * يرحّب بالعضو. يرجّع ملخص (للاختبارات ولأمر /تجربة_الترحيب).
 * @returns {Promise<{ skipped?: string, image: boolean, text: boolean, errors: string[] }>}
 */
async function welcomeMember(member, { settings: given } = {}) {
  const result = { image: false, text: false, errors: [] };
  const guild = member.guild;
  let settings = given;
  try {
    settings = settings || (await store.guildSettings.get(guild.id));
  } catch (err) {
    logger.warn('تعذّر قراءة إعدادات الترحيب', { guildId: guild.id, code: err.code });
    return { ...result, skipped: 'DB_UNAVAILABLE' };
  }
  if (!settings.welcome_channel_id) {
    logger.debug('ما فيه قناة ترحيب مضبوطة — تجاهل', { guildId: guild.id });
    return { ...result, skipped: 'NO_CHANNEL' };
  }

  const imageChannel = await fetchChannel(guild, settings.welcome_channel_id);
  const textChannel = settings.welcome_message_channel_id
    ? await fetchChannel(guild, settings.welcome_message_channel_id)
    : imageChannel;
  if (!imageChannel && !textChannel) {
    logger.warn('قناة الترحيب محذوفة أو ما يوصلها البوت', { guildId: guild.id, channelId: settings.welcome_channel_id });
    return { ...result, skipped: 'CHANNEL_MISSING' };
  }

  // 1) بطاقة الترحيب (صورة فقط بدون نص)
  if (imageChannel) {
    const missing = missingBotPermissions(guild, ['ViewChannel', 'SendMessages', 'AttachFiles'], imageChannel);
    if (missing.length) {
      result.errors.push(`MISSING_PERMS:${missing.join(',')}`);
      logger.warn('البوت ناقصه صلاحيات بقناة الترحيب — الصورة ما تنرسل', { guildId: guild.id, missing });
    } else {
      try {
        const card = await withRenderSlot(() => renderWelcomeCard({ username: nameFor(member), avatarUrl: avatarFor(member) }));
        await imageChannel.send({ files: [new AttachmentBuilder(card.buffer, { name: 'ehsmaha-welcome.png' })] });
        result.image = true;
      } catch (err) {
        result.errors.push('IMAGE_FAILED');
        logger.error('تعذّر توليد/إرسال صورة الترحيب — بنرسل الرسالة النصية فقط', { guildId: guild.id, userId: member.id, error: err });
      }
    }
  }

  // 2) الرسالة الخارجية بالمنشن (تنرسل حتى لو الصورة فشلت)
  if (textChannel) {
    try {
      await textChannel.send({
        content: formatMessage(settings.welcome_message, member),
        allowedMentions: { users: [member.id] }
      });
      result.text = true;
    } catch (err) {
      result.errors.push('TEXT_FAILED');
      logger.error('تعذّر إرسال رسالة الترحيب', { guildId: guild.id, userId: member.id, code: err.code });
    }
  }
  logger.info('ترحيب بعضو جديد', { guildId: guild.id, userId: member.id, image: result.image, text: result.text });
  return result;
}

module.exports = { welcomeMember, formatMessage, DEFAULT_MESSAGE, MAX_MESSAGE_LENGTH };
