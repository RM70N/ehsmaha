// الصفحات المستقلة (ألعاب 3D وغيرها): أيقونة احسمها الجديدة في التبويب، وشعار «حرف النجاة» الجديد بلا صورة قديمة مضمّنة.
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url)); const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname; let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d === undefined ? '' : JSON.stringify(d)); } };
const withIcon = ['roulette3d', 'bomb3d', 'tug3d', 'xo', 'ektheb-alay', 'almeezan3d', 'wesh-taghayar', 'hallaha-qabli', 'la-tatayeh3d', 'harf-alnajat3d', 'callcenter3d', 'code-race', 'desktop-auth', 'link-device', 'ws-diag'];
for (const f of withIcon) { const s = fs.readFileSync(ROOT + f + '.html', 'utf8'); ok(f + ': أيقونة التبويب الجديدة', /assets\/branding\/icon-32\.png/.test(s) && /favicon\.ico\?v=2/.test(s)); }
const h = fs.readFileSync(ROOT + 'harf-alnajat3d.html', 'utf8');
ok('حرف النجاة: الشعار من assets/branding ولا صورة PNG قديمة مضمّنة', /Zh="\/assets\/branding\/icon-256\.png"/.test(h) && !/Zh="data:image/.test(h));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const pg = await (await b.newContext({ viewport: { width: 1100, height: 650 } })).newPage(); const bad = []; pg.on('response', (r) => { if (r.status() >= 400 && /branding|favicon/.test(r.url())) bad.push(r.url()); });
await pg.route(/googleapis|gstatic|cdnjs|jsdelivr|unpkg/, (r) => r.abort());
await pg.goto('http://127.0.0.1:8790/harf-alnajat3d.html'); await pg.waitForTimeout(3500);
const r = await pg.evaluate(() => { const i = document.getElementById('logo-start'); return { src: i && i.getAttribute('src'), ok: !!(i && i.complete && i.naturalWidth === 256), w: i && Math.round(i.getBoundingClientRect().width) }; });
ok('سبلاش حرف النجاة يعرض الشعار الجديد (256px) بحجم مناسب', r.ok && /icon-256/.test(r.src) && r.w > 30 && r.w < 140, r);
ok('لا 404 للأيقونات', bad.length === 0, bad);
await b.close(); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
