# اختبارات مسار تيك توك ← سيرفر الجسر ← المتصفح ← الألعاب

كل الاختبارات تشغّل `tiktok-server/server.js` **الحقيقي** بدون تعديل، مع استبدال
مكتبة `tiktok-live-connector` فقط بـ`fake-connector.js` (أحداث الشات تُبنى بترميز
Protobuf حقيقي من نفس تعريفات المكتبة). المتصفح (Playwright) يفتح `index.html`
من المستودع، وروابط `wss://ehsmaha-wbkn.onrender.com/ws` و`wss://ehsmaha.onrender.com/ws`
تُعاد كتابتها لسيرفرين محليين (أساسي 18081، احتياطي 18082).

```bash
cd tiktok-server && npm install --ignore-scripts && cd ..
tests/bridge/servers.sh start            # السيرفران الوهميان
node tests/bridge/scenarios.js all       # قياسات: follow/listeners/outage/load/sockets
node tests/bridge/all-games.js           # الـ30 لعبة: ربط ← فتح ← انضمام ← لعب ← رجوع
node tests/bridge/normalize.test.js      # تطبيع الكلمة والأرقام (28 حالة)
node tests/bridge/diag.test.js           # لوحة التشخيص: سبب كل محاولة انضمام
node tests/bridge/platforms-smoke.test.js  # تويتش/كيك/يوتيوب/ديسكورد
tests/bridge/servers.sh stop
# بروتوكول السيرفر وحمله (سيرفر مستقل):
BRIDGE_HEARTBEAT_MS=1000 PORT=18091 CTL_PORT=19091 node tests/bridge/start-server.js &
node tests/bridge/server-protocol.test.js
TIKTOK_FREE_RATE_PER_MIN=6000 TIKTOK_CONNECT_BURST=50 TIKTOK_CONNECT_INFLIGHT=50 PORT=18093 CTL_PORT=19093 node tests/bridge/start-server.js &
node tests/bridge/server-load.test.js 20 15 20 15   # (معدل الطابور مرفوع هنا حتى يتصل الـ20 ستريمر فوراً)
# عقد الجسر + التعافي: غلاف messages، أفتار https، اتصال واحد لعميلين، /health،
# تصنيف أخطاء 2.5.0 (offline/not_found/blocked/sign_failed/429)، التراجع، بوابة 429 المشتركة:
EULER_API_KEY=dummy-test-key PORT=18095 CTL_PORT=19095 node tests/bridge/start-server.js &
T_PORT=18095 T_CTL=19095 node tests/bridge/bridge-contract.test.js
# الواجهة: حذف حقل مفتاح EulerStream بفعالية 100 + extractUser (بدون سيرفرات):
node tests/bridge/frontend-contract.test.js
```

## الصفحة الرئيسية (تصميم Lobby)

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/lobby.test.js   # 62 فحصاً، بدون سيرفرات
```
يفتح `index.html` الحقيقي ويتحقق: حذف التصميم القديم، الشبكة (30 بطاقة، المدفع البشري أولها) مرسومة من سجل `#pg-home .games-grid .gcard`
بنفس الترتيب والأسماء، البحث والفلاتر (تطبيع عربي)، نافذة التفاصيل (كيبورد/Escape/تثبيت التركيز)،
زر "ابدأ اللعبة" يستدعي دالة كل لعبة من الـ30، شارات المالك والصيانة والترتيب والتثبيت، أوضاع اللعب،
شارة الاتصال/العدّاد/الفعالية/ديسكورد، الكتلة العلوية اليمنى، الجوال (bottom-sheet وأهداف اللمس)،
وتقليل الحركة، وهروب HTML، وظهور لعبة جديدة تُضاف للسجل تلقائياً.

## المدفع البشري (لعبة ثلاثية الأبعاد)

```bash
tests/bridge/servers.sh start
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/cannon.test.js
```
رحلة كاملة عبر سيرفر الجسر الحقيقي: الكرت أول لعبة بالمكتبة بتصميم ملف الكرت، شاشة الإعداد (القيم الافتراضية والمعاينة الحيّة)،
ربط البث من نافذة الربط السريع مع استئناف اللعبة تلقائياً، الانتظار (انضمام بصيَغ الكلمة، شرط الفولو، طرد، ريست، المؤقّت)،
الراوند داخل iframe (Three.js): أوامر «زاوية قوة» وقصّ الزاوية، هدايا البث كقوى، رميات متعددة، انضمام متأخر، نافذة العقوبة،
الفائز يُسجَّل بلوحة المتصدرين ثم الرجوع لجولة جديدة، الخروج، وفشل تحميل Three.js.
Three.js يُحمَّل من CDN بالموقع؛ بيئة الاختبار تخدمه محلياً من `fixtures/three-r128` (نفس ملفات r128) عبر `harness.routeThree`.

## «لاعب متأخر» (كل ألعاب الستريمر الـ31)

```bash
tests/bridge/servers.sh start
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright CYCLES=5 node tests/bridge/late-join.test.js   # أو: ... late-join.test.js main,cr,chairs
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/late-join-extra.test.js
```
لكل لعبة: بدء جولة ← زر «لاعب متأخر» واحد بلوحتها ← بدون تفعيل لا يدخل أحد (الألعاب غير المفتوحة) ← النافذة (الكلمة الفعلية،
مربعة #160F22) ← المتأخر يدخل كلاعب حقيقي ومدمج بمنطق اللعبة (طابور/دور/خانة/مسار/عجلة/بطاقة…) ← تكرار ×7 مع تغيير الاسم
بلا تكرار ← من أُقصي/خرج بالجولة لا يرجع ← إيقاف الاستقبال فعلي ← دفعة ٢٥ متأخر متزامنين ← تغيير الكلمة ← جولة جديدة تصفّر
الأهلية. الإضافي: ١٠٠ متأخر دفعة وحدة (أداء وإشعار مجمّع)، انقطاع البث، شرط الفولو، طلبات معلّقة تسقط عند الإيقاف/انتهاء
الجولة (الكرسي)، التنقّل بين ١٠ ألعاب بلا تكرار أزرار/معالجات، والجوال (390px).
مفاتيح اختبار فقط: `window.CANNON_ENTRY_SECONDS` (مدة نافذة الأوامر، الافتراضي 14) و`window.CANNON_TICK_MS` (تسريع عدّاد الانضمام).

## شاشات ألعاب الستريمر (تصميم Game Screens)

```bash
tests/bridge/servers.sh start
PLAYWRIGHT_PATH=... node tests/bridge/game-screens.test.js         # 19 فحصاً: الهيكل، الألوان، المعاينة الحيّة، لعب حقيقي (قنبلة)، الجوال
PLAYWRIGHT_PATH=... node tests/bridge/game-shots.js /tmp/shots 14   # لقطات انتظار/راوند لكل الـ30 لعبة للمراجعة البصرية
```

## طابور الاتصال والتعافي (شكوى "خدمة تيك توك مزدحمة… انتظر دقيقة")

```bash
cd tiktok-server && npm test                 # وحدات: backoff، مصنّف الأخطاء، قاطع الدائرة، المحدّد التكيّفي، الطابور، المزودون (42)
node tests/bridge/queue-resilience.test.js   # تكامل (53): 429/5xx/مهلة/سيرفر توقيع واقع/رفض ثم نجاح، فشل نهائي وتعافٍ، مزودون بديلون،
                                             #   اتصال واحد لكل يوزر (ضغطتان/ريفرش/إغلاق ثم فتح)، انقطاع وصمت upstream، طابور 40 ستريمر
node tests/bridge/real-library.test.js       # بالمكتبة الحقيقية 2.5.0 + سيرفر Euler محاكى عبر HTTP حقيقي: 429/402/5xx/ECONNREFUSED/تعليق،
                                             #   مفتاح ثانٍ، عنوان بديل، بروكسي (HTTP+WS)، قطع الويب سوكيت
PLAYWRIGHT_PATH=... node tests/bridge/frontend-resilience.test.js   # الواجهة الحقيقية: لا رسالة فشل أثناء 429 طويل، تقدّم ظاهر،
                                             #   فشل نهائي + زر "إعادة المحاولة" (المسارات الثلاثة لـ"ابدأ بثاً سريعاً")
node tests/bridge/queue-load.test.js 50,200,500 --baseline --out=tests/bridge/results-queue-load.json   # حمل: قبل/بعد
```
`QUEUE-REPORT.md`: التقرير الكامل مع الأرقام.

Playwright غير مثبّت محلياً بالمستودع: مرّر مساره بـ`PLAYWRIGHT_PATH` (مثلاً
`/opt/node22/lib/node_modules/playwright`).

- `start-server.js` يفتح منفذ تحكم (19081/19082): `POST /ctl` بأوامر `chat/burst/mode/dropUpstream/...`، و`GET /stats`.
- `results-before.json` / `results-after.json`: القياسات قبل وبعد الإصلاحات.
- `REPORT.md`: التقرير الكامل. `MANUAL-TEST.md`: اختبار البث الحقيقي.

## مؤقّتات جولة قديمة بعد الريست/الخروج

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/stale-timers.test.js
```
اعثر على الكورة: ريست/خروج أثناء الإخفاء أو الخلط لا يرمي أخطاء ولا يقلب الحالة، والجولة التالية تكمل طبيعياً.
الطريق الزجاجي: الخروج أثناء كشف الإجابة أو السؤال لا يبدأ سؤالاً جديداً بالخلفية ولا يفتح شاشة الفوز فوق صفحة ثانية.
(على النسخة السابقة: 2/7 — بعد الإصلاح: 7/7.)

## القنبلة المتحركة 3D

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/bomb3d.test.js
```
اللعبة بإطار مستقل (`bomb3d.html`) مثل الروليت 3D. الاختبار عبر سيرفر الجسر الحقيقي: الكرت وفلتر 3D، الإعداد، الانضمام بالكلمة (صيغ/فولو/طرد)،
**التمرير بكتابة رقم اللاعب فقط** (المنشن، اسم اللاعب، رقم مع كلام، رقمك أنت، رقم غير موجود، ٥ خانات، من غير الحامل: كلها تُتجاهل؛
الأرقام العربية والمسافات الجانبية وباقي المنصات تُقبل)، الانفجار والإقصاء والفائز، الحصانة والإنعاش بالهدايا، «لاعب متأخر» (زر اللعبة ← نافذة المنصة
الموحّدة، إيقاف/تشغيل فعلي، دفعة ٣٠، لا عودة لمُقصى/مطرود)، الخروج وإعادة التشغيل بلا تكرار معالجات، وبدون أخطاء JS. (يحتاج `fixtures/three-r128` شاملة BokehPass/BokehShader.)

## خمن الرسمة (واجهة اللوحة الجديدة + محرك الرسم)

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/draw-game.test.js          # كل الدورات
ONLY=2,5 PLAYWRIGHT_PATH=... node tests/bridge/draw-game.test.js                                    # دورات محدّدة
```
متصفح Chromium حقيقي: الرسم بأحداث ماوس/لمس حقيقية (Playwright + CDP touch) والمخرجات تُقرأ من بكسلات اللوحة نفسها؛
الدردشة عبر سيرفر الجسر المحلي المزيّف (بروتوكول WebSocket حقيقي لكن رسائل الشات **محاكاة** — ليس بثاً حقيقياً على تيك توك).
الدورات: ١ مسار الستريمر الكامل (إعداد/مشاركون/رسم/تخمين/فوز/لعبة جديدة/سرّية الإجابة) — ٢ الأشكال والتحديد والتراجع والإعادة
والمسح — ٣ الأدوات الحرة والألوان وHEX والتعبئة والقطّارة والنص وتصدير PNG — ٤ الشاشات (سطح مكتب/جوال/دوران/DPR) والتكبير والتبديل
— ٥ لمس/قلم/إلغاء/تمرير/اختصارات/إتاحة/حركة مخفّضة/تنظيف المستمعات — ٦ الإدارة (طرد/مغادرة/فوز إجباري/ريست/لاعب متأخر) وغياب كل toast
مع بقاء نظام التوست العام سليماً — ٧ الأداء.

## شاشة الفوز الجديدة (EhsemhaWin) لألعاب الستريمر

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/win-screen.test.js
```
الـ26 لعبة داخل `index.html` تُطلَق بدالتها الأصلية ثم تُستدعى دالة الفوز الأصلية لكل لعبة، ويُفحص: الاسم/الصورة/النص المساعد/الأزرار،
حذف الشاشة القديمة، سلوك الزر الأول، فائزون متعددون (ضربة الحظ)، بلا فائز، حقن HTML، جوال عمودي/أفقي، الإتاحة، تقليل الحركة، ولعب فعلي كامل (اوجد الكلمة).
القنبلة المتحركة (داخل `bomb3d.html`) تُفحص ضمن `bomb3d.test.js`.

## شد الحبل 3D (tug3d.html داخل iframe)

```bash
PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/tug3d.test.js
```
حذف النسخة القديمة بالكامل (الصفحات/الدوال/معاينة gs) التحقق من الإعداد (7 أخطاء)، الانضمام والسحب بالشات
(جسر مزيّف)، بوابة المتابعة، فوز بالعقدة/بالوقت/تعادل، نقاط كل عضو مرة واحدة، شاشة النتيجة وأزرارها، اللاعب المتأخر المركزي،
أوامر المالك والطرد والريست، الخروج بلا بقايا وعدم تكرار المعالجات، الجوال والدوران، والملف المستقل.
