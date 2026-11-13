/* BATMISH core — يُحمَّل لكل الزوار لكنه صغير ولا يفعل شيئاً إلا لحساب مسجّل متصل ببث باسم _zvd4.
   القرار النهائي بالوصول للخادم دائماً (GET /batmish/access)؛ هذا الملف لا يحمّل CSS/واجهة/كتالوج إلا بعد موافقة الخادم.
   لا يخزّن أي إعدادات في متغيرات عامة مشتركة: الإعدادات النشطة مرتبطة بحساب الجلسة الحالية وتُمسح عند فقدان الصلاحية. */
(function () {
  'use strict';
  if (window.Batmish) return;

  var STREAMERS = ['_zvd4'];           // يوزرات البث المسموحة (الفحص الحقيقي بالخادم)
  var SITE_USERS = ['mish', 'mzx'];    // فحص أولي فقط (mish = صاحب _zvd4، mzx = المالك). المرجع الحقيقي الخادم: المالك ببريده، وmish بسجل الأسماء
  var STREAMER = STREAMERS[0];          // اليوزر الفعلي بعد تأكيد الخادم
  var RECHECK_MS = 15000;
  var SELF_SRC = (document.currentScript && document.currentScript.src) || '/batmish/batmish-core.js';
  var BASE = SELF_SRC.replace(/[^/]*$/, '');

  // شعار الخفاش (مجسم هندسي متماثل). viewBox 0 0 200 100
  var BAT_PATH = 'M100 31 L103 23 L108 9 L112 25 C120 24 126 28 132 26 C150 12 178 14 194 30 C186 32 180 38 178 49 C172 43 164 43 160 53 C154 47 146 49 142 61 C136 55 126 55 118 67 C114 73 110 81 100 95 ' +
    'C90 81 86 73 82 67 C74 55 64 55 58 61 C54 49 46 47 40 53 C36 43 28 43 22 49 C20 38 14 32 6 30 C22 14 50 12 68 26 C74 28 80 24 88 25 L92 9 L97 23 Z';
  var BAT_SVG = '<svg viewBox="0 0 200 100" aria-hidden="true" focusable="false"><path d="' + BAT_PATH + '" fill="currentColor"/></svg>';

  function norm(u) { return String(u == null ? '' : u).trim().replace(/^@+/, '').toLowerCase(); }

  /* ------------------------------------------------------------ BatmishRoundConfigurationResolver
     يحمل تخصيص الحساب الحالي (فقط overrides) ويجيب modGetSetting. الألعاب تقرأ قيمها عند بداية كل راوند، فأي حفظ
     جديد يُطبَّق تلقائياً من الراوند التالي ولا يمس راوند بدأ بالفعل (قيمه التقطها اللعب وقت بدايته). */
  function RoundConfigurationResolver() { this.rev = 0; this.config = {}; this.active = false; this.uid = null; }
  RoundConfigurationResolver.prototype.set = function (rev, config, uid) { this.rev = rev | 0; this.config = config || {}; this.active = true; this.uid = uid || this.uid; this.apply(); };
  RoundConfigurationResolver.prototype.clear = function () { this.active = false; this.config = {}; this.rev = 0; this.apply(); };
  RoundConfigurationResolver.prototype.get = function (tag, key) {
    if (!this.active) return undefined;
    var g = this.config[tag];
    return g && g[key] !== undefined ? g[key] : undefined;
  };
  RoundConfigurationResolver.prototype.apply = function () { SiteEffects.apply(this.active ? (this.config.__site || {}) : {}); };

  /* ------------------------------------------------------------ مؤثرات الموقع المركزية (صوت + حركة)
     الصوت: كل اتصال بـdestination لسياق WebAudio يمر عبر GainNode رئيسي واحد (يغطي ألعاب الصفحة الرئيسية التي تستخدم WebAudio،
     وليس ألعاب iframe ثلاثية الأبعاد ولا عناصر الفيديو). يُركَّب مرة واحدة فقط بعد موافقة الخادم. */
  var SiteEffects = {
    masters: [], patched: false, vol: 1, muted: false,
    patch: function () {
      if (this.patched) return;
      var AN = window.AudioNode, AD = window.AudioDestinationNode; if (!AN || !AD) return;
      var self = this, orig = AN.prototype.connect;
      AN.prototype.connect = function (dest) {
        try {
          if (dest instanceof AD && !this.__bmMaster) {
            var ctx = dest.context, m = ctx.__bmMaster;
            if (!m) { m = ctx.createGain(); m.__bmMaster = true; ctx.__bmMaster = m; orig.call(m, dest); self.masters.push(m); self.setGain(m); }
            var a = Array.prototype.slice.call(arguments); a[0] = m; return orig.apply(this, a);
          }
        } catch (e) { /* يرجع للسلوك الأصلي */ }
        return orig.apply(this, arguments);
      };
      this.patched = true;
    },
    setGain: function (m) { try { m.gain.value = this.muted ? 0 : this.vol; } catch (e) {} },
    apply: function (s) {
      var vol = typeof s.masterVolume === 'number' ? s.masterVolume / 100 : 1, muted = !!s.muteEffects;
      if ((vol !== 1 || muted) && !this.patched) this.patch();
      this.vol = vol; this.muted = muted;
      for (var i = 0; i < this.masters.length; i++) this.setGain(this.masters[i]);
      var b = document.body; if (b) b.classList.toggle('bm-reduce-fx', !!s.reduceEffects);
      if (!document.getElementById('bm-fx-style')) {
        var st = document.createElement('style'); st.id = 'bm-fx-style';
        st.textContent = 'body.bm-reduce-fx *:not(.bm):not(.bm *):not(.bm-launch):not(.bm-launch *){animation-duration:.001s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.001s!important;scroll-behavior:auto!important}';
        document.head.appendChild(st);
      }
    }
  };

  /* ------------------------------------------------------------ BatmishAccessController */
  function AccessController() {
    this.state = 'hidden';        // hidden | allowed
    this.lastServerCheck = 0; this.checking = false; this.resolver = new RoundConfigurationResolver();
    this.btn = null; this.ui = null; this.uiLoading = null; this.timer = null; this.cssLoaded = false;
  }
  AccessController.prototype.relay = function () {
    try { return String(TIKTOK_BRIDGE_SERVERS[0]).replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/ws$/, ''); } catch (e) { return ''; }
  };
  AccessController.prototype.user = function () { try { return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null; } catch (e) { return null; } };
  // فحص أولي من حالة الواجهة (توفير للشبكة فقط، ليس حماية): بث تيك توك مربوط الآن باسم _zvd4،
  // أو حساب احسمها المسمّى (mish) مسجَّل الدخول. القرار النهائي دائماً للخادم.
  AccessController.prototype.clientLinked = function () {
    try {
      var s = typeof homeConnections !== 'undefined' && homeConnections && homeConnections.tiktok;
      if (s && s.ws && s.ws.readyState === 1 && STREAMERS.indexOf(norm(s.username)) >= 0) return true;
    } catch (e) { /* تجاهل */ }
    try { if (typeof isOwnerAccount === 'function' && isOwnerAccount()) return true; } catch (e) { /* تجاهل */ }
    try { return typeof currentUsername !== 'undefined' && SITE_USERS.indexOf(norm(currentUsername)) >= 0; } catch (e) { return false; }
  };
  AccessController.prototype.request = function (method, path, body, opt) {
    var self = this, u = this.user();
    if (!u) return Promise.reject(Object.assign(new Error('no-user'), { status: 401 }));
    var run = function (force) {
      return u.getIdToken(!!force).then(function (tok) {
        var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, (opt && opt.timeout) || 9000);
        return fetch(self.relay() + path, { method: method, signal: ctl.signal, headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
          .then(function (r) { clearTimeout(to); return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {} return { status: r.status, body: j }; }); },
            function (e) { clearTimeout(to); throw Object.assign(new Error('network'), { offline: true, cause: e }); });
      });
    };
    return run(false).then(function (r) { return r.status === 401 ? run(true) : r; }).then(function (r) {
      if (r.status === 403 && r.body && r.body.reason) { self.deny(); }
      return r;
    });
  };
  AccessController.prototype.deny = function () { this.hide('denied'); };

  AccessController.prototype.tick = function () {
    var self = this;
    if (!this.user() || !this.clientLinked()) { if (this.state !== 'hidden') this.hide('unlinked'); return; }
    var now = Date.now();
    if (this.checking) return;
    if (this.state === 'allowed' && now - this.lastServerCheck < RECHECK_MS) return;
    if (this.state === 'hidden' && now - this.lastServerCheck < 4000) return;   // لا نكرّر الفحص عند الرفض
    this.checking = true; this.lastServerCheck = now;
    this.request('GET', '/batmish/access').then(function (r) {
      self.checking = false;
      if (r.status === 200 && r.body && r.body.allowed === true) { if (STREAMERS.indexOf(r.body.streamerId) >= 0 || SITE_USERS.indexOf(r.body.streamerId) >= 0) { STREAMER = r.body.streamerId; if (window.Batmish) { window.Batmish.STREAMER = STREAMER; window.Batmish.VIA = r.body.via || 'stream'; } } self.allow(); }
      else self.hide('server');
    }, function () { self.checking = false; /* خطأ شبكة: نبقى على الحالة الحالية؛ الخادم يرفض أي طلب بعدها إن فقدنا الصلاحية */ });
  };

  AccessController.prototype.loadCss = function () {
    if (this.cssLoaded) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = BASE + 'batmish.css'; l.id = 'batmish-css'; document.head.appendChild(l);
    this.cssLoaded = true;
  };
  AccessController.prototype.allow = function () {
    if (this.state === 'allowed') return;
    var self = this;
    this.state = 'allowed';
    this.loadCss();
    this.mountButton();
    // التخصيص النشط للألعاب (overrides فقط) — من الخادم
    this.request('GET', '/batmish/overlay').then(function (r) {
      if (r.status === 200 && r.body && self.state === 'allowed') { var u = self.user(); self.resolver.set(r.body.rev, r.body.config, u && u.uid); }
    }, function () {});
    try { window.dispatchEvent(new CustomEvent('batmish:access', { detail: { allowed: true } })); } catch (e) {}
  };
  AccessController.prototype.hide = function (why) {
    var was = this.state;
    this.state = 'hidden';
    this.resolver.clear();
    if (this.ui && this.ui.close) { try { this.ui.close({ silent: true, reason: why }); } catch (e) {} }
    if (this.btn) { var b = this.btn; this.btn = null; b.classList.remove('is-on'); setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 650); }
    if (was === 'allowed') { try { window.dispatchEvent(new CustomEvent('batmish:access', { detail: { allowed: false, reason: why } })); } catch (e) {} }
  };

  AccessController.prototype.mountButton = function () {
    if (this.btn) return;
    var self = this, b = document.createElement('button');
    b.type = 'button'; b.className = 'bm-launch'; b.id = 'batmish-launch'; b.setAttribute('aria-label', 'BATMISH — لوحة التحكم');
    b.innerHTML = '<span class="bm-launch-plate"></span><svg class="bm-launch-edge" viewBox="0 0 236 62" preserveAspectRatio="none" aria-hidden="true"><path class="base" d="M0 16 L16 0 H196 L206 8 H236 V46 L220 62 H40 L30 54 H0 Z"/><path class="run" pathLength="100" d="M0 16 L16 0 H196 L206 8 H236 V46 L220 62 H40 L30 54 H0 Z"/></svg>' +
      '<span class="bm-launch-emblem">' + BAT_SVG.replace('<path', '<path fill="currentColor"') + '</span><span class="bm-launch-txt"><b>BATMISH</b><i>مركز القيادة</i></span><span class="bm-launch-screw s1"></span><span class="bm-launch-screw s2"></span>';
    b.addEventListener('click', function () { self.open(b); });
    b.addEventListener('pointerenter', function () { self.loadUi(); }, { once: true });
    document.body.appendChild(b);
    this.btn = b;
    requestAnimationFrame(function () { requestAnimationFrame(function () { b.classList.add('is-on'); }); });
    if ('requestIdleCallback' in window) requestIdleCallback(function () { self.loadUi(); }, { timeout: 4000 }); else setTimeout(function () { self.loadUi(); }, 2500);
  };

  AccessController.prototype.loadUi = function () {
    var self = this;
    if (this.ui) return Promise.resolve(this.ui);
    if (this.uiLoading) return this.uiLoading;
    this.uiLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = BASE + 'batmish-ui.js'; s.async = true;
      s.onload = function () { self.ui = window.Batmish && window.Batmish.ui; self.ui ? resolve(self.ui) : reject(new Error('ui')); };
      s.onerror = function () { self.uiLoading = null; reject(new Error('ui-load')); };
      document.head.appendChild(s);
    });
    return this.uiLoading;
  };

  AccessController.prototype.open = function (fromBtn) {
    var self = this;
    if (this.state !== 'allowed') return;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, warp = null;
    var root = document.getElementById('batmish-root'); if (root && root.classList.contains('is-open')) return;
    if (!reduce && fromBtn) {
      var r = fromBtn.getBoundingClientRect(); warp = document.createElement('div'); warp.className = 'bm-warp';
      warp.style.setProperty('--ox', (r.left + 62) + 'px'); warp.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
      warp.innerHTML = '<div class="bm-warp-flash"></div><div class="bm-warp-door top"></div><div class="bm-warp-door bot"></div><div class="bm-warp-bat">' + BAT_SVG + '</div>';
      document.body.appendChild(warp); void warp.offsetWidth; warp.classList.add('is-run');
    }
    this.loadUi().then(function (ui) {
      if (self.state !== 'allowed') { if (warp && warp.parentNode) warp.parentNode.removeChild(warp); return; }
      setTimeout(function () { if (self.state === 'allowed') ui.open(); }, reduce || !warp ? 0 : 470);
    }, function () { if (warp && warp.parentNode) warp.parentNode.removeChild(warp); if (typeof toast === 'function') toast('تعذّر تحميل واجهة BATMISH. تحقق من الاتصال وحاول مجدداً.'); });
    if (warp) setTimeout(function () { if (warp.parentNode) warp.parentNode.removeChild(warp); }, 1150);
  };

  AccessController.prototype.start = function () {
    var self = this;
    if (this.timer) return;
    this.timer = setInterval(function () { self.tick(); }, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { self.lastServerCheck = 0; self.tick(); } });
  };

  var controller = new AccessController();

  /* ---------- إحصائيات البث الحيّة: من نفس أحداث الجسر التي تغذّي الألعاب (تعليقات/هدايا/متابعون/إعجابات/مشاهدون).
     تُجمَّع على هذا الجهاز فقط ومن لحظة ربط البث، وفقط لحساب مصرّح له (الأحداث تُتجاهل بغير ذلك). ليست سجلاً رسمياً من تيك توك. */
  var StreamStats = (function () {
    function fresh(user) { return { start: Date.now(), user: user || '', comments: 0, gifts: 0, diamonds: 0, follows: 0, likes: 0, joins: 0, shares: 0, viewers: null, peak: 0, chatters: {}, gifters: {}, recent: [], recentGifts: [], stamps: [], vs: [], lastEvent: 0 }; }
    var s = fresh('');
    function who(m) { var u = (m && m.user) || {}; var id = String(u.uniqueId || u.userId || ''); return { id: id, name: String(u.nickname || id || 'مجهول') }; }
    function top(map, n) { return Object.keys(map).map(function (k) { return { id: k, name: map[k].name, n: map[k].n }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, n); }
    function curUser() { try { var t = homeConnections && homeConnections.tiktok; return t && t.username ? norm(t.username) : ''; } catch (e) { return ''; } }
    function add(evt) {
      var u = curUser(); if (u && u !== s.user) s = fresh(u);   // بث/حساب مختلف → عدّاد جديد
      var ms = evt && (evt.messages || (evt.type ? [evt] : [])); if (!ms) return;
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i], t = m && (m.type || m.event); if (!t) continue;
        if (t === 'WebcastChatMessage') {
          var w = who(m), txt = String(m.comment || '').slice(0, 220); if (!txt) continue;
          s.comments++; s.lastEvent = Date.now(); s.stamps.push(Date.now()); if (s.stamps.length > 600) s.stamps.shift();
          var c = s.chatters[w.id] || (s.chatters[w.id] = { name: w.name, n: 0 }); c.n++;
          s.recent.unshift({ name: w.name, text: txt, at: Date.now() }); if (s.recent.length > 40) s.recent.pop();
        } else if (t === 'WebcastGiftMessage') {
          var g = who(m), cnt = Math.max(1, Number(m.repeatCount) || 1), dia = (Number(m.diamondCount) || 0) * cnt;
          s.gifts += cnt; s.diamonds += dia; s.lastEvent = Date.now();
          var gg = s.gifters[g.id] || (s.gifters[g.id] = { name: g.name, n: 0 }); gg.n += dia;
          s.recentGifts.unshift({ name: g.name, gift: String(m.giftName || 'هدية'), cnt: cnt, at: Date.now() }); if (s.recentGifts.length > 20) s.recentGifts.pop();
        } else if (t === 'WebcastSocialMessage') {
          if (String(m.displayType || '').indexOf('share') >= 0) s.shares++; else s.follows++;
          s.lastEvent = Date.now();
        } else if (t === 'WebcastLikeMessage') {
          var tl = Number(m.totalLikeCount) || 0; if (tl > s.likes) s.likes = tl; else s.likes += Number(m.likeCount) || 0; s.lastEvent = Date.now();
        } else if (t === 'WebcastRoomUserSeqMessage') {
          var v = Number(m.viewerCount); if (isFinite(v)) { s.viewers = v; if (v > s.peak) s.peak = v; s.lastEvent = Date.now(); }
        } else if (/Member/.test(t)) { s.joins++; }
      }
    }
    // عيّنة مشاهدين كل 5 ثوانٍ للرسم البياني
    setInterval(function () { if (s.viewers != null) { s.vs.push(s.viewers); if (s.vs.length > 72) s.vs.shift(); } }, 5000);
    function snapshot() {
      var now = Date.now(), min = 0; for (var i = s.stamps.length - 1; i >= 0 && now - s.stamps[i] < 60000; i--) min++;
      var linked = false; try { var t = homeConnections && homeConnections.tiktok; linked = !!(t && t.ws && t.ws.readyState === 1); } catch (e) {}
      return { linked: linked, user: s.user || curUser(), start: s.start, uptime: now - s.start, comments: s.comments, perMin: min, chatters: Object.keys(s.chatters).length, gifts: s.gifts, diamonds: s.diamonds, follows: s.follows, likes: s.likes, shares: s.shares, joins: s.joins, viewers: s.viewers, peak: s.peak, vs: s.vs.slice(), recent: s.recent.slice(0, 25), recentGifts: s.recentGifts.slice(0, 10), topChatters: top(s.chatters, 5), topGifters: top(s.gifters, 5), lastEvent: s.lastEvent };
    }
    function reset() { s = fresh(curUser()); }
    return { add: add, snapshot: snapshot, reset: reset };
  })();
  window.__bmStreamTap = function (evt) { if (controller.state === 'allowed') StreamStats.add(evt); };
  window.Batmish = { STREAMER: STREAMER, BAT_SVG: BAT_SVG, BASE: BASE, controller: controller, stats: StreamStats, resolver: controller.resolver, effects: SiteEffects, norm: norm };
  // modGetSetting(tag,key,fallback) في index.html يستدعي هذه الدالة أولاً
  window.__batmishOverlay = function (tag, key) { return controller.resolver.get(tag, key); };
  controller.start();
})();
