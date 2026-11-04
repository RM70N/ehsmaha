'use strict';
// إعادة المحاولة تتم من العملية الرئيسية (تتحقق من الشبكة ثم تحمّل الموقع).
document.getElementById('retry').addEventListener('click', () => {
  document.getElementById('hint').textContent = 'جارٍ المحاولة...';
  if (window.ehsmahaDesktop && window.ehsmahaDesktop.retry) window.ehsmahaDesktop.retry();
});
