#!/usr/bin/env python3
"""وصول Admin إلى Firestore عبر REST مع تحويل القيم من/إلى صيغة Firestore.
أمثلة:
  python3 tools/firestore.py collections
  python3 tools/firestore.py list users --limit 3
  python3 tools/firestore.py get levels/kuser
  python3 tools/firestore.py create adminAccess/UID '{"role":"admin"}'      # dry-run
  python3 tools/firestore.py update levels/kuser '{"xp":10}' --confirm      # updateMask فقط للحقول المرسلة
  python3 tools/firestore.py delete path/to/doc --confirm
الكتابة/الحذف لا تُنفَّذ بدون --confirm، وتُنسخ الوثيقة الحالية احتياطياً أولاً. لا حذف لمجموعات كاملة.
"""
import sys, json, argparse
import requests
from _auth import token, PROJECT, SCOPES_FS, backup

BASE = 'https://firestore.googleapis.com/v1/projects/%s/databases/(default)/documents' % PROJECT


def to_fs(v):
    if v is None: return {'nullValue': None}
    if isinstance(v, bool): return {'booleanValue': v}
    if isinstance(v, int): return {'integerValue': str(v)}
    if isinstance(v, float): return {'doubleValue': v}
    if isinstance(v, str): return {'stringValue': v}
    if isinstance(v, list): return {'arrayValue': {'values': [to_fs(x) for x in v]}}
    if isinstance(v, dict):
        if set(v) == {'$timestamp'}: return {'timestampValue': v['$timestamp']}
        return {'mapValue': {'fields': {k: to_fs(x) for k, x in v.items()}}}
    raise TypeError(type(v))


def from_fs(v):
    (k, x), = v.items()
    if k == 'nullValue': return None
    if k == 'integerValue': return int(x)
    if k == 'doubleValue': return float(x)
    if k == 'arrayValue': return [from_fs(i) for i in x.get('values', [])]
    if k == 'mapValue': return {a: from_fs(b) for a, b in x.get('fields', {}).items()}
    return x  # string/boolean/timestamp/reference/bytes/geoPoint كما هي


def doc_to_py(d):
    return {'_name': d.get('name', '').split('/documents/')[-1], **{k: from_fs(v) for k, v in d.get('fields', {}).items()}}


def req(method, url, **kw):
    h = {'Authorization': 'Bearer ' + token(SCOPES_FS)}
    r = requests.request(method, url, headers=h, timeout=30, **kw)
    try: data = r.json()
    except Exception: data = r.text
    return r.status_code, data


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('cmd', choices=['collections', 'list', 'get', 'create', 'update', 'delete'])
    ap.add_argument('path', nargs='?', default='')
    ap.add_argument('data', nargs='?')
    ap.add_argument('--limit', type=int, default=5)
    ap.add_argument('--confirm', action='store_true')
    a = ap.parse_args(); p = a.path.strip('/')
    if a.cmd == 'collections':
        s, d = req('POST', BASE + ('/' + p if p else '') + ':listCollectionIds', json={'pageSize': 300})
        print(s); print(json.dumps(d.get('collectionIds', d), ensure_ascii=False, indent=1) if isinstance(d, dict) else d); return 0 if s == 200 else 1
    if a.cmd == 'list':
        s, d = req('GET', BASE + '/' + p, params={'pageSize': a.limit})
        print(s); print(json.dumps([doc_to_py(x) for x in d.get('documents', [])], ensure_ascii=False, indent=1)[:20000] if isinstance(d, dict) else d); return 0 if s == 200 else 1
    if a.cmd == 'get':
        s, d = req('GET', BASE + '/' + p); print(s); print(json.dumps(doc_to_py(d), ensure_ascii=False, indent=1) if s == 200 else d); return 0 if s == 200 else 1
    if len(p.split('/')) % 2: sys.exit('مسار الوثيقة يجب أن يحوي عدداً زوجياً من الأجزاء (مجموعة/وثيقة)')
    s0, cur = req('GET', BASE + '/' + p); cur_py = doc_to_py(cur) if s0 == 200 else None
    print('الوثيقة:', p); print('الحالية:', json.dumps(cur_py, ensure_ascii=False)[:3000])
    body = json.loads(a.data) if a.data else None
    if a.cmd != 'delete': print('الجديدة:', json.dumps(body, ensure_ascii=False)[:3000])
    else: print('ستُحذف هذه الوثيقة (وثيقة واحدة فقط).')
    if a.cmd == 'create' and cur_py is not None: sys.exit('الوثيقة موجودة؛ استخدم update')
    if not a.confirm: print('\n[dry-run] لم يُنفَّذ شيء. أضف --confirm بعد الموافقة.'); return 0
    if cur_py is not None: print('نسخة احتياطية:', backup('fs_' + p.replace('/', '_'), cur_py))
    if a.cmd == 'delete': s, d = req('DELETE', BASE + '/' + p)
    elif a.cmd == 'create': s, d = req('PATCH', BASE + '/' + p, json={'fields': {k: to_fs(v) for k, v in body.items()}}, params={'currentDocument.exists': 'false'})
    else:
        params = [('updateMask.fieldPaths', k) for k in body]; params.append(('currentDocument.exists', 'true'))
        s, d = req('PATCH', BASE + '/' + p, json={'fields': {k: to_fs(v) for k, v in body.items()}}, params=params)
    print(s, json.dumps(d, ensure_ascii=False)[:1500]); return 0 if s == 200 else 1


if __name__ == '__main__':
    sys.exit(main())
