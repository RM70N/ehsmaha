'use strict';

// أدوات الأعضاء: بحث، معلومات، رتب، كتم مؤقت (Timeout) وإزالته.
// الكتم والإشراف يمرّون على نفس قيود البوت: التسلسل الهرمي، مو مالك السيرفر، مو بوت.

const { OwnerAIError } = require('../errorHandler');
const { withRetry } = require('../executionQueue');
const { searchMembers } = require('../entityResolver');
const { logModeration, toDurationMs, formatDurationAr } = require('../../../utils/moderation');
const store = require('../../../database/botStore');
const kit = require('../toolKit');

const { defineTool, label } = kit;
const MEMBER = { type: 'string', 'x-entity': 'member', description: 'اسم العضو أو يوزره أو منشنه أو معرّفه' };
const reason = (ctx) => `Owner AI ${ctx.taskId}`;
const ts = (ms) => `<t:${Math.floor(ms / 1000)}:D>`;

const findMember = defineTool({
  name: 'find_member',
  label: 'البحث عن عضو',
  description: 'يبحث عن أعضاء بالاسم أو اليوزر ويعرض المطابقين (حتى 5).',
  risk: 'read',
  schema: { type: 'object', required: ['query'], properties: { query: { type: 'string', minLength: 1, maxLength: 80 } } },
  describe: (a) => `بحث عن عضو "${a.query}"`,
  async run(ctx, a) {
    const found = await searchMembers(ctx.guild, a.query, 5);
    if (!found.length) throw new OwnerAIError('ENTITY_NOT_FOUND', { kind: 'member', input: a.query });
    return { outputs: { memberId: found[0].id }, done: `🔎 نتائج "${a.query}":\n${found.slice(0, 5).map((m) => `• <@${m.id}> — ${m.user.username} (${m.id})`).join('\n')}`, doneVerb: `بحثت عن "${a.query}"` };
  },
  failVerb: 'أبحث عن العضو'
});

const getMemberInfo = defineTool({
  name: 'get_member_info',
  label: 'معلومات عضو',
  description: 'يعرض معلومات عضو: تاريخ الانضمام والإنشاء، الرتب، الكتم، وعدد التحذيرات.',
  risk: 'read',
  schema: { type: 'object', required: ['member'], properties: { member: MEMBER } },
  describe: (a) => `معلومات ${label(a.member)}`,
  async run(ctx, a) {
    const m = a.member;
    const warnings = await store.warnings.count(ctx.guild.id, m.id).catch(() => '—');
    const roles = [...m.roles.cache.values()].filter((r) => r.id !== ctx.guild.id).sort((x, y) => y.position - x.position).map((r) => r.name);
    const lines = [
      `👤 **${m.user.username}** (${m.id})`,
      m.joinedTimestamp ? `انضم: ${ts(m.joinedTimestamp)}` : null,
      m.user.createdTimestamp ? `أنشأ حسابه: ${ts(m.user.createdTimestamp)}` : null,
      `الرتب: ${roles.length ? roles.slice(0, 15).join('، ') : 'بدون'}`,
      `التحذيرات: ${warnings}`,
      typeof m.isCommunicationDisabled === 'function' && m.isCommunicationDisabled() ? `🔇 مكتوم حتى ${ts(m.communicationDisabledUntilTimestamp || m.communicationDisabledUntil)}` : null
    ].filter(Boolean);
    return { outputs: { memberId: m.id }, done: lines.join('\n'), doneVerb: `عرضت معلومات ${label(m)}` };
  },
  failVerb: 'أعرض معلومات العضو'
});

const listMemberRoles = defineTool({
  name: 'list_member_roles',
  label: 'رتب عضو',
  description: 'يعرض رتب عضو معيّن.',
  risk: 'read',
  schema: { type: 'object', required: ['member'], properties: { member: MEMBER } },
  describe: (a) => `رتب ${label(a.member)}`,
  async run(ctx, a) {
    const roles = [...a.member.roles.cache.values()].filter((r) => r.id !== ctx.guild.id).sort((x, y) => y.position - x.position);
    return { outputs: { memberId: a.member.id }, done: `🎭 رتب ${label(a.member)}: ${roles.map((r) => r.name).join('، ') || 'بدون رتب'}`, doneVerb: `عرضت رتب ${label(a.member)}` };
  },
  failVerb: 'أعرض رتب العضو'
});

const timeoutMember = defineTool({
  name: 'timeout_member',
  label: 'كتم عضو مؤقتاً',
  description: 'يكتم عضو مؤقتاً (Timeout) بعدد دقائق (1 – 40320 = 28 يوم). لا تستخدمه إلا لو المالك طلب الكتم صراحة.',
  risk: 'medium',
  schema: { type: 'object', required: ['member', 'minutes'], properties: { member: MEMBER, minutes: { type: 'integer', minimum: 1, maximum: 40320 }, reason: { type: 'string', maxLength: 400 } } },
  guildPerms: ['ModerateMembers'],
  describe: (a) => `كتم ${label(a.member)} لمدة ${a.minutes} دقيقة`,
  async run(ctx, a) {
    const problem = kit.memberHierarchyProblem(ctx.guild, ctx.actor.userId, a.member);
    if (problem) throw new OwnerAIError('HIERARCHY', { detail: problem.split('\n')[0] });
    if (!a.member.moderatable) throw new OwnerAIError('HIERARCHY', { detail: 'ما أقدر أكتم هذا العضو (رتبته أعلى مني أو عنده صلاحية إدارية).' });
    const d = toDurationMs(a.minutes, 'minutes');
    if (d.error) throw new OwnerAIError('INVALID_ARGS', { detail: 'مدة الكتم غير صالحة' });
    await withRetry(() => a.member.timeout(d.ms, a.reason || reason(ctx)));
    await logModeration({ guildId: ctx.guild.id, action: 'mute', targetId: a.member.id, moderatorId: ctx.actor.userId, channelId: ctx.actor.channelId, reason: a.reason || 'أمر المالك (Owner AI)' });
    return { outputs: { memberId: a.member.id }, done: `تم كتم ${label(a.member)} لمدة ${formatDurationAr(d.ms)}.`, doneVerb: `كتمت ${label(a.member)} لمدة ${formatDurationAr(d.ms)}` };
  },
  verify: async (ctx, a, r) => {
    const m = await ctx.guild.members.fetch(r.outputs.memberId).catch(() => null);
    return !!m && (typeof m.isCommunicationDisabled !== 'function' || m.isCommunicationDisabled());
  },
  failVerb: 'أكتم العضو'
});

const removeTimeout = defineTool({
  name: 'remove_timeout',
  label: 'إزالة كتم عضو',
  description: 'يزيل الكتم المؤقت عن عضو.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['member'], properties: { member: MEMBER } },
  guildPerms: ['ModerateMembers'],
  describe: (a) => `إزالة كتم ${label(a.member)}`,
  async run(ctx, a) {
    if (!a.member.moderatable) throw new OwnerAIError('HIERARCHY', { detail: 'ما أقدر أعدّل كتم هذا العضو (رتبته أعلى مني).' });
    await withRetry(() => a.member.timeout(null, reason(ctx)));
    await logModeration({ guildId: ctx.guild.id, action: 'unmute', targetId: a.member.id, moderatorId: ctx.actor.userId, channelId: ctx.actor.channelId, reason: 'أمر المالك (Owner AI)' });
    return { outputs: { memberId: a.member.id }, done: `تم إزالة الكتم عن ${label(a.member)}.`, doneVerb: `أزلت الكتم عن ${label(a.member)}` };
  },
  failVerb: 'أزيل الكتم'
});

module.exports = [findMember, getMemberInfo, listMemberRoles, timeoutMember, removeTimeout];
