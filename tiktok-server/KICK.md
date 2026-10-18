# كيك — ناقل الشات (kichat.js)

الستريمر يكتب **اسم قناته فقط** (مثلاً `xqc` أو `@XQC` أو `kick.com/xqc`) — بلا OAuth ولا مفاتيح. كل شيء يحصل على السيرفر؛
المتصفح (كل الألعاب) يستقبل الرسائل عبر نفس WebSocket الجسر `?platform=kick&u=...` الذي كان يستخدمه من قبل، فلا تغيير داخل أي لعبة.

## الطبقات

| الملف | الدور |
|---|---|
| `lib/kick-adapter.js` | **KickChatAdapter** — دوال نقية: `normalizeSlug` (تنظيف المدخل)، `toUnified` (رسالة kichat.js → `{platform,userId,username,displayName,text,timestamp,badges,isSub,isMod}`)، `toBridgeEvent` (الشكل الموحّد → غلاف `WebcastChatMessage` الذي تقرؤه الألعاب)، `MessageGate` (إزالة التكرار + تحديد المعدل لكل مستخدم) |
| `lib/kichat-session.js` | جلسة واحدة لكل قناة فوق kichat.js: فحص القناة (404/403/…)، اتصال Pusher، `join`، **إعادة اتصال بتراجع أسّي**، watchdog للاتصال الميت، إيقاف نظيف |
| `server.js` → `KickRoom` | يربط الجلسة بغرفة الجسر: **عملاء كثيرون = اتصال كيك واحد**، تجميع الرسائل بدفعات، رجوع تلقائي للناقل القديم عند الحجب |

ناقل **يوتيوب** المستقبلي يكفيه أن يُنتج نفس الكائن الموحّد ثم يستدعي `toBridgeEvent`-مكافئه؛ الألعاب لا تتغير.

## متغيّر البيئة `KICK_TRANSPORT`

* `auto` (الافتراضي): kichat.js أولاً؛ إن حجب كيك طلب فحص القناة (403/429/صفحة تحدّي HTML) يتحوّل **تلقائياً** إلى `kick-live-connector` (Playwright).
* `kichat`: kichat.js فقط (بلا رجوع).
* `connector`: القديم فقط — **مفتاح إيقاف طوارئ** لو تعطّل kichat.js بعد تغيير من كيك (غيّرها في Render وأعد النشر، لا حاجة لتعديل كود).

## ملاحظات عن مكتبة kichat.js 1.0.4 (من قراءة مصدرها)

1. غير رسمية: تعتمد على `kick.com/api/v2/channels/{slug}/info` (قد تحميها Cloudflare) وعلى مفتاح Pusher مضمّن (`32cbd69e4b950bf97679`) — أي تغيير من كيك قد يكسرها.
2. `join()` يخلط 404 مع 403 ويجلب نفس الرابط مرتين → نفحص القناة بأنفسنا (حالة واضحة) ونمرّر النتيجة للمكتبة.
3. `reconnect()` الداخلية تعيد `connect()` حتى بعد `close()` (اتصال شبح) → نستخدم `reconnect:false` ونستبدل العميل بالكامل.
4. لا كشف لاتصال ميت بصمت → watchdog على الإطارات الواردة (pong كل ~120ث، الحد 190ث).
5. تشترك بقناتَي دردشة (`chatrooms.X.v2` و`chatroom_X`) → قد تصل الرسالة مرتين → إزالة التكرار بمعرّف الرسالة.
6. إيموجي القناة تصل كنص `[emote:ID:اسم]` → تُحذف قبل وصول النص للألعاب. الإيموجي القياسية والتشكيل والـZWJ تبقى كما هي.
7. تتطلب Node ≥ 22 (`engines`).

## الاختبارات

```bash
cd tiktok-server
node --test test/*.test.js              # وحدة (adapter/session/backoff/…) + تكامل kichat.js الحقيقية مع محاكي كيك
node test_kichat_contract.js            # السيرفر الحقيقي + kichat.js + محاكي كيك (عقد الجسر، replay، رجوع للقديم…)
npm run test:kick                       # العقد القديم (kick-live-connector) بـ KICK_TRANSPORT=connector
node live-kick-probe.js <قناة> 5        # اختبار حي لخمس دقائق على قناة كيك حقيقية (من جهازك — يحتاج وصولاً لـ kick.com)
```

الألعاب الثلاثون عبر مسار كيك: شغّل `PORT=18081 CTL_PORT=19081 node tests/bridge/start-server-kick.js` و`PORT=18082 CTL_PORT=19082 node tests/bridge/start-server.js` ثم `node tests/bridge/all-games-kick.js 100 6000`.

واجهة الستريمر + الأعطال (قناة غير موجودة، غير مباشرة، قطع/عودة الإنترنت): شغّل `KICK_CHANNELS=streamer1,sleepyone:offline PORT=18081 CTL_PORT=19081 node tests/bridge/start-server-kick.js` والاحتياطي كما فوق ثم `node tests/bridge/kick-connect.test.js`.
