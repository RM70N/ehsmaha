'use strict';
// احتفال 10K (som3h.4): التصميم الجاهز مدمج كما هو + ملف ربط مستقل. يختبر التكامل الحقيقي مع سيرفر الجسر
// المحلي (tests/bridge/servers.sh): ربط فعلي عبر نافذة الربط الحقيقية، ودخول Sjwj عبر سلسلة ما بعد المصادقة.
//   tests/bridge/servers.sh start && node tests/bridge/som3h-10k.test.js
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '../..');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Date.now().toString(36);
const TARGET = 'som3h.4';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
const DESIGN_SHA = '62a0d9b5f3abe8f9fdacbd2556c4c0cd68ed00d427c6e0f54e24a51212448e6a';   // ملف التصميم كما وصل (محتوى الـscript حرفياً)
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
          m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('som3h-celebration')) window.__c.push({ ev: 'add', t: performance.now() }); });
          m.removedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('som3h-celebration')) window.__c.push({ ev: 'remove', t: performance.now() }); });
        }
      }).observe(document, { childList: true, subtree: true });
    },
  });
  page._profiles = [];
  await page.evaluate((n) => { window.__SOM3H_10K_REPEATS = n; }, repeats);
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
const rootCount = (page) => page.evaluate(() => document.querySelectorAll('.som3h-celebration').length);
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

  // ---- 0) الملفات
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('ملف التصميم نسخة حرفية من المرسل (بصمة SHA-256 مطابقة)', sha('som3h-10k/som3h-10k-celebration.js') === DESIGN_SHA, sha('som3h-10k/som3h-10k-celebration.js'));
  check('ملف الربط مستقل ومحمّل قبل ملف التصميم', fs.existsSync(path.join(ROOT, 'som3h-10k/som3h-10k-integration.js')) && html.indexOf('/som3h-10k/som3h-10k-integration.js') > 0 && html.indexOf('/som3h-10k/som3h-10k-integration.js') < html.indexOf('/som3h-10k/som3h-10k-celebration.js'));
  check('لا صفحة معاينة ولا زر «إعادة تشغيل الاحتفال» داخل الموقع', !/إعادة تشغيل الاحتفال|احتفال 10K — som3h/.test(html) && !fs.existsSync(path.join(ROOT, 'som3h-10k/index.html')));
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  check('النشر (Pages) يشمل مجلد som3h-10k', /som3h-10k\/\*\*/.test(wf) && /cp -r som3h-10k _site\/som3h-10k/.test(wf));

  // ---- A) ربط TikTok: حساب آخر / كتابة فقط / ربط صامت: لا شيء
  let page = await newSitePage(browser);
  check('الواجهة الأصلية محمّلة (Som3hCelebration) والتصميم لم يلفّ دالة الربط', await page.evaluate(() => !!window.Som3hCelebration && typeof som3h10kOnState === 'function' && tiktokAttachAccountToGames.__som3h === true));
  await linkModal(page, 'other_' + RUN);
  await sleep(1500);
  check('حساب TikTok مختلف يربط بثه: لا احتفال', (await connectedNow(page)) && (await shows(page)) === 0);
  await disconnect(page);
  await page.evaluate((u) => { const i = document.getElementById('tiktok-connect-username'); if (i) i.value = u; }, TARGET);
  await sleep(600);
  check('كتابة som3h.4 بحقل نصي فقط (بدون اتصال ناجح): لا احتفال', (await shows(page)) === 0);
  await page.evaluate((u) => { platformConnect('tiktok', { username: u }, homeDispatchToGameListeners, function () {}); }, TARGET);
  await page.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  check('ربط تلقائي صامت (بدون ضغط ربط من المستخدم) لـ som3h.4: لا احتفال', (await connectedNow(page)) && (await shows(page)) === 0);
  await disconnect(page);
  // تشابه الأسماء: som3h.44 / som3h_4 / SOM3H.4x
  for (const u of ['som3h.44', 'som3h_4', 'xsom3h.4']) { await linkModal(page, u); await sleep(1200); await disconnect(page); }
  check('أسماء مشابهة (som3h.44 / som3h_4 / xsom3h.4): لا احتفال (مطابقة تامة فقط)', (await shows(page)) === 0);
  await page.context().close();

  // ---- B) ربط som3h.4 الفعلي: التصميم الأصلي كاملاً
  page = await newSitePage(browser);
  await linkModal(page, TARGET);
  check('ربط som3h.4 بنجاح (نافذة الربط الحقيقية): يظهر الاحتفال', await waitShown(page, 1) && (await connectedNow(page)));
  await sleep(1500);
  const d1 = await page.evaluate(() => {
    const r = document.querySelector('.som3h-celebration'); if (!r) return null;
    const q = (s) => r.querySelector(s), P = 'som3h-celebration';
    const box = r.getBoundingClientRect();
    const parts = ['__bg', '__grid', '__floor', '__rays', '__rays2', '__halo', '__geo', '__cv', '__hud', '__side.l', '__side.r', '__stage', '__rig', '__core', '__beam', '__wing.l', '__wing.r', '__plat', '__svg', '__av', '__frame', '__img', '__medal', '__txt', '__l1', '__l2', '__base', '__rib', '__user', '__sweep', '__vig'].filter((s) => !q('.' + P + s));
    return {
      fixed: getComputedStyle(r).position === 'fixed', full: box.width >= innerWidth - 1 && box.height >= innerHeight - 1, z: getComputedStyle(r).zIndex,
      parts, l1: q('.' + P + '__l1').textContent, l2: [...r.querySelectorAll('.' + P + '__l2 .g')].map((x) => x.textContent), rib: q('.' + P + '__rib span').textContent, user: q('.' + P + '__user b').textContent,
      anims: r.getAnimations ? r.getAnimations({ subtree: true }).length : -1,
    };
  });
  check('الطبقة ثابتة بملء الشاشة وفوق كل النوافذ', d1 && d1.fixed && d1.full && Number(d1.z) >= 2147483000, d1 && { f: d1.fixed, full: d1.full, z: d1.z });
  check('كل عناصر التصميم الأصلي حاضرة (خلفية/أشعة/أرضية/هندسة/كانفس/حلقات/أفاتار/ميدالية/نصوص)', d1 && d1.parts.length === 0, d1 && d1.parts);
  check('النصوص كما بالتصميم: «مبررررروك» + «العشر الاف متابع» + الشريط + اسم الحساب som3h.4', d1 && d1.l1 === 'مبررررروك' && JSON.stringify(d1.l2) === JSON.stringify(['العشر', 'الاف', 'متابع']) && d1.rib === 'عقبال العشرين والمية بإذن الله' && d1.user === 'som3h.4', d1 && { l1: d1.l1, l2: d1.l2, rib: d1.rib, user: d1.user });
  check('الأنيميشن يعمل (CSS animations جارية على الطبقات)', d1 && d1.anims > 30, d1 && d1.anims);
  await page.waitForFunction(() => { const i = document.querySelector('.som3h-celebration__img img.on'); return i && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(900);
  const av = await page.evaluate(() => { const i = document.querySelector('.som3h-celebration__img img.on'); const m = document.querySelector('.som3h-celebration__mono'); return i ? { src: decodeURIComponent(i.src), nw: i.naturalWidth, mono: getComputedStyle(m).opacity } : null; });
  check('أفاتار الستريمر الحقيقي (من خدمة الجسر لـ som3h.4) داخل الإطار الأصلي', av && av.nw > 0 && /som3h\.4/.test(av.src) && av.mono === '0', av);
  check('طُلب البروفايل لـ som3h.4 فقط', page._profiles.length >= 1 && page._profiles.every((u) => u === TARGET), page._profiles);
  await sleep(1800);
  const cnt = await page.evaluate(() => ({ n: document.querySelector('.som3h-celebration__num').textContent, done: document.querySelector('.som3h-celebration__num').classList.contains('done'), medalHit: document.querySelector('.som3h-celebration__medal').classList.contains('hit') }));
  check('العدّاد يصل إلى 10K مع حركة الإصابة (done + hit)', cnt.n === '10K' && cnt.done && cnt.medalHit, cnt);
  // أثناء الاحتفال: التعليقات تصل
  await page.evaluate(() => { window.__chat = []; homeRegisterGameListener('s10test', (evt) => { window.__chat.push(1); }); });
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: TARGET, viewer: 'viewer_' + RUN, text: 'تعليق أثناء الاحتفال', identity: { isFollowerOfAnchor: true } });
  await sleep(800);
  const during = await page.evaluate(() => ({ still: !!document.querySelector('.som3h-celebration'), chat: window.__chat.length, conn: homeConnState.tiktok && homeConnState.tiktok.state }));
  check('التعليقات تستمر بالوصول أثناء الاحتفال والاتصال مستمر', during.still && during.chat >= 1 && during.conn === 'connected', during);
  await page.evaluate(() => homeUnregisterGameListener('s10test'));
  check('الاحتفال يختفي تلقائياً وتُزال كل طبقاته', await waitGone(page));
  const lg = await logOf(page);
  const dur = lg.length >= 2 ? Math.round(lg[1].t - lg[0].t) : -1;
  check('المدة قرابة الأصل (EXIT 6.3ث + خروج 0.9ث ≈ 7.2ث)', dur >= 6800 && dur <= 8200, dur);
  const after = await page.evaluate(() => ({ roots: document.querySelectorAll('.som3h-celebration').length, canv: document.querySelectorAll('.som3h-celebration__cv').length, conn: homeConnState.tiktok.state, anims: document.getAnimations ? document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.som3h-celebration')).length : 0 }));
  check('بعد الانتهاء: لا طبقة ولا كانفس ولا حركات، والاتصال مستمر', after.roots === 0 && after.canv === 0 && after.conn === 'connected' && after.anims === 0, after);
  const usable = await page.evaluate(() => { try { show('ahsemha-home'); show('home'); return document.querySelector('.page.active').id; } catch (e) { return e.message; } });
  check('الموقع يعمل بصورة طبيعية بعد الاحتفال (التنقل بين الصفحات)', usable === 'pg-home', usable);

  // ---- C) أحداث مكررة وإعادة اتصال: احتفال واحد
  await page.context().close();
  const net = await newSitePage(browser);
  await net.evaluate((u) => { som3h10kNoteIntent(); homeConnections.tiktok = { username: u, ws: null, attempts: 0 }; homeConnSetState('tiktok', 'connecting'); homeConnSetState('tiktok', 'connected'); homeConnSetState('tiktok', 'connected'); homeConnSetState('tiktok', 'connected'); }, TARGET);
  check('حدث الاتصال مكرر (×3): احتفال واحد فقط', await waitShown(net, 1) && (await sleep(1500), (await shows(net)) === 1 && (await rootCount(net)) === 1), { shows: await shows(net), roots: await rootCount(net) });
  await waitGone(net);
  await net.context().close();
  const re = await newSitePage(browser);
  await linkModal(re, TARGET);
  await waitShown(re, 1); await waitGone(re);
  await H.ctl(H.PRIMARY, { cmd: 'dropUpstream', user: TARGET });
  await re.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state !== 'connected', null, { timeout: 15000 }).catch(() => {});
  await re.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  check('انقطاع الاتصال من السيرفر ثم عودته تلقائياً: لا يعاد تشغيل الاحتفال', (await connectedNow(re)) && (await shows(re)) === 1, await shows(re));
  await re.evaluate(() => { try { homeConnections.tiktok.ws.close(4000); } catch (e) {} });
  await re.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  check('قطع اتصال الجهاز وإعادة الاتصال التلقائية: لا يعاد تشغيله', (await connectedNow(re)) && (await shows(re)) === 1, await shows(re));
  await re.context().close();

  // ---- D) دخول Sjwj (سلسلة ما بعد المصادقة الحقيقية)
  const au = await newSitePage(browser);
  await authEnter(au, null, null); await sleep(500);
  check('زائر بدون تسجيل دخول: لا احتفال', (await shows(au)) === 0);
  await authEnter(au, 'uid-other', 'RandomUser'); await sleep(500);
  check('مستخدم مختلف يدخل: لا احتفال', (await shows(au)) === 0);
  for (const nm of ['Sjwj2', 'Sjw', 'xSjwj', 'Sjwj_', 'Sjwj.']) { await authEnter(au, 'uid-' + nm, nm); }
  await sleep(500);
  check('أسماء مشابهة لـ Sjwj (Sjwj2/Sjw/xSjwj/Sjwj_/Sjwj.): لا احتفال', (await shows(au)) === 0);
  const mism = await au.evaluate(() => { window.__fb = { auth: { currentUser: { uid: 'DIFFERENT' } } }; som3h10kOnAuth({ uid: 'x1' }, 'Sjwj'); return 1; });
  await sleep(300);
  check('اسم Sjwj لكن الجلسة الحالية لحساب آخر (uid مختلف): لا احتفال', (await shows(au)) === 0 && mism === 1, await shows(au));
  await au.evaluate(() => { delete window.__fb; });
  await authEnter(au, 'uid-sjwj', 'Sjwj');
  check('يدخل Sjwj بحسابه: يظهر الاحتفال (بدون أي ربط TikTok)', await waitShown(au, 1) && !(await connectedNow(au)), { chainErr: await au.evaluate(() => window.__chainErr) });
  await sleep(1200);
  const sj = await au.evaluate(() => { const r = document.querySelector('.som3h-celebration'); return r ? { user: r.querySelector('.som3h-celebration__user b').textContent, l1: r.querySelector('.som3h-celebration__l1').textContent } : null; });
  await au.waitForFunction(() => { const i = document.querySelector('.som3h-celebration__img img.on'); return i && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
  const sjav = await au.evaluate(() => { const i = document.querySelector('.som3h-celebration__img img.on'); return i ? decodeURIComponent(i.src) : null; });
  check('الاحتفال لـ Sjwj مخصص بصرياً للستريمر: اسم som3h.4 والعبارة الأصلية وصورة som3h.4 (لا Sjwj)', sj && sj.user === 'som3h.4' && sj.l1 === 'مبررررروك' && sjav && /som3h\.4/.test(sjav) && !/sjwj/i.test(sjav) && au._profiles.every((u) => u === TARGET), { sj, sjav, p: au._profiles });
  check('لا يوجد أكثر من مشهد واحد', (await rootCount(au)) === 1);
  await waitGone(au);
  // نفس الزيارة: إعادة إطلاق حدث الدخول/تحديث المصادقة/التنقل الداخلي: لا يتكرر
  await authEnter(au, 'uid-sjwj', 'Sjwj');
  await au.evaluate(() => { som3h10kOnAuth({ uid: 'uid-sjwj' }, 'Sjwj'); try { show('ahsemha-home'); show('home'); } catch (e) {} });
  await au.evaluate(() => { authBootChainUid = null; });
  await au.evaluate(() => authRunPostAuthBootChain(null));
  await sleep(2500);
  check('نفس الزيارة: إعادة حدث الدخول/تحديث المصادقة/التنقل الداخلي لا تعيد الاحتفال', (await shows(au)) === 1, await shows(au));
  await au.context().close();
  // زيارة جديدة (تحميل صفحة جديد) لـ Sjwj: يظهر مرة أخرى
  const au2 = await newSitePage(browser);
  await authEnter(au2, 'uid-sjwj', 'Sjwj');
  check('زيارة جديدة (صفحة جديدة) لـ Sjwj: يظهر مرة أخرى', await waitShown(au2, 1));
  await waitGone(au2);
  await au2.context().close();

  // ---- E) الشرطان معاً: احتفال واحد فقط
  const both = await newSitePage(browser);
  await authEnter(both, 'uid-sjwj', 'Sjwj');
  await linkModal(both, TARGET);
  await sleep(2500);
  check('تحقق الشرطان معاً (دخول Sjwj + ربط som3h.4): احتفال واحد فقط بلا تداخل', (await shows(both)) === 1 && (await rootCount(both)) === 1, { shows: await shows(both), roots: await rootCount(both) });
  await waitGone(both);
  check('بعد الاحتفال الوحيد: لا طبقات عالقة والاتصال شغّال', (await rootCount(both)) === 0 && (await connectedNow(both)));
  await both.context().close();

  // ---- F) غياب صورة الحساب: لا يتعطل المشهد (حرف احتياطي الأصلي)
  const noav = await newSitePage(browser, { noAvatar: true });
  await authEnter(noav, 'uid-sjwj', 'Sjwj');
  check('غياب صورة الحساب: الاحتفال يظهر بكامل نصوصه ويكتمل بدون الصورة', await waitShown(noav, 1));
  await sleep(1500);
  await sleep(700);
  const na = await noav.evaluate(() => ({ mono: getComputedStyle(document.querySelector('.som3h-celebration__mono')).opacity, l1: document.querySelector('.som3h-celebration__l1').textContent }));
  check('الحرف الاحتياطي الأصلي ظاهر ولا صورة', na.mono === '1' && na.l1 === 'مبررررروك', na);
  check('ينتهي ويختفي رغم غياب الصورة', await waitGone(noav));
  await noav.context().close();

  // ---- G) الجوال
  const mob = await newSitePage(browser, { viewport: { width: 390, height: 780 } });
  await authEnter(mob, 'uid-sjwj', 'Sjwj');
  check('الجوال: يظهر الاحتفال', await waitShown(mob, 1));
  await sleep(3800);
  const m = await mob.evaluate(() => {
    const r = document.querySelector('.som3h-celebration'); if (!r) return null; const P = 'som3h-celebration';
    const inV = (e) => { const b = e.getBoundingClientRect(); return b.left >= -2 && b.right <= innerWidth + 2 && b.top >= -2 && b.bottom <= innerHeight + 2; };
    const sel = ['__rig', '__l1', '__l2', '__rib', '__user', '__medal'];
    return { out: sel.filter((s) => !inV(r.querySelector('.' + P + s))), sw: document.documentElement.scrollWidth, vw: innerWidth };
  });
  check('الجوال 390px: العناصر الرئيسية داخل الشاشة بلا قص ولا تمرير أفقي', m && m.out.length === 0 && m.sw <= m.vw + 1, m);
  check('الجوال: يختفي ويعود الموقع طبيعياً', await waitGone(mob));
  await mob.context().close();

  // ---- H) فشل اتصال TikTok للحساب المحدد (آخر اختبار: السيرفر يخزّن «غير موجود» للحساب)
  const bad = await newSitePage(browser);
  await H.ctl(H.PRIMARY, { cmd: 'streamEnd', user: TARGET }); await sleep(800);
  await tt(TARGET, 'user_not_found');
  await bad.evaluate((u) => { tiktokConnectModalOpen(); document.getElementById('tiktok-connect-username').value = u; tiktokConnectModalStart(); }, TARGET);
  await sleep(5000);
  check('فشل اتصال TikTok للحساب المحدد: لا احتفال ولا اتصال', !(await connectedNow(bad)) && (await shows(bad)) === 0);
  await tt(TARGET, 'live');
  await bad.context().close();

  // ---- I) التكرار: كل تشغيل يُعاد 5 مرات متتالية بالضبط (الإعداد الافتراضي الحقيقي)
  const rep = await newSitePage(browser, { repeats: 5 });
  await authEnter(rep, 'uid-sjwj', 'Sjwj');
  let maxRoots = 0; const t0r = Date.now();
  while (Date.now() - t0r < 60000) { maxRoots = Math.max(maxRoots, await rootCount(rep)); if ((await shows(rep)) >= 5 && (await rootCount(rep)) === 0) break; await sleep(150); }
  await sleep(3500);
  const lgr = await logOf(rep), adds = lgr.filter((e) => e.ev === 'add'), rems = lgr.filter((e) => e.ev === 'remove');
  check('تحديث الصفحة/دخول Sjwj: الاحتفال يُعرض 5 مرات بالضبط ولا سادسة', adds.length === 5 && rems.length === 5 && (await rootCount(rep)) === 0, { adds: adds.length, rems: rems.length });
  check('المرات الخمس متتالية بلا تداخل (مشهد واحد فقط في أي لحظة، وكل مرة بعد اختفاء السابقة)', maxRoots === 1 && adds.every((a, i) => i === 0 || a.t > rems[i - 1].t), { maxRoots });
  const totalS = (rems[4].t - adds[0].t) / 1000;
  check('المدة الكلية ≈ 5 × 7.2ث + فواصل (' + totalS.toFixed(1) + 'ث)', totalS > 33 && totalS < 48, totalS);
  await rep.context().close();
  // الربط الناجح لـ som3h.4 أيضاً 5 مرات، ومع الشرطين معاً تبقى سلسلة واحدة (لا 10)
  const rep2 = await newSitePage(browser, { repeats: 2 });
  await authEnter(rep2, 'uid-sjwj', 'Sjwj');
  await linkModal(rep2, TARGET);
  await sleep(1000);
  const t1r = Date.now();
  while (Date.now() - t1r < 40000) { if ((await shows(rep2)) >= 2 && (await rootCount(rep2)) === 0) break; await sleep(200); }
  await sleep(3000);
  check('الشرطان معاً: سلسلة واحدة فقط (عدد المرات = الإعداد لا ضعفه)', (await shows(rep2)) === 2, await shows(rep2));
  await rep2.context().close();

  const errs = [].concat(page._errors || []).filter((e) => !/Failed to load resource|ERR_/.test(e));
  check('لا أخطاء JS جديدة', errs.length === 0, errs);
  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
