// رحلة الفضاء داخل احسمها: تكامل حقيقي (الموقع الفعلي + الإطار الأصلي + مستمع البث الموحّد).
// تشغيل: python3 -m http.server 8790 (من جذر المشروع) ثم  node tests/space-odyssey/e2e_space_odyssey.mjs
import { createRequire } from 'module'; import crypto from 'crypto'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright'); const { installFakeFirebase } = require('./desktop/test/e2e/fake-firebase.js');
const ROOT = new URL('../../', import.meta.url).pathname, BASE = process.env.BASE || 'http://127.0.0.1:8790/';
const ORIGINAL_SHA = 'dd86a198b5ca905f1025f315b64fdc109edc3356793bd2de7352a07f59c35f45'; // SHA-256 لملف «رحلة الفضاء» الأصلي كما وصل
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
console.log('== SO) رحلة الفضاء — سلامة الملف');
ok('SHA-256 لملف اللعبة في المشروع = الأصل', sha(ROOT + 'space-odyssey.html') === ORIGINAL_SHA, sha(ROOT + 'space-odyssey.html'));
if (process.env.ORIGINAL_FILE) ok('تطابق بايت-ببايت مع الملف المرفوع', Buffer.compare(fs.readFileSync(ROOT + 'space-odyssey.html'), fs.readFileSync(process.env.ORIGINAL_FILE)) === 0);

const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push('PE ' + e)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('CE ' + m.text().slice(0, 200)); });
await installFakeFirebase(pg, ROOT + 'index.html');
await pg.goto(BASE + 'index.html'); await pg.waitForTimeout(2500);
await pg.evaluate(() => { localStorage.setItem(STREAMER_USER_STORAGE_KEY, 'streamer1'); window.homeHasActiveConnection = () => true; window.__wins = []; window.recordWin = (u, n) => window.__wins.push([u.uniqueId, n]); window.__rs = 0; const o = window.contestNoteRoundStarted; window.contestNoteRoundStarted = (t) => { window.__rs++; try { o && o(t); } catch (e) {} }; });

console.log('== SO) المكتبة');
const lib = await pg.evaluate(() => { const cards = [...document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag="spaceodyssey"]')]; const c = cards[0]; return { n: cards.length, name: c && c.querySelector('.gcard-name').textContent, cat: c && c.getAttribute('data-category'), extra: c && c.getAttribute('data-extra-cats'), desc: c && c.querySelector('.gcard-desc').textContent, onclick: c && c.getAttribute('onclick'), dup: document.querySelectorAll('.gcard[data-tag="spaceodyssey"]').length - cards.length, others: document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag]').length }; });
ok('بطاقة واحدة فقط في سجل ألعاب الستريمر', lib.n === 1 && lib.dup <= 0, lib);
ok('الاسم والتصنيف 3D والوصف المطلوب', lib.name === 'رحلة الفضاء' && lib.cat === '3d' && lib.desc.includes('انطلق مع فريقك في رحلة فضائية ثلاثية الأبعاد') && lib.desc.includes('كوكب الكنز'), lib);
ok('المعرّف spaceodyssey فريد ولا يتعارض (كل tags فريدة)', await pg.evaluate(() => { const t = [...document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag]')].map(x => x.getAttribute('data-tag')); return new Set(t).size === t.length; }));
// البحث + زر التفاصيل + زر اللعب من واجهة المكتبة الحقيقية
await pg.evaluate(() => { document.getElementById('hlob-q').value = 'فضاء'; document.getElementById('hlob-q').dispatchEvent(new Event('input', { bubbles: true })); });
await pg.waitForTimeout(400);
const found = await pg.evaluate(() => [...document.querySelectorAll('#hlob-grid [data-tag]')].map(e => e.getAttribute('data-tag')));
ok('البحث «فضاء» يظهر رحلة الفضاء', found.includes('spaceodyssey'), found);
const cat3d = await pg.evaluate(() => { document.getElementById('hlob-q').value = ''; document.getElementById('hlob-q').dispatchEvent(new Event('input', { bubbles: true })); const chip = [...document.querySelectorAll('#hlob-catchips [data-cat], #hlob-catchips button')].find(x => /ثلاثية|3d/i.test((x.getAttribute('data-cat') || '') + x.textContent)); if (chip) chip.click(); return new Promise(r => setTimeout(() => r({ chip: !!chip, tags: [...document.querySelectorAll('#hlob-grid [data-tag]')].map(e => e.getAttribute('data-tag')) }), 400)); });
ok('يظهر ضمن تصنيف «ثلاثية الأبعاد»', cat3d.chip && cat3d.tags.includes('spaceodyssey'), cat3d);
await pg.evaluate(() => { const chip = [...document.querySelectorAll('#hlob-catchips [data-cat], #hlob-catchips button')][0]; chip && chip.click(); });
await pg.waitForTimeout(500);
const dlg = await pg.evaluate(() => new Promise(r => { const t = document.querySelector('#hlob-grid [data-tag="spaceodyssey"] [data-hlob="open"]'); t.click(); setTimeout(() => { const ov = document.getElementById('hlob-dlg-ov'); r({ on: ov.classList.contains('on'), info: (document.getElementById('hlob-dlg-info') || {}).textContent || '' }); }, 600); }));
ok('زر التفاصيل يفتح الحوار بفكرة اللعبة وطريقة اللعب', dlg.on && /الأغلبية/.test(dlg.info) && /كوكب الكنز/.test(dlg.info) && /١|1/.test(dlg.info), dlg);
await pg.evaluate(() => { const c = document.getElementById('hlob-dlg-ov'); const x = c && c.querySelector('[data-hlob="dlg-close"],[data-hlob="dlg-bg"]'); x && x.click(); });

console.log('== SO) التشغيل');
const noConn = await pg.evaluate(() => { window.homeHasActiveConnection = () => false; let opened = 0; const o = window.homeOpenQuickConnect; window.homeOpenQuickConnect = () => { opened++; }; goSetupSpaceOdyssey(); const r = { page: document.querySelector('.page.active').id, opened, frameSrc: document.getElementById('spaceodyssey-frame').getAttribute('src') }; window.homeOpenQuickConnect = o; window.homeHasActiveConnection = () => true; return r; });
ok('بلا اتصال بث: لا تفتح اللعبة وتعرض نافذة الربط السريع', noConn.page !== 'pg-spaceodyssey' && noConn.opened === 1 && !noConn.frameSrc, noConn);
await pg.evaluate(() => document.querySelector('.games-grid.hlob-registry .gcard[data-tag="spaceodyssey"]').click());
await pg.waitForFunction(() => window.__spaceOdysseyIntegration && window.__spaceOdysseyIntegration.isReady(), null, { timeout: 40000 });
const run = await pg.evaluate(() => { const f = document.getElementById('spaceodyssey-frame'), w = f.contentWindow; const r = f.getBoundingClientRect(); return { page: document.querySelector('.page.active').id, src: f.getAttribute('src'), setup: !w.document.getElementById('s-setup').hidden, canvas: !!w.document.querySelector('canvas'), w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, hooks: typeof w.EhsemhaSpace.setHooks, listener: typeof homeGameListeners.spaceodyssey }; });
ok('البطاقة تفتح اللعبة داخل الموقع (إطار بملء الشاشة) وتظهر شاشة الإعداد الأصلية ومشهد 3D', run.page === 'pg-spaceodyssey' && /space-odyssey\.html\?embed=1/.test(run.src) && run.setup && run.canvas && run.w === run.vw && run.h === run.vh && run.listener === 'function', run);
await pg.screenshot({ path: '/tmp/so_setup.png' });

console.log('== SO) البث والانضمام');
const F = await pg.evaluateHandle(() => document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace);
const ev = (u, t, ex) => pg.evaluate(([u, t, ex]) => homeDispatchToGameListeners({ sourcePlatform: 'tiktok', messages: [Object.assign({ type: 'WebcastChatMessage', comment: t, msgId: 'm' + Math.random(), user: { uniqueId: 'tiktok:' + u, nickname: 'ن' + u, profilePictureUrl: 'https://x/a.png', followRole: 1, followKnown: true } }, ex || {})] }), [u, t, ex]);
const S = () => pg.evaluate(() => document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace.getState());
const A = (fn, ...a) => pg.evaluate(([fn, a]) => document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace[fn](...a), [fn, a]);
await A('open'); await pg.waitForTimeout(400);
for (let i = 0; i < 6; i++) await ev('b' + i, 'ازرق'); for (let i = 0; i < 6; i++) await ev('r' + i, 'احمر');
await ev('x1', 'كلمة عشوائية'); await ev('b0', 'ازرق'); await ev('b0', 'احمر');
await pg.waitForTimeout(300);
let st = await S();
ok('وصول التعليقات من جسر الموقع وتوزيع الفرق (6 أزرق / 6 أحمر، تجاهل العشوائي والمكرر)', st.phase === 'lobby' && st.blue.size === 6 && st.red.size === 6 && (await A('teamOf', 'tiktok:b0')) === 'blue' && (await A('teamOf', 'tiktok:r0')) === 'red' && (await A('teamOf', 'tiktok:x1')) === null, { p: st.phase, b: st.blue.size, r: st.red.size });
const joinInfo = await pg.evaluate(() => { const w = document.getElementById('spaceodyssey-frame').contentWindow; const g = w.EhsemhaSpace.game(); const u = g.S.roster.get('tiktok:b1').user; return u; });
ok('هوية المرسل واسمه وصورته وصلت للعبة', joinInfo.uniqueId === 'tiktok:b1' && joinInfo.nickname === 'نb1' && !!joinInfo.avatar, joinInfo);
// شرط المتابعة: غير المتابع المعلوم يُعلّق، ثم يدخل عند حدث متابعة
await pg.evaluate(() => { window.__gateOn = true; window.__origFGR = window.followGateRequired; window.followGateRequired = () => true; });
await ev('nf1', 'ازرق', { user: { uniqueId: 'tiktok:nf1', nickname: 'نnf1', followRole: 0, followKnown: true, followInfo: { followStatus: 0 } } });
await pg.waitForTimeout(200);
const pend = (await S()).blue.size;
await pg.evaluate(() => homeDispatchToGameListeners({ sourcePlatform: 'tiktok', messages: [{ type: 'WebcastSocialMessage', user: { uniqueId: 'tiktok:nf1', nickname: 'نnf1', followKnown: true } }] }));
await pg.waitForTimeout(200);
const afterFollow = (await S()).blue.size;
await pg.evaluate(() => { window.followGateRequired = window.__origFGR; });
ok('شرط المتابعة: غير المتابع لا ينضم، وبعد حدث المتابعة ينضم', pend === 6 && afterFollow === 7, { pend, afterFollow });
await A('removePlayer', 'tiktok:nf1');

console.log('== SO) التصويت والدور');
await A('start');
await pg.waitForFunction(() => { const s = document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace.getState(); return s.vote && s.vote.status === 'OPEN'; }, null, { timeout: 60000 });
st = await S();
ok('الفريق الأزرق يأخذ السؤال الأول (4 خيارات)', st.vote.team === 'blue' && st.vote.choices.length === 4 && st.activeTeam === 'blue' && st.round >= 1, { t: st.vote.team, c: st.vote.choices });
const Cc = await pg.evaluate(() => document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace.game().S.q.correctChoice), Dd = (Cc % 4) + 1; // C = الخيار الصحيح، D = خيار خاطئ
for (let i = 0; i < 6; i++) await ev('b' + i, String(Cc));     // 6 أصوات للخيار الصحيح
for (let i = 0; i < 4; i++) await ev('b' + i, String(Dd));     // 4 يغيّرون إلى خيار آخر (تغيير التصويت)
await pg.waitForTimeout(150);
for (let i = 0; i < 4; i++) await ev('b' + i, String(Cc));     // يرجعون → 6 مقابل 0
await ev('r0', '1'); await ev('r1', '2'); await ev('r2', '2'); // أصوات الفريق المنتظر
for (const bad of ['9', '0', '5', 'ابا', '12']) await ev('b5', bad); // خيارات غير صالحة
await ev('b5', String(Cc)); await ev('b5', String(Cc));         // تكرار
await pg.waitForTimeout(200);
st = await S();
ok('تجاهل أصوات الفريق المنتظر + رفض الخيارات غير الصالحة + منع التكرار (6 مصوّتين)', st.vote.voters === 6 && st.vote.counts && st.vote.counts[Cc - 1] === 6 && st.vote.counts.reduce((a, b) => a + b, 0) === 6, st.vote);
// الأغلبية: 6 للخيار 2 ثم 4 للخيار 3 (تغيير) — تُثبت الأغلبية الصحيحة
for (let i = 0; i < 4; i++) await ev('b' + i, String(Dd));
await pg.waitForTimeout(150); st = await S();
ok('تغيير التصويت يحدّث العدادات (2 للصحيح، 4 للآخر)', st.vote.counts[Cc - 1] === 2 && st.vote.counts[Dd - 1] === 4, st.vote.counts);
for (let i = 0; i < 4; i++) await ev('b' + i, String(Cc));
await pg.waitForTimeout(150);
const before = await S();
await A('closeVote'); await pg.waitForTimeout(600);
st = await S();
ok('إغلاق التصويت: الأغلبية تُعتمد (الخيار الصحيح) والنتيجة تُعلن', !!st.result && st.result.decision === 'decided' && st.result.choice === Cc && st.result.correct === true, st.result);
ok('احتساب النقاط للفريق الأزرق فقط', st.result.team === 'blue' && st.blue.score > 0 && st.red.score === 0, { bs: st.blue.score, rs: st.red.score });
await pg.screenshot({ path: '/tmp/so_result.png' });
// الدور التالي: الأحمر، وأصوات الأزرق تُتجاهل
await pg.waitForFunction(() => { const s = document.getElementById('spaceodyssey-frame').contentWindow.EhsemhaSpace.getState(); return s.vote && s.vote.status === 'OPEN' && s.vote.team === 'red'; }, null, { timeout: 90000 });
st = await S();
await ev('b0', '1'); await ev('r0', '3'); await pg.waitForTimeout(150);
st = await S();
ok('الدور التالي للأحمر: صوت الأزرق مُتجاهل وصوت الأحمر محسوب', st.vote.team === 'red' && st.vote.voters === 1 && st.vote.counts[2] === 1, st.vote);
const prog = { b: st.blue.progress, r: st.red.progress };
ok('تحريك السفينة: الأزرق تقدّم بعد إجابته الصحيحة والأحمر لم يتحرك', st.blue.progress > 0 && st.red.progress === 0, prog);

console.log('== SO) الفوز والخروج وإعادة الفتح');
const w0 = await pg.evaluate(() => window.__wins.length);
await A('forceWin', 'blue'); await pg.waitForTimeout(800);
const wins = await pg.evaluate(() => window.__wins);
ok('شاشة النهاية + تسجيل فوز كل أعضاء الفريق الفائز في نظام الموقع', (await S()).phase === 'finished' && wins.length - w0 === 6 && wins.every(w => /^tiktok:b/.test(w[0]) && w[1] === 'رحلة الفضاء'), wins);
await pg.screenshot({ path: '/tmp/so_final.png' });
// رسالة مزيّفة لا تُقبل (ليست من إطار اللعبة)
const rs0 = await pg.evaluate(() => window.__rs);
await pg.evaluate(() => window.postMessage({ source: 'ehsemha-space', type: 'match-start', data: {} }, '*')); await pg.waitForTimeout(200);
ok('رسالة postMessage من غير إطار اللعبة تُرفض', (await pg.evaluate(() => window.__rs)) === rs0);
// الخروج
await pg.evaluate(() => document.querySelector('#pg-spaceodyssey .ehsn-bar button').click()); await pg.waitForTimeout(500);
const out = await pg.evaluate(() => ({ page: document.querySelector('.page.active').id, src: document.getElementById('spaceodyssey-frame').getAttribute('src'), listener: !!homeGameListeners.spaceodyssey, active: __spaceOdysseyIntegration.isActive() }));
ok('الخروج: رجوع للمكتبة، إزالة المستمع، تفريغ الإطار، لا نسخة تعمل بالخلفية', out.page === 'pg-home' && out.src === 'about:blank' && !out.listener && !out.active, out);
// إعادة الفتح مرتين: لا مستمعات مكررة (تعليق واحد = رسالة واحدة بالعدّاد)
for (let k = 0; k < 2; k++) { await pg.evaluate(() => goSetupSpaceOdyssey()); await pg.waitForFunction(() => window.__spaceOdysseyIntegration.isReady(), null, { timeout: 40000 }); if (k === 0) await pg.evaluate(() => document.querySelector('#pg-spaceodyssey .ehsn-bar button').click()); }
await A('open'); await pg.waitForTimeout(300);
const c0 = (await S()).stats.chat; await ev('z1', 'ازرق'); await pg.waitForTimeout(200); const c1 = (await S()).stats.chat;
ok('إعادة الفتح: جلسة نظيفة ومستمع واحد (تعليق واحد = مرة واحدة) وعدد مستمعات البث = 1', c1 - c0 === 1 && await pg.evaluate(() => Object.keys(homeGameListeners).filter(k => k === 'spaceodyssey').length === 1), { c0, c1 });
// لا تأثير على بقية الألعاب
await pg.evaluate(() => document.querySelector('#pg-spaceodyssey .ehsn-bar button').click()); await pg.waitForTimeout(300);
const other = await pg.evaluate(async () => { show('tt10'); await new Promise(r => setTimeout(r, 300)); tt10Scores.clear(); tt10Round = 0; tt10GameStatus = 'waiting'; tt10StartRound(); return { page: document.querySelector('.page.active').id, q: !!tt10CurrentQuestion, so: !!homeGameListeners.spaceodyssey }; });
ok('لعبة أخرى (توب 10) تعمل بعد الخروج بلا بقايا من رحلة الفضاء', other.page === 'pg-tt10' && other.q && !other.so, other);
ok('لا أخطاء JavaScript/وحدة التحكم ناتجة عن التكامل', errs.filter(e => !/webgl/i.test(e)).length === 0, errs.slice(0, 5));
console.log(`\nنجح ${pass} / فشل ${fail}`); await b.close(); process.exit(fail ? 1 : 0);
