'use strict';
// لقطات شاشة الانتظار والراوند لكل لعبة ستريمر (للمراجعة البصرية، مو اختبار نجاح/فشل).
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=... node tests/bridge/game-shots.js <outDir> [n=14] [vw=1360] [vh=900]
//   (FROM / TO لتحديد نطاق الألعاب)
const H = require('./harness');
const games = require('./games');
const fs = require('fs');
const OUT = process.argv[2] || '/tmp/game-shots';
const N = Number(process.argv[3] || 14);
const VW = Number(process.argv[4] || 1360), VH = Number(process.argv[5] || 900);
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FROM = Number(process.env.FROM || 1), TO = Number(process.env.TO || 99);
const ROUND = { gw: 'gwStartRound', main: 'startRound', sniper: 'startSniperRound', hz: 'startHzRound', rou: 'startRouletteRound', bomb: 'startBombRound', box: 'startBoxRound', cr: 'startCrRound', mz: 'startMzRound', ev: 'startEvRound', ll: 'startLastLetterRound', wai: 'startWAIRound', ig: 'startIGRound', rw: 'startRWRound', pgs: 'startPGRound', lsc: 'startLSCRound', wr: 'startWRRound', draw: 'startDrawRound', cw: 'startCountryWarRound', cs: 'startCrownStealRound', chairs: 'chairsStartRoundClick', findball: 'findballStartRoundClick', tug: 'startTugRound', rlgl: 'startRlglRound', 'volcanic-lands': 'vlStart' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '' });
  await page.setViewportSize({ width: VW, height: VH });
  await H.linkAccount(page, STREAMER);
  let i = 0;
  for (const g of games) {
    i++;
    if (i < FROM || i > TO) continue;
    const tag = g.tag;
    try {
      await page.evaluate(() => { try { goHome(); } catch (e) {} });
      await H.launch(page, g);
      const kw = g.kw != null ? g.kw : (g.kwExpr ? await page.evaluate((e) => (0, eval)(e), g.kwExpr) : (tag === 'volcanic-lands' ? 'بركان' : 'مرحبا'));
      if (tag === 'draw') { await page.evaluate(() => { try { startDrawRound(); } catch (e) {} }); await sleep(300); }
      await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: N, prefix: tag + '_p', text: kw, identity: { isFollowerOfAnchor: true }, perMs: 40 });
      await sleep(1800);
      await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; const d = document.getElementById('join-diag-panel') || document.querySelector('[id*="diag"]'); });
      await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${tag}-wait.png` });
      if (ROUND[tag] && tag !== 'draw') await page.evaluate(async (fn) => { try { await window[fn](); } catch (e) {} }, ROUND[tag]);
      await sleep(900);
      for (const [k, text] of [['1', '1'], ['2', '٢'], ['3', 'اختيار'], ['4', kw], ['5', 'قمر']]) await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: tag + '_p' + k, text, identity: { isFollowerOfAnchor: true } });
      await sleep(2200);
      await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${tag}-round.png` });
      console.error(i + ' ' + tag + ' ok');
    } catch (e) { console.error(i + ' ' + tag + ' ERR ' + e.message); }
  }
  await browser.close(); process.exit(0);
})();
