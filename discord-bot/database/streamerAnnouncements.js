'use strict';

// تخزين الإعلان التلقائي عن الستريمرز: قائمة التسجيل + حلقات البث (سجل الإعلانات).
// كل العمليات عبر botDb (SQLite/PostgreSQL). المعرّفات الرقمية تتحول لـNumber.

const db = require('./botDb');

const PLATFORMS = Object.freeze(['tiktok', 'twitch', 'youtube', 'kick']);
const toNum = (v) => (v == null ? v : Number(v));
const now = () => Date.now();

const rowStreamer = (r) => (r ? { ...r, id: toNum(r.id), enabled: !!Number(r.enabled), created_at: toNum(r.created_at), updated_at: toNum(r.updated_at) } : null);
const rowEvent = (r) =>
  r
    ? {
        ...r,
        id: toNum(r.id),
        streamer_id: toNum(r.streamer_id),
        started_at: toNum(r.started_at),
        last_seen_at: toNum(r.last_seen_at),
        ended_at: toNum(r.ended_at),
        announced_at: toNum(r.announced_at),
        attempts: Number(r.attempts || 0)
      }
    : null;

// ---------------- التسجيل ----------------
const streamers = {
  /** @returns {{created:boolean, row:object}} created=false لو موجود مسبقاً (يُفعَّل لو كان معطّلاً) */
  async add({ guildId, platform, username, normalized, addedBy }) {
    const t = now();
    try {
      await db.run(
        'INSERT INTO streamer_announcements (guild_id, platform, username, normalized_username, enabled, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        [guildId, platform, username, normalized, addedBy, t, t]
      );
      return { created: true, row: await streamers.get(guildId, platform, normalized) };
    } catch (err) {
      if (!err.isUniqueViolation) throw err;
      return { created: false, row: await streamers.get(guildId, platform, normalized) };
    }
  },
  async get(guildId, platform, normalized) {
    const rows = await db.query('SELECT * FROM streamer_announcements WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [guildId, platform, normalized]);
    return rowStreamer(rows[0]);
  },
  async remove(guildId, platform, normalized) {
    const r = await db.run('DELETE FROM streamer_announcements WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [guildId, platform, normalized]);
    return r.changes > 0;
  },
  async listEnabled() {
    return (await db.query('SELECT * FROM streamer_announcements WHERE enabled = 1 ORDER BY id')).map(rowStreamer);
  },
  async countAll() {
    const rows = await db.query('SELECT COUNT(*) AS n FROM streamer_announcements');
    return Number(rows[0].n);
  }
};

// ---------------- حلقات البث ----------------
const events = {
  /** يفتح حلقة جديدة؛ null لو فيه حلقة مفتوحة لنفس الحساب (الفهرس الفريد). */
  async open({ platform, normalized, streamerId, linkSessionId, liveSessionId, startedAt }) {
    const t = now();
    const eventKey = `${platform}:${normalized}:${startedAt || t}`;
    try {
      await db.run(
        "INSERT INTO streamer_announcement_events (platform, normalized_username, streamer_id, link_session_id, live_session_id, event_key, started_at, last_seen_at, status, attempts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0)",
        [platform, normalized, streamerId || null, linkSessionId || null, liveSessionId || null, eventKey, startedAt || t, t]
      );
    } catch (err) {
      if (err.isUniqueViolation) return null;
      throw err;
    }
    return events.getOpen(platform, normalized);
  },
  async getOpen(platform, normalized) {
    const rows = await db.query('SELECT * FROM streamer_announcement_events WHERE platform = ? AND normalized_username = ? AND ended_at IS NULL', [platform, normalized]);
    return rowEvent(rows[0]);
  },
  async listOpen() {
    return (await db.query('SELECT * FROM streamer_announcement_events WHERE ended_at IS NULL')).map(rowEvent);
  },
  async touch(id, t = now()) {
    await db.run('UPDATE streamer_announcement_events SET last_seen_at = ? WHERE id = ?', [t, id]);
  },
  async close(id, t = now()) {
    await db.run('UPDATE streamer_announcement_events SET ended_at = ? WHERE id = ? AND ended_at IS NULL', [t, id]);
  },
  /** يحجز الإرسال ذرّياً: ينجح فقط لو الحالة pending/failed (طرف واحد فقط). */
  async claimSend(id) {
    const r = await db.run("UPDATE streamer_announcement_events SET status = 'sending', attempts = attempts + 1, announced_at = ? WHERE id = ? AND status IN ('pending', 'failed')", [now(), id]);
    return r.changes > 0;
  },
  async markSent(id, { messageId, streamUrl, status = 'sent' }) {
    await db.run('UPDATE streamer_announcement_events SET status = ?, message_id = ?, stream_url = ?, announced_at = ?, error_code = NULL WHERE id = ?', [status, messageId || null, streamUrl || null, now(), id]);
  },
  /** failed = فشل مؤكد (يُعاد)، unknown = نتيجة غير واضحة (ما يُعاد لمنع التكرار)، skipped = ما انرسل لسبب مقصود */
  async markFailed(id, status, errorCode) {
    await db.run('UPDATE streamer_announcement_events SET status = ?, error_code = ? WHERE id = ?', [status, String(errorCode || '').slice(0, 60), id]);
  },
  async get(id) {
    return rowEvent((await db.query('SELECT * FROM streamer_announcement_events WHERE id = ?', [id]))[0]);
  },
  /** حلقات علقت بحالة sending (انقطع البوت وسط الإرسال) ← unknown بدون إعادة */
  async settleStuckSending(olderThanMs = 2 * 60 * 1000) {
    const r = await db.run("UPDATE streamer_announcement_events SET status = 'unknown', error_code = 'interrupted' WHERE status = 'sending' AND announced_at < ?", [now() - olderThanMs]);
    return r.changes;
  },
  async purgeOlderThan(ms) {
    await db.run('DELETE FROM streamer_announcement_events WHERE ended_at IS NOT NULL AND ended_at < ?', [now() - ms]);
  }
};

module.exports = { PLATFORMS, streamers, events };
