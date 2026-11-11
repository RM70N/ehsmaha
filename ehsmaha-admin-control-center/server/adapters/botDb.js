// Bot Control Adapter ← قاعدة بيانات البوت (نفس القاعدة التي يستخدمها البوت: PostgreSQL أو ملف SQLite على نفس الجهاز).
// الجداول والـUPSERT مطابقة حرفياً لـdiscord-bot/database/botStore.js و streamerAnnouncements.js.
// ⚠️ كتابة القاعدة ≠ تغيير سلوك البوت: كل عملية هنا تحمل `apply` (live | ttl | restart) مثبتة من كود البوت،
// والواجهة تعرضها للمسؤول ولا تدّعي نجاحاً أكثر مما حدث فعلاً.
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const toNum = (v) => (v == null ? v : Number(v));
const now = () => Date.now();

export async function createBotDb(cfg) {
  const b = cfg.bot;
  let kind = null, run = null, query = null, close = async () => {};
  let reason = '';
  try {
    if (b.databaseUrl) {
      const { default: pg } = await import('pg');
      const host = (() => { try { return new URL(b.databaseUrl).hostname; } catch { return ''; } })();
      const ssl = process.env.BOT_DATABASE_SSL === 'false' || !host.includes('.') || host === 'localhost' ? false : { rejectUnauthorized: false };
      const pool = new pg.Pool({ connectionString: b.databaseUrl, ssl, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 30_000 });
      pool.on('error', () => {});
      const conv = (sql) => { let i = 0; return sql.replace(/\?/g, () => `$${++i}`); };
      query = async (sql, p = []) => (await pool.query(conv(sql), p)).rows;
      run = async (sql, p = []) => { const r = await pool.query(conv(sql), p); return { changes: r.rowCount, rows: r.rows }; };
      close = () => pool.end();
      kind = 'postgres';
    } else if (b.sqlitePath) {
      if (!fs.existsSync(b.sqlitePath)) throw new Error('ملف SQLite للبوت غير موجود في هذا الجهاز');
      const db = new DatabaseSync(b.sqlitePath);
      db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;'); // لا نغيّر journal_mode (البوت يستخدم DELETE)
      const exec = (sql, p) => { const st = db.prepare(sql); return /^\s*(select|with)\b/i.test(sql) || /\breturning\b/i.test(sql) ? { rows: st.all(...p), changes: 0 } : { rows: [], changes: Number(st.run(...p).changes) }; };
      query = async (sql, p = []) => exec(sql, p).rows;
      run = async (sql, p = []) => { const r = exec(sql, p); return { changes: r.changes || r.rows.length, rows: r.rows }; };
      close = async () => db.close();
      kind = 'sqlite';
    } else reason = 'لم تُضبط قاعدة البوت (BOT_DATABASE_URL أو BOT_SQLITE_PATH). البوت على Render يحتفظ بـSQLite محلياً — اضبط DATABASE_URL (PostgreSQL) للبوت وللوحة معاً';
  } catch (e) { reason = 'تعذّر فتح قاعدة البوت: ' + (e.code || e.message); kind = null; }

  const available = !!kind;
  const need = () => { if (!available) { const e = new Error(reason || 'قاعدة البوت غير متاحة'); e.code = 'BOT_DB_UNAVAILABLE'; e.status = 503; throw e; } };
  const isUnique = (e) => e && (e.code === '23505' || /UNIQUE|PRIMARYKEY/i.test(String(e.code || '') + String(e.message || '')));
  // أي عطل اتصال/قاعدة (غير تعارض الفرادة المتوقع) يُحوَّل لرسالة «غير متاحة» واضحة بدل خطأ داخلي
  const guard = (fn) => async (sql, p) => { need(); try { return await fn(sql, p); } catch (e) { if (isUnique(e)) throw e; const err = new Error('تعذّر الوصول لقاعدة البوت: ' + String(e.code || e.message).slice(0, 80)); err.code = 'BOT_DB_UNAVAILABLE'; err.status = 503; err.cause = e; throw err; } };
  const Q = guard((sql, p) => query(sql, p));
  const R = guard((sql, p) => run(sql, p));

  const SETTINGS = ['welcome_channel_id', 'welcome_message_channel_id', 'welcome_message', 'link_protection', 'spam_protection', 'admin_news_channel_id', 'ai_style_enabled', 'ai_style_owner_id'];
  const BOOL = ['link_protection', 'spam_protection', 'ai_style_enabled'];
  const DEFAULTS = { welcome_channel_id: null, welcome_message_channel_id: null, welcome_message: null, link_protection: true, spam_protection: true, admin_news_channel_id: null, ai_style_enabled: true, ai_style_owner_id: null };
  const mapSettings = (r) => r ? {
    welcome_channel_id: r.welcome_channel_id || null, welcome_message_channel_id: r.welcome_message_channel_id || null, welcome_message: r.welcome_message || null,
    link_protection: Number(r.link_protection) !== 0, spam_protection: Number(r.spam_protection) !== 0,
    admin_news_channel_id: r.admin_news_channel_id || null, ai_style_enabled: r.ai_style_enabled == null ? true : Number(r.ai_style_enabled) !== 0, ai_style_owner_id: r.ai_style_owner_id || null
  } : { ...DEFAULTS };

  const repo = {
    kind, available, reason,
    async ping() { const t = Date.now(); await Q('SELECT 1 AS ok'); return { ok: true, ms: Date.now() - t, dialect: kind }; },
    async tableExists(name) {
      try { await Q(`SELECT 1 FROM ${name} LIMIT 1`); return true; } catch { return false; }
    },
    settings: {
      DEFAULTS,
      async get(guildId) { return mapSettings((await Q('SELECT * FROM guild_settings WHERE guild_id = ?', [guildId]))[0]); },
      async update(guildId, patch, by) {
        const cols = Object.keys(patch).filter((k) => SETTINGS.includes(k));
        if (!cols.length) return repo.settings.get(guildId);
        const toDb = (k, v) => (BOOL.includes(k) ? (v ? 1 : 0) : v == null ? null : String(v));
        const merged = { ...(await repo.settings.get(guildId)), ...Object.fromEntries(cols.map((k) => [k, patch[k]])) };
        await R(`INSERT INTO guild_settings (guild_id, ${SETTINGS.join(', ')}, updated_by, updated_at) VALUES (?, ${SETTINGS.map(() => '?').join(', ')}, ?, ?)
          ON CONFLICT (guild_id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
        [guildId, ...SETTINGS.map((k) => toDb(k, merged[k])), by || null, now()]);
        return repo.settings.get(guildId);
      }
    },
    config: {
      async get(guildId, key, fallback = null) { const r = await Q('SELECT value FROM guild_config WHERE guild_id = ? AND key = ?', [guildId, key]); if (!r.length) return fallback; try { return JSON.parse(r[0].value); } catch { return fallback; } },
      async set(guildId, key, value, by) { await R(`INSERT INTO guild_config (guild_id, key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (guild_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`, [guildId, key, JSON.stringify(value), by || null, now()]); }
    },
    admins: {
      async list(guildId) { return (await Q('SELECT type, discord_id, added_by, added_at FROM bot_admin_config WHERE guild_id = ? ORDER BY added_at', [guildId])).map((r) => ({ ...r, added_at: toNum(r.added_at) })); },
      async add(guildId, type, id, by) { try { await R('INSERT INTO bot_admin_config (guild_id, type, discord_id, added_by, added_at) VALUES (?, ?, ?, ?, ?)', [guildId, type, id, by, now()]); return true; } catch (e) { if (isUnique(e)) return false; throw e; } },
      async remove(guildId, type, id) { return (await R('DELETE FROM bot_admin_config WHERE guild_id = ? AND type = ? AND discord_id = ?', [guildId, type, id])).changes > 0; }
    },
    automod: {
      async exemptions(guildId) { const out = { domains: [], roles: [], channels: [] }; for (const r of await Q('SELECT type, value FROM auto_mod_exemptions WHERE guild_id = ? ORDER BY added_at', [guildId])) out[{ domain: 'domains', role: 'roles', channel: 'channels' }[r.type]].push(r.value); return out; },
      async addExemption(guildId, type, value, by) { try { await R('INSERT INTO auto_mod_exemptions (guild_id, type, value, added_by, added_at) VALUES (?, ?, ?, ?, ?)', [guildId, type, value, by, now()]); return true; } catch (e) { if (isUnique(e)) return false; throw e; } },
      async removeExemption(guildId, type, value) { return (await R('DELETE FROM auto_mod_exemptions WHERE guild_id = ? AND type = ? AND value = ?', [guildId, type, value])).changes > 0; },
      async violations(guildId, limit = 50) { return (await Q('SELECT discord_id, violation_type, count, last_violation_at FROM auto_mod_violations WHERE guild_id = ? ORDER BY last_violation_at DESC LIMIT ?', [guildId, limit])).map((r) => ({ ...r, count: toNum(r.count), last_violation_at: toNum(r.last_violation_at) })); },
      async resetViolations(guildId, id, type = 'all') { return (type === 'all' ? await R('DELETE FROM auto_mod_violations WHERE guild_id = ? AND discord_id = ?', [guildId, id]) : await R('DELETE FROM auto_mod_violations WHERE guild_id = ? AND discord_id = ? AND violation_type = ?', [guildId, id, type])).changes; },
      async violationStats(guildId) { return (await Q('SELECT violation_type AS type, COUNT(*) AS members, SUM(count) AS total FROM auto_mod_violations WHERE guild_id = ? GROUP BY violation_type', [guildId])).map((r) => ({ type: r.type, members: toNum(r.members), total: toNum(r.total) })); }
    },
    tickets: {
      async list(guildId, { status, limit = 50, offset = 0 } = {}) { const r = await Q(`SELECT * FROM tickets WHERE guild_id = ? ${status ? 'AND status = ?' : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`, status ? [guildId, status, limit, offset] : [guildId, limit, offset]); return r.map((x) => ({ ...x, id: toNum(x.id), created_at: toNum(x.created_at), closed_at: toNum(x.closed_at) })); },
      async stats(guildId) { const r = await Q("SELECT status, COUNT(*) AS n FROM tickets WHERE guild_id = ? GROUP BY status", [guildId]); const o = { open: 0, closed: 0 }; for (const x of r) o[x.status] = toNum(x.n); return o; },
      async byReason(guildId) { return (await Q('SELECT reason, COUNT(*) AS n FROM tickets WHERE guild_id = ? GROUP BY reason ORDER BY n DESC', [guildId])).map((r) => ({ reason: r.reason, n: toNum(r.n) })); },
      async avgCloseMs(guildId) { const r = await Q("SELECT AVG(closed_at - created_at) AS ms FROM tickets WHERE guild_id = ? AND status = 'closed' AND closed_at IS NOT NULL", [guildId]); return r[0] && r[0].ms != null ? Math.round(Number(r[0].ms)) : null; }
    },
    moderation: {
      async log(guildId, { action, limit = 50, offset = 0, target } = {}) {
        const w = ['guild_id = ?']; const p = [guildId];
        if (action) { w.push('action = ?'); p.push(action); }
        if (target) { w.push('target_id = ?'); p.push(target); }
        return (await Q(`SELECT * FROM moderation_log WHERE ${w.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset])).map((r) => ({ ...r, id: toNum(r.id), created_at: toNum(r.created_at) }));
      },
      async counts(guildId, sinceMs = 0) { return (await Q('SELECT action, COUNT(*) AS n FROM moderation_log WHERE guild_id = ? AND created_at >= ? GROUP BY action ORDER BY n DESC', [guildId, sinceMs])).map((r) => ({ action: r.action, n: toNum(r.n) })); },
      async moderators(guildId, sinceMs = 0) { return (await Q('SELECT moderator_id, COUNT(*) AS n FROM moderation_log WHERE guild_id = ? AND created_at >= ? GROUP BY moderator_id ORDER BY n DESC LIMIT 20', [guildId, sinceMs])).map((r) => ({ moderator_id: r.moderator_id, n: toNum(r.n) })); },
      async daily(guildId, sinceMs) { return (await Q('SELECT created_at, action FROM moderation_log WHERE guild_id = ? AND created_at >= ?', [guildId, sinceMs])).map((r) => ({ t: toNum(r.created_at), action: r.action })); }
    },
    warnings: {
      async list(guildId, { member, limit = 50, offset = 0 } = {}) { const r = await Q(`SELECT * FROM warnings WHERE guild_id = ? ${member ? 'AND discord_id = ?' : ''} ORDER BY issued_at DESC LIMIT ? OFFSET ?`, member ? [guildId, member, limit, offset] : [guildId, limit, offset]); return r.map((x) => ({ ...x, id: toNum(x.id), issued_at: toNum(x.issued_at) })); },
      async count(guildId) { return toNum((await Q('SELECT COUNT(*) AS n FROM warnings WHERE guild_id = ?', [guildId]))[0].n); }
    },
    async clearAiStyle(guildId) { const n = toNum((await Q('SELECT COUNT(*) AS n FROM ai_style_examples WHERE guild_id = ?', [guildId]))[0].n); await R('DELETE FROM ai_style_examples WHERE guild_id = ?', [guildId]); return n; },
    autoReplies: { async list(guildId) { return (await Q('SELECT * FROM auto_replies WHERE guild_id = ? ORDER BY created_at ASC, id ASC', [guildId])).map((r) => ({ ...r, id: toNum(r.id), created_at: toNum(r.created_at) })); } },
    streamers: {
      async list(guildId) { return (await Q('SELECT * FROM streamer_announcements WHERE guild_id = ? ORDER BY id', [guildId])).map((r) => ({ ...r, id: toNum(r.id), enabled: !!Number(r.enabled), created_at: toNum(r.created_at), updated_at: toNum(r.updated_at) })); },
      async get(guildId, platform, normalized) { const r = (await Q('SELECT * FROM streamer_announcements WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [guildId, platform, normalized]))[0]; return r ? { ...r, id: toNum(r.id), enabled: !!Number(r.enabled) } : null; },
      async add({ guildId, platform, username, normalized, addedBy }) { const t = now(); try { await R('INSERT INTO streamer_announcements (guild_id, platform, username, normalized_username, enabled, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)', [guildId, platform, username, normalized, addedBy, t, t]); return true; } catch (e) { if (isUnique(e)) return false; throw e; } },
      async remove(guildId, platform, normalized) { return (await R('DELETE FROM streamer_announcements WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [guildId, platform, normalized])).changes > 0; },
      async setEnabled(guildId, platform, normalized, enabled) { return (await R('UPDATE streamer_announcements SET enabled = ?, updated_at = ? WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [enabled ? 1 : 0, now(), guildId, platform, normalized])).changes > 0; },
      async setUsername(guildId, platform, normalized, username, newNormalized) { return (await R('UPDATE streamer_announcements SET username = ?, normalized_username = ?, updated_at = ? WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [username, newNormalized, now(), guildId, platform, normalized])).changes > 0; },
      async setPlatform(guildId, platform, normalized, newPlatform) { return (await R('UPDATE streamer_announcements SET platform = ?, updated_at = ? WHERE guild_id = ? AND platform = ? AND normalized_username = ?', [newPlatform, now(), guildId, platform, normalized])).changes > 0; },
      async events({ limit = 50, offset = 0, platform, username } = {}) {
        const w = []; const p = [];
        if (platform) { w.push('platform = ?'); p.push(platform); }
        if (username) { w.push('normalized_username = ?'); p.push(username); }
        return (await Q(`SELECT * FROM streamer_announcement_events ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY started_at DESC LIMIT ? OFFSET ?`, [...p, limit, offset])).map((r) => ({ ...r, id: toNum(r.id), started_at: toNum(r.started_at), ended_at: toNum(r.ended_at), announced_at: toNum(r.announced_at), attempts: toNum(r.attempts) }));
      },
      async eventStats() { return (await Q('SELECT status, COUNT(*) AS n FROM streamer_announcement_events GROUP BY status')).map((r) => ({ status: r.status, n: toNum(r.n) })); }
    },
    counts: {
      async all() {
        const out = {};
        for (const [k, t] of [['tickets', 'tickets'], ['warnings', 'warnings'], ['moderation_log', 'moderation_log'], ['auto_replies', 'auto_replies'], ['streamers', 'streamer_announcements'], ['ai_style_examples', 'ai_style_examples']]) {
          try { out[k] = toNum((await Q(`SELECT COUNT(*) AS n FROM ${t}`))[0].n); } catch { out[k] = null; }
        }
        return out;
      }
    },
    close
  };
  return repo;
}
