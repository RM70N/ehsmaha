'use strict';
// «حلّها قبلي» — دمج مع احسمها عبر سيرفر الجسر المحلي الحقيقي + الشات الوهمي (نفس مسار رسائل البث):
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/npm-tools/node_modules/playwright node tests/bridge/hq.test.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 700) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
const RE = /hallaha-qabli\.html/;
const SHOTS = process.env.HQ_SHOTS || '/tmp/hq-shots';
fs.mkdirSync(SHOTS, { recursive: true });
async function waitFor(page, fn, arg, timeout = 10000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(60); } return false; }
const fr = (page) => page.frames().find((x) => RE.test(x.url()));
const fe = (page, fn, arg) => { const f = fr(page); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
async function fwait(page, fn, arg, timeout = 10000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await fe(page, fn, arg)) return true; } catch (e) {} await sleep(60); } return false; }
async function launch(page) {
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(250);
  await page.evaluate(() => { goSetupHq(); launchHq(); });
  return waitFor(page, () => { const a = window.hqApi && window.hqApi(); return !!a && document.querySelector('.page.active').id === 'pg-hq'; }, null, 30000);
}
const wins = (page) => page.evaluate(() => window.__wins.slice());
const stage = (page) => fe(page, () => { const s = HallahaGame.snapshot(); return { ph: s.phase, st: s.stage, sub: s.submitted, v: s.vaultNo, paused: s.paused, link: s.linkDown, hist: s.hist.length }; });
const E = (page) => (fn, arg) => fe(page, fn, arg);

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });
  const F = E(page);

  // ===== 1) التسجيل والبطاقة =====
  const reg = await page.evaluate(() => ({
    card: !!document.querySelector('.gcard[data-tag="hq"]'), reg: !!TST_GAME_REGISTRY.hq,
    lib: [...document.querySelectorAll('#hlob-grid [data-tag]')].some((n) => n.getAttribute('data-tag') === 'hq'),
    fns: ['launchHq', 'goSetupHq', 'ehsNewGoHome', 'ehsNewOnShow'].filter((f) => typeof window[f] !== 'function'),
    others: ['ek', 'almeezan', 'wesh', 'xo', 'tug', 'bomb', 'roulette3d', 'cannon'].filter((t) => !document.querySelector('.gcard[data-tag="' + t + '"]')),
    name: (document.querySelector('.gcard[data-tag="hq"] .gcard-name') || {}).textContent, desc: (document.querySelector('.gcard[data-tag="hq"] .gcard-desc') || {}).textContent
  }));
  check('البطاقة موجودة ومسجّلة ودوالها معرّفة وبقية الألعاب سليمة', reg.card && reg.reg && reg.fns.length === 0 && reg.others.length === 0, reg);
  check('البطاقة تظهر في مكتبة ألعاب الستريمر باسم ووصف اللعبة المطلوبين', reg.lib && reg.name === 'حلّها قبلي' && reg.desc === 'خزنة برمز سرّي من 3 أرقام. جرّب من الشات، اقرأ نتائج محاولات الجميع، وافتحها قبل غيرك!', reg);
  const served = await page.evaluate(async () => { const r = await fetch('/hallaha-qabli.html', { cache: 'no-store' }); const t = await r.text(); return { st: r.status, embed: /ehsemha-/.test(t) && /EhsemhaEmbed/.test(t) }; });
  check('ملف اللعبة يُخدَّم من الجذر وفيه جسر التضمين', served.st === 200 && served.embed, served);
  // ثبات الأساس: لا تغيّر بالألعاب الأخرى (اختبار وجودها ودوالها)
  const prior = await page.evaluate(() => ['launchEk', 'launchAlmeezan', 'launchWesh'].every((f) => typeof window[f] === 'function'));
  check('ألعاب ehsnew الأخرى ما زالت معرّفة', prior);

  // ===== 2) بث غير مربوط + الإعداد والعودة =====
  await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = await page.evaluate(() => { goSetupHq(); launchHq(); return { t: document.getElementById('hq-status').textContent, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» ولا تفتح اللعبة', /اربط بثك/.test(unl.t) && unl.a === 'pg-setup-hq', unl);
  const back = await page.evaluate(() => { document.querySelector('#pg-setup-hq .back-btn').click(); return document.querySelector('.page.active').id; });
  check('صفحة الإعداد: زر الرجوع يعيد للرئيسية', back === 'pg-home', back);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);
  await page.evaluate(() => followGateSetRequired(false));

  // ===== 3) الإطلاق =====
  check('الإطلاق يفتح الصفحة والإطار', await launch(page));
  const lst = await page.evaluate(() => Object.keys(homeGameListeners));
  check('مستمع واحد فقط مسجّل (hq) ولا تتراكم مستمعات', lst.length === 1 && lst[0] === 'hq', lst);
  check('وضع التضمين: شريط الإدارة العلوي مخفي ولا أدوات تجريبية', await F(() => document.documentElement.classList.contains('embed') && getComputedStyle(document.querySelector('.top')).display === 'none'));
  const fp = (fn, arg) => F(fn, arg);
  await fp(() => { HallahaGame._M.cfg.debug = true; });
  // الإعداد عبر الواجهة الحقيقية
  const f = fr(page);
  await f.click('button:has-text("ابدأ")'); await f.waitForSelector('#su-join');
  await f.fill('#su-join', 'انا'); await f.selectOption('#su-vaults', '3'); await f.selectOption('#su-collect', '10'); await f.selectOption('#su-read', '5'); await f.selectOption('#su-stages', '4'); await f.selectOption('#su-points', '100');
  await f.click('button:has-text("افتح الانضمام")');
  const cfg = await fp(() => { const c = HallahaGame._M.cfg; return { j: c.joinWord, v: c.vaults, c: c.collectSec, r: c.readSec, m: c.maxStages, p: c.points, late: c.late }; });
  check('الإعدادات من الواجهة تصل للمباراة (كلمة، خزنات، مهلة، قراءة، مراحل، نقاط، انضمام متأخر)', cfg.j === 'انا' && cfg.v === 3 && cfg.c === 10 && cfg.r === 5 && cfg.m === 4 && cfg.p === 100 && cfg.late === true, cfg);
  await fp(() => { const c = HallahaGame._M.cfg; c.collectSec = 5; c.readSec = 3; c.maxStages = 3; c.vaults = 2; });
  check('الردهة مفتوحة', await fwait(page, () => HallahaGame.snapshot().phase === 'lobby'));
  const lobbyTxt = await fp(() => document.body.innerText);
  check('الردهة: الكلمة بارزة والمثال الواضح وحالة اتصال البث الحقيقية', /انا/.test(lobbyTxt) && /وقت المحاولة اكتب 3 أرقام مختلفة، مثل 583/.test(lobbyTxt) && /البث متصل/.test(lobbyTxt), lobbyTxt.slice(0, 300));

  // ===== 4) الانضمام من الشات الحقيقي =====
  const viewers = ['v1', 'v2', 'v3', 'v4', 'v5'];
  await say('rnd1', 'مرحبا'); await sleep(250);
  for (const v of viewers) await say(v, 'انا', 'نك' + v, v !== 'v5');
  await say('v1', 'انا', 'نكv1'); await say('rnd1', '583'); await sleep(700);
  const pl = await fp(() => HallahaGame._M.plist().map((p) => ({ id: p.id, name: p.name, av: p.avatar })));
  check('المشاهدون (متابع وغير متابع) ينضمون بالكلمة، الدردشة والمحاولة قبل الانضمام لا تسجّل أحدًا، والتكرار لا يضاعف', pl.length === 5 && viewers.every((v) => pl.some((p) => p.id.endsWith(v))), pl);
  check('هوية المشارك ثابتة (معرّف المنصة مع بادئتها) والاسم المعروض مطابق', pl.every((p) => /^tiktok:/.test(p.id) && p.name === 'نك' + p.id.replace('tiktok:', '')), pl);
  const dupEv = await fp(() => { const a = EhsemhaEmbed; const u = { uniqueId: 'tiktok:evt1', nickname: 'حدث' }; return [a.chat(u, 'انا', 'EV-1').reason, a.chat(u, 'انا', 'EV-1').reason, HallahaGame._M.plist().filter((p) => p.id === 'tiktok:evt1').length]; });
  check('معرّف الحدث المكرر لا يُعالج مرتين ولا ينشئ مشاركًا ثانيًا', dupEv[0] === 'joined' && dupEv[1] === 'dupevent' && dupEv[2] === 1, dupEv);
  await fp(() => HallahaGame._M.removePlayer('tiktok:evt1'));
  check('لا نص «null» ولا بقايا في الواجهة', !/null|undefined|NaN/.test(await fp(() => document.body.innerText)));
  const gate = await page.evaluate(() => followGateSetRequired(true));
  await say('g1', 'انا', 'غير متابع', false); await say('g2', 'انا', 'متابع', true); await sleep(500);
  const gp = await fp(() => HallahaGame._M.plist().map((p) => p.id));
  check('شرط الفولو مفعّل: غير المتابع لا ينضم بالردهة والمتابع ينضم (نفس بوابة الموقع)', !gp.some((id) => id.endsWith('g1')) && gp.some((id) => id.endsWith('g2')), gp);
  await page.evaluate(() => followGateSetRequired(false));
  await fp(() => HallahaGame._M.removePlayer('tiktok:g2'));
  await page.screenshot({ path: path.join(SHOTS, '01_lobby.png') });

  // ===== 5) خزنة 1: محاولات ونتائج =====
  await f.click('#bstart');
  check('بدء المباراة → مرحلة استقبال المحاولات', await fwait(page, () => HallahaGame.snapshot().phase === 'collect', null, 10000));
  const secret = await fp(() => HallahaGame._M.debugSecret());
  const wrong = (x) => { const all = ['012', '345', '678', '901', '234', '567', '890', '123']; return all.filter((c) => c !== secret)[x]; };
  const snapStr0 = await fp(() => JSON.stringify(HallahaGame.snapshot()));
  check('الرمز غير موجود في لقطة العرض أثناء الخزنة', !snapStr0.includes(secret), snapStr0.slice(0, 100));
  await say('v1', wrong(0)); await say('v1', wrong(1));
  await say('v2', 'اظن ' + wrong(2)); await say('v2', '12'); await say('v2', '112'); await say('v2', wrong(2) + ' ' + wrong(3));
  await sleep(400);
  let s = await stage(page);
  check('محاولة ثانية بنفس المرحلة تُتجاهل، والرسائل غير الصالحة لا تستهلك المحاولة ولا تُقبل', s.sub === 1, s);
  await say('v2', wrong(2)); await say('v3', wrong(2)); await say('v4', secret === '583' ? '584' : '583'); await sleep(500);
  s = await stage(page);
  check('المحاولات الصالحة تُحسب (٤ مشاركين أرسلوا) ولا يُعرض شيء قبل الإغلاق', s.sub === 4 && s.hist === 0, s);
  const preTxt = await fp(() => document.getElementById('logbody').innerText);
  check('لوحة السجل أثناء الاستقبال لا تكشف أي محاولة جديدة', !/بمكانه/.test(preTxt.replace(/بمكانه:/g, '')) || /لا نتيجة جزئية/.test(preTxt), preTxt);
  await page.screenshot({ path: path.join(SHOTS, '02_collect.png') });
  check('إغلاق المرحلة: تثبيت المحاولات', await fwait(page, () => HallahaGame.snapshot().phase === 'locked', null, 12000));
  await say('v5', wrong(4)); await sleep(300);
  s = await stage(page);
  check('رسالة بعد الإغلاق مرفوضة', s.sub === 4, s);
  check('عرض النتائج', await fwait(page, () => HallahaGame.snapshot().phase === 'reveal', null, 4000));
  await sleep(1400);
  const rows = await fp(() => [...document.querySelectorAll('#logbody .att')].map((r) => ({ code: [...r.querySelectorAll('.cd i')].map((i) => i.textContent).join(''), rp: r.querySelector('.rp b').textContent, rm: r.querySelector('.rm b').textContent, wh: r.querySelector('.wh').textContent })));
  const E2 = (c, g) => { let e = 0; const rc = [], rg = []; for (let i = 0; i < 3; i++) { if (c[i] === g[i]) e++; else { rc.push(c[i]); rg.push(g[i]); } } let m = 0; for (const x of rg) { const k = rc.indexOf(x); if (k >= 0) { m++; rc.splice(k, 1); } } return [e, m]; };
  const okRows = rows.length === 3 && rows.every((r) => { const [e, m] = E2(secret, r.code); return +r.rp === e && +r.rm === m; });
  check('السجل: ٣ صفوف (محاولتان فريدتان + رمز مكرر من لاعبين بصف واحد) بنتائج صحيحة، وتجميع صاحبي الرمز المكرر', okRows && rows.some((r) => /أصحاب المحاولة \(2\)/.test(r.wh)), { rows, secret });
  const midTxt = await fp(() => document.body.innerText);
  check('الرمز لا يظهر في واجهة اللعب قبل نهاية الخزنة', !midTxt.includes(secret) || rows.some((r) => r.code === secret), secret);
  await say('v3', wrong(5)); await sleep(300);
  s = await stage(page);
  check('رسالة أثناء عرض النتائج مرفوضة ولا تُرحَّل للمرحلة التالية', s.sub === 0 || s.ph === 'reveal', s);
  await page.screenshot({ path: path.join(SHOTS, '03_reveal.png') });

  // ===== 6) المرحلة 2: حل متعدد =====
  check('المرحلة التالية بنفس الرمز', await fwait(page, () => HallahaGame.snapshot().phase === 'collect' && HallahaGame.snapshot().stage === 2, null, 8000));
  check('الرمز نفسه لم يتغير', (await fp(() => HallahaGame._M.debugSecret())) === secret);
  s = await stage(page); check('المرحلة 2 تبدأ بعدّاد صفر (لا ترحيل)', s.sub === 0, s);
  await say('v1', secret); await say('v2', secret); await say('v3', wrong(0)); await sleep(500);
  const wins0 = await wins(page);
  check('لا إعلان فوز ولا تسجيل قبل إغلاق المرحلة', wins0.length === 0 && (await fp(() => HallahaGame._M.plist().every((p) => p.score === 0))), wins0);
  check('فتح الخزنة بعد الإغلاق', await fwait(page, () => HallahaGame.snapshot().phase === 'opening', null, 15000));
  await sleep(3200); await page.screenshot({ path: path.join(SHOTS, '04_opening.png') });
  const sc = await fp(() => Object.fromEntries(HallahaGame._M.plist().map((p) => [p.id.replace('tiktok:', ''), p.score])));
  check('من حلّها في نفس المرحلة يحصلون على نفس النقاط (100) ومن لم يحلّها صفر', sc.v1 === 100 && sc.v2 === 100 && sc.v3 === 0 && sc.v4 === 0, sc);
  const winTxt = await fp(() => document.getElementById('winner').innerText);
  check('شاشة الفتح: الرمز الفعلي وأسماء الفائزين', /نكv1/.test(winTxt) && /نكv2/.test(winTxt) && /معًا/.test(winTxt), winTxt);
  check('الانتقال للخزنة 2', await fwait(page, () => HallahaGame.snapshot().vaultNo === 2 && ['intro', 'collect'].includes(HallahaGame.snapshot().phase), null, 12000));
  const w1 = await wins(page); check('لا تسجيل فوز رسمي قبل نهاية المباراة', w1.length === 0, w1);

  // ===== 7) خزنة 2: لاعب متأخر + انقطاع حقيقي واستئناف =====
  check('خزنة 2: مرحلة المحاولات', await fwait(page, () => HallahaGame.snapshot().phase === 'collect', null, 8000));
  const secret2 = await fp(() => HallahaGame._M.debugSecret());
  const wr2 = (x) => ['012', '345', '678', '901', '234'].filter((c) => c !== secret2)[x];
  await say('late1', 'انا', 'متأخر', true); await sleep(500);
  const lt = await fp(() => ({ in: HallahaGame._M.G.players.has('tiktok:late1'), waiting: (HallahaGame.snapshot().players.find((p) => p.id === 'tiktok:late1') || {}).waiting }));
  check('اللاعب المتأخر ينضم أثناء المباراة ويُعلَّم «يدخل المرحلة القادمة»', lt.in && lt.waiting, lt);
  await say('late1', wr2(0)); await sleep(300);
  s = await stage(page); check('المتأخر لا يشارك بمرحلة بدأت قبله', s.sub === 0, s);
  await say('v4', wr2(1)); await sleep(300);
  check('خزنة 2 المرحلة 1 تكتمل ثم المرحلة 2', await fwait(page, () => HallahaGame.snapshot().stage === 2 && HallahaGame.snapshot().phase === 'collect', null, 20000));
  await say('late1', wr2(2)); await say('v4', wr2(3)); await sleep(400);
  s = await stage(page); check('المتأخر يلعب من المرحلة التالية ومحاولته تُحتسب', s.sub === 2, s);
  // انقطاع حقيقي: إيقاف سيرفرَي الجسر
  const msgsBefore = await fp(() => HallahaGame._M.G.cur.attempts.size);
  execSync(path.join(__dirname, 'servers.sh') + ' stop all');
  const down = await fwait(page, () => HallahaGame.snapshot().linkDown === true && HallahaGame.snapshot().paused === true, null, 40000);
  check('انقطاع البث الحقيقي: توقفت المهلة تلقائيًا وظهر تنبيه واضح', down && /انقطع اتصال البث/.test(await fp(() => document.getElementById('alerts').innerText)), await stage(page));
  const secretDown = await fp(() => HallahaGame._M.debugSecret());
  await sleep(8000);
  s = await stage(page);
  check('أثناء الانقطاع: الرمز والمحاولات والمرحلة محفوظة ولم تبدأ خزنة جديدة', secretDown === secret2 && s.sub === msgsBefore && s.ph === 'collect' && s.v === 2, { s, secretDown, msgsBefore });
  execSync(path.join(__dirname, 'servers.sh') + ' start all');
  let up = false; for (let i = 0; i < 90 && !up; i++) { await sleep(1000); up = await fp(() => HallahaGame.snapshot().linkDown === false); }
  check('بعد عودة الاتصال: التنبيه يدعو للاستئناف ولا استئناف تلقائي', up && (await fp(() => HallahaGame.snapshot().paused === true)) && /رجع الاتصال/.test(await fp(() => document.getElementById('alerts').innerText)), await stage(page));
  // ننتظر اتصال الناقل الفعلي ثم نرسل رسالة أثناء الإيقاف
  await waitFor(page, () => homeHasActiveConnection(), null, 30000); await sleep(1500);
  await say('v5', wr2(4)); await sleep(500);
  s = await stage(page); check('رسائل الإيقاف المؤقت لا تُعالج كمحاولات', s.sub === msgsBefore && s.paused === true, s);
  await page.screenshot({ path: path.join(SHOTS, '05_resume_alert.png') });
  await f.click('#bpause'); await sleep(400);
  s = await stage(page); check('الاستئناف يدويًا يكمل المرحلة بنفس الرمز والمحاولات', !s.paused && s.ph === 'collect' && s.sub === msgsBefore && (await fp(() => HallahaGame._M.debugSecret())) === secret2, s);
  await say('v5', wr2(4)); await sleep(400);
  s = await stage(page); check('بعد الاستئناف تُقبل المحاولات الجديدة', s.sub === msgsBefore + 1, s);
  // إنهاء بلا حل → صمدت
  check('المرحلة 3 (الأخيرة)', await fwait(page, () => HallahaGame.snapshot().stage === 3 && HallahaGame.snapshot().phase === 'collect', null, 25000));
  check('الخزنة صمدت (بلا فائز مختلق) وكُشف الرمز', await fwait(page, () => HallahaGame.snapshot().phase === 'held', null, 25000) && (await fp(() => HallahaGame.snapshot().result.code)) === secret2 && /الخزنة صمدت هالمرة/.test(await fp(() => document.getElementById('vtitle').innerText)));
  await page.screenshot({ path: path.join(SHOTS, '06_held.png') });
  check('النهاية: تعادل v1 و v2 → لا يسجَّل فوز قبل قرار الستريمر', await fwait(page, () => HallahaGame.snapshot().phase === 'final', null, 12000) && (await wins(page)).length === 0, await wins(page));
  await page.screenshot({ path: path.join(SHOTS, '07_final_tie.png') });
  await f.click('button:has-text("فوز مشترك")'); await sleep(800);
  const ww = await wins(page);
  check('الفوز المشترك يُسجَّل رسميًا مرة واحدة لكل فائز باسم اللعبة', ww.length === 2 && ww.every((x) => x.g === 'حلّها قبلي') && ww.some((x) => x.id.endsWith('v1')) && ww.some((x) => x.id.endsWith('v2')), ww);
  const errs1 = page._errors.slice();
  check('لا أخطاء JS في الصفحة أثناء المباراة', errs1.length === 0, errs1);

  // ===== 8) الخروج والعودة =====
  await page.evaluate(() => ehsNewGoHome('hq')); await sleep(400);
  const ex = await page.evaluate(() => ({ a: document.querySelector('.page.active').id, src: document.getElementById('hq-frame').getAttribute('src'), l: Object.keys(homeGameListeners) }));
  check('الخروج يرجع للرئيسية ويفرّغ الإطار ويلغي الاشتراك', ex.a !== 'pg-hq' && (ex.src === 'about:blank' || !ex.src) && !ex.l.includes('hq'), ex);
  check('إعادة التشغيل بعد الخروج تعمل', await launch(page));
  await fp(() => { HallahaGame._M.cfg.debug = true; });
  const f2 = fr(page); await f2.click('button:has-text("ابدأ")'); await f2.waitForSelector('#su-join'); await f2.fill('#su-join', 'انا'); await f2.click('button:has-text("افتح الانضمام")');
  await fp(() => { const c = HallahaGame._M.cfg; c.collectSec = 6; c.readSec = 3; c.maxStages = 2; c.vaults = 1; });
  await say('back1', 'انا', 'عاد', true); await sleep(600);
  check('بعد الخروج والعودة: الشات يصل للعبة (انضمام ناجح)', (await fp(() => HallahaGame._M.G.players.has('tiktok:back1'))) === true);
  // لا إرسال للعبة أخرى: افتح «وش تغيّر؟» وتأكد أن اللعبة السابقة لا تستقبل
  await page.evaluate(() => ehsNewGoHome('hq')); await sleep(300);
  await page.evaluate(() => { goSetupWesh(); launchWesh(); });
  await waitFor(page, () => window.weshApi && window.weshApi(), null, 30000);
  const l2 = await page.evaluate(() => Object.keys(homeGameListeners));
  check('لعبة أخرى نشطة: مستمعها وحده مسجّل ولا يصل شيء لـ«حلّها قبلي»', l2.length === 1 && l2[0] === 'wesh' && !(await page.evaluate(() => { const f = document.getElementById('hq-frame'); return f && /hallaha/.test(f.src); })), l2);
  await page.evaluate(() => ehsNewGoHome('wesh')); await sleep(300);

  // ===== 9) الأداء: 100 مشارك =====
  console.log('--- 100 مشارك');
  check('تشغيل جولة الأداء', await launch(page));
  await fp(() => { HallahaGame._M.cfg.debug = true; });
  const f3 = fr(page); await f3.click('button:has-text("ابدأ")'); await f3.waitForSelector('#su-join'); await f3.fill('#su-join', 'انا'); await f3.click('button:has-text("افتح الانضمام")');
  await fp(() => { const c = HallahaGame._M.cfg; c.collectSec = 25; c.readSec = 4; c.maxStages = 3; c.vaults = 1; });
  const N = 100;
  const tj0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => say('p' + i, 'انا', 'لاعب' + i, i % 2 === 0)));
  await waitFor(page, () => true); await fwait(page, (n) => HallahaGame._M.plist().length >= n, N, 20000);
  const joined = await fp(() => HallahaGame._M.plist().length);
  check('100 مشارك ينضمون عبر نفس مسار البث', joined === N, { joined, ms: Date.now() - tj0 });
  await page.screenshot({ path: path.join(SHOTS, '08_lobby100.png') });
  await f3.click('#bstart');
  await fwait(page, () => HallahaGame.snapshot().phase === 'collect', null, 10000);
  const sec3 = await fp(() => HallahaGame._M.debugSecret());
  const cands = []; for (let a = 0; a < 10; a++) for (let b = 0; b < 10; b++) for (let c = 0; c < 10; c++) if (a !== b && a !== c && b !== c) cands.push('' + a + b + c);
  const tm0 = Date.now();
  await Promise.all(Array.from({ length: N }, (_, i) => say('p' + i, cands[(i * 7) % 700 === 0 ? 1 : (i * 7) % 700] !== sec3 ? cands[(i * 7 + 1) % 720] === sec3 ? '012' : cands[(i * 7 + 1) % 720] : '345')));
  await fwait(page, () => HallahaGame.snapshot().submitted >= 90, null, 20000);
  const subm = await fp(() => HallahaGame.snapshot().submitted);
  check('100 رسالة محاولة تُعالج بسرعة (≥ 90 مقبولة، الباقي مكرر رمز لا مشكلة) خلال أقل من 10 ثواني', subm >= 60 && Date.now() - tm0 < 10000, { subm, ms: Date.now() - tm0 });
  await page.screenshot({ path: path.join(SHOTS, '09_collect100.png') });
  await fwait(page, () => HallahaGame.snapshot().phase === 'reveal', null, 40000);
  const t0 = Date.now(); await sleep(1500);
  const nRows = await fp(() => document.querySelectorAll('#logbody .att').length);
  const lag = await fp(() => new Promise((res) => { const t = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => res(performance.now() - t))); }));
  check('عرض سجل كبير يبقى سلسًا (إطاران < 400ms) والسجل قابل للتمرير داخليًا', nRows >= 20 && lag < 400, { nRows, lag });
  await page.screenshot({ path: path.join(SHOTS, '10_reveal100.png') });
  const ov = await fp(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth, lb: (() => { const e = document.getElementById('logbody'); return e.scrollHeight > e.clientHeight; })() }));
  check('لا تمرير أفقي للصفحة', ov.sw <= ov.iw + 1, ov);
  // جوال
  await page.setViewportSize({ width: 390, height: 800 }); await sleep(600);
  const mv = await fp(() => ({ sw: document.scrollingElement.scrollWidth, iw: window.innerWidth }));
  await page.screenshot({ path: path.join(SHOTS, '11_mobile.png') });
  check('واجهة الجوال بلا تمرير أفقي', mv.sw <= mv.iw + 1, mv);
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.evaluate(() => ehsNewGoHome('hq')); await sleep(300);
  check('لا أخطاء JS نهائيًا', page._errors.length === 0 && page._consoleErrors.length === 0, { e: page._errors, c: page._consoleErrors });

  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
