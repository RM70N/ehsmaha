# احسمها | تطبيق أندرويد (Capacitor)

غلاف (wrapper) أندرويد احترافي حول موقع [ehsmaha.com](https://ehsmaha.com) —
نفس السيرفر، نفس Firebase (Auth + Firestore + Realtime Database)، بدون أي
تعديل على كود الموقع أو الباك اند. مبني بـ [Capacitor](https://capacitorjs.com)
(من فريق Ionic)، ويُوزَّع كملف APK مباشر خارج Google Play بالكامل.

## كيف يعمل

- `capacitor.config.ts` يضبط `server.url` على `https://ehsmaha.com` مباشرة —
  الـ WebView يحمّل الموقع الحي فعلياً، بنفس الأصل (origin) الحقيقي، فيبقى
  ضمن النطاقات المصرَّح بها في Firebase Auth تلقائياً بدون أي التفاف (على
  عكس تطبيق سطح المكتب الذي احتاج سيرفراً محلياً بسبب قيود `file://`).
- Capacitor يحقن جسره (bridge) في صفحة الموقع تلقائياً حتى وهي مُحمَّلة من
  مصدر بعيد، فتقدر إضافات Android (زر الرجوع، شاشة عدم الاتصال، الروابط
  الخارجية) تعمل من طبقة Android الأصلية بدون لمس كود الموقع نفسه إطلاقاً.
- `MainActivity.java` (الملف الوحيد المخصَّص) يضيف 3 أشياء فقط فوق تصرّف
  Capacitor الافتراضي: إصلاح User-Agent لتسجيل الدخول بـ Google، منطق زر
  الرجوع المتوافق مع تنقّل الموقع الداخلي (SPA)، وتنبيه تحديث بسيط. كل شيء
  آخر (الروابط الخارجية، شاشة عدم الاتصال) معالَج فعلياً بإعدادات
  `capacitor.config.ts` وحدها — لا كود إضافي.

## هيكل المشروع

```
mobile/
├── capacitor.config.ts       # server.url، allowNavigation، errorPath، السبلاش
├── package.json
├── www/
│   ├── index.html              # placeholder فقط — لا يظهر عملياً أبداً
│   └── offline.html            # شاشة "لا يوجد اتصال" (server.errorPath)
├── build/
│   └── source-logo.png         # شعار الموقع المصدري (من فافيكون index.html)
├── scripts/
│   └── generate-icons.py       # يولّد كل أيقونات/سبلاش أندرويد من الشعار المصدري
└── android/                    # المشروع الأصلي (Android Studio / Gradle)
    ├── app/src/main/AndroidManifest.xml
    ├── app/src/main/java/com/ehsmaha/app/
    │   ├── MainActivity.java     # زر الرجوع + إصلاح User-Agent + تنبيه التحديث
    │   └── UpdateChecker.java    # مقارنة الإصدار مع GitHub Releases
    ├── app/src/main/res/mipmap-*/   # أيقونة التطبيق (adaptive + legacy)
    ├── app/src/main/res/drawable*/  # شاشات splash لكل كثافة/اتجاه
    └── app/build.gradle           # versionName/versionCode + إعداد التوقيع
```

## التشغيل المحلي للتجربة على جهاز/محاكي

يتطلب: Node.js 18+، Android Studio (أو Android SDK + محاكي/جهاز فعلي متصل
عبر USB debugging)، JDK 17 فأحدث.

```bash
cd mobile
npm install

# يفتح المشروع في Android Studio (شغّل من هناك على جهاز/محاكي):
npm run open

# أو شغّله مباشرة على جهاز/محاكي متصل بدون فتح Android Studio:
npm run run
```

كل أمر من الاثنين يشغّل تلقائياً `npx cap sync android` قبل الفتح/التشغيل،
فأي تعديل في `capacitor.config.ts` أو `www/` ينعكس فوراً.

> ملاحظة: بما أن `server.url` يشير لـ ehsmaha.com مباشرة، الجهاز/المحاكي
> يحتاج اتصال إنترنت فعلي ليشتغل التطبيق أثناء التجربة المحلية — لا توجد
> نسخة محلية من الموقع يعمل عليها بدون شبكة (هذا مقصود، مطابق لما طلبته).

## الهوية البصرية (أيقونة + splash)

الأيقونة وشاشة splash مولَّدة من `build/source-logo.png` (نفس شعار الموقع)
عبر `scripts/generate-icons.py`. النتائج محفوظة بالفعل في `android/app/src/main/res/`
كملفات ثابتة — **لا حاجة لتشغيل السكربت إلا لو غيّرت الشعار المصدري**:

```bash
pip install pillow
python3 scripts/generate-icons.py
```

يولّد: أيقونة adaptive (foreground شفاف بالتاج الأبيض + خلفية بنفسجية
`#7C3AED`) بكل الكثافات (mdpi→xxxhdpi)، أيقونة legacy (الشعار كاملاً بخلفيته
الأصلية) لنفس الكثافات، وشاشات splash (portrait + landscape) بخلفية متدرّجة
داكنة تطابق هوية الموقع.

## زر الرجوع وتسجيل الدخول — التفاصيل التقنية

- **زر الرجوع:** الموقع SPA بدون History API حقيقي (`show(page)` يبدّل CSS
  classes فقط، بدون تنقّل متصفح فعلي)، فتتبّع Capacitor الافتراضي
  (`WebView.canGoBack()`) لا يعرف "أين" المستخدم داخل الموقع. `MainActivity`
  يحقن استعلام JS صغير عند كل ضغطة رجوع يقرأ DOM الموقع نفسه (بدون تعديله)
  ويقرر: إغلاق القائمة الجانبية إن كانت مفتوحة → الضغط على زر الرجوع الظاهر
  بالصفحة الحالية إن وُجد → استخدام `navGoBackFromSubPage()` لصفحات فرعية
  معروفة (بروفايل/لوحة الفائزين) → أو العودة للرئيسية. فقط لو كنا أصلاً
  بالرئيسية أو شاشة الدخول، "رجوع" يطلب ضغطة ثانية خلال ثانيتين للخروج
  الفعلي من التطبيق.
- **تسجيل الدخول بـ Google:** أندرويد WebView الافتراضي يحمل توقيع `; wv`
  ضمن الـ User-Agent، وGoogle يرفض تسجيل الدخول من أي WebView يحمل هذا
  التوقيع (`disallowed_useragent`) — قيد رسمي معروف من Google لكل WebViews
  المدمجة، بغض النظر عن استخدام popup أو redirect. الحل المطبَّق (مطابق
  لما استُخدم بالضبط في نسخة سطح المكتب): إزالة توقيع `; wv` فقط من
  الـ User-Agent الحالي مع إبقاء بقية المعلومات كما هي — لا حاجة لانتحال
  متصفح كامل مزيّف، ولا حاجة لتعديل كود تسجيل الدخول في الموقع (كود الموقع
  أصلاً يستخدم `signInWithPopup` مع سقوط تلقائي (`fallback`) إلى
  `signInWithRedirect` عند فشل الأول — وهذا الفشل بالضبط هو ما كان سيحدث
  بدون إصلاح الـ User-Agent).
  - **البديل الآخر (Custom Tabs عبر `@capacitor/browser`):** أكثر عزلاً
    (يفتح تسجيل الدخول بمتصفح Chrome حقيقي خارج WebView تماماً) لكنه يتطلب
    تعديل كود تسجيل الدخول بالموقع نفسه ليستدعي الـ plugin بدل
    `signInWithPopup`/`signInWithRedirect` مباشرة — وهذا يخالف الشرط الصريح
    بعدم تعديل كود الموقع. لو واجهت مستقبلاً حالات فشل متكررة رغم إصلاح
    الـ User-Agent (Google قد يشدّد الكشف لاحقاً)، هذا الخيار جاهز كخطوة
    تالية لكنه يحتاج تنسيقاً مع تعديل بسيط في `index.html`.
- **شاشة "لا يوجد اتصال":** `capacitor.config.ts` يضبط
  `server.errorPath: 'offline.html'` — سلوك Capacitor المدمج: أي فشل تحميل
  للإطار الرئيسي (`onReceivedError`/`onReceivedHttpError`) يحمّل
  `www/offline.html` تلقائياً بدل شاشة بيضاء أو رسالة خطأ متصفح. الصفحة
  تعيد المحاولة تلقائياً كل 5 ثوانٍ لو الجهاز يقول إنه متصل، وفيها زر إعادة
  محاولة يدوي.
- **الروابط الخارجية:** `allowNavigation` في `capacitor.config.ts` يحدّد
  النطاقات المسموح للـ WebView بالتنقّل داخلها (الموقع نفسه + Google + نطاقات
  Firebase Auth). أي رابط آخر (تيك توك، انستقرام، يوتيوب...) يُعترَض تلقائياً
  عبر آلية Capacitor المدمجة (`Bridge.launchIntent`) ويُفتح بتطبيق/متصفح
  النظام الافتراضي بدل داخل WebView التطبيق — بدون أي كود إضافي مني.

## إنشاء Keystore والتوقيع

APK غير الموقَّع لا يقبله أندرويد للتثبيت خارج بيئة تطوير. يحتاج توقيعاً
بشهادة تُنشأ **مرة واحدة** وتُستخدم **لكل التحديثات المستقبلية** لنفس
التطبيق — فقدانها أو تغييرها يعني أن المستخدمين الحاليين **لن يقدروا يحدّثوا**
فوق النسخة القديمة (يحتاجون إزالة التطبيق وتثبيته من جديد، وتفقد بياناتهم
المحلية إن وُجدت). احفظ ملف الـ keystore وكلمتي المرور في مكان آمن (مدير
كلمات مرور + نسخة احتياطية) — **لا يوجد أي طريقة لاستعادته لو ضاع**.

```bash
keytool -genkeypair -v \
  -keystore ehsmaha-release.keystore \
  -alias ehsmaha \
  -keyalg RSA -keysize 2048 -validity 10000
```

سيسألك عن كلمة مرور الـ keystore، وكلمة مرور المفتاح (يمكن أن تكون نفس
القيمة)، واسمك/منظمتك (أي قيم، لا تؤثر على عمل التطبيق). احتفظ بالقيم
الأربع التالية — ستحتاجها للبناء والنشر:

- مسار ملف الـ keystore (`ehsmaha-release.keystore`)
- `storePassword`
- `keyAlias` (هنا `ehsmaha`)
- `keyPassword`

### التوقيع محلياً

أنشئ ملف `mobile/android/keystore.properties` (مُتجاهَل في `.gitignore` —
لا يُرفع للمستودع أبداً):

```properties
storeFile=/المسار/الكامل/لـ/ehsmaha-release.keystore
storePassword=كلمة_مرور_الـkeystore
keyAlias=ehsmaha
keyPassword=كلمة_مرور_المفتاح
```

ثم:

```bash
cd mobile
npm run build:release
```

الناتج: `mobile/android/app/build/outputs/apk/release/app-release.apk`
(موقَّع وجاهز للتوزيع مباشرة).

### التوقيع عبر GitHub Actions (بدون كتابة كلمات المرور بالكود)

لا يُرفع الـ keystore أو كلمات المرور كنص عادي أبداً — تُحفَظ كـ **GitHub
Secrets** (مشفَّرة، لا يراها أحد حتى مطوّري المستودع، تُستخدم فقط أثناء
تشغيل الـ workflow):

1. حوّل ملف الـ keystore إلى Base64:
   ```bash
   base64 -w0 ehsmaha-release.keystore > keystore.base64.txt   # Linux
   base64 -i ehsmaha-release.keystore -o keystore.base64.txt   # macOS
   ```
2. في GitHub: افتح المستودع → **Settings → Secrets and variables →
   Actions → New repository secret**، وأضف 4 أسرار:
   - `EHSMAHA_KEYSTORE_BASE64` — محتوى `keystore.base64.txt` كاملاً
   - `EHSMAHA_KEYSTORE_PASSWORD` — كلمة مرور الـ keystore
   - `EHSMAHA_KEY_ALIAS` — الاسم المستعار (`ehsmaha` هنا)
   - `EHSMAHA_KEY_PASSWORD` — كلمة مرور المفتاح
3. احذف `keystore.base64.txt` من جهازك بعد الرفع (أو احفظه بمكان آمن منفصل
   عن المستودع) — لا تتركه بمجلد المشروع.

الـ workflow (`.github/workflows/android-release.yml`) يقرأ هذه الأسرار،
يعيد بناء ملف الـ keystore مؤقتاً أثناء البناء فقط، ويحذفه فور انتهاء
البناء (خطوة `Clean up keystore`) — لا يبقى أي أثر له في السجلّات أو
النِتاج المنشور.

## APK مقابل AAB — ولماذا APK هنا

- **AAB (Android App Bundle):** الصيغة التي يطلبها Google Play حصراً — يبني
  Google نفسه من الـ AAB نسخ APK محسَّنة لكل جهاز عند التثبيت من المتجر. **لا
  يصلح للتوزيع المباشر** لأنه ليس ملف تثبيت قابل للتشغيل مباشرة على الجهاز.
- **APK (Universal):** ملف تثبيت واحد كامل يعمل على أي جهاز أندرويد يدعمه
  (`minSdkVersion 24` هنا)، يمكن تحميله وتثبيته مباشرة بدون أي وسيط. هذا ما
  نبنيه (`assembleRelease`) لأن الهدف توزيع مباشر برابط خارج Google Play.

## البناء والنشر

```bash
cd mobile
npm install

# APK تجريبي (debug) — بدون توقيع إنتاج، للفحص السريع فقط:
npm run build:debug

# APK إنتاج موقَّع (يحتاج keystore.properties محلياً أو تشغيل عبر CI):
npm run build:release
```

### النشر التلقائي عبر GitHub Actions (الطريقة المفضّلة)

بعد ضبط الأسرار الأربعة أعلاه مرة واحدة:

```bash
git tag v1.0.0
git push origin v1.0.0
```

هذا يشغّل `.github/workflows/android-release.yml` على `ubuntu-latest` (يأتي
بـ Android SDK جاهزاً)، يبني، يوقّع، وينشر APK إلى **نفس** GitHub Release
الذي يستخدمه تطبيق سطح المكتب (تاج `v1.0.0` نفسه) — فيصير عندك إصدار واحد
فيه كل الملفات: `ehsmaha-setup.exe`، `ehsmaha-x64.dmg`، `ehsmaha-arm64.dmg`،
و`ehsmaha.apk`.

يمكن أيضاً تشغيله يدوياً من تبويب **Actions** بدون رفع تاج (يستخدم رقم
الإصدار من `android/app/build.gradle` تلقائياً لتحديد نفس الإصدار).

**شكل رابط التحميل المباشر النهائي (ثابت للأبد، يشير دائماً لآخر نسخة):**

```
https://github.com/RM70N/ehsmaha/releases/latest/download/ehsmaha.apk
```

اسم الملف بدون رقم إصدار عمداً (`ehsmaha.apk` وليس `ehsmaha-1.0.0.apk`) —
بنفس منطق تطبيق سطح المكتب بالضبط، حتى يبقى هذا الرابط صالحاً للأبد بلا أي
تعديل مستقبلي على الموقع.

### البديل: استضافة APK على نفس دومين الموقع (Firebase Hosting)

```bash
cp mobile/dist/ehsmaha.apk /path/to/firebase-hosting/public/download/ehsmaha.apk
firebase deploy --only hosting
```

الرابط عندها: `https://ehsmaha.com/download/ehsmaha.apk`

**المزايا:** رابط من نفس نطاق الموقع الرسمي — بعض متصفحات أندرويد
وGoogle Play Protect يتعاملان بثقة أكبر مع روابط APK من نطاق مألوف
ومُصادَق (نفس دومين موقعك الفعلي) مقارنة برابط `github.com` خارجي، مما قد
يقلّل تحذيرات "ملف قد يكون ضاراً" عند التحميل من متصفح Chrome على الجوال.

**العيوب:** رفع يدوي بالكامل مع كل إصدار (لا ربط تلقائي مع GitHub Actions
إلا بإضافة خطوة نشر إضافية بنفسك)، ولا يستفيد تنبيه التحديث داخل التطبيق
(`UpdateChecker.java`) من هذا المسار تلقائياً — هو مبني على GitHub Releases
API مباشرة؛ لو غيّرت مصدر التوزيع لـ Firebase Hosting فقط، عدّل
`LATEST_RELEASE_API`/`APK_DOWNLOAD_URL` في `UpdateChecker.java` ليطابق.

**التوصية:** نفس توصية سطح المكتب — استخدم GitHub Releases كمصدر أساسي
(جاهز بالكامل، تحديث تلقائي، بناء تلقائي)، وزر "تحميل" في الموقع نفسه
(`ehsmaha.com`) يشير لرابط GitHub الثابت — تحصل على واجهة موقعك الرسمي
بدون التضحية بالأتمتة.

## تنبيه التحديث داخل التطبيق

بما أن التطبيق خارج Google Play، لا يوجد تحديث تلقائي عبر متجر. عند كل
إقلاع، `MainActivity` يستدعي `UpdateChecker.fetchLatestReleaseTag()` (طلب
GitHub API بسيط، `org.json` المدمجة بأندرويد — بدون أي مكتبة إضافية)،
يقارنه بإصدار التطبيق المثبَّت (`PackageManager`)، ولو كان أحدث يعرض شريطاً
أرجوانياً أعلى الشاشة لمدة 10 ثوانٍ مع رابط تحميل مباشر لأحدث APK. فشل
الشبكة أثناء هذا التحقق صامت تماماً (لا يزعج المستخدم).

## الأمان

- لا مفاتيح API إضافية غير الموجودة أصلاً داخل `index.html` العام — التطبيق
  لا يحمل أي سرّ خاص به على الإطلاق.
- `android:usesCleartextTraffic="false"` — الموقع بالكامل HTTPS فلا حاجة
  لأي استثناء.
- Content-Security-Policy: **لا يوجد CSP مخصَّص من التطبيق** لأن الصفحة تُحمَّل
  بأصلها الحقيقي (`https://ehsmaha.com`)، فتخضع لأي CSP يرسله سيرفر الموقع
  نفسه (headers) دون أي تدخل إضافي من التطبيق — هذا خلاف نسخة سطح المكتب
  التي احتاجت CSP مخصّصاً بسبب `localhost`.
- أدوات تصحيح WebView (`WebView.setWebContentsDebuggingEnabled`) مضبوطة
  `false` في نسخة الإنتاج عبر `capacitor.config.ts`
  (`android.webContentsDebuggingEnabled: false`).
- كلمات مرور التوقيع لا تُكتب بالكود أبداً — تُقرأ من `keystore.properties`
  المحلي (مُتجاهَل بـ git) أو من GitHub Secrets فقط.

## قبل أول نشر فعلي — تحقّق من هذه النقاط

1. أنشئ الـ keystore (أعلاه) واحفظه بأمان دائم — **لا بديل عنه لاحقاً**.
2. أضف الأسرار الأربعة في GitHub Secrets قبل أول تشغيل لـ
   `android-release.yml`، وإلا سيفشل البناء بخطأ واضح يشرح ما ينقص.
3. لو غيّرت `applicationId` (`com.ehsmaha.app`) لاحقاً، حدّثه في
   `capacitor.config.ts` و`android/app/build.gradle` معاً — يجب أن يبقيا
   متطابقين دائماً، وتغييره بعد أول نشر يعني أن المستخدمين لن يقدروا
   يحدّثوا فوق التثبيت القديم (سيُعتبر تطبيقاً مختلفاً تماماً من منظور أندرويد).
