// يتحقق أن space-odyssey.html مطابق للملف الأصلي بايت-ببايت.  node tests/space-odyssey/verify-integrity.js "<مسار الملف الأصلي>"
const fs = require('fs'), crypto = require('crypto'), path = require('path');
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const EXPECTED = 'dd86a198b5ca905f1025f315b64fdc109edc3356793bd2de7352a07f59c35f45';
const integrated = path.join(__dirname, '..', '..', 'space-odyssey.html'), original = process.argv[2];
const b = sha(integrated); console.log('integrated:', b);
if (original) { const a = sha(original); console.log('original  :', a); if (a !== b) { console.error('Game file changed during integration!'); process.exit(1); } }
if (b !== EXPECTED) { console.error('Game file differs from the recorded original SHA-256!'); process.exit(1); }
console.log('Game file is identical.');
