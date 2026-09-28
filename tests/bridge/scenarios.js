'use strict';
// سيناريوهات القياس (نفس السكربت يُشغَّل قبل وبعد الإصلاحات):
//   node tests/bridge/scenarios.js [follow|listeners|outage|load|sockets|all] > out.json
// يتطلب: tests/bridge/servers.sh start
const H = require('./harness');
const games = require('./games');

const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv[2] || 'all';
const out = {};

async function follow(browser) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const main = games.find((g) => g.tag === 'main');
  await H.launch(page, main);
  const cases = [
    ['real_follower', { isFollowerOfAnchor: true }, 0],
    ['mutual_follower', { isMutualFollowingWithAnchor: true }, 0],
    ['non_follower', { isFollowerOfAnchor: false }, 0],
    ['identity_missing', undefined, 0],
  ];
  const r = {};
  for (const [v, identity, fs] of cases) {
    await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: v, text: 'ادخل', identity, followStatus: fs });
  }
  await sleep(600);
  for (const [v] of cases) {
    r[v] = await page.evaluate((v) => ({ joined: [...participants.keys()].some((k) => k.endsWith(v)), pending: [...pendingFollowers.keys()].some((k) => k.endsWith(v)) }), v);
  }
  // إعادة التقييم: غير المتابع يسوي فولو ثم يكتب الكلمة مرة ثانية
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'non_follower', text: 'ادخل', identity: { isFollowerOfAnchor: true } });
  await sleep(400);
  r.non_follower_after_follow_retry = await page.evaluate(() => [...participants.keys()].some((k) => k.endsWith('non_follower')));
  // الشرط مطفي: غير المتابع المؤكد يدخل
  const hasGate = await page.evaluate(() => typeof followGateSetRequired === 'function');
  if (hasGate) {
    await page.evaluate(() => followGateSetRequired(false));
    await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'gate_off_nonfollower', text: 'ادخل', identity: { isFollowerOfAnchor: false } });
    await sleep(400);
    r.gate_off_nonfollower_joined = await page.evaluate(() => [...participants.keys()].some((k) => k.endsWith('gate_off_nonfollower')));
    await page.evaluate(() => followGateSetRequired(true));
    r.diagReasons = await page.evaluate(() => joinDiagLog.map((x) => x.uid.replace('tiktok:', '') + '=' + x.reason));
  }
  r.errors = page._errors;
  await page.context().close();
  return r;
}

// P0-3: كم معالج يبقى مسجلاً بعد تنقّل بين 10 ألعاب، وكم مرة تُعالَج رسالة واحدة
async function listeners(browser) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const seq = games.filter((g) => g.pmap && g.tag !== 'draw').slice(0, 10);
  const counts = [];
  for (const g of seq) {
    await page.evaluate(() => { try { goHome(); } catch (e) {} });
    await H.launch(page, g);
    counts.push(await page.evaluate(() => Object.keys(homeGameListeners).length));
  }
  // رسالة وحدة بعد 10 ألعاب: كم مرة استُدعي extractUser (مرة لكل معالج)
  const calls = await page.evaluate(async () => {
    let n = 0; const o = window.extractUser; window.extractUser = function () { n++; return o.apply(this, arguments); };
    window.__n = () => n; return true;
  });
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'probe', text: 'مرحبا' });
  await sleep(400);
  const extractCalls = await page.evaluate(() => window.__n());
  const res = { listenerCountAfterEachGame: counts, extractUserCallsForOneMessage: extractCalls, errors: page._errors };
  await page.context().close();
  return res;
}

// P0-2: انقطاع 60ث للسيرفرين أثناء الراوند ثم رجوعهما — هل يرجع الاتصال لحاله؟
async function outage(browser, downMs = 60000) {
  const { execSync } = require('child_process');
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const g = games.find((x) => x.tag === 'sniper');
  await H.launch(page, g);
  const t0 = Date.now();
  execSync(__dirname + '/servers.sh stop all');
  const timeline = [];
  const sample = async (label) => timeline.push(Object.assign({ t: Math.round((Date.now() - t0) / 1000), label }, await page.evaluate(() => ({
    has: homeHasActiveConnection(),
    slot: homeConnections.tiktok ? { attempts: homeConnections.tiktok.attempts, ws: !!homeConnections.tiktok.ws } : null,
    state: typeof homeConnState !== 'undefined' && homeConnState.tiktok ? homeConnState.tiktok.state : undefined,
    pillVisible: !!(document.getElementById('conn-status-pill') && document.getElementById('conn-status-pill').style.display !== 'none'),
    pill: (document.getElementById('conn-status-pill') || {}).textContent || null,
    dot: (document.querySelector('#pg-sniper .dot') || {}).className,
  }))));
  for (let t = 0; t < downMs; t += 10000) { await sleep(10000); await sample('down'); }
  execSync(__dirname + '/servers.sh start all');
  const upAt = Date.now();
  let recoveredAfterMs = null;
  for (let i = 0; i < 90; i++) {
    await sleep(1000);
    const delivered = (await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'after_' + i, text: g.kw })).delivered
      + (await H.ctl(H.FALLBACK, { cmd: 'chat', user: STREAMER, viewer: 'afterf_' + i, text: g.kw })).delivered;
    if (delivered) {
      await sleep(300);
      const joined = await page.evaluate((i) => [...sniperParticipants.keys()].some((k) => k.endsWith('after_' + i) || k.endsWith('afterf_' + i)), i);
      if (joined) { recoveredAfterMs = Date.now() - upAt; break; }
    }
  }
  await sample('end');
  const res = { downMs, recoveredAfterServerUpMs: recoveredAfterMs, timeline, errors: page._errors };
  await page.context().close();
  return res;
}

// P1-5: صيغ الكلمة (إيموجي/تشكيل/محارف مخفية) + اختيار رقم بأرقام عربية — عبر السيرفر الحقيقي
async function variants(browser) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const g = games.find((x) => x.tag === 'sniper');
  await H.launch(page, g);
  const forms = { emoji: 'ادخل😍', rlm: '\u200Fادخل\u200E', tashkeel: 'أُدْخُـل!!', spaced: '  ادخل ', extra_word: 'ابي ادخل' };
  for (const [v, text] of Object.entries(forms)) await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'form_' + v, text, identity: { isFollowerOfAnchor: true } });
  await sleep(500);
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'form_emoji', text: '٥', identity: { isFollowerOfAnchor: true } });
  await sleep(500);
  const r = await page.evaluate((forms) => {
    const o = {};
    Object.keys(forms).forEach((v) => { o[v] = sniperParticipants.has('tiktok:form_' + v); });
    const e = sniperParticipants.get('tiktok:form_emoji');
    o.arabicDigitCell = e ? e.cell : null;
    o.nearMissLogged = joinDiagLog.filter((x) => x.reason === 'keyword_near_miss').map((x) => x.detail);
    return o;
  }, forms);
  r.errors = page._errors;
  await page.context().close();
  return r;
}

// P0-2: اتصال ميت بصمت 70ث أثناء الراوند (السيرفر يرسل بس ولا شيء يوصل، بدون close) مع
// أحداث تنكتب وقت الانقطاع — هل يكتشفه المراقب ويعيد الاتصال، وهل تنعاد الأحداث اللي
// فاتت بدون تكرار؟ (setOffline بـPlaywright ما يقطع اتصال localhost القائم، فاستبدلناه.)
async function offline(browser, deadMs = 70000) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const g = games.find((x) => x.tag === 'sniper');
  await H.launch(page, g);
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'before_drop', text: g.kw, identity: { isFollowerOfAnchor: true } });
  await sleep(500);
  const t0 = Date.now();
  await H.ctl(H.PRIMARY, { cmd: 'blackhole', ms: deadMs });
  await sleep(2000);
  for (let i = 0; i < 3; i++) await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'missed_' + i, text: g.kw, identity: { isFollowerOfAnchor: true } });
  const samples = [];
  let detectedAt = null;
  while (Date.now() - t0 < deadMs) {
    await sleep(5000);
    const smp = await page.evaluate(() => ({ state: typeof homeConnState !== 'undefined' && homeConnState.tiktok ? homeConnState.tiktok.state : null, has: homeHasActiveConnection(), dot: (document.getElementById('sniper-dot') || {}).className, pillVisible: !!(document.getElementById('conn-status-pill') && document.getElementById('conn-status-pill').style.display !== 'none'), pill: (document.getElementById('conn-status-pill') || {}).textContent || null }));
    smp.t = Math.round((Date.now() - t0) / 1000);
    samples.push(smp);
    if (detectedAt == null && smp.state && smp.state !== 'connected') detectedAt = smp.t;
  }
  const upAt = Date.now();
  let back = null;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const st = await page.evaluate(() => (typeof homeConnState !== 'undefined' && homeConnState.tiktok ? homeConnState.tiktok.state : null));
    if (st === 'connected') { back = Date.now() - upAt; break; }
  }
  await sleep(1000);
  const joined = await page.evaluate(() => [...sniperParticipants.keys()].map((k) => k.replace('tiktok:', '')));
  const res = { deadMs, detectedDeadAfterSec: detectedAt, reconnectedAfterSilenceEndsMs: back, missedReplayed: [0, 1, 2].map((i) => joined.includes('missed_' + i)), participants: joined, duplicatesInChat: await page.evaluate(() => { const t = [...document.querySelectorAll('#pg-sniper .chat-item')].map((x) => x.textContent); return t.length - new Set(t).size; }), samples, dotAfter: await page.evaluate(() => (document.getElementById('sniper-dot') || {}).className), pillVisibleAfter: await page.evaluate(() => !!(document.getElementById('conn-status-pill') && document.getElementById('conn-status-pill').style.display !== 'none')), errors: page._errors };
  await page.context().close();
  return res;
}

// P1-6: 300 مشارك خلال 10ث مع ضجيج شات بمعدل إجمالي ~200 رسالة/ث — زمن المعالجة،
// المهام الطويلة، كتابات Firestore (liveRoundsMirror)، والذاكرة.
async function load(browser, tag = 'main', n = 300, spanMs = 10000, noisePerSec = 170) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const g = games.find((x) => x.tag === tag);
  await H.launch(page, g);
  await page.evaluate(() => {
    window.__long = []; window.__writes = 0; window.__disp = [];
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false }); } catch (e) {}
    // الكتابة الفعلية: liveRoundsMirrorWrite لو موجودة (بعد)، وإلا كل استدعاء liveRoundsMirror كان كتابة (قبل)
    const wn = typeof window.liveRoundsMirrorWrite === 'function' ? 'liveRoundsMirrorWrite' : 'liveRoundsMirror';
    const o = window[wn]; window[wn] = function () { window.__writes++; return o.apply(this, arguments); };
    // زمن معالجة كل حدث داخل معالج اللعبة المسجّل (platformConnect ماسك مرجع الناقل نفسه)
    Object.keys(homeGameListeners).forEach((t) => { const h = homeGameListeners[t]; homeGameListeners[t] = function () { const s = performance.now(); const r = h.apply(this, arguments); window.__disp.push(performance.now() - s); return r; }; });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heapNow = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const m = (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'JSHeapUsedSize'); return m ? m.value : null; };
  const heap0 = await heapNow();
  const t0 = Date.now();
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: n, prefix: 'ld', text: g.kw, identity: { isFollowerOfAnchor: true }, followStatus: 1, perMs: Math.floor(spanMs / n) });
  if (noisePerSec) await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: Math.floor(noisePerSec * spanMs / 1000), prefix: 'noise', text: 'هههههه والله حلو', perMs: Math.max(1, Math.floor(1000 / noisePerSec)) });
  let joined = 0, allJoinedMs = null;
  while (Date.now() - t0 < spanMs + 8000) {
    await sleep(250);
    joined = await page.evaluate((expr) => (0, eval)(expr).size, g.pmap);
    if (joined >= n) { allJoinedMs = Date.now() - t0; break; }
  }
  await sleep(3000); // الكتابة الأخيرة المؤجلة
  const r = await page.evaluate(() => {
    const d = window.__disp.slice().sort((a, b) => a - b);
    const pct = (q) => d.length ? +d[Math.min(d.length - 1, Math.floor(q * d.length))].toFixed(2) : null;
    return { eventsProcessed: d.length, dispatchMsP50: pct(0.5), dispatchMsP99: pct(0.99), dispatchMsMax: d.length ? +d[d.length - 1].toFixed(1) : null, longTasks: window.__long.length, maxLongTaskMs: Math.round(Math.max(0, ...window.__long)), firestoreWrites: window.__writes, lastToast: (document.getElementById('toast') || {}).textContent };
  });
  const heap1 = await heapNow();
  const res = Object.assign({ tag, target: n, joined, allJoinedWithinMs: allJoinedMs, heapDeltaMB: heap0 && heap1 ? +((heap1 - heap0) / 1048576).toFixed(1) : null }, r, { errors: page._errors });
  await page.context().close();
  return res;
}

// P0-4: كم اتصال WebSocket مفتوح لنفس الحساب بعد الربط من المودال
async function sockets(browser) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  await sleep(1500);
  const open = page._wsLog.filter((x) => x.open).map((x) => x.host + x.search);
  const st = await H.stats(H.PRIMARY);
  const res = { openClientSocketsForAccount: open.length, open, upstreamConnectionsOnServer: st.upstreamLive, connectCalls: st.connectCalls };
  await page.context().close();
  return res;
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const run = { follow, listeners, outage, offline, variants, load, sockets };
  for (const k of Object.keys(run)) {
    if (which !== 'all' && which !== k) continue;
    try { out[k] = await run[k](browser); } catch (e) { out[k] = { crashed: e.message }; }
    console.error('done', k);
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
})();
