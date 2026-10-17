'use strict';
// الميزان 3D + اكذب عليّ + وش تغيّر؟ (iframes مستقلة) — دمج مع احسمها عبر جسر تيك توك المحلي المزيّف:
// الكرت، الإطلاق (يتطلب بثاً مربوطاً)، انضمام المشاهدين والمتابعين بالشات، اللعب، الفوز الرسمي، الخروج.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/new3.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 700) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); }
  return false;
}
const fr = (page, re) => page.frames().find((x) => re.test(x.url()));
const fe = (page, re, fn, arg) => { const f = fr(page, re); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
async function fwait(page, re, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await fe(page, re, fn, arg)) return true; } catch (e) {} await sleep(80); }
  return false;
}
const DEFS = {
  almeezan: { fn: 'Almeezan', re: /almeezan3d\.html/, name: 'الميزان' },
  ek: { fn: 'Ek', re: /ektheb-alay\.html/, name: 'اكذب عليّ' },
  wesh: { fn: 'Wesh', re: /wesh-taghayar\.html/, name: 'وش تغيّر؟' }
};
async function launch(page, tag) {
  const D = DEFS[tag];
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(250);
  await page.evaluate(([fn]) => { window['goSetup' + fn](); window['launch' + fn](); }, [D.fn]);
  return waitFor(page, ([tag, fn]) => { const a = window[tag + 'Api'] && window[tag + 'Api'](); return !!a && document.querySelector('.page.active').id === 'pg-' + tag; }, [tag, D.fn], 30000);
}
async function home(page, tag) { await page.evaluate((t) => ehsNewGoHome(t), tag); await sleep(300); }
const wins = (page) => page.evaluate(() => window.__wins.slice());

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });

  // ===== 1) التسجيل =====
  const reg = await page.evaluate(() => {
    const out = {};
    ['ek', 'almeezan', 'wesh'].forEach((t) => { out[t] = { card: !!document.querySelector('.gcard[data-tag="' + t + '"]'), reg: !!(TST_GAME_REGISTRY[t]), lib: [...document.querySelectorAll('#hlob-grid [data-tag]')].some((n) => n.getAttribute('data-tag') === t) }; });
    out.fns = ['launchEk', 'launchAlmeezan', 'launchWesh', 'goSetupEk', 'goSetupAlmeezan', 'goSetupWesh', 'ehsNewGoHome', 'ehsNewOnShow'].filter((f) => typeof window[f] !== 'function');
    out.others = ['xo', 'tug', 'bomb', 'roulette3d'].filter((t) => !document.querySelector('.gcard[data-tag="' + t + '"]'));
    return out;
  });
  check('الكروت الثلاثة موجودة ومسجّلة ودوالها معرّفة وبقية الألعاب سليمة', ['ek', 'almeezan', 'wesh'].every((t) => reg[t].card && reg[t].reg) && reg.fns.length === 0 && reg.others.length === 0, reg);
  check('الكروت تظهر في مكتبة الألعاب', ['ek', 'almeezan', 'wesh'].every((t) => reg[t].lib), reg);
  const served = await page.evaluate(async () => { const o = {}; for (const f of ['ektheb-alay', 'almeezan3d', 'wesh-taghayar']) { const r = await fetch('/' + f + '.html', { cache: 'no-store' }); const t = await r.text(); o[f] = { st: r.status, embed: /ehsemha-/.test(t) && /EhsemhaEmbed/.test(t) }; } return o; });
  check('الملفات الثلاثة تُخدَّم من الجذر وفيها جسر التضمين', Object.values(served).every((s) => s.st === 200 && s.embed), served);

  // ===== 2) بث غير مربوط =====
  await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = [];
  for (const tag of Object.keys(DEFS)) {
    const r = await page.evaluate(([fn, tag]) => { window['goSetup' + fn](); window['launch' + fn](); return { t: document.getElementById(tag + '-status').textContent, a: document.querySelector('.page.active').id }; }, [DEFS[tag].fn, tag]);
    if (!(/اربط بثك/.test(r.t) && r.a === 'pg-setup-' + tag)) unl.push([tag, r]);
  }
  check('بث غير مربوط: رسالة «اربط بثك» ولا تفتح اللعبة (الثلاث)', unl.length === 0, unl);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);

  // ===== 3) الميزان =====
  console.log('--- الميزان');
  check('الميزان: الإطلاق يفتح الصفحة والإطار', await launch(page, 'almeezan'));
  const E = (fn, arg) => fe(page, DEFS.almeezan.re, fn, arg);
  check('الميزان: الإطار في وضع التضمين والمحاكي مخفي', await E(() => document.documentElement.classList.contains('embed') && getComputedStyle(document.getElementById('simChip')).display === 'none'));
  await E(() => { document.getElementById('bOpen').click(); });
  check('الميزان: فتح القاعة (lobby)', await fwait(page, DEFS.almeezan.re, () => window.AlmeezanGame.getState().phase === 'lobby'));
  const jw = await E(() => window.AlmeezanGame._match.cfg.joinWord);
  const viewers = ['v1', 'v2', 'v3', 'v4', 'v5'];
  await say('rnd1', 'مرحبا');
  await sleep(300);
  for (const v of viewers) await say(v, jw, 'نك' + v, v !== 'v5');
  await say('v1', jw);
  await sleep(600);
  const pl = await E(() => window.AlmeezanGame.getState().players.map((p) => p.id));
  check('الميزان: المشاهدون (متابعون وغير متابعين) ينضمون بكلمة الانضمام، الدردشة العادية تُتجاهل، والتكرار لا يضاعف', viewers.every((v) => pl.some((id) => id.endsWith(v))) && pl.length === 5, pl);
  const ids = pl.slice();
  await E(() => document.getElementById('bStart').click());
  check('الميزان: بدء المباراة → وصول مرحلة الاختيار', await fwait(page, DEFS.almeezan.re, () => window.AlmeezanGame.getState().phase === 'picking', null, 25000) || await fwait(page, DEFS.almeezan.re, () => ['conditions', 'picking'].includes(window.AlmeezanGame.getState().phase), null, 3000));
  await sleep(500);
  const gotStart = await page.evaluate(() => (window.__ehsmsgs || []).length);
  // نلعب حتى النهاية: كل لاعب حيّ يختار يمين/يسار حسب فرديته، والتحدي يرسل «يمين 1»
  const t0 = Date.now(); let guard = 0, sawPick = false, sawBelt = false, sawCh = false, lastPhase = '';
  while (Date.now() - t0 < 240000 && guard++ < 4000) {
    const s = await E(() => { const m = window.AlmeezanGame._match; return { ph: m.phase, alive: m.alive().map((p) => p.id), ch: m.ch ? m.ch.participants.slice() : [] }; });
    if (!s) break;
    if (s.ph !== lastPhase) { lastPhase = s.ph; }
    if (s.ph === 'picking') {
      const alive = s.alive; let k = 0;
      for (const id of alive) { const v = id.replace(/^tiktok:/, ''); const side = (k++ % 2) ? 'يسار' : 'يمين'; await say(v, (k === 3 && !sawBelt) ? 'حزام ' + side : side); if (k === 3) sawBelt = true; }
      sawPick = true;
      await sleep(200);
      await E(() => window.AlmeezanGame._advance(40000));
    } else if (s.ph === 'chPick') {
      for (const id of s.ch) { const v = id.replace(/^tiktok:/, ''); await say(v, 'يمين 1'); }
      sawCh = true; await sleep(200);
      await E(() => window.AlmeezanGame._advance(30000));
    } else if (s.ph === 'final') break;
    else await E(() => window.AlmeezanGame._advance(1500));
    await sleep(40);
  }
  const fin = await E(() => { const m = window.AlmeezanGame._match; return { ph: m.phase, w: m.winners.slice(), round: m.round }; });
  check('الميزان: اللعب يصل لنهاية المباراة (final) بفائز/فائزين', fin && fin.ph === 'final' && fin.w.length >= 1, fin);
  check('الميزان: اختيارات الشات (يمين/يسار/حزام) وصلت اللعبة فعلاً', sawPick && sawBelt, { sawPick, sawBelt, sawCh });
  await sleep(500);
  const w1 = await wins(page);
  check('الميزان: الفوز سُجّل رسمياً مرة واحدة باسم اللعبة', w1.length >= 1 && w1.every((x) => x.g === 'الميزان') && fin && w1.length === fin.w.length, { w1, fin });
  check('الميزان: لا أخطاء JS في الصفحة/المشهد', page._errors.length === 0 && !(await E(() => window.AlmeezanGame._errors().scene || window.AlmeezanGame._errors().hud)), { e: page._errors, sc: await E(() => window.AlmeezanGame._errors()) });
  // الخروج
  await home(page, 'almeezan');
  const afterExit = await page.evaluate(() => ({ a: document.querySelector('.page.active').id, src: document.getElementById('almeezan-frame').getAttribute('src'), l: typeof homeGameListeners === 'undefined' ? null : !!(homeGameListeners && homeGameListeners.almeezan) }));
  check('الميزان: الخروج يرجع للرئيسية ويفرّغ الإطار', afterExit.a !== 'pg-almeezan' && (afterExit.src === 'about:blank' || !afterExit.src), afterExit);

  // ===== 4) اكذب عليّ =====
  console.log('--- اكذب عليّ');
  await page.evaluate(() => { window.__wins = []; });
  check('اكذب عليّ: الإطلاق', await launch(page, 'ek'));
  const K = (fn, arg) => fe(page, DEFS.ek.re, fn, arg);
  check('اكذب عليّ: وضع التضمين', await K(() => document.documentElement.classList.contains('embed')));
  // نجهّز ثلاث جولات قصيرة بالتجربة السريعة ثم نحذف لاعبي التجربة لنترك المشاهدين الحقيقيين
  await K(() => { const A = window.EkthebAlayGame; A._skipIntro(); A._quick(); });
  check('اكذب عليّ: القاعة مفتوحة', await fwait(page, DEFS.ek.re, () => window.EkthebAlayGame._G.phase === 'lobby'));
  await K(() => { const G = window.EkthebAlayGame._G; G.players.clear(); G.order = []; });
  const ejw = await K(() => window.EkthebAlayGame._G.cfg.joinWord);
  for (const v of viewers) await say(v, ejw, 'ك' + v, v !== 'v5');
  await say('v2', ejw);
  await say('rnd2', 'هلا');
  await sleep(600);
  const epl = await K(() => window.EkthebAlayGame._G.order.slice());
  check('اكذب عليّ: انضمام المشاهدين بالكلمة (5 لاعبين، بلا تكرار، الدردشة تُتجاهل)', epl.length === 5 && viewers.every((v) => epl.some((id) => id.endsWith(v))), epl);
  await K(() => { const G = window.EkthebAlayGame._G; G.startMatch(); });
  const ek0 = Date.now(); let ekGuard = 0, sawVote = false, ekPhases = new Set();
  while (Date.now() - ek0 < 180000 && ekGuard++ < 2000) {
    const ph = await K(() => window.EkthebAlayGame._G.phase);
    ekPhases.add(ph);
    if (ph === 'voting') {
      let k = 0; for (const id of epl) { const v = id.replace(/^tiktok:/, ''); await say(v, String((k++ % 3) + 1)); }
      sawVote = true; await sleep(150);
      const voted = await K(() => window.EkthebAlayGame._G.answered);
      if (ekPhases.size && !ekPhases.has('voted-count-ok') && voted === 5) ekPhases.add('voted-count-ok');
      await K(() => window.EkthebAlayGame._advance(20000));
    } else if (ph === 'final') break;
    else if (ph === 'tieHold') { await K(() => { const G = window.EkthebAlayGame._G; const o = G.nextAction ? G.nextAction() : null; if (o && o.ok && o.run) o.run(); else G.doNext(); }); }
    else { await K(() => { const A = window.EkthebAlayGame; const G = A._G; A._advance(3000); try { const o = G.nextAction && G.nextAction(); if (o && o.ok && o.run) o.run(); else A.next(); } catch (e) { try { A.next(); } catch (x) {} } }); }
    await sleep(40);
  }
  const efin = await K(() => { const G = window.EkthebAlayGame._G; return { ph: G.phase, w: (G.winners || []).slice() }; });
  check('اكذب عليّ: التصويت بالأرقام ١/٢/٣ وصل (5 أصوات)', sawVote && ekPhases.has('voted-count-ok'), [...ekPhases]);
  check('اكذب عليّ: وصلت المباراة للنهاية بفائز', efin && efin.ph === 'final' && efin.w.length >= 1, { efin, ph: [...ekPhases] });
  await sleep(500);
  const ew = await wins(page);
  check('اكذب عليّ: الفوز سُجّل رسمياً باسم اللعبة', ew.length >= 1 && ew.every((x) => x.g === 'اكذب عليّ') && efin && ew.length === efin.w.length, { ew, efin });
  check('اكذب عليّ: لا أخطاء JS', page._errors.length === 0, page._errors);
  await home(page, 'ek');
  const ex2 = await page.evaluate(() => ({ a: document.querySelector('.page.active').id, src: document.getElementById('ek-frame').getAttribute('src') }));
  check('اكذب عليّ: الخروج يرجع للرئيسية', ex2.a !== 'pg-ek' && (ex2.src === 'about:blank' || !ex2.src), ex2);

  // ===== 5) وش تغيّر؟ =====
  console.log('--- وش تغيّر؟');
  await page.evaluate(() => { window.__wins = []; });
  check('وش تغيّر: الإطلاق', await launch(page, 'wesh'));
  const W = (fn, arg) => fe(page, DEFS.wesh.re, fn, arg);
  check('وش تغيّر: وضع التضمين', await W(() => document.documentElement.classList.contains('embed')));
  await W(() => { window.WeshTaghayarGame._M.cfg.rounds = 2; window.WeshTaghayarGame.openLobby(); });
  check('وش تغيّر: القاعة مفتوحة', await fwait(page, DEFS.wesh.re, () => window.WeshTaghayarGame._M.G.phase === 'lobby'));
  const wjw = await W(() => window.WeshTaghayarGame._M.G.cfg.joinWord);
  for (const v of viewers) await say(v, wjw, 'و' + v, v !== 'v5');
  await say('v3', wjw);
  await say('rnd3', 'مرحبا');
  await sleep(600);
  const wpl = await W(() => Object.keys(window.WeshTaghayarGame._M.G.players));
  check('وش تغيّر: انضمام المشاهدين بالكلمة (5، بلا تكرار)', wpl.length === 5 && viewers.every((v) => wpl.some((id) => id.endsWith(v))), wpl);
  await W(() => { window.WeshTaghayarGame.startMatch(); });
  const w0 = Date.now(); let wGuard = 0, sawAnswer = 0;
  while (Date.now() - w0 < 240000 && wGuard++ < 4000) {
    const s = await W(() => { const M = window.WeshTaghayarGame._M; const G = M.G; return { ph: G.phase, ch: G.round ? G.round.changes : null, multi: G.round ? G.round.multi : null }; });
    if (s.ph === 'answer' && s.ch) {
      // إجابات صحيحة للأول والثاني: رقم العنصر + نوع التغيير
      const first = await W(() => { const ch = window.WeshTaghayarGame._M.G.round.changes[0]; return { t: ch.t, i: ch.i, a: ch.a, b: ch.b }; });
      sawAnswer++;
      // نجرب نصوص متعددة: كل لاعب بصيغة مختلفة، نتحقق من القبول لاحقاً
      let k = 0;
      for (const id of wpl) {
        const v = id.replace(/^tiktok:/, '');
        const T = { color: 'لون', vanish: 'اختفى', size: 'حجم', dir: 'اتجاه', text: 'نص', swap: 'تبديل', shadow: 'ظل', screen: 'انعكاس', add: 'اضافة' };
        const word = T[first.t] || String(first.t);
        const text = first.t === 'swap' ? (first.a + ' ' + first.b + ' تبديل') : (first.i + ' ' + word);
        await say(v, k++ === 0 ? 'xyz ' + text : text);
      }
      await sleep(250);
      await W(() => { const M = window.WeshTaghayarGame._M; M.lock(); });
    } else if (s.ph === 'final') break;
    else await W(() => { const M = window.WeshTaghayarGame._M; const ph = M.G.phase; if (ph === 'prep' && !M.G.ready) { try { M.sceneReady(); } catch (e) {} } if (['prep', 'watch', 'cover'].includes(ph)) { try { M.skipTo('cover'); } catch (e) {} M.tick(); } else if (['locked', 'compare', 'results'].includes(ph)) { M.advance(); M.tick(); } });
    await sleep(120);
  }
  const wfin = await W(() => { const M = window.WeshTaghayarGame._M; const G = M.G; return { ph: G.phase, leaders: M.leaders().map((p) => p.id), scores: M.plist().map((p) => p.score) }; });
  check('وش تغيّر: اللعب يصل للنتيجة النهائية', wfin && wfin.ph === 'final', wfin);
  check('وش تغيّر: على الأقل بعض الإجابات حُسبت (نقاط > 0)', wfin && wfin.scores.some((s) => s > 0), { wfin, sawAnswer });
  await sleep(600);
  const ww = await wins(page);
  check('وش تغيّر: الفوز سُجّل رسمياً باسم اللعبة', ww.length >= 1 && ww.every((x) => x.g === 'وش تغيّر؟'), { ww, wfin });
  check('وش تغيّر: لا أخطاء JS', page._errors.length === 0, page._errors);
  await home(page, 'wesh');
  const wx = await page.evaluate(() => ({ a: document.querySelector('.page.active').id, src: document.getElementById('wesh-frame').getAttribute('src') }));
  check('وش تغيّر: الخروج يرجع للرئيسية', wx.a !== 'pg-wesh' && (wx.src === 'about:blank' || !wx.src), wx);

  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
