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



console.log('== FRAMES) نظام الإطارات');
const Z = await newCtx('Z');
await open(Z.page);
const uid = await signup(Z.page, 'frm_user', 'frm@test.com');
const key = await Z.page.evaluate(() => levelsKey(currentUsername));
console.log('key', key, 'uid', uid);
const admin = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const rtdb = (p, body) => fetch(`http://127.0.0.1:9000/${p}.json?ns=${NS}`, { method: body ? 'PUT' : 'GET', headers: admin, body: body ? JSON.stringify(body) : undefined }).then((r) => r.json());
await rtdb('levels/' + key, { key, username: 'frm_user', level: 20, xp: 5000, ownedFrames: ['anime01', 'anime02', 'anime03'], levelFrames: ['anime01', 'anime02', 'anime03'] });
// بلا ربط تيك توك: محاولة التفعيل
await Z.page.evaluate(() => framesOpen('owned'));
await sleep(1500);
const cards = await Z.page.evaluate(() => [...document.querySelectorAll('#frm-grid .frm-card')].map((c) => ({ id: c.dataset.frameId, btn: c.querySelector('button.frm-use-btn')?.textContent.trim() })));
ok(cards.length === 3, 'يعرض الإطارات الثلاثة المملوكة', cards);
await Z.page.screenshot({ path: SHOTS + '/frm-1-owned.png' });
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime01"] .frm-use-btn');
await sleep(1500);
const s1 = await Z.page.evaluate(() => ({ active: framesSelfActive, modal: !!document.querySelector('[id*="tiktok"][class*="open"], #player-tiktok-modal, .ptk-modal-overlay.on'), pend: framesPendingAction }));
console.log('بلا ربط:', JSON.stringify(s1));
await Z.page.screenshot({ path: SHOTS + '/frm-2-nolink.png' });

// الربط عبر المودال الحقيقي
await Z.page.fill('#player-tiktok-username', 'frm_tk'); await Z.page.click('#player-tiktok-save-btn'); await sleep(3500);
await sleep(1500);
const s2 = await Z.page.evaluate(() => ({ link: playerTiktokLinkGet(), active: framesSelfActive, keys: framesSelfKeys(), pend: framesPendingAction }));
console.log('بعد الربط:', JSON.stringify(s2));
await Z.page.screenshot({ path: SHOTS + '/frm-3-linked.png' });
const rt1 = await rtdb('levels/frm_tk'); const rt0 = await rtdb('levels/' + key);
console.log('rtdb tk:', JSON.stringify(rt1), ' site:', JSON.stringify(rt0).slice(0, 200));
ok(s2.active === 'anime01', 'بعد الربط يُفعَّل الإطار المنتظر تلقائياً', s2);
// تبديل
await Z.page.evaluate(() => { playerTiktokModalClose(); framesOpen('owned'); }); await sleep(1500);
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime02"] .frm-use-btn'); await sleep(1500);
ok((await Z.page.evaluate(() => framesSelfActive)) === 'anime02', 'التبديل لإطار ثاني');
ok((await Z.page.evaluate(() => document.querySelectorAll('#frm-grid .frm-card-active').length)) === 1, 'بطاقة واحدة مفعّلة فقط بالواجهة');
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime03"] .frm-use-btn'); await sleep(1500);
ok((await Z.page.evaluate(() => framesSelfActive)) === 'anime03', 'تبديل ثالث');
const rt2 = await rtdb('levels/frm_tk'); ok(rt2 && rt2.activeFrame === 'anime03', 'RTDB (مفتاح تيك توك) فيه آخر إطار', rt2 && rt2.activeFrame);
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime03"] .frm-use-btn-active'); await sleep(1500);
ok((await Z.page.evaluate(() => framesSelfActive)) === '', 'إلغاء التفعيل');
await Z.page.click('#frm-grid .frm-card[data-frame-id="anime01"] .frm-use-btn'); await sleep(1500);
// إعادة تحميل: يثبت؟
await Z.page.reload(); await Z.page.waitForFunction(() => window.__auth && document.getElementById('auth-loader').classList.contains('hidden'), null, { timeout: 25000 }); await sleep(2500);
await Z.page.evaluate(() => framesOpen('owned')); await sleep(2500);
ok((await Z.page.evaluate(() => framesSelfActive)) === 'anime01', 'الإطار يثبت بعد إعادة تحميل الصفحة', await Z.page.evaluate(() => ({ a: framesSelfActive, o: framesSelfOwned, keys: framesSelfKeys() })));
await Z.page.screenshot({ path: SHOTS + '/frm-4-after-reload.png' });

// ===== ظهور الإطارات بشاشات الانتظار/الراوندات بحجم موحّد =====
const FR = ['anime01', 'anime02', 'anime03', 'anime04', 'anime05', 'anime06', 'anime07', 'anime08', 'anime09', 'anime10', 'anime11', 'anime12'];
for (let i = 0; i < FR.length; i++) await rtdb('levels/pf' + i, { key: 'pf' + i, activeFrame: FR[i], activeFrameAt: Date.now(), ownedFrames: [FR[i]] });
await rtdb('levels/frm_tk', { key: 'frm_tk', activeFrame: 'anime05', activeFrameAt: Date.now(), ownedFrames: FR });
const pages = await Z.page.evaluate(() => [...document.querySelectorAll('[id$="-p-usernames"], #p-usernames')].map((e) => ({ id: e.id, page: e.closest('.page') && e.closest('.page').id })));
console.log('صفحات فيها قوائم منضمين:', pages.length, pages.map((x) => x.page).join(' '));
const bad = [];
for (const pg of pages) {
  const r = await Z.page.evaluate(async ([pg]) => {
    const host = document.getElementById(pg.id);
    document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
    document.getElementById(pg.page).classList.add('active');
    host.innerHTML = '';
    const names = ['pf0', 'pf1', 'pf2', 'pf3', 'pf4', 'pf5', 'pf6', 'pf7', 'pf8', 'pf9', 'pf10', 'pf11'];
    names.forEach((u, i) => host.appendChild(buildParticipantChip({ uniqueId: u, nickname: i === 3 ? 'اسم لاعب طويل جداً جداً' : 'لاعب' + (i + 1) }, i + 1, null)));
    host.appendChild(buildParticipantChip({ uniqueId: 'plain1', nickname: 'بدون إطار' }, 13, null));
    await new Promise((r) => setTimeout(r, 2500));
    const fr = [...host.querySelectorAll('.p-username-tag.p-has-full-frame')];
    const m = fr.map((t) => { const b = t.getBoundingClientRect(), c = t.querySelector('.p-avatar-circle').getBoundingClientRect(), n = t.querySelector('.p-username-name').getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width), cd: Math.round(c.width), ch: Math.round(c.height), inside: c.left >= b.left - 1 && c.right <= b.right + 1 && c.top >= b.top - 1 && c.bottom <= b.bottom + 1, nameVis: n.width > 20 && n.right <= b.right + 1 && n.left >= b.left - 1, shown: b.height > 0 }; });
    return { n: fr.length, m };
  }, [pg]);
  const hs = new Set(r.m.map((x) => x.h)), cds = new Set(r.m.map((x) => x.cd));
  if (r.n !== 12 || hs.size !== 1 || cds.size !== 1 || r.m.some((x) => !x.inside || !x.nameVis || x.ch !== x.cd)) bad.push({ page: pg.page, n: r.n, hs: [...hs], cds: [...cds], inside: r.m.filter((x) => !x.inside).length, name: r.m.filter((x) => !x.nameVis).length });
  if (pg.page === 'pg-dash') console.log('مقاسات pg-dash:', JSON.stringify(r.m[0]));
  if (pg.page === 'pg-dash' || pg.page === 'pg-cr') await Z.page.screenshot({ path: SHOTS + '/frm-chips-' + pg.page + '.png' });
}
ok(bad.length === 0, 'كل صفحات الانتظار: 12 إطاراً بنفس الحجم، الأفتار داخل الفتحة، والاسم ظاهر', bad);
const sz = await Z.page.evaluate(() => { const t = document.querySelector('.p-username-tag.p-has-full-frame'); const b = t.getBoundingClientRect(); return { h: Math.round(b.height), w: Math.round(b.width) }; });
console.log('الحجم الفعلي للبطاقة بإطار:', JSON.stringify(sz));

// ===== تبديل اللاعب لإطاره من جهازه يظهر فوراً عند الستريمر (جهاز ثاني) =====
await rtdb('levels/frm_tk', { key: 'frm_tk', activeFrame: 'anime01', activeFrameAt: Date.now(), ownedFrames: ['anime01', 'anime02', 'anime03'], level: 20 });
await rtdb('levels/frm_user', { key, username: 'frm_user', level: 20, xp: 5000, ownedFrames: ['anime01', 'anime02', 'anime03'], levelFrames: ['anime01', 'anime02', 'anime03'], activeFrame: 'anime01', activeFrameAt: Date.now() });
const Y = await newCtx('Y');
await open(Y.page); await signup(Y.page, 'streamer1', 's1@test.com');
await Y.page.evaluate(() => { document.querySelectorAll('.page').forEach((x) => x.classList.remove('active')); document.getElementById('pg-dash').classList.add('active'); const h = document.getElementById('p-usernames'); h.innerHTML = ''; h.appendChild(buildParticipantChip({ uniqueId: 'frm_tk', nickname: 'لاعب الإطار' }, 1, 'ptag-frm_tk')); });
const bg = () => Y.page.evaluate(() => { const t = document.getElementById('ptag-frm_tk'); return t ? (t.classList.contains('p-has-full-frame') ? t.style.backgroundImage.slice(0, 120) : 'none') : 'gone'; });
await until(async () => (await bg()) !== 'none', 8000);
const bg1 = await bg(); ok(bg1 !== 'none' && bg1 !== 'gone', 'عند الستريمر: يظهر إطار اللاعب فور بناء البطاقة');
await Z.page.evaluate(() => { framesOpen('owned'); }); await sleep(1500);
await Z.page.evaluate(() => framesSetActive('anime02')); 
const changed = await until(async () => (await bg()) !== bg1, 15000);
ok(!!changed, 'عند الستريمر: تبديل اللاعب لإطاره يتحدّث حياً بدون إعادة تحميل');
await Z.page.evaluate(() => framesSetActive(''));
const removed = await until(async () => (await bg()) === 'none', 15000);
ok(!!removed, 'عند الستريمر: إلغاء الإطار يزيله حياً');

const real = errors.filter((e) => !/no webgl/i.test(e)); ok(real.length === 0, 'لا أخطاء JS', real.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`); await browser.close(); process.exit(fail ? 1 : 0);
