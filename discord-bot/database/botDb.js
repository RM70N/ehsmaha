'use strict';

// قاعدة بيانات البوت نفسه (صلاحيات الأدمن، التكتات، التحذيرات، سجل الإشراف) —
// منفصلة تماماً عن قاعدة بيانات الموقع (Firebase).
//
//   • PostgreSQL لو DATABASE_URL موجود (الإنتاج على Render).
//   • SQLite بملف محلي (SQLITE_PATH، افتراضياً ./data/bot.sqlite) غير كذا (التطوير).
//
// واجهة موحّدة للنوعين: query(sql, params) ترجع صفوف، run(sql, params) ترجع
// { changes, rows }. الـSQL يُكتب بعلامات ? ونحوّلها لـ$1.. تلقائياً بـPostgreSQL.
// الجداول تُنشأ تلقائياً عند أول تشغيل (migrations/*.sql) — ما نفترض وجودها.

const fs = require('node:fs');
const path = require('node:path');
const logger = require('../utils/logger');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const PG_LOCK_KEY = 725504; // قفل استشاري ثابت: يمنع نسختين تطبّقان الـmigrations بنفس اللحظة

class DbUnavailableError extends Error {
  constructor(cause) {
    super('قاعدة بيانات البوت غير متاحة');
    this.name = 'DbUnavailableError';
    this.code = 'DB_UNAVAILABLE';
    this.cause = cause;
  }
}

// يوحّد خطأ "قيمة مكررة" بين النوعين
function markUnique(err) {
  if (err && (err.code === '23505' || String(err.code || '').startsWith('SQLITE_CONSTRAINT_UNIQUE') || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')) {
    err.isUniqueViolation = true;
  }
  return err;
}

// ---------------- SQLite ----------------
function createSqlite(file) {
  const Database = require('better-sqlite3');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new Database(file);
  // DELETE (مو WAL): الملف نفسه دائماً فيه آخر حالة — لازم للنسخ الاحتياطي (serialize)
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const exec = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.reader ? { rows: stmt.all(...params), changes: 0 } : { rows: [], changes: stmt.run(...params).changes };
  };

  return {
    dialect: 'sqlite',
    async query(sql, params) {
      try {
        return exec(sql, params).rows;
      } catch (err) {
        throw markUnique(err);
      }
    },
    async run(sql, params) {
      try {
        const r = exec(sql, params);
        return { changes: r.changes || r.rows.length, rows: r.rows };
      } catch (err) {
        throw markUnique(err);
      }
    },
    // جلسة migrations: ملف SQLite محلي لنسخة وحدة — ما يحتاج قفل
    async migrationSession(fn) {
      return fn({
        exec: async (sql) => db.exec(sql),
        query: async (sql, params = []) => db.prepare(sql).all(...params),
        run: async (sql, params = []) => db.prepare(sql).run(...params)
      });
    },
    // نسخة كاملة من القاعدة كـBuffer (للنسخ الاحتياطي السحابي — services/stateBackup.js)
    serialize() {
      return db.serialize();
    },
    async close() {
      db.close();
    }
  };
}

// ---------------- PostgreSQL ----------------
function toPgParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Render: الرابط الداخلي (host بدون نقاط، مثل dpg-xxxx-a) ما يدعم SSL، والخارجي يتطلبه
function pgSslFor(url) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') return { rejectUnauthorized: false };
  try {
    const host = new URL(url).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || !host.includes('.')) return false;
  } catch (_) {
    return false;
  }
  return { rejectUnauthorized: false };
}

function createPostgres(url) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url, ssl: pgSslFor(url), max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  // أخطاء الاتصالات الخاملة (مثلاً إعادة تشغيل قاعدة البيانات) — نسجلها بدل ما تطيّح العملية
  pool.on('error', (err) => logger.error('PostgreSQL pool error', { error: err }));

  return {
    dialect: 'postgres',
    async query(sql, params = []) {
      try {
        return (await pool.query(toPgParams(sql), params)).rows;
      } catch (err) {
        throw markUnique(err);
      }
    },
    async run(sql, params = []) {
      try {
        const r = await pool.query(toPgParams(sql), params);
        return { changes: r.rowCount || 0, rows: r.rows || [] };
      } catch (err) {
        throw markUnique(err);
      }
    },
    // جلسة migrations على اتصال واحد مخصّص (BEGIN/COMMIT/ROLLBACK لازم تكون
    // على نفس الاتصال) + قفل استشاري يمنع نسختين تطبّقان نفس الـmigration.
    async migrationSession(fn) {
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('SELECT pg_advisory_lock($1)', [PG_LOCK_KEY]);
        return await fn({
          exec: (sql) => client.query(sql),
          query: async (sql, params = []) => (await client.query(toPgParams(sql), params)).rows,
          run: (sql, params = []) => client.query(toPgParams(sql), params)
        });
      } catch (err) {
        broken = true;
        throw err;
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [PG_LOCK_KEY]).catch(() => {});
        client.release(broken); // اتصال فشل فيه شي → يُتخلّص منه بدل ما يرجع للـpool
      }
    },
    async close() {
      await pool.end();
    }
  };
}

// ---------------- Migrations ----------------
function dialectSql(sql, dialect) {
  const pk = dialect === 'postgres' ? 'BIGSERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  return sql.replace(/__PK__/g, pk).replace(/__BIGINT__/g, 'BIGINT');
}

async function migrate(driver) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  return driver.migrationSession(async (session) => {
    await session.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)');
    const done = new Set((await session.query('SELECT version FROM schema_migrations')).map((r) => r.version));
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = dialectSql(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'), driver.dialect);
      // كل migration كاملة داخل transaction على نفس الاتصال: تنطبق كلها أو ولا شي
      await session.exec('BEGIN');
      try {
        await session.exec(sql);
        await session.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [file, Date.now()]);
        await session.exec('COMMIT');
      } catch (err) {
        await session.exec('ROLLBACK').catch(() => {});
        throw err;
      }
      applied.push(file);
    }
    return applied;
  });
}

// ---------------- الواجهة العامة ----------------
let driver = null;
let initError = null;
// مستمعين لكل كتابة ناجحة (يستخدمها النسخ الاحتياطي لـSQLite)
const writeListeners = new Set();
function notifyWrite() {
  for (const fn of writeListeners) {
    try {
      fn();
    } catch (_) {
      /* المستمع ما يوقف الكتابة */
    }
  }
}

async function init({ databaseUrl, sqlitePath } = {}) {
  if (driver) return driver;
  let d = null;
  try {
    d = databaseUrl ? createPostgres(databaseUrl) : createSqlite(sqlitePath || './data/bot.sqlite');
    const applied = await migrate(d);
    driver = d;
    initError = null;
    logger.info('✅ قاعدة بيانات البوت جاهزة', { dialect: d.dialect, migrationsApplied: applied });
    return d;
  } catch (err) {
    if (d) await d.close().catch(() => {}); // ما نترك اتصالات/ملف مفتوح بعد فشل الإقلاع
    initError = err;
    logger.error('❌ تعذّر تشغيل قاعدة بيانات البوت — أوامر الإدارة والتكتات بترد برسالة واضحة لين تنحل', { error: err });
    throw err;
  }
}

function get() {
  if (!driver) throw new DbUnavailableError(initError);
  return driver;
}

async function close() {
  if (driver) await driver.close();
  driver = null;
}

module.exports = {
  init,
  get,
  close,
  isReady: () => !!driver,
  dialect: () => (driver ? driver.dialect : null),
  query: (sql, params) => get().query(sql, params),
  run: async (sql, params) => {
    const r = await get().run(sql, params);
    if (r && r.changes > 0) notifyWrite();
    return r;
  },
  onWrite: (fn) => {
    writeListeners.add(fn);
    return () => writeListeners.delete(fn);
  },
  serialize: () => (driver && typeof driver.serialize === 'function' ? driver.serialize() : null),
  DbUnavailableError,
  _internal: { toPgParams, dialectSql, pgSslFor, createSqlite, createPostgres, migrate }
};
