/* EHSEMHA — Revival Sequence | المؤثرات: خطوط الطاقة، حلقات الأفاتار، اختيار مستوى الأداء */
(function (g) {
  'use strict';
  var R = g.Revival = g.Revival || {};
  var NS = 'http://www.w3.org/2000/svg';

  // مولّد أرقام حتمي: نفس الإنعاش المتكرر يعطي اختلافاً مدروساً لا عشوائية كاملة
  function seeded(seed) {
    var s = (seed * 9301 + 49297) % 233280;
    return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  }

  // حلقات الأفاتار (viewBox 200 — الصورة تشغل نصف قطر ≈ 64.5)
  var RINGS =
    '<circle class="rv-r-dark" cx="100" cy="100" r="67.5" stroke="#07040D" stroke-width="6"/>' +
    '<circle class="rv-r-glow" cx="100" cy="100" r="71.5" stroke="#7C3AED" stroke-opacity=".45" stroke-width="7"/>' +
    '<circle class="rv-r-mid" cx="100" cy="100" r="71.5" stroke="#C4B5FD" stroke-width="1.6"/>' +
    '<circle class="rv-r-thick" cx="100" cy="100" r="78" pathLength="1" stroke="#7C3AED" stroke-width="4.5" stroke-dasharray=".2 .05"/>' +
    '<circle class="rv-r-arc" cx="100" cy="100" r="84" pathLength="1" stroke="#EDE9FE" stroke-width="2.4" stroke-linecap="round" stroke-dasharray=".16 .84"/>' +
    '<circle class="rv-r-outer" cx="100" cy="100" r="91" pathLength="1" stroke="#A78BFA" stroke-width="1" stroke-dasharray="1 1"/>' +
    '<circle class="rv-r-seg" cx="100" cy="100" r="96" pathLength="120" stroke="#A78BFA" stroke-opacity=".85" stroke-width="3" stroke-dasharray="1.5 4.5"/>';

  function ringsSvg() {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'rv-rings');
    svg.setAttribute('viewBox', '0 0 200 200');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = RINGS; // نص ثابت داخلي بدون أي بيانات مستخدم
    return svg;
  }

  // خطوط الطاقة: تتجه من أطراف المشهد نحو منصة الإنعاش
  function buildLines(svg, count, variant) {
    var rnd = seeded(7 + variant * 13);
    var off = variant * 0.37;
    var out = [];
    for (var i = 0; i < count; i++) {
      var a = off + (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
      var r0 = 1250, r1 = 190 + rnd() * 50;
      var x1 = Math.cos(a) * r0, y1 = Math.sin(a) * r0 * 0.62;
      var x2 = Math.cos(a) * r1, y2 = Math.sin(a) * r1 * 0.62;
      var trail = document.createElementNS(NS, 'line');
      var streak = document.createElementNS(NS, 'line');
      [trail, streak].forEach(function (l) {
        l.setAttribute('x1', x1.toFixed(1)); l.setAttribute('y1', y1.toFixed(1));
        l.setAttribute('x2', x2.toFixed(1)); l.setAttribute('y2', y2.toFixed(1));
        l.setAttribute('pathLength', '1');
      });
      trail.setAttribute('stroke', '#7C3AED'); trail.setAttribute('stroke-width', '1.2');
      streak.setAttribute('stroke', '#C4B5FD'); streak.setAttribute('stroke-width', '3');
      streak.setAttribute('stroke-dasharray', '0.16 1.2');
      svg.appendChild(trail); svg.appendChild(streak);
      out.push({ trail: trail, streak: streak });
    }
    return out;
  }

  function pickMode(cfg) {
    var reduce = false;
    try { reduce = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    if (reduce) return 'calm';
    var p = cfg.performance;
    if (p === 'full' || p === 'lite' || p === 'calm') return p;
    var cores = navigator.hardwareConcurrency || 8;
    var mem = navigator.deviceMemory || 8;
    return (cores <= 4 || mem <= 2) ? 'lite' : 'full';
  }

  R.Effects = { ringsSvg: ringsSvg, buildLines: buildLines, pickMode: pickMode };
})(window);
