'use strict';
const api = window.ehsmahaSettings;
const $ = (id) => document.getElementById(id);
const status = (t) => { $('status').textContent = t; };

async function load() {
  const s = await api.get();
  $('v-app').textContent = s.info.version + ' (Electron ' + s.info.electron + ')';
  $('v-content').textContent = s.info.contentVersion || '-';
  $('v-source').textContent = s.info.contentSource === 'downloaded' ? 'محدّث من الموقع' : 'مضمّن مع التطبيق';
  $('s-startup').checked = s.settings.startWithWindows;
  $('s-tray').checked = s.settings.closeToTray;
  $('s-zoom').value = s.settings.zoomFactor;
  $('zoom-val').textContent = Math.round(s.settings.zoomFactor * 100) + '%';
  document.querySelectorAll('[data-n]').forEach((el) => { el.checked = !!s.settings.notif[el.dataset.n]; });
  $('b-apply').hidden = !s.info.contentPending;
  $('b-install').hidden = !s.info.appUpdateReady;
}

$('s-startup').addEventListener('change', (e) => api.set({ startWithWindows: e.target.checked }));
$('s-tray').addEventListener('change', (e) => api.set({ closeToTray: e.target.checked }));
$('s-zoom').addEventListener('input', (e) => { $('zoom-val').textContent = Math.round(e.target.value * 100) + '%'; });
$('s-zoom').addEventListener('change', (e) => api.set({ zoomFactor: Number(e.target.value) }));
document.querySelectorAll('[data-n]').forEach((el) => el.addEventListener('change', () => api.set({ notif: { [el.dataset.n]: el.checked } })));
$('b-full').addEventListener('click', () => api.toggleFullscreen());
$('b-test').addEventListener('click', async () => { const r = await api.testNotification(); status(r && r.shown ? 'أُرسل الإشعار التجريبي.' : 'لم يظهر الإشعار: ' + (r && r.reason)); });
$('b-check').addEventListener('click', async () => { status('جارٍ التحقق...'); const r = await api.checkAppUpdate(); status(r.message); await load(); });
$('b-install').addEventListener('click', async () => { const r = await api.installAppUpdate(); if (r && r.message) status(r.message); });
$('b-sync').addEventListener('click', async () => { status('جارٍ فحص المحتوى...'); const r = await api.syncContent(); status(r.message); await load(); });
$('b-apply').addEventListener('click', async () => { const r = await api.applyContent(); status(r.message); await load(); });
$('b-copy').addEventListener('click', async () => { await api.copyDiagnostics(); status('تم نسخ بيانات التشخيص.'); });
$('b-logs').addEventListener('click', () => api.openLogs());
api.onChange(load);
load();
