'use strict';

// أدوات مشتركة لأوامر الإشراف (كتم، تحذير، طرد، مسح): فحص تسلسل الرتب،
// تحويل المدد، إرسال DM آمن، وتسجيل العمليات بسجل الإشراف.

const store = require('../database/botStore');
const logger = require('./logger');
const eb = require('./embedBuilder');

// أقصى مدة كتم (Timeout) يسمح بها ديسكورد: 28 يوم بالضبط
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000; // 2,419,200,000

const DURATION_UNITS = Object.freeze({
  seconds: { ms: 1000, label: 'ثانية', choice: 'ثواني' },
  minutes: { ms: 60 * 1000, label: 'دقيقة', choice: 'دقائق' },
  hours: { ms: 60 * 60 * 1000, label: 'ساعة', choice: 'ساعات' }
});

// تحويل دقيق للمدة؛ يرجّع { ms } أو { error, maxForUnit }
function toDurationMs(amount, unit) {
  const u = DURATION_UNITS[unit];
  if (!u) return { error: 'UNIT' };
  if (!Number.isInteger(amount) || amount <= 0) return { error: 'NOT_POSITIVE' };
  const ms = amount * u.ms;
  if (!Number.isSafeInteger(ms) || ms > MAX_TIMEOUT_MS) return { error: 'TOO_LONG', maxForUnit: Math.floor(MAX_TIMEOUT_MS / u.ms) };
  return { ms };
}

// "3 ساعات و 20 دقيقة" — للعرض فقط
function formatDurationAr(ms) {
  const parts = [];
  let rest = Math.floor(ms / 1000);
  const d = Math.floor(rest / 86400); rest %= 86400;
  const h = Math.floor(rest / 3600); rest %= 3600;
  const m = Math.floor(rest / 60); const s = rest % 60;
  if (d) parts.push(`${d} يوم`);
  if (h) parts.push(`${h} ساعة`);
  if (m) parts.push(`${m} دقيقة`);
  if (s) parts.push(`${s} ثانية`);
  return parts.join(' و ') || '0 ثانية';
}

/**
 * فحص قابلية معاقبة عضو: البوت أعلى من رتبة العضو، والمنفّذ أعلى منه (إلا
 * مالك السيرفر)، ومو هو نفسه، ومو مالك السيرفر، ومو البوت.
 * @returns {string|null} سبب الرفض بالعربي، أو null لو مسموح
 */
function hierarchyProblem(guild, executor, target, { requireBotAbove = true } = {}) {
  if (!target) return 'العضو غير موجود بالسيرفر (يمكن طلع منه).';
  const me = guild.members.me;
  if (target.id === executor.id) return 'ما تقدر تطبّق هذا الإجراء على نفسك 🙂';
  if (me && target.id === me.id) return 'ما أقدر أطبّق هذا الإجراء على نفسي 🤖';
  if (target.user && target.user.bot) return 'ما يمكن تطبيق هذا الإجراء على بوت.';
  if (target.id === guild.ownerId) return 'ما يمكن تطبيق هذا الإجراء على مالك السيرفر.';
  const botTop = me ? me.roles.highest.position : -1;
  const targetTop = target.roles.highest.position;
  if (requireBotAbove && botTop <= targetTop) {
    return `رتبة البوت (**${me ? me.roles.highest.name : '—'}**) ليست أعلى من أعلى رتبة للعضو (**${target.roles.highest.name}**).\n` +
      'انقل رتبة البوت فوق رتبة العضو من إعدادات السيرفر ← الرتب.';
  }
  if (executor.id !== guild.ownerId && executor.roles.highest.position <= targetTop) {
    return 'ما تقدر تطبّق هذا الإجراء على عضو رتبته أعلى من رتبتك أو تساويها.';
  }
  return null;
}

// إرسال رسالة خاصة بدون ما يفشل الأمر لو الخاص مقفل — يرجّع true/false
async function tryDm(user, payload) {
  try {
    await user.send(payload);
    return true;
  } catch (err) {
    logger.debug('تعذّر إرسال DM', { userId: user && user.id, code: err && err.code });
    return false;
  }
}

// Embed الإشعار الخاص للعضو (كتم/طرد/تحذير)
function dmEmbed({ title, guild, lines }) {
  return eb
    .brand({ tone: 'pink', title, description: lines.filter(Boolean).join('\n') })
    .setAuthor({ name: guild.name, iconURL: guild.iconURL ? guild.iconURL() || undefined : undefined });
}

// تسجيل بسجل الإشراف (قاعدة البيانات + السجل) — فشل التسجيل ما يفشّل العملية نفسها
async function logModeration(entry) {
  logger.info('moderation', { action: entry.action, guildId: entry.guildId, targetId: entry.targetId, moderatorId: entry.moderatorId, channelId: entry.channelId });
  try {
    await store.moderationLog.add(entry);
    return true;
  } catch (err) {
    logger.error('تعذّر حفظ سجل الإشراف', { action: entry.action, error: err });
    return false;
  }
}

module.exports = { MAX_TIMEOUT_MS, DURATION_UNITS, toDurationMs, formatDurationAr, hierarchyProblem, tryDm, dmEmbed, logModeration };
