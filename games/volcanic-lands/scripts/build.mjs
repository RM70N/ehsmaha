// يبني منطق اللعبة (TypeScript) لملف JS واحد مستقل تماماً — بلا وحدات ولا
// طلبات شبكة — لأن الموقع ملف HTML واحد بلا خطوة بناء.

import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = resolve(root, 'dist/volcanic-lands.logic.js');

await mkdir(dirname(outfile), { recursive: true });

const result = await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile,
  bundle: true,
  format: 'iife',
  // بنك الأسئلة يُضمَّن داخل الحزمة، فلا يحتاج fetch (يفشل على file://).
  loader: { '.json': 'json' },
  target: ['es2019'],
  charset: 'utf8',
  legalComments: 'none',
  minify: false,
  banner: {
    js:
      '/* الأراضي البركانية — منطق اللعبة (مولَّد آلياً من games/volcanic-lands/src).\n' +
      '   لا تعدّل هذا الملف يدوياً: عدّل المصدر ثم شغّل npm run build && npm run inject. */',
  },
  metafile: true,
});

const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
console.log(`✅ dist/volcanic-lands.logic.js — ${(bytes / 1024).toFixed(1)} KB`);
