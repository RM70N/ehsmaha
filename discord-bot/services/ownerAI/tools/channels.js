'use strict';

// أدوات القنوات: إنشاء (كتابي/صوتي/قسم/إعلانات)، تغيير الاسم والوصف والترتيب، نقل لقسم،
// قفل/فتح، صلاحيات صريحة، وحذف. كل ما يمس @everyone أو يحذف يحتاج تأكيد من المالك.

const { ChannelType } = require('discord.js');
const { OwnerAIError } = require('../errorHandler');
const { withRetry } = require('../executionQueue');
const kit = require('../toolKit');

const { defineTool, label } = kit;

const NAME = { type: 'string', minLength: 1, maxLength: 100 };
const ANY_CHANNEL = { type: 'string', 'x-entity': 'channel', description: 'روم أو قسم (اسمه أو منشنه أو معرّفه أو $sN.channelId)' };
const TEXT_CHANNEL = { type: 'string', 'x-entity': 'textChannel' };
const CATEGORY = { type: 'string', 'x-entity': 'category', description: 'اسم القسم أو معرّفه أو $sN.categoryId' };

const reason = (ctx) => `Owner AI ${ctx.taskId}`;
const cleanName = (n) => String(n).replace(/\s+/g, ' ').trim();

async function createChannel(ctx, { name, type, category, topic, userLimit }) {
  const opts = { name: cleanName(name), type, reason: reason(ctx) };
  if (category) opts.parent = category.id;
  if (topic) opts.topic = topic;
  if (userLimit) opts.userLimit = userLimit;
  return ctx.guild.channels.create(opts);
}

const verifyCreated = async (ctx, a, r) => !!(await ctx.guild.channels.fetch(r.outputs.channelId).catch(() => null));

const createText = defineTool({
  name: 'create_text_channel',
  label: 'إنشاء روم كتابي',
  description: 'ينشئ روم كتابي (نصي)، اختيارياً داخل قسم محدد مع وصف.',
  risk: 'low',
  schema: { type: 'object', required: ['name'], properties: { name: NAME, category: CATEGORY, topic: { type: 'string', maxLength: 1024 } } },
  guildPerms: ['ManageChannels'],
  describe: (a) => `إنشاء روم كتابي "${a.name}"${a.category ? ` داخل ${label(a.category)}` : ''}`,
  async run(ctx, a) {
    const ch = await createChannel(ctx, { ...a, type: ChannelType.GuildText });
    return { outputs: { channelId: ch.id }, done: `تم إنشاء الروم ${label(ch)}.`, doneVerb: `أنشأت الروم ${label(ch)}` };
  },
  verify: verifyCreated,
  failVerb: 'أنشئ الروم'
});

const createVoice = defineTool({
  name: 'create_voice_channel',
  label: 'إنشاء روم صوتي',
  description: 'ينشئ روم صوتي، اختيارياً داخل قسم وبحد أعضاء.',
  risk: 'low',
  schema: { type: 'object', required: ['name'], properties: { name: NAME, category: CATEGORY, userLimit: { type: 'integer', minimum: 0, maximum: 99 } } },
  guildPerms: ['ManageChannels'],
  describe: (a) => `إنشاء روم صوتي "${a.name}"${a.category ? ` داخل ${label(a.category)}` : ''}`,
  async run(ctx, a) {
    const ch = await createChannel(ctx, { ...a, type: ChannelType.GuildVoice });
    return { outputs: { channelId: ch.id }, done: `تم إنشاء الروم الصوتي ${label(ch)}.`, doneVerb: `أنشأت الروم الصوتي ${label(ch)}` };
  },
  verify: verifyCreated,
  failVerb: 'أنشئ الروم الصوتي'
});

const createCategory = defineTool({
  name: 'create_category',
  label: 'إنشاء قسم',
  description: 'ينشئ قسم (Category) جديد.',
  risk: 'low',
  schema: { type: 'object', required: ['name'], properties: { name: NAME } },
  guildPerms: ['ManageChannels'],
  describe: (a) => `إنشاء قسم "${a.name}"`,
  async run(ctx, a) {
    const ch = await createChannel(ctx, { name: a.name, type: ChannelType.GuildCategory });
    return { outputs: { categoryId: ch.id, channelId: ch.id }, done: `تم إنشاء القسم "${ch.name}".`, doneVerb: `أنشأت القسم "${ch.name}"` };
  },
  verify: async (ctx, a, r) => !!(await ctx.guild.channels.fetch(r.outputs.categoryId).catch(() => null)),
  failVerb: 'أنشئ القسم'
});

const createAnnouncement = defineTool({
  name: 'create_announcement_channel',
  label: 'إنشاء روم إعلانات',
  description: 'ينشئ روم إعلانات (Announcement) — يتطلب أن السيرفر مفعّل عليه Community.',
  risk: 'low',
  schema: { type: 'object', required: ['name'], properties: { name: NAME, category: CATEGORY, topic: { type: 'string', maxLength: 1024 } } },
  guildPerms: ['ManageChannels'],
  describe: (a) => `إنشاء روم إعلانات "${a.name}"`,
  async run(ctx, a) {
    const ch = await createChannel(ctx, { ...a, type: ChannelType.GuildAnnouncement });
    return { outputs: { channelId: ch.id }, done: `تم إنشاء روم الإعلانات ${label(ch)}.`, doneVerb: `أنشأت روم الإعلانات ${label(ch)}` };
  },
  verify: verifyCreated,
  failVerb: 'أنشئ روم الإعلانات'
});

const renameChannel = defineTool({
  name: 'rename_channel',
  label: 'تغيير اسم روم',
  description: 'يغيّر اسم روم أو قسم.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['channel', 'name'], properties: { channel: ANY_CHANNEL, name: NAME } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
  describe: (a) => `تغيير اسم ${label(a.channel)} إلى "${a.name}"`,
  async run(ctx, a) {
    await withRetry(() => a.channel.setName(cleanName(a.name), reason(ctx)));
    return { outputs: { channelId: a.channel.id }, done: `تم تغيير اسم الروم إلى "${cleanName(a.name)}" (${label(a.channel)}).`, doneVerb: `غيّرت اسم الروم إلى "${cleanName(a.name)}"` };
  },
  verify: async (ctx, a, r) => {
    const ch = await ctx.guild.channels.fetch(r.outputs.channelId).catch(() => null);
    return !!ch && ch.name !== undefined;
  },
  failVerb: 'أغيّر اسم الروم'
});

const setTopic = defineTool({
  name: 'set_channel_topic',
  label: 'تغيير وصف روم',
  description: 'يغيّر وصف (Topic) روم كتابي.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['channel', 'topic'], properties: { channel: TEXT_CHANNEL, topic: { type: 'string', maxLength: 1024 } } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
  describe: (a) => `تغيير وصف ${label(a.channel)}`,
  async run(ctx, a) {
    await withRetry(() => a.channel.setTopic(a.topic, reason(ctx)));
    return { outputs: { channelId: a.channel.id }, done: `تم تغيير وصف الروم ${label(a.channel)}.`, doneVerb: `غيّرت وصف الروم ${label(a.channel)}` };
  },
  failVerb: 'أغيّر وصف الروم'
});

const moveChannel = defineTool({
  name: 'move_channel',
  label: 'نقل روم لقسم',
  description: 'ينقل روم إلى قسم محدد.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['channel', 'category'], properties: { channel: ANY_CHANNEL, category: CATEGORY } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
  describe: (a) => `نقل ${label(a.channel)} إلى ${label(a.category)}`,
  async run(ctx, a) {
    if (a.channel.type === ChannelType.GuildCategory) throw new OwnerAIError('INVALID_ARGS', { detail: 'ما ينفع أنقل قسم داخل قسم' });
    await withRetry(() => a.channel.setParent(a.category.id, { lockPermissions: false, reason: reason(ctx) }));
    return { outputs: { channelId: a.channel.id, categoryId: a.category.id }, done: `تم نقل ${label(a.channel)} إلى القسم "${a.category.name}".`, doneVerb: `نقلت ${label(a.channel)} إلى القسم "${a.category.name}"` };
  },
  verify: async (ctx, a, r) => {
    const ch = await ctx.guild.channels.fetch(r.outputs.channelId).catch(() => null);
    return !!ch && ch.parentId === r.outputs.categoryId;
  },
  failVerb: 'أنقل الروم'
});

const setPosition = defineTool({
  name: 'set_channel_position',
  label: 'تغيير ترتيب روم',
  description: 'يغيّر ترتيب روم أو قسم (0 = الأول).',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['channel', 'position'], properties: { channel: ANY_CHANNEL, position: { type: 'integer', minimum: 0, maximum: 500 } } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
  describe: (a) => `تغيير ترتيب ${label(a.channel)} إلى ${a.position}`,
  async run(ctx, a) {
    await withRetry(() => a.channel.setPosition(a.position, { reason: reason(ctx) }));
    return { outputs: { channelId: a.channel.id }, done: `تم تغيير ترتيب ${label(a.channel)}.`, doneVerb: `غيّرت ترتيب ${label(a.channel)}` };
  },
  failVerb: 'أغيّر ترتيب الروم'
});

function lockTool(name, lock) {
  return defineTool({
    name,
    label: lock ? 'قفل روم' : 'فتح روم',
    description: lock
      ? 'يقفل روم كتابي: يمنع @everyone من الكتابة (يغيّر صلاحيات @everyone ← يحتاج تأكيد).'
      : 'يفتح روم كتابي: يرجّع صلاحية الكتابة لـ@everyone (يحتاج تأكيد).',
    risk: 'medium',
    idempotent: true,
    schema: { type: 'object', required: ['channel'], properties: { channel: TEXT_CHANNEL } },
    channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
    confirm: () => 'تعديل صلاحيات @everyone',
    describe: (a) => `${lock ? 'قفل' : 'فتح'} ${label(a.channel)} (صلاحيات @everyone)`,
    async run(ctx, a) {
      await withRetry(() => a.channel.permissionOverwrites.edit(ctx.guild.roles.everyone, { SendMessages: lock ? false : null }, { reason: reason(ctx) }));
      return { outputs: { channelId: a.channel.id }, done: `تم ${lock ? 'قفل' : 'فتح'} ${label(a.channel)}.`, doneVerb: `${lock ? 'قفلت' : 'فتحت'} ${label(a.channel)}` };
    },
    failVerb: lock ? 'أقفل الروم' : 'أفتح الروم'
  });
}

const FORBIDDEN_CHANNEL_PERMS = ['Administrator', 'ManageChannels', 'ManageRoles', 'ManageWebhooks', 'ManageMessages', 'ManageGuild', 'MentionEveryone', 'KickMembers', 'BanMembers', 'ModerateMembers'];
const setPermissions = defineTool({
  name: 'set_channel_permissions',
  label: 'تعديل صلاحيات روم',
  description: 'يعدّل صلاحيات رتبة أو عضو في روم (allow = يسمح، deny = يمنع). الصلاحيات الإدارية ممنوعة. لو الهدف @everyone يحتاج تأكيد.',
  risk: 'medium',
  idempotent: true,
  schema: {
    type: 'object',
    required: ['channel'],
    properties: {
      channel: ANY_CHANNEL,
      role: { type: 'string', 'x-entity': 'role', description: 'الرتبة المستهدفة (أو everyone)' },
      member: { type: 'string', 'x-entity': 'member', description: 'أو العضو المستهدف' },
      allow: { type: 'array', items: { type: 'string' }, maxItems: 15 },
      deny: { type: 'array', items: { type: 'string' }, maxItems: 15 }
    }
  },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'ManageChannels'] }],
  validate(a) {
    if (!a.role && !a.member) throw new OwnerAIError('INVALID_ARGS', { detail: 'حدد رتبة أو عضو' });
    if (a.role && a.member) throw new OwnerAIError('INVALID_ARGS', { detail: 'حدد رتبة أو عضو (مو الاثنين)' });
    const all = [...(a.allow || []), ...(a.deny || [])];
    if (!all.length) throw new OwnerAIError('INVALID_ARGS', { detail: 'ما حددت أي صلاحية' });
    const bad = all.filter((p) => FORBIDDEN_CHANNEL_PERMS.includes(p));
    if (bad.length) throw new OwnerAIError('FORBIDDEN_PERMISSION', { names: bad });
    const unknown = all.filter((p) => !kit.SAFE_PERMS.includes(p));
    if (unknown.length) throw new OwnerAIError('INVALID_ARGS', { detail: `صلاحية غير مدعومة: ${unknown.join('، ').slice(0, 80)}` });
  },
  confirm: (a) => {
    const t = a.role;
    return t && (typeof t === 'string' ? /everyone/i.test(t) : t.id === t.guild.id) ? 'تعديل صلاحيات @everyone' : null;
  },
  describe: (a) => `تعديل صلاحيات ${label(a.role || a.member)} في ${label(a.channel)} (يسمح: ${(a.allow || []).join('، ') || '—'} | يمنع: ${(a.deny || []).join('، ') || '—'})`,
  async run(ctx, a) {
    const target = a.role || a.member;
    const perms = {};
    for (const p of a.allow || []) perms[p] = true;
    for (const p of a.deny || []) perms[p] = false;
    await withRetry(() => a.channel.permissionOverwrites.edit(target, perms, { reason: reason(ctx) }));
    return { outputs: { channelId: a.channel.id }, done: `تم تعديل صلاحيات ${label(target)} في ${label(a.channel)}.`, doneVerb: `عدّلت صلاحيات ${label(target)} في ${label(a.channel)}` };
  },
  failVerb: 'أعدّل صلاحيات الروم'
});

const deleteChannel = defineTool({
  name: 'delete_channel',
  label: 'حذف روم أو قسم',
  description: 'يحذف روم أو قسم نهائياً. دائماً يحتاج تأكيد من المالك. لا تستخدمه إلا لو طلب الحذف صراحة.',
  risk: 'high',
  schema: { type: 'object', required: ['channel'], properties: { channel: ANY_CHANNEL } },
  guildPerms: ['ManageChannels'],
  confirm: () => 'حذف نهائي لا يمكن التراجع عنه',
  describe: (a) => `حذف ${label(a.channel)} نهائياً`,
  async run(ctx, a) {
    const name = a.channel.name;
    const id = a.channel.id;
    await a.channel.delete(reason(ctx));
    return { outputs: { deletedChannelId: id }, done: `تم حذف الروم "${name}".`, doneVerb: `حذفت الروم "${name}"` };
  },
  verify: async (ctx, a, r) => !(await ctx.guild.channels.fetch(r.outputs.deletedChannelId).catch(() => null)),
  failVerb: 'أحذف الروم'
});

module.exports = [createText, createVoice, createCategory, createAnnouncement, renameChannel, setTopic, moveChannel, setPosition, lockTool('lock_channel', true), lockTool('unlock_channel', false), setPermissions, deleteChannel];
