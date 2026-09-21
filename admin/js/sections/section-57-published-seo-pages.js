// ==================== القسم 57 — صفحات السيو المنشورة ====================
// تكملة عملية لقسم 15: هناك تُنشئ محتوى مجدولاً (scheduledContent) وتؤرشف
// نسخاً (siteContentArchive) — هنا تدير قائمة كل ما جُدول/نُشر فعلياً
// (نشر فوري، إلغاء نشر، حذف، استعراض الأرشيف) بدل تكرار أدوات السيو
// التقنية (meta/sitemap/robots) الموجودة هناك أصلاً.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, csvDownload } from '../core/format.js';

const fb = AdminFB;

defineSection({
  id: 57,
  title: 'صفحات السيو المنشورة',
  description: 'قائمة كل المحتوى المجدوَل/المنشور فعلياً (scheduledContent + siteContentArchive) — الإعدادات التقنية للسيو (meta/sitemap) بقسم 15.',
  tools: [
    {
      title: 'عرض كل الصفحات/المقالات المجدولة وحالتها',
      keywords: 'عرض صفحات مجدولة حالة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'كل المحتوى المجدوَل', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'scheduledContent'), fb.orderBy('createdAt', 'desc'), fb.limit(200)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>العنوان</th><th>تاريخ النشر</th><th>الحالة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="العنوان">${r.title}</td><td data-label="النشر">${fmtDate(r.publishAt)}</td><td data-label="الحالة"><span class="admin-badge ${r.published ? 'admin-badge--on' : 'admin-badge--off'}">${r.published ? 'منشور' : 'بالانتظار'}</span></td></tr>`).join('')}</tbody></table>` : '<p>ولا محتوى مجدوَل بعد — أضِف واحداً من قسم 15</p>';
      }
    },
    {
      title: 'نشر محتوى مجدوَل فوراً (تجاوز التاريخ المحدَّد)',
      keywords: 'نشر محتوى مجدول فورا',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'scheduledContent'), fb.where('published', '==', false), fb.limit(100)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>العنوان</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="العنوان">${r.title}</td><td><button class="admin-btn admin-btn--primary admin-btn--sm" data-pub="${r.id}">نشر الآن</button></td></tr>`).join('')}</tbody></table>` : '<p>كل المحتوى منشور بالفعل</p>';
        openModal({ title: 'نشر فوري', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-pub]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = btn.getAttribute('data-pub');
          await fb.updateDoc(fb.doc(fb.db, 'scheduledContent', id), { published: true, publishedAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 57, sectionTitle: 'صفحات السيو المنشورة', actionKey: 'seoPages.publishNow', actionLabel: 'نشر محتوى فوري', targetType: 'scheduledContent', targetId: id });
          AdminToast.success('تم النشر');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'إلغاء نشر محتوى منشور',
      keywords: 'الغاء نشر محتوى منشور',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'scheduledContent'), fb.where('published', '==', true), fb.limit(100)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>العنوان</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="العنوان">${r.title}</td><td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-unpub="${r.id}">إلغاء النشر</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا محتوى منشور حالياً</p>';
        openModal({ title: 'إلغاء نشر', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-unpub]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'scheduledContent', btn.getAttribute('data-unpub')), { published: false });
          AdminToast.success('تم إلغاء النشر');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'حذف محتوى مجدوَل نهائياً',
      keywords: 'حذف محتوى مجدول نهائي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">معرّف المستند</span><input class="admin-input" id="sp-del-id" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="sp-del-go" style="margin-top:8px;">حذف نهائياً</button>';
        const modal = openModal({ title: 'حذف محتوى مجدوَل', bodyEl: body, size: 'sm' });
        body.querySelector('#sp-del-go').addEventListener('click', () => {
          const id = body.querySelector('#sp-del-id').value.trim();
          if (!id) return;
          openConfirm({
            title: 'تأكيد الحذف', danger: true, message: 'سيُحذف هذا المحتوى نهائياً.',
            onConfirm: async () => {
              if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
              await fb.deleteDoc(fb.doc(fb.db, 'scheduledContent', id));
              await AdminAudit.log({ section: 57, sectionTitle: 'صفحات السيو المنشورة', actionKey: 'seoPages.delete', actionLabel: 'حذف محتوى مجدوَل', targetType: 'scheduledContent', targetId: id, sensitive: true });
              AdminToast.success('تم الحذف');
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'استعراض الأرشيف (نسخ قديمة من صفحات ثابتة)',
      keywords: 'استعراض ارشيف نسخ قديمة صفحات',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أرشيف نسخ الصفحات', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'siteContentArchive'), fb.orderBy('archivedAt', 'desc'), fb.limit(100)));
        const rows = snap.docs.map((d) => d.data());
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الصفحة</th><th>تاريخ الأرشفة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الصفحة">${r.page}</td><td data-label="التاريخ">${fmtDate(r.archivedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا نسخة مؤرشَفة بعد</p>';
      }
    },
    {
      title: 'تصدير قائمة كل الصفحات المنشورة',
      keywords: 'تصدير قائمة صفحات منشورة',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'scheduledContent'), fb.where('published', '==', true)));
        const rows = snap.docs.map((d) => d.data());
        csvDownload('published-seo-pages.csv', [['العنوان', 'تاريخ النشر'], ...rows.map((r) => [r.title, fmtDate(r.publishedAt || r.publishAt)])]);
        AdminToast.success(`تم تصدير ${rows.length} صفحة`);
      }
    }
  ]
});
