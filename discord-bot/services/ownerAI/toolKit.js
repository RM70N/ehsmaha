'use strict';

// أدوات مساعدة مشتركة لأدوات Discord (services/ownerAI/tools/*): فحص صلاحيات البوت،
// جلب الرسائل، الألوان، الصلاحيات الحساسة، وإرسال رسائل آمن (بدون منشن جماعي بالغلط).

const { PermissionFlagsBits } = require('discord.js');
const crypto = require('node:crypto');
const { OwnerAIError } = require('./errorHandler');

// صلاحيات "إدارية" — أي رتبة تحملها تُعامل كحساسة (تأكيد قبل إسنادها/سحبها)
const ADMIN_LEVEL = ['Administrator', 'ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ManageWebhooks'];
// صلاحيات مسموح تمرّ عبر الأدوات (إنشاء رتبة/تعديل صلاحيات روم) — غيرها ممنوع
const SAFE_PERMS = [
  'ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AddReactions', 'EmbedLinks', 'AttachFiles', 'UseExternalEmojis',
  'Connect', 'Speak', 'CreatePublicThreads', 'SendMessagesInThreads', 'ChangeNickname'
];

const COLORS = {
  احمر: 0xef4444, red: 0xef4444, اخضر: 0x22c55e, green: 0x22c55e, ازرق: 0x3b82f6, blue: 0x3b82f6, ذهبي: 0xf5b301, gold: 0xf5b301, اصفر: 0xfacc15, yellow: 0xfacc15,
  بنفسجي: 0x7c3aed, purple: 0x7c3aed, وردي: 0xf472b6, pink: 0xf472b6, برتقالي: 0xf97316, orange: 0xf97316, اسود: 0x111111, black: 0x111111, ابيض: 0xffffff, white: 0xffffff, رمادي: 0x6b7280, gray: 0x6b7280
};

function parseColor(input) {
  if (input === undefined || input === null || input === '') return null;
  const t = String(input).trim().toLowerCase().replace(/[أإآ]/g, 'ا');
  if (COLORS[t] !== undefined) return COLORS[t];
  const m = t.match(/^#?([0-9a-f]{6})$/);
  if (m) return parseInt(m[1], 16);
  throw new OwnerAIError('INVALID_ARGS', { detail: `لون غير مفهوم "${t.slice(0, 20)}" — استخدم كود مثل #FF0000 أو اسم لون` });
}

/** وصف مختصر لكيان (للمعاينة والتقارير) */
function label(e) {
  if (e === undefined || e === null) return '—';
  if (Array.isArray(e)) return e.map(label).join('، ');
  if (typeof e === 'string') return /^\$/.test(e) ? '(من خطوة سابقة)' : e;
  if (e.user && e.id) return `<@${e.id}>`;
  if (e.messageId) return `رسالة في <#${e.channelId}>`;
  if (e.permissions !== undefined && e.type === undefined && e.name !== undefined) return `@${e.name}`;
  if (e.id && e.type !== undefined) return `<#${e.id}>`;
  return String(e.name || e.id || e);
}

const clip = (s, n) => {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function botMember(guild) {
  return guild.members && guild.members.me;
}

function hasAny(perms, names) {
  return names.some((n) => PermissionFlagsBits[n] !== undefined && perms.has(PermissionFlagsBits[n]));
}

/** يرمي NO_BOT_PERM لو صلاحيات البوت ناقصة على مستوى السيرفر */
function requireGuildPerms(guild, names) {
  const me = botMember(guild);
  const missing = names.filter((n) => !me || !me.permissions.has(PermissionFlagsBits[n]));
  if (missing.length) throw new OwnerAIError('NO_BOT_PERM', { perms: missing });
}

/** يرمي NO_BOT_PERM لو صلاحيات البوت ناقصة بروم معيّن (تشمل استثناءات الروم) */
function requireChannelPerms(channel, names) {
  const me = botMember(channel.guild);
  const perms = me && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
  const missing = names.filter((n) => !perms || !perms.has(PermissionFlagsBits[n]));
  if (missing.length) throw new OwnerAIError('NO_BOT_PERM', { perms: missing, channel: `<#${channel.id}>` });
}

/** صلاحية تثبيت: PinMessages (الجديدة) أو ManageMessages */
function requirePinPerm(channel) {
  const me = botMember(channel.guild);
  const perms = me && channel.permissionsFor(me);
  if (!perms || !hasAny(perms, ['PinMessages', 'ManageMessages'])) throw new OwnerAIError('NO_BOT_PERM', { perms: ['ManageMessages'], channel: `<#${channel.id}>` });
}

async function fetchChannel(guild, id) {
  const c = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (!c) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'channel', input: id });
  return c;
}

async function fetchMessage(ctx, ref) {
  const channel = await fetchChannel(ctx.guild, ref.channelId);
  const message = await channel.messages.fetch(ref.messageId).catch((err) => {
    if (err && (err.code === 10008 || err.status === 404)) throw new OwnerAIError('DISCORD_UNKNOWN_MESSAGE');
    throw err;
  });
  if (!message) throw new OwnerAIError('DISCORD_UNKNOWN_MESSAGE');
  return { channel, message };
}

function assertBotAuthored(ctx, message) {
  const botId = ctx.client && ctx.client.user ? ctx.client.user.id : botMember(ctx.guild).id;
  if (!message.author || message.author.id !== botId) throw new OwnerAIError('NOT_BOT_MESSAGE');
}

/** تحقق التسلسل الهرمي لعضو (البوت أعلى منه، مو نفسه/البوت/مالك السيرفر) */
function memberHierarchyProblem(guild, actorId, target, opts) {
  const { hierarchyProblem } = require('../../utils/moderation');
  const executor = { id: actorId, roles: { highest: { position: Number.MAX_SAFE_INTEGER } } };
  return hierarchyProblem(guild, executor, target, opts);
}

const isAdminLevelRole = (role) => !!role && ADMIN_LEVEL.some((n) => role.permissions && role.permissions.has(PermissionFlagsBits[n]));

function nonce(ctx, suffix = '') {
  return crypto.createHash('sha1').update(`${ctx.taskId}|${ctx.stepId}|${suffix}`).digest('hex').slice(0, 24);
}

function defineTool(def) {
  if (!def.name || typeof def.run !== 'function' || !def.schema) throw new Error(`أداة غير مكتملة: ${def.name}`);
  return { risk: 'low', idempotent: false, guildPerms: [], channelPerms: [], ...def };
}

module.exports = {
  ADMIN_LEVEL, SAFE_PERMS, parseColor, label, clip, botMember, hasAny, requireGuildPerms, requireChannelPerms, requirePinPerm,
  fetchChannel, fetchMessage, assertBotAuthored, memberHierarchyProblem, isAdminLevelRole, nonce, defineTool
};
