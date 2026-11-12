# INTEGRATION-MAP

كل الأنظمة المرتبطة بلوحة الإدارة، مصدر بياناتها، وكيف تُنفَّذ العمليات فيها، **وأدلة الفحص من الملفات الأصلية** (قراءة فقط — لم يُعدَّل أي ملف أصلي).

## 1) نتيجة فحص المشروعين (Discovery)

| البند | النتيجة |
|---|---|
| الموقع | `index.html` (~7MB) + ألعاب `*.html` + `owner-studio/` (لوحة المالك داخل الموقع) + `ops/` + `tiktok-server` (خادم ربط البث) + `firestore.rules` + `database.rules.json`. لم تكن هناك لوحة إدارة خارجية سابقة — اللوحة جديدة بالكامل. |
| البوت | `discord-bot/`: Node 22 + discord.js 14، 42 أمر Slash (يُقرأ سجلها فعلياً، 3 ملفات ألعاب أوامرها ديناميكية تظهر كـ«غير مفكوكة»)، API داخلية (Express + `x-api-key`)، قاعدة بوت **PostgreSQL أو SQLite**. |
| اختلاف النسختين | ملف البوت المستقل (zip) يحتوي **40 أمراً**؛ النسخة داخل مستودع الموقع **42** (تضيف `/اضافة ستريمر` و`/ازالة ستريمر` + `streamerAnnouncer` + migration 009). **النسخة المستقلة أقدم** وليست أحدث كما افترض الطلب — اللوحة تقرأ أي نسخة عبر `BOT_DIR` ولا تنقل افتراضات بين النسختين. |
| الموقع لا يملك | آلية حظر لاعبين/ستريمرز ولا تعطيل ألعاب (إلا شارة `maintenance`) — فاعتمدت اللوحة آليات خارجية حقيقية (تعطيل حساب Firebase، بوابة `bridgeStreamers`). |

## 2) مصادر بيانات الموقع (لا مجموعات بديلة — لا مصدر حقيقة موازٍ)

| النظام | المصدر الفعلي | دليل البنية في الكود الأصلي |
|---|---|---|
| اللاعبون | Auth `uid` ← Firestore `users/{uid}` + `usernames/{lower}` + `levels/{key}` (مفاتيح الموقع وتيك توك المربوط) | `discord-bot/api/services/players.js` (resolvePlayer) · `levels.js` (منحنى اللفل — نُسخ مطابقاً) |
| الحظر | **Firebase Auth `disabled` + `revokeRefreshTokens`** (الموقع لا يملك حقل حظر) | — |
| فك ربط تيك توك | حذف `users.linkedTiktokUsername` | `index.html` (`linkedTiktokUsername: fb.deleteField()`) |
| الرسائل | Firestore `broadcastMessages/current` + `personalMessages/{lower}` **و** RTDB `ownerMessages/*` | `index.html:22166` (`ownerSendBroadcastMessage` تكتب بالمسارين) |
| الأكواد | RTDB `secretCodes/{key}`؛ المفتاح = تطبيع `scodeCodeKey` (نُسخ حرفياً) | `index.html:13040-13100` |
| الإطارات | `levels.ownedFrames`/`levelFrames`/`activeFrame` · كتالوج مدمج (`FRAMES_CATALOG` — 22 إطاراً مستخرجة) + `framesCatalogExtra` | `index.html:31369-31400` (`framesGrantToUser`) |
| المتجر | `shopProducts/{id}` = `{name,type,price,durationHours,maxTotalPurchases,purchasedCount,createdAt,expiresAt}` · `storeSales` | `index.html:57012` |
| الستريمرز | `bridgeStreamers/{id}.enabled` (**يفحصه خادم الربط ويرفض الاتصال لو false**) · `activeStreamers/{gameTag}` | `tiktok-server/server.js:164-195` · `index.html:24264` |
| الفعاليات | `streamerEvents/{id}` (+`sessions`) و`streamerEventAnnouncements/current` (مرآة) و`event100/current` | `index.html:20821-20935` (إطلاق/إنهاء بحساب الفائزين) |
| إعدادات الألعاب | RTDB `opsConfig/current/{tag}={v,values,by,t}` + `opsConfig/history` (إصدار متفائل) · مخطط `MOD_SETTINGS_SCHEMA` (18 لعبة — لقطة مستخرجة بالسكربت `extract-site-schema`) | `owner-studio/ops-config.js` · `index.html:19216` |
| صيانة/شارات الألعاب | `gameBadges/{tag}.badge ∈ {new,update,none,maintenance}` (`maintenance` يعطّل البطاقة) | `index.html:21170, 10441, 23030` |

## 3) البوت: كيف تؤثر كتابة القاعدة على سلوكه (الأدلة)

> كتابة قاعدة البوت **لا تساوي** تغيير سلوكه. لذلك لكل إجراء حقل `apply` ويظهر في الواجهة بنتيجة «محفوظ — بانتظار التطبيق» عند الحاجة.

| الإعداد | الجدول | يقرؤه البوت | الدليل | `apply` |
|---|---|---|---|---|
| حماية الروابط/السبام، الاستثناءات | `guild_settings`, `auto_mod_exemptions` | عند **كل رسالة** | `services/autoMod.js:156` | **فوري** |
| قناة/نص الترحيب | `guild_settings` | عند **كل عضو جديد** | `services/welcome.js:75-90` | **فوري** |
| رتب الدعم | `guild_config.support_roles` | عند كل فحص صلاحية تكت | `services/tickets.js:66` | **فوري** |
| المساعد الذكي/قناة الأخبار | `guild_settings` | عند كل ردّ | `services/aiStyle.js:46`, `aiAssistant.js:172,413` | **فوري** |
| مشرفو البوت (عضو/رتبة) | `bot_admin_config` | **كاش 10 دقائق** | `utils/adminPermissions.js:22-31` | **≤10د** |
| ستريمرات الإعلان | `streamer_announcements` | **يُحمَّل بالذاكرة عند الإقلاع** ثم يُحدَّث بأمر `/اضافة`/`/ازالة` داخل العملية فقط | `services/streamerAnnouncer.js` (`loadRegistry`, `bootstrap`) | **إعادة تشغيل** |
| قناة إعلان البث | متغير بيئة للبوت | ثابت | `streamerAnnouncer.js` (`channelId`) | **غير قابل للتغيير من الخارج** |
| إحصاءات الأوامر/أخطاؤها | ذاكرة البوت (`utils/usageStats.js`) | — | لا واجهة لقراءتها | **غير متاح** |
| تعطيل أمر/تقييده بالرتبة | لا آلية بالبوت (`interactionCreate.js` لا يفحص قائمة تعطيل) | — | — | بديل: إلغاء تسجيله من Discord / `default_member_permissions` |

**قاعدة البوت:** على Render تُحفظ SQLite محلياً مع نسخة سحابية في Firestore (`stateBackup`) ولا تُرى من خارج حاوية البوت ← **BLOCKED** حتى يُضبط `DATABASE_URL` (PostgreSQL) للبوت. اللوحة تكتب بنفس عبارات `botStore.js`/`streamerAnnouncements.js` (UPSERT مطابق).

## 4) الأوامر وDiscord

- **سجل الأوامر:** محلّل لسلاسل `SlashCommandBuilder` (يوازن الأقواس والنصوص ويحلّ ثوابت المصانع مثل `build(NAME,'…')`) يقرأ الملفات **دون `require`** ويستخرج الاسم/الوصف/الخيارات/الأوامر الفرعية/من يستخدمه (`guardAdmin` / `guardManager` / `isOwnerId`) والتصنيف من المجلد. يُدمج مع الأوامر المسجّلة فعلاً عند Discord.
- **تعطيل أمر:** يحفظ تعريفه الكامل ثم `DELETE` من Discord، وإعادة التفعيل `POST` بنفس التعريف (تحقق بقراءة القائمة). ⚠️ يعيد البوت تسجيل أوامره عند إقلاعه ما لم يكن `AUTO_REGISTER_COMMANDS=false`.
- **تقييد بالصلاحية:** `default_member_permissions` (يعمل بتوكن البوت). التقييد برتبة/قناة محددة يتطلب OAuth Bearer لمدير السيرفر أو إنفاذاً داخل البوت ← غير مدعوم.
- **عمليات السيرفر والأعضاء:** كلها عبر Discord REST بـ`X-Audit-Log-Reason` «[لوحة الإدارة] …» فتظهر في Audit Log الخاص بـDiscord؛ مع حماية مالك السيرفر والبوت نفسه، والتحقق بقراءة الحالة بعد التنفيذ.

## 5) قاعدة اللوحة المستقلة (SQLite)

`audit` (سلسلة تجزئة، إضافة فقط) · `sessions` · `loginLog` · `loginState` · `ipBlocks` · `settings/adminAccess` (مصفوفة الصلاحيات بإصدار) · `settings/app` · `idem` (مفاتيح عدم التكرار) · `alerts` · `healthLatest/History` · `punishments` · `playerNotes` · `streamerNotes` · `xpLedger` · `frameGrants` · `tempActions` · `scheduledPosts` · `savedAnnouncements` · `reports` · `disabledCommands` · `integrationLinks`. **لا تتكرر فيها بيانات الموقع/البوت** (سجلات تشغيلية للوحة فقط).

## 6) الخدمات الخلفية

فحص صحة دوري (الفترة قابلة للتعديل) · رفع الحظر المؤقت للاعبين والستريمرز عند انتهائه (مع التحقق وتنبيه عند الفشل) · نشر الإعلانات المجدولة بحجز ذرّي (`scheduled→publishing`) يمنع النشر المزدوج.

## 7) قناة التحكم داخل البوت `/admin-control` (PR #166 في المستودع)

عند ضبط `ADMIN_CONTROL_KEY` (نفس قيمة البوت) و`BOT_API_BASE_URL` تتحول بنود «يتطلب إعادة تشغيل/≤10د» إلى **تطبيق فوري** بتأكيد `verified` من البوت:

| الإجراء | المسار في البوت |
|---|---|
| ستريمرات/مشرفو البوت (بعد كتابة القاعدة) | `POST /streamers/reload` · `POST /reload {adminPermissions}` |
| تعطيل/تفعيل/تقييد أمر داخل البوت | `POST /commands/:name/disable|enable` · `PUT /commands/:name/restrictions` |
| استخدام الأوامر الدائم | `GET /usage` |
| حدود السبام | `GET/PUT /automod/limits` |
| أسباب التكتات / إغلاق / لوحة | `GET/PUT /tickets/reasons` · `POST /tickets/:id/close` · `POST /tickets/panel` |
| روم إعلانات البث | `PUT /streamers/channel` |

كل طلب كتابة يحمل `x-idempotency-key`؛ والمفتاح لا يغادر الخادم. بدون القناة تبقى السلوكيات السابقة (محفوظ + «بانتظار التطبيق»).
