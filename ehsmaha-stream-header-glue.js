/* ============================================================================
   ربط هيدر الستريمر (ehsmaha-stream-header.css/.js — منسوخان حرفياً من ملف التصميم)
   بكل ألعاب الستريمر: شاشة الانتظار + داخل الراوند.

   - لا يغيّر شيئاً في تصميم الهيدر: يستدعي EhsmahaStreamerHeader.mount كما هو.
   - الأزرار لا تنفّذ منطقاً: كل زر يضغط الزر/الدالة الأصلية في اللعبة نفسها
     (فتبقى التأكيدات والصلاحيات كما هي). زر غير معرّف في لعبة = لا يُرسم.
   - الأزرار الأصلية المكرّرة تُخفى بالـCSS فقط (تبقى في الـDOM وتُضغط برمجياً).
   ========================================================================== */
(function () {
  'use strict';
  var H = window.EhsmahaStreamerHeader;
  if (!H || typeof H.mount !== 'function') return;

  /* ألعاب الستريمر (39): page id بدون البادئة pg- */
  var GAMES = ('cannon cr ev dash guessword sniper battery roulette timer bomb lastletter whoami reverseword priceguess ' +
    'crownsteal letterscramble countrywar box chairs findball wordrace draw tug rlgl maze tt10 glz volcanic-lands hz ig ' +
    'roulette3d xo ek almeezan wesh hq latatayeh harfnajat spaceodyssey').split(' ');

  /* ألعاب iframe: الزر الرئيسي = زر «خروج» في شريط الاستضافة */
  var EXIT_SEL = '.b3s-bar button, .rr3d-bar button, .xo-host-bar button, .ehsn-bar button';
  var IFRAME = { bomb: 1, tug: 1, roulette3d: 1, xo: 1, ek: 1, almeezan: 1, wesh: 1, hq: 1, latatayeh: 1, harfnajat: 1, spaceodyssey: 1, findball: 1 };

  /* ألعاب فيها نظام «لاعب متأخر» (زر #lj-btn يُنشأ داخل صفحتها من lateJoin) */
  var LATE = {};
  ['cannon', 'cr', 'ev', 'dash', 'guessword', 'sniper', 'battery', 'roulette', 'timer', 'lastletter', 'whoami', 'reverseword',
    'priceguess', 'crownsteal', 'letterscramble', 'countrywar', 'box', 'chairs', 'wordrace', 'draw', 'rlgl', 'maze', 'tt10',
    'glz', 'volcanic-lands', 'hz', 'ig', 'roulette3d'].forEach(function (k) { LATE[k] = 1; });

  var inst = {}; // id → { page, header, host, src:{} }

  function inHeader(el) { return !!(el.closest && el.closest('.ehsmaha-stream-header')); }
  function laidOut(el) { return !!(el.getClientRects && el.getClientRects().length); }
  /* أول عنصر مطابق خارج الهيدر (يفضّل الظاهر بالتخطيط) */
  function pick(page, sel) {
    var list = page.querySelectorAll(sel), first = null, i;
    for (i = 0; i < list.length; i++) {
      if (inHeader(list[i])) continue;
      if (!first) first = list[i];
      if (laidOut(list[i])) return list[i];
    }
    return first;
  }
  function byOnclick(page, sel, re) {
    var list = page.querySelectorAll(sel), i;
    for (i = 0; i < list.length; i++) if (!inHeader(list[i]) && re.test(list[i].getAttribute('onclick') || '')) return list[i];
    return null;
  }

  /* الزر الأصلي لكل إجراء داخل صفحة اللعبة (يُستدعى لحظة الضغط: ما يتغيّر بين الانتظار/الراوند يُلتقط) */
  var FIND = {
    home: function (page, id) {
      if (IFRAME[id]) return pick(page, EXIT_SEL);
      if (id === 'tt10' || id === 'glz') return pick(page, '.pcw-back');
      if (id === 'cannon') return pick(page, '#cannon-w-home, #cannon-w-bar-home');
      return pick(page, '.btn-home');
    },
    kick: function (page, id) {
      if (IFRAME[id] || id === 'tt10' || id === 'glz') return null;
      if (id === 'cannon') return pick(page, '#cannon-w-kick, #cannon-w-bar-kick');
      return pick(page, '.btn-kick, .hcw-kick');
    },
    reset: function (page, id) {
      if (IFRAME[id] || id === 'tt10' || id === 'glz') return null;
      if (id === 'cannon') return pick(page, '#cannon-w-reset, #cannon-w-bar-reset');
      if (id === 'volcanic-lands') return byOnclick(page, 'button', /vlRestart\s*\(/);
      return pick(page, '.btn-reset:not(.lj-btn)');
    }
  };

  function press(id, act) {
    var I = inst[id]; if (!I) return;
    var b = FIND[act](I.page, id);
    if (b) { b.click(); return; }
    if (act === 'home' && typeof window.goHome === 'function') { window.goHome(); return; }
    console.warn('[EhsmahaStreamerHeader] الزر الأصلي غير موجود:', id, act);
  }

  /* وسم الأزرار الأصلية التي صار الهيدر بديلاً عنها (تُخفى بالـCSS فقط) */
  function markSources(I) {
    ['home', 'kick', 'reset'].forEach(function (act) {
      if (!I.has[act]) return;
      var all = I.page.querySelectorAll(act === 'home' ? (IFRAME[I.id] ? EXIT_SEL : '.btn-home, .pcw-back, #cannon-w-home, #cannon-w-bar-home')
        : act === 'kick' ? '.btn-kick, .hcw-kick'
        : (I.id === 'volcanic-lands' ? 'button' : '.btn-reset:not(.lj-btn), #cannon-w-reset, #cannon-w-bar-reset')), i, el;
      for (i = 0; i < all.length; i++) {
        el = all[i];
        if (inHeader(el)) continue;
        if (act === 'reset' && I.id === 'volcanic-lands' && !/vlRestart\s*\(/.test(el.getAttribute('onclick') || '')) continue;
        if (!el.hasAttribute('data-ehsh-src')) el.setAttribute('data-ehsh-src', act);
      }
    });
    var lj = document.getElementById('lj-btn');
    if (lj && I.page.contains(lj) && !lj.hasAttribute('data-ehsh-src')) lj.setAttribute('data-ehsh-src', 'late');
  }

  function syncLate(I) {
    if (!I.has.late) return;
    var lj = document.getElementById('lj-btn');
    if (!lj || !I.page.contains(lj)) { I.header.setLate({ on: false, count: 0 }); return; }
    if (!lj.hasAttribute('data-ehsh-src')) lj.setAttribute('data-ehsh-src', 'late');
    var badge = lj.querySelector('.lj-badge'), n = parseInt((badge && badge.textContent || '').replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }), 10);
    var on = lj.getAttribute('data-on') === '1', cnt = isNaN(n) ? 0 : n, key = (on ? 1 : 0) + ':' + cnt;
    if (I.lateKey !== key) { I.lateKey = key; I.header.setLate({ on: on, count: cnt }); }
  }

  function mountFor(id) {
    if (inst[id]) return inst[id];
    var page = document.getElementById('pg-' + id);
    if (!page) return null;
    var I = { id: id, page: page, has: {}, lateKey: '' };
    ['home', 'kick', 'reset'].forEach(function (act) { I.has[act] = !!FIND[act](page, id); });
    I.has.late = !!LATE[id];
    if (!I.has.home && typeof window.goHome === 'function') I.has.home = true;
    var actions = {};
    ['home', 'kick', 'late', 'reset'].forEach(function (act) {
      if (!I.has[act]) return;
      actions[act] = act === 'late'
        ? function () { var b = document.getElementById('lj-btn'); if (b) b.click(); }
        : function () { press(id, act); };
    });
    var host = document.createElement('div');
    host.className = 'ehsh-host';
    page.insertBefore(host, page.firstChild);
    I.host = host;
    I.header = H.mount(host, { actions: actions });
    page.classList.add('ehsh-on');
    inst[id] = I;
    /* ارتفاع الهيدر الفعلي (يتغيّر مع العرض) → متغير CSS يحجز له مكاناً */
    var setH = function () { var h = I.header.el.getBoundingClientRect().height; if (h) page.style.setProperty('--ehsh-h', Math.round(h) + 'px'); };
    setH();
    if (typeof ResizeObserver === 'function') new ResizeObserver(setH).observe(I.header.el);
    else window.addEventListener('resize', setH);
    markSources(I); syncLate(I);
    return I;
  }

  var CSS =
    '.ehsh-host{position:fixed;top:0;left:0;right:0;z-index:60}' +
    /* مساحة محجوزة للهيدر أعلى الصفحة (بدون تغيير حشوة الصفحة) */
    '.page.ehsh-on::before{content:"";display:block;flex:none;height:var(--ehsh-h,84px)}' +
    /* الأزرار الأصلية المكرّرة تُخفى بصرياً فقط وتبقى تعمل برمجياً */
    '.page.ehsh-on [data-ehsh-src]{display:none!important}' +
    /* لوحة اللوقو العلوية القديمة مكرّرة مع علامة الهيدر (كبسولة تيك توك السفلية تبقى) */
    '.page.ehsh-on .rf-badge-logo{display:none!important}' +
    /* داخل الراوند: المسرح يبدأ تحت الهيدر، ولا شريط علوي مخفي مكرّر */
    '.page.ehsh-on.gs-live .gs-stage{padding-top:calc(var(--ehsh-h,84px) + clamp(12px,2vh,24px))!important}' +
    '.page.ehsh-on.gs-live .gs-hot,.page.ehsh-on.gs-live .gs-foot{display:none!important}' +
    /* المدفع: شريطه العلوي المنزلق ينزل تحت الهيدر */
    '#pg-cannon.ehsh-on .hcw-bar,#pg-cannon.ehsh-on .hcw-hot{top:var(--ehsh-h,84px)!important}' +
    /* ألعاب iframe: الإطار يبدأ تحت الهيدر، وشريط الاتصال (نقطة + اسم الحساب) ينزل تحته */
    '.page.ehsh-on>iframe{top:var(--ehsh-h,84px)!important;height:calc(100% - var(--ehsh-h,84px))!important}' +
    '.page.ehsh-on>.b3s-bar,.page.ehsh-on>.rr3d-bar,.page.ehsh-on>.xo-host-bar,.page.ehsh-on>.ehsn-bar{top:calc(var(--ehsh-h,84px) + 10px)!important}';

  /* اللوحات كانت تحجز أعلاها (78–110px) للوحة اللوقو المخفية؛ المكان صار للهيدر */
  function panelCss() {
    var a = [], b = [];
    GAMES.forEach(function (id) { a.push('#pg-' + id + '.ehsh-on .panel:not(.panel-right)'); b.push('#pg-' + id + '.ehsh-on .panel-right'); });
    return a.join(',') + ',' + b.join(',') + '{padding-top:clamp(14px,2.4vh,26px)!important}';
  }

  function injectCss() {
    if (document.getElementById('ehsmaha-stream-header-glue-css')) return;
    var s = document.createElement('style');
    s.id = 'ehsmaha-stream-header-glue-css';
    s.textContent = CSS + panelCss();
    document.head.appendChild(s);
  }

  function onActive(id) {
    var I = mountFor(id); if (!I) return;
    markSources(I); syncLate(I);
  }

  function boot() {
    injectCss();
    GAMES.forEach(function (id) {
      var page = document.getElementById('pg-' + id);
      if (!page) return;
      var check = function () { if (page.classList.contains('active')) onActive(id); };
      new MutationObserver(check).observe(page, { attributes: true, attributeFilter: ['class'] });
      check();
    });
    /* حالة «لاعب متأخر» (مفعّل؟ + العدّاد) تُنقل من الزر الأصلي كما هي */
    setInterval(function () {
      var p = document.querySelector('.page.active.ehsh-on'); if (!p) return;
      var id = p.id.replace(/^pg-/, ''), I = inst[id]; if (I) { markSources(I); syncLate(I); }
    }, 350);
  }

  window.EhsmahaStreamerHeaderGlue = { instances: inst, games: GAMES };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
