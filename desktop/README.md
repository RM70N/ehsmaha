# احسمها | تطبيق سطح المكتب (Electron)

غلاف (wrapper) سطح مكتب احترافي حول موقع [ehsmaha.com](https://ehsmaha.com) —
نفس السيرفر، نفس Firebase (Auth + Firestore + Realtime Database)، نفس
Cloudinary وYouTube API وGemini، **بدون أي تعديل** على كود الموقع أو الباك اند.

## كيف يعمل (باختصار)

- التطبيق يشحن نسخة كاملة من `index.html` (نفس ملف الموقع) داخل حزمة
  التثبيت، ويشغّلها من سيرفر HTTP محلي (`http://localhost:43711`) بدل
  `file://` — هذا ضروري حتى يعمل Firebase Auth بشكل طبيعي (Firebase يرفض
  الأصل `null` الذي يعطيه `file://`، بينما `localhost` مسموح دائماً).
- بالخلفية، يتحقق التطبيق دورياً من نسخة أحدث من الموقع الحيّ وينزّلها،
  فيبقى محتوى التطبيق محدَّثاً بدون الحاجة لإعادة بناء ملف تثبيت جديد مع كل
  تعديل بسيط في الموقع (انظر "تحديث المحتوى" أدناه).
- Firebase يتصل مباشرة من التطبيق إلى نفس مشروع Firebase — لا يوجد أي وسيط
  أو خادم إضافي. هذا تطبيق سطح مكتب حقيقي (نافذة خاصة، أيقونة، قائمة، تحديث
  تلقائي، عمل بدون شريط متصفح) وليس مجرد اختصار يفتح المتصفح.

## هيكل المشروع

```
desktop/
├── main.js                 # العملية الرئيسية: النافذة، الأمان، التنقل، IPC
├── preload.js               # جسر آمن (contextIsolation) + طبقة عدم الاتصال/التحديثات
├── electron-builder.yml     # إعداد التغليف والنشر
├── package.json
├── src/
│   ├── config.js             # الثوابت، النطاقات المسموحة، CSP
│   ├── server.js             # سيرفر HTTP محلي يخدم محتوى الموقع
│   ├── content.js            # إدارة نسخة الموقع (مضمّنة/منزَّلة)
│   ├── content-sync.js       # تنزيل أحدث نسخة من ehsmaha.com بالخلفية
│   ├── updater.js            # التحديث التلقائي للتطبيق (electron-updater)
│   ├── menu.js               # القائمة العربية المبسّطة
│   └── state.js              # حفظ حجم النافذة/المنفذ بين الجلسات
├── renderer/
│   ├── splash.html           # شاشة الانتظار عند الإقلاع
│   └── offline.html          # شاشة "لا يوجد اتصال"
├── build/
│   ├── source-logo.png       # شعار الموقع (مستخرج من فافيكون index.html)
│   └── icon.png              # أيقونة التطبيق (placeholder — استبدلها لاحقاً بجودة أعلى)
├── scripts/
│   ├── sync-site.js          # نسخ ../index.html إلى desktop/site/ قبل كل تشغيل/بناء
│   ├── make-icons.js         # تجهيز الأيقونات من الشعار المصدري
│   └── start-remote.js       # تشغيل تجريبي يحمّل الموقع الحيّ مباشرة
└── site/                     # (يُنشأ تلقائياً) نسخة الموقع المضمَّنة — لا تُعدَّل يدوياً
```

> **مهم:** `desktop/site/` مُتجاهَل في `.gitignore` — يُعاد إنشاؤه تلقائياً من
> `../index.html` (جذر المستودع) في كل مرة تُشغّل فيها `npm start` أو
> `npm run dist`. أي تعديل على الموقع يجب أن يكون في `index.html` بجذر
> المستودع فقط.

## التشغيل المحلي للتجربة

يتطلب Node.js 18 أو أحدث.

```bash
cd desktop
npm install
npm start
```

أول تشغيل ينسخ `index.html` من جذر المستودع، يجهّز الأيقونات، يشغّل السيرفر
المحلي، ثم يفتح نافذة التطبيق. لتشغيل نسخة تحمّل **الموقع الحيّ مباشرة** (بدل
النسخة المحلية — للمقارنة السريعة فقط):

```bash
npm run start:remote
```

لفتح أدوات المطوّر أثناء التطوير: `Ctrl+Shift+I` (أو `Cmd+Option+I` على ماك).
في نسخة الإنتاج المغلَّفة، القائمة لا تعرض أدوات المطوّر، لكن نفس الاختصار
يفتحها عند الحاجة.

## البناء (إنتاج ملف تثبيت)

```bash
cd desktop
npm install

# بناء لنظامك الحالي فقط، بدون تثبيت (للفحص السريع):
npm run pack

# بناء NSIS installer لويندوز (.exe) — يعمل فقط على ويندوز أو عبر GitHub Actions:
npm run dist:win

# بناء .dmg للماك — يعمل فقط على ماك أو عبر GitHub Actions:
npm run dist:mac

# بناء لكل الأنظمة المتاحة على الجهاز الحالي:
npm run dist
```

الناتج يظهر في `desktop/dist/`:
- Windows: `ehsmaha-setup.exe`
- macOS: `ehsmaha-x64.dmg` / `ehsmaha-arm64.dmg`

> اسم الملف **ثابت بدون رقم إصدار** عمداً (`artifactName` في
> `electron-builder.yml` بدون `${version}`) — هذا يجعل رابط التحميل المباشر
> ثابتاً للأبد مهما صدرت نسخ جديدة، وهو ما يستخدمه زر "تحميل التطبيق" في
> صفحة `/download-app` على الموقع (انظر أدناه). GitHub يسمح بنفس اسم الملف
> في إصدارات (tags) مختلفة بلا مشاكل.

> **ملاحظة عن Cross-compiling:** electron-builder لا يبني `.dmg` إلا على
> ماك (أو عبر GitHub Actions macOS runner). لذلك أنشأنا سكربت GitHub Actions
> (`.github/workflows/desktop-release.yml`) يبني على ويندوز وماك حقيقيين —
> لا تحتاج جهاز ماك عندك شخصياً.

## التوزيع عبر رابط تحميل مباشر (بدون أي متجر تطبيقات)

### الخيار الأول (الموصى به): GitHub Releases

**الخطوات:**

1. أنشئ مستودع GitHub (لو ما كان موجوداً) وارفع هذا المشروع إليه.
2. أنشئ [Personal Access Token](https://github.com/settings/tokens) بصلاحية
   `repo` (أو استخدم `GITHUB_TOKEN` التلقائي داخل GitHub Actions — لا حاجة
   لإعداد يدوي هناك، وهذا ما يفعله `.github/workflows/desktop-release.yml`
   المرفق).
3. للنشر **يدوياً** من جهازك:
   ```bash
   export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx   # التوكن من الخطوة 2
   cd desktop
   npm run publish   # يبني وينشر مباشرة إلى GitHub Releases
   ```
4. للنشر **تلقائياً** عبر GitHub Actions (الطريقة المفضّلة — لا تحتاج تبني
   يدوياً كل مرة):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
   هذا يشغّل `.github/workflows/desktop-release.yml` الذي يبني النسخة على
   ويندوز وماك تلقائياً، وينشئ GitHub Release باسم التاج (`v1.0.0`) ويرفع
   ملفات `.exe` و`.dmg` كمرفقات (assets) عليه.

**شكل رابط التحميل المباشر النهائي:**

بعد أول نشر، يظهر إصدار على:
```
https://github.com/<owner>/<repo>/releases
```

رابط **ثابت للأبد ويشير دائماً لآخر نسخة منشورة تلقائياً** (لا يتغيّر مع أي
إصدار جديد — هذا هو الرابط الذي يستخدمه بالفعل زر "تحميل التطبيق" في صفحة
`/download-app` على الموقع، انظر قسم "زر تحميل التطبيق على الموقع" أدناه):
```
https://github.com/<owner>/<repo>/releases/latest/download/ehsmaha-setup.exe        # Windows
https://github.com/<owner>/<repo>/releases/latest/download/ehsmaha-x64.dmg          # macOS (Intel)
https://github.com/<owner>/<repo>/releases/latest/download/ehsmaha-arm64.dmg        # macOS (Apple Silicon)
```
بمجرّد فتح هذا الرابط (بالضغط عليه أو وضعه في `<a href>`)، يبدأ تحميل ملف
`.exe`/`.dmg` مباشرة من المتصفح بدون أي صفحة وسيطة — بالضبط سلوك "اضغط تحميل
ويبدأ التنزيل على طول".

**مزايا GitHub Releases:**
- مجاني بالكامل، بدون حدود تخزين عملية لهذا الاستخدام.
- التحديث التلقائي للتطبيق (`electron-updater`) مصمَّم للعمل مع GitHub
  Releases مباشرة بدون إعداد إضافي.
- سجلّ إصدارات (changelog) وأرشيف لكل نسخة سابقة تلقائياً.
- بناء ونشر تلقائي بالكامل عبر GitHub Actions (بدون تدخل يدوي).

**عيوب GitHub Releases:**
- الرابط يبدأ بـ `github.com` وليس `ehsmaha.com` — قد يبدو أقل احترافية لمن
  يشك بالروابط الخارجية.
- يتطلب أن يكون المستودع (أو الإصدارات على الأقل) قابلاً للوصول علناً
  (public repo، أو private مع الإعدادات المناسبة).

### الخيار الثاني (بديل): استضافة الملف على نفس دومين الموقع (Firebase Hosting)

بعد بناء ملف `.exe` بأي من الطريقتين أعلاه، ينسخ إلى مجلد استضافة Firebase
الحالي للموقع (نفس المشروع `streamgame-180b8`) ويُرفع كملف ثابت:

```bash
# افترض أن مجلد استضافة firebase الحالي هو public/
cp desktop/dist/ehsmaha-setup.exe /path/to/firebase-hosting/public/download/ehsmaha-setup.exe
firebase deploy --only hosting
```

عندها يصبح رابط التحميل:
```
https://ehsmaha.com/download/ehsmaha-setup.exe
```

**مزايا هذا الخيار:**
- الرابط من نفس نطاق الموقع (`ehsmaha.com`) — يبدو أكثر رسمية وثقة للمستخدم،
  ولا يخرجه لموقع خارجي (github.com).
- تحكّم كامل بالمسار وبالعرض (يمكن ربطه بصفحة تحميل مخصّصة على الموقع).

**عيوب هذا الخيار:**
- **رفع يدوي بالكامل** مع كل إصدار جديد — لا يوجد ربط تلقائي بين
  `electron-builder`/GitHub Actions وFirebase Hosting إلا إذا أضفت خطوة نشر
  إضافية بنفسك (سكربت أو GitHub Action يرفع لـ Firebase Hosting بعد البناء).
- **لا يعمل مع `electron-updater` تلقائياً** — التحديث التلقائي للتطبيق
  (البند 5 في المتطلبات) مبني على مزوّد `github` افتراضياً في
  `electron-updater`؛ لدعم Firebase Hosting كمصدر تحديث تحتاج تحويل الإعداد
  إلى [`generic` provider](https://www.electron.build/auto-update#generic-server)
  وتوليد ملفات `latest.yml` يدوياً أو عبر سكربت إضافي مع كل رفعة، وهذا خارج
  نطاق هذا الإعداد الجاهز.
- استهلاك حصة Firebase Hosting (Bandwidth) مع كل تحميل — الملف عادة 80-150MB.

**التوصية:** استخدم GitHub Releases كمصدر أساسي للتوزيع والتحديث التلقائي
(هذا ما هو معدّ ومجهّز بالكامل في هذا المشروع)، وإن أردت رابطاً بنطاق الموقع
لأسباب تسويقية، اجعل زر "تحميل" في ehsmaha.com **يشير مباشرة لرابط GitHub
الثابت** (`/releases/latest/download/ehsmaha-setup.exe`) بدل استضافة الملف
بنفسك — تحصل على واجهة `ehsmaha.com` (الزر نفسه على موقعك) دون التضحية
بالتحديث التلقائي أو الصيانة اليدوية.

## زر "تحميل التطبيق" على الموقع

أُضيف زر "تحميل التطبيق" في الصفحة الرئيسية للموقع (`index.html`، أسفل بطاقة
"أسئلة شائعة" مباشرة) يفتح صفحة تحميل مخصّصة (`show('download-app')`) بتصميم
فخم متوافق مع هوية الموقع. زر "تحميل لويندوز" فيها رابط `<a href download>`
مباشر لملف `.exe` على GitHub Releases — الضغط عليه يبدأ التنزيل فوراً من
المتصفح بدون أي صفحة وسيطة، ومباشرة بعد اكتمال التنزيل يقدر المستخدم يفتح
الملف وتثبيته (NSIS one-click installer).

الروابط داخل هذه الصفحة (بحث عن `GITHUB_RELEASES_BASE` داخل `index.html`)
تشير إلى:
```
https://github.com/rm70n/ehsmaha/releases/latest/download/ehsmaha-setup.exe   (ويندوز)
https://github.com/rm70n/ehsmaha/releases/latest/download/ehsmaha-x64.dmg     (ماك Intel)
https://github.com/rm70n/ehsmaha/releases/latest/download/ehsmaha-arm64.dmg   (ماك Apple Silicon)
```
هذه الروابط **لن تُنزّل شيئاً حقيقياً حتى يُنشر أول إصدار فعلي** عبر
`npm run publish` أو تاج `git tag vX.Y.Z && git push origin vX.Y.Z` (انظر
أعلاه) — قبل ذلك GitHub يرجع 404. بعد أول نشر تعمل الروابط فوراً بدون أي
تعديل إضافي على الموقع، لأنها تشير دائماً لـ "آخر إصدار" تلقائياً.

لو غيّرت `owner`/`repo` في `electron-builder.yml`، حدّث نفس القيمة في ثابت
`GITHUB_RELEASES_BASE` داخل `index.html` (مكان واحد فقط، أعلى قسم صفحة
التحميل) حتى يبقى الرابطان متطابقين.

## تحديث محتوى الموقع داخل التطبيق (بدون بناء إصدار جديد)

التطبيق يتحقق تلقائياً من نسخة أحدث لصفحة الموقع كل 3 ساعات (وبعد 20 ثانية
من كل إقلاع)، وأي تعديل بسيط (نص، تصميم، لعبة جديدة داخل نفس `index.html`)
يصل للمستخدمين **تلقائياً بدون إصدار تطبيق جديد** — يكفي أن يعيد المستخدم
تشغيل التطبيق بعد ظهور تنبيه "تم تحديث محتوى احسمها".

هذا منفصل تماماً عن تحديث **التطبيق نفسه** (نسخة Electron/الأيقونة/الميزات)
الذي يمر عبر GitHub Releases و`electron-updater` كما هو موضّح أعلاه.

## الأمان

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` في كل
  نافذة — لا وصول لـ Node.js من كود الموقع.
- Content-Security-Policy مضبوطة في `src/config.js` تسمح فقط بالنطاقات التي
  يستخدمها الموقع فعلياً (Firebase، Cloudinary، YouTube، جسور TikTok/Twitch/
  Kick) — لا سكربت من أي مصدر آخر.
- لا مفاتيح API إضافية غير الموجودة أصلاً داخل `index.html` العام.
- الروابط الخارجية (تيك توك، انستقرام، يوتيوب) تُفتح بالمتصفح الافتراضي عبر
  `shell.openExternal`، ونوافذ تسجيل الدخول (Google) تُفتح كنافذة Electron
  ثانوية حقيقية عبر `setWindowOpenHandler` — لا شيء يُحقن أو يُعترَض من جلسة
  المستخدم.
- أدوات المطوّر مغلقة افتراضياً في الإنتاج، وتُفتح فقط بـ `Ctrl+Shift+I`.
- جلسة تسجيل الدخول محفوظة عبر `partition: persist:ehsmaha` ثابت — لا حاجة
  لتسجيل الدخول من جديد كل مرة يُفتح فيها التطبيق.

## قبل أول نشر فعلي — تحقّق من هذه النقاط

1. عدّل `owner`/`repo` في `electron-builder.yml` (قسم `publish`) ليطابقا
   مستودع GitHub الفعلي.
2. استبدل `build/icon.png` بشعار عالي الدقة (1024×1024 PNG) لجودة أفضل على
   شاشات Retina وأيقونات ويندوز الكبيرة — النسخة الحالية placeholder مستخرجة
   من فافيكون الموقع (256×256).
3. لتوقيع نسخة ويندوز (اختياري، لتفادي تحذير SmartScreen) أضف شهادة توقيع
   كود وفعّل `win.certificateFile`/`win.certificatePassword` في
   `electron-builder.yml`.
4. لتوقيع وnotarization نسخة ماك (اختياري، لتفادي حجب Gatekeeper) تحتاج
   حساب Apple Developer وإعداد `APPLE_ID`/`APPLE_APP_SPECIFIC_PASSWORD` كأسرار
   GitHub Actions — بدون ذلك يعمل الـ `.dmg` لكن يحتاج المستخدم الضغط على
   "افتح رغم ذلك" (Open Anyway) في إعدادات الخصوصية والأمان أول مرة.
