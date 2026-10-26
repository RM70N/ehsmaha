#!/usr/bin/env python3
"""يبني صفحات المعاينة المعزولة من مصادر الألعاب الأصلية (دون تعديل أي ملف أصلي).
تشغيل:  python3 about-experience/tools/build_previews.py   (من جذر المشروع)
المخرجات: about-experience/previews/{countrywar,roulette,cannon}.html + pv-core.js"""
import re, base64, json, pathlib, shutil, sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
AE = ROOT / 'about-experience'
SRC = AE / 'src'
OUT = AE / 'previews'
OUT.mkdir(exist_ok=True)
INDEX = (ROOT / 'index.html').read_text(encoding='utf-8')

FONTS_CW = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet">'
FONTS_CN = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@500;700;800;900&family=Lalezar&display=swap" rel="stylesheet">'

# ---------------------------------------------------------------- helpers
def between(text, start, end, include_start=False):
    i = text.index(start)
    j = text.index(end, i + len(start))
    return text[i if include_start else i + len(start): j]

def style_block_after(marker):
    i = INDEX.index(marker)
    s = INDEX.index('<style>', i)
    e = INDEX.index('</style>', s)
    return INDEX[s + 7:e]

def lines_matching(prefixes):
    out = []
    for ln in INDEX.split('\n'):
        t = ln.lstrip()
        if any(t.startswith(p) for p in prefixes):
            out.append(ln)
    return '\n'.join(out)

# ---------------------------------------------------------------- countrywar
def build_countrywar():
    root_vars = between(INDEX, '<style>\n:root {', '}\n*{box-sizing', include_start=False)
    root_css = ':root {' + root_vars + '}'
    rd_css = style_block_after('ROUND SCREEN — NEW DESIGN (شاشات الراوند: حرب الدول')
    extra = lines_matching(['.cw-spin-result', '.cw-turn-', '.cw-flag-img{', '.cw-country-flag{', '.fx-shake{', '@keyframes fxShake'])
    # الرايات/أزرار تخص صفحات اللعبة الكاملة، لا مسرح الراوند
    flags = {}
    fdir = pathlib.Path('/home/claude/tools/node_modules/flag-icons/flags/4x3')
    for c in ['sa', 'kw', 'qa', 'ae']:
        flags[c] = 'data:image/svg+xml;base64,' + base64.b64encode((fdir / (c + '.svg')).read_bytes()).decode()
    css = f"""{root_css}
*{{box-sizing:border-box;margin:0;padding:0}}
html,body{{height:100%;background:#0b0518;color:#EDE9FF;overflow:hidden;font-family:'Tajawal',system-ui,sans-serif;direction:rtl}}
{rd_css}
{extra}
/* ---- مقاس المعاينة: المسرح يملأ الإطار بنسبته الأصلية 9:16 ---- */
#cw-stage{{width:100vw;height:100vh;height:100dvh;max-height:none;aspect-ratio:auto;border-radius:0;margin:0}}
#cw-stage .rd-btn.pv-press{{transform:translateY(.8cqw) scale(.97);filter:brightness(1.15)}}
html.pv-paused *{{animation-play-state:paused!important}}
/* بطاقة الفائز داخل المسرح (بنفس ألوان وخطوط شاشات الراوند) */
.pv-win{{position:absolute;inset:0;z-index:30;display:grid;place-items:center;background:radial-gradient(70% 50% at 50% 45%,rgba(227,195,106,.22),rgba(13,6,32,.92) 70%);animation:rdOvBack 6s ease both;animation-fill-mode:forwards}}
@keyframes pvWinIn{{0%{{opacity:0;transform:translateY(5cqw) scale(.9)}}100%{{opacity:1;transform:none}}}}
.pv-win-card{{display:flex;flex-direction:column;align-items:center;gap:2.4cqw;animation:pvWinIn .7s cubic-bezier(.16,1,.3,1) both}}
.pv-win-av{{width:30cqw;height:30cqw;border-radius:50%;overflow:hidden;border:.9cqw solid #E3C36A;box-shadow:0 0 8cqw rgba(227,195,106,.55)}}
.pv-win-av img{{width:100%;height:100%;object-fit:cover;display:block}}
.pv-win-k{{font-size:3.6cqw;font-weight:700;color:#E8A0C8;letter-spacing:.3cqw}}
.pv-win-name{{font-family:'Amiri',serif;font-size:13cqw;font-weight:700;color:#FFF3D4;line-height:1;text-shadow:0 0 5cqw rgba(227,195,106,.6)}}
.pv-win-country{{display:flex;align-items:center;gap:2.4cqw;font-size:5.4cqw;font-weight:800;color:#F6EBD0}}
.pv-win-country .cw-flag-img{{width:11cqw;height:auto;aspect-ratio:3/2;object-fit:contain;border-radius:1.2cqw}}
.pv-win-sub{{font-size:3.2cqw;font-weight:700;color:#C9B7E8}}
@media (prefers-reduced-motion:reduce){{.pv-win-card{{animation:none}}}}
"""
    body = (SRC / 'countrywar.body.html').read_text(encoding='utf-8')
    scen = (SRC / 'countrywar.scenario.js').read_text(encoding='utf-8')
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>معاينة لعبة الدول</title>
{FONTS_CW}
<style>{css}</style></head><body>
{body}
<script src="pv-core.js"></script>
<script>window.PV_FLAGS={json.dumps(flags)};</script>
<script>{scen}</script>
</body></html>"""
    (OUT / 'countrywar.html').write_text(html, encoding='utf-8')

# ---------------------------------------------------------------- roulette
def build_roulette():
    t = (ROOT / 'roulette3d.html').read_text(encoding='utf-8')
    # 1) تخزين مؤقت بالذاكرة بدل localStorage (لا نكتب فوق إعدادات الروليت الحقيقية)
    old_store = re.search(r"function store\(k,v\)\{.*?\n", t)
    assert old_store, 'store() not found'
    t = t.replace(old_store.group(0), "var __mem={}; function store(k,v){ if(v===undefined) return __mem[k]===undefined?null:JSON.parse(__mem[k]); if(v===null) delete __mem[k]; else __mem[k]=JSON.stringify(v); return null; }\n", 1)
    # 2) لا إرسال لأي رسالة للصفحة الأم من المحرك الأصلي
    t, n = re.subn(r"if\(EMBED\)\{ try\{ window\.parent\.postMessage\(ev,'\*'\); \}catch\(e\)\{\} \}", "", t)
    assert n == 1, 'postMessage patch'
    t = t.replace("var EMBED=/[?&]embed=1/.test(location.search)||(function(){ try{ return window.self!==window.top; }catch(e){ return true; } })();", "var EMBED=true;", 1)
    # 2b) نص حالة الخادم لا يناسب المعاينة
    assert "return 'النتائج يحددها الخادم';" in t
    t = t.replace("return 'النتائج يحددها الخادم';", "return 'قرار اللاعب بالشات يحدد النتيجة';")
    # 2c) رموز زخرفية (✦) من أسماء البوتات الأصلية: لا رموز أو إيموجي في المعاينة
    t = t.replace('\u2726', '')
    # 3) نواة المعاينة أول شيء
    t = t.replace('<head>', '<head>\n<script src="pv-core.js"></script>', 1) if '<head>' in t else '<script src="pv-core.js"></script>' + t
    css = """
<style>
/* ---- معاينة: إخفاء أدوات الستريمر وإبقاء المشهد الأصلي ---- */
#tools,#resume,#setM,#resM,#endBar,.ctl,#lobby .btns,#lobby .bt,#tryF{display:none!important}
html,body{margin:0;height:100%;overflow:hidden;background:#07040f}
html.pv-paused *{animation-play-state:paused!important}
</style>"""
    t = t.replace('</head>', css + '\n</head>', 1)
    scen = (SRC / 'roulette.scenario.js').read_text(encoding='utf-8')
    t = t.replace('</body>', '<script>' + scen + '</script>\n</body>', 1)
    (OUT / 'roulette.html').write_text(t, encoding='utf-8')

# ---------------------------------------------------------------- cannon
def build_cannon():
    def part(i):
        m = re.search(r'<script type="text/plain" id="%s">(.*?)</script>' % i, INDEX, re.S)
        assert m, i
        return m.group(1)
    css, dom, js = part('cannon-game-css'), part('cannon-game-dom'), part('cannon-game-js')
    host_line = "var HOST=null; try{ HOST=window.parent&&window.parent!==window?window.parent.__cannonHost:null; }catch(e){}"
    assert host_line in js
    js = js.replace(host_line, "var HOST=window.__pvHost||null;", 1)
    # اختصار فترات الانتظار للعرض فقط (لا نلمس الفيزياء ولا حساب المسافة)
    for old, new in [
        ("await sleep(1000); if(id!==roundId) return;\n  if(CFG.pen) stage(", "await sleep(650); if(id!==roundId) return;\n  if(CFG.pen) stage("),
        ("await sleep(2000); if(id!==roundId) return;\n  hideBubble(); cur=null; camMode='idle';\n  await sleep(500);", "await sleep(1300); if(id!==roundId) return;\n  hideBubble(); cur=null; camMode='idle';\n  await sleep(250);"),
    ]:
        assert old in js, old[:40]
        js = js.replace(old, new, 1)
    assert 'window.HC={' in js
    js = js.replace('window.HC={', 'window.__pv={cur:function(){return cur}};\nwindow.HC={', 1)
    CDN3 = ['https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js', 'https://unpkg.com/three@0.128.0/build/three.min.js']
    EXAMPLES = ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/MaskPass.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js']
    ex = [['https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/' + p, 'https://unpkg.com/three@0.128.0/examples/js/' + p] for p in EXAMPLES]
    loader = ('(function(){var T=%s,E=%s;' % (json.dumps(CDN3), json.dumps(ex)) +
        'function load(u,ok,bad){var i=0;(function n(){if(i>=u.length)return bad&&bad();var s=document.createElement("script");s.src=u[i++];s.onload=ok;s.onerror=function(){s.remove();n();};document.head.appendChild(s);})();}'
        'function run(){var s=document.createElement("script");s.text=document.getElementById("cannon-game-js").textContent;document.body.appendChild(s);}'
        'function ex(k){if(k>=E.length)return run();load(E[k],function(){ex(k+1);},function(){ex(k+1);});}'
        'load(T,function(){ex(0);},function(){run();});})();')
    scen = (SRC / 'cannon.scenario.js').read_text(encoding='utf-8')
    pcss = """
/* ---- معاينة: إخفاء لوحة الستريمر وزر الصوت، وإبقاء المشهد ولوحة الترتيب وسلم الهدايا ---- */
#deck,#snd{display:none!important}
html.pv-paused *{animation-play-state:paused!important}
"""
    html = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>معاينة المدفع البشري</title>
<style>[hidden]{{display:none!important}}html,body{{margin:0}}img{{max-width:100%}}</style>
{FONTS_CN}
<style>{css}{pcss}</style>
<script src="pv-core.js"></script>
</head><body>{dom}
<script type="text/plain" id="cannon-game-js">{js}</script>
<script>{scen}</script>
<script>{loader}</script>
</body></html>"""
    (OUT / 'cannon.html').write_text(html, encoding='utf-8')

if __name__ == '__main__':
    shutil.copyfile(SRC / 'pv-core.js', OUT / 'pv-core.js')
    which = sys.argv[1:] or ['countrywar', 'roulette', 'cannon']
    for w in which:
        {'countrywar': build_countrywar, 'roulette': build_roulette, 'cannon': build_cannon}[w]()
        print('built', w, (OUT / (w + '.html')).stat().st_size // 1024, 'KB')
