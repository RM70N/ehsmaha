// ==================== القسم 43 — ألعاب الجمعات ====================
// 18 لعبة من مكتبة الألعاب الرئيسية (صفحة الألعاب الافتراضية — ستريمر
// وجمهوره عبر الشات) الباقية بعد استثناء الألعاب اللي أخذت قسماً مستقلاً
// خاصاً بها (tug/rlgl/cs/bomb/cw/rou/chairs/volcanic-lands/glz/tt10 —
// أقسام 31-41). "main" هو بنك "احسمها" الأصلي (ahsemhaCategories) — كولكشن
// Firestore حي لكن بدون أداة إدارة محتوى مخصَّصة له بأي قسم حالياً (فقط
// صلاحيات "محرّر" تُمنح من قسم 26 — لا إدارة فعلية للفئات/الأسئلة نفسها).
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { categoryTools } from '../core/game-admin-kit.js';

const TAGS = ['battery', 'box', 'cr', 'draw', 'ev', 'findball', 'guessword', 'hz', 'ig', 'll', 'lsc', 'main', 'maze', 'pgs', 'sniper', 'tmr', 'wai', 'wr'];
const NAMES = {
  battery: 'الزر المشحون', box: 'الصندوق العشوائي', cr: 'من أنا؟', draw: 'خمن الرسمة', ev: 'آخر حرف؟',
  findball: 'اعثر على الكورة', guessword: 'اوجد الكلمة', hz: 'ضربة الحظ', ig: 'خمّن الصورة', ll: 'آخر حرف',
  lsc: 'ترتيب الحروف', main: 'احسمها (البنك الأصلي)', maze: 'المتاهة', pgs: 'تخمين السعر',
  sniper: 'القناص', tmr: 'لعبة التوقيت', wai: 'من أنا؟', wr: 'عكس الكلمة'
};

defineSection({
  id: 43,
  title: 'ألعاب الجمعات',
  description: `${TAGS.length} لعبة من مكتبة الألعاب الأساسية (ستريمر + جمهوره عبر الشات) — الألعاب الأكبر أخذت قسماً مستقلاً (31-41)، وهذي البقية.`,
  tools: [
    ...categoryTools({ tags: TAGS, categoryName: 'ألعاب الجمعات', sectionId: 43 }),
    {
      title: 'قائمة كل الألعاب بالفئة مع أسمائها الحقيقية',
      keywords: 'قائمة العاب جمعات اسماء',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<table class="admin-table"><thead><tr><th>الرمز (tag)</th><th>الاسم</th></tr></thead><tbody>${TAGS.map((t) => `<tr><td class="is-primary" data-label="الرمز">${t}</td><td data-label="الاسم">${NAMES[t]}</td></tr>`).join('')}</tbody></table>`;
        openModal({ title: 'ألعاب الجمعات', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'إدارة بنك "احسمها" الأصلي (لعبة main)',
      keywords: 'بنك احسمها اصلي main',
      badge: 'يحتاج قسم مخصَّص لاحقاً',
      run: () => {
        const b = document.createElement('div');
        b.innerHTML = '<p>ahsemhaCategories كولكشن Firestore حي فعلاً، لكن ما فيه أداة إدارة محتوى (إضافة/تعديل/حذف فئات وأسئلة) له بأي قسم حالياً — الموجود فقط بقسم 26 هو منح صلاحية "محرّر" (ahsemhaEditors) اللي تدير المحتوى من الموقع الرئيسي نفسه، لا من هذي اللوحة.</p>';
        openModal({ title: 'بنك احسمها الأصلي', bodyEl: b, size: 'sm' });
      }
    }
  ]
});
