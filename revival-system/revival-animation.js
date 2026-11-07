/* EHSEMHA — Revival Sequence | الـ Timeline السينمائي الموحد (Web Animations API)
   الأزمنة مكتوبة على أساس 3000ms وتُقاس نسبياً على مدة التجميد الفعلية.
   المراحل: 0-450 Energy Awakening | 450-1000 Revival Core | 1000-1650 Player Reveal
            1650-2350 Revival Confirmed | 2350-3000 Return to Game */
(function (g) {
  'use strict';
  var R = g.Revival = g.Revival || {};

  var E = {
    out: 'cubic-bezier(.16,1,.3,1)',
    soft: 'cubic-bezier(.33,1,.68,1)',
    io: 'cubic-bezier(.65,0,.35,1)',
    inward: 'cubic-bezier(.4,0,.9,.6)',
    exit: 'cubic-bezier(.5,0,.75,0)'
  };

  var PHASES = [
    ['entering', 0], ['revealing', 1000], ['confirmed', 1650], ['exiting', 2350]
  ];

  function Timeline(total) {
    this.k = total / 3000; this.total = total; this.anims = [];
  }
  // fill: 'both' للدخول، 'forwards' للخروج (حتى لا يطغى على حالة الدخول قبل موعده)
  Timeline.prototype.add = function (el, frames, at, dur, ease, fill) {
    if (!el) return null;
    var a = el.animate(frames, {
      delay: Math.round(at * this.k), duration: Math.max(1, Math.round(dur * this.k)),
      easing: ease || E.out, fill: fill || 'both'
    });
    this.anims.push(a);
    return a;
  };
  Timeline.prototype.cancel = function () {
    this.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    this.anims.length = 0;
  };

  function fade(T, el, inAt, inDur, outAt, outDur, to) {
    T.add(el, [{ opacity: 0 }, { opacity: to == null ? 1 : to }], inAt, inDur, E.soft, 'both');
    T.add(el, [{ opacity: to == null ? 1 : to }, { opacity: 0 }], outAt, outDur, E.io, 'forwards');
  }

  /** نسخة هادئة: ظهور/اختفاء فقط، بدون حركة مكانية (prefers-reduced-motion) */
  function buildCalm(T, u) {
    fade(T, u.dim, 0, 450, 2500, 500);
    fade(T, u.avatar, 650, 500, 2400, 500);
    fade(T, u.rDark, 650, 500, 2400, 500);
    fade(T, u.rMid, 650, 500, 2400, 500, .8);
    fade(T, u.rGlow, 650, 500, 2400, 500, .5);
    fade(T, u.name, 1000, 450, 2400, 400);
    fade(T, u.rule, 1650, 300, 2350, 300);
    fade(T, u.titleWrap, 1700, 400, 2350, 400);
    fade(T, u.via, 1900, 350, 2350, 400);
    fade(T, u.chip, 2000, 350, 2350, 400);
  }

  function buildFull(T, u, o) {
    var full = o.mode === 'full', v = o.variant, dir = v % 2 ? -1 : 1;
    var xo = v === 1 ? 46 : v === 2 ? -46 : 0;

    // ---- 0-450: Energy Awakening ----
    fade(T, u.dim, 0, 450, 2500, 500);
    fade(T, u.edge, 0, 600, 2450, 550, .95);
    T.add(u.flash, [{ opacity: 0 }, { opacity: .55, offset: .4 }, { opacity: 0 }], 120, 380, E.out);

    var n = u.lines.length;
    u.lines.forEach(function (l, i) {
      var at = 30 + (i / n) * 320;
      T.add(l.streak, [
        { strokeDashoffset: .16, opacity: 0 },
        { opacity: 1, offset: .2 },
        { strokeDashoffset: -.86, opacity: 0 }
      ], at, 640, E.inward);
      T.add(l.trail, [{ opacity: 0 }, { opacity: .3, offset: .35 }, { opacity: 0 }], at, 900, E.soft);
    });

    // ---- 450-1000: Revival Core ----
    var d0 = 'rotateX(68deg) scale(.4)', d1 = 'rotateX(68deg) scale(1)';
    T.add(u.disc, [{ opacity: 0, transform: d0 }, { opacity: .95, transform: d1 }], 200, 800, E.out);
    T.add(u.disc, [{ opacity: .95, transform: d1 }, { opacity: 0, transform: 'rotateX(68deg) scale(.8)' }], 2400, 500, E.io, 'forwards');
    T.add(u.discImg, [{ transform: 'rotate(' + (-50 * dir) + 'deg)' }, { transform: 'rotate(0deg)' }], 200, 800, E.out);
    T.add(u.discImg, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (14 * dir) + 'deg)' }], 1000, 1350, E.out, 'forwards');

    T.add(u.rOuter, [{ opacity: 1, strokeDashoffset: 1 }, { opacity: 1, strokeDashoffset: 0 }], 350, 650, E.out);
    T.add(u.rSeg, [{ opacity: 0, transform: 'rotate(' + (-40 * dir) + 'deg)' }, { opacity: 1, transform: 'rotate(0deg)' }], 400, 700, E.out);
    T.add(u.rSeg, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (18 * dir) + 'deg)' }], 1100, 1250, E.out, 'forwards');
    T.add(u.rThick, [{ opacity: 0, transform: 'rotate(' + (30 * dir) + 'deg) scale(.92)' }, { opacity: 1, transform: 'rotate(0deg) scale(1)' }], 450, 650, E.out);
    T.add(u.rGlow, [{ opacity: 0 }, { opacity: .55 }], 600, 500, E.soft);
    T.add(u.rMid, [{ opacity: 0 }, { opacity: .6 }], 600, 500, E.soft);

    T.add(u.halo, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: .9, transform: 'scale(1)' }], 450, 650, E.out);
    T.add(u.halo, [{ opacity: .9 }, { opacity: 1, offset: .4 }, { opacity: .7 }], 1000, 650, E.soft, 'forwards');
    T.add(u.halo, [{ opacity: .7 }, { opacity: 0 }], 2400, 500, E.io, 'forwards');
    if (full) {
      T.add(u.rays, [{ opacity: 0, transform: 'rotate(0deg)' }, { opacity: .5, transform: 'rotate(' + (8 * dir) + 'deg)', offset: .3 }, { opacity: .5, transform: 'rotate(' + (24 * dir) + 'deg)' }], 800, 1600, E.soft);
      T.add(u.rays, [{ opacity: .5 }, { opacity: 0 }], 2300, 500, E.io, 'forwards');
    }

    // ---- 650-1650: الأفاتار يتقدم من العمق (بدون ارتداد) ----
    var a0 = { opacity: 0, transform: 'translate3d(' + xo + 'px,0,-280px) scale(.55)' };
    var a1 = { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' };
    if (full) { a0.filter = 'blur(14px) brightness(.6)'; a1.filter = 'blur(0px) brightness(1)'; }
    T.add(u.avatar, [a0, a1], 650, 1000, E.out);
    T.add(u.avatar, [{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }, { opacity: 0, transform: 'translate3d(0,0,-120px) scale(.94)' }], 2350, 550, E.io, 'forwards');
    T.add(u.rDark, [{ opacity: 0 }, { opacity: 1 }], 850, 500, E.soft);
    // إضاءة الحلقة عند الاستقرار + شريط الطاقة يدور جزئياً حول الحواف
    T.add(u.rMid, [{ opacity: .6 }, { opacity: 1, offset: .5 }, { opacity: .85 }], 1000, 600, E.soft, 'forwards');
    T.add(u.rGlow, [{ opacity: .55 }, { opacity: .95, offset: .5 }, { opacity: .6 }], 1000, 600, E.soft, 'forwards');
    T.add(u.rArc, [{ opacity: 0, transform: 'rotate(0deg)' }, { opacity: 1, transform: 'rotate(' + (140 * dir) + 'deg)', offset: .25 }, { opacity: .45, transform: 'rotate(' + (330 * dir) + 'deg)' }], 1000, 800, E.io);
    // خروج كل الحلقات معاً
    T.add(u.rings, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.86)' }], 2400, 500, E.io, 'forwards');

    // ---- 1000-1650: Player Reveal — الاسم + REVIVAL ENERGY WAVE ----
    var n0 = { opacity: 0, transform: 'translateY(110%)' }, n1 = { opacity: 1, transform: 'translateY(0)' };
    if (full) { n0.filter = 'blur(4px)'; n1.filter = 'blur(0px)'; }
    T.add(u.name, [n0, n1], 1050, 450, E.out);
    T.add(u.name, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-60%)' }], 2400, 300, E.io, 'forwards');
    T.add(u.wave, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: .85, transform: 'scale(1)', offset: .18 }, { opacity: 0, transform: 'scale(3.2)' }], 1000, 650, E.soft);
    T.add(u.wave2, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: .8, transform: 'scale(.9)', offset: .15 }, { opacity: 0, transform: 'scale(2.6)' }], 1120, 780, E.soft);

    // ---- 1650-2350: Revival Confirmed ----
    T.add(u.rule, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 1, transform: 'scaleX(1)' }], 1650, 300, E.out);
    T.add(u.rule, [{ opacity: 1, transform: 'scaleX(1)' }, { opacity: 0, transform: 'scaleX(0)' }], 2350, 300, E.io, 'forwards');
    T.add(u.titleWrap, [
      { opacity: 0, clipPath: 'inset(0 50% 0 50%)', transform: 'scale(1.1)' },
      { opacity: 1, clipPath: 'inset(0 0% 0 0%)', transform: 'scale(1)' }
    ], 1700, 400, E.out);
    T.add(u.titleWrap, [{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }, { opacity: 0, clipPath: 'inset(0 50% 0 50%)' }], 2350, 300, E.io, 'forwards');
    T.add(u.title, [{ backgroundPosition: '100% 0' }, { backgroundPosition: '0% 0' }], 1950, 400, E.io);
    T.add(u.stage, [{ transform: 'scale(1)' }, { transform: 'scale(1.025)', offset: .35 }, { transform: 'scale(1)' }], 1700, 500, E.out);
    T.add(u.via, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], 1900, 350, E.out);
    T.add(u.via, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-8px)' }], 2380, 270, E.io, 'forwards');
    T.add(u.chip, [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }], 2000, 350, E.out);
    T.add(u.chip, [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-8px) scale(.98)' }], 2400, 300, E.io, 'forwards');

    // ---- 2350-3000: Return to Game — موجة عودة نحو منطقة اللعب ----
    T.add(u.ret, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: .55, offset: .25 }, { opacity: 0, transform: 'scale(5)' }], 2450, 550, E.out, 'both');
  }

  /**
   * يبني ويشغّل التسلسل. يعيد { cancel, phaseAt } — الـ Controller يملك المؤقتات والحالات.
   * ui: ناتج Presentation.build، o: { mode, variant, total }
   */
  function play(ui, o) {
    var T = new Timeline(o.total);
    var u = ui.refs;
    if (o.mode === 'calm') buildCalm(T, u); else buildFull(T, u, o);
    return {
      cancel: function () { T.cancel(); },
      phases: PHASES.map(function (p) { return { name: p[0], at: Math.round(p[1] * T.k) }; })
    };
  }

  R.Animation = { play: play, E: E };
})(window);
