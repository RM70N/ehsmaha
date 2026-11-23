/* EHSMAHA — لوحة الأدمن: النواة (واجهة مشتركة، تنقّل، صلاحيات، مصادر بيانات حيّة بإشتراكات تُلغى تلقائياً).
 * كل صلاحية تُفحص هنا للإخفاء/التعطيل فقط؛ الحماية الحقيقية في قواعد Firestore/RTDB. لا بيانات مزيفة: غياب المصدر = حالة «غير متاح». */
(function (w) {
  'use strict';
  var P = w.EhsAdminPerms, D = w.EhsAdminData;
  var A = (w.AdminApp = { rec: null, sections: {}, order: [], cur: null, view: null });

  /* ---------- أدوات ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var nf = function (n) { try { return Number(n).toLocaleString('ar-EG-u-nu-latn'); } catch (e) { return String(n); } };
  var ago = function (t) { if (!t) return '—'; var d = Date.now() - t; if (d < 5000) return 'الآن'; if (d < 60000) return 'قبل ' + Math.floor(d / 1000) + ' ث'; if (d < 3600000) return 'قبل ' + Math.floor(d / 60000) + ' د'; if (d < 86400000) return 'قبل ' + Math.floor(d / 3600000) + ' س'; return 'قبل ' + Math.floor(d / 86400000) + ' يوم'; };
  var dur = function (ms) { ms = Math.max(0, ms | 0); var s = Math.floor(ms / 1000); if (s < 60) return s + ' ث'; var m = Math.floor(s / 60); if (m < 60) return m + ' د ' + (s % 60) + ' ث'; var h = Math.floor(m / 60); return h + ' س ' + (m % 60) + ' د'; };
  var dt = function (t) { if (!t) return '—'; return new Date(t).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'medium' }); };
  var tm = function (t) { if (!t) return '—'; return new Date(t).toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  var ICON = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', radio: 'M4.9 19.1a10 10 0 0 1 0-14.2M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M19.1 4.9a10 10 0 0 1 0 14.2M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3',
    plug: 'M9 2v6M15 2v6M7 8h10v4a5 5 0 0 1-10 0zM12 17v5', flask: 'M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3', frame: 'M3 3h18v18H3zM8 8h8v8H8z',
    ext: 'M14 4h6v6M20 4 10 14M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5', list: 'M4 6h16M4 12h16M4 18h10', check: 'm5 12 5 5 9-10', x: 'M6 6l12 12M18 6 6 18',
    alert: 'M12 3 2 20h20zM12 10v5M12 18h.01', refresh: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3', gamepad: 'M6 12h4M8 10v4M15 13h.01M18 11h.01M17.3 5H6.7a4 4 0 0 0-4 3.4l-1 6.5a3 3 0 0 0 5.1 2.2L8.5 16h7l2.7 1.1a3 3 0 0 0 5.1-2.2l-1-6.5a4 4 0 0 0-4-3.4z',
    shield: 'M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z', key: 'M15 7a4 4 0 1 1-3.8 5.2L4 19v-3l1-1v-2h2l1.5-1.5A4 4 0 0 1 15 7z', gift: 'M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8s-1-5-4-5a2.5 2.5 0 0 0 0 5M12 8s1-5 4-5a2.5 2.5 0 0 1 0 5',
    wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01', play: 'M7 4v16l13-8z', stop: 'M6 6h12v12H6z', link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1', back: 'M19 12H5M12 5l-7 7 7 7', ban: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM5.6 5.6l12.8 12.8'
  };
  var ic = function (n, c) { return '<svg class="ic ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="' + (ICON[n] || ICON.alert) + '"/></svg>'; };
  var UI = A.UI = { esc: esc, $: $, $$: $$, nf: nf, ago: ago, dur: dur, dt: dt, tm: tm, ic: ic };

  UI.toast = function (msg, kind) {
    var root = $('#toasts'); var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.innerHTML = '<span>' + esc(msg) + '</span>'; root.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === 'bad' ? 7000 : 4200);
  };
  UI.empty = function (icn, title, text, act) { return '<div class="state">' + ic(icn || 'list') + '<h4>' + esc(title) + '</h4>' + (text ? '<p>' + esc(text) + '</p>' : '') + (act || '') + '</div>'; };
  UI.error = function (title, text, act) { return '<div class="state err" role="alert">' + ic('alert') + '<h4>' + esc(title) + '</h4>' + (text ? '<p>' + esc(text) + '</p>' : '') + (act || '') + '</div>'; };
  UI.skel = function (n) { return '<div class="grid" role="status" aria-label="جارِ التحميل">' + new Array((n || 4) + 1).join('<div class="skel"></div>') + '</div>'; };
  UI.denied = function () { return UI.empty('lock', 'ليس لديك إذن للوصول إلى هذا القسم', 'اطلب من المالك تفعيل الصلاحية المناسبة لحسابك.'); };

  /* نافذة: تحفظ التركيز، تُغلق بـEsc والنقر خارجها، وتعيد التركيز لما كان قبلها */
  UI.modal = function (o) {
    var prev = document.activeElement; var sc = document.createElement('div'); sc.className = 'scrim';
    sc.innerHTML = '<div class="dlg ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '"><div class="dlg-h"><h3>' + esc(o.title) + '</h3><button class="x" data-x aria-label="إغلاق">' + ic('x') + '</button></div><div class="dlg-b">' + (o.html || '') + '</div>' + (o.foot ? '<div class="dlg-f">' + o.foot + '</div>' : '') + '</div>';
    document.body.appendChild(sc);
    var close = function () { sc.remove(); document.removeEventListener('keydown', key, true); try { prev && prev.focus && prev.focus(); } catch (e) {} o.onClose && o.onClose(); };
    var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Tab') { var f = $$('button:not(:disabled),input,select,textarea,a[href]', sc).filter(function (x) { return x.offsetParent; }); if (!f.length) return; var a = f[0], z = f[f.length - 1]; if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); } } };
    document.addEventListener('keydown', key, true);
    sc.addEventListener('mousedown', function (e) { if (e.target === sc) close(); });
    sc.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) close(); });
    var f0 = $('input,select,textarea,.btn.pri', sc.querySelector('.dlg-b')) || $('[data-x]', sc); f0 && f0.focus();
    o.onMount && o.onMount(sc, close); return { el: sc, close: close };
  };
  UI.drawer = function (o) {
    var prev = document.activeElement; var d = document.createElement('aside'); d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', o.title);
    d.innerHTML = '<div class="dlg-h"><h3>' + esc(o.title) + '</h3><button class="x" data-x aria-label="إغلاق">' + ic('x') + '</button></div><div class="dlg-b" style="flex:1">' + (o.html || '') + '</div>' + (o.foot ? '<div class="dlg-f">' + o.foot + '</div>' : '');
    var sc = document.createElement('div'); sc.className = 'scrim'; sc.style.justifyContent = 'flex-start'; sc.style.padding = '0'; sc.appendChild(d); document.body.appendChild(sc);
    var close = function () { sc.remove(); document.removeEventListener('keydown', key, true); try { prev && prev.focus && prev.focus(); } catch (e) {} o.onClose && o.onClose(); };
    var key = function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', key, true); sc.addEventListener('mousedown', function (e) { if (e.target === sc) close(); }); sc.addEventListener('click', function (e) { if (e.target.closest('[data-x]')) close(); });
    var f0 = $('[data-x]', d); f0 && f0.focus(); o.onMount && o.onMount(d, close); return { el: d, close: close };
  };
  UI.confirm = function (o) {
    return new Promise(function (res) { var m = UI.modal({ title: o.title, html: '<p>' + esc(o.text || '') + '</p>' + (o.html || ''), foot: '<button class="btn ' + (o.danger ? 'danger' : 'pri') + '" data-ok>' + esc(o.label || 'تأكيد') + '</button><button class="btn" data-no>إلغاء</button>', onClose: function () { res(false); } });
      m.el.querySelector('[data-ok]').onclick = function () { m.el.remove(); res(true); }; m.el.querySelector('[data-no]').onclick = function () { m.close(); }; });
  };

  /* ---------- الصلاحيات ---------- */
  A.can = function (key) { return P.has(A.rec, key); };
  A.active = function () { return !!(A.rec && A.rec.status === 'active' && A.can('admin.dashboard.view')); };
  A.fb = function () { return D.fb(); };
  A.host = function () { return D.host(); };
  A.me = function () { return D.me(); };

  /* ---------- مصادر البيانات الحيّة (اشتراك واحد لكل مصدر، يُلغى عند عدم وجود مستمعين) ---------- */
  var F = (A.feed = {}); var SRC = {
    sessions: { path: 'opsSessions', q: function () { return { orderBy: 'last', startAt: Date.now() - 6 * 3600e3, limitLast: 300 }; }, perm: ['admin.streams.view', 'admin.connections.view'] },
    events: { path: 'opsEvents', q: function () { return { orderBy: 't', startAt: Date.now() - 4 * 3600e3, limitLast: 400 }; }, perm: ['admin.streams.view', 'admin.connections.view', 'admin.rounds.view'] },
    links: { path: 'fsMirror/activeStreamers', q: function () { return null; }, perm: ['admin.dashboard.view'] }
  };
  var st = {}; function S(n) { return st[n] || (st[n] = { val: null, err: null, ready: false, ls: [], off: null, t: 0 }); }
  function startSrc(n) {
    var s = S(n), def = SRC[n], f = D.fb(); if (s.off || !f || !f.rtdb) { if (!f || !f.rtdb) { s.err = 'قاعدة Realtime Database غير متاحة'; s.ready = true; } return; }
    var ref = f.rtdbRef(f.rtdb, def.path); var q = def.q();
    if (q && f.rtdbQuery) { var qs = []; if (q.orderBy && f.rtdbOrderByChild) qs.push(f.rtdbOrderByChild(q.orderBy)); if (q.startAt != null && f.rtdbStartAt) qs.push(f.rtdbStartAt(q.startAt)); if (q.limitLast && f.rtdbLimitToLast) qs.push(f.rtdbLimitToLast(q.limitLast)); if (qs.length) ref = f.rtdbQuery.apply(null, [ref].concat(qs)); }
    var emit = function () { s.t = 0; s.ls.slice().forEach(function (l) { try { l.cb(s.val, s.err); } catch (e) { console.error('[admin]', e); } }); };
    var h = f.rtdbOnValue(ref, function (snap) { s.val = snap.val(); s.err = null; s.ready = true; if (!s.t) s.t = setTimeout(emit, 120); }, function (e) { s.err = D.isDenied(e) ? 'denied' : D.errText(e); s.ready = true; if (!s.t) s.t = setTimeout(emit, 0); });
    s.off = typeof h === 'function' ? h : function () { try { f.rtdbOff(ref, 'value'); } catch (e) {} };
  }
  /** يشترك في مصدر؛ يرجع دالة إلغاء. يُلغى تلقائياً لو غادر القسم (view لم يعد في الصفحة). */
  F.use = function (name, view, cb) {
    var s = S(name), l = { cb: cb, view: view }; s.ls.push(l); startSrc(name);
    if (s.ready) setTimeout(function () { try { cb(s.val, s.err); } catch (e) { console.error(e); } }, 0);
    var off = function () { s.ls = s.ls.filter(function (x) { return x !== l; }); if (!s.ls.length && s.off) { try { s.off(); } catch (e) {} s.off = null; s.ready = false; s.val = null; } };
    l.off = off; return off;
  };
  F.peek = function (name) { return S(name).val; };
  F.subCount = function () { return Object.keys(st).filter(function (k) { return st[k].off; }).length; };
  setInterval(function () { Object.keys(st).forEach(function (n) { st[n].ls.slice().forEach(function (l) { if (l.view && !l.view.isConnected) l.off(); }); }); }, 2000);

  /* ---------- اشتقاق حالة الجلسة (لا خلط بين أنواع الحالة) ---------- */
  var FRESH = 75e3, LATE = 5 * 60e3;
  var CONN = { connected: ['Connected', 'ok', 'متصل'], connecting: ['Connecting', 'warn', 'جارٍ الاتصال'], reconnecting: ['Reconnecting', 'warn', 'إعادة اتصال'], disconnected: ['Disconnected', 'bad', 'منقطع'], failed: ['Failed', 'bad', 'فشل'], down: ['Disconnected', 'bad', 'منقطع'], not_live: ['Not live', 'warn', 'البث غير مباشر'], disabled: ['Unsupported', '', 'غير مدعوم'] };
  A.connLabel = function (to) { return CONN[to] || ['Unknown', '', 'غير معروف']; };
  A.gameName = function (tag) { try { var g = (A.host().EHS_OPS_GAMES || []).find(function (x) { return x.tag === tag || x.reg === tag; }); return g ? (g.title || g.name || tag) : tag; } catch (e) { return tag; } };
  A.gameImg = function (tag) { try { var d = A.host().document; var c = d.querySelector('.gcard[data-tag="' + tag + '"] img'); var src = c && c.getAttribute('src'); if (!src && c) src = c.src; return /^(data:image|https:|\/)/.test(src || '') ? src : ''; } catch (e) { return ''; } };
  /** يشتق كل أنواع الحالة من صف جلسة opsSessions الحقيقي + روابط الستريمر العامة. */
  A.derive = function (id, s, links, now) {
    now = now || Date.now(); var last = +s.last || 0, start = +s.start || 0; var age = now - last;
    var run = s.state === 'live'; var phase = !run ? 'ended' : (age <= FRESH ? 'active' : (age <= LATE ? 'stale' : 'dead'));
    var conn = s.conn ? Object.keys(s.conn).map(function (k) { return s.conn[k]; }).sort(function (a, b) { return (a.t || 0) - (b.t || 0); }) : [];
    var lastConn = conn.length ? conn[conn.length - 1] : null; var plats = {}; conn.forEach(function (c) { plats[c.platform] = c; });
    var link = null; if (links) Object.keys(links).forEach(function (k) { var l = links[k]; if (l && l.uid === s.uid && (k.indexOf('link_') === 0 || !link)) link = l; });
    var platform = (link && link.platform) || s.platform || (lastConn && lastConn.platform) || '';
    var pc = plats[platform] || lastConn; var cstate = pc ? pc.to : null;
    var lab = cstate ? A.connLabel(cstate) : ['Unknown', '', 'غير معروف'];
    var confirmed = !!(run && age <= FRESH && cstate === 'connected');
    return { id: id, uid: s.uid, raw: s, phase: phase, game: s.game || '', gameName: s.game ? A.gameName(s.game) : '', streamer: s.streamer || '', handle: (link && link.username) || '', platform: platform, link: link, parts: +s.parts || 0, nRounds: +s.nRounds || 0,
      start: start, last: last, age: age, conn: conn, connTo: cstate, connLabel: lab, confirmed: confirmed, dev: s.dev || '', rounds: s.rounds || {} };
  };
  var URLS = { tiktok: function (u) { return 'https://www.tiktok.com/@' + u + '/live'; }, twitch: function (u) { return 'https://www.twitch.tv/' + u; }, kick: function (u) { return 'https://kick.com/' + u; }, youtube: function (u) { return 'https://www.youtube.com/@' + u + '/live'; } };
  /** رابط البث من حساب البث المسجَّل (نتيجة ربط ناجح) فقط، بعد تحقق الصيغة والمنصة. null إن لم يتوفر موثوقاً. */
  A.streamUrl = function (d) {
    var u = String(d.handle || '').replace(/^@+/, ''); if (!u || !URLS[d.platform]) return null; if (!/^[A-Za-z0-9._-]{2,40}$/.test(u)) return null; return URLS[d.platform](u);
  };
  A.platName = function (p) { return { tiktok: 'تيك توك', twitch: 'تويتش', kick: 'كيك', youtube: 'يوتيوب' }[p] || (p || 'غير معروفة'); };

  /* ---------- أقسام + تنقّل ---------- */
  A.register = function (def) { A.sections[def.id] = def; A.order.push(def.id); };
  function navHtml() {
    var rows = ''; var grp = ''; A.order.forEach(function (id) {
      var s = A.sections[id]; var ok = !s.perm || A.can(s.perm);
      if (s.group && s.group !== grp) { grp = s.group; rows += '<div class="grp">' + esc(grp) + '</div>'; }
      rows += '<button class="nav" data-nav="' + id + '" ' + (A.cur === id ? 'aria-current="page"' : '') + (ok ? '' : ' aria-disabled="true" title="لا تملك صلاحية هذا القسم"') + '>' + ic(s.icon) + '<span>' + esc(s.title) + '</span>' + (ok ? '' : ic('lock', 'lock')) + '</button>';
    });
    return rows;
  }
  A.paintNav = function () { $('#side').innerHTML = navHtml(); };
  A.go = function (id, arg) { location.hash = '#/' + id + (arg ? '/' + encodeURIComponent(arg) : ''); };
  function route() {
    var m = (location.hash || '').match(/^#\/([a-z]+)(?:\/(.+))?$/); var id = m ? m[1] : 'overview'; var arg = m && m[2] ? decodeURIComponent(m[2]) : '';
    if (!A.sections[id]) id = 'overview'; render(id, arg);
  }
  function render(id, arg) {
    var main = $('#main'); var s = A.sections[id];
    if (A.view && A.sectionDef && A.sectionDef.leave) { try { A.sectionDef.leave(A.view); } catch (e) {} }
    A.cur = id; A.sectionDef = s; A.paintNav(); $('#side').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false');
    var v = document.createElement('div'); v.className = 'view'; main.innerHTML = ''; main.appendChild(v); A.view = v; main.scrollTop = 0;
    document.title = s.title + ' — لوحة الأدمن · احسمها';
    if (!A.active()) { v.innerHTML = UI.denied(); return; }
    if (s.perm && !A.can(s.perm)) { v.innerHTML = '<div class="head"><div><span class="en">' + esc(s.en) + '</span><h1>' + esc(s.title) + '</h1></div></div>' + UI.denied(); return; }
    try { s.mount(v, arg); } catch (e) { console.error(e); v.innerHTML = UI.error('تعذّر فتح القسم', D.errText(e)); }
  }
  A.head = function (s, right) { return '<div class="head"><div><span class="en">' + esc(s.en) + '</span><h1>' + esc(s.title) + '</h1>' + (s.desc ? '<p>' + esc(s.desc) + '</p>' : '') + '</div>' + (right ? '<div class="row">' + right + '</div>' : '') + '</div>'; };
  A.refreshCurrent = function () { var s = A.sectionDef; if (s && A.view) { A.view.innerHTML = ''; try { s.mount(A.view, ''); } catch (e) { console.error(e); } } };

  /* ---------- حالة الوصول (تتغير لحظياً من الجسر عند سحب/إيقاف) ---------- */
  A.accessChanged = function (rec) {
    var was = A.active(); A.rec = rec; paintMe();
    if (!A.active()) { var m = $('#main'); A.paintNav(); m.innerHTML = '<div class="view">' + UI.empty('lock', rec && rec.status === 'suspended' ? 'تم إيقاف حسابك الإداري مؤقتاً' : 'تم سحب صلاحياتك الإدارية', 'أُغلقت جميع وظائف اللوحة. تواصل مع المالك إن كان هذا غير متوقع.') + '</div>'; if (was) UI.toast('تغيّرت صلاحياتك: أُغلقت اللوحة', 'warn'); try { w.parent.postMessage({ ehsAdmin: 'close' }, location.origin); } catch (e) {} return; }
    A.paintNav(); if (A.view && A.sectionDef && A.sectionDef.perm && !A.can(A.sectionDef.perm)) { A.view.innerHTML = UI.denied(); } else if (!was) route();
    else if (A.sectionDef && A.sectionDef.onAccess) { try { A.sectionDef.onAccess(A.view); } catch (e) {} }
  };
  function paintMe() {
    var m = D.me(); var name = (m && (m.name || m.email)) || '—'; $('#me-name').textContent = (A.rec && A.rec.username) || name;
    var av = $('#me-av'); av.textContent = (String((A.rec && A.rec.username) || name).charAt(0) || '؟').toUpperCase();
    $('#me-role').textContent = A.rec ? (A.rec.status === 'active' ? 'أدمن' : 'أدمن موقوف') : 'غير مخوّل';
  }
  A.paintMe = paintMe;

  /* ---------- شريط الحالة العلوي ---------- */
  function topStatus() {
    var f = D.fb(); var chip = $('#chip-conn'), t = $('#chip-conn-t');
    var set = function (cls, txt) { chip.className = 'chip hide-m ' + cls; t.textContent = txt; };
    if (!f || !f.rtdb) { set('bad', 'غير متصل بالبيانات'); return; }
    try { var r = f.rtdbRef(f.rtdb, '.info/connected'); f.rtdbOnValue(r, function (s) { s.val() ? set('ok', 'متصل بالخادم') : set('warn', 'جارٍ الاتصال…'); }); } catch (e) { set('', 'غير معروف'); }
    if (A.can('admin.streams.view') || A.can('admin.connections.view')) {
      F.use('sessions', document.body, function (v) { var n = 0; var now = Date.now(); Object.keys(v || {}).forEach(function (k) { var d = A.derive(k, v[k], null, now); if (d.phase === 'active') n++; }); var c = $('#chip-sess'); c.className = 'chip hide-m ' + (n ? 'ok' : ''); $('#chip-sess-t').textContent = nf(n) + ' جلسة نشطة'; });
    } else { $('#chip-sess').style.display = 'none'; }
  }
  A.topStatus = topStatus;

  A.start = function () {
    $('#back').onclick = function () { try { w.parent.postMessage({ ehsAdmin: 'close' }, location.origin); } catch (e) {} };
    $('#burger').onclick = function () { var o = $('#side').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', String(o)); };
    $('#side').addEventListener('click', function (e) { var b = e.target.closest('[data-nav]'); if (!b || b.getAttribute('aria-disabled') === 'true') return; A.go(b.dataset.nav); });
    w.addEventListener('hashchange', route);
    paintMe();
    return D.getMine().then(function (rec) { A.rec = rec; paintMe(); A.paintNav(); if (A.active()) { try { topStatus(); } catch (e) { console.warn(e); } } route(); }, function (e) { $('#main').innerHTML = '<div class="view">' + UI.error('تعذّر التحقق من صلاحياتك', D.errText(e)) + '</div>'; });
  };
})(window);
