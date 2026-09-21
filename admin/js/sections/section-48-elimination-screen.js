// ==================== القسم 48 — شاشة الإقصاء/الخسارة ====================
import { AdminFB } from '../core/firebase.js';
import { openModal, openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';

const fb = AdminFB;

defineSection({
  id: 48,
  title: 'شاشة الإقصاء/الخسارة',
  description: 'شاشة الإقصاء مدمجة بمنطق كل لعبة على حدة — لا يوجد نص/تصميم مركزي واحد يتحكم بها كل الألعاب.',
  tools: [
    {
      title: 'تعديل نص عام يظهر عند إقصاء لاعب',
      keywords: 'نص عام اقصاء لاعب',
      badge: 'يحتاج ربط بمنطق الموقع',
      run: () => {
        openFormModal({
          title: 'نص شاشة الإقصاء',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', required: true, value: 'للأسف أُقصيت من الجولة — حظ أوفر المرة الجاية!' }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', 'screen_elimination'), { ar: v.text, category: 'screens' }, { merge: true });
            AdminToast.success('تم الحفظ — تذكير: غير مربوط بمنطق العرض الفعلي بعد');
          }
        });
      }
    },
    {
      title: 'إحصائية أكثر الألعاب "قسوة" (نسبة إقصاء أعلى)',
      keywords: 'اكثر العاب قسوة نسبة اقصاء',
      badge: 'بيانات غير متوفرة',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه تسجيل مركزي لعدد المقصيين مقابل عدد المشاركين لكل لعبة بـplayEvents الحالية — يحتاج تعديل منطق كل لعبة لتسجيل هذا الحدث تحديداً.</p>'; openModal({ title: 'نسبة الإقصاء', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إعادة لاعب مُقصى للراوند يدوياً (طوارئ)',
      keywords: 'اعادة لاعب مقصى راوند يدوي',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>حالة "مُقصى" محفوظة بذاكرة الجلسة (متغيرات محلية) بمتصفح الستريمر مباشرة، لا Firestore — ما فيه طريقة للتدخل بها من لوحة خارجية بالوضع الحالي.</p>'; openModal({ title: 'إعادة لاعب', bodyEl: b, size: 'sm' }); }
    }
  ]
});
