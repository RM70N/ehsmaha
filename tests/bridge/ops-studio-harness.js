'use strict';
// تجهيز مشترك لاختبارات أقسام العمليات: الموقع الحقيقي + استوديو المالك الحقيقي + مخزن RTDB في الذاكرة (EhsOps) + Firebase مُحاكى.
const H = require('./harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(opts = {}) {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const vp = opts.viewport ? { viewport: opts.viewport } : undefined;
  const page = await H.newPage(browser, { query: '?debug=0', context: vp });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  const perr = []; page.on('pageerror', (e) => perr.push(e.message));
  await page.evaluate(() => {
    const fbx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'rtdb' ? undefined : function () { return {}; })) });
    window.__col = {}; fbx.onSnapshot = () => () => {}; fbx.collection = (db, name) => ({ name }); fbx.query = (c) => c; fbx.where = () => ({});
    fbx.getDocs = async (q) => ({ forEach(cb) { ((window.__col && window.__col[q && q.name]) || []).forEach((d, i) => cb({ id: 'd' + i, data: () => d })); }, size: ((window.__col && window.__col[q && q.name]) || []).length, empty: true });
    fbx.getDoc = async () => ({ exists: () => false, data: () => ({}) }); fbx.getDocFromServer = fbx.getDoc; fbx.setDoc = async () => {}; fbx.deleteDoc = async () => {}; fbx.doc = () => ({}); fbx.db = {};
    fbx.auth = { currentUser: { uid: 'owneruid0000000001', email: 'malshaifan1@gmail.com', getIdToken: async () => 'tok' } };
    window.__fbx = fbx; (0, eval)('fb = window.__fbx; currentUser = { uid: "owneruid0000000001", email: "malshaifan1@gmail.com" }; currentUsername = "owner"');
    window.__fb = fbx;
    EhsOps._useMemoryStore(); EhsOps._uidOverride = 'streameruid000001';
  });
  await page.evaluate(() => ownerOpenPanel());
  await page.waitForSelector('#owner-studio-frame', { state: 'attached', timeout: 5000 });
  const fr = () => page.frames().find((f) => /owner-studio\/index\.html/.test(f.url()));
  let f; for (let i = 0; i < 80 && !(f = fr()); i++) await sleep(100);
  await f.waitForFunction(() => window.Studio && Studio.cur && window.Ops, null, { timeout: 20000 });
  const ferr = []; f.page().on('pageerror', (e) => ferr.push(e.message));
  const go = async (id, wait = 500) => { await f.evaluate((id) => { location.hash = '#/' + id; }, id); await sleep(wait); if (process.env.SHOTS) { await sleep(700); await page.screenshot({ path: process.env.SHOTS + '/' + id + '.png' }); } };
  return { browser, page, f, go, perr, ferr, fe: (fn, a) => f.evaluate(fn, a), he: (fn, a) => page.evaluate(fn, a) };
}
function mkCheck() {
  const results = [];
  const check = (n, ok, d) => { results.push({ name: n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 700) : '')); };
  const done = () => { const f = results.filter((r) => !r.ok); console.log('\n' + (results.length - f.length) + '/' + results.length + ' passed'); return f.length; };
  return { check, done, results };
}
module.exports = { boot, mkCheck, sleep, H };
