'use strict';
// شاشة الفوز الجديدة (EhsemhaWin) لألعاب الستريمر الـ27 (26 داخل index.html + القنبلة داخل bomb3d.html).
// كل لعبة تُطلَق فعلاً بدالتها الأصلية ثم تُستدعى دالة الفوز الأصلية للعبة (نفس المسار الذي تسلكه اللعبة عند الفوز)،
// ويُفحَص ما يراه المتفرّج: الاسم/الصورة/الأزرار/لا بقايا للشاشة القديمة/الأزرار تنفّذ سلوكها الأصلي.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/win-screen.test.js
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const G = (tag) => Object.assign({}, games.find((g) => g.tag === tag));
const say = (viewer, text, nick) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: true } });
async function waitFor(page, fn, arg, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); }
  return false;
}
const AV = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#e0457b"/><circle cx="100" cy="82" r="38" fill="#f3d0b3"/></svg>');
const NAME = 'سلطان العتيبي';

// [وسم اللعبة بملف games.js، صفحة الفوز (بدون pg-)، تعبير التشغيل (U = اللاعب الفائز)، فحص نص مساعد اختياري، زر أول متوقّع بعد الضغط]
const CASES = [
  ['main', 'winner', "showWinner(U, true)", /قمر|الكلمة/],
  ['gw', 'guessword-winner', "gwShowWinner(U)", null],
  ['battery', 'battery-winner', "(batteryFinished = false, batteryCharge = 99, (function(){ for (let i = 0; i < 300 && !batteryFinished; i++) batteryApplyCharge(U); })())", /البطارية/],
  ['sniper', 'sniper-winner', "showSniperWinner(U)", null],
  ['hz', 'hz-winner', "showHzWinner(U)", /نجا/],
  ['rou', 'rou-winner', "showRouWinner(U)", null],
  ['tmr', 'timer-winner', "showTimerWinner({ user: U, golden: true, time: 5.01 })", /5\.01/],
  ['box', 'box-winner', "showBoxWinner(U)", null],
  ['cr', 'cr-winner', "crShowWinner(U)", null],
  ['mz', 'maze-winner', "mzShowWinner(U)", /المتاهة|التاج/],
  ['ev', 'ev-winner', "evShowWinner(U)", null],
  ['ll', 'lastletter-winner', "showLLWinner(U)", null],
  ['wai', 'whoami-winner', "waiShowWinner(U)", null],
  ['ig', 'ig-winner', "igShowWinner(U)", null],
  ['rw', 'reverseword-winner', "rwShowWinner(U)", null],
  ['pgs', 'priceguess-winner', "pgsShowWinner(U, 1500, true, true)", null],
  ['lsc', 'letterscramble-winner', "lscShowWinner(U)", null],
  ['wr', 'wordrace-winner', "wrShowWinner(U)", null],
  ['draw', 'draw-winner', "drawShowWinner(U)", /الرسمة/],
  ['cw', 'countrywar-winner', "showCWWinner(U, 'السعودية', '🇸🇦')", null],
  ['cs', 'crownsteal-winner', "csShowWinner(U)", null],
  ['chairs', 'chairs-winner', "chairsShowWinner(U, false)", null],
  ['findball', 'findball-winner', "findballShowWinner(U)", null],
  ['rlgl', 'rlgl-winner', "rlglShowWinner(U)", null],
  ['tt10', 'tt10-winner', "(tt10Scores.clear(), tt10Scores.set(U.uniqueId, { user: U, score: 12 }), tt10ShowFinalWinner())", /12/],
  ['glz', 'glz-winner', "(glzParticipants.set(U.uniqueId, U), glzAlive.clear(), glzAlive.add(U.uniqueId), glzShowWinner())", null]
];

const ovl = (page) => page.evaluate(() => {
  const r = document.getElementById('ehsemha-win'); if (!r) return null;
  const q = (s) => r.querySelector(s);
  const img = document.getElementById('ehsemha-win-img');
  const cs = getComputedStyle(r), rect = r.getBoundingClientRect();
  return {
    visible: !r.hidden && cs.display !== 'none', name: document.getElementById('ehsemha-win-name').textContent, tag: document.getElementById('ehsemha-win-tag').textContent,
    meta: document.getElementById('ehsemha-win-meta').hidden ? '' : document.getElementById('ehsemha-win-meta').textContent,
    img: !!(img.getAttribute('src')), imgReady: img.classList.contains('is-ready'), letter: document.getElementById('ehsemha-win-letter').textContent,
    btns: [...document.querySelectorAll('#ehsemha-win-actions button')].map((b) => ({ t: b.textContent, p: b.classList.contains('ehsemha-win-btn--primary'), d: b.disabled })),
    full: Math.round(rect.width) === innerWidth && Math.round(rect.height) === innerHeight, z: cs.zIndex, page: (document.querySelector('.page.active') || {}).id,
    hit: (() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return !!(e && r.contains(e)); })()
  };
});

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(([n, a]) => { window.U = { uniqueId: 'tiktok:win_u1', nickname: n, avatar: a, platform: 'tiktok' }; window.U2 = { uniqueId: 'tiktok:win_u2', nickname: 'نورة Queen', avatar: '' }; window.U3 = { uniqueId: 'tiktok:win_u3', nickname: 'ShadowWolf_77', avatar: '' }; window.__toast = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (t.classList.contains('show')) window.__toast.push(1); }).observe(t, { attributes: true, attributeFilter: ['class'] }); }, [NAME, AV]);

  // ----- هيكل: الشاشة القديمة محذوفة لكل الصفحات الـ26 -----
  const pages = CASES.map((c) => c[1]);
  const old = await page.evaluate((P) => P.map((p) => { const el = document.getElementById('pg-' + p); return { p, visibleOld: !!el.querySelector('.w-confetti, .winner-box:not([hidden]) .w-congrats') && getComputedStyle(el.querySelector('.ehsemha-win-carrier') || el).display !== 'none', confetti: el.querySelectorAll('.w-confetti').length, carrier: !!el.querySelector('.ehsemha-win-carrier[hidden]'), carrierDisp: getComputedStyle(el.querySelector('.ehsemha-win-carrier')).display, again: el.querySelectorAll('.btn-again,.back-btn,.btn-primary,.btn-secondary').length }; }), pages);
  check('الشاشات القديمة محذوفة بصرياً من الصفحات الـ26 (لا confetti/لا أزرار قديمة ظاهرة، المحتوى حاملات بيانات مخفية)', old.every((o) => o.confetti === 0 && o.carrier && o.carrierDisp === 'none' && o.again === 0), old.filter((o) => !(o.confetti === 0 && o.carrier && o.carrierDisp === 'none' && o.again === 0)));
  check('مكوّن EhsemhaWin محمّل ومخفي افتراضياً', await page.evaluate(() => !!window.EhsemhaWin && document.getElementById('ehsemha-win').hidden === true));

  // ----- كل لعبة: تُطلَق ← دالة الفوز الأصلية ← الشاشة الجديدة -----
  for (const [tag, wp, expr, metaRe] of CASES) {
    await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(150);
    const e0 = page._errors.length;
    const g = G(tag); if (!g.tag) { check('[' + tag + '] إعداد اللعبة موجود في games.js', false); continue; }
    if (tag === 'gw') g.inputs = Object.assign({}, g.inputs, { 'gw-inp-word': 'زرافة' });
    const lr = await H.launch(page, g);
    await page.evaluate((expr) => { (0, eval)(expr.replace(/\bU\b/g, 'window.U')); }, expr).catch((e) => { page._errors.push('trigger:' + e.message); });
    const shown = await waitFor(page, (wp) => document.querySelector('.page.active').id === 'pg-' + wp && !document.getElementById('ehsemha-win').hidden, wp, 6000);
    await sleep(350);
    const o = await ovl(page);
    const okShape = shown && o && o.name === NAME && o.tag === 'حسمها!' && o.btns.length >= 1 && o.btns[0].p && o.full && o.hit;
    check('[' + tag + '] الشاشة الجديدة تظهر عند الفوز: الاسم + شعار «حسمها!» + أزرار + تغطي الشاشة', okShape, { shown, o, lr: lr.err });
    check('[' + tag + '] صورة الفائز تُحمَّل في الحلقة' + (o && o.meta ? ' | نص: ' + o.meta : ''), o && o.img && o.imgReady, o);
    if (metaRe) check('[' + tag + '] النص المساعد يحمل معلومة الفوز', o && metaRe.test(o.meta), o && o.meta);
    check('[' + tag + '] لا أخطاء JS أثناء العرض', page._errors.length === e0, page._errors.slice(e0));
    // الزر الأول ينفّذ سلوكه الأصلي (الرئيسية/راوند جديد/…) وتختفي الشاشة
    if (o && o.btns.length) {
      await page.click('#ehsemha-win-actions button:first-child').catch(() => {});
      const gone = await waitFor(page, () => document.getElementById('ehsemha-win').hidden, null, 4000);
      const after = await page.evaluate(() => (document.querySelector('.page.active') || {}).id);
      check('[' + tag + '] الزر «' + o.btns[0].t + '» يخفي الشاشة وينقل لصفحة أخرى (' + after + ')', gone && after !== 'pg-' + wp, { gone, after });
    }
  }

  // ----- حالات خاصة -----
  // ضربة الحظ: عدة فائزين
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(150);
  await H.launch(page, G('hz'));
  await page.evaluate(() => showHzWinner([window.U, window.U2, window.U3])); await sleep(450);
  const hzm = await ovl(page);
  check('ضربة الحظ بعدة فائزين: تُعرض أسماؤهم معاً وشارة «كل من نجا فاز»', hzm && hzm.visible && hzm.name.includes(NAME) && hzm.name.includes('نورة') && hzm.tag === 'كل من نجا فاز', hzm);
  // بلا فائز
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(150);
  await H.launch(page, G('glz'));
  await page.evaluate(() => { glzAlive.clear(); glzShowWinner(); }); await sleep(450);
  const nw = await ovl(page);
  check('بلا فائز: «انتهى الراوند» + «لا يوجد فائز» (بلا صورة)', nw && nw.visible && nw.name === 'انتهى الراوند' && nw.tag === 'لا يوجد فائز' && !nw.img && nw.meta === '', nw);
  // اسم طويل جداً وأحرف مختلطة
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(150);
  await H.launch(page, G('sniper'));
  const LONG = 'محمد عبدالرحمن بن سلطان بن عبدالعزيز آل سعود الكبير جدا جدا <img src=x onerror=alert(1)>';
  await page.evaluate((n) => { window.U = { uniqueId: 'tiktok:long1', nickname: n, avatar: '' }; showSniperWinner(window.U); }, LONG); await sleep(500);
  const lg = await page.evaluate(() => ({ name: document.getElementById('ehsemha-win-name').textContent, html: document.getElementById('ehsemha-win-name').innerHTML.includes('<img'), imgs: document.querySelectorAll('#ehsemha-win img[onerror]').length, h: document.getElementById('ehsemha-win-name').getBoundingClientRect().height, sw: document.documentElement.scrollWidth, iw: innerWidth }));
  check('اسم طويل مع HTML خبيث: يُعرض نصاً فقط (لا حقن) ولا يكسر التخطيط', lg.name.includes('<img') && !lg.html && lg.imgs === 0 && lg.h < 140 && lg.sw <= lg.iw, lg);
  // فائز بلا صورة: حرف أول
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(150);
  await H.launch(page, G('rou'));
  await page.evaluate(() => { window.U = { uniqueId: 'tiktok:noav', nickname: 'Khalid', avatar: '' }; showRouWinner(window.U); }); await sleep(500);
  const na = await ovl(page);
  check('فائز بلا صورة: يظهر حرفه الأول داخل الحلقة', na && !na.img && na.letter === 'K', na);
  // فوز مكرّر لنفس الصفحة وهي معروضة لا يعيد الأنيميشن
  const before = await page.evaluate(() => EhsemhaWin.state().shown);
  await page.evaluate(() => { show('rou-winner'); show('rou-winner'); });
  await sleep(200);
  check('إعادة show لنفس صفحة الفوز وهي معروضة لا تُعيد تشغيل الشاشة', (await page.evaluate(() => EhsemhaWin.state().shown)) === before);
  // الانتقال لصفحة غير الفوز يخفيها ولا يترك مؤقّتات/جزيئات
  await page.evaluate(() => goHome()); await sleep(300);
  const st = await page.evaluate(() => EhsemhaWin.state());
  check('الخروج: الشاشة مخفية بلا مؤقّتات ولا رسم جزيئات', !st.visible && st.timers === 0 && !st.rafActive && st.particles === 0, st);

  // لعب حقيقي كامل: اوجد الكلمة (main) — الفائز يُكتشف من الشات الحقيقي (جسر محاكى)
  const mg = G('main'); await H.launch(page, mg);
  for (const [v, n] of [['wv1', 'منى'], ['wv2', 'خالد']]) await say(v, 'ادخل', n);
  await waitFor(page, () => participants.size === 2, null, 8000);
  await page.evaluate(() => startRound());
  await waitFor(page, () => gameStatus === 'active', null, 6000);
  await say('wv1', 'غلط', 'منى'); await say('wv2', 'قمر', 'خالد');
  const nat = await waitFor(page, () => !document.getElementById('ehsemha-win').hidden, null, 8000);
  const no = await ovl(page);
  check('لعب فعلي (اوجد الكلمة): تخمين صحيح من الشات ← الشاشة الجديدة باسم الفائز مرة واحدة', nat && no.name === 'خالد' && (await page.evaluate(() => EhsemhaWin.state().shown)) >= 1, no);
  check('اللعب الفعلي: بلا أخطاء JS', page._errors.length === 0, page._errors);
  await page.screenshot({ path: process.env.WIN_SHOT_DESKTOP || '/tmp/win-desktop.png' });

  // ----- الجوال (عمودي وأفقي) -----
  for (const [w, h, label] of [[390, 844, 'جوال عمودي'], [844, 390, 'جوال أفقي'], [360, 640, 'جوال صغير']]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(400);
    const m = await page.evaluate(() => { const r = document.getElementById('ehsemha-win'); const bs = [...document.querySelectorAll('#ehsemha-win-actions button')].map((b) => b.getBoundingClientRect()); const av = document.getElementById('ehsemha-win-av').getBoundingClientRect(); const nm = document.getElementById('ehsemha-win-name').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, ih: innerHeight, btnIn: bs.every((b) => b.left >= -1 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1 && b.top >= 0), nameIn: nm.left >= -1 && nm.right <= innerWidth + 1, avSize: Math.round(av.width), btnH: Math.min(...bs.map((b) => b.height)), vis: !r.hidden }; });
    check(label + ' (' + w + '×' + h + '): بلا تمرير أفقي، الأزرار والاسم داخل الشاشة، الأزرار بحجم لمس مريح', m.vis && m.sw <= m.iw && m.btnIn && m.nameIn && m.btnH >= 44, m);
    if (w === 390) await page.screenshot({ path: process.env.WIN_SHOT_MOBILE || '/tmp/win-mobile.png' });
  }
  await page.setViewportSize({ width: 1366, height: 800 }); await sleep(300);

  // ----- إتاحة وحركة مخفّضة -----
  const a11y = await page.evaluate(() => { const r = document.getElementById('ehsemha-win'); return { role: r.getAttribute('role'), modal: r.getAttribute('aria-modal'), lab: r.getAttribute('aria-labelledby'), focus: (document.activeElement || {}).className || '' }; });
  check('إتاحة: role=dialog وaria-modal وعنوان مرتبط، والتركيز على الزر الأساسي', a11y.role === 'dialog' && a11y.modal === 'true' && a11y.lab === 'ehsemha-win-name' && /btn--primary/.test(a11y.focus), a11y);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { goHome(); }); await sleep(150);
  await H.launch(page, G('sniper')); await page.evaluate(() => showSniperWinner(window.U)); await sleep(400);
  const rm = await page.evaluate(() => ({ reduced: document.getElementById('ehsemha-win').classList.contains('is-reduced'), anim: getComputedStyle(document.getElementById('ehsemha-win-name')).animationName, vis: !document.getElementById('ehsemha-win').hidden, op: getComputedStyle(document.getElementById('ehsemha-win-actions')).opacity }));
  check('تقليل الحركة: الشاشة تظهر كاملة بلا أنيميشن', rm.reduced && rm.anim === 'none' && rm.vis && rm.op === '1', rm);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const pass = results.filter((r) => r.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  results.filter((r) => !r.ok).forEach((r) => console.log('  ✗ ' + r.name));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
