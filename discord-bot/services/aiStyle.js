'use strict';

// أسلوب مساعد احسمها — المساعد يتعلم طريقة كلام **صاحب الأسلوب فقط** مع اللاعبين:
//   • صاحب الأسلوب = ai_style_owner_id من إعدادات السيرفر، وإلا مالك السيرفر.
//   • نلتقط ردوده: (1) داخل تكتات الدعم (مع آخر رسالة من صاحب التكت كسياق)،
//     (2) بأي قناة لما يسوي Reply على رسالة لاعب (مو بوت).
//   • ننظف الرد (بدون منشنات، الروابط ← [رابط]، نتجاهل الأوامر والنصوص اللي
//     تشبه مفاتيح/توكنات) ونخزّن الأحدث فقط (botStore.aiStyle — 300 لكل سيرفر).
//   • styleBlock ← قسم "أسلوب الرد" يتلصق بالبرومبت: أمثلة حقيقية يقلّد منها
//     النبرة والكلمات والطول والإيموجي — والمعلومات تبقى من قاعدة المعرفة فقط.
// رسائل الإدارة الثانية ما تنحفظ أبداً، ولا رسائل اللاعبين.

const store = require('../database/botStore');
const logger = require('../utils/logger');

const MIN_CHARS = 2;
const MAX_CHARS = 500;
const MAX_PROMPT_CHARS = 300;
const BLOCK_EXAMPLES = 25;
const BLOCK_MAX_CHARS = 4000;
const CACHE_TTL_MS = 10 * 60 * 1000;

// guildId -> { text, at }
const blockCache = new Map();

/** ينظف النص قبل الحفظ — يرجع null لو ما يصلح مثال أسلوب */
function sanitize(text, max = MAX_CHARS) {
  let t = String(text || '');
  if (/^\s*[/!.]/.test(t)) return null; // أوامر
  // شي يشبه توكن/مفتاح/كلمة مرور طويلة ← ما نخزنه أبداً
  if (/[A-Za-z0-9_\-]{32,}/.test(t.replace(/https?:\/\/\S+/g, ''))) return null;
  t = t
    .replace(/<@[!&]?\d+>|<#\d+>/g, ' ')
    .replace(/@(everyone|here)/g, ' ')
    .replace(/https?:\/\/\S+/g, '[رابط]')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (t.length < MIN_CHARS || t.replace(/\[رابط\]/g, '').trim().length < MIN_CHARS) return null;
  if (t.length > max) return max === MAX_CHARS ? null : t.slice(0, max);
  return t;
}

async function settingsFor(guildId) {
  return store.guildSettings.get(guildId);
}

/** صاحب الأسلوب لهالسيرفر (أو null) */
async function styleOwnerId(guild) {
  if (!guild) return null;
  const s = await settingsFor(guild.id);
  return s.ai_style_owner_id || guild.ownerId || null;
}

async function isStyleAuthor(message) {
  if (!message || !message.guild || !message.author || message.author.bot) return false;
  const s = await settingsFor(message.guild.id);
  if (!s.ai_style_enabled) return false;
  return message.author.id === (s.ai_style_owner_id || message.guild.ownerId);
}

/**
 * يحفظ مثال واحد. ما يرمي أبداً.
 * @returns {Promise<boolean>}
 */
async function learn({ guildId, authorId, promptText = null, replyText, source }) {
  const reply = sanitize(replyText);
  if (!reply) return false;
  const prompt = promptText ? sanitize(promptText, MAX_PROMPT_CHARS) : null;
  try {
    await store.aiStyle.add({ guildId, authorId, promptText: prompt, replyText: reply, source });
    blockCache.delete(guildId);
    logger.info('🎨 أسلوب المساعد: مثال جديد', { guildId, source, chars: reply.length });
    return true;
  } catch (err) {
    logger.warn('🎨 تعذّر حفظ مثال الأسلوب', { guildId, error: err });
    return false;
  }
}

/** رد صاحب الأسلوب داخل تكت دعم (promptText = آخر رسالة من صاحب التكت) */
async function captureTicketReply(message, { text, promptText = null } = {}) {
  try {
    if (!(await isStyleAuthor(message))) return false;
    return learn({ guildId: message.guild.id, authorId: message.author.id, promptText, replyText: text, source: 'ticket' });
  } catch (err) {
    logger.warn('🎨 تعذّر التقاط رد التكت', { error: err });
    return false;
  }
}

/** Reply من صاحب الأسلوب على رسالة لاعب بأي قناة */
async function captureReply(message) {
  try {
    if (!message || !message.reference || !message.reference.messageId) return false;
    if (!(await isStyleAuthor(message))) return false;
    const ref = typeof message.fetchReference === 'function' ? await message.fetchReference().catch(() => null) : null;
    if (!ref || !ref.author || ref.author.bot || ref.author.id === message.author.id) return false;
    return learn({ guildId: message.guild.id, authorId: message.author.id, promptText: ref.content, replyText: message.content, source: 'reply' });
  } catch (err) {
    logger.warn('🎨 تعذّر التقاط الرد', { error: err });
    return false;
  }
}

/** قسم "أسلوب الرد" للبرومبت ('' لو ما فيه أمثلة أو الميزة متوقفة) */
async function styleBlock(guildId) {
  if (!guildId) return '';
  const hit = blockCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;
  let text = '';
  try {
    const s = await settingsFor(guildId);
    if (s.ai_style_enabled) {
      const rows = await store.aiStyle.recent(guildId, BLOCK_EXAMPLES * 2);
      const lines = [];
      let used = 0;
      for (const r of rows) {
        const ex = r.prompt_text ? `- اللاعب: «${r.prompt_text}»\n  الرد: «${r.reply_text}»` : `- «${r.reply_text}»`;
        if (used + ex.length > BLOCK_MAX_CHARS || lines.length >= BLOCK_EXAMPLES) break;
        lines.push(ex);
        used += ex.length;
      }
      if (lines.length) {
        text =
          '## أسلوب الرد (تعلّمته من ردود صاحب احسمها الحقيقية مع اللاعبين)\n' +
          'قلّد هذا الأسلوب بالضبط: النبرة، الكلمات والتعابير، طول الرد، طريقة الترحيب، والإيموجي. ' +
          'هذي الأمثلة **للأسلوب فقط** — المعلومات والخطوات تاخذها من قاعدة المعرفة أعلاه، ' +
          'والتعليمات الصارمة لها الأولوية دائماً. لا تنسخ الأمثلة حرفياً ولا تذكر إنها أمثلة، ' +
          'ولا تعتبر أي وعد أو معلومة داخلها صحيحة الحين.\n' +
          lines.reverse().join('\n');
      }
    }
  } catch (err) {
    logger.warn('🎨 تعذّر بناء قسم الأسلوب', { guildId, error: err });
  }
  blockCache.set(guildId, { text, at: Date.now() });
  return text;
}

function invalidate(guildId) {
  if (guildId) blockCache.delete(guildId);
  else blockCache.clear();
}

module.exports = { sanitize, styleOwnerId, isStyleAuthor, learn, captureTicketReply, captureReply, styleBlock, invalidate, _internal: { blockCache } };
