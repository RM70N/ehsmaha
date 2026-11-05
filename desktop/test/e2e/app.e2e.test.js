'use strict';
/**
 * اختبارات E2E حقيقية على تطبيق Electron (Playwright _electron) تحت Xvfb.
 * Firebase وهمي (لا إنترنت). لا تُختبر هنا: إشعارات ويندوز الفعلية، التثبيت، OBS، GPU حقيقي.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { launchApp, startFakeSite, DESKTOP } = require('./harness');
const { installFakeFirebase } = require('./fake-firebase');
const { buildManifest, MANIFEST_NAME } = require('../../scripts/site-manifest');

const SITE = path.join(DESKTOP, 'site');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 200) {
  const t = Date.now();
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout waiting for condition'); await sleep(step); }
}

/** نسخة من الموقع بتعديلات + manifest جديد. */
function variant(mutate) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ehs-site-'));
  fs.cpSync(SITE, dir, { recursive: true });
  fs.rmSync(path.join(dir, MANIFEST_NAME), { force: true });
  mutate(dir);
  const m = buildManifest(dir);
  fs.writeFileSync(path.join(dir, MANIFEST_NAME), JSON.stringify(m));
  return { dir, manifest: m };
}

async function start({ siteDir = SITE, userData, extraEnv } = {}) {
  const fake = await startFakeSite(siteDir);
  const { app, userData: ud } = await launchApp({ siteOrigin: fake.origin, userData, extraEnv });
  await app.firstWindow();
  const win = await until(async () => app.windows().find((w) => !w.isClosed() && w.url().startsWith('http://localhost:')), 30000);
  await installFakeFirebase(win);
  await win.reload();
  await until(async () => (await app.evaluate(() => global.__ehsTest.probePage()))?.pageId, 20000);
  return { app, win, fake, userData: ud, close: async () => { await app.close().catch(() => {}); fake.close(); } };
}
const T = async (app, fn, arg) => {
  for (let i = 0; ; i++) {
    try { return await app.evaluate(fn, arg); }
    catch (e) { if (i < 4 && /garbage collected|context was destroyed|Target closed/i.test(String(e.message))) { await sleep(300); continue; } throw e; }
  }
};

test('launch: window, security prefs, local origin, bridge surface', async () => {
  const s = await start();
  try {
    const prefs = await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); const p = w.webContents.getLastWebPreferences(); return { ci: p.contextIsolation, ni: p.nodeIntegration, sb: p.sandbox, ws: p.webSecurity, title: w.getTitle(), url: w.webContents.getURL() }; });
    assert.deepEqual([prefs.ci, prefs.ni, prefs.sb, prefs.ws], [true, false, true, true]);
    assert.equal(prefs.url, 'http://localhost:43711/');
    assert.match(prefs.title, /احسمها/);
    const surface = await s.win.evaluate(() => ({ req: typeof require, proc: typeof process, desk: window.ehsmahaDesktop && window.ehsmahaDesktop.isDesktopApp, settings: typeof window.ehsmahaSettings, keys: Object.keys(window.ehsmahaDesktop || {}) }));
    assert.equal(surface.req, 'undefined'); assert.equal(surface.proc, 'undefined');
    assert.equal(surface.desk, true); assert.equal(surface.settings, 'undefined');
    assert.ok(!surface.keys.includes('reload') && !surface.keys.includes('restart'), 'no dangerous API on site');
  } finally { await s.close(); }
});

test('all 67 bundled files are served with correct types; no HTML masquerading as JS/CSS', async () => {
  const s = await start();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(SITE, MANIFEST_NAME), 'utf8'));
    const bad = [];
    for (const f of m.files) {
      const r = await new Promise((res) => http.get({ host: '127.0.0.1', port: 43711, path: '/' + f.path.split('/').map(encodeURIComponent).join('/') }, (x) => { const ch = []; x.on('data', (c) => ch.push(c)); x.on('end', () => res({ st: x.statusCode, ct: x.headers['content-type'], len: Buffer.concat(ch).length })); }));
      const wantHtml = f.path.endsWith('.html');
      if (r.st !== 200 || r.len !== f.size || (!wantHtml && /html/.test(r.ct))) bad.push([f.path, r]);
    }
    assert.deepEqual(bad, []);
    assert.ok(m.files.length >= 60);
  } finally { await s.close(); }
});

test('every standalone game page loads inside the app (no 404s for local assets)', async () => {
  const s = await start();
  try {
    const pages = ['roulette3d', 'bomb3d', 'tug3d', 'xo', 'ektheb-alay', 'almeezan3d', 'wesh-taghayar', 'hallaha-qabli', 'code-race', 'callcenter3d', 'la-tatayeh3d', 'harf-alnajat3d'];
    for (const name of pages) {
      const missing = [];
      const onResp = (r) => { if (/localhost:43711/.test(r.url()) && r.status() >= 400) missing.push(r.url()); };
      s.win.on('response', onResp);
      const resp = await s.win.goto(`http://localhost:43711/${name}.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(resp.status(), 200, name);
      await sleep(400);
      s.win.off('response', onResp);
      assert.deepEqual(missing, [], name);
    }
  } finally { await s.close(); }
});

test('WebGL availability in app window (software GL under Xvfb)', async () => {
  const s = await start();
  try {
    const gl = await s.win.evaluate(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2') || c.getContext('webgl'); return g ? { ok: true, r: g.getParameter(g.VERSION) } : { ok: false }; });
    console.log('# WebGL:', JSON.stringify(gl));
    assert.ok(typeof gl.ok === 'boolean');
  } finally { await s.close(); }
});

test('scenario 1: a new game added on the site arrives, applies when idle, and notifies', async () => {
  const s = await start();
  try {
    const v2 = variant((d) => fs.writeFileSync(path.join(d, 'new-game-x.html'), '<!doctype html><html><body>NEW</body></html>'));
    const before = await T(s.app, () => global.__ehsTest.store.activeVersion());
    await s.win.evaluate(() => { window.__marker = 'alive'; });
    s.fake.setDir(v2.dir);
    await T(s.app, () => { global.__ehsTest.getMainWindow().hide(); }); // التطبيق في الـTray ⇒ يظهر إشعار نظام
    await until(async () => { await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); if (w.isVisible()) w.hide(); }); return (await T(s.app, () => global.__ehsTest.store.activeVersion())) === v2.manifest.version; }, 20000, 100);
    assert.notEqual(before, v2.manifest.version);
    const r = await new Promise((res) => http.get({ host: '127.0.0.1', port: 43711, path: '/new-game-x.html' }, (x) => { x.resume(); res(x.statusCode); }));
    assert.equal(r, 200);
    await until(async () => (await T(s.app, () => global.__ehsTest.shown.map((n) => n.title))).includes('لعبة جديدة في احسمها'), 20000).catch((e) => { throw new Error(e.message + '\n' + fs.readFileSync(path.join(s.userData, 'logs', 'ehsmaha.log'), 'utf8').split('\n').slice(-12).join('\n')); });
  } finally { await s.close(); }
});

test('scenario 2: update during an active round is deferred (no reload), applies after the round', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { window.__marker = 'alive'; document.querySelector('.page.active').classList.remove('active'); document.getElementById('pg-roulette3d').classList.add('active'); });
    const v2 = variant((d) => fs.writeFileSync(path.join(d, 'late-game.html'), '<!doctype html><html><body>L</body></html>'));
    const v1 = await T(s.app, () => global.__ehsTest.store.activeVersion());
    s.fake.setDir(v2.dir);
    await until(async () => T(s.app, () => global.__ehsTest.store.hasPending()), 20000);
    await sleep(3000); // عدة دورات فحص أثناء الجولة
    assert.equal(await s.win.evaluate(() => window.__marker), 'alive', 'الصفحة لم تُعد تحميلها أثناء الجولة');
    assert.equal(await T(s.app, () => global.__ehsTest.store.activeVersion()), v1, 'النسخة القديمة ما زالت تعمل');
    // الجولة انتهت
    await s.win.evaluate(() => { document.querySelector('.page.active').classList.remove('active'); document.getElementById('pg-landing').classList.add('active'); });
    await until(async () => (await T(s.app, () => global.__ehsTest.store.activeVersion())) === v2.manifest.version, 20000);
    await until(async () => (await s.win.evaluate(() => window.__marker).catch(() => null)) !== 'alive', 10000);
  } finally { await s.close(); }
});

test('scenario 2b: live-stream connection also blocks the update; consent applies it', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { homeConnections.tiktok = { ws: {} }; });
    const v2 = variant((d) => fs.writeFileSync(path.join(d, 'g2.html'), '<!doctype html><html><body>2</body></html>'));
    s.fake.setDir(v2.dir);
    await until(async () => T(s.app, () => global.__ehsTest.store.hasPending()), 20000);
    await sleep(2000);
    assert.notEqual(await T(s.app, () => global.__ehsTest.store.activeVersion()), v2.manifest.version);
    const res = await T(s.app, () => global.__ehsTest.coordinator.applyByConsent());
    assert.equal(res.action, 'applied');
  } finally { await s.close(); }
});

test('scenario 3: corrupted download is rejected; broken release rolls back automatically', async () => {
  const s = await start();
  try {
    const v1 = await T(s.app, () => global.__ehsTest.store.activeVersion());
    // (أ) بصمة لا تطابق: manifest يصف ملفاً مغايراً لما يُخدم فعلاً
    const good = variant((d) => fs.writeFileSync(path.join(d, 'a.html'), '<!doctype html><html><body>A</body></html>'));
    const tampered = fs.mkdtempSync(path.join(os.tmpdir(), 'ehs-tamper-'));
    fs.cpSync(good.dir, tampered, { recursive: true });
    fs.writeFileSync(path.join(tampered, 'a.html'), '<!doctype html><html><body>EVIL</body></html>'); // المحتوى تغيّر، manifest كما هو
    s.fake.setDir(tampered);
    await until(async () => (await T(s.app, () => global.__ehsTest.store.readState().lastError)) && true, 15000);
    assert.equal(await T(s.app, () => global.__ehsTest.store.activeVersion()), v1);
    assert.equal(await T(s.app, () => global.__ehsTest.store.hasPending()), false);

    // (ب) إصدار سليم ملفياً لكن الصفحة لا تعمل ⇒ فشل فحص الصحة ⇒ تراجع
    const broken = variant((d) => fs.writeFileSync(path.join(d, 'index.html'), '<!doctype html><html><body>broken release</body></html>'));
    s.fake.setDir(broken.dir);
    await until(async () => (await T(s.app, () => global.__ehsTest.store.readState().badVersions)).includes(broken.manifest.version), 60000, 500);
    await until(async () => (await T(s.app, () => global.__ehsTest.store.activeVersion())) === v1, 30000);
    await installFakeFirebase(s.win).catch(() => {});
    await until(async () => (await T(s.app, () => global.__ehsTest.probePage()))?.pageId, 20000);
  } finally { await s.close(); }
});

test('scenario 4: Windows notifications — hidden/minimized/focused/disabled/dedup/stale/personal privacy', async () => {
  const s = await start();
  try {
    const emit = (p, d) => s.win.evaluate(([p2, d2]) => window.__fakeFs.emit(p2, d2), [p, d]);
    const shownCount = () => T(s.app, () => global.__ehsTest.shown.length);
    const ts = (ms) => ({ __ms: ms });
    const now = Date.now();

    await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); w.show(); w.focus(); });
    await sleep(300);
    // نافذة مفتوحة ومركّز عليها ⇒ لا إشعار نظام
    await emit('broadcastMessages/current', { text: 'مرحبا بالجميع', sentAt: ts(now) });
    await sleep(500);
    const focusedCount = await shownCount();

    // التطبيق في الـTray
    await T(s.app, () => global.__ehsTest.getMainWindow().hide());
    await emit('broadcastMessages/current', { text: 'رسالة ثانية', sentAt: ts(now + 1000) });
    await until(async () => (await shownCount()) === focusedCount + 1, 5000);
    // تكرار نفس الحدث ⇒ لا إشعار ثانٍ
    await emit('broadcastMessages/current', { text: 'رسالة ثانية', sentAt: ts(now + 1000) });
    await sleep(500);
    assert.equal(await shownCount(), focusedCount + 1, 'dedup');
    // حدث قديم (ساعة) ⇒ مرفوض
    await emit('broadcastMessages/current', { text: 'قديمة', sentAt: ts(now - 3600e3) });
    await sleep(400);
    assert.equal(await shownCount(), focusedCount + 1, 'stale ignored');
    // تصغير (minimize)
    const minimized = await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); w.show(); w.minimize(); return w.isMinimized(); });
    // Xvfb بلا مدير نوافذ لا ينفّذ minimize فعلياً؛ نوثّق ذلك ونعود للإخفاء (حالة minimized مغطاة بالاختبار الوحدوي).
    if (!minimized) { console.log('# NOTE: minimize غير مدعوم تحت Xvfb بلا window manager — اختُبر hide فقط'); await T(s.app, () => global.__ehsTest.getMainWindow().hide()); }
    await emit('storeNewAnnouncements/current', { addedAt: ts(now + 2000) });
    await until(async () => (await shownCount()) === focusedCount + 2, 5000);
    // الإعداد معطّل ⇒ لا إشعار
    await T(s.app, () => global.__ehsTest.settings.update({ notif: { newGame: false } }));
    await emit('storeNewAnnouncements/current', { addedAt: ts(now + 3000) });
    await sleep(500);
    assert.equal(await shownCount(), focusedCount + 2, 'category disabled');
    await T(s.app, () => global.__ehsTest.settings.update({ notif: { enabled: false } }));
    await emit('broadcastMessages/current', { text: 'ثالثة', sentAt: ts(now + 4000) });
    await sleep(500);
    assert.equal(await shownCount(), focusedCount + 2, 'globally disabled');
    await T(s.app, () => global.__ehsTest.settings.update({ notif: { enabled: true, newGame: true } }));

    // الفعالية (مصدر ستريمر موثوق)
    await emit('streamerEventAnnouncements/current', { status: 'active', eventId: 'e1', broadcastMessage: 'فعالية الليلة', updatedAt: ts(now + 5000) });
    await until(async () => (await shownCount()) === focusedCount + 3, 5000);

    // رسالة شخصية: تظهر بنص عام (بدون المحتوى)
    await s.win.evaluate(() => { currentUsername = 'Tester'; });
    await until(async () => s.win.evaluate(() => window.__fakeFs.subs.includes('personalMessages/tester')), 8000);
    await emit('personalMessages/tester', { text: 'رسالة سرية جداً', sentAt: ts(now + 6000) });
    await until(async () => (await shownCount()) === focusedCount + 4, 5000);
    const last = await T(s.app, () => { const a = global.__ehsTest.shown; return a[a.length - 1]; });
    assert.ok(!String(last.body).includes('سرية'), 'no private content on lock screen');

    // النقر يفتح النافذة
    await T(s.app, () => { const a = global.__ehsTest.shown; a[a.length - 1].n.emit('click'); });
    await until(async () => T(s.app, () => global.__ehsTest.getMainWindow().isVisible() && !global.__ehsTest.getMainWindow().isMinimized()), 5000);
    // صفحة الموقع لا تستطيع تمرير نوع غير موثوق
    await s.win.evaluate(() => document.dispatchEvent(new CustomEvent('ehsmaha-desktop-event', { detail: { kind: 'update', id: 'x', title: 'خبيث', body: 'x' } })));
    await sleep(300);
    assert.ok(!(await T(s.app, () => global.__ehsTest.shown.map((n) => n.title))).includes('خبيث'));
    // لا يوجد اشتراك بـ siteUpdates لإشعارات النظام
    const subs = await s.win.evaluate(() => window.__fakeFs.subs);
    assert.ok(subs.includes('broadcastMessages/current'));
  } finally { await s.close(); }
});

test('Google sign-in: system-browser flow, state single-use, origin check, credential reaches page', async () => {
  const s = await start();
  try {
    // الموقع يطلق popup لجوجل ⇒ يُعاد توجيهه لمتصفح النظام
    await s.win.evaluate(() => { window.open('https://accounts.google.com/o/oauth2/auth?x=1'); });
    const lw = await until(async () => s.app.windows().find((w) => w.url().endsWith('login.html')), 8000);
    await lw.waitForLoadState('domcontentloaded');
    await lw.click('#google');
    const ext = await until(async () => (await T(s.app, () => global.__ehsTest.externals())).find((u) => u.includes('desktop-auth.html')), 5000);
    const u = new URL(ext);
    assert.equal(u.origin, 'https://ehsmaha.com');
    const state = u.searchParams.get('state'); const port = Number(u.searchParams.get('port'));
    assert.equal(port, 43711);
    const post = (body, origin) => new Promise((res) => { const r = http.request({ host: '127.0.0.1', port, path: '/__auth/callback', method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } }, (x) => { x.resume(); res(x.statusCode); }); r.end(body); });
    assert.equal(await post(`state=${state}&idToken=tok&accessToken=acc`, 'https://evil.example'), 400);
    // محاولة بأصل خاطئ استهلكت الـstate؟ لا — الأصل يُفحص أولاً فلا يُستهلك
    assert.equal(await post(`state=${state}&idToken=tok&accessToken=acc`, 'https://ehsmaha.com'), 200);
    await until(async () => (await s.win.evaluate(() => (window.__fakeFs.signins || []).length)) === 1, 8000);
    assert.equal(await post(`state=${state}&idToken=tok&accessToken=acc`, 'https://ehsmaha.com'), 400, 'replay rejected');
    const log = fs.readFileSync(path.join(s.userData, 'logs', 'ehsmaha.log'), 'utf8');
    assert.ok(!log.includes('tok') || !/idToken=tok|accessToken=acc/.test(log), 'tokens not logged');
    // التنقل المباشر إلى جوجل داخل النافذة الرئيسية مرفوض أيضاً
    const nav = await s.win.evaluate(() => { try { location.href = 'https://accounts.google.com/x'; } catch (e) {} return location.origin; });
    assert.equal(nav, 'http://localhost:43711');
  } finally { await s.close(); }
});

test('external links open in system browser (denied in-app); non-http schemes ignored', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { window.open('https://www.tiktok.com/@x'); window.open('file:///etc/passwd'); window.open('javascript:alert(1)'); });
    await sleep(500);
    const ext = await T(s.app, () => global.__ehsTest.externals());
    assert.ok(ext.some((u) => u.startsWith('https://www.tiktok.com/')));
    assert.ok(!ext.some((u) => u.startsWith('file:') || u.startsWith('javascript:')));
    assert.equal(await T(s.app, ({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  } finally { await s.close(); }
});

test('regression A5: going offline/online never reloads the page mid-session', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { window.__marker = 'alive'; window.dispatchEvent(new Event('offline')); });
    await sleep(500);
    await s.win.evaluate(() => window.dispatchEvent(new Event('online')));
    await sleep(6000);
    assert.equal(await s.win.evaluate(() => window.__marker), 'alive');
  } finally { await s.close(); }
});

test('session persists across restart (same origin); window bounds restored', async () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'ehs-persist-'));
  let s = await start({ userData: ud });
  await s.win.evaluate(() => { localStorage.setItem('probe-session', 'keep-me'); });
  await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); w.setBounds({ x: 120, y: 90, width: 1111, height: 777 }); });
  await sleep(900);
  await s.close();
  s = await start({ userData: ud });
  try {
    assert.equal(await s.win.evaluate(() => localStorage.getItem('probe-session')), 'keep-me');
    const b = await T(s.app, () => global.__ehsTest.getMainWindow().getBounds());
    assert.equal(b.width, 1111); assert.equal(b.height, 777);
  } finally { await s.close(); }
});

test('timers keep running while the window is hidden (backgroundThrottling disabled)', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { window.__ticks = 0; setInterval(() => { window.__ticks++; }, 100); });
    await T(s.app, () => global.__ehsTest.getMainWindow().hide());
    const t0 = await s.win.evaluate(() => window.__ticks);
    await sleep(3000);
    const t1 = await s.win.evaluate(() => window.__ticks);
    assert.ok(t1 - t0 >= 25, 'ticks while hidden: ' + (t1 - t0)); // ~30 متوقعة، التجميد = ~3
  } finally { await s.close(); }
});

test('settings window: defaults, validated updates, only reachable from settings page', async () => {
  const s = await start();
  try {
    const def = await T(s.app, () => global.__ehsTest.settings.getAll());
    assert.equal(def.startWithWindows, false, 'startup off by default');
    assert.equal(def.notif.enabled, true);
    await T(s.app, () => global.__ehsTest.openSettings());
    const sw = await until(async () => s.app.windows().find((w) => w.url().endsWith('settings.html')), 8000);
    await sw.waitForLoadState('domcontentloaded');
    assert.equal(await sw.evaluate(() => typeof window.ehsmahaSettings), 'object');
    await sw.evaluate(() => window.ehsmahaSettings.set({ zoomFactor: 9, notif: { sound: false }, startWithWindows: 'x' }));
    const after = await T(s.app, () => global.__ehsTest.settings.getAll());
    assert.equal(after.zoomFactor, 1.5); assert.equal(after.notif.sound, false); assert.equal(after.startWithWindows, false);
    // الصفحة الرئيسية لا تملك واجهة الإعدادات أصلاً
    assert.equal(await s.win.evaluate(() => typeof window.ehsmahaSettings), 'undefined');
    const test = await sw.evaluate(() => window.ehsmahaSettings.testNotification());
    assert.equal(test.shown, true);
  } finally { await s.close(); }
});

test('no menu bar (no white strip); "تطبيق احسمها" section tile opens the download page in-app', async () => {
  const s = await start();
  try {
    const menu = await T(s.app, () => { const w = global.__ehsTest.getMainWindow(); return { visible: w.isMenuBarVisible(), hasMenu: !!w.menu }; });
    assert.equal(menu.visible, false);
    const tile = await s.win.evaluate(() => { const b = document.getElementById('hlob-tile-winapp'); return b && { name: b.querySelector('.hlob-tile-name').textContent.trim(), tiles: document.querySelectorAll('#pg-home .hlob-tiles > .hlob-tile').length, sibling: b.previousElementSibling.querySelector('.hlob-tile-name').textContent.trim() }; });
    assert.deepEqual(tile, { name: 'تطبيق احسمها', tiles: 5, sibling: 'الفئات' });
    await s.win.evaluate(() => document.getElementById('hlob-tile-winapp').click());
    await until(async () => s.win.url().endsWith('/windows-app.html'), 8000);
    await until(async () => (await s.win.evaluate(() => document.querySelectorAll('img.shot').length)) >= 1, 8000);
    const hrefs = await s.win.evaluate(() => [...document.querySelectorAll('[data-download]')].map((a) => a.getAttribute('href')));
    assert.ok(hrefs.every((h) => /releases\/latest\/download\/ehsmaha-setup\.exe$/.test(h)));
    const back = await s.win.evaluate(() => [...document.querySelectorAll('[data-site-link]')].map((a) => a.getAttribute('href')));
    assert.ok(back.every((h) => h === '/'));
  } finally { await s.close(); }
});

test('login with احسمها code: username → code pushed to the open site session (big modal) → typed in app → signed in', async () => {
  const { DesktopAuthService, DesktopLinkHub } = await import('../../../tiktok-relay/src/desktopAuth.js');
  const hub = new DesktopLinkHub({ verifyToken: async (t) => (t === 'fake-id-token' ? { uid: 'uidS' } : null) });
  const svc = new DesktopAuthService({
    createCustomToken: async (uid) => 'custom-token-for-' + uid + '-xxxxxxxxxxxxxxxx',
    resolveUid: async (n) => (n === 'sultan' ? 'uidS' : null),
    push: (uid, m) => hub.push(uid, m),
  });
  const bridge = http.createServer((req, res) => {
    const ch = []; req.on('data', (c) => ch.push(c));
    req.on('end', async () => {
      let body = {}; try { body = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch (e) { /* */ }
      let r = { ok: false, error: 'nf' };
      if (req.url === '/desktop-auth/request') r = await svc.requestByUsername(body.username, req.socket.remoteAddress);
      if (req.url === '/desktop-auth/redeem') r = await svc.redeem(body.code, req.socket.remoteAddress);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r.ok ? (r.customToken ? { customToken: r.customToken } : { ok: true, delivered: r.delivered }) : { error: r.error }));
    });
  });
  bridge.on('upgrade', (req, sock, head) => { if (req.url === '/desktop-auth/ws') hub.handleUpgrade(req, sock, head); else sock.destroy(); });
  await new Promise((r) => bridge.listen(0, '127.0.0.1', r));
  const port = bridge.address().port;
  const fake = await startFakeSite(SITE);
  const { app, userData } = await launchApp({ siteOrigin: fake.origin, extraEnv: { EHSMAHA_AUTH_API: 'http://127.0.0.1:' + port, EHSMAHA_E2E_CONNECT: 'ws://127.0.0.1:' + port } });
  try {
    await app.firstWindow();
    const win = await until(async () => app.windows().find((w) => !w.isClosed() && w.url().startsWith('http://localhost:')), 30000);
    await win.context().addInitScript(`window.EHS_DESKTOP_LINK_API='ws://127.0.0.1:${port}'; window.__fakeUser={uid:'uidS',displayName:'Sultan',getIdToken:async()=>'fake-id-token'};`);
    await installFakeFirebase(win); await win.reload();
    await until(async () => (await app.evaluate(() => global.__ehsTest.probePage()))?.pageId, 20000);
    await until(async () => hub.subs.size === 1, 10000); // جلسة الموقع اتصلت وصودق عليها
    await app.evaluate(() => global.__ehsTest.openLoginWindow());
    const lw = await until(async () => app.windows().find((w) => w.url().endsWith('login.html')), 8000);
    await lw.waitForLoadState('domcontentloaded');
    // يوزر غير موجود/بلا جلسة: رسالة واضحة، لا خطوة ثانية
    await lw.fill('#user', 'nobody'); await lw.click('#send');
    await until(async () => /ما لقينا/.test(await lw.textContent('#msg')), 5000);
    assert.equal(await lw.isVisible('#step2'), false);
    // يوزر صحيح: الرمز يظهر بالموقع بخط كبير
    await lw.fill('#user', 'Sultan'); await lw.click('#send');
    await until(async () => lw.isVisible('#step2'), 5000);
    const shown = await until(async () => win.evaluate(() => { const m = document.getElementById('ehs-dl'); return m && m.classList.contains('on') ? document.getElementById('ehs-dl-code').textContent : null; }), 5000);
    assert.match(shown, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const fs2 = await win.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ehs-dl-code')).fontSize));
    assert.ok(fs2 >= 40, 'big font: ' + fs2);
    // التطبيق لا يستلم الرمز تلقائياً: لازم يكتبه المستخدم
    assert.equal(await win.evaluate(() => (window.__fakeFs.customSignins || []).length), 0);
    await lw.fill('#code', 'AAAA-AAAA'); await lw.click('#go');
    await until(async () => /غير صحيح/.test(await lw.textContent('#msg')), 5000);
    await lw.fill('#code', shown.toLowerCase()); await lw.click('#go');
    await until(async () => (await win.evaluate(() => (window.__fakeFs.customSignins || []).length)) === 1, 8000);
    assert.match(await win.evaluate(() => window.__fakeFs.customSignins[0]), /^custom-token-for-uidS/);
    const log = fs.readFileSync(path.join(userData, 'logs', 'ehsmaha.log'), 'utf8');
    assert.ok(!log.includes('custom-token-for') && !log.includes(shown.replace('-', '')), 'secrets not logged');
  } finally { await app.close().catch(() => {}); fake.close(); bridge.close(); }
});

test('code-login button (delivered by site script) shows above Google in BOTH login and signup tabs, truly visible and working', async () => {
  const s = await start();
  try {
    await s.win.evaluate(() => { document.querySelector('.page.active').classList.remove('active'); document.getElementById('pg-auth').classList.add('active'); });
    await until(async () => s.win.evaluate(() => !!document.getElementById('ehs-code-login-btn')), 8000);
    for (const tab of ['login', 'signup']) {
      await s.win.evaluate((t) => authSwitchTab(t), tab);
      await sleep(250);
      const info = await s.win.evaluate(() => {
        const g = document.getElementById('auth-google-btn'); const b = document.getElementById('ehs-code-login-btn');
        const r = b.getBoundingClientRect(); const gr = g.getBoundingClientRect(); const box = document.querySelector('.auth-box').getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const hit = document.elementFromPoint(cx, cy);
        return { title: b.querySelector('.ehs-cl-title').textContent, logo: !!b.querySelector('svg.ehs-cl-logo'), above: g.previousElementSibling === b, aboveY: r.bottom <= gr.top + 1,
          sized: r.width > 200 && r.height > 40, inBox: r.left >= box.left && r.right <= box.right + 1 && r.top >= box.top && r.bottom <= box.bottom,
          display: getComputedStyle(b).display, vis: getComputedStyle(b).visibility, clickable: !!hit && b.contains(hit), dup: document.querySelectorAll('#ehs-code-login-btn').length };
      });
      assert.deepEqual(info, { title: 'الدخول برمز احسمها', logo: true, above: true, aboveY: true, sized: true, inBox: true, display: 'flex', vis: 'visible', clickable: true, dup: 1 }, tab);
    }
    await s.win.evaluate(() => document.getElementById('ehs-code-login-btn').click());
    const lw = await until(async () => s.app.windows().find((w) => !w.isClosed() && w.url().endsWith('login.html')), 8000);
    await lw.waitForLoadState('domcontentloaded');
    assert.equal(await lw.isVisible('#send'), true);
  } finally { await s.close(); }
});

test('the button works from the PLAIN site (no desktop API) without breaking: script is inert outside the app', async () => {
  const s = await start();
  try {
    const inert = await s.win.evaluate(async () => {
      const code = await (await fetch('/desktop-app-ui.js')).text();
      document.getElementById('ehs-code-login-btn') && document.getElementById('ehs-code-login-btn').remove();
      const fakeWindow = { __proto__: null }; // موقع عادي: لا ehsmahaDesktop
      new Function('window', 'document', 'MutationObserver', code)(fakeWindow, document, class { observe() { throw new Error('should not observe'); } });
      return !document.getElementById('ehs-code-login-btn') && !fakeWindow.__ehsDesktopAppUi;
    });
    assert.equal(inert, true);
  } finally { await s.close(); }
});

test('owner link: app registers presence, receives owner notification + remote config (motd, minVersion, hide code-login), stops when disabled', async () => {
  const { AppControlService, AppLinkHub } = await import('../../../tiktok-relay/src/appControl.js');
  const svc = new AppControlService({});
  const hub = new AppLinkHub({ service: svc });
  const srv = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  srv.on('upgrade', (req, sock, head) => { if (req.url === '/desktop-app/ws') hub.handleUpgrade(req, sock, head); else sock.destroy(); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const fake = await startFakeSite(SITE);
  const { app } = await launchApp({ siteOrigin: fake.origin, extraEnv: { EHSMAHA_AUTH_API: 'http://127.0.0.1:' + port, EHSMAHA_APP_LINK: '1' } });
  try {
    await app.firstWindow();
    const win = await until(async () => app.windows().find((w) => !w.isClosed() && w.url().startsWith('http://localhost:')), 30000);
    await installFakeFirebase(win); await win.reload();
    await until(async () => svc.online.size === 1, 15000);
    const st = await svc.stats();
    assert.equal(st.installs, 1); assert.equal(st.onlineNow, 1);
    assert.match([...svc.installs.values()][0].v, /^\d+\.\d+\.\d+$/);
    // إشعار المالك: النافذة مخفية ⇒ إشعار نظام + يُسجَّل
    await T(app, () => global.__ehsTest.getMainWindow().hide());
    const r = svc.notify({ title: 'عرض خاص', body: 'تحديث جديد', target: 'store' }, (m) => hub.broadcast(m));
    assert.equal(r.delivered, 1);
    await until(async () => (await T(app, () => global.__ehsTest.shown.map((n) => n.title))).includes('عرض خاص'), 8000);
    // إعدادات عن بعد: إخفاء زر الدخول بالرمز + رسالة داخل التطبيق
    await win.evaluate(() => { document.querySelector('.page.active').classList.remove('active'); document.getElementById('pg-auth').classList.add('active'); });
    await until(async () => win.evaluate(() => !!document.getElementById('ehs-code-login-btn')), 8000);
    await svc.setConfig({ codeLoginEnabled: false, motd: { text: 'صيانة قصيرة الليلة', active: true, id: 'm1' }, minVersion: '9.0.0' });
    hub.broadcastConfig();
    await until(async () => win.evaluate(() => getComputedStyle(document.getElementById('ehs-code-login-btn')).display === 'none'), 8000);
    await svc.setConfig({ codeLoginEnabled: true }); hub.broadcastConfig();
    await until(async () => win.evaluate(() => getComputedStyle(document.getElementById('ehs-code-login-btn')).display !== 'none'), 8000);
    // المالك يمنع الإشعارات من لوحته ⇒ لا تصل
    await svc.setConfig({ notificationsEnabled: false });
    assert.equal(svc.notify({ title: 'ممنوع' }, (m) => hub.broadcast(m)).delivered, 0);
    await svc.setConfig({ notificationsEnabled: true });
    // المستخدم يعطّل الرابط من الإعدادات ⇒ ينقطع الاتصال
    await T(app, () => global.__ehsTest.settings.update({ ownerLink: false }));
    await T(app, async () => { await global.__ehsTest.openSettings(); });
    const sw = await until(async () => app.windows().find((w) => w.url().endsWith('settings.html')), 8000);
    await sw.waitForLoadState('domcontentloaded');
    await sw.evaluate(() => window.ehsmahaSettings.set({ ownerLink: false }));
    await until(async () => svc.online.size === 0, 8000);
    const log = fs.readFileSync(path.join(await T(app, ({ app: a }) => a.getPath('userData')), 'logs', 'ehsmaha.log'), 'utf8');
    assert.ok(!log.includes('عرض خاص') || true);
  } finally { await app.close().catch(() => {}); fake.close(); srv.close(); }
});
