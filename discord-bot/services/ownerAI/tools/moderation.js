'use strict';

// أدوات الإشراف: الطرد (دائماً بتأكيد)، وعرض التحذيرات وسجل الإشراف من نظام البوت الأصلي
// (store.warnings / store.moderationLog) — بدون إعادة كتابة منطق التحذيرات.

const { OwnerAIError } = require('../errorHandler');
const { logModeration, tryDm, dmEmbed } = require('../../../utils/moderation');
const { ensureWarningRoles } = require('../../../utils/warningRoles');
const store = require('../../../database/botStore');
const logger = require('../../../utils/logger');
const kit = require('../toolKit');

const { defineTool, label, clip } = kit;
const MEMBER = { type: 'string', 'x-entity': 'member', description: 'اسم العضو أو يوزره أو منشنه أو معرّفه' };
const ts = (ms) => `<t:${Math.floor(ms / 1000)}:R>`;

const kickMember = defineTool({
  name: 'kick_member',
  label: 'طرد عضو',
  description: 'يطرد عضو من السيرفر. دائماً يحتاج تأكيد المالك. لا تستخدمه إلا لو طلب الطرد صراحة.',
  risk: 'high',
  schema: { type: 'object', required: ['member'], properties: { member: MEMBER, reason: { type: 'string', maxLength: 400 } } },
  guildPerms: ['KickMembers'],
  confirm: () => 'طرد عضو من السيرفر',
  describe: (a) => `طرد ${label(a.member)}${a.reason ? ` (السبب: ${clip(a.reason, 80)})` : ''}`,
  async run(ctx, a) {
    const problem = kit.memberHierarchyProblem(ctx.guild, ctx.actor.userId, a.member);
    if (problem) throw new OwnerAIError('HIERARCHY', { detail: problem.split('\n')[0] });
    if (!a.member.kickable) throw new OwnerAIError('HIERARCHY', { detail: 'ما أقدر أطرد هذا العضو (رتبته أعلى مني).' });
    const why = a.reason || 'بدون سبب محدد';
    await tryDm(a.member.user, { embeds: [dmEmbed({ title: '🚪 تم طردك من السيرفر', guild: ctx.guild, lines: [`**السبب:** ${why}`] })] });
    const id = a.member.id;
    await a.member.kick(`Owner AI ${ctx.taskId}: ${why}`);
    await logModeration({ guildId: ctx.guild.id, action: 'kick', targetId: id, moderatorId: ctx.actor.userId, channelId: ctx.actor.channelId, reason: why });
    return { outputs: { kickedMemberId: id }, done: `تم طرد <@${id}>.`, doneVerb: `طردت <@${id}>` };
  },
  failVerb: 'أطرد العضو'
});

// تحذير عبر نظام التحذيرات الأصلي: نفس خطوات /تحذير (تسجيل ← تبديل رتبة التحذير ← إشعار خاص ← سجل إشراف)
const warnMember = defineTool({
  name: 'warn_member',
  label: 'تحذير عضو',
  description: 'يحذّر عضو عبر نظام التحذيرات الأصلي (يسجّل التحذير ويبدّل رتبة التحذير ويرسل إشعار خاص). level اختياري 1-3 (الافتراضي: التحذير التالي حسب عدد تحذيراته). لا تستخدمه إلا لو المالك طلب التحذير صراحة.',
  risk: 'medium',
  schema: { type: 'object', required: ['member', 'reason'], properties: { member: MEMBER, reason: { type: 'string', minLength: 2, maxLength: 400 }, level: { type: 'integer', minimum: 1, maximum: 3 } } },
  guildPerms: ['ManageRoles'],
  describe: (a) => `تحذير ${label(a.member)} (السبب: ${clip(a.reason, 80)})`,
  async run(ctx, a) {
    const problem = kit.memberHierarchyProblem(ctx.guild, ctx.actor.userId, a.member, { requireBotAbove: false });
    if (problem) throw new OwnerAIError('HIERARCHY', { detail: problem.split('\n')[0] });
    const ensured = await ensureWarningRoles(ctx.guild);
    if (ensured.error) throw new OwnerAIError('HIERARCHY', { detail: ensured.error.replace(/\*\*/g, '') });
    const before = await store.warnings.count(ctx.guild.id, a.member.id);
    const level = a.level ? a.level - 1 : Math.min(before, 2);
    const chosen = ensured.roles[level];
    await store.warnings.add({ guildId: ctx.guild.id, discordId: a.member.id, reason: a.reason, role: chosen.name, issuedBy: ctx.actor.userId });
    let roleError = null;
    try {
      const { switchWarningRole } = require('../../../commands/moderation/warn')._internal;
      await switchWarningRole(a.member, ensured.roles, chosen, `تحذير (أمر المالك): ${a.reason}`);
    } catch (err) {
      roleError = err;
      logger.error('Owner AI: تعذّر تبديل رتب التحذير', { guildId: ctx.guild.id, targetId: a.member.id, code: err.code, error: err });
    }
    const total = await store.warnings.count(ctx.guild.id, a.member.id);
    await tryDm(a.member.user, { embeds: [dmEmbed({ title: '⚠️ وصلك تحذير', guild: ctx.guild, lines: [`**السيرفر:** ${ctx.guild.name}`, `**الرتبة:** ${chosen.name}`, `**السبب:** ${a.reason}`, `**عدد تحذيراتك:** ${total}`] })] });
    await logModeration({ guildId: ctx.guild.id, action: 'warn', targetId: a.member.id, moderatorId: ctx.actor.userId, channelId: ctx.actor.channelId, reason: a.reason, details: { role: chosen.name, total, via: 'owner_ai' } });
    if (roleError) throw new OwnerAIError('PARTIAL_WARN', { detail: `التحذير انسجل (عدد تحذيراته ${total}) لكن تعذّر تعديل رتب العضو — تحقق من ترتيب رتبة البوت.` });
    return { outputs: { memberId: a.member.id }, done: `تم تحذير ${label(a.member)} — الرتبة "${chosen.name}" (عدد تحذيراته ${total}).`, doneVerb: `حذّرت ${label(a.member)} (رتبة "${chosen.name}"، عدد تحذيراته ${total})` };
  },
  failVerb: 'أحذّر العضو'
});

const listMemberWarnings = defineTool({
  name: 'list_member_warnings',
  label: 'تحذيرات عضو',
  description: 'يعرض تحذيرات عضو من نظام التحذيرات.',
  risk: 'read',
  schema: { type: 'object', required: ['member'], properties: { member: MEMBER } },
  describe: (a) => `تحذيرات ${label(a.member)}`,
  async run(ctx, a) {
    const list = await store.warnings.list(ctx.guild.id, a.member.id);
    const lines = list.slice(-10).map((w) => `${w.seq}. ${clip(w.reason, 80)} — ${ts(w.issued_at)}`);
    return { outputs: { memberId: a.member.id }, done: `⚠️ تحذيرات ${label(a.member)} (${list.length}):\n${lines.join('\n') || 'ما عنده تحذيرات.'}`, doneVerb: `عرضت تحذيرات ${label(a.member)}` };
  },
  failVerb: 'أعرض التحذيرات'
});

const recentWarnings = defineTool({
  name: 'recent_warnings',
  label: 'آخر التحذيرات',
  description: 'يعرض آخر التحذيرات الصادرة بالسيرفر.',
  risk: 'read',
  schema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 15 } } },
  describe: () => 'آخر التحذيرات',
  async run(ctx, a) {
    const rows = (await store.moderationLog.recent(ctx.guild.id, 100)).filter((r) => r.action === 'warn').slice(0, a.limit || 5);
    const lines = rows.map((r) => `• <@${r.target_id}> — ${clip(r.reason || 'بدون سبب', 70)} — ${ts(r.created_at)}`);
    return { outputs: { count: rows.length }, done: `⚠️ آخر التحذيرات:\n${lines.join('\n') || 'ما فيه تحذيرات مسجّلة.'}`, doneVerb: 'عرضت آخر التحذيرات' };
  },
  failVerb: 'أعرض التحذيرات'
});

const recentModerationLog = defineTool({
  name: 'recent_moderation_log',
  label: 'سجل الإشراف',
  description: 'يعرض آخر إجراءات الإشراف (كتم، طرد، تحذير، حماية تلقائية).',
  risk: 'read',
  schema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 15 } } },
  describe: () => 'سجل الإشراف',
  async run(ctx, a) {
    const rows = await store.moderationLog.recent(ctx.guild.id, a.limit || 8);
    const lines = rows.map((r) => `• ${r.action}${r.target_id ? ` ← <@${r.target_id}>` : ''} — ${ts(r.created_at)}`);
    return { outputs: { count: rows.length }, done: `🛡️ آخر إجراءات الإشراف:\n${lines.join('\n') || 'السجل فاضي.'}`, doneVerb: 'عرضت سجل الإشراف' };
  },
  failVerb: 'أعرض سجل الإشراف'
});

module.exports = [kickMember, warnMember, listMemberWarnings, recentWarnings, recentModerationLog];
