'use strict';
// اكذب عليّ: «إعداد المباراة» يفتح أولاً كتابة الجولة (قصتان صادقتان + كذبة) → تُحفظ في البنك وتدخل المباراة → قاعة الانضمام → لعب حتى النهاية.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/ek-write.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 700) : '')); };
const say = (viewer, text) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: viewer, text, identity: { isFollowerOfAnchor: true } });
const RE = /ektheb-alay\.html/;
const F = (page) => page.frames().find((x) => RE.test(x.url()));
const fe = (page, fn, arg) => F(page).evaluate(fn, arg);
async function fwait(page, fn, arg, timeout = 10000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await fe(page, fn, arg)) return true; } catch (e) {} await sleep(80); } return false; }
const STORIES = [
  ['سافرت لليابان مرتين', 'أكلت ستين سمكة في يوم واحد', 'حصلت على جائزة في الرماية'],
  ['عندي قطتان', 'ركبت طيارة شراعية', 'فزت بسباق جري في المدرسة']
];

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); followGateSetRequired(false); localStorage.setItem(STREAMER_USER_STORAGE_KEY, 'streamer1'); window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });
  await page.evaluate(() => { goSetupEk(); launchEk(); });
  const up = await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { try { if (await page.evaluate(() => !!ekApi())) return true; } catch (e) {} await sleep(100); } return false; })();
  check('اكذب عليّ: الإطلاق', up);
  await sleep(500);
  // 1) «إعداد المباراة» → أول شيء كتابة الجولة
  await F(page).click('#bSetup');
  await sleep(300);
  const s0 = await fe(page, () => ({ vis: !document.getElementById('scSetup').hidden, on: document.querySelector('#suTabs .tab.on').dataset.t, tabs: [...document.querySelectorAll('#suTabs .tab')].map((t) => t.dataset.t), t1: !!document.getElementById('w_t1'), t2: !!document.getElementById('w_t2'), lie: !!document.getElementById('w_lie'), labels: [...document.querySelectorAll('#suPane .fld > label')].map((l) => l.textContent) }));
  check('«إعداد المباراة» يفتح أولاً تبويب الكتابة (صدق ١، صدق ٢، كذبة)', s0.vis && s0.on === 'write' && s0.tabs[0] === 'write' && s0.t1 && s0.t2 && s0.lie && s0.labels.includes('القصة الصادقة ١') && s0.labels.includes('القصة الصادقة ٢') && s0.labels.includes('الكذبة'), s0);
  // 2) تحقق: حفظ فارغ / ناقص / متطابق
  await F(page).click('#wSave'); await sleep(150);
  const e1 = await fe(page, () => ({ err: (document.querySelector('#suPane .badge.err') || {}).textContent, rounds: EkthebAlayGame._store.rounds.length, bank: EkthebAlayGame._store.bank.length }));
  check('حفظ فارغ مرفوض برسالة ولا يُضاف شيء', /اكتب/.test(e1.err || '') && e1.rounds === 0 && e1.bank === 0, e1);
  await F(page).fill('#w_t1', 'نفس القصة'); await F(page).fill('#w_t2', 'نفس القصة'); await F(page).fill('#w_lie', 'كذبة مختلفة'); await F(page).click('#wSave'); await sleep(150);
  const e2 = await fe(page, () => ({ err: (document.querySelector('#suPane .badge.err') || {}).textContent, rounds: EkthebAlayGame._store.rounds.length }));
  check('قصتان متطابقتان مرفوضتان', /متطابق/.test(e2.err || '') && e2.rounds === 0, e2);
  // 3) كتابة جولتين وحفظهما
  for (const [t1, t2, lie] of STORIES) {
    await F(page).fill('#w_t1', t1); await F(page).fill('#w_t2', t2); await F(page).fill('#w_lie', lie);
    await F(page).click('#wSave'); await sleep(250);
  }
  const s1 = await fe(page, () => { const S = EkthebAlayGame._store; const d = JSON.parse(localStorage.getItem('ek_draft_v1') || 'null'); return { rounds: S.rounds.map((r) => ({ s: r.stories, t: r.target })), bank: S.bank.length, ls: d ? { b: d.bank.length, r: d.rounds.length } : null, cleared: document.getElementById('w_t1').value === '' && document.getElementById('w_lie').value === '', count: (document.getElementById('wCount') || {}).textContent }; });
  const okLie = s1.rounds.length === 2 && STORIES.every(([t1, t2, lie], i) => s1.rounds[i].s[s1.rounds[i].t] === lie && s1.rounds[i].s.includes(t1) && s1.rounds[i].s.includes(t2));
  check('الجولتان حُفظتا: الكذبة محدّدة صح والصدقتان موجودتان', okLie, s1.rounds);
  check('البنك فيه الجولتين ومحفوظ في التخزين المحلي وتفرغ الحقول بعد الحفظ', s1.bank === 2 && s1.ls && s1.ls.b === 2 && s1.ls.r === 2 && s1.cleared && /2/.test(s1.count), s1);
  // 4) تبويب البنك يعرضها
  await F(page).click('#suTabs .tab[data-t="bank"]'); await sleep(200);
  const bk = await fe(page, () => [...document.querySelectorAll('#suPane .bank-i')].map((n) => n.textContent));
  check('بنك القصص يعرض ما كتبه الستريمر', bk.length === 2 && STORIES.every(([t1, , lie]) => bk.some((x) => x.includes(t1) && x.includes(lie))), bk);
  // 5) «احفظ في البنك فقط» لا يضيف للمباراة
  await F(page).click('#suTabs .tab[data-t="write"]'); await sleep(150);
  await F(page).fill('#w_t1', 'قصة بنك ١'); await F(page).fill('#w_t2', 'قصة بنك ٢'); await F(page).fill('#w_lie', 'كذبة بنك'); await F(page).click('#wSaveBank'); await sleep(200);
  const s2 = await fe(page, () => ({ r: EkthebAlayGame._store.rounds.length, b: EkthebAlayGame._store.bank.length }));
  check('«احفظ في البنك فقط»: يدخل البنك ولا يدخل المباراة', s2.r === 2 && s2.b === 3, s2);
  // 6) ابدأ → قاعة الانضمام
  await F(page).click('#wGo'); await sleep(400);
  check('«ابدأ» يفتح قاعة الانضمام', await fwait(page, () => EkthebAlayGame._G.phase === 'lobby' && !document.getElementById('scGame').hidden));
  const jw = await fe(page, () => EkthebAlayGame._G.cfg.joinWord);
  const V = ['a1', 'a2', 'a3'];
  for (const v of V) await say(v, jw);
  await sleep(500);
  const pl = await fe(page, () => EkthebAlayGame._G.order.slice());
  check('المشاهدون ينضمون بالكلمة', pl.length === 3, pl);
  await fe(page, () => EkthebAlayGame._G.startMatch());
  // 7) يعرض قصص الستريمر نفسها ثم يلعب للنهاية
  const t0 = Date.now(); let shown = new Set(), guard = 0, voted = false, tie = 0;
  while (Date.now() - t0 < 180000 && guard++ < 2000) {
    const s = await fe(page, () => { const G = EkthebAlayGame._G; return { ph: G.phase, st: G.cur ? G.cur.stories.slice() : null }; });
    if (s.st) s.st.forEach((x) => shown.add(x));
    if (s.ph === 'voting') { let k = 0; for (const id of pl) await say(id.replace(/^tiktok:/, ''), String((k++ % 3) + 1)); voted = true; await sleep(150); await fe(page, () => EkthebAlayGame._advance(20000)); }
    else if (s.ph === 'final') break;
    else if (s.ph === 'tieHold') { tie++; await fe(page, (n) => { const G = EkthebAlayGame._G; if (n < 2 && G.next().ok) G.startTiebreak(); else G.declareShared(); }, tie); }
    else await fe(page, () => { const A = EkthebAlayGame; const G = A._G; A._advance(3000); try { const o = G.next(); if (o && o.ok) o.run(); } catch (e) {} });
    await sleep(40);
  }
  const fin = await fe(page, () => { const G = EkthebAlayGame._G; return { ph: G.phase, w: G.winners.length }; });
  const all = STORIES.flat();
  check('اللعبة عرضت قصص الستريمر المكتوبة (كل الستة)', all.every((x) => shown.has(x)), [...shown]);
  check('التصويت وصل والمباراة انتهت بفائز', voted && fin.ph === 'final' && fin.w >= 1, fin);
  await sleep(500);
  const wins = await page.evaluate(() => window.__wins.slice());
  check('الفوز سُجّل رسمياً', wins.length === fin.w && wins.every((x) => x.g === 'اكذب عليّ'), wins);
  check('لا أخطاء JS', page._errors.length === 0, page._errors);
  // 8) المسودة تبقى بعد إعادة التحميل
  await page.evaluate(() => ehsNewGoHome('ek')); await sleep(300);
  await page.evaluate(() => { goSetupEk(); launchEk(); });
  await sleep(2500);
  await F(page).click('#bSetup'); await sleep(300);
  const rl = await fe(page, () => ({ b: EkthebAlayGame._store.bank.length, on: document.querySelector('#suTabs .tab.on').dataset.t }));
  check('بعد إعادة فتح اللعبة: البنك محفوظ والتبويب الأول هو الكتابة', rl.b === 3 && rl.on === 'write', rl);
  // 9) جوال
  await page.setViewportSize({ width: 390, height: 800 }); await sleep(300);
  const mob = await fe(page, () => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check('الجوال: لا تمرير أفقي في شاشة الكتابة', mob.sw <= mob.cw + 2, mob);
  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
