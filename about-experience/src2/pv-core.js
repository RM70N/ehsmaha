/* احسمها - نواة المعاينات التوضيحية (معزولة داخل iframe)
   1) ساعة قابلة للإيقاف: تجمّد الوقت (performance.now / Date.now / المؤقتات / rAF) كله بأمر من الصفحة الأم.
   2) جسر رسائل آمن: يستقبل أوامر الصفحة الأم فقط، ويرسل لها أحداث السيناريو (شات، خطوات، نتيجة).
   لا شبكة، لا تخزين دائم، لا أي اتصال بالبث أو الحسابات. */
(function () {
  'use strict';
  var realNow = performance.now.bind(performance), realDate = Date.now.bind(Date);
  var rST = window.setTimeout.bind(window), rCT = window.clearTimeout.bind(window);
  var rSI = window.setInterval.bind(window), rCI = window.clearInterval.bind(window);
  var rRAF = window.requestAnimationFrame.bind(window), rCAF = window.cancelAnimationFrame.bind(window);
  /* ساعة افتراضية: vnow = vBase + (الوقت الحقيقي - rBase) * scale. تتجمّد عند الإيقاف، وscale يختصر العرض كله بالتساوي (حركة وكاميرا وقرار ونتيجة معًا). */
  var paused = false, frozen = 0, scale = 1, vBase = 0, rBase = realNow(), d0 = realDate();
  function vnow() { return paused ? frozen : vBase + (realNow() - rBase) * scale; }
  performance.now = function () { return vnow(); };
  Date.now = function () { return d0 + vnow(); };
  function setScale(k) { var v = vnow(); vBase = v; rBase = realNow(); scale = k > 0 ? k : 1; }

  var seq = 1, timers = {};
  window.setTimeout = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2), id = seq++, due = vnow() + (+ms || 0);
    (function arm(wait) {
      timers[id] = rST(function tick() {
        if (!(id in timers)) return;
        var rem = due - vnow();
        if (paused) { timers[id] = rST(tick, 60); return; }
        if (rem > 1) { timers[id] = rST(tick, Math.min(rem / scale, 250)); return; }
        delete timers[id];
        if (typeof fn === 'function') fn.apply(null, args);
      }, wait);
    })(Math.min((+ms || 0) / scale, 250));
    return id;
  };
  window.clearTimeout = function (id) { if (id in timers) { rCT(timers[id]); delete timers[id]; } };
  var ivs = {};
  window.setInterval = function (fn, ms) {
    var args = Array.prototype.slice.call(arguments, 2), id = seq++, period = Math.max(4, +ms || 0), next = vnow() + period;
    ivs[id] = rSI(function () {
      if (paused) return;
      if (vnow() >= next) { next += period; if (next < vnow()) next = vnow() + period; if (typeof fn === 'function') fn.apply(null, args); }
    }, Math.min(period, 16));
    return id;
  };
  window.clearInterval = function (id) { if (id in ivs) { rCI(ivs[id]); delete ivs[id]; } };
  var rafs = {}, gap = window.__PV_FPS ? 1000 / window.__PV_FPS - 3 : 0, lastF = 0;
  window.requestAnimationFrame = function (cb) {
    var id = seq++;
    (function again() { rafs[id] = rRAF(function () { if (!(id in rafs)) return; if (paused) { again(); return; }
      if (gap) { var t = realNow(); if (t - lastF < gap) { again(); return; } lastF = t; }
      delete rafs[id]; cb(vnow()); }); })();
    return id;
  };
  window.cancelAnimationFrame = function (id) { if (id in rafs) { rCAF(rafs[id]); delete rafs[id]; } };

  function setPaused(v) {
    v = !!v; if (v === paused) return;
    if (v) { frozen = vnow(); paused = true; }
    else { vBase = frozen; rBase = realNow(); paused = false; }
    document.documentElement.classList.toggle('pv-paused', paused);
  }

  /* صامتة دائمًا: لا AudioContext داخل المعاينة */
  try { window.AudioContext = undefined; window.webkitAudioContext = undefined; } catch (e) {}

  var ORIGIN = location.origin && location.origin !== 'null' ? location.origin : '*';
  var runId = 0, cmdHandlers = [];
  var PV = window.PV = {
    clock: { pause: function () { setPaused(true); }, resume: function () { setPaused(false); }, paused: function () { return paused; }, scale: setScale },
    emit: function (type, data) { try { window.parent.postMessage({ src: 'ehsemha-about-preview', game: PV.game, type: type, data: data || null }, ORIGIN); } catch (e) {} },
    sleep: function (ms, id) { return new Promise(function (res, rej) { setTimeout(function () { if (id != null && id !== runId) rej('abort'); else res(); }, ms); }); },
    run: function (fn) { var id = ++runId; Promise.resolve().then(function () { return fn(id); }).catch(function (e) { if (e !== 'abort') { console.error(e); PV.emit('error', String(e && e.message || e)); } }); },
    onCmd: function (f) { cmdHandlers.push(f); },
    game: ''
  };
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return;
    if (ORIGIN !== '*' && e.origin !== ORIGIN) return;
    var d = e.data; if (!d || d.src !== 'ehsemha-about' || typeof d.cmd !== 'string') return;
    if (d.cmd === 'pause') setPaused(true); else if (d.cmd === 'resume') setPaused(false);
    cmdHandlers.forEach(function (f) { try { f(d.cmd, d); } catch (er) {} });
  });
  /* لا تسرق الأزرار من تمرير الصفحة */
  window.addEventListener('keydown', function (e) { if (e.code === 'Space' || e.key.indexOf('Arrow') === 0) e.stopImmediatePropagation(); }, true);
})();

/* ---- إضافات الإصدار 2: ستار انتقال هادئ + فقاعة أمر صغيرة داخل المشهد ---- */
(function () {
  'use strict';
  var PV = window.PV, veilEl = null, st = null;
  var rST = window.setTimeout;
  function ensure() {
    if (st) return;
    st = document.createElement('style');
    st.textContent = '#pv-veil{position:fixed;inset:0;z-index:90;background:radial-gradient(80% 80% at 50% 45%,#1a0d33,#0b0518);opacity:0;pointer-events:none;transition:opacity .3s ease}' +
      '.pv-bubble{position:fixed;z-index:80;left:50%;bottom:5%;transform:translateX(-50%);display:flex;align-items:center;gap:1.6vmin;padding:1.4vmin 3vmin;border-radius:999px;background:rgba(20,10,42,.9);border:.35vmin solid rgba(196,176,255,.55);box-shadow:0 1vmin 4vmin rgba(124,58,237,.45);font:800 3.6vmin Tajawal,system-ui,sans-serif;color:#EDE9FF;white-space:nowrap;direction:rtl;animation:pvBub 1.9s cubic-bezier(.16,1,.3,1) both;pointer-events:none}' +
      '.pv-bubble b{color:#C4B0FF;font-weight:800}.pv-bubble span{font-family:Cairo,Tajawal,sans-serif;font-weight:900}' +
      '@keyframes pvBub{0%{opacity:0;transform:translate(-50%,2vmin) scale(.94)}14%{opacity:1;transform:translate(-50%,0) scale(1)}82%{opacity:1}100%{opacity:0;transform:translate(-50%,-1vmin)}}';
    document.head.appendChild(st);
    veilEl = document.createElement('div'); veilEl.id = 'pv-veil'; document.body.appendChild(veilEl);
  }
  var scaleNow = 1, origScale = PV.clock.scale;
  PV.clock.scale = function (k) { scaleNow = k > 0 ? k : 1; origScale(k); };
  PV.veil = function (S) { ensure(); veilEl.style.opacity = '1'; return S(340 * scaleNow); };
  PV.unveil = function () { ensure(); veilEl.style.opacity = '0'; };
  PV.bubble = function (name, text) {
    ensure();
    var old = document.querySelectorAll('.pv-bubble'); for (var i = 0; i < old.length; i++) old[i].remove();
    var el = document.createElement('div'); el.className = 'pv-bubble';
    var b = document.createElement('b'); b.textContent = name; var s = document.createElement('span'); s.textContent = text;
    el.appendChild(b); el.appendChild(s); document.body.appendChild(el);
    rST(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2000);
  };
})();
