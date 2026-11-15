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




console.log('== FRAMES-PICK) اختيار إطار بحصة اللفل ثم تفعيله');
const Z = await newCtx('Z');
await open(Z.page);
await signup(Z.page, 'pick_user', 'pk@test.com');
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const rtdb = (p, body) => fetch(`http://127.0.0.1:9000/${p}.json?ns=${NS}`, { method: body ? 'PUT' : 'GET', headers: admin, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
const fsDoc = (k) => fetch(`http://127.0.0.1:8080/v1/projects/${PID}/databases/(default)/documents/levels/${k}`, { headers: admin }).then((r) => r.json());
// لفل 5 = اختيار واحد فقط
await rtdb('levels/pick_user', { key: 'pick_user', username: 'pick_user', level: 5, xp: 100 });
await Z.page.evaluate(() => { playerTiktokLinkStore({ username: 'pick_tk', nickname: 'pick_tk', avatar: '', at: Date.now() }); framesOpen('catalog'); });
await sleep(2500);
const info = await Z.page.evaluate(() => ({ lvl: framesSelfLevel, rem: framesRemainingPicks(), cards: document.querySelectorAll('#frm-grid .frm-card').length, btns: document.querySelectorAll('#frm-grid .frm-pick-btn').length, bar: document.getElementById('frm-picks').textContent }));
ok(info.lvl === 5 && info.rem === 1 && info.btns > 5, 'لفل 5: متاح اختيار واحد وأزرار «اختيار» ظاهرة', info);
await Z.page.screenshot({ path: SHOTS + '/frm-pick-1.png' });
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime04"] .frm-pick-btn'); await sleep(3500);
const a = await Z.page.evaluate(() => ({ owned: framesSelfOwned, active: framesSelfActive, picked: framesSelfPicked, rem: framesRemainingPicks() }));
ok(a.owned.includes('anime04') && a.active === 'anime04' && a.rem === 0, 'الاختيار يملّك الإطار ويفعّله مباشرة ويستهلك الحصة', a);
const fsd = await fsDoc('pick_tk'), rtd = await rtdb('levels/pick_tk');
ok(JSON.stringify(fsd).includes('anime04') || (rtd && rtd.ownedFrames && rtd.ownedFrames.includes('anime04')), 'الملكية انحفظت بقاعدة البيانات', { fs: !!fsd.fields, rt: rtd && rtd.activeFrame });
const lock = await Z.page.evaluate(() => document.querySelector('#frm-grid .frm-card[data-frame-id="anime05"] .frm-lock')?.textContent);
ok(/لفل/.test(lock || ''), 'بعد استهلاك الحصة: بقية الإطارات مقفلة بنص واضح', lock);
// رفع اللفل → اختيار ثاني، ثم تبديل بين المملوكَين
await rtdb('levels/pick_user', { key: 'pick_user', username: 'pick_user', level: 8, xp: 900 });
await sleep(2500);
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime07"] .frm-pick-btn'); await sleep(3500);
ok((await Z.page.evaluate(() => framesSelfOwned.includes('anime07') && framesSelfActive === 'anime07')), 'اختيار ثاني بعد رفع اللفل');
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime04"] .frm-use-btn'); await sleep(2000);
ok((await Z.page.evaluate(() => framesSelfActive)) === 'anime04', 'التبديل بين المملوكَين من المعرض');
await Z.page.screenshot({ path: SHOTS + '/frm-pick-2.png' });
const real = errors.filter((e) => !/no webgl/i.test(e)); ok(real.length === 0, 'لا أخطاء JS', real.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`); await browser.close(); process.exit(fail ? 1 : 0);
