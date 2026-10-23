/* احسمها | مركز الاتصالات — جلسة اللعب الواحدة (لاعب واحد).
   تربط القواعد الحتمية بـ«عقل المتصل» (Gemini بالخادم، أو ردود مبرمجة بوضع التدريب).
   الخادم يستخدمها كمرجع رسمي؛ المتصفح يستخدمها فقط بوضع التدريب المعلن.
   الضمانات هنا: معرف لكل مكالمة ورسالة، منع الرد القديم، منع الاحتساب مرتين، إلغاء الطلب عند إنهاء المكالمة. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cc-content.js'), require('./cc-rules.js'));
  else root.CCSession = factory(root.CCContent, root.CCRules);
})(typeof self !== 'undefined' ? self : this, function (C, R) {
  'use strict';

  var MAX_SAY = 260;

  /* ---------- اختيار الجمل الجاهزة بدون تكرار قريب ---------- */
  function fill(t, vars) { Object.keys(vars || {}).forEach(function (k) { t = t.split('{' + k + '}').join(vars[k] == null ? '' : String(vars[k])); }); return t; }
  function pickLine(call, cat, vars, rng) {
    var p = R.persona(call.personaId), bank = (C.LINES[p.tone] && C.LINES[p.tone][cat]) || C.LINES.common[cat] || C.LINES.casual[cat];
    if (!bank || !bank.length) return '';
    var used = call.memory.lastLines, fresh = bank.filter(function (x) { return used.indexOf(x) < 0; });
    var r = rng || Math.random, list = fresh.length ? fresh : bank;
    var line = list[Math.floor((typeof r === 'function' ? r() : Math.random()) * list.length)];
    used.push(line); if (used.length > 14) used.shift();
    return fill(line, vars);
  }
  function lineVars(call) {
    var s = R.scenario(call.scenarioId);
    return { company: s.company, code: call.revealed.code || '', amount: call.revealed.amount != null ? R.toArDigits(call.revealed.amount) : '', addr: call.revealed.address || '', invoice: call.revealed.invoice || '', device: s.deviceName || 'الجهاز', pname: call.memory.claims.player_name || '' };
  }
  function shownValues(call) { var op = call.op; if (!op) return []; return R.method(op.method).pieces.filter(function (pc) { return op.shown[pc.key]; }).map(function (pc) { return op.shown[pc.key]; }); }
  /* نص النطق: الأرقام تنقرأ خانة خانة بنفس الترتيب المكتوب (ما يتحول الرمز لرقم كبير) */
  function speakText(line) {
    if (!line) return line;
    return String(line).replace(/([؀-ۿ]+)-(?=[0-9])/g, '$1، ').replace(/([0-9])-(?=[0-9])/g, '$1، ').replace(/[0-9]{2,}/g, function (m) { return ' ' + m.split('').map(function (d) { return R.toArDigits(d); }).join(' ') + ' '; }).replace(/\s{2,}/g, ' ').trim();
  }

  /* ---------- تنظيف رد النموذج قبل عرضه ---------- */
  function cutAtBoundary(t, max) {
    if (t.length <= max) return t;
    var cut = t.slice(0, max), m = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('؟'), cut.lastIndexOf('!'), cut.lastIndexOf('،'));
    if (m > max * 0.5) return cut.slice(0, m + 1);
    var sp = cut.lastIndexOf(' ');
    return (sp > 0 ? cut.slice(0, sp) : cut) + '...';
  }
  function sanitizeSay(text, call) {
    if (typeof text !== 'string') return null;
    var t = text.replace(/[\r\n\t]+/g, ' ').replace(/[*#`_>~]/g, '').replace(/\s{2,}/g, ' ').trim();
    t = t.replace(/^["«“]+|["»”]+$/g, '').trim();
    if (!t) return null;
    if (R.latinRatio(t) > 0.3) return null; // فقرة لغة ثانية: نرفضها بدل ما تتسرب للاعب
    t = t.replace(/\b[A-Za-z][A-Za-z'\-]{1,}\b/g, '').replace(/\s{2,}/g, ' ').trim();
    var v = lineVars(call);
    // أي رقم من ٣ خانات أو أكثر ما يطابق قيمة مكشوفة يُحذف: النموذج ما يخترع رموز ولا مبالغ
    var allowed = [v.code, String(call.revealed.amount || ''), v.invoice].concat(shownValues(call)).map(R.normCode).filter(Boolean);
    var allowedParts = []; shownValues(call).forEach(function (x) { (String(x).match(/[0-9]+/g) || []).forEach(function (n) { allowedParts.push(n); }); });
    t = t.replace(/[0-9٠-٩]{3,}/g, function (num) { var n = R.normCode(num); return allowed.indexOf(n) >= 0 || allowedParts.indexOf(n) >= 0 ? num : ''; });
    t = t.replace(/\{op_value\}/g, '\u0001');
    t = fill(t, v).replace(/\{[a-z_]+\}/g, '').replace(/\u0001/g, '{op_value}').replace(/\s{2,}/g, ' ').trim();
    if (!t || !/[؀-ۿ]/.test(t)) return null;
    return cutAtBoundary(t, MAX_SAY);
  }

  /* يضمن إن الجملة النهائية متسقة مع قرار القواعد (مو مع اقتراح النموذج) */
  function reconcile(call, res, draft, rng) {
    var v = lineVars(call), p = R.persona(call.personaId), d = res.decision;
    if (res.ended) {
      var map = { success: 'success', suspicion: 'hangup_suspicion', contradictions: 'hangup_suspicion', patience: 'hangup_patience', timeout: 'hangup_patience', insult: 'insult', player_end: 'polite_end_ok', polite_end: 'polite_end_ok', tool_fail: 'hangup_patience', refused: 'hangup_suspicion', op_failed: 'op_fail_hangup' };
      var cat = map[call.endReason] || 'polite_end_ok';
      if (draft && (call.outcome === 'success' || call.endReason === 'player_end' || call.endReason === 'polite_end')) return draft;
      return pickLine(call, cat, v, rng);
    }
    if (d.line === 'latin') return pickLine(call, 'latin', v, rng);
    var stripOp = function (t) { return t ? t.split('{op_value}').join('').replace(/\s{2,}/g, ' ').trim() || null : t; };
    if ((d.reveal === 'op' || d.reveal === 'op_fix') && call.op) {
      var val = call.op.shown[d.piece || 'code'];
      if (draft && draft.indexOf('{op_value}') >= 0) return draft.split('{op_value}').join(val);
      if (draft && draft.indexOf(val) >= 0) return draft;
      return pickLine(call, d.reveal === 'op_fix' ? 'wrong_code_retry' : 'reveal_op', { label: d.opLabel || '', value: val, code: val }, rng);
    }
    if (d.reveal === 'op_repeat' && call.op) return pickLine(call, 'op_repeat', { value: shownValues(call).join('، ') }, rng);
    if (d.opRefused) {
      if (d.line === 'op_pushy') return pickLine(call, 'op_pushy', v, rng);
      var dr = stripOp(draft);
      if (dr && !/(تمام|أوكي|اوكي|موافق|سويتها|تم |خذ|اكتب)/.test(dr) && !/[0-9٠-٩]{3,}/.test(dr)) return dr;
      if (d.opWhy === 'explain' || d.opWhy === 'answer') return pickLine(call, 'ask_why', v, rng);
      return pickLine(call, 'op_refuse', { label: d.opLabel || 'هالمعلومة' }, rng);
    }
    if (d.line === 'op_early') return pickLine(call, 'op_early', v, rng);
    draft = stripOp(draft);
    if (d.reveal === 'code' || d.reveal === 'code_fake') {
      var c = call.revealed.code;
      if (draft && R.normCode(draft).indexOf(R.normCode(c)) >= 0) return draft;
      return pickLine(call, 'reveal_code', { code: c }, rng);
    }
    if (d.reveal === 'code_retry') return pickLine(call, 'wrong_code_retry', { code: call.revealed.code }, rng);
    if (d.reveal === 'code_repeat') return 'مرة ثانية: ' + call.revealed.code + '.';
    if (d.reveal === 'amount') return draft && draft.indexOf(v.amount) >= 0 ? draft : pickLine(call, 'reveal_amount', v, rng);
    if (d.reveal === 'address') return draft && draft.indexOf(call.facts.address.street) >= 0 ? draft : pickLine(call, 'reveal_address', v, rng);
    if (d.accept === true) return draft || pickLine(call, res.events.some(function (e) { return e.type === 'grant'; }) ? 'access_granted' : 'accept', v, rng);
    if (d.accept === false) {
      if (draft && !/(تمام|أوكي|اوكي|موافق|سويتها|تم)/.test(draft)) return draft;
      if (p.quirks.indexOf('haggles') >= 0) return pickLine(call, 'haggle', v, rng);
      if (p.quirks.indexOf('needs_explain') >= 0 && !call.flags.explained) return pickLine(call, 'ask_why', v, rng);
      return pickLine(call, 'refuse', v, rng);
    }
    return draft;
  }

  /* ================= الجلسة ================= */
  function Session(opts) {
    this.brain = opts.brain;
    this.now = opts.now || function () { return Date.now(); };
    this.profile = opts.profile || R.newProfile();
    this.day = opts.day || null;
    this.call = null;          // المكالمة الخاصة (فيها الأجوبة)
    this.pending = null;       // { msgId, ctl }
    this.msgCache = {};        // msgId -> رد مكتمل (لإعادة الإرسال الآمن)
    this.reqCache = {};        // reqId -> نتيجة
    this.onCheckpoint = opts.onCheckpoint || function () {};
    this.rng = R.makeRng(opts.seed || R.hashStr(String(this.now()) + Math.random()));
    this.mode = opts.mode || 'remote';
    this.usage = { turns: 0, failures: 0 };
    this.disruption = null; // حدث مفاجئ شغال (يقرأه التسوية لإنجاز «وسط العاصفة»)
    this.onOpIssued = opts.onOpIssued || function () {}; // الخادم يسجل الرموز الصادرة لكشف رمز من مكالمة ثانية
    this.isForeign = opts.isForeign || null;
  }
  var P = Session.prototype;

  P.effects = function () { return R.effects(this.profile); };
  P.publicDay = function () {
    var d = this.day; if (!d) return null;
    var now = this.now();
    return { id: d.id, day: d.day, quota: d.quota, duration: d.duration, brief: d.brief, phase: d.phase, earned: d.earned, left: Math.ceil(R.dayTimeLeft(d, now)),
      overtimeLeft: d.phase === 'overtime' ? Math.max(0, Math.ceil(R.OVERTIME_SEC - (now - d.overtimeStart) / 1000)) : null,
      calls: d.calls.slice(-12), log: d.log.slice(-30), settled: d.settled, review: d.review, paused: !!d.pauseStart };
  };
  P.publicProfile = function () {
    var p = this.profile;
    return { day: p.day, wallet: p.wallet, owned: p.owned, cosmetics: p.cosmetics, achievements: p.achievements, stats: p.stats, campaignDone: p.campaignDone,
      apps: R.appsFor(p), rank: C.rankFor(p.day), effects: this.effects(), lifetimeEarned: p.lifetimeEarned || 0, methods: R.methodsFor(p), opsHistory: p.ops.history.slice(-20), lastMethod: p.lastMethod };
  };
  P.snapshot = function () { return { profile: this.publicProfile(), day: this.publicDay(), call: this.call ? R.publicCall(this.call) : null, mode: this.mode }; };

  /* حالة قابلة للحفظ: بدون أي مكالمة شغالة (المكالمة ما تُستعاد بعد إعادة التحميل) */
  P.checkpointData = function () {
    var d = this.day ? JSON.parse(JSON.stringify(this.day)) : null;
    if (d) { d.elapsedAtSave = R.dayElapsed(this.day, this.now()); d.activeCallId = null; d.pauseStart = null; }
    return { v: 2, profile: this.profile, day: d, savedAt: this.now() };
  };
  P.checkpoint = function (kind) { try { this.onCheckpoint(kind, this.checkpointData()); } catch (e) { /* الحفظ ما يوقف اللعب */ } };
  P.restore = function (data) {
    var vp = R.validateProfile(data && data.profile);
    if (!vp.ok) return { ok: false, error: vp.error };
    this.profile = vp.profile;
    var d = data.day;
    if (d && typeof d === 'object' && d.day === this.profile.day && !d.settled && typeof d.elapsedAtSave === 'number' && d.elapsedAtSave >= 0 && d.elapsedAtSave <= d.duration + 60) {
      d.startedAt = this.now() - d.elapsedAtSave * 1000; d.pausedMs = 0; d.pauseStart = null; d.activeCallId = null;
      if (d.phase === 'overtime') d.phase = 'closed';
      // يوم محفوظ بالإصدار ١: أرباحه ما انضافت للرصيد للحين. نضيفها الحين مرة وحدة ونحوله للنظام الفوري.
      if (!d.immediate) { if (d.earned > 0) { this.profile.wallet += d.earned; this.profile.lifetimeEarned += d.earned; this.profile.stats.earnedTotal += d.earned; } d.immediate = true; }
      this.day = d;
    } else this.day = null;
    this.call = null;
    return { ok: true, restoredDay: !!this.day };
  };

  P.beginDay = function () {
    if (this.day && !this.day.settled) return { day: this.publicDay(), resumed: true };
    this.day = R.startDay(this.profile, { now: this.now(), seed: Math.floor(this.rng() * 1e9) });
    R.logDay(this.day, 'day_start', 'بداية اليوم ' + R.toArDigits(this.day.day));
    this.checkpoint('day_start');
    return { day: this.publicDay() };
  };
  P.retryDay = function () { this.day = null; this.call = null; return this.beginDay(); };
  P.pause = function (on) {
    var now = this.now();
    if (this.day && !this.day.settled) R.setPaused(this.day, !!on, now);
    // الإيقاف المؤقت ما يحسب على صبر المتصل ولا على مهلة المكالمة
    if (on && !this.userPauseAt) this.userPauseAt = now;
    else if (!on && this.userPauseAt) { var d = now - this.userPauseAt; this.userPauseAt = null; if (this.call && this.call.status === 'active') { this.call.lastTurnAt += d; this.call.startedAt += d; } }
    return { paused: !!(this.day && this.day.pauseStart) };
  };

  P.tick = function () {
    if (!this.day) return { phase: null };
    var f = R.tickDay(this.day, this.now(), this.call);
    var out = { phase: this.day.phase };
    if (f && f.forceEnd && this.call) { out.forced = this.endCall({ callId: this.call.id, reason: 'overtime' }); out.phase = this.day.phase; }
    return out;
  };

  P.startCall = function (opts) {
    opts = opts || {};
    var d = this.day;
    if (!d || d.settled) return { error: 'no_day', msg: 'ما فيه دوام شغال.' };
    this.tick();
    if (d.phase !== 'shift') return { error: 'closed', msg: C.STRINGS.dayOverNoCalls };
    if (this.call && this.call.status === 'active') return { error: 'busy', msg: 'عندك مكالمة شغالة.' };
    var pick = opts.pick && R.scenario(opts.pick.scenarioId) && R.persona(opts.pick.personaId) && this.mode === 'local' ? opts.pick : R.pickCall(this.profile, d, this.rng, { timeWaster: !!opts.timeWaster });
    if (opts.method) pick = Object.assign({}, pick, { method: String(opts.method) });
    var call = R.createCall(this.profile, d, pick, this.rng, this.now(), this.effects());
    this.call = call; d.activeCallId = call.id;
    var p = R.persona(call.personaId), opening = this.rng.pick(p.openings);
    call.memory.history.push({ r: 'c', t: opening });
    call.memory.lastLines.push(opening);
    call.memory.pendingQ = /[؟?]/.test(opening);
    if (call.op) this.onOpIssued(call.op);
    R.logDay(d, 'call_start', 'مكالمة من ' + p.name + ': ' + R.scenario(call.scenarioId).title, { callId: call.id, caller: p.name });
    return { call: R.publicCall(call), opening: { id: call.id + ':0', text: opening } };
  };

  /* دور واحد: رسالة اللاعب ← عقل المتصل ← القواعد ← جملة نهائية متسقة */
  P.turn = function (req) {
    var self = this, call = this.call;
    req = req || {};
    if (!call || call.id !== req.callId) return Promise.resolve({ stale: true, callId: req.callId, msgId: req.msgId, error: 'no_call' });
    if (req.msgId && this.msgCache[req.msgId]) return Promise.resolve(this.msgCache[req.msgId]);
    if (call.status !== 'active') return Promise.resolve({ stale: true, callId: call.id, msgId: req.msgId, error: 'call_ended', call: R.publicCall(call) });
    if (this.pending) return Promise.resolve({ error: 'busy', callId: call.id, msgId: req.msgId, msg: 'المتصل للحين ما رد على رسالتك السابقة.' });
    var text = String(req.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!text) return Promise.resolve({ error: 'empty', callId: call.id, msgId: req.msgId });
    call.env = { noise: !!(req.env && req.env.noise) };
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : { signal: null, abort: function () {} };
    var started = this.now();
    this.pending = { msgId: req.msgId, ctl: ctl, callId: call.id };
    if (this.day && !this.userPauseAt) R.setPaused(this.day, true, started); // انتظار الخدمة ما يحسب من وقت الدوام
    var gate = R.gateFor(call);
    var ctx = { call: call, persona: R.persona(call.personaId), scenario: R.scenario(call.scenarioId), text: text, gate: gate, signal: ctl.signal, session: this };
    return Promise.resolve().then(function () { return self.brain.turn(ctx); }).then(function (out) {
      return { ok: true, out: out || {} };
    }, function (err) { return { ok: false, err: err }; }).then(function (r) {
      var now = self.now(), waitMs = now - started;
      if (self.day && !self.userPauseAt) R.setPaused(self.day, false, now);
      var stillMine = self.pending && self.pending.msgId === req.msgId;
      self.pending = null;
      if (!stillMine || self.call !== call || call.status !== 'active') return { stale: true, callId: call.id, msgId: req.msgId, error: 'call_ended', call: R.publicCall(call) };
      call.waitMs += waitMs;
      if (!r.ok) {
        self.usage.failures++;
        // ما نخترع رد على لسان المتصل لتغطية خطأ اتصال: الرسالة ما تنحسب ويقدر يعيد
        var e = r.err || {};
        return { error: e.code || 'brain_error', retryable: e.retryable !== false, callId: call.id, msgId: req.msgId, msg: e.userMsg || C.STRINGS.callError, retryAfter: e.retryAfter || null, call: R.publicCall(call) };
      }
      self.usage.turns++;
      var analysis = r.out.analysis || {}, draft = r.out.say != null ? sanitizeSay(r.out.say, call) : null;
      var res = R.applyTurn(call, text, analysis, { now: now, waitMs: waitMs, effects: self.effects() });
      var line = self.brain.compose ? self.brain.compose(ctx, res, draft) : null;
      if (!line) line = reconcile(call, res, draft, self.rng);
      if (!line) line = pickLine(call, 'waiting', lineVars(call), self.rng);
      call.memory.history.push({ r: 'c', t: line });
      call.memory.pendingQ = /[؟?]/.test(line);
      call.memory.pendingObj = res.decision.accept === false || !!res.decision.opRefused;
      var reply = { id: call.id + ':' + call.turns, text: line, speak: speakText(line) };
      var outv = { callId: call.id, msgId: req.msgId, intent: res.intent, reply: reply, events: res.events, ended: res.ended, call: R.publicCall(call), usage: r.out.usage || null, route: r.out.route || null };
      if (res.ended) outv.settlement = self._settle(call, {});
      self.msgCache[req.msgId] = outv;
      var keys = Object.keys(self.msgCache); if (keys.length > 60) delete self.msgCache[keys[0]];
      return outv;
    });
  };

  P.tool = function (req) {
    var call = this.call;
    if (req.reqId && this.reqCache[req.reqId]) return this.reqCache[req.reqId];
    if (!call || call.id !== req.callId) return { error: 'no_call', stale: true };
    if (this.pending) return { error: 'busy', msg: 'انتظر رد المتصل قبل.' };
    if (this.day) this.day.toolUses++;
    var res = R.submitTool(call, req.stepId, req.answer, { now: this.now(), effects: this.effects() });
    var line = null;
    if (res.ok && !res.ended) {
      var p = R.persona(call.personaId);
      line = pickLine(call, 'tool_progress', lineVars(call), this.rng);
      if (p.quirks.indexOf('forgets') >= 0 && this.rng() < 0.35) line = pickLine(call, 'remember_step', lineVars(call), this.rng);
    }
    if (res.ended) line = reconcile(call, { ended: true, decision: {}, events: [] }, null, this.rng);
    if (line) call.memory.history.push({ r: 'c', t: line });
    var out = { ok: res.ok, error: res.error || null, events: res.events, ended: res.ended, value: res.value, call: R.publicCall(call), line: line ? { id: call.id + ':t' + call.toolAttempts, text: line, speak: speakText(line) } : null };
    if (res.ended) out.settlement = this._settle(call, {});
    if (req.reqId) this.reqCache[req.reqId] = out;
    return out;
  };

  P.openFile = function (req) {
    var call = this.call;
    if (!call || call.id !== req.callId) return { error: 'no_call' };
    var r = R.openSuspiciousFile(call);
    if (r.ok) R.logDay(this.day, 'infected', 'فتحت ملف المضلل وانصاب الجهاز');
    return { ok: !!r.ok, infected: !!r.infected, call: R.publicCall(call) };
  };

  P.setMethod = function (req) {
    var call = this.call;
    if (!call || call.id !== req.callId) return { error: 'no_call', stale: true };
    var r = R.setMethod(this.profile, call, String(req.method || ''));
    if (r.ok && !r.same) this.onOpIssued(call.op);
    return { ok: !!r.ok, error: r.error || null, msg: r.msg || null, call: R.publicCall(call) };
  };
  /* تحصيل العملية: معرف طلب يمنع الاحتساب مرتين عند إعادة الإرسال أو النقر المزدوج */
  P.collect = function (req) {
    var call = this.call;
    if (req.reqId && this.reqCache['c' + req.reqId]) return this.reqCache['c' + req.reqId];
    if (!call || call.id !== req.callId) return { error: 'no_call', stale: true, msg: 'العملية هذي مو للمكالمة الحالية.' };
    if (this.pending) return { error: 'busy', msg: 'انتظر رد المتصل قبل.' };
    var self = this;
    var res = R.collectOp(this.profile, this.day, call, req.input || {}, { now: this.now(), effects: this.effects(), isForeign: this.isForeign ? function (m, dg) { return self.isForeign(m, dg); } : null });
    var line = null;
    if (res.ended) line = reconcile(call, { ended: true, decision: {}, events: [] }, null, this.rng);
    else if (!res.ok && (res.reason === 'mismatch' || res.reason === 'foreign')) line = pickLine(call, 'op_repeat', { value: shownValues(call).join('، ') }, this.rng);
    if (line && call.endReason === 'op_failed') line = pickLine(call, 'op_fail_hangup', lineVars(call), this.rng);
    if (line) call.memory.history.push({ r: 'c', t: line });
    var out = { ok: !!res.ok, reason: res.reason || null, msg: res.msg || null, reward: res.reward || 0, stage: res.stage || null, events: res.events, ended: res.ended, call: R.publicCall(call), line: line ? { id: call.id + ':o' + (call.op ? call.op.attempts : 0) + (res.ok ? 'k' : ''), text: line, speak: speakText(line) } : null };
    if (res.ok || res.reason === 'mismatch' || res.reason === 'foreign' || res.reason === 'code_used') this.checkpoint('op');
    if (res.ended) out.settlement = this._settle(call, {});
    out.profile = this.publicProfile();
    if (req.reqId) this.reqCache['c' + req.reqId] = out;
    return out;
  };

  P._settle = function (call, ctx) {
    var r = R.settleCall(this.profile, this.day, call, { now: this.now(), reason: ctx.reason, duringEvent: !!this.disruption });
    if (r.already) return { reward: call.reward, already: true };
    this.checkpoint('call_end');
    return { reward: r.reward, summary: r.summary, achievements: r.achievements, earned: this.day.earned };
  };
  P.endCall = function (req) {
    var call = this.call;
    if (!call || call.id !== req.callId) return { error: 'no_call', stale: true };
    if (this.pending) { try { this.pending.ctl.abort(); } catch (e) {} this.pending = null; if (this.day && !this.userPauseAt) R.setPaused(this.day, false, this.now()); }
    var reason = req.reason || 'hangup';
    if (call.status === 'active') R.finishCall(call, (reason === 'overtime' || reason === 'disconnect') ? 'neutral' : 'fail', reason);
    var st = this._settle(call, { reason: reason });
    this.tick();
    return { call: R.publicCall(call), settlement: st, day: this.publicDay() };
  };
  P.clearCall = function () { if (this.call && this.call.status !== 'active') this.call = null; return { ok: true }; };

  P.event = function (req) {
    if (!this.day || this.day.settled) return { ok: false };
    var ev = null; for (var i = 0; i < C.EVENTS.length; i++) if (C.EVENTS[i].id === req.id) ev = C.EVENTS[i];
    if (!ev) return { ok: false };
    if (req.outcome === 'start') this.disruption = ev.id;
    else if (req.outcome === 'occurred') { if (this.disruption === ev.id) this.disruption = null; }
    else { if (this.disruption === ev.id) this.disruption = null; R.noteEvent(this.day, ev.id, req.outcome === 'handled' ? 'handled' : 'ignored'); }
    return { ok: true };
  };
  P.coffee = function () { if (this.day && this.effects().coffeeBoost) this.day.coffeeReady = true; return { ok: true }; };
  P.appOpened = function (app) { if (C.APPS[app] && !this.profile.stats.appsOpened[app]) { this.profile.stats.appsOpened[app] = 1; return { first: true, achievements: R.checkAchievements(this.profile, this.day, 'app') }; } return { first: false }; };

  P.endDay = function (req) {
    req = req || {};
    if (!this.day) return { error: 'no_day' };
    if (this.day.settled) return { review: this.day.review, already: true, profile: this.publicProfile() };
    if (this.call && this.call.status === 'active') {
      if (!req.force) return { error: 'call_active', msg: 'خلّص المكالمة الحالية أول.' };
      this.endCall({ callId: this.call.id, reason: 'overtime' });
    }
    this.day.activeCallId = null;
    var r = R.endDay(this.profile, this.day, { now: this.now(), forfeit: !!req.forfeit, goalReachedLeft: req.goalReachedLeft, idleSec: req.idleSec });
    if (r.error) return { error: r.error, msg: r.error === 'too_early' ? 'الدوام ما خلص والهدف ما تحقق. تقدر تنهي اليوم مبكراً بس لو حققت الهدف أو تستسلم.' : 'تعذر إنهاء اليوم.' };
    this.call = null;
    this.checkpoint('day_end');
    return { review: r.review, profile: this.publicProfile() };
  };
  P.afterReview = function () {
    // بعد التقييم: لو نجح يبدأ اليوم التالي من جديد؛ لو فشل يقدر يعيد نفس اليوم
    var d = this.day; if (!d || !d.settled) return { ok: false };
    var pass = d.review && d.review.pass;
    this.day = null; this.checkpoint('post_review');
    return { ok: true, pass: !!pass, profile: this.publicProfile() };
  };

  P.buy = function (req) {
    if (req.reqId && this.reqCache['b' + req.reqId]) return this.reqCache['b' + req.reqId];
    var duringShift = !!(this.day && !this.day.settled);
    var r = R.buy(this.profile, req.itemId, req.reqId, { duringShift: duringShift });
    if (r.ok && !r.duplicate) this.checkpoint('purchase');
    var out = { ok: r.ok, error: r.error || null, msg: r.msg || null, state: r.state || null, duplicate: !!r.duplicate, achievements: r.achievements || [], profile: this.publicProfile() };
    if (req.reqId) this.reqCache['b' + req.reqId] = out;
    return out;
  };
  P.deliver = function (req) { var r = R.deliver(this.profile, req.itemId); if (r.ok) this.checkpoint('delivery'); return { ok: r.ok, profile: this.publicProfile() }; };
  P.resetProgress = function () { var s = this.profile.settings; this.profile = R.newProfile(); this.profile.settings = s; this.day = null; this.call = null; this.checkpoint('reset'); return { ok: true, profile: this.publicProfile() }; };

  return { Session: Session, sanitizeSay: sanitizeSay, reconcile: reconcile, pickLine: pickLine, lineVars: lineVars, cutAtBoundary: cutAtBoundary, speakText: speakText, shownValues: shownValues };
});

