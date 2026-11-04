'use strict';

/**
 * روابط عميقة آمنة للإشعارات: لا نقبل إلا وجهات من قائمة بيضاء داخل التطبيق.
 * الإشعار يحمل `target` (اسم وجهة) لا URL حر، فلا يمكن لمصدر إشعار توجيه
 * النافذة لمكان خارجي.
 */
const TARGETS = Object.freeze({
  home: 'pg-home',
  store: 'pg-home',
  profile: 'pg-profile',
  levels: 'pg-levels',
  leaderboard: 'pg-leaderboard',
  frames: 'pg-frames',
});

function resolveTarget(target) {
  return Object.prototype.hasOwnProperty.call(TARGETS, target) ? TARGETS[target] : 'pg-home';
}

/** كود يُنفَّذ بالصفحة للانتقال (فقط لصفحات خاملة معروفة، وبعد وجود show()). */
function navigationScript(target) {
  const id = resolveTarget(target).replace(/^pg-/, '');
  return `(function(){try{if(typeof show==='function'){show(${JSON.stringify(id)});return true;}}catch(e){}return false;})()`;
}

module.exports = { TARGETS, resolveTarget, navigationScript };
