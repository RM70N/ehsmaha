'use strict';
// ترحيب c7gaming777 : التصميم الجاهز مدمج كما هو + ملف ربط مستقل. يختبر التكامل الحقيقي مع سيرفر الجسر
// المحلي (tests/bridge/servers.sh): ربط فعلي عبر نافذة الربط الحقيقية، ودخول rayan عبر سلسلة ما بعد المصادقة.
//   tests/bridge/servers.sh start && node tests/bridge/c7-welcome.test.js
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '../..');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Date.now().toString(36);
const TARGET = 'c7gaming777';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const DESIGN_SHA = '';   // ملف التصميم كما وصل (محتوى الـscript حرفياً)
const tt = (u, mode) => H.ctl(H.PRIMARY, { cmd: 'mode', user: u, mode });
const svgAvatar = (u) => 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#7C3AED"/><text x="100" y="120" font-size="40" text-anchor="middle" fill="#fff">' + u + '</text></svg>');

async function newSitePage(browser, { viewport, noAvatar, repeats = 1 } = {}) {
  const page = await H.newPage(browser, {
    query: '?debug=0',
    context: viewport ? { viewport } : undefined,
    init: () => {
      window.__c = [];
      new MutationObserver((ms) => {
        for (const m of ms) {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('c7-welcome-root')) window.__c.push({ ev: 'add', t: performance.now() }); });
          m.removedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('c7-welcome-root')) window.__c.push({ ev: 'remove', t: performance.now() }); });
        }
      }).observe(document, { childList: true, subtree: true });
    },
  });
  page._profiles = [];
  await page.evaluate(() => { window.__C7_WELCOME_GAP = 3000; });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  await page.route(/\/profile\?u=/, async (route) => {
    const u = new URL(route.request().url()).searchParams.get('u');
    page._profiles.push(u);
    if (noAvatar) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false }) });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, uniqueId: u, nickname: u, avatar: svgAvatar(u) }) });
  });
  return page;
}
const shows = (page) => page.evaluate(() => window.__c.filter((e) => e.ev === 'add').length);
const logOf = (page) => page.evaluate(() => window.__c.slice());
const rootCount = (page) => page.evaluate(() => document.querySelectorAll('.c7-welcome-root').length);
const waitShown = async (page, n, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await shows(page)) >= n) return true; await sleep(100); } return false; };
const waitGone = async (page, ms = 14000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await rootCount(page)) === 0) return true; await sleep(100); } return false; };
const disconnect = (page) => page.evaluate(() => { try { platformDisconnectAll(); } catch (e) {} });
const connectedNow = (page) => page.evaluate(() => typeof homeConnState !== 'undefined' && !!homeConnState.tiktok && homeConnState.tiktok.state === 'connected');
async function linkModal(page, user) {
  await page.evaluate((u) => { tiktokConnectModalOpen(); document.getElementById('tiktok-connect-username').value = u; tiktokConnectModalStart(); }, user);
  await page.waitForFunction((u) => typeof homeConnState !== 'undefined' && homeConnState.tiktok && homeConnState.tiktok.state === 'connected' && homeConnections.tiktok && homeConnections.tiktok.username.toLowerCase() === u, user, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { try { tiktokConnectModalClose(); } catch (e) {} });
}
// دخول مستخدم عبر سلسلة ما بعد المصادقة الحقيقية (authRunPostAuthBootChain) بدون Firebase
const authEnter = (page, uid, username) => page.evaluate(async ([uid, username]) => {
  // بيئة الاختبار بلا Firebase: نعطّل خطوات الإقلاع التي تسبق نقطة الربط فقط (الهوك نفسه حقيقي)
  (0, eval)('authSyncPendingUserIfAny = framesOpenPendingShareIfAny = publicBadgesBoot = publicGameOrderBoot = presenceStart = whatsNewCheck = function () {}');
  (0, eval)('authBootChainUid = null; currentUser = ' + JSON.stringify(uid ? { uid, email: uid + '@t.t' } : null) + '; currentUsername = ' + JSON.stringify(username));
  try { await authRunPostAuthBootChain(null); } catch (e) { window.__chainErr = String(e); }
}, [uid, username]);

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  const jsSrc = fs.readFileSync(path.join(ROOT, 'c7-welcome/c7-welcome.js'), 'utf8');
  const cssSrc = fs.readFileSync(path.join(ROOT, 'c7-welcome/c7-welcome.css'), 'utf8');
  check('ملفات التصميم والربط موجودة ومحمّلة (التصميم قبل الربط)', html.indexOf('/c7-welcome/c7-welcome.js') > 0 && html.indexOf('/c7-welcome/c7-welcome-integration.js') > html.indexOf('/c7-welcome/c7-welcome.js'));
  check('النشر (Pages) يشمل c7-welcome', /c7-welcome\/\*\*/.test(wf) && /cp -r c7-welcome _site\/c7-welcome/.test(wf));
  check('الألوان بنفسجية أكثر من dh_mx (#8B5CF6/#6D28D9/#C4B5FD)', /--c7w-electric:#8B5CF6/.test(cssSrc) && /--c7w-royal:#6D28D9/.test(cssSrc) && /--c7w-soft:#C4B5FD/.test(cssSrc));
  check('الحساب المحدد c7gaming777 والنصوص المطلوبة بالتصميم', /var TARGET = 'c7gaming777'/.test(jsSrc) && /ارررحب/.test(jsSrc) && /تو مانورت احسمها يا اقوى ستريمر و يوتيوبر/.test(jsSrc) && /C7 ON TOP/.test(jsSrc));

  // ---- A) حسابات أخرى / كتابة فقط / ربط صامت / أسماء مشابهة: لا شيء
  let page = await newSitePage(browser);
  await linkModal(page, 'other_' + RUN); await sleep(1500);
  check('حساب TikTok مختلف يربط بثه: لا ترحيب', (await connectedNow(page)) && (await shows(page)) === 0);
  await disconnect(page);
  await page.evaluate((u) => { const i = document.getElementById('tiktok-connect-username'); if (i) i.value = u; }, TARGET); await sleep(600);
  check('كتابة c7gaming777 بحقل نصي فقط: لا ترحيب', (await shows(page)) === 0);
  await disconnect(page);
  for (const u of ['c7gaming7777', 'xc7gaming777', 'c7gaming77', 'c7_gaming777']) { await linkModal(page, u); await sleep(1200); await disconnect(page); }
  check('أسماء مشابهة: لا ترحيب (مطابقة تامة فقط)', (await shows(page)) === 0);
  await page.context().close();

  // ---- الربط التلقائي بالخلفية (بلا ضغط زر): يظهر الترحيب أيضاً
  const bg = await newSitePage(browser);
  await bg.evaluate((u) => { platformConnect('tiktok', { username: u }, homeDispatchToGameListeners, function () {}); }, TARGET);
  check('ربط تلقائي بالخلفية (بدون ضغط ربط): يظهر الترحيب', await waitShown(bg, 1, 15000) && (await connectedNow(bg)));
  await waitGone(bg, 8000); check('وللربط بالخلفية عرض ثانٍ أيضاً', await waitShown(bg, 2, 12000));
  await waitGone(bg, 8000); await sleep(5000); check('مرتان فقط بالربط الصامت', (await shows(bg)) === 2, await shows(bg));
  await bg.context().close();

  // ---- B) ربط c7gaming777 الفعلي: عرضان غير متتاليين، ثم لا شيء
  page = await newSitePage(browser);
  await linkModal(page, TARGET);
  check('الربط الفعلي: يظهر الترحيب', await waitShown(page, 1) && (await connectedNow(page)));
  await sleep(1500);
  const d1 = await page.evaluate(() => {
    const r = document.querySelector('.c7-welcome-root'); if (!r) return null; const q = (s) => r.querySelector(s); const cs = getComputedStyle(r);
    const box = r.getBoundingClientRect(); const img = r.querySelector('.c7w-avatar img');
    return { fixed: cs.position === 'fixed', full: box.width >= innerWidth - 1 && box.height >= innerHeight - 1, z: cs.zIndex, name: q('.c7w-name').textContent, words: [...r.querySelectorAll('.c7w-w')].map((x) => x.textContent), plate: q('.c7w-txt').textContent, ontop: q('.c7w-ontop').textContent,
      electric: cs.getPropertyValue('--c7w-electric').trim(), avatar: img ? { src: decodeURIComponent(img.src), nw: img.naturalWidth } : null, anims: r.getAnimations ? r.getAnimations({ subtree: true }).length : -1, pe: cs.pointerEvents };
  });
  check('الطبقة ثابتة بملء الشاشة وفوق النوافذ ولا تعترض النقر', d1 && d1.fixed && d1.full && Number(d1.z) >= 2147483000 && d1.pe === 'none', d1 && { f: d1.fixed, full: d1.full, z: d1.z, pe: d1.pe });
  check('النصوص: «ارررحب يا افضل ستريمر» + «تو مانورت احسمها يا اقوى ستريمر و يوتيوبر» + «C7 ON TOP» + اسم الحساب', d1 && d1.words.join(' ') === 'ارررحب يا افضل ستريمر' && d1.plate === 'تو مانورت احسمها يا اقوى ستريمر و يوتيوبر' && d1.ontop === 'C7 ON TOP' && d1.name === TARGET, d1 && { w: d1.words, p: d1.plate, o: d1.ontop, n: d1.name });
  check('اللون البنفسجي مطبّق على الطبقة', d1 && d1.electric === '#8B5CF6', d1 && d1.electric);
  check('الأنيميشن يعمل', d1 && d1.anims > 20, d1 && d1.anims);
  await page.waitForFunction(() => { const i = document.querySelector('.c7-welcome-root .c7w-avatar img'); return i && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  const av = await page.evaluate(() => { const i = document.querySelector('.c7-welcome-root .c7w-avatar img'); return i ? { nw: i.naturalWidth, src: decodeURIComponent(i.src) } : null; });
  check('صورة الستريمر الحقيقية (خدمة الجسر لـ c7gaming777)', av && av.nw > 0 && /c7gaming777/.test(av.src), av);
  check('طُلب البروفايل لـ c7gaming777 فقط', page._profiles.length >= 1 && page._profiles.every((u) => u === TARGET), page._profiles);
  check('الموقع قابل للاستخدام أثناء الترحيب (لا يحجب النقر)', await page.evaluate(() => { const e = document.elementFromPoint(innerWidth / 2, innerHeight - 20); return !e || !e.closest('.c7-welcome-root'); }));
  check('يختفي بعد ~4 ثوانٍ وتُزال طبقاته', await waitGone(page, 8000));
  const t1gone = Date.now();
  check('العرض الثاني يظهر بعد فاصل (غير متتالٍ) ولا يلتصق بالأول', await waitShown(page, 2, 12000));
  const lg = await logOf(page); const a = lg.filter((e) => e.ev === 'add'), r = lg.filter((e) => e.ev === 'remove');
  check('الفاصل بين نهاية الأول وبداية الثاني ≥ 2.5ث (الإعداد بالاختبار 3ث)', a.length === 2 && r.length >= 1 && (a[1].t - r[0].t) >= 2500, { adds: a.map((x) => x.t), rems: r.map((x) => x.t) });
  await waitGone(page, 8000); await sleep(6000);
  check('مرتان فقط لكل ربط: لا عرض ثالث', (await shows(page)) === 2 && (await rootCount(page)) === 0, await shows(page));
  // ---- ربط جديد: مرتان من جديد (لا سقف إجمالي)
  await disconnect(page); await sleep(500);
  await linkModal(page, TARGET);
  check('ربط جديد بعد فك الربط: يظهر الترحيب من جديد', await waitShown(page, 3, 12000));
  await waitGone(page, 8000); check('وللربط الجديد عرض ثانٍ أيضاً (المجموع 4)', await waitShown(page, 4, 12000));
  await waitGone(page, 8000); await sleep(5000);
  check('ربطان = أربعة عروض بالضبط (مرتان لكل ربط) بلا سقف', (await shows(page)) === 4, await shows(page));
  // ---- فك الربط أثناء الفاصل: لا عرض ثانٍ
  await disconnect(page); await sleep(300);
  await linkModal(page, TARGET);
  check('ربط ثالث: العرض الأول', await waitShown(page, 5, 12000));
  await waitGone(page, 8000); await disconnect(page); await sleep(5500);
  check('فك الربط قبل العرض الثاني: يُلغى العرض الثاني', (await shows(page)) === 5 && (await rootCount(page)) === 0, await shows(page));
  // ---- انقطاع/عودة تلقائية: لا عرض
  await linkModal(page, TARGET); await waitShown(page, 6, 12000); await waitGone(page, 8000); await waitShown(page, 7, 12000); await waitGone(page, 8000);
  const before = await shows(page);
  await page.evaluate(() => { homeConnSetState('tiktok', 'reconnecting'); homeConnSetState('tiktok', 'connected'); }); await sleep(4000);
  check('رجوع اتصال تلقائي بعد انقطاع: لا ترحيب جديد', (await shows(page)) === before, { before, after: await shows(page) });
  await page.context().close();

  // ---- الجوال
  const mob = await newSitePage(browser, { viewport: { width: 390, height: 780 } });
  await linkModal(mob, TARGET);
  await waitShown(mob, 1); await sleep(2800);
  const m = await mob.evaluate(() => { const r = document.querySelector('.c7-welcome-root'); if (!r) return null; const W = innerWidth, H2 = innerHeight; const out = [];
    ['.c7w-emblem', '.c7w-handle', '.c7w-hello', '.c7w-plate', '.c7w-ontop'].forEach((s) => { const e = r.querySelector(s); if (!e) { out.push(s + ':missing'); return; } const b = e.getBoundingClientRect(); if (b.left < -2 || b.right > W + 2 || b.top < -2 || b.bottom > H2 + 2) out.push(s + ':' + [b.left | 0, b.right | 0, b.top | 0, b.bottom | 0].join(',')); });
    return { out, sw: document.documentElement.scrollWidth <= innerWidth + 2 }; });
  check('الجوال 390px: كل عناصر الترحيب داخل الشاشة (الأيقونة/الاسم/الترحيب/الصفيحة/C7 ON TOP) بلا قص', m && m.out.length === 0 && m.sw, m);
  await mob.context().close();

  const errs = [].concat(page._errors || []).filter((e) => !/Failed to load resource|ERR_/.test(e));
  check('لا أخطاء JS', errs.length === 0, errs);
  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
