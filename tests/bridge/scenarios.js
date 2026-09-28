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
    state: typeof homeConnState !== 'undefined' ? homeConnState.tiktok : undefined,
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

// P1-6: 300 مشارك خلال 10ث + 200 رسالة/ث — زمن المعالجة والمهام الطويلة
async function load(browser, tag = 'main', n = 300, spanMs = 10000) {
  const page = await H.newPage(browser);
  await H.linkAccount(page, STREAMER);
  const g = games.find((x) => x.tag === tag);
  await H.launch(page, g);
  await page.evaluate(() => {
    window.__long = []; window.__mirrorWrites = 0;
    try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: 'longtask', buffered: false }); } catch (e) {}
    const o = window.liveRoundsMirror; if (o) window.liveRoundsMirror = function () { window.__mirrorWrites++; return o.apply(this, arguments); };
  });
  const heap0 = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
  const t0 = Date.now();
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: n, prefix: 'ld', text: g.kw, identity: { isFollowerOfAnchor: true }, followStatus: 1, perMs: Math.floor(spanMs / n) });
  let joined = 0;
  while (Date.now() - t0 < spanMs + 8000) {
    await sleep(500);
    joined = await page.evaluate((expr) => (0, eval)(expr).size, g.pmap);
    if (joined >= n) break;
  }
  const r = await page.evaluate(() => ({ longTasks: window.__long.length, maxLongTaskMs: Math.round(Math.max(0, ...window.__long)), mirrorWrites: window.__mirrorWrites, toasts: document.querySelectorAll('.toast, #toast').length }));
  const heap1 = await page.evaluate(() => performance.memory && performance.memory.usedJSHeapSize);
  const res = Object.assign({ tag, target: n, joined, elapsedMs: Date.now() - t0, heapDeltaMB: heap0 && heap1 ? +((heap1 - heap0) / 1048576).toFixed(1) : null }, r, { errors: page._errors });
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
  const run = { follow, listeners, outage, load, sockets };
  for (const k of Object.keys(run)) {
    if (which !== 'all' && which !== k) continue;
    try { out[k] = await run[k](browser); } catch (e) { out[k] = { crashed: e.message }; }
    console.error('done', k);
  }
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
})();
