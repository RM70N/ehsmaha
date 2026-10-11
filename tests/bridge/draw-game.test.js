'use strict';
// «خمن الرسمة» — اختبار فعلي لواجهة اللوحة الجديدة ومحرك الرسم (Playwright + Chromium حقيقي).
//   • الرسم/الأدوات/الأشكال/التعبئة/النص/التحديد/التراجع/التصدير: أحداث ماوس ولمس حقيقية عبر Playwright/CDP على الصفحة الحقيقية.
//   • الدردشة: عبر سيرفر جسر تيك توك المحلي المزيّف (tests/bridge/servers.sh) — بروتوكول WebSocket حقيقي لكن رسائل الشات
//     مُحاكاة (لا اتصال فعلي بتيك توك). هذا اختبار محاكاة للشات وليس اختباراً على بث حقيقي.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/draw-game.test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const WORD = 'زرافة';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const RUN = (n) => !ONLY.length || ONLY.includes(String(n));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
let cycle = '';
const check = (name, ok, detail) => {
  results.push({ name: cycle + name, ok: !!ok });
  console.log((ok ? 'PASS ' : 'FAIL ') + cycle + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : ''));
};
const G = () => Object.assign({}, games.find((g) => g.tag === 'draw'));
const say = (viewer, text, nick) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: true } });
async function waitFor(page, fn, arg, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); }
  return false;
}

// ---------- إعداد صفحة ----------
async function boot(browser, vp, opts = {}) {
  const page = await H.newPage(browser, { query: '?debug=0' });
  const cdp = await page.context().newCDPSession(page);
  page._cdp = cdp;
  page._dialogs = [];
  page.on('dialog', (d) => { page._dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await setView(page, vp, opts);
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  // مراقب التوست: أي إضافة لصنف show على #toast تُسجَّل
  await page.evaluate(() => {
    window.__toastShows = [];
    const t = document.getElementById('toast');
    new MutationObserver(() => { if (t.classList.contains('show')) window.__toastShows.push({ at: Date.now(), page: (document.querySelector('.page.active') || {}).id, text: t.textContent }); }).observe(t, { attributes: true, attributeFilter: ['class'] });
    window.__wins = [];
    const orig = window.recordWin;
    window.recordWin = function (u) { window.__wins.push(u && u.uniqueId); return orig.apply(this, arguments); };
  });
  return page;
}
async function setView(page, vp, opts = {}) {
  page._mobile = !!vp.mobile;
  await page._cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.dpr || 1, mobile: !!vp.mobile });
  if (opts.touch !== undefined || vp.touch) await page._cdp.send('Emulation.setTouchEmulationEnabled', { enabled: !!(opts.touch || vp.touch), maxTouchPoints: 5 });
  await sleep(250);
}
async function startRound(page, word = WORD) {
  const g = G(); g.inputs = { 'draw-thing': word };
  const r = await H.launch(page, g);
  await page.evaluate(() => startDrawRound());
  await waitFor(page, () => drawGameStatus === 'active' && gd.bound && gd.cssW > 0, null, 6000);
  await sleep(200);
  return r;
}
const box = (page) => page.evaluate(() => { const r = document.getElementById('gd-live').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const L2C = (b, lx, ly) => ({ x: b.x + lx / 800 * b.w, y: b.y + ly / 600 * b.h });
async function drag(page, a, b, steps = 8, opt = {}) {
  const bx = await box(page), p1 = L2C(bx, a[0], a[1]), p2 = L2C(bx, b[0], b[1]);
  if (opt.shift) await page.keyboard.down('Shift');
  await page.mouse.move(p1.x, p1.y); await page.mouse.down();
  await page.mouse.move(p2.x, p2.y, { steps }); await page.mouse.up();
  if (opt.shift) await page.keyboard.up('Shift');
  await page.evaluate(() => gdFlush());
}
async function stroke(page, pts) {
  const bx = await box(page), p0 = L2C(bx, pts[0][0], pts[0][1]);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  for (const p of pts.slice(1)) { const c = L2C(bx, p[0], p[1]); await page.mouse.move(c.x, c.y, { steps: 2 }); }
  await page.mouse.up();
  await page.evaluate(() => gdFlush());
}
const pick = (page, tool) => page._mobile ? page.evaluate((t) => document.querySelector('#draw-toolbar [data-tool=' + t + ']').click(), tool) : page.click('#draw-toolbar [data-tool=' + tool + ']');
const px = (page, lx, ly) => page.evaluate(([x, y]) => { gdFlush(); const d = gd.ctx.base.getImageData(Math.floor(x * gd.sc), Math.floor(y * gd.sc), 1, 1).data; return [d[0], d[1], d[2], d[3]]; }, [lx, ly]);
const dark = (c) => c[0] < 90 && c[1] < 90 && c[2] < 90;
const white = (c) => c[0] > 245 && c[1] > 245 && c[2] > 245;
const near = (c, hex, t = 12) => { const v = parseInt(hex.slice(1), 16); return Math.abs(c[0] - ((v >> 16) & 255)) <= t && Math.abs(c[1] - ((v >> 8) & 255)) <= t && Math.abs(c[2] - (v & 255)) <= t; };
const ink = (page) => page.evaluate(() => { gdFlush(); const c = gd.cv.base, d = gd.ctx.base.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) n++; return n; });
const hash = (page) => page.evaluate(() => { gdFlush(); const c = gd.cv.base, d = gd.ctx.base.getImageData(0, 0, c.width, c.height).data; let h = 2166136261; for (let i = 0; i < d.length; i += 4) { h ^= d[i] + (d[i + 1] << 8) + (d[i + 2] << 16); h = Math.imul(h, 16777619) >>> 0; } return h + ':' + c.width; });
const els = (page) => page.evaluate(() => gd.els.map((e) => ({ type: e.type, tool: e.tool, kind: e.kind, mode: e.mode, id: e.id })));
const nEls = (page) => page.evaluate(() => gd.els.length);
// يفحص كل عقد النص والخصائص في الصفحة (بما فيها العناصر المخفية، بدون <script>/<style>) بحثاً عن كلمة
const leakScan = (page, word) => page.evaluate((w) => {
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; while ((n = walker.nextNode())) { const t = n.parentElement && n.parentElement.tagName; if (t === 'SCRIPT' || t === 'STYLE') continue; if (n.nodeValue.includes(w)) hits.push('text:' + n.parentElement.id + '.' + n.parentElement.className); }
  document.querySelectorAll('body *').forEach((e) => { if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE') return; for (const a of e.attributes) if (a.value.includes(w)) hits.push('attr:' + a.name + '@' + e.id + '.' + e.className); });
  return hits;
}, word);
const setHex = async (page, hex) => { await page.fill('#gd-hex', hex); await page.evaluate(() => document.getElementById('gd-hex').blur()); };

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const DESK = { w: 1366, h: 900, dpr: 1 };

  // ====================================================================
  // الدورة 1 — مسار الستريمر الكامل: إعداد ← مشاركون ← رسم ← تخمين خاطئ/صحيح ← فوز ← لعبة جديدة
  // ====================================================================
  cycle = '[دورة1] ';
  if (RUN(1)) {
    const page = await boot(browser, DESK);
    await page.evaluate(() => show('setup-draw')); await sleep(250);
    check('الإعداد: حقل الكلمة السرية من نوع password ولا يوجد canvas في صفحة الإعداد', await page.evaluate(() => document.getElementById('draw-thing').type === 'password' && !document.querySelector('#pg-setup-draw canvas')));
    // إطلاق بدون كلمة ← رسالة حالة ثابتة داخل الصفحة (لا toast ولا confirm/alert)
    await page.evaluate(() => { document.getElementById('draw-thing').value = ''; launchDraw(); });
    const st = await page.evaluate(() => ({ t: document.getElementById('draw-status').textContent, active: document.querySelector('.page.active').id }));
    check('الإعداد: بدون كلمة ← تنبيه ثابت داخل الصفحة وبقاء الصفحة (بدون toast/نوافذ متصفح)', st.t.length > 3 && st.active === 'pg-setup-draw' && !(await page.evaluate(() => window.__toastShows.length)) && !page._dialogs.length, st);
    await page.evaluate(() => { document.getElementById('draw-thing').value = 'سري'; document.getElementById('gd-eye').click(); });
    check('الإعداد: زر العين يكشف/يخفي الكلمة', await page.evaluate(() => document.getElementById('draw-thing').type === 'text'));
    await page.evaluate(() => document.getElementById('gd-eye').click());

    await startRound(page);
    check('الدخول: لوحة اللعبة فعّالة والمحرك مركَّب', await page.evaluate(() => document.querySelector('.page.active').id === 'pg-draw' && gd.bound && drawGameStatus === 'active'));
    const geo = await page.evaluate(() => { const f = document.getElementById('gd-frame').getBoundingClientRect(), c = document.getElementById('gd-live').getBoundingClientRect(); return { w: f.width, h: f.height, ratio: f.width / f.height, bg: getComputedStyle(document.getElementById('gd-frame')).backgroundColor, vw: innerWidth, vh: innerHeight, cx: c.x, cy: c.y }; });
    check('اللوحة: بيضاء بنسبة 4:3 وعرض 640–800 وليست ملء الشاشة', Math.abs(geo.ratio - 4 / 3) < 0.02 && geo.w >= 640 && geo.w <= 800 && geo.w < geo.vw * 0.75 && geo.bg === 'rgb(255, 255, 255)', geo);
    check('اللوحة: بيضاء تماماً عند البدء (لا حبر)', (await ink(page)) === 0 && white(await px(page, 400, 300)));

    // المشاركون عبر الشات (جسر مزيّف) — مشاركان يخمّنان خطأ ثم صح
    await say('v_one', 'كلب', 'سالم'); await say('v_two', 'بقرة', 'ليلى');
    await waitFor(page, () => drawParticipants.size === 2);
    check('الشات: أي رسالة أثناء الراوند تُدخل صاحبها وتُفحص محاولته، وعدّاد المشاركين في الشريط العلوي', await page.evaluate(() => drawParticipants.size === 2 && document.querySelectorAll('#draw-guesses-board .gd-g').length === 2 && document.getElementById('gd-pc-n').textContent === '2' && document.getElementById('gd-guess-n').textContent === '2'));
    // رسم أثناء الجولة بأدوات مختلفة
    await pick(page, 'pen'); await stroke(page, [[100, 400], [200, 300], [300, 400], [400, 300]]);
    await pick(page, 'rect'); await drag(page, [150, 150], [350, 280]);
    await pick(page, 'fill'); await setHex(page, '#22c55e');
    const bx0 = await box(page); const c1 = L2C(bx0, 250, 215); await page.mouse.click(c1.x, c1.y); await page.evaluate(() => gdFlush());
    await pick(page, 'text'); const c2 = L2C(bx0, 450, 100); await page.mouse.click(c2.x, c2.y);
    await page.waitForSelector('.gd-te'); await page.keyboard.type('بيت house'); await page.keyboard.press('Enter');
    await page.evaluate(() => gdFlush());
    const kinds = (await els(page)).map((e) => e.type);
    check('الرسم: قلم + مستطيل + تعبئة + نص كلها عناصر مسجّلة', ['path', 'shape', 'fill', 'text'].every((k) => kinds.includes(k)), kinds);
    check('التعبئة: داخل المستطيل أخضر والخارج أبيض والحدّ أسود (لا تسرّب)', near(await px(page, 250, 215), '#22c55e', 20) && white(await px(page, 600, 500)) && dark(await px(page, 150, 215)));

    // الإجابة السرية لا تظهر في أي واجهة للجمهور
    const leak1 = await leakScan(page, WORD);
    check('السرّية: الكلمة السرية غير موجودة في أي نص/خاصية بالصفحة (حتى المخفية) أثناء الراوند', leak1.length === 0, leak1);

    await say('v_two', 'زرافتان', 'ليلى');   // كلمة قريبة لكن غير مطابقة ← لا تفوز
    await sleep(300);
    const statusAfterOdd = await page.evaluate(() => drawGameStatus);
    await say('v_one', 'زرافه', 'سالم');          // ه ≠ ة بعد normalize ← خطأ
    await sleep(300);
    await say('v_one', 'زرافة', 'سالم');
    await waitFor(page, () => document.querySelector('.page.active').id === 'pg-draw-winner', null, 5000);
    const win = await page.evaluate(() => ({ name: document.getElementById('draww-name').textContent, wins: window.__wins.slice(), status: drawGameStatus }));
    check('الفوز: أول تخمين صحيح يفتح شاشة الفوز باسم الفائز ويسجَّل مرة واحدة', win.name === 'سالم' && win.wins.length === 1 && win.status === 'finished', win);
    check('تخمين مشابه لكن غير مطابق لا يفوز (' + statusAfterOdd + ')', statusAfterOdd === 'active');
    const leak2 = await leakScan(page, WORD);
    check('السرّية: بعد التخمين الصحيح أيضاً لا تظهر الكلمة بأي مكان بالـDOM (صف التخمين الصحيح مُقنَّع، والشات لا يُكتب)', leak2.length === 0, leak2);
    check('الفوز: شاشة الفوز بلا toast، والمحرك مفكَّك (لا مستمعات)', !(await page.evaluate(() => window.__toastShows.length)) && !(await page.evaluate(() => gd.bound)));
    await sleep(900);
    check('لا فوز مكرّر بعد مرور مؤقّت الفوز', (await page.evaluate(() => window.__wins.length)) === 1);

    // لعبة جديدة: لا بقايا من الرسمة السابقة
    await page.evaluate(() => goSetupDraw()); await sleep(200);
    await startRound(page, 'فيل');
    check('لعبة جديدة: لوحة نظيفة، سجل فارغ، مشاركون صفر', await page.evaluate(() => gd.els.length === 0 && gd.hist.length === 0 && gd.redo.length === 0 && drawParticipants.size === 0 && document.querySelectorAll('#draw-guesses-board .gd-g').length === 0));
    // تخمينان صحيحان متزامنان من لاعبين مختلفين ← فائز واحد فقط ونقطة واحدة
    const w0 = await page.evaluate(() => window.__wins.length);
    await say('dup_a', 'فيل', 'أحمد'); await say('dup_b', 'فيل', 'بدر');
    await waitFor(page, () => document.querySelector('.page.active').id === 'pg-draw-winner', null, 5000); await sleep(1200);
    const w1 = await page.evaluate(() => ({ n: window.__wins.length, who: window.__wins.slice(-1)[0], name: document.getElementById('draww-name').textContent }));
    check('تخمينان صحيحان بنفس اللحظة: فائز واحد ونقطة واحدة فقط (لا فوز مكرّر)', w1.n === w0 + 1 && w1.who === 'tiktok:dup_a' && w1.name === 'أحمد', { w0, w1 });
    check('لعبة جديدة: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  // ====================================================================
  // الدورة 2 — محرر الأشكال والتحديد والتراجع (سطح المكتب)
  // ====================================================================
  cycle = '[دورة2] ';
  if (RUN(2)) {
    const page = await boot(browser, DESK);
    await startRound(page);
    // 1) الأشكال التسعة × اتجاهات السحب الأربعة
    const shapeTools = ['line', 'arrow', 'rect', 'square', 'circle', 'ellipse', 'triangle', 'polygon', 'star'];
    const dirs = [[[300, 200], [500, 350]], [[500, 200], [300, 350]], [[300, 350], [500, 200]], [[500, 350], [300, 200]]];
    let okAll = true; const bad = [];
    for (const t of shapeTools) {
      for (const [a, b] of dirs) {
        await page.evaluate(() => gdResetScene(false));
        await pick(page, t); await drag(page, a, b);
        const r = await page.evaluate(() => { const e = gd.els[0]; if (!e) return null; const bb = gdBox(e); return { w: bb.w, h: bb.h, x: bb.x, y: bb.y }; });
        const n = await ink(page);
        if (!r || r.w < 100 || r.h < (t === 'line' || t === 'arrow' ? 100 : 100) || n < 50) { okAll = false; bad.push([t, a, b, r, n]); }
      }
    }
    check('الأشكال التسعة: تُرسم باتجاه سحب أي من الأربعة (حدود موجبة وحبر على اللوحة)', okAll, bad.slice(0, 3));

    // 2) معاينة حيّة أثناء السحب
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'rect');
    const bx = await box(page); const a = L2C(bx, 200, 200), b = L2C(bx, 450, 380);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.evaluate(() => gdFlush());
    const live = await page.evaluate(() => { const c = gd.cv.live, d = gd.ctx.live.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return { n, cur: !!gd.cur, committed: gd.els.length }; });
    await page.mouse.up(); await page.evaluate(() => gdFlush());
    check('معاينة حيّة: الشكل يظهر أثناء السحب قبل الإفلات ولا يُسجَّل إلا عند الإفلات', live.n > 100 && live.cur && live.committed === 0 && (await nEls(page)) === 1, live);

    // 3) أنماط الشكل: حدود/تعبئة/الاثنان بلونين مستقلين وسمك
    await page.evaluate(() => gdResetScene(true)); await pick(page, 'rect');
    await page.click('#gd-t-stroke'); await setHex(page, '#ff0000');
    await page.click('#gd-mode [data-mode=both]'); await page.click('#gd-t-fill'); await setHex(page, '#0000ff');
    await page.evaluate(() => { const s = document.getElementById('gd-sw'); s.value = 20; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await drag(page, [200, 200], [500, 400]);
    const cStroke = await px(page, 200, 300), cFill = await px(page, 350, 300), cOut = await px(page, 100, 100);
    check('نمط «الاثنان»: حدود حمراء وتعبئة زرقاء بلونين مستقلين وسمك 20', near(cStroke, '#ff0000', 30) && near(cFill, '#0000ff', 20) && white(cOut), { cStroke, cFill });
    const thick = await (async () => { let n = 0; for (let x = 180; x < 230; x++) { if (near(await px(page, x, 300), '#ff0000', 40)) n++; } return n; })();
    check('سمك الحدود يُطبَّق (~20px)', thick >= 17 && thick <= 23, thick);
    await page.evaluate(() => gdResetScene(false));
    await page.click('#gd-mode [data-mode=stroke]'); await drag(page, [200, 200], [500, 400]);
    check('نمط «حدود»: الداخل أبيض', white(await px(page, 350, 300)) && near(await px(page, 200, 300), '#ff0000', 40));
    await page.evaluate(() => gdResetScene(false));
    await page.click('#gd-mode [data-mode=fill]'); await drag(page, [200, 200], [500, 400]);
    check('نمط «تعبئة»: بدون حدود، الداخل أزرق', near(await px(page, 350, 300), '#0000ff', 20) && near(await px(page, 201, 300), '#0000ff', 30));

    // 4) قفل النسبة
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'ellipse');
    await page.check('#gd-ratio'); await drag(page, [200, 150], [500, 260]);
    const lk = await page.evaluate(() => { const e = gd.els[0], b = gdBox(e); return Math.abs(b.w - b.h) < 2; });
    await page.uncheck('#gd-ratio');
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'rect'); await drag(page, [200, 150], [500, 260], 8, { shift: true });
    const lk2 = await page.evaluate(() => { const b = gdBox(gd.els[0]); return Math.abs(b.w - b.h) < 2; });
    check('قفل النسبة (خانة أو Shift) يجعل الأبعاد متساوية', lk && lk2, { lk, lk2 });

    // 5) تحديد/تحريك/تحجيم/تلوين/حذف
    await page.evaluate(() => gdResetScene(true)); await pick(page, 'rect'); await drag(page, [200, 200], [400, 350]);
    await pick(page, 'select');
    const before = await page.evaluate(() => { const b = gdBox(gd.els[0]); return b; });
    await drag(page, [300, 200], [400, 250]);
    const moved = await page.evaluate(() => gdBox(gd.els[0]));
    check('التحديد: سحب المستطيل يحرّكه بنفس الإزاحة تماماً (±2)', Math.abs(moved.x - before.x - 100) < 2.5 && Math.abs(moved.y - before.y - 50) < 2.5, { before, moved });
    check('التحريك: العنصر القديم لا يترك أثراً (حافته الأصلية بيضاء) والجديد فيه حبر', white(await px(page, 300, 200)) && dark(await px(page, 300, 250)));
    const selId = await page.evaluate(() => gd.sel);
    check('التحريك: يبقى العنصر محدداً', selId !== null);
    // تحجيم من المقبض الجنوبي-الشرقي
    const sz0 = await page.evaluate(() => gdBox(gd.els[0]));
    await drag(page, [sz0.x + sz0.w, sz0.y + sz0.h], [sz0.x + sz0.w + 60, sz0.y + sz0.h + 40]);
    const sz1 = await page.evaluate(() => gdBox(gd.els[0]));
    check('التحجيم: سحب المقبض يكبّر العنصر بالإزاحة المطلوبة', Math.abs(sz1.w - sz0.w - 60) < 3 && Math.abs(sz1.h - sz0.h - 40) < 3 && Math.abs(sz1.x - sz0.x) < 1, { sz0, sz1 });
    // تلوين المحدد
    await setHex(page, '#00ff00'); await page.evaluate(() => gdFlush());
    check('تلوين المحدد: لون الحدود الجديد يطبَّق على العنصر المحدد', await page.evaluate(() => gd.els[0].stroke === '#00ff00'));
    // حذف بالمفتاح ثم تراجع
    await page.keyboard.press('Delete');
    check('حذف المحدد (Delete)', (await nEls(page)) === 0);
    await page.keyboard.press('Control+z');
    check('تراجع عن الحذف يعيد العنصر', (await nEls(page)) === 1);
    // نقر على فراغ يلغي التحديد
    await drag(page, [60, 60], [62, 62], 2);
    check('نقر على فراغ يلغي التحديد', await page.evaluate(() => gd.sel === null));

    // 6) تراجع/إعادة يغطي كل شيء (رسم/شكل/تعبئة/نص/تحريك/مسح)
    await page.evaluate(() => gdResetScene(true));
    const snaps = [await hash(page)];
    await pick(page, 'pen'); await stroke(page, [[100, 100], [250, 160], [400, 100]]); snaps.push(await hash(page));
    await pick(page, 'ellipse'); await drag(page, [150, 250], [400, 420]); snaps.push(await hash(page));
    await pick(page, 'fill'); await setHex(page, '#f59e0b'); { const c = L2C(await box(page), 275, 335); await page.mouse.click(c.x, c.y); await page.evaluate(() => gdFlush()); } snaps.push(await hash(page));
    await pick(page, 'text'); { const c = L2C(await box(page), 500, 250); await page.mouse.click(c.x, c.y); } await page.waitForSelector('.gd-te'); await page.keyboard.type('Hi مرحبا'); await page.keyboard.press('Enter'); snaps.push(await hash(page));
    await pick(page, 'select'); await drag(page, [275, 250 + 1], [275, 300]); snaps.push(await hash(page));
    await page.click('#gd-clear'); await page.click('#gd-modal-yes'); snaps.push(await hash(page));
    const nAct = await page.evaluate(() => gd.hist.length);
    let okU = true; const seq = [];
    for (let i = snaps.length - 2; i >= 0; i--) { await page.keyboard.press('Control+z'); const h = await hash(page); seq.push(h === snaps[i]); if (h !== snaps[i]) okU = false; }
    check('تراجع متتابع (' + nAct + ' خطوات) يعيد الحالات السابقة بكسل ببكسل ويعود للوحة فارغة', okU && (await ink(page)) === 0, seq);
    let okR = true;
    for (let i = 1; i < snaps.length; i++) { await page.keyboard.press('Control+y'); const h = await hash(page); if (h !== snaps[i]) okR = false; }
    check('إعادة متتابعة تعيد كل الحالات بنفس البكسلات', okR);
    check('أزرار تراجع/إعادة تتعطل عند انتهاء السجل', await page.evaluate(() => document.getElementById('draw-btn-redo').disabled === true && document.getElementById('draw-btn-undo').disabled === false));
    // تراجع عن مسح الكل
    await page.keyboard.press('Control+z');
    await page.click('#gd-clear'); await page.click('#gd-modal-yes');
    const afterClear = await ink(page); await page.keyboard.press('Control+z');
    check('المسح قابل للتراجع', afterClear === 0 && (await ink(page)) > 0);

    // 7) حدّ سجل التراجع 100
    await page.evaluate(() => { gdResetScene(true); for (let i = 0; i < 130; i++) gdCommit(gd.els.concat({ id: gd.nextId++, type: 'path', tool: 'pen', color: '#000', size: 2, alpha: 1, seed: 1, pts: [[10 + i, 10], [12 + i, 30]] })); });
    check('سجل التراجع محدود بـ100 ويبقى الرسم سليماً', await page.evaluate(() => gd.hist.length === 100 && gd.els.length === 130));

    // 8) مسح الكل: نافذة تأكيد داخل الواجهة (بدون confirm المتصفح) والإلغاء يحفظ الرسم
    await page.evaluate(() => gdResetScene(true)); await pick(page, 'pen'); await stroke(page, [[100, 100], [300, 300]]);
    await page.click('#gd-clear');
    const modalOpen = await page.evaluate(() => !document.getElementById('gd-modal').hidden);
    await page.click('#gd-modal-no');
    const kept = await nEls(page);
    await page.click('#gd-clear'); await page.keyboard.press('Escape');
    const kept2 = await nEls(page);
    await page.click('#gd-clear'); await page.click('#gd-modal-yes');
    check('مسح الكل: نافذة داخل الواجهة، إلغاء/Esc يحفظان الرسم، التأكيد يمسح، بلا نوافذ متصفح', modalOpen && kept === 1 && kept2 === 1 && (await nEls(page)) === 0 && !page._dialogs.length, { modalOpen, kept, kept2, d: page._dialogs });
    // تلميحات تظهر عند المرور (بدون toast)
    await page.hover('#draw-toolbar [data-tool=pen]'); await sleep(500);
    const tip = await page.evaluate(() => { const b = document.querySelector('#draw-toolbar [data-tool=pen]'); const s = getComputedStyle(b, '::after'); return { op: s.opacity, content: s.content }; });
    check('تلميح الأداة يظهر عند المرور', tip.op === '1' && /قلم/.test(tip.content), tip);
    check('دورة 2: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  // ====================================================================
  // الدورة 3 — الأدوات الحرة والألوان والتعبئة والقطّارة والنص والتصدير
  // ====================================================================
  cycle = '[دورة3] ';
  if (RUN(3)) {
    const page = await boot(browser, DESK);
    await startRound(page);
    // الأدوات الحرة
    const tools = ['pen', 'brush', 'marker', 'spray'];
    const inks = {};
    for (const t of tools) {
      await page.evaluate(() => gdResetScene(false)); await pick(page, t);
      await stroke(page, [[200, 300], [300, 250], [400, 300], [500, 250]]);
      inks[t] = await ink(page);
    }
    check('الأدوات الحرة (قلم/فرشاة/ماركر/رش) ترسم كلها', tools.every((t) => inks[t] > 100), inks);
    check('الفرشاة الناعمة أعرض/أنعم من القلم والرش حبّات متفرقة', inks.brush > inks.pen && inks.marker > inks.pen, inks);
    // الرش حتمي: إعادة الرسم من العناصر يعطي نفس البكسلات
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'spray'); await stroke(page, [[200, 300], [400, 300]]);
    const h1 = await hash(page); await page.evaluate(() => { gd.dirtyB = true; gdFlush(); }); const h2 = await hash(page);
    check('الرش حتمي: نفس الرسم بعد إعادة التصيير (لا يتغيّر عند تغيير الحجم)', h1 === h2);
    // الممحاة بيضاء وليست شفافة
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'pen'); await stroke(page, [[100, 300], [700, 300]]);
    await pick(page, 'eraser'); await page.click('.gd-presets [data-esize="48"]'); await stroke(page, [[400, 270], [400, 330]]);
    const er = await px(page, 400, 300);
    check('الممحاة: تعطي أبيض معتماً (alpha=255) وليست شفافة', white(er) && er[3] === 255 && dark(await px(page, 150, 300)), er);
    // أحجام الممحاة الثلاثة
    const sizes = []; for (const s of [8, 22, 48]) { await page.click('.gd-presets [data-esize="' + s + '"]'); sizes.push(await page.evaluate(() => gd.sizes.eraser)); }
    check('ممحاة بثلاثة أحجام جاهزة + شريط الحجم', JSON.stringify(sizes) === '[8,22,48]');
    // شفافية
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'marker'); await page.evaluate(() => { const s = document.getElementById('gd-alpha'); s.value = 30; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await stroke(page, [[200, 300], [500, 300]]);
    const al = await px(page, 350, 300);
    check('الشفافية 30% تُنتج لوناً أفتح من الأسود', al[0] > 120 && al[0] < 230, al);
    await page.evaluate(() => { const s = document.getElementById('gd-alpha'); s.value = 100; s.dispatchEvent(new Event('input', { bubbles: true })); });

    // الألوان
    check('لوحة الألوان: 12 عائلة × 5 درجات (60) وكل درجة باسم عربي', await page.evaluate(() => { const s = [...document.querySelectorAll('#gd-palette .gd-sw')]; return s.length === 60 && s.every((b) => /\S+ \S+/.test(b.getAttribute('aria-label') || '')) && ['أسود', 'أبيض', 'رمادي', 'أحمر', 'برتقالي', 'أصفر', 'أخضر', 'سماوي', 'أزرق', 'بنفسجي', 'وردي', 'بني'].every((n) => s.some((b) => b.getAttribute('aria-label').startsWith(n))); }));
    await pick(page, 'pen');
    await page.click('#gd-palette .gd-sw[data-c="#b71c1c"]');
    const sel = await page.evaluate(() => ({ on: [...document.querySelectorAll('#gd-palette .gd-sw.on')].map((b) => b.dataset.c), aria: document.querySelector('#gd-palette .gd-sw.on').getAttribute('aria-selected'), hex: document.getElementById('gd-hex').value, st: gd.stroke, chk: getComputedStyle(document.querySelector('#gd-palette .gd-sw.on .gd-i')).opacity }));
    check('اللون المختار: علامة صح + HEX + اللون الحالي في الأداة', sel.on.length === 1 && sel.on[0] === '#b71c1c' && sel.aria === 'true' && sel.hex === '#B71C1C' && sel.st === '#b71c1c' && sel.chk === '1', sel);
    await page.evaluate(() => gdResetScene(false)); await stroke(page, [[200, 300], [500, 300]]);
    check('الرسم باللون المختار فعلاً', near(await px(page, 350, 300), '#b71c1c', 20));
    // HEX: صحيح (3 و 6 خانات) وخاطئ لا يكسر الرسم
    await setHex(page, '#0f0');
    check('HEX مختصر (#0f0) يُقبل ويتحوّل إلى #00ff00', await page.evaluate(() => gd.stroke === '#00ff00'));
    await page.fill('#gd-hex', 'zz12'); const bad1 = await page.evaluate(() => ({ cls: document.getElementById('gd-hex').classList.contains('bad'), st: gd.stroke, inv: document.getElementById('gd-hex').getAttribute('aria-invalid') }));
    await page.evaluate(() => document.getElementById('gd-hex').blur());
    const bad2 = await page.evaluate(() => ({ hex: document.getElementById('gd-hex').value, cls: document.getElementById('gd-hex').classList.contains('bad') }));
    await page.evaluate(() => gdResetScene(false)); await stroke(page, [[200, 350], [500, 350]]);
    check('HEX خاطئ: يُعلَّم خطأ، لا يغيّر اللون، يعود للقيمة الصحيحة عند الخروج، والرسم يعمل', bad1.cls && bad1.st === '#00ff00' && bad1.inv === 'true' && bad2.hex === '#00FF00' && !bad2.cls && near(await px(page, 350, 350), '#00ff00', 20), { bad1, bad2 });
    // منتقي الألوان الأصلي
    await page.evaluate(() => { const i = document.getElementById('gd-picker'); i.value = '#123456'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    check('منتقي الألوان الأصلي يغيّر اللون ويضيفه للألوان الحديثة', await page.evaluate(() => gd.stroke === '#123456' && document.querySelector('#gd-recent .gd-sw').dataset.c === '#123456'));
    // ألوان حديثة محدودة بـ8 وبلا تكرار
    for (const c of ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777', '#888888', '#999999', '#999999']) await page.evaluate((c) => gdSetColor(c, true), c);
    check('الألوان الحديثة: 8 كحد أقصى وبلا تكرار', await page.evaluate(() => { const r = [...document.querySelectorAll('#gd-recent .gd-sw')].map((b) => b.dataset.c); return r.length === 8 && new Set(r).size === 8; }));
    // لونا الخط والتعبئة المنفصلان
    await pick(page, 'star'); await page.click('#gd-mode [data-mode=both]');
    const tg = await page.evaluate(() => ({ s: !document.getElementById('gd-t-stroke').hidden, f: !document.getElementById('gd-t-fill').hidden }));
    check('أداة الشكل بنمط «الاثنان»: عرض هدفَي اللون (خط/تعبئة) معاً', tg.s && tg.f);
    await pick(page, 'pen');
    check('أداة القلم: هدف لون واحد فقط (بدون تعبئة)', await page.evaluate(() => document.getElementById('gd-t-fill').hidden === true));

    // التعبئة: لا تتجاوز الحدود، تسامح، سرعة
    await page.evaluate(() => gdResetScene(true));
    await pick(page, 'rect'); await drag(page, [200, 150], [400, 300]);   // مستطيل مغلق حدود سوداء
    await pick(page, 'pen'); await stroke(page, [[500, 150], [650, 150], [650, 300], [500, 300], [500, 150]]);   // إطار بالقلم
    await pick(page, 'fill'); await page.evaluate(() => gdSetColor('#ef4444', true));
    { const bb = await box(page); let c = L2C(bb, 300, 225); await page.mouse.click(c.x, c.y); c = L2C(bb, 575, 225); await page.mouse.click(c.x, c.y); }
    await page.evaluate(() => gdFlush());
    check('التعبئة تحترم الحدود: داخل المستطيل وداخل الإطار أحمر وبينهما أبيض', near(await px(page, 300, 225), '#ef4444', 20) && near(await px(page, 575, 225), '#ef4444', 20) && white(await px(page, 450, 225)) && dark(await px(page, 200, 225)));
    // تسامح: خط رمادي فاتح
    await page.evaluate(() => gdResetScene(true));
    await page.evaluate(() => gdCommit(gd.els.concat({ id: gd.nextId++, type: 'path', tool: 'pen', color: '#e6e6e6', size: 3, alpha: 1, seed: 1, pts: [[200, -20], [200, 620]] })));
    await pick(page, 'fill'); await page.evaluate(() => gdSetColor('#2563eb', false));
    await page.evaluate(() => { const s = document.getElementById('gd-tol'); s.value = 0; s.dispatchEvent(new Event('input', { bubbles: true })); });
    { const c = L2C(await box(page), 500, 300); await page.mouse.click(c.x, c.y); await page.evaluate(() => gdFlush()); }
    const tol0 = near(await px(page, 100, 300), '#ffffff', 30) ? 'left-white' : 'left-filled';
    await page.keyboard.press('Control+z');
    await page.evaluate(() => { const s = document.getElementById('gd-tol'); s.value = 60; s.dispatchEvent(new Event('input', { bubbles: true })); });
    { const c = L2C(await box(page), 500, 300); await page.mouse.click(c.x, c.y); await page.evaluate(() => gdFlush()); }
    const tol60 = near(await px(page, 100, 300), '#2563eb', 25) ? 'left-filled' : 'left-white';
    check('تسامح التعبئة: 0 يقف عند الحاجز الفاتح، 60 يتجاوزه', tol0 === 'left-white' && tol60 === 'left-filled', { tol0, tol60 });
    // سرعة التعبئة على لوحة مزدحمة (لا تجمّد)
    await page.evaluate(() => { gdResetScene(true); for (let i = 0; i < 60; i++) { const y = 20 + i * 9; gdCommit(gd.els.concat({ id: gd.nextId++, type: 'path', tool: 'pen', color: '#000', size: 2, alpha: 1, seed: 1, pts: [[10, y], [790, y + (i % 2 ? 5 : -5)]] })); } });
    const t0 = Date.now(); await pick(page, 'fill'); { const c = L2C(await box(page), 400, 24); await page.mouse.click(c.x, c.y); } await page.evaluate(() => gdFlush()); const dt = Date.now() - t0;
    check('التعبئة على لوحة مزدحمة تنتهي سريعاً (' + dt + 'ms < 2500)', dt < 2500, dt);
    // تعبئة اللوحة الفارغة كلها
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'fill'); await page.evaluate(() => gdSetColor('#fde047', false));
    { const c = L2C(await box(page), 400, 300); await page.mouse.click(c.x, c.y); await page.evaluate(() => gdFlush()); }
    check('تعبئة اللوحة الفارغة تلوّنها كلها', near(await px(page, 5, 5), '#fde047', 6) && near(await px(page, 795, 595), '#fde047', 6));
    // قطّارة
    await pick(page, 'eyedrop'); { const c = L2C(await box(page), 300, 300); await page.mouse.click(c.x, c.y); }
    check('القطّارة تلتقط لون النقطة وتعود للأداة السابقة', await page.evaluate(() => gd.fill === '#fde047' || gd.stroke === '#fde047') && (await page.evaluate(() => gd.tool)) === 'fill');

    // النص
    await page.evaluate(() => gdResetScene(true)); await pick(page, 'text');
    await page.evaluate(() => { const s = document.getElementById('gd-tsize'); s.value = 64; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.evaluate(() => gdSetColor('#7c3aed', false));
    { const c = L2C(await box(page), 150, 150); await page.mouse.click(c.x, c.y); }
    await page.waitForSelector('.gd-te'); await page.keyboard.type('مرحبا'); await page.keyboard.press('Enter');
    { const c = L2C(await box(page), 150, 350); await page.mouse.click(c.x, c.y); }
    await page.waitForSelector('.gd-te'); await page.keyboard.type('Hello'); await page.keyboard.press('Shift+Enter'); await page.keyboard.type('World'); await page.keyboard.press('Enter');
    const tx = await page.evaluate(() => { gdFlush(); return gd.els.filter((e) => e.type === 'text').map((e) => ({ t: e.text, s: e.size, c: e.color })); });
    check('النص العربي والإنجليزي (وسطرين) بالحجم واللون المحدّدين', tx.length === 2 && tx[0].t === 'مرحبا' && tx[1].t === 'Hello\nWorld' && tx[0].s === 64 && tx[0].c === '#7c3aed', tx);
    check('النص مرسوم فعلاً على اللوحة', (await ink(page)) > 800);
    // Esc يلغي، وفراغ لا ينشئ عنصراً
    { const c = L2C(await box(page), 500, 100); await page.mouse.click(c.x, c.y); } await page.waitForSelector('.gd-te'); await page.keyboard.type('x'); await page.keyboard.press('Escape');
    { const c = L2C(await box(page), 500, 100); await page.mouse.click(c.x, c.y); } await page.waitForSelector('.gd-te'); await page.keyboard.press('Enter');
    check('نص: Escape يلغي والنص الفارغ لا يُنشئ عنصراً', (await nEls(page)) === 2 && (await page.$('.gd-te')) === null);
    // تعديل نص بنقرتين، تحريك/حذف النص
    await pick(page, 'select'); { const c = L2C(await box(page), 200, 175); await page.mouse.dblclick(c.x, c.y); }
    await page.waitForSelector('.gd-te'); await page.keyboard.press('Control+a'); await page.keyboard.type('أهلاً'); await page.keyboard.press('Enter');
    check('تعديل نص موجود بنقرة مزدوجة', await page.evaluate(() => gd.els.filter((e) => e.type === 'text')[0].text === 'أهلاً'));
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'text');
    { const c = L2C(await box(page), 150, 150); await page.mouse.click(c.x, c.y); } await page.waitForSelector('.gd-te'); await page.keyboard.type('احذفني'); await page.keyboard.press('Enter');
    await pick(page, 'select'); await drag(page, [190, 175], [290, 275]); await page.keyboard.press('Delete');
    check('تحريك النص ثم حذفه', (await nEls(page)) === 0);

    // تصدير PNG: خلفية بيضاء بدون واجهة
    await page.evaluate(() => gdResetScene(true)); await pick(page, 'pen'); await stroke(page, [[100, 100], [700, 500]]);
    await pick(page, 'eraser'); await stroke(page, [[400, 280], [420, 330]]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawpng-'));
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#gd-save')]);
    const file = path.join(dir, dl.suggestedFilename()); await dl.saveAs(file);
    const b64 = fs.readFileSync(file).toString('base64');
    const png = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data; let minA = 255, nonWhite = 0;
      for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < minA) minA = d[i + 3]; if (d[i] < 200) nonWhite++; }
      return { w: img.width, h: img.height, minA, nonWhite, corner: Array.from(x.getImageData(2, 2, 1, 1).data), mid: Array.from(x.getImageData(img.width / 2 - 20, img.height / 2 - 10, 1, 1).data) };
    }, b64);
    check('PNG: 1600×1200، كل البكسلات معتمة (لا شفافية)، الزوايا بيضاء، يحوي الرسم فقط', png.w === 1600 && png.h === 1200 && png.minA === 255 && png.corner[0] === 255 && png.nonWhite > 500 && png.nonWhite < 40000, png);
    check('PNG: اسم الملف .png وبلا واجهة (أقل من 5% بكسلات غير بيضاء)', /\.png$/.test(dl.suggestedFilename()) && png.nonWhite < 1600 * 1200 * 0.05);
    check('دورة 3: لا أخطاء JS ولا نوافذ متصفح', page._errors.length === 0 && !page._dialogs.length, { e: page._errors, d: page._dialogs });
    await page.context().close();
  }

  // ====================================================================
  // الدورة 4 — الشاشات (سطح مكتب/جوال/دوران) والتكبير والتبديل وعدم ضياع الرسم
  // ====================================================================
  cycle = '[دورة4] ';
  if (RUN(4)) {
    const page = await boot(browser, DESK);
    await startRound(page);
    await pick(page, 'pen'); await stroke(page, [[100, 100], [400, 500], [700, 100]]);
    await pick(page, 'rect'); await drag(page, [250, 200], [550, 350]);
    const h0 = await hash(page), n0 = await nEls(page);
    // التخطيط على سطح المكتب: الأدوات بجانب اللوحة وليست تحتها
    const lay = await page.evaluate(() => { const r = (id) => document.querySelector(id).getBoundingClientRect(); const c = r('#gd-frame'), t = r('#draw-toolbar'), s = r('#gd-settings'), g = r('#gd-guess'); return { toolsBeside: t.right <= c.left + 4 || t.left >= c.right - 4, vOverlap: t.top < c.bottom && t.bottom > c.top, settingsBeside: s.right <= c.left + 4 || s.left >= c.right - 4, guessNotBelow: g.top < c.bottom - 40 || g.left >= c.right - 4 || g.right <= c.left + 4 }; });
    check('سطح المكتب: الأدوات والإعدادات على جانبي اللوحة وليست تحتها', lay.toolsBeside && lay.vOverlap && lay.settingsBeside && lay.guessNotBelow, lay);
    // لا شيء نصّي تحت اللوحة مباشرة (داخل عمود اللوحة)
    const under = await page.evaluate(() => { const st = document.getElementById('gd-stage'), fr = document.getElementById('gd-frame').getBoundingClientRect(); const out = []; st.querySelectorAll('*').forEach((e) => { const r = e.getBoundingClientRect(); if (r.width && r.top >= fr.bottom - 1 && (e.textContent || '').trim()) out.push(e.tagName + ':' + e.textContent.trim().slice(0, 30)); }); return out; });
    check('لا أي نص/رسالة تحت اللوحة داخل عمودها', under.length === 0, under);
    const stageKids = await page.evaluate(() => [...document.getElementById('gd-stage').children].map((e) => e.className));
    check('عمود اللوحة = شريط عرض + اللوحة فقط', JSON.stringify(stageKids) === JSON.stringify(['gd-stage-bar', 'gd-scroll']), stageKids);
    // الجوال
    const sizes = [[390, 844, 3, true], [360, 740, 2, true], [768, 1024, 2, false], [844, 390, 3, true], [1024, 600, 1, false]];
    for (const [w, h, dpr, mobile] of sizes) {
      await setView(page, { w, h, dpr, mobile }); await sleep(450);
      const m = await page.evaluate(() => { const c = document.getElementById('gd-frame').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, cw: c.width, right: c.right, left: c.left, sc: gd.sc, bw: gd.cv.base.width, n: gd.els.length }; });
      const h1 = await hash(page);
      const sameLogical = await page.evaluate(() => { const a = gd.ctx.base.getImageData(Math.floor(100 * gd.sc), Math.floor(100 * gd.sc), 6, 6).data; let s = 0; for (let i = 0; i < a.length; i += 4) if (a[i] < 100) s++; return s; });
      check(`${w}×${h}@${dpr}x: بلا تمرير أفقي، اللوحة داخل الشاشة، العناصر محفوظة (${m.n})، الدقة ${m.bw}px`, m.sw <= m.iw && m.left >= -1 && m.right <= m.iw + 1 && m.n === n0 && m.bw >= 800 * Math.min(dpr, 3) * (m.cw / 800) - 2 && sameLogical > 0, { m, sameLogical });
      if (w === 390) {
        const ml = await page.evaluate(() => { const r = (id) => document.querySelector(id).getBoundingClientRect(); const c = r('#gd-frame'), t = r('#draw-toolbar'), g = r('#gd-guess'), s = r('#gd-settings'); return { toolsBelow: t.top >= c.bottom - 2, guessAbove: g.bottom <= c.top + 2, settingsBelow: s.top >= t.bottom - 2, canvasW: c.width }; });
        check('جوال 390: لوحة الأدوات تحت اللوحة وقائمة التخمينات فوقها (ليست تحتها)', ml.toolsBelow && ml.guessAbove && ml.settingsBelow, ml);
        const bt = await page.evaluate(() => [...document.querySelectorAll('#draw-toolbar button')].filter((b) => b.offsetParent).map((b) => Math.round(b.getBoundingClientRect().width)));
        check('جوال: أزرار الأدوات لمس مريحة (≥36px)', bt.length > 15 && bt.every((w) => w >= 36), bt);
      }
    }
    await setView(page, DESK); await sleep(450);
    check('الرجوع لسطح المكتب بعد كل التدوير: نفس الرسم بكسل ببكسل', (await hash(page)).split(':')[0] === h0.split(':')[0] || (await ink(page)) > 0 && (await nEls(page)) === n0);
    // دقة عالية
    await setView(page, { w: 1366, h: 900, dpr: 2 }); await sleep(450);
    const hd = await page.evaluate(() => ({ sc: gd.sc, bw: gd.cv.base.width, css: gd.cssW }));
    check('شاشة عالية الكثافة (DPR2): دقة التصيير ≥ 2× (حدّة الخطوط)', hd.bw >= hd.css * 2 - 2 && hd.sc >= 2, hd);
    await setView(page, DESK); await sleep(300);

    // التكبير والتصغير والتمرير
    const z0 = await page.evaluate(() => document.getElementById('gd-frame').getBoundingClientRect().width);
    await page.click('#gd-zin'); await page.click('#gd-zin'); await page.click('#gd-zin'); await sleep(200);
    const z1 = await page.evaluate(() => ({ w: document.getElementById('gd-frame').getBoundingClientRect().width, zoom: gd.zoom, pct: document.getElementById('gd-zpct').textContent, scrollable: document.getElementById('gd-scroll').scrollWidth > document.getElementById('gd-scroll').clientWidth, sc: gd.sc }));
    check('تكبير ×1.25³: العرض يكبر، النسبة تظهر، التمرير داخل اللوحة، والدقة ترتفع', z1.w > z0 * 1.9 && z1.pct === '195%' && z1.scrollable && z1.sc >= 1.5, z1);
    // رسم تحت التكبير: الإحداثيات صحيحة
    await page.evaluate(() => gdResetScene(false)); // يعيد التكبير إلى 100%؛ نكبّر ثم نرسم
    await page.click('#gd-zin'); await page.click('#gd-zin'); await page.click('#gd-zin'); await page.click('#gd-zin'); await sleep(200);
    await pick(page, 'pen');
    const target = await page.evaluate(() => { const sc = document.getElementById('gd-scroll'), r = sc.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.mouse.move(target.x + 80, target.y + 40, { steps: 5 }); await page.mouse.up();
    const mapped = await page.evaluate(([tx, ty]) => { const r = gd.cv.live.getBoundingClientRect(), e = gd.els[0], p = e.pts[0]; return { ex: (tx - r.left) / r.width * 800, ey: (ty - r.top) / r.height * 600, gx: p[0], gy: p[1] }; }, [target.x, target.y]);
    check('إحداثيات الرسم صحيحة تحت التكبير (انحراف < 1px منطقي)', Math.abs(mapped.ex - mapped.gx) < 1 && Math.abs(mapped.ey - mapped.gy) < 1, mapped);
    // أداة اليد
    await pick(page, 'pan'); const s0 = await page.evaluate(() => [document.getElementById('gd-scroll').scrollLeft, document.getElementById('gd-scroll').scrollTop]);
    await page.mouse.move(target.x, target.y); await page.mouse.down(); await page.mouse.move(target.x - 120, target.y - 90, { steps: 4 }); await page.mouse.up();
    const s1 = await page.evaluate(() => [document.getElementById('gd-scroll').scrollLeft, document.getElementById('gd-scroll').scrollTop]);
    check('أداة اليد تحرّك العرض عند التكبير ولا ترسم', (s1[0] - s0[0] === 120 || s1[1] - s0[1] === 90 || Math.abs(s1[0] - s0[0]) > 20) && (await nEls(page)) === 1, { s0, s1 });
    await page.click('#gd-zpct');
    check('زر النسبة يعيد التكبير إلى 100%', await page.evaluate(() => gd.zoom === 1 && document.getElementById('gd-zpct').textContent === '100%'));
    // ctrl+عجلة
    const bb = await box(page); await page.mouse.move(bb.x + 300, bb.y + 200); await page.keyboard.down('Control'); await page.mouse.wheel(0, -300); await page.keyboard.up('Control'); await sleep(150);
    check('Ctrl+عجلة الفأرة تكبّر داخل اللوحة', await page.evaluate(() => gd.zoom > 1.2));
    await page.click('#gd-zpct');
    // توسيع/إرجاع
    const w1 = await page.evaluate(() => document.getElementById('gd-frame').getBoundingClientRect().width);
    await page.click('#gd-expand'); await sleep(250);
    const w2 = await page.evaluate(() => ({ w: document.getElementById('gd-frame').getBoundingClientRect().width, p: document.getElementById('gd-expand').getAttribute('aria-pressed') }));
    await page.click('#gd-expand'); await sleep(250);
    const w3 = await page.evaluate(() => document.getElementById('gd-frame').getBoundingClientRect().width);
    check('توسيع اللوحة اختياري وقابل للإرجاع (والعرض الافتراضي لا يملأ الشاشة)', w1 <= 800 && w2.p === 'true' && w3 === w1 && w2.w >= w1, { w1, w2, w3 });
    check('دورة 4: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  // ====================================================================
  // الدورة 5 — لمس/قلم، اختلاط المؤشرات، الإلغاء، التمرير، الاختصارات، الإتاحة، الحركة، تنظيف المستمعات
  // ====================================================================
  cycle = '[دورة5] ';
  if (RUN(5)) {
    const page = await boot(browser, { w: 390, h: 844, dpr: 3, mobile: true, touch: true });
    await startRound(page);
    // لمس حقيقي عبر CDP
    const touch = async (type, pts) => page._cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: i + 1, radiusX: 2, radiusY: 2, force: 1 })) });
    await pick(page, 'pen');
    await page.evaluate(() => { gd.cv.live.scrollIntoView({ block: 'center' }); });
    await sleep(250);
    const bx2 = await box(page);
    const T = (lx, ly) => L2C(bx2, lx, ly);
    const sy0 = await page.evaluate(() => window.scrollY);
    let p = T(100, 200); await touch('touchStart', [p]);
    for (let i = 1; i <= 10; i++) { p = T(100 + i * 50, 200 + Math.sin(i) * 60); await touch('touchMove', [p]); }
    await touch('touchEnd', []); await page.evaluate(() => gdFlush());
    check('لمس حقيقي (CDP touch): يرسم خطاً ولا يمرّر الصفحة', (await nEls(page)) === 1 && (await ink(page)) > 200 && (await page.evaluate(() => window.scrollY)) === sy0, { n: await nEls(page), y: await page.evaluate(() => window.scrollY), sy0 });
    const ta = await page.evaluate(() => getComputedStyle(document.getElementById('gd-live')).touchAction);
    check('touch-action:none على اللوحة فقط (منع تمرير الصفحة داخلها)', ta === 'none' && (await page.evaluate(() => getComputedStyle(document.body).touchAction)) !== 'none', ta);
    // إصبعان: تكبير بالقرص ولا يترك خطاً
    const n1 = await nEls(page); const c = { x: bx2.x + bx2.w / 2, y: bx2.y + bx2.h / 2 };
    await touch('touchStart', [{ x: c.x - 20, y: c.y }, { x: c.x + 20, y: c.y }]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [{ x: c.x - 20 - i * 8, y: c.y }, { x: c.x + 20 + i * 8, y: c.y }]);
    await touch('touchEnd', []); await sleep(200);
    const pz = await page.evaluate(() => ({ zoom: gd.zoom, n: gd.els.length, ptr: !!gd.ptr }));
    check('قرص بإصبعين: يكبّر العرض دون إضافة عناصر ولا حالة عالقة', pz.zoom > 1.3 && pz.n === n1 && !pz.ptr, pz);
    await page.evaluate(() => gdZoomReset());
    // مؤشرات صناعية: قلم + إلغاء + مغادرة
    const synth = (type, id, ptype, lx, ly, extra = {}) => page.evaluate(([type, id, ptype, lx, ly, extra]) => { const cv = gd.cv.live, r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent(type, Object.assign({ pointerId: id, pointerType: ptype, bubbles: true, cancelable: true, clientX: r.left + lx / 800 * r.width, clientY: r.top + ly / 600 * r.height, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }, extra))); }, [type, id, ptype, lx, ly, extra]);
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'pen');
    await synth('pointerdown', 7, 'pen', 100, 100); await synth('pointermove', 7, 'pen', 300, 200); await synth('pointermove', 7, 'pen', 500, 100); await synth('pointerup', 7, 'pen', 500, 100);
    check('مؤشر قلم (pen): يرسم مساراً (محاكاة أحداث)', (await nEls(page)) === 1);
    await synth('pointerdown', 8, 'touch', 100, 400); await synth('pointermove', 8, 'touch', 300, 450); await synth('pointercancel', 8, 'touch', 300, 450);
    check('pointercancel أثناء الرسم يُسقط المسار الناقص بدون خط شارد', (await nEls(page)) === 1 && !(await page.evaluate(() => gd.ptr)));
    await synth('pointerdown', 9, 'mouse', 100, 500); await synth('pointermove', 9, 'mouse', 400, 500);
    await page.evaluate(() => { const cv = gd.cv.live; try { cv.releasePointerCapture(9); } catch (e) {} });
    await synth('pointerleave', 9, 'mouse', 400, 500);
    check('pointerleave بدون التقاط ينهي المسار ويحفظه (لا يعلق في وضع الرسم)', (await nEls(page)) === 2 && !(await page.evaluate(() => gd.ptr)));
    // لا خط يصل بين ضربتين منفصلتين
    await page.evaluate(() => gdResetScene(false)); await pick(page, 'pen');
    await synth('pointerdown', 1, 'mouse', 100, 100); await synth('pointermove', 1, 'mouse', 200, 100); await synth('pointerup', 1, 'mouse', 200, 100);
    await synth('pointerdown', 2, 'mouse', 600, 500); await synth('pointermove', 2, 'mouse', 700, 500); await synth('pointerup', 2, 'mouse', 700, 500);
    const gapInk = await (async () => { let n = 0; for (let t = 0.2; t < 0.8; t += 0.1) { const c2 = await px(page, 200 + 400 * t, 100 + 400 * t); if (!white(c2)) n++; } return n; })();
    check('لا خط يربط بين ضربتين (إفلات ثم ضغط في مكان آخر)', gapInk === 0 && (await nEls(page)) === 2, gapInk);
    // ضغطتان متزامنتان بمؤشرين: الثاني يُتجاهل
    await synth('pointerdown', 11, 'mouse', 100, 300); await synth('pointerdown', 12, 'mouse', 500, 300); await synth('pointermove', 12, 'mouse', 600, 300); await synth('pointerup', 12, 'mouse', 600, 300); await synth('pointerup', 11, 'mouse', 100, 300);
    check('مؤشران متزامنان: يُحسب الأول فقط', (await nEls(page)) === 3);

    // الإتاحة والاختصارات (سطح مكتب)
    await setView(page, DESK, { touch: false }); await sleep(350);
    const a11y = await page.evaluate(() => { const bs = [...document.querySelectorAll('#pg-draw button')].filter((b) => b.offsetParent); const bad = bs.filter((b) => !((b.getAttribute('aria-label') || b.textContent || '').trim())); const tips = [...document.querySelectorAll('#draw-toolbar .gd-tool')].every((b) => b.dataset.tip && b.getAttribute('aria-label') && b.hasAttribute('aria-pressed')); return { total: bs.length, bad: bad.map((b) => b.outerHTML.slice(0, 80)), tips, sliders: [...document.querySelectorAll('#gd-settings input[type=range]')].every((i) => i.id && document.querySelector('label[for=' + i.id + ']')) }; });
    check('إتاحة: كل زر باسم نصّي، أدوات بـ aria-pressed + تلميح، منزلقات بتسميات', a11y.bad.length === 0 && a11y.tips && a11y.sliders, a11y);
    const keymap = { KeyV: 'select', KeyH: 'pan', KeyP: 'pen', KeyB: 'brush', KeyM: 'marker', KeyA: 'spray', KeyE: 'eraser', KeyG: 'fill', KeyI: 'eyedrop', KeyT: 'text', KeyL: 'line', KeyW: 'arrow', KeyR: 'rect', KeyQ: 'square', KeyC: 'circle', KeyO: 'ellipse', KeyY: 'triangle', KeyU: 'polygon', KeyN: 'star' };
    let km = true; const kbad = [];
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    for (const [code, tool] of Object.entries(keymap)) { await page.keyboard.press(code); const got = await page.evaluate(() => gd.tool); if (got !== tool) { km = false; kbad.push([code, got]); } }
    check('اختصارات لوحة المفاتيح لكل الأدوات (19 أداة، بغض النظر عن لغة لوحة المفاتيح)', km, kbad);
    await page.keyboard.press('KeyP'); await page.evaluate(() => { gd.sizes.pen = 10; gdSyncControls(); }); await page.keyboard.press(']'); await page.keyboard.press(']'); await page.keyboard.press('[');
    check('اختصارا [ و ] لتغيير الحجم', (await page.evaluate(() => gd.sizes.pen)) === 12);
    // إعدادات حسب الأداة
    const vis = async (t) => { await page.evaluate((t) => gdSetTool(t), t); return page.evaluate(() => { const v = (id) => { const e = document.getElementById(id); return !!(e && !e.closest('[hidden]') && !e.hidden && e.offsetParent); }; return { size: v('gd-size'), mode: v('gd-mode'), tsize: v('gd-tsize'), tol: v('gd-tol'), sides: v('gd-sides'), sw: v('gd-sw'), del: v('gd-sel-del'), preset: v('gd-size') && !!document.querySelector('.gd-presets') && !document.querySelector('.gd-presets').hidden }; }); };
    const vp = await vis('pen'), vr = await vis('rect'), vt = await vis('text'), vf = await vis('fill'), vpoly = await vis('polygon'), ve = await vis('eraser'), vs = await vis('select');
    check('الإعدادات تظهر حسب الأداة المختارة فقط', vp.size && !vp.mode && !vp.tsize && !vp.tol && vr.mode && vr.sw && !vr.size && vt.tsize && !vt.mode && vf.tol && !vf.size && vpoly.sides && !vr.sides && ve.preset && !vp.preset && vs.del && !vs.size, { vp, vr, vt, vf, vpoly, ve, vs });

    // تحريك مخفّض
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rm = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('gd-work')).animationDuration) * 1000);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const nrm = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('gd-work')).animationDuration) * 1000);
    check('احترام تقليل الحركة: الحركات تُلغى مع reduced-motion وتعمل بدونه', rm < 5 && nrm > 100, { rm, nrm });

    // تنظيف المستمعات والمؤقّتات عند المغادرة والعودة (3 دورات) — لا تكرار للمستمعات
    for (let i = 0; i < 3; i++) { await page.evaluate(() => goHome()); await sleep(150); await startRound(page, 'x' + i); }
    await page.evaluate(() => { document.activeElement && document.activeElement.blur(); gdSetTool('pen'); });
    // نعدّ استدعاءات gdUndo عند ضغطة Ctrl+Z واحدة (يجب 1 بعد 3 دورات دخول/خروج)
    await page.evaluate(() => { window.__undoCalls = 0; const o = window.gdUndo; window.gdUndo = function () { window.__undoCalls++; return o.apply(this, arguments); }; });
    await page.keyboard.press('Control+z');
    const uc = await page.evaluate(() => window.__undoCalls);
    check('بعد 3 دورات دخول/خروج: ضغطة Ctrl+Z تنفّذ تراجعاً واحداً فقط (لا مستمعات مكرّرة)', uc === 1, uc);
    await page.evaluate(() => goHome()); await sleep(200);
    const cl = await page.evaluate(() => ({ bound: gd.bound, raf: gd.raf, ro: !!gd.ro, win: drawWinTimer, conn: drawConnTimer, te: !!document.querySelector('.gd-te') }));
    check('بعد المغادرة: المحرك مفكَّك (لا مستمعات/ResizeObserver/rAF/مؤقّتات/محرر نص)', !cl.bound && !cl.raf && !cl.ro && !cl.win && !cl.te, cl);
    const idle = await page.evaluate(() => { const n = gd.els.length; const cv = gd.cv.live, r = cv.getBoundingClientRect(); cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true, clientX: r.left + 10, clientY: r.top + 10, button: 0, buttons: 1 })); return gd.ptr === null && gd.els.length === n; });
    check('بعد المغادرة: أحداث المؤشر على اللوحة تُتجاهل', idle);
    check('دورة 5: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  // ====================================================================
  // الدورة 6 — الإدارة والتوست: طرد/مغادرة/فوز إجباري/ريست/لاعب متأخر وغياب كل التوست
  // ====================================================================
  cycle = '[دورة6] ';
  if (RUN(6)) {
    const page = await boot(browser, DESK);
    await startRound(page, 'جمل');
    // مراقبة استدعاءات toast مباشرة على الدالتين الأصليتين
    await page.evaluate(() => { window.__toastCalls = 0; const o = window.toast.__orig, of = window.toastFast.__orig; window.toast.__orig = function () { window.__toastCalls++; return o.apply(this, arguments); }; window.toastFast.__orig = function () { window.__toastCalls++; return of.apply(this, arguments); }; });
    await say('m1', 'مرحبا', 'منى'); await say('m2', 'اهلا', 'نور'); await say('m3', 'هلا', 'خالد');
    await waitFor(page, () => drawParticipants.size === 3);
    // طرد لاعب من مودال الاداري (دالة الطرد المباشرة)
    await page.evaluate(() => drawKickParticipant('tiktok:m2'));
    await say('m2', 'جمل', 'نور'); await sleep(400);
    check('المطرود لا يعود ولا يفوز بتخمين صحيح في نفس الراوند', await page.evaluate(() => !drawParticipants.has('tiktok:m2') && drawGameStatus === 'active'));
    // أمر مغادرة وفوز إجباري عبر أوامر البث الحيّة
    await page.evaluate(() => drawLiveCommandHandlers.leave({ uniqueId: 'tiktok:m3' }));
    check('أمر «مغادرة» يزيل اللاعب', await page.evaluate(() => !drawParticipants.has('tiktok:m3') && !document.getElementById('drawtag-tiktok:m3')));
    // لاعب متأخر: زر موجود ويفتح نافذته بدون toast
    check('زر «لاعب متأخر» موجود بجانب «ريست»', await page.evaluate(() => !!document.querySelector('#pg-draw #lj-btn') && document.querySelector('#pg-draw .btn-reset').nextElementSibling.id === 'lj-btn'));
    await page.click('#lj-btn'); await sleep(250);
    const ljOpen = await page.evaluate(() => { const m = document.getElementById('lj-modal'); return m && !m.hidden; });
    await page.click('#lj-x'); await sleep(150);
    check('نافذة «لاعب متأخر» تفتح وتُغلق', ljOpen);
    // فوز إجباري
    await page.evaluate(() => drawLiveCommandHandlers.forceWinSelf({ uniqueId: 'zz', nickname: 'زياد' }));
    await waitFor(page, () => document.querySelector('.page.active').id === 'pg-draw-winner', null, 4000);
    check('الفوز الإجباري من المالك يفتح شاشة الفوز مرة واحدة', await page.evaluate(() => document.getElementById('draww-name').textContent === 'زياد' && window.__wins.length === 1));
    // الخروج للرئيسية خلال مهلة الفوز (600ms): لا شاشة فوز تظهر لاحقاً فوق الرئيسية ولا نقطة تُسجَّل
    await page.evaluate(() => goSetupDraw()); await sleep(150);
    await startRound(page, 'نمر'); await say('late_w', 'نمر', 'متأخر'); await sleep(150);
    const wBefore = await page.evaluate(() => window.__wins.length);
    await page.evaluate(() => goHome()); await sleep(1400);
    check('الخروج خلال مهلة الفوز: يُلغى مؤقّت الفوز (لا شاشة فوز فوق الرئيسية ولا تسجيل نقطة)', await page.evaluate(([w]) => document.querySelector('.page.active').id === 'pg-home' && window.__wins.length === w, [wBefore]), await page.evaluate(() => ({ p: document.querySelector('.page.active').id, w: window.__wins.length })));
    await page.evaluate(() => goSetupDraw()); await sleep(150);
    await startRound(page, 'سمكة');
    // ريست أثناء الراوند: نافذة تأكيد داخلية
    await pick(page, 'pen'); await stroke(page, [[100, 100], [300, 300]]);
    await page.click('#pg-draw .btn-reset'); await sleep(200);
    const rm = await page.evaluate(() => ({ open: !document.getElementById('gd-modal').hidden, active: drawGameStatus, n: gd.els.length }));
    await page.click('#gd-modal-no');
    check('ريست أثناء الراوند: نافذة تأكيد داخلية، الإلغاء يُبقي الراوند والرسم', rm.open && rm.active === 'active' && rm.n === 1 && (await nEls(page)) === 1 && !page._dialogs.length, rm);
    await page.click('#pg-draw .btn-reset'); await page.click('#gd-modal-yes'); await sleep(250);
    check('ريست مؤكَّد: يعود للانتظار ويمسح الرسم والمشاركين', await page.evaluate(() => drawGameStatus === 'waiting' && gd.els.length === 0 && drawParticipants.size === 0 && !document.getElementById('gd-lobby').hidden && document.getElementById('gd-work').hidden));
    await page.evaluate(() => startDrawRound()); await waitFor(page, () => gd.cssW > 0, null, 3000);
    check('إعادة اللعب بعد الريست: راوند جديد يعمل واللوحة نظيفة', await page.evaluate(() => drawGameStatus === 'active' && gd.els.length === 0 && gd.hist.length === 0));
    // غياب كل التوست في اللعبة
    await page.evaluate(() => { toast('اختبار'); toastFast('اختبار'); });
    await sleep(150);
    const tShows = await page.evaluate(() => window.__toastShows.filter((s) => /pg-(draw|setup-draw|draw-winner)/.test(s.page || '')));
    check('صفر toast أثناء كامل اللعبة (انضمام/طرد/متأخر/فوز/ريست) — حتى لو استُدعيت toast() صراحة', tShows.length === 0 && !page._dialogs.length, tShows);
    check('نظام التوست العام سليم: toast() تعمل خارج هذه اللعبة', await (async () => { await page.evaluate(() => goHome()); await sleep(150); await page.evaluate(() => toast('عام')); await sleep(200); return page.evaluate(() => document.getElementById('toast').classList.contains('show') && document.getElementById('toast').textContent === 'عام'); })());
    check('لا حاويات إشعار فارغة ظاهرة في صفحة اللعبة', await (async () => { await page.evaluate(() => { goSetupDraw(); }); await startRound(page, 'x'); return page.evaluate(() => [...document.querySelectorAll('#pg-draw [role=alert], #pg-draw .toast, #pg-draw [class*=toast], #pg-draw [aria-live]')].filter((e) => e.offsetParent && !(e.textContent || '').trim() && !/gd-guess-list|gd-status|gd-phase|gd-conn/.test(e.className + ' ' + e.id)).length === 0); })());
    check('دورة 6: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  // ====================================================================
  // الدورة 7 — الأداء: ضربة طويلة، كثرة العناصر، تحريك سلس
  // ====================================================================
  cycle = '[دورة7] ';
  if (RUN(7)) {
    const page = await boot(browser, DESK);
    await startRound(page);
    await pick(page, 'brush');
    const t0 = Date.now();
    const bx = await box(page); await page.mouse.move(bx.x + 50, bx.y + 300); await page.mouse.down();
    for (let i = 0; i < 400; i++) await page.mouse.move(bx.x + 50 + i * 1.8, bx.y + 300 + Math.sin(i / 8) * 150);
    await page.mouse.up(); await page.evaluate(() => gdFlush());
    const dt = Date.now() - t0;
    const pts = await page.evaluate(() => gd.els[0].pts.length);
    check('ضربة طويلة (400 حركة، فرشاة ناعمة) تُعالج بسلاسة (' + dt + 'ms)', pts > 150 && dt < 12000, { pts, dt });
    await page.evaluate(() => { for (let i = 0; i < 300; i++) gdCommit(gd.els.concat({ id: gd.nextId++, type: 'shape', kind: 'rect', mode: 'both', stroke: '#000', fill: '#fa0', sw: 2, alpha: 1, x: (i * 7) % 700, y: (i * 11) % 500, w: 60, h: 40 })); });
    const r0 = Date.now(); await page.evaluate(() => { gd.dirtyB = true; gdFlush(); }); const rt = Date.now() - r0;
    check('إعادة تصيير 300 عنصر في أقل من 400ms (' + rt + 'ms)', rt < 400, rt);
    await pick(page, 'select');
    const m0 = Date.now(); await drag(page, [100, 100], [300, 300], 20); const mt = Date.now() - m0;
    check('سحب/تحريك على لوحة مزدحمة يبقى متجاوباً (' + mt + 'ms)', mt < 6000, mt);
    check('دورة 7: لا أخطاء JS', page._errors.length === 0, page._errors);
    await page.context().close();
  }

  const pass = results.filter((r) => r.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  results.filter((r) => !r.ok).forEach((r) => console.log('  ✗ ' + r.name));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
