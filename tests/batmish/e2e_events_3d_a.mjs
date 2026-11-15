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
const IFR = (id) => `document.getElementById('${id}').contentWindow`;
// ---------- القنبلة المتحركة
await enable('bomb', ['bomb.e1', 'bomb.e2', 'bomb.e3', 'bomb.e4', 'bomb.e5']);
await api('/batmish/events/event', { tag: 'bomb', eventId: 'bomb.e3', values: { durationSec: 30 } });
await Z.page.evaluate(() => new Promise((r) => window.BatmishEvents.reload(r)));
await Z.page.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, '_zvd4'); show('setup-bomb'); document.getElementById('bomb-kw').value = 'دخول'; launchBomb(); });
const bombReady = await until(() => Z.page.evaluate(() => { try { return bombApi().getState().screen === 'waiting'; } catch (e) { return false; } }), 40000);
ok(!!bombReady, 'القنبلة: فُتح الإطار الحقيقي وظهرت شاشة الانتظار');
await Z.page.evaluate(() => { const a = bombApi(); a.settings({ times: '60,60,60', minP: 2 }); for (let i = 1; i <= 5; i++) a.join('bu' + i, 'لاعب' + i, '', true); });
const bj = await Z.page.evaluate(() => { startBombRound(); return bombApi().getState().status; });
await sleep(900);
const bst = () => Z.page.evaluate(() => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; return { status: B.G.status, holder: B.G.holder, rem: B.G.remaining, size: B.G.part.size, imm: B.GRANTS.immune.size, hn: document.getElementById('bomb-frame').contentDocument.getElementById('b3d-hn').textContent, passes: B.G.stats.passes }; });
const b0 = await bst();
ok(b0.status === 'active' && b0.holder && (await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('bomb'))), 'القنبلة: بدء الراوند الحقيقي يفتح جولة أحداث', b0);
const be1 = await Z.page.evaluate(() => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; const before = B.G.holder; const r = window.BatmishEvents.trigger('bomb', 'bomb.e1'); return { ok: r.ok, before, after: B.G.holder }; });
ok(be1.ok && be1.after && be1.after !== be1.before, 'القنبلة المجنونة: انتقلت القنبلة فجأة إلى لاعب آخر فعلاً', be1);
const be3 = await Z.page.evaluate(() => { const r = window.BatmishEvents.trigger('bomb', 'bomb.e3'); return r.ok; });
await sleep(700);
const b3 = await bst();
ok(be3 && b3.hn === '؟؟؟', 'القنبلة المتخفية: اسم الحامل مخفي على لوحة اللعبة', b3);
await Z.page.evaluate(() => { const a = window.BatmishEvents.status().active; a.forEach((x) => window.BatmishEvents.engine().cancelEvent('bomb', x.id)); });
const b3b = await bst();
ok(b3b.hn !== '؟؟؟' && b3b.hn.length > 0, 'القنبلة المتخفية: عاد اسم الحامل بعد الحدث', b3b);
const be2 = await Z.page.evaluate(() => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; const r = window.BatmishEvents.trigger('bomb', 'bomb.e2'); const p0 = B.G.stats.passes; let t; B.G.part.forEach((q) => { if (q.id !== B.G.holder && !t) t = q; }); B.commandPass(B.G.holder, String(t.num)); return { ok: r.ok, p0 }; });
await sleep(1000);
const b2 = await bst();
ok(be2.ok && b2.passes >= be2.p0 + 2, 'التمرير المزدوج: تلت التمريرةَ الأولى تمريرةٌ ثانية فورية', { be2, b2 });
const be4 = await Z.page.evaluate(() => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; const before = B.G.remaining; const r = window.BatmishEvents.trigger('bomb', 'bomb.e4'); return { ok: r.ok, before, after: B.G.remaining }; });
ok(be4.ok && be4.before > 10 && be4.after <= 3.1, 'العد التنازلي المفاجئ: قصّر مهلة الانفجار فعلاً', be4);
await sleep(300);
const be5 = await Z.page.evaluate(() => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; B.G.remaining = 40; const r = window.BatmishEvents.trigger('bomb', 'bomb.e5'); const act = window.BatmishEvents.engine()._rounds.bomb.active.find((x) => x.eventId === 'bomb.e5'); const uid = act && act.data && act.data.uid; return { ok: r.ok, uid, has: !!(uid && B.G.part.has(uid)) }; });
ok(be5.ok && be5.uid && be5.has, 'فرصة النجاة: اختير لاعب فعلي وسُلّح خطّاف الحصانة', be5);
const be5x = await Z.page.evaluate((uid) => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; const n0 = B.G.part.size; B.explode(uid); return { n0, n1: B.G.part.size, has: B.G.part.has(uid) }; }, be5.uid);
ok(be5x.has && be5x.n1 === be5x.n0, 'فرصة النجاة: الانفجار لم يقصِ المحصّن فعلاً', be5x);
await sleep(1900);
ok(await Z.page.evaluate(() => !window.BatmishEvents.status().active.some((a) => a.eventId === 'bomb.e5')), 'فرصة النجاة: انتهى الحدث بعد استهلاك الحصانة');
await Z.page.evaluate((uid) => { const B = document.getElementById('bomb-frame').contentWindow.__B3D; window.__n0 = B.G.part.size; B.G.exploding = false; B.explode(uid); }, be5.uid);
await sleep(400);
ok(await Z.page.evaluate(() => document.getElementById('bomb-frame').contentWindow.__B3D.G.part.size === window.__n0 - 1), 'القنبلة: الانفجار التالي لنفس اللاعب يقصيه (الحصانة انتهت)');
await Z.page.evaluate(() => { try { document.getElementById('bomb-frame').contentWindow.EhsemhaBomb3D.reset(); } catch (e) {} }); await sleep(2200);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0 && !window.BatmishEvents.status().rounds.includes('bomb')), 'القنبلة: إعادة الضبط أنهت جولة الأحداث وأعادت كل شيء');
await Z.page.evaluate(() => { try { bomb3dTeardown(); } catch (e) {} show('home'); });

// ---------- شد الحبل 3D
await enable('tug', ['tug.e1', 'tug.e2', 'tug.e3', 'tug.e4', 'tug.e5']);
await Z.page.evaluate(() => { show('setup-tug'); const v = { 'tug-team-a-name': 'الصقور', 'tug-team-b-name': 'النمور', 'tug-team-a-kw': 'صقر', 'tug-team-b-kw': 'نمر', 'tug-pull-kw': 'شد' }; Object.entries(v).forEach(([i, x]) => { document.getElementById(i).value = x; }); launchTug(); });
const tugReady = await until(() => Z.page.evaluate(() => { try { return tugApi().getState().status === 'waiting'; } catch (e) { return false; } }), 40000);
ok(!!tugReady, 'شد الحبل: فُتح الإطار الحقيقي وغرفة الانتظار');
await Z.page.evaluate(() => { const a = tugApi(); for (let i = 0; i < 3; i++) { a.join({ uniqueId: 'ta' + i, nickname: 'صقر' + i }, 'a'); a.join({ uniqueId: 'tb' + i, nickname: 'نمر' + i }, 'b'); } });
const tj = await Z.page.evaluate(() => { const r = startTugRound(); return { r, st: tugApi().getState().status }; });
await sleep(900);
const TC = () => Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const S = t.core.S(); return { st: S.status, knot: S.knot, fa: S.forceA, fb: S.forceB, ends: S.endsAt, ks: t.K.KNOT_SPEED, ma: t.K.TEAM_MULT.a, mb: t.K.TEAM_MULT.b, pulls: S.pulls, now: t.now() }; });
const tg0 = await TC();
ok(tj.r === true && tg0.st === 'active' && await Z.page.evaluate(() => window.BatmishEvents.status().rounds.includes('tug')), 'شد الحبل: بدء الراوند الحقيقي يفتح جولة أحداث', tg0);
const tg1 = await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const S = t.core.S(); S.knot = 30; S.forceA = 0; S.forceB = 0; const r = window.BatmishEvents.trigger('tug', 'tug.e1'); return { ok: r.ok, fa: S.forceA, fb: S.forceB }; });
ok(tg1.ok && tg1.fa > 10 && tg1.fb === 0, 'دفعة الجمهور: قوة كبيرة للفريق المتأخر (A لأن العقدة نحو B)', tg1);
const tg3 = await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const S = t.core.S(); S.knot = 0; const r = window.BatmishEvents.trigger('tug', 'tug.e3'); return { ok: r.ok, knot: S.knot }; });
ok(tg3.ok && Math.abs(tg3.knot) >= 10 && Math.abs(tg3.knot) <= 85, 'الشد المفاجئ: العقدة قفزت لجهة عشوائية', tg3);
const tg4 = await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const S = t.core.S(); const e0 = S.endsAt; const r = window.BatmishEvents.trigger('tug', 'tug.e4'); return { ok: r.ok, knot: S.knot, add: S.endsAt - e0, fa: S.forceA, fb: S.forceB }; });
ok(tg4.ok && tg4.knot === 0 && tg4.add === 10000 && tg4.fa === 0 && tg4.fb === 0, 'جولة التعادل: عادت العقدة للمنتصف وأُضيفت 10 ثوانٍ', tg4);
const tg2 = await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const prev = t.K.KNOT_SPEED; const r = window.BatmishEvents.trigger('tug', 'tug.e2'); return { ok: r.ok, prev, now: t.K.KNOT_SPEED }; });
ok(tg2.ok && tg2.now === tg2.prev * 0.5, 'الحبل الثقيل: سرعة العقدة نصفت', tg2);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('tug', a.id)); });
ok((await TC()).ks === tg2.prev, 'الحبل الثقيل: عادت السرعة بعد الحدث');
const tg5 = await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; const S = t.core.S(); const r = window.BatmishEvents.trigger('tug', 'tug.e5'); const team = t.K.TEAM_MULT.a === 2 ? 'a' : 'b'; const other = team === 'a' ? 'b' : 'a'; S.forceA = 0; S.forceB = 0; const f0 = (x) => (x === 'a' ? S.forceA : S.forceB); t.core.registerPull({ uniqueId: 'ta0' }, team); const strong = f0(team); S.lastPull = new Map(); t.core.registerPull({ uniqueId: 'tb0' }, other); const weak = f0(other); return { ok: r.ok, team, strong, weak }; });
ok(tg5.ok && Math.abs(tg5.strong / tg5.weak - 2) < 1e-6, 'قوة الفريق: سحبة الفريق المعزَّز تساوي ضعف سحبة المنافس فعلاً', tg5);
await Z.page.evaluate(() => { window.BatmishEvents.status().active.forEach((a) => window.BatmishEvents.engine().cancelEvent('tug', a.id)); });
ok(await Z.page.evaluate(() => { const t = document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t; return t.K.TEAM_MULT.a === 1 && t.K.TEAM_MULT.b === 1; }), 'قوة الفريق: عادت المضاعفات إلى 1');
await Z.page.evaluate(() => { document.getElementById('tug-frame').contentWindow.EhsemhaTug3D._t.core.finish('a'); }); await sleep(1700);
ok(await Z.page.evaluate(() => window.BatmishEvents.status().active.length === 0 && !window.BatmishEvents.status().rounds.includes('tug')), 'شد الحبل: انتهاء الراوند أنهى جولة الأحداث');
await Z.page.evaluate(() => { try { tugApi().reset(); } catch (e) {} show('home'); });


console.log('== أخطاء الصفحة');
const real = errors.filter((e) => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
