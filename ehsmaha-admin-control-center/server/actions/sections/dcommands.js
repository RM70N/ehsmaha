import { E } from '../../lib/errors.js';
import { now } from '../../lib/util.js';

const PERMS = { Administrator: 8n, ManageGuild: 32n, ManageRoles: 268435456n, ManageChannels: 16n, ManageMessages: 8192n, KickMembers: 2n, BanMembers: 4n, ModerateMembers: 1099511627776n };
const permOptions = Object.keys(PERMS).map((v) => ({ value: v, label: v }));
const NAME = { name: 'name', label: 'اسم الأمر', type: 'text', required: true, max: 64, optionsFrom: 'commands' };
const disabledCol = (ctx) => ctx.store.col('disabledCommands');

// الأوامر المسجّلة فعلياً عند Discord (سيرفر + عالمي) — مصدر الحقيقة لحالة التسجيل
async function registered(ctx) {
  const out = [];
  if (ctx.guildId()) for (const c of await ctx.discord.appCommands(ctx.guildId())) out.push({ ...c, scope: 'guild' });
  for (const c of await ctx.discord.appCommands()) out.push({ ...c, scope: 'global' });
  return out;
}
const find = async (ctx, name) => (await registered(ctx)).find((c) => c.name === name);
const rawBits = (c) => c.default_member_permissions ?? null;
const bodyOf = (c) => { const { id, application_id, version, guild_id, scope, type, ...rest } = c; return { ...rest, type: type || 1 }; };

async function setBits(ctx, c, bits) { await ctx.discord.patchAppCommand(c.id, { default_member_permissions: bits }, c.scope === 'guild' ? ctx.guildId() : undefined); }
const verifyBits = (want) => async (p, ctx) => { const c = await find(ctx, p.name); return { ok: !!c && rawBits(c) === want(p), after: { default_member_permissions: c ? rawBits(c) : 'غير مسجّل' }, message: 'قيمة الصلاحية عند Discord لا تطابق المطلوبة' }; };

export default {
  id: 'commands', workspace: 'discord', label: 'أوامر البوت', icon: 'terminal', adminDefault: false, description: 'سجل الأوامر الحقيقي (من ملفات البوت + Discord) والتحكم بتسجيلها وصلاحياتها',
  views: [
    {
      id: 'registry', label: 'سجل الأوامر', requires: ['botSource'], search: true, source: 'ملفات discord-bot/commands (قراءة فقط) + Discord API', placeholder: 'ابحث باسم الأمر أو تصنيفه',
      columns: [{ key: 'name', label: 'الأمر' }, { key: 'category', label: 'التصنيف' }, { key: 'description', label: 'الوصف' }, { key: 'options', label: 'الخيارات' }, { key: 'access', label: 'من يستخدمه' }, { key: 'state', label: 'الحالة' }, { key: 'file', label: 'الملف', mono: true }],
      async fetch(q, ctx) {
        const scan = ctx.botCommands(); let reg = null; try { if (ctx.discord.available && ctx.discord.appId) reg = await registered(ctx); } catch { reg = null; }
        const dis = new Set(disabledCol(ctx).list({ limit: 500 }).map((d) => d.id)); const t = (q.q || '').toLowerCase();
        const ACC = { owner: 'مالك البوت', administrator: 'Administrator', admin: 'إدارة البوت', public: 'الجميع' };
        return { rows: scan.commands.filter((c) => !t || `${c.name}${c.category}${c.description}`.toLowerCase().includes(t)).map((c) => ({ id: c.name, name: '/' + c.name, category: c.category, description: c.description || '—', options: [...c.options.map((o) => o.name + (o.required ? '*' : '')), ...c.subcommands.map((s) => 'فرعي:' + s.name)].join('، ') || '—', access: ACC[c.access], state: dis.has(c.name) ? '⛔ معطّل من اللوحة' : reg ? (reg.some((r) => r.name === c.name) ? '✅ مسجّل' : '⚠️ غير مسجّل في Discord') : '—', file: c.file })), meta: { discordChecked: !!reg, unparsed: scan.unparsed, note: 'عدد مرات الاستخدام وآخر خطأ لكل أمر محفوظان بذاكرة البوت فقط ولا يمكن قراءتهما من الخارج (راجع UNSUPPORTED-ACTIONS)' } };
      }
    },
    {
      id: 'discord', label: 'المسجّل فعلياً عند Discord', requires: ['discordGuild'], source: 'Discord API /applications/{id}/commands',
      columns: [{ key: 'name', label: 'الأمر' }, { key: 'scope', label: 'النطاق' }, { key: 'description', label: 'الوصف' }, { key: 'perm', label: 'default_member_permissions' }, { key: 'id', label: 'المعرّف', mono: true }],
      async fetch(q, ctx) { return { rows: (await registered(ctx)).map((c) => ({ id: c.id, name: '/' + c.name, scope: c.scope === 'guild' ? 'السيرفر' : 'عالمي', description: c.description, perm: c.default_member_permissions || 'الجميع' })) }; }
    },
    {
      id: 'disabled', label: 'الأوامر المعطّلة من اللوحة', requires: ['store'],
      columns: [{ key: 'name', label: 'الأمر' }, { key: 'scope', label: 'النطاق' }, { key: 'at', label: 'عُطّل', type: 'date' }, { key: 'by', label: 'بواسطة' }],
      async fetch(q, ctx) { return { rows: disabledCol(ctx).list({ limit: 200, orderBy: 'at' }).map((d) => ({ id: d.id, name: '/' + d.id, scope: d.scope, at: d.at, by: d.by })) }; }
    }
  ],
  actions: [
    {
      id: 'disable', label: 'تعطيل أمر (إلغاء تسجيله من Discord)', icon: 'ban', group: 'التسجيل', danger: 'high', reversible: true, reasonRequired: true, requires: ['discordGuild', 'store'],
      description: 'يحفظ تعريف الأمر الكامل ثم يحذفه من Discord فيختفي ولا يمكن لأحد استخدامه. إعادة التفعيل تعيد نفس التعريف. ملاحظة: يعيد البوت تسجيله عند إعادة التشغيل إن كان AUTO_REGISTER_COMMANDS=true',
      effect: 'يختفي الأمر من Discord فوراً (لا تُحذف أي بيانات)', fields: [NAME], target: (p) => '/' + p.name,
      async load(p, ctx) { const c = await find(ctx, p.name); if (!c) throw E.notFound('الأمر غير مسجّل عند Discord (معطّل أصلاً أو لم يُسجَّل)'); return { cmd: c, scope: c.scope }; },
      async execute(p, ctx, b) { disabledCol(ctx).set(p.name, { scope: b.scope, body: bodyOf(b.cmd), at: now(), by: ctx.actor.id, reason: ctx.reason }); await ctx.discord.deleteAppCommand(b.cmd.id, b.scope === 'guild' ? ctx.guildId() : undefined); return { message: `عُطّل /${p.name}`, detail: { warning: 'سيُعاد تسجيله عند إعادة تشغيل البوت ما لم يُضبط AUTO_REGISTER_COMMANDS=false' }, undo: { action: 'commands.enable', params: { name: p.name } } }; },
      async verify(p, ctx) { const c = await find(ctx, p.name); return { ok: !c, after: { registered: false }, message: 'الأمر ما زال مسجّلاً عند Discord' }; }
    },
    {
      id: 'enable', label: 'إعادة تفعيل أمر معطّل', icon: 'play', group: 'التسجيل', danger: 'medium', reversible: true, requires: ['discordGuild', 'store'], description: 'يعيد تسجيل نفس التعريف المحفوظ وقت التعطيل', effect: 'يظهر الأمر في Discord من جديد', fields: [NAME], target: (p) => '/' + p.name,
      async load(p, ctx) { const d = disabledCol(ctx).get(p.name); if (!d) throw E.notFound('لا يوجد تعريف محفوظ لهذا الأمر (لم يُعطَّل من اللوحة)'); if (await find(ctx, p.name)) { disabledCol(ctx).del(p.name); throw E.conflict('الأمر مسجّل أصلاً (أعاد البوت تسجيله)'); } return d; },
      async execute(p, ctx, d) { await ctx.discord.createAppCommand(d.body, d.scope === 'guild' ? ctx.guildId() : undefined); disabledCol(ctx).del(p.name); return { message: `فُعّل /${p.name}`, undo: { action: 'commands.disable', params: { name: p.name } } }; },
      async verify(p, ctx) { const c = await find(ctx, p.name); return { ok: !!c, after: { registered: !!c }, message: 'الأمر لم يظهر عند Discord بعد إعادة التسجيل' }; }
    },
    {
      id: 'restrict_permission', label: 'تقييد أمر بصلاحية Discord', icon: 'lock', group: 'الصلاحيات', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'يضبط default_member_permissions: يراه ويستخدمه من يملك الصلاحية فقط. (التقييد بـرتبة/روم محددة غير ممكن بتوكن البوت — راجع UNSUPPORTED-ACTIONS)', effect: 'يُخفى الأمر عمّن لا يملك الصلاحية',
      fields: [NAME, { name: 'permission', label: 'الصلاحية المطلوبة', type: 'select', required: true, options: permOptions }], target: (p) => `/${p.name} ← ${p.permission}`,
      async load(p, ctx) { const c = await find(ctx, p.name); if (!c) throw E.notFound('الأمر غير مسجّل عند Discord'); return { cmd: c, prev: rawBits(c) }; },
      async execute(p, ctx, b) { const bits = String(PERMS[p.permission]); await setBits(ctx, b.cmd, bits); return { message: `قُيّد /${p.name} بصلاحية ${p.permission}`, undo: { action: 'commands.restore_permission', params: { name: p.name, bits: b.prev || '' } } }; },
      verify: verifyBits((p) => String(PERMS[p.permission]))
    },
    {
      id: 'clear_restriction', label: 'إزالة تقييد الصلاحية عن أمر', icon: 'unlock', group: 'الصلاحيات', danger: 'medium', reversible: true, requires: ['discordGuild'], description: 'default_member_permissions=null (الأمر متاح للجميع على مستوى Discord؛ البوت يفحص الصلاحية داخلياً بنفسه)', effect: 'يظهر الأمر للجميع في قائمة Discord', fields: [NAME], target: (p) => '/' + p.name,
      async load(p, ctx) { const c = await find(ctx, p.name); if (!c) throw E.notFound('الأمر غير مسجّل عند Discord'); if (!rawBits(c)) throw E.conflict('الأمر غير مقيّد أصلاً'); return { cmd: c, prev: rawBits(c) }; },
      async execute(p, ctx, b) { await setBits(ctx, b.cmd, null); return { message: `أُزيل التقييد عن /${p.name}`, undo: { action: 'commands.restore_permission', params: { name: p.name, bits: b.prev } } }; },
      verify: verifyBits(() => null)
    },
    {
      id: 'restore_permission', hidden: true, label: 'استعادة صلاحية أمر (للتراجع)', icon: 'rotate', group: 'الصلاحيات', danger: 'medium', reversible: false, requires: ['discordGuild'], description: 'يعيد القيمة الخام لـdefault_member_permissions', effect: 'استعادة القيمة السابقة',
      fields: [NAME, { name: 'bits', label: 'القيمة الخام (فارغ = بدون تقييد)', type: 'text', max: 30, pattern: '^\\d*$' }], target: (p) => '/' + p.name,
      async load(p, ctx) { const c = await find(ctx, p.name); if (!c) throw E.notFound('الأمر غير مسجّل'); return { cmd: c }; },
      async execute(p, ctx, b) { await setBits(ctx, b.cmd, p.bits || null); return { message: 'استُعيدت الصلاحية' }; },
      verify: verifyBits((p) => p.bits || null)
    },
    {
      id: 'drift_report', label: 'مقارنة التسجيل (ملفات البوت ↔ Discord)', icon: 'compare', group: 'المزامنة', kind: 'read', danger: 'low', requires: ['botSource', 'discordGuild'], description: 'أوامر معرّفة في الملفات وغير مسجّلة، وأوامر مسجّلة بلا ملف، وأوامر عطّلتها اللوحة. (إعادة المزامنة نفسها يجريها البوت عند تشغيله)', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const scan = ctx.botCommands(); const reg = await registered(ctx); const files = new Set(scan.commands.map((c) => c.name)), rn = new Set(reg.map((c) => c.name)); const dis = new Set(disabledCol(ctx).list({ limit: 500 }).map((d) => d.id)); const data = { inFilesNotRegistered: [...files].filter((n) => !rn.has(n) && !dis.has(n)), registeredWithoutFile: [...rn].filter((n) => !files.has(n)), disabledByPanel: [...dis], unparsedFiles: scan.unparsed || [], counts: { files: files.size, registered: rn.size } }; return { message: data.inFilesNotRegistered.length || data.registeredWithoutFile.length ? 'يوجد اختلاف بين الملفات وDiscord' : 'التسجيل متطابق', data }; }
    },
    {
      id: 'command_detail', label: 'تفاصيل أمر (خيارات/صلاحيات/ملف)', icon: 'eye', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['botSource'], description: 'من ملفات البوت (قراءة فقط) مع تعريف Discord إن توفر', effect: 'قراءة فقط', fields: [NAME], target: (p) => '/' + p.name,
      async execute(p, ctx) { const c = ctx.botCommands().commands.find((x) => x.name === p.name); if (!c) throw E.notFound('أمر غير موجود في ملفات البوت'); let d = null; try { if (ctx.discord.available) d = await find(ctx, p.name); } catch { /* */ } return { message: '/' + c.name, data: { ...c, discord: d && { id: d.id, scope: d.scope, default_member_permissions: d.default_member_permissions } } }; }
    },
    {
      id: 'export_registry', label: 'تصدير سجل الأوامر (JSON)', icon: 'download', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['botSource'], fields: [], description: 'كل الأوامر المفكوكة من الملفات', effect: 'قراءة فقط',
      async execute(p, ctx) { const s = ctx.botCommands(); return { message: `${s.commands.length} أمر`, data: s.commands, download: { filename: 'bot-command-registry.json', mime: 'application/json', text: JSON.stringify(s, null, 2) } }; }
    },
    {
      id: 'bot_permissions_check', label: 'فحص صلاحيات البوت مقابل متطلبات الأوامر', icon: 'shield', group: 'الاستعلام', kind: 'read', danger: 'low', requires: ['botSource', 'discordGuild'], description: 'يحسب صلاحيات البوت الفعلية في السيرفر ويقارنها بما تطلبه أوامره (missingBotPermissions في ملفاتها)', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const me = await ctx.discord.me(); const [m, roles] = await Promise.all([ctx.discord.member(me.id), ctx.discord.roles()]); let perms = 0n; for (const r of roles) if (r.id === ctx.guildId() || m.roles.includes(r.id)) perms |= BigInt(r.permissions); const isAdmin = !!(perms & 8n); const NAMES = { KickMembers: 2n, BanMembers: 4n, ManageChannels: 16n, ManageGuild: 32n, ManageMessages: 8192n, ManageRoles: 268435456n, ModerateMembers: 1099511627776n, MentionEveryone: 131072n, SendMessages: 2048n, EmbedLinks: 16384n, AttachFiles: 32768n, ViewChannel: 1024n, ReadMessageHistory: 65536n, ManageNicknames: 134217728n }; const missing = []; for (const c of ctx.botCommands().commands) for (const need of c.botPermissions) { const bit = NAMES[need]; if (bit && !isAdmin && !(perms & bit)) missing.push({ command: c.name, permission: need }); } return { message: missing.length ? `${missing.length} نقص صلاحية` : 'صلاحيات البوت تغطي متطلبات الأوامر', data: { botIsAdministrator: isAdmin, missing } }; }
    }
  ]
};
