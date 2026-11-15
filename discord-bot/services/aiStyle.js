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
    exampleCache.delete(guildId);
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

// ---------------------------------------------------------------- ملف الأسلوب (فهم الأسلوب لا حفظ الجمل)
// بدل ما نحط ردود صاحب الأسلوب حرفياً بالبرومبت (والنموذج يعيدها كما هي ولو ما تناسب الكلام)، نخلّي Gemini يحلّل الردود
// مرة كل فترة ويكتب وصفاً لأسلوبه (لهجة، نبرة، طول، إيموجي، طريقة المزح…). هذا الوصف هو المرجع الأساسي، ومعه عيّنات قليلة
// عشوائية "للنبرة فقط" — ومع حارس يمنع نسخ أي عبارة منها (copiesExamples).

const PROFILE_KEY = 'ai_style_profile';
const PROFILE_MIN_EXAMPLES = 5;
const PROFILE_REFRESH_NEW = 10;
const PROFILE_REFRESH_MS = 6 * 60 * 60 * 1000;
const PROFILE_SAMPLE = 40;
const SAMPLES_WITH_PROFILE = 3;
const SAMPLES_WITHOUT_PROFILE = 6;
const SAMPLE_MAX_CHARS = 140;
const PROFILE_INSTRUCTION =
  'أنت محلل أسلوب كتابة. ستعطى ردوداً حقيقية لشخص واحد يكلّم أعضاء مجتمع ألعاب عربي. ' +
  'اكتب وصفاً مختصراً (حتى 120 كلمة) لأسلوبه على شكل نقاط قصيرة: اللهجة، النبرة، الطول المعتاد للرد، طريقة الترحيب والختام، ' +
  'استخدام الإيموجي والعلامات، طريقة المزح مقابل الجدية، نوع المفردات (بشكل عام). ' +
  'ممنوع تماماً اقتباس أي جملة أو عبارة كاملة من الردود، ولا تضع أمثلة نصية — صف الأسلوب فقط.';

const profileCache = new Map(); // guildId -> { text, at, count }
const profileBuilding = new Set();

async function loadProfile(guildId) {
  const hit = profileCache.get(guildId);
  if (hit) return hit;
  let saved = null;
  try {
    saved = await store.guildConfig.get(guildId, PROFILE_KEY, null);
  } catch {
    saved = null;
  }
  const p = saved && typeof saved.text === 'string' ? saved : { text: '', at: 0, count: 0 };
  profileCache.set(guildId, p);
  return p;
}

const shuffled = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** يبني/يحدّث ملف الأسلوب بـGemini (خلفية، ما يرمي). */
async function refreshProfile(guildId) {
  if (profileBuilding.has(guildId)) return false;
  profileBuilding.add(guildId);
  try {
    const gemini = require('./gemini');
    const rows = shuffled(await store.aiStyle.recent(guildId, 150)).slice(0, PROFILE_SAMPLE);
    if (rows.length < PROFILE_MIN_EXAMPLES) return false;
    const body = rows.map((r) => (r.prompt_text ? `اللاعب: ${r.prompt_text}\nالرد: ${r.reply_text}` : `الرد: ${r.reply_text}`)).join('\n---\n');
    const r = await gemini.generate({
      systemInstruction: PROFILE_INSTRUCTION,
      messages: [{ role: 'user', text: body }],
      maxOutputTokens: 500,
      temperature: 0.3,
      meta: { context: 'style-profile', guildId }
    });
    if (!r.ok || !String(r.text || '').trim()) return false;
    const total = await store.aiStyle.count(guildId);
    const profile = { text: String(r.text).trim().slice(0, 1200), at: Date.now(), count: total };
    profileCache.set(guildId, profile);
    await store.guildConfig.set(guildId, PROFILE_KEY, profile, 'ai-style').catch(() => {});
    blockCache.delete(guildId);
    logger.info('🎨 أسلوب المساعد: تحديث ملف الأسلوب', { guildId, examples: rows.length });
    return true;
  } catch (err) {
    logger.warn('🎨 تعذّر بناء ملف الأسلوب', { guildId, error: err && err.message });
    return false;
  } finally {
    profileBuilding.delete(guildId);
  }
}

async function maybeRefreshProfile(guildId, total) {
  const p = await loadProfile(guildId);
  const due = (!p.text && total >= PROFILE_MIN_EXAMPLES) || (p.text && total - p.count >= PROFILE_REFRESH_NEW && Date.now() - p.at >= PROFILE_REFRESH_MS);
  if (due) refreshProfile(guildId).catch(() => {});
}

const STYLE_RULES =
  'قواعد صارمة لاستخدام الأسلوب:\n' +
  '- الوصف والعيّنات **للنبرة فقط** (لهجة، طول، إيموجي، روح المزح). ممنوع تكرار أي جملة أو عبارة أو تعبير كامل من العيّنات، ولا حتى بتغيير بسيط.\n' +
  '- اكتب كل رد من جديد بكلماتك، ويكون **ردّاً منطقياً على كلام المستخدم الحالي بالذات**: افهم قصده (سؤال، طلب، مزح، توجيه كلام لشخص ثاني) وتفاعل معه مباشرة، ولا تحط جملة جاهزة لا علاقة لها بكلامه.\n' +
  '- لا تذكر إن عندك أمثلة أو وصف أسلوب. المعلومات والخطوات من قاعدة المعرفة فقط، والتعليمات الصارمة لها الأولوية دائماً، ولا تعتبر أي وعد أو معلومة داخل العيّنات صحيحة الحين.';

// ---------------------------------------------------------------- تعلّم من كلام صاحب الأسلوب العادي
// كلامه بالسوالف (مو بس الردود على اللاعبين) هو أغنى مصدر للهجته وطريقته، فنأخذ عيّنات منه — مع حدود: رسائل ذات معنى،
// بدون أوامر/روابط/توكنات (sanitize)، وعيّنة وحدة كل 20 ثانية بالسيرفر، وما نخزّن شي لو الميزة متوقفة.
const CHAT_MIN_CHARS = 10;
const CHAT_MIN_WORDS = 3;
const CHAT_GAP_MS = 20_000;
const lastChatCapture = new Map();

async function captureChat(message) {
  try {
    if (!message || !message.guild || !message.content) return false;
    const text = String(message.content).trim();
    if (text.length < CHAT_MIN_CHARS || text.split(/\s+/).length < CHAT_MIN_WORDS) return false;
    const now = Date.now();
    if (now - (lastChatCapture.get(message.guild.id) || 0) < CHAT_GAP_MS) return false;
    if (!(await isStyleAuthor(message))) return false;
    lastChatCapture.set(message.guild.id, now);
    return learn({ guildId: message.guild.id, authorId: message.author.id, promptText: null, replyText: text, source: 'chat' });
  } catch (err) {
    logger.warn('🎨 تعذّر التقاط الكلام العادي', { error: err });
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
      const rows = await store.aiStyle.recent(guildId, 80);
      if (rows.length) {
        const profile = await loadProfile(guildId);
        maybeRefreshProfile(guildId, await store.aiStyle.count(guildId)).catch(() => {});
        const pick = shuffled(rows).slice(0, profile.text ? SAMPLES_WITH_PROFILE : SAMPLES_WITHOUT_PROFILE);
        const samples = pick.map((r) => `- «${r.reply_text.replace(/\s+/g, ' ').slice(0, SAMPLE_MAX_CHARS)}»`);
        text =
          '## أسلوب الرد (تعلّمته من ردود صاحب احسمها الحقيقية مع اللاعبين)\n' +
          (profile.text ? `### وصف الأسلوب\n${profile.text}\n\n` : '') +
          `### عيّنات للنبرة فقط (لا تنسخها)\n${samples.join('\n')}\n\n` +
          STYLE_RULES;
        if (text.length > BLOCK_MAX_CHARS) text = text.slice(0, BLOCK_MAX_CHARS);
      }
    }
  } catch (err) {
    logger.warn('🎨 تعذّر بناء قسم الأسلوب', { guildId, error: err });
  }
  blockCache.set(guildId, { text, at: Date.now() });
  return text;
}

// ---------------------------------------------------------------- حارس النسخ
const normWords = (t) =>
  String(t || '')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

const SHINGLE = 4;
const shingles = (words) => {
  const out = new Set();
  for (let i = 0; i + SHINGLE <= words.length; i += 1) out.add(words.slice(i, i + SHINGLE).join(' '));
  return out;
};

const exampleCache = new Map(); // guildId -> { at, shingles:Set, phrases:string[] }

async function exampleIndex(guildId) {
  const hit = exampleCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
  const rows = await store.aiStyle.recent(guildId, 300);
  const all = new Set();
  const phrases = [];
  for (const r of rows) {
    const w = normWords(r.reply_text);
    for (const sh of shingles(w)) all.add(sh);
    if (w.length >= 3) phrases.push(` ${w.join(' ')} `);
  }
  const idx = { at: Date.now(), shingles: all, phrases };
  exampleCache.set(guildId, idx);
  return idx;
}

/** هل رد النموذج ينسخ عبارة من أمثلة الأسلوب المحفوظة؟ (4 كلمات متتالية أو مثال كامل ≥3 كلمات) */
async function copiesExamples(guildId, text) {
  try {
    const s = await settingsFor(guildId);
    if (!s.ai_style_enabled) return false;
    const idx = await exampleIndex(guildId);
    if (!idx.shingles.size && !idx.phrases.length) return false;
    const w = normWords(text);
    for (const sh of shingles(w)) if (idx.shingles.has(sh)) return true;
    const joined = ` ${w.join(' ')} `;
    return idx.phrases.some((ph) => joined.includes(ph));
  } catch {
    return false;
  }
}

function invalidate(guildId) {
  if (guildId) {
    blockCache.delete(guildId);
    exampleCache.delete(guildId);
    profileCache.delete(guildId);
  } else {
    blockCache.clear();
    exampleCache.clear();
    profileCache.clear();
  }
}

module.exports = { sanitize, styleOwnerId, isStyleAuthor, learn, captureTicketReply, captureReply, captureChat, styleBlock, copiesExamples, refreshProfile, invalidate, _internal: { lastChatCapture, blockCache, profileCache, exampleCache } };
