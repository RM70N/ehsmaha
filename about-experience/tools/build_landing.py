#!/usr/bin/env python3
"""يدمج صفحة «من نحن» (v2: عنقود المعاينات المربعة) داخل index.html (منطقة #pg-landing فقط). آمن للتكرار.
تشغيل من جذر المشروع:  python3 about-experience/tools/build_landing.py"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
AE = ROOT / 'about-experience'
S, S2 = AE / 'src', AE / 'src2'
INDEX = ROOT / 'index.html'
START, END = '<!-- ABOUT-EXPERIENCE:START (يولَّد من about-experience/src2، لا تعدّل يدوياً) -->', '<!-- ABOUT-EXPERIENCE:END -->'
OLD_START = '<!-- ABOUT-EXPERIENCE:START (يولَّد من about-experience/src، لا تعدّل يدوياً) -->'

def main():
    html = (S2 / 'page.html').read_text(encoding='utf-8')
    logo = (S / 'logo.svg').read_text(encoding='utf-8').strip()
    html = html.replace('{{LOGO1}}', logo.replace('lgLand1', 'lgA')).replace('{{LOGO2}}', logo.replace('lgLand1', 'lgB'))
    html = re.sub(r'\{\{POSTER:(\w+)\}\}', lambda m: f'/about-experience/posters/sq-{m.group(1)}.webp', html)
    assert '{{' not in html, 'unreplaced macro'
    css = (S2 / 'page.css').read_text(encoding='utf-8')
    js = (S2 / 'page.js').read_text(encoding='utf-8')
    esc = lambda o: json.dumps(o, ensure_ascii=False).replace('</', '<\\/')
    js = js.replace('/*__FAQ_ORIGINAL__*/[]', esc(json.loads((S / 'faq-original.json').read_text(encoding='utf-8'))))
    js = js.replace('/*__FAQ_NEW__*/[]', esc(json.loads((S2 / 'faq-sq.json').read_text(encoding='utf-8'))))
    assert '</script' not in js.lower()
    block = f'{START}\n<style>\n{css}\n</style>\n{html}\n<script>\n{js}\n</script>\n{END}'
    idx = INDEX.read_text(encoding='utf-8')
    for st in (START, OLD_START):
        if st in idx:
            a, b = idx.index(st), idx.index(END) + len(END)
            idx = idx[:a] + block + idx[b:]
            break
    else:
        raise SystemExit('markers not found')
    INDEX.write_text(idx, encoding='utf-8')
    print('landing injected', len(block) // 1024, 'KB')

main()
