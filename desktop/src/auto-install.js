'use strict';

/**
 * قرار تثبيت تحديث التطبيق (EXE) تلقائياً بعد تنزيله، بدون أن يضطر المستخدم لتحميل شيء:
 *  - لا نقطع أبداً جولة/بثاً: لازم تكون الصفحة خاملة (safe-point).
 *  - لا نفاجئ مستخدماً يتفاعل: النافذة مخفية/مصغّرة/غير مركّزة، أو خاملة طويلاً.
 *  - ونفضّل التثبيت الصامت عند إغلاق التطبيق (autoInstallOnAppQuit) دائماً.
 */
const MIN_UPTIME_MS = 60 * 1000;      // لا نعيد التشغيل بأول دقيقة من الإقلاع
const IDLE_FOCUSED_MS = 10 * 60 * 1000; // نافذة مفتوحة ومركّزة لكن خاملة (بلا جولة) هذه المدة

/**
 * @param {{ready:boolean, idle:boolean, win:{visible:boolean, focused:boolean, minimized:boolean}, uptimeMs:number, idleSinceMs:number}} c
 * @returns {{install:boolean, reason:string}}
 */
function shouldInstallNow(c) {
  if (!c.ready) return { install: false, reason: 'not-ready' };
  if (c.uptimeMs < MIN_UPTIME_MS) return { install: false, reason: 'just-started' };
  if (!c.idle) return { install: false, reason: 'busy' };
  if (!c.win.visible || c.win.minimized || !c.win.focused) return { install: true, reason: 'user-away' };
  if (c.idleSinceMs >= IDLE_FOCUSED_MS) return { install: true, reason: 'long-idle' };
  return { install: false, reason: 'user-present' };
}

module.exports = { shouldInstallNow, MIN_UPTIME_MS, IDLE_FOCUSED_MS };
