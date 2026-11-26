'use strict';

// سجل الرسائل المحذوفة: أي رسالة تنحذف بأي روم بالسيرفر ← البوت يرسل للمالك بالخاص: نص الرسالة، صاحبها، ومن حذفها.
//   • "من حذفها": سجل التدقيق (Audit Log، صلاحية "عرض سجل التدقيق") — وبدونه/لو ما فيه قيد: صاحب الرسالة نفسه غالباً.
//   • حذف البوت نفسه (/مسح، الحماية التلقائية): ينعلّم مسبقاً بـmarkBotAction/reportPurge فنعرف الإداري/السبب.
//   • رسائل قديمة ما كانت بذاكرة البوت (قبل تشغيله): نبلّغ بالحذف مع تنبيه إن النص والكاتب غير محفوظين.
//   • تجميع: الحذف الكثير بوقت قصير يصير تقرير واحد (مع ملف نصي) بدل إغراق الخاص.
// يشتغل تلقائياً — يتعطّل بـMESSAGE_DELETE_LOG=off. ما يرمي أبداً.

const { AuditLogEvent, AttachmentBuilder } = require('discord.js');
const eb = require('../utils/embedBuilder');
const logger = require('../utils/logger');
const { loadConfig } = require('../config');

const FLUSH_MS = 2500;
const MAX_QUEUE = 400;
const FILE_THRESHOLD = 12; // أكثر من هذا بالدفعة ← ملف نصي + ملخص
const AUDIT_DELAY_MS = 1200;
const BOT_MARK_TTL_MS = 30_000;
const KNOWN_TTL_MS = 60_000;

const queue = [];
let flushTimer = null;
let clientRef = null;
const botMarks = new Map(); // channelId -> { label, at }
const known = new Map(); // messageId -> at (حذف بلّغنا عنه بشكل مباشر — ما نكرره من الحدث)
const auditSeen = new Map(); // entryId -> count اللي شفناه

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enabled = () => !/^(false|0|no|off)$/i.test(String(process.env.MESSAGE_DELETE_LOG || 'on').trim());
const recipients = () => loadConfig().deleteLogRecipients || [];

/** البوت بنفسه راح يحذف برومٍ (مسح/حماية): نعلّم السبب عشان "من حذفها" يطلع واضح */
function markBotAction(channelId, label) {
  botMarks.set(channelId, { label, at: Date.now() });
}

function botLabel(channelId) {
  const m = botMarks.get(channelId);
  if (!m) return null;
  if (Date.now() - m.at > BOT_MARK_TTL_MS) {
    botMarks.delete(channelId);
    return null;
  }
  return m.label;
}

function sweepKnown() {
  const t = Date.now();
  for (const [id, at] of known) if (t - at > KNOWN_TTL_MS) known.delete(id);
}

const clip = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));

function describeMessage(m) {
  const content = m.content ? m.content : '';
  const atts = m.attachments ? [...m.attachments.values()].slice(0, 6).map((a) => `${a.name || 'ملف'}${a.url ? ` — ${a.url}` : ''}`) : [];
  const extra = [];
  if (m.embeds && m.embeds.length) extra.push(`${m.embeds.length} إمبد`);
  if (m.stickers && m.stickers.size) extra.push(`${m.stickers.size} ستيكر`);
  return { content, atts, extra };
}

async function resolveExecutor(guild, channelId, authorId) {
  const mark = botLabel(channelId);
  if (mark) return { label: mark, by: null };
  try {
    await sleep(AUDIT_DELAY_MS);
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 8 });
    const now = Date.now();
    for (const e of logs.entries.values()) {
      const count = (e.extra && e.extra.count) || 1;
      const seen = auditSeen.get(e.id);
      const chOk = e.extra && e.extra.channel && e.extra.channel.id === channelId;
      const targetOk = !authorId || (e.target && e.target.id === authorId);
      const fresh = seen === undefined ? now - e.createdTimestamp < 15_000 : count > seen;
      if (chOk && targetOk && fresh) {
        auditSeen.set(e.id, count);
        if (auditSeen.size > 200) auditSeen.delete(auditSeen.keys().next().value);
        return { label: null, by: e.executor ? e.executor.id : null, byTag: e.executor ? e.executor.tag || e.executor.username : null };
      }
    }
    return { label: 'غالباً صاحب الرسالة نفسه (ما فيه قيد بسجل التدقيق)', by: null };
  } catch (err) {
    const noPerm = err && (err.code === 50013 || /Missing Permissions/i.test(err.message || ''));
    return { label: noPerm ? 'غير معروف (البوت ما عنده صلاحية «عرض سجل التدقيق»)' : 'غير معروف', by: null };
  }
}

function embedFor(item) {
  const e = eb.brand({ tone: 'pink', title: item.partial ? '🗑️ رسالة محذوفة (قديمة)' : '🗑️ رسالة محذوفة', description: '' });
  const f = [];
  const add = (n, v, inline = true) => v && f.push(eb.field(n, clip(v, 1000), inline));
  add('👤 صاحب الرسالة', item.authorId ? `<@${item.authorId}>${item.authorTag ? ` (${item.authorTag})` : ''}` : 'غير معروف (الرسالة قديمة وما كانت محفوظة)');
  add('🛡️ حذفها', item.by ? `<@${item.by}>${item.byTag ? ` (${item.byTag})` : ''}` : item.label || 'غير معروف');
  add('📍 الروم', item.channelId ? `<#${item.channelId}>${item.guildName ? ` — ${item.guildName}` : ''}` : '');
  if (item.createdAt) add('🕒 كُتبت', `<t:${Math.floor(item.createdAt / 1000)}:R>`);
  if (item.partial) add('📝 المحتوى', 'غير محفوظ — الرسالة أقدم من تشغيل البوت.', false);
  else add('📝 المحتوى', item.content ? item.content : item.atts.length || item.extra.length ? '(بدون نص)' : '(فاضية)', false);
  if (item.atts.length) add('📎 مرفقات', item.atts.join('\n'), false);
  if (item.extra.length) add('➕ فيها', item.extra.join('، '));
  if (item.replyTo) add('↩️ ردّ على رسالة', item.replyTo);
  e.addFields(...f);
  return e;
}

function lineFor(item) {
  const who = item.authorTag || item.authorId || '؟';
  const by = item.by ? item.byTag || item.by : item.label || '؟';
  return `[#${item.channelName || item.channelId}] ${who} ← حذفها: ${by}\n${item.partial ? '(غير محفوظة)' : item.content || '(بدون نص)'}${item.atts.length ? `\n📎 ${item.atts.join(' | ')}` : ''}\n`;
}

async function sendToRecipients(payloadFactory) {
  const client = clientRef;
  if (!client) return;
  for (const id of recipients()) {
    try {
      const user = await client.users.fetch(id);
      await user.send(payloadFactory());
    } catch (err) {
      logger.warn('🗑️ تعذّر إرسال سجل الحذف بالخاص', { recipient: id, code: err && err.code });
    }
  }
}

async function flush() {
  flushTimer = null;
  const batch = queue.splice(0, queue.length);
  if (!batch.length) return;
  try {
    if (batch.length > FILE_THRESHOLD) {
      const text = batch.map(lineFor).join('\n');
      await sendToRecipients(() => ({
        embeds: [eb.brand({ tone: 'pink', title: `🗑️ ${batch.length} رسالة انحذفت`, description: `التفاصيل بالملف المرفق 📎\n📍 ${[...new Set(batch.map((b) => (b.channelId ? `<#${b.channelId}>` : '')))].filter(Boolean).slice(0, 8).join(' ')}` })],
        files: [new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: 'deleted-messages.txt' })],
        allowedMentions: { parse: [] }
      }));
      return;
    }
    for (let i = 0; i < batch.length; i += 10) {
      const part = batch.slice(i, i + 10);
      await sendToRecipients(() => ({ embeds: part.map(embedFor), allowedMentions: { parse: [] } }));
    }
  } catch (err) {
    logger.warn('🗑️ فشل إرسال دفعة سجل الحذف', { error: err });
  }
}

function enqueue(item) {
  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push(item);
  if (!flushTimer) {
    flushTimer = setTimeout(() => flush().catch(() => null), FLUSH_MS);
    if (flushTimer.unref) flushTimer.unref();
  }
}

/** حدث messageDelete */
async function onDelete(client, message) {
  try {
    if (!enabled() || !message || !message.guild) return;
    clientRef = client;
    const id = message.id;
    if (known.has(id)) {
      known.delete(id);
      return;
    }
    sweepKnown();
    const me = client.user && client.user.id;
    if (message.author && message.author.id === me) return; // رسائل البوت نفسه ما نبلّغ عنها
    if (message.system) return;
    const partial = !!message.partial || !message.author;
    const { content, atts, extra } = partial ? { content: '', atts: [], extra: [] } : describeMessage(message);
    const authorId = message.author ? message.author.id : null;
    const ex = await resolveExecutor(message.guild, message.channelId || (message.channel && message.channel.id), authorId);
    enqueue({
      partial,
      content,
      atts,
      extra,
      authorId,
      authorTag: message.author ? message.author.tag || message.author.username : null,
      channelId: message.channelId || (message.channel && message.channel.id),
      channelName: message.channel && message.channel.name,
      guildName: message.guild.name,
      createdAt: message.createdTimestamp || null,
      replyTo: message.reference && message.reference.messageId ? `\`${message.reference.messageId}\`` : null,
      ...ex
    });
  } catch (err) {
    logger.warn('🗑️ خطأ بسجل الحذف', { error: err });
  }
}

/** حدث messageDeleteBulk (حذف جماعي مو من البوت نفسه) */
async function onBulk(client, messages, channel) {
  try {
    if (!enabled() || !channel || !channel.guild) return;
    clientRef = client;
    const ex = await resolveExecutor(channel.guild, channel.id, null);
    for (const m of messages.values()) {
      if (known.has(m.id)) {
        known.delete(m.id);
        continue;
      }
      if (m.author && client.user && m.author.id === client.user.id) continue;
      const partial = !!m.partial || !m.author;
      const d = partial ? { content: '', atts: [], extra: [] } : describeMessage(m);
      enqueue({ partial, ...d, authorId: m.author ? m.author.id : null, authorTag: m.author ? m.author.tag || m.author.username : null, channelId: channel.id, channelName: channel.name, guildName: channel.guild.name, createdAt: m.createdTimestamp || null, ...ex });
    }
  } catch (err) {
    logger.warn('🗑️ خطأ بسجل الحذف الجماعي', { error: err });
  }
}

/**
 * حذف جماعي يسويه البوت نفسه بأمر إداري (/مسح): نبلّغ مباشرة بنصوص الرسائل (اللي جابها الأمر) ونمنع تكرارها من الحدث.
 * @param {{ channel: object, messages: object[], moderatorId: string, label?: string }} p
 */
function reportPurge(client, { channel, messages, moderatorId, label = 'مسح رسائل (/مسح)' }) {
  try {
    if (!enabled() || !channel || !channel.guild) return;
    clientRef = client;
    const now = Date.now();
    for (const m of messages) {
      known.set(m.id, now);
      if (m.author && client.user && m.author.id === client.user.id) continue;
      const d = describeMessage(m);
      enqueue({
        partial: false,
        ...d,
        authorId: m.author ? m.author.id : null,
        authorTag: m.author ? m.author.tag || m.author.username : null,
        channelId: channel.id,
        channelName: channel.name,
        guildName: channel.guild.name,
        createdAt: m.createdTimestamp || null,
        label,
        by: moderatorId,
        byTag: null
      });
    }
  } catch (err) {
    logger.warn('🗑️ خطأ بتسجيل مسح الرسائل', { error: err });
  }
}

function _reset() {
  queue.length = 0;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  botMarks.clear();
  known.clear();
  auditSeen.clear();
  clientRef = null;
}

module.exports = { onDelete, onBulk, reportPurge, markBotAction, flush, _reset, _internal: { queue, known, FILE_THRESHOLD } };
