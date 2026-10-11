'use strict';
// «لاعب متأخر» — سيناريوهات إضافية: ١٠٠ متأخر دفعة وحدة (أداء + إشعار مجمّع + بلا تكرار)، انقطاع البث ورجوعه
// وسط الجولة، التنقّل بين الألعاب بلا أزرار/مؤقّتات/معالجات مكررة، وتصميم النافذة على الجوال وسطح المكتب.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/late-join-extra.test.js [shotsDir]
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const SHOTS = process.argv[2] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : '')); };
const ctl = (o) => H.ctl(H.PRIMARY, Object.assign({ user: STREAMER, identity: { isFollowerOfAnchor: true } }, o));
const say = (viewer, text) => ctl({ cmd: 'chat', viewer, nickname: viewer, text });
async function waitFor(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(150); }
  return false;
}
const G = (tag) => Object.assign({}, games.find((g) => g.tag === tag));

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=1' });
  await page.setViewportSize({ width: 1440, height: 900 });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.evaluate(() => { window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask' }); } catch (e) {} });
  await H.linkAccount(page, STREAMER);

  // ===== 1) ١٠٠ متأخر دفعة وحدة (اوجد الكلمة) =====
  await H.launch(page, G('main'));
  for (let i = 0; i < 3; i++) await say('m_a' + i, 'ادخل');
  await sleep(600);
  await page.evaluate(() => { startRound(); __lateJoin.open(); window.__long.length = 0; window.__notes = []; window.__noteT = setInterval(() => { const n = document.getElementById('lj-notify'); if (n && n.classList.contains('lj-in')) window.__notes.push(n.innerText.replace(/\s+/g, ' ')); }, 60); });
  const t0 = Date.now();
  await ctl({ cmd: 'burst', count: 100, prefix: 'm_late', text: 'ادخل', perMs: 10 });
  // نفس الـ100 يكررون الكلمة ٣ مرات + رسائل متزامنة
  await ctl({ cmd: 'burst', count: 100, prefix: 'm_late', text: 'ادخل', perMs: 2 });
  await ctl({ cmd: 'burst', count: 100, prefix: 'm_late', text: 'ادخل!!', perMs: 0 });
  const all = await waitFor(page, () => participants.size === 103, null, 20000);
  await sleep(1800); // الإشعار المجمّع يظهر بعد نافذة تجميع قصيرة
  const r1 = await page.evaluate(() => { const s = __lateJoin.state('main'); return { size: participants.size, count: s.count, seen: s.seen.size, chips: document.querySelectorAll('#p-usernames [id^="ptag-"]').length, maxTask: Math.round(Math.max(0, ...window.__long)), long: window.__long.filter((d) => d > 50).length, notes: [...new Set(window.__notes)].slice(0, 6), modalCount: document.getElementById('lj-count').textContent }; });
  check('١٠٠ متأخر دفعة وحدة (مع ٣٠٠ رسالة مكررة): دخلوا كلهم مرة وحدة بالضبط', all && r1.size === 103 && r1.count === 100 && r1.chips === 103, Object.assign({ ms: Date.now() - t0 }, r1));
  check('العدّاد بالنافذة = ١٠٠', r1.modalCount === '١٠٠', r1.modalCount);
  check('الإشعارات مجمّعة («انضم N لاعبين جدد!») بدل ١٠٠ إشعار', r1.notes.length >= 1 && r1.notes.some((t) => /انضم [٠-٩]+ لاعبين جدد!/.test(t)), r1.notes);
  check('الأداء: لا مهمة أطول من ٢٠٠ms أثناء دخول ١٠٠ متأخر', r1.maxTask < 200, { maxTask: r1.maxTask, long: r1.long });

  // ===== 2) انقطاع البث ورجوعه وسط الجولة =====
  await ctl({ cmd: 'dropUpstream' });
  await waitFor(page, () => typeof homeConnOverall === 'function' && homeConnOverall() === 'connected', null, 20000);
  let back = false;
  for (let k = 0; k < 15 && !back; k++) { await say('m_after_drop', 'ادخل'); back = await waitFor(page, () => participants.has('tiktok:m_after_drop'), null, 2000); }
  const r2 = await page.evaluate(() => ({ count: __lateJoin.state('main').count, open: __lateJoin.state('main').open, dup: participants.size }));
  check('بعد انقطاع البث وإعادة الاتصال: الجولة والسجل كما هما والمتأخر يدخل', back && r2.open && r2.count === 101 && r2.dup === 104, r2);
  await say('m_late5', 'ادخل'); await sleep(800);
  check('بعد إعادة الاتصال: من دخل سابقاً لا يتكرر', await page.evaluate(() => __lateJoin.state('main').count === 101 && participants.size === 104));

  // ===== 3) تصميم النافذة (سطح المكتب + جوال) =====
  await page.evaluate(() => __lateJoin.open()); await sleep(500);
  const d = await page.evaluate(() => { const c = document.querySelector('#lj-modal .lj-card').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), x: Math.round(c.left), vw: innerWidth }; });
  check('سطح المكتب: نافذة مربعة متوسطة بمنتصف الشاشة', Math.abs(d.w - d.h) <= 2 && d.w <= 460 && Math.abs(d.x + d.w / 2 - d.vw / 2) < 3, d);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/late-join-desktop.png' });
  await page.setViewportSize({ width: 390, height: 780 }); await sleep(500);
  const mo = await page.evaluate(() => { const c = document.querySelector('#lj-modal .lj-card').getBoundingClientRect(); const t = document.getElementById('lj-toggle').getBoundingClientRect(); return { w: Math.round(c.width), h: Math.round(c.height), left: Math.round(c.left), right: Math.round(c.right), vw: innerWidth, vh: innerHeight, toggleVisible: t.bottom <= innerHeight && t.height >= 44, scrollX: document.documentElement.scrollWidth > innerWidth }; });
  check('الجوال (390px): النافذة داخل الشاشة بهامش ١٦px وزر الإيقاف ظاهر', mo.left >= 16 && mo.right <= mo.vw - 16 && mo.h <= mo.vh && mo.toggleVisible, mo);
  if (SHOTS) await page.screenshot({ path: SHOTS + '/late-join-mobile.png' });
  await page.evaluate(() => __lateJoin.close()); await sleep(300);
  const bm = await page.evaluate(() => { const b = document.getElementById('lj-btn').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), inView: b.right <= innerWidth && b.left >= 0 }; });
  check('الجوال: زر «لاعب متأخر» بحجم لمس مناسب وداخل الشاشة', bm.h >= 32 && bm.inView, bm);
  await page.setViewportSize({ width: 1440, height: 900 });
  // تفاعل الزر (hover/press): نفرض الحالة عبر CDP (الزر داخل شريط أدوات الراوند المخفي حتى يمر الماوس أعلى الشاشة)
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument');
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#lj-btn' });
  const tr0 = await page.evaluate(() => getComputedStyle(document.getElementById('lj-btn')).transform);
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] }); await sleep(350);
  const hovT = await page.evaluate(() => getComputedStyle(document.getElementById('lj-btn')).transform);
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['active'] }); await sleep(350);
  const actT = await page.evaluate(() => getComputedStyle(document.getElementById('lj-btn')).transform);
  await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
  check('الزر: تأثير hover (رفع) وضغط (تصغير) بانتقال سلس', tr0 !== hovT && hovT !== 'none' && actT !== hovT && /matrix/.test(actT), { tr0, hovT, actT });

  // ===== 4) التنقّل بين الألعاب: زر واحد، مؤقّت واحد، معالجات بلا تكرار =====
  const tags = ['sniper', 'rou', 'hz', 'box', 'cr', 'mz', 'ev', 'll', 'main', 'gw'];
  const seen = [];
  for (const t of tags) {
    await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
    await H.launch(page, G(t));
    const x = await page.evaluate((t) => ({ btns: document.querySelectorAll('#lj-btn').length, modals: document.querySelectorAll('#lj-modal').length, cur: __lateJoin.cur(), listeners: Object.keys(homeGameListeners).filter((k) => k !== 'bridge-fate').length, count: __lateJoin.state(__lateJoin.cur()).count }), t);
    seen.push(x);
  }
  check('١٠ ألعاب متتالية: زر واحد ونافذة وحدة ومعالج لعبة واحد بكل مرة، والعداد يبدأ من الصفر', seen.every((x) => x.btns === 1 && x.modals <= 1 && x.listeners === 1 && x.count === 0), seen);
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(300);
  check('بالرئيسية: لا زر ولا مؤقّت للمتأخرين', await page.evaluate(() => !document.getElementById('lj-btn') || !document.getElementById('lj-btn').isConnected || !document.querySelector('.page.active #lj-btn')));
  // ===== 5) شرط الفولو: غير المتابع ينتظر بصمت ويدخل لحظة المتابعة (وسط الجولة) =====
  await H.launch(page, G('main'));
  for (let i = 0; i < 2; i++) await say('f_a' + i, 'ادخل');
  await sleep(500);
  await page.evaluate(() => { startRound(); __lateJoin.open(); __lateJoin.close(); document.getElementById('toast').textContent = ''; });
  await ctl({ cmd: 'chat', viewer: 'f_nf', nickname: 'f_nf', text: 'ادخل', identity: { isFollowerOfAnchor: false } });
  await sleep(900);
  const f1 = await page.evaluate(() => ({ inn: participants.has('tiktok:f_nf'), pf: __lateJoin.state('main').pendingFollow.size, toast: document.getElementById('toast').textContent }));
  check('غير متابع كتب الكلمة: لا يدخل ولا تظهر رسالة رفض مزعجة (ينتظر المتابعة)', !f1.inn && f1.pf === 1 && !/فولو/.test(f1.toast), f1);
  await ctl({ cmd: 'follow', viewer: 'f_nf' });
  check('لحظة المتابعة يدخل تلقائياً كلاعب متأخر', await waitFor(page, () => participants.has('tiktok:f_nf') && __lateJoin.state('main').count === 1, null, 8000));

  // ===== 6) لعبة بمراحل (الكرسي): طلب معلّق يسقط عند الإيقاف وعند انتهاء الجولة =====
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
  await H.launch(page, G('chairs'));
  for (let i = 0; i < 5; i++) await say('ch_a' + i, 'ادخل');
  await waitFor(page, () => chairsParticipants.size === 5, null, 8000);
  await page.evaluate(() => { chairsStartRoundClick(); __lateJoin.open(); __lateJoin.close(); });
  await sleep(400);
  await say('ch_late1', 'ادخل'); await sleep(800);
  const p1 = await page.evaluate(() => ({ st: chairsGameStatus, pending: __lateJoin.state('chairs').pending.size, inn: chairsParticipants.has('tiktok:ch_late1') }));
  check('الكرسي أثناء الدوران: المتأخر بالانتظار (لا يغيّر عدد كراسي الجولة الجارية)', p1.st === 'spinning' && p1.pending === 1 && !p1.inn, p1);
  await page.evaluate(() => __lateJoin.setMode('chairs', false)); await sleep(300);
  const drive = () => page.evaluate(() => { if (chairsGameStatus === 'claiming') [...chairsParticipants.values()].forEach((u, i) => chairsProcessClaim(u, String(chairsActiveChairNumbers[i] || 0))); return chairsGameStatus; });
  for (let t = 0; t < 80; t++) { const st = await drive(); if (st === 'finished-round' || st === 'finished') break; await sleep(500); }
  await sleep(800);
  const p2 = await page.evaluate(() => ({ st: chairsGameStatus, pending: __lateJoin.state('chairs').pending.size, inn: chairsParticipants.has('tiktok:ch_late1') }));
  check('إيقاف الاستقبال أثناء طلب معلّق: الطلب يسقط ولا يدخل عند النقطة الآمنة', p2.pending === 0 && !p2.inn, p2);
  await page.evaluate(() => __lateJoin.setMode('chairs', true));
  await waitFor(page, () => chairsGameStatus === 'spinning', null, 15000);
  await say('ch_late2', 'ادخل'); await sleep(800);
  const p3 = await page.evaluate(() => __lateJoin.state('chairs').pending.size);
  await page.evaluate(() => document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()); await sleep(900);
  const p4 = await page.evaluate(() => ({ pending: __lateJoin.state('chairs').pending.size, inn: chairsParticipants.has('tiktok:ch_late2'), st: chairsGameStatus }));
  check('انتهاء/ريست الجولة أثناء طلب معلّق: الطلب يسقط', p3 === 1 && p4.pending === 0 && !p4.inn, { p3, p4 });

  const pe = page._errors;
  check('بدون أخطاء JavaScript', pe.length === 0, pe.slice(0, 3));

  const pass = results.filter((r) => r.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
