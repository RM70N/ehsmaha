// ==================== القسم 54 — القائمة الجانبية ====================
// صراحة: الموقع الرئيسي ما فيه "قائمة جانبية" منفصلة (تصفّح بشريط علوي
// #topnav) — هذا القسم عن القائمة الجانبية للوحة الإدارة نفسها. ترتيب
// الأقسام مُدار أصلاً بقسم 30.11 — أضفنا هنا ميزة جديدة فعلاً: إخفاء أقسام
// معيّنة من القائمة (تنظيم بصري فقط، الوصول يبقى ممكناً دائماً عبر Ctrl+K).
import { AdminFB } from '../core/firebase.js';
import { openModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { AdminRouter } from '../core/router.js';

const fb = AdminFB;
const PANEL_DOC = () => fb.doc(fb.db, 'adminSettings', 'panel');

defineSection({
  id: 54,
  title: 'القائمة الجانبية',
  description: 'قائمة اللوحة نفسها (لا يوجد قائمة جانبية بالموقع الرئيسي) — ترتيب الأقسام بقسم 30، هنا إخفاء/إظهار أقسام معيّنة (تنظيم بصري فقط).',
  tools: [
    {
      title: 'إخفاء/إظهار أقسام معيّنة من القائمة الجانبية',
      keywords: 'اخفاء اظهار اقسام قائمة جانبية',
      run: async () => {
        const snap = await fb.getDoc(PANEL_DOC());
        const cur = snap.exists() ? snap.data() : {};
        const hidden = new Set(cur.hiddenSections || []);
        const titlesMod = await import('../core/app.js');
        const titles = titlesMod.SECTION_TITLES;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-table-wrap" style="max-height:340px;overflow-y:auto;">${Object.entries(titles).map(([id, name]) => `<label class="admin-field admin-field--checkbox"><input type="checkbox" data-hide="${id}" ${hidden.has(Number(id)) ? 'checked' : ''}/><span>${id} — ${name}</span></label>`).join('')}</div><button class="admin-btn admin-btn--primary admin-btn--sm" id="sb-hide-save" style="margin-top:10px;">حفظ</button>`;
        const modal = openModal({ title: 'إخفاء أقسام من القائمة', bodyEl: body, size: 'lg' });
        body.querySelector('#sb-hide-save').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const newHidden = [...body.querySelectorAll('[data-hide]:checked')].map((el) => Number(el.getAttribute('data-hide')));
          await fb.setDoc(PANEL_DOC(), { hiddenSections: newHidden }, { merge: true });
          AdminToast.success('تم الحفظ — يظهر التغيير عند التنقّل لأي قسم');
          modal.close();
        });
      }
    },
    {
      title: 'ترتيب الأقسام حسب الاستخدام',
      keywords: 'ترتيب اقسام حسب استخدام',
      meta: 'ينقلك لقسم 30 — إعدادات اللوحة',
      run: () => { AdminToast.info('ترتيب الأقسام مُدار من قسم 30 — إعدادات اللوحة (أداة "تخصيص القائمة الجانبية")'); AdminRouter.goTo(30); }
    },
    {
      title: 'إظهار كل الأقسام المخفية دفعة واحدة',
      keywords: 'اظهار كل اقسام مخفية دفعة',
      run: async () => {
        if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
        await fb.setDoc(PANEL_DOC(), { hiddenSections: [] }, { merge: true });
        AdminToast.success('تم إظهار كل الأقسام');
      }
    }
  ]
});
