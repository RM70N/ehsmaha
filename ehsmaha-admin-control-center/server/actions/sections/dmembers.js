import { E } from '../../lib/errors.js';
import { pageSize } from '../siteHelpers.js';

const UID = { name: 'userId', label: 'العضو', type: 'snowflake', required: true, optionsFrom: 'members' };
const ROLE = { name: 'roleId', label: 'الرتبة', type: 'snowflake', required: true, optionsFrom: 'roles' };
const rs = (ctx) => `[لوحة الإدارة] ${ctx.actor.display}: ${ctx.reason}`.slice(0, 400);

// حماية: لا نُجري عقوبات على مالك السيرفر ولا على البوت نفسه، ويُعرض العضو قبل التنفيذ
async function target(ctx, userId) {
  const [g, me] = await Promise.all([ctx.discord.guild(), ctx.discord.me()]);
  if (userId === g.owner_id) throw E.forbidden('لا يمكن تنفيذ إجراء على مالك السيرفر');
  if (userId === me.id) throw E.forbidden('لا يمكن تنفيذ إجراء على البوت نفسه');
  return { g, me };
}
async function loadMember(p, ctx) { await target(ctx, p.userId); const m = await ctx.discord.member(p.userId); return { id: m.user.id, name: m.user.username, nick: m.nick, roles: m.roles, timeoutUntil: m.communication_disabled_until }; }
const goneAfter = async (p, ctx) => { try { await ctx.discord.member(p.userId); return { ok: false, message: 'العضو ما زال في السيرفر' }; } catch (e) { return { ok: e.status === 404, after: { inGuild: false }, message: e.message }; } };
const parseIds = (txt) => [...new Set(String(txt).split(/[\s,،]+/).filter(Boolean))];

const BULK_ACTIONS = [{ value: 'timeout', label: 'Timeout' }, { value: 'kick', label: 'طرد' }, { value: 'ban', label: 'حظر' }, { value: 'add_role', label: 'إضافة رتبة' }, { value: 'remove_role', label: 'إزالة رتبة' }];
async function bulkPlan(p, ctx) {
  const ids = parseIds(p.userIds); if (!ids.length) throw E.invalid('القائمة فارغة'); if (ids.length > 25) throw E.invalid('الحد 25 عضواً في العملية الواحدة');
  if (ids.some((i) => !/^\d{16,21}$/.test(i))) throw E.invalid('معرّفات غير صالحة في القائمة');
  const { g, me } = await target(ctx, '0'); const found = [], missing = [];
  for (const id of ids) { if (id === g.owner_id || id === me.id) { missing.push({ id, why: 'محمي' }); continue; } try { const m = await ctx.discord.member(id); found.push({ id, name: m.user.username }); } catch (e) { missing.push({ id, why: e.status === 404 ? 'ليس في السيرفر' : e.message }); } }
  return { found, missing, count: found.length };
}

export default {
  id: 'members', workspace: 'discord', label: 'أعضاء السيرفر', icon: 'users', adminDefault: false, description: 'عقوبات ورتب وألقاب الأعضاء، والإجراءات الجماعية بمعاينة وتأكيد',
  views: [
    {
      id: 'bans', label: 'المحظورون', requires: ['discordGuild'], search: true, source: 'Discord API /bans',
      columns: [{ key: 'name', label: 'العضو' }, { key: 'id', label: 'المعرّف', mono: true }, { key: 'reason', label: 'السبب' }],
      async fetch(q, ctx) { const t = (q.q || '').toLowerCase(); return { rows: (await ctx.discord.bans(undefined, 200)).filter((b) => !t || b.user.username.toLowerCase().includes(t) || b.user.id === q.q).map((b) => ({ id: b.user.id, name: b.user.username, reason: b.reason || '—' })) }; }
    },
    {
      id: 'warnings', label: 'التحذيرات (قاعدة البوت)', requires: ['botDb', 'discordGuild'], search: true, source: 'قاعدة البوت: warnings',
      columns: [{ key: 'discord_id', label: 'العضو', mono: true }, { key: 'reason', label: 'السبب' }, { key: 'issued_by', label: 'بواسطة', mono: true }, { key: 'issued_at', label: 'التاريخ', type: 'date' }, { key: 'warning_role_given', label: 'رتبة التحذير' }],
      async fetch(q, ctx) { const r = await ctx.botDb.warnings.list(ctx.guildId(), { member: /^\d{16,21}$/.test(q.q || '') ? q.q : undefined, limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q) }); return { rows: r, total: await ctx.botDb.warnings.count(ctx.guildId()) }; }
    },
    {
      id: 'modlog', label: 'سجل الإشراف (قاعدة البوت)', requires: ['botDb', 'discordGuild'], source: 'قاعدة البوت: moderation_log',
      columns: [{ key: 'action', label: 'الإجراء' }, { key: 'target_id', label: 'الهدف', mono: true }, { key: 'moderator_id', label: 'المشرف', mono: true }, { key: 'reason', label: 'السبب' }, { key: 'created_at', label: 'الوقت', type: 'date' }],
      async fetch(q, ctx) { return { rows: await ctx.botDb.moderation.log(ctx.guildId(), { limit: pageSize(q), offset: (Number(q.page) || 0) * pageSize(q), target: /^\d{16,21}$/.test(q.q || '') ? q.q : undefined }) }; }
    }
  ],
  actions: [
    {
      id: 'kick', label: 'طرد عضو', icon: 'kick', group: 'العقوبات', danger: 'high', reversible: false, reasonRequired: true, requires: ['discordGuild'], description: 'طرد عبر Discord API (يستطيع العودة برابط دعوة)', effect: 'يُزال العضو من السيرفر فوراً', fields: [UID], target: (p) => p.userId, load: loadMember,
      async execute(p, ctx, b) { await ctx.discord.kick(p.userId, rs(ctx)); return { message: `طُرد ${b.name}` }; }, verify: goneAfter
    },
    {
      id: 'ban', label: 'حظر عضو', icon: 'ban', group: 'العقوبات', danger: 'critical', reversible: true, reasonRequired: true, requires: ['discordGuild'], description: 'حظر دائم (يمكن فكّه)', effect: 'يُحظر العضو ولا يعود حتى فك الحظر',
      fields: [UID, { name: 'deleteDays', label: 'حذف رسائل آخر (أيام)', type: 'integer', min: 0, max: 7, default: 0, required: true }], target: (p) => p.userId, load: loadMember,
      async execute(p, ctx, b) { await ctx.discord.ban(p.userId, { reason: rs(ctx), deleteSeconds: p.deleteDays * 86400 }); return { message: `حُظر ${b.name}`, undo: { action: 'members.unban', params: { userId: p.userId } } }; },
      async verify(p, ctx) { try { await ctx.discord.getBan(p.userId); return { ok: true, after: { banned: true } }; } catch (e) { return { ok: false, message: 'Discord لا يُظهر الحظر عند القراءة: ' + e.message }; } }
    },
    {
      id: 'unban', label: 'فك حظر عضو', icon: 'unlock', group: 'العقوبات', danger: 'medium', reversible: false, reasonRequired: true, requires: ['discordGuild'], description: 'إزالة الحظر', effect: 'يستطيع العضو الانضمام مجدداً', fields: [{ name: 'userId', label: 'معرّف العضو المحظور', type: 'snowflake', required: true }], target: (p) => p.userId,
      async load(p, ctx) { const b = await ctx.discord.getBan(p.userId).catch((e) => { throw e.status === 404 ? E.conflict('العضو غير محظور') : e; }); return { user: b.user.username, reason: b.reason }; },
      async execute(p, ctx, b) { await ctx.discord.unban(p.userId, rs(ctx)); return { message: `فُكّ حظر ${b.user}` }; },
      async verify(p, ctx) { try { await ctx.discord.getBan(p.userId); return { ok: false, message: 'الحظر ما زال قائماً' }; } catch (e) { return { ok: e.status === 404, after: { banned: false } }; } }
    },
    {
      id: 'timeout', label: 'تطبيق Timeout لمدة', icon: 'clock', group: 'العقوبات', danger: 'high', reversible: true, reasonRequired: true, requires: ['discordGuild'], description: 'communication_disabled_until (حتى 28 يوماً)', effect: 'لا يستطيع العضو الكتابة/التحدث طوال المدة',
      fields: [UID, { name: 'minutes', label: 'المدة (دقائق)', type: 'integer', required: true, min: 1, max: 40320, default: 60 }], target: (p) => `${p.userId} (${p.minutes}د)`, load: loadMember,
      async execute(p, ctx, b) { const until = new Date(Date.now() + p.minutes * 60_000).toISOString(); await ctx.discord.patchMember(p.userId, { communication_disabled_until: until }, rs(ctx)); return { message: `Timeout لـ${b.name} ${p.minutes} دقيقة`, undo: { action: 'members.untimeout', params: { userId: p.userId } }, _until: until }; },
      async verify(p, ctx) { const m = await ctx.discord.member(p.userId); return { ok: !!m.communication_disabled_until && new Date(m.communication_disabled_until) > new Date(), after: { until: m.communication_disabled_until } }; }
    },
    {
      id: 'untimeout', label: 'إزالة Timeout', icon: 'unlock', group: 'العقوبات', danger: 'medium', reversible: false, requires: ['discordGuild'], description: 'إلغاء كتم المدة', effect: 'يعود العضو للكتابة فوراً', fields: [UID], target: (p) => p.userId,
      async load(p, ctx) { const b = await loadMember(p, ctx); if (!b.timeoutUntil || new Date(b.timeoutUntil) < new Date()) throw E.conflict('العضو ليس عليه Timeout'); return b; },
      async execute(p, ctx, b) { await ctx.discord.patchMember(p.userId, { communication_disabled_until: null }, rs(ctx)); return { message: `أُزيل Timeout عن ${b.name}` }; },
      async verify(p, ctx) { const m = await ctx.discord.member(p.userId); return { ok: !m.communication_disabled_until, after: { until: null } }; }
    },
    {
      id: 'add_role', label: 'إضافة رتبة لعضو', icon: 'plus', group: 'الرتب والألقاب', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'لا تتجاوز هرمية رتب البوت', effect: 'يحصل العضو على صلاحيات الرتبة', fields: [UID, ROLE], target: (p) => `${p.userId} +${p.roleId}`,
      async load(p, ctx) { const b = await loadMember(p, ctx); if (b.roles.includes(p.roleId)) throw E.conflict('العضو يملك الرتبة أصلاً'); const r = (await ctx.discord.roles()).find((x) => x.id === p.roleId); if (!r) throw E.notFound('الرتبة غير موجودة'); if (r.managed) throw E.invalid('رتبة تديرها خدمة (بوت/تعزيز)'); return { ...b, roleName: r.name }; },
      async execute(p, ctx, b) { await ctx.discord.addRole(p.userId, p.roleId, rs(ctx)); return { message: `أُضيفت «${b.roleName}» لـ${b.name}`, undo: { action: 'members.remove_role', params: p } }; },
      async verify(p, ctx) { const m = await ctx.discord.member(p.userId); return { ok: m.roles.includes(p.roleId), after: { roles: m.roles.length } }; }
    },
    {
      id: 'remove_role', label: 'إزالة رتبة من عضو', icon: 'minus', group: 'الرتب والألقاب', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'إزالة رتبة', effect: 'يفقد العضو صلاحيات الرتبة', fields: [UID, ROLE], target: (p) => `${p.userId} -${p.roleId}`,
      async load(p, ctx) { const b = await loadMember(p, ctx); if (!b.roles.includes(p.roleId)) throw E.conflict('العضو لا يملك هذه الرتبة'); return b; },
      async execute(p, ctx, b) { await ctx.discord.removeRole(p.userId, p.roleId, rs(ctx)); return { message: `أُزيلت الرتبة من ${b.name}`, undo: { action: 'members.add_role', params: p } }; },
      async verify(p, ctx) { const m = await ctx.discord.member(p.userId); return { ok: !m.roles.includes(p.roleId), after: { roles: m.roles.length } }; }
    },
    {
      id: 'set_nick', label: 'تغيير لقب عضو', icon: 'edit', group: 'الرتب والألقاب', danger: 'low', reversible: true, requires: ['discordGuild'], description: 'الاسم المستعار داخل السيرفر (فارغ = إزالة اللقب)', effect: 'يتغير لقب العضو',
      fields: [UID, { name: 'nick', label: 'اللقب الجديد (اتركه فارغاً للإزالة)', type: 'text', max: 32 }], target: (p) => p.userId, load: loadMember,
      async execute(p, ctx, b) { await ctx.discord.patchMember(p.userId, { nick: p.nick || null }, rs(ctx)); return { message: 'تم تغيير اللقب', undo: { action: 'members.set_nick', params: { userId: p.userId, nick: b.nick || undefined } } }; },
      async verify(p, ctx) { const m = await ctx.discord.member(p.userId); return { ok: (m.nick || '') === (p.nick || ''), after: { nick: m.nick } }; }
    },
    {
      id: 'warning_history', label: 'عرض سجل مخالفات وعقوبات عضو', icon: 'history', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['botDb', 'discordGuild'], description: 'تحذيرات وإجراءات إشراف مسجّلة في قاعدة البوت + مخالفات الحماية', effect: 'قراءة فقط', fields: [UID], target: (p) => p.userId,
      async execute(p, ctx) { const g = ctx.guildId(); const [w, m, v] = await Promise.all([ctx.botDb.warnings.list(g, { member: p.userId, limit: 50 }), ctx.botDb.moderation.log(g, { target: p.userId, limit: 50 }), ctx.botDb.automod.violations(g, 500).then((x) => x.filter((r) => r.discord_id === p.userId))]); return { message: `${w.length} تحذير · ${m.length} إجراء · ${v.length} مخالفة آلية`, data: { warnings: w, moderation: m, automod: v } }; }
    },
    {
      id: 'bulk_preview', label: 'معاينة قائمة أعضاء للإجراء الجماعي', icon: 'eye', group: 'الجماعي', kind: 'read', danger: 'low', requires: ['discordGuild'], description: 'يتحقق من كل معرّف: هل هو في السيرفر؟ هل هو محمي؟ — خطوة إلزامية قبل الإجراء الجماعي', effect: 'قراءة فقط',
      fields: [{ name: 'userIds', label: 'معرّفات الأعضاء (سطر/فاصلة)', type: 'textarea', required: true, max: 3000 }], target: () => 'bulk',
      async execute(p, ctx) { const plan = await bulkPlan(p, ctx); return { message: `${plan.count} عضو سيتأثرون · ${plan.missing.length} مستبعد`, data: plan }; }
    },
    {
      id: 'bulk_action', label: 'إجراء إداري على مجموعة أعضاء', icon: 'layers', group: 'الجماعي', danger: 'critical', reversible: false, reasonRequired: true, requires: ['discordGuild'],
      description: 'يُنفَّذ على كل عضو على حدة بنتيجة مستقلة. يلزم إدخال العدد المعروض في المعاينة (expectedCount) ليتطابق مع الواقع — حماية من الأخطاء', effect: 'يتأثر كل الأعضاء المعروضين في المعاينة',
      fields: [{ name: 'userIds', label: 'معرّفات الأعضاء', type: 'textarea', required: true, max: 3000 }, { name: 'op', label: 'الإجراء', type: 'select', required: true, options: BULK_ACTIONS }, { name: 'expectedCount', label: 'عدد المتأثرين المؤكد من المعاينة', type: 'integer', required: true, min: 1, max: 25 }, { name: 'minutes', label: 'مدة Timeout (دقائق)', type: 'integer', min: 1, max: 40320 }, { name: 'roleId', label: 'الرتبة (لعمليات الرتب)', type: 'snowflake', optionsFrom: 'roles' }], target: (p) => `${p.op} × ${p.expectedCount}`,
      async load(p, ctx) { if (p.op === 'timeout' && !p.minutes) throw E.invalid('حدد مدة Timeout'); if (/role/.test(p.op) && !p.roleId) throw E.invalid('حدد الرتبة'); const plan = await bulkPlan(p, ctx); if (plan.count !== p.expectedCount) throw E.conflict(`العدد الفعلي ${plan.count} لا يطابق المؤكد ${p.expectedCount} — أعد المعاينة`); return plan; },
      async execute(p, ctx, plan) {
        const out = [];
        for (const m of plan.found) { try { if (p.op === 'kick') await ctx.discord.kick(m.id, rs(ctx)); else if (p.op === 'ban') await ctx.discord.ban(m.id, { reason: rs(ctx) }); else if (p.op === 'timeout') await ctx.discord.patchMember(m.id, { communication_disabled_until: new Date(Date.now() + p.minutes * 60_000).toISOString() }, rs(ctx)); else if (p.op === 'add_role') await ctx.discord.addRole(m.id, p.roleId, rs(ctx)); else await ctx.discord.removeRole(m.id, p.roleId, rs(ctx)); out.push({ id: m.id, name: m.name, result: 'ok' }); } catch (e) { out.push({ id: m.id, name: m.name, result: 'failed', note: e.message }); } }
        return { message: `نجح ${out.filter((x) => x.result === 'ok').length} · فشل ${out.filter((x) => x.result === 'failed').length}`, detail: out, _out: out };
      },
      async verify(p, ctx, plan, r) {
        let bad = 0;
        for (const x of r._out.filter((y) => y.result === 'ok')) { try { const m = await ctx.discord.member(x.id); const okState = p.op === 'timeout' ? !!m.communication_disabled_until : p.op === 'add_role' ? m.roles.includes(p.roleId) : p.op === 'remove_role' ? !m.roles.includes(p.roleId) : false; if (!okState) bad++; } catch (e) { if (!(e.status === 404 && ['kick', 'ban'].includes(p.op))) bad++; } }
        return { ok: bad === 0 && r._out.some((x) => x.result === 'ok'), detail: r._out, after: { verified: r._out.filter((x) => x.result === 'ok').length - bad }, message: bad ? `${bad} عضو لم يتحقق تنفيذ الإجراء عليه` : 'لم ينجح أي عضو' };
      }
    }
  ]
};
