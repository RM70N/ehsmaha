'use strict';
// «حلّها قبلي» — فحوص إضافية: شرط الفولو على الانضمام المتأخر، فوز لاعب واحد (حلّ الرمز) وتسجيله مرة واحدة، اللعب بالمؤقت الحقيقي.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/hq2.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 700) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
const RE = /hallaha-qabli\.html/;
const fr = (page) => page.frames().find((x) => RE.test(x.url()));
const F = (page, fn, arg) => fr(page).evaluate(fn, arg);
async function waitFor(page, fn, arg, timeout = 10000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(60); } return false; }
async function fwait(page, fn, arg, timeout = 10000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await F(page, fn, arg)) return true; } catch (e) {} await sleep(60); } return false; }
async function launch(page) {
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(300);
  await page.evaluate(() => { goSetupHq(); launchHq(); });
  const ok = await waitFor(page, () => { const a = window.hqApi && window.hqApi(); return !!a && document.querySelector('.page.active').id === 'pg-hq'; }, null, 30000);
  if (ok) await F(page, () => { const M = HallahaGame._M; M.G.cfg.vaults = 1; M.G.cfg.collectSec = 20; M.G.cfg.readSec = 1; HallahaGame.openLobby(); });
  return ok && fwait(page, () => HallahaGame.snapshot().phase === 'lobby');
}
const snap = (page) => F(page, () => { const s = HallahaGame.snapshot(); return { ph: s.phase, stage: s.stage, ids: s.players.map((p) => ({ id: p.id, waiting: p.waiting, score: p.score })), hist: s.hist.length, over: s.result }; });
const vid = (id) => id.replace(/^tiktok:/, '');

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); localStorage.setItem(STREAMER_USER_STORAGE_KEY, 'streamer1'); window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; followGateSetRequired(false); });

  // ===== 1) شرط الفولو + الانضمام المتأخر =====
  check('الإطلاق', await launch(page));
  const jw = await F(page, () => HallahaGame._M.G.cfg.joinWord);
  await page.evaluate(() => followGateSetRequired(true));
  await say('f1', jw, 'متابع١', true); await say('f2', jw, 'متابع٢', true); await say('n0', jw, 'غير متابع', false);
  await sleep(600);
  let s = await snap(page);
  check('الردهة + شرط الفولو: المتابعان ينضمان وغير المتابع لا', s.ids.length === 2 && !s.ids.some((p) => p.id.endsWith('n0')), s);
  await F(page, () => HallahaGame.startMatch());
  check('بدء المباراة → مرحلة المحاولات', await fwait(page, () => HallahaGame.snapshot().phase === 'collect', null, 25000));
  await say('n1', jw, 'متأخر غير متابع', false); await say('f3', jw, 'متأخر متابع', true); await sleep(600);
  s = await snap(page);
  check('انضمام متأخر + شرط الفولو: المتابع يدخل وغير المتابع ممنوع (لا تجاوز للشرط)', s.ids.length === 3 && s.ids.some((p) => p.id.endsWith('f3')) && !s.ids.some((p) => p.id.endsWith('n1')), s);
  await page.evaluate(() => followGateSetRequired(false));
  await say('n1', jw, 'متأخر غير متابع', false); await sleep(500);
  s = await snap(page);
  check('الشرط مطفي: غير المتابع ينضم متأخراً (وليس يلعب بنفس المرحلة)', s.ids.length === 4 && s.ids.find((p) => p.id.endsWith('n1')).waiting === true, s);
  // لاعب قائم غير متابع لا يُمنع من اللعب لو فُعّل الشرط بعد دخوله
  await page.evaluate(() => followGateSetRequired(true));
  const before = await F(page, () => HallahaGame.snapshot().submitted);
  await say('n1', '123', 'متأخر غير متابع', false); await say('f1', '123', 'متابع١', true); await sleep(500);
  const after = await F(page, () => HallahaGame.snapshot().submitted);
  check('اللاعب القائم يلعب رغم تفعيل الشرط لاحقاً (n1 ما تُحتسب لأنه ينتظر المرحلة التالية، f1 تُحتسب)', after - before === 1, { before, after });
  await page.evaluate(() => followGateSetRequired(false));

  // ===== 2) فوز لاعب واحد بحلّ الرمز =====
  console.log('--- مباراة بفائز واحد');
  await page.evaluate(() => { window.__wins = []; });
  check('إعادة الإطلاق', await launch(page));
  const P = ['s1', 's2', 's3'];
  for (const v of P) await say(v, jw, 'ص' + v);
  await sleep(500);
  await F(page, () => HallahaGame.startMatch());
  let solved = false, guard = 0, stages = 0;
  while (guard++ < 60) {
    const st = await F(page, () => { const s = HallahaGame.snapshot(); return { ph: s.phase, hist: s.hist }; });
    if (st.ph === 'final') break;
    if (st.ph === 'collect') {
      stages++;
      const guess = await F(page, () => { const L = window.HqLogic; const rows = HallahaGame.snapshot().hist.map((x) => x.rows).flat(); const c = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let d = 0; d < 10; d++) if (a !== b && a !== d && b !== d) c.push('' + a + b + d); const k = c.filter((x) => rows.every((r) => { const e = L.evaluate(x, r.code); return e.exact === r.exact && e.mis === r.mis; })); return k[0]; });
      await say('s1', guess, 'ص s1'); await say('s2', '012', 'ص s2'); await say('s3', '987', 'ص s3');
      await sleep(250);
      await F(page, () => HallahaGame._M.closeEarly());
    } else if (st.ph === 'locked') await F(page, () => HallahaGame._M.nextStage());
    else if (st.ph === 'reveal') await F(page, () => HallahaGame._M.nextStage());
    else if (st.ph === 'opening' || st.ph === 'held') await F(page, () => HallahaGame._M.skipHold());
    await sleep(120);
  }
  const fin = await F(page, () => { const s = HallahaGame.snapshot(); return { ph: s.phase, players: s.players.map((p) => ({ id: p.id, score: p.score })), vlog: s.vlog.map((v) => ({ st: v.status, w: v.winners })) }; });
  check('الحلّ بالاستنتاج من السجل ينتهي بفتح الخزنة', fin.ph === 'final' && fin.vlog.length === 1 && fin.vlog[0].st === 'opened', { fin, stages });
  const sc = Object.fromEntries(fin.players.map((p) => [vid(p.id), p.score]));
  check('s1 وحده يحصل على النقاط', sc.s1 === 100 && sc.s2 === 0 && sc.s3 === 0, sc);
  await sleep(700);
  const w = await page.evaluate(() => window.__wins.slice());
  check('الفوز سُجّل رسمياً مرة واحدة لـ s1 باسم اللعبة', w.length === 1 && /s1$/.test(w[0].id) && w[0].g === 'حلّها قبلي', w);
  check('لا أخطاء JS', page._errors.length === 0, page._errors);

  // ===== 3) مؤقت حقيقي: تغلق المرحلة وحدها =====
  console.log('--- المؤقت الحقيقي');
  await page.evaluate(() => { window.__wins = []; });
  check('إعادة الإطلاق', await launch(page));
  await F(page, () => { HallahaGame._M.G.cfg.collectSec = 4; });
  for (const v of P) await say(v, jw, 'ص' + v);
  await sleep(400); await F(page, () => HallahaGame.startMatch());
  check('تصل مرحلة المحاولات بالمؤقت', await fwait(page, () => HallahaGame.snapshot().phase === 'collect', null, 25000));
  await say('s1', '123', 'ص s1');
  check('المرحلة تُغلق تلقائياً بعد انتهاء مهلتها (٤ ثوانٍ) بدون تدخل', await fwait(page, () => ['locked', 'reveal'].includes(HallahaGame.snapshot().phase), null, 9000));
  const h = await F(page, () => HallahaGame.snapshot().hist.length);
  check('محاولة المشارك ثُبّتت في السجل', h === 1, h);
  check('لا أخطاء JS', page._errors.length === 0, page._errors);

  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
