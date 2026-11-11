// يستخرج MOD_SETTINGS_SCHEMA من index.html (قراءة فقط) إلى لقطة JSON يستخدمها الخادم.
// الاستخدام: node scripts/extract-site-schema.js [مسار index.html]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(process.argv[2] || path.resolve(root, '..', 'index.html'), 'utf8');
const start = src.indexOf('const MOD_SETTINGS_SCHEMA = {');
if (start < 0) throw new Error('MOD_SETTINGS_SCHEMA غير موجود');
const end = src.indexOf('\n};', start);
const literal = src.slice(start + 'const MOD_SETTINGS_SCHEMA = '.length, end + 2);
const schema = vm.runInNewContext('(' + literal + ')', Object.create(null), { timeout: 1000 });
// بطاقات الألعاب (data-tag) وأسماؤها — مفاتيح مستندات gameBadges/gameOrder في الموقع
const cards = [];
const seen = new Set();
for (const m of src.matchAll(/<[a-z]+[^>]*class="[^"]*\bgcard\b[^"]*"[^>]*data-tag="([^"]+)"/g)) {
  if (seen.has(m[1])) continue; seen.add(m[1]);
  const after = src.slice(m.index, m.index + 3000);
  const nm = /gcard-name">([^<]+)</.exec(after);
  cards.push({ tag: m[1], name: nm ? nm[1].trim() : m[1] });
}
// إطارات الموقع المدمجة (FRAMES_CATALOG) — المعرّف والاسم فقط (بدون صور)
const fi = src.indexOf('const FRAMES_CATALOG = [');
const frames = fi < 0 ? [] : [...src.slice(fi, src.indexOf('\n];', fi)).matchAll(/\bid:\s*'([^']+)'\s*,\s*name:\s*'([^']+)'/g)].map((m) => ({ id: m[1], name: m[2] }));
const out = path.join(root, 'server', 'data', 'mod-settings-schema.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ extractedFrom: 'index.html#MOD_SETTINGS_SCHEMA + .gcard[data-tag]', games: schema, cards, frames, badges: ['new', 'update', 'none', 'maintenance'] }, null, 1));
console.log('frames:', frames.length, 'cards:', cards.length, 'games:', Object.keys(schema).length, '→', out);
