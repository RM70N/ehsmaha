# اختبارات التحويل التلقائي Firestore → Realtime Database

- `failover.test.mjs` (وحدات، بدون شبكة): `node --test tests/failover/failover.test.mjs`
- `e2e_site.mjs` (الموقع الحقيقي + محاكيات Firebase بقواعد المستودع الفعلية، مع محاكاة انتهاء الحصة):
  1. `npm i firebase@12.15.0 firebase-tools` في مجلد (مثلاً /tmp/fbemu) ونسخ `firestore.rules` و`database.rules.json` له مع `firebase.json` (auth 9099, firestore 8080, database 9000)
  2. `firebase emulators:start --only auth,firestore,database --project streamgame-180b8` (بدون HTTP_PROXY)
  3. `python3 -m http.server 8790` من جذر المستودع
  4. `FB_NM=/tmp/fbemu/node_modules/firebase node tests/failover/e2e_site.mjs`

مفتاح إيقاف يدوي للطبقة: `localStorage.setItem('ehs_fs_failover_off','1')`.
