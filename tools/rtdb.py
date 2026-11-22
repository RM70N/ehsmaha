#!/usr/bin/env python3
"""وصول Admin إلى Realtime Database عبر REST.
أمثلة:
  python3 tools/rtdb.py get / --shallow
  python3 tools/rtdb.py get opsConfig/current
  python3 tools/rtdb.py put adminAccess/UID '{"..."}'            # عرض الخطة فقط (dry-run)
  python3 tools/rtdb.py patch path '{"k":1}' --confirm           # ينفّذ بعد نسخة احتياطية
  python3 tools/rtdb.py delete path --confirm
الكتابة/الحذف لا تُنفَّذ بدون --confirm، وتُنسخ البيانات المتأثرة احتياطياً أولاً.
"""
import sys, json, argparse
import requests
from _auth import token, RTDB_URL, SCOPES_RTDB, backup


def call(method, path, body=None, params=None):
    path = path.strip('/')
    url = RTDB_URL + '/' + path + '.json' if path else RTDB_URL + '/.json'
    h = {'Authorization': 'Bearer ' + token(SCOPES_RTDB)}
    r = requests.request(method, url, headers=h, params=params or {}, data=None if body is None else json.dumps(body, ensure_ascii=False).encode('utf-8'), timeout=30)
    try:
        data = r.json()
    except Exception:
        data = r.text
    return r.status_code, data


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('method', choices=['get', 'put', 'patch', 'delete'])
    ap.add_argument('path')
    ap.add_argument('data', nargs='?', help='JSON للكتابة')
    ap.add_argument('--shallow', action='store_true')
    ap.add_argument('--confirm', action='store_true', help='تنفيذ الكتابة/الحذف فعلياً')
    ap.add_argument('--limit', type=int, default=0, help='limitToFirst للقراءة')
    a = ap.parse_args()
    m = a.method.upper()
    if m == 'GET':
        params = {}
        if a.shallow: params['shallow'] = 'true'
        if a.limit: params.update({'orderBy': '"$key"', 'limitToFirst': a.limit})
        s, d = call('GET', a.path, params=params)
        print(s); print(json.dumps(d, ensure_ascii=False, indent=1)[:20000]); return 0 if s == 200 else 1
    body = json.loads(a.data) if a.data is not None else None
    if m in ('PUT', 'PATCH') and body is None: sys.exit('أعطني JSON للكتابة')
    if not a.path.strip('/'): sys.exit('ممنوع الكتابة/الحذف على الجذر')
    s0, cur = call('GET', a.path)
    print('المسار:', a.path); print('الحالي:', json.dumps(cur, ensure_ascii=False)[:3000])
    if m != 'DELETE': print('الجديد (%s):' % m, json.dumps(body, ensure_ascii=False)[:3000])
    else: print('سيُحذف المسار بالكامل.')
    if not a.confirm:
        print('\n[dry-run] لم يُنفَّذ شيء. أضف --confirm بعد الموافقة.'); return 0
    print('نسخة احتياطية:', backup('rtdb_' + a.path.strip('/').replace('/', '_'), cur))
    s, d = call(m, a.path, body); print(s, json.dumps(d, ensure_ascii=False)[:2000]); return 0 if s == 200 else 1


if __name__ == '__main__':
    sys.exit(main())
