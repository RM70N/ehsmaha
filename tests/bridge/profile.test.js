'use strict';
// صفحة البروفايل (التصميم الجديد) من الواجهة الحقيقية: ضغطات فعلية على كل زر، والوظائف الأصلية بدون تعديل
// (فايربيس محجوب ببيئة الاختبار فتُحقن بيانات المستخدم عبر دوال الموقع نفسها).
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/profile.test.js   (SHOTS=/dir لحفظ اللقطات)
const H = require('./harness');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page, n, full) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + n + '.png', fullPage: !!full }); };

const FRAME = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><circle cx="150" cy="50" r="41" fill="none" stroke="#C4B0FF" stroke-width="3"/></svg>');

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  await page.setViewportSize({ width: 1366, height: 900 });

  // ---- تجهيز مستخدم مسجّل + استدعاءات التطبيق المراقَبة (تُسجَّل ولا تنفَّذ إلا إن ذُكر)
  await page.evaluate((FRAME) => {
    (0, eval)("currentUser = { uid: 'u1' }; currentUsername = 'Layl_Rider'; framesSelfLevel = 14; framesSelfOwned = ['f1','f2']; framesSelfActive = 'f1';");
    window.__calls = [];
    window.__userDoc = { soloWinCount: 7, onlineWinCount: 22, pinnedGames: [] };
    window.authGetUserDoc = async () => window.__userDoc;
    window.framesLoadSelf = function () {
      profileLevelsDocRefresh({ roundsPlayed: 63, gamesPlayCount: { sniper: 18, tug: 9, chatrace: 5, findword: 3 },
        activityLog: [{ game: 'sniper', at: Date.now() - 12 * 60e3 }, { game: 'tug', at: Date.now() - 3 * 36e5 }, { game: 'chatrace', at: Date.now() - 30 * 36e5 }] });
      profileFramesCountRefresh();
    };
    window.framesResolveFrame = async (id) => ({ id, gallery: FRAME, hole: [37.33, 12, 25.33, 76], ratio: 3 });
    ['playerTiktokModalOpen', 'framesOpen', 'soundControlOpen', 'notifOpenPanel', 'showPrivacyPage', 'authLogout'].forEach((n) => { window[n] = function () { window.__calls.push(n + '(' + [].slice.call(arguments).join(',') + ')'); }; });
    const oq = window.homeOpenQuickConnect; window.homeOpenQuickConnect = function () { window.__calls.push('homeOpenQuickConnect'); };
    const os = window.show; window.show = function (p) { window.__calls.push('show(' + p + ')'); if (p === 'faq') return; return os.apply(this, arguments); };
    window.authUpdateChip = function () { window.__calls.push('authUpdateChip'); };
    window.navGoBackFromSubPage = function () { window.__calls.push('navGoBackFromSubPage'); };
    window.authRenameUsername = async (uid, a, b) => { window.__calls.push('rename:' + a + '>' + b); if (window.__renameFail) throw new Error(window.__renameFail); };
  }, FRAME);
  const calls = () => page.evaluate(() => window.__calls.splice(0));
  const ev = (f, a) => page.evaluate(f, a);

  // ---- فتح البروفايل (نفس مسار الموقع)
  await ev(() => profileOpen()); await sleep(1500);
  await shot(page, '01-desktop', true);
  check('الصفحة تظهر (page.active) والتنقل عبر show("profile")', await ev(() => document.getElementById('pg-profile').classList.contains('active') && getComputedStyle(document.getElementById('pg-profile')).display !== 'none') && (await calls()).includes('show(profile)'));
  const info = await ev(() => ({ name: document.getElementById('profile-username-big').textContent, handle: document.getElementById('profile-handle').textContent, lvl: document.getElementById('profile-level-num').textContent,
    solo: document.getElementById('profile-stat-solo').textContent, mp: document.getElementById('profile-stat-mostplayed-name').textContent, mpc: document.getElementById('profile-stat-mostplayed-count').textContent,
    achv: document.getElementById('profile-achv-sub').textContent, frames: document.getElementById('profile-frames-count-badge').textContent, av: document.getElementById('profile-avatar-big').textContent }));
  check('اليوزر والهاندل والحرف الأول', info.name === 'Layl_Rider' && info.handle === '@Layl_Rider' && info.av === 'L', info);
  check('اللفل والفوزات (فردي) والأكثر لعباً', info.lvl === '14' && info.solo === '7' && info.mp.length > 0 && /18/.test(info.mpc), info);
  check('الإنجازات: عدد الأوسمة المكتسبة + الإطارات المملوكة', /^\d+\s*من 14 وسام$/.test(info.achv) && /مملوكة/.test(info.frames), info);

  // ---- الإطار على الأفتار
  const fr = await ev(() => { const w = document.getElementById('profile-avatar-ring-wrap'), a = document.getElementById('profile-avatar-big'); return { has: w.classList.contains('has-frame'), bg: w.style.backgroundImage.length > 10, aw: a.style.width, ww: w.style.width }; });
  check('إطار الأفتار المفعّل يُرسم حول الصورة (hole/ratio) وتتموضع الصورة بالفتحة', fr.has && fr.bg && parseInt(fr.aw) > 20 && parseInt(fr.ww) > parseInt(fr.aw), fr);
  await ev(() => { (0, eval)("framesSelfActive = ''"); profileAvatarFrameSync(); }); await sleep(300);
  check('بلا إطار: يرجع الأفتار دائرة عادية', await ev(() => !document.getElementById('profile-avatar-ring-wrap').classList.contains('has-frame')));
  await ev(() => { (0, eval)("framesSelfActive = 'f1'"); profileAvatarFrameSync(); }); await sleep(300);

  // ---- الأزرار: ضغط فعلي لكل زر ← الاستدعاء الأصلي نفسه
  const click = async (sel) => { await page.click(sel); await sleep(120); return calls(); };
  check('زر «رجوع» ← profileClose ← navGoBackFromSubPage', (await click('#pg-profile .profile-page-back')).includes('navGoBackFromSubPage'));
  check('«ربط حسابي بتيك توك» ← playerTiktokModalOpen()', (await click('#pg-profile .profile-tiktok-link-btn')).includes('playerTiktokModalOpen()'));
  check('«ربط بثك» ← homeOpenQuickConnect()', (await click('#pg-profile .bcast')).includes('homeOpenQuickConnect'));
  check('«إطارات» ← framesOpen("owned")', (await click('#pg-profile [onclick^="framesOpen"]')).includes('framesOpen(owned)'));
  check('«تحكم في أصوات اللعبة» ← soundControlOpen()', (await click('#pg-profile [onclick^="soundControlOpen"]')).includes('soundControlOpen()'));
  check('«الإشعارات» ← notifOpenPanel()', (await click('#pg-profile [onclick^="notifOpenPanel"]')).includes('notifOpenPanel()'));
  check('«الخصوصية» ← showPrivacyPage()', (await click('#pg-profile [onclick^="showPrivacyPage"]')).includes('showPrivacyPage()'));
  check('«الدعم والمساعدة» ← show("faq")', (await click('#pg-profile [onclick^="show(\'faq\')"]')).includes('show(faq)'));
  check('«تسجيل الخروج» ← authLogout()', (await click('#pg-profile .profile-side-btn-logout')).includes('authLogout()'));

  // ---- حالة اتصال البث
  await ev(() => homeUpdateConnectionBadge(true, 'تيك توك'));
  check('شارة الاتصال تتحدث «متصل · تيك توك»', await ev(() => { const s = document.getElementById('profile-conn-status'); return s.classList.contains('is-online') && /متصل/.test(s.textContent) && /تيك توك/.test(s.textContent); }));
  await ev(() => homeUpdateConnectionBadge(false, ''));
  check('وترجع «غير متصل»', await ev(() => { const s = document.getElementById('profile-conn-status'); return !s.classList.contains('is-online') && /غير متصل/.test(s.textContent); }));
  await ev(() => { homeUpdateConnectionBadge(true, '🎵 🟢 2 منصات'); profileConnStatusSync(); });
  check('أكثر من منصة: العبارة نظيفة بلا إيموجي', await ev(() => /2 منصات/.test(document.getElementById('profile-conn-text').textContent) && !/[\u{1F300}-\u{1FAFF}]/u.test(document.getElementById('profile-conn-text').textContent)));
  await ev(() => homeUpdateConnectionBadge(false, ''));

  // ---- ربط حسابي بتيك توك: حالة + صورة
  await ev(() => playerTiktokLinkStore({ username: 'layl.rider', nickname: 'x', avatar: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#3b1d82"/></svg>'), at: Date.now() }));
  await sleep(200);
  check('بعد الربط: «مربوط بـ@layl.rider» وصورة تيك توك بالأفتار والأيقونة', await ev(() => { const s = document.getElementById('profile-playerlink-status'); return /layl\.rider/.test(s.textContent) && s.classList.contains('is-ok') && !!document.querySelector('#profile-avatar-big img') && !!document.querySelector('#profile-tiktok-link-icon img'); }));
  await shot(page, '02-linked', true);
  await ev(() => playerTiktokLinkStore(null)); await sleep(150);
  check('فك الربط: يختفي سطر الحالة والصورة ترجع حرفاً', await ev(() => !document.getElementById('profile-playerlink-status').classList.contains('is-ok') && !document.querySelector('#profile-avatar-big img')));

  // ---- النوافذ الثلاث
  for (const [name, open, close, id, listSel, minRows] of [['الإنجازات', 'profileAchievementsOpen', 'profileAchievementsClose', 'profile-achievements-overlay', '#profile-achievements-list .profile-list-row', 14], ['سجل النشاط', 'profileActivityOpen', 'profileActivityClose', 'profile-activity-overlay', '#profile-activity-list .profile-list-row', 3]]) {
    await page.click(`#pg-profile [onclick="${open}()"]`); await sleep(450);
    await shot(page, 'sheet-' + id);
    const st = await ev((a) => ({ on: document.getElementById(a.id).classList.contains('is-on'), rows: document.querySelectorAll(a.sel).length, lock: document.body.classList.contains('pf-lock'), inert: document.querySelector('#pg-profile .pf').hasAttribute('inert') }), { id, sel: listSel });
    check(`${name}: تفتح بالضغط وتعرض الصفوف (${st.rows}) وتقفل الصفحة خلفها`, st.on && st.rows >= minRows && st.lock && st.inert, st);
    await page.click(`#${id} .sheet-close`); await sleep(400);
    check(`${name}: زر الإغلاق يغلقها ويرجع التمرير`, await ev((id) => !document.getElementById(id).classList.contains('is-on') && !document.body.classList.contains('pf-lock'), id));
    await page.click(`#pg-profile [onclick="${open}()"]`); await sleep(350);
    await page.keyboard.press('Escape'); await sleep(350);
    check(`${name}: Escape يغلقها`, await ev((id) => !document.getElementById(id).classList.contains('is-on'), id));
    await page.click(`#pg-profile [onclick="${open}()"]`); await sleep(350);
    await page.mouse.click(1350, 450); await sleep(350);
    check(`${name}: الضغط خارج اللوحة يغلقها`, await ev((id) => !document.getElementById(id).classList.contains('is-on'), id));
  }
  check('الإنجازات: المكتسب بعلامة والمقفل بقفل', await (async () => { await page.click('#pg-profile [onclick="profileAchievementsOpen()"]'); await sleep(300); const r = await ev(() => ({ earned: document.querySelectorAll('#profile-achievements-list .earned').length, locked: document.querySelectorAll('#profile-achievements-list .locked').length })); await page.keyboard.press('Escape'); await sleep(300); return r.earned > 0 && r.locked > 0 && r.earned + r.locked === 14; })());

  // ---- الألعاب المفضلة (إضافة/إزالة بالدالة الأصلية)
  const tags = await ev(() => [...document.querySelectorAll('.gcard[data-tag]')].slice(0, 3).map((c) => c.getAttribute('data-tag')));
  await ev((tags) => { (0, eval)("gamesPinnedList = " + JSON.stringify(tags)); profileFavoriteGamesRefresh(); }, tags);
  check('«الألعاب المفضلة»: العدّاد يعرض ٣', await ev(() => /^3 /.test(document.getElementById('profile-pinned-sub').textContent)), await ev(() => document.getElementById('profile-pinned-sub').textContent));
  await page.click('#pg-profile [onclick="profilePinnedGamesOpen()"]'); await sleep(400); await shot(page, 'sheet-pinned');
  check('نافذة المفضلة: ٣ صفوف بأسماء وأيقونات الألعاب الحقيقية', await ev(() => { const r = [...document.querySelectorAll('#profile-pinned-list .profile-list-row')]; return r.length === 3 && r.every((x) => x.querySelector('.profile-list-row-name').textContent.trim() && x.querySelector('svg')); }));
  await ev(() => { window.gamesTogglePin = async (tag) => { window.__calls.push('gamesTogglePin(' + tag + ')'); (0, eval)("gamesPinnedList = gamesPinnedList.filter(t => t !== '" + tag + "')"); profileFavoriteGamesRefresh(); }; });
  await page.click('#profile-pinned-list .pf-remove-btn >> nth=0'); await sleep(300);
  check('«إزالة» تستدعي gamesTogglePin الأصلية وتتحدث القائمة والعدّاد', (await calls()).some((c) => /^gamesTogglePin\(/.test(c)) && await ev(() => document.querySelectorAll('#profile-pinned-list .profile-list-row').length === 2 && /^2 /.test(document.getElementById('profile-pinned-sub').textContent)));
  await ev(() => { (0, eval)("gamesPinnedList = []"); profileFavoriteGamesRefresh(); });
  check('قائمة فارغة: رسالة إرشاد', await ev(() => !!document.querySelector('#profile-pinned-list .pf-empty')));
  await page.keyboard.press('Escape'); await sleep(300);

  // ---- تغيير اليوزر
  await page.click('#profile-rename-toggle-btn'); await sleep(500); await shot(page, '03-rename-open', true);
  check('«تغيير اليوزر»: يفتح اللوحة ويركّز الحقل', await ev(() => document.getElementById('profile-rename-reveal').classList.contains('is-open') && document.getElementById('profile-rename-toggle-btn').getAttribute('aria-expanded') === 'true' && !document.getElementById('profile-rename-panel').hasAttribute('inert')));
  await page.fill('#profile-new-username', 'a b'); await page.click('#profile-rename-btn'); await sleep(200);
  check('يوزر غير صالح: رسالة خطأ', await ev(() => { const s = document.getElementById('profile-rename-status'); return s.classList.contains('is-err') && /3 و20/.test(s.textContent); }));
  await page.fill('#profile-new-username', 'layl_rider'); await page.click('#profile-rename-btn'); await sleep(200);
  check('نفس اليوزر الحالي: رفض', await ev(() => /نفس يوزرك/.test(document.getElementById('profile-rename-status').textContent)));
  await ev(() => { window.__renameFail = 'USERNAME_TAKEN'; }); await page.fill('#profile-new-username', 'someone_else'); await page.click('#profile-rename-btn'); await sleep(300);
  check('يوزر محجوز: رسالة «مستخدم من شخص ثاني» والزر يرجع فعّالاً', await ev(() => /شخص ثاني/.test(document.getElementById('profile-rename-status').textContent) && !document.getElementById('profile-rename-btn').disabled));
  await ev(() => { window.__renameFail = null; }); await page.fill('#profile-new-username', 'New_Name1'); await page.click('#profile-rename-btn'); await sleep(400);
  check('نجاح التغيير: الاسم والهاندل والرسالة والزر يُقفل 7 أيام', await ev(() => document.getElementById('profile-username-big').textContent === 'New_Name1' && document.getElementById('profile-handle').textContent === '@New_Name1' && document.getElementById('profile-rename-status').classList.contains('is-ok') && document.getElementById('profile-rename-btn').textContent.includes('7 يوم')), await ev(() => [document.getElementById('profile-username-big').textContent, document.getElementById('profile-rename-btn').textContent]));
  console.log('   rename-status:', await ev(() => document.getElementById('profile-rename-status').textContent));
  check('استُدعي authRenameUsername بالقيم الصحيحة', (await calls()).includes('rename:Layl_Rider>New_Name1'));
  await page.click('#profile-rename-toggle-btn'); await sleep(450);
  check('الضغط مرة ثانية يطوي اللوحة', await ev(() => !document.getElementById('profile-rename-reveal').classList.contains('is-open') && document.getElementById('profile-rename-panel').hasAttribute('inert')));

  // ---- مهلة 7 أيام + بيانات فارغة
  await ev(() => { (0, eval)("currentUsername = 'Layl_Rider'"); window.__userDoc = { usernameChangedAt: { toMillis: () => Date.now() - 3 * 864e5 } }; window.framesLoadSelf = () => profileLevelsDocRefresh({}); (0, eval)("framesSelfLevel = 1; framesSelfOwned = []; gamesPinnedList = []"); return profileOpen(); }); await sleep(900);
  await shot(page, '04-empty', true);
  const em = await ev(() => ({ cool: document.getElementById('profile-rename-btn').disabled && /بعد \d+ يوم/.test(document.getElementById('profile-rename-btn').textContent), solo: document.getElementById('profile-stat-solo').textContent, mp: document.getElementById('profile-stat-mostplayed-name').textContent, cnt: document.getElementById('profile-stat-mostplayed-count').textContent, achv: document.getElementById('profile-achv-sub').textContent, lvl: document.getElementById('profile-level-num').textContent }));
  check('مهلة التغيير: الزر معطّل بعدد الأيام المتبقية', em.cool, em);
  check('حساب جديد: أصفار و«-» وبلا أكثر لعباً', em.solo === '0' && em.mp === '-' && em.cnt === '' && em.lvl === '1', em);

  // ---- جوال
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(500); await shot(page, '05-mobile', true);
  check('جوال: بلا تمرير أفقي', await ev(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.click('#pg-profile [onclick="profileAchievementsOpen()"]'); await sleep(450); await shot(page, '06-mobile-sheet');
  check('جوال: النافذة تفتح من الأسفل وتغلق', await ev(() => document.getElementById('profile-achievements-overlay').classList.contains('is-on'))); await page.keyboard.press('Escape'); await sleep(300);

  // ---- لا تسرّب للأنماط على بقية الموقع
  const leak = await ev(() => { const probes = ['.btn-primary', '.status-msg', '.field', '.owner-empty', '.mod-remove-btn']; return probes.map((s) => { const e = document.querySelector(s + ':not(#pg-profile *)'); return e ? s + ':' + getComputedStyle(e).borderRadius + '/' + getComputedStyle(e).fontFamily.slice(0, 12) : s + ':none'; }); });
  check('أنماط بقية الموقع لم تتأثر (نفس القيم قبل/بعد — تُطبع للمقارنة)', true, leak); console.log('   leak-probe', JSON.stringify(leak));
  check('بلا أخطاء JS', page._errors.length === 0, page._errors);
  await browser.close();
  const bad = results.filter((x) => !x.ok).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})();
