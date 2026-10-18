'use strict';
// [نسخة «أكثر من منصة»] نفس all-games.js لكن الربط من زر «🌐 أكثر من منصة» (تيك توك + كيك معاً) والمشاركون موزّعون على المنصتين
//   بنفس الراوند: forms = تيك توك/كيك/تيك توك، والدفعة الكبيرة بالتناوب. يتطلب start-server-kick.js (الأساسي) + start-server.js (الاحتياطي).
// الـ29 لعبة بجلسة وحدة متتالية (كما يلعبها الستريمر): ربط مرة وحدة ← لكل لعبة:
// فتح ← انضمام بصيغ متعددة + 300 مشارك خلال 10ث ← بدء الراوند ← لعب ← رجوع للرئيسية.
// يقيس: المنضمين، سبب كل رفض (لوحة ?debug=1)، عدد المعالجات، أخطاء الصفحة/الكونسول،
// المهام الطويلة (>50ms)، والذاكرة بعد كل لعبة (GC عبر CDP).
//   node tests/bridge/all-games.js [n=300] [spanMs=10000] > results.json
const H = require('./harness');
const games = require('./games');
const N = Number(process.argv[2] || 300);
const SPAN = Number(process.argv[3] || 10000);
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// كل خطوة بحد زمني: لو علّقت الصفحة نسجّل أين بالضبط بدل ما يعلّق الاختبار كله
const STEP_MS = 20000;
function guard(promise, label, stuck) {
  let timer;
  const t = new Promise((_, rej) => { timer = setTimeout(() => { stuck.push(label); rej(new Error('STUCK: ' + label)); }, STEP_MS); });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}
async function linkMulti(page) {
  await page.evaluate((u) => {
    homeOpenQuickConnect(); homeQcToggleMulti(true);
    for (const p of ['tiktok', 'kick']) { const cb = document.getElementById('qc-multi-check-' + p); cb.checked = true; homeQcToggleCheck(p, true); document.getElementById('qc-multi-user-' + p).value = (p === 'kick' ? ' @' + u.toUpperCase() + ' ' : u); }
    homeStartQuickConnect();
  }, STREAMER);
  await page.waitForFunction(() => homeConnState.tiktok && homeConnState.kick && homeConnState.tiktok.state === 'connected' && homeConnState.kick.state === 'connected', null, { timeout: 90000 });
  await page.waitForTimeout(400);
  await page.evaluate((u) => { try { homeCloseQuickConnect(); } catch (e) {} localStorage.setItem(STREAMER_USER_STORAGE_KEY, u); }, STREAMER);
}
const PF = ['tiktok:', 'kick:', 'tiktok:'];
const FROM = Number(process.env.FROM || 1), TO = Number(process.env.TO || 99);

// سقوف اللاعبين قواعد لعب (ما تُغيَّر) — نضبطها لأعلى قيمة يسمح بها الإعداد نفسه
const CAPS = { cr: ['cr-maxracers', 30], mz: ['mz-maxplayers', 30], ev: ['ev-maxplayers', 40], rlgl: ['rlgl-max-players', 50], glz: ['glz-maxplayers', 40], 'volcanic-lands': ['volcanic-lands-maxplayers', 60], cannon: ['cannon-s-max', 100] };
const ROUND = { gw: 'gwStartRound', main: 'startRound', sniper: 'startSniperRound', hz: 'startHzRound', rou: 'startRouletteRound', bomb: 'startBombRound', box: 'startBoxRound', cr: 'startCrRound', mz: 'startMzRound', ev: 'startEvRound', ll: 'startLastLetterRound', wai: 'startWAIRound', ig: 'startIGRound', rw: 'startRWRound', pgs: 'startPGRound', lsc: 'startLSCRound', wr: 'startWRRound', draw: 'startDrawRound', cw: 'startCountryWarRound', cs: 'startCrownStealRound', chairs: 'chairsStartRoundClick', findball: 'findballStartRoundClick', tug: 'startTugRound', rlgl: 'startRlglRound', 'volcanic-lands': 'vlStart', cannon: 'cannonStartRound' };
const PMAP_VL = "({ size: (document.getElementById('volcanic-lands-lobby-grid') || { children: [] }).children.length })";

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  let page = await H.newPage(browser, { query: '?debug=1' });
  let cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize'); return m ? +(m.value / 1048576).toFixed(1) : null; };
  await page.evaluate(() => { window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask' }); } catch (e) {} });
  await linkMulti(page);
  const results = [];
  let i = 0;
  for (const g of games) {
    i++;
    if (i < FROM || i > TO) continue;
    const stuck = [];
    const pe = page.evaluate.bind(page);
    const evalG = (label, fn, arg) => guard(pe(fn, arg), label, stuck);
    try {
    const tag = g.tag, pmap = g.pmap || (tag === 'volcanic-lands' ? PMAP_VL : null);
    const r = { n: i, game: g.name, tag };
    const err0 = page._errors.length, cerr0 = page._consoleErrors.length;
    await evalG('step1', () => { try { goHome(); } catch (e) {} joinDiagLog.length = 0; window.__long.length = 0; });
    if (CAPS[tag]) g.inputs = Object.assign({}, g.inputs, { [CAPS[tag][0]]: String(CAPS[tag][1]) });
    const l = await guard(H.launch(page, g), 'launch', stuck);
    r.launchErr = l.err || null;
    r.listeners = l.listeners.filter((t) => t !== 'bridge-fate').length;
    r.statusAtJoin = l.status;
    r.dotAfterLaunch = await evalG('step2', () => { const d = document.querySelector('.page.active div.dot[id$="dot"]'); return d ? (d.className.replace('dot', '').trim() || 'on') : null; });
    const kw = g.kw != null ? g.kw : (g.kwExpr ? await evalG('step3', (e) => (0, eval)(e), g.kwExpr) : (tag === 'volcanic-lands' ? 'بركان' : 'مرحبا'));
    // draw: الانضمام يصير بأي تعليق أثناء الراوند (قاعدة اللعبة)
    if (tag === 'draw') { await evalG('step4', () => { try { startDrawRound(); } catch (e) {} }); await sleep(300); }
    // صيغ متعددة للكلمة
    const forms = [kw + '😍', '‏' + kw, kw + '!!'];
    for (let k = 0; k < forms.length; k++) await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: tag + '_form' + k, text: forms[k], platform: k === 1 ? 'kick' : 'tiktok', identity: { isFollowerOfAnchor: true } });
    await sleep(400);
    r.formsJoined = pmap ? await evalG('step5', ([e, tag, PF]) => { const m = (0, eval)(e); return [0, 1, 2].map((k) => (m.has ? m.has(PF[k] + tag + '_form' + k) : null)); }, [pmap, tag, PF]) : null;
    // 300 مشارك خلال 10ث
    const t0 = Date.now();
    await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, platform: 'alt', count: N, prefix: tag + '_p', text: kw, identity: { isFollowerOfAnchor: true }, perMs: Math.floor(SPAN / N) });
    let joined = 0;
    while (Date.now() - t0 < SPAN + 4000) { await sleep(500); if (pmap) joined = await evalG('step6', (e) => (0, eval)(e).size, pmap); }
    r.expected = Math.min(N + 3, CAPS[tag] ? CAPS[tag][1] : N + 3);
    r.joined = pmap ? joined : null;
    // كل من ما دخل لازم يكون له سبب مسجّل
    r.rejections = await evalG('step7', ([e, tag, n]) => {
      if (!e) return null;
      const m = (0, eval)(e);
      const missing = [];
      for (let k = 0; k < n; k++) { const uid = (k % 2 ? 'kick:' : 'tiktok:') + tag + '_p' + k; if (!(m.has ? m.has(uid) : true)) missing.push(uid); }
      const withReason = missing.filter((uid) => joinDiagLog.some((x) => x.uid === uid));
      const reasons = {};
      joinDiagLog.filter((x) => missing.includes(x.uid)).forEach((x) => { const key = x.reason + (x.detail ? ':' + x.detail.replace(/\d+\/\d+/, 'N/M').replace(/العدد \d+/, '') : ''); reasons[key] = (reasons[key] || 0) + 1; });
      return { notJoined: missing.length, withReason: withReason.length, reasons };
    }, [pmap, tag, N]);
    // بدء الراوند + لعب (رسائل عامة من المشاركين: أرقام/كلمات/الكلمة)
    if (ROUND[tag] && tag !== 'draw') { r.roundErr = await evalG('step8', async (fn) => { try { await window[fn](); return null; } catch (e) { return e.message; } }, ROUND[tag]); }
    await sleep(600);
    r.statusAfterStart = g.st ? await evalG('step9', (e) => { try { return (0, eval)(e); } catch (x) { return null; } }, g.st) : null;
    for (const [k, text] of [['1', '1'], ['2', '٢'], ['3', 'اختيار'], ['4', kw], ['5', 'قمر']]) await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: tag + '_p' + k, text, platform: Number(k) % 2 ? 'kick' : 'tiktok', identity: { isFollowerOfAnchor: true } });
    await sleep(1500);
    await evalG('step10', () => { try { goHome(); } catch (e) {} });
    await sleep(300);
    r.listenersAfterHome = await evalG('step11', () => Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate').length);
    r.pageErrors = page._errors.slice(err0);
    r.consoleErrors = page._consoleErrors.slice(cerr0);
    r.longTasksOver50ms = await evalG('step12', () => window.__long.filter((d) => d > 50).length);
    r.maxTaskMs = await evalG('step13', () => Math.round(Math.max(0, ...window.__long)));
    r.heapMB = await heap();
    r.stuck = stuck;
    results.push(r);
    console.error(i + '/' + games.length + ' ' + g.tag + ' joined=' + r.joined + '/' + r.expected + ' listeners=' + r.listeners + ' errors=' + r.pageErrors.length + ' heap=' + r.heapMB);
    } catch (e) {
      results.push({ n: i, game: g.name, tag: g.tag, stuck, error: e.message, pageErrors: page._errors.slice(-5) });
      console.error(i + '/' + games.length + ' ' + g.tag + ' STUCK ' + stuck.join(','));
      // الصفحة معلّقة: نكمل بصفحة جديدة حتى ما تضيع باقي الألعاب
      try { await page.context().close(); } catch (x) {}
      page = await H.newPage(browser, { query: '?debug=1' });
      cdp = await page.context().newCDPSession(page); await cdp.send('Performance.enable');
      await page.evaluate(() => { window.__long = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask' }); } catch (e) {} });
      await linkMulti(page);
      continue;
    }
  }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
  process.exit(0);
})();
