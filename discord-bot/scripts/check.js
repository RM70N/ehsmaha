'use strict';

// فحص سريع قبل النشر (npm run check) — ما يحتاج توكن ولا اتصال:
//   • كل ملفات /commands تتحمّل بدون أخطاء
//   • أسماء/أوصاف الأوامر والخيارات ضمن حدود Discord
//   • ما فيه تكرار بالأسماء أو بادئات الأزرار
// يطبع قائمة الأوامر اللي بتنسجل بـdeploy-commands.

const { loadCommands } = require('../utils/commandLoader');

const NAME_RE = /^[-_\p{L}\p{N}\p{sc=Deva}\p{sc=Thai}]{1,32}$/u;
const problems = [];

function checkName(where, name) {
  if (!NAME_RE.test(name)) problems.push(`${where}: الاسم "${name}" غير مقبول عند Discord`);
  if (name !== name.toLowerCase()) problems.push(`${where}: الاسم "${name}" لازم يكون بأحرف صغيرة`);
}
function checkDesc(where, desc) {
  if (!desc || desc.length > 100) problems.push(`${where}: الوصف لازم يكون بين 1 و100 حرف (الحالي ${desc ? desc.length : 0})`);
}

let loaded;
try {
  loaded = loadCommands();
} catch (err) {
  console.error('❌ فشل تحميل الأوامر:', err.message);
  process.exit(1);
}

for (const def of loaded.definitions) {
  checkName(`/${def.name}`, def.name);
  checkDesc(`/${def.name}`, def.description);
  for (const opt of def.options || []) {
    checkName(`/${def.name} ${opt.name}`, opt.name);
    checkDesc(`/${def.name} ${opt.name}`, opt.description);
    for (const ch of opt.choices || []) {
      if (!ch.name || ch.name.length > 100) problems.push(`/${def.name} ${opt.name}: اختيار "${ch.name}" طوله غير صالح`);
    }
  }
}
if (loaded.definitions.length > 100) problems.push('عدد الأوامر أكثر من 100 (حد Discord)');

console.log(`الأوامر (${loaded.definitions.length}):`);
for (const def of loaded.definitions) {
  const opts = (def.options || []).map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`)).join(' ');
  console.log(`  /${def.name} ${opts}`.trimEnd() + `  — ${def.description}`);
}
console.log(`بادئات الأزرار: ${[...loaded.buttons.keys()].join(', ')}`);

if (problems.length) {
  console.error('\n❌ مشاكل:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('\n✅ كل شي سليم');
