/* راوند توضيحي: لعبة الدول (نسخة معاينة معزولة)
   المنطق المرسوم هنا مأخوذ من countrywar في index.html: رسم منشور القرعة، شبكة الدول، مؤثر الإقصاء.
   الأحداث والأسماء وهمية محلية، ولا شيء منها يتصل بالبث أو الحسابات. */
(function () {
  'use strict';
  PV.game = 'countrywar';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---- أدوات مشتركة منسوخة من تصميم شاشة الراوند ---- */
  var RD_HUES = [45, 300, 275, 330, 38, 285, 262, 320];
  function rdGrad(i) { var h = RD_HUES[((i % RD_HUES.length) + RD_HUES.length) % RD_HUES.length]; return 'linear-gradient(145deg,hsl(' + h + ' 72% 78%),hsl(' + (h + 18) + ' 58% 52%))'; }
  function rdAr(n) { return String(n); }
  function rdLetter(name) { var s = String(name == null ? '' : name).replace(/^@/, '').trim() || '؟'; var core = s.indexOf('ال') === 0 ? s.slice(2) : s; return core[0] || '؟'; }
  function rdHash(str) { var h = 0; str = String(str || ''); for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

  /* ---- معطيات وهمية محلية ---- */
  var FLAGS = window.PV_FLAGS || {};
  var BANK = [
    { name: 'السعودية', code: 'sa' }, { name: 'الكويت', code: 'kw' },
    { name: 'قطر', code: 'qa' }, { name: 'الامارات', code: 'ae' }
  ];
  function avatar(seed, hue) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(' + hue + ' 70% 62%)"/><stop offset="1" stop-color="hsl(' + (hue + 30) + ' 55% 34%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="25" r="11" fill="hsl(' + (hue + 10) + ' 40% 88%)"/><path d="M10 64c2-15 12-22 22-22s20 7 22 22z" fill="hsl(' + (hue + 10) + ' 40% 88%)"/></svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }
  var USERS = [
    { uniqueId: 'mishari', nickname: 'مشاري', avatar: avatar('m', 268) },
    { uniqueId: 'nawaf', nickname: 'نواف', avatar: avatar('n', 192) },
    { uniqueId: 'faisal', nickname: 'فيصل', avatar: avatar('f', 330) },
    { uniqueId: 'sultan', nickname: 'سلطان', avatar: avatar('s', 38) }
  ];
  /* ثلاث نسخ من الراوند بالتناوب: التعيين السري وترتيب الأدوار يتغيران، والإقصاء الذاتي ممكن (V2) */
  var VARIANTS = [
    { secret: { mishari: 'السعودية', nawaf: 'الكويت', faisal: 'الامارات', sultan: 'قطر' },
      turns: [{ turn: 'nawaf', pick: 'قطر' }, { turn: 'faisal', pick: 'الكويت' }, { turn: 'mishari', pick: 'الامارات' }] },
    { secret: { mishari: 'قطر', nawaf: 'السعودية', faisal: 'الكويت', sultan: 'الامارات' },
      turns: [{ turn: 'sultan', pick: 'السعودية' }, { turn: 'mishari', pick: 'الكويت' }, { turn: 'sultan', pick: 'قطر' }] },
    { secret: { mishari: 'الكويت', nawaf: 'الامارات', faisal: 'السعودية', sultan: 'قطر' },
      turns: [{ turn: 'faisal', pick: 'السعودية' }, { turn: 'nawaf', pick: 'قطر' }, { turn: 'mishari', pick: 'الامارات' }] }
  ];
  var SECRET, TURNS;
  var participants = new Map(), active = [], eliminated = new Set();
  USERS.forEach(function (u) { participants.set(u.uniqueId, u); });

  function flagImg(c) { return '<img class="cw-flag-img" src="' + (FLAGS[c.code] || '') + '" alt="">'; }
  function chipInner(user) {
    var letter = esc(rdLetter(user.nickname));
    return user.avatar ? '<img src="' + user.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">' : letter;
  }

  function updateHead() {
    $('cw-remain-num').textContent = rdAr(active.length);
    $('cw-round-num').textContent = rdAr(eliminated.size + 1);
  }
  function renderGrid() {
    var grid = $('cw-countries-grid'); grid.innerHTML = '';
    var all = active.map(function (c) { return c.name; }).concat(Array.from(eliminated));
    var idx = 0;
    BANK.filter(function (c) { return all.indexOf(c.name) >= 0; }).forEach(function (c) {
      var card = document.createElement('div');
      card.className = 'rd-ccard' + (eliminated.has(c.name) ? ' eliminated' : '');
      card.dataset.name = c.name;
      card.innerHTML = '<div class="rd-ccard-aim"></div><div class="rd-chip" style="background:' + rdGrad(idx) + '">' + flagImg(c) + '</div><div class="rd-cname">' + esc(c.name) + '</div>';
      idx++; grid.appendChild(card);
    });
    updateHead();
  }
  /* نفس drawCWWheel الأصلية */
  function drawWheel(rotationAngle) {
    var track = $('cw-lens-track'); var n = active.length;
    if (n === 0) { track.innerHTML = ''; return; }
    var slice = (2 * Math.PI) / n;
    var pos = rotationAngle === 0 ? 0 : (-rotationAngle / slice) - 0.5;
    var base = Math.floor(pos), frac = pos - base;
    if (track.dataset.base !== String(base) || track.dataset.count !== String(n)) {
      track.dataset.base = String(base); track.dataset.count = String(n);
      var html = '';
      for (var i = -1; i <= 2; i++) {
        var idx = (((base + i) % n) + n) % n, entry = active[idx], user = participants.get(entry.uid);
        html += '<div class="rd-lens-row"><div class="rd-lens-chip" style="background:' + rdGrad(idx) + '">' + chipInner(user) + '</div><div class="rd-lens-name">' + esc(user.nickname) + '</div></div>';
      }
      track.innerHTML = html;
    }
    track.style.transform = 'translateY(' + (-(frac + 1) * 30).toFixed(3) + 'cqw)';
    updateHead();
  }
  function spin(winnerIdx, dur) {
    return new Promise(function (resolve) {
      var n = active.length, slice = (2 * Math.PI) / n;
      var finalAngle = -(winnerIdx * slice + slice / 2) - 5 * 2 * Math.PI, start = performance.now();
      (function animate(now) {
        var t = Math.min((now - start) / dur, 1), eased = 1 - Math.pow(1 - t, 3);
        drawWheel(finalAngle * eased);
        if (t < 1) requestAnimationFrame(animate); else resolve();
      })(performance.now());
    });
  }
  /* مؤثر الإقصاء الأصلي (rdElimOverlay) بدون الصوت */
  function elimOverlay(user, sub) {
    var stage = $('cw-stage'), nickname = user.nickname, letter = esc(rdLetter(nickname)), grad = rdGrad(rdHash(nickname));
    var prev = stage.querySelector('.rd-ov'); if (prev) prev.remove();
    var sparks = '';
    for (var i = 0; i < 12; i++) sparks += '<div class="rd-spark" style="transform:rotate(' + (i * 30) + 'deg)"><i style="animation:rdSpark 2.2s cubic-bezier(.16,1,.3,1) ' + ((i % 4) * 0.03) + 's both"></i></div>';
    var hand = function (c) { return '<div class="rd-hand ' + c + '"><i class="p"></i><i class="f1"></i><i class="f2"></i><i class="f3"></i><i class="f4"></i><i class="th"></i></div>'; };
    var ov = document.createElement('div'); ov.className = 'rd-ov';
    ov.innerHTML = '<div class="rd-ov-card"><div class="rd-ov-stage"><div class="rd-shock"></div><div class="rd-shock2"></div><div class="rd-sparks">' + sparks + '</div><div class="rd-clapL">' + hand('gold') + '</div><div class="rd-clapR">' + hand('pink') + '</div><div class="rd-fly"><div class="rd-fly-av" style="background:' + grad + '"><img src="' + user.avatar + '" alt=""></div></div></div><div class="rd-ov-name">' + esc(nickname) + '</div><div class="rd-ov-out">خــرج</div><div class="rd-ov-sub">' + esc(sub) + '</div></div>';
    stage.appendChild(ov);
    setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 2250);
    var g = $('cw-countries-grid'); g.classList.remove('fx-shake'); void g.offsetWidth; g.classList.add('fx-shake');
  }
  function showWinner(user, country) {
    var c = BANK.filter(function (x) { return x.name === country; })[0];
    var el = document.createElement('div'); el.className = 'pv-win';
    el.innerHTML = '<div class="pv-win-card"><div class="pv-win-av"><img src="' + user.avatar + '" alt=""></div><div class="pv-win-k">الفائز</div><div class="pv-win-name">' + esc(user.nickname) + '</div><div class="pv-win-country">' + flagImg(c) + '<span>' + esc(country) + '</span></div><div class="pv-win-sub">آخر دولة بقيت في الحرب</div></div>';
    $('cw-stage').appendChild(el);
  }


  var cycleNo = 0;
  async function cycle(S) {
    var V = VARIANTS[cycleNo++ % VARIANTS.length]; SECRET = V.secret; TURNS = V.turns;
    /* إعادة ضبط كاملة داخل نفس الصفحة (بدون إعادة تحميل) */
    active = []; eliminated.clear();
    var stage = $('cw-stage');
    ['.pv-win', '.rd-ov'].forEach(function (q) { var e = stage.querySelector(q); if (e) e.remove(); });
    var tr = $('cw-lens-track'); tr.innerHTML = ''; delete tr.dataset.base; delete tr.dataset.count; tr.style.transform = '';
    $('cw-countries-grid').innerHTML = ''; $('cw-turn-banner').className = 'cw-turn-banner';
    var btn = $('btn-cw-spin'); btn.style.display = ''; btn.classList.remove('pv-press');
    stage.classList.add('pv-ready');
    var spinResult = $('cw-spin-result');
    spinResult.textContent = ''; spinResult.className = 'cw-spin-result';
    $('cw-remain-num').textContent = rdAr(USERS.length); $('cw-round-num').textContent = rdAr(1);
    PV.unveil();
    PV.emit('step', { i: 0 });
    await S(250);
    for (var k = 0; k < USERS.length; k++) { PV.emit('chat', { name: USERS[k].nickname, text: 'دخول', join: true }); await S(190); }
    await S(250);
    PV.emit('step', { i: 1 });
    active = USERS.map(function (u) { var name = SECRET[u.uniqueId]; return { name: name, code: BANK.filter(function (b) { return b.name === name; })[0].code, uid: u.uniqueId }; });
    renderGrid(); drawWheel(0);
    await S(900);
    btn.classList.add('pv-press'); await S(200); btn.style.display = 'none';
    for (var r = 0; r < TURNS.length; r++) {
      var T = TURNS[r], fast = r > 0;
      PV.emit('step', { i: 2 });
      $('cw-turn-banner').className = 'cw-turn-banner';
      var wIdx = active.findIndex(function (a) { return a.uid === T.turn; });
      await spin(wIdx, fast ? 1500 : 2200);
      var turnUser = participants.get(T.turn);
      $('cw-turn-name').textContent = turnUser.nickname; $('cw-turn-banner').className = 'cw-turn-banner show';
      await S(fast ? 450 : 650);
      PV.emit('step', { i: 3 });
      PV.emit('chat', { name: turnUser.nickname, text: T.pick, cmd: true });
      PV.bubble(turnUser.nickname, T.pick);
      var card = document.querySelector('.rd-ccard[data-name="' + T.pick + '"]'); if (card) card.classList.add('aim');
      await S(fast ? 650 : 850);
      PV.emit('step', { i: 4 });
      var ownerUid = active.filter(function (a) { return a.name === T.pick; })[0].uid, owner = participants.get(ownerUid);
      var self = ownerUid === T.turn;
      elimOverlay(owner, self ? (turnUser.nickname + ' أقصى نفسه') : ('أقصاها ' + turnUser.nickname + ' · ' + T.pick));
      active = active.filter(function (a) { return a.name !== T.pick; }); eliminated.add(T.pick);
      PV.emit('elim', { country: T.pick, owner: owner.nickname, by: turnUser.nickname, remaining: active.length });
      $('cw-turn-banner').className = 'cw-turn-banner';
      renderGrid();
      await S(fast ? 1150 : 1350);
      if (active.length > 1) { drawWheel(0); }
    }
    PV.emit('step', { i: 5 });
    var win = active[0], wu = participants.get(win.uid);
    showWinner(wu, win.name);
    PV.emit('result', { winner: wu.nickname, country: win.name });
    await S(2600);
    PV.emit('done');
  }
  var started = false;
  function startLoop(delay) {
    if (started) return; started = true;
    PV.run(async function (id) {
      var S = function (ms) { return PV.sleep(ms, id); };
      PV.clock.scale(1.15);
      await S((delay || 0) * 1.15);
      while (true) { await cycle(S); await PV.veil(S); }
    });
  }
  PV.onCmd(function (cmd, d) { if (cmd === 'start') startLoop(d && d.delay); });
  var go = function () { PV.emit('ready'); };
  if (document.fonts && document.fonts.ready) { Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 1200); })]).then(go); } else go();
})();
