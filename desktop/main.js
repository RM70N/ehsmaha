'use strict';

/**
 * احسمها — تطبيق ويندوز (Electron)
 *
 * يشحن نسخة كاملة من الموقع داخله ويخدمها من سيرفر محلي ثابت الأصل (ليبقى
 * تسجيل Firebase محفوظاً)، ويزامنها مع الموقع الحيّ بمخزن إصدارات ذري مع
 * تأجيل التطبيق لما بعد الجولة. الباك اند (Firebase / جسور البث) لا يتغيّر.
 */

const {
  app, BrowserWindow, session, shell, ipcMain, nativeImage, dialog, Notification, Tray, Menu, screen, clipboard,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const E2E = process.env.EHSMAHA_E2E === '1';
if (E2E && process.env.EHSMAHA_USER_DATA) app.setPath('userData', process.env.EHSMAHA_USER_DATA);

const config = require('./src/config');
const {
  AUTH_HOSTS, APP_ID, WINDOW_TITLE, SESSION_PARTITION, BRAND_BG, PREFERRED_PORT,
} = config;
const SITE_ORIGIN = (E2E && process.env.EHSMAHA_SITE_ORIGIN) || config.SITE_ORIGIN;
const { LocalSiteServer } = require('./src/server');
const { ContentStore } = require('./src/content-store');
const { syncContent, electronFetchBuffer } = require('./src/content-sync');
const { UpdateCoordinator } = require('./src/update-coordinator');
const { PROBE_SOURCE, classify } = require('./src/safe-point');
const { initUpdater } = require('./src/updater');
const { buildAppMenu } = require('./src/menu');
const { AppState } = require('./src/state');
const { Settings } = require('./src/settings');
const { Logger } = require('./src/logger');
const { NotificationManager } = require('./src/notifications');
const { BRIDGE_SOURCE } = require('./src/page-bridge');
const { navigationScript, TARGETS } = require('./src/deeplinks');
const { AuthBridge, signInScript, SUCCESS_PAGE, FAIL_PAGE } = require('./src/auth-bridge');

const IS_DEV = !app.isPackaged || process.argv.includes('--dev');
const REMOTE_MODE = process.env.EHSMAHA_MODE === 'remote' || process.argv.includes('--remote');
const START_HIDDEN = process.argv.includes('--hidden');
const NETWORK_ERRORS = new Set([-2, -7, -21, -105, -106, -109, -118, -137, -300, -324, -501]);
const PAGE_EVENT_KINDS = new Set(['broadcast', 'new-game', 'streamer', 'personal']);

// حالة مبكرة (قبل ready): الرسوميات الآمنة تُفعَّل فقط بعد انهيارات GPU متكررة سابقة.
const earlyState = new AppState(app.getPath('userData'));
if (earlyState.get('safeGraphics', false)) app.disableHardwareAcceleration();
// نافذة مخفية/مغطاة يجب ألا تتجمّد (الجلسة تبقى حيّة بالتصغير).
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

let mainWindow = null;
let splashWindow = null;
let settingsWindow = null;
let server = null;
let store = null;
let state = null;
let settings = null;
let logger = null;
let notifications = null;
let coordinator = null;
let updater = null;
let authBridge = null;
let tray = null;
let appUrl = null;
let appOrigin = null;
let retryTimer = null;
let syncTimer = null;
let isQuitting = false;
let shownOnce = false;
let lastStagedDiff = null;
let gpuCrashes = 0;
const crashTimes = [];

function log(...a) { if (logger) logger.info('app', ...a); if (IS_DEV) console.log('[ehsmaha]', ...a); }

/* ------------------------------------------------------------------ مساعدات */

function iconPath() {
  const names = process.platform === 'win32' ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico'];
  for (const n of names) { const p = path.join(__dirname, 'build', n); if (fs.existsSync(p)) return p; }
  return null;
}
function appIcon() {
  const p = iconPath(); if (!p) return undefined;
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? undefined : img;
}

function sendStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ehsmaha:status', payload);
}
function toast(message, kind, extra) { sendStatus({ type: 'toast', message, kind: kind || 'info', ...(extra || {}) }); }

function hostOf(url) { try { return new URL(url); } catch (e) { return null; } }
function isAppUrl(url) { const u = hostOf(url); return !!(u && appOrigin && u.origin === appOrigin); }
function isAuthUrl(url) { const u = hostOf(url); return !!(u && AUTH_HOSTS.includes(u.hostname)); }

function openExternal(url) {
  const u = hostOf(String(url || ''));
  if (!u || String(url).length > 2048 || u.username || u.password) return false;
  if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'mailto:') return false;
  if (E2E) { (global.__ehsExternals = global.__ehsExternals || []).push(u.href); return true; } // لا نفتح متصفحاً حقيقياً في الاختبار
  shell.openExternal(u.href).catch(() => { /* */ });
  return true;
}

function windowState() {
  const w = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (!w) return { visible: false, focused: false, minimized: false, inTray: !!tray };
  return { visible: w.isVisible(), focused: w.isFocused(), minimized: w.isMinimized(), inTray: !w.isVisible() && !!tray };
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function probePage() {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const wc = mainWindow.webContents;
  if (wc.isLoading() || !isAppUrl(wc.getURL())) return null;
  return Promise.race([
    wc.executeJavaScript(PROBE_SOURCE, false),
    new Promise((r) => setTimeout(() => r(null), 3000)),
  ]);
}

/* -------------------------------------------------------- الأمان والجلسة */

function hardenSession(ses) {
  const allowed = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write', 'pointerLock']);
  const originOk = (url) => isAppUrl(url) || (REMOTE_MODE && /^https:\/\/(www\.)?ehsmaha\.com(\/|$)/.test(String(url)));
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const url = (details && details.requestingUrl) || (wc && wc.getURL()) || '';
    callback(allowed.has(permission) && originOk(url));
  });
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => allowed.has(permission) && originOk(requestingOrigin || (wc && wc.getURL()) || ''));
}

/* ----------------------------------------------------------- نافذة الانتظار */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 440, height: 440, frame: false, resizable: false, center: true, show: false, skipTaskbar: true,
    backgroundColor: BRAND_BG, icon: appIcon(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splashWindow.once('ready-to-show', () => { if (splashWindow) splashWindow.show(); });
  splashWindow.on('closed', () => { splashWindow = null; });
}
function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) { const w = splashWindow; splashWindow = null; try { w.close(); } catch (e) { /* */ } }
}

/* --------------------------------------------------------- النافذة الرئيسية */

function boundsOnScreen(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y + 40 < a.y + a.height && b.y + 40 > a.y - 10;
  });
}

function createMainWindow() {
  const saved = state.get('windowBounds', {});
  const useSaved = boundsOnScreen(saved);
  mainWindow = new BrowserWindow({
    width: saved.width || 1280, height: saved.height || 800,
    x: useSaved ? saved.x : undefined, y: useSaved ? saved.y : undefined,
    minWidth: 1024, minHeight: 640, show: false, title: WINDOW_TITLE,
    backgroundColor: BRAND_BG, icon: appIcon(), autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      allowRunningInsecureContent: false, spellcheck: false,
      devTools: IS_DEV || process.env.EHSMAHA_DEVTOOLS === '1',
      partition: SESSION_PARTITION,
      backgroundThrottling: false, // الألعاب المباشرة والجلسة لا تتجمّد بالتصغير
    },
  });
  if (state.get('maximized', false)) mainWindow.maximize();
  if (state.get('fullscreen', false)) mainWindow.setFullScreen(true);

  mainWindow.on('page-title-updated', (e) => { e.preventDefault(); });
  mainWindow.setTitle(WINDOW_TITLE);
  const wc = mainWindow.webContents;

  wc.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) { startGoogleLogin(); return { action: 'deny' }; }
    openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (event, url) => {
    if (isAppUrl(url) || url.startsWith('file://')) return;
    event.preventDefault();
    if (isAuthUrl(url)) startGoogleLogin(); else openExternal(url);
  });
  wc.on('will-attach-webview', (e) => e.preventDefault());

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if ((IS_DEV || process.env.EHSMAHA_DEVTOOLS === '1') && input.control && input.shift && key === 'i') { event.preventDefault(); wc.toggleDevTools(); return; }
    if (key === 'f5') { event.preventDefault(); reloadApp(); }
    if (key === 'f11') { event.preventDefault(); toggleFullscreen(); }
  });

  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (!isMain) return;
    logger.warn('load', 'did-fail-load', code, desc, String(url).split('?')[0]);
    if (String(url).startsWith('file://') || code === -3) return;
    if (NETWORK_ERRORS.has(code)) showOfflinePage();
    else if (!REMOTE_MODE) recoverFromBrokenContent();
  });

  wc.on('render-process-gone', (_e, details) => {
    logger.error('render', 'render-process-gone', details && details.reason, details && details.exitCode);
    if (!details || details.reason === 'clean-exit' || !mainWindow || mainWindow.isDestroyed()) return;
    const now = Date.now();
    crashTimes.push(now);
    while (crashTimes.length && now - crashTimes[0] > 120000) crashTimes.shift();
    if (crashTimes.length <= 2) { mainWindow.reload(); return; }
    // حلقة انهيار: إن كان المحتوى المنزَّل هو السبب نتراجع، وإلا نتوقف ونعلم المستخدم.
    if (!REMOTE_MODE && store.resolveServeDir().source === 'downloaded') { recoverFromBrokenContent(); crashTimes.length = 0; return; }
    dialog.showErrorBox('احسمها', 'توقفت الصفحة عن العمل أكثر من مرة. أغلق التطبيق وافتحه من جديد.');
  });
  wc.on('unresponsive', () => logger.warn('render', 'unresponsive'));
  wc.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 3) logger.warn('renderer', String(message).slice(0, 400), String(sourceId || '').split('/').pop() + ':' + line);
  });

  wc.on('did-finish-load', () => {
    closeSplash();
    if (isAppUrl(wc.getURL())) {
      wc.setZoomFactor(settings.getAll().zoomFactor);
      wc.executeJavaScript(BRIDGE_SOURCE, false).catch((e) => logger.warn('bridge', e && e.message));
    }
    if (coordinator) coordinator.consider().catch(() => {});
  });

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    if (START_HIDDEN) return; // التشغيل مع ويندوز: يبدأ بالـTray
    shownOnce = true;
    mainWindow.show();
  });
  setTimeout(() => { // شبكة أمان: لا نترك المستخدم أمام شاشة انتظار للأبد (مرة واحدة فقط؛ لا تُظهر نافذة أُخفيت لاحقاً بالـTray)
    if (mainWindow && !mainWindow.isDestroyed() && !shownOnce && !START_HIDDEN) { shownOnce = true; closeSplash(); mainWindow.show(); }
  }, 12000);

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    state.set('maximized', mainWindow.isMaximized());
    state.set('fullscreen', mainWindow.isFullScreen());
    if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) state.set('windowBounds', mainWindow.getNormalBounds());
  };
  mainWindow.on('resize', debounce(saveBounds, 500));
  mainWindow.on('move', debounce(saveBounds, 500));
  mainWindow.on('close', (event) => {
    saveBounds();
    if (!isQuitting && settings.getAll().closeToTray && tray) {
      event.preventDefault();
      mainWindow.hide();
      if (!state.get('trayHintShown', false)) {
        state.set('trayHintShown', true);
        notifications && notifications.NotificationClass && Notification.isSupported() &&
          new Notification({ title: 'احسمها يعمل في الخلفية', body: 'يمكنك إغلاقه نهائياً من أيقونة شريط النظام.', icon: iconPath() || undefined }).show();
      }
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(appUrl);
}

function debounce(fn, ms) { let t = null; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function toggleFullscreen() { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setFullScreen(!mainWindow.isFullScreen()); }

/* ------------------------------------------------------ الاتصال والتعافي */

function showOfflinePage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  closeSplash();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'offline.html'));
  if (!mainWindow.isVisible() && !START_HIDDEN) mainWindow.show();
  scheduleRetry();
}
function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(async () => { if (await isNetworkReachable()) reloadApp(); else scheduleRetry(); }, 5000);
}
async function isNetworkReachable() {
  const { net } = require('electron');
  if (typeof net.isOnline === 'function' && !net.isOnline()) return false;
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = net.request({ method: 'HEAD', url: SITE_ORIGIN + '/?ping=' + Date.now() });
      const timer = setTimeout(() => { try { req.abort(); } catch (e) { /* */ } finish(false); }, 8000);
      req.on('response', (res) => { clearTimeout(timer); res.resume(); finish(res.statusCode > 0); });
      req.on('error', () => { clearTimeout(timer); finish(false); });
      req.end();
    } catch (e) { finish(false); }
  });
}
function reloadApp() {
  clearTimeout(retryTimer);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const cur = mainWindow.webContents.getURL();
  if (!cur || cur.startsWith('file://')) mainWindow.loadURL(appUrl); else mainWindow.reload();
}
function recoverFromBrokenContent() {
  if (!store || REMOTE_MODE) return;
  if (store.resolveServeDir().source !== 'downloaded') return;
  logger.warn('content', 'المحتوى المنزَّل فشل بالتحميل — تراجع للإصدار السابق/المضمّن');
  const back = store.rollback('load-failed');
  if (server) server.setRootDir(back.dir);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(appUrl);
}

/* --------------------------------------------------- تحديث المحتوى الآمن */

async function reloadAndCheck() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const wc = mainWindow.webContents;
  const loaded = new Promise((resolve) => {
    const ok = () => { cleanup(); resolve(true); };
    const bad = (_e, _c, _d, _u, isMain) => { if (isMain) { cleanup(); resolve(false); } };
    const cleanup = () => { wc.removeListener('did-finish-load', ok); wc.removeListener('did-fail-load', bad); clearTimeout(t); };
    const t = setTimeout(() => { cleanup(); resolve(false); }, 25000);
    wc.once('did-finish-load', ok); wc.on('did-fail-load', bad);
  });
  wc.reloadIgnoringCache();
  if (!(await loaded)) return false;
  for (let i = 0; i < 20; i++) { // الموقع يبني الصفحة بعد التحميل؛ ننتظر صفحة نشطة (حتى ١٠ ثوانٍ)
    const snap = await probePage();
    if (snap && snap.pageId) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function runContentSync() {
  if (REMOTE_MODE || !server) return { status: 'skipped' };
  const res = await syncContent({ store, origin: SITE_ORIGIN, fetchBuffer: electronFetchBuffer(), log: (m) => log(m) });
  if (res.status === 'staged') { lastStagedDiff = res.diff; await coordinator.consider(); }
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('settings:changed', {});
  return res;
}

const GAME_FILE_RE = /^[a-z0-9][a-z0-9-]*\.html$/i;
const NON_GAME_HTML = new Set(['index.html', 'ws-diag.html', 'desktop-auth.html']);
function newGameFiles(diff) {
  return ((diff && diff.added) || []).filter((p) => GAME_FILE_RE.test(p) && !NON_GAME_HTML.has(p));
}

/* ------------------------------------------------ تسجيل الدخول بجوجل (النظام) */

function startGoogleLogin() {
  if (!server || !server.port) { toast('تسجيل الدخول بجوجل غير متاح في هذا الوضع.', 'error'); return; }
  const begin = authBridge.begin(server.port);
  if (!begin) { toast('تعذّر بدء تسجيل الدخول بجوجل (المنفذ المحلي غير مدعوم). أعد تشغيل التطبيق.', 'error'); return; }
  logger.info('auth', 'فتح تسجيل الدخول بجوجل في متصفح النظام');
  openExternal(begin.url);
  toast('أكمل تسجيل الدخول بجوجل في المتصفح، ثم ارجع هنا.', 'info', { key: 'auth', timeout: 12000 });
}

/* ---------------------------------------------------------- IPC آمن */

/** المرسل يجب أن يكون الإطار الرئيسي لصفحة التطبيق ('app') أو صفحة الإعدادات المحلية ('settings'). */
function senderKind(event) {
  try {
    const f = event.senderFrame; if (!f) return null;
    const url = f.url;
    if (event.sender === (mainWindow && mainWindow.webContents) && f === event.sender.mainFrame && isAppUrl(url)) return 'app';
    if (settingsWindow && event.sender === settingsWindow.webContents && f === event.sender.mainFrame && url.startsWith('file://') && url.endsWith('/renderer/settings.html')) return 'settings';
    if (event.sender === (mainWindow && mainWindow.webContents) && f === event.sender.mainFrame && url.startsWith('file://') && url.endsWith('/renderer/offline.html')) return 'offline';
  } catch (e) { /* */ }
  return null;
}
const guard = (kinds, fn) => (event, ...args) => {
  const k = senderKind(event);
  if (!k || !kinds.includes(k)) { logger.warn('ipc', 'مرفوض من مرسل غير موثوق'); return null; }
  return fn(event, ...args);
};

function contentInfo() {
  const r = store.resolveServeDir();
  return { contentVersion: r.version, contentSource: r.source, contentPending: store.hasPending() };
}

function diagnosticsText() {
  const st = store ? store.readState() : {};
  return [
    'احسمها - بيانات التشخيص',
    'App: ' + app.getVersion(), 'Electron: ' + process.versions.electron, 'Chrome: ' + process.versions.chrome,
    'OS: ' + os.type() + ' ' + os.release() + ' ' + os.arch(),
    'Content: ' + JSON.stringify({ ...contentInfo(), lastError: st.lastError, lastCheckAt: st.lastCheckAt, bad: st.badVersions }),
    'Mode: ' + (REMOTE_MODE ? 'remote' : 'local'),
    '--- log tail ---', logger.tail(120),
  ].join('\n');
}

function applyLoginItem(on) {
  if (!app.isPackaged) return;
  try { app.setLoginItemSettings({ openAtLogin: !!on, args: on ? ['--hidden'] : [] }); } catch (e) { logger.warn('settings', 'login item', e && e.message); }
}

function registerIpc() {
  ipcMain.handle('ehsmaha:info', guard(['app', 'settings', 'offline'], () => ({
    version: app.getVersion(), platform: process.platform, electron: process.versions.electron,
    mode: REMOTE_MODE ? 'remote' : 'local', ...contentInfo(),
  })));
  ipcMain.handle('ehsmaha:open-external', guard(['app'], (_e, url) => openExternal(String(url || ''))));
  ipcMain.handle('ehsmaha:retry', guard(['offline'], async () => { if (await isNetworkReachable()) reloadApp(); return true; }));
  ipcMain.on('ehsmaha:toast-action', guard(['app'], (_e, id) => { if (id === 'apply-content') coordinator.applyByConsent(); }));
  ipcMain.on('ehsmaha:page-event', guard(['app'], (_e, ev) => {
    if (!ev || !PAGE_EVENT_KINDS.has(ev.kind)) return;
    const r = notifications.handle({ ...ev, target: Object.prototype.hasOwnProperty.call(TARGETS, ev.target) ? ev.target : 'home' });
    log('page-event', ev.kind, r.reason);
  }));

  ipcMain.handle('settings:get', guard(['settings'], () => ({
    settings: settings.getAll(),
    info: { version: app.getVersion(), electron: process.versions.electron, ...contentInfo(), appUpdateReady: !!(updater && updater.state.ready) },
  })));
  ipcMain.handle('settings:set', guard(['settings'], (_e, patch) => {
    const next = settings.update(patch);
    applyLoginItem(next.startWithWindows);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.setZoomFactor(next.zoomFactor);
    return next;
  }));
  ipcMain.handle('settings:check-app-update', guard(['settings'], () => updater.checkManually()));
  ipcMain.handle('settings:install-app-update', guard(['settings'], async () => {
    if (!updater.state.ready) return { message: 'لا يوجد تحديث جاهز.' };
    const idle = classify(await probePage());
    if (!idle.idle) {
      const r = await dialog.showMessageBox(settingsWindow, { type: 'warning', buttons: ['إعادة التشغيل وتثبيت التحديث', 'لاحقاً'], defaultId: 1, cancelId: 1, noLink: true,
        title: 'جولة أو بث نشط', message: 'يبدو أن هناك جولة أو بثاً نشطاً الآن', detail: 'إعادة التشغيل ستقطعها. الأفضل التثبيت بعد انتهاء الجولة.' });
      if (r.response !== 0) return { message: 'تم التأجيل. سيُثبَّت التحديث عند إغلاق التطبيق.' };
    }
    isQuitting = true; updater.installNow(); return { message: 'جارٍ التثبيت...' };
  }));
  ipcMain.handle('settings:sync-content', guard(['settings'], async () => {
    const r = await runContentSync();
    if (r.status === 'error') return { message: 'تعذّر فحص المحتوى: ' + r.error };
    if (r.status === 'staged') return { message: 'وصل تحديث جديد للمحتوى وهو جاهز.' };
    return { message: 'المحتوى محدَّث.' };
  }));
  ipcMain.handle('settings:apply-content', guard(['settings'], async () => {
    const r = await coordinator.applyByConsent();
    return { message: r.action === 'applied' ? 'تم تطبيق التحديث.' : r.action === 'rolled-back' ? 'تعذّر التحديث ورجعنا للنسخة السابقة.' : 'لا يوجد تحديث جاهز.' };
  }));
  ipcMain.handle('settings:test-notification', guard(['settings'], () => {
    const key = 'test:' + Date.now();
    const saved = notifications.getWindowState;
    notifications.getWindowState = () => ({ visible: false, focused: false, minimized: false, inTray: true });
    const r = notifications.handle({ kind: 'event', id: key, title: 'إشعار تجريبي من احسمها', body: 'الإشعارات تعمل بشكل سليم.', target: 'home' });
    notifications.getWindowState = saved;
    return r;
  }));
  ipcMain.handle('settings:copy-diagnostics', guard(['settings'], () => { clipboard.writeText(diagnosticsText()); return true; }));
  ipcMain.handle('settings:open-logs', guard(['settings'], () => shell.openPath(logger.dir)));
  ipcMain.handle('settings:fullscreen', guard(['settings'], () => { toggleFullscreen(); return true; }));
}

/* ---------------------------------------------------------- الإعدادات + Tray */

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.show(); settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 700, height: 780, minWidth: 560, minHeight: 520, title: 'إعدادات احسمها', backgroundColor: BRAND_BG, icon: appIcon(),
    autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true, devTools: IS_DEV },
  });
  settingsWindow.removeMenu();
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
}

function createTray() {
  if (tray) return;
  tray = new Tray(appIcon() || nativeImage.createEmpty());
  tray.setToolTip('احسمها');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'فتح احسمها', click: showMainWindow },
    { label: 'الإعدادات', click: openSettings },
    { label: 'التحقق من التحديثات', click: () => { openSettings(); } },
    { type: 'separator' },
    { label: 'خروج', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('click', showMainWindow);
}

async function onNotificationClick(target) {
  showMainWindow();
  if (!Object.prototype.hasOwnProperty.call(TARGETS, target)) return;
  // لا ننقل المستخدم من جولة نشطة؛ نفتح النافذة فقط.
  if (classify(await probePage()).idle) mainWindow.webContents.executeJavaScript(navigationScript(target), false).catch(() => {});
}

/* ------------------------------------------------------------------ الإقلاع */

async function boot() {
  state = earlyState;
  settings = new Settings(state);
  logger = new Logger(path.join(app.getPath('userData'), 'logs'), { echo: IS_DEV });
  logger.installProcessHandlers();
  logger.info('app', 'start', app.getVersion(), 'electron', process.versions.electron, 'packaged', app.isPackaged);

  store = new ContentStore(path.join(__dirname, 'site'), app.getPath('userData'));
  authBridge = new AuthBridge();

  hardenSession(session.fromPartition(SESSION_PARTITION));
  hardenSession(session.defaultSession);

  // إصدار محتوى جاهز من جلسة سابقة: نرقّيه الآن قبل تحميل أي صفحة (لا جولة ممكنة بعد).
  if (!REMOTE_MODE) {
    const promoted = store.hasPending() ? store.promotePending() : null;
    if (promoted) logger.info('content', 'تطبيق إصدار جاهز عند الإقلاع', promoted.version);
  }

  if (REMOTE_MODE) {
    appUrl = SITE_ORIGIN + '/';
  } else {
    const resolved = store.resolveServeDir();
    if (!fs.existsSync(path.join(resolved.dir, 'index.html'))) {
      logger.warn('content', 'لا يوجد محتوى محلي — الرجوع للموقع الحيّ');
      appUrl = SITE_ORIGIN + '/';
    } else {
      server = new LocalSiteServer();
      const port = await server.start(resolved.dir, state.get('port', PREFERRED_PORT));
      state.set('port', port);
      server.setPostHandler((req, body) => {
        // المعالج متزامن؛ نلفّ النتيجة الأولية ثم نكمل بلا انتظار
        const r = authBridge.complete({ origin: req.headers.origin, host: req.headers.host, body });
        if (!r.ok) { logger.warn('auth', 'رفض callback:', r.reason); return { status: 400, html: FAIL_PAGE }; }
        deliverCredential(r);
        return { status: 200, html: SUCCESS_PAGE };
      });
      appUrl = server.origin + '/';
      logger.info('content', 'المحتوى', resolved.source, resolved.version, appUrl);
    }
  }
  appOrigin = new URL(appUrl).origin;

  const NotifClass = E2E ? makeRecorderNotification() : Notification;
  notifications = new NotificationManager({
    getSettings: () => settings.getAll().notif, getWindowState: windowState, NotificationClass: NotifClass,
    onClick: onNotificationClick, store: state, icon: iconPath() || undefined, log: (m) => log(m),
  });

  coordinator = new UpdateCoordinator({
    store, probe: probePage, setServeDir: (d) => { if (server) server.setRootDir(d); },
    reloadAndCheck, log: (m) => logger.info('content', m), pollMs: E2E ? 400 : 8000,
    toast: (msg, kind) => {
      if (kind === 'info') toast(msg, 'info', { key: 'content-update', timeout: 0, action: { id: 'apply-content', label: 'طبّق الآن' } });
      else toast(msg, kind);
    },
  });
  coordinator.onChange((ev) => {
    logger.info('content', ev.type, ev.version || ev.reason || '');
    if (ev.type === 'applied') {
      for (const f of newGameFiles(lastStagedDiff)) {
        const r = notifications.handle({ kind: 'new-game', id: 'file:' + f, title: 'لعبة جديدة في احسمها', body: 'تمت إضافة لعبة جديدة. افتح احسمها وجرّبها.', target: 'home' });
        logger.info('notify', 'new-game', f, r.reason);
      }
      lastStagedDiff = null;
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('settings:changed', {});
  });

  registerIpc();
  const startupWanted = settings.getAll().startWithWindows;
  applyLoginItem(startupWanted);

  createSplash();
  createMainWindow();
  createTray();

  updater = initUpdater({
    log: (m) => logger.info('updater', m),
    onReady: (version) => {
      toast('تحديث التطبيق ' + version + ' جاهز، يتثبّت عند إغلاق التطبيق أو من الإعدادات.', 'info', { key: 'app-update', timeout: 12000 });
      notifications.handle({ kind: 'update', id: 'app:' + version, title: 'تحديث جديد لتطبيق احسمها', body: 'النسخة ' + version + ' جاهزة، وتُثبَّت عند إغلاق التطبيق.', target: 'home' });
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('settings:changed', {});
    },
  });

  buildAppMenu({
    getWindow: () => mainWindow, reloadApp, openSettings,
    goBack: () => { const wc = mainWindow && mainWindow.webContents; if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack(); },
    goForward: () => { const wc = mainWindow && mainWindow.webContents; if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward(); },
    checkForUpdates: openSettings, isDev: IS_DEV,
  });

  setTimeout(() => updater.checkForUpdates(), 15000);
  setInterval(() => updater.checkForUpdates(), 6 * 60 * 60 * 1000);

  if (!REMOTE_MODE && server) {
    setTimeout(() => runContentSync().catch(() => {}), E2E ? 1500 : 12000);
    syncTimer = setInterval(() => runContentSync().catch(() => {}), (E2E ? 3000 : 20 * 60 * 1000));
  }

  if (E2E) {
    global.__ehsTest = { store, coordinator, notifications, settings, runContentSync, probePage, getMainWindow: () => mainWindow, getServer: () => server, authBridge, shown: NotifClass.shown, openSettings, getSettingsWindow: () => settingsWindow, updater, externals: () => global.__ehsExternals || [] };
  }
}

function deliverCredential(r) {
  setImmediate(async () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      showMainWindow();
      const ok = await mainWindow.webContents.executeJavaScript(signInScript(r.idToken, r.accessToken), false);
      logger.info('auth', ok ? 'اكتمل تسجيل الدخول' : 'تعذّر إكمال تسجيل الدخول داخل الصفحة');
      toast(ok ? 'تم تسجيل الدخول.' : 'تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.', ok ? 'success' : 'error', { key: 'auth' });
    } catch (e) { logger.error('auth', 'signIn failed', e && e.message); }
  });
}

function makeRecorderNotification() {
  const { EventEmitter } = require('events');
  const shown = [];
  class Rec extends EventEmitter {
    constructor(o) { super(); this.opts = o; }
    show() { shown.push({ title: this.opts.title, body: this.opts.body, silent: this.opts.silent, n: this }); }
    static isSupported() { return true; }
  }
  Rec.shown = shown;
  return Rec;
}

/* ------------------------------------------------------------- دورة الحياة */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.setName('احسمها');
  app.setAppUserModelId(APP_ID); // ضروري لإشعارات ويندوز

  app.whenReady().then(boot).catch((err) => {
    try { logger && logger.error('app', 'boot failed', err); } catch (e) { /* */ }
    dialog.showErrorBox('تعذّر تشغيل احسمها', String((err && err.message) || err));
    app.quit();
  });

  app.on('child-process-gone', (_e, details) => {
    if (!details || details.reason === 'clean-exit') return;
    logger && logger.error('gpu', 'child-process-gone', details.type, details.reason);
    if (details.type === 'GPU') {
      gpuCrashes++;
      if (gpuCrashes >= 3 && !state.get('safeGraphics', false)) {
        state.set('safeGraphics', true); // يُطبَّق من التشغيل القادم فقط، بعد انهيارات متكررة موثّقة
        toast('تكرر تعطّل الرسوميات. سيعمل التطبيق بوضع رسوميات آمن في التشغيل القادم.', 'error', { timeout: 0 });
      }
    }
  });

  app.on('window-all-closed', () => { if (isQuitting || !tray) app.quit(); });
  app.on('activate', () => { if (!mainWindow) { createSplash(); createMainWindow(); } else showMainWindow(); });
  app.on('before-quit', () => {
    isQuitting = true;
    clearInterval(syncTimer); clearTimeout(retryTimer);
    if (coordinator) coordinator.dispose();
    if (server) server.stop();
  });
  app.on('certificate-error', (_e, _wc, _url, _err, _cert, callback) => callback(false));
}
