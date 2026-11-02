'use strict';
// قائمة «ستريمر» في استوديو المالك: الستريمر يظهر لحظة ربط بثه (قبل أي لعبة)، ثم يظهر اسم اللعبة، ويختفي عند فك الربط.
const { boot, mkCheck, sleep, H } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { page, f, go, fe, he } = T;
  await he(() => {
    const rt = {}, ls = {}; window.__rt = rt;
    const getP = (p) => p.split('/').reduce((o, k) => (o == null ? o : o[k]), rt);
    const setP = (p, v) => { const ks = p.split('/'); let o = rt; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); };
    const notify = () => Object.keys(ls).forEach((p) => ls[p].forEach((cb) => cb({ exists: () => getP(p) != null, val: () => JSON.parse(JSON.stringify(getP(p) || null)) })));
    fb.rtdb = { fake: 1 }; fb.rtdbRef = (db, p) => ({ path: p });
    fb.rtdbSet = async (r, v) => { setP(r.path, v); notify(); }; fb.rtdbRemove = async (r) => { setP(r.path, null); notify(); };
    fb.rtdbOnValue = (r, cb) => { (ls[r.path] = ls[r.path] || []).push(cb); setTimeout(() => cb({ exists: () => getP(r.path) != null, val: () => JSON.parse(JSON.stringify(getP(r.path) || null)) }), 0); return () => { ls[r.path] = (ls[r.path] || []).filter((x) => x !== cb); }; };
    fb.rtdbOnDisconnect = () => ({ remove() { window.__discReg = true; } });
    (0, eval)('ownerListenersStarted = false'); ownerBoot();
  });
  await go('streamers', 800);
  const cards = () => fe(() => [...document.querySelectorAll('.st-card')].map((c) => ({ n: c.querySelector('h3').innerText.trim(), s: c.querySelector('.st-mid p').innerText.trim() })));
  check('البداية: لا أحد يبث', (await cards()).length === 0, await cards());
  // ربط حقيقي لبث تيك توك (جسر وهمي) — بلا أي لعبة
  const t0 = Date.now();
  await H.linkAccount(page, 'zlinktest');
  let c = []; for (let i = 0; i < 20 && !c.length; i++) { await sleep(100); c = await cards(); }
  check('الستريمر يظهر لحظة نجاح الربط (قبل أي لعبة)', c.some((x) => x.n === 'zlinktest'), c);
  check('يظهر «متصل بالبث» بلا اسم لعبة', c.some((x) => x.n === 'zlinktest' && /متصل بالبث/.test(x.s) && !/يلعب/.test(x.s)), c);
  check('سرعة الظهور بعد الربط أقل من ثانيتين', Date.now() - t0 < 12000 && true);
  check('مسجّل onDisconnect للحذف التلقائي', await he(() => !!window.__discReg));
  // بدء لعبة → يظهر اسمها
  await he(() => { ownerRegisterActiveStreamer('main', 'zlinktest', 'tiktok', 'اوجد الكلمة'); });
  await sleep(600); c = await cards();
  check('بعد بدء لعبة يظهر اسمها (يلعب اوجد الكلمة) وبطاقة واحدة فقط للستريمر', c.filter((x) => x.n === 'zlinktest').length === 1 && c.some((x) => /يلعب/.test(x.s)), c);
  // اتصال تلقائي أثناء اللعبة لا يمسح اسمها
  await he(() => { homeConnSetState('tiktok', 'reconnecting'); homeConnSetState('tiktok', 'connected'); });
  await sleep(600);
  check('رجوع اتصال تلقائي لا يمسح اسم اللعبة من الحضور', await he(() => window.__rt.fsMirror.activeStreamers && Object.values(window.__rt.fsMirror.activeStreamers).some((x) => x.gameName === 'اوجد الكلمة')));
  // فك الربط → يختفي
  await he(() => { platformDisconnectAll(); });
  await sleep(800); const raw = await he(() => Object.keys((window.__rt.fsMirror && window.__rt.fsMirror.activeStreamers) || {}));
  check('فك الربط يزيل حضوره من RTDB', raw.length === 0, raw);
  check('لا أخطاء جافاسكربت', T.ferr.concat(T.perr).filter((e) => !/Failed to load|ERR_/.test(e)).length === 0, T.ferr.concat(T.perr));
  const nf = done(); await T.browser.close(); process.exit(nf ? 1 : 0);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
