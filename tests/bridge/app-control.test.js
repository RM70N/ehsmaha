'use strict';
// قسم «التطبيق» بلوحة المالك على استوديو المالك الحقيقي (الموقع الحقيقي + Firebase مُحاكى + API الخادم مُعترَض).
//   node tests/bridge/app-control.test.js
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();

(async () => {
  const b = await boot();
  const calls = [];
  let cfg = { motd: { text: '', active: false, id: '' }, minVersion: '', notificationsEnabled: true, codeLoginEnabled: true };
  const stats = { installs: 120, onlineNow: 17, active24h: 64, active7d: 101, byVersion: { '1.1.2': 90, '1.0.1': 30 }, onlineVersions: { '1.1.2': 15, '1.0.1': 2 }, byPlatform: { win: 120 }, downloads: { total: 345, releases: [{ tag: 'v1.1.2', count: 300 }, { tag: 'v1.0.1', count: 45 }] }, sent: [{ id: 'n1', title: 'سابق', body: '', at: Date.now() - 60000, delivered: 12 }], asOf: Date.now() };
  await b.page.context().route('**/desktop-app/admin/**', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    calls.push({ path: u.pathname.split('/admin')[1], method: req.method(), auth: req.headers()['authorization'], body: req.postData() });
    const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(o) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.pathname.endsWith('/stats')) return j(stats);
    if (u.pathname.endsWith('/config') && req.method() === 'GET') return j({ config: cfg });
    if (u.pathname.endsWith('/config')) { cfg = Object.assign({}, cfg, JSON.parse(req.postData())); return j({ config: cfg }); }
    if (u.pathname.endsWith('/notify')) return j({ ok: true, id: 'n2', delivered: 17 });
    return j({ error: 'nf' }, 404);
  });
  await b.go('app', 1500);
  check('القسم «التطبيق» موجود ويُعرض', await b.fe(() => !!document.getElementById('view-app') && Studio.cur === 'app'));
  check('القسم ضمن معرض الأقسام', await b.fe(() => Array.from(document.querySelectorAll('[data-nav-go="app"]')).length > 0 || Studio.order.includes('app')));
  const txt = await b.fe(() => document.getElementById('view-app').innerText);
  check('الأرقام تظهر: يستخدمونه الآن 17، التثبيتات 120، التحميلات 345', /17/.test(txt) && /120/.test(txt) && /345/.test(txt), txt.slice(0, 300));
  check('جدول الإصدارات: 1.1.2 (90 نشط، 300 تحميل)', await b.fe(() => /1\.1\.2/.test(document.getElementById('view-app').innerText) && /300/.test(document.getElementById('view-app').innerText)));
  check('الطلبات تحمل توكن المالك (Bearer)', calls.length >= 2 && calls.every((c) => c.auth === 'Bearer tok'), calls.map((c) => c.auth));

  // إرسال إشعار
  await b.fe(() => { document.getElementById('ap-title').value = 'عرض جديد'; document.getElementById('ap-body').value = 'جرّب الآن'; document.getElementById('ap-target').value = 'store'; document.getElementById('ap-send').click(); });
  await sleep(500);
  const okBtn = await b.fe(() => { const m = document.querySelector('.modal button.btn-primary, [role="dialog"] button.btn-primary'); if (m) { m.click(); return true; } return false; });
  check('نافذة تأكيد قبل الإرسال', okBtn);
  await sleep(1200);
  const n = calls.find((c) => c.path === '/notify');
  check('الإشعار أُرسل بالحمولة الصحيحة', n && n.method === 'POST' && JSON.parse(n.body).title === 'عرض جديد' && JSON.parse(n.body).target === 'store' && JSON.parse(n.body).body === 'جرّب الآن', n);
  check('رسالة النجاح تذكر عدد المستلمين', await b.fe(() => /17/.test(document.getElementById('ap-send-msg').textContent)), await b.fe(() => document.getElementById('ap-send-msg').textContent));
  // إرسال بلا عنوان مرفوض محلياً
  const before = calls.filter((c) => c.path === '/notify').length;
  await b.fe(() => { document.getElementById('ap-title').value = ''; document.getElementById('ap-send').click(); });
  await sleep(500);
  check('إرسال بلا عنوان لا يطلب الخادم', calls.filter((c) => c.path === '/notify').length === before);

  // حفظ الإعدادات
  await b.fe(() => { const set = (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; set('ap-motd', 'صيانة الليلة'); const m = document.getElementById('ap-motd-on'); m.checked = true; m.dispatchEvent(new Event('input', { bubbles: true })); set('ap-minver', '1.1.2'); const c = document.getElementById('ap-code'); c.checked = false; c.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('ap-save').click(); });
  await sleep(1200);
  const sv = calls.filter((c) => c.path === '/config' && c.method === 'POST').pop();
  const body = sv && JSON.parse(sv.body);
  check('حفظ الإعدادات: الرسالة + أقل إصدار + إخفاء زر الرمز', body && body.motd.text === 'صيانة الليلة' && body.motd.active === true && body.minVersion === '1.1.2' && body.codeLoginEnabled === false && body.notificationsEnabled === true, body);
  // صيغة إصدار خاطئة
  const cnt = calls.filter((c) => c.path === '/config' && c.method === 'POST').length;
  await b.fe(() => { document.getElementById('ap-minver').value = 'abc'; document.getElementById('ap-save').click(); });
  await sleep(500);
  check('صيغة إصدار خاطئة لا تُرسل', calls.filter((c) => c.path === '/config' && c.method === 'POST').length === cnt);

  check('لا أخطاء JS بالصفحة أو الاستوديو', b.perr.length === 0 && b.ferr.length === 0, [b.perr, b.ferr]);
  await b.browser.close();
  process.exit(done() ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
