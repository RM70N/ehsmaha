// اعثر على الكورة 3D داخل احسمها: تكامل حقيقي (الموقع الفعلي + الإطار + مستمع البث الموحّد) ولعب كامل.
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم  node tests/findball3d/e2e_findball3d.mjs
import { createRequire } from 'module'; import crypto from 'crypto'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8790/';
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
console.log('== FB) اعثر على الكورة 3D');
const ORIG = fs.readFileSync(ROOT + 'tests/findball3d/ORIGINAL.sha256', 'utf8').trim();
if (process.env.ORIGINAL_FILE) ok('ملف التصميم الأصلي المرفوع = المسجّل (SHA-256)', sha(process.env.ORIGINAL_FILE) === ORIG);
// التعديلات على ملف التصميم محصورة بوسوم EHSEMHA-EMBED: نحذف أسطرها المضافة من النسخة فنرجع للأصل بالضبط
{ const mine = fs.readFileSync(ROOT + 'findball3d.html', 'utf8'), diff = fs.readFileSync(ROOT + 'tests/findball3d/adaptations.diff', 'utf8');
  const removed = diff.split('\n').filter(l => l.startsWith('< ')).length, added = diff.split('\n').filter(l => l.startsWith('> ')).length;
  ok('تعديلات ملف التصميم مضافة فقط تقريباً (محذوف ≤ 9 أسطر أصلية، كلها ضمن مواضع الربط) وموثّقة في adaptations.diff', removed <= 9 && added > 40 && mine.includes('EHSEMHA-EMBED'), { removed, added }); }

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push('PE ' + e)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CE ' + m.text().slice(0, 200)); });
await installFakeFirebase(pg, ROOT + 'index.html');
await pg.route(/three(\.min)?\.js/, r => r.fulfill({ path: ROOT + 'tests/bridge/fixtures/three-r128/build/three.min.js', contentType: 'application/javascript' })); // بدل CDN (بيئة الفحص بلا إنترنت)
await pg.addInitScript(() => { try { sessionStorage.setItem('ehsemha-wlc:ehsemha-windows-launch-2026:closed', '1'); } catch (e) {} });
await pg.goto(BASE + 'index.html'); await pg.waitForTimeout(2500);
await pg.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, 'streamer1'); window.homeHasActiveConnection = () => true; window.__wins = []; window.recordWin = (u, n) => window.__wins.push([u.uniqueId, n]); window.__rs = 0; const o = window.contestNoteRoundStarted; window.contestNoteRoundStarted = (t) => { window.__rs++; try { o && o(t); } catch (e) {} }; });

console.log('== FB) المكتبة والتشغيل');
const lib = await pg.evaluate(() => { const c = [...document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag="findball"]')]; return { n: c.length, name: c[0] && c[0].querySelector('.gcard-name').textContent, extra: c[0] && c[0].getAttribute('data-extra-cats'), old: ['pg-setup-findball', 'pg-findball-winner', 'findball-cups'].map(id => !!document.getElementById(id)), solo: !!document.getElementById('pg-setup-findballsolo') }; });
ok('بطاقة اعثر على الكورة واحدة بتصنيف 3D إضافي، والتصميم القديم (صفحات الإعداد/الفوز/الأكواب) محذوف، والنسخة الفردية سليمة', lib.n === 1 && /3d/.test(lib.extra) && lib.old.every(x => !x) && lib.solo, lib);
const noConn = await pg.evaluate(() => { window.homeHasActiveConnection = () => false; let opened = 0; const o = window.homeOpenQuickConnect; window.homeOpenQuickConnect = () => { opened++; }; goSetupFindball(); const r = { page: document.querySelector('.page.active').id, opened }; window.homeOpenQuickConnect = o; window.homeHasActiveConnection = () => true; return r; });
ok('بلا اتصال بث: لا تفتح اللعبة وتعرض نافذة الربط السريع', noConn.page !== 'pg-findball' && noConn.opened === 1, noConn);
await pg.evaluate(() => document.querySelector('.games-grid.hlob-registry .gcard[data-tag="findball"]').click());
await pg.waitForFunction(() => window.__findball3dIntegration && window.__findball3dIntegration.isReady(), null, { timeout: 60000 });
const run = await pg.evaluate(() => { const f = document.getElementById('findball-frame'), d = f.contentDocument, r = f.getBoundingClientRect(); return { page: document.querySelector('.page.active').id, w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, setup: !d.getElementById('panel-setup').classList.contains('hide'), demo: getComputedStyle(d.querySelector('.demo')).display, canvas: !!d.getElementById('fb3d-canvas'), kw: d.getElementById('findball-kw').value, shuffle: d.getElementById('set-shuffleMinMs').value, listener: typeof homeGameListeners.findball, user: d.getElementById('findball-live-user').textContent }; });
ok('تفتح اللعبة داخل الموقع بملء الشاشة وبشاشة الإعداد الأصلية (بلا محاكاة بوتات) ويظهر يوزر الستريمر', run.page === 'pg-findball' && run.w === run.vw && run.h >= run.vh - 120 && run.h <= run.vh && run.setup && run.demo === 'none' && run.canvas && /streamer1/.test(run.user) && run.listener === 'function', run);
ok('إعدادات الموقع (مدة الخلط 6ث…) وصلت لحقول اللعبة', run.shuffle === '6' && run.kw === 'كوب', run);

const A = (fn, ...a) => pg.evaluate(([fn, a]) => document.getElementById('findball-frame').contentWindow.EhsemhaFindball[fn](...a), [fn, a]);
const T = (fn) => pg.evaluate((fn) => { const t = document.getElementById('findball-frame').contentWindow.__fbTest; return typeof t[fn] === 'function' ? t[fn]() : t[fn]; }, fn);
const S = () => A('getState');
const ev = (u, t, ex) => pg.evaluate(([u, t, ex]) => homeDispatchToGameListeners({ sourcePlatform: 'tiktok', messages: [Object.assign({ type: 'WebcastChatMessage', comment: t, msgId: 'm' + Math.random(), user: { uniqueId: 'tiktok:' + u, nickname: 'ن' + u, profilePictureUrl: '', followRole: 1, followKnown: true } }, ex || {})] }), [u, t, ex]);
// إعدادات سريعة للاختبار فقط (تُكتب بنفس حقول اللعبة الأصلية)
await A('configure', { shuffleMinMs: 1500, shuffleMinFloorMs: 800, swapCount: 3, guessTimerSeconds: 4, guessTimerEnabled: true, revivalEnabled: true, revivalMaxUses: 2, keyword: 'كوب' });
await pg.evaluate(() => document.getElementById('findball-frame').contentDocument.getElementById('btn-connect').click()); await pg.waitForTimeout(500);
ok('الدخول للوبي: تظهر لوحة الانتظار', await pg.evaluate(() => !document.getElementById('findball-frame').contentDocument.getElementById('panel-lobby').classList.contains('hide')));

console.log('== FB) الانضمام');
for (let i = 0; i < 6; i++) await ev('p' + i, 'كوب');
await ev('x1', 'كلمة اخرى'); await ev('p0', 'كوب'); await ev('late1', '  كُوب  ');
await pg.waitForTimeout(400);
let st = await S();
ok('انضمام اللاعبين بالكلمة المفتاحية من الشات الحقيقي (6 + المشكّلة)، وتجاهل العشوائي والمكرر', st.players.length === 7 && !st.players.some(p => p.uniqueId === 'tiktok:x1'), st.players.length);
const chips = await pg.evaluate(() => document.getElementById('findball-frame').contentDocument.querySelectorAll('#findball-p-usernames .pchip').length);
ok('قائمة المشاركين المرئية تطابق العدد', chips === 7, chips);
await pg.evaluate(() => { window.__origFGR = window.followGateRequired; window.followGateRequired = () => true; });
await ev('nf1', 'كوب', { user: { uniqueId: 'tiktok:nf1', nickname: 'غير متابع', followRole: 0, followKnown: true, followInfo: { followStatus: 0 } } });
await pg.waitForTimeout(200); const before = (await S()).players.length;
await pg.evaluate(() => homeDispatchToGameListeners({ sourcePlatform: 'tiktok', messages: [{ type: 'WebcastSocialMessage', user: { uniqueId: 'tiktok:nf1', nickname: 'غير متابع', followKnown: true } }] }));
await pg.waitForTimeout(200); const after = (await S()).players.length;
await pg.evaluate(() => { window.followGateRequired = window.__origFGR; });
ok('شرط المتابعة: غير المتابع لا ينضم، وبعد حدث المتابعة ينضم', before === 7 && after === 8, { before, after });

console.log('== FB) الجولات');
const rs0 = await pg.evaluate(() => window.__rs);
await A('startRound');
await pg.waitForFunction(() => document.getElementById('findball-frame').contentWindow.EhsemhaFindball.getState().status === 'guessing', null, { timeout: 60000 });
st = await S(); const slot = st.ballCup;
ok('الجولة 1 مرّت: إخفاء → خلط → تخمين، وتسجّل بدء الجولة في نظام الموقع', st.status === 'guessing' && st.round === 1 && [1, 2, 3].includes(slot) && (await pg.evaluate(() => window.__rs)) > rs0, st);
const wrongSlot = (slot % 3) + 1;
const all = (await S()).players.map(p => p.uniqueId.replace('tiktok:', ''));
const good = all.slice(0, 4), bad = all.slice(4);
for (const u of good) await ev(u, String(slot));
await ev('x1', String(slot));            // غير مشارك
await ev(bad[0], '7');                   // رقم غير صالح
for (const u of bad) await ev(u, String(wrongSlot));
await ev(good[0], String(wrongSlot));    // محاولة تغيير التخمين: ممنوعة
await pg.waitForFunction(() => document.getElementById('findball-frame').contentWindow.EhsemhaFindball.getState().status.startsWith('finished'), null, { timeout: 40000 });
st = await S();
ok('التخمين الصحيح ينجو، والخاطئ يُقصى، وتجاهل غير المشارك والرقم الخاطئ ومحاولة تغيير التخمين', st.status === 'finished-round' && st.players.length === good.length && good.every(u => st.players.some(p => p.uniqueId === 'tiktok:' + u)), { s: st.status, left: st.players.length });
await pg.screenshot({ path: '/tmp/fb_round1.png' });
// الإنعاش بهدية محذوف (سجل الإقصاء أُزيل): هدية من مقصي لا تُرجعه
const target = bad[0];
await pg.evaluate((u) => homeDispatchToGameListeners({ sourcePlatform: 'tiktok', messages: [{ type: 'WebcastGiftMessage', giftName: 'وردة', diamondCount: 1, repeatCount: 1, user: { uniqueId: 'tiktok:' + u, nickname: 'ن' + u, followRole: 1, followKnown: true } }] }), target);
await pg.waitForTimeout(3800);
st = await S();
ok('الإنعاش بالهدايا محذوف: المقصي لا يرجع للعبة بإرسال هدية', !st.players.some(p => p.uniqueId === 'tiktok:' + target), { n: st.players.length });
// بقية الجولات حتى الفوز
let winnerRound = 1;
for (let round = 2; round <= 8; round++) {
  await pg.evaluate(() => document.getElementById('findball-frame').contentDocument.getElementById('findball-results-continue-btn').click());
  await A('startRound');
  await pg.waitForFunction(() => document.getElementById('findball-frame').contentWindow.EhsemhaFindball.getState().status === 'guessing', null, { timeout: 60000 });
  st = await S(); if (st.players.length <= 1) break;
  const ids = st.players.map(p => p.uniqueId.replace('tiktok:', '')), keep = ids.slice(0, Math.max(1, Math.ceil(ids.length / 2)));
  for (const u of ids) await ev(u, String(keep.includes(u) ? st.ballCup : (st.ballCup % 3) + 1));
  await pg.waitForFunction(() => document.getElementById('findball-frame').contentWindow.EhsemhaFindball.getState().status.startsWith('finished'), null, { timeout: 40000 });
  winnerRound = round; st = await S(); if (st.status === 'finished') break;
}
await pg.waitForTimeout(1500); st = await S();
const wins = await pg.evaluate(() => window.__wins);
ok('انتهت اللعبة بفائز واحد وسُجّل فوزه في نظام الموقع باسم اللعبة', st.status === 'finished' && st.players.length === 1 && wins.length === 1 && wins[0][0] === st.players[0].uniqueId && wins[0][1] === 'اعثر على الكورة', { st: st.status, n: st.players.length, wins, winnerRound });
await pg.screenshot({ path: '/tmp/fb_winner.png' });

console.log('== FB) الخروج وإعادة الفتح');
await A('reset'); await pg.waitForTimeout(300);
ok('إعادة الضبط تعيد اللعبة لحالة الانتظار بلا مشاركين', (await S()).status === 'waiting' && (await S()).players.length === 0);
await pg.evaluate(() => document.querySelector('#pg-findball .ehsn-bar button').click()); await pg.waitForTimeout(500);
const out = await pg.evaluate(() => ({ page: document.querySelector('.page.active').id, src: document.getElementById('findball-frame').getAttribute('src'), listener: !!homeGameListeners.findball, active: __findball3dIntegration.isActive() }));
ok('الخروج: رجوع للمكتبة، إزالة المستمع، تفريغ الإطار', out.page === 'pg-home' && out.src === 'about:blank' && !out.listener && !out.active, out);
for (let k = 0; k < 2; k++) { await pg.evaluate(() => goSetupFindball()); await pg.waitForFunction(() => window.__findball3dIntegration.isReady(), null, { timeout: 60000 }); if (k === 0) await pg.evaluate(() => document.querySelector('#pg-findball .ehsn-bar button').click()); }
await pg.evaluate(() => document.getElementById('findball-frame').contentDocument.getElementById('btn-connect').click()); await pg.waitForTimeout(300);
await ev('z1', 'كوب'); await pg.waitForTimeout(200);
ok('إعادة الفتح: جلسة نظيفة ومستمع واحد ولاعب واحد فقط', (await S()).players.length === 1 && await pg.evaluate(() => Object.keys(homeGameListeners).filter(k => k === 'findball').length === 1));
await pg.evaluate(() => window.postMessage({ source: 'ehsemha-findball', type: 'round-start' }, '*')); const rsb = await pg.evaluate(() => window.__rs); await pg.waitForTimeout(150);
ok('رسالة postMessage من غير إطار اللعبة تُرفض', (await pg.evaluate(() => window.__rs)) === rsb);
await pg.evaluate(() => document.querySelector('#pg-findball .ehsn-bar button').click()); await pg.waitForTimeout(300);
const other = await pg.evaluate(async () => { show('tt10'); await new Promise(r => setTimeout(r, 300)); tt10Scores.clear(); tt10Round = 0; tt10GameStatus = 'waiting'; tt10StartRound(); return { page: document.querySelector('.page.active').id, q: !!tt10CurrentQuestion, fb: !!homeGameListeners.findball }; });
ok('لعبة أخرى (توب 10) تعمل بعد الخروج بلا بقايا', other.page === 'pg-tt10' && other.q && !other.fb, other);
const solo = await pg.evaluate(async () => { goSetupFindballSolo(); await new Promise(r => setTimeout(r, 300)); return document.querySelector('.page.active').id; });
ok('لعبة «اعثر على الكورة (فردي)» ما زالت تفتح', solo === 'pg-setup-findballsolo', solo);
ok('لا أخطاء JavaScript ناتجة عن التكامل', errs.filter(e => !/webgl/i.test(e)).length === 0, errs.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
