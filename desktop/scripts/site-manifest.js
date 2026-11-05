'use strict';

/**
 * Content Manifest للموقع: قائمة كل الملفات مع الحجم وبصمة SHA-256، وإصدار
 * للمحتوى كله (بصمة مجمّعة). يُستخدم في ثلاثة أماكن بنفس المنطق:
 *   1) خطوة بناء الموقع (pages.yml) لنشر content-manifest.json بجانب الموقع.
 *   2) sync-site.js لتوليد manifest للحزمة المضمّنة بالتطبيق.
 *   3) اختبارات التطبيق.
 *
 * الاستخدام: node scripts/site-manifest.js <مجلد_الموقع> [--out <ملف>]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MANIFEST_NAME = 'content-manifest.json';
const SCHEMA = 1;
// ملفات لا تدخل المحتوى: إعدادات الاستضافة، ونسخة 404 (نسخة من index.html)، والـmanifest نفسه.
const EXCLUDE = new Set(['CNAME', '.nojekyll', '404.html', MANIFEST_NAME]);

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function toPosix(p) { return p.split(path.sep).join('/'); }

function listFiles(root, rel = '') {
  const out = [];
  const abs = path.join(root, rel);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const childRel = rel ? path.join(rel, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, childRel));
    else if (entry.isFile() && !EXCLUDE.has(toPosix(childRel))) out.push(toPosix(childRel));
  }
  return out.sort();
}

function computeVersion(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(f.path + '\0' + f.sha256 + '\n');
  return h.digest('hex').slice(0, 16);
}

function buildManifest(root) {
  const files = listFiles(root).map((p) => {
    const abs = path.join(root, p);
    return { path: p, size: fs.statSync(abs).size, sha256: sha256File(abs) };
  });
  return {
    schema: SCHEMA,
    version: computeVersion(files),
    generatedAt: new Date().toISOString(),
    files,
  };
}

/** يتحقق أن مسار ملف داخل manifest آمن (لا خروج من المجلد، لا مسارات مطلقة). */
function isSafeRelPath(p) {
  if (typeof p !== 'string' || !p || p.length > 300) return false;
  if (p.startsWith('/') || p.includes('\\') || p.includes('\0')) return false;
  return p.split('/').every((seg) => seg && seg !== '.' && seg !== '..');
}

/** تحقق بنيوي من manifest قادم من الشبكة (غير موثوق). */
function validateManifest(m) {
  if (!m || typeof m !== 'object') return 'manifest غير صالح';
  if (m.schema !== SCHEMA) return 'نسخة schema غير مدعومة';
  if (typeof m.version !== 'string' || !/^[a-f0-9]{16}$/.test(m.version)) return 'رقم إصدار غير صالح';
  if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > 5000) return 'قائمة ملفات غير صالحة';
  const seen = new Set();
  for (const f of m.files) {
    if (!f || !isSafeRelPath(f.path)) return 'مسار ملف غير آمن';
    if (seen.has(f.path)) return 'مسار مكرر';
    seen.add(f.path);
    if (typeof f.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(f.sha256)) return 'بصمة غير صالحة';
    if (!Number.isInteger(f.size) || f.size < 0 || f.size > 60 * 1024 * 1024) return 'حجم غير صالح';
  }
  if (!seen.has('index.html')) return 'index.html غير موجود بالـmanifest';
  if (computeVersion(m.files) !== m.version) return 'الإصدار لا يطابق بصمات الملفات';
  return null;
}

module.exports = { MANIFEST_NAME, SCHEMA, listFiles, buildManifest, computeVersion, validateManifest, isSafeRelPath, sha256File };

if (require.main === module) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const outFile = outIdx > -1 ? args[outIdx + 1] : null;
  const dir = args.filter((a, i) => a !== '--out' && (outIdx < 0 || i !== outIdx + 1))[0];
  if (!dir || !fs.existsSync(dir)) {
    console.error('usage: node site-manifest.js <site-dir> [--out file]');
    process.exit(1);
  }
  const manifest = buildManifest(dir);
  const target = outFile || path.join(dir, MANIFEST_NAME);
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
  console.log('[manifest] version=' + manifest.version + ' files=' + manifest.files.length + ' → ' + target);
}
