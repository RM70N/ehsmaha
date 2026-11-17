/* ===== رحلة الفضاء — طبقة الربط الخارجية بين احسمها واللعبة (space-odyssey.html بدون أي تعديل) =====
 * هذا الملف مستقل: لا يعدّل ملف اللعبة ولا يكرّر كودها. يعتمد على:
 *   - صفحة المضيف (#pg-spaceodyssey + #spaceodyssey-frame) الموجودة في index.html
 *   - نظام الاتصال الموحّد بالموقع (homeRegisterGameListener / homeHasActiveConnection …)
 *   - واجهة اللعبة window.EhsemhaSpace داخل الإطار (نفس الأصل) + رسائل postMessage ذات المصدر "ehsemha-space"
 * العقد الفعلي للعبة (من فحص ملفها):
 *   receiveEvent({type:'chat', uniqueId, nickname, avatar, comment, msgId, isFollower, followKnown})  ← تعليق
 *   receiveEvent({type:'WebcastSocialMessage', uniqueId, nickname, avatar})                          ← متابعة تُفرج عن اللاعب المعلّق
 *   setHooks({followGate(user)→bool, onWin(user, team)})   setLinkStatus(bool)   destroy()
 *   رسائل خارجة: ready, lobby, join, match-start, round-end, result, finish, late-mode
 */
(function () {
  'use strict';
  if (window.__spaceOdysseyIntegration) return; // منع التهيئة المزدوجة وتسجيل المستمعات مرتين
  var TAG = 'spaceodyssey', NAME = 'رحلة الفضاء', SRC = '/space-odyssey.html?embed=1&v=1';
  var MSG_SOURCE = 'ehsemha-space';
  var KNOWN_TYPES = { ready: 1, lobby: 1, join: 1, 'match-start': 1, 'round-end': 1, result: 1, finish: 1, 'late-mode': 1 };

  var ready = false, queue = [], linkTimer = null, readyTimer = null, active = false, users = new Map(), streamer = '', notified = false;

  function $(id) { return document.getElementById(id); }
  function frame() { return $(TAG + '-frame'); }
  function proxied(u) { if (!u) return ''; try { return (typeof avatarProxyUrl === 'function') ? avatarProxyUrl(u) : u; } catch (e) { return u; } }
  function connState() {
    try { var o = (typeof homeConnOverall === 'function') ? homeConnOverall() : 'connected'; if (o === 'connected') return 'connected'; if (o === 'connecting' || o === 'reconnecting') return 'reconnecting'; return 'disconnected'; } catch (e) { return 'connected'; }
  }
  function plat() { try { return (typeof gamePlatform === 'object' && gamePlatform[TAG]) || 'tiktok'; } catch (e) { return 'tiktok'; } }
  function toastMsg(m) { try { if (typeof toast === 'function') toast(m); } catch (e) {} }

  // واجهة اللعبة (تظهر بعد تجهيز المشهد ثلاثي الأبعاد). لا نفترض وجودها قبل التحقق من الدوال.
  function api() {
    try { var w = frame().contentWindow; var a = w && w.EhsemhaSpace; return a && typeof a.receiveEvent === 'function' && typeof a.setHooks === 'function' ? a : null; } catch (e) { return null; }
  }
  function remember(u) { if (u && u.uniqueId) { users.set(String(u.uniqueId), u); if (users.size > 3000) users.delete(users.keys().next().value); } }
  function siteUser(u) { var uid = String((u && u.uniqueId) || ''), s = users.get(uid) || {}; return Object.assign({}, s, { uniqueId: uid, nickname: (u && u.nickname) || s.nickname || uid, avatar: s.avatar || (u && u.avatar) || '' }); }

  function sendToGame(a, ev) { try { a.receiveEvent(ev); } catch (e) { console.error('[' + TAG + ']', e); } }
  function deliver(ev) { var a = api(); if (a && ready) sendToGame(a, ev); else if (queue.length < 300) queue.push(ev); }

  // ===== أحداث البث الموحّدة → صيغة اللعبة (الحقول مأخوذة من extractUser الفعلية للموقع) =====
  function handleEvent(d) {
    if (!active) return;
    var msgs = (d && d.messages) || (d && d.type ? [d] : []);
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i], t = m && (m.type || m.event);
      if (t === 'WebcastChatMessage' || t === 'chat' || t === 'comment') {
        var u = extractUser(m), txt = String(m.comment || m.content || (m.data && m.data.comment) || '').trim();
        if (!txt || !u || !u.uniqueId || u.uniqueId === '?') continue;
        remember(u);
        deliver({
          type: 'chat', uniqueId: String(u.uniqueId), nickname: u.nickname || u.rawUniqueId || String(u.uniqueId), avatar: proxied(u.avatar),
          comment: txt, msgId: m.msgId || m.eventId || m.id || (m.data && (m.data.msgId || m.data.eventId)) || '',
          isFollower: !!u.isFollower, followKnown: u.followKnown === true
        });
      } else if (t === 'WebcastSocialMessage' || t === 'follow' || t === 'social') {
        var f = extractUser(m);
        if (!f || !f.uniqueId || f.uniqueId === '?') continue;
        remember(f);
        deliver({ type: 'WebcastSocialMessage', uniqueId: String(f.uniqueId), nickname: f.nickname || String(f.uniqueId), avatar: proxied(f.avatar) });
      }
    }
  }

  function pushLink(a) { try { var x = a || api(); if (x && x.setLinkStatus) x.setLinkStatus(connState() === 'connected'); } catch (e) {} }

  function installHooks(a) {
    a.setHooks({
      // شرط المتابعة المركزي للموقع: اللعبة تُبقي غير المتابع «معلّقاً» وتُدخله عند وصول حدث متابعة منه
      followGate: function (u) { try { return typeof followGateAllows === 'function' ? followGateAllows(TAG, u) : true; } catch (e) { return true; } },
      // الفوز: لكل عضو بالفريق الفائز (لاعبو الاختبار الداخلي sim_ لا يُحسب لهم فوز)
      onWin: function (u) {
        var id = String((u && u.uniqueId) || '');
        if (!id || /^sim_/.test(id)) return;
        try { recordWin(siteUser(u), NAME); } catch (e) { console.error('[' + TAG + ']', e); }
      }
    });
  }

  function onFrameLoad() {
    var tries = 0; clearInterval(readyTimer);
    readyTimer = setInterval(function () {
      var a = api(); tries++;
      if (a) {
        clearInterval(readyTimer); readyTimer = null;
        try { installHooks(a); } catch (e) { console.error('[' + TAG + ']', e); }
        ready = true; pushLink(a);
        queue.splice(0).forEach(function (ev) { sendToGame(a, ev); });
      } else if (tries > 600) { clearInterval(readyTimer); readyTimer = null; toastMsg('⚠️ تعذّر تجهيز اللعبة ثلاثية الأبعاد على هذا الجهاز'); }
    }, 100);
    clearInterval(linkTimer);
    linkTimer = setInterval(function () {
      var dot = $(TAG + '-live-dot'), cs = connState();
      if (dot) dot.className = 'dot' + (cs === 'connected' ? '' : (cs === 'reconnecting' ? ' connecting' : ' off'));
      pushLink();
    }, 1500);
  }

  // ===== رسائل الإطار (التحقق: أصل الرسالة + مصدرها هو إطار اللعبة + اسم البروتوكول + نوع معروف) =====
  function onMessage(e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || d.source !== MSG_SOURCE) return;
    if (e.origin !== location.origin) return;
    try { if (e.source !== frame().contentWindow) return; } catch (x) { return; }
    if (typeof d.type !== 'string' || !KNOWN_TYPES[d.type]) return;
    if (d.type === 'match-start') { try { if (typeof contestNoteRoundStarted === 'function') contestNoteRoundStarted(TAG); } catch (x) {} }
    if (d.type === 'finish' || d.type === 'round-end') { try { if (typeof contestNoteActivity === 'function') contestNoteActivity(); } catch (x) {} }
  }

  function launch() {
    streamer = localStorage.getItem(STREAMER_USER_STORAGE_KEY) || '';
    try { gamePlatform[TAG] = localStorage.getItem(HOME_CONNECTED_PLATFORM_KEY) || gamePlatform[TAG]; } catch (e) {}
    if (typeof homeHasActiveConnection === 'function' && (!homeHasActiveConnection() || !streamer)) {
      toastMsg('⚠️ اربط بثك أولاً من الصفحة الرئيسية (زر ابدأ بثاً سريعاً)');
      // نفس أسلوب بقية الألعاب: نافذة الربط السريع ثم رجوع تلقائي للعبة بعد نجاح الاتصال
      if (typeof homeSetQuickConnectResume === 'function' && typeof homeOpenQuickConnect === 'function') { homeSetQuickConnectResume(launch); homeOpenQuickConnect(); }
      return;
    }
    teardown(); // لا تبقى نسخة سابقة/مستمع قديم/مؤقتات
    try { scoreCurrentStreamer = streamer; } catch (e) {}
    try { ownerRegisterActiveStreamer(TAG, streamer, plat(), NAME); } catch (e) {}
    try { contestNoteActivity(); } catch (e) {}
    var lu = $(TAG + '-live-user'); if (lu) lu.textContent = '@' + streamer;
    active = true; ready = false; queue = []; users.clear();
    var f = frame(); f.onload = onFrameLoad; f.src = SRC;
    show(TAG);
    try { homeRegisterGameListener(TAG, handleEvent); } catch (e) {}
  }

  // يُستدعى عند الخروج أو قبل إعادة الإطلاق
  function teardown() {
    active = false;
    try { homeUnregisterGameListener(TAG); } catch (e) {}
    if (linkTimer) { clearInterval(linkTimer); linkTimer = null; }
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    ready = false; queue = [];
    var f = frame();
    if (f) {
      f.onload = null;
      // تحرير موارد اللعبة (حلقة الرسم + الصوت + عارض WebGL) قبل تفريغ الإطار — ليس أثناء استخدامها
      try { var a = api(); if (a && typeof a.destroy === 'function') a.destroy(); } catch (e) {}
      try { f.src = 'about:blank'; } catch (e) {}
    }
  }
  function goHomeFrom() { teardown(); if (typeof goHome === 'function') goHome(); else show('home'); }

  window.addEventListener('message', onMessage);
  window.launchSpaceOdyssey = launch;                 // زر البطاقة: يفتح اللعبة مباشرة (شاشة الإعداد الأصلية داخل اللعبة)
  window.goSetupSpaceOdyssey = launch;
  window.spaceodysseyHandleEvent = handleEvent;       // لمحاكي المطوّر (TST_GAME_REGISTRY)
  window.spaceodysseyApi = api;
  window.ehsSoGoHome = goHomeFrom;
  window.ehsSoOnShow = function (page) { if (page !== TAG && (active || linkTimer || readyTimer)) teardown(); };
  window.__spaceOdysseyIntegration = { teardown: teardown, isActive: function () { return active; }, isReady: function () { return ready; } };
  if (typeof TST_GAME_REGISTRY === 'object' && TST_GAME_REGISTRY) { TST_GAME_REGISTRY[TAG] = { pageId: TAG, participantsVar: null, joinFn: null, handleFn: 'spaceodysseyHandleEvent', name: NAME }; }
})();
