'use strict';

/**
 * كشف "نقطة آمنة" لتطبيق تحديث المحتوى: لا نعيد تحميل الصفحة إطلاقاً أثناء
 * جولة نشطة / بث مباشر متصل / بطولة / لاعبين حقيقيين.
 *
 * التحليل يتم داخل الصفحة نفسها (قراءة فقط، لا تعديل) عبر webFrame.executeJavaScript.
 * أي صفحة غير معروفة أو فشل القراءة = مشغول (الأمان أولاً).
 */

// صفحات الواجهة الخاملة (لا لعب فيها): تسمح بتحديث فوري.
const IDLE_PAGE_IDS = new Set([
  'pg-landing', 'pg-home', 'pg-auth', 'pg-choose-username', 'pg-profile', 'pg-callcenter',
  'pg-leaderboard', 'pg-levels', 'pg-frames', 'pg-faq', 'pg-contest-top20', 'pg-solo-home',
  'pg-party-home', 'pg-ahsemha-home', 'pg-ahsemha-pick', 'pg-ahsemha-teams', 'pg-ahsemha-board',
]);

/** تعبير JS يُنفَّذ داخل الصفحة ويرجع لقطة بسيطة قابلة للتسلسل. */
const PROBE_SOURCE = `(function(){
  try {
    var act = document.querySelector('.page.active');
    var id = act ? act.id : null;
    var conns = 0;
    try {
      var hc = (typeof homeConnections !== 'undefined') ? homeConnections : null;
      if (hc) { var vals = (hc instanceof Map) ? Array.from(hc.values()) : Object.values(hc);
        for (var i = 0; i < vals.length; i++) { var c = vals[i]; if (c && c.ws) conns++; } }
    } catch (e) {}
    var games = 0;
    try {
      var hg = (typeof homeGameListeners !== 'undefined') ? homeGameListeners : null;
      if (hg) games = (hg instanceof Map || hg instanceof Set) ? hg.size : (Array.isArray(hg) ? hg.length : Object.keys(hg).length);
    } catch (e) {}
    var frames = document.querySelectorAll('iframe').length;
    var gameFrame = false;
    // إطارات اللعب لها معرّف *-frame وتحمل src فعلياً؛ معاينات الصفحة الرئيسية (.lp-frame) زخرفية.
    try { var fs = document.querySelectorAll('iframe[id$="-frame"]'); for (var j = 0; j < fs.length; j++) { if ((fs[j].getAttribute('src') || '') && fs[j].offsetParent !== null) gameFrame = true; } } catch (e) {}
    return { pageId: id, connections: conns, gameListeners: games, frames: frames, gameFrame: gameFrame, path: location.pathname };
  } catch (e) { return null; }
})()`;

/**
 * @param {object|null} snap لقطة PROBE_SOURCE
 * @returns {{idle:boolean, reason:string}}
 */
function classify(snap) {
  if (!snap || typeof snap !== 'object') return { idle: false, reason: 'unknown' };
  if (snap.connections > 0) return { idle: false, reason: 'live-connection' };
  if (snap.gameListeners > 0) return { idle: false, reason: 'game-listeners' };
  if (snap.gameFrame) return { idle: false, reason: 'game-frame' };
  if (snap.path && snap.path !== '/' && !/^\/(index\.html)?$/.test(snap.path)) return { idle: false, reason: 'standalone-page' };
  if (!snap.pageId) return { idle: false, reason: 'no-page' };
  if (!IDLE_PAGE_IDS.has(snap.pageId)) return { idle: false, reason: 'page:' + snap.pageId };
  return { idle: true, reason: 'idle' };
}

module.exports = { PROBE_SOURCE, IDLE_PAGE_IDS, classify };
