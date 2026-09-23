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

// صلاحيات الأوامر الإدارية (كل أمر يتحقق من اللي يخصه قبل التنفيذ)
const MODERATION_PERMS = [
  ['ReadMessageHistory', PermissionFlagsBits.ReadMessageHistory],
  ['ManageMessages', PermissionFlagsBits.ManageMessages],
  ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ['ManageRoles', PermissionFlagsBits.ManageRoles],
  ['ModerateMembers', PermissionFlagsBits.ModerateMembers],
  ['KickMembers', PermissionFlagsBits.KickMembers]
];

// أسماء عربية واضحة لكل صلاحية (مع اسمها الإنجليزي كما يظهر بإعدادات ديسكورد)
const PERM_NAMES_AR = {
  ViewChannel: 'عرض القنوات (View Channels)',
  SendMessages: 'إرسال الرسائل (Send Messages)',
  EmbedLinks: 'تضمين الروابط (Embed Links)',
  UseExternalEmojis: 'استخدام إيموجي خارجي (Use External Emojis)',
  ReadMessageHistory: 'قراءة سجل الرسائل (Read Message History)',
  ManageMessages: 'إدارة الرسائل (Manage Messages)',
  ManageChannels: 'إدارة القنوات (Manage Channels)',
  ManageRoles: 'إدارة الرتب (Manage Roles)',
  ModerateMembers: 'كتم الأعضاء مؤقتاً (Timeout Members)',
  KickMembers: 'طرد الأعضاء (Kick Members)'
};

/**
 * الصلاحيات الناقصة للبوت نفسه — على مستوى السيرفر، أو قناة محددة (تشمل
 * استثناءات القناة Overwrites). يرجّع أسماءها (مفاتيح PermissionFlagsBits).
 */
function missingBotPermissions(guild, names, channel = null) {
  const me = guild && guild.members && guild.members.me;
  if (!me) return [...names];
  const perms = channel && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : me.permissions;
  if (!perms) return [...names];
  return names.filter((n) => !perms.has(PermissionFlagsBits[n]));
}

// رسالة موحّدة تحدد بالضبط الصلاحيات الناقصة للبوت
function botPermissionsPayload(missing, where = null) {
  const eb = require('./embedBuilder');
  const list = missing.map((n) => `• **${PERM_NAMES_AR[n] || n}**`).join('\n');
  return {
    embeds: [
      eb.error(
        `البوت ما يملك الصلاحيات اللازمة لتنفيذ هذا الأمر${where ? ` في ${where}` : ''}:\n${list}\n\n` +
          'أعطِ رتبة البوت هذه الصلاحيات من إعدادات السيرفر (أو القناة) ثم جرّب مرة ثانية.',
        '🔧 صلاحيات البوت ناقصة'
      )
    ],
    components: []
  };
}

// مشرفو البوت العامّون (إحصائيات البوت): ADMIN_IDS بالـ.env، أو Administrator
// بالسيرفر. (صلاحيات أوامر الإشراف داخل السيرفر: utils/adminPermissions.js)
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
      const missingModeration = MODERATION_PERMS.filter(([, bit]) => !perms.has(bit)).map(([name]) => name);
      if (missing.length) {
        logger.warn(`صلاحيات أساسية ناقصة للبوت بسيرفر "${guild.name}"`, { guildId: guild.id, missing });
      }
      if (missingModeration.length) {
        logger.warn(`صلاحيات الأوامر الإدارية ناقصة بسيرفر "${guild.name}" — الأوامر المعنية بترد برسالة توضح الناقص`, {
          guildId: guild.id,
          missing: missingModeration
        });
      }
      if (!missing.length && !missingModeration.length) {
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
  const bits = new PermissionsBitField([...REQUIRED_CHANNEL_PERMS, ...MODERATION_PERMS].map(([, bit]) => bit)).bitfield;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=${bits}`;
}

module.exports = {
  isBotAdmin,
  missingChannelPerms,
  auditGuildPermissions,
  inviteUrl,
  missingBotPermissions,
  botPermissionsPayload,
  REQUIRED_CHANNEL_PERMS,
  MODERATION_PERMS,
  PERM_NAMES_AR
};
