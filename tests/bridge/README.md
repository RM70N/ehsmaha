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
tests/bridge/servers.sh stop
```

- `start-server.js` يفتح منفذ تحكم (19081/19082): `POST /ctl` بأوامر `chat/burst/mode/dropUpstream/...`، و`GET /stats`.
- `results-before.json` / `results-after.json`: القياسات قبل وبعد الإصلاحات.
