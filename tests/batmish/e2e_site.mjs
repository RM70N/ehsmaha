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
const bind = (uid) => fetch(API + '/__bind', { method: 'POST', body: JSON.stringify({ uid }) });

console.log('== 1) البوابة: ظهور الزر');
const Z = await newCtx('Z');
await open(Z.page);
const uidZ = await signup(Z.page, 'zvd_user', 'z@test.com');
await bind(uidZ);
await sleep(2500);
ok(!(await btn(Z.page)), 'مسجّل ومثبَّت لكن بدون ربط بث: لا زر');
ok(await Z.page.evaluate(() => !document.getElementById('batmish-css') && !document.querySelector('script[src*="batmish-ui"]')), 'غير مربوط: ما حُمّل CSS ولا واجهة BATMISH');
const lk = await linkStream(Z.page, '_zvd4');
ok(lk.hasToken, 'رابط الجسر لـ_zvd4 يحمل توكن الحساب');
ok(!!(await until(() => btn(Z.page), 8000)), 'بعد ربط البث باسم _zvd4 يظهر زر BATMISH');
await Z.page.screenshot({ path: SHOTS + '/01-button.png' });

console.log('== 2) غير المصرّح: لا زر ولا وصول مباشر');
const O = await newCtx('O');
await open(O.page);
const uidO = await signup(O.page, 'other_user', 'o@test.com');
await linkStream(O.page, '_zvd4');                                   // مشاهد متصل بغرفة _zvd4
await sleep(4000);
ok(!(await btn(O.page)), 'حساب آخر متصل بنفس الغرفة: لا زر');
const direct = await O.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const base = Batmish.controller.relay(); const r = []; for (const p of ['/batmish/bootstrap', '/batmish/overlay', '/batmish/history']) { const x = await fetch(base + p, { headers: { Authorization: 'Bearer ' + t } }); r.push(x.status); } const w = await fetch(base + '/batmish/config', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify({ tag: 'harfnajat', values: { answerSeconds: 99 } }) }); r.push(w.status); return r; });
ok(direct.every((s) => s === 403), 'وصول مباشر للـAPI من حساب غير مصرّح: 403 لكل المسارات', direct);
const O2 = await newCtx('O2'); await open(O2.page);
ok(!(await btn(O2.page)), 'زائر بدون تسجيل: لا زر');
await O2.ctx.close();

console.log('== 3) فتح اللوحة والتعديل');
if (process.env.DBG) { console.log(await Z.page.evaluate(() => { const r = e => { const x = document.querySelector(e); if (!x) return null; const b = x.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; }; return { launch: r('#batmish-launch'), dock: r('.eh-connect-dock'), dockBtn: r('.eh-connect-dock button') }; })); await Z.page.screenshot({ path: SHOTS + '/dbg.png' }); }
await Z.page.click('#batmish-launch');
await Z.page.waitForSelector('#batmish-root.is-open', { timeout: 8000 });
await Z.page.waitForSelector('.bm-hero h1', { timeout: 8000 });
await sleep(900);
await Z.page.screenshot({ path: SHOTS + '/02-command-center.png' });
const cc = await Z.page.evaluate(() => ({ h1: document.querySelector('.bm-hero h1').textContent, tiles: document.querySelectorAll('.bm-tile').length, nav: document.querySelectorAll('.bm-nav button').length, sub: document.querySelector('.bm-hero h2').textContent, tag: document.querySelector('.bm-hero p').textContent }));
ok(cc.h1 === 'BATMISH' && /DARK KNIGHT/.test(cc.sub) && /YOUR STREAM/.test(cc.tag), 'الصفحة الرئيسية: العناوين الصحيحة', cc);
ok(cc.tiles === 10 && cc.nav === 11, 'عشر بطاقات وصول سريع و11 قسماً بالقائمة', cc);
await Z.page.click('.bm-nav button[data-nav="games"]');
await sleep(500);
const games = await Z.page.evaluate(() => ({ cards: document.querySelectorAll('.bm-gcard').length, can: document.querySelectorAll('.bm-gcard:not(.is-off)').length, hidden: document.querySelectorAll('.gcard[data-tag]').length }));
ok(games.can >= 17 && games.cards >= games.can, 'كل الألعاب تُكتشف من سجل الموقع (قابلة للتخصيص: ' + games.can + ' من ' + games.cards + ')', games);
await Z.page.screenshot({ path: SHOTS + '/03-games.png' });
await Z.page.click('[data-game="harfnajat"]');
await sleep(500);
await Z.page.fill('input.bm-numin[data-n]', '45');
await sleep(200);
const st1 = await Z.page.evaluate(() => ({ bar: document.getElementById('bm-savebar').classList.contains('is-on'), s: document.getElementById('bm-status').getAttribute('data-s') }));
ok(st1.bar && st1.s === 'dirty', 'تعديل قيمة: يظهر شريط الحفظ وحالة غير محفوظ', st1);
await Z.page.fill('input.bm-numin[data-n]', '2');
await sleep(150);
ok(await Z.page.evaluate(() => document.querySelector('.bm-field.is-bad') !== null && /بين/.test(document.querySelector('[data-err]').textContent)), 'قيمة خارج المدى: رسالة خطأ ويمنع الحفظ');
ok(await Z.page.evaluate(() => document.querySelector('[data-act="save"]').disabled), 'زر الحفظ معطّل مع قيمة غير صالحة');
await Z.page.fill('input.bm-numin[data-n]', '45');
await sleep(100);
await Z.page.screenshot({ path: SHOTS + '/04-game-settings.png' });
await Z.page.click('[data-act="save"]');
await until(() => Z.page.evaluate(() => document.getElementById('bm-status').getAttribute('data-s') === 'saved'), 6000);
const applied = await Z.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20));
ok(applied === 45, 'بعد الحفظ: modGetSetting يرجّع 45 (يقرأها اللعب من الراوند التالي)', applied);
const sv = await fetch(API + '/__bind', { method: 'POST', body: JSON.stringify({ uid: uidZ }) });
await Z.page.screenshot({ path: SHOTS + '/05-saved.png' });

console.log('== 4) العزل بين الحسابات');
const oSet = await O.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20));
ok(oSet === 20, 'الحساب الآخر يرى القيمة الافتراضية 20 (لم تتأثر)', oSet);

console.log('== 5) الاستمرار بعد التحديث');
const state = await Z.ctx.storageState();
await Z.page.close();
const Z2 = await newCtx('Z2', null, state);
await open(Z2.page);
await linkStream(Z2.page, '_zvd4');
ok(!!(await until(() => btn(Z2.page), 8000)), 'بعد تحديث الصفحة وإعادة الربط: الزر يرجع');
const after = await until(() => Z2.page.evaluate(() => { const v = modGetSetting('harfnajat', 'answerSeconds', 20); return v === 45 ? v : null; }), 6000);
ok(after === 45, 'القيمة المحفوظة 45 تُحمَّل من الخادم بعد التحديث', after);

console.log('== 6) المجموعات والسجل');
await Z2.page.click('#batmish-launch');
await Z2.page.waitForSelector('#batmish-root.is-open');
await sleep(800);
await Z2.page.click('.bm-nav button[data-nav="presets"]');
await sleep(400);
await Z2.page.selectOption('[data-presettag]', 'harfnajat');
await Z2.page.fill('#bm-pname', 'FAST ROUND');
await Z2.page.click('[data-act="newpreset"]');
ok(!!(await until(() => Z2.page.evaluate(() => /FAST ROUND/.test(document.querySelector('.bm-list') ? document.querySelector('.bm-list').textContent : '')), 5000)), 'إنشاء مجموعة FAST ROUND');
await Z2.page.screenshot({ path: SHOTS + '/06-presets.png' });
await Z2.page.click('.bm-nav button[data-nav="history"]');
await sleep(700);
const hist = await Z2.page.evaluate(() => document.querySelectorAll('.bm-list .bm-row').length);
ok(hist >= 1, 'سجل التعديلات يعرض التعديل المحفوظ', hist);
await Z2.page.screenshot({ path: SHOTS + '/07-history.png' });
await Z2.page.click('[data-revert]');
await sleep(900);
ok(await Z2.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20)) === 20, 'التراجع عن التعديل يرجّع القيمة 20');

console.log('== 7) أقسام العرض الأخرى');
for (const v of ['advanced', 'round', 'players', 'stream', 'balance', 'av', 'auto']) {
  await Z2.page.click(`.bm-nav button[data-nav="${v}"]`); await sleep(350);
  const info = await Z2.page.evaluate(() => ({ fields: document.querySelectorAll('.bm-field').length, empty: !!document.querySelector('.bm-empty') }));
  ok(info.fields > 0 || (v === 'stream' && info.empty), `قسم ${v}: ` + (info.fields ? info.fields + ' إعداد' : 'حالة فارغة صادقة'), info);
}
await Z2.page.screenshot({ path: SHOTS + '/08-section.png' });
// الصوت: كتم + مستوى
await Z2.page.click('.bm-nav button[data-nav="av"]'); await sleep(300);
await Z2.page.evaluate(() => { const c = document.querySelector('[data-k="__site.muteEffects"]'); c.checked = true; c.dispatchEvent(new Event('input', { bubbles: true })); const r = document.querySelector('[data-k="__site.reduceEffects"]'); r.checked = true; r.dispatchEvent(new Event('input', { bubbles: true })); });
await Z2.page.click('[data-act="save"]');
await until(() => Z2.page.evaluate(() => document.getElementById('bm-status').getAttribute('data-s') === 'saved'), 6000);
const fx = await Z2.page.evaluate(async () => { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); o.connect(ctx.destination); return { muted: Batmish.effects.muted, patched: Batmish.effects.patched, gain: ctx.__bmMaster ? ctx.__bmMaster.gain.value : null, reduce: document.body.classList.contains('bm-reduce-fx') }; });
ok(fx.muted && fx.patched && fx.gain === 0 && fx.reduce, 'كتم المؤثرات + تخفيف الحركة يُطبَّقان مركزياً (صوت WebAudio وCSS)', fx);

console.log('== 8) فقدان ربط البث → اختفاء فوري');
await Z2.page.evaluate(() => { window.__bmWs.close(); });
ok(!!(await until(async () => !(await btn(Z2.page)) && !(await Z2.page.evaluate(() => !!document.getElementById('batmish-root'))), 6000)), 'عند إغلاق اتصال البث: يختفي الزر وتُغلق اللوحة');
ok(await Z2.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20)) === 20 && await Z2.page.evaluate(() => Batmish.resolver.active === false), 'التخصيص النشط يُمسح عند فقدان الصلاحية');
const afterDrop = await Z2.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); return (await fetch(Batmish.controller.relay() + '/batmish/overlay', { headers: { Authorization: 'Bearer ' + t } })).status; });
ok(afterDrop === 403, 'الخادم نفسه يرفض بعد فقدان الربط (403)', afterDrop);

console.log('== 9) الجوال');
await linkStream(Z2.page, '_zvd4');
await until(() => btn(Z2.page), 8000);
await Z2.page.setViewportSize({ width: 390, height: 844 });
await sleep(300);
await Z2.page.click('#batmish-launch');
await Z2.page.waitForSelector('#batmish-root.is-open');
await sleep(900);
await Z2.page.screenshot({ path: SHOTS + '/09-mobile-cmd.png' });
const mob = await Z2.page.evaluate(() => ({ sw: document.getElementById('batmish-root').scrollWidth, cw: document.getElementById('batmish-root').clientWidth, menu: getComputedStyle(document.querySelector('.bm-menu')).display }));
ok(mob.sw <= mob.cw + 1 && mob.menu !== 'none', 'جوال: لا تمرير أفقي، وزر القائمة ظاهر', mob);
await Z2.page.click('.bm-menu'); await sleep(500);
await Z2.page.screenshot({ path: SHOTS + '/10-mobile-nav.png' });
await Z2.page.click('.bm-nav button[data-nav="games"]'); await sleep(400);
await Z2.page.click('[data-game="whoami"]'); await sleep(500);
await Z2.page.evaluate(() => { const n = document.querySelector('input.bm-numin[data-n]'); n.value = '15'; n.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(400);
const bar = await Z2.page.evaluate(() => { const b = document.querySelector('[data-act="save"]').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, w: b.width, left: b.left, right: b.right, vw: innerWidth }; });
ok(bar.bottom <= bar.h && bar.top >= 0 && bar.left >= 0 && bar.right <= bar.vw, 'جوال: زر الحفظ ظاهر داخل الشاشة', bar);
const ov = await Z2.page.evaluate(() => { const r = document.getElementById('bm-scroll'); return { sw: r.scrollWidth, cw: r.clientWidth }; });
ok(ov.sw <= ov.cw + 1, 'جوال: صفحة اللعبة بلا تمرير أفقي', ov);
await Z2.page.screenshot({ path: SHOTS + '/11-mobile-game.png' });

console.log('== 10) أخطاء الصفحة');
const real = errors.filter(e => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
