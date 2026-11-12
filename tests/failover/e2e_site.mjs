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
const W = (n) => (...a) => { window.__fsReal.calls++; return Q() ? rej() : R[n](...a); };
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

// مستندات ابتدائية بـFirestore (مثل موقع شغّال فعلاً)
await fsPut('config', 'homeStats', { liveCount: { integerValue: '42' }, label: { stringValue: 'hello' } });
await fsPut('siteUpdates', 'current', { version: { stringValue: 'v9' } });

console.log('== 1) الوضع العادي: التسجيل ينكتب بـFirestore وينعكس على RTDB');
const A = await newCtx('A');
await open(A.page);
let st = await S(A.page);
ok(st.mode === 'firestore', 'الوضع الابتدائي firestore', st);
await signup(A.page, 'user_one', 'one@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'user_one' ? s : null; }, 25000);
ok(st, 'إنشاء الحساب ينجح بالوضع العادي', await S(A.page));
const uidA = (await S(A.page)).uid;
ok(await fsGet('usernames/user_one') && await fsGet('users/' + uidA), 'الحساب محفوظ بـFirestore');
ok(await until(async () => { const m = await rget('fsMirror/users/' + uidA); return m && m.username === 'user_one'; }, 6000), 'نسخة RTDB: users/uid (write-through)');
ok((await rget('fsMirror/usernames/user_one')) && (await rget('fsMirror/usernames/user_one')).uid === uidA, 'نسخة RTDB: usernames/user_one');
await open(A.page);
ok(await until(async () => { const m = await rget('fsMirror/config/homeStats'); return m && m.liveCount === 42; }, 8000), 'زرع تلقائي: config/homeStats انزرعت بالنسخة عند قراءة الموقع لها');

console.log('== 2) انتهاء الحصة أثناء تشغيل الصفحة (مستمعون حيّون + قراءات + كتابات)');
const seen = await A.page.evaluate(async () => {
  const fb = window.__fb; const out = {};
  out.before = (await fb.getDoc(fb.doc(fb.db, 'config', 'homeStats'))).data().liveCount;
  out.live = []; fb.onSnapshot(fb.doc(fb.db, 'config', 'homeStats'), (s) => out.live.push(s.data() && s.data().liveCount));
  await new Promise(r => setTimeout(r, 600));
  window.__fsKill();
  await new Promise(r => setTimeout(r, 800));
  out.mode = fb.__failover.mode();
  out.after = (await fb.getDoc(fb.doc(fb.db, 'config', 'homeStats'))).data().liveCount;
  await fb.updateDoc(fb.doc(fb.db, 'users', window.__auth.currentUser.uid), { points: fb.increment(8), bio: 'changed' });
  await new Promise(r => setTimeout(r, 600));
  out.afterWrite = (await fb.getDoc(fb.doc(fb.db, 'users', window.__auth.currentUser.uid))).data();
  out.liveLast = out.live[out.live.length - 1];
  out.pending = fb.__failover.pending();
  const col = await fb.getDocs(fb.collection(fb.db, 'siteUpdates'));
  out.col = col.docs.map(d => d.id);
  return out;
});
ok(seen.before === 42, 'قبل الانتهاء: قراءة Firestore', seen);
ok(seen.mode === 'rtdb', 'عند الانتهاء: الوضع صار rtdb تلقائياً', seen.mode);
ok(seen.after === 42, 'القراءة بعد الانتهاء تجي من النسخة بنفس القيمة', seen);
ok(seen.afterWrite && seen.afterWrite.points === 8 && seen.afterWrite.bio === 'changed' && seen.afterWrite.username === 'user_one', 'updateDoc + increment على مستند المستخدم يشتغل بوضع rtdb', seen.afterWrite);
ok(seen.liveLast === 42, 'المستمع الحي (onSnapshot) استمر بعد الانتهاء بدون خطأ', seen.live);
ok(seen.pending >= 1, 'الكتابة دخلت طابور الترحيل', seen.pending);
ok(seen.col.includes('current'), 'getDocs لمجموعة من النسخة');
ok((await rget('fsMirror/users/' + uidA)).points === 8, 'RTDB فيه القيمة المحدّثة');
ok(!((await fsGet('users/' + uidA)).fields.points), 'Firestore ما انكتب (الحصة منتهية)');

console.log('== 3) فتح الموقع من جديد والحصة منتهية (يوزر مسجّل)');
await open(A.page);
st = await S(A.page);
ok(st.user && st.uname === 'user_one' && st.mode === 'rtdb', 'الموقع يفتح ويبقى مسجّلاً والوضع rtdb من البداية', st);
ok(await A.page.evaluate(() => window.__fsReal.calls) <= 3, 'لا يضيّع طلبات على Firestore المنتهي (التخزين المحلي يحفظ الحالة)', await A.page.evaluate(() => window.__fsReal.calls));

console.log('== 4) دخول باليوزر + حساب جديد أثناء انتهاء الحصة');
await logout(A.page);
await login(A.page, 'user_one', '123456');
st = await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_one' && s.active !== 'pg-auth' ? s : null; }, 20000);
ok(st, 'تسجيل الدخول باليوزرنيم يشتغل والحصة منتهية (يوزر→uid→إيميل من النسخة)', await S(A.page));
await logout(A.page);
await signup(A.page, 'user_two', 'two@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_two' && s.active !== 'pg-auth' ? s : null; }, 25000);
ok(st, 'إنشاء حساب جديد والحصة منتهية يشتغل', await S(A.page));
const uidB = (await S(A.page)).uid;
ok(await fsGet('usernames/user_two') === null, 'Firestore ما فيه الحساب بعد (الحصة منتهية)');
const mB = await rget('fsMirror/users/' + uidB);
ok(mB && mB.username === 'user_two', 'الحساب محفوظ بالنسخة RTDB', mB);
ok((await rget('fsMirror/usernames/user_two') || {}).uid === uidB, 'اليوزر محجوز بالنسخة');
await logout(A.page);
await signup(A.page, 'USER_TWO', 'three@test.com', '123456');
await until(async () => /مستخدم من شخص/.test((await S(A.page)).status), 10000);
ok(/مستخدم من شخص/.test((await S(A.page)).status), 'يوزر مأخوذ (من النسخة) مرفوض وقت انتهاء الحصة', (await S(A.page)).status);

console.log('== 5) رجوع Firestore: الفحص التلقائي يرجّع الوضع ويرحّل الطابور');
await setFlag(A.page, '__fsq', false);
await login(A.page, 'user_two', '123456');
await until(async () => { const s = await S(A.page); return s.user && s.active !== 'pg-auth'; }, 20000);
const rec = await A.page.evaluate(async () => { const f = window.__fb.__failover; const pend = f.pending(); const r = await f.probe(); return { r, pend, mode: f.mode(), pending: f.pending() }; });
ok(rec.r === true && rec.mode === 'firestore', 'probe: رجع الوضع firestore', rec);
ok(rec.pending >= 1, 'عمليات مستخدم ثاني (user_one) تبقى بالطابور لحد ما يدخل بنفسه (قواعد Firestore)', rec);
const fsA = await until(async () => fsGet('usernames/user_two'), 6000);
ok(fsA && await fsGet('users/' + uidB), 'الحساب الجديد انرحّل إلى Firestore', fsA);
await logout(A.page);
await login(A.page, 'user_one', '123456');
await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_one' && s.active !== 'pg-auth'; }, 20000);
const rec2 = await A.page.evaluate(async () => { const f = window.__fb.__failover; await f.replayPending(); return f.pending(); });
ok(rec2 === 0, 'بعد دخول user_one ينرحّل طابوره ويفضى', rec2);
const hs = await fsGet('users/' + uidA);
ok(hs && hs.fields.points.integerValue === '8' && hs.fields.bio.stringValue === 'changed', 'تعديل users/uid (increment) انرحّل لـFirestore', hs && hs.fields);
await sleep(500);
await logout(A.page);
await login(A.page, 'user_two', '123456');
await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_two' && s.active !== 'pg-auth'; }, 20000);
await A.page.evaluate(async () => { const fb = window.__fb; await fb.setDoc(fb.doc(fb.db, 'users', window.__auth.currentUser.uid), { n: fb.increment(3) }, { merge: true }); });
ok(!!(await until(async () => { const d = await fsGet('users/' + uidB); return d && d.fields.n; }, 4000)), 'بعد الرجوع: الكتابة تذهب مباشرة لـFirestore');
ok(!!(await until(async () => ((await rget('fsMirror/users/' + uidB)) || {}).n === 3, 5000)), 'وتنعكس على النسخة (write-through)');

console.log('== 6) أخطاء الصفحة');
const realErrs = errors.filter(e => !/webgl/i.test(e)); // بيئة بدون WebGL
ok(realErrs.length === 0, 'لا أخطاء JavaScript بالصفحة', realErrs.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
