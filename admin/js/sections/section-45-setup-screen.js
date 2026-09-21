// ==================== القسم 45 — شاشة الإعداد العامة ====================
// صراحة مهمة: شاشة الإعداد المشتركة (النافذة اللي تظهر لكل ستريمر قبل بدء
// أي لعبة — goSetupX) مبنية بالكامل داخل index.html كـHTML/CSS/JS ثابت لكل
// لعبة على حدة، ما فيه "محتوى مركزي" واحد يتحكم بكل شاشات الإعداد دفعة
// واحدة من Firestore. الأدوات هنا حقيقية بحدود هذا الواقع.
import { AdminFB } from '../core/firebase.js';
import { openModal, openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';

const fb = AdminFB;

defineSection({
  id: 45,
  title: 'شاشة الإعداد العامة',
  description: 'شاشة الإعداد (goSetupX) مبنية داخل index.html لكل لعبة على حدة — ما فيه محتوى مركزي واحد يتحكم بكل الشاشات دفعة واحدة حالياً.',
  tools: [
    {
      title: 'تعديل رسالة ترحيب عامة تظهر بشاشة الإعداد',
      keywords: 'رسالة ترحيب شاشة اعداد',
      badge: 'يحتاج ربط بمنطق الموقع',
      run: () => {
        openFormModal({
          title: 'رسالة ترحيب شاشة الإعداد',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', 'screen_setup_welcome'), { ar: v.text, category: 'screens' }, { merge: true });
            AdminToast.success('تم الحفظ بقاعدة البيانات — تذكير: شاشة الإعداد ما تقرأ من uiText تلقائياً بعد بالموقع الرئيسي');
          }
        });
      }
    },
    {
      title: 'عرض عدد مرات فتح شاشة الإعداد لكل لعبة (آخر 30 يوم)',
      keywords: 'عدد مرات فتح شاشة اعداد',
      meta: 'مطابق لأداة "لوحة إحصائيات" بقسم كل لعبة (31-44) — نفس بيانات playEvents type=streamer_launch',
      run: () => AdminToast.info('استخدم "لوحة إحصائيات كل ألعاب الفئة" بأي من أقسام 31-44/42-44 — نفس حدث استخدام شاشة الإعداد فعلياً (playEvents type=streamer_launch)')
    },
    {
      title: 'تفعيل/تعطيل تخطي شاشة الإعداد لستريمر معيّن (اختبار سريع)',
      keywords: 'تخطي شاشة اعداد اختبار',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه آلية "تخطي شاشة الإعداد" بمنطق الموقع الرئيسي حالياً — كل لعبة تمر إجبارياً بشاشة إعدادها الخاصة.</p>'; openModal({ title: 'تخطي الإعداد', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تعديل النص التوضيحي الافتراضي المرافق لكل لعبة',
      keywords: 'نص توضيحي افتراضي شاشة اعداد',
      meta: 'الوصف الحالي (gcard-desc) مدمج بالكود لكل لعبة — عدّله عبر Meta السيو بقسم 15 لتأثير على نتائج البحث فقط، لا الشاشة نفسها',
      run: () => AdminToast.info('النص الحالي لكل لعبة مدمج بالكود مباشرة (gcard-desc) — لا يوجد نظام مركزي لتعديله من هنا حتى الآن')
    }
  ]
});
