/* EHSEMHA — Revival Sequence | RevivalPresentationManager
   مسؤول عن العرض فقط: لا يقرر نجاح الإنعاش ولا يلمس حالة اللاعبين.
   الحالات: idle → preparing → entering → revealing → confirmed → exiting → completed → idle */
(function (g) {
  'use strict';
  var R = g.Revival = g.Revival || {};

  var queue = [], cur = null, seen = {}, counts = {}, state = 'idle';
  var listeners = [];

  function setState(s) {
    state = s;
    if (cur && cur.ui) cur.ui.root.setAttribute('data-state', s);
    listeners.forEach(function (fn) { try { fn(s, cur && cur.item); } catch (e) {} });
  }

  function normalize(ev) {
    var C = R.Config;
    ev = ev || {};
    var name = String(ev.playerName == null ? '' : ev.playerName).trim();
    if (!name) return null;                       // لا نعرض إنعاشاً بلا لاعب
    var d = Number(ev.durationMs) || C.durationMs;
    d = Math.min(C.maxDurationMs, Math.max(C.minDurationMs, d));
    return {
      playerName: name,
      avatarUrl: ev.avatarUrl || '',
      giftName: ev.giftName ? String(ev.giftName) : '',
      giftImage: ev.giftImage || '',
      source: ev.source === 'admin' ? 'admin' : 'gift',
      eventId: ev.eventId || '', roundId: ev.roundId || '',
      durationMs: d, container: ev.container || null
    };
  }

  function dedupeKey(item) {
    return item.eventId ? 'id:' + item.eventId : 'n:' + item.playerName.toLowerCase() + '|' + item.giftName + '|' + item.source;
  }

  function show(ev) {
    return new Promise(function (resolve) {
      try {
        var item = normalize(ev);
        if (!item) return resolve({ ok: false, reason: 'no-player' });
        var now = Date.now(), key = dedupeKey(item);
        if (seen[key] && now - seen[key] < R.Config.dedupeWindowMs) return resolve({ ok: true, skipped: 'duplicate' });
        seen[key] = now;
        if (queue.length >= R.Config.maxQueue) return resolve({ ok: false, reason: 'queue-full' });
        var pk = item.playerName.toLowerCase();
        counts[pk] = (counts[pk] || 0) + 1;
        item.variant = (counts[pk] - 1) % 3;      // اختلاف بصري طفيف للإنعاش المتكرر
        queue.push({ item: item, resolve: resolve });
        pump();
      } catch (e) { resolve({ ok: false, reason: 'error', error: e }); }
    });
  }

  function pump() {
    if (cur || !queue.length) return;
    run(queue.shift());
  }

  function run(job) {
    cur = job;
    var item = job.item, timers = [], tl = null, done = false;
    var total = item.durationMs;
    job.timers = timers;

    function finish(ok) {
      if (done) return; done = true;
      timers.forEach(clearTimeout); timers.length = 0;
      try { if (tl) tl.cancel(); } catch (e) {}
      try { if (job.ui) job.ui.dispose(); } catch (e) {}
      setState('completed');
      job.ui = null; cur = null;
      setState('idle');
      job.resolve({ ok: ok });
      setTimeout(pump, 0);
    }
    job.finish = finish;

    try {
      setState('preparing');
      var mode = R.Effects.pickMode(R.Config);
      job.ui = R.Presentation.build(item, { mode: mode, variant: item.variant, container: item.container });
      job.ui.mount(item.container || document.body);
      void job.ui.root.offsetWidth;               // تثبيت التخطيط قبل بدء الحركة (لا Layout Jump)
      job.ui.fit();
      tl = R.Animation.play(job.ui, { mode: mode, variant: item.variant, total: total });
      tl.phases.forEach(function (p) {
        timers.push(setTimeout(function () { if (!done) setState(p.name); }, p.at));
      });
      timers.push(setTimeout(function () { finish(true); }, total));        // نهاية المشهد = نهاية التجميد
      timers.push(setTimeout(function () { finish(true); }, total + 250));   // حارس: لا واجهة معلقة أبداً
      setState('entering');
    } catch (e) {
      try { console.error('[Revival] presentation failed', e); } catch (_) {}
      finish(false);                              // فشل العرض لا يمس الإنعاش نفسه
    }
  }

  function cancelAll() {
    queue.splice(0).forEach(function (j) { j.resolve({ ok: false, reason: 'cancelled' }); });
    if (cur && cur.finish) cur.finish(false);
  }

  g.addEventListener('pagehide', cancelAll);

  var API = {
    show: show,
    cancelAll: cancelAll,
    onState: function (fn) { listeners.push(fn); },
    get state() { return state; },
    get pending() { return queue.length + (cur ? 1 : 0); },
    resetCounts: function () { counts = {}; seen = {}; }
  };
  R.Manager = API;
  g.RevivalPresentationManager = API;
})(window);
