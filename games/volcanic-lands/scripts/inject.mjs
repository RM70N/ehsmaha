// يحقن الحزمة المبنية داخل index.html بين علامتين ثابتتين.
// الموقع ملف واحد بلا خطوة بناء، فالمنطق يُضمَّن كـ<script> بدل ملف خارجي —
// وبهذا يبقى نموذج النشر كما هو تماماً.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '../..');
const indexPath = resolve(repoRoot, 'index.html');
const bundlePath = resolve(root, 'dist/volcanic-lands.logic.js');

const BEGIN = '<!-- BEGIN volcanic-lands:logic (مولَّد آلياً — لا تعدّله يدوياً) -->';
const END = '<!-- END volcanic-lands:logic -->';

const bundle = await readFile(bundlePath, 'utf8');
let html = await readFile(indexPath, 'utf8');

const block = `${BEGIN}\n<script>\n${bundle}\n</script>\n${END}`;

const start = html.indexOf(BEGIN);
const end = html.indexOf(END);

if (start > -1 && end > start) {
  html = html.slice(0, start) + block + html.slice(end + END.length);
  console.log('♻️  حُدِّثت الكتلة الموجودة داخل index.html');
} else {
  const anchor = html.lastIndexOf('</body>');
  if (anchor === -1) throw new Error('لم يُعثر على </body> في index.html');
  html = html.slice(0, anchor) + block + '\n' + html.slice(anchor);
  console.log('➕ أُضيفت الكتلة قبل </body> في index.html');
}

await writeFile(indexPath, html, 'utf8');
console.log(`✅ index.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
