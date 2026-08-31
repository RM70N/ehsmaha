'use strict';

const { dialog, app } = require('electron');

/**
 * التحديث التلقائي للتطبيق نفسه عبر GitHub Releases (electron-updater).
 * مصدر التحديث مضبوط في electron-builder.yml تحت publish: provider github،
 * وهو نفس مصدر رابط التحميل المباشر.
 */

let autoUpdater = null;
let checking = false;

function getUpdater(log) {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch (err) {
    log && log('electron-updater غير متوفّر: ' + (err && err.message));
    return null;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  return autoUpdater;
}

/**
 * @param {object} opts
 * @param {() => Electron.BrowserWindow|null} opts.getWindow
 * @param {(payload: object) => void} opts.notify
 * @param {(msg: string) => void} opts.log
 */
function initUpdater({ getWindow, notify, log }) {
  if (!app.isPackaged) {
    log && log('التحديث التلقائي معطّل أثناء التطوير (نسخة غير مغلّفة)');
    return { checkForUpdates: () => Promise.resolve(null), checkManually: manualUnavailable };
  }
  const updater = getUpdater(log);
  if (!updater) return { checkForUpdates: () => Promise.resolve(null), checkManually: manualUnavailable };

  updater.on('checking-for-update', () => log && log('جارِ التحقق من وجود تحديث...'));
  updater.on('update-available', (info) => {
    log && log('يوجد تحديث: ' + (info && info.version));
    notify && notify({ type: 'app-update-downloading', version: info && info.version });
  });
  updater.on('update-not-available', () => log && log('لا يوجد تحديث جديد'));
  updater.on('error', (err) => log && log('خطأ في التحديث: ' + (err && err.message)));
  updater.on('download-progress', (p) => {
    notify && notify({ type: 'app-update-progress', percent: Math.round(p.percent || 0) });
  });
  updater.on('update-downloaded', async (info) => {
    notify && notify({ type: 'app-update-ready', version: info && info.version });
    const win = getWindow && getWindow();
    const opts = {
      type: 'info',
      buttons: ['إعادة التشغيل الآن', 'لاحقاً'],
      defaultId: 0,
      cancelId: 1,
      title: 'تحديث جديد لتطبيق احسمها',
      message: 'تم تنزيل النسخة ' + (info && info.version) + ' بنجاح',
      detail: 'أعد تشغيل التطبيق لتطبيق التحديث. أو أغلق التطبيق وسيُطبَّق تلقائياً في المرة القادمة.',
      noLink: true,
    };
    const res = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
    if (res.response === 0) {
      setImmediate(() => updater.quitAndInstall(false, true));
    }
  });

  let manual = false;

  async function checkForUpdates() {
    if (checking) return null;
    checking = true;
    try {
      return await updater.checkForUpdates();
    } catch (err) {
      log && log('فشل التحقق من التحديث: ' + (err && err.message));
      if (manual) {
        dialog.showMessageBox({
          type: 'warning',
          title: 'تعذّر التحقق من التحديثات',
          message: 'ما قدرنا نتحقق من وجود نسخة أحدث',
          detail: String((err && err.message) || err),
          buttons: ['حسناً'],
          noLink: true,
        });
      }
      return null;
    } finally {
      checking = false;
      manual = false;
    }
  }

  async function checkManually() {
    manual = true;
    const result = await checkForUpdates();
    const info = result && result.updateInfo;
    if (info && info.version && info.version !== app.getVersion()) return;
    if (!manualDialogShown(result)) {
      dialog.showMessageBox({
        type: 'info',
        title: 'تطبيق احسمها',
        message: 'أنت على أحدث نسخة (' + app.getVersion() + ')',
        buttons: ['تمام'],
        noLink: true,
      });
    }
  }

  return { checkForUpdates, checkManually };
}

function manualDialogShown(result) {
  return !!(result && result.updateInfo && result.downloadPromise);
}

function manualUnavailable() {
  return dialog.showMessageBox({
    type: 'info',
    title: 'تطبيق احسمها',
    message: 'التحديث التلقائي يعمل فقط في النسخة المثبَّتة',
    detail: 'شغّل التطبيق من ملف التثبيت (setup) حتى يعمل التحديث التلقائي من GitHub Releases.',
    buttons: ['حسناً'],
    noLink: true,
  });
}

module.exports = { initUpdater };
