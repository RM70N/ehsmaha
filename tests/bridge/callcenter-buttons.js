'use strict';
// «انصب علي» (مركز الاتصالات 3D) كلعبة فردية بالموقع: البطاقة ← الصفحة ← الإطار ← سيرفرا Render (/cc/v1 + Gemini) — من المتصفح الحقيقي.
// يحتاج: محاكي Gemini + السيرفران (الأساسي 18081 والاحتياطي 18082) بنفس المفتاح الوهمي:
//   MOCK_GEMINI_PORT=19500 node tests/bridge/mock-gemini.js &
//   GEMINI_API_BASE=http://127.0.0.1:19500 GEMINI_API_KEY=AIzaSyDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD444 PORT=18081 CTL_PORT=19081 node tests/bridge/start-server.js &
//   GEMINI_API_BASE=http://127.0.0.1:19500 GEMINI_API_KEY=AIzaSyDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD444 PORT=18082 CTL_PORT=19082 node tests/bridge/start-server.js &
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/callcenter.test.js   (SHOTS=/dir للقطات)
const H = require('./harness');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const MOCK = 'http://127.0.0.1:' + (process.env.MOCK_GEMINI_PORT || 19500);
const PORTS = { 'ehsmaha-wbkn.onrender.com': 18081, 'ehsmaha.onrender.com': 18082 };
const mockCtl = (mode) => fetch(MOCK + '/__mode', { method: 'POST', body: JSON.stringify({ mode }) });
const mockCalls = () => fetch(MOCK + '/__calls').then((r) => r.json());

async function newGamePage(browser, opts) {
  opts = opts || {};
  const page = await H.newPage(browser, { query: '?debug=0' });
  const hits = []; page._cc = hits; page._ccMode = Object.assign({ down: {}, noChat: {} }, opts.mode || {});
  await page.route(/onrender\.com\/cc\/v1\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), port = PORTS[u.host];
    hits.push(u.host + u.pathname);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (page._ccMode.down[u.host]) return route.abort('connectionrefused');
    if (page._ccMode.noChat[u.host] && /config$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, stage: 'public', caps: { chat: false, stt: false, tts: false } }) });
    try {
      const r = await fetch('http://127.0.0.1:' + port + u.pathname, { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined });
      const buf = Buffer.from(await r.arrayBuffer()); const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      await route.fulfill({ status: r.status, headers: h, body: buf });
    } catch (e) { await route.abort('connectionrefused'); }
  });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  await page.setViewportSize({ width: 1280, height: 800 });
  return page;
}
const frameOf = (page) => page.frames().find((f) => /callcenter3d\.html/.test(f.url()));
async function waitPhase(page, phase, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { const f = frameOf(page); const ph = f && await f.evaluate(() => window.CC && CC.state && CC.state.phase).catch(() => null); if (ph === phase) return true; await sleep(300); } return false; }
async function waitFrame(page, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const f = frameOf(page); if (f) { const v = await f.evaluate(fn, arg).catch(() => null); if (v) return v; } await sleep(200); } return null; }


const SC = process.env.SHOTS || '/tmp/claude-0/-home-user-ehsmaha/0eda4367-904b-5886-afae-e6c80c541c1a/scratchpad/shots';
fs.mkdirSync(SC, { recursive: true });
(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  await mockCtl('ok');
  const page = await newGamePage(browser);
  const errs = []; page.on('pageerror', (e) => errs.push('page:' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 200)); });
  await page.evaluate(() => goCallCenter());
  await waitPhase(page, 'menu', 90000);
  const F = () => frameOf(page);
  await F().evaluate(() => document.getElementById('mn-play').click());
  await waitPhase(page, 'intro', 15000);
  await F().evaluate(() => document.getElementById('di-go').click());
  await waitPhase(page, 'shift', 20000);
  await F().evaluate(() => { CC.game.sitDown(); });
  await waitFrame(page, () => CC.os.on === true, null, 20000);
  await sleep(800);
  await F().evaluate(() => { CC.calls.ring(); });
  await waitFrame(page, () => { if (CC.calls.state === 'ringing') CC.calls.answer(); return CC.calls.state === 'active'; }, null, 15000);
  await sleep(1500);
  const ids = await F().evaluate(() => Object.keys(CC.apps));
  console.log('apps:', ids.join(','));
  const report = [];
  // يصور حالة النافذة: HTML + عدد الخانات + مؤشرات الحالة
  const closeModals = () => F().evaluate(() => { try { CC.ui.closeModal(); } catch (e) {} document.querySelectorAll('.cc-modal').forEach((m) => m.remove()); });
  const snap = () => F().evaluate(() => { const o = CC.os; return JSON.stringify({ w: Object.keys(o.wins).map((k) => k + (o.wins[k].min ? '-min' : '') + (o.wins[k].max ? '-max' : '')), html: Array.from(document.querySelectorAll('.os-win')).map((e) => e.innerHTML.length + ':' + e.className).join('|'), body: document.getElementById('os-desk') ? document.getElementById('os-desk').innerText.length : 0, ov: document.querySelectorAll('.cc-modal,.cc-overlay,.os-popup,[role=dialog]').length, st: CC.state && CC.state.phase, wallet: CC.state && CC.state.snap && CC.state.snap.profile && CC.state.snap.profile.wallet, ac: document.activeElement && document.activeElement.tagName + document.activeElement.id, calls: CC.calls.state }); });
  for (const id of ids) {
    await closeModals();
    await F().evaluate((i) => { Object.keys(CC.os.wins).forEach((k) => CC.os.close(k)); CC.os.open(i, { noDock: true }); }, id).catch((e) => report.push({ app: id, fatal: String(e).slice(0, 120) }));
    await sleep(400);
    const opened = await F().evaluate((i) => !!CC.os.wins[i], id);
    if (!opened) { report.push({ app: id, opened: false, why: await F().evaluate((i) => JSON.stringify(CC.os.appState(i)), id) }); continue; }
    // أزرار شريط العنوان بنقر فعلي بالفأرة
    for (const cls of ['mx', 'mx', 'mn', 'x']) {
      const box = await F().evaluate((a) => { const w = CC.os.wins[a.id]; if (!w) return null; w.el.hidden = false; w.min = false; const b = w.el.querySelector('.' + a.cls); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }, { id, cls });
      if (!box) { report.push({ app: id, btn: 'titlebar.' + cls, res: 'MISSING' }); continue; }
      const fr = await (await page.$('#callcenter-frame')).boundingBox();
      const before = await snap();
      await page.mouse.click(fr.x + box.x, fr.y + box.y); await sleep(250);
      const after = await snap();
      report.push({ app: id, btn: 'titlebar.' + cls, res: before !== after ? 'ok' : 'NO-EFFECT' }); await closeModals();
      if (cls === 'x') await F().evaluate((i) => CC.os.open(i, { noDock: true }), id);
      await sleep(200);
    }
    await F().evaluate((i) => { CC.os.wins[i] && CC.os.close(i); CC.os.open(i, { noDock: true }); }, id); await sleep(300);
    // كل أزرار داخل النافذة (نقر فعلي)
    const n = await F().evaluate((i) => CC.os.wins[i].el.querySelectorAll('.os-wb button, .os-wb [role=tab], .os-wb summary, .os-wb a[href], .os-wb [data-t], .os-wb label.opt').length, id);
    for (let k = 0; k < n; k++) {
      const info = await F().evaluate((a) => { const w = CC.os.wins[a.id]; if (!w) return null; const els = w.el.querySelectorAll('.os-wb button, .os-wb [role=tab], .os-wb summary, .os-wb a[href], .os-wb [data-t], .os-wb label.opt'); const e = els[a.k]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return { label: (e.getAttribute('aria-label') || e.innerText || e.id || e.className).toString().trim().slice(0, 30), x: r.x + r.width / 2, y: r.y + r.height / 2, vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden', dis: !!e.disabled || e.getAttribute('aria-disabled') === 'true' }; }, { id, k });
      if (!info || !info.vis) continue;
      if (info.dis) { report.push({ app: id, btn: info.label, res: 'disabled(skip)' }); continue; }
      const fr = await (await page.$('#callcenter-frame')).boundingBox();
      const before = await snap();
      const hit = await F().evaluate((p) => { const e = document.elementFromPoint(p.x, p.y); return e ? (e.closest('button,[role=tab],summary,a,label') ? e.closest('button,[role=tab],summary,a,label').outerHTML.slice(0, 60) : e.tagName + '.' + e.className) : null; }, { x: info.x, y: info.y });
      await page.mouse.click(fr.x + info.x, fr.y + info.y); await sleep(220);
      const after = await snap();
      report.push({ app: id, btn: info.label, res: before !== after ? 'ok' : 'NO-EFFECT', hit }); console.log('  ' + id + ' / ' + info.label + ' -> ' + (before !== after ? 'ok' : 'NO-EFFECT'));
      await closeModals();
      const oso = await F().evaluate(() => ({ on: CC.os.on, mode: CC.player.mode, phase: CC.state.phase, calls: CC.calls.state }));
      if (!oso.on) { console.log('  !! OS CLOSED after ' + id + ' / ' + info.label + ' ' + JSON.stringify(oso)); report.push({ app: id, btn: info.label, res: 'CLOSED-OS', oso }); await F().evaluate(() => { try { CC.game.sitDown(); } catch (e) {} }); await waitFrame(page, () => CC.os.on === true, null, 15000); await sleep(500); await F().evaluate((i) => CC.os.open(i, { noDock: true }), id); }
      const still = await F().evaluate((i) => !!CC.os.wins[i], id);
      if (!still) { await F().evaluate((i) => CC.os.open(i, { noDock: true }), id); await sleep(250); }
    }
    await page.screenshot({ path: SC + '/app-' + id + '.png' });
  }
  fs.writeFileSync(SC + '/report.json', JSON.stringify({ report, errs }, null, 1));
  const bad = report.filter((r) => r.res === 'NO-EFFECT' || r.res === 'MISSING' || r.opened === false || r.fatal);
  console.log('total', report.length, 'suspect', bad.length);
  bad.forEach((b) => console.log(JSON.stringify(b)));
  console.log('errors:', JSON.stringify([...new Set(errs)].slice(0, 15)));
  await browser.close();
  process.exit(0);
})();
