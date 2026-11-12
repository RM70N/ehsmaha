'use strict';

// ربط الموسيقى بأحداث ديسكورد: أوامر !prefix من الرسائل + تغيّر حالة الصوت (روم فاضي / نقل البوت).

const logger = require('../utils/logger');
const rateLimiter = require('../utils/rateLimiter');
const { getManager } = require('./MusicManager');
const { runCommand } = require('./MusicControls');
const { getMusicConfig } = require('./MusicConfig');

const COMMANDS = new Set(['اغنية', 'قائمة', 'تخطي', 'ايقاف', 'موسيقى']);
// تطبيع: أنواع الألف والتشكيل (إيقاف = ايقاف) وتاء/هاء مربوطة ببعض في "اغنية/اغنيه"
const norm = (s) =>
  String(s || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
const NORMALIZED = new Map([...COMMANDS].map((c) => [norm(c), c]));

/** يحلّل رسالة !prefix. يرجع {name, args} أو null. */
function parse(content) {
  const prefix = getMusicConfig().prefix;
  const text = String(content || '');
  if (!text.startsWith(prefix)) return null;
  const rest = text.slice(prefix.length).trim();
  if (!rest) return null;
  const m = rest.match(/^(\S+)\s*([\s\S]*)$/);
  if (!m) return null;
  const name = NORMALIZED.get(norm(m[1]));
  return name ? { name, args: m[2].trim() } : null;
}

async function reply(message, payload) {
  try {
    await message.reply({ ...payload, allowedMentions: { parse: [], repliedUser: false } });
  } catch (err) {
    try {
      await message.channel.send({ ...payload, allowedMentions: { parse: [] } });
    } catch (err2) {
      logger.debug('🎵 تعذّر الرد على أمر !prefix', { guildId: message.guild && message.guild.id, code: err2 && err2.code });
    }
  }
}

/** معالج رسائل !prefix. يرجع true لو الرسالة أمر موسيقى (تم التعامل معها). */
async function handleMessage(message) {
  if (!getMusicConfig().enabled) return false;
  if (!message.guild || !message.author || message.author.bot || !message.content) return false;
  const cmd = parse(message.content);
  if (!cmd) return false;
  if (!rateLimiter.consume('music-prefix', message.author.id, 2000).allowed) return true; // تهدئة بصمت
  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return true;
  if (cmd.name === 'اغنية' || cmd.name === 'موسيقى') message.channel.sendTyping && message.channel.sendTyping().catch(() => {});
  const r = await runCommand(cmd.name, { guild: message.guild, member, textChannel: message.channel, args: cmd.args });
  await reply(message, r.payload);
  return true;
}

/** تغيّر حالة صوتية: الروم فاضي من البشر ← مؤقت مغادرة، أو البوت انتقل. */
function onVoiceStateUpdate(oldState, newState, client) {
  const guild = (newState && newState.guild) || (oldState && oldState.guild);
  if (!guild) return;
  const session = getManager().getSession(guild.id);
  if (!session) return;
  const meId = client && client.user && client.user.id;
  const member = newState.member || oldState.member;
  if (member && meId && member.id === meId) {
    if (newState.channelId && newState.channelId !== session.voiceChannelId) session.updateVoiceChannel(newState.channel);
    return;
  }
  const channel = guild.channels.cache.get(session.voiceChannelId);
  if (!channel || !channel.members) return;
  const humans = [...channel.members.values()].filter((m) => !(m.user && m.user.bot)).length;
  session.setChannelEmpty(humans === 0);
}

module.exports = { parse, handleMessage, onVoiceStateUpdate, norm, COMMANDS };
