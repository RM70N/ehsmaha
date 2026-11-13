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
const bind = (uid, streamer) => fetch(API + '/__bind', { method: 'POST', body: JSON.stringify({ uid, streamer }) });

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

console.log('== 3) فتح اللوحة (التصميم الجديد) والتعديل');
await Z.page.click('#batmish-launch');
await Z.page.waitForSelector('#batmish-root.is-open', { timeout: 8000 });
await Z.page.waitForSelector('.bm-hero-body h1', { timeout: 8000 });
await sleep(2300);
await Z.page.screenshot({ path: SHOTS + '/02-command-center.png' });
const cc = await Z.page.evaluate(() => ({ h1: document.querySelector('.bm-hero-body h1').textContent, sub: document.querySelector('.bm-hero-body h2').textContent, qc: document.querySelectorAll('.bm-qc').length, nav: document.querySelectorAll('.bm-nav-item').length }));
ok(cc.h1 === 'BATMISH' && /الفارس المظلم/.test(cc.sub), 'الصفحة الرئيسية: الشعار والعنوان الفرعي بالعربي', cc);
ok(cc.qc === 10 && cc.nav === 11, 'عشر بطاقات وصول سريع و11 قسماً بالقائمة', cc);
await Z.page.click('.bm-nav-item[data-nav="db"]');
await sleep(700);
const games = await Z.page.evaluate(() => ({ cards: document.querySelectorAll('.bm-gc').length, can: document.querySelectorAll('.bm-gc[data-game]').length }));
ok(games.can >= 17 && games.cards >= games.can, 'كل الألعاب تُكتشف من سجل الموقع (قابلة للتخصيص: ' + games.can + ' من ' + games.cards + ')', games);
await Z.page.screenshot({ path: SHOTS + '/03-games.png' });
await Z.page.click('.bm-gc[data-game="harfnajat"]');
await sleep(700);
await Z.page.fill('input[data-n]', '45');
await sleep(250);
const st1 = await Z.page.evaluate(() => ({ bar: document.getElementById('bm-savebar').classList.contains('is-on'), s: document.getElementById('bm-status').getAttribute('data-s') }));
ok(st1.bar && st1.s === 'dirty', 'تعديل قيمة: يظهر شريط الحفظ وحالة غير محفوظ', st1);
await Z.page.fill('input[data-n]', '2');
await sleep(200);
ok(await Z.page.evaluate(() => document.querySelector('.bm-fp.is-bad') !== null && /بين/.test(document.querySelector('[data-err]').textContent)), 'قيمة خارج المدى: رسالة خطأ ويمنع الحفظ');
ok(await Z.page.evaluate(() => document.querySelector('[data-act="save"]').disabled), 'زر الحفظ معطّل مع قيمة غير صالحة');
await Z.page.fill('input[data-n]', '45');
await sleep(200);
await Z.page.screenshot({ path: SHOTS + '/04-game-settings.png' });
await Z.page.click('[data-act="save"]');
await until(() => Z.page.evaluate(() => document.getElementById('bm-status').getAttribute('data-s') === 'saved'), 6000);
const applied = await Z.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20));
ok(applied === 45, 'بعد الحفظ: modGetSetting يرجّع 45 (يقرأها اللعب من الراوند التالي)', applied);
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
await sleep(2300);
await Z2.page.click('.bm-nav-item[data-nav="presets"]');
await sleep(500);
await Z2.page.click('[data-ptag="harfnajat"]');
await sleep(300);
await Z2.page.fill('#bm-pname', 'FAST ROUND');
await Z2.page.click('[data-act="newpreset"]');
ok(!!(await until(() => Z2.page.evaluate(() => /FAST ROUND/.test(document.querySelector('.bm-view').textContent)), 5000)), 'إنشاء مجموعة FAST ROUND');
await Z2.page.screenshot({ path: SHOTS + '/06-presets.png' });
await Z2.page.click('.bm-nav-item[data-nav="history"]');
await sleep(800);
const hist = await Z2.page.evaluate(() => document.querySelectorAll('.bm-tle').length);
ok(hist >= 1, 'سجل التعديلات يعرض التعديل المحفوظ', hist);
await Z2.page.screenshot({ path: SHOTS + '/07-history.png' });
await Z2.page.click('[data-revert]');
await sleep(900);
ok(await Z2.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20)) === 20, 'التراجع عن التعديل يرجّع القيمة 20');

console.log('== 7) أقسام العرض الأخرى + الصوت');
for (const v of ['settings', 'round', 'players', 'stream', 'balance', 'av', 'auto']) {
  await Z2.page.click(`.bm-nav-item[data-nav="${v}"]`); await sleep(500);
  const info = await Z2.page.evaluate(() => ({ fields: document.querySelectorAll('.bm-fp').length, comms: !!document.querySelector('.bm-comms'), ana: !!document.querySelector('.bm-ana') }));
  if (!(info.fields > 0 || (v === 'stream' && info.comms))) info.dump = await Z2.page.evaluate(() => ({ view: window.Batmish.ui._dash.view, h: document.querySelector('#bm-view').innerHTML.slice(0, 260), err: document.querySelector('#bm-view .bm-pagehead h2') && document.querySelector('#bm-view .bm-pagehead h2').textContent }));
  ok(info.fields > 0 || (v === 'stream' && info.comms) || (v === 'balance' && info.ana), `قسم ${v}: ` + (info.fields ? info.fields + ' إعداد' : 'حالة «غير موصول» صادقة'), info);
}
await Z2.page.screenshot({ path: SHOTS + '/08-section.png' });
await Z2.page.click('.bm-nav-item[data-nav="av"]'); await sleep(400);
await Z2.page.evaluate(() => { for (const k of ['__site.muteEffects', '__site.reduceEffects']) { const c = document.querySelector('[data-k="' + k + '"]'); c.checked = true; c.dispatchEvent(new Event('input', { bubbles: true })); } });
await sleep(200);
await Z2.page.click('[data-act="save"]');
await until(() => Z2.page.evaluate(() => document.getElementById('bm-status').getAttribute('data-s') === 'saved'), 6000);
const fx = await Z2.page.evaluate(async () => { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const o = ctx.createOscillator(); o.connect(ctx.destination); return { muted: Batmish.effects.muted, patched: Batmish.effects.patched, gain: ctx.__bmMaster ? ctx.__bmMaster.gain.value : null, reduce: document.body.classList.contains('bm-reduce-fx') }; });
ok(fx.muted && fx.patched && fx.gain === 0 && fx.reduce, 'كتم المؤثرات + تخفيف الحركة يُطبَّقان مركزياً (صوت WebAudio وCSS)', fx);

console.log('== 8) لغة الواجهة: كل الأزرار والأقسام بالعربي');
const latin = new Set();
for (const v of ['cmd', 'db', 'settings', 'round', 'players', 'stream', 'balance', 'av', 'auto', 'presets', 'history']) {
  await Z2.page.click(`.bm-nav-item[data-nav="${v}"]`); await sleep(450);
  const bad = await Z2.page.evaluate(() => {
    const out = [];
    const ok = (t) => !/[A-Za-z]{3,}/.test(t.replace(/BATMISH|WebAudio|iframe|3D|@[\w.]+|FAST ROUND|CLASSIC NIGHT|DARK CHALLENGE|COMMUNITY NIGHT/gi, ''));
    document.querySelectorAll('#batmish-root button, #batmish-root h1, #batmish-root h2, #batmish-root h3, #batmish-root h4, #batmish-root h5, #batmish-root .bm-tag, #batmish-root .bm-chip, #batmish-root .bm-nav-txt, #batmish-root .bm-eyebrow, #batmish-root label').forEach((e) => { const t = (e.innerText || '').trim(); if (t && !ok(t)) out.push(t.slice(0, 40)); });
    return out;
  });
  bad.forEach((b) => latin.add(v + ': ' + b));
}
ok(latin.size === 0, 'لا نصوص إنجليزية ظاهرة في الأزرار والأقسام والعناوين', [...latin].slice(0, 12));
await Z2.page.click('.bm-nav-item[data-nav="cmd"]'); await sleep(300);
const navTxt = await Z2.page.evaluate(() => [...document.querySelectorAll('.bm-nav-item .ar')].map((e) => e.textContent));
ok(navTxt.length === 11 && navTxt.every((t) => /[\u0600-\u06FF]/.test(t)), 'أسماء الأقسام الـ11 بالعربي', navTxt);

console.log('== 9) اختبار كل زر');
let clicked = 0, problems = [];
for (const v of ['cmd', 'db', 'settings', 'round', 'players', 'stream', 'balance', 'av', 'auto', 'presets', 'history']) {
  await Z2.page.click(`.bm-nav-item[data-nav="${v}"]`); await sleep(500);
  const n = await Z2.page.evaluate(() => document.querySelectorAll('#bm-view button:not([disabled]), #bm-savebar button:not([disabled])').length);
  for (let i = 0; i < n; i++) {
    try {
      const info = await Z2.page.evaluate((idx) => {
        const bs = [...document.querySelectorAll('#bm-view button:not([disabled]), #bm-savebar button:not([disabled])')]; const b = bs[idx]; if (!b) return null;
        if (b.getAttribute('data-nav') && b.getAttribute('data-nav') !== undefined && false) return null;
        b.scrollIntoView({ block: 'center' }); b.click();
        return { act: b.getAttribute('data-act') || b.getAttribute('data-nav') || b.getAttribute('data-game') || b.getAttribute('data-presetact') || b.className.split(' ')[0] };
      }, i);
      if (!info) continue; clicked++;
      await sleep(60);
      const m = await Z2.page.evaluate(() => { const mod = document.querySelector('.bm-modal'); if (!mod) return false; const no = mod.querySelector('[data-no]'); if (no) no.click(); return true; });
      if (m) await sleep(50);
      const alive = await Z2.page.evaluate(() => !!document.querySelector('#batmish-root.is-open'));
      if (!alive) { problems.push(v + '#' + i + ' ' + info.act + ' أغلق اللوحة'); break; }
      // أرجع للقسم لو الزر نقلنا
      await Z2.page.click(`.bm-nav-item[data-nav="${v}"]`); await sleep(120);
    } catch (e) { problems.push(v + '#' + i + ': ' + String(e.message).slice(0, 60)); }
  }
}
ok(clicked > 100 && problems.length === 0, 'نُقر ' + clicked + ' زراً عبر كل الأقسام بلا أخطاء ولا إغلاق غير متوقع', problems.slice(0, 6));

console.log('== 10) فقدان ربط البث → اختفاء فوري');
await Z2.page.evaluate(() => { window.__bmWs.close(); });
ok(!!(await until(async () => !(await btn(Z2.page)) && !(await Z2.page.evaluate(() => { const r = document.getElementById('batmish-root'); return !!r && r.classList.contains('is-open'); })), 6000)), 'عند إغلاق اتصال البث: يختفي الزر وتُغلق اللوحة');
ok(await Z2.page.evaluate(() => modGetSetting('harfnajat', 'answerSeconds', 20)) === 20 && await Z2.page.evaluate(() => Batmish.resolver.active === false), 'التخصيص النشط يُمسح عند فقدان الصلاحية');
const afterDrop = await Z2.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); return (await fetch(Batmish.controller.relay() + '/batmish/overlay', { headers: { Authorization: 'Bearer ' + t } })).status; });
ok(afterDrop === 403, 'الخادم نفسه يرفض بعد فقدان الربط (403)', afterDrop);

console.log('== 11) الجوال');
await linkStream(Z2.page, '_zvd4');
await until(() => btn(Z2.page), 8000);
await Z2.page.setViewportSize({ width: 390, height: 844 });
await sleep(300);
await Z2.page.click('#batmish-launch');
await Z2.page.waitForSelector('#batmish-root.is-open');
await sleep(2300);
await Z2.page.screenshot({ path: SHOTS + '/09-mobile-cmd.png' });
const mob = await Z2.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, rw: document.getElementById('bm-main').scrollWidth, rc: document.getElementById('bm-main').clientWidth, nav: !!document.querySelector('.bm-mnav') && getComputedStyle(document.querySelector('.bm-mnav')).display !== 'none' }));
ok(mob.rw <= mob.rc + 1 && mob.nav, 'جوال: لا تمرير أفقي داخل اللوحة، والتنقل السفلي ظاهر', mob);
await Z2.page.click('.bm-mnav [data-act="menu"]'); await sleep(600);
await Z2.page.screenshot({ path: SHOTS + '/10-mobile-nav.png' });
await Z2.page.evaluate(() => { const d = Batmish.ui._dash; d.arch = 'all'; d.status = 'all'; d.q = ''; });
await Z2.page.click('.bm-nav-item[data-nav="db"]'); await sleep(600);
console.log('  mobile view:', JSON.stringify(await Z2.page.evaluate(() => ({ view: Batmish.ui._dash.view, cards: document.querySelectorAll('.bm-gc').length, calm: document.getElementById('batmish-root').className })))); await Z2.page.click('.bm-gc[data-game="whoami"]'); await sleep(600);
await Z2.page.evaluate(() => { const n = document.querySelector('input[data-n]'); n.value = '15'; n.dispatchEvent(new Event('input', { bubbles: true })); });
await sleep(500);
const bar = await Z2.page.evaluate(() => { const b = document.querySelector('[data-act="save"]').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, h: innerHeight, left: b.left, right: b.right, vw: innerWidth }; });
ok(bar.bottom <= bar.h && bar.top >= 0 && bar.left >= 0 && bar.right <= bar.vw, 'جوال: زر الحفظ ظاهر داخل الشاشة', bar);
const ov = await Z2.page.evaluate(() => { const r = document.getElementById('bm-main'); return { sw: r.scrollWidth, cw: r.clientWidth }; });
ok(ov.sw <= ov.cw + 1, 'جوال: صفحة اللعبة بلا تمرير أفقي', ov);
await Z2.page.screenshot({ path: SHOTS + '/11-mobile-game.png' });

console.log('== 11b) حساب احسمها mish');
{
  const M = await newCtx('M'); await open(M.page);
  const uidM = await signup(M.page, 'mish', 'm@test.com');
  await M.page.evaluate((api) => { TIKTOK_BRIDGE_SERVERS[0] = api.replace('http', 'ws') + '/ws'; }, API);   // توجيه الصفحة لخادم الاختبار (بدون ربط بث)
  await sleep(2500);
  ok(!(await btn(M.page)), 'mish قبل أن يعرّفه الخادم (غير مسجَّل بالسجل): لا زر');
  await fetch(API + '/__siteuser', { method: 'POST', body: JSON.stringify({ name: 'mish', uid: uidM }) });
  await M.page.evaluate(() => { try { Batmish.controller.tick && Batmish.controller.tick(); } catch (e) {} });
  ok(!!(await until(() => btn(M.page), 25000)), 'حساب mish بمجرد الدخول (بدون ربط بث): يظهر الزر');
  if (!(await btn(M.page))) console.log('  DEBUG', JSON.stringify(await M.page.evaluate(async () => { const t = await window.__auth.currentUser.getIdToken(); const r = await fetch(Batmish.controller.relay() + '/batmish/access', { headers: { Authorization: 'Bearer ' + t } }); return { u: typeof currentUsername !== 'undefined' ? currentUsername : null, st: Batmish.controller.state, linked: Batmish.controller.clientLinked(), api: r.status, body: await r.json() }; })));
  const info = await M.page.evaluate(() => ({ s: Batmish.STREAMER, v: Batmish.VIA }));
  ok(info.s === 'mish' && info.v === 'account', 'الخادم أكّد mish عبر الحساب', info);
  await M.page.evaluate(() => document.getElementById('batmish-launch').click());
  const txt = await until(async () => M.page.evaluate(() => { const r = document.getElementById('batmish-root'); return r && r.classList.contains('is-open') ? r.innerText : ''; }), 15000);
  ok(!!txt && /@mish/i.test(txt) && !/ربط البث|الربط مؤكد/.test(txt), 'لوحة mish تفتح باسمه ولا تدّعي ربط بث', (txt || '').slice(0, 300));
  await M.ctx.close();
}
console.log('== 12) أخطاء الصفحة');
const real = errors.filter(e => !/webgl/i.test(e));
ok(real.length === 0, 'لا أخطاء JavaScript', real.slice(0, 5));
await browser.close();
console.log(`\nالنتيجة: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
