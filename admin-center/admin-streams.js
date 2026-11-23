/* لوحة الأدمن: نظرة عامة + البثوث المباشرة + تفاصيل الجلسة + الدخول كمراقب. */
(function (w) {
  'use strict';
  var A = w.AdminApp, D = w.EhsAdminData, UI = A.UI, esc = UI.esc, $ = UI.$, $$ = UI.$$, ic = UI.ic, nf = UI.nf;
  var userCache = {};

  function userInfo(uid, cb) {
    if (!uid) return null; var c = userCache[uid]; if (c) return c.v;
    userCache[uid] = { v: null, p: true }; var f = D.fb();
    f.getDoc(f.doc(f.db, 'users', uid)).then(function (s) { var d = s.exists() ? s.data() : {}; userCache[uid] = { v: { name: d.username || '', avatar: d.linkedTiktokAvatar || d.photoURL || d.avatar || '' } }; cb && cb(); }, function () { userCache[uid] = { v: {} }; });
    return null;
  }
  var AV = function (d) { var u = userInfo(d.uid, null); var a = u && u.avatar; var l = esc((String(d.streamer || (u && u.name) || d.handle || '?').replace(/^@/, '')[0] || '?').toUpperCase()); return /^https:\/\//.test(a || '') ? '<img src="' + esc(a) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : l; };

  /* ================= نظرة عامة ================= */
  A.register({ id: 'overview', group: 'عام', title: 'نظرة عامة', en: 'OVERVIEW', icon: 'home', perm: 'admin.dashboard.view', desc: 'ملخص ما تملك صلاحية رؤيته الآن. كل رقم من مصدر حقيقي.',
    mount: function (v) {
      var S = this; v.innerHTML = A.head(S, '') + '<div id="ov-k" class="grid g-kpi">' + UI.skel(3) + '</div><div id="ov-b" class="grid g-auto" style="margin-top:16px"></div>';
      var kpi = function (n, label, cls) { return '<div class="card kpi ' + (cls || '') + '"><b>' + (n == null ? '—' : nf(n)) + '</b><span>' + esc(label) + '</span></div>'; };
      var K = {}; var paint = function () { $('#ov-k', v).innerHTML = [K.act != null && kpi(K.act, 'جلسات نشطة الآن', 'ok'), K.conf != null && kpi(K.conf, 'جلسات ببث مؤكد'), K.att != null && kpi(K.att, 'تحتاج انتباهاً', K.att ? 'warn' : ''), K.tests != null && kpi(K.tests, 'اختبارات اتصال (٢٤ ساعة)'), K.grants != null && kpi(K.grants, 'منح إطارات نفّذتها (٢٤ ساعة)')].filter(Boolean).join('') || UI.empty('lock', 'لا توجد مؤشرات ضمن صلاحياتك'); };
      if (A.can('admin.streams.view') || A.can('admin.connections.view')) {
        var links = null; A.feed.use('links', v, function (l) { links = l; });
        A.feed.use('sessions', v, function (val, err) {
          if (err) { K.act = K.conf = K.att = null; $('#ov-b', v).innerHTML = '<div class="card pad">' + UI.error('تعذّر قراءة الجلسات', err === 'denied' ? 'لا تملك صلاحية القراءة.' : err) + '</div>'; paint(); return; }
          var now = Date.now(), act = 0, conf = 0, att = 0, rows = [];
          Object.keys(val || {}).forEach(function (k) { var d = A.derive(k, val[k], links, now); if (d.phase === 'active') act++; if (d.confirmed) conf++; if (d.phase === 'stale' || (d.phase === 'active' && ['failed', 'disconnected', 'reconnecting', 'down'].indexOf(d.connTo) >= 0)) { att++; rows.push(d); } });
          K.act = act; K.conf = conf; K.att = att; paint();
          $('#ov-b', v).innerHTML = (att ? '<div class="card pad"><h3>جلسات تحتاج انتباهاً</h3>' + rows.slice(0, 6).map(function (d) { return '<div class="row" style="padding:6px 0"><b>' + esc(d.streamer || d.handle || d.id) + '</b><span class="mut sm">' + esc(d.phase === 'stale' ? 'تأخر في إرسال النبضة ' + UI.ago(d.last) : d.connLabel[2]) + '</span></div>'; }).join('') + '</div>' : '');
        });
      }
      var m = A.me(), f = D.fb();
      if (A.can('admin.connections.test') && f.rtdb) f.rtdbGet(f.rtdbRef(f.rtdb, 'adminConnTests/' + m.uid)).then(function (s) { var n = 0, val = s.val() || {}; Object.keys(val).forEach(function (k) { if ((val[k].startedAt || 0) > Date.now() - 864e5) n++; }); K.tests = n; paint(); }, function () {});
      if (A.can('admin.frames.history')) D.history({ limit: 300 }).then(function (rows) { K.grants = rows.filter(function (r) { return /^frame\./.test(r.action) && r.result === 'success' && r._ts > Date.now() - 864e5; }).length; paint(); }, function () {});
      if (A.can('admin.rounds.view') && f.rtdb) { var day = w.AdminRounds && w.AdminRounds.dayKey(Date.now()); f.rtdbGet(f.rtdbQuery(f.rtdbRef(f.rtdb, 'adminRounds/' + day), f.rtdbLimitToLast(5))).then(function (s) { var val = s.val() || {}; var rows = Object.keys(val).map(function (k) { return val[k]; }).sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); var box = document.createElement('div'); box.className = 'card pad'; box.innerHTML = '<h3>آخر النتائج المسجّلة</h3>' + (rows.length ? rows.map(function (r) { return '<div class="row" style="padding:6px 0"><b>' + esc((r.w && r.w.n) || '—') + '</b><span class="mut sm">' + esc(A.gameName(r.game) || r.gameName || '') + ' · ' + esc(r.streamer || '') + ' · ' + UI.ago(r.ts) + '</span></div>'; }).join('') : '<p class="mut">لا نتائج مسجّلة اليوم.</p>'); $('#ov-b', v).appendChild(box); }, function () {}); }
      if (A.can('admin.frames.history')) D.history({ limit: 5 }).then(function (rows) { if (!rows.length) return; var box = document.createElement('div'); box.className = 'card pad'; box.innerHTML = '<h3>آخر إجراءاتك</h3>' + rows.map(function (r) { return '<div class="row" style="padding:6px 0"><b>' + esc(r.action) + '</b><span class="mut sm">' + esc(r.targetName || r.resourceId || '') + ' · ' + UI.ago(r._ts) + '</span></div>'; }).join(''); $('#ov-b', v).appendChild(box); }, function () {});
      paint();
    } });

  /* ================= البثوث المباشرة ================= */
  var FS = { q: '', game: '', phase: 'live', conn: '', sort: 'new' };
  function filterRows(rows) {
    var q = FS.q.trim().toLowerCase().replace(/^@/, '');
    rows = rows.filter(function (d) {
      if (FS.phase === 'live' && !(d.phase === 'active' || d.phase === 'stale')) return false;
      if (FS.phase === 'active' && d.phase !== 'active') return false; if (FS.phase === 'stale' && d.phase !== 'stale') return false; if (FS.phase === 'ended' && d.phase !== 'ended' && d.phase !== 'dead') return false;
      if (FS.game && d.game !== FS.game) return false; if (FS.conn && (d.connTo || 'unknown') !== FS.conn) return false;
      if (q && (d.streamer + ' ' + d.handle).toLowerCase().indexOf(q) < 0) return false; return true;
    });
    rows.sort(function (a, b) { return FS.sort === 'parts' ? (b.parts - a.parts) || (b.last - a.last) : (b.start - a.start); }); return rows;
  }
  function card(d) {
    var link = A.streamUrl(d); var cls = d.phase === 'active' ? '' : (d.phase === 'stale' ? 'stale' : 'dead');
    var liveCls = d.phase === 'active' ? '' : (d.phase === 'stale' ? 'late' : 'off'); var liveTxt = d.phase === 'active' ? 'LIVE' : (d.phase === 'stale' ? 'LATE' : 'ENDED');
    var gimg = d.game ? A.gameImg(d.game) : '';
    var sessPill = { active: ['جلسة لعبة نشطة', 'ok'], stale: ['الجلسة متأخرة (لا نبضة)', 'warn'], dead: ['جلسة منتهية', ''], ended: ['جلسة منتهية', ''] }[d.phase];
    var integ = d.connTo ? [d.connLabel[2] + ' · التكامل', d.connLabel[1]] : ['التكامل: غير معروف', ''];
    var bc = d.confirmed ? ['بث مؤكد من الموقع', 'ok'] : (d.connTo === 'not_live' ? ['البث غير مباشر', 'warn'] : ['البث غير مؤكد', '']);
    var openBtn = A.can('admin.streams.open_link') ? '<button class="btn sm" data-a="open" data-id="' + esc(d.id) + '" ' + (link ? '' : 'disabled title="لا يوجد حساب بث مسجّل موثوق لهذه الجلسة"') + '>' + ic('ext') + '<span>الانتقال للبث</span></button>' : '';
    var detBtn = A.can('admin.sessions.details') ? '<button class="btn sm" data-a="det" data-id="' + esc(d.id) + '">' + ic('list') + '<span>تفاصيل الجلسة</span></button>' : '';
    var obsBtn = A.can('admin.sessions.observe') ? '<button class="btn sm pri" data-a="obs" data-id="' + esc(d.id) + '" ' + (d.phase === 'ended' || d.phase === 'dead' ? 'disabled' : '') + '>' + ic('eye') + '<span>الدخول كمراقب</span></button>' : '';
    return '<article class="card sc ' + cls + '" data-id="' + esc(d.id) + '"><div class="sc-top"><span class="av">' + AV(d) + '</span><div style="min-width:0;flex:1"><h4>' + esc(d.streamer || d.handle || 'ستريمر') + '</h4><div class="handle">' + (d.handle ? '@' + esc(d.handle) : '—') + ' · ' + esc(A.platName(d.platform)) + '</div></div><span class="live ' + liveCls + '"><i></i>' + liveTxt + '</span></div>' +
      '<div class="sc-game"><span class="gi">' + (gimg ? '<img src="' + esc(gimg) + '" alt="" loading="lazy">' : ic('gamepad')) + '</span><div><b>' + esc(d.gameName || 'لا لعبة حالياً') + '</b><small>' + (d.nRounds ? 'الجولة ' + nf(d.nRounds) : 'لم تبدأ جولة') + '</small></div></div>' +
      '<div class="pills"><span class="pill ' + sessPill[1] + '"><i class="d"></i>' + sessPill[0] + '</span><span class="pill ' + integ[1] + '"><i class="d"></i>' + esc(integ[0]) + '</span><span class="pill ' + bc[1] + '"><i class="d"></i>' + bc[0] + '</span></div>' +
      '<div class="facts"><div><small>المشاركون</small><b>' + nf(d.parts) + '</b></div><div><small>مدة الجلسة</small><b>' + (d.start ? UI.dur((d.phase === 'ended' ? d.last : Date.now()) - d.start) : '—') + '</b></div><div><small>آخر تحديث</small><b>' + UI.ago(d.last) + '</b></div></div>' +
      '<div class="acts">' + openBtn + detBtn + obsBtn + '</div></article>';
  }
  A.register({ id: 'streams', group: 'المراقبة', title: 'البثوث المباشرة', en: 'LIVE STREAMS', icon: 'radio', perm: 'admin.streams.view', desc: 'الجلسات الحية في احسمها. جلسة اللعبة، اتصال التكامل، وتأكيد البث حالات منفصلة.',
    mount: function (v) {
      var S = this, rows = [], err = null, ready = false, links = null;
      v.innerHTML = A.head(S, '<span class="mut sm" id="st-n"></span>') +
        '<div class="tools"><input class="in grow" id="f-q" type="search" placeholder="ابحث باسم الستريمر أو يوزر البث" aria-label="بحث" value="' + esc(FS.q) + '"><select class="in" id="f-game" aria-label="اللعبة"><option value="">كل الألعاب</option></select>' +
        '<select class="in" id="f-phase" aria-label="حالة الجلسة"><option value="live">النشطة والمتأخرة</option><option value="active">نشطة فقط</option><option value="stale">متأخرة</option><option value="ended">منتهية</option><option value="all">الكل</option></select>' +
        '<select class="in" id="f-conn" aria-label="حالة الاتصال"><option value="">كل حالات الاتصال</option><option value="connected">متصل</option><option value="reconnecting">إعادة اتصال</option><option value="disconnected">منقطع</option><option value="failed">فشل</option><option value="not_live">غير مباشر</option><option value="unknown">غير معروف</option></select>' +
        '<select class="in" id="f-sort" aria-label="الترتيب"><option value="new">الأحدث</option><option value="parts">الأكثر مشاركين</option></select></div><div id="st-list">' + UI.skel(4) + '</div>';
      $('#f-phase', v).value = FS.phase; $('#f-conn', v).value = FS.conn; $('#f-sort', v).value = FS.sort;
      var paint = function () {
        var box = $('#st-list', v); if (!box) return;
        if (!ready) return; if (err) { box.innerHTML = UI.error('تعذّر تحميل الجلسات', err === 'denied' ? 'لا تملك صلاحية قراءة بيانات الجلسات.' : err, '<button class="btn sm" data-a="retry">' + ic('refresh') + '<span>إعادة المحاولة</span></button>'); return; }
        var all = rows; var games = {}; all.forEach(function (d) { if (d.game) games[d.game] = d.gameName; });
        var sel = $('#f-game', v); if (sel && sel.options.length - 1 !== Object.keys(games).length) { sel.innerHTML = '<option value="">كل الألعاب</option>' + Object.keys(games).sort().map(function (g) { return '<option value="' + esc(g) + '">' + esc(games[g]) + '</option>'; }).join(''); sel.value = FS.game; }
        var list = filterRows(all); $('#st-n', v).textContent = nf(list.length) + ' من ' + nf(all.length);
        box.innerHTML = list.length ? '<div class="grid g-auto">' + list.map(card).join('') + '</div>' : UI.empty('radio', all.length ? 'لا نتائج مطابقة للفلاتر' : 'لا توجد جلسات نشطة حاليًا', all.length ? 'جرّب تغيير الفلاتر.' : 'ستظهر الجلسات هنا فور بدء الستريمرز للألعاب.');
      };
      A.feed.use('links', v, function (l) { links = l; });
      A.feed.use('events', v, function () {}); /* أحداث الجلسة تظهر في تفاصيل الجلسة */
      A.feed.use('sessions', v, function (val, e) { err = e; ready = true; var now = Date.now(); rows = Object.keys(val || {}).map(function (k) { return A.derive(k, val[k], links, now); }); rows.forEach(function (d) { userInfo(d.uid, paint); }); paint(); });
      A.every(v, 5000, paint); /* تحديث «قبل س» والمدة دون إعادة اشتراك */
      var deb = 0; v.addEventListener('input', function (e) { var t = e.target; if (t.id === 'f-q') { clearTimeout(deb); deb = setTimeout(function () { FS.q = t.value; paint(); }, 160); } });
      v.addEventListener('change', function (e) { var t = e.target; if (t.id === 'f-game') FS.game = t.value; else if (t.id === 'f-phase') FS.phase = t.value; else if (t.id === 'f-conn') FS.conn = t.value; else if (t.id === 'f-sort') FS.sort = t.value; else return; paint(); });
      v.addEventListener('click', function (e) {
        var b = e.target.closest('[data-a]'); if (!b) return; var a = b.dataset.a; if (a === 'retry') { A.refreshCurrent(); return; }
        var d = rows.find(function (x) { return x.id === b.dataset.id; }); if (!d) return;
        if (a === 'open') { var u = A.streamUrl(d); if (!u) { UI.toast('لا يوجد رابط بث موثوق لهذه الجلسة', 'warn'); return; } w.open(u, '_blank', 'noopener,noreferrer'); D.log('stream.open_link', { resourceType: 'session', resourceId: d.id, targetName: d.streamer }); }
        else if (a === 'det') details(d, links); else if (a === 'obs') A.go('observe', d.id);
      });
    } });
  A.every = function (view, ms, fn) { var t = setInterval(function () { if (!view.isConnected) { clearInterval(t); return; } fn(); }, ms); return t; };

  /* ---------- تفاصيل الجلسة ---------- */
  function section(t, body) { return '<div class="card pad" style="margin-bottom:12px"><h3>' + esc(t) + '</h3>' + body + '</div>'; }
  var kv = function (k, val) { return '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line2)"><span class="mut sm" style="min-width:130px">' + esc(k) + '</span><b class="sm" style="word-break:break-all">' + (val == null || val === '' ? '—' : val) + '</b></div>'; };
  function details(d, links) {
    D.log('session.open', { resourceType: 'session', resourceId: d.id, targetName: d.streamer });
    var dr = UI.drawer({ title: 'تفاصيل الجلسة — ' + (d.streamer || d.handle || d.id), html: UI.skel(3), onMount: function (el) { build(el); } });
    function build(el) {
      var body = $('.dlg-b', el); var f = D.fb(); var rounds = Object.keys(d.rounds || {}).map(function (k) { var r = d.rounds[k]; r._n = +k; return r; }).sort(function (a, b) { return b._n - a._n; });
      var evs = []; var evAll = A.feed.peek('events') || {}; Object.keys(evAll).forEach(function (k) { if (evAll[k].sid === d.id) evs.push(evAll[k]); }); evs.sort(function (a, b) { return (b.t || 0) - (a.t || 0); });
      var render = function (snap) {
        var cur = rounds[0];
        var players = '';
        if (!A.can('admin.sessions.observe')) players = '<p class="mut sm">أسماء المشاركين تتطلب صلاحية «الدخول كمراقب». العدد: ' + nf(d.parts) + '</p>';
        else if (!snap) players = '<p class="mut sm">لا توجد لقطة مشاركين لهذه الجلسة حالياً (لم تُنشر بعد أو انتهت الجلسة). العدد: ' + nf(d.parts) + '</p>';
        else if (snap.listSupported === false) players = '<p class="mut sm">قائمة الأسماء غير مدعومة لهذه اللعبة. العدد: ' + nf(snap.parts || 0) + '</p>';
        else players = '<div class="plist">' + (snap.list || []).map(function (p) { return '<div title="' + esc(p.u) + '">' + esc(p.n) + '</div>'; }).join('') + '</div>' + ((snap.parts || 0) > (snap.list || []).length ? '<p class="mut sm">يعرض أول ' + nf((snap.list || []).length) + ' فقط من ' + nf(snap.parts) + '</p>' : '');
        body.innerHTML = section('المعلومات الأساسية', kv('معرّف الجلسة', '<span class="mono ltr">' + esc(d.id) + '</span>') + kv('الستريمر', esc(d.streamer)) + kv('اللعبة', esc(d.gameName)) + kv('حالة الجلسة', { active: 'نشطة', stale: 'متأخرة', dead: 'منتهية (لم تُغلق)', ended: 'منتهية' }[d.phase]) + kv('وقت الإنشاء', UI.dt(d.start)) + kv('الجهاز', { d: 'حاسوب', m: 'جوال', t: 'تابلت' }[d.dev] || '')) +
          section('معلومات الجولة', kv('رقم الجولة الحالية', cur ? nf(cur._n) : '—') + kv('حالتها', cur ? { running: 'جارية', complete: 'اكتملت', stopped: 'أُوقفت' }[cur.state] || cur.state : '—') + kv('بدايتها', cur ? UI.dt(cur.start) : '') + kv('عدد المشاركين', nf(d.parts)) + kv('الجولات في الجلسة', nf(d.nRounds)) + kv('أحداث اللعبة', evs.filter(function (e) { return /^round_/.test(e.type); }).slice(0, 5).map(function (e) { return esc(e.type) + ' · ' + UI.tm(e.t); }).join('<br>'))) +
          section('المشاركون', players) +
          section('الاتصال', kv('منصة البث', esc(A.platName(d.platform))) + kv('حساب البث', d.handle ? '<span class="ltr">@' + esc(d.handle) + '</span>' : '') + kv('حالة التكامل', d.connLabel[2] + ' (' + d.connLabel[0] + ')') + kv('تأكيد البث', d.confirmed ? 'مؤكد من الموقع' : 'غير مؤكد') + kv('آخر تحديث للحالة', UI.dt(d.last) + ' (' + UI.ago(d.last) + ')') + kv('آخر خطأ معروف', evs.filter(function (e) { return e.sev === 'error'; }).slice(0, 1).map(function (e) { return esc(e.msg || e.type) + ' · ' + UI.tm(e.t); }).join('')));
      };
      render(null);
      if (A.can('admin.sessions.observe') && f.rtdb) f.rtdbGet(f.rtdbRef(f.rtdb, 'adminObserve/' + d.id)).then(function (s) { render(s.val()); }, function () {});
    }
  }

  /* ================= الدخول كمراقب ================= */
  A.register({ id: 'observe', group: 'المراقبة', title: 'الدخول كمراقب', en: 'OBSERVER MODE', icon: 'eye', perm: 'admin.sessions.observe', desc: 'مشاهدة جلسة ستريمر دون التدخل فيها. لا تدخل اللعبة ولا تُحسب لاعباً.',
    leave: function (v) { if (v && v._obsLeave) v._obsLeave(); },
    mount: function (v, sid) {
      var S = this;
      if (!sid) { /* اختيار جلسة */
        v.innerHTML = A.head(S, '') + '<div id="ob-l">' + UI.skel(3) + '</div>'; var links = null; A.feed.use('links', v, function (l) { links = l; });
        if (!A.can('admin.streams.view')) { $('#ob-l', v).innerHTML = UI.empty('eye', 'اختر جلسة من «البثوث المباشرة»', 'اضغط «الدخول كمراقب» على بطاقة الجلسة.'); return; }
        A.feed.use('sessions', v, function (val, err) { var now = Date.now(); var list = Object.keys(val || {}).map(function (k) { return A.derive(k, val[k], links, now); }).filter(function (d) { return d.phase === 'active'; }); $('#ob-l', v).innerHTML = err ? UI.error('تعذّر تحميل الجلسات', err) : (list.length ? '<div class="grid g-auto">' + list.map(function (d) { return '<div class="card pad"><h3>' + esc(d.streamer || d.handle) + '</h3><p class="mut sm">' + esc(d.gameName || 'بلا لعبة') + ' · ' + nf(d.parts) + ' مشارك</p><button class="btn pri sm" data-obs="' + esc(d.id) + '">' + ic('eye') + '<span>دخول</span></button></div>'; }).join('') + '</div>' : UI.empty('radio', 'لا توجد جلسات نشطة حاليًا')); });
        v.addEventListener('click', function (e) { var b = e.target.closest('[data-obs]'); if (b) A.go('observe', b.dataset.obs); }); return;
      }
      var f = D.fb(), me = A.me(); var snap = null, gone = false, entered = false, off = null, pres = null;
      v.innerHTML = '<div class="obs-bar"><b>OBSERVER MODE</b><b style="font-family:var(--f);letter-spacing:0">وضع المراقبة</b><span>مشاهدة فقط — لا يمكنك التحكم في اللعبة</span><span class="sp"></span><button class="btn sm" id="ob-exit">' + ic('back') + '<span>خروج من المراقبة</span></button></div><div id="ob-b">' + UI.skel(3) + '</div>';
      var paint = function () {
        var box = $('#ob-b', v); if (!box) return;
        if (!snap) { box.innerHTML = UI.empty('eye', gone ? 'انتهت الجلسة أو لا لقطة متاحة' : 'بانتظار بيانات الجلسة…', 'لا توجد لقطة منشورة لهذه الجلسة. قد تكون انتهت، أو أن الستريمر لم ينشر بعد (تُنشر كل ٢٠ ثانية).'); return; }
        var live = snap.state === 'live'; var lst = snap.list || []; var stale = Date.now() - (snap.ts || 0) > 90e3;
        box.innerHTML = '<div class="grid g-kpi"><div class="card kpi"><b style="font-size:20px">' + esc(snap.gameName || 'لا لعبة') + '</b><span>اللعبة</span></div><div class="card kpi"><b style="font-size:20px">' + esc(snap.streamer || '—') + '</b><span>الستريمر</span></div><div class="card kpi"><b>' + nf(snap.parts || 0) + '</b><span>المشاركون</span></div>' +
          '<div class="card kpi"><b style="font-size:20px">' + ({ live: 'الجولة جارية', lobby: 'قبل الجولة (انتظار)', idle: 'بلا لعبة' }[snap.state] || '—') + '</b><span>حالة الجولة</span></div><div class="card kpi"><b style="font-size:20px">' + (live && snap.rstart ? UI.dur(Date.now() - snap.rstart) : '—') + '</b><span>مدة الجولة (من بداية الراوند)</span></div></div>' +
          (stale ? '<div class="card pad" style="margin-top:12px;border-color:var(--warn)">آخر لقطة ' + UI.ago(snap.ts) + ' — قد تكون الجلسة متوقفة.</div>' : '') +
          '<div class="card pad" style="margin-top:14px"><h3>المشاركون الظاهرون للجمهور</h3>' + (snap.listSupported === false ? '<p class="mut">المراقبة غير مدعومة لهذه اللعبة بعد: تُعرض الحالة والعدد فقط، ولا تتوفر قائمة الأسماء.</p>' : (lst.length ? '<div class="plist">' + lst.map(function (p) { return '<div title="' + esc(p.u) + '">' + esc(p.n) + '</div>'; }).join('') + '</div>' + ((snap.parts || 0) > lst.length ? '<p class="mut sm">يعرض أول ' + nf(lst.length) + ' فقط.</p>' : '') : '<p class="mut">لا مشاركين حالياً.</p>')) + '<p class="mut sm" style="margin-top:10px">لا تُعرض إجابات ولا معلومات سرية: تُنشر أسماء المشاركين وحالة الجولة فقط.</p></div>';
      };
      var enter = function () {
        if (entered) return; entered = true;
        try { var pr = f.rtdbRef(f.rtdb, 'adminObservers/' + sid + '/' + me.uid); f.rtdbSet(pr, { at: { '.sv': 'timestamp' }, name: String(me.name || me.email || '').slice(0, 40) }).then(function () { if (f.rtdbOnDisconnect) try { f.rtdbOnDisconnect(pr).remove(); } catch (e) {} }, function () {}); pres = pr; } catch (e) {}
        D.log('observer.enter', { resourceType: 'session', resourceId: sid });
      };
      v._obsLeave = function () { if (v._obsDone) return; v._obsDone = true; try { off && off(); } catch (e) {} if (entered) { try { f.rtdbRemove(pres); } catch (e) {} D.log('observer.exit', { resourceType: 'session', resourceId: sid }); } };
      window.addEventListener('pagehide', v._obsLeave);
      $('#ob-exit', v).onclick = function () { A.go('streams'); };
      var ref = f.rtdbRef(f.rtdb, 'adminObserve/' + sid);
      var h = f.rtdbOnValue(ref, function (s) { snap = s.val(); gone = !snap; paint(); if (snap) enter(); else { enter(); } }, function (e) { $('#ob-b', v).innerHTML = UI.error(D.isDenied(e) ? 'ليس لديك إذن للمراقبة' : 'تعذّر قراءة بيانات الجلسة', D.errText(e)); });
      off = typeof h === 'function' ? h : function () { try { f.rtdbOff(ref, 'value'); } catch (e) {} };
      A.every(v, 5000, paint);
    } });
})(window);
