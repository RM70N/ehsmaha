#!/usr/bin/env python3
"""يبني redesign/contract.json من index.html الحالي — كل ما تعتمد عليه الـJS من الواجهة.

  python3 redesign/tools/build_contract.py [index.html] [out.json]

المخرجات:
  ids.static            كل id موجود بالماركاب الثابت
  ids.js_literal        id تقرؤه/تكتبه الـJS بنص حرفي (getElementById/querySelector('#')/$('..'))
  ids.js_dynamic        أنماط id مركّبة (tag + '-dot' ...) مع أمثلة
  ids.js_missing_static ids حرفية بالـJS وغير موجودة بالماركاب (تُنشأ ديناميكياً أو ميتة)
  ids.duplicates        ids مكررة بالماركاب
  classes.js_toggled    كلاس ← عدد مرات classList.add/remove/toggle/contains/replace
  classes.js_selectors  كلاسات بـquerySelector('.x') و closest('.x')
  classes.js_templates  كلاسات داخل قوالب innerHTML / سلاسل JS (class="...")
  classes.js_className  تعيينات className = '...'
  handlers.inline       onXxx="..." ← الدوال المستدعاة + هل هي معرّفة
  handlers.listeners    addEventListener('event') ← عدد
  navigation.show       كل show('x') ← هل pg-x موجود
  style_js              عناصر/أنماط تتحكم بها الـJS: style.display / cssText / setProperty / <style> محقونة
  dataset               مفاتيح dataset المستخدمة
  stats                 أحجام الوضع الحالي
"""
import re, json, sys, collections

src = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
out = sys.argv[2] if len(sys.argv) > 2 else 'redesign/contract.json'
html = open(src, encoding='utf-8-sig').read()

# ---- فصل السكربتات عن الماركاب
scripts = []
def _grab(m):
    attrs, body = m.group(1), m.group(2)
    if 'src=' not in attrs and not re.search(r'type=["\'](application/ld\+json|application/json)', attrs):
        scripts.append(body)
    return '<script' + attrs + '></script>'
markup = re.sub(r'<script([^>]*)>(.*?)</script>', _grab, html, flags=re.S)
styles = re.findall(r'<style[^>]*>(.*?)</style>', markup, re.S)
markup_nostyle = re.sub(r'<style[^>]*>.*?</style>', '', markup, flags=re.S)
js = '\n'.join(scripts)

C = collections.Counter
S = lambda xs: sorted(set(xs))

# ---- IDs
static_ids = re.findall(r'\sid="([^"]+)"', markup_nostyle)
dup = [k for k, v in C(static_ids).items() if v > 1]
lit = []
lit += re.findall(r"getElementById\(\s*['\"]([\w\-]+)['\"]\s*\)", js)
lit += re.findall(r"querySelector(?:All)?\(\s*['\"]#([\w\-]+)['\"]", js)
lit += re.findall(r"(?<![\w.])\$\(\s*['\"]([\w\-]+)['\"]\s*\)", js)
dyn = collections.defaultdict(list)
for m in re.finditer(r"getElementById\(\s*([^)]*?(?:\+|`)[^)]*)\)", js):
    expr = m.group(1).strip()
    pat = re.sub(r"\$\{[^}]*\}", '*', expr)
    pat = re.sub(r"'([^']*)'|\"([^\"]*)\"", lambda x: x.group(1) or x.group(2) or '', pat)
    pat = re.sub(r"[A-Za-z_][\w.\[\]()']*\s*\+\s*|\s*\+\s*[A-Za-z_][\w.\[\]()']*", '*', pat).replace('`', '').replace(' ', '')
    pat = re.sub(r'\*+', '*', pat)
    if len(dyn[pat]) < 3: dyn[pat].append(expr[:80])
static_set = set(static_ids)
missing = [i for i in S(lit) if i not in static_set]

# ---- Classes
tog = C()
for m in re.finditer(r"classList\.(add|remove|toggle|contains|replace)\(([^)]*)\)", js):
    for c in re.findall(r"['\"]([\w\-]+)['\"]", m.group(2)): tog[c] += 1
sel = S(re.findall(r"(?:querySelector(?:All)?|closest|matches)\(\s*['\"][^'\"]*?\.([\w\-]+)", js))
tmpl = C()
for m in re.finditer(r"class=\\?[\"']([^\"'$`{}\\]+)", js):
    for c in m.group(1).split():
        if re.match(r'^[\w\-]+$', c): tmpl[c] += 1
cn = C()
for m in re.finditer(r"className\s*[+]?=\s*['\"`]([^'\"`]*)['\"`]", js):
    for c in re.sub(r'\$\{[^}]*\}', ' ', m.group(1)).split():
        if re.match(r'^[\w\-]+$', c): cn[c] += 1

# ---- كل كلاس معرّف بالـCSS الحالي (للمقارنة لاحقاً بالـCSS الجديد)
css = '\n'.join(styles)
css_classes = set(re.findall(r'\.([A-Za-z_][\w\-]*)', re.sub(r'url\([^)]*\)|/\*.*?\*/', '', css, flags=re.S)))
js_class_all = set(tog) | set(sel) | set(tmpl) | set(cn)

# ---- Handlers
defined_fns = set(re.findall(r'(?:^|[\s;}])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)', js))
defined_fns |= set(re.findall(r'window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function|\()', js))
defined_fns |= set(re.findall(r'(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function|\([^)]*\)\s*=>|[\w$]+\s*=>)', js))
inline = collections.defaultdict(lambda: {'count': 0, 'calls': set()})
for m in re.finditer(r'\s(on[a-z]+)="([^"]*)"', markup_nostyle + '\n' + js):
    ev, code = m.group(1), m.group(2)
    for f in re.findall(r'(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(', code):
        if f in ('if', 'return', 'function', 'typeof', 'event', 'this', 'confirm', 'alert', 'parseInt', 'Number', 'String', 'Math', 'setTimeout', 'encodeURIComponent'): continue
        inline[f]['count'] += 1
        inline[f]['calls'].add(ev)
handlers_inline = {f: {'count': v['count'], 'events': S(v['calls']), 'defined': f in defined_fns} for f, v in sorted(inline.items())}
listeners = C(re.findall(r"addEventListener\(\s*['\"]([\w\-]+)['\"]", js))

# ---- Navigation
shows = C(re.findall(r"\bshow\(\s*['\"]([\w\-]+)['\"]\s*\)", markup_nostyle + '\n' + js))
pages = S(re.findall(r'\sid="pg-([\w\-]+)"', markup_nostyle))
nav = {p: {'calls': n, 'page_exists': ('pg-' + p) in static_set} for p, n in sorted(shows.items())}

# ---- style من الـJS
style_js = {
    'style.display': len(re.findall(r'\.style\.display\s*=', js)),
    'style.cssText': len(re.findall(r'\.style\.cssText\s*[+]?=', js)),
    'style.setProperty': len(re.findall(r'\.style\.setProperty\(', js)),
    'style.other_props': dict(C(re.findall(r'\.style\.([a-zA-Z]+)\s*=', js)).most_common(40)),
    'createElement_style': len(re.findall(r"createElement\(\s*['\"]style['\"]", js)),
    'insertRule': len(re.findall(r'\.insertRule\(', js)),
    'inline_style_attr_in_js_templates': len(re.findall(r'style=\\?["\']', js)),
}
# متغيرات CSS تكتبها الـJS (لازم يستهلكها الـCSS الجديد بنفس الأسماء) ومواضع cssText
css_vars_from_js = S(re.findall(r"style\.setProperty\(\s*['\"](--[\w\-]+)", js))
csstext_sites = [m.group(0)[:120] for m in re.finditer(r"[\w.\[\]'()]+\.style\.cssText\s*=\s*['\"][^'\"]{0,100}", js)]
injected_style_elements = S(re.findall(r'<style id="([\w\-]+)"', markup))
# دوال معرّفة ديناميكياً: window[N + 'Suffix'] = ...
dyn_suffixes = S(re.findall(r"window\[\s*\w+\s*\+\s*['\"](\w+)['\"]\s*\]\s*=", js))
dataset = S(re.findall(r'\.dataset\.([A-Za-z_]\w*)', js) + [re.sub(r'-(\w)', lambda x: x.group(1).upper(), k) for k in re.findall(r'data-([\w\-]+)=', markup_nostyle)])

inline_style_attrs = re.findall(r'\sstyle="([^"]*)"', markup_nostyle)
behav = [s for s in inline_style_attrs if re.fullmatch(r'\s*display\s*:\s*none\s*;?\s*', s)]

contract = {
    'source': src,
    'stats': {
        'lines': html.count('\n') + 1,
        'style_blocks': len(styles), 'style_chars': sum(len(s) for s in styles),
        'link_stylesheets': len(re.findall(r'<link[^>]+rel=["\']stylesheet', markup)),
        'font_face_rules': len(re.findall(r'@font-face', css)),
        'inline_style_attrs': len(inline_style_attrs), 'inline_style_display_none_only': len(behav),
        'pages_pg': len(pages), 'static_ids': len(static_ids), 'scripts': len(scripts), 'js_chars': len(js),
    },
    'ids': {
        'static_count': len(static_set), 'duplicates': dup,
        'js_literal': S(lit), 'js_literal_count': len(set(lit)),
        'js_missing_static': missing,
        'js_dynamic_patterns': dict(sorted(dyn.items())),
    },
    'classes': {
        'js_toggled': dict(tog.most_common()),
        'js_selectors': sel,
        'js_templates': dict(tmpl.most_common()),
        'js_className': dict(cn.most_common()),
        'js_all_count': len(js_class_all),
        'js_classes_without_current_css': S(c for c in js_class_all if c not in css_classes),
    },
    'handlers': {
        'inline': handlers_inline,
        'dynamic_window_suffixes': dyn_suffixes,
        'inline_undefined': S(f for f, v in handlers_inline.items() if not v['defined'] and not any(f.endswith(x) for x in dyn_suffixes)),
        'inline_defined_dynamically': S(f for f, v in handlers_inline.items() if not v['defined'] and any(f.endswith(x) for x in dyn_suffixes)),
        'listeners': dict(listeners.most_common()),
    },
    'navigation': {'show': nav, 'show_missing_page': S(p for p, v in nav.items() if not v['page_exists']), 'pages': pages},
    'style_js': dict(style_js, css_vars_set_by_js=css_vars_from_js, cssText_sites=csstext_sites, injected_style_elements=injected_style_elements,
                     inline_style_props=dict(C(k.strip().lower() for st in inline_style_attrs for k in re.findall(r'([\w\-]+)\s*:', st)).most_common(60))),
    'dataset': dataset,
}
json.dump(contract, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
st = contract['stats']
print(json.dumps(st, ensure_ascii=False))
print('ids js_literal', contract['ids']['js_literal_count'], 'missing_static', len(missing), 'dup', len(dup), 'dyn patterns', len(dyn))
print('classes js_toggled', len(tog), 'selectors', len(sel), 'templates', len(tmpl), 'className', len(cn), 'no-css', len(contract['classes']['js_classes_without_current_css']))
print('inline handler fns', len(handlers_inline), 'undefined', contract['handlers']['inline_undefined'][:20])
print('show() targets', len(nav), 'missing pages', contract['navigation']['show_missing_page'])
print('style_js', json.dumps({k: v for k, v in style_js.items() if k != 'style.other_props'}))
