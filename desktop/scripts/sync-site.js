'use strict';

/**
 * ينسخ موقع "احسمها" (index.html من جذر المستودع) إلى desktop/site/ قبل كل
 * تشغيل أو بناء — هذا هو المحتوى "المضمّن" الذي يُشحن داخل حزمة التثبيت.
 *
 * لا يعدّل أي حرف من كود الموقع؛ نسخ فقط. مصدر الحقيقة يبقى الملف الأصلي في
 * جذر المستودع (../index.html) — أي تحديث للموقع هناك ينعكس تلقائياً هنا
 * بمجرد إعادة تشغيل هذا السكربت (يحدث تلقائياً ضمن npm run prepare-assets).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SOURCE_INDEX = path.join(REPO_ROOT, 'index.html');
const SITE_DIR = path.join(__dirname, '..', 'site');
const TARGET_INDEX = path.join(SITE_DIR, 'index.html');

if (!fs.existsSync(SOURCE_INDEX)) {
  console.error('[sync-site] لم يُعثر على ' + SOURCE_INDEX);
  console.error('[sync-site] ضع ملف index.html الخاص بموقع ehsmaha.com في جذر المستودع.');
  process.exit(1);
}

fs.mkdirSync(SITE_DIR, { recursive: true });
fs.copyFileSync(SOURCE_INDEX, TARGET_INDEX);

// معاينات صفحة «من نحن» (previews-sq + posters فقط، بدون مصادر البناء)
const AE_SRC = path.join(REPO_ROOT, 'about-experience');
if (fs.existsSync(AE_SRC)) {
  ['previews-sq', 'posters'].forEach(function (d) {
    const from = path.join(AE_SRC, d);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(SITE_DIR, 'about-experience', d), { recursive: true });
  });
}

const stat = fs.statSync(TARGET_INDEX);
console.log('[sync-site] تم نسخ index.html إلى desktop/site/ (' + Math.round(stat.size / 1024) + ' KB)');
