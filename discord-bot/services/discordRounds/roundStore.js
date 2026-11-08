'use strict';

// تخزين الراوندات: قاعدة بيانات البوت (SQLite/PostgreSQL) للإنتاج، ونسخة بالذاكرة للاختبارات.
// الواجهة: save(record) · load(id) · listActive() · claimAnnouncement(id) · markAnnounced(id)

const ACTIVE = ['waiting', 'starting', 'running'];

function createDbStore(db) {
  return {
    kind: 'db',
    async save(rec) {
      const now = Date.now();
      const json = JSON.stringify(rec);
      const r = await db.run(
        'UPDATE discord_rounds SET status = ?, state_json = ?, updated_at = ?, ended_at = ? WHERE round_id = ?',
        [rec.status, json, now, rec.endedAt || null, rec.roundId]
      );
      if (!r.changes) {
        await db.run(
          'INSERT INTO discord_rounds (round_id, game_type, guild_id, channel_id, host_id, status, state_json, result_announced, created_at, updated_at, ended_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [rec.roundId, rec.gameType, rec.guildId, rec.channelId, rec.hostDiscordId, rec.status, json, rec.resultAnnounced ? 1 : 0, rec.createdAt, now, rec.endedAt || null]
        );
      }
    },
    async load(id) {
      const rows = await db.query('SELECT state_json, result_announced FROM discord_rounds WHERE round_id = ?', [id]);
      if (!rows.length) return null;
      const rec = JSON.parse(rows[0].state_json);
      rec.resultAnnounced = !!Number(rows[0].result_announced);
      return rec;
    },
    async listActive() {
      const rows = await db.query(`SELECT round_id, state_json, result_announced FROM discord_rounds WHERE status IN (${ACTIVE.map(() => '?').join(',')})`, ACTIVE);
      const out = [];
      for (const row of rows) {
        try {
          const rec = JSON.parse(row.state_json);
          rec.resultAnnounced = !!Number(row.result_announced);
          out.push(rec);
        } catch {
          out.push({ roundId: row.round_id, corrupt: true });
        }
      }
      return out;
    },
    // راوند منتهي ما انعلنت نتيجته (سقط البوت قبل الإعلان)
    async listUnannounced() {
      const rows = await db.query("SELECT state_json FROM discord_rounds WHERE status = 'finished' AND result_announced = 0 AND ended_at > ?", [Date.now() - 30 * 60 * 1000]);
      return rows.map((r) => {
        try {
          return JSON.parse(r.state_json);
        } catch {
          return null;
        }
      }).filter(Boolean);
    },
    // ذرّي: ينجح لطرف واحد فقط (changes = 1) — يمنع إعلان الفائز مرتين حتى مع إعادة تشغيل/تكرار الحدث
    async claimAnnouncement(id) {
      const r = await db.run('UPDATE discord_rounds SET result_announced = 1 WHERE round_id = ? AND result_announced = 0', [id]);
      return r.changes > 0;
    },
    async purgeOlderThan(ms) {
      await db.run("DELETE FROM discord_rounds WHERE status NOT IN ('waiting','starting','running') AND updated_at < ?", [Date.now() - ms]);
    }
  };
}

function createMemoryStore() {
  const rows = new Map();
  return {
    kind: 'memory',
    rows,
    async save(rec) {
      const prev = rows.get(rec.roundId);
      rows.set(rec.roundId, { json: JSON.stringify(rec), announced: prev ? prev.announced : false, status: rec.status, endedAt: rec.endedAt || null });
    },
    async load(id) {
      const r = rows.get(id);
      return r ? { ...JSON.parse(r.json), resultAnnounced: r.announced } : null;
    },
    async listActive() {
      return [...rows.values()].filter((r) => ACTIVE.includes(r.status)).map((r) => ({ ...JSON.parse(r.json), resultAnnounced: r.announced }));
    },
    async listUnannounced() {
      return [...rows.values()].filter((r) => r.status === 'finished' && !r.announced).map((r) => JSON.parse(r.json));
    },
    async claimAnnouncement(id) {
      const r = rows.get(id);
      if (!r || r.announced) return false;
      r.announced = true;
      return true;
    },
    async purgeOlderThan() {}
  };
}

module.exports = { createDbStore, createMemoryStore, ACTIVE };
