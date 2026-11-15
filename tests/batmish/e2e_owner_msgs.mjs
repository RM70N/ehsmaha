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



console.log('== OWNER-MSGS) رسائل المالك فوق كل الصفحات والألعاب');
const Z = await newCtx('Z');
await open(Z.page);
const pageIds = await Z.page.evaluate(() => [...document.querySelectorAll('.page')].map((p) => p.id));
console.log('عدد الصفحات:', pageIds.length);
const bad = [];
for (const [kind, position] of [['personal', 'top'], ['broadcast', 'center']]) {
  for (const id of pageIds) {
    const r = await Z.page.evaluate(async ([id, kind, position]) => {
      document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      EHMOwnerMessages.hideAll();
      EHMOwnerMessages.show({ kind, position, text: 'رسالة اختبار من المالك', durationMode: 'permanent' });
      await new Promise((r) => setTimeout(r, 450));
      const root = document.querySelector('.ehm-owner-' + (position === 'center' ? 'imperial' : 'signal') + '[data-kind="' + kind + '"], .ehm-owner-' + (position === 'center' ? 'imperial' : 'signal-stack') + '[data-kind="' + kind + '"] .ehm-owner-signal');
      const t = [...document.querySelectorAll('[class*="ehm-owner-"]')].find((e) => /رسالة اختبار/.test(e.textContent) && e.getBoundingClientRect().width > 50 && e.getBoundingClientRect().height > 10 && !/stack/.test(e.className.toString()) );
      if (!t) return { id, missing: true };
      const b = t.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + Math.min(b.height / 2, 30));
      const ok = !!(top && top.closest('[class*="ehm-owner-"]'));
      EHMOwnerMessages.hideAll();
      return { id, ok, over: ok ? '' : (top && (top.id || top.className || top.tagName)) };
    }, [id, kind, position]);
    if (r.missing || !r.ok) bad.push({ kind, position, ...r });
  }
}
ok(bad.length === 0, 'الرسائل (خاصة/عامة × أعلى/منتصف) تظهر فوق كل صفحة وكل لعبة', bad.slice(0, 12));
// شاشة الفوز EhsemhaWin فوق صفحة لعبة
const w = await Z.page.evaluate(async () => {
  document.querySelectorAll('.page').forEach((x) => x.classList.remove('active')); document.getElementById('pg-dash').classList.add('active');
  EhsemhaWin.show({ name: 'فائز', key: 'k' + Date.now(), actions: [] });
  await new Promise((r) => setTimeout(r, 1500));
  EHMOwnerMessages.show({ kind: 'broadcast', position: 'center', text: 'رسالة اختبار من المالك', durationMode: 'permanent' });
  await new Promise((r) => setTimeout(r, 900));
  const t = [...document.querySelectorAll('[class*="ehm-owner-"]')].find((e) => /رسالة اختبار/.test(e.textContent) && e.getBoundingClientRect().width > 50);
  const b = t.getBoundingClientRect(); const top = document.elementFromPoint(b.x + b.width / 2, b.y + 30);
  return !!(top && top.closest('[class*="ehm-owner-"]'));
});
ok(w, 'الرسالة تظهر فوق شاشة الفوز (EhsemhaWin)');
await Z.page.screenshot({ path: SHOTS + '/owner-msg-over-win.png' });
const real = errors.filter((e) => !/no webgl/i.test(e)); ok(real.length === 0, 'لا أخطاء JS', real.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`); await browser.close(); process.exit(fail ? 1 : 0);
