import express from 'express';
import { E, AppError } from '../lib/errors.js';
import { scrub, maskIp } from '../lib/util.js';
import { ACCOUNTS } from '../auth/accounts.js';
import { buildOverview } from '../services/overview.js';
import { globalSearch } from '../services/search.js';
import { integrationMap } from '../services/integration.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function apiRouter(svc) {
  const r = express.Router();
  const { cfg, sessions, loginGuard, verifier, perms, registry, engine, audit, caps, store } = svc;
  const metaOf = (req) => ({ requestId: req.id, ip: req.ip, device: req.get('user-agent') });
  const need = (req) => { if (!req.auth) throw (req.sessionExpired ? E.sessionExpired() : E.unauthenticated()); return req.auth; };
  const cookieOpts = () => ({ httpOnly: true, secure: cfg.prod, sameSite: 'strict', path: '/', maxAge: cfg.session.maxHours * 3600_000 });

  // ---------- المصادقة ----------
  r.post('/auth/login', wrap(async (req, res) => {
    const accountKey = typeof req.body?.account === 'string' ? req.body.account : '';
    const password = req.body?.password;
    const ip = req.ip;
    const known = Object.hasOwn(ACCOUNTS, accountKey);
    const alertFails = () => { const n = loginGuard.recent(200).filter((x) => !x.ok && Date.now() - x.ts < 15 * 60_000).length; if (n >= 5) svc.alerts.raise({ key: 'security:login-failures', severity: 'warning', source: 'security', title: 'محاولات دخول فاشلة متكررة', message: `${n} محاولة خلال 15 دقيقة` }); };
    try { loginGuard.check(known ? accountKey : '_unknown', ip); } catch (e) { if (e.code === 'RATE_LIMITED' || e.code === 'FORBIDDEN') { loginGuard.blocked(known ? accountKey : '_unknown', ip, req.get('user-agent'), e.code === 'FORBIDDEN' ? 'ip_blocked' : 'locked'); alertFails(); } throw e; }
    const ok = known && (await verifier.verify(accountKey, password));
    if (!ok) {
      loginGuard.record(known ? accountKey : '_unknown', ip, false, req.get('user-agent'), known ? 'bad_password' : 'unknown_account');
      alertFails();
      audit.append({ actor: known ? ACCOUNTS[accountKey].id : 'ANONYMOUS', actorName: known ? ACCOUNTS[accountKey].display : '—', section: 'security', action: 'auth.login', label: 'تسجيل دخول', status: 'failed', error: 'BAD_CREDENTIALS', requestId: req.id, ip: maskIp(req.ip) });
      throw new AppError(401, 'BAD_CREDENTIALS', 'بيانات الدخول غير صحيحة');
    }
    const acc = ACCOUNTS[accountKey];
    // تدوير: نُنهي أي جلسة سابقة لنفس الحساب على هذا المتصفح (كوكي قديم) ثم نُصدر معرّفاً جديداً كلياً
    const old = req.cookies?.[cfg.session.cookieName]; if (old) { try { const s = sessions.resolve(old); if (s) sessions.revoke(s.id, 'rotated'); } catch { /* */ } }
    const s = sessions.create(acc, { ip, ua: req.get('user-agent') });
    loginGuard.record(accountKey, ip, true, req.get('user-agent'));
    audit.append({ actor: acc.id, actorName: acc.display, role: acc.role, section: 'security', action: 'auth.login', label: 'تسجيل دخول', status: 'success', requestId: req.id });
    res.cookie(cfg.session.cookieName, s.token, cookieOpts());
    res.json({ ok: true, account: { id: acc.id, display: acc.display, role: acc.role }, csrf: s.csrf });
  }));

  r.post('/auth/logout', wrap(async (req, res) => {
    const a = need(req);
    sessions.revoke(a.sessionId, 'logout');
    audit.append({ actor: a.accountId, actorName: a.display, role: a.role, section: 'security', action: 'auth.logout', label: 'تسجيل خروج', status: 'success', requestId: req.id });
    res.clearCookie(cfg.session.cookieName, { path: '/' });
    res.json({ ok: true });
  }));

  r.get('/auth/state', (req, res) => res.json({ ok: true, authenticated: !!req.auth }));

  // ---------- الهوية والتنقل (بحسب الصلاحيات الفعلية) ----------
  r.get('/me', wrap(async (req, res) => {
    const a = need(req);
    const sections = registry.sections().filter((s) => perms.canSeeSection(a, s.id)).map((s) => ({
      id: s.id, label: s.label, workspace: s.workspace, icon: s.icon, description: s.description || '', ownerOnly: !!s.ownerOnly,
      views: registry.viewsOf(s.id).map((v) => ({ id: v.id, label: v.label, chart: v.chart || null, search: !!v.search, placeholder: v.placeholder, columns: v.columns, available: !(v.requires || []).some((c) => !caps[c]().ok), unavailableReason: ((v.requires || []).map((c) => caps[c]()).find((c) => !c.ok) || {}).reason || null, ownerOnly: !!v.ownerOnly })).filter((v) => a.role === 'owner' || !v.ownerOnly),
      actionCount: registry.actionsOf(s.id).filter((x) => !x.hidden && perms.canRunAction(a, x.id)).length
    }));
    const workspaces = ['website', 'discord', 'control'].filter((w) => sections.some((s) => s.workspace === w));
    res.json({ ok: true, account: { id: a.accountId, display: a.display, role: a.role }, csrf: a.csrf, workspaces, sections, idleMinutes: cfg.session.idleMinutes });
  }));

  // ---------- الإجراءات ----------
  r.get('/actions', wrap(async (req, res) => {
    const a = need(req);
    const sec = String(req.query.section || '');
    if (!perms.canSeeSection(a, sec)) throw E.forbidden();
    const actions = registry.actionsOf(sec).filter((x) => !x.hidden && perms.canRunAction(a, x.id)).map((x) => registry.describeAction(x, caps));
    res.json({ ok: true, actions });
  }));

  r.post('/actions/:section/:id/run', wrap(async (req, res) => {
    const a = need(req);
    const out = await engine.run({ actionId: `${req.params.section}.${req.params.id}`, params: req.body?.params, auth: a, meta: metaOf(req), idempotencyKey: req.body?.idempotencyKey, confirm: req.body?.confirm === true, reason: req.body?.reason });
    res.json(out);
  }));

  r.post('/audit/:id/undo', wrap(async (req, res) => res.json(await engine.undo({ auditId: req.params.id, auth: need(req), meta: metaOf(req) }))));

  // ---------- طرق العرض (جداول بتصفية وترقيم من الخادم) ----------
  r.get('/views/:section/:view', wrap(async (req, res) => {
    const a = need(req);
    const v = registry.view(`${req.params.section}.${req.params.view}`);
    if (!v || !perms.canSeeSection(a, v.section) || (v.ownerOnly && a.role !== 'owner')) throw E.notFound('العرض غير موجود');
    for (const c of v.requires || []) { const k = caps[c](); if (!k.ok) throw E.unavailable(k.reason, { capability: c }); }
    const started = Date.now();
    const out = await v.fetch({ q: String(req.query.q || '').slice(0, 200), cursor: req.query.cursor, page: req.query.page, pageSize: req.query.pageSize, filters: req.query }, { ...svc.buildCtx(a) });
    res.json({ ok: true, rows: scrub(out.rows), total: out.total ?? null, nextCursor: out.nextCursor ?? null, meta: scrub(out.meta) || null, source: v.source || null, updatedAt: Date.now(), ms: Date.now() - started });
  }));

  // ---------- سجل التدقيق (قراءة/تصدير فقط) ----------
  const auditQuery = (req) => {
    const q = req.query; const where = {};
    for (const k of ['actor', 'section', 'action', 'status']) if (q[k]) where[k] = String(q[k]);
    if (q.target) where.target = String(q.target);
    if (q.from || q.to) where.ts = { ...(q.from ? { gte: Number(q.from) } : {}), ...(q.to ? { lte: Number(q.to) } : {}) };
    return { where, search: q.q ? String(q.q).slice(0, 100) : undefined };
  };
  r.get('/audit', wrap(async (req, res) => {
    const a = need(req);
    if (!perms.canSeeSection(a, 'audit')) throw E.forbidden();
    const { where, search } = auditQuery(req);
    // الأدمن يرى عملياته هو فقط ما لم يمنحه المالك رؤية القسم كاملاً (يمنحه هنا عبر قسم audit)
    const limit = Math.min(200, Number(req.query.limit) || 50), offset = (Number(req.query.page) || 0) * limit;
    res.json({ ok: true, rows: audit.list({ where, search, limit, offset, dir: 'desc' }), total: audit.count(where, search) });
  }));
  r.get('/audit/export', wrap(async (req, res) => {
    const a = need(req);
    if (!perms.canSeeSection(a, 'audit')) throw E.forbidden();
    const { where, search } = auditQuery(req);
    const rows = audit.list({ where, search, limit: 1000, dir: 'desc' });
    audit.append({ actor: a.accountId, actorName: a.display, role: a.role, section: 'audit', action: 'audit.export', label: 'تصدير سجل التدقيق', status: 'success', detail: { rows: rows.length, format: req.query.format }, requestId: req.id });
    if (req.query.format === 'csv') {
      const cols = ['id', 'ts', 'actorName', 'section', 'action', 'label', 'target', 'status', 'error', 'reason', 'requestId'];
      const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
      res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="audit.csv"');
      return res.send('﻿' + [cols.join(','), ...rows.map((x) => cols.map((c) => esc(c === 'ts' ? new Date(x.ts).toISOString() : x[c])).join(','))].join('\n'));
    }
    res.setHeader('Content-Disposition', 'attachment; filename="audit.json"');
    res.json(rows);
  }));

  // ---------- مركز القيادة / البحث / الصحة / التكامل ----------
  r.get('/overview', wrap(async (req, res) => { const a = need(req); res.json({ ok: true, ...(await buildOverview(svc, a)) }); }));
  r.get('/search', wrap(async (req, res) => { const a = need(req); res.json({ ok: true, ...(await globalSearch(svc, a, String(req.query.q || '').slice(0, 100))) }); }));
  r.get('/health', wrap(async (req, res) => { const a = need(req); if (!perms.canSeeSection(a, 'health')) throw E.forbidden(); res.json({ ok: true, services: svc.health.latest(), now: Date.now() }); }));
  r.get('/health/history/:id', wrap(async (req, res) => { const a = need(req); if (!perms.canSeeSection(a, 'health')) throw E.forbidden(); if (!svc.health.ids.includes(req.params.id)) throw E.notFound(); res.json({ ok: true, rows: svc.health.history(req.params.id) }); }));
  r.get('/integration', wrap(async (req, res) => { const a = need(req); if (!perms.canSeeSection(a, 'integration')) throw E.forbidden(); res.json({ ok: true, ...(await integrationMap(svc)) }); }));
  r.get('/capabilities', wrap(async (req, res) => { need(req); res.json({ ok: true, caps: Object.fromEntries(Object.keys(caps).map((k) => [k, caps[k]()])) }); }));

  // ---------- قوائم الاختيار للنماذج (قنوات/رتب/أعضاء/أوامر/أقسام/إجراءات) ----------
  r.get('/lookup/:kind', wrap(async (req, res) => {
    const a = need(req); const q = String(req.query.q || '').toLowerCase().slice(0, 60); const kind = req.params.kind;
    let items = [];
    if (['channels', 'roles', 'members'].includes(kind)) {
      if (!perms.canSeeSection(a, 'server') && !perms.canSeeSection(a, 'members') && !perms.canSeeSection(a, 'automod') && !perms.canSeeSection(a, 'tickets') && !perms.canSeeSection(a, 'welcome') && !perms.canSeeSection(a, 'admins') && !perms.canSeeSection(a, 'integration')) throw E.forbidden();
      const k = caps.discordGuild(); if (!k.ok) throw E.unavailable(k.reason);
      if (kind === 'channels') items = (await svc.discord.channels()).filter((c) => [0, 5, 15].includes(c.type)).map((c) => ({ value: c.id, label: '#' + c.name }));
      else if (kind === 'roles') items = (await svc.discord.roles()).filter((r2) => !r2.managed && r2.id !== svc.discord.guildId).sort((x, y) => y.position - x.position).map((r2) => ({ value: r2.id, label: r2.name }));
      else items = q.length >= 2 ? (await svc.discord.searchMembers(q, 15)).map((m) => ({ value: m.user.id, label: `${m.user.global_name || m.user.username} (${m.user.username})` })) : [];
    } else if (kind === 'commands') { const sc = svc.botCommands(); items = (sc.commands || []).map((c) => ({ value: c.name, label: '/' + c.name })); }
    else if (kind === 'sections' && a.role === 'owner') items = registry.sections().filter((s) => !s.ownerOnly).map((s) => ({ value: s.id, label: s.label }));
    else if (kind === 'actions' && a.role === 'owner') items = registry.actions().filter((x) => !x.ownerOnly && !x.hidden).map((x) => ({ value: x.id, label: `${registry.section(x.section).label} ← ${x.label}` }));
    else throw E.notFound('نوع غير معروف');
    res.json({ ok: true, items: q && kind !== 'members' ? items.filter((i) => i.label.toLowerCase().includes(q)) : items });
  }));

  // ---------- مصفوفة الصلاحيات (المالك فقط) ----------
  r.get('/access/matrix', wrap(async (req, res) => { const a = need(req); if (a.role !== 'owner') throw E.forbidden('للمالك فقط'); res.json({ ok: true, ...perms.matrix() }); }));

  r.use((err, req, res, next) => next(err));
  return r;
}
