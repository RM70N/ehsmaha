/* راوند توضيحي: الروليت الروسي (مربع حي يتكرر داخل نفس الصفحة)
   المشهد والكاميرا والشخصيات والمؤثرات من المحرك الأصلي roulette3d.html كما هي.
   المتغيّر: مصدر الأحداث (سيناريو محلي)، وجهة النتائج (adapter محلي عبر setAuthority)، وتقصير الانتظار للعرض فقط. */
(function () {
  'use strict';
  PV.game = 'roulette';
  var PLAYERS = [
    { id: 'pv:nawaf', name: 'نواف' },
    { id: 'pv:faisal', name: 'فيصل' },
    { id: 'pv:sultan', name: 'سلطان' }
  ];
  /* نسختان بالتناوب. القرار والنتيجة محليان للعرض فقط. ثلاثة لاعبين = إقصاءان قبل الفائز، وآخر جولة مواجهة أخيرة */
  var VARIANTS = [
    { 1: { pid: 'pv:faisal', say: '2' },                   /* لا تطلق: امتناع واحد ويبقى بالطاولة */
      2: { pid: 'pv:sultan', say: '1', hit: true },        /* أطلق: إقصاء بالمؤثر البنفسجي */
      3: { pid: 'pv:faisal', say: '1', hit: true } },      /* المواجهة الأخيرة: إقصاء، والفائز نواف */
    { 1: { pid: 'pv:sultan', say: '1', hit: false },       /* أطلق: نجاة (أطلق لا تعني الإقصاء دائماً) */
      2: { pid: 'pv:nawaf', say: '1', hit: true },
      3: { pid: 'pv:sultan', say: '2' } }                  /* المواجهة: امتناع، ثم تتكرر الجولة... */
  ];
  /* النسخة الثانية تحتاج ختاماً صريحاً: الجولة 3 امتناع، الجولة 4 أطلق وإقصاء، والفائز فيصل */
  VARIANTS[1][4] = { pid: 'pv:sultan', say: '1', hit: true };
  var STEP_BY_STATE = { JOINING: 0, SPINNING: 1, PLAYER_SELECTED: 1, WAITING_FOR_DECISION: 2, RESOLVING: 3, PLAYER_SAFE: 3, PLAYER_ELIMINATED: 3, FINAL_DUEL: 4, GAME_OVER: 5 };
  var SCALE = 2.9;
  function nameOf(id) { for (var i = 0; i < PLAYERS.length; i++) if (PLAYERS[i].id === id) return PLAYERS[i].name; return ''; }

  var R, cyc = null, token = 0, cycleNo = 0, started = false;
  function setup() {
    R = window.EhsemhaRoulette;
    R.streamMode(true);
    R.settings({ minP: 2, maxP: 6, regTime: 0, autoStart: false, demo: false, decTime: 12, passes: 2, earnPass: false, timeoutRule: 'pass', spinSpeed: 'fast', longElim: false, winReplay: false, shake: true, frame: 'auto' });
    R.setAuthority({
      pickPlayer: function (ids, ctx) { var r = cyc && cyc.rounds[ctx.round]; return Promise.resolve(r && ids.indexOf(r.pid) >= 0 ? r.pid : ids[0]); },
      resolveFire: function (ctx) { var r = cyc && cyc.rounds[ctx.round]; return Promise.resolve(!!(r && r.hit)); }
    });
    R.onEvent(function (ev) {
      if (!cyc) return;
      if (ev.type === 'state') {
        var to = ev.data.to, st = STEP_BY_STATE[to];
        if (st != null && st !== cyc.lastStep && !(st === 1 && cyc.lastStep >= 4 && to !== 'SPINNING')) { cyc.lastStep = st; PV.emit('step', { i: st }); }
        if (to === 'WAITING_FOR_DECISION') {
          var gs = R.getState(), pid = gs.pending && gs.pending.pid, rd = cyc.rounds[gs.round];
          if (pid && rd && !cyc.answered[gs.round]) {
            cyc.answered[gs.round] = 1; var my = cyc.id;
            PV.sleep(1100, my).then(function () {
              var nm = nameOf(pid);
              PV.emit('chat', { name: nm, text: rd.say, cmd: true });
              PV.bubble(nm, rd.say === '1' ? '1  أطلق' : '2  لا تطلق');
              R.chat(pid, nm, rd.say);
            }).catch(function () {});
          }
        }
      } else if (ev.type === 'eliminated') {
        PV.emit('elim', { name: ev.data.name, remaining: ev.data.remaining });
      } else if (ev.type === 'winner' && !cyc.finished) {
        cyc.finished = true; var my2 = cyc.id;
        PV.emit('result', { winner: ev.data.name });
        PV.sleep(2400 * SCALE, my2).then(function () { PV.emit('done'); return PV.veil(function (ms) { return PV.sleep(ms, my2); }); })
          .then(function () { return next(my2); }).catch(function () {});
      }
    });
  }
  async function until(fn, id, max) { var n = 0; while (!fn()) { await PV.sleep(80, id); if (++n > (max || 400)) return false; } return true; }
  async function next(id) {
    /* نفس اللاعبين: إعادة المباراة داخل الصفحة نفسها (بدون إعادة تحميل) */
    R.replay();
    await until(function () { return R.getState().state === 'JOINING'; }, id);
    await cycle(id, false);
  }
  async function cycle(id, first) {
    cyc = { id: id, rounds: VARIANTS[cycleNo++ % VARIANTS.length], lastStep: -1, answered: {}, finished: false };
    PV.emit('step', { i: 0 }); cyc.lastStep = 0;
    if (first) {
      for (var i = 0; i < PLAYERS.length; i++) { PV.emit('chat', { name: PLAYERS[i].name, text: 'دخول', join: true }); R.chat(PLAYERS[i].id, PLAYERS[i].name, 'دخول'); await PV.sleep(260, id); }
    }
    await PV.sleep(500, id);
    PV.unveil();
    R.start();
  }
  function startLoop(delay) {
    if (started) return; started = true;
    PV.run(async function (id) {
      PV.clock.scale(SCALE);
      await PV.sleep((delay || 0) * SCALE, id);
      await cycle(id, true);
    });
  }
  PV.onCmd(function (cmd, d) { if (cmd === 'start') startLoop(d && d.delay); });
  function waitReady() {
    PV.run(async function (id) {
      var ok = await until(function () { return window.EhsemhaRoulette && window.EhsemhaRoulette.getState().state === 'JOINING'; }, id, 400);
      if (!ok) { PV.emit('error', 'engine'); return; }
      setup(); PV.emit('ready');
    });
  }
  if (document.readyState === 'complete') waitReady(); else window.addEventListener('load', waitReady);
})();
