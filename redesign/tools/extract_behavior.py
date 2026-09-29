#!/usr/bin/env python3
"""طبقة السلوك: تستخرج من أرشيف الـCSS القديم (redesign/legacy) قواعد الإظهار/الإخفاء فقط
اللي تعتمد عليها الـJS (display/visibility/pointer-events/opacity:0) — بدون أي خاصية تجميلية.

قاعدة تُؤخذ إذا:
  (1) فيها display:none / visibility:hidden / opacity:0 / pointer-events:none (حالة ابتدائية مخفية)، أو
  (2) محددها يحوي كلاساً تبدّله الـJS (contract.json → classes.js_toggled) أو [hidden]/[open]/[aria-*]/[data-*]
      وفيها display/visibility/pointer-events/opacity.
تُحفظ بنفس الترتيب والمحدد والـ!important (الـcascade نفسه)، وتُغلَّف @media كما كانت.

  python3 redesign/tools/extract_behavior.py > redesign/css/00-behavior.css
"""
import json, re, sys, glob
import tinycss2

c = json.load(open('redesign/contract.json'))
TOGGLED = {k for k, _ in (c['classes']['js_toggled'].items() if isinstance(c['classes']['js_toggled'], dict) else c['classes']['js_toggled'])}
TOGGLED |= {'active', 'visible', 'show', 'open', 'hidden'}
ATTR_RX = re.compile(r'\[(hidden|open|disabled|aria-[\w-]+|data-[\w-]+)')
PROPS = {'display', 'visibility', 'pointer-events', 'opacity'}
HIDE = {('display', 'none'), ('visibility', 'hidden'), ('opacity', '0'), ('pointer-events', 'none')}

def classes_in(sel):
    return set(re.findall(r'\.(-?[_a-zA-Z][\w-]*)', sel))

def decls_of(block):
    out = []
    for d in tinycss2.parse_blocks_contents(block, skip_comments=True, skip_whitespace=True):
        if d.type != 'declaration': continue
        v = tinycss2.serialize(d.value).strip()
        out.append((d.lower_name, v, d.important))
    return out

OPAC = []
PASS2 = False
stats = {'rules_seen': 0, 'rules_kept': 0, 'decls_kept': 0, 'keyframes_skipped': 0}

def walk(rules, depth=0):
    global PASS2
    out = []
    for r in rules:
        if r.type == 'qualified-rule':
            stats['rules_seen'] += 1
            sel = tinycss2.serialize(r.prelude).strip()
            # عناصر زخرفية (::before/::after/scrollbar) ملك التصميم الجديد — مو سلوك
            parts = [x.strip() for x in sel.split(',') if not re.search(r'::?(before|after|-webkit-scrollbar|-webkit-details-marker)', x)]
            if not parts: continue
            sel = ',\n'.join(parts)
            full = decls_of(r.content)
            animated = any(n in ('animation', 'animation-name') for n, _, _ in full)
            ds = [(n, v, imp) for n, v, imp in full if n in PROPS]
            # opacity:0 مع animation = دخول متحرك (حركة التصميم القديم) مو حالة — ما نأخذه
            if animated: ds = [x for x in ds if x[0] != 'opacity']
            if not ds: continue
            hides = any((n, v.lower().replace(' ', '')) in HIDE for n, v, _ in ds)
            stateful = bool(classes_in(sel) & TOGGLED) or bool(ATTR_RX.search(sel)) or ':not(' in sel
            if not (hides or stateful): continue
            if not stateful:
                # حالة ابتدائية فقط: نأخذ خصائص الإخفاء وحدها (عرض flex/grid الأساسي شكل مو سلوك)
                ds = [x for x in ds if (x[0], x[1].lower().replace(' ', '')) in HIDE]
            else:
                # قواعد الحالة: opacity تُؤخذ فقط لو 0 أو 1 (تبديل ظهور)، مو درجات شفافية تجميلية
                ds = [x for x in ds if x[0] != 'opacity' or x[1].strip() in ('0', '1')]
            if not ds: continue
            if PASS2 and not stateful and any(x[0] == 'opacity' for x in ds) and last_class(sel) not in PAIRED:
                ds = [x for x in ds if x[0] != 'opacity']
                if not ds: continue
            if any(x[0] == 'opacity' for x in ds):
                OPAC.append((sel, stateful, [x for x in ds if x[0] == 'opacity'][0][1].strip()))
            stats['rules_kept'] += 1; stats['decls_kept'] += len(ds)
            body = ';'.join('%s:%s%s' % (n, v, ' !important' if imp else '') for n, v, imp in ds)
            out.append('%s{%s}' % (sel, body))
        elif r.type == 'at-rule':
            kw = r.lower_at_keyword
            if kw in ('media', 'supports', 'container', 'layer') and r.content is not None:
                inner = walk(tinycss2.parse_rule_list(r.content, skip_comments=True, skip_whitespace=True), depth + 1)
                if inner:
                    out.append('@%s %s{\n%s\n}' % (kw, tinycss2.serialize(r.prelude).strip(), '\n'.join(inner)))
            elif kw == 'keyframes' or kw.endswith('keyframes'):
                stats['keyframes_skipped'] += 1
    return out

files = sorted(glob.glob('redesign/legacy/[0-9]*.css'))
def last_class(sel):
    # أول id/كلاس في آخر مركّب (الأساس اللي تنطبق عليه حالة .show/.open)
    cl = re.findall(r'([.#]-?[_a-zA-Z][\w-]*)', sel.split(',')[0].split()[-1])
    return cl[0] if cl else None
# المرور الأول: نجمع قواعد opacity لنعرف أي أساس opacity:0 له حالة opacity:1 تقابله
for f in files:
    walk(tinycss2.parse_stylesheet(open(f, encoding='utf-8').read(), skip_comments=True, skip_whitespace=True))
PAIRED = {last_class(sel) for sel, st, v in OPAC if st and v == '1'}
# «#x.open #y» يقابل أساس «#x»: نضيف كل id/كلاس بالمحدد اللي يحمل حالة
PAIRED |= {t for sel, st, v in OPAC if st and v == '1' for t in re.findall(r'([.#]-?[_a-zA-Z][\w-]*)', sel)}
for k in stats: stats[k] = 0
PASS2 = True
print('/* === 00-behavior.css — مولَّد بـredesign/tools/extract_behavior.py من أرشيف الـCSS القديم.')
print('   سلوك إظهار/إخفاء فقط تعتمد عليه الـJS (لا ألوان/أحجام/خطوط). لا تعدّله يدوياً. === */')
for f in files:
    rules = tinycss2.parse_stylesheet(open(f, encoding='utf-8').read(), skip_comments=True, skip_whitespace=True)
    kept = walk(rules)
    if kept:
        print('/* %s */' % f.split('/')[-1])
        print('\n'.join(kept))
print(json.dumps(stats), file=sys.stderr)
