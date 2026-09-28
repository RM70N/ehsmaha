'use strict';
// لقطة لكل صفحة pg-* عبر show() — للمقارنة قبل/بعد وفحص المرحلة 5.
//   node redesign/tools/shoot_pages.js <outDir> [width=1280] [filterRegex]
const path = require('path'), fs = require('fs');
const H = require('../../tests/bridge/harness');
const out = process.argv[2], width = Number(process.argv[3] || 1280), filt = process.argv[4] ? new RegExp(process.argv[4]) : null;
fs.mkdirSync(out, { recursive: true });
(async () => {
  await H.serveSite();
  const b = await H.launchBrowser();
  const ctx = await b.newContext({ viewport: { width, height: width >= 1000 ? 800 : 844 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:8765/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const pages = await page.evaluate(() => [...document.querySelectorAll('.page[id^="pg-"]')].map((e) => e.id.slice(3)));
  const res = [];
  for (const p of pages) {
    if (filt && !filt.test(p)) continue;
    const r = await page.evaluate((p) => { try { show(p); } catch (e) { return e.message; } window.scrollTo(0, 0); const el = document.getElementById('pg-' + p); return { h: el.scrollHeight, overflowX: document.documentElement.scrollWidth > innerWidth + 1 }; }, p);
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(out, p + '@' + width + '.png'), fullPage: false });
    res.push(Object.assign({ page: p }, typeof r === 'object' ? r : { err: r }));
  }
  fs.writeFileSync(path.join(out, 'pages@' + width + '.json'), JSON.stringify({ res, errs: [...new Set(errs)] }, null, 1));
  console.log(res.length + ' pages, errors ' + new Set(errs).size);
  await b.close(); process.exit(0);
})();
