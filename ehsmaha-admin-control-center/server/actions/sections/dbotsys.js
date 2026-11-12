// أنظمة البوت المعتمدة على قاعدته: الحماية، التكتات، الترحيب، المشرفون، ستريمرات الإعلان، القاعدة.
// ⚠️ كل إجراء يحمل apply: live | ttl | restart مُثبَّتاً من كود البوت (خريطة الأدلة في INTEGRATION-MAP.md).
import { E } from '../../lib/errors.js';
import { pageSize } from '../siteHelpers.js';
import { normUsername } from '../../lib/util.js';
import { applyLive } from '../../adapters/botControl.js';

const G = (ctx) => ctx.guildId();
const need = ['botDb', 'discordGuild'];
const LIVE = 'live'; // يُقرأ من قاعدة البوت عند كل حدث
const by = (ctx) => `admin-center:${ctx.actor.id}`;
const SNOW = (name, label, extra = {}) => ({ name, label, type: 'snowflake', required: true, ...extra });
const BOOL = (name, label, d = true) => ({ name, label, type: 'boolean', default: d, required: true });
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/; // نفس normalizeDomain في البوت
const hostOf = (s) => { let x = String(s || '').trim().toLowerCase(); try { x = new URL(/^[a-z]+:\/\//.test(x) ? x : 'http://' + x).hostname; } catch { return ''; } return x.replace(/^www\./, ''); };
const ROLES_KEY = 'support_roles'; // services/tickets.js SUPPORT_ROLES_KEY

function toggle(id, label, col, description, effect) {
  return {
    id, label, icon: 'toggle', group: 'التفعيل', danger: 'medium', reversible: true, requires: need, apply: LIVE, description, effect, fields: [BOOL('enabled', 'مفعّل؟')], target: (p) => String(p.enabled),
    async load(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); if (s[col] === p.enabled) throw E.conflict('الإعداد على هذه القيمة أصلاً'); return { [col]: s[col] }; },
    async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { [col]: p.enabled }, by(ctx)); return { message: p.enabled ? 'فُعّل' : 'عُطّل', undo: { action: id.startsWith('welcome') ? undefined : `${undoSec[id]}.${id}`, params: { enabled: b[col] } } }; },
    async verify(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); return { ok: s[col] === p.enabled, after: { [col]: s[col] } }; }
  };
}
const undoSec = { toggle_links: 'automod', toggle_spam: 'automod', toggle_ai_style: 'tickets' };

const exempt = (type, plural, label, fieldDef) => [
  {
    id: `add_${type}_exempt`, label: `إضافة ${label} مسموح/مستثنى`, icon: 'plus', group: 'الاستثناءات', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: `يضيف ${label} لقائمة الاستثناءات (auto_mod_exemptions) التي يقرؤها فلتر الروابط عند كل رسالة`, effect: `يُسمح بالروابط وفق ${label} المضاف`,
    fields: [fieldDef], target: (p) => p.value,
    async load(p, ctx) { const v = type === 'domain' ? hostOf(p.value) : p.value; if (type === 'domain' && !DOMAIN_RE.test(v)) throw E.invalid('نطاق غير صالح (مثال: youtube.com)'); const ex = await ctx.botDb.automod.exemptions(G(ctx)); if (ex[plural].includes(v)) throw E.conflict('موجود مسبقاً'); return { value: v, list: ex[plural] }; },
    async execute(p, ctx, b) { const ok = await ctx.botDb.automod.addExemption(G(ctx), type, b.value, by(ctx)); if (!ok) throw E.conflict('موجود مسبقاً'); return { message: `أُضيف ${b.value}`, undo: { action: `automod.remove_${type}_exempt`, params: { value: b.value } } }; },
    async verify(p, ctx, b) { const ex = await ctx.botDb.automod.exemptions(G(ctx)); return { ok: ex[plural].includes(b.value), after: { [plural]: ex[plural] } }; }
  },
  {
    id: `remove_${type}_exempt`, label: `إزالة ${label} من الاستثناءات`, icon: 'minus', group: 'الاستثناءات', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: 'يحذف من auto_mod_exemptions', effect: 'تعود الحماية على هذا الاستثناء',
    fields: [fieldDef], target: (p) => p.value,
    async load(p, ctx) { const v = type === 'domain' ? hostOf(p.value) : p.value; const ex = await ctx.botDb.automod.exemptions(G(ctx)); if (!ex[plural].includes(v)) throw E.notFound('ليس ضمن الاستثناءات'); return { value: v }; },
    async execute(p, ctx, b) { await ctx.botDb.automod.removeExemption(G(ctx), type, b.value); return { message: `أُزيل ${b.value}`, undo: { action: `automod.add_${type}_exempt`, params: { value: b.value } } }; },
    async verify(p, ctx, b) { const ex = await ctx.botDb.automod.exemptions(G(ctx)); return { ok: !ex[plural].includes(b.value), after: { [plural]: ex[plural] } }; }
  }
];

const automod = {
  id: 'automod', workspace: 'discord', label: 'الحماية التلقائية', icon: 'shield', adminDefault: false, description: 'حماية الروابط والسبام والاستثناءات والمخالفات (قاعدة البوت)',
  views: [
    { id: 'status', label: 'حالة الحماية والاستثناءات', requires: need, source: 'قاعدة البوت: guild_settings + auto_mod_exemptions', columns: [{ key: 'field', label: 'الإعداد' }, { key: 'value', label: 'القيمة' }],
      async fetch(q, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); const ex = await ctx.botDb.automod.exemptions(G(ctx)); return { rows: [['حماية الروابط', s.link_protection ? '🟢 مفعّلة' : '🔴 معطّلة'], ['حماية السبام', s.spam_protection ? '🟢 مفعّلة' : '🔴 معطّلة'], ['نطاقات مسموحة', ex.domains.join('، ') || '—'], ['رتب مستثناة', ex.roles.join('، ') || '—'], ['قنوات مستثناة', ex.channels.join('، ') || '—']].map(([field, value]) => ({ id: field, field, value })) }; } },
    { id: 'violations', label: 'آخر المخالفات', requires: need, source: 'قاعدة البوت: auto_mod_violations', columns: [{ key: 'discord_id', label: 'العضو', mono: true }, { key: 'violation_type', label: 'النوع' }, { key: 'count', label: 'العدد' }, { key: 'last_violation_at', label: 'آخر مخالفة', type: 'date' }],
      async fetch(q, ctx) { return { rows: (await ctx.botDb.automod.violations(G(ctx), pageSize(q, 100))).map((r) => ({ id: `${r.discord_id}-${r.violation_type}`, ...r })), meta: { stats: await ctx.botDb.automod.violationStats(G(ctx)) } }; } }
  ],
  actions: [
    toggle('toggle_links', 'تشغيل/إيقاف حماية الروابط', 'link_protection', 'link_protection في guild_settings (يقرؤه البوت مع كل رسالة)', 'تُفعَّل/تُعطَّل حماية الروابط فوراً'),
    toggle('toggle_spam', 'تشغيل/إيقاف حماية السبام', 'spam_protection', 'spam_protection في guild_settings', 'تُفعَّل/تُعطَّل حماية السبام فوراً'),
    ...exempt('domain', 'domains', 'نطاق', { name: 'value', label: 'النطاق', type: 'text', required: true, max: 200, placeholder: 'youtube.com' }),
    ...exempt('role', 'roles', 'رتبة', SNOW('value', 'الرتبة', { optionsFrom: 'roles' })),
    ...exempt('channel', 'channels', 'قناة', SNOW('value', 'القناة', { optionsFrom: 'channels' })),
    { id: 'reset_violations', label: 'تصفير مخالفات عضو', icon: 'rotate', group: 'المخالفات', danger: 'medium', reversible: false, reasonRequired: true, requires: need, apply: LIVE, description: 'يحذف عدّاد المخالفات (يعيد تصعيد العقوبة من الصفر)', effect: 'تُصفَّر عدّادات العضو',
      fields: [SNOW('userId', 'العضو', { optionsFrom: 'members' }), { name: 'type', label: 'النوع', type: 'select', required: true, default: 'all', options: [{ value: 'all', label: 'الكل' }, { value: 'link', label: 'روابط' }, { value: 'spam', label: 'سبام' }] }], target: (p) => p.userId,
      async load(p, ctx) { const v = (await ctx.botDb.automod.violations(G(ctx), 1000)).filter((r) => r.discord_id === p.userId && (p.type === 'all' || r.violation_type === p.type)); if (!v.length) throw E.conflict('لا توجد مخالفات لهذا العضو'); return { violations: v }; },
      async execute(p, ctx) { const n = await ctx.botDb.automod.resetViolations(G(ctx), p.userId, p.type); return { message: `صُفّر ${n} سجل` }; },
      async verify(p, ctx) { const v = (await ctx.botDb.automod.violations(G(ctx), 1000)).filter((r) => r.discord_id === p.userId && (p.type === 'all' || r.violation_type === p.type)); return { ok: v.length === 0, after: { remaining: v.length } }; } },
    { id: 'member_violations', label: 'عرض مخالفات عضو', icon: 'eye', group: 'المخالفات', kind: 'read', danger: 'low', requires: need, fields: [SNOW('userId', 'العضو', { optionsFrom: 'members' })], target: (p) => p.userId, description: 'عدّادات الروابط والسبام وآخر مخالفة', effect: 'قراءة فقط',
      async execute(p, ctx) { const v = (await ctx.botDb.automod.violations(G(ctx), 1000)).filter((r) => r.discord_id === p.userId); return { message: `${v.length} نوع`, data: v }; } }
  ]
};

const tickets = {
  id: 'tickets', workspace: 'discord', label: 'التكتات والدعم', icon: 'ticket', adminDefault: false, description: 'رتب الدعم، المساعد الذكي، وإحصائيات التذاكر',
  views: [
    { id: 'open', label: 'التكتات المفتوحة', requires: need, source: 'قاعدة البوت: tickets', columns: [{ key: 'id', label: '#' }, { key: 'discord_id', label: 'صاحب التكت', mono: true }, { key: 'reason', label: 'السبب' }, { key: 'channel_id', label: 'القناة', mono: true }, { key: 'created_at', label: 'أُنشئ', type: 'date' }],
      async fetch(q, ctx) { return { rows: await ctx.botDb.tickets.list(G(ctx), { status: 'open', limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q) }) }; } },
    { id: 'closed', label: 'التكتات المغلقة', requires: need, source: 'قاعدة البوت: tickets', columns: [{ key: 'id', label: '#' }, { key: 'discord_id', label: 'صاحب التكت', mono: true }, { key: 'reason', label: 'السبب' }, { key: 'created_at', label: 'أُنشئ', type: 'date' }, { key: 'closed_at', label: 'أُغلق', type: 'date' }, { key: 'closed_by', label: 'أغلقه', mono: true }, { key: 'close_mode', label: 'الإغلاق' }],
      async fetch(q, ctx) { return { rows: await ctx.botDb.tickets.list(G(ctx), { status: 'closed', limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q) }) }; } },
    { id: 'stats', label: 'إحصائيات الدعم', requires: need, source: 'قاعدة البوت: tickets', columns: [{ key: 'reason', label: 'السبب' }, { key: 'n', label: 'العدد' }],
      async fetch(q, ctx) { const [st, avg, br] = await Promise.all([ctx.botDb.tickets.stats(G(ctx)), ctx.botDb.tickets.avgCloseMs(G(ctx)), ctx.botDb.tickets.byReason(G(ctx))]); return { rows: br.map((r) => ({ id: r.reason, ...r })), meta: { open: st.open, closed: st.closed, avgCloseMinutes: avg == null ? null : Math.round(avg / 60000) } }; } },
    { id: 'supportroles', label: 'رتب الدعم الحالية', requires: need, source: 'قاعدة البوت: guild_config.support_roles', columns: [{ key: 'id', label: 'معرّف الرتبة', mono: true }],
      async fetch(q, ctx) { return { rows: ((await ctx.botDb.config.get(G(ctx), ROLES_KEY, [])) || []).map((id) => ({ id })) }; } }
  ],
  actions: [
    { id: 'add_support_role', label: 'إضافة رتبة دعم', icon: 'plus', group: 'رتب الدعم', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: 'يضيف الرتبة لـguild_config.support_roles (تُقرأ عند كل فحص صلاحية تكت)', effect: 'يستطيع أصحاب الرتبة رؤية/إدارة التكتات', fields: [SNOW('roleId', 'الرتبة', { optionsFrom: 'roles' })], target: (p) => p.roleId,
      async load(p, ctx) { const cur = (await ctx.botDb.config.get(G(ctx), ROLES_KEY, [])) || []; if (cur.includes(p.roleId)) throw E.conflict('الرتبة ضمن رتب الدعم أصلاً'); if (!(await ctx.discord.roles()).some((r) => r.id === p.roleId)) throw E.notFound('الرتبة غير موجودة في السيرفر'); return { roles: cur }; },
      async execute(p, ctx, b) { await ctx.botDb.config.set(G(ctx), ROLES_KEY, [...b.roles, p.roleId], by(ctx)); return { message: 'أُضيفت رتبة الدعم', undo: { action: 'tickets.remove_support_role', params: { roleId: p.roleId } } }; },
      async verify(p, ctx) { const cur = await ctx.botDb.config.get(G(ctx), ROLES_KEY, []); return { ok: cur.includes(p.roleId), after: { roles: cur } }; } },
    { id: 'remove_support_role', label: 'إزالة رتبة دعم', icon: 'minus', group: 'رتب الدعم', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: 'يزيل الرتبة من support_roles', effect: 'تفقد الرتبة صلاحية الدعم', fields: [SNOW('roleId', 'الرتبة', { optionsFrom: 'roles' })], target: (p) => p.roleId,
      async load(p, ctx) { const cur = (await ctx.botDb.config.get(G(ctx), ROLES_KEY, [])) || []; if (!cur.includes(p.roleId)) throw E.notFound('ليست ضمن رتب الدعم'); return { roles: cur }; },
      async execute(p, ctx, b) { await ctx.botDb.config.set(G(ctx), ROLES_KEY, b.roles.filter((r) => r !== p.roleId), by(ctx)); return { message: 'أُزيلت رتبة الدعم', undo: { action: 'tickets.add_support_role', params: { roleId: p.roleId } } }; },
      async verify(p, ctx) { const cur = await ctx.botDb.config.get(G(ctx), ROLES_KEY, []); return { ok: !cur.includes(p.roleId), after: { roles: cur } }; } },
    toggle('toggle_ai_style', 'تشغيل/إيقاف تعلّم أسلوب المالك للمساعد الذكي', 'ai_style_enabled', 'ai_style_enabled في guild_settings (يقرؤه aiStyle عند كل ردّ)', 'يبدأ/يتوقف تعلّم المساعد من ردود المالك'),
    { id: 'set_ai_style_owner', label: 'تحديد صاحب أسلوب المساعد الذكي', icon: 'user', group: 'المساعد الذكي', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: 'ai_style_owner_id: من يتعلم منه المساعد', effect: 'يتغير مصدر أسلوب الردود', fields: [SNOW('userId', 'العضو', { optionsFrom: 'members' })], target: (p) => p.userId,
      async load(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); if (s.ai_style_owner_id === p.userId) throw E.conflict('مطابق للحالي'); await ctx.discord.member(p.userId); return { prev: s.ai_style_owner_id }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { ai_style_owner_id: p.userId }, by(ctx)); return { message: 'حُدّد صاحب الأسلوب', undo: b.prev ? { action: 'tickets.set_ai_style_owner', params: { userId: b.prev } } : undefined }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.settings.get(G(ctx))).ai_style_owner_id === p.userId }; } },
    { id: 'set_admin_news_channel', label: 'تحديد قناة ملخص أخبار الإدارة', icon: 'hash', group: 'المساعد الذكي', danger: 'low', reversible: true, requires: need, apply: LIVE, description: 'admin_news_channel_id', effect: 'يرسل البوت ملخصاته لهذه القناة', fields: [SNOW('channelId', 'القناة', { optionsFrom: 'channels' })], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (![0, 5].includes(c.type)) throw E.invalid('اختر قناة نصية'); return { prev: (await ctx.botDb.settings.get(G(ctx))).admin_news_channel_id }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { admin_news_channel_id: p.channelId }, by(ctx)); return { message: 'حُددت القناة', undo: b.prev ? { action: 'tickets.set_admin_news_channel', params: { channelId: b.prev } } : undefined }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.settings.get(G(ctx))).admin_news_channel_id === p.channelId }; } },
    { id: 'clear_ai_style_examples', label: 'مسح أمثلة أسلوب المساعد المحفوظة', icon: 'trash', group: 'المساعد الذكي', danger: 'critical', reversible: false, reasonRequired: true, requires: need, apply: LIVE, description: 'يحذف ai_style_examples (يتعلم المساعد من جديد)', effect: 'يُمسح كل ما تعلّمه المساعد من أسلوب المالك', fields: [],
      async load(p, ctx) { const n = (await ctx.botDb.counts.all()).ai_style_examples; if (!n) throw E.conflict('لا توجد أمثلة محفوظة'); return { count: n }; },
      async execute(p, ctx, b) { const n = await ctx.botDb.clearAiStyle(G(ctx)); return { message: `مُسحت ${n} مثالاً` }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.counts.all()).ai_style_examples === 0 }; } }
  ]
};

const FMT_PLACEHOLDERS = 'المتغيرات المدعومة: {يوزر} {السيرفر} {العدد}';
const welcome = {
  id: 'welcome', workspace: 'discord', label: 'نظام الترحيب', icon: 'wave', adminDefault: false, description: 'قناة الترحيب ونصّه (guild_settings — يقرؤه البوت عند كل عضو جديد)',
  views: [{ id: 'config', label: 'إعدادات الترحيب الحالية', requires: need, source: 'قاعدة البوت: guild_settings', columns: [{ key: 'field', label: 'الإعداد' }, { key: 'value', label: 'القيمة' }],
    async fetch(q, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); return { rows: [['قناة صورة الترحيب', s.welcome_channel_id || '—'], ['قناة النص', s.welcome_message_channel_id || '(نفس قناة الصورة)'], ['النص', s.welcome_message || '(الافتراضي)'], ['الحالة', s.welcome_channel_id ? '🟢 مفعّل' : '🔴 معطّل (لا توجد قناة)']].map(([field, value]) => ({ id: field, field, value })) }; } }],
  actions: [
    { id: 'set_channel', label: 'تحديد/تغيير قناة الترحيب (تفعيل)', icon: 'hash', group: 'القنوات', danger: 'medium', reversible: true, requires: need, apply: LIVE, description: 'welcome_channel_id — وجودها = تفعيل الترحيب', effect: 'يبدأ الترحيب بالأعضاء الجدد في هذه القناة', fields: [SNOW('channelId', 'القناة', { optionsFrom: 'channels' })], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (![0, 5].includes(c.type)) throw E.invalid('اختر قناة نصية'); const s = await ctx.botDb.settings.get(G(ctx)); if (s.welcome_channel_id === p.channelId) throw E.conflict('مطابقة للحالية'); return { prev: s.welcome_channel_id }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { welcome_channel_id: p.channelId }, by(ctx)); return { message: 'حُددت قناة الترحيب', undo: b.prev ? { action: 'welcome.set_channel', params: { channelId: b.prev } } : { action: 'welcome.disable', params: {} } }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.settings.get(G(ctx))).welcome_channel_id === p.channelId }; } },
    { id: 'disable', label: 'تعطيل نظام الترحيب', icon: 'ban', group: 'القنوات', danger: 'high', reversible: true, requires: need, apply: LIVE, description: 'يمسح welcome_channel_id (البوت لا يرحّب عند غياب القناة)', effect: 'يتوقف الترحيب بالأعضاء الجدد', fields: [],
      async load(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); if (!s.welcome_channel_id) throw E.conflict('الترحيب معطّل أصلاً'); return { prev: s.welcome_channel_id }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { welcome_channel_id: null }, by(ctx)); return { message: 'عُطّل الترحيب', undo: { action: 'welcome.set_channel', params: { channelId: b.prev } } }; },
      async verify(p, ctx) { return { ok: !(await ctx.botDb.settings.get(G(ctx))).welcome_channel_id }; } },
    { id: 'set_text_channel', label: 'تغيير قناة نص الترحيب', icon: 'hash', group: 'القنوات', danger: 'low', reversible: true, requires: need, apply: LIVE, description: 'welcome_message_channel_id (اختيارية؛ الافتراضي نفس قناة الصورة)', effect: 'تُرسل رسالة النص في هذه القناة', fields: [SNOW('channelId', 'القناة', { optionsFrom: 'channels' })], target: (p) => p.channelId,
      async load(p, ctx) { const c = await ctx.discord.channel(p.channelId); if (![0, 5].includes(c.type)) throw E.invalid('اختر قناة نصية'); return { prev: (await ctx.botDb.settings.get(G(ctx))).welcome_message_channel_id }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { welcome_message_channel_id: p.channelId }, by(ctx)); return { message: 'حُددت قناة النص', undo: b.prev ? { action: 'welcome.set_text_channel', params: { channelId: b.prev } } : undefined }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.settings.get(G(ctx))).welcome_message_channel_id === p.channelId }; } },
    { id: 'set_message', label: 'تعديل نص رسالة الترحيب', icon: 'edit', group: 'الرسالة', danger: 'low', reversible: true, requires: need, apply: LIVE, description: FMT_PLACEHOLDERS, effect: 'يتغير نص الترحيب للأعضاء الجدد', fields: [{ name: 'text', label: 'النص', type: 'textarea', required: true, max: 1000, help: FMT_PLACEHOLDERS }], target: () => 'welcome_message',
      async load(p, ctx) { return { prev: (await ctx.botDb.settings.get(G(ctx))).welcome_message }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { welcome_message: p.text }, by(ctx)); return { message: 'عُدّل النص', undo: b.prev ? { action: 'welcome.set_message', params: { text: b.prev } } : { action: 'welcome.reset_message', params: {} } }; },
      async verify(p, ctx) { return { ok: (await ctx.botDb.settings.get(G(ctx))).welcome_message === p.text }; } },
    { id: 'reset_message', label: 'إعادة نص الترحيب للافتراضي', icon: 'rotate', group: 'الرسالة', danger: 'low', reversible: true, requires: need, apply: LIVE, description: 'welcome_message=NULL', effect: 'يستخدم البوت النص الافتراضي', fields: [],
      async load(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); if (!s.welcome_message) throw E.conflict('النص افتراضي أصلاً'); return { prev: s.welcome_message }; },
      async execute(p, ctx, b) { await ctx.botDb.settings.update(G(ctx), { welcome_message: null }, by(ctx)); return { message: 'أُعيد النص الافتراضي', undo: { action: 'welcome.set_message', params: { text: b.prev } } }; },
      async verify(p, ctx) { return { ok: !(await ctx.botDb.settings.get(G(ctx))).welcome_message }; } },
    { id: 'preview', label: 'معاينة رسالة الترحيب', icon: 'eye', group: 'الرسالة', kind: 'read', danger: 'low', requires: need, description: 'يطبّق متغيرات النص على عضو افتراضي (لا يُرسل شيئاً)', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); const g = await ctx.discord.guild(); const tpl = (s.welcome_message && s.welcome_message.trim()) || '(النص الافتراضي للبوت)'; return { message: 'معاينة', data: { text: tpl.replace(/\{(يوزر|user)\}/gi, '@عضو-جديد').replace(/\{(السيرفر|server)\}/gi, g.name).replace(/\{(العدد|count)\}/gi, String(g.approximate_member_count || '')).slice(0, 2000), imageChannel: s.welcome_channel_id, textChannel: s.welcome_message_channel_id || s.welcome_channel_id } }; } },
    { id: 'send_test', label: 'إرسال اختبار نصي لقناة الترحيب', icon: 'send', group: 'الاختبار', danger: 'low', reversible: true, requires: need, description: 'يرسل نص الترحيب (بعد تطبيق المتغيرات) بوسم «اختبار» — لا يولّد بطاقة الصورة (تُولَّد داخل البوت)', effect: 'تظهر رسالة اختبار في قناة الترحيب', fields: [],
      async load(p, ctx) { const s = await ctx.botDb.settings.get(G(ctx)); const ch = s.welcome_message_channel_id || s.welcome_channel_id; if (!ch) throw E.conflict('لا توجد قناة ترحيب'); return { ch, tpl: s.welcome_message || '' }; },
      async execute(p, ctx, b) { const g = await ctx.discord.guild(); const txt = (b.tpl.trim() || 'أهلاً {يوزر} في {السيرفر}!').replace(/\{(يوزر|user)\}/gi, '`عضو-تجريبي`').replace(/\{(السيرفر|server)\}/gi, g.name).replace(/\{(العدد|count)\}/gi, String(g.approximate_member_count || '')); const m = await ctx.discord.sendMessage(b.ch, { content: `🧪 **اختبار الترحيب (من لوحة الإدارة)**\n${txt}`.slice(0, 2000), allowed_mentions: { parse: [] } }); return { message: 'أُرسل الاختبار', _id: m.id, _ch: b.ch, undo: { action: 'server.delete_message', params: { channelId: b.ch, messageId: m.id } } }; },
      async verify(p, ctx, b, r) { const m = await ctx.discord.getMessage(r._ch, r._id); return { ok: !!m.id, after: { messageId: m.id } }; } }
  ]
};

const admins = {
  id: 'admins', workspace: 'discord', label: 'مشرفو البوت', icon: 'badge', adminDefault: false, description: 'أعضاء/رتب الإدارة المعتمدة داخل البوت (bot_admin_config)',
  views: [{ id: 'list', label: 'قائمة الإدارة', requires: need, source: 'قاعدة البوت: bot_admin_config', columns: [{ key: 'type', label: 'النوع' }, { key: 'discord_id', label: 'المعرّف', mono: true }, { key: 'added_by', label: 'أضافه', mono: true }, { key: 'added_at', label: 'التاريخ', type: 'date' }],
    async fetch(q, ctx) { return { rows: (await ctx.botDb.admins.list(G(ctx))).map((r) => ({ id: `${r.type}-${r.discord_id}`, ...r, type: r.type === 'role' ? 'رتبة' : 'عضو' })) }; } },
  { id: 'log', label: 'سجل الإشراف', requires: need, source: 'قاعدة البوت: moderation_log', columns: [{ key: 'action', label: 'الإجراء' }, { key: 'target_id', label: 'الهدف', mono: true }, { key: 'moderator_id', label: 'المشرف', mono: true }, { key: 'reason', label: 'السبب' }, { key: 'created_at', label: 'الوقت', type: 'date' }],
    async fetch(q, ctx) { return { rows: await ctx.botDb.moderation.log(G(ctx), { limit: pageSize(q) }) }; } }],
  actions: ['user', 'role'].flatMap((type) => {
    const label = type === 'user' ? 'عضو' : 'رتبة';
    const f = type === 'user' ? SNOW('id', 'العضو', { optionsFrom: 'members' }) : SNOW('id', 'الرتبة', { optionsFrom: 'roles' });
    return [
      { id: `add_${type}`, label: `إضافة ${label} إداري`, icon: 'plus', group: label, danger: 'high', reversible: true, reasonRequired: true, requires: need, apply: 'ttl', description: 'INSERT في bot_admin_config — يلتقطها كاش صلاحيات البوت خلال 10 دقائق كحد أقصى', effect: `يمنح ${label === 'عضو' ? 'العضو' : 'أصحاب الرتبة'} صلاحيات أوامر الإدارة في البوت`, fields: [f], target: (p) => p.id,
        async load(p, ctx) { if (type === 'user') { const g = await ctx.discord.guild(); await ctx.discord.member(p.id); void g; } else if (!(await ctx.discord.roles()).some((r) => r.id === p.id)) throw E.notFound('الرتبة غير موجودة'); const l = await ctx.botDb.admins.list(G(ctx)); if (l.some((r) => r.type === type && r.discord_id === p.id)) throw E.conflict('موجود في قائمة الإدارة أصلاً'); return {}; },
        async execute(p, ctx) { const ok = await ctx.botDb.admins.add(G(ctx), type, p.id, by(ctx)); if (!ok) throw E.conflict('موجود أصلاً'); const lv = await applyLive(ctx, (c) => c.reload('adminPermissions')); return { message: `أُضيف ${label} للإدارة${lv.live ? ' — طُبّق في البوت فوراً' : ''}`, pending: lv.live ? undefined : `يطبّقه البوت خلال 10 دقائق (كاش الصلاحيات) أو عند إعادة تشغيله${lv.reason ? ` (تعذّر التطبيق الحي: ${lv.reason})` : ''}`, undo: { action: `admins.remove_${type}`, params: { id: p.id } } }; },
        async verify(p, ctx) { const l = await ctx.botDb.admins.list(G(ctx)); return { ok: l.some((r) => r.type === type && r.discord_id === p.id), after: { admins: l.length } }; } },
      { id: `remove_${type}`, label: `إزالة ${label} إداري`, icon: 'minus', group: label, danger: 'high', reversible: true, reasonRequired: true, requires: need, apply: 'ttl', description: 'DELETE من bot_admin_config', effect: 'يفقد صلاحيات الإدارة في البوت (بعد انتهاء الكاش)', fields: [f], target: (p) => p.id,
        async load(p, ctx) { const l = await ctx.botDb.admins.list(G(ctx)); if (!l.some((r) => r.type === type && r.discord_id === p.id)) throw E.notFound('غير موجود في قائمة الإدارة'); return {}; },
        async execute(p, ctx) { await ctx.botDb.admins.remove(G(ctx), type, p.id); const lv = await applyLive(ctx, (c) => c.reload('adminPermissions')); return { message: `أُزيل ${label} من الإدارة${lv.live ? ' — طُبّق في البوت فوراً' : ''}`, pending: lv.live ? undefined : `يطبّقه البوت خلال 10 دقائق (كاش الصلاحيات) أو عند إعادة تشغيله${lv.reason ? ` (تعذّر التطبيق الحي: ${lv.reason})` : ''}`, undo: { action: `admins.add_${type}`, params: { id: p.id } } }; },
        async verify(p, ctx) { const l = await ctx.botDb.admins.list(G(ctx)); return { ok: !l.some((r) => r.type === type && r.discord_id === p.id), after: { admins: l.length } }; } }
    ];
  })
};

const PLAT = [{ value: 'tiktok', label: 'TikTok' }, { value: 'twitch', label: 'Twitch' }, { value: 'youtube', label: 'YouTube' }, { value: 'kick', label: 'Kick' }];
const RESTART = 'يحمّل البوت قائمة الستريمرز في الذاكرة عند الإقلاع فقط — لن تُفعَّل التغييرات في البوت الجاري حتى إعادة تشغيله (لا يوجد API تحميل خارجي)';
const SU = [{ name: 'platform', label: 'المنصة', type: 'select', required: true, options: PLAT }, { name: 'username', label: 'اليوزر', type: 'text', required: true, max: 100 }];
const sNorm = (u) => normUsername(u).replace(/^@/, '').replace(/[^\p{L}\p{N}_.-]/gu, '');
async function loadS(p, ctx, mustExist) { const n = sNorm(p.username); if (!n) throw E.invalid('يوزر غير صالح'); const row = await ctx.botDb.streamers.get(G(ctx), p.platform, n); if (mustExist && !row) throw E.notFound('الستريمر غير مسجّل في قائمة إعلانات البوت'); if (!mustExist && row) throw E.conflict('مسجّل مسبقاً على نفس المنصة'); return { n, row }; }
const liveStreamers = (ctx) => applyLive(ctx, (c) => c.reloadStreamers());
const pendingStreamers = (lv) => (lv.live ? undefined : `${RESTART}${lv.reason ? ` (تعذّر التطبيق الحي: ${lv.reason})` : ''}`);
const dbstreamers = {
  id: 'dstreamers', workspace: 'discord', label: 'ستريمرات إعلان البوت', icon: 'broadcast', adminDefault: false, description: 'قائمة الستريمرات المسجلة للإعلان التلقائي عن البث (قاعدة البوت)',
  views: [{ id: 'list', label: 'الستريمرات المسجّلون', requires: need, source: 'قاعدة البوت: streamer_announcements', columns: [{ key: 'platform', label: 'المنصة' }, { key: 'username', label: 'اليوزر' }, { key: 'enabled', label: 'الإعلان' }, { key: 'added_by', label: 'أضافه', mono: true }, { key: 'created_at', label: 'التسجيل', type: 'date' }],
    async fetch(q, ctx) { const t = normUsername(q.q); return { rows: (await ctx.botDb.streamers.list(G(ctx))).filter((r) => !t || r.normalized_username.includes(t)).map((r) => ({ ...r, enabled: r.enabled ? '🟢 مفعّل' : '⛔ معطّل' })) }; } },
  { id: 'events', label: 'سجل إعلانات البث', requires: need, source: 'قاعدة البوت: streamer_announcement_events', columns: [{ key: 'platform', label: 'المنصة' }, { key: 'normalized_username', label: 'الستريمر' }, { key: 'status', label: 'الحالة' }, { key: 'attempts', label: 'المحاولات' }, { key: 'started_at', label: 'بدأ', type: 'date' }, { key: 'announced_at', label: 'أُعلن', type: 'date' }, { key: 'error_code', label: 'الخطأ' }],
    async fetch(q, ctx) { return { rows: await ctx.botDb.streamers.events({ limit: pageSize(q, 50), username: normUsername(q.q) || undefined }), meta: { stats: await ctx.botDb.streamers.eventStats() } }; } }],
  actions: [
    { id: 'add', label: 'إضافة ستريمر لإعلانات البوت', icon: 'plus', group: 'القائمة', danger: 'medium', reversible: true, requires: need, apply: 'restart', description: 'INSERT في streamer_announcements (نفس استعلام أمر /اضافة ستريمر). ' + RESTART, effect: 'يُحفظ الستريمر في قاعدة البوت', fields: SU, target: (p) => `${p.platform}:${p.username}`, load: (p, ctx) => loadS(p, ctx, false),
      async execute(p, ctx, b) { const ok = await ctx.botDb.streamers.add({ guildId: G(ctx), platform: p.platform, username: p.username.trim(), normalized: b.n, addedBy: by(ctx) }); if (!ok) throw E.conflict('مسجّل مسبقاً'); const lv = await liveStreamers(ctx); return { message: lv.live ? 'حُفظ في قاعدة البوت — طُبّق في البوت فوراً' : 'حُفظ في قاعدة البوت', pending: pendingStreamers(lv), undo: { action: 'dstreamers.remove', params: p } }; },
      async verify(p, ctx, b) { const r = await ctx.botDb.streamers.get(G(ctx), p.platform, b.n); return { ok: !!r && r.enabled, after: { saved: !!r } }; } },
    { id: 'remove', label: 'إزالة ستريمر من القائمة', icon: 'trash', group: 'القائمة', danger: 'high', reversible: true, reasonRequired: true, requires: need, apply: 'restart', description: 'DELETE من streamer_announcements. ' + RESTART, effect: 'يُحذف من قاعدة البوت (سجل الإعلانات السابقة يبقى)', fields: SU, target: (p) => `${p.platform}:${p.username}`, load: (p, ctx) => loadS(p, ctx, true),
      async execute(p, ctx, b) { await ctx.botDb.streamers.remove(G(ctx), p.platform, b.n); const lv = await liveStreamers(ctx); return { message: lv.live ? 'حُذف من قاعدة البوت — طُبّق في البوت فوراً' : 'حُذف من قاعدة البوت', pending: pendingStreamers(lv), undo: { action: 'dstreamers.add', params: p } }; },
      async verify(p, ctx, b) { return { ok: !(await ctx.botDb.streamers.get(G(ctx), p.platform, b.n)), after: { saved: false } }; } },
    { id: 'disable', label: 'تعطيل إشعارات البث لستريمر', icon: 'bellx', group: 'الإشعارات', danger: 'medium', reversible: true, requires: need, apply: 'restart', description: 'enabled=0. ' + RESTART, effect: 'لا يُعلن البوت عن بثه بعد تطبيق التغيير', fields: SU, target: (p) => `${p.platform}:${p.username}`,
      async load(p, ctx) { const b = await loadS(p, ctx, true); if (!b.row.enabled) throw E.conflict('معطّل أصلاً'); return b; },
      async execute(p, ctx, b) { await ctx.botDb.streamers.setEnabled(G(ctx), p.platform, b.n, false); const lv = await liveStreamers(ctx); return { message: lv.live ? 'عُطّلت الإشعارات في القاعدة — طُبّق في البوت فوراً' : 'عُطّلت الإشعارات في القاعدة', pending: pendingStreamers(lv), undo: { action: 'dstreamers.enable', params: p } }; },
      async verify(p, ctx, b) { return { ok: (await ctx.botDb.streamers.get(G(ctx), p.platform, b.n))?.enabled === false }; } },
    { id: 'enable', label: 'تفعيل إشعارات البث لستريمر', icon: 'bell', group: 'الإشعارات', danger: 'medium', reversible: true, requires: need, apply: 'restart', description: 'enabled=1. ' + RESTART, effect: 'يُعلن البوت عن بثه بعد تطبيق التغيير', fields: SU, target: (p) => `${p.platform}:${p.username}`,
      async load(p, ctx) { const b = await loadS(p, ctx, true); if (b.row.enabled) throw E.conflict('مفعّل أصلاً'); return b; },
      async execute(p, ctx, b) { await ctx.botDb.streamers.setEnabled(G(ctx), p.platform, b.n, true); const lv = await liveStreamers(ctx); return { message: lv.live ? 'فُعّلت الإشعارات في القاعدة — طُبّق في البوت فوراً' : 'فُعّلت الإشعارات في القاعدة', pending: pendingStreamers(lv), undo: { action: 'dstreamers.disable', params: p } }; },
      async verify(p, ctx, b) { return { ok: (await ctx.botDb.streamers.get(G(ctx), p.platform, b.n))?.enabled === true }; } },
    { id: 'set_username', label: 'تعديل اليوزر المرتبط', icon: 'edit', group: 'التعديل', danger: 'medium', reversible: true, requires: need, apply: 'restart', description: RESTART, effect: 'يتغير اليوزر المراقَب', fields: [...SU, { name: 'newUsername', label: 'اليوزر الجديد', type: 'text', required: true, max: 100 }], target: (p) => `${p.username}→${p.newUsername}`,
      async load(p, ctx) { const b = await loadS(p, ctx, true); const nn = sNorm(p.newUsername); if (!nn) throw E.invalid('يوزر جديد غير صالح'); if (await ctx.botDb.streamers.get(G(ctx), p.platform, nn)) throw E.conflict('اليوزر الجديد مسجّل مسبقاً'); return { ...b, nn }; },
      async execute(p, ctx, b) { await ctx.botDb.streamers.setUsername(G(ctx), p.platform, b.n, p.newUsername.trim(), b.nn); const lv = await liveStreamers(ctx); return { message: lv.live ? 'عُدّل اليوزر — طُبّق في البوت فوراً' : 'عُدّل اليوزر', pending: pendingStreamers(lv), undo: { action: 'dstreamers.set_username', params: { platform: p.platform, username: p.newUsername, newUsername: p.username } } }; },
      async verify(p, ctx, b) { return { ok: !!(await ctx.botDb.streamers.get(G(ctx), p.platform, b.nn)) && !(await ctx.botDb.streamers.get(G(ctx), p.platform, b.n)) }; } },
    { id: 'set_platform', label: 'تغيير المنصة المرتبطة', icon: 'swap', group: 'التعديل', danger: 'medium', reversible: true, requires: need, apply: 'restart', description: RESTART, effect: 'تتغير المنصة المراقَبة لهذا اليوزر', fields: [...SU, { name: 'newPlatform', label: 'المنصة الجديدة', type: 'select', required: true, options: PLAT }], target: (p) => `${p.platform}→${p.newPlatform}`,
      async load(p, ctx) { if (p.platform === p.newPlatform) throw E.conflict('المنصة مطابقة'); const b = await loadS(p, ctx, true); if (await ctx.botDb.streamers.get(G(ctx), p.newPlatform, b.n)) throw E.conflict('مسجّل على المنصة الجديدة مسبقاً'); return b; },
      async execute(p, ctx, b) { await ctx.botDb.streamers.setPlatform(G(ctx), p.platform, b.n, p.newPlatform); const lv = await liveStreamers(ctx); return { message: lv.live ? 'غُيّرت المنصة — طُبّق في البوت فوراً' : 'غُيّرت المنصة', pending: pendingStreamers(lv), undo: { action: 'dstreamers.set_platform', params: { platform: p.newPlatform, username: p.username, newPlatform: p.platform } } }; },
      async verify(p, ctx, b) { return { ok: !!(await ctx.botDb.streamers.get(G(ctx), p.newPlatform, b.n)) }; } },
    { id: 'check_link', label: 'فحص حالة ربط الستريمر', icon: 'activity', group: 'الفحص', kind: 'read', danger: 'low', requires: need, description: 'يقارن تسجيله في البوت مع بوابة الموقع وآخر إعلانات البث', effect: 'قراءة فقط', fields: SU, target: (p) => `${p.platform}:${p.username}`,
      async execute(p, ctx) { const n = sNorm(p.username); const row = await ctx.botDb.streamers.get(G(ctx), p.platform, n); const ev = await ctx.botDb.streamers.events({ limit: 5, platform: p.platform, username: n }); let site = null; if (ctx.fb.available) { const s = await ctx.fb.db().collection('bridgeStreamers').doc(n).get(); site = s.exists ? { enabled: s.data().enabled !== false } : { registered: false }; } return { message: row ? 'مسجّل في البوت' : 'غير مسجّل في البوت', data: { bot: row && { enabled: row.enabled }, siteBridge: site, lastEvents: ev } }; } },
    { id: 'notification_log', label: 'سجل إشعارات البث المرسلة', icon: 'history', group: 'الفحص', kind: 'read', danger: 'low', requires: need, description: 'آخر 100 حلقة بث ونتيجة إعلانها (sent/failed/unknown/skipped)', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const ev = await ctx.botDb.streamers.events({ limit: 100 }); return { message: `${ev.length} حلقة`, data: ev }; } }
  ]
};

const botdb = {
  id: 'botdb', workspace: 'discord', label: 'قاعدة بيانات البوت', icon: 'database', adminDefault: false, description: 'حالة قاعدة البوت وتصدير جداولها (لا SQL مباشر)',
  views: [{ id: 'status', label: 'الحالة والأعداد', requires: ['botDb'], source: 'قاعدة البوت', columns: [{ key: 'field', label: 'البند' }, { key: 'value', label: 'القيمة' }],
    async fetch(q, ctx) { const ping = await ctx.botDb.ping(); const c = await ctx.botDb.counts.all(); return { rows: [['النوع', ping.dialect], ['زمن الاستجابة', ping.ms + 'ms'], ...Object.entries(c).map(([k, v]) => [k, v ?? 'غير متاح'])].map(([field, value]) => ({ id: field, field, value: String(value) })) }; } }],
  actions: ['warnings', 'moderation_log', 'tickets', 'auto_replies'].map((t) => ({
    id: `export_${t}`, label: `تصدير ${{ warnings: 'التحذيرات', moderation_log: 'سجل الإشراف', tickets: 'التكتات', auto_replies: 'الردود التلقائية' }[t]} (JSON)`, icon: 'download', group: 'التصدير', kind: 'read', danger: 'low', requires: need, fields: [], description: `قراءة آمنة لجدول ${t} عبر طبقة خدمات محددة`, effect: 'قراءة فقط',
    async execute(p, ctx) { const g = G(ctx); const rows = t === 'warnings' ? await ctx.botDb.warnings.list(g, { limit: 5000 }) : t === 'moderation_log' ? await ctx.botDb.moderation.log(g, { limit: 5000 }) : t === 'tickets' ? await ctx.botDb.tickets.list(g, { limit: 5000 }) : await ctx.botDb.autoReplies.list(g); return { message: `${rows.length} سجل`, download: { filename: `bot-${t}.json`, mime: 'application/json', text: JSON.stringify(rows, null, 2) } }; }
  }))
};

export default [automod, tickets, welcome, admins, dbstreamers, botdb];
