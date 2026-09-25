'use strict';

// "لعبة الدول" (/دول) — نفس مراحل روليت الإقصاء (المحرّك المشترك
// services/eliminationGame.js) مع إضافات خاصة:
//   • أول ما تبدأ الجولات: كل لاعب ياخذ دولة مختلفة عشوائياً (سحب بدون إرجاع
//     من config/countries.js) وتوصله بالخاص.
//   • الدول سرية: خريطة playerId → country بـgame.countries بالذاكرة فقط، وما
//     تظهر بأي رسالة عامة إلا بعد إقصاء صاحبها.
//   • صاحب الدور يقدر يختار نفسه، وكل إقصاء له إعلان بارز منفصل يكشف الدولة.
//   • الفائز ودولته + ترتيب الإقصاء بدول الكل مكشوفة.

const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const COUNTRIES = require('../config/countries');
const { createEliminationGame, displayName } = require('./eliminationGame');

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
  if (entry.reason === 'self') return '😱 أقصى نفسه بنفسه!';
  if (entry.reason === 'left') return '🚪 غادر السيرفر — مُقصى تلقائياً';
  return `🎯 أقصاه <@${entry.by.id}>`;
}

function eliminationPayload(game, entry, image) {
  const c = countryOf(game, entry.id);
  const embed = eb.brand({
    tone: entry.reason === 'self' ? 'pink' : 'gold',
    title: '🌍 لعبة الدول — إقصاء! 💥',
    description:
      `# ${countryText(c)}\n` +
      `<@${entry.id}> **خرج من اللعبة**، وانكشفت دولته أخيراً!\n\n` +
      `**${howOut(entry)}**\n\n` +
      `👥 المتبقين: **${game.players.size}**`,
    image: image || undefined
  });
  embed.addFields(
    eb.field('💀 المُقصى', `<@${entry.id}>`, true),
    eb.field('🌍 دولته', countryText(c), true),
    eb.field('⚔️ الطريقة', entry.reason === 'picked' ? `أقصاه <@${entry.by.id}>` : entry.reason === 'self' ? 'أقصى نفسه' : 'غادر السيرفر', true)
  );
  return { content: `💥 <@${entry.id}>`, embeds: [embed], allowedMentions: { users: [entry.id] } };
}

function dmPayload(game, country, image) {
  const embed = eb.brand({
    tone: 'gold',
    title: '🌍 لعبة الدول — دولتك السرية',
    description:
      `# ${countryText(country)}\n` +
      `هذي دولتك بالجولة الحالية بـ<#${game.channelId}> 🤫\n` +
      '**لا تكشفها لأحد!** دولتك تنكشف للكل بس لما تنقصى.\n\nبالتوفيق 🍀 — ehsmaha.com',
    thumbnail: image || undefined
  });
  return { embeds: [embed] };
}

// ---------------- الخاص ----------------
// توصيل الدول بالخاص — فشل الخاص (مقفل مثلاً) يُسجَّل بالـlog بس وما يوقف اللعبة
async function sendCountryDms(game) {
  const s = engine.settings();
  const results = await Promise.allSettled(
    [...game.players.values()].map(async (p) => {
      const country = countryOf(game, p.id);
      const image = await flagImage(country);
      await engine.sendDm(game, p.id, dmPayload(game, country, image), s.dmTimeoutMs);
      return p.id;
    })
  );
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const p = [...game.players.values()][i];
      failed.push(p.id);
      logger.warn('الدول: تعذّر إرسال الدولة بالخاص (الخاص مقفل؟) — اللعبة مستمرة', {
        channelId: game.channelId,
        userId: p && p.id,
        code: r.reason && r.reason.code
      });
    }
  });
  game.dmFailed = failed;
  return failed;
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
    'اضغط **انضمام** وادخل اللعبة! أول ما تبدأ، كل لاعب توصله **دولة سرية بالخاص** 🤫\n' +
    'كل جولة الروليت يختار لاعب، وهذا اللاعب يختار مين يُقصى (حتى نفسه!) — ودولة المُقصى تنكشف للكل. **آخر واحد يبقى يفوز 🏆**',
  defaults: {
    maxPlayers: 50, // قائمتين اختيار (25 + 25) — وأقل من عدد الدول، فما تتكرر دولة
    afterPickMs: 3500, // وقت كافي لقراءة إعلان الإقصاء قبل الدوران الجاي
    dmTimeoutMs: 5000,
    imageTimeoutMs: 3000,
    countries: COUNTRIES,
    imageCheck: null
  },
  allowSelfPick: true,
  optionEmoji: '🏳️', // العلم مخفي — ما ينكشف إلا بعد الإقصاء
  pickPlaceholder: 'اختر مين يُقصى (تقدر تختار نفسك)',
  choosePrompt: () => 'اختر مين يُقصى من القائمة تحت (حتى نفسك!)',
  startText: (game) =>
    `بدأت اللعبة بـ **${game.players.size}** لاعبين! 📩 كل لاعب وصلته دولته السرية بالخاص — لا تكشفها لأحد 🤫\nالروليت يدور... 🎲`,
  skipNote: (game, chooser) =>
    `⌛ ${chooser ? displayName(chooser) : 'اللاعب'} ما اختار خلال ${Math.round(engine.settings().pickMs / 1000)} ثانية — **ما انقصى أحد**، والروليت يدور من جديد 🎲`,
  pickNote: (game, by, target) =>
    by.id === target.id ? `💥 **${displayName(by)}** أقصى نفسه بنفسه! 😱` : `💥 **${displayName(by)}** أقصى **${displayName(target)}**!`,
  // المُقصين دولهم انكشفت، فعادي تظهر جنبهم
  outLabel: (game, e) => `~~${displayName(e)}~~ ${countryOf(game, e.id) ? countryOf(game, e.id).flagEmoji : ''}`.trimEnd(),
  orderLine: (game, e, i) => {
    const how = e.reason === 'self' ? 'أقصى نفسه' : e.reason === 'left' ? 'مُقصى تلقائياً (غادر السيرفر)' : `أقصاه ${displayName(e.by)}`;
    return `\`${i + 1}\` ${displayName(e)} — ${countryText(countryOf(game, e.id))} — ${how}`;
  },
  winnerTitle: '🏆 لعبة الدول — عندنا فائز!',
  winnerText: (game, w) =>
    `🎉 مبروك <@${w.id}>! صمدت لآخر اللعبة وفزت 👑\n\n# ${countryText(countryOf(game, w.id))}\nهذي كانت دولتك السرية 🤫\n\nالعب ألعاب أكثر على ehsmaha.com`,
  winnerFields: (game, w) => [eb.field('🌍 دولة الفائز', countryText(countryOf(game, w.id)), true)],
  winnerThumbnail: (game, w) => cachedFlagImage(countryOf(game, w.id)),

  onCreate(game) {
    game.countries = new Map(); // playerId -> country (سري)
    game.dmFailed = [];
  },
  async onStart(game) {
    const s = engine.settings();
    game.countries = assignCountries([...game.players.keys()], s.countries, s.random);
    try {
      await sendCountryDms(game);
    } catch (err) {
      logger.warn('الدول: خطأ بإرسال الدول بالخاص', { channelId: game.channelId, error: err });
    }
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
    game.dmFailed = [];
  }
});

module.exports = Object.assign(engine, {
  assignCountries,
  normalizeCountries,
  checkFlagImage,
  eliminationPayload,
  dmPayload,
  _images: imageCache
});
