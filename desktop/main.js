'use strict';

/**
 * احسمها — تطبيق سطح المكتب (Electron)
 *
 * التطبيق يشحن نسخة كاملة من الموقع داخله ويشغّلها من سيرفر محلي على
 * http://localhost:PORT ، فيبدو ويتصرّف كتطبيق مستقل (يفتح فوراً، يعمل بدون
 * شريط متصفح، أيقونة وقائمة خاصة به) بينما يبقى متصلاً بنفس السيرفر ونفس
 * قاعدة البيانات (Firebase Auth + Firestore + Realtime Database) تماماً كما
 * هو الموقع. كود الموقع نفسه لم يُعدَّل بأي حرف.
 */

const { app, BrowserWindow, session, shell, ipcMain, nativeImage, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');

const {
  SITE_ORIGIN, AUTH_HOSTS, APP_ID, WINDOW_TITLE, SESSION_PARTITION, BRAND_BG, PREFERRED_PORT,
} = require('./src/config');
const { LocalSiteServer } = require('./src/server');
const { ContentStore } = require('./src/content');
const { syncContent } = require('./src/content-sync');
const { initUpdater } = require('./src/updater');
const { buildAppMenu } = require('./src/menu');
const { AppState } = require('./src/state');

const IS_DEV = !app.isPackaged || process.argv.includes('--dev');
// وضع "remote" اختياري للتجربة: يحمّل الموقع الحيّ مباشرة بدل النسخة المحلية.
const REMOTE_MODE = process.env.EHSMAHA_MODE === 'remote' || process.argv.includes('--remote');

const NETWORK_ERRORS = new Set([-2, -7, -21, -105, -106, -109, -118, -137, -300, -324, -501]);

let mainWindow = null;
let splashWindow = null;
let server = null;
let store = null;
let state = null;
let updater = null;
let appUrl = null;
let retryTimer = null;
let syncTimer = null;

function log(...args) {
  // سجلّ خفيف: يظهر في الطرفية أثناء التطوير، ويُتجاهل بصمت في الإنتاج.
  if (IS_DEV) console.log('[ehsmaha]', ...args);
}

function notifyRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('ehsmaha:status', payload);
  }
  notifyDesktop(payload);
}

/**
 * إشعار نظام حقيقي (Windows/macOS notification center) لأحداث التطبيق نفسه
 * (تحديث جاهز، محتوى جديد) — بالإضافة إلى التنبيه داخل الصفحة. أحداث اللعب
 * نفسها تبقى من مسؤولية كود الموقع عبر Web Notification API القياسي، وهو
 * يعمل مباشرة بدون أي تعديل لأن صلاحية 'notifications' ممنوحة تلقائياً
 * (انظر hardenSession أعلاه).
 */
function notifyDesktop(payload) {
  if (!payload || !Notification.isSupported()) return;
  let title = null;
  let body = null;
  if (payload.type === 'app-update-ready') {
    title = 'تحديث جاهز لتطبيق احسمها';
    body = 'النسخة ' + payload.version + ' جاهزة — أعد تشغيل التطبيق لتطبيقها.';
  } else if (payload.type === 'content-updated') {
    title = 'محتوى احسمها تحدَّث';
    body = 'أعد تشغيل التطبيق عشان تشوف آخر نسخة من الموقع.';
  }
  if (!title) return;
  const n = new Notification({ title, body, icon: iconPath() || undefined, silent: false });
  n.on('click', () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); } });
  n.show();
}

/* ------------------------------------------------------------------ الهوية */

function iconPath() {
  const candidates = process.platform === 'win32'
    ? ['icon.ico', 'icon.png']
    : ['icon.png', 'icon.ico'];
  for (const name of candidates) {
    const p = path.join(__dirname, 'build', name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function appIcon() {
  const p = iconPath();
  if (!p) return undefined;
  const img = nativeImage.createFromPath(p);
  return img.isEmpty() ? undefined : img;
}

/* --------------------------------------------------- تهيئة الجلسة والأمان */

function hardenSession(ses) {
  // ملف تعريف ثابت (persist:) — يحفظ جلسة Firebase Auth بين مرات فتح التطبيق
  // فلا يحتاج المستخدم تسجيل الدخول كل مرة.
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    const allowed = ['notifications', 'fullscreen', 'clipboard-sanitized-write', 'media', 'pointerLock', 'background-sync'];
    callback(allowed.includes(permission));
  });
  ses.setPermissionCheckHandler((contents, permission) => {
    return ['notifications', 'fullscreen', 'clipboard-sanitized-write', 'media', 'background-sync'].includes(permission);
  });

  // بعض خدمات تسجيل الدخول (Google) ترفض المتصفحات المدمجة. نقدّم User-Agent
  // نظيف بدون كلمة Electron حتى يمرّ تسجيل الدخول بشكل طبيعي.
  const chrome = process.versions.chrome;
  const platformToken = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : 'X11; Linux x86_64';
  const ua = `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
  app.userAgentFallback = ua;
  ses.setUserAgent(ua);
}

function isAuthUrl(url) {
  try {
    const u = new URL(url);
    return AUTH_HOSTS.includes(u.hostname);
  } catch (e) {
    return false;
  }
}

function isInternalUrl(url) {
  try {
    const u = new URL(url);
    if (appUrl && u.origin === new URL(appUrl).origin) return true;
    if (REMOTE_MODE && (u.hostname === 'ehsmaha.com' || u.hostname === 'www.ehsmaha.com')) return true;
    return isAuthUrl(url);
  } catch (e) {
    return false;
  }
}

function openExternal(url) {
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) {
    shell.openExternal(url).catch(() => { /* تجاهل */ });
  }
}

/* --------------------------------------------------------- شاشة الانتظار */

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 460,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: BRAND_BG,
    icon: appIcon(),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'renderer', 'splash.html'));
  splashWindow.once('ready-to-show', () => { if (splashWindow) splashWindow.show(); });
  splashWindow.on('closed', () => { splashWindow = null; });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    const w = splashWindow;
    splashWindow = null;
    setTimeout(() => { try { w.close(); } catch (e) { /* تجاهل */ } }, 150);
  }
}

/* --------------------------------------------------------- النافذة الرئيسية */

function createMainWindow() {
  const bounds = state.get('windowBounds', {});
  mainWindow = new BrowserWindow({
    width: bounds.width || 1280,
    height: bounds.height || 800,
    x: bounds.x,
    y: bounds.y,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: WINDOW_TITLE,
    backgroundColor: BRAND_BG,
    icon: appIcon(),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
      devTools: true, // متاحة بالاختصار فقط في الإنتاج (انظر before-input-event)
      partition: SESSION_PARTITION,
      backgroundThrottling: false, // الألعاب المباشرة يجب ألا تتجمّد بالخلفية
    },
  });

  if (state.get('maximized', false)) mainWindow.maximize();

  // عنوان النافذة ثابت مهما غيّر الموقع عنوان الصفحة.
  mainWindow.on('page-title-updated', (e) => { e.preventDefault(); });
  mainWindow.setTitle(WINDOW_TITLE);

  const wc = mainWindow.webContents;

  // فتح الروابط الخارجية (تيك توك، انستقرام، يوتيوب...) في متصفح النظام،
  // وفتح نوافذ تسجيل الدخول (Google) كنافذة Electron ثانوية حقيقية.
  wc.setWindowOpenHandler(({ url }) => {
    if (isAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 700,
          resizable: true,
          minimizable: false,
          fullscreenable: false,
          autoHideMenuBar: true,
          backgroundColor: '#ffffff',
          title: 'تسجيل الدخول',
          parent: mainWindow,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            partition: SESSION_PARTITION,
          },
        },
      };
    }
    openExternal(url);
    return { action: 'deny' };
  });

  wc.on('did-create-window', (child) => {
    child.setMenuBarVisibility(false);
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (isAuthUrl(url)) return { action: 'allow' };
      openExternal(url);
      return { action: 'deny' };
    });
  });

  // منع خروج النافذة الرئيسية عن التطبيق: أي انتقال لنطاق خارجي يفتح بالمتصفح.
  wc.on('will-navigate', (event, url) => {
    if (!isInternalUrl(url)) {
      event.preventDefault();
      openExternal(url);
    }
  });

  // في الإنتاج القائمة لا تعرض أدوات المطوّر، لكن Ctrl+Shift+I يفتحها للحاجة.
  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const devCombo = process.platform === 'darwin'
      ? (input.meta && input.alt && key === 'i')
      : (input.control && input.shift && key === 'i');
    if (devCombo) {
      event.preventDefault();
      wc.toggleDevTools();
      return;
    }
    if (key === 'f5') { event.preventDefault(); reloadApp(); }
    if (key === 'f11' && process.platform !== 'darwin') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  wc.on('did-fail-load', (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    log('فشل التحميل', errorCode, errorDescription, validatedURL);
    if (validatedURL && validatedURL.startsWith('file://')) return; // صفحة عدم الاتصال نفسها
    if (NETWORK_ERRORS.has(errorCode) || errorCode === -3) {
      showOfflinePage();
    } else if (!REMOTE_MODE) {
      // محتوى محلي تالف؟ نرجع للنسخة المضمّنة مع التطبيق.
      recoverFromBrokenContent();
    }
  });

  wc.on('render-process-gone', (event, details) => {
    log('انهيار عملية العرض:', details && details.reason);
    if (details && details.reason !== 'clean-exit' && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  wc.once('did-finish-load', () => {
    closeSplash();
    if (!mainWindow.isDestroyed()) mainWindow.show();
  });

  // شبكة أمان: لا نترك المستخدم أمام شاشة انتظار للأبد.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      closeSplash();
      mainWindow.show();
    }
  }, 12000);

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    state.set('maximized', mainWindow.isMaximized());
    if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      state.set('windowBounds', mainWindow.getNormalBounds());
    }
  };
  mainWindow.on('resize', debounce(saveBounds, 500));
  mainWindow.on('move', debounce(saveBounds, 500));
  mainWindow.on('close', saveBounds);
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.loadURL(appUrl);
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function showOfflinePage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  closeSplash();
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'offline.html'));
  if (!mainWindow.isVisible()) mainWindow.show();
  scheduleRetry();
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(async () => {
    const online = await isNetworkReachable();
    if (online) reloadApp();
    else scheduleRetry();
  }, 5000);
}

async function isNetworkReachable() {
  const { net } = require('electron');
  if (typeof net.isOnline === 'function' && !net.isOnline()) return false;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const req = net.request({ method: 'HEAD', url: SITE_ORIGIN + '/?ping=' + Date.now() });
      const timer = setTimeout(() => { try { req.abort(); } catch (e) {} finish(false); }, 8000);
      req.on('response', (res) => { clearTimeout(timer); res.resume(); finish(res.statusCode > 0); });
      req.on('error', () => { clearTimeout(timer); finish(false); });
      req.end();
    } catch (e) {
      finish(false);
    }
  });
}

function reloadApp() {
  clearTimeout(retryTimer);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const current = mainWindow.webContents.getURL();
  if (!current || current.startsWith('file://')) mainWindow.loadURL(appUrl);
  else mainWindow.reload();
}

function recoverFromBrokenContent() {
  if (!store) return;
  const { source } = store.resolveServeDir();
  if (source !== 'downloaded') return; // النسخة المضمّنة تالفة — لا شيء نرجع إليه
  log('المحتوى المنزَّل تالف — الرجوع للنسخة المضمّنة مع التطبيق');
  store.discardDownloaded();
  const resolved = store.resolveServeDir();
  if (server) server.setRootDir(resolved.dir);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(appUrl);
}

/* ------------------------------------------------------------------ IPC */

function registerIpc() {
  ipcMain.handle('ehsmaha:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    mode: REMOTE_MODE ? 'remote' : 'local',
    contentSource: store ? store.resolveServeDir().source : 'unknown',
    contentUpdatedAt: store ? (store.readMeta().updatedAt || null) : null,
    isDev: IS_DEV,
  }));
  ipcMain.handle('ehsmaha:check-network', () => isNetworkReachable());
  ipcMain.handle('ehsmaha:reload', () => { reloadApp(); return true; });
  ipcMain.handle('ehsmaha:restart', () => { app.relaunch(); app.exit(0); });
  ipcMain.handle('ehsmaha:open-external', (event, url) => { openExternal(String(url || '')); return true; });
  ipcMain.handle('ehsmaha:check-updates', () => (updater ? updater.checkManually() : null));
}

/* ------------------------------------------------------------------ الإقلاع */

async function boot() {
  state = new AppState(app.getPath('userData'));
  store = new ContentStore(path.join(__dirname, 'site'), app.getPath('userData'));

  const ses = session.fromPartition(SESSION_PARTITION);
  hardenSession(ses);
  hardenSession(session.defaultSession);

  if (REMOTE_MODE) {
    appUrl = SITE_ORIGIN + '/';
    log('وضع remote — تحميل الموقع الحيّ مباشرة');
  } else {
    const resolved = store.resolveServeDir();
    if (!fs.existsSync(path.join(resolved.dir, 'index.html'))) {
      // لا محتوى محلي إطلاقاً (بناء ناقص) — نرجع للموقع الحيّ حتى لا يفشل التطبيق.
      log('لا يوجد محتوى محلي — الرجوع للموقع الحيّ');
      appUrl = SITE_ORIGIN + '/';
    } else {
      server = new LocalSiteServer();
      const port = await server.start(resolved.dir, state.get('port', PREFERRED_PORT));
      state.set('port', port);
      appUrl = server.origin + '/';
      log('المحتوى:', resolved.source, '| السيرفر المحلي:', appUrl);
    }
  }

  registerIpc();
  createSplash();
  createMainWindow();

  updater = initUpdater({
    getWindow: () => mainWindow,
    notify: notifyRenderer,
    log,
  });

  buildAppMenu({
    getWindow: () => mainWindow,
    reloadApp,
    goBack: () => {
      const wc = mainWindow && mainWindow.webContents;
      if (!wc) return;
      const nav = wc.navigationHistory;
      if (nav && nav.canGoBack()) nav.goBack();
      else if (typeof wc.canGoBack === 'function' && wc.canGoBack()) wc.goBack();
    },
    goForward: () => {
      const wc = mainWindow && mainWindow.webContents;
      if (!wc) return;
      const nav = wc.navigationHistory;
      if (nav && nav.canGoForward()) nav.goForward();
      else if (typeof wc.canGoForward === 'function' && wc.canGoForward()) wc.goForward();
    },
    checkForUpdates: () => updater && updater.checkManually(),
    isDev: IS_DEV,
  });

  // فحص تحديث التطبيق بعد الإقلاع بقليل، ثم كل ٦ ساعات.
  setTimeout(() => updater && updater.checkForUpdates(), 15000);
  setInterval(() => updater && updater.checkForUpdates(), 6 * 60 * 60 * 1000);

  // مزامنة محتوى الموقع بالخلفية (بعد ما يستقر التطبيق)، ثم كل ٣ ساعات.
  if (!REMOTE_MODE && server) {
    setTimeout(() => syncContent(store, notifyRenderer, log), 20000);
    syncTimer = setInterval(() => syncContent(store, notifyRenderer, log), 3 * 60 * 60 * 1000);
  }
}

/* ------------------------------------------------------------- دورة الحياة */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setName('احسمها');
  app.setAppUserModelId(APP_ID); // ضروري لإشعارات ويندوز

  app.whenReady().then(boot).catch((err) => {
    dialog.showErrorBox('تعذّر تشغيل احسمها', String((err && err.stack) || err));
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplash();
      createMainWindow();
    }
  });

  app.on('before-quit', () => {
    clearInterval(syncTimer);
    clearTimeout(retryTimer);
    if (server) server.stop();
  });

  // لا نسمح بأي شهادة غير صالحة — الأمان أهم من التسامح.
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    callback(false);
  });
}
