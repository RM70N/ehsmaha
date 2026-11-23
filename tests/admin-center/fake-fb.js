/* Firebase وهمي في الذاكرة (RTDB + Firestore) لاختبار واجهة لوحة الأدمن في المتصفح. لا يطبّق القواعد (تُختبر بالمُحاكي)؛
   فيه مفتاح __deny لمحاكاة رفض الخادم (permission-denied) كي نختبر معالجة الواجهة للرفض. */
(function () {
  var rt = {}, fs = {}, subs = [], tick = 0;
  function parts(p) { return String(p).split('/').filter(Boolean); }
  function getAt(p) { var n = rt; var a = parts(p); for (var i = 0; i < a.length; i++) { if (n == null || typeof n !== 'object') return null; n = n[a[i]]; } return n === undefined ? null : n; }
  function sv(v) { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); var o = Array.isArray(v) ? [] : {}; Object.keys(v).forEach(function (k) { o[k] = sv(v[k]); }); return o; } return v; }
  function setAt(p, v) { var a = parts(p); var n = rt; for (var i = 0; i < a.length - 1; i++) { if (n[a[i]] == null || typeof n[a[i]] !== 'object') n[a[i]] = {}; n = n[a[i]]; } if (v === null || v === undefined) delete n[a[a.length - 1]]; else n[a[a.length - 1]] = sv(v); }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function denied(p) { var d = window.__deny || []; for (var i = 0; i < d.length; i++) if (new RegExp(d[i]).test(p)) { var e = new Error('PERMISSION_DENIED: ' + p); e.code = 'PERMISSION_DENIED'; return e; } return null; }
  function notify(p) { subs.slice().forEach(function (s) { if (p.indexOf(s.path) === 0 || s.path.indexOf(p) === 0) s.fire(); }); }
  function filt(v, q) { if (!q || !v || typeof v !== 'object') return v; var keys = Object.keys(v); if (q.ob) { keys = keys.filter(function (k) { return v[k] && (q.st == null || v[k][q.ob] >= q.st); }); keys.sort(function (a, b) { return (v[a][q.ob] || 0) - (v[b][q.ob] || 0); }); } if (q.ll) keys = keys.slice(-q.ll); var o = {}; keys.forEach(function (k) { o[k] = v[k]; }); return o; }
  var snapOf = function (val) { return { val: function () { return clone(val); }, exists: function () { return val != null; } }; };
  var ref = function (db, p) { return { p: p || '' }; };
  window.__db = { rt: rt, fs: fs, writes: [] }; rt['.info'] = { connected: true };
  var user = window.__user || { uid: 'adm1', email: 'a1@x.com', displayName: 'Admin One' };
  var FS = {
    db: {}, auth: { currentUser: user }, serverTimestamp: function () { return { __sts: true, toMillis: function () { return Date.now(); } }; },
    doc: function (db) { var p = Array.prototype.slice.call(arguments, 1).join('/'); return { __p: p }; }, collection: function (db) { return { __c: Array.prototype.slice.call(arguments, 1).join('/') }; },
    arrayUnion: function (x) { return { __union: x }; }, writeBatch: function () { var ops = []; var b = { set: function (r, d, o) { ops.push(['set', r, d, o]); return b; }, update: function (r, d) { ops.push(['update', r, d]); return b; }, delete: function (r) { ops.push(['del', r]); return b; }, commit: function () { var e = null; ops.forEach(function (o) { e = e || denied('fs:' + o[1].__p); }); if (e) return Promise.reject(e); ops.forEach(function (o) { FS._apply(o[0], o[1], o[2], o[3]); }); return Promise.resolve(); } }; return b; },
    _apply: function (kind, r, d, o) { var cur = fs[r.__p]; if (kind === 'del') { delete fs[r.__p]; return; } var next = (o && o.merge && cur) ? Object.assign({}, cur) : {}; Object.keys(d || {}).forEach(function (k) { var v = d[k]; if (v && v.__union !== undefined) next[k] = (next[k] || []).concat((next[k] || []).indexOf(v.__union) < 0 ? [v.__union] : []); else next[k] = v; }); fs[r.__p] = next; window.__db.writes.push([kind, r.__p, JSON.parse(JSON.stringify(next))]); },
    getDoc: function (r) { var e = denied('fs:' + r.__p); if (e) return Promise.reject(e); var d = fs[r.__p]; return Promise.resolve({ exists: function () { return !!d; }, data: function () { return d; }, id: r.__p.split('/').pop() }); },
    getDocs: function (q) { var c = q.__c; var rows = Object.keys(fs).filter(function (k) { return k.indexOf(c + '/') === 0 && k.slice(c.length + 1).indexOf('/') < 0; }).map(function (k) { return { id: k.split('/').pop(), d: fs[k] }; }); if (q.__w) rows = rows.filter(function (r) { return r.d[q.__w[0]] === q.__w[2]; }); var e = denied('fs:' + c); if (e) return Promise.reject(e); return Promise.resolve({ forEach: function (cb) { rows.forEach(function (r) { cb({ id: r.id, data: function () { return r.d; } }); }); }, size: rows.length }); },
    query: function (c, w) { return Object.assign({}, c, { __w: w && w.__w }); }, where: function (a, b, c) { return { __w: [a, b, c] }; },
    setDoc: function (r, d, o) { var e = denied('fs:' + r.__p); if (e) return Promise.reject(e); FS._apply('set', r, d, o); return Promise.resolve(); }, deleteDoc: function (r) { var e = denied('fs:' + r.__p); if (e) return Promise.reject(e); delete fs[r.__p]; return Promise.resolve(); },
    onSnapshot: function (r, cb) { var f = function () { var d = fs[r.__p]; cb({ exists: function () { return !!d; }, data: function () { return d; } }); }; setTimeout(f, 0); var s = { path: '__fs/' + r.__p, fire: f }; subs.push(s); return function () { subs = subs.filter(function (x) { return x !== s; }); }; },
    onAuthStateChanged: function (a, cb) { setTimeout(function () { cb(user); }, 0); return function () {}; },
    rtdb: {}, rtdbRef: ref,
    rtdbGet: function (r) { var e = denied('rt:' + (r.p || '')); if (e) return Promise.reject(e); var v = r.__q ? filt(getAt(r.p), r.__q) : getAt(r.p); return Promise.resolve(snapOf(v)); },
    rtdbSet: function (r, v) { var e = denied('rt:' + r.p); if (e) return Promise.reject(e); setAt(r.p, v); window.__db.writes.push(['rtset', r.p, clone(v)]); notify(r.p); return Promise.resolve(); },
    rtdbUpdate: function (r, o) { var e = null; Object.keys(o).forEach(function (k) { e = e || denied('rt:' + (r.p ? r.p + '/' : '') + k); }); if (e) return Promise.reject(e); Object.keys(o).forEach(function (k) { setAt((r.p ? r.p + '/' : '') + k, o[k]); window.__db.writes.push(['rtupd', (r.p ? r.p + '/' : '') + k, clone(o[k])]); }); notify(r.p || ''); return Promise.resolve(); },
    rtdbRemove: function (r) { var e = denied('rt:' + r.p); if (e) return Promise.reject(e); setAt(r.p, null); window.__db.writes.push(['rtdel', r.p]); notify(r.p); return Promise.resolve(); },
    rtdbPush: function (r) { return { p: r.p + '/p' + (++tick), key: 'p' + tick }; },
    rtdbOnValue: function (r, cb, errCb) { var e = denied('rt:' + (r.p || '')); var fire = function () { var ee = denied('rt:' + (r.p || '')); if (ee) { errCb && errCb(ee); return; } cb(snapOf(r.__q ? filt(getAt(r.p), r.__q) : getAt(r.p))); }; var s = { path: r.p || '', fire: fire }; subs.push(s); setTimeout(fire, 0); window.__db.nsub = (window.__db.nsub || 0) + 1; return function () { subs = subs.filter(function (x) { return x !== s; }); window.__db.nsub--; }; },
    rtdbOff: function () {}, rtdbOnDisconnect: function (r) { return { remove: function () { window.__db['od:' + r.p] = true; }, set: function () {} }; },
    rtdbQuery: function (r) { var q = Object.assign({}, r.__q || {}); for (var i = 1; i < arguments.length; i++) Object.assign(q, arguments[i]); return { p: r.p, __q: q }; }, rtdbOrderByChild: function (c) { return { ob: c }; }, rtdbStartAt: function (n) { return { st: n }; }, rtdbLimitToLast: function (n) { return { ll: n }; }
  };
  window.__fb = FS; window.__fbSet = function (p, v) { setAt(p, v); notify(p); }; window.__fsSet = function (p, d) { fs[p] = d; };
  window.__setAdmin = function (rec) { fs['adminAccess/' + user.uid] = rec; var a = FS.onSnapshot; };
})();
