'use strict';
/** يتأكد أن تاج الإصدار (vX.Y.Z) يطابق desktop/package.json. الاستخدام: node verify-version.js [tag] */
const pkg = require('../package.json');
const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
if (!tag) { console.log('verify-version: لا يوجد تاج — تخطّي (version=' + pkg.version + ')'); process.exit(0); }
const m = /^v(\d+\.\d+\.\d+)$/.exec(tag);
if (!m) { console.error('تاج غير صالح: ' + tag); process.exit(1); }
if (m[1] !== pkg.version) { console.error('عدم تطابق: التاج ' + m[1] + ' ≠ package.json ' + pkg.version); process.exit(1); }
console.log('verify-version: OK ' + pkg.version);
