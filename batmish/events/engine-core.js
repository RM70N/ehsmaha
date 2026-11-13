/* BATMISH SPECIAL EVENTS — نواة المحرك (بدون DOM): الجدولة المركزية، حل التعارض، دورة حياة Event Instance، منع التكرار.
   تعمل بالمتصفح (window.BatmishEventsCore) وبـNode للاختبارات (module.exports). الحالة كلها داخل كائن المحرك/الجولة — لا متغيرات عامة. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.BatmishEventsCore = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var TICK_MS = 500, MAX_DEFER = 6, DEFER_MS = 3000;
  var PRIORITY = { final: 4, milestone: 3, scheduled: 2, random: 1, manual: 0 };
  var clone = function (o) { return JSON.parse(JSON.stringify(o)); };

  function createEngine(deps) {
    var now = deps.now || Date.now, rng = deps.rng || Math.random;
    var presenter = deps.presenter || { start: function () {}, end: function () {}, warn: function () {} };
    var record = deps.record || function () {};
    var log = deps.log || function () {};
    var catalog = { games: {}, byId: {}, intensityFactor: { low: 0.5, normal: 1, high: 1.5, extreme: 2 } };
    var state = { rev: 0, games: {} };          // إعدادات الستريمر من الخادم
    var adapters = {};                           // tag -> adapter
    var rounds = {};                             // tag -> Round (جولة نشطة واحدة لكل لعبة)
    var stats = { total: 0, completed: 0, cancelled: 0, failed: 0, last: null, byGame: {} };
    var timer = null, seqN = 0;

    function setCatalog(c) {
      catalog.games = {}; catalog.byId = {};
      (c.games || []).forEach(function (g) { catalog.games[g.tag] = g; (g.events || []).forEach(function (e) { e.tag = e.tag || g.tag; catalog.byId[e.id] = e; }); });
      if (c.intensityFactor) catalog.intensityFactor = c.intensityFactor;
    }
    function setState(s) { state = s || { rev: 0, games: {} }; }
    function registerAdapter(a) { adapters[a.tag] = a; }

    // قيمة إعداد (تغلب الافتراضي بقيمة الستريمر). الافتراضيات من الكتالوج (الحقول المشتركة + الخاصة)
    var COMMON_DEFAULTS = { enabled: false, probability: 30, maxPerRound: 1, fromSec: 5, toSec: 0, announce: true, sfx: true, vfx: true };
    function eventCfg(tag, id, snap) {
      var def = catalog.byId[id], cfg = Object.assign({}, COMMON_DEFAULTS);
      if (def) (def.extra || []).forEach(function (f) { cfg[f.key] = f.default; });
      var saved = ((snap || state).games[tag] || { events: {} }).events || {};
      return Object.assign(cfg, saved[id] || {});
    }
    function gameCfg(tag, snap) { var g = (snap || state).games[tag] || {}; return { mode: g.mode || 'random', intensity: g.intensity || 'normal', minGapSec: g.minGapSec != null ? g.minGapSec : 20, maxPerRound: g.maxPerRound != null ? g.maxPerRound : 3 }; }

    // ---------- الجولة: لقطة إعدادات مستقلة + خطة جدولة
    function beginRound(tag, info) {
      if (rounds[tag]) endRound(tag, 'round_replaced');
      var ad = adapters[tag]; if (!ad) return null;
      var snap = clone(state), g = gameCfg(tag, snap);
      var r = { tag: tag, roundId: String((info && info.roundId) || (tag + '-' + now().toString(36) + '-' + (++seqN))), startedAt: now(), snap: snap, cfg: g, ctx: (info && info.ctx) || {}, active: [], fired: {}, firedKeys: {}, total: 0, lastEndAt: 0, plan: [], ended: false, windowSec: (info && info.windowSec) || (ad.windowSec ? ad.windowSec() : 120) };
      var evs = (catalog.games[tag] || { events: [] }).events.filter(function (e) { return e.implemented && ad.events[e.id] && eventCfg(tag, e.id, snap).enabled; });
      evs.forEach(function (e) {
        var c = eventCfg(tag, e.id, snap), end = c.toSec > 0 ? c.toSec : r.windowSec;
        if (e.type === 'manual' || g.mode === 'manual') return;
        if (e.type === 'final' || e.type === 'milestone') { r.plan.push({ id: e.id, kind: 'condition', defers: 0, n: 0 }); return; }
        if (g.mode === 'scheduled') { r.plan.push({ id: e.id, kind: 'time', at: now() + (Math.min(c.fromSec, end) * 1000), defers: 0, n: 0 }); return; }
        if (g.mode === 'hybrid' && e.type === 'scheduled') { r.plan.push({ id: e.id, kind: 'time', at: now() + (Math.min(c.fromSec, end) * 1000), defers: 0, n: 0 }); return; }
        // random: كل ظهور مسموح (حتى maxPerRound) يُسحب له احتمال مرة واحدة بالراوند + توقيت عشوائي ضمن النافذة
        for (var i = 0; i < c.maxPerRound; i++) {
          if (rng() * 100 < c.probability) r.plan.push({ id: e.id, kind: 'time', at: now() + (c.fromSec + rng() * Math.max(0, end - c.fromSec)) * 1000, defers: 0, n: i });
        }
      });
      r.plan.sort(function (a, b) { return (a.at || 1e18) - (b.at || 1e18); });
      rounds[tag] = r; ensureTimer(); return r;
    }

    function endRound(tag, reason) {
      var r = rounds[tag]; if (!r || r.ended) return; r.ended = true;
      r.active.slice().forEach(function (inst) { finish(r, inst, 'cancelled', reason || 'round_end'); });
      r.plan.length = 0; delete rounds[tag]; if (!Object.keys(rounds).length) stopTimer();
      if (ad(tag) && ad(tag).onRoundEnd) { try { ad(tag).onRoundEnd(r); } catch (e) { log('warn', 'onRoundEnd', e); } }
    }
    function ad(tag) { return adapters[tag]; }
    function ensureTimer() { if (!timer) timer = (deps.setInterval || setInterval)(tick, TICK_MS); }
    function stopTimer() { if (timer) { (deps.clearInterval || clearInterval)(timer); timer = null; } }

    // ---------- التعارض: نفس المجموعة لا تعمل معاً؛ ونقاط التعارض الصريحة من الـAdapter
    function conflict(r, def) {
      var a = ad(r.tag), g = def.group;
      for (var i = 0; i < r.active.length; i++) {
        var o = r.active[i]; if (o.def.group && o.def.group === g) return o.def.id;
        if (a && a.conflicts && a.conflicts(def.id, o.def.id)) return o.def.id;
      }
      return null;
    }

    // ---------- تنفيذ حدث (12 خطوة) — يرجّع Instance أو null (مع سبب مسجَّل عند الفشل/الإلغاء)
    function fire(r, planItem, opt) {
      var id = planItem.id, def = catalog.byId[id], a = ad(r.tag); opt = opt || {};
      var c = eventCfg(r.tag, id, r.snap), n = ++r.total, key = r.roundId + ':' + id + ':' + planItem.n + (opt.manual ? ':m' + n : '');
      if (r.firedKeys[key]) return null;                                              // منع التكرار (idempotency)
      function skip(status, reason) { r.firedKeys[key] = 1; emitRow(r, { key: key, def: def, status: status, reason: reason, startedAt: now(), effect: '' }); return null; }
      if (!def || !def.implemented) return skip('failed', 'event_not_implemented');
      if (!c.enabled && !opt.manual) return skip('cancelled', 'disabled');
      if (!a || !a.events[id]) return skip('failed', 'adapter_missing');
      if ((r.fired[id] || 0) >= c.maxPerRound && !opt.manual) { r.total--; return null; }
      if (r.total - 1 >= r.cfg.maxPerRound && !opt.manual) { r.total--; return skip('cancelled', 'round_limit'); }
      var impl = a.events[id], can;
      try { can = impl.canRun(r.ctx, c, r); } catch (e) { return skip('failed', 'canRun_error:' + (e && e.message)); }
      if (can !== true && !(can && can.ok)) { r.total--; return { retry: true, reason: (can && can.reason) || 'conditions' }; }   // شروط غير جاهزة بعد (تُعاد المحاولة)
      var cf = conflict(r, def); if (cf) { r.total--; return { retry: true, reason: 'conflict:' + cf }; }
      var eligible = impl.eligible ? impl.eligible(r.ctx, c, r) : null;
      var inst = { id: key, key: key, def: def, cfg: c, eventId: id, tag: r.tag, startedAt: now(), n: planItem.n, factor: catalog.intensityFactor[r.cfg.intensity] || 1, intensity: r.cfg.intensity, eligible: eligible, endAt: 0, effect: '', revert: null, manual: !!opt.manual, status: 'active' };
      var res; try { res = impl.apply(r.ctx, inst, c, r) || {}; } catch (e) { r.firedKeys[key] = 1; emitRow(r, { key: key, def: def, status: 'failed', reason: 'apply_error:' + (e && e.message), startedAt: inst.startedAt, effect: '' }); return null; }
      if (res.failed) { r.firedKeys[key] = 1; emitRow(r, { key: key, def: def, status: 'failed', reason: String(res.failed), startedAt: inst.startedAt, effect: '' }); return null; }
      r.firedKeys[key] = 1; r.fired[id] = (r.fired[id] || 0) + 1;
      inst.effect = String(res.effect || ''); inst.revert = res.revert || null; inst.data = res.data || {};
      var dur = res.durationMs != null ? res.durationMs : (impl.durationMs ? impl.durationMs(c, inst) : (def.durationSec ? def.durationSec * 1000 : 0));
      inst.endAt = dur > 0 ? now() + dur : 0;
      r.active.push(inst);
      try { presenter.start(inst, def, c); } catch (e) { log('warn', 'presenter.start', e); }
      if (!inst.endAt && !res.sustain) finish(r, inst, 'completed');                  // حدث لحظي: يكتمل فوراً
      return inst;
    }
    function finish(r, inst, status, reason) {
      var i = r.active.indexOf(inst); if (i < 0) return; r.active.splice(i, 1);
      try { if (inst.revert) inst.revert(status, reason); } catch (e) { status = 'failed'; reason = 'revert_error:' + (e && e.message); }
      inst.status = status; r.lastEndAt = now();
      try { presenter.end(inst, inst.def, status); } catch (e) { log('warn', 'presenter.end', e); }
      emitRow(r, { key: inst.key, def: inst.def, status: status, reason: reason || '', startedAt: inst.startedAt, effect: inst.effect, durationMs: now() - inst.startedAt });
    }
    function emitRow(r, x) {
      var row = { key: x.key, tag: r.tag, eventId: x.def ? x.def.id : '', status: x.status, reason: x.reason || '', effect: x.effect || '', roundId: r.roundId, mode: r.cfg.mode, startedAt: x.startedAt, durationMs: x.durationMs || 0 };
      stats.total++; stats[x.status] = (stats[x.status] || 0) + 1; stats.last = { tag: r.tag, eventId: row.eventId, status: x.status, at: now() };
      var gs = stats.byGame[r.tag] = stats.byGame[r.tag] || { count: 0, last: null }; gs.count++; gs.last = row.eventId;
      try { record(row); } catch (e) { log('warn', 'record', e); }
    }

    // ---------- المؤقت المركزي الوحيد
    function tick() {
      var t = now();
      Object.keys(rounds).forEach(function (tag) {
        var r = rounds[tag]; if (!r || r.ended) return; var a = ad(tag);
        if (a && a.isRoundOver && a.isRoundOver(r.ctx)) { endRound(tag, 'round_over'); return; }
        r.active.slice().forEach(function (inst) {
          if (a && a.events[inst.eventId].shouldEnd && a.events[inst.eventId].shouldEnd(r.ctx, inst)) { finish(r, inst, 'completed'); return; }
          if (inst.endAt && t >= inst.endAt) finish(r, inst, 'completed');
          else if (inst.endAt && inst.cfg.announce && !inst.warned && inst.endAt - t <= 3000 && inst.endAt - inst.startedAt > 6000) { inst.warned = true; try { presenter.warn(inst, inst.def); } catch (e) { /* تجاهل */ } }
        });
        var minGapMs = r.cfg.minGapSec * 1000;
        for (var i = 0; i < r.plan.length; i++) {
          var p = r.plan[i], c = eventCfg(tag, p.id, r.snap), def = catalog.byId[p.id];
          var elapsed = (t - r.startedAt) / 1000;
          if (p.kind === 'time' && t < p.at) continue;
          if (c.toSec > 0 && elapsed > c.toSec && p.kind === 'time') { r.plan.splice(i--, 1); r.firedKeys[r.roundId + ':' + p.id + ':' + p.n] = 1; emitRow(r, { key: r.roundId + ':' + p.id + ':' + p.n + ':w', def: def, status: 'cancelled', reason: 'window_closed', startedAt: t }); continue; }
          if (p.kind === 'condition') {
            if (elapsed < c.fromSec) continue; var imp = a.events[p.id];
            if (!imp.condition || !imp.condition(r.ctx, c, r)) continue;
            if (!p.rolled) { p.rolled = true; if (rng() * 100 >= c.probability) { r.plan.splice(i--, 1); continue; } }   // سحب الاحتمال مرة واحدة عند تحقق الشرط
          }
          if (r.lastEndAt && t - r.lastEndAt < minGapMs && r.active.length === 0) continue;       // فاصل بين الأحداث
          if (r.active.length && !p.allowParallel && conflict(r, def)) { if (++p.defers > MAX_DEFER) { r.plan.splice(i--, 1); r.firedKeys[r.roundId + ':' + p.id + ':' + p.n] = 1; emitRow(r, { key: r.roundId + ':' + p.id + ':' + p.n + ':c', def: def, status: 'cancelled', reason: 'conflict', startedAt: t }); } else p.at = t + DEFER_MS; continue; }
          var res = fire(r, p);
          if (res && res.retry) { if (++p.defers > MAX_DEFER) { r.plan.splice(i--, 1); r.firedKeys[r.roundId + ':' + p.id + ':' + p.n] = 1; emitRow(r, { key: r.roundId + ':' + p.id + ':' + p.n + ':x', def: def, status: 'cancelled', reason: res.reason, startedAt: t }); } else { p.at = t + DEFER_MS; } continue; }
          r.plan.splice(i--, 1);
        }
      });
    }

    // تشغيل يدوي (Manual) أثناء جولة نشطة — يمر بنفس خط التنفيذ والتعارض
    function trigger(tag, eventId, opt) {
      var r = rounds[tag]; if (!r) return { ok: false, reason: 'no_active_round' };
      var def = catalog.byId[eventId]; if (!def || def.tag !== tag) return { ok: false, reason: 'unknown_event' };
      if (!def.implemented) return { ok: false, reason: 'event_not_implemented' };
      var res = fire(r, { id: eventId, n: 0 }, { manual: true });
      if (res && res.retry) return { ok: false, reason: res.reason };
      return res ? { ok: true, instance: res } : { ok: false, reason: 'failed' };
    }

    function cancelEvent(tag, instanceId) { var r = rounds[tag]; if (!r) return false; var i = r.active.filter(function (x) { return x.id === instanceId; })[0]; if (!i) return false; finish(r, i, 'cancelled', 'manual_cancel'); return true; }
    function activeInfo() { var out = []; Object.keys(rounds).forEach(function (tag) { rounds[tag].active.forEach(function (i) { out.push({ tag: tag, eventId: i.eventId, id: i.id, endAt: i.endAt }); }); }); return out; }
    function status() { return { rounds: Object.keys(rounds), active: activeInfo(), stats: clone(stats) }; }
    function destroy() { Object.keys(rounds).forEach(function (t) { endRound(t, 'destroy'); }); stopTimer(); }

    return { setCatalog: setCatalog, setState: setState, registerAdapter: registerAdapter, beginRound: beginRound, endRound: endRound, trigger: trigger, cancelEvent: cancelEvent, tick: tick, status: status, destroy: destroy, eventCfg: eventCfg, gameCfg: gameCfg, _rounds: rounds, _adapters: adapters, hasAdapter: function (t) { return !!adapters[t]; } };
  }
  return { createEngine: createEngine, PRIORITY: PRIORITY };
});
