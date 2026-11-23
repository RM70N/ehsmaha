/* لوحة الأدمن: مراقبة اتصال الستريمر + مختبر تجربة اتصال البث.
 * المختبر يفتح اتصالاً مستقلاً مؤقتاً بخادم الجسر (نفس مسار ?u= الذي تستخدمه الألعاب) بلا توكن، ويغلقه فور انتهاء الفحص؛
 * لا يلمس اتصال أي ستريمر ولا مستمعي الأحداث. ما لا يمكن التحقق منه يُكتب «لم يتم التحقق» لا «نجح». */
(function (w) {
  'use strict';
  var A = w.AdminApp, D = w.EhsAdminData, UI = A.UI, esc = UI.esc, $ = UI.$, ic = UI.ic, nf = UI.nf;
  var C = (w.AdminConn = { bridgeOverride: null });
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  C.setBridge = function (u) { if (LOCAL) C.bridgeOverride = u; };
  C.bridgeWs = function () { if (C.bridgeOverride) return C.bridgeOverride; try { var l = (0, A.host().eval)('typeof TIKTOK_BRIDGE_SERVERS!=="undefined"?TIKTOK_BRIDGE_SERVERS:[]'); return (l && l[0]) || ''; } catch (e) { return ''; } };
  C.httpOrigin = function (ws) { return String(ws).replace(/^ws/, 'http').replace(/\/ws(\?.*)?$/, ''); };
  C.clean = function (raw) {
    try { var f = A.host().tiktokCleanUsername; if (typeof f === 'function') return f(raw); } catch (e) {}
    var s = String(raw == null ? '' : raw).trim().replace(/^@+/, '').toLowerCase(); return /^[a-z0-9._]{2,24}$/.test(s) ? s : '';
  };
  var timeout = function (p, ms, msg) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error(msg || 'timeout')); }, ms); })]); };

  /** مراحل الاختبار الخمس. onStage(i, {s:'run|ok|bad|unk|skip', note}). يرجع {verdict:'success|failed|unverified', reason, stages, ms}. */
  C.run = function (opts, onStage) {
    var t0 = Date.now(); var stages = [{ s: 'idle' }, { s: 'idle' }, { s: 'idle' }, { s: 'idle' }, { s: 'idle' }];
    var set = function (i, s, note, ms) { stages[i] = { s: s, note: note || '', ms: ms }; onStage && onStage(i, stages[i]); };
    var finish = function (verdict, reason) { for (var i = 0; i < 5; i++) if (stages[i].s === 'idle') set(i, 'skip', 'لم يتم التحقق'); return { verdict: verdict, reason: reason, stages: stages, ms: Date.now() - t0 }; };
    var ws = opts.bridge || C.bridgeWs(); var user = C.clean(opts.streamer); var tmo = opts.timeoutMs || 20000;
    /* 2 (أولاً محلياً): صيغة الحساب */
    set(0, 'run');
    if (!ws) { set(0, 'bad', 'عنوان خدمة الربط غير مهيّأ'); return Promise.resolve(finish('failed', 'خدمة الاتصال غير مهيّأة')); }
    var origin = C.httpOrigin(ws); var tS = performance.now();
    return timeout(fetch(origin + '/healthz', { cache: 'no-store' }), 7000, 'health_timeout').then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json().catch(function () { return {}; }); }).then(function () {
      set(0, 'ok', 'الخدمة ردّت', Math.round(performance.now() - tS));
      set(1, 'run'); if (!user) { set(1, 'bad', 'صيغة اسم المستخدم غير صحيحة'); return finish('failed', 'صيغة اسم المستخدم غير صحيحة'); }
      set(1, 'ok', 'الصيغة صحيحة (@' + user + ') — وجود الحساب يؤكده الجسر في المرحلتين التاليتين');
      return connect(ws, user, tmo, set, finish);
    }, function (e) { set(0, 'bad', e && e.message === 'health_timeout' ? 'انتهت مهلة الاستجابة' : 'لا استجابة من الخدمة'); return finish('failed', 'خدمة الاتصال غير متاحة'); });
  };
  function connect(ws, user, tmo, set, finish) {
    return new Promise(function (resolve) {
      var s, done = false, connected = false, notLive = false, got = 0, timers = [];
      var end = function (verdict, reason) { if (done) return; done = true; timers.forEach(clearTimeout); try { s.onopen = s.onmessage = s.onclose = s.onerror = null; s.close(); } catch (e) {} resolve(finish(verdict, reason)); };
      set(2, 'run'); set(3, 'run');
      try { s = new WebSocket(ws + (ws.indexOf('?') < 0 ? '?' : '&') + 'u=' + encodeURIComponent(user)); } catch (e) { set(3, 'bad', 'تعذّر فتح الاتصال'); return resolve(finish('failed', 'تعذّر فتح الاتصال بخدمة الربط')); }
      var t0 = performance.now();
      timers.push(setTimeout(function () { if (connected) return; set(2, 'unk', 'لم يتم التحقق'); set(3, 'unk', 'انتهت المهلة قبل تأكيد الاتصال'); end('unverified', 'تعذّر تأكيد الاتصال: انتهت المهلة'); }, tmo));
      s.onclose = function (e) { if (done) return; if (!connected) { set(3, 'bad', 'أُغلق الاتصال (' + (e && e.code) + ')'); set(2, 'unk', 'لم يتم التحقق'); end('failed', 'أُغلق الاتصال قبل الربط (رمز ' + (e && e.code) + ')'); } };
      s.onerror = function () {};
      s.onmessage = function (ev) {
        var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
        if (d && d.type === 'bridge_status') {
          if (d.state === 'connected' && !connected) {
            connected = true; set(2, 'ok', 'البث مباشر (الجسر انضم للغرفة)'); set(3, 'ok', 'اتصال مدعوم مؤكَّد', Math.round(performance.now() - t0)); set(4, 'run');
            timers.push(setTimeout(function () { if (got) return; set(4, 'unk', 'لم يتم التحقق: لم تصل رسائل أحداث خلال فترة الفحص (قد لا يوجد نشاط في الشات)'); end('success', 'تم الاتصال بالبث'); }, 6000)); return;
          }
          if (d.state === 'not_live' || d.reason === 'not_live' || d.code === 'not_live' || /not.?live|offline/i.test(String(d.message || ''))) { notLive = true; set(2, 'bad', 'الحساب غير مباشر الآن'); set(3, 'skip', 'لم يتم التحقق'); return end('failed', 'البث غير مباشر حاليًا'); }
          if (d.fatal) { set(3, 'bad', String(d.reason || d.message || d.code || 'فشل الاتصال')); set(2, 'unk', 'لم يتم التحقق'); return end('failed', String(d.reason || d.message || d.code || 'فشل الاتصال بالبث')); }
          if (/user.?not.?found|not.?found/i.test(String(d.code || d.reason || ''))) { set(1, 'bad', 'تعذّر العثور على الحساب'); return end('failed', 'تعذّر العثور على الحساب'); }
          if (/rate/i.test(String(d.code || d.reason || ''))) { set(3, 'bad', 'تجاوزت الخدمة حد الطلبات'); return end('failed', 'تجاوزت الخدمة حد الطلبات'); }
          return; /* connecting / queued / retrying: ننتظر ضمن المهلة */
        }
        if (connected) { got++; set(4, 'ok', 'وصلت رسائل من الجسر (جاهزية استقبال الأحداث مؤكَّدة)'); end('success', 'تم الاتصال بالبث'); }
      };
    });
  }

  /* ================= مراقبة اتصال الستريمر ================= */
  var HEALTH = { t: 0, v: null };
  function probeBridge() {
    var ws = C.bridgeWs(); if (!ws) return Promise.resolve({ ok: null, note: 'عنوان الجسر غير مهيّأ' });
    var o = C.httpOrigin(ws); var t = performance.now();
    return timeout(fetch(o + '/health', { cache: 'no-store' }), 6000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (j) { return { ok: true, ms: Math.round(performance.now() - t), data: j }; }, function (e) { return { ok: false, note: e && e.message === 'timeout' ? 'انتهت المهلة' : String(e && e.message || e) }; });
  }
  A.register({ id: 'conn', group: 'الاتصال', title: 'اتصال الستريمر', en: 'STREAMER CONNECTION', icon: 'wifi', perm: 'admin.connections.view', desc: 'حالات الاتصال منفصلة: المتصفح، خادم البيانات، الجسر، تكامل المنصة، وتأكيد البث. لا مؤشر واحد مضلل.',
    mount: function (v) {
      var S = this, links = null, rows = [], err = null, ready = false, evs = {}, bridge = null;
      v.innerHTML = A.head(S, '<button class="btn sm" id="c-re">' + ic('refresh') + '<span>فحص الجسر</span></button>') + '<div id="c-b" class="grid g-kpi" style="margin-bottom:14px"></div><div id="c-l">' + UI.skel(3) + '</div>';
      var paintB = function () {
        var b = bridge; var cls = !b ? '' : (b.ok ? 'ok' : (b.ok === false ? 'bad' : ''));
        $('#c-b', v).innerHTML = '<div class="card kpi"><b style="font-size:20px">' + (!b ? 'جارٍ الفحص…' : (b.ok ? 'تعمل' : (b.ok === false ? 'متوقفة' : 'غير معروفة'))) + '</b><span>خدمة الجسر الخلفية' + (b && b.ms ? ' · ' + b.ms + ' ms' : '') + (b && b.note ? ' · ' + esc(b.note) : '') + '</span></div>' +
          '<div class="card kpi ' + (A.feed.peek('sessions') != null ? 'ok' : '') + '"><b style="font-size:20px">' + (document.querySelector('#chip-conn.ok') ? 'متصل' : 'غير متصل') + '</b><span>خادم البيانات (متصفحك)</span></div>' +
          '<div class="card kpi"><b>' + nf(rows.filter(function (d) { return d.phase === 'active'; }).length) + '</b><span>جلسات تتلقى نبضة الآن</span></div>';
      };
      var probe = function () { bridge = null; paintB(); probeBridge().then(function (r) { bridge = r; paintB(); }); };
      var paint = function () {
        var box = $('#c-l', v); if (!box || !ready) return;
        if (err) { box.innerHTML = UI.error('تعذّر الحصول على حالة الاتصال', err === 'denied' ? 'لا تملك صلاحية قراءة بيانات الاتصال.' : err); return; }
        var list = rows.filter(function (d) { return d.phase !== 'ended' || Date.now() - d.last < 3600e3; }).sort(function (a, b) { return b.last - a.last; });
        paintB(); if (!list.length) { box.innerHTML = UI.empty('wifi', 'لا توجد جلسات لعرض اتصالها', 'تظهر هنا الجلسات التي نشطت خلال الساعات الماضية.'); return; }
        box.innerHTML = '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الستريمر</th><th>الجلسة</th><th>المصدر</th><th>حالة التكامل</th><th>تأكيد البث</th><th>آخر نجاح</th><th>آخر فشل</th><th>مدة الاتصال</th><th>آخر Heartbeat</th><th>إعادة الاتصال</th><th>آخر خطأ</th></tr></thead><tbody>' + list.map(function (d) {
          var okC = d.conn.filter(function (c) { return c.to === 'connected'; }).pop(); var bad = d.conn.filter(function (c) { return ['failed', 'disconnected', 'down', 'not_live'].indexOf(c.to) >= 0; }).pop();
          var rec = d.conn.filter(function (c) { return c.to === 'reconnecting'; }).length; var cur = d.connTo === 'connected' && okC ? Date.now() - okC.t : 0;
          var er = Object.keys(evs).map(function (k) { return evs[k]; }).filter(function (e) { return e.sid === d.id && e.sev === 'error'; }).sort(function (a, b) { return b.t - a.t; })[0];
          var hb = { active: ['ok', UI.ago(d.last)], stale: ['warn', UI.ago(d.last)], dead: ['', 'انقطعت'], ended: ['', 'انتهت'] }[d.phase];
          return '<tr data-k="' + esc(d.id) + '"><td>' + esc(d.streamer || d.handle || '—') + '</td><td class="mono ltr">' + esc(d.id.slice(-8)) + '</td><td>' + esc(A.platName(d.platform)) + ' · الجسر</td><td><span class="pill ' + d.connLabel[1] + '"><i class="d"></i>' + d.connLabel[0] + '</span></td><td>' + (d.confirmed ? '<span class="pill ok"><i class="d"></i>مؤكد</span>' : '<span class="pill"><i class="d"></i>غير مؤكد</span>') + '</td><td>' + (okC ? UI.ago(okC.t) : '—') + '</td><td>' + (bad ? UI.ago(bad.t) : '—') + '</td><td>' + (cur ? UI.dur(cur) : '—') + '</td><td><span class="pill ' + hb[0] + '"><i class="d"></i>' + hb[1] + '</span></td><td>' + (d.conn.length ? nf(rec) : 'غير متاح') + '</td><td>' + (er ? esc((er.msg || er.type).slice(0, 40)) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div></div>';
      };
      A.feed.use('links', v, function (l) { links = l; });
      A.feed.use('events', v, function (e) { evs = e || {}; paint(); });
      A.feed.use('sessions', v, function (val, e) { err = e; ready = true; var now = Date.now(); rows = Object.keys(val || {}).map(function (k) { return A.derive(k, val[k], links, now); }); paint(); });
      A.every(v, 5000, paint); probe(); A.every(v, 30000, probe);
      v.addEventListener('click', function (e) { if (e.target.closest('#c-re')) { probe(); return; } var tr = e.target.closest('tr[data-k]'); if (!tr) return; var d = rows.find(function (x) { return x.id === tr.dataset.k; }); if (d) timeline(d, evs); });
    } });
  function timeline(d, evs) {
    var items = d.conn.map(function (c) { return { t: c.t, txt: (c.platform ? A.platName(c.platform) + ': ' : '') + (c.from ? c.from + ' ← ' : '') + A.connLabel(c.to)[2] + ' (' + c.to + ')' }; });
    Object.keys(evs || {}).forEach(function (k) { var e = evs[k]; if (e.sid === d.id && !/^conn_/.test(e.type)) items.push({ t: e.t, txt: ({ session_start: 'بدأت جلسة اللعبة', session_end: 'انتهت الجلسة', round_start: 'بدأ راوند', round_end: 'انتهى راوند', launch_fail: 'فشل بدء لعبة' }[e.type] || e.type) + (e.msg ? ' — ' + e.msg : '') }); });
    items.sort(function (a, b) { return a.t - b.t; });
    UI.drawer({ title: 'تسلسل الاتصال — ' + (d.streamer || d.id), html: items.length ? '<div class="card pad">' + items.map(function (x) { return '<div class="row sm" style="padding:6px 0;border-bottom:1px solid var(--line2)"><span class="mono">' + UI.tm(x.t) + '</span><span>' + esc(x.txt) + '</span></div>'; }).join('') + '</div><p class="mut sm" style="margin-top:10px">أحداث حقيقية مسجّلة من متصفح الستريمر وموقع احسمها.</p>' : UI.empty('list', 'لا أحداث اتصال مسجّلة لهذه الجلسة') });
  }

  /* ================= مختبر تجربة اتصال البث ================= */
  var STAGES = [['فحص الخادم', 'هل خدمة الجسر المسؤولة عن الربط متاحة؟'], ['فحص الحساب', 'هل يمكن تحديد حساب الستريمر بصيغة صحيحة؟'], ['التحقق من حالة البث', 'هل يبث الحساب الآن؟'], ['اختبار الاتصال', 'هل أنشأ احسمها اتصالاً مدعوماً مع البث؟'], ['جاهزية الأحداث', 'هل تأكدنا من استقبال الأحداث؟']];
  var LAST = { at: 0, user: '', tests: {} };
  A.register({ id: 'lab', group: 'الاتصال', title: 'تجربة اتصال البث', en: 'LIVE CONNECTION TEST LAB', icon: 'flask', perm: 'admin.connections.test', desc: 'اختبر مسار الاتصال الفعلي لاحسمها ببث ستريمر حقيقي. اختبار منفصل لا يقطع بثاً ولا لعبة.',
    mount: function (v) {
      var S = this, f = D.fb(), me = A.me(), busy = false, res = null, stagesState = [];
      v.innerHTML = A.head(S, '') + '<div class="split"><div><div class="card pad"><div class="field"><label for="l-plat">منصة البث</label><select class="in" id="l-plat"><option value="tiktok">تيك توك</option><option value="twitch" disabled>تويتش — غير مدعوم للاختبار حالياً</option><option value="kick" disabled>كيك — غير مدعوم للاختبار حالياً</option><option value="youtube" disabled>يوتيوب — غير مدعوم للاختبار حالياً</option></select></div>' +
        '<div class="field"><label for="l-user">يوزر حساب البث (وليس يوزر احسمها)</label><input class="in ltr" id="l-user" placeholder="@streamer_username" autocomplete="off" dir="ltr"></div>' +
        '<div class="field"><label for="l-site">أو اختر حساباً مسجلاً في احسمها (يملأ يوزر تيك توك المربوط)</label><div class="row"><input class="in grow" id="l-site" placeholder="يوزر احسمها" dir="ltr" autocomplete="off" style="flex:1"><button class="btn sm" id="l-find">بحث</button></div><small class="mut" id="l-site-n"></small></div>' +
        '<div class="row"><button class="btn pri" id="l-run">' + ic('play') + '<span>اختبار الاتصال</span></button><button class="btn" id="l-re" disabled>' + ic('refresh') + '<span>إعادة الاختبار</span></button><button class="btn" id="l-clear" disabled>' + ic('x') + '<span>مسح النتيجة</span></button><button class="btn" id="l-det" disabled>' + ic('list') + '<span>عرض التفاصيل</span></button></div></div>' +
        '<div id="l-out"><div class="state">' + ic('flask') + '<h4>أدخل يوزر الستريمر لبدء الفحص</h4><p>يتحقق الفحص من خدمة الجسر ثم يحاول اتصالاً مؤقتاً بالبث ويغلقه فور انتهائه.</p></div></div></div>' +
        '<div class="card pad"><h3>سجل اختباراتي</h3><div id="l-hist">' + UI.skel(2) + '</div></div></div>';
      var draw = function () {
        var html = '<div class="steps" role="list">' + STAGES.map(function (s, i) { var st = stagesState[i] || { s: 'idle' }; var map = { run: 'run', ok: 'ok', bad: 'bad', unk: 'unk', skip: 'skip', idle: 'idle' }[st.s]; var lab = { run: 'جارٍ…', ok: 'نجح', bad: 'فشل', unk: 'لم يتم التحقق', skip: 'لم يتم التحقق', idle: 'بانتظار' }[st.s]; return '<div class="step" role="listitem" data-s="' + map + '"><span class="n">' + (st.s === 'ok' ? '✓' : st.s === 'bad' ? '✕' : (i + 1)) + '</span><div><b>' + s[0] + '</b><small>' + esc(st.note || s[1]) + '</small></div><span class="pill ' + ({ ok: 'ok', bad: 'bad', unk: 'warn', skip: 'warn', run: '' }[st.s] || '') + '">' + lab + (st.ms ? ' · ' + st.ms + 'ms' : '') + '</span></div>'; }).join('') + '</div>';
        if (res) { var vm = { success: ['ok', 'تم الاتصال بالبث بنجاح'], failed: ['bad', 'فشل الاتصال بالبث'], unverified: ['unk', 'تعذّر تأكيد الاتصال'] }[res.verdict]; html += '<div class="verdict ' + vm[0] + '"><h3>' + vm[1] + '</h3><p style="margin:0">' + esc(res.reason || '') + '</p><p class="mut sm" style="margin:8px 0 0">@' + esc(res.user) + ' · ' + esc(A.platName('tiktok')) + ' · ' + UI.dt(res.at) + ' · ' + res.ms + ' ms · معرّف الاختبار <span class="mono ltr">' + esc(res.id) + '</span></p></div>'; }
        $('#l-out', v).innerHTML = html; $('#l-re', v).disabled = busy || !res; $('#l-clear', v).disabled = busy || !res; $('#l-det', v).disabled = !res; $('#l-run', v).disabled = busy;
      };
      var hist = function () {
        if (!f.rtdb) { $('#l-hist', v).innerHTML = UI.empty('list', 'سجل الاختبارات غير متاح'); return; }
        f.rtdbGet(f.rtdbRef(f.rtdb, 'adminConnTests/' + me.uid)).then(function (s) { var val = s.val() || {}; var rows = Object.keys(val).map(function (k) { val[k]._id = k; return val[k]; }).sort(function (a, b) { return (b.startedAt || 0) - (a.startedAt || 0); }).slice(0, 15);
          $('#l-hist', v).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>الستريمر</th><th>المنصة</th><th>النتيجة</th></tr></thead><tbody>' + rows.map(function (r) { return '<tr><td>' + UI.dt(r.startedAt) + '</td><td class="ltr">@' + esc(r.streamer) + '</td><td>' + esc(A.platName(r.platform)) + '</td><td class="r-' + (r.result === 'success' ? 'ok' : r.result === 'unverified' ? 'unverified' : (r.status === 'running' ? 'unverified' : 'failed')) + '">' + esc({ success: 'نجح', failed: 'فشل', unverified: 'غير مؤكد' }[r.result] || (r.status === 'running' ? 'قيد التنفيذ/لم يكتمل' : '—')) + '</td></tr>'; }).join('') + '</tbody></table></div>' : UI.empty('list', 'لا اختبارات سابقة');
        }, function (e) { $('#l-hist', v).innerHTML = UI.error('تعذّر تحميل السجل', D.errText(e)); });
      };
      var run = function () {
        if (busy) return; var user = C.clean($('#l-user', v).value);
        if (!$('#l-user', v).value.trim()) { UI.toast('أدخل يوزر الستريمر أولاً', 'warn'); return; }
        var now = Date.now(); if (now - LAST.at < 9000) { UI.toast('انتظر قليلاً قبل اختبار جديد (حدّ الاختبارات المتتالية).', 'warn'); return; }
        if (user && LAST.user === user && now - (LAST.tests[user] || 0) < 20000) { UI.toast('اختُبر هذا الحساب قبل لحظات. انتظر ٢٠ ثانية.', 'warn'); return; }
        busy = true; res = null; stagesState = []; LAST.at = now; LAST.user = user; LAST.tests[user] = now; draw();
        var tid = D.reqId(); var rec = { platform: 'tiktok', streamer: user || String($('#l-user', v).value).replace(/[^\w.]/g, '').slice(0, 30) || 'invalid', status: 'running', startedAt: { '.sv': 'timestamp' } };
        var up = {}; up['adminConnTests/' + me.uid + '/' + tid] = rec; up['adminConnTestMeta/' + me.uid + '/last'] = { '.sv': 'timestamp' };
        /* الخادم (القواعد) يفرض: صلاحية الاختبار + حدّ ٨ ثوانٍ بين اختبارين لنفس الأدمن */
        var gate = f.rtdb ? f.rtdbUpdate(f.rtdbRef(f.rtdb), up) : Promise.reject(new Error('RTDB غير متاح'));
        gate.then(function () {
          return cfg().then(function (tmo) { return C.run({ streamer: user, timeoutMs: tmo }, function (i, st) { stagesState[i] = st; draw(); }); });
        }, function (e) { return { verdict: 'failed', reason: D.isDenied(e) ? 'لا توجد صلاحية لإجراء هذا النوع من الاختبار، أو تجاوزت حدّ الاختبارات المتتالية.' : 'تعذّر بدء الاختبار: ' + D.errText(e), stages: [], ms: 0, gateFail: true }; }).then(function (r) {
          res = Object.assign({ id: tid, user: user || '—', at: Date.now() }, r); busy = false; draw();
          if (!r.gateFail) { var upd = { status: 'done', result: r.verdict, ms: r.ms, completedAt: { '.sv': 'timestamp' }, reason: String(r.reason || '').slice(0, 120) }; if (f.rtdb) f.rtdbUpdate(f.rtdbRef(f.rtdb, 'adminConnTests/' + me.uid + '/' + tid), upd).then(hist, hist); D.log('conn.test', { resourceType: 'conn-test', resourceId: tid, targetName: user, result: r.verdict === 'success' ? 'success' : (r.verdict === 'unverified' ? 'unverified' : 'failed'), meta: { platform: 'tiktok', ms: r.ms } }); }
        });
      };
      var cfg = function () { if (!f.rtdb) return Promise.resolve(20000); return f.rtdbGet(f.rtdbRef(f.rtdb, 'opsConfig/current/adminConnTest/values/timeoutMs')).then(function (s) { var n = +s.val(); return n >= 8000 && n <= 40000 ? n : 20000; }, function () { return 20000; }); };
      $('#l-run', v).onclick = run; $('#l-re', v).onclick = run;
      $('#l-clear', v).onclick = function () { res = null; stagesState = []; $('#l-out', v).innerHTML = '<div class="state">' + ic('flask') + '<h4>أدخل يوزر الستريمر لبدء الفحص</h4></div>'; $('#l-re', v).disabled = true; $('#l-clear', v).disabled = true; $('#l-det', v).disabled = true; };
      $('#l-det', v).onclick = function () { if (!res) return; UI.modal({ title: 'تفاصيل الاختبار', wide: true, html: '<div class="mono ltr sm" style="white-space:pre-wrap;word-break:break-all">' + esc(JSON.stringify({ id: res.id, platform: 'tiktok', streamer: res.user, verdict: res.verdict, reason: res.reason, ms: res.ms, at: new Date(res.at).toISOString(), stages: (res.stages || []).map(function (s, i) { return { stage: STAGES[i][0], status: s.s, note: s.note, ms: s.ms }; }) }, null, 2)) + '</div><p class="mut sm" style="margin-top:10px">لا تُحفظ في السجل بيانات اعتماد ولا رموز جلسة.</p>' }); };
      $('#l-user', v).addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
      $('#l-find', v).onclick = function () { var q = $('#l-site', v).value; if (!D.key(q)) return; D.lookupUser(q).then(function (u) { var n = $('#l-site-n', v); if (!u) { n.textContent = 'لا يوجد حساب بهذا اليوزر.'; return; } if (!u.tiktok) { n.textContent = 'الحساب «' + u.username + '» لم يربط تيك توك — أدخل يوزر البث يدوياً.'; return; } $('#l-user', v).value = '@' + u.tiktok; n.textContent = 'تم: حساب احسمها «' + u.username + '» ← تيك توك @' + u.tiktok; }, function (e) { $('#l-site-n', v).textContent = D.errText(e); }); };
      hist();
    } });
})(window);
