'use strict';

// عالم ديسكورد وهمي لاختبار نظام تنفيذ أوامر المالك (services/ownerAI): سيرفر، رومات (مع رسائل
// وتثبيت وثريدات)، رتب، أعضاء، صلاحيات للبوت لكل روم، وحقن أخطاء (failures) لكل عملية.
// يحاكي واجهات discord.js المستخدمة فقط — بدون أي اتصال حقيقي.

const { Collection, PermissionsBitField, PermissionFlagsBits, ChannelType } = require('discord.js');

let seq = 700000000000000000n;
const nextId = () => String(++seq);
const BOT_PERMS = [
  'ViewChannel', 'SendMessages', 'EmbedLinks', 'AttachFiles', 'ReadMessageHistory', 'ManageMessages', 'ManageChannels', 'ManageRoles',
  'ModerateMembers', 'KickMembers', 'CreatePublicThreads', 'SendMessagesInThreads', 'UseExternalEmojis'
];

function makeWorld({ botPerms = BOT_PERMS, ownerId = '944639301528977420' } = {}) {
  const guild = {
    id: nextId(),
    name: 'سيرفر احسمها',
    ownerId: null,
    log: [],
    failures: [], // { op, error, times }
    memberCount: 120,
    premiumSubscriptionCount: 7,
    premiumTier: 1,
    iconURL: () => null
  };
  const fail = (op, error, times = 1) => guild.failures.push({ op, error, times });
  const maybeFail = (op) => {
    const f = guild.failures.find((x) => x.op === op && x.times > 0);
    if (f) {
      f.times -= 1;
      throw f.error;
    }
  };
  const discordError = (code, message = 'Discord error') => Object.assign(new Error(message), { code });

  // ---------- الرتب ----------
  guild.roles = {
    cache: new Collection(),
    async fetch(id) {
      return guild.roles.cache.get(id) || null;
    }
  };
  function addRole({ name, position = 1, permissions = [], managed = false, color = 0, hoist = false, mentionable = false, id = nextId() }) {
    const role = {
      id, name, position, managed, color, hoist, mentionable, guild,
      permissions: new PermissionsBitField(permissions.map((p) => (typeof p === 'string' ? PermissionFlagsBits[p] : p))),
      get editable() {
        return !role.managed && guild.members.me.roles.highest.position > role.position;
      },
      get members() {
        return guild.members.cache.filter((m) => m.roles.cache.has(role.id));
      },
      toString: () => `<@&${id}>`,
      async setName(n) { maybeFail('role.edit'); role.name = n; guild.log.push(['role.setName', id, n]); return role; },
      async setColor(c) { maybeFail('role.edit'); role.color = c; guild.log.push(['role.setColor', id, c]); return role; },
      async setPosition(p) { maybeFail('role.edit'); role.position = p; guild.log.push(['role.setPosition', id, p]); return role; }
    };
    guild.roles.cache.set(id, role);
    return role;
  }
  guild.roles.everyone = addRole({ id: guild.id, name: '@everyone', position: 0, permissions: ['ViewChannel', 'SendMessages'] });
  guild.roles.create = async (opts) => {
    maybeFail('roles.create');
    const r = addRole({ name: opts.name, position: 1, color: opts.color || 0, hoist: opts.hoist, mentionable: opts.mentionable, permissions: opts.permissions ? [opts.permissions.bitfield] : [] });
    guild.log.push(['createRole', r.id, opts]);
    return r;
  };

  // ---------- الأعضاء ----------
  guild.members = {
    cache: new Collection(),
    me: null,
    async fetch(id) {
      if (id && typeof id === 'object') return guild.members.cache;
      return guild.members.cache.get(id) || null;
    },
    async search({ query }) {
      const out = new Collection();
      for (const m of guild.members.cache.values()) if (m.user.username.toLowerCase().includes(String(query).toLowerCase())) out.set(m.id, m);
      return out;
    }
  };
  function addMember({ id = nextId(), username, roles = [], bot = false, admin = false } = {}) {
    const roleCache = new Collection();
    roleCache.set(guild.id, guild.roles.everyone);
    for (const r of roles) roleCache.set(r.id, r);
    const user = {
      id, username: username || `user${id.slice(-4)}`, bot, createdTimestamp: Date.now() - 400 * 86400000,
      toString: () => `<@${id}>`,
      async send(payload) { guild.log.push(['dm', id, payload]); }
    };
    const member = {
      id, user, guild, displayName: user.username, nickname: null, joinedTimestamp: Date.now() - 30 * 86400000, communicationDisabledUntil: null,
      toString: () => `<@${id}>`,
      get permissions() {
        if (guild.ownerId === id || admin) return new PermissionsBitField(PermissionsBitField.All);
        return new PermissionsBitField([...roleCache.values()].map((r) => r.permissions.bitfield));
      },
      roles: {
        cache: roleCache,
        get highest() { return [...roleCache.values()].sort((a, b) => b.position - a.position)[0]; },
        async add(role) { maybeFail('roles.add'); const list = Array.isArray(role) ? role : [role]; list.forEach((r) => roleCache.set(r.id, r)); guild.log.push(['roles.add', id, list.map((r) => r.id)]); },
        async remove(role) { maybeFail('roles.remove'); const list = Array.isArray(role) ? role : [role]; list.forEach((r) => roleCache.delete(r.id)); guild.log.push(['roles.remove', id, list.map((r) => r.id)]); }
      },
      get moderatable() { return !member.permissions.has(PermissionFlagsBits.Administrator) && guild.members.me.roles.highest.position > member.roles.highest.position && id !== guild.ownerId; },
      get kickable() { return guild.members.me.roles.highest.position > member.roles.highest.position && id !== guild.ownerId; },
      isCommunicationDisabled() { return !!member.communicationDisabledUntil && member.communicationDisabledUntil > Date.now(); },
      async timeout(ms, reason) { maybeFail('timeout'); member.communicationDisabledUntil = ms ? Date.now() + ms : null; guild.log.push(['timeout', id, ms, reason]); },
      async kick(reason) { maybeFail('kick'); guild.members.cache.delete(id); guild.log.push(['kick', id, reason]); }
    };
    guild.members.cache.set(id, member);
    return member;
  }

  // ---------- الرومات ----------
  guild.channels = {
    cache: new Collection(),
    async fetch(id) {
      return guild.channels.cache.get(id) || null;
    },
    async create(opts) {
      maybeFail('channels.create');
      const ch = addChannel({ name: opts.name, type: opts.type, parentId: opts.parent || null, topic: opts.topic });
      guild.log.push(['createChannel', ch.id, opts]);
      return ch;
    }
  };
  function addChannel({ name, type = ChannelType.GuildText, parentId = null, topic = null, id = nextId(), deny = [] }) {
    const messages = new Map();
    const channel = {
      id, name, type, parentId, topic, guild, position: guild.channels.cache.size, deny: [...deny], messagesMap: messages, overwrites: new Map(),
      url: `https://discord.com/channels/${guild.id}/${id}`,
      toString: () => `<#${id}>`,
      permissionsFor(member) {
        if (member.id === guild.members.me.id) {
          const base = new PermissionsBitField(member.permissions.bitfield);
          for (const d of channel.deny) base.remove(PermissionFlagsBits[d]);
          return base;
        }
        return member.permissions;
      },
      permissionOverwrites: {
        async edit(target, perms) { maybeFail('overwrite'); channel.overwrites.set(target.id || target, perms); guild.log.push(['overwrite', id, target.id || target, perms]); }
      },
      async send(payload) {
        maybeFail('send');
        const msg = makeMessage(channel, guild.members.me.user, payload);
        // enforceNonce: نفس الـnonce خلال الفترة = نفس الرسالة (ما تتكرر)
        if (payload.nonce && channel.nonces && channel.nonces.has(payload.nonce)) return channel.nonces.get(payload.nonce);
        channel.nonces = channel.nonces || new Map();
        if (payload.nonce) channel.nonces.set(payload.nonce, msg);
        messages.set(msg.id, msg);
        guild.log.push(['send', id, payload]);
        return msg;
      },
      messages: {
        async fetch(arg) {
          if (typeof arg === 'string') {
            const m = messages.get(arg);
            if (!m) throw discordError(10008, 'Unknown Message');
            return m;
          }
          const list = [...messages.values()].reverse().slice(0, (arg && arg.limit) || 50);
          const out = new Collection();
          list.forEach((m) => out.set(m.id, m));
          return out;
        }
      },
      threads: {
        async create(opts) {
          maybeFail('thread');
          const t = addChannel({ name: opts.name, type: ChannelType.PublicThread, parentId: id });
          guild.log.push(['thread.create', t.id, opts.name]);
          return t;
        }
      },
      async setName(n) { maybeFail('channel.edit'); channel.name = n; guild.log.push(['setName', id, n]); return channel; },
      async setTopic(t) { maybeFail('channel.edit'); channel.topic = t; guild.log.push(['setTopic', id, t]); return channel; },
      async setParent(p) { maybeFail('channel.edit'); channel.parentId = p; guild.log.push(['setParent', id, p]); return channel; },
      async setPosition(p) { maybeFail('channel.edit'); channel.position = p; guild.log.push(['setPosition', id, p]); return channel; },
      async delete() { maybeFail('channel.delete'); guild.channels.cache.delete(id); guild.log.push(['deleteChannel', id]); },
      isTextBased: () => type !== ChannelType.GuildCategory,
      sendTyping: async () => null
    };
    guild.channels.cache.set(id, channel);
    return channel;
  }

  function makeMessage(channel, author, payload = {}) {
    const msg = {
      id: nextId(), channelId: channel.id, channel, guild, author, content: payload.content || '', embeds: (payload.embeds || []).map((e) => (e.toJSON ? e.toJSON() : e)),
      pinned: false, payload, url: `https://discord.com/channels/${guild.id}/${channel.id}/x`,
      async pin() { maybeFail('pin'); if (!msg.pinned) { msg.pinned = true; guild.log.push(['pin', channel.id, msg.id]); } },
      async unpin() { maybeFail('unpin'); msg.pinned = false; guild.log.push(['unpin', channel.id, msg.id]); },
      async edit(p) { maybeFail('edit'); Object.assign(msg, { content: p.content !== undefined ? p.content : msg.content }); if (p.embeds) msg.embeds = p.embeds.map((e) => (e.toJSON ? e.toJSON() : e)); guild.log.push(['edit', channel.id, msg.id, p]); return msg; },
      async delete() { channel.messagesMap.delete(msg.id); guild.log.push(['deleteMessage', channel.id, msg.id]); },
      async startThread(opts) { const t = addChannel({ name: opts.name, type: ChannelType.PublicThread, parentId: channel.id }); guild.log.push(['thread.start', t.id, msg.id]); return t; }
    };
    return msg;
  }

  // ---------- البوت والمالك ----------
  const botRole = addRole({ name: 'احسمها', position: 50, managed: true, permissions: botPerms });
  const me = addMember({ username: 'احسمها', roles: [botRole], bot: true });
  guild.members.me = me;
  const owner = addMember({ username: 'مالك-البوت', id: ownerId });
  const guildOwner = addMember({ username: 'مالك-السيرفر' });
  guild.ownerId = guildOwner.id;

  const client = {
    user: me.user,
    ws: { ping: 42 },
    uptime: 7200000,
    guilds: { cache: new Map([[guild.id, guild]]) },
    channels: { fetch: async (id) => guild.channels.cache.get(id) || null },
    users: { fetch: async (id) => (guild.members.cache.get(id) || {}).user || null }
  };

  const world = {
    guild, client, me, owner, guildOwner, botRole, fail, discordError, replies: [],
    addRole, addMember, addChannel, makeMessage,
    sentIn: (channel) => [...channel.messagesMap.values()],
    log: (op) => guild.log.filter(([t]) => t === op)
  };

  /** رسالة مستخدم (منشن للبوت بالنص تلقائياً لو mention=true) */
  world.say = (channel, member, content, { mention = true, reference = null, id = nextId(), mentions = null } = {}) => {
    const text = mention ? `<@${me.id}> ${content}` : content;
    const mentioned = mentions || (mention ? [me.user] : []);
    const msg = {
      id, content: text, guild, member, author: member.user, channel, channelId: channel.id, system: false, webhookId: null, createdTimestamp: Date.now(),
      client,
      mentions: { users: new Map(mentioned.map((u) => [u.id, u])), has: (u) => mentioned.some((m) => m.id === (u && u.id)) },
      reference: reference ? { messageId: reference.id, channelId: reference.channelId || channel.id } : null,
      async reply(payload) { world.replies.push({ to: id, payload }); return { id: nextId(), payload }; },
      async react() { return { users: { remove: async () => null } }; }
    };
    return msg;
  };
  /** نص آخر رد على رسالة */
  world.replyTo = (msg) => world.replies.filter((r) => r.to === msg.id).map((r) => r.payload.content).join('\n');
  // الروم يستقبل الرسائل المرسلة بالـchannel.send (للمقارنة)
  return world;
}

module.exports = { makeWorld, nextId, BOT_PERMS };
