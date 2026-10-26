#!/usr/bin/env python3
"""يولّد نسخ المعاينات المربعة الحية (previews-sq/*.html) من previews/ (المبنية من المحركات الأصلية):
- تضمين نواة الساعة (src2/pv-core.js) وسيناريو التكرار (src2/*.scenario.js) داخل كل صفحة.
- ضبط الكاميرا والدقة وإخفاء عناصر HUD غير الضرورية لمربع صغير.
تشغيل من جذر المشروع:  python3 about-experience/tools/build_squares.py [game]"""
import pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[2]
AE = ROOT / 'about-experience'
OUT = AE / 'previews-sq'; OUT.mkdir(exist_ok=True)
S2 = AE / 'src2'
core = (S2 / 'pv-core.js').read_text(encoding='utf-8')

CSS = {
 'countrywar': """
.rd-stage,#cw-stage{border-radius:0}
#cw-spin-result{display:none!important}
.rd-foot{display:none!important}
""",
 'roulette': """
#lobby,#brand,#conn,#odds,#status,#notice{display:none!important}
#top{padding-top:14px}
""",
 'cannon': """
.brand .logo,.windcard,.ladder,.rec,.deck,.sndbtn,.toasts{display:none!important}
.top{top:12px}
.phase{min-width:0;padding:6px 18px 10px;font-size:15px}
.board{top:auto;bottom:14px;inset-inline-end:auto;inset-inline-start:12px;width:215px;max-height:34%}
.board h3{font-size:16px;padding:5px 10px}
.stage{top:48px;transform:scale(.72);transform-origin:top center}
.top{transform:scale(.8);transform-origin:top center}
.board{transform:scale(.8);transform-origin:bottom left}
""",
}
PATCH = {
 'roulette': [
  ('camera.aspect<0.9', 'camera.aspect<1.15'),
  ('Q.prMax', '0.62'),
  ('Math.max(0.75,pixelRatio-0.2)', 'Math.max(0.45,pixelRatio-0.1)'),
  ('pixelRatio>0.75', 'pixelRatio>0.45'),
 ],
 'cannon': [
  ('pr=Math.min(window.devicePixelRatio||1,IS_SMALL?1.5:1.75)', 'pr=0.62'),
 ],
 'countrywar': [],
}

def build(g):
    t = (AE / 'previews' / f'{g}.html').read_text(encoding='utf-8')
    assert '<script src="pv-core.js"></script>' in t
    t = t.replace('<script src="pv-core.js"></script>', '<script>' + ('window.__PV_FPS=30;' if g != 'countrywar' else '') + core.replace('</script', '<\\/script') + '</script>')
    i = t.index('<script>/* راوند توضيحي')
    j = t.index('</script>', i) + len('</script>')
    scen = (S2 / f'{g}.scenario.js').read_text(encoding='utf-8')
    assert '</script' not in scen
    t = t[:i] + '<script>' + scen + '</script>' + t[j:]
    for a, b in PATCH[g]:
        assert a in t, (g, a)
        t = t.replace(a, b)
    t = t.replace('</head>', '<style>' + CSS[g] + '</style>\n</head>', 1)
    (OUT / f'{g}.html').write_text(t, encoding='utf-8')
    print('built', g, len(t) // 1024, 'KB')

for g in (sys.argv[1:] or ['countrywar', 'roulette', 'cannon']):
    build(g)
