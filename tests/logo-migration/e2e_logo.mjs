// استبدال شعار احسمها: فحص ثابت + متصفح (الشعار الجديد بكل الأماكن، الأيقونات، لا صور مكسورة، لا أخطاء).
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم  node tests/logo-migration/e2e_logo.mjs
import { createRequire } from 'module'; import crypto from 'crypto'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rd = p => fs.readFileSync(ROOT + p, 'utf8');
console.log('== LOGO) فحص ثابت');
ok('الشعار المعتمد في assets/branding/ehsmaha-logo.png مطابق للأصل المرفوع (SHA-256)', sha(ROOT + 'assets/branding/ehsmaha-logo.png') === 'be6c3ea937ac29f09001d59475fad57ad0e7a3a9988d3b38c56f063c30fe0537');
const files = ['index.html', 'code-race.html', 'desktop-app-ui.js', 'windows-app.html', 'owner-studio/index.html'];
const OLD_PATH = 'M18 66 L18 40 L34 52';
ok('لا شعار التاج القديم (SVG) بأي ملف موقع', files.every(f => !rd(f).includes(OLD_PATH)), files.filter(f => rd(f).includes(OLD_PATH)));
const idx = rd('index.html');
ok('الفافيكون وأيقونات اللمس بالملفات الجديدة (لا data URI قديم)', /rel="icon"[^>]*favicon\.ico/.test(idx) && /icon-32\.png/.test(idx) && /apple-touch-icon-180\.png/.test(idx) && !/rel="(icon|apple-touch-icon)"[^>]*data:image/.test(idx));
ok('شارة الشعار بالألعاب (rf-logo) تستخدم البانر الجديد لا الصورة القديمة', /--rf-logo-img:url\("\/assets\/branding\/ehsmaha-banner\.webp"\)/.test(idx));
const need = ['icon-16', 'icon-32', 'icon-48', 'icon-64', 'icon-96', 'icon-192', 'icon-256', 'icon-512', 'apple-touch-icon-180'].map(n => 'assets/branding/' + n + '.png').concat(['assets/branding/ehsmaha-banner.webp', 'favicon.ico', 'discord-logo.png', 'desktop/build/icon.png', 'desktop/build/icon.ico', 'desktop/renderer/logo.png', 'windows-launch-campaign/assets/logo.png']);
ok('كل ملفات الأيقونات موجودة', need.every(f => fs.existsSync(ROOT + f)), need.filter(f => !fs.existsSync(ROOT + f)));
const pixSize = f => { const b = fs.readFileSync(ROOT + f); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
ok('مقاسات الأيقونات صحيحة (16/32/48/64/96/192/256/512/180)', [[16, 'icon-16'], [32, 'icon-32'], [48, 'icon-48'], [64, 'icon-64'], [96, 'icon-96'], [192, 'icon-192'], [256, 'icon-256'], [512, 'icon-512'], [180, 'apple-touch-icon-180']].every(([s, n]) => { const [w, h] = pixSize('assets/branding/' + n + '.png'); return w === s && h === s; }));
ok('لا manifest/PWA بالمشروع (لم يُنشأ جديد)', !fs.existsSync(ROOT + 'manifest.json') && !fs.existsSync(ROOT + 'manifest.webmanifest'));

console.log('== LOGO) المتصفح');
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage();
const errs = [], bad = []; pg.on('pageerror', e => errs.push('PE ' + e)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CE ' + m.text().slice(0, 160)); });
pg.on('response', r => { if (/assets\/branding|favicon\.ico/.test(r.url()) && r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await installFakeFirebase(pg, ROOT + 'index.html');
await pg.addInitScript(() => { try { sessionStorage.setItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed', '1'); } catch (e) {} });
await pg.goto(BASE + 'index.html'); await pg.waitForTimeout(2500);
const head = await pg.evaluate(() => [...document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]')].map(l => l.getAttribute('href')));
ok('وسوم الأيقونات بالصفحة الحيّة', head.length === 7 && head.every(h => !/^data:/.test(h)), head);
const iconsOk = await pg.evaluate(async (hs) => (await Promise.all(hs.map(h => fetch(h).then(r => r.ok && r.headers.get('content-type')).catch(() => false)))).every(Boolean), head);
ok('كل روابط الأيقونات تُحمَّل (200)', iconsOk);
const shot = async (name) => pg.screenshot({ path: `/tmp/logo_${name}.png` });
const imgs = async () => pg.evaluate(() => [...document.querySelectorAll('img[src*="assets/branding"]')].filter(i => i.offsetParent !== null || getComputedStyle(i).position === 'fixed').map(i => ({ cls: (i.className || i.parentElement.className || '').toString().slice(0, 28), w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height), ok: i.complete && i.naturalWidth > 0 })));
const landing = await imgs(); await shot('landing');
ok('صفحة الهبوط: الشعار الجديد يظهر (تذييل/هيدر) بأبعاد 34px ومحمّل', landing.length >= 1 && landing.every(i => i.ok) && landing.some(i => i.w === 34), landing);
for (const [name, sel, size] of [['auth', 'show("auth")', 64], ['home', 'show("home")', 0]]) {
  await pg.evaluate((c) => { try { new Function(c)(); } catch (e) {} }, sel); await pg.waitForTimeout(700);
  const l = await imgs(); await shot(name);
  ok(`صفحة ${name}: شعار جديد محمّل بلا صور مكسورة` + (size ? ` وبحجم ${size}px` : ''), l.length >= 1 && l.every(i => i.ok) && (!size || l.some(i => i.w === size)), l);
}
{ const c = await pg.evaluate(() => { const i = document.querySelector('#pg-ahsemha-home .logo img'); const cs = getComputedStyle(i.parentElement); return { ok: i.complete && i.naturalWidth > 0, w: cs.width, src: i.getAttribute('src') }; });
  ok('صفحة «فئات»: الشعار الجديد بحاوية 96px محمّل', c.ok && c.w === '96px' && /assets\/branding/.test(c.src), c); }
const badge = await pg.evaluate(async () => { show('tt10'); await new Promise(r => setTimeout(r, 600)); const e = document.querySelector('#pg-tt10 .rf-badge-logo'); const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); const u = cs.backgroundImage; const ok = await new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth > 0); im.onerror = () => res(false); im.src = '/assets/branding/ehsmaha-banner.webp'; }); return { bg: u.slice(0, 70), sz: cs.backgroundSize, w: Math.round(r.width), h: Math.round(r.height), ok }; });
ok('شارة الشعار بصفحة لعبة: البانر الجديد بنفس الحجم (نسبة 369/127) ويُحمّل', /ehsmaha-banner\.webp/.test(badge.bg) && badge.sz === 'contain' && badge.ok && Math.abs(badge.w / badge.h - 369 / 127) < .05, badge);
await shot('game-badge');
ok('لا أخطاء 404 للأيقونات ولا أخطاء JS', bad.length === 0 && errs.filter(e => !/webgl/i.test(e)).length === 0, { bad, errs: errs.slice(0, 3) });
// صفحات أخرى
for (const [f, label] of [['windows-app.html', 'صفحة تطبيق ويندوز'], ['owner-studio/index.html', 'لوحة المالك'], ['code-race.html', 'سباق الشات']]) {
  const p2 = await ctx.newPage(); const e2 = []; p2.on('pageerror', e => e2.push(String(e))); await p2.route(/fonts\.g|gstatic|cdn|unpkg/, r => r.abort());
  await p2.goto(BASE + f, { waitUntil: 'domcontentloaded' }); await p2.waitForTimeout(1500);
  const r = await p2.evaluate(() => ({ icons: [...document.querySelectorAll('link[rel~="icon"]')].map(l => l.getAttribute('href')).filter(h => /favicon|branding/.test(h)).length, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0 && /branding/.test(i.src)).length, logos: document.querySelectorAll('img[src*="branding"]').length }));
  ok(`${label}: الأيقونة الجديدة ولا صور شعار مكسورة`, (f === 'code-race.html' || r.icons >= 1) && r.broken === 0, r); await p2.screenshot({ path: `/tmp/logo_${f.replace(/\W/g, '_')}.png` }); await p2.close();
}
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
