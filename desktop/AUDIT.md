# تقرير الفحص التقني — تطبيق احسمها لويندوز (المرحلتان 1 و2)

تاريخ الفحص: 2026-11-04. الفحص على الكود الفعلي بالمستودع، لا على افتراضات.

## 1. بنية الموقع (ما يجب أن يعمل داخل التطبيق)

- الموقع ليس ملفاً واحداً. `pages.yml` ينشر على GitHub Pages (دومين ehsmaha.com):
  `index.html` + 12 صفحة لعبة مستقلة (`roulette3d.html`, `bomb3d.html`, `tug3d.html`, `almeezan3d.html`,
  `callcenter3d.html`, `la-tatayeh3d.html`, `harf-alnajat3d.html`, `xo.html`, `ektheb-alay.html`,
  `hallaha-qabli.html`, `wesh-taghayar.html`, `code-race.html`) + `ws-diag.html`
  + مجلدات `revival-system/`, `dhmx-welcome/`, `som3h-10k/`, `blhh-5k/`, `c7-welcome/`, `owner-studio/`, `ops/`,
  `subathon/`, `about-experience/{previews-sq,posters}` + صور `code-race-banner.png`, `discord-logo.png`.
- `index.html` يحمّل ~30 ملف JS/CSS بمسارات مطلقة (`/subathon/subathon-core.js`, `/revival-system/*.js`, `/ops/*.js`, ...)
  وألعاب 3D تُحمَّل كصفحات داخل iframe.
- Firebase (مشروع `streamgame-180b8`): Auth + Firestore + Realtime DB. `window.__fb` معرَّض بالصفحة.
- تسجيل الدخول: `signInWithPopup` للـGoogle مع تراجع إلى `signInWithRedirect`.
- جسور البث: `wss://ehsmaha-piratetok-bridge.onrender.com/ws` (أساسي) + `wss://ehsmaha.onrender.com/ws` (احتياطي).
- مصادر خارجية: `cdn.jsdelivr.net` / `cdnjs.cloudflare.com` (three.js وغيره بصفحات الألعاب)، `unpkg.com`،
  `fonts.googleapis.com`، `flagcdn.com`، Cloudinary، YouTube، Gemini.
- الموقع لا يستخدم Web Notification API إطلاقاً (لا `new Notification`)، ولا يوجد Service Worker.

## 2. مشروع Electron الموجود (`desktop/`)

يعمل كغلاف: يشحن `site/index.html` ويقدّمه من سيرفر محلي `127.0.0.1:43711`، ويزامن `index.html` وحده بالخلفية.

### المشاكل المؤكدة

| # | المشكلة | الأثر |
|---|---|---|
| A1 | `sync-site.js` ينسخ `index.html` + معاينات about فقط | كل ملفات الألعاب والسكربتات الفرعية (~40 ملف) غير مشحونة. السيرفر المحلي يرجع `index.html` لها (SPA fallback) بنوع `text/html` فتُحجب بـ`nosniff`: الإنعاش، السابثون، الترحيبات، لوحة المالك، مختبر الألعاب، وكل ألعاب 3D لا تعمل. |
| A2 | `content-sync.js` ينزّل `index.html` وحده بلا manifest/إصدار/بصمة ملفات | أي تحديث على ملفات أخرى لا يصل أبداً؛ لا تحقق تبعيات؛ لا rollback حقيقي. |
| A3 | تطبيق التحديث "عند إعادة التشغيل" فقط، ولا فكرة عن الجولات | لا يوجد تأجيل ذكي ولا تطبيق عند نقطة آمنة. |
| A4 | CSP تحجب `cdn.jsdelivr.net` و`cdnjs.cloudflare.com` و`unpkg.com` | صفحات 3D (three.js من jsdelivr) تفشل بالتحميل. |
| A5 | `preload.js`: عند عودة الإنترنت يستدعي `api.reload()` تلقائياً | يعيد تحميل الصفحة وسط جولة نشطة ويقطع اللاعبين. |
| A6 | `render-process-gone` → `reload()` بلا حد | حلقة إعادة تحميل محتملة، وقطع للجولة. |
| A7 | `updater.js` يعرض نافذة "أعد التشغيل الآن" فور تنزيل التحديث، و`autoInstallOnAppQuit` | يمكن قطع جولة/بث. |
| A8 | `main.js` يفعّل التشغيل التلقائي مع ويندوز في أول تشغيل | المطلوب: معطّل افتراضياً. |
| A9 | زر الإغلاق دائماً يخفي النافذة (لا خيار) | المطلوب: خيار تصغير إلى Tray قابل للتحكم. |
| A10 | معالج الأذونات يسمح بـ`media`/`background-sync` لأي أصل بلا فحص | تضييق الأذونات لأصل التطبيق فقط. |
| A11 | تسجيل Google داخل نافذة Electron مع انتحال User-Agent | هشّ: Google تمنع المتصفحات المدمجة (`disallowed_useragent`). المطلوب متصفح النظام + callback آمن. |
| A12 | لا يوجد نظام إشعارات حقيقي (فقط إشعاران عن التحديث) | README يدّعي أن الموقع يستخدم Web Notification وهذا غير صحيح. |
| A13 | لا لوغ ملفي، لا معالجة `unhandledRejection`/`uncaughtException`، لا صفحة إعدادات | مطلوبة بالمواصفات. |
| A14 | رسائل overlay بالـpreload تستخدم إيموجي (📡 ✕) | مخالف لمواصفات واجهة التطبيق. |
| A15 | `desktop-release.yml` يحذف أصول الإصدار المنشور (`delete-asset`) ثم يعيد رفعها بنفس الرقم | يكسر `latest.yml`/blockmap والكاش؛ ممنوع بالمواصفات. لا يشغّل أي اختبار قبل النشر. |
| A16 | `main.js` يغلق الـsplash بعد `did-finish-load` فقط ولا يوجد اختبارات إطلاقاً | لا ضمان جودة. |

### نقاط سليمة (تُحفظ ولا تُعاد كتابتها)
`contextIsolation`/`sandbox`/`nodeIntegration:false`، أصل محلي ثابت (حفظ الجلسة)، قفل نسخة واحدة، شاشة offline،
حفظ حجم النافذة، سيرفر محلي على 127.0.0.1 مع منع path traversal، رفض أخطاء الشهادات، `app.setAppUserModelId`.

## 3. المعمارية المختارة

**هجين: محتوى مُصدَّر بالإصدارات + سيرفر محلي (الأسلوب الثاني)، مع وضع remote اختياري (الأسلوب الأول).**

السبب: الأصل المحلي الثابت يحفظ جلسة Firebase ويعمل `signIn*` بلا تعقيد، والمزامنة المتعددة الملفات تمنع صفحة فارغة عند ضعف الشبكة.

1. **Manifest على الموقع.** خطوة بناء في `pages.yml` تولّد `content-manifest.json`
   (`schema`, `version` = بصمة المحتوى، `files[{path,size,sha256}]`) بنفس الأداة التي تستعملها حزمة التطبيق.
2. **حزمة مضمّنة كاملة.** `sync-site.js` يجمّع نفس قائمة `pages.yml` (يتحقق اختبار تلقائي من تطابق القائمتين) ويولّد manifest للنسخة المضمّنة.
3. **مخزن إصدارات ذري.** `userData/content/versions/<version>/` + مؤشر `current.json` يُكتب ذرياً + إبقاء النسخة السابقة للتراجع.
4. **المزامنة:** جلب manifest ← مقارنة بصمات ← تنزيل الملفات المتغيرة فقط إلى مجلد staging ← فحص SHA-256 لكل ملف
   ← فحص التبعيات (كل `src/href` مطلق بـ`index.html` والصفحات موجود) ← ترقية المرحلة إلى إصدار جاهز (Pending).
5. **التطبيق عند نقطة آمنة فقط.** `safe-point` يستعلم الصفحة (صفحة نشطة، مستمعو ألعاب البث، اتصالات `homeConnections`).
   الإصدار الجاهز يُطبَّق: فوراً إن كان المستخدم بالواجهة الرئيسية، وإلا يُؤجَّل مع Toast
   «وصل تحديث جديد لأحسمها، بيصير جاهز بعد الجولة» ويُطبَّق عند أول عودة للخمول أو بموافقة المستخدم.
   فشل تحميل بعد التطبيق ← rollback تلقائي للإصدار السابق.
6. **تحديث Electron نفسه** عبر `electron-updater` + GitHub Releases، بمنع `quitAndInstall` أثناء الانشغال.
7. **حدود الأمان:** لا يُنفَّذ كود Node من المحتوى المنزَّل؛ المحتوى ويب فقط داخل sandbox. أي تغيير بـpreload/main يمر عبر إصدار EXE.

## 4. الإشعارات: المصادر الموثوقة

قواعد Firestore تقصر الكتابة على حساب المالك في: `broadcastMessages/current`, `personalMessages/{user}`,
`storeNewAnnouncements/current`, `streamerEventAnnouncements/current`، وتقصر قراءة `notifications/{uid}/items` على المستلم.
هذه هي مصادر الإشعارات الوحيدة. **لن** يُستخدم `siteUpdates` لأنه قابل للكتابة من أي مستخدم مسجّل.
اكتشاف «لعبة جديدة» يأتي من فرق manifest (ملف لعبة جديد بالإصدار الجديد)، لا من أي مصدر يتحكم به مستخدم.

## 5. ما لا يمكن إثباته من بيئة التطوير هنا (يُوثَّق بصدق في TEST-REPORT)

بيئة التطوير Linux بلا ويندوز/OBS/GPU حقيقي ولا شهادة توقيع. لذلك: اختبار الإشعارات النظامية الفعلية على ويندوز،
تثبيت EXE على جهاز نظيف، التقاط OBS، وأداء GPU لا تُسجَّل كناجحة هنا.
