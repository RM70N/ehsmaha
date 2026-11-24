'use strict';

// مراقبة التكتات المفتوحة من زمان: تكت مفتوح أكثر من TICKET_STALE_HOURS (الافتراضي 24 ساعة) ← تنبيه مفصّل
// بروم أخبار الأدمن (صاحبه، السبب، عمره، آخر نشاط، حالة المساعد) — مرة كل 24 ساعة لكل تكت.

const store = require('../database/botStore');
const eb = require('../utils/embedBuilder');
const adminLog = require('../utils/adminLog');
const logger = require('../utils/logger');
const reasons = require('../config/ticketReasons');
const { loadConfig } = require('../config');

const CHECK_EVERY_MS = 30 * 60 * 1000;
const REALERT_MS = 24 * 60 * 60 * 1000;
const FIRST_DELAY_MS = 5 * 60 * 1000;

const alerted = new Map(); // ticketId -> at
let timer = null;
let first = null;

const DISCORD_EPOCH = 1420070400000n;
const snowflakeMs = (id) => {
  try {
    return Number((BigInt(id) >> 22n) + DISCORD_EPOCH);
  } catch {
    return null;
  }
};

function age(ms) {
  const h = Math.floor(ms / 3600000);
  if (h < 48) return `${h} ساعة`;
  return `${Math.floor(h / 24)} يوم`;
}

/** يفحص مرة وحدة ويرسل التنبيهات. @returns {Promise<number>} عدد التنبيهات المرسلة */
async function check(client, { now = Date.now() } = {}) {
  let sent = 0;
  const staleMs = loadConfig().ticketStaleHours * 3600 * 1000;
  for (const guild of client.guilds.cache.values()) {
    let open = [];
    try {
      open = await store.tickets.openList(guild.id, 100);
    } catch (err) {
      logger.warn('🎫 تعذّر قراءة التكتات المفتوحة', { guildId: guild.id, error: err });
      continue;
    }
    const stale = open.filter((t) => t.channel_id && now - Number(t.created_at) >= staleMs && now - (alerted.get(t.id) || 0) >= REALERT_MS);
    if (!stale.length) continue;
    const ch = await adminLog.newsChannel(guild);
    if (!ch) continue;
    for (const t of stale.slice(0, 10)) {
      const reason = reasons.find((r) => r.value === t.reason);
      const lastMs = t.last_message_id || (guild.channels.cache.get(t.channel_id) || {}).lastMessageId;
      const last = lastMs ? snowflakeMs(lastMs) : null;
      const e = eb.brand({ tone: 'gold', title: `⏰ تكت #${t.id} مفتوح من ${age(now - Number(t.created_at))}`, description: `<#${t.channel_id}> — يحتاج متابعة من الإدارة.` }).addFields(
        eb.field('👤 صاحب التكت', `<@${t.discord_id}>`, true),
        eb.field('📌 السبب', reason ? `${reason.emoji ? `${reason.emoji} ` : ''}${reason.label}` : String(t.reason || '—'), true),
        eb.field('🕓 آخر نشاط', last ? `قبل ${age(now - last)}` : 'غير معروف', true),
        eb.field('🤖 المساعد', t.ai_paused ? 'متوقف — طلب التحدث مع الدعم' : 'يرد على صاحب التكت', true)
      );
      try {
        await ch.send({ embeds: [e], allowedMentions: { parse: [] } });
        alerted.set(t.id, now);
        sent += 1;
      } catch (err) {
        logger.warn('🎫 تعذّر إرسال تنبيه تكت قديم', { ticketId: t.id, code: err && err.code });
      }
    }
  }
  return sent;
}

function start(client) {
  stop();
  first = setTimeout(() => check(client).catch(() => null), FIRST_DELAY_MS);
  timer = setInterval(() => check(client).catch((err) => logger.warn('🎫 فشل فحص التكتات القديمة', { error: err })), CHECK_EVERY_MS);
  if (first.unref) first.unref();
  if (timer.unref) timer.unref();
}

function stop() {
  if (first) clearTimeout(first);
  if (timer) clearInterval(timer);
  first = timer = null;
}

module.exports = { start, stop, check, _internal: { alerted } };
