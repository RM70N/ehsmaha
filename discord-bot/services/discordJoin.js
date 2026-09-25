'use strict';

// "الانضمام عبر ديسكورد" لألعاب الستريمر بموقع ehsmaha.com — جهة البوت.
//
//   1) قائمة الرومات: عند الإقلاع وعند إنشاء/حذف/تعديل روم بالسيرفر الرسمي،
//      نرسل رومات النص {id, name} للـAPI ← config/discordChannels (الموقع يعرضها
//      قائمة اختيار بشاشة إعداد اللعبة).
//   2) الجلسات النشطة: الموقع يكتب discordSessions/{id} (status: 'active') لما
//      يشغّل الستريمر لعبة ويختار روم. البوت يسأل الـAPI كل كم ثانية ويحتفظ
//      بكاش: Map<channelId, { sessionId, keywords, joinedUserIds:Set }>.
//   3) messageCreate: رسالة بروم عليه جلسة + تطابق الكلمة المفتاحية (بنفس
//      normalize() الموقع) + ما انضم قبل ← نسجّله مرة وحدة
//      (discordSessions/{id}/participants/{discordUserId}) والموقع يضيفه للعبة.
//
// البوت ما يراقب أي روم إلا وقت وجود جلسة نشطة عليه. يحتاج Message Content Intent.

const { ChannelType } = require('discord.js');
const api = require('../utils/apiClient');
const logger = require('../utils/logger');

const TEXT_TYPES = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
const CHANNEL_SYNC_DEBOUNCE_MS = 3000;

// ---------------- المطابقة ----------------
// ⚠️ نسخة حرفية من normalize() بموقع احسمها (index.html — "GAME LOGIC") —
// لا تعدّلها إلا مع الموقع، وإلا يصير عدم تطابق. (فيه اختبار يقارنها بالأصل.)
function siteNormalize(s) {
  return (s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ت').replace(/ى/g, 'ي').trim().toLowerCase();
}

// تنظيف ديسكورد قبل normalize: التشكيل والتطويل والمسافات الزايدة (الكيبورد
// بالجوال يضيفها كثير). ما يغيّر نتيجة المطابقة للنص النظيف — ولأن الموقع
// يستلم "الكلمة المفتاحية نفسها" لما ينضم اللاعب، فما فيه أي عدم تطابق هناك.
function prepare(s) {
  return String(s || '')
    .replace(/[ً-ٰٟۖ-ۭ]/g, '') // تشكيل
    .replace(/ـ/g, '') // تطويل
    .replace(/\s+/g, ' ');
}

/** الكلمة المفتاحية المطابقة (بنصها الأصلي بالجلسة) أو null */
function matchKeyword(text, keywords) {
  const got = siteNormalize(prepare(text));
  if (!got) return null;
  return (keywords || []).find((k) => siteNormalize(prepare(k)) === got) || null;
}

// ---------------- الحالة ----------------
const state = {
  sessions: new Map(), // channelId -> { sessionId, guildId, keywords, gameId, joinedUserIds:Set }
  pollTimer: null,
  syncTimer: null,
  client: null,
  officialGuildId: null,
  lastPollOk: 0
};

function officialGuild(client = state.client) {
  if (!client || !client.guilds) return null;
  if (state.officialGuildId) return client.guilds.cache.get(state.officialGuildId) || null;
  // بدون OFFICIAL_GUILD_ID: لو البوت بسيرفر واحد بس فهو الرسمي
  return client.guilds.cache.size === 1 ? client.guilds.cache.first() : null;
}

/** تحديث الكاش من قائمة الجلسات النشطة (يحافظ على joinedUserIds لنفس الجلسة) */
function applySessions(list) {
  const guild = officialGuild();
  const next = new Map();
  for (const s of Array.isArray(list) ? list : []) {
    if (!s || !s.channelId || !s.sessionId || !Array.isArray(s.keywords) || !s.keywords.length) continue;
    if (guild && s.guildId && s.guildId !== guild.id) continue; // سيرفر ثاني — مو نطاقنا
    const prev = state.sessions.get(s.channelId);
    next.set(s.channelId, {
      sessionId: s.sessionId,
      guildId: s.guildId || null,
      keywords: s.keywords,
      gameId: s.gameId || null,
      joinedUserIds: prev && prev.sessionId === s.sessionId ? prev.joinedUserIds : new Set()
    });
  }
  const before = new Set([...state.sessions.values()].map((x) => x.sessionId));
  const after = new Set([...next.values()].map((x) => x.sessionId));
  for (const id of after) if (!before.has(id)) logger.info('🎮 جلسة انضمام ديسكورد بدأت', { sessionId: id });
  for (const id of before) if (!after.has(id)) logger.info('🎮 جلسة انضمام ديسكورد انتهت', { sessionId: id });
  state.sessions = next;
}

async function refreshSessions() {
  try {
    applySessions(await api.getJoinSessions());
    state.lastPollOk = Date.now();
  } catch (err) {
    // الـAPI ما رد: نبقي الكاش الحالي (الجلسات ما تنتهي بسبب انقطاع مؤقت)
    logger.debug('ديسكورد-انضمام: تعذّر جلب الجلسات', { code: err.code });
  }
}

// ---------------- الرسائل ----------------
/**
 * @returns {Promise<'joined'|'duplicate'|'ended'|'failed'|null>} null = الرسالة مو لنا
 */
async function handleMessage(message) {
  if (!message || !message.author || message.author.bot || !message.guild) return null;
  const session = state.sessions.get(message.channelId || (message.channel && message.channel.id));
  if (!session) return null;
  if (session.guildId && session.guildId !== message.guild.id) return null;
  const keyword = matchKeyword(message.content, session.keywords);
  if (!keyword) return null;

  const uid = message.author.id;
  if (session.joinedUserIds.has(uid)) return 'duplicate';
  session.joinedUserIds.add(uid); // فوراً — قبل الانتظار، عشان الرسائل المتتالية ما تسجّله مرتين

  const author = message.author;
  const payload = {
    discordUserId: uid,
    username: author.username,
    displayName: author.globalName || author.username,
    avatarUrl: typeof author.displayAvatarURL === 'function' ? author.displayAvatarURL({ extension: 'png', size: 128 }) : '',
    keyword
  };
  try {
    await api.addJoinParticipant(session.sessionId, payload);
    logger.info('🎮 عضو انضم للعبة عبر ديسكورد', { sessionId: session.sessionId, userId: uid, gameId: session.gameId });
    if (typeof message.react === 'function') message.react('✅').catch(() => null);
    return 'joined';
  } catch (err) {
    if (err && err.code === 'SESSION_NOT_ACTIVE') {
      // الجلسة انتهت أثناء الإرسال — نوقف المعالجة على هالروم فوراً
      const cur = state.sessions.get(message.channelId);
      if (cur && cur.sessionId === session.sessionId) state.sessions.delete(message.channelId);
      return 'ended';
    }
    session.joinedUserIds.delete(uid); // يقدر يعيد المحاولة برسالة ثانية
    logger.warn('ديسكورد-انضمام: تعذّر تسجيل المنضم', { sessionId: session.sessionId, code: err && err.code });
    return 'failed';
  }
}

// ---------------- قائمة الرومات ----------------
function channelList(guild) {
  return [...guild.channels.cache.values()]
    .filter((c) => TEXT_TYPES.has(c.type))
    .sort((a, b) => (a.rawPosition ?? a.position ?? 0) - (b.rawPosition ?? b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

async function syncChannels() {
  const guild = officialGuild();
  if (!guild) {
    logger.warn('ديسكورد-انضمام: ما عرفت السيرفر الرسمي — حدد OFFICIAL_GUILD_ID (البوت بأكثر من سيرفر)');
    return null;
  }
  const channels = channelList(guild);
  try {
    const r = await api.putJoinChannels({ guildId: guild.id, guildName: guild.name, channels });
    logger.info('🎮 تم تحديث قائمة رومات ديسكورد للموقع', { count: channels.length });
    return r;
  } catch (err) {
    logger.warn('ديسكورد-انضمام: تعذّر إرسال قائمة الرومات', { code: err.code });
    return null;
  }
}

/** من أحداث channelCreate/Delete/Update — تجميع التغييرات المتتالية بطلب واحد */
function scheduleChannelSync(guild) {
  const official = officialGuild();
  if (!official || (guild && guild.id !== official.id)) return false;
  if (state.syncTimer) clearTimeout(state.syncTimer);
  state.syncTimer = setTimeout(() => {
    state.syncTimer = null;
    syncChannels();
  }, CHANNEL_SYNC_DEBOUNCE_MS);
  if (typeof state.syncTimer.unref === 'function') state.syncTimer.unref();
  return true;
}

// ---------------- التشغيل ----------------
function start(client, { officialGuildId = null, pollMs = 4000 } = {}) {
  stop();
  state.client = client;
  state.officialGuildId = officialGuildId;
  syncChannels();
  refreshSessions();
  state.pollTimer = setInterval(refreshSessions, pollMs);
  if (typeof state.pollTimer.unref === 'function') state.pollTimer.unref();
}

function stop() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.syncTimer) clearTimeout(state.syncTimer);
  state.pollTimer = null;
  state.syncTimer = null;
}

module.exports = {
  siteNormalize,
  matchKeyword,
  applySessions,
  refreshSessions,
  handleMessage,
  syncChannels,
  scheduleChannelSync,
  channelList,
  start,
  stop,
  _state: state
};
