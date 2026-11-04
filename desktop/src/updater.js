'use strict';

const { app } = require('electron');

/**
 * تحديث التطبيق نفسه (ملف EXE) عبر electron-updater + GitHub Releases.
 * قواعد: لا يُعاد التشغيل أبداً من تلقاء نفسه أثناء جولة/بث (isBusy)، ولا خفض
 * لإصدار أقدم، ولا إصدارات تجريبية. التنزيل بالخلفية، والتثبيت إمّا عند إغلاق
 * التطبيق (autoInstallOnAppQuit) أو بطلب صريح من المستخدم من الإعدادات.
 */
function initUpdater({ notify, log, onReady }) {
  let autoUpdater = null;
  const state = { ready: false, version: null, checking: false };

  const noop = {
    state,
    checkForUpdates: async () => null,
    checkManually: async () => ({ message: 'التحديث التلقائي يعمل فقط في النسخة المثبَّتة.' }),
    installNow: () => false,
  };
  if (!app.isPackaged) { log && log('التحديث التلقائي معطّل (نسخة غير مثبَّتة)'); return noop; }
  try { ({ autoUpdater } = require('electron-updater')); } catch (err) { log && log('electron-updater غير متوفّر: ' + (err && err.message)); return noop; }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.logger = null;

  autoUpdater.on('update-available', (info) => log && log('تحديث متاح: ' + (info && info.version)));
  autoUpdater.on('error', (err) => log && log('خطأ تحديث التطبيق: ' + (err && err.message)));
  autoUpdater.on('update-downloaded', (info) => {
    state.ready = true; state.version = info && info.version;
    log && log('تحديث التطبيق جاهز: ' + state.version);
    onReady && onReady(state.version);
  });

  async function checkForUpdates() {
    if (state.checking) return null;
    state.checking = true;
    try { return await autoUpdater.checkForUpdates(); }
    catch (err) { log && log('فشل التحقق من التحديث: ' + (err && err.message)); return null; }
    finally { state.checking = false; }
  }

  async function checkManually() {
    if (state.ready) return { message: 'التحديث ' + state.version + ' جاهز. اضغط «تثبيت التحديث».' };
    const r = await checkForUpdates();
    if (!r) return { message: 'تعذّر التحقق من التحديثات الآن. تأكد من الاتصال وحاول لاحقاً.' };
    const v = r.updateInfo && r.updateInfo.version;
    if (v && v !== app.getVersion() && r.downloadPromise) return { message: 'يوجد تحديث ' + v + ' وجارٍ تنزيله بالخلفية.' };
    return { message: 'أنت على أحدث نسخة (' + app.getVersion() + ').' };
  }

  function installNow() {
    if (!state.ready) return false;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return true;
  }

  return { state, checkForUpdates, checkManually, installNow };
}

module.exports = { initUpdater };
