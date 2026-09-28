import re, json, base64, gzip, sys, os
src, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
h = open(src, encoding='utf-8').read()
blk = lambda k: re.search(r'<script type="__bundler/%s">\s*(.*?)\s*</script>' % k, h, re.S).group(1)
open(out+'/template.html','w',encoding='utf-8').write(json.loads(blk('template')))
man=json.loads(blk('manifest'))
for uid, m in man.items():
    d = base64.b64decode(m['data']); d = gzip.decompress(d) if m.get('compressed') else d
    ext = {'text/javascript':'js','application/javascript':'js','font/woff2':'woff2','text/css':'css'}.get(m['mime'],'bin')
    open(f'{out}/{uid}.{ext}','wb').write(d)
    print(uid, m['mime'], len(d))
