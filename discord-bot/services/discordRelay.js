'use strict';

// ربط روم ديسكورد بألعاب موقع احسمها (منصة "ديسكورد" بنافذة "ابدأ بثاً سريعاً").
//
// الستريمر يحط ID روم بالموقع، والموقع يفتح بث أحداث لحظي (Server-Sent Events)
// من خادم البوت: GET /api/discord/relay/:channelId. كل رسالة تنكتب بالروم توصل
// الموقع فوراً بالاسم والصورة، والموقع يمررها للألعاب مثل رسالة شات تيك توك
// بالضبط — فالكلمة المفتاحية تدخل اللاعب، وباقي رسائله (أرقام/إجابات) يلعب فيها.
//
// ما فيه Firebase بالمسار أبداً (صفر حصة Firestore/RTDB)، والبوت ما يعالج أي روم
// إلا وفيه موقع مفتوح عليه. الرومات الخاصة (@everyone ما يشوفها) مرفوضة — عشان
// ما يقدر أحد يقرأ روم خاص بمجرد ما يعرف رقمه. يحتاج Message Content Intent.

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

const TEXT_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildVoice, // شات الروم الصوتي
  ChannelType.PublicThread,
  ChannelType.AnnouncementThread
]);
const MAX_TOTAL = 300;
const MAX_CONTENT = 500;
const HEARTBEAT_MS = 15 * 1000;
// إعادة إرسال اللي فات: لما الموقع ينقطع (أشهرها: الستريمر طلع من المتصفح للجوال
// عشان يكتب بديسكورد) ويرجع يتصل، يرسل آخر رسالة وصلته، ونجيب من ديسكورد اللي
// انكتب بعدها (بحد أقصى) — فما تضيع كلمة مفتاحية ولا إجابة.
const REPLAY_MAX_MESSAGES = 50;
const REPLAY_MAX_AGE_MS = 10 * 60 * 1000;
// الروم يبقى "مربوط" (حماية السبام متوقفة) شوي بعد آخر انقطاع — الانقطاع المؤقت
// (تطبيق بالخلفية) ما يرجّع كتم اللاعبين بنص الجولة
const LINK_GRACE_MS = 10 * 60 * 1000;

const state = {
  subscribers: new Map(), // channelId -> Set<{ res, openedAt }>
  lastLinkedAt: new Map(), // channelId -> آخر وقت كان فيه موقع مربوط
  heartbeat: null
};

function isSnowflake(v) {
  return /^\d{17,20}$/.test(String(v || ''));
}

function totalSubscribers() {
  let n = 0;
  for (const set of state.subscribers.values()) n += set.size;
  return n;
}

// صلاحيات الإدارة: رتبة فيها وحدة منها = رتبة إدارية (مو "أعضاء")
const STAFF_PERMS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers
];

/**
 * الروم "للأعضاء"؟ يشوفه @everyone، أو رتبة عادية (مو إدارية ولا رتبة بوت) —
 * كثير سيرفرات تقفل الرومات عن @everyone وتفتحها لرتبة "عضو/موثّق" بعد التحقق.
 * رومات الإدارة (ما يشوفها إلا رتب فيها صلاحيات إشراف) مرفوضة.
 */
function visibleToCommunity(channel, guild) {
  const everyone = guild.roles && guild.roles.everyone;
  if (!everyone) return false;
  if (channel.permissionsFor(everyone)?.has(PermissionFlagsBits.ViewChannel)) return true;
  const roles = guild.roles.cache ? [...guild.roles.cache.values()] : [];
  return roles.some((role) => {
    if (!role || role.id === everyone.id || role.managed) return false;
    const perms = role.permissions;
    if (perms && STAFF_PERMS.some((p) => perms.has(p))) return false;
    return !!channel.permissionsFor(role)?.has(PermissionFlagsBits.ViewChannel);
  });
}

/**
 * يتحقق إن الروم ينفع يتربط.
 * @returns {{ ok: true, channel } | { ok: false, status: number, code: string, message: string }}
 */
function resolveChannel(client, channelId, { officialGuildId = null } = {}) {
  if (!isSnowflake(channelId)) return { ok: false, status: 400, code: 'INVALID_INPUT', message: 'ID الروم غير صحيح' };
  if (!client || typeof client.isReady !== 'function' || !client.isReady()) {
    return { ok: false, status: 503, code: 'BOT_NOT_READY', message: 'البوت يعيد الاتصال — حاول بعد لحظات' };
  }
  const channel = client.channels.cache.get(channelId);
  if (!channel || !channel.guild || !TEXT_TYPES.has(channel.type)) {
    return { ok: false, status: 404, code: 'CHANNEL_NOT_FOUND', message: 'ما لقيت روم كتابي بهذا الـID بسيرفر فيه بوت احسمها' };
  }
  if (officialGuildId && channel.guild.id !== officialGuildId) {
    return { ok: false, status: 403, code: 'CHANNEL_NOT_ALLOWED', message: 'الروم لازم يكون بسيرفر احسمها الرسمي' };
  }
  const guild = channel.guild;
  if (!visibleToCommunity(channel, guild)) {
    return { ok: false, status: 403, code: 'CHANNEL_PRIVATE', message: 'الروم خاص بالإدارة — اختر روم يشوفه الأعضاء' };
  }
  const me = guild.members && guild.members.me;
  if (!me || !channel.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel)) {
    return { ok: false, status: 403, code: 'BOT_NO_ACCESS', message: 'البوت ما يشوف هذا الروم' };
  }
  return { ok: true, channel };
}

function writeEvent(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    return true;
  } catch (_) {
    return false;
  }
}

function ensureHeartbeat() {
  if (state.heartbeat) return;
  state.heartbeat = setInterval(() => {
    for (const set of state.subscribers.values()) {
      for (const sub of set) {
        try { sub.res.write(': ping\n\n'); } catch (_) { /* ينشال مع close */ }
      }
    }
  }, HEARTBEAT_MS);
  if (typeof state.heartbeat.unref === 'function') state.heartbeat.unref();
}

function stopHeartbeatIfIdle() {
  if (state.heartbeat && totalSubscribers() === 0) {
    clearInterval(state.heartbeat);
    state.heartbeat = null;
  }
}

/**
 * يفتح بث أحداث لروم (يُستدعى من خادم البوت بعد التحقق). يرجّع false لو الحد امتلأ.
 */
function subscribe(channel, req, res, { maxPerChannel = 10, after = null } = {}) {
  const set = state.subscribers.get(channel.id) || new Set();
  if (set.size >= maxPerChannel || totalSubscribers() >= MAX_TOTAL) return false;

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  if (res.socket && typeof res.socket.setNoDelay === 'function') res.socket.setNoDelay(true);
  // حشوة تعليق 2KB: بعض البروكسيات (Render/Cloudflare) تحبس أول الرد لين يكبر —
  // الحشوة تفك الحبس فتوصل كل رسالة لحظة ما تنكتب
  res.write(':' + ' '.repeat(2048) + '\n\n');
  res.write('retry: 4000\n\n');

  const sub = { res, openedAt: Date.now() };
  set.add(sub);
  state.subscribers.set(channel.id, set);
  ensureHeartbeat();
  // lastMessageId = نقطة البداية: لو الموقع انقطع قبل ما توصله أي رسالة، يرجع يطلب اللي بعدها
  writeEvent(res, 'ready', { channelId: channel.id, channelName: channel.name, guildName: channel.guild.name, lastMessageId: channel.lastMessageId || null });
  logger.info('🎮 موقع احسمها ربط روم ديسكورد', { channelId: channel.id, listeners: set.size, replayAfter: after || undefined });
  state.lastLinkedAt.set(channel.id, Date.now());
  if (after) replayMissed(channel, sub, after);

  const cleanup = () => {
    state.lastLinkedAt.set(channel.id, Date.now());
    const cur = state.subscribers.get(channel.id);
    if (cur) {
      cur.delete(sub);
      if (!cur.size) state.subscribers.delete(channel.id);
    }
    stopHeartbeatIfIdle();
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  return true;
}

/** يرسل لهذا الموقع بس الرسائل اللي انكتبت بالروم بعد `after` (وهو منقطع) */
async function replayMissed(channel, sub, after) {
  if (!isSnowflake(after) || !channel.messages || typeof channel.messages.fetch !== 'function') return;
  try {
    const me = channel.guild && channel.guild.members && channel.guild.members.me;
    const perms = me && channel.permissionsFor(me);
    if (perms && !perms.has(PermissionFlagsBits.ReadMessageHistory)) return;
    const fetched = await channel.messages.fetch({ after, limit: REPLAY_MAX_MESSAGES });
    const now = Date.now();
    const list = [...fetched.values()]
      .filter((m) => m && m.author && !m.author.bot && !m.webhookId && now - (m.createdTimestamp || 0) <= REPLAY_MAX_AGE_MS)
      .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
    let sent = 0;
    for (const m of list) {
      const payload = toRelayMessage(m);
      if (payload.content && writeEvent(sub.res, 'chat', payload)) sent++;
    }
    if (sent) logger.info('🎮 ربط ديسكورد: رجّعنا رسائل فاتت الموقع وهو منقطع', { channelId: channel.id, sent });
  } catch (err) {
    logger.warn('ربط ديسكورد: تعذّر جلب الرسائل اللي فاتت', { channelId: channel.id, code: err && err.code });
  }
}

/** شكل الرسالة اللي يستقبلها الموقع */
function toRelayMessage(message) {
  const author = message.author;
  const member = message.member;
  const avatarOf = (x) => (x && typeof x.displayAvatarURL === 'function' ? x.displayAvatarURL({ extension: 'png', size: 128 }) : '');
  const content = String(message.cleanContent != null ? message.cleanContent : message.content || '')
    // التشكيل والتطويل ما يغيّرون الكلمة — بدونهم "دُخـول" = "دخول" بمطابقة الألعاب
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CONTENT);
  return {
    id: author.id,
    username: author.username,
    displayName: (member && member.displayName) || author.globalName || author.username,
    avatarUrl: avatarOf(member) || avatarOf(author),
    content,
    messageId: message.id
  };
}

/**
 * من messageCreate: يمرر الرسالة لكل موقع مربوط بالروم.
 * @returns {number} عدد المواقع اللي وصلتها
 */
function handleMessage(message) {
  if (!message || !message.author || message.author.bot || message.webhookId) return 0;
  const channelId = message.channelId || (message.channel && message.channel.id);
  const set = state.subscribers.get(channelId);
  if (!set || !set.size) return 0;
  const payload = toRelayMessage(message);
  if (!payload.content) {
    // ملصق/صورة بدون نص — أو Message Content Intent مو مفعّل (النص يوصل فاضي)
    if (!message.attachments || !message.attachments.size) {
      logger.warn('ربط ديسكورد: رسالة بدون نص بروم مربوط — تأكد إن Message Content Intent مفعّل', { channelId });
    }
    return 0;
  }
  let sent = 0;
  for (const sub of set) if (writeEvent(sub.res, 'chat', payload)) sent++;
  logger.info('🎮 ربط ديسكورد: رسالة انرسلت للموقع', { channelId, sent, length: payload.content.length });
  return sent;
}

/** روم مربوط الحين بموقع مفتوح؟ */
function isLinked(channelId, now = Date.now()) {
  const set = state.subscribers.get(channelId);
  if (set && set.size) return true;
  const last = state.lastLinkedAt.get(channelId);
  return !!last && now - last <= LINK_GRACE_MS;
}

function stats() {
  return { channels: state.subscribers.size, listeners: totalSubscribers() };
}

function closeAll() {
  for (const set of state.subscribers.values()) {
    for (const sub of set) {
      try { sub.res.end(); } catch (_) { /* تجاهل */ }
    }
  }
  state.subscribers.clear();
  state.lastLinkedAt.clear();
  stopHeartbeatIfIdle();
}

module.exports = { resolveChannel, subscribe, handleMessage, isLinked, toRelayMessage, stats, closeAll, _state: state };
