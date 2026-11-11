import { E } from '../../lib/errors.js';
import { now } from '../../lib/util.js';
import { tsMs, pageSize } from '../siteHelpers.js';

const DAY = 86400_000;
const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n');
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
const reports = (ctx) => ctx.store.col('reports');
async function count(q) { return (await q.count().get()).data().count; }

// يحفظ التقرير في قاعدة اللوحة (سجل قابل للرجوع/الأرشفة) ويرجّع ملف التنزيل
function emit(ctx, type, params, rows, extra = {}) {
  const text = csv(rows); const id = `${type}-${now()}`;
  if (text.length < 900_000) reports(ctx).set(id, { type, params, createdAt: now(), by: ctx.actor.id, rowCount: rows.length - 1, text, archived: false, ...extra });
  return { message: `${rows.length - 1} سجل — حُفظ في أرشيف التقارير (${id})`, download: { filename: `${type}.csv`, mime: 'text/csv', text }, data: { reportId: id, rows: rows.length - 1, ...extra }, _reportId: id };
}
const RANGE = [{ name: 'from', label: 'من تاريخ', type: 'datetime', required: true }, { name: 'to', label: 'إلى تاريخ', type: 'datetime', required: true }];
function range(p) { if (p.to <= p.from) throw E.invalid('تاريخ النهاية يجب أن يكون بعد البداية'); if (p.to - p.from > 366 * DAY) throw E.invalid('الحد الأقصى للفترة سنة واحدة'); return [new Date(p.from), new Date(p.to)]; }
async function metrics(ctx, from, to) {
  const db = ctx.fb.db(); const T = ctx.fb.Timestamp;
  const [newUsers, active, sales] = await Promise.all([
    count(db.collection('users').where('createdAt', '>=', T.fromDate(from)).where('createdAt', '<', T.fromDate(to))),
    count(db.collection('levels').where('updatedAt', '>=', T.fromDate(from)).where('updatedAt', '<', T.fromDate(to))),
    count(db.collection('storeSales').where('purchasedAt', '>=', T.fromDate(from)).where('purchasedAt', '<', T.fromDate(to)))
  ]);
  const aud = ctx.audit.count({ ts: { gte: +from, lte: +to }, status: 'success' });
  const pun = ctx.store.col('punishments').count({ at: { gte: +from, lte: +to } });
  return { newUsers, activePlayers: active, storeSales: sales, adminOps: aud, punishments: pun };
}
async function topLevels(ctx, n) { return (await ctx.fb.db().collection('levels').orderBy('xp', 'desc').limit(n).get()).docs; }

const simple = (id, label, icon, description, group, fields, run) => ({ id, label, icon, group, kind: 'read', danger: 'low', requires: ['firebase', 'store'], fields, description, effect: 'قراءة فقط — لا يتغير شيء في الموقع', execute: run });

export default {
  id: 'analytics', workspace: 'website', label: 'التحليلات والتقارير', icon: 'chart', adminDefault: true, description: 'تقارير حقيقية من بيانات الموقع الفعلية، مع أرشيف قابل للرجوع',
  views: [
    {
      id: 'growth', label: 'نمو الحسابات (آخر 30 يوماً)', requires: ['firebase'], source: 'Firestore users.createdAt (count)', chart: { type: 'bar', x: 'day', y: 'users' },
      columns: [{ key: 'day', label: 'اليوم' }, { key: 'users', label: 'حسابات جديدة' }],
      async fetch(q, ctx) { const T = ctx.fb.Timestamp; const start = new Date(); start.setUTCHours(0, 0, 0, 0); const days = Array.from({ length: 30 }, (_, i) => new Date(start.getTime() - (29 - i) * DAY)); const rows = await Promise.all(days.map(async (d) => ({ id: dayKey(d), day: dayKey(d), users: await count(ctx.fb.db().collection('users').where('createdAt', '>=', T.fromDate(d)).where('createdAt', '<', T.fromDate(new Date(+d + DAY)))) }))); return { rows, meta: { total: rows.reduce((a, r) => a + r.users, 0) } }; }
    },
    {
      id: 'activity', label: 'نشاط اللاعبين (آخر 14 يوماً)', requires: ['firebase'], source: 'Firestore levels.updatedAt (count)', chart: { type: 'line', x: 'day', y: 'players' },
      columns: [{ key: 'day', label: 'اليوم' }, { key: 'players', label: 'لاعبون نشطون' }],
      async fetch(q, ctx) { const T = ctx.fb.Timestamp; const start = new Date(); start.setUTCHours(0, 0, 0, 0); const days = Array.from({ length: 14 }, (_, i) => new Date(start.getTime() - (13 - i) * DAY)); const rows = await Promise.all(days.map(async (d) => ({ id: dayKey(d), day: dayKey(d), players: await count(ctx.fb.db().collection('levels').where('updatedAt', '>=', T.fromDate(d)).where('updatedAt', '<', T.fromDate(new Date(+d + DAY)))) }))); return { rows }; }
    },
    {
      id: 'top', label: 'أعلى 25 لاعباً خبرة', requires: ['firebase'], source: 'Firestore levels (xp)',
      columns: [{ key: 'rank', label: '#' }, { key: 'key', label: 'اللاعب' }, { key: 'xp', label: 'الخبرة' }, { key: 'level', label: 'اللفل' }, { key: 'roundsPlayed', label: 'الجولات' }],
      async fetch(q, ctx) { return { rows: (await topLevels(ctx, 25)).map((d, i) => ({ id: d.id, rank: i + 1, key: d.id, xp: d.data().xp || 0, level: d.data().level || 1, roundsPlayed: d.data().roundsPlayed || 0 })) }; }
    },
    {
      id: 'reports', label: 'أرشيف التقارير', requires: ['store'], search: true,
      columns: [{ key: 'type', label: 'النوع' }, { key: 'rowCount', label: 'السجلات' }, { key: 'by', label: 'بواسطة' }, { key: 'createdAt', label: 'التاريخ', type: 'date' }, { key: 'archived', label: 'مؤرشف' }],
      async fetch(q, ctx) { return { rows: reports(ctx).list({ search: q.q, limit: pageSize(q), orderBy: 'createdAt' }).map(({ text, ...r }) => ({ ...r, archived: r.archived ? 'نعم' : 'لا' })) }; }
    }
  ],
  actions: [
    simple('report_players', 'تصدير بيانات اللاعبين (CSV)', 'users', 'أعلى N سجل خبرة (levels) مع اللفل والجولات', 'التصدير', [{ name: 'limit', label: 'عدد السجلات', type: 'integer', required: true, min: 10, max: 5000, default: 1000 }], async (p, ctx) => emit(ctx, 'players', p, [['key', 'xp', 'level', 'roundsPlayed', 'activeFrame', 'ownedFrames'], ...(await topLevels(ctx, p.limit)).map((d) => { const v = d.data(); return [d.id, v.xp || 0, v.level || 1, v.roundsPlayed || 0, v.activeFrame || '', (v.ownedFrames || []).length]; })])),
    simple('report_games', 'تصدير إحصائيات الألعاب (CSV)', 'gamepad', 'مجموع مرات اللعب لكل لعبة من أعلى 2000 لاعب (عينة)', 'التصدير', [], async (p, ctx) => { const plays = {}, pl = {}; for (const d of await topLevels(ctx, 2000)) for (const [g, n] of Object.entries(d.data().gamesPlayCount || {})) { plays[g] = (plays[g] || 0) + (Number(n) || 0); pl[g] = (pl[g] || 0) + 1; } return emit(ctx, 'games', p, [['game', 'plays', 'players (sample: top 2000)'], ...Object.keys(plays).sort((a, b) => plays[b] - plays[a]).map((g) => [g, plays[g], pl[g]])]); }),
    simple('report_streamers', 'تصدير إحصائيات الستريمرز (CSV)', 'broadcast', 'بوابة الربط + مشاركات الفعاليات (مدة البث والفوزات)', 'التصدير', [], async (p, ctx) => { const rows = [['streamer', 'bridge', 'events', 'total seconds', 'total wins']]; const b = await ctx.fb.db().collection('bridgeStreamers').get(); const stat = {}; const evs = await ctx.fb.db().collection('streamerEvents').orderBy('createdAt', 'desc').limit(20).get(); for (const e of evs.docs) for (const s of (await e.ref.collection('sessions').get()).docs) { const x = (stat[s.id] ||= { ev: 0, secs: 0, wins: 0 }); x.ev++; x.secs += Number(s.data().totalPlayedSeconds) || 0; x.wins += Number(s.data().totalWins) || 0; } const ids = new Set([...b.docs.map((d) => d.id), ...Object.keys(stat)]); for (const id of ids) rows.push([id, b.docs.find((d) => d.id === id)?.data().enabled === false ? 'disabled' : 'enabled', stat[id]?.ev || 0, stat[id]?.secs || 0, stat[id]?.wins || 0]); return emit(ctx, 'streamers', p, rows); }),
    simple('report_daily', 'تقرير النشاط اليومي', 'sun', 'آخر 24 ساعة: لاعبون نشطون، حسابات جديدة، مبيعات، عمليات إدارية', 'التقارير الزمنية', [], async (p, ctx) => { const to = new Date(), from = new Date(+to - DAY); const m = await metrics(ctx, from, to); return emit(ctx, 'daily', {}, [['metric', 'value'], ...Object.entries(m)], { metrics: m }); }),
    simple('report_weekly', 'تقرير النشاط الأسبوعي', 'calendar', 'آخر 7 أيام يومياً: لاعبون نشطون وحسابات جديدة', 'التقارير الزمنية', [], async (p, ctx) => { const T = ctx.fb.Timestamp; const start = new Date(); start.setUTCHours(0, 0, 0, 0); const rows = [['day', 'new users', 'active players']]; for (let i = 6; i >= 0; i--) { const d = new Date(+start - i * DAY), e = new Date(+d + DAY); rows.push([dayKey(d), await count(ctx.fb.db().collection('users').where('createdAt', '>=', T.fromDate(d)).where('createdAt', '<', T.fromDate(e))), await count(ctx.fb.db().collection('levels').where('updatedAt', '>=', T.fromDate(d)).where('updatedAt', '<', T.fromDate(e)))]); } return emit(ctx, 'weekly', {}, rows); }),
    simple('report_punishments', 'تقرير العقوبات', 'ban', 'عقوبات اللاعبين والستريمرز المسجلة في اللوحة ضمن الفترة', 'التقارير الزمنية', RANGE, async (p, ctx) => { const [f, t] = range(p); const rows = [['username', 'type', 'status', 'reason', 'by', 'at', 'expires'], ...ctx.store.col('punishments').list({ where: { at: { gte: +f, lte: +t } }, limit: 1000, orderBy: 'at' }).map((x) => [x.username, x.type, x.status, x.reason, x.by, new Date(x.at).toISOString(), x.expiresAt ? new Date(x.expiresAt).toISOString() : ''])]; return emit(ctx, 'punishments', p, rows); }),
    simple('report_rewards', 'تقرير المكافآت', 'gift', 'منح الإطارات وتعديلات الخبرة ومبيعات المتجر ضمن الفترة', 'التقارير الزمنية', RANGE, async (p, ctx) => { const [f, t] = range(p); const rows = [['type', 'who', 'detail', 'by', 'at']]; for (const g of ctx.store.col('frameGrants').list({ where: { at: { gte: +f, lte: +t } }, limit: 1000, orderBy: 'at' })) rows.push(['frame_' + g.op, g.username, g.frameId, g.by, new Date(g.at).toISOString()]); for (const x of ctx.store.col('xpLedger').list({ where: { at: { gte: +f, lte: +t } }, limit: 1000, orderBy: 'at' })) rows.push(['xp', x.key, `${x.from}→${x.to}`, x.by, new Date(x.at).toISOString()]); const s = await ctx.fb.db().collection('storeSales').where('purchasedAt', '>=', ctx.fb.Timestamp.fromDate(f)).where('purchasedAt', '<', ctx.fb.Timestamp.fromDate(t)).limit(2000).get(); for (const d of s.docs) rows.push(['sale', d.data().siteUsername, d.data().productName, 'store', new Date(tsMs(d.data().purchasedAt)).toISOString()]); return emit(ctx, 'rewards', p, rows); }),
    simple('compare_periods', 'مقارنة أداء فترتين', 'compare', 'حسابات جديدة، لاعبون نشطون، مبيعات، عمليات إدارية — لكل فترة ونسبة التغيّر', 'المقارنة والمخصّص', [{ name: 'aFrom', label: 'الفترة أ — من', type: 'datetime', required: true }, { name: 'aTo', label: 'الفترة أ — إلى', type: 'datetime', required: true }, { name: 'bFrom', label: 'الفترة ب — من', type: 'datetime', required: true }, { name: 'bTo', label: 'الفترة ب — إلى', type: 'datetime', required: true }], async (p, ctx) => { const [af, at] = range({ from: p.aFrom, to: p.aTo }), [bf, bt] = range({ from: p.bFrom, to: p.bTo }); const [a, b] = await Promise.all([metrics(ctx, af, at), metrics(ctx, bf, bt)]); const rows = [['metric', 'A', 'B', 'change %'], ...Object.keys(a).map((k) => [k, a[k], b[k], a[k] ? Math.round(((b[k] - a[k]) / a[k]) * 100) : (b[k] ? 'new' : 0)])]; return emit(ctx, 'compare', p, rows, { a, b }); }),
    simple('report_custom', 'تقرير مخصص بتاريخ يحدده المسؤول', 'sliders', 'مؤشرات الموقع كاملة لفترة تختارها', 'المقارنة والمخصّص', RANGE, async (p, ctx) => { const [f, t] = range(p); const m = await metrics(ctx, f, t); return emit(ctx, 'custom', p, [['metric', 'value'], ...Object.entries(m)], { metrics: m }); }),
    {
      id: 'archive_report', label: 'أرشفة تقرير سابق (مع إمكانية الرجوع)', icon: 'archive', group: 'الأرشيف', danger: 'low', reversible: true, requires: ['store'], description: 'وسم التقرير كمؤرشف — يبقى كاملاً ويمكن استرجاعه وتنزيله', effect: 'يُنقل التقرير لقائمة المؤرشف دون حذف',
      fields: [{ name: 'reportId', label: 'معرّف التقرير', type: 'text', required: true, max: 80 }, { name: 'archived', label: 'مؤرشف؟', type: 'boolean', default: true }], target: (p) => p.reportId,
      async load(p, ctx) { const r = reports(ctx).get(p.reportId); if (!r) throw E.notFound('التقرير غير موجود'); return { archived: !!r.archived }; },
      async execute(p, ctx, b) { const want = p.archived !== false; if (b.archived === want) throw E.conflict('الحالة مطابقة'); reports(ctx).merge(p.reportId, { archived: want, archivedAt: want ? now() : null }); return { message: want ? 'أُرشف' : 'أُلغيت الأرشفة', undo: { action: 'analytics.archive_report', params: { reportId: p.reportId, archived: !want } }, _want: want }; },
      verify: async (p, ctx, b, r) => ({ ok: !!reports(ctx).get(p.reportId)?.archived === r._want })
    },
    {
      id: 'get_report', label: 'تنزيل تقرير من الأرشيف', icon: 'download', group: 'الأرشيف', kind: 'read', danger: 'low', requires: ['store'], fields: [{ name: 'reportId', label: 'معرّف التقرير', type: 'text', required: true, max: 80 }], target: (p) => p.reportId, description: 'يعيد ملف CSV المحفوظ كما أُنتج', effect: 'قراءة فقط',
      async execute(p, ctx) { const r = reports(ctx).get(p.reportId); if (!r) throw E.notFound('التقرير غير موجود'); return { message: `${r.rowCount} سجل`, download: { filename: `${r.type}.csv`, mime: 'text/csv', text: r.text } }; }
    }
  ]
};
