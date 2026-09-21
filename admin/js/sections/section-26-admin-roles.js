// ==================== القسم 26 — صلاحيات المشرفين ====================
// ملاحظة مهمة: لوحة "ادمن احسمها" نفسها حصرية لحساب واحد (مطلب أساسي
// بالمشروع) — "المشرفون" هنا هم نظام صلاحيات الموقع الرئيسي الحقيقي
// الموجود أصلاً (moderators/eventAccess/ahsemhaEditors)، يمنحون قدرات
// داخل الموقع نفسه، لا دخولاً لهذي اللوحة.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;
const SYSTEMS = { moderators: 'مشرف عام', eventAccess: 'صلاحية فعاليات', ahsemhaEditors: 'محرّر بنك احسمها' };

async function listAllMods() {
  const results = [];
  for (const [col, label] of Object.entries(SYSTEMS)) {
    const snap = await fb.getDocs(fb.collection(fb.db, col));
    snap.docs.forEach((d) => results.push({ system: col, label, usernameLower: d.id, ...d.data() }));
  }
  return results;
}

defineSection({
  id: 26,
  title: 'صلاحيات المشرفين',
  description: 'أنظمة الصلاحيات الحقيقية بالموقع الرئيسي: moderators/eventAccess/ahsemhaEditors — إدارة كاملة هنا.',
  tools: [
    {
      title: 'إضافة حساب مشرف جديد بصلاحيات محدودة',
      keywords: 'اضافة مشرف جديد صلاحيات',
      run: () => {
        openFormModal({
          title: 'إضافة مشرف',
          fields: [
            { key: 'usernameLower', label: 'اسم المستخدم', required: true },
            { key: 'system', label: 'نوع الصلاحية', type: 'select', options: Object.entries(SYSTEMS).map(([k, v]) => ({ value: k, label: v })) }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, v.system, v.usernameLower.toLowerCase()), { username: v.usernameLower, addedBy: 'admin', addedAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 26, sectionTitle: 'صلاحيات المشرفين', actionKey: 'roles.add', actionLabel: 'إضافة مشرف', targetType: v.system, targetId: v.usernameLower, sensitive: true });
            AdminToast.success('تم');
          }
        });
      }
    },
    {
      title: 'تحديد الأقسام التي يمكن لمشرف معيّن الوصول إليها فقط',
      keywords: 'تحديد اقسام وصول مشرف',
      run: () => {
        openFormModal({
          title: 'تحديد نطاق صلاحية',
          fields: [
            { key: 'usernameLower', label: 'اسم المشرف', required: true },
            { key: 'allowedAreas', label: 'النطاقات المسموحة (نص حر، مفصول بفاصلة)', type: 'textarea' }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'moderators', v.usernameLower.toLowerCase()), { allowedAreas: v.allowedAreas.split(',').map((s) => s.trim()) });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'منع مشرف من تنفيذ إجراءات حساسة',
      keywords: 'منع مشرف اجراءات حساسة',
      run: () => {
        openFormModal({
          title: 'منع من إجراءات حساسة',
          fields: [{ key: 'usernameLower', label: 'اسم المشرف', required: true }, { key: 'blockSensitive', label: 'منع الإجراءات الحسّاسة', type: 'checkbox', value: true }],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'moderators', v.usernameLower.toLowerCase()), { blockSensitive: v.blockSensitive }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'سحب صلاحيات مشرف فوراً',
      keywords: 'سحب صلاحيات مشرف فورا',
      run: async () => {
        const rows = await listAllMods();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>النوع</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.usernameLower}</td><td data-label="النوع">${r.label}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-rv="${r.system}|${r.usernameLower}">سحب</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا مشرف حالياً</p>';
        openModal({ title: 'سحب صلاحيات', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-rv]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const [sys, uname] = btn.getAttribute('data-rv').split('|');
          await fb.deleteDoc(fb.doc(fb.db, sys, uname));
          await AdminAudit.log({ section: 26, sectionTitle: 'صلاحيات المشرفين', actionKey: 'roles.revoke', actionLabel: 'سحب صلاحيات مشرف', targetType: sys, targetId: uname, sensitive: true });
          AdminToast.success('تم السحب');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'عرض سجل نشاط كل مشرف على حدة',
      keywords: 'سجل نشاط مشرف',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>المشرفون يستخدمون صلاحياتهم من الموقع الرئيسي مباشرة (مو من لوحة الإدارة هذي)، وما فيه سجل نشاط مفصَّل لكل مشرف حالياً بالموقع الرئيسي.</p>'; openModal({ title: 'نشاط المشرفين', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إنشاء "أدوار" جاهزة (مشرف دعم، مشرف محتوى، مشرف كامل)',
      keywords: 'ادوار جاهزة مشرف دعم محتوى',
      run: () => {
        openFormModal({
          title: 'دور جديد',
          fields: [
            { key: 'name', label: 'اسم الدور', required: true },
            { key: 'permissions', label: 'الصلاحيات المشمولة (نص حر)', type: 'textarea' }
          ],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.collection(fb.db, 'adminRoles')), v); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تفعيل تنبيه لي عند أي إجراء يتخذه مشرف آخر',
      keywords: 'تنبيه اجراء مشرف اخر',
      badge: 'بيانات غير متوفرة بعد',
      run: () => AdminToast.info('يحتاج ربط سجل أحداث مباشر بصلاحيات الموقع الرئيسي — غير موجود حالياً')
    },
    {
      title: 'تحديد ساعات عمل مسموحة لدخول مشرف معيّن',
      keywords: 'ساعات عمل مسموحة مشرف',
      run: () => {
        openFormModal({
          title: 'ساعات عمل مشرف',
          fields: [
            { key: 'usernameLower', label: 'اسم المشرف', required: true },
            { key: 'allowedHoursFrom', label: 'من الساعة (0-23)', type: 'number' },
            { key: 'allowedHoursTo', label: 'إلى الساعة (0-23)', type: 'number' }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'moderators', v.usernameLower.toLowerCase()), { allowedHoursFrom: Number(v.allowedHoursFrom), allowedHoursTo: Number(v.allowedHoursTo) }); AdminToast.success('تم الحفظ — يحتاج تطبيق فعلي بمنطق تفعيل صلاحيات المشرف بالموقع الرئيسي'); }
        });
      }
    },
    {
      title: 'طلب موافقتي قبل تنفيذ إجراء حسّاس من مشرف',
      keywords: 'طلب موافقة اجراء حساس مشرف',
      badge: 'بيانات غير متوفرة بعد',
      run: () => AdminToast.info('يحتاج نظام موافقات (approval workflow) غير موجود بالموقع الرئيسي حالياً')
    },
    {
      title: 'تعليق حساب مشرف مؤقتاً',
      keywords: 'تعليق حساب مشرف مؤقت',
      run: () => {
        openFormModal({
          title: 'تعليق مشرف',
          fields: [{ key: 'usernameLower', label: 'اسم المشرف', required: true }],
          submitText: 'تبديل التعليق',
          onSubmit: async (v) => {
            const ref = fb.doc(fb.db, 'moderators', v.usernameLower.toLowerCase());
            const snap = await fb.getDoc(ref);
            const cur = snap.exists() && snap.data().suspended;
            await fb.updateDoc(ref, { suspended: !cur });
            await AdminAudit.log({ section: 26, sectionTitle: 'صلاحيات المشرفين', actionKey: 'roles.suspend', actionLabel: cur ? 'إلغاء تعليق مشرف' : 'تعليق مشرف', targetType: 'moderators', targetId: v.usernameLower, sensitive: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تغيير كلمة مرور مشرف عن بُعد',
      keywords: 'تغيير كلمة مرور مشرف بعد',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">إيميل المشرف</span><input class="admin-input" id="rp-email" type="email" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="rp-go" style="margin-top:8px;">إرسال رابط إعادة تعيين</button>';
        const modal = openModal({ title: 'إعادة تعيين كلمة مرور مشرف', bodyEl: body, size: 'sm' });
        body.querySelector('#rp-go').addEventListener('click', async () => {
          try { await fb.sendPasswordResetEmail(fb.auth, body.querySelector('#rp-email').value.trim()); AdminToast.success('تم الإرسال'); modal.close(); } catch (err) { AdminToast.error('فشل: ' + err.message); }
        });
      }
    },
    {
      title: 'عرض قائمة كل المشرفين الحاليين وحالتهم',
      keywords: 'قائمة مشرفين حالة',
      run: async () => {
        const rows = await listAllMods();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>النوع</th><th>الحالة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.usernameLower}</td><td data-label="النوع">${r.label}</td><td data-label="الحالة">${r.suspended ? 'معلَّق' : 'نشط'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا مشرف حالياً</p>';
        openModal({ title: 'كل المشرفين', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تحديد حد أقصى لعدد الإجراءات اليومية لكل مشرف',
      keywords: 'حد اقصى اجراءات يومية مشرف',
      run: () => {
        openFormModal({
          title: 'حد الإجراءات اليومية',
          fields: [{ key: 'usernameLower', label: 'اسم المشرف', required: true }, { key: 'maxDailyActions', label: 'الحد الأقصى', type: 'number' }],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'moderators', v.usernameLower.toLowerCase()), { maxDailyActions: Number(v.maxDailyActions) }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'سجل كامل لكل تغيير في صلاحيات أي مشرف',
      keywords: 'سجل تغيير صلاحيات مشرف',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('roles.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="الإجراء">${r.actionLabel}</td><td data-label="الهدف">${r.targetId}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تغيير مسجَّل بعد</p>';
        openModal({ title: 'سجل تغييرات الصلاحيات', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'حذف حساب مشرف نهائياً',
      keywords: 'حذف حساب مشرف نهائي',
      run: () => {
        openFormModal({
          title: 'حذف مشرف نهائياً',
          fields: [{ key: 'usernameLower', label: 'اسم المشرف', required: true }],
          onSubmit: async (v) => {
            const lower = v.usernameLower.toLowerCase();
            await Promise.all(Object.keys(SYSTEMS).map((sys) => fb.deleteDoc(fb.doc(fb.db, sys, lower)).catch(() => {})));
            await AdminAudit.log({ section: 26, sectionTitle: 'صلاحيات المشرفين', actionKey: 'roles.deleteFinal', actionLabel: 'حذف مشرف نهائياً من كل الأنظمة', targetType: 'user', targetId: lower, sensitive: true });
            AdminToast.success('تم الحذف من كل الأنظمة');
          }
        });
      }
    }
  ]
});
