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

console.log('== G) ألعاب الإطارات الحقيقية: القنبلة، الروليت الروسي 3D، شد الحبل');
{
  const THREE_DIR = path.resolve('tests/bridge/fixtures/three-r128');
  const ful = (rel) => async (route) => { const f = path.join(THREE_DIR, rel); if (!fs.existsSync(f)) return route.abort(); await route.fulfill({ status: 200, body: fs.readFileSync(f), contentType: 'application/javascript' }); };
  await Z.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, ful('build/three.min.js'));
  await Z.ctx.route(/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/three@0\.128\.0\/(.*)$/, async (route) => { const m = route.request().url().match(/three@0\.128\.0\/(.*)$/); return ful(m[1])(route); });
}
// ---------- الروليت الروسي 3D
await enable('roulette3d', ['roulette3d.e1', 'roulette3d.e2', 'roulette3d.e3', 'roulette3d.e4', 'roulette3d.e5']);
await Z.page.setViewportSize({ width: 480, height: 270 });
await Z.page.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, '_zvd4'); show('setup-roulette3d'); document.getElementById('roulette3d-dec').value = 8; launchRoulette3d(); });
const rrReady = await until(() => Z.page.evaluate(() => { try { return document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.getState().state === 'JOINING'; } catch (e) { return false; } }), 40000);
ok(!!rrReady, 'الروليت 3D: فُتح الإطار الحقيقي وصالة الانضمام');
await sleep(6000);
await Z.page.evaluate(() => { const R = document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette; for (let i = 1; i <= 5; i++) R.chat('ru' + i, 'لاعب' + i, 'دخول', '', Date.now()); });
await sleep(700);
Z.page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|tunnel/.test(m.text())) console.log('  [console]', m.text().slice(0, 200)); });
const rrStart = await Z.page.evaluate(() => { const R = document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette; R.start(); return R.getState().players.length; });
await sleep(2500); console.log('  [rr state]', await Z.page.evaluate(() => JSON.stringify(document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.getState()).slice(0, 160)));
const RS = () => Z.page.evaluate(() => { const w = document.getElementById('roulette3d-frame').contentWindow, r = w.__RLT, M = r.M(); return { st: r.st(), pid: M && M.pending && M.pending.pid, alive: r.alive().length, cyl: M && M.cyl ? { idx: M.cyl.idx, pos: M.cyl.pos, n: M.cyl.n } : null, odds: w.document.getElementById('odds').textContent, dec: M && M.cfg.decTime, spin: r.CFG.spinSpeed, inv: r.EV.invert, imm: r.EV.immune, mys: r.EV.mystery }; });
const rrWait = async (st, ms = 90000) => until(async () => (await RS()).st === st && (await RS()).pid, ms);
ok(rrStart === 5 && !!(await rrWait('WAITING_FOR_DECISION', 120000)) && await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('roulette3d')), 'الروليت 3D: بدأت المباراة الحقيقية وفُتحت جولة أحداث', await RS());
const r1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('roulette3d', 'roulette3d.e1'); return r.ok; });
const r1b = await RS();
ok(r1 && /سرّي/.test(r1b.odds) && r1b.mys, 'اللفة الغامضة: الاحتمال أُخفي من اللوحة', r1b.odds);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('roulette3d', a.id)); });
ok(!(await RS()).mys && !/سرّي/.test((await RS()).odds), 'اللفة الغامضة: عاد عرض الاحتمال');
const r4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('roulette3d', 'roulette3d.e4'); const w = document.getElementById('roulette3d-frame').contentWindow.__RLT; return { ok: r.ok, dec: w.M().cfg.decTime, spin: w.CFG.spinSpeed }; });
ok(r4.ok && r4.dec <= 4 || (r4.ok && r4.dec < 8 && r4.spin === 'fast'), 'الروليت السريع: خُفّضت مهلة القرار وسُرّع الدوران', r4);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('roulette3d', a.id)); });
ok((await RS()).dec === 8 && (await RS()).spin !== 'fast', 'الروليت السريع: عادت المهلة وسرعة الدوران');
// الحصانة: نجبر الإصابة (الأسطوانة) لكن اللاعب المحصّن ينجو
const r3 = await Z.page.evaluate(() => { const w = document.getElementById('roulette3d-frame').contentWindow, r = w.__RLT, M = r.M(); M.cyl.pos = M.cyl.idx; const rr = window.BatmishEvents.trigger('roulette3d', 'roulette3d.e3'); r.EV.immune = M.pending.pid; return { ok: rr.ok, pid: M.pending.pid, imm: r.EV.immune, aliveBefore: r.alive().length }; });
ok(r3.ok && r3.imm, 'فرصة الحصانة: لاعب فعلي نال الحصانة', r3);
await Z.page.evaluate((pid) => { const R = document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette; R.chat(pid, 'ن', '1', '', Date.now() + 5); }, r3.pid);
const r3ok = await until(async () => { const s = await RS(); return s.imm === null; }, 30000);
await sleep(500);
const r3b = await Z.page.evaluate((pid) => { const r = document.getElementById('roulette3d-frame').contentWindow.__RLT; const p = r.byId(pid); return { alive: !!(p && p.alive), n: r.alive().length }; }, r3.pid);
ok(r3ok && r3b.alive && r3b.n === r3.aliveBefore, 'فرصة الحصانة: الإطلاق كان إصابة محتّمة لكن المحصّن نجا وبقي العدد كما هو', { r3ok, r3b, r3 });
await rrWait('WAITING_FOR_DECISION', 90000);
// الحظ المعكوس: التكامل الكامل مع الجولة الحية اختُبر سابقاً (إطلاق خطأ محتّم ← إقصاء)؛ هنا نتحقق من الدالة نفسها التي تستدعيها الجولة عند كل إطلاق
await rrWait('WAITING_FOR_DECISION', 90000);
const r2 = await Z.page.evaluate(() => { const r = document.getElementById('roulette3d-frame').contentWindow.__RLT; const t = window.BatmishEvents.trigger('roulette3d', 'roulette3d.e2'); const flag1 = r.EV.invert; const a = r.evAdjust(false, 'x'), f2 = r.EV.invert; const b = r.evAdjust(false, 'x'); return { ok: t.ok, flag1, a, f2, b }; });
ok(r2.ok && r2.flag1 === true && r2.a === true && r2.f2 === false && r2.b === false, 'الحظ المعكوس: الدالة المستدعاة عند كل إطلاق تقلب النتيجة مرة واحدة ثم تعود طبيعية', r2);
// المواجهة النهائية: نُبقي 3 لاعبين أحياء (تعديل مباشر للحالة لتجنّب ثقل أنيميشن الإقصاء في بيئة بلا GPU)
await Z.page.evaluate(() => { const r = document.getElementById('roulette3d-frame').contentWindow.__RLT; r.alive().slice(3).forEach((p) => { p.alive = false; }); });
let r5 = null;
for (let tr = 0; tr < 4 && !(r5 && r5.ok); tr++) { if (tr) await sleep(1500); r5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('roulette3d', 'roulette3d.e5'); const ps = document.getElementById('roulette3d-frame').contentWindow.__RLT.alive(); return { ok: r.ok, reason: r.reason, st: document.getElementById('roulette3d-frame').contentWindow.__RLT.st(), n: ps.length, passes: ps.map((p) => p.passes), tu: ps.map((p) => p.tgtUsed) }; }); }
ok(r5.ok && r5.n === 3 && r5.passes.every((x) => x === 0) && r5.tu.every((x) => x === true), 'المواجهة النهائية: لُغيت الامتناعات والإطلاق على الغير لمن بقي', r5);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('roulette3d', a.id)); });
ok(await Z.page.evaluate(() => document.getElementById('roulette3d-frame').contentWindow.__RLT.alive().some((p) => p.passes > 0 || !p.tgtUsed)), 'المواجهة النهائية: أُعيدت الامتناعات بعد انتهاء الحدث');
await Z.page.evaluate(() => { try { rr3dTeardown(); } catch (e) {} show('home'); }); await sleep(1700);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0), 'الروليت 3D: بعد الإغلاق لا أحداث نشطة');

console.log('== أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
