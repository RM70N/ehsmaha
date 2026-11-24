'use strict';

// مراقبة التكتات المفتوحة من زمان: تكت مفتوح أكثر من TICKET_STALE_HOURS (الافتراضي 24 ساعة) ← **رسالة وحدة فقط**
// بروم أخبار الأدمن: صاحب التكت + السبب + المشكلة (يفهمها المساعد من كلام صاحب التكت) + هل انحلت.
// ما تتكرر أبداً: التقرير يتحجز بقاعدة البيانات لكل تكت (جدول ticket_reports) فيصمد حتى مع إعادة تشغيل البوت،
// ولو التكت انقفل بعدها ما ينرسل له ملخص ثاني. التكتات اللي رومها انحذف تتعلّم "مُبلَّغ" بصمت.

const store = require('../database/botStore');
const logger = require('../utils/logger');
const { loadConfig } = require('../config');

const CHECK_EVERY_MS = 30 * 60 * 1000;
const FIRST_DELAY_MS = 5 * 60 * 1000;
const MAX_PER_CHECK = 5; // ما نغرق الروم لو فيه تكتات قديمة كثيرة — الباقي بالدورة اللي بعدها

let timer = null;
let first = null;
let running = false;

async function fetchChannel(guild, id) {
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

/** يفحص مرة وحدة ويرسل التقارير. @returns {Promise<number>} عدد التقارير المرسلة */
async function check(client, { now = Date.now() } = {}) {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const aiAssistant = require('./aiAssistant');
    const staleMs = loadConfig().ticketStaleHours * 3600 * 1000;
    for (const guild of client.guilds.cache.values()) {
      let open = [];
      try {
        open = await store.tickets.openList(guild.id, 100);
      } catch (err) {
        logger.warn('🎫 تعذّر قراءة التكتات المفتوحة', { guildId: guild.id, error: err });
        continue;
      }
      for (const t of open) {
        if (sent >= MAX_PER_CHECK) return sent;
        if (!t.channel_id || now - Number(t.created_at) < staleMs) continue;
        if (await store.ticketReports.has(t.id).catch(() => true)) continue;
        const channel = await fetchChannel(guild, t.channel_id);
        if (!channel) {
          // الروم انحذف — ما فيه شي نلخّصه: نعلّمه مُبلَّغ بدون رسالة
          await store.ticketReports.claim(t.id, guild.id, 'stale-gone').catch(() => null);
          continue;
        }
        const r = await aiAssistant.reportTicketClosed({ guild, channel, ticket: t, closedById: null, kind: 'stale' });
        if (r.sent) sent += 1;
        else if (r.reason === 'NO_NEWS_CHANNEL' || r.reason === 'NEWS_CHANNEL_MISSING') return sent; // ما فيه روم أخبار — ما نكمل
      }
    }
  } finally {
    running = false;
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

module.exports = { start, stop, check };
