'use strict';
// مسح كل ألعاب الستريمر: فتح بالاسم عبر تعليق → بدء → التحقق من تشغيل اللعبة فعلاً → رجوع. يطبع جدولاً صادقاً.
const fs = require('fs'); const H = require('../bridge/harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'sweepstreamer';
const OUT = process.env.SWEEP_OUT || '/tmp/subathon-sweep.json';
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); let page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await H.linkAccount(page, U); await sleep(500);
  const setup = () => page.evaluate(() => { const S = Subathon._store(); ['viewer1'].forEach((u) => { if (!S.get('tiktok:' + u)) S.add({ platform: 'tiktok', username: u, level: 3, verified: true }); }); const s = Subathon._session(); if (!s.active) { s.cfg.minGapMs = 20; s.cfg.rateMax = 50; s.cfg.dedupeMs = 50; s.activate({ mode: 'leader' }); } });
  await setup();
  const games = await page.evaluate(() => SubathonEngine.games());
  const say = async (text) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: 'viewer1', text, identity: { isFollowerOfAnchor: true } }); await sleep(380); };
  const rows = [];
  for (const g of games) {
    const row = { tag: g.tag, name: g.name, open: false, start: false, back: false, note: '' };
    try {
      await page.evaluate(() => { try { show('home'); } catch (e) {} homeClearGameListeners && homeClearGameListeners(); });
      await sleep(250);
      await say('افتح ' + g.name);
      const o = await page.evaluate((t) => ({ pg: document.querySelector('.page.active').id, op: SubathonEngine.openedGame() }), g.tag);
      row.open = o.op === g.tag || /^pg-setup-/.test(o.pg) || o.pg !== 'pg-home'; row.page = o.pg;
      if (!row.open) { row.note = 'لم تُفتح: ' + o.pg; }
      else {
        await say('ابدأ');
        await sleep(900);
        const s = await page.evaluate(() => ({ pg: document.querySelector('.page.active').id, ls: Object.keys(homeGameListeners || {}), err: !!document.querySelector('.toast.error') }));
        row.start = s.ls.length > 0 || s.pg !== o.pg; row.after = s.pg; row.listeners = s.ls;
        if (!row.start) row.note = 'لم يبدأ: يبقى في ' + s.pg;
        await say('الألعاب'); await sleep(300);
        row.back = await page.evaluate(() => document.getElementById('pg-home').classList.contains('active'));
      }
    } catch (e) { row.note = 'استثناء: ' + e.message.slice(0, 80); try { await page.close(); } catch (x) {} page = await H.newPage(b, { query: '?debug=0' }); await sleep(2500); await H.linkAccount(page, U).catch(() => {}); await setup(); }
    rows.push(row); console.log((row.open && row.start && row.back ? 'OK   ' : 'PART ') + g.tag + ' | ' + g.name + ' | ' + (row.note || row.after));
  }
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  const full = rows.filter((r) => r.open && r.start && r.back).length; console.log('full ' + full + '/' + rows.length + ' open ' + rows.filter((r) => r.open).length + ' start ' + rows.filter((r) => r.start).length);
  await b.close(); process.exit(0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
