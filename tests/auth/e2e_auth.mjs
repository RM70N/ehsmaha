// اختبار حي لتسجيل الدخول/إنشاء الحساب في index.html ضد محاكي Firebase (Auth + Firestore + RTDB) بقواعد المستودع.
// التشغيل: من مجلد فيه firebase و firebase-tools (npm i firebase firebase-tools @firebase/rules-unit-testing) ونسخة من firestore.rules و database.rules.json:
//   firebase emulators:start --only auth,firestore,database --project streamgame-180b8   (بدون HTTP(S)_PROXY)
//   python3 -m http.server 8790 (من جذر المستودع)  ثم  node e2e_auth.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const URL0 = process.env.URL0 || 'http://127.0.0.1:8790/index.html';
const FB = 'https://www.gstatic.com/firebasejs/12.15.0/';
const NM = path.resolve('node_modules/firebase');
const PID = 'streamgame-180b8';
const NS = 'streamgame-180b8-default-rtdb';
const rtAdmin = { Authorization: 'Bearer owner' };
const RT = (p) => `http://127.0.0.1:9000/${p}.json?ns=${NS}`;
await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${NS}`, { method: 'PUT', headers: rtAdmin, body: fs.readFileSync('database.rules.json', 'utf8') }).then(r => { if (!r.ok) throw new Error('rtdb rules'); });
await fetch(RT(''), { method: 'DELETE', headers: rtAdmin });
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}/databases/(default)/documents`, { method: 'DELETE' });
await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PID}/accounts`, { method: 'DELETE' });
// قواعد Firestore من المستودع
await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PID}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: fs.readFileSync('firestore.rules', 'utf8') }] } }) }).then(r => { if (!r.ok) throw new Error('fs rules ' + r.status); });
const fsGet = async (p) => { const r = await fetch(`http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents/${p}`, { headers: { Authorization: 'Bearer owner' } }); return r.ok ? r.json() : null; };
const fsDel = async (p) => fetch(`http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents/${p}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
const authUsers = async () => { const r = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PID}/accounts:query`, { method: 'POST', headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' }, body: '{}' }); const j = await r.json(); return (j.userInfo || []); };
const rget = async (p) => (await fetch(RT(p), { headers: rtAdmin })).json();

let pass = 0, fail = 0; const errors = [];
const ok = (c, m, extra = '') => { if (c) { pass++; console.log('  ✔', m); } else { fail++; console.log('  ✘', m, typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 500)); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 10000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch (e) { } await sleep(150); } return null; }

// وصل SDK بالمحاكي + مفاتيح محاكاة: __qread (قراءة Firestore = resource-exhausted)، __qwrite (كتابة)، __offline (قراءة = unavailable)، __rtdown
const wrapFs = `import * as R from '${FB}__real/firebase-firestore.js';
export * from '${FB}__real/firebase-firestore.js';
const hook = (db) => { try { R.connectFirestoreEmulator(db, '127.0.0.1', 8080); } catch (e) { } window.__db = db; return db; };
export function initializeFirestore(app, s, id) { return hook(R.initializeFirestore(app, s, id)); }
export function getFirestore(...a) { return hook(R.getFirestore(...a)); }
const F = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
const qerr = () => new R.FirestoreError('resource-exhausted', 'Quota exceeded.');
const oerr = () => new R.FirestoreError('unavailable', 'Failed to get document because the client is offline.');
const rd = () => F('__qread') ? Promise.reject(qerr()) : (F('__offline') ? Promise.reject(oerr()) : null);
export function getDoc(...a) { return rd() || R.getDoc(...a); }
export function getDocFromServer(...a) { return rd() || R.getDocFromServer(...a); }
export function runTransaction(...a) { return (F('__qwrite') || F('__qread')) ? Promise.reject(qerr()) : (F('__txfail') ? Promise.reject(new R.FirestoreError('permission-denied', 'Missing or insufficient permissions.')) : R.runTransaction(...a)); }
export function setDoc(...a) { return F('__qwrite') ? Promise.reject(qerr()) : R.setDoc(...a); }
export function updateDoc(...a) { return F('__qwrite') ? Promise.reject(qerr()) : R.updateDoc(...a); }`;
const wrapDb = `import * as R from '${FB}__real/firebase-database.js';
export * from '${FB}__real/firebase-database.js';
export function getDatabase(app, url) { const d = R.getDatabase(app, url); if (!d.__emu) { R.connectDatabaseEmulator(d, '127.0.0.1', 9000); d.__emu = 1; } return d; }
const F = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
export function get(...a) { return F('__rtdown') ? Promise.reject(new Error('rtdb down')) : R.get(...a); }
export function set(...a) { return F('__rtdown') ? Promise.reject(new Error('rtdb down')) : R.set(...a); }`;
const wrapAuth = `import * as R from '${FB}__real/firebase-auth.js';
export * from '${FB}__real/firebase-auth.js';
export function getAuth(app) { const a = R.getAuth(app); if (!a.__emu) { R.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true }); a.__emu = 1; } window.__auth = a; window.__authM = R; return a; }`;

const browser = await chromium.launch();
async function newCtx(label, vp) {
  const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 860 }, locale: 'ar' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|www\.gstatic\.com\/firebasejs)/, r => r.abort());
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
const S = (page) => page.evaluate(() => ({ active: (document.querySelector('.page.active') || {}).id, user: !!(window.__auth && window.__auth.currentUser), uid: window.__auth && window.__auth.currentUser && window.__auth.currentUser.uid, uname: typeof currentUsername !== 'undefined' ? currentUsername : null, status: (document.getElementById('auth-status') || {}).textContent, cu: (document.getElementById('cu-status') || {}).textContent, loader: !document.getElementById('auth-loader').classList.contains('hidden') }));
async function open(page) { await page.goto(URL0); await page.waitForFunction(() => window.__auth && document.getElementById('auth-loader').classList.contains('hidden'), null, { timeout: 25000 }); await sleep(600); }
const setFlag = (page, k, on) => page.evaluate(([k, on]) => { if (on) localStorage.setItem(k, '1'); else localStorage.removeItem(k); }, [k, on]);
async function gotoAuth(page) { await page.evaluate(() => { if (typeof show === 'function') show('auth'); }); await sleep(200); }
async function signup(page, u, e, p) {
  await gotoAuth(page); await page.evaluate(() => authSwitchTab('signup'));
  await page.fill('#auth-signup-username', u); await page.fill('#auth-signup-email', e); await page.fill('#auth-signup-pass', p);
  await page.click('#auth-signup-btn');
}
async function login(page, id, p) { await gotoAuth(page); await page.evaluate(() => authSwitchTab('login')); await page.fill('#auth-login-id', id); await page.fill('#auth-login-pass', p); await page.click('#auth-login-btn'); }
async function logout(page) { await page.evaluate(async () => { await window.__authM.signOut(window.__auth); }); await until(async () => !(await S(page)).user); await sleep(400); }
async function google(page, sub, email) { await page.evaluate(async ([sub, email]) => { const M = window.__authM; await M.signInWithCredential(window.__auth, M.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true, name: 'G ' + sub }))); }, [sub, email]); }

console.log('== 1) إنشاء حساب بالإيميل');
const A = await newCtx('A');
await open(A.page);
ok((await S(A.page)).active === 'pg-landing' && !(await S(A.page)).user, 'زائر جديد: صفحة الهبوط بلا دخول');
await A.page.evaluate(() => landingCtaClick()); await sleep(200);
ok((await S(A.page)).active === 'pg-auth', 'زر «ابدأ» يفتح صفحة الدخول');
// تحقق المدخلات
await signup(A.page, 'ab', 'x1@test.com', '123456'); await sleep(400);
ok(/3 و20/.test((await S(A.page)).status) || (await A.page.evaluate(() => !document.getElementById('auth-signup-username').checkValidity())), 'يوزر قصير مرفوض');
await signup(A.page, 'user_one', 'x@mailinator.com', '123456'); await sleep(400);
ok(/مؤقتة/.test((await S(A.page)).status), 'إيميل مؤقت مرفوض', (await S(A.page)).status);
await signup(A.page, 'user_one', 'one@test.com', '123456');
let st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'user_one' ? s : null; }, 20000);
ok(st, 'إنشاء الحساب ينقله للرئيسية باليوزر', await S(A.page));
const uidA = (await S(A.page)).uid;
ok(await fsGet('usernames/user_one') && await fsGet('users/' + uidA), 'usernames/users محفوظة في Firestore');
ok(await A.page.evaluate((u) => localStorage.getItem('ehsAuthUname:' + u), uidA) === 'user_one', 'اليوزر مخزّن محلياً للاحتياط');

console.log('== 2) إعادة فتح الموقع (جلسة باقية)');
await open(A.page);
st = await S(A.page);
ok(st.user && st.uname === 'user_one' && st.active === 'pg-landing', 'بعد إعادة التحميل: مسجّل دخول بنفس اليوزر', st);
await A.page.evaluate(() => landingCtaClick()); await sleep(200);
ok((await S(A.page)).active === 'pg-home', '«ابدأ» يوديه للرئيسية مباشرة');

console.log('== 3) حصة Firestore منتهية وقت فتح الموقع (السبب الرئيسي للطرد)');
await setFlag(A.page, '__qread', true); await setFlag(A.page, '__rtdown', true);
await open(A.page); await sleep(1500);
st = await S(A.page);
ok(st.user && st.uname === 'user_one', 'لا طرد: يبقى مسجّلاً بيوزره المحفوظ', st);
ok((await authUsers()).some(u => u.localId === uidA), 'الحساب لم يُحذف من Auth');
await setFlag(A.page, '__qread', false); await setFlag(A.page, '__rtdown', false);
await setFlag(A.page, '__offline', true);
await open(A.page); await sleep(1500);
st = await S(A.page);
ok(st.user && st.uname === 'user_one' && (await authUsers()).some(u => u.localId === uidA), 'انقطاع الشبكة (unavailable): لا طرد ولا حذف', st);
await setFlag(A.page, '__offline', false);
// بدون كاش محلي (متصفح جديد/مسح البيانات) + الحصة منتهية → رسالة وإعادة محاولة، ثم يدخل تلقائياً
await A.page.evaluate((u) => localStorage.removeItem('ehsAuthUname:' + u), uidA);
await A.page.evaluate(async () => { try { await window.__authM.updateProfile(window.__auth.currentUser, { displayName: '' }); } catch (e) {} });
await setFlag(A.page, '__qread', true); await setFlag(A.page, '__rtdown', true);
await open(A.page); await sleep(1200);
st = await S(A.page);
ok(st.user && st.active === 'pg-auth' && /نعيد المحاولة/.test(st.status), 'بلا كاش والخادم لا يرد: رسالة «نعيد المحاولة» وهو ما زال مسجّلاً', st);
await setFlag(A.page, '__qread', false); await setFlag(A.page, '__rtdown', false);
st = await until(async () => { const s = await S(A.page); return s.uname === 'user_one' && s.active === 'pg-landing' ? s : null; }, 15000);
ok(st, 'بعد رجوع الخادم: يدخل تلقائياً بدون تسجيل دخول جديد', await S(A.page));

console.log('== 4) تسجيل الخروج والدخول');
await logout(A.page);
ok((await S(A.page)).active === 'pg-landing', 'الخروج يرجع للهبوط');
await login(A.page, 'nouser_x', '123456');
await until(async () => /ما فيه حساب/.test((await S(A.page)).status), 8000);
ok(/ما فيه حساب/.test((await S(A.page)).status), 'يوزر غير موجود: رسالة صحيحة');
await login(A.page, 'user_one', 'wrongpass');
await until(async () => /غير صحيحة/.test((await S(A.page)).status), 8000);
ok(/غير صحيحة/.test((await S(A.page)).status), 'كلمة مرور خاطئة: رسالة صحيحة', (await S(A.page)).status);
await setFlag(A.page, '__qread', true); await setFlag(A.page, '__rtdown', true);
await login(A.page, 'user_one', '123456');
await until(async () => /مزدحم/.test((await S(A.page)).status), 8000);
ok(/مزدحم/.test((await S(A.page)).status) && !(await S(A.page)).user, 'الدخول باليوزر وقت الحصة منتهية: «الخادم مزدحم» (مو «ما فيه حساب»)', (await S(A.page)).status);
await setFlag(A.page, '__qread', false); await setFlag(A.page, '__rtdown', false);
await login(A.page, 'User_One', '123456');
st = await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_one' && s.active !== 'pg-auth' ? s : null; }, 15000);
ok(st, 'الدخول باليوزر (حروف كبيرة/صغيرة) ينجح ويدخل', await S(A.page));
await logout(A.page);
await login(A.page, 'one@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.user && s.uname === 'user_one' && s.active !== 'pg-auth' ? s : null; }, 15000);
ok(st, 'الدخول بالإيميل ينجح ويدخل', await S(A.page));
// دخول ثاني بنفس الحساب وهو مسجّل (بعد خطأ سابق) → يتوجّه رغم أن onAuthStateChanged لا يُعاد
await A.page.evaluate(() => show('auth')); await login(A.page, 'one@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-landing' && s.uname === 'user_one' ? s : null; }, 10000);
ok(st, 'تسجيل الدخول وهو مسجّل أصلاً بنفس الحساب ما يعلّق على صفحة الدخول', await S(A.page));

console.log('== 5) أخطاء إنشاء الحساب');
await logout(A.page);
await signup(A.page, 'USER_ONE', 'two@test.com', '123456');
await until(async () => /مستخدم من شخص/.test((await S(A.page)).status), 8000);
ok(/مستخدم من شخص/.test((await S(A.page)).status) && !(await S(A.page)).user, 'يوزر مأخوذ: رسالة ولا ينشئ حساب');
await signup(A.page, 'user_two', 'one@test.com', '123456');
await until(async () => /الإيميل مستخدم/.test((await S(A.page)).status), 8000);
ok(/الإيميل مستخدم/.test((await S(A.page)).status), 'إيميل مستخدم: رسالة صحيحة', (await S(A.page)).status);
ok(!(await fsGet('usernames/user_two')), 'لا يوزر يتيم محجوز بعد فشل الإيميل');
// الحصة منتهية وقت التسجيل → يتسجل بالاحتياطي RTDB ويدخل
await setFlag(A.page, '__qwrite', true);
await signup(A.page, 'quota_user', 'q@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'quota_user' ? s : null; }, 20000);
ok(st, 'الحصة منتهية وقت التسجيل: ينشأ الحساب بالاحتياطي ويدخل', await S(A.page));
const uidQ = (await S(A.page)).uid;
ok((await rget('pendingUsers/' + uidQ)) && (await rget('pendingUsers/' + uidQ)).username === 'quota_user', 'حُفظ في RTDB pendingUsers');
await setFlag(A.page, '__qwrite', false);
await open(A.page);
st = await until(async () => { const s = await S(A.page); return s.uname === 'quota_user' ? s : null; }, 10000);
ok(st, 'إعادة فتح: يدخل بيوزره من الاحتياطي', await S(A.page));
// فشل حفظ اليوزر تماماً → لا يُحذف الحساب، شاشة اختيار يوزر معبّأة، ثم «متابعة» تنجح
await logout(A.page);
await setFlag(A.page, '__txfail', true);
await signup(A.page, 'fail_user', 'f@test.com', '123456');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-choose-username' ? s : null; }, 20000);
ok(st && /تعذّر حفظ اليوزر|متابعة/.test(st.cu) && st.user, 'فشل حفظ اليوزر: الحساب يبقى + شاشة اختيار اليوزر مع رسالة', await S(A.page));
ok(await A.page.inputValue('#cu-username') === 'fail_user', 'اليوزر معبّأ تلقائياً');
const uidF = (await S(A.page)).uid;
ok((await authUsers()).some(u => u.localId === uidF), 'الحساب ما انحذف');
await setFlag(A.page, '__txfail', false);
await A.page.click('#cu-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'fail_user' ? s : null; }, 15000);
ok(st, '«متابعة» تحفظ اليوزر وتدخله', await S(A.page));
ok(await fsGet('usernames/fail_user') && await fsGet('users/' + uidF), 'محفوظ في Firestore');

console.log('== 6) حساب إيميل يتيم (بلا يوزر) يدخل');
await logout(A.page);
const orphan = await A.page.evaluate(async () => { const M = window.__authM; const c = await M.createUserWithEmailAndPassword(window.__auth, 'orph@test.com', '123456'); return c.user.uid; });
await sleep(1500);
st = await S(A.page);
ok(st.active === 'pg-choose-username' && st.user, 'حساب بلا يوزر: يُطلب منه اختيار يوزر (ما ينحذف)', st);
ok((await authUsers()).some(u => u.localId === orphan), 'الحساب اليتيم ما انحذف');
await A.page.fill('#cu-username', 'orph_user'); await A.page.click('#cu-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'orph_user' ? s : null; }, 15000);
ok(st, 'اختار يوزر ودخل', await S(A.page));
const ud = await fsGet('users/' + orphan);
ok(ud && ud.fields && ud.fields.provider && ud.fields.provider.stringValue === 'password', 'المزوّد محفوظ password (مو google)', ud && ud.fields);
await logout(A.page);
await login(A.page, 'orph_user', '123456');
st = await until(async () => { const s = await S(A.page); return s.user && s.uname === 'orph_user' && s.active !== 'pg-auth' ? s : null; }, 15000);
ok(st, 'يدخل لاحقاً باليوزر الجديد', await S(A.page));

console.log('== 7) Google');
await logout(A.page);
await google(A.page, 'g-100', 'g100@gmail.com');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-choose-username' ? s : null; }, 10000);
ok(st, 'أول دخول Google: شاشة اختيار اليوزر', await S(A.page));
await A.page.fill('#cu-username', 'a'); await A.page.click('#cu-btn'); await sleep(300);
ok((await S(A.page)).active === 'pg-choose-username', 'يوزر غير صالح يبقى بنفس الشاشة');
await A.page.fill('#cu-username', 'user_one'); await A.page.click('#cu-btn');
await until(async () => /مستخدم من شخص/.test((await S(A.page)).cu), 8000);
ok(/مستخدم من شخص/.test((await S(A.page)).cu), 'يوزر مأخوذ: رسالة');
ok(!(await A.page.evaluate(() => document.getElementById('cu-btn').disabled)), 'زر متابعة ما يعلّق');
await A.page.fill('#cu-username', 'google_guy'); await A.page.click('#cu-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'google_guy' ? s : null; }, 15000);
ok(st, 'اختيار يوزر جديد يدخله للرئيسية', await S(A.page));
const uidG = (await S(A.page)).uid;
const gd = await fsGet('users/' + uidG);
ok(gd && gd.fields.provider.stringValue === 'google' && gd.fields.username.stringValue === 'google_guy', 'users محفوظ بـ google', gd && gd.fields);
await open(A.page);
st = await until(async () => { const s = await S(A.page); return s.uname === 'google_guy' ? s : null; }, 10000);
ok(st && st.active === 'pg-landing', 'إعادة فتح: مسجّل بيوزره (بلا اختيار يوزر مرة ثانية)', await S(A.page));
await setFlag(A.page, '__qread', true); await setFlag(A.page, '__rtdown', true);
await open(A.page); await sleep(1500);
st = await S(A.page);
ok(st.user && st.uname === 'google_guy' && st.active !== 'pg-choose-username', 'Google + الحصة منتهية: ما يطلب يوزر جديد ولا يُطرد', st);
await setFlag(A.page, '__qread', false); await setFlag(A.page, '__rtdown', false);
await logout(A.page);
await google(A.page, 'g-100', 'g100@gmail.com');
st = await until(async () => { const s = await S(A.page); return s.uname === 'google_guy' && s.active === 'pg-landing' ? s : null; }, 10000);
ok(st, 'خروج ثم Google مرة ثانية: يدخل مباشرة بيوزره', await S(A.page));
// مستند users مفقود لكن اليوزر محجوز له (حالة الانقطاع) → يقدر يختار نفس يوزره
await fsDel('users/' + uidG);
await open(A.page);
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-choose-username' ? s : null; }, 10000);
ok(st, 'مستند users مفقود: شاشة اختيار اليوزر', await S(A.page));
await A.page.fill('#cu-username', 'GOOGLE_guy'); await A.page.click('#cu-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'GOOGLE_guy' ? s : null; }, 15000);
ok(st, 'يقدر يختار نفس يوزره المحجوز له (ما يقول «مستخدم» ولا يرفض الحفظ)', await S(A.page));
// رجوع من شاشة اختيار اليوزر
await logout(A.page);
await google(A.page, 'g-200', 'g200@gmail.com');
await until(async () => (await S(A.page)).active === 'pg-choose-username', 10000);
await A.page.click('#pg-choose-username .auth-back-btn'); await sleep(800);
st = await S(A.page);
ok(!st.user && (st.active === 'pg-auth' || st.active === 'pg-landing'), 'رجوع من اختيار اليوزر يسجّل خروج', st);

console.log('== 8) زر Google: حالة النافذة المحجوبة → تحويل (redirect) بدون تعليق');
await A.page.evaluate(() => { window.__redir = 0; const f = fb; f.signInWithPopup = async () => { const e = new Error('blocked'); e.code = 'auth/popup-blocked'; throw e; }; f.signInWithRedirect = async () => { window.__redir++; }; });
await gotoAuth(A.page); await A.page.click('#auth-google-btn'); await sleep(500);
ok(await A.page.evaluate(() => window.__redir) === 1, 'نافذة محجوبة → ينتقل لتسجيل Google بالتحويل');
await A.page.evaluate(() => { fb.signInWithPopup = async () => { const e = new Error('x'); e.code = 'auth/unauthorized-domain'; throw e; }; });
await gotoAuth(A.page); await A.page.click('#auth-google-btn'); await sleep(400);
ok(/غير مصرّح/.test((await S(A.page)).status) && !(await A.page.evaluate(() => document.getElementById('auth-google-btn').disabled)), 'نطاق غير مصرّح: رسالة واضحة والزر يرجع يشتغل');
await A.page.evaluate(() => { fb.signInWithPopup = async (auth) => { const M = window.__authM; return M.signInWithCredential(auth, M.GoogleAuthProvider.credential(JSON.stringify({ sub: 'g-300', email: 'g300@gmail.com', email_verified: true }))); }; });
await A.page.click('#auth-google-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-choose-username' ? s : null; }, 10000);
ok(st, 'زر «الدخول عبر Google» (نجاح) → اختيار اليوزر', await S(A.page));
await A.page.fill('#cu-username', 'popup_user'); await A.page.click('#cu-btn');
st = await until(async () => { const s = await S(A.page); return s.active === 'pg-home' && s.uname === 'popup_user' ? s : null; }, 15000);
ok(st, 'ويكمل للرئيسية', await S(A.page));

console.log('== 9) تجديد التوكن (جلسة طويلة) لا يطرد');
await A.page.evaluate(async () => { await window.__auth.currentUser.getIdToken(true); }); await sleep(800);
st = await S(A.page);
ok(st.user && st.uname === 'popup_user', 'بعد تجديد التوكن: باقي مسجّل', st);

console.log('== 10) الجوال');
const M = await newCtx('M', { width: 390, height: 800 });
await open(M.page); await M.page.evaluate(() => { show('auth'); authSwitchTab('signup'); }); await sleep(300);
const mob = await M.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, btn: (() => { const r = document.getElementById('auth-signup-btn').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth + 1; })() }));
ok(mob.sw <= mob.cw + 2 && mob.btn, 'صفحة الدخول على الجوال بلا تمرير أفقي والأزرار ظاهرة', mob);
await M.page.screenshot({ path: '../auth_mob.png' });
await A.page.evaluate(() => { show('auth'); }); await A.page.screenshot({ path: '../auth_desk.png' });

console.log('\nأخطاء JS:', errors.length ? errors.slice(0, 8) : 'لا يوجد');
ok(errors.length === 0, 'لا أخطاء JS');
console.log(`\nRESULT ${pass}/${pass + fail}`);
await browser.close();
process.exit(fail ? 1 : 0);
