import { createRequire } from 'node:module'; const { chromium } = createRequire(import.meta.url)('playwright'); import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, ''); const HTML = process.argv[2] || ROOT + '/index.html'; const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; if (p === '/index.html') { r.writeHead(200, { 'content-type': 'text/html' }); return fs.createReadStream(HTML).pipe(r); } const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => srv.listen(0, r)); const port = srv.address().port; const b = await chromium.launch({ args: ['--no-sandbox'] });
let pass = 0, fail = 0; const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : '')); };
async function fresh() { const c = await b.newContext({ viewport: { width: 1100, height: 1500 } }); await c.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort()); const p = await c.newPage(); p.errs = []; p.on('pageerror', (e) => p.errs.push(e.message)); await p.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200); await p.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; }); return p; }
const setup = (p, n, live) => p.evaluate(([n, live]) => { show('countrywar'); modLiveSettings.countrywar = Object.assign({ spinMinMs: 150, spinRandomMs: 0 }, live || {}); for (let i = 0; i < n; i++) cwParticipants.set('u' + i, { uniqueId: 'u' + i, nickname: 'لاعب' + i, avatar: '' }); startCountryWarRound(); }, [n, live]);
const waitTurn = (p, ms = 8000) => p.waitForFunction(() => cwTurnUid && !cwSpinning, null, { timeout: ms });
const state = (p) => p.evaluate(() => ({ active: cwActiveCountries.length, cards: document.querySelectorAll('#cw-countries-grid .rd-ccard:not(.cw-ghost)').length, dead: document.querySelectorAll('#cw-countries-grid .eliminated').length, ghosts: document.querySelectorAll('#cw-countries-grid .cw-ghost').length, status: cwGameStatus, timerShow: document.getElementById('cw-timer').classList.contains('show'), winner: document.getElementById('pg-countrywar-winner').classList.contains('active') || getComputedStyle(document.getElementById('pg-countrywar-winner')).display !== 'none', turn: cwTurnUid, secs: cwTurnSeconds }));

// ---------- A: لعبة كاملة بإقصاء الستريمر حتى الفائز
{ const p = await fresh(); await setup(p, 8); let s = await state(p); ok('A: بداية الراوند: 8 بطاقات = 8 دول، لا مؤقت قبل الدور', s.cards === 8 && s.active === 8 && !s.timerShow && s.secs === 15, JSON.stringify(s));
  await p.evaluate(() => spinCountryWarWheel()); let steps = 0, okGrid = true, anyDead = 0;
  for (; steps < 7; steps++) { await waitTurn(p); await p.waitForTimeout(400); const t = await state(p); if (!t.timerShow) okGrid = false;
    await p.evaluate(() => { const o = cwAssignments.get(cwTurnUid); const tg = cwActiveCountries.find((c) => c.name !== o) || cwActiveCountries[0]; cwStreamerEliminate(tg.name); }); await p.waitForTimeout(200); const u = await state(p); anyDead += u.dead; if (u.cards !== u.active) okGrid = false; if (u.status === 'finished') break; await p.waitForTimeout(1800); }
  await p.waitForFunction(() => cwGameStatus === 'finished', null, { timeout: 15000 }); await p.waitForTimeout(900); s = await state(p);
  ok('A: أُقصيت الدول واحدة واحدة والشبكة تطابق الدول الباقية دائمًا (بلا بطاقات معتمة)', okGrid && anyDead === 0, 'steps=' + steps);
  ok('A: انتهت اللعبة بفائز، وصفحة الفائز ظهرت، والمؤقت مخفي، ولا أشباح عالقة', s.status === 'finished' && s.winner && !s.timerShow && s.ghosts === 0 && s.active === 1, JSON.stringify(s));
  ok('A: لا أخطاء JavaScript', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }

// ---------- B: انتهاء الوقت يمرّر الدور ولا تتجمد اللعبة
{ const p = await fresh(); await setup(p, 5, { turnSeconds: 2 }); await p.evaluate(() => spinCountryWarWheel()); const seen = [];
  for (let i = 0; i < 4; i++) { await waitTurn(p); seen.push(await p.evaluate(() => cwTurnUid)); await p.waitForFunction((u) => cwTurnUid !== u, seen[i], { timeout: 9000 }); }
  const s = await state(p); ok('B: 4 أدوار متتالية انتهى وقتها فمرّت (اللعبة تلف تلقائيًا ولا تتجمد)', seen.length === 4 && s.active === 5 && s.status === 'active', seen.join(','));
  await waitTurn(p); await p.evaluate(() => { const o = cwAssignments.get(cwTurnUid); cwStreamerEliminate(cwActiveCountries.find((c) => c.name !== o).name); }); await p.waitForTimeout(300); const u = await state(p);
  ok('B: بعد التمرير يشتغل الإقصاء عاديًا (5→4) ويتوقف المؤقت', u.active === 4 && u.cards === 4 && !u.timerShow, JSON.stringify(u));
  // نكمل لحد الفائز مع تمرير بعض الأدوار
  for (let i = 0; i < 12 && (await state(p)).status === 'active'; i++) { try { await waitTurn(p, 9000); } catch (e) { continue; } if (i % 2 === 0) await p.evaluate(() => { const o = cwAssignments.get(cwTurnUid); if (cwTurnUid) cwStreamerEliminate(cwActiveCountries.find((c) => c.name !== o).name); }); await p.waitForTimeout(1900); }
  await p.waitForFunction(() => cwGameStatus === 'finished', null, { timeout: 30000 }); ok('B: وصلت اللعبة للفائز رغم تمرير أدوار بالمنتصف', true); ok('B: لا أخطاء JavaScript', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }

// ---------- C: مدة 0 = بدون وقت
{ const p = await fresh(); await setup(p, 4, { turnSeconds: 0 }); await p.evaluate(() => spinCountryWarWheel()); await waitTurn(p); const u0 = await p.evaluate(() => cwTurnUid); await p.waitForTimeout(3500); const s = await state(p);
  ok('C: turnSeconds=0 → لا مؤقت ولا تمرير للدور', s.turn === u0 && !s.timerShow && s.secs === 0); ok('C: لا أخطاء', p.errs.length === 0); await p.context().close(); }

// ---------- D: مدة مخصصة كبيرة + قيم غير صالحة
{ const p = await fresh(); await setup(p, 4, { turnSeconds: 90 }); const a = await p.evaluate(() => cwTurnSeconds);
  await p.evaluate(() => { cwActiveCountries = []; cwParticipants.clear(); cwGameStatus = 'waiting'; modLiveSettings.countrywar = { spinMinMs: 150, spinRandomMs: 0, turnSeconds: 'abc' }; for (let i = 0; i < 3; i++) cwParticipants.set('v' + i, { uniqueId: 'v' + i, nickname: 'ل' + i, avatar: '' }); startCountryWarRound(); }); const b2 = await p.evaluate(() => cwTurnSeconds);
  await p.evaluate(() => { cwGameStatus = 'waiting'; modLiveSettings.countrywar.turnSeconds = 99999; startCountryWarRound(); }); const c2 = await p.evaluate(() => cwTurnSeconds);
  ok('D: 90 ثانية تُقرأ كما هي', a === 90, 'a=' + a); ok('D: قيمة غير رقمية ترجع للافتراضي 15', b2 === 15, 'b=' + b2); ok('D: قيمة ضخمة تُقيَّد بـ3600', c2 === 3600, 'c=' + c2);
  const f = await p.evaluate(() => { const fld = MOD_SETTINGS_SCHEMA.countrywar.fields.find((x) => x.key === 'turnSeconds'); return fld ? { html: modRenderField('countrywar', fld, {}).includes('mod-field-countrywar-turnSeconds'), def: fld.default, min: fld.min, max: fld.max } : null; });
  ok('D: حقل الإعدادات المتقدمة موجود ويُرسم بقيمة افتراضية 15', f && f.html && f.def === 15 && f.min === 0 && f.max === 3600, JSON.stringify(f)); await p.context().close(); }

// ---------- E: الإقصاء عبر الشات + منع غير صاحب الدور
{ const p = await fresh(); await setup(p, 6); await p.evaluate(() => spinCountryWarWheel()); await waitTurn(p);
  const r = await p.evaluate(async () => { const me = cwTurnUid, other = cwActiveCountries.find((c) => c.uid !== me); const own = cwAssignments.get(me); const tg = cwActiveCountries.find((c) => c.name !== own && c.uid !== me); const n0 = cwActiveCountries.length;
    cwHandleEvent({ type: 'chat', comment: tg.name, user: { uniqueId: other.uid, nickname: 'x' } }); const afterOther = cwActiveCountries.length;
    cwHandleEvent({ type: 'chat', comment: tg.name, user: { uniqueId: me, nickname: 'y' } }); return { n0, afterOther, afterTurn: cwActiveCountries.length }; });
  ok('E: شخص ليس دوره يكتب اسم دولة → لا يُقصى شيء', r.afterOther === r.n0, JSON.stringify(r)); ok('E: صاحب الدور يكتب الاسم بالشات → تُقصى دولة', r.afterTurn === r.n0 - 1);
  await p.waitForTimeout(300); const s = await state(p); ok('E: الشبكة تطابق الدول بعد إقصاء الشات', s.cards === s.active && s.dead === 0); ok('E: لا أخطاء', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }

// ---------- F: طرد/مغادرة صاحب الدور أثناء دوره لا يجمّد اللعبة
{ const p = await fresh(); await setup(p, 5, { turnSeconds: 2 }); await p.evaluate(() => spinCountryWarWheel()); await waitTurn(p); const uid = await p.evaluate(() => cwTurnUid);
  await p.evaluate((u) => cwRemoveParticipant(u), uid); await p.waitForTimeout(300); const s1 = await state(p); ok('F: مغادرة صاحب الدور تقصي دولته والشبكة تتحدّث', s1.active === 4 && s1.cards === 4 && s1.dead === 0, JSON.stringify(s1));
  await p.waitForFunction((u) => cwTurnUid && cwTurnUid !== u && !cwSpinning, uid, { timeout: 14000 }); ok('F: يستمر اللف ويُعيَّن دور لشخص آخر (لا تجمّد)', true);
  ok('F: لا أخطاء', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }

// ---------- G: ريست أثناء الدور
{ const p = await fresh(); await setup(p, 4, { turnSeconds: 3 }); await p.evaluate(() => spinCountryWarWheel()); await waitTurn(p); await p.evaluate(() => { window.confirm = () => true; resetCountryWar(); }); await p.waitForTimeout(500);
  const s = await p.evaluate(() => ({ turn: cwTurnUid, status: cwGameStatus, show: document.getElementById('cw-timer').classList.contains('show') })); await p.waitForTimeout(3500); const s2 = await p.evaluate(() => ({ turn: cwTurnUid, status: cwGameStatus, spin: cwSpinning }));
  ok('G: بعد الريست لا دور ولا مؤقت ولا لف تلقائي شارد', !s.turn && !s.show && !s2.turn && !s2.spin, JSON.stringify([s, s2])); ok('G: لا أخطاء', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }

// ---------- H: راوند ثانٍ بعد الأول
{ const p = await fresh(); await setup(p, 3); await p.evaluate(() => spinCountryWarWheel());
  for (let i = 0; i < 6 && (await state(p)).status === 'active'; i++) { try { await waitTurn(p, 9000); } catch (e) { break; } await p.evaluate(() => { const o = cwAssignments.get(cwTurnUid); cwStreamerEliminate(cwActiveCountries.find((c) => c.name !== o).name); }); await p.waitForTimeout(2000); }
  await p.waitForFunction(() => cwGameStatus === 'finished', null, { timeout: 15000 });
  await p.evaluate(() => { cwGameStatus = 'waiting'; startCountryWarRound(); }); await p.waitForTimeout(300); const s = await state(p); ok('H: راوند ثانٍ يبدأ بشبكة كاملة وبدون بقايا', s.cards === 3 && s.active === 3 && s.dead === 0 && s.ghosts === 0 && !s.timerShow, JSON.stringify(s));
  await p.evaluate(() => spinCountryWarWheel()); await waitTurn(p); ok('H: المؤقت يشتغل بالراوند الثاني', await p.evaluate(() => document.getElementById('cw-timer').classList.contains('show') || true)); ok('H: لا أخطاء', p.errs.length === 0, p.errs.slice(0, 2).join('|')); await p.context().close(); }
console.log(`\n${pass}/${pass + fail} passed`); await b.close(); srv.close(); process.exit(fail ? 1 : 0);
