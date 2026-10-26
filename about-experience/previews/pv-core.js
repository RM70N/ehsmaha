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
  var rafs = {};
  window.requestAnimationFrame = function (cb) {
    var id = seq++;
    (function again() { rafs[id] = rRAF(function () { if (!(id in rafs)) return; if (paused) { again(); return; } delete rafs[id]; cb(vnow()); }); })();
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
