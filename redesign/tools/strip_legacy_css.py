#!/usr/bin/env python3
"""المرحلة 2: حذف التصميم القديم من index.html.

- كل <style> (عدا ahsemha-board-score-color-style اللي تكتب فيه الـJS) تُؤرشف
  بـredesign/legacy/NN.css للرجوع فقط، ثم تُحذف.
- <link rel=stylesheet> وpreconnect لـGoogle Fonts تُحذف.
- style="" بالماركاب (خارج <script>/<style>): يبقى display:none فقط (سلوكي — الـJS
  تبدّله)، وكل خاصية تجميلية تُحذف. الخاصية الفاضية تُحذف كاملة.
- قوالب الـJS لا تُلمس هنا (225 style= داخلها) — تُعالج مع كل قسم.

  python3 redesign/tools/strip_legacy_css.py index.html
"""
import re, sys, os, json
p = sys.argv[1]
raw = open(p, 'rb').read()
bom = raw.startswith(b'\xef\xbb\xbf')
s = raw.decode('utf-8-sig')
os.makedirs('redesign/legacy', exist_ok=True)
KEEP_STYLE_IDS = {'ahsemha-board-score-color-style'}

# 1) تقسيم إلى مقاطع: سكربت/غيره — لا نلمس داخل <script>
parts = re.split(r'(<script\b[^>]*>.*?</script>)', s, flags=re.S)
n_style = 0; archived = []; n_link = 0; st = {'attrs_seen': 0, 'attrs_removed': 0, 'attrs_kept_display_none': 0}

def strip_styles(chunk):
    global n_style
    def rep(m):
        global n_style
        attrs, body = m.group(1), m.group(2)
        idm = re.search(r'id="([^"]+)"', attrs)
        if idm and idm.group(1) in KEEP_STYLE_IDS:
            return m.group(0)
        n_style += 1
        label = (idm.group(1) if idm else '') or (re.search(r'/\*\s*(.{0,60}?)\s*\*/', body) or [None, ''])[1]
        fn = 'redesign/legacy/%02d-%s.css' % (n_style, re.sub(r'[^\w\-]+', '_', label)[:40] or 'block')
        open(fn, 'w', encoding='utf-8').write(body)
        archived.append({'file': fn, 'id': idm.group(1) if idm else None, 'chars': len(body)})
        return ''
    return re.sub(r'<style\b([^>]*)>(.*?)</style>', rep, chunk, flags=re.S)

def strip_links(chunk):
    global n_link
    def rep(m):
        global n_link
        tag = m.group(0)
        if re.search(r'rel=["\']stylesheet', tag) or ('fonts.googleapis' in tag or 'fonts.gstatic' in tag):
            n_link += 1; return ''
        return tag
    return re.sub(r'<link\b[^>]*>\s*', rep, chunk)

def strip_inline(chunk):
    def rep(m):
        st['attrs_seen'] += 1
        decls = [d.strip() for d in m.group(1).split(';') if d.strip()]
        keep = [d for d in decls if re.fullmatch(r'display\s*:\s*none(\s*!important)?', d, flags=re.I)]
        if keep:
            st['attrs_kept_display_none'] += 1
            return ' style="display:none"'
        st['attrs_removed'] += 1
        return ''
    return re.sub(r'\sstyle="([^"]*)"', rep, chunk)

out = []
for i, part in enumerate(parts):
    if i % 2 == 1:
        out.append(part); continue
    part = strip_styles(part)
    part = strip_links(part)
    part = strip_inline(part)
    out.append(part)
s2 = ''.join(out)
open(p, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + s2.encode('utf-8'))
json.dump({'style_blocks_removed': n_style, 'links_removed': n_link, 'inline': st, 'archived': archived},
          open('redesign/legacy/index.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('style blocks removed', n_style, '| links', n_link, '|', st, '| size', len(s), '->', len(s2))
