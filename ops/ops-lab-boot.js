/* EHSEMHA OPS LAB BOOT — يُحمَّل فقط داخل iframe المختبر (index.html?opslab=1) وقبل أي سكربت آخر.
 *
 * يحوّل نسخة الموقع الحقيقية (بمنطق الألعاب الفعلي) إلى بيئة معزولة كلياً:
 *   1) localStorage/sessionStorage ← مخزن ذاكرة (مبذور بنسخة من القيم الحالية) فلا يتغير شيء عند المالك.
 *   2) كل كتابات Firebase (Firestore + RTDB + Auth) ← محجوبة وتُسجَّل في __opsLab.blocked (للتحقق من العزل).
 *   3) أي طلب شبكة غير GET (fetch/XHR/sendBeacon) ← محجوب ومسجَّل.
 *   4) WebSocket ← بديل صوري لا يتصل بأي سيرفر (لا TikTok/Twitch/Kick حقيقي).
 * القراءات (Firestore/RTDB GET) مسموحة لأنها لا تغيّر شيئاً.
 */
(function () {
  'use strict';
  var L = window.__opsLab = { blocked: [], sockets: [], net: [], started: Date.now() };

  /* 1) التخزين */
  function mkStore(seed) {
    var d = Object.assign({}, seed || {});
    var api = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { d[k] = String(v); },
      removeItem: function (k) { delete d[k]; },
      clear: function () { d = {}; },
      key: function (i) { return Object.keys(d)[i] || null; }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(d).length; } });
    return api;
  }
  try {
    var seed = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (!/^ehs_(anon|j_)/.test(k)) seed[k] = localStorage.getItem(k); }
    Object.defineProperty(window, 'localStorage', { configurable: true, value: mkStore(seed) });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: mkStore({}) });
  } catch (e) { L.storageErr = String(e); }

  /* 2) Firebase */
  var BLOCK = ['setDoc', 'updateDoc', 'deleteDoc', 'runTransaction', 'rtdbSet', 'rtdbUpdate', 'rtdbRemove', 'rtdbRunTransaction',
    'signOut', 'deleteUser', 'updateProfile', 'createUserWithEmailAndPassword', 'signInWithEmailAndPassword', 'signInWithPopup', 'signInWithRedirect', 'sendPasswordResetEmail'];
  var real; var preset = window.__fb;
  Object.defineProperty(window, '__fb', {
    configurable: true,
    get: function () { return real; },
    set: function (o) {
      if (o && typeof o === 'object') {
        BLOCK.forEach(function (n) {
          if (typeof o[n] !== 'function') return;
          o[n] = function () {
            var a = arguments; var path = '';
            try { var r = a[0] && a[0].path ? a[0].path : (a[1] && a[1].path ? a[1].path : (a[0] && a[0]._path ? String(a[0]._path.pieces_ ? a[0]._path.pieces_.join('/') : '') : '')); path = String(r || ''); } catch (e) {}
            L.blocked.push({ fn: n, path: path, at: Date.now() });
            return Promise.resolve(undefined);
          };
        });
      }
      real = o;
    }
  });

  if (preset) window.__fb = preset;

  /* 3) الشبكة */
  var rf = window.fetch;
  if (rf) window.fetch = function (u, opt) {
    var m = String((opt && opt.method) || (u && u.method) || 'GET').toUpperCase();
    if (m !== 'GET' && m !== 'HEAD') { L.net.push({ kind: 'fetch', m: m, u: String(u && u.url || u), at: Date.now() }); return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })); }
    return rf.apply(this, arguments);
  };
  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u) { if (String(m).toUpperCase() !== 'GET') { L.net.push({ kind: 'xhr', m: m, u: String(u), at: Date.now() }); return xo.call(this, 'GET', 'data:application/json,{}'); } return xo.apply(this, arguments); };
  if (navigator.sendBeacon) navigator.sendBeacon = function (u) { L.net.push({ kind: 'beacon', u: String(u), at: Date.now() }); return true; };
  window.open = function () { return null; };

  /* 4) WebSocket صوري: لا يتصل إطلاقاً */
  function FakeWS(url) {
    this.url = String(url); this.readyState = 0; this.bufferedAmount = 0; this.protocol = ''; this.extensions = ''; this.binaryType = 'blob';
    this.onopen = this.onmessage = this.onclose = this.onerror = null; this._l = {};
    L.sockets.push({ url: this.url, at: Date.now() });
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  FakeWS.prototype.send = function () {};
  FakeWS.prototype.close = function () { this.readyState = 3; };
  FakeWS.prototype.addEventListener = function (t, f) { (this._l[t] = this._l[t] || []).push(f); };
  FakeWS.prototype.removeEventListener = function (t, f) { this._l[t] = (this._l[t] || []).filter(function (x) { return x !== f; }); };
  FakeWS.prototype.dispatchEvent = function () { return true; };
  window.WebSocket = FakeWS;
  /* مساعد للمختبر: يحقن رسالة كأنها واردة من السيرفر */
  L.emit = function (sock, data) { var ev = { data: typeof data === 'string' ? data : JSON.stringify(data) }; if (sock.onmessage) sock.onmessage(ev); (sock._l.message || []).forEach(function (f) { f(ev); }); };
})();
