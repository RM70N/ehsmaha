# قناة التحكم الإدارية — `/admin-control/*`

واجهة HTTP للوحة **EHSEMHA Admin Control Center** لتطبيق عمليات داخل البوت والتحقق أنها طُبّقت فعلاً.
ما تأثّر على أي سلوك قائم: **بدون `ADMIN_CONTROL_KEY` كل المسارات ترجع 503** والبوت يشتغل كالمعتاد.

## الأساسيات

| البند | القيمة |
|---|---|
| الرابط | `https://<رابط-البوت>/admin-control/...` (نفس خادم البوت/الـAPI المدمج) |
| المصادقة | الترويسة `x-admin-key: <ADMIN_CONTROL_KEY>` (32+ حرف، مقارنة ثابتة الزمن، مستقل تماماً عن `API_KEY`) |
| IP (اختياري) | `ADMIN_CONTROL_ALLOWED_IPS` — IP خارج القائمة ← 403 |
| حدّ المعدل | 30 طلب/دقيقة (قبل فحص المفتاح) ← 429 |
| Idempotency | `x-idempotency-key: <8–128 حرف>` على عمليات الكتابة: نفس المفتاح + نفس الطلب خلال 10 دقائق = نفس الرد بدون إعادة تنفيذ (ترويسة `x-idempotent-replay: true`)؛ نفس المفتاح بطلب مختلف ← 422 |
| السيرفر | افتراضياً `GUILD_ID`/`OFFICIAL_GUILD_ID` أو السيرفر الوحيد؛ أو مرّر `guildId` بالجسم/الاستعلام |
| الجسم | JSON حتى 16KB |

### الرد الموحّد

```json
{ "ok": true, "applied": true, "verified": true, "detail": { }, "at": 1760000000000 }
```

- `applied`: هل غيّرت العملية شي فعلاً (القراءة فقط = `false`).
- `verified`: **لا يكون `true` إلا بعد قراءة الحالة الفعلية** (القاعدة/الكاش الداخلي) ومطابقتها للمطلوب.
- خطأ: `{ "ok": false, "applied": false, "verified": false, "code": "INVALID_INPUT", "error": "رسالة عربية عامة", "at": ... }` — بدون stack ولا أسرار.

رموز الأخطاء الشائعة: `ADMIN_CONTROL_DISABLED` 503 · `UNAUTHORIZED` 401 · `IP_NOT_ALLOWED` 403 · `RATE_LIMITED` 429 · `INVALID_JSON`/`INVALID_INPUT` 400 · `NOT_FOUND` 404 · `NOT_READY`/`SERVICE_NOT_READY`/`DB_UNAVAILABLE` 503 · `IDEMPOTENCY_MISMATCH` 422.

> كل عملية كتابة تُسجَّل بـ`moderation_log` بالإجراء `admin_control:<العملية>` و`moderator_id='admin-center'`.

في الأمثلة: `H='x-admin-key: $ADMIN_CONTROL_KEY'` و`B=https://bot.example.com/admin-control`.

---

## GET `/status`
حالة البوت الفعلية: الجاهزية، ping، uptime، الإصدارات، عدد السيرفرات والأوامر، حالة الخدمات (الإعلانات: حلقات مفتوحة وإعلانات فاشلة، القاعدة، الضوابط…).
```bash
curl -H "$H" $B/status
```
```json
{"ok":true,"applied":false,"verified":true,"detail":{"ready":true,"ping":42,"uptime":913,"version":{"bot":"1.0.0","node":"v22.3.0"},"guilds":1,"commands":58,
"services":{"streamerAnnouncer":{"ready":true,"registered":3,"tracked":3,"openEpisodes":1,"failedAnnouncements":0,"channelId":"123..."},"db":{"dialect":"postgres","connected":true},"commandControl":{"loaded":true,"rows":2}}},"at":1760000000000}
```

## POST `/reload`
إعادة تحميل خدمة من القاعدة. الجسم `{"service":"streamerAnnouncer"|"adminPermissions"|"autoMod"|"all"}`؛ يرجع `before` و`after` (أو `services` عند `all`).
```bash
curl -X POST -H "$H" -H 'content-type: application/json' -H 'x-idempotency-key: reload-0001' -d '{"service":"adminPermissions"}' $B/reload
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"service":"adminPermissions","before":{"guilds":1,"users":0,"roles":1},"after":{"guilds":1,"users":1,"roles":1}},"at":1760000000000}
```
خدمة الإعلانات غير مشغّلة ← 503 `SERVICE_NOT_READY`.

## GET `/commands`
كل الأوامر: الاسم، الملف، الفئة، `protected`، `disabled`، التقييدات، واستخدام آخر 7 أيام.
```bash
curl -H "$H" $B/commands
```
```json
{"ok":true,"applied":false,"verified":true,"detail":{"count":58,"commands":[{"name":"بث","file":"streams/live.js","category":"streams","protected":false,"disabled":false,"restrictions":{"allowedRoleIds":[],"allowedChannelIds":[],"blockedChannelIds":[]},"usage7d":{"uses":12,"errors":0,"denied":1}}]},"at":1760000000000}
```

## POST `/commands/:name/disable` · `/commands/:name/enable`
تعطيل/تفعيل أمر. المستخدم العادي يرى رفضاً بالعربية (مؤقت) ويُحسب `denied`؛ **المالك مستثنى**. الأوامر الأساسية (`مساعدة`، `ادمن_احصائيات`، `اضافة_ادمن`، `ازالة_ادمن`، `اضافة_رتبة_ادارية`، `ازالة_رتبة_ادارية`، `عرض_الرتب`، `اضافة`، `ازالة`) ← 409 `PROTECTED_COMMAND`؛ أمر غير موجود ← 404.
```bash
curl -X POST -H "$H" $B/commands/$(node -e "console.log(encodeURIComponent('بث'))")/disable
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"name":"بث","disabled":true},"at":1760000000000}
```

## PUT `/commands/:name/restrictions`
```bash
curl -X PUT -H "$H" -H 'content-type: application/json' -d '{"allowedRoleIds":["700000000000000001"],"allowedChannelIds":[],"blockedChannelIds":["600000000000000002"]}' $B/commands/<name>/restrictions
```
قوائم فاضية = بدون تقييد. معرّفات غير صالحة أو أكثر من 50 ← 400.
```json
{"ok":true,"applied":true,"verified":true,"detail":{"name":"بث","restrictions":{"allowedRoleIds":["700000000000000001"],"allowedChannelIds":[],"blockedChannelIds":["600000000000000002"]}},"at":1760000000000}
```

## POST `/streamers/reload`
يعيد تحميل الستريمرات المسجّلين من القاعدة بدون إعادة تشغيل: مسجّل جديد يُتتبَّع فوراً، **بث جارٍ لا يتكرر إعلانه**، ومحذوف أثناء البث يُسقَط تتبّعه بدون إعلان.
```bash
curl -X POST -H "$H" $B/streamers/reload
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"before":{"registered":0,"tracked":0,"openEpisodes":0},"after":{"registered":1,"tracked":1,"openEpisodes":1}},"at":1760000000000}
```

## PUT `/streamers/channel`
يغيّر روم الإعلانات (مخزّن بـ`guild_config.streamer_announce_channel` وله أولوية على `STREAM_ANNOUNCE_CHANNEL_ID`)، يُطبَّق فوراً. يتحقق: قناة نصية + البوت يملك `SendMessages` و`EmbedLinks`. لا روم بديل عند الفشل.
```bash
curl -X PUT -H "$H" -H 'content-type: application/json' -d '{"channelId":"123456789012345678"}' $B/streamers/channel
```
أخطاء: 400 معرّف غير صالح · 404 قناة غير موجودة · 422 `NOT_TEXT_CHANNEL` / `MISSING_PERMISSIONS` (مع `detail.missing`).

## GET `/usage?days=7`
إحصاءات الأوامر الدائمة (تبقى بعد إعادة التشغيل؛ تُحفظ كل 30 ثانية وعند الإغلاق، وتُحذف بعد 90 يوم). نخزّن رمز الخطأ فقط.
```bash
curl -H "$H" "$B/usage?days=7"
```
```json
{"ok":true,"applied":false,"verified":true,"detail":{"days":7,"commands":[{"name":"بث","uses":120,"errors":2,"denied":1,"lastUsedAt":1760000000000,"lastErrorAt":1759990000000,"lastErrorCode":"50013"}]},"at":1760000000000}
```

## GET / PUT `/automod/limits`
حدود كشف السبام لكل سيرفر. الأولوية: القاعدة > البيئة > الافتراضي. النطاقات: `spamMaxMessages` 2–30، `spamWindowSeconds` 3–60، `spamDuplicates` 2–10، `escalationMinutes` مصفوفة دقائق موجبة (اختياري).
```bash
curl -X PUT -H "$H" -H 'content-type: application/json' -d '{"spamMaxMessages":3,"spamWindowSeconds":10,"spamDuplicates":2,"escalationMinutes":[5,15,60]}' $B/automod/limits
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"effective":{"maxMessages":3,"windowMs":10000,"duplicateCount":2,"escalationMs":[300000,900000,3600000],"source":"database"}},"at":1760000000000}
```

## GET / PUT `/tickets/reasons`
أسباب فتح التكت لكل سيرفر. `reasons` من 1 إلى 25، كل سبب `{value, label, description?, emoji?}` (`value` حروف/أرقام/`_-` فقط، فريد). قائمة فاضية = الرجوع لملف الإعدادات.
```bash
curl -X PUT -H "$H" -H 'content-type: application/json' -d '{"reasons":[{"value":"billing","label":"الفواتير","emoji":"💳"}]}' $B/tickets/reasons
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"source":"database","reasons":[{"value":"billing","label":"الفواتير","emoji":"💳"}]},"at":1760000000000}
```

## POST `/tickets/:id/close`
يغلق تكت بنفس منطق الإغلاق (أرشفة/حذف حسب `TICKET_CLOSE_MODE`). مغلق مسبقاً ← 409 `ALREADY_CLOSED`؛ غير موجود ← 404.
```bash
curl -X POST -H "$H" $B/tickets/42/close
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"ticket":{"id":42,"status":"closed","channelId":"..."},"channelState":"archived"},"at":1760000000000}
```

## POST `/tickets/panel`
ينشر لوحة التكتات برسالة حقيقية بالقناة. لا تكرار لنفس القناة ← 409 `PANEL_EXISTS`. الجسم `{"channelId":"...","content":"نص اللوحة"}` (`\n` تتحوّل لسطر جديد). 422 `MISSING_PERMISSIONS` لو ينقص البوت صلاحية.
```bash
curl -X POST -H "$H" -H 'content-type: application/json' -d '{"channelId":"123456789012345678","content":"عندك مشكلة؟ افتح تكت"}' $B/tickets/panel
```
```json
{"ok":true,"applied":true,"verified":true,"detail":{"channelId":"123456789012345678","messageId":"987..."},"at":1760000000000}
```
