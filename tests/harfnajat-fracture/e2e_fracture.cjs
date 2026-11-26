'use strict';
// حرف النجاة — مشهد الإقصاء «الشقوق البركانية» (VolcanicFractureFX) بعد نقله من الملف المرجعي:
//   - يشغّل harf-alnajat3d.html مستقلاً (WebGL برمجي) ويقود مباراة فعلية عبر واجهته العامة window.HarfAlNajat.
//   - يتحقق: بطاقة الإقصاء .vf-card تظهر وتختفي، حدث eliminated مرة واحدة لكل لاعب، حالة out، استمرار المباراة،
//     إقصاء متتالٍ ثم الفائز، لا أخطاء JS، لا بطاقات عالقة، والإقصاء القديم غير موجود بالملف.
//   - اختيارياً (REF_FILE=/path/index_16.html): يشغّل المرجع بالظروف نفسها ويقارن مراحل المشهد ويحفظ لقطات جنباً لجنب.
//   PLAYWRIGHT_PATH=... [REF_FILE=...] [OUT=/tmp/x] node tests/harfnajat-fracture/e2e_fracture.cjs
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const ROOT = path.join(__dirname, '../..');
const OUT = process.env.OUT || path.join(require('os').tmpdir(), 'harf-fracture');
fs.mkdirSync(OUT, { recursive: true });
const REF = process.env.REF_FILE && fs.existsSync(process.env.REF_FILE) ? process.env.REF_FILE : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u === '/ref.html' && REF ? REF : path.join(ROOT, u);
  if (!f.startsWith(ROOT) && f !== REF) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  if (/[?&]novfx=1/.test(req.url) && f.endsWith('.html')) { // نسخة اختبار فقط: تعطيل إنشاء المؤثر لإثبات المسار الاحتياطي الآمن
    const t = fs.readFileSync(f, 'utf8').replace('function VFXmake(w) { try { return new VolcanicFractureFX(w); }', 'function VFXmake(w) { try { return null; }');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(t);
  }
  res.writeHead(200, { 'content-type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

async function drive(browser, url, label, shots, nRounds = 2) {
  const ctx = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/Failed to load resource|net::|fonts\.g/i.test(t)) errors.push(t.slice(0, 200)); if (/\[vfx\]/.test(t)) logs.push(t.slice(0, 200)); });
  // ثلاث لاعبين، مهلة إجابة قصيرة، الوضع السريع للانتقالات
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.HarfAlNajat && window.HarfAlNajat._h, null, { timeout: 120000 });
  await page.waitForFunction(() => { const l = document.getElementById('hn-load'); return !l || l.hidden || getComputedStyle(l).display === 'none'; }, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(() => { window.__ev = []; window.HarfAlNajat.setHooks({ onEvent: (t, d) => window.__ev.push({ t, id: d && d.userId, r: d && d.reason, at: Date.now() }) }); });
  await page.evaluate(() => { const b = document.getElementById('b-start'); b && b.click(); });
  await sleep(500);
  await page.evaluate(() => { const b = document.getElementById('b-open'); b && b.click(); });
  await sleep(600);
  for (const n of ['a', 'b', 'c']) await page.evaluate((n) => window.HarfAlNajat.receiveChat({ userId: 'u_' + n, nickname: 'لاعب ' + n, text: 'أنا', avatarUrl: '' }), n);
  await sleep(500);
  const joined = await page.evaluate(() => window.HarfAlNajat.getState().players.length);
  await page.evaluate(() => { const t = document.getElementById('t-fast'); t && t.click(); const b = document.getElementById('b-go'); b && b.click(); });
  const R = { label, joined, rounds: [], errors, logs };
  for (let round = 0; round < nRounds; round++) {
    // ننتظر مرحلة الإجابة ثم نجاوب من حساب صاحب الدور ونحكم بالرفض
    const ok = await page.waitForFunction(() => { const s = window.HarfAlNajat.getState(); return s.phase === 'answer' && s.turn; }, null, { timeout: 300000 }).then(() => true).catch(() => false);
    if (!ok) { R.rounds.push({ err: 'no-answer-phase', state: await page.evaluate(() => window.HarfAlNajat.getState()) }); break; }
    const turn = await page.evaluate(() => window.HarfAlNajat.getState().turn);
    await page.evaluate((t) => window.HarfAlNajat.receiveChat({ userId: t.userId, nickname: 'x', text: 'جواب', avatarUrl: '' }), turn);
    await page.waitForFunction(() => window.HarfAlNajat.getState().phase === 'judging', null, { timeout: 60000 }).catch(() => {});
    const t0 = Date.now();
    await page.evaluate(() => window.HarfAlNajat._ctl.judge('reject'));
    const rec = { id: turn.userId, cardSeen: false, cardGone: false, phases: [], t: [] };
    let lastPhase = '';
    // نراقب المشهد حتى حدث eliminated
    for (let i = 0; i < 400; i++) {
      const st = await page.evaluate((id) => ({ phase: window.HarfAlNajat.getState().phase, card: document.querySelectorAll('.vf-card').length, cardOn: !!document.querySelector('.vf-card.on'), done: window.__ev.some((e) => e.t === 'eliminated' && e.id === id) }), turn.userId);
      if (st.phase !== lastPhase) { lastPhase = st.phase; rec.phases.push(st.phase); rec.t.push(Date.now() - t0); }
      if (st.card) rec.cardSeen = true;
      if (shots && round === 0 && st.phase === 'eliminating' && rec.t.length && (Date.now() - t0 - (rec._ls || 0)) > 1100) { rec._ls = Date.now() - t0; const n = (rec.shots = rec.shots || []).length; if (n < 8) { const f = path.join(OUT, label + '_' + String(n).padStart(2, '0') + '.png'); try { await page.screenshot({ path: f, timeout: 180000 }); } catch (e) { rec.shotErr = String(e.message).slice(0, 80); } rec.shots.push(f); } }
      if (st.done) { await sleep(900); break; }
      await sleep(250);
    }
    rec.cardGone = await page.evaluate(() => document.querySelectorAll('.vf-card').length === 0);
    rec.elimCount = await page.evaluate((id) => window.__ev.filter((e) => e.t === 'eliminated' && e.id === id).length, turn.userId);
    rec.status = await page.evaluate((id) => (window.HarfAlNajat.getState().players.find((p) => p.userId === id) || {}).status, turn.userId);
    R.rounds.push(rec);
  }
  // بعد إقصاء لاعبين من ثلاثة: يبقى لاعب واحد → الفائز
  R.final = nRounds < 2 ? null : await page.waitForFunction(() => ['win-walk', 'win', 'ended'].includes(window.HarfAlNajat.getState().phase), null, { timeout: 240000 }).then(() => page.evaluate(() => window.HarfAlNajat.getState())).catch(async () => ({ timeout: true, state: await page.evaluate(() => window.HarfAlNajat.getState()) }));
  R.events = await page.evaluate(() => window.__ev.map((e) => e.t));
  R.leftover = await page.evaluate(() => document.querySelectorAll('.vf-card').length);
  await ctx.close();
  return R;
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const src = fs.readFileSync(path.join(ROOT, 'harf-alnajat3d.html'), 'utf8');

  // ===== 1) الشيفرة: النظام الجديد موجود والقديم محذوف ولا مسار احتياطي يعيده =====
  check('الإقصاء الجديد VolcanicFractureFX وVFXmake وvf-card موجودة بالملف', /var VolcanicFractureFX = class/.test(src) && /function VFXmake\(/.test(src) && /\.vf-card\{/.test(src));
  check('وضع الكاميرا fracture مربوط بـcamTarget والمؤثر', /fracture:6/.test(src) && /case"fracture":return this\.vfx&&this\.vfx\.active\?this\.vfx\.camTarget\(\)/.test(src));
  check('ربط دورة الحياة: warm/setQuality/setViewport/abort/safeTick', ['vfx.warm(1)', 'vfx.warm(0)', 'vfx.setQuality(', 'vfx.setViewport(', 'vfx.abort()', 'vfx.safeTick('].every((k) => src.includes(k)));
  check('الإقصاء القديم محذوف: لا eliminateLegacy ولا elimWalk/elimFall ولا wh() ولا splash() القديمة', !/eliminateLegacy|elimWalk|elimFall|function wh\(|this\.splash\(/.test(src));
  check('المسار الاحتياطي آمن (_elimSafe) ولا يشغّل أي مشهد قديم', /_elimSafe\(t,e\)\{try\{this\.removeActor\(t\)\}/.test(src));

  // ===== 2) التشغيل الفعلي =====
  const mine = await drive(browser, 'http://127.0.0.1:' + port + '/harf-alnajat3d.html', 'mine', true);
  console.log('mine:', JSON.stringify({ joined: mine.joined, rounds: mine.rounds.map((r) => ({ id: r.id, phases: r.phases, t: r.t, card: r.cardSeen, gone: r.cardGone, n: r.elimCount, st: r.status, err: r.err })), final: mine.final && (mine.final.phase || mine.final.timeout), errors: mine.errors, vfxlogs: mine.logs }));
  check('انضم ثلاثة لاعبين وبدأت المباراة', mine.joined === 3);
  const r0 = mine.rounds[0] || {}, r1 = mine.rounds[1] || {};
  check('الإقصاء الأول: مرّت المباراة بمرحلة eliminating وظهرت بطاقة الإقصاء ثم اختفت', r0.phases && r0.phases.includes('eliminating') && r0.cardSeen && r0.cardGone, r0);
  check('الإقصاء الأول: حدث eliminated مرة واحدة فقط وحالة اللاعب out', r0.elimCount === 1 && r0.status === 'out', r0);
  check('الإقصاء الثاني (متتالٍ): نفس الشيء بلا تعليق', r1.elimCount === 1 && r1.status === 'out' && r1.cardSeen && r1.cardGone, r1);
  check('بعد إقصاء اثنين من ثلاثة تنتقل اللعبة للفائز (لاعب واحد متبقٍ) دون تعليق', mine.final && !mine.final.timeout && ['win-walk', 'win'].includes(mine.final.phase), mine.final);
  // خطأ قديم موجود بالأصل قبل النقل ولا علاقة له بالإقصاء (معالج حدث players يستدعي B() من نطاق آخر؛ تلتقطه اللعبة داخلياً ولا يوقف شيئاً)
  const KNOWN = /\[engine:players\] ReferenceError: B is not defined/;
  const fresh = mine.errors.filter((e) => !KNOWN.test(e));
  console.log('known pre-existing errors in mine:', mine.errors.length - fresh.length);
  check('لا بطاقات إقصاء عالقة ولا أخطاء JavaScript/Shader جديدة أثناء المباراة (عدا خطأ B القديم الموجود قبل النقل)', mine.leftover === 0 && fresh.length === 0 && mine.logs.length === 0, { leftover: mine.leftover, errors: fresh, logs: mine.logs });

  // ===== 2ب) المسار الاحتياطي: المؤثر معطّل → استبعاد آمن بلا مشهد قديم =====
  const fb = await drive(browser, 'http://127.0.0.1:' + port + '/harf-alnajat3d.html?novfx=1', 'novfx', false, 1);
  const f0 = fb.rounds[0] || {};
  console.log('fallback:', JSON.stringify({ phases: f0.phases, t: f0.t, card: f0.cardSeen, n: f0.elimCount, st: f0.status, err: f0.err }));
  check('المؤثر معطّل: الاستبعاد يتم فوراً وبأمان (حدث eliminated مرة واحدة، حالة out، بلا بطاقة ولا مشهد قديم)', f0.elimCount === 1 && f0.status === 'out' && !f0.cardSeen && f0.cardGone, f0);
  check('المؤثر معطّل: المباراة تستمر للاعب التالي بلا تعليق', await (async () => { return fb.events.includes('eliminated'); })() && fb.errors.filter((e) => !KNOWN.test(e)).length === 0, { errors: fb.errors.filter((e) => !KNOWN.test(e)) });

  // ===== 3) المقارنة مع المرجع (اختياري) =====
  if (REF) {
    const ref = await drive(browser, 'http://127.0.0.1:' + port + '/ref.html', 'ref', true);
    const seq = (r) => (r.rounds[0] || {}).phases;
    check('المرجع نفسه يعمل بالسيناريو نفسه (للمقارنة)', ref.rounds[0] && ref.rounds[0].elimCount === 1, ref.rounds[0]);
    const pre = (a) => (a || []).slice(0, 2); // verdict → eliminating (ما بعدها يعتمد على توقيت إطارات الرسم البرمجي)
    check('تسلسل مراحل المباراة أثناء الإقصاء مطابق للمرجع (verdict ← eliminating)', JSON.stringify(pre(seq(mine))) === JSON.stringify(pre(seq(ref))), { mine: seq(mine), ref: seq(ref) });
    console.log('ref errors:', ref.errors.length, JSON.stringify(ref.errors.map((e) => e.slice(0, 60))));
    check('أخطاء المرجع نفسه مطابقة لأخطاء الملف بعد النقل (لا شيء جديد)', ref.errors.map((e) => e.slice(0, 60)).sort().join('|') === mine.errors.map((e) => e.slice(0, 60)).sort().join('|'), { ref: ref.errors.length, mine: mine.errors.length });
    const dur = (r) => (r.rounds[0] || {}).t;
    console.log('timings mine/ref:', JSON.stringify(dur(mine)), JSON.stringify(dur(ref)));
    console.log('screenshots:', OUT);
  }
  await browser.close(); server.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
