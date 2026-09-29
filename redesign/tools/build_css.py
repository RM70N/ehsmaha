#!/usr/bin/env python3
"""يبني الـCSS الجديد ويحقنه في index.html كـ<style id="ehs-ui"> واحد بين علامتين.

  المصدر: redesign/css/*.css بترتيب أسمائها (00-behavior → 10-tokens → 20-base → ...)
          + @font-face من redesign/assets/fonts مضمّنة base64 (قرار: ملف واحد للنشر).
  python3 redesign/tools/build_css.py index.html
"""
import base64, glob, os, re, sys
p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
F = 'redesign/assets/fonts/'
AR = ('U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, '
      'U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC, U+102E0-102FB, U+10E60-10E7E, U+10EC2-10EC4, '
      'U+10EFC-10EFF, U+1EE00-1EEFF')
LATX = ('U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, '
        'U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF')
LAT = ('U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, '
       'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD')

def face(fam, weight, file, rng):
    b = base64.b64encode(open(F + file, 'rb').read()).decode()
    return ("@font-face{font-family:'%s';font-style:normal;font-weight:%s;font-display:swap;"
            "src:url(data:font/woff2;base64,%s) format('woff2');unicode-range:%s}" % (fam, weight, b, rng))

# Cairo ملف متغيّر واحد لكل مجموعة حروف (نفس الملف للأوزان 600–900 بالتصميم) → وجه واحد بمدى أوزان
fonts = [face('Cairo', '600 900', 'cairo-%s.woff2' % s, r) for s, r in (('arabic', AR), ('latin-ext', LATX), ('latin', LAT))]
for w in (400, 500, 700, 800):
    fonts += [face('Tajawal', w, 'tajawal-%d-arabic.woff2' % w, AR), face('Tajawal', w, 'tajawal-%d-latin.woff2' % w, LAT)]

# شارات البث (شعار ehsmaha.com + @ehsmaha7) — أصول هوية كانت داخل الـCSS القديم، تُضمَّن مرة وحدة كمتغيرات
def img(file, mime):
    return 'url(data:%s;base64,%s)' % (mime, base64.b64encode(open('redesign/assets/img/' + file, 'rb').read()).decode())
brand = ':root{--rf-logo-img:%s;--rf-tiktok-img:%s}' % (img('rf-logo.png', 'image/png'), img('rf-tiktok.png', 'image/png'))
parts = ['/* احسمها — الواجهة الجديدة. مولَّد بـredesign/tools/build_css.py من redesign/css — لا تعدّله هنا. */']
parts += fonts
parts.append(brand)
for f in sorted(glob.glob('redesign/css/*.css')):
    parts.append('/* ---- %s ---- */\n' % os.path.basename(f) + open(f, encoding='utf-8').read().strip())
css = '\n'.join(parts)

raw = open(p, 'rb').read(); bom = raw.startswith(b'\xef\xbb\xbf'); s = raw.decode('utf-8-sig')
block = '<!-- ehs-ui:start -->\n<style id="ehs-ui">\n%s\n</style>\n<!-- ehs-ui:end -->' % css
if '<!-- ehs-ui:start -->' in s:
    s = re.sub(r'<!-- ehs-ui:start -->.*?<!-- ehs-ui:end -->', lambda m: block, s, count=1, flags=re.S)
else:
    s = s.replace('<meta name="viewport"', block + '\n<meta name="viewport"', 1) if False else \
        re.sub(r'(</title>)', lambda m: m.group(1) + '\n' + block, s, count=1)
# JS الربط (redesign/js) — سكربت واحد قبل </body>
js = '\n'.join('/* ---- %s ---- */\n' % os.path.basename(f) + open(f, encoding='utf-8').read().strip() for f in sorted(glob.glob('redesign/js/*.js')))
jblock = '<!-- ehs-js:start -->\n<script id="ehs-ui-glue">\n%s\n</script>\n<!-- ehs-js:end -->' % js
if '<!-- ehs-js:start -->' in s:
    s = re.sub(r'<!-- ehs-js:start -->.*?<!-- ehs-js:end -->', lambda m: jblock, s, count=1, flags=re.S)
else:
    i = s.rindex('</body>'); s = s[:i] + jblock + '\n' + s[i:]
open(p, 'wb').write((b'\xef\xbb\xbf' if bom else b'') + s.encode('utf-8'))
print('ehs-ui css: %d chars (fonts %d) from %d files' % (len(css), sum(map(len, fonts)), len(glob.glob('redesign/css/*.css'))))
