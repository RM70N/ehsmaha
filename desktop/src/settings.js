'use strict';

/** إعدادات المستخدم (محفوظة في AppState). القيم الافتراضية تتبع المواصفات. */
const DEFAULTS = Object.freeze({
  startWithWindows: false,      // معطّل افتراضياً
  closeToTray: true,            // إغلاق النافذة = تصغير إلى Tray
  zoomFactor: 1,
  notif: Object.freeze({
    enabled: true,
    sound: true,
    newGame: true,
    events: true,
    updates: true,
    account: true,
    streamer: true,
  }),
});

const NOTIF_KEYS = Object.keys(DEFAULTS.notif);

function clampZoom(z) {
  const n = Number(z);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.7, Math.round(n * 20) / 20));
}

class Settings {
  constructor(state) { this.state = state; }

  getAll() {
    const saved = this.state.get('settings', {}) || {};
    const notif = { ...DEFAULTS.notif };
    for (const k of NOTIF_KEYS) if (saved.notif && typeof saved.notif[k] === 'boolean') notif[k] = saved.notif[k];
    return {
      startWithWindows: typeof saved.startWithWindows === 'boolean' ? saved.startWithWindows : DEFAULTS.startWithWindows,
      closeToTray: typeof saved.closeToTray === 'boolean' ? saved.closeToTray : DEFAULTS.closeToTray,
      zoomFactor: clampZoom(saved.zoomFactor == null ? 1 : saved.zoomFactor),
      notif,
    };
  }

  /** يقبل patch جزئياً ويتجاهل أي مفتاح غير معروف أو بنوع خاطئ (IPC غير موثوق). */
  update(patch) {
    const cur = this.getAll();
    if (patch && typeof patch === 'object') {
      if (typeof patch.startWithWindows === 'boolean') cur.startWithWindows = patch.startWithWindows;
      if (typeof patch.closeToTray === 'boolean') cur.closeToTray = patch.closeToTray;
      if (patch.zoomFactor != null) cur.zoomFactor = clampZoom(patch.zoomFactor);
      if (patch.notif && typeof patch.notif === 'object') {
        for (const k of NOTIF_KEYS) if (typeof patch.notif[k] === 'boolean') cur.notif[k] = patch.notif[k];
      }
    }
    this.state.set('settings', cur);
    return cur;
  }
}

module.exports = { Settings, DEFAULTS, NOTIF_KEYS, clampZoom };
