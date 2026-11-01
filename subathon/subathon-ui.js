/* السابثون — Live Control Studio (الواجهة + الربط بالجسر + الحفظ) */
(function () {
  'use strict';
  var C = window.SubathonCore, E = window.SubathonEngine; if (!C || !E) return;
  var S = window.Subathon = {};
  var store = new C.ControllerStore(), observed = {}, observedOrder = [];
  var logItems = [], practiceSel = 0, lastCmd = null, lastRes = null, introDone = false, pageEl = null, modalEl = null, hudEl = null, activating = false;
  var settings = { mode: 'leader', turnSec: 30, leaderKey: null };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function uid() { try { var u = window.__fb && window.__fb.auth && window.__fb.auth.currentUser; return u ? u.uid : null; } catch (e) { return null; } }
  var PLAT = { tiktok: 'تيك توك', twitch: 'تويتش', kick: 'كيك', youtube: 'يوتيوب' };

  /* ---------------- الحفظ (إعداد المتحكمين فقط؛ حالة التحكم لا تُحفظ أبداً) ---------------- */
  function lsKey() { return 'ehs_subathon_v1_' + (uid() || 'anon'); }
  function save() {
    var data = { controllers: store.list(), settings: settings };
    try { localStorage.setItem(lsKey(), JSON.stringify(data)); } catch (e) {}
    try { var f = window.__fb, u = uid(); if (f && f.rtdb && u) f.rtdbSet(f.rtdbRef(f.rtdb, 'subathon/' + u), { controllers: data.controllers.reduce(function (o, c) { o[c.key.replace(/[.#$\[\]\/:]/g, '_')] = { k: c.key, l: c.level, v: c.verified ? 1 : 0, n: String(c.name || '').slice(0, 40), t: c.addedAt }; return o; }, {}), mode: settings.mode, ts: Date.now() }).catch(function () {}); } catch (e) {}
  }
  function load() {
    try { var d = JSON.parse(localStorage.getItem(lsKey()) || 'null'); if (d) { store = new C.ControllerStore(d.controllers || []); Object.assign(settings, d.settings || {}); } } catch (e) {}
    session = makeSession();
  }
  var session;
  function makeSession() {
    return new C.Session({ store: store, cfg: { mode: settings.mode, turnSec: settings.turnSec }, exec: function (item, meta) { return E.execute(item, meta); }, onEvent: onSessionEvent });
  }

  /* ---------------- الاتصال بالبث (حالة حقيقية) ---------------- */
  function conn() {
    var out = { state: 'none', label: 'لا يوجد بث مربوط', platforms: [] };
    try {
      var ov = typeof homeConnOverall === 'function' ? homeConnOverall() : null;
      var ps = Object.keys(homeConnections || {}).filter(function (p) { return homeConnections[p]; });
      ps.forEach(function (p) { var st = homeConnState && homeConnState[p] ? homeConnState[p].state : 'connecting'; out.platforms.push({ p: p, name: PLAT[p] || p, state: st, user: homeConnections[p].username || '' }); });
      if (ov) { out.state = ov; out.label = (typeof CONN_STATE_LABELS === 'object' && CONN_STATE_LABELS[ov]) || ov; }
    } catch (e) {}
    return out;
  }
  function chatReady() { var c = conn(); return c.state === 'connected'; }

  /* ---------------- ربط الشات ---------------- */
  var origDispatch = null;
  function installBridge() {
    if (origDispatch || typeof window.homeDispatchToGameListeners !== 'function') return;
    origDispatch = window.homeDispatchToGameListeners;
    window.homeDispatchToGameListeners = function (evt) {
      try { S._onBridge(evt); } catch (e) { console.warn('[subathon]', e); }
      return origDispatch.apply(this, arguments);
    };
  }
  S._onBridge = function (evt) {
    var msgs = evt && evt.messages; if (!msgs) return;
    msgs.forEach(function (m) {
      var ty = m && m.type; if (ty !== 'WebcastChatMessage' && ty !== 'chat' && ty !== 'comment') return;
      var u = m.user || (m.data && m.data.user) || {}; var uidv = u.uniqueId || u.username || m.uniqueId || ''; if (!uidv) return;
      var plat = u.platform || (evt && evt.sourcePlatform) || (/^(tiktok|twitch|kick|youtube):/.test(String(uidv)) ? String(uidv).split(':')[0] : 'tiktok');
      var text = m.comment != null ? m.comment : (m.data && m.data.comment) || ''; var key = C.idKey(plat, uidv);
      var info = { key: key, name: u.nickname || m.nickname || key.split(':')[1], avatar: u.profilePictureUrl || u.avatarUrl || u.avatar || m.avatar || '', platform: key.split(':')[0], at: Date.now() };
      if (!observed[key]) observedOrder.push(key); observed[key] = info; if (observedOrder.length > 60) delete observed[observedOrder.shift()];
      var c = store.get(key); if (c && !c.verified) { store.verify(key, info); save(); addLog({ status: 'info', type: 'verified', detail: 'تم التحقق من هوية ' + (c.name || c.username) }); render(); return; /* تعليق التحقق نفسه لا يُنفَّذ كأمر */ }
      else if (c && c.verified && (info.name !== c.name || (info.avatar && info.avatar !== c.avatar))) { c.name = info.name || c.name; c.avatar = info.avatar || c.avatar; }
      if (session.active) {
        var r = session.submit({ platform: plat, uniqueId: uidv, text: text, msgId: m.msgId || m.eventId || m.id || (m.data && (m.data.msgId || m.data.eventId)) || null, epoch: session.epoch });
        if (r && r.ok) { lastCmd = { who: info.name, text: String(text).slice(0, 40) }; hudUpdate(); }
      }
    });
  };

  /* ---------------- السجل + HUD ---------------- */
  function time() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); }
  function addLog(e) { e.t = time(); logItems.unshift(e); if (logItems.length > 120) logItems.pop(); renderLog(); }
  var STATUS_AR = { queued: 'بالانتظار', done: 'نُفّذ', failed: 'فشل', rejected: 'مرفوض', info: 'نظام' };
  var REASON_AR = { 'unverified': 'هوية غير متحقق منها', 'level': 'صلاحية غير كافية', 'not-leader': 'ليس القائد', 'not-your-turn': 'ليس دورك', 'duplicate': 'تكرار', 'rate-limit': 'سرعة عالية', 'queue-full': 'الطابور ممتلئ', 'expired': 'انتهت صلاحية الأمر', 'stale-epoch': 'جلسة قديمة', 'stale-context': 'تغيرت الشاشة', 'revoked': 'سُحب التفويض', 'unsafe-text': 'نص غير آمن', 'conflict': 'تعارض', 'not-found': 'لا هدف بهذا الاسم', 'ambiguous': 'عدة نتائج', 'edge': 'نهاية الاتجاه', 'no-targets': 'لا عناصر', 'blocked': 'ممنوع', 'page-forbidden': 'صفحة غير مسموحة', 'no-game': 'لا لعبة', 'no-start': 'لا زر بدء', 'no-round': 'لا يمكن بدء راوند', 'no-next': 'لا جولة تالية', 'disabled': 'الزر معطل', 'gone': 'العنصر اختفى', 'exception': 'خطأ تنفيذ' };
  function onSessionEvent(e) {
    addLog(e);
    if (e.status === 'done' || e.status === 'failed') { lastRes = { ok: e.status === 'done', text: e.status === 'done' ? (e.detail || 'تم') : (REASON_AR[e.reason] || e.detail || 'فشل'), who: e.name }; lastCmd = { who: e.name, text: e.text }; hudResult(lastRes.ok); }
    else if (e.status === 'rejected') { /* الرفض يظهر في السجل فقط، لا نجاح مزيف */ }
    hudUpdate(); renderStats();
  }
  function ensureHud() {
    if (hudEl && hudEl.isConnected) return hudEl;
    hudEl = document.createElement('div'); hudEl.id = 'subathon-hud'; hudEl.setAttribute('data-subathon-ui', '1'); hudEl.setAttribute('role', 'status');
    hudEl.innerHTML = '<div class="hd"><div class="l1"><i></i><span id="sbh-who">—</span></div><div class="l2" id="sbh-cmd"></div><div class="l3"><button type="button" id="sbh-restore">استعادة التحكم</button><span class="res" id="sbh-res" style="display:none"></span></div></div>';
    document.body.appendChild(hudEl); $('sbh-restore').addEventListener('click', function () { S.restore('hud'); }); return hudEl;
  }
  function hudUpdate() {
    var h = ensureHud(); h.classList.toggle('on', !!session.active); if (!session.active) return;
    var cur = session.currentTurnKey(); var who;
    if (session.mode === 'queue') who = 'وضع الطابور (' + session.queue.length + ')'; else { var c = store.get(cur); who = (c ? (c.name || c.username) : '—') + (session.mode === 'rotation' ? ' · ' + Math.ceil(session.turnRemainingMs() / 1000) + 'ث' : ''); }
    $('sbh-who').textContent = 'التحكم: ' + who;
    $('sbh-cmd').innerHTML = lastCmd ? 'آخر أمر: <b>' + esc(lastCmd.text) + '</b>' + (lastRes ? ' — ' + esc(lastRes.text) : '') : 'بانتظار أول أمر';
  }
  function hudResult(ok) {
    var h = ensureHud(), r = $('sbh-res'); r.style.display = ''; r.className = 'res ' + (ok ? 'ok' : 'bad'); r.textContent = ok ? 'تم' : 'لم يتم';
    h.classList.remove('flash-ok', 'flash-bad'); void h.offsetWidth; h.classList.add(ok ? 'flash-ok' : 'flash-bad'); setTimeout(function () { h.classList.remove('flash-ok', 'flash-bad'); }, 500);
  }
  setInterval(function () { if (session && session.active && session.mode === 'rotation') hudUpdate(); }, 1000);

  /* ---------------- زر التحكم / التفعيل / الاستعادة ---------------- */
  function activationCheck() {
    var c = conn(), ver = store.verifiedList(), probs = [];
    if (!window.homeHasActiveConnection || !homeHasActiveConnection()) probs.push('اربط بثك أولاً');
    else if (c.state !== 'connected') probs.push('البث غير متصل حالياً (' + c.label + ')');
    if (!ver.length) probs.push('أضف متحكماً واحداً على الأقل وتحقق من هويته (يكتب تعليقاً في البث)');
    if (!store.list().every(function (x) { return !!x.level; })) probs.push('حدّد صلاحيات المتحكمين');
    if (settings.mode === 'leader' && settings.leaderKey && !(store.get(settings.leaderKey) || {}).verified) probs.push('القائد غير متحقق منه');
    return probs;
  }
  S.activationCheck = activationCheck;
  S.activate = function () {
    if (activating) return { ok: false, problems: ['جارٍ التفعيل'] };
    var p = activationCheck(); if (p.length) { toastMsg(p[0]); render(); return { ok: false, problems: p }; }
    activating = true;
    try { session.activate({ mode: settings.mode, leaderKey: settings.leaderKey, turnSec: settings.turnSec }); } catch (e) { activating = false; toastMsg(e.message); return { ok: false, problems: [e.message] }; }
    hudUpdate(); render(); handoff(function () { activating = false; if (E.pageId() === 'subathon') { try { show('home'); } catch (e) {} } });
    return { ok: true };
  };
  S.restore = function (src) {
    var d = session.revoke(src || 'manual'); E.clearPointer(); lastCmd = null; lastRes = null; hudUpdate(); render(); toastMsg('تمت استعادة التحكم'); return d;
  };
  function toastMsg(m) { try { if (typeof showToast === 'function') return showToast(m); } catch (e) {} var t = $('sb-toast'); if (!t) { t = document.createElement('div'); t.id = 'sb-toast'; t.setAttribute('data-subathon-ui', '1'); t.setAttribute('role', 'status'); t.style.cssText = 'position:fixed;bottom:90px;inset-inline:0;margin:auto;width:max-content;max-width:90vw;z-index:100120;background:#170B2D;color:#F8F7FC;border:1px solid #7C3AED;border-radius:12px;padding:10px 18px;font:700 14px sans-serif;direction:rtl'; document.body.appendChild(t); } t.textContent = m; t.style.display = ''; clearTimeout(t._t); t._t = setTimeout(function () { t.style.display = 'none'; }, 3200); }
  function handoff(done) {
    if (reduced()) { done && done(); return; }
    var h = $('subathon-handoff'); if (!h) { h = document.createElement('div'); h.id = 'subathon-handoff'; h.setAttribute('data-subathon-ui', '1'); h.innerHTML = '<div class="st a"><b>CONTROL HANDOFF</b><span>تسليم التحكم</span></div><div class="st b"><b>AUTHORIZATION</b><span>التحقق من التفويض</span></div><div class="st c"><b>SYSTEM READY</b><span>التحكم جاهز</span></div><div class="st d"><b>LIVE CONTROL</b><span>التحكم المباشر يعمل</span></div><div class="bar"><i></i></div><button type="button" class="skip" style="position:absolute;bottom:24px;background:transparent;color:#F8F7FC;border:1px solid rgba(167,139,250,.4);border-radius:999px;padding:8px 20px;font:700 13px sans-serif;cursor:pointer">تخطي</button>'; document.body.appendChild(h); }
    h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); var fin = false;
    function end() { if (fin) return; fin = true; h.classList.remove('on'); done && done(); }
    h.querySelector('.skip').onclick = end; setTimeout(end, 2600);
  }

  /* ---------------- المقدمة السينمائية ---------------- */
  function intro() {
    if (introDone || reduced()) { introDone = true; return; } introDone = true;
    try { if (sessionStorage.getItem('ehs_sb_intro')) return; sessionStorage.setItem('ehs_sb_intro', '1'); } catch (e) {}
    var el = document.createElement('div'); el.id = 'subathon-intro'; el.setAttribute('data-subathon-ui', '1');
    el.innerHTML = '<div class="scan"></div><div class="core"><svg viewBox="0 0 260 260" aria-hidden="true"><circle class="r1" cx="130" cy="130" r="118"/><circle class="r2" cx="130" cy="130" r="92"/><circle class="r3" cx="130" cy="130" r="66"/><circle class="pt" cx="130" cy="12" r="4"/><circle class="pt" cx="248" cy="130" r="3" style="animation-delay:.4s"/><circle class="pt" cx="38" cy="200" r="3" style="animation-delay:.8s"/></svg><div class="lbl"><b>LIVE CONTROL CORE</b><span>السابثون</span></div></div><button type="button" class="skip">تخطي</button>';
    document.body.appendChild(el); function end() { el.classList.add('out'); setTimeout(function () { el.remove(); }, 550); }
    el.querySelector('.skip').onclick = end; setTimeout(end, 3400);
  }

  /* ---------------- الصفحة ---------------- */
  var LV_DESC = { 1: 'التنقل: اتجاهات، ضغط، رجوع، فتح لعبة بالاسم', 2: 'إدارة الألعاب: + الإعدادات، بدء اللعبة والراوند، التالي', 3: 'تحكم متقدم: كل ما سبق على الألعاب المسموحة' };
  var FORBID = ['لوحة المالك', 'تغيير الحساب', 'بيانات الدخول', 'الأمان والصلاحيات', 'المتحكمون الآخرون', 'البيانات الشخصية', 'الحذف', 'المدفوعات', 'قاعدة البيانات', 'تنفيذ كود من التعليقات', 'صفحات خارج الألعاب المسموحة'];
  function ensurePage() {
    if (pageEl && pageEl.isConnected) return pageEl;
    pageEl = document.createElement('div'); pageEl.className = 'page'; pageEl.id = 'pg-subathon';
    var host = document.querySelector('.page') ? document.querySelector('.page').parentNode : document.body; host.appendChild(pageEl); return pageEl;
  }
  function steps() {
    var c = conn(), linked = c.state === 'connected', hasC = store.list().length > 0, ver = store.verifiedList().length > 0;
    var arr = [{ t: 'ربط البث', d: linked }, { t: 'إضافة متحكم', d: hasC }, { t: 'التحقق من الهوية', d: ver }, { t: 'الصلاحيات', d: ver }, { t: 'التفعيل', d: session.active }];
    var firstNot = arr.findIndex(function (s) { return !s.d; }); return arr.map(function (s, i) { return '<li class="' + (s.d ? 'done' : (i === firstNot ? 'now' : '')) + '">' + s.t + '</li>'; }).join('');
  }
  function ctlCard(c) {
    var cur = session.active && session.currentTurnKey() === c.key; var ex = cur && lastRes && lastCmd && session.busy;
    var st = !c.verified ? '<span class="sb-tag wait">بانتظار التحقق</span>' : (ex ? '<span class="sb-tag ex">ينفّذ الآن</span>' : (session.active ? (cur || session.mode === 'queue' ? '<span class="sb-tag ok">نشط</span>' : '<span class="sb-tag">متصل</span>') : '<span class="sb-tag">غير نشط</span>'));
    var seen = observed[c.key] ? 'ظهر في الشات قبل ' + Math.max(0, Math.round((Date.now() - observed[c.key].at) / 1000)) + 'ث' : 'لم يظهر في الشات بعد';
    var av = c.avatar ? '<img src="' + esc(c.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : esc((c.name || c.username || '?').charAt(0).toUpperCase());
    return '<div class="sb-ctl' + (cur ? ' exec' : '') + '" data-key="' + esc(c.key) + '"><div class="sb-av">' + av + '</div><div class="grow"><div class="nm">' + esc(c.name || c.username) + ' ' + st + '</div><div class="meta">@' + esc(c.username) + ' · ' + esc(PLAT[c.platform] || c.platform) + ' · ' + seen + '</div></div>' +
      '<select data-act="level" aria-label="الصلاحية">' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (c.level === n ? ' selected' : '') + '>' + C.LEVEL_NAMES[n] + '</option>'; }).join('') + '</select>' +
      (settings.mode === 'leader' && c.verified ? '<button type="button" class="sb-btn ghost" data-act="leader">' + ((settings.leaderKey || (store.verifiedList()[0] || {}).key) === c.key ? 'القائد' : 'اجعله قائداً') + '</button>' : '') +
      '<button type="button" class="sb-btn ghost" data-act="remove" aria-label="إزالة">إزالة</button></div>';
  }
  function render() {
    var pg = ensurePage(); var c = conn(); var probs = activationCheck(); var act = session.active;
    var dot = c.state === 'connected' ? 'on' : (c.state === 'none' || c.state === 'failed' || c.state === 'disabled' ? 'bad' : 'wait');
    var plats = c.platforms.length ? c.platforms.map(function (p) { return '<div class="sb-kv"><span>' + esc(p.name) + (p.user ? ' · @' + esc(p.user) : '') + '</span><b>' + esc((typeof CONN_STATE_LABELS === 'object' && CONN_STATE_LABELS[p.state]) || p.state) + '</b></div>'; }).join('') : '<div class="sb-empty">لا بث مربوط. اربط حساب بثك ليستقبل احسمها التعليقات.</div>';
    var ctls = store.list().map(ctlCard).join('') || '<div class="sb-empty">لا يوجد متحكمون بعد. أضف مشاهداً موثوقاً ليتحكم بالألعاب من التعليقات.</div>';
    var modeSel = '<div class="sb-row" style="margin-bottom:12px"><label class="sb-note">وضع التحكم</label><select id="sb-mode"><option value="leader"' + (settings.mode === 'leader' ? ' selected' : '') + '>قائد واحد</option><option value="rotation"' + (settings.mode === 'rotation' ? ' selected' : '') + '>تناوب بالأدوار</option><option value="queue"' + (settings.mode === 'queue' ? ' selected' : '') + '>طابور أوامر</option></select>' +
      (settings.mode === 'rotation' ? '<label class="sb-note">مدة الدور (ث)</label><input type="number" id="sb-turn" min="5" max="300" value="' + settings.turnSec + '" style="width:80px">' : '') + '</div>';
    var fdb = FORBID.map(function (f) { return '<span class="sb-tag" style="margin:2px">' + f + '</span>'; }).join('');
    var cc = E.current(); var g = E.openedGame();
    pg.innerHTML = '<div class="sb-wrap" data-subathon-ui="1"><div class="sb-top"><h1>السابثون<small>Live Control Studio · تحكم المشاهدين الموثوقين من التعليقات</small></h1><button type="button" class="sb-back" id="sb-home">الرئيسية</button></div>' +
      '<ol class="sb-progress" aria-label="خطوات الإعداد">' + steps() + '</ol>' +
      '<div class="sb-grid"><section class="sb-card" aria-labelledby="sb-h1"><h2 id="sb-h1"><i></i>ربط البث</h2><div class="sb-stat"><span class="sb-dot ' + dot + '"></span><span id="sb-conn-label">' + esc(c.label) + '</span></div>' + plats +
      '<div class="sb-row" style="margin-top:12px"><button type="button" class="sb-btn" id="sb-link">' + (c.platforms.length ? 'إدارة الربط' : 'ربط البث') + '</button></div><p class="sb-note">التعليقات تصل عبر جسر احسمها من المنصات المربوطة فعلياً فقط. لا يوجد ربط وهمي.</p></section>' +
      '<section class="sb-card" aria-labelledby="sb-h2"><h2 id="sb-h2"><i></i>صلاحيات المتحكمين</h2>' + modeSel + ctls + '<div class="sb-row"><button type="button" class="sb-btn" id="sb-add"' + (store.list().length >= 12 ? ' disabled' : '') + '>إضافة متحكم</button></div>' +
      '<div style="margin-top:14px"><div class="sb-note" style="margin-bottom:6px">لا يُسمح لأي متحكم مهما كان مستواه بـ:</div>' + fdb + '</div></section>' +
      '<section class="sb-card" aria-labelledby="sb-h3"><h2 id="sb-h3"><i></i>معاينة التحكم المباشر</h2><div class="sb-prev"><div class="sb-note">الحالة الحقيقية للموقع الآن (لا نسخة ثانية من اللعبة)</div><div class="scr"><div class="sb-kv"><span>الشاشة</span><b id="sbv-page">' + esc(E.pageId() || '—') + '</b></div><div class="sb-kv"><span>اللعبة</span><b id="sbv-game">' + esc(g || '—') + '</b></div><div class="sb-kv"><span>المؤشر</span><b id="sbv-ptr">' + esc(cc ? cc.innerText.replace(/\s+/g, ' ').slice(0, 24) : '—') + '</b></div><div class="sb-kv"><span>الطابور</span><b id="sbv-q">' + session.queue.length + '</b></div></div></div>' +
      '<div class="sb-row" style="margin-top:12px"><button type="button" class="sb-btn ghost" id="sb-practice-btn">تجربة التحكم</button></div><div id="sb-practice"></div></section></div>' +
      '<div class="sb-bottom"><section class="sb-card"><h2><i></i>سجل التحكم المباشر</h2><div class="sb-log" id="sb-log" aria-live="polite"></div></section>' +
      '<section class="sb-card"><h2><i></i>الأوامر</h2><div class="sb-note">تحت · فوق · يمين · يسار<br>اضغط · اختر · افتح · ادخل<br>رجوع · ارجع · عودة<br>الألعاب · افتح الألعاب<br>افتح الروليت · اختر XO<br>ابدأ · ابدأ الراوند · التالي<br>انزل الصفحة · مرر فوق</div></section>' +
      '<section class="sb-card"><h2><i></i>مقاييس الأداء</h2><div id="sb-stats"></div></section></div></div>' +
      '<div class="sb-lock"><button type="button" class="sb-btn sb-big" id="sb-act"' + (act ? ' disabled' : '') + '>' + (act ? 'التحكم يعمل' : 'تفعيل التحكم') + '</button><button type="button" class="sb-btn danger sb-big" id="sb-restore" style="background:#7f1d1d">استعادة التحكم</button></div>' +
      (!act && probs.length ? '<div class="sb-note" id="sb-probs" style="text-align:center;margin-top:-90px;position:relative;z-index:60;padding:0 16px">لتفعيل التحكم: ' + esc(probs[0]) + '</div>' : '');
    bind(); renderLog(); renderStats();
  }
  function renderLog() {
    var box = $('sb-log'); if (!box) return;
    box.innerHTML = logItems.length ? logItems.slice(0, 60).map(function (e) {
      var tx = e.status === 'info' ? e.detail || e.type : (esc(e.name || (e.who || '').split(':')[1] || '') + ': ' + esc(e.text || ''));
      var tail = e.status === 'rejected' ? (REASON_AR[e.reason] || e.reason) : (e.status === 'failed' ? (REASON_AR[e.reason] || e.detail || 'فشل') : (e.status === 'done' ? (e.detail || STATUS_AR.done) : STATUS_AR[e.status] || ''));
      return '<div class="it ' + e.status + '"><span class="t">' + e.t + '</span><span>' + (e.status === 'info' ? esc(tx) : tx) + '</span><span>' + esc(tail) + '</span></div>'; }).join('') : '<div class="sb-empty">لا أحداث بعد. عند التفعيل ستظهر كل أوامر المتحكمين هنا لحظياً.</div>';
  }
  function renderStats() {
    var b = $('sb-stats'); if (!b) return; var s = session.stats();
    function v(x, u) { return x == null ? '—' : x + (u || ''); }
    b.innerHTML = '<div class="sb-kv"><span>تعليقات مستلمة</span><b>' + s.received + '</b></div><div class="sb-kv"><span>أوامر مقبولة</span><b>' + s.accepted + '</b></div><div class="sb-kv"><span>نجاح التنفيذ</span><b>' + v(s.okRate, '%') + '</b></div><div class="sb-kv"><span>نسبة الرفض</span><b>' + v(s.rejectRate, '%') + '</b></div><div class="sb-kv"><span>تحليل الأمر</span><b>' + v(s.avgParseMs, ' ms') + '</b></div><div class="sb-kv"><span>انتظار الطابور</span><b>' + v(s.avgQueueMs, ' ms') + '</b></div><div class="sb-kv"><span>زمن التنفيذ</span><b>' + v(s.avgExecMs, ' ms') + '</b></div>';
  }
  function bind() {
    $('sb-home').onclick = function () { show('home'); };
    $('sb-link').onclick = function () { if (typeof tiktokConnectModalOpen === 'function') tiktokConnectModalOpen(); };
    $('sb-add').onclick = openAddModal; $('sb-act').onclick = function () { S.activate(); }; $('sb-restore').onclick = function () { S.restore('page'); };
    $('sb-practice-btn').onclick = practice;
    var ms = $('sb-mode'); if (ms) ms.onchange = function () { settings.mode = ms.value; try { if (session.active) session.setMode(settings.mode, { turnSec: settings.turnSec, leaderKey: settings.leaderKey }); else session.mode = settings.mode; } catch (e) {} save(); render(); };
    var tn = $('sb-turn'); if (tn) tn.onchange = function () { settings.turnSec = Math.max(5, Math.min(300, tn.value | 0 || 30)); session.cfg.turnSec = settings.turnSec; save(); };
    pageEl.querySelectorAll('.sb-ctl').forEach(function (row) {
      var key = row.getAttribute('data-key');
      row.querySelector('[data-act=remove]').onclick = function () { store.remove(key); if (settings.leaderKey === key) settings.leaderKey = null; session.queue = session.queue.filter(function (q) { return q.key !== key; }); save(); render(); };
      row.querySelector('[data-act=level]').onchange = function (e) { store.setLevel(key, e.target.value); save(); render(); };
      var ld = row.querySelector('[data-act=leader]'); if (ld) ld.onclick = function () { settings.leaderKey = key; try { if (session.active) session.setLeader(key); } catch (e) {} save(); render(); };
    });
  }
  /* ---------------- نافذة إضافة متحكم ---------------- */
  function openAddModal() {
    if (!modalEl) { modalEl = document.createElement('div'); modalEl.id = 'subathon-modal'; modalEl.setAttribute('data-subathon-ui', '1'); modalEl.setAttribute('role', 'dialog'); modalEl.setAttribute('aria-modal', 'true'); document.body.appendChild(modalEl); }
    var viewers = observedOrder.slice().reverse().map(function (k) { return observed[k]; }).filter(function (v) { return v && !store.get(v.key); });
    var sel = null, lvl = 1;
    modalEl.innerHTML = '<div class="box"><h3>إضافة متحكم</h3><div class="sb-note" style="font:600 12px sans-serif;color:#a79bc4;line-height:1.7">الهوية تُعتمد فقط من الشات الحقيقي: اختر مشاهداً ظهر في تعليقات بثك الآن، أو اكتب اليوزر ويبقى «بانتظار التحقق» حتى يكتب تعليقاً.</div>' +
      '<div style="margin-top:12px;font:800 13px sans-serif">مشاهدون تم التعرف عليهم من البث</div><div id="sbm-list" style="margin-top:6px;max-height:180px;overflow:auto">' + (viewers.length ? viewers.map(function (v) { return '<div class="viewer" data-k="' + esc(v.key) + '">' + esc(v.name) + ' <span style="color:#a79bc4">@' + esc(v.key.split(':')[1]) + ' · ' + esc(PLAT[v.platform] || v.platform) + '</span></div>'; }).join('') : '<div style="color:#a79bc4;font:600 13px sans-serif;padding:8px">لم يُرصد أي مشاهد بعد. اربط البث وانتظر تعليقاً من المشاهد.</div>') + '</div>' +
      '<div class="row"><select id="sbm-plat">' + Object.keys(PLAT).map(function (p) { return '<option value="' + p + '">' + PLAT[p] + '</option>'; }).join('') + '</select><input id="sbm-user" type="text" placeholder="اليوزر بدون @" autocomplete="off" aria-label="اليوزر"></div>' +
      ['1', '2', '3'].map(function (n) { return '<label class="perm"><input type="radio" name="sbm-lv" value="' + n + '"' + (n === '1' ? ' checked' : '') + '>' + C.LEVEL_NAMES[n] + '<small>' + LV_DESC[n] + '</small></label>'; }).join('') +
      '<div class="err" id="sbm-err" role="alert"></div><div class="row" style="justify-content:flex-start"><button type="button" class="b" id="sbm-ok">إضافة</button><button type="button" class="b g" id="sbm-cancel">إلغاء</button></div></div>';
    modalEl.classList.add('on');
    modalEl.querySelectorAll('.viewer').forEach(function (v) { v.onclick = function () { modalEl.querySelectorAll('.viewer').forEach(function (x) { x.classList.remove('sel'); }); v.classList.add('sel'); sel = v.getAttribute('data-k'); $('sbm-user').value = ''; }; });
    $('sbm-user').oninput = function () { sel = null; modalEl.querySelectorAll('.viewer').forEach(function (x) { x.classList.remove('sel'); }); };
    $('sbm-cancel').onclick = function () { modalEl.classList.remove('on'); };
    modalEl.onclick = function (e) { if (e.target === modalEl) modalEl.classList.remove('on'); };
    $('sbm-ok').onclick = function () {
      var lv = +(modalEl.querySelector('input[name=sbm-lv]:checked') || {}).value || 1;
      try {
        if (sel) { var o = observed[sel]; store.add({ platform: o.platform, username: o.key.split(':')[1], level: lv, verified: true, name: o.name, avatar: o.avatar }); }
        else { var u = $('sbm-user').value.trim(); if (!u) throw new Error('اختر مشاهداً أو اكتب اليوزر'); var k = C.idKey($('sbm-plat').value, u); var seen = observed[k]; store.add({ platform: $('sbm-plat').value, username: u, level: lv, verified: !!seen, name: seen ? seen.name : u, avatar: seen ? seen.avatar : '' }); }
      } catch (e) { $('sbm-err').textContent = e.message; return; }
      save(); modalEl.classList.remove('on'); render();
    };
    setTimeout(function () { $('sbm-user').focus(); }, 30);
  }
  /* ---------------- تجربة التحكم (معزولة وموسومة) ---------------- */
  function practice() {
    var box = $('sb-practice'); if (!box) return; var labels = ['الروليت', 'XO', 'شد الحبل', 'القنبلة', 'المدفع', 'الإعدادات']; practiceSel = 0;
    box.innerHTML = '<div class="sb-note" style="margin-top:10px"><b>وضع تجربة — لا يمس احسمها ولا يرسل أوامر حقيقية.</b> اكتب أمراً كما يكتبه المتحكم:</div><div class="sb-row" style="margin-top:6px"><input type="text" id="sbpx" placeholder="مثال: تحت" style="flex:1" aria-label="أمر تجريبي"><button type="button" class="sb-btn ghost" id="sbpx-go">جرّب</button></div><div class="sb-practice" id="sbpx-grid">' + labels.map(function (l, i) { return '<button type="button" tabindex="-1" class="' + (i === 0 ? 'sel' : '') + '">' + l + '</button>'; }).join('') + '</div><div class="sb-note" id="sbpx-out">—</div>';
    function run() {
      var t = $('sbpx').value; var cmd = C.parse(t, {}); var out = $('sbpx-out'); var btns = box.querySelectorAll('.sb-practice button'); if (!cmd) { out.textContent = 'تجربة: ليس أمراً'; return; }
      var p = practiceSel; var cols = 3;
      if (cmd.type === 'right') p = Math.max(0, p - 1); else if (cmd.type === 'left') p = Math.min(5, p + 1); else if (cmd.type === 'down') p = Math.min(5, p + cols); else if (cmd.type === 'up') p = Math.max(0, p - cols);
      if (cmd.type === 'press') { btns[p].classList.add('hit'); setTimeout(function () { btns[p].classList.remove('hit'); }, 300); out.textContent = 'تجربة: تم الضغط على «' + btns[p].textContent + '»'; }
      else if (cmd.type === 'name') { var f = Array.prototype.findIndex.call(btns, function (b) { return C.bare(b.textContent) === C.bare(cmd.args.name); }); if (f >= 0) { p = f; btns[p].classList.add('hit'); out.textContent = 'تجربة: فُتح «' + btns[p].textContent + '»'; } else out.textContent = 'تجربة: لا هدف بهذا الاسم'; }
      else out.textContent = 'تجربة: ' + cmd.type;
      btns.forEach(function (b, i) { b.classList.toggle('sel', i === p); }); practiceSel = p; $('sbpx').value = '';
    }
    $('sbpx-go').onclick = run; $('sbpx').onkeydown = function (e) { if (e.key === 'Enter') run(); }; $('sbpx').focus();
  }

  /* ---------------- فتح الصفحة والأزرار ---------------- */
  S.open = function () { ensurePage(); render(); show('subathon'); intro(); };
  window.subathonOpen = S.open;
  var tick = null;
  function onShow() {
    var pg = E.pageId();
    if (pg === 'subathon') { render(); if (!tick) tick = setInterval(function () { if (E.pageId() !== 'subathon') { clearInterval(tick); tick = null; return; } updLive(); }, 1000); }
    if (session && session.active) { session.contextChanged('page:' + pg); hudUpdate(); }
  }
  function updLive() {
    var c = conn(); var lb = $('sb-conn-label'); if (lb && lb.textContent !== c.label) render();
    var p = $('sbv-page'); if (p) { p.textContent = E.pageId(); $('sbv-game').textContent = E.openedGame() || '—'; var cc = E.current(); $('sbv-ptr').textContent = cc ? cc.innerText.replace(/\s+/g, ' ').slice(0, 24) : '—'; $('sbv-q').textContent = session.queue.length; }
  }
  function wrapShow() {
    if (typeof window.show !== 'function' || window.show._sb) return; var o = window.show;
    window.show = function (page) { var r = o.apply(this, arguments); try { onShow(); } catch (e) {} return r; }; window.show._sb = 1;
  }
  E.hooks.onPointer = function () { var p = $('sbv-ptr'); if (p) updLive(); };
  /* أزرار التنقل: استبدال «سباق الأكواد» (الكود والفعالية والملفات باقية) */
  var ICON = '<svg viewBox="0 0 22 22" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="2.4" fill="#A78BFA"/><path class="w1" d="M6.2 6.2a6.8 6.8 0 0 0 0 9.6M15.8 6.2a6.8 6.8 0 0 1 0 9.6" stroke="#A78BFA" stroke-width="1.6" stroke-linecap="round"/><path class="w2" d="M3.2 3.4a11 11 0 0 0 0 15.2M18.8 3.4a11 11 0 0 1 0 15.2" stroke="#7C3AED" stroke-width="1.6" stroke-linecap="round"/><path d="M12.6 12.6l4.2 1.4-1.8.8-.8 1.8z" fill="#F8F7FC"/><rect x="17" y="17" width="3" height="3" rx=".8" fill="#7C3AED"/></svg>';
  function swapButtons() {
    var a = $('topnav-tab-event'); if (a && !a.getAttribute('data-sb')) { a.className = 'topnav-tab sb-nav-btn'; a.id = 'topnav-tab-subathon'; a.setAttribute('onclick', 'subathonOpen()'); a.setAttribute('data-sb', '1'); a.innerHTML = ICON + '<span>السابثون</span>'; }
    var b = $('home-event-cta-btn'); if (b && !b.getAttribute('data-sb')) { b.className = 'sb-nav-btn home'; b.id = 'home-subathon-btn'; b.setAttribute('onclick', 'subathonOpen()'); b.setAttribute('data-sb', '1'); b.style.animation = 'none'; b.innerHTML = ICON + '<span>السابثون</span>'; }
  }
  function boot() {
    load(); swapButtons(); installBridge(); wrapShow(); ensureHud();
    var cssGuard = 0; var iv = setInterval(function () { swapButtons(); installBridge(); wrapShow(); if (++cssGuard > 40) clearInterval(iv); }, 500);
  }
  S._store = function () { return store; }; S._session = function () { return session; }; S._observed = function () { return observed; }; S._settings = settings; S._save = save; S.render = render;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
