'use strict';

/**
 * قائمة ملفات الموقع المنشورة — مصدر واحد للحقيقة لحزمة التطبيق.
 * يجب أن تطابق خطوة "Assemble site" في .github/workflows/pages.yml
 * (اختبار test/site-files.test.js يتحقق من التطابق تلقائياً).
 */

const ROOT_FILES = [
  'ehsemha-perf.js',
  'fs-failover.js',
  'ehsemha-perf.css',
  'index.html',
  'roulette3d.html',
  'bomb3d.html',
  'tug3d.html',
  'xo.html',
  'ektheb-alay.html',
  'almeezan3d.html',
  'wesh-taghayar.html',
  'hallaha-qabli.html',
  'code-race.html',
  'callcenter3d.html',
  'la-tatayeh3d.html',
  'harf-alnajat3d.html',
  'space-odyssey.html',
  'space-odyssey-integration.js',
  'findball3d.html',
  'findball3d-integration.js',
  'ws-diag.html',
  'desktop-auth.html',
  'windows-app.html',
  'link-device.html',
  'desktop-link.js',
  'desktop-app-ui.js',
  'ehsemha-responsive-fixes.css',
  'ehsmaha-stream-header.css',
  'ehsmaha-stream-header.js',
  'ehsmaha-stream-header-glue.js',
  'code-race-banner.png',
  'discord-logo.png',
  'favicon.ico',
];

const DIRS = [
  'revival-system',
  'dhmx-welcome',
  'som3h-10k',
  'blhh-5k',
  'c7-welcome',
  'batmish',
  'owner-studio',
  'admin-center',
  'ops',
  'subathon',
  'about-experience/previews-sq',
  'about-experience/posters',
  'windows-app',
  'windows-launch-campaign',
  'assets',
  'jam3atna',
];

module.exports = { ROOT_FILES, DIRS };
