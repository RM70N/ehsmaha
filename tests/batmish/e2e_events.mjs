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
await Z.page.click('#batmish-launch'); await Z.page.waitForSelector('#batmish-root.is-open'); await sleep(2200);
await Z.page.click('.bm-nav-item[data-nav="events"]'); await sleep(1200);
const center = await Z.page.evaluate(() => ({ cards: document.querySelectorAll('.bm-evgc').length, kpis: document.querySelectorAll('.bm-kpi').length, head: document.querySelector('.bm-pagehead h2').textContent, txt: document.querySelector('#bm-view').innerText }));
ok(center.cards === 31 && center.kpis >= 6 && /الأحداث الخاصة/.test(center.head), 'المركز: 31 بطاقة لعبة + مؤشرات', center);
ok(/155/.test(center.txt) && /لعبة التاج/.test(center.txt) && /فعالية الستريمر/.test(center.txt), 'يعرض 155 حدثاً ويذكر اللعبتين غير الموجودتين صراحة');
ok(!/[A-Za-z]{4,}/.test(await Z.page.evaluate(() => [...document.querySelectorAll('#bm-view button, #bm-view .bm-tag')].map((e) => e.innerText).join(' ').replace(/SPECIAL EVENTS|GAMES|CATALOG|WIRED|ENABLED|LIVE|RUNS/g, ''))), 'كل الأزرار والوسوم بالعربي');
await Z.page.screenshot({ path: SHOTS + '/ev-01-center.png' });

console.log('== E2) صفحة حرب الدول: 5 أحداث مربوطة، حفظ إعدادات حقيقي');
await Z.page.click('.bm-evgc:has-text("حرب الدول") [data-ev="open"]'); await sleep(900);
const gp = await Z.page.evaluate(() => ({ cards: document.querySelectorAll('.bm-evc[data-evid]').length, dim: document.querySelectorAll('.bm-evc.dim').length, h: document.querySelector('.bm-pagehead h2').textContent }));
ok(gp.cards === 5 && gp.dim === 0 && gp.h.includes('حرب الدول'), 'خمسة أحداث كلها مربوطة وقابلة للتفعيل', gp);
await Z.page.click('[data-evseg="mode"] button[data-val="random"]');
await Z.page.fill('[data-evg="minGapSec"]', '0'); await Z.page.fill('[data-evg="maxPerRound"]', '10');
await Z.page.click('[data-ev="save-game"]'); await sleep(900);
for (const id of ['cw.e1', 'cw.e2', 'cw.e3', 'cw.e4']) {
  const c = `.bm-evc[data-evid="${id}"]`;
  await Z.page.check(`${c} [data-evf="enabled"]`); await Z.page.fill(`${c} [data-evf="probability"]`, '100'); await Z.page.fill(`${c} [data-evf="fromSec"]`, '1'); await Z.page.fill(`${c} [data-evf="toSec"]`, '6');
  await Z.page.click(`${c} [data-ev="save-event"]`); await sleep(500);
}
const saved = await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + '/batmish/events/bootstrap', { headers: { Authorization: 'Bearer ' + t } }); return (await r.json()).state; });
ok(saved.games.cw.mode === 'random' && saved.games.cw.events['cw.e1'].enabled && saved.games.cw.events['cw.e4'].probability === 100 && saved.games.cw.maxPerRound === 10, 'الإعدادات محفوظة في الخادم', saved);
const bad = await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + '/batmish/events/event', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'bomb', eventId: 'bomb.e1', values: { enabled: true } }) }); return r.status; });
ok(bad === 200, 'الخادم يقبل تفعيل أي حدث من الـ155 (كلها مربوطة بمحركات ألعابها)');
await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); await fetch(Batmish.controller.relay() + '/batmish/events/event', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'bomb', eventId: 'bomb.e1', values: { enabled: false } }) }); });
await Z.page.click('[data-ev="back"]'); await sleep(500); await Z.page.click('.bm-evgc:has-text("القنبلة المتحركة") [data-ev="open"]'); await sleep(700);
const bomb = await Z.page.evaluate(() => ({ dim: document.querySelectorAll('.bm-evc.dim').length, toggles: document.querySelectorAll('.bm-evc[data-evid] [data-evf="enabled"]').length, txt: (document.querySelector('.bm-evc.dim') || { innerText: '' }).innerText }));
ok(bomb.dim === 0 && bomb.toggles === 5, 'القنبلة: الأحداث الخمسة كلها مربوطة وقابلة للتفعيل (5 مفاتيح تفعيل حقيقية)', bomb);

console.log('== E3) تشغيل فعلي داخل لعبة حرب الدول الحقيقية (عشوائي عبر المجدول المركزي)');
await Z.page.evaluate(async () => {
  await new Promise((r) => window.BatmishEvents.reload(r));
  for (let i = 1; i <= 5; i++) cwJoinParticipant({ uniqueId: 'p' + i, nickname: 'لاعب' + i, isFollower: true, followKnown: true, followRole: 1 });
  window.__rows = []; document.addEventListener('bmev:history', () => {});
});
await Z.page.evaluate(() => startCountryWarRound());
ok(await Z.page.evaluate(() => cwGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('cw')), 'بدء راوند حرب الدول يبدأ جولة أحداث لنفس اللعبة (hook فعلي)');
const fired = await until(() => Z.page.evaluate(() => (cwAlliancePair || cwGoldenCountryName) ? { pair: cwAlliancePair, golden: cwGoldenCountryName, goldenOn: cwGoldenCountryEnabled } : null), 12000);
ok(!!fired, 'المجدول المركزي شغّل حدثاً عشوائياً فغيّر حالة اللعبة الفعلية', fired);
ok(await Z.page.evaluate(() => !!document.querySelector('#bmev-host .bmev')), 'عُرض إعلان الحدث على شاشة اللعبة');
await Z.page.screenshot({ path: SHOTS + '/ev-02-live.png' });
await sleep(4000);
const st1 = await Z.page.evaluate(() => window.BatmishEvents.status());
ok(st1.stats.total >= 0 && st1.rounds.length === 1, 'الجولة نشطة والمحرك يتابعها', st1.stats);

console.log('== E4) كل حدث من الخمسة على حدة (تشغيل يدوي عبر خط التنفيذ الكامل)');
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('cw', 'test'); });
await Z.page.evaluate(() => { cwGameStatus = 'finished'; });
const reset = () => Z.page.evaluate(() => { cwGameStatus = 'idle'; cwAlliancePair = null; cwGoldenCountryName = null; cwGoldenCountrySaved = false; cwGoldenCountryEnabled = false; cwTurnUid = null; cwActiveCountries = []; cwEliminatedNames = new Set(); cwAssignments.clear(); cwKickedDuringRound.clear(); });
await reset();
await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); await fetch(Batmish.controller.relay() + '/batmish/events/game', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'cw', values: { mode: 'manual' } }) }); await fetch(Batmish.controller.relay() + '/batmish/events/event', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ tag: 'cw', eventId: 'cw.e5', values: { enabled: true, probability: 100, fromSec: 0, whenLeft: 4 } }) }); await new Promise((r) => window.BatmishEvents.reload(r)); });
await Z.page.evaluate(() => startCountryWarRound());
// e1 التحالف السري
let r1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cw', 'cw.e1'); return { ok: r.ok, reason: r.reason, status: cwGameStatus, rounds: window.BatmishEvents.status().rounds, pair: cwAlliancePair && cwAlliancePair.slice(), active: cwActiveCountries.map((c) => c.name) }; });
ok(r1.ok && r1.pair && r1.pair.length === 2 && r1.pair.every((n) => r1.active.includes(n)) && r1.pair[0] !== r1.pair[1], 'التحالف السري: ربط دولتين فعليتين مختلفتين', r1);
const blocked = await Z.page.evaluate(() => { const p = cwAlliancePair.slice(); const holder = cwActiveCountries.find((c) => c.name === p[0]).uid; cwTurnUid = holder; const before = cwActiveCountries.length; cwEliminateCountry(p[1], 'streamer'); return { same: cwActiveCountries.length === before }; });
ok(blocked.same, 'التحالف يمنع فعلياً إقصاء الحليف (منطق اللعبة الأصلي)');
await Z.page.evaluate(() => { cwTurnUid = null; window.BatmishEvents.engine().cancelEvent('cw', window.BatmishEvents.status().active.find((a) => a.eventId === 'cw.e1').id); });
ok(await Z.page.evaluate(() => cwAlliancePair === null), 'انتهاء الحدث يستعيد الحالة (التحالف أُزيل)');
// e2 الدولة الذهبية
let r2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cw', 'cw.e2'); return { ok: r.ok, name: cwGoldenCountryName, on: cwGoldenCountryEnabled }; });
ok(r2.ok && r2.name && r2.on, 'الدولة الذهبية: دولة محصّنة وتفعيل الحماية', r2);
const saved2 = await Z.page.evaluate(() => { const n = cwGoldenCountryName; const holder = cwActiveCountries.find((c) => c.name !== n).uid; cwTurnUid = holder; cwEliminateCountry(n, 'streamer'); return { still: cwActiveCountries.some((c) => c.name === n), savedFlag: cwGoldenCountrySaved }; });
ok(saved2.still && saved2.savedFlag, 'الدولة الذهبية تنجو فعلياً من أول محاولة إقصاء');
await Z.page.evaluate(() => { window.BatmishEvents.engine().tick(); });
await sleep(700);
ok(await Z.page.evaluate(() => cwGoldenCountryEnabled === false && !window.BatmishEvents.status().active.some((a) => a.eventId === 'cw.e2')), 'بعد استهلاك الحماية ينتهي الحدث وتعود الإعدادات الأصلية');
// e3 الانقلاب
await Z.page.evaluate(() => { cwTurnUid = cwActiveCountries[0].uid; cwSpinning = false; });
let r3 = await Z.page.evaluate(() => { const from = cwTurnUid; const r = window.BatmishEvents.trigger('cw', 'cw.e3'); return { ok: r.ok, from, to: cwTurnUid }; });
ok(r3.ok && r3.to && r3.to !== r3.from, 'الانقلاب: الدور انتقل فعلياً للاعب آخر حي', r3);
// e4 التهديد المزدوج
let r4 = await Z.page.evaluate(() => { cwTurnUid = cwActiveCountries[0].uid; cwDoubleElimEliminationsThisTurn = 0; cwDoubleElimActivated = false; const r = window.BatmishEvents.trigger('cw', 'cw.e4'); return { ok: r.ok, armed: cwDoubleElimArmed, act: cwDoubleElimActivated }; });
ok(r4.ok && r4.armed && r4.act, 'التهديد المزدوج: فُعِّل الإقصاء المزدوج لصاحب الدور', r4);
const two = await Z.page.evaluate(() => { const holder = cwTurnUid, n0 = cwActiveCountries.length; const t = cwActiveCountries.filter((c) => c.uid !== holder).map((c) => c.name); cwEliminateCountry(t[0], 'streamer'); const stillMine = cwTurnUid === holder; if (stillMine) cwEliminateCountry(t[1], 'streamer'); return { n0, n1: cwActiveCountries.length, stillMine }; });
ok(two.stillMine && two.n1 === two.n0 - 2, 'صاحب الدور قصى دولتين فعلاً بدور واحد', two);
await Z.page.evaluate(() => window.BatmishEvents.engine().tick()); await sleep(600);
ok(await Z.page.evaluate(() => !window.BatmishEvents.status().active.some((a) => a.eventId === 'cw.e4') && cwDoubleElimActivated === false), 'انتهى الحدث بانتهاء الدور وعادت الحالة');
// e5 الحرب الأخيرة (شرط: عدد الدول ≤ whenLeft)
const left = await Z.page.evaluate(() => cwActiveCountries.length); 
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('cw', 'test'); cwGameStatus = 'idle'; cwActiveCountries = []; });
await reset();
await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const H = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, B = Batmish.controller.relay(); for (const id of ['cw.e1', 'cw.e2', 'cw.e3', 'cw.e4']) await fetch(B + '/batmish/events/event', { method: 'POST', headers: H, body: JSON.stringify({ tag: 'cw', eventId: id, values: { enabled: false } }) }); await fetch(B + '/batmish/events/game', { method: 'POST', headers: H, body: JSON.stringify({ tag: 'cw', values: { mode: 'random' } }) }); await new Promise((r) => window.BatmishEvents.reload(r)); });
await Z.page.evaluate(() => { for (let i = 1; i <= 5; i++) cwJoinParticipant({ uniqueId: 'p' + i, nickname: 'لاعب' + i, isFollower: true, followKnown: true, followRole: 1 }); });
const prevSecs = await Z.page.evaluate(() => { startCountryWarRound(); return cwTurnSeconds; });
await sleep(1200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.every((a) => a.eventId !== 'cw.e5')), 'الحرب الأخيرة لا تظهر قبل تحقق الشرط (5 دول > 4)');
await Z.page.evaluate(() => { cwActiveCountries = cwActiveCountries.slice(0, 3); });
const r5 = await until(() => Z.page.evaluate(() => window.BatmishEvents.status().active.some((a) => a.eventId === 'cw.e5') ? { secs: cwTurnSeconds, en: cwDoubleElimEnabled, from: cwDoubleElimFrom } : null), 4000);
ok(r5 && r5.secs === 8 && r5.en && r5.from === 99, 'الحرب الأخيرة: ظهرت بعد تحقق الشرط وقلّصت وقت الدور وفعّلت الإقصاء المزدوج', r5);
await Z.page.evaluate(() => { cwGameStatus = 'finished'; });
await sleep(1500);
ok(await Z.page.evaluate((p) => cwTurnSeconds === p && cwDoubleElimEnabled === false && window.BatmishEvents.status().active.length === 0, prevSecs), 'انتهاء الجولة أثناء الحدث: أُلغي وعادت قيم اللعبة الأصلية');
await Z.page.evaluate(() => { cwGameStatus = 'idle'; });

console.log('== E4ب) لعبة التوقيت الحقيقية: ثلاثة أحداث مربوطة');
await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const H = { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, B = Batmish.controller.relay(); await fetch(B + '/batmish/events/game', { method: 'POST', headers: H, body: JSON.stringify({ tag: 'tmr', values: { mode: 'manual' } }) }); for (const id of ['tmr.e1', 'tmr.e2', 'tmr.e3']) await fetch(B + '/batmish/events/event', { method: 'POST', headers: H, body: JSON.stringify({ tag: 'tmr', eventId: id, values: { enabled: true } }) }); await new Promise((r) => window.BatmishEvents.reload(r)); });
await Z.page.evaluate(() => { tmrGameStatus = 'waiting'; startTimerClock(); });
ok(await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('tmr')), 'بدء جولة التوقيت يبدأ جولة أحداث (hook فعلي)');
const t1 = await Z.page.evaluate(async () => { const r = window.BatmishEvents.trigger('tmr', 'tmr.e1'); await new Promise((x) => setTimeout(x, 700)); const a = parseFloat(document.getElementById('tmr-clock').textContent); await new Promise((x) => setTimeout(x, 700)); const b = parseFloat(document.getElementById('tmr-clock').textContent); return { ok: r.ok, rev: tmrReverseClock, a, b }; });
ok(t1.ok && t1.rev && t1.a > 25 && t1.b < t1.a, 'الوقت المعكوس: الساعة صارت تنازلية فعلياً', t1);
const conf = await Z.page.evaluate(() => window.BatmishEvents.trigger('tmr', 'tmr.e3'));
ok(!conf.ok && /conflict/.test(conf.reason), 'التعارض: «الساعة المخفية» ترفض أثناء «الوقت المعكوس» (نفس مجموعة العرض) دون إيقاف الجولة', conf);
const t2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tmr', 'tmr.e2'); return { ok: r.ok, on: tmrGoldenZoneEnabled, s: tmrGoldenZoneStart, e: tmrGoldenZoneEnd, el: tmrElapsed }; });
ok(t2.ok && t2.on && t2.s > t2.el && Math.abs(t2.e - t2.s - 0.3) < 1e-6, 'المنطقة الذهبية: نافذة 0.3ث بالمستقبل', t2);
const win = await Z.page.evaluate(() => { tmrStartTime = performance.now() - (tmrGoldenZoneStart + 0.1) * 1000; tmrRecordGuess({ uniqueId: 'gold1', nickname: 'ذهبي', isFollower: true }); return { st: tmrGameStatus, golden: tmrGuesses.length && tmrGuesses[0].golden === true }; });
ok(win.st === 'stopped' && win.golden, 'الوقوف داخل المنطقة الذهبية يفوز فوراً (منطق اللعبة الأصلي)', win);
await sleep(1200);
ok(await Z.page.evaluate(() => tmrReverseClock === false && tmrGoldenZoneEnabled === false && window.BatmishEvents.status().active.length === 0), 'انتهاء الجولة: أُلغيت الأحداث وعادت المتغيرات الأصلية');
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('tmr', 'test'); tmrGameStatus = 'waiting'; startTimerClock(); });
const t3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tmr', 'tmr.e3'); return { ok: r.ok, vis: document.getElementById('tmr-clock').style.visibility }; });
ok(t3.ok && t3.vis === 'hidden', 'الساعة المخفية: اختفت الساعة', t3);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active.find((x) => x.eventId === 'tmr.e3'); window.BatmishEvents.engine().cancelEvent('tmr', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('tmr-clock').style.visibility === ''), 'إيقاف الحدث يعيد الساعة');
await Z.page.evaluate(() => { stopTimerClock(true); }); await sleep(700);

console.log('== E4ج) دفعة ألعاب جديدة: سرقة التاج، أوجد الكلمة، آخر حرف، دائرة الإقصاء');
const api = (path, body) => Z.page.evaluate(async ([p, b]) => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + p, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(b) }); return r.status; }, [path, body]);
const enable = async (tag, ids, extra = {}) => { await api('/batmish/events/game', { tag, values: { mode: 'manual' } }); for (const id of ids) await api('/batmish/events/event', { tag, eventId: id, values: { enabled: true, probability: 100, fromSec: 0, ...extra } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r))); };
const U = (i) => ({ uniqueId: 'u' + i, nickname: 'ل' + i, isFollower: true, followKnown: true, followRole: 1 });
// ---- سرقة التاج
await enable('cs', ['cs.e1', 'cs.e2', 'cs.e4', 'cs.e5']);
await Z.page.evaluate((us) => { csGameStatus = 'waiting'; us.forEach((u) => csParticipants.set(u.uniqueId, u)); startCrownStealRound(); csGrabCrown(us[0]); }, [U(1), U(2), U(3)]);
ok(await Z.page.evaluate(() => csGameStatus === 'active' && csHolderUid === 'u1' && window.BatmishEvents.status().rounds.includes('cs')), 'سرقة التاج: بدء الراوند الحقيقي يبدأ جولة أحداث');
let cs1 = await Z.page.evaluate(() => { const prev = CS_HOLD_DURATION; const r = window.BatmishEvents.trigger('cs', 'cs.e1'); return { ok: r.ok, prev, now: CS_HOLD_DURATION }; });
ok(cs1.ok && cs1.now < cs1.prev && cs1.now >= 2, 'التاج الساخن: قصّر مدة الحمل فعلياً', cs1);
let cs2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cs', 'cs.e2'); return { ok: r.ok, en: csImmunityEnabled, left: csImmuneUntil - performance.now() }; });
ok(cs2.ok && cs2.en && cs2.left > 4000, 'الحماية الملكية: حماية فعلية لحامل التاج', cs2);
await Z.page.evaluate(() => { csStealAttempts.set('u2', 2); csStealAttempts.set('u3', 1); });
let cs4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('cs', 'cs.e4'); return { ok: r.ok, size: csStealAttempts.size }; });
ok(cs4.ok && cs4.size === 0, 'المطاردة: صُفّرت محاولات السرقة للجميع', cs4);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('cs', x.id)); });
ok(await Z.page.evaluate((p) => CS_HOLD_DURATION === p.prev && csImmunityEnabled === false, cs1), 'انتهاء الأحداث يعيد مدة الحمل وحالة الحماية الأصلية');
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('cs', 'test'); csGameStatus = 'waiting'; });
for (const id of ['cs.e1', 'cs.e2', 'cs.e4']) await api('/batmish/events/event', { tag: 'cs', eventId: id, values: { enabled: false } });
await api('/batmish/events/game', { tag: 'cs', values: { mode: 'random' } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate(() => { startCrownStealRound(); csGrabCrown(csParticipants.get('u1')); });
await Z.page.evaluate(() => { csStartTime = performance.now() - CS_HOLD_DURATION * 1000 * 0.8; });
const cs5 = await until(() => Z.page.evaluate(() => window.BatmishEvents.status().active.find((a) => a.eventId === 'cs.e5') ? CS_HOLD_DURATION : null), 3000);
ok(cs5 && cs5 > cs1.prev, 'العرش الأخير: ظهر بعد 70% من مدة الحمل ومدّد الوقت (فرصة أخيرة)', { cs5, prev: cs1.prev });
await Z.page.evaluate(() => { csGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate((p) => window.BatmishEvents.status().active.length === 0 && CS_HOLD_DURATION === p.prev, cs1), 'انتهاء الجولة يلغي الحدث ويعيد المدة الأصلية');
// ---- أوجد الكلمة
await enable('main', ['main.e1', 'main.e4']);
await Z.page.evaluate(() => { gameStatus = 'waiting'; targetWord = 'مدرسة'; startRound(); });
ok(await Z.page.evaluate(() => gameStatus === 'active' && window.BatmishEvents.status().rounds.includes('main')), 'أوجد الكلمة: بدء الراوند يبدأ جولة أحداث');
const m1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('main', 'main.e1'); return { ok: r.ok, shown: document.getElementById('main-hint-box').style.display, txt: document.getElementById('main-hint-display').textContent }; });
ok(m1.ok && m1.shown === 'block' && /الموضع/.test(m1.txt), 'الحرف الذهبي: كُشف موضع حرف فعلياً بصندوق التلميح', m1);
const m4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('main', 'main.e4'); return { ok: r.ok, on: mainSpeedBonusEnabled }; });
ok(m4.ok && m4.on, 'سباق أول إجابة: مكافأة أول إجابة مفعّلة', m4);
await Z.page.evaluate(() => { gameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => mainSpeedBonusEnabled === false && window.BatmishEvents.status().active.length === 0), 'انتهاء الراوند يعيد المكافأة لوضعها الأصلي');
// ---- آخر حرف
await enable('ll', ['ll.e2']);
await Z.page.evaluate((us) => { llGameStatus = 'waiting'; us.forEach((u) => llParticipants.set(u.uniqueId, u)); startLastLetterRound(); }, [U(11), U(12), U(13)]);
ok(await Z.page.evaluate(() => llGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('ll')), 'آخر حرف: بدء الراوند يبدأ جولة أحداث');
const ll1 = await Z.page.evaluate(() => { const prev = LL_TURN_SECONDS; const r = window.BatmishEvents.trigger('ll', 'll.e2'); return { ok: r.ok, prev, now: LL_TURN_SECONDS, left: llSecondsLeft }; });
ok(ll1.ok && ll1.now < ll1.prev && ll1.left <= ll1.now, 'السرعة القصوى: قصّرت وقت الدور حالياً وللقادم', ll1);
await Z.page.evaluate(() => { llGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate((p) => LL_TURN_SECONDS === p.prev, ll1), 'انتهاء الراوند يعيد وقت الدور الأصلي');
// ---- دائرة الإقصاء
await enable('rou', ['rou.e1', 'rou.e2', 'rou.e3', 'rou.e5']);
await Z.page.evaluate((us) => { rouGameStatus = 'waiting'; us.forEach((u) => rouJoinParticipant(u)); startRouletteRound(); }, [U(21), U(22), U(23), U(24)]);
ok(await Z.page.evaluate(() => rouGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('rou')), 'دائرة الإقصاء: بدء الراوند يبدأ جولة أحداث');
const rq1 = await Z.page.evaluate(() => { const a = ROU_SPIN_MIN_MS; const r = window.BatmishEvents.trigger('rou', 'rou.e1'); return { ok: r.ok, a, b: ROU_SPIN_MIN_MS }; });
ok(rq1.ok && rq1.b < rq1.a, 'الدوران المجنون: سرّع الدوران فعلياً', rq1);
const rq2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rou', 'rou.e2'); return { ok: r.ok, f: rouForceDoubleElim }; });
ok(rq2.ok && rq2.f, 'الإقصاء المزدوج: اللفة القادمة مسلَّحة', rq2);
const rq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rou', 'rou.e3'); return { ok: r.ok, name: rouImmuneName, en: rouImmunityEnabled, act: rouActivePlayers.includes(rouImmuneName) }; });
ok(rq3.ok && rq3.name && rq3.en && rq3.act, 'منطقة النجاة: لاعب فعلي محصّن', rq3);
await Z.page.evaluate(() => { rouForceDoubleElim = false; }); await sleep(900);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('rou', x.id)); });
ok(await Z.page.evaluate((p) => ROU_SPIN_MIN_MS === p.a && rouImmunityEnabled === false && !rouForceDoubleElim, rq1), 'إيقاف الأحداث يعيد سرعة الدوران والحصانة');
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('rou', 'test'); rouGameStatus = 'waiting'; });
for (const id of ['rou.e1', 'rou.e2', 'rou.e3']) await api('/batmish/events/event', { tag: 'rou', eventId: id, values: { enabled: false } });
await api('/batmish/events/game', { tag: 'rou', values: { mode: 'random' } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate(() => { startRouletteRound(); });
await Z.page.evaluate(() => { rouActivePlayers = rouActivePlayers.slice(0, 3); });
const rq5 = await until(() => Z.page.evaluate(() => window.BatmishEvents.status().active.find((a) => a.eventId === 'rou.e5') ? { spin: ROU_SPIN_MIN_MS, f: rouForceDoubleElim } : null), 4000);
ok(rq5 && rq5.f && rq5.spin > rq1.a, 'اللفة الأخيرة: ظهرت عند بقاء 3 لاعبين وأبطأت الدوران وسلّحت الإقصاء المزدوج', rq5);
await Z.page.evaluate(() => { rouGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate((p) => ROU_SPIN_MIN_MS === p.a && !rouForceDoubleElim && window.BatmishEvents.status().active.length === 0, rq1), 'انتهاء الجولة: كل شيء عاد لحالته الأصلية');

console.log('== E4د) ألعاب الكلمات: من أنا؟، عكس الكلمة، ترتيب الحروف');
// ---- من أنا؟
await enable('wai', ['wai.e1', 'wai.e2', 'wai.e3'], { intervalSec: 3 });
await Z.page.evaluate(() => { waiGameStatus = 'waiting'; waiCharName = 'محمد صلاح'; waiDescription = 'لاعب كرة'; waiHint2 = 'يلعب رقم 11'; waiHint2Revealed = false; startWAIRound(); });
ok(await Z.page.evaluate(() => waiGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('wai')), 'من أنا؟: بدء الراوند يبدأ جولة أحداث');
const w1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wai', 'wai.e1'); return { ok: r.ok, shown: document.getElementById('wai-hint2-box').style.display, t: document.getElementById('wai-hint2-display').textContent }; });
ok(w1.ok && w1.shown === 'block' && /^الاسم: م/.test(w1.t) && /＿/.test(w1.t) && !/صلاح/.test(w1.t), 'التلميح المشفر: كُشف شكل الاسم (الحرف الأول فقط)', w1);
const w1c = await Z.page.evaluate(() => window.BatmishEvents.trigger('wai', 'wai.e3'));
ok(!w1c.ok && /conflict/.test(w1c.reason), 'التعارض: «تلميح الجمهور» ترفض أثناء «التلميح المشفر» (نفس مجموعة التلميحات)');
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('wai', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('wai-hint2-box').style.display === 'none'), 'إيقاف الحدث يخفي التلميح');
const w2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wai', 'wai.e2'); return { ok: r.ok, t: document.getElementById('wai-hint2-display').textContent }; });
await sleep(7600);
const w2b = await Z.page.evaluate(() => document.getElementById('wai-hint2-display').textContent);
ok(w2.ok && w2b.replace(/[ ＿]/g, '').length > w2.t.replace(/الاسم: /, '').replace(/[ ＿]/g, '').length, 'الكشف التدريجي: حروف جديدة تظهر مع الوقت', { first: w2.t, later: w2b });
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('wai', a.id); });
const w3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('wai', 'wai.e3'); return { ok: r.ok, t: document.getElementById('wai-hint2-display').textContent, rev: waiHint2Revealed }; });
ok(w3.ok && w3.t === 'يلعب رقم 11' && w3.rev, 'تلميح الجمهور: ظهر تلميح الستريمر فوراً', w3);
await Z.page.evaluate(() => { waiGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0 && waiHint2Revealed === false), 'انتهاء الراوند يعيد الحالة');
// ---- عكس الكلمة
await enable('rw', ['rw.e2', 'rw.e3', 'rw.e5']);
await Z.page.evaluate((us) => { rwGameStatus = 'waiting'; rwWord = 'مدرسة'; rwAnswer = 'ةسردم'; us.forEach((u) => rwParticipants.set(u.uniqueId, u)); startRWRound(); }, [U(31), U(32), U(33)]);
ok(await Z.page.evaluate(() => rwGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('rw')), 'عكس الكلمة: بدء الراوند يبدأ جولة أحداث');
const x2 = await Z.page.evaluate(() => { const before = document.getElementById('rw-word-display').textContent; const r = window.BatmishEvents.trigger('rw', 'rw.e2'); return { ok: r.ok, before, after: document.getElementById('rw-word-display').textContent }; });
ok(x2.ok && x2.before === 'مدرسة' && x2.after !== 'مدرسة' && Array.from(x2.after.replace(/ /g, '')).sort().join('') === Array.from('مدرسة').sort().join(''), 'حروف مشتتة: عُرضت نفس الحروف مبعثرة', x2);
const x3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rw', 'rw.e3'); return { ok: r.ok, on: rwSpeedBonusEnabled }; });
ok(x3.ok && x3.on, 'الوقت الذهبي: مكافأة السرعة مفعّلة', x3);
const x5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rw', 'rw.e5'); return { ok: r.ok, uid: rwLuckyUid, en: rwLuckyEnabled, member: rwParticipants.has(rwLuckyUid) }; });
ok(x5.ok && x5.uid && x5.en && x5.member, 'التحدي السري: لاعب فعلي حصل على محاولة إضافية', x5);
await Z.page.evaluate(() => { rwGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => rwSpeedBonusEnabled === false && rwLuckyUid === null && rwLuckyEnabled === false && document.getElementById('rw-word-display').textContent === 'مدرسة'), 'انتهاء الراوند يعيد الكلمة والمكافأة واللاعب المحظوظ');
// ---- ترتيب الحروف
await enable('lsc', ['lsc.e1', 'lsc.e2', 'lsc.e4', 'lsc.e5']);
await Z.page.evaluate((us) => { lscGameStatus = 'waiting'; lscWord = 'مدرسة'; us.forEach((u) => lscParticipants.set(u.uniqueId, u)); startLSCRound(); }, [U(41), U(42)]);
ok(await Z.page.evaluate(() => lscGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('lsc')), 'ترتيب الحروف: بدء الراوند يبدأ جولة أحداث');
const l1 = await Z.page.evaluate(() => { const before = document.getElementById('lsc-word-display').textContent; const r = window.BatmishEvents.trigger('lsc', 'lsc.e1'); return { ok: r.ok, before, after: document.getElementById('lsc-word-display').textContent }; });
ok(l1.ok && l1.after.includes('؟') && Array.from(l1.after).length === Array.from(l1.before).length, 'حرف مخفي: استُبدل حرف بعلامة استفهام', l1);
const l5c = await Z.page.evaluate(() => window.BatmishEvents.trigger('lsc', 'lsc.e5'));
ok(!l5c.ok && /conflict/.test(l5c.reason), 'التعارض: «الحرف الإضافي» ترفض أثناء «حرف مخفي» (نفس العرض)');
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('lsc', a.id); });
ok(await Z.page.evaluate((b) => document.getElementById('lsc-word-display').textContent === b, l1.before), 'إيقاف الحدث يعيد الحروف كما كانت');
const l5 = await Z.page.evaluate(() => { const before = document.getElementById('lsc-word-display').textContent; const r = window.BatmishEvents.trigger('lsc', 'lsc.e5'); return { ok: r.ok, before, after: document.getElementById('lsc-word-display').textContent }; });
ok(l5.ok && Array.from(l5.after).length === Array.from(l5.before).length + 1, 'الحرف الإضافي: أُضيف حرف دخيل', l5);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('lsc', a.id); });
const l2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('lsc', 'lsc.e2'); return { ok: r.ok, shown: document.getElementById('lsc-hint-box').style.display, t: document.getElementById('lsc-hint-display').textContent }; });
ok(l2.ok && l2.shown === 'block' && /الموضع/.test(l2.t), 'التلميح المتأخر: كُشف موضع حرف', l2);
const l4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('lsc', 'lsc.e4'); return { ok: r.ok, on: lscSpeedBonusEnabled }; });
ok(l4.ok && l4.on, 'سباق السرعة: المكافأة مفعّلة', l4);
await Z.page.evaluate(() => { lscGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => lscSpeedBonusEnabled === false && window.BatmishEvents.status().active.length === 0), 'انتهاء الراوند يعيد كل شيء');

console.log('== E4هـ) الصور والمواضيع وسباق الكلمات وسؤال وجواب سريع');
// ---- خمن الصورة
await enable('ig', ['ig.e1', 'ig.e2', 'ig.e3', 'ig.e5'], {});
const igReal = await Z.page.evaluate(() => { igGameStatus = 'waiting'; igRoundNum = 0; try { startIGRound(); } catch (e) {} return igGameStatus === 'active'; });
if (!igReal) await Z.page.evaluate(() => { igGameStatus = 'active'; document.getElementById('ig-card-emoji').textContent = '🦁'; window.BatmishEvents.engine().beginRound('ig', {}); });
ok(await Z.page.evaluate(() => igGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('ig')), 'خمن الصورة: جولة أحداث نشطة ' + (igReal ? '(بدء الراوند الحقيقي)' : '(الراوند الحقيقي يحتاج فئات، فُعِّلت الحالة يدوياً)'));
const i1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ig', 'ig.e1'); return { ok: r.ok, f: document.getElementById('ig-card-emoji').style.filter }; });
ok(i1.ok && /blur\(\d+px\)/.test(i1.f), 'الصورة المموهة: طُبِّق تمويه فعلي', i1);
const i1c = await Z.page.evaluate(() => window.BatmishEvents.trigger('ig', 'ig.e3'));
ok(!i1c.ok && /conflict/.test(i1c.reason), 'التعارض: التكبير يُرفض أثناء التمويه (نفس مجموعة العرض)');
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('ig', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('ig-card-emoji').style.filter === ''), 'إيقاف الحدث يزيل التمويه');
const i3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ig', 'ig.e3'); const e = document.getElementById('ig-card-emoji'); return { ok: r.ok, t: e.style.transform, o: e.parentNode.style.overflow }; });
ok(i3.ok && /scale\(2\.\d+/.test(i3.t) && i3.o === 'hidden', 'الصورة المكبرة: تكبير مع اقتصاص', i3);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('ig', a.id); });
const i2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ig', 'ig.e2'); return { ok: r.ok, f: document.getElementById('ig-card-emoji').style.filter }; });
await sleep(7200);
const i2b = await Z.page.evaluate(() => document.getElementById('ig-card-emoji').style.filter);
const px = (f) => Number((f.match(/blur\((\d+)px\)/) || [0, 0])[1]);
ok(i2.ok && px(i2b) < px(i2.f), 'كشف جزء جديد: التمويه يخف مع الوقت', { first: i2.f, later: i2b });
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('ig', a.id); });
const i5 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('ig', 'ig.e5'); return r.ok; });
await sleep(4200);
ok(i5 && await Z.page.evaluate(() => document.getElementById('ig-card-emoji').style.visibility === 'hidden'), 'الصورة الخاطفة: اختفت بعد ثوانٍ');
await Z.page.evaluate(() => { igGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => document.getElementById('ig-card-emoji').style.visibility === '' && window.BatmishEvents.status().active.length === 0), 'انتهاء الراوند يعيد ظهور الصورة');
// ---- خمن الموضوع
await enable('guessword', ['guessword.e2', 'guessword.e4'], {});
await Z.page.evaluate(() => { gwGameStatus = 'waiting'; gwSecretWord = 'قطة'; gwSecretHint = 'حيوان أليف صغير يموء كثيراً'; gwBeginNewRound(); });
ok(await Z.page.evaluate(() => gwGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('guessword')), 'خمن الموضوع: بدء الراوند يبدأ جولة أحداث');
const g2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('guessword', 'guessword.e2'); return { ok: r.ok, d: document.getElementById('gw-hint-wrap').style.display }; });
ok(g2.ok && g2.d === 'none', 'التلميح المحظور: أُخفي التلميح', g2);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active[0]; window.BatmishEvents.engine().cancelEvent('guessword', a.id); });
ok(await Z.page.evaluate(() => document.getElementById('gw-hint-wrap').style.display === ''), 'إيقاف الحدث يعيد التلميح');
await api('/batmish/events/event', { tag: 'guessword', eventId: 'guessword.e4', values: { intervalSec: 2 } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('guessword', 't'); gwGameStatus = 'waiting'; gwBeginNewRound(); });
const g4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('guessword', 'guessword.e4'); return { ok: r.ok, t: document.getElementById('gw-hint-show').textContent }; });
await sleep(4800);
const g4b = await Z.page.evaluate(() => document.getElementById('gw-hint-show').textContent);
ok(g4.ok && g4.t === 'حيوان …' && g4b.split(' ').length > g4.t.split(' ').length, 'التلميح المتدرج: يُكشف كلمة بعد كلمة', { g4, g4b });
await Z.page.evaluate(() => { gwGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => document.getElementById('gw-hint-show').textContent === 'حيوان أليف صغير يموء كثيراً'), 'انتهاء الراوند يعيد نص التلميح الكامل');
// ---- سباق الكلمات
await enable('wr', ['wr.e5'], {});
await api('/batmish/events/event', { tag: 'wr', eventId: 'wr.e5', values: { showSeconds: 2 } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate((us) => { wrGameStatus = 'waiting'; wrWord = 'الصبر مفتاح الفرج'; us.forEach((u) => wrParticipants.set(u.uniqueId, u)); startWRRound(); }, [U(51), U(52)]);
ok(await Z.page.evaluate(() => wrGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('wr')), 'سباق الكلمات: بدء الراوند يبدأ جولة أحداث');
ok((await Z.page.evaluate(() => window.BatmishEvents.trigger('wr', 'wr.e5').ok)), 'المرحلة البرقية: شُغّل');
await sleep(3200);
ok(await Z.page.evaluate(() => document.getElementById('wr-word-display').style.visibility === 'hidden'), 'المرحلة البرقية: الجملة اختفت بعد ثوانٍ');
await Z.page.evaluate(() => { wrGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => document.getElementById('wr-word-display').style.visibility !== 'hidden'), 'انتهاء الراوند يعيد ظهور الجملة');
// ---- سؤال وجواب سريع
await enable('fastans', ['fastans.e1', 'fastans.e4', 'fastans.e5']);
await Z.page.evaluate(() => { fastansPlayers = [{ name: 'أحمد', score: 0 }, { name: 'سارة', score: 3 }, { name: 'خالد', score: 0 }]; fastansQuestionQueue = []; fastansPlayerQueue = []; FASTANS_WIN_SCORE = 5; fastansStartRound(); fastansTimerTotal = 40; });
ok(await Z.page.evaluate(() => !fastansRoundOver && window.BatmishEvents.status().rounds.includes('fastans')), 'سؤال وجواب سريع: بدء السؤال يبدأ جولة أحداث');
const f1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('fastans', 'fastans.e1'); return { ok: r.ok, total: fastansTimerTotal, el: (performance.now() - fastansTimerStart) / 1000 }; });
ok(f1.ok && f1.total - f1.el <= 7, 'السؤال الخاطف: بقيت ثوانٍ قليلة فقط على الانفجار', f1);
const f4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('fastans', 'fastans.e4'); return { ok: r.ok, b: fastansBonusPts }; });
ok(f4.ok && f4.b === 1, 'المضاعف السري: مكافأة نقطة مفعّلة', f4);
await Z.page.evaluate(() => { fastansOpenWhoAnswered(); });
await sleep(900);
ok(await Z.page.evaluate(() => fastansBonusPts === 1 && window.BatmishEvents.status().active.some((a) => a.eventId === 'fastans.e4')), 'المكافأة تبقى فعّالة حتى اختيار الفائز (قائمة الاختيار مفتوحة)');
const pts = await Z.page.evaluate(() => { const before = fastansPlayers[0].score; fastansPickWinner(0); return { before, after: fastansPlayers[0].score, bonus: fastansBonusPts }; });
ok(pts.after - pts.before === 2 && pts.bonus === 0, 'الفائز نال نقطتين فعلاً والمكافأة استُهلكت', pts);
await sleep(1200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0), 'بعد اختيار الفائز انتهى الحدث');
await Z.page.evaluate(() => { window.BatmishEvents.engine().endRound('fastans', 't'); });
for (const id of ['fastans.e1', 'fastans.e4']) await api('/batmish/events/event', { tag: 'fastans', eventId: id, values: { enabled: false } });
await api('/batmish/events/game', { tag: 'fastans', values: { mode: 'random' } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate(() => { fastansPlayers = [{ name: 'أحمد', score: 0 }, { name: 'سارة', score: 4 }]; fastansStartRound(); fastansTimerTotal = 40; });
const f5 = await until(() => Z.page.evaluate(() => { const a = window.BatmishEvents.status().stats; return (fastansTimerTotal - (performance.now() - fastansTimerStart) / 1000) <= 7 ? fastansTimerTotal : null; }), 3000);
ok(f5 !== null, 'النهائي السريع (شرطي): ظهر لما اقترب لاعب من الفوز وقصّر المهلة', f5);
await Z.page.evaluate(() => { fastansRoundOver = true; fastansOpenWhoAnswered = null; document.getElementById('fastans-pick-overlay').classList.remove('show'); }); await sleep(1200);

console.log('== E4و) ضربة الحظ، الصندوق العشوائي، القناص، الكراسي، إشارة المرور، الزر المشحون، المتاهة، الجسر الزجاجي');
const Us = (a, n) => Array.from({ length: n }, (_, i) => U(a + i));
const endAll = (tag) => Z.page.evaluate((t) => { window.BatmishEvents.engine().endRound(t, 'test'); }, tag);
// ---- ضربة الحظ
await enable('hz', ['hz.e1', 'hz.e2', 'hz.e3', 'hz.e4'], {});
await Z.page.evaluate((us) => { hzGameStatus = 'waiting'; hzParticipants.clear(); hzCells = Array.from({ length: 61 }, () => null); HZ_GRID_SIZE = 60; hzMaxClicks = 15; hzClicksUsed = 0; buildHzGrid(); us.forEach((u) => hzJoinParticipant(u)); startHzRound(); }, Us(61, 6));
ok(await Z.page.evaluate(() => hzGameStatus === 'active' && hzParticipants.size === 6 && window.BatmishEvents.status().rounds.includes('hz')), 'ضربة الحظ: بدء الراوند يبدأ جولة أحداث');
const h1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('hz', 'hz.e1'); const n = [...hzBonusCells][0]; const before = hzMaxClicks; hzCellClick(n); return { ok: r.ok, n, before, after: hzMaxClicks }; });
ok(h1.ok && h1.n && h1.after > h1.before, 'الصندوق الأسطوري: فتحه منح ضغطات إضافية فعلاً', h1);
await sleep(700);
const h2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('hz', 'hz.e2'); const open0 = document.querySelectorAll('.hz-cell.hz-opened').length, used0 = hzClicksUsed; const n = [...document.querySelectorAll('.hz-cell:not(.hz-opened)')].map((e) => Number(e.id.replace('hz-cell-', '')))[0]; hzCellClick(n); return { ok: r.ok, open0, used0 }; });
await sleep(1200);
const h2b = await Z.page.evaluate(() => ({ open: document.querySelectorAll('.hz-cell.hz-opened').length, used: hzClicksUsed, dbl: hzDoubleNext }));
ok(h2.ok && h2b.open - h2.open0 === 2 && h2b.used - h2.used0 === 1 && h2b.dbl === false, 'الصندوق المزدوج: نقرة واحدة فتحت صندوقين وخُصمت ضغطة واحدة فقط', { h2, h2b });
const h3 = await Z.page.evaluate(() => { const snap = () => hzCells.map((u, i) => (u ? i + ':' + u : '')).filter(Boolean).sort().join('|'); const ids = () => [...hzParticipants.keys()].sort().join(','); const before = ids(); let changed = false, cons = true; for (let t = 0; t < 6 && !changed; t++) { const a = hzCells.slice(); const r = window.BatmishEvents.trigger('hz', 'hz.e3'); if (!r.ok) return { err: r.reason }; changed = hzCells.some((u, i) => u !== a[i]); window.BatmishEvents.status().active.forEach((x) => window.BatmishEvents.engine().cancelEvent('hz', x.id)); } hzParticipants.forEach((p, uid) => { if (hzCells[p.cell] !== uid) cons = false; }); return { changed, cons, same: ids() === before }; });
ok(h3.changed && h3.cons && h3.same, 'الصندوق المقلوب: تبدّلت أماكن اللاعبين وبقيت البيانات متسقة', h3);
const h4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('hz', 'hz.e4'); const uid = [...hzShield][0]; const cell = hzParticipants.get(uid).cell; const before = hzParticipants.size; hzCellClick(cell); return { ok: r.ok, uid, survived: hzParticipants.has(uid), size: hzParticipants.size, before, left: hzShield.has(uid) }; });
ok(h4.ok && h4.uid && h4.survived && h4.size === h4.before && !h4.left, 'فرصة أخيرة: اللاعب المدروع نجا فعلاً من الإصابة واستُهلك الدرع', h4);
await Z.page.evaluate(() => { hzGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => hzBonusCells.size === 0 && hzShield.size === 0 && hzDoubleNext === false && window.BatmishEvents.status().active.length === 0), 'ضربة الحظ: انتهاء الراوند يعيد الخطافات');
// ---- الصندوق العشوائي
await enable('box', ['box.e1', 'box.e4', 'box.e5'], {});
await Z.page.evaluate((us) => { boxGameStatus = 'waiting'; boxParticipants.clear(); us.forEach((u) => boxParticipants.set(u.uniqueId, u)); BOX_COUNT = 4; startBoxRound(); }, Us(71, 4));
ok(await Z.page.evaluate(() => boxGameStatus === 'active' && boxAwaitingPick && window.BatmishEvents.status().rounds.includes('box')), 'الصندوق العشوائي: بدء الراوند والدور الأول يفتح جولة أحداث');
const b1 = await Z.page.evaluate(() => { const before = boxArrangement.slice(); const r = window.BatmishEvents.trigger('box', 'box.e1'); return { ok: r.ok, before, after: boxArrangement.slice() }; });
ok(b1.ok && b1.after.includes('golden') && b1.after.filter((x) => x === 'elim').length === b1.before.filter((x) => x === 'elim').length - 1, 'الصندوق الأسطوري: تحوّل صندوق إقصاء إلى ذهبي فعلاً', b1);
const b3 = await Z.page.evaluate(() => { const a = boxArrangement.slice().sort().join(); let moved = false; for (let t = 0; t < 8 && !moved; t++) { const x = boxArrangement.slice(); window.BatmishEvents.status().active.forEach((q) => window.BatmishEvents.engine().cancelEvent('box', q.id)); const r = window.BatmishEvents.trigger('box', 'box.e4'); if (!r.ok) return { err: r.reason }; moved = boxArrangement.some((c, i) => c !== x[i]); } return { moved, same: boxArrangement.slice().sort().join() === a }; });
ok(b3.moved && b3.same, 'الصناديق المتبدلة: أُعيد خلط المحتوى بنفس المكونات', b3);
const b5 = await Z.page.evaluate(() => { boxParticipants.delete([...boxParticipants.keys()][0]); boxParticipants.delete([...boxParticipants.keys()][0]); const r = window.BatmishEvents.trigger('box', 'box.e5'); return { ok: r.ok, a: boxArrangement.slice(), n: boxParticipants.size }; });
ok(b5.ok && b5.a.filter((x) => x === 'immune').length === 1 && b5.a.filter((x) => x === 'elim').length === b5.a.length - 1, 'الاختيار الأخير: صندوق نجاة واحد والباقي إقصاء', b5);
await Z.page.evaluate(() => { boxGameStatus = 'finished'; boxAwaitingPick = false; }); await sleep(1200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0), 'الصندوق العشوائي: انتهاء الراوند ينظف الأحداث');
// ---- القناص
await enable('sniper', ['sniper.e1', 'sniper.e2', 'sniper.e4', 'sniper.e5'], {});
await api('/batmish/events/event', { tag: 'sniper', eventId: 'sniper.e1', values: { intervalSec: 2 } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
const snSetup = () => Z.page.evaluate((us) => { sniperGameStatus = 'waiting'; sniperParticipants.clear(); sniperCells = Array.from({ length: 51 }, () => []); sniperShieldCells.clear(); sniperGoldenCells.clear(); sniperAmmo = { sniper: 25, bomb: 6, nuke: 4 }; SNIPER_GRID_SIZE = 50; buildGrid(); us.forEach((u, i) => { sniperParticipants.set(u.uniqueId, { user: u, cell: 5 + i * 3 }); sniperCells[5 + i * 3] = [u.uniqueId]; }); startSniperRound(); }, Us(81, 4));
await snSetup();
ok(await Z.page.evaluate(() => sniperGameStatus === 'active' && sniperParticipants.size === 4 && window.BatmishEvents.status().rounds.includes('sniper')), 'القناص: بدء الراوند يبدأ جولة أحداث');
const s2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('sniper', 'sniper.e2'); const n = [...sniperShieldCells][0]; const before = sniperParticipants.size; selectedWeapon = 'sniper'; document.getElementById('fire-input').value = n; fireWeapon(); return { ok: r.ok, n, survived: sniperParticipants.size === before, left: sniperShieldCells.has(n) }; });
ok(s2.ok && s2.n && s2.survived && !s2.left, 'المربع المحصّن: امتص الضربة الأولى فعلاً ثم زال الدرع', s2);
const s4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('sniper', 'sniper.e4'); const n = [...sniperGoldenCells][0]; const before = sniperAmmo.sniper; selectedWeapon = 'sniper'; document.getElementById('fire-input').value = n; fireWeapon(); return { ok: r.ok, n, before, after: sniperAmmo.sniper }; });
ok(s4.ok && s4.n && s4.after === s4.before, 'المواجهة الذهبية: الإصابة بالمربع الذهبي أعادت الطلقة (صافي 0 بدل -1)', s4);
await sleep(700);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('sniper', x.id)); });
const s1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('sniper', 'sniper.e1'); return { ok: r.ok, n: [...sniperGoldenCells][0] }; });
await sleep(3300);
const s1b = await Z.page.evaluate(() => ({ n: [...sniperGoldenCells][0], size: sniperGoldenCells.size }));
ok(s1.ok && s1b.size === 1 && s1b.n !== s1.n, 'المنطقة المتحركة: المربع الذهبي انتقل لمربع آخر مع الوقت', { s1, s1b });
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('sniper', x.id)); });
const s5 = await Z.page.evaluate(() => { const before = sniperAmmo.sniper; const r = window.BatmishEvents.trigger('sniper', 'sniper.e5'); return { ok: r.ok, before, after: sniperAmmo.sniper }; });
ok(s5.ok && s5.after < s5.before && s5.after >= 1, 'الذخيرة المحدودة: خُصمت نسبة من طلقات القناص', s5);
await Z.page.evaluate(() => { sniperGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => sniperShieldCells.size === 0 && sniperGoldenCells.size === 0 && sniperGoldenZoneEnabled === false && sniperShieldEnabled === false), 'القناص: انتهاء الراوند يعيد حالة الدروع والمناطق');
// ---- الكراسي (جولة الكراسي الحقيقية تحتاج مؤقتات طويلة: نبدأ جولة الأحداث مباشرة على حالة «claiming»)
await enable('chairs', ['chairs.e1', 'chairs.e4'], {});
await Z.page.evaluate((us) => { chairsParticipants.clear(); us.forEach((u) => chairsParticipants.set(u.uniqueId, u)); chairsGameStatus = 'claiming'; chairsActiveChairNumbers = [1, 2, 3]; chairsGoldenChairNumber = null; chairsImmuneUid = null; window.BatmishEvents.engine().beginRound('chairs', {}); }, Us(91, 5));
const c1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('chairs', 'chairs.e1'); return { ok: r.ok, n: chairsGoldenChairNumber, ok2: chairsActiveChairNumbers.includes(chairsGoldenChairNumber) }; });
ok(c1.ok && c1.ok2, 'الكرسي الذهبي: كرسي نشط صار ذهبياً', c1);
const c4 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('chairs', 'chairs.e4'); return { ok: r.ok, uid: chairsImmuneUid, member: chairsParticipants.has(chairsImmuneUid) }; });
ok(c4.ok && c4.uid && c4.member, 'الكرسي المحصّن: لاعب فعلي حصل على حصانة', c4);
await Z.page.evaluate(() => { chairsGameStatus = 'finished-round'; }); await sleep(1200);
ok(await Z.page.evaluate(() => chairsGoldenChairNumber === null && chairsImmuneUid === null && window.BatmishEvents.status().active.length === 0), 'الكراسي: انتهاء الجولة يعيد الحالة');
// ---- إشارة المرور
await enable('rlgl', ['rlgl.e1', 'rlgl.e2', 'rlgl.e5'], {});
await api('/batmish/events/event', { tag: 'rlgl', eventId: 'rlgl.e1', values: { flashMs: 1000 } }); await api('/batmish/events/event', { tag: 'rlgl', eventId: 'rlgl.e2', values: { flashMs: 700 } }); await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate((us) => { rlglGameStatus = 'waiting'; rlglParticipants.clear(); us.forEach((u) => rlglParticipants.set(u.uniqueId, u)); startRlglRound(); }, Us(101, 3));
const rlAct = await until(() => Z.page.evaluate(() => rlglGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('rlgl')), 8000);
ok(!!rlAct, 'إشارة المرور: بدء الراوند (بعد العدّ التنازلي) يبدأ جولة أحداث');
await Z.page.evaluate(() => { clearTimeout(rlglLightTimer); rlglSetLight('green'); });
const rl1 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('rlgl', 'rlgl.e1'); return { ok: r.ok, light: rlglLightState }; });
ok(rl1.ok && rl1.light === 'red', 'الإشارة الخاطفة: تحوّلت الإشارة للأحمر فجأة', rl1);
await sleep(1900);
ok(await Z.page.evaluate(() => rlglLightState === 'green' && !window.BatmishEvents.status().active.some((a) => a.eventId === 'rlgl.e1')), 'الإشارة الخاطفة: عادت الخضراء بعد الوميض');
const rl2 = await Z.page.evaluate(() => { clearTimeout(rlglLightTimer); rlglSetLight('green'); const r = window.BatmishEvents.trigger('rlgl', 'rlgl.e2'); return { ok: r.ok, light: rlglLightState }; });
const seq = []; for (let i = 0; i < 16; i++) { seq.push(await Z.page.evaluate(() => rlglLightState)); await sleep(250); }
const reds = seq.join('').replace(/(red)+/g, 'R').replace(/(green)+/g, 'G');
ok(rl2.ok && /R.*G.*R/.test(reds.replace(/RG/g, 'R-G-')) && (reds.match(/R/g) || []).length >= 2, 'الإشارة المزدوجة: وميضان أحمران متتاليان', { seq: reds });
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('rlgl', a.id)); });
const rl5 = await Z.page.evaluate(() => { const prev = rlglLightSpeed; const r = window.BatmishEvents.trigger('rlgl', 'rlgl.e5'); return { ok: r.ok, prev, now: rlglLightSpeed }; });
ok(rl5.ok && rl5.now === 'fast', 'السباق النهائي: تسارعت الإشارة', rl5);
await Z.page.evaluate(() => { rlglFinishRound(); }); await sleep(1500);
ok(await Z.page.evaluate((p) => rlglLightSpeed === p && window.BatmishEvents.status().active.length === 0, rl5.prev), 'إشارة المرور: انتهاء الجولة يعيد سرعة الإشارة');
// ---- الزر المشحون
await enable('battery', ['battery.e1', 'battery.e2', 'battery.e3', 'battery.e4', 'battery.e5'], {});
await Z.page.evaluate(() => { BATTERY_CHARGE_OPTIONS.splice(0, BATTERY_CHARGE_OPTIONS.length, 10); batteryNewRound(); });
ok(await Z.page.evaluate(() => !batteryFinished && window.BatmishEvents.status().rounds.includes('battery')), 'الزر المشحون: بدء الراوند يبدأ جولة أحداث');
const bt = (f) => Z.page.evaluate(f);
const bt1 = await bt(() => { const r = window.BatmishEvents.trigger('battery', 'battery.e1'); const c0 = batteryCharge; batteryApplyCharge({ uniqueId: 'a', nickname: 'a' }); return { ok: r.ok, d: batteryCharge - c0 }; });
ok(bt1.ok && bt1.d === 20, 'الشحن المضاعف: الشحنة صارت ضعف قيمتها فعلاً (10 → 20)', bt1);
await bt(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('battery', a.id)); });
const bt1b = await bt(() => { const c0 = batteryCharge; batteryApplyCharge({ uniqueId: 'a', nickname: 'a' }); return batteryCharge - c0; });
ok(bt1b === 10, 'انتهاء الحدث يعيد قيمة الشحنة الطبيعية');
const bt2 = await bt(() => { const c0 = batteryCharge; const r = window.BatmishEvents.trigger('battery', 'battery.e2'); return { ok: r.ok, c0, c1: batteryCharge }; });
ok(bt2.ok && bt2.c1 < bt2.c0, 'انقطاع الطاقة: هبط الشحن فعلاً', bt2);
const bt3 = await bt(() => { const c0 = batteryCharge; const r = window.BatmishEvents.trigger('battery', 'battery.e3'); return { ok: r.ok, c0, c1: batteryCharge }; });
ok(bt3.ok && bt3.c1 > bt3.c0 && bt3.c1 <= 99, 'الشحن الخاطف: قفز الشحن (ولا يصل لـ100)', bt3);
const bt4 = await bt(() => { const r = window.BatmishEvents.trigger('battery', 'battery.e4'); const c0 = batteryCharge; batteryApplyCharge({ uniqueId: 'b', nickname: 'b' }); const d1 = batteryCharge - c0; const c1 = batteryCharge; batteryApplyCharge({ uniqueId: 'b', nickname: 'b' }); return { ok: r.ok, d1, d2: batteryCharge - c1 }; });
ok(bt4.ok && bt4.d1 === 30 && bt4.d2 === 10, 'البطارية الذهبية: أول شحنة ×3 فقط ثم تعود طبيعية', bt4);
await sleep(800);
await bt(() => { batteryCharge = 85; });
const bt5 = await bt(() => { const r = window.BatmishEvents.trigger('battery', 'battery.e5'); batteryApplyCharge({ uniqueId: 'w', nickname: 'فائز' }); return { ok: r.ok, c: batteryCharge, fin: batteryFinished }; });
ok(bt5.ok && bt5.c === 100 && bt5.fin, 'الانفجار النهائي: الشحنة القادمة ملأت البطارية وحسمت الفوز', bt5);
await sleep(1200);
ok(await bt(() => batteryOneShotMul === 0 && batteryChargeMul === 1 && window.BatmishEvents.status().active.length === 0), 'الزر المشحون: انتهاء الراوند يعيد المضاعفات');
// ---- المتاهة
await enable('maze', ['maze.e1', 'maze.e2', 'maze.e3'], {});
await Z.page.evaluate((us) => { mzGameStatus = 'waiting'; mzParticipants.clear(); us.forEach((u) => mzParticipants.set(u.uniqueId, u)); startMzRound(); }, Us(111, 3));
ok(await Z.page.evaluate(() => mzGameStatus === 'active' && window.BatmishEvents.status().rounds.includes('maze')), 'المتاهة: بدء الراوند يبدأ جولة أحداث');
const mzCheck = () => Z.page.evaluate(() => { let consistent = true; const D = { N: [-1, 0, 'S'], S: [1, 0, 'N'], E: [0, 1, 'W'], W: [0, -1, 'E'] }; let walls = 0; for (let r = 0; r < mzRows; r++) for (let c = 0; c < mzCols; c++) for (const d in D) { const nr = r + D[d][0], nc = c + D[d][1]; if (nr < 0 || nr >= mzRows || nc < 0 || nc >= mzCols) continue; if (!!mzGrid[r][c][d] !== !!mzGrid[nr][nc][D[d][2]]) consistent = false; if (mzGrid[r][c][d]) walls++; } const seen = new Set([mzGoal.r + ',' + mzGoal.c]); const q = [[mzGoal.r, mzGoal.c]]; while (q.length) { const [r, c] = q.shift(); for (const d in D) { if (mzGrid[r][c][d]) continue; const nr = r + D[d][0], nc = c + D[d][1]; if (nr < 0 || nr >= mzRows || nc < 0 || nc >= mzCols || seen.has(nr + ',' + nc)) continue; seen.add(nr + ',' + nc); q.push([nr, nc]); } } let reach = true; mzPos.forEach((p) => { if (!seen.has(p.r + ',' + p.c)) reach = false; }); return { consistent, walls, reach, sig: JSON.stringify(mzGrid) }; });
const mq0 = await mzCheck();
const mz1 = await Z.page.evaluate(() => window.BatmishEvents.trigger('maze', 'maze.e1').ok);
const mq1 = await mzCheck();
ok(mz1 && mq1.sig !== mq0.sig && mq1.consistent && mq1.reach, 'المتاهة المتغيرة: تغيّرت الجدران بتناسق وبقي طريق لكل لاعب', { walls: [mq0.walls, mq1.walls] });
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('maze', a.id)); });
const mz2 = await Z.page.evaluate(() => window.BatmishEvents.trigger('maze', 'maze.e2').ok);
const mq2 = await mzCheck();
ok(mz2 && mq2.walls === mq1.walls - 2 && mq2.consistent && mq2.reach, 'الباب السري: انفتح جدار واحد (يُحسب من الجهتين)', { walls: [mq1.walls, mq2.walls] });
const mz3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('maze', 'maze.e3'); return { ok: r.ok, f: document.getElementById('mz-board-wrap').style.filter }; });
ok(mz3.ok && /brightness/.test(mz3.f), 'الطريق المظلم: عُتّمت اللوحة', mz3);
await Z.page.evaluate(() => { mzGameStatus = 'finished'; }); await sleep(1200);
ok(await Z.page.evaluate(() => document.getElementById('mz-board-wrap').style.filter === '' && window.BatmishEvents.status().active.length === 0), 'المتاهة: انتهاء الراوند يعيد السطوع');
// ---- الجسر الزجاجي
await enable('glz', ['glz.e2', 'glz.e3', 'glz.e4', 'glz.e5'], {});
const glzReal = await Z.page.evaluate((us) => { try { glzParticipants.clear(); glzAlive = new Set(); us.forEach((u) => { glzParticipants.set(u.uniqueId, u); glzAlive.add(u.uniqueId); }); glzRoundSeconds = 20; glzGameStatus = 'lobby'; glzStartRound(); return glzGameStatus === 'active'; } catch (e) { return String(e); } }, Us(121, 4));
ok(glzReal === true && await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('glz')), 'الجسر الزجاجي: بدء الجولة الحقيقية يبدأ جولة أحداث', glzReal);
const gq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('glz', 'glz.e3'); const c = glzCurrentQuestion.c; return { ok: r.ok, c, s: document.getElementById('glz-panel-' + c).style.boxShadow, other: document.getElementById('glz-panel-' + (1 - c)).style.boxShadow }; });
ok(gq3.ok && /242/.test(gq3.s) && gq3.other === '', 'المسار المتوهج: توهّج الزجاج الصحيح فقط', gq3);
const gq2c = await Z.page.evaluate(() => window.BatmishEvents.trigger('glz', 'glz.e2'));
ok(gq2c.ok, 'الزجاج المتشابه (مجموعة مختلفة) يعمل بالتوازي مع المتوهج');
const gq2 = await Z.page.evaluate(() => document.getElementById('glz-opt-0-text').style.filter);
ok(/blur/.test(gq2), 'الزجاج المتشابه: تشويش نص الخيارين', gq2);
const gq4 = await Z.page.evaluate(() => { glzTimeLeft = 18; const r = window.BatmishEvents.trigger('glz', 'glz.e4'); return { ok: r.ok, t: glzTimeLeft }; });
ok(gq4.ok && gq4.t <= 5, 'الوقت المحدود: قُصّر الوقت المتبقي فعلاً', gq4);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => { if (a.eventId === 'glz.e4') window.BatmishEvents.engine().cancelEvent('glz', a.id); }); });
const gq5 = await Z.page.evaluate(() => { glzTimeLeft = 18; glzAlive = new Set([...glzAlive].slice(0, 3)); const r = window.BatmishEvents.trigger('glz', 'glz.e5'); return { ok: r.ok, t: glzTimeLeft }; });
ok(gq5.ok && gq5.t <= 6, 'العبور الأخير: قُصّر الوقت لما قلّ عدد اللاعبين', gq5);
await Z.page.evaluate(() => { glzGameStatus = 'resolving'; }); await sleep(1200);
ok(await Z.page.evaluate(() => document.getElementById('glz-opt-0-text').style.filter === '' && document.getElementById('glz-panel-0').style.boxShadow === '' && document.getElementById('glz-panel-1').style.boxShadow === '' && window.BatmishEvents.status().active.length === 0), 'الجسر الزجاجي: انتهاء السؤال يعيد التنسيق الأصلي');
await Z.page.evaluate(() => { glzGameStatus = 'lobby'; if (glzTimerInterval) { clearInterval(glzTimerInterval); glzTimerInterval = null; } });

console.log('== E4ز) أين الكرة (جولة حقيقية كاملة) وتوب 10');
await api('/batmish/events/game', { tag: 'findball', values: { mode: 'random', minGapSec: 0, maxPerRound: 5 } });
for (const id of ['findball.e1', 'findball.e2', 'findball.e3']) await api('/batmish/events/event', { tag: 'findball', eventId: id, values: { enabled: true, probability: 100, fromSec: 0 } });
await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate((us) => { window.__fbLog = { minMs: 1e9, swaps: 0, status: [], opac: null }; findballParticipants.clear(); findballGameStatus = 'waiting'; findballRoundNum = 0; findballShuffling = false; FINDBALL_SHUFFLE_MIN_MS = 6000; FINDBALL_SHUFFLE_FLOOR_MS = 1800; FINDBALL_SWAP_COUNT = 6; us.forEach((u) => { findballParticipants.set(u.uniqueId, u); }); window.__fbBase = { min: modGetSetting('findball', 'shuffleMinMs', 6000), swaps: modGetSetting('findball', 'swapCount', 6) }; window.__fbIv = setInterval(() => { const st = findballGameStatus; if (!window.__fbLog.status.length || window.__fbLog.status[window.__fbLog.status.length - 1] !== st) window.__fbLog.status.push(st); if (st === 'shuffling') { window.__fbLog.minMs = Math.min(window.__fbLog.minMs, FINDBALL_SHUFFLE_MIN_MS); window.__fbLog.swaps = Math.max(window.__fbLog.swaps, FINDBALL_SWAP_COUNT); } if (st === 'guessing') { const o = ['a', 'b', 'c'].map((c) => document.getElementById('findball-cup-' + c).style.opacity).filter((x) => x === '0.12'); if (o.length) window.__fbLog.opac = o.length; } }, 80); findballStartRoundClick(); }, Us(131, 3));
ok(await until(() => Z.page.evaluate(() => window.__fbLog.status.includes('shuffling')), 15000), 'أين الكرة: الجولة الحقيقية وصلت لمرحلة الخلط');
await until(() => Z.page.evaluate(() => window.__fbLog.status.includes('guessing')), 30000);
await sleep(1500);
const fbq = await Z.page.evaluate(() => ({ log: window.__fbLog, base: window.__fbBase, status: window.BatmishEvents.status().stats }));
ok(fbq.log.minMs < fbq.base.min * 0.8, 'الخلط السريع: مدة الخلط قُصّرت فعلاً قبل بدء الخلط', fbq);
ok(fbq.log.swaps > fbq.base.swaps, 'تبديل مفاجئ: عدد التبديلات زاد فعلاً', fbq);
ok(fbq.log.opac === 1, 'الكأس المتخفي: تلاشى كأس واحد فعلاً عند بدء التخمين', fbq.log);
await Z.page.evaluate(() => { clearInterval(window.__fbIv); findballRunId++; findballGameStatus = 'finished-round'; findballShuffling = false; }); await sleep(1500);
ok(await Z.page.evaluate(() => FINDBALL_SHUFFLE_MIN_MS === 6000 && FINDBALL_SWAP_COUNT === 6 && ['a', 'b', 'c'].every((c) => document.getElementById('findball-cup-' + c).style.opacity !== '0.12') && window.BatmishEvents.status().active.length === 0), 'أين الكرة: انتهاء الجولة يعيد سرعة الخلط وعدد التبديلات والأكواب');
// ---- توب 10
await enable('tt10', ['tt10.e2', 'tt10.e3', 'tt10.e5'], {});
await Z.page.evaluate(() => { tt10GameStatus = 'waiting'; tt10Round = 0; tt10Scores.clear(); startTop10RoundWrapper = null; tt10StartRound(); });
ok(await Z.page.evaluate(() => tt10GameStatus === 'active' && window.BatmishEvents.status().rounds.includes('tt10')), 'توب 10: بدء الجولة الحقيقية يبدأ جولة أحداث');
const tq2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tt10', 'tt10.e2'); const it = tt10CurrentQuestion.items.find((i) => i.bonusMul); const val = it.value; tt10ProcessAnswer({ uniqueId: 'tp1', nickname: 'أ', isFollower: true, followKnown: true }, val); return { ok: r.ok, rank: it.rank, score: tt10Scores.get('tp1') && tt10Scores.get('tp1').score }; });
ok(tq2.ok && tq2.score === tq2.rank * 2, 'المركز الذهبي: الإجابة الصحيحة منحت نقاطاً مضاعفة فعلاً', tq2);
await Z.page.evaluate(() => window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('tt10', a.id)));
const tq3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('tt10', 'tt10.e3'); const it = tt10CurrentQuestion.items.find((i) => !i.revealed && i.rank >= 7); tt10ProcessAnswer({ uniqueId: 'tp2', nickname: 'ب', isFollower: true, followKnown: true }, it.value); return { ok: r.ok, rank: it.rank, score: tt10Scores.get('tp2') && tt10Scores.get('tp2').score }; });
ok(tq3.ok && tq3.score === tq3.rank * 2, 'تحدي المراكز الأخيرة: نقاط المراكز المتأخرة تضاعفت فعلاً', tq3);
await Z.page.evaluate(() => window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('tt10', a.id)));
const tq5 = await Z.page.evaluate(() => { const open = tt10CurrentQuestion.items.filter((i) => !i.revealed); open.slice(0, open.length - 3).forEach((i) => { i.revealed = true; }); const rem = tt10CurrentQuestion.items.filter((i) => !i.revealed); const before = rem.map((i) => i.rank); const r = window.BatmishEvents.trigger('tt10', 'tt10.e5'); const after = rem.map((i) => i.rank); return { ok: r.ok, before, after }; });
ok(tq5.ok && JSON.stringify(tq5.after) === JSON.stringify(tq5.before.slice().reverse()) && JSON.stringify(tq5.before) !== JSON.stringify(tq5.after), 'النهائي المقلوب: انعكست قيم نقاط الإجابات المتبقية', tq5);
await Z.page.evaluate(() => { tt10GameStatus = 'roundover'; }); await sleep(1200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0 && tt10CurrentQuestion.items.every((i) => !i.bonusMul)), 'توب 10: انتهاء الجولة يعيد القيم الأصلية');

console.log('== E5) المعاينة لا تلمس اللعبة، والسجل يعرض الحقيقة');
await reset();
const beforeHist = await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + '/batmish/events/history', { headers: { Authorization: 'Bearer ' + t } }); return (await r.json()).stats.total; });
await Z.page.evaluate(() => { cwAlliancePair = null; window.BatmishEvents.preview('cw', 'cw.e1'); });
await sleep(800);
const pv = await Z.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + '/batmish/events/history', { headers: { Authorization: 'Bearer ' + t } }); return { total: (await r.json()).stats.total, pair: cwAlliancePair, card: !!document.querySelector('#bmev-host .bmev') }; });
ok(pv.pair === null && pv.total === beforeHist && pv.card, 'المعاينة تعرض فقط: لا تغيّر اللعبة ولا تُسجَّل', { beforeHist, pv });
await Z.page.click('.bm-nav-item[data-nav="events"]'); await sleep(700);
await Z.page.click('[data-ev="tab"][data-id="history"]'); await sleep(1800);
const hist = await Z.page.evaluate(() => ({ rows: document.querySelectorAll('.bm-evtbl tbody tr').length, txt: document.querySelector('.bm-evtbl') ? document.querySelector('.bm-evtbl').innerText : '' }));
ok(hist.rows >= 8 && /مكتمل/.test(hist.txt) && /ملغي/.test(hist.txt) && /تحالف سري/.test(hist.txt), 'السجل: صفوف حقيقية بحالات مكتمل/ملغي وتأثير فعلي', hist.rows);
await Z.page.selectOption('[data-evhf="status"]', 'cancelled');
const filt = await until(() => Z.page.evaluate(() => { const r = [...document.querySelectorAll('.bm-evtbl tbody tr')]; return r.length > 0 && r.every((x) => /ملغي/.test(x.innerText)) ? r.length : null; }), 10000);
ok(!!filt, 'فلتر الحالة يعمل');
await Z.page.screenshot({ path: SHOTS + '/ev-03-history.png' });
// مجموعات
await Z.page.click('[data-ev="tab"][data-id="center"]'); await sleep(500); await Z.page.click('.bm-evgc:has-text("حرب الدول") [data-ev="open"]'); await sleep(700);
await Z.page.waitForSelector('#bmev-pname', { timeout: 10000 }); await Z.page.fill('#bmev-pname', 'وضع الفوضى'); await Z.page.click('[data-ev="p-create"]'); await Z.page.waitForSelector('.bm-sl li', { timeout: 10000 }); await sleep(500);
ok(await Z.page.evaluate(() => /وضع الفوضى/.test(document.querySelector('.bm-sl').innerText)), 'حفظ مجموعة أحداث للعبة');
await Z.page.click('[data-ev="p-dup"]'); await sleep(1500);
ok(await Z.page.evaluate(() => document.querySelectorAll('.bm-sl li').length === 2), 'نسخ المجموعة');
await Z.page.click('.bm-sl li:last-child [data-ev="p-del"]'); await sleep(400); await Z.page.click('.bm-dlg [data-ok]'); await sleep(1500);
ok(await Z.page.evaluate(() => document.querySelectorAll('.bm-sl li').length === 1), 'حذف المجموعة بعد تأكيد');

console.log('== E6) العزل بين الحسابات + الجوال');
const O = await newCtx('O'); await open(O.page);
await signup(O.page, 'other_user2', 'o2@test.com');
const iso = await O.page.evaluate(async (api) => { TIKTOK_BRIDGE_SERVERS[0] = api.replace('http', 'ws') + '/ws'; const t = await window.__auth.currentUser.getIdToken(); const base = Batmish.controller.relay(); const out = []; for (const p of ['/batmish/events/bootstrap', '/batmish/events/history']) out.push((await fetch(base + p, { headers: { Authorization: 'Bearer ' + t } })).status); for (const [p, b] of [['/batmish/events/event', { tag: 'cw', eventId: 'cw.e1', values: { enabled: true } }], ['/batmish/events/record', { key: 'x', tag: 'cw', eventId: 'cw.e1', status: 'completed' }]]) out.push((await fetch(base + p, { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(b) })).status); return out; }, API);
ok(iso.every((s) => s === 403), 'حساب غير مصرّح: كل مسارات الأحداث 403 (قراءة وكتابة وتسجيل)', iso);
ok(await O.page.evaluate(() => !window.BatmishEvents && !window.__bmStreamTap || !window.BatmishEvents), 'لا يُحمَّل محرك الأحداث لحساب غير مصرّح');
await O.ctx.close();
const M = await newCtx('M', { width: 390, height: 780 }); await open(M.page);
await M.page.evaluate((api) => { TIKTOK_BRIDGE_SERVERS[0] = api.replace('http', 'ws') + '/ws'; }, API);
const uidM = await signup(M.page, 'mobile_z', 'mz@test.com'); await bind(uidM); await linkStream(M.page, '_zvd4');
ok(!!(await until(() => btn(M.page), 20000)), 'جوال: يظهر الزر'); await M.page.click('#batmish-launch'); await M.page.waitForSelector('#batmish-root.is-open'); await sleep(2500);
await M.page.evaluate(() => window.Batmish.ui._dash.go('events')); await sleep(1500);
ok(await M.page.evaluate(() => document.querySelectorAll('.bm-evgc').length === 31 && document.documentElement.scrollWidth <= innerWidth + 2), 'جوال: بطاقات الألعاب بلا تمرير أفقي');
await M.page.evaluate(() => window.Batmish.ui._dash.go('evgame', 'cw')); await sleep(1200);
ok(await M.page.evaluate(() => document.querySelectorAll('.bm-evc[data-evid]').length === 5 && document.documentElement.scrollWidth <= innerWidth + 2), 'جوال: صفحة اللعبة بلا تمرير أفقي');
await M.page.screenshot({ path: SHOTS + '/ev-04-mobile.png' });

console.log('== E7) أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
