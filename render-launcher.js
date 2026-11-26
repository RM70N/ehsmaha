'use strict';
// مُشغِّل لخدمة Render عندما يكون Root Directory = جذر المستودع (الافتراضي).
//   BRIDGE_APP=relay  (الافتراضي) → tiktok-relay  (الجسر الأساسي للموقع، بلا مفتاح Euler)
//   BRIDGE_APP=server             → tiktok-server (القديم/الاحتياطي، Euler + مركز الاتصالات)
// الأمر "install" يثبّت اعتماديات التطبيق المختار فقط (يوفّر وقت البناء)، و"start" يشغّله بنفس المعالج.
const { spawnSync, spawn } = require('child_process');
const path = require('path');
const APPS = { relay: 'tiktok-relay', server: 'tiktok-server' };
const key = String(process.env.BRIDGE_APP || 'relay').trim().toLowerCase();
const dir = APPS[key];
if (!dir) { console.error('BRIDGE_APP غير صالح: "' + key + '" — القيم المسموحة: relay | server'); process.exit(1); }
const cwd = path.join(__dirname, dir);
const cmd = process.argv[2];
if (cmd === 'install') {
  // Render يعمل npm install بالجذر ثم هذا السكربت؛ نتجنّب الحلقة إن كان الاستدعاء من داخل التثبيت الفرعي
  if (process.env.EHS_LAUNCHER_NESTED) process.exit(0);
  const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd, stdio: 'inherit', env: Object.assign({}, process.env, { EHS_LAUNCHER_NESTED: '1' }), shell: process.platform === 'win32' });
  process.exit(r.status === null ? 1 : r.status);
} else if (cmd === 'start') {
  const child = spawn('npm', ['start'], { cwd, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  const fwd = (sig) => () => { try { child.kill(sig); } catch (e) { /* */ } };
  process.on('SIGTERM', fwd('SIGTERM')); process.on('SIGINT', fwd('SIGINT'));
  child.on('exit', (code, sig) => process.exit(code === null ? (sig ? 1 : 0) : code));
} else { console.error('usage: node render-launcher.js install|start'); process.exit(1); }
