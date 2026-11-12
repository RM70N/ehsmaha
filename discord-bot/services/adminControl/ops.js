'use strict';

// عمليات قناة التحكم الإدارية. كل عملية: { name, method, path, mutating, handler({req, ctx, config}) → { applied, verified, detail } }.
// القاعدة: verified=true فقط بعد قراءة الحالة الفعلية (القاعدة/الكاش الداخلي) ومطابقتها للمطلوب.

const path = require('node:path');
const { ChannelType } = require('discord.js');
const db = require('../../database/botDb');
const store = require('../../database/botStore');
const logger = require('../../utils/logger');
const usageStats = require('../../utils/usageStats');
const adminPermissions = require('../../utils/adminPermissions');
const commandControl = require('../commandControl');
const autoModLimits = require('../autoModLimits');
const autoModService = require('../autoMod');
const tickets = require('../tickets');
const announcerModule = require('../streamerAnnouncer');
const streamStore = require('../../database/streamerAnnouncements');
const { missingBotPermissions } = require('../../utils/permissions');
const pkg = require('../../package.json');

const SNOWFLAKE = /^\d{17,20}$/;
const ADMIN_ACTOR = 'admin-center';

class AdminError extends Error {
  constructor(code, message, status = 400, detail) {
    super(message);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const sameSet = (a, b) => a.length === b.length && [...new Set(a)].every((x) => b.includes(x)) && new Set(a).size === a.length;
const setEq = (a, b) => sameSet([...new Set(a)], [...new Set(b)]);

// السيرفر المستهدف: guildId صريح (والبوت فيه) أو الافتراضي (GUILD_ID / OFFICIAL_GUILD_ID / سيرفر وحيد)
function resolveGuild(req, ctx, config) {
  const explicit = (req.body && req.body.guildId) || (req.query && req.query.guildId);
  const guilds = ctx.client && ctx.client.guilds ? ctx.client.guilds.cache : new Map();
  if (explicit !== undefined) {
    if (!SNOWFLAKE.test(String(explicit))) throw new AdminError('INVALID_INPUT', 'guildId غير صالح.');
    if (!guilds.has(String(explicit))) throw new AdminError('GUILD_NOT_FOUND', 'البوت مو موجود بهذا السيرفر.', 404);
    return String(explicit);
  }
  const def = config.guildId || config.officialGuildId;
  if (def && guilds.has(def)) return def;
  if (guilds.size === 1) return [...guilds.keys()][0];
  throw new AdminError('GUILD_REQUIRED', 'حدّد guildId (البوت بأكثر من سيرفر ولا يوجد سيرفر افتراضي).');
}

async function audit(guildId, op, details) {
  try {
    await store.moderationLog.add({ guildId, action: `admin_control:${op}`, moderatorId: ADMIN_ACTOR, reason: null, details });
  } catch (err) {
    logger.warn('admin-control: تعذّر كتابة السجل الإداري', { op, error: err && err.message });
  }
}

function getCommand(ctx, name) {
  const c = ctx.commands && ctx.commands.get(decodeURIComponent(name));
  if (!c) throw new AdminError('COMMAND_NOT_FOUND', 'هذا الأمر غير موجود.', 404);
  return c;
}

const categoryOf = (file) => {
  const d = path.dirname(String(file || ''));
  return d === '.' ? 'general' : d.split(path.sep)[0];
};

// ---------------- الخدمات القابلة لإعادة التحميل ----------------
async function reloadAnnouncer() {
  const a = announcerModule.get();
  if (!a) throw new AdminError('SERVICE_NOT_READY', 'خدمة الإعلانات غير مشغّلة.', 503);
  const before = await a.status();
  await a.reload();
  const after = await a.status();
  // قراءة مستقلة من القاعدة: عدد الحسابات الفريدة المفعّلة يجب أن يطابق ما في ذاكرة المحرّك
  const rows = await streamStore.streamers.listEnabled();
  const expected = new Set(rows.map((r) => `${r.platform}:${r.normalized_username}`)).size;
  return { applied: true, verified: after.ready === true && after.registered === expected, before, after };
}

async function reloadAdminPermissions(ctx) {
  const ids = [...ctx.client.guilds.cache.keys()];
  const before = { cachedGuilds: ids.length };
  const after = await adminPermissions.reloadAll(ids);
  let roles = 0;
  let users = 0;
  for (const id of ids) {
    const rows = await store.adminConfig.list(id);
    roles += rows.filter((r) => r.type === 'role').length;
    users += rows.filter((r) => r.type === 'user').length;
  }
  return { applied: true, verified: after.roles === roles && after.users === users && after.guilds === ids.length, before, after: { ...after, dbRoles: roles, dbUsers: users } };
}

async function reloadAutoMod() {
  const before = autoModLimits._internal.cache.size;
  const rows = await autoModLimits.reload();
  if (typeof autoModService.invalidate === 'function') {
    for (const g of [...autoModLimits._internal.cache.keys()]) autoModService.invalidate(g);
  }
  const dbRows = await db.query('SELECT COUNT(*) AS n FROM automod_limits');
  return { applied: true, verified: autoModLimits._internal.isLoaded() && rows === Number(dbRows[0].n), before: { guildsWithLimits: before }, after: { guildsWithLimits: rows } };
}

async function reloadCommandControl() {
  const before = commandControl._internal.cache.size;
  const rows = await commandControl.reload();
  const dbRows = await db.query('SELECT COUNT(*) AS n FROM command_controls');
  return { applied: true, verified: rows === Number(dbRows[0].n), before: { rows: before }, after: { rows } };
}

async function reloadTicketReasons() {
  const rows = await tickets.loadReasons();
  const dbRows = await db.query('SELECT COUNT(*) AS n FROM ticket_reasons WHERE enabled = 1');
  return { applied: true, verified: rows === Number(dbRows[0].n), before: null, after: { rows } };
}

const RELOADERS = {
  streamerAnnouncer: reloadAnnouncer,
  adminPermissions: reloadAdminPermissions,
  autoMod: reloadAutoMod,
  commandControl: reloadCommandControl,
  ticketReasons: reloadTicketReasons
};
const RELOAD_SERVICES = ['streamerAnnouncer', 'adminPermissions', 'autoMod', 'all'];

async function runReload(service, ctx) {
  if (service !== 'all') {
    try {
      return await RELOADERS[service](ctx);
    } catch (err) {
      if (err instanceof AdminError) throw err;
      logger.error('admin-control: فشل إعادة تحميل خدمة', { service, error: err });
      throw new AdminError('RELOAD_FAILED', 'تعذّرت إعادة تحميل الخدمة.', 500);
    }
  }
  const services = {};
  let applied = true;
  let verified = true;
  for (const name of Object.keys(RELOADERS)) {
    try {
      const r = await RELOADERS[name](ctx);
      services[name] = r;
      applied = applied && r.applied;
      verified = verified && r.verified;
    } catch (err) {
      services[name] = { applied: false, verified: false, error: { code: err.code || 'FAILED' } };
      applied = false;
      verified = false;
    }
  }
  return { applied, verified, services };
}

// ---------------- العمليات ----------------
const OPS = [];
const op = (o) => OPS.push(o);

op({
  name: 'status',
  method: 'get',
  path: '/status',
  mutating: false,
  async handler({ ctx }) {
    const client = ctx.client;
    const a = announcerModule.get();
    let dbState = { dialect: db.dialect(), connected: db.isReady() };
    let announcer = { ready: false };
    try {
      announcer = a ? await a.status() : { ready: false, started: false };
    } catch {
      announcer = { ready: false };
    }
    const snap = usageStats.snapshot();
    return {
      applied: false,
      verified: true,
      detail: {
        ready: !!(client && client.isReady && client.isReady()),
        ping: client && client.ws ? client.ws.ping : null,
        uptime: Math.floor(process.uptime()),
        version: { bot: pkg.version, node: process.version },
        guilds: client && client.guilds ? client.guilds.cache.size : 0,
        commands: ctx.commands ? ctx.commands.size : 0,
        services: {
          streamerAnnouncer: announcer,
          welcome: { available: ctx.commands ? ctx.commands.has('قناة_الترحيب') : false },
          autoMod: { limitsLoaded: autoModLimits._internal.isLoaded(), guildsWithLimits: autoModLimits._internal.cache.size },
          tickets: { reasonsLoaded: true },
          commandControl: { loaded: commandControl._internal.isLoaded(), rows: commandControl._internal.cache.size },
          usage: { day: snap.day, commands: snap.commands, errors: snap.errors, pendingFlush: usageStats._internal.pending.size },
          db: dbState
        }
      }
    };
  }
});

op({
  name: 'reload',
  method: 'post',
  path: '/reload',
  mutating: true,
  async handler({ req, ctx, config }) {
    const service = req.body && req.body.service;
    if (!RELOAD_SERVICES.includes(service)) throw new AdminError('INVALID_INPUT', `service لازم تكون واحدة من: ${RELOAD_SERVICES.join(' / ')}`);
    const r = await runReload(service, ctx);
    try {
      await audit(resolveGuild(req, ctx, config), `reload`, { service, verified: r.verified });
    } catch {
      /* ما فيه سيرفر افتراضي — ما نسجّل */
    }
    return { applied: r.applied, verified: r.verified, detail: { service, ...(r.services ? { services: r.services } : { before: r.before, after: r.after }) } };
  }
});

op({
  name: 'commands.list',
  method: 'get',
  path: '/commands',
  mutating: false,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    let usage = null;
    try {
      usage = new Map((await usageStats.usage(7)).commands.map((c) => [c.name, c]));
    } catch {
      usage = null;
    }
    const commands = [...ctx.commands.values()].map((c) => {
      const ctl = commandControl.get(guildId, c.name);
      const u = usage && usage.get(c.name);
      return {
        name: c.name,
        file: c.file,
        category: categoryOf(c.file),
        description: (Array.isArray(c.data) ? c.data[0] : c.data).description || null,
        protected: commandControl.isProtected(c.name),
        disabled: ctl.disabled,
        restrictions: { allowedRoleIds: ctl.allowedRoleIds, allowedChannelIds: ctl.allowedChannelIds, blockedChannelIds: ctl.blockedChannelIds },
        usage7d: u ? { uses: u.uses, errors: u.errors, denied: u.denied, lastErrorCode: u.lastErrorCode } : usage ? { uses: 0, errors: 0, denied: 0, lastErrorCode: null } : null
      };
    });
    return { applied: false, verified: true, detail: { guildId, count: commands.length, commands } };
  }
});

for (const action of ['disable', 'enable']) {
  op({
    name: `commands.${action}`,
    method: 'post',
    path: `/commands/:name/${action}`,
    mutating: true,
    async handler({ req, ctx, config }) {
      const cmd = getCommand(ctx, req.params.name);
      const guildId = resolveGuild(req, ctx, config);
      const want = action === 'disable';
      let stored;
      try {
        stored = await commandControl.setDisabled(guildId, cmd.name, want, ADMIN_ACTOR);
      } catch (err) {
        if (err instanceof commandControl.ControlError) throw new AdminError(err.code, err.message, err.code === 'PROTECTED_COMMAND' ? 409 : 400);
        throw err;
      }
      const live = commandControl.get(guildId, cmd.name);
      await audit(guildId, `command_${action}`, { command: cmd.name });
      return { applied: true, verified: !!stored && stored.disabled === want && live.disabled === want, detail: { guildId, name: cmd.name, disabled: live.disabled } };
    }
  });
}

op({
  name: 'commands.restrictions',
  method: 'put',
  path: '/commands/:name/restrictions',
  mutating: true,
  async handler({ req, ctx, config }) {
    const cmd = getCommand(ctx, req.params.name);
    const guildId = resolveGuild(req, ctx, config);
    const b = req.body || {};
    let stored;
    try {
      stored = await commandControl.setRestrictions(guildId, cmd.name, { allowedRoleIds: b.allowedRoleIds, allowedChannelIds: b.allowedChannelIds, blockedChannelIds: b.blockedChannelIds }, ADMIN_ACTOR);
    } catch (err) {
      if (err instanceof commandControl.ControlError) throw new AdminError(err.code, err.message, err.code === 'PROTECTED_COMMAND' ? 409 : 400);
      throw err;
    }
    const live = commandControl.get(guildId, cmd.name);
    const norm = (x) => (Array.isArray(x) ? x.map(String) : []);
    const ok = !!stored && setEq(stored.allowedRoleIds, norm(b.allowedRoleIds)) && setEq(stored.allowedChannelIds, norm(b.allowedChannelIds)) && setEq(stored.blockedChannelIds, norm(b.blockedChannelIds)) && setEq(live.allowedRoleIds, stored.allowedRoleIds);
    await audit(guildId, 'command_restrictions', { command: cmd.name, roles: stored.allowedRoleIds.length, allowed: stored.allowedChannelIds.length, blocked: stored.blockedChannelIds.length });
    return { applied: true, verified: ok, detail: { guildId, name: cmd.name, restrictions: { allowedRoleIds: live.allowedRoleIds, allowedChannelIds: live.allowedChannelIds, blockedChannelIds: live.blockedChannelIds } } };
  }
});

op({
  name: 'streamers.reload',
  method: 'post',
  path: '/streamers/reload',
  mutating: true,
  async handler({ req, ctx, config }) {
    const r = await runReload('streamerAnnouncer', ctx);
    try {
      await audit(resolveGuild(req, ctx, config), 'streamers_reload', { registered: r.after.registered });
    } catch {
      /* بدون سيرفر افتراضي */
    }
    return { applied: r.applied, verified: r.verified, detail: { before: r.before, after: r.after } };
  }
});

op({
  name: 'streamers.channel',
  method: 'put',
  path: '/streamers/channel',
  mutating: true,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    const channelId = String((req.body && req.body.channelId) || '');
    if (!SNOWFLAKE.test(channelId)) throw new AdminError('INVALID_INPUT', 'channelId غير صالح.');
    const client = ctx.client;
    const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
    if (!channel) throw new AdminError('CHANNEL_NOT_FOUND', 'الروم غير موجود أو البوت ما يوصله.', 404);
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) || typeof channel.send !== 'function') throw new AdminError('NOT_TEXT_CHANNEL', 'لازم يكون روم نصي.', 422);
    if (!channel.guild || channel.guild.id !== guildId) throw new AdminError('CHANNEL_GUILD_MISMATCH', 'الروم مو من هذا السيرفر.', 422);
    const missing = missingBotPermissions(channel.guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel);
    if (missing.length) throw new AdminError('MISSING_PERMISSIONS', 'البوت ناقصه صلاحيات بالروم.', 422, { missing });
    const stored = await streamStore.settings.setAnnounceChannel(guildId, channelId, ADMIN_ACTOR);
    const a = announcerModule.get();
    if (a) a.setChannel(channelId);
    const live = a ? (await a.status()).channelId : channelId;
    await audit(guildId, 'streamers_channel', { channelId });
    return { applied: true, verified: stored === channelId && live === channelId, detail: { channelId: live, source: 'database' } };
  }
});

op({
  name: 'usage',
  method: 'get',
  path: '/usage',
  mutating: false,
  async handler({ req }) {
    const days = Number.parseInt(req.query.days, 10);
    const u = await usageStats.usage(Number.isInteger(days) ? days : 7);
    return { applied: false, verified: true, detail: { ...u, today: usageStats.snapshot() } };
  }
});

const limitsPatchFrom = (b) => {
  const pick = (a, c) => (b[a] !== undefined ? b[a] : b[c]);
  const patch = {};
  const m = pick('spamMaxMessages', 'spam_max_messages');
  const w = pick('spamWindowSeconds', 'spam_window_seconds');
  const d = pick('spamDuplicates', 'spam_duplicates');
  const e = pick('escalationMinutes', 'escalation_minutes');
  if (m !== undefined) patch.spamMaxMessages = m;
  if (w !== undefined) patch.spamWindowSeconds = w;
  if (d !== undefined) patch.spamDuplicates = d;
  if (e !== undefined) patch.escalationMinutes = e;
  return patch;
};

op({
  name: 'automod.limits.get',
  method: 'get',
  path: '/automod/limits',
  mutating: false,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    return { applied: false, verified: true, detail: { guildId, effective: autoModLimits.effective(guildId) } };
  }
});

op({
  name: 'automod.limits.put',
  method: 'put',
  path: '/automod/limits',
  mutating: true,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    const patch = limitsPatchFrom(req.body || {});
    let eff;
    try {
      eff = await autoModLimits.set(guildId, patch, ADMIN_ACTOR);
    } catch (err) {
      if (err instanceof autoModLimits.LimitsError) throw new AdminError('INVALID_INPUT', err.message);
      throw err;
    }
    const live = autoModLimits.effective(guildId);
    let ok = true;
    if (patch.spamMaxMessages !== undefined) ok = ok && live.maxMessages === Number(patch.spamMaxMessages);
    if (patch.spamWindowSeconds !== undefined) ok = ok && live.windowMs === Number(patch.spamWindowSeconds) * 1000;
    if (patch.spamDuplicates !== undefined) ok = ok && live.duplicateCount === Number(patch.spamDuplicates);
    if (patch.escalationMinutes !== undefined) ok = ok && JSON.stringify(live.escalationMs) === JSON.stringify(patch.escalationMinutes.map((m) => Number(m) * 60000));
    await audit(guildId, 'automod_limits', patch);
    return { applied: true, verified: ok && JSON.stringify(eff) === JSON.stringify(live), detail: { guildId, effective: live } };
  }
});

op({
  name: 'tickets.reasons.get',
  method: 'get',
  path: '/tickets/reasons',
  mutating: false,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    const rows = await db.query('SELECT 1 AS x FROM ticket_reasons WHERE guild_id = ? LIMIT 1', [guildId]);
    return { applied: false, verified: true, detail: { guildId, source: rows.length ? 'database' : 'config', reasons: tickets.reasonsFor(guildId) } };
  }
});

op({
  name: 'tickets.reasons.put',
  method: 'put',
  path: '/tickets/reasons',
  mutating: true,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    const list = req.body && req.body.reasons;
    let res;
    try {
      res = await tickets.setReasons(guildId, list);
    } catch (err) {
      if (err && err.code === 'INVALID_INPUT') throw new AdminError('INVALID_INPUT', err.message);
      throw err;
    }
    const want = Array.isArray(list) ? list.filter((r) => r.enabled !== false).map((r) => r.value) : [];
    const have = tickets.reasonsFor(guildId).map((r) => r.value);
    const ok = want.length === 0 ? res.source === 'config' : JSON.stringify(want) === JSON.stringify(have) || setEq(want, have);
    await audit(guildId, 'ticket_reasons', { count: want.length });
    return { applied: true, verified: ok, detail: { guildId, source: res.source, reasons: res.reasons } };
  }
});

op({
  name: 'tickets.close',
  method: 'post',
  path: '/tickets/:id/close',
  mutating: true,
  async handler({ req, ctx }) {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AdminError('INVALID_INPUT', 'رقم التكت غير صالح.');
    const r = await tickets.closeTicketById({ client: ctx.client, ticketId: id, closedBy: ADMIN_ACTOR });
    if (!r.ok) {
      const map = { NOT_FOUND: [404, 'التكت غير موجود.'], ALREADY_CLOSED: [409, 'التكت مغلق مسبقاً.'], GUILD_UNAVAILABLE: [503, 'السيرفر غير متاح للبوت.'] };
      const [status, msg] = map[r.code] || [400, 'تعذّر إغلاق التكت.'];
      throw new AdminError(r.code, msg, status);
    }
    const after = await store.tickets.get(id);
    return {
      applied: true,
      verified: !!after && after.status === 'closed',
      detail: { ticket: { id, status: after && after.status, channelId: r.channelId }, channelState: r.channelState, mode: r.mode, notes: r.notes }
    };
  }
});

op({
  name: 'tickets.panel',
  method: 'post',
  path: '/tickets/panel',
  mutating: true,
  async handler({ req, ctx, config }) {
    const guildId = resolveGuild(req, ctx, config);
    const channelId = String((req.body && req.body.channelId) || '');
    const content = String((req.body && req.body.content) || '').replace(/\\n/g, '\n').trim();
    if (!SNOWFLAKE.test(channelId)) throw new AdminError('INVALID_INPUT', 'channelId غير صالح.');
    if (!content || content.length > 1500) throw new AdminError('INVALID_INPUT', 'content لازم يكون 1-1500 حرف.');
    const guild = ctx.client.guilds.cache.get(guildId);
    const channel = guild && (guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null)));
    if (!channel || typeof channel.send !== 'function') throw new AdminError('CHANNEL_NOT_FOUND', 'القناة غير موجودة أو ما أقدر أرسل لها.', 404);
    const missing = [...missingBotPermissions(guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel), ...missingBotPermissions(guild, tickets.TICKET_BOT_PERMS)];
    if (missing.length) throw new AdminError('MISSING_PERMISSIONS', 'البوت ناقصه صلاحيات.', 422, { missing: [...new Set(missing)] });
    const r = await tickets.publishPanel({ guild, channel, content, createdBy: ADMIN_ACTOR });
    if (!r.ok) {
      if (r.code === 'PANEL_EXISTS') throw new AdminError('PANEL_EXISTS', 'فيه لوحة تكتات بهذي القناة مسبقاً.', 409, { panelId: r.panelId });
      throw new AdminError(r.code, 'تعذّر نشر اللوحة.', 502);
    }
    const msg = await channel.messages.fetch(r.messageId).catch(() => null); // تحقق فعلي: الرسالة موجودة بالقناة
    const row = await store.tickets.getPanel(r.panelId).catch(() => null);
    return { applied: true, verified: !!msg && !!row && String(row.message_id) === String(r.messageId), detail: { panelId: r.panelId, messageId: r.messageId, channelId } };
  }
});

module.exports = { OPS, AdminError, RELOAD_SERVICES, _internal: { resolveGuild } };
