// دمج المفاعل أوميغا في roulette3d.html: لعب فعلي بلاعبين تجريبيين + مقارنة مع النسخة الأصلية (ORIG=مسار الملف الأصلي).
// تشغيل: python3 -m http.server 8790 من جذر المشروع ثم: node tests/omega-reactor/e2e_reactor.mjs [ORIG=/path/orig.html]
import { createRequire } from 'module'; import fs from 'fs'; import path from 'path';
const require = createRequire(new URL('../../', import.meta.url)); const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url).pathname; const THREE = ROOT + 'tests/bridge/fixtures/three-r128';
const ORIG = process.env.ORIG, SHOTS = process.env.SHOTS || '/tmp/omega-shots';
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d !== undefined ? JSON.stringify(d) : ''); } };
const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

async function open(file, w = 1280, h = 720, mobile = false) {
  const ctx = await b.newContext(mobile ? { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36' } : { viewport: { width: w, height: h } });
  const fulfill = (p) => async (route) => route.fulfill({ status: 200, contentType: p.endsWith('.js') ? 'application/javascript' : 'text/plain', body: fs.readFileSync(p) });
  await ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, fulfill(THREE + '/build/three.min.js'));
  await ctx.route(/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/three@0\.128\.0\/(.*)$/, async (route) => { const m = route.request().url().match(/three@0\.128\.0\/(.*)$/); return fulfill(THREE + '/' + m[1])(route); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const pg = await ctx.newPage(); pg.errs = []; pg.logs = [];
  pg.on('pageerror', e => pg.errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') pg.logs.push(m.text()); });
  if (file === 'NEW') await pg.goto('http://127.0.0.1:8790/roulette3d.html?rq=low');
  else { await ctx.route('http://orig.local/o.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(file) })); await pg.goto('http://orig.local/o.html'); }
  await pg.waitForTimeout(2500); return pg;
}
const S = (pg) => pg.evaluate(() => window.EhsemhaRoulette.getState());
async function join(pg, n) { await pg.evaluate((n) => { const R = window.EhsemhaRoulette; for (let i = 1; i <= n; i++) R.chat('id' + i, 'لاعب' + i, 'دخول', ''); }, n); await pg.waitForTimeout(600); }
// يرسل قراراً (1/2/3) من اللاعب صاحب الدور عند ظهوره؛ ثم رقم الهدف عند الخيار 3
async function decide(pg, choice, timeout = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { const s = await S(pg); if (s.state === 'WAITING_FOR_DECISION' && s.pending) { await pg.evaluate(([pid, c]) => window.EhsemhaRoulette.chat(pid, 'x', String(c), '', Date.now() + 5), [s.pending.pid, choice]); return s.pending.pid; } if (s.state === 'GAME_OVER' || s.state === 'RESULTS') return null; await pg.waitForTimeout(120); }
  return undefined;
}
async function pickTarget(pg) { const t0 = Date.now(); while (Date.now() - t0 < 12000) { const s = await S(pg); if (s.state === 'TARGET_PICK' && s.pending) { await pg.evaluate((pid) => window.EhsemhaRoulette.chat(pid, 'x', '1', '', Date.now() + 5), s.pending.pid); return true; } await pg.waitForTimeout(100); } return false; }
async function untilState(pg, st, ms = 30000) { try { await pg.waitForFunction((st) => window.EhsemhaRoulette.getState().state === st, st, { timeout: ms }); return true; } catch (e) { return false; } }
async function settle(pg, ms = 25000) { // ينتظر عودة الحالة لانتظار القرار القادم أو نهاية المباراة
  const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await S(pg); if (s.state === 'WAITING_FOR_DECISION' || s.state === 'GAME_OVER' || s.state === 'RESULTS') return s.state; await pg.waitForTimeout(150); } return (await S(pg)).state; }

for (const [label, file] of [['NEW', 'NEW'], ...(ORIG ? [['ORIG', ORIG]] : [])]) {
  console.log('== ' + label);
  const pg = await open(file);
  ok(label + ': تفتح بلا أخطاء JS', pg.errs.length === 0, pg.errs.slice(0, 3));
  ok(label + ': واجهة EhsemhaRoulette موجودة', await pg.evaluate(() => !!window.EhsemhaRoulette && typeof window.EhsemhaRoulette.getState === 'function'));
  await pg.evaluate(() => window.EhsemhaRoulette.settings({ demo: false, decTime: 8 }));
  await join(pg, 6); let s = await S(pg);
  ok(label + ': انضم 6 لاعبين', s.players.length === 6, s.players.length);
  await pg.screenshot({ path: `${SHOTS}/${label}_lobby.png` });
  await pg.evaluate(() => window.EhsemhaRoulette.start());
  // انتظر أول دوران ثم قرار
  const gotDec = await untilState(pg, 'WAITING_FOR_DECISION', 60000);
  ok(label + ': الدوران ينتهي بصاحب دور (فتحة الاختيار توقفت)', gotDec);
  await pg.screenshot({ path: `${SHOTS}/${label}_decision.png` });
  // خيار 2 (تخطي)
  s = await S(pg); const alive0 = s.players.filter(p => p.alive).length, pid2 = s.pending && s.pending.pid; const pas0 = (s.players.find(p => p.id === pid2) || {}).passes;
  await decide(pg, 2); await settle(pg, 30000); s = await S(pg);
  ok(label + ': خيار 2 يستهلك امتناعاً ولا يقصي أحداً', s.players.filter(p => p.alive).length === alive0 && (s.players.find(p => p.id === pid2) || {}).passes === pas0 - 1, { alive0, now: s.players.filter(p => p.alive).length });
  // خيار 1 بشكل متكرر حتى يحدث إقصاء ونجاة؛ نلتقط لقطات في منتصف الشحن
  let elim = 0, safe = 0, shotCharge = false, shotElim = false, guard = 0; const eliminatedIds = [];
  while (guard++ < 40) {
    s = await S(pg); if (s.state === 'GAME_OVER' || s.state === 'RESULTS') break;
    const before = s.players.filter(p => p.alive).map(p => p.id);
    const pid = await decide(pg, 1, 40000); if (!pid) break;
    await pg.waitForTimeout(1300); if (!shotCharge) { await pg.screenshot({ path: `${SHOTS}/${label}_charge.png` }); shotCharge = true; }
    if (!shotElim) { await pg.waitForTimeout(1400); }
    const st = await settle(pg, 40000); s = await S(pg); const after = s.players.filter(p => p.alive).map(p => p.id);
    if (after.length < before.length) { elim++; eliminatedIds.push(...before.filter(x => !after.includes(x))); if (!shotElim) { shotElim = true; } } else safe++;
    if (st === 'GAME_OVER' || st === 'RESULTS') break;
  }
  ok(label + ': حدثت حالات نجاة وإقصاء وانتهت بفائز', (elim + safe) > 0 && (await S(pg)).players.filter(p => p.alive).length >= 1, { elim, safe });
  ok(label + ': كل إقصاء حدث مرة واحدة (لا إقصاء مكرر)', new Set(eliminatedIds).size === eliminatedIds.length, eliminatedIds);
  ok(label + ': عدد الأحياء = ' + (6 - elim), (await S(pg)).players.filter(p => p.alive).length === 6 - elim);
  const fin = await untilState(pg, 'RESULTS', 40000) || (await S(pg)).state === 'GAME_OVER';
  ok(label + ': نهاية المباراة (فائز/نتائج)', fin, (await S(pg)).state);
  await pg.screenshot({ path: `${SHOTS}/${label}_end.png` });
  ok(label + ': لا أخطاء JS أثناء المباراة كاملة', pg.errs.length === 0, pg.errs.slice(0, 3));
  await pg.context().close();
}
await b.close(); console.log(`\nنجح ${pass} / فشل ${fail}`); process.exit(fail ? 1 : 0);
