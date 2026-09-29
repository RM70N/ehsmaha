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
node tests/bridge/all-games.js           # الـ29 لعبة: ربط ← فتح ← انضمام ← لعب ← رجوع
node tests/bridge/normalize.test.js      # تطبيع الكلمة والأرقام (28 حالة)
node tests/bridge/diag.test.js           # لوحة التشخيص: سبب كل محاولة انضمام
node tests/bridge/platforms-smoke.test.js  # تويتش/كيك/يوتيوب/ديسكورد
tests/bridge/servers.sh stop
# بروتوكول السيرفر وحمله (سيرفر مستقل):
BRIDGE_HEARTBEAT_MS=1000 PORT=18091 CTL_PORT=19091 node tests/bridge/start-server.js &
node tests/bridge/server-protocol.test.js
PORT=18093 CTL_PORT=19093 node tests/bridge/start-server.js &
node tests/bridge/server-load.test.js 20 15 20 15
# عقد الجسر + التعافي: غلاف messages، أفتار https، اتصال واحد لعميلين، /health،
# تصنيف أخطاء 2.5.0 (offline/not_found/blocked/sign_failed/429)، التراجع، بوابة 429 المشتركة:
EULER_API_KEY=dummy-test-key PORT=18095 CTL_PORT=19095 node tests/bridge/start-server.js &
T_PORT=18095 T_CTL=19095 node tests/bridge/bridge-contract.test.js
# الواجهة: حذف حقل مفتاح EulerStream بفعالية 100 + extractUser (بدون سيرفرات):
node tests/bridge/frontend-contract.test.js
```

Playwright غير مثبّت محلياً بالمستودع: مرّر مساره بـ`PLAYWRIGHT_PATH` (مثلاً
`/opt/node22/lib/node_modules/playwright`).

- `start-server.js` يفتح منفذ تحكم (19081/19082): `POST /ctl` بأوامر `chat/burst/mode/dropUpstream/...`، و`GET /stats`.
- `results-before.json` / `results-after.json`: القياسات قبل وبعد الإصلاحات.
- `REPORT.md`: التقرير الكامل. `MANUAL-TEST.md`: اختبار البث الحقيقي.
