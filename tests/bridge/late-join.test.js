'use strict';
// «لاعب متأخر» — اختبار فعلي لكل ألعاب الستريمر الـ31 عبر سيرفر الجسر الحقيقي (fake connector) وindex.html الحقيقي.
// لكل لعبة: تشغيل ← لاعبون عاديون ← بدء الجولة ← زر «لاعب متأخر» (واحد، بجانب أزرار اللوحة) ←
// قبل التفعيل لا يدخل أحد (الألعاب غير المفتوحة) ← فتح النافذة (الكلمة الفعلية) ← متأخر يدخل كلاعب حقيقي
// داخل منطق اللعبة ← تكرار ×6 + تغيير الاسم = لا تكرار ← لاعب خرج/أُقصي بالجولة لا يرجع ← إيقاف الاستقبال
// فعلي ← دفعة متأخرين متزامنة ← تغيير الكلمة ← جولة جديدة تصفّر الأهلية.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright [CYCLES=5] node tests/bridge/late-join.test.js [tag,tag,...]
const H = require('./harness');
const games = require('./games');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ONLY = (process.argv[2] || '').split(',').filter(Boolean);
const results = [];
let cur = '';
const check = (name, ok, detail) => { results.push({ game: cur, name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + '[' + cur + '] ' + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 400) : '')); };
const ctl = (o) => H.ctl(H.PRIMARY, Object.assign({ user: STREAMER, identity: { isFollowerOfAnchor: true } }, o));
const say = (viewer, text, nickname) => ctl({ cmd: 'chat', viewer, nickname: nickname || viewer, text });
const G = (tag) => Object.assign({}, games.find((g) => g.tag === tag));
async function waitFor(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(150); }
  return false;
}
const ev = (page, expr, uid) => page.evaluate(([e, uid]) => { try { return (0, eval)('(function(uid){ return (' + e + '); })')(uid); } catch (x) { return 'ERR:' + x.message; } }, [expr, uid]);
const lj = (page, tag) => page.evaluate((t) => { __lateJoin.tick(); const s = __lateJoin.state(t); return { pg: (document.querySelector('.page.active') || {}).id, last: (window.__shows || []).slice(-1)[0], mode: s.mode, round: s.round, open: s.open, phase: s.phase, count: s.count, seen: s.seen.size, pending: s.pending.size, awaiting: s.awaiting.size, on: __lateJoin.effectiveOn(t) }; }, tag);

/* ---------------- إعداد كل لعبة ----------------
   isIn: هل اللاعب داخل اللعبة · deep: فحص الدمج بمنطق اللعبة · start: بدء الجولة · elim: إخراج لاعب كما تفعل اللعبة
   lobby: رجوع لجولة جديدة · kwVar: متغيّر الكلمة · n: عدد اللاعبين العاديين · kind: managed/native */
const RESET = "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()";
const C = {
  main: { g: G('main'), isIn: 'participants.has(uid)', start: 'startRound()', elim: 'participants.delete(uid)', lobby: RESET, kwVar: 'keyword',
    play: ['شمس'], deep: "guesses.some(x => x.user && x.user.uniqueId === uid)" },
  gw: { g: G('gw'), isIn: 'gwParticipants.has(uid)', start: 'gwBeginNewRound()', elim: 'gwParticipants.delete(uid)', lobby: RESET, kwVar: 'gwKeyword' },
  sniper: { g: G('sniper'), isIn: 'sniperParticipants.has(uid)', afterJoin: async (ids) => { for (let i = 0; i < ids.length; i++) await say(ids[i], String(3 + i)); },
    start: 'startSniperRound()', elim: 'sniperParticipants.delete(uid), sniperEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'sniperKeyword',
    deep: "(() => { const p = sniperParticipants.get(uid); return !!(p && p.cell && sniperCells[p.cell].includes(uid)); })()" },
  hz: { g: G('hz'), isIn: 'hzParticipants.has(uid)', start: 'startHzRound()', elim: 'hzParticipants.delete(uid), hzEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'hzKeyword',
    deep: "(() => { const p = hzParticipants.get(uid); return !!(p && p.cell && hzCells[p.cell] === uid); })()" },
  rou: { g: G('rou'), isIn: 'rouParticipants.has(uid)', start: 'startRouletteRound()', elim: 'rouParticipants.delete(uid), rouEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'rouKeyword',
    deep: "rouActivePlayers.includes(rouParticipants.get(uid).nickname) && rouPlayerNumbers.has(uid)" },
  tmr: { g: G('tmr'), kind: 'native', isIn: 'tmrParticipants.has(uid)', start: 'startTimerClock()', lobby: RESET, kwVar: 'tmrKeyword',
    play: ['وقف'], deep: "tmrGuesses.some(x => (x.uid || (x.user && x.user.uniqueId)) === uid)" },
  bomb: { g: G('bomb'), kind: 'native', heavy: 1, n: 4, isIn: "bombApi().getState().players.some(p => p.id === uid)",
    start: "(bombApi().settings({ times: '600,600,600' }), bombApi().start())",
    openBtn: "document.querySelector('#bomb-frame').contentDocument.getElementById('b3d-bLate')", openVia: "document.querySelector('#bomb-frame').contentDocument.getElementById('b3d-bLate').click()", elim: 'bombApi().kick(uid)', lobby: 'bombApi().reset()',
    deep: "bombApi().getState().players.find(p => p.id === uid).num > 0" },
  box: { g: G('box'), isIn: 'boxParticipants.has(uid)', start: 'startBoxRound()', elim: 'boxParticipants.delete(uid), boxEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'boxKeyword', n: 4,
    deep: 'boxTurnOrder.includes(uid)' },
  cr: { g: G('cr'), isIn: 'crParticipants.has(uid)', start: 'startCrRound()', elim: 'crParticipants.delete(uid)', lobby: RESET, kwVar: 'crKeyword',
    play: ['يلا'], deep: 'crProgress.get(uid) > 0' },
  mz: { g: G('mz'), isIn: 'mzParticipants.has(uid)', start: 'startMzRound()', elim: 'mzParticipants.delete(uid)', lobby: RESET, kwVar: 'mzKeyword',
    deep: "!!document.getElementById('mz-token-' + uid) && mzPos.has(uid)" },
  ev: { g: G('ev'), isIn: 'evParticipants.has(uid)', start: 'startEvRound()', elim: 'evParticipants.delete(uid)', lobby: RESET, kwVar: 'evKeyword', n: 4,
    deep: "!!document.getElementById('ev-card-' + uid) && document.querySelectorAll('#ev-grid .ev-card').length === evParticipants.size" },
  ll: { g: G('ll'), isIn: 'llParticipants.has(uid)', start: 'startLastLetterRound()', elim: 'llParticipants.delete(uid), llEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'llKeyword', n: 4,
    deep: 'llQueue.includes(uid)' },
  wai: { g: G('wai'), isIn: 'waiParticipants.has(uid)', start: 'startWAIRound()', elim: 'waiParticipants.delete(uid)', lobby: RESET, kwVar: 'waiKeyword', deep: 'waiAttempts.get(uid) === 0' },
  ig: { g: G('ig'), isIn: 'igParticipants.has(uid)', start: 'startIGRound()', elim: 'igParticipants.delete(uid)', lobby: RESET, kwVar: 'igKeyword' },
  rw: { g: G('rw'), isIn: 'rwParticipants.has(uid)', start: 'startRWRound()', elim: 'rwParticipants.delete(uid)', lobby: RESET, kwVar: 'rwKeyword' },
  pgs: { g: G('pgs'), isIn: 'pgsParticipants.has(uid)', start: 'startPGRound()', elim: 'pgsParticipants.delete(uid)', lobby: RESET, kwVar: 'pgsKeyword', play: ['900'], deep: 'pgsAttempts.get(uid) === 1' },
  lsc: { g: G('lsc'), isIn: 'lscParticipants.has(uid)', start: 'startLSCRound()', elim: 'lscParticipants.delete(uid)', lobby: RESET, kwVar: 'lscKeyword' },
  wr: { g: G('wr'), isIn: 'wrParticipants.has(uid)', start: 'startWRRound()', elim: 'wrParticipants.delete(uid)', lobby: RESET, kwVar: 'wrKeyword' },
  cs: { g: G('cs'), isIn: 'csParticipants.has(uid)', start: 'startCrownStealRound()', elim: 'csParticipants.delete(uid)', lobby: RESET, kwVar: 'csKeyword', play: ['اسرق'], deep: 'csStealAttempts.get(uid) === 1' },
  cw: { g: G('cw'), isIn: "cwActiveCountries.some(c => c.uid === uid)", start: 'startCountryWarRound()',
    elim: 'cwActiveCountries.splice(cwActiveCountries.findIndex(c => c.uid === uid), 1), cwEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'cwKeyword', n: 4,
    deep: 'cwAssignments.has(uid)' },
  draw: { g: G('draw'), kind: 'native', noKw: true, isIn: 'drawParticipants.has(uid)', start: 'startDrawRound()', lobby: RESET + ", (document.getElementById('gd-modal-yes') || { click() {} }).click()", n: 0 },
  findball: { g: G('findball'), drive: "findballGameStatus === 'guessing' && [...findballParticipants.values()].forEach((u) => findballProcessGuess(u, String(findballBallCup)))", isIn: 'findballParticipants.has(uid)', start: 'findballStartRoundClick()', elim: 'findballParticipants.delete(uid), findballEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'findballKeyword', staged: "findballGameStatus === 'finished-round' || findballGameStatus === 'hiding'", n: 4 },
  chairs: { g: G('chairs'), isIn: 'chairsParticipants.has(uid)', start: 'chairsStartRoundClick()', elim: 'chairsParticipants.delete(uid), chairsEliminatedHistory.add(uid)', lobby: RESET, kwVar: 'chairsKeyword', staged: "chairsGameStatus === 'finished-round'", n: 5,
    drive: "chairsGameStatus === 'claiming' && [...chairsParticipants.values()].forEach((u, i) => chairsProcessClaim(u, String(chairsActiveChairNumbers[i] || 0)))" },
  tug: { g: G('tug'), kind: 'native', heavy: 1, afterJoin: async () => { await say('tug_b0', 'ازرق'); await say('tug_b1', 'ازرق'); }, isIn: '!!tugTeamOf(uid)', start: 'startTugRound()',
    openBtn: "document.querySelector('#tug-frame').contentDocument.getElementById('eht-late')", openVia: "document.querySelector('#tug-frame').contentDocument.getElementById('eht-late').click()",
    lobby: 'tugApi().reset()', deep: "tugTeamOf(uid) === 'a'" },
  rlgl: { g: G('rlgl'), isIn: 'rlglParticipants.has(uid)', start: 'startRlglRound()', elim: "rlglEliminatePlayer(uid, 'red-light')", elimCheck: 'rlglEliminated.has(uid)', lobby: RESET, kwVar: 'rlglJoinKw',
    deep: "!!document.getElementById('rlgltoken-' + uid) && rlglLaneOf.has(uid) && rlglLaneCount === rlglParticipants.size && document.querySelectorAll('#rlgl-arena-track .rlgl-token').length === rlglParticipants.size" },
  tt10: { g: G('tt10'), kind: 'native', noKw: true, isIn: 'tt10Participants.has(uid)', start: 'tt10StartRound()', n: 2,
    lobby: "tt10EndRound('test'), tt10NextRound()" },
  glz: { g: G('glz'), isIn: 'glzAlive.has(uid)', start: 'glzStartFirstRound()', elim: 'glzAlive.delete(uid)', kwVar: 'glzJoinKeyword', n: 6,
    deep: "glzParticipants.has(uid) && document.getElementById('glz-alive-num').textContent == glzAlive.size" },
  battery: { g: G('battery'), kind: 'native', isIn: '__lateJoin.adapters.battery._in.has(uid)', start: 'void 0', n: 0, lobby: 'batteryNewRound()', kwVar: null,
    play: [], deep: 'batteryCharge > 0' },
  'volcanic-lands': { g: G('volcanic-lands'), kind: 'native', isIn: 'vlLateApi.players().has(uid)', start: 'vlStart()', n: 3, kwVal: 'بركان', live: 1,
    deep: 'vlLateApi.players().get(uid).joinedAtRound > 0' },
  cannon: { g: G('cannon'), kind: 'native', lateWhen: "cannonLateApi.frameState() === 'firing'", isIn: 'cannonParticipants.has(uid)', start: 'cannonStartRound()', n: 2, heavy: 1,
    deep: "(() => { const w = document.getElementById('cannon-w-frame').contentWindow; return w.HC.info().players >= 3; })()" },
  roulette3d: { g: { tag: 'roulette3d', launch: 'launchRoulette3d', inputs: { 'roulette3d-join-kw': 'دخول', 'roulette3d-reg': '0' } }, kwVal: 'دخول', heavy: 1, n: 3,
    isIn: "(() => { try { return document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.getState().players.some(p => p.id === uid); } catch (e) { return false; } })()",
    start: "document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.start()",
    queued: "__lateJoin.state('roulette3d').awaiting.has(uid) && document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.lateQueue().includes(uid)",
    lobby: "document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.newMatch()" },
};
// الإعدادات القصوى المسموحة بإعداد اللعبة نفسها (قواعد اللعب ما تتغيّر)
const CAPS = { cr: ['cr-maxracers', 30], mz: ['mz-maxplayers', 30], ev: ['ev-maxplayers', 40], rlgl: ['rlgl-max-players', 50], glz: ['glz-maxplayers', 40], 'volcanic-lands': ['volcanic-lands-maxplayers', 60], cannon: ['cannon-s-max', 100] };

async function runGame(page, tag) {
  const c = C[tag]; cur = tag;
  const g = c.g; g.inputs = Object.assign({}, g.inputs, CAPS[tag] ? { [CAPS[tag][0]]: String(CAPS[tag][1]) } : {});
  // «خمّن الموضوع» تمنع تكرار نفس الكلمة بنفس الجلسة (قاعدة اللعبة) — كلمة جديدة لكل دورة
  if (tag === 'gw') g.inputs['gw-inp-word'] = ['زرافة', 'فراولة', 'طائرة', 'برتقالة', 'سفينة', 'قلعة', 'حديقة'][runGame.n = (runGame.n || 0) + 1] || ('كلمة' + runGame.n);
  const err0 = page._errors.length;
  await page.evaluate(() => { try { goHome(); } catch (e) {} });
  await sleep(300);
  const l = await H.launch(page, g);
  if (l.err) check('تشغيل اللعبة', false, l.err);
  const pg0 = await page.evaluate(() => ({ page: document.querySelector('.page.active').id, st: [...document.querySelectorAll('.page.active .status-msg, .status-msg')].map((e) => e.textContent.trim()).filter(Boolean).slice(0, 3) }));
  if (!/^pg-(?!setup|home)/.test(pg0.page)) console.log('LAUNCH-DIAG [' + tag + '] ' + JSON.stringify(pg0));
  if (tag === 'roulette3d' || tag === 'cannon' || tag === 'bomb' || tag === 'tug') await waitFor(page, (t) => { const s = __lateJoin.adapters[t].phase(); return s === 'lobby'; }, tag, 60000);
  const kw = c.kwVal || (c.noKw ? 'مرحبا' : (g.kw || await page.evaluate((t) => __lateJoin.adapters[t].kw(), tag)));
  const isIn = (uid) => ev(page, c.isIn, 'tiktok:' + uid);
  // 1) لاعبون عاديون قبل الجولة
  const n = c.n != null ? c.n : 3, ids = [];
  for (let i = 0; i < n; i++) { ids.push(tag + '_a' + i); await say(tag + '_a' + i, kw); }
  await waitFor(page, ([e, ids]) => { const f = (0, eval)('(function(uid){return ' + e + '})'); return ids.every((u) => f('tiktok:' + u)); }, [c.isIn, ids], 8000);
  if (c.afterJoin) { await c.afterJoin(ids); await sleep(400); }
  // 2) بدء الجولة
  await ev(page, c.start);
  const live = await waitFor(page, (t) => { __lateJoin.tick(); return __lateJoin.state(t).open; }, tag, c.heavy ? 60000 : 15000);
  check('الجولة بدأت ونظام المتأخرين التقط بدايتها (سجل الجولة = اللاعبون الحاليون)', live, await lj(page, tag));
  if (!live) return;
  // 3) الزر: واحد فقط، داخل لوحة اللعبة النشطة، بجانب أزرارها، وبنفس فئة الأزرار المجاورة
  if (c.openVia) {
    // زر «لاعب متأخر» داخل اللعبة نفسها (بإطار مستقل) يفتح نافذة المنصة الموحّدة — بدون زر ثانٍ من الموقع
    const bb = await page.evaluate((e) => { let x = null; try { x = (0, eval)(e.btn); } catch (er) {} return { has: !!x, text: x && x.textContent, site: document.querySelectorAll('#lj-btn').length }; }, { btn: c.openBtn });
    check('زر «لاعب متأخر» موجود بلوحة اللعبة (واحد فقط، بدون زر مكرر من الموقع)', bb.has && /لاعب متأخر/.test(bb.text) && bb.site === 0, bb);
  } else {
    const b = await page.evaluate(() => { const all = document.querySelectorAll('#lj-btn'), x = all[0], p = document.querySelector('.page.active'); return { page: p && p.id, cur: __lateJoin.cur(), shows: (window.__shows || []).slice(-6), n: all.length, inPage: !!(x && p.contains(x)), cls: x && x.className, prev: x && x.previousElementSibling && x.previousElementSibling.className, text: x && x.innerText.replace(/\s+/g, ' ').trim() }; });
    check('زر «لاعب متأخر» واحد داخل لوحة اللعبة بجانب أزرارها', b.n === 1 && b.inPage && /لاعب متأخر/.test(b.text) && /lj-btn/.test(b.cls), b);

  }
  // 4) قبل التفعيل
  const st0 = await lj(page, tag);
  if (c.kind !== 'native') {
    await say(tag + '_early', kw); await sleep(700);
    check('قبل الضغط على الزر: كاتب الكلمة وسط الجولة لا يدخل (سلوك اللعبة الأصلي)', !(await isIn(tag + '_early')) && !st0.on, st0);
  }
  // 5) فتح النافذة
  if (c.openVia) await ev(page, c.openVia); else await page.evaluate(() => document.getElementById('lj-btn').click());
  await sleep(700);
  const m = await page.evaluate(() => { const mo = document.getElementById('lj-modal'); const r = mo.querySelector('.lj-card').getBoundingClientRect(); const cs = getComputedStyle(mo.querySelector('.lj-card'));
    return { vis: !mo.hidden && mo.classList.contains('lj-in'), title: mo.querySelector('#lj-title').textContent, text: mo.querySelector('.lj-text').textContent, kw: mo.querySelector('#lj-kw').textContent,
      status: mo.querySelector('#lj-status').dataset.s, toggle: mo.querySelector('#lj-toggle').textContent, w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor, bd: cs.borderTopColor, z: getComputedStyle(mo).zIndex }; });
  const kwShown = c.noKw ? true : (tag === 'tug' ? m.kw.includes(kw) : m.kw === kw);
  check('النافذة: العنوان والنص والكلمة الفعلية للعبة وحالة الاستقبال «مفعّل»', m.vis && m.title === 'لاعب متأخر' && m.text === 'فاتتك بداية الجولة؟ اكتب الكلمة المفتاحية في الشات وادخل المنافسة!' && kwShown && m.status === 'on' && /إيقاف/.test(m.toggle), m);
  check('النافذة مربعة متوسطة بلون #160F22 وحدود بنفسجية', Math.abs(m.w - m.h) <= 2 && m.w >= 300 && m.w <= 470 && /rgb\(22, 15, 34\)/.test(m.bg) && /183, 156, 255/.test(m.bd), { w: m.w, h: m.h, bg: m.bg, bd: m.bd });
  await page.evaluate(() => document.getElementById('lj-x').click()); await sleep(350);
  check('إغلاق النافذة لا يوقف الاستقبال', (await lj(page, tag)).on && await waitFor(page, () => document.getElementById('lj-modal').hidden, null, 3000));
  // 6) المتأخر يدخل
  let L1 = tag + '_late1';
  if (c.lateWhen) {
    // المدفع: الجولة تتناوب بين نافذة الأوامر (انضمام عادي باللعبة) والإطلاق؛ لو وصلت الرسالة لحظة رجوع
    // نافذة الأوامر يدخل كمنضم عادي (لا يُحسب متأخراً) — نعيد المحاولة بمشاهد جديد أثناء الإطلاق
    let ok = false, s1 = null;
    for (let k = 1; k <= 4 && !ok; k++) {
      L1 = tag + '_late1' + (k > 1 ? '_' + k : '');
      await waitFor(page, (e) => (0, eval)(e), c.lateWhen, 30000);
      await say(L1, kw);
      const inn = await waitFor(page, ([e, uid]) => (0, eval)('(function(uid){return ' + e + '})')(uid), [c.isIn, 'tiktok:' + L1], 40000);
      s1 = await lj(page, tag); ok = inn && s1.count >= 1;
    }
    check('متأخر كتب الكلمة وسط الجولة ← دخل كلاعب حقيقي', ok, s1);
  } else if (c.staged) {
    const safe0 = await ev(page, c.staged);
    await say(L1, kw); await sleep(700);
    const s1 = await lj(page, tag), in1 = await isIn(L1);
    if (!safe0) check('لعبة بمراحل: المتأخر ينتظر النقطة الآمنة (لا يدخل وسط مرحلة شغّالة)', !in1 && s1.pending === 1, s1);
    let ok = false;
    for (let t = 0; t < 120 && !ok; t++) { ok = await ev(page, c.isIn, 'tiktok:' + L1) === true; if (!ok && c.drive) await ev(page, c.drive); if (!ok) await sleep(750); }
    check('لعبة بمراحل: المتأخر دخل عند النقطة الآمنة التالية', ok, await lj(page, tag));
  } else {
    if (c.noKw) await say(L1, 'تخمين'); else await say(L1, kw);
    const ok = await waitFor(page, ([e, uid]) => (0, eval)('(function(uid){return ' + e + '})')(uid), [c.isIn, 'tiktok:' + L1], c.heavy ? 40000 : 6000);
    const s1 = await lj(page, tag);
    check('متأخر كتب الكلمة وسط الجولة ← دخل كلاعب حقيقي', ok && s1.count >= 1, s1);
  }
  for (const t of (c.play || [])) await say(L1, t);
  if (c.deep) { await sleep(c.play ? 700 : 200); check('المتأخر مدمج بمنطق اللعبة نفسها', await waitFor(page, ([e, uid]) => (0, eval)('(function(uid){return ' + e + '})')(uid) === true, [c.deep, 'tiktok:' + L1], 8000), await ev(page, c.deep, 'tiktok:' + L1)); }
  const nameIn = (await page.evaluate((uid) => { const s = __lateJoin.state(__lateJoin.cur()); return s.recent.join('|'); }, L1));
  await waitFor(page, () => { const n = document.getElementById('lj-notify'); return !!(n && n.classList.contains('lj-in')); }, null, 4000);
  const notif = await page.evaluate(() => { const n = document.getElementById('lj-notify'); return n && n.classList.contains('lj-in') ? n.innerText.replace(/\s+/g, ' ') : ''; });
  if (tag === 'draw') check('«خمن الرسمة»: لا إشعار عائم للمتأخر (اللعبة بلا toasts) — يظهر في نافذة اللاعب المتأخر فقط', !notif && !!nameIn, { notif, recent: nameIn });
  else check('إشعار «انضم لاعب جديد!» مع الاسم', /انضم (لاعب جديد|[٠-٩\d]+ لاعبين جدد)!/.test(notif) && (notif.includes(L1) || /لاعبين جدد/.test(notif)), { notif, recent: nameIn });
  // 7) تكرار + تغيير اسم
  const before = await lj(page, tag);
  for (let k = 0; k < 6; k++) await say(L1, kw);
  await say(L1, kw, 'اسم_جديد');
  await sleep(900);
  const after = await lj(page, tag);
  check('تكرار الكلمة ×7 (مع تغيير الاسم) لا يكرر المشاركة', after.count === before.count && after.seen === before.seen, { before, after });
  // 8) لاعب شارك ثم خرج/أُقصي بنفس الجولة لا يرجع
  if (c.elim && ids.length) {
    const victim = 'tiktok:' + ids[0];
    await ev(page, c.elim, victim); await sleep(200);
    for (let k = 0; k < 3; k++) await say(ids[0], kw);
    await sleep(900);
    const c0 = (await lj(page, tag)).count;
    const back = c.elimCheck ? !(await ev(page, c.elimCheck, victim)) : await isIn(ids[0]);
    check('لاعب أُقصي/خرج بهذه الجولة لا يعود بالكلمة (حتى بتكرارها)', !back && (await lj(page, tag)).count === c0, await lj(page, tag));
  }
  // 9) إيقاف الاستقبال فعلي ثم إعادة تشغيله
  await page.evaluate(() => { __lateJoin.open(); document.getElementById('lj-toggle').click(); }); await sleep(300);
  const off = await lj(page, tag);
  const L2 = tag + '_late2';
  if (c.lateWhen) await waitFor(page, (e) => (0, eval)(e), c.lateWhen, 30000);
  await say(L2, c.noKw ? 'تخمين' : kw); await sleep(800);
  check('بعد «إيقاف الاستقبال» لا يدخل أي متأخر', !off.on && !(await isIn(L2)), off);
  await page.evaluate(() => document.getElementById('lj-toggle').click()); await sleep(300);
  if (!c.staged) {
    await say(L2, c.noKw ? 'تخمين' : kw);
    // الروليت: الدخول الفعلي يكون عند بداية الجولة التالية داخل اللعبة — يكفي هنا أنه دخل طابورها الآمن
    const inExpr = c.queued ? '(' + c.isIn + ') || (' + c.queued + ')' : c.isIn;
    check('إعادة التشغيل: يدخل نفس الشخص (لم يُحتسب سابقاً)' + (c.queued ? ' (طابور الجولة التالية)' : ''), await waitFor(page, ([e, uid]) => (0, eval)('(function(uid){return ' + e + '})')(uid), [inExpr, 'tiktok:' + L2], c.heavy ? 40000 : 6000));
  }
  // 10) دفعة متأخرين متزامنة
  if (!c.staged && !c.heavy) {
    const B = 25, s0 = await lj(page, tag);
    await ctl({ cmd: 'burst', count: B, prefix: tag + '_burst', text: c.noKw ? 'تخمين' : kw, perMs: 4 });
    await sleep(2500);
    for (let k = 0; k < B; k += 5) await say(tag + '_burst' + k, c.noKw ? 'تخمين' : kw); // تكرار من نفس المشاركين
    await sleep(900);
    const s1 = await lj(page, tag);
    const inCount = await page.evaluate(([e, tag, B]) => { const f = (0, eval)('(function(uid){return ' + e + '})'); let n = 0; for (let k = 0; k < B; k++) if (f('tiktok:' + tag + '_burst' + k)) n++; return n; }, [c.isIn, tag, B]);
    check('دفعة ' + B + ' متأخر متزامنين: كل من دخل احتُسب مرة وحدة فقط', inCount > 0 && s1.count - s0.count === inCount, { inCount, added: s1.count - s0.count });
  }
  // 11) تغيير الكلمة المفتاحية أثناء الجولة: النافذة تتزامن والكلمة الجديدة هي اللي تُدخل
  if (c.kwVar && !c.staged) {
    await page.evaluate((v) => { (0, eval)(v + " = 'جديدة'"); __lateJoin.open(); }, c.kwVar); await sleep(700);
    const shown = await page.evaluate(() => document.getElementById('lj-kw').textContent);
    await say(tag + '_old', kw); await say(tag + '_new', 'جديدة'); await sleep(900);
    check('تغيير الكلمة: النافذة تعرض الجديدة فوراً، والقديمة لا تُدخل والجديدة تُدخل', shown.includes('جديدة') && !(await isIn(tag + '_old')) && await waitFor(page, ([e, uid]) => (0, eval)('(function(uid){return ' + e + '})')(uid), [c.isIn, 'tiktok:' + tag + '_new'], 20000), { shown });
    await page.evaluate(([v, kw]) => { (0, eval)(v + ' = ' + JSON.stringify(kw)); }, [c.kwVar, kw]);
  }
  await page.evaluate(() => __lateJoin.close());
  // 12) جولة جديدة = أهلية جديدة
  if (c.lobby) {
    const r0 = await lj(page, tag);
    page.once('dialog', (d) => d.accept().catch(() => {}));
    await ev(page, c.lobby); await sleep(900);
    const s = await lj(page, tag);
    check('جولة جديدة/ريست: السجل يتصفّر (عدّاد ٠ وأهلية جديدة)', s.count === 0 && (s.phase !== 'live' || s.round > r0.round), s);
  }
  // الخروج من اللعبة بزر الخروج الخاص بها (مثل الستريمر) — goHome وحده لا يوقف مؤقّتات بعض الألعاب
  const EXIT = { bomb: 'bomb3dGoHome()', tug: 'tugGoHome()', glz: 'glzQuit()', tt10: 'tt10Quit()', roulette3d: 'rr3dGoHome()', 'volcanic-lands': 'vlGoHome()' };
  if (EXIT[tag]) { await ev(page, EXIT[tag]); await sleep(300); }
  const errs = page._errors.slice(err0);
  check('بدون أخطاء JavaScript', errs.length === 0, errs.slice(0, 3));
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=1', init: 'window.CANNON_ENTRY_SECONDS=4; window.CANNON_TICK_MS=100;' });
  // سجل التنقّل (للتشخيص عند أي فشل)
  await page.evaluate(() => { window.__shows = []; const o = window.show; window.show = function (p) { window.__shows.push(p + '@' + (new Error().stack.split('\n')[2] || '').trim().slice(0, 80)); return o.apply(this, arguments); }; });
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  page.on('pageerror', (e) => console.log('PAGEERROR [' + cur + '] ' + String(e.stack || e.message).slice(0, 700)));
  await H.linkAccount(page, STREAMER);
  const tags = ONLY.length ? ONLY : Object.keys(C);
  const CYCLES = Number(process.env.CYCLES || 1);
  for (let cy = 1; cy <= CYCLES; cy++) {
    for (const tag of tags) {
      try { await runGame(page, tag); } catch (e) { cur = tag; check('الاختبار اكتمل بدون انهيار', false, e.message); }
      if (CYCLES > 1) results.filter((r) => r.game === tag && !r.cycle).forEach((r) => { r.cycle = cy; });
    }
    if (CYCLES > 1) { const c = results.filter((r) => r.cycle === cy); console.log('CYCLE ' + cy + ': ' + c.filter((r) => r.ok).length + '/' + c.length); }
  }
  const pass = results.filter((r) => r.ok).length;
  const byGame = {};
  results.forEach((r) => { byGame[r.game] = byGame[r.game] || [0, 0]; byGame[r.game][r.ok ? 0 : 1]++; });
  console.log('\nRESULT ' + pass + '/' + results.length + '  games=' + Object.keys(byGame).length);
  console.log(JSON.stringify(byGame));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
