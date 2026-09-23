'use strict';

// مصنع الـEmbeds الموحّد — كل رسائل البوت تمر من هنا عشان الهوية البصرية
// (الألوان، الفوتر، الشعار، الختم الزمني) تكون متطابقة بكل مكان.

const { EmbedBuilder } = require('discord.js');
const { loadConfig } = require('../config');

const FOOTER_TEXT = 'احسمها | ehsmaha.com';

// حدود Discord الرسمية — نقصّ قبلها بدل ما يرفض Discord الرسالة كاملة
const LIMITS = { title: 256, description: 4096, fieldName: 256, fieldValue: 1024, author: 256 };

function clip(text, max) {
  const s = String(text == null ? '' : text);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * Embed أساسي بهوية احسمها.
 * @param {object} opts
 * @param {'primary'|'deep'|'gold'|'pink'|'success'|'danger'} [opts.tone]
 */
function brand({ tone = 'primary', title, description, url, thumbnail, image, timestamp = true } = {}) {
  const config = loadConfig();
  const embed = new EmbedBuilder()
    .setColor(config.colors[tone] || config.colors.primary)
    .setFooter({ text: FOOTER_TEXT, iconURL: config.logoUrl });
  if (title) embed.setTitle(clip(title, LIMITS.title));
  if (description) embed.setDescription(clip(description, LIMITS.description));
  if (url) embed.setURL(url);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (timestamp) embed.setTimestamp(timestamp === true ? new Date() : timestamp);
  return embed;
}

// حقل آمن (يقص النص ويمنع القيم الفاضية اللي يرفضها Discord)
function field(name, value, inline = true) {
  const v = value === undefined || value === null || value === '' ? '—' : String(value);
  return { name: clip(name, LIMITS.fieldName), value: clip(v, LIMITS.fieldValue), inline };
}

function error(message, title = '⚠️ حصل خطأ') {
  return brand({ tone: 'danger', title, description: message });
}

function warning(message, title = '💡 تنبيه') {
  return brand({ tone: 'pink', title, description: message });
}

function success(message, title = '✅ تم بنجاح') {
  return brand({ tone: 'success', title, description: message });
}

function info(message, title) {
  return brand({ tone: 'deep', title, description: message });
}

// ▰▰▰▰▱▱▱▱ — شريط تقدّم نصي
function progressBar(current, total, length = 12) {
  const safeTotal = Math.max(0, Number(total) || 0);
  if (safeTotal === 0) return '▰'.repeat(length); // اللفل الأقصى = شريط ممتلئ
  const ratio = Math.max(0, Math.min(1, (Number(current) || 0) / safeTotal));
  const filled = Math.round(ratio * length);
  return '▰'.repeat(filled) + '▱'.repeat(length - filled);
}

function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-US');
}

// ختم زمني ديسكورد (يتعرض بتوقيت كل مستخدم تلقائياً)
function discordDate(input, style = 'D') {
  if (!input) return '—';
  const ms = typeof input === 'number' ? input : Date.parse(input);
  if (!Number.isFinite(ms)) return '—';
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

// يمنع أي اسم لاعب من كسر التنسيق (نجوم/شرطات/منشن جماعي)
function safeName(name) {
  return String(name || '—')
    .replace(/([\\*_~`|>])/g, '\\$1')
    .replace(/@(everyone|here)/gi, '@​$1')
    .slice(0, 64);
}

module.exports = { brand, field, error, warning, success, info, progressBar, formatNumber, discordDate, safeName, clip, FOOTER_TEXT };
