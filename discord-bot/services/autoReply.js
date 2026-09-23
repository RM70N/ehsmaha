'use strict';

// الردود التلقائية: العضو يكتب كلمة/جملة مسجّلة (مثل "السلام عليكم") ← البوت
// يرد بالرد المحدد (مثل "وعليكم السلام"). الإدارة تضيف/تحذف من لوحة
// /الردود_التلقائية.
//
// المطابقة بعد "تطبيع" النص: بدون تشكيل ولا تطويل، والهمزات (أ إ آ) = ا،
// ى = ي، ة = ه، وبدون علامات ترقيم بالأطراف، والحروف الإنجليزية الكبيرة = الصغيرة.
//   • exact    : الرسالة كاملة = الكلمة ("السلام عليكم!" تطابق "السلام عليكم")
//   • contains : الكلمة موجودة ككلمة كاملة داخل الرسالة
// رد واحد لكل رسالة (المطابقة التامة أولاً، ثم الأطول)، ومهلة 5 ثوانٍ لنفس
// الرد بنفس القناة (ما يغرق الشات لو أحد كررها).
//
// يحتاج Message Content Intent (قراءة نص الرسائل).

const store = require('../database/botStore');
const logger = require('../utils/logger');

const MAX_REPLIES = 100;
const MAX_TRIGGER = 100;
const MAX_RESPONSE = 1500;
const CHANNEL_COOLDOWN_MS = 5000;
const CACHE_MS = 60 * 1000;

function normalize(text) {
  return String(text || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // تشكيل + تطويل
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[\s​-‏]+/g, ' ')
    .replace(/^[\s!-/:-@[-`{-~،؛؟…«»"'”“]+|[\s!-/:-@[-`{-~،؛؟…«»"'”“]+$/g, '')
    .trim();
}

// كلمات النص (للمطابقة "يحتوي" ككلمة كاملة)
function words(norm) {
  return ' ' + norm.replace(/[!-/:-@[-`{-~،؛؟…«»"'”“]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

// ---------------- كاش لكل سيرفر ----------------
const cache = new Map(); // guildId -> { at, list }
async function repliesFor(guildId) {
  const hit = cache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.list;
  const list = await store.autoReplies.list(guildId);
  cache.set(guildId, { at: Date.now(), list });
  return list;
}
const invalidate = (guildId) => cache.delete(guildId);

function findMatch(list, content) {
  const norm = normalize(content);
  if (!norm) return null;
  const exact = list.find((r) => r.match_type === 'exact' && r.trigger_norm === norm);
  if (exact) return exact;
  const w = words(norm);
  return (
    list
      .filter((r) => r.match_type === 'contains' && w.includes(words(r.trigger_norm)))
      .sort((a, b) => b.trigger_norm.length - a.trigger_norm.length)[0] || null
  );
}

function render(response, message) {
  return String(response)
    .replace(/\{(يوزر|user)\}/gi, `<@${message.author.id}>`)
    .replace(/\{(السيرفر|server)\}/gi, message.guild.name || '')
    .slice(0, 2000);
}

const lastSent = new Map(); // guild:channel:replyId -> ms
function coolingDown(key, now) {
  const last = lastSent.get(key);
  if (last && now - last < CHANNEL_COOLDOWN_MS) return true;
  lastSent.set(key, now);
  if (lastSent.size > 5000) {
    for (const [k, t] of lastSent) if (now - t > CHANNEL_COOLDOWN_MS) lastSent.delete(k);
  }
  return false;
}

/**
 * @returns {Promise<null|{ id:number, sent:boolean }>}
 */
async function handleMessage(message) {
  if (!message || !message.guild || !message.author || message.author.bot || message.webhookId || message.system) return null;
  if (!message.content) return null;
  let list;
  try {
    list = await repliesFor(message.guild.id);
  } catch (err) {
    logger.debug('الردود التلقائية: القاعدة غير متاحة', { code: err.code });
    return null;
  }
  if (!list.length) return null;
  const match = findMatch(list, message.content);
  if (!match) return null;
  if (coolingDown(`${message.guild.id}:${message.channel.id}:${match.id}`, Date.now())) return { id: match.id, sent: false };
  try {
    await message.reply({ content: render(match.response, message), allowedMentions: { users: [message.author.id], repliedUser: false } });
    return { id: match.id, sent: true };
  } catch (err) {
    logger.warn('تعذّر إرسال الرد التلقائي', { guildId: message.guild.id, code: err.code });
    return { id: match.id, sent: false };
  }
}

module.exports = {
  handleMessage,
  normalize,
  findMatch,
  invalidate,
  MAX_REPLIES,
  MAX_TRIGGER,
  MAX_RESPONSE,
  _internal: { cache, lastSent, words, render }
};
