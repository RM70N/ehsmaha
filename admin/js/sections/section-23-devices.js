// ==================== القسم 23 — إدارة الأجهزة والجلسات ====================
// يعتمد على deviceSessions/{uid} — مستند تُنشئه/تُحدّثه إضافة صغيرة أضفناها
// بالموقع الرئيسي (index.html) عند كل تسجيل دخول: current + history (آخر 20
// جهاز) + forceLogoutDeviceIds (يُفرَغ تلقائياً من جهة العميل بعد التنفيذ)
// + trustedDeviceIds. راجع admin/README.md لتفاصيل الإضافة.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;

async function resolveUidByUsername(usernameRaw) {
  const usernameLower = usernameRaw.trim().toLowerCase();
  const unameSnap = await fb.getDoc(fb.doc(fb.db, 'usernames', usernameLower));
  if (!unameSnap.exists()) return null;
  return unameSnap.data().uid;
}

function classifyDevice(ua) {
  if (!ua) return 'غير معروف';
  if (/tablet|ipad/i.test(ua)) return 'تابلت';
  if (/mobile|android|iphone/i.test(ua)) return 'جوال';
  return 'ديسكتوب';
}
function classifyOS(ua) {
  if (!ua) return 'غير معروف';
  if (/windows/i.test(ua)) return 'Windows';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
  if (/mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'غير معروف';
}
function classifyBrowser(ua) {
  if (!ua) return 'غير معروف';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/chrome\//i.test(ua)) return 'Chrome';
  if (/safari\//i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
  if (/firefox\//i.test(ua)) return 'Firefox';
  return 'غير معروف';
}

function userSearchModal(title, onFound) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="dv-search-username" placeholder="اكتب اليوزر بدون @" /></div>
    <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary admin-btn--sm" id="dv-search-go">بحث</button></div>
    <div id="dv-search-result" style="margin-top:14px;"></div>
  `;
  const modal = openModal({ title, bodyEl: body, size: 'lg' });
  body.querySelector('#dv-search-go').addEventListener('click', async () => {
    const uname = body.querySelector('#dv-search-username').value;
    if (!uname.trim()) return;
    const result = body.querySelector('#dv-search-result');
    result.textContent = 'جارٍ البحث...';
    const uid = await resolveUidByUsername(uname);
    if (!uid) { result.innerHTML = '<p>ما فيه مستخدم بهذا الاسم</p>'; return; }
    const snap = await fb.getDoc(fb.doc(fb.db, 'deviceSessions', uid));
    if (!snap.exists()) { result.innerHTML = '<p>ما فيه سجل أجهزة لهذا الحساب بعد (ما سجّل دخول من بعد ما فُعِّل التتبع)</p>'; return; }
    onFound(result, uid, snap.data());
  });
  return modal;
}

defineSection({
  id: 23,
  title: 'إدارة الأجهزة والجلسات',
  description: 'تتبع أجهزة اللاعبين (بصمة جهاز محلية + متصفح/منصة/موقع تقريبي) — يعمل تلقائياً منذ تفعيل هذي المرحلة.',
  tools: [
    {
      title: 'عرض كل الأجهزة المسجَّل دخولها لحساب لاعب معيّن',
      keywords: 'اجهزة حساب لاعب',
      run: () => userSearchModal('أجهزة حساب لاعب', (result, uid, data) => {
        const devices = new Map();
        [data.current, ...(data.history || [])].filter(Boolean).forEach((e) => {
          if (!devices.has(e.deviceId)) devices.set(e.deviceId, e);
        });
        const rows = [...devices.values()];
        result.innerHTML = `<table class="admin-table"><thead><tr><th>الجهاز</th><th>النظام/المتصفح</th><th>آخر ظهور</th><th>الموقع</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الجهاز" class="is-primary">${r.deviceId.slice(0, 14)}</td><td data-label="النظام">${classifyOS(r.userAgent)} / ${classifyBrowser(r.userAgent)}</td><td data-label="آخر ظهور">${fmtDate(r.ts)}</td><td data-label="الموقع">${r.city || '—'}, ${r.country || '—'}</td></tr>`).join('')}</tbody></table>`;
      })
    },
    {
      title: 'تسجيل خروج قسري لجهاز واحد فقط',
      keywords: 'تسجيل خروج جهاز واحد',
      run: () => userSearchModal('تسجيل خروج قسري لجهاز واحد', (result, uid, data) => {
        const devices = new Map();
        [data.current, ...(data.history || [])].filter(Boolean).forEach((e) => { if (!devices.has(e.deviceId)) devices.set(e.deviceId, e); });
        const rows = [...devices.values()];
        result.innerHTML = `<table class="admin-table"><thead><tr><th>الجهاز</th><th>آخر ظهور</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الجهاز">${r.deviceId.slice(0, 14)}</td><td data-label="آخر ظهور">${fmtDate(r.ts)}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-logout="${r.deviceId}">تسجيل خروج</button></td></tr>`).join('')}</tbody></table>`;
        result.querySelectorAll('[data-logout]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const deviceId = btn.getAttribute('data-logout');
          await fb.updateDoc(fb.doc(fb.db, 'deviceSessions', uid), { forceLogoutDeviceIds: fb.arrayUnion(deviceId) });
          await AdminAudit.log({ section: 23, sectionTitle: 'إدارة الأجهزة والجلسات', actionKey: 'devices.logoutOne', actionLabel: 'تسجيل خروج جهاز واحد', targetType: 'user', targetId: uid, sensitive: true });
          AdminToast.success('تم إرسال أمر تسجيل الخروج لهذا الجهاز');
        }));
      })
    },
    {
      title: 'تسجيل خروج قسري من كل الأجهزة لحساب معيّن',
      keywords: 'تسجيل خروج كل الاجهزة',
      run: () => userSearchModal('تسجيل خروج من كل الأجهزة', (result, uid, data) => {
        const ids = new Set([data.current, ...(data.history || [])].filter(Boolean).map((e) => e.deviceId));
        result.innerHTML = `<p>عدد الأجهزة المعروفة لهذا الحساب: ${ids.size}</p><button class="admin-btn admin-btn--danger" id="dv-logout-all">تسجيل خروج من الكل الآن</button>`;
        result.querySelector('#dv-logout-all').addEventListener('click', () => {
          openConfirm({
            title: 'تسجيل خروج من كل الأجهزة', danger: true,
            message: `بيسجّل خروج هذا الحساب من ${ids.size} جهاز فوراً بمجرد ما يتحقق كل جهاز من الاتصال.`,
            onConfirm: async () => {
              await fb.updateDoc(fb.doc(fb.db, 'deviceSessions', uid), { forceLogoutDeviceIds: [...ids] });
              await AdminAudit.log({ section: 23, sectionTitle: 'إدارة الأجهزة والجلسات', actionKey: 'devices.logoutAll', actionLabel: 'تسجيل خروج من كل الأجهزة', targetType: 'user', targetId: uid, sensitive: true });
              AdminToast.success('تم');
            }
          });
        });
      })
    },
    {
      title: 'عرض آخر نشاط لكل جهاز (نوع الجهاز، المتصفح، الموقع)',
      keywords: 'اخر نشاط جهاز متصفح موقع',
      run: () => userSearchModal('آخر نشاط لكل جهاز', (result, uid, data) => {
        const e = data.current;
        result.innerHTML = e ? `
          <dl class="admin-kv">
            <dt>نوع الجهاز</dt><dd>${classifyDevice(e.userAgent)}</dd>
            <dt>النظام</dt><dd>${classifyOS(e.userAgent)}</dd>
            <dt>المتصفح</dt><dd>${classifyBrowser(e.userAgent)}</dd>
            <dt>الموقع التقريبي</dt><dd>${e.city || '—'}, ${e.country || '—'}</dd>
            <dt>آخر ظهور</dt><dd>${fmtDate(e.ts)}</dd>
          </dl>` : '<p>لا يوجد نشاط مسجَّل</p>';
      })
    },
    {
      title: 'حظر جهاز معيّن (بصمة الجهاز) من الدخول مرة أخرى',
      keywords: 'حظر جهاز بصمة',
      run: () => userSearchModal('حظر جهاز', (result, uid, data) => {
        const devices = new Map();
        [data.current, ...(data.history || [])].filter(Boolean).forEach((e) => { if (!devices.has(e.deviceId)) devices.set(e.deviceId, e); });
        const rows = [...devices.values()];
        result.innerHTML = `<table class="admin-table"><thead><tr><th>الجهاز</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الجهاز">${r.deviceId.slice(0, 14)}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-ban="${r.deviceId}">حظر هذا الجهاز</button></td></tr>`).join('')}</tbody></table>`;
        result.querySelectorAll('[data-ban]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const deviceId = btn.getAttribute('data-ban');
          await fb.setDoc(fb.doc(fb.db, 'adminDeviceBans', deviceId), { ts: fb.serverTimestamp(), byUid: uid });
          await AdminAudit.log({ section: 23, sectionTitle: 'إدارة الأجهزة والجلسات', actionKey: 'devices.ban', actionLabel: 'حظر جهاز', targetType: 'device', targetId: deviceId, sensitive: true });
          AdminToast.success('تم حظر الجهاز نهائياً');
        }));
      })
    },
    {
      title: 'تنبيه عند دخول حساب من جهاز/موقع جديد غير معتاد',
      keywords: 'تنبيه جهاز جديد غير معتاد',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص (يقرأ كل الحسابات)...';
        openModal({ title: 'حسابات دخلت من موقع جديد غير معتاد', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
        const flagged = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const hist = (data.history || []).filter((h) => h && h.country);
          if (hist.length < 2) return;
          const prevCountries = new Set(hist.slice(1).map((h) => h.country));
          if (hist[0].country && !prevCountries.has(hist[0].country)) {
            flagged.push({ username: data.username || d.id, newCountry: hist[0].country, knownCountries: [...prevCountries].join('، ') });
          }
        });
        body.innerHTML = flagged.length ? `<table class="admin-table"><thead><tr><th>المستخدم</th><th>الدولة الجديدة</th><th>الدول المعروفة سابقاً</th></tr></thead>
          <tbody>${flagged.map((f) => `<tr><td class="is-primary" data-label="المستخدم">${f.username}</td><td data-label="الجديدة">${f.newCountry}</td><td data-label="المعروفة">${f.knownCountries}</td></tr>`).join('')}</tbody></table>` : '<p>ولا حساب دخل من موقع غير معتاد مؤخراً</p>';
      }
    },
    {
      title: 'عدد الأجهزة المسموح بها لكل حساب وتعديل الحد',
      keywords: 'حد اجهزة مسموح',
      run: async () => {
        const cur = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'deviceLimits'));
        const max = (cur.data() && cur.data().maxDevicesPerAccount) || 5;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">أقصى عدد أجهزة لكل حساب</span><input class="admin-input" id="dv-max" type="number" value="${max}" min="1" /></div>
        <p class="admin-field__hint">هذا حد إرشادي معروض هنا فقط بالمرحلة الحالية — منع الدخول تلقائياً عند تجاوزه يحتاج تفعيل إضافي بالموقع الرئيسي.</p>
        <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary admin-btn--sm" id="dv-max-save">حفظ</button></div>`;
        openModal({ title: 'حد الأجهزة لكل حساب', bodyEl: body, size: 'sm' });
        body.querySelector('#dv-max-save').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'deviceLimits'), { maxDevicesPerAccount: Number(body.querySelector('#dv-max').value) }, { merge: true });
          AdminToast.success('تم الحفظ');
        });
      }
    },
    {
      title: 'سجل تاريخي لكل الأجهزة التي استخدمها حساب معيّن',
      keywords: 'سجل تاريخي اجهزة',
      run: () => userSearchModal('السجل التاريخي الكامل للأجهزة', (result, uid, data) => {
        const hist = data.history || [];
        result.innerHTML = hist.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الجهاز</th><th>النظام/المتصفح</th><th>الموقع</th></tr></thead>
          <tbody>${hist.map((h) => `<tr><td data-label="الوقت">${fmtDate(h.ts)}</td><td data-label="الجهاز">${h.deviceId.slice(0, 14)}</td><td data-label="النظام">${classifyOS(h.userAgent)}/${classifyBrowser(h.userAgent)}</td><td data-label="الموقع">${h.city || '—'}, ${h.country || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل بعد</p>';
      })
    },
    {
      title: 'مقارنة نشاط اللاعب عبر أجهزته المختلفة',
      keywords: 'مقارنة نشاط اجهزة',
      run: () => userSearchModal('مقارنة النشاط عبر الأجهزة', (result, uid, data) => {
        const hist = data.history || [];
        const byDevice = new Map();
        hist.forEach((h) => {
          if (!byDevice.has(h.deviceId)) byDevice.set(h.deviceId, { count: 0, last: 0 });
          const e = byDevice.get(h.deviceId);
          e.count++;
          e.last = Math.max(e.last, h.ts || 0);
        });
        const rows = [...byDevice.entries()];
        result.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الجهاز</th><th>عدد مرات الدخول</th><th>آخر ظهور</th></tr></thead>
          <tbody>${rows.map(([id, e]) => `<tr><td data-label="الجهاز">${id.slice(0, 14)}</td><td data-label="العدد">${e.count}</td><td data-label="آخر ظهور">${fmtDate(e.last)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات كافية</p>';
      })
    },
    {
      title: 'تحديد جهاز "موثوق" لا يحتاج تحقق إضافي',
      keywords: 'جهاز موثوق',
      run: () => userSearchModal('تحديد جهاز موثوق', (result, uid, data) => {
        const trusted = new Set(data.trustedDeviceIds || []);
        const devices = new Map();
        [data.current, ...(data.history || [])].filter(Boolean).forEach((e) => { if (!devices.has(e.deviceId)) devices.set(e.deviceId, e); });
        const rows = [...devices.values()];
        result.innerHTML = `<table class="admin-table"><thead><tr><th>الجهاز</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الجهاز">${r.deviceId.slice(0, 14)}</td><td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-trust="${r.deviceId}">${trusted.has(r.deviceId) ? 'إلغاء الثقة' : 'وسم كموثوق'}</button></td></tr>`).join('')}</tbody></table>`;
        result.querySelectorAll('[data-trust]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const deviceId = btn.getAttribute('data-trust');
          const isTrusted = trusted.has(deviceId);
          await fb.updateDoc(fb.doc(fb.db, 'deviceSessions', uid), { trustedDeviceIds: isTrusted ? fb.arrayRemove(deviceId) : fb.arrayUnion(deviceId) });
          AdminToast.success('تم التحديث');
          btn.textContent = isTrusted ? 'وسم كموثوق' : 'إلغاء الثقة';
          if (isTrusted) trusted.delete(deviceId); else trusted.add(deviceId);
        }));
      })
    },
    {
      title: 'كشف تسجيل دخول متزامن من موقعين جغرافيين متباعدين',
      keywords: 'دخول متزامن مواقع متباعدة اختراق',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'اشتباه اختراق — دخول متزامن من مواقع متباعدة', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
        const flagged = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          const hist = (data.history || []).filter((h) => h && h.country && h.ts);
          for (let i = 0; i < hist.length - 1; i++) {
            const gapMs = Math.abs((hist[i].ts || 0) - (hist[i + 1].ts || 0));
            if (hist[i].country !== hist[i + 1].country && gapMs < 2 * 3600000) {
              flagged.push({ username: data.username || d.id, a: hist[i].country, b: hist[i + 1].country, gapMin: Math.round(gapMs / 60000) });
              break;
            }
          }
        });
        body.innerHTML = flagged.length ? `<table class="admin-table"><thead><tr><th>المستخدم</th><th>الدولة 1</th><th>الدولة 2</th><th>الفارق (دقيقة)</th></tr></thead>
          <tbody>${flagged.map((f) => `<tr><td class="is-primary" data-label="المستخدم">${f.username}</td><td data-label="د1">${f.a}</td><td data-label="د2">${f.b}</td><td data-label="الفارق">${f.gapMin}</td></tr>`).join('')}</tbody></table>` : '<p>ولا اشتباه حالياً</p>';
      }
    },
    {
      title: 'عرض توزيع المستخدمين حسب نوع الجهاز',
      keywords: 'توزيع نوع جهاز جوال تابلت ديسكتوب',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'توزيع المستخدمين حسب نوع الجهاز', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
        const counts = new Map();
        snap.docs.forEach((d) => {
          const ua = d.data().current && d.data().current.userAgent;
          const k = classifyDevice(ua);
          counts.set(k, (counts.get(k) || 0) + 1);
        });
        const sorted = [...counts.entries()];
        body.innerHTML = sorted.length ? renderBarChart({ labels: sorted.map((s) => s[0]), values: sorted.map((s) => s[1]), height: 200 }) : '<p>لا يوجد بيانات بعد</p>';
      }
    },
    {
      title: 'عرض توزيع المستخدمين حسب نظام التشغيل والمتصفح',
      keywords: 'توزيع نظام تشغيل متصفح',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'توزيع نظام التشغيل والمتصفح', bodyEl: body, size: 'xl' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
        const osCounts = new Map();
        const brCounts = new Map();
        snap.docs.forEach((d) => {
          const ua = d.data().current && d.data().current.userAgent;
          osCounts.set(classifyOS(ua), (osCounts.get(classifyOS(ua)) || 0) + 1);
          brCounts.set(classifyBrowser(ua), (brCounts.get(classifyBrowser(ua)) || 0) + 1);
        });
        const os = [...osCounts.entries()];
        const br = [...brCounts.entries()];
        body.innerHTML = `
          <h4 style="color:var(--text-secondary);font-size:12.5px;">نظام التشغيل</h4>
          ${os.length ? renderBarChart({ labels: os.map((s) => s[0]), values: os.map((s) => s[1]), height: 170 }) : '<p>لا يوجد بيانات</p>'}
          <h4 style="color:var(--text-secondary);font-size:12.5px;margin-top:16px;">المتصفح</h4>
          ${br.length ? renderBarChart({ labels: br.map((s) => s[0]), values: br.map((s) => s[1]), height: 170 }) : '<p>لا يوجد بيانات</p>'}
        `;
      }
    },
    {
      title: 'إعادة تعيين بصمة الجهاز المخزَّنة لحساب معيّن',
      keywords: 'اعادة تعيين بصمة جهاز',
      run: () => userSearchModal('إعادة تعيين بصمة الجهاز', (result, uid, data) => {
        result.innerHTML = '<p>هذا يمسح كل سجل الأجهزة المخزَّن لهذا الحساب (current + history) — الجهاز الحالي يُسجَّل من جديد كجهاز أول بمرة الدخول الجاية.</p><button class="admin-btn admin-btn--danger" id="dv-reset">إعادة التعيين الآن</button>';
        result.querySelector('#dv-reset').addEventListener('click', () => {
          openConfirm({
            title: 'تأكيد إعادة التعيين', danger: true,
            message: 'بيُمسح كل سجل الأجهزة لهذا الحساب نهائياً.',
            onConfirm: async () => {
              await fb.setDoc(fb.doc(fb.db, 'deviceSessions', uid), { current: null, history: [], trustedDeviceIds: [] }, { merge: true });
              await AdminAudit.log({ section: 23, sectionTitle: 'إدارة الأجهزة والجلسات', actionKey: 'devices.reset', actionLabel: 'إعادة تعيين بصمة الجهاز', targetType: 'user', targetId: uid, sensitive: true });
              AdminToast.success('تم');
            }
          });
        });
      })
    },
    {
      title: 'تصدير تقرير أجهزة شهري',
      keywords: 'تصدير تقرير اجهزة شهري',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
        const rows = snap.docs.map((d) => {
          const data = d.data();
          const e = data.current;
          return [data.username || d.id, e ? classifyDevice(e.userAgent) : '—', e ? classifyOS(e.userAgent) : '—', e ? classifyBrowser(e.userAgent) : '—', e ? `${e.city || ''} ${e.country || ''}`.trim() : '—', fmtDate(e && e.ts)];
        });
        csvDownload('devices-report.csv', [['المستخدم', 'نوع الجهاز', 'النظام', 'المتصفح', 'الموقع', 'آخر ظهور'], ...rows]);
        printReport('تقرير الأجهزة الشهري', `<p>إجمالي الحسابات المتتبَّعة: ${fmtNum(snap.size)}</p>`);
      }
    }
  ]
});
