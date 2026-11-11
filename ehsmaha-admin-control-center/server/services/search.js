// بحث موحّد: يبحث فقط في أقسام يحق للحساب رؤيتها (الصلاحية تُفحص في الخادم)، ونتائجه روابط للانتقال للقسم.
import { normUsername } from '../lib/util.js';
import { SNAP } from '../data/siteSnapshot.js';
import { SETTING_DEFS } from './settings.js';

export async function globalSearch(svc, auth, q) {
  const term = q.trim();
  if (term.length < 2) return { results: [], note: 'اكتب حرفين على الأقل' };
  const lower = normUsername(term);
  const { fb, botDb, discord, perms, registry, audit, cfg } = svc;
  const out = []; const notes = [];
  const add = (type, section, view, title, subtitle, id) => out.push({ type, section, view, title, subtitle, id });
  const jobs = [];

  if (perms.canSeeSection(auth, 'players') && fb.available) jobs.push((async () => { const s = await fb.db().collection('users').where('usernameLower', '>=', lower).where('usernameLower', '<', lower + '').limit(6).get(); s.docs.forEach((d) => add('لاعب', 'players', 'search', d.data().username || d.id, d.id, d.id)); })().catch((e) => notes.push('اللاعبون: ' + e.message)));
  if (perms.canSeeSection(auth, 'streamers') && fb.available) jobs.push((async () => { const s = await fb.db().collection('bridgeStreamers').orderBy('__name__').startAt(lower).endAt(lower + '').limit(6).get(); s.docs.forEach((d) => add('ستريمر', 'streamers', 'bridge', d.id, d.data().enabled === false ? 'الربط معطّل' : 'مفعّل', d.id)); })().catch((e) => notes.push('الستريمرز: ' + e.message)));
  if (perms.canSeeSection(auth, 'events') && fb.available) jobs.push((async () => { const s = await fb.db().collection('streamerEvents').orderBy('createdAt', 'desc').limit(30).get(); s.docs.filter((d) => `${d.id}${d.data().title || ''}`.toLowerCase().includes(lower)).slice(0, 5).forEach((d) => add('فعالية', 'events', 'list', d.data().title || d.id, `${d.data().status} · ${d.id}`, d.id)); })().catch((e) => notes.push('الفعاليات: ' + e.message)));
  if (perms.canSeeSection(auth, 'games')) SNAP.cards.filter((c) => (c.name + c.tag).toLowerCase().includes(lower)).slice(0, 6).forEach((c) => add('لعبة', 'games', 'catalog', c.name, c.tag, c.tag));
  if (perms.canSeeSection(auth, 'commands')) { const sc = svc.botCommands(); if (sc.available) sc.commands.filter((c) => `${c.name}${c.description || ''}`.toLowerCase().includes(lower)).slice(0, 6).forEach((c) => add('أمر ديسكورد', 'commands', 'registry', '/' + c.name, c.category, c.name)); }
  if (perms.canSeeSection(auth, 'server') && discord.available && discord.guildId) jobs.push((async () => { const m = await discord.searchMembers(term, 6); m.forEach((x) => add('عضو ديسكورد', 'server', 'members', x.user.global_name || x.user.username, x.user.id, x.user.id)); })().catch((e) => notes.push('أعضاء ديسكورد: ' + e.message)));
  if (perms.canSeeSection(auth, 'tickets') && botDb.available && /^\d{1,9}$/.test(term)) jobs.push((async () => { const l = await botDb.tickets.list(cfg.discord.guildId, { limit: 200 }); l.filter((t) => String(t.id) === term).forEach((t) => add('تكت', 'tickets', t.status === 'open' ? 'open' : 'closed', `تكت #${t.id}`, t.reason, String(t.id))); })().catch((e) => notes.push('التكتات: ' + e.message)));
  if (perms.canSeeSection(auth, 'audit')) audit.list({ search: term, limit: 6 }).forEach((a) => add('سجل عملية', 'audit', null, a.label, `${a.actorName} · ${a.target || ''}`, a.id));
  if (perms.canSeeSection(auth, 'settings')) Object.entries(SETTING_DEFS).filter(([k, d]) => (k + d.label).toLowerCase().includes(lower)).forEach(([k, d]) => add('إعداد', 'settings', 'current', d.label, k, k));
  // إجراءات/أقسام (تنقّل سريع)
  for (const a of registry.actions()) if (!a.hidden && perms.canRunAction(auth, a.id) && a.label.toLowerCase().includes(lower)) { if (out.filter((x) => x.type === 'إجراء').length < 6) add('إجراء', a.section, null, a.label, registry.section(a.section).label, a.id); }
  await Promise.all(jobs);
  return { results: out.slice(0, 40), notes };
}
