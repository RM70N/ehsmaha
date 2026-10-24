#!/usr/bin/env node
'use strict';
// يزامن وحدات «انصب علي» المشتركة (المحتوى/القواعد/الجلسة/عقل التدريب) من tiktok-server/lib/cc إلى داخل callcenter3d.html حرفياً،
// عشان اللعبة (وضع التدريب) والخادم (المرجع الرسمي) يشتغلون بنفس المنطق. بدون --write يفحص فقط (يرجع 1 لو فيه فرق).
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const HTML = path.join(ROOT, process.env.CC_HTML || 'callcenter3d.html');
const MODS = ['cc-content', 'cc-rules', 'cc-session', 'cc-local-brain'];
const CORE_MARK = '/* احسمها | مركز الاتصالات — النواة';
let html = fs.readFileSync(HTML, 'utf8');
const src = MODS.map((m) => fs.readFileSync(path.join(ROOT, 'tiktok-server/lib/cc', m + '.js'), 'utf8'));
const first = (t) => t.split('\n')[0];
const starts = src.map((t) => html.indexOf(first(t)));
if (starts.some((i) => i < 0)) { console.error('تعذر إيجاد وحدة داخل اللعبة'); process.exit(2); }
const coreAt = html.indexOf(CORE_MARK);
if (coreAt < 0) { console.error('تعذر إيجاد بداية النواة'); process.exit(2); }
const ends = starts.slice(1).concat([coreAt]);
let diff = 0, out = html;
for (let i = MODS.length - 1; i >= 0; i--) {
  const oldBlock = out.slice(starts[i], ends[i]);
  const tail = oldBlock.match(/\s*$/)[0];
  const next = src[i].replace(/\s+$/, '') + tail;
  if (oldBlock !== next) { diff++; out = out.slice(0, starts[i]) + next + out.slice(ends[i]); }
}
if (process.argv.includes('--write')) { if (diff) fs.writeFileSync(HTML, out); console.log(diff ? 'تمت مزامنة ' + diff + ' وحدة' : 'كل الوحدات متطابقة'); }
else { console.log(diff ? diff + ' وحدة مختلفة بين الخادم واللعبة' : 'كل الوحدات متطابقة'); process.exit(diff ? 1 : 0); }
