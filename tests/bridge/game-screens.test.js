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

// صفحات الألعاب الـ28 (القنبلة صارت لعبة 3D بإطار مستقل — يغطيها bomb3d.test.js): [وسم، صفحة الإعداد، صفحة اللعبة، لون التصنيف]
const PAGES = [
  ['cr', 'setup-cr', 'cr', '#A78BFF'], ['ev', 'setup-ev', 'ev', '#F59E0B'], ['main', 'setup', 'dash', '#22D3EE'], ['guessword', 'setup-guessword', 'guessword', '#22D3EE'],
  ['sniper', 'setup-sniper', 'sniper', '#F59E0B'], ['battery', 'setup-battery', 'battery', '#A78BFF'], ['rou', 'setup-roulette', 'roulette', '#F59E0B'], ['tmr', 'setup-timer', 'timer', '#22D3EE'],
  ['ll', 'setup-lastletter', 'lastletter', '#A78BFF'], ['wai', 'setup-whoami', 'whoami', '#22D3EE'], ['rw', 'setup-reverseword', 'reverseword', '#A78BFF'],
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
      title: has(gp, '.gs-top .game-title-header'), titleAny: has(gp, '.game-title-header'), pv: has(gp, '.gs-stage > .gs-stage-pv'), pvSetup: has(sp, '.gs-pv-stage'), strip: has(gp, '.gs-top .status-strip') || has(gp, '.status-strip'), start: has(gp, '.gs-foot .game-bottom-row') || has(gp, '.game-bottom-row') };
  }), PAGES);
  const CLASSIC = ['rou', 'cw', 'volcanic-lands'];
  const badStruct = struct.filter((x) => CLASSIC.includes(x.tag) ? !(x.setupPreview && x.pvSetup && !x.main && x.titleAny) : !(x.setupPreview && x.pvSetup && x.pv && x.top && x.main && x.side && x.stage && x.foot && x.title));
  check('كل الـ28 لعبة: لوحة معاينة بالإعداد + هيكل (top/main/side/stage/foot) بشاشة اللعبة (والثلاث الكلاسيكية بلا هيكل جديد)', badStruct.length === 0, badStruct.map((x) => x.tag));

  // ---------- 2) ألوان التصنيف ----------
  const colors = await page.evaluate((P) => P.map(([tag, s, g, c]) => [tag, getComputedStyle(document.getElementById('pg-' + g)).getPropertyValue('--gs-c').trim().toUpperCase(), getComputedStyle(document.getElementById('pg-' + s)).getPropertyValue('--gs-c').trim().toUpperCase(), c]), PAGES);
  const badC = colors.filter((x) => (CLASSIC.includes(x[0]) ? x[2] !== x[3] : (x[1] !== x[3] || x[2] !== x[3])));
  check('لون كل لعبة بإعدادها وانتظارها حسب تصنيفها (دردشة بنفسجي، حظ كهرماني، تخمين سماوي، فرق أخضر)', badC.length === 0, badC);
  const pills = await page.evaluate(() => ['sniper', 'cr', 'tmr', 'tug'].map((t) => { const id = { sniper: 'sniper', cr: 'cr', tmr: 'timer', tug: 'tug' }[t]; return getComputedStyle(document.querySelector('#pg-' + id + ' .gth-name'), '::after').content; }));
  check('شارة التصنيف بجانب اسم اللعبة (حظ/دردشة/تخمين/فرق)', pills.join() === '"حظ","دردشة","تخمين","فرق"', pills);

  // ---------- 3) معاينة الراوند الحيّة بالإعداد: تتغيّر مع كل إعداد ----------
  const setVal = async (sel, v) => { await page.fill(sel, String(v)); await sleep(220); };
  await page.evaluate(() => show('setup-cr')); await sleep(300);
  await setVal('#cr-kw', 'سباق'); await setVal('#cr-maxracers', 4); await setVal('#cr-tracklen', 55);
  const cr = await page.evaluate(() => { const p = document.querySelector('#pg-setup-cr .gs-pv-stage'); return { lanes: p.querySelectorAll('.pv-lane').length, foot: p.querySelector('.pv-foot').textContent, join: p.querySelector('.pv-join b').textContent, w: p.getBoundingClientRect().width, h: p.getBoundingClientRect().height }; });
  check('سباق الشات: المعاينة تعرض مسارات بعدد المتسابقين وطول المضمار والكلمة (4 مسارات، 55 خطوة، "سباق")', cr.lanes === 4 && /55/.test(cr.foot) && /4 من 4/.test(cr.foot) && cr.join === 'سباق' && cr.w > 400 && cr.h > 350, cr);
  await setVal('#cr-maxracers', 30);
  check('رفع أقصى المتسابقين إلى 30 يحدّث المعاينة فوراً (8 مسارات كحد أقصى للرسم و"30 مقعد")', await page.evaluate(() => { const p = document.querySelector('#pg-setup-cr .gs-pv-stage'); return p.querySelectorAll('.pv-lane').length === 8 && /8 من 30/.test(p.querySelector('.pv-foot').textContent); }));
  await page.evaluate(() => show('setup-tug')); await sleep(300);
  await setVal('#tug-team-a-name', 'الصقور'); await setVal('#tug-team-b-name', 'النمور'); await setVal('#tug-pull-kw', 'شد');
  await page.evaluate(() => { const c = document.getElementById('tug-opt-streak'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(250);
  const tug = await page.evaluate(() => { const p = document.querySelector('#pg-setup-tug .gs-pv-stage'); return { names: Array.from(p.querySelectorAll('.pv-team b')).map((b) => b.textContent), pull: p.querySelector('.pv-pull b').textContent, opt: Array.from(p.querySelectorAll('.pv-chip')).map((c) => c.textContent.trim()) }; });
  check('شد الحبل: المعاينة تعرض اسمَي الفريقين وكلمة السحب والخيار المفعّل', tug.names.join() === 'الصقور,النمور' && tug.pull === 'شد' && tug.opt.includes('مكافأة التتابع'), tug);
  await page.evaluate(() => show('setup-rlgl')); await sleep(300);
  await setVal('#rlgl-steps', 20);
  await page.selectOption('#rlgl-light-speed', 'fast'); await sleep(250);
  const rl = await page.evaluate(() => { const p = document.querySelector('#pg-setup-rlgl .gs-pv-stage'); return { steps: p.querySelectorAll('.pv-steps u').length, fast: !!p.querySelector('.pv-l-fast'), foot: p.querySelector('.pv-foot').textContent }; });
  check('الضوء الأخضر: عدد الخطوات وسرعة الضوء تنعكس بالمعاينة', rl.steps === 20 && rl.fast && /20/.test(rl.foot), rl);
  await page.evaluate(() => show('setup-maze')); await sleep(300);
  await page.selectOption('#mz-size', 'large'); await sleep(250);
  check('المتاهة: حجم المتاهة يغيّر شبكة المعاينة (15×15)', await page.evaluate(() => document.querySelectorAll('#pg-setup-maze .pv-maze u').length === 225));
  await page.evaluate(() => show('setup-hz')); await sleep(300);
  await setVal('#hz-kw', 'العب');
  check('لعبة بلا مشهد مخصّص (ضربة الحظ): رسمة اللعبة + الكلمة المفتاحية بالمعاينة', await page.evaluate(() => { const p = document.querySelector('#pg-setup-hz .gs-pv-stage'); return !!p.querySelector('.pv-art svg') && p.querySelector('.pv-join b').textContent === 'العب'; }));
  const pvAll = await page.evaluate((P) => P.map(([tag, s]) => { const el = document.querySelector('#pg-' + s + ' .gs-pv-stage'); return [tag, !!el && el.innerHTML.length > 80]; }).filter((x) => !x[1]), PAGES);
  check('معاينة الراوند موجودة ومرسومة بكل صفحات الإعداد الـ28', pvAll.length === 0, pvAll);
  await page.evaluate(() => show('setup-cr')); await sleep(250);
  const nav = await page.evaluate(() => { const b = document.querySelector('#pg-setup-cr .btn-primary'); const r = b.getBoundingClientRect(); return { h: Math.round(r.height), bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderRadius }; });
  check('زر "ابدأ اللعبة" كبير دائري بلون التصنيف (72px)', nav.h >= 70 && nav.bg === 'rgb(167, 139, 255)' && parseInt(nav.radius) >= 100, nav);

  // ---------- 3ب) دائرة الإقصاء / الدول / الأراضي البركانية: راوندها القديم بالمعاينة وصفحتها كما كانت ----------
  const old = await page.evaluate(() => {
    const q = (id, sel) => { const el = document.querySelector('#pg-setup-' + id + ' .gs-pv-stage'); return el ? { has: !!el.querySelector(sel), w: Math.round(el.getBoundingClientRect().width) } : null; };
    return { rou: q('roulette', '.pv-old .rd-stage .rd-num-gold'), cw: q('countrywar', '.pv-old .rd-stage .rd-num-gold'), vl: q('volcanic-lands', '.pv-old .vl-stage .vl-tower'),
      dupIds: ['rou-wheel-section', 'cw-wheel-section', 'volcanic-lands-stage', 'rou-stage', 'cw-stage'].filter((i) => document.querySelectorAll('[id="' + i + '"]').length > 1),
      layout: ['roulette', 'countrywar', 'volcanic-lands'].map((g) => !!document.querySelector('#pg-' + g + ' .gs-main')),
      chat: ['roulette', 'countrywar', 'volcanic-lands'].map((g) => getComputedStyle(document.querySelector('#pg-' + g + ' .panel-right')).display) };
  });
  check('معاينة الإعداد للثلاث تعرض تصميم الراوند القديم نفسه (rd-stage للدائرة والدول، vl-stage للبركانية) بلا تكرار معرّفات', old.rou && old.rou.has && old.cw && old.cw.has && old.vl && old.vl.has && old.dupIds.length === 0, old);
  check('الثلاث: صفحة اللعبة بشكلها القديم (بلا هيكل gs-main) والشات محذوف منها أيضاً', old.layout.every((x) => !x) && old.chat.every((d) => d === 'none'), old);
  await page.evaluate(() => show('setup-volcanic-lands')); await sleep(250);
  await page.selectOption('#volcanic-lands-difficulty', 'hell'); await page.fill('#volcanic-lands-duration', '35'); await sleep(300);
  check('الأراضي البركانية: إعدادات المدة والصعوبة تنعكس بتذييل المعاينة', await page.evaluate(() => { const f = document.querySelector('#pg-setup-volcanic-lands .gs-pv-stage .pv-foot'); return !!f && /35/.test(f.textContent); }));

  // ---------- 4) لعب حقيقي: انتظار ← انضمام ← راوند ----------
  const g = games.find((x) => x.tag === 'box');
  await page.evaluate(() => { try { goHome(); } catch (e) {} });
  await H.launch(page, g);
  await hideLoader(page);
  await sleep(300);
  const w0 = await page.evaluate(() => { const p = document.getElementById('pg-box'); return { helper: p.querySelector('.gs-helper').textContent, idle: getComputedStyle(p.querySelector('.gs-stage-pv')).display, pvH: p.querySelector('.gs-stage-pv').getBoundingClientRect().height, chat: getComputedStyle(p.querySelector('.panel-right')).display, strip: p.querySelector('.status-strip').className }; });
  check('الشات الجانبي محذوف (panel-right مخفي) والمسرح بعرض الصفحة', w0.chat === 'none', w0.chat);
  check('انتظار: نص مساعد "بانتظار أول مشارك" ومعاينة الراوند ظاهرة وشارة "waiting"', w0.helper === 'بانتظار أول مشارك' && w0.idle === 'flex' && /waiting/.test(w0.strip) && w0.pvH > 300, w0);
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: 6, prefix: 'box_p', text: 'ادخل', identity: { isFollowerOfAnchor: true }, perMs: 40 });
  await sleep(1500);
  const w1 = await page.evaluate(() => { const p = document.getElementById('pg-box'); return { helper: p.querySelector('.gs-helper').textContent, count: p.querySelector('.participants-big-count').textContent, chips: p.querySelectorAll('.participants-usernames .p-username-tag').length, grid: getComputedStyle(p.querySelector('.participants-usernames')).gridTemplateColumns.split(' ').length, kwChip: p.querySelector('.game-special-btn b').textContent }; });
  check('انضمام 6 لاعبين: العدّاد 6، رقائق اللاعبين بعمودين، النص المساعد، شريحة الكلمة', w1.count === '6' && w1.chips === 6 && w1.grid === 2 && /6 لاعب جاهز/.test(w1.helper) && w1.kwChip === 'ادخل', w1);
  const geom = await page.evaluate(() => { const p = document.getElementById('pg-box'); const m = p.querySelector('.gs-main').getBoundingClientRect(); const s = p.querySelector('.gs-side').getBoundingClientRect(); const st = p.querySelector('.gs-stage').getBoundingClientRect(); return { sideRight: s.left > st.left, noOverlap: s.left >= st.right - 1 || st.left >= s.right - 1, within: s.right <= m.right + 1 && st.left >= m.left - 1 }; });
  check('عمود الانضمام يمين المسرح (RTL) بدون تراكب', geom.sideRight && geom.noOverlap && geom.within, geom);
  await page.evaluate(async () => { await startBoxRound(); });
  await sleep(1200);
  const r1 = await page.evaluate(() => { const p = document.getElementById('pg-box'); const st = p.querySelector('.gs-stage'); return { live: st.classList.contains('has-live'), idle: getComputedStyle(p.querySelector('.gs-stage-pv')).display, strip: p.querySelector('.status-strip').className, helper: p.querySelector('.gs-helper').textContent, bomb: getComputedStyle(p.querySelector('#box-stage')).display, bg: getComputedStyle(p.querySelector('.status-strip')).backgroundColor }; });
  check('الراوند: المسرح يعرض المسرح ويخفي الغلاف، الشارة خضراء "active"، والنص "الشات يتحكم"', r1.live && r1.idle === 'none' && /active/.test(r1.strip) && r1.bomb !== 'none' && r1.bg === 'rgb(52, 211, 153)' && /الشات يتحكم/.test(r1.helper), r1);
  await page.mouse.move(600, 500); await sleep(450);
  const live = await page.evaluate(() => { const p = document.getElementById('pg-box'); const R = (e) => e.getBoundingClientRect(); const st = p.querySelector('.gs-stage'); const foot = p.querySelector('.gs-foot');
    return { cls: p.classList.contains('gs-live'), side: getComputedStyle(p.querySelector('.gs-side')).display, top: getComputedStyle(p.querySelector('.gs-top')).display, bar: getComputedStyle(p.querySelector('.top-bar')).display, pos: getComputedStyle(st).position, w: Math.round(R(st).width), h: Math.round(R(st).height), iw: innerWidth, ih: innerHeight, footOp: getComputedStyle(foot).opacity, zoom: parseFloat(p.style.getPropertyValue('--gs-zoom')), helper: getComputedStyle(p.querySelector('.gs-helper')).display }; });
  check('الراوند بملء الشاشة: كل شيء مخفي (العنوان/الانضمام/العدّاد/الأزرار) والمسرح fixed بحجم النافذة', live.cls && live.side === 'none' && live.top === 'none' && live.bar === 'none' && live.pos === 'fixed' && live.w === live.iw && live.h === live.ih && live.footOp === '0' && live.helper === 'none', live);
  check('محتوى الراوند يكبّر ليملأ الشاشة (zoom > 1)', live.zoom > 1.2, live.zoom);
  await page.mouse.move(600, 6); await sleep(500);
  const bar = await page.evaluate(() => { const f = document.querySelector('#pg-box .gs-foot'); return { op: getComputedStyle(f).opacity, btns: Array.from(f.querySelectorAll('button')).filter((b) => b.offsetParent !== null).map((b) => b.className.split(' ')[0]) }; });
  check('عند تمرير الماوس أعلى الشاشة يظهر شريط (رئيسية/ريست/اطرد لاعب) فقط', bar.op === '1' && bar.btns.includes('btn-home') && bar.btns.includes('btn-reset') && bar.btns.includes('btn-kick') && !bar.btns.includes('btn-start-round'), bar);
  await page.mouse.move(600, 500);
  await page.evaluate(() => { const st = document.querySelector('#pg-box .status-strip'); st.className = 'status-strip finished'; }); await sleep(600);
  check('عند انتهاء الراوند (الشارة finished) يرجع هيكل الانتظار ويزول وضع الملء الكامل', await page.evaluate(() => { const p = document.getElementById('pg-box'); return !p.classList.contains('gs-live') && getComputedStyle(p.querySelector('.gs-side')).display !== 'none'; }));
  // زر "ابدأ الراوند" و"رئيسية" و"ريست" ما زالت تعمل
  const btnIds = await page.evaluate(() => ['box-btn-round'].map((i) => !!document.getElementById(i)).concat([!!document.querySelector('#pg-box .gs-foot .btn-home'), !!document.querySelector('#pg-box .gs-foot .btn-reset'), !!document.querySelector('#pg-box .gs-foot .btn-kick')]));
  check('أزرار ابدأ الراوند/رئيسية/ريست/اطرد لاعب داخل صف الأسفل بنفس معرّفاتها', btnIds.every(Boolean), btnIds);
  await page.evaluate(() => { try { goHome(); } catch (e) {} });

  // ---------- 5) الجوال والتجاوب ----------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ['setup-sniper', 'sniper', 'setup-tug', 'tug', 'cr']) {
    await page.evaluate((x) => { show(x); window.scrollTo(0, 0); }, id);
    await sleep(250);
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, cols: (() => { const el = document.querySelector('.page.active .gs-main'); return el ? getComputedStyle(el).gridTemplateColumns.replace(/\([^)]*\)/g, 'X').split(' ').length : 1; })() }));
    check('الجوال ' + id + ': بلا تمرير أفقي وعمود واحد', m.sw <= m.iw && m.cols === 1, m);
  }
  await page.setViewportSize({ width: 1360, height: 900 });

  // ---------- 6) شد الحبل: صندوقا الفريقين داخل عمود الانضمام (ما يتجاوزانه) ----------
  await page.evaluate(() => show('tug'));
  await sleep(300);
  const tug2 = await page.evaluate(() => { const p = document.getElementById('pg-tug'); const s = p.querySelector('.gs-side').getBoundingClientRect(); const w = p.querySelector('#tug-teams-wrap').getBoundingClientRect(); return { inside: w.left >= s.left - 1 && w.right <= s.right + 1, pageErr: 0 }; });
  check('شد الحبل: صندوقا الفريقين داخل عمود الانضمام', tug2.inside, tug2);

  check('لا أخطاء JS', page._errors.length === 0, page._errors.slice(0, 3));
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
