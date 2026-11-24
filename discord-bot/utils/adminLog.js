'use strict';

// سجل أفعال الإدارة بروم "أخبار الأدمن": كل تحذير/كتم/طرد/مسح/إغلاق تكت… يسويه إداري أو أدمن
// (إغلاق التكتات له ملخص مفصّل من المساعد بنفس الروم) ينرسل له إمبد فيه: الشخص، الإداري، والتفاصيل (وللتحذير: رقم التحذير والسبب).
// الروم = إعداد السيرفر (/قناة_اخبار_الادمن) أو الافتراضي من ADMIN_NEWS_CHANNEL_ID. ما يرمي أبداً.

const { loadConfig } = require('../config');
const store = require('../database/botStore');
const eb = require('./embedBuilder');
const logger = require('./logger');

const ORDINAL = { 1: 'الأول', 2: 'الثاني', 3: 'الثالث' };

// أفعال تُسجَّل (غير هذي — إعدادات داخلية — ما تزعج الروم)
const WATCHED = new Set([
  'warn', 'warn_delete', 'mute', 'unmute', 'kick', 'purge',
  'admin_role_add', 'admin_role_remove', 'admin_user_add', 'admin_user_remove', 'support_roles_set', 'ticket_panel'
]);

const who = (id) => (!id ? '—' : id === 'admin-center' ? '🖥️ لوحة الإدارة' : `<@${id}>`);

/** روم أخبار الأدمن للسيرفر: إعداد السيرفر أولاً ثم الافتراضي. */
async function newsChannel(guild) {
  if (!guild) return null;
  let id = null;
  try {
    id = (await store.guildSettings.get(guild.id)).admin_news_channel_id || null;
  } catch {
    /* نكمل بالافتراضي */
  }
  const candidates = [id, loadConfig().adminNewsChannelId].filter(Boolean);
  for (const c of candidates) {
    const ch = guild.channels.cache.get(c) || (await guild.channels.fetch(c).catch(() => null));
    if (ch && typeof ch.send === 'function') return ch;
  }
  return null;
}

function embedFor(entry) {
  const d = entry.details || {};
  const e = eb.brand({ tone: 'gold', title: '', description: '' });
  const fields = [];
  const add = (name, value, inline = true) => value != null && value !== '' && fields.push(eb.field(name, String(value).slice(0, 1000), inline));
  switch (entry.action) {
    case 'warn': {
      const n = Number(d.total) || null;
      e.setTitle(`⚠️ إنذار${n ? ` ${ORDINAL[n] || `رقم ${n}`}` : ''}`);
      e.setDescription(`${who(entry.targetId)} استلم إنذاراً.`);
      add('👤 الشخص', who(entry.targetId));
      add('🔢 رقم الإنذار', n ? `**${n}**` : '—');
      add('🛡️ الإداري', who(entry.moderatorId));
      add('🏷️ الرتبة', d.role);
      add('📝 السبب', entry.reason || '—', false);
      break;
    }
    case 'warn_delete':
      e.setTitle('🗑️ حذف إنذار');
      add('👤 الشخص', who(entry.targetId));
      add('🛡️ الإداري', who(entry.moderatorId));
      add('📝 التفاصيل', entry.reason || '—', false);
      break;
    case 'mute':
    case 'unmute':
      e.setTitle(entry.action === 'mute' ? '🔇 كتم عضو' : '🔊 فك كتم');
      add('👤 الشخص', who(entry.targetId));
      add('🛡️ الإداري', who(entry.moderatorId));
      add('⏱️ المدة', d.duration || d.until || '');
      add('📝 السبب', entry.reason || '—', false);
      break;
    case 'kick':
      e.setTitle('👢 طرد عضو');
      add('👤 الشخص', who(entry.targetId));
      add('🛡️ الإداري', who(entry.moderatorId));
      add('📝 السبب', entry.reason || '—', false);
      break;
    case 'purge':
      e.setTitle('🧹 مسح رسائل');
      add('🛡️ الإداري', who(entry.moderatorId));
      add('📍 الروم', entry.channelId ? `<#${entry.channelId}>` : '');
      add('🔢 العدد', d.deleted ?? d.count ?? '');
      add('📝 السبب', entry.reason || '', false);
      break;
    default:
      e.setTitle(`🛠️ ${entry.action}`);
      add('🛡️ الإداري', who(entry.moderatorId));
      add('👤 الهدف', entry.targetId ? who(entry.targetId) : '');
      add('📝 التفاصيل', entry.reason || '', false);
  }
  if (fields.length) e.addFields(...fields);
  return e;
}

/** يرسل سجل الفعل لروم أخبار الأدمن. ما يرمي. @returns {Promise<boolean>} */
async function notify(entry) {
  try {
    if (!entry || !WATCHED.has(entry.action) || !entry.guildId) return false;
    const ctx = require('../services/adminControl').runtime.getContext();
    const client = ctx && ctx.client;
    const guild = client && client.guilds && (client.guilds.cache.get(entry.guildId) || (await client.guilds.fetch(entry.guildId).catch(() => null)));
    const ch = await newsChannel(guild);
    if (!ch) return false;
    await ch.send({ embeds: [embedFor(entry)], allowedMentions: { parse: [] } });
    return true;
  } catch (err) {
    logger.warn('📋 تعذّر إرسال سجل الإدارة لروم الأخبار', { action: entry && entry.action, code: err && err.code });
    return false;
  }
}

module.exports = { notify, newsChannel, embedFor, WATCHED };
