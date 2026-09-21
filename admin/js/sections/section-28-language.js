// ==================== القسم 28 — إدارة اللغة والترجمة ====================
// صراحة: الموقع الرئيسي عربي بالكامل بنصوص مدمجة مباشرة بالكود (بدون أي
// نظام i18n) — نبني هنا نظام نصوص جديد (uiText) بديل حقيقي وظيفياً، لكنه
// يبدأ فارغاً ولا يستبدل النصوص الحالية بالموقع تلقائياً حتى تُربط الصفحات
// به لاحقاً. أضف/عدّل أي نص وسيكون جاهزاً للاستخدام فوراً بمجرد الربط.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, csvDownload } from '../core/format.js';

const fb = AdminFB;
async function loadTexts() { const s = await fb.getDocs(fb.collection(fb.db, 'uiText')); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

defineSection({
  id: 28,
  title: 'إدارة اللغة والترجمة',
  description: 'نظام نصوص مركزي جديد (uiText) — الموقع الرئيسي عربي بالكامل بنصوص مدمجة بالكود حالياً، هذا النظام جاهز للربط التدريجي.',
  tools: [
    {
      title: 'عرض كل النصوص الثابتة من مكان مركزي واحد',
      keywords: 'عرض نصوص ثابتة مركزي',
      run: async () => {
        const texts = await loadTexts();
        const body = document.createElement('div');
        body.innerHTML = texts.length ? `<table class="admin-table"><thead><tr><th>المفتاح</th><th>النص</th></tr></thead><tbody>${texts.map((t) => `<tr><td class="is-primary" data-label="المفتاح">${t.id}</td><td data-label="النص">${(t.ar || '').slice(0, 60)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا نص مضاف بعد لهذا النظام</p>';
        openModal({ title: 'كل النصوص', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'تعديل أي نص ثابت مباشرة دون لمس الكود',
      keywords: 'تعديل نص ثابت مباشر',
      run: () => {
        openFormModal({
          title: 'إضافة/تعديل نص',
          fields: [{ key: 'key', label: 'المفتاح', required: true }, { key: 'ar', label: 'النص بالعربي', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'uiText', v.key), { ar: v.ar, updatedAt: fb.serverTimestamp() }, { merge: true });
            await AdminAudit.log({ section: 28, sectionTitle: 'إدارة اللغة والترجمة', actionKey: 'lang.edit', actionLabel: 'تعديل نص', targetType: 'uiText', targetId: v.key });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'إضافة لغة جديدة للموقع مستقبلاً (إنجليزي مثلاً)',
      keywords: 'اضافة لغة جديدة انجليزي',
      run: () => {
        openFormModal({
          title: 'ترجمة إنجليزية لنص',
          fields: [{ key: 'key', label: 'مفتاح النص الموجود', required: true }, { key: 'en', label: 'النص بالإنجليزي', type: 'textarea', required: true }],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'uiText', v.key), { en: v.en }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تبديل سريع بين معاينة اللغات المتاحة',
      keywords: 'تبديل معاينة لغات',
      run: async () => {
        const texts = await loadTexts();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اللغة</span><select class="admin-input" id="lg-select"><option value="ar">عربي</option><option value="en">English</option></select></div><div id="lg-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'معاينة اللغات', bodyEl: body, size: 'lg' });
        function draw() { const lang = body.querySelector('#lg-select').value; body.querySelector('#lg-result').innerHTML = texts.map((t) => `<p>${t.id}: ${t[lang] || '(بدون ترجمة)'}</p>`).join('') || '<p>ولا نص</p>'; }
        body.querySelector('#lg-select').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'تحديد اللغة الافتراضية حسب موقع الزائر',
      keywords: 'لغة افتراضية موقع زائر',
      run: async () => {
        openFormModal({
          title: 'اللغة الافتراضية',
          fields: [{ key: 'defaultLang', label: 'اللغة الافتراضية الحالية', type: 'select', options: [{ value: 'ar', label: 'عربي' }] }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'language'), v, { merge: true }); AdminToast.success('تم الحفظ — الموقع عربي بالكامل حالياً فما فيه تبديل تلقائي فعلي بعد'); }
        });
      }
    },
    {
      title: 'البحث عن نص معيّن داخل كل صفحات الموقع لتعديله بسرعة',
      keywords: 'بحث نص صفحات موقع',
      run: async () => {
        const texts = await loadTexts();
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">بحث</span><input class="admin-input" id="sr-q" /></div><div id="sr-result" style="margin-top:10px;"></div><p class="admin-field__hint">البحث هنا يشمل نظام uiText الجديد فقط، مو كل نصوص index.html المدمجة بالكود.</p>';
        openModal({ title: 'بحث بالنصوص', bodyEl: body, size: 'lg' });
        body.querySelector('#sr-q').addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          const matches = texts.filter((t) => (t.ar || '').toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
          body.querySelector('#sr-result').innerHTML = matches.map((t) => `<p>${t.id}: ${t.ar}</p>`).join('') || '<p class="admin-field__hint">ولا نتيجة</p>';
        });
      }
    },
    {
      title: 'سجل كل التعديلات النصية مع تاريخها',
      keywords: 'سجل تعديلات نصية تاريخ',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').startsWith('lang.'));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>المفتاح</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="المفتاح">${r.targetId}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تعديل مسجَّل بعد</p>';
        openModal({ title: 'سجل التعديلات النصية', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير كل النصوص كملف ترجمة قياسي (JSON/CSV)',
      keywords: 'تصدير نصوص ترجمة قياسي',
      run: async () => {
        const texts = await loadTexts();
        csvDownload('ui-text.csv', [['المفتاح', 'عربي', 'إنجليزي'], ...texts.map((t) => [t.id, t.ar, t.en])]);
        AdminToast.success(`تم تصدير ${texts.length} نص`);
      }
    },
    {
      title: 'استيراد ترجمة جاهزة لملء لغة جديدة دفعة واحدة',
      keywords: 'استيراد ترجمة جاهزة دفعة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">ملف JSON (مصفوفة {key, ar, en})</span><input class="admin-input" type="file" id="im-file" accept="application/json" /></div><div id="im-status" style="margin-top:8px;"></div>';
        openModal({ title: 'استيراد ترجمة', bodyEl: body, size: 'sm' });
        body.querySelector('#im-file').addEventListener('change', async (e) => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const file = e.target.files[0];
          if (!file) return;
          try {
            const items = JSON.parse(await file.text());
            await Promise.all(items.map((it) => fb.setDoc(fb.doc(fb.db, 'uiText', it.key), it, { merge: true })));
            body.querySelector('#im-status').textContent = `تم استيراد ${items.length} نص`;
          } catch (err) { body.querySelector('#im-status').textContent = 'ملف غير صالح: ' + err.message; }
        });
      }
    },
    {
      title: 'تعديل نصوص الإشعارات والرسائل التلقائية للنظام',
      keywords: 'تعديل نصوص اشعارات رسائل تلقائية',
      run: () => {
        openFormModal({
          title: 'نص إشعار نظام',
          fields: [{ key: 'key', label: 'مفتاح (مثال: notif_welcome)', required: true }, { key: 'ar', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'uiText', v.key), { ar: v.ar, category: 'system' }, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تعديل نصوص رسائل الأخطاء التي يراها المستخدم',
      keywords: 'تعديل نصوص رسائل اخطاء',
      run: () => {
        openFormModal({
          title: 'نص رسالة خطأ',
          fields: [{ key: 'key', label: 'مفتاح (مثال: err_network)', required: true }, { key: 'ar', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'uiText', v.key), { ar: v.ar, category: 'errors' }, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'معاينة طول النص المترجم للتأكد أنه لا يكسر التصميم',
      keywords: 'معاينة طول نص مترجم تصميم',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<textarea class="admin-input" id="ln-text" rows="3"></textarea><p id="ln-count" style="margin-top:8px;">0 حرف</p>';
        openModal({ title: 'قياس طول النص', bodyEl: body, size: 'sm' });
        body.querySelector('#ln-text').addEventListener('input', (e) => { body.querySelector('#ln-count').textContent = `${e.target.value.length} حرف`; });
      }
    },
    {
      title: 'تحديد نصوص لا يجب ترجمتها (أسماء الألعاب مثلاً)',
      keywords: 'نصوص لا تترجم اسماء العاب',
      run: () => {
        openFormModal({
          title: 'وسم نص "لا يُترجم"',
          fields: [{ key: 'key', label: 'مفتاح النص', required: true }],
          submitText: 'وسم كـ"لا يُترجم"',
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'uiText', v.key), { doNotTranslate: true }); AdminToast.success('تم'); }
        });
      }
    },
    {
      title: 'مراجعة نصوص مولَّدة تلقائياً بالذكاء الاصطناعي قبل اعتمادها',
      keywords: 'مراجعة نصوص مولدة ذكاء اصطناعي',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج خدمة ترجمة/توليد بالذكاء الاصطناعي مربوطة — غير متاحة حالياً.</p>'; openModal({ title: 'مراجعة ترجمة AI', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'أرشفة نسخة قديمة من النصوص قبل تعديل جماعي',
      keywords: 'ارشفة نسخة نصوص تعديل جماعي',
      run: async () => {
        const texts = await loadTexts();
        await fb.setDoc(fb.doc(fb.collection(fb.db, 'uiTextArchive')), { snapshot: texts, archivedAt: fb.serverTimestamp() });
        AdminToast.success(`تم أخذ نسخة من ${texts.length} نص`);
      }
    }
  ]
});
