'use strict';

// محاكاة مبسّطة وواقعية لكائنات discord.js (سيرفر، رتب، أعضاء، قنوات، رسائل)
// لاختبار الأوامر الإدارية بدون اتصال فعلي بديسكورد. تسجّل كل عملية بـguild.log.

const { Collection, PermissionsBitField, PermissionFlagsBits, ChannelType, InteractionType } = require('discord.js');

let seq = 500000000000000000n;
const nextId = () => String(++seq);

function makeRole(guild, { id = nextId(), name, position, permissions = [], managed = false }) {
  const role = {
    id,
    name,
    position,
    managed,
    permissions: new PermissionsBitField(permissions),
    get editable() {
      return guild.members.me.roles.highest.position > this.position;
    },
    get members() {
      return guild.members.cache.filter((m) => m.roles.cache.has(id));
    },
    toString: () => `<@&${id}>`
  };
  guild.roles.cache.set(id, role);
  return role;
}

function makeMember(guild, { id = nextId(), username = 'user' + id.slice(-4), roles = [], bot = false, admin = false, dmOpen = true } = {}) {
  const user = {
    id,
    username,
    tag: username,
    bot,
    toString: () => `<@${id}>`,
    displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png',
    async send(payload) {
      if (!dmOpen) {
        const e = new Error('Cannot send messages to this user');
        e.code = 50007;
        throw e;
      }
      guild.log.push(['dm', id, payload]);
    }
  };
  const roleCache = new Collection();
  roleCache.set(guild.id, guild.roles.everyone);
  for (const r of roles) roleCache.set(r.id, r);
  const member = {
    id,
    user,
    guild,
    communicationDisabledUntil: null,
    toString: () => `<@${id}>`,
    get permissions() {
      if (guild.ownerId === id || admin) return new PermissionsBitField(PermissionsBitField.All);
      return new PermissionsBitField([...roleCache.values()].map((r) => r.permissions.bitfield));
    },
    roles: {
      cache: roleCache,
      get highest() {
        return [...roleCache.values()].sort((a, b) => b.position - a.position)[0];
      },
      async add(role) {
        if (guild.failNext === 'roles.add') { guild.failNext = null; const e = new Error('Missing Permissions'); e.code = 50013; throw e; }
        const list = Array.isArray(role) ? role : [role];
        for (const r of list) roleCache.set(r.id, r);
        guild.log.push(['roles.add', id, list.map((r) => r.name)]);
        guild.roleSnapshots.push([id, [...roleCache.values()].map((r) => r.name)]);
      },
      async remove(role) {
        const list = Array.isArray(role) ? role : [role];
        for (const r of list) roleCache.delete(r.id);
        guild.log.push(['roles.remove', id, list.map((r) => r.name)]);
        guild.roleSnapshots.push([id, [...roleCache.values()].map((r) => r.name)]);
      }
    },
    get moderatable() {
      if (this.permissions.has(PermissionFlagsBits.Administrator)) return false;
      return guild.members.me.roles.highest.position > this.roles.highest.position && id !== guild.ownerId;
    },
    get kickable() {
      return guild.members.me.roles.highest.position > this.roles.highest.position && id !== guild.ownerId;
    },
    isCommunicationDisabled() {
      return !!this.communicationDisabledUntil && this.communicationDisabledUntil > Date.now();
    },
    async timeout(ms, reason) {
      if (guild.failNext === 'timeout') { guild.failNext = null; throw new Error('boom'); }
      this.communicationDisabledUntil = Date.now() + ms;
      guild.log.push(['timeout', id, ms, reason]);
    },
    async kick(reason) {
      guild.members.cache.delete(id);
      guild.log.push(['kick', id, reason]);
    }
  };
  guild.members.cache.set(id, member);
  return member;
}

function makeMessage(channel, { ageMs = 0, system = false } = {}) {
  const id = nextId();
  return { id, createdTimestamp: Date.now() - ageMs, deletable: !system, channelId: channel.id };
}

function makeChannel(guild, { id = nextId(), name = 'general', type = ChannelType.GuildText, parentId = null, botPerms = null, overwrites = [] } = {}) {
  const channel = {
    id,
    name,
    type,
    parentId,
    guild,
    url: `https://discord.com/channels/${guild.id}/${id}`,
    messagesStore: [], // الأحدث أولاً
    overwrites: new Map(overwrites.map((o) => [o.id, o])),
    toString: () => `<#${id}>`,
    permissionsFor(member) {
      if (member.id === guild.members.me.id && botPerms) return new PermissionsBitField(botPerms);
      return member.permissions;
    },
    async send(payload) {
      if (guild.failNext === 'send') { guild.failNext = null; const e = new Error('Missing Access'); e.code = 50001; throw e; }
      const msg = { id: nextId(), payload, url: `https://discord.com/channels/${guild.id}/${id}/x` };
      guild.log.push(['send', id, payload]);
      return msg;
    },
    messages: {
      async fetch({ limit, before }) {
        let list = channel.messagesStore;
        if (before) {
          const idx = list.findIndex((m) => m.id === before);
          list = list.slice(idx + 1);
        }
        const out = new Collection();
        for (const m of list.slice(0, limit)) out.set(m.id, m);
        guild.log.push(['fetch', id, limit]);
        return out;
      }
    },
    async bulkDelete(msgs, filterOld) {
      const arr = Array.isArray(msgs) ? msgs : [...msgs.values()];
      if (arr.length > 100) throw new Error('bulk > 100');
      if (guild.bulkTooOld) {
        guild.bulkTooOld = false;
        const e = new Error('You can only bulk delete messages that are under 14 days old.');
        e.code = 50034;
        throw e;
      }
      const ids = new Set(arr.map((m) => m.id));
      channel.messagesStore = channel.messagesStore.filter((m) => !ids.has(m.id));
      guild.log.push(['bulkDelete', id, arr.length, filterOld, Date.now()]);
      const out = new Collection();
      arr.forEach((m) => out.set(m.id, m));
      return out;
    },
    permissionOverwrites: {
      async edit(target, perms) {
        channel.overwrites.set(target, { id: target, ...(channel.overwrites.get(target) || {}), edit: perms });
        guild.log.push(['overwrite', id, target, perms]);
      }
    },
    async setParent(parent) {
      channel.parentId = parent;
      guild.log.push(['setParent', id, parent]);
    },
    async setName(n) {
      channel.name = n;
    },
    async delete() {
      guild.channels.cache.delete(id);
      guild.log.push(['deleteChannel', id]);
    }
  };
  guild.channels.cache.set(id, channel);
  return channel;
}

/**
 * سيرفر كامل: مالك، البوت برتبة عالية، رتبة مشرف، أعضاء عاديين.
 * botPerms: صلاحيات رتبة البوت (افتراضياً كل ما يلزم)
 */
function makeGuild({ botPerms } = {}) {
  const id = nextId();
  const guild = {
    id,
    name: 'سيرفر احسمها',
    ownerId: null,
    log: [],
    roleSnapshots: [],
    failNext: null,
    bulkTooOld: false,
    iconURL: () => null,
    roles: { cache: new Collection() },
    members: { cache: new Collection(), me: null, async fetch() { return guild.members.cache; } },
    channels: {
      cache: new Collection(),
      async fetch(cid) {
        const c = guild.channels.cache.get(cid);
        if (!c) throw Object.assign(new Error('Unknown Channel'), { code: 10003 });
        return c;
      },
      async create(opts) {
        if (guild.failNext === 'createChannel') { guild.failNext = null; const e = new Error('Missing Permissions'); e.code = 50013; throw e; }
        const ch = makeChannel(guild, { name: opts.name, type: opts.type, parentId: opts.parent || null, overwrites: opts.permissionOverwrites || [] });
        ch.topic = opts.topic;
        guild.log.push(['createChannel', ch.id, opts]);
        return ch;
      }
    }
  };
  guild.roles.everyone = makeRole(guild, { id, name: '@everyone', position: 0 });
  guild.roles.create = async (opts) => {
    const r = makeRole(guild, { name: opts.name, position: 1, permissions: [] });
    guild.log.push(['createRole', opts.name]);
    return r;
  };
  const botRole = makeRole(guild, {
    name: 'احسمها',
    position: 50,
    managed: true,
    permissions: botPerms || [
      PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ModerateMembers,
      PermissionFlagsBits.KickMembers
    ]
  });
  guild.members.me = makeMember(guild, { username: 'احسمها', roles: [botRole], bot: true });
  const owner = makeMember(guild, { username: 'owner' });
  guild.ownerId = owner.id;
  guild.owner = owner;
  guild.botRole = botRole;
  return guild;
}

function makeInteraction({ guild, member, kind = 'command', commandName, customId, options = {}, values }) {
  const log = [];
  const i = {
    id: nextId(),
    type: kind === 'command' ? InteractionType.ApplicationCommand : InteractionType.MessageComponent,
    commandName,
    customId,
    values,
    user: member.user,
    member,
    guild,
    guildId: guild.id,
    channelId: options.__channelId || nextId(),
    deferred: false,
    replied: false,
    memberPermissions: member.permissions,
    appPermissions: new PermissionsBitField(PermissionsBitField.All),
    client: { users: { fetch: async (uid) => (guild.members.cache.get(uid) || {}).user || { id: uid, username: uid } }, guilds: { cache: new Map([[guild.id, guild]]) } },
    inGuild: () => true,
    isChatInputCommand: () => kind === 'command',
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isRepliable: () => true,
    isAutocomplete: () => false,
    options: {
      getMember: (n) => options[n] || null,
      getUser: (n) => (options[n] && (options[n].user || options[n])) || null,
      getChannel: (n) => options[n] || null,
      getRole: (n) => options[n] || null,
      getInteger: (n) => (options[n] === undefined ? null : options[n]),
      getString: (n) => (options[n] === undefined ? null : options[n]),
      getBoolean: (n) => (options[n] === undefined ? null : options[n])
    },
    log,
    async reply(p) { this.replied = true; log.push(['reply', p]); },
    async deferReply(p) { this.deferred = true; log.push(['deferReply', p || {}]); },
    async deferUpdate() { this.deferred = true; log.push(['deferUpdate']); },
    async editReply(p) { this.replied = true; log.push(['editReply', p]); },
    async followUp(p) { log.push(['followUp', p]); },
    async update(p) { this.replied = true; log.push(['update', p]); }
  };
  return i;
}

function lastPayload(i) {
  const sent = i.log.filter(([t]) => ['reply', 'editReply', 'followUp', 'update'].includes(t));
  if (!sent.length) throw new Error('البوت ما رد: ' + JSON.stringify(i.log.map(([t]) => t)));
  const [type, p] = sent[sent.length - 1];
  const embeds = (p.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e));
  const components = (p.components || []).map((c) => (c.toJSON ? c.toJSON() : c));
  return { type, p, embeds, components, text: JSON.stringify(embeds) };
}

module.exports = { makeGuild, makeRole, makeMember, makeChannel, makeMessage, makeInteraction, lastPayload, nextId };
