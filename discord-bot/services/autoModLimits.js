'use strict';

// حدود الحماية التلقائية لكل سيرفر. الأولوية: القاعدة (automod_limits) ← البيئة (AUTOMOD_*) ← الافتراضي (config/autoMod.js).
// تتحمّل بذاكرة (Map) وتُحدَّث فوراً مع أي تعديل عبر /admin-control/automod/limits أو reload.
// بدون صف للسيرفر = السلوك القديم بالضبط.

const db = require('../database/botDb');
const logger = require('../utils/logger');
const cfg = require('../config/autoMod');

const RANGES = Object.freeze({ spamMaxMessages: [2, 30], spamWindowSeconds: [3, 60], spamDuplicates: [2, 10] });
const MAX_ESCALATION_STEPS = 6;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // حد ديسكورد للكتم

const cache = new Map(); // guildId -> row مطبّع
let loaded = false;

class LimitsError extends Error {
  constructor(message) {
    super(message);
    this.code = 'INVALID_INPUT';
  }
}

const rowToState = (r) => {
  let esc = null;
  try {
    const a = JSON.parse(r.escalation_json || 'null');
    if (Array.isArray(a) && a.length) esc = a.map(Number);
  } catch {
    esc = null;
  }
  return {
    guildId: r.guild_id,
    spamMaxMessages: r.spam_max_messages == null ? null : Number(r.spam_max_messages),
    spamWindowSeconds: r.spam_window_seconds == null ? null : Number(r.spam_window_seconds),
    spamDuplicates: r.spam_duplicates == null ? null : Number(r.spam_duplicates),
    escalationMinutes: esc,
    updatedBy: r.updated_by || null,
    updatedAt: r.updated_at == null ? null : Number(r.updated_at)
  };
};

async function reload() {
  const rows = await db.query('SELECT * FROM automod_limits');
  cache.clear();
  for (const r of rows) cache.set(r.guild_id, rowToState(r));
  loaded = true;
  return cache.size;
}

async function init() {
  try {
    logger.info('حدود الحماية: تم التحميل', { rows: await reload() });
  } catch (err) {
    logger.warn('حدود الحماية: تعذّر التحميل (الافتراضي/البيئة)', { error: err && err.message });
  }
}

/** القيم الفعّالة لسيرفر (للاستخدام بمسار الرسائل — متزامن، بدون قراءة قاعدة) */
function effective(guildId) {
  const s = (guildId && cache.get(guildId)) || null;
  return {
    maxMessages: (s && s.spamMaxMessages) || cfg.spam.maxMessages,
    windowMs: ((s && s.spamWindowSeconds) || cfg.spam.windowMs / 1000) * 1000,
    duplicateCount: (s && s.spamDuplicates) || cfg.spam.duplicateCount,
    escalationMs: s && s.escalationMinutes ? s.escalationMinutes.map((m) => m * 60 * 1000) : cfg.escalationMs,
    source: {
      spam: s && (s.spamMaxMessages || s.spamWindowSeconds || s.spamDuplicates) ? 'database' : 'env/default',
      escalation: s && s.escalationMinutes ? 'database' : 'default'
    }
  };
}

function validate(patch) {
  const out = {};
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (patch[key] === undefined) continue;
    const n = Number(patch[key]);
    if (!Number.isInteger(n) || n < min || n > max) throw new LimitsError(`${key} لازم يكون رقماً صحيحاً بين ${min} و${max}.`);
    out[key] = n;
  }
  if (patch.escalationMinutes !== undefined) {
    const a = patch.escalationMinutes;
    if (!Array.isArray(a) || a.length < 1 || a.length > MAX_ESCALATION_STEPS || a.some((m) => !Number.isInteger(Number(m)) || Number(m) < 1 || Number(m) > MAX_TIMEOUT_MINUTES)) {
      throw new LimitsError(`escalationMinutes لازم تكون مصفوفة من 1 إلى ${MAX_ESCALATION_STEPS} أرقام (دقائق من 1 إلى ${MAX_TIMEOUT_MINUTES}).`);
    }
    out.escalationMinutes = a.map(Number);
  }
  if (!Object.keys(out).length) throw new LimitsError('ما فيه حدود صالحة للتعديل.');
  return out;
}

/** يحفظ ويقرأ من القاعدة من جديد ويحدّث الكاش (مصدر الحقيقة = القاعدة) — يرجّع القيم الفعّالة */
async function set(guildId, patch, by) {
  const v = validate(patch);
  const cur = cache.get(guildId) || {};
  const m = {
    spamMaxMessages: v.spamMaxMessages ?? cur.spamMaxMessages ?? null,
    spamWindowSeconds: v.spamWindowSeconds ?? cur.spamWindowSeconds ?? null,
    spamDuplicates: v.spamDuplicates ?? cur.spamDuplicates ?? null,
    escalationMinutes: v.escalationMinutes ?? cur.escalationMinutes ?? null
  };
  await db.run(
    `INSERT INTO automod_limits (guild_id, spam_max_messages, spam_window_seconds, spam_duplicates, escalation_json, updated_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (guild_id) DO UPDATE SET spam_max_messages = excluded.spam_max_messages, spam_window_seconds = excluded.spam_window_seconds,
       spam_duplicates = excluded.spam_duplicates, escalation_json = excluded.escalation_json, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    [guildId, m.spamMaxMessages, m.spamWindowSeconds, m.spamDuplicates, m.escalationMinutes ? JSON.stringify(m.escalationMinutes) : null, by || null, Date.now()]
  );
  const rows = await db.query('SELECT * FROM automod_limits WHERE guild_id = ?', [guildId]);
  if (rows[0]) cache.set(guildId, rowToState(rows[0]));
  return effective(guildId);
}

module.exports = { RANGES, LimitsError, init, reload, effective, set, _internal: { cache, isLoaded: () => loaded } };
