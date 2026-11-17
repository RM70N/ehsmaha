// رحلة الفضاء: مقاسات الشاشات + مطابقة الواجهة داخل الموقع لواجهة الملف المستقل (نفس الأبعاد والعناصر).
import { createRequire } from 'module';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const VPS = [['1920×1080', 1920, 1080, {}], ['1366×768', 1366, 768, {}], ['2560×1440', 2560, 1440, {}], ['جوال عمودي 390×844', 390, 844, { isMobile: true, hasTouch: true }], ['جوال أفقي 844×390', 844, 390, { isMobile: true, hasTouch: true }]];
console.log('== VP) مقاسات الشاشة والمطابقة للأصل');
for (const [name, w, h, extra] of VPS) {
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...extra }); const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push(String(e)));
  await installFakeFirebase(pg, ROOT + 'index.html'); await pg.goto(BASE + 'index.html'); await pg.waitForTimeout(2500);
  await pg.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, 's1'); window.homeHasActiveConnection = () => true; launchSpaceOdyssey(); });
  await pg.waitForFunction(() => window.__spaceOdysseyIntegration.isReady(), null, { timeout: 40000 }); await pg.waitForTimeout(1500);
  const embedded = await pg.evaluate(() => { const f = document.getElementById('spaceodyssey-frame'), d = f.contentDocument, r = f.getBoundingClientRect(); const bb = id => { const e = d.getElementById(id); if (!e) return null; const x = e.getBoundingClientRect(); return [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)]; };
    return { fw: Math.round(r.width), fh: Math.round(r.height), vw: innerWidth, vh: innerHeight, pageScroll: document.documentElement.scrollHeight - innerHeight, canvasW: d.querySelector('canvas') ? d.querySelector('canvas').clientWidth : 0, canvasH: d.querySelector('canvas') ? d.querySelector('canvas').clientHeight : 0, docOverflowX: d.documentElement.scrollWidth - d.documentElement.clientWidth, boxes: ['s-setup', 'nb', 'nr', 'kb', 'kr'].map(bb), title: (d.querySelector('h1') || {}).textContent }; });
  ok(`${name}: الإطار يملأ الشاشة بلا تمرير للصفحة والمشهد 3D بكامل الأبعاد بلا تمرير أفقي`, embedded.fw === w && embedded.fh === h && embedded.pageScroll <= 0 && embedded.canvasW >= w - 2 && embedded.canvasH >= h - 2 && embedded.docOverflowX <= 0, embedded);
  await pg.screenshot({ path: `/tmp/so_vp_${w}x${h}.png` }); await pg.close(); // نغلق صفحة الموقع قبل فتح المستقل (عارضان WebGL برمجيان معاً يُبطئان الاختبار)
  // الملف المستقل بنفس المقاس (?embed=1): تتطابق صناديق الإعداد
  const p2 = await ctx.newPage(); await p2.goto(BASE + 'space-odyssey.html?embed=1', { waitUntil: 'domcontentloaded' }); await p2.waitForFunction(() => window.EhsemhaSpace && window.EhsemhaSpace.getState, null, { timeout: 30000 }); await p2.waitForTimeout(1500);
  const alone = await p2.evaluate(() => { const bb = id => { const e = document.getElementById(id); if (!e) return null; const x = e.getBoundingClientRect(); return [Math.round(x.x), Math.round(x.y), Math.round(x.width), Math.round(x.height)]; }; return ['s-setup', 'nb', 'nr', 'kb', 'kr'].map(bb); });
  ok(`${name}: واجهة الإعداد داخل الموقع تطابق الملف المستقل (الأبعاد والمواضع)`, JSON.stringify(alone) === JSON.stringify(embedded.boxes), { alone, embedded: embedded.boxes });
  await p2.close();
  ok(`${name}: لا أخطاء JS`, errs.filter(e => !/webgl/i.test(e)).length === 0, errs.slice(0, 3));
  await ctx.close();
}
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
