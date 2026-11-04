'use strict';
/** يتحقق من مخرجات البناء: ehsmaha-setup.exe + blockmap + latest.yml (إصدار + sha512 + حجم). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pkg = require('../package.json');

const dist = path.join(__dirname, '..', 'dist');
const need = ['ehsmaha-setup.exe', 'ehsmaha-setup.exe.blockmap', 'latest.yml'];
let bad = 0;
for (const n of need) if (!fs.existsSync(path.join(dist, n))) { console.error('مفقود: dist/' + n); bad++; }
if (bad) process.exit(1);

const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
const get = (k) => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'm').exec(yml); return m && m[1].trim().replace(/^['"]|['"]$/g, ''); };
const exe = fs.readFileSync(path.join(dist, 'ehsmaha-setup.exe'));
const sha = crypto.createHash('sha512').update(exe).digest('base64');
if (get('version') !== pkg.version) { console.error('latest.yml version ≠ package.json'); bad++; }
if (get('path') !== 'ehsmaha-setup.exe') { console.error('latest.yml path غير متوقع: ' + get('path')); bad++; }
if (get('sha512') !== sha) { console.error('sha512 في latest.yml لا يطابق الملف'); bad++; }
if (exe.length < 40 * 1024 * 1024 && exe.length < 1024 * 1024) { console.error('حجم الـEXE مشبوه: ' + exe.length); bad++; }
if (exe.slice(0, 2).toString() !== 'MZ') { console.error('الملف ليس تنفيذياً لويندوز (MZ)'); bad++; }
if (bad) process.exit(1);
console.log('verify-dist: OK — ' + pkg.version + ' | ' + (exe.length / 1048576).toFixed(1) + ' MB | sha512 مطابق');
