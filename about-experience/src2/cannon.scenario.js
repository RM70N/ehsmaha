/* راوند توضيحي: المدفع البشري (مربع حي يتكرر داخل نفس الصفحة)
   المحرك (cannon-game-*) من index.html كما هو. المسافات والفائز يحسبها المحرك فعليًا، والسيناريو يرسل فقط أوامر الشات ودعمًا وهميًا. */
(function () {
  'use strict';
  PV.game = 'cannon';
  var SCALE = 1.5;
  var CFG = { entry: 2.2, shots: 1, wind: 0, maxAngle: 89, mult: 1, obs: true, pen: false, gift: true, auto: false, late: false, max: 30 };
  var host = window.__pvHost = {
    onReady: function () {}, onError: function (k) { PV.emit('error', String(k)); },
    onResult: function (r) { host.result = r; }, onRoundOver: function () {}, result: null
  };
  /* نسختان بالتناوب: لاعبان بأوامر زاوية وقوة مختلفة، والدعم والعائق على اللاعب الثاني */
  var VARIANTS = [
    { a: ['فيصل', '45 80'], b: ['مشاري', '50 90'] },
    { a: ['نواف', '55 70'], b: ['سلطان', '42 95'] }
  ];
  var cycleNo = 0, started = false;
  async function cycle(id) {
    var V = VARIANTS[cycleNo++ % VARIANTS.length], S = function (ms) { return PV.sleep(ms, id); }, HC = window.HC;
    host.result = null;
    try { HC.reset(); } catch (e) {}
    HC.configure(CFG); HC.show(); HC.begin([], CFG);
    PV.unveil();
    PV.emit('step', { i: 0 });
    await S(500);
    PV.emit('chat', { name: V.a[0], text: V.a[1], cmd: true }); PV.bubble(V.a[0], V.a[1]); window.ehsemhaChat(V.a[0], V.a[1]);
    await S(750);
    PV.emit('chat', { name: V.b[0], text: V.b[1], cmd: true }); PV.bubble(V.b[0], V.b[1]); window.ehsemhaChat(V.b[0], V.b[1]);
    var seen = {}, tries = 0;
    while (!host.result) {
      await S(80);
      var cur = window.__pv && window.__pv.cur(), st = HC.state();
      if (st === 'firing') {
        if (cur && !seen['s:' + cur.p.name]) { seen['s:' + cur.p.name] = 1; PV.emit('step', { i: 1 }); }
        if (cur && cur.p.name === V.b[0] && !cur.rest && !seen.sup && cur.t > 0.5) {
          seen.sup = 1;
          PV.emit('step', { i: 2 });
          PV.emit('gift', { from: 'مشاهد', gift: 'دونات' }); HC.gift('مشاهد', 'donut', 30, 1);
          await S(350);
          PV.emit('obstacle', { name: 'طيور' }); HC.key('Digit1');
        }
        if (cur && cur.rest && !seen['l:' + cur.p.name]) { seen['l:' + cur.p.name] = 1; PV.emit('landed', { name: cur.p.name, dist: cur.p.dist }); PV.emit('step', { i: 3 }); }
      }
      if (++tries > 3000) { PV.emit('error', 'timeout'); return; }
    }
    PV.emit('step', { i: 4 });
    PV.emit('result', { winner: host.result.winner.name, dist: host.result.winner.dist, results: host.result.results });
    await S(2300 * SCALE);
    PV.emit('done');
  }
  function startLoop(delay) {
    if (started) return; started = true;
    PV.run(async function (id) {
      PV.clock.scale(SCALE);
      await PV.sleep((delay || 0) * SCALE, id);
      while (true) { await cycle(id); await PV.veil(function (ms) { return PV.sleep(ms, id); }); }
    });
  }
  PV.onCmd(function (cmd, d) { if (cmd === 'start') startLoop(d && d.delay); });
  function waitReady() {
    PV.run(async function (id) {
      var tries = 0;
      while (!(window.HC && window.__pv && window.HC.info && window.HC.state() === 'idle')) { await PV.sleep(150, id); if (++tries > 300) { PV.emit('error', 'engine'); return; } }
      await PV.sleep(300, id);
      PV.emit('ready');
    });
  }
  if (document.readyState === 'complete') waitReady(); else window.addEventListener('load', waitReady);
})();
