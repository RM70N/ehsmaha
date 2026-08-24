// يحقن اللعبة داخل index.html بين علامات ثابتة — إضافة فقط، بلا تعديل أي
// كود قائم. تشغيله مرتين لا يضاعف شيئاً (idempotent).
//
// أربع كتل:
//   style  → أنماط اللعبة، قبل </head>
//   pages  → صفحتا الإعداد ولوحة الستريمر، قبل </body>
//   logic  → حزمة المنطق المبنية من TypeScript
//   ui     → طبقة الواجهة التي تربط المنطق بالـDOM
//   card   → كرت اللعبة في شبكة الصفحة الرئيسية

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = resolve(root, '../../index.html');

const read = (p) => readFile(resolve(root, p), 'utf8');

const [css, pages, logic, ui] = await Promise.all([
  read('ui/volcanic-lands.css'),
  read('ui/volcanic-lands.pages.html'),
  read('dist/volcanic-lands.logic.js'),
  read('ui/volcanic-lands.ui.js'),
]);

let html = await readFile(indexPath, 'utf8');

const GAME_CARD = `    <div class="gcard" data-tag="volcanic-lands" data-category="luck" onclick="goSetupVolcanicLands()">
      <span class="gcard-num">٢٤</span>
      <span class="badge" data-badge-slot></span>
      <div class="gcard-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18L14.5 7h-5z"/><path d="M12 7V3"/><path d="M9 3.5 12 3l3 .5"/></svg></div>
      <div class="gcard-name">الأراضي البركانية</div>
      <div class="gcard-desc">سؤال في المنتصف وأربعة خيارات — اكتب رقم إجابتك بالشات لترفع برجك، واللافا تصعد كل جولة حتى يبقى ناجٍ واحد!</div>
      <div class="gcard-tags"><span class="gcard-tag" style="background:rgba(245,158,11,.14);color:var(--brand-amber);">حظ وإقصاء</span></div>
    </div>`;

/** يستبدل الكتلة إن وُجدت، وإلا يُدرجها عبر `place`. */
function upsert(name, body, place) {
  const begin = `<!-- BEGIN volcanic-lands:${name} (مولَّد آلياً — لا تعدّله يدوياً) -->`;
  const end = `<!-- END volcanic-lands:${name} -->`;
  const block = `${begin}\n${body}\n${end}`;

  const start = html.indexOf(begin);
  const stop = html.indexOf(end);
  if (start > -1 && stop > start) {
    html = html.slice(0, start) + block + html.slice(stop + end.length);
    return `♻️  ${name}`;
  }
  const next = place(block);
  if (next === null) throw new Error(`تعذّر إيجاد موضع الإدراج للكتلة: ${name}`);
  html = next;
  return `➕ ${name}`;
}

/** يُدرج قبل آخر ظهور للوسم المغلق المحدَّد. */
function beforeTag(tag) {
  return (block) => {
    const at = html.lastIndexOf(tag);
    if (at === -1) return null;
    return html.slice(0, at) + block + '\n' + html.slice(at);
  };
}

const steps = [];

steps.push(upsert('style', `<style>\n${css}\n</style>`, beforeTag('</head>')));
steps.push(upsert('pages', pages, beforeTag('</body>')));

// كرت اللعبة: بعد آخر كرت في شبكة الصفحة الرئيسية (لعبة rlgl) — إضافة شقيق
// جديد بلا أي مساس بالكروت القائمة.
steps.push(upsert('card', GAME_CARD, (block) => {
  const marker = '<div class="gcard" data-tag="rlgl"';
  const at = html.indexOf(marker);
  if (at === -1) return null;
  // نهاية الكرت = أول `</div>` بعد كتلة gcard-tags الخاصة به
  const tagsAt = html.indexOf('<div class="gcard-tags">', at);
  if (tagsAt === -1) return null;
  const tagsEnd = html.indexOf('</div>', html.indexOf('</span>', tagsAt));
  const cardEnd = html.indexOf('</div>', tagsEnd + 6);
  if (cardEnd === -1) return null;
  const cut = cardEnd + '</div>'.length;
  return html.slice(0, cut) + '\n\n' + block + html.slice(cut);
}));

// المنطق قبل الواجهة — الواجهة تقرأ window.VolcanicLands عند الإقلاع.
steps.push(upsert('logic', `<script>\n${logic}\n</script>`, beforeTag('</body>')));
steps.push(upsert('ui', `<script>\n${ui}\n</script>`, beforeTag('</body>')));

await writeFile(indexPath, html, 'utf8');
console.log(steps.join('   '));
console.log(`✅ index.html — ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
