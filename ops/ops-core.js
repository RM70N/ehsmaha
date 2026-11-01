/* EHSEMHA OPS CORE — طبقة الأحداث والمراقبة المشتركة (تُحمَّل في الموقع الرئيسي).
 *
 * وظيفتها: تسجيل أحداث التشغيل الحقيقية (بدء/نهاية راوند، اتصال البث، جلسات الستريمر، رحلة اللاعب)
 * في Realtime Database (حصة منفصلة عن Firestore)، بصيغة موحّدة تغذّي أقسام لوحة المالك:
 * غرفة العمليات، مراقب البثوث، صحة الأنظمة، رحلة اللاعب، صانع البطولات، إعدادات الألعاب.
 *
 * لا تغيّر منطق أي لعبة: كل الربط عبر تغليف دوال موجودة (homeRegisterGameListener/Unregister،
 * homeConnSetState، recordWin، ownerRegisterActiveStreamer) أو مستمعات أحداث عامة، وكل شيء داخل try/catch
 * حتى لا يؤثر فشل التسجيل على اللعب أبداً. يمكن تعطيلها كلياً بـ localStorage['ehs_ops_off']='1'.
 */
(function () {
  'use strict';
  if (window.EhsOps) return;
  var O = (window.EhsOps = { version: 1 });
  var LAB = /[?&]opslab=1/.test(location.search);
  O.lab = LAB;
  var OFF = false;
  try { OFF = localStorage.getItem('ehs_ops_off') === '1'; } catch (e) {}

  /* ---------- مخزن البيانات: RTDB فعلي، أو مخزن ذاكرة للاختبارات ---------- */
  var mem = null; // يُفعَّل في الاختبارات فقط: EhsOps._useMemoryStore()
  function fb() { return window.__fb; }
  function rtdbReady() { var f = fb(); return !!(f && f.rtdb); }
  var SV = { '.sv': 'timestamp' };

  function memStore() {
    var root = {}; var subs = []; var seq = 0;
    function parts(p) { return String(p).split('/').filter(Boolean); }
    function getAt(p) { var n = root; var a = parts(p); for (var i = 0; i < a.length; i++) { if (n == null || typeof n !== 'object') return null; n = n[a[i]]; } return n === undefined ? null : n; }
    function resolveSV(v) {
      if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return Date.now(); var o = Array.isArray(v) ? [] : {}; Object.keys(v).forEach(function (k) { o[k] = resolveSV(v[k]); }); return o; }
      return v;
    }
    function setAt(p, val) {
      var a = parts(p); if (!a.length) { root = val || {}; return; }
      var n = root; for (var i = 0; i < a.length - 1; i++) { if (n[a[i]] == null || typeof n[a[i]] !== 'object') n[a[i]] = {}; n = n[a[i]]; }
      if (val === null || val === undefined) delete n[a[a.length - 1]]; else n[a[a.length - 1]] = resolveSV(val);
    }
    function notify(p) { subs.slice().forEach(function (s) { if (p.indexOf(s.path) === 0 || s.path.indexOf(p) === 0) { try { s.cb(clone(getAt(s.path))); } catch (e) {} } }); }
    function filt(v, o) {
      if (!o || !v || typeof v !== 'object') return v; var keys = Object.keys(v);
      if (o.orderBy) { if (o.startAt != null) keys = keys.filter(function (k) { return v[k] && v[k][o.orderBy] >= o.startAt; }); keys.sort(function (a, b) { return (v[a][o.orderBy] || 0) - (v[b][o.orderBy] || 0); }); }
      if (o.limitLast) keys = keys.slice(-o.limitLast);
      var out = {}; keys.forEach(function (k) { out[k] = v[k]; }); return out;
    }
    function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    return {
      kind: 'memory',
      _root: function () { return root; },
      set: function (p, v) { setAt(p, v); notify(p); return Promise.resolve(); },
      update: function (p, obj) { Object.keys(obj).forEach(function (k) { setAt(p + '/' + k, obj[k]); }); notify(p); return Promise.resolve(); },
      push: function (p, v) { var k = 'm' + Date.now().toString(36) + (++seq).toString(36).padStart(4, '0'); setAt(p + '/' + k, v); notify(p); return Promise.resolve(k); },
      remove: function (p) { setAt(p, null); notify(p); return Promise.resolve(); },
      get: function (p) { return Promise.resolve(clone(getAt(p))); },
      txn: function (p, fn) { var cur = clone(getAt(p)); var out = fn(cur); if (out === undefined) return Promise.resolve({ committed: false, value: cur }); setAt(p, out); notify(p); return Promise.resolve({ committed: true, value: clone(getAt(p)) }); },
      on: function (p, cb, opts) {
        var s = { path: p, cb: function (v) { cb(filt(v, opts)); } }; subs.push(s);
        setTimeout(function () { try { s.cb(clone(getAt(p))); } catch (e) {} }, 0);
        return function () { subs = subs.filter(function (x) { return x !== s; }); };
      },
      connected: function (cb) { setTimeout(function () { cb(true); }, 0); return function () {}; },
      onDisconnect: function () { return { set: function () {}, update: function () {}, remove: function () {} }; }
    };
  }

  function rtdbStore() {
    var f = fb();
    var R = function (p) { return f.rtdbRef(f.rtdb, p); };
    return {
      kind: 'rtdb',
      set: function (p, v) { return f.rtdbSet(R(p), v); },
      update: function (p, o) { return f.rtdbUpdate(R(p), o); },
      push: function (p, v) { var r = f.rtdbPush(R(p)); return f.rtdbSet(r, v).then(function () { return r.key; }); },
      remove: function (p) { return f.rtdbRemove(R(p)); },
      get: function (p) { return f.rtdbGet(R(p)).then(function (s) { return s.val(); }); },
      // ملاحظة RTDB: أول استدعاء للمعالج يأتي بـnull (لا كاش محلي) ثم يُعاد بالقيمة الفعلية. الإلغاء (undefined) في الاستدعاء الأول
      // يُنهي المعاملة بلا إعادة، فنُرجع null بدلاً منه ليعيد SDK المحاولة بالقيمة الفعلية؛ وإن لم توجد بيانات فالنتيجة «غير ملتزمة».
      txn: function (p, fn) {
        return f.rtdbRunTransaction(R(p), function (cur) { var o = fn(cur); if (o === undefined) return cur === null || cur === undefined ? null : undefined; return o; })
          .then(function (r) { var v = r.snapshot.val(); return { committed: !!r.committed && v !== null, value: v }; });
      },
      on: function (p, cb, opts) {
        var ref = R(p);
        if (opts && f.rtdbQuery) {
          var qs = [];
          if (opts.orderBy && f.rtdbOrderByChild) qs.push(f.rtdbOrderByChild(opts.orderBy));
          if (opts.startAt != null && f.rtdbStartAt) qs.push(f.rtdbStartAt(opts.startAt));
          if (opts.limitLast && f.rtdbLimitToLast) qs.push(f.rtdbLimitToLast(opts.limitLast));
          if (qs.length) ref = f.rtdbQuery.apply(null, [ref].concat(qs));
        }
        var h = f.rtdbOnValue(ref, function (s) { cb(s.val()); }, function (e) { if (opts && opts.onError) opts.onError(e); });
        return typeof h === 'function' ? h : function () { try { f.rtdbOff(ref, 'value'); } catch (e) {} };
      },
      connected: function (cb) { var r = R('.info/connected'); var h = f.rtdbOnValue(r, function (s) { cb(!!s.val()); }); return typeof h === 'function' ? h : function () { try { f.rtdbOff(r, 'value'); } catch (e) {} }; },
      onDisconnect: function (p) { var d = f.rtdbOnDisconnect ? f.rtdbOnDisconnect(R(p)) : null; return d || { set: function () {}, update: function () {}, remove: function () {} }; }
    };
  }

  var store = null;
  O.store = function () { if (mem) return mem; if (!store && rtdbReady()) store = rtdbStore(); return store; };
  O._useMemoryStore = function () { mem = memStore(); return mem; };
  O._resetStore = function () { mem = null; store = null; };
  O.SV = SV;

  /* ---------- أدوات صغيرة ---------- */
  function day(ts) { var d = new Date(ts || Date.now()); return d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2); }
  O.day = day;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function uid() { if (O._uidOverride) return O._uidOverride; try { var u = fb() && fb().auth && fb().auth.currentUser; return u ? u.uid : null; } catch (e) { return null; } }
  function safe(fn) { try { return fn(); } catch (e) { O._lastErr = String(e && e.message || e); return undefined; } }
  function clip(s, n) { return String(s == null ? '' : s).slice(0, n || 120); }
  function deviceKind() {
    var w = Math.min(screen.width || 0, screen.height || 0) || innerWidth; var ua = navigator.userAgent || '';
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 't';
    if (/Mobi|iPhone|Android/i.test(ua) || w < 600) return 'm';
    return 'd';
  }
  O.deviceKind = deviceKind;
  function anon() {
    var a = lsGet('ehs_anon');
    if (!a) { var b = new Uint8Array(8); (window.crypto || { getRandomValues: function (x) { for (var i = 0; i < x.length; i++) x[i] = Math.random() * 256; } }).getRandomValues(b); a = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); lsSet('ehs_anon', a); }
    return a;
  }
  O.anon = anon;

  /* ---------- الأحداث الموحّدة (مع منع التكرار) ---------- */
  var recent = {}; var queue = [];
  function dedupe(key, ms) { var n = Date.now(); if (recent[key] && n - recent[key] < ms) return true; recent[key] = n; var ks = Object.keys(recent); if (ks.length > 200) ks.forEach(function (k) { if (n - recent[k] > 60000) delete recent[k]; }); return false; }
  O.emit = function (type, data) {
    if (OFF || LAB) return null;
    data = data || {};
    var dk = type + '|' + (data.rid || '') + '|' + (data.game || '') + '|' + (data.k || '');
    if (dedupe(dk, data.dedupeMs == null ? 2500 : data.dedupeMs)) return null;
    var ev = { t: SV, type: clip(type, 40), sev: data.sev || 'info', src: clip(data.src || 'site', 30), uid: uid() || '' };
    ['sid', 'rid', 'game', 'streamer', 'platform'].forEach(function (k) { if (data[k]) ev[k] = clip(data[k], 80); });
    if (data.msg) ev.msg = clip(data.msg, 200);
    if (data.n != null) ev.n = +data.n || 0;
    var s = O.store();
    if (!s || !ev.uid) { if (queue.length < 40) queue.push(ev); return ev; }
    safe(function () { s.push('opsEvents', ev).catch(function () {}); });
    return ev;
  };
  function flush() { var s = O.store(); if (!s || !uid()) return; var q = queue.splice(0); q.forEach(function (ev) { ev.uid = uid(); safe(function () { s.push('opsEvents', ev).catch(function () {}); }); }); }

  /* ---------- جلسات الستريمر ---------- */
  var sess = null; var hbTimer = null; var HB_MS = 20000;
  function activeTags() { try { return Object.keys(window.homeGameListeners || {}); } catch (e) { return []; } }
  function platforms() { try { return Object.keys(window.homeConnections || {}).filter(function (p) { return window.homeConnections[p]; }); } catch (e) { return []; } }
  function currentStreamerName(fallback) { try { return fallback || (window.scoreCurrentStreamer) || (window.currentUsername) || ''; } catch (e) { return fallback || ''; } }
  function ensureSession(streamer, platform) {
    var u = uid(); if (!u) return null;
    if (sess && sess.uid === u) { if (streamer && !sess.streamer) sess.streamer = streamer; return sess; }
    var sid = u.slice(0, 10) + '_' + Date.now().toString(36);
    sess = { sid: sid, uid: u, streamer: clip(streamer, 40), platform: clip(platform || '', 20), start: Date.now(), rounds: 0, done: 0 };
    var s = O.store(); if (!s || LAB || OFF) return sess;
    safe(function () {
      s.set('opsSessions/' + sid, { uid: u, streamer: sess.streamer, platform: sess.platform, state: 'live', start: SV, last: SV, game: '', nRounds: 0, nDone: 0, parts: 0, dev: deviceKind() });
      var od = s.onDisconnect('opsSessions/' + sid);
      if (od && od.update) od.update({ state: 'lost', ended: SV });
    });
    O.emit('session_start', { sid: sid, streamer: sess.streamer, platform: sess.platform, k: sid, dedupeMs: 1000 });
    if (!hbTimer) hbTimer = setInterval(heartbeat, HB_MS);
    return sess;
  }
  function partCount(tag) { try { return (O.partsOf && O.partsOf(tag)) || 0; } catch (e) { return 0; } }
  function heartbeat() {
    if (!sess || OFF || LAB) return; var s = O.store(); if (!s) return;
    var tags = activeTags(); var parts = 0; tags.forEach(function (t) { parts += partCount(t); });
    safe(function () { s.update('opsSessions/' + sess.sid, { last: SV, game: tags[0] || '', parts: parts, nRounds: sess.rounds, nDone: sess.done, state: 'live', plat: platforms().join(',') }); });
  }
  O._heartbeat = heartbeat;
  O.sessionEnd = function (reason) {
    if (!sess) return; var s = O.store(); var cur = sess;
    if (s && !LAB && !OFF) safe(function () { s.update('opsSessions/' + cur.sid, { state: 'ended', ended: SV, last: SV, endReason: clip(reason || 'end', 30) }); });
    O.emit('session_end', { sid: cur.sid, streamer: cur.streamer, k: cur.sid, dedupeMs: 1000 });
    sess = null; if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
  };
  O.session = function () { return sess; };

  /* ---------- الراوندات ---------- */
  var rounds = {}; // tag -> {rid,start}
  O.roundStart = function (tag, streamer, platform, gameName, fromListener) {
    if (OFF || LAB) return null;
    var ss = ensureSession(currentStreamerName(streamer), platform); if (!ss) return null;
    if (rounds[tag]) return rounds[tag].rid;
    // نفس الراوند قد يُبلَّغ مرتين بوسمين مختلفين (تسجيل الستريمر ثم مستمع الأحداث): نربطهما بنفس الراوند
    if (fromListener) {
      var recentKey = Object.keys(rounds).find(function (k) { var x = rounds[k]; return x && x.owner && !x.listener && Date.now() - x.start < 3000; });
      if (recentKey) { rounds[tag] = rounds[recentKey]; rounds[tag].listener = true; return rounds[tag].rid; }
    }
    var rid = ss.sid + '_' + tag + '_' + (ss.rounds + 1);
    rounds[tag] = { rid: rid, start: Date.now(), name: gameName || tag, done: false, owner: !fromListener, listener: !!fromListener };
    ss.rounds++;
    var s = O.store();
    if (s) safe(function () { s.set('opsSessions/' + ss.sid + '/rounds/' + (ss.rounds), { game: tag, name: clip(gameName || tag, 40), start: SV, state: 'running' }); });
    O.emit('round_start', { sid: ss.sid, rid: rid, game: tag, streamer: ss.streamer, platform: platform, msg: clip(gameName || tag, 60), k: rid, dedupeMs: 1000 });
    O.journey('start', tag);
    heartbeat();
    return rid;
  };
  O.roundEnd = function (tag, reason) {
    var r = rounds[tag]; if (!r || !sess || OFF || LAB) return;
    Object.keys(rounds).forEach(function (k) { if (rounds[k] === r) delete rounds[k]; });
    var idx = null; var s = O.store();
    var n = r.rid.split('_').pop(); idx = +n || null;
    if (s && idx) safe(function () { s.update('opsSessions/' + sess.sid + '/rounds/' + idx, { end: SV, state: r.done ? 'complete' : 'stopped' }); });
    O.emit('round_end', { sid: sess.sid, rid: r.rid, game: tag, streamer: sess.streamer, msg: r.done ? 'complete' : (reason || 'stopped'), k: r.rid, dedupeMs: 500 });
    heartbeat();
  };
  O.roundComplete = function (tag) {
    var r = rounds[tag] || (function () { var t = Object.keys(rounds)[0]; return t ? rounds[t] : null; })(); if (!r || !sess || OFF || LAB) return;
    if (r.done) return; r.done = true; sess.done++;
    O.emit('round_complete', { sid: sess.sid, rid: r.rid, game: tag, streamer: sess.streamer, k: r.rid, dedupeMs: 500 });
    O.journey('complete', tag);
  };
  O.connEvent = function (platform, from, to) {
    if (OFF || LAB) return;
    var sev = (to === 'failed' || to === 'disabled') ? 'error' : (to === 'reconnecting' || to === 'down' || to === 'disconnected' || to === 'not_live') ? 'warn' : 'info';
    var ss = sess;
    if (ss) { var s = O.store(); if (s) safe(function () { s.push('opsSessions/' + ss.sid + '/conn', { t: SV, platform: clip(platform, 20), from: clip(from || '', 20), to: clip(to, 20) }); }); }
    O.emit('conn_' + to, { sid: ss && ss.sid, platform: platform, streamer: ss && ss.streamer, sev: sev, msg: clip((from || '') + ' > ' + to, 60), k: platform + ':' + to, dedupeMs: 1500 });
  };
  O.launchFail = function (tag, msg) { O.emit('launch_fail', { sid: sess && sess.sid, streamer: sess && sess.streamer, game: tag, sev: 'error', msg: clip(msg, 160), k: tag, dedupeMs: 3000 }); O.journey('err', tag); };

  /* ---------- رحلة اللاعب (مجمّعة وبمعرّف غير مباشر) ---------- */
  var jmemo = {};
  function jkey(stage, tag) { return day() + '|' + stage + '|' + (tag || ''); }
  O.journey = function (stage, tag) {
    if (OFF || LAB) return;
    var k = jkey(stage, tag); if (jmemo[k]) return;
    var persisted = lsGet('ehs_j_' + k); if (persisted) { jmemo[k] = 1; return; }
    var u = uid(); var s = O.store(); if (!u || !s) return;
    jmemo[k] = 1; lsSet('ehs_j_' + k, '1');
    var a = anon(); var d = day(); var upd = { dev: deviceKind(), seen: SV };
    if (tag) upd['g/' + tag + '/' + stage] = SV; else upd['s/' + stage] = SV;
    if (tag && stage !== 'err') upd['s/' + stage] = SV;
    safe(function () {
      s.update('opsJourney/days/' + d + '/' + a, upd);
      if (!lsGet('ehs_j_first')) { lsSet('ehs_j_first', d); s.set('opsJourney/users/' + a, { first: d, dev: deviceKind() }); }
    });
  };

  /* ---------- إعدادات الألعاب (قراءة مع كاش) ---------- */
  var cfgCache = {}; var CFG_TTL = 5 * 60 * 1000;
  O.gameConfig = function (tag) {
    var c = cfgCache[tag]; if (c && Date.now() - c.at < CFG_TTL) return Promise.resolve(c.values);
    var s = O.store(); if (!s) return Promise.resolve(c ? c.values : {});
    return s.get('opsConfig/current/' + tag).then(function (v) { var vals = (v && v.values) || {}; cfgCache[tag] = { at: Date.now(), values: vals, v: v && v.v }; return vals; }, function () { return c ? c.values : {}; });
  };
  var cfgAll = null;
  O.configPreload = function () {
    var s = O.store(); if (!s) return Promise.resolve(null);
    return s.get('opsConfig/current').then(function (all) { cfgAll = all || {}; Object.keys(cfgAll).forEach(function (t) { cfgCache[t] = { at: Date.now(), values: (cfgAll[t] && cfgAll[t].values) || {}, v: cfgAll[t] && cfgAll[t].v }; }); return cfgAll; }, function () { return null; });
  };
  function clampField(tag, key, val) {
    try {
      var sc = (0, eval)('MOD_SETTINGS_SCHEMA')[tag]; var f = sc && sc.fields.filter(function (k) { return k.key === key; })[0]; if (!f) return undefined;
      if (f.type === 'toggle') return typeof val === 'boolean' ? val : undefined;
      if (f.type === 'numberArray') { if (!Array.isArray(val) || val.length !== f.length) return undefined; return val.map(function (n) { n = +n; return Math.min(f.max, Math.max(f.min, isFinite(n) ? n : f.min)); }); }
      var n = +val; if (!isFinite(n)) return undefined; return Math.min(f.max, Math.max(f.min, n));
    } catch (e) { return undefined; }
  }
  O.clampField = clampField;
  /* أولوية القيم: إعداد الستريمر الشخصي > الإعداد العام للمالك (opsConfig، مُقيَّد بحدود المخطط عند القراءة) > الافتراضي المبرمج */
  function installConfig() {
    var fn = window.modGetSetting; if (typeof fn !== 'function' || fn.__ops) return;
    var w = function (tag, key, fallback) {
      var r = fn.apply(this, arguments);
      try {
        var live = (0, eval)('modLiveSettings'); if (live && live[tag] && live[tag][key] !== undefined) return r;
        var g = cfgCache[tag] && cfgCache[tag].values;
        if (g && g[key] !== undefined) { var c = clampField(tag, key, g[key]); if (c !== undefined) return c; }
      } catch (e) {}
      return r;
    };
    w.__ops = true; w.__orig = fn; window.modGetSetting = w;
  }
  O._installConfig = installConfig;
  O.gameConfigSync = function (tag) { var c = cfgCache[tag]; return c ? c.values : {}; };
  O._clearCfg = function () { cfgCache = {}; };

  /* ---------- الربط بالموقع (لا يغيّر منطق الألعاب) ---------- */
  function wrap(name, after, before) {
    var fn = window[name]; if (typeof fn !== 'function' || fn.__ops) return false;
    var w = function () {
      var args = arguments;
      if (before) safe(function () { before.apply(null, args); });
      var r = fn.apply(this, args);
      if (after) safe(function () { after.apply(null, args); });
      return r;
    };
    w.__ops = true; w.__orig = fn; window[name] = w; return true;
  }
  O._wrap = wrap;

  /* ---------- بطولة جارية: اقتراح نتيجة من اللعبة (لا اعتماد تلقائي — المالك يعتمد) ---------- */
  var activeMatch = null;
  function hkey(h) { return String(h || '').trim().replace(/^@+/, '').replace(/^(tiktok|twitch|kick|youtube)[:_]/i, '').toLowerCase(); }
  O.setActiveMatch = function (m) { activeMatch = m || null; };
  O.activeMatch = function () { return activeMatch; };
  O.suggestFromWin = function (user) {
    if (!activeMatch || OFF || LAB) return false; var h = hkey(user && (user.uniqueId || user.username || user.nickname)); if (!h) return false;
    var isA = h === activeMatch.a, isB = h === activeMatch.b; if (!isA && !isB) return false;
    var s = O.store(); if (!s) return false; var m = activeMatch;
    safe(function () { s.update('opsTournaments/' + m.tid + '/matches/' + m.mid, { suggest: { winner: isA ? m.aId : m.bId, winnerName: isA ? m.aName : m.bName, at: SV, src: 'game' } }); });
    return true;
  };
  var lastAttempt = null;
  function attemptCheck(tag, name) {
    lastAttempt = { tag: tag, at: Date.now() };
    O.journey('try', tag);
    setTimeout(function () {
      if (!lastAttempt || lastAttempt.tag !== tag) return;
      var listening = false; try { listening = !!(window.homeGameListeners && window.homeGameListeners[tag]); } catch (e) {}
      if (!listening && !rounds[tag]) {
        var txt = ''; try { var el = document.querySelector('.page.active .status-msg.err'); txt = el ? el.textContent.trim() : ''; } catch (e) {}
        O.launchFail(tag, txt || ('لم يبدأ الراوند: ' + name));
      }
    }, 4500);
  }

  function install() {
    if (!OFF) installConfig();
    if (OFF || LAB || O._installed) return; O._installed = true;
    wrap('homeRegisterGameListener', function (tag) { var nm = tag; try { var r = window.TST_GAME_REGISTRY && window.TST_GAME_REGISTRY[tag]; if (r) nm = r.name; } catch (e) {} if (!rounds[tag]) O.roundStart(tag, null, null, nm, true); else rounds[tag].listener = true; }, function (tag) { // تسجيل لعبة يلغي مستمعات الألعاب الأخرى مباشرة (homeClearGameListeners) فننهي راوندها
      Object.keys(rounds).forEach(function (t) { if (t !== tag && t !== 'bridge-fate' && rounds[t] && rounds[t] !== rounds[tag]) O.roundEnd(t, 'replaced'); }); });
    wrap('homeUnregisterGameListener', function (tag) { O.roundEnd(tag, 'unregister'); });
    wrap('homeConnSetState', null, function (platform, state) { var prev = null; try { prev = window.homeConnGet(platform).state; } catch (e) {} if (prev !== state) O.connEvent(platform, prev, state); });
    wrap('recordWin', function (user) { var t = Object.keys(rounds)[0]; if (t) O.roundComplete(t); O.suggestFromWin(user); });
    wrap('levelsAwardRoundTo', function (user, tag) { O.roundComplete(tag); });
    wrap('ownerRegisterActiveStreamer', function (tag, username, platform, gameName) { O.roundStart(tag, username, platform, gameName); }, function (tag, username, platform, gameName) { ensureSession(username, platform); });
    wrap('goHome', function () { O.journey('games'); }, function () { Object.keys(rounds).forEach(function (t) { O.roundEnd(t, 'home'); }); });
    document.addEventListener('click', function (e) {
      var c = e.target && e.target.closest && e.target.closest('.gcard[data-tag]'); if (!c) return;
      O.journey('select', c.getAttribute('data-tag')); O.journey('games');
    }, true);
    window.addEventListener('pagehide', function () { O.sessionEnd('pagehide'); });
    O.journey('open');
  }
  O.install = install;
  O.attempt = attemptCheck;
  O.partsOf = function (tag) {
    try { var spec = (window.EHS_OPS_GAMES || []).find(function (g) { return g.tag === tag || g.reg === tag; }); if (!spec || !spec.pmap) return 0; var m = (0, eval)(spec.pmap); return m && (m.size != null ? m.size : Object.keys(m).length) || 0; } catch (e) { return 0; }
  };

  function boot() {
    install();
    // محاولات التشغيل (قبل أن يبدأ الراوند): نغلّف دوال launch من سجل الألعاب بعد اكتمال تحميل الصفحة
    var tries = 0;
    (function wrapLaunchers() {
      var list = window.EHS_OPS_GAMES || []; var ok = 0;
      list.forEach(function (g) { if (g.launch && typeof window[g.launch] === 'function') { if (wrap(g.launch, null, function () { attemptCheck(g.reg || g.tag, g.name); })) ok++; } });
      if (++tries < 6) setTimeout(wrapLaunchers, 3000);
    })();
    if (O.store() && uid()) flush();
    if (!OFF) { var pl = function () { if (O.store()) O.configPreload(); }; setTimeout(pl, 2500); setInterval(pl, 10 * 60 * 1000); }
  }
  window.addEventListener('fb-ready', function () { setTimeout(function () { var f = fb(); if (f && f.onAuthStateChanged) { f.onAuthStateChanged(f.auth, function (u) { if (u) { flush(); O.journey('open'); O.configPreload(); } }); } }, 0); });
  if (document.readyState === 'complete') setTimeout(boot, 0); else window.addEventListener('load', function () { setTimeout(boot, 1500); });
})();
