/* EHSEMHA — Revival Sequence | الإعدادات المركزية */
(function (g) {
  'use strict';
  var R = g.Revival = g.Revival || {};
  var s = document.currentScript;
  var base = (s && s.src) ? s.src.replace(/[^\/]*(\?.*)?$/, '') : '';

  R.Config = {
    // مدة المشهد الكاملة — تطابق تجميد الجولة الأصلي (3000ms). تُستبدل بقيمة الحدث إن وُجدت.
    durationMs: 3000,
    minDurationMs: 1200,
    maxDurationMs: 6000,
    // auto | full | lite | calm
    performance: 'auto',
    // أقصى عدد أحداث في الانتظار (لا يضيع إنعاش، ولا يطول الطابور بلا حد)
    maxQueue: 8,
    // تجاهل نفس الحدث لو تكرر خلال هذه المدة
    dedupeWindowMs: 1200,
    assetBase: base + 'assets/',
    colors: {
      bg: '#07040D', deep: '#170B2D', royal: '#5B21B6',
      violet: '#7C3AED', glow: '#A78BFA', text: '#F8F7FC'
    },
    texts: {
      title: 'تم إنعاش اللاعب',
      viaGift: 'عن طريق هدية تيك توك',
      viaAdmin: 'عن طريق الإدارة',
      giftLabel: 'الهدية'
    },
    lines: { full: 18, lite: 8 }
  };
})(window);
