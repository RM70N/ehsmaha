'use strict';

// تعطيل الأوامر وتقييدها داخل البوت (بدون إلغاء تسجيلها بديسكورد) — تُدار من /admin-control.
// الجدول command_controls يتحمّل بذاكرة (Map) عند الإقلاع، ويُحدَّث الكاش فوراً مع كل تعديل (بعد قراءة القاعدة من جديد).
// مالك البوت لا يخضع للتعطيل أبداً، والأوامر الأساسية (المساعدة والإدارة) ما تنعطّل — حتى ما ينقفل الإداريون خارج البوت.
// بدون صف بالجدول = لا قيود (السلوك القديم).

const db = require('../database/botDb');
const logger = require('../utils/logger');
const { isOwnerId } = require('./ownerAI/ownerGuard');

// أوامر ما يجوز تعطيلها ولا تقييدها: المساعدة + أوامر الإدارة الأساسية + أوامر المالك
const PROTECTED = Object.freeze(['مساعدة', 'ادمن_احصائيات', 'اضافة_ادمن', 'ازالة_ادمن', 'اضافة_رتبة_ادارية', 'ازالة_رتبة_ادارية', 'عرض_الرتب', 'اضافة', 'ازالة']);
const MAX_IDS = 50;
const SNOWFLAKE = /^\d{17,20}$/;

const cache = new Map(); // `${guildId}:${name}` -> state
let loaded = false;
const keyOf = (g, n) => `${g}:${n}`;

const parseList = (v) => {
  try {
    const a = JSON.parse(v || '[]');
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
};
const rowToState = (r) => ({
  guildId: r.guild_id,
  name: r.command_name,
  disabled: Number(r.disabled) !== 0,
  allowedRoleIds: parseList(r.allowed_roles),
  allowedChannelIds: parseList(r.allowed_channels),
  blockedChannelIds: parseList(r.blocked_channels),
  updatedBy: r.updated_by || null,
  updatedAt: r.updated_at == null ? null : Number(r.updated_at)
});
const empty = (guildId, name) => ({ guildId, name, disabled: false, allowedRoleIds: [], allowedChannelIds: [], blockedChannelIds: [], updatedBy: null, updatedAt: null });

/** تحميل كل الضوابط من القاعدة للكاش (يرجّع العدد) */
async function reload() {
  const rows = await db.query('SELECT * FROM command_controls');
  cache.clear();
  for (const r of rows) cache.set(keyOf(r.guild_id, r.command_name), rowToState(r));
  loaded = true;
  return cache.size;
}

const get = (guildId, name) => cache.get(keyOf(guildId, name)) || empty(guildId, name);
const list = (guildId) => [...cache.values()].filter((s) => s.guildId === guildId);
const isProtected = (name) => PROTECTED.includes(name);

async function readBack(guildId, name) {
  const rows = await db.query('SELECT * FROM command_controls WHERE guild_id = ? AND command_name = ?', [guildId, name]);
  return rows[0] ? rowToState(rows[0]) : null;
}

async function upsert(guildId, name, patch, by) {
  const cur = get(guildId, name);
  const next = { ...cur, ...patch };
  await db.run(
    `INSERT INTO command_controls (guild_id, command_name, disabled, allowed_roles, allowed_channels, blocked_channels, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id, command_name) DO UPDATE SET disabled = excluded.disabled, allowed_roles = excluded.allowed_roles,
       allowed_channels = excluded.allowed_channels, blocked_channels = excluded.blocked_channels, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [guildId, name, next.disabled ? 1 : 0, JSON.stringify(next.allowedRoleIds), JSON.stringify(next.allowedChannelIds), JSON.stringify(next.blockedChannelIds), by || null, Date.now()]
  );
  // مصدر الحقيقة = القاعدة: نقرأها من جديد ونحدّث الكاش منها (الكاش يُبطل فوراً)
  const stored = await readBack(guildId, name);
  if (stored) cache.set(keyOf(guildId, name), stored);
  return stored;
}

class ControlError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function setDisabled(guildId, name, disabled, by) {
  if (isProtected(name)) throw new ControlError('PROTECTED_COMMAND', 'هذا الأمر أساسي ما يجوز تعطيله.');
  return upsert(guildId, name, { disabled: !!disabled }, by);
}

function cleanIds(list, label) {
  if (list == null) return [];
  if (!Array.isArray(list)) throw new ControlError('INVALID_INPUT', `${label} لازم تكون مصفوفة معرّفات.`);
  const out = [...new Set(list.map((x) => String(x)))];
  if (out.length > MAX_IDS) throw new ControlError('INVALID_INPUT', `${label}: الحد الأقصى ${MAX_IDS} معرّف.`);
  if (out.some((x) => !SNOWFLAKE.test(x))) throw new ControlError('INVALID_INPUT', `${label} فيها معرّف غير صالح.`);
  return out;
}

async function setRestrictions(guildId, name, { allowedRoleIds, allowedChannelIds, blockedChannelIds }, by) {
  if (isProtected(name)) throw new ControlError('PROTECTED_COMMAND', 'هذا الأمر أساسي ما يجوز تقييده.');
  return upsert(guildId, name, {
    allowedRoleIds: cleanIds(allowedRoleIds, 'allowedRoleIds'),
    allowedChannelIds: cleanIds(allowedChannelIds, 'allowedChannelIds'),
    blockedChannelIds: cleanIds(blockedChannelIds, 'blockedChannelIds')
  }, by);
}

/**
 * يُستدعى من interactionCreate قبل تنفيذ الأمر.
 * @returns {{allowed:boolean, reason?:'DISABLED'|'ROLE'|'CHANNEL'|'BLOCKED_CHANNEL', message?:string}}
 */
function isAllowed(interaction) {
  if (!loaded || !interaction || !interaction.guildId) return { allowed: true };
  if (isOwnerId(interaction.user && interaction.user.id)) return { allowed: true }; // المالك ما يُقفل أبداً
  const name = interaction.commandName;
  if (isProtected(name)) return { allowed: true };
  const s = cache.get(keyOf(interaction.guildId, name));
  if (!s) return { allowed: true };
  if (s.disabled) return { allowed: false, reason: 'DISABLED', message: 'هذا الأمر معطّل من الإدارة.' };
  const channelId = interaction.channelId;
  if (s.blockedChannelIds.includes(channelId)) return { allowed: false, reason: 'BLOCKED_CHANNEL', message: 'غير مسموح استخدام هذا الأمر في هذه القناة.' };
  if (s.allowedChannelIds.length && !s.allowedChannelIds.includes(channelId)) return { allowed: false, reason: 'CHANNEL', message: 'غير مسموح استخدام هذا الأمر في هذه القناة.' };
  if (s.allowedRoleIds.length) {
    const roles = interaction.member && interaction.member.roles && interaction.member.roles.cache ? [...interaction.member.roles.cache.keys()] : [];
    if (!roles.some((id) => s.allowedRoleIds.includes(id))) return { allowed: false, reason: 'ROLE', message: 'غير مسموح لرتبتك باستخدام هذا الأمر.' };
  }
  return { allowed: true };
}

async function init() {
  try {
    const n = await reload();
    logger.info('ضوابط الأوامر: تم التحميل', { rows: n });
  } catch (err) {
    logger.warn('ضوابط الأوامر: تعذّر التحميل (لا قيود حالياً)', { error: err && err.message });
  }
}

module.exports = { PROTECTED, ControlError, reload, init, get, list, isProtected, isAllowed, setDisabled, setRestrictions, _internal: { cache, isLoaded: () => loaded } };
