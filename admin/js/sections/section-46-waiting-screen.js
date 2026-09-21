// ==================== القسم 46 — شاشة الانتظار العامة ====================
// شاشة الانتظار (غرفة الانضمام قبل بدء الراوند) مبنية أيضاً داخل index.html
// لكل لعبة، مع مشاركين حقيقيين مسجَّلين حياً بـliveRounds/{gameTag}.
import { AdminFB } from '../core/firebase.js';
import { openModal, openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;

defineSection({
  id: 46,
  title: 'شاشة الانتظار العامة',
  description: 'قائمة المنضمّين بشاشة الانتظار حقيقية وحية (liveRounds/{gameTag}.participants) — راجع أداة "المشاركون بالراوند الجاري" بأي قسم لعبة (31-41).',
  tools: [
    {
      title: 'مراقبة كل شاشات الانتظار المفتوحة الآن عبر كل الألعاب',
      keywords: 'مراقبة شاشات انتظار مفتوحة كل الالعاب',
      run: () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        let unsub = () => {};
        openModal({ title: 'شاشات الانتظار المفتوحة الآن', bodyEl: body, size: 'lg', onClose: () => unsub() });
        unsub = fb.onSnapshot(fb.collection(fb.db, 'liveRounds'), (snap) => {
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => (r.participants || []).length > 0);
          body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>عدد المنضمّين</th><th>آخر تحديث</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اللعبة">${r.id}</td><td data-label="العدد">${(r.participants || []).length}</td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا شاشة انتظار فيها منضمّون الآن</p>';
        }, () => { body.textContent = 'تعذّر التحميل'; });
      }
    },
    {
      title: 'تعديل نص إرشادي عام يظهر بشاشة الانتظار (كيف تنضم)',
      keywords: 'نص ارشادي شاشة انتظار كيف تنضم',
      badge: 'يحتاج ربط بمنطق الموقع',
      run: () => {
        openFormModal({
          title: 'نص إرشادي شاشة الانتظار',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', 'screen_waiting_hint'), { ar: v.text, category: 'screens' }, { merge: true });
            AdminToast.success('تم الحفظ بقاعدة البيانات — تذكير: الشاشة ما تقرأ منه تلقائياً بعد');
          }
        });
      }
    },
    {
      title: 'تحديد حد أدنى/أقصى للمنضمّين قبل بدء الراوند تلقائياً',
      keywords: 'حد ادنى اقصى منضمين راوند تلقائي',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>بدء الراوند بكل الألعاب حالياً بضغطة الستريمر يدوياً — ما فيه آلية بدء تلقائي حسب عدد المنضمّين.</p>'; openModal({ title: 'بدء تلقائي', bodyEl: b, size: 'sm' }); }
    }
  ]
});
