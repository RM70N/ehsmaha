// ==================== القسم 58 — هوية العلامة ====================
// صراحة: كل عناصر الهوية البصرية (الألوان، الخطوط، الشعار) مدمجة مباشرة
// بـCSS/HTML داخل index.html — لا يوجد نظام "برند مركزي" بقاعدة البيانات
// يتحكم بها. هذا القسم يوفّر مرجعاً موثَّقاً (siteContent/brandKit) للرجوع
// إليه، وأدوات حقيقية لما هو فعلاً قابل للتعديل (og-image بقسم 15).
import { AdminFB } from '../core/firebase.js';
import { openModal, openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { AdminRouter } from '../core/router.js';

const fb = AdminFB;
const BRAND_DOC = () => fb.doc(fb.db, 'siteContent', 'brandKit');

defineSection({
  id: 58,
  title: 'هوية العلامة',
  description: 'الألوان/الخطوط/الشعار مدمجة بالكود مباشرة — هذا مرجع موثَّق (siteContent/brandKit) + رابط لأداة og-image الفعلية بقسم 15.',
  tools: [
    {
      title: 'توثيق لوحة الألوان الرسمية (مرجع فقط)',
      keywords: 'توثيق لوحة الوان رسمية مرجع',
      badge: 'مرجع توثيقي فقط',
      run: async () => {
        const snap = await fb.getDoc(BRAND_DOC());
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'لوحة الألوان الرسمية',
          fields: [{ key: 'colors', label: 'الألوان (نص حر: اسم = كود اللون)', type: 'textarea', value: cur.colors || '', rows: 6 }],
          onSubmit: async (v) => { await fb.setDoc(BRAND_DOC(), { colors: v.colors }, { merge: true }); AdminToast.success('تم الحفظ كمرجع — الموقع نفسه يستخدم متغيّرات CSS ثابتة، هذا للتوثيق فقط'); }
        });
      }
    },
    {
      title: 'توثيق الخطوط المستخدمة بالموقع',
      keywords: 'توثيق خطوط موقع',
      badge: 'مرجع توثيقي فقط',
      run: async () => {
        const snap = await fb.getDoc(BRAND_DOC());
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'الخطوط الرسمية',
          fields: [{ key: 'fonts', label: 'الخطوط (نص حر)', type: 'textarea', value: cur.fonts || '' }],
          onSubmit: async (v) => { await fb.setDoc(BRAND_DOC(), { fonts: v.fonts }, { merge: true }); AdminToast.success('تم الحفظ كمرجع'); }
        });
      }
    },
    {
      title: 'تحديث صورة المشاركة الاجتماعية (og-image)',
      keywords: 'تحديث og image مشاركة اجتماعية',
      meta: 'ينقلك لقسم 15 — السيو والمحتوى العام',
      run: () => { AdminToast.info('أداة تحديث og-image الفعلية موجودة بقسم 15'); AdminRouter.goTo(15); }
    },
    {
      title: 'عرض دليل هوية العلامة الموثَّق حالياً',
      keywords: 'عرض دليل هوية علامة موثق',
      run: async () => {
        const snap = await fb.getDoc(BRAND_DOC());
        const cur = snap.exists() ? snap.data() : {};
        const body = document.createElement('div');
        body.innerHTML = `<dl class="admin-kv"><dt>الألوان</dt><dd style="white-space:pre-wrap;">${cur.colors || 'غير موثَّق بعد'}</dd><dt>الخطوط</dt><dd style="white-space:pre-wrap;">${cur.fonts || 'غير موثَّق بعد'}</dd></dl>`;
        openModal({ title: 'دليل هوية العلامة', bodyEl: body, size: 'md' });
      }
    }
  ]
});
