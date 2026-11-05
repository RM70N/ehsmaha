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
  openLogin: () => ipcRenderer.send('ehsmaha:open-login'),
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
      requestCode: (u) => ipcRenderer.invoke('login:request-code', String(u || '').slice(0, 254)),
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
  .wrap { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; direction: rtl;
    font-family: "Segoe UI", Tahoma, "Noto Sans Arabic", system-ui, sans-serif; }
  .toasts { position: absolute; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; gap: 12px;
    align-items: center; width: min(520px, calc(100vw - 32px)); }
  .toasts.top { top: 22px; }
  .toasts.center { top: 50%; transform: translate(-50%, -50%); }
  .toasts.bottom { bottom: 26px; }
  .toast { --accent: #A78BFA; --accent2: #7C3AED; position: relative; pointer-events: auto; width: 100%; overflow: hidden;
    display: flex; align-items: center; gap: 14px; padding: 16px 18px 20px; border-radius: 18px; color: #F8F7FC;
    background: linear-gradient(135deg, rgba(36,18,72,.94), rgba(18,9,38,.96));
    -webkit-backdrop-filter: blur(18px) saturate(140%); backdrop-filter: blur(18px) saturate(140%);
    box-shadow: 0 0 0 1px rgba(167,139,250,.28), 0 18px 50px rgba(8,3,22,.65), 0 0 38px -8px var(--accent2);
    animation: in .46s cubic-bezier(.2,.9,.25,1.15) both; }
  .toasts.bottom .toast { animation-name: inUp; }
  .toast.out { animation: out .26s ease-in both !important; }
  .toast::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1px; pointer-events: none;
    background: linear-gradient(120deg, var(--accent), transparent 38%, transparent 62%, #F5C451);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; opacity: .8; }
  .toast::after { content: ""; position: absolute; top: 0; bottom: 0; width: 38%; left: -50%; pointer-events: none;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,.14), transparent); transform: skewX(-18deg);
    animation: shine 1.1s .35s ease-out 1 both; }
  .toast.error { --accent: #F87171; --accent2: #DC2626; }
  .toast.success { --accent: #4ADE80; --accent2: #16A34A; }
  .toast.owner { --accent: #F5C451; --accent2: #7C3AED; }
  .ic { flex: none; width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; color: #fff;
    background: linear-gradient(145deg, var(--accent2), var(--accent)); box-shadow: 0 6px 18px -4px var(--accent2), inset 0 1px 0 rgba(255,255,255,.35);
    animation: ring 1.2s .45s ease-in-out 1 both; }
  .ic svg { width: 24px; height: 24px; }
  .body { flex: 1; min-width: 0; }
  .t { font-size: 15.5px; font-weight: 800; line-height: 1.5; }
  .d { margin-top: 2px; font-size: 13.5px; line-height: 1.75; color: #D9CEFA; overflow-wrap: anywhere; }
  .brand { display: block; margin-bottom: 1px; font-size: 11px; font-weight: 700; letter-spacing: .6px; color: var(--accent); }
  .act { pointer-events: auto; cursor: pointer; border: 0; border-radius: 11px; padding: 9px 16px; font-size: 13px; font-weight: 700; font-family: inherit;
    color: #1a0b33; background: linear-gradient(135deg, #F5C451, #FBE19A); box-shadow: 0 4px 14px -4px rgba(245,196,81,.7); transition: transform .15s, filter .15s; }
  .act:hover { transform: translateY(-1px); filter: brightness(1.06); } .act:active { transform: scale(.97); }
  .x { flex: none; pointer-events: auto; cursor: pointer; width: 30px; height: 30px; border: 0; border-radius: 9px; display: grid; place-items: center;
    background: rgba(255,255,255,.07); color: #C4B5FD; font-size: 18px; line-height: 1; font-family: inherit; transition: background .15s, color .15s; }
  .x:hover { background: rgba(255,255,255,.16); color: #fff; }
  .act:focus-visible, .x:focus-visible { outline: 2px solid #F5C451; outline-offset: 2px; }
  .bar { position: absolute; inset-inline: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.08); }
  .bar i { display: block; height: 100%; transform-origin: right center; background: linear-gradient(270deg, var(--accent), var(--accent2));
    animation: drain linear forwards; animation-duration: var(--dur, 9s); }
  .toast:hover .bar i { animation-play-state: paused; }
  @keyframes in { from { transform: translateY(-34px) scale(.94); opacity: 0; filter: blur(6px) } to { transform: none; opacity: 1; filter: none } }
  @keyframes inUp { from { transform: translateY(34px) scale(.94); opacity: 0; filter: blur(6px) } to { transform: none; opacity: 1; filter: none } }
  @keyframes inPop { from { transform: scale(.82); opacity: 0; filter: blur(8px) } to { transform: none; opacity: 1; filter: none } }
  @keyframes out { to { transform: translateY(-14px) scale(.96); opacity: 0 } }
  @keyframes shine { from { left: -50% } to { left: 130% } }
  @keyframes ring { 0%,100% { transform: rotate(0) } 20% { transform: rotate(-14deg) } 40% { transform: rotate(11deg) } 60% { transform: rotate(-7deg) } 80% { transform: rotate(4deg) } }
  @keyframes drain { from { transform: scaleX(1) } to { transform: scaleX(0) } }

  /* ===== منتصف الشاشة: بطاقة إعلان عمودية بخلفية معتمة — تصميم مستقل كلياً عن شريط الأعلى ===== */
  .scrim { position: absolute; inset: 0; opacity: 0; transition: opacity .35s ease;
    background: radial-gradient(ellipse at center, rgba(40,16,86,.55), rgba(5,2,14,.82) 70%); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); }
  .wrap.c .scrim { opacity: 1; }
  .toasts.center { width: min(430px, calc(100vw - 40px)); }
  .center .toast { flex-direction: column; text-align: center; gap: 14px; padding: 44px 30px 34px; border-radius: 30px;
    background: radial-gradient(120% 80% at 50% 0%, rgba(124,58,237,.5), transparent 60%), linear-gradient(180deg, #1c0d3a, #0f0722);
    box-shadow: 0 0 0 1px rgba(245,196,81,.35), 0 30px 80px rgba(0,0,0,.7), 0 0 90px -10px var(--accent2);
    animation: pop .65s cubic-bezier(.17,1.2,.3,1) both; }
  .center .toast::before { background: linear-gradient(180deg, #F5C451, transparent 45%, transparent 70%, var(--accent)); opacity: .9; }
  .center .toast::after { width: 60%; animation-delay: .5s; }
  .center .ic { position: relative; width: 84px; height: 84px; border-radius: 50%; margin: -6px 0 14px;
    background: radial-gradient(circle at 30% 25%, #FBE19A, #F5C451 45%, #C98A12); color: #2a1450;
    box-shadow: 0 10px 30px -6px rgba(245,196,81,.7), inset 0 2px 0 rgba(255,255,255,.6); animation: ring 1.2s .7s ease-in-out 1 both; }
  .center .ic::before, .center .ic::after { content: ""; position: absolute; inset: -2px; border-radius: 50%; border: 2px solid rgba(245,196,81,.55); animation: pulse 2.4s ease-out infinite; }
  .center .ic::after { animation-delay: 1.2s; }
  .center .toast.error .ic { background: radial-gradient(circle at 30% 25%, #fecaca, #F87171 50%, #B91C1C); color: #fff; }
  .center .toast.success .ic { background: radial-gradient(circle at 30% 25%, #bbf7d0, #4ADE80 50%, #15803D); color: #052e16; }
  .center .ic svg { width: 40px; height: 40px; }
  .center .body { width: 100%; }
  .center .brand { font-size: 12px; letter-spacing: 3px; margin-bottom: 6px; }
  .center .t { font-size: 24px; line-height: 1.4; background: linear-gradient(180deg, #fff, #E9DEFF); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .center .d { margin-top: 8px; font-size: 16px; line-height: 1.85; color: #CFC2F5; }
  .center .act { width: 100%; padding: 13px 18px; font-size: 15px; border-radius: 16px; margin-top: 4px; }
  .center .x { position: absolute; top: 14px; inset-inline-start: 14px; }
  .center .bar { height: 4px; }
  @keyframes pop { 0% { transform: scale(.6) translateY(30px); opacity: 0; filter: blur(10px) } 100% { transform: none; opacity: 1; filter: none } }
  @keyframes pulse { from { transform: scale(1); opacity: .9 } to { transform: scale(1.7); opacity: 0 } }
  @media (prefers-reduced-motion: reduce) { .toast, .ic::before, .ic::after, .toast::after, .ic, .bar i { animation: none !important } }
`;

const ICONS = {
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
};
let toastPos = 'top';
const POS = ['top', 'center', 'bottom'];

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
  toastWrap.className = 'toasts top';
  toastWrap.setAttribute('role', 'status');
  toastWrap.setAttribute('aria-live', 'polite');
  const scrim = document.createElement('div'); scrim.className = 'scrim'; wrap.appendChild(scrim);
  wrap.appendChild(toastWrap);
  new MutationObserver(() => wrap.classList.toggle('c', toastPos === 'center' && toastWrap.children.length > 0)).observe(toastWrap, { childList: true });
  shadow.appendChild(style);
  shadow.appendChild(wrap);
  document.body.appendChild(host);
  return shadow;
}

const shownKeys = new Map();
function dismiss(el) {
  if (!el || el.__gone) return; el.__gone = true;
  el.classList.add('out');
  setTimeout(() => { try { el.remove(); } catch (e) { /* */ } }, 260);
}
function showToast({ message, kind, action, key, timeout, title, body, variant, position }) {
  if (!ensureLayer()) return;
  if (POS.includes(position)) toastPos = position;
  toastWrap.className = 'toasts ' + toastPos;
  if (key && shownKeys.has(key)) { try { shownKeys.get(key).remove(); } catch (e) { /* */ } }
  const k = kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + (k === 'info' ? (variant === 'owner' ? 'owner' : '') : k);
  const ic = document.createElement('div');
  ic.className = 'ic'; ic.innerHTML = ICONS[k]; // ثوابت داخلية فقط
  el.appendChild(ic);
  const bd = document.createElement('div'); bd.className = 'body';
  const hasTitle = typeof title === 'string' && title.trim();
  if (variant === 'owner') { const br = document.createElement('span'); br.className = 'brand'; br.textContent = 'احسمها'; bd.appendChild(br); }
  const t = document.createElement('div'); t.className = hasTitle ? 't' : 'd';
  t.textContent = String(hasTitle ? title : message || '').slice(0, 200); // نص خام — لا HTML
  if (!hasTitle) t.style.color = '#F3EEFF';
  bd.appendChild(t);
  if (hasTitle && body) { const d = document.createElement('div'); d.className = 'd'; d.textContent = String(body).slice(0, 300); bd.appendChild(d); }
  el.appendChild(bd);
  if (action && action.id) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'act';
    b.textContent = String(action.label || '').slice(0, 40);
    b.addEventListener('click', () => { ipcRenderer.send('ehsmaha:toast-action', String(action.id)); dismiss(el); });
    el.appendChild(b);
  }
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'إغلاق'); x.textContent = '×';
  x.addEventListener('click', () => dismiss(el));
  el.appendChild(x);
  const ms = timeout === 0 ? 0 : (timeout || 9000);
  if (ms) {
    const bar = document.createElement('div'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.setProperty('--dur', ms + 'ms'); bar.appendChild(fill); el.appendChild(bar);
    fill.addEventListener('animationend', () => dismiss(el));
  }
  toastWrap.appendChild(el);
  if (key) shownKeys.set(key, el);
}

ipcRenderer.on('ehsmaha:status', (_e, p) => {
  if (p && p.type === 'flags' && document.documentElement) { document.documentElement.setAttribute('data-ehs-code-login', p.codeLogin === false ? '0' : '1'); if (POS.includes(p.toastPosition)) { toastPos = p.toastPosition; document.documentElement.setAttribute('data-ehs-toastpos', toastPos); if (toastWrap) toastWrap.className = 'toasts ' + toastPos; } if (typeof p.nativeLink === 'boolean') document.documentElement.setAttribute('data-ehs-native', p.nativeLink ? '1' : '0'); return; }
  if (!p || p.type !== 'toast') return;
  showToast({ message: p.message, kind: p.kind, action: p.action, key: p.key, timeout: p.timeout, title: p.title, body: p.body, variant: p.variant, position: p.position });
});

// انقطاع/عودة الاتصال: إشعار فقط — لا إعادة تحميل (قد تقطع جولة نشطة).
if (isLocalApp && location.protocol !== 'file:') {
  window.addEventListener('offline', () => showToast({ message: 'انقطع الاتصال بالإنترنت. اللعبة الحالية تكمل لحين رجوعه.', kind: 'error', key: 'net', timeout: 8000 }));
  window.addEventListener('online', () => showToast({ message: 'رجع الاتصال بالإنترنت.', kind: 'success', key: 'net', timeout: 5000 }));
}

// واجهة التطبيق الإضافية (زر الدخول برمز احسمها...) تأتي من ملف الموقع /desktop-app-ui.js فتتحدث بتحديث المحتوى
// بدون إصدار جديد. نحمّله من أصل التطبيق فقط.
if (isLocalApp && location.protocol !== 'file:') {
  window.addEventListener('DOMContentLoaded', () => {
    const sc = document.createElement('script');
    sc.src = '/desktop-app-ui.js'; sc.async = true;
    (document.head || document.documentElement).appendChild(sc);
  });
}

window.addEventListener('DOMContentLoaded', () => { if (location.protocol !== 'file:') ensureLayer(); });
