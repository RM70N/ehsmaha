'use strict';

/**
 * preload آمن (contextIsolation: true, sandbox: true). صغير عمداً:
 *  1) يكشف واجهة اختيارية محدودة للموقع (`ehsmahaDesktop`) — الموقع لا يعتمد عليها.
 *  2) يعرض طبقة تنبيهات داخل التطبيق (Shadow DOM مغلق) — بلا أي إعادة تحميل تلقائي للصفحة.
 *  3) يمرّر أحداث الإشعارات الموثوقة من جسر الصفحة إلى العملية الرئيسية للتحقق منها.
 *  4) واجهة الإعدادات `ehsmahaSettings` تُكشف فقط لصفحة الإعدادات المحلية (file://).
 * لا يعدّل أي منطق من الموقع ولا اتصاله بـFirebase، ولا يُمرِّر أي توكن.
 */

const { contextBridge, ipcRenderer } = require('electron');

const isSettingsPage = location.protocol === 'file:' && /\/renderer\/settings\.html$/.test(location.pathname);
const isLocalApp = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';

const api = {
  isDesktopApp: true,
  getInfo: () => ipcRenderer.invoke('ehsmaha:info'),
  openExternal: (url) => ipcRenderer.invoke('ehsmaha:open-external', String(url || '')),
  onStatus: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on('ehsmaha:status', listener);
    return () => ipcRenderer.removeListener('ehsmaha:status', listener);
  },
};
if (location.protocol === 'file:' && /\/renderer\/offline\.html$/.test(location.pathname)) {
  api.retry = () => ipcRenderer.invoke('ehsmaha:retry');
}
try { contextBridge.exposeInMainWorld('ehsmahaDesktop', api); } catch (e) { /* */ }

const isLoginPage = location.protocol === 'file:' && /\/renderer\/login\.html$/.test(location.pathname);
if (isLoginPage) {
  try {
    contextBridge.exposeInMainWorld('ehsmahaLogin', {
      google: () => ipcRenderer.invoke('login:google'),
      requestCode: (u) => ipcRenderer.invoke('login:request-code', String(u || '').slice(0, 64)),
      openLinkPage: () => ipcRenderer.invoke('login:open-link-page'),
      redeem: (code) => ipcRenderer.invoke('login:redeem', String(code || '').slice(0, 32)),
    });
  } catch (e) { /* */ }
}

if (isSettingsPage) {
  const call = (ch, arg) => ipcRenderer.invoke(ch, arg);
  try {
    contextBridge.exposeInMainWorld('ehsmahaSettings', {
      get: () => call('settings:get'),
      set: (patch) => call('settings:set', patch),
      checkAppUpdate: () => call('settings:check-app-update'),
      installAppUpdate: () => call('settings:install-app-update'),
      syncContent: () => call('settings:sync-content'),
      applyContent: () => call('settings:apply-content'),
      testNotification: () => call('settings:test-notification'),
      copyDiagnostics: () => call('settings:copy-diagnostics'),
      openLogs: () => call('settings:open-logs'),
      toggleFullscreen: () => call('settings:fullscreen'),
      onChange: (fn) => { const l = (_e, p) => fn(p); ipcRenderer.on('settings:changed', l); return () => ipcRenderer.removeListener('settings:changed', l); },
    });
  } catch (e) { /* */ }
}

/* ---------------------------------------------------- الإشعارات (من الصفحة) */

if (!isSettingsPage && !isLoginPage && location.protocol !== 'file:') {
  document.addEventListener('ehsmaha-desktop-event', (e) => {
    const d = e && e.detail;
    if (!d || typeof d !== 'object') return;
    // ننسخ حقولاً نصية/رقمية معروفة فقط؛ التحقق الحقيقي بالعملية الرئيسية.
    ipcRenderer.send('ehsmaha:page-event', {
      kind: String(d.kind || '').slice(0, 24), id: String(d.id || '').slice(0, 160),
      title: String(d.title || '').slice(0, 120), body: String(d.body || '').slice(0, 300),
      target: String(d.target || '').slice(0, 24), sentAt: Number(d.sentAt) || 0,
    });
  }, false);
}

/* ------------------------------------------------- طبقة التنبيهات داخل التطبيق */

const HOST_ID = '__ehsmaha-desktop-layer';
let shadow = null;
let toastWrap = null;

const STYLES = `
  :host { all: initial; }
  .wrap { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, sans-serif; direction: rtl; }
  .toasts { position: absolute; inset-inline-start: 18px; bottom: 18px; display: flex; flex-direction: column; gap: 10px; }
  .toast { pointer-events: auto; min-width: 260px; max-width: 400px; background: #170B2D; color: #F8F7FC;
    border: 1px solid rgba(167,139,250,.35); border-inline-start: 4px solid #7C3AED; border-radius: 12px;
    padding: 12px 14px; font-size: 14px; line-height: 1.7; box-shadow: 0 12px 34px rgba(0,0,0,.5);
    display: flex; gap: 12px; align-items: center; animation: rise .22s ease-out; }
  .toast.error { border-inline-start-color: #ef4444; }
  .toast.success { border-inline-start-color: #22c55e; }
  .toast .msg { flex: 1; }
  .toast button { pointer-events: auto; cursor: pointer; border: 0; border-radius: 8px; padding: 7px 12px;
    font-size: 13px; font-weight: 600; color: #F8F7FC; background: #5B21B6; font-family: inherit; }
  .toast button:hover { background: #7C3AED; }
  .toast .x { background: transparent; color: #A78BFA; padding: 4px 8px; font-size: 18px; line-height: 1; }
  @keyframes rise { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none } }
`;

function ensureLayer() {
  if (shadow || !document.body) return shadow;
  const host = document.createElement('div');
  host.id = HOST_ID;
  shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = STYLES;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  toastWrap = document.createElement('div');
  toastWrap.className = 'toasts';
  toastWrap.setAttribute('role', 'status');
  toastWrap.setAttribute('aria-live', 'polite');
  wrap.appendChild(toastWrap);
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.body.appendChild(host);
  return shadow;
}

const shownKeys = new Map();
function showToast({ message, kind, action, key, timeout }) {
  if (!ensureLayer()) return;
  if (key && shownKeys.has(key)) { try { shownKeys.get(key).remove(); } catch (e) { /* */ } }
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'error' ? 'error' : kind === 'success' ? 'success' : '');
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = String(message || '').slice(0, 300); // نص خام — لا HTML
  el.appendChild(msg);
  if (action && action.id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = String(action.label || '').slice(0, 40);
    b.addEventListener('click', () => { ipcRenderer.send('ehsmaha:toast-action', String(action.id)); el.remove(); });
    el.appendChild(b);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'إغلاق'); x.textContent = '×';
  x.addEventListener('click', () => el.remove());
  el.appendChild(x);
  toastWrap.appendChild(el);
  if (key) shownKeys.set(key, el);
  if (timeout !== 0) setTimeout(() => el.remove(), timeout || 9000);
}

ipcRenderer.on('ehsmaha:status', (_e, p) => {
  if (!p || p.type !== 'toast') return;
  showToast({ message: p.message, kind: p.kind, action: p.action, key: p.key, timeout: p.timeout });
});

// انقطاع/عودة الاتصال: إشعار فقط — لا إعادة تحميل (قد تقطع جولة نشطة).
if (isLocalApp && location.protocol !== 'file:') {
  window.addEventListener('offline', () => showToast({ message: 'انقطع الاتصال بالإنترنت. اللعبة الحالية تكمل لحين رجوعه.', kind: 'error', key: 'net', timeout: 8000 }));
  window.addEventListener('online', () => showToast({ message: 'رجع الاتصال بالإنترنت.', kind: 'success', key: 'net', timeout: 5000 }));
}

window.addEventListener('DOMContentLoaded', () => { if (location.protocol !== 'file:') ensureLayer(); });
