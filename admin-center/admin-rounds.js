/* لوحة الأدمن: مراقبة نتائج الجولات (قراءة فقط). المصدر: adminRounds (نتيجة رسمية تُسجَّل لحظة recordWin في محرك اللعبة) + أحداث الراوند (opsEvents). */
(function (w) {
  'use strict';
  var A = w.AdminApp, D = w.EhsAdminData, UI = A.UI, esc = UI.esc, $ = UI.$, ic = UI.ic, nf = UI.nf;
  var R = (w.AdminRounds = {});
  R.dayKey = function (ms) { var d = new Date(ms); return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); };
  R.dayLabel = function (k) { return k.slice(0, 4) + '-' + k.slice(4, 6) + '-' + k.slice(6); };
  var PAGE = 25; var FS = { q: '', game: '', page: 0, dayOff: 0 };

  /** يجمع سجلات الفوز في جولات (الراوند الواحد قد يحوي عدة فائزين). */
  R.group = function (val, events) {
    var map = {}; Object.keys(val || {}).forEach(function (k) {
      var r = val[k]; var key = r.rid || ('norid_' + k); var g = map[key] || (map[key] = { key: key, rid: r.rid || '', sid: r.sid || '', game: r.game, gameName: r.gameName, streamer: r.streamer, platform: r.platform, winners: [], first: 0, last: 0, rstart: r.rstart || 0, uid: r.uid });
      g.winners.push({ u: r.w && r.w.u, n: r.w && r.w.n, pts: r.pts || 1, ts: r.ts || 0 }); g.first = g.first ? Math.min(g.first, r.ts || 0) : (r.ts || 0); g.last = Math.max(g.last, r.ts || 0); if (r.rstart && !g.rstart) g.rstart = r.rstart;
    });
    var ev = {}; Object.keys(events || {}).forEach(function (k) { var e = events[k]; if (e.rid) (ev[e.rid] = ev[e.rid] || []).push(e); });
    return Object.keys(map).map(function (k) { var g = map[k]; g.events = (ev[g.rid] || []).sort(function (a, b) { return (a.t || 0) - (b.t || 0); }); var en = g.events.filter(function (e) { return e.type === 'round_end'; })[0]; g.end = en ? en.t : 0; var n = (g.rid.match(/_(\d+)$/) || [])[1]; g.no = n ? +n : 0; g.winners.sort(function (a, b) { return a.ts - b.ts; }); return g; }).sort(function (a, b) { return b.last - a.last; });
  };

  A.register({ id: 'rounds', group: 'المراقبة', title: 'نتائج الجولات', en: 'ROUND RESULTS', icon: 'trophy', perm: 'admin.rounds.view', desc: 'نتائج رسمية مسجّلة من محرك كل لعبة. للمشاهدة فقط: لا تعديل ولا حذف ولا إعادة احتساب.',
    mount: function (v) {
      var S = this, f = D.fb(), val = null, err = null, ready = false, evs = {}, off = null, day = R.dayKey(Date.now() - FS.dayOff * 864e5);
      v.innerHTML = A.head(S, '') + '<div class="card pad" style="margin-bottom:14px;border-color:rgba(167,139,250,.3)"><span class="sm">تُسجَّل النتائج للجولات التي انتهت <b>بعد تفعيل هذه الميزة</b> فقط، ولا تُنشأ بيانات تاريخية ولا تُعدَّل نتائج قديمة. اليوم بتوقيت UTC.</span></div>' +
        '<div class="tools"><button class="btn sm" id="d-prev" aria-label="اليوم السابق">' + ic('back') + '</button><b id="d-lbl" class="mono ltr"></b><button class="btn sm" id="d-next" aria-label="اليوم التالي" style="transform:scaleX(-1)">' + ic('back') + '</button>' +
        '<input class="in grow" id="r-q" type="search" placeholder="ابحث باسم الستريمر أو الفائز" aria-label="بحث"><select class="in" id="r-game" aria-label="اللعبة"><option value="">كل الألعاب</option></select></div><div id="r-body">' + UI.skel(3) + '</div>';
      var rows = [];
      var paint = function () {
        var box = $('#r-body', v); if (!box || !ready) return; $('#d-lbl', v).textContent = R.dayLabel(day); $('#d-next', v).disabled = FS.dayOff <= 0;
        if (err) { box.innerHTML = UI.error('تعذّر تحميل النتائج', err === 'denied' ? 'لا تملك صلاحية قراءة النتائج.' : err, '<button class="btn sm" data-a="retry">' + ic('refresh') + '<span>إعادة المحاولة</span></button>'); return; }
        rows = R.group(val, evs); var games = {}; rows.forEach(function (g) { if (g.game) games[g.game] = A.gameName(g.game) || g.gameName; });
        var sel = $('#r-game', v); if (sel.options.length - 1 !== Object.keys(games).length) { sel.innerHTML = '<option value="">كل الألعاب</option>' + Object.keys(games).map(function (k) { return '<option value="' + esc(k) + '">' + esc(games[k]) + '</option>'; }).join(''); sel.value = FS.game; }
        var q = FS.q.trim().toLowerCase(); var list = rows.filter(function (g) { return (!FS.game || g.game === FS.game) && (!q || (g.streamer + ' ' + g.winners.map(function (x) { return x.n + ' ' + x.u; }).join(' ')).toLowerCase().indexOf(q) >= 0); });
        if (!list.length) { box.innerHTML = UI.empty('trophy', 'لا توجد نتائج مسجّلة', rows.length ? 'لا نتائج مطابقة للبحث.' : 'لم تُسجَّل نتائج في هذا اليوم.'); return; }
        var pages = Math.ceil(list.length / PAGE); FS.page = Math.min(FS.page, pages - 1); var pg = list.slice(FS.page * PAGE, FS.page * PAGE + PAGE);
        box.innerHTML = '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>الستريمر</th><th>اللعبة</th><th>الجلسة</th><th>الجولة</th><th>الوقت</th><th>الفائزون</th><th>الحالة</th></tr></thead><tbody>' + pg.map(function (g) { return '<tr data-k="' + esc(g.key) + '"><td>' + esc(g.streamer || '—') + '</td><td>' + esc(A.gameName(g.game) || g.gameName || '—') + '</td><td class="mono ltr">' + esc((g.sid || '').slice(-8)) + '</td><td>' + (g.no ? nf(g.no) : '—') + '</td><td>' + UI.dt(g.last) + '</td><td>' + esc(g.winners.map(function (x) { return x.n; }).join('، ')) + '</td><td><span class="pill ok"><i class="d"></i>محفوظة</span></td></tr>'; }).join('') + '</tbody></table></div></div>' +
          '<div class="row" style="margin-top:12px"><button class="btn sm" data-p="-1" ' + (FS.page ? '' : 'disabled') + '>السابق</button><span class="mut sm">صفحة ' + nf(FS.page + 1) + ' من ' + nf(pages) + ' · ' + nf(list.length) + ' جولة</span><button class="btn sm" data-p="1" ' + (FS.page < pages - 1 ? '' : 'disabled') + '>التالي</button></div>';
      };
      var sub = function () {
        if (off) { try { off(); } catch (e) {} off = null; } ready = false; $('#r-body', v).innerHTML = UI.skel(3);
        var ref = f.rtdbQuery(f.rtdbRef(f.rtdb, 'adminRounds/' + day), f.rtdbLimitToLast(500));
        var h = f.rtdbOnValue(ref, function (s) { val = s.val(); err = null; ready = true; paint(); }, function (e) { err = D.isDenied(e) ? 'denied' : D.errText(e); ready = true; paint(); });
        off = typeof h === 'function' ? h : function () { try { f.rtdbOff(ref, 'value'); } catch (e) {} };
      };
      v._leave = function () { try { off && off(); } catch (e) {} };
      A.feed.use('events', v, function (e) { evs = e || {}; paint(); }); sub();
      var deb = 0; v.addEventListener('input', function (e) { if (e.target.id === 'r-q') { clearTimeout(deb); deb = setTimeout(function () { FS.q = e.target.value; FS.page = 0; paint(); }, 160); } });
      v.addEventListener('change', function (e) { if (e.target.id === 'r-game') { FS.game = e.target.value; FS.page = 0; paint(); } });
      v.addEventListener('click', function (e) {
        if (e.target.closest('#d-prev')) { FS.dayOff = Math.min(FS.dayOff + 1, 14); day = R.dayKey(Date.now() - FS.dayOff * 864e5); FS.page = 0; sub(); return; }
        if (e.target.closest('#d-next') && FS.dayOff > 0) { FS.dayOff--; day = R.dayKey(Date.now() - FS.dayOff * 864e5); FS.page = 0; sub(); return; }
        var p = e.target.closest('[data-p]'); if (p) { FS.page += +p.dataset.p; paint(); return; }
        if (e.target.closest('[data-a="retry"]')) { sub(); return; }
        var tr = e.target.closest('tr[data-k]'); if (!tr) return; var g = rows.find(function (x) { return x.key === tr.dataset.k; }); if (g) detail(g);
      });
    },
    leave: function (v) { if (v && v._leave) v._leave(); } });

  function detail(g) {
    var kv = function (k, val) { return '<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line2)"><span class="mut sm" style="min-width:130px">' + esc(k) + '</span><b class="sm">' + (val == null || val === '' ? '—' : val) + '</b></div>'; };
    UI.drawer({ title: 'نتيجة الجولة — ' + (A.gameName(g.game) || g.gameName), html:
      '<div class="card pad" style="margin-bottom:12px"><h3>معلومات الجولة</h3>' + kv('اللعبة', esc(A.gameName(g.game) || g.gameName)) + kv('الستريمر', esc(g.streamer)) + kv('المنصة', esc(A.platName(g.platform))) + kv('معرّف الجلسة', '<span class="mono ltr">' + esc(g.sid) + '</span>') + kv('رقم الجولة', g.no ? nf(g.no) : '') + kv('بداية الجولة', g.rstart ? UI.dt(g.rstart) : 'غير مسجّلة') + kv('نهاية الجولة', g.end ? UI.dt(g.end) : 'غير مسجّلة') + kv('وقت تسجيل النتيجة', UI.dt(g.last)) + kv('مصدر البيانات', 'recordWin — النتيجة الرسمية من محرك اللعبة') + '</div>' +
      '<div class="card pad" style="margin-bottom:12px"><h3>الفائزون (' + nf(g.winners.length) + ')</h3>' + g.winners.map(function (x, i) { return '<div class="row" style="padding:6px 0"><b>' + nf(i + 1) + '.</b><span>' + esc(x.n || x.u) + '</span><span class="mut sm ltr">' + esc(x.u) + '</span><span class="sp"></span><span class="sm">' + nf(x.pts) + ' نقطة فوز</span></div>'; }).join('') + '<p class="mut sm" style="margin-top:8px">المستبعدون والترتيب الكامل غير مسجّلين في هذا المصدر (تسجّل اللعبة الفائز عند احتسابه فقط).</p></div>' +
      '<div class="card pad"><h3>أحداث الجولة</h3>' + (g.events.length ? g.events.map(function (e) { return '<div class="row sm" style="padding:4px 0"><span class="mono">' + UI.tm(e.t) + '</span><b>' + esc(e.type) + '</b><span class="mut">' + esc(e.msg || '') + '</span></div>'; }).join('') : '<p class="mut sm">لا أحداث مسجّلة لهذا الراوند ضمن آخر ٤ ساعات.</p>') + '</div>' });
  }
})(window);
