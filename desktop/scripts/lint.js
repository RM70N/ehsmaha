'use strict';
/** فحص ثابت بلا اعتماديات: صياغة كل ملفات JS + قواعد أمان ممنوعة بكود التطبيق. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIRS = ['src', 'scripts', 'renderer', 'test'];
const files = ['main.js', 'preload.js'];
(function walk(rel) {
  for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) walk(r); else if (e.name.endsWith('.js')) files.push(r);
  }
})('.' === '.' ? '' : '');
const targets = files.filter((f) => f === 'main.js' || f === 'preload.js' || DIRS.some((d) => f.startsWith(d + path.sep)))
  .filter((f) => !f.startsWith('node_modules') && !f.startsWith('site') && !f.startsWith('dist'));

let failed = 0;
for (const f of [...new Set(targets)]) {
  try { execFileSync(process.execPath, ['--check', path.join(ROOT, f)], { stdio: 'pipe' }); }
  catch (e) { failed++; console.error('SYNTAX', f, String(e.stderr || e.message).split('\n').slice(0, 3).join(' | ')); }
}

const FORBIDDEN = [
  [/webSecurity\s*:\s*false/, 'webSecurity:false ممنوع'],
  [/nodeIntegration\s*:\s*true/, 'nodeIntegration:true ممنوع'],
  [/contextIsolation\s*:\s*false/, 'contextIsolation:false ممنوع'],
  [/sandbox\s*:\s*false/, 'sandbox:false ممنوع'],
  [/allowRunningInsecureContent\s*:\s*true/, 'allowRunningInsecureContent ممنوع'],
  [/setCertificateVerifyProc|ignore-certificate-errors/, 'تعطيل التحقق من الشهادات ممنوع'],
  [/enableRemoteModule/, 'remote module ممنوع'],
];
const APP_FILES = targets.filter((f) => !f.startsWith('test') && !f.startsWith('scripts'));
for (const f of APP_FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  src.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const [re, msg] of FORBIDDEN) if (re.test(line)) { failed++; console.error('SECURITY', f + ':' + (i + 1), msg); }
  });
}
// preload بصندوق رمل: لا require لوحدات محلية
const pre = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
if (/require\(['"]\.{1,2}\//.test(pre)) { failed++; console.error('preload يجب ألا يستورد ملفات محلية (sandbox)'); }

if (failed) { console.error('lint: فشل (' + failed + ')'); process.exit(1); }
console.log('lint: OK (' + new Set(targets).size + ' ملف)');
