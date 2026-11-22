/* لوحة الأدمن: الإطارات — معرض الإطارات الفعلي للموقع + منح باليوزر + منح بكود سري + سجل المنح.
 * المنح الحقيقي: دفعة Firestore واحدة (levels + سجل) والقواعد على الخادم ترفض أي منح بلا صلاحية أو خارج نطاق الأدمن أو بلا سجل.
 * لا يظهر نجاح قبل رد الخادم. الأكواد: لا قائمة ولا عرض لنصوصها، والكود الخام لا يُحفظ في السجل. */
(function (w) {
  'use strict';
  var A = w.AdminApp, D = w.EhsAdminData, P = w.EhsAdminPerms, UI = A.UI, esc = UI.esc, $ = UI.$, ic = UI.ic, nf = UI.nf;
  var FS = { q: '', mode: 'all', tab: 'direct' };
  var CODE_ERR = { NOTFOUND: 'الكود غير صحيح', STOPPED: 'هذا الكود متوقف حالياً', EXPIRED: 'انتهت صلاحية هذا الكود', MAXED: 'وصل هذا الكود للحد الأقصى من الاستخدام', NOFRAME: 'هذا الكود ليس عليه إطار مربوط', DENIED: 'لا تملك صلاحية التحقق من الأكواد', EMPTY: 'اكتب الكود أولاً', ERROR: 'تعذّر التحقق من الكود' };

  A.register({ id: 'frames', group: 'الإطارات', title: 'الإطارات', en: 'FRAMES DISTRIBUTION', icon: 'frame', perm: 'admin.frames.view', desc: 'معرض إطارات احسمها الفعلي ومنحها للمستخدمين ضمن القائمة التي حدّدها لك المالك.',
    mount: function (v) {
      var S = this; var allowed = P.framesAllowed(A.rec); var cat = D.catalog(); var sel = null, user = null, chk = null, busy = false;
      var canGrant = A.can('admin.frames.grant'), canCode = A.can('admin.frames.redeem_code');
      var tabs = [['direct', 'منح مباشر باليوزر', canGrant], ['code', 'منح بكود سري', canCode], ['hist', 'سجل المنح', A.can('admin.frames.history')]].filter(function (t) { return t[2]; });
      if (!tabs.some(function (t) { return t[0] === FS.tab; })) FS.tab = tabs.length ? tabs[0][0] : 'gallery';
      v.innerHTML = A.head(S, '') + '<div class="tabs" role="tablist"><button class="tab" role="tab" data-tab="gallery" aria-selected="' + (FS.tab === 'gallery') + '">معرض الإطارات</button>' + tabs.map(function (t) { return '<button class="tab" role="tab" data-tab="' + t[0] + '" aria-selected="' + (FS.tab === t[0]) + '">' + t[1] + '</button>'; }).join('') + '</div><div id="fr-body"></div>';
      var mayGrant = function (id) { return allowed.indexOf(id) >= 0; };
      var galleryHtml = function (pick) {
        var q = FS.q.trim().toLowerCase(); var list = cat.filter(function (f) { return (!q || (String(f.name) + ' ' + f.id).toLowerCase().indexOf(q) >= 0) && (FS.mode !== 'mine' || mayGrant(f.id)) && (FS.mode !== 'other' || !mayGrant(f.id)); });
        if (!cat.length) return UI.error('تعذّر قراءة كتالوج الإطارات من الموقع', 'أعد فتح لوحة الأدمن بعد تحميل الموقع بالكامل.');
        if (!allowed.length && (canGrant || canCode)) return '<div class="card pad" style="margin-bottom:12px;border-color:var(--warn)">لا توجد إطارات مسموح لك بمنحها. اطلب من المالك تحديد قائمة إطاراتك.</div>';
        return '<div id="fr-gal"><div class="tools"><input class="in grow" id="fr-q" type="search" placeholder="ابحث باسم الإطار أو معرّفه" aria-label="بحث" value="' + esc(FS.q) + '"><select class="in" id="fr-mode" aria-label="فلتر"><option value="all">كل الإطارات</option><option value="mine">المسموح لي بمنحها</option><option value="other">غير المسموحة</option></select></div>' +
          (list.length ? '<div class="fgrid">' + list.map(function (f) { var ok = mayGrant(f.id); return '<button class="card fcard ' + (ok ? '' : 'na') + '" data-fid="' + esc(f.id) + '" aria-pressed="' + (sel === f.id) + '" ' + (pick && !ok ? 'disabled title="خارج قائمتك المسموحة"' : '') + '><span class="pv"><img src="' + esc(D.frameImg(f)) + '" alt="" loading="lazy"></span><b>' + esc(f.name || f.id) + '</b><small>' + esc(f.id) + '</small><span class="pill ' + (ok ? 'ok' : '') + '"><i class="d"></i>' + (ok ? 'يمكنك منحه' : 'غير مسموح') + '</span></button>'; }).join('') + '</div>' : UI.empty('frame', 'لا توجد إطارات متاحة لصلاحيات حسابك', 'غيّر الفلتر أو اطلب من المالك تعديل قائمتك.')) + '</div>';
      };
      var userBox = function () { return '<div class="field"><label for="fr-u">يوزر المستخدم في احسمها</label><div class="row"><input class="in" id="fr-u" dir="ltr" autocomplete="off" placeholder="username" style="flex:1"><button class="btn sm" id="fr-find">بحث</button></div></div><div id="fr-ures" aria-live="polite">' + (user ? uHtml(user) : '') + '</div>'; };
      var uHtml = function (u) { var a = u.avatar; return '<div class="ures"><span class="av">' + (/^https:\/\//.test(a || '') ? '<img src="' + esc(a) + '" alt="" referrerpolicy="no-referrer">' : esc((u.username[0] || '?').toUpperCase())) + '</span><div><b>' + esc(u.username) + '</b><div class="mut sm mono ltr">' + esc(u.uid) + '</div></div></div>'; };
      var frameOf = function (id) { return cat.find(function (f) { return f.id === id; }); };
      var directHtml = function () { return '<div class="split"><div class="card pad"><h3>١) اختر المستخدم</h3>' + userBox() + '<h3 style="margin-top:14px">٢) اختر الإطار</h3><p class="mut sm" style="margin:0 0 10px">الإطارات المسموح لك بمنحها فقط قابلة للاختيار.</p>' + galleryHtml(true) + '</div><div class="card pad"><h3>٣) المنح</h3><div id="fr-sum">' + sumHtml() + '</div></div></div>'; };
      var sumHtml = function () { var f = sel && frameOf(sel); return '<div class="okbox">' + (f ? '<div class="fr"><img src="' + esc(D.frameImg(f)) + '" alt=""></div><b>' + esc(f.name || f.id) + '</b>' : '<p class="mut">لم يُختر إطار بعد.</p>') + '</div><p class="sm">المستفيد: <b>' + (user ? esc(user.username) : '—') + '</b></p><button class="btn pri" id="fr-go" ' + (user && sel && !busy ? '' : 'disabled') + '>' + ic('gift') + '<span>منح الإطار</span></button><div id="fr-msg" class="sm" role="status" style="margin-top:10px"></div>'; };
      var codeHtml = function () { return '<div class="split"><div class="card pad"><h3>١) المستخدم</h3>' + userBox() + '<h3 style="margin-top:14px">٢) الكود السري</h3><div class="field"><label for="fr-code">الكود</label><div class="row"><input class="in" id="fr-code" autocomplete="off" spellcheck="false" style="flex:1"><button class="btn sm" id="fr-chk">التحقق من الكود</button></div></div><div id="fr-cres" aria-live="polite"></div></div><div class="card pad"><h3>٣) المنح بالكود</h3><div id="fr-csum">' + csum() + '</div><p class="mut sm" style="margin-top:10px">لا تُعرض قائمة الأكواد ولا تُحفظ نصوصها في السجل. الكود يُستهلك مرة واحدة للمستخدم المستهدف ويحتسب بعدّاد استخدامه.</p></div></div>'; };
      var csum = function () { if (!chk || !chk.ok) return '<p class="mut">تحقّق من الكود أولاً.</p><button class="btn pri" id="fr-cgo" disabled>' + ic('key') + '<span>منح الإطار بالكود</span></button>'; var f = frameOf(chk.frameId); var okScope = mayGrant(chk.frameId);
        return '<div class="okbox">' + (f ? '<div class="fr"><img src="' + esc(D.frameImg(f)) + '" alt=""></div>' : '') + '<b>' + esc((f && f.name) || chk.frameName || chk.frameId) + '</b></div><p class="sm">المستخدمون: ' + nf(chk.usedCount) + ' / ' + nf(chk.maxUses) + (chk.expiresAt ? ' · ينتهي ' + UI.dt(chk.expiresAt) : '') + '</p>' + (okScope ? '' : '<p class="sm" style="color:var(--warn)">هذا الإطار خارج قائمتك المسموحة — سيرفض الخادم المنح.</p>') + '<button class="btn pri" id="fr-cgo" ' + (user && !busy ? '' : 'disabled') + '>' + ic('key') + '<span>منح الإطار بالكود</span></button><div id="fr-cmsg" class="sm" role="status" style="margin-top:10px"></div>'; };
      var histHtml = function () { return '<div class="card pad"><h3>سجل المنح الخاص بي</h3><div id="fr-h">' + UI.skel(2) + '</div></div>'; };
      var loadHist = function () { D.history({ limit: 200 }).then(function (rows) { rows = rows.filter(function (r) { return /^frame\./.test(r.action); }); $('#fr-h', v).innerHTML = rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>الوقت</th><th>النوع</th><th>المستفيد</th><th>الإطار</th><th>النتيجة</th></tr></thead><tbody>' + rows.map(function (r) { var f = frameOf(r.resourceId); return '<tr><td>' + UI.dt(r._ts) + '</td><td>' + (r.action === 'frame.redeem_code' ? 'بكود' : 'مباشر') + '</td><td>' + esc(r.targetName || r.targetKey) + '</td><td>' + esc((f && f.name) || r.resourceId) + '</td><td class="r-' + esc(r.result) + '">' + ({ success: 'نجح', denied: 'مرفوض', failed: 'فشل', unverified: 'غير مؤكد' }[r.result] || r.result) + '</td></tr>'; }).join('') + '</tbody></table></div>' : UI.empty('list', 'لا عمليات منح مسجّلة'); }, function (e) { $('#fr-h', v).innerHTML = UI.error('تعذّر تحميل السجل', D.errText(e)); }); };
      var paint = function () { var b = $('#fr-body', v); $$tabs(); b.innerHTML = FS.tab === 'gallery' ? galleryHtml(false) : FS.tab === 'direct' ? directHtml() : FS.tab === 'code' ? codeHtml() : histHtml(); if (FS.tab === 'hist') loadHist(); var m = $('#fr-mode', v); if (m) m.value = FS.mode; };
      var $$tabs = function () { UI.$$('.tab', v).forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === FS.tab)); }); };
      var find = function () { var q = $('#fr-u', v).value; if (!D.key(q)) return; var r = $('#fr-ures', v); r.innerHTML = '<div class="skel" style="height:56px"></div>'; user = null; D.lookupUser(q).then(function (u) { if (!u) { r.innerHTML = '<p style="color:var(--warn)">لا يوجد حساب بهذا اليوزر. اكتب يوزر احسمها كاملاً (لا الاسم الظاهر).</p>'; refreshSum(); return; } user = u; r.innerHTML = uHtml(u); refreshSum(); }, function (e) { r.innerHTML = UI.error('تعذّر البحث', D.errText(e)); }); };
      var refreshSum = function () { var s = $('#fr-sum', v); if (s) s.innerHTML = sumHtml(); var c = $('#fr-csum', v); if (c) c.innerHTML = csum(); };
      var fail = function (e, msgEl, kind, extra) {
        var denied = D.isDenied(e); var txt = denied ? 'رفض الخادم العملية: لا تملك الصلاحية أو الإطار خارج قائمتك أو الحساب موقوف.' : 'تعذّر تنفيذ العملية: ' + D.errText(e);
        msgEl.innerHTML = '<span style="color:var(--bad)">' + esc(txt) + '</span>' + (extra ? '<br><span class="mut">' + esc(extra) + '</span>' : '');
        /* محاولة مرفوضة: تُسجَّل كأثر (قد يرفضه الخادم أيضاً إن كان الأدمن موقوفاً) */
        D.log('frame.grant.denied', { resourceType: 'frame', resourceId: sel || (chk && chk.frameId) || '', targetUid: user && user.uid, targetName: user && user.username, result: denied ? 'denied' : 'failed', meta: { kind: kind } });
      };
      var verifyOwn = function (id) { return D.owns(user, id); };
      var doGrant = function () {
        if (busy || !user || !sel) return; var f = frameOf(sel);
        UI.confirm({ title: 'تأكيد منح الإطار', text: 'سيُمنح الإطار «' + ((f && f.name) || sel) + '» للمستخدم «' + user.username + '» (طريقة المنح: مباشر).', html: '<div class="okbox"><div class="fr"><img src="' + esc(D.frameImg(f)) + '" alt=""></div></div>', label: 'تأكيد المنح' }).then(function (ok) {
          if (!ok) return; busy = true; refreshSum(); var msg = $('#fr-msg', v); msg.textContent = 'جارٍ الحفظ على الخادم…';
          D.grantFrame(user, sel, 'direct').then(function (r) { return verifyOwn(sel).then(function (o) {
            busy = false; refreshSum(); var m2 = $('#fr-msg', v);
            if (r.already) { m2.innerHTML = '<span style="color:var(--warn)">المستخدم يملك هذا الإطار بالفعل — لم يتغير شيء.</span>'; return; }
            if (!o.any) { m2.innerHTML = '<span style="color:var(--warn)">لم يُؤكَّد ظهور الإطار عند المستفيد بعد. تحقق لاحقاً.</span>'; D.log('frame.grant.unverified', { resourceType: 'frame', resourceId: sel, targetUid: user.uid, targetName: user.username, result: 'unverified' }); return; }
            m2.innerHTML = '<span style="color:var(--ok)">✓ حُفظ المنح على الخادم وتحقّقنا من ظهور الإطار في حساب «' + esc(user.username) + '».</span>';
            UI.toast('تم منح الإطار «' + ((f && f.name) || sel) + '» لـ ' + user.username, 'ok');
          }); }, function (e) { busy = false; refreshSum(); fail(e, $('#fr-msg', v), 'direct'); });
        });
      };
      var doCheck = function () {
        var raw = $('#fr-code', v).value; var r = $('#fr-cres', v); r.innerHTML = '<div class="skel" style="height:48px"></div>'; chk = null;
        D.checkCode(raw).then(function (c) { chk = c; r.innerHTML = c.ok ? '<p style="color:var(--ok)">✓ الكود صالح.</p>' : '<p style="color:var(--warn)">' + esc(CODE_ERR[c.reason] || 'غير صالح') + '</p>'; refreshSum(); });
      };
      var doCode = function () {
        if (busy || !user || !chk || !chk.ok) return; var f = frameOf(chk.frameId);
        UI.confirm({ title: 'تأكيد منح إطار بكود', text: 'سيُسجَّل استخدام الكود للمستخدم «' + user.username + '» ويُمنح الإطار «' + ((f && f.name) || chk.frameId) + '». لا يمكن استخدام نفس الكود لهذا المستخدم مرتين.', label: 'تأكيد' }).then(function (ok) {
          if (!ok) return; busy = true; refreshSum(); var msg = $('#fr-cmsg', v); msg.textContent = 'جارٍ التنفيذ على الخادم…';
          D.redeemCodeFor(user, chk).then(function (r) { return verifyOwn(chk.frameId).then(function (o) { busy = false; chk = null; $('#fr-code', v).value = ''; $('#fr-cres', v).innerHTML = ''; refreshSum(); var m2 = $('#fr-cmsg', v) || $('#fr-body', v); UI.toast(o.any ? 'تم منح الإطار بالكود' : 'نُفّذ المنح لكن لم يُؤكَّد ظهوره بعد', o.any ? 'ok' : 'warn'); var c2 = $('#fr-csum', v); if (c2) c2.innerHTML = '<p style="color:' + (o.any ? 'var(--ok)' : 'var(--warn)') + '">' + (o.any ? '✓ حُفظ المنح وتحقّقنا من ظهور الإطار عند «' + esc(user.username) + '».' : 'نُفّذ المنح ولم نؤكد الظهور بعد.') + '</p>'; }); },
            function (e) { busy = false; refreshSum(); fail(e, $('#fr-cmsg', v) || $('#fr-csum', v), 'code', e && e.rolledBack === true ? 'أُلغي تسجيل استخدام الكود (لم يُستهلك).' : (e && e.rolledBack === false ? 'تحذير: تعذّر التراجع عن تسجيل الاستخدام — راجع المالك.' : '')); });
        });
      };
      v.addEventListener('click', function (e) {
        var t = e.target.closest('.tab'); if (t) { FS.tab = t.dataset.tab; sel = null; paint(); return; }
        var f = e.target.closest('[data-fid]'); if (f && !f.disabled) { if (FS.tab === 'direct') { sel = f.dataset.fid; UI.$$('[data-fid]', v).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.fid === sel)); }); refreshSum(); } return; }
        if (e.target.closest('#fr-find')) return find(); if (e.target.closest('#fr-go')) return doGrant(); if (e.target.closest('#fr-chk')) return doCheck(); if (e.target.closest('#fr-cgo')) return doCode();
      });
      var deb = 0; v.addEventListener('input', function (e) { if (e.target.id !== 'fr-q') return; clearTimeout(deb); deb = setTimeout(function () { FS.q = e.target.value; var g = $('#fr-gal', v); if (!g) return; g.outerHTML = galleryHtml(FS.tab === 'direct'); var q = $('#fr-q', v); q.focus(); q.setSelectionRange(q.value.length, q.value.length); var m = $('#fr-mode', v); if (m) m.value = FS.mode; }, 160); });
      v.addEventListener('change', function (e) { if (e.target.id === 'fr-mode') { FS.mode = e.target.value; paint(); } });
      v.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target.id === 'fr-u') find(); if (e.key === 'Enter' && e.target.id === 'fr-code') doCheck(); });
      paint();
    },
    onAccess: function () { A.refreshCurrent(); } });
})(window);
