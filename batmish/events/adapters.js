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
})();
