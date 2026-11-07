/* ==========================================================================
   EHSEMHA — جسر استوديو المالك (owner-studio-bridge.js)
   يعمل داخل الموقع (الصفحة الأم). يفتح تصميم «استوديو المالك» (owner-studio/index.html) في إطار iframe
   بملء الشاشة بدل نافذة لوحة المالك القديمة، ويُبقي «محرك» اللوحة القديمة (الدوال والحقول والقوائم المخفية)
   كما هو لأن كل منطق الحفظ والقراءة (Firestore/RTDB) موجود فيه — الاستوديو يقرأ منه ويستدعي دواله الأصلية.
   لا يغيّر أي دالة قائمة؛ يلفّ ownerOpenPanel/ownerClosePanel فقط.
   ========================================================================== */
(function (w) {
  'use strict';
  if (w.OwnerStudio) return;

  var SRC = '/owner-studio/index.html';
  var frame = null, isOpen = false, mo = null, tm = 0;
  var legacyOpen = w.ownerOpenPanel, legacyClose = w.ownerClosePanel;
  var TABS = ['users','streamers','games','stats','updates','moderators','frames','devspecial','feedback','messages','rounds','cwsessions','events','gifts','store','event100','ahsemha','scode','sevt'];

  function studio() { try { return frame && frame.contentWindow && frame.contentWindow.Studio; } catch (e) { return null; } }

  function notify() {
    clearTimeout(tm);
    tm = setTimeout(function () { var S = studio(); try { if (S && S.live && S.live.changed) S.live.changed(); } catch (e) {} }, 140);
  }

  function ensureFrame() {
    if (frame) return frame;
    frame = document.createElement('iframe');
    frame.id = 'owner-studio-frame';
    frame.title = 'استوديو المالك';
    frame.setAttribute('allow', 'clipboard-write');
    frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9980;background:#0B0B0F;display:none';
    frame.src = SRC;
    document.body.appendChild(frame);
    var legacy = document.getElementById('owner-modal-overlay');
    if (legacy && w.MutationObserver) {
      mo = new MutationObserver(notify);
      mo.observe(legacy, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'class'] });
    }
    return frame;
  }

  var OwnerStudio = w.OwnerStudio = {
    open: function () {
      ensureFrame();
      frame.style.display = 'block';
      document.documentElement.style.overflow = 'hidden';
      isOpen = true;
      document.body.classList.add('os-open');
      var S = studio(); try { if (S && S.live && S.live.opened) S.live.opened(); } catch (e) {}
    },
    close: function () {
      if (frame) frame.style.display = 'none';
      document.documentElement.style.overflow = '';
      isOpen = false;
      document.body.classList.remove('os-open');
      try { if (typeof legacyClose === 'function') legacyClose(); } catch (e) {}
    },
    isOpen: function () { return isOpen; },
    /** يشغّل مستمعات/تحميل القسم القديم المقابل (نفس ما كان يفعله النقر على تبويبه). */
    enter: function (id) { try { if (TABS.indexOf(id) >= 0 && typeof w.ownerSwitchTab === 'function') w.ownerSwitchTab(id); } catch (e) { console.warn('[owner-studio] enter', id, e); } notify(); },
    /** نص عنصر قديم (للقراءة فقط). */
    text: function (id) { var e = document.getElementById(id); return e ? (e.textContent || '').trim() : ''; },
    /** صفوف قائمة قديمة مبنية بـ .owner-row: [{name, subs[], badge, btns:[text]}]. */
    rows: function (listId) {
      var list = document.getElementById(listId); if (!list) return [];
      return Array.prototype.map.call(list.querySelectorAll('.owner-row'), function (r) {
        var n = r.querySelector('.owner-row-name'), subs = Array.prototype.map.call(r.querySelectorAll('.owner-row-sub'), function (x) { return (x.textContent || '').trim(); });
        var b = r.querySelector('.owner-plat-badge,.owner-row-badge');
        return { name: n ? (n.textContent || '').trim() : '', subs: subs, badge: b ? (b.textContent || '').trim() : '',
                 btns: Array.prototype.map.call(r.querySelectorAll('button'), function (x) { return (x.textContent || '').trim(); }) };
      });
    },
    /** يضغط زر صف قديم فعلياً (يشغّل الدالة الأصلية بلا أي تعديل). */
    press: function (listId, rowIdx, btnIdx) {
      var list = document.getElementById(listId); if (!list) return false;
      var r = list.querySelectorAll('.owner-row')[rowIdx]; if (!r) return false;
      var b = r.querySelectorAll('button')[btnIdx || 0]; if (!b) return false; b.click(); return true;
    },
    notify: notify
  };

  w.ownerOpenPanel = function () {
    if (typeof w.isOwnerAccount === 'function' && !w.isOwnerAccount()) return;
    try { if (typeof legacyOpen === 'function') legacyOpen(); } catch (e) { console.warn('[owner-studio] legacyOpen', e); }
    OwnerStudio.open();
  };
  w.ownerClosePanel = function () { OwnerStudio.close(); };
})(window);
