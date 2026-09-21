// ==================== القسم 47 — شاشة الراوند العامة ====================
// شاشة الراوند الفعلية (اللعب نفسه) مبنية بالكامل بمنطق كل لعبة على حدة —
// لا يوجد "محرك راوند" مركزي واحد. الأدوات هنا تغطي ما هو حقيقي فعلاً:
// أوامر التحكم الحية الموجودة أصلاً بالموقع (liveCommands).
import { AdminFB } from '../core/firebase.js';
import { openModal, openFormModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;

defineSection({
  id: 47,
  title: 'شاشة الراوند العامة',
  description: 'لا يوجد محرك راوند مركزي واحد — كل لعبة تدير راوندها بمنطقها الخاص. أوامر التحكم الحية (liveCommands/{gameTag}/cmds) حقيقية ومشتركة فعلاً بين كل الألعاب.',
  tools: [
    {
      title: 'عرض آخر أوامر التحكم الحية المُرسَلة لأي لعبة',
      keywords: 'اوامر تحكم حية راوند',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل — يفحص أهم الألعاب...';
        openModal({ title: 'آخر أوامر التحكم الحية', bodyEl: body, size: 'lg' });
        const tags = ['tug', 'rlgl', 'rou', 'chairs', 'volcanic-lands', 'glz', 'cw', 'tt10', 'cs', 'bomb'];
        const rows = [];
        for (const tag of tags) {
          try {
            const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'liveCommands', tag, 'cmds'), fb.orderBy('createdAt', 'desc'), fb.limit(3)));
            snap.docs.forEach((d) => rows.push({ tag, ...d.data() }));
          } catch (err) { /* الكولكشن الفرعي قد يكون فارغاً لهذي اللعبة */ }
        }
        rows.sort((a, b) => (b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0) - (a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>النوع</th><th>الوقت</th></tr></thead><tbody>${rows.slice(0, 30).map((r) => `<tr><td class="is-primary" data-label="اللعبة">${r.tag}</td><td data-label="النوع">${r.type || '—'}</td><td data-label="الوقت">${fmtDate(r.createdAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا أمر تحكم مسجَّل مؤخراً لأهم الألعاب</p>';
      }
    },
    {
      title: 'تعديل نص عام لتنبيه بداية الراوند',
      keywords: 'نص عام تنبيه بداية راوند',
      badge: 'يحتاج ربط بمنطق الموقع',
      run: () => {
        openFormModal({
          title: 'نص بداية الراوند',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', 'screen_round_start'), { ar: v.text, category: 'screens' }, { merge: true });
            AdminToast.success('تم الحفظ — تذكير: غير مربوط بمنطق العرض الفعلي بعد');
          }
        });
      }
    },
    {
      title: 'تمديد وقت الراوند عن بُعد للعبة معيّنة (طوارئ)',
      keywords: 'تمديد وقت راوند بعد طوارئ',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>مؤقت كل راوند محلي بمتصفح الستريمر — ما فيه أمر "تمديد الوقت" جاهز بقناة liveCommands الحالية، يحتاج إضافة نوع أمر جديد لكل لعبة.</p>'; openModal({ title: 'تمديد الوقت', bodyEl: b, size: 'sm' }); }
    }
  ]
});
