# 👑 بوت احسمها — Discord Bot + API

بوت ديسكورد رسمي لمنصة **[احسمها](https://ehsmaha.com)** مبني بـ **Node.js + discord.js v14** (أوامر Slash فقط)، مرتبط مباشرة بقاعدة بيانات الموقع الفعلية (**Firebase — مشروع `streamgame-180b8`**) عبر طبقة API مستقلة (Express).

- **Application ID:** `1552260327008247879`
- **Node.js:** 22 أو أحدث (متطلب `firebase-admin` 14)

---

## 🧭 كيف تشتغل المنظومة

```
┌──────────────┐  x-api-key   ┌──────────────────────┐  Admin SDK  ┌──────────────────────────┐
│ بوت ديسكورد  │ ───────────▶ │ طبقة الـAPI (Express) │ ──────────▶ │ Firebase (Firestore/RTDB) │
│  (npm start) │   HTTPS      │  (npm run start:api)  │             │ نفس قاعدة بيانات الموقع    │
└──────────────┘              └──────────────────────┘             └──────────────────────────┘
```

- **بدون أي ربط حسابات:** كل أوامر اللاعب تاخذ **اليوزرنيم** مباشرة (`/بروفايل يوزر: ahmed_1`)، والبوت يبحث عنه بقاعدة بيانات الموقع ويعرض بياناته — لك أو لأي لاعب ثاني.
- **البوت** ما يتصل بقاعدة البيانات مباشرة — كل شي عبر الـAPI بمفتاح سري (`x-api-key`)، مع مهلة 5 ثوانٍ وإعادة محاولة وحدة.
- **الـAPI** يقرأ بيانات الموقع الحقيقية (`usernames`، `users`، `levels`، `leaderboards`، `streamerEvents`...) وما يكتب إلا عدّاداته الخاصة (`discordApiStats`، `discordWeeklyBaselines`).

### كيف يشتغل البحث باليوزرنيم
1. تنظيف المدخل: حذف الفراغات الزائدة والرموز المخفية و`@` بالبداية، توحيد الحروف العربية (NFC)، وتحويله لأحرف صغيرة — يعني **البحث case-insensitive**.
2. حساب مسجّل بالموقع: `usernames/{usernameLower}` ← `users/{uid}` (نفس فهرس اليوزرات بالموقع)، واحتياطاً استعلام `users.usernameLower`.
3. لو ما لقى حساب: يدور على **لاعب بث** بدون حساب (متابع تيك توك/كيك/يوتيوب له سجل بـ`levels`) — فتقدر تعرض بيانات أي متابع لعب ببث.
4. ما لقى شي ← رسالة: *"لم يتم العثور على لاعب بهذا الاسم، تأكد من كتابته بشكل صحيح كما هو مسجل بالموقع"*.

اليوزرنيم يُرسل بالرابط مشفّراً (`encodeURIComponent`، UTF-8) فالأسماء العربية والرموز تشتغل بأمان.

**Autocomplete:** أثناء كتابة خيار `يوزر` تطلع حتى 25 اقتراح من الموقع (👤 حساب مسجّل، 🎮 لاعب بث) تبدأ بنفس الحروف. لو الـAPI بطيء أو طايح، القائمة تطلع فاضية بس والأمر نفسه يشتغل عادي.

---

## 📁 هيكل المشروع

```
discord-bot/
├── index.js                 # تشغيل البوت (معالجات أخطاء عامة، تحميل ديناميكي، إيقاف نظيف)
├── deploy-commands.js       # تسجيل أوامر Slash (عالمي / سيرفر تطوير)
├── config.js                # إعدادات البوت + التحقق من .env عند الإقلاع
├── commands/                # كل ملف = أمر (يُحمَّل تلقائياً)
│   ├── profile/  stats/  leaderboard/
│   ├── site/  help/  events/  admin/
├── events/                  # ready, interactionCreate, error, warn, connection (disconnect/reconnecting)
├── utils/                   # apiClient, embedBuilder, cache, logger, rateLimiter, permissions, ...
├── database/                # الاتصال بـFirebase (Admin SDK) + أسماء المجموعات وشرح المخطط
├── api/                     # طبقة الـAPI (Express)
│   ├── server.js  config.js  errors.js
│   ├── routes/discord.js    # كل مسارات /api/discord
│   ├── middleware/          # مصادقة x-api-key، معالج الأخطاء
│   ├── services/            # players (بحث/بروفايل/إحصائيات/اقتراحات), leaderboard, events, admin, levels, games
│   └── jobs/                # لقطة XP الأسبوعية
├── scripts/check.js         # فحص الأوامر قبل النشر
├── tests/                   # اختبارات (وحدات + مسارات البوت + تكامل مع Firebase Emulator)
├── render.yaml              # Blueprint لـRender
└── .env.example
```

---

## ⚙️ التثبيت المحلي

```bash
cd discord-bot
npm install
cp .env.example .env      # ثم عبّي القيم (الجدول تحت)
npm run check             # فحص الأوامر بدون اتصال
```

شغّل الخدمتين (كل وحدة بطرفية):

```bash
npm run start:api         # طبقة الـAPI على http://localhost:3000
npm start                 # البوت
```

> محلياً خل `API_BASE_URL=http://localhost:3000`.

---

## 🔑 متغيرات البيئة

| المتغير | الخدمة | مطلوب | الوصف |
|---|---|---|---|
| `API_KEY` | الاثنين | ✅ | مفتاح سري مشترك (32+ حرف) — **نفس القيمة** بالخدمتين. توليده: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `DISCORD_TOKEN` | البوت | ✅ | توكن البوت من Developer Portal → Bot |
| `CLIENT_ID` | البوت | ✅ | `1552260327008247879` |
| `API_BASE_URL` | البوت | ✅ | رابط خدمة الـAPI، مثال `https://ehsmaha-discord-api.onrender.com` |
| `GUILD_ID` | البوت | — | سيرفر التطوير (تسجيل فوري للأوامر) |
| `ADMIN_IDS` | البوت | — | معرّفات ديسكورد للأوامر الإدارية (مفصولة بفاصلة) |
| `SITE_URL` | الاثنين | — | الافتراضي `https://ehsmaha.com` |
| `LOGO_URL` | البوت | — | شعار الفوتر (الافتراضي `SITE_URL/discord-logo.png`) |
| `COMMAND_COOLDOWN_MS` | البوت | — | أمر واحد لكل مستخدم كل (افتراضي 3000) |
| `API_TIMEOUT_MS` | البوت | — | مهلة طلبات الـAPI (افتراضي 5000) |
| `LEADERBOARD_CACHE_SECONDS` | البوت | — | كاش المتصدرين بالبوت (افتراضي 90) |
| `FIREBASE_SERVICE_ACCOUNT` | الـAPI | ✅ | ملف Service Account (JSON كامل بسطر واحد أو base64) — أو محلياً `GOOGLE_APPLICATION_CREDENTIALS` (مسار الملف) |
| `FIREBASE_DATABASE_URL` | الـAPI | — | Realtime Database (تُدمج منها بيانات اللفلات الاحتياطية) |
| `API_LEADERBOARD_CACHE_SECONDS` | الـAPI | — | كاش المتصدرين بالسيرفر (افتراضي 120) |
| `WEEK_START_DAY` / `TIMEZONE_OFFSET_MINUTES` | الـAPI | — | بداية الأسبوع (0=الأحد) وتوقيته (180 = السعودية) |
| `LOG_LEVEL` | الاثنين | — | `error` / `warn` / `info` / `debug` |

لو ناقص أي متغير مطلوب، الخدمة **توقف فوراً** برسالة تحدد كل الناقص.

### جلب Service Account لـFirebase
Firebase Console → ⚙️ Project settings → **Service accounts** → **Generate new private key**. لصقه على Render:
```bash
base64 -w0 service-account.json   # الصق الناتج بقيمة FIREBASE_SERVICE_ACCOUNT
```
> ⚠️ هذا المفتاح يعطي صلاحية كاملة على قاعدة البيانات — لا ترفعه للمستودع ولا تشاركه.

---

## 📝 تسجيل الأوامر

```bash
npm run deploy-commands:guild   # سيرفر التطوير فقط (GUILD_ID) — يظهر فوراً، للتجربة
npm run deploy-commands         # عالمياً لكل السيرفرات (قد يأخذ حتى ساعة)
npm run clear-commands:guild    # مسح أوامر سيرفر التطوير (لتفادي ظهور الأوامر مكررة)
```

سجّل الأوامر من جديد **كل ما** أضفت/عدّلت اسم أمر أو خياراته. (تعديل منطق التنفيذ فقط ما يحتاج.)
التسجيل يستبدل القائمة كاملة، فأي أمر قديم انحذف من `commands/` ينشال من ديسكورد تلقائياً.

### دعوة البوت للسيرفر
البوت يطبع رابط الدعوة بالسجل عند الإقلاع، أو استخدم:
```
https://discord.com/oauth2/authorize?client_id=1552260327008247879&scope=bot%20applications.commands&permissions=281600
```
الصلاحيات: View Channels, Send Messages, Embed Links, Use External Emojis. البوت يفحصها بكل سيرفر عند الإقلاع ويحذّر بالسجل لو ناقصة.

---

## 🚀 النشر على Render

### الطريقة السريعة (Blueprint)
1. Render Dashboard → **New → Blueprint** → اختر المستودع.
2. **Blueprint Path:** `discord-bot/render.yaml`
3. عبّي القيم السرية اللي يطلبها (`API_KEY` نفسه بالخدمتين، `DISCORD_TOKEN`، `FIREBASE_SERVICE_ACCOUNT`، `ADMIN_IDS`).

### يدوياً
**1) خدمة الـAPI** — New → **Web Service**
- Root Directory: `discord-bot`
- Build: `npm ci --omit=dev` — Start: `npm run start:api`
- Health Check Path: `/health`
- المتغيرات: `API_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `FIREBASE_DATABASE_URL`, `NODE_ENV=production`

**2) خدمة البوت** — New → **Background Worker** (مستحسن: اتصال دائم)
- Root Directory: `discord-bot`
- Build: `npm ci --omit=dev` — Start: `npm start`
- المتغيرات: `DISCORD_TOKEN`, `CLIENT_ID`, `API_KEY`, `API_BASE_URL` (رابط خدمة الـAPI)، `ADMIN_IDS`, `NODE_ENV=production`

> **الخطة المجانية:** ما فيها Background Workers، والـWeb Service المجانية "تنام" بعد 15 دقيقة بلا طلبات.
> - الـAPI: البوت يرسل له نبضة كل 10 دقائق فيبقى صاحي تلقائياً.
> - البوت كـWeb Service: يفتح `/health` تلقائياً على `PORT` — لازم خدمة خارجية (مثل UptimeRobot) تطلب رابطه كل 5 دقائق، وإلا ينقطع. للاستقرار الأفضل استخدم Worker مدفوع.

**3) بعد النشر**
- شغّل `npm run deploy-commands` مرة وحدة (من جهازك بنفس `.env`، أو Render Shell).

### التعديلات على الموقع (index.html)
- تسجيل **`bestRoundPoints`** (أعلى نقاط بجولة واحدة) بحساب اللاعب عند فوز الأونلاين — يظهر بـ`/احصائيات`.
- رابط `ehsmaha.com/profile` (زر "فتح الموقع" بالبوت) يفتح صفحة البروفايل بعد تسجيل الدخول.
- `discord-logo.png` بجذر الموقع: شعار فوتر الرسائل.

لا تحتاج أي تعديل على `firestore.rules`: الـAPI يقرأ بـAdmin SDK من السيرفر، ومجموعاته الخاصة مقفلة أمام المتصفحات بالقاعدة العامة بآخر الملف.

---

## 🤖 الأوامر

| الأمر | الوصف |
|---|---|
| `/بروفايل يوزر:<اليوزرنيم>` | الأفتار، اللفل، شريط XP (▰▰▰▱▱)، النقاط، الألعاب، تاريخ الانضمام + زر "عرض الإحصائيات" وزر "فتح الموقع" |
| `/احصائيات يوزر:<اليوزرنيم>` | الانتصارات، الهزائم، معدل الفوز، أكثر لعبة، أعلى نقاط بجولة، الترتيب العام، آخر الألعاب |
| `/المتصدرين [نوع]` | عام/أسبوعي — ميداليات 🥇🥈🥉، 10 بالصفحة، أزرار السابق/التالي (حتى 50 لاعب) |
| `/احسمها` · `/الموقع` | نبذة عن المنصة + زر "زيارة الموقع" |
| `/مساعدة` | كل الأوامر مقسمة لفئات |
| `/احداث` | الفعاليات النشطة (أفضل ستريمر، عدد جديد) أو "لا توجد فعاليات نشطة حالياً" |
| `/ادمن_احصائيات` | 🛡️ للإدارة: حسابات الموقع، اللاعبين النشطين اليوم، استدعاءات الـAPI، استخدام البوت |

**أمثلة:**
```
/بروفايل يوزر: ahmed_1
/احصائيات يوزر: AHMED_1        ← نفس النتيجة (الحروف الكبيرة والصغيرة سواء)
/احصائيات يوزر: @أحمد_تيك      ← لاعب بث بيوزر عربي
```

### كيف تنحسب الأرقام (من بيانات الموقع الفعلية)
- **اللفل/XP/الجولات:** من `levels/{key}` بنفس معادلة الموقع بالضبط (`30 × level^1.5`). لو اللاعب رابط تيك توك، له سجلان (يوزر الموقع + تيك توك) ويُعرض الأعلى — مثل الموقع.
- **النقاط:** `users.onlinePoints` (لاعب البث بدون حساب بالموقع: النقاط والفوزات الفردية/الأونلاين = 0 لأنها خاصة بالحسابات).
- **الانتصارات:** فوزات فردي (`soloWinCount`) + أونلاين (`onlineWinCount`) + فوزات البث بكل قوائم الستريمرز (`leaderboards`).
- **الهزائم:** الموقع ما يسجّل خسارة صريحة، فكل جولة لعبها بدون فوز = هزيمة (`الجولات − الانتصارات`).
- **الترتيب العام:** ترتيب اللاعب بالـXP بين كل لاعبي `levels`.
- **المتصدرين الأسبوعي:** الموقع ما يخزن XP أسبوعي، فالـAPI ياخذ **لقطة XP** لكل اللاعبين مع بداية كل أسبوع (الأحد 00:00 بتوقيت السعودية) ويحسب الفرق. أول أسبوع بعد النشر يبدأ من لحظة التشغيل ويوضّح ذلك بالرسالة.
- **أعلى نقاط بجولة:** يبدأ التسجيل من تاريخ نشر تعديل الموقع (ما فيه بيانات تاريخية له).

---

## ➕ إضافة أمر جديد

1. أنشئ ملف داخل `commands/` (بأي مجلد فرعي)، مثلاً `commands/fun/ping.js`:

```js
'use strict';
const { SlashCommandBuilder } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');

module.exports = {
  data: new SlashCommandBuilder().setName('بينق').setDescription('يختبر سرعة استجابة البوت'),
  async execute(interaction) {
    const embed = eb.brand({ title: '🏓 بونق!', description: `${interaction.client.ws.ping}ms` });
    return respond.send(interaction, { embeds: [embed] });
  },
  // اختياري: معالجات أزرار حسب بادئة customId ("ping:...")
  // buttons: { ping: async (interaction, args) => { ... } }
};
```

2. `npm run check` للتأكد من الاسم والوصف.
3. `npm run deploy-commands:guild` للتجربة، ثم `npm run deploy-commands` للنشر.

**قواعد:** كل رد عبر `respond.send` (يتعامل مع defer/reply تلقائياً)، كل Embed عبر `embedBuilder` (الهوية الموحدة)، وكل طلب بيانات عبر `apiClient`. الأخطاء غير المتوقعة يلتقطها الموزّع المركزي ويرد برسالة ودّية.

أمر يحتاج يوزرنيم؟ استخدم `addUsernameOption` و`readUsername` و`notFoundPayload` و`autocompleteUsernames` من `utils/player.js` (نفس ما يستخدمه `/بروفايل`).

لإضافة مسار API جديد: دالة بـ`api/services/` + مسار بـ`api/routes/discord.js` + دالة بـ`utils/apiClient.js`.

---

## 🧪 الاختبارات

```bash
npm test
```
- **وحدات:** مطابقة معادلة اللفلات مع `index.html` الفعلي، بداية الأسبوع، حجب الأسرار بالسجل، التحقق من البيئة، الـrate limiter.
- **مسارات البوت:** تفاعلات وهمية عبر الموزّع الحقيقي ضد API وهمي — لكل أمر لاعب: يوزر موجود / غير موجود / خطأ سيرفر / مهلة / سيرفر مطفّي، ويوزر عربي، والـAutocomplete، والصفحات، والصلاحيات، والـcooldown...
- **تكامل الـAPI مع Firebase Emulator** (يتخطى نفسه لو المحاكي مو شغّال): بحث case-insensitive، فراغات و`@`، يوزر عربي، ترميز رابط تالف، اقتراحات، المتصدرين العام والأسبوعي...

```bash
npx firebase-tools emulators:start --project demo-ehsmaha --only firestore
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
```

---

## 🛡️ الموثوقية والأمان
- `try/catch` حول كل تفاعل وكل معالج حدث؛ `unhandledRejection` / `uncaughtException` تُسجَّل بدون إيقاف العملية.
- رسائل الخطأ للمستخدم عامة وودّية فقط — التفاصيل التقنية بالسجل.
- السجلات (winston) تحجب تلقائياً التوكنات والمفاتيح وأي `Authorization`.
- Rate limit: أمر كل 3 ثوانٍ لكل مستخدم (البوت) + حد طلبات بالـAPI.
- كاش: المتصدرين (البوت 90ث، الـAPI 120ث)، الاقتراحات والفعاليات 60ث، فوزات البث 10د — مع منع الطلبات المتزامنة المكررة.
- إعادة الاتصال بـDiscord تلقائية، وكل مراحلها (disconnect/reconnecting/resume) مسجّلة.
- مقارنة `x-api-key` ثابتة الزمن؛ helmet؛ الـAPI للقراءة فقط على بيانات الموقع.

## 🔧 حل المشاكل
| المشكلة | الحل |
|---|---|
| الأوامر ما تظهر | `npm run deploy-commands` — وتأكد إن رابط الدعوة فيه `applications.commands` |
| الأوامر تظهر مرتين | سجّلتها عالمياً وبسيرفر التطوير: `npm run clear-commands:guild` |
| كل الأوامر ترد "حصل خطأ مؤقت" | الـAPI طايح أو `API_KEY` مختلف بين الخدمتين — راجع سجلات خدمة الـAPI و `/health` |
| "تأكد من DISCORD_TOKEN" بالسجل | التوكن غلط أو انعمل له Reset |
| "لم يتم العثور على لاعب" ليوزر موجود | اكتبه كما هو بالموقع (بدون الاسم الظاهر/النيكنيم) أو اختره من الاقتراحات |
| أوامر /ربط و/فك_ربط القديمة ظاهرة | شغّل `npm run deploy-commands` من جديد — التسجيل يستبدل القائمة ويحذفها |
