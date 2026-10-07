'use strict';
// شاشات ألعاب الستريمر بتصميم «Game Screens»: الهيكل الجديد (عنوان+شارة / انضمام+مسرح / أزرار)،
// لوحة المعاينة الحيّة بالإعداد، ألوان التصنيف، وحذف السكن القديم — مع لعب حقيقي عبر الجسر الوهمي.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/game-screens.test.js
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const hideLoader = (p) => p.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; });

// صفحات الألعاب الـ29: [وسم، صفحة الإعداد، صفحة اللعبة، لون التصنيف]
const PAGES = [
  ['cr', 'setup-cr', 'cr', '#A78BFF'], ['ev', 'setup-ev', 'ev', '#F59E0B'], ['main', 'setup', 'dash', '#22D3EE'], ['guessword', 'setup-guessword', 'guessword', '#22D3EE'],
  ['sniper', 'setup-sniper', 'sniper', '#F59E0B'], ['battery', 'setup-battery', 'battery', '#A78BFF'], ['rou', 'setup-roulette', 'roulette', '#F59E0B'], ['tmr', 'setup-timer', 'timer', '#22D3EE'],
  ['bomb', 'setup-bomb', 'bomb', '#F59E0B'], ['ll', 'setup-lastletter', 'lastletter', '#A78BFF'], ['wai', 'setup-whoami', 'whoami', '#22D3EE'], ['rw', 'setup-reverseword', 'reverseword', '#A78BFF'],
  ['pgs', 'setup-priceguess', 'priceguess', '#22D3EE'], ['cs', 'setup-crownsteal', 'crownsteal', '#A78BFF'], ['lsc', 'setup-letterscramble', 'letterscramble', '#A78BFF'], ['cw', 'setup-countrywar', 'countrywar', '#F59E0B'],
  ['box', 'setup-box', 'box', '#F59E0B'], ['chairs', 'setup-chairs', 'chairs', '#F59E0B'], ['findball', 'setup-findball', 'findball', '#22D3EE'], ['wr', 'setup-wordrace', 'wordrace', '#A78BFF'],
  ['draw', 'setup-draw', 'draw', '#22D3EE'], ['tug', 'setup-tug', 'tug', '#34D399'], ['rlgl', 'setup-rlgl', 'rlgl', '#F59E0B'], ['maze', 'setup-maze', 'maze', '#A78BFF'],
  ['tt10', 'setup-tt10', 'tt10', '#A78BFF'], ['glz', 'setup-glz', 'glz', '#F59E0B'], ['volcanic-lands', 'setup-volcanic-lands', 'volcanic-lands', '#F59E0B'], ['hz', 'setup-hz', 'hz', '#F59E0B'], ['ig', 'setup-ig', 'ig', '#22D3EE'],
];

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '' });
  await page.setViewportSize({ width: 1360, height: 900 });
  await H.linkAccount(page, STREAMER);
  await hideLoader(page);

  // ---------- 1) حذف السكن القديم + الهيكل الجديد بكل الصفحات ----------
  const gone = await page.evaluate(() => ({ old: !!document.getElementById('ehsemha-sg-redesign'), neu: !!document.getElementById('ehsemha-gs'), layout: !!document.getElementById('ehsemha-gs-layout') }));
  check('السكن القديم (ehsemha-sg-redesign) محذوف والجديد موجود', !gone.old && gone.neu && gone.layout, gone);
  const struct = await page.evaluate((P) => P.map(([tag, s, g]) => {
    const sp = document.getElementById('pg-' + s), gp = document.getElementById('pg-' + g);
    const has = (el, sel) => !!(el && el.querySelector(sel));
    return { tag, setupPreview: has(sp, '.setup-box > .gs-preview'), top: has(gp, '.gs-top'), main: has(gp, '.gs-main'), side: has(gp, '.gs-side'), stage: has(gp, '.gs-stage'), foot: has(gp, '.gs-foot'),
      title: has(gp, '.gs-top .game-title-header'), strip: has(gp, '.gs-top .status-strip') || has(gp, '.status-strip'), start: has(gp, '.gs-foot .game-bottom-row') || has(gp, '.game-bottom-row') };
  }), PAGES);
  const badStruct = struct.filter((x) => !(x.setupPreview && x.top && x.main && x.side && x.stage && x.foot && x.title));
  check('كل الـ29 لعبة: لوحة معاينة بالإعداد + هيكل (top/main/side/stage/foot) بشاشة اللعبة', badStruct.length === 0, badStruct.map((x) => x.tag));

  // ---------- 2) ألوان التصنيف ----------
  const colors = await page.evaluate((P) => P.map(([tag, s, g, c]) => [tag, getComputedStyle(document.getElementById('pg-' + g)).getPropertyValue('--gs-c').trim().toUpperCase(), getComputedStyle(document.getElementById('pg-' + s)).getPropertyValue('--gs-c').trim().toUpperCase(), c]), PAGES);
  const badC = colors.filter((x) => x[1] !== x[3] || x[2] !== x[3]);
  check('لون كل لعبة بإعدادها وانتظارها حسب تصنيفها (دردشة بنفسجي، حظ كهرماني، تخمين سماوي، فرق أخضر)', badC.length === 0, badC);
  const pills = await page.evaluate(() => ['bomb', 'cr', 'tmr', 'tug'].map((t) => { const id = { bomb: 'bomb', cr: 'cr', tmr: 'timer', tug: 'tug' }[t]; return getComputedStyle(document.querySelector('#pg-' + id + ' .gth-name'), '::after').content; }));
  check('شارة التصنيف بجانب اسم اللعبة (حظ/دردشة/تخمين/فرق)', pills.join() === '"حظ","دردشة","تخمين","فرق"', pills);

  // ---------- 3) المعاينة الحيّة بالإعداد ----------
  await page.evaluate(() => show('setup-bomb'));
  await sleep(300);
  await page.fill('#bomb-kw', 'ادخلوا');
  await sleep(250);
  const pv = await page.evaluate(() => ({ kw: document.querySelector('#pg-setup-bomb .gs-pv-kw').textContent, name: document.querySelector('#pg-setup-bomb .gs-pv-name').textContent, icon: document.querySelector('#pg-setup-bomb .gs-pv-icon').textContent, rule: document.querySelector('#pg-setup-bomb .gs-pv-rule').textContent.length > 10, vis: document.querySelector('#pg-setup-bomb .gs-preview').getBoundingClientRect().width > 300 }));
  check('المعاينة الحيّة تعرض اسم اللعبة وأيقونتها وتتحدّث مع كتابة الكلمة المفتاحية', pv.kw === 'ادخلوا' && pv.name === 'القنبلة المتحركة' && !!pv.icon && pv.rule && pv.vis, pv);
  await page.evaluate(() => show('setup-cr'));
  await sleep(200);
  await page.fill('#cr-kw', 'سباق');
  const cnum = await page.$$eval('#cr-maxracers, #cr-tracklen, #pg-setup-cr input[type=number]', (els) => els.length);
  await sleep(250);
  const pv2 = await page.evaluate(() => Array.from(document.querySelectorAll('#pg-setup-cr .gs-pv-chip')).map((c) => c.textContent));
  check('المعاينة تعرض بقية الإعدادات الرقمية كشرائح (طول المضمار/أقصى متسابقين)', cnum > 0 && pv2.length >= 2, pv2);
  const nav = await page.evaluate(() => { const b = document.querySelector('#pg-setup-cr .btn-primary'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderRadius }; });
  check('زر "ابدأ اللعبة" كبير دائري بلون التصنيف (72px)', nav.h >= 70 && nav.bg === 'rgb(167, 139, 255)' && parseInt(nav.radius) >= 100, nav);

  // ---------- 4) لعب حقيقي: انتظار ← انضمام ← راوند ----------
  const g = games.find((x) => x.tag === 'bomb');
  await page.evaluate(() => { try { goHome(); } catch (e) {} });
  await H.launch(page, g);
  await hideLoader(page);
  await sleep(300);
  const w0 = await page.evaluate(() => { const p = document.getElementById('pg-bomb'); return { helper: p.querySelector('.gs-helper').textContent, idle: getComputedStyle(p.querySelector('.gs-stage-idle')).display, strip: p.querySelector('.status-strip').className }; });
  check('انتظار: نص مساعد "بانتظار أول مشارك" والمسرح الفارغ يعرض هوية اللعبة وشارة "waiting"', w0.helper === 'بانتظار أول مشارك' && w0.idle === 'flex' && /waiting/.test(w0.strip), w0);
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: 6, prefix: 'bomb_p', text: 'ادخل', identity: { isFollowerOfAnchor: true }, perMs: 40 });
  await sleep(1500);
  const w1 = await page.evaluate(() => { const p = document.getElementById('pg-bomb'); return { helper: p.querySelector('.gs-helper').textContent, count: p.querySelector('.participants-big-count').textContent, chips: p.querySelectorAll('.participants-usernames .p-username-tag').length, grid: getComputedStyle(p.querySelector('.participants-usernames')).gridTemplateColumns.split(' ').length, kwChip: p.querySelector('.game-special-btn b').textContent }; });
  check('انضمام 6 لاعبين: العدّاد 6، رقائق اللاعبين بعمودين، النص المساعد، شريحة الكلمة', w1.count === '6' && w1.chips === 6 && w1.grid === 2 && /6 لاعب جاهز/.test(w1.helper) && w1.kwChip === 'ادخل', w1);
  await page.evaluate(async () => { await startBombRound(); });
  await sleep(1200);
  const r1 = await page.evaluate(() => { const p = document.getElementById('pg-bomb'); const st = p.querySelector('.gs-stage'); return { live: st.classList.contains('has-live'), idle: getComputedStyle(p.querySelector('.gs-stage-idle')).display, strip: p.querySelector('.status-strip').className, helper: p.querySelector('.gs-helper').textContent, bomb: getComputedStyle(p.querySelector('#bomb-stage')).display, bg: getComputedStyle(p.querySelector('.status-strip')).backgroundColor }; });
  check('الراوند: المسرح يعرض القنبلة ويخفي الغلاف، الشارة خضراء "active"، والنص "الشات يتحكم"', r1.live && r1.idle === 'none' && /active/.test(r1.strip) && r1.bomb !== 'none' && r1.bg === 'rgb(52, 211, 153)' && /الشات يتحكم/.test(r1.helper), r1);
  const geom = await page.evaluate(() => { const p = document.getElementById('pg-bomb'); const m = p.querySelector('.gs-main').getBoundingClientRect(); const s = p.querySelector('.gs-side').getBoundingClientRect(); const st = p.querySelector('.gs-stage').getBoundingClientRect(); return { sideRight: s.left > st.left, noOverlap: s.left >= st.right - 1 || st.left >= s.right - 1, within: s.right <= m.right + 1 && st.left >= m.left - 1 }; });
  check('عمود الانضمام يمين المسرح (RTL) بدون تراكب', geom.sideRight && geom.noOverlap && geom.within, geom);
  // زر "ابدأ الراوند" و"رئيسية" و"ريست" ما زالت تعمل
  const btnIds = await page.evaluate(() => ['bomb-btn-round'].map((i) => !!document.getElementById(i)).concat([!!document.querySelector('#pg-bomb .gs-foot .btn-home'), !!document.querySelector('#pg-bomb .gs-foot .btn-reset'), !!document.querySelector('#pg-bomb .gs-foot .btn-kick')]));
  check('أزرار ابدأ الراوند/رئيسية/ريست/اطرد لاعب داخل صف الأسفل بنفس معرّفاتها', btnIds.every(Boolean), btnIds);
  await page.evaluate(() => { try { goHome(); } catch (e) {} });

  // ---------- 5) الجوال والتجاوب ----------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['setup-bomb', 'bomb', 'setup-tug', 'tug', 'cr']) {
    await page.evaluate((x) => { show(x); window.scrollTo(0, 0); }, id);
    await sleep(250);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cols: (() => { const el = document.querySelector('.page.active .gs-main'); return el ? getComputedStyle(el).gridTemplateColumns.split(' ').length : 1; })() }));
    check('الجوال ' + id + ': بلا تمرير أفقي وعمود واحد', m.sw <= m.iw && m.cols === 1, m);
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  // ---------- 6) شد الحبل: صندوقا الفريقين داخل عمود الانضمام (ما يتجاوزانه) ----------
  await page.evaluate(() => show('tug'));
  await sleep(300);
  const tug = await page.evaluate(() => { const p = document.getElementById('pg-tug'); const s = p.querySelector('.gs-side').getBoundingClientRect(); const w = p.querySelector('#tug-teams-wrap').getBoundingClientRect(); return { inside: w.left >= s.left - 1 && w.right <= s.right + 1, pageErr: 0 }; });
  check('شد الحبل: صندوقا الفريقين داخل عمود الانضمام', tug.inside, tug);

  check('لا أخطاء JS', page._errors.length === 0, page._errors.slice(0, 3));
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
