// قاعدة بيانات اللوحة المستقلة (SQLite عبر node:sqlite — بلا اعتماديات native).
// واجهة وثائقية بسيطة: col(name).{get,set,create,merge,del,list,count}. تُستخدم لبيانات اللوحة فقط
// (جلسات، تدقيق، إعدادات الصلاحيات، تنبيهات، تقارير، مهام مجدولة) — لا تُكرّر بيانات الموقع أو البوت.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { now } from '../lib/util.js';

const FIELD = /^[A-Za-z0-9_.]+$/;

export function createStore(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS docs (
      col TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (col, id)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS docs_by_created ON docs (col, created_at);`);

  const q = {
    get: db.prepare('SELECT json FROM docs WHERE col = ? AND id = ?'),
    ins: db.prepare('INSERT INTO docs (col, id, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'),
    upsert: db.prepare(`INSERT INTO docs (col, id, json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (col, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at`),
    upd: db.prepare('UPDATE docs SET json = ?, updated_at = ? WHERE col = ? AND id = ?'),
    del: db.prepare('DELETE FROM docs WHERE col = ? AND id = ?')
  };

  function buildWhere(col, where = {}, search) {
    const parts = ['col = ?'];
    const params = [col];
    for (const [f, cond] of Object.entries(where)) {
      if (!FIELD.test(f)) throw new Error('bad field');
      const path = `$.${f}`;
      if (cond !== null && typeof cond === 'object') {
        for (const [op, val] of Object.entries(cond)) {
          const sqlOp = { gte: '>=', lte: '<=', gt: '>', lt: '<', ne: '!=' }[op];
          if (!sqlOp) throw new Error('bad op');
          parts.push(`json_extract(json, '${path}') ${sqlOp} ?`);
          params.push(val);
        }
      } else if (cond === null) {
        parts.push(`json_extract(json, '${path}') IS NULL`);
      } else {
        parts.push(`json_extract(json, '${path}') = ?`);
        params.push(typeof cond === 'boolean' ? (cond ? 1 : 0) : cond);
      }
    }
    if (search) {
      parts.push('json LIKE ? ESCAPE \'\\\'');
      params.push('%' + String(search).replace(/[\\%_]/g, (c) => '\\' + c) + '%');
    }
    return { sql: parts.join(' AND '), params };
  }

  const parse = (r) => (r ? JSON.parse(r.json) : null);

  function col(name) {
    return {
      get: (id) => parse(q.get.get(name, String(id))),
      set(id, doc) { const t = now(); q.upsert.run(name, String(id), JSON.stringify(doc), t, t); return doc; },
      // ينشئ فقط لو غير موجود — يرجّع false لو مكرر (أساس منع الكتابة المزدوجة)
      create(id, doc) {
        const t = now();
        try { q.ins.run(name, String(id), JSON.stringify(doc), t, t); return true; }
        catch (e) { if (/UNIQUE|constraint/i.test(String(e.message))) return false; throw e; }
      },
      merge(id, patch) {
        const cur = parse(q.get.get(name, String(id)));
        if (!cur) return null;
        const next = { ...cur, ...patch };
        q.upd.run(JSON.stringify(next), now(), name, String(id));
        return next;
      },
      del: (id) => q.del.run(name, String(id)).changes > 0,
      list({ where, search, orderBy = 'created_at', dir = 'desc', limit = 50, offset = 0 } = {}) {
        const w = buildWhere(name, where, search);
        const order = orderBy === 'created_at' || orderBy === 'updated_at' ? orderBy : `json_extract(json, '$.${FIELD.test(orderBy) ? orderBy : 'ts'}')`;
        const rows = db.prepare(`SELECT id, json, created_at FROM docs WHERE ${w.sql} ORDER BY ${order} ${dir === 'asc' ? 'ASC' : 'DESC'}, id ${dir === 'asc' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`).all(...w.params, Math.min(limit, 1000), offset);
        return rows.map((r) => ({ id: r.id, ...JSON.parse(r.json) }));
      },
      count(where, search) {
        const w = buildWhere(name, where, search);
        return Number(db.prepare(`SELECT COUNT(*) AS n FROM docs WHERE ${w.sql}`).get(...w.params).n);
      },
      deleteWhere(where) {
        const w = buildWhere(name, where);
        return db.prepare(`DELETE FROM docs WHERE ${w.sql}`).run(...w.params).changes;
      }
    };
  }

  // معاملة متزامنة (SQLite أحادي الاتصال): تُستخدم للقراءة-ثم-الكتابة الذرّية (إصدارات الإعدادات)
  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; }
  }

  return {
    kind: 'sqlite', file, col, tx,
    ping() { db.prepare('SELECT 1').get(); return true; },
    // نسخة احتياطية متّسقة (VACUUM INTO) — لا تُقفل القاعدة الحية
    backupTo(dest) { fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true }); if (fs.existsSync(dest)) throw new Error('الملف موجود'); db.exec(`VACUUM INTO '${String(dest).replace(/'/g, "''")}'`); return dest; },
    close() { db.close(); }
  };
}
