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

  /* ===================== ضربة الحظ (hz) ===================== */
  // المتغيرات: hzGameStatus, hzCells[] (رقم الصندوق→uid), hzParticipants(Map uid→{user,cell}), hzMaxClicks/hzClicksUsed، وخطافات الأحداث: hzBonusCells/hzShield/hzDoubleNext
  function hzActive() { try { return hzGameStatus === 'active'; } catch (e) { return false; } }
  function hzUnopened() { var out = []; for (var n = 1; n <= HZ_GRID_SIZE; n++) { var e = document.getElementById('hz-cell-' + n); if (e && !e.classList.contains('hz-opened')) out.push(n); } return out; }
  A.hz = {
    tag: 'hz', hook: { start: 'startHzRound', began: hzActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !hzActive(); },
    events: {
      // 1) الصندوق الأسطوري: صندوق سري يمنح ضغطات إضافية لمن يفتحه
      'hz.e1': {
        canRun: function () { try { return hzActive() && hzUnopened().length > 1 ? true : { ok: false, reason: 'no_cells' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { var n = pickOne(hzUnopened()); hzBonusCells.add(n); hzBonusClicks = Math.max(1, Math.round(3 * inst.factor)); return { effect: 'صندوق أسطوري سري (+' + hzBonusClicks + ' ضغطات لمن يفتحه)', sustain: true, data: { n: n }, revert: function () { hzBonusCells.delete(n); } }; },
        shouldEnd: function (ctx, inst) { return !hzBonusCells.has(inst.data.n); }, announceText: 'صندوق أسطوري مخفي بين الصناديق!'
      },
      // 2) الصندوق المزدوج: النقرة القادمة تفتح صندوقين (الثاني مجاني)
      'hz.e2': {
        canRun: function () { try { return hzActive() && hzClicksUsed < hzMaxClicks && !hzDoubleNext && hzUnopened().length > 2 ? true : { ok: false, reason: 'not_ready' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { hzDoubleNext = true; return { effect: 'النقرة القادمة تفتح صندوقين', sustain: true, revert: function () { hzDoubleNext = false; } }; },
        shouldEnd: function () { return !hzDoubleNext; }, announceText: 'صندوق مزدوج! نقرة واحدة تفتح صندوقين'
      },
      // 3) الصندوق المقلوب: تبديل أماكن اللاعبين المختبئين بين الصناديق غير المفتوحة
      'hz.e3': {
        canRun: function () { try { return hzActive() && hzParticipants.size >= 2 ? true : { ok: false, reason: 'not_enough_players' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () {
          var cells = hzUnopened(), uids = []; cells.forEach(function (n) { uids.push(hzCells[n] || null); });
          for (var i = uids.length - 1; i > 0; i--) { var j = rnd(i + 1), t = uids[i]; uids[i] = uids[j]; uids[j] = t; }
          cells.forEach(function (n, i) { hzCells[n] = uids[i]; if (uids[i]) { var p = hzParticipants.get(uids[i]); if (p) p.cell = n; } });
          return { effect: 'بُدِّلت أماكن اللاعبين بين ' + cells.length + ' صندوقاً', durationMs: 0 };
        },
        announceText: 'الصندوق المقلوب! تبدّلت الأماكن'
      },
      // 4) فرصة أخيرة: لاعب مختبئ عشوائي يحصل على درع ينقذه من أول إصابة
      'hz.e4': {
        canRun: function () { try { return hzActive() && hzParticipants.size >= 1 ? true : { ok: false, reason: 'no_players' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        eligible: function () { try { return Array.from(hzParticipants.keys()).filter(function (u) { return !hzShield.has(u); }); } catch (e) { return []; } },
        apply: function (ctx, inst) { var uid = pickOne(inst.eligible || []); if (!uid) return { failed: 'no_eligible_player' }; hzShield.add(uid); return { effect: 'لاعب مختبئ نال فرصة نجاة إضافية', sustain: true, data: { uid: uid }, revert: function () { hzShield.delete(uid); } }; },
        shouldEnd: function (ctx, inst) { return !hzShield.has(inst.data.uid); }, announceText: 'فرصة أخيرة! لاعب نال درع نجاة سري'
      }
    }
  };

  /* ===================== الصندوق العشوائي (box) ===================== */
  // المتغيرات: boxGameStatus, boxAwaitingPick, boxArrangement[] ('elim'|'immune'|'elim2'|'golden')، boxParticipants
  function boxActive() { try { return boxGameStatus === 'active'; } catch (e) { return false; } }
  function boxOpen() { try { return boxActive() && boxAwaitingPick === true && boxArrangement.length > 0; } catch (e) { return false; } }
  function boxMark(i, cls) { var el = document.getElementById('box-item-' + (i + 1)); if (el) el.classList.add(cls); return el; }
  A.box = {
    tag: 'box', hook: { start: 'startBoxRound', began: boxActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !boxActive(); },
    events: {
      // 1) الصندوق الأسطوري: يتحول أحد صناديق الإقصاء إلى صندوق ذهبي (جائزة مضاعفة)
      'box.e1': {
        canRun: function () { return boxOpen() && boxArrangement.indexOf('elim') >= 0 ? true : { ok: false, reason: 'no_open_turn' }; },
        apply: function () { var idxs = []; boxArrangement.forEach(function (c, i) { if (c === 'elim') idxs.push(i); }); var i = pickOne(idxs); boxArrangement[i] = 'golden'; var snap = boxArrangement; return { effect: 'تحوّل أحد صناديق الإقصاء إلى صندوق أسطوري ذهبي', sustain: true, data: { snap: snap }, revert: function () { /* يُستهلك باختيار اللاعب */ } }; },
        shouldEnd: function (ctx, inst) { return !boxOpen() || boxArrangement !== inst.data.snap; }, announceText: 'صندوق أسطوري! أحد الصناديق صار ذهبياً'
      },
      // 3) الصناديق المتبدلة: يُعاد خلط محتوى الصناديق قبل أن يختار اللاعب
      'box.e3': {
        canRun: function () { return boxOpen() ? true : { ok: false, reason: 'no_open_turn' }; },
        apply: function () { var a = boxArrangement.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } boxArrangement = a; return { effect: 'أُعيد خلط محتوى الصناديق', durationMs: 0 }; },
        announceText: 'الصناديق المتبدلة! المحتوى تغيّر أماكنه'
      },
      // 5) الاختيار الأخير: عند بقاء لاعبَين يصير بالدور صندوق نجاة واحد فقط والباقي إقصاء (اختيار حاسم)
      'box.e5': {
        condition: function () { try { return boxOpen() && boxParticipants.size <= 2; } catch (e) { return false; } },
        canRun: function () { return boxOpen() ? true : { ok: false, reason: 'no_open_turn' }; },
        apply: function () { var n = boxArrangement.length, a = []; for (var i = 0; i < n; i++) a.push('elim'); a[rnd(n)] = 'immune'; boxArrangement = a; return { effect: 'اختيار حاسم: صندوق نجاة واحد والباقي إقصاء', durationMs: 0 }; },
        announceText: 'الاختيار الأخير! صندوق نجاة واحد فقط'
      }
    }
  };

  /* ===================== القناص (sniper) ===================== */
  // المتغيرات: sniperGameStatus, sniperCells[n]=[uid..], sniperParticipants(Map uid→{user,cell}), sniperShield*/sniperGolden* (آليات اللعبة الأصلية), sniperAmmo
  function snActive() { try { return sniperGameStatus === 'active'; } catch (e) { return false; } }
  function snOccupied() { var out = []; for (var n = 1; n <= SNIPER_GRID_SIZE; n++) if (sniperCells[n] && sniperCells[n].length) out.push(n); return out; }
  A.sniper = {
    tag: 'sniper', hook: { start: 'startSniperRound', began: snActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !snActive(); },
    events: {
      // 1) المنطقة المتحركة: منطقة ذهبية (طلقة إضافية عند الإصابة) تقفز بين المربعات المأهولة
      'sniper.e1': {
        canRun: function () { try { return snActive() && snOccupied().length >= 2 && sniperGoldenCells.size === 0 ? true : { ok: false, reason: sniperGoldenCells.size ? 'golden_active' : 'not_enough_cells' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        durationMs: function () { return 0; },
        apply: function (ctx, inst) {
          var pe = sniperGoldenZoneEnabled, n = pickOne(snOccupied()); sniperGoldenZoneEnabled = true; sniperGoldenCells.add(n); inst.data.n = n; inst.data.last = Date.now();
          return { effect: 'منطقة ذهبية متحركة تبدأ بالمربع ' + n, sustain: true, data: inst.data, revert: function () { sniperGoldenCells.delete(inst.data.n); sniperGoldenZoneEnabled = pe; } };
        },
        onTick: function (ctx, inst, t) { if (t - inst.data.last >= (inst.cfg.intervalSec || 6) * 1000) { var occ = snOccupied().filter(function (x) { return x !== inst.data.n; }); if (occ.length) { sniperGoldenCells.delete(inst.data.n); inst.data.n = pickOne(occ); sniperGoldenCells.add(inst.data.n); } inst.data.last = t; } },
        shouldEnd: function () { return !snActive(); }, announceText: 'المنطقة المتحركة! المربع الذهبي يتنقل'
      },
      // 2) المربع المحصّن: مربع مأهول يمتص أول ضربة (آلية sniperShield الأصلية)
      'sniper.e2': {
        canRun: function () { try { return snActive() && snOccupied().length >= 1 ? true : { ok: false, reason: 'no_occupied_cells' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var pe = sniperShieldEnabled, n = pickOne(snOccupied().filter(function (x) { return !sniperShieldCells.has(x); })); if (!n) return { failed: 'no_cell' }; sniperShieldEnabled = true; sniperShieldCells.add(n); return { effect: 'المربع ' + n + ' محصّن ويمتص ضربة واحدة', sustain: true, data: { n: n }, revert: function () { sniperShieldCells.delete(n); sniperShieldEnabled = pe; } }; },
        shouldEnd: function (ctx, inst) { return !sniperShieldCells.has(inst.data.n); }, announceText: 'مربع محصّن! يمتص أول ضربة'
      },
      // 4) المواجهة الذهبية: مربع مأهول ذهبي — من يُصاب فيه يمنح طلقة إضافية
      'sniper.e4': {
        canRun: function () { try { return snActive() && snOccupied().length >= 1 ? true : { ok: false, reason: 'no_occupied_cells' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var pe = sniperGoldenZoneEnabled, n = pickOne(snOccupied().filter(function (x) { return !sniperGoldenCells.has(x); })); if (!n) return { failed: 'no_cell' }; sniperGoldenZoneEnabled = true; sniperGoldenCells.add(n); return { effect: 'المربع ' + n + ' ذهبي: الإصابة فيه تمنح طلقة', sustain: true, data: { n: n }, revert: function () { sniperGoldenCells.delete(n); sniperGoldenZoneEnabled = pe; } }; },
        shouldEnd: function (ctx, inst) { return !sniperGoldenCells.has(inst.data.n) || snOccupied().indexOf(inst.data.n) < 0; }, announceText: 'مواجهة ذهبية! مربع بجائزة طلقة'
      },
      // 5) الذخيرة المحدودة: خصم نسبة من ذخيرة القناص المتبقية
      'sniper.e5': {
        canRun: function () { try { return snActive() && sniperAmmo.sniper >= 3 ? true : { ok: false, reason: 'ammo_low' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst, c) { var cut = Math.min(sniperAmmo.sniper - 1, Math.max(1, Math.round(sniperAmmo.sniper * (c.cutPercent || 40) / 100 * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.3 : 1)))); sniperAmmo.sniper -= cut; try { updateAmmoUI(); } catch (e) { /* واجهة */ } return { effect: 'خُصمت ' + cut + ' طلقة قناص (بقي ' + sniperAmmo.sniper + ')', durationMs: 0 }; },
        announceText: 'الذخيرة محدودة! نقصت طلقات القناص'
      }
    }
  };

  /* ===================== الكراسي (chairs) ===================== */
  // المتغيرات: chairsGameStatus ('spinning'|'claiming'), chairsActiveChairNumbers[], chairsGoldenChairNumber, chairsImmuneUid, chairsParticipants
  function chClaiming() { try { return chairsGameStatus === 'claiming'; } catch (e) { return false; } }
  function chLive() { try { return chairsGameStatus === 'spinning' || chairsGameStatus === 'claiming'; } catch (e) { return false; } }
  A.chairs = {
    tag: 'chairs', hook: { start: 'chairsStartRoundClick', began: chLive }, windowSec: function () { return 20; }, isRoundOver: function () { return !chLive(); },
    events: {
      // 1) الكرسي الذهبي: كرسي نشط يصير ذهبياً (يمنح فائزه نقطتين بآلية اللعبة الأصلية)
      'chairs.e1': {
        canRun: function () { try { return chClaiming() && chairsGoldenChairNumber === null && chairsActiveChairNumbers.length >= 2 ? true : { ok: false, reason: chClaiming() ? 'golden_exists' : 'not_claiming' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var n = pickOne(chairsActiveChairNumbers), el = document.getElementById('chair-cell-' + n); chairsGoldenChairNumber = n; var prevTxt = null; if (el) { el.classList.add('golden'); var num = el.querySelector('.chair-cell-num'); if (num) { prevTxt = num.textContent; if (prevTxt.indexOf('⭐') < 0) num.textContent = '⭐' + prevTxt; } } return { effect: 'الكرسي ' + n + ' صار ذهبياً (نقطتان)', sustain: true, revert: function () { if (chairsGoldenChairNumber === n) chairsGoldenChairNumber = null; if (el) { el.classList.remove('golden'); var nm = el.querySelector('.chair-cell-num'); if (nm && prevTxt !== null) nm.textContent = prevTxt; } } }; },
        shouldEnd: function () { return !chClaiming(); }, announceText: 'كرسي ذهبي! أسرع من يجلس عليه ينال نقطتين'
      },
      // 4) الكرسي المحصّن: لاعب عشوائي ينجو تلقائياً من هذه الجولة (آلية chairsImmuneUid الأصلية)
      'chairs.e4': {
        canRun: function () { try { return chClaiming() && !chairsImmuneUid && chairsParticipants.size >= 3 ? true : { ok: false, reason: chairsImmuneUid ? 'immune_exists' : 'not_claiming' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        eligible: function () { try { return Array.from(chairsParticipants.keys()); } catch (e) { return []; } },
        apply: function (ctx, inst) { var uid = pickOne(inst.eligible || []); if (!uid) return { failed: 'no_eligible_player' }; chairsImmuneUid = uid; return { effect: 'لاعب محصّن ينجو من هذه الجولة', sustain: true, revert: function () { if (chairsImmuneUid === uid) chairsImmuneUid = null; } }; },
        shouldEnd: function () { return !chClaiming(); }, announceText: 'كرسي محصّن! لاعب ينجو تلقائياً'
      }
    }
  };

  /* ===================== إشارة المرور (rlgl) ===================== */
  // المتغيرات: rlglGameStatus, rlglLightState ('green'|'red'), rlglSetLight(), rlglLightSpeed, rlglProgress(Map), rlglStepsToWin
  function rlActive() { try { return rlglGameStatus === 'active'; } catch (e) { return false; } }
  A.rlgl = {
    tag: 'rlgl', hook: { start: 'startRlglRound', began: function () { try { return rlglGameStatus === 'active' || rlglGameStatus === 'countdown' || !!rlglCountdownTimer; } catch (e) { return false; } } }, windowSec: function () { return 70; },
    isRoundOver: function () { try { return rlglGameStatus === 'finished' || (rlglGameStatus === 'waiting' && !rlglCountdownTimer); } catch (e) { return true; } },
    events: {
      // 1) الإشارة الخاطفة: وميض أحمر مفاجئ أثناء الأخضر (من يتحرك أثناءه يُقصى بقواعد اللعبة)
      'rlgl.e1': {
        canRun: function () { return rlActive() && rlglLightState === 'green' ? true : { ok: false, reason: 'light_not_green' }; },
        durationMs: function (c) { return c.flashMs || 1500; },
        apply: function () { rlglSetLight('red'); return { effect: 'وميض أحمر خاطف', sustain: true, revert: function () { if (rlActive() && rlglLightState === 'red') rlglSetLight('green'); } }; },
        announceText: 'إشارة خاطفة! توقفوا فوراً'
      },
      // 2) الإشارة المزدوجة: وميضان أحمران متتاليان
      'rlgl.e2': {
        canRun: function () { return rlActive() && rlglLightState === 'green' ? true : { ok: false, reason: 'light_not_green' }; },
        apply: function (ctx, inst) { inst.data.n = 1; inst.data.phase = 'red'; inst.data.at = Date.now(); rlglSetLight('red'); return { effect: 'وميضان أحمران متتاليان', sustain: true, data: inst.data, revert: function () { if (rlActive() && rlglLightState === 'red') rlglSetLight('green'); } }; },
        onTick: function (ctx, inst, t) {
          var ms = inst.cfg.flashMs || 1200; if (!rlActive()) return;
          if (inst.data.phase === 'red' && t - inst.data.at >= ms) { rlglSetLight('green'); inst.data.phase = 'gap'; inst.data.at = t; }
          else if (inst.data.phase === 'gap' && t - inst.data.at >= 1500) { if (inst.data.n < 2) { inst.data.n++; rlglSetLight('red'); inst.data.phase = 'red'; inst.data.at = t; } else { inst.data.phase = 'done'; } }
        },
        shouldEnd: function (ctx, inst) { return inst.data.phase === 'done' || !rlActive(); }, announceText: 'إشارة مزدوجة! وميضان أحمران'
      },
      // 5) السباق النهائي: لما يقترب أحدهم من خط النهاية تتسارع الإشارة
      'rlgl.e5': {
        condition: function (ctx, c) { try { if (!rlActive()) return false; var best = 0; rlglProgress.forEach(function (v) { if (v > best) best = v; }); return rlglStepsToWin - best <= c.stepsLeft; } catch (e) { return false; } },
        canRun: function () { return rlActive() ? true : { ok: false, reason: 'not_active' }; },
        apply: function () { var prev = rlglLightSpeed; rlglLightSpeed = 'fast'; return { effect: 'تسارع الإشارة في السباق النهائي', sustain: true, revert: function () { rlglLightSpeed = prev; } }; },
        shouldEnd: function () { return !rlActive(); }, announceText: 'السباق النهائي! الإشارة تتسارع'
      }
    }
  };

  /* ===================== الزر المشحون (battery) ===================== */
  // المتغيرات: batteryCharge (0-100), batteryFinished, batteryRenderMeter(), وخطافات الأحداث batteryChargeMul/batteryOneShotMul
  function btActive() { try { return !batteryFinished; } catch (e) { return false; } }
  A.battery = {
    tag: 'battery', hook: { start: 'batteryNewRound', began: btActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !btActive(); },
    events: {
      // 1) الشحن المضاعف: كل شحنة تُضاعَف طوال مدة الحدث
      'battery.e1': {
        canRun: function () { return btActive() && batteryChargeMul === 1 ? true : { ok: false, reason: 'mul_active' }; },
        durationMs: function (c) { return (c.durationSec || 12) * 1000; },
        apply: function (ctx, inst) { var m = Math.max(1.5, Math.round(2 * inst.factor * 10) / 10); batteryChargeMul = m; return { effect: 'كل شحنة ×' + m, sustain: true, revert: function () { if (batteryChargeMul === m) batteryChargeMul = 1; } }; },
        announceText: 'شحن مضاعف! كل شحنة بقيمة أكبر'
      },
      // 2) انقطاع الطاقة: هبوط مفاجئ في مستوى الشحن
      'battery.e2': {
        canRun: function () { return btActive() && batteryCharge >= 15 ? true : { ok: false, reason: 'charge_too_low' }; },
        apply: function (ctx, inst, c) { var drop = Math.min(batteryCharge - 1, Math.round((c.dropPercent || 25) * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.3 : 1))), before = batteryCharge; batteryCharge -= drop; try { batteryRenderMeter(); } catch (e) { /* واجهة */ } return { effect: 'انقطاع الطاقة: الشحن ' + before + '% → ' + batteryCharge + '%', durationMs: 0 }; },
        announceText: 'انقطاع الطاقة! الشحن هبط'
      },
      // 3) الشحن الخاطف: قفزة فورية في الشحن (لا تصل لـ100 كي لا تمنح فوزاً بلا شاحن)
      'battery.e3': {
        canRun: function () { return btActive() && batteryCharge <= 80 ? true : { ok: false, reason: 'charge_too_high' }; },
        apply: function (ctx, inst, c) { var up = Math.min(99 - batteryCharge, Math.round((c.jumpPercent || 15) * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.3 : 1))), before = batteryCharge; if (up <= 0) return { failed: 'no_room' }; batteryCharge += up; try { batteryRenderMeter(); } catch (e) { /* واجهة */ } return { effect: 'شحن خاطف: ' + before + '% → ' + batteryCharge + '%', durationMs: 0 }; },
        announceText: 'شحن خاطف! قفزة مفاجئة'
      },
      // 4) البطارية الذهبية: أول شحنة قادمة تُضاعف ×3
      'battery.e4': {
        canRun: function () { return btActive() && !(batteryOneShotMul > 0) ? true : { ok: false, reason: 'oneshot_active' }; },
        apply: function () { batteryOneShotMul = 3; return { effect: 'الشحنة القادمة ×3', sustain: true, revert: function () { batteryOneShotMul = 0; } }; },
        shouldEnd: function () { return !(batteryOneShotMul > 0); }, announceText: 'بطارية ذهبية! الشحنة القادمة ×3'
      },
      // 5) الانفجار النهائي: لما يقترب الشحن من 100 تصير الشحنة القادمة حاسمة (تملأ البطارية)
      'battery.e5': {
        condition: function (ctx, c) { try { return btActive() && batteryCharge >= c.whenAbove && batteryCharge < 100; } catch (e) { return false; } },
        canRun: function () { return btActive() && !(batteryOneShotMul > 0) ? true : { ok: false, reason: 'oneshot_active' }; },
        apply: function () { batteryOneShotMul = 100; return { effect: 'الشحنة القادمة تملأ البطارية وتحسم الفوز', sustain: true, revert: function () { batteryOneShotMul = 0; } }; },
        shouldEnd: function () { return !(batteryOneShotMul > 0); }, announceText: 'الانفجار النهائي! الشحنة القادمة تحسم اللعبة'
      }
    }
  };

  /* ===================== المتاهة (maze) ===================== */
  // المتغيرات: mzGameStatus, mzGrid[r][c]={N,E,S,W: جدار؟}, mzPos(Map uid→{r,c}), mzGoal, mzRows/mzCols، والدوال mzRenderGrid()/mzRenderTokens()
  function mzActive() { try { return mzGameStatus === 'active'; } catch (e) { return false; } }
  var MZ_D = { N: [-1, 0, 'S'], S: [1, 0, 'N'], E: [0, 1, 'W'], W: [0, -1, 'E'] };
  function mzSetWall(r, c, d, v) { var dd = MZ_D[d], nr = r + dd[0], nc = c + dd[1]; if (nr < 0 || nr >= mzRows || nc < 0 || nc >= mzCols) return false; mzGrid[r][c][d] = v; mzGrid[nr][nc][dd[2]] = v; return true; }
  function mzInternalWalls(wantWall) { var out = []; for (var r = 0; r < mzRows; r++) for (var c = 0; c < mzCols; c++) ['E', 'S'].forEach(function (d) { var dd = MZ_D[d], nr = r + dd[0], nc = c + dd[1]; if (nr < mzRows && nc < mzCols && !!mzGrid[r][c][d] === wantWall) out.push([r, c, d]); }); return out; }
  function mzAllReach() {   // هل يصل كل لاعب حالي إلى الهدف؟ (BFS على الجدران الحالية)
    var seen = {}, q = [[mzGoal.r, mzGoal.c]]; seen[mzGoal.r + ',' + mzGoal.c] = 1;
    while (q.length) { var cur = q.shift(); ['N', 'S', 'E', 'W'].forEach(function (d) { if (mzGrid[cur[0]][cur[1]][d]) return; var dd = MZ_D[d], nr = cur[0] + dd[0], nc = cur[1] + dd[1], k = nr + ',' + nc; if (nr < 0 || nr >= mzRows || nc < 0 || nc >= mzCols || seen[k]) return; seen[k] = 1; q.push([nr, nc]); }); }
    var ok = true; mzPos.forEach(function (p) { if (!seen[p.r + ',' + p.c]) ok = false; }); return ok;
  }
  function mzRedraw() { try { mzRenderGrid(); } catch (e) { /* واجهة */ } }
  A.maze = {
    tag: 'maze', hook: { start: 'startMzRound', began: mzActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !mzActive(); },
    events: {
      // 1) المتاهة المتغيرة: تُفتح جدران وتُغلق أخرى (مع ضمان بقاء طريق لكل لاعب نحو الهدف)
      'maze.e1': {
        canRun: function () { return mzActive() ? true : { ok: false, reason: 'not_active' }; },
        apply: function (ctx, inst, c) {
          var k = Math.max(1, Math.round((c.changes || 3) * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.4 : 1)));
          for (var attempt = 0; attempt < 12; attempt++) {
            var opened = [], closed = [], walls = mzInternalWalls(true), opens = mzInternalWalls(false);
            for (var i = 0; i < k && walls.length; i++) { var w = walls.splice(rnd(walls.length), 1)[0]; mzSetWall(w[0], w[1], w[2], false); opened.push(w); }
            for (var j = 0; j < k && opens.length; j++) { var o = opens.splice(rnd(opens.length), 1)[0]; if (opened.some(function (x) { return x[0] === o[0] && x[1] === o[1] && x[2] === o[2]; })) continue; mzSetWall(o[0], o[1], o[2], true); closed.push(o); }
            if (mzAllReach()) { mzRedraw(); return { effect: 'تغيّر المتاهة: فُتح ' + opened.length + ' جدار وأُغلق ' + closed.length, durationMs: 0 }; }
            closed.forEach(function (w) { mzSetWall(w[0], w[1], w[2], false); }); opened.forEach(function (w) { mzSetWall(w[0], w[1], w[2], true); });
          }
          return { failed: 'no_safe_layout' };
        },
        announceText: 'المتاهة تغيّرت! جدران فُتحت وأخرى أُغلقت'
      },
      // 2) الباب السري: يُفتح جدار واحد (ممر مختصر)
      'maze.e2': {
        canRun: function () { return mzActive() && mzInternalWalls(true).length > 0 ? true : { ok: false, reason: 'no_walls' }; },
        apply: function () { var w = pickOne(mzInternalWalls(true)); mzSetWall(w[0], w[1], w[2], false); mzRedraw(); return { effect: 'انفتح باب سري بين الخانتين (' + w[0] + ',' + w[1] + ')', durationMs: 0 }; },
        announceText: 'باب سري! انفتح ممر جديد'
      },
      // 3) الطريق المظلم: تُعتَّم اللوحة مدة محددة
      'maze.e3': {
        canRun: function () { return mzActive() && document.getElementById('mz-board-wrap') ? true : { ok: false, reason: 'not_active' }; },
        durationMs: function (c) { return (c.durationSec || 10) * 1000; },
        apply: function () { var el = document.getElementById('mz-board-wrap'), prev = el.style.filter; el.style.filter = 'brightness(0.18)'; return { effect: 'اللوحة معتمة', sustain: true, revert: function () { el.style.filter = prev; } }; },
        announceText: 'الطريق مظلم! اللوحة خافتة'
      }
    }
  };

  /* ===================== الجسر الزجاجي (glz) ===================== */
  // المتغيرات: glzGameStatus ('active'), glzCurrentQuestion {c: رقم الإجابة الصحيحة}, glzTimeLeft, glzAlive(Set)
  function glzActive() { try { return glzGameStatus === 'active'; } catch (e) { return false; } }
  A.glz = {
    tag: 'glz', hook: { start: 'glzStartRound', began: glzActive }, windowSec: function () { return 10; }, isRoundOver: function () { return !glzActive(); },
    events: {
      // 2) الزجاج المتشابه: يُشوَّش نص الخيارين فيصعب التمييز
      'glz.e2': {
        canRun: function () { return glzActive() ? true : { ok: false, reason: 'not_active' }; },
        apply: function () { var a = document.getElementById('glz-opt-0-text'), b = document.getElementById('glz-opt-1-text'), pa = a.style.filter, pb = b.style.filter; a.style.filter = 'blur(3px)'; b.style.filter = 'blur(3px)'; return { effect: 'تشويش نص الخيارين', sustain: true, revert: function () { a.style.filter = pa; b.style.filter = pb; } }; },
        shouldEnd: function () { return !glzActive(); }, announceText: 'زجاج متشابه! الخيارات ضبابية'
      },
      // 3) المسار المتوهج: يتوهج الزجاج الصحيح (تلميح للجمهور)
      'glz.e3': {
        canRun: function () { try { return glzActive() && glzCurrentQuestion && (glzCurrentQuestion.c === 0 || glzCurrentQuestion.c === 1) ? true : { ok: false, reason: 'no_question' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var el = document.getElementById('glz-panel-' + glzCurrentQuestion.c), pb = el.style.boxShadow, po = el.style.outline; el.style.boxShadow = '0 0 38px 8px rgba(242,215,122,.85)'; el.style.outline = '2px solid #f2d77a'; return { effect: 'توهّج الزجاج الصحيح (الخيار ' + (glzCurrentQuestion.c + 1) + ')', sustain: true, revert: function () { el.style.boxShadow = pb; el.style.outline = po; } }; },
        shouldEnd: function () { return !glzActive(); }, announceText: 'مسار متوهج! أحد الزجاجين يلمع'
      },
      // 4) الوقت المحدود: يُقصَّر ما تبقى من وقت السؤال
      'glz.e4': {
        canRun: function (ctx, c) { try { return glzActive() && glzTimeLeft > (c.secondsLeft || 5) + 1 ? true : { ok: false, reason: 'time_already_short' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst, c) { var s = Math.max(2, Math.round((c.secondsLeft || 5) / (inst.factor > 1 ? inst.factor : 1))); glzTimeLeft = Math.min(glzTimeLeft, s); return { effect: 'بقي ' + glzTimeLeft + ' ثوانٍ فقط', durationMs: 0 }; },
        announceText: 'الوقت محدود! ثوانٍ قليلة فقط'
      },
      // 5) العبور الأخير: عند بقاء عدد قليل من اللاعبين يُقصَّر وقت السؤال
      'glz.e5': {
        condition: function (ctx, c) { try { return glzActive() && glzAlive.size <= c.whenAlive && glzAlive.size >= 2 && glzTimeLeft > (c.secondsLeft || 6) + 1; } catch (e) { return false; } },
        canRun: function (ctx, c) { try { return glzActive() && glzTimeLeft > (c.secondsLeft || 6) + 1 ? true : { ok: false, reason: 'time_already_short' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst, c) { glzTimeLeft = Math.min(glzTimeLeft, c.secondsLeft || 6); return { effect: 'العبور الأخير: بقي ' + glzTimeLeft + ' ثوانٍ', durationMs: 0 }; },
        announceText: 'العبور الأخير! الوقت يضيق'
      }
    }
  };

  /* ===================== توب 10 (tt10) ===================== */
  // المتغيرات: tt10GameStatus, tt10CurrentQuestion.items[{rank,value,revealed,bonusMul}]، tt10RenderGrid()
  function ttActive() { try { return tt10GameStatus === 'active' && !!tt10CurrentQuestion; } catch (e) { return false; } }
  function ttOpen() { return tt10CurrentQuestion.items.filter(function (i) { return !i.revealed; }); }
  A.tt10 = {
    tag: 'tt10', hook: { start: 'tt10StartRound', began: ttActive }, windowSec: function () { return 60; }, isRoundOver: function () { return !ttActive(); },
    events: {
      // 2) المركز الذهبي: إجابة غير مكشوفة تُضاعَف نقاطها
      'tt10.e2': {
        canRun: function () { try { return ttActive() && ttOpen().length >= 2 ? true : { ok: false, reason: 'not_enough_items' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var it = pickOne(ttOpen().filter(function (i) { return !i.bonusMul; })); if (!it) return { failed: 'no_item' }; it.bonusMul = 2; try { tt10RenderGrid(); } catch (e) { /* واجهة */ } return { effect: 'المركز ' + it.rank + ' صار ذهبياً (نقاطه ×2)', sustain: true, data: { it: it }, revert: function () { if (it.bonusMul === 2) delete it.bonusMul; } }; },
        shouldEnd: function (ctx, inst) { return !ttActive() || inst.data.it.revealed; },
        announceText: function (inst) { return inst && inst.effect ? inst.effect : 'مركز ذهبي! نقاطه مضاعفة'; }
      },
      // 3) تحدي المراكز الأخيرة: الإجابات ذات المراكز المتأخرة تُضاعَف نقاطها
      'tt10.e3': {
        canRun: function () { try { return ttActive() && ttOpen().length >= 1 ? true : { ok: false, reason: 'no_items' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst, c) { var picked = ttOpen().filter(function (i) { return i.rank >= (c.fromRank || 7) && !i.bonusMul; }); if (!picked.length) return { failed: 'no_late_items' }; picked.forEach(function (i) { i.bonusMul = 2; }); return { effect: 'نقاط ' + picked.length + ' من المراكز الأخيرة ×2', sustain: true, revert: function () { picked.forEach(function (i) { if (i.bonusMul === 2) delete i.bonusMul; }); } }; },
        shouldEnd: function () { return !ttActive(); }, announceText: 'تحدي المراكز الأخيرة! نقاطها مضاعفة'
      },
      // 5) النهائي المقلوب: عند بقاء إجابات قليلة تُعكس قيم نقاطها
      'tt10.e5': {
        condition: function (ctx, c) { try { var n = ttActive() ? ttOpen().length : 0; return n >= 2 && n <= c.whenLeft; } catch (e) { return false; } },
        canRun: function () { try { return ttActive() && ttOpen().length >= 2 ? true : { ok: false, reason: 'not_enough_items' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var open = ttOpen(), ranks = open.map(function (i) { return i.rank; }), orig = ranks.slice(), rev = ranks.slice().reverse(); open.forEach(function (it, k) { it.rank = rev[k]; }); try { tt10RenderGrid(); } catch (e) { /* واجهة */ } return { effect: 'عُكست نقاط ' + open.length + ' إجابات متبقية', sustain: true, revert: function () { open.forEach(function (it, k) { if (!it.revealed) it.rank = orig[k]; }); } }; },
        shouldEnd: function () { return !ttActive(); }, announceText: 'النهائي المقلوب! النقاط انعكست'
      }
    }
  };

  /* ===================== أين الكرة (findball) ===================== */
  // المتغيرات: findballGameStatus ('hiding'|'shuffling'|'guessing'|'revealing'|'finished-round'), findballShuffling, FINDBALL_SHUFFLE_MIN_MS/FLOOR_MS/FINDBALL_SWAP_COUNT
  function fbLive() { try { return findballGameStatus === 'hiding' || findballGameStatus === 'shuffling' || findballGameStatus === 'guessing'; } catch (e) { return false; } }
  A.findball = {
    tag: 'findball', planAtStart: true,
    hook: { start: 'findballShuffle', before: true, canBegin: function () { try { return !findballShuffling; } catch (e) { return false; } } },
    windowSec: function () { return 30; },
    isRoundOver: function () { try { return !(findballGameStatus === 'hiding' || findballGameStatus === 'shuffling' || findballGameStatus === 'guessing'); } catch (e) { return true; } },
    events: {
      // 1) الخلط السريع: مدة الخلط أقصر بكثير (تُطبَّق على الخلط القادم)
      'findball.e1': {
        canRun: function () { try { return !findballShuffling ? true : { ok: false, reason: 'shuffle_started' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { var a = FINDBALL_SHUFFLE_MIN_MS, b = FINDBALL_SHUFFLE_FLOOR_MS, k = Math.max(0.25, 0.5 / inst.factor); FINDBALL_SHUFFLE_MIN_MS = Math.round(a * k); FINDBALL_SHUFFLE_FLOOR_MS = Math.round(b * k); var na = FINDBALL_SHUFFLE_MIN_MS, nb = FINDBALL_SHUFFLE_FLOOR_MS; return { effect: 'مدة الخلط ×' + k.toFixed(2), sustain: true, revert: function () { if (FINDBALL_SHUFFLE_MIN_MS === na) FINDBALL_SHUFFLE_MIN_MS = a; if (FINDBALL_SHUFFLE_FLOOR_MS === nb) FINDBALL_SHUFFLE_FLOOR_MS = b; } }; },
        shouldEnd: function () { return !fbLive(); }, announceText: 'خلط سريع! الأكواب تتحرك بسرعة'
      },
      // 2) الكأس المتخفي: عند بدء التخمين يتلاشى أحد الأكواب (شبه شفاف)
      'findball.e2': {
        condition: function () { try { return findballGameStatus === 'guessing'; } catch (e) { return false; } },
        canRun: function () { try { return findballGameStatus === 'guessing' ? true : { ok: false, reason: 'not_guessing' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function () { var id = pickOne(['a', 'b', 'c']), el = document.getElementById('findball-cup-' + id); if (!el) return { failed: 'cup_missing' }; var prev = el.style.opacity; el.style.opacity = '0.12'; return { effect: 'تلاشى الكأس ' + id.toUpperCase(), sustain: true, revert: function () { el.style.opacity = prev; } }; },
        shouldEnd: function () { try { return findballGameStatus !== 'guessing'; } catch (e) { return true; } }, announceText: 'كأس متخفٍّ! أحد الأكواب تلاشى'
      },
      // 3) تبديل مفاجئ: عدد تبديلات أكبر في الخلط القادم
      'findball.e3': {
        canRun: function () { try { return !findballShuffling ? true : { ok: false, reason: 'shuffle_started' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
        apply: function (ctx, inst) { var add = Math.max(2, Math.round(4 * inst.factor)), prev = FINDBALL_SWAP_COUNT; FINDBALL_SWAP_COUNT = prev + add; var now = FINDBALL_SWAP_COUNT; return { effect: 'تبديلات إضافية +' + add, sustain: true, revert: function () { if (FINDBALL_SWAP_COUNT === now) FINDBALL_SWAP_COUNT = prev; } }; },
        shouldEnd: function () { return !fbLive(); }, announceText: 'تبديل مفاجئ! تبديلات أكثر'
      }
    }
  };
  /* ===================== الدفعة الجديدة: ألعاب الكلمات (main/ll/wai/rw/lsc/guessword/ig/fastans/wr) ===================== */
  function nrm(s) { try { return normalize(s); } catch (e) { return String(s); } }
  function nlen(s) { return Array.from(nrm(s)).length; }
  function bankWords(minLen, maxLen, not) {
    var arr = [], nn = nrm(not || '');
    try { Object.keys(WORDLE_WORD_BANK).forEach(function (k) { WORDLE_WORD_BANK[k].forEach(function (w) { arr.push(w); }); }); } catch (e) { /* لا بنك */ }
    try { GW_WORD_BANK.forEach(function (x) { if (!/\s/.test(x.word)) arr.push(x.word); }); } catch (e) { /* لا بنك */ }
    return arr.filter(function (w) { var l = nlen(w); return l >= minLen && l <= maxLen && nrm(w) !== nn; });
  }
  function bankWord(len, not) { var a = bankWords(len, len, not); return a.length ? pickOne(a) : null; }
  function durMs(def) { return function (c) { return (c.durationSec || def) * 1000; }; }
  function noop() { /* لا شيء */ }

  // ---- أوجد الكلمة: main.e2 / e3 / e5
  A.main.events['main.e2'] = {
    canRun: function () { try { return mainActive() && !mainExtraWord && bankWord(nlen(targetWord), targetWord) ? true : { ok: false, reason: mainExtraWord ? 'already_double' : 'no_second_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () { var w = bankWord(nlen(targetWord), targetWord); if (!w) return { failed: 'no_second_word' }; mainExtraWord = w; return { effect: 'كلمتان سريتان: تُقبل أي منهما', sustain: true, revert: function () { if (mainExtraWord === w) mainExtraWord = null; } }; },
    shouldEnd: function () { return !mainActive(); }, announceText: 'الكلمة المزدوجة! للجولة كلمتان سريتان وأي منهما تفوز'
  };
  A.main.events['main.e3'] = {
    canRun: function () { try { return mainActive() && String(targetWord || '').length >= 2 ? true : { ok: false, reason: 'no_secret_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    durationMs: durMs(15),
    apply: function () { var box = document.getElementById('main-hint-box'), disp = document.getElementById('main-hint-display'), pd = box.style.display, pt = disp.textContent; mainRevealLetterHint(); var mine = disp.textContent; return { effect: 'تلميح مؤقت ثم يُسحب: ' + mine, sustain: true, revert: function () { if (disp.textContent === mine) { disp.textContent = pt; box.style.display = pd || 'none'; } } }; },
    announceText: 'التلميح المسروق! تلميح لحظات ثم يُسحب'
  };
  A.main.events['main.e5'] = {
    canRun: function () { try { return mainActive() && bankWord(nlen(targetWord), targetWord) ? true : { ok: false, reason: 'no_replacement_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var prev = targetWord, nw = bankWord(nlen(targetWord), targetWord); if (!nw) return { failed: 'no_replacement_word' };
      targetWord = nw; guesses = []; try { document.getElementById('guesses-board').innerHTML = '<div class="empty"><div class="empty-icon">🔀</div><div class="empty-txt">الكلمة تغيّرت! ابدؤوا من جديد</div></div>'; } catch (e) { /* واجهة */ }
      return { effect: 'الكلمة السرية تغيّرت وصُفّرت التخمينات', sustain: true, revert: function () { if (targetWord === nw) targetWord = prev; } };
    },
    shouldEnd: function () { return !mainActive(); }, announceText: 'الكلمة المتغيرة! تغيّرت الكلمة السرية — ابدؤوا من جديد'
  };

  // ---- آخر حرف: ll.e1 / e3 / e4 / e5
  A.ll.events['ll.e1'] = {
    canRun: function () { return llActive() && !llBanLetter ? true : { ok: false, reason: llActive() ? 'ban_active' : 'not_active' }; },
    durationMs: durMs(30),
    apply: function () {
      var req = ''; try { req = llReqChar(llCurrentWord); } catch (e) { /* لا حرف */ }
      var L = pickOne('ابتلمنرويهسف'.split('').filter(function (x) { return x !== req && x !== 'ا'; })); llBanLetter = L;
      return { effect: 'الحرف الممنوع: ' + L, sustain: true, data: { letter: L }, revert: function () { if (llBanLetter === L) llBanLetter = ''; } };
    },
    announceText: function (inst) { return 'الحرف الممنوع «' + (inst.data && inst.data.letter || '') + '»! أي كلمة تحتويه تُقصي قائلها'; }
  };
  A.ll.events['ll.e3'] = {
    canRun: function () { try { return llActive() && !llReturnNext && String(llCurrentWord || '').length >= 2 ? true : { ok: false, reason: llActive() ? 'return_active' : 'not_active' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      llReturnNext = true; var el = document.getElementById('ll-cur-letter'); try { if (el) el.textContent = llGetFirstChar(llCurrentWord); } catch (e) { /* واجهة */ }
      return { effect: 'الدور القادم يبدأ بأول حرف من الكلمة السابقة', sustain: true, revert: function () { if (llReturnNext) { llReturnNext = false; try { if (el && llActive()) el.textContent = llGetLastChar(llCurrentWord); } catch (e) { /* واجهة */ } } } };
    },
    shouldEnd: function () { return !llReturnNext || !llActive(); }, announceText: 'حرف العودة! ابدأ كلمتك بأول حرف من الكلمة السابقة'
  };
  A.ll.events['ll.e4'] = {
    canRun: function () { return llActive() && !llMinLen ? true : { ok: false, reason: llActive() ? 'min_active' : 'not_active' }; },
    durationMs: durMs(30),
    apply: function (ctx, inst, c) { var n = Math.max(3, Math.round((c.minLen || 5) * (inst.factor > 1 ? 1 + (inst.factor - 1) * 0.2 : 1))); llMinLen = n; return { effect: 'أقل طول للكلمة ' + n + ' حروف', sustain: true, data: { n: n }, revert: function () { if (llMinLen === n) llMinLen = 0; } }; },
    announceText: function (inst) { return 'الكلمة الطويلة! لا تقل كلمتك عن ' + (inst.data && inst.data.n || 5) + ' حروف'; }
  };
  A.ll.events['ll.e5'] = {
    canRun: function () { return llActive() && !(llChainLeft > 0) ? true : { ok: false, reason: llActive() ? 'chain_active' : 'not_active' }; },
    apply: function (ctx, inst, c) { var n = Math.max(2, c.turns || 3); llChainLeft = n; return { effect: 'تحدي السلسلة: ' + n + ' أدوار لا تقصر فيها الكلمة', sustain: true, data: { n: n }, revert: function () { llChainLeft = 0; } }; },
    shouldEnd: function () { return !(llChainLeft > 0) || !llActive(); },
    announceText: function (inst) { return 'تحدي السلسلة! كل كلمة لا تقصر عن سابقتها لـ' + (inst.data && inst.data.n || 3) + ' أدوار'; }
  };

  // ---- من أنا؟: wai.e4 / e5
  A.wai.events['wai.e4'] = {
    canRun: function () { try { return waiActive() && String(waiCharName || '').length > 1 && DC_CHARACTER_POOL.some(function (n) { return nrm(n) !== nrm(waiCharName); }) ? true : { ok: false, reason: 'no_decoy' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var decoy = pickOne(DC_CHARACTER_POOL.filter(function (n) { return nrm(n) !== nrm(waiCharName); })), pair = rnd(2) ? [waiCharName, decoy] : [decoy, waiCharName];
      var txt = 'الشخصية إحدى اثنتين: ' + pair[0] + ' أو ' + pair[1], prev = waiShow(txt);
      return { effect: 'عُرضت شخصيتان محتملتان (واحدة فقط صحيحة)', sustain: true, revert: function () { waiRestore(prev, txt); } };
    },
    shouldEnd: function () { return !waiActive(); }, announceText: 'شخصية مزدوجة! الجواب أحد اسمين'
  };
  A.wai.events['wai.e5'] = {
    canRun: function () { return waiActive() && !(waiEarlyBonusUntil > Date.now()) ? true : { ok: false, reason: waiActive() ? 'bonus_active' : 'not_active' }; },
    durationMs: durMs(15),
    apply: function (ctx, inst, c) { var until = Date.now() + (c.durationSec || 15) * 1000; waiEarlyBonusUntil = until; return { effect: 'الإجابة الصحيحة المبكرة تنال نقطتين', sustain: true, revert: function () { if (waiEarlyBonusUntil === until) waiEarlyBonusUntil = 0; } }; },
    announceText: 'الإجابة المبكرة! أسرع إجابة صحيحة تنال نقطتين'
  };

  // ---- عكس الكلمة: rw.e1 / e4
  A.rw.events['rw.e1'] = {
    canRun: function () { try { return rwActive() && !rwDoubleRev && nrm(rwAnswer) !== nrm(rwWord) ? true : { ok: false, reason: rwActive() ? 'palindrome_or_active' : 'not_active' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = document.getElementById('rw-word-display'), hint = document.getElementById('rw-answer-hint'), pe = el.textContent, ph = hint.textContent, mine = rwAnswer;
      rwDoubleRev = true; el.textContent = mine; hint.textContent = 'العكس المزدوج: الكلمة معكوسة أصلاً — اكتب عكسها (الكلمة الأصلية)';
      return { effect: 'الكلمة معروضة معكوسة — الجواب هو الكلمة الأصلية', sustain: true, revert: function () { rwDoubleRev = false; if (el.textContent === mine) el.textContent = pe; hint.textContent = ph; } };
    },
    shouldEnd: function () { return !rwActive(); }, announceText: 'العكس المزدوج! الكلمة معكوسة أصلاً — اعكسوها مجدداً'
  };
  A.rw.events['rw.e4'] = {
    canRun: function () { try { return rwActive() && bankWords(6, 8, rwWord).length ? true : { ok: false, reason: 'no_long_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var pw = rwWord, pa = rwAnswer, nw = pickOne(bankWords(Math.max(6, nlen(rwWord) + 1), 8, rwWord).concat(bankWords(6, 8, rwWord)).slice(0, 40));
      var el = document.getElementById('rw-word-display'), hint = document.getElementById('rw-answer-hint'), pe = el.textContent, ph = hint.textContent;
      rwWord = nw; rwAnswer = reverseArabicWord(nw); el.textContent = nw; hint.textContent = 'اكتب عكسها في الشات — ' + nw.length + ' حروف'; try { document.getElementById('rw-guesses-board').innerHTML = ''; } catch (e) { /* واجهة */ }
      return { effect: 'استُبدلت الكلمة بكلمة أطول: ' + nw, sustain: true, revert: function () { if (rwWord === nw) { rwWord = pw; rwAnswer = pa; } if (el.textContent === nw) el.textContent = pe; hint.textContent = ph; } };
    },
    shouldEnd: function () { return !rwActive(); }, announceText: 'الكلمة الطويلة! ظهرت كلمة أطول للعكس'
  };

  // ---- ترتيب الحروف: lsc.e3
  A.lsc.events['lsc.e3'] = {
    canRun: function () { try { return lscActive() && String(lscScrambled || '').length >= 3 && bankWords(3, 5, lscWord).length ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = document.getElementById('lsc-word-display'), hint = document.getElementById('lsc-word-hint'), pe = el.textContent, ph = hint.textContent, decoy = pickOne(bankWords(3, 5, lscWord));
      var letters = Array.from(pe.replace(/\s+/g, '')).concat(Array.from(decoy)); for (var i = letters.length - 1; i > 0; i--) { var j = rnd(i + 1), t = letters[i]; letters[i] = letters[j]; letters[j] = t; }
      var now = letters.join(' '); el.textContent = now; hint.textContent = 'حروف كلمتين متداخلتين — الجواب كلمة من ' + lscWord.length + ' حروف';
      return { effect: 'اختلطت حروف الكلمة بحروف كلمة أخرى', sustain: true, revert: function () { if (el.textContent === now) el.textContent = pe; hint.textContent = ph; } };
    },
    shouldEnd: function () { return !lscActive(); }, announceText: 'كلمتان متداخلتان! حروف كلمة دخيلة اختلطت'
  };

  // ---- خمن الموضوع: guessword.e1 / e3 / e5
  A.guessword.events['guessword.e1'] = {
    canRun: function () { try { return gwActive() && !gwExtraWord && GW_WORD_BANK.some(function (x) { return nrm(x.word) !== nrm(gwSecretWord); }) ? true : { ok: false, reason: gwExtraWord ? 'double_active' : 'no_second_topic' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var entry = pickOne(GW_WORD_BANK.filter(function (x) { return !/\s/.test(x.word) && nrm(x.word) !== nrm(gwSecretWord); })), el = document.getElementById('gw-hint-show'), wrap = document.getElementById('gw-hint-wrap'), pt = el.textContent, pd = wrap.style.display;
      gwExtraWord = entry.word; var now = (gwSecretHint ? gwSecretHint + ' — أو — ' : '') + entry.hint; el.textContent = now; wrap.style.display = '';
      return { effect: 'موضوعان سريان: تُقبل أي كلمة منهما', sustain: true, revert: function () { if (gwExtraWord === entry.word) gwExtraWord = null; if (el.textContent === now) { el.textContent = pt; wrap.style.display = pd; } } };
    },
    shouldEnd: function () { return !gwActive(); }, announceText: 'الموضوع المزدوج! للجولة موضوعان وأي منهما يفوز'
  };
  A.guessword.events['guessword.e3'] = {
    canRun: function () { try { return gwActive() && String(gwSecretWord || '').length >= 2 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = document.getElementById('gw-hint-show'), wrap = document.getElementById('gw-hint-wrap'), pt = el.textContent, pd = wrap.style.display, w = Array.from(String(gwSecretWord)), cat = 'تصنيف سري: كلمة من ' + w.length + ' حروف تبدأ بحرف «' + w[0] + '»';
      var now = (pt && pt.trim() ? pt + ' | ' : '') + cat; el.textContent = now; wrap.style.display = '';
      return { effect: cat, sustain: true, revert: function () { if (el.textContent === now) { el.textContent = pt; wrap.style.display = pd; } } };
    },
    shouldEnd: function () { return !gwActive(); }, announceText: 'التصنيف السري! كُشف عدد الحروف والحرف الأول'
  };
  A.guessword.events['guessword.e5'] = {
    canRun: function () { try { return gwActive() && document.getElementById('gw-board') ? true : { ok: false, reason: 'not_active' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    durationMs: durMs(30),
    apply: function (ctx, inst) {
      var board = document.getElementById('gw-board'), bar = document.createElement('div'); bar.id = 'bmev-gw-top'; bar.setAttribute('dir', 'rtl');
      bar.style.cssText = 'margin:8px 0;padding:8px 12px;border:1px solid #e5c84b;border-radius:10px;background:rgba(229,200,75,.12);font-weight:700;font-size:14px'; bar.textContent = 'الاختيار الجماعي: لا تخمينات بعد';
      board.parentNode.insertBefore(bar, board); inst.data.bar = bar;
      return { effect: 'لوحة الأقرب جماعياً تُحدَّث مباشرة', sustain: true, data: inst.data, revert: function () { if (bar.parentNode) bar.parentNode.removeChild(bar); } };
    },
    onTick: function (ctx, inst) {
      var top = []; try { top = gwGuesses.slice().sort(function (a, b) { return b.sim - a.sim; }).slice(0, 3); } catch (e) { /* لا تخمينات */ }
      inst.data.bar.textContent = top.length ? 'الأقرب جماعياً: ' + top.map(function (g) { return g.text + ' (' + g.sim + '٪)'; }).join(' · ') : 'الاختيار الجماعي: لا تخمينات بعد';
    },
    shouldEnd: function () { return !gwActive(); }, announceText: 'الاختيار الجماعي! أقرب ثلاثة تخمينات تُعرض للجميع'
  };

  // ---- خمن الصورة: ig.e4
  A.ig.events['ig.e4'] = {
    canRun: function () { try { return igActive() && igClue() && IG_BANK.some(function (x) { return x.c === igCurrentQuestion.c && x.a !== igCurrentQuestion.a && x.pic; }) ? true : { ok: false, reason: 'no_decoy' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = igClue(), prev = el.innerHTML, d = pickOne(IG_BANK.filter(function (x) { return x.c === igCurrentQuestion.c && x.a !== igCurrentQuestion.a && x.pic; })), alt = igRenderClue({ pic: d.pic });
      var now = rnd(2) ? prev + '<span class="ig-clue-letters">⇄</span>' + alt : alt + '<span class="ig-clue-letters">⇄</span>' + prev; el.innerHTML = now;
      return { effect: 'ظهرت صورتان متشابهتان (واحدة فقط هي الصحيحة)', sustain: true, revert: function () { if (el.innerHTML === now) el.innerHTML = prev; } };
    },
    shouldEnd: function () { return !igActive(); }, announceText: 'صورتان متشابهتان! أيهما المقصودة؟'
  };

  // ---- سؤال وجواب سريع: fastans.e2 / e3
  A.fastans.events['fastans.e2'] = {
    canRun: function () { return fsRunning() && !(fastansBonusPts > 0) ? true : { ok: false, reason: fsRunning() ? 'bonus_active' : 'not_running' }; },
    apply: function () {
      var el = document.getElementById('fastans-question-card'), prev = el.textContent, q2 = pickOne(FASTANS_QUESTIONS.filter(function (q) { return q !== prev; })), now = prev + '  ➕  ' + q2;
      el.textContent = now; fastansBonusPts = 1;
      return { effect: 'سؤالان معاً — الفائز ينال نقطتين', sustain: true, revert: function () { if (el.textContent === now) el.textContent = prev; fastansBonusPts = 0; } };
    },
    shouldEnd: function () { return false; }, announceText: 'السؤال المزدوج! سؤالان معاً ونقطتان للفائز'
  };
  A.fastans.events['fastans.e3'] = {
    canRun: function () { try { var h = fastansPlayers[fastansCurrentPlayerIdx]; return fsRunning() && !fastansStealNext && h && h.score > 0 ? true : { ok: false, reason: 'holder_has_no_points' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () { fastansStealNext = true; return { effect: 'الفائز بهذه الجولة يسرق نقطة من حامل القنبلة', sustain: true, revert: function () { fastansStealNext = false; } }; },
    shouldEnd: function () { return false; }, announceText: 'فرصة السرقة! الفائز يأخذ نقطة من حامل القنبلة'
  };

  // ---- سباق الكلمات: wr.e1 / e2 / e3 / e4
  function wrEl() { return document.getElementById('wr-word-display'); }
  A.wr.events['wr.e1'] = {
    canRun: function () { try { return wrActive() && bankWords(4, 8, wrWord).length ? true : { ok: false, reason: 'no_replacement' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var pw = wrWord, nw = pickOne(bankWords(4, 8, wrWord)), el = wrEl(), pe = el.textContent; wrWord = nw; el.textContent = nw; try { document.getElementById('wr-guesses-board').innerHTML = ''; } catch (e) { /* واجهة */ }
      return { effect: 'تبدّلت الجملة إلى: ' + nw, sustain: true, revert: function () { if (wrWord === nw) wrWord = pw; if (el.textContent === nw) el.textContent = pe; } };
    },
    shouldEnd: function () { return !wrActive(); }, announceText: 'تبديل الفئة! تغيّرت الجملة المطلوبة'
  };
  A.wr.events['wr.e2'] = {
    canRun: function () { try { return wrActive() && Array.from(String(wrWord || '').replace(/\s/g, '')).length >= 3 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = wrEl(), pe = el.textContent, ch = Array.from(pe), idx = []; ch.forEach(function (c, i) { if (c.trim()) idx.push(i); }); ch[pickOne(idx)] = '＿'; var now = ch.join(''); el.textContent = now;
      return { effect: 'اختفى حرف مفاجئ من الجملة', sustain: true, revert: function () { if (el.textContent === now) el.textContent = pe; } };
    },
    shouldEnd: function () { return !wrActive(); }, announceText: 'الحرف المفاجئ! اختفى حرف من الجملة'
  };
  A.wr.events['wr.e3'] = {
    canRun: function () { try { return wrActive() && !wrAcceptOverride && String(wrWord || '').trim().split(/\s+/).length >= 2 ? true : { ok: false, reason: 'phrase_too_short' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = wrEl(), pe = el.textContent, words = String(wrWord).trim().split(/\s+/), k = rnd(words.length), banned = words[k], rest = words.filter(function (w, i) { return i !== k; }).join(' ');
      wrAcceptOverride = rest; el.innerHTML = words.map(function (w, i) { return i === k ? '<s style="opacity:.6;color:#ff6b6b">' + esc(w) + '</s>' : esc(w); }).join(' '); var mine = el.innerHTML;
      return { effect: 'الكلمة الممنوعة «' + banned + '» لا تُكتب', sustain: true, data: { w: banned }, revert: function () { if (wrAcceptOverride === rest) wrAcceptOverride = null; if (el.innerHTML === mine) el.textContent = pe; } };
    },
    shouldEnd: function () { return !wrActive(); }, announceText: function (inst) { return 'الكلمة الممنوعة «' + (inst.data && inst.data.w || '') + '»! اكتبوا الجملة بدونها'; }
  };
  A.wr.events['wr.e4'] = {
    canRun: function () { try { return wrActive() && !wrAcceptOverride && String(wrWord || '').length > 0 ? true : { ok: false, reason: 'no_word' }; } catch (e) { return { ok: false, reason: 'game_unavailable' }; } },
    apply: function () {
      var el = wrEl(), pe = el.textContent, twice = wrWord + ' ' + wrWord, now = pe + '  ×٢'; wrAcceptOverride = twice; el.textContent = now;
      return { effect: 'اكتبوا الجملة مرتين متتاليتين', sustain: true, revert: function () { if (wrAcceptOverride === twice) wrAcceptOverride = null; if (el.textContent === now) el.textContent = pe; } };
    },
    shouldEnd: function () { return !wrActive(); }, announceText: 'سباق السلسلة! اكتبوا الجملة مرتين متتاليتين'
  };
})();
