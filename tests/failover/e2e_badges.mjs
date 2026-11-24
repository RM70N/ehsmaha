// اختبار حي: الموقع الحقيقي (index.html) + محاكيات Firebase (Auth/Firestore/RTDB) بقواعد المستودع الفعلية،
// مع محاكاة انتهاء حصة Firestore (resource-exhausted) فوق SDK الحقيقي. يتحقق من التحويل التلقائي إلى RTDB والرجوع.
// التشغيل: انظر tests/failover/README.md
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright');
const URL0 = process.env.URL0 || 'http://127.0.0.1:8790/index.html';
const FB = 'https://www.gstatic.com/firebasejs/12.15.0/';
const NM = path.resolve(process.env.FB_NM || '/tmp/fbemu/node_modules/firebase');
const PID = 'streamgame-180b8';
const NS = 'streamgame-180b8-default-rtdb';
const adm = { Authorization: 'Bearer owner' };
const RT = (p) => `http://127.0.0.1:9000/${p}.json?ns=${NS}`;
const FSU = (p) => `http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents/${p}`;
await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: adm, body: fs.readFileSync('database.rules.json', 'utf8') }).then(r => { if (!r.ok) throw new Error('rtdb rules ' + r.status); });
await fetch(RT(''), { method: 'DELETE', headers: adm });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PID}/accounts`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fs.readFileSync('firestore.rules', 'utf8') }] } }) });
const fsGet = async (p) => { const r = await fetch(FSU(p), { headers: adm }); return r.ok ? r.json() : null; };
const fsPut = async (col, id, fields) => fetch(FSU(col) + '?documentId=' + id, { method: 'POST', headers: { ...adm, 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
const rget = async (p) => (await fetch(RT(p), { headers: adm })).json();
let pass = 0, fail = 0; const errors = [];
const ok = (c, m, extra = '') => { if (c) { pass++; console.log('  ✔', m); } else { fail++; console.log('  ✘', m, typeof extra === 'string' ? extra : JSON.stringify(extra)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { } await sleep(150); } return null; }

// Firestore SDK الحقيقي + محاكاة حصة: __fsq=1 → كل العمليات resource-exhausted. __fsKill() يقتل المستمعين الحيّين بخطأ الحصة.
const wrapFs = `import * as R from '${FB}__real/firebase-firestore.js';
export * from '${FB}__real/firebase-firestore.js';
const hook = (db) => { try { R.connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) { } window.__db = db; return db; };
export function initializeFirestore(app, s, id) { return hook(R.initializeFirestore(app, s, id)); }
export function getFirestore(...a) { return hook(R.getFirestore(...a)); }
const Q = () => { try { return localStorage.getItem('__fsq') === '1'; } catch (e) { return false; } };
const qerr = () => new R.FirestoreError('resource-exhausted', 'Quota exceeded.');
const rej = () => Promise.reject(qerr());
window.__fsReal = { calls: 0 };
const HG = () => { try { return localStorage.getItem('__fshang') === '1'; } catch (e) { return false; } };
const W = (n) => (...a) => { window.__fsReal.calls++; if (HG() && /setDoc|updateDoc|deleteDoc/.test(n)) return new Promise(() => {}); return Q() ? rej() : R[n](...a); };
export const getDoc = W('getDoc'), getDocFromServer = W('getDocFromServer'), getDocs = W('getDocs'), setDoc = W('setDoc'),
  updateDoc = W('updateDoc'), deleteDoc = W('deleteDoc'), runTransaction = W('runTransaction'), getCountFromServer = W('getCountFromServer');
const live = new Set();
window.__fsKill = () => { localStorage.setItem('__fsq', '1'); live.forEach((l) => l.err && l.err(qerr())); live.clear(); };
export function onSnapshot(t, ...rest) {
  const fns = rest.filter((x) => typeof x === 'function'); const l = { err: fns[1] };
  if (Q()) { setTimeout(() => l.err && l.err(qerr()), 0); return () => {}; }
  const un = R.onSnapshot(t, ...rest); live.add(l);
  return () => { live.delete(l); un(); };
}`;
const wrapAuth = `import * as R from '${FB}__real/firebase-auth.js';
export * from '${FB}__real/firebase-auth.js';
export function getAuth(app) { const a = R.getAuth(app); if (!a.__emu) { R.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); a.__emu = 1; } window.__auth = a; window.__authM = R; return a; }`;
const wrapDb = `import * as R from '${FB}__real/firebase-database.js';
export * from '${FB}__real/firebase-database.js';
export function getDatabase(app, url) { const d = R.getDatabase(app, url); if (!d.__emu) { R.connectDatabaseEmulator(d, '127.0.0.1', 9000); d.__emu = 1; } return d; }`;

const browser = await chromium.launch();
async function newCtx(label) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com\/firebasejs)/, r => r.abort());
  await ctx.route(/windows-launch-campaign\//, r => r.abort()); // نافذة الحملة تحجب النقرات
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
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(label + ': ' + e.message); });
  page.on('dialog', d => d.accept());
  return { ctx, page };
}
const S = (page) => page.evaluate(() => ({ active: (document.querySelector('.page.active') || {}).id, user: !!(window.__auth && window.__auth.currentUser), uid: window.__auth && window.__auth.currentUser && window.__auth.currentUser.uid, uname: typeof currentUsername !== 'undefined' ? currentUsername : null, status: (document.getElementById('auth-status') || document.querySelector('#pg-auth .status-msg') || {}).textContent || '', mode: window.__fb && window.__fb.__failover && window.__fb.__failover.mode(), pending: window.__fb && window.__fb.__failover && window.__fb.__failover.pending() }));
async function open(page) { await page.goto(URL0); await page.waitForFunction(() => window.__auth && window.__fb && document.getElementById('auth-loader').classList.contains('hidden'), null, { timeout: 25000 }); await sleep(600); }
const setFlag = (page, k, on) => page.evaluate(([k, on]) => { if (on) localStorage.setItem(k, '1'); else localStorage.removeItem(k); }, [k, on]);
async function gotoAuth(page) { await page.evaluate(() => { if (typeof show === 'function') show('auth'); }); await sleep(200); }
async function signup(page, u, e, p) {
  await gotoAuth(page); await page.evaluate(() => authSwitchTab('signup'));
  await page.fill('#auth-signup-username', u); await page.fill('#auth-signup-email', e); await page.fill('#auth-signup-pass', p);
  await page.click('#auth-signup-btn');
}
async function login(page, id, p) { await gotoAuth(page); await page.evaluate(() => authSwitchTab('login')); await page.fill('#auth-login-id', id); await page.fill('#auth-login-pass', p); await page.click('#auth-login-btn'); }
async function logout(page) { await page.evaluate(async () => { await window.__authM.signOut(window.__auth); }); await until(async () => !(await S(page)).user); await sleep(400); }

await fsPut('gameBadges', 'cr', { badge: { stringValue: 'maintenance' } });
await fsPut('gameBadges', 'xo', { badge: { stringValue: 'new' } });
for (const [k, v] of [['cr', 'maintenance'], ['xo', 'new']]) await fetch(RT('fsMirror/gameBadges/' + k), { method: 'PUT', headers: adm, body: JSON.stringify({ badge: v }) });   /* نسخة RTDB موجودة أصلاً بالموقع الحي */
const OWNER = 'malshaifan1@gmail.com';
const stateOf = (page, tag) => page.evaluate((t) => ({ badge: (window.ownerBadgeState || (typeof ownerBadgeState !== 'undefined' ? ownerBadgeState : {}))[t] || null, mode: window.__fb.__failover.mode(), toast: (document.querySelector('.toast, #toast') || {}).textContent || '' }), tag);
const badgeOf = (page, tag) => page.evaluate((t) => { try { return ownerBadgeState[t] || 'none'; } catch (e) { return 'ERR ' + e.message; } }, tag);
const fsBadge = async (tag) => { const d = await rget('fsMirror/gameBadges/' + tag); return d && d.badge; };  /* الحالة تُحفظ على RTDB (rtdbPrimary) */
const rtBadge = async (tag) => { const d = await rget('fsMirror/gameBadges/' + tag); return d && d.badge; };

console.log('== مالك + زائر');
const O = await newCtx('owner'); await open(O.page);
await signup(O.page, 'owner_one', OWNER, '123456');
await until(async () => { const s = await S(O.page); return s.active === 'pg-home' ? s : null; }, 25000);
ok((await S(O.page)).user, 'دخل المالك');
const V = await newCtx('visitor'); await open(V.page);
// اشتراك الزائر في الشارات (يُشغَّل عادة عند فتح الصفحة الرئيسية)
await V.page.evaluate(() => { try { badgesSubscribe(); } catch (e) {} }); await sleep(1500);
ok(await badgeOf(V.page, 'cr') === 'maintenance', 'الزائر يرى cr = maintenance قبل التغيير', await badgeOf(V.page, 'cr'));
await O.page.evaluate(() => { try { badgesSubscribe(); } catch (e) {} }); await sleep(1500);
ok(await badgeOf(O.page, 'cr') === 'maintenance', 'المالك يرى cr = maintenance', await badgeOf(O.page, 'cr'));

async function change(label, tag, to) {
  const t0 = Date.now();
  const r = await O.page.evaluate(async ([tag, to]) => { const errs = []; const oe = window.onerror; const ot = window.toast; window.toast = (m) => { errs.push(String(m)); try { return ot && ot(m); } catch (e) {} }; await ownerSetBadge(tag, to); window.toast = ot; return errs; }, [tag, to]);
  const ms = Date.now() - t0;
  const fsV = await fsBadge(tag), rtV = await rtBadge(tag);
  const own = await badgeOf(O.page, tag);
  const vis = await until(async () => (await badgeOf(V.page, tag)) === to ? true : null, 20000);
  console.log('   ', label, JSON.stringify({ ms, toasts: r, firestore: fsV, rtdbMirror: rtV, ownerSees: own, visitorSees: await badgeOf(V.page, tag) }));
  return { ms, r, fsV, rtV, own, vis };
}
console.log('== 1) الوضع العادي: صيانة → تحديث جديد');
let c = await change('normal', 'cr', 'update');
ok(c.fsV === 'update', 'Firestore حُفظ', c); ok(c.own === 'update', 'المالك يرى القيمة'); ok(c.vis, 'الزائر يرى القيمة', c);

console.log('== 2) صيانة → ولا شيء');
c = await change('normal2', 'cr', 'none'); ok(c.fsV === 'none' && c.vis, 'حُفظ وظهر للزائر', c);

console.log('== 3) حصة Firestore منتهية (يرفض فوراً)');
await O.page.evaluate(() => window.__fsKill()); await V.page.evaluate(() => window.__fsKill()); await sleep(1500);
c = await change('quota', 'cr', 'update'); ok(c.rtV === 'update', 'كُتب على RTDB', c); ok(c.own === 'update', 'المالك يرى القيمة'); ok(c.vis, 'الزائر يرى القيمة', c);

console.log('== 4) Firestore يعلّق بلا رد');
await O.page.evaluate(() => { localStorage.removeItem('__fsq'); localStorage.setItem('__fshang', '1'); }); await V.page.evaluate(() => { localStorage.removeItem('__fsq'); });
await O.page.evaluate(() => { try { window.__fb.__failover.probe(); } catch (e) {} }); await sleep(1500);
c = await change('hang', 'cr', 'maintenance'); ok(c.rtV === 'maintenance' || c.fsV === 'maintenance', 'حُفظ بإحدى القاعدتين', c); ok(c.own === 'maintenance', 'المالك يرى القيمة'); ok(c.vis, 'الزائر يرى القيمة', c);

console.log('== 5) استوديو المالك (الواجهة الفعلية): نقر زر «تحديث جديد» لعبة cr ثم «ولا شيء»');
await O.page.evaluate(() => { localStorage.removeItem('__fshang'); localStorage.removeItem('__fsq'); });
await O.page.evaluate(() => { try { window.__fb.__failover.probe(); } catch (e) {} }); await sleep(2000);
await O.page.evaluate(() => { ownerOpenPanel(); });
const fh = await until(async () => { const h = await O.page.$('#owner-studio-frame'); return h ? await h.contentFrame() : null; }, 15000);
ok(fh, 'إطار الاستوديو فُتح');
if (fh) {
  await fh.evaluate(() => { location.hash = '#/games'; }); await sleep(1500);
  const clickBd = async (tag, k) => fh.evaluate(([tag, k]) => { const b = document.querySelector('[data-bd="' + tag + ':' + k + '"]'); if (!b) return 'NOBTN'; b.click(); return 'clicked'; }, [tag, k]);
  const r1 = await clickBd('cr', 'update'); await sleep(1500);
  console.log('    studio click update:', r1, 'firestore=', await fsBadge('cr'), 'rtdb=', await rtBadge('cr'), 'visitor=', await badgeOf(V.page, 'cr'));
  ok(r1 === 'clicked' && (await fsBadge('cr')) === 'update', 'نقر الاستوديو حفظ «update» في Firestore', { r1, fs: await fsBadge('cr') });
  ok(await until(async () => (await badgeOf(V.page, 'cr')) === 'update' ? true : null, 15000), 'الزائر يرى «update»');
  const r2 = await clickBd('cr', 'none'); await sleep(1500);
  ok((await fsBadge('cr')) === 'none', 'نقر «ولا شيء» حُفظ', { r2, fs: await fsBadge('cr') });
  ok(await until(async () => (await badgeOf(V.page, 'cr')) === 'none' ? true : null, 15000), 'الزائر يرى «none»');
  const r3 = await clickBd('roulette3d', 'update'); await sleep(1500);
  console.log('    roulette3d update:', r3, 'firestore=', await fsBadge('roulette3d'), 'rtdb=', await rtBadge('roulette3d'));
  ok((await fsBadge('roulette3d')) === 'update', 'roulette3d: حُفظ «update»', { r3, fs: await fsBadge('roulette3d') });
}

console.log('\nأخطاء الصفحات:', errors.slice(0, 5));
await browser.close(); console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`); process.exit(fail ? 1 : 0);
