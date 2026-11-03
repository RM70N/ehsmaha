'use strict';

// أدوات الرتب: إنشاء، تغيير الاسم/اللون/الترتيب، عرض، إسناد/إزالة لعضو.
// حماية: ما نسند/نعدّل رتبة أعلى من رتبة البوت أو رتبة تكامل (managed)، وما نمنح صلاحيات
// حساسة عبر الأدوات (Administrator وأخواتها)، وإسناد/سحب رتبة إدارية يحتاج تأكيد.

const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const { OwnerAIError } = require('../errorHandler');
const { withRetry } = require('../executionQueue');
const kit = require('../toolKit');

const { defineTool, label, isAdminLevelRole } = kit;
const reason = (ctx) => `Owner AI ${ctx.taskId}`;
const ROLE = { type: 'string', 'x-entity': 'role', description: 'اسم الرتبة أو منشنها أو معرّفها أو $sN.roleId' };
const MEMBER = { type: 'string', 'x-entity': 'member', description: 'اسم العضو أو يوزره أو منشنه أو معرّفه' };

function assertEditable(guild, role) {
  if (role.id === guild.id) throw new OwnerAIError('HIERARCHY', { detail: 'رتبة @everyone ما تتعدّل من هنا.' });
  if (role.managed) throw new OwnerAIError('HIERARCHY', { detail: `الرتبة "${role.name}" تابعة لبوت/تكامل وما تتعدّل يدوياً.` });
  if (!role.editable) throw new OwnerAIError('HIERARCHY', { detail: `رتبة "${role.name}" أعلى من رتبتي أو مساوية لها — ارفع رتبة البوت فوقها من إعدادات السيرفر.` });
}

const adminRoleConfirm = (a) => (a.role && typeof a.role === 'object' && isAdminLevelRole(a.role) ? `الرتبة "${a.role.name}" تحمل صلاحيات إدارية` : null);

const createRole = defineTool({
  name: 'create_role',
  label: 'إنشاء رتبة',
  description: 'ينشئ رتبة جديدة بدون صلاحيات إدارية (اسم، لون اختياري، عرض منفصل، قابلة للمنشن، وصلاحيات آمنة فقط).',
  risk: 'low',
  schema: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      color: { type: 'string', maxLength: 20 },
      hoist: { type: 'boolean' },
      mentionable: { type: 'boolean' },
      permissions: { type: 'array', items: { type: 'string' }, maxItems: 15 }
    }
  },
  guildPerms: ['ManageRoles'],
  validate(a) {
    const bad = (a.permissions || []).filter((p) => kit.ADMIN_LEVEL.includes(p) || ['MentionEveryone', 'ModerateMembers', 'ManageMessages', 'ManageNicknames', 'ManageEmojisAndStickers', 'ViewAuditLog'].includes(p));
    if (bad.length) throw new OwnerAIError('FORBIDDEN_PERMISSION', { names: bad });
    const unknown = (a.permissions || []).filter((p) => !kit.SAFE_PERMS.includes(p));
    if (unknown.length) throw new OwnerAIError('INVALID_ARGS', { detail: `صلاحية غير مدعومة: ${unknown.join('، ').slice(0, 80)}` });
    kit.parseColor(a.color);
  },
  describe: (a) => `إنشاء رتبة "${a.name}"`,
  async run(ctx, a) {
    const opts = { name: a.name, reason: reason(ctx), hoist: !!a.hoist, mentionable: !!a.mentionable };
    const color = kit.parseColor(a.color);
    if (color !== null) opts.color = color;
    opts.permissions = new PermissionsBitField((a.permissions || []).map((p) => PermissionFlagsBits[p]));
    const role = await ctx.guild.roles.create(opts);
    return { outputs: { roleId: role.id }, done: `تم إنشاء الرتبة "${role.name}".`, doneVerb: `أنشأت الرتبة "${role.name}"` };
  },
  verify: async (ctx, a, r) => !!(ctx.guild.roles.cache.get(r.outputs.roleId) || (await ctx.guild.roles.fetch(r.outputs.roleId).catch(() => null))),
  failVerb: 'أنشئ الرتبة'
});

const renameRole = defineTool({
  name: 'rename_role',
  label: 'تغيير اسم رتبة',
  description: 'يغيّر اسم رتبة.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['role', 'name'], properties: { role: ROLE, name: { type: 'string', minLength: 1, maxLength: 100 } } },
  guildPerms: ['ManageRoles'],
  describe: (a) => `تغيير اسم ${label(a.role)} إلى "${a.name}"`,
  async run(ctx, a) {
    assertEditable(ctx.guild, a.role);
    await withRetry(() => a.role.setName(a.name, reason(ctx)));
    return { outputs: { roleId: a.role.id }, done: `تم تغيير اسم الرتبة إلى "${a.name}".`, doneVerb: `غيّرت اسم الرتبة إلى "${a.name}"` };
  },
  failVerb: 'أغيّر اسم الرتبة'
});

const setRoleColor = defineTool({
  name: 'set_role_color',
  label: 'تغيير لون رتبة',
  description: 'يغيّر لون رتبة (كود مثل #FF0000 أو اسم لون).',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['role', 'color'], properties: { role: ROLE, color: { type: 'string', minLength: 1, maxLength: 20 } } },
  guildPerms: ['ManageRoles'],
  validate: (a) => kit.parseColor(a.color),
  describe: (a) => `تغيير لون ${label(a.role)} إلى ${a.color}`,
  async run(ctx, a) {
    assertEditable(ctx.guild, a.role);
    await withRetry(() => a.role.setColor(kit.parseColor(a.color), reason(ctx)));
    return { outputs: { roleId: a.role.id }, done: `تم تغيير لون الرتبة "${a.role.name}".`, doneVerb: `غيّرت لون الرتبة "${a.role.name}"` };
  },
  failVerb: 'أغيّر لون الرتبة'
});

const setRolePosition = defineTool({
  name: 'set_role_position',
  label: 'تغيير ترتيب رتبة',
  description: 'يغيّر ترتيب رتبة (الأعلى رقماً = الأعلى بالقائمة). ما ينفع فوق رتبة البوت.',
  risk: 'medium',
  idempotent: true,
  schema: { type: 'object', required: ['role', 'position'], properties: { role: ROLE, position: { type: 'integer', minimum: 1, maximum: 250 } } },
  guildPerms: ['ManageRoles'],
  describe: (a) => `تغيير ترتيب ${label(a.role)} إلى ${a.position}`,
  async run(ctx, a) {
    assertEditable(ctx.guild, a.role);
    const botTop = kit.botMember(ctx.guild).roles.highest.position;
    if (a.position >= botTop) throw new OwnerAIError('HIERARCHY', { detail: `الترتيب المطلوب (${a.position}) مو أقل من رتبة البوت (${botTop}).` });
    await withRetry(() => a.role.setPosition(a.position, { reason: reason(ctx) }));
    return { outputs: { roleId: a.role.id }, done: `تم تغيير ترتيب الرتبة "${a.role.name}".`, doneVerb: `غيّرت ترتيب الرتبة "${a.role.name}"` };
  },
  failVerb: 'أغيّر ترتيب الرتبة'
});

const listRoles = defineTool({
  name: 'list_roles',
  label: 'عرض الرتب',
  description: 'يعرض رتب السيرفر من الأعلى للأدنى.',
  risk: 'read',
  schema: { type: 'object', properties: {} },
  describe: () => 'عرض رتب السيرفر',
  async run(ctx) {
    const roles = [...ctx.guild.roles.cache.values()].filter((r) => r.id !== ctx.guild.id).sort((x, y) => y.position - x.position);
    const lines = roles.slice(0, 40).map((r) => `• ${r.name} (${r.position})${r.managed ? ' 🤖' : ''}${isAdminLevelRole(r) ? ' 🛡️' : ''}`);
    return { outputs: { count: roles.length }, done: `🎭 رتب السيرفر (${roles.length}):\n${lines.join('\n') || 'ما فيه رتب.'}${roles.length > 40 ? '\n…' : ''}`, doneVerb: 'عرضت الرتب' };
  },
  failVerb: 'أعرض الرتب'
});

const getRoleInfo = defineTool({
  name: 'get_role_info',
  label: 'معلومات رتبة',
  description: 'يعرض معلومات رتبة: اللون، الترتيب، العدد، وهل تحمل صلاحيات إدارية.',
  risk: 'read',
  schema: { type: 'object', required: ['role'], properties: { role: ROLE } },
  describe: (a) => `معلومات الرتبة ${label(a.role)}`,
  async run(ctx, a) {
    const r = a.role;
    const count = r.members && r.members.size !== undefined ? r.members.size : '—';
    const color = r.color ? `#${r.color.toString(16).padStart(6, '0')}` : 'بدون لون';
    return {
      outputs: { roleId: r.id },
      done: `🎭 **${r.name}** — اللون ${color} · الترتيب ${r.position} · الأعضاء ${count} · ${isAdminLevelRole(r) ? 'تحمل صلاحيات إدارية 🛡️' : 'بدون صلاحيات إدارية'}${r.managed ? ' · تابعة لبوت' : ''}${r.hoist ? ' · معروضة منفصلة' : ''}`,
      doneVerb: `عرضت معلومات الرتبة "${r.name}"`
    };
  },
  failVerb: 'أعرض معلومات الرتبة'
});

const addRole = defineTool({
  name: 'add_role_to_member',
  label: 'إسناد رتبة لعضو',
  description: 'يعطي عضو رتبة. الرتب الإدارية تحتاج تأكيد.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['member', 'role'], properties: { member: MEMBER, role: ROLE } },
  guildPerms: ['ManageRoles'],
  confirm: adminRoleConfirm,
  describe: (a) => `إعطاء ${label(a.member)} الرتبة ${label(a.role)}`,
  async run(ctx, a) {
    assertEditable(ctx.guild, a.role);
    if (a.member.roles.cache.has(a.role.id)) return { outputs: { memberId: a.member.id, roleId: a.role.id }, done: `${label(a.member)} عنده الرتبة "${a.role.name}" من قبل.`, doneVerb: `تأكدت إن ${label(a.member)} عنده الرتبة "${a.role.name}"` };
    await withRetry(() => a.member.roles.add(a.role, reason(ctx)));
    return { outputs: { memberId: a.member.id, roleId: a.role.id }, done: `تم إعطاء ${label(a.member)} الرتبة "${a.role.name}".`, doneVerb: `أعطيت ${label(a.member)} الرتبة "${a.role.name}"` };
  },
  verify: async (ctx, a, r) => {
    const m = await ctx.guild.members.fetch(r.outputs.memberId).catch(() => null);
    return !!m && m.roles.cache.has(r.outputs.roleId);
  },
  failVerb: 'أعطي الرتبة'
});

const removeRole = defineTool({
  name: 'remove_role_from_member',
  label: 'سحب رتبة من عضو',
  description: 'يسحب رتبة من عضو. الرتب الإدارية تحتاج تأكيد.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['member', 'role'], properties: { member: MEMBER, role: ROLE } },
  guildPerms: ['ManageRoles'],
  confirm: adminRoleConfirm,
  describe: (a) => `سحب الرتبة ${label(a.role)} من ${label(a.member)}`,
  async run(ctx, a) {
    assertEditable(ctx.guild, a.role);
    if (a.member.roles.cache.has(a.role.id)) await withRetry(() => a.member.roles.remove(a.role, reason(ctx)));
    return { outputs: { memberId: a.member.id, roleId: a.role.id }, done: `تم سحب الرتبة "${a.role.name}" من ${label(a.member)}.`, doneVerb: `سحبت الرتبة "${a.role.name}" من ${label(a.member)}` };
  },
  verify: async (ctx, a, r) => {
    const m = await ctx.guild.members.fetch(r.outputs.memberId).catch(() => null);
    return !!m && !m.roles.cache.has(r.outputs.roleId);
  },
  failVerb: 'أسحب الرتبة'
});

module.exports = [createRole, renameRole, setRoleColor, setRolePosition, listRoles, getRoleInfo, addRole, removeRole];
