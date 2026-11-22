/* EHSMAHA — جسر لوحة الأدمن (يعمل داخل الموقع الرئيسي).
 * يُظهر زر «لوحة الأدمن» للحساب الذي يملك سجل أدمن نشطاً وصلاحية فتح اللوحة (يُقرأ سجله هو فقط من Firestore)،
 * ويفتح /admin-center/ في إطار بملء الشاشة. الإظهار تجميلي فقط: كل بيانات اللوحة وإجراءاتها محمية بالقواعد على الخادم.
 * لا يغيّر أي دالة قائمة. */
(function (w) {
  'use strict';
  if (w.AdminCenter) return;
  var SRC = '/admin-center/index.html', frame = null, fab = null, rec = null, isOpen = false, unsub = null, checkedUid = null;
  function fb() { return w.__fb; }
  function active(r) { return !!(r && r.status === 'active' && r.permissions && r.permissions.admin_dashboard_view === true); }
  function css() {
    if (document.getElementById('admin-fab-css')) return;
    var s = document.createElement('style'); s.id = 'admin-fab-css';
    s.textContent = '.admin-fab{flex-shrink:0;width:40px;height:40px;border:0;cursor:pointer;display:none;align-items:center;justify-content:center;color:#F8F6FF;background:linear-gradient(135deg,#8B3DFF,#4C1D95);box-shadow:0 6px 18px rgba(0,0,0,.5);clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));transition:transform .2s}' +
      '.admin-fab:hover{transform:scale(1.08)}.admin-fab.visible{display:flex}.admin-fab svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '@media(max-width:640px){.admin-fab{width:34px;height:34px}}';
    document.head.appendChild(s);
  }
  function ensureFab() {
    if (fab && fab.isConnected) return fab; css();
    fab = document.createElement('button'); fab.type = 'button'; fab.id = 'admin-fab'; fab.className = 'admin-fab'; fab.title = 'لوحة الأدمن'; fab.setAttribute('aria-label', 'لوحة الأدمن');
    fab.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>';
    fab.addEventListener('click', function () { AdminCenter.open(); });
    var c = document.getElementById('bottom-right-cluster'); (c || document.body).appendChild(fab); return fab;
  }
  function show(on) { ensureFab().classList.toggle('visible', !!on); }
  function check(user) {
    var f = fb(); if (!f || !f.db || !user) { rec = null; show(false); checkedUid = null; return Promise.resolve(false); }
    checkedUid = user.uid;
    return f.getDoc(f.doc(f.db, 'adminAccess', user.uid)).then(function (s) { rec = s.exists() ? s.data() : null; var ok = active(rec); if (checkedUid === user.uid) show(ok); return ok; }, function () { rec = null; show(false); return false; });
  }
  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe'); frame.id = 'admin-center-frame'; frame.title = 'لوحة الأدمن — احسمها'; frame.setAttribute('allow', 'clipboard-write');
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9981;background:#090711;display:none'; frame.src = SRC; document.body.appendChild(frame); return frame;
  }
  /* اشتراك لحظي على سجل الأدمن أثناء فتح اللوحة: أي سحب/إيقاف يُغلق اللوحة فوراً (والخادم يرفض الطلبات أصلاً). */
  function watch() {
    var f = fb(); var u = f && f.auth && f.auth.currentUser; if (!f || !u || unsub) return;
    try { unsub = f.onSnapshot(f.doc(f.db, 'adminAccess', u.uid), function (s) { rec = s.exists() ? s.data() : null; try { var fr = frame && frame.contentWindow; if (fr && fr.AdminApp && fr.AdminApp.accessChanged) fr.AdminApp.accessChanged(rec); } catch (e) {} if (!active(rec)) { show(false); AdminCenter.close(); } }, function () {}); } catch (e) { unsub = null; }
  }
  var AdminCenter = w.AdminCenter = {
    open: function () {
      var f = fb(); var u = f && f.auth && f.auth.currentUser; if (!u) return;
      check(u).then(function (ok) {
        if (!ok) return;
        ensureFrame().style.display = 'block'; document.documentElement.style.overflow = 'hidden'; isOpen = true; watch();
      });
    },
    close: function () { if (frame) frame.style.display = 'none'; document.documentElement.style.overflow = ''; isOpen = false; if (unsub) { try { unsub(); } catch (e) {} unsub = null; } },
    isOpen: function () { return isOpen; }, record: function () { return rec; }, _check: check
  };
  w.addEventListener('message', function (e) { if (e.origin === location.origin && e.data && e.data.ehsAdmin === 'close') AdminCenter.close(); });
  function boot() { var f = fb(); if (!f || !f.onAuthStateChanged) return; f.onAuthStateChanged(f.auth, function (u) { if (!u) { rec = null; show(false); AdminCenter.close(); if (frame) { frame.remove(); frame = null; } checkedUid = null; return; } check(u); }); }
  if (w.__fb) boot(); else w.addEventListener('fb-ready', boot);
})(window);
