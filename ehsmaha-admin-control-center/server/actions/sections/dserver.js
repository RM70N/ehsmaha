import { E } from '../../lib/errors.js';
import { pageSize } from '../siteHelpers.js';

const CH = { name: 'channelId', label: 'القناة', type: 'snowflake', required: true, optionsFrom: 'channels' };
const MSG = { name: 'messageId', label: 'معرّف الرسالة', type: 'snowflake', required: true };
const TYPES = { 0: 'نصية', 2: 'صوتية', 4: 'تصنيف', 5: 'إعلانات', 13: 'ستيج', 15: 'منتدى' };
const bits = (s) => BigInt(s || 0);
const sn = (t) => (t ? Math.floor(new Date(t).getTime()) : null);

async function botId(ctx) { return (await ctx.discord.me()).id; }
async function ownMsg(ctx, p) {
  const m = await ctx.discord.getMessage(p.channelId, p.messageId);
  if (m.author?.id !== (await botId(ctx))) throw E.forbidden('يمكن تعديل الرسائل التي أرسلها البوت فقط');
  return m;
}
const verifyMsg = (want) => async (p, ctx, b, r) => { const m = await ctx.discord.getMessage(p.channelId, r._id || p.messageId); return { ok: want(m, p), after: { id: m.id, content: (m.content || m.embeds?.[0]?.description || '').slice(0, 200), pinned: m.pinned } }; };
const mentionMode = { name: 'mention', label: 'المنشن', type: 'select', required: true, default: 'none', options: [{ value: 'none', label: 'بدون منشن' }, { value: 'here', label: '@here' }, { value: 'everyone', label: '@everyone' }] };
const allowed = (m) => ({ parse: m === 'everyone' ? ['everyone'] : [] });

export default {
  id: 'server', workspace: 'discord', label: 'إدارة السيرفر', icon: 'server', adminDefault: true, description: 'معلومات السيرفر، القنوات والرتب، إرسال وإدارة الرسائل',
  views: [
    {
      id: 'info', label: 'معلومات السيرفر', requires: ['discordGuild'], source: 'Discord API /guilds',
      columns: [{ key: 'field', label: 'الحقل' }, { key: 'value', label: 'القيمة' }],
      async fetch(q, ctx) { const g = await ctx.discord.guild(); return { rows: [['الاسم', g.name], ['المعرّف', g.id], ['المالك', g.owner_id], ['الأعضاء (تقريباً)', g.approximate_member_count], ['المتصلون (تقريباً)', g.approximate_presence_count], ['مستوى التعزيز', g.premium_tier], ['عدد التعزيزات', g.premium_subscription_count], ['الوصف', g.description || '—'], ['اللغة', g.preferred_locale], ['القنوات/الرتب/الإيموجي', `${(await ctx.discord.channels()).length} / ${g.roles?.length} / ${g.emojis?.length}`]].map(([field, value]) => ({ id: field, field, value: String(value) })) }; }
    },
    {
      id: 'channels', label: 'القنوات والتصنيفات', requires: ['discordGuild'], search: true, source: 'Discord API /guilds/{id}/channels',
      columns: [{ key: 'name', label: 'القناة' }, { key: 'type', label: 'النوع' }, { key: 'parent', label: 'التصنيف' }, { key: 'id', label: 'المعرّف', mono: true }],
      async fetch(q, ctx) { const ch = await ctx.discord.channels(); const byId = Object.fromEntries(ch.map((c) => [c.id, c.name])); const t = (q.q || '').toLowerCase(); return { rows: ch.sort((a, b) => a.position - b.position).filter((c) => !t || c.name.toLowerCase().includes(t)).map((c) => ({ id: c.id, name: c.name, type: TYPES[c.type] || c.type, parent: byId[c.parent_id] || '—' })) }; }
    },
    {
      id: 'roles', label: 'الرتب وصلاحياتها', requires: ['discordGuild'], search: true, source: 'Discord API /guilds/{id}/roles',
      columns: [{ key: 'name', label: 'الرتبة' }, { key: 'position', label: 'الترتيب' }, { key: 'admin', label: 'مدير' }, { key: 'perms', label: 'صلاحيات حساسة' }, { key: 'managed', label: 'تديرها خدمة' }, { key: 'id', label: 'المعرّف', mono: true }],
      async fetch(q, ctx) { const flags = { 8n: 'Administrator', 32n: 'ManageGuild', 268435456n: 'ManageRoles', 16n: 'ManageChannels', 2n: 'Kick', 4n: 'Ban', 8192n: 'ManageMessages', 1099511627776n: 'Timeout', 4194304n: 'MuteMembers' }; const t = (q.q || '').toLowerCase(); return { rows: (await ctx.discord.roles()).sort((a, b) => b.position - a.position).filter((r) => !t || r.name.toLowerCase().includes(t)).map((r) => ({ id: r.id, name: r.name, position: r.position, admin: bits(r.permissions) & 8n ? '👑' : '—', perms: Object.entries(flags).filter(([b]) => bits(r.permissions) & BigInt(b)).map(([, n]) => n).join('، ') || '—', managed: r.managed ? 'نعم' : '—' })) }; }
    },
    {
      id: 'members', label: 'البحث عن عضو', requires: ['discordGuild'], search: true, placeholder: 'اسم العضو (بداية الاسم)', source: 'Discord API /members/search',
      columns: [{ key: 'name', label: 'العضو' }, { key: 'nick', label: 'اللقب' }, { key: 'id', label: 'المعرّف', mono: true }, { key: 'joined', label: 'انضم', type: 'date' }, { key: 'roles', label: 'عدد الرتب' }, { key: 'timeout', label: 'Timeout حتى', type: 'date' }],
      async fetch(q, ctx) { const m = q.q ? await ctx.discord.searchMembers(q.q, pageSize(q, 25)) : await ctx.discord.listMembers(pageSize(q, 25), q.cursor); const rows = m.map((x) => ({ id: x.user.id, name: x.user.global_name || x.user.username, nick: x.nick || '—', joined: sn(x.joined_at), roles: x.roles.length, timeout: sn(x.communication_disabled_until) })); return { rows, nextCursor: !q.q && m.length >= pageSize(q, 25) ? m[m.length - 1].user.id : null }; }
    },
    {
      id: 'auditlog', label: 'سجل Discord (Audit Log)', requires: ['discordGuild'], source: 'Discord API /audit-logs',
      columns: [{ key: 'at', label: 'الوقت', type: 'date' }, { key: 'action', label: 'نوع الإجراء' }, { key: 'by', label: 'المنفّذ', mono: true }, { key: 'target', label: 'الهدف', mono: true }, { key: 'reason', label: 'السبب' }],
      async fetch(q, ctx) { const a = await ctx.discord.auditLog(undefined, { limit: 50 }); return { rows: (a.audit_log_entries || []).map((e) => ({ id: e.id, at: Number(BigInt(e.id) >> 22n) + 1420070400000, action: e.action_type, by: e.user_id, target: e.target_id, reason: e.reason || '' })) }; }
    }
  ],
  actions: [
    {
      id: 'send_announcement', label: 'إرسال إعلان (Embed) إلى روم', icon: 'megaphone', group: 'الإرسال', danger: 'medium', reversible: true, requires: ['discordGuild'],
      description: 'يرسل رسالة Embed مرتّبة عبر Discord API باسم البوت ويتحقق بقراءة الرسالة', effect: 'تظهر الرسالة فوراً في الروم لكل أعضائه',
      fields: [CH, { name: 'title', label: 'العنوان', type: 'text', max: 200 }, { name: 'content', label: 'نص الإعلان', type: 'textarea', required: true, max: 3500 }, mentionMode], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (![0, 5].includes(c.type)) throw E.invalid('اختر قناة نصية أو إعلانات'); if (ctx.discord.guildId && c.guild_id !== ctx.discord.guildId) throw E.forbidden('القناة ليست من السيرفر المُدار'); return { channel: c.name }; },
      async execute(p, ctx) { const m = await ctx.discord.sendMessage(p.channelId, { content: p.mention === 'none' ? undefined : `@${p.mention}`, embeds: [{ title: p.title || undefined, description: p.content, color: 0x8b5cf6, footer: { text: 'احسمها' } }], allowed_mentions: allowed(p.mention) }); return { message: 'أُرسل الإعلان', _id: m.id, undo: { action: 'server.delete_message', params: { channelId: p.channelId, messageId: m.id } } }; },
      verify: verifyMsg((m, p) => !!m.embeds?.[0] && m.embeds[0].description === p.content)
    },
    {
      id: 'send_message', label: 'إرسال رسالة مخصصة إلى روم', icon: 'send', group: 'الإرسال', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'رسالة نصية عادية (بدون منشن جماعي)', effect: 'تظهر الرسالة في الروم فوراً',
      fields: [CH, { name: 'content', label: 'الرسالة', type: 'textarea', required: true, max: 2000 }], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (ctx.discord.guildId && c.guild_id !== ctx.discord.guildId) throw E.forbidden('القناة ليست من السيرفر المُدار'); return { channel: c.name }; },
      async execute(p, ctx) { const m = await ctx.discord.sendMessage(p.channelId, { content: p.content, allowed_mentions: { parse: [] } }); return { message: 'أُرسلت الرسالة', _id: m.id, undo: { action: 'server.delete_message', params: { channelId: p.channelId, messageId: m.id } } }; },
      verify: verifyMsg((m, p) => m.content === p.content)
    },
    {
      id: 'pin_message', label: 'تثبيت رسالة', icon: 'pin', group: 'إدارة الرسائل', danger: 'low', reversible: true, requires: ['discordGuild'], description: 'يتطلب صلاحية Manage Messages للبوت (حد 50 رسالة مثبّتة)', effect: 'تُثبَّت الرسالة أعلى الروم',
      fields: [CH, MSG], target: (p) => p.messageId, load: async (p, ctx) => { const m = await ctx.discord.getMessage(p.channelId, p.messageId); if (m.pinned) throw E.conflict('الرسالة مثبّتة أصلاً'); return { content: (m.content || '').slice(0, 100) }; },
      async execute(p, ctx) { await ctx.discord.pinMessage(p.channelId, p.messageId, `[لوحة الإدارة] ${ctx.actor.display}`); return { message: 'تم التثبيت', undo: { action: 'server.unpin_message', params: p } }; }, verify: verifyMsg((m) => m.pinned === true)
    },
    {
      id: 'unpin_message', label: 'إلغاء تثبيت رسالة', icon: 'pinoff', group: 'إدارة الرسائل', danger: 'low', reversible: true, requires: ['discordGuild'], description: 'إزالة التثبيت', effect: 'تعود الرسالة عادية',
      fields: [CH, MSG], target: (p) => p.messageId, load: async (p, ctx) => { const m = await ctx.discord.getMessage(p.channelId, p.messageId); if (!m.pinned) throw E.conflict('الرسالة غير مثبّتة'); return {}; },
      async execute(p, ctx) { await ctx.discord.unpinMessage(p.channelId, p.messageId, `[لوحة الإدارة] ${ctx.actor.display}`); return { message: 'أُلغي التثبيت', undo: { action: 'server.pin_message', params: p } }; }, verify: verifyMsg((m) => m.pinned === false)
    },
    {
      id: 'delete_message', label: 'حذف رسالة محددة', icon: 'trash', group: 'إدارة الرسائل', danger: 'high', reversible: false, reasonRequired: true, requires: ['discordGuild'], description: 'حذف رسالة بمعرّفها (محتواها يُحفظ في سجل التدقيق)', effect: 'تُحذف الرسالة نهائياً من Discord',
      fields: [CH, MSG], target: (p) => p.messageId,
      async load(p, ctx) { const m = await ctx.discord.getMessage(p.channelId, p.messageId); return { author: m.author?.username, content: (m.content || m.embeds?.[0]?.description || '').slice(0, 500) }; },
      async execute(p, ctx) { await ctx.discord.deleteMessage(p.channelId, p.messageId, `[لوحة الإدارة] ${ctx.reason}`); return { message: 'حُذفت الرسالة' }; },
      async verify(p, ctx) { try { await ctx.discord.getMessage(p.channelId, p.messageId); return { ok: false, message: 'الرسالة ما زالت موجودة في Discord' }; } catch (e) { return { ok: e.status === 404, after: { exists: false }, message: e.message }; } }
    },
    {
      id: 'edit_message', label: 'تعديل رسالة أرسلها البوت', icon: 'edit', group: 'إدارة الرسائل', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'يعمل على رسائل البوت فقط (نص عادي أو وصف Embed)', effect: 'يتغير نص الرسالة فوراً',
      fields: [CH, MSG, { name: 'content', label: 'النص الجديد', type: 'textarea', required: true, max: 3500 }], target: (p) => p.messageId, load: async (p, ctx) => { const m = await ownMsg(ctx, p); return { content: m.content, embed: m.embeds?.[0]?.description, isEmbed: !!m.embeds?.length }; },
      async execute(p, ctx, b) { const body = b.isEmbed ? { embeds: [{ ...(await ctx.discord.getMessage(p.channelId, p.messageId)).embeds[0], description: p.content }] } : { content: p.content }; await ctx.discord.editMessage(p.channelId, p.messageId, body); return { message: 'عُدّلت الرسالة', undo: { action: 'server.edit_message', params: { channelId: p.channelId, messageId: p.messageId, content: b.isEmbed ? b.embed : b.content } } }; },
      verify: verifyMsg((m, p) => (m.content === p.content) || m.embeds?.[0]?.description === p.content)
    },
    {
      id: 'set_channel_topic', label: 'تعديل وصف قناة (Topic)', icon: 'edit', group: 'إعدادات', danger: 'low', reversible: true, requires: ['discordGuild'], description: 'يتطلب Manage Channels', effect: 'يتغير وصف القناة',
      fields: [CH, { name: 'topic', label: 'الوصف', type: 'text', required: true, max: 1000 }], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (![0, 5, 15].includes(c.type)) throw E.invalid('هذه القناة لا تدعم وصفاً'); return { topic: c.topic || '' }; },
      async execute(p, ctx, b) { await ctx.discord.req('PATCH', `/channels/${p.channelId}`, { body: { topic: p.topic }, reason: `[لوحة الإدارة] ${ctx.actor.display}` }); return { message: 'عُدّل الوصف', undo: { action: 'server.set_channel_topic', params: { channelId: p.channelId, topic: b.topic || ' ' } } }; },
      async verify(p, ctx) { const c = await ctx.discord.channel(p.channelId); return { ok: c.topic === p.topic, after: { topic: c.topic } }; }
    },
    {
      id: 'set_description', label: 'تعديل وصف السيرفر', icon: 'edit', group: 'إعدادات', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'يعمل فقط لسيرفرات Community ويتطلب Manage Guild', effect: 'يتغير وصف السيرفر في Discord',
      fields: [{ name: 'description', label: 'الوصف', type: 'textarea', required: true, max: 300 }], target: () => 'guild',
      async load(p, ctx) { const g = await ctx.discord.guild(); if (!g.features?.includes('COMMUNITY')) throw E.unavailable('وصف السيرفر متاح لسيرفرات Community فقط — هذا السيرفر ليس Community'); return { description: g.description || '' }; },
      async execute(p, ctx, b) { await ctx.discord.patchGuild({ description: p.description }, `[لوحة الإدارة] ${ctx.actor.display}`); return { message: 'عُدّل وصف السيرفر', undo: b.description ? { action: 'server.set_description', params: { description: b.description } } : undefined }; },
      async verify(p, ctx) { const g = await ctx.discord.guild(); return { ok: g.description === p.description, after: { description: g.description } }; }
    },
    {
      id: 'member_lookup', label: 'عرض معلومات عضو ورتبه', icon: 'user', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['discordGuild'], description: 'الاسم، اللقب، الرتب، تاريخ الانضمام، حالة Timeout', effect: 'قراءة فقط',
      fields: [{ name: 'userId', label: 'معرّف العضو', type: 'snowflake', required: true, optionsFrom: 'members' }], target: (p) => p.userId,
      async execute(p, ctx) { const [m, roles] = await Promise.all([ctx.discord.member(p.userId), ctx.discord.roles()]); const byId = Object.fromEntries(roles.map((r) => [r.id, r.name])); return { message: m.user.username, data: { id: m.user.id, username: m.user.username, nick: m.nick, joinedAt: m.joined_at, timeoutUntil: m.communication_disabled_until, roles: m.roles.map((r) => ({ id: r, name: byId[r] })) } }; }
    },
    {
      id: 'recent_actions', label: 'آخر الإجراءات الإدارية في Discord', icon: 'history', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['discordGuild'], description: 'آخر 25 عملية من Audit Log (تتطلب View Audit Log)', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const a = await ctx.discord.auditLog(undefined, { limit: 25 }); const data = (a.audit_log_entries || []).map((e) => ({ at: new Date(Number(BigInt(e.id) >> 22n) + 1420070400000).toISOString(), action: e.action_type, by: e.user_id, target: e.target_id, reason: e.reason })); return { message: `${data.length} إجراء`, data }; }
    }
  ]
};
