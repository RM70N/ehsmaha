/* ===== اعثر على الكورة 3D — طبقة الربط بين احسمها واللعبة (findball3d.html) =====
 * تحل محل واجهة اللعبة القديمة بالكامل (الأكواب DOM) بنسخة ثلاثية الأبعاد داخل إطار مستقل.
 * يعتمد على: صفحة المضيف #pg-findball (+ #findball-frame) في index.html، ونظام الاتصال الموحّد بالموقع،
 * وواجهة اللعبة window.EhsemhaFindball (نفس الأصل) ورسائل postMessage ذات المصدر "ehsemha-findball".
 * عقد اللعبة:
 *   receiveEvent({type:'chat', uniqueId, nickname, avatar, comment, msgId, isFollower, followKnown})
 *   receiveEvent({type:'WebcastSocialMessage', uniqueId, ...})   ← متابعة تُفرج عن اللاعب المعلّق
 *   receiveEvent({type:'gift', uniqueId, nickname, giftName, diamonds})   ← إنعاش بهدية
 *   setHooks({followGate(user)→bool, onWin(user), onRoundStart()}) · configure({...إعدادات, user}) · setLinkStatus(bool, نص)
 *   join(user) · removePlayer(uid) · forceWin(uid) · getState() · destroy()
 */
(function () {
  'use strict';
  if (window.__findball3dIntegration) return; // منع التهيئة المزدوجة
  var TAG = 'findball', NAME = 'اعثر على الكورة', SRC = '/findball3d.html?embed=1&v=1', MSG_SOURCE = 'ehsemha-findball';
  var KNOWN = { ready: 1, lobby: 1, 'round-start': 1, 'round-click': 1, winner: 1 };
  var ready = false, queue = [], linkTimer = null, readyTimer = null, active = false, users = new Map(), streamer = '', mirrorSig = '';
  var SETTING_KEYS = [['shuffleMinMs', 6000], ['shuffleSpeedupPercent', 15], ['shuffleMinFloorMs', 1800], ['swapCount', 6], ['guessTimerEnabled', true], ['guessTimerSeconds', 10]];

  function $(id) { return document.getElementById(id); }
  function frame() { return $(TAG + '-frame'); }
  function proxied(u) { if (!u) return ''; try { return (typeof avatarProxyUrl === 'function') ? avatarProxyUrl(u) : u; } catch (e) { return u; } }
  function connState() { try { var o = (typeof homeConnOverall === 'function') ? homeConnOverall() : 'connected'; if (o === 'connected') return 'connected'; if (o === 'connecting' || o === 'reconnecting') return 'reconnecting'; return 'disconnected'; } catch (e) { return 'connected'; } }
  function plat() { try { return (typeof gamePlatform === 'object' && gamePlatform[TAG]) || 'tiktok'; } catch (e) { return 'tiktok'; } }
  function toastMsg(m) { try { if (typeof toast === 'function') toast(m); } catch (e) {} }
  function api() { try { var w = frame().contentWindow; var a = w && w.EhsemhaFindball; return a && typeof a.receiveEvent === 'function' && typeof a.setHooks === 'function' ? a : null; } catch (e) { return null; } }
  function remember(u) { if (u && u.uniqueId) { users.set(String(u.uniqueId), u); if (users.size > 3000) users.delete(users.keys().next().value); } }
  function siteUser(u) { var uid = String((u && u.uniqueId) || ''), s = users.get(uid) || {}; return Object.assign({}, s, { uniqueId: uid, nickname: (u && u.nickname) || s.nickname || uid, avatar: s.avatar || (u && u.avatar) || '' }); }
  function send(a, ev) { try { a.receiveEvent(ev); } catch (e) { console.error('[' + TAG + ']', e); } }
  function deliver(ev) { var a = api(); if (a && ready) send(a, ev); else if (queue.length < 300) queue.push(ev); }

  // ===== أحداث البث الموحّدة → صيغة اللعبة (الحقول من extractUser الفعلية) =====
  function handleEvent(d) {
    if (!active) return;
    var msgs = (d && d.messages) || (d && d.type ? [d] : []);
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i], t = m && (m.type || m.event);
      if (t === 'WebcastChatMessage' || t === 'chat' || t === 'comment') {
        var u = extractUser(m), txt = String(m.comment || m.content || (m.data && m.data.comment) || '').trim();
        if (!txt || !u || !u.uniqueId || u.uniqueId === '?') continue;
        remember(u);
        deliver({ type: 'chat', uniqueId: String(u.uniqueId), nickname: u.nickname || u.rawUniqueId || String(u.uniqueId), avatar: proxied(u.avatar), comment: txt,
          msgId: m.msgId || m.eventId || m.id || (m.data && (m.data.msgId || m.data.eventId)) || '', isFollower: !!u.isFollower, followKnown: u.followKnown === true });
      } else if (t === 'WebcastSocialMessage' || t === 'follow' || t === 'social') {
        var f = extractUser(m); if (!f || !f.uniqueId || f.uniqueId === '?') continue; remember(f);
        deliver({ type: 'WebcastSocialMessage', uniqueId: String(f.uniqueId), nickname: f.nickname || String(f.uniqueId), avatar: proxied(f.avatar) });
      } else if (t === 'WebcastGiftMessage' || t === 'gift') {
        var g = extractUser(m); if (!g || !g.uniqueId || g.uniqueId === '?') continue; remember(g);
        var diamonds = (Number(m.diamondCount || (m.gift && m.gift.diamond_count) || (m.data && m.data.diamondCount) || 0) || 0) * (Number(m.repeatCount || (m.data && m.data.repeatCount) || 1) || 1);
        deliver({ type: 'gift', uniqueId: String(g.uniqueId), nickname: g.nickname || String(g.uniqueId), avatar: proxied(g.avatar), giftName: m.giftName || (m.gift && m.gift.name) || (m.data && m.data.giftName) || 'هدية', diamonds: diamonds });
      }
    }
  }

  // ===== مرآة الحالة: أنظمة الموقع المشتركة (الجولات الحية، الاحتفال بالفوز، الأوامر الحيّة…) تقرأ متغيرات اللعبة بأسمائها المعتادة =====
  function mirror(a) {
    try {
      var st = a.getState(), sig = st.status + '|' + st.round + '|' + st.players.length + '|' + st.shuffling;
      if (sig === mirrorSig) return; mirrorSig = sig;
      try { findballGameStatus = st.status; findballRoundNum = st.round; findballShuffling = !!st.shuffling; } catch (e) {}
      try { findballParticipants.clear(); st.players.forEach(function (p) { findballParticipants.set(p.uniqueId, users.get(p.uniqueId) || p); }); liveRoundsMirror(TAG, findballParticipants); } catch (e) {}
    } catch (e) {}
  }

  function readSettings() {
    var c = {};
    SETTING_KEYS.forEach(function (kv) { try { c[kv[0]] = (typeof modGetSetting === 'function') ? modGetSetting(TAG, kv[0], kv[1]) : kv[1]; } catch (e) { c[kv[0]] = kv[1]; } });
    return c;
  }
  function installHooks(a) {
    a.setHooks({
      followGate: function (u) { try { return typeof followGateAllows === 'function' ? followGateAllows(TAG, u) : true; } catch (e) { return true; } },
      onWin: function (u) { var id = String((u && u.uniqueId) || ''); if (!id) return; try { recordWin(siteUser(u), NAME); } catch (e) { console.error('[' + TAG + ']', e); } try { if (typeof contestNoteActivity === 'function') contestNoteActivity(); } catch (e) {} },
      onRoundStart: function () { try { if (typeof contestNoteRoundStarted === 'function') contestNoteRoundStarted(TAG); } catch (e) {} }
    });
  }
  function pushLink(a) { try { var x = a || api(); if (x) x.setLinkStatus(connState() === 'connected', (strongest(streamer)) + '@' + streamer); } catch (e) {} }
  function strongest(u) { try { return typeof strongestStreamerBadgePrefix === 'function' ? strongestStreamerBadgePrefix(u) : ''; } catch (e) { return ''; } }

  function onFrameLoad() {
    var tries = 0; clearInterval(readyTimer);
    readyTimer = setInterval(function () {
      var a = api(); tries++;
      if (a) {
        clearInterval(readyTimer); readyTimer = null;
        try { installHooks(a); a.configure(Object.assign(readSettings(), { user: streamer })); } catch (e) { console.error('[' + TAG + ']', e); }
        ready = true; pushLink(a);
        queue.splice(0).forEach(function (ev) { send(a, ev); });
      } else if (tries > 600) { clearInterval(readyTimer); readyTimer = null; toastMsg('⚠️ تعذّر تجهيز اللعبة ثلاثية الأبعاد على هذا الجهاز'); }
    }, 100);
    clearInterval(linkTimer);
    linkTimer = setInterval(function () { var a = api(); if (a && ready) { pushLink(a); mirror(a); } }, 1200);
  }

  // رسائل الإطار: أصل الموقع + مصدرها إطار اللعبة + اسم البروتوكول + نوع معروف
  function onMessage(e) {
    var d = e.data;
    if (!d || typeof d !== 'object' || d.source !== MSG_SOURCE) return;
    if (e.origin !== location.origin) return;
    try { if (e.source !== frame().contentWindow) return; } catch (x) { return; }
    if (typeof d.type !== 'string' || !KNOWN[d.type]) return;
    if (d.type === 'round-start') { try { if (typeof contestNoteRoundStarted === 'function') contestNoteRoundStarted(TAG); } catch (x) {} }
  }

  // أوامر البث الحيّة (انضم/غادر/فوّزني…) لمالك الموقع والستريمر — نفس معالجات اللعبة القديمة لكن عبر واجهة الإطار الجديدة
  var liveHandlers = {
    join: function (payload) { var a = api(); if (a) a.join(liveCommandBuildSyntheticUser(payload)); },
    leave: function (payload) { var a = api(); if (a) a.removePlayer(payload.uniqueId); },
    forceWinOther: function (payload) { var a = api(); if (a) a.forceWin(payload.uniqueId); },
    forceWinSelf: function (payload) {
      var a = api(); if (!a) return;
      var st = a.getState();
      if (!st.players.some(function (p) { return p.uniqueId === payload.uniqueId; })) a.join(liveCommandBuildSyntheticUser(payload));
      if (['hiding', 'shuffling', 'guessing'].indexOf(st.status) >= 0) { toastMsg('⚠️ انضممت للتو وسط جولة شغّالة — بتشارك بالجولة الجاية، جرّب "فوزني" بعدها'); return; }
      a.forceWin(payload.uniqueId);
    }
  };

  function launch() {
    streamer = localStorage.getItem(STREAMER_USER_STORAGE_KEY) || '';
    try { gamePlatform[TAG] = localStorage.getItem(HOME_CONNECTED_PLATFORM_KEY) || gamePlatform[TAG]; } catch (e) {}
    if (typeof homeHasActiveConnection === 'function' && (!homeHasActiveConnection() || !streamer)) {
      toastMsg('⚠️ اربط بثك أولاً من الصفحة الرئيسية (زر ابدأ بثاً سريعاً)');
      if (typeof homeSetQuickConnectResume === 'function' && typeof homeOpenQuickConnect === 'function') { homeSetQuickConnectResume(launch); homeOpenQuickConnect(); }
      return;
    }
    teardown(); // لا نسخة قديمة/مستمع قديم/مؤقتات
    try { scoreCurrentStreamer = streamer; } catch (e) {}
    try { ownerRegisterActiveStreamer(TAG, streamer, plat(), NAME); } catch (e) {}
    try { contestNoteActivity(); } catch (e) {}
    try { liveCommandsBoot(TAG, liveHandlers); } catch (e) {}
    var lu = $(TAG + '-live-user'); if (lu) lu.textContent = '@' + streamer;
    active = true; ready = false; queue = []; users.clear(); mirrorSig = '';
    try { findballGameStatus = 'waiting'; findballRoundNum = 0; findballShuffling = false; findballParticipants.clear(); } catch (e) {}
    var f = frame(); f.onload = onFrameLoad; f.src = SRC;
    show(TAG);
    try { homeRegisterGameListener(TAG, handleEvent); } catch (e) {}
  }

  function teardown() {
    active = false;
    try { homeUnregisterGameListener(TAG); } catch (e) {}
    if (linkTimer) { clearInterval(linkTimer); linkTimer = null; }
    if (readyTimer) { clearInterval(readyTimer); readyTimer = null; }
    ready = false; queue = [];
    var f = frame();
    if (f) {
      f.onload = null;
      try { var a = api(); if (a && typeof a.destroy === 'function') a.destroy(); } catch (e) {} // يوقف الرسم والمؤقتات والصوت قبل التفريغ
      try { f.src = 'about:blank'; } catch (e) {}
    }
    try { findballGameStatus = 'finished'; findballShuffling = false; findballParticipants.clear(); } catch (e) {}
  }
  function goHomeFrom() { teardown(); if (typeof goHome === 'function') goHome(); else show('home'); }

  window.addEventListener('message', onMessage);
  window.goSetupFindball = launch;               // بطاقة المكتبة: تفتح اللعبة مباشرة (شاشة الإعداد الأصلية داخل اللعبة)
  window.launchFindball = launch;
  window.findballHandleEvent = handleEvent;      // لمحاكي المطوّر
  window.findballApi = api;
  window.ehsFbGoHome = goHomeFrom;
  window.ehsFbOnShow = function (page) { if (page !== TAG && (active || linkTimer || readyTimer)) teardown(); };
  window.__findball3dIntegration = { teardown: teardown, isActive: function () { return active; }, isReady: function () { return ready; } };
})();
