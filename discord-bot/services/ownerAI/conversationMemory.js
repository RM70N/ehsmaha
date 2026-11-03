'use strict';

// ذاكرة مؤقتة لتعليمات المالك — "الروم اللي أنشأته" / "ثبتها" / "ارسل فيه".
//   • لكل سيرفر: آخر روم/رسالة/رتبة/قسم/عضو/ثريد + آخر العمليات + طلب توضيح معلّق
//   • تخزّن معرّفات ناتجة من البوت نفسه فقط (مو نصوص من أعضاء) — فما تمنح صلاحيات جديدة
//   • منفصلة تماماً عن ذاكرة تكتات الدعم (services/aiAssistant)
//   • تنتهي بعد 30 دقيقة بدون نشاط، وتتنظف تلقائياً

const TTL_MS = 30 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const MAX_GUILDS = 200;
const MAX_HISTORY = 10;

const entries = new Map(); // guildId -> entry

const blank = () => ({ updatedAt: Date.now(), lastChannelId: null, lastMessage: null, lastRoleId: null, lastCategoryId: null, lastMemberId: null, lastThreadId: null, history: [], pending: null });

function sweep(now = Date.now()) {
  for (const [id, e] of entries) if (now - e.updatedAt > TTL_MS) entries.delete(id);
  while (entries.size > MAX_GUILDS) entries.delete(entries.keys().next().value);
}

function get(guildId) {
  sweep();
  const e = entries.get(guildId);
  if (!e) return blank();
  if (e.pending && Date.now() - e.pending.at > PENDING_TTL_MS) e.pending = null;
  return e;
}

function touch(guildId) {
  sweep();
  let e = entries.get(guildId);
  if (!e) {
    e = blank();
    entries.set(guildId, e);
  }
  e.updatedAt = Date.now();
  return e;
}

/** يسجّل نتائج مهمة: نخزّن آخر الكيانات اللي أنشأناها/استخدمناها */
function record(guildId, results) {
  const e = touch(guildId);
  for (const r of results) {
    const o = r.outputs || {};
    if (r.status === 'ok') {
      if (o.channelId) e.lastChannelId = o.channelId;
      if (o.categoryId) e.lastCategoryId = o.categoryId;
      if (o.threadId) e.lastThreadId = o.threadId;
      if (o.roleId) e.lastRoleId = o.roleId;
      if (o.memberId) e.lastMemberId = o.memberId;
      if (o.messageId && o.channelId) e.lastMessage = { channelId: o.channelId, messageId: o.messageId };
    }
    e.history.push({ tool: r.tool, ok: r.status === 'ok', at: Date.now() });
  }
  if (e.history.length > MAX_HISTORY) e.history.splice(0, e.history.length - MAX_HISTORY);
}

/** قيمة مرجع $memory.<key> (نص صالح للمحلل) أو null */
function ref(guildId, key) {
  const e = get(guildId);
  switch (key) {
    case 'lastChannel': return e.lastChannelId;
    case 'lastMessage': return e.lastMessage ? `${e.lastMessage.channelId}/${e.lastMessage.messageId}` : null;
    case 'lastRole': return e.lastRoleId;
    case 'lastCategory': return e.lastCategoryId;
    case 'lastMember': return e.lastMemberId;
    case 'lastThread': return e.lastThreadId;
    default: return null;
  }
}

/** المفاتيح المتوفرة حالياً (للبرومبت — بدون أي أسماء أو نصوص) */
function availableKeys(guildId) {
  return ['lastChannel', 'lastMessage', 'lastRole', 'lastCategory', 'lastMember', 'lastThread'].filter((k) => ref(guildId, k));
}

function setPending(guildId, pending) {
  touch(guildId).pending = pending ? { ...pending, at: Date.now() } : null;
}

function takePending(guildId) {
  const e = get(guildId);
  const p = e.pending;
  if (p) e.pending = null;
  return p;
}

function forget(guildId) {
  entries.delete(guildId);
}

module.exports = { get, record, ref, availableKeys, setPending, takePending, forget, sweep, TTL_MS, _internal: { entries } };
