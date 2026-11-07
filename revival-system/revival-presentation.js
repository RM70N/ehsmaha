/* EHSEMHA — Revival Sequence | تحويل بيانات الإنعاش إلى DOM آمن (لا innerHTML لأي نص مستخدم) */
(function (g) {
  'use strict';
  var R = g.Revival = g.Revival || {};

  var TEMPLATE =
    '<div class="rv-dim"></div><div class="rv-edge"></div><div class="rv-flash"></div>' +
    '<svg class="rv-lines" viewBox="-960 -540 1920 1080" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' +
    '<div class="rv-stage" role="status" aria-live="polite">' +
      '<div class="rv-hero">' +
        '<img class="rv-rays" alt="" aria-hidden="true">' +
        '<div class="rv-halo"></div>' +
        '<div class="rv-disc"><img alt="" aria-hidden="true"></div>' +
        '<div class="rv-wave"></div><div class="rv-wave rv-wave2"></div>' +
        '<div class="rv-avatar"><img class="rv-fallback" alt=""><img class="rv-photo" alt=""></div>' +
      '</div>' +
      '<div class="rv-info">' +
        '<div class="rv-name-mask"><div class="rv-name" dir="auto"></div></div>' +
        '<div class="rv-rule"></div>' +
        '<div class="rv-title-wrap"><div class="rv-title"></div></div>' +
        '<div class="rv-via"></div>' +
        '<div class="rv-chip"><img class="rv-chip-img" alt=""><span class="rv-chip-k"></span><span class="rv-chip-v"></span></div>' +
      '</div>' +
    '</div>' +
    '<div class="rv-return"></div>';

  function safeUrl(u) {
    return typeof u === 'string' && /^(https?:\/\/|blob:|data:image\/)/i.test(u.trim()) ? u.trim() : '';
  }

  function fitName(el) {
    var fs = parseFloat(g.getComputedStyle(el).fontSize) || 40, n = 0;
    while (n++ < 10 && fs > 16 && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) {
      fs *= 0.9; el.style.fontSize = fs.toFixed(1) + 'px';
    }
  }

  /** يبني المشهد ويجهّز كل الطبقات مخفية. يعيد { root, refs, mount, fit, dispose } */
  function build(item, opts) {
    var cfg = R.Config, T = cfg.texts, mode = opts.mode;
    var root = document.createElement('div');
    root.className = 'rv-root rv-' + (mode === 'full' ? 'full' : mode === 'calm' ? 'calm' : 'lite') +
      (opts.container ? ' rv-contained' : '');
    root.setAttribute('data-state', 'preparing');
    root.innerHTML = TEMPLATE; // قالب ثابت

    var q = function (s) { return root.querySelector(s); };
    var alive = true;

    // النصوص — textContent فقط
    q('.rv-name').textContent = item.playerName;
    q('.rv-title').textContent = T.title;
    q('.rv-via').textContent = item.source === 'admin' ? T.viaAdmin : T.viaGift;

    // الهدية: لا نخترع اسماً ولا صورة
    var chip = q('.rv-chip'), chipImg = q('.rv-chip-img');
    if (item.source !== 'admin' && item.giftName) {
      q('.rv-chip-k').textContent = T.giftLabel + ':';
      q('.rv-chip-v').textContent = item.giftName;
      var gi = safeUrl(item.giftImage);
      if (gi) { chipImg.referrerPolicy = 'no-referrer'; chipImg.onerror = function () { chipImg.remove(); }; chipImg.src = gi; }
      else chipImg.remove();
    } else {
      chip.setAttribute('data-empty', '1');
    }

    // الأصول
    q('.rv-rays').src = cfg.assetBase + 'revival-energy.svg';
    q('.rv-disc img').src = cfg.assetBase + 'revival-frame.svg';
    q('.rv-fallback').src = cfg.assetBase + 'fallback-avatar.svg';

    // الأفاتار الحقيقي: يُحمّل أثناء التمهيد، ويظهر فوق الصورة الاحتياطية عند جاهزيته
    var photo = q('.rv-photo'), au = safeUrl(item.avatarUrl);
    if (au) {
      photo.referrerPolicy = 'no-referrer'; photo.decoding = 'async';
      photo.onload = function () { if (alive) photo.classList.add('rv-ok'); };
      photo.onerror = function () { photo.remove(); };
      photo.src = au;
    } else photo.remove();

    // الحلقات + خطوط الطاقة
    var hero = q('.rv-hero');
    var rings = R.Effects.ringsSvg();
    hero.appendChild(rings);
    var lines = [];
    if (mode !== 'calm') lines = R.Effects.buildLines(q('.rv-lines'), cfg.lines[mode === 'full' ? 'full' : 'lite'], opts.variant);

    var refs = {
      root: root, dim: q('.rv-dim'), edge: q('.rv-edge'), flash: q('.rv-flash'), stage: q('.rv-stage'),
      rays: q('.rv-rays'), halo: q('.rv-halo'), disc: q('.rv-disc'), discImg: q('.rv-disc img'),
      wave: q('.rv-wave:not(.rv-wave2)'), wave2: q('.rv-wave2'), avatar: q('.rv-avatar'), rings: rings,
      rOuter: rings.querySelector('.rv-r-outer'), rSeg: rings.querySelector('.rv-r-seg'),
      rGlow: rings.querySelector('.rv-r-glow'), rMid: rings.querySelector('.rv-r-mid'),
      rThick: rings.querySelector('.rv-r-thick'), rArc: rings.querySelector('.rv-r-arc'), rDark: rings.querySelector('.rv-r-dark'),
      name: q('.rv-name'), rule: q('.rv-rule'), titleWrap: q('.rv-title-wrap'), title: q('.rv-title'),
      via: q('.rv-via'), chip: chip, ret: q('.rv-return'), lines: lines
    };

    return {
      root: root, refs: refs,
      mount: function (parent) { parent.appendChild(root); },
      fit: function () { fitName(refs.name); }, // بعد الإدراج في DOM لقياس الاسم الطويل
      dispose: function () {
        alive = false;
        photo.onload = photo.onerror = null; chipImg.onerror = null;
        if (root.parentNode) root.parentNode.removeChild(root);
      }
    };
  }

  R.Presentation = { build: build, safeUrl: safeUrl };
})(window);
