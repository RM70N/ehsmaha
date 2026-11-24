'use strict';

// جنس المتحدث بالشات العام: المساعد يخاطب البنت بصيغة المؤنث والولد بصيغة المذكر.
//   • المصدر الأقوى: تصريح العضو نفسه ("أنا بنت" / "أنا ولد" / "ناديني بصيغة المؤنث") ← يتحفظ بقاعدة البوت
//   • مصدر ثانوي: رتبة بالسيرفر واضحة (بنات/شباب) لو ما صرّح
//   • غير معروف ← صياغة محايدة (لا نفترض)
// + تنظيف رد الشات العام: ضحك وإيموجي بس لو يناسب الكلام.

const store = require('../database/botStore');
const logger = require('../utils/logger');

const cache = new Map(); // `${guildId}:${userId}` -> 'female' | 'male' | null

const norm = (t) =>
  String(t || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const FEM = '(?:بنت|بنوته|فتاه|انثي|حرمه)';
const MAS = '(?:ولد|شاب|رجال|رجل|ذكر|زلمه)';
const NEG = '(?:مو|مب|مش|ماني|لست|ما\\s+انا)';

/**
 * يلتقط تصريح العضو بجنسه من نص رسالته. يرجّع 'female' | 'male' | null (آخر تصريح بالرسالة هو المعتمد).
 */
function detect(text) {
  const t = norm(text);
  if (!t) return null;
  const hits = [];
  const add = (re, gender) => {
    for (const m of t.matchAll(new RegExp(re, 'g'))) hits.push({ at: m.index, gender });
  };
  // نفي: "أنا مو بنت" ← ولد، "أنا مب ولد" ← بنت (ما ينلقط كتصريح مباشر)
  add(`(?:^|\\s)(?:انا\\s+)?${NEG}\\s+${FEM}(?:\\s|$)`, 'male');
  add(`(?:^|\\s)(?:انا\\s+)?${NEG}\\s+${MAS}(?:\\s|$)`, 'female');
  // تصريح مباشر (وما قبلها نفي)
  for (const m of t.matchAll(new RegExp(`(?:^|\\s)انا\\s+(?!${NEG}\\s)${FEM}(?:\\s|$)`, 'g'))) hits.push({ at: m.index, gender: 'female' });
  for (const m of t.matchAll(new RegExp(`(?:^|\\s)انا\\s+(?!${NEG}\\s)${MAS}(?:\\s|$)`, 'g'))) hits.push({ at: m.index, gender: 'male' });
  // طلب مخاطبة بصيغة معينة
  add('(?:كلمني|خاطبني|ناديني|كلمو?ني)\\s+(?:ب|بصيغه\\s+|صيغه\\s+)?(?:ال)?(?:مونث|بنت)', 'female');
  add('(?:كلمني|خاطبني|ناديني|كلمو?ني)\\s+(?:ب|بصيغه\\s+|صيغه\\s+)?(?:ال)?(?:مذكر|ولد)', 'male');
  if (!hits.length) return null;
  hits.sort((a, b) => a.at - b.at);
  return hits[hits.length - 1].gender;
}

const key = (guildId, userId) => `${guildId}:${userId}`;

async function get(guildId, userId) {
  const k = key(guildId, userId);
  if (cache.has(k)) return cache.get(k);
  let g = null;
  try {
    g = (await store.userGender.get(guildId, userId)) || null;
  } catch (err) {
    logger.warn('⚧ تعذّر قراءة جنس العضو', { guildId, error: err });
  }
  cache.set(k, g);
  return g;
}

async function remember(guildId, userId, gender) {
  cache.set(key(guildId, userId), gender);
  try {
    await store.userGender.set(guildId, userId, gender);
  } catch (err) {
    logger.warn('⚧ تعذّر حفظ جنس العضو', { guildId, error: err });
  }
}

/** تلميح من رتب العضو (بنات/شباب) — فقط لو رتبة واحدة واضحة */
function roleHint(member) {
  try {
    const names = [...(member && member.roles && member.roles.cache ? member.roles.cache.values() : [])].map((r) => norm(r.name));
    const f = names.some((n) => /(^|\s)(بنات|بنت|girls?|female|انثي)(\s|$)/.test(n));
    const m = names.some((n) => /(^|\s)(شباب|ولد|رجال|boys?|male|ذكر)(\s|$)/.test(n));
    if (f && !m) return 'female';
    if (m && !f) return 'male';
  } catch {
    /* بدون رتب */
  }
  return null;
}

/** الجنس المعتمد: المسجّل أولاً ثم الرتبة. */
async function resolve(guildId, member, userId) {
  return (await get(guildId, userId)) || roleHint(member) || null;
}

const LABEL = { female: 'بنت', male: 'ولد' };
const tagOf = (g) => (g ? ` (${LABEL[g]})` : '');

/** سطر البرومبت عن المتحدث */
function promptLine(name, gender, { justSet = false } = {}) {
  if (gender === 'female') {
    return `## المتحدث\n- ${name} **بنت**${justSet ? ' (صرّحت لتوها بذلك — أكّد لها بشكل طبيعي وكمّل معها)' : ''}: خاطبها دائماً بصيغة المؤنث (أنتِ، تعالي، شفتِ، وش تبين…) وناديها بـ"يا بنت/يا أختي/يا بعد قلبي" بحسب الجو، وممنوع صيغة المذكر معها.`;
  }
  if (gender === 'male') {
    return `## المتحدث\n- ${name} **ولد**${justSet ? ' (صرّح لتوه بذلك — أكّد له بشكل طبيعي وكمّل معه)' : ''}: خاطبه بصيغة المذكر (يا ولد، ياخوي، تعال…) وممنوع المؤنث معه.`;
  }
  return `## المتحدث\n- ${name}: جنسه غير معروف. لا تفترض: تجنّب صيغ المخاطبة المذكرة والمؤنثة قدر الإمكان (بدون "يا ولد/يا بنت/ياخوي/يا أختي"، وبدون أفعال أمر أو ضمائر مخاطب بجنس محدد؛ استخدم صياغة محايدة مثل "وش السالفة" و"نورتونا"). لو هو أو هي قال/ت جنسه/ا انتقل للصيغة الصحيحة.`;
}

// ---------------- تنظيف رد الشات العام ----------------
const LAUGH_RE = /(?:ه{3,}|ها{2,}ه*|هه+ه+|[😂🤣😹💀]+)/gu;
const USER_LAUGH_RE = /(?:هه+|ها{2,}|[😂🤣😹💀]|ضحك|مضحك|نكته|نكتة|يضحك|ميمز|كوميدي)/u;
const SERIOUS_RE = /(?:مشكل|ما\s*يشتغل|ما\s*يفتح|ما\s*اشتغل|خرب|حظر|بان|باند|زعلان|زعلت|حزين|حزينه|تعبان|تعبانه|خسر|ضاع|ضايع|سرق|هكر|اختراق|مساعده|ساعدني|ساعدوني|عطل|خطا|خطأ|ما\s*وصل)/u;
const EMOJI_RE = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|️)*/gu;

/**
 * ضحك بوقته فقط وإيموجي بمكانه:
 *  • الضحك ("ههههه"، 😂) يبقى فقط لو كلام اللي قبله ضحك أو نكتة
 *  • مع المشاكل والزعل ← بدون إيموجي أبداً
 *  • بغير ذلك: إيموجي واحد كحد أقصى
 */
function cleanReply(reply, userText) {
  let out = String(reply || '');
  const u = norm(userText || '');
  const raw = String(userText || '');
  const userLaughs = USER_LAUGH_RE.test(raw) || USER_LAUGH_RE.test(u);
  const serious = SERIOUS_RE.test(u);
  if (!userLaughs || serious) out = out.replace(LAUGH_RE, ' ');
  if (serious) out = out.replace(EMOJI_RE, ' ');
  else {
    let n = 0;
    out = out.replace(EMOJI_RE, (m) => (++n <= 1 ? m : ' '));
  }
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\s+([،.!؟?])/g, '$1').replace(/^[\s،.]+/, '').trim();
  return out || String(reply || '').replace(LAUGH_RE, '').replace(EMOJI_RE, '').trim();
}

function _reset() {
  cache.clear();
}

module.exports = { detect, get, remember, roleHint, resolve, tagOf, promptLine, cleanReply, _reset, _internal: { norm, cache } };
