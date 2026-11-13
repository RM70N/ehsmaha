/* BATMISH UI — لوحة تحكم ستريمر واحد. تُحمَّل فقط بعد موافقة الخادم على الوصول.
   المكونات (كلها داخل هذا الملف، منفصلة المسؤوليات):
   ValidationService · ConfigurationService · SettingsManager · PresetManager · HistoryManager · GameRegistry · Dashboard
   لا يحتوي أي كتالوج إعدادات ثابت: الإعدادات والقيم الافتراضية والمدى تأتي من الخادم (/batmish/bootstrap). */
(function () {
  'use strict';
  var B = window.Batmish;
  if (!B || B.ui) return;

  /* ============================================================ أدوات */
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
  function ago(ts) {
    var d = Math.max(0, Date.now() - ts), m = Math.round(d / 60000);
    if (m < 1) return 'الآن'; if (m < 60) return 'قبل ' + m + ' دقيقة'; var h = Math.round(m / 60); if (h < 24) return 'قبل ' + h + ' ساعة';
    return 'قبل ' + Math.round(h / 24) + ' يوم';
  }
  function fmtVal(f, v) {
    if (f && f.type === 'toggle') return v ? 'ON' : 'OFF';
    if (Array.isArray(v)) return v.join(' / ');
    return String(v) + (f && f.unit ? f.unit : '');
  }

  var ICONS = {
    cmd: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 8v8M8.5 10v4M15.5 10v4"/>',
    games: '<rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/>',
    adv: '<path d="M4 7h8M16 7h4M4 17h3M11 17h9M4 12h13M21 12h-1"/><circle cx="14" cy="7" r="2"/><circle cx="9" cy="17" r="2"/><circle cx="19" cy="12" r="1.2"/>',
    round: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/>',
    players: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19c.6-3.4 2.9-5 5.5-5s4.9 1.6 5.5 5"/><circle cx="17" cy="9.5" r="2.4"/><path d="M16.5 14.3c2.4 0 3.8 1.3 4.3 4"/>',
    stream: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
    balance: '<path d="M12 4v16M7 20h10M5 8h14"/><path d="M5 8l-2.5 6a3 3 0 0 0 5 0z"/><path d="M19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
    av: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 10.5v3"/>',
    auto: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
    presets: '<path d="M6 4h12v17l-6-4.2L6 21z"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4.5V8h3.5"/><path d="M12 8v4.2l2.8 1.8"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', reset: '<path d="M4 12a8 8 0 1 1 2.4 5.7"/><path d="M4 18v-5h5"/>',
    copy: '<rect x="8" y="8" width="11" height="12"/><path d="M5 16V4h10"/>', trash: '<path d="M5 7h14M9 7V4.5h6V7M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 18.9l1-5.4-4-3.8 5.4-.7z"/>', save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>', back: '<path d="M9 5l7 7-7 7"/>', warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    lock: '<rect x="5" y="11" width="14" height="9"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', play: '<path d="M7 5l12 7-12 7z"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[n] || '') + '</svg>'; }

  /* ============================================================ BatmishValidationService (تحقق فوري للواجهة؛ الخادم هو المرجع) */
  var ValidationService = {
    check: function (f, v) {
      if (f.type === 'toggle') return typeof v === 'boolean' ? { ok: true, v: v } : { ok: false, msg: 'قيمة غير صالحة' };
      if (f.type === 'number') {
        if (typeof v !== 'number' || !isFinite(v)) return { ok: false, msg: 'أدخل رقماً' };
        if (!Number.isInteger(v)) return { ok: false, msg: 'أدخل رقماً صحيحاً بدون كسور' };
        if (v < f.min || v > f.max) return { ok: false, msg: 'القيمة لازم تكون بين ' + f.min + ' و ' + f.max };
        return { ok: true, v: v };
      }
      if (f.type === 'numberArray') {
        if (!Array.isArray(v) || v.length !== f.length) return { ok: false, msg: 'لازم ' + f.length + ' قيم' };
        for (var i = 0; i < v.length; i++) {
          if (typeof v[i] !== 'number' || !isFinite(v[i]) || !Number.isInteger(v[i])) return { ok: false, msg: 'كل القيم أرقام صحيحة' };
          if (v[i] < f.min || v[i] > f.max) return { ok: false, msg: 'كل قيمة بين ' + f.min + ' و ' + f.max };
          if (f.monotonic === 'desc' && i && v[i] > v[i - 1]) return { ok: false, msg: 'كل قيمة أقل من أو تساوي اللي قبلها' };
        }
        return { ok: true, v: v };
      }
      return { ok: false, msg: 'نوع غير مدعوم' };
    }
  };

  var ERR_AR = {
    out_of_range: 'القيمة خارج المدى المسموح', invalid_type: 'نوع القيمة غير صحيح', not_integer: 'لازم رقم صحيح', not_descending: 'الترتيب لازم يكون تنازلياً',
    invalid_length: 'عدد القيم غير صحيح', unknown_setting: 'إعداد غير معروف', unknown_game: 'لعبة غير معروفة', duplicate_name: 'الاسم مستخدم من قبل',
    invalid_name: 'اسم غير صالح (حتى 40 حرفاً)', too_many_presets: 'وصلت الحد الأقصى للمجموعات لهذي اللعبة', conflict: 'تغيّرت الإعدادات من مكان آخر',
    forbidden: 'ما عندك صلاحية — تأكد من ربط البث', rate_limited: 'طلبات كثيرة، انتظر قليلاً', not_found: 'غير موجود', already_reverted: 'تم التراجع عنه من قبل', internal: 'خطأ في الخادم'
  };

  /* ============================================================ BatmishConfigurationService */
  var ConfigurationService = {
    call: function (method, path, body) {
      return B.controller.request(method, path, body).then(function (r) {
        if (r.status >= 200 && r.status < 300) return r.body;
        var e = new Error((r.body && r.body.error) || 'http_' + r.status); e.status = r.status; e.code = r.body && r.body.error; e.detail = r.body && r.body.detail; e.rev = r.body && r.body.rev; e.reason = r.body && r.body.reason;
        throw e;
      });
    },
    bootstrap: function () { return this.call('GET', '/batmish/bootstrap'); },
    save: function (tag, values, baseRev) { return this.call('POST', '/batmish/config', { tag: tag, values: values, baseRev: baseRev }); },
    reset: function (tag, key, baseRev) { return this.call('POST', '/batmish/reset', { tag: tag, key: key, baseRev: baseRev }); },
    preset: function (op, p) { var b = { op: op }; for (var k in p) b[k] = p[k]; return this.call('POST', '/batmish/presets', b); },
    history: function (tag) { return this.call('GET', '/batmish/history?limit=200' + (tag ? '&tag=' + encodeURIComponent(tag) : '')); },
    revert: function (id, baseRev) { return this.call('POST', '/batmish/history/revert', { id: id, baseRev: baseRev }); },
    restoreGame: function (tag, baseRev) { return this.call('POST', '/batmish/history/restore-game', { tag: tag, baseRev: baseRev }); }
  };
  function errMsg(e) {
    if (e && e.offline) return 'ما قدرنا نوصل للخادم. تعديلاتك محفوظة كمسودة على جهازك — جرّب مرة ثانية.';
    var base = (e && ERR_AR[e.code]) || 'تعذّر تنفيذ العملية';
    if (e && e.detail && e.detail.min != null) base += ' (' + e.detail.min + ' – ' + e.detail.max + ')';
    return base;
  }

  /* ============================================================ BatmishSettingsManager */
  function SettingsManager() {
    this.games = {}; this.rev = 0; this.config = {}; this.presets = {}; this.defaultPresets = {}; this.drafts = {};
    this.saveState = 'saved'; this.listeners = []; this.uid = null; this.autosave = false; this.timer = null; this.lastChange = null;
  }
  SettingsManager.prototype.on = function (fn) { this.listeners.push(fn); };
  SettingsManager.prototype.emit = function (what) { for (var i = 0; i < this.listeners.length; i++) { try { this.listeners[i](what); } catch (e) {} } };
  SettingsManager.prototype.draftKey = function () { return 'batmish:draft:' + (this.uid || 'x'); };
  SettingsManager.prototype.load = function (boot, uid) {
    this.games = boot.games; this.uid = uid;
    this.applyServerState(boot.state);
    try { var d = JSON.parse(localStorage.getItem(this.draftKey()) || '{}'); this.drafts = this.sanitizeDrafts(d); } catch (e) { this.drafts = {}; }
    try { this.autosave = localStorage.getItem('batmish:autosave') === '1'; } catch (e) {}
    this.saveState = this.dirtyCount() ? 'dirty' : 'saved';
  };
  SettingsManager.prototype.applyServerState = function (st) { this.rev = st.rev | 0; this.config = st.config || {}; this.presets = st.presets || {}; this.defaultPresets = st.defaultPresets || {}; this.lastChange = null; };
  SettingsManager.prototype.sanitizeDrafts = function (d) {
    var out = {};
    for (var tag in d) { if (!this.games[tag]) continue; for (var k in d[tag]) { var f = this.field(tag, k); if (f && ValidationService.check(f, d[tag][k]).ok && !same(d[tag][k], this.serverValue(tag, k))) { (out[tag] = out[tag] || {})[k] = d[tag][k]; } } }
    return out;
  };
  SettingsManager.prototype.persistDrafts = function () { try { var k = this.draftKey(); if (this.dirtyCount()) localStorage.setItem(k, JSON.stringify(this.drafts)); else localStorage.removeItem(k); } catch (e) {} };
  SettingsManager.prototype.field = function (tag, key) { var g = this.games[tag]; if (!g) return null; for (var i = 0; i < g.fields.length; i++) if (g.fields[i].key === key) return g.fields[i]; return null; };
  SettingsManager.prototype.defaultOf = function (tag, key) { return this.field(tag, key).default; };
  SettingsManager.prototype.serverValue = function (tag, key) { var c = this.config[tag]; return c && c[key] !== undefined ? c[key] : this.defaultOf(tag, key); };
  SettingsManager.prototype.value = function (tag, key) { var d = this.drafts[tag]; return d && d[key] !== undefined ? d[key] : this.serverValue(tag, key); };
  SettingsManager.prototype.isModified = function (tag, key) { return !same(this.value(tag, key), this.defaultOf(tag, key)); };
  SettingsManager.prototype.isDirty = function (tag, key) { var d = this.drafts[tag]; return !!(d && d[key] !== undefined); };
  SettingsManager.prototype.dirtyTags = function () { return Object.keys(this.drafts).filter(function (t) { return Object.keys(this.drafts[t]).length; }, this); };
  SettingsManager.prototype.dirtyCount = function (tag) {
    var n = 0, tags = tag ? [tag] : Object.keys(this.drafts);
    for (var i = 0; i < tags.length; i++) n += Object.keys(this.drafts[tags[i]] || {}).length; return n;
  };
  SettingsManager.prototype.customizedCount = function (tag) { var c = this.config[tag]; return c ? Object.keys(c).length : 0; };
  SettingsManager.prototype.totalCustomized = function () { var n = 0; for (var t in this.config) n += Object.keys(this.config[t]).length; return n; };
  SettingsManager.prototype.setDraft = function (tag, key, v) {
    if (same(v, this.serverValue(tag, key))) { if (this.drafts[tag]) { delete this.drafts[tag][key]; if (!Object.keys(this.drafts[tag]).length) delete this.drafts[tag]; } }
    else (this.drafts[tag] = this.drafts[tag] || {})[key] = clone(v);
    this.persistDrafts();
    this.setState(this.dirtyCount() ? 'dirty' : 'saved');
    if (this.autosave && this.dirtyCount()) this.scheduleAutosave();
  };
  SettingsManager.prototype.discard = function (tag) {
    if (tag) delete this.drafts[tag]; else this.drafts = {};
    this.persistDrafts(); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); this.emit('drafts');
  };
  SettingsManager.prototype.setState = function (s) { if (this.saveState !== s) { this.saveState = s; this.emit('state'); } };
  SettingsManager.prototype.setAutosave = function (on) { this.autosave = !!on; try { localStorage.setItem('batmish:autosave', on ? '1' : '0'); } catch (e) {} if (on && this.dirtyCount()) this.scheduleAutosave(); this.emit('state'); };
  SettingsManager.prototype.scheduleAutosave = function () { var self = this; clearTimeout(this.timer); this.timer = setTimeout(function () { self.saveAll(true); }, 1400); };
  // تطبيق قائمة changes راجعة من الخادم على النسخة المحلية + تحديث تخصيص الألعاب النشط
  SettingsManager.prototype.applyChanges = function (rev, changes) {
    for (var i = 0; i < (changes || []).length; i++) {
      var c = changes[i], def = this.defaultOf(c.tag, c.key);
      if (same(c.new, def)) { if (this.config[c.tag]) { delete this.config[c.tag][c.key]; if (!Object.keys(this.config[c.tag]).length) delete this.config[c.tag]; } }
      else (this.config[c.tag] = this.config[c.tag] || {})[c.key] = clone(c.new);
      if (this.drafts[c.tag]) { delete this.drafts[c.tag][c.key]; if (!Object.keys(this.drafts[c.tag]).length) delete this.drafts[c.tag]; }
    }
    if (changes && changes.length) { this.rev = rev; this.lastChange = changes[changes.length - 1]; B.resolver.set(this.rev, clone(this.config)); }
    this.persistDrafts();
  };
  SettingsManager.prototype.save = function (tag) {
    var self = this, d = this.drafts[tag];
    if (!d || !Object.keys(d).length) return Promise.resolve({ changes: [] });
    return ConfigurationService.save(tag, clone(d), this.rev).then(function (r) { self.applyChanges(r.rev, r.changes); return r; });
  };
  SettingsManager.prototype.saveAll = function (silent) {
    var self = this, tags = this.dirtyTags();
    if (!tags.length) return Promise.resolve(true);
    this.setState('saving');
    return tags.reduce(function (p, t) { return p.then(function () { return self.save(t); }); }, Promise.resolve()).then(function () {
      self.setState(self.dirtyCount() ? 'dirty' : 'saved'); self.emit('saved'); return true;
    }, function (e) {
      self.setState('error'); self.lastError = e;
      if (e && e.code === 'conflict') return self.refresh().then(function () { self.setState('dirty'); self.emit('conflict'); return false; });
      self.emit('error', e); return false;
    });
  };
  SettingsManager.prototype.refresh = function () {
    var self = this;
    return ConfigurationService.bootstrap().then(function (b) { self.games = b.games; self.applyServerState(b.state); self.drafts = self.sanitizeDrafts(self.drafts); self.persistDrafts(); B.resolver.set(self.rev, clone(self.config)); self.emit('refreshed'); });
  };
  SettingsManager.prototype.resetGame = function (tag) {
    var self = this; delete this.drafts[tag]; this.persistDrafts();
    return ConfigurationService.reset(tag, null, this.rev).then(function (r) { self.applyChanges(r.rev, r.changes); self.setState(self.dirtyCount() ? 'dirty' : 'saved'); return r; });
  };
  SettingsManager.prototype.resetKey = function (tag, key) {
    var self = this;
    if (this.isDirty(tag, key) && same(this.serverValue(tag, key), this.defaultOf(tag, key))) { this.setDraft(tag, key, this.defaultOf(tag, key)); return Promise.resolve({ changes: [] }); }
    if (this.isDirty(tag, key)) delete this.drafts[tag][key];
    if (same(this.serverValue(tag, key), this.defaultOf(tag, key))) { this.persistDrafts(); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); return Promise.resolve({ changes: [] }); }
    return ConfigurationService.reset(tag, key, this.rev).then(function (r) { self.applyChanges(r.rev, r.changes); self.setState(self.dirtyCount() ? 'dirty' : 'saved'); return r; });
  };
  SettingsManager.prototype.effectiveOverrides = function (tag) {
    var out = {}, g = this.games[tag]; if (!g) return out;
    for (var i = 0; i < g.fields.length; i++) { var k = g.fields[i].key, v = this.value(tag, k); if (!same(v, g.fields[i].default)) out[k] = clone(v); }
    return out;
  };

  /* ============================================================ BatmishPresetManager */
  function PresetManager(sm) { this.sm = sm; }
  PresetManager.prototype.forGame = function (tag) { var s = this.sm, out = []; for (var id in s.presets) if (s.presets[id].tag === tag) out.push(s.presets[id]); return out.sort(function (a, b) { return a.createdAt - b.createdAt; }); };
  PresetManager.prototype.create = function (tag, name, values) { var s = this.sm; return ConfigurationService.preset('create', { tag: tag, name: name, values: values }).then(function (r) { s.presets[r.preset.id] = r.preset; return r.preset; }); };
  PresetManager.prototype.rename = function (id, name) { var s = this.sm; return ConfigurationService.preset('update', { id: id, name: name }).then(function (r) { s.presets[id] = r.preset; return r.preset; }); };
  PresetManager.prototype.overwrite = function (id, values) { var s = this.sm; return ConfigurationService.preset('update', { id: id, values: values }).then(function (r) { s.presets[id] = r.preset; return r.preset; }); };
  PresetManager.prototype.duplicate = function (id) { var s = this.sm; return ConfigurationService.preset('duplicate', { id: id }).then(function (r) { s.presets[r.preset.id] = r.preset; return r.preset; }); };
  PresetManager.prototype.remove = function (id) { var s = this.sm; return ConfigurationService.preset('delete', { id: id }).then(function () { var t = s.presets[id] && s.presets[id].tag; delete s.presets[id]; if (t && s.defaultPresets[t] === id) delete s.defaultPresets[t]; }); };
  PresetManager.prototype.setDefault = function (id) { var s = this.sm; return ConfigurationService.preset('default', { id: id }).then(function (r) { s.defaultPresets[r.tag] = id; }); };
  PresetManager.prototype.apply = function (id) { var s = this.sm; s.discard(s.presets[id] && s.presets[id].tag); return ConfigurationService.preset('apply', { id: id, baseRev: s.rev }).then(function (r) { s.applyChanges(r.rev, r.changes); return r; }); };

  /* ============================================================ BatmishHistoryManager */
  function HistoryManager(sm) { this.sm = sm; this.items = []; }
  HistoryManager.prototype.load = function (tag) { var self = this; return ConfigurationService.history(tag).then(function (r) { self.items = r.history || []; return self.items; }); };
  HistoryManager.prototype.revert = function (id) { var s = this.sm; return ConfigurationService.revert(id, s.rev).then(function (r) { s.applyChanges(r.rev, r.changes); return r; }); };
  HistoryManager.prototype.restoreGame = function (tag) { var s = this.sm; return ConfigurationService.restoreGame(tag, s.rev).then(function (r) { s.applyChanges(r.rev, r.changes); return r; }); };

  /* ============================================================ BatmishGameRegistry
     يقرأ سجل الألعاب الفعلي في الصفحة (.gcard[data-tag]: مصدر الحقيقة لبطاقات الستريمر) ويدمجه مع ما يُعلنه الخادم
     من حقول قابلة للتخصيص. لعبة بلا حقول موصولة بمنطقها تظهر كـ«غير قابلة للتخصيص» وليس لها زر إعدادات. */
  var GameRegistry = {
    discover: function (games) {
      var seen = {}, list = [];
      $all('.gcard[data-tag]').forEach(function (c) {
        var tag = c.getAttribute('data-tag'); if (!tag || seen[tag]) return; seen[tag] = 1;
        var nm = $('.gcard-name', c), ds = $('.gcard-desc', c), sv = $('.gcard-icon svg', c);
        var g = games[tag];
        list.push({ tag: tag, name: (nm && nm.textContent.trim()) || (g && g.name) || tag, desc: c.getAttribute('data-short') || (ds && ds.textContent.trim()) || (g && g.desc) || '', icon: sv ? sv.outerHTML : '', category: c.getAttribute('data-category') || '', fields: g ? g.fields.length : 0 });
      });
      Object.keys(games).forEach(function (tag) {
        if (seen[tag] || tag.indexOf('__') === 0) return;
        list.push({ tag: tag, name: games[tag].name, desc: games[tag].desc || '', icon: '', category: '', fields: games[tag].fields.length });
      });
      return list.sort(function (a, b) { return (b.fields > 0) - (a.fields > 0) || 0; });
    }
  };

  /* ============================================================ BatmishDashboard */
  var NAV = [
    ['cmd', 'COMMAND CENTER', 'cmd'], ['games', 'ALL GAMES', 'games'], ['advanced', 'ADVANCED SETTINGS', 'adv'], ['round', 'ROUND CONTROL', 'round'],
    ['players', 'PLAYER EXPERIENCE', 'players'], ['stream', 'STREAM INTERACTION', 'stream'], ['balance', 'GAME BALANCING', 'balance'],
    ['av', 'AUDIO & VISUAL', 'av'], ['auto', 'AUTOMATION', 'auto'], ['presets', 'PRESETS', 'presets'], ['history', 'HISTORY', 'history']
  ];
  var SECTION_INFO = {
    round: { title: 'ROUND CONTROL', ar: 'مدد الجولات والمحاولات والعدّادات في كل الألعاب', cats: ['round'] },
    players: { title: 'PLAYER EXPERIENCE', ar: 'ما يخص اللاعبين: الإنعاش وإعادة الانضمام وعدد المرات المسموحة', cats: ['players'] },
    stream: { title: 'STREAM INTERACTION', ar: 'تفاعل جمهور البث', cats: ['interaction'] },
    balance: { title: 'GAME BALANCING', ar: 'نقاط المكافآت، الصعوبة، الحصانة والمضاعفات', cats: ['scoring', 'balance', 'difficulty'] },
    av: { title: 'AUDIO & VISUAL', ar: 'مستوى الصوت والمؤثرات البصرية', tag: '__site' }
  };
  var TAB_AR = { GENERAL: 'GENERAL', GAMEPLAY: 'GAMEPLAY', PLAYERS: 'PLAYERS', DIFFICULTY: 'DIFFICULTY', SCORING: 'SCORING', ADVANCED: 'ADVANCED' };
  var AUTO_RE = /^(timerEnabled|turnSeconds|answerSeconds|timerSeconds|timeLimit|maxSeconds|hintAfterSeconds|holdDuration|revival.*|speedupEnabled|chairReductionPercent|shuffleSpeedupPercent)$/;

  function Dashboard() {
    this.sm = new SettingsManager(); this.presets = new PresetManager(this.sm); this.hist = new HistoryManager(this.sm);
    this.root = null; this.view = 'cmd'; this.arg = null; this.tab = 'GENERAL'; this.games = []; this.ctl = null; this.ready = false; this.errs = {}; this.q = '';
    this.filter = 'all'; this.histTag = ''; this.presetTag = ''; this.lastFocus = null;
  }

  Dashboard.prototype.open = function (ctl) {
    var self = this; this.ctl = ctl; this.lastFocus = document.activeElement;
    this.ensureFonts();
    if (!this.root) this.build();
    document.body.appendChild(this.root);
    void this.root.offsetWidth; this.root.classList.add('is-open');
    this.root.removeAttribute('inert'); this.root.setAttribute('aria-hidden', 'false');
    document.documentElement.style.overflow = 'hidden';
    this.go(this.view || 'cmd');
    var first = $('.bm-nav button[aria-current="page"]', this.root) || $('.bm-nav button', this.root); if (first) first.focus({ preventScroll: true });
    this.sm.on(function (what) { self.onSm(what); });
    this.loadAll();
  };

  Dashboard.prototype.ensureFonts = function () {
    if (document.getElementById('batmish-fonts')) return;
    var l = document.createElement('link'); l.id = 'batmish-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;600;700;800;900&family=IBM+Plex+Mono:wght@400;500&display=swap';
    document.head.appendChild(l);
  };

  Dashboard.prototype.loadAll = function () {
    var self = this, u = B.controller.user();
    this.ready = false; this.loadError = null; this.render();
    ConfigurationService.bootstrap().then(function (boot) {
      self.sm.load(boot, u && u.uid);
      B.resolver.set(self.sm.rev, clone(self.sm.config), u && u.uid);
      self.games = GameRegistry.discover(boot.games);
      self.ready = true;
      self.hist.load().then(function (items) { self.lastEntry = items[0] || null; if (self.view === 'cmd') self.render(); }, function () {});
      self.render();
    }, function (e) { self.loadError = e; self.ready = false; self.render(); });
  };

  Dashboard.prototype.onSm = function (what) {
    if (!this.root) return;
    this.updateStatus(); this.updateSavebar();
    if (what === 'conflict') this.toast('تغيّرت الإعدادات من جهاز أو تبويب آخر. حدّثناها، راجع تعديلاتك واحفظ مجدداً.', 'err');
    if (what === 'saved') this.toast('تم الحفظ. تُطبَّق التعديلات من الراوند التالي.', 'ok');
    if (what === 'error') this.toast(errMsg(this.sm.lastError), 'err');
    if (what === 'refreshed') this.render();
  };

  /* ------------------------------------------------------------ الهيكل */
  Dashboard.prototype.build = function () {
    var self = this, r = document.createElement('div');
    r.className = 'bm'; r.id = 'batmish-root'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'BATMISH Command Center');
    r.innerHTML =
      '<div class="bm-bg" aria-hidden="true"><div class="bm-beam"></div>' +
      '<div class="bm-sky"><svg viewBox="0 0 1200 200" preserveAspectRatio="none"><path fill="currentColor" d="M0 200V132h40V96h28v36h30V70h34v62h24V108h46V60h24V40h14v20h20v72h38V90h36v42h30V76h40v56h24V100h44V54h22v-14h12v14h22v78h30v-36h38v36h26V84h46v48h32V66h30V30h10v36h26v66h36v-30h44v30h30V92h40v40h28V74h34v58h40V104h30v28h36V86h42v46h34V58h28V42h12v16h24v74h30V96h38v36h40V80h32v52h26v-24h44v24h30V68h36v64h34v-30h46v30h28V92h34v40h30V76h28v124z"/></svg></div>' +
      '<div class="bm-scan"></div></div>' +
      '<aside class="bm-side" aria-label="BATMISH navigation"><div class="bm-brand">' + B.BAT_SVG + '<div><b>BATMISH</b><small>THE DARK KNIGHT</small></div></div>' +
      '<nav class="bm-nav">' + NAV.map(function (n) { return '<button type="button" data-nav="' + n[0] + '">' + ic(n[2]) + '<span>' + n[1] + '</span></button>'; }).join('') + '</nav>' +
      '<div class="bm-side-foot"><span id="bm-foot-user"></span><br>OVERLAY <b id="bm-foot-rev">-</b></div></aside>' +
      '<main class="bm-main"><header class="bm-top"><button type="button" class="bm-x bm-menu" data-act="menu" aria-label="القائمة">' + ic('menu') + '</button>' +
      '<div class="bm-crumb" id="bm-crumb"></div><span class="bm-status" id="bm-status" role="status" aria-live="polite"><span class="bm-hide-s" id="bm-status-t"></span></span>' +
      '<button type="button" class="bm-x" data-act="close" aria-label="إغلاق BATMISH">' + ic('x') + '</button></header>' +
      '<div class="bm-scroll" id="bm-scroll"><div class="bm-view" id="bm-view"></div></div>' +
      '<div class="bm-savebar" id="bm-savebar"><div class="bm-panel is-gold"><div class="bm-in"><div class="bm-savebar-msg" id="bm-savebar-msg"></div><div id="bm-savebar-act" class="bm-row-act"></div></div></div></div>' +
      '<div class="bm-toasts" id="bm-toasts" aria-live="polite"></div></main>';
    this.root = r;
    r.addEventListener('click', function (e) { self.onClick(e); });
    r.addEventListener('input', function (e) { self.onInput(e); });
    r.addEventListener('change', function (e) { self.onChange(e); });
    r.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { if ($('.bm-modal', r)) return; e.preventDefault(); self.requestClose(); }
    });
    document.addEventListener('focusin', this._trap = function (e) { if (self.root && self.root.classList.contains('is-open') && !self.root.contains(e.target) && !e.target.closest('.bm-warp')) { var f = $('.bm-nav button', self.root); if (f) f.focus(); } });
  };

  Dashboard.prototype.updateStatus = function () {
    var s = this.sm, el = $('#bm-status', this.root), t = $('#bm-status-t', this.root); if (!el) return;
    var map = { saved: ['SAVED', 'saved'], dirty: ['UNSAVED ' + s.dirtyCount(), 'dirty'], saving: ['SAVING', 'saving'], error: ['SAVE FAILED', 'error'] }, m = map[s.saveState] || map.saved;
    el.setAttribute('data-s', m[1]); t.textContent = m[0];
    var rev = $('#bm-foot-rev', this.root); if (rev) rev.textContent = B.resolver.active ? 'ACTIVE · REV ' + B.resolver.rev : 'OFFLINE';
    var us = $('#bm-foot-user', this.root); if (us) us.textContent = '@' + B.STREAMER;
  };

  Dashboard.prototype.updateSavebar = function () {
    var s = this.sm, bar = $('#bm-savebar', this.root); if (!bar) return;
    var scope = this.view === 'game' ? this.arg : null, n = s.dirtyCount(scope);
    var bad = this.hasBad(scope);
    bar.classList.toggle('is-on', n > 0 || s.saveState === 'error' && s.dirtyCount() > 0);
    var msg = $('#bm-savebar-msg', this.root), act = $('#bm-savebar-act', this.root);
    var saving = s.saveState === 'saving';
    msg.innerHTML = (s.saveState === 'error' ? '<b>فشل الحفظ.</b> مسودتك محفوظة على جهازك. ' : '') + (n ? '<b>' + n + '</b> تعديل غير محفوظ. يُطبَّق من <b>الراوند التالي</b>، والراوند الجاري يكمل بإعداداته.' : '');
    act.innerHTML =
      '<label class="bm-switch" title="حفظ تلقائي"><input type="checkbox" data-act="autosave"' + (s.autosave ? ' checked' : '') + '><span class="bm-switch-track"></span><span class="bm-switch-txt">AUTO</span></label>' +
      '<button type="button" class="bm-btn is-ghost" data-act="discard"' + (saving ? ' disabled' : '') + '>' + ic('reset') + 'DISCARD</button>' +
      (this.view === 'game' ? '<button type="button" class="bm-btn is-ghost" data-act="savepreset"' + (bad || saving ? ' disabled' : '') + '>' + ic('presets') + 'SAVE AS PRESET</button>' : '') +
      '<button type="button" class="bm-btn is-primary" data-act="save"' + (bad || saving ? ' disabled' : '') + '>' + ic('save') + (saving ? 'SAVING…' : 'SAVE & APPLY TO NEXT ROUND') + '</button>';
  };
  Dashboard.prototype.hasBad = function (tag) { for (var k in this.errs) { if (!this.errs[k]) continue; if (!tag || k.indexOf(tag + '.') === 0) return true; } return false; };

  Dashboard.prototype.go = function (view, arg) {
    this.view = view; this.arg = arg == null ? null : arg;
    if (view === 'game') { this.tab = this._tabFor(arg); }
    this.root.classList.remove('is-nav');
    this.render(true);
    var sc = $('#bm-scroll', this.root); if (sc) sc.scrollTop = 0;
  };
  Dashboard.prototype._tabFor = function (tag) {
    var g = this.sm.games[tag]; if (!g) return 'GENERAL';
    var order = ['GENERAL', 'GAMEPLAY', 'PLAYERS', 'DIFFICULTY', 'SCORING', 'ADVANCED'];
    for (var i = 0; i < order.length; i++) if (g.fields.some(function (f) { return f.tab === order[i]; })) return order[i];
    return 'GENERAL';
  };

  Dashboard.prototype.crumb = function () {
    var nm = '';
    for (var i = 0; i < NAV.length; i++) if (NAV[i][0] === this.view || (this.view === 'game' && NAV[i][0] === 'games')) nm = NAV[i][1];
    var g = this.view === 'game' ? this.gameInfo(this.arg) : null;
    return 'BATMISH / <b>' + esc(nm) + '</b>' + (g ? ' / <b style="font-family:var(--bm-ar);letter-spacing:0">' + esc(g.name) + '</b>' : '');
  };
  Dashboard.prototype.gameInfo = function (tag) { for (var i = 0; i < this.games.length; i++) if (this.games[i].tag === tag) return this.games[i]; var g = this.sm.games[tag]; return g ? { tag: tag, name: g.name, desc: g.desc, icon: '', fields: g.fields.length } : null; };

  Dashboard.prototype.render = function (animate) {
    if (!this.root) return;
    $all('.bm-nav button', this.root).forEach(function (b) {
      var on = b.getAttribute('data-nav') === this.view || (this.view === 'game' && b.getAttribute('data-nav') === 'games');
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }, this);
    $('#bm-crumb', this.root).innerHTML = this.crumb();
    var v = $('#bm-view', this.root), html;
    if (this.loadError) html = this.vError();
    else if (!this.ready) html = '<div class="bm-games">' + [1, 2, 3, 4, 5, 6].map(function () { return '<div class="bm-skel"></div>'; }).join('') + '</div>';
    else if (this.view === 'cmd') html = this.vCmd();
    else if (this.view === 'games') html = this.vGames();
    else if (this.view === 'game') html = this.vGame(this.arg);
    else if (this.view === 'advanced') html = this.vAdvanced();
    else if (this.view === 'auto') html = this.vAuto();
    else if (this.view === 'presets') html = this.vPresets();
    else if (this.view === 'history') html = this.vHistory();
    else html = this.vSection(this.view);
    v.innerHTML = html;
    if (animate) { v.classList.remove('is-in'); void v.offsetWidth; v.classList.add('is-in'); $all('.bm-view>*', this.root).forEach(function (el, i) { el.style.setProperty('--i', Math.min(i, 12)); }); }
    this.updateStatus(); this.updateSavebar();
    this.syncRanges();
  };

  /* ------------------------------------------------------------ Views */
  Dashboard.prototype.panel = function (inner, cls, attrs) { return '<div class="bm-panel ' + (cls || '') + '" ' + (attrs || '') + '><div class="bm-in">' + inner + '</div></div>'; };
  Dashboard.prototype.empty = function (icon, title, text, extra) { return this.panel('<div class="bm-empty">' + ic(icon) + '<h4>' + esc(title) + '</h4><div>' + text + '</div>' + (extra || '') + '</div>'); };

  Dashboard.prototype.vError = function () {
    var e = this.loadError, forb = e && (e.status === 403 || e.status === 401);
    return this.empty(forb ? 'lock' : 'warn', forb ? 'ACCESS DENIED' : 'CONNECTION LOST',
      forb ? 'الخادم ما أكّد صلاحيتك الآن. تأكد أن بثك مربوط وأنك داخل بحسابك.' : esc(errMsg(e)),
      '<p style="margin-top:16px"><button type="button" class="bm-btn is-primary" data-act="retry">' + ic('reset') + 'RETRY</button></p>');
  };

  Dashboard.prototype.vCmd = function () {
    var s = this.sm, cust = this.games.filter(function (g) { return g.fields > 0; }).length;
    var last = this.lastEntry ? this.fieldLabel(this.lastEntry.tag, this.lastEntry.key) + ' · ' + ago(this.lastEntry.ts) : (s.lastChange ? 'الآن' : 'لا يوجد تعديل بعد');
    var save = { saved: 'SAVED', dirty: 'UNSAVED CHANGES', saving: 'SAVING', error: 'SAVE FAILED' }[s.saveState];
    var stats = [
      ['STREAMER', '@' + B.STREAMER, 'is-gold', 'الحساب المصرّح له'],
      ['STREAM LINK', 'LINKED', 'is-ok', 'ربط البث مؤكد من الخادم'],
      ['SYSTEM', B.resolver.active ? 'ONLINE' : 'OFFLINE', B.resolver.active ? 'is-ok' : '', B.resolver.active ? 'التخصيص مفعّل على ألعابك' : 'التخصيص غير محمّل'],
      ['CUSTOMIZABLE GAMES', '<span class="bm-num">' + cust + '</span>', '', 'من أصل ' + this.games.length + ' لعبة'],
      ['CUSTOM SETTINGS', '<span class="bm-num">' + s.totalCustomized() + '</span>', '', 'إعدادات مغيّرة عن الافتراضي'],
      ['LAST CHANGE', esc(last), '', 'آخر تعديل محفوظ'],
      ['SAVE STATE', save, s.saveState === 'saved' ? 'is-ok' : 'is-gold', s.dirtyCount() ? s.dirtyCount() + ' تعديل بانتظار الحفظ' : 'كل شيء محفوظ'],
      ['NEXT ROUND', 'REV ' + s.rev, 'is-gold', 'القيم المحفوظة تُقرأ عند بداية كل راوند']
    ];
    stats[4][2] = s.totalCustomized() ? 'is-gold' : '';
    var tiles = [
      ['games', 'GAME CONFIGURATION', 'إعدادات كل لعبة على حدة', 'games', cust + ' GAMES'], ['advanced', 'ADVANCED GAME SETTINGS', 'كل الإعدادات المتقدمة في مكان واحد', 'adv', this.totalFields() + ' SETTINGS'],
      ['round', 'ROUND CONTROL', 'مدد وعدّادات ومحاولات الجولات', 'round', this.countCats(['round']) + ' SETTINGS'], ['players', 'PLAYER EXPERIENCE', 'الإنعاش وإعادة الانضمام', 'players', this.countCats(['players']) + ' SETTINGS'],
      ['stream', 'STREAM INTERACTION', 'تفاعل جمهور البث', 'stream', this.countCats(['interaction']) ? this.countCats(['interaction']) + ' SETTINGS' : 'NOT CONNECTED YET'],
      ['balance', 'GAME BALANCING', 'النقاط والصعوبة والمضاعفات', 'balance', this.countCats(['scoring', 'balance', 'difficulty']) + ' SETTINGS'],
      ['av', 'AUDIO & VISUAL CONTROL', 'الصوت والمؤثرات البصرية', 'av', this.countTag('__site') + ' SETTINGS'], ['auto', 'AUTOMATION RULES', 'سلوكيات تلقائية قابلة للضبط', 'auto', this.autoFields().length + ' BEHAVIORS'],
      ['presets', 'PRESETS & PROFILES', 'مجموعات إعدادات محفوظة لكل لعبة', 'presets', Object.keys(s.presets).length + ' SAVED'], ['history', 'CHANGE HISTORY', 'سجل التعديلات والتراجع', 'history', 'AUDIT LOG']
    ];
    return '<section class="bm-hero"><div class="bm-panel is-gold"><div class="bm-in bm-hero-main"><div class="bm-hero-sig"><span class="bm-ring"></span><span class="bm-ring"></span>' + B.BAT_SVG + '</div>' +
      '<h1>BATMISH</h1><h2>THE DARK KNIGHT CONTROL CENTER</h2><p>YOUR STREAM. YOUR RULES.</p></div></div>' +
      '<dl class="bm-stat-grid">' + stats.map(function (x) { return '<div class="bm-panel bm-stat"><div class="bm-in"><dt>' + x[0] + '</dt><dd class="' + x[2] + '">' + x[1] + '<small>' + esc(x[3]) + '</small></dd></div></div>'; }).join('') + '</dl></section>' +
      '<div class="bm-sec"><h3>QUICK ACCESS</h3><span></span></div><div class="bm-tiles">' +
      tiles.map(function (t) { return '<button type="button" class="bm-tile bm-panel" data-nav="' + t[0] + '"><span class="bm-in"><span class="bm-tile-art"><svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[t[3]] + '</svg><em>' + t[4] + '</em></span><h4>' + t[1] + '</h4><p>' + t[2] + '</p></span></button>'; }).join('') + '</div>';
  };

  Dashboard.prototype.totalFields = function () { var n = 0, g = this.sm.games; for (var t in g) if (t.indexOf('__') !== 0) n += g[t].fields.length; return n; };
  Dashboard.prototype.countTag = function (tag) { var g = this.sm.games[tag]; return g ? g.fields.length : 0; };
  Dashboard.prototype.countCats = function (cats) { var n = 0, g = this.sm.games; for (var t in g) { if (t.indexOf('__') === 0) continue; g[t].fields.forEach(function (f) { if (cats.indexOf(f.cat) >= 0) n++; }); } return n; };
  Dashboard.prototype.autoFields = function () { var out = [], g = this.sm.games; for (var t in g) { if (t.indexOf('__') === 0) continue; g[t].fields.forEach(function (f) { if (AUTO_RE.test(f.key)) out.push({ tag: t, f: f }); }); } return out; };
  Dashboard.prototype.fieldLabel = function (tag, key) { var f = this.sm.field(tag, key), g = this.gameInfo(tag); return (g ? g.name + ' › ' : '') + (f ? f.label.replace(/\s*[—-].*$/, '') : key); };

  Dashboard.prototype.vGames = function () {
    var self = this, s = this.sm, q = this.q.trim().toLowerCase(), f = this.filter;
    var list = this.games.filter(function (g) {
      if (q && g.name.toLowerCase().indexOf(q) < 0 && g.tag.indexOf(q) < 0) return false;
      if (f === 'custom') return s.customizedCount(g.tag) > 0;
      if (f === 'can') return g.fields > 0;
      return true;
    });
    return '<div class="bm-tools"><div class="bm-search"><label class="bm-sr" for="bm-q">بحث</label><input id="bm-q" type="search" data-q placeholder="ابحث عن لعبة" value="' + esc(this.q) + '" autocomplete="off"></div>' +
      '<div class="bm-seg" role="group" aria-label="تصفية">' + [['all', 'ALL'], ['can', 'CUSTOMIZABLE'], ['custom', 'CUSTOMIZED']].map(function (x) { return '<button type="button" data-filter="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div></div>' +
      (list.length ? '<div class="bm-games">' + list.map(function (g) { return self.gameCard(g); }).join('') + '</div>' : this.empty('games', 'NO MATCH', 'ما فيه ألعاب تطابق بحثك.'));
  };
  Dashboard.prototype.gameCard = function (g) {
    var s = this.sm, n = s.customizedCount(g.tag), can = g.fields > 0, dirty = s.dirtyCount(g.tag);
    var badge = !can ? '<span class="bm-badge">NOT CUSTOMIZABLE YET</span>' : n ? '<span class="bm-badge is-gold">CUSTOMIZED ' + n + '</span>' : '<span class="bm-badge">DEFAULT</span>';
    return '<article class="bm-panel bm-gcard' + (can ? '' : ' is-off') + '"><div class="bm-in"><div class="bm-gcard-top"><div class="bm-gicon">' + (g.icon || ic('games')) + '</div><div><h4>' + esc(g.name) + '</h4></div></div>' +
      '<p>' + esc(g.desc) + '</p><div class="bm-badges">' + badge + (can ? '<span class="bm-badge">' + g.fields + ' SETTINGS</span>' : '') + (dirty ? '<span class="bm-badge is-gold">UNSAVED ' + dirty + '</span>' : '') + '</div>' +
      '<div class="bm-gcard-act">' + (can ? '<button type="button" class="bm-btn is-primary is-sm" data-game="' + esc(g.tag) + '">' + ic('adv') + 'SETTINGS</button><button type="button" class="bm-btn is-ghost is-sm" data-resetgame="' + esc(g.tag) + '"' + (n ? '' : ' disabled') + '>' + ic('reset') + 'RESET</button>'
        : '<span class="bm-tag-off" style="font-size:12px;color:var(--bm-mute);line-height:1.7">لا توجد إعدادات موصولة بمنطق هذي اللعبة بعد.</span>') + '</div></div></article>';
  };

  Dashboard.prototype.vGame = function (tag) {
    var s = this.sm, g = s.games[tag], gi = this.gameInfo(tag);
    if (!g) return this.empty('warn', 'GAME NOT FOUND', 'هذي اللعبة ما فيها إعدادات قابلة للتخصيص.');
    var self = this, tabs = ['GENERAL', 'GAMEPLAY', 'PLAYERS', 'DIFFICULTY', 'SCORING', 'ADVANCED'].filter(function (t) { return g.fields.some(function (f) { return f.tab === t; }); });
    if (tabs.indexOf(this.tab) < 0) this.tab = tabs[0];
    var fields = g.fields.filter(function (f) { return f.tab === self.tab; });
    return '<button type="button" class="bm-btn is-ghost is-sm bm-back" data-nav="games">' + ic('back') + 'ALL GAMES</button>' +
      '<div class="bm-gh"><div class="bm-gicon">' + ((gi && gi.icon) || ic('games')) + '</div><div><h2>' + esc(g.name === gi.name ? gi.name : (gi.name || g.name)) + '</h2><p>' + esc((gi && gi.desc) || g.desc) + '</p></div></div>' +
      '<div class="bm-tabs" role="tablist">' + tabs.map(function (t) { var n = g.fields.filter(function (f) { return f.tab === t; }).length, d = g.fields.filter(function (f) { return f.tab === t && s.isDirty(tag, f.key); }).length;
        return '<button type="button" role="tab" data-tab="' + t + '" aria-selected="' + (t === self.tab) + '">' + TAB_AR[t] + '<sup>' + n + (d ? ' · ' + d + '*' : '') + '</sup></button>'; }).join('') + '</div>' +
      '<div class="bm-note">كل إعداد هنا موصول بمنطق اللعبة الفعلي. الإعدادات تُقرأ <b>عند بداية كل راوند</b>، فأي حفظ يُطبَّق من الراوند التالي ولا يغيّر راوند جاري.</div>' +
      '<div class="bm-fields">' + fields.map(function (f) { return self.fieldHtml(tag, f); }).join('') + '</div>';
  };

  Dashboard.prototype.vSection = function (view) {
    var info = SECTION_INFO[view], s = this.sm, self = this; if (!info) return '';
    var rows = [];
    if (info.tag) { var g = s.games[info.tag]; if (g) rows = [{ tag: info.tag, fields: g.fields }]; }
    else { for (var t in s.games) { if (t.indexOf('__') === 0) continue; var fl = s.games[t].fields.filter(function (f) { return info.cats.indexOf(f.cat) >= 0; }); if (fl.length) rows.push({ tag: t, fields: fl }); } }
    var intro = '<div class="bm-note"><b>' + info.title + '</b> — ' + esc(info.ar) + '. ' + (info.tag ? 'يطبّق على ألعاب الصفحة الرئيسية التي تستخدم WebAudio (لا يشمل ألعاب الـ3D داخل نافذة مستقلة).' : 'تعديل أي إعداد هنا هو نفس تعديله من صفحة اللعبة، ويُطبَّق من الراوند التالي.') + '</div>';
    if (!rows.length) return intro + this.empty(view === 'stream' ? 'stream' : 'warn', 'NOT CONNECTED YET',
      view === 'stream' ? 'ما فيه إعدادات تفاعل موصولة فعلياً بمنطق الألعاب حالياً، فما نعرضها كأنها تشتغل. إذا حبّيت إعدادات محددة (مثل رسائل بداية الجولة)، أضيفها بدعم برمجي حقيقي داخل كل لعبة أول.' : 'ما فيه إعدادات في هذا القسم.');
    return intro + rows.map(function (r) {
      var gi = self.gameInfo(r.tag);
      return '<div class="bm-group"><h4>' + esc(r.tag === '__site' ? s.games.__site.name : (gi ? gi.name : r.tag)) + '</h4><span>' + r.fields.length + ' SETTINGS</span>' +
        (r.tag === '__site' ? '' : '<button type="button" class="bm-btn is-ghost is-sm" data-game="' + esc(r.tag) + '">' + ic('adv') + 'OPEN</button>') + '</div>' +
        '<div class="bm-fields">' + r.fields.map(function (f) { return self.fieldHtml(r.tag, f); }).join('') + '</div>';
    }).join('');
  };

  Dashboard.prototype.vAdvanced = function () {
    var s = this.sm, self = this, q = this.q.trim().toLowerCase(), out = '';
    var tags = Object.keys(s.games).filter(function (t) { return t.indexOf('__') !== 0; });
    out += '<div class="bm-tools"><div class="bm-search"><label class="bm-sr" for="bm-q">بحث</label><input id="bm-q" type="search" data-q placeholder="ابحث في كل الإعدادات" value="' + esc(this.q) + '" autocomplete="off"></div></div>';
    var any = false;
    tags.forEach(function (t) {
      var gi = self.gameInfo(t), fl = s.games[t].fields.filter(function (f) { return !q || f.label.toLowerCase().indexOf(q) >= 0 || (gi && gi.name.toLowerCase().indexOf(q) >= 0) || f.key.toLowerCase().indexOf(q) >= 0; });
      if (!fl.length) return; any = true;
      out += '<div class="bm-group"><h4>' + esc(gi ? gi.name : t) + '</h4><span>' + fl.length + ' SETTINGS</span></div><div class="bm-fields">' + fl.map(function (f) { return self.fieldHtml(t, f); }).join('') + '</div>';
    });
    return any ? out : out + this.empty('adv', 'NO MATCH', 'ما فيه إعدادات تطابق بحثك.');
  };

  Dashboard.prototype.vAuto = function () {
    var self = this, s = this.sm, list = this.autoFields(), byGame = {};
    list.forEach(function (x) { (byGame[x.tag] = byGame[x.tag] || []).push(x.f); });
    var intro = '<div class="bm-note"><b>AUTOMATIC BEHAVIORS</b> — هذي السلوكيات التلقائية اللي تنفّذها الألعاب فعلاً (انتهاء الوقت، تمرير الدور، الإنعاش عبر الهدايا، تسريع الخلط…) وتقدر تضبط توقيتها وتفعيلها. ' +
      'بناء قواعد مخصصة جديدة (إذا حصل X سوّي Y) غير متاح حالياً: ما فيه نقاط ربط آمنة داخل الألعاب تسمح بذلك بدون المساس بمنطق الفوز والإقصاء، فما نعرضه كأنه يشتغل.</div>';
    return intro + Object.keys(byGame).map(function (t) {
      var gi = self.gameInfo(t);
      return '<div class="bm-group"><h4>' + esc(gi ? gi.name : t) + '</h4><span>' + byGame[t].length + ' BEHAVIORS</span></div><div class="bm-fields">' + byGame[t].map(function (f) { return self.fieldHtml(t, f); }).join('') + '</div>';
    }).join('');
  };

  Dashboard.prototype.vPresets = function () {
    var self = this, s = this.sm, tags = Object.keys(s.games).filter(function (t) { return t.indexOf('__') !== 0; });
    if (!this.presetTag || tags.indexOf(this.presetTag) < 0) this.presetTag = tags[0];
    var tag = this.presetTag, list = this.presets.forGame(tag), def = s.defaultPresets[tag];
    var sel = '<select class="bm-input" data-presettag aria-label="اللعبة">' + tags.map(function (t) { var gi = self.gameInfo(t); return '<option value="' + t + '"' + (t === tag ? ' selected' : '') + '>' + esc(gi ? gi.name : t) + '</option>'; }).join('') + '</select>';
    var intro = '<div class="bm-note">المجموعة تحفظ تخصيصك للعبة <b>واحدة</b> فقط، وتطبيقها لا يمس إعدادات أي لعبة ثانية. أمثلة أسماء: CLASSIC NIGHT · DARK CHALLENGE · FAST ROUND · COMPETITIVE MODE · COMMUNITY NIGHT.</div>';
    var form = '<div class="bm-form" style="margin:0 0 18px">' + sel + '<input class="bm-input is-grow" id="bm-pname" maxlength="40" placeholder="اسم المجموعة الجديدة (من إعدادات اللعبة الحالية)" aria-label="اسم المجموعة"><button type="button" class="bm-btn is-primary" data-act="newpreset">' + ic('presets') + 'CREATE PRESET</button></div>';
    var rows = list.length ? '<div class="bm-list">' + list.map(function (p) {
      var n = Object.keys(p.values).length;
      return '<div class="bm-panel bm-row"><div class="bm-in"><div class="bm-row-main"><b>' + esc(p.name) + (def === p.id ? ' <span class="bm-badge is-gold">DEFAULT</span>' : '') + '</b><small>' + n + ' إعداد مخصص · ' + ago(p.updatedAt) + '</small></div><div class="bm-row-act">' +
        '<button type="button" class="bm-btn is-primary is-sm" data-presetact="apply" data-id="' + p.id + '">' + ic('play') + 'APPLY</button>' +
        '<button type="button" class="bm-btn is-ghost is-sm" data-presetact="overwrite" data-id="' + p.id + '">' + ic('save') + 'UPDATE</button>' +
        '<button type="button" class="bm-btn is-ghost is-sm" data-presetact="rename" data-id="' + p.id + '">' + ic('edit') + 'RENAME</button>' +
        '<button type="button" class="bm-btn is-ghost is-sm" data-presetact="duplicate" data-id="' + p.id + '">' + ic('copy') + 'COPY</button>' +
        '<button type="button" class="bm-btn is-ghost is-sm" data-presetact="default" data-id="' + p.id + '"' + (def === p.id ? ' disabled' : '') + '>' + ic('star') + 'DEFAULT</button>' +
        '<button type="button" class="bm-btn is-ghost is-danger is-sm" data-presetact="delete" data-id="' + p.id + '">' + ic('trash') + 'DELETE</button></div></div></div>';
    }).join('') + '</div>' : this.empty('presets', 'NO PRESETS', 'ما أنشأت مجموعات للعبة هذي بعد. عدّل إعداداتها ثم احفظها كمجموعة.');
    return intro + form + rows;
  };

  Dashboard.prototype.vHistory = function () {
    var self = this, s = this.sm, tags = Object.keys(s.games);
    var items = this.hist.items.filter(function (e) { return !self.histTag || e.tag === self.histTag; });
    var sel = '<select class="bm-input" data-histtag aria-label="تصفية حسب اللعبة"><option value="">كل الألعاب</option>' + tags.map(function (t) { var gi = self.gameInfo(t); return '<option value="' + t + '"' + (t === self.histTag ? ' selected' : '') + '>' + esc(gi ? gi.name : t) + '</option>'; }).join('') + '</select>';
    var bar = '<div class="bm-form" style="margin-bottom:18px">' + sel + '<button type="button" class="bm-btn is-ghost" data-act="histrefresh">' + ic('reset') + 'REFRESH</button>' +
      (this.histTag && s.customizedCount(this.histTag) ? '<button type="button" class="bm-btn is-ghost is-danger" data-act="restoregame">' + ic('reset') + 'RESTORE GAME DEFAULTS</button>' : '') + '</div>';
    var note = '<div class="bm-note">التراجع يرجّع <b>إعداداً</b> لقيمته القديمة للراوندات القادمة فقط. ما يلمس جولات انتهت ولا نتائجها لأن الإعداد يُقرأ عند بداية كل راوند.</div>';
    var statusAr = { saved: 'SAVED', reset: 'RESET', reverted: 'REVERTED' };
    var rows = items.length ? '<div class="bm-list">' + items.map(function (e) {
      var f = s.field(e.tag, e.key), gi = self.gameInfo(e.tag);
      return '<div class="bm-panel bm-row"><div class="bm-in"><div class="bm-row-main"><b>' + esc(gi ? gi.name : e.tag) + ' › ' + esc(f ? f.label.replace(/\s*[—-].*$/, '') : e.key) + '</b>' +
        '<small>' + ago(e.ts) + (e.preset ? ' · مجموعة: ' + esc(e.preset) : '') + ' · <span class="bm-en" style="letter-spacing:.1em">' + (statusAr[e.status] || e.status) + (e.reverted ? ' · REVERTED LATER' : '') + '</span> · تُطبَّق من الراوند التالي</small></div>' +
        '<div class="bm-diff"><s>' + esc(fmtVal(f, e.old)) + '</s><span>→</span><i>' + esc(fmtVal(f, e.new)) + '</i></div>' +
        '<div class="bm-row-act"><button type="button" class="bm-btn is-ghost is-sm" data-revert="' + e.id + '"' + (e.reverted || !f ? ' disabled' : '') + '>' + ic('reset') + 'REVERT</button></div></div></div>';
    }).join('') + '</div>' : this.empty('history', 'NO CHANGES YET', 'لسا ما عدّلت أي إعداد. كل تعديل تحفظه يظهر هنا.');
    return note + bar + rows;
  };

  /* ------------------------------------------------------------ حقل إعداد */
  Dashboard.prototype.fieldHtml = function (tag, f) {
    var s = this.sm, v = s.value(tag, f.key), mod = s.isModified(tag, f.key), dirty = s.isDirty(tag, f.key), id = 'bmf-' + tag + '-' + f.key, fk = tag + '.' + f.key;
    var bad = this.errs[fk];
    var ctrl = '';
    if (f.type === 'toggle') {
      ctrl = '<label class="bm-switch"><input type="checkbox" id="' + id + '" data-k="' + fk + '"' + (v ? ' checked' : '') + '><span class="bm-switch-track"></span><span class="bm-switch-txt" data-onoff>' + (v ? 'ON' : 'OFF') + '</span></label>';
    } else if (f.type === 'number') {
      var step = Math.max(1, Math.round((f.max - f.min) / 160));
      ctrl = '<div class="bm-ctrl-row"><input class="bm-range" type="range" tabindex="-1" aria-hidden="true" min="' + f.min + '" max="' + f.max + '" step="' + step + '" value="' + esc(v) + '" data-k="' + fk + '" data-r="1">' +
        '<input class="bm-numin" type="number" inputmode="numeric" id="' + id + '" min="' + f.min + '" max="' + f.max + '" step="1" value="' + esc(v) + '" data-k="' + fk + '" data-n="1" aria-label="' + esc(f.label) + '">' + (f.unit ? '<span class="bm-unit">' + esc(f.unit) + '</span>' : '') + '</div>';
    } else if (f.type === 'numberArray') {
      ctrl = '<div class="bm-ctrl-row is-arr">' + v.map(function (x, i) { return '<input class="bm-numin is-s" type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" value="' + esc(x) + '" data-k="' + fk + '" data-i="' + i + '" aria-label="' + esc(f.label) + ' ' + (i + 1) + '">'; }).join('') + '</div>';
    }
    return '<div class="bm-panel bm-field' + (mod || dirty ? ' is-mod' : '') + (bad ? ' is-bad' : '') + '" data-fk="' + fk + '"><div class="bm-in"><div><div class="bm-field-label"><label for="' + id + '">' + esc(f.label) + '</label></div><div class="bm-field-hint">' + esc(f.hint || '') + '</div>' +
      '<div class="bm-field-meta"><span class="bm-badge">DEFAULT ' + esc(fmtVal(f, f.default)) + '</span>' + (dirty ? '<span class="bm-badge is-gold">UNSAVED</span>' : mod ? '<span class="bm-badge is-gold">CUSTOM</span>' : '') +
      '<button type="button" class="bm-btn is-ghost is-sm" data-resetkey="' + fk + '"' + (mod || dirty ? '' : ' disabled') + '>' + ic('reset') + 'DEFAULT</button></div></div>' +
      '<div class="bm-ctrl">' + ctrl + '<div class="bm-err" role="alert" data-err>' + esc(bad || '') + '</div></div></div></div>';
  };

  Dashboard.prototype.refreshField = function (fk) {
    var i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), s = this.sm, f = s.field(tag, key); if (!f) return;
    var mod = s.isModified(tag, key), dirty = s.isDirty(tag, key), bad = this.errs[fk];
    $all('.bm-field[data-fk="' + fk + '"]', this.root).forEach(function (row) {
      row.classList.toggle('is-mod', mod || dirty); row.classList.toggle('is-bad', !!bad);
      var er = $('[data-err]', row); if (er) er.textContent = bad || '';
      var meta = $('.bm-field-meta', row);
      if (meta) {
        var old = $all('.bm-badge.is-gold', meta); old.forEach(function (b) { b.remove(); });
        var btn = $('[data-resetkey]', meta);
        if (dirty || mod) { var b = document.createElement('span'); b.className = 'bm-badge is-gold'; b.textContent = dirty ? 'UNSAVED' : 'CUSTOM'; meta.insertBefore(b, btn); }
        if (btn) btn.disabled = !(mod || dirty);
      }
    });
    $all('.bm-tabs [data-tab]', this.root).forEach(function () { /* عدّادات التبويبات تتحدّث عند التبديل */ });
  };

  Dashboard.prototype.syncRanges = function () {
    $all('.bm-range', this.root).forEach(function (r) { var min = +r.min, max = +r.max; r.style.setProperty('--p', (max > min ? ((+r.value - min) / (max - min)) * 100 : 0) + '%'); });
  };

  /* ------------------------------------------------------------ أحداث */
  Dashboard.prototype.onInput = function (e) {
    var t = e.target; if (t.matches('[data-q]')) { this.q = t.value; this.rerenderKeepFocus('[data-q]'); return; }
    var fk = t.getAttribute && t.getAttribute('data-k'); if (!fk) return;
    var i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), s = this.sm, f = s.field(tag, key); if (!f) return;
    var v;
    if (f.type === 'toggle') { v = !!t.checked; var tx = $('[data-onoff]', t.closest('.bm-switch')); if (tx) tx.textContent = v ? 'ON' : 'OFF'; }
    else if (f.type === 'number') {
      v = t.value === '' ? NaN : Number(t.value);
      // مزامنة المنزلق ↔ الرقم
      var row = t.closest('.bm-field'), other = t.matches('[data-r]') ? $('[data-n]', row) : $('[data-r]', row);
      if (other && isFinite(v)) other.value = v;
      this.syncRanges();
    } else {
      var inputs = $all('[data-k="' + fk + '"]', t.closest('.bm-field')); v = inputs.map(function (x) { return x.value === '' ? NaN : Number(x.value); });
    }
    var r = ValidationService.check(f, v);
    if (!r.ok) { this.errs[fk] = r.msg; this.refreshField(fk); this.updateSavebar(); return; }
    delete this.errs[fk];
    s.setDraft(tag, key, r.v);
    this.refreshField(fk); this.updateSavebar(); this.updateStatus();
  };
  Dashboard.prototype.onChange = function (e) {
    var t = e.target;
    if (t.matches('[data-act="autosave"]')) { this.sm.setAutosave(t.checked); return; }
    if (t.matches('[data-presettag]')) { this.presetTag = t.value; this.render(); return; }
    if (t.matches('[data-histtag]')) { var self = this; this.histTag = t.value; this.hist.load(this.histTag).then(function () { self.render(); }, function (er) { self.toast(errMsg(er), 'err'); }); return; }
  };
  Dashboard.prototype.rerenderKeepFocus = function (sel) {
    var pos = null, a = document.activeElement; if (a && a.matches && a.matches(sel)) pos = a.selectionStart;
    this.render(); var n = $(sel, this.root); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} }
  };

  Dashboard.prototype.onClick = function (e) {
    var self = this, t = e.target, el;
    if ((el = t.closest('[data-nav]'))) { this.go(el.getAttribute('data-nav')); return; }
    if ((el = t.closest('[data-game]'))) { this.go('game', el.getAttribute('data-game')); return; }
    if ((el = t.closest('[data-tab]'))) { this.tab = el.getAttribute('data-tab'); this.render(); return; }
    if ((el = t.closest('[data-filter]'))) { this.filter = el.getAttribute('data-filter'); this.render(); return; }
    if ((el = t.closest('[data-resetkey]'))) { var fk = el.getAttribute('data-resetkey'), i = fk.indexOf('.'); delete this.errs[fk]; this.run(this.sm.resetKey(fk.slice(0, i), fk.slice(i + 1)), 'تمت إعادة الإعداد للافتراضي.').then(function () { self.render(); }); return; }
    if ((el = t.closest('[data-resetgame]'))) { var tag = el.getAttribute('data-resetgame'); this.confirm({ title: 'RESET GAME', text: 'ترجيع كل إعدادات «' + (this.gameInfo(tag) || {}).name + '» للافتراضي؟ تقدر تتراجع عن أي إعداد من سجل التعديلات.', ok: 'RESET', danger: true }).then(function (y) { if (y) self.run(self.sm.resetGame(tag), 'رجعت إعدادات اللعبة للافتراضي.').then(function () { self.render(); }); }); return; }
    if ((el = t.closest('[data-presetact]'))) { this.presetAction(el.getAttribute('data-presetact'), el.getAttribute('data-id')); return; }
    if ((el = t.closest('[data-revert]'))) { this.run(this.hist.revert(el.getAttribute('data-revert')), 'تم التراجع عن التعديل.').then(function () { return self.hist.load(self.histTag); }).then(function () { self.render(); }); return; }
    if ((el = t.closest('[data-act]'))) { this.act(el.getAttribute('data-act')); }
  };

  Dashboard.prototype.act = function (a) {
    var self = this, s = this.sm;
    if (a === 'close') return this.requestClose();
    if (a === 'menu') { this.root.classList.toggle('is-nav'); return; }
    if (a === 'retry') return this.loadAll();
    if (a === 'discard') { s.discard(this.view === 'game' ? this.arg : null); this.errs = {}; this.render(); return; }
    if (a === 'save') { s.saveAll().then(function () { self.render(); }); return; }
    if (a === 'savepreset') { this.prompt({ title: 'SAVE AS PRESET', label: 'اسم المجموعة', value: '' }).then(function (name) {
      if (name == null) return; var tag = self.arg;
      self.run(self.presets.create(tag, name, s.effectiveOverrides(tag)), 'تم حفظ المجموعة «' + name + '». (التعديلات غير المحفوظة ضُمّنت فيها لكنها لم تُطبَّق بعد.)'); }); return; }
    if (a === 'newpreset') { var nm = $('#bm-pname', this.root).value.trim(); if (!nm) { this.toast('اكتب اسماً للمجموعة.', 'err'); return; }
      this.run(this.presets.create(this.presetTag, nm, s.config[this.presetTag] ? clone(s.config[this.presetTag]) : {}), 'تم إنشاء المجموعة.').then(function () { self.render(); }); return; }
    if (a === 'histrefresh') { this.hist.load(this.histTag).then(function () { self.render(); }, function (er) { self.toast(errMsg(er), 'err'); }); return; }
    if (a === 'restoregame') { var tag = this.histTag; this.confirm({ title: 'RESTORE GAME', text: 'استرجاع إعدادات هذي اللعبة كاملة للافتراضي؟ ما يأثر على جولات انتهت.', ok: 'RESTORE', danger: true }).then(function (y) { if (y) self.run(self.hist.restoreGame(tag), 'تم استرجاع إعدادات اللعبة.').then(function () { return self.hist.load(self.histTag); }).then(function () { self.render(); }); }); }
  };

  Dashboard.prototype.presetAction = function (op, id) {
    var self = this, s = this.sm, p = s.presets[id]; if (!p) return;
    if (op === 'apply') { this.confirm({ title: 'APPLY PRESET', text: 'تطبيق «' + p.name + '» يغيّر إعدادات هذي اللعبة فقط، ويسري من الراوند التالي.', ok: 'APPLY' }).then(function (y) { if (y) self.run(self.presets.apply(id), 'تم تطبيق المجموعة.').then(function () { self.render(); }); }); return; }
    if (op === 'overwrite') { this.confirm({ title: 'UPDATE PRESET', text: 'استبدال محتوى «' + p.name + '» بإعدادات اللعبة الحالية المحفوظة؟', ok: 'UPDATE' }).then(function (y) { if (y) self.run(self.presets.overwrite(id, s.config[p.tag] ? clone(s.config[p.tag]) : {}), 'تم تحديث المجموعة.').then(function () { self.render(); }); }); return; }
    if (op === 'rename') { this.prompt({ title: 'RENAME PRESET', label: 'الاسم الجديد', value: p.name }).then(function (n) { if (n != null) self.run(self.presets.rename(id, n), 'تمت التسمية.').then(function () { self.render(); }); }); return; }
    if (op === 'duplicate') { this.run(this.presets.duplicate(id), 'تم نسخ المجموعة.').then(function () { self.render(); }); return; }
    if (op === 'default') { this.run(this.presets.setDefault(id), 'صارت المجموعة الافتراضية للعبة.').then(function () { self.render(); }); return; }
    if (op === 'delete') { this.confirm({ title: 'DELETE PRESET', text: 'حذف «' + p.name + '» نهائياً؟', ok: 'DELETE', danger: true }).then(function (y) { if (y) self.run(self.presets.remove(id), 'تم الحذف.').then(function () { self.render(); }); }); }
  };

  // ينفّذ وعداً مع رسالة نجاح/فشل موحّدة
  Dashboard.prototype.run = function (p, okMsg) {
    var self = this;
    return p.then(function (r) { if (okMsg) self.toast(okMsg, 'ok'); self.updateStatus(); return r; }, function (e) {
      if (e && e.code === 'conflict') { return self.sm.refresh().then(function () { self.toast(errMsg(e) + '. حدّثناها، أعد المحاولة.', 'err'); }); }
      if (e && (e.status === 403 || e.status === 401)) { self.toast(errMsg({ code: 'forbidden' }), 'err'); return; }
      self.toast(errMsg(e), 'err');
    });
  };

  /* ------------------------------------------------------------ نوافذ حوار + تنبيهات */
  Dashboard.prototype.modal = function (html) {
    var m = document.createElement('div'); m.className = 'bm-modal'; m.innerHTML = '<div class="bm-panel is-gold"><div class="bm-in">' + html + '</div></div>';
    $('.bm-main', this.root).appendChild(m); return m;
  };
  Dashboard.prototype.confirm = function (o) {
    var self = this;
    return new Promise(function (res) {
      var m = self.modal('<h4>' + esc(o.title) + '</h4><p>' + esc(o.text) + '</p><div class="bm-modal-act"><button type="button" class="bm-btn ' + (o.danger ? 'is-danger' : 'is-primary') + '" data-ok>' + esc(o.ok || 'OK') + '</button><button type="button" class="bm-btn is-ghost" data-no>CANCEL</button></div>');
      var done = function (v) { m.remove(); res(v); };
      $('[data-ok]', m).addEventListener('click', function () { done(true); }); $('[data-no]', m).addEventListener('click', function () { done(false); });
      m.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
      $('[data-no]', m).focus();
    });
  };
  Dashboard.prototype.prompt = function (o) {
    var self = this;
    return new Promise(function (res) {
      var m = self.modal('<h4>' + esc(o.title) + '</h4><p><label for="bm-pin">' + esc(o.label) + '</label></p><input id="bm-pin" class="bm-input" maxlength="40" value="' + esc(o.value || '') + '"><div class="bm-modal-act" style="margin-top:16px"><button type="button" class="bm-btn is-primary" data-ok>SAVE</button><button type="button" class="bm-btn is-ghost" data-no>CANCEL</button></div>');
      var inp = $('#bm-pin', m), done = function (v) { m.remove(); res(v); };
      $('[data-ok]', m).addEventListener('click', function () { var v = inp.value.trim(); if (v) done(v); else inp.focus(); });
      $('[data-no]', m).addEventListener('click', function () { done(null); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('[data-ok]', m).click(); } if (e.key === 'Escape') { e.stopPropagation(); done(null); } });
      inp.focus(); inp.select();
    });
  };
  Dashboard.prototype.toast = function (text, kind) {
    var host = $('#bm-toasts', this.root); if (!host) return;
    var t = document.createElement('div'); t.className = 'bm-toast' + (kind === 'err' ? ' is-err' : kind === 'ok' ? ' is-ok' : ''); t.textContent = text; host.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 450); }, kind === 'err' ? 6500 : 3200);
    while (host.children.length > 3) host.removeChild(host.firstChild);
  };

  /* ------------------------------------------------------------ إغلاق */
  Dashboard.prototype.requestClose = function () {
    var self = this, s = this.sm;
    if (s.dirtyCount()) {
      this.confirm({ title: 'UNSAVED CHANGES', text: 'عندك ' + s.dirtyCount() + ' تعديل غير محفوظ. تحفظها الحين، أو تتركها كمسودة على جهازك للمرة الجاية؟', ok: 'SAVE & CLOSE' }).then(function (y) {
        if (y) s.saveAll().then(function (ok) { if (ok) self.close(); }); else self.close();
      });
    } else this.close();
  };
  Dashboard.prototype.close = function (opt) {
    if (!this.root) return;
    var r = this.root; r.classList.remove('is-open'); r.setAttribute('aria-hidden', 'true'); r.setAttribute('inert', '');
    document.documentElement.style.overflow = '';
    document.removeEventListener('focusin', this._trap);
    var self = this; setTimeout(function () { if (r.parentNode && !r.classList.contains('is-open')) r.parentNode.removeChild(r); }, 600);
    this.root = null; this.sm.listeners = [];
    if (opt && opt.silent) { try { if (typeof toast === 'function') toast('أُغلقت لوحة BATMISH: تأكد من ربط البث. تعديلاتك غير المحفوظة محفوظة كمسودة.'); } catch (e) {} }
    else if (this.lastFocus && this.lastFocus.focus) { try { this.lastFocus.focus(); } catch (e) {} }
  };

  var dash = new Dashboard();
  B.ui = { open: function (ctl) { dash.open(ctl); }, close: function (o) { dash.close(o); }, _dash: dash, _classes: { ValidationService: ValidationService, ConfigurationService: ConfigurationService, SettingsManager: SettingsManager, PresetManager: PresetManager, HistoryManager: HistoryManager, GameRegistry: GameRegistry, Dashboard: Dashboard } };
})();
