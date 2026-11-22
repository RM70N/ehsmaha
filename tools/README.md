# أدوات وصول Admin إلى Firebase (RTDB + Firestore)

تعمل بمفتاح Service Account **خارج المستودع** ولا تطبع المفتاح أو التوكن أبداً.

## التجهيز
```bash
python3 -m venv /tmp/ehsvenv && /tmp/ehsvenv/bin/pip install google-auth requests
install -m 600 /مسار/مفتاح.json /tmp/sa.json      # أو: export SA_KEY_FILE=/مسار/آمن/مفتاح.json
export RTDB_URL=https://streamgame-180b8-default-rtdb.europe-west1.firebasedatabase.app   # الافتراضي نفسه
```
المضيفات المطلوبة: `oauth2.googleapis.com`، `firestore.googleapis.com`، و`streamgame-180b8-default-rtdb.europe-west1.firebasedatabase.app`.

## Realtime Database
```bash
/tmp/ehsvenv/bin/python tools/rtdb.py get / --shallow
/tmp/ehsvenv/bin/python tools/rtdb.py get opsConfig/current
/tmp/ehsvenv/bin/python tools/rtdb.py patch adminAccess/UID '{"status":"suspended"}'            # يعرض الحالي والجديد فقط (dry-run)
/tmp/ehsvenv/bin/python tools/rtdb.py patch adminAccess/UID '{"status":"suspended"}' --confirm # ينفّذ بعد نسخة احتياطية
```
## Firestore
```bash
/tmp/ehsvenv/bin/python tools/firestore.py collections
/tmp/ehsvenv/bin/python tools/firestore.py list users --limit 3
/tmp/ehsvenv/bin/python tools/firestore.py get levels/kuser
/tmp/ehsvenv/bin/python tools/firestore.py update levels/kuser '{"xp":10}' --confirm   # updateMask للحقول المرسلة فقط
```
## الأمان
- الكتابة/الحذف **لا تُنفَّذ بدون `--confirm`** وتعرض الحالي والجديد أولاً (التعديل الجزئي فقط: PATCH / updateMask).
- قبل أي تعديل/حذف تُحفظ نسخة JSON في `~/.ehsmaha-backups` (خارج المستودع، صلاحيات 600).
- ممنوع الكتابة/الحذف على جذر RTDB، ولا حذف لمجموعات Firestore كاملة (وثيقة واحدة فقط).
- `sa.json` وكل `*firebase-adminsdk*.json` في `.gitignore`. بعد الانتهاء: `shred -u /tmp/sa.json` أو `rm /tmp/sa.json`.
