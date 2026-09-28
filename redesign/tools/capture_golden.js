'use strict';
// لقطات مرجعية (golden) من التصاميم الأصلية الثلاثة كما هي (الحزم الأصلية، بدون أي تعديل).
//   node redesign/tools/capture_golden.js <solo.html> <screens.html> <streamer.html> <outDir>
// لكل تصميم: كل لعبة × كل حالة ممكنة بأزرار التصميم نفسه، بعرضين 1280 و390.
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const [solo, screens, streamer, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];

async function shot(page, name, full = true) {
  const f = path.join(out, name + '.png');
  await page.screenshot({ path: f, fullPage: full, animations: 'disabled' });
  log.push(name);
}

async function open(browser, file, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width >= 1000 ? 720 : 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  await page.goto('file://' + path.resolve(file), { waitUntil: 'load' });
  await sleep(1500);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-proxy-server'] });
  const errors = {};
  for (const width of [1280, 390]) {
    const W = '@' + width;
    // ---- الفردي: hub ← كل لعبة (إعداد) ← جولة ← إنهاء (نتيجة)
    let p = await open(browser, solo, width);
    await shot(p, 'solo-hub' + W);
    const gameIds = await p.$$eval('[data-act="open"]', (els) => els.map((e) => e.getAttribute('data-g')));
    for (const g of gameIds) {
      await p.click(`[data-act="open"][data-g="${g}"]`).catch(() => {});
      await sleep(600);
      await shot(p, `solo-${g}-setup${W}`);
      if (await p.$('[data-act="start"]')) {
        await p.click('[data-act="start"]').catch(() => {});
        await sleep(900);
        await shot(p, `solo-${g}-play${W}`);
        if (await p.$('[data-act="end"]')) { await p.click('[data-act="end"]').catch(() => {}); await sleep(900); await shot(p, `solo-${g}-result${W}`); }
      }
      await p.click('[data-act="hub"]').catch(async () => { await p.click('[data-act="back"]').catch(() => {}); });
      await sleep(500);
    }
    errors['solo' + W] = p._errors; await p.context().close();

    // ---- Game_Screens: كل لعبة (p.pick) × (إعداد/انتظار عبر s.pick) + المتقدم
    p = await open(browser, screens, width);
    const games = await p.$$('[role="tab"], button[aria-pressed]');
    await shot(p, 'screens-initial' + W);
    const clickText = async (txt) => {
      const h = await p.evaluateHandle((t) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t)), txt);
      const el = h.asElement(); if (el) { await el.click().catch(() => {}); await sleep(500); return true; } return false;
    };
    const G = [['سباق الشات', 'race'], ['القنبلة المتحركة', 'bomb'], ['لعبة التوقيت', 'timing'], ['شد الحبل', 'rope']];
    for (const [name, key] of G) {
      await clickText(name);
      for (const [scr, sk] of [['شاشة الإعداد', 'setup'], ['شاشة الانتظار', 'waiting']]) {
        await clickText(scr);
        await shot(p, `screens-${key}-${sk}${W}`);
        if (sk === 'setup' && await clickText('متقدم')) { await shot(p, `screens-${key}-setup-advanced${W}`); await clickText('متقدم'); }
      }
    }
    errors['screens' + W] = p._errors; await p.context().close();

    // ---- Streamer_Section: #modes / #library (كل تصنيف) / #setup (waiting→countdown→live→ended)
    p = await open(browser, streamer, width);
    for (const sec of ['modes', 'library', 'setup']) {
      const el = await p.$('#' + sec);
      if (el) { await el.screenshot({ path: path.join(out, `streamer-${sec}-initial${W}.png`) }); log.push(`streamer-${sec}-initial${W}`); }
    }
    const tabs = await p.$$('#library [role="tab"]');
    for (let i = 0; i < tabs.length; i++) {
      await tabs[i].click().catch(() => {}); await sleep(400);
      await (await p.$('#library')).screenshot({ path: path.join(out, `streamer-library-tab${i}${W}.png`) }); log.push(`streamer-library-tab${i}${W}`);
    }
    const start = await p.$('#setup [data-start]');
    if (start) {
      // انتظار انضمام المحاكاة الداخلية للتصميم (ما يُشحن) حتى يتفعّل الزر
      for (let k = 0; k < 20 && await p.$eval('#setup [data-start]', (b) => b.getAttribute('aria-disabled') === 'true').catch(() => false); k++) await sleep(500);
      await (await p.$('#setup')).screenshot({ path: path.join(out, `streamer-setup-waiting-joined${W}.png`) }); log.push(`streamer-setup-waiting-joined${W}`);
      await start.click().catch(() => {}); await sleep(900);
      await (await p.$('#setup')).screenshot({ path: path.join(out, `streamer-setup-countdown${W}.png`) }); log.push(`streamer-setup-countdown${W}`);
      await sleep(4500);
      await (await p.$('#setup')).screenshot({ path: path.join(out, `streamer-setup-live${W}.png`) }); log.push(`streamer-setup-live${W}`);
    }
    errors['streamer' + W] = p._errors; await p.context().close();
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ shots: log, pageErrors: errors }, null, 1));
  console.log(log.length + ' shots; page errors:', JSON.stringify(errors));
  await browser.close();
})();
