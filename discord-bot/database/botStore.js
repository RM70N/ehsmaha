'use strict';

// كل استعلامات قاعدة بيانات البوت بمكان واحد (بدل SQL متناثر بملفات الأوامر).
// المعرّفات الرقمية تتحول لـNumber (PostgreSQL يرجّع BIGINT كنص).

const db = require('./botDb');

const toNum = (v) => (v == null ? v : Number(v));
const now = () => Date.now();

// ---------------- صلاحيات الأدمن الديناميكية ----------------
const adminConfig = {
  async list(guildId) {
    const rows = await db.query('SELECT type, discord_id, added_by, added_at FROM bot_admin_config WHERE guild_id = ? ORDER BY added_at', [guildId]);
    return rows.map((r) => ({ ...r, added_at: toNum(r.added_at) }));
  },
  // يرجّع true لو انضاف، false لو كان موجود مسبقاً
  async add(guildId, type, discordId, addedBy) {
    try {
      await db.run('INSERT INTO bot_admin_config (guild_id, type, discord_id, added_by, added_at) VALUES (?, ?, ?, ?, ?)', [
        guildId, type, discordId, addedBy, now()
      ]);
      return true;
    } catch (err) {
      if (err.isUniqueViolation) return false;
      throw err;
    }
  },
  async remove(guildId, type, discordId) {
    const r = await db.run('DELETE FROM bot_admin_config WHERE guild_id = ? AND type = ? AND discord_id = ?', [guildId, type, discordId]);
    return r.changes > 0;
  }
};

// ---------------- إعدادات السيرفر (key → JSON) ----------------
const guildConfig = {
  async get(guildId, key, fallback = null) {
    const rows = await db.query('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?', [guildId, key]);
    if (!rows.length) return fallback;
    try {
      return JSON.parse(rows[0].value);
    } catch (_) {
      return fallback;
    }
  },
  async set(guildId, key, value, updatedBy) {
    const json = JSON.stringify(value);
    // UPSERT بصيغة يدعمها SQLite و PostgreSQL معاً
    await db.run(
      `INSERT INTO guild_config (guild_id, key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (guild_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      [guildId, key, json, updatedBy || null, now()]
    );
  }
};

// ---------------- لوحات وتكتات الدعم ----------------
function mapTicket(r) {
  if (!r) return null;
  return {
    ...r,
    id: toNum(r.id),
    panel_id: toNum(r.panel_id),
    created_at: toNum(r.created_at),
    closed_at: toNum(r.closed_at)
  };
}

const tickets = {
  async createPanel({ guildId, channelId, content, createdBy }) {
    const r = await db.run(
      'INSERT INTO ticket_panels (guild_id, channel_id, content, created_by, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      [guildId, channelId, content, createdBy, now()]
    );
    return toNum(r.rows[0].id);
  },
  async setPanelMessage(panelId, messageId) {
    await db.run('UPDATE ticket_panels SET message_id = ? WHERE id = ?', [messageId, panelId]);
  },
  async deletePanel(panelId) {
    await db.run('DELETE FROM ticket_panels WHERE id = ?', [panelId]);
  },
  async getPanel(panelId) {
    const rows = await db.query('SELECT * FROM ticket_panels WHERE id = ?', [panelId]);
    return rows[0] ? { ...rows[0], id: toNum(rows[0].id) } : null;
  },
  async findOpen(guildId, discordId, originChannelId) {
    const rows = await db.query(
      "SELECT * FROM tickets WHERE guild_id = ? AND discord_id = ? AND origin_channel_id = ? AND status = 'open'",
      [guildId, discordId, originChannelId]
    );
    return mapTicket(rows[0]);
  },
  // يحجز التكت (status=open) قبل إنشاء القناة — الفهرس الفريد يرفض التكرار
  // حتى مع ضغطتين بنفس اللحظة. يرجّع null لو فيه تكت مفتوح أصلاً.
  async reserve({ guildId, panelId, originChannelId, discordId, reason }) {
    try {
      const r = await db.run(
        'INSERT INTO tickets (guild_id, panel_id, origin_channel_id, discord_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
        [guildId, panelId, originChannelId, discordId, reason, 'open', now()]
      );
      return toNum(r.rows[0].id);
    } catch (err) {
      if (err.isUniqueViolation) return null;
      throw err;
    }
  },
  async attachChannel(ticketId, channelId) {
    await db.run('UPDATE tickets SET channel_id = ? WHERE id = ?', [channelId, ticketId]);
  },
  async discard(ticketId) {
    await db.run('DELETE FROM tickets WHERE id = ?', [ticketId]);
  },
  async get(ticketId) {
    const rows = await db.query('SELECT * FROM tickets WHERE id = ?', [ticketId]);
    return mapTicket(rows[0]);
  },
  // آخر سجل تكت لقناة معيّنة — أزرار التكت تعتمد على القناة نفسها (مو الرقم
  // المكتوب بالزر) عشان تبقى صحيحة حتى لو انمسحت القاعدة وتكررت الأرقام.
  async getByChannel(guildId, channelId) {
    const rows = await db.query('SELECT * FROM tickets WHERE guild_id = ? AND channel_id = ? ORDER BY id DESC LIMIT 1', [guildId, channelId]);
    return mapTicket(rows[0]);
  },
  // استرجاع تكت مفتوح من قناته (بعد فقد سجله) — origin = القناة نفسها فما يتعارض مع الفهرس الفريد
  async adopt({ guildId, channelId, discordId, reason }) {
    const r = await db.run(
      "INSERT INTO tickets (guild_id, panel_id, origin_channel_id, discord_id, channel_id, reason, status, created_at) VALUES (?, NULL, ?, ?, ?, ?, 'open', ?) RETURNING id",
      [guildId, channelId, discordId, channelId, reason, now()]
    );
    return toNum(r.rows[0].id);
  },
  // إغلاق ذرّي: ينجح مرة وحدة فقط حتى لو ضغط شخصان "تأكيد" سوا
  async close(ticketId, closedBy, closeMode) {
    const r = await db.run(
      "UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ?, close_mode = ? WHERE id = ? AND status = 'open'",
      [now(), closedBy, closeMode, ticketId]
    );
    return r.changes > 0;
  },
  // تكتات مغلقة بوضع الحذف — للتنظيف عند الإقلاع لو البوت انطفى قبل مهلة الحذف
  async closedForDeletion(sinceMs) {
    const rows = await db.query(
      "SELECT * FROM tickets WHERE status = 'closed' AND close_mode = 'delete' AND channel_id IS NOT NULL AND closed_at >= ?",
      [sinceMs]
    );
    return rows.map(mapTicket);
  },
  async forgetChannel(ticketId) {
    await db.run('UPDATE tickets SET channel_id = NULL WHERE id = ?', [ticketId]);
  }
};

// ---------------- التحذيرات ----------------
function mapWarning(r) {
  return { ...r, id: toNum(r.id), issued_at: toNum(r.issued_at) };
}

const warnings = {
  async add({ guildId, discordId, reason, role, issuedBy }) {
    const r = await db.run(
      'INSERT INTO warnings (guild_id, discord_id, reason, warning_role_given, issued_by, issued_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id',
      [guildId, discordId, reason, role, issuedBy, now()]
    );
    return toNum(r.rows[0].id);
  },
  // عدّ حقيقي من الجدول (مو مبني على اسم رتبة التحذير)
  async count(guildId, discordId) {
    const rows = await db.query('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ? AND discord_id = ?', [guildId, discordId]);
    return Number(rows[0].n) || 0;
  },
  // الترقيم التسلسلي: 1 = أقدم تحذير — ثابت ومفهوم، ونفسه بأمر الحذف
  async list(guildId, discordId) {
    const rows = await db.query(
      'SELECT * FROM warnings WHERE guild_id = ? AND discord_id = ? ORDER BY issued_at ASC, id ASC',
      [guildId, discordId]
    );
    return rows.map((r, i) => ({ ...mapWarning(r), seq: i + 1 }));
  },
  async removeBySeq(guildId, discordId, seq) {
    const all = await warnings.list(guildId, discordId);
    const target = all.find((w) => w.seq === seq);
    if (!target) return null;
    await db.run('DELETE FROM warnings WHERE id = ? AND guild_id = ?', [target.id, guildId]);
    return target;
  }
};

// ---------------- سجل الإشراف ----------------
const moderationLog = {
  async add({ guildId, action, targetId = null, moderatorId, channelId = null, reason = null, details = null }) {
    await db.run(
      'INSERT INTO moderation_log (guild_id, action, target_id, moderator_id, channel_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [guildId, action, targetId, moderatorId, channelId, reason, details == null ? null : JSON.stringify(details), now()]
    );
  },
  async recent(guildId, limit = 20) {
    const rows = await db.query('SELECT * FROM moderation_log WHERE guild_id = ? ORDER BY created_at DESC, id DESC LIMIT ?', [guildId, limit]);
    return rows.map((r) => ({ ...r, id: toNum(r.id), created_at: toNum(r.created_at) }));
  }
};

module.exports = { adminConfig, guildConfig, tickets, warnings, moderationLog };
