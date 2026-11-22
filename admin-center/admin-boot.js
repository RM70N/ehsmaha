/* إقلاع لوحة الأدمن: تنتظر اتصال Firebase وحساباً مسجَّلاً من الصفحة الأم (الموقع)، ثم تبدأ التطبيق. */
(function (w) {
  'use strict';
  var A = w.AdminApp, D = w.EhsAdminData, tries = 0;
  function msg(t, d) { document.getElementById('main').innerHTML = '<div class="view"><div class="state"><svg class="ic" viewBox="0 0 24 24" width="36" height="36" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/></svg><h4>' + t + '</h4><p>' + d + '</p></div></div>'; }
  function tick() {
    var f = D.fb(); var u = f && f.auth && f.auth.currentUser;
    if (u && f.db) { A.start(); return; }
    if (++tries > 60) { msg('تعذّر التحقق من حسابك', 'افتح لوحة الأدمن من داخل موقع احسمها بعد تسجيل الدخول بحساب الأدمن.'); return; }
    if (tries === 1) msg('جارٍ التحقق من حسابك…', 'لحظات.');
    setTimeout(tick, 250);
  }
  tick();
})(window);
