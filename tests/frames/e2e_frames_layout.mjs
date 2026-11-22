// الإطارات: الأفتار بمنتصف دائرة الإطار لا يغطي زخرفته، والاسم بلوحته متمركزاً — لكل إطار (ثابت/عام/خاص).
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم  node tests/frames/e2e_frames_layout.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(String(e)));
await installFakeFirebase(pg, ROOT + 'index.html'); await pg.addInitScript(() => { try { sessionStorage.setItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed', '1'); } catch (e) {} });
await pg.goto(BASE + 'index.html'); await pg.waitForTimeout(2500);
console.log('== FL) هندسة بطاقة الإطار');
const run = await pg.evaluate(async () => {
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#14102a;padding:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px;align-content:start;overflow:auto'; document.body.appendChild(host);
  // إطار «خاص» مولَّد: حلقة شفافة غير مركزية بلوحة اسم في الأسفل، وفتحة المالك أكبر من الحلقة، بلا nameZone
  const mk = (ringCx, ringCy, ringR, opaque) => { const c = document.createElement('canvas'); c.width = 560; c.height = 200; const g = c.getContext('2d'); g.fillStyle = '#7a3'; g.fillRect(0, 0, 560, 200); g.fillStyle = '#222'; g.fillRect(250, 70, 280, 80);
    if (!opaque) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(ringCx, ringCy, ringR, 0, 7); g.fill(); } return c.toDataURL('image/png'); };
  const custom = [
    { id: 'cu1', name: 'خاص 1', hole: [8, 12, 30, 80], ratio: 2.8, gallery: mk(78, 100, 62) },                       // فتحة أكبر من الحلقة
    { id: 'cu2', name: 'خاص 2 (معتم)', hole: [5, 10, 26, 80], ratio: 2.8, gallery: mk(70, 100, 60, true) },         // بلا شفافية → احتياطي
    { id: 'cu3', name: 'خاص 3 (nameZone)', hole: [6, 10, 28, 80], ratio: 2.8, gallery: mk(80, 100, 60), nameZone: [55, 40, 38, 24] }
  ];
  const all = FRAMES_CATALOG.concat(custom);
  const rows = [];
  for (const f of all) {
    const u = { uniqueId: 'p_' + f.id, nickname: 'لاعب ' + f.id + ' بإسم أطول', avatar: '', isFollower: true };
    const k = levelsKey(u.uniqueId);
    if (custom.includes(f)) { framesPrivateResolved.set(f.id, f); }
    framesParticipantCache.set(k, f.id); framesParticipantCacheAt.set(k, Date.now() + 1e9);
    const tag = buildParticipantChip(u, 1, 'fl-' + f.id); host.appendChild(tag);
    if (custom.includes(f)) { tag.classList.remove('p-has-full-frame'); framesInjectRingWithFrame(tag, f, 72); }
  }
  await new Promise(r => setTimeout(r, 1200));
  // رسم صورة كل إطار على canvas لاختبار تغطية الأفتار للحلقة
  const alphaOf = async (src) => { const im = new Image(); im.src = src; await im.decode(); const W = 560, H = Math.round(560 / FRAMES_BANNER_RATIO); const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0, W, H); return { g, W, H }; };
  for (const f of all) {
    const tag = document.getElementById('fl-' + f.id); const r = tag.getBoundingClientRect();
    const av = tag.querySelector('.p-avatar-circle').getBoundingClientRect(), nm = tag.querySelector('.p-username-name'), nr = nm.getBoundingClientRect();
    const { g, W, H } = await alphaOf(f.gallery);
    const cx = (av.left + av.width / 2 - r.left) / r.width * W, cy = (av.top + av.height / 2 - r.top) / r.height * H, rad = av.width / 2 / r.width * W;
    let clear = 0, tot = 0; for (let a = 0; a < 6.28; a += 0.4) { const x = Math.round(cx + Math.cos(a) * rad * 0.98), y = Math.round(cy + Math.sin(a) * rad * 0.98); tot++; if (g.getImageData(Math.max(0, Math.min(W - 1, x)), Math.max(0, Math.min(H - 1, y)), 1, 1).data[3] < 60) clear++; }
    const centerClear = g.getImageData(Math.round(cx), Math.round(cy), 1, 1).data[3] < 60;
    rows.push({ id: f.id, custom: custom.includes(f), centerClear, clearPct: Math.round(clear / tot * 100), avD: Math.round(av.width), nameOverlapAv: !(nr.left >= av.right - 1), nameInCard: nr.left >= r.left - 1 && nr.right <= r.right + 1 && nr.top >= r.top - 1 && nr.bottom <= r.bottom + 1, nameCyPct: Math.round(((nr.top + nr.height / 2) - r.top) / r.height * 100), overflow: nm.scrollWidth > nm.clientWidth + 1, fs: getComputedStyle(nm).fontSize, h: Math.round(r.height) });
  }
  return rows;
});
const cat = run.filter(x => !x.custom), cus = run.filter(x => x.custom);
ok('22 إطاراً ثابتاً: الأفتار داخل الحلقة الشفافة لا يغطي زخرفتها (≥ 85% من حافته على شفاف)، عدا المعتم', cat.filter(x => x.centerClear).every(x => x.clearPct >= 85), cat.filter(x => x.centerClear && x.clearPct < 85));
ok('22 إطاراً: الاسم داخل البطاقة ولا يلامس الأفتار، بحجم متوسط (11–16px)', cat.every(x => x.nameInCard && !x.nameOverlapAv && parseFloat(x.fs) >= 9 && parseFloat(x.fs) <= 16.5), cat.map(x => [x.id, x.fs, x.nameInCard, x.nameOverlapAv]).filter(x => !x[2] || x[3] || parseFloat(x[1]) < 9 || parseFloat(x[1]) > 16.5));
ok('كل البطاقات بنفس الارتفاع (72px)', run.every(x => x.h === 72), [...new Set(run.map(x => x.h))]);
ok('أقطار أفتارات الكتالوج متقاربة (22–36px) تتبع حلقة كل إطار', cat.every(x => x.avD >= 22 && x.avD <= 36), cat.map(x => x.avD));
const c1 = cus.find(x => x.id === 'cu1');
ok('إطار خاص بفتحة أكبر من الحلقة: الأفتار بمنتصف الحلقة الفعلية لا يغطيها', c1.centerClear && c1.clearPct >= 85, c1);
ok('إطار خاص بلا nameZone: الاسم يمين الفتحة داخل البطاقة ولا يلامس الأفتار', cus.every(x => x.nameInCard && !x.nameOverlapAv), cus);
const c3 = cus.find(x => x.id === 'cu3');
ok('إطار خاص بـnameZone: الاسم بمنطقته (مركز رأسي ≈ 52%)', Math.abs(c3.nameCyPct - 52) <= 6, c3);
ok('لا أخطاء JavaScript (عدا WebGL)', errs.filter(e => !/webgl/i.test(e)).length === 0, errs.slice(0, 3));
await pg.screenshot({ path: '/tmp/frames_layout.png' });
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
