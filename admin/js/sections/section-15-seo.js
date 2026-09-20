// ==================== القسم 15 — إدارة السيو والمحتوى العام ====================
// about/FAQ/meta تُدار كمحتوى حقيقي بكولكشن جديد siteContent (لا يوجد نظام
// CMS بالموقع الرئيسي حالياً) — عرضها فعلياً يحتاج ربط بسيط بصفحات about/faq
// بمرحلة قادمة. sitemap.xml/robots.txt/llms.txt ملفات ثابتة بالريبو، نعرضها
// هنا للقراءة (من GitHub) فقط لأن الكتابة تحتاج صلاحية نشر على GitHub غير
// متاحة من لوحة عميلية بدون خادم.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;
const RAW_BASE = 'https://raw.githubusercontent.com/RM70N/ehsmaha/main/';

async function getContent(id) { const s = await fb.getDoc(fb.doc(fb.db, 'siteContent', id)); return s.exists() ? s.data() : {}; }
async function fetchRaw(path) { try { const r = await fetch(RAW_BASE + path, { cache: 'no-store' }); return r.ok ? await r.text() : 'تعذّر الجلب'; } catch (e) { return 'تعذّر الجلب: ' + e.message; } }
function rawViewer(title, path) {
  const body = document.createElement('div');
  body.textContent = 'جارٍ الجلب من GitHub...';
  openModal({ title, bodyEl: body, size: 'xl' });
  fetchRaw(path).then((text) => { const pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto;'; pre.textContent = text; body.innerHTML = ''; body.appendChild(pre); });
}

defineSection({
  id: 15,
  title: 'إدارة السيو والمحتوى العام',
  description: 'محتوى about/FAQ يُدار بكولكشن siteContent الجديد. الملفات الثابتة (sitemap/robots/llms) للقراءة فقط من GitHub.',
  tools: [
    {
      title: 'تعديل نص صفحة "من نحن" مباشرة من اللوحة',
      keywords: 'تعديل من نحن about',
      run: async () => {
        const cur = await getContent('about');
        openFormModal({
          title: 'صفحة من نحن',
          fields: [{ key: 'text', label: 'النص', type: 'textarea', value: cur.text || '', rows: 10 }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteContent', 'about'), { text: v.text, updatedAt: fb.serverTimestamp() }, { merge: true });
            await AdminAudit.log({ section: 15, sectionTitle: 'إدارة السيو والمحتوى العام', actionKey: 'seo.about', actionLabel: 'تعديل صفحة من نحن' });
            AdminToast.success('تم الحفظ — يحتاج ربط صفحة about الفعلية بهذا المستند بمرحلة قادمة لعرضه مباشرة');
          }
        });
      }
    },
    {
      title: 'تعديل أسئلة وأجوبة صفحة FAQ',
      keywords: 'تعديل اسئلة اجوبة faq',
      run: async () => {
        const cur = await getContent('faq');
        const items = cur.items || [];
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `<div class="admin-table-wrap" style="max-height:260px;overflow-y:auto;">${items.map((it, i) => `<div style="padding:6px;border-bottom:1px solid var(--border);"><strong>${it.q}</strong><p style="margin:4px 0 0;color:var(--text-secondary);font-size:12px;">${it.a}</p><button class="admin-btn admin-btn--ghost admin-btn--sm" data-rm="${i}" style="margin-top:4px;">حذف</button></div>`).join('') || '<p>ولا سؤال بعد</p>'}</div>
          <div class="admin-form" style="margin-top:10px;"><input class="admin-input" id="faq-q" placeholder="السؤال" /><textarea class="admin-input" id="faq-a" rows="2" placeholder="الجواب" style="margin-top:6px;"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="faq-add" style="margin-top:6px;">إضافة</button></div>`;
          body.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', async () => { items.splice(Number(btn.getAttribute('data-rm')), 1); await fb.setDoc(fb.doc(fb.db, 'siteContent', 'faq'), { items }, { merge: true }); draw(); }));
          body.querySelector('#faq-add').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const q = body.querySelector('#faq-q').value.trim();
            const a = body.querySelector('#faq-a').value.trim();
            if (!q || !a) return;
            items.push({ q, a });
            await fb.setDoc(fb.doc(fb.db, 'siteContent', 'faq'), { items }, { merge: true });
            draw();
          });
        }
        draw();
        openModal({ title: 'أسئلة وأجوبة FAQ', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تعديل عناوين ووصف صفحات الألعاب (meta tags) للسيو',
      keywords: 'تعديل meta tags سيو',
      run: () => {
        openFormModal({
          title: 'Meta لصفحة لعبة',
          fields: [
            { key: 'gameTag', label: 'وسم اللعبة', required: true },
            { key: 'metaTitle', label: 'العنوان (title)', required: true },
            { key: 'metaDescription', label: 'الوصف (description)', type: 'textarea', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteContent', 'meta_' + v.gameTag), { metaTitle: v.metaTitle, metaDescription: v.metaDescription }, { merge: true });
            AdminToast.success('تم الحفظ بقاعدة البيانات — تحديث وسوم <head> الفعلية بصفحة اللعبة الثابتة يحتاج تعديل يدوي على index.html حالياً');
          }
        });
      }
    },
    {
      title: 'تحديث sitemap.xml تلقائياً عند إضافة صفحة جديدة',
      keywords: 'sitemap تحديث',
      run: () => rawViewer('sitemap.xml الحالي (من GitHub)', 'sitemap.xml')
    },
    {
      title: 'تحديث robots.txt من واجهة بسيطة',
      keywords: 'robots.txt تحديث',
      run: () => rawViewer('robots.txt الحالي (من GitHub)', 'robots.txt')
    },
    {
      title: 'معاينة كيف تظهر الصفحة في نتائج البحث قبل النشر',
      keywords: 'معاينة نتائج بحث جوجل',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">العنوان</span><input class="admin-input" id="serp-title" /></div>
        <div class="admin-field"><span class="admin-field__label">الوصف</span><textarea class="admin-input" id="serp-desc" rows="2"></textarea></div>
        <div style="margin-top:14px;background:#fff;color:#222;padding:14px;border-radius:8px;font-family:Arial;">
          <div style="color:#1a0dab;font-size:18px;" id="serp-preview-title">—</div>
          <div style="color:#006621;font-size:13px;">ehsmaha.com</div>
          <div style="font-size:13px;color:#545454;" id="serp-preview-desc">—</div>
        </div>`;
        openModal({ title: 'معاينة نتيجة بحث Google', bodyEl: body, size: 'md' });
        function draw() { body.querySelector('#serp-preview-title').textContent = body.querySelector('#serp-title').value || '—'; body.querySelector('#serp-preview-desc').textContent = body.querySelector('#serp-desc').value || '—'; }
        body.querySelector('#serp-title').addEventListener('input', draw);
        body.querySelector('#serp-desc').addEventListener('input', draw);
      }
    },
    {
      title: 'إدارة روابط llms.txt وملفات الزواحف الخاصة بالذكاء الاصطناعي',
      keywords: 'llms.txt زواحف ذكاء اصطناعي',
      run: () => rawViewer('llms.txt الحالي (من GitHub)', 'llms.txt')
    },
    {
      title: 'تحديث og-image والصور المستخدمة في المشاركة الاجتماعية',
      keywords: 'og image مشاركة اجتماعية',
      run: async () => {
        const cur = await getContent('ogImage');
        openFormModal({
          title: 'صورة المشاركة الاجتماعية (og:image)',
          fields: [{ key: 'url', label: 'رابط الصورة الجديد', value: cur.url || '', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteContent', 'ogImage'), v, { merge: true });
            AdminToast.success('تم الحفظ بقاعدة البيانات — تحديث وسم og:image الفعلي بـ<head> يحتاج تعديل index.html مباشرة حالياً');
          }
        });
      }
    },
    {
      title: 'تتبع ترتيب الموقع لكلمات مفتاحية مستهدفة',
      keywords: 'ترتيب موقع كلمات مفتاحية',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج خدمة تتبع ترتيب SEO خارجية (مثل Google Search Console API أو أداة SERP tracking) — غير مربوطة حالياً.</p>'; openModal({ title: 'تتبع الترتيب', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'عرض تقرير Google Search Console داخل اللوحة',
      keywords: 'google search console تقرير',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج ربط حساب Google Search Console عبر OAuth + مفتاح API — غير مربوط حالياً.</p>'; openModal({ title: 'Search Console', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إدارة الروابط الداخلية بين صفحات الموقع',
      keywords: 'روابط داخلية صفحات',
      run: async () => {
        const cur = await getContent('internalLinks');
        openFormModal({
          title: 'الروابط الداخلية الموصى بها',
          fields: [{ key: 'notes', label: 'ملاحظات/قائمة روابط (نص حر)', type: 'textarea', value: cur.notes || '', rows: 6 }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteContent', 'internalLinks'), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'جدولة نشر محتوى جديد (مقال/صفحة) بتاريخ مستقبلي',
      keywords: 'جدولة نشر محتوى مستقبلي',
      run: () => {
        openFormModal({
          title: 'جدولة محتوى جديد',
          fields: [
            { key: 'title', label: 'العنوان', required: true },
            { key: 'body', label: 'المحتوى', type: 'textarea', required: true },
            { key: 'publishAt', label: 'تاريخ النشر', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'scheduledContent')), { ...v, publishAt: new Date(v.publishAt), published: false, createdAt: fb.serverTimestamp() });
            AdminToast.success('تم الجدولة (يحتاج ربط صفحة عرض فعلية بمرحلة قادمة)');
          }
        });
      }
    },
    {
      title: 'أرشفة نسخ سابقة من أي صفحة للرجوع إليها',
      keywords: 'ارشفة نسخ سابقة صفحة',
      run: async () => {
        const about = await getContent('about');
        await fb.setDoc(fb.doc(fb.collection(fb.db, 'siteContentArchive')), { page: 'about', snapshot: about, archivedAt: fb.serverTimestamp() });
        AdminToast.success('تم أخذ نسخة أرشيفية من صفحة "من نحن" الحالية');
      }
    },
    {
      title: 'فحص سريع لسرعة تحميل الصفحات الرئيسية',
      keywords: 'فحص سرعة تحميل صفحات',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ القياس...';
        openModal({ title: 'قياس سرعة تحميل ehsmaha.com', bodyEl: body, size: 'sm' });
        const start = performance.now();
        try {
          await fetch('https://ehsmaha.com/', { mode: 'no-cors', cache: 'no-store' });
          const ms = Math.round(performance.now() - start);
          body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">زمن الاستجابة التقريبي (من متصفحك الآن)</div><div class="admin-stat-card__value">${ms} ms</div></div>`;
        } catch (err) { body.textContent = 'تعذّر القياس: ' + err.message; }
      }
    },
    {
      title: 'تصدير تقرير سيو شهري',
      keywords: 'تصدير تقرير سيو شهري',
      run: async () => {
        const [about, faq] = await Promise.all([getContent('about'), getContent('faq')]);
        const body = document.createElement('div');
        body.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;">${JSON.stringify({ about, faq }, null, 2)}</pre>`;
        openModal({ title: 'ملخص محتوى السيو الحالي', bodyEl: body, size: 'lg' });
      }
    }
  ]
});
