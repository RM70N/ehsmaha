// ==================== القسم 49 — شاشة الفوز ====================
// هذا القسم عن شاشة الفوز الافتراضية (نفس التصميم لكل الستريمرز) — شاشة
// الفوز المخصّصة لستريمر معيّن (تصميم مختلف بالكامل) تُدار من قسم 20.
import { AdminFB } from '../core/firebase.js';
import { openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';

const fb = AdminFB;

defineSection({
  id: 49,
  title: 'شاشة الفوز',
  description: 'شاشة الفوز الافتراضية (نفس التصميم لكل الستريمرز) مدمجة بالكود — شاشة الفوز المخصَّصة لستريمر معيّن تُدار من قسم 20.',
  tools: [
    {
      title: 'تعديل نص عام يظهر عند فوز لاعب',
      keywords: 'نص عام فوز لاعب',
      badge: 'يحتاج ربط بمنطق الموقع',
      run: () => {
        openFormModal({
          title: 'نص شاشة الفوز',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', required: true, value: 'مبروك الفوز! 🏆' }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', 'screen_win'), { ar: v.text, category: 'screens' }, { merge: true });
            AdminToast.success('تم الحفظ — تذكير: غير مربوط بمنطق العرض الفعلي بعد');
          }
        });
      }
    },
    {
      title: 'إدارة شاشة الفوز المخصّصة لستريمر معيّن',
      keywords: 'شاشة فوز مخصصة ستريمر',
      meta: 'ينقلك لقسم 20 — أوفرلايات الستريمرز',
      run: () => AdminToast.info('شاشة الفوز المخصَّصة لستريمر معيّن تُدار من قسم 20 (أوفرلايات الستريمرز)')
    },
    {
      title: 'ربط شاشة الفوز بمكافأة XP تلقائية',
      keywords: 'ربط شاشة فوز مكافاة xp تلقائي',
      meta: 'مكافآت XP تُدار من قسم 8 (الاقتصاد الداخلي)',
      run: () => AdminToast.info('نظام XP الحقيقي (levels) يُدار من قسم 8 — حسب الكود الحالي (levelsNotePlayEvent/levelsNoteParticipants) يُمنح XP عند تشغيل اللعبة والمشاركة بالراوند، لا عند "الفوز" تحديداً كحدث منفصل')
    }
  ]
});
