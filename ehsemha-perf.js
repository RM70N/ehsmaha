/* ehsemha-perf.js - تحسين التنفيذ فقط، بدون أي تغيير بصري أو وظيفي.
 * PERF-01: إيقاف مؤقت (animation-play-state) لأنيميشن CSS اللانهائي الذي يعمل على الخيط الرئيسي
 *          (عناصر SVG، أو خصائص غير transform/opacity) عندما يكون عنصره خارج الشاشة تمامًا.
 *          يُستأنف من نفس النقطة عند الظهور (لا إعادة تشغيل). لا يمس أي أنيميشن ظاهر ولا JS ولا مؤقتات.
 */
(function () {
  'use strict';
  if (window.__ehsPerf || !('IntersectionObserver' in window) || !document.getAnimations) return;
  var CHEAP = { transform: 1, opacity: 1, translate: 1, rotate: 1, scale: 1, offset: 1, computedOffset: 1, easing: 1, composite: 1 };
  var seen = new WeakSet();
  var roots = new Set();
  var io = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i], t = e.target;
      if (e.isIntersecting) { if (t.hasAttribute('data-ehs-off')) t.removeAttribute('data-ehs-off'); }
      else if (!t.hasAttribute('data-ehs-off')) t.setAttribute('data-ehs-off', '');
    }
  }, { rootMargin: '120px' });

  function rootOf(el) {
    var svg = el.ownerSVGElement;
    if (svg) { while (svg.ownerSVGElement) svg = svg.ownerSVGElement; return svg; }
    return null;
  }
  function expensive(a) {
    try {
      if (a.effect.getComputedTiming().iterations !== Infinity) return false;
      var kfs = a.effect.getKeyframes();
      for (var i = 0; i < kfs.length; i++) for (var k in kfs[i]) if (!CHEAP[k]) return true;
    } catch (e) { return false; }
    return false;
  }
  function scan() {
    if (document.hidden) return;
    var anims;
    try { anims = document.getAnimations(); } catch (e) { return; }
    for (var i = 0; i < anims.length; i++) {
      var a = anims[i], el = a.effect && a.effect.target;
      if (!el || el.nodeType !== 1 || a.effect.pseudoElement) continue;
      var r = rootOf(el);
      // SVG: كل حركات الداخل تعمل على الخيط الرئيسي حتى لو كانت transform
      var host = r || (expensive(a) ? el : null);
      if (!host || seen.has(host)) continue;
      seen.add(host); roots.add(host); io.observe(host);
    }
  }
  var timer = 0;
  function later() { clearTimeout(timer); timer = setTimeout(scan, 350); }
  new MutationObserver(later).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('load', later);
  setInterval(scan, 5000);
  window.__ehsPerf = { scan: scan, roots: roots };
  later();
})();
