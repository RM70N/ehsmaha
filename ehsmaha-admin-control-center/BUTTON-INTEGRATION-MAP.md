# BUTTON-INTEGRATION-MAP

لكل زر: نقطة الدخول، الخدمة المسؤولة، مصدر البيانات، وطريقة التحقق من التنفيذ. (مولَّد آلياً.)

**نقطة الدخول الموحّدة:** `POST /api/actions/{section}/{action}/run` ← جلسة HttpOnly + ترويسة CSRF + Origin ← صلاحية ← تحقق مدخلات (Zod) ← قدرة الاتصال ← تأكيد (للخطورة ≥ متوسطة) ← مفتاح عدم التكرار ← `load` (القيمة الحالية) ← `execute` ← `verify` (إعادة قراءة من المصدر) ← تدقيق ← نتيجة.

## إدارة اللاعبين `players`

**المصدر:** Firebase Auth (disable/revoke) · Firestore `users`,`usernames`,`levels`,`personalMessages` · RTDB `ownerMessages/personal` · قاعدة اللوحة (`punishments`,`playerNotes`,`xpLedger`,`tempActions`)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| حظر لاعب نهائياً | `POST /api/actions/players/ban_permanent/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حظر مؤقت مع مدة | `POST /api/actions/players/ban_temporary/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| رفع الحظر عن لاعب | `POST /api/actions/players/unban/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| فرض تسجيل خروج من كل الجلسات | `POST /api/actions/players/force_logout/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة/خصم خبرة (XP) | `POST /api/actions/players/adjust_xp/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصفير خبرة لاعب | `POST /api/actions/players/reset_xp/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| فك ربط حساب تيك توك | `POST /api/actions/players/unlink_tiktok/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إرسال رسالة شخصية للاعب | `POST /api/actions/players/send_message/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة ملاحظة إدارية | `POST /api/actions/players/add_note/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصدير بيانات لاعب (JSON) | `POST /api/actions/players/export_player/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |

## إدارة الستريمرز `streamers`

**المصدر:** Firestore `bridgeStreamers` (بوابة خادم الربط) و`activeStreamers` · قاعدة اللوحة (ملاحظات، إيقاف مؤقت)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| حظر/إيقاف ربط ستريمر | `POST /api/actions/streamers/bridge_disable/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إيقاف الربط مؤقتاً (بمدة) | `POST /api/actions/streamers/bridge_disable_temp/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| رفع الحظر / إعادة تفعيل الربط | `POST /api/actions/streamers/bridge_enable/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تسجيل ستريمر في بوابة الربط | `POST /api/actions/streamers/bridge_register/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة سجل الستريمر من بوابة الربط | `POST /api/actions/streamers/bridge_reset/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إنهاء جلسة ستريمر نشطة عالقة | `POST /api/actions/streamers/clear_active/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة ملاحظة على ستريمر | `POST /api/actions/streamers/add_note/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| سجل عمليات الستريمر | `POST /api/actions/streamers/streamer_log/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير حالة الستريمرز (JSON) | `POST /api/actions/streamers/export_streamers/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| إرسال رسالة للستريمر (داخل الموقع) | `POST /api/actions/streamers/message_streamer/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حظر الستريمر مؤقتاً | `POST /api/actions/streamers/ban_streamer_temp/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حظر الستريمر نهائياً | `POST /api/actions/streamers/ban_streamer/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| فك حظر الستريمر | `POST /api/actions/streamers/unban_streamer/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| الانتقال إلى بث الستريمر | `POST /api/actions/streamers/open_stream/run` | — | قراءة فقط (لا تغيير) |

## إدارة الألعاب `games`

**المصدر:** RTDB `opsConfig/current|history/{tag}` (نفس آلية لوحة المالك) · Firestore `gameBadges` · مخطط `MOD_SETTINGS_SCHEMA` (لقطة مستخرجة)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تعديل إعداد لعبة | `POST /api/actions/games/set_setting/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة إعدادات اللعبة للافتراضي | `POST /api/actions/games/reset_defaults/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| استعادة إصدار سابق من الإعدادات | `POST /api/actions/games/restore_version/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| وضع اللعبة في الصيانة | `POST /api/actions/games/set_maintenance/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إخراج اللعبة من الصيانة | `POST /api/actions/games/clear_maintenance/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعيين شارة اللعبة (جديدة/محدّثة/بدون) | `POST /api/actions/games/set_badge/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصدير فهرس الألعاب والإعدادات | `POST /api/actions/games/export_games/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| مراجعة حالة اللعبة وأخطائها | `POST /api/actions/games/game_health/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |

## الفعاليات والبطولات `events`

**المصدر:** Firestore `streamerEvents` (+`sessions`) و`streamerEventAnnouncements/current` و`event100/current`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إطلاق فعالية «أفضل ستريمر» | `POST /api/actions/events/launch_best_streamer/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إنهاء الفعالية الآن وتحديد الفائز | `POST /api/actions/events/end_now/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تمديد موعد انتهاء الفعالية | `POST /api/actions/events/extend_end/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل رسالة إعلان الفعالية | `POST /api/actions/events/edit_message/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| معاينة الفائزين الحاليين | `POST /api/actions/events/preview_winners/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| تصدير نتائج فعالية (JSON) | `POST /api/actions/events/export_event/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| تغيير مرحلة فعالية «عدد جديد» | `POST /api/actions/events/event100_status/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل رسائل فعالية «عدد جديد» | `POST /api/actions/events/event100_messages/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## الجوائز والمكافآت `rewards`

**المصدر:** Firestore `levels.ownedFrames/levelFrames/activeFrame` (نفس `framesGrantToUser`) · كتالوج الإطارات (مدمج + `framesCatalogExtra`) · قاعدة اللوحة (`frameGrants`)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| منح إطار للاعب | `POST /api/actions/rewards/grant_frame/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| سحب إطار من لاعب | `POST /api/actions/rewards/revoke_frame/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| منح إطار لمجموعة لاعبين | `POST /api/actions/rewards/grant_frame_bulk/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة معالجة منح فاشل | `POST /api/actions/rewards/retry_failed/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| التحقق من تسليم الإطارات (مقارنة السجل بالموقع) | `POST /api/actions/rewards/verify_delivery/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| اكتشاف منح مكررة في السجل | `POST /api/actions/rewards/detect_duplicates/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| عرض إطارات لاعب | `POST /api/actions/rewards/player_frames/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| تصدير سجل المكافآت (CSV) | `POST /api/actions/rewards/export_rewards/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## المتجر والإطارات `shop`

**المصدر:** Firestore `shopProducts` و`storeSales` و`framesCatalogExtra.visibility`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إضافة منتج للمتجر | `POST /api/actions/shop/add_product/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل سعر منتج | `POST /api/actions/shop/set_price/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل المخزون (الحد الأقصى للمشتريات) | `POST /api/actions/shop/set_stock/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إيقاف بيع منتج | `POST /api/actions/shop/stop_selling/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة تفعيل منتج | `POST /api/actions/shop/reactivate/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حذف منتج | `POST /api/actions/shop/delete_product/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إخفاء إطار إضافي من المتجر | `POST /api/actions/shop/hide_frame/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إظهار إطار إضافي في المتجر | `POST /api/actions/shop/show_frame/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تقرير المبيعات والمنح (CSV) | `POST /api/actions/shop/sales_report/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |

## الأكواد السرية `codes`

**المصدر:** RTDB `secretCodes/{key}` (نفس بنية وتطبيع مفتاح الموقع)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إنشاء كود جديد | `POST /api/actions/codes/create/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعطيل كود | `POST /api/actions/codes/stop/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة تفعيل كود | `POST /api/actions/codes/reactivate/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حذف كود | `POST /api/actions/codes/delete/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل عدد الاستخدامات المسموح | `POST /api/actions/codes/set_max_uses/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تحديد تاريخ انتهاء الكود | `POST /api/actions/codes/set_expiry/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصفير عداد استخدام الكود | `POST /api/actions/codes/reset_usage/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| عرض من استخدم الكود | `POST /api/actions/codes/code_users/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |
| تصدير الأكواد (JSON) | `POST /api/actions/codes/export_codes/run` | Firebase Admin (Firestore/RTDB/Auth) | قراءة فقط (لا تغيير) |

## الرسائل والإعلانات `messages`

**المصدر:** Firestore `broadcastMessages/current` + RTDB `ownerMessages/broadcast` · `personalMessages` · قاعدة اللوحة (`savedAnnouncements`,`scheduledPosts`)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| نشر إعلان للجميع داخل الموقع | `POST /api/actions/messages/publish/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إيقاف الإعلان المنشور | `POST /api/actions/messages/clear/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حفظ إعلان في المكتبة | `POST /api/actions/messages/save/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل إعلان محفوظ | `POST /api/actions/messages/edit_saved/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حذف إعلان محفوظ | `POST /api/actions/messages/delete_saved/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة نشر إعلان محفوظ | `POST /api/actions/messages/repost_saved/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| جدولة إعلان لوقت محدد | `POST /api/actions/messages/schedule/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إلغاء إعلان مجدول | `POST /api/actions/messages/cancel_scheduled/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| سحب رسالة شخصية موجهة للاعب | `POST /api/actions/messages/delete_personal/run` | Firebase Admin (Firestore/RTDB/Auth) | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصدير سجل الرسائل (CSV) | `POST /api/actions/messages/export_log/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## التحليلات والتقارير `analytics`

**المصدر:** Firestore `users`,`levels`,`storeSales` (count/aggregations) · قاعدة اللوحة (`reports`,`punishments`,`xpLedger`)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تصدير بيانات اللاعبين (CSV) | `POST /api/actions/analytics/report_players/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير إحصائيات الألعاب (CSV) | `POST /api/actions/analytics/report_games/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير إحصائيات الستريمرز (CSV) | `POST /api/actions/analytics/report_streamers/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير النشاط اليومي | `POST /api/actions/analytics/report_daily/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير النشاط الأسبوعي | `POST /api/actions/analytics/report_weekly/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير العقوبات | `POST /api/actions/analytics/report_punishments/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير المكافآت | `POST /api/actions/analytics/report_rewards/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| مقارنة أداء فترتين | `POST /api/actions/analytics/compare_periods/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير مخصص بتاريخ يحدده المسؤول | `POST /api/actions/analytics/report_custom/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| أرشفة تقرير سابق (مع إمكانية الرجوع) | `POST /api/actions/analytics/archive_report/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تنزيل تقرير من الأرشيف | `POST /api/actions/analytics/get_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## إدارة السيرفر `server`

**المصدر:** Discord REST `/guilds`, `/channels`, `/members`, `/audit-logs`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إرسال إعلان (Embed) إلى روم | `POST /api/actions/server/send_announcement/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إرسال رسالة مخصصة إلى روم | `POST /api/actions/server/send_message/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تثبيت رسالة | `POST /api/actions/server/pin_message/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إلغاء تثبيت رسالة | `POST /api/actions/server/unpin_message/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حذف رسالة محددة | `POST /api/actions/server/delete_message/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل رسالة أرسلها البوت | `POST /api/actions/server/edit_message/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل وصف قناة (Topic) | `POST /api/actions/server/set_channel_topic/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل وصف السيرفر | `POST /api/actions/server/set_description/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| عرض معلومات عضو ورتبه | `POST /api/actions/server/member_lookup/run` | Discord REST | قراءة فقط (لا تغيير) |
| آخر الإجراءات الإدارية في Discord | `POST /api/actions/server/recent_actions/run` | Discord REST | قراءة فقط (لا تغيير) |

## أعضاء السيرفر `members`

**المصدر:** Discord REST (kick/ban/timeout/roles/nick) · قاعدة البوت (warnings, moderation_log — قراءة)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| طرد عضو | `POST /api/actions/members/kick/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حظر عضو | `POST /api/actions/members/ban/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| فك حظر عضو | `POST /api/actions/members/unban/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تطبيق Timeout لمدة | `POST /api/actions/members/timeout/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة Timeout | `POST /api/actions/members/untimeout/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة رتبة لعضو | `POST /api/actions/members/add_role/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة رتبة من عضو | `POST /api/actions/members/remove_role/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تغيير لقب عضو | `POST /api/actions/members/set_nick/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| عرض سجل مخالفات وعقوبات عضو | `POST /api/actions/members/warning_history/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| معاينة قائمة أعضاء للإجراء الجماعي | `POST /api/actions/members/bulk_preview/run` | Discord REST | قراءة فقط (لا تغيير) |
| إجراء إداري على مجموعة أعضاء | `POST /api/actions/members/bulk_action/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## أوامر البوت `commands`

**المصدر:** ملفات `discord-bot/commands` (قراءة) · Discord REST `/applications/{id}/commands` · قاعدة اللوحة (`disabledCommands`)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تعطيل أمر (إلغاء تسجيله من Discord) | `POST /api/actions/commands/disable/run` | Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة تفعيل أمر معطّل | `POST /api/actions/commands/enable/run` | Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تقييد أمر بصلاحية Discord | `POST /api/actions/commands/restrict_permission/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة تقييد الصلاحية عن أمر | `POST /api/actions/commands/clear_restriction/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| استعادة صلاحية أمر (للتراجع) | `POST /api/actions/commands/restore_permission/run` | Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| مقارنة التسجيل (ملفات البوت ↔ Discord) | `POST /api/actions/commands/drift_report/run` | قراءة ملفات البوت + Discord REST | قراءة فقط (لا تغيير) |
| تفاصيل أمر (خيارات/صلاحيات/ملف) | `POST /api/actions/commands/command_detail/run` | قراءة ملفات البوت | قراءة فقط (لا تغيير) |
| تصدير سجل الأوامر (JSON) | `POST /api/actions/commands/export_registry/run` | قراءة ملفات البوت | قراءة فقط (لا تغيير) |
| فحص صلاحيات البوت مقابل متطلبات الأوامر | `POST /api/actions/commands/bot_permissions_check/run` | قراءة ملفات البوت + Discord REST | قراءة فقط (لا تغيير) |
| تعطيل أمر داخل البوت (دون إلغاء تسجيله) | `POST /api/actions/commands/bot_disable/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة تفعيل أمر معطّل داخل البوت | `POST /api/actions/commands/bot_enable/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تقييد أمر برتب ورومات محددة | `POST /api/actions/commands/bot_restrict/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| استخدام الأوامر وأخطاؤها (دائم) | `POST /api/actions/commands/bot_usage/run` | — | قراءة فقط (لا تغيير) |

## الحماية التلقائية `automod`

**المصدر:** قاعدة البوت: `guild_settings`, `auto_mod_exemptions`, `auto_mod_violations`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تشغيل/إيقاف حماية الروابط | `POST /api/actions/automod/toggle_links/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تشغيل/إيقاف حماية السبام | `POST /api/actions/automod/toggle_spam/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة نطاق مسموح/مستثنى | `POST /api/actions/automod/add_domain_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة نطاق من الاستثناءات | `POST /api/actions/automod/remove_domain_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة رتبة مسموح/مستثنى | `POST /api/actions/automod/add_role_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة رتبة من الاستثناءات | `POST /api/actions/automod/remove_role_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إضافة قناة مسموح/مستثنى | `POST /api/actions/automod/add_channel_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة قناة من الاستثناءات | `POST /api/actions/automod/remove_channel_exempt/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصفير مخالفات عضو | `POST /api/actions/automod/reset_violations/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| عرض مخالفات عضو | `POST /api/actions/automod/member_violations/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| عرض حدود السبام الفعّالة | `POST /api/actions/automod/get_limits/run` | — | قراءة فقط (لا تغيير) |
| تعديل حدود السبام والتصعيد | `POST /api/actions/automod/set_limits/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## التكتات والدعم `tickets`

**المصدر:** قاعدة البوت: `tickets`, `guild_config.support_roles`, `guild_settings`, `ai_style_examples`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إضافة رتبة دعم | `POST /api/actions/tickets/add_support_role/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إزالة رتبة دعم | `POST /api/actions/tickets/remove_support_role/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تشغيل/إيقاف تعلّم أسلوب المالك للمساعد الذكي | `POST /api/actions/tickets/toggle_ai_style/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تحديد صاحب أسلوب المساعد الذكي | `POST /api/actions/tickets/set_ai_style_owner/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تحديد قناة ملخص أخبار الإدارة | `POST /api/actions/tickets/set_admin_news_channel/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| مسح أمثلة أسلوب المساعد المحفوظة | `POST /api/actions/tickets/clear_ai_style_examples/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل أسباب فتح التكت | `POST /api/actions/tickets/set_reasons/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إغلاق تكت | `POST /api/actions/tickets/close_ticket/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| نشر لوحة التكتات في روم | `POST /api/actions/tickets/post_panel/run` |  + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## نظام الترحيب `welcome`

**المصدر:** قاعدة البوت: `guild_settings` · Discord REST (اختبار نصي)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تحديد/تغيير قناة الترحيب (تفعيل) | `POST /api/actions/welcome/set_channel/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعطيل نظام الترحيب | `POST /api/actions/welcome/disable/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تغيير قناة نص الترحيب | `POST /api/actions/welcome/set_text_channel/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل نص رسالة الترحيب | `POST /api/actions/welcome/set_message/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة نص الترحيب للافتراضي | `POST /api/actions/welcome/reset_message/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| معاينة رسالة الترحيب | `POST /api/actions/welcome/preview/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| إرسال اختبار نصي لقناة الترحيب | `POST /api/actions/welcome/send_test/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## مشرفو البوت `admins`

**المصدر:** قاعدة البوت: `bot_admin_config`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إضافة عضو إداري | `POST /api/actions/admins/add_user/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ يطبَّق خلال ≤10د |
| إزالة عضو إداري | `POST /api/actions/admins/remove_user/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ يطبَّق خلال ≤10د |
| إضافة رتبة إداري | `POST /api/actions/admins/add_role/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ يطبَّق خلال ≤10د |
| إزالة رتبة إداري | `POST /api/actions/admins/remove_role/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ يطبَّق خلال ≤10د |

## ستريمرات إعلان البوت `dstreamers`

**المصدر:** قاعدة البوت: `streamer_announcements`, `streamer_announcement_events`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إضافة ستريمر لإعلانات البوت | `POST /api/actions/dstreamers/add/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| إزالة ستريمر من القائمة | `POST /api/actions/dstreamers/remove/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| تعطيل إشعارات البث لستريمر | `POST /api/actions/dstreamers/disable/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| تفعيل إشعارات البث لستريمر | `POST /api/actions/dstreamers/enable/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| تعديل اليوزر المرتبط | `POST /api/actions/dstreamers/set_username/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| تغيير المنصة المرتبطة | `POST /api/actions/dstreamers/set_platform/run` | Bot DB Adapter + Discord REST | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| فحص حالة ربط الستريمر | `POST /api/actions/dstreamers/check_link/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| سجل إشعارات البث المرسلة | `POST /api/actions/dstreamers/notification_log/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| تطبيق قائمة الستريمرات في البوت الآن | `POST /api/actions/dstreamers/reload_now/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تغيير روم إعلانات البث | `POST /api/actions/dstreamers/set_channel/run` | — | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## قاعدة بيانات البوت `botdb`

**المصدر:** قاعدة البوت (قراءة عبر طبقة محددة)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تصدير التحذيرات (JSON) | `POST /api/actions/botdb/export_warnings/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| تصدير سجل الإشراف (JSON) | `POST /api/actions/botdb/export_moderation_log/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| تصدير التكتات (JSON) | `POST /api/actions/botdb/export_tickets/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| تصدير الردود التلقائية (JSON) | `POST /api/actions/botdb/export_auto_replies/run` | Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |

## صلاحيات الأدمن `access`

**المصدر:** قاعدة اللوحة: `settings/adminAccess` (إصدارات + تدقيق)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إظهار/إخفاء مساحة كاملة (الموقع أو ديسكورد) | `POST /api/actions/access/set_workspace/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إظهار/إخفاء قسم عن الأدمن | `POST /api/actions/access/set_section/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| السماح/المنع لزر (إجراء) محدد | `POST /api/actions/access/set_action/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| السماح/المنع لكل إجراءات قسم دفعة واحدة | `POST /api/actions/access/set_section_actions/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تطبيق نمط جاهز لصلاحيات الأدمن | `POST /api/actions/access/apply_preset/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| استعادة لقطة صلاحيات (للتراجع) | `POST /api/actions/access/restore_snapshot/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة صلاحيات الأدمن للإعدادات الافتراضية | `POST /api/actions/access/reset_defaults/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إنهاء كل جلسات الأدمن الآن | `POST /api/actions/access/revoke_admin_sessions/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| معاينة ما يراه الأدمن فعلاً | `POST /api/actions/access/view_effective/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## مركز الأمان `security`

**المصدر:** قاعدة اللوحة: جلسات، `loginLog`, `ipBlocks`, النسخ الاحتياطي (VACUUM INTO)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إنهاء جلسة محددة | `POST /api/actions/security/revoke_session/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إنهاء كل جلسات حساب | `POST /api/actions/security/revoke_account_sessions/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| قفل دخول حساب الأدمن مؤقتاً | `POST /api/actions/security/lock_account/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| فتح قفل حساب وتصفير الفشل | `POST /api/actions/security/unlock_account/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حظر عنوان IP من الدخول | `POST /api/actions/security/block_ip/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| رفع حظر IP | `POST /api/actions/security/unblock_ip/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إنشاء نسخة احتياطية لقاعدة اللوحة | `POST /api/actions/security/create_backup/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| التحقق من سلامة نسخة احتياطية | `POST /api/actions/security/verify_backup/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| التحقق من سلامة سلسلة سجل التدقيق | `POST /api/actions/security/verify_audit_chain/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير سجل محاولات الدخول (CSV) | `POST /api/actions/security/export_login_log/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## إعدادات اللوحة `settings`

**المصدر:** قاعدة اللوحة: `settings/app` (إصدارات + سجل + تراجع)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| تعديل: مهلة خمول الجلسة (دقائق) | `POST /api/actions/settings/set_sessionIdleMinutes/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: أقصى عمر للجلسة (ساعات) | `POST /api/actions/settings/set_sessionMaxHours/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: محاولات الدخول الفاشلة قبل القفل | `POST /api/actions/settings/set_loginFreeFails/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: أقصى مدة قفل بعد الفشل (ثوانٍ) | `POST /api/actions/settings/set_loginMaxLockSec/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: فشل متتالٍ من عدة عناوين يقفل الحساب مؤقتاً | `POST /api/actions/settings/set_loginGlobalFails/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: أقصى محاولات دخول لكل IP في النافذة | `POST /api/actions/settings/set_loginIpMax/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: فترة فحص صحة الخدمات (ثوانٍ) | `POST /api/actions/settings/set_healthIntervalSec/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تعديل: مدة الاحتفاظ بسجل الفحوصات (أيام) | `POST /api/actions/settings/set_healthRetentionDays/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| التراجع عن تعديل إعداد (برقم الإصدار) | `POST /api/actions/settings/rollback/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة إعداد للقيمة الافتراضية | `POST /api/actions/settings/reset_setting/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تصدير الإعدادات والسجل (JSON) | `POST /api/actions/settings/export_settings/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## سجل التدقيق `audit`

**المصدر:** قاعدة اللوحة: `audit` (سلسلة تجزئة، إضافة فقط)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| ملخص العمليات لفترة | `POST /api/actions/audit/summary/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| نشاط كل مسؤول | `POST /api/actions/audit/by_actor/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير العمليات الفاشلة والمرفوضة | `POST /api/actions/audit/failed_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| مراجعة العمليات الحساسة (خطورة عالية/حرجة) | `POST /api/actions/audit/sensitive_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| سجل عمليات عنصر معيّن | `POST /api/actions/audit/target_history/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير أسباب التغيير | `POST /api/actions/audit/reasons_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير السجل (CSV) | `POST /api/actions/audit/export_csv/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير السجل (JSON) | `POST /api/actions/audit/export_json/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| التراجع عن عملية سابقة | `POST /api/actions/audit/undo_operation/run` | قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| التحقق من سلامة سلسلة التجزئة | `POST /api/actions/audit/verify_chain/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## صحة الأنظمة `health`

**المصدر:** فحوصات اتصال فعلية (Firestore/RTDB/Auth/Discord/Bot/DB)

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| فحص كل الخدمات الآن | `POST /api/actions/health/run_all/run` | قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| فحص خدمة محددة | `POST /api/actions/health/run_check/run` | قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| تقرير التوفر (آخر 24 ساعة) | `POST /api/actions/health/uptime_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تقرير زمن الاستجابة | `POST /api/actions/health/latency_report/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| تصدير سجل الأعطال (CSV) | `POST /api/actions/health/export_incidents/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |
| لقطة حالة البوت (Ping/Uptime) | `POST /api/actions/health/bot_snapshot/run` | Bot /health | قراءة فقط (لا تغيير) |
| اختبار اتصال Discord وصحة التوكن | `POST /api/actions/health/test_discord_token/run` | Discord REST | قراءة فقط (لا تغيير) |
| حذف سجل الفحوصات القديم | `POST /api/actions/health/prune_history/run` | قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| حالة البوت من قناة التحكم (خدمات داخلية) | `POST /api/actions/health/bot_control_status/run` | — | قراءة فقط (لا تغيير) |

## مركز التنبيهات `alerts`

**المصدر:** قاعدة اللوحة: `alerts`

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| استلام تنبيه (قيد المعالجة) | `POST /api/actions/alerts/ack/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إغلاق تنبيه كمحلول | `POST /api/actions/alerts/resolve/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| استلام كل التنبيهات المفتوحة | `POST /api/actions/alerts/ack_all/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إغلاق كل التنبيهات قيد المعالجة | `POST /api/actions/alerts/resolve_acknowledged/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| تسجيل تنبيه يدوي | `POST /api/actions/alerts/raise_manual/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة فتح تنبيه محلول | `POST /api/actions/alerts/reopen/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| حذف التنبيهات المحلولة القديمة | `POST /api/actions/alerts/delete_resolved/run` | قاعدة اللوحة | تحقق ضمني بالمعاملة/القراءة داخل التنفيذ |
| تصدير التنبيهات (CSV) | `POST /api/actions/alerts/export_alerts/run` | قاعدة اللوحة | قراءة فقط (لا تغيير) |

## مركز التكامل `integration`

**المصدر:** قاعدة اللوحة: `integrationLinks` + Firestore + Discord REST + قاعدة البوت

| الإجراء | Endpoint | الخدمة | التحقق من التنفيذ |
|---|---|---|---|
| إعلان فعالية الموقع في ديسكورد | `POST /api/actions/integration/announce_event/run` | Firebase Admin (Firestore/RTDB/Auth) + Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| التحقق من وصول الإعلان إلى السيرفر | `POST /api/actions/integration/verify_link/run` | Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| إعادة محاولة إعلان فاشل (آمنة) | `POST /api/actions/integration/retry_link/run` | Firebase Admin (Firestore/RTDB/Auth) + Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |
| مزامنة ستريمر من الموقع إلى قائمة البوت | `POST /api/actions/integration/sync_streamer/run` | Firebase Admin (Firestore/RTDB/Auth) + Bot DB Adapter + Discord REST + قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح — ⚠️ محفوظ لكن يُطبَّقه البوت بعد إعادة التشغيل (يظهر بحالة «معلّق») |
| مقارنة الستريمرين بين الموقع والبوت | `POST /api/actions/integration/compare_streamers/run` | Firebase Admin (Firestore/RTDB/Auth) + Bot DB Adapter + Discord REST | قراءة فقط (لا تغيير) |
| حالة فعالية على الموقع وديسكورد معاً | `POST /api/actions/integration/event_status/run` | Firebase Admin (Firestore/RTDB/Auth) + قاعدة اللوحة | قراءة فقط (لا تغيير) |
| حذف سجل ربط | `POST /api/actions/integration/delete_link/run` | قاعدة اللوحة | إعادة قراءة المصدر ومطابقتها للمطلوب؛ عدم التطابق = فشل لا نجاح |

## عروض البيانات (GET)

`GET /api/views/{section}/{view}?q=&cursor=&page=` — تصفية وترقيم من الخادم، لا تحمّل كل البيانات.

- `players.search` — بحث عن لاعب
- `players.punishments` — سجل العقوبات
- `players.notes` — ملاحظات المسؤولين
- `streamers.bridge` — بوابة الربط (bridgeStreamers) ← Firestore bridgeStreamers
- `streamers.active` — الستريمرز النشطون الآن (activeStreamers) ← Firestore activeStreamers
- `streamers.applications` — طلبات الانضمام (قراءة) ← Firestore streamerApplications
- `streamers.notes` — ملاحظات الستريمرز
- `games.catalog` — فهرس الألعاب ← gameBadges + MOD_SETTINGS_SCHEMA
- `games.settings` — الإعدادات الحالية (opsConfig) ← RTDB opsConfig/current
- `games.history` — سجل تعديلات الإعدادات ← RTDB opsConfig/history
- `games.playstats` — أكثر الألعاب لعباً (عينة أعلى 500 لاعب) ← Firestore levels.gamesPlayCount (عينة)
- `events.list` — فعاليات الستريمرز ← Firestore streamerEvents
- `events.leaders` — ترتيب المشاركين في الفعالية الجارية ← streamerEvents/{id}/sessions
- `events.event100` — فعالية «عدد جديد» (event100) ← Firestore event100/current
- `rewards.ledger` — سجل منح الإطارات
- `rewards.xpledger` — سجل تعديلات الخبرة
- `rewards.failed` — عمليات منح فاشلة (قابلة لإعادة المحاولة) ← سجل التدقيق
- `rewards.frames` — كتالوج الإطارات المعروفة ← FRAMES_CATALOG + framesCatalogExtra
- `shop.products` — المنتجات ← Firestore shopProducts
- `shop.sales` — عمليات الشراء والإهداء ← Firestore storeSales
- `shop.frames` — الإطارات الإضافية وظهورها ← Firestore framesCatalogExtra
- `codes.all` — كل الأكواد ← RTDB secretCodes
- `codes.attention` — أكواد منتهية أو مستنفدة ← RTDB secretCodes
- `messages.current` — الإعلان الحالي ← Firestore broadcastMessages/current
- `messages.scheduled` — المجدولة
- `messages.library` — مكتبة الإعلانات المحفوظة
- `messages.log` — سجل النشر ← سجل التدقيق
- `analytics.growth` — نمو الحسابات (آخر 30 يوماً) ← Firestore users.createdAt (count)
- `analytics.activity` — نشاط اللاعبين (آخر 14 يوماً) ← Firestore levels.updatedAt (count)
- `analytics.top` — أعلى 25 لاعباً خبرة ← Firestore levels (xp)
- `analytics.reports` — أرشيف التقارير
- `server.info` — معلومات السيرفر ← Discord API /guilds
- `server.channels` — القنوات والتصنيفات ← Discord API /guilds/{id}/channels
- `server.roles` — الرتب وصلاحياتها ← Discord API /guilds/{id}/roles
- `server.members` — البحث عن عضو ← Discord API /members/search
- `server.auditlog` — سجل Discord (Audit Log) ← Discord API /audit-logs
- `members.bans` — المحظورون ← Discord API /bans
- `members.warnings` — التحذيرات (قاعدة البوت) ← قاعدة البوت: warnings
- `members.modlog` — سجل الإشراف (قاعدة البوت) ← قاعدة البوت: moderation_log
- `commands.registry` — سجل الأوامر ← ملفات discord-bot/commands (قراءة فقط) + Discord API
- `commands.discord` — المسجّل فعلياً عند Discord ← Discord API /applications/{id}/commands
- `commands.disabled` — الأوامر المعطّلة من اللوحة
- `commands.inbot` — حالة الأوامر داخل البوت (استخدام 7 أيام) ← GET /admin-control/commands (حيّ من البوت)
- `automod.status` — حالة الحماية والاستثناءات ← قاعدة البوت: guild_settings + auto_mod_exemptions
- `automod.violations` — آخر المخالفات ← قاعدة البوت: auto_mod_violations
- `tickets.open` — التكتات المفتوحة ← قاعدة البوت: tickets
- `tickets.closed` — التكتات المغلقة ← قاعدة البوت: tickets
- `tickets.stats` — إحصائيات الدعم ← قاعدة البوت: tickets
- `tickets.supportroles` — رتب الدعم الحالية ← قاعدة البوت: guild_config.support_roles
- `welcome.config` — إعدادات الترحيب الحالية ← قاعدة البوت: guild_settings
- `admins.list` — قائمة الإدارة ← قاعدة البوت: bot_admin_config
- `admins.log` — سجل الإشراف ← قاعدة البوت: moderation_log
- `dstreamers.list` — الستريمرات المسجّلون ← قاعدة البوت: streamer_announcements
- `dstreamers.events` — سجل إعلانات البث ← قاعدة البوت: streamer_announcement_events
- `botdb.status` — الحالة والأعداد ← قاعدة البوت
- `access.matrix` — المصفوفة الحالية ← قاعدة اللوحة: settings/adminAccess
- `security.sessions` — الجلسات النشطة ← قاعدة اللوحة: sessions
- `security.logins` — سجل محاولات الدخول ← قاعدة اللوحة: loginLog
- `security.locks` — حالة قفل الحسابات وحظر IP
- `security.backups` — النسخ الاحتياطية ← ملفات data/backups
- `settings.current` — القيم الحالية ← قاعدة اللوحة: settings/app
- `settings.history` — سجل إصدارات الإعدادات
- `health.now` — الحالة الآن ← فحوصات فعلية
- `health.incidents` — سجل الأعطال
- `alerts.open` — التنبيهات ← قاعدة اللوحة: alerts
- `integration.links` — سجل الروابط والمزامنة
- `integration.failures` — عمليات نجحت في الموقع وفشلت في ديسكورد/البوت ← سجل التدقيق (آخر 7 أيام)

> إجراءات كتابة بلا `verify` مستقل: rewards.retry_failed, audit.undo_operation, health.run_all, health.run_check, health.prune_history, alerts.delete_resolved
