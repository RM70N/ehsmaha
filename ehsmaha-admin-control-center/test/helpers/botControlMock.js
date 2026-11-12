// محاكاة قناة /admin-control داخل البوت (نفس العقد الموثّق في ADMIN-CONTROL-API.md): x-admin-key + x-idempotency-key + رد موحّد.
import http from 'node:http';
export const CONTROL_KEY = 'k'.repeat(40);

export async function startBotControlMock({ discordState } = {}) {
  const S = { calls: [], registered: 0, cmds: [{ name: 'بث', category: 'streams', protected: false, disabled: false, restrictions: { allowedRoleIds: [], allowedChannelIds: [], blockedChannelIds: [] }, usage7d: { uses: 12, errors: 1, denied: 0 } }, { name: 'مساعدة', category: 'general', protected: true, disabled: false, restrictions: { allowedRoleIds: [], allowedChannelIds: [], blockedChannelIds: [] }, usage7d: { uses: 3, errors: 0, denied: 0 } }],
    limits: { maxMessages: 5, windowMs: 7000, duplicateCount: 3, escalationMs: [60000], source: 'default' }, reasons: [], reasonsSource: 'config', channelId: '500000000000000001', tickets: { 42: { id: 42, status: 'open' } }, panels: new Set(), reloads: [], seenIdem: new Set(), reloadReturnsUnverified: false };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const chunks = []; for await (const c of req) chunks.push(c); const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    S.calls.push({ method: req.method, path: u.pathname, body, idem: req.headers['x-idempotency-key'] });
    const out = (code, o) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify({ at: Date.now(), ...o })); };
    const ok = (detail, applied = false, verified = true) => out(200, { ok: true, applied, verified, detail });
    const bad = (code, status, msg) => out(status, { ok: false, applied: false, verified: false, code, error: msg });
    if (req.headers['x-admin-key'] !== CONTROL_KEY) return bad('UNAUTHORIZED', 401, 'مفتاح غير صالح');
    if (req.method !== 'GET' && !req.headers['x-idempotency-key']) return bad('INVALID_IDEMPOTENCY_KEY', 400, 'مفتاح التكرار مفقود');
    const p = decodeURIComponent(u.pathname.replace(/^\/admin-control/, '')); let m;
    if (p === '/status') return ok({ ready: true, ping: 42, uptime: 100, guilds: 1, commands: S.cmds.length, services: { streamerAnnouncer: { ready: true, registered: S.registered, tracked: S.registered, openEpisodes: 0, failedAnnouncements: 0, channelId: S.channelId }, db: { dialect: 'sqlite', connected: true } } });
    if (p === '/reload') { S.reloads.push(body.service); return ok({ service: body.service, before: {}, after: {} }, true, !S.reloadReturnsUnverified); }
    if (p === '/streamers/reload') { S.registered++; S.reloads.push('streamers'); return ok({ before: { registered: S.registered - 1 }, after: { registered: S.registered, tracked: S.registered } }, true, !S.reloadReturnsUnverified); }
    if (p === '/commands') return ok({ count: S.cmds.length, commands: S.cmds });
    if ((m = p.match(/^\/commands\/(.+)\/(disable|enable)$/))) { const c = S.cmds.find((x) => x.name === m[1]); if (!c) return bad('NOT_FOUND', 404, 'أمر غير موجود'); if (c.protected) return bad('PROTECTED_COMMAND', 409, 'أمر محمي'); c.disabled = m[2] === 'disable'; return ok({ name: c.name, disabled: c.disabled }, true); }
    if ((m = p.match(/^\/commands\/(.+)\/restrictions$/))) { const c = S.cmds.find((x) => x.name === m[1]); if (!c) return bad('NOT_FOUND', 404, 'أمر غير موجود'); c.restrictions = body; return ok({ name: c.name, restrictions: c.restrictions }, true); }
    if (p === '/usage') return ok({ days: Number(u.searchParams.get('days')), commands: S.cmds.map((c) => ({ name: c.name, ...c.usage7d })) });
    if (p === '/automod/limits') { if (req.method === 'PUT') { S.limits = { maxMessages: body.spamMaxMessages, windowMs: body.spamWindowSeconds * 1000, duplicateCount: body.spamDuplicates, escalationMs: (body.escalationMinutes || []).map((x) => x * 60000), source: 'database' }; return ok({ effective: S.limits }, true); } return ok({ effective: S.limits }); }
    if (p === '/tickets/reasons') { if (req.method === 'PUT') { S.reasons = body.reasons; S.reasonsSource = body.reasons.length ? 'database' : 'config'; return ok({ source: S.reasonsSource, reasons: S.reasons }, true); } return ok({ source: S.reasonsSource, reasons: S.reasons }); }
    if ((m = p.match(/^\/tickets\/(\d+)\/close$/))) { const t = S.tickets[m[1]]; if (!t) return bad('NOT_FOUND', 404, 'تكت غير موجود'); if (t.status === 'closed') return bad('ALREADY_CLOSED', 409, 'مغلق مسبقاً'); t.status = 'closed'; return ok({ ticket: { id: t.id, status: 'closed' }, channelState: 'archived' }, true); }
    if (p === '/tickets/panel') { if (S.panels.has(body.channelId)) return bad('PANEL_EXISTS', 409, 'اللوحة موجودة'); S.panels.add(body.channelId); const id = String(discordState.nextId++); discordState.messages.set(id, { id, channel_id: body.channelId, content: body.content, embeds: [], author: { id: discordState.botId }, pinned: false }); return ok({ channelId: body.channelId, messageId: id }, true); }
    if (p === '/streamers/channel') { if (!/^\d{16,21}$/.test(body.channelId || '')) return bad('INVALID_INPUT', 400, 'معرّف غير صالح'); S.channelId = body.channelId; return ok({ channelId: body.channelId }, true); }
    return bad('NOT_FOUND', 404, 'المسار غير موجود');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { S, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
