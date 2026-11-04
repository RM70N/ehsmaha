'use strict';

/**
 * يُحقن بالعالم الرئيسي للصفحة (بعد fb-ready) ويشترك — قراءة فقط — بالمستندات
 * الموثوقة التي لا يكتبها إلا المالك، ويرسل أحداثاً مبسّطة عبر CustomEvent
 * ('ehsmaha-desktop-event') يلتقطها preload. لا يعدّل أي دالة بالموقع.
 *
 * مصادر موثوقة (firestore.rules: كتابة للمالك فقط):
 *   broadcastMessages/current           → kind: broadcast
 *   personalMessages/{usernameLower}    → kind: personal   (للمستلم فقط)
 *   storeNewAnnouncements/current       → kind: new-game
 *   streamerEventAnnouncements/current  → kind: streamer
 * لا يُستخدم siteUpdates إطلاقاً (قابل للكتابة من أي مستخدم).
 */
const BRIDGE_SOURCE = `(function(){
  if (window.__ehsDesktopBridge) return; window.__ehsDesktopBridge = true;
  var BASE = Date.now();
  function ms(t){ try { if (t && typeof t.toMillis==='function') return t.toMillis(); if (t && typeof t.seconds==='number') return t.seconds*1000; if (typeof t==='number') return t; } catch(e){} return 0; }
  function emit(d){ try { document.dispatchEvent(new CustomEvent('ehsmaha-desktop-event',{detail:d})); } catch(e){} }
  function str(v,n){ return (typeof v==='string'? v : '').slice(0,n); }
  var first = {};
  function watch(tag, ref, map){
    first[tag] = true;
    window.__fb.onSnapshot(ref, function(snap){
      var isFirst = first[tag]; first[tag] = false;
      if (!snap.exists()) return;
      var d = snap.data() || {}; var ev = map(d); if (!ev) return;
      // أول لقطة = حالة قديمة عند الفتح؛ نقبلها فقط لو حديثة (< 2 دقيقة).
      if (isFirst && (!ev.sentAt || BASE - ev.sentAt > 120000)) return;
      emit(ev);
    }, function(){});
  }
  function boot(){
    var fb = window.__fb; if (!fb || !fb.db) return;
    watch('broadcast', fb.doc(fb.db,'broadcastMessages','current'), function(d){
      var t = ms(d.sentAt); if (!d.text) return null;
      return { kind:'broadcast', id:'b:'+t+':'+str(d.text,40), title:'رسالة من احسمها', body:str(d.text,200), sentAt:t, target:'home' };
    });
    watch('newgame', fb.doc(fb.db,'storeNewAnnouncements','current'), function(d){
      var t = ms(d.addedAt); if (!t) return null;
      return { kind:'new-game', id:'ng:'+t, title:'جديد في احسمها', body:'تمت إضافة جديد في المتجر', sentAt:t, target:'store' };
    });
    watch('streamer', fb.doc(fb.db,'streamerEventAnnouncements','current'), function(d){
      var t = ms(d.updatedAt); if (d.status !== 'active' || !d.eventId) return null;
      return { kind:'streamer', id:'se:'+d.eventId+':'+t, title:'فعالية جديدة في احسمها', body:str(d.broadcastMessage||'بدأت فعالية جديدة',160), sentAt:t, target:'home' };
    });
  }
  var personalFor = null;
  function personal(){
    try {
      var fb = window.__fb; if (!fb || !fb.db || typeof currentUsername==='undefined' || !currentUsername) return;
      var u = String(currentUsername).toLowerCase(); if (personalFor === u) return; personalFor = u;
      watch('personal:'+u, fb.doc(fb.db,'personalMessages',u), function(d){
        var t = ms(d.sentAt); if (!d.text) return null;
        return { kind:'personal', id:'p:'+u+':'+t, title:'رسالة لك من احسمها', body:'', sentAt:t, target:'home' };
      });
    } catch(e){}
  }
  var started = false;
  function start(){ if (started) return; if (!window.__fb) return; started = true; boot(); setInterval(personal, 4000); personal(); }
  if (window.__fb) start(); else window.addEventListener('fb-ready', start, { once:true });
})()`;

module.exports = { BRIDGE_SOURCE };
