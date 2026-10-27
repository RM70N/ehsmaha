/* ==========================================================================
   EHSEMHA — DH_MX · THE LEGENDARY ARRIVAL   (dhmx-welcome.js)
   طبقة بصرية مستقلة — لا تعدّل ولا تعترض أي منطق ربط/بث/لعبة.
   الاستخدام الوحيد من الموقع بعد نجاح ربط حقيقي يبدأه المستخدم:

     DhmxWelcome.onConnected({ uniqueId:'dh_mx', verified:true, attemptId:'...' });

   التفاصيل في INTEGRATION.md
   ========================================================================== */
(function (w, d) {
  'use strict';
  if (w.DhmxWelcome) return;

  var TARGET = 'dh_mx';            // الحساب الوحيد المؤهَّل
  var MAX_SHOWS = 3;               // ثلاث مرات إجمالًا
  var DURATION = 4000;             // ms — من ظهور الـOverlay حتى اختفائه النهائي
  var LS_PREFIX = 'dhmx-welcome-v1:';
  var AVATAR_WAIT_MS = 2200;
  var running = false, busy = false;
  var seen = {};                   // حماية داخل الصفحة من تكرار نفس محاولة الربط
  var cfg = { store: null, fetchAvatar: null, log: true };

  function warn() { if (cfg.log && w.console) try { console.warn.apply(console, ['[dhmx-welcome]'].concat([].slice.call(arguments))); } catch (e) {} }
  function norm(u) { return String(u || '').trim().replace(/^@/, '').toLowerCase(); }

  /* ----------------------- التخزين (عدّاد الظهور) -----------------------
     store.reserve(key, attemptId) → Promise<{granted:boolean, count:number, reason?:string}>
     العملية يجب أن تكون ذرّية. الافتراضي: localStorage لنفس الجهاز فقط (احتياطي).
     للضمان عبر كل الأجهزة مرّر store مركزي (createFirestoreStore).            */
  var localStore = {
    kind: 'local',
    reserve: function (key, attemptId) {
      var run = function () {
        var k = LS_PREFIX + key, rec;
        try { rec = JSON.parse(w.localStorage.getItem(k) || 'null'); } catch (e) { rec = null; }
        rec = rec || { count: 0, attempts: [] };
        if (rec.attempts.indexOf(attemptId) > -1) return { granted: false, count: rec.count, reason: 'duplicate' };
        if (rec.count >= MAX_SHOWS) return { granted: false, count: rec.count, reason: 'limit' };
        rec.count += 1; rec.attempts.push(attemptId); rec.attempts = rec.attempts.slice(-8);
        w.localStorage.setItem(k, JSON.stringify(rec));
        return { granted: true, count: rec.count };
      };
      // قفل بين النوافذ المفتوحة على نفس الجهاز (يمنع السباق)
      if (w.navigator && w.navigator.locks && w.navigator.locks.request) {
        return w.navigator.locks.request('dhmx-welcome-lock', function () { return run(); });
      }
      try { return Promise.resolve(run()); } catch (e) { return Promise.reject(e); }
    },
    peek: function (key) {
      try { var r = JSON.parse(w.localStorage.getItem(LS_PREFIX + key) || 'null'); return r ? r.count : 0; } catch (e) { return 0; }
    },
    reset: function (key) { try { w.localStorage.removeItem(LS_PREFIX + key); } catch (e) {} }
  };

  /* مخزن مركزي على Firestore (معاملة ذرّية + Idempotency بمعرّف المحاولة).
     fb = نفس كائن fb الموجود في احسمها (db, doc, runTransaction, serverTimestamp). */
  function createFirestoreStore(fb, opts) {
    var col = (opts && opts.collection) || 'dhmxWelcome';
    return {
      kind: 'firestore',
      reserve: function (key, attemptId) {
        var ref = fb.doc(fb.db, col, key);
        return fb.runTransaction(fb.db, function (tx) {
          return tx.get(ref).then(function (snap) {
            var data = snap.exists() ? snap.data() : { count: 0, attempts: [] };
            var count = Number(data.count) || 0, attempts = data.attempts || [];
            if (attempts.indexOf(attemptId) > -1) return { granted: false, count: count, reason: 'duplicate' };
            if (count >= MAX_SHOWS) return { granted: false, count: count, reason: 'limit' };
            tx.set(ref, { count: count + 1, attempts: attempts.concat([attemptId]).slice(-8), updatedAt: fb.serverTimestamp ? fb.serverTimestamp() : Date.now() });
            return { granted: true, count: count + 1 };
          });
        });
      }
    };
  }

  /* ----------------------- الأصول البصرية ----------------------- */
  function octagon(r, off) {
    var pts = [];
    for (var i = 0; i < 8; i++) {
      var a = (off + 45 * i) * Math.PI / 180;
      pts.push((300 + r * Math.cos(a)).toFixed(1) + ',' + (300 + r * Math.sin(a)).toFixed(1));
    }
    return pts.join(' ');
  }

  function ringsSVG() {
    var orn = '';
    [45, 135, 225, 315].forEach(function (deg) {
      orn += '<g transform="rotate(' + deg + ' 300 300)">' +
        '<path d="M276 12 L324 12 L336 34 L264 34 Z" fill="url(#dmw-metal)" stroke="#07040D" stroke-width="1.5"/>' +
        '<path d="M284 18 L316 18 L322 28 L278 28 Z" fill="#170B2D" stroke="rgba(167,139,250,.55)" stroke-width="1"/>' +
        '<rect x="295.5" y="19.5" width="9" height="9" transform="rotate(45 300 24)" fill="#A78BFA"/></g>';
    });
    var notch = '';
    [0, 90, 180, 270].forEach(function (deg) {
      notch += '<g transform="rotate(' + deg + ' 300 300)"><path d="M292 8 L308 8 L304 22 L296 22 Z" fill="#07040D" stroke="rgba(167,139,250,.7)" stroke-width="1"/></g>';
    });
    var cross = '';
    [0, 90, 180, 270].forEach(function (deg) {
      cross += '<line x1="300" y1="118" x2="300" y2="96" transform="rotate(' + deg + ' 300 300)" stroke="#A78BFA" stroke-width="2" stroke-linecap="round" opacity=".85"/>';
    });
    return '' +
    '<svg class="dm-rings" viewBox="0 0 600 600" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="dmw-metal" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#8C84AB"/><stop offset=".2" stop-color="#2B2342"/><stop offset=".45" stop-color="#6A6286"/>' +
        '<stop offset=".7" stop-color="#1B1430"/><stop offset="1" stop-color="#A39BC2"/></linearGradient>' +
      '<linearGradient id="dmw-purple" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#A78BFA"/><stop offset=".5" stop-color="#7C3AED"/><stop offset="1" stop-color="#5B21B6"/></linearGradient>' +
      '<radialGradient id="dmw-base" cx=".5" cy=".5" r=".5">' +
        '<stop offset="0" stop-color="#07040D"/><stop offset=".62" stop-color="#120a24"/><stop offset=".9" stop-color="#1d0f3a"/><stop offset="1" stop-color="#07040D"/></radialGradient>' +
    '</defs>' +
    '<g class="dm-g dm-g-all">' +
      '<circle cx="300" cy="300" r="292" fill="url(#dmw-base)" stroke="rgba(167,139,250,.22)" stroke-width="1"/>' +
      '<circle cx="300" cy="300" r="278" fill="none" stroke="#07040D" stroke-width="22"/>' +
      '<circle cx="300" cy="300" r="278" fill="none" stroke="url(#dmw-metal)" stroke-width="16"/>' +
      '<circle cx="300" cy="300" r="270.5" fill="none" stroke="rgba(248,247,252,.38)" stroke-width="1"/>' +
      '<circle cx="300" cy="300" r="285.5" fill="none" stroke="rgba(248,247,252,.16)" stroke-width="1"/>' +
      notch + orn +
      '<g class="dm-g dm-g-tick"><circle cx="300" cy="300" r="254" fill="none" stroke="rgba(248,247,252,.55)" stroke-width="7" pathLength="360" stroke-dasharray="0.7 2.3"/></g>' +
      '<g class="dm-g dm-g-seg">' +
        '<circle cx="300" cy="300" r="236" fill="none" stroke="rgba(124,58,237,.30)" stroke-width="16" pathLength="360" stroke-dasharray="70 14 40 14 90 14 30 14 60 14"/>' +
        '<circle cx="300" cy="300" r="236" fill="none" stroke="url(#dmw-purple)" stroke-width="6" pathLength="360" stroke-dasharray="70 14 40 14 90 14 30 14 60 14"/>' +
      '</g>' +
      '<g class="dm-g dm-g-fine"><circle cx="300" cy="300" r="216" fill="none" stroke="rgba(167,139,250,.65)" stroke-width="2" pathLength="360" stroke-dasharray="2 6"/></g>' +
      '<circle class="dm-arc" cx="300" cy="300" r="226" pathLength="360" stroke="rgba(248,247,252,.95)" stroke-width="3" stroke-dasharray="34 326"/>' +
      '<circle class="dm-arc a2" cx="300" cy="300" r="226" pathLength="360" stroke="#A78BFA" stroke-width="3" stroke-dasharray="22 338" style="animation-delay:-1100ms"/>' +
      '<circle class="dm-arc a3" cx="300" cy="300" r="226" pathLength="360" stroke="#7C3AED" stroke-width="3" stroke-dasharray="46 314" style="animation-delay:-2300ms"/>' +
      '<g class="dm-g dm-g-oct">' +
        '<polygon points="' + octagon(196, 22.5) + '" fill="rgba(91,33,182,.07)" stroke="rgba(167,139,250,.38)" stroke-width="1.5"/>' +
        '<polygon points="' + octagon(188, 0) + '" fill="none" stroke="rgba(167,139,250,.16)" stroke-width="1"/>' +
      '</g>' + cross +
      '<circle cx="300" cy="300" r="160" fill="rgba(7,4,13,.9)" stroke="rgba(7,4,13,.9)" stroke-width="2"/>' +
      '<circle cx="300" cy="300" r="152" fill="none" stroke="#07040D" stroke-width="18"/>' +
      '<circle cx="300" cy="300" r="152" fill="none" stroke="url(#dmw-metal)" stroke-width="14"/>' +
      '<circle cx="300" cy="300" r="145.5" fill="none" stroke="rgba(248,247,252,.45)" stroke-width="1"/>' +
      '<circle cx="300" cy="300" r="141" fill="none" stroke="rgba(124,58,237,.38)" stroke-width="13"/>' +
      '<circle cx="300" cy="300" r="141" fill="none" stroke="url(#dmw-purple)" stroke-width="4"/>' +
      '<circle cx="300" cy="300" r="136" fill="#07040D"/>' +
    '</g></svg>';
  }

  function shardsSVG(cls, set) {
    return '<svg class="dm-shards ' + cls + '" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><defs>' +
      '<linearGradient id="dmw-sh-' + cls + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5B21B6" stop-opacity=".55"/><stop offset="1" stop-color="#170B2D" stop-opacity=".1"/></linearGradient></defs>' +
      set.map(function (p) { return '<polygon points="' + p[0] + '" fill="url(#dmw-sh-' + cls + ')" stroke="rgba(167,139,250,' + p[1] + ')" stroke-width="1"/>'; }).join('') + '</svg>';
  }
  var SHARDS_FAR = [
    ['0,0 360,0 210,260 0,170', .22], ['1600,0 1220,0 1400,300 1600,210', .22],
    ['0,900 300,900 170,660 0,720', .2], ['1600,900 1290,900 1430,640 1600,700', .2],
    ['520,0 860,0 690,120', .12], ['760,900 1100,900 930,790', .12]
  ];
  var SHARDS_NEAR = [
    ['0,250 150,380 0,560', .38], ['1600,260 1450,400 1600,590', .38],
    ['130,0 290,0 200,110', .3], ['1470,900 1310,900 1400,790', .3],
    ['0,620 120,760 0,860', .26], ['1600,640 1480,770 1600,870', .26]
  ];

  function streaksSVG() {
    var out = '<svg class="dm-streaks" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">';
    var n = 16;
    for (var i = 0; i < n; i++) {
      var a = (i * 360 / n + 11) * Math.PI / 180;
      var x1 = 500 + Math.cos(a) * 760, y1 = 460 + Math.sin(a) * 760;
      var x2 = 500 + Math.cos(a) * 300, y2 = 460 + Math.sin(a) * 300;
      out += '<line pathLength="1" style="--i:' + i + '" x1="' + x1.toFixed(0) + '" y1="' + y1.toFixed(0) + '" x2="' + x2.toFixed(0) + '" y2="' + y2.toFixed(0) + '"/>';
    }
    return out + '</svg>';
  }

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function particles(count) {
    var r = rng(20260427), out = '';
    var R0 = Math.max(w.innerWidth, w.innerHeight) * 0.62;
    for (var i = 0; i < count; i++) {
      var a = r() * 360, len = 10 + r() * 22;
      out += '<i class="dm-pt" style="--a:' + a.toFixed(1) + 'deg;--r0:' + (R0 * (0.55 + r() * 0.45)).toFixed(0) + 'px;--r1:' + (60 + r() * 90).toFixed(0) + 'px;--len:' + len.toFixed(0) + 'px;--del:' + (r() * 1100).toFixed(0) + 'ms;--dur:' + (700 + r() * 500).toFixed(0) + 'ms"></i>';
    }
    return out;
  }

  var WORDS = ['ياهلا', 'ومرحبا', 'ارحب', 'تراحيب', 'المطر'];

  function build(avatarUrl) {
    var small = w.matchMedia && w.matchMedia('(max-width:640px)').matches;
    var root = d.createElement('div');
    root.className = 'dhmx-welcome-root';
    root.setAttribute('aria-hidden', 'true');
    root.setAttribute('data-dhmx-welcome', '1');
    var av = avatarUrl
      ? '<img alt="" decoding="async" referrerpolicy="no-referrer" src="' + avatarUrl.replace(/"/g, '&quot;') + '">'
      : '<div class="dm-fallback">DH</div>';
    root.innerHTML =
      '<div class="dm-abs dm-dim"></div>' +
      '<div class="dm-core"></div><div class="dm-rays"></div><div class="dm-floor"></div>' +
      shardsSVG('dm-shards-far', SHARDS_FAR) + shardsSVG('dm-shards-near', SHARDS_NEAR) + streaksSVG() +
      '<div class="dm-hud-c tl"></div><div class="dm-hud-c tr"></div><div class="dm-hud-c bl"></div><div class="dm-hud-c br"></div>' +
      '<div class="dm-rail l"></div><div class="dm-rail r"></div><div class="dm-hline t"></div><div class="dm-hline b"></div>' +
      particles(small ? 12 : 30) +
      '<div class="dm-stage">' +
        '<div class="dm-emblem">' + ringsSVG() +
          '<div class="dm-wave"></div><div class="dm-wave w2"></div>' +
          '<div class="dm-avatar">' + av + '</div><div class="dm-sheen"></div>' +
        '</div>' +
        '<div class="dm-handle"><span class="dm-hl"></span><span class="dm-name">' + TARGET + '</span><span class="dm-hl r"></span></div>' +
        '<div class="dm-hello">' + WORDS.map(function (t, i) { return '<span class="dm-w" style="--i:' + i + '">' + t + '</span>'; }).join(' ') + '</div>' +
        '<div class="dm-plate-wrap"><span class="dm-orn"></span>' +
          '<div class="dm-reveal"><div class="dm-plate"><div class="dm-plate-in"><i class="dm-bevel l"></i><span class="dm-txt">أفضل واقوى ستريمر</span><i class="dm-bevel r"></i></div></div></div>' +
        '<span class="dm-orn r"></span></div>' +
      '</div>';
    // الصورة لو فشلت أثناء العرض → البديل الأنيق دون كسر الترحيب
    var img = root.querySelector('.dm-avatar img');
    if (img) img.addEventListener('error', function () { img.parentNode.innerHTML = '<div class="dm-fallback">DH</div>'; });
    return root;
  }

  function ensureFonts() {
    if (d.getElementById('dhmx-welcome-fonts')) return;
    try {
      var l = d.createElement('link'); l.id = 'dhmx-welcome-fonts'; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@900&family=Rajdhani:wght@600;700&display=swap';
      d.head.appendChild(l);
    } catch (e) {}
  }

  function preload(url) {
    return new Promise(function (res) {
      if (!url || !/^(https:\/\/|data:image\/)/i.test(url)) return res(null);
      var done = false, im = new Image();
      var fin = function (ok) { if (done) return; done = true; res(ok ? url : null); };
      im.referrerPolicy = 'no-referrer';
      im.onload = function () { fin(true); }; im.onerror = function () { fin(false); };
      setTimeout(function () { fin(false); }, AVATAR_WAIT_MS);
      im.src = url;
    });
  }

  function resolveAvatar(uid, given) {
    if (given) return Promise.resolve(given);
    var fn = cfg.fetchAvatar || (typeof w.playerTiktokFetchProfile === 'function' ? w.playerTiktokFetchProfile : null);
    if (!fn) return Promise.resolve(null);
    return Promise.race([
      Promise.resolve().then(function () { return fn(uid); }).then(function (r) { return r && (typeof r === 'string' ? r : r.avatar); }),
      new Promise(function (res) { setTimeout(function () { res(null); }, AVATAR_WAIT_MS); })
    ]).catch(function () { return null; });
  }

  /* ----------------------- العرض (4000ms بالضبط) ----------------------- */
  function play(avatarUrl) {
    return new Promise(function (resolve) {
      if (running || !d.body) return resolve(false);
      running = true;
      ensureFonts();
      var root = build(avatarUrl);
      d.body.appendChild(root);
      void root.offsetWidth;                         // تثبيت الحالة الابتدائية
      root.classList.add('dm-play');
      var t0 = (w.performance && performance.now) ? performance.now() : Date.now();
      var finished = false;
      function end() {
        if (finished) return; finished = true;
        clearTimeout(timer);
        if (root.parentNode) root.parentNode.removeChild(root);   // يوقف كل الحركات والحلقات
        running = false;
        resolve(true);
      }
      var timer = setTimeout(end, DURATION);
      root.__dmElapsed = function () { return ((w.performance && performance.now) ? performance.now() : Date.now()) - t0; };
    });
  }

  /* ----------------------- الواجهة العامة ----------------------- */
  function onConnected(info) {
    info = info || {};
    var uid = norm(info.uniqueId);
    if (uid !== TARGET) return Promise.resolve('skip:not-target');
    if (info.verified !== true) return Promise.resolve('skip:not-verified');
    if (running || busy) return Promise.resolve('skip:running');
    var attemptId = String(info.attemptId || (uid + ':' + Math.floor(Date.now() / 20000)));
    if (seen[attemptId]) return Promise.resolve('skip:duplicate');
    seen[attemptId] = 1;
    var key = String(info.userId ? 'id_' + info.userId : 'u_' + uid);
    var store = cfg.store || localStore;
    busy = true;                                   // يمنع حجزين متزامنين قبل بدء العرض
    return Promise.resolve().then(function () { return store.reserve(key, attemptId); }).then(function (r) {
      if (!r || !r.granted) return 'skip:' + ((r && r.reason) || 'denied');
      return resolveAvatar(uid, info.avatarUrl).then(preload).then(play).then(function () { return 'shown:' + r.count; });
    }).then(function (r) { busy = false; return r; }, function (e) {
      busy = false;
      warn('تعذّر حفظ العدّاد — لن يظهر الترحيب (الربط الأساسي لم يتأثر):', e);
      return 'skip:store-error';
    });
  }

  w.DhmxWelcome = {
    version: '1.0.0',
    target: TARGET, maxShows: MAX_SHOWS, duration: DURATION,
    configure: function (o) { o = o || {}; if ('store' in o) cfg.store = o.store; if ('fetchAvatar' in o) cfg.fetchAvatar = o.fetchAvatar; if ('log' in o) cfg.log = !!o.log; },
    createFirestoreStore: createFirestoreStore,
    onConnected: onConnected,
    /* معاينة التصميم فقط: لا تفحص الحساب ولا تحسب من العدّاد */
    preview: function (o) { o = o || {}; return preload(o.avatarUrl).then(play); },
    localStore: localStore
  };
})(window, document);

