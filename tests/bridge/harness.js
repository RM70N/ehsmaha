'use strict';
// أدوات Playwright المشتركة: يوجّه wss://ehsmaha-wbkn.onrender.com/ws (أساسي) و
// wss://ehsmaha.onrender.com/ws (احتياطي) لسيرفرَي الجسر المحليين الحقيقيين
// (tests/bridge/servers.sh)، ونفس الشي لـ/healthz. الموقع نفسه يُقدَّم من ملف
// index.html بالمستودع عبر سيرفر ثابت محلي.
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || (() => { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })());

const ROOT = path.join(__dirname, '../..');
const HOSTS = { 'ehsmaha-wbkn.onrender.com': { ws: 18081, ctl: 19081 }, 'ehsmaha.onrender.com': { ws: 18082, ctl: 19082 } };
const PRIMARY = HOSTS['ehsmaha-wbkn.onrender.com'];
const FALLBACK = HOSTS['ehsmaha.onrender.com'];

let staticServer = null;
function serveSite(port = 8765, file = 'index.html') {
  if (staticServer) return Promise.resolve(staticServer);
  return new Promise((resolve) => {
    staticServer = http.createServer((req, res) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      let f = path.join(ROOT, u === '/' ? file : u);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, file);
      res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    }).listen(port, () => resolve(staticServer));
  });
}

async function ctl(target, body) {
  const port = (target && target.ctl) || target;
  const r = await fetch('http://127.0.0.1:' + port + '/ctl', { method: 'POST', body: JSON.stringify(body) });
  return r.json();
}
async function stats(target) {
  const r = await fetch('http://127.0.0.1:' + ((target && target.ctl) || target) + '/stats');
  return r.json();
}

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page._errors = [];
  page._wsLog = [];
  page._consoleErrors = [];
  page.on('pageerror', (e) => page._errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // موارد خارجية محجوبة ببيئة الاختبار (Firebase/خطوط/CDN) — مو أخطاء بالكود
    if (/Failed to load resource|ERR_TUNNEL|ERR_CERT|net::|firebase|gstatic|googleapis/i.test(t)) return;
    page._consoleErrors.push(t.slice(0, 300));
  });
  // WebSocket حقيقي لسيرفر الجسر المحلي: نعيد كتابة الرابط فقط (routeWebSocket.connectToServer
  // ما يوصل للـlocalhost في بيئة الاختبار المحجوبة، فاستبدلناه بإعادة كتابة شفافة).
  await page.exposeBinding('__wsLogPush', (src, rec) => { page._wsLog.push(rec); });
  await page.exposeBinding('__wsLogClose', (src, id) => { const r = page._wsLog.find((x) => x.id === id); if (r) r.open = false; });
  await page.addInitScript((hosts) => {
    const Real = window.WebSocket; let seq = 0;
    function W(url, protocols) {
      let u; try { u = new URL(String(url)); } catch (e) { return new Real(url, protocols); }
      const t = hosts[u.host];
      if (!t || !/\/ws$/.test(u.pathname)) return new Real(url, protocols);
      const id = ++seq;
      const s = new Real('ws://localhost:' + t.ws + '/ws' + u.search, protocols);
      try { window.__wsLogPush({ id, host: u.host, search: u.search, open: true, at: Date.now() }); } catch (e) {}
      s.addEventListener('close', () => { try { window.__wsLogClose(id); } catch (e) {} });
      return s;
    }
    W.prototype = Real.prototype; W.CONNECTING = 0; W.OPEN = 1; W.CLOSING = 2; W.CLOSED = 3;
    window.WebSocket = W;
  }, HOSTS);
  await page.route(/onrender\.com\/healthz/, async (route) => {
    const u = new URL(route.request().url());
    const target = HOSTS[u.host];
    try {
      const r = await fetch('http://127.0.0.1:' + target.ws + '/healthz', { signal: AbortSignal.timeout(3000) });
      await route.fulfill({ status: r.status, body: await r.text() });
    } catch (e) { await route.abort('connectionrefused'); }
  });
  if (opts.init) await page.addInitScript(opts.init);
  await page.goto('http://localhost:8765/' + (opts.query || ''), { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(opts.settleMs || 2000);
  return page;
}

// ربط الحساب من المودال بالضبط كما يفعل الستريمر، ثم انتظار اتصال الناقل
async function linkAccount(page, user, waitMs = 8000) {
  await page.evaluate((u) => {
    tiktokConnectModalOpen();
    document.getElementById('tiktok-connect-username').value = u;
    tiktokConnectModalStart();
  }, user);
  await page.waitForFunction(() => typeof homeHasActiveConnection === 'function' && homeHasActiveConnection(), null, { timeout: waitMs });
  await page.waitForTimeout(300);
  await page.evaluate(() => tiktokConnectModalClose());
}

async function launch(page, g) {
  return page.evaluate(async (g) => {
    const r = {};
    try {
      if (g.pre) (0, eval)(g.pre);
      for (const [id, v] of Object.entries(g.inputs || {})) { const el = document.getElementById(id); if (el) el.value = v; }
      await window[g.launch]();
    } catch (e) { r.err = e.message; }
    await new Promise((res) => setTimeout(res, 250));
    r.listeners = Object.keys(homeGameListeners);
    r.status = g.st ? (0, eval)(g.st) : null;
    return r;
  }, g);
}

async function launchBrowser() { return chromium.launch({ args: ['--no-proxy-server'] }); }

module.exports = { serveSite, ctl, stats, newPage, linkAccount, launch, launchBrowser, PRIMARY, FALLBACK, ROOT };
