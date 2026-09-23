'use strict';

// نظام الحماية التلقائي: كشف الروابط والسبام + كتم تصاعدي مستقل لكل نوع.
//
// لكل رسالة من عضو (غير أدمن):
//   1) روابط: رابط غير مسموح (ما هو بالقائمة البيضاء، والقناة مو مستثناة، والعضو
//      ما عنده رتبة مستثناة) ← مخالفة "link".
//   2) سبام: رسائل كثيرة بوقت قصير أو نفس الرسالة تتكرر ← مخالفة "spam".
// العقوبة: حذف الرسالة (ورسائل السبام الأخيرة) + كتم حسب عدّاد النوع نفسه:
//   الأولى 10 دقائق، الثانية 30 دقيقة، الثالثة فأكثر 24 ساعة (config/autoMod.js).
// + إشعار بالقناة ينحذف بعد 5 ثوانٍ + DM للعضو + سجل بـmoderation_log (auto_timeout).
//
// كل خطوة بـtry/catch منفصل: فشل الحذف ما يمنع الكتم، وفشل الكتم ما يوقف البوت.

const { Collection, PermissionFlagsBits } = require('discord.js');
const cfg = require('../config/autoMod');
const store = require('../database/botStore');
const logger = require('../utils/logger');
const eb = require('../utils/embedBuilder');
const { checkAdminPermission } = require('../utils/adminPermissions');
const { formatDurationAr, tryDm, dmEmbed, logModeration } = require('../utils/moderation');

const TYPE_AR = { link: 'نشر روابط', spam: 'السبام (رسائل متكررة/سريعة)' };

// ======================= كشف الروابط =======================
// نطاقات عليا شائعة فقط للروابط بدون بروتوكول — يمنع اعتبار "3.5" أو "node.js"
// أو "صورة.png" روابط (False Positives).
const TLDS = [
  'com', 'net', 'org', 'io', 'gg', 'me', 'co', 'tv', 'ly', 'xyz', 'app', 'dev', 'info', 'biz', 'online', 'site',
  'store', 'shop', 'link', 'live', 'club', 'top', 'vip', 'pro', 'fun', 'games', 'game', 'win', 'bet', 'click', 'lol',
  'ru', 'uk', 'us', 'de', 'fr', 'ae', 'sa', 'kw', 'qa', 'bh', 'om', 'eg', 'jo', 'ma', 'tk', 'ml', 'ga', 'cf', 'gq',
  'to', 'cc', 'ws', 'sh', 'ai', 'fm', 'be', 'nl', 'es', 'ca', 'au', 'in', 'tr', 'pk', 'id', 'my', 'ph', 'br', 'mx',
  'cn', 'jp', 'kr', 'it', 'pl', 'se', 'ch', 'at', 'nz', 'za', 'ng', 'ir', 'iq', 'sy', 'lb', 'ps', 'ye', 'tn', 'dz', 'ly', 'sd'
];
const URL_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const INVITE_RE = /(?:^|[^a-z0-9.-])((?:discord(?:app)?\.com\/invite|discord\.gg|dsc\.gg)\/[a-z0-9-]+)/gi;
const BARE_RE = new RegExp(
  `(?:^|[^a-z0-9.@/-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${[...new Set(TLDS)].join('|')}))(?![a-z0-9-])(?:[/:?#][^\\s<>]*)?`,
  'gi'
);

function hostOf(raw) {
  let s = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '');
  s = s.split(/[/?#]/)[0].split('@').pop().split(':')[0];
  s = s.replace(/[)\].,!?،؛'"]+$/, '').replace(/^www\./, '');
  return s;
}

function pathOf(raw) {
  const s = String(raw).replace(/^https?:\/\//i, '');
  const i = s.search(/[/?#]/);
  return i >= 0 ? s.slice(i).toLowerCase() : '';
}

// كل الروابط بالنص: [{ host, raw }]
function extractLinks(content) {
  const text = String(content || '');
  const found = [];
  for (const m of text.matchAll(URL_RE)) found.push(m[0]);
  for (const m of text.matchAll(INVITE_RE)) found.push(m[1]);
  // الروابط بدون بروتوكول (نشيل اللي انمسكت فوق عشان ما نكررها)
  const stripped = text.replace(URL_RE, ' ');
  for (const m of stripped.matchAll(BARE_RE)) found.push(m[1] + (m[0].slice(m[0].indexOf(m[1]) + m[1].length) || ''));
  return found.map((raw) => ({ raw, host: hostOf(raw), path: pathOf(raw) })).filter((l) => l.host && l.host.includes('.'));
}

// نطاق مسموح؟ (النطاق نفسه أو أي نطاق فرعي منه)
function hostAllowed(host, allowed) {
  return allowed.some((d) => host === d || host.endsWith(`.${d}`));
}

// أول رابط مخالف أو null
function findViolatingLink(content, allowedDomains = []) {
  const allowed = [...cfg.builtinAllowedDomains, ...allowedDomains].map((d) => String(d).toLowerCase());
  for (const link of extractLinks(content)) {
    // روابط رسائل ديسكورد الداخلية (discord.com/channels/...) مسموحة — الدعوات لا
    if ((link.host === 'discord.com' || link.host === 'discordapp.com') && link.path.startsWith('/channels/')) continue;
    if (!hostAllowed(link.host, allowed)) return link;
  }
  return null;
}

// يحوّل مدخل المستخدم (رابط كامل أو نطاق) لنطاق نظيف، أو null لو غير صالح
function normalizeDomain(input) {
  const host = hostOf(String(input || ''));
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(host)) return null;
  return host;
}

// ======================= تتبّع السبام (بالذاكرة) =======================
// guildId:userId → { hits: [{ at, id, channelId }], last, dup, lastAt }
const tracker = new Collection();

function trackSpam(message, now = Date.now()) {
  const key = `${message.guild.id}:${message.author.id}`;
  let t = tracker.get(key);
  if (!t) {
    t = { hits: [], last: null, dup: 0, lastAt: 0 };
    tracker.set(key, t);
  }
  const content = String(message.content || '').trim().toLowerCase();
  t.hits = t.hits.filter((h) => now - h.at <= Math.max(cfg.spam.windowMs, cfg.spam.duplicateWindowMs));
  t.hits.push({ at: now, id: message.id, channelId: message.channel.id });
  if (t.hits.length > 50) t.hits.splice(0, t.hits.length - 50);

  // تكرار نفس الرسالة (نص فعلي فقط — رسائل الصور بدون نص ما تنحسب تكرار)
  if (content && content === t.last && now - t.lastAt <= cfg.spam.duplicateWindowMs) t.dup += 1;
  else t.dup = content ? 1 : 0;
  t.last = content || null;
  t.lastAt = now;

  const inWindow = t.hits.filter((h) => now - h.at <= cfg.spam.windowMs);
  let reason = null;
  if (inWindow.length >= cfg.spam.maxMessages) reason = 'rate';
  else if (t.dup >= cfg.spam.duplicateCount) reason = 'duplicate';
  if (!reason) return { spam: false };

  const messages = (reason === 'rate' ? inWindow : t.hits.slice(-t.dup)).map(({ id, channelId }) => ({ id, channelId }));
  tracker.delete(key); // بداية جديدة بعد العقوبة
  return { spam: true, reason, messages };
}

// تنظيف دوري: يشيل العضو اللي ما أرسل شي من فترة (يمنع تسرّب الذاكرة)
function sweepTracker(now = Date.now()) {
  let removed = 0;
  for (const [key, t] of tracker) {
    if (now - t.lastAt > cfg.spam.idleTtlMs) {
      tracker.delete(key);
      removed += 1;
    }
  }
  for (const [key, at] of recentPunish) if (now - at > cfg.punishCooldownMs) recentPunish.delete(key);
  for (const [key, at] of permWarned) if (now - at > 60 * 60 * 1000) permWarned.delete(key);
  return removed;
}

let sweepTimer = null;
function startSweeper() {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => sweepTracker(), cfg.spam.sweepIntervalMs);
  if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
}
function stopSweeper() {
  if (sweepTimer) clearInterval(sweepTimer);
  sweepTimer = null;
}

// ======================= إعدادات السيرفر (كاش قصير) =======================
const CACHE_MS = 30 * 1000;
const guildCache = new Map(); // guildId → { at, settings, exemptions }

async function guildRules(guildId) {
  const hit = guildCache.get(guildId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const [settings, exemptions] = await Promise.all([store.guildSettings.get(guildId), store.autoMod.exemptions(guildId)]);
  const fresh = { at: Date.now(), settings, exemptions };
  guildCache.set(guildId, fresh);
  return fresh;
}
const invalidate = (guildId) => guildCache.delete(guildId);

// ======================= العقوبة =======================
const recentPunish = new Map(); // guild:user:type → آخر عقوبة (منع التصعيد المتلاحق)
const permWarned = new Map(); // guild:perm → آخر تحذير بالسجل

function durationFor(count) {
  const levels = cfg.escalationMs;
  return levels[Math.min(Math.max(count, 1), levels.length) - 1];
}

function warnPermOnce(guildId, perm) {
  const key = `${guildId}:${perm}`;
  if (permWarned.has(key)) return;
  permWarned.set(key, Date.now());
  logger.warn('الحماية التلقائية: البوت ناقصه صلاحية', { guildId, perm });
}

async function deleteMessages(message, extra = []) {
  const channel = message.channel;
  const me = message.guild.members.me;
  const perms = channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms || !perms.has(PermissionFlagsBits.ManageMessages)) {
    warnPermOnce(message.guild.id, 'ManageMessages');
    return 0;
  }
  let deleted = 0;
  try {
    await message.delete();
    deleted += 1;
  } catch (err) {
    if (err.code !== 10008) logger.warn('تعذّر حذف الرسالة المخالفة', { code: err.code });
  }
  // باقي رسائل السبام بنفس القناة
  const others = extra.filter((m) => m.id !== message.id && m.channelId === channel.id).map((m) => m.id);
  if (others.length && typeof channel.bulkDelete === 'function') {
    try {
      const r = await channel.bulkDelete(others, true);
      deleted += r && r.size ? r.size : 0;
    } catch (err) {
      logger.warn('تعذّر حذف رسائل السبام السابقة', { code: err.code });
    }
  }
  return deleted;
}

async function sendNotice(channel, member, type, durationMs, count, timedOut) {
  try {
    const text = timedOut
      ? `${member} تم كتمه **${formatDurationAr(durationMs)}** بسبب **${TYPE_AR[type]}** (المخالفة رقم ${count}).`
      : `${member} رسالتك انحذفت بسبب **${TYPE_AR[type]}** (المخالفة رقم ${count}).`;
    const msg = await channel.send({ embeds: [eb.warning(text, '🛡️ الحماية التلقائية')], allowedMentions: { parse: [] } });
    const t = setTimeout(() => msg.delete().catch(() => {}), cfg.noticeTtlMs);
    if (typeof t.unref === 'function') t.unref();
  } catch (err) {
    logger.debug('تعذّر إرسال إشعار الحماية', { code: err.code });
  }
}

/**
 * يطبّق العقوبة التصاعدية لنوع مخالفة واحد.
 * @returns {Promise<{ counted: boolean, count?: number, durationMs?: number, timedOut?: boolean, deleted: number }>}
 */
async function punish(message, type, { extraMessages = [], detail = null } = {}) {
  const { guild, member } = message;
  const key = `${guild.id}:${member.id}:${type}`;
  const now = Date.now();

  // 1) الحذف أولاً (دائماً — بكل المستويات)
  const deleted = await deleteMessages(message, extraMessages);

  // عقوبة قريبة لنفس النوع: نحذف بس بدون ما نزيد العدّاد
  const last = recentPunish.get(key);
  if (last && now - last < cfg.punishCooldownMs) return { counted: false, deleted };
  recentPunish.set(key, now);

  // 2) العدّاد (مستقل لكل نوع)
  let count = 1;
  try {
    count = await store.autoMod.increment(guild.id, member.id, type);
  } catch (err) {
    logger.error('تعذّر تسجيل المخالفة — كتم بالمستوى الأول', { guildId: guild.id, userId: member.id, type, error: err });
  }
  const durationMs = durationFor(count);
  // AUTO-BAN: نقطة توسعة معلّقة — لو cfg.autoBanAfter رقم وcount >= cfg.autoBanAfter
  // تقدر تضيف هنا: await member.ban({ reason: ... }) مع نفس الفحوصات والسجل.

  // 3) الكتم
  let timedOut = false;
  const me = guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    warnPermOnce(guild.id, 'ModerateMembers');
  } else if (!member.moderatable) {
    logger.warn('الحماية التلقائية: ما يمكن كتم العضو (رتبته أعلى من البوت)', { guildId: guild.id, userId: member.id });
  } else {
    try {
      await member.timeout(durationMs, `حماية تلقائية: ${TYPE_AR[type]} — المخالفة ${count}`);
      timedOut = true;
    } catch (err) {
      logger.error('الحماية التلقائية: فشل الكتم', { guildId: guild.id, userId: member.id, code: err.code });
    }
  }

  // 4) إشعار قصير بالقناة (ينحذف بعد 5 ثوانٍ)
  await sendNotice(message.channel, member, type, durationMs, count, timedOut);

  // 5) DM للعضو (تجاهل الفشل)
  await tryDm(member.user, {
    embeds: [dmEmbed({
      title: '🛡️ مخالفة تلقائية',
      guild,
      lines: [
        `**السبب:** ${TYPE_AR[type]}`,
        timedOut ? `**مدة الكتم:** ${formatDurationAr(durationMs)}` : '**الإجراء:** حذف الرسالة',
        `**رقم المخالفة (${type === 'link' ? 'روابط' : 'سبام'}):** ${count}`,
        count < cfg.escalationMs.length ? `⚠️ المخالفة الجاية مدتها ${formatDurationAr(durationFor(count + 1))}.` : '⚠️ وصلت الحد الأقصى — كل مخالفة جاية كتم 24 ساعة.',
        'ehsmaha.com'
      ]
    })]
  });

  // 6) سجل الإشراف (نفس جدول الكتم اليدوي، بنوع تلقائي)
  await logModeration({
    guildId: guild.id,
    action: 'auto_timeout',
    targetId: member.id,
    moderatorId: (message.client && message.client.user && message.client.user.id) || me.id,
    channelId: message.channel.id,
    reason: `حماية تلقائية: ${TYPE_AR[type]}`,
    details: { auto: true, type, count, durationMs, timedOut, deleted, detail }
  });

  logger.info('حماية تلقائية', { guildId: guild.id, userId: member.id, type, count, durationMs, timedOut, deleted });
  return { counted: true, count, durationMs, timedOut, deleted };
}

// ======================= نقطة الدخول (messageCreate) =======================
/**
 * @returns {Promise<null|{ type: 'link'|'spam', result: object }>}
 */
async function handleMessage(message, { contentIntent = true } = {}) {
  if (!message || !message.guild || !message.member || !message.author) return null;
  if (message.author.bot || message.webhookId || message.system) return null;

  let rules;
  try {
    rules = await guildRules(message.guild.id);
  } catch (err) {
    logger.debug('الحماية التلقائية: إعدادات السيرفر غير متاحة', { code: err.code });
    return null;
  }
  const { settings, exemptions } = rules;
  if (!settings.link_protection && !settings.spam_protection) return null;

  // الأدمن (Administrator/المالك/أدمن البوت/رتبة إدارية) مستثنى من كل الفحوصات
  try {
    if ((await checkAdminPermission(message.member)).allowed) return null;
  } catch (_) {
    return null; // لو ما قدرنا نتحقق، ما نعاقب أحد بالغلط
  }

  // 1) الروابط
  if (settings.link_protection && contentIntent && message.content) {
    try {
      const channelIds = [message.channel.id, message.channel.parentId].filter(Boolean);
      const channelExempt = channelIds.some((id) => exemptions.channels.includes(id));
      const roleExempt = exemptions.roles.some((id) => message.member.roles.cache.has(id));
      if (!channelExempt && !roleExempt) {
        const link = findViolatingLink(message.content, exemptions.domains);
        if (link) return { type: 'link', result: await punish(message, 'link', { detail: link.host }) };
      }
    } catch (err) {
      logger.error('الحماية التلقائية: خطأ بفحص الروابط', { error: err });
    }
  }

  // 2) السبام
  if (settings.spam_protection) {
    try {
      const s = trackSpam(message);
      if (s.spam) return { type: 'spam', result: await punish(message, 'spam', { extraMessages: s.messages, detail: s.reason }) };
    } catch (err) {
      logger.error('الحماية التلقائية: خطأ بفحص السبام', { error: err });
    }
  }
  return null;
}

module.exports = {
  handleMessage,
  punish,
  startSweeper,
  stopSweeper,
  invalidate,
  TYPE_AR,
  _internal: { extractLinks, findViolatingLink, normalizeDomain, trackSpam, sweepTracker, tracker, durationFor, recentPunish, guildCache }
};
