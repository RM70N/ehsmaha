'use strict';

/**
 * قائمة ملفات الموقع المنشورة — مصدر واحد للحقيقة لحزمة التطبيق.
 * يجب أن تطابق خطوة "Assemble site" في .github/workflows/pages.yml
 * (اختبار test/site-files.test.js يتحقق من التطابق تلقائياً).
 */

const ROOT_FILES = [
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
  'ws-diag.html',
  'desktop-auth.html',
  'windows-app.html',
  'link-device.html',
  'desktop-link.js',
  'desktop-app-ui.js',
  'ehsemha-responsive-fixes.css',
  'code-race-banner.png',
  'discord-logo.png',
];

const DIRS = [
  'revival-system',
  'dhmx-welcome',
  'som3h-10k',
  'blhh-5k',
  'c7-welcome',
  'owner-studio',
  'ops',
  'subathon',
  'about-experience/previews-sq',
  'about-experience/posters',
  'windows-app',
  'windows-launch-campaign',
];

module.exports = { ROOT_FILES, DIRS };
