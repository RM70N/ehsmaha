#!/usr/bin/env python3
"""ملف مستقل واحد لصفحة «من نحن» v2 (عنقود المعاينات المربعة): about-standalone-v2.html"""
import base64, json, pathlib, re
AE = pathlib.Path(__file__).resolve().parents[1]
S2, S = AE / 'src2', AE / 'src'
html = (S2 / 'page.html').read_text(encoding='utf-8')
logo = (S / 'logo.svg').read_text(encoding='utf-8').strip()
html = html.replace('{{LOGO1}}', logo.replace('lgLand1', 'lgA')).replace('{{LOGO2}}', logo.replace('lgLand1', 'lgB'))
for g in ('countrywar', 'roulette', 'cannon'):
    b = base64.b64encode((AE / 'posters' / f'sq-{g}.webp').read_bytes()).decode()
    html = html.replace('{{POSTER:%s}}' % g, 'data:image/webp;base64,' + b)
assert '{{' not in html
prev = {g: (AE / 'previews-sq' / f'{g}.html').read_text(encoding='utf-8') for g in ('countrywar', 'roulette', 'cannon')}
esc = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
js = (S2 / 'page.js').read_text(encoding='utf-8')
js = js.replace('/*__FAQ_ORIGINAL__*/[]', esc(json.loads((S / 'faq-original.json').read_text(encoding='utf-8'))))
js = js.replace('/*__FAQ_NEW__*/[]', esc(json.loads((S2 / 'faq-sq.json').read_text(encoding='utf-8'))))
# LOADFIX
l0 = "this.frame.src = this.el.getAttribute('data-src');"
assert l0 in js
js = js.replace(l0, "this.frame.srcdoc = (window.LP_PREVIEWS || {})[this.game] || '';")
css = (S2 / 'page.css').read_text(encoding='utf-8')
out = f'''<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>من نحن — احسمها</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">
<style>
:root{{color-scheme:dark}}*{{box-sizing:border-box}}html{{scroll-behavior:auto}}body{{margin:0;background:#0b0518;color:#EDE9FF;direction:rtl}}
{css}
</style></head><body>
{html.replace('<div id="pg-landing" class="page"', '<div id="pg-landing" class="page active"', 1)}
<script>window.LP_PREVIEWS = {esc(prev)};</script>
<script>
/* ربط تجريبي: أزرار البدء تفتح الموقع */
function show(){{ window.open('https://ehsemha.com', '_blank', 'noopener'); }}
{js}
document.addEventListener('DOMContentLoaded', function(){{ landingBoot(); }});
</script>
</body></html>
'''
o = AE / 'about-standalone-v2.html'
o.write_text(out, encoding='utf-8')
print(o, len(out) // 1024, 'KB')
