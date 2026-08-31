'use strict';

const { Menu, app, shell, dialog } = require('electron');
const { SITE_ORIGIN } = require('./config');

/**
 * قائمة مبسّطة بالعربية: تحديث، رجوع/تقدّم، حجم الخط، ملء الشاشة، خروج.
 * كل قوائم Electron الافتراضية غير الضرورية (Edit/Window/Help الكاملة) محذوفة.
 */
function buildAppMenu({ getWindow, reloadApp, goBack, goForward, checkForUpdates, isDev }) {
  const isMac = process.platform === 'darwin';
  const win = () => getWindow && getWindow();

  const template = [];

  if (isMac) {
    template.push({
      label: 'احسمها',
      submenu: [
        { label: 'عن احسمها', click: showAbout },
        { label: 'تحقق من وجود تحديث', click: () => checkForUpdates && checkForUpdates() },
        { type: 'separator' },
        { label: 'إخفاء احسمها', role: 'hide' },
        { label: 'إخفاء الباقي', role: 'hideOthers' },
        { type: 'separator' },
        { label: 'خروج', role: 'quit' },
      ],
    });
  }

  template.push({
    label: 'التطبيق',
    submenu: [
      {
        label: 'تحديث الصفحة',
        accelerator: 'F5',
        click: () => reloadApp && reloadApp(),
      },
      {
        label: 'تحديث الصفحة (بديل)',
        accelerator: 'CmdOrCtrl+R',
        click: () => reloadApp && reloadApp(),
      },
      { type: 'separator' },
      {
        label: 'رجوع',
        accelerator: isMac ? 'Cmd+Left' : 'Alt+Left',
        click: () => goBack && goBack(),
      },
      {
        label: 'تقدّم',
        accelerator: isMac ? 'Cmd+Right' : 'Alt+Right',
        click: () => goForward && goForward(),
      },
      { type: 'separator' },
      ...(isMac ? [] : [{ label: 'تحقق من وجود تحديث', click: () => checkForUpdates && checkForUpdates() }]),
      { label: 'فتح الموقع في المتصفح', click: () => shell.openExternal(SITE_ORIGIN) },
      ...(isMac ? [] : [{ type: 'separator' }, { label: 'عن احسمها', click: showAbout }]),
      { type: 'separator' },
      { label: 'خروج', accelerator: isMac ? 'Cmd+Q' : 'Alt+F4', role: 'quit' },
    ],
  });

  template.push({
    label: 'عرض',
    submenu: [
      { label: 'تكبير الخط', accelerator: 'CmdOrCtrl+Plus', role: 'zoomIn' },
      { label: 'تكبير الخط (بديل)', accelerator: 'CmdOrCtrl+=', role: 'zoomIn', visible: false },
      { label: 'تصغير الخط', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'الحجم الافتراضي', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
      { type: 'separator' },
      {
        label: 'ملء الشاشة',
        accelerator: isMac ? 'Ctrl+Cmd+F' : 'F11',
        click: () => { const w = win(); if (w) w.setFullScreen(!w.isFullScreen()); },
      },
      {
        // في نسخة الإنتاج الأداة مخفية من القائمة لكن الاختصار يشتغل عند الحاجة.
        label: 'أدوات المطوّر',
        accelerator: isMac ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
        visible: !!isDev,
        click: () => { const w = win(); if (w) w.webContents.toggleDevTools(); },
      },
    ],
  });

  // نسخ/لصق مطلوبة داخل حقول الموقع (اسم المستخدم، مفاتيح البث...) — نبقيها
  // كاختصارات فقط بدون قائمة ظاهرة.
  template.push({
    label: 'تحرير',
    submenu: [
      { label: 'تراجع', role: 'undo' },
      { label: 'إعادة', role: 'redo' },
      { type: 'separator' },
      { label: 'قص', role: 'cut' },
      { label: 'نسخ', role: 'copy' },
      { label: 'لصق', role: 'paste' },
      { label: 'تحديد الكل', role: 'selectAll' },
    ],
  });

  function showAbout() {
    dialog.showMessageBox({
      type: 'info',
      title: 'عن احسمها',
      message: 'احسمها | ehsmaha',
      detail:
        'إصدار التطبيق: ' + app.getVersion() +
        '\nElectron: ' + process.versions.electron +
        '\nالموقع: ' + SITE_ORIGIN,
      buttons: ['إغلاق'],
      noLink: true,
    });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildAppMenu };
