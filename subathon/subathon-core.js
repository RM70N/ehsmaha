/* EHSEMHA SUBATHON — CORE (وحدة بحتة بلا DOM: قابلة للاختبار في Node والمتصفح)
 *
 * يحوي: تطبيع/تحليل الأوامر العربية (ARABIC LIVE COMMAND PARSER)، نموذج المتحكمين وصلاحياتهم، بوابة أمان الأوامر
 * (COMMAND SECURITY GATE: هوية، تفويض، حد معدل، منع تكرار، إعادة تشغيل، جلسة/Epoch)، الطابور وأوضاع التحكم
 * (قائد/تناوب/طابور)، وسجل التدقيق والمقاييس.
 *
 * ملاحظة الثقة: لا يوجد Backend مستقل في احسمها؛ البوابة تعمل داخل متصفح الستريمر نفسه (الذي يستقبل أحداث الشات من جسر
 * البث) — نفس حدّ الثقة الذي تعمل فيه ألعاب احسمها. المتحكمون لا يتحكمون إلا عبر نص التعليق، ولا يصل إليهم أي كود.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.SubathonCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ================= تطبيع النص العربي ================= */
  var AR_DIGITS = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
  function normalize(s) {
    s = String(s == null ? '' : s);
    s = s.replace(/[٠-٩۰-۹]/g, function (c) { return AR_DIGITS[c]; });
    s = s.replace(/[ً-ٰٟـ]/g, '');                 // تشكيل + تطويل
    s = s.replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ئ/g, 'ي').replace(/ؤ/g, 'و').replace(/ة/g, 'ه').replace(/گ/g, 'ك').replace(/ک/g, 'ك').replace(/ی/g, 'ي');
    s = s.replace(/[​-‏‪-‮⁦-⁩﻿]/g, '');
    s = s.toLowerCase();
    s = s.replace(/[^a-z0-9ء-ي\s]/g, ' ');                  // علامات الترقيم والرموز
    return s.replace(/\s+/g, ' ').trim();
  }
  /* يزيل «ال» التعريف الأولى لكل كلمة (للمقارنة المرنة بالأسماء فقط) */
  function bare(s) { return normalize(s).split(' ').map(function (w) { return w.length > 3 && w.indexOf('ال') === 0 ? w.slice(2) : w; }).join(' '); }

  /* ================= قاموس الأوامر (محدد وقابل للتنبؤ) ================= */
  var CMD = {
    down: ['تحت', 'انزل', 'نزل', 'اسفل', 'للاسفل', 'لتحت', 'تحت تحت'],
    up: ['فوق', 'اصعد', 'اطلع', 'اعلي', 'للاعلي', 'لفوق'],
    right: ['يمين', 'اليمين', 'لليمين', 'ليمين'],
    left: ['يسار', 'اليسار', 'لليسار', 'ليسار'],
    press: ['اضغط', 'اضغطه', 'اختار', 'اختر', 'افتح', 'ادخل', 'نفذ', 'اكبس', 'كبس', 'دوس'],
    back: ['رجوع', 'ارجع', 'عوده', 'للخلف', 'القايمه السابقه', 'القايمه اللي قبل', 'خلف'],
    games: ['الالعاب', 'افتح الالعاب', 'اختر لعبه', 'اختار لعبه', 'ارجع للالعاب', 'قايمه الالعاب', 'ارجع للقايمه', 'الرئيسيه', 'افتح الرئيسيه', 'روح للالعاب'],
    settings: ['الاعدادات', 'اعدادات', 'افتح الاعدادات', 'اعدادات اللعبه', 'افتح اعدادات اللعبه', 'الاعدادات الان'],
    start: ['ابدا', 'شغل', 'ابدا اللعبه', 'شغل اللعبه', 'ابدا اللعب', 'بدء اللعبه', 'ابدا البث'],
    startRound: ['ابدا الراوند', 'ابدا الجوله', 'ابدا المباراه', 'ابدا المواجهه', 'بدء الراوند', 'بدء الجوله', 'بدء المباراه', 'ابدا راوند', 'ابدا جوله'],
    next: ['التالي', 'الجوله التاليه', 'الراوند التالي', 'المباراه التاليه', 'المواجهه التاليه', 'التاليه', 'بعده'],
    newRound: ['جوله جديده', 'ابدا جوله جديده', 'راوند جديد', 'ابدا راوند جديد', 'جوله جديدة', 'العب مره ثانيه', 'مره ثانيه'],
    scrollDown: ['انزل الصفحه', 'مرر تحت', 'مرر للاسفل', 'نزل الصفحه', 'مرر لتحت'],
    scrollUp: ['ارفع الصفحه', 'مرر فوق', 'مرر للاعلي', 'اطلع الصفحه', 'مرر لفوق'],
    close: ['اغلق', 'اقفل', 'سكر', 'الغاء', 'الغ', 'اغلاق'],
    kick: ['اطرد لاعب', 'اطرد اللاعب', 'طرد لاعب', 'اطرد']
  };
  var NAVWORDS = {}; Object.keys(CMD).forEach(function (k) { CMD[k] = CMD[k].map(normalize); CMD[k].forEach(function (w) { (NAVWORDS[w] = NAVWORDS[w] || []).push(k); }); });
  function stripGo(t) { return t.replace(/^(روح|رح|لف|خش)\s+/, ''); }
  var PRESS_PREFIX = /^(?:اضغط على|اضغط|اختار|اختر|افتح|ادخل|نفذ|اكبس|كبس|دوس|شغل|ابدا)\s+(.+)$/;
  var NUM = /^(?:رقم\s+)?([1-9][0-9]?)$/;
  var MAXLEN = 60;

  /** يحلّل نص تعليق إلى أمر: {type, args?, raw, norm} أو null (ليس أمراً). لا يُنفّذ شيئاً. */
  function parse(text, ctx) {
    var raw = String(text == null ? '' : text); if (raw.length > 240) return null;
    var n = normalize(raw); if (!n || n.length > MAXLEN) return null;
    var g = stripGo(n);
    var m = NUM.exec(n); if (m) return ctx && ctx.pendingChoice ? { type: 'choose', args: { n: +m[1] }, raw: raw, norm: n } : null;
    function typeOf(map, key) { var l = NAVWORDS[key]; return l && l.indexOf(map) >= 0; }
    var order = ['kick', 'scrollDown', 'scrollUp', 'startRound', 'newRound', 'games', 'settings', 'next', 'back', 'close', 'down', 'up', 'right', 'left'];
    for (var i = 0; i < order.length; i++) { if (typeOf(order[i], g) || typeOf(order[i], n)) return { type: order[i], raw: raw, norm: n }; }
    // «ابدأ»/«شغل» وحدها = بدء اللعبة بحسب السياق. «اضغط» وحدها = ضغط المحدد.
    if (typeOf('start', n)) return { type: 'start', raw: raw, norm: n };
    if (typeOf('press', n)) return { type: 'press', raw: raw, norm: n };
    // «افتح/اختر/شغل <اسم>»: لعبة أو زر باسمه (الحسم في المنفّذ بسجل الأهداف)
    m = PRESS_PREFIX.exec(n);
    if (m && m[1]) return { type: 'name', args: { name: m[1].replace(/^(لعبه|لعبة|زر)\s+/, '') }, raw: raw, norm: n };
    // اسم بلا فعل: زر أو لعبة (قصير فقط، لتفادي تنفيذ كلام عادي)
    if (n.split(' ').length <= 4 && n.length <= 36) return { type: 'name', args: { name: n, bareOnly: true }, raw: raw, norm: n };
    return null;
  }

  /* مستويات الصلاحية المطلوبة لكل نوع أمر */
  var LEVEL_OF = { down: 1, up: 1, right: 1, left: 1, press: 1, back: 1, games: 1, scrollDown: 1, scrollUp: 1, close: 1, choose: 1,
    name: 1, kick: 1, settings: 2, start: 2, startRound: 2, next: 2, newRound: 2 };
  var LEVEL_NAMES = { 1: 'التنقل', 2: 'إدارة الألعاب', 3: 'تحكم ألعاب متقدم' };

  /* أنماط ممنوعة مطلقاً (مرحلة البوابة + مرحلة الأهداف): لوحة المالك/الحساب/الدفع/الحذف/الأمان */
  var BLOCK_RE = /(owner|مالك|admin|logout|signout|sign-out|تسجيل الخروج|خروج من الحساب|delete|حذف الحساب|account|payment|checkout|دفع|ادفع|subscribe|اشتراك|store|متجر|profile|الملف الشخصي|password|كلمه المرور|كلمة المرور|security|device|apikey|api-key|token|ownerOpen|ownerSwitch|authSign|signOut|deleteUser|resetAll|wipe|clearAllData|eval\(|javascript:)/i;
  var ADV_RE = /(kick|remove|force|forcewin|reset|end|finish|stop|ban|طرد|ازاله|إزالة|إنهاء|انهاء|إيقاف|ايقاف|اعاده ضبط|إعادة ضبط|تصفير|فوز اجباري|اجباري)/i;
  var SENSITIVE_TEXT = /(javascript:|<script|eval\(|function\s*\(|=>|document\.|window\.|localStorage|innerHTML)/i;

  /* ================= المتحكمون ================= */
  function idKey(platform, uniqueId) {
    var u = String(uniqueId == null ? '' : uniqueId).trim().toLowerCase();
    var p = String(platform || '').toLowerCase();
    var m = /^(tiktok|twitch|kick|youtube):(.+)$/.exec(u);
    if (m) { p = m[1]; u = m[2]; }
    u = u.replace(/^@+/, '');
    return (p || 'tiktok') + ':' + u;                                   // مطابقة حرفية دقيقة: لا تشابه ولا بادئة
  }

  function ControllerStore(initial) {
    this.map = {}; (initial || []).forEach(function (c) { this.map[c.key] = Object.assign({}, c); }, this);
  }
  ControllerStore.prototype.list = function () { var m = this.map; return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); }); };
  ControllerStore.prototype.get = function (key) { return this.map[key] || null; };
  ControllerStore.prototype.add = function (o) {
    var key = idKey(o.platform, o.username); var u = key.split(':')[1];
    if (!/^[a-z0-9._ء-ي-]{2,40}$/.test(u)) throw new Error('يوزر غير صالح');
    if (this.map[key]) throw new Error('المتحكم مضاف مسبقاً');
    if (Object.keys(this.map).length >= 12) throw new Error('الحد الأقصى ١٢ متحكماً');
    var level = o.level == null ? 3 : clampLevel(o.level);
    var c = { key: key, platform: key.split(':')[0], username: u, level: level, verified: !!o.verified, name: o.name || u, avatar: o.avatar || '', addedAt: o.addedAt || Date.now(), verifiedAt: o.verified ? (o.verifiedAt || Date.now()) : 0 };
    this.map[key] = c; return c;
  };
  ControllerStore.prototype.remove = function (key) { var c = this.map[key]; delete this.map[key]; return c || null; };
  ControllerStore.prototype.setLevel = function (key, level) { var c = this.map[key]; if (!c) return null; c.level = clampLevel(level); return c; };
  ControllerStore.prototype.verify = function (key, info) { var c = this.map[key]; if (!c) return null; if (!c.verified) { c.verified = true; c.verifiedAt = Date.now(); } if (info) { if (info.name) c.name = info.name; if (info.avatar) c.avatar = info.avatar; } return c; };
  ControllerStore.prototype.verifiedList = function () { return this.list().filter(function (c) { return c.verified; }); };
  function clampLevel(l) { l = parseInt(l, 10); return l >= 3 ? 3 : l === 2 ? 2 : 1; }

  /* ================= جلسة التحكم + البوابة + الطابور ================= */
  var DEFAULTS = { mode: 'leader', turnSec: 30, queueMax: 12, ttlMs: 8000, rateWindowMs: 1000, rateMax: 3, dedupeMs: 1500, seenMax: 400, minGapMs: 120, rejectLogMax: 400 };

  function Session(opts) {
    opts = opts || {};
    this.cfg = Object.assign({}, DEFAULTS, opts.cfg || {});
    this.store = opts.store || new ControllerStore();
    this.now = opts.now || function () { return Date.now(); };
    this.exec = opts.exec || function () { return Promise.resolve({ ok: false, detail: 'no-exec' }); };
    this.onEvent = opts.onEvent || function () {};
    this.active = false; this.epoch = 0; this.ctxEpoch = 0; this.mode = this.cfg.mode; this.leaderKey = null;
    this.turnIdx = 0; this.turnStart = 0; this.queue = []; this.busy = false; this.seq = 0;
    this.seen = []; this.rate = {}; this.audit = []; this.pendingChoice = null; this.cursorCtx = {};
    this.metrics = { received: 0, accepted: 0, executed: 0, ok: 0, failed: 0, rejected: 0, reasons: {}, parseMs: [], queueMs: [], execMs: [] };
  }
  Session.prototype._log = function (e) {
    e.at = this.now(); this.audit.push(e); if (this.audit.length > 300) this.audit.shift();
    if (e.status === 'rejected') { this.metrics.rejected++; this.metrics.reasons[e.reason] = (this.metrics.reasons[e.reason] || 0) + 1; }
    try { this.onEvent(e); } catch (x) {}
  };
  /* الأمر مقبول فقط في جلسة مفعّلة فعلاً؛ التفعيل يتطلب شروطاً (تتحقق منها الطبقة الأعلى) ثم يستدعي activate */
  Session.prototype.activate = function (o) {
    o = o || {}; if (!this.store.verifiedList().length) throw new Error('لا متحكم متحقَّق منه');
    this.active = true; this.epoch++; this.mode = o.mode || this.mode; this.queue = []; this.seen = []; this.rate = {}; this.pendingChoice = null;
    var ver = this.store.verifiedList();
    this.leaderKey = (o.leaderKey && this.store.get(o.leaderKey) && this.store.get(o.leaderKey).verified) ? o.leaderKey : ver[0].key;
    this.turnIdx = Math.max(0, ver.findIndex(function (c) { return c.key === this.leaderKey; }.bind(this))); this.turnStart = this.now();
    if (o.turnSec) this.cfg.turnSec = Math.max(5, Math.min(300, o.turnSec | 0));
    this._log({ status: 'info', type: 'activate', detail: 'mode=' + this.mode });
    return this.epoch;
  };
  /* سحب فوري: يُلغي الطابور ويُبطل أي أمر قيد الانتظار ويغيّر الـepoch فلا ينفَّذ شيء مما سبق */
  Session.prototype.revoke = function (why) {
    var dropped = this.queue.length; this.active = false; this.epoch++; this.queue = []; this.pendingChoice = null; this.busy = false;
    this._log({ status: 'info', type: 'revoke', detail: why || 'manual', dropped: dropped }); return dropped;
  };
  Session.prototype.setMode = function (mode, o) {
    if (['leader', 'rotation', 'queue'].indexOf(mode) < 0) throw new Error('وضع غير معروف'); o = o || {};
    var dropped = this.queue.length; this.mode = mode; this.queue = []; this.pendingChoice = null; this.epoch++;       // تغيير القائد/الوضع يُلغي أوامر المنتظرين
    if (o.leaderKey) this.setLeader(o.leaderKey, true); if (o.turnSec) this.cfg.turnSec = Math.max(5, Math.min(300, o.turnSec | 0));
    this.turnStart = this.now(); this._log({ status: 'info', type: 'mode', detail: mode, dropped: dropped });
  };
  Session.prototype.setLeader = function (key, silent) {
    var c = this.store.get(key); if (!c || !c.verified) throw new Error('القائد يجب أن يكون متحققاً منه');
    var prev = this.leaderKey, dropped = 0; this.leaderKey = key; var ver = this.store.verifiedList(); this.turnIdx = Math.max(0, ver.findIndex(function (x) { return x.key === key; })); this.turnStart = this.now();
    if (prev !== key) { dropped = this.queue.length; this.queue = []; this.epoch++; this.pendingChoice = null; }
    if (!silent) this._log({ status: 'info', type: 'leader', detail: key, dropped: dropped }); return dropped;
  };
  /* يُستدعى عند تغيّر الشاشة/اللعبة/النافذة: يبطل الأوامر القديمة المنتظرة (لا تُنفَّذ على شاشة مختلفة) */
  Session.prototype.contextChanged = function (why) { var d = this.queue.length; this.ctxEpoch++; this.queue = []; if (d) this._log({ status: 'info', type: 'ctx', detail: why || '', dropped: d }); return d; };

  Session.prototype.currentTurnKey = function () {
    var ver = this.store.verifiedList(); if (!ver.length) return null;
    if (this.mode === 'leader') return this.leaderKey;
    if (this.mode === 'rotation') { var elapsed = this.now() - this.turnStart; var step = Math.floor(elapsed / (this.cfg.turnSec * 1000)); return ver[(this.turnIdx + step) % ver.length].key; }
    return null;
  };
  Session.prototype.turnRemainingMs = function () { if (this.mode !== 'rotation') return 0; var per = this.cfg.turnSec * 1000; return per - ((this.now() - this.turnStart) % per); };

  /** نقطة الدخول الوحيدة لتعليق وارد. تُرجع قرار البوابة (قد يكون مرفوضاً بسبب). */
  Session.prototype.submit = function (evt) {
    var t0 = this.now(); this.metrics.received++;
    var text = String(evt && evt.text != null ? evt.text : ''); var key = idKey(evt && evt.platform, evt && evt.uniqueId);
    var reject = function (reason, extra) { var e = Object.assign({ status: 'rejected', reason: reason, who: key, text: safeText(text) }, extra || {}); this._log(e); return { ok: false, reason: reason }; }.bind(this);
    if (!this.active) return { ok: false, reason: 'inactive', silent: true };                           // لا تسجيل لتعليقات المشاهدين عند عدم التفعيل
    var c = this.store.get(key);
    if (!c) return { ok: false, reason: 'not-controller', silent: true };                              // مشاهد عادي: لا شيء يحدث ولا يُسجَّل نصه
    if (!c.verified) return reject('unverified');
    if (evt && evt.epoch != null && evt.epoch !== this.epoch) return reject('stale-epoch');             // حدث قديم من جلسة سابقة
    if (SENSITIVE_TEXT.test(text)) return reject('unsafe-text');
    var cmd = parse(text, { pendingChoice: !!(this.pendingChoice && this.pendingChoice.key === key && this.now() - this.pendingChoice.at < 35000) }); this.metrics.parseMs.push(this.now() - t0); if (this.metrics.parseMs.length > 200) this.metrics.parseMs.shift();
    if (!cmd) return { ok: false, reason: 'not-a-command', silent: true };
    if (LEVEL_OF[cmd.type] > c.level) return reject('level', { cmd: cmd.type, need: LEVEL_OF[cmd.type], has: c.level });
    // الدور/الوضع
    if (this.mode === 'leader' && key !== this.leaderKey) return reject('not-leader', { cmd: cmd.type });
    if (this.mode === 'rotation' && key !== this.currentTurnKey()) return reject('not-your-turn', { cmd: cmd.type });
    // Replay/Dedup: نفس المرسل+النص خلال نافذة قصيرة، أو معرّف الرسالة نفسه
    var now = this.now(); var mid = evt && evt.msgId ? 'm:' + evt.msgId : null; var dk = 'd:' + key + '|' + cmd.norm;
    for (var i = this.seen.length - 1; i >= 0; i--) { var s = this.seen[i]; if (now - s.t > 60000) break; if ((mid && s.id === mid) || (s.id === dk && now - s.t < this.cfg.dedupeMs)) return reject('duplicate', { cmd: cmd.type }); }
    this.seen.push({ id: mid || dk, t: now }); if (mid) this.seen.push({ id: dk, t: now }); if (this.seen.length > this.cfg.seenMax) this.seen.splice(0, this.seen.length - this.cfg.seenMax);
    // Rate limit
    var r = this.rate[key] = (this.rate[key] || []).filter(function (x) { return now - x < this.cfg.rateWindowMs; }.bind(this));
    if (r.length >= this.cfg.rateMax) return reject('rate-limit', { cmd: cmd.type }); r.push(now);
    // الطابور
    if (this.queue.length >= this.cfg.queueMax) return reject('queue-full', { cmd: cmd.type });
    var item = { id: ++this.seq, key: key, who: c.name || c.username, cmd: cmd, epoch: this.epoch, ctx: this.ctxEpoch, at: now, level: c.level };
    if (this.mode === 'queue' && conflicts(this.queue, item)) return reject('conflict', { cmd: cmd.type });
    this.queue.push(item); this.metrics.accepted++; this._log({ status: 'queued', who: key, name: item.who, cmd: cmd.type, text: safeText(cmd.raw), id: item.id });
    var self = this; Promise.resolve().then(function () { return self._pump(); });
    return { ok: true, queued: item.id, cmd: cmd.type };
  };
  function conflicts(queue, item) { // أمران متعارضان في الطابور: اتجاهان متضادان متتاليان من نفس الدفعة
    var opp = { up: 'down', down: 'up', left: 'right', right: 'left' }; var last = queue[queue.length - 1]; return !!(last && opp[last.cmd.type] && opp[last.cmd.type] === item.cmd.type && item.at - last.at < 300);
  }
  function safeText(t) { return String(t).slice(0, 60); }

  Session.prototype._pump = function () {
    if (this.busy) return Promise.resolve(); var self = this;
    var step = function () {
      if (!self.active) { self.busy = false; return Promise.resolve(); }
      var item = self.queue.shift(); if (!item) { self.busy = false; return Promise.resolve(); }
      self.busy = true; var now = self.now();
      if (item.epoch !== self.epoch) { self._log({ status: 'rejected', reason: 'stale-epoch', who: item.key, text: safeText(item.cmd.raw) }); return step(); }
      if (item.ctx !== self.ctxEpoch) { self._log({ status: 'rejected', reason: 'stale-context', who: item.key, text: safeText(item.cmd.raw) }); return step(); }
      if (now - item.at > self.cfg.ttlMs) { self._log({ status: 'rejected', reason: 'expired', who: item.key, text: safeText(item.cmd.raw) }); return step(); }
      var c = self.store.get(item.key);                                                                       // إعادة تحقق لحظة التنفيذ: قد سُحبت صلاحيته
      if (!c || !c.verified) { self._log({ status: 'rejected', reason: 'revoked', who: item.key, text: safeText(item.cmd.raw) }); return step(); }
      if (LEVEL_OF[item.cmd.type] > c.level) { self._log({ status: 'rejected', reason: 'level', who: item.key, text: safeText(item.cmd.raw) }); return step(); }
      self.metrics.queueMs.push(now - item.at); if (self.metrics.queueMs.length > 200) self.metrics.queueMs.shift();
      var t1 = self.now(); self.metrics.executed++; var ep = self.epoch;
      return Promise.resolve().then(function () { return self.exec(item, { level: c.level, epoch: ep }); }).then(function (res) {
        res = res || { ok: false, detail: 'empty' }; self.metrics.execMs.push(self.now() - t1); if (self.metrics.execMs.length > 200) self.metrics.execMs.shift();
        if (ep !== self.epoch) { return; }                                                                    // سُحب التفويض أثناء التنفيذ: لا نتيجة/أنيميشن
        if (res.ok) self.metrics.ok++; else { self.metrics.failed++; self.metrics.reasons['exec:' + (res.reason || 'fail')] = (self.metrics.reasons['exec:' + (res.reason || 'fail')] || 0) + 1; }
        if (res.choices) self.pendingChoice = { key: item.key, choices: res.choices, at: self.now() }; else if (item.cmd.type === 'choose' && !res.keep) self.pendingChoice = null;
        self._log({ status: res.ok ? 'done' : 'failed', who: item.key, name: item.who, cmd: item.cmd.type, text: safeText(item.cmd.raw), detail: res.detail || '', reason: res.reason || '', ms: self.now() - t1, id: item.id });
      }, function (e) { self.metrics.failed++; self._log({ status: 'failed', who: item.key, name: item.who, cmd: item.cmd.type, text: safeText(item.cmd.raw), reason: 'exception', detail: String(e && e.message || e).slice(0, 80), id: item.id }); })
        .then(function () { return new Promise(function (r) { setTimeout(r, self.cfg.minGapMs); }); }).then(step);
    };
    return step();
  };
  Session.prototype.stats = function () {
    function avg(a) { return a.length ? Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length) : null; }
    var m = this.metrics; var dec = m.ok + m.failed + m.rejected;
    return { received: m.received, accepted: m.accepted, executed: m.executed, ok: m.ok, failed: m.failed, rejected: m.rejected, okRate: dec ? Math.round((m.ok / dec) * 1000) / 10 : null, rejectRate: dec ? Math.round((m.rejected / dec) * 1000) / 10 : null, reasons: m.reasons, avgParseMs: avg(m.parseMs), avgQueueMs: avg(m.queueMs), avgExecMs: avg(m.execMs) };
  };

  /* ================= أنماط ألعاب بالأسماء (aliases) ================= */
  var GAME_ALIASES = { xo: ['xo', 'اكس او', 'اكسو', 'اكس اوه'], roulette3d: ['روليت', 'الروليت', 'الروليت الروسي', 'روسي'], rou: ['دايره الاقصاء', 'دائره الاقصاء'], tug: ['شد الحبل', 'الحبل'], draw: ['خمن الرسمه', 'الرسمه', 'رسمه'],
    main: ['اوجد الكلمه', 'اوجد'], guessword: ['خمن الموضوع'], tt10: ['توب 10', 'توب عشره'], rlgl: ['الضوء الاخضر', 'ضوء اخضر', 'الضوء الاحمر'], bomb: ['القنبله', 'القنبله المتحركه'], cannon: ['المدفع', 'المدفع البشري'],
    chairs: ['الكرسي', 'الكراسي', 'الكرسي المتحرك'], findball: ['الكوره', 'اعثر على الكوره'], harfnajat: ['حرف النجاه'], latatayeh: ['لا تطيحه', 'لاتطيحه'], glz: ['الطريق الزجاجي', 'زجاج'], 'volcanic-lands': ['الاراضي البركانيه', 'براكين'] };
  /** مطابقة اسم لعبة: تحدد البطاقات المرشحة من (tag,name). تُرجع قائمة مرتّبة بالتطابق الأدق. */
  function matchGames(query, games) {
    var q = normalize(query).replace(/^(لعبه|لعبة)\s+/, ''); var qb = bare(q); if (!q) return [];
    var exact = [], loose = [];
    games.forEach(function (g) {
      var names = [normalize(g.name)].concat((GAME_ALIASES[g.tag] || []).map(normalize)); var bares = names.map(bare);
      if (names.indexOf(q) >= 0 || bares.indexOf(qb) >= 0) exact.push(g);
    });
    return exact.length ? exact : loose;
  }

  /* ================= واجهة تصديرية ================= */
  return { normalize: normalize, bare: bare, parse: parse, CMD: CMD, LEVEL_OF: LEVEL_OF, LEVEL_NAMES: LEVEL_NAMES, BLOCK_RE: BLOCK_RE, ADV_RE: ADV_RE, SENSITIVE_TEXT: SENSITIVE_TEXT,
    idKey: idKey, ControllerStore: ControllerStore, Session: Session, DEFAULTS: DEFAULTS, matchGames: matchGames, GAME_ALIASES: GAME_ALIASES, clampLevel: clampLevel };
});
