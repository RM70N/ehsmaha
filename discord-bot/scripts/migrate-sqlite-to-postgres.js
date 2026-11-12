#!/usr/bin/env node
'use strict';

// ينقل بيانات قاعدة البوت من SQLite (محلي) إلى PostgreSQL — آمن للتشغيل أكثر من مرة (idempotent):
// الصفوف الموجودة ما تتكرر (ON CONFLICT DO NOTHING) ولا يُحذف شي من أي طرف. يطبّق migrations على PostgreSQL أولاً.
//
// الاستخدام:
//   DATABASE_URL=postgres://... node scripts/migrate-sqlite-to-postgres.js [--sqlite ./data/bot.sqlite] [--dry]
// يطبع عدد الصفوف لكل جدول: SQLite · PostgreSQL قبل · PostgreSQL بعد.

const fs = require('node:fs');
const path = require('node:path');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const quote = (id) => `"${String(id).replace(/"/g, '""')}"`;

async function main() {
  const sqlitePath = path.resolve(String(arg('sqlite', process.env.SQLITE_PATH || './data/bot.sqlite')));
  const pgUrl = process.env.DATABASE_URL;
  const dry = arg('dry', false) === true;
  if (!pgUrl) throw new Error('DATABASE_URL (رابط PostgreSQL) مطلوب');
  if (!fs.existsSync(sqlitePath)) throw new Error(`ملف SQLite غير موجود: ${sqlitePath}`);

  // 1) تجهيز PostgreSQL (migrations)
  const botDb = require('../database/botDb');
  await botDb.init({ databaseUrl: pgUrl });
  await botDb.close();

  const Database = require('better-sqlite3');
  const { Pool } = require('pg');
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({ connectionString: pgUrl, ssl: botDb._internal.pgSslFor(pgUrl), max: 2 });

  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name")
    .all()
    .map((r) => r.name);
  const report = [];
  try {
    for (const table of tables) {
      const pgCols = (
        await pool.query('SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1', [table])
      ).rows.map((r) => r.column_name);
      if (!pgCols.length) {
        report.push({ table, sqlite: sqlite.prepare(`SELECT COUNT(*) AS n FROM ${quote(table)}`).get().n, before: null, after: null, note: 'غير موجود بـPostgreSQL — تخطّي' });
        continue;
      }
      const cols = sqlite
        .prepare(`PRAGMA table_info(${quote(table)})`)
        .all()
        .map((c) => c.name)
        .filter((c) => pgCols.includes(c));
      const rows = sqlite.prepare(`SELECT ${cols.map(quote).join(', ')} FROM ${quote(table)}`).all();
      const before = Number((await pool.query(`SELECT COUNT(*) AS n FROM ${quote(table)}`)).rows[0].n);
      if (!dry && rows.length) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const placeholders = cols.map((_, i) => '$' + (i + 1)).join(', ');
          const sql = `INSERT INTO ${quote(table)} (${cols.map(quote).join(', ')}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;
          for (const r of rows) await client.query(sql, cols.map((c) => (r[c] === undefined ? null : r[c])));
          if (cols.includes('id')) {
            // تزامن العدّاد التسلسلي بعد إدخال معرّفات صريحة
            await client
              .query(`SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${quote(table)}), 1))`, [table])
              .catch(() => {});
          }
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw new Error(`فشل نقل الجدول ${table}: ${err.message}`);
        } finally {
          client.release();
        }
      }
      const after = Number((await pool.query(`SELECT COUNT(*) AS n FROM ${quote(table)}`)).rows[0].n);
      report.push({ table, sqlite: rows.length, before, after });
    }
  } finally {
    sqlite.close();
    await pool.end();
  }

  console.log(dry ? '— تجربة (بدون كتابة) —' : '— تم النقل —');
  console.log('الجدول'.padEnd(34), 'SQLite'.padStart(8), 'PG قبل'.padStart(8), 'PG بعد'.padStart(8));
  for (const r of report) {
    console.log(r.table.padEnd(34), String(r.sqlite).padStart(8), String(r.before ?? '-').padStart(8), String(r.after ?? '-').padStart(8), r.note ? `  (${r.note})` : '');
  }
  return report;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ ' + err.message);
    process.exit(1);
  });
}
module.exports = { main };
