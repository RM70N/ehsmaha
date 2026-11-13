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

  /* ===================== سرقة التاج (cs) ===================== */
  // المتغيرات: csGameStatus, csHolderUid, csStartTime (performance.now), CS_HOLD_DURATION, csImmunityEnabled/csImmuneUntil, csStealAttempts(Map)
  function csActive() { try { return csGameStatus === 'active'; } catch (e) { return false; } }
  function csHolding() { try { return csActive() && !!csHolderUid && csStartTime != null; } catch (e) { return false; } }
  A.cs = {
    tag: 'cs',
    hook: { start: 'startCrownStealRound', began: csActive },
    windowSec: function () { return 60; },
    isRoundOver: function () { return !csActive(); },
    events: {
      // 1) التاج الساخن: تقصير مدة الحمل المطلوبة للفوز مؤقتاً (يتدرّج بقوة الحدث)
      'cs.e1': {
        canRun: function () { return csHolding() ? true : { ok: false, reason: 'no_holder' }; },
        durationMs: function (c) { return (c.durationSec || 15) * 1000; },
        apply: function (ctx, inst) {
          var prev = CS_HOLD_DURATION, ratio = Math.min(0.85, Math.max(0.25, 0.5 / inst.factor)), nv = Math.max(2, Math.round(prev * ratio * 10) / 10);
          CS_HOLD_DURATION = nv; return { effect: 'مدة الحمل ' + prev + 'ث → ' + nv + 'ث', sustain: true, revert: function () { if (CS_HOLD_DURATION === nv) CS_HOLD_DURATION = prev; } };
        },
        announceText: 'التاج ساخن! مدة الحمل تقصّرت'
      },
      // 2) الحماية الملكية: حامل التاج محمي من السرقة مدة محددة (آلية csImmune الأصلية)
      'cs.e2': {
        canRun: function () { return csHolding() ? true : { ok: false, reason: 'no_holder' }; },
        durationMs: function (c) { return (c.durationSec || 6) * 1000; },
        apply: function (ctx, inst, c) {
          var prevEn = csImmunityEnabled, until = performance.now() + (c.durationSec || 6) * 1000; csImmunityEnabled = true; csImmuneUntil = until;
          return { effect: 'حماية ملكية ' + (c.durationSec || 6) + 'ث لحامل التاج', sustain: true, revert: function () { csImmunityEnabled = prevEn; if (csImmuneUntil === until) csImmuneUntil = 0; } };
        },
        announceText: 'حماية ملكية! حامل التاج لا يُسرق منه'
      },
      // 4) المطاردة: تُمنح كل اللاعبين محاولات سرقة جديدة (تصفير عدّاد المحاولات)
      'cs.e4': {
        canRun: function () { return csHolding() ? true : { ok: false, reason: 'no_holder' }; },
        eligible: function () { try { return Array.from(csParticipants.keys()); } catch (e) { return []; } },
        apply: function () { var n = csStealAttempts.size; csStealAttempts.clear(); return { effect: 'أُعيد منح محاولات السرقة (' + n + ' لاعب استنفد محاولاته)' }; },
        announceText: 'المطاردة! الجميع يملك محاولات سرقة جديدة'
      },
      // 5) العرش الأخير: لما يقارب الملك الفوز يُمدَّد الوقت المطلوب ليأخذ المنافسون فرصة أخيرة
      'cs.e5': {
        condition: function (ctx, c) { try { return csHolding() && ((performance.now() - csStartTime) / 1000) >= CS_HOLD_DURATION * (c.afterPercent / 100); } catch (e) { return false; } },
        canRun: function () { return csHolding() ? true : { ok: false, reason: 'no_holder' }; },
        apply: function (ctx, inst) {
          var add = Math.round(2 * inst.factor * 10) / 10; CS_HOLD_DURATION += add;
          return { effect: 'مُدِّدت مدة الحمل ' + add + 'ث — فرصة أخيرة للمنافسين', sustain: true, revert: function () { CS_HOLD_DURATION = Math.max(2, CS_HOLD_DURATION - add); } };
        },
        shouldEnd: function () { return !csActive(); },
        announceText: 'العرش الأخير! فرصة أخيرة لسرقة التاج'
      }
    }
  };

  /* ===================== أوجد الكلمة (main) ===================== */
  // المتغيرات: gameStatus, targetWord, mainSpeedBonusEnabled، والدالة mainRevealLetterHint()
  function mainActive() { try { return gameStatus === 'active'; } catch (e) { return false; } }
  A.main = {
    tag: 'main',
    hook: { start: 'startRound', began: mainActive },
    windowSec: function () { return 60; },
    isRoundOver: function () { return !mainActive(); },
    events: {
      // 1) الحرف الذهبي: يكشف موضع حرف من الكلمة السرية فوراً (آلية التلميح الأصلية)
      'main.e1': {
        canRun: function () { try { return mainActive() && String(targetWord || '').length >= 2 ? true : { ok: false, reason: 'no_secret_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { mainRevealLetterHint(); return { effect: 'كُشف موضع حرف من الكلمة السرية' }; },
        announceText: 'الحرف الذهبي! كُشف موضع حرف من الكلمة'
      },
      // 4) سباق أول إجابة: نقطتان لأول تخمين مضبوط من أول محاولة (آلية mainSpeedBonus الأصلية) طوال الراوند
      'main.e4': {
        canRun: function () { return mainActive() && !mainSpeedBonusEnabled ? true : { ok: false, reason: mainActive() ? 'bonus_already_on' : 'not_active' }; },
        apply: function () { var prev = mainSpeedBonusEnabled; mainSpeedBonusEnabled = true; return { effect: 'مكافأة أول إجابة مفعّلة (نقطتان)', sustain: true, revert: function () { mainSpeedBonusEnabled = prev; } }; },
        shouldEnd: function () { return !mainActive(); },
        announceText: 'سباق أول إجابة! أول تخمين مضبوط ينال نقطتين'
      }
    }
  };

  /* ===================== آخر حرف (ll) ===================== */
  function llActive() { try { return llGameStatus === 'active'; } catch (e) { return false; } }
  A.ll = {
    tag: 'll',
    hook: { start: 'startLastLetterRound', began: llActive },
    windowSec: function () { return 90; },
    isRoundOver: function () { return !llActive(); },
    events: {
      // 2) السرعة القصوى: يقصّر وقت دور اللاعب (حالياً وللأدوار القادمة) ثم يعيده
      'll.e2': {
        canRun: function () { return llActive() ? true : { ok: false, reason: 'not_active' }; },
        durationMs: function (c) { return (c.durationSec || 30) * 1000; },
        apply: function (ctx, inst) {
          var prev = LL_TURN_SECONDS, nv = Math.max(3, Math.round(prev * Math.min(0.85, Math.max(0.25, 0.5 / inst.factor))));
          LL_TURN_SECONDS = nv; try { if (llSecondsLeft > nv) llSecondsLeft = nv; } catch (e) { /* الدور لم يبدأ */ }
          return { effect: 'وقت الدور ' + prev + 'ث → ' + nv + 'ث', sustain: true, revert: function () { if (LL_TURN_SECONDS === nv) LL_TURN_SECONDS = prev; } };
        },
        announceText: 'السرعة القصوى! وقت الدور يتقلص'
      }
    }
  };

  /* ===================== دائرة الإقصاء (rou) ===================== */
  function rouActive() { try { return rouGameStatus === 'active'; } catch (e) { return false; } }
  A.rou = {
    tag: 'rou',
    hook: { start: 'startRouletteRound', began: rouActive },
    windowSec: function () { return 90; },
    isRoundOver: function () { return !rouActive(); },
    events: {
      // 1) الدوران المجنون: يغيّر مدة دوران العجلة (تُقرأ عند كل لفة)
      'rou.e1': {
        canRun: function () { return rouActive() ? true : { ok: false, reason: 'not_active' }; },
        durationMs: function (c) { return (c.durationSec || 45) * 1000; },
        apply: function (ctx, inst, c) {
          var a = ROU_SPIN_MIN_MS, b = ROU_SPIN_RANDOM_MS, k = (c.speedPercent || 40) / 100;
          ROU_SPIN_MIN_MS = Math.max(600, Math.round(a * k)); ROU_SPIN_RANDOM_MS = Math.max(200, Math.round(b * k));
          var na = ROU_SPIN_MIN_MS, nb = ROU_SPIN_RANDOM_MS;
          return { effect: 'مدة الدوران ×' + k.toFixed(2), sustain: true, revert: function () { if (ROU_SPIN_MIN_MS === na) ROU_SPIN_MIN_MS = a; if (ROU_SPIN_RANDOM_MS === nb) ROU_SPIN_RANDOM_MS = b; } };
        },
        announceText: 'الدوران المجنون! سرعة العجلة تغيّرت'
      },
      // 2) الإقصاء المزدوج: اللفة القادمة يُقصى فيها لاعبان (آلية rouDoubleElimArmed الأصلية — مرة واحدة)
      'rou.e2': {
        canRun: function () { try { return rouActive() && rouActivePlayers.length >= 3 && !rouForceDoubleElim ? true : { ok: false, reason: 'not_enough_players' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        durationMs: function () { return 0; },
        apply: function () { rouForceDoubleElim = true; return { effect: 'اللفة القادمة: إقصاء لاعبين', sustain: true, revert: function () { rouForceDoubleElim = false; } }; },
        shouldEnd: function () { return !rouForceDoubleElim; },      // يُستهلك عند اللفة التالية
        announceText: 'إقصاء مزدوج! اللفة القادمة تُقصي لاعبين'
      },
      // 3) منطقة النجاة: لاعب عشوائي يحصل على حصانة من أول محاولة إقصاء (آلية rouImmune الأصلية)
      'rou.e3': {
        canRun: function () { try { return rouActive() && rouActivePlayers.length >= 2 && (!rouImmuneName || rouImmunityUsed) ? true : { ok: false, reason: 'immunity_active' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        eligible: function () { try { return rouActivePlayers.slice(); } catch (e) { return []; } },
        apply: function (ctx, inst) {
          var pick = pickOne(inst.eligible || []); if (!pick) return { failed: 'no_eligible_player' };
          var pe = rouImmunityEnabled, pn = rouImmuneName, pu = rouImmunityUsed; rouImmunityEnabled = true; rouImmuneName = pick; rouImmunityUsed = false;
          return { effect: 'حصانة مؤقتة للاعب ' + pick, sustain: true, revert: function () { rouImmunityEnabled = pe; if (rouImmuneName === pick) { rouImmuneName = pe ? pn : null; rouImmunityUsed = pe ? pu : false; } } };
        },
        shouldEnd: function () { try { return rouImmunityUsed === true; } catch (e) { return true; } },
        announceText: 'منطقة النجاة! لاعب محصّن من أول إقصاء'
      },
      // 5) اللفة الأخيرة: عند بقاء 3 لاعبين تُبطأ العجلة وتُقصي اللفة التالية لاعبين
      'rou.e5': {
        condition: function () { try { return rouActive() && rouActivePlayers.length === 3; } catch (e) { return false; } },
        canRun: function () { return rouActive() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst, c) {
          var a = ROU_SPIN_MIN_MS, b = ROU_SPIN_RANDOM_MS, k = Math.min(4, (c.slowPercent || 250) / 100 * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.2 : 1));
          ROU_SPIN_MIN_MS = Math.round(a * k); ROU_SPIN_RANDOM_MS = Math.round(b * k); rouForceDoubleElim = true;
          var na = ROU_SPIN_MIN_MS, nb = ROU_SPIN_RANDOM_MS;
          return { effect: 'اللفة الأخيرة: دوران أبطأ ×' + k.toFixed(1) + ' + إقصاء مزدوج', sustain: true, revert: function () { if (ROU_SPIN_MIN_MS === na) ROU_SPIN_MIN_MS = a; if (ROU_SPIN_RANDOM_MS === nb) ROU_SPIN_RANDOM_MS = b; rouForceDoubleElim = false; } };
        },
        shouldEnd: function () { return !rouActive(); },
        announceText: 'اللفة الأخيرة! ثلاثة لاعبين فقط'
      }
    }
  };

  /* ===================== من أنا؟ (wai) ===================== */
  function waiActive() { try { return waiGameStatus === 'active'; } catch (e) { return false; } }
  function waiBox() { return { box: document.getElementById('wai-hint2-box'), disp: document.getElementById('wai-hint2-display') }; }
  function waiMasked(n) { var ch = Array.from(String(waiCharName || '')), out = []; for (var i = 0; i < ch.length; i++) out.push(ch[i] === ' ' ? ' ' : (i < n ? ch[i] : '＿')); return out.join(' '); }
  function waiShow(text) { var b = waiBox(); if (!b.box) return null; var prev = { shown: b.box.style.display, text: b.disp.textContent }; b.disp.textContent = text; b.box.style.display = 'block'; return prev; }
  function waiRestore(prev, mine) { var b = waiBox(); if (!b.box || !prev) return; if (b.disp.textContent === mine) { b.disp.textContent = prev.text; b.box.style.display = prev.shown || 'none'; } }
  A.wai = {
    tag: 'wai', hook: { start: 'startWAIRound', began: waiActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !waiActive(); },
    events: {
      // 1) التلميح المشفر: يكشف شكل الاسم (الحرف الأول وعدد الحروف) بدون الكشف الكامل
      'wai.e1': {
        canRun: function () { try { return waiActive() && Array.from(String(waiCharName || '')).length >= 2 ? true : { ok: false, reason: 'no_secret_name' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var txt = 'الاسم: ' + waiMasked(1), prev = waiShow(txt); return { effect: 'كُشف شكل الاسم (حرفه الأول وعدد حروفه)', sustain: true, revert: function () { waiRestore(prev, txt); } }; },
        shouldEnd: function () { return !waiActive(); }, announceText: 'تلميح مشفّر! ظهر شكل الاسم'
      },
      // 2) كشف تدريجي: حرف جديد من الاسم كل فترة حتى يبقى الأخير
      'wai.e2': {
        canRun: function () { try { return waiActive() && Array.from(String(waiCharName || '')).length >= 3 ? true : { ok: false, reason: 'no_secret_name' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { inst.data.k = 1; inst.data.last = Date.now(); var txt = 'الاسم: ' + waiMasked(1); inst.data.txt = txt; var prev = waiShow(txt); return { effect: 'كشف تدريجي لحروف الاسم', sustain: true, data: inst.data, revert: function () { waiRestore(prev, inst.data.txt); } }; },
        onTick: function (ctx, inst, t) { var every = (inst.cfg.intervalSec || 8) * 1000, n = Array.from(String(waiCharName || '')).length; if (inst.data.k < n - 1 && t - inst.data.last >= every) { inst.data.k++; inst.data.last = t; var cur = 'الاسم: ' + waiMasked(inst.data.k), b = waiBox(); if (b.disp && b.disp.textContent === inst.data.txt) { b.disp.textContent = cur; } inst.data.txt = cur; inst.effect = 'كُشف ' + inst.data.k + ' حروف من الاسم'; } },
        shouldEnd: function () { return !waiActive(); }, announceText: 'كشف تدريجي! حروف الاسم تظهر تباعاً'
      },
      // 3) تلميح الجمهور: يُظهر تلميح الستريمر الإضافي فوراً بدل انتظار الفشل
      'wai.e3': {
        canRun: function () { try { return waiActive() && !waiHint2Revealed && String(waiHint2 || '').length > 0 ? true : { ok: false, reason: 'no_extra_hint' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var txt = waiHint2, prev = waiShow(txt); waiHint2Revealed = true; return { effect: 'ظهر تلميح الستريمر للجمهور', sustain: true, revert: function () { waiRestore(prev, txt); waiHint2Revealed = false; } }; },
        shouldEnd: function () { return !waiActive(); }, announceText: 'تلميح للجمهور! ظهر تلميح إضافي'
      }
    }
  };

  /* ===================== عكس الكلمة (rw) ===================== */
  function rwActive() { try { return rwGameStatus === 'active'; } catch (e) { return false; } }
  A.rw = {
    tag: 'rw', hook: { start: 'startRWRound', began: rwActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !rwActive(); },
    events: {
      // 2) حروف مشتتة: تُعرض الكلمة مبعثرة بدل الأصلية (يصعّب إيجاد العكس الصحيح)
      'rw.e2': {
        canRun: function () { try { return rwActive() && String(rwWord || '').length >= 3 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var el = document.getElementById('rw-word-display'), prev = el.textContent, sc = scrambleArabicWord(rwWord); el.textContent = sc; return { effect: 'عُرضت الكلمة مبعثرة', sustain: true, revert: function () { if (el.textContent === sc) el.textContent = prev; } }; },
        shouldEnd: function () { return !rwActive(); }, announceText: 'حروف مشتتة! الكلمة تبعثرت'
      },
      // 3) الوقت الذهبي: نافذة مكافأة لأول إجابة مضبوطة (rwSpeedBonus الأصلية)
      'rw.e3': {
        canRun: function () { return rwActive() && !rwSpeedBonusEnabled ? true : { ok: false, reason: rwActive() ? 'bonus_already_on' : 'not_active' }; },
        durationMs: function (c) { return (c.durationSec || 20) * 1000; },
        apply: function () { var prev = rwSpeedBonusEnabled; rwSpeedBonusEnabled = true; return { effect: 'مكافأة السرعة مفعّلة', sustain: true, revert: function () { rwSpeedBonusEnabled = prev; } }; },
        announceText: 'الوقت الذهبي! أسرع إجابة تنال مكافأة'
      },
      // 5) التحدي السري: لاعب عشوائي يحصل على محاولة إضافية (rwLucky الأصلية)
      'rw.e5': {
        canRun: function () { try { return rwActive() && rwParticipants.size > 0 && !rwLuckyUid ? true : { ok: false, reason: rwLuckyUid ? 'lucky_exists' : 'no_players' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        eligible: function () { try { return Array.from(rwParticipants.keys()); } catch (e) { return []; } },
        apply: function (ctx, inst) { var uid = pickOne(inst.eligible || []); if (!uid) return { failed: 'no_eligible_player' }; var pe = rwLuckyEnabled, pu = rwLuckyUid; rwLuckyEnabled = true; rwLuckyUid = uid; return { effect: 'لاعب محظوظ سري يحصل على محاولة إضافية', sustain: true, revert: function () { rwLuckyEnabled = pe; if (rwLuckyUid === uid) rwLuckyUid = pu; } }; },
        shouldEnd: function () { return !rwActive(); }, announceText: 'تحدٍ سري! لاعب واحد نال محاولة إضافية'
      }
    }
  };

  /* ===================== ترتيب الحروف (lsc) ===================== */
  function lscActive() { try { return lscGameStatus === 'active'; } catch (e) { return false; } }
  var AR_LETTERS = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي');
  A.lsc = {
    tag: 'lsc', hook: { start: 'startLSCRound', began: lscActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !lscActive(); },
    events: {
      // 1) حرف مخفي: أحد الحروف المبعثرة يُستبدل بعلامة استفهام
      'lsc.e1': {
        canRun: function () { try { return lscActive() && String(lscScrambled || '').length >= 3 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var el = document.getElementById('lsc-word-display'), prev = el.textContent, ch = Array.from(prev), idxs = []; ch.forEach(function (c, i) { if (c.trim()) idxs.push(i); }); ch[pickOne(idxs)] = '؟'; var now = ch.join(''); el.textContent = now; return { effect: 'أُخفي حرف من الحروف المبعثرة', sustain: true, revert: function () { if (el.textContent === now) el.textContent = prev; } }; },
        shouldEnd: function () { return !lscActive(); }, announceText: 'حرف مخفي! أحد الحروف اختفى'
      },
      // 2) التلميح المتأخر: يكشف موضع حرف من الكلمة الصحيحة (آلية التلميح الأصلية)
      'lsc.e2': {
        canRun: function () { try { return lscActive() && String(lscWord || '').length >= 2 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var box = document.getElementById('lsc-hint-box'), prev = box.style.display; lscRevealLetterHint(); return { effect: 'ظهر تلميح متأخر لموضع حرف', sustain: true, revert: function () { box.style.display = prev || 'none'; } }; },
        shouldEnd: function () { return !lscActive(); }, announceText: 'التلميح المتأخر! كُشف موضع حرف'
      },
      // 4) سباق السرعة: مكافأة لأسرع إجابة (lscSpeedBonus الأصلية)
      'lsc.e4': {
        canRun: function () { return lscActive() && !lscSpeedBonusEnabled ? true : { ok: false, reason: lscActive() ? 'bonus_already_on' : 'not_active' }; },
        apply: function () { var prev = lscSpeedBonusEnabled; lscSpeedBonusEnabled = true; return { effect: 'مكافأة السرعة مفعّلة', sustain: true, revert: function () { lscSpeedBonusEnabled = prev; } }; },
        shouldEnd: function () { return !lscActive(); }, announceText: 'سباق السرعة! أسرع إجابة تنال مكافأة'
      },
      // 5) الحرف الإضافي: حرف دخيل ليس من الكلمة يُضاف للحروف المعروضة
      'lsc.e5': {
        canRun: function () { try { return lscActive() && String(lscScrambled || '').length >= 3 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var el = document.getElementById('lsc-word-display'), prev = el.textContent, word = Array.from(String(lscWord)), pool = AR_LETTERS.filter(function (l) { return word.indexOf(l) < 0; }), extra = pickOne(pool), ch = Array.from(prev); ch.splice(rnd(ch.length + 1), 0, extra); var now = ch.join(''); el.textContent = now; return { effect: 'أُضيف حرف دخيل «' + extra + '»', sustain: true, revert: function () { if (el.textContent === now) el.textContent = prev; } }; },
        shouldEnd: function () { return !lscActive(); }, announceText: 'حرف إضافي! دخيل بين الحروف'
      }
    }
  };

  /* ===================== خمن الصورة (ig) ===================== */
  function igActive() { try { return igGameStatus === 'active'; } catch (e) { return false; } }
  function igClue() { return document.getElementById('ig-card-emoji'); }
  function igSave(el) { return { f: el.style.filter, t: el.style.transform, o: el.style.transformOrigin, v: el.style.visibility, po: el.parentNode ? el.parentNode.style.overflow : '' }; }
  function igRestore(el, p) { el.style.filter = p.f; el.style.transform = p.t; el.style.transformOrigin = p.o; el.style.visibility = p.v; if (el.parentNode) el.parentNode.style.overflow = p.po; }
  A.ig = {
    tag: 'ig', hook: { start: 'startIGRound', began: igActive }, windowSec: function () { return 20; }, isRoundOver: function () { return !igActive(); },
    events: {
      // 1) الصورة المموهة
      'ig.e1': {
        canRun: function () { return igActive() && igClue() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst, c) { var el = igClue(), p = igSave(el), px = Math.round((c.blurPx || 8) * inst.factor); el.style.filter = 'blur(' + px + 'px)'; return { effect: 'تمويه الصورة ' + px + 'px', sustain: true, revert: function () { igRestore(el, p); } }; },
        shouldEnd: function () { return !igActive(); }, announceText: 'الصورة مموهة!'
      },
      // 2) كشف جزء جديد: تمويه يخف تدريجياً
      'ig.e2': {
        canRun: function () { return igActive() && igClue() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst) { var el = igClue(), p = igSave(el); inst.data.px = Math.round(14 * inst.factor); inst.data.last = Date.now(); el.style.filter = 'blur(' + inst.data.px + 'px)'; return { effect: 'تمويه يخف تدريجياً', sustain: true, data: inst.data, revert: function () { igRestore(el, p); } }; },
        onTick: function (ctx, inst, t) { if (inst.data.px > 0 && t - inst.data.last >= (inst.cfg.intervalSec || 3) * 1000) { inst.data.px = Math.max(0, inst.data.px - 2); inst.data.last = t; igClue().style.filter = inst.data.px ? 'blur(' + inst.data.px + 'px)' : ''; } },
        shouldEnd: function () { return !igActive(); }, announceText: 'كشف جزء جديد! الصورة تتضح تدريجياً'
      },
      // 3) الصورة المكبرة: تكبير يقتصّ جزءاً من الصورة
      'ig.e3': {
        canRun: function () { return igActive() && igClue() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst, c) { var el = igClue(), p = igSave(el), z = Math.round((c.zoomPercent || 260) * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.3 : 1)) / 100; el.style.transformOrigin = (20 + rnd(60)) + '% ' + (20 + rnd(60)) + '%'; el.style.transform = 'scale(' + z + ')'; if (el.parentNode) el.parentNode.style.overflow = 'hidden'; return { effect: 'تكبير الصورة ×' + z.toFixed(1), sustain: true, revert: function () { igRestore(el, p); } }; },
        shouldEnd: function () { return !igActive(); }, announceText: 'الصورة مكبرة! جزء فقط ظاهر'
      },
      // 5) الصورة الخاطفة: تظهر ثوانٍ ثم تختفي
      'ig.e5': {
        canRun: function () { return igActive() && igClue() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst) { var el = igClue(), p = igSave(el); inst.data.at = Date.now(); return { effect: 'الصورة اختفت بعد لحظات', sustain: true, data: inst.data, revert: function () { igRestore(el, p); } }; },
        onTick: function (ctx, inst, t) { if (!inst.data.hidden && t - inst.data.at >= (inst.cfg.showSeconds || 3) * 1000) { inst.data.hidden = true; igClue().style.visibility = 'hidden'; } },
        shouldEnd: function () { return !igActive(); }, announceText: 'الصورة خاطفة! تذكّرها'
      }
    }
  };

  /* ===================== خمن الموضوع (guessword) ===================== */
  function gwActive() { try { return gwGameStatus === 'active'; } catch (e) { return false; } }
  A.guessword = {
    tag: 'guessword', hook: { start: 'gwBeginNewRound', began: gwActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !gwActive(); },
    events: {
      // 2) التلميح المحظور: يُخفى التلميح مدة محددة
      'guessword.e2': {
        canRun: function () { try { return gwActive() && String(gwSecretHint || '').length > 0 ? true : { ok: false, reason: 'no_hint' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        durationMs: function (c) { return (c.durationSec || 20) * 1000; },
        apply: function () { var w = document.getElementById('gw-hint-wrap'), prev = w.style.display; w.style.display = 'none'; return { effect: 'التلميح مخفي', sustain: true, revert: function () { w.style.display = prev; } }; },
        announceText: 'التلميح محظور! لا تلميحات حالياً'
      },
      // 4) التلميح المتدرج: يظهر التلميح كلمة بعد كلمة
      'guessword.e4': {
        canRun: function () { try { return gwActive() && String(gwSecretHint || '').trim().split(/\s+/).length >= 2 ? true : { ok: false, reason: 'hint_too_short' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { var el = document.getElementById('gw-hint-show'), prev = el.textContent, words = String(gwSecretHint).trim().split(/\s+/); inst.data.k = 1; inst.data.last = Date.now(); inst.data.words = words; el.textContent = words[0] + ' …'; return { effect: 'التلميح يُكشف كلمة بكلمة', sustain: true, data: inst.data, revert: function () { el.textContent = prev; } }; },
        onTick: function (ctx, inst, t) { if (inst.data.k < inst.data.words.length && t - inst.data.last >= (inst.cfg.intervalSec || 6) * 1000) { inst.data.k++; inst.data.last = t; document.getElementById('gw-hint-show').textContent = inst.data.words.slice(0, inst.data.k).join(' ') + (inst.data.k < inst.data.words.length ? ' …' : ''); } },
        shouldEnd: function () { return !gwActive(); }, announceText: 'التلميح المتدرج! يُكشف كلمة بكلمة'
      }
    }
  };

  /* ===================== سباق الكلمات السريع (wr) ===================== */
  function wrActive() { try { return wrGameStatus === 'active'; } catch (e) { return false; } }
  A.wr = {
    tag: 'wr', hook: { start: 'startWRRound', began: wrActive }, windowSec: function () { return 40; }, isRoundOver: function () { return !wrActive(); },
    events: {
      // 5) المرحلة البرقية: الجملة تظهر ثوانٍ قليلة ثم تختفي (اختبار ذاكرة وسرعة)
      'wr.e5': {
        canRun: function () { try { return wrActive() && String(wrWord || '').length > 0 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { var el = document.getElementById('wr-word-display'), pv = el.style.visibility; inst.data.at = Date.now(); return { effect: 'الجملة تختفي بعد لحظات', sustain: true, data: inst.data, revert: function () { el.style.visibility = pv; } }; },
        onTick: function (ctx, inst, t) { if (!inst.data.hidden && t - inst.data.at >= (inst.cfg.showSeconds || 4) * 1000) { inst.data.hidden = true; document.getElementById('wr-word-display').style.visibility = 'hidden'; } },
        shouldEnd: function () { return !wrActive(); }, announceText: 'المرحلة البرقية! الجملة ستختفي'
      }
    }
  };

  /* ===================== سؤال وجواب سريع (fastans) ===================== */
  function fsOpen() { try { var o = document.getElementById('fastans-pick-overlay'); return !!(o && o.classList.contains('show')); } catch (e) { return false; } }
  function fsRunning() { try { return !fastansRoundOver; } catch (e) { return false; } }
  function fsShorten(factor, floor) { var el = (performance.now() - fastansTimerStart) / 1000, left = fastansTimerTotal - el, want = Math.max(floor, Math.round(6 / factor)); if (left <= want + 0.5) return null; var prev = fastansTimerTotal; fastansTimerTotal = el + want; return { prev: prev, want: want }; }
  A.fastans = {
    tag: 'fastans', hook: { start: 'fastansStartRound', began: fsRunning }, windowSec: function () { return 15; },
    // الجولة تُعتبر منتهية بعد اختيار الفائز (قائمة الاختيار تُغلق) كي تُستهلك المكافأة قبل الاستعادة
    isRoundOver: function () { return !fsRunning() && !fsOpen(); },
    events: {
      // 1) السؤال الخاطف: القنبلة تنفجر خلال ثوانٍ قليلة
      'fastans.e1': {
        canRun: function () { return fsRunning() && fastansTimerStart != null ? true : { ok: false, reason: 'not_running' }; },
        apply: function (ctx, inst) { var r = fsShorten(inst.factor, 3); if (!r) return { failed: 'timer_already_short' }; return { effect: 'بقي ' + r.want + ' ثوانٍ فقط على الانفجار', durationMs: 0 }; },
        announceText: 'سؤال خاطف! القنبلة ستنفجر قريباً'
      },
      // 4) المضاعف السري: الفائز بهذا السؤال ينال نقطتين
      'fastans.e4': {
        canRun: function () { return fsRunning() && !(fastansBonusPts > 0) ? true : { ok: false, reason: 'bonus_active' }; },
        apply: function () { fastansBonusPts = 1; return { effect: 'الفائز بهذا السؤال ينال نقطتين', sustain: true, revert: function () { fastansBonusPts = 0; } }; },
        shouldEnd: function () { return false; }, announceText: 'مضاعف سري! نقطة إضافية للفائز'
      },
      // 5) النهائي السريع: عند اقتراب أحدهم من الفوز تُقصَّر مهلة السؤال
      'fastans.e5': {
        condition: function () { try { return fsRunning() && fastansPlayers.some(function (p) { return p.score >= FASTANS_WIN_SCORE - 1; }); } catch (e) { return false; } },
        canRun: function () { return fsRunning() ? true : { ok: false, reason: 'not_running' }; },
        apply: function (ctx, inst) { var r = fsShorten(inst.factor, 4); if (!r) return { failed: 'timer_already_short' }; return { effect: 'النهائي السريع: ' + r.want + ' ثوانٍ فقط', durationMs: 0 }; },
        announceText: 'النهائي السريع! أحدهم قريب من الفوز'
      }
    }
  };
})();
