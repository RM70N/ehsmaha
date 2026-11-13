/* BATMISH SPECIAL EVENTS — محوّلات الألعاب (Adapter لكل لعبة). كل محوّل يعرّف: الأحداث المدعومة، شروط تشغيلها، تغيير حالة اللعبة،
   إعادة الحالة، ونقاط التعارض. يعمل داخل صفحة الموقع ويقرأ/يكتب متغيرات اللعبة الفعلية (let العامة) — لا حالة مشتركة بين الجولات. */
(function () {
  'use strict';
  var A = (window.BatmishEventAdapters = window.BatmishEventAdapters || {});
  var rnd = function (n) { return Math.floor(Math.random() * n); };
  var pickOne = function (arr) { return arr[rnd(arr.length)]; };

  /* ===================== حرب الدول (cw) ===================== */
  // المتغيرات (index.html): cwGameStatus, cwActiveCountries[{name,uid}], cwTurnUid, cwAlliancePair, cwGoldenCountryEnabled/Name/Saved,
  // cwDoubleElimArmed/Activated/EliminationsThisTurn, cwTurnSeconds, cwParticipants(Map uid→user)
  function cwNick(uid) { try { var u = cwParticipants.get(uid); return u ? (u.nickname || u.uniqueId) : uid; } catch (e) { return uid; } }
  function cwTurnActive() { try { return cwGameStatus === 'active' && !!cwTurnUid && !cwSpinning; } catch (e) { return false; } }
  A.cw = {
    tag: 'cw',
    hook: { start: 'startCountryWarRound', began: function () { try { return cwGameStatus === 'active'; } catch (e) { return false; } } },
    windowSec: function () { return 150; },
    isRoundOver: function () { try { return cwGameStatus !== 'active'; } catch (e) { return true; } },
    conflicts: function () { return false; },
    events: {
      // 1) التحالف السري: يربط دولتين عشوائيتين فلا يقدر أحدهما يقصي الآخر (منطق cwEliminateCountry الأصلي)
      'cw.e1': {
        canRun: function () { try { return cwGameStatus === 'active' && !cwAlliancePair && cwActiveCountries.length >= 3 ? true : { ok: false, reason: cwAlliancePair ? 'alliance_exists' : 'not_enough_countries' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        durationMs: function (c) { return (c.durationSec || 60) * 1000; },
        apply: function () {
          var names = cwActiveCountries.map(function (c) { return c.name; }), a = pickOne(names), b = pickOne(names.filter(function (n) { return n !== a; }));
          var pair = [a, b]; cwAlliancePair = pair;
          return { effect: 'تحالف سري بين ' + a + ' و' + b, sustain: true, pair: pair,
            revert: function () { if (cwAlliancePair === pair) cwAlliancePair = null; } };
        },
        shouldEnd: function (ctx, inst) { try { return !cwAlliancePair || !cwActiveCountries.some(function (c) { return c.name === cwAlliancePair[0]; }) || !cwActiveCountries.some(function (c) { return c.name === cwAlliancePair[1]; }); } catch (e) { return true; } },
        announceText: 'تحالف سري تكوّن بين دولتين!'
      },
      // 2) الدولة الذهبية: دولة عشوائية تنجو من أول محاولة إقصاء (تفعّل آلية cwGolden* الأصلية مؤقتاً حتى لو الإعداد مطفأ)
      'cw.e2': {
        canRun: function () { try { return cwGameStatus === 'active' && cwActiveCountries.length >= 2 && (!cwGoldenCountryName || cwGoldenCountrySaved) ? true : { ok: false, reason: 'golden_active' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        durationMs: function (c) { return (c.durationSec || 90) * 1000; },
        apply: function () {
          var prevEnabled = cwGoldenCountryEnabled, prevName = cwGoldenCountryName, prevSaved = cwGoldenCountrySaved;
          var pick = pickOne(cwActiveCountries).name; cwGoldenCountryEnabled = true; cwGoldenCountryName = pick; cwGoldenCountrySaved = false;
          return { effect: 'الدولة الذهبية: ' + pick + ' تنجو من أول محاولة إقصاء', sustain: true,
            revert: function () { cwGoldenCountryEnabled = prevEnabled; if (cwGoldenCountryName === pick) { cwGoldenCountryName = prevEnabled ? prevName : null; cwGoldenCountrySaved = prevEnabled ? prevSaved : false; } } };
        },
        shouldEnd: function () { try { return cwGoldenCountrySaved === true; } catch (e) { return true; } },
        announceText: 'ظهرت دولة ذهبية محصّنة!'
      },
      // 3) الانقلاب: يُسحب الدور من صاحبه ويُمنح للاعب آخر عشوائي (cwTurnUid) — يعيد عدّاد الدور تلقائياً
      'cw.e3': {
        canRun: function () { try { return cwTurnActive() && cwActiveCountries.length >= 3 ? true : { ok: false, reason: 'no_active_turn' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        eligible: function () { try { return cwActiveCountries.map(function (c) { return c.uid; }).filter(function (u) { return u !== cwTurnUid; }); } catch (e) { return []; } },
        apply: function (ctx, inst) {
          var from = cwTurnUid, others = (inst.eligible || []).filter(function (u) { return u && u !== from; });
          if (!others.length) return { failed: 'no_eligible_player' };
          var to = pickOne(others); cwTurnUid = to; cwDoubleElimArmed = false; cwDoubleElimActivated = false; cwDoubleElimEliminationsThisTurn = 0;
          try { document.getElementById('cw-turn-name').textContent = cwNick(to); var r = document.getElementById('cw-spin-result'); if (r) { r.textContent = '🔄 انقلاب! الدور صار على ' + cwNick(to); r.className = 'cw-spin-result show'; } } catch (e) { /* واجهة */ }
          return { effect: 'انتقل الدور من ' + cwNick(from) + ' إلى ' + cwNick(to), durationMs: 0 };
        },
        announceText: 'انقلاب! الدور انتقل للاعب آخر'
      },
      // 4) التهديد المزدوج: صاحب الدور الحالي يقدر يقصي دولتين (يفعّل cwDoubleElimArmed/Activated الأصلية)
      'cw.e4': {
        canRun: function () { try { return cwTurnActive() && cwDoubleElimEliminationsThisTurn === 0 && !cwDoubleElimActivated && cwActiveCountries.length >= 3 ? true : { ok: false, reason: 'no_active_turn' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () {
          var holder = cwTurnUid; cwDoubleElimArmed = true; cwDoubleElimActivated = true;
          return { effect: 'صاحب الدور ' + cwNick(holder) + ' يقصي دولتين', sustain: true, data: { holder: holder },
            revert: function (status) { if (cwTurnUid !== holder || cwDoubleElimEliminationsThisTurn === 0 || status === 'cancelled') { cwDoubleElimArmed = false; cwDoubleElimActivated = false; } } };
        },
        shouldEnd: function (ctx, inst) { try { return cwTurnUid !== inst.data.holder || cwDoubleElimEliminationsThisTurn >= 2; } catch (e) { return true; } },
        announceText: 'تهديد مزدوج! صاحب الدور يقصي دولتين'
      },
      // 5) الحرب الأخيرة: لما يقل عدد الدول يتقلص وقت الدور ويُفعَّل الإقصاء المزدوج لكل دور
      'cw.e5': {
        condition: function (ctx, c) { try { return cwGameStatus === 'active' && cwActiveCountries.length <= c.whenLeft && cwActiveCountries.length >= 2; } catch (e) { return false; } },
        canRun: function (ctx, c) { try { return cwGameStatus === 'active' && cwActiveCountries.length >= 2 ? true : { ok: false, reason: 'game_unavailable' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst, c) {
          var prevSecs = cwTurnSeconds, prevEnabled = cwDoubleElimEnabled, prevFrom = cwDoubleElimFrom, prevChance = cwDoubleElimChance;
          var secs = Math.max(3, Math.round(c.turnSeconds / (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.5 : 1)));
          cwTurnSeconds = secs; cwDoubleElimEnabled = true; cwDoubleElimFrom = 99; cwDoubleElimChance = 100;
          return { effect: 'الحرب الأخيرة: وقت الدور ' + secs + 'ث + إقصاء مزدوج متاح', sustain: true,
            revert: function () { cwTurnSeconds = prevSecs; cwDoubleElimEnabled = prevEnabled; cwDoubleElimFrom = prevFrom; cwDoubleElimChance = prevChance; } };
        },
        shouldEnd: function () { try { return cwGameStatus !== 'active'; } catch (e) { return true; } },
        announceText: 'الحرب الأخيرة! الوقت يضيق والخطر يتضاعف'
      }
    }
  };

  /* ===================== لعبة التوقيت (tmr) ===================== */
  // المتغيرات: tmrGameStatus ('running'), tmrElapsed, TMR_MAX_SECONDS, tmrGoldenZoneEnabled/Start/End, tmrReverseClock
  function tmrRunning() { try { return tmrGameStatus === 'running'; } catch (e) { return false; } }
  A.tmr = {
    tag: 'tmr',
    hook: { start: 'startTimerClock', began: tmrRunning },
    windowSec: function () { try { return Math.max(6, TMR_MAX_SECONDS - 4); } catch (e) { return 25; } },
    isRoundOver: function () { return !tmrRunning(); },
    events: {
      // 1) الوقت المعكوس: الساعة تعرض الوقت المتبقي بدل المنقضي (الوقت السري ومنطق الفوز يبقيان على الوقت المنقضي)
      'tmr.e1': {
        canRun: function () { return tmrRunning() && !tmrReverseClock ? true : { ok: false, reason: 'not_running' }; },
        durationMs: function () { return 0; },
        apply: function () { tmrReverseClock = true; return { effect: 'الساعة تعدّ تنازلياً (الوقت السري يُحسب من البداية)', sustain: true, revert: function () { tmrReverseClock = false; } }; },
        shouldEnd: function () { return !tmrRunning(); },
        announceText: 'الوقت المعكوس! الساعة تعدّ تنازلياً'
      },
      // 2) المنطقة الذهبية: نافذة 0.3ث بالمستقبل من وقت الراوند؛ الوقوف فيها يفوز فوراً (آلية tmrGoldenZone الأصلية)
      'tmr.e2': {
        canRun: function () { return tmrRunning() && !tmrGoldenZoneEnabled && (TMR_MAX_SECONDS - tmrElapsed) > 3 ? true : { ok: false, reason: tmrGoldenZoneEnabled ? 'golden_active' : 'too_late' }; },
        durationMs: function () { return 0; },
        apply: function () {
          var from = tmrElapsed + 1.5, to = TMR_MAX_SECONDS - 0.5 - TMR_GOLDEN_ZONE_WIDTH;
          if (to <= from) return { failed: 'no_room_for_zone' };
          var start = from + Math.random() * (to - from), pe = tmrGoldenZoneEnabled, ps = tmrGoldenZoneStart, pn = tmrGoldenZoneEnd;
          tmrGoldenZoneEnabled = true; tmrGoldenZoneStart = start; tmrGoldenZoneEnd = start + TMR_GOLDEN_ZONE_WIDTH;
          return { effect: 'منطقة ذهبية من ' + start.toFixed(1) + 'ث', sustain: true, revert: function () { if (tmrGoldenZoneStart === start) { tmrGoldenZoneEnabled = pe; tmrGoldenZoneStart = ps; tmrGoldenZoneEnd = pn; } } };
        },
        shouldEnd: function () { return !tmrRunning(); },
        announceText: 'ظهرت منطقة ذهبية! من يوقف فيها يفوز فوراً'
      },
      // 3) الساعة المخفية: إخفاء الساعة عن الجمهور لمدة محددة ثم إعادتها
      'tmr.e3': {
        canRun: function () { return tmrRunning() ? true : { ok: false, reason: 'not_running' }; },
        durationMs: function (c) { return (c.hideSeconds || 8) * 1000; },
        apply: function () {
          var el = document.getElementById('tmr-clock'); if (!el) return { failed: 'clock_element_missing' };
          el.style.visibility = 'hidden'; return { effect: 'الساعة مخفية', sustain: true, revert: function () { el.style.visibility = ''; } };
        },
        announceText: 'الساعة اختفت! اعتمد على إحساسك'
      }
    }
  };
})();
