"""مصادقة Service Account (المفتاح من ملف خارج المستودع). لا يطبع المفتاح ولا التوكن أبداً."""
import os, sys, json
import google.auth.transport.requests
from google.oauth2 import service_account

PROJECT = os.environ.get('FIREBASE_PROJECT', 'streamgame-180b8')
RTDB_URL = os.environ.get('RTDB_URL', 'https://streamgame-180b8-default-rtdb.europe-west1.firebasedatabase.app').rstrip('/')
BACKUP_DIR = os.path.expanduser(os.environ.get('EHS_BACKUP_DIR', '~/.ehsmaha-backups'))
SCOPES_RTDB = ['https://www.googleapis.com/auth/firebase.database', 'https://www.googleapis.com/auth/userinfo.email']
SCOPES_FS = ['https://www.googleapis.com/auth/datastore']


def _key_file():
    p = os.environ.get('SA_KEY_FILE', '/tmp/sa.json')
    if not os.path.exists(p):
        sys.exit('مفتاح الخدمة غير موجود: ' + p + ' (ضع المسار في SA_KEY_FILE)')
    if os.stat(p).st_mode & 0o077:
        sys.exit('صلاحيات ملف المفتاح مفتوحة؛ نفّذ: chmod 600 ' + p)
    return p


def token(scopes):
    creds = service_account.Credentials.from_service_account_file(_key_file(), scopes=scopes)
    creds.refresh(google.auth.transport.requests.Request())
    return creds.token


def backup(label, data):
    """نسخة احتياطية محلية (خارج المستودع) قبل أي تعديل/حذف."""
    import time, re
    os.makedirs(BACKUP_DIR, mode=0o700, exist_ok=True)
    f = os.path.join(BACKUP_DIR, '%d_%s.json' % (int(time.time()), re.sub(r'[^A-Za-z0-9._-]+', '_', label)[:80]))
    with open(f, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.chmod(f, 0o600)
    return f
