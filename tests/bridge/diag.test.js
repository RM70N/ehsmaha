'use strict';
// لوحة التشخيص ?debug=1: كل محاولة انضمام لها سبب مقروء.  node tests/bridge/diag.test.js
const H = require('./harness');
const games = require('./games');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await H.serveSite();
  const b = await H.launchBrowser();
  const page = await H.newPage(b, { query: '?debug=1' });
  await H.linkAccount(page, 'streamer1');
  const g = games.find((x) => x.tag === 'cr');
  await H.launch(page, g);
  const say = (viewer, text, identity) => H.ctl(H.PRIMARY, { cmd: 'chat', user: 'streamer1', viewer, text, identity });
  await say('fan', 'ادخل', { isFollowerOfAnchor: true });
  await say('fan', 'ادخل', { isFollowerOfAnchor: true });
  await say('stranger', 'ادخل', { isFollowerOfAnchor: false });
  await say('typo', 'ادخلل', { isFollowerOfAnchor: true });
  await sleep(500);
  await page.evaluate(() => { crGameStatus = 'active'; }); // الراوند بدأ
  await say('late', 'ادخل', { isFollowerOfAnchor: true });
  await sleep(1200);
  const r = await page.evaluate(() => ({
    panel: !!document.getElementById('conn-diag-panel'),
    text: (document.getElementById('conn-diag-panel') || {}).innerText || '',
    log: joinDiagLog.map((x) => x.uid.replace('tiktok:', '') + '=' + x.reason + (x.detail ? '(' + x.detail + ')' : '')),
  }));
  const want = [
    ['fan joined', r.log.some((x) => x.startsWith('fan=joined'))],
    ['fan already_in', r.log.some((x) => x.startsWith('fan=already_in'))],
    ['stranger pending_follow', r.log.some((x) => x.startsWith('stranger=pending_follow'))],
    ['typo near miss', r.log.some((x) => x.startsWith('?=keyword_near_miss') || x.includes('keyword_near_miss'))],
    ['late not_joined with status', r.log.some((x) => x.startsWith('late=not_joined') && x.includes('active'))],
    ['panel shows listeners=1', /معالجات مسجلة: 1/.test(r.text)],
    ['panel shows connection state', /connected/.test(r.text)],
  ];
  let bad = 0;
  want.forEach(([n, ok]) => { if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + n); });
  console.log(r.log.join('\n'));
  if (page._errors.length) { bad++; console.log('PAGE ERRORS', page._errors); }
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  await b.close(); process.exit(bad ? 1 : 0);
})();
