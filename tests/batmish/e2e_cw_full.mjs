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

const browser = await chromium.launch();
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



console.log('== CW) فحص شامل للعبة الدول');
const Z = await newCtx('Z');
await open(Z.page);
const E = (fn, arg) => Z.page.evaluate(fn, arg);
const CFG = { spinMinMs: 300, spinRandomMs: 100, turnTimerEnabled: false, timeoutKickEnabled: true, turnSeconds: 15, allianceEnabled: false, goldenCountryEnabled: false, endgameMultiplierEnabled: false, revivalEnabled: false };
async function setCfg(o) { await E((c) => { window.__cfg = c; window.modGetSetting = (g, k, d) => (g === 'countrywar' && k in window.__cfg) ? window.__cfg[k] : d; }, { ...CFG, ...o }); }
async function fresh(n, label, o) {
  await setCfg(o || {});
  await E(([n, label]) => { try { resetCountryWar(); } catch (e) {} cwParticipants.clear(); show('countrywar'); for (let i = 1; i <= n; i++) cwJoinParticipant({ uniqueId: label + i, nickname: 'لاعب' + i, isFollower: true, followKnown: true, followRole: 1 }); }, [n, label]);
}
const chat = (uid, text) => E(([uid, text]) => cwHandleEvent({ type: 'chat', comment: text, user: { uniqueId: uid, nickname: uid } }), [uid, text]);
const turn = () => until(() => E(() => cwGameStatus === 'active' && cwTurnUid && !cwSpinning ? cwTurnUid : null), 25000);
const st = () => E(() => ({ status: cwGameStatus, active: cwActiveCountries.map((c) => c.name), turn: cwTurnUid, parts: cwParticipants.size }));

// 1) الانتظار والانضمام
await E(() => { try { resetCountryWar(); } catch (e) {} cwParticipants.clear(); show('countrywar'); window.modGetSetting = (g, k, d) => d; });
ok((await st()).status === 'waiting', 'الحالة الابتدائية: انتظار');
await E(() => startCountryWarRound());
ok((await st()).status === 'waiting', 'ما يبدأ الراوند بأقل من مشاركين');
await E(() => { cwKeyword = 'انا'; });
await E(() => cwHandleEvent({ type: 'chat', comment: 'انا', user: { uniqueId: 'kw1', nickname: 'كلمة1', isFollower: true, followKnown: true, followRole: 1 } }));
await sleep(300);
ok((await st()).parts === 1, 'الانضمام بالكلمة المفتاحية عبر الشات يعمل');
await E(() => cwHandleEvent({ type: 'chat', comment: 'انا', user: { uniqueId: 'kw1', nickname: 'كلمة1', isFollower: true } }));
ok((await st()).parts === 1, 'الانضمام المكرر يُتجاهل');
ok((await E(() => document.getElementById('cw-p-count').textContent)) === '1', 'عدّاد المشاركين يتحدث');

// 2) راوند كامل بالأرقام والأسماء وضغطة الستريمر حتى الفوز
await fresh(5, 'f');
await E(() => startCountryWarRound());
let s0 = await st();
ok(s0.status === 'active' && s0.active.length === 5, 'بدء الراوند: 5 دول لـ5 لاعبين', s0);
const uniq = await E(() => new Set(cwActiveCountries.map((c) => c.name)).size === cwActiveCountries.length && new Set([...cwAssignments.values()]).size === 5);
ok(uniq, 'الدول مختلفة وكل لاعب له دولة سرية');
ok((await E(() => cwCountryNums.size)) === 5, 'أرقام الدول مُسندة (5)');
await E(() => spinCountryWarWheel());
let t = await turn(); ok(!!t, 'الروليت يختار صاحب دور');
await chat(t, '1'); await sleep(500);
ok((await st()).active.length === 4, 'إقصاء بالرقم 1');
t = await turn(); ok(!!t, 'اللف التلقائي بعد الإقصاء');
const nm = (await st()).active[0];
await chat(t, nm); await sleep(500);
ok((await st()).active.length === 3, 'إقصاء بالاسم');
t = await turn();
await E(() => { const c = document.querySelector('#cw-countries-grid .rd-ccard'); c.click(); }); await sleep(500);
ok((await st()).active.length === 2, 'إقصاء بضغطة الستريمر على بطاقة الدولة');
t = await turn();
const own = await E((t) => cwAssignments.get(t), t); const last = (await st()).active.find((x) => x !== own);
await chat(t, last); await sleep(2500);
const fin = await until(() => E(() => cwGameStatus === 'finished'), 8000);
ok(!!fin, 'الراوند ينتهي عند بقاء دولة واحدة');
const wn = await E(() => { const w = document.getElementById('cw-w-name') || document.querySelector('[id*="cw"][id*="name"]'); return w ? w.textContent : null; });
ok(await E(() => cwActiveCountries.length === 1), 'تبقى دولة واحدة فائزة', wn);

// 3) إقصاء ذاتي + دولة غير موجودة + غير صاحب الدور
await fresh(4, 'g'); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
t = await turn();
const other = t === 'g1' ? 'g2' : 'g1';
await chat(other, '1'); await chat(t, 'دولة_غير_موجودة'); await chat(t, '77'); await sleep(300);
ok((await st()).active.length === 4, 'غير صاحب الدور/دولة مجهولة/رقم خارج النطاق: لا إقصاء');
const own2 = await E((t) => cwAssignments.get(t), t); await chat(t, own2); await sleep(500);
ok((await st()).active.length === 3, 'صاحب الدور يقدر يقصي دولته نفسه');

// 4) انضمام وسط الراوند
await E(() => cwJoinParticipant({ uniqueId: 'late1', nickname: 'متأخر', isFollower: true, followKnown: true, followRole: 1 }));
await sleep(300);
const late = await E(() => ({ has: cwAssignments.has('late1'), n: cwActiveCountries.length, nums: cwCountryNums.size }));
ok(late.has && late.n >= 3, 'لاعب متأخر ياخذ دولة سرية وسط الراوند', late);
// 5) طرد لاعب
const act0 = (await st()).active.length;
await E(() => cwKickParticipant('late1')); await sleep(400);
ok((await st()).active.length === act0 - 1, 'طرد لاعب يقصي دولته');
await E(() => cwJoinParticipant({ uniqueId: 'late1', nickname: 'متأخر', isFollower: true }));
ok(!(await E(() => cwActiveCountries.some((c) => c.uid === 'late1'))), 'المطرود لا يرجع بنفس الراوند');

// 6) التحالف
await fresh(4, 'h', { allianceEnabled: true }); await E(() => { startCountryWarRound(); });
await E(() => { const a = cwActiveCountries; cwAlliancePair = [a[0].name, a[1].name]; spinCountryWarWheel(); });
let ta = await turn();
const pairOwner = await E(() => [cwActiveCountries[0].uid, cwActiveCountries[1].uid]);
// نجبر الدور لصاحب دولة حليفة ونحاول إقصاء الحليف
await E(([u0]) => { cwTurnUid = u0; }, pairOwner);
const partner = await E(() => cwAlliancePair[1]);
await chat(pairOwner[0], partner); await sleep(300);
ok(await E((p) => cwActiveCountries.some((c) => c.name === p), partner), 'التحالف: لا يقصي الحليف حليفه');

// 7) الدولة الذهبية
await fresh(4, 'i', { goldenCountryEnabled: true }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ta = await turn();
const gold = await E(() => cwGoldenCountryName);
ok(!!gold, 'دولة ذهبية مُحدَّدة', gold);
if (gold) {
  await chat(ta, gold); await sleep(400);
  ok(await E((g) => cwActiveCountries.some((c) => c.name === g), gold), 'الذهبية تنجو من أول محاولة');
  ta = await turn(); if (ta) { await chat(ta, gold); await sleep(500); ok(!(await E((g) => cwActiveCountries.some((c) => c.name === g), gold)), 'وتُقصى في المحاولة الثانية'); }
}

// 8) القصي الثنائي
await fresh(4, 'j', { endgameMultiplierEnabled: true, endgameMultiplierChance: 100, endgameMultiplierFrom: 10 }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ta = await turn(); await sleep(300);
const armed = await E(() => cwDoubleElimArmed);
ok(armed, 'القصي الثنائي مُفعّل لصاحب الدور (فرصة 100%)');
if (armed) {
  await chat(ta, 'قصي الثنائي'); await sleep(200);
  const names = await E(() => cwActiveCountries.filter((c) => c.uid !== cwTurnUid).map((c) => c.name));
  await chat(ta, names[0]); await sleep(400); await chat(ta, names[1]); await sleep(600);
  ok((await st()).active.length === 2, 'القصي الثنائي: دولتان بنفس الدور');
}

// 9) المؤقت والطرد (3 أوضاع)
await fresh(4, 'k', { turnTimerEnabled: true, turnSeconds: 2, timeoutKickEnabled: true }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ta = await turn(); const nBefore = (await st()).parts;
await until(() => E((u) => !cwParticipants.has(u), ta), 9000);
ok(!(await E((u) => cwParticipants.has(u), ta)), 'مؤقت+طرد: من انتهى وقته يُطرد', await E((u) => ({ u, sec: cwTurnSeconds, kick: cwTimeoutKick, turn: cwTurnUid, st: cwGameStatus, part: [...cwParticipants.keys()], spin: cwSpinning }), ta));
await fresh(4, 'l', { turnTimerEnabled: true, turnSeconds: 2, timeoutKickEnabled: false }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ta = await turn(); await until(() => E((u) => cwTurnUid !== u, ta), 9000);
ok(await E((u) => cwParticipants.has(u), ta), 'مؤقت بدون طرد: يبقى اللاعب', await E((u) => ({ u, sec: cwTurnSeconds, kick: cwTimeoutKick, turn: cwTurnUid, st: cwGameStatus, part: [...cwParticipants.keys()] }), ta));
await fresh(4, 'm', { turnTimerEnabled: false }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ta = await turn(); await sleep(4000);
ok((await E((u) => cwTurnUid === u && cwParticipants.has(u), ta)), 'بدون مؤقت: لا ينتهي الدور');

// 10) الإنعاش (استدعاء مباشر بدون أخطاء) + ريست وراوند جديد
await fresh(4, 'n', { revivalEnabled: true }); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
await turn();
const gerr = await E(() => { try { cwHandleGift({ uniqueId: 'n1', nickname: 'لاعب1' }, 'Rose', 1); return null; } catch (e) { return String(e); } });
ok(!gerr, 'استقبال هدية (إنعاش) بدون أخطاء', gerr);
await E(() => { resetCountryWar(); }); await sleep(300);
const rs = await st(); ok(rs.status === 'waiting' && rs.active.length === 0, 'الريست يرجع اللعبة للانتظار', rs);
await fresh(3, 'o'); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
ok(!!(await turn()), 'راوند جديد بعد الريست يشتغل');
ok((await E(() => document.querySelectorAll('#cw-countries-grid .rd-cnum').length)) === 3, 'الأرقام تُعاد للراوند الجديد (3 دول)');

// 11) ريست أثناء مؤقتات معلّقة: لا فوز وهمي ولا لف قديم يتسرب للراوند الجديد
await fresh(2, 'p'); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
let tp = await turn(); const nameP = await E((t) => cwActiveCountries.find((c) => c.uid !== t).name, tp);
await chat(tp, nameP);                                  // آخر إقصاء → مؤقت الفوز 1.5 ث
await E(() => resetCountryWar());                         // ريست قبل ظهور الفائز
await sleep(2500);
const rp = await st(); ok(rp.status === 'waiting' && rp.active.length === 0, 'ريست قبل ظهور الفائز: لا فوز وهمي', rp);
await fresh(4, 'q'); await E(() => { startCountryWarRound(); spinCountryWarWheel(); });
await sleep(150); await E(() => resetCountryWar());       // ريست أثناء لف الروليت
await fresh(3, 'r'); await E(() => startCountryWarRound());
await sleep(2500);
const rq = await E(() => ({ turn: cwTurnUid, spin: cwSpinning, st: cwGameStatus }));
ok(rq.turn === null && !rq.spin && rq.st === 'active', 'لف قديم لا يتسرب لراوند جديد (لا دور بلا لف)', rq);

const real = errors.filter((e) => !/no webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JS طوال الفحص', real.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`);
await browser.close(); process.exit(fail ? 1 : 0);
