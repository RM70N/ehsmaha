'use strict';

// سياق التشغيل الذي تحتاجه قناة التحكم الإدارية (العميل + الأوامر المحمّلة + الإعدادات).
// index.js يضبطه مرة وحدة بعد تحميل الأوامر؛ الخادم يقرأه وقت كل طلب (الخادم يقلع قبل عميل ديسكورد).

let ctx = null;

module.exports = {
  setContext(c) {
    ctx = c;
  },
  getContext: () => ctx,
  _reset() {
    ctx = null;
  }
};
