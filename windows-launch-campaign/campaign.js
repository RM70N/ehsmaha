/* حملة إطلاق تطبيق احسمها للويندوز — منقولة من windowsapp.html كما هي مع: إصلاح تجاوز التحقق الزمني، تحميل CSS/الصور كملفات، تجاوز الجولات النشطة. */
(function () {
  'use strict';
  if (window.__EHSEMHA_WLC__) return;
  window.__EHSEMHA_WLC__ = true;

  var script = document.currentScript;
  var BASE = script && script.src ? script.src.replace(/[^/]*$/, '') : 'windows-launch-campaign/';
  var MAX_TIMEOUT = 2147483000;
  var state = { root: null, cfg: null, start: 0, end: 0, offset: 0, timers: [], open: false, memClosed: false };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function now() { return Date.now() + state.offset; }
  function sGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* */ } }
  function closedKey() { return 'ehsemha-wlc:' + state.cfg.id + ':closed'; }
  function wasClosed() { return state.memClosed || sGet(closedKey()) === '1'; }
  function markClosed() { state.memClosed = true; sSet(closedKey(), '1'); }

  /* ---------- بيئة التطبيق المثبّت (Electron) ---------- */
  function isDesktopApp() {
    try {
      // preload يكشف ehsmahaDesktop.isDesktopApp عبر contextBridge — أوثق من User-Agent
      if (window.ehsmahaDesktop && window.ehsmahaDesktop.isDesktopApp === true) return true;
      var h = location.hostname;
      if ((h === 'localhost' || h === '127.0.0.1') &&
          state.cfg.desktopAppPorts.indexOf(Number(location.port)) !== -1 &&
          /Electron\//.test(navigator.userAgent)) return true;
    } catch (e) { /* */ }
    return false;
  }

  /* ---------- صفحات اللعب والجلسات ---------- */
  var excludeRes = [];
  var busyCheck = null;
  // صفحات الواجهة الخاملة داخل الموقع (نفس قائمة نقطة التحديث الآمنة في تطبيق سطح المكتب)
  var IDLE_PAGES = /^pg-(landing|home|auth|choose-username|profile|callcenter|leaderboard|levels|frames|faq|contest-top20|solo-home|party-home|ahsemha-home|ahsemha-pick|ahsemha-teams|ahsemha-board)$/;
  function siteBusy() {
    try {
      var act = document.querySelector('.page.active');
      if (act && act.id && !IDLE_PAGES.test(act.id)) return true;
      var hc = (typeof homeConnections !== 'undefined') ? homeConnections : null;
      if (hc) { var vals = (hc instanceof Map) ? Array.from(hc.values()) : Object.values(hc); for (var i = 0; i < vals.length; i++) if (vals[i] && vals[i].ws) return true; }
      var hg = (typeof homeGameListeners !== 'undefined') ? homeGameListeners : null;
      if (hg && ((hg instanceof Map || hg instanceof Set) ? hg.size : (Array.isArray(hg) ? hg.length : Object.keys(hg).length)) > 0) return true;
      var fs = document.querySelectorAll('iframe[id$="-frame"]');
      for (var j = 0; j < fs.length; j++) if ((fs[j].getAttribute('src') || '') && fs[j].offsetParent !== null) return true;
    } catch (e) { /* */ }
    return false;
  }
  function isBusyRoute() {
    var p = location.pathname;
    for (var i = 0; i < excludeRes.length; i++) if (excludeRes[i].test(p)) return true;
    try { if (busyCheck && busyCheck() === true) return true; } catch (e) { /* */ }
    return siteBusy();
  }

  /* ---------- الوقت الموثوق ---------- */
  function syncServerTime() {
    var ts = state.cfg.timeSource;
    if (!ts || !ts.enabled || !/^https?:$/.test(location.protocol) || !window.fetch) return Promise.resolve();
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ts.timeoutMs || 2500);
    var t0 = Date.now();
    return fetch(location.origin + '/', { method: 'HEAD', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        var d = Date.parse(r.headers.get('Date') || '');
        if (!isNaN(d)) { var t1 = Date.now(); state.offset = d + (t1 - t0) / 2 - t1; }
      })
      .catch(function () { /* وقت الجهاز كحل أخير */ })
      .then(function () { clearTimeout(t); });
  }

  /* ---------- التحقق من الجاهزية ---------- */
  function phase() {
    var n = now();
    return n < state.start ? 'pending' : n >= state.end ? 'ended' : 'active';
  }
  function after(ms, fn) {
    var id = setTimeout(fn, Math.min(Math.max(ms, 0), MAX_TIMEOUT));
    state.timers.push(id); return id;
  }
  function scheduleExpiry() {
    var left = state.end - now();
    after(left, function () { if (phase() === 'ended') { close('expired'); } else { scheduleExpiry(); } });
  }
  function scheduleStart() {
    after(state.start - now(), function () { evaluate(); });
  }
  function evaluate() {
    if (state.open) return;
    var p = phase();
    if (p === 'ended') return;
    if (p === 'pending') { scheduleStart(); return; }
    if (isDesktopApp() || isBusyRoute() || wasClosed()) return;
    show();
  }

  /* ---------- البناء ---------- */
  var SVG_WIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 4.6 11 3.4V11H3zM12.4 3.2 21 2v9h-8.6zM3 13h8v7.6L3 19.4zM12.4 13H21v9l-8.6-1.2z"/></svg>';
  function html() {
    var A = BASE + 'assets/';
    var I = { 'launch-artwork.webp': A + 'launch-artwork.webp', 'decorative-elements.svg': A + 'decorative-elements.svg', 'desktop-preview.webp': A + 'desktop-preview.webp', 'logo.png': A + 'logo.png' };
    return '' +
    '<div class="wlc-backdrop" data-wlc="backdrop"></div>' +
    '<section class="wlc-card" role="dialog" aria-modal="true" aria-labelledby="wlc-title" aria-describedby="wlc-desc">' +
      '<div class="wlc-face">' +
        '<img class="wlc-art" src="' + I['launch-artwork.webp'] + '" alt="" decoding="async">' +
        '<div class="wlc-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
        '<div class="wlc-scroll">' +
          '<div class="wlc-scene" aria-hidden="true">' +
            '<div class="wlc-glow"></div><div class="wlc-beam"></div>' +
            '<img class="wlc-rings" src="' + I['decorative-elements.svg'] + '" alt="" decoding="async">' +
            '<div class="wlc-persp">' +
              '<div class="wlc-ghost"><div class="wlc-ghost-bar"><b></b><span>ehsmaha.com</span></div></div>' +
              '<svg class="wlc-trail" viewBox="0 0 100 60" preserveAspectRatio="none"><path pathLength="1" d="M10 8 C 22 2, 34 8, 46 20"/></svg>' +
              '<div class="wlc-shadow"></div>' +
              '<div class="wlc-win-enter"><div class="wlc-win-float"><div class="wlc-win">' +
                '<div class="wlc-titlebar"><img src="' + I['logo.png'] + '" alt=""><span>احسمها | ehsmaha</span>' +
                '<em><u></u><u></u><u></u></em></div>' +
                '<img class="wlc-shot" src="' + I['desktop-preview.webp'] + '" alt="" decoding="async">' +
              '</div></div></div>' +
              '<div class="wlc-hud wlc-hud-a">EHSEMHA.EXE</div><div class="wlc-hud wlc-hud-b">WIN64</div>' +
            '</div>' +
          '</div>' +
          '<div class="wlc-copy">' +
            '<div class="wlc-meta"><span class="wlc-badge"><i></i>متوفر الآن</span>' +
              '<span class="wlc-tag"><img src="' + I['logo.png'] + '" alt="">EHSEMHA FOR WINDOWS</span></div>' +
            '<h2 id="wlc-title" class="wlc-title">' +
              '<span class="wlc-l wlc-l1"><span>تم إطلاق تطبيق</span></span>' +
              '<span class="wlc-l wlc-l2"><span data-text="احسمها">احسمها</span></span>' +
              '<span class="wlc-l wlc-l3"><span class="wlc-chip">' + SVG_WIN + 'للويندوز</span></span>' +
            '</h2>' +
            '<p class="wlc-sub">احسمها صار أقرب لك من أي وقت.</p>' +
            '<p id="wlc-desc" class="wlc-desc">نفس ألعابك وتحدياتك، الحين بتجربة مستقلة على الكمبيوتر.</p>' +
            '<div class="wlc-cta-wrap"><a class="wlc-cta" data-wlc="cta" href="' + state.cfg.destination + '">' +
              '<span class="wlc-cta-in">' + SVG_WIN + '<span>حمّله الآن</span></span></a></div>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="wlc-close" data-wlc="close" aria-label="إغلاق الإعلان"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16"/></svg></button>' +
      '</div>' +
    '</section>';
  }

  function injectCss() {
    if (document.getElementById('wlc-css')) return Promise.resolve();
    return new Promise(function (res) {
      var l = document.createElement('link');
      l.id = 'wlc-css'; l.rel = 'stylesheet'; l.href = BASE + 'campaign.css';
      l.onload = res; l.onerror = res; document.head.appendChild(l);
      setTimeout(res, 4000);
    });
  }

  var prev = {};
  function lockScroll() {
    var de = document.documentElement, sbw = window.innerWidth - de.clientWidth;
    prev.overflow = de.style.overflow; prev.pr = de.style.paddingRight;
    de.style.overflow = 'hidden';
    if (sbw > 0) de.style.paddingRight = sbw + 'px';
  }
  function unlockScroll() {
    var de = document.documentElement;
    de.style.overflow = prev.overflow || ''; de.style.paddingRight = prev.pr || '';
  }

  function show() {
    if (state.open || document.getElementById('wlc-root')) return;
    state.open = true;
    injectCss().then(function () {
      if (!state.open) return;
      var root = document.createElement('div');
      root.id = 'wlc-root'; root.className = 'wlc-root'; root.setAttribute('dir', 'rtl'); root.lang = 'ar';
      root.innerHTML = html();
      state.root = root;
      var art = root.querySelector('.wlc-art');
      var ready = new Promise(function (res) {
        if (art.complete) return res();
        art.onload = art.onerror = res; setTimeout(res, 1500);
      });
      ready.then(function () {
        if (!state.open) return;
        state.prevFocus = document.activeElement;
        document.body.appendChild(root);
        lockScroll();
        bind();
        scheduleExpiry();
        state.routeTimer = setInterval(function () { if (isBusyRoute()) close('route'); }, 2000);
        requestAnimationFrame(function () { requestAnimationFrame(function () {
          root.classList.add('is-open');
          var cta = root.querySelector('[data-wlc="cta"]'); if (cta) cta.focus({ preventScroll: true });
        }); });
      });
    });
  }

  /* ---------- التفاعل ---------- */
  var navigating = false;
  function onClick(e) {
    var t = e.target.closest && e.target.closest('[data-wlc]'); if (!t) return;
    var k = t.getAttribute('data-wlc');
    if (k === 'close' || k === 'backdrop') { close('user'); }
    else if (k === 'cta') {
      e.preventDefault();
      if (navigating) return; navigating = true;
      t.classList.add('is-pressed');
      markClosed();
      setTimeout(function () { location.assign(state.cfg.destination); }, 160);
    }
  }
  function onKey(e) {
    if (!state.open || !state.root) return;
    if (e.key === 'Escape') { e.preventDefault(); close('user'); return; }
    if (e.key === 'Tab') {
      var f = state.root.querySelectorAll('[data-wlc="cta"],[data-wlc="close"]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1], a = document.activeElement;
      if (!state.root.contains(a)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
    }
  }
  function onVis() { if (!document.hidden && state.open && phase() === 'ended') close('expired'); }
  function bind() {
    state.root.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVis);
  }

  function close(reason) {
    if (!state.open) return;
    state.open = false;
    if (reason === 'user') markClosed();
    clearInterval(state.routeTimer);
    state.timers.forEach(clearTimeout); state.timers = [];
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVis);
    var root = state.root; state.root = null;
    function done() {
      if (root && root.parentNode) root.parentNode.removeChild(root);
      unlockScroll();
      var pf = state.prevFocus;
      if (pf && pf.focus && document.contains(pf)) { try { pf.focus({ preventScroll: true }); } catch (e) { /* */ } }
    }
    if (!root) { unlockScroll(); return; }
    root.removeEventListener('click', onClick);
    root.classList.remove('is-open'); root.classList.add('is-closing');
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) done(); else setTimeout(done, 280);
  }

  /* ---------- الإقلاع ---------- */
  function init() {
    var cfg = window.WINDOWS_LAUNCH_CAMPAIGN;
    if (!cfg || cfg.enabled !== true) return;
    state.cfg = cfg;
    var s = Date.parse(cfg.startAt);
    var e = cfg.endAt ? Date.parse(cfg.endAt) : s + cfg.durationDays * 86400000;
    if (isNaN(s) || isNaN(e) || e <= s) return; // إعدادات غير صالحة = لا يظهر
    state.start = s; state.end = e;
    excludeRes = (cfg.excludePaths || []).map(function (p) { return new RegExp(p); });

    window.EhsemhaLaunchCampaign = Object.freeze({
      // يتيح لصفحة الموقع إبلاغ الحملة بأن اللاعب في جولة/بث نشط: setBusyCheck(() => true/false)
      setBusyCheck: function (fn) { busyCheck = typeof fn === 'function' ? fn : null; },
      close: function () { close('user'); }
    });

    var go = function () {
      syncServerTime().then(function () { if (phase() === 'ended') return; after(cfg.showDelayMs || 0, evaluate); });
    };
    var run = function () { (window.requestIdleCallback || function (f) { setTimeout(f, 50); })(go, { timeout: 2000 }); };
    // الإقلاع بعد اكتمال تحميل الصفحة؛ احتياط: لو تأخر حدث load أكثر من 10 ثوانٍ نكمل (مرة واحدة فقط).
    var started = false;
    var runOnce = function () { if (started) return; started = true; run(); };
    if (document.readyState === 'complete') runOnce();
    else { window.addEventListener('load', runOnce, { once: true }); setTimeout(runOnce, 10000); }
  }

  init();
})();
