'use strict';
// مؤقّتات جولة قديمة بعد الريست/الخروج (خللان كانا بالنسخة السابقة):
//   • اعثر على الكورة: ريست أثناء الإخفاء/الخلط كان يترك doSwap شغّالاً على أكواب ممسوحة (خطأ JS) ويقلب الحالة لاحقاً.
//   • الطريق الزجاجي: الخروج أثناء كشف الإجابة كان يبدأ سؤالاً جديداً بالخلفية ويفتح شاشة الفوز فوق لعبة ثانية.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/stale-timers.test.js
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 300) : '')); };
const say = (viewer, text) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: viewer, text, identity: { isFollowerOfAnchor: true } });
const G = (tag) => Object.assign({}, games.find((g) => g.tag === tag));
async function waitFor(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(100); }
  return false;
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=1' });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await H.linkAccount(page, STREAMER);

  // ===== اعثر على الكورة =====
  for (const [label, phase, how] of [['ريست أثناء الخلط', 'shuffling', 'reset'], ['ريست أثناء الإخفاء', 'hiding', 'reset'], ['الرجوع للرئيسية أثناء الخلط', 'shuffling', 'home']]) {
    const e0 = page._errors.length;
    await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
    await H.launch(page, G('findball'));
    for (let i = 0; i < 3; i++) await say('fb_' + phase + how + i, 'ادخل');
    await waitFor(page, () => findballParticipants.size === 3, null, 8000);
    await page.evaluate(() => findballStartRoundClick());
    await waitFor(page, (p) => findballGameStatus === p, phase, 10000);
    await page.evaluate((how) => { if (how === 'reset') resetFindball(); else goHome(); }, how);
    const st0 = await page.evaluate(() => findballGameStatus);
    await sleep(7000);
    const r = await page.evaluate(() => ({ st: findballGameStatus, page: document.querySelector('.page.active').id }));
    check('اعثر على الكورة — ' + label + ': لا أخطاء والحالة لا تنقلب (' + st0 + ')', page._errors.length === e0 && r.st === st0, Object.assign({ errors: page._errors.slice(e0) }, r));
  }
  // جولة طبيعية بعد الريست تكمل عادي (الإصلاح ما كسر اللعبة)
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
  await H.launch(page, G('findball'));
  for (let i = 0; i < 3; i++) await say('fb_ok' + i, 'ادخل');
  await waitFor(page, () => findballParticipants.size === 3, null, 8000);
  await page.evaluate(() => findballStartRoundClick());
  await waitFor(page, () => findballGameStatus === 'shuffling', null, 10000);
  await page.evaluate(() => resetFindball()); await sleep(300);
  for (let i = 0; i < 3; i++) await say('fb_ok2' + i, 'ادخل');
  await waitFor(page, () => findballParticipants.size === 3, null, 8000);
  await page.evaluate(() => findballStartRoundClick());
  const guessing = await waitFor(page, () => findballGameStatus === 'guessing', null, 20000);
  await page.evaluate(() => [...findballParticipants.values()].forEach((u) => findballProcessGuess(u, String(findballBallCup))));
  const done = await waitFor(page, () => findballGameStatus === 'finished-round', null, 15000);
  check('اعثر على الكورة: جولة جديدة بعد ريست وسط الخلط تكمل طبيعياً (خلط ← تخمين ← نتيجة)', guessing && done, await page.evaluate(() => findballGameStatus));

  // ===== الطريق الزجاجي =====
  for (const [label, phase, how] of [['الخروج أثناء كشف الإجابة', 'resolving', 'quit'], ['الرجوع للرئيسية أثناء السؤال', 'active', 'home']]) {
    const e0 = page._errors.length;
    await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
    await H.launch(page, Object.assign(G('glz'), { inputs: { 'glz-join-kw': 'زجاج', 'glz-round-seconds': '8' } }));
    for (let i = 0; i < 6; i++) await say('gz_' + how + i, 'زجاج');
    await waitFor(page, () => glzParticipants.size === 6, null, 8000);
    await page.evaluate(() => glzStartFirstRound());
    await waitFor(page, () => glzGameStatus === 'active', null, 15000);
    if (phase === 'resolving') await page.evaluate(() => glzEndRoundManually());
    await waitFor(page, (p) => glzGameStatus === p, phase, 15000);
    const round0 = await page.evaluate(() => glzRound);
    await page.evaluate((how) => { if (how === 'quit') glzQuit(); else goHome(); }, how);
    await sleep(9000);
    const r = await page.evaluate(() => ({ st: glzGameStatus, round: glzRound, page: document.querySelector('.page.active').id, timer: !!glzTimerInterval }));
    check('الطريق الزجاجي — ' + label + ': لا سؤال جديد بالخلفية ولا شاشة فوز فوق الصفحة', r.st === 'finished' && r.round === round0 && r.page === 'pg-home' && !r.timer && page._errors.length === e0, Object.assign({ round0 }, r));
  }
  // لعبة زجاج كاملة طبيعية بعد الإصلاح
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
  await H.launch(page, Object.assign(G('glz'), { inputs: { 'glz-join-kw': 'زجاج', 'glz-round-seconds': '8' } }));
  for (let i = 0; i < 4; i++) await say('gz_full' + i, 'زجاج');
  await waitFor(page, () => glzParticipants.size === 4, null, 8000);
  await page.evaluate(() => glzStartFirstRound());
  const r1 = await waitFor(page, () => glzRound >= 2 || glzGameStatus === 'finished', null, 40000);
  check('الطريق الزجاجي: اللعبة تكمل جولاتها طبيعياً بدون خروج', r1, await page.evaluate(() => ({ round: glzRound, st: glzGameStatus })));
  await page.evaluate(() => glzQuit());

  const pass = results.filter((r) => r.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
