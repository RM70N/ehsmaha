/* BATMISH SPECIAL EVENTS — الربط بالمتصفح: تحميل الكتالوج/الإعدادات من الخادم، إنشاء المحرك، عرض الأحداث على الشاشة،
   الصوت، إرسال سجل التنفيذ، وربط محركات الألعاب (hooks). يبدأ فقط بعد موافقة الخادم على الوصول. */
(function () {
  'use strict';
  if (window.BatmishEvents) return;
  var B = window.Batmish, core = window.BatmishEventsCore, adapters = window.BatmishEventAdapters || {};
  var engine = null, catalog = null, state = null, hooked = {}, booted = false, queue = [], flushing = false;
  var PRESENT = {   // أسلوب عرض يناسب طبيعة كل لعبة (لون/أيقونة/حركة)
    cw: { icon: '🌍', hue: '#8fb4e6', anim: 'bmev-sweep' },
    _: { icon: '⚡', hue: '#e5c84b', anim: 'bmev-pop' }
  };
  var STEPS = ['مقدمة الحدث', 'تفعيل التأثير', 'الحدث نشط', 'تحذير قبل الانتهاء', 'اكتمال واستعادة الحالة'];
  var AR_STATUS = { completed: 'مكتمل', cancelled: 'ملغي', failed: 'فشل' };

  /* ---------- الصوت: سياق مستقل خفيف (لا يلمس صوت اللعبة) ---------- */
  var actx = null;
  function beep(freqs, vol) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var t0 = actx.currentTime;
      freqs.forEach(function (f, i) { var o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0 + i * .12); g.gain.exponentialRampToValueAtTime(vol || .06, t0 + i * .12 + .02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * .12 + .22); o.connect(g); g.connect(actx.destination); o.start(t0 + i * .12); o.stop(t0 + i * .12 + .25); });
    } catch (e) { /* لا صوت */ }
  }

  /* ---------- العرض على الشاشة ---------- */
  function host() { var h = document.getElementById('bmev-host'); if (!h) { h = document.createElement('div'); h.id = 'bmev-host'; h.setAttribute('dir', 'rtl'); h.setAttribute('aria-live', 'polite'); document.body.appendChild(h); } return h; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function card(def, cls, text, preview) {
    var pr = PRESENT[def.tag] || PRESENT._, el = document.createElement('div');
    el.className = 'bmev ' + (cls || '') + ' ' + pr.anim; el.style.setProperty('--bmev-hue', pr.hue);
    el.innerHTML = '<div class="bmev-top"><span class="bmev-badge">' + (preview ? 'معاينة' : 'حدث خاص') + '</span><span class="bmev-sys">نظام أحداث BATMISH</span></div>' +
      '<div class="bmev-title"><i>' + pr.icon + '</i>' + esc(def.name) + '</div><div class="bmev-text">' + esc(text || def.desc || '') + '</div>';
    return el;
  }
  function show(def, cls, text, ms, preview) { var el = card(def, cls, text, preview); host().appendChild(el); requestAnimationFrame(function () { el.classList.add('on'); }); setTimeout(function () { el.classList.remove('on'); setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 450); }, ms || 3800); return el; }
  var shown = {};
  var presenter = {
    start: function (inst, def, cfg) {
      var ad = adapters[inst.tag], ev = ad && ad.events[def.id];
      var at = ev && ev.announceText; if (typeof at === 'function') { try { at = at(inst); } catch (e) { at = ''; } } if (cfg.vfx !== false && cfg.announce !== false) show(def, 'bmev-start', at || def.desc, 4200);
      if (cfg.sfx !== false) beep([523, 784, 1047], .07);
    },
    warn: function (inst, def) { if (inst.cfg.vfx !== false && inst.cfg.announce !== false) show(def, 'bmev-warn', 'الحدث على وشك الانتهاء', 2400); if (inst.cfg.sfx !== false) beep([440, 440], .06); },
    end: function (inst, def, status) { if (inst.cfg.vfx !== false && inst.cfg.announce !== false) show(def, status === 'completed' ? 'bmev-end' : 'bmev-cancel', status === 'completed' ? 'انتهى الحدث وعادت قواعد اللعبة' : 'أُلغي الحدث', 2600); if (inst.cfg.sfx !== false) beep(status === 'completed' ? [784, 523] : [330, 247], .06); }
  };

  /* ---------- سجل التنفيذ → الخادم (مع إعادة المحاولة) ---------- */
  function flush() {
    if (flushing || !queue.length) return; flushing = true;
    var item = queue[0];
    B.controller.request('POST', '/batmish/events/record', item.row, { timeout: 20000 }).then(function (r) {
      flushing = false;
      if (r.status >= 200 && r.status < 300 || (r.status >= 400 && r.status < 500 && r.status !== 429)) { queue.shift(); }      // قُبل أو رُفض نهائياً (لا يعاد)
      else if (++item.tries >= 6) queue.shift();
      document.dispatchEvent(new CustomEvent('bmev:history'));
      if (queue.length) setTimeout(flush, 300);
    }, function () { flushing = false; if (++item.tries >= 6) queue.shift(); setTimeout(flush, Math.min(30000, 1500 * Math.pow(2, item.tries))); });
  }
  function record(row) { queue.push({ row: row, tries: 0 }); if (queue.length > 200) queue.shift(); flush(); }

  /* ---------- ربط محركات الألعاب ---------- */
  function hookGame(tag) {
    if (hooked[tag] || !adapters[tag]) return;
    var h = adapters[tag].hook; if (!h) return; hooked[tag] = true;
    var orig = window[h.start]; if (typeof orig !== 'function') { hooked[tag] = false; return; }
    window[h.start] = function () {
      if (h.before) {   // ألعاب تحتاج أن تسبق الأحداثُ بدايةَ المرحلة (مثل خلط الأكواب): نبدأ الجولة ثم نُنفّذ المستحَق فوراً قبل اللعبة
        try { if (engine && (!h.canBegin || h.canBegin())) { engine.beginRound(tag, {}); engine.tick(); } } catch (e) { console.warn('[bmev] beginRound', e); }
        return orig.apply(this, arguments);
      }
      var r = orig.apply(this, arguments);
      try { if (engine && h.began()) engine.beginRound(tag, {}); } catch (e) { console.warn('[bmev] beginRound', e); }
      return r;
    };
    window[h.start].__bmev = true;
  }

  /* ---------- الواجهة البرمجية ---------- */
  function load(cb) {
    B.controller.request('GET', '/batmish/events/bootstrap', null, { timeout: 30000 }).then(function (r) {
      if (r.status !== 200 || !r.body) return cb && cb(new Error('events_bootstrap_' + r.status));
      catalog = r.body.catalog; state = r.body.state;
      if (engine) { engine.setCatalog(catalog); engine.setState(state); }
      cb && cb(null);
    }, function (e) { cb && cb(e); });
  }
  function start() {
    if (booted) return; booted = true;
    engine = core.createEngine({ presenter: presenter, record: record, log: function (l, m, e) { if (window.console) console.warn('[bmev]', m, e && e.message || ''); } });
    Object.keys(adapters).forEach(function (t) { engine.registerAdapter(adapters[t]); });
    load(function (err) { if (err) { booted = false; setTimeout(start, 20000); return; } Object.keys(adapters).forEach(hookGame); document.dispatchEvent(new CustomEvent('bmev:ready')); });
  }
  function stop() { if (engine) { engine.destroy(); engine = null; } booted = false; queue.length = 0; var h = document.getElementById('bmev-host'); if (h) h.innerHTML = ''; }
  // معاينة: عرض فقط — لا تلمس حالة اللعبة ولا اللاعبين ولا النقاط ولا السجل
  function preview(tag, eventId) {
    var g = catalog && catalog.games.filter(function (x) { return x.tag === tag; })[0], def = g && g.events.filter(function (e) { return e.id === eventId; })[0]; if (!def) return false;
    var d = { id: def.id, tag: tag, name: def.name, desc: def.desc };
    var ad = adapters[tag], txt = (ad && ad.events[eventId] && ad.events[eventId].announceText) || def.desc;
    show(d, 'bmev-start', txt, 3000, true); setTimeout(function () { show(d, 'bmev-warn', 'الحدث على وشك الانتهاء', 2000, true); }, 3300); setTimeout(function () { show(d, 'bmev-end', 'انتهى الحدث وعادت قواعد اللعبة', 2200, true); }, 5600);
    beep([523, 784, 1047], .05); return true;
  }
  window.BatmishEvents = {
    start: start, stop: stop, preview: preview, STEPS: STEPS, AR_STATUS: AR_STATUS,
    reload: function (cb) { load(cb); }, catalog: function () { return catalog; }, state: function () { return state; },
    setState: function (s) { state = s; if (engine) engine.setState(s); },
    trigger: function (tag, id) { return engine ? engine.trigger(tag, id) : { ok: false, reason: 'engine_off' }; },
    status: function () { return engine ? engine.status() : { rounds: [], active: [], stats: { total: 0, completed: 0, cancelled: 0, failed: 0, last: null, byGame: {} } }; },
    engine: function () { return engine; }, supported: function (tag) { return !!adapters[tag]; }
  };
})();
