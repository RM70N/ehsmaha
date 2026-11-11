// Discord REST Adapter — عمليات السيرفر عبر Discord API نفسه (لا تمرّ بالبوت).
// يعالج: حدود المعدل (429)، المهلة، تحويل أخطاء ديسكورد لرسائل عربية واضحة.
import { sleep } from '../lib/util.js';

const MSGS = {
  50013: 'البوت لا يملك الصلاحية المطلوبة أو رتبته أدنى من الهدف',
  50001: 'البوت لا يملك وصولاً لهذا العنصر',
  10007: 'العضو غير موجود في السيرفر',
  10008: 'الرسالة غير موجودة',
  10003: 'القناة غير موجودة',
  10011: 'الرتبة غير موجودة',
  10026: 'الحظر غير موجود (العضو غير محظور)',
  50035: 'مدخلات مرفوضة من ديسكورد',
  50007: 'تعذّر إرسال رسالة خاصة لهذا العضو',
  30003: 'تجاوز حد التثبيت (50 رسالة)'
};

export function createDiscord(cfg) {
  const d = cfg.discord;
  const available = !!d.token;
  const reason = available ? '' : 'لم يُضبط DISCORD_BOT_TOKEN';

  async function req(method, path, { body, query, reason: auditReason, retries = 2 } = {}) {
    if (!available) { const e = new Error(reason); e.code = 'DISCORD_UNAVAILABLE'; e.status = 503; throw e; }
    const url = new URL(d.apiBase.replace(/\/$/, '') + path);
    for (const [k, v] of Object.entries(query || {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const headers = { Authorization: `Bot ${d.token}`, 'User-Agent': 'EhsmahaAdminControlCenter (internal, 1.0)' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auditReason) headers['X-Audit-Log-Reason'] = encodeURIComponent(String(auditReason).slice(0, 400));
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      let res;
      try { res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal }); }
      catch (e) { clearTimeout(timer); const err = new Error(e.name === 'AbortError' ? 'انتهت مهلة الاتصال بـDiscord' : 'تعذّر الاتصال بـDiscord'); err.code = 'DISCORD_NETWORK'; err.status = 502; throw err; }
      clearTimeout(timer);
      if (res.status === 429 && attempt < retries) {
        const j = await res.json().catch(() => ({}));
        await sleep(Math.min(5000, Math.ceil((j.retry_after || Number(res.headers.get('retry-after')) || 1) * 1000)));
        continue;
      }
      if (res.status === 204) return null;
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
      if (!res.ok) {
        const err = new Error((json && MSGS[json.code]) || (res.status === 401 ? 'توكن البوت غير صالح' : res.status === 403 ? 'ممنوع: صلاحيات البوت غير كافية' : res.status === 404 ? 'العنصر غير موجود في Discord' : res.status === 429 ? 'تجاوز حد معدل Discord — حاول بعد قليل' : `رفض Discord الطلب (${res.status})`));
        err.code = 'DISCORD_API'; err.status = res.status; err.discordCode = json && json.code; throw err;
      }
      return json;
    }
  }

  const G = (id) => id || d.guildId;
  const need = (id) => { if (!G(id)) { const e = new Error('لم يُضبط DISCORD_GUILD_ID'); e.code = 'DISCORD_NO_GUILD'; e.status = 503; throw e; } return G(id); };

  return {
    available, reason, guildId: d.guildId, appId: d.appId, req,
    me: () => req('GET', '/users/@me'),
    guild: (id) => req('GET', `/guilds/${need(id)}`, { query: { with_counts: true } }),
    channels: (id) => req('GET', `/guilds/${need(id)}/channels`),
    roles: (id) => req('GET', `/guilds/${need(id)}/roles`),
    member: (userId, gid) => req('GET', `/guilds/${need(gid)}/members/${userId}`),
    searchMembers: (query, limit = 25, gid) => req('GET', `/guilds/${need(gid)}/members/search`, { query: { query, limit } }),
    listMembers: (limit = 100, after, gid) => req('GET', `/guilds/${need(gid)}/members`, { query: { limit, after } }),
    bans: (gid, limit = 100) => req('GET', `/guilds/${need(gid)}/bans`, { query: { limit } }),
    ban: (userId, { reason, deleteSeconds = 0 } = {}, gid) => req('PUT', `/guilds/${need(gid)}/bans/${userId}`, { body: { delete_message_seconds: deleteSeconds }, reason }),
    getBan: (userId, gid) => req('GET', `/guilds/${need(gid)}/bans/${userId}`),
    unban: (userId, reason, gid) => req('DELETE', `/guilds/${need(gid)}/bans/${userId}`, { reason }),
    kick: (userId, reason, gid) => req('DELETE', `/guilds/${need(gid)}/members/${userId}`, { reason }),
    patchMember: (userId, body, reason, gid) => req('PATCH', `/guilds/${need(gid)}/members/${userId}`, { body, reason }),
    addRole: (userId, roleId, reason, gid) => req('PUT', `/guilds/${need(gid)}/members/${userId}/roles/${roleId}`, { reason }),
    removeRole: (userId, roleId, reason, gid) => req('DELETE', `/guilds/${need(gid)}/members/${userId}/roles/${roleId}`, { reason }),
    channel: (id) => req('GET', `/channels/${id}`),
    sendMessage: (channelId, body) => req('POST', `/channels/${channelId}/messages`, { body }),
    getMessage: (channelId, id) => req('GET', `/channels/${channelId}/messages/${id}`),
    editMessage: (channelId, id, body) => req('PATCH', `/channels/${channelId}/messages/${id}`, { body }),
    deleteMessage: (channelId, id, reason) => req('DELETE', `/channels/${channelId}/messages/${id}`, { reason }),
    pinMessage: (channelId, id, reason) => req('PUT', `/channels/${channelId}/pins/${id}`, { reason }),
    unpinMessage: (channelId, id, reason) => req('DELETE', `/channels/${channelId}/pins/${id}`, { reason }),
    pins: (channelId) => req('GET', `/channels/${channelId}/pins`),
    recentMessages: (channelId, limit = 50) => req('GET', `/channels/${channelId}/messages`, { query: { limit } }),
    auditLog: (gid, query = {}) => req('GET', `/guilds/${need(gid)}/audit-logs`, { query }),
    patchGuild: (body, reason, gid) => req('PATCH', `/guilds/${need(gid)}`, { body, reason }),
    appCommands: (gid) => req('GET', gid ? `/applications/${d.appId}/guilds/${gid}/commands` : `/applications/${d.appId}/commands`),
    createAppCommand: (body, gid) => req('POST', gid ? `/applications/${d.appId}/guilds/${gid}/commands` : `/applications/${d.appId}/commands`, { body }),
    deleteAppCommand: (id, gid) => req('DELETE', gid ? `/applications/${d.appId}/guilds/${gid}/commands/${id}` : `/applications/${d.appId}/commands/${id}`),
    patchAppCommand: (id, body, gid) => req('PATCH', gid ? `/applications/${d.appId}/guilds/${gid}/commands/${id}` : `/applications/${d.appId}/commands/${id}`, { body }),
    ping: async () => { const t = Date.now(); const me = await req('GET', '/users/@me', { retries: 0 }); return { ok: true, ms: Date.now() - t, bot: me && me.username }; }
  };
}
