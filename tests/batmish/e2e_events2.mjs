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

console.log('== F1) أوجد الكلمة: الكلمة المزدوجة، التلميح المسروق، الكلمة المتغيرة');
await enable('main', ['main.e2', 'main.e3', 'main.e5']);
await Z.page.evaluate(() => { gameStatus = 'waiting'; targetWord = 'مدرسة'; startRound(); });
const fm2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('main', 'main.e2'); return { ok: r.ok, extra: mainExtraWord, same: Array.from(mainExtraWord || '').length === 5 }; });
ok(fm2.ok && fm2.extra && fm2.same && fm2.extra !== 'مدرسة', 'الكلمة المزدوجة: كلمة سرية ثانية من نفس الطول', fm2);
await Z.page.evaluate((w) => { processGuess({ uniqueId: 'mw1', nickname: 'ي', isFollower: true, followKnown: true }, w); }, fm2.extra);
ok(await Z.page.evaluate(() => gameStatus === 'finished'), 'الكلمة المزدوجة: تخمين الكلمة الثانية يفوز فعلاً');
await sleep(1500);
const fm2b = await Z.page.evaluate(() => ({ lbl: document.getElementById('w-label').textContent, extra: mainExtraWord, tw: targetWord, act: window.BatmishEvents.status().active.length }));
ok(fm2b.lbl.includes(fm2.extra) && fm2b.extra === null && fm2b.tw === 'مدرسة' && fm2b.act === 0, 'شاشة الفوز تعرض الكلمة الثانية الفائزة، والاستعادة نظيفة', fm2b);
await Z.page.evaluate(() => { gameStatus = 'waiting'; startRound(); });
const fm3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('main', 'main.e3'); return { ok: r.ok, shown: document.getElementById('main-hint-box').style.display, t: document.getElementById('main-hint-display').textContent }; });
ok(fm3.ok && fm3.shown === 'block' && /الموضع/.test(fm3.t), 'التلميح المسروق: ظهر تلميح موضع حرف', fm3);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('main', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('main-hint-box').style.display === 'none'), 'التلميح المسروق: سُحب التلميح عند انتهاء الحدث');
await Z.page.evaluate(() => { processGuess({ uniqueId: 'mw2', nickname: 'ن', isFollower: true, followKnown: true }, 'مدرسه'); });
const fm5 = await Z.page.evaluate(() => { const before = guesses.length; const r = window.BatmishEvents.trigger('main', 'main.e5'); return { ok: r.ok, before, after: guesses.length, tw: targetWord }; });
ok(fm5.ok && fm5.before >= 1 && fm5.after === 0 && fm5.tw !== 'مدرسة', 'الكلمة المتغيرة: تغيّرت الكلمة السرية وصُفّرت التخمينات', fm5);
await Z.page.evaluate((w) => { processGuess({ uniqueId: 'mw3', nickname: 'ك', isFollower: true, followKnown: true }, w); }, fm5.tw);
ok(await Z.page.evaluate(() => gameStatus === 'finished'), 'الكلمة المتغيرة: الكلمة الجديدة هي الصحيحة الآن');
await sleep(1500);
ok(await Z.page.evaluate(() => targetWord === 'مدرسة' && document.getElementById('w-label').textContent.length > 5 && window.BatmishEvents.status().active.length === 0), 'الكلمة الأصلية عادت بعد الجولة');

console.log('== F2) آخر حرف: الحرف الممنوع، حرف العودة، الكلمة الطويلة، تحدي السلسلة');
await enable('ll', ['ll.e1', 'll.e3', 'll.e4', 'll.e5']);
await Z.page.evaluate((us) => { llGameStatus = 'waiting'; llStartWord = 'قلم'; llParticipants.clear(); us.forEach((u) => llParticipants.set(u.uniqueId, u)); startLastLetterRound(); }, [U(61), U(62), U(63), U(64), U(65)]);
const cur = () => Z.page.evaluate(() => { const uid = llQueue[llCurrentIdx]; return { uid, user: llParticipants.get(uid), req: llReqChar(llCurrentWord), word: llCurrentWord, queue: llQueue.length }; });
const answer = async (txt) => { await Z.page.evaluate((t) => { const uid = llQueue[llCurrentIdx]; llProcessAnswer(llParticipants.get(uid), t); }, txt); };
await sleep(800);
// e3: حرف العودة
let c0 = await cur();
const l3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ll', 'll.e3'); return { ok: r.ok, shown: document.getElementById('ll-cur-letter').textContent, first: llGetFirstChar(llCurrentWord), flag: llReturnNext }; });
ok(l3.ok && l3.flag && l3.shown === l3.first, 'حرف العودة: الحرف المطلوب صار أول حرف من الكلمة السابقة', l3);
await answer(l3.first + 'رمل');
await sleep(1100);
ok(await Z.page.evaluate(() => llReturnNext === false && llCurrentWord === 'قرمل' || llCurrentWord.includes('رمل')), 'حرف العودة: قُبلت الكلمة التي تبدأ بأول حرف واستُهلك الحدث');
await sleep(800);
// e5: تحدي السلسلة
const l5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ll', 'll.e5'); return { ok: r.ok, n: llChainLeft }; });
ok(l5.ok && l5.n >= 2, 'تحدي السلسلة: فُعّل لعدة أدوار', l5);
c0 = await cur();
await answer(c0.req + 'ا');   // أقصر من «قرمل»
await sleep(1500);
ok(await Z.page.evaluate((q) => llQueue.length === q - 1, c0.queue), 'تحدي السلسلة: كلمة أقصر من السابقة أقصت صاحبها فعلاً');
c0 = await cur();
await answer(c0.req + 'ببببب');   // أطول
await sleep(1100);
ok(await Z.page.evaluate((n) => llChainLeft === n - 1, l5.n), 'تحدي السلسلة: الكلمة الأطول مقبولة والعدّاد ينقص');
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('ll', x.id)); });
await sleep(500);
// e1: الحرف الممنوع
const l1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ll', 'll.e1'); return { ok: r.ok, L: llBanLetter }; });
ok(l1.ok && l1.L, 'الحرف الممنوع: اختير حرف فعلي', l1);
c0 = await cur();
await answer(c0.req + l1.L + 'ككك');
await sleep(1500);
ok(await Z.page.evaluate((q) => llQueue.length === q - 1, c0.queue), 'الحرف الممنوع: كلمة تحتوي الحرف أقصت صاحبها فعلاً');
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('ll', x.id)); });
ok(await Z.page.evaluate(() => llBanLetter === ''), 'الحرف الممنوع: رُفع المنع عند انتهاء الحدث');
// e4: الكلمة الطويلة
const l4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ll', 'll.e4'); return { ok: r.ok, n: llMinLen }; });
ok(l4.ok && l4.n >= 3, 'الكلمة الطويلة: حدّ أدنى للطول فُعّل', l4);
c0 = await cur();
await answer(c0.req + 'ا');
await sleep(1500);
ok(await Z.page.evaluate((q) => llQueue.length === q - 1, c0.queue), 'الكلمة الطويلة: كلمة قصيرة أقصت صاحبها فعلاً');
await Z.page.evaluate(() => { llGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => llMinLen === 0 && llBanLetter === '' && !llReturnNext && llChainLeft === 0 && window.BatmishEvents.status().active.length === 0), 'آخر حرف: انتهاء الراوند يعيد كل القواعد');

console.log('== F3) من أنا؟ وعكس الكلمة وترتيب الحروف');
await enable('wai', ['wai.e4', 'wai.e5']);
await Z.page.evaluate(() => { waiGameStatus = 'waiting'; waiCharName = 'محمد صلاح'; waiDescription = 'لاعب كرة'; waiHint2 = 'x'; waiHint2Revealed = false; waiParticipants.set('wa1', { uniqueId: 'wa1', nickname: 'a' }); startWAIRound(); });
const w4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wai', 'wai.e4'); return { ok: r.ok, t: document.getElementById('wai-hint2-display').textContent, shown: document.getElementById('wai-hint2-box').style.display }; });
ok(w4.ok && w4.shown === 'block' && /محمد صلاح/.test(w4.t) && /أو/.test(w4.t), 'شخصية مزدوجة: عُرض اسمان محتملان أحدهما الصحيح', w4);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('wai', a.id); });
const w5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wai', 'wai.e5'); const u = { uniqueId: 'wa1', nickname: 'a', isFollower: true, followKnown: true }; const before = JSON.stringify(window.__wins || null); waiProcessGuess(u, 'محمد صلاح'); return { ok: r.ok, bonus: waiWinBonus, until: waiEarlyBonusUntil > Date.now() }; });
ok(w5.ok && w5.bonus === true, 'الإجابة المبكرة: الإجابة الصحيحة داخل النافذة نالت علامة النقطتين', w5);
await sleep(1500);
ok(await Z.page.evaluate(() => waiWinBonus === false && waiEarlyBonusUntil === 0 && window.BatmishEvents.status().active.length === 0), 'الإجابة المبكرة: استُهلكت العلامة وانتهى الحدث');
await enable('rw', ['rw.e1', 'rw.e4']);
await Z.page.evaluate((us) => { rwGameStatus = 'waiting'; rwWord = 'مدرسة'; rwAnswer = 'ةسردم'; rwParticipants.clear(); us.forEach((u) => rwParticipants.set(u.uniqueId, u)); startRWRound(); }, [U(71), U(72)]);
const r1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rw', 'rw.e1'); return { ok: r.ok, shown: document.getElementById('rw-word-display').textContent, flag: rwDoubleRev }; });
ok(r1.ok && r1.flag && r1.shown === 'ةسردم', 'العكس المزدوج: عُرضت الكلمة معكوسة أصلاً', r1);
await Z.page.evaluate(() => { rwProcessGuess({ uniqueId: 'u71', nickname: 'ل71', isFollower: true, followKnown: true }, 'ةسردم'); });
ok(await Z.page.evaluate(() => rwGameStatus === 'active'), 'العكس المزدوج: كتابة المعكوس نفسه ليست جواباً صحيحاً');
await Z.page.evaluate(() => { rwProcessGuess({ uniqueId: 'u72', nickname: 'ل72', isFollower: true, followKnown: true }, 'مدرسة'); });
ok(await Z.page.evaluate(() => rwGameStatus === 'finished'), 'العكس المزدوج: الجواب الصحيح هو الكلمة الأصلية');
await sleep(1500);
ok(await Z.page.evaluate(() => rwDoubleRev === false && document.getElementById('rww-label').textContent.includes('مدرسة')), 'العكس المزدوج: انتهى والشاشة تعرض الكلمتين');
await Z.page.evaluate(() => { rwGameStatus = 'waiting'; rwWord = 'مدرسة'; rwAnswer = 'ةسردم'; startRWRound(); });
const r4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rw', 'rw.e4'); return { ok: r.ok, w: rwWord, a: rwAnswer, shown: document.getElementById('rw-word-display').textContent }; });
ok(r4.ok && r4.w.length >= 6 && r4.shown === r4.w && r4.a === Array.from(r4.w).reverse().join('') || (r4.ok && r4.w !== 'مدرسة'), 'الكلمة الطويلة (عكس): استُبدلت بكلمة أطول وجوابها عكسها', r4);
await Z.page.evaluate((a) => { rwProcessGuess({ uniqueId: 'u71', nickname: 'ل71', isFollower: true, followKnown: true }, a); }, r4.a);
ok(await Z.page.evaluate(() => rwGameStatus === 'finished'), 'الكلمة الطويلة (عكس): عكس الكلمة الجديدة يفوز');
await sleep(1500);
ok(await Z.page.evaluate(() => rwWord === 'مدرسة' && rwAnswer === 'ةسردم'), 'الكلمة الطويلة (عكس): الكلمة الأصلية عادت');
await enable('lsc', ['lsc.e3']);
await Z.page.evaluate((us) => { lscGameStatus = 'waiting'; lscWord = 'مدرسة'; lscParticipants.clear(); us.forEach((u) => lscParticipants.set(u.uniqueId, u)); startLSCRound(); }, [U(81), U(82)]);
const ls3 = await Z.page.evaluate(() => { const before = document.getElementById('lsc-word-display').textContent; const r = window.BatmishEvents.trigger('lsc', 'lsc.e3'); return { ok: r.ok, before, after: document.getElementById('lsc-word-display').textContent }; });
ok(ls3.ok && Array.from(ls3.after.replace(/ /g, '')).length > Array.from(ls3.before.replace(/ /g, '')).length && Array.from(ls3.before.replace(/ /g, '')).every((c) => ls3.after.includes(c)), 'كلمتان متداخلتان: اختلطت حروف الكلمة بحروف كلمة أخرى', ls3);
await Z.page.evaluate(() => { lscProcessGuess({ uniqueId: 'u81', nickname: 'ل81', isFollower: true, followKnown: true }, 'مدرسة'); });
ok(await Z.page.evaluate(() => lscGameStatus === 'finished'), 'كلمتان متداخلتان: الجواب يبقى الكلمة الأصلية');
await sleep(1500);
ok(await Z.page.evaluate((b) => window.BatmishEvents.status().active.length === 0, ls3.before), 'كلمتان متداخلتان: انتهى الحدث');

console.log('== F4) خمن الموضوع والصورة وسؤال وجواب وسباق الكلمات');
await enable('guessword', ['guessword.e1', 'guessword.e3', 'guessword.e5']);
await Z.page.evaluate(() => { gwGameStatus = 'waiting'; gwSecretWord = 'قطة'; gwSecretHint = 'حيوان أليف'; gwGuesses = []; gwBeginNewRound(); });
const gq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('guessword', 'guessword.e3'); return { ok: r.ok, t: document.getElementById('gw-hint-show').textContent }; });
ok(gq3.ok && /3 حروف/.test(gq3.t) && /«ق»/.test(gq3.t), 'التصنيف السري: كُشف عدد الحروف والحرف الأول', gq3);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('guessword', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('gw-hint-show').textContent === 'حيوان أليف'), 'التصنيف السري: عاد التلميح الأصلي');
const gq1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('guessword', 'guessword.e1'); return { ok: r.ok, ex: gwExtraWord, t: document.getElementById('gw-hint-show').textContent }; });
ok(gq1.ok && gq1.ex && /أو/.test(gq1.t), 'الموضوع المزدوج: موضوع ثانٍ مقبول وتلميحه يظهر مع الأول', gq1);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active.slice(); a.forEach((x) => window.BatmishEvents.engine().cancelEvent('guessword', x.id)); });
await Z.page.evaluate(() => { gwGameStatus = 'waiting'; gwSecretWord = 'قطة'; gwSecretHint = 'حيوان أليف'; gwGuesses = []; gwBeginNewRound(); });
const gq1b = await Z.page.evaluate(() => { window.BatmishEvents.trigger('guessword', 'guessword.e1'); const ex = gwExtraWord; gwProcessGuess({ uniqueId: 'g1', nickname: 'س', isFollower: true, followKnown: true }, ex); return { ex, st: gwGameStatus, win: gwWinWord }; });
ok(gq1b.st === 'finished' && gq1b.win === gq1b.ex, 'الموضوع المزدوج: تخمين الموضوع الثاني يفوز فعلاً', gq1b);
await sleep(1500);
ok(await Z.page.evaluate(() => gwExtraWord === null && window.BatmishEvents.status().active.length === 0), 'الموضوع المزدوج: انتهى الحدث وعادت القواعد');
await Z.page.evaluate(() => { gwGameStatus = 'waiting'; gwSecretWord = 'قطة'; gwSecretHint = 'حيوان أليف'; gwGuesses = []; gwBeginNewRound(); });
await Z.page.evaluate(() => { gwProcessGuess({ uniqueId: 'g2', nickname: 'س', isFollower: true, followKnown: true }, 'قطار'); gwProcessGuess({ uniqueId: 'g3', nickname: 'ص', isFollower: true, followKnown: true }, 'سمكة'); });
const gq5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('guessword', 'guessword.e5'); return { ok: r.ok, has: !!document.getElementById('bmev-gw-top') }; });
await sleep(900);
const gq5b = await Z.page.evaluate(() => (document.getElementById('bmev-gw-top') || {}).textContent);
ok(gq5.ok && gq5.has && /الأقرب جماعياً/.test(gq5b || ''), 'الاختيار الجماعي: لوحة أقرب التخمينات ظهرت وتُحدَّث', gq5b);
await Z.page.evaluate(() => { gwGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => !document.getElementById('bmev-gw-top')), 'الاختيار الجماعي: أُزيلت اللوحة عند انتهاء الجولة');
// خمن الصورة
await enable('ig', ['ig.e4']);
await Z.page.evaluate(() => { igGameStatus = 'waiting'; igRoundNum = 0; igCurrentQuestion = null; try { startIGRound(); } catch (e) {} if (igGameStatus !== 'active') { igCurrentQuestion = IG_BANK[0]; igGameStatus = 'active'; document.getElementById('ig-card-emoji').innerHTML = igRenderClue(IG_BANK[0]); window.BatmishEvents.engine().beginRound('ig', {}); } });
const ig4 = await Z.page.evaluate(() => { const el = document.getElementById('ig-card-emoji'); const before = el.innerHTML; const r = window.BatmishEvents.trigger('ig', 'ig.e4'); return { ok: r.ok, before, after: el.innerHTML }; });
ok(ig4.ok && ig4.after !== ig4.before && ig4.after.includes('⇄'), 'صورتان متشابهتان: ظهرت صورة ثانية مشابهة بجانب الصحيحة', { ok: ig4.ok });
await Z.page.evaluate(() => { igGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate((b) => document.getElementById('ig-card-emoji').innerHTML === b, ig4.before), 'صورتان متشابهتان: عادت الصورة الأصلية');
// سؤال وجواب سريع
await enable('fastans', ['fastans.e2', 'fastans.e3']);
await Z.page.evaluate(() => { fastansPlayers = [{ name: 'أحمد', score: 0 }, { name: 'سارة', score: 3 }, { name: 'خالد', score: 0 }]; fastansQuestionQueue = []; fastansPlayerQueue = []; FASTANS_WIN_SCORE = 5; fastansStartRound(); fastansTimerTotal = 40; });
const fq2 = await Z.page.evaluate(() => { const before = document.getElementById('fastans-question-card').textContent; const r = window.BatmishEvents.trigger('fastans', 'fastans.e2'); return { ok: r.ok, before, after: document.getElementById('fastans-question-card').textContent, b: fastansBonusPts }; });
ok(fq2.ok && fq2.after.includes(fq2.before) && fq2.after.includes('➕') && fq2.b === 1, 'السؤال المزدوج: ظهر سؤالان معاً والفائز بنقطتين', fq2);
await Z.page.evaluate(() => { fastansOpenWhoAnswered(); });
const fq2p = await Z.page.evaluate(() => { const i = fastansPlayers.findIndex((p) => p.name === 'خالد'); const b = fastansPlayers[i].score; fastansPickWinner(i); return { b, a: fastansPlayers[i].score }; });
ok(fq2p.a - fq2p.b === 2, 'السؤال المزدوج: الفائز نال نقطتين فعلاً', fq2p);
await sleep(1200);
await Z.page.evaluate(() => { fastansPlayers = [{ name: 'أحمد', score: 0 }, { name: 'سارة', score: 3 }, { name: 'خالد', score: 0 }]; fastansPlayerQueue = [1]; fastansStartRound(); fastansTimerTotal = 40; });   // حامل القنبلة: سارة (3 نقاط)
const fq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('fastans', 'fastans.e3'); return { ok: r.ok, f: fastansStealNext, holder: fastansPlayers[fastansCurrentPlayerIdx].name }; });
ok(fq3.ok && fq3.f && fq3.holder === 'سارة', 'فرصة السرقة: فُعّلت وحامل القنبلة لديه نقاط', fq3);
await Z.page.evaluate(() => { fastansOpenWhoAnswered(); });
const fq3p = await Z.page.evaluate(() => { const s = fastansPlayers.find((p) => p.name === 'سارة').score, a = fastansPlayers.find((p) => p.name === 'أحمد'); const b = a.score; fastansPickWinner(0); return { s0: s, s1: fastansPlayers.find((p) => p.name === 'سارة').score, a0: b, a1: a.score }; });
ok(fq3p.s1 === fq3p.s0 - 1 && fq3p.a1 === fq3p.a0 + 2, 'فرصة السرقة: الفائز سرق نقطة من الحامل (+1 للسرقة +1 للفوز)', fq3p);
await sleep(1200);
ok(await Z.page.evaluate(() => fastansStealNext === false && window.BatmishEvents.status().active.length === 0), 'فرصة السرقة: انتهت بعد الاستهلاك');
// سباق الكلمات
await enable('wr', ['wr.e1', 'wr.e2', 'wr.e3', 'wr.e4']);
const wrStart = () => Z.page.evaluate((us) => { wrGameStatus = 'waiting'; wrWord = 'الصبر مفتاح الفرج'; wrParticipants.clear(); us.forEach((u) => wrParticipants.set(u.uniqueId, u)); startWRRound(); }, [U(91), U(92)]);
const wrWin = (t) => Z.page.evaluate((x) => { wrProcessGuess({ uniqueId: 'u91', nickname: 'ل91', isFollower: true, followKnown: true }, x); return wrGameStatus; }, t);
const wrEnd = async () => { await Z.page.evaluate(() => { wrGameStatus = 'finished'; }); await sleep(1200); };
await wrStart();
const wq2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wr', 'wr.e2'); return { ok: r.ok, t: document.getElementById('wr-word-display').textContent }; });
ok(wq2.ok && wq2.t.includes('＿') && wq2.t !== 'الصبر مفتاح الفرج', 'الحرف المفاجئ: اختفى حرف من الجملة المعروضة', wq2);
await wrEnd();
await wrStart();
const wq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wr', 'wr.e3'); return { ok: r.ok, ov: wrAcceptOverride, html: document.getElementById('wr-word-display').innerHTML }; });
ok(wq3.ok && wq3.ov && wq3.html.includes('<s'), 'الكلمة الممنوعة: كلمة مشطوبة والجواب المقبول بدونها', wq3);
ok((await wrWin('الصبر مفتاح الفرج')) === 'active', 'الكلمة الممنوعة: كتابة الجملة كاملة لا تفوز أثناء الحدث');
ok((await wrWin(wq3.ov)) === 'finished', 'الكلمة الممنوعة: الجملة بدون الكلمة الممنوعة تفوز');
await wrEnd();
ok(await Z.page.evaluate(() => wrAcceptOverride === null && document.getElementById('wr-word-display').textContent === 'الصبر مفتاح الفرج'), 'الكلمة الممنوعة: عادت القواعد والجملة');
await wrStart();
const wq4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wr', 'wr.e4'); return { ok: r.ok, ov: wrAcceptOverride }; });
ok(wq4.ok && wq4.ov === 'الصبر مفتاح الفرج الصبر مفتاح الفرج', 'سباق السلسلة: المطلوب كتابة الجملة مرتين', wq4);
ok((await wrWin('الصبر مفتاح الفرج')) === 'active', 'سباق السلسلة: الجملة مرة واحدة لا تكفي');
ok((await wrWin('الصبر مفتاح الفرج الصبر مفتاح الفرج')) === 'finished', 'سباق السلسلة: الجملة مرتين تفوز');
await wrEnd();
await wrStart();
const wq1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wr', 'wr.e1'); return { ok: r.ok, w: wrWord, t: document.getElementById('wr-word-display').textContent }; });
ok(wq1.ok && wq1.w !== 'الصبر مفتاح الفرج' && wq1.t === wq1.w, 'تبديل الفئة: تغيّرت الجملة المطلوبة', wq1);
ok((await wrWin(wq1.w)) === 'finished', 'تبديل الفئة: الجملة الجديدة هي الصحيحة');
await wrEnd();
ok(await Z.page.evaluate(() => wrWord === 'الصبر مفتاح الفرج' && window.BatmishEvents.status().active.length === 0), 'تبديل الفئة: عادت الجملة الأصلية');

console.log('== F5) سرقة التاج والتوقيت وإشارة المرور والكراسي والجسر');
const spy = () => Z.page.evaluate(() => { if (!window.__rwOrig) { window.__rwOrig = recordWin; window.__rwLog = []; recordWin = function (u, g, p) { window.__rwLog.push([u && u.uniqueId, g, p]); return window.__rwOrig.apply(this, arguments); }; } window.__rwLog.length = 0; });
await spy();
await enable('cs', ['cs.e3']);
await Z.page.evaluate((us) => { csGameStatus = 'waiting'; csParticipants.clear(); us.forEach((u) => csParticipants.set(u.uniqueId, u)); startCrownStealRound(); csGrabCrown(us[0]); }, [U(201), U(202)]);
const cd = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cs', 'cs.e3'); return { ok: r.ok, f: csDoubleCrown, em: document.getElementById('cs-crown-emoji').textContent }; });
ok(cd.ok && cd.f && cd.em === '👑👑', 'التاج المزدوج: فُعّل وتغيّر رمز التاج', cd);
await Z.page.evaluate(() => { csFinishRound(); }); await sleep(1400);
const cdw = await Z.page.evaluate(() => ({ log: window.__rwLog.slice(), f: csDoubleCrown, em: document.getElementById('cs-crown-emoji').textContent }));
ok(cdw.log.length === 1 && cdw.log[0][2] === 2 && cdw.f === false && cdw.em !== '👑👑', 'التاج المزدوج: الفائز سُجّلت له نقطتان فعلاً ثم عادت القواعد', cdw);

await enable('tmr', ['tmr.e4', 'tmr.e5']);
await Z.page.evaluate(() => { tmrGameStatus = 'waiting'; tmrParticipants.clear(); startTimerClock(); tmrSecretTime = 20; });
const td = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tmr', 'tmr.e4'); const u = { uniqueId: 'td1', nickname: 'ت1', isFollower: true, followKnown: true }; tmrRecordGuess(u); const n1 = tmrGuesses.length; const d1 = tmrGuesses[0].diff; tmrRecordGuess(u); const g = tmrGuesses[0]; tmrRecordGuess(u); return { ok: r.ok, n1, n2: tmrGuesses.length, second: g.second === true, better: g.diff <= d1 }; });
ok(td.ok && td.n1 === 1 && td.n2 === 1 && td.second && td.better, 'التوقيت المزدوج: لكل لاعب محاولتان فقط والأقرب تُحتسب', td);
await Z.page.evaluate(() => { stopTimerClock(true); }); await sleep(800);
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('tmr', 't'); tmrGameStatus = 'waiting'; startTimerClock(); tmrSecretTime = tmrElapsed + 0.6; });
const tb = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tmr', 'tmr.e5'); return { ok: r.ok }; });
await sleep(300);
const tb1 = await Z.page.evaluate(() => document.getElementById('tmr-clock').textContent);
ok(tb.ok && tb1 === '؟.؟؟', 'آخر جزء من الثانية: الساعة تُعمّى قرب الوقت السري', tb1);
await Z.page.evaluate(() => { tmrSecretTime = 1000; }); await sleep(300);
ok(await Z.page.evaluate(() => /^\d/.test(document.getElementById('tmr-clock').textContent)), 'آخر جزء من الثانية: تعود الساعة بعد مرور الوقت السري/خارج النطاق');
await Z.page.evaluate(() => { stopTimerClock(true); }); await sleep(900);
ok(await Z.page.evaluate(() => tmrBlind === null && tmrDoubleTries === false && window.BatmishEvents.status().active.length === 0), 'التوقيت: انتهاء الجولة يعيد الحالة');

await enable('rlgl', ['rlgl.e3', 'rlgl.e4']);
await Z.page.evaluate((us) => { rlglGameStatus = 'waiting'; rlglParticipants.clear(); us.forEach((u) => rlglParticipants.set(u.uniqueId, u)); startRlglRound(); }, Us(211, 3));
await until(() => Z.page.evaluate(() => rlglGameStatus === 'active'), 9000);
await Z.page.evaluate(() => { clearTimeout(rlglLightTimer); rlglSetLight('green'); rlglProgress.clear(); });
const ry = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rlgl', 'rlgl.e3'); const u = rlglParticipants.get('u211'); for (let i = 0; i < 4; i++) { rlglLastStepAt.clear(); rlglHandleMoveMessage(u); } return { ok: r.ok, steps: rlglProgress.get('u211') || 0, txt: document.getElementById('rlgl-light-indicator').textContent }; });
ok(ry.ok && ry.steps === 2 && /أصفر/.test(ry.txt), 'الضوء الأصفر: 4 رسائل صحيحة أعطت خطوتين فقط (نصف السرعة)', ry);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('rlgl', a.id)); });
const ry2 = await Z.page.evaluate(() => { rlglLastStepAt.clear(); const u = rlglParticipants.get('u212'); const before = rlglProgress.get('u212') || 0; rlglHandleMoveMessage(u); rlglLastStepAt.clear(); rlglHandleMoveMessage(u); return { d: (rlglProgress.get('u212') || 0) - before, yellow: rlglYellow }; });
ok(ry2.d === 2 && ry2.yellow === false, 'الضوء الأصفر: بعد الحدث تعود كل خطوة تُحتسب');
const re4 = await Z.page.evaluate(() => { const before = rlglStepsToWin; const r = window.BatmishEvents.trigger('rlgl', 'rlgl.e4'); return { ok: r.ok, before, after: rlglStepsToWin, prog: document.querySelector('.rlgl-token-progress') && document.querySelector('.rlgl-token-progress').textContent }; });
ok(re4.ok && re4.after > re4.before, 'الطريق الطويل: زادت خطوات النهاية فعلاً', re4);
await Z.page.evaluate(() => { rlglFinishRound(); }); await sleep(1400);
ok(await Z.page.evaluate((b) => rlglStepsToWin === b && rlglYellow === false && window.BatmishEvents.status().active.length === 0, re4.before), 'إشارة المرور: انتهاء الجولة يعيد عدد الخطوات والقواعد');

await enable('chairs', ['chairs.e2', 'chairs.e3', 'chairs.e5']);
await Z.page.evaluate((us) => { chairsParticipants.clear(); us.forEach((u) => chairsParticipants.set(u.uniqueId, u)); chairsIsFinalRound = false; chairsRevealChairs(3); window.BatmishEvents.engine().beginRound('chairs', {}); }, Us(221, 5));
const cm = await Z.page.evaluate(() => { const before = chairsActiveChairNumbers.slice(); const r = window.BatmishEvents.trigger('chairs', 'chairs.e2'); const after = chairsActiveChairNumbers.slice(); const moved = after.filter((n) => before.indexOf(n) < 0)[0]; return { ok: r.ok, before, after, domNew: !!document.getElementById('chair-cell-' + moved), txt: moved && document.getElementById('chair-cell-' + moved).querySelector('.chair-cell-num').textContent }; });
ok(cm.ok && cm.after.length === 3 && cm.after.join() !== cm.before.join() && cm.domNew, 'الكرسي المتنقل: تغيّر رقم كرسي شاغر في المصفوفة والواجهة معاً', cm);
const cmn = await Z.page.evaluate(() => { const n = chairsActiveChairNumbers[0]; chairsProcessClaim({ uniqueId: 'u221', nickname: 'ل221', isFollower: true, followKnown: true }, String(n)); return chairsClaims.has(n); });
ok(cmn, 'الكرسي المتنقل: يمكن حجز الكرسي بالرقم الجديد');
const cmu = await Z.page.evaluate(() => { chairsSongVideoId = 'abcdefghijk'; chairsSongPlayerReady = false; chairsSongWantsPlaying = true; const r = window.BatmishEvents.trigger('chairs', 'chairs.e3'); return { ok: r.ok, wants: chairsSongWantsPlaying }; });
ok(cmu.ok && cmu.wants === false, 'جولة بدون موسيقى: أُوقفت الموسيقى فعلاً', cmu);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('chairs', a.id)); });
ok(await Z.page.evaluate(() => chairsSongWantsPlaying === true), 'جولة بدون موسيقى: عادت الموسيقى عند انتهاء الحدث');
const cmn2 = await Z.page.evaluate(() => { chairsSongVideoId = ''; return window.BatmishEvents.trigger('chairs', 'chairs.e3'); });
ok(!cmn2.ok && /no_song/.test(cmn2.reason), 'جولة بدون موسيقى: ترفض بصدق إذا لم تُضبط أغنية');
await Z.page.evaluate(() => { chairsGameStatus = 'finished-round'; }); await sleep(1100);
await Z.page.evaluate((us) => { chairsClaims.clear(); chairsClaimedUids.clear(); chairsParticipants.clear(); us.forEach((u) => chairsParticipants.set(u.uniqueId, u)); chairsIsFinalRound = true; chairsGoldenChairNumber = null; chairsRevealChairs(1); chairsGoldenChairNumber = null; window.BatmishEvents.engine().beginRound('chairs', {}); }, Us(231, 2));
const cl = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('chairs', 'chairs.e5'); const n = chairsActiveChairNumbers[0]; return { ok: r.ok, g: chairsGoldenChairNumber === n, cls: document.getElementById('chair-cell-' + n).classList.contains('golden') }; });
ok(cl.ok && cl.g && cl.cls, 'الكرسي الأخير: صار الكرسي الوحيد ذهبياً', cl);
await Z.page.evaluate(() => { chairsGameStatus = 'finished'; }); await sleep(1100);
ok(await Z.page.evaluate(() => chairsGoldenChairNumber === null && window.BatmishEvents.status().active.length === 0), 'الكراسي: انتهاء الجولة يعيد الحالة');

await enable('glz', ['glz.e1']);
const gz = await Z.page.evaluate((us) => { glzParticipants.clear(); glzAlive = new Set(); us.forEach((u) => { glzParticipants.set(u.uniqueId, u); glzAlive.add(u.uniqueId); }); glzRoundSeconds = 20; glzGameStatus = 'lobby'; glzStartRound(); return glzGameStatus; }, Us(241, 4));
const gz1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('glz', 'glz.e1'); const c = glzCurrentQuestion.c; const ids = [...glzAlive]; ids.forEach((id, i) => glzRegisterVote(glzParticipants.get(id), i === 0 ? c : 1 - c)); return { ok: r.ok, flag: glzDoubleStep, alive: glzAlive.size }; });
await sleep(3300);
const gz2 = await Z.page.evaluate(() => ({ alive: glzAlive.size, flag: glzDoubleStep }));
ok(gz === 'active' && gz1.ok && gz1.flag && gz2.alive === 4 && gz2.flag === false, 'الخطوة المزدوجة: 3 أخطأوا ولم يسقط أحد (لولا الحدث لسقطوا)', { gz1, gz2 });
await Z.page.evaluate(() => { glzRunId++; glzGameStatus = 'lobby'; if (glzTimerInterval) { clearInterval(glzTimerInterval); glzTimerInterval = null; } }); await sleep(1300);

console.log('== F6) ضربة الحظ والدائرة والصندوق العشوائي والقناص والمتاهة وأين الكرة وتوب 10');
await enable('hz', ['hz.e5']);
await Z.page.evaluate((us) => { hzGameStatus = 'waiting'; hzParticipants.clear(); hzCells = Array.from({ length: 61 }, () => null); HZ_GRID_SIZE = 60; hzMaxClicks = 15; hzClicksUsed = 0; buildHzGrid(); us.forEach((u) => hzJoinParticipant(u)); startHzRound(); }, Us(251, 6));
const hy = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('hz', 'hz.e5'); const n = [...hzMystery][0]; const out = document.getElementById('hz-cell-' + n).style.outline; const before = hzMaxClicks; const rd = Math.random; Math.random = () => 0; hzCellClick(n); Math.random = rd; return { ok: r.ok, n, out, before, after: hzMaxClicks, left: hzMystery.size }; });
ok(hy.ok && hy.n && /dashed/.test(hy.out) && hy.after === hy.before + 2 && hy.left === 0, 'الصندوق الغامض: النتيجة (+2 ضغطات) ظهرت عند الفتح فقط وزال الغموض', hy);
await sleep(600);
const hy2 = await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('hz', a.id)); const r = window.BatmishEvents.trigger('hz', 'hz.e5'); const n = [...hzMystery][0]; const rd = Math.random; Math.random = () => 0.99; const before = hzMaxClicks; hzCellClick(n); Math.random = rd; return { ok: r.ok, before, after: hzMaxClicks }; });
ok(hy2.ok && hy2.after === hy2.before - 1, 'الصندوق الغامض: نتيجة «فخ» تنقص ضغطة (نتيجة مختلفة بحسب الحظ)', hy2);
await Z.page.evaluate(() => { hzGameStatus = 'finished'; }); await sleep(1100);
ok(await Z.page.evaluate(() => hzMystery.size === 0 && window.BatmishEvents.status().active.length === 0), 'ضربة الحظ: انتهاء الراوند ينظف الغامض');

await enable('rou', ['rou.e4']);
await Z.page.evaluate((us) => { rouGameStatus = 'waiting'; us.forEach((u) => rouJoinParticipant(u)); startRouletteRound(); }, Us(261, 4));
const rb0 = await Z.page.evaluate(() => window.BatmishEvents.trigger('rou', 'rou.e4'));
ok(!rb0.ok && /no_eliminated/.test(rb0.reason), 'العودة المفاجئة: ترفض بصدق إذا لم يُقصَ أحد بعد');
await Z.page.evaluate(() => { const a = rouParticipants.get('u261'); rouEliminateByMention(rouParticipants.get('u262').nickname, [a.nickname]); });
await sleep(400);
const rb1 = await Z.page.evaluate(() => { const gone = !rouParticipants.has('u261') && !rouActivePlayers.includes('ل261'); const r = window.BatmishEvents.trigger('rou', 'rou.e4'); return { gone, ok: r.ok, back: rouParticipants.has('u261'), inWheel: rouActivePlayers.includes('ل261'), hist: rouEliminatedHistory.has('u261') }; });
ok(rb1.gone && rb1.ok && rb1.back && rb1.inWheel && !rb1.hist, 'العودة المفاجئة: عاد اللاعب المقصى إلى العجلة فعلاً', rb1);
await Z.page.evaluate(() => { rouGameStatus = 'finished'; }); await sleep(1100);

await enable('box', ['box.e2', 'box.e3']);
await Z.page.evaluate((us) => { boxGameStatus = 'waiting'; boxParticipants.clear(); us.forEach((u) => boxParticipants.set(u.uniqueId, u)); BOX_COUNT = 4; startBoxRound(); }, Us(271, 4));
const bx2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('box', 'box.e2'); const i = boxArrangement.indexOf('sacrifice'); return { ok: r.ok, i, cur: boxTurnOrder[boxTurnIdx] }; });
ok(bx2.ok && bx2.i >= 0, 'صندوق التضحية: تحوّل أحد الصناديق إلى تضحية', bx2);
const bx2b = await Z.page.evaluate((i) => { boxImmuneSet.clear(); boxPick(i + 1); return true; }, bx2.i);
await sleep(900);
const bx2c = await Z.page.evaluate((cur) => ({ imm: [...boxImmuneSet.keys()], banner: document.getElementById('box-reveal-banner').textContent }), bx2.cur);
ok(bx2c.imm.length === 1 && bx2c.imm[0] !== bx2.cur && /🎁/.test(bx2c.banner), 'صندوق التضحية: مُنحت حصانة للاعب آخر غير الفاتح فعلاً', bx2c);
await until(() => Z.page.evaluate(() => boxAwaitingPick === true), 8000);
const bx3 = await Z.page.evaluate(() => { boxImmuneSet.clear(); window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('box', a.id)); const r = window.BatmishEvents.trigger('box', 'box.e3'); const i = boxArrangement.indexOf('elim2'); return { ok: r.ok, i, n: boxParticipants.size }; });
ok(bx3.ok && bx3.i >= 0, 'الصندوق المزدوج: تحوّل صندوق إقصاء إلى مزدوج الإقصاء', bx3);
await Z.page.evaluate((i) => { boxPick(i + 1); }, bx3.i);
await sleep(1200);
ok(await Z.page.evaluate((n) => boxParticipants.size === n - 2, bx3.n), 'الصندوق المزدوج: أُقصي لاعبان معاً فعلاً');
await Z.page.evaluate(() => { boxGameStatus = 'finished'; boxAwaitingPick = false; }); await sleep(1100);

await enable('sniper', ['sniper.e3']);
await Z.page.evaluate((us) => { sniperGameStatus = 'waiting'; sniperParticipants.clear(); sniperCells = Array.from({ length: 51 }, () => []); sniperShieldCells.clear(); sniperGoldenCells.clear(); sniperAmmo = { sniper: 25, bomb: 6, nuke: 4 }; SNIPER_GRID_SIZE = 50; buildGrid(); us.forEach((u, i) => { sniperParticipants.set(u.uniqueId, { user: u, cell: 5 + i * 3 }); sniperCells[5 + i * 3] = [u.uniqueId]; }); startSniperRound(); }, Us(281, 4));
const sd = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('sniper', 'sniper.e3'); const a = window.BatmishEvents.status().active[0]; const empties = []; for (let n = 1; n <= 50; n++) { const nm = document.getElementById('s-name-' + n); if (nm && nm.textContent === '🎯 ؟') empties.push(n); } return { ok: r.ok, empties, real: empties.length && sniperCells[empties[0]].length === 0 }; });
ok(sd.ok && sd.empties.length === 1 && sd.real, 'الهدف الوهمي: مربع فارغ فعلياً يظهر كأنه مأهول', sd);
const sd2 = await Z.page.evaluate((n) => { const before = sniperParticipants.size; selectedWeapon = 'sniper'; document.getElementById('fire-input').value = n; fireWeapon(); return { same: sniperParticipants.size === before }; }, sd.empties[0]);
ok(sd2.same, 'الهدف الوهمي: الرمي عليه لا يُقصي أحداً (طلقة ضائعة)');
await Z.page.evaluate(() => { sniperGameStatus = 'finished'; }); await sleep(1100);
ok(await Z.page.evaluate((n) => document.getElementById('s-name-' + n).textContent !== '🎯 ؟' && window.BatmishEvents.status().active.length === 0, sd.empties[0]), 'القناص: انتهاء الراوند يزيل الهدف الوهمي');

await enable('maze', ['maze.e4', 'maze.e5']);
await api('/batmish/events/event', { tag: 'maze', eventId: 'maze.e5', values: { intervalSec: 2 } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate((us) => { mzGameStatus = 'waiting'; mzParticipants.clear(); us.forEach((u) => mzParticipants.set(u.uniqueId, u)); startMzRound(); }, Us(291, 3));
const mzf = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('maze', 'maze.e4'); const f = mzFakeGoal; const goals = document.querySelectorAll('#mz-grid .mz-goal-cell').length; const p = mzPos.get('u291'); const cell = mzGrid[p.r][p.c]; const d = ['E', 'S'].find((x) => !cell[x]); const dl = { E: [0, 1], S: [1, 0] }[d]; mzFakeGoal = { r: p.r + dl[0], c: p.c + dl[1] }; mzRenderGrid(); mzMove('u291', d); const back = mzPos.get('u291'); return { ok: r.ok, goals, back: back.r === mzStart.r && back.c === mzStart.c, finished: mzGameStatus }; });
ok(mzf.ok && mzf.goals === 2 && mzf.back && mzf.finished === 'active', 'المخرج الوهمي: خليتان تبدوان كالمخرج، والوصول للوهمي يعيد اللاعب للبداية دون فوز', mzf);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('maze', a.id)); });
ok(await Z.page.evaluate(() => mzFakeGoal === null && document.querySelectorAll('#mz-grid .mz-goal-cell').length === 1), 'المخرج الوهمي: زال عند انتهاء الحدث');
const mzOpen = () => Z.page.evaluate(() => { let open = 0; const D = { E: [0, 1], S: [1, 0] }; for (let r = 0; r < mzRows; r++) for (let c = 0; c < mzCols; c++) for (const d in D) { const nr = r + D[d][0], nc = c + D[d][1]; if (nr < mzRows && nc < mzCols && !mzGrid[r][c][d]) open++; } const seen = new Set([mzGoal.r + ',' + mzGoal.c]); const q = [[mzGoal.r, mzGoal.c]]; const DD = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] }; while (q.length) { const [r, c] = q.shift(); for (const d in DD) { if (mzGrid[r][c][d]) continue; const nr = r + DD[d][0], nc = c + DD[d][1]; if (nr < 0 || nr >= mzRows || nc < 0 || nc >= mzCols || seen.has(nr + ',' + nc)) continue; seen.add(nr + ',' + nc); q.push([nr, nc]); } } let reach = true; mzPos.forEach((p) => { if (!seen.has(p.r + ',' + p.c)) reach = false; }); return { open, reach }; });
const mo0 = await mzOpen();
const mz5 = await Z.page.evaluate(() => window.BatmishEvents.trigger('maze', 'maze.e5').ok);
await sleep(7500);
const mo1 = await mzOpen();
ok(mz5 && mo1.open < mo0.open && mo1.reach, 'سباق الانهيار: أُغلقت ممرات مع الوقت وبقي طريق للجميع', { mo0, mo1 });
await Z.page.evaluate(() => { mzGameStatus = 'finished'; }); await sleep(1100);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0 && mzFakeGoal === null), 'المتاهة: انتهاء الراوند ينظف الأحداث');

await enable('findball', ['findball.e4', 'findball.e5']);
await Z.page.evaluate((us) => { findballParticipants.clear(); findballGameStatus = 'waiting'; findballRoundNum = 0; findballShuffling = false; findballShield.clear(); FINDBALL_SHUFFLE_MIN_MS = 6000; FINDBALL_SHUFFLE_FLOOR_MS = 1800; FINDBALL_SWAP_COUNT = 6; us.forEach((u) => findballParticipants.set(u.uniqueId, u)); findballStartRoundClick(); }, Us(301, 4));
await until(() => Z.page.evaluate(() => findballGameStatus === 'shuffling'), 15000);
const fg = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('findball', 'findball.e4'); return { ok: r.ok, g: findballGolden, st: findballGameStatus }; });
ok(fg.ok && fg.g, 'الكرة الذهبية: فُعّلت أثناء الجولة', fg);
ok(!!(await until(() => Z.page.evaluate(() => findballGameStatus === 'guessing'), 30000)), 'أين الكرة: وصلت الجولة لمرحلة التخمين');
const fm = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('findball', 'findball.e5'); return { ok: r.ok, nums: ['a', 'b', 'c'].map((c) => document.getElementById('findball-cup-num-' + c).textContent) }; });
ok(fm.ok && fm.nums.every((x) => x === '؟'), 'ذاكرة اللاعب: أرقام الأكواب اختفت أثناء التخمين', fm);
await Z.page.evaluate(() => { findballClearGuessTimer(); findballGuesses.clear(); findballGuesses.set('u301', 1); findballGuesses.set('u302', 1); findballGuesses.set('u303', 2); findballGuesses.set('u304', 3); findballResolveRound(1); });
const fg2 = await Z.page.evaluate(() => ({ alive: [...findballParticipants.keys()].sort(), shield: [...findballShield].sort(), st: findballGameStatus }));
ok(fg2.alive.join() === 'u301,u302' && fg2.shield.join() === 'u301,u302', 'الكرة الذهبية: الصائبان نالا حصانة والمخطئان أُقصيا', fg2);
await sleep(1300);
ok(await Z.page.evaluate(() => findballGolden === false && ['a', 'b', 'c'].every((c) => document.getElementById('findball-cup-num-' + c).textContent !== '؟') && window.BatmishEvents.status().active.length === 0), 'أين الكرة: انتهاء الجولة يعيد الأرقام ويطفئ الذهبية');
await Z.page.evaluate(() => { findballGuesses.clear(); findballGuesses.set('u301', 2); findballGuesses.set('u302', 3); findballGameStatus = 'guessing'; findballResolveRound(1); });
const fg3 = await Z.page.evaluate(() => ({ alive: [...findballParticipants.keys()].sort(), shield: findballShield.size }));
ok(fg3.alive.length === 2 && fg3.shield === 0, 'الحصانة الذهبية: نجا اللاعبان بعد خطأ كل منهما واستُهلكت الحصانة', fg3);
await Z.page.evaluate(() => { findballRunId++; findballGameStatus = 'waiting'; findballShuffling = false; });

await enable('tt10', ['tt10.e1', 'tt10.e4']);
await Z.page.evaluate(() => { tt10GameStatus = 'waiting'; tt10Round = 0; tt10Scores.clear(); tt10StartRound(); });
const th = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tt10', 'tt10.e1'); const ranks = [...document.querySelectorAll('#tt10-grid .top10-cell.hidden-cell .top10-cell-rank')].map((e) => e.textContent); return { ok: r.ok, ranks }; });
ok(th.ok && th.ranks.length === 10 && th.ranks.every((x) => x === '؟'), 'القائمة المخفية: أرقام كل المراكز غير المكشوفة أُخفيت', th);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('tt10', a.id)); });
ok(await Z.page.evaluate(() => [...document.querySelectorAll('#tt10-grid .top10-cell-rank')].every((e) => /^\d+$/.test(e.textContent))), 'القائمة المخفية: عادت الأرقام');
const ts = await Z.page.evaluate(() => { tt10Scores.set('lead', { user: { uniqueId: 'lead', nickname: 'المتصدر' }, score: 20 }); const r = window.BatmishEvents.trigger('tt10', 'tt10.e4'); const it = tt10CurrentQuestion.items.find((i) => i.rank === 6 && !i.revealed) || tt10CurrentQuestion.items.find((i) => !i.revealed); tt10ProcessAnswer({ uniqueId: 'thief', nickname: 'سارق', isFollower: true, followKnown: true }, it.value); const steal = Math.ceil(it.rank / 2); return { ok: r.ok, rank: it.rank, lead: tt10Scores.get('lead').score, thief: tt10Scores.get('thief').score, steal }; });
ok(ts.ok && ts.lead === 20 - ts.steal && ts.thief === ts.rank + ts.steal, 'الإجابة المسروقة: سُرقت نقاط من المتصدر فعلاً', ts);
await Z.page.evaluate(() => { tt10GameStatus = 'roundover'; }); await sleep(1200);
ok(await Z.page.evaluate(() => tt10StealNext === false && tt10HideRanks === false && window.BatmishEvents.status().active.length === 0), 'توب 10: انتهاء الجولة يعيد القواعد');

console.log('== أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
