// ==================== القسم 21 — بنوك الأسئلة والمواضيع ====================
// الطريق الزجاجي (GLZ_QUESTIONS، 500 سؤال) وتوب 10 (TOP10_FALLBACK_TOPICS)
// بنوك ثابتة مدمجة بالكود — نديرها بطبقة إضافات/تعطيل حقيقية فوق الأصل
// (gameContentBanks، نفس نمط game-admin-kit.contentBankTools) بدل مخاطرة
// ترحيل 500+ سؤال من كود لعبة شغّالة. ahsemhaCategories (بنك "احسمها"
// الأصلي) كولكشن Firestore حقيقي 100% نديره مباشرة.
import { AdminFB } from '../core/firebase.js';
import { openModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { contentBankTools } from '../core/game-admin-kit.js';

const fb = AdminFB;
const glz = contentBankTools({ bankKey: 'glz-questions', gameName: 'الطريق الزجاجي', itemLabel: 'أسئلة', addFields: [{ key: 'text', label: 'نص السؤال' }, { key: 'optionA', label: 'الخيار الأول' }, { key: 'optionB', label: 'الخيار الثاني' }, { key: 'correct', label: 'الإجابة الصحيحة (A/B)' }, { key: 'category', label: 'الفئة' }], renderItem: (it) => `${it.text} (${it.category || 'عام'})` });
const tt10 = contentBankTools({ bankKey: 'tt10-topics', gameName: 'توب 10', itemLabel: 'مواضيع', addFields: [{ key: 'topic', label: 'الموضوع' }, { key: 'answers', label: 'الإجابات (10، مفصولة بفاصلة بترتيب الأهمية)' }, { key: 'category', label: 'الفئة' }], renderItem: (it) => it.topic });

async function loadBank(key) { const s = await fb.getDoc(fb.doc(fb.db, 'gameContentBanks', key)); return s.exists() ? s.data() : { custom: [], disabled: [] }; }

defineSection({
  id: 21,
  title: 'بنوك الأسئلة والمواضيع',
  description: 'الطريق الزجاجي وتوب 10 بنوك ثابتة بالكود — نديرها بطبقة إضافة/تعطيل حقيقية. ahsemhaCategories كولكشن Firestore حي.',
  tools: [
    { title: 'إضافة سؤال جديد لبنك "الطريق الزجاجي"', keywords: 'اضافة سؤال طريق زجاجي', run: glz.manage.run },
    {
      title: 'تعديل سؤال موجود في البنك (500 سؤال)',
      keywords: 'تعديل سؤال بنك',
      meta: 'عطّل السؤال القديم وأضف نسخة معدَّلة من أداة الإضافة',
      run: glz.manage.run
    },
    {
      title: 'حذف سؤال من البنك',
      keywords: 'حذف سؤال بنك',
      meta: 'استخدم "تعطيل" من نفس نافذة إدارة البنك',
      run: glz.manage.run
    },
    {
      title: 'استيراد دفعة أسئلة من ملف CSV/JSON دفعة واحدة',
      keywords: 'استيراد دفعة اسئلة csv json',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">ملف JSON (مصفوفة كائنات {text,optionA,optionB,correct,category})</span><input class="admin-input" type="file" id="imp-file" accept="application/json" /></div><div id="imp-status" style="margin-top:8px;"></div>';
        openModal({ title: 'استيراد دفعة أسئلة للطريق الزجاجي', bodyEl: body, size: 'sm' });
        body.querySelector('#imp-file').addEventListener('change', async (e) => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const file = e.target.files[0];
          if (!file) return;
          try {
            const items = JSON.parse(await file.text());
            const data = await loadBank('glz-questions');
            data.custom = (data.custom || []).concat(items);
            await fb.setDoc(fb.doc(fb.db, 'gameContentBanks', 'glz-questions'), data, { merge: true });
            body.querySelector('#imp-status').textContent = `تم استيراد ${items.length} سؤال`;
          } catch (err) { body.querySelector('#imp-status').textContent = 'ملف غير صالح: ' + err.message; }
        });
      }
    },
    { title: 'إضافة موضوع جديد لبنك "توب 10"', keywords: 'اضافة موضوع توب 10', run: tt10.manage.run },
    {
      title: 'تعديل ترتيب إجابات موضوع موجود',
      keywords: 'تعديل ترتيب اجابات موضوع',
      meta: 'عطّل الموضوع القديم وأضف نسخة بترتيب جديد من أداة الإضافة',
      run: tt10.manage.run
    },
    {
      title: 'حذف موضوع من بنك الـ200 موضوع',
      keywords: 'حذف موضوع بنك',
      meta: 'استخدم "تعطيل" من نفس نافذة إدارة البنك',
      run: tt10.manage.run
    },
    {
      title: 'تصنيف الأسئلة/المواضيع حسب الصعوبة أو الفئة',
      keywords: 'تصنيف اسئلة صعوبة فئة',
      meta: 'حقل الفئة متاح عند إضافة أي سؤال/موضوع جديد بأدوات الإضافة أعلاه',
      run: () => AdminToast.info('أضف الفئة مباشرة أثناء إضافة سؤال/موضوع جديد من الأدوات أعلاه')
    },
    {
      title: 'تعطيل سؤال معيّن مؤقتاً دون حذفه',
      keywords: 'تعطيل سؤال مؤقت',
      run: glz.manage.run
    },
    {
      title: 'عرض إحصائية أكثر الأسئلة تسبباً في إقصاء اللاعبين',
      keywords: 'اكثر اسئلة اقصاء لاعبين',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه تسجيل مرتبط بأي سؤال تحديداً تسبَّب بإقصاء لاعب — يحتاج تعديل منطق اللعبة نفسه لتسجيل ذلك.</p>'; openModal({ title: 'إحصائية الإقصاء', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'البحث داخل بنك الأسئلة/المواضيع الحالي',
      keywords: 'بحث بنك اسئلة مواضيع',
      run: async () => {
        const [glzData, tt10Data] = await Promise.all([loadBank('glz-questions'), loadBank('tt10-topics')]);
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">بحث (بالإضافات اليدوية فقط)</span><input class="admin-input" id="sr-q" /></div><div id="sr-result" style="margin-top:10px;"></div>';
        openModal({ title: 'بحث بالإضافات اليدوية', bodyEl: body, size: 'lg' });
        body.querySelector('#sr-q').addEventListener('input', (e) => {
          const q = e.target.value.toLowerCase();
          const glzMatches = (glzData.custom || []).filter((it) => (it.text || '').toLowerCase().includes(q));
          const tt10Matches = (tt10Data.custom || []).filter((it) => (it.topic || '').toLowerCase().includes(q));
          body.querySelector('#sr-result').innerHTML = q ? `<p>الطريق الزجاجي: ${glzMatches.map((m) => m.text).join('، ') || 'ولا نتيجة'}</p><p>توب 10: ${tt10Matches.map((m) => m.topic).join('، ') || 'ولا نتيجة'}</p>` : '<p class="admin-field__hint">البحث هنا يشمل فقط الأسئلة/المواضيع المضافة يدوياً عبر هذي اللوحة (البنك الأصلي المدمج بالكود غير قابل للفهرسة هنا).</p>';
        });
      }
    },
    { title: 'تصدير البنك الكامل كنسخة احتياطية', keywords: 'تصدير بنك نسخة احتياطية', run: glz.export.run },
    {
      title: 'اقتراح أسئلة/مواضيع جديدة بالذكاء الاصطناعي لمراجعتي قبل الإضافة',
      keywords: 'اقتراح اسئلة ذكاء اصطناعي',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج مفتاح API لخدمة ذكاء اصطناعي (نفس الخدمة المستخدَمة بـtop10AiGetKey بالموقع الرئيسي) — غير مربوط بلوحة الإدارة حالياً.</p>'; openModal({ title: 'اقتراح بالذكاء الاصطناعي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تتبع عدد مرات استخدام كل سؤال/موضوع لتفادي التكرار المزعج',
      keywords: 'تتبع استخدام سؤال موضوع',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>اللعبة تختار عشوائياً من البنك بدون تسجيل أي عدّاد استخدام حالياً.</p>'; openModal({ title: 'تتبع الاستخدام', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إضافة بنك أسئلة/مواضيع كامل جديد للعبة مستقبلية',
      keywords: 'اضافة بنك جديد لعبة مستقبلية',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">معرّف البنك الجديد (إنجليزي)</span><input class="admin-input" id="nb-key" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="nb-go" style="margin-top:8px;">إنشاء بنك فارغ</button>';
        const modal = openModal({ title: 'بنك محتوى جديد', bodyEl: body, size: 'sm' });
        body.querySelector('#nb-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const key = body.querySelector('#nb-key').value.trim();
          if (!key) return;
          await fb.setDoc(fb.doc(fb.db, 'gameContentBanks', key), { custom: [], disabled: [] });
          AdminToast.success(`تم إنشاء بنك "${key}" — جاهز لإضافة عناصر له مستقبلاً`);
          modal.close();
        });
      }
    }
  ]
});
