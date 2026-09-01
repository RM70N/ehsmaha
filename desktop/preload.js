'use strict';

/**
 * preload آمن (contextIsolation: true, sandbox: true).
 *
 * يفعل شيئين فقط:
 *  1) يكشف واجهة صغيرة للموقع (اختيارية تماماً — الموقع لا يعتمد عليها).
 *  2) يضيف طبقة تطبيق فوق الصفحة (تنبيه انقطاع الإنترنت + إشعار التحديثات)
 *     داخل Shadow DOM بمعرّف خاص، فلا تتداخل مع أي CSS أو JS في الموقع.
 *
 * لا يعدّل هذا الملف أي شيء من منطق الموقع أو اتصاله بـ Firebase.
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  isDesktopApp: true,
  getInfo: () => ipcRenderer.invoke('ehsmaha:info'),
  checkNetwork: () => ipcRenderer.invoke('ehsmaha:check-network'),
  reload: () => ipcRenderer.invoke('ehsmaha:reload'),
  restart: () => ipcRenderer.invoke('ehsmaha:restart'),
  openExternal: (url) => ipcRenderer.invoke('ehsmaha:open-external', url),
  checkForUpdates: () => ipcRenderer.invoke('ehsmaha:check-updates'),
  googleSignIn: () => ipcRenderer.invoke('ehsmaha:google-sign-in'),
  onStatus: (handler) => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('ehsmaha:status', listener);
    return () => ipcRenderer.removeListener('ehsmaha:status', listener);
  },
};

try {
  contextBridge.exposeInMainWorld('ehsmahaDesktop', api);
} catch (e) { /* لو تكرر الحقن لأي سبب */ }

/* ------------------------------------------------- طبقة التطبيق فوق الصفحة */

const HOST_ID = '__ehsmaha-desktop-layer';
let shadow = null;
let offlineEl = null;
let toastWrap = null;
let retryTimer = null;

const STYLES = `
  :host { all: initial; }
  .wrap {
    position: fixed; inset: 0; pointer-events: none; z-index: 2147483000;
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, sans-serif;
    direction: rtl;
  }
  .offline {
    position: absolute; inset: 0; display: none; pointer-events: auto;
    align-items: center; justify-content: center; text-align: center;
    background: radial-gradient(circle at 50% 30%, #1a0b33 0%, #0b0518 70%);
    color: #f4ecff;
  }
  .offline.show { display: flex; }
  .card { max-width: 460px; padding: 34px 30px; }
  .icon { font-size: 54px; line-height: 1; margin-bottom: 14px; }
  .title { font-size: 22px; font-weight: 800; margin: 0 0 10px; }
  .desc { font-size: 15px; opacity: .8; margin: 0 0 22px; line-height: 1.9; }
  .btn {
    appearance: none; border: 0; cursor: pointer; border-radius: 12px;
    padding: 11px 26px; font-size: 15px; font-weight: 700; color: #fff;
    background: linear-gradient(135deg, #7c3aed, #c026d3);
  }
  .btn:hover { filter: brightness(1.1); }
  .dots { margin-top: 16px; font-size: 13px; opacity: .6; }
  .toasts {
    position: absolute; inset-inline-start: 18px; bottom: 18px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .toast {
    pointer-events: auto; min-width: 260px; max-width: 380px;
    background: rgba(20, 10, 38, .96); color: #f4ecff;
    border: 1px solid rgba(168, 85, 247, .38); border-radius: 14px;
    padding: 13px 16px; font-size: 14px; line-height: 1.7;
    box-shadow: 0 12px 34px rgba(0,0,0,.5);
    display: flex; gap: 10px; align-items: flex-start;
    animation: rise .25s ease-out;
  }
  .toast b { font-weight: 800; }
  .toast .x {
    margin-inline-start: auto; cursor: pointer; opacity: .55;
    background: none; border: 0; color: inherit; font-size: 16px; line-height: 1;
  }
  .toast .x:hover { opacity: 1; }
  @keyframes rise { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
`;

function ensureLayer() {
  if (shadow || !document.body) return shadow;
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-ehsmaha-desktop', '1');
  shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = STYLES;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  offlineEl = document.createElement('div');
  offlineEl.className = 'offline';
  offlineEl.innerHTML = `
    <div class="card">
      <div class="icon">📡</div>
      <p class="title">لا يوجد اتصال بالإنترنت</p>
      <p class="desc">تطبيق احسمها يحتاج اتصالاً بالإنترنت عشان يتواصل مع السيرفر والألعاب المباشرة.<br>نحاول إعادة الاتصال تلقائياً...</p>
      <button class="btn" type="button">إعادة المحاولة الآن</button>
      <div class="dots">جارِ المحاولة كل ٥ ثوانٍ</div>
    </div>`;
  offlineEl.querySelector('.btn').addEventListener('click', () => { checkAndMaybeReload(true); });

  toastWrap = document.createElement('div');
  toastWrap.className = 'toasts';

  wrap.appendChild(offlineEl);
  wrap.appendChild(toastWrap);
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.body.appendChild(host);
  return shadow;
}

function showToast(html, timeout) {
  if (!ensureLayer()) return;
  const el = document.createElement('div');
  el.className = 'toast';
  const body = document.createElement('div');
  body.innerHTML = html;
  const close = document.createElement('button');
  close.className = 'x';
  close.type = 'button';
  close.textContent = '✕';
  close.addEventListener('click', () => el.remove());
  el.appendChild(body);
  el.appendChild(close);
  toastWrap.appendChild(el);
  if (timeout !== 0) setTimeout(() => el.remove(), timeout || 9000);
  return el;
}

function setOffline(isOffline) {
  if (!ensureLayer()) return;
  offlineEl.classList.toggle('show', !!isOffline);
  if (isOffline) startRetryLoop();
  else clearInterval(retryTimer);
}

function startRetryLoop() {
  clearInterval(retryTimer);
  retryTimer = setInterval(() => checkAndMaybeReload(false), 5000);
}

async function checkAndMaybeReload(force) {
  let reachable = navigator.onLine;
  if (reachable) {
    try { reachable = await api.checkNetwork(); } catch (e) { /* نتعامل معه كأنه غير متصل */ }
  }
  if (reachable) {
    setOffline(false);
    // الاتصال رجع: نحدّث الصفحة عشان Firebase يعيد الاشتراكات من نقطة نظيفة.
    api.reload();
  } else if (force) {
    setOffline(true);
  }
}

window.addEventListener('offline', () => setOffline(true));
window.addEventListener('online', () => checkAndMaybeReload(false));

api.onStatus((payload) => {
  if (!payload || !payload.type) return;
  if (payload.type === 'content-updated') {
    showToast('<b>تم تحديث محتوى احسمها</b><br>أعد تشغيل التطبيق عشان تشوف آخر نسخة من الموقع.', 14000);
  } else if (payload.type === 'app-update-downloading') {
    showToast('<b>تحديث جديد للتطبيق (' + payload.version + ')</b><br>جارِ التنزيل بالخلفية...', 8000);
  } else if (payload.type === 'app-update-ready') {
    showToast('<b>التحديث جاهز</b><br>أعد تشغيل التطبيق لتطبيق النسخة ' + payload.version + '.', 0);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  ensureLayer();
  if (!navigator.onLine) setOffline(true);
});
