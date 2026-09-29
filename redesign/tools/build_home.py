#!/usr/bin/env python3
"""الرئيسية (#pg-home) = قسما #modes و#library من Streamer_Section حرفياً (xdc.py)، مربوطة بالدوال الحالية.

الربط (بلا بيانات وهمية):
  - شارة «مباشر» ← #home-conn-badge / #home-conn-badge-text (homeUpdateConnectionBadge الحالية)
  - «1,284 يشاهدون الآن» ← #home-platform-status-bar (حالة المنصات الحقيقية) — الرقم الوهمي محذوف
  - شات البث الوهمي ← محذوف؛ مكانه أزرار الربط الحقيقية (ابدأ بثاً سريعاً / إعادة الربط / الفعالية / الديسكورد)
  - بطاقات الأوضاع ← topnavGoSection('solo'|'party'|'online') + بطاقتا وردل والفئات (موجودتان بالموقع، بنفس شكل البطاقات الصغيرة)
  - تبويبات التصنيف ← ehsLibPick(cat) ← homeApplyFilter(cat) الحالية
  - بطاقة كل لعبة ← .gcard[data-tag][data-category] + onclick=goSetupX() الحالي + .gcard-name/.gcard-icon/[data-badge-slot]
    (يعتمد عليها التثبيت والشارات وترتيب المالك وgamesInfoByTag)
  python3 redesign/tools/build_home.py index.html
"""
import json, re, sys
sys.path.insert(0, 'redesign/tools')
from xdc import Converter, Ctx, extract
from bs4 import BeautifulSoup

p = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
T = 'redesign/design/streamer.xdc.html'

CATS = {
  'chat': dict(label='الدردشة التفاعلية', tag='دردشة', color='#A78BFF', desc='المتابعون يلعبون بالكتابة: كلمات وأوامر وسرعة رد.', radius='26px 26px 26px 8px', clip='none'),
  'luck': dict(label='الحظ والإقصاء', tag='حظ', color='#F59E0B', desc='جولات إقصاء متتالية، والحظ يحدد من يبقى حتى النهاية.', radius='8px', clip='polygon(16px 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%, 0 16px)'),
  'guess': dict(label='التخمين', tag='تخمين', color='#22D3EE', desc='لغز على الشاشة، وأول إجابة صحيحة في الشات تفوز.', radius='24px', clip='none'),
  'teams': dict(label='تحدي الفرق', tag='فرق', color='#34D399', desc='الشات ينقسم إلى فريقين، وكثافة التعليقات تحسم النتيجة.', radius='24px', clip='none'),
}
# [design id, cat, name, desc (التصميم حرفياً)] + وسم الموقع
# الأوصاف الخمسة المعلَّمة ✱ تخالف قاعدة اللعبة الفعلية بالموقع، فاستُبدلت بوصف دقيق بنفس الطول (مذكور بالتقرير)
GAMES = [
  ('race', 'chat', 'سباق الشات', 'كل رسالة خطوة لسيارتك، وأول من يصل خط النهاية يفوز.', 'cr'),  # ✱ «تدفع فريقها»: السباق فردي
  ('charged', 'chat', 'الزر المشحون', 'الشات يشحن الزر، ومن يضغطه لحظة الامتلاء يفوز.', 'battery'),
  ('lastletter', 'chat', 'آخر حرف', 'اكتب كلمة تبدأ بآخر حرف من الكلمة السابقة.', 'll'),
  ('reverse', 'chat', 'عكس الكلمة', 'كلمة مقلوبة، وأول من يكتبها صحيحة يأخذ النقطة.', 'rw'),
  ('crown', 'chat', 'سرقة التاج', 'التاج عند لاعب واحد، وأي إجابة صحيحة تنتزعه منه.', 'cs'),
  ('arrange', 'chat', 'ترتيب الحروف', 'حروف مبعثرة، رتّبها في الشات قبل غيرك.', 'lsc'),
  ('fastwords', 'chat', 'سباق الكلمات السريع', 'كلمة تظهر لثوانٍ، والأسرع كتابة يتصدّر.', 'wr'),
  ('maze', 'chat', 'المتاهة', 'الشات يوجّه اللاعب بالأوامر حتى يخرج من المتاهة.', 'maze'),
  ('top10', 'chat', 'توب 10', 'خمّنوا عناصر القائمة، وكل إجابة صحيحة تكشف خانة.', 'tt10'),
  ('vote', 'luck', 'التصويت بالإقصاء', 'الشات يصوّت، واللاعب الأقل أصواتاً يخرج.', 'ev'),
  ('sniper', 'luck', 'القناص', 'المتابع يحدد هدفه برقم، والإصابة لمن يسبق.', 'sniper'),
  ('ring', 'luck', 'دائرة الإقصاء', 'الدائرة تضيق كل جولة، ومن يبقى خارجها يُقصى.', 'rou'),
  ('bomb', 'luck', 'القنبلة المتحركة', 'القنبلة تنتقل بين اللاعبين، ولا تريدها معك عند الانفجار.', 'bomb'),
  ('box', 'luck', 'الصندوق العشوائي', 'صناديق مغلقة، كل واحد يخفي مكافأة أو مفاجأة.', 'box'),
  ('chair', 'luck', 'الكرسي المتحرك', 'الكراسي أقل من اللاعبين، ومن يبقى واقفاً يخرج.', 'chairs'),
  ('light', 'luck', 'الضوء الأخضر · الضوء الأحمر', 'تحرّك مع الأخضر وتوقف مع الأحمر، والخطأ يُقصيك.', 'rlgl'),
  ('glass', 'luck', 'الطريق الزجاجي', 'ألواح زجاجية، نصفها ينكسر تحت القدم.', 'glz'),
  ('lava', 'luck', 'الأراضي البركانية', 'الحمم ترتفع، والنجاة للقافز إلى الصخور الآمنة.', 'volcanic-lands'),
  ('lucky', 'luck', 'ضربة الحظ', 'كل لاعب مختبئ بصندوق، والضربة تُسقط صندوقاً كل مرة.', 'hz'),  # ✱ «مضاعفة النقاط»
  ('countries', 'luck', 'الدول', 'كل لاعب يختار دولة، والعجلة تحسم من يغزو من.', 'cw'),  # ✱ «الكفة تميل»
  ('findword', 'guess', 'اوجد الكلمة', 'كلمة سرية، والحروف الملونة تدلّكم على الإجابة.', 'main'),  # ✱ «شبكة حروف»
  ('topic', 'guess', 'خمّن الموضوع', 'كلمات تظهر تباعاً، وخمّن الموضوع الذي يجمعها.', 'guessword'),
  ('timing', 'guess', 'لعبة التوقيت', 'أوقف العدّاد عند الثانية المطلوبة بالضبط.', 'tmr'),
  ('who', 'guess', 'من أنا؟', 'الشخصية ظاهرة للجميع إلا للاعب. اسأل وخمّن.', 'wai'),
  ('price', 'guess', 'تخمين السعر', 'خمّن سعر المنتج، والأقرب يفوز بالجولة.', 'pgs'),
  ('ball', 'guess', 'اعثر على الكورة', 'ثلاثة أكواب تتبادل أماكنها. تابع الكورة.', 'findball'),
  ('draw', 'guess', 'خمن الرسمة', 'الرسمة تكتمل أمامكم، والأسرع تخميناً يفوز.', 'draw'),
  ('image', 'guess', 'خمن الصورة', 'إيموجيات ترمز لكلمة، فمن يعرفها أولاً؟', 'ig'),  # ✱ «صورة مغطاة»
  ('rope', 'teams', 'شد الحبل', 'فريقان من المتابعين، والحبل يميل مع كثافة التعليقات.', 'tug'),
]

src = open(p, encoding='utf-8-sig').read()

def match_div(s, i):
    """نهاية العنصر <div> اللي يبدأ عند i (عدّاد فتح/إغلاق، يتجاهل ما داخل <script>)"""
    depth = 0
    for m in re.finditer(r'<script\b.*?</script>|<div\b|</div>', s[i:], re.S):
        t = m.group(0)
        if t.startswith('<script'): continue
        depth += 1 if t == '<div' else -1
        if depth == 0: return i + m.end()
    raise ValueError('div غير مغلق')

hs = src.index('<div id="pg-home" class="page">')
he = match_div(src, hs)
home = src[hs:he]

# ما يلزم من الماركاب الحالي: onclick وأيقونة كل لعبة (gamesInfoByTag) + كتل الفعالية الحقيقية
old = {}
for m in re.finditer(r'<div class="gcard" data-tag="([^"]+)" data-category="([^"]+)" onclick="([^"]+)">(.*?)<div class="gcard-name">', home, re.S):
    icon = re.search(r'<div class="gcard-icon">(.*?)</div>\s*$', m.group(4), re.S)
    old[m.group(1)] = dict(cat=m.group(2), onclick=m.group(3), icon=icon.group(1) if icon else '')
if not old:  # إعادة بناء: البطاقات الحالية بالتصميم الجديد
    for c in BeautifulSoup(home, 'html.parser').select('.gcard[data-tag]'):
        ic = c.select_one('.gcard-icon')
        old[c['data-tag']] = dict(cat=c['data-category'], onclick=c['onclick'], icon=ic.decode_contents() if ic else '')
assert len(old) == 29, len(old)
def block(start):
    i = home.find(start)
    return home[i:match_div(home, i)] if i >= 0 else ''
keep_counter = block('<div class="home-live-counter" id="home-live-counter">')
keep_winners = block('<div class="home-event-winners" id="home-event-winners"')
keep_discord_href = (re.search(r'id="home-discord-btn" href="([^"]+)"', home) or [None, 'https://discord.gg/wsNNMqXEV'])[1]
assert keep_counter and keep_winners

cv = Converter('hm')
MC = {'streamer': '#8B5CF6', 'solo': '#C4B0FF', 'gatherings': '#EC4899', 'online': '#22D3EE'}
AT = {'streamer': '20% 30%', 'solo': '85% 15%', 'gatherings': '85% 55%', 'online': '85% 95%'}
crowdTx = ['translate(18px,-8px) rotate(-8deg)', 'translate(6px,10px) rotate(6deg)', 'translate(-6px,-12px) rotate(-4deg)', 'translate(-18px,6px) rotate(9deg)']
ctx = Ctx({
  'modeGlows': [{'op': 1 if k == 'streamer' else 0, 'glow': MC[k] + '30', 'at': AT[k]} for k in MC],
  'hotStreamer': "ehsModesHot('streamer')", 'hotSolo': "ehsModesHot('solo')", 'hotGather': "ehsModesHot('gatherings')",
  'hotOnline': "ehsModesHot('online')", 'coolModes': "ehsModesHot('streamer')",
  'viewers': '', 'streamChat': [],
  'crowd': [{'ch': ch, 'bg': '#EC4899' if i == 0 else '#2a1d4a', 'fg': '#0b0518' if i == 0 else '#EDE9FF', 'tx': crowdTx[i]} for i, ch in enumerate('سنفر')],
})

modes = cv.render(extract(T, '<section id="modes"', '<section id="library"'), ctx)
sm = BeautifulSoup(modes, 'html.parser')
sec = sm.find('section')
sec['data-hot'] = 'streamer'
for i, g in enumerate(sec.find_all('div', recursive=False)[:4]):
    g['data-mg'] = list(MC)[i]
cards = sec.find_all('a')
# بطاقة الستريمر: <a> ← <div> (فيها أزرار حقيقية؛ لا يجوز زر داخل رابط). النقر خارج الأزرار = نفس href="#library"
st = cards[0]; st.name = 'div'; del st['href']
st['role'] = 'link'; st['tabindex'] = '0'
st['onclick'] = "if(!event.target.closest('button,a'))ehsScrollLib()"
st['onkeydown'] = "if(event.key==='Enter'&&event.target===this)ehsScrollLib()"
pill = st.find('span', attrs={'style': re.compile('height:36px')})
pill['id'] = 'home-conn-badge'; pill['class'] = pill.get('class', []) + ['home-hero-badge', 'offline']
lab = pill.find_all('span', recursive=False)[-1]; lab['id'] = 'home-conn-badge-text'; lab.string = 'غير متصل'
viewers = pill.find_next_sibling('span')
viewers.clear(); viewers.name = 'div'; viewers['id'] = 'home-platform-status-bar'; viewers['style'] = 'display:none'
chat = st.find('div', attrs={'aria-hidden': 'true', 'style': re.compile('mask-image')})
del chat['aria-hidden']
chat['class'] = ['ehs-home-cta']
chat.append(BeautifulSoup(
  '<button type="button" class="ehs-cta ehs-cta--light" onclick="homeOpenQuickConnect()">ابدأ بثاً سريعاً</button>'
  '<button type="button" id="home-quick-reconnect-btn" class="ehs-cta ehs-cta--light" style="display:none" onclick="homeQuickReconnectClick()">ابدأ بثاً سريعاً — @<span id="home-quick-reconnect-user"></span></button>'
  '<button type="button" id="home-event-cta-btn" class="ehs-cta ehs-cta--ghost" style="display:none" onclick="show(\'contest-top20\')">الفعالية</button>'
  '<div class="home-discord-cta" id="home-discord-cta"><a class="ehs-cta ehs-cta--ghost home-discord-btn" id="home-discord-btn" href="%s" target="_blank" rel="noopener noreferrer">سيرفر احسمها بالديسكورد</a></div>' % keep_discord_href,
  'html.parser'))
for a, sect in zip(cards[1:], ('solo', 'party', 'online')):
    a['href'] = '#'; a['onclick'] = "topnavGoSection('%s');return false" % sect
# وردل والفئات: أوضاع موجودة بالموقع وغير موجودة بالتصميم — بطاقتان بنفس ستايل بطاقة «فردي» حرفياً، بلونَي الهوية
extra_col = cards[1].parent
for mode, title, sub, cta, color, onclick in (
    ('wordle', 'وردل', 'خمّن الكلمة العربية في ست محاولات.', 'العب الآن ←', '#34D399', "show('wordle-mode-select');return false"),
    ('categories', 'الفئات', 'أسئلة بفئات تختارها، والفريق الأسرع يحسمها.', 'ابدأ لعبة ←', '#F59E0B', "show('ahsemha-home');return false")):
    c = BeautifulSoup(str(cards[1]), 'html.parser').find('a')
    c['onclick'] = onclick; c['data-mode'] = mode
    for k in ('onmouseenter', 'onfocus'): c.attrs.pop(k, None)
    c['style'] = c['style'].replace('rgba(196,176,255,.14)', color + '24')
    spans = c.find('div').find_all('span', recursive=False)
    spans[0].string = title; spans[0]['style'] = spans[0]['style'].replace('#C4B0FF', color)
    spans[1].string = sub; spans[2].string = cta
    vis = c.find('div', attrs={'aria-hidden': 'true'})
    vis.clear(); vis['style'] = vis['style'].replace('border:1px solid rgba(196,176,255,.25)', 'border:1px solid %s40' % color)
    vis.append(BeautifulSoup('<span style="font-family:Cairo, sans-serif; font-weight:900; font-size:40px; color:%s">%s</span>' % (color, 'و' if mode == 'wordle' else 'ف'), 'html.parser'))
    extra_col.append(c)
extra_col['style'] = extra_col['style'].replace('repeat(3, minmax(0, auto))', 'repeat(5, minmax(0, auto))')
modes = str(sm)

# ---- المكتبة
games_ctx = []
for gid, cat, name, desc, tag in GAMES:
    c = CATS[cat]
    games_ctx.append(dict(id=gid, cat=cat, name=name, desc=desc, color=c['color'], tag=c['tag'], tagBg=c['color'] + '22', tint=c['color'] + '30',
                          edge=c['color'] + '2a', radius=c['radius'], clip=c['clip'], w='520px' if cat == 'teams' else '252px',
                          dashed=cat == 'guess', **{'is': {gid: True}}, play='ehsPlayCard(this)', open=old[tag]['onclick'], _tag=tag))
lctx = Ctx({
  'cats': [dict(label=c['label'], color=c['color'], count=sum(1 for g in GAMES if g[1] == k), sel='true' if k == 'chat' else 'false',
                bg=c['color'] if k == 'chat' else 'rgba(26,16,48,.7)', fg='#0b0518' if k == 'chat' else '#EDE9FF',
                border=c['color'] if k == 'chat' else 'rgba(167,139,255,.18)', countBg='rgba(11,5,24,.18)' if k == 'chat' else 'rgba(255,255,255,.06)',
                pick="ehsLibPick('%s')" % k, key=k) for k, c in CATS.items()],
  'curCat': CATS['chat'], 'games': games_ctx,
  'topRows': [dict(n=i, w='%d%%' % (96 - i * 9), a='none' if i % 2 else 'reveal', d=i * 80, bg='#A78BFF' if i % 2 else 'rgba(167,139,255,.15)') for i in range(1, 6)],
  'glassPanes': [dict(bg='rgba(196,176,255,.22)' if i in (0, 6, 2, 8, 4) else 'rgba(196,176,255,.06)', border='rgba(237,233,255,.45)' if i in (0, 6, 2, 8, 4) else 'rgba(237,233,255,.12)') for i in range(10)],
  'wordGrid': list('حسمهاقلبكتدرجعو'),
  'imgTiles': [dict(op=0 if i in (3, 7, 11) else 1, a='hide' if i in (2, 6, 8, 12) else 'none', d=i * 25) for i in range(15)],
})
lib = cv.render(extract(T, '<section id="library"', '<section id="setup"'), lctx)
sl = BeautifulSoup(lib, 'html.parser')
head = sl.find('section').find('div')
head['id'] = 'home-lib-head'
tabs = sl.find('div', attrs={'role': 'tablist'}); tabs['id'] = 'home-lib-filters'
for b, k in zip(tabs.find_all('button', recursive=False), CATS):
    b['class'] = b.get('class', []) + ['home-lib-filter'] + (['active'] if k == 'chat' else [])
    b['data-filter'] = k
head.find('p')['id'] = 'home-lib-desc'
track = sl.find('div', attrs={'data-track': '1'})
track['class'] = ['games-grid']
for el, g in zip(track.find_all('button', recursive=False), games_ctx):
    tag = g['_tag']
    el.name = 'div'; del el['type']
    el['role'] = 'button'; el['tabindex'] = '0'
    el['class'] = ['gcard'] + el.get('class', [])
    el['data-tag'] = tag; el['data-category'] = g['cat']
    el['onkeydown'] = "if((event.key==='Enter'||event.key===' ')&&event.target===this){event.preventDefault();this.click()}"
    if g['cat'] != 'chat': el['hidden'] = ''
    info = el.find_all('div', recursive=False)[1]
    row = info.find('span')
    row.find_all('span', recursive=False)[0]['class'] = ['gcard-name']
    info.find_all('span', recursive=False)[-1]['class'] = ['gcard-desc']
    el.find('div', attrs={'data-visual': '1'}).append(BeautifulSoup('<span class="badge" data-badge-slot></span>', 'html.parser'))
    el.append(BeautifulSoup('<span class="gcard-icon" hidden>%s</span><!--/icon-->' % old[tag]['icon'], 'html.parser'))
lib = str(sl)

html = ('<!-- ehs:home:start (مولَّد بـredesign/tools/build_home.py من Streamer_Section — لا تعدّله يدوياً) -->\n'
        '<div class="ehs-home" dir="rtl" lang="ar" style="position:relative; min-height:100dvh; overflow-x:clip; background:#0b0518; color:#EDE9FF; font-family:Tajawal, system-ui, sans-serif">\n'
        + modes + '\n' + keep_counter + '\n' + keep_winners + '\n' + lib +
        '\n</div>\n<!-- ehs:home:end -->')
css = '/* 45-home.css — مولَّد بـbuild_home.py: حالات hover/active لقسمَي #modes و#library */\n' + cv.css() + '\n'
open('redesign/css/45-home.gen.css', 'w', encoding='utf-8').write(css)

if '<!-- ehs:home:start' in home:
    new_home = re.sub(r'<!-- ehs:home:start.*?<!-- ehs:home:end -->', lambda m: html, home, flags=re.S)
else:
    # الاستبدال الأول: كل محتوى .home-wrap (البطل + المكتبة) — الـ<script> داخل الصفحة يبقى كما هو
    a = home.index('<div class="home-wrap">')
    b = match_div(home, a)
    scripts = ''.join(re.findall(r'<script\b.*?</script>', home[a:b], re.S))
    new_home = home[:a] + html + '\n' + scripts + home[b:]
src = src[:hs] + new_home + src[he:]
open(p, 'w', encoding='utf-8').write(src)
print('home: %d chars, %d state rules, %d cards' % (len(html), len(cv.rules), len(games_ctx)))
