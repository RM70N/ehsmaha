// مركز القيادة: مؤشرات حقيقية فقط. كل بطاقة: القيمة + المصدر + وقت التحديث؛ وإن تعذّر المصدر تظهر «غير متاح» بسببه
// (لا أرقام قديمة تُعرض كحديثة، ولا أرقام ثابتة).
import { now } from '../lib/util.js';

const TTL = 20_000;
const cache = new Map();

async function metric(id, label, source, fn, ttl = TTL) {
  const hit = cache.get(id);
  if (hit && now() - hit.at < ttl) return hit.m;
  const t = now();
  let m;
  try { const value = await fn(); m = { id, label, source, status: 'ok', value, updatedAt: t }; }
  catch (e) { const quota = e && (e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e.message || ''))); m = { id, label, source, status: 'unavailable', reason: quota ? 'حصة Firestore اليومية مستنفدة — تتجدد يومياً' : String(e.code === 'FIREBASE_UNAVAILABLE' || e.code === 'BOT_DB_UNAVAILABLE' || e.code === 'DISCORD_UNAVAILABLE' ? e.message : e.message || e).slice(0, 140), updatedAt: t }; }
  if (m.status === 'ok') cache.set(id, { at: t, m }); else cache.delete(id);
  return m;
}
const cnt = async (q) => (await q.count().get()).data().count;
const startOfDayUtc = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

export function clearOverviewCache() { cache.clear(); }

export async function buildOverview(svc, auth) {
  const { fb, discord, botDb, botApi, health, perms, audit, alerts, cfg } = svc;
  const can = (s) => perms.canSeeSection(auth, s);
  const sod = startOfDayUtc();
  const ws = [];
  const gid = cfg.discord.guildId;

  const site = [
    metric('players', 'اللاعبون المسجّلون', 'Firestore users (count)', async () => cnt(fb.db().collection('users'))),
    metric('activeToday', 'لاعبون نشطون اليوم (UTC)', 'Firestore levels.updatedAt', async () => cnt(fb.db().collection('levels').where('updatedAt', '>=', fb.Timestamp.fromDate(sod)))),
    metric('bridgeStreamers', 'الستريمرون في بوابة الربط', 'Firestore bridgeStreamers', async () => { const s = await fb.db().collection('bridgeStreamers').get(); return { total: s.size, enabled: s.docs.filter((d) => d.data().enabled !== false).length }; }),
    metric('liveStreams', 'جلسات ستريمر نشطة الآن', 'Firestore activeStreamers', async () => cnt(fb.db().collection('activeStreamers')), 10_000),
    metric('events', 'الفعاليات الجارية', 'Firestore streamerEvents + event100', async () => { const a = await cnt(fb.db().collection('streamerEvents').where('status', '==', 'active')); const e100 = await fb.db().collection('event100').doc('current').get(); return { streamerEvents: a, event100: e100.exists && ['announcing', 'registration', 'active'].includes(e100.data().status) ? e100.data().status : null }; }),
    metric('siteOps', 'عمليات إدارية على الموقع اليوم', 'سجل التدقيق', async () => audit.count({ ts: { gte: +sod }, status: 'success', section: 'players' }) + ['streamers', 'games', 'events', 'rewards', 'shop', 'codes', 'messages', 'analytics'].reduce((a, s) => a + audit.count({ ts: { gte: +sod }, status: 'success', section: s }), 0), 5000)
  ];
  const disc = [
    metric('botHealth', 'حالة بوت ديسكورد', 'GET /health للبوت', async () => { const r = await botApi.health(); if (!r.ok) throw new Error(r.error || 'HTTP ' + r.status); return { ready: r.json?.ready ?? true, ping: r.json?.ping ?? null, uptime: r.json?.uptime ?? null, ms: r.ms }; }, 10_000),
    metric('guild', 'السيرفر', 'Discord API', async () => { const g = await discord.guild(); return { name: g.name, members: g.approximate_member_count, online: g.approximate_presence_count }; }),
    metric('commands', 'الأوامر المسجّلة', 'ملفات البوت (قراءة فقط)', async () => { const s = svc.botCommands(); if (!s.available) throw new Error(s.reason); return { inFiles: s.commands.length }; }, 60_000),
    metric('openTickets', 'تكتات مفتوحة', 'قاعدة البوت', async () => (await botDb.tickets.stats(gid)).open),
    metric('moderation24h', 'إجراءات الإشراف (24س)', 'قاعدة البوت: moderation_log', async () => (await botDb.moderation.counts(gid, now() - 86400_000)).reduce((a, r) => a + r.n, 0)),
    metric('botCommandUsage', 'أوامر البوت اليوم / أخطاؤها', 'ذاكرة البوت (غير مكشوفة)', async () => { throw new Error('يحتفظ بها البوت في الذاكرة فقط (utils/usageStats) ولا توجد واجهة لقراءتها — راجع UNSUPPORTED-ACTIONS'); })
  ];
  const [siteM, discM] = await Promise.all([Promise.all(site), Promise.all(disc)]);
  ws.push({ id: 'website', label: 'الموقع', metrics: siteM }, { id: 'discord', label: 'ديسكورد والبوت', metrics: discM });

  const services = health.latest();
  const recent = can('audit') ? audit.list({ limit: 8 }).map(({ id, ts, actorName, label, target, status, section }) => ({ id, ts, actorName, label, target, status, section })) : [];
  const fails24 = svc.loginGuard.recent(200).filter((r) => !r.ok && now() - r.ts < 86400_000).length;
  return {
    generatedAt: now(), workspaces: ws.filter((w) => auth.role === 'owner' || perms.canSeeWorkspace(auth, w.id)), services,
    alerts: { open: alerts.openCount(), latest: alerts.list({ where: { status: 'open' }, limit: 5 }).map(({ id, severity, title, lastAt, count }) => ({ id, severity, title, lastAt, count })) },
    security: { failedLogins24h: fails24, activeSessions: svc.sessions.listActive().length },
    recent
  };
}
