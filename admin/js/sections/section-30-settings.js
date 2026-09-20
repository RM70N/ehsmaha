// ==================== القسم 30 — إعدادات اللوحة نفسها ====================
import { AdminFB } from '../core/firebase.js';
import { AdminAuth } from '../core/auth.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { SECTION_TITLES } from '../core/app.js';
import { AdminPalette } from '../core/command-palette.js';
import { fmtDate } from '../core/format.js';
import { generateTotpSecret, verifyTotp, totpOtpAuthUrl } from '../core/totp.js';

const fb = AdminFB;
const PANEL_DOC = () => fb.doc(fb.db, 'adminSettings', 'panel');

async function getPanelSettings() {
  const snap = await fb.getDoc(PANEL_DOC());
  return snap.exists() ? snap.data() : {};
}

const CHANGELOG = [
  { v: '1.0.0', date: '2026-09-20', note: 'إطلاق المرحلة 1: نظرة عامة، الأمان، سجل الأحداث، الأجهزة، إعدادات اللوحة.' }
];

defineSection({
  id: 30,
  title: 'إعدادات اللوحة',
  description: 'إعدادات لوحة "ادمن احسمها" نفسها — لا تؤثر على الموقع الرئيسي.',
  tools: [
    {
      title: 'تغيير كلمة مرور حساب الأدمن',
      keywords: 'تغيير كلمة مرور',
      run: () => {
        openFormModal({
          title: 'تغيير كلمة المرور',
          fields: [
            { key: 'current', label: 'كلمة المرور الحالية', type: 'password', required: true },
            { key: 'next', label: 'كلمة المرور الجديدة', type: 'password', required: true },
            { key: 'confirm', label: 'تأكيد كلمة المرور الجديدة', type: 'password', required: true }
          ],
          onSubmit: async (v) => {
            if (v.next !== v.confirm) throw new Error('كلمتا المرور غير متطابقتين');
            if (v.next.length < 8) throw new Error('كلمة المرور لازم 8 أحرف على الأقل');
            await AdminAuth.reauthenticate(v.current);
            await fb.updatePassword(AdminAuth.currentAdmin, v.next);
            await AdminAudit.log({ section: 30, sectionTitle: 'إعدادات اللوحة', actionKey: 'settings.changePassword', actionLabel: 'تغيير كلمة مرور الأدمن', sensitive: true });
            AdminToast.success('تم تغيير كلمة المرور');
          }
        });
      }
    },
    {
      title: 'تفعيل مصادقة ثنائية (2FA) لدخول اللوحة',
      keywords: '2fa تحقق ثنائي totp',
      run: async () => {
        const cur = await getPanelSettings();
        const body = document.createElement('div');
        if (cur.totpEnabled) {
          body.innerHTML = `<p>المصادقة الثنائية مفعّلة حالياً. لتعطيلها، أدخل رمزاً حالياً من تطبيق المصادقة.</p>
            <div class="admin-field"><span class="admin-field__label">الرمز الحالي</span><input class="admin-input" id="totp-disable-code" maxlength="6" /></div>
            <div class="admin-modal__actions"><button class="admin-btn admin-btn--danger admin-btn--sm" id="totp-disable-go">تعطيل 2FA</button></div>`;
          openModal({ title: 'المصادقة الثنائية', bodyEl: body, size: 'sm' });
          body.querySelector('#totp-disable-go').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const ok = await verifyTotp(cur.totpSecret, body.querySelector('#totp-disable-code').value);
            if (!ok) { AdminToast.error('رمز خاطئ'); return; }
            await fb.setDoc(PANEL_DOC(), { totpEnabled: false, totpSecret: fb.deleteField() }, { merge: true });
            await AdminAudit.log({ section: 30, sectionTitle: 'إعدادات اللوحة', actionKey: 'settings.disable2fa', actionLabel: 'تعطيل المصادقة الثنائية', sensitive: true });
            AdminToast.success('تم التعطيل');
          });
        } else {
          const secret = generateTotpSecret();
          const url = totpOtpAuthUrl(secret, AdminAuth.currentAdmin.email);
          body.innerHTML = `
            <p>أضف هذا السرّ يدوياً بتطبيق مصادقة (Google Authenticator/Authy) — "إضافة حساب يدوياً بمفتاح".</p>
            <div class="admin-kv"><dt>السرّ</dt><dd style="direction:ltr;font-family:monospace;">${secret}</dd></div>
            <p class="admin-field__hint" style="word-break:break-all;">${url}</p>
            <div class="admin-field"><span class="admin-field__label">أدخل الرمز الظاهر بالتطبيق للتأكيد والتفعيل</span><input class="admin-input" id="totp-enable-code" maxlength="6" /></div>
            <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary admin-btn--sm" id="totp-enable-go">تفعيل 2FA</button></div>
          `;
          openModal({ title: 'تفعيل المصادقة الثنائية', bodyEl: body, size: 'md' });
          body.querySelector('#totp-enable-go').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const ok = await verifyTotp(secret, body.querySelector('#totp-enable-code').value);
            if (!ok) { AdminToast.error('الرمز غير مطابق — تأكد من ساعة جهازك وحاول مرة ثانية'); return; }
            await fb.setDoc(PANEL_DOC(), { totpEnabled: true, totpSecret: secret }, { merge: true });
            await AdminAudit.log({ section: 30, sectionTitle: 'إعدادات اللوحة', actionKey: 'settings.enable2fa', actionLabel: 'تفعيل المصادقة الثنائية', sensitive: true });
            AdminToast.success('تم التفعيل — راح تحتاج الرمز بكل تسجيل دخول جديد');
          });
        }
      }
    },
    {
      title: 'سجل دخول الأدمن (متى وأين)',
      keywords: 'سجل دخول متى اين',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'adminLoginAttempts'), fb.orderBy('ts', 'desc'), fb.limit(200)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.success);
        const body = document.createElement('div');
        body.className = 'admin-table-wrap';
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>IP</th><th>الموقع</th><th>الجهاز</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="IP">${r.ip || '—'}</td><td data-label="الموقع">${r.city || ''} ${r.country || ''}</td><td data-label="الجهاز">${(r.userAgent || '').slice(0, 50)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا دخول ناجح مسجَّل بعد</p>';
        openModal({ title: 'سجل دخول ناجح للوحة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تخصيص الاختصارات السريعة الظاهرة بالشاشة الرئيسية',
      keywords: 'اختصارات مثبتة تخصيص',
      run: async () => {
        const cur = await getPanelSettings();
        const pinned = cur.pinnedShortcuts || [];
        const allTools = AdminPalette.all();
        const body = document.createElement('div');
        body.innerHTML = `
          <p class="admin-field__hint">اختر حتى 6 أدوات تثبَّت دائماً (بغض النظر عن آخر استخدام).</p>
          <div class="admin-table-wrap" style="max-height:340px;overflow-y:auto;">
            ${allTools.map((t) => {
              const key = `${t.sectionNo}-${t.toolTitle}`;
              return `<label class="admin-field admin-field--checkbox"><input type="checkbox" data-pin="${key}" data-section="${t.sectionNo}" data-title="${t.toolTitle.replace(/"/g, '')}" ${pinned.some((p) => p.key === key) ? 'checked' : ''}/><span>${t.sectionNo}. ${t.toolTitle}</span></label>`;
            }).join('')}
          </div>
          <div class="admin-modal__actions" style="margin-top:12px;"><button class="admin-btn admin-btn--primary admin-btn--sm" id="pin-save">حفظ</button></div>
        `;
        const modal = openModal({ title: 'اختصارات مثبَّتة', bodyEl: body, size: 'lg' });
        body.querySelector('#pin-save').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const checked = [...body.querySelectorAll('[data-pin]:checked')].slice(0, 6).map((el) => ({ key: el.getAttribute('data-pin'), sectionNo: Number(el.getAttribute('data-section')), title: el.getAttribute('data-title') }));
          await fb.setDoc(PANEL_DOC(), { pinnedShortcuts: checked }, { merge: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'تفعيل/تعطيل التنبيهات الصوتية للأحداث الحرجة',
      keywords: 'تنبيهات صوتية',
      run: async () => {
        const cur = await getPanelSettings();
        openFormModal({
          title: 'التنبيهات الصوتية', fields: [{ key: 'soundAlerts', label: 'تفعيل صوت عند كل تنبيه', type: 'checkbox', value: cur.soundAlerts }],
          onSubmit: async (v) => { await fb.setDoc(PANEL_DOC(), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تحديد الوضع الليلي/النهاري للوحة',
      keywords: 'وضع ليلي نهاري ثيم',
      run: async () => {
        const cur = await getPanelSettings();
        openFormModal({
          title: 'مظهر اللوحة',
          fields: [{ key: 'theme', label: 'المظهر', type: 'select', value: cur.theme || 'dark', options: [{ value: 'dark', label: 'ليلي (افتراضي)' }, { value: 'light', label: 'نهاري' }] }],
          onSubmit: async (v) => { await fb.setDoc(PANEL_DOC(), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'ضبط تكرار تحديث الإحصائيات اللحظية',
      keywords: 'تكرار تحديث ثواني',
      run: async () => {
        const cur = await getPanelSettings();
        openFormModal({
          title: 'تكرار الفحوصات الدورية',
          fields: [{ key: 'refreshMs', label: 'كل كم ميلي ثانية (يطبَّق على فحوصات مثل حالة سيرفر الجسر)', type: 'number', value: cur.refreshMs || 60000, min: 5000, hint: 'أغلب أرقام اللوحة حيّة لحظياً أصلاً (onSnapshot) وما تحتاج هذا الإعداد — يخص فقط الفحوصات الدورية اليدوية.' }],
          onSubmit: async (v) => { await fb.setDoc(PANEL_DOC(), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تصدير/استيراد كل إعدادات اللوحة كملف نسخة احتياطية',
      keywords: 'تصدير استيراد اعدادات نسخة احتياطية',
      run: async () => {
        const cur = await getPanelSettings();
        const body = document.createElement('div');
        body.innerHTML = `
          <button class="admin-btn admin-btn--ghost" id="settings-export">تصدير الإعدادات (JSON)</button>
          <div class="admin-field" style="margin-top:14px;"><span class="admin-field__label">استيراد من ملف</span><input class="admin-input" type="file" id="settings-import" accept="application/json" /></div>
        `;
        openModal({ title: 'نسخ احتياطي لإعدادات اللوحة', bodyEl: body, size: 'sm' });
        body.querySelector('#settings-export').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify(cur, null, 2)], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'ehsmaha-admin-settings.json';
          a.click();
        });
        body.querySelector('#settings-import').addEventListener('change', async (e) => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const file = e.target.files[0];
          if (!file) return;
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            delete data.totpSecret; // ما نستورد سرّ 2FA من ملف خارجي لأسباب أمنية
            await fb.setDoc(PANEL_DOC(), data, { merge: true });
            AdminToast.success('تم الاستيراد');
          } catch (err) { AdminToast.error('ملف غير صالح'); }
        });
      }
    },
    {
      title: 'عرض نسخة/إصدار اللوحة الحالية وسجل التحديثات',
      keywords: 'اصدار نسخة تحديثات changelog',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<p>الإصدار الحالي: <strong>${CHANGELOG[0].v}</strong></p>
          <table class="admin-table"><thead><tr><th>الإصدار</th><th>التاريخ</th><th>التفاصيل</th></tr></thead>
          <tbody>${CHANGELOG.map((c) => `<tr><td data-label="الإصدار">${c.v}</td><td data-label="التاريخ">${c.date}</td><td data-label="التفاصيل">${c.note}</td></tr>`).join('')}</tbody></table>`;
        openModal({ title: 'إصدار اللوحة وسجل التحديثات', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تفعيل وضع "قراءة فقط" مؤقت',
      keywords: 'وضع قراءة فقط',
      run: async () => {
        const cur = await getPanelSettings();
        openConfirm({
          title: cur.readOnlyMode ? 'تعطيل وضع القراءة فقط' : 'تفعيل وضع القراءة فقط',
          message: cur.readOnlyMode ? 'راح تقدر تنفّذ إجراءات على اللوحة من جديد.' : 'راح تمنع نفسك من تنفيذ أي إجراء (حذف/تعديل/منح) بالخطأ لحد ما تعطّله من هنا مرة ثانية.',
          onConfirm: async () => {
            await fb.setDoc(PANEL_DOC(), { readOnlyMode: !cur.readOnlyMode }, { merge: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تخصيص القائمة الجانبية (ترتيب الأقسام حسب استخدامك)',
      keywords: 'ترتيب قائمة جانبية',
      run: async () => {
        const cur = await getPanelSettings();
        const all = Object.keys(SECTION_TITLES).map(Number);
        let order = (cur.sidebarOrder || []).filter((id) => all.includes(id));
        all.forEach((id) => { if (!order.includes(id)) order.push(id); });
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `
            <div class="admin-table-wrap" style="max-height:360px;overflow-y:auto;">
              ${order.map((id, i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid var(--border);">
                <span style="flex:1;">${id}. ${SECTION_TITLES[id]}</span>
                <button class="admin-btn admin-btn--ghost admin-btn--sm" data-up="${i}" ${i === 0 ? 'disabled' : ''}>أعلى</button>
                <button class="admin-btn admin-btn--ghost admin-btn--sm" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>أسفل</button>
              </div>`).join('')}
            </div>
            <div class="admin-modal__actions" style="margin-top:12px;"><button class="admin-btn admin-btn--primary admin-btn--sm" id="order-save">حفظ الترتيب</button></div>
          `;
          body.querySelectorAll('[data-up]').forEach((btn) => btn.addEventListener('click', () => {
            const i = Number(btn.getAttribute('data-up'));
            [order[i - 1], order[i]] = [order[i], order[i - 1]];
            draw();
          }));
          body.querySelectorAll('[data-down]').forEach((btn) => btn.addEventListener('click', () => {
            const i = Number(btn.getAttribute('data-down'));
            [order[i + 1], order[i]] = [order[i], order[i + 1]];
            draw();
          }));
          body.querySelector('#order-save').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            await fb.setDoc(PANEL_DOC(), { sidebarOrder: order }, { merge: true });
            AdminToast.success('تم الحفظ — يظهر فوراً بالقائمة الجانبية');
          });
        }
        draw();
        openModal({ title: 'ترتيب القائمة الجانبية', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تفعيل تنبيه بريدي/رسالة عند دخول اللوحة من جهاز جديد',
      keywords: 'تنبيه جهاز جديد بريد',
      badge: 'يحتاج ربط خارجي (للبريد فقط)',
      run: async () => {
        const cur = await getPanelSettings();
        openFormModal({
          title: 'تنبيه عند دخول من جهاز جديد',
          fields: [
            { key: 'newDeviceAlertEnabled', label: 'مفعّل (تنبيه داخل اللوحة يعمل فعلياً الآن)', type: 'checkbox', value: cur.newDeviceAlertEnabled },
            { key: 'newDeviceAlertEmail', label: 'إيميل استقبال التنبيه (يحتاج خدمة بريد خارجية لاحقاً)', value: cur.newDeviceAlertEmail || '' }
          ],
          onSubmit: async (v) => { await fb.setDoc(PANEL_DOC(), v, { merge: true }); AdminToast.success('تم الحفظ — كل دخول جديد يُسجَّل بسجل الأحداث (قسم 16) تلقائياً بأي حال'); }
        });
      }
    },
    {
      title: 'إدارة اختصارات لوحة المفاتيح داخل اللوحة',
      keywords: 'اختصارات لوحة مفاتيح',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>الاختصار</th><th>الوظيفة</th></tr></thead>
          <tbody>
            <tr><td data-label="الاختصار">Ctrl/Cmd + K</td><td data-label="الوظيفة">فتح لوحة الأوامر (بحث عن أي أداة)</td></tr>
            <tr><td data-label="الاختصار">Esc</td><td data-label="الوظيفة">إغلاق أي نافذة مفتوحة</td></tr>
            <tr><td data-label="الاختصار">الأسهم ↑ ↓ + Enter</td><td data-label="الوظيفة">التنقل بنتائج لوحة الأوامر واختيار واحدة</td></tr>
          </tbody></table>`;
        openModal({ title: 'اختصارات لوحة المفاتيح', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'مسح ذاكرة التخزين المؤقت (Cache) للوحة',
      keywords: 'مسح كاش cache خلل عرض',
      run: () => {
        openConfirm({
          title: 'مسح ذاكرة التخزين المؤقت',
          message: 'يمسح الجلسة المؤقتة للوحة (sessionStorage) ويعيد تحميل الصفحة — يفيد عند أي خلل عرض غير مرتبط بالبيانات نفسها.',
          onConfirm: async () => {
            sessionStorage.clear();
            AdminToast.success('جارٍ إعادة التحميل...');
            setTimeout(() => location.reload(), 600);
          }
        });
      }
    },
    {
      title: 'تسجيل خروج فوري من كل الأجهزة المسجَّل دخولها للوحة',
      keywords: 'تسجيل خروج كل اجهزة اللوحة',
      run: () => {
        openConfirm({
          title: 'تسجيل خروج من كل أجهزة اللوحة',
          danger: true, doubleConfirm: true,
          message: 'يسجّل خروجك من كل جلسات دخول لوحة "ادمن احسمها" على كل الأجهزة فوراً، بما فيها هذا الجهاز.',
          onConfirm: async () => {
            const snap = await fb.getDocs(fb.collection(fb.db, 'adminOwnSessions'));
            await Promise.all(snap.docs.map((d) => fb.updateDoc(fb.doc(fb.db, 'adminOwnSessions', d.id), { forceLogout: true })));
            await AdminAudit.log({ section: 30, sectionTitle: 'إعدادات اللوحة', actionKey: 'settings.logoutAllDevices', actionLabel: 'تسجيل خروج من كل أجهزة اللوحة', sensitive: true });
            await AdminAuth.signOut();
          }
        });
      }
    }
  ]
});
