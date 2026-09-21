// ==================== القسم 44 — الألعاب الفردية ====================
// 11 لعبة من صفحة #pg-solo-home (لعبة واحدة، اللاعب والتحدي — بدون جمهور
// شات بالضرورة): oneletter, guesscountry, timersolo, memorybuttons, gwsolo,
// findballsolo, describechar, countrywarparty, fastans, pdraw, ptop10.
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { categoryTools } from '../core/game-admin-kit.js';

const TAGS = ['oneletter', 'guesscountry', 'timersolo', 'memorybuttons', 'gwsolo', 'findballsolo', 'describechar', 'countrywarparty', 'fastans', 'pdraw', 'ptop10'];
const NAMES = {
  oneletter: 'تحدي الحرف الواحد', guesscountry: 'توقع الدولة', timersolo: 'لعبة التوقيت', memorybuttons: 'حفظ الأزرار',
  gwsolo: 'خمّن الموضوع', findballsolo: 'اعثر على الكورة', describechar: 'وصف الشخصية', countrywarparty: 'الدول',
  fastans: 'أسرع جواب', pdraw: 'خمن الرسمة', ptop10: 'توب 10'
};

defineSection({
  id: 44,
  title: 'الألعاب الفردية',
  description: `${TAGS.length} لعبة من صفحة "ألعاب فردية" (لعبة واحدة، اللاعب والتحدي): ${TAGS.map((t) => NAMES[t]).join('، ')}.`,
  tools: [
    ...categoryTools({ tags: TAGS, categoryName: 'الألعاب الفردية', sectionId: 44 }),
    {
      title: 'قائمة الألعاب الفردية مع أسمائها الحقيقية',
      keywords: 'قائمة العاب فردية اسماء',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>الرمز (tag)</th><th>الاسم</th></tr></thead><tbody>${TAGS.map((t) => `<tr><td class="is-primary" data-label="الرمز">${t}</td><td data-label="الاسم">${NAMES[t]}</td></tr>`).join('')}</tbody></table>`;
        openModal({ title: 'الألعاب الفردية', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'ملاحظة على "تحدي الحرف الواحد" — يستخدم الذكاء الاصطناعي للتحقق',
      keywords: 'تحدي الحرف ذكاء اصطناعي تحقق',
      badge: 'يحتاج ربط خارجي للمراقبة',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>لعبة "تحدي الحرف الواحد" تتحقق من إجابات اللاعب بالذكاء الاصطناعي مباشرة من متصفحه — ما فيه سجل مركزي لمخرجات الذكاء الاصطناعي بالإدارة حالياً لمراجعتها.</p>'; openModal({ title: 'تحدي الحرف الواحد', bodyEl: b, size: 'sm' }); }
    }
  ]
});
