// خادم Discord وهمي محلي يحاكي نقاط REST التي تستخدمها اللوحة (حالة بالذاكرة) — لاختبارات تكامل حقيقية على مستوى HTTP.
import http from 'node:http';

export async function startDiscordMock({ guildId = '900000000000000001', appId = '800000000000000001', ownerId = '700000000000000001', botId = '600000000000000001' } = {}) {
  const S = {
    guildId, appId, ownerId, botId, calls: [], failNext: null, rateLimitOnce: false,
    guild: { id: guildId, name: 'سيرفر احسمها', owner_id: ownerId, description: 'قديم', features: ['COMMUNITY'], approximate_member_count: 5, approximate_presence_count: 2, premium_tier: 1, premium_subscription_count: 3, roles: [], emojis: [] },
    channels: [{ id: '500000000000000001', type: 0, name: 'عام', position: 0, guild_id: guildId, topic: 'قديم' }, { id: '500000000000000002', type: 0, name: 'إعلانات', position: 1, guild_id: guildId }, { id: '500000000000000009', type: 2, name: 'صوت', position: 2, guild_id: guildId }],
    roles: [{ id: guildId, name: '@everyone', position: 0, permissions: '0', managed: false }, { id: '400000000000000001', name: 'مشرف', position: 5, permissions: '8192', managed: false }, { id: '400000000000000002', name: 'VIP', position: 2, permissions: '0', managed: false }, { id: '400000000000000003', name: 'Admin', position: 9, permissions: '8', managed: false }],
    members: new Map(), bans: new Map(), messages: new Map(), pins: new Map(), cmds: [], nextId: 1000000000000000100n
  };
  const user = (id, name) => ({ id, username: name, global_name: name });
  const addMember = (id, name, roles = []) => S.members.set(id, { user: user(id, name), roles, nick: null, joined_at: '2024-01-01T00:00:00.000Z', communication_disabled_until: null });
  addMember(ownerId, 'owner'); addMember(botId, 'احسمها-bot', ['400000000000000003']);
  addMember('300000000000000001', 'ahmed'); addMember('300000000000000002', 'sara'); addMember('300000000000000003', 'khalid'); addMember('300000000000000004', 'noura');
  S.cmds = [
    { id: '100000000000000001', application_id: appId, name: 'مساعدة', description: 'يعرض الأوامر', type: 1, default_member_permissions: null, version: '1', scope: undefined },
    { id: '100000000000000002', application_id: appId, name: 'طرد', description: 'طرد عضو', type: 1, default_member_permissions: '2', options: [{ type: 6, name: 'عضو', description: 'العضو', required: true }], version: '1' },
    { id: '100000000000000003', application_id: appId, name: 'بث', description: 'البث', type: 1, default_member_permissions: null, version: '1' }
  ];
  const snow = () => String(S.nextId++);

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname.replace(/^\/api\/v10/, '');
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || 'null') : null;
    const reasonHdr = req.headers['x-audit-log-reason'] ? decodeURIComponent(req.headers['x-audit-log-reason']) : undefined;
    S.calls.push({ method: req.method, path: p, body, reason: reasonHdr });
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
    const err = (code, dcode, message = 'err') => send(code, { code: dcode, message });
    if (req.headers.authorization !== 'Bot test-token') return err(401, 0, '401: Unauthorized');
    if (S.rateLimitOnce) { S.rateLimitOnce = false; res.writeHead(429, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ retry_after: 0.05 })); }
    if (S.failNext) { const f = S.failNext; S.failNext = null; return err(f.status, f.code); }
    let m;
    if (req.method === 'GET' && p === '/users/@me') return send(200, user(botId, 'احسمها-bot'));
    if (m = p.match(/^\/guilds\/(\d+)$/)) { if (m[1] !== guildId) return err(404, 10004); if (req.method === 'GET') return send(200, { ...S.guild, roles: S.roles }); if (req.method === 'PATCH') { if (body.description !== undefined) S.guild.description = body.description; return send(200, S.guild); } }
    if (m = p.match(/^\/guilds\/(\d+)\/channels$/)) return send(200, S.channels);
    if (m = p.match(/^\/guilds\/(\d+)\/roles$/)) return send(200, S.roles);
    if (m = p.match(/^\/guilds\/(\d+)\/members\/search$/)) { const q = (u.searchParams.get('query') || '').toLowerCase(); return send(200, [...S.members.values()].filter((x) => x.user.username.toLowerCase().startsWith(q)).slice(0, 25)); }
    if (m = p.match(/^\/guilds\/(\d+)\/members$/) ) return send(200, [...S.members.values()].slice(0, Number(u.searchParams.get('limit') || 100)));
    if (m = p.match(/^\/guilds\/(\d+)\/members\/(\d+)\/roles\/(\d+)$/)) { const mem = S.members.get(m[2]); if (!mem) return err(404, 10007); if (!S.roles.some((r) => r.id === m[3])) return err(404, 10011); if (req.method === 'PUT') { if (!mem.roles.includes(m[3])) mem.roles.push(m[3]); return send(204); } if (req.method === 'DELETE') { mem.roles = mem.roles.filter((r) => r !== m[3]); return send(204); } }
    if (m = p.match(/^\/guilds\/(\d+)\/members\/(\d+)$/)) { const mem = S.members.get(m[2]); if (!mem) return err(404, 10007); if (req.method === 'GET') return send(200, mem); if (req.method === 'PATCH') { if ('nick' in body) mem.nick = body.nick; if ('communication_disabled_until' in body) mem.communication_disabled_until = body.communication_disabled_until; return send(200, mem); } if (req.method === 'DELETE') { S.members.delete(m[2]); return send(204); } }
    if (m = p.match(/^\/guilds\/(\d+)\/bans\/(\d+)$/)) { if (req.method === 'PUT') { if (!S.members.has(m[2]) && false) return err(404, 10007); S.bans.set(m[2], { user: user(m[2], S.members.get(m[2])?.user.username || 'u'), reason: reasonHdr || null }); S.members.delete(m[2]); return send(204); } if (req.method === 'GET') { return S.bans.has(m[2]) ? send(200, S.bans.get(m[2])) : err(404, 10026); } if (req.method === 'DELETE') { if (!S.bans.has(m[2])) return err(404, 10026); S.bans.delete(m[2]); return send(204); } }
    if (m = p.match(/^\/guilds\/(\d+)\/bans$/)) return send(200, [...S.bans.values()]);
    if (m = p.match(/^\/guilds\/(\d+)\/audit-logs$/)) return send(200, { audit_log_entries: [{ id: '1200000000000000001', action_type: 20, user_id: botId, target_id: '300000000000000001', reason: 'x' }] });
    if (m = p.match(/^\/channels\/(\d+)$/)) { const c = S.channels.find((x) => x.id === m[1]); if (!c) return err(404, 10003); if (req.method === 'GET') return send(200, c); if (req.method === 'PATCH') { if ('topic' in body) c.topic = body.topic; return send(200, c); } }
    if (m = p.match(/^\/channels\/(\d+)\/messages$/)) { if (!S.channels.some((x) => x.id === m[1])) return err(404, 10003); if (req.method === 'POST') { const id = snow(); const msg = { id, channel_id: m[1], content: body.content || '', embeds: body.embeds || [], author: user(botId, 'احسمها-bot'), pinned: false }; S.messages.set(id, msg); return send(200, msg); } return send(200, [...S.messages.values()].filter((x) => x.channel_id === m[1])); }
    if (m = p.match(/^\/channels\/(\d+)\/messages\/(\d+)$/)) { const msg = S.messages.get(m[2]); if (!msg || msg.channel_id !== m[1]) return err(404, 10008); if (req.method === 'GET') return send(200, msg); if (req.method === 'PATCH') { if ('content' in body) msg.content = body.content; if (body.embeds) msg.embeds = body.embeds; return send(200, msg); } if (req.method === 'DELETE') { S.messages.delete(m[2]); return send(204); } }
    if (m = p.match(/^\/channels\/(\d+)\/pins\/(\d+)$/)) { const msg = S.messages.get(m[2]); if (!msg) return err(404, 10008); msg.pinned = req.method === 'PUT'; return send(204); }
    if (m = p.match(/^\/applications\/(\d+)\/(?:guilds\/(\d+)\/)?commands$/)) { if (m[2] && req.method === 'GET') return send(200, []); if (req.method === 'GET') return send(200, S.cmds.map((c) => ({ ...c }))); if (req.method === 'POST') { const c = { ...body, id: snow(), application_id: appId, version: '2', default_member_permissions: body.default_member_permissions ?? null }; S.cmds.push(c); return send(201, c); } }
    if (m = p.match(/^\/applications\/(\d+)\/(?:guilds\/(\d+)\/)?commands\/(\d+)$/)) { const c = S.cmds.find((x) => x.id === m[3]); if (!c) return err(404, 10063); if (req.method === 'PATCH') { Object.assign(c, body); return send(200, c); } if (req.method === 'DELETE') { S.cmds = S.cmds.filter((x) => x.id !== m[3]); return send(204); } }
    return err(404, 0, 'unhandled ' + req.method + ' ' + p);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { S, url: `http://127.0.0.1:${server.address().port}/api/v10`, close: () => new Promise((r) => server.close(r)) };
}
