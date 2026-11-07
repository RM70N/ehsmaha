'use strict';

// لوحة /بث — التصميم + العرض اللحظي.
//
// التصميم: بطاقة حمراء "مباشر" بملخص (كم يبث، كم يلعب، كم متصل، توزيع المنصات)، ثم بطاقة لكل ستريمر
// (رقم · 🆕 للجديد · أيقونة المنصة · يوزر قابل للضغط · اللعبة أو "متصل بالبث" · وقت نسبي)، مع قائمة تصفية
// بالمنصة (بعدد كل منصة)، وأزرار: السابق/التالي، 🔄 تحديث، 🎮 العب على احسمها (رابط).
//
// اللحظية: الرسالة نفسها تتعدّل تلقائياً أول ما يتغيّر البث (ستريمر ربط يوزره / شغّل لعبة / طلع) — من
// نفس مصدر قسم البثوث بلوحة المالك — طول ما نافذة التفاعل مفتوحة (14 دقيقة؛ حد Discord للتوكن 15).
// كل ضغطة زر تجدّد النافذة (توكن جديد)، وحتى الرسائل القديمة بعد إعادة تشغيل البوت ترجع لحظية بأول ضغطة.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const eb = require('../utils/embedBuilder');
const customId = require('../utils/customId');
const logger = require('../utils/logger');
const liveStreams = require('./liveStreams');
const { loadConfig } = require('../config');

const PAGE_SIZE = 8;
const FRESH_MS = 2 * 60 * 1000; // "🆕" لأول دقيقتين
const LIVE_WINDOW_MS = 14 * 60 * 1000;
const MIN_EDIT_GAP_MS = 1500;
const DEBOUNCE_MS = 300;
const MAX_VIEWS = 30;

const PLATFORM_META = {
  tiktok: { icon: '📱', label: 'تيك توك', url: (u) => `https://www.tiktok.com/@${encodeURIComponent(u)}/live` },
  twitch: { icon: '🟣', label: 'Twitch', url: (u) => `https://www.twitch.tv/${encodeURIComponent(u)}` },
  kick: { icon: '🟢', label: 'Kick', url: (u) => `https://kick.com/${encodeURIComponent(u)}` },
  youtube: { icon: '▶️', label: 'YouTube', url: (u) => `https://www.youtube.com/@${encodeURIComponent(u)}/live` }
};
const PLAT_ORDER = ['tiktok', 'twitch', 'kick', 'youtube'];
const RULE = '▬'.repeat(14);

// اسم داخل رابط Markdown: نهرب الأقواس المربعة حتى ما ينكسر الرابط
const linkText = (s) => eb.safeName(s).replace(/[[\]]/g, '');
const normFilter = (f) => (PLAT_ORDER.includes(f) ? f : 'all');

function streamBlock(s, rank, now = Date.now()) {
  const meta = PLATFORM_META[s.platform] || { icon: '🎮', label: s.platform, url: null };
  const user = linkText(s.platformUsername);
  const who = meta.url ? `[@${user}](${meta.url(s.platformUsername)})` : `@${user}`;
  const fresh = s.receivedAt && now - s.receivedAt < FRESH_MS ? '🆕 ' : '';
  const state = s.gameName ? `🎮 **${eb.safeName(s.gameName)}**` : '📡 متصل بالبث — يختار لعبة';
  return `**${rank}** ‧ ${fresh}${meta.icon} **${who}**\n╰ ${state} ‧ ${eb.discordDate(s.startedAt, 'R')}`;
}

function summary(streams) {
  const playing = streams.filter((s) => s.gameName).length;
  const linked = streams.length - playing;
  const state = [playing ? `🎮 **${playing}** يلعبون` : null, linked ? `📡 **${linked}** متصلون بالبث` : null].filter(Boolean).join(' ‧ ');
  const by = PLAT_ORDER.map((p) => [p, streams.filter((s) => s.platform === p).length])
    .filter(([, n]) => n > 0)
    .map(([p, n]) => `${PLATFORM_META[p].icon} ${n}`)
    .join(' ‧ ');
  return [`### 🎙️ ${streams.length} ستريمر على البث`, state ? `> ${state}` : null, by ? `> ${by}` : null].filter(Boolean).join('\n');
}

function actionRow({ page, totalPages, ownerId, filter, siteUrl }) {
  const row = new ActionRowBuilder();
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder().setCustomId(customId.build('bt', 'page', page - 1, ownerId, filter)).setStyle(ButtonStyle.Secondary).setEmoji('◀️').setDisabled(page === 0),
      new ButtonBuilder().setCustomId(customId.build('bt', 'noop', page)).setStyle(ButtonStyle.Secondary).setLabel(`${page + 1} / ${totalPages}`).setDisabled(true),
      new ButtonBuilder().setCustomId(customId.build('bt', 'page', page + 1, ownerId, filter)).setStyle(ButtonStyle.Secondary).setEmoji('▶️').setDisabled(page >= totalPages - 1)
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(customId.build('bt', 'ref', page, ownerId, filter)).setStyle(ButtonStyle.Primary).setEmoji('🔄').setLabel('تحديث'),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(siteUrl).setEmoji('🎮').setLabel('العب على احسمها')
  );
  return row;
}

function filterRow(all, filter, ownerId) {
  const options = [{ label: `كل المنصات (${all.length})`, value: 'all', emoji: '🌐', default: filter === 'all' }];
  for (const p of PLAT_ORDER) {
    const n = all.filter((s) => s.platform === p).length;
    if (n > 0 || filter === p) options.push({ label: `${PLATFORM_META[p].label} (${n})`, value: p, emoji: PLATFORM_META[p].icon, default: filter === p });
  }
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId.build('bt', 'flt', ownerId)).setPlaceholder('🎛️ تصفية حسب المنصة').addOptions(options)
  );
}

/**
 * @param {object[]} streams  liveStreams.list()
 * @param {number} page
 * @param {string} ownerId  صاحب القائمة (الأزرار له فقط)
 * @param {{ filter?: string, live?: boolean, now?: number }} [opts]
 * @returns {{ embeds: object[], components: object[], page: number }}
 */
function buildPage(streams, page, ownerId, { filter = 'all', live = false, now = Date.now() } = {}) {
  const config = loadConfig();
  const f = normFilter(filter);
  const shown = f === 'all' ? streams : streams.filter((s) => s.platform === f);
  const footer = { text: live ? `${eb.FOOTER_TEXT} • 🔴 يتحدّث لحظياً` : eb.FOOTER_TEXT, iconURL: config.logoUrl };

  if (!streams.length) {
    const embed = eb
      .brand({
        tone: 'muted',
        title: '🔴 البث المباشر الآن على احسمها',
        description:
          'لا يوجد بث نشط على احسمها حالياً 🎮\n\nأول ما يربط ستريمر يوزره بتلقاه هنا **لحظياً** — بدون ما تحتاج تعيد الأمر.',
        thumbnail: config.logoUrl
      })
      .setFooter(footer);
    return { embeds: [embed], components: [actionRow({ page: 0, totalPages: 1, ownerId, filter: f, siteUrl: config.siteUrl })], page: 0 };
  }

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, Number.isFinite(page) ? page : 0), totalPages - 1);
  const slice = shown.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const label = f === 'all' ? '' : ` — ${PLATFORM_META[f].label}`;
  const body = slice.length
    ? slice.map((s, i) => streamBlock(s, current * PAGE_SIZE + i + 1, now)).join('\n\n')
    : `ما فيه أحد يبث على **${PLATFORM_META[f].label}** الحين.\nغيّر التصفية من القائمة تحت 👇`;
  const embed = eb
    .brand({
      tone: 'danger',
      title: `🔴 البث المباشر الآن${label}`,
      url: config.siteUrl,
      description: `${summary(streams)}\n${RULE}\n\n${body}`,
      thumbnail: config.logoUrl
    })
    .setFooter(footer);
  if (totalPages > 1) embed.setAuthor({ name: `صفحة ${current + 1} من ${totalPages}` });

  return {
    embeds: [embed],
    components: [filterRow(streams, f, ownerId), actionRow({ page: current, totalPages, ownerId, filter: f, siteUrl: config.siteUrl })],
    page: current
  };
}

// ---------------- العرض اللحظي ----------------
const views = new Map(); // messageId -> { interaction, messageId, userId, ownerId, page, filter, expiresAt, lastEdit, sig, expireTimer }
let unsubscribe = null;
let debounce = null;
let retry = null;

const signature = (streams, v) => JSON.stringify([v.page, v.filter, streams.map((s) => [s.sessionId, s.gameName, s.platformUsername])]);

const DEAD_CODES = new Set([10008, 10062, 50027, 'InteractionNotReplied', 'InteractionAlreadyReplied']);
const isDead = (err) => err && (DEAD_CODES.has(err.code) || /Invalid Webhook Token|Unknown (Message|Interaction)/i.test(String(err.message || '')));

function drop(id) {
  const v = views.get(id);
  if (!v) return;
  if (v.expireTimer) clearTimeout(v.expireTimer);
  views.delete(id);
  if (!views.size) stopListening();
}

async function render(v, streams, { live }) {
  const payload = buildPage(streams, v.page, v.ownerId, { filter: v.filter, live });
  v.page = payload.page;
  const { page, ...rest } = payload;
  await v.interaction.editReply(rest);
  v.lastEdit = Date.now();
  v.sig = signature(streams, v);
}

async function finalize(id) {
  const v = views.get(id);
  if (!v) return;
  drop(id);
  try {
    await render(v, liveStreams.list(), { live: false });
  } catch (err) {
    if (!isDead(err)) logger.debug('تعذّر إنهاء عرض /بث اللحظي', { code: err && err.code });
  }
}

async function refreshAll() {
  const streams = liveStreams.list();
  const now = Date.now();
  let waitMs = 0;
  for (const [id, v] of [...views]) {
    if (now >= v.expiresAt) {
      await finalize(id);
      continue;
    }
    if (v.sig === signature(streams, v)) continue; // ما تغيّر شي يخصه
    const gap = now - v.lastEdit;
    if (gap < MIN_EDIT_GAP_MS) {
      waitMs = Math.max(waitMs, MIN_EDIT_GAP_MS - gap);
      continue;
    }
    try {
      await render(v, streams, { live: true });
    } catch (err) {
      if (isDead(err)) drop(id);
      else logger.warn('تعذّر تحديث /بث اللحظي', { code: err && err.code });
    }
  }
  if (waitMs && views.size && !retry) {
    retry = setTimeout(() => {
      retry = null;
      refreshAll();
    }, waitMs + 50);
    if (typeof retry.unref === 'function') retry.unref();
  }
}

function schedule() {
  if (debounce) return;
  debounce = setTimeout(() => {
    debounce = null;
    refreshAll();
  }, DEBOUNCE_MS);
  if (typeof debounce.unref === 'function') debounce.unref();
}

function startListening() {
  if (!unsubscribe) unsubscribe = liveStreams.onChange(schedule);
}
function stopListening() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  if (debounce) clearTimeout(debounce);
  if (retry) clearTimeout(retry);
  debounce = null;
  retry = null;
}

/**
 * يبدأ تحديث رسالة /بث تلقائياً. `interaction` لازم تكون ردّت (reply/update) — editReply يعدّل نفس الرسالة.
 * رسالة واحدة لكل مستخدم: القديمة تتوقف (ما نضاعف التعديلات).
 */
function track(interaction, messageId, { ownerId, page = 0, filter = 'all' }) {
  if (!messageId) return false;
  const userId = interaction.user && interaction.user.id;
  for (const [id, v] of views) if (id !== messageId && userId && v.userId === userId) drop(id);
  while (views.size >= MAX_VIEWS) drop(views.keys().next().value);
  const prev = views.get(messageId);
  if (prev && prev.expireTimer) clearTimeout(prev.expireTimer);
  const v = { interaction, messageId, userId, ownerId, page, filter: normFilter(filter), expiresAt: Date.now() + LIVE_WINDOW_MS, lastEdit: 0, sig: null, expireTimer: null };
  v.sig = signature(liveStreams.list(), v);
  v.expireTimer = setTimeout(() => finalize(messageId), LIVE_WINDOW_MS + 1000);
  if (typeof v.expireTimer.unref === 'function') v.expireTimer.unref();
  views.set(messageId, v);
  startListening();
  return true;
}

function stopAll() {
  for (const id of [...views.keys()]) drop(id);
  stopListening();
}

module.exports = {
  PAGE_SIZE,
  PLATFORM_META,
  PLAT_ORDER,
  buildPage,
  streamBlock,
  summary,
  normFilter,
  track,
  stopAll,
  refreshNow: refreshAll,
  _internal: { views, LIVE_WINDOW_MS, MIN_EDIT_GAP_MS, MAX_VIEWS, signature }
};
