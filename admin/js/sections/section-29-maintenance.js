// ==================== القسم 29 — الصيانة والحالة العامة ====================
// يتحكم بـsiteFlags/maintenance = { active, message, until, allowOwnerBypass }
// — يُطبَّق فعلياً على الموقع الرئيسي عبر adminMaintenanceBoot() بـindex.html
// (onSnapshot حي، يظهر حاجزاً لكل الزوار عدا حساب المالك). راجع أيضاً قسم 24
// لفحوصات صحة الخدمات (Render/Firestore) المرتبطة بنفس الفكرة.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;
const FLAG_REF = () => fb.doc(fb.db, 'siteFlags', 'maintenance');

async function loadFlag() {
  const snap = await fb.getDoc(FLAG_REF());
  return snap.exists() ? snap.data() : { active: false };
}

defineSection({
  id: 29,
  title: 'الصيانة والحالة العامة',
  description: 'وضع الصيانة مطبَّق فعلياً على الموقع الرئيسي (حاجز حي لكل الزوار عدا حساب المالك) — يُفحص لحظياً عبر siteFlags/maintenance.',
  tools: [
    {
      title: 'تفعيل وضع الصيانة فوراً لكل الموقع',
      keywords: 'تفعيل وضع صيانة فوري',
      run: () => {
        openConfirm({
          title: 'تفعيل وضع الصيانة',
          danger: true,
          message: 'سيظهر حاجز صيانة لكل زوار الموقع فوراً (عدا حسابك أنت) بمجرد ما يتحقق كل جهاز من الاتصال بالإنترنت.',
          onConfirm: async () => {
            await fb.setDoc(FLAG_REF(), { active: true, activatedAt: fb.serverTimestamp() }, { merge: true });
            await AdminAudit.log({ section: 29, sectionTitle: 'الصيانة والحالة العامة', actionKey: 'maint.activate', actionLabel: 'تفعيل وضع الصيانة', sensitive: true });
            AdminToast.success('تم التفعيل — الموقع بصيانة الآن للجميع عدا حسابك');
          }
        });
      }
    },
    {
      title: 'إيقاف وضع الصيانة وإعادة فتح الموقع',
      keywords: 'ايقاف وضع صيانة اعادة فتح',
      run: () => {
        openConfirm({
          title: 'إيقاف وضع الصيانة',
          message: 'سيرجع الموقع متاحاً للجميع فوراً.',
          onConfirm: async () => {
            await fb.setDoc(FLAG_REF(), { active: false }, { merge: true });
            await AdminAudit.log({ section: 29, sectionTitle: 'الصيانة والحالة العامة', actionKey: 'maint.deactivate', actionLabel: 'إيقاف وضع الصيانة' });
            AdminToast.success('تم — الموقع متاح للجميع الآن');
          }
        });
      }
    },
    {
      title: 'تعديل رسالة الصيانة الظاهرة للزوار',
      keywords: 'تعديل رسالة صيانة زوار',
      run: async () => {
        const flag = await loadFlag();
        openFormModal({
          title: 'رسالة الصيانة',
          fields: [{ key: 'message', label: 'الرسالة الظاهرة للزوار', type: 'textarea', value: flag.message || 'راح نرجع قريب — شكراً لصبرك.', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(FLAG_REF(), { message: v.message }, { merge: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'جدولة وقت متوقّع لانتهاء الصيانة (عدّاد تنازلي للزوار)',
      keywords: 'جدولة وقت انتهاء صيانة عداد',
      run: async () => {
        const flag = await loadFlag();
        openFormModal({
          title: 'الوقت المتوقَّع للرجوع',
          fields: [{ key: 'until', label: 'تاريخ ووقت الرجوع المتوقَّع', type: 'datetime-local', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(FLAG_REF(), { until: new Date(v.until) }, { merge: true });
            AdminToast.success('تم الحفظ — سيظهر عدّاد للزوار بصفحة الصيانة');
          }
        });
      }
    },
    {
      title: 'عرض حالة الصيانة الحالية بالتفصيل',
      keywords: 'عرض حالة صيانة حالية',
      run: async () => {
        const flag = await loadFlag();
        const body = document.createElement('div');
        body.innerHTML = `
          <dl class="admin-kv">
            <dt>الحالة</dt><dd><span class="admin-badge ${flag.active ? 'admin-badge--off' : 'admin-badge--on'}">${flag.active ? 'بصيانة الآن' : 'متاح للجميع'}</span></dd>
            <dt>الرسالة</dt><dd>${flag.message || 'الرسالة الافتراضية'}</dd>
            <dt>وقت الرجوع المتوقَّع</dt><dd>${flag.until && flag.until.toMillis ? fmtDate(flag.until) : 'غير محدَّد'}</dd>
            <dt>آخر تفعيل</dt><dd>${flag.activatedAt ? fmtDate(flag.activatedAt) : '—'}</dd>
          </dl>`;
        openModal({ title: 'حالة الصيانة التفصيلية', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'استثناء حسابك (المالك) دائماً من حاجز الصيانة',
      keywords: 'استثناء مالك حاجز صيانة',
      badge: 'مفعّل تلقائياً',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>حسابك (isOwnerAccount()) مستثنى دائماً وتلقائياً من حاجز الصيانة بكود الموقع الرئيسي — ما يحتاج أي إعداد إضافي، تقدر تتصفح وتختبر الموقع وهو بصيانة للجميع غيرك.</p>';
        openModal({ title: 'استثناء المالك', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تفعيل صيانة جزئية (قسم/لعبة معيّنة فقط)',
      keywords: 'صيانة جزئية قسم لعبة',
      run: () => {
        openFormModal({
          title: 'صيانة لعبة معيّنة فقط',
          fields: [{ key: 'gameTag', label: 'رمز اللعبة (tag)', required: true }],
          submitText: 'إيقاف هذه اللعبة فقط',
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [v.gameTag]: false }, { merge: true });
            await AdminAudit.log({ section: 29, sectionTitle: 'الصيانة والحالة العامة', actionKey: 'maint.gameOff', actionLabel: 'إيقاف لعبة معيّنة (صيانة جزئية)', targetType: 'game', targetId: v.gameTag });
            AdminToast.success('تم إيقاف هذه اللعبة فقط — بقية الموقع يعمل عادي (نفس آلية قسم 6/تبديل الألعاب)');
          }
        });
      }
    },
    {
      title: 'معاينة شكل صفحة الصيانة قبل التفعيل',
      keywords: 'معاينة شكل صفحة صيانة',
      run: async () => {
        const flag = await loadFlag();
        const body = document.createElement('div');
        body.innerHTML = `<div style="background:#0d0620;color:#f5f1fb;border-radius:12px;padding:32px 20px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:#e8c887;margin-bottom:10px;">الموقع بصيانة مؤقتة</div>
          <div style="font-size:13px;color:#b8aed0;line-height:1.8;">${flag.message || 'راح نرجع قريب — شكراً لصبرك.'}</div>
        </div>`;
        openModal({ title: 'معاينة صفحة الصيانة', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'سجل كل مرات تفعيل/إيقاف الصيانة السابقة',
      keywords: 'سجل تفعيل ايقاف صيانة سابقة',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('maint.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th><th>بواسطة</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="الإجراء">${r.actionLabel}</td><td data-label="بواسطة">${r.actorEmail}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تفعيل مسجَّل بعد</p>';
        openModal({ title: 'سجل الصيانة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'إرسال إشعار تلقائي للاعبين قبل بدء الصيانة',
      keywords: 'اشعار تلقائي لاعبين قبل صيانة',
      run: () => {
        openFormModal({
          title: 'إشعار مسبق بالصيانة',
          fields: [{ key: 'text', label: 'نص التنبيه المسبق', type: 'textarea', required: true, value: 'تنويه: الموقع بيدخل صيانة مؤقتة قريباً.' }],
          onSubmit: async (v) => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            await fb.setDoc(fb.doc(fb.db, 'broadcastMessages', 'admin-maint-notice-' + Date.now()), { text: v.text, type: 'adminMessage', createdAt: fb.serverTimestamp() });
            AdminToast.success('تم الإرسال كرسالة بث عامة');
          }
        });
      }
    },
    {
      title: 'تفعيل صفحة صيانة مخصَّصة (تصميم/شعار مختلف)',
      keywords: 'صفحة صيانة مخصصة تصميم',
      badge: 'يحتاج تعديل كود',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>الرسالة والعدّاد قابلة للتعديل من هنا مباشرة — تغيير التصميم/الشعار نفسه (خارج النص) يحتاج تعديل مباشر بقالب الحاجز داخل index.html.</p>'; openModal({ title: 'تخصيص صفحة الصيانة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'السماح لعناوين IP محدَّدة بتجاوز الصيانة للاختبار',
      keywords: 'سماح ip تجاوز صيانة اختبار',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>الحاجز الحالي يعتمد على حساب المستخدم (isOwnerAccount) لا عنوان IP — تحديد استثناء بعنوان IP يحتاج معرفة IP الزائر بأمان (خدمة خارجية) قبل حتى تسجيل الدخول.</p>'; openModal({ title: 'استثناء IP', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'مراقبة حالة الموقع العامة (متصل/معطّل) من مصادر متعددة',
      keywords: 'مراقبة حالة موقع عامة متصل معطل',
      meta: 'استخدم "تشغيل فحص صحة شامل" بقسم 24',
      run: () => AdminToast.info('استخدم أداة "تشغيل فحص صحة شامل (Health Check)" بقسم 24 — تفحص Firestore وسيرفر الجسر معاً بضغطة واحدة')
    },
    {
      title: 'تصدير تقرير حالة الصيانة والتوفر التاريخي',
      keywords: 'تصدير تقرير صيانة توفر تاريخي',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('maint.'));
        const body = document.createElement('div');
        const totalActivations = rows.filter((r) => r.actionKey === 'maint.activate').length;
        body.innerHTML = `<p>عدد مرات تفعيل الصيانة (كامل السجل): ${totalActivations}</p><p>آخر إجراء: ${rows[0] ? rows[0].actionLabel + ' — ' + fmtDate(rows[0].tsClient) : '—'}</p>`;
        openModal({ title: 'تقرير حالة الصيانة', bodyEl: body, size: 'md' });
      }
    }
  ]
});
