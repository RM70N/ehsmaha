/* ==========================================================================
   EHSEMHA — ربط ترحيب dh_mx بالموقع (dhmx-welcome-integration.js)
   طبقة ربط فقط: لا تبني أي عنصر من التصميم ولا تغيّر منطق البث. التصميم نفسه (dhmx-welcome.css +
   dhmx-welcome.js) نسخة حرفية من الملف المرسل، وهذا الملف يستدعي واجهته الأصلية DhmxWelcome.onConnected.

   ما يفعله هذا الملف فقط:
     1) يستقبل إشارتين من index.html (إضافة صغيرة بثلاث نقاط):
          dhmxWelcomeNoteIntent()      ← ضغط المستخدم «ربط/ابدأ بثاً سريعاً/إعادة الربط» (نية ربط حقيقية)
          dhmxWelcomeOnState(state, wasReconnect) ← homeConnSetState: تحوّل حالة تيك توك إلى «connected» فعلاً
                                           (bridge_status:connected من السيرفر)، وليس إعادة اتصال بعد انقطاع؛
                                           وإلى failed/disabled فتُلغى نية الربط.
     2) يقرأ هوية الحساب المربوط فعلاً من اتصال الناقل (homeConnections.tiktok.username — اليوزر الذي فتح
        السيرفر غرفته)، ويطابقه مع DhmxWelcome.target. لا يقرأ أي حقل نصي ولا اسم عرض.
     3) يمرّر المحاولة للتصميم الأصلي (الذي يتحقق من الحساب ويحجز العدّاد ويشغّل العرض 4000ms ويغلقه).
     4) يوفّر مخزن العدّاد: Firestore (dhmxWelcome/{u_dh_mx}) بمعاملة ذرّية — عبر كل الأجهزة والنوافذ —
        وعند تعذّره (غير مسجّل دخول/القواعد غير منشورة/شبكة) يرجع لمخزن الجهاز (localStorage) بدل ألّا يعمل.
   لا مؤقتات ولا مستمعين دائمين: كل شيء يُنفَّذ عند حدث الربط فقط.
   ========================================================================== */
(function (w) {
  'use strict';
  if (w.__DHMX_WELCOME_INTEGRATION__) return;
  w.__DHMX_WELCOME_INTEGRATION__ = 1;

  var INTENT_TTL_MS = 20 * 60 * 1000;   // نية الربط صالحة لحين يفتح البث (حتى 20 دقيقة)
  var LS_PREFIX = 'dhmx-welcome-v1:';   // نفس مفتاح مخزن الجهاز في التصميم الأصلي
  var intentAt = 0;
  var seq = 0;

  function api() { return w.DhmxWelcome || null; }
  function norm(u) { return String(u || '').trim().replace(/^@/, '').toLowerCase(); }
  function warn() { try { if (w.console) console.warn.apply(console, ['[dhmx-welcome-integration]'].concat([].slice.call(arguments))); } catch (e) {} }

  /* نسخ العدّاد المركزي إلى الجهاز: لو انقطع المركزي لاحقاً لا يتجاوز مخزن الجهاز ما عُرض فعلاً */
  function mirrorLocal(key, count, attemptId) {
    try {
      var k = LS_PREFIX + key, rec;
      try { rec = JSON.parse(w.localStorage.getItem(k) || 'null'); } catch (e) { rec = null; }
      rec = rec || { count: 0, attempts: [] };
      if (count > rec.count) rec.count = count;
      if (attemptId && rec.attempts.indexOf(attemptId) < 0) rec.attempts = rec.attempts.concat([attemptId]).slice(-8);
      w.localStorage.setItem(k, JSON.stringify(rec));
    } catch (e) {}
  }

  var store = {
    kind: 'firestore-with-local-fallback',
    reserve: function (key, attemptId) {
      var d = api();
      var local = d && d.localStore;
      var fbx = w.__fb, authed = false;
      try { authed = !!(typeof currentUser !== 'undefined' && currentUser); } catch (e) {}
      if (!fbx || !authed || typeof fbx.runTransaction !== 'function' || !d || typeof d.createFirestoreStore !== 'function') {
        return local.reserve(key, attemptId);
      }
      return d.createFirestoreStore(fbx, { collection: 'dhmxWelcome' }).reserve(key, attemptId).then(function (r) {
        if (r && typeof r.count === 'number') mirrorLocal(key, r.count, r.granted ? attemptId : null);
        return r;
      }, function (err) {
        warn('المخزن المركزي غير متاح — استخدام مخزن الجهاز:', err && (err.code || err.message));
        return local.reserve(key, attemptId);
      });
    }
  };

  function configure() {
    var d = api();
    if (!d || configure.done) return !!d;
    try { d.configure({ store: store }); configure.done = true; } catch (e) { warn(e); }
    return !!d;
  }

  /* نقطة 1 — المستخدم بدأ ربطاً فعلياً (ليس الربط التلقائي الصامت عند فتح الصفحة) */
  w.dhmxWelcomeNoteIntent = function () { intentAt = Date.now(); };

  /* نقطة 2 — تُستدعى من homeConnSetState عند كل تغيّر حالة منصة تيك توك:
       connected (وليس رجوعاً بعد انقطاع) ← تشغيل الترحيب إن كانت نية ربط قائمة
       failed / disabled              ← إلغاء نية الربط (محاولة فاشلة لا تُحتسب ولا تُخزَّن لوقت لاحق) */
  w.dhmxWelcomeOnState = function (state, wasReconnect) {
    if (state === 'failed' || state === 'disabled') { intentAt = 0; return; }
    if (state === 'connected' && !wasReconnect) w.dhmxWelcomeOnConnected('tiktok');
  };

  /* تشغيل الترحيب لربط ناجح فعلي (يستدعيها dhmxWelcomeOnState؛ مكشوفة للاختبار) */
  w.dhmxWelcomeOnConnected = function (platform) {
    if (platform !== 'tiktok') return;
    if (!intentAt || Date.now() - intentAt > INTENT_TTL_MS) return;     // ربط تلقائي صامت/قديم: لا ترحيب
    var d = api();
    if (!d) return;
    intentAt = 0;                                                         // نية واحدة = حدث ربط واحد
    var slot = null;
    try { slot = (typeof homeConnections !== 'undefined') ? homeConnections.tiktok : null; } catch (e) {}
    var uid = norm(slot && slot.username);                                // الحساب الذي ربطه الناقل فعلاً
    if (!uid || uid !== norm(d.target)) return;                           // أي حساب آخر: لا شيء يحدث
    configure();
    seq += 1;
    var attemptId = 'link-' + Date.now() + '-' + seq;
    try {
      Promise.resolve(d.onConnected({ uniqueId: uid, verified: true, attemptId: attemptId })).catch(function (e) { warn(e); });
    } catch (e) { warn(e); }
  };

  configure();
  if (!configure.done) { try { w.addEventListener('load', configure, { once: true }); } catch (e) {} }
})(window);
