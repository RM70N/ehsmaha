'use strict';
// اختبار «ما ينطرد لاعب من اللعبة»: التحديث التلقائي/ريفرش المالك/إعادة توجيه الحساب ما يلمسون أي شاشة لعبة.
//   النسخة القديمة كانت تؤجل الريفرش فقط لو حالة الراوند ضمن قائمة ثابتة؛ ألعاب/حالات خارجها تنطرد لصفحة «من نحن».
//   PLAYWRIGHT_PATH=... node tests/bridge/no-kick.test.js
const H = require('./harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : '')); };

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser);
  await page.goto('http://localhost:8765/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof autoUpdateCanReloadNow === 'function' && typeof authShouldShowLanding === 'function', null, { timeout: 60000 });
  await sleep(1500);

  const setActive = (id) => page.evaluate((i) => { document.querySelectorAll('.page').forEach((p) => p.classList.remove('active')); document.getElementById(i).classList.add('active'); }, id);
  const can = () => page.evaluate(() => autoUpdateCanReloadNow());

  // 1) كل صفحة: الآمنة فقط تسمح، وأي صفحة لعبة (أي مرحلة) تمنع
  const ids = await page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => p.id).filter((i) => /^pg-/.test(i)));
  const safe = await page.evaluate(() => AUTO_UPDATE_SAFE_PAGES.map((s) => 'pg-' + s));
  const wrong = [];
  let games = 0;
  for (const id of ids) {
    await setActive(id);
    const ok = await can();
    const isSafe = safe.includes(id);
    if (!isSafe) games++;
    if (ok !== isSafe) wrong.push({ id, ok, expected: isSafe });
  }
  check('الريفرش التلقائي مسموح بالصفحات الآمنة فقط (' + safe.length + ') وممنوع بكل ' + games + ' صفحة لعبة/إعداد/راوند/فائز/غرفة', wrong.length === 0 && games > 100, wrong.slice(0, 8));

  // 2) الصفحات اللي كانت تنطرد: ألعاب الستريمر الجديدة + مراحل «عدّ/نتيجة/فائز»
  for (const id of ['pg-xo', 'pg-ek', 'pg-wesh', 'pg-hq', 'pg-almeezan', 'pg-cannon', 'pg-roulette3d', 'pg-volcanic-lands', 'pg-tug', 'pg-bomb', 'pg-callcenter', 'pg-ig-final', 'pg-ptop10-roundwinner', 'pg-bridge-round']) {
    if (!ids.includes(id)) { check('الصفحة موجودة: ' + id, false); continue; }
    await setActive(id);
    check('ممنوع الريفرش على ' + id, (await can()) === false);
  }

  // 3) حالة لعبة خارج القائمة القديمة (مثلاً «countdown») على صفحة لعبة: ممنوع
  await setActive('pg-xo');
  await page.evaluate(() => { try { window.gameStatus = 'countdown'; } catch (e) {} });
  check('حالة راوند غير مدرجة + صفحة لعبة ← ممنوع', (await can()) === false);

  // 4) ريفرش فعلي: على صفحة لعبة ما يحصل تنقّل، وعلى الرئيسية يحصل
  await page.evaluate(() => { window.__marker = 1; });
  await setActive('pg-xo');
  await page.evaluate(() => { autoUpdateAvailable = true; autoUpdateTryReloadNow(); });
  await sleep(2500);
  check('تحديث متاح + لاعب بلعبة: ما انعاد تحميل الصفحة', await page.evaluate(() => window.__marker === 1));
  await page.evaluate(() => { forceReloadPendingMs = Date.now(); forceReloadTry(); });
  await sleep(2500);
  check('ريفرش المالك + لاعب بلعبة: ما انعاد تحميل الصفحة', await page.evaluate(() => window.__marker === 1));
  await page.evaluate(() => { window.__t = 1; });
  await setActive('pg-home');
  const nav = page.waitForEvent('framenavigated', { timeout: 15000 }).then(() => true, () => false);
  await page.evaluate(() => { autoUpdateAvailable = true; autoUpdateTryReloadNow(); });
  check('تحديث متاح + الصفحة الرئيسية: يعيد التحميل (التحديث يوصل لمن ما يلعب)', await nav);

  // 5) إعادة توجيه نفس الحساب ما تسحب لاعب لصفحة الهبوط
  await page.waitForFunction(() => typeof authShouldShowLanding === 'function', null, { timeout: 60000 });
  await sleep(1500);
  await setActive('pg-xo');
  const r = await page.evaluate(() => {
    const out = {}; const keep = authBootChainUid;
    authBootChainUid = 'u1'; out.sameUserInGame = authShouldShowLanding({ uid: 'u1' });
    out.otherUserFirstBoot = authShouldShowLanding({ uid: 'u2' });
    document.querySelectorAll('.page').forEach((p) => p.classList.remove('active')); document.getElementById('pg-landing').classList.add('active');
    out.sameUserOnLanding = authShouldShowLanding({ uid: 'u1' });
    authBootChainUid = keep; return out;
  });
  check('نفس الحساب داخل لعبة: ما ينتقل لصفحة الهبوط', r.sameUserInGame === false, r);
  check('أول إقلاع لحساب: ينتقل للهبوط كالمعتاد', r.otherUserFirstBoot === true && r.sameUserOnLanding === true, r);

  check('بلا أخطاء JS بالصفحة', page._errors.length === 0, page._errors.slice(0, 3));
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
