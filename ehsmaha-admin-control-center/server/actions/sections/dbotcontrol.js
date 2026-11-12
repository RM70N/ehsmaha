// إجراءات تعتمد قناة /admin-control داخل البوت (تُنفَّذ داخل البوت نفسه ويؤكد البوت التطبيق Verified).
// تُضاف إلى أقسام: commands · automod · tickets · dstreamers · health.
import { E } from '../../lib/errors.js';
import { pageSize } from '../siteHelpers.js';

const need = ['botControl'];
const bc = (ctx) => ctx.botControl;
const NAME = { name: 'name', label: 'اسم الأمر', type: 'text', required: true, max: 64, optionsFrom: 'commands' };
const ids = (t) => String(t || '').split(/[\s,،]+/).filter(Boolean);
const SNOW = /^\d{16,21}$/;
const csvIds = (label, v) => { const a = ids(v); if (a.some((x) => !SNOW.test(x))) throw E.invalid(`${label}: معرّفات ديسكورد غير صالحة`); if (a.length > 50) throw E.invalid(`${label}: الحد 50`); return a; };
// يحوّل رد البوت إلى نتيجة محرّك: verified يجب أن يأتي من البوت
const done = (res, message, extra = {}) => ({ message: message + (res.verified ? ' — تحقق البوت من التطبيق' : ''), _ok: res.verified === true, _detail: res.detail, after: res.detail, ...extra });
const botVerified = async (p, ctx, b, r) => ({ ok: r._ok === true, after: r._detail, message: 'البوت لم يؤكد تطبيق العملية (verified=false)' });
const cmdsList = async (ctx) => (await bc(ctx).call('GET', '/commands')).detail.commands;
const cmdOf = async (ctx, name) => { const c = (await cmdsList(ctx)).find((x) => x.name === name); if (!c) throw E.notFound('الأمر غير موجود في البوت'); return c; };
const enc = (n) => encodeURIComponent(n);

export const extra = {
  commands: {
    views: [{
      id: 'inbot', label: 'حالة الأوامر داخل البوت (استخدام 7 أيام)', requires: need, search: true, source: 'GET /admin-control/commands (حيّ من البوت)',
      columns: [{ key: 'name', label: 'الأمر' }, { key: 'category', label: 'الفئة' }, { key: 'state', label: 'الحالة' }, { key: 'uses', label: 'استخدام' }, { key: 'errors', label: 'أخطاء' }, { key: 'denied', label: 'مرفوض' }, { key: 'restrictions', label: 'تقييدات' }],
      async fetch(q, ctx) { const t = (q.q || '').toLowerCase(); return { rows: (await cmdsList(ctx)).filter((c) => !t || (c.name + c.category).toLowerCase().includes(t)).map((c) => ({ id: c.name, name: '/' + c.name, category: c.category, state: c.disabled ? '⛔ معطّل داخل البوت' : c.protected ? '🔒 محمي' : '✅ يعمل', uses: c.usage7d?.uses ?? 0, errors: c.usage7d?.errors ?? 0, denied: c.usage7d?.denied ?? 0, restrictions: [c.restrictions?.allowedRoleIds?.length && `${c.restrictions.allowedRoleIds.length} رتب`, c.restrictions?.allowedChannelIds?.length && `${c.restrictions.allowedChannelIds.length} رومات مسموحة`, c.restrictions?.blockedChannelIds?.length && `${c.restrictions.blockedChannelIds.length} رومات ممنوعة`].filter(Boolean).join(' · ') || '—' })) }; }
    }],
    actions: [
      {
        id: 'bot_disable', label: 'تعطيل أمر داخل البوت (دون إلغاء تسجيله)', icon: 'ban', group: 'التحكم داخل البوت', danger: 'high', reversible: true, reasonRequired: true, requires: need,
        description: 'يرفض البوت الأمر لأي مستخدم عادي برسالة عربية مؤقتة (المالك مستثنى؛ الأوامر الأساسية محمية). يبقى الأمر ظاهراً في Discord.', effect: 'يتوقف الأمر داخل البوت فوراً دون إعادة تشغيل',
        fields: [NAME], target: (p) => '/' + p.name,
        async load(p, ctx) { const c = await cmdOf(ctx, p.name); if (c.protected) throw E.invalid('أمر أساسي محمي ولا يمكن تعطيله'); if (c.disabled) throw E.conflict('الأمر معطّل أصلاً'); return { disabled: false }; },
        async execute(p, ctx) { const r = await bc(ctx).call('POST', `/commands/${enc(p.name)}/disable`); return done(r, `عُطّل /${p.name} داخل البوت`, { undo: { action: 'commands.bot_enable', params: { name: p.name } } }); },
        async verify(p, ctx, b, r) { const c = await cmdOf(ctx, p.name); return { ok: r._ok && c.disabled === true, after: { disabled: c.disabled }, message: 'الأمر ليس معطّلاً عند قراءته من البوت' }; }
      },
      {
        id: 'bot_enable', label: 'إعادة تفعيل أمر معطّل داخل البوت', icon: 'play', group: 'التحكم داخل البوت', danger: 'medium', reversible: true, requires: need, description: 'يلغي التعطيل داخل البوت', effect: 'يعمل الأمر للجميع فوراً', fields: [NAME], target: (p) => '/' + p.name,
        async load(p, ctx) { const c = await cmdOf(ctx, p.name); if (!c.disabled) throw E.conflict('الأمر غير معطّل'); return { disabled: true }; },
        async execute(p, ctx) { const r = await bc(ctx).call('POST', `/commands/${enc(p.name)}/enable`); return done(r, `فُعّل /${p.name}`, { undo: { action: 'commands.bot_disable', params: { name: p.name } } }); },
        async verify(p, ctx, b, r) { const c = await cmdOf(ctx, p.name); return { ok: r._ok && c.disabled === false, after: { disabled: c.disabled } }; }
      },
      {
        id: 'bot_restrict', label: 'تقييد أمر برتب ورومات محددة', icon: 'lock', group: 'التحكم داخل البوت', danger: 'medium', reversible: true, requires: need,
        description: 'رتب مسموحة + رومات مسموحة + رومات ممنوعة (معرّفات مفصولة بمسافة/فاصلة). قوائم فارغة = بدون تقييد. يُنفَّذ داخل البوت فوراً.', effect: 'يُسمح بالأمر فقط ضمن التقييد (المالك مستثنى)',
        fields: [NAME, { name: 'roles', label: 'الرتب المسموحة (معرّفات)', type: 'textarea', max: 1500 }, { name: 'allowedChannels', label: 'الرومات المسموحة', type: 'textarea', max: 1500 }, { name: 'blockedChannels', label: 'الرومات الممنوعة', type: 'textarea', max: 1500 }], target: (p) => '/' + p.name,
        async load(p, ctx) { const c = await cmdOf(ctx, p.name); return { restrictions: c.restrictions }; },
        async execute(p, ctx, b) { const body = { allowedRoleIds: csvIds('الرتب', p.roles), allowedChannelIds: csvIds('الرومات المسموحة', p.allowedChannels), blockedChannelIds: csvIds('الرومات الممنوعة', p.blockedChannels) }; const r = await bc(ctx).call('PUT', `/commands/${enc(p.name)}/restrictions`, { body }); return done(r, `حُدّثت تقييدات /${p.name}`, { _want: body, undo: { action: 'commands.bot_restrict', params: { name: p.name, roles: b.restrictions.allowedRoleIds.join(' '), allowedChannels: b.restrictions.allowedChannelIds.join(' '), blockedChannels: b.restrictions.blockedChannelIds.join(' ') } } }); },
        async verify(p, ctx, b, r) { const c = await cmdOf(ctx, p.name); const same = JSON.stringify(c.restrictions) === JSON.stringify(r._want); return { ok: r._ok && same, after: c.restrictions, message: 'التقييدات المقروءة من البوت لا تطابق المطلوبة' }; }
      },
      {
        id: 'bot_usage', label: 'استخدام الأوامر وأخطاؤها (دائم)', icon: 'chart', group: 'التحكم داخل البوت', kind: 'read', danger: 'low', requires: need, description: 'إحصاءات دائمة تبقى بعد إعادة التشغيل (رمز آخر خطأ فقط)', effect: 'قراءة فقط',
        fields: [{ name: 'days', label: 'عدد الأيام', type: 'integer', required: true, min: 1, max: 90, default: 7 }],
        async execute(p, ctx) { const r = await bc(ctx).call('GET', '/usage', { query: { days: p.days } }); return { message: `${r.detail.commands.length} أمر مستخدم`, data: r.detail.commands }; }
      }
    ]
  },
  automod: {
    actions: [
      {
        id: 'get_limits', label: 'عرض حدود السبام الفعّالة', icon: 'eye', group: 'حدود السبام', kind: 'read', danger: 'low', requires: need, description: 'الأولوية: القاعدة > البيئة > الافتراضي', effect: 'قراءة فقط', fields: [],
        async execute(p, ctx) { const r = await bc(ctx).call('GET', '/automod/limits'); return { message: 'الحدود الفعّالة', data: r.detail.effective || r.detail }; }
      },
      {
        id: 'set_limits', label: 'تعديل حدود السبام والتصعيد', icon: 'sliders', group: 'حدود السبام', danger: 'medium', reversible: true, requires: need, apply: 'live',
        description: 'رسائل/نافذة/تكرار + مدد تصعيد الكتم بالدقائق (مفصولة بفاصلة). تُطبَّق فوراً في البوت.', effect: 'تتغير حساسية كشف السبام فوراً',
        fields: [{ name: 'spamMaxMessages', label: 'أقصى رسائل في النافذة (2–30)', type: 'integer', required: true, min: 2, max: 30 }, { name: 'spamWindowSeconds', label: 'النافذة بالثواني (3–60)', type: 'integer', required: true, min: 3, max: 60 }, { name: 'spamDuplicates', label: 'تكرار الرسالة نفسها (2–10)', type: 'integer', required: true, min: 2, max: 10 }, { name: 'escalationMinutes', label: 'مدد التصعيد بالدقائق (مثال: 5,15,60)', type: 'text', max: 100, pattern: '^[0-9, ]*$' }], target: () => 'automod',
        async load(p, ctx) { const r = await bc(ctx).call('GET', '/automod/limits'); return { effective: r.detail.effective || r.detail }; },
        async execute(p, ctx, b) { const body = { spamMaxMessages: p.spamMaxMessages, spamWindowSeconds: p.spamWindowSeconds, spamDuplicates: p.spamDuplicates, ...(p.escalationMinutes ? { escalationMinutes: p.escalationMinutes.split(/[, ]+/).filter(Boolean).map(Number) } : {}) }; const r = await bc(ctx).call('PUT', '/automod/limits', { body }); const prev = b.effective; return done(r, 'حُدّثت حدود السبام', { _want: body, undo: prev?.maxMessages ? { action: 'automod.set_limits', params: { spamMaxMessages: prev.maxMessages, spamWindowSeconds: Math.round(prev.windowMs / 1000), spamDuplicates: prev.duplicateCount, escalationMinutes: (prev.escalationMs || []).map((m) => Math.round(m / 60000)).join(',') } } : undefined }); },
        async verify(p, ctx, b, r) { const g = (await bc(ctx).call('GET', '/automod/limits')).detail; const e = g.effective || g; return { ok: r._ok && e.maxMessages === r._want.spamMaxMessages && e.windowMs === r._want.spamWindowSeconds * 1000 && e.duplicateCount === r._want.spamDuplicates, after: e, message: 'الحدود المقروءة من البوت لا تطابق المطلوبة' }; }
      }
    ]
  },
  tickets: {
    actions: [
      {
        id: 'set_reasons', label: 'تعديل أسباب فتح التكت', icon: 'edit', group: 'أسباب وإجراءات', danger: 'medium', reversible: true, requires: need,
        description: 'سطر لكل سبب بصيغة: القيمة|الاسم|إيموجي(اختياري). من 1 إلى 25 سبباً. فارغ = الرجوع لإعدادات الملف.', effect: 'تتغير خيارات لوحة التكتات',
        fields: [{ name: 'reasons', label: 'الأسباب (value|label|emoji لكل سطر)', type: 'textarea', max: 3000 }], target: () => 'reasons',
        async load(p, ctx) { const r = await bc(ctx).call('GET', '/tickets/reasons'); return { reasons: r.detail.reasons, source: r.detail.source }; },
        async execute(p, ctx, b) { const reasons = String(p.reasons || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [value, label, emoji] = l.split('|').map((x) => x.trim()); if (!value || !label) throw E.invalid('صيغة السطر: القيمة|الاسم|إيموجي'); return { value, label, ...(emoji ? { emoji } : {}) }; }); const r = await bc(ctx).call('PUT', '/tickets/reasons', { body: { reasons } }); return done(r, `حُفظت ${reasons.length} أسباب`, { _want: reasons, undo: b.source === 'database' ? { action: 'tickets.set_reasons', params: { reasons: b.reasons.map((x) => [x.value, x.label, x.emoji].filter(Boolean).join('|')).join('\n') } } : undefined }); },
        async verify(p, ctx, b, r) { const g = (await bc(ctx).call('GET', '/tickets/reasons')).detail; return { ok: r._ok && g.reasons.length === r._want.length && r._want.every((x, i) => g.reasons[i].value === x.value), after: g, message: 'الأسباب المقروءة من البوت لا تطابق المحفوظة' }; }
      },
      {
        id: 'close_ticket', label: 'إغلاق تكت', icon: 'x', group: 'أسباب وإجراءات', danger: 'high', reversible: false, reasonRequired: true, requires: need,
        description: 'بنفس منطق إغلاق البوت (أرشفة/حذف حسب TICKET_CLOSE_MODE)', effect: 'يُغلق التكت وتُؤرشف قناته',
        fields: [{ name: 'ticketId', label: 'رقم التكت', type: 'integer', required: true, min: 1 }], target: (p) => '#' + p.ticketId,
        async execute(p, ctx) { const r = await bc(ctx).call('POST', `/tickets/${p.ticketId}/close`, { body: {} }); return done(r, `أُغلق التكت #${p.ticketId}`); },
        async verify(p, ctx, b, r) { return { ok: r._ok && r._detail?.ticket?.status === 'closed', after: r._detail, message: 'لم يؤكد البوت إغلاق التكت' }; }
      },
      {
        id: 'post_panel', label: 'نشر لوحة التكتات في روم', icon: 'ticket', group: 'أسباب وإجراءات', danger: 'medium', reversible: false, requires: ['botControl', 'discordGuild'],
        description: 'يرسل البوت رسالة لوحة التكتات الحقيقية (لا لوحة مكررة لنفس الروم)', effect: 'تظهر لوحة فتح التكتات في الروم',
        fields: [{ name: 'channelId', label: 'الروم', type: 'snowflake', required: true, optionsFrom: 'channels' }, { name: 'content', label: 'نص اللوحة', type: 'textarea', required: true, max: 1500 }], target: (p) => p.channelId,
        async execute(p, ctx) { const r = await bc(ctx).call('POST', '/tickets/panel', { body: { channelId: p.channelId, content: p.content } }); return done(r, 'نُشرت لوحة التكتات', { _mid: r.detail?.messageId }); },
        async verify(p, ctx, b, r) { const m = await ctx.discord.getMessage(p.channelId, r._mid); return { ok: r._ok && !!m.id, after: { messageId: m.id }, message: 'رسالة اللوحة غير موجودة في Discord' }; }
      }
    ]
  },
  dstreamers: {
    actions: [
      {
        id: 'reload_now', label: 'تطبيق قائمة الستريمرات في البوت الآن', icon: 'sync', group: 'التطبيق', danger: 'low', requires: need, description: 'يعيد البوت تحميل القائمة من القاعدة دون إعادة تشغيل (بلا إعلان مكرر لبث جارٍ)', effect: 'تُفعَّل تغييرات القائمة المعلّقة فوراً', fields: [],
        async load(p, ctx) { const r = await bc(ctx).call('GET', '/status'); return { streamerAnnouncer: r.detail.services?.streamerAnnouncer }; },
        async execute(p, ctx) { const r = await bc(ctx).reloadStreamers(); return done(r, `مسجّلون: ${r.detail?.after?.registered} · متتبَّعون: ${r.detail?.after?.tracked}`); },
        verify: botVerified
      },
      {
        id: 'set_channel', label: 'تغيير روم إعلانات البث', icon: 'hash', group: 'التطبيق', danger: 'medium', reversible: true, requires: need, description: 'يتحقق البوت أن الروم نصي ويملك SendMessages وEmbedLinks، ثم يطبّق فوراً (لا روم بديل عند الفشل)', effect: 'تُرسل إعلانات البث في الروم الجديد',
        fields: [{ name: 'channelId', label: 'الروم', type: 'snowflake', required: true, optionsFrom: 'channels' }], target: (p) => p.channelId,
        async load(p, ctx) { const r = await bc(ctx).call('GET', '/status'); return { channelId: r.detail.services?.streamerAnnouncer?.channelId }; },
        async execute(p, ctx, b) { const r = await bc(ctx).call('PUT', '/streamers/channel', { body: { channelId: p.channelId } }); return done(r, 'غُيّر روم الإعلانات', { undo: b.channelId ? { action: 'dstreamers.set_channel', params: { channelId: b.channelId } } : undefined }); },
        async verify(p, ctx, b, r) { const s = (await bc(ctx).call('GET', '/status')).detail.services?.streamerAnnouncer; return { ok: r._ok && s?.channelId === p.channelId, after: { channelId: s?.channelId }, message: 'روم الإعلانات المقروء من البوت لا يطابق' }; }
      }
    ]
  },
  health: {
    actions: [{
      id: 'bot_control_status', label: 'حالة البوت من قناة التحكم (خدمات داخلية)', icon: 'bot', group: 'البوت', kind: 'read', danger: 'low', requires: need, description: 'جاهزية، ping، uptime، الإعلانات (حلقات مفتوحة/فاشلة)، القاعدة، ضوابط الأوامر', effect: 'قراءة فقط', fields: [],
      async execute(p, ctx) { const r = await bc(ctx).call('GET', '/status'); return { message: r.detail.ready ? 'البوت جاهز' : 'البوت غير جاهز', data: r.detail }; }
    }]
  }
};
