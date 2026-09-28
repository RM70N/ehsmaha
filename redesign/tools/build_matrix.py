#!/usr/bin/env python3
"""مصفوفة المطابقة (أ/ب/ج) لكل صفحة pg-* ← redesign/matrix.md + matrix.json

  أ = موجود بالتصميم والموقع: يُستبدل الماركاب/CSS بالتصميم مع إبقاء IDs والمعالجات.
  ب = بالموقع فقط: يُصمَّم بنفس لغة التصميم (tokens/أشكال/حركة).
  ج = بالتصميم فقط: يُضاف ويُربط ببيانات حقيقية (مدرجة بقسم منفصل — مو صفحات).
"""
import json, re, sys
c = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'redesign/contract.json'))
pages = c['navigation']['pages']

# تصميم ← وسم الموقع ← صفحة الإعداد ← صفحة اللعبة (تحققنا من وجودها كلها بالعقد)
STREAMER = [
  ('race','cr','setup-cr','cr','chat'), ('charged','battery','setup-battery','battery','chat'),
  ('lastletter','ll','setup-lastletter','lastletter','chat'), ('reverse','rw','setup-reverseword','reverseword','chat'),
  ('crown','cs','setup-crownsteal','crownsteal','chat'), ('arrange','lsc','setup-letterscramble','letterscramble','chat'),
  ('fastwords','wr','setup-wordrace','wordrace','chat'), ('maze','mz','setup-maze','maze','chat'),
  ('top10','tt10','setup-tt10','tt10','chat'), ('vote','ev','setup-ev','ev','luck'),
  ('sniper','sniper','setup-sniper','sniper','luck'), ('ring','rou','setup-roulette','roulette','luck'),
  ('bomb','bomb','setup-bomb','bomb','luck'), ('box','box','setup-box','box','luck'),
  ('chair','chairs','setup-chairs','chairs','luck'), ('light','rlgl','setup-rlgl','rlgl','luck'),
  ('glass','glz','setup-glz','glz','luck'), ('lava','volcanic-lands','setup-volcanic-lands','volcanic-lands','luck'),
  ('lucky','hz','setup-hz','hz','luck'), ('countries','cw','setup-countrywar','countrywar','luck'),
  ('findword','main','setup','dash','guess'), ('topic','gw','setup-guessword','guessword','guess'),
  ('timing','tmr','setup-timer','timer','guess'), ('who','wai','setup-whoami','whoami','guess'),
  ('price','pgs','setup-priceguess','priceguess','guess'), ('ball','findball','setup-findball','findball','guess'),
  ('draw','draw','setup-draw','draw','guess'), ('image','ig','setup-ig','ig','guess'), ('rope','tug','setup-tug','tug','teams'),
]
GS_FULL = {'race', 'bomb', 'timing', 'rope'}  # مصمَّمة بالكامل بـGame_Screens
SOLO = ['oneletter', 'guesscountry', 'timersolo', 'gwsolo', 'findballsolo', 'memorybuttons']

rows = {}
def put(pg, cat, src, note):
    rows[pg] = {'page': 'pg-' + pg, 'cat': cat, 'source': src, 'note': note}

put('home', 'أ', 'Streamer_Section #modes + #library', 'بطاقات الأوضاع الأربعة + مكتبة الـ29 لعبة بمعاينات متحركة وفلتر التصنيفات')
for d, tag, setup, game, cat in STREAMER:
    full = d in GS_FULL
    put(setup, 'أ' if full else 'أ*', 'Game_Screens (%s)' % d if full else 'Game_Screens (نظام التصميم، تصنيف %s)' % cat,
        'إعداد + معاينة حيّة + متقدم' if full else 'بلا نموذج مباشر: يُبنى على نظام Game_Screens بلون/شكل تصنيف %s وحقول الإعداد الحالية' % cat)
    wait_src = 'Streamer_Section #setup' + (' + Game_Screens انتظار (%s)' % d if full else '')
    put(game, 'أ+ب', wait_src, 'حالة الانتظار من التصميم (كلمة/عداد/أفاتارات/+N/أزرار)؛ الجولة الحية (مضمار/شبكة/عجلة...) غير مصمَّمة ← بالامتداد')
    for w in (game + '-winner', tag + '-winner'):
        if w in pages and w not in rows: put(w, 'ب', 'امتداد', 'شاشة الفائز + fxCelebrate')
put('solo-home', 'أ', 'ألعاب فردية (hub)', 'data-act: open/home')
for g in SOLO:
    put('setup-' + g, 'أ', 'ألعاب فردية (%s)' % g, 'data-act=start ← دالة البدء الحالية')
    put(g, 'أ', 'ألعاب فردية (%s)' % g, 'data-state من أحداث اللعبة الحقيقية؛ IDs الحالية تبقى')
    put(g + '-winner', 'أ', 'ألعاب فردية (%s)' % g, 'نتيجة win/lose؛ again/hub')

GROUPS = [
  (r'^online-', 'ب', 'امتداد: لغة الفردي (hub ← إعداد ← جولة ← نتيجة)', 'الأونلاين — لا تصميم'),
  (r'^(party-home|setup-(describechar|countrywarparty|fastans|pdraw|ptop10)|describechar|describechar-pick|describechar-winner|countrywarparty|countrywarparty-winner|fastans|fastans-roundwinner|fastans-winner|pdraw|pdraw-reveal|pdraw-roundwinner|ptop10|ptop10-loading|ptop10-roundwinner|ptop10-winner)$', 'ب', 'امتداد: لغة الفردي', 'الجمعات — لا تصميم'),
  (r'^ahsemha-', 'ب', 'امتداد', 'فئات (احسمها)'),
  (r'^bridge-', 'ب', 'امتداد', 'جسر المصير'),
  (r'^wordle-', 'ب', 'امتداد', 'وردل'),
  (r'^(auth|choose-username|landing|static-landing)$', 'ب', 'امتداد', 'الدخول/الهبوط'),
  (r'^(profile|leaderboard|levels|frames|faq|contest-top20|winner|ig-final|tt10-roundwinner)$', 'ب', 'امتداد', 'حساب/لوحات/فعاليات'),
]
for pg in pages:
    if pg in rows: continue
    for rx, cat, src, note in GROUPS:
        if re.search(rx, pg): put(pg, cat, src, note); break
    else:
        put(pg, 'ب', 'امتداد', 'غير مصنّف — راجع')

ADDED_C = [
  ('#modes: بطاقات الأوضاع الأربعة', 'pg-home', 'show(\'home\')/solo-home/party-home/online-home عبر نفس معالجات topnav'),
  ('#library: معاينات متحركة للـ29 لعبة + فلتر التصنيفات (دردشة/حظ/تخمين/فرق مع الوصف)', 'pg-home', 'goSetup<Game>() الحالية لكل بطاقة'),
  ('#setup: شاشة الانتظار (كلمة الانضمام، العداد، أفاتارات + "+N"، "بانتظار أول مشارك")', 'pg-<game> حالة waiting', '*Participants / *-kw-show / *-p-count / *-p-usernames / *-status-strip / *-dot'),
  ('#setup: countdown قبل البدء', 'pg-<game>', 'طبقة عرض تنتهي باستدعاء start<Game>Round() الأصلية دون تغيير منطقها'),
  ('#setup: live / ended + أزرار ابدأ الجولة / إنهاء / جولة جديدة', 'pg-<game>', '*-btn-round + دوال reset/end الحالية'),
  ('Game_Screens: معاينة حيّة للإعدادات', 'setup-*', 'تعكس قيم حقول الإعداد لحظياً (مضمار/مؤقتات القنبلة/مؤشر التوقيت/الحبل)'),
  ('Game_Screens: محرّر تسلسل مؤقتات القنبلة + tog + حقول رقمية min/max/step/unit', 'setup-* + mod-advanced-*', 'MOD_SETTINGS_SCHEMA وقسم الإعدادات المتقدمة'),
]
REMOVED = ['joinSpeed / autoJoin / startState وأزرار المعاينة الجانبية (Streamer_Section)', 'محاكاة الانضمام الوهمية وأسماء الشات/الأفاتارات العيّنة',
           'أرقام عيّنة (00:42، 72%، عدد المشاهدين)', 'محرّك SoloGames (بنوك موضوعات، window.claude.complete، مؤقتاته) — نأخذ الماركاب/CSS/الحركة فقط',
           'x-dc / sc-* / data-dc-script / __bundler / data-screen-label / React / unpkg', 'نص "نموذج أولي لأربع ألعاب..." أسفل Game_Screens']

cnt = {}
for r in rows.values(): cnt[r['cat']] = cnt.get(r['cat'], 0) + 1
json.dump({'pages': rows, 'added_c': ADDED_C, 'removed': REMOVED, 'counts': cnt}, open('redesign/matrix.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

md = ['# مصفوفة المطابقة (مسودة للمراجعة — المرحلة 1)', '',
      '`أ` بالتصميم والموقع ← يُستبدل · `أ*` نظام Game_Screens بلا نموذج مباشر للعبة · `أ+ب` الانتظار من التصميم والجولة الحية امتداد · `ب` بالموقع فقط ← يُصمَّم بنفس اللغة', '',
      'الأعداد: ' + ' · '.join('%s=%d' % kv for kv in sorted(cnt.items())) + ' (المجموع %d صفحة)' % len(rows), '',
      '## ج) بالتصميم وغير موجود بالموقع ← يُضاف ويُربط', '', '| العنصر | مكانه | الربط |', '|---|---|---|']
md += ['| %s | %s | %s |' % x for x in ADDED_C]
md += ['', '## حُذف من التصميم (لا يُشحن)', ''] + ['- ' + x for x in REMOVED]
md += ['', '## الصفحات', '', '| الصفحة | الفئة | المصدر | ملاحظة |', '|---|---|---|---|']
order = {'أ': 0, 'أ*': 1, 'أ+ب': 2, 'ب': 3}
for r in sorted(rows.values(), key=lambda r: (order.get(r['cat'], 9), r['page'])):
    md.append('| `%s` | %s | %s | %s |' % (r['page'], r['cat'], r['source'], r['note']))
open('redesign/matrix.md', 'w', encoding='utf-8').write('\n'.join(md) + '\n')
print(cnt, len(rows), 'unclassified:', [r['page'] for r in rows.values() if 'غير مصنّف' in r['note']])
