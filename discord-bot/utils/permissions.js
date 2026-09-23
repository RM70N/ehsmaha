'use strict';

// كل ما يخص الصلاحيات: صلاحية الإدارة للأوامر الإدارية، وصلاحيات البوت نفسه
// بالقنوات والسيرفرات.

const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { loadConfig } = require('../config');
const logger = require('./logger');

// الصلاحيات اللي يحتاجها البوت ليرسل ردوده بشكل صحيح بأي قناة.
// (استخدام الـSlash Commands نفسه يعتمد على scope اسمه applications.commands
//  وقت دعوة البوت، مو صلاحية bit — نتحقق منه بشكل منفصل عند الإقلاع.)
const REQUIRED_CHANNEL_PERMS = [
  ['ViewChannel', PermissionFlagsBits.ViewChannel],
  ['SendMessages', PermissionFlagsBits.SendMessages],
  ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
  ['UseExternalEmojis', PermissionFlagsBits.UseExternalEmojis]
];

// المخوّل بالأوامر الإدارية: من قائمة ADMIN_IDS، أو عنده Administrator بالسيرفر.
function isBotAdmin(interaction) {
  const config = loadConfig();
  if (config.adminIds.includes(interaction.user.id)) return true;
  const perms = interaction.memberPermissions; // null بالرسائل الخاصة
  return !!(perms && perms.has(PermissionFlagsBits.Administrator));
}

// الصلاحيات الناقصة للبوت بقناة التفاعل الحالية (appPermissions يرسلها Discord مع كل تفاعل)
function missingChannelPerms(interaction) {
  const perms = interaction.appPermissions;
  if (!perms || !interaction.inGuild()) return []; // بالخاص ما فيه قيود قنوات
  return REQUIRED_CHANNEL_PERMS.filter(([, bit]) => !perms.has(bit)).map(([name]) => name);
}

// فحص عند الإقلاع لكل سيرفر: صلاحيات البوت العامة + وجود أوامر مسجّلة.
async function auditGuildPermissions(client) {
  const guilds = [...client.guilds.cache.values()];
  if (!guilds.length) {
    logger.warn('البوت مو موجود بأي سيرفر بعد — ادعُه برابط OAuth2 فيه scopes: bot + applications.commands');
    return;
  }

  for (const guild of guilds) {
    try {
      const me = guild.members.me || (await guild.members.fetchMe());
      const perms = me.permissions;
      const missing = REQUIRED_CHANNEL_PERMS.filter(([, bit]) => !perms.has(bit)).map(([name]) => name);
      if (missing.length) {
        logger.warn(`صلاحيات ناقصة للبوت بسيرفر "${guild.name}"`, { guildId: guild.id, missing });
      } else {
        logger.info(`صلاحيات البوت سليمة بسيرفر "${guild.name}"`, { guildId: guild.id });
      }
    } catch (err) {
      logger.warn('تعذّر فحص صلاحيات سيرفر', { guildId: guild.id, error: err });
    }
  }

  // لو ما فيه ولا أمر مسجّل (عالمياً ولا بسيرفر التطوير) غالباً نُسي deploy-commands
  try {
    const config = loadConfig();
    const globalCommands = await client.application.commands.fetch();
    let guildCount = 0;
    if (config.guildId) {
      const devGuild = client.guilds.cache.get(config.guildId);
      if (devGuild) guildCount = (await devGuild.commands.fetch()).size;
    }
    if (globalCommands.size === 0 && guildCount === 0) {
      logger.warn('ما فيه أي Slash Command مسجّل — شغّل: npm run deploy-commands');
    } else {
      logger.info('الأوامر المسجّلة', { global: globalCommands.size, guild: guildCount });
    }
  } catch (err) {
    logger.warn('تعذّر جلب قائمة الأوامر المسجّلة', { error: err });
  }
}

// رابط دعوة البوت بالصلاحيات المطلوبة (يُطبع بالسجل عند الإقلاع للمساعدة)
function inviteUrl(clientId) {
  const bits = new PermissionsBitField(REQUIRED_CHANNEL_PERMS.map(([, bit]) => bit)).bitfield;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${bits}`;
}

module.exports = { isBotAdmin, missingChannelPerms, auditGuildPermissions, inviteUrl, REQUIRED_CHANNEL_PERMS };
