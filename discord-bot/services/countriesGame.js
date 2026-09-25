'use strict';

// "لعبة الدول" (/دول) — نفس فكرة لعبة الدول بموقع احسمها، مبنية على محرّك
// الإقصاء المشترك (services/eliminationGame.js):
//   • أول ما تبدأ الجولات: كل لاعب ياخذ دولة مختلفة عشوائياً (سحب بدون إرجاع
//     من config/countries.js) — **سرية تماماً**: ما تنرسل لأحد (ولا حتى
//     لصاحبها)، وما تظهر بأي رسالة عامة إلا بعد إقصائها.
//   • الروليت يختار صاحب الدور، وهذا يختار **دولة** يقصيها من قائمة الدول
//     الباقية (بدون أسماء لاعبين) — ولو طلعت دولته هو، أقصى نفسه!
//   • قيم القائمة رموز عشوائية (مو معرّفات لاعبين) — فما يقدر أحد يربط دولة
//     بلاعب حتى من بيانات الرسالة.
//   • كل إقصاء له إعلان بارز يكشف الدولة وصاحبها ومن أقصاها.
//   • الفائز ودولته + ترتيب الإقصاء بدول الكل مكشوفة.

const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const COUNTRIES = require('../config/countries');
const crypto = require('node:crypto');
const { createEliminationGame, displayName, fitLines } = require('./eliminationGame');

// ---------------- قائمة الدول ----------------
const isHttpsUrl = (u) => {
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
};

// تنظيف القائمة: بدون عناصر ناقصة أو أسماء مكررة، والصورة فقط لو رابط https صالح
function normalizeCountries(list) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c.name !== 'string' || !c.name.trim() || typeof c.flagEmoji !== 'string' || !c.flagEmoji) continue;
    const name = c.name.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, flagEmoji: c.flagEmoji, flagImageUrl: isHttpsUrl(c.flagImageUrl) ? c.flagImageUrl : null });
  }
  return out;
}

/**
 * توزيع دولة لكل لاعب — سحب بدون إرجاع (Fisher–Yates)، فما تتكرر دولة طالما
 * عدد اللاعبين ≤ عدد الدول. لو زادوا: نكمل من خلطة جديدة للقائمة (تكرار
 * عشوائي) بدل ما تتعطل اللعبة.
 * @returns {Map<string, object>} playerId -> country
 */
function assignCountries(playerIds, list, random = Math.random) {
  const pool = normalizeCountries(list);
  if (!pool.length) throw new Error('قائمة الدول فاضية');
  const shuffled = () => {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const out = new Map();
  let bag = [];
  for (const id of playerIds) {
    if (!bag.length) bag = shuffled();
    out.set(id, bag.pop());
  }
  if (playerIds.length > pool.length) {
    logger.warn('الدول: عدد اللاعبين أكبر من عدد الدول — بعض الدول بتتكرر', { players: playerIds.length, countries: pool.length });
  }
  return out;
}

// ---------------- صور الأعلام ----------------
// نفحص الرابط (HEAD) قبل ما نحطه بالـEmbed؛ لو فشل نكتفي بالرمز التعبيري.
// النتيجة تنحفظ (ساعة للناجح، 10 دقائق للفاشل) عشان ما نكرر الطلب كل إقصاء.
const imageCache = new Map(); // url -> { ok, at }
const OK_TTL = 60 * 60 * 1000;
const FAIL_TTL = 10 * 60 * 1000;

async function defaultImageCheck(url, timeoutMs) {
  const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' });
  if (!res.ok) return false;
  const type = res.headers.get('content-type') || '';
  return !type || type.startsWith('image/');
}

async function checkFlagImage(url) {
  if (!url || !isHttpsUrl(url)) return false;
  const hit = imageCache.get(url);
  if (hit && Date.now() - hit.at < (hit.ok ? OK_TTL : FAIL_TTL)) return hit.ok;
  let ok = false;
  try {
    const s = engine.settings();
    ok = !!(await (s.imageCheck || defaultImageCheck)(url, s.imageTimeoutMs));
  } catch (err) {
    ok = false;
    logger.debug('الدول: تعذّر تحميل صورة علم — نستخدم الرمز التعبيري', { url, error: err.message });
  }
  imageCache.set(url, { ok, at: Date.now() });
  return ok;
}
// نسخة متزامنة (من الكاش فقط) للأماكن اللي ما تقدر تنتظر
const cachedFlagImage = (country) => {
  const hit = country && country.flagImageUrl && imageCache.get(country.flagImageUrl);
  return hit && hit.ok ? country.flagImageUrl : null;
};
async function flagImage(country) {
  return country && (await checkFlagImage(country.flagImageUrl)) ? country.flagImageUrl : null;
}

// ---------------- نصوص ----------------
const countryOf = (game, id) => (game.countries && game.countries.get(id)) || null;
const countryText = (c) => (c ? `${c.flagEmoji} ${c.name}` : '🏳️ —');

function howOut(entry) {
  if (entry.reason === 'self') return '😱 أقصى دولته هو بنفسه — ما كان يدري إنها دولته!';
  if (entry.reason === 'left') return '🚪 غادر السيرفر — دولته انقصت تلقائياً';
  return `🎯 أقصاها <@${entry.by.id}>`;
}

// الدول الباقية مرتبة أبجدياً (مستقل تماماً عن ترتيب اللاعبين — ما يكشف مين صاحب أي دولة)
function activeCountries(game) {
  const out = [];
  for (const [token, id] of game.countryTokens || []) {
    if (!game.players.has(id)) continue;
    const c = countryOf(game, id);
    if (c) out.push({ token, country: c });
  }
  return out.sort((a, b) => a.country.name.localeCompare(b.country.name, 'ar'));
}

// رمز عشوائي لكل دولة بالجولة (قيمة القائمة) ← صاحبها بالذاكرة فقط
function issueTokens(game) {
  game.countryTokens = new Map();
  for (const id of game.countries.keys()) {
    let t;
    do t = crypto.randomBytes(4).toString('hex');
    while (game.countryTokens.has(t));
    game.countryTokens.set(t, id);
  }
}

function eliminationPayload(game, entry, image) {
  const c = countryOf(game, entry.id);
  const embed = eb.brand({
    tone: entry.reason === 'self' ? 'pink' : 'gold',
    title: '🌍 لعبة الدول — إقصاء! 💥',
    description:
      `# ${countryText(c)}\n` +
      `انقصت دولة **${c ? c.name : '—'}** — وانكشف صاحبها: <@${entry.id}> **خرج من اللعبة!**\n\n` +
      `**${howOut(entry)}**\n\n` +
      `👥 المتبقين: **${game.players.size}**`,
    image: image || undefined
  });
  embed.addFields(
    eb.field('💀 المُقصى', `<@${entry.id}>`, true),
    eb.field('🌍 دولته', countryText(c), true),
    eb.field('⚔️ الطريقة', entry.reason === 'picked' ? `أقصاها <@${entry.by.id}>` : entry.reason === 'self' ? 'أقصى دولته بنفسه' : 'غادر السيرفر', true)
  );
  return { content: `💥 <@${entry.id}>`, embeds: [embed], allowedMentions: { users: [entry.id] } };
}

// ---------------- المحرّك ----------------
const engine = createEliminationGame({
  key: 'countries',
  logName: 'الدول',
  prefix: 'dl',
  command: '/دول',
  title: '🌍 لعبة الدول',
  wheelTitle: '🌍 لعبة الدول',
  lobbyIntro:
    'اضغط **انضمام** وادخل اللعبة! أول ما تبدأ، كل لاعب ياخذ **دولة سرية** — محد يعرف دولة أحد (ولا حتى دولته!) 🤫\n' +
    'كل جولة الروليت يختار لاعب، وهذا اللاعب يختار **دولة** يقصيها — ولو طلعت دولته هو، أقصى نفسه! **آخر دولة تبقى تفوز 🏆**',
  defaults: {
    maxPlayers: 50, // قائمتين اختيار (25 + 25) — وأقل من عدد الدول، فما تتكرر دولة
    afterPickMs: 3500, // وقت كافي لقراءة إعلان الإقصاء قبل الدوران الجاي
    imageTimeoutMs: 3000,
    countries: COUNTRIES,
    imageCheck: null
  },
  allowSelfPick: true, // الدول مجهولة — صاحب الدور ممكن يقصي دولته بدون ما يدري
  pickPlaceholder: 'اختر دولة تقصيها',
  choosePrompt: () => 'اختر **دولة** تقصيها من القائمة تحت — وانتبه، ممكن تكون دولتك! 😬',
  startText: (game) =>
    `🌍 تم توزيع الدول سراً على الجميع! **${game.players.size}** دولة بالمعركة — محد يعرف دولة مين 🤫\nالروليت يدور... 🎲`,
  // قائمة صاحب الدور: الدول الباقية بأعلامها (بدون أسماء لاعبين، والقيم رموز عشوائية)
  pickOptions: (game) =>
    activeCountries(game).map(({ token, country }) => ({ label: `${country.flagEmoji} ${country.name}`.slice(0, 100), value: token })),
  resolvePick: (game, value) => (game.countryTokens && game.countryTokens.get(String(value))) || null,
  roundFields: (game) => {
    const list = activeCountries(game);
    if (!list.length) return [];
    return [eb.field(`🌍 الدول الباقية (${list.length})`, fitLines(list.map(({ country }) => `${country.flagEmoji} ${country.name}`), 1000).replace(/\n/g, ' · '), false)];
  },
  skipNote: (game, chooser) =>
    `⌛ ${chooser ? displayName(chooser) : 'اللاعب'} ما اختار خلال ${Math.round(engine.settings().pickMs / 1000)} ثانية — **ما انقصت أي دولة**، والروليت يدور من جديد 🎲`,
  pickNote: (game, by, target) => {
    const c = countryText(countryOf(game, target.id));
    return by.id === target.id
      ? `😱 **${displayName(by)}** أقصى دولة ${c} — وطلعت دولته هو!`
      : `💥 **${displayName(by)}** أقصى دولة ${c} — وكانت دولة **${displayName(target)}**!`;
  },
  // المُقصين دولهم انكشفت، فعادي تظهر جنبهم
  outLabel: (game, e) => `~~${displayName(e)}~~ ${countryOf(game, e.id) ? countryOf(game, e.id).flagEmoji : ''}`.trimEnd(),
  orderLine: (game, e, i) => {
    const how = e.reason === 'self' ? 'أقصى دولته بنفسه' : e.reason === 'left' ? 'مُقصى تلقائياً (غادر السيرفر)' : `أقصاها ${displayName(e.by)}`;
    return `\`${i + 1}\` ${displayName(e)} — ${countryText(countryOf(game, e.id))} — ${how}`;
  },
  winnerTitle: '🏆 لعبة الدول — عندنا فائز!',
  winnerText: (game, w) =>
    `🎉 مبروك <@${w.id}>! صمدت لآخر اللعبة وفزت 👑\n\n# ${countryText(countryOf(game, w.id))}\nآخر دولة صامدة — وكانت دولتك السرية 🤫\n\nالعب ألعاب أكثر على ehsmaha.com`,
  winnerFields: (game, w) => [eb.field('🌍 دولة الفائز', countryText(countryOf(game, w.id)), true)],
  winnerThumbnail: (game, w) => cachedFlagImage(countryOf(game, w.id)),

  onCreate(game) {
    game.countries = new Map(); // playerId -> country (سري — ما ينرسل لأحد)
    game.countryTokens = new Map(); // رمز عشوائي -> playerId (قيم قائمة الإقصاء)
  },
  async onStart(game) {
    const s = engine.settings();
    game.countries = assignCountries([...game.players.keys()], s.countries, s.random);
    issueTokens(game);
    // تجهيز صور الأعلام مسبقاً (عشان إعلان الإقصاء يطلع فوري) — بدون انتظار
    for (const c of game.countries.values()) checkFlagImage(c.flagImageUrl).catch(() => null);
  },
  async onEliminated(game, entry) {
    if (!game.alive) return;
    const image = await flagImage(countryOf(game, entry.id));
    if (!game.alive) return;
    try {
      await game.channel.send(eliminationPayload(game, entry, image));
    } catch (err) {
      // فشل إرسال صورة العلم؟ نعيد بالرمز التعبيري بس
      if (image) {
        await game.channel.send(eliminationPayload(game, entry, null)).catch((e) =>
          logger.warn('الدول: تعذّر إعلان الإقصاء', { channelId: game.channelId, code: e.code })
        );
      } else {
        logger.warn('الدول: تعذّر إعلان الإقصاء', { channelId: game.channelId, code: err.code });
      }
    }
  },
  onEnd(game) {
    // الحالة السرية ما تبقى بالذاكرة بعد النهاية (الفائز انعلن قبلها)
    if (game.countries) game.countries.clear();
    if (game.countryTokens) game.countryTokens.clear();
  }
});

module.exports = Object.assign(engine, {
  assignCountries,
  normalizeCountries,
  checkFlagImage,
  eliminationPayload,
  activeCountries,
  _images: imageCache
});
