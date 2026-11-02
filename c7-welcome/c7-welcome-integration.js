/* ==========================================================================
   EHSEMHA — ربط ترحيب c7gaming777 بالموقع (c7-welcome-integration.js)
   طبقة ربط فقط: التصميم (c7-welcome.css + c7-welcome.js) نسخة من ترحيب dh_mx بألوان بنفسجية أكثر ونصوص خاصة.
   الشرط: ربط بث تيك توك ناجح فعلاً (bridge connected) والحساب المربوط في الناقل هو c7gaming777 بالضبط — بغض
   النظر عن طريقة الربط (ضغط زر، ربط تلقائي بالخلفية عند فتح الصفحة، أو غيره)؛ أما رجوع الاتصال بعد انقطاع فلا يُعدّ ربطاً جديداً. عند كل ربط يظهر الترحيب مرتين فقط — غير متتاليتين: المرة الثانية بعد فاصل
   GAP_MS من انتهاء الأولى، وتُلغى لو انفكّ الربط أو تغيّر الحساب. لا سقف إجمالي (يتكرر كل ربط جديد).
   ========================================================================== */
(function (w) {
  'use strict';
  if (w.__C7_WELCOME_INTEGRATION__) return;
  w.__C7_WELCOME_INTEGRATION__ = 1;

  var GAP_MS = 20000;                    // الفاصل بين العرضين (غير متتاليين)
  var seq = 0, busy = false;

  function api() { return w.C7Welcome || null; }
  function norm(u) { return String(u || '').trim().replace(/^@/, '').toLowerCase(); }
  function warn() { try { if (w.console) console.warn.apply(console, ['[c7-welcome-integration]'].concat([].slice.call(arguments))); } catch (e) {} }
  function gap() { var n = Number(w.__C7_WELCOME_GAP); return n >= 0 ? n : GAP_MS; }

  /* لا عدّاد: كل محاولة مسموحة (المحاولات فريدة بمعرّف) */
  var store = { kind: 'none', reserve: function () { return Promise.resolve({ granted: true, count: 1 }); } };
  function configure() { var d = api(); if (!d || configure.done) return !!d; try { d.configure({ store: store }); configure.done = true; } catch (e) { warn(e); } return !!d; }

  function linkedNow(d) {
    try { var s = homeConnections.tiktok; return !!(s && norm(s.username) === norm(d.target) && homeConnState.tiktok && homeConnState.tiktok.state === 'connected'); } catch (e) { return false; }
  }
  function showOnce(d, uid, tag) {
    seq += 1;
    return Promise.resolve(d.onConnected({ uniqueId: uid, verified: true, attemptId: 'c7-' + tag + '-' + Date.now() + '-' + seq })).catch(function (e) { warn(e); });
  }

  w.c7WelcomeNoteIntent = function () { /* لم يعد شرط «ضغط ربط» مطلوباً — تُبقى الدالة لاستدعاءات الموقع القديمة */ };

  w.c7WelcomeOnState = function (state, wasReconnect) {
    if (state === 'connected' && !wasReconnect) w.c7WelcomeOnConnected('tiktok');
  };

  w.c7WelcomeOnConnected = function (platform) {
    if (platform !== 'tiktok') return;
    var d = api(); if (!d || busy) return;                                  // تسلسل واحد في آن (يمنع تكرار الحدث)
    var slot = null; try { slot = homeConnections.tiktok; } catch (e) {}
    var uid = norm(slot && slot.username);
    if (!uid || uid !== norm(d.target)) return;                             // أي حساب آخر: لا شيء
    configure();
    busy = true;
    showOnce(d, uid, 'a').then(function () {
      setTimeout(function () {                                              // المرة الثانية بعد فاصل (غير متتالية)
        if (!linkedNow(d)) { busy = false; return; }                        // انفكّ الربط/تغيّر الحساب: لا عرض ثانٍ
        showOnce(d, uid, 'b').then(function () { busy = false; }, function () { busy = false; });
      }, gap());
    }, function () { busy = false; });
  };

  configure();
  if (!configure.done) { try { w.addEventListener('load', configure, { once: true }); } catch (e) {} }
})(window);
