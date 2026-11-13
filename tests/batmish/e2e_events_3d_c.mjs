// اختبار متصفح كامل لـBATMISH: الموقع الحقيقي + محاكيات Firebase + خادم BATMISH (وحدات الخادم الحقيقية).
// يتحقق: ظهور/اختفاء الزر، رفض غير المصرّح، التعديل والحفظ والاستمرار بعد التحديث، عزل الحسابات، تطبيق القيمة على modGetSetting،
// المجموعات والسجل، التجاوب على الجوال. التشغيل: انظر tests/batmish/README.md
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const SITE = process.env.SITE || 'http://127.0.0.1:8790/index.html';
const API = process.env.API || 'http://127.0.0.1:8791';
const SHOTS = process.env.SHOTS || '/tmp/bm-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const FB = 'https://www.gstatic.com/firebasejs/12.15.0/';
const NM = path.resolve(process.env.FB_NM || '/tmp/fbemu/node_modules/firebase');
const PID = 'streamgame-180b8';
const NS = 'streamgame-180b8-default-rtdb';
const adm = { Authorization: 'Bearer owner' };
await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: adm, body: fs.readFileSync('database.rules.json', 'utf8') });
await fetch(`http://127.0.0.1:9000/.json?ns=${NS}`, { method: 'DELETE', headers: adm });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PID}/accounts`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fs.readFileSync('firestore.rules', 'utf8') }] } }) });
let pass = 0, fail = 0; const errors = [];
const ok = (c, m, extra = '') => { if (c) { pass++; console.log('  ✔', m); } else { fail++; console.log('  ✘', m, typeof extra === 'string' ? extra : JSON.stringify(extra)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { } await sleep(150); } return null; }

const wrapAuth = `import * as R from '${FB}__real/firebase-auth.js';
export * from '${FB}__real/firebase-auth.js';
export function getAuth(app) { const a = R.getAuth(app); if (!a.__emu) { R.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); a.__emu = 1; } window.__auth = a; window.__authM = R; return a; }`;
const wrapFs = `import * as R from '${FB}__real/firebase-firestore.js';
export * from '${FB}__real/firebase-firestore.js';
const hook = (db) => { try { R.connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) { } return db; };
export function initializeFirestore(app, s, id) { return hook(R.initializeFirestore(app, s, id)); }
export function getFirestore(...a) { return hook(R.getFirestore(...a)); }`;
const wrapDb = `import * as R from '${FB}__real/firebase-database.js';
export * from '${FB}__real/firebase-database.js';
export function getDatabase(app, url) { const d = R.getDatabase(app, url); if (!d.__emu) { R.connectDatabaseEmulator(d, '127.0.0.1', 9000); d.__emu = 1; } return d; }`;

const browser = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-gpu-sandbox'] });
async function newCtx(label, vp, storage) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1366, height: 860 }, locale: 'ar', storageState: storage });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com\/firebasejs|fonts\.g)/, r => r.abort());
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route(/windows-launch-campaign\//, r => r.abort());
  await ctx.route(FB + '**', async (r) => {
    const u = r.request().url().slice(FB.length);
    const H = { 'content-type': 'application/javascript', 'access-control-allow-origin': '*' };
    if (u === 'firebase-firestore.js') return r.fulfill({ status: 200, headers: H, body: wrapFs });
    if (u === 'firebase-auth.js') return r.fulfill({ status: 200, headers: H, body: wrapAuth });
    if (u === 'firebase-database.js') return r.fulfill({ status: 200, headers: H, body: wrapDb });
    const f = path.join(NM, u.replace(/^__real\//, ''));
    if (fs.existsSync(f)) return r.fulfill({ status: 200, headers: H, body: fs.readFileSync(f) });
    return r.fulfill({ status: 404, body: '' });
  });
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = '#ehsemha-win,.ehsemha-win-bg{display:none!important}'; document.head.appendChild(st); }); });   // نافذة ترويج تطبيق ويندوز تعترض النقرات بالاختبار
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(label + ': ' + e.message); });
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
async function open(page) { await page.goto(SITE); await page.waitForFunction(() => window.__auth && window.__fb && document.getElementById('auth-loader').classList.contains('hidden'), null, { timeout: 25000 }); await sleep(500); }
async function signup(page, u, e) {
  await page.evaluate(() => { show('auth'); authSwitchTab('signup'); });
  await page.fill('#auth-signup-username', u); await page.fill('#auth-signup-email', e); await page.fill('#auth-signup-pass', '123456');
  await page.click('#auth-signup-btn');
  await until(async () => page.evaluate((n) => typeof currentUsername !== 'undefined' && currentUsername === n, u), 25000);
  return page.evaluate(() => window.__auth.currentUser.uid);
}
// يحاكي ربط البث الفعلي: يبني رابط الجسر بنفس دالة الموقع (مع التوكن) ويفتح WS حقيقي لخادم الاختبار
async function linkStream(page, username) {
  return page.evaluate(async ([user, api]) => {
    TIKTOK_BRIDGE_SERVERS[0] = api.replace('http', 'ws') + '/ws';
    const url = tiktokBridgeWsUrlAt(0, user);
    const ws = new WebSocket(url);
    await new Promise((r, j) => { ws.onmessage = () => r(); ws.onerror = j; setTimeout(r, 3000); });
    homeConnections.tiktok = { ws, username: user, attempts: 0, timer: null };
    window.__bmWs = ws;
    return { hasToken: /[?&]t=/.test(url), user };
  }, [username, API]);
}
const btn = (page) => page.evaluate(() => { const b = document.getElementById('batmish-launch'); return !!b && b.classList.contains('is-on'); });
const bind = (uid, streamer) => fetch(API + '/__bind', { method: 'POST', body: JSON.stringify({ uid, streamer }) });


console.log('== E1) فتح لوحة الأحداث الخاصة');
const Z = await newCtx('Z');
await open(Z.page);
const uidZ = await signup(Z.page, 'zvd_user', 'z@test.com');
await bind(uidZ); await sleep(1500);
await linkStream(Z.page, '_zvd4');
ok(!!(await until(() => btn(Z.page), 10000)), 'الزر يظهر لحساب _zvd4');
const evReady = await until(() => Z.page.evaluate(() => !!(window.BatmishEvents && window.BatmishEvents.catalog())), 15000);
ok(!!evReady, 'محرك الأحداث يُحمَّل ويقرأ الكتالوج من الخادم بعد موافقة الخادم فقط');

const api = (path, body) => Z.page.evaluate(async ([p, b]) => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + p, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.status; }, [path, body]);
const enable = async (tag, ids, extra = {}) => { await api('/batmish/events/game', { tag, values: { mode: 'manual' } }); for (const id of ids) await api('/batmish/events/event', { tag, eventId: id, values: { enabled: true, probability: 100, fromSec: 0, ...extra } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r))); };
const U = (i) => ({ uniqueId: 'u' + i, nickname: 'ل' + i, isFollower: true, followKnown: true, followRole: 1 });
const Us = (a, n) => Array.from({ length: n }, (_, i) => U(a + i));

{
  const THREE_DIR = path.resolve('tests/bridge/fixtures/three-r128');
  const ful = (rel) => async (route) => { const f = path.join(THREE_DIR, rel); if (!fs.existsSync(f)) return route.abort(); await route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: 'application/javascript' }); };
  await Z.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, ful('build/three.min.js'));
  await Z.ctx.route(/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/three@0\.128\.0\/(.*)$/, async (route) => { const m = route.request().url().match(/three@0\.128\.0\/(.*)$/); return ful(m[1])(route); });
}

console.log('== H1) المدفع البشري (iframe Three.js حقيقي)');
await enable('cannon', ['cannon.e1', 'cannon.e2', 'cannon.e3', 'cannon.e4', 'cannon.e5']);
await Z.page.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, '_zvd4'); goSetupCannon(); launchCannon(); });
ok(!!(await until(() => Z.page.evaluate(() => window.cannonStatus === 'waiting'), 15000)), 'المدفع: فُتحت غرفة الانتظار');
await Z.page.evaluate(() => { for (let i = 1; i <= 3; i++) cannonHandleEvent({ type: 'chat', user: { uniqueId: 'cu' + i, nickname: 'مدفع' + i, isFollower: true, followKnown: true }, comment: 'انضم' }); });
await sleep(400);
await Z.page.evaluate(() => { cannonHandleEvent({ type: 'chat', user: { uniqueId: 'cu1', nickname: 'مدفع1', isFollower: true, followKnown: true }, comment: '45 80' }); cannonHandleEvent({ type: 'chat', user: { uniqueId: 'cu2', nickname: 'مدفع2', isFollower: true, followKnown: true }, comment: '35 100' }); cannonHandleEvent({ type: 'chat', user: { uniqueId: 'cu3', nickname: 'مدفع3', isFollower: true, followKnown: true }, comment: '55 60' }); });
await Z.page.setViewportSize({ width: 480, height: 270 });
const cj = await Z.page.evaluate(() => { cannonStartRound(); return cannonParticipants.size; });
const HCs = () => Z.page.evaluate(() => { const w = document.getElementById('cannon-w-frame') && document.getElementById('cannon-w-frame').contentWindow; return w && w.HC ? w.HC.state() : null; });
ok(cj === 3 && !!(await until(async () => (await HCs()) === 'entry', 60000)) && !!(await until(() => Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('cannon')), 6000)), 'المدفع: بدأ الراوند الحقيقي (مرحلة الإدخال) وفُتحت جولة أحداث');
await Z.page.evaluate(() => { document.getElementById('cannon-w-frame').contentWindow.HC.configure({ pen: false, entry: 600 }); });
const cn5 = await Z.page.evaluate(() => { const w = document.getElementById('cannon-w-frame').contentWindow; const r = window.BatmishEvents.trigger('cannon', 'cannon.e5'); return { ok: r.ok, wind: w.HC.ev.wind(), obs: w.HC.cfg().obs, pen: w.HC.cfg().pen }; });
ok(cn5.ok && cn5.wind === 0 && cn5.obs === false && cn5.pen === false, 'الجولة المثالية: رياح صفر وبلا عوائق ولا عقوبات', cn5);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('cannon', a.id)); });
ok(await Z.page.evaluate(() => document.getElementById('cannon-w-frame').contentWindow.HC.cfg().obs === true), 'الجولة المثالية: عادت العوائق بعد الحدث');
const cn3 = await Z.page.evaluate(() => { const w = document.getElementById('cannon-w-frame').contentWindow; const before = w.HC.ev.wind(); const r = window.BatmishEvents.trigger('cannon', 'cannon.e3'); return { ok: r.ok, before, after: w.HC.ev.wind(), txt: w.document.getElementById('wind').textContent }; });
ok(cn3.ok && Math.abs(cn3.after - cn3.before) >= 2 && cn3.txt === Math.abs(cn3.after).toFixed(1), 'الرياح المتغيرة: تبدّلت الرياح فعلاً وظهرت في لوحة اللعبة', cn3);
const cn4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cannon', 'cannon.e4'); return { ok: r.ok, rev: document.getElementById('cannon-w-frame').contentWindow.HC.ev.reverse() }; });
ok(cn4.ok && cn4.rev === true, 'التحدي العكسي: فُعّل', cn4);
await Z.page.evaluate(() => { document.getElementById('cannon-w-frame').contentWindow.HC.configure({ entry: 3 }); document.getElementById('cannon-w-frame').contentWindow.HC.key('Space'); });
ok(!!(await until(() => Z.page.evaluate(() => document.getElementById('cannon-w-frame').contentWindow.HC.ev.flying()), 90000)), 'المدفع: أول مدفوع في الجو');
const cn2 = await Z.page.evaluate(() => { const w = document.getElementById('cannon-w-frame').contentWindow; const c0 = w.HC.ev.cur(); const r = window.BatmishEvents.trigger('cannon', 'cannon.e2'); const c1 = w.HC.ev.cur(); return { ok: r.ok, t0: c0 && c0.tail, t1: c1 && c1.tail, vx0: c0 && c0.vx, vx1: c1 && c1.vx }; });
ok(cn2.ok && cn2.t1 > 0 && cn2.vx1 > cn2.vx0, 'الهدف الذهبي: دفعة ذهبية رفعت السرعة الأمامية فعلاً', cn2);
const cn1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cannon', 'cannon.e1'); return r.ok; });
ok(cn1, 'الهدف المتحرك: طائرة اعترضت المدفوع');
const cres = await until(() => Z.page.evaluate(() => window.cannonLastResult), 150000);
ok(!!cres, 'المدفع: انتهى الراوند وصدرت نتيجة');
if (cres) {
  const mn = Math.min(...cres.results.map((r) => r.dist));
  ok(cres.winner.dist === mn, 'التحدي العكسي: الفائز صاحب أقصر رمية فعلاً (لا أبعدها)', { winner: cres.winner, results: cres.results });
}
ok(!!(await until(() => Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0), 20000)), 'المدفع: لا أحداث نشطة بعد انتهاء الجولة (تُستعاد القواعد عند العودة لحالة الانتظار)');

console.log('== أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
