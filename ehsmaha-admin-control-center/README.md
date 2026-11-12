# EHSEMHA — ADMIN CONTROL CENTER

مركز إدارة مستقل لمنصة **احسمها**: لوحة واحدة تدير **الموقع** (Firebase) و**سيرفر ديسكورد** و**البوت** — دون تعديل أي ملف من المشروعين الأصليين.

- **حسابان حصريان فقط:** `OWNER` (المالك — كل شيء + التحكم بصلاحيات الأدمن) و`ADMIN` (الأدمن — بحسب ما يسمح به المالك). لا تسجيل، لا إنشاء حساب، لا استعادة.
- **226 إجراءً حقيقياً** (160 كتابة + 66 قراءة/تقارير) في **25 قسماً** (212 ظاهر + 2 داخليان للتراجع)، و**67 عرض بيانات**. كل إجراء ينفّذ عملية فعلية ويتحقق من نتيجتها بإعادة قراءة المصدر الأصلي قبل أن يقول «تم».
- مرجع الأزرار: [`ADMIN-ACTIONS-REGISTRY.md`](ADMIN-ACTIONS-REGISTRY.md) · الربط: [`BUTTON-INTEGRATION-MAP.md`](BUTTON-INTEGRATION-MAP.md) · الحالة: [`FEATURE-STATUS.md`](FEATURE-STATUS.md) · غير المدعوم: [`UNSUPPORTED-ACTIONS.md`](UNSUPPORTED-ACTIONS.md).

## البنية

```
المتصفح (واجهة «Command Architecture» ملف HTML واحد، RTL، بلا أسرار)  ──HTTPS──▶  Backend (Node 22 + Express 5)  ──▶  Firebase Admin SDK (Firestore/RTDB/Auth)
                                                    │   جلسة HttpOnly + CSRF           ──▶  Discord REST (توكن البوت — في الخادم فقط)
                                                    │   صلاحيات تُفرض في كل طلب        ──▶  قاعدة البوت (PostgreSQL/SQLite) — نفس جداول البوت
                                                    ▼                                  ──▶  ملفات أوامر البوت (قراءة فقط) + /health
                                       قاعدة اللوحة المستقلة (SQLite): تدقيق، جلسات، صلاحيات، إعدادات، تنبيهات، مجدول
```

محرك الإجراءات (`server/actions/engine.js`) هو قلب النظام: صلاحية ← تحقق مدخلات (Zod) ← قدرة الاتصال ← تأكيد ← مفتاح عدم التكرار ← قراءة القيمة الحالية ← تنفيذ ← **إعادة قراءة المصدر للتحقق** ← سجل تدقيق (سلسلة تجزئة) ← نتيجة حقيقية. الواجهة والتوثيق والاختبارات كلها تُشتق من سجل واحد (`server/actions/sections/*`).

> **ملاحظة تقنية:** الواجهة هي ملف `web/index.html` الجاهز (تصميم NEW_ADMINN منسوخاً حرفياً بلا أي تعديل: CSS + JS + خطوط مضمّنة) وتتصل بنفس واجهات `/api/*`. سياسة CSP تسمح بسكربتها المضمّن **بالبصمة SHA-256 فقط** (تُحسب عند الإقلاع). الواجهة JavaScript حديثة **بلا خطوة بناء** والخادم JavaScript (وليس React/TypeScript) — اختيار مقصود لتقليل الاعتماديات والأعطال؛ التحقق من المدخلات بـZod.

## التشغيل المحلي

```bash
cd ehsmaha-admin-control-center
npm install
# ولّد مشتقات كلمات المرور (Argon2id) — لا تُخزَّن كلمات المرور نفسها في أي مكان
npm run hash-password          # للمالك  ← انسخ الناتج إلى OWNER_PASSWORD_HASH
npm run hash-password          # للأدمن  ← ADMIN_PASSWORD_HASH
cp .env.example .env           # عبّئ القيم (ضع قيمة الـhash بين علامتي ' ' لأنها تحتوي $)
npm start                      # http://localhost:8787
```

للتطوير فقط (وليس الإنتاج) يمكن وضع `OWNER_PASSWORD` / `ADMIN_PASSWORD` نصّاً صريحاً — يُتجاهلان تماماً عند `NODE_ENV=production`.

## متغيرات البيئة

| المتغير | مطلوب | الوصف |
|---|---|---|
| `OWNER_PASSWORD_HASH` / `ADMIN_PASSWORD_HASH` | ✅ | مشتقات Argon2id من `npm run hash-password` |
| `NODE_ENV=production` | ✅ | يفعّل كوكي `__Host-` + `Secure` + HSTS |
| `PUBLIC_ORIGIN` | موصى | أصل اللوحة (مثل `https://admin.ehsmaha.com`) للتحقق من Origin |
| `TRUST_PROXY` | عند وجود Proxy | `true` خلف Render/Nginx ليُقرأ IP الحقيقي |
| `ADMIN_STORE_PATH` | ✅ | ملف SQLite للوحة — **اربطه بقرص دائم** وإلا ضاع التدقيق والإعدادات عند إعادة النشر |
| `FIREBASE_SERVICE_ACCOUNT` | للموقع | JSON كامل أو base64 (لا يصل المتصفح أبداً) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_DATABASE_URL` | — | افتراضياً مشروع الموقع `streamgame-180b8` و RTDB الأوروبي |
| `DISCORD_BOT_TOKEN` / `DISCORD_APPLICATION_ID` / `DISCORD_GUILD_ID` | لديسكورد | نفس توكن البوت — إجراءات السيرفر عبر Discord REST |
| `BOT_DATABASE_URL` أو `BOT_SQLITE_PATH` | لإعدادات البوت | **نفس** قاعدة البوت. على Render يستخدم البوت SQLite محلياً — اضبط له `DATABASE_URL` (PostgreSQL) وضع الرابط نفسه هنا |
| `BOT_DIR` | لسجل الأوامر | مسار مجلد `discord-bot` (قراءة فقط) |
| `BOT_HEALTH_URL` | لحالة البوت | مثل `https://<bot>.onrender.com/health` |
| `ADMIN_CONTROL_KEY` (+ `BOT_API_BASE_URL`) | موصى | مفتاح قناة `/admin-control` داخل البوت (32+ حرف، **نفس قيمة البوت**). يفعّل: تطبيق الستريمرات/المشرفين حياً، تعطيل/تقييد الأوامر داخل البوت، إحصاءات الأوامر الدائمة، حدود السبام، التكتات |
| `BOT_API_BASE_URL` + `BOT_API_KEY` | اختياري | API البوت الداخلي (المفتاح في الخادم فقط) |
| `BRIDGE_HEALTH_URL`, `SITE_URL` | اختياري | فحص خدمة ربط البث والموقع |
| `SESSION_IDLE_MINUTES`, `SESSION_MAX_HOURS` | — | تُعدَّل لاحقاً من داخل اللوحة |

كل ميزة تعتمد على خدمة غير مُهيّأة تظهر **«غير متاحة» مع السبب** (لا نجاح مزيّف).

## النشر المستقل

- **Docker:** `docker build -t ehsmaha-admin . && docker run -p 8787:8787 --env-file .env -v admin-data:/app/data ehsmaha-admin`
- **Render:** `render.yaml` جاهز (خدمة ويب + قرص دائم 1GB). أضف الأسرار من لوحة Render.
- **VPS:** `NODE_ENV=production node server/index.js` خلف Nginx/Caddy بـHTTPS، مع `pm2`/`systemd`. افتح اللوحة **على نطاق فرعي مستقل** وفضّل حمايتها بطبقة إضافية (Cloudflare Access/VPN) — فهي تملك Admin SDK للموقع.
- فحص الصحة: `GET /api/auth/state` (200).

## النسخ الاحتياطي والاستعادة

- من «مركز الأمان» ← **إنشاء نسخة احتياطية** (`VACUUM INTO` في `data/backups`) ثم **التحقق من سلامتها** (`integrity_check` + عدد سجلات التدقيق).
- **الاستعادة (يدوية مدروسة):** أوقف الخدمة ← انسخ ملف النسخة فوق `ADMIN_STORE_PATH` ← شغّل الخدمة ← نفّذ «التحقق من سلامة سلسلة التدقيق». لا زر استعادة من الواجهة عمداً (استبدال القاعدة الحية خطر).
- بيانات الموقع/البوت نفسها لا تُنسخ من هنا (مصدرها Firebase/قاعدة البوت).

## الاختبارات

```bash
npm test                 # الوحدات + الأمان + الصلاحيات + الأعطال (بلا محاكيات)  — 47 اختباراً
npm run test:integration # الكل مع محاكيات Firebase الرسمية (Firestore/Auth/RTDB) + Discord وهمي + الواجهة — 92 اختباراً
npm run gen-docs         # يعيد توليد ADMIN-ACTIONS-REGISTRY / BUTTON-INTEGRATION-MAP / BUTTON-TEST-REPORT
```
اختبار الواجهة يحتاج Playwright (+ Chromium) ويُتخطّى تلقائياً إن لم يتوفر. التفاصيل: [`TEST-REPORT.md`](TEST-REPORT.md).

## القواعد التي تحكم المشروع

1. لا تعديل لأي ملف في الموقع أو البوت (الاعتماد على قراءة ملفاتهما أو الاتصال بخدماتهما فقط).
2. كل ما يتغير يُحفظ فعلياً في مصدره الأصلي ويُتحقق منه — وإلا تُعاد رسالة الفشل الحقيقية.
3. كتابة قاعدة البوت ≠ تغيير سلوكه: كل إجراء يحمل حالة تطبيق (**فوري / ≤10د / يحتاج إعادة تشغيل**) مثبتة من كود البوت وتظهر للمسؤول (انظر `INTEGRATION-MAP.md`).
4. الصلاحيات في الخادم عند كل طلب؛ إخفاء الزر وحده لا يكفي.
