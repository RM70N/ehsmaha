#!/usr/bin/env python3
"""محوّل قوالب x-dc (ملفات التصميم) إلى HTML عادي بلا أي runtime.

الماركاب والستايل ينتقلان حرفياً: نفس العناصر ونفس style="" بالضبط. الفرق فقط:
  - {{ expr }}  ← تُحسب من ctx (قيم حقيقية أو كود JS للأحداث)
  - sc-for / sc-if ← تُفرد/تُحذف وقت البناء
  - style-hover / style-active / style-focus ← كلاس مولَّد + قاعدة :hover/:active/:focus (!important
    لأن الستايل الأصلي inline) — نفس سلوك الـruntime
  - sc-camel-on-X="{{ fn }}" ← onX="<كود JS من ctx>" (أو يُحذف لو القيمة None)
  - sc-camel-view-box ← viewBox
  - يُحذف: ref / data-screen-label / hint-* (أدوات التصميم)
"""
import hashlib, re
from bs4 import BeautifulSoup, NavigableString, Tag, Comment

EXPR = re.compile(r'\{\{\s*(.*?)\s*\}\}')


class Ctx:
    def __init__(self, *layers):
        self.layers = [l for l in layers if l is not None]

    def push(self, d):
        return Ctx(d, *self.layers)

    def get(self, path):
        parts = path.split('.')
        for layer in self.layers:
            if parts[0] in layer:
                v = layer[parts[0]]
                for p in parts[1:]:
                    if isinstance(v, dict):
                        v = v.get(p)
                    else:
                        v = getattr(v, p, None)
                return v
        raise KeyError('xdc: قيمة غير معرّفة في السياق: ' + path)


def _s(v):
    if v is True: return 'true'
    if v is False: return 'false'
    if v is None: return ''
    if isinstance(v, float) and v.is_integer(): v = int(v)
    return str(v)


def interp(text, ctx):
    return EXPR.sub(lambda m: _s(ctx.get(m.group(1))), text)


class Converter:
    def __init__(self, prefix='x'):
        self.prefix = prefix
        self.rules = {}  # css -> class

    def state_class(self, pseudo, decls):
        decls = ';'.join(d.strip() + ('' if '!important' in d else ' !important') for d in decls.split(';') if d.strip())
        key = pseudo + '{' + decls
        if key not in self.rules:
            h = hashlib.md5(key.encode()).hexdigest()[:6]
            self.rules[key] = '%s-%s%s' % (self.prefix, {'hover': 'h', 'active': 'a', 'focus': 'f'}[pseudo], h)
        return self.rules[key]

    def css(self):
        out = []
        for key, cls in self.rules.items():
            pseudo, decls = key.split('{', 1)
            sel = '.%s:%s' % (cls, pseudo)
            if pseudo == 'hover':
                sel = '@media (hover:hover){.%s:hover{%s}}' % (cls, decls)
                out.append(sel); continue
            out.append('%s{%s}' % (sel, decls))
        return '\n'.join(out)

    def render(self, html, ctx):
        soup = BeautifulSoup(html, 'html.parser')
        frag = BeautifulSoup('', 'html.parser')
        for node in list(soup.contents):
            for out in self._node(node, ctx, frag):
                frag.append(out)
        return str(frag)

    def _node(self, node, ctx, factory):
        if isinstance(node, Comment):
            return []
        if isinstance(node, NavigableString):
            return [NavigableString(interp(str(node), ctx))]
        if not isinstance(node, Tag):
            return []
        if node.name == 'sc-for':
            items = ctx.get(EXPR.search(node['list']).group(1)) or []
            name = node['as']
            out = []
            for it in items:
                sub = ctx.push({name: it})
                for c in node.contents:
                    out += self._node(c, sub, factory)
            return out
        if node.name == 'sc-if':
            if ctx.get(EXPR.search(node['value']).group(1)):
                out = []
                for c in node.contents:
                    out += self._node(c, ctx, factory)
                return out
            return []
        el = factory.new_tag(node.name)
        classes = []
        for k, v in node.attrs.items():
            if isinstance(v, list): v = ' '.join(v)
            if k in ('ref', 'data-screen-label') or k.startswith('hint-'):
                continue
            if k in ('style-hover', 'style-active', 'style-focus'):
                classes.append(self.state_class(k.split('-')[1], interp(v, ctx)))
                continue
            if k.startswith('sc-camel-on-'):
                m = EXPR.fullmatch(v.strip())
                js = ctx.get(m.group(1)) if m else v
                if js:
                    ev = 'on' + k[len('sc-camel-on-'):].replace('-', '')
                    el[ev] = js
                continue
            if k == 'sc-camel-view-box':
                el['viewBox'] = interp(v, ctx); continue
            if k.startswith('sc-camel-'):
                parts = k[len('sc-camel-'):].split('-')
                el[parts[0] + ''.join(p.title() for p in parts[1:])] = interp(v, ctx); continue
            val = interp(v, ctx)
            if k == 'class':
                classes.insert(0, val); continue
            el[k] = val
        if classes:
            el['class'] = ' '.join(c for c in classes if c)
        for c in node.contents:
            for out in self._node(c, ctx, factory):
                el.append(out)
        return [el]


def extract(template_path, start_marker, end_marker):
    """يقتطع جزءاً من قالب التصميم بين علامتين نصيّتين (شامل البداية، غير شامل النهاية)."""
    s = open(template_path, encoding='utf-8').read()
    i = s.index(start_marker)
    j = s.index(end_marker, i + len(start_marker)) if end_marker else len(s)
    return s[i:j]
