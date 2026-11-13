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

console.log('== H2) الأراضي البركانية وحرف النجاة');
await enable('volcanic-lands', ['volcanic-lands.e1', 'volcanic-lands.e2', 'volcanic-lands.e3', 'volcanic-lands.e4', 'volcanic-lands.e5']);
await Z.page.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, '_zvd4'); goSetupVolcanicLands(); document.getElementById('volcanic-lands-duration').value = 10; launchVolcanicLands(); });
await sleep(800);
const VLs = () => Z.page.evaluate(() => { const e = window.__vlEngine; return e ? { phase: e.phase, lava: e.lavaLevel, round: e.round, diff: e.settings.difficulty, alive: e.alivePlayers().length, hs: e.allPlayers().map((p) => p.height) } : null; });
ok(!!(await VLs()), 'الأراضي البركانية: التقط نظام الأحداث نسخة المحرك الحقيقية', await VLs());
await Z.page.evaluate(() => { for (let i = 1; i <= 4; i++) vlHandleEvent({ type: 'chat', user: { uniqueId: 'v' + i, nickname: 'بركان' + i, isFollower: true, followKnown: true }, comment: 'بركان' }); });
await sleep(500);
const vs0 = await Z.page.evaluate(() => { vlStart(); return window.__vlEngine.phase; });
ok(!!(await until(async () => (await VLs()).phase === 'QUESTION', 20000)) && await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('volcanic-lands')), 'الأراضي البركانية: بدأت الجولة الحقيقية وفُتحت جولة أحداث', await VLs());
const v3 = await Z.page.evaluate(() => { const e = window.__vlEngine; const sum = () => e.allPlayers().reduce((a, p) => a + p.height, 0); const s0 = sum(); const r = window.BatmishEvents.trigger('volcanic-lands', 'volcanic-lands.e3'); return { ok: r.ok, d: sum() - s0 }; });
ok(v3.ok && v3.d >= 2, 'المنطقة الذهبية: لاعب نال بلوكات إضافية فعلاً', v3);
const v2 = await Z.page.evaluate(() => { const e = window.__vlEngine; const ps = e.alivePlayers(); ps[0].height = 9; const before = ps.map((p) => p.height).join(); const sum0 = ps.reduce((a, p) => a + p.height, 0); const r = window.BatmishEvents.trigger('volcanic-lands', 'volcanic-lands.e2'); const after = ps.map((p) => p.height).join(); return { ok: r.ok, changed: before !== after, same: ps.reduce((a, p) => a + p.height, 0) === sum0 }; });
ok(v2.ok && v2.changed && v2.same, 'الصخور المتحركة: تبادل لاعبان ارتفاعيهما والمجموع ثابت', v2);
const v1 = await Z.page.evaluate(() => { const e = window.__vlEngine; const l0 = e.lavaLevel; const r = window.BatmishEvents.trigger('volcanic-lands', 'volcanic-lands.e1'); return { ok: r.ok, l0, l1: e.lavaLevel }; });
ok(v1.ok && v1.l1 === v1.l0 + 1, 'ثوران مفاجئ: ارتفعت الحمم بلوكاً إضافياً', v1);
const v4 = await Z.page.evaluate(() => { const e = window.__vlEngine; const r = window.BatmishEvents.trigger('volcanic-lands', 'volcanic-lands.e4'); window.__lv0 = e.lavaLevel; window.__rd = e.round; return { ok: r.ok, d: e.settings.difficulty }; });
ok(v4.ok && v4.d === 'hell', 'الحمم المتصاعدة: وضع «جحيم» لهذه الجولة', v4);
await Z.page.evaluate(() => { vlSkipQuestion(); });
ok(!!(await until(async () => (await VLs()).phase === 'LAVA_RISE' || (await VLs()).phase === 'BURN', 30000)), 'الأراضي البركانية: وصلت الجولة لمرحلة ارتفاع الحمم');
await until(async () => (await VLs()).phase === 'BURN', 15000);
const v4b = await Z.page.evaluate(() => { const e = window.__vlEngine; return { rise: e.lavaLevel - window.__lv0, expect: window.VolcanicLands.lavaRiseForRound(window.__rd, 'hell') }; });
ok(v4b.rise === v4b.expect, 'الحمم المتصاعدة: الارتفاع الفعلي طبّق وضع الجحيم', v4b);
await sleep(1500);
ok(await Z.page.evaluate(() => window.__vlEngine.settings.difficulty === 'normal'), 'الحمم المتصاعدة: عادت الصعوبة الأصلية بعد الحرق');
// النجاة الأخيرة: نُنهي المباراة ونتحقق من التنظيف
await until(async () => { const s = await VLs(); return s && (s.phase === 'QUESTION' || s.phase === 'GAME_OVER'); }, 20000);
const v5 = await Z.page.evaluate(() => { const e = window.__vlEngine; const ps = e.alivePlayers(); ps.slice(3).forEach((p) => { p.alive = false; }); const alive = e.alivePlayers(); const minH = Math.min(...alive.map((p) => p.height)); const low = alive.find((p) => p.height === minH); const h0 = low.height; const r = window.BatmishEvents.trigger('volcanic-lands', 'volcanic-lands.e5'); return { ok: r.ok, n: alive.length, d: low.height - h0, phase: e.phase }; });
ok(v5.ok && v5.d === 3, 'النجاة الأخيرة: أضعف الناجين نال 3 بلوكات', v5);
await Z.page.evaluate(() => { try { vlRestart(); } catch (e) {} });
await sleep(1800);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0), 'الأراضي البركانية: لا أحداث نشطة بعد الإعادة');
await Z.page.evaluate(() => { try { show('home'); } catch (e) {} });

// ---------- حرف النجاة
await enable('harfnajat', ['harfnajat.e1', 'harfnajat.e2', 'harfnajat.e3', 'harfnajat.e4', 'harfnajat.e5']);
await Z.page.evaluate(() => { launchHarfNajat(); });
const hnReady = await until(() => Z.page.evaluate(() => { try { const a = harfnajatApi(); return !!(a && a._h); } catch (e) { return false; } }), 40000);
ok(!!hnReady, 'حرف النجاة: فُتح الإطار الحقيقي وتوفّر محرك اللعبة للأحداث');
await sleep(2000);
await Z.page.evaluate(() => { window.__hnResume = setInterval(() => { try { const a = harfnajatApi(); if (a && a.getState().paused) a.resume(); } catch (e) { /* لا شيء */ } }, 250); });
await Z.page.evaluate(() => { const a = harfnajatApi(); a.openLobby(); for (let i = 1; i <= 4; i++) a.addParticipant({ userId: 'hn' + i, nickname: 'حرف' + i }); });
await sleep(600);
const HN = () => Z.page.evaluate(() => { const h = harfnajatApi()._h, S = h.S; return { phase: S.phase, turn: S.turn ? { id: S.turn.id, seq: S.turn.seq, pid: S.turn.playerId, letter: S.turn.letter, cat: S.turn.cat, tl: S.turn.timeLeft } : null, ans: h.T.ANSWER, n: Array.from(S.players.values()).filter((p) => p.status !== 'out').length }; });
// نراقب بدء الدور داخل الصفحة نفسها كي نطبّق الحدث قبل كشف الحرف
const hn1 = await Z.page.evaluate(() => new Promise((res) => { const a = harfnajatApi(); a.start(); const t0 = Date.now(); const iv = setInterval(() => { const S = a._h.S; if (S.turn && (S.phase === 'picking' || S.phase === 'walking')) { clearInterval(iv); const before = S.turn.letter; const r = window.BatmishEvents.trigger('harfnajat', 'harfnajat.e1'); res({ ok: r.ok, before, after: S.turn.letter, phase: S.phase }); } else if (Date.now() - t0 > 90000) { clearInterval(iv); res({ ok: false, timeout: true }); } }, 25); }));
ok(hn1.ok && hn1.after && hn1.after !== hn1.before, 'الحرف النادر: تغيّر حرف الدور قبل كشفه', hn1);
const hnShown = await until(async () => Z.page.evaluate(() => { const d = document.getElementById('harfnajat-frame').contentDocument.getElementById('h-let'); return d && d.textContent; }), 120000);
const hnS = await HN();
ok(hnShown && hnShown === hnS.turn.letter, 'الحرف النادر: الحرف المكشوف على شاشة اللعبة هو الحرف الجديد', { hnShown, turn: hnS.turn });
await until(async () => (await HN()).phase === 'answer', 150000);
const hn2 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('harfnajat', 'harfnajat.e2'); return { ok: r.ok, tl: harfnajatApi()._h.S.turn.timeLeft }; });
ok(hn2.ok && hn2.tl <= 8, 'الوقت المتقلص: قُصّرت مهلة الإجابة فعلاً', hn2);
const hn4 = await Z.page.evaluate(() => { const S = harfnajatApi()._h.S, pid = S.turn.playerId, base = S.players.get(pid).accepted; const r = window.BatmishEvents.trigger('harfnajat', 'harfnajat.e4'); window.__hnBase = base; window.__hnPid = pid; window.__hnTurn = S.turn.id; harfnajatApi().receiveChat({ userId: pid, nickname: 'x', text: 'جواب' }); return { ok: r.ok, phase: S.phase }; });
await until(async () => (await HN()).phase === 'judging', 20000);
const hn4b = await Z.page.evaluate(() => { const h = harfnajatApi()._h; const r = h.decide('accept', window.__hnTurn); return { r, acc: h.S.players.get(window.__hnPid).accepted }; });
await sleep(1500);
const hn4c = await Z.page.evaluate(() => harfnajatApi()._h.S.players.get(window.__hnPid).accepted);
ok(hn4.ok && hn4c === window.__hnBase + 2 || hn4.ok && hn4c >= hn4b.acc + 1, 'الكلمة الذهبية: القبول منح نقطة إضافية (إجمالي نقطتين)', { hn4, hn4b, hn4c });
await until(async () => { const s = await HN(); return s.turn && s.turn.seq > 1 && (s.phase === 'picking' || s.phase === 'walking'); }, 240000);
const hn3 = await Z.page.evaluate(() => { const S = harfnajatApi()._h.S; if (!(S.turn && (S.phase === 'picking' || S.phase === 'walking'))) return { ok: false, phase: S.phase }; const r = window.BatmishEvents.trigger('harfnajat', 'harfnajat.e3'); return { ok: r.ok, letter: S.turn.letter }; });
ok(hn3.ok && String(hn3.letter).length === 2, 'حرفان متتاليان: صار الحرف المطلوب حرفين', hn3);
const hn5 = await Z.page.evaluate(() => { const h = harfnajatApi()._h; const before = h.T.ANSWER; const r = window.BatmishEvents.trigger('harfnajat', 'harfnajat.e5'); return { ok: r.ok, before, after: h.T.ANSWER }; });
ok(hn5.ok && hn5.after === hn5.before + 10, 'النجاة الأخيرة: مُدِّدت مهلة الإجابة 10 ثوانٍ', hn5);
await Z.page.evaluate(() => { harfnajatApi()._h.debug.forceWin(); });
await until(() => Z.page.evaluate(() => harfnajatApi()._h.S.phase === 'win'), 150000);
await sleep(1800);
ok(await Z.page.evaluate((b) => harfnajatApi()._h.T.ANSWER === b && window.BatmishEvents.status().active.length === 0, hn5.before), 'حرف النجاة: انتهاء المباراة أعاد المهلة وأنهى الأحداث');

console.log('== أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
