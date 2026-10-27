'use strict';
// فحص الصفحة الرئيسية الجديدة (تصميم Lobby) داخل index.html الحقيقي: التصميم القديم محذوف،
// الشبكة مرسومة من سجل البطاقات (#pg-home .games-grid .gcard)، وكل ربط بالموقع يعمل
// (تشغيل الألعاب، الصيانة/الشارات/الترتيب/التثبيت، أوضاع اللعب، شارة الاتصال…).
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/lobby.test.js
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { serveSite } = require('./harness');

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

async function open(browser, opts, port) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page._errors = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_CERT|net::|firebase|gstatic|googleapis/i.test(m.text())) page._errors.push('console: ' + m.text().slice(0, 200)); });
  await page.goto('http://127.0.0.1:' + port + '/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; show('home'); window.scrollTo(0, 0); });
  await page.waitForTimeout(300);
  return page;
}
const shown = (p) => p.evaluate(() => Array.from(document.querySelectorAll('#hlob-grid .hlob-card')).map((c) => c.dataset.tag));
const settle = (p) => p.waitForTimeout(120);

(async () => {
  await serveSite(8767);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await open(browser, { viewport: { width: 1280, height: 900 } }, 8767);

  // ---------- 1) التصميم القديم محذوف ----------
  const old = await page.evaluate(() => ({
    hero: !!document.querySelector('.home-hero'), modeCard: !!document.querySelector('.home-mode-card'), libHead: !!document.querySelector('.home-lib-head'),
    redesignCss: !!document.getElementById('ehsemha-home-redesign'), ghost: typeof homeInjectGameGhostIcons, anim: typeof homeCardAnimObserverBoot,
    ghostEls: document.querySelectorAll('.gcard-ghost').length, lobbyCss: !!document.getElementById('ehsemha-lobby'),
  }));
  check('التصميم القديم محذوف (hero/mode-card/lib-head/css/ghost)', !old.hero && !old.modeCard && !old.libHead && !old.redesignCss && old.ghost === 'undefined' && old.anim === 'undefined' && old.ghostEls === 0 && old.lobbyCss, old);

  // ---------- 2) الشبكة من السجل ----------
  const reg = await page.evaluate(() => Array.from(document.querySelectorAll('#pg-home .games-grid.hlob-registry .gcard[data-tag]')).map((c) => ({ tag: c.dataset.tag, name: c.querySelector('.gcard-name').textContent.trim(), onclick: c.getAttribute('onclick') })));
  const tags = await shown(page);
  check('38 بطاقة بالسجل + 38 بالواجهة بنفس الترتيب (المدفع البشري أولاً)', reg.length === 38 && tags.length === 38 && tags[0] === 'cannon' && tags.join() === reg.map((r) => r.tag).join(), { reg: reg.length, tags: tags.length });
  const names = await page.evaluate(() => Array.from(document.querySelectorAll('#hlob-grid .hlob-card h3')).map((h) => h.textContent));
  check('أسماء البطاقات = أسماء السجل', names.join('|') === reg.map((r) => r.name).join('|'));
  const art = await page.evaluate(() => Array.from(document.querySelectorAll('#hlob-grid .hlob-card')).filter((c) => !c.querySelector('.hlob-art svg')).map((c) => c.dataset.tag));
  check('لكل بطاقة رسمة SVG', art.length === 0, art);
  check('الرسمة تتحرك مع --hv بالـCSS (hover)', await page.evaluate(() => { const c = document.querySelector('#hlob-grid .hlob-card'); const a = getComputedStyle(c).getPropertyValue('--hv').trim(); return a === '0'; }));
  const ids = await page.evaluate(() => ['home-conn-badge', 'home-conn-badge-text', 'home-platform-status-bar', 'home-live-counter', 'home-live-counter-num', 'home-quick-reconnect-btn', 'home-quick-reconnect-user', 'home-event-cta-btn', 'home-discord-cta', 'home-discord-btn', 'home-event-winners', 'hew-duration-avatar', 'hew-duration-name', 'hew-duration-value', 'hew-wins-avatar', 'hew-wins-name', 'hew-wins-value', 'home-lib-head', 'home-lib-count', 'home-lib-filters'].filter((i) => !document.getElementById(i)));
  check('كل عناصر الرئيسية التي تعتمد عليها بقية الشيفرة موجودة', ids.length === 0, ids);
  const sumTxt = await page.evaluate(() => document.getElementById('hlob-summary').textContent + '|' + document.getElementById('home-lib-count').textContent);
  check('الملخّص والعدّاد', sumTxt === '٣٨ لعبة — ٥ فئات|٣٨ لعبة', sumTxt);

  // ---------- 3) فلاتر وبحث ----------
  const counts = {};
  for (const cat of ['chat', 'teams', 'luck', 'guess']) {
    await page.click('#home-lib-filters [data-filter="' + cat + '"]'); await settle(page);
    counts[cat] = (await shown(page)).length;
  }
  const regCounts = await page.evaluate(() => { const o = {}; document.querySelectorAll('#pg-home .gcard[data-tag]').forEach((c) => { o[c.dataset.category] = (o[c.dataset.category] || 0) + 1; }); return o; });
  check('الفلاتر تطابق data-category بالسجل', JSON.stringify(counts) === JSON.stringify({ chat: regCounts.chat, teams: regCounts.teams, luck: regCounts.luck, guess: regCounts.guess }), { counts, regCounts });
  check('الفلتر النشط aria-pressed + زر إعادة الضبط', await page.evaluate(() => document.querySelector('#home-lib-filters .home-lib-filter.active').dataset.filter === 'guess' && document.querySelector('#home-lib-filters .active').getAttribute('aria-pressed') === 'true' && getComputedStyle(document.getElementById('hlob-reset')).display !== 'none'));
  await page.click('#hlob-reset'); await settle(page);
  check('إعادة الضبط ترجع 38', (await shown(page)).length === 38);
  await page.fill('#hlob-q', 'شد'); await settle(page);
  let sres = await shown(page);
  check('بحث "شد" يجيب شد الحبل', sres.includes('tug'), sres);
  await page.fill('#hlob-q', 'الكلمه'); await settle(page);
  sres = await shown(page);
  check('البحث يتجاهل ة/ه (تطبيع عربي): "الكلمه" ← اوجد الكلمة', sres.includes('main'), sres);
  await page.fill('#hlob-q', 'اوجد'); await settle(page);
  check('البحث بالأوجد/أ-ا', (await shown(page)).includes('main'));
  await page.fill('#hlob-q', 'zzzxxx'); await settle(page);
  check('لا نتائج ← حالة فارغة ظاهرة والشبكة فاضية', (await shown(page)).length === 0 && await page.evaluate(() => getComputedStyle(document.getElementById('hlob-empty')).display !== 'none'));
  check('عدّاد النتائج "٠ من ٣٠ لعبة"', (await page.textContent('#home-lib-count')) === '٠ من ٣٨ لعبة');
  await page.click('#hlob-empty [data-hlob="reset"]'); await settle(page);
  check('"عرض كل الألعاب" يمسح البحث', (await shown(page)).length === 38 && (await page.inputValue('#hlob-q')) === '');
  await page.fill('#hlob-q', 'سباق'); await settle(page);
  await page.click('.hlob-clear'); await settle(page);
  check('زر مسح البحث', (await shown(page)).length === 38 && (await page.inputValue('#hlob-q')) === '');
  await page.evaluate(() => homeApplyFilter('chat')); await settle(page);
  check('واجهة homeApplyFilter القديمة ما زالت تعمل', (await shown(page)).length === regCounts.chat);
  await page.evaluate(() => homeApplyFilter('all')); await settle(page);

  // ---------- 4) تشغيل الألعاب ----------
  await page.evaluate(() => { window.__calls = []; document.querySelectorAll('#pg-home .gcard[data-tag]').forEach((c) => { const m = /^(\w+)\(/.exec(c.getAttribute('onclick')); if (m) window[m[1]] = () => window.__calls.push(m[1]); }); });
  await page.evaluate(() => document.querySelector('#hlob-grid .hlob-card[data-tag="cr"] [data-hlob="start"]').click());
  await page.evaluate(() => document.querySelector('#hlob-grid .hlob-card[data-tag="tug"] [data-hlob="start"]').click());
  check('"ابدأ اللعبة" يشغّل onclick الأصلي للعبة (سباق الشات + شد الحبل)', JSON.stringify(await page.evaluate(() => window.__calls)) === '["goSetupCr","goSetupTug"]', await page.evaluate(() => window.__calls));
  // كل لعبة تصل لدالة بدايتها الخاصة
  const allStart = await page.evaluate(() => { window.__calls = []; const want = []; document.querySelectorAll('#pg-home .gcard[data-tag]').forEach((c) => { const m = /^(\w+)\(/.exec(c.getAttribute('onclick')); want.push(m[1]); document.querySelector('#hlob-grid .hlob-card[data-tag="' + c.dataset.tag + '"] [data-hlob="start"]').click(); }); return { want, got: window.__calls }; });
  check('كل الـ38 لعبة: زر "ابدأ" يستدعي دالتها بالضبط وبالترتيب', JSON.stringify(allStart.want) === JSON.stringify(allStart.got) && allStart.want.length === 38, allStart.got.length);

  // ---------- 5) نافذة التفاصيل ----------
  await page.evaluate(() => { window.__calls = []; });
  await page.focus('#hlob-grid .hlob-card[data-tag="tug"] [data-hlob="open"]');
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  const dlg = await page.evaluate(() => ({ on: document.getElementById('hlob-dlg-ov').classList.contains('on'), title: document.getElementById('dlg-title').textContent, cmd: document.getElementById('hlob-dlg-cmd').textContent, focus: document.activeElement && document.activeElement.id, ov: document.documentElement.style.overflow, art: !!document.querySelector('#hlob-dlg-art-in svg'), desc: document.getElementById('hlob-dlg-desc').textContent.length }));
  check('التفاصيل: تفتح بالكيبورد، العنوان/الأمر/الرسمة، والتركيز على زر الإغلاق وتثبيت التمرير', dlg.on && dlg.title === 'شد الحبل' && /الشات/.test(dlg.cmd) && dlg.art && dlg.desc > 20 && dlg.focus === 'dlg-close' && dlg.ov === 'hidden', dlg);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const closed = await page.evaluate(() => ({ on: document.getElementById('hlob-dlg-ov').classList.contains('on'), ov: document.documentElement.style.overflow, focus: document.activeElement && document.activeElement.getAttribute('data-hlob') + ':' + document.activeElement.dataset.tag }));
  check('Escape يغلق، يرجّع التمرير، ويعيد التركيز لزر "التفاصيل"', !closed.on && closed.ov === '' && closed.focus === 'open:tug', closed);
  await page.click('#hlob-grid .hlob-card[data-tag="rou"] [data-hlob="open"]'); await page.waitForTimeout(150);
  await page.click('#hlob-dlg-ov', { position: { x: 5, y: 5 } }); await page.waitForTimeout(100);
  check('الضغط على الخلفية يغلق النافذة', !(await page.evaluate(() => document.getElementById('hlob-dlg-ov').classList.contains('on'))));
  await page.click('#hlob-grid .hlob-card[data-tag="rou"] [data-hlob="open"]'); await page.waitForTimeout(150);
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  check('تثبيت التركيز داخل النافذة (Tab لا يخرج منها)', await page.evaluate(() => document.getElementById('hlob-dlg-ov').contains(document.activeElement)));
  await page.click('#hlob-dlg-start'); await page.waitForTimeout(100);
  check('"ابدأ الإعداد" من النافذة يغلقها ويشغّل اللعبة', await page.evaluate(() => !document.getElementById('hlob-dlg-ov').classList.contains('on') && JSON.stringify(window.__calls) === '["goSetupRoulette"]'), await page.evaluate(() => window.__calls));
  await page.click('[data-hlob="tug"]'); await page.waitForTimeout(150);
  check('"مثال من شد الحبل" يفتح تفاصيل شد الحبل', await page.evaluate(() => document.getElementById('dlg-title').textContent === 'شد الحبل' && document.getElementById('hlob-dlg-ov').classList.contains('on')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);

  // ---------- 6) الصيانة/الشارات/الترتيب/التثبيت (مزامنة مع نظام المالك) ----------
  await page.evaluate(() => { window.__calls = []; ownerBadgeState = { cr: 'maintenance', ev: 'new', main: 'update' }; ownerApplyBadgesToHome(); });
  await settle(page); await page.waitForTimeout(100);
  const bd = await page.evaluate(() => { const g = (t) => document.querySelector('#hlob-grid .hlob-card[data-tag="' + t + '"]'); const tg = (t) => { const e = g(t).querySelector('.hlob-tag'); return e ? e.textContent : null; }; return { cr: tg('cr'), crOff: g('cr').classList.contains('is-off'), crBtn: g('cr').querySelector('[data-hlob="start"]').textContent, ev: tg('ev'), main: tg('main'), rou: tg('rou') }; });
  check('شارات المالك تظهر: صيانة/جديد/تحديث + البطاقة معطّلة بالصيانة', bd.cr === '🚧 صيانة' && bd.crOff && bd.crBtn === 'تحت الصيانة' && bd.ev === 'جديد' && bd.main === 'تحديث جديد' && bd.rou === null, bd);
  let toasted = null;
  // حارس الصيانة يُركَّب عادة من badgesSubscribe() (يحتاج Firebase المحجوب بالاختبار) — نركّبه بنفس الدالة الحقيقية
  await page.evaluate(() => { if (!badgesGuardAttached) { badgesGuardAttached = true; ownerGuardMaintenanceClicks(); } window.toast = (t) => { window.__toast = t; }; document.querySelector('#hlob-grid .hlob-card[data-tag="cr"] [data-hlob="start"]').click(); });
  const mres = await page.evaluate(() => ({ calls: window.__calls, toast: window.__toast }));
  check('لعبة الصيانة: ما تُشغَّل، وتظهر رسالة الصيانة من حارس الموقع', mres.calls.length === 0 && /الصيانة/.test(mres.toast || ''), mres);
  await page.evaluate(() => { ownerBadgeState = {}; ownerApplyBadgesToHome(); }); await settle(page); await page.waitForTimeout(100);
  check('رجوع اللعبة من الصيانة يعيد زر "ابدأ اللعبة" بلا شارة', await page.evaluate(() => { const c = document.querySelector('#hlob-grid .hlob-card[data-tag="cr"]'); return !c.classList.contains('is-off') && !c.querySelector('.hlob-tag') && c.querySelector('[data-hlob="start"]').textContent === 'ابدأ اللعبة'; }));
  const order = await page.evaluate(() => { const t = Array.from(document.querySelectorAll('#pg-home .gcard[data-tag]')).map((c) => c.dataset.tag).reverse(); ownerOrderState = { streamer: { tags: t } }; ownerApplyOrderToHome(); return t; });
  await settle(page); await page.waitForTimeout(100);
  check('ترتيب المالك ينعكس على الواجهة', (await shown(page)).join() === order.join());
  await page.evaluate(() => { ownerOrderState = {}; });
  await page.evaluate(() => { window.__pinCall = null; window.gamesTogglePin = (t) => { window.__pinCall = t; }; });
  await page.click('#hlob-grid .hlob-card[data-tag="bomb"] .hlob-pin');
  check('زر التثبيت يمرّ لنظام التثبيت الأصلي', (await page.evaluate(() => window.__pinCall)) === 'bomb');
  await page.evaluate(() => { gamesPinnedList = ['bomb']; gamesPinButtonsSyncAll(); }); await settle(page); await page.waitForTimeout(100);
  check('الحالة المثبّتة تنعكس (pinned + aria-pressed)', await page.evaluate(() => { const b = document.querySelector('#hlob-grid .hlob-card[data-tag="bomb"] .hlob-pin'); return b.classList.contains('pinned') && b.getAttribute('aria-pressed') === 'true'; }));
  await page.evaluate(() => { gamesPinnedList = []; gamesPinButtonsSyncAll(); });

  // ---------- 7) أوضاع اللعب والتنقل ----------
  await page.evaluate(() => { window.__nav = []; window.topnavGoSection = (s) => window.__nav.push('go:' + s); window.show = (p) => window.__nav.push('show:' + p); window.homeOpenQuickConnect = () => window.__nav.push('qc'); });
  const tiles = await page.$$('.hlob-tile');
  for (const t of tiles) await t.click();
  await page.click('.hlob-nav .hlob-btn-quick');
  check('طرق اللعب: فردي/جمعات/وردل/الفئات + ابدأ بثاً سريعاً', JSON.stringify(await page.evaluate(() => window.__nav)) === JSON.stringify(['go:solo', 'go:party', 'show:wordle-mode-select', 'show:ahsemha-home', 'qc']), await page.evaluate(() => window.__nav));
  await page.evaluate(() => { window.__nav = []; });
  await page.click('.hlob-hero-cta .hlob-btn-ghost');
  check('زر البطل "ابدأ بثاً سريعاً" (بدل "اختر طريقة لعبك") يفتح الربط السريع', JSON.stringify(await page.evaluate(() => window.__nav)) === '["qc"]' && (await page.evaluate(() => !document.body.textContent.includes('اختر طريقة لعبك'))), await page.evaluate(() => window.__nav));
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; show('home'); });
  await page.click('.hlob-streamer .hlob-btn'); await page.waitForTimeout(900);
  check('"افتح مكتبة الستريمر" يمرّر للمكتبة', await page.evaluate(() => window.scrollY > 500 && Math.abs(document.getElementById('library').getBoundingClientRect().top - 72) < 40), await page.evaluate(() => window.scrollY));
  check('الهيدر لاصق أعلى الشاشة بعد التمرير', await page.evaluate(() => document.querySelector('.hlob-header').getBoundingClientRect().top === 0));
  await page.click('.hlob-brand'); await page.waitForTimeout(900);
  check('الشعار يرجع للأعلى', await page.evaluate(() => window.scrollY < 5));
  await page.click('.hlob-catchip[data-cat="teams"]'); await page.waitForTimeout(900);
  check('شريحة فئة ببطاقة الستريمر تفلتر وتنزل للمكتبة', (await shown(page)).length === regCounts.teams && await page.evaluate(() => window.scrollY > 500));
  await page.click('#hlob-reset'); await settle(page);
  await page.evaluate(() => { show('solo-home'); });
  const away = await page.evaluate(() => ({ cls: document.body.classList.contains('hlob-home'), cl: getComputedStyle(document.getElementById('top-right-cluster')).top }));
  check('خارج الرئيسية: تُزال حالة hlob-home ويرجع موضع الكتلة العلوية (80px)', !away.cls && away.cl === '80px', away);
  await page.evaluate(() => { window.scrollTo(0, 800); show('home'); });
  await page.evaluate(() => topnavGoSection('streamer')); await page.waitForTimeout(900);
  check('topnavGoSection("streamer") الحقيقي يفتح الرئيسية وينزل للمكتبة', await page.evaluate(() => document.getElementById('pg-home').classList.contains('active') && document.body.classList.contains('hlob-home') && Math.abs(document.getElementById('library').getBoundingClientRect().top - 72) < 40));

  // ---------- 8) عناصر الاتصال/الفعالية/العدّاد ----------
  await page.evaluate(() => { window.scrollTo(0, 0); homeUpdateConnectionBadge(true, 'TikTok'); });
  const badge = await page.evaluate(() => { const b = document.getElementById('home-conn-badge'); return { online: b.classList.contains('online'), text: document.getElementById('home-conn-badge-text').textContent, vis: b.getBoundingClientRect().height > 0, profile: document.getElementById('profile-conn-text') && document.getElementById('profile-conn-text').textContent }; });
  check('شارة الاتصال ظاهرة وتتحدث (متصل · TikTok)', badge.online && badge.text === 'متصل · TikTok' && badge.vis, badge);
  await page.evaluate(() => { homeUpdateConnectionBadge(false, ''); tiktokBadgeConnecting({ attempt: 2 }); });
  check('شارة "جاري الاتصال… (محاولة 2)" تظهر بالرئيسية', (await page.textContent('#home-conn-badge-text')) === 'جاري الاتصال… (محاولة 2)');
  await page.evaluate(() => { document.getElementById('home-live-counter').classList.add('visible'); homeLiveCounterAnimateTo(1234); }); await page.waitForTimeout(800);
  check('عدّاد اللاعبين ظاهر ويتحدث', await page.evaluate(() => getComputedStyle(document.getElementById('home-live-counter')).display === 'flex' && document.getElementById('home-live-counter-num').textContent === '1,234'));
  await page.evaluate(() => { contestActiveEventId = 'e1'; sevtUpdateEventTabVisibility(); });
  check('زر "🏆 الفعالية" يظهر مع الفعالية', await page.evaluate(() => getComputedStyle(document.getElementById('home-event-cta-btn')).display !== 'none' && document.getElementById('home-event-cta-btn').getBoundingClientRect().height > 0));
  await page.evaluate(() => { contestActiveEventId = null; sevtUpdateEventTabVisibility(); });
  await page.evaluate(() => { platformStatusBarRender({ tiktok: 'connected' }); });
  check('شريط حالة المنصات يظهر عند الربط', await page.evaluate(() => getComputedStyle(document.getElementById('home-platform-status-bar')).display === 'flex' && document.querySelectorAll('#home-platform-status-bar .home-plat-chip').length === 1));
  await page.evaluate(() => { document.getElementById('home-event-winners').style.display = 'block'; });
  check('بانر فائزي الفعالية قابل للإظهار', await page.evaluate(() => document.getElementById('home-event-winners').getBoundingClientRect().height > 50));
  await page.evaluate(() => { document.getElementById('home-event-winners').style.display = 'none'; });
  check('زر ديسكورد ظاهر برابطه بأعلى الصفحة (داخل أزرار البطل، بدون تمرير)', await page.evaluate(() => { const a = document.getElementById('home-discord-btn'); const r = a.getBoundingClientRect(); return a.href.startsWith('https://discord.gg/') && r.height >= 50 && r.top < innerHeight && !!a.closest('.hlob-hero-cta') && getComputedStyle(a).backgroundColor === 'rgb(88, 101, 242)'; }));
  // لوحة المالك: «إخفاء/إظهار» يمر عبر مستند config/discordServer — نحاكي لقطة Firestore بنفس الدالة الحقيقية homeDiscordBoot
  const dc = await page.evaluate(() => { const snap = (d) => ({ exists: () => true, data: () => d }); const w = document.getElementById('home-discord-cta'); const out = {}; const run = (d) => { fb = { db: {}, doc: () => 0, onSnapshot: (ref, cb) => { cb(snap(d)); return () => {}; } }; homeDiscordUnsub = null; homeDiscordBoot(); return getComputedStyle(w).display; };
    out.hidden = run({ visible: false }); out.shown = run({ visible: true, url: 'https://discord.gg/abc' }); out.href = document.getElementById('home-discord-btn').href; out.h = w.getBoundingClientRect().height; return out; });
  check('«إظهار» من لوحة المالك يُظهر الزر و«إخفاء» يخفيه ويحدّث الرابط', dc.hidden === 'none' && dc.shown !== 'none' && dc.h > 40 && dc.href === 'https://discord.gg/abc', dc);

  // ---------- 9) الكتلة العلوية اليمنى (☰ + اسم اليوزر) ما تغطي الشعار ----------
  await page.evaluate(() => { document.getElementById('burger-fab-btn').classList.add('visible'); const c = document.getElementById('auth-user-chip'); c.classList.add('visible'); document.getElementById('auth-user-name').textContent = 'اسم_مستخدم_طويل_جداً'; });
  await page.waitForTimeout(300);
  const ov = await page.evaluate(() => { const c = document.getElementById('top-right-cluster').getBoundingClientRect(); const b = document.querySelector('.hlob-brand').getBoundingClientRect(); const h = document.querySelector('.hlob-header').getBoundingClientRect(); return { clusterLeft: c.left, brandRight: b.right, clusterBottom: c.bottom, headerBottom: h.bottom, clusterTop: c.top }; });
  check('الكتلة العلوية داخل الشريط ولا تتراكب مع الشعار (سطح المكتب)', ov.brandRight <= ov.clusterLeft + 1 && ov.clusterTop >= 0 && ov.clusterBottom <= ov.headerBottom, ov);

  // ---------- 10) الحركة ----------
  const sc = await page.evaluate(() => { const s = document.getElementById('hlob-scene'); const v = () => s.style.getPropertyValue('--ps'); const a = v(); document.getElementById('hlob-pause').click(); const b = v(); const t1 = document.getElementById('hlob-pause-txt').textContent; document.getElementById('hlob-pause').click(); return { a, b, t1, c: v(), svg: !!s.querySelector('svg style') }; });
  check('زر إيقاف/تشغيل حركة المشهد', sc.a === 'running' && sc.b === 'paused' && sc.c === 'running' && sc.t1 === 'شغّل المشهد' && sc.svg, sc);
  const ps = await page.evaluate(() => { const el = document.querySelector('#hlob-scene svg g[style*="hrope"]'); return el ? getComputedStyle(el).animationName : null; });
  check('أنيميشن المشهد (hrope) شغّال فعلياً', ps === 'hrope', ps);
  check('لا أخطاء JS بالسطح المكتبي', page._errors.length === 0, page._errors);

  // ---------- 11) الجوال ----------
  const mob = await open(browser, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 8767);
  const m1 = await mob.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, links: getComputedStyle(document.querySelector('.hlob-links')).display, cols: getComputedStyle(document.getElementById('hlob-grid')).gridTemplateColumns.split(' ').length, tiles: getComputedStyle(document.querySelector('.hlob-tiles')).gridTemplateColumns.split(' ').length }));
  check('الجوال: بلا تمرير أفقي، روابط الهيدر مخفية، عمود واحد للبطاقات والأوضاع', m1.sw <= m1.iw && m1.links === 'none' && m1.cols === 1 && m1.tiles === 1, m1);
  await mob.evaluate(() => { document.getElementById('burger-fab-btn').classList.add('visible'); document.getElementById('auth-user-chip').classList.add('visible'); document.getElementById('auth-user-name').textContent = 'سارة'; });
  await mob.waitForTimeout(300);
  const m2 = await mob.evaluate(() => { const c = document.getElementById('top-right-cluster').getBoundingClientRect(); const b = document.querySelector('.hlob-brand').getBoundingClientRect(); const q = document.querySelector('.hlob-btn-quick').getBoundingClientRect(); return { cl: c.left, br: b.right, qr: q.right, clTop: c.top, clBottom: c.bottom }; });
  check('الجوال: الكتلة العلوية لا تغطي الشعار ولا زر "ابدأ بثاً"', m2.br <= m2.cl + 1 && m2.clBottom <= 66 && m2.clTop >= 0, m2);
  await mob.evaluate(() => document.querySelector('#hlob-grid .hlob-card[data-tag="cr"] [data-hlob="open"]').click()); await mob.waitForTimeout(450);
  const sheet = await mob.evaluate(() => { const o = document.getElementById('hlob-dlg-ov'); const d = o.querySelector('.hlob-dlg').getBoundingClientRect(); return { align: getComputedStyle(o).alignItems, bottom: Math.round(d.bottom), vh: window.innerHeight, w: Math.round(d.width) }; });
  check('الجوال: نافذة التفاصيل تظهر كـ bottom-sheet', sheet.align === 'flex-end' && sheet.bottom === sheet.vh && sheet.w === 390, sheet);
  const tapOk = await mob.evaluate(() => { const bs = Array.from(document.querySelectorAll('.hlob-dlg button')).map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }); return Math.min(...bs); });
  check('الجوال: أهداف اللمس ≥ 44px داخل النافذة', tapOk >= 44, tapOk);
  await mob.keyboard.press('Escape');
  await mob.evaluate(() => { document.getElementById('hlob-q').scrollIntoView(); });
  const tabMid = await mob.evaluate(() => Array.from(document.querySelectorAll('#hlob-grid .hlob-card button')).map((b) => b.getBoundingClientRect().height).every((h) => h >= 40));
  check('الجوال: أزرار البطاقات ≥ 40px ارتفاعاً', tabMid);
  check('لا أخطاء JS بالجوال', mob._errors.length === 0, mob._errors);

  // ---------- 12) تقليل الحركة + العرض المتوسط + الأمان ----------
  const rm = await open(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }, 8767);
  const r1 = await rm.evaluate(() => ({ ps: document.getElementById('hlob-scene').style.getPropertyValue('--ps'), dl: document.getElementById('hlob-scene').style.getPropertyValue('--dl'), txt: document.getElementById('hlob-pause-txt').textContent, anim: getComputedStyle(document.querySelector('#hlob-grid .hlob-card')).animationName }));
  check('prefers-reduced-motion: المشهد متوقف والبطاقات بلا أنيميشن', r1.ps === 'paused' && r1.dl === '-7.4s' && r1.txt === 'الحركة متوقفة' && r1.anim === 'none', r1);
  const mid = await open(browser, { viewport: { width: 900, height: 900 } }, 8767);
  const m3 = await mid.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, tiles: getComputedStyle(document.querySelector('.hlob-tiles')).gridTemplateColumns.split(' ').length }));
  check('العرض المتوسط (900px): بلا تمرير أفقي وشبكة 6 أعمدة للأوضاع', m3.sw <= m3.iw && m3.tiles === 6, m3);
  const xss = await page.evaluate(() => { const n = document.querySelector('#pg-home .gcard[data-tag="cr"] .gcard-name'); n.textContent = '<img src=x onerror="window.__xss=1"><b>'; lobbyRender(); return new Promise((r) => setTimeout(() => r({ img: document.querySelectorAll('#hlob-grid img').length, xss: window.__xss || 0, h3: document.querySelector('#hlob-grid .hlob-card[data-tag="cr"] h3').textContent }), 200)); });
  check('النصوص تُهرَّب (لا حقن HTML من أسماء البطاقات)', xss.img === 0 && !xss.xss && xss.h3.startsWith('<img'), xss);
  const newGame = await page.evaluate(() => { const g = document.querySelector('#pg-home .games-grid.hlob-registry'); const c = document.createElement('div'); c.className = 'gcard'; c.dataset.tag = 'zz-new'; c.dataset.category = 'chat'; c.setAttribute('onclick', 'window.__zz=1'); c.innerHTML = '<span class="badge" data-badge-slot></span><div class="gcard-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg></div><div class="gcard-name">لعبة جديدة</div><div class="gcard-desc">وصف قصير. وصف ثاني</div>'; g.appendChild(c); return new Promise((r) => setTimeout(() => { const card = document.querySelector('#hlob-grid .hlob-card[data-tag="zz-new"]'); if (card) card.querySelector('[data-hlob="start"]').click(); r({ has: !!card, fallbackArt: !!(card && card.querySelector('.hlob-art-fallback svg')), launched: window.__zz === 1, total: document.querySelectorAll('#hlob-grid .hlob-card').length }); }, 200)); });
  check('لعبة جديدة تُضاف للسجل تظهر تلقائياً (أيقونة بديلة) وتشتغل', newGame.has && newGame.fallbackArt && newGame.launched && newGame.total === 39, newGame);

  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
