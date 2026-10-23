# «انصب علي» (مركز الاتصالات 3D) — الخادم

اللعبة ملف مستقل `callcenter3d.html` (بلا أي تعديل) يُفتح من بطاقة **انصب علي** بصفحة «ألعاب فردية». المحادثة الحية تمر عبر سيرفر Render (`/cc/v1/*`) بـ Gemini.

## متغيرات Render (على **السيرفرين** الأساسي والاحتياطي)
| المتغير | الوظيفة |
|---|---|
| `GEMINI_API_KEY` | مفتاح Gemini. يقبل أيضاً `GEMINI_API_KEY_2…`، `GEMINI_API_KEYS=k1,k2`، `GOOGLE_API_KEY` (أي صيغة قائمة بفواصل/أسطر). المفاتيح تُستعمل بالتناوب مع تهدئة عند 429 وتعطيل المرفوض |
| `GEMINI_CHAT_MODELS` / `GEMINI_STT_MODELS` / `GEMINI_TTS_MODELS` | اختياري: قوائم نماذج بفواصل (الافتراضي gemini-2.5-flash ثم 2.0-flash؛ TTS: gemini-2.5-flash-preview-tts) — لو الأول غير متاح ينتقل للتالي |
| `CC_SECRET` | اختياري لكن موصى به: سر توقيع نقاط الحفظ (ثابت عبر إعادة التشغيل). الافتراضي مشتق من المفاتيح |
| `CC_DAILY_TURNS` | سقف رسائل Gemini باليوم (الافتراضي 20000) |
| `CC_STT=0` / `CC_TTS=0` | تعطيل الصوت→نص / النص→صوت |
| `CC_STAGE` | `public` (الافتراضي) أو `internal` (للمالك فقط) |
| `CC_OWNER_EMAIL` | بريد المالك للوحة الخدمة (الافتراضي بريد المالك بالموقع) |

بلوغ الإقلاع: `event=gemini keys=N tails=…` (آخر ٤ خانات فقط).

## المسارات
`GET /cc/v1/config` · `POST /cc/v1/session` · `POST /cc/v1/{state, day/*, call/*, event, coffee, app, op/*, shop/*, progress/reset}` · `POST /cc/v1/stt` · `POST /cc/v1/tts` · `POST /cc/v1/admin/{status,test-keys}` (للمالك بتوكن فايربيس).

الموقع يختار تلقائياً السيرفر الذي مفاتيح Gemini عنده منضبطة (الأساسي ثم الاحتياطي)، ولو الاثنان واقعان تشتغل اللعبة بوضع التدريب المحلي.

## الاختبارات
```bash
cd tiktok-server && node --test test/cc-api.test.js        # الخادم مع محاكي Gemini (12 اختباراً)
MOCK_GEMINI_PORT=19500 node tests/bridge/mock-gemini.js &   # ثم السيرفران ببيئة GEMINI_API_BASE/GEMINI_API_KEY (راجع رأس الملف)
node tests/bridge/callcenter.test.js                        # المتصفح الحقيقي: بطاقة ← لعبة ← Gemini ← صوت ← حفظ ← تحويل السيرفرين (31 فحصاً)
```
