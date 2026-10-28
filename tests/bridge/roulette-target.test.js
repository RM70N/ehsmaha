/* اختبار «٣ أطلق على شخص» في الروليت الروسي — صفحة roulette3d.html مباشرة (بدون الموقع) */
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

  await pg.evaluate(() => { window.__ev = []; EhsemhaRoulette.onEvent(e => window.__ev.push([e.type, e.data])); EhsemhaRoulette.settings({ demo: false, decTime: 30, passes: 9, spinSpeed: 'fast' }); EhsemhaRoulette.newMatch(); });
  const kw = await pg.evaluate(() => EhsemhaRoulette.settings().keyword);
  await pg.evaluate(k => { for (let i = 1; i <= 4; i++) EhsemhaRoulette.chat('u' + i, 'لاعب' + i, k); }, kw);
  await pg.evaluate(() => EhsemhaRoulette.start());
  const st = () => pg.evaluate(() => EhsemhaRoulette.getState());
  const waitSt = (s, t = 120000) => pg.waitForFunction(x => EhsemhaRoulette.getState().state === x, s, { timeout: t });
  const say = (id, m) => pg.evaluate(([i, t]) => EhsemhaRoulette.chat(i, 'n', t), [id, m]);
  await waitSt('WAITING_FOR_DECISION');
  const shooter = (await st()).pending.pid;
  ok(await pg.$eval('#op3', e => !e.classList.contains('lock')) && /٣/.test(await pg.$eval('#op3', e => e.textContent)), 'الخيار ٣ «أطلق على شخص» ظاهر وغير مقفل');
  const other = shooter === 'u1' ? 'u2' : 'u1';
  await say(other, '3');
  ok((await st()).state === 'WAITING_FOR_DECISION', 'رسالة ٣ من غير صاحب الدور تُتجاهل');

  await say(shooter, 'اطلق على شخص');
  await waitSt('TARGET_PICK', 10000);
  await pg.waitForSelector('#tgt.on', { timeout: 5000 });
  const rows = await pg.$$eval('#tgtL .tg', els => els.map(e => [e.querySelector('b').textContent, e.querySelector('span').textContent]));
  ok(rows.length === 3, 'عدد المرشحين ٣ (بدون صاحب الدور): ' + JSON.stringify(rows));
  ok(!rows.some(r => r[1] === 'لاعب' + shooter.slice(1) && false) && !rows.some(r => r[1] === 'لاعب' + shooter.slice(1)), 'صاحب الدور غير موجود بالقائمة');
  ok(rows[0][0] === '١' && rows[2][0] === '٣', 'أرقام عربية مرقّمة من ١');
  const fs = await pg.$eval('#tgtL .tg b', e => parseFloat(getComputedStyle(e).fontSize));
  ok(fs >= 36, 'حجم الرقم كبير ' + fs + 'px');
  const n0 = await pg.$eval('#tgtN', e => e.textContent);
  await pg.waitForTimeout(1500);
  const n1 = await pg.$eval('#tgtN', e => e.textContent);
  const toEn = t => +t.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  ok(toEn(n0) <= 15 && toEn(n0) >= 8 && toEn(n1) < toEn(n0), 'العدّاد ينزل من ١٥: ' + n0 + ' ← ' + n1);
  ok(await pg.$eval('#decide', e => !e.classList.contains('on')), 'شاشة الخيارات مخفية أثناء الاختيار');
  const box = await pg.$eval('#tgt', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, innerWidth / 2, innerHeight / 2]; });
  ok(Math.abs(box[0] - box[2]) < 20 && Math.abs(box[1] - box[3]) < 40, 'الشاشة بمنتصف الصفحة');
  await pg.screenshot({ path: '/tmp/claude-0/s/pick.png' });

  await say(shooter, '9'); await say(other, '2');
  await pg.waitForTimeout(400);
  ok((await st()).state === 'TARGET_PICK', 'رقم غير موجود أو من غير صاحب الدور لا يختار');
  const names = rows.map(r => r[1]);
  const tname = names[1];
  await say(shooter, '٢');
  await pg.waitForFunction(() => !document.querySelector('#tgt').classList.contains('on'), null, { timeout: 5000 });
  ok(true, 'الشاشة اختفت تلقائيًا بعد الاختيار');
  await waitSt('RESOLVING', 5000);
  await pg.waitForTimeout(1200); await pg.screenshot({ path: '/tmp/claude-0/s/rot.png' });
  await pg.waitForFunction(() => ['PLAYER_SAFE', 'PLAYER_ELIMINATED'].includes(EhsemhaRoulette.getState().state), null, { timeout: 60000 });
  const ev = await pg.evaluate(() => window.__ev);
  const elim = ev.filter(e => e[0] === 'eliminated').map(e => e[1]);
  const after = await st();
  const tgt = after.players.find(p => p.name === tname), sh = after.players.find(p => p.id === shooter);
  ok(sh.alive, 'صاحب الدور لم يخرج');
  ok(elim.length === (tgt.alive ? 0 : 1) && (tgt.alive || elim[0].name === tname), 'النتيجة على الهدف «' + tname + '»: ' + (tgt.alive ? 'نجا' : 'خرج'));
  ok(!ev.some(e => e[0] === 'eliminated' && e[1].id === shooter), 'لا إقصاء لصاحب الدور');
  ok(after.players.filter(p => p.alive).length === (tgt.alive ? 4 : 3), 'عدد الأحياء صحيح');

  console.log('— مرة واحدة لكل لاعب في المباراة: نكرر حتى يأتي دور نفس اللاعب');
  let again = false;
  for (let i = 0; i < 12 && !again; i++) {
    await waitSt('WAITING_FOR_DECISION');
    const cur = (await st()).pending.pid;
    if (cur === shooter) {
      again = true;
      ok(await pg.$eval('#op3', e => e.classList.contains('lock')), 'الخيار ٣ مقفل لمن استخدمه');
      await say(shooter, '3');
      await pg.waitForTimeout(500);
      ok((await st()).state === 'WAITING_FOR_DECISION', 'كتابة ٣ مرة ثانية لا تعمل');
      await say(shooter, '2');
    } else await say(cur, '2');
    await pg.waitForFunction(() => EhsemhaRoulette.getState().state !== 'WAITING_FOR_DECISION', null, { timeout: 20000 });
  }
  if (!again) console.log('  (لم يأتِ دور نفس اللاعب خلال المحاولات — لم يُختبر القفل)');

  console.log('— انتهاء مهلة الاختيار (١٥ث) يعيد الخيارات');
  let done = false;
  for (let i = 0; i < 12 && !done; i++) {
    await waitSt('WAITING_FOR_DECISION');
    const cur = (await st()).pending.pid;
    if (cur === shooter) { await say(cur, '2'); await pg.waitForFunction(() => EhsemhaRoulette.getState().state !== 'WAITING_FOR_DECISION', null, { timeout: 20000 }); continue; }
    done = true;
    await say(cur, '3'); await waitSt('TARGET_PICK', 10000);
    await pg.waitForFunction(() => EhsemhaRoulette.getState().state === 'WAITING_FOR_DECISION', null, { timeout: 25000 });
    ok(await pg.$eval('#decide', e => e.classList.contains('on')) && await pg.$eval('#tgt', e => !e.classList.contains('on')), 'بعد انتهاء المهلة تعود شاشة الخيارات وتختفي شاشة الأسماء');
    ok(await pg.$eval('#op3', e => e.classList.contains('lock')), 'المحاولة محسوبة (الخيار ٣ مقفل)');
    await say(cur, '2');
  }
  if (!done) console.log('  (لم يأتِ دور لاعب غير مستخدم)');
  console.log('— طلقة تُصيب الهدف (سلطة خارجية تُرجع إصابة)');
  await pg.evaluate(() => { EhsemhaRoulette.stop(); window.__ev = []; EhsemhaRoulette.setAuthority({ pickPlayer: ids => ids[0], resolveFire: o => { window.__fire = o; return true; } }); EhsemhaRoulette.newMatch(); });
  await pg.evaluate(k => { for (let i = 1; i <= 4; i++) EhsemhaRoulette.chat('v' + i, 'م' + i, k); }, kw);
  await pg.evaluate(() => EhsemhaRoulette.start());
  await waitSt('WAITING_FOR_DECISION');
  const sh2 = (await st()).pending.pid;
  await say(sh2, '3'); await waitSt('TARGET_PICK', 10000);
  const tn = await pg.$eval('#tgtL .tg:nth-child(3) span', e => e.textContent);
  await say(sh2, '3');
  await pg.waitForFunction(() => window.__ev.some(e => e[0] === 'eliminated'), null, { timeout: 60000 });
  const el = await pg.evaluate(() => ({ e: window.__ev.find(e => e[0] === 'eliminated')[1], f: window.__fire }));
  ok(el.e.name === tn && el.e.id !== sh2 && el.f.pid === el.e.id && el.f.shooter === sh2, 'الهدف «' + tn + '» هو من خرج وليس صاحب الدور');
  await pg.evaluate(() => EhsemhaRoulette.stop());
  ok(errs.length === 0, 'لا أخطاء جافاسكربت ' + errs.join('|'));
  console.log(`\n${pass}/${pass + fail} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
