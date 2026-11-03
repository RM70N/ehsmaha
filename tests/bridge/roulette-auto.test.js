/* الروليت الروسي: لو لم يبقَ للاعب خيار غير «أطلق» (لا امتناعات + استُخدم «أطلق على شخص») يُطلق النظام تلقائياً */
const { chromium } = require('playwright');
const H = require('./harness');
const path = require('path');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await H.routeThree(pg);
  const errs = []; pg.on('pageerror', e => errs.push(String(e)));
  await pg.goto('file://' + path.resolve(__dirname, '../../roulette3d.html'));
  await pg.waitForFunction(() => window.EhsemhaRoulette, null, { timeout: 60000 });
  await pg.evaluate(() => {
    window.__ev = []; EhsemhaRoulette.onEvent(e => window.__ev.push([e.type, e.data]));
    EhsemhaRoulette.settings({ demo: false, decTime: 30, passes: 0, spinSpeed: 'fast' });
    // السلطة: دائماً نفس اللاعب (الأول)، والطلقة العادية فارغة (آمنة)
    window.__X = null;
    EhsemhaRoulette.setAuthority({ pickPlayer: ids => (window.__X && ids.includes(window.__X) ? window.__X : ids[0]), resolveFire: () => false });
    EhsemhaRoulette.newMatch();
  });
  const kw = await pg.evaluate(() => EhsemhaRoulette.settings().keyword);
  await pg.evaluate(k => { for (let i = 1; i <= 4; i++) EhsemhaRoulette.chat('u' + i, 'لاعب' + i, k); }, kw);
  await pg.evaluate(() => EhsemhaRoulette.start());
  const st = () => pg.evaluate(() => EhsemhaRoulette.getState());
  const waitSt = (s, t = 120000) => pg.waitForFunction(x => EhsemhaRoulette.getState().state === x, s, { timeout: t });
  const say = (id, m) => pg.evaluate(([i, t]) => EhsemhaRoulette.chat(i, 'n', t), [id, m]);

  await waitSt('WAITING_FOR_DECISION');
  const X = (await st()).pending.pid; await pg.evaluate(x => { window.__X = x; }, X);
  ok(await pg.$eval('#op2', e => e.classList.contains('lock')), 'لا امتناعات (الخيار ٢ مقفل) والخيار ٣ متاح بعد: ' + X);
  ok(await pg.$eval('#op3', e => !e.classList.contains('lock')), 'الخيار ٣ «أطلق على شخص» متاح في أول دور (لا إطلاق تلقائي بعد)');
  await pg.waitForTimeout(2500);
  ok((await st()).state === 'WAITING_FOR_DECISION', 'مع بقاء خيار ٣ يبقى ينتظر قرار اللاعب (لا إطلاق تلقائي)');
  await say(X, '3'); await waitSt('TARGET_PICK', 10000);
  await say(X, '1');
  await waitSt('PLAYER_ELIMINATED', 90000);
  ok(true, 'الطلقة على الشخص المختار أُطلقت وأُقصي');
  // الدور التالي لنفس اللاعب: لا امتناعات ولا «أطلق على شخص» → إطلاق تلقائي بلا كتابة
  await waitSt('WAITING_FOR_DECISION', 120000);
  const cur = (await st()).pending.pid;
  ok(cur === X, 'الدور عاد لنفس اللاعب');
  ok(await pg.$eval('#op2', e => e.classList.contains('lock')) && await pg.$eval('#op3', e => e.classList.contains('lock')), 'الخياران ٢ و٣ مقفلان (لا خيار غير الإطلاق)');
  const t0 = Date.now();
  await waitSt('RESOLVING', 8000);
  const dt = Date.now() - t0;
  ok(dt < 6000, 'انتقل للإطلاق تلقائياً بلا كتابة خلال ' + (dt / 1000).toFixed(1) + 'ث (المهلة الأصلية ٣٠ث)');
  const dq = await pg.$eval('#dq', e => e.textContent);
  ok(/تلقائ/.test(dq), 'الشاشة توضح الإطلاق التلقائي: «' + dq + '»');
  await pg.waitForFunction(() => ['PLAYER_SAFE', 'PLAYER_ELIMINATED'].includes(EhsemhaRoulette.getState().state), null, { timeout: 60000 });
  const ev = await pg.evaluate(() => window.__ev);
  ok(!ev.some(e => e[0] === 'eliminated' && e[1].id === X), 'النتيجة نُفّذت كإطلاق عادي (الطلقة فارغة: اللاعب نجا)');
  ok((await st()).players.find(p => p.id === X).alive, 'اللاعب ما زال حياً بعد الإطلاق التلقائي الآمن');
  ok(errs.length === 0, 'لا أخطاء جافاسكربت ' + errs.join('|'));
  await pg.evaluate(() => EhsemhaRoulette.stop());
  console.log(`\n${pass}/${pass + fail} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
