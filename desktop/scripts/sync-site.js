'use strict';

/**
 * يجمّع الموقع كاملاً (نفس ملفات pages.yml) إلى desktop/site/ قبل كل تشغيل أو
 * بناء، ويولّد content-manifest.json للنسخة المضمّنة. لا يعدّل أي حرف من كود
 * الموقع — نسخ فقط. مصدر الحقيقة يبقى ملفات الموقع بجذر المستودع.
 */

const fs = require('fs');
const path = require('path');
const { ROOT_FILES, DIRS } = require('./site-files');
const { buildManifest, MANIFEST_NAME } = require('./site-manifest');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SITE_DIR = path.join(__dirname, '..', 'site');

function main() {
  if (!fs.existsSync(path.join(REPO_ROOT, 'index.html'))) {
    console.error('[sync-site] لم يُعثر على index.html بجذر المستودع: ' + REPO_ROOT);
    process.exit(1);
  }

  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });

  const missing = [];
  for (const f of ROOT_FILES) {
    const from = path.join(REPO_ROOT, f);
    if (!fs.existsSync(from)) { missing.push(f); continue; }
    fs.copyFileSync(from, path.join(SITE_DIR, f));
  }
  for (const d of DIRS) {
    const from = path.join(REPO_ROOT, d);
    if (!fs.existsSync(from)) { missing.push(d + '/'); continue; }
    fs.cpSync(from, path.join(SITE_DIR, d), { recursive: true });
  }
  if (missing.length) {
    console.error('[sync-site] ملفات مفقودة من المستودع: ' + missing.join(', '));
    process.exit(1);
  }

  const manifest = buildManifest(SITE_DIR);
  fs.writeFileSync(path.join(SITE_DIR, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
  console.log('[sync-site] تم تجميع ' + manifest.files.length + ' ملف | الإصدار ' + manifest.version);
}

main();
