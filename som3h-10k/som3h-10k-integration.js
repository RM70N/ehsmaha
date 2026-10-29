/* ==========================================================================
   EHSEMHA — ربط احتفال 10K (som3h-10k-integration.js)
   طبقة ربط فقط: لا تبني أي عنصر من التصميم ولا تغيّر منطق البث أو الحسابات. التصميم نفسه
   (som3h-10k-celebration.js) نسخة حرفية من الملف المرسل، وهذا الملف يستدعي واجهته الأصلية
   Som3hCelebration._onLinked('som3h.4') (والتصميم نفسه يمنع المشهدين المتزامنين والتكرار خلال 25ث).

   شرطان مستقلان لتشغيل الاحتفال:
     1) ربط بث تيك توك ناجح فعلاً لحساب som3h.4:
          som3h10kNoteIntent()                   ← ضغط المستخدم «ربط/ابدأ بثاً سريعاً/إعادة الربط» (نية حقيقية)
          som3h10kOnState(state, wasReconnect)   ← homeConnSetState: تحوّل حالة تيك توك إلى connected فعلاً
                                                    (bridge_status:connected) وليس رجوعاً بعد انقطاع.
        الهوية من اتصال الناقل (homeConnections.tiktok.username)، مطابقة تامة، لا من حقل نصي ولا اسم عرض.
     2) دخول مستخدم الموقع Sjwj بحسابه المسجَّل (som3h10kOnAuth من authRunPostAuthBootChain التي تعمل
        مرة لكل حساب في كل زيارة/تحميل صفحة، ولا تتكرر مع التنقل الداخلي أو تحديث حالة المصادقة).
        الهوية: اسم المستخدم المحسوم من نظام المصادقة (currentUsername) + تطابق uid الجلسة الحالية.
   في الحالتين يظهر نفس التصميم للستريمر som3h.4 (بصورته وعباراته) — لا شيء يخص حساب Sjwj.
   ========================================================================== */
(function (w) {
  'use strict';
  if (w.__SOM3H_10K_INTEGRATION__) return;
  w.__SOM3H_10K_INTEGRATION__ = 1;

  var STREAMER = 'som3h.4';
  var VIEWER = 'sjwj';                  // اسم المستخدم داخل احسمها (usernameLower)
  var INTENT_TTL_MS = 20 * 60 * 1000;   // نية الربط صالحة لحين يفتح البث (حتى 20 دقيقة)
  var intentAt = 0;
  var authShownFor = null;              // uid الذي عُرض له هذه الزيارة

  function norm(u) { return String(u == null ? '' : u).trim().replace(/^@/, '').toLowerCase(); }

  /* التصميم الأصلي يلفّ tiktokAttachAccountToGames ويشغّل الاحتفال عند كل استدعاء. نحن نتحكم بالتشغيل
     (ربط حقيقي/نية/دخول Sjwj) فنضع علامته الأصلية مسبقاً ليتخطى التصميم لفّه، دون تعديل ملف التصميم. */
  try { if (typeof w.tiktokAttachAccountToGames === 'function') w.tiktokAttachAccountToGames.__som3h = true; } catch (e) {}

  function play() {
    var c = w.Som3hCelebration;
    if (c && typeof c._onLinked === 'function') { try { c._onLinked(STREAMER); } catch (e) {} }
  }

  w.som3h10kNoteIntent = function () { intentAt = Date.now(); };

  w.som3h10kOnState = function (state, wasReconnect) {
    if (state === 'failed' || state === 'disabled') { intentAt = 0; return; }
    if (state !== 'connected' || wasReconnect) return;
    if (!intentAt || Date.now() - intentAt > INTENT_TTL_MS) return;       // ربط تلقائي صامت/قديم
    intentAt = 0;                                                          // نية واحدة = حدث ربط واحد
    var slot = null;
    try { slot = (typeof homeConnections !== 'undefined') ? homeConnections.tiktok : null; } catch (e) {}
    if (norm(slot && slot.username) !== STREAMER) return;                  // أي حساب آخر: لا شيء
    play();
  };

  w.som3h10kOnAuth = function (user, username) {
    try {
      if (!user || !user.uid) return;
      if (norm(username) !== VIEWER) return;
      var live = w.__fb && w.__fb.auth && w.__fb.auth.currentUser;
      if (live && live.uid !== user.uid) return;                           // الجلسة الحالية يجب أن تطابق الحساب
      if (authShownFor === user.uid) return;                                // مرة واحدة لكل زيارة
      authShownFor = user.uid;
      play();
    } catch (e) {}
  };
})(window);
