/* إعدادات حملة إطلاق تطبيق احسمها للويندوز — الملف الوحيد الذي يُعدَّل عند الحاجة. */
window.WINDOWS_LAUNCH_CAMPAIGN = Object.freeze({
  id: 'ehsemha-windows-launch-2026',
  enabled: true,

  // موعد الإطلاق الواحد لجميع اللاعبين (توقيت السعودية UTC+3). نهاية الحملة = startAt + durationDays
  // = 2026-11-22T21:00:00+03:00 (15 يوماً بالضبط). لا يبدأ العدّ من أول زيارة لأي لاعب.
  startAt: '2026-11-07T21:00:00+03:00',
  durationDays: 15,
  endAt: null, // اختياري: ISO صريح يتجاوز الحساب أعلاه

  // الوجهة: صفحة تحميل تطبيق الويندوز داخل الموقع (نفس وجهة openWindowsApp() في index.html).
  destination: '/windows-app.html',

  // مصدر الوقت: ترويسة Date من استجابة الموقع نفسه لتصحيح ساعة جهاز اللاعب. إن فشل الطلب يُستخدم وقت الجهاز.
  timeSource: { enabled: true, timeoutMs: 2500 },

  showDelayMs: 700, // يُعرض بعد اكتمال تحميل الصفحة وخمولها

  // صفحات الألعاب/البث/الجلسات: لا يظهر فيها الإعلان ويُغلق تلقائياً إن انتقل إليها اللاعب والإعلان مفتوح.
  excludePaths: [
    '/(roulette3d|bomb3d|tug3d|xo|ektheb-alay|almeezan3d|wesh-taghayar|hallaha-qabli|code-race|callcenter3d|la-tatayeh3d|harf-alnajat3d|ws-diag|desktop-auth|windows-app|link-device)(\\.html)?/?$',
    '^/games/',
    '^/(revival-system|dhmx-welcome|som3h-10k|blhh-5k|c7-welcome|owner-studio|ops|subathon)/'
  ],

  // منفذ السيرفر المحلي لتطبيق الويندوز (desktop/src/config.js → PREFERRED_PORT … +11)
  desktopAppPorts: [43711, 43712, 43713, 43714, 43715, 43716, 43717, 43718, 43719, 43720, 43721, 43722]
});
