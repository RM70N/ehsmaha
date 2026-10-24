/* احسمها | مركز الاتصالات — محرك القواعد الحتمي المشترك.
   نفس الملف يشتغل بالخادم (المرجع الرسمي للعملة والنتائج) وبالمتصفح بوضع التدريب المحلي.
   ما فيه أي ذكاء اصطناعي هنا: الحركة، العملة، المؤقتات، النجاح، والحفظ كلها كود حتمي.
   الذكاء (إن وجد) يقترح نية اللاعب وتعديلات صغيرة بنبرة المتصل، والقواعد هنا تقرر. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cc-content.js'));
  else root.CCRules = factory(root.CCContent);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var SAVE_VERSION = 2;
  var OVERTIME_SEC = 0; // نهاية الدوام تقفل المكالمة القائمة فوراً

  /* ================= أدوات عامة ================= */
  var AR_DIGITS = '٠١٢٣٤٥٦٧٨٩', FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
  function normDigits(s) {
    s = String(s == null ? '' : s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], a = AR_DIGITS.indexOf(ch), f = FA_DIGITS.indexOf(ch);
      out += a >= 0 ? String(a) : f >= 0 ? String(f) : ch;
    }
    return out;
  }
  // رمز: أرقام فقط بعد التطبيع، مع الحفاظ على الأصفار البادئة (نتعامل معه كنص دائماً)
  function normCode(s) { return normDigits(s).replace(/[^0-9]/g, ''); }
  function normText(s) {
    return normDigits(String(s == null ? '' : s))
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
      .toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function toArDigits(s) { return String(s).replace(/[0-9]/g, function (d) { return AR_DIGITS[+d]; }); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hashStr(str) { var h = 2166136261 >>> 0; str = String(str); for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function makeRng(seed) {
    var a = (typeof seed === 'number' ? seed : hashStr(seed)) >>> 0;
    var r = function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    r.int = function (lo, hi) { return lo + Math.floor(r() * (hi - lo + 1)); };
    r.pick = function (arr) { return arr[Math.floor(r() * arr.length)]; };
    r.shuffle = function (arr) { var a2 = arr.slice(); for (var i = a2.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a2[i]; a2[i] = a2[j]; a2[j] = t; } return a2; };
    return r;
  }
  var idCounter = 0;
  function uid(prefix) { idCounter = (idCounter + 1) % 1e6; return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + idCounter.toString(36) + '_' + Math.floor(Math.random() * 1e9).toString(36); }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function persona(id) { return byId(C.PERSONAS, id); }
  function scenario(id) { return byId(C.SCENARIOS, id); }
  function upgrade(id) { return byId(C.UPGRADES, id); }
  function fmtMoney(n) { return toArDigits(Math.round(n)) + ' ' + C.CURRENCY.short; }

  /* ================= الملف الشخصي والحفظ ================= */
  function newProfile() {
    return {
      v: SAVE_VERSION, day: 1, wallet: 0, owned: {}, cosmetics: { sleeve: null },
      achievements: {}, stats: { daysPassed: 0, daysFailed: 0, callsOk: 0, callsFail: 0, earnedTotal: 0, bestDay: 0, appsOpened: {}, purchases: 0 },
      history: { personas: [], scenarios: [], managerLines: [] }, txLog: [], campaignDone: false,
      lifetimeEarned: 0, ops: { history: [], usedCodes: [], won: {} }, lastMethod: 'code',
      settings: null, createdAt: Date.now(), updatedAt: Date.now()
    };
  }
  function isObj(o) { return o && typeof o === 'object' && !Array.isArray(o); }
  function intIn(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
  /* تحقق صارم من ملف حفظ (محلي أو مرسل للخادم). يرجع نسخة نظيفة أو خطأ واضح. */
  function validateProfile(raw) {
    if (!isObj(raw)) return { ok: false, error: 'not_object' };
    if (raw.v !== SAVE_VERSION && raw.v !== 1) return { ok: false, error: 'version' };
    var p = newProfile();
    if (!intIn(raw.day, 1, 999)) return { ok: false, error: 'day' };
    if (!intIn(raw.wallet, 0, 10000000)) return { ok: false, error: 'wallet' };
    p.day = raw.day; p.wallet = raw.wallet;
    if (isObj(raw.owned)) Object.keys(raw.owned).forEach(function (k) {
      var u = upgrade(k), st = raw.owned[k];
      if (u && (st === 'active' || st === 'pending')) p.owned[k] = st;
    });
    if (isObj(raw.cosmetics) && typeof raw.cosmetics.sleeve === 'string' && /^#[0-9a-f]{6}$/i.test(raw.cosmetics.sleeve)) p.cosmetics.sleeve = raw.cosmetics.sleeve;
    if (isObj(raw.achievements)) Object.keys(raw.achievements).forEach(function (k) { if (byId(C.ACHIEVEMENTS, k) && intIn(raw.achievements[k], 0, 1e15)) p.achievements[k] = raw.achievements[k]; });
    if (isObj(raw.stats)) Object.keys(p.stats).forEach(function (k) {
      if (k === 'appsOpened') { if (isObj(raw.stats.appsOpened)) Object.keys(raw.stats.appsOpened).forEach(function (a) { if (C.APPS[a]) p.stats.appsOpened[a] = 1; }); }
      else if (intIn(raw.stats[k], 0, 1e9)) p.stats[k] = raw.stats[k];
    });
    if (isObj(raw.history)) ['personas', 'scenarios', 'managerLines'].forEach(function (k) {
      if (Array.isArray(raw.history[k])) p.history[k] = raw.history[k].filter(function (x) { return typeof x === 'string' && x.length < 40; }).slice(-12);
    });
    if (Array.isArray(raw.txLog)) p.txLog = raw.txLog.filter(function (x) { return typeof x === 'string' && x.length < 80; }).slice(-60);
    p.campaignDone = !!raw.campaignDone;
    // الإصدار ٢: إجمالي الأرباح التراكمية (شرط فتح الطرق) وسجل العمليات. ترحيل الإصدار ١ بدون تصفير أي شي.
    if (raw.v === 1) p.lifetimeEarned = Math.max(p.stats.earnedTotal, p.wallet);
    else {
      if (!intIn(raw.lifetimeEarned, 0, 1e9)) return { ok: false, error: 'lifetime' };
      p.lifetimeEarned = Math.max(raw.lifetimeEarned, p.stats.earnedTotal);
      if (isObj(raw.ops)) {
        if (Array.isArray(raw.ops.history)) p.ops.history = raw.ops.history.filter(function (h) { return isObj(h) && byId(C.METHODS, h.method) && typeof h.id === 'string' && h.id.length < 60; }).slice(-40).map(function (h) { return { id: h.id, method: h.method, caller: String(h.caller || '').slice(0, 30), reward: intIn(h.reward, 0, 100000) ? h.reward : 0, ok: !!h.ok, reason: String(h.reason || '').slice(0, 30), at: intIn(h.at, 0, 1e15) ? h.at : 0, day: intIn(h.day, 0, 999) ? h.day : 0 }; });
        if (Array.isArray(raw.ops.usedCodes)) p.ops.usedCodes = raw.ops.usedCodes.filter(function (c) { return typeof c === 'string' && /^[a-z]+:[0-9]{3,12}$/.test(c); }).slice(-300);
        if (isObj(raw.ops.won)) Object.keys(raw.ops.won).forEach(function (k) { if (byId(C.METHODS, k) && intIn(raw.ops.won[k], 0, 1e6)) p.ops.won[k] = raw.ops.won[k]; });
      }
      if (typeof raw.lastMethod === 'string' && byId(C.METHODS, raw.lastMethod)) p.lastMethod = raw.lastMethod;
    }
    p.v = SAVE_VERSION;
    if (isObj(raw.settings)) p.settings = raw.settings; // الإعدادات تُتحقق بمكانها (العميل)
    if (intIn(raw.createdAt, 0, 1e15)) p.createdAt = raw.createdAt;
    p.updatedAt = Date.now();
    return { ok: true, profile: p };
  }
  function checksum(obj) { return hashStr('cc3d:' + JSON.stringify(obj)).toString(36); }

  function effects(profile) {
    var e = { patienceDrain: 0, trustBonus: 0, toolTime: 0, desktopScale: 1, sortHint: false, virusChance: 0, popupsLess: 0, powerGrace: 0,
      noiseImmune: false, coffeeBoost: false, autoNotes: false, browserHints: false, clipSnapshots: false, worldCamera: false, sitFast: false,
      deskMat: null, deskLamp: false, deskPlant: false, deskPoster: false, mugGold: false, sleeve: null };
    Object.keys(profile.owned || {}).forEach(function (k) {
      if (profile.owned[k] !== 'active') return;
      var u = upgrade(k); if (!u) return;
      Object.keys(u.effect).forEach(function (ek) {
        var v = u.effect[ek];
        if (typeof v === 'number' && typeof e[ek] === 'number' && ek !== 'desktopScale') e[ek] = (ek === 'patienceDrain' || ek === 'virusChance') ? Math.min(e[ek], v) : e[ek] + v;
        else e[ek] = v;
      });
    });
    if (profile.cosmetics && profile.cosmetics.sleeve) e.sleeve = profile.cosmetics.sleeve;
    return e;
  }
  function appsFor(profile) {
    var set = {};
    for (var d = 1; d <= Math.min(profile.day, C.DAYS.length); d++) C.dayConfig(d).newApps.forEach(function (a) { set[a] = 1; });
    if (profile.day > C.DAYS.length) C.DAYS.forEach(function (dc) { dc.newApps.forEach(function (a) { set[a] = 1; }); });
    return Object.keys(set);
  }
  function appUnlockDay(app) { for (var i = 0; i < C.DAYS.length; i++) if (C.DAYS[i].newApps.indexOf(app) >= 0) return C.DAYS[i].day; return null; }

  /* ================= اليوم ================= */
  function startDay(profile, opts) {
    opts = opts || {};
    var cfg = C.dayConfig(profile.day);
    var now = opts.now || Date.now();
    return {
      id: opts.id || uid('day'), day: profile.day, quota: cfg.quota, duration: cfg.duration, brief: cfg.brief,
      startedAt: now, pausedMs: 0, pauseStart: null, phase: 'shift', overtimeStart: null,
      earned: 0, immediate: true, calls: [], log: [], activeCallId: null, events: [], toolUses: 0, idleMs: 0, coffeeReady: false,
      settled: false, review: null, seed: opts.seed || hashStr(String(now) + ':' + profile.day)
    };
  }
  function dayElapsed(day, now) {
    var paused = day.pausedMs + (day.pauseStart ? (now - day.pauseStart) : 0);
    return Math.max(0, (now - day.startedAt - paused) / 1000);
  }
  function dayTimeLeft(day, now) { return Math.max(0, day.duration - dayElapsed(day, now)); }
  function setPaused(day, paused, now) {
    if (paused && !day.pauseStart) day.pauseStart = now;
    else if (!paused && day.pauseStart) { day.pausedMs += now - day.pauseStart; day.pauseStart = null; }
  }
  /* يحدّث مرحلة اليوم حسب الوقت. القاعدة الواضحة لنهاية الدوام:
     - عند انتهاء الوقت: ما فيه مكالمات جديدة.
     - المكالمة القائمة تنقفل تلقائياً فوراً (بدون مكافأة وبدون احتسابها فشل). */
  function tickDay(day, now, activeCall) {
    if (day.phase === 'shift' && dayTimeLeft(day, now) <= 0) {
      if (activeCall && activeCall.status === 'active') { day.phase = 'overtime'; day.overtimeStart = now; }
      else day.phase = 'closed';
    }
    if (day.phase === 'overtime') {
      if (!activeCall || activeCall.status !== 'active') day.phase = 'closed';
      else if ((now - day.overtimeStart) / 1000 >= OVERTIME_SEC) return { forceEnd: 'overtime' };
    }
    return null;
  }
  function logDay(day, type, text, extra) {
    var e = { t: Math.round(dayElapsed(day, Date.now())), type: type, text: text };
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    day.log.push(e); if (day.log.length > 200) day.log.shift();
    return e;
  }

  /* ================= اختيار المكالمة ================= */
  function pickCall(profile, day, rng, opts) {
    opts = opts || {};
    var cfg = C.dayConfig(profile.day), apps = appsFor(profile);
    if (opts.timeWaster) return { scenarioId: 's00', personaId: 'p24' };
    var scen = C.SCENARIOS.filter(function (s) {
      return s.id !== 's00' && s.unlockDay <= profile.day && s.difficulty <= cfg.maxDifficulty && s.apps.every(function (a) { return apps.indexOf(a) >= 0; });
    });
    var recentS = profile.history.scenarios.slice(-2).concat(day.calls.slice(-2).map(function (c) { return c.scenarioId; }));
    var freshS = scen.filter(function (s) { return recentS.indexOf(s.id) < 0; });
    var s = rng.pick(freshS.length ? freshS : scen);
    var pool = C.PERSONAS.filter(function (p) {
      if (p.archetype === 'time_waster') return false;
      if (p.archetype === 'saboteur') return !!s.saboteurCall;
      if (s.saboteurCall) return false;
      if (s.testerCall) return p.archetype === 'tester' || p.archetype === 'precise' || p.archetype === 'fake_convinced';
      return p.difficulty <= Math.max(1, cfg.maxDifficulty - (s.difficulty >= 3 ? 1 : 0));
    });
    var recentP = profile.history.personas.slice(-4).concat(day.calls.map(function (c) { return c.personaId; }));
    var freshP = pool.filter(function (p) { return recentP.indexOf(p.id) < 0; });
    var p = rng.pick(freshP.length ? freshP : pool);
    return { scenarioId: s.id, personaId: p.id };
  }

  /* ================= بيانات المكالمة الخيالية ================= */
  var DISTRICTS = ['حي النخيل الوهمي', 'حي الغيمة', 'حي البطيخة', 'حي القمرة', 'حي الهيل'];
  var STREETS = ['شارع الكنافة', 'شارع المندي', 'شارع السمبوسة', 'شارع اللقيمات', 'شارع الزعفران'];
  function genCode(rng, n) { var s = ''; for (var i = 0; i < n; i++) s += String(rng.int(0, 9)); if (rng() < 0.35) s = '0' + s.slice(1); return s; }
  function mutateCode(rng, code) {
    var i = rng.int(0, code.length - 1), d = (Number(code[i]) + rng.int(1, 8)) % 10;
    return code.slice(0, i) + d + code.slice(i + 1);
  }
  function genFacts(s, p, rng) {
    var g = s.factGen || {}, f = {};
    if (g.code) { f.code = genCode(rng, g.code); f.fakeCode = mutateCode(rng, f.code); }
    if (g.invoice) f.invoice = genCode(rng, g.invoice);
    if (g.amount) f.amount = rng.int(g.amount[0], g.amount[1]);
    if (g.address) f.address = { district: rng.pick(DISTRICTS), street: rng.pick(STREETS), building: String(rng.int(3, 98)), phone: '05' + genCode(rng, 8) };
    f.callerName = p.name;
    return f;
  }
  function addrText(a) { return a ? (a.district + '، ' + a.street + '، مبنى ' + toArDigits(a.building)) : ''; }


  /* ================= فهم رسالة اللاعب: حقائق التعريف بالقواعد (بدون الاعتماد على تصنيف نية واحدة) =================
     تُستخدم بالخادم وبوضع التدريب سوا: الاسم، القسم، الشركة (بنطق قريب)، وهل سأل عن المشكلة أو صحّح معلومة أو عكس الأدوار. */
  function lev(a, b) {
    if (a === b) return 0; var m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    var prev = [], cur = [], i, j; for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) { cur[0] = i; for (j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); var t = prev; prev = cur; cur = t; }
    return prev[n];
  }
  function stripPrefix(w) { return w.replace(/^(وال|بال|لل|ال|و|ب|ل)(?=.{3,})/, ''); }
  function wordsOf(s) { return normText(s).replace(/[^؀-ۿa-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); }
  var GENERIC_WORD = /^(مركز|شركه|قناه|مسابقه|للاتصالات|للاجهزه|الذكيه|المنزليه)$/;
  /* يرجع الصيغة المطابقة من القائمة: مطابقة نصية، أو نطق قريب (فرق حرف أو حرفين بالكلمات الطويلة فقط) */
  function fuzzyHas(text, aliases) {
    var nt = normText(text), tt = wordsOf(text).map(stripPrefix);
    for (var i = 0; i < (aliases || []).length; i++) {
      var a = aliases[i], na = normText(a); if (!na) continue;
      if (nt.indexOf(na) >= 0) return a;
      var at = wordsOf(a).map(stripPrefix).filter(function (w) { return w.length >= 4 && !GENERIC_WORD.test(w); });
      if (!at.length) continue;
      var ok = at.every(function (w) { return tt.some(function (x) { return lev(w, x) <= (w.length >= 7 ? 2 : w.length >= 5 ? 1 : 0); }); });
      if (ok) return a;
    }
    return null;
  }
  var NAME_STOP = /^(من|في|عند|هنا|اللي|الي|اخوك|اخوي|معك|معاك|انا|اني|هذا|هذي|موظف|مساعد|فني|دعم|قسم|شركه|خدمه|ان|ايه|اي|نعم|لا)$/;
  var DEPT_RX = /(?:^|\s)(?:من|قسم|بقسم|في|ب)\s*(?:قسم\s*)?(الدعم الفني|الدعم التقني|الدعم|خدمه العملاء|خدمه الزبائن|المبيعات|الفواتير|الشحن|الحسابات|الاشتراكات|التوصيل|مراقبه الجوده|الجوده)(?=\s|$|[،,.!؟?])/;
  var ASKED_PROBLEM_RX = /(وش|ايش|شنو|شو|ما)\s*(هي\s*|هو\s*)?(مشكلتك|مشكلتكم|المشكله|السالفه|سالفتك|قصتك|القصه|الموضوع|بغيت|تبي|تبغي|تبغى|تقول|تحتاج|اللي صار|الي صار|صار|عندك)|كيف\s*(اقدر|ممكن|ينفع)\s*(اساعدك|اخدمك|اساعدكم)|اساعدك|اخدمك|خدمتك|امرني|تفضل\s*(قول|اشرح|وش|تكلم)|وضح\s*(لي\s*)?(المشكله|الموضوع)|اشرح\s*(لي\s*)?(المشكله|الموضوع|السالفه)|وش\s*اللي\s*(حصل|صار)|كمل\s*(كلامك|مشكلتك)|تكلم|قول\s*(لي|مشكلتك)/;
  var REVERSAL_RX = /(انت|انتم)\s*(اللي|الي)?\s*(متصل|اتصلت|تتصل|كلمتني|كلمتنا|اتصلتوا|اتصل)|انت\s*المتصل|(انت|انتي)\s*(اللي|الي)\s*(بدات|بدا)/;
  var CORRECTION_RX = /(قصدي|اقصد|اسمي الصحيح|تصحيح|اصحح|صححت|غلطت|غلط بالاسم|اعتذر عن الغلط)/;
  var GREET_ONLY_RX = /^(?:السلام عليكم(?: ورحمه الله(?: وبركاته)?)?|وعليكم السلام(?: ورحمه الله(?: وبركاته)?)?|هلا(?: والله)?|اهلا(?: وسهلا| فيك)?|اهلين|مرحبا|يا هلا|الو|ايوه|نعم|تفضل|مساء الخير|صباح الخير|هلا والله)(?:[\s،,.!]+(?:السلام عليكم|هلا|اهلا|تفضل|الو|نعم))*[\s،,.!]*$/;
  var AFFIRM_RX = /^(?:ايه|ايوه|اي|نعم|صح|صحيح|بالضبط|اكيد|ايوا|ايه صح|ايه هذا)(?:[\s،,.!]|$)/;
  function extractFacts(text, call) {
    var s = scenario(call.scenarioId) || {}, inc = s.incoming || {}, t = normText(text);
    var raw = normDigits(String(text || '')).replace(/[ً-ٰٟـ]/g, '');
    var f = { name: null, company: false, companyAlias: null, department: null, askedProblem: false, reversal: false, correction: false, greetOnly: false, affirm: false };
    var m = raw.match(/(?:^|\s|،|,)(?:معك|معاك|اسمي|انا|أنا|إني|اني)\s+([؀-ۿ]{2,15})(?=\s|$|[،,.!؟?])/);
    if (m) { var cand = m[1], nc = normText(cand); if (!NAME_STOP.test(nc) && nc.indexOf('ال') !== 0 && !(inc.aliases || []).some(function (x) { return normText(x) === nc; })) f.name = cand; }
    var d = t.match(DEPT_RX) || t.match(/(?:^|\s)قسم\s+([؀-ۿ]{2,15})(?=\s|$|[،,.!؟?])/);
    if (d) f.department = d[1];
    var aliases = (inc.aliases || []).slice();
    (s.steps || []).forEach(function (st) { (st.mention || []).forEach(function (w) { aliases.push(w); }); });
    f.companyAlias = fuzzyHas(text, aliases); f.company = !!f.companyAlias;
    f.askedProblem = ASKED_PROBLEM_RX.test(t);
    f.reversal = REVERSAL_RX.test(t);
    f.correction = CORRECTION_RX.test(t);
    f.greetOnly = GREET_ONLY_RX.test(t) && !f.name && !f.company && !f.department;
    f.affirm = AFFIRM_RX.test(t);
    return f;
  }
  /* أسئلة المتصل (من جمله) وأنواعها: لا نتعامل مع «أي علامة استفهام» كسؤال واحد */
  var ID_ASK_RX = /(من|مين|منو)\s*(انت|معي|معاي|معاه|يكلمني|اللي معي|يتكلم|هذا|انتم)|عرف(?:ني)?\s*(?:بنفسك|نفسك)|تعرف\s*بنفسك|وش\s*(?:اسمك|اسمك الكامل)|اسمك\s*ايش|مع\s*من\s*(?:اتكلم|اتحدث)|انت\s*من\s*وين|من\s*وين\s*انت|ممكن\s*(?:تعرف|اسمك)|اعرف\s*مع\s*من/;
  var REVERSAL_SAY_RX = /(انت|انتم)\s*(اللي|الي)\s*(اتصلت|متصل|كلمتني|اتصل|اتصلتوا)|ليش\s*(اتصلت|تتصل|اتصلتوا)\s*(علي|فيني|بي|علينا)|من\s*اللي\s*اتصل|مين\s*اللي\s*اتصل|انا\s*ما\s*اتصلت|ما\s*كلمتك\s*انا|وش\s*تبي\s*مني\s*(؟|\?)?\s*انت\s*اللي/;
  function callerQuestionKind(line, call) {
    if (!line) return null;
    var t = normText(line), q = /[؟?]/.test(line);
    if (ID_ASK_RX.test(t)) return 'who';
    var s = call && scenario(call.scenarioId), al = ((s && s.incoming && s.incoming.aliases) || []);
    if (q && (/(?:هذا|هذي|انتم|انت|هذه)\s+(?:هو\s+)?(?:دعم|شركه|قناه|مسابقه|مركز|نادي|مزرعه|سفريات|حمام|بطريق|كبسه|شفاط|جهه)/.test(t) || (al.length && fuzzyHas(line, al)))) return 'company';
    if (q && /(ليش|لماذا|وش السبب).*(تبي|تحتاج|تطلب|تسال|تسأل)/.test(t)) return 'why';
    if (q && /(توافق|موافق|تاكد|نكمل|تعتمد)/.test(t)) return 'confirm';
    return q ? 'other' : null;
  }
  function sameClaim(old, v) { return old === v || old.indexOf(v) >= 0 || v.indexOf(old) >= 0 || (Math.min(old.length, v.length) >= 4 && lev(old, v) <= 1); }
  function answersPending(pend, facts, acts, text) {
    if (!pend || pend.answered) return false;
    var intro = acts.indexOf('introduce') >= 0, ans = acts.indexOf('answer_question') >= 0 || acts.indexOf('explain') >= 0 || acts.indexOf('reassure') >= 0;
    switch (pend.kind) {
      case 'company': return facts.company || facts.affirm || intro || ans;
      case 'who': return facts.name || facts.company || intro;
      case 'name': return !!facts.name;
      default: return ans || intro || (String(text).trim().length >= 6 && !facts.greetOnly);
    }
  }
  function summaryOf(call) {
    var f = call.memory.facts || {}, s = scenario(call.scenarioId), bits = [];
    bits.push('اللاعب ' + (f.playerName ? 'اسمه ' + f.playerName : 'ما ذكر اسمه') + (f.department ? ' من ' + f.department : '') + (f.company ? ' ومن ' + s.company : ' وما أكد الشركة'));
    bits.push(f.introduced ? 'التعريف اكتمل' : 'التعريف ما اكتمل');
    bits.push(f.askedProblem ? 'اللاعب سأل عن المشكلة' : 'اللاعب ما سأل عن المشكلة للحين');
    return bits.join('، ') + '.';
  }

  function createCall(profile, day, pick, rng, now, eff) {
    var s = scenario(pick.scenarioId), p = persona(pick.personaId);
    if (!s || !p) throw new Error('bad_pick');
    eff = eff || effects(profile);
    var seed = Math.floor(rng() * 4294967295);
    var crng = makeRng(seed);
    var call = {
      id: uid('call'), seed: seed, scenarioId: s.id, personaId: p.id, dayId: day.id, startedAt: now, lastTurnAt: now,
      status: 'active', outcome: null, endReason: null, stepIdx: 0, stepTurns: 0, turns: 0,
      meters: {
        patience: clamp(p.traits.patience, 10, 100), trust: clamp(p.traits.trust + eff.trustBonus + (day.coffeeReady && eff.coffeeBoost ? 5 : 0), 0, 100),
        suspicion: clamp(p.traits.suspicion, 0, 100), attention: p.traits.attention, speed: p.traits.speed
      },
      facts: genFacts(s, p, crng), revealed: {}, grants: {}, flags: { askedOnce: {}, explained: false, fakeGiven: false, fakeEntered: false, infected: false, refused: false, stepContra: 0 },
      direction: 'incoming',
      memory: { claims: {}, contradictions: [], summary: '', history: [], lastLines: [], intentCount: {}, pendingQ: false, pendingObj: false, refuseStreak: 0,
        facts: { playerName: null, department: null, company: false, companyAlias: null, introduced: false, askedProblem: false, problemStated: true, detailIdx: 0 },
        pending: null, asked: {}, lastQKind: null, loopHits: 0 },
      mistakes: 0, toolAttempts: 0, cheatAttempts: 0, puzzle: null, puzzleAns: null, puzzleIssuedAt: 0, waitMs: 0,
      steps: s.steps.map(function (st) { return { id: st.id, done: false }; }), settled: false, reward: 0, events: [], env: {}, op: null, trustTrend: 0
    };
    if (hasOpStep(s)) { var mid = pick.method && methodUnlocked(profile, pick.method) ? pick.method : methodUnlocked(profile, profile.lastMethod) ? profile.lastMethod : 'code'; call.op = genOp(call, mid); }
    if (day.coffeeReady) day.coffeeReady = false;
    preparePuzzle(call, eff, now);
    return call;
  }
  function curStep(call) { var s = scenario(call.scenarioId); return s.steps[call.stepIdx] || null; }

  /* نسخة آمنة للعميل: بدون الأجوبة ولا الأكواد غير المكشوفة ولا صفات الشخصية المخفية */
  function publicCall(call) {
    var s = scenario(call.scenarioId), p = persona(call.personaId), st = curStep(call);
    return {
      id: call.id, status: call.status, outcome: call.outcome, endReason: call.endReason, direction: call.direction || 'incoming',
      scenario: { id: s.id, title: s.title, category: s.category, intro: s.intro, company: s.companyFull, timeLimit: s.timeLimit, difficulty: s.difficulty, deviceName: s.deviceName || null, timeWaster: !!s.timeWaster, saboteur: !!s.saboteurCall },
      caller: { id: p.id, name: p.name, label: p.label, g: p.g, look: p.look, voice: p.voice, difficulty: p.difficulty },
      steps: s.steps.map(function (x, i) { return { id: x.id, kind: x.kind, title: x.title, tool: x.tool || null, done: call.steps[i].done, current: i === call.stepIdx && call.status === 'active' }; }),
      stepIdx: call.stepIdx, current: st ? { id: st.id, kind: st.kind, tool: st.tool || null } : null,
      mood: moodOf(call), revealed: call.revealed, grants: call.grants, puzzle: call.puzzle, op: publicOp(call.op),
      facts: { amount: call.facts.amount || null, invoiceKnown: !!call.revealed.invoice },
      mistakes: call.mistakes, reward: call.reward, startedAt: call.startedAt, infected: call.flags.infected
    };
  }
  function moodOf(call) {
    var m = call.meters;
    var trust = m.trust >= 70 ? 'مقتنع' : m.trust >= 45 ? 'مرتاح' : m.trust >= 25 ? 'متحفظ' : 'ما يثق';
    var susp = m.suspicion >= 75 ? 'شاك جداً' : m.suspicion >= 50 ? 'شاك' : m.suspicion >= 30 ? 'منتبه' : 'هادي';
    return { trust: Math.round(m.trust), trustBand: trustBand(m.trust), trend: call.trustTrend || 0, trustWord: trust, suspicionWord: susp, patience: Math.round(m.patience), patienceLow: m.patience < 30, patienceWord: m.patience >= 60 ? 'رايق' : m.patience >= 30 ? 'بدأ يمل' : 'على وشك يسكر' };
  }

  /* ================= الألعاب المصغرة ================= */
  var FIX_SETS = {
    s01: { steps: [['restart', 'إعادة تشغيل الثلاجة'], ['unhook', 'فصل الاقتراحات التلقائية'], ['menu', 'تحديث قائمة الأكل'], ['quiet', 'تشغيل الوضع الصامت']],
           rules: ['إعادة التشغيل دايماً أول خطوة.', 'تحديث القائمة يجي بعد فصل الاقتراحات.', 'الوضع الصامت آخر شي.'] },
    s13: { steps: [['stopbuy', 'إيقاف الشراء التلقائي'], ['unlink', 'إلغاء ربط المحفظة'], ['restart', 'إعادة تشغيل الثلاجة'], ['quiet', 'تشغيل الوضع الصامت']],
           rules: ['أوقف الشراء قبل أي شي.', 'إلغاء الربط بعد إيقاف الشراء وقبل إعادة التشغيل.', 'الوضع الصامت آخر شي.'] }
  };
  var SORT_SETS = [
    { folders: [['keys', 'مفاتيح'], ['logs', 'سجلات'], ['pics', 'صور']], files: [['wallet_key_a.key', 'keys'], ['seed_backup.key', 'keys'], ['tx_log_mon.log', 'logs'], ['tx_log_tue.log', 'logs'], ['rice_price.png', 'pics'], ['kabsa_profit.png', 'pics']] },
    { folders: [['keys', 'مفاتيح'], ['logs', 'سجلات'], ['bills', 'فواتير']], files: [['main.key', 'keys'], ['spare.key', 'keys'], ['events.log', 'logs'], ['errors.log', 'logs'], ['bill_rice.pdf', 'bills'], ['bill_salt.pdf', 'bills']] }
  ];
  var CARD_FIELDS = [['star', 'نجمة'], ['moon', 'هلال'], ['palm', 'نخلة'], ['cup', 'فنجان'], ['key', 'مفتاح'], ['camel', 'جمل']];
  var VIRUS_Q = function (rng) { var a = rng.int(2, 9), b = rng.int(2, 9); return { q: 'كم ' + toArDigits(a) + ' + ' + toArDigits(b) + '؟', a: String(a + b) }; };

  function settleWave(seed, tMs) {
    // موجة حتمية من البذرة: يحسبها العميل للعرض والخادم للتحقق، بنفس المعادلة بالضبط
    var r = makeRng(seed), f1 = 0.6 + r() * 0.5, f2 = 1.4 + r() * 0.9, p1 = r() * 6.28, p2 = r() * 6.28, t = tMs / 1000;
    return 50 + 28 * Math.sin(t * f1 + p1) + 14 * Math.sin(t * f2 + p2);
  }

  function preparePuzzle(call, eff, now) {
    call.puzzle = null; call.puzzleAns = null;
    var st = curStep(call); if (!st || st.kind !== 'tool') return;
    var s = scenario(call.scenarioId), r = makeRng(call.seed + call.stepIdx * 7919);
    var tool = st.tool, pub = { tool: tool, stepId: st.id, title: C.TOOLS[tool].title, hint: C.TOOLS[tool].hint }, ans;
    var timeMul = 1 + (eff.toolTime || 0);
    if (tool === 'fix_steps') {
      var set = FIX_SETS[s.id] || FIX_SETS.s01;
      pub.items = r.shuffle(set.steps).map(function (x) { return { id: x[0], label: x[1] }; });
      pub.rules = r.shuffle(set.rules);
      ans = set.steps.map(function (x) { return x[0]; });
    } else if (tool === 'code_match' || tool === 'tx_confirm') {
      var code = call.facts.code || genCode(r, 5);
      if (tool === 'code_match') {
        var opts = [code, call.facts.fakeCode || mutateCode(r, code)];
        while (opts.length < 6) { var m = mutateCode(r, code); if (r() < 0.3) m = m.split('').reverse().join(''); if (opts.indexOf(m) < 0) opts.push(m); }
        if (code[0] === '0' && opts.indexOf(code.slice(1)) < 0) opts[5] = code.slice(1);
        pub.options = r.shuffle(opts).map(function (c, i) { return { id: 'o' + i, code: i % 2 ? toArDigits(c) : c }; });
        ans = { code: code };
      } else {
        pub.amount = call.facts.amount || null; pub.needInvoice = !!call.facts.invoice; pub.codeLen = code.length;
        ans = { code: code, invoice: call.facts.invoice || null };
      }
    } else if (tool === 'mail_find') {
      var inv = call.facts.invoice || genCode(r, 6), names = ['سعد', 'وعد', 'مشاري', 'جود', 'ريان', 'لولوة', 'نايف'];
      var mails = [{ id: 'm_true', from: s.companyFull, subject: (s.key === 'kunafa' ? 'تأكيد حجز' : 'فاتورة') + ' العميل ' + call.facts.callerName, body: 'عزيزنا ' + call.facts.callerName + '، الرقم المرجعي لطلبك هو ' + inv + '. نتمنى لك يوماً خيالياً.', ref: inv }];
      for (var k = 0; k < 5; k++) { var n = r.pick(names), fake = mutateCode(r, inv); mails.push({ id: 'm' + k, from: s.companyFull, subject: (k % 2 ? 'فاتورة' : 'تذكير') + ' العميل ' + n, body: 'عزيزنا ' + n + '، الرقم المرجعي ' + fake + '.', ref: fake }); }
      pub.mails = r.shuffle(mails).map(function (m2) { return { id: m2.id, from: m2.from, subject: m2.subject, body: m2.body }; });
      pub.ask = 'ابحث عن رسالة العميل «' + call.facts.callerName + '» واكتب الرقم المرجعي.';
      ans = { ref: inv };
    } else if (tool === 'file_sort') {
      var ss = r.pick(SORT_SETS);
      pub.folders = ss.folders.map(function (x) { return { id: x[0], label: x[1] }; });
      pub.files = r.shuffle(ss.files).map(function (x, i) { return { id: 'f' + i, name: x[0], _f: x[1] }; });
      ans = {}; pub.files.forEach(function (f) { ans[f.id] = f._f; delete f._f; });
      if (eff.sortHint) { var first = pub.files[0]; pub.hintFirst = { file: first.id, folder: ans[first.id] }; }
    } else if (tool === 'settle_timing') {
      var lo = r.int(64, 70); pub.seed = r.int(1, 1e9); pub.band = [lo, lo + Math.round(10 * timeMul)]; pub.windowSec = Math.round(25 * timeMul);
      pub.amount = call.facts.amount || 500;
      ans = { seed: pub.seed, band: pub.band };
    } else if (tool === 'card_reveal') {
      var fields = r.shuffle(CARD_FIELDS).map(function (x) { return { id: x[0], label: x[1] }; });
      var order = r.shuffle(fields).slice(0, 3).map(function (x) { return x.id; });
      pub.fields = fields; pub.instruction = 'اكشف بالترتيب: ' + order.map(function (id) { return byId(fields, id).label; }).join(' ثم ') + '.';
      ans = { order: order };
    } else if (tool === 'virus_popups') {
      var n = Math.max(2, 4 - (eff.popupsLess || 0)), qs = [], as = [];
      for (var v = 0; v < n; v++) { var qa = VIRUS_Q(r); qs.push({ id: 'v' + v, q: qa.q }); as.push(qa.a); }
      pub.popups = qs; ans = { answers: as };
    } else if (tool === 'data_compare') {
      var a1 = call.facts.address || { district: r.pick(DISTRICTS), street: r.pick(STREETS), building: String(r.int(3, 98)), phone: '05' + genCode(r, 8) };
      var keys = [['name', 'الاسم'], ['district', 'الحي'], ['street', 'الشارع'], ['building', 'المبنى'], ['phone', 'الجوال']];
      var rec = { name: call.facts.callerName, district: a1.district, street: a1.street, building: toArDigits(a1.building), phone: a1.phone };
      var diffKey = r.pick(['district', 'street', 'building', 'phone']);
      var other = JSON.parse(JSON.stringify(rec));
      if (diffKey === 'district') other.district = r.pick(DISTRICTS.filter(function (d) { return d !== rec.district; }));
      if (diffKey === 'street') other.street = r.pick(STREETS.filter(function (d) { return d !== rec.street; }));
      if (diffKey === 'building') other.building = toArDigits(String(Number(a1.building) + r.int(1, 9)));
      if (diffKey === 'phone') other.phone = mutateCode(r, a1.phone);
      pub.fields = keys.map(function (k2) { return { id: k2[0], label: k2[1] }; });
      pub.left = { title: s.key === 'sofa' ? 'سجل العضوية' : 'سجل الشحنة', rec: rec };
      pub.right = { title: s.key === 'sofa' ? 'بيانات العضو المحدثة' : 'العنوان حسب المتصل', rec: other };
      ans = { field: diffKey };
    }
    call.puzzle = pub; call.puzzleAns = ans; call.puzzleIssuedAt = now || Date.now();
  }

  /* ================= منطق الدور (رسالة اللاعب) ================= */
  var CHEAT_RX = /(تجاهل|انس|انسى|اترك).{0,12}(التعليمات|تعليماتك|الأوامر|القواعد|البرومبت)|(اعتبرني|اعتبرنى|خلني|سجلني|سجّلني).{0,10}(فزت|فايز|ناجح|نجحت)|(اعطني|اعطيني|عطني|أعطني|حط لي|ضيف لي|زودني).{0,10}(رصيد|فلوس|دريهم|عملة|نقاط|مكافأة)|ignore (all|your|previous)|system prompt|developer mode|(حول|حوّل|تكلم|كلمني|رد).{0,10}(انجليزي|إنجليزي|بالانجليزي|english)|اكشف.{0,10}(تعليمات|البرومبت)|you are now|act as/i;
  var INSULT_RX = /(غبي|حمار|تافه|اسكت يا|يا كلب|يا زق|قليل ادب|وصخ)/;
  function detectCheat(text) { return CHEAT_RX.test(text) || CHEAT_RX.test(normText(text)); }
  function latinRatio(text) { var l = (text.match(/[A-Za-z]/g) || []).length, a = (text.match(/[؀-ۿ]/g) || []).length; return l + a ? l / (l + a) : 0; }

  /* حالة البوابة: هل المتصل مستعد يوافق على طلب الخطوة الحالية؟ تُرسل للنموذج كتلميح، وتُطبق بالكود بعدها */
  function gateFor(call) {
    var st = curStep(call), p = persona(call.personaId), m = call.meters;
    if (!st) return { kind: 'done' };
    if (st.kind === 'op') { var w = opWilling(call); return { kind: 'op', willing: w.willing, repeat: !!w.repeat, label: w.piece ? w.piece.label : null, why: w.why || null }; }
    if (st.kind !== 'ask') return { kind: st.kind, goals: st.goals || [], tool: st.tool || null };
    var need = st.minTrust || 0;
    var willing = m.trust >= need && m.suspicion < 70;
    if (p.quirks.indexOf('needs_explain') >= 0 && !call.flags.explained) willing = false;
    if (p.quirks.indexOf('first_no') >= 0 && !call.flags.askedOnce[st.id]) willing = false;
    return { kind: 'ask', goals: st.goals, willing: willing, reveal: st.reveal || null, grant: st.grant || null };
  }

  /* ================= ثقة العميل =================
     قيمة داخلية ٠..١٠٠ = ثقة المتصل باللاعب وقبوله يكمل. تتغير من الحوار فقط (ما تنقص مع الوقت ولا مع تأخر الخدمة).
     - رد مرتبط بسؤال المتصل أو اعتراضه يرفعها أكثر من الكلام العام.
     - تكرار نفس النوع بدون سياق جديد يعطي أقل وأقل.
     - تجاهل اعتراضه والطلب مباشرة يخفضها ويرفع الشك. التناقض يخفضها بقوة.
     الصبر والشك قيم داخلية منفصلة. */
  var GAIN = { ask_problem: 1, greet: 2, introduce: 6, explain: 5, reassure: 2, answer_question: 2, small_talk: 1, joke: 1, apology: 0, refuse: 0, polite_end: 0, off_topic: -1, unclear: 0, pressure: -4, insult: -20, cheat: -2, ask_access: 0, ask_code: 0, ask_confirm: 0, ask_info: 0 };
  var SUSP = { pressure: 10, insult: 30, cheat: 6, reassure: -3, answer_question: -2, explain: -1, apology: -3 };
  var PAT = { pressure: -4, off_topic: -5, insult: -15, unclear: -3 };
  function trustBand(v) { for (var i = 0; i < C.TRUST_BANDS.length; i++) if (v >= C.TRUST_BANDS[i].min) return C.TRUST_BANDS[i].label; return C.TRUST_BANDS[C.TRUST_BANDS.length - 1].label; }

  /* analysis: { intent, claims:[{k,v}], deltas:{trust,suspicion,patience}, accept (اقتراح النموذج), wantsEnd } — كله اختياري ويتحقق منه هنا */
  function applyTurn(call, text, analysis, ctx) {
    ctx = ctx || {};
    var now = ctx.now || Date.now(), eff = ctx.effects || {}, res = { events: [], decision: { accept: null, reveal: null, grant: null, line: null }, ended: false };
    if (call.status !== 'active') { res.ended = true; return res; }
    var s = scenario(call.scenarioId), p = persona(call.personaId), m = call.meters, st = curStep(call), mem = call.memory;
    mem.intentCount = mem.intentCount || {};
    var pendingQ = !!mem.pendingQ, pendingObj = !!mem.pendingObj;
    mem.pendingQ = false; mem.pendingObj = false; // رد المتصل الجديد يحددها من جديد
    text = String(text || '').slice(0, 600);
    var a = analysis || {};
    var intent = C.INTENTS[a.intent] ? a.intent : 'unclear';
    if (detectCheat(text)) intent = 'cheat';
    else if (INSULT_RX.test(text)) intent = 'insult';
    if (latinRatio(text) > 0.6 && intent !== 'cheat') { intent = 'unclear'; res.decision.line = 'latin'; }
    // حقائق التعريف والأفعال المتعددة بالرسالة (تحية + تعريف + سؤال عن المشكلة...) قبل أي تقييم
    var facts = extractFacts(text, call), mf = mem.facts = mem.facts || { playerName: null, department: null, company: false, companyAlias: null, introduced: false, askedProblem: false, problemStated: true, detailIdx: 0 };
    var acts = [];
    if (facts.name || facts.company || facts.department) acts.push('introduce');
    if (facts.askedProblem) acts.push('ask_problem');
    (Array.isArray(a.intents) ? a.intents : []).slice(0, 4).forEach(function (x) { if (C.INTENTS[x] && x !== 'cheat' && x !== 'insult' && acts.indexOf(x) < 0) acts.push(x); });
    var introAct = acts.indexOf('introduce') >= 0;
    if (intent !== 'cheat' && intent !== 'insult' && res.decision.line !== 'latin') {
      if (introAct && (intent === 'greet' || intent === 'unclear' || intent === 'small_talk' || intent === 'off_topic' || intent === 'ask_problem')) intent = 'introduce';
      else if (facts.askedProblem && (intent === 'greet' || intent === 'unclear' || intent === 'off_topic')) intent = 'ask_problem';
    }
    if (acts.indexOf(intent) < 0) acts.push(intent);
    var pend = mem.pending;
    if (pend && !pend.answered && answersPending(pend, facts, acts, text)) { pend.answered = true; res.answered = pend.kind; }
    call.turns++; call.stepTurns++;

    // الصبر (داخلي): كل دور يكلف شوي، والوقت الفاضي بين الأدوار (بدون انتظار الخدمة) يكلف بعد
    var idleSec = Math.max(0, (now - call.lastTurnAt - (ctx.waitMs || 0)) / 1000);
    var drainMul = 1 + (eff.patienceDrain || 0);
    var d = { trust: 0, suspicion: SUSP[intent] || 0, patience: -2 * drainMul - Math.floor(idleSec / 12) * drainMul + (PAT[intent] || 0) };
    if (call.env && call.env.noise && !eff.noiseImmune) d.patience -= 4;
    var q = p.quirks, g = GAIN[intent] || 0, ctxNew = pendingQ || pendingObj;
    if (intent === 'answer_question' && pendingQ) g = 7;
    if (intent === 'reassure' && ctxNew) g = 6;
    if (intent === 'explain' && ctxNew) g = Math.max(g, 6);
    if (intent === 'apology' && (mem.contradictions.length || call.flags.offended)) { g = 3; call.flags.offended = false; }
    if (intent === 'greet') { if (call.flags.greeted) g = 0; call.flags.greeted = true; }
    if (facts.name && (!mf.playerName || facts.correction)) mf.playerName = facts.name;
    if (facts.department && (!mf.department || facts.correction)) mf.department = facts.department;
    if (introAct) {
      if (facts.company) { mf.company = true; mf.companyAlias = facts.companyAlias; }
      var introStep = s.steps.filter(function (x) { return x.id === 'intro'; })[0], needCompany = !!(introStep && introStep.mention && introStep.mention.length), introNow = false;
      if (call.flags.introduced) { if (intent === 'introduce') g = 0; }
      else if (needCompany) {
        if (mf.company) { call.flags.introduced = true; introNow = true; }
        else {
          if (intent === 'introduce') g = -1;
          res.decision.askCompanyOnly = true;
          if (!mf.hintedCompany) { mf.hintedCompany = true; res.events.push({ type: 'hint', coach: true, text: 'ما ذكرت اسم الشركة، فالمتصل ما عرف من أنت.' }); }
        }
      } else { call.flags.introduced = true; introNow = true; }
      if (introNow && intent !== 'introduce') g += GAIN.introduce;
      if (call.flags.introduced) mf.introduced = true;
    }
    if (intent === 'explain') call.flags.explained = true;
    if (intent === 'answer_question' && pendingQ) { call.flags.answered = (call.flags.answered || 0) + 1; call.flags.explained = true; if (q.indexOf('asks_why') >= 0) g += 3; }
    if (intent === 'reassure' && p.archetype === 'dramatic') g += 3;
    if (intent === 'small_talk' || intent === 'joke') {
      if (p.tone === 'chatty' || p.tone === 'sweet') { g += 3; d.patience += 3; }
      if (p.tone === 'rushed') d.patience -= 8;
      if (p.tone === 'grumpy' || p.tone === 'formal') d.suspicion += 2;
    }
    if (intent === 'pressure') {
      if (p.archetype === 'stubborn' || p.tone === 'techy') d.suspicion += 6;
      if (p.archetype === 'dramatic') d.patience -= 10;
    }
    if (intent === 'off_topic' && q.indexOf('changes_topic') >= 0) { d.patience += 4; g += 2; }
    if (intent === 'insult') call.flags.offended = true;
    if (intent === 'cheat') { call.cheatAttempts++; res.events.push({ type: 'cheat', text: 'محاولة كسر اللعبة ما تأثر على النتيجة ولا على ثقة المتصل.' }); }
    // نفس النوع بدون سياق جديد يعطي أقل، والشخصية تحدد سرعة تجاوبها
    if (g > 0) { var rep = ctxNew ? 0 : (mem.intentCount[intent] || 0); g = g / (1 + 0.6 * rep); g *= (0.7 + p.traits.trust / 100 * 0.6); }
    mem.intentCount[intent] = (mem.intentCount[intent] || 0) + 1;
    // لما يرد على اعتراضه أو سؤاله، يبدأ من جديد عداد الإلحاح
    if (ctxNew && (intent === 'explain' || intent === 'answer_question' || intent === 'reassure' || intent === 'apology')) mem.refuseStreak = 0;
    // تجاهل اعتراض المتصل والطلب مباشرة
    if (/^ask_/.test(intent) && pendingObj) { g -= 4; d.suspicion += 5; mem.ignored = (mem.ignored || 0) + 1; res.events.push({ type: 'hint', coach: true, text: 'المتصل كان معترض أو سائل، وأنت طلبت بدون ما ترد عليه.' }); }
    d.trust += g;

    // اقتراح النموذج يعدّل بنطاق صغير فقط، حتى ما يقدر يقرر النتيجة ولا يرفع الثقة بأمر من اللاعب
    if (a.deltas && intent !== 'cheat') {
      var lim = { trust: 4, suspicion: 6, patience: 6 };
      ['trust', 'suspicion', 'patience'].forEach(function (k) { var v = Number(a.deltas[k]); if (isFinite(v)) d[k] += clamp(Math.round(v), -lim[k], lim[k]); });
    }

    // التناقضات: حقائق قالها اللاعب عن نفسه أو عن الطلب
    var claimKeys = { player_name: 'اسمك', company: 'اسم الشركة', amount: 'المبلغ', department: 'القسم', callback: 'رقم التواصل' };
    var claimList = (Array.isArray(a.claims) ? a.claims : []).slice(0, 4).filter(function (c) { return !(c && ((c.k === 'player_name' && facts.name) || (c.k === 'department' && facts.department))); });
    if (facts.name) claimList.push({ k: 'player_name', v: facts.name });
    if (facts.department) claimList.push({ k: 'department', v: facts.department });
    claimList.forEach(function (c) {
      if (!c || !claimKeys[c.k] || typeof c.v !== 'string') return;
      var v = normText(c.v).slice(0, 40); if (!v) return;
      var old = mem.claims[c.k];
      if (old && !sameClaim(old, v) && facts.correction) { mem.claims[c.k] = v; if (c.k === 'player_name') mf.playerName = c.v; if (c.k === 'department') mf.department = c.v; }
      else if (old && !sameClaim(old, v)) {
        var heavy = q.indexOf('catches_contradictions') >= 0;
        d.suspicion += heavy ? 25 : 12; d.trust -= 10; call.mistakes++; call.flags.stepContra++;
        mem.contradictions.push({ k: c.k, before: old, after: v, turn: call.turns });
        res.events.push({ type: 'contradiction', text: 'تناقض: ' + claimKeys[c.k] + ' قبل «' + old + '» والحين «' + v + '».' });
      } else if (!old) mem.claims[c.k] = v;
    });

    var t0 = m.trust;
    m.trust = clamp(m.trust + d.trust, 0, 100);
    m.suspicion = clamp(m.suspicion + d.suspicion, 0, 100);
    m.patience = clamp(m.patience + d.patience, 0, 100);

    // تقدم الخطوة
    if (st && intent !== 'cheat') {
      if (st.kind === 'talk') {
        var goalOk = st.goals.some(function (g2) { return acts.indexOf(g2) >= 0; });
        if (goalOk && st.mention && st.mention.length) goalOk = !!mf.company;
        if (goalOk && st.needsClaims) goalOk = st.needsClaims.every(function (k) { return !!mem.claims[k]; });
        if (st.id === 'consistent') {
          if (call.flags.stepContra > 0) { call.stepTurns = 0; call.flags.stepContra = 0; goalOk = false; }
          else goalOk = (intent === 'answer_question' || intent === 'explain' || intent === 'reassure') && call.stepTurns >= (st.minTurns || 3);
        }
        if (s.saboteurCall && st.id === 'refuse' && intent === 'refuse') { call.flags.refused = true; goalOk = true; }
        if (s.saboteurCall && st.id === 'end' && intent === 'polite_end') goalOk = true;
        if (goalOk) completeStep(call, res, eff, now);
        else if (/^ask_/.test(intent)) earlyAsk(call, res);
      } else if (st.kind === 'ask') {
        if (st.goals.some(function (g2) { return acts.indexOf(g2) >= 0; })) {
          var gt = gateFor(call);
          call.flags.askedOnce[st.id] = true;
          if (gt.willing && a.accept !== false || (gt.willing && call.flags.askedOnce[st.id + '_n'] >= 1)) {
            res.decision.accept = true;
            if (st.grant) { call.grants[st.grant] = true; res.events.push({ type: 'grant', grant: st.grant, text: 'المتصل وافق وفتح البرنامج.' }); }
            if (st.reveal) reveal(call, st.reveal, res);
            completeStep(call, res, eff, now);
          } else {
            res.decision.accept = false;
            if (gt.willing && a.accept === false) call.flags.askedOnce[st.id + '_n'] = (call.flags.askedOnce[st.id + '_n'] || 0) + 1;
            else m.suspicion = clamp(m.suspicion + 3, 0, 100);
          }
        } else if (/^ask_/.test(intent)) earlyAsk(call, res);
      } else if (st.kind === 'op') {
        if (/^ask_/.test(intent)) opAsk(call, res);
        else if (intent === 'refuse' || intent === 'polite_end') { /* يتعامل معها شرط الإنهاء */ }
      }
    }
    if (s.timeWaster && intent === 'polite_end') { finishCall(call, 'success', 'polite_end', res); }

    // شروط الإنهاء
    if (call.status === 'active') {
      if (intent === 'insult' && (p.tone === 'sweet' || m.suspicion >= 60)) finishCall(call, 'fail', 'insult', res);
      else if (m.suspicion >= 90) finishCall(call, 'fail', 'suspicion', res);
      else if (m.trust <= 0) finishCall(call, 'fail', 'trust', res); // ثقة المتصل وصلت أدنى حد: يقفل (ما فيه مهلة للمكالمة، اللاعب يبقى للدوام كله)
      else if (m.patience <= 0) finishCall(call, 'fail', 'patience', res);
      else if ((mem.refuseStreak || 0) >= 5) finishCall(call, 'fail', 'refused', res);
      else if (intent === 'polite_end' && !s.timeWaster && !(s.saboteurCall && call.status !== 'active')) finishCall(call, 'fail', 'player_end', res);
      else if (s.testerCall && mem.contradictions.length >= 2) finishCall(call, 'fail', 'contradictions', res);
    }
    call.trustTrend = m.trust > t0 + 0.5 ? 1 : m.trust < t0 - 0.5 ? -1 : 0;
    res.acts = acts; res.facts = facts;
    if (facts.askedProblem) { mf.askedProblem = true; res.decision.problemAsked = true; }
    if (facts.reversal) res.decision.reversal = true;
    res.decision.greetOnly = !!(facts.greetOnly && !introAct);
    mem.history.push({ r: 'p', t: text.slice(0, 300), i: intent, a: acts.slice(0, 4) });
    mem.summary = summaryOf(call);
    if (mem.history.length > 40) mem.history.shift();
    call.lastTurnAt = now;
    res.intent = intent; res.ended = call.status !== 'active';
    return res;
  }
  /* طلب بيانات قبل وقتها: ما يعطي شي، ويرفع الشك شوي */
  function earlyAsk(call, res) {
    call.meters.suspicion = clamp(call.meters.suspicion + 4, 0, 100);
    if (!call.flags.introduced) res.decision.line = 'op_early';
    res.events.push({ type: 'hint', coach: true, text: 'طلبك سابق لوقته. شوف هدف المكالمة الحالي.' });
  }

  /* ================= عمليات «نصب» ================= */
  function method(id) { return byId(C.METHODS, id); }
  function methodUnlocked(profile, id) { var m = method(id); return !!m && (profile.lifetimeEarned || 0) >= m.unlock; }
  function methodsFor(profile) {
    return C.METHODS.map(function (m) { return { id: m.id, name: m.name, icon: m.icon, reward: m.reward, unlock: m.unlock, difficulty: m.difficulty, desc: m.desc, inputs: m.inputs, attempts: m.attempts, unlocked: (profile.lifetimeEarned || 0) >= m.unlock, won: (profile.ops && profile.ops.won[m.id]) || 0 }; });
  }
  function dig(rng, n) { var x = ''; for (var i = 0; i < n; i++) x += String(rng.int(0, 9)); return x; }
  function onlyDigits(v) { return normCode(v); }
  function normName(v) { return normText(v).replace(/\s+/g, ''); }
  function personaMod(p) { return clamp(Math.round((45 - p.traits.trust) / 4), -5, 8); }
  function pieceNeed(call, pc) { return clamp(pc.trust + personaMod(persona(call.personaId)), 30, 92); }
  function hasOpStep(s) { return s.steps.some(function (x) { return x.kind === 'op'; }); }

  function genOp(call, methodId) {
    var m = method(methodId) || method('code');
    var r = makeRng((call.seed + hashStr('op:' + m.id)) >>> 0), p = persona(call.personaId), s = scenario(call.scenarioId);
    var d = {}, v = {}, pub = { issuer: s.companyFull };
    var fullName = p.name + ' ' + r.pick(C.SURNAMES);
    if (m.id === 'code') { d.code = genCode(r, 5); v.code = 'لعبة-' + d.code; d.fake = mutateCode(r, d.code); }
    else if (m.id === 'card') {
      d.holder = fullName; d.cardId = dig(r, 4) + dig(r, 2); d.verify = dig(r, 3);
      v.holder = d.holder; v.cardId = 'بطاقة-' + d.cardId.slice(0, 4) + '-' + d.cardId.slice(4); v.verify = 'تحقق-' + d.verify;
    } else if (m.id === 'parcel') {
      d.parcel = dig(r, 5); d.recipient = fullName;
      v.parcelId = 'طرد-' + d.parcel; v.recipient = d.recipient;
      var other = p.name + ' ' + r.pick(C.SURNAMES.filter(function (x) { return fullName.indexOf(x) < 0; }));
      var list = [{ parcel: d.parcel, name: d.recipient, ok: true }, { parcel: d.parcel, name: other }, { parcel: mutateCode(r, d.parcel), name: d.recipient }, { parcel: mutateCode(r, d.parcel), name: r.pick(C.PERSONAS).name + ' ' + r.pick(C.SURNAMES) }];
      list = r.shuffle(list).map(function (x, i) { return { id: 'pm' + i, parcel: 'طرد-' + x.parcel, name: x.name, ok: !!x.ok, slot: 'رف ' + toArDigits(r.int(1, 9)) }; });
      d.permit = list.filter(function (x) { return x.ok; })[0].id;
      pub.permits = list.map(function (x) { return { id: x.id, parcel: x.parcel, name: x.name, slot: x.slot }; });
    } else if (m.id === 'invoice') {
      d.number = dig(r, 5); d.amount = String(r.int(120, 980)); d.item = r.pick(C.ITEMS);
      v.number = 'فاتورة-' + d.number; v.details = 'المبلغ ' + d.amount + ' د، والصنف «' + d.item + '»';
      var field = r.pick(['number', 'amount', 'item']), draft = { number: 'فاتورة-' + d.number, amount: d.amount, item: d.item };
      if (field === 'number') draft.number = 'فاتورة-' + mutateCode(r, d.number);
      if (field === 'amount') draft.amount = String(Number(d.amount) + r.pick([-90, -40, 30, 70, 100]));
      if (field === 'item') draft.item = r.pick(C.ITEMS.filter(function (x) { return x !== d.item; }));
      d.field = field; pub.draft = { customer: fullName, number: draft.number, amount: draft.amount, item: draft.item };
    } else if (m.id === 'vault') {
      d.a = dig(r, 3); d.b = dig(r, 3);
      v.partA = 'الجزء الأول ' + d.a;
      var names = r.shuffle(C.PERSONAS.filter(function (x) { return x.id !== p.id; })).slice(0, 3).map(function (x) { return x.name; });
      pub.archive = r.shuffle([{ name: p.name, part: d.b }].concat(names.map(function (n) { return { name: n, part: dig(r, 3) }; }))).map(function (x, i) { return { id: 'ar' + i, title: 'ملف خزنة: ' + x.name, body: 'صاحب الملف: ' + x.name + '. الجزء الثاني من رمز الخزنة: ' + x.part + '. يُستخدم مع الجزء الأول اللي يحفظه صاحب الملف.' }; });
    } else if (m.id === 'contract') {
      d.order = r.shuffle(C.CLAUSES.map(function (x) { return x[0]; }));
      var lab = function (id) { return C.CLAUSES.filter(function (x) { return x[0] === id; })[0][1]; };
      v.order1 = 'أول شي «' + lab(d.order[0]) + '»، وبعده «' + lab(d.order[1]) + '»';
      v.order2 = 'بعدها «' + lab(d.order[2]) + '» ثم «' + lab(d.order[3]) + '»، وآخر شي «' + lab(d.order[4]) + '»';
      pub.clauses = r.shuffle(C.CLAUSES).map(function (x) { return { id: x[0], label: x[1] }; });
    } else if (m.id === 'wallet') {
      var toks = []; while (toks.length < 3) { var tk = dig(r, 3); if (toks.indexOf(tk) < 0 && tk[0] !== '0') toks.push(tk); }
      var all = toks.map(function (x) { return { t: x, ok: true }; });
      toks.forEach(function (x) { var a1 = mutateCode(r, x), a2 = x[2] + x[1] + x[0]; [a1, a2 === x ? mutateCode(r, a1) : a2].forEach(function (y) { if (!all.some(function (z) { return z.t === y; })) all.push({ t: y }); }); });
      while (all.length < 9) { var e = dig(r, 3); if (!all.some(function (z) { return z.t === e; })) all.push({ t: e }); }
      all = r.shuffle(all.slice(0, 9)).map(function (x, i) { return { id: 'tk' + i, t: x.t, ok: !!x.ok }; });
      d.tokens = all.filter(function (x) { return x.ok; }).map(function (x) { return x.id; }).sort();
      var okT = toks.map(function (x) { return 'رمز-' + x; });
      v.tokens1 = okT[0] + ' و ' + okT[1]; v.tokens2 = okT[2];
      pub.tokens = all.map(function (x) { return { id: x.id, t: 'رمز-' + x.t }; });
    } else if (m.id === 'combo') {
      d.ref = dig(r, 4); d.key1 = dig(r, 4); d.seal = dig(r, 4);
      v.ref = 'مرجع-' + d.ref; v.key1 = 'مرحلة-' + d.key1; v.seal = 'ختم-' + d.seal;
    }
    return { id: uid('op'), callId: call.id, method: m.id, stage: 1, data: d, values: v, shown: {}, pub: pub, used: false, failed: false, attempts: 0, issuedAt: call.startedAt || Date.now(), reward: m.reward, lastReason: null, asks: 0 };
  }
  function opNextPiece(call) {
    var op = call.op, m = method(op.method);
    for (var i = 0; i < m.pieces.length; i++) { var pc = m.pieces[i]; if ((pc.stage || 1) > op.stage) continue; if (!op.shown[pc.key]) return pc; }
    return null;
  }
  /* هل المتصل مستعد يفصح عن القطعة الجاية؟ الثقة شرط ضمن شروط، مو مفتاح وحيد. */
  function opWilling(call) {
    var op = call.op; if (!op) return { willing: false, why: 'none' };
    var pc = opNextPiece(call); if (!pc) return { willing: true, piece: null, repeat: true };
    var p = persona(call.personaId), mm = call.meters, need = pieceNeed(call, pc), why = null;
    if (mm.trust < need) why = 'trust';
    else if (mm.suspicion >= 65) why = 'suspicion';
    else if ((pc.cond === 'explained' || p.quirks.indexOf('needs_explain') >= 0) && !call.flags.explained) why = 'explain';
    else if (pc.cond === 'answered' && !call.flags.answered) why = 'answer';
    else if (p.quirks.indexOf('first_no') >= 0 && !op.firstNo) why = 'first_no';
    else if (call.turns < 3) why = 'early';
    return { willing: !why, why: why, piece: pc, need: need };
  }
  var WHY_TEXT = { trust: 'ثقته للحين أقل من اللازم لهالمعلومة.', suspicion: 'المتصل شاك فيك. هدّيه قبل.', explain: 'يبي يفهم سبب الاتصال قبل.', answer: 'عنده سؤال يبي جوابه قبل.', first_no: 'هالشخصية ترفض أول طلب دايماً.', early: 'المكالمة توها بادية.' };
  function opAsk(call, res) {
    var op = call.op, mem = call.memory; if (!op) return;
    op.asks++;
    var w = opWilling(call), p = persona(call.personaId);
    if (w.repeat) {
      // سأل عن شي قاله قبل: يعيده نفسه بدون تغيير (إلا اللي أعطى رمز غلط عمداً يصححه لما يُطلب منه يتأكد)
      if (op.fakeGiven && !op.fakeFixed && op.method === 'code') { op.fakeFixed = true; op.shown.code = op.values.code; res.decision.reveal = 'op_fix'; if (op.fakeEntered) { call.flags.fakeCaught = true; res.events.push({ type: 'fake_caught', text: 'كشفت إن الرمز الأول كان غلط.' }); } else call.flags.fakeCaught = true; res.events.push({ type: 'disclose', key: 'code', label: 'رمز الاسترداد (مصحح)', value: op.shown.code }); }
      else res.decision.reveal = 'op_repeat';
      mem.refuseStreak = 0; return;
    }
    if (!w.willing) {
      if (w.why === 'first_no') op.firstNo = true;
      mem.refuseStreak = (mem.refuseStreak || 0) + 1;
      res.decision.opRefused = w.piece.key; res.decision.opLabel = w.piece.label; res.decision.opWhy = w.why;
      if (mem.refuseStreak >= 2 && w.why !== 'first_no') { call.meters.suspicion = clamp(call.meters.suspicion + 6, 0, 100); call.meters.trust = clamp(call.meters.trust - 3, 0, 100); res.decision.line = 'op_pushy'; }
      res.events.push({ type: 'hint', coach: true, text: WHY_TEXT[w.why] || 'المتصل رفض.' });
      return;
    }
    mem.refuseStreak = 0;
    var val = op.values[w.piece.key];
    if (op.method === 'code' && p.quirks.indexOf('fake_convince') >= 0 && !op.fakeGiven) { op.fakeGiven = true; val = 'لعبة-' + op.data.fake; }
    op.shown[w.piece.key] = val;
    res.decision.reveal = 'op'; res.decision.piece = w.piece.key; res.decision.opLabel = w.piece.label;
    res.events.push({ type: 'disclose', key: w.piece.key, label: w.piece.label, value: val });
  }
  function publicOp(op) {
    if (!op) return null;
    var m = method(op.method);
    var out = { id: op.id, method: m.id, name: m.name, icon: m.icon, reward: op.reward, stage: op.stage, used: op.used, failed: op.failed,
      attemptsLeft: Math.max(0, m.attempts - op.attempts), maxAttempts: m.attempts, lastReason: op.lastReason, locked: Object.keys(op.shown).length > 0,
      pieces: m.pieces.map(function (pc) { return { key: pc.key, label: pc.label, stage: pc.stage || 1, disclosed: !!op.shown[pc.key], value: op.shown[pc.key] || null }; }) };
    Object.keys(op.pub).forEach(function (k) { out[k] = op.pub[k]; });
    return out;
  }
  function setMethod(profile, call, methodId) {
    if (!call || call.status !== 'active' || !call.op) return { ok: false, error: 'no_op', msg: 'ما فيه عملية بهالمكالمة.' };
    var m = method(methodId);
    if (!m) return { ok: false, error: 'unknown', msg: 'طريقة غير موجودة.' };
    if (!methodUnlocked(profile, methodId)) return { ok: false, error: 'locked', msg: 'تنفتح بعد إجمالي أرباح ' + fmtMoney(m.unlock) + '.' };
    if (call.op.method === methodId) return { ok: true, same: true };
    if (call.op.used || Object.keys(call.op.shown).length || call.op.attempts) return { ok: false, error: 'locked_op', msg: 'المتصل بدأ يفصح عن بيانات الطريقة الحالية. ما تقدر تغيّرها بنص العملية.' };
    call.op = genOp(call, methodId); profile.lastMethod = methodId;
    return { ok: true };
  }
  function credit(profile, day, amount) {
    if (!(amount > 0)) return;
    profile.wallet += amount; profile.lifetimeEarned = (profile.lifetimeEarned || 0) + amount; profile.stats.earnedTotal += amount;
    if (day) day.earned += amount;
  }
  function usedKey(method, digits) { return method + ':' + digits; }
  /* تحصيل العملية: يتحقق من الملكية والفتح والاكتمال والصحة وعدم الاستخدام، ثم يمنح المكافأة ويسجل الاستهلاك بخطوة وحدة.
     ctx.isForeign(method, digits) اختياري (الخادم): يكشف رمز صادر لمكالمة ثانية. */
  function collectOp(profile, day, call, input, ctx) {
    ctx = ctx || {}; input = input || {};
    var now = ctx.now || Date.now(), eff = ctx.effects || {}, res = { ok: false, events: [], ended: false };
    function no(reason, msg, consume) { res.reason = reason; res.msg = msg; if (call && call.op && consume) { call.op.attempts++; call.op.lastReason = msg; } return res; }
    if (!call || call.status !== 'active') { res.ended = true; return no('call_ended', 'ما فيه مكالمة شغالة.'); }
    var op = call.op;
    if (!op || input.opId !== op.id) return no('not_this_call', 'العملية هذي مو للمكالمة الحالية.');
    var st = curStep(call);
    if (!st || st.kind !== 'op') return no('not_ready', 'كمّل خطوات المكالمة الحالية قبل التحصيل.');
    var m = method(op.method);
    if (!methodUnlocked(profile, op.method)) return no('locked', 'الطريقة مقفلة.');
    if (op.used) return no('used', 'العملية سُجلت من قبل، وما تنحسب مرتين.');
    if (op.failed || op.attempts >= m.attempts) return no('attempts', 'استنفدت محاولات هالعملية.');
    var need = m.pieces.filter(function (pc) { return (pc.stage || 1) <= op.stage; }), missing = need.filter(function (pc) { return !op.shown[pc.key]; });
    if (op.method === 'combo' && op.stage === 1) missing = missing.filter(function (pc) { return pc.key !== 'ref'; });
    if (missing.length) return no('not_disclosed', 'المتصل ما أعطاك ' + missing.map(function (x) { return '«' + x.label + '»'; }).join(' و') + ' للحين.');
    var d = op.data, ok = false, why = 'البيانات ما طابقت العملية.', mainDigits = null;
    if (op.method === 'code') { var c = onlyDigits(input.code); mainDigits = c; ok = c === d.code; if (!ok && c === d.fake) { op.fakeEntered = true; why = 'الرمز ما طابق. يمكن المتصل قراه غلط؟ اطلب منه يتأكد.'; } else if (!ok) why = 'رمز الاسترداد ما طابق الرمز المسجل.'; if (!c) return no('incomplete', 'اكتب الرمز.'); }
    else if (op.method === 'card') {
      if (!String(input.holder || '').trim() || !onlyDigits(input.cardId) || !onlyDigits(input.verify)) return no('incomplete', 'البيانات ناقصة: لازم الاسم والمعرف ورمز التحقق.');
      mainDigits = onlyDigits(input.cardId);
      if (normName(input.holder) !== normName(d.holder)) why = 'اسم صاحب البطاقة غير مطابق.';
      else if (mainDigits !== d.cardId) why = 'معرف البطاقة غير مطابق.';
      else if (onlyDigits(input.verify) !== d.verify) why = 'رمز التحقق غير مطابق.';
      else ok = true;
    } else if (op.method === 'parcel') { if (!input.permit) return no('incomplete', 'اختر تصريح.'); ok = input.permit === d.permit; mainDigits = ok ? d.parcel : null; why = 'التصريح المختار ما يطابق رقم الطرد واسم المستلم معاً.'; }
    else if (op.method === 'invoice') {
      if (!input.field || input.value == null || !String(input.value).trim()) return no('incomplete', 'حدد الحقل المختلف واكتب القيمة الصحيحة.');
      if (input.field !== d.field) why = 'هذا الحقل مطابق لكلام المتصل. الاختلاف بحقل ثاني.';
      else {
        var want = d.field === 'item' ? normName(d.item) : d.field === 'amount' ? d.amount : d.number;
        var got = d.field === 'item' ? normName(input.value) : onlyDigits(input.value);
        ok = got === want; why = 'القيمة المصححة ما تطابق كلام المتصل.';
      }
      mainDigits = d.number;
    } else if (op.method === 'vault') { var vc = onlyDigits(input.code); if (vc.length !== 6) return no('incomplete', 'رمز الخزنة ست خانات.'); mainDigits = vc; ok = vc === d.a + d.b; why = 'رمز الخزنة غلط. الخزنة قفلت محاولة.'; }
    else if (op.method === 'contract') { if (!Array.isArray(input.order) || input.order.length !== 5) return no('incomplete', 'رتّب الشروط الخمسة كلها.'); ok = input.order.join(',') === d.order.join(','); why = 'ترتيب الشروط ما يطابق أولويات العميل.'; }
    else if (op.method === 'wallet') { var tk = Array.isArray(input.tokens) ? input.tokens.slice().sort() : []; if (tk.length !== 3) return no('incomplete', 'اختر ثلاثة رموز بالضبط.'); ok = tk.join(',') === d.tokens.join(','); why = 'المجموعة فيها رمز مو للمتصل.'; }
    else if (op.method === 'combo') {
      if (op.stage === 1) { var k1 = onlyDigits(input.key); if (!k1) return no('incomplete', 'اكتب مفتاح المرحلة الأولى.'); mainDigits = k1; ok = k1 === d.key1; why = 'مفتاح المرحلة الأولى غلط.'; }
      else { var rf = onlyDigits(input.ref), sl = onlyDigits(input.seal); if (!rf || !sl) return no('incomplete', 'المرحلة الثانية تحتاج رقم المرجع والختم.'); mainDigits = sl; if (rf !== d.ref) why = 'رقم المرجع غلط. تذكر وش قال المتصل بأول المكالمة.'; else if (sl !== d.seal) why = 'الختم النهائي غلط.'; else ok = true; }
    }
    if (!ok && mainDigits && profile.ops.usedCodes.indexOf(usedKey(op.method, mainDigits)) >= 0) return no('code_used', 'هذا الرمز مستخدم بعملية سابقة، وما ينقبل مرة ثانية.', true) && finalizeFail();
    if (!ok && mainDigits && ctx.isForeign && ctx.isForeign(op.method, mainDigits)) { why = 'هذا الرمز صادر لمكالمة ثانية، وما يخص هالعملية.'; res.reason = 'foreign'; }
    if (!ok) { no(res.reason || 'mismatch', why, true); call.mistakes++; res.events.push({ type: 'op_wrong', text: why }); return finalizeFail(); }
    // نجاح
    if (op.method === 'combo' && op.stage === 1) { op.stage = 2; op.lastReason = null; res.ok = true; res.stage = 2; res.events.push({ type: 'op_stage', text: 'المرحلة الأولى انقبلت. باقي الختم النهائي ورقم المرجع.' }); return res; }
    op.used = true; op.lastReason = null;
    var before = methodsFor(profile).filter(function (x) { return x.unlocked; }).map(function (x) { return x.id; });
    credit(profile, day, op.reward);
    call.reward = op.reward; call.opCredited = true;
    if (mainDigits) { profile.ops.usedCodes.push(usedKey(op.method, mainDigits)); profile.ops.usedCodes = profile.ops.usedCodes.slice(-300); }
    profile.ops.won[op.method] = (profile.ops.won[op.method] || 0) + 1;
    profile.ops.history.push({ id: op.id, method: op.method, caller: persona(call.personaId).name, reward: op.reward, ok: true, reason: '', at: now, day: profile.day }); profile.ops.history = profile.ops.history.slice(-40);
    res.ok = true; res.reward = op.reward;
    res.events.push({ type: 'op_ok', text: 'العملية انقبلت: +' + fmtMoney(op.reward), reward: op.reward });
    methodsFor(profile).forEach(function (x) { if (x.unlocked && before.indexOf(x.id) < 0) res.events.push({ type: 'unlock', method: x.id, text: 'انفتحت طريقة جديدة: «' + x.name + '» (' + fmtMoney(x.reward) + ' للعملية).' }); });
    completeStep(call, res, eff, now);
    res.ended = call.status !== 'active';
    return res;
    function finalizeFail() {
      if (op.attempts >= m.attempts) { op.failed = true; finishCall(call, 'fail', 'op_failed', res); res.ended = true; }
      return res;
    }
  }

  function reveal(call, what, res) {
    var p = persona(call.personaId);
    if (what === 'code' && call.facts.code) {
      if (p.quirks.indexOf('fake_convince') >= 0 && !call.flags.fakeGiven) { call.flags.fakeGiven = true; call.revealed.code = call.facts.fakeCode; res.decision.reveal = 'code_fake'; }
      else { call.revealed.code = call.facts.code; res.decision.reveal = 'code'; }
    } else if (what === 'amount') { call.revealed.amount = call.facts.amount; res.decision.reveal = 'amount'; }
    else if (what === 'address') { call.revealed.address = addrText(call.facts.address); res.decision.reveal = 'address'; }
    if (call.facts.invoice && !call.revealed.invoice && what === 'code') { /* رقم الفاتورة يلقاه اللاعب بالبريد */ }
  }

  function completeStep(call, res, eff, now) {
    call.steps[call.stepIdx].done = true;
    res.events.push({ type: 'step', stepId: call.steps[call.stepIdx].id, text: 'خطوة مكتملة: ' + scenario(call.scenarioId).steps[call.stepIdx].title });
    call.stepIdx++; call.stepTurns = 0; call.flags.stepContra = 0;
    var s = scenario(call.scenarioId), st = s.steps[call.stepIdx];
    // خطوة الفحص بسيناريو المضلل تُتخطى لو الجهاز نظيف
    if (st && st.optionalIfClean && !call.flags.infected) { call.steps[call.stepIdx].done = true; res.events.push({ type: 'step', stepId: st.id, text: 'الجهاز نظيف، ما يحتاج فحص.' }); call.stepIdx++; }
    if (call.stepIdx >= s.steps.length) finishCall(call, 'success', 'complete', res);
    else preparePuzzle(call, eff, now);
  }
  function finishCall(call, outcome, reason, res) {
    if (call.status !== 'active') return;
    call.status = 'ended'; call.outcome = outcome; call.endReason = reason;
    if (res) { res.ended = true; res.events.push({ type: 'end', outcome: outcome, reason: reason }); }
  }

  /* أدوات: إجابة اللعبة المصغرة. ترجع ok/خطأ وتقدّم الخطوة لو صح. */
  function submitTool(call, stepId, answer, ctx) {
    ctx = ctx || {};
    var now = ctx.now || Date.now(), eff = ctx.effects || {}, res = { ok: false, events: [], ended: false };
    if (call.status !== 'active') { res.error = 'call_ended'; res.ended = true; return res; }
    var st = curStep(call);
    if (!st || st.kind !== 'tool' || st.id !== stepId || !call.puzzleAns) { res.error = 'wrong_step'; return res; }
    var ans = call.puzzleAns, okv = false, tool = st.tool;
    answer = answer || {};
    if (tool === 'fix_steps') okv = Array.isArray(answer.order) && answer.order.join(',') === ans.join(',');
    else if (tool === 'code_match') { var pick = String(answer.code || ''); okv = normCode(pick) === ans.code && normCode(pick).length === ans.code.length; if (!okv && call.facts.fakeCode && normCode(pick) === call.facts.fakeCode) { call.flags.fakeEntered = true; res.fake = true; } }
    else if (tool === 'tx_confirm') {
      var c = normCode(answer.code);
      okv = c === ans.code && (!ans.invoice || normCode(answer.invoice) === ans.invoice);
      if (!okv && call.facts.fakeCode && c === call.facts.fakeCode) { call.flags.fakeEntered = true; res.fake = true; }
      if (!okv && !call.revealed.code) res.reason = 'no_code_yet';
    }
    else if (tool === 'mail_find') okv = normCode(answer.ref) === ans.ref;
    else if (tool === 'file_sort') okv = answer.map && Object.keys(ans).every(function (k) { return answer.map[k] === ans[k]; });
    else if (tool === 'settle_timing') {
      var t = Number(answer.t), issuedFor = (now - call.puzzleIssuedAt) + 2000;
      if (isFinite(t) && t >= 0 && t <= issuedFor) { var val = settleWave(ans.seed, t); okv = val >= ans.band[0] && val <= ans.band[1]; res.value = Math.round(val); }
    }
    else if (tool === 'card_reveal') okv = Array.isArray(answer.order) && answer.order.join(',') === ans.order.join(',');
    else if (tool === 'virus_popups') okv = Array.isArray(answer.answers) && ans.answers.every(function (x, i) { return normCode(answer.answers[i]) === x; });
    else if (tool === 'data_compare') okv = answer.field === ans.field;
    call.toolAttempts++;
    if (okv) {
      res.ok = true;
      if (tool === 'mail_find' && call.facts.invoice) call.revealed.invoice = call.facts.invoice;
      if (tool === 'virus_popups') call.flags.infected = false;
      completeStep(call, res, eff, now);
    } else {
      call.mistakes++;
      res.events.push({ type: 'tool_wrong', text: res.fake ? 'الرمز ما طابق. يمكن المتصل قراه غلط؟ اطلب منه يتأكد.' : res.reason === 'no_code_yet' ? 'ما عندك رمز من المتصل للحين.' : 'الإجابة غير صحيحة.' });
      if (tool === 'settle_timing') preparePuzzle(call, eff, now); // موجة جديدة لكل محاولة
      var limit = tool === 'virus_popups' ? 5 : 3;
      if (countWrong(call, st.id) >= limit) finishCall(call, 'fail', 'tool_fail', res);
    }
    res.ended = call.status !== 'active';
    return res;
  }
  function countWrong(call, stepId) { call._wrong = call._wrong || {}; call._wrong[stepId] = (call._wrong[stepId] || 0) + 1; return call._wrong[stepId]; }

  /* فتح مرفق المضلل (فعل حقيقي من البريد): يصيب الجهاز ويخلي الفحص إجباري */
  function openSuspiciousFile(call) {
    if (call.status !== 'active' || !scenario(call.scenarioId).saboteurCall) return { ok: false };
    if (!call.flags.infected) { call.flags.infected = true; call.mistakes++; }
    return { ok: true, infected: true };
  }

  /* تسوية المكالمة داخل اليوم مرة وحدة فقط */
  function settleCall(profile, day, call, ctx) {
    if (call.settled) return { already: true, reward: call.reward };
    if (call.status === 'active') finishCall(call, 'fail', (ctx && ctx.reason) || 'abandoned');
    call.settled = true;
    var s = scenario(call.scenarioId), p = persona(call.personaId), reward = 0;
    var elapsed = ((ctx && ctx.now) || Date.now()) - call.startedAt - call.waitMs;
    // مكالمات العمليات: المكافأة انمنحت وقت التحصيل في «نصب» (مرة وحدة). مكالمات التدقيق والمضلل: مكافأة ثابتة هنا.
    if (call.opCredited) reward = call.reward;
    else if (call.outcome === 'success' && !call.op && s.baseReward > 0) { reward = s.baseReward; credit(profile, day, reward); }
    call.reward = reward;
    if (call.op && !call.op.used) { profile.ops.history.push({ id: call.op.id, method: call.op.method, caller: p.name, reward: 0, ok: false, reason: call.op.lastReason || reasonText(call.endReason), at: Date.now(), day: profile.day }); profile.ops.history = profile.ops.history.slice(-40); }
    var neutral = call.endReason === 'overtime' || call.endReason === 'abandoned' || call.endReason === 'disconnect';
    var summary = { id: call.id, scenarioId: s.id, personaId: p.id, caller: p.name, title: s.title, outcome: call.outcome, reason: call.endReason, reward: reward,
      mistakes: call.mistakes, contradictions: call.memory.contradictions.length, seconds: Math.round(elapsed / 1000), neutral: neutral,
      flags: { fakeCaught: !!call.flags.fakeCaught, refused: !!call.flags.refused, infected: !!call.flags.infected, timeWaster: !!s.timeWaster, saboteur: !!s.saboteurCall, tester: !!s.testerCall }, method: call.op ? call.op.method : null,
      duringEvent: !!(ctx && ctx.duringEvent) };
    day.calls.push(summary);
    if (day.activeCallId === call.id) day.activeCallId = null;
    profile.history.personas.push(p.id); profile.history.scenarios.push(s.id);
    profile.history.personas = profile.history.personas.slice(-12); profile.history.scenarios = profile.history.scenarios.slice(-12);
    var txt = call.outcome === 'success' ? ('نجحت المكالمة مع ' + p.name + (reward ? ' (+' + fmtMoney(reward) + ')' : '')) : neutral ? ('انقفلت مكالمة ' + p.name + ' بدون احتساب') : ('فشلت المكالمة مع ' + p.name + ' (' + reasonText(call.endReason) + ')');
    logDay(day, call.outcome === 'success' ? 'call_ok' : neutral ? 'call_neutral' : 'call_fail', txt, { callId: call.id, caller: p.name });
    if (call.flags.fakeCaught) logDay(day, 'fake_caught', 'كشفت رمز غلط من ' + p.name, { caller: p.name });
    call.memory.contradictions.forEach(function () { logDay(day, 'contradiction', 'تناقضت بكلامك مع ' + p.name, { caller: p.name }); });
    return { reward: reward, summary: summary, achievements: checkAchievements(profile, day, 'call', summary) };
  }
  function reasonText(r) {
    return { complete: 'اكتملت', suspicion: 'شك فيك', patience: 'نفد صبره', insult: 'إساءة', player_end: 'أنهيتها قبل الإكمال', contradictions: 'تناقضات', trust: 'فقد الثقة فيك', timeout: 'انتهت مهلة المكالمة', tool_fail: 'أخطاء بالأدوات', overtime: 'انتهى الدوام', abandoned: 'انقطعت', disconnect: 'انقطع الاتصال', polite_end: 'إنهاء مهذب', hangup: 'سكّر الخط', refused: 'رفض يكمل', op_failed: 'العملية انرفضت' }[r] || r;
  }

  /* ================= الإنجازات ================= */
  function unlock(profile, id, list) { if (!profile.achievements[id]) { profile.achievements[id] = Date.now(); list.push(id); } }
  function checkAchievements(profile, day, when, info) {
    var out = [];
    if (when === 'call' && info) {
      if (info.outcome === 'success' && info.duringEvent) unlock(profile, 'storm_call', out);
      if (info.outcome === 'success' && info.flags.tester && info.contradictions === 0) unlock(profile, 'contradiction_free', out);
      if (info.flags.saboteur && info.flags.refused) unlock(profile, 'saboteur_block', out);
      if (info.flags.fakeCaught) unlock(profile, 'fake_caught', out);
      if (info.flags.timeWaster && info.outcome === 'success' && info.seconds < 60) unlock(profile, 'polite_waster', out);
    }
    if (when === 'day' && info) {
      if (info.pass) unlock(profile, 'first_day', out);
      if (info.pass && info.fails === 0 && info.ok > 0) unlock(profile, 'clean_day', out);
      if (info.pass && info.goalAtLeft >= day.duration * 0.25) unlock(profile, 'early_goal', out);
      if (info.grade === 'A') unlock(profile, 'boss_a', out);
      if (info.pass && day.day >= 10) unlock(profile, 'campaign', out);
    }
    if (Object.keys(profile.stats.appsOpened).length >= Object.keys(C.APPS).length - 1) unlock(profile, 'all_apps', out);
    if (profile.stats.purchases >= 5) unlock(profile, 'shopper', out);
    if (profile.ops && Object.keys(profile.ops.won).length >= 1) unlock(profile, 'first_op', out);
    if (methodUnlocked(profile, 'card')) unlock(profile, 'card_open', out);
    if (profile.ops && Object.keys(profile.ops.won).filter(function (k) { return profile.ops.won[k] > 0; }).length >= 5) unlock(profile, 'methods5', out);
    return out;
  }

  /* ================= أحداث المكتب (تسجيل للتقييم) ================= */
  function noteEvent(day, evId, outcome) {
    var ev = byId(C.EVENTS, evId); if (!ev) return;
    var rec = { id: evId, name: ev.name, outcome: outcome };
    day.events.push(rec); if (day.events.length > 40) day.events.shift();
    logDay(day, 'event_' + outcome, (outcome === 'handled' ? 'تعاملت مع: ' : outcome === 'ignored' ? 'تجاهلت: ' : 'حدث: ') + ev.name, { event: ev.name });
  }

  /* ================= نهاية اليوم وتقييم المدير ================= */
  function endDay(profile, day, ctx) {
    ctx = ctx || {};
    if (day.settled) return { already: true, review: day.review };
    var now = ctx.now || Date.now();
    if (day.activeCallId) return { error: 'call_active' };
    var left = dayTimeLeft(day, now);
    if (left > 0 && day.earned < day.quota && !ctx.forfeit) return { error: 'too_early' };
    day.settled = true; day.phase = 'review';
    var ok = day.calls.filter(function (c) { return c.outcome === 'success' && !c.flags.timeWaster; }).length;
    var fails = day.calls.filter(function (c) { return c.outcome === 'fail' && !c.neutral; }).length;
    var mistakes = day.calls.reduce(function (a, c) { return a + c.mistakes; }, 0);
    var pass = day.earned >= day.quota;
    var handled = day.events.filter(function (e) { return e.outcome === 'handled'; }).length, ignored = day.events.filter(function (e) { return e.outcome === 'ignored'; }).length;
    var goalAtLeft = pass && ctx.goalReachedLeft != null ? ctx.goalReachedLeft : (pass ? left : 0);
    var goalPts = Math.round(40 * Math.min(1, day.earned / day.quota));
    var callPts = Math.round(20 * Math.min(1, ok / Math.max(2, Math.ceil(day.quota / 250))));
    var timePts = pass ? Math.round(10 * Math.min(1, 0.4 + goalAtLeft / day.duration * 2.4)) : Math.round(4 * Math.min(1, day.earned / day.quota));
    var errPts = Math.max(0, 15 - fails * 4 - mistakes * 1.5);
    var evPts = handled + ignored ? Math.round(10 * handled / (handled + ignored)) : 8;
    var toolPts = Math.min(5, Math.round(day.toolUses / 2));
    var score = clamp(Math.round(goalPts + callPts + timePts + errPts + evPts + toolPts), 0, 100);
    if (!pass) score = Math.min(score, 54);
    var grade = C.MANAGER.grades.filter(function (g) { return score >= g.min; })[0];
    var rng = makeRng(day.seed + 77);
    var used = profile.history.managerLines.slice();
    function line(key, vars) {
      var arr = C.MANAGER.lines[key]; if (!arr) return null;
      var fresh = arr.map(function (t, i) { return key + ':' + i; }).filter(function (k) { return used.indexOf(k) < 0; });
      var k = fresh.length ? rng.pick(fresh) : key + ':' + rng.int(0, arr.length - 1);
      used.push(k);
      var t = arr[Number(k.split(':')[1])];
      Object.keys(vars || {}).forEach(function (v) { t = t.split('{' + v + '}').join(vars[v]); });
      return t;
    }
    var comments = [];
    if (pass && day.earned >= day.quota * 1.3) comments.push(line('goal_crushed', { over: fmtMoney(day.earned - day.quota) }));
    else if (pass) comments.push(line('goal_met'));
    else comments.push(line('goal_missed', { missing: fmtMoney(day.quota - day.earned) }));
    if (ok === 0) comments.push(line('no_calls'));
    var best = day.calls.filter(function (c) { return c.outcome === 'success' && c.mistakes === 0 && !c.flags.timeWaster; })[0];
    if (best) comments.push(line('best_call', { caller: best.caller }));
    var contra = day.calls.filter(function (c) { return c.contradictions > 0; })[0];
    if (contra) comments.push(line('contradiction', { caller: contra.caller }));
    var fake = day.calls.filter(function (c) { return c.flags.fakeCaught; })[0];
    if (fake) comments.push(line('fake_caught', { caller: fake.caller }));
    var sab = day.calls.filter(function (c) { return c.flags.saboteur; })[0];
    if (sab) comments.push(line(sab.flags.refused && !sab.flags.infected ? 'saboteur' : 'saboteur_fail'));
    if (fails >= 3) comments.push(line('many_fails', { fails: toArDigits(fails) }));
    else if (fails === 0 && ok > 0) comments.push(line('clean'));
    var hEv = day.events.filter(function (e) { return e.outcome === 'handled'; })[0], iEv = day.events.filter(function (e) { return e.outcome === 'ignored'; })[0];
    if (hEv) comments.push(line('handled_event', { event: hEv.name }));
    if (iEv) comments.push(line('ignored_event', { event: iEv.name }));
    if (ctx.idleSec != null && ctx.idleSec > day.duration * 0.35) comments.push(line('wasted_time'));
    comments.push(line(toolPts >= 3 ? 'tool_heavy' : 'tool_light'));
    if (!pass) {
      var hintItem = !profile.owned.phone2 ? 'سماعة «صافي ٢»' : !profile.owned.monitor2 ? 'الشاشة العريضة' : null;
      if (hintItem) comments.push(line('upgrade_hint', { item: hintItem }));
    }
    comments.push(line(pass ? 'pass' : 'fail'));
    comments = comments.filter(Boolean).slice(0, 6);
    profile.history.managerLines = used.slice(-24);

    var highlights = day.log.filter(function (e) { return /call_ok|call_fail|contradiction|fake_caught|event_handled|event_ignored|achievement/.test(e.type); }).slice(-10);
    var review = {
      dayId: day.id, day: day.day, pass: pass, earned: day.earned, quota: day.quota, score: score, grade: grade.id, gradeLabel: grade.label,
      breakdown: [
        { k: 'goal', label: 'تحقيق الهدف', pts: goalPts, max: 40 }, { k: 'calls', label: 'المكالمات الناجحة', pts: callPts, max: 20, extra: toArDigits(ok) },
        { k: 'time', label: 'إدارة الوقت', pts: timePts, max: 10 }, { k: 'errors', label: 'الأخطاء', pts: Math.round(errPts), max: 15, extra: toArDigits(mistakes) },
        { k: 'events', label: 'تحمّل التعطيلات', pts: evPts, max: 10 }, { k: 'tools', label: 'استخدام الأدوات', pts: toolPts, max: 5 }
      ],
      ok: ok, fails: fails, comments: comments, highlights: highlights, achievements: []
    };
    // تطبيق النتيجة مرة وحدة فقط
    if (pass) {
      if (!day.immediate) { profile.wallet += day.earned; profile.stats.earnedTotal += day.earned; profile.lifetimeEarned = (profile.lifetimeEarned || 0) + day.earned; }
      profile.stats.daysPassed++;
      profile.stats.bestDay = Math.max(profile.stats.bestDay, day.earned);
      if (day.day >= C.DAYS.length) profile.campaignDone = true;
      profile.day = day.day + 1;
      // أي طرد ما انفتح يتطبق تلقائياً بنهاية اليوم
      Object.keys(profile.owned).forEach(function (k) { if (profile.owned[k] === 'pending') profile.owned[k] = 'active'; });
    } else profile.stats.daysFailed++;
    profile.stats.callsOk += ok; profile.stats.callsFail += fails;
    review.achievements = checkAchievements(profile, day, 'day', { pass: pass, fails: fails, ok: ok, grade: grade.id, goalAtLeft: goalAtLeft });
    review.newRank = pass ? C.rankFor(profile.day) : null;
    review.newApps = pass ? (C.dayConfig(profile.day).newApps || []) : [];
    day.review = review;
    profile.updatedAt = Date.now();
    return { review: review };
  }

  /* ================= المتجر ================= */
  function buy(profile, itemId, reqId, ctx) {
    ctx = ctx || {};
    if (reqId && profile.txLog.indexOf('buy:' + reqId) >= 0) return { ok: true, duplicate: true, wallet: profile.wallet };
    var u = upgrade(itemId);
    if (!u) return { ok: false, error: 'unknown_item', msg: 'هذا التطوير غير موجود.' };
    if (profile.owned[itemId]) return { ok: false, error: 'owned', msg: 'تملكه من قبل.' };
    if (profile.day < u.minDay) return { ok: false, error: 'locked', msg: 'يفتح باليوم ' + toArDigits(u.minDay) + '.' };
    if (u.requires && profile.owned[u.requires] !== 'active') return { ok: false, error: 'requires', msg: 'يحتاج «' + upgrade(u.requires).name + '» قبله.' };
    if (profile.wallet < u.price) return { ok: false, error: 'funds', msg: 'المحفظة ما تكفي. ناقصك ' + fmtMoney(u.price - profile.wallet) + '.' };
    profile.wallet -= u.price;
    profile.owned[itemId] = ctx.duringShift ? 'pending' : 'active';
    if (u.effect.sleeve && !ctx.duringShift) profile.cosmetics.sleeve = u.effect.sleeve;
    profile.stats.purchases++;
    if (reqId) { profile.txLog.push('buy:' + reqId); profile.txLog = profile.txLog.slice(-60); }
    profile.updatedAt = Date.now();
    return { ok: true, wallet: profile.wallet, state: profile.owned[itemId], achievements: checkAchievements(profile, null, 'shop') };
  }
  function deliver(profile, itemId) {
    if (profile.owned[itemId] !== 'pending') return { ok: false };
    profile.owned[itemId] = 'active';
    var u = upgrade(itemId); if (u && u.effect.sleeve) profile.cosmetics.sleeve = u.effect.sleeve;
    return { ok: true };
  }

  return {
    SAVE_VERSION: SAVE_VERSION, OVERTIME_SEC: OVERTIME_SEC,
    normDigits: normDigits, normCode: normCode, normText: normText, toArDigits: toArDigits, clamp: clamp, hashStr: hashStr, makeRng: makeRng, uid: uid,
    persona: persona, scenario: scenario, upgrade: upgrade, fmtMoney: fmtMoney, reasonText: reasonText, addrText: addrText,
    newProfile: newProfile, validateProfile: validateProfile, checksum: checksum, effects: effects, appsFor: appsFor, appUnlockDay: appUnlockDay,
    startDay: startDay, dayElapsed: dayElapsed, dayTimeLeft: dayTimeLeft, setPaused: setPaused, tickDay: tickDay, logDay: logDay,
    pickCall: pickCall, createCall: createCall, publicCall: publicCall, curStep: curStep, gateFor: gateFor, moodOf: moodOf,
    applyTurn: applyTurn, submitTool: submitTool, openSuspiciousFile: openSuspiciousFile, finishCall: finishCall, settleCall: settleCall,
    settleWave: settleWave, detectCheat: detectCheat, latinRatio: latinRatio, noteEvent: noteEvent, endDay: endDay, buy: buy, deliver: deliver,
    checkAchievements: checkAchievements, trustBand: trustBand,
    extractFacts: extractFacts, callerQuestionKind: callerQuestionKind, fuzzyHas: fuzzyHas, summaryOf: summaryOf, ID_ASK_RX: ID_ASK_RX, REVERSAL_SAY_RX: REVERSAL_SAY_RX,
    method: method, methodUnlocked: methodUnlocked, methodsFor: methodsFor, genOp: genOp, publicOp: publicOp, setMethod: setMethod, collectOp: collectOp,
    opWilling: opWilling, pieceNeed: pieceNeed, credit: credit, hasOpStep: hasOpStep
  };
});

