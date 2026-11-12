'use strict';
// ينقل بيانات البوت من ملف SQLite إلى PostgreSQL. ملف SQLite يُفتح للقراءة فقط ولا يُعدَّل أبداً.
// الاستعمال (من مجلد البوت أو بتحديد BOT_ROOT):
//   BOT_ROOT=/home/container SQLITE_PATH=/home/container/data/bot.sqlite DATABASE_URL=postgres://... node migrate-bot-sqlite-to-pg.cjs
// آمن لإعادة التشغيل (INSERT ... ON CONFLICT DO NOTHING) ويطبع أعداد الصفوف لكل جدول للتحقق.
const path = require('node:path');
const root = path.resolve(process.env.BOT_ROOT || process.cwd());
const req = (m) => require(require.resolve(m, { paths: [root] }));
const Database = req('better-sqlite3');
const { Pool } = req('pg');

(async () => {
  const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL مطلوب');
  const file = path.resolve(process.env.SQLITE_PATH || path.join(root, 'data', 'bot.sqlite'));
  const botDb = require(path.join(root, 'database', 'botDb.js'));
  await botDb.init({ databaseUrl: url }); // يطبّق migrations البوت نفسها على PostgreSQL (لأن DATABASE_URL مضبوط)
  if (botDb.dialect() !== 'postgres') throw new Error('الوجهة ليست PostgreSQL');
  await botDb.close();

  const sl = new Database(file, { readonly: true, fileMustExist: true });
  const ssl = /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false };
  const pool = new Pool({ connectionString: url, ssl, max: 2 });
  const tables = sl.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name);
  const pgTables = new Set((await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name));
  let bad = 0;
  for (const t of tables) {
    if (!pgTables.has(t)) { console.log(`- ${t}: غير موجود في PostgreSQL (تخطي)`); continue; }
    if (/migration/i.test(t)) { console.log(`- ${t}: جدول migrations (تخطي)`); continue; }
    const cols = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1", [t])).rows.map((r) => r.column_name);
    const rows = sl.prepare(`SELECT * FROM "${t}"`).all();
    let inserted = 0;
    for (const r of rows) {
      const ks = Object.keys(r).filter((k) => cols.includes(k)); if (!ks.length) continue;
      const res = await pool.query(`INSERT INTO "${t}" (${ks.map((k) => `"${k}"`).join(',')}) VALUES (${ks.map((_, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, ks.map((k) => r[k]));
      inserted += res.rowCount;
    }
    if (cols.includes('id')) { try { await pool.query(`SELECT setval(pg_get_serial_sequence('"${t}"','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM "${t}"),1))`); } catch { /* ليس تسلسلياً */ } }
    const pgCount = Number((await pool.query(`SELECT COUNT(*)::int c FROM "${t}"`)).rows[0].c);
    const ok = pgCount >= rows.length; if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'ERR'} ${t}: sqlite=${rows.length} postgres=${pgCount} (أُدرج الآن ${inserted})`);
  }
  await pool.end(); sl.close();
  if (bad) { console.error(`فشل التحقق في ${bad} جدول`); process.exit(2); }
  console.log('اكتمل النقل والتحقق بنجاح.');
})().catch((e) => { console.error('فشل النقل:', e.message); process.exit(1); });
