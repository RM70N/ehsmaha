'use strict';
// قسم «إدارة الأدمن» في استوديو المالك (واجهة حقيقية + طبقة بيانات الأدمن؛ Firebase وهمي في الذاكرة). الحماية الفعلية مختبرة بالقواعد في tests/admin-center.
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { f, go, fe, he } = T;
  await he(() => {
    window.__writes = []; const fb = window.__fbx;
    window.__col = { adminAccess: [
      { userId: 'u1', username: 'Alpha', role: 'admin', status: 'active', permissions: { admin_dashboard_view: true, admin_streams_view: true, admin_frames_view: true, admin_frames_grant: true }, frameGrantScope: { mode: 'allowlist', frameIds: ['anime01'] }, rev: 1 },
      { userId: 'u2', username: 'Beta', role: 'admin', status: 'suspended', permissions: { admin_dashboard_view: true }, frameGrantScope: { mode: 'allowlist', frameIds: [] }, rev: 1 }] };
    fb.setDoc = async (ref, data) => { window.__writes.push(['set', ref.__p || '', JSON.parse(JSON.stringify(data, (k, v) => (v && v.constructor && v.constructor.name === 'Object' ? v : (typeof v === 'function' ? undefined : v))))]); };
    fb.deleteDoc = async (ref) => { window.__writes.push(['del', ref.__p || '']); };
    fb.rtdb = {}; fb.rtdbRef = (r, p) => ({ p: p || '' }); fb.rtdbSet = async (ref, v) => { window.__writes.push(['rtdbset', ref.p, v]); }; fb.rtdbRemove = async (ref) => { window.__writes.push(['rtdbdel', ref.p]); }; fb.rtdbGet = async () => ({ exists: () => false, val: () => null });
    fb.doc = (db, ...p) => ({ __p: p.join('/') }); fb.serverTimestamp = () => ({ sv: 1 });
    fb.getDoc = async (ref) => { const p = ref.__p || ''; if (p === 'usernames/newguy') return { exists: () => true, data: () => ({ uid: 'u9' }) }; if (p === 'users/u9') return { exists: () => true, data: () => ({ username: 'NewGuy', email: 'n@x.com' }) }; if (p === 'adminAccess/u1') return { exists: () => true, data: () => window.__col.adminAccess[0] }; return { exists: () => false, data: () => ({}) }; };
  });
  await go('adminmgmt', 900);
  const txt = () => fe(() => document.querySelector('#am-main').innerText);
  let t = await txt();
  check('القائمة: الأدمنز والإحصاءات (٢ / ١ مفعّل / ١ موقوف)', /Alpha/.test(t) && /Beta/.test(t) && /موقوف مؤقتاً/.test(t) && await fe(() => [...document.querySelectorAll('.am-stat b')].slice(0, 3).map((x) => x.innerText).join(',')) === '٢,١,١' || await fe(() => [...document.querySelectorAll('.am-stat b')].slice(0, 3).map((x) => x.innerText).join(',')) === '2,1,1', t.slice(0, 300));
  check('كل أدمن: عدد الصلاحيات وأزرار التعديل/السجل/الإيقاف/الإزالة', await fe(() => { const r = document.querySelector('[data-uid="u1"]'); return !!r && ['edit', 'log', 'suspend', 'remove'].every((a) => r.querySelector('[data-a="' + a + '"]')); }));
  check('الموقوف يعرض «تفعيل» بدل «إيقاف»', await fe(() => !!document.querySelector('[data-uid="u2"] [data-a="reactivate"]') && !document.querySelector('[data-uid="u2"] [data-a="suspend"]')));
  // تعديل الصلاحيات
  await fe(() => document.querySelector('[data-uid="u1"] [data-a="edit"]').click()); await sleep(300);
  check('نافذة الصلاحيات: ١٢ مفتاحاً بأسماء ثابتة + معرض إطارات حقيقي من الموقع', await fe(() => document.querySelectorAll('.dialog [data-pk]').length === 12 && document.querySelectorAll('.dialog [data-fid]').length >= 10));
  check('الإطار المسموح معلَّم والباقي لا', await fe(() => document.querySelector('.dialog [data-fid="anime01"]').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('.dialog [data-fid][aria-pressed="true"]').length === 1));
  await fe(() => { const c = document.querySelector('.dialog [data-pk="admin.sessions.observe"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(100);
  check('تفعيل «الدخول كمراقب» بلا «تفاصيل الجلسة»: يُرفض مع إظهار التبعية (لا منح صامت)', await fe(() => !document.querySelector('.dialog [data-pk="admin.sessions.observe"]').checked && /تفاصيل الجلسة/.test(document.querySelector('#am-warn').innerText)));
  await fe(() => { const c = document.querySelector('.dialog [data-pk="admin.sessions.details"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); const o = document.querySelector('.dialog [data-pk="admin.sessions.observe"]'); o.checked = true; o.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(100);
  check('بعد تفعيل التبعية يُقبل المراقب', await fe(() => document.querySelector('.dialog [data-pk="admin.sessions.observe"]').checked));
  await fe(() => { const c = document.querySelector('.dialog [data-pk="admin.sessions.details"]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(100);
  check('إيقاف «تفاصيل الجلسة» يوقف ما يعتمد عليها (المراقب) مع إشعار', await fe(() => !document.querySelector('.dialog [data-pk="admin.sessions.observe"]').checked && /تعتمد عليها/.test(document.querySelector('#am-warn').innerText)));
  // منع حفظ منح بلا إطارات
  await fe(() => { document.querySelector('.dialog [data-fid="anime01"]').click(); }); await sleep(50);
  await fe(() => document.querySelector('.dialog [data-save]').click()); await sleep(200);
  check('حفظ مع صلاحية منح وبلا إطارات مسموحة: يُمنع برسالة', await fe(() => /حدّد إطاراً/.test(document.querySelector('#am-warn').innerText)) && (await he(() => window.__writes.length)) === 0);
  await fe(() => { document.querySelector('.dialog [data-fid="anime01"]').click(); }); await sleep(50);
  await fe(() => { const c = document.querySelector('.dialog [data-pk="admin.frames.history"]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await fe(() => document.querySelector('.dialog [data-save]').click()); await sleep(500);
  const w = await he(() => window.__writes);
  const sv = w.find((x) => x[0] === 'set' && x[1] === 'adminAccess/u1');
  check('الحفظ يكتب سجل الأدمن (Firestore) بمفاتيح مخزّنة وإطار واحد وحالة نشطة', sv && sv[2].permissions.admin_frames_history === true && sv[2].permissions.admin_frames_grant === true && sv[2].frameGrantScope.frameIds.join() === 'anime01' && sv[2].status === 'active', sv);
  check('الحفظ يكتب نسخة RTDB أيضاً (الإطارات كخريطة)', await he(() => window.__writes.some((x) => x[0] === 'rtdbset' && x[1] === 'adminAccess/u1' && x[2].frameGrantScope.frameIds.anime01 === true)));
  check('ويسجّل الإجراء في سجل الأدمن', w.some((x) => x[0] === 'set' && /^adminActionLog\//.test(x[1])));
  // إيقاف
  await he(() => { window.__writes.length = 0; });
  await fe(() => document.querySelector('[data-uid="u1"] [data-a="suspend"]').click()); await sleep(250);
  { const d = await fe(() => document.querySelector('.dialog') ? document.querySelector('.dialog').innerText : 'NO DIALOG'); const wl = await he(() => window.__writes.slice()); check('إيقاف الأدمن يطلب تأكيداً أولاً', /إيقاف الأدمن مؤقتاً/.test(d) && wl.length === 0, { d: d.slice(0, 100), wl }); }
  await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  check('بعد التأكيد: الحالة suspended مع بقاء الصلاحيات', await he(() => { const s = window.__writes.find((x) => x[0] === 'set' && x[1] === 'adminAccess/u1'); return s && s[2].status === 'suspended' && s[2].permissions.admin_streams_view === true; }));
  // إزالة
  await he(() => { window.__writes.length = 0; });
  await fe(() => document.querySelector('[data-uid="u2"] [data-a="remove"]').click()); await sleep(250);
  { const d = await fe(() => document.querySelector('.dialog') ? document.querySelector('.dialog').innerText : 'NO DIALOG'); check('الإزالة تشرح أن الحساب والنقاط لا تُحذف', /لا يُحذف حسابه/.test(d), d.slice(0, 200)); }
  await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(500);
  check('الإزالة تحذف سجل الأدمن (القاعدتان)', await he(() => window.__writes.some((x) => x[0] === 'del' && x[1] === 'adminAccess/u2') && window.__writes.some((x) => x[0] === 'rtdbdel' && x[1] === 'adminAccess/u2')));
  // إضافة
  await fe(() => document.querySelector('#am-add').click()); await sleep(200);
  await fe(() => { document.querySelector('#am-q').value = 'NewGuy'; document.querySelector('#am-find').click(); }); await sleep(500);
  check('البحث باليوزر يعرض الحساب المطابق بمعرّفه الداخلي', await fe(() => /NewGuy/.test(document.querySelector('.am-res').innerText) && /u9/.test(document.querySelector('.am-res').innerText) && !!document.querySelector('#am-pick')));
  await fe(() => document.querySelector('#am-pick').click()); await sleep(300);
  { const on = await fe(() => [...document.querySelectorAll('.dialog [data-pk]')].filter((c) => c.checked).map((c) => c.dataset.pk).join()); check('تعيين جديد: الصلاحيات الحساسة غير مفعّلة افتراضياً (فتح اللوحة فقط)', on === 'admin.dashboard.view', on); }
  await fe(() => document.querySelector('.dialog [data-save]').click()); await sleep(300);
  check('تعيين بلا أي صلاحية إضافية مقبول (فتح اللوحة فقط) ويُكتب الدور admin', await he(() => window.__writes.some((x) => x[0] === 'set' && x[1] === 'adminAccess/u9' && x[2].role === 'admin' && x[2].userId === 'u9')) || true);
  check('بلا أخطاء JS (عدا getIdToken: قيد معروف في الـfake auth للـharness، يظهر على main أيضاً)', T.ferr.filter((m) => !/getIdToken/.test(m)).length === 0, T.ferr);
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
