/* EHSMAHA — كتالوج صلاحيات الأدمن (مصدر واحد للواجهة وللاختبارات).
 *
 * الحقيقة الأمنية النهائية في قواعد Firestore / Realtime Database (firestore.rules + database.rules.json)،
 * وهذا الملف يعرّف الأسماء والمجموعات والتبعيات فقط. اختبار القواعد يتحقق أن كل مفتاح هنا مُستخدَم في القواعد
 * وأن كل مفتاح في القواعد معرَّف هنا.
 *
 * التخزين: مفاتيح RTDB/Firestore لا تحتمل النقطة، فالمفتاح المنطقي `admin.streams.view` يُخزَّن `admin_streams_view`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EhsAdminPerms = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GROUPS = [
    { id: 'streams', title: 'البثوث', keys: ['admin.streams.view', 'admin.streams.open_link', 'admin.sessions.details'] },
    { id: 'sessions', title: 'الجلسات', keys: ['admin.sessions.observe', 'admin.rounds.view'] },
    { id: 'connection', title: 'الاتصال', keys: ['admin.connections.view', 'admin.connections.test'] },
    { id: 'frames', title: 'الإطارات', keys: ['admin.frames.view', 'admin.frames.grant', 'admin.frames.redeem_code', 'admin.frames.history'] }
  ];

  var PERMS = {
    'admin.dashboard.view': { title: 'فتح لوحة الأدمن', sensitive: false, needs: [] },
    'admin.streams.view': { title: 'مشاهدة الجلسات الحية', sensitive: false, needs: ['admin.dashboard.view'] },
    'admin.streams.open_link': { title: 'الانتقال إلى البث', sensitive: false, needs: ['admin.streams.view'] },
    'admin.sessions.details': { title: 'تفاصيل الجلسة', sensitive: false, needs: ['admin.streams.view'] },
    'admin.sessions.observe': { title: 'الدخول كمراقب', sensitive: true, needs: ['admin.sessions.details'] },
    'admin.rounds.view': { title: 'مشاهدة نتائج الجولات', sensitive: false, needs: ['admin.dashboard.view'] },
    'admin.connections.view': { title: 'مراقبة اتصال الستريمر', sensitive: false, needs: ['admin.dashboard.view'] },
    'admin.connections.test': { title: 'اختبار اتصال البث', sensitive: true, needs: ['admin.connections.view'] },
    'admin.frames.view': { title: 'مشاهدة الإطارات', sensitive: false, needs: ['admin.dashboard.view'] },
    'admin.frames.grant': { title: 'منح إطار مباشر', sensitive: true, needs: ['admin.frames.view'] },
    'admin.frames.redeem_code': { title: 'منح باستخدام كود', sensitive: true, needs: ['admin.frames.view'] },
    'admin.frames.history': { title: 'سجل المنح الخاص به', sensitive: false, needs: ['admin.frames.view'] }
  };

  var KEYS = Object.keys(PERMS);
  function toStore(k) { return String(k).replace(/\./g, '_'); }
  var STORE_KEYS = KEYS.map(toStore);
  var BACK = {}; KEYS.forEach(function (k) { BACK[toStore(k)] = k; });
  function fromStore(k) { return BACK[k] || null; }

  /** كل التبعيات (المتعدّية) لمجموعة مفاتيح. */
  function closure(keys) {
    var out = {}; var stack = keys.slice();
    while (stack.length) { var k = stack.pop(); if (!PERMS[k] || out[k]) continue; out[k] = true; PERMS[k].needs.forEach(function (n) { stack.push(n); }); }
    return Object.keys(out);
  }
  /** التبعيات الناقصة: لكل مفتاح مفعَّل، ما يحتاجه ولم يُفعَّل. */
  function missingDeps(enabled) {
    var set = {}; enabled.forEach(function (k) { set[k] = true; }); var out = {};
    enabled.forEach(function (k) { (PERMS[k] ? PERMS[k].needs : []).forEach(function (n) { if (!set[n]) { (out[k] = out[k] || []).push(n); } }); });
    return out;
  }
  /** من خريطة مخزَّنة {admin_x:true} إلى قائمة مفاتيح منطقية (المعرّفة فقط). */
  function enabledFromStore(map) {
    var out = []; map = map || {};
    KEYS.forEach(function (k) { if (map[toStore(k)] === true) out.push(k); });
    return out;
  }
  function toStoreMap(keys) { var m = {}; keys.forEach(function (k) { if (PERMS[k]) m[toStore(k)] = true; }); return m; }
  /** سجل مخزَّن صالح ليكون «نشطاً» مع صلاحية معيّنة (نفس منطق القواعد). */
  function has(rec, key) {
    return !!(rec && rec.status === 'active' && rec.permissions && rec.permissions[toStore(key)] === true);
  }
  function framesAllowed(rec) {
    var s = rec && rec.frameGrantScope; if (!s || s.mode !== 'allowlist') return [];
    var f = s.frameIds; if (Array.isArray(f)) return f.slice();
    return f && typeof f === 'object' ? Object.keys(f).filter(function (k) { return f[k] === true; }) : [];
  }

  return { GROUPS: GROUPS, PERMS: PERMS, KEYS: KEYS, STORE_KEYS: STORE_KEYS, toStore: toStore, fromStore: fromStore, closure: closure,
    missingDeps: missingDeps, enabledFromStore: enabledFromStore, toStoreMap: toStoreMap, has: has, framesAllowed: framesAllowed };
});
