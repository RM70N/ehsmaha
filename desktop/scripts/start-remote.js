'use strict';

/** يشغّل التطبيق في وضع "remote" (يحمّل ehsmaha.com الحيّ مباشرة بدل النسخة
 * المضمّنة) — مفيد للمقارنة السريعة أثناء التطوير. الاستخدام العادي للتطبيق
 * (npm start) يستخدم المحتوى المضمّن + السيرفر المحلي.
 */

const path = require('path');
const { spawn } = require('child_process');
const electronPath = require('electron');

const child = spawn(electronPath, [path.join(__dirname, '..'), '--remote'], {
  stdio: 'inherit',
  env: { ...process.env, EHSMAHA_MODE: 'remote' },
});

child.on('exit', (code) => process.exit(code == null ? 0 : code));
