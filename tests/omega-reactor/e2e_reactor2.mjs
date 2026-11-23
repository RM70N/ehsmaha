// المفاعل أوميغا — فحوص إضافية: خيار 2 وخيار 3، لقطات لكل مرحلة (شحن/نجاة/إقصاء)، تسرب موارد WebGL، وضع عمودي 9:16.
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم: node tests/omega-reactor/e2e_reactor2.mjs  (PORTRAIT=1 للجوال العمودي)
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url)); const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname; const THREE = ROOT + 'tests/bridge/fixtures/three-r128';
const SHOTS = process.env.SHOTS || '/tmp/omega-shots2', PORT = !!process.env.PORTRAIT; fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext(PORT ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : { viewport: { width: 640, height: 360 } });
const ful = (p) => async (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(p) });
await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, ful(THREE + '/build/three.min.js'));
await ctx.route(/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/three@0\.128\.0\/(.*)$/, async (r) => { const m = r.request().url().match(/three@0\.128\.0\/(.*)$/); return ful(THREE + '/' + m[1])(r); });
await ctx.route(/fonts\./, r => r.abort());
// عدّادات موارد WebGL (إنشاء − حذف)
await ctx.addInitScript(() => { window.__glc = { tex: 0, buf: 0, prog: 0, fbo: 0, rb: 0 }; for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) { if (!C) continue; const P = C.prototype; [['createTexture', 'deleteTexture', 'tex'], ['createBuffer', 'deleteBuffer', 'buf'], ['createProgram', 'deleteProgram', 'prog'], ['createFramebuffer', 'deleteFramebuffer', 'fbo'], ['createRenderbuffer', 'deleteRenderbuffer', 'rb']].forEach(([c, d, k]) => { const oc = P[c], od = P[d]; P[c] = function () { window.__glc[k]++; return oc.apply(this, arguments); }; P[d] = function (x) { if (x) window.__glc[k]--; return od.apply(this, arguments); }; }); } });
const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|fonts/.test(m.text())) errs.push('console: ' + m.text()); });
await pg.goto('http://127.0.0.1:8790/roulette3d.html?rq=low'); await pg.waitForTimeout(2500);
const S = () => pg.evaluate(() => window.EhsemhaRoulette.getState());
ok('تفتح اللعبة بلا أخطاء' + (PORT ? ' (9:16 جوال)' : ''), errs.length === 0, errs);
await pg.evaluate(() => { const R = window.EhsemhaRoulette; R.settings({ demo: false, decTime: 8, elimMode: 'f3' }); for (let i = 1; i <= 4; i++) R.chat('id' + i, 'لاعب' + i, 'دخول', ''); }); await pg.waitForTimeout(600);
await pg.screenshot({ path: `${SHOTS}/lobby.png` });
const N0 = (await S()).players.length; ok('انضم اللاعبون', N0 >= 4, N0);
const glStart = await pg.evaluate(() => ({ ...window.__glc }));
await pg.evaluate(() => window.EhsemhaRoulette.start());
const waitDec = async (ms = 240000) => { try { await pg.waitForFunction(() => { const s = window.EhsemhaRoulette.getState().state; return s === 'WAITING_FOR_DECISION' || s === 'GAME_OVER' || s === 'RESULTS'; }, null, { timeout: ms }); } catch (e) {} return S(); };
const send = (pid, m) => pg.evaluate(([pid, m]) => window.EhsemhaRoulette.chat(pid, 'x', String(m), '', Date.now() + 5), [pid, m]);
let s = await waitDec(); ok('الدوران انتهى بصاحب دور', s.state === 'WAITING_FOR_DECISION', s.state);
await pg.screenshot({ path: `${SHOTS}/decision.png` });
// خيار 2
{ const pid = s.pending.pid, p0 = s.players.find(p => p.id === pid).passes, a0 = s.players.filter(p => p.alive).length; await send(pid, 2);
  await pg.waitForFunction((pid) => { const t = window.EhsemhaRoulette.getState(); return t.state !== 'WAITING_FOR_DECISION' || !t.pending || t.pending.pid !== pid; }, pid, { timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(500); const t = await S(); ok('خيار 2: يستهلك امتناعًا واحدًا', t.players.find(p => p.id === pid).passes === p0 - 1, { p0, now: t.players.find(p => p.id === pid).passes });
  ok('خيار 2: لا إقصاء', t.players.filter(p => p.alive).length === a0); s = await waitDec(); }
// خيار 3
{ if (s.state === 'WAITING_FOR_DECISION') { const pid = s.pending.pid, a0 = s.players.filter(p => p.alive).length; await send(pid, 3);
  const tp = await pg.waitForFunction(() => window.EhsemhaRoulette.getState().state === 'TARGET_PICK', null, { timeout: 60000 }).then(() => true).catch(() => false);
  ok('خيار 3: تظهر قائمة اختيار اللاعب', tp); await pg.screenshot({ path: `${SHOTS}/target_pick.png` });
  if (tp) { await send(pid, 1); s = await waitDec(); const a1 = s.players.filter(p => p.alive).length; ok('خيار 3: نُفِّذ على الهدف (إصابة أو نجاة) وعادت اللعبة لحالة سليمة', a1 === a0 || a1 === a0 - 1, { a0, a1, st: s.state });
    const tu = await pg.evaluate((pid) => { const x = window.EhsemhaRoulette.getState().players.find(p => p.id === pid); return !!x; }, pid); ok('خيار 3: اللاعب صاحب القرار ما زال في القائمة', tu); } } }
// خيار 1 مرارًا: لقطات الشحن والنجاة والإقصاء
let shots = { charge: false, safe: false, out: false }, rounds = 0, glMid = null;
const watcher = setInterval(async () => { try { const st = await pg.evaluate(() => ({ act: document.querySelector('#act')?.classList.contains('on'), big: document.querySelector('#big')?.className || '', t: document.querySelector('#bigT')?.textContent || '' })); 
  if (st.act && !shots.charge) { shots.charge = true; await pg.screenshot({ path: `${SHOTS}/charge.png` }); }
  if (/safe/.test(st.big) && /show/.test(st.big) && !shots.safe) { shots.safe = true; await pg.screenshot({ path: `${SHOTS}/safe.png` }); }
  if (/out/.test(st.big) && /show/.test(st.big) && !shots.out) { shots.out = true; await pg.screenshot({ path: `${SHOTS}/out.png` }); } } catch (e) {} }, 700);
while (rounds++ < 30) { s = await waitDec(); if (s.state !== 'WAITING_FOR_DECISION') break; const pid = s.pending.pid; if (rounds === 2) glMid = await pg.evaluate(() => ({ ...window.__glc })); await send(pid, 1); await pg.waitForTimeout(1500); }
clearInterval(watcher); await pg.waitForTimeout(1500);
const fin = await S(); ok('انتهت المباراة بفائز', fin.state === 'GAME_OVER' || fin.state === 'RESULTS' || fin.players.filter(p => p.alive).length === 1, fin.state);
ok('لقطة مرحلة الشحن التُقطت', shots.charge); ok('لقطة النجاة التُقطت', shots.safe); ok('لقطة الإقصاء التُقطت', shots.out);
const glEnd = await pg.evaluate(() => ({ ...window.__glc }));
console.log('  GL live (start→mid→end):', JSON.stringify(glStart), JSON.stringify(glMid), JSON.stringify(glEnd));
ok('موارد WebGL لا تنمو بعد منتصف المباراة بشكل غير محدود (textures/buffers نمو ≤ 40)', glMid ? ((glEnd.tex - glMid.tex) <= 40 && (glEnd.buf - glMid.buf) <= 40) : true, { glMid, glEnd });
ok('لا أخطاء JS/console طوال المباراة', errs.length === 0, errs.slice(0, 4));
await pg.screenshot({ path: `${SHOTS}/end.png` });
await b.close(); console.log(`\nنجح ${pass} / فشل ${fail}`); process.exit(fail ? 1 : 0);
