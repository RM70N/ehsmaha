// ==================== القسم 27 — اختبار A/B ====================
// الآلية الأساسية حقيقية وفعّالة الآن: siteFlags/gameToggles[tag] يقبل إما
// true/false أو {rolloutPercent} — المستخدم يُحسَب له hash ثابت من uid
// (نفس مجموعته دائماً) يقرر دخوله ضمن نسبة التوزيع، مطبَّق فعلياً بدالة
// adminIsGameEnabled() على الألعاب الثمانية المفعَّلة بقسم 6. النتائج تُقاس
// بمقارنة نشاط playEvents الحقيقي بين المجموعتين.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';

const fb = AdminFB;
const AB_TAGS = ['tug', 'rlgl', 'rou', 'chairs', 'volcanic-lands', 'glz', 'cw', 'tt10'];

function hashUidPercent(uid) { let h = 0; for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0; return h % 100; }

async function loadExperiments() { const s = await fb.getDocs(fb.collection(fb.db, 'abExperiments')); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

defineSection({
  id: 27,
  title: 'اختبار A/B',
  description: `توزيع نسبي حقيقي مطبَّق على الألعاب الثمانية المفعَّلة (${AB_TAGS.join('، ')}) عبر siteFlags/gameToggles — نفس ثبات hash لكل مستخدم.`,
  tools: [
    {
      title: 'إنشاء تجربة A/B جديدة (نسخة أصلية مقابل نسخة معدّلة)',
      keywords: 'انشاء تجربة ab جديدة',
      run: () => {
        openFormModal({
          title: 'تجربة A/B جديدة',
          fields: [
            { key: 'name', label: 'اسم التجربة', required: true },
            { key: 'gameTag', label: 'اللعبة المستهدَفة', type: 'select', options: AB_TAGS.map((t) => ({ value: t, label: t })), required: true },
            { key: 'trafficPercent', label: 'نسبة المستخدمين بالنسخة B (%)', type: 'number', value: 50, required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [v.gameTag]: { rolloutPercent: Number(v.trafficPercent) } }, { merge: true });
            const ref = fb.doc(fb.collection(fb.db, 'abExperiments'));
            await fb.setDoc(ref, { name: v.name, gameTag: v.gameTag, trafficPercent: Number(v.trafficPercent), status: 'active', startedAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 27, sectionTitle: 'اختبار A/B', actionKey: 'ab.create', actionLabel: 'إنشاء تجربة A/B', targetType: 'abExperiment', targetId: ref.id, targetLabel: v.name });
            AdminToast.success('تم — التوزيع مطبَّق فعلياً الآن على كل من يفتح تلك اللعبة');
          }
        });
      }
    },
    {
      title: 'تحديد نسبة المستخدمين المشمولين بالتجربة',
      keywords: 'نسبة مستخدمين مشمولين تجربة',
      run: async () => {
        const exps = (await loadExperiments()).filter((e) => e.status === 'active');
        openFormModal({
          title: 'تعديل نسبة التوزيع',
          fields: [
            { key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true },
            { key: 'trafficPercent', label: 'النسبة الجديدة (%)', type: 'number', required: true }
          ],
          onSubmit: async (v) => {
            const exp = exps.find((e) => e.id === v.expId);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [exp.gameTag]: { rolloutPercent: Number(v.trafficPercent) } }, { merge: true });
            await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { trafficPercent: Number(v.trafficPercent) });
            AdminToast.success('تم التحديث الفوري');
          }
        });
      }
    },
    {
      title: 'عرض نتائج التجربة لحظياً أثناء تشغيلها',
      keywords: 'نتائج تجربة لحظية',
      run: async () => {
        const exps = (await loadExperiments()).filter((e) => e.status === 'active');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التجربة</span><select class="admin-input" id="rs-select">${exps.map((e) => `<option value="${e.id}">${e.name}</option>`).join('') || '<option>ولا تجربة نشطة</option>'}</select></div><div id="rs-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'نتائج حية', bodyEl: body, size: 'lg' });
        async function draw() {
          const exp = exps.find((e) => e.id === body.querySelector('#rs-select').value);
          if (!exp) return;
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
          const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === exp.gameTag && r.uid);
          let aCount = 0, bCount = 0;
          rows.forEach((r) => { if (hashUidPercent(r.uid) < exp.trafficPercent) bCount++; else aCount++; });
          body.querySelector('#rs-result').innerHTML = `<div class="admin-stat-row"><div class="admin-stat-card"><div class="admin-stat-card__label">A (الأصلية)</div><div class="admin-stat-card__value">${aCount}</div></div><div class="admin-stat-card"><div class="admin-stat-card__label">B (${exp.trafficPercent}% من المستخدمين)</div><div class="admin-stat-card__value">${bCount}</div></div></div>`;
        }
        if (exps.length) { body.querySelector('#rs-select').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'إنهاء التجربة وتطبيق النسخة الفائزة على الجميع',
      keywords: 'انهاء تجربة نسخة فائزة',
      run: async () => {
        const exps = (await loadExperiments()).filter((e) => e.status === 'active');
        openFormModal({
          title: 'إنهاء وتطبيق الفائزة',
          fields: [
            { key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true },
            { key: 'winner', label: 'النسخة الفائزة', type: 'select', options: [{ value: 'A', label: 'A (الأصلية)' }, { value: 'B', label: 'B (الجديدة)' }] }
          ],
          onSubmit: async (v) => {
            const exp = exps.find((e) => e.id === v.expId);
            // كلا الخيارين يرجّعون اللعبة لـ100% مفعّلة للجميع — الفرق الفعلي
            // الوحيد بين A/B هنا هو نسبة الظهور نفسها (لا يوجد كود سلوك مختلف
            // فعلي لكل نسخة)، فـ"تطبيق الفائز" يعني إنهاء التجربة بلا استثناء.
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [exp.gameTag]: true }, { merge: true });
            await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { status: 'finished', winner: v.winner, endedAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 27, sectionTitle: 'اختبار A/B', actionKey: 'ab.finish', actionLabel: 'إنهاء تجربة A/B', targetType: 'abExperiment', targetId: v.expId, after: { winner: v.winner }, sensitive: true });
            AdminToast.success('تم — رجعت اللعبة لـ100% مفعّلة للجميع');
          }
        });
      }
    },
    {
      title: 'إلغاء تجربة قبل انتهائها والعودة للأصل',
      keywords: 'الغاء تجربة عودة اصل',
      run: async () => {
        const exps = (await loadExperiments()).filter((e) => e.status === 'active');
        openFormModal({
          title: 'إلغاء تجربة',
          fields: [{ key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true }],
          submitText: 'إلغاء والعودة للأصل',
          onSubmit: async (v) => {
            const exp = exps.find((e) => e.id === v.expId);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [exp.gameTag]: true }, { merge: true });
            await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { status: 'cancelled' });
            AdminToast.success('تم الإلغاء');
          }
        });
      }
    },
    {
      title: 'اختبار تصميم جديد لصفحة معيّنة فقط',
      keywords: 'اختبار تصميم صفحة معينة',
      run: () => {
        openFormModal({
          title: 'تجربة تصميم صفحة',
          fields: [{ key: 'pageName', label: 'اسم الصفحة', required: true }, { key: 'notes', label: 'وصف التصميم الجديد', type: 'textarea' }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'abExperiments')), { name: 'تصميم: ' + v.pageName, type: 'design', notes: v.notes, status: 'draft', createdAt: fb.serverTimestamp() });
            AdminToast.success('تم التسجيل كمسودة — تطبيق تصميم فعلي مختلف على نفس الصفحة يحتاج تعديل كود مباشر (خارج نطاق ألعاب gameToggles)');
          }
        });
      }
    },
    {
      title: 'اختبار ميزة جديدة على فئة محدودة',
      keywords: 'اختبار ميزة جديدة فئة محدودة',
      meta: 'استخدم أداة "إنشاء تجربة A/B" أعلاه — نفس الآلية بالضبط',
      run: () => AdminToast.info('استخدم "إنشاء تجربة A/B جديدة" أعلاه لأي لعبة من الثمانية المدعومة')
    },
    {
      title: 'مقارنة معدل التفاعل بين النسختين بمقاييس واضحة',
      keywords: 'مقارنة معدل تفاعل نسختين',
      meta: 'مطابقة لأداة "عرض النتائج لحظياً" أعلاه',
      run: () => AdminToast.info('استخدم "عرض الترتيب الحي/النتائج لحظياً" أعلاه — نفس المقارنة الفعلية')
    },
    {
      title: 'أرشفة نتائج كل التجارب السابقة للرجوع إليها',
      keywords: 'ارشفة نتائج تجارب سابقة',
      run: async () => {
        const finished = (await loadExperiments()).filter((e) => e.status === 'finished' || e.status === 'cancelled');
        const body = document.createElement('div');
        body.innerHTML = finished.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>الحالة</th><th>الفائز</th></tr></thead><tbody>${finished.map((e) => `<tr><td class="is-primary" data-label="الاسم">${e.name}</td><td data-label="الحالة">${e.status}</td><td data-label="الفائز">${e.winner || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تجربة منتهية بعد</p>';
        openModal({ title: 'أرشيف تجارب A/B', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'جدولة بدء/إنهاء تجربة تلقائياً بتاريخ محدد',
      keywords: 'جدولة بدء انهاء تجربة تلقائي',
      run: async () => {
        const exps = await loadExperiments();
        openFormModal({
          title: 'جدولة تجربة',
          fields: [
            { key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true },
            { key: 'endDate', label: 'تاريخ الإنهاء المستهدَف', type: 'date', required: true }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { scheduledEndAt: new Date(v.endDate) }); AdminToast.success('تم الحفظ — الإنهاء الفعلي يحتاج فتح اللوحة والضغط "إنهاء التجربة" بذاك التاريخ (بدون Cloud Functions)'); }
        });
      }
    },
    {
      title: 'استبعاد فئة معيّنة (مثل الستريمرز VIP) من أي تجربة',
      keywords: 'استبعاد فئة تجربة vip',
      run: async () => {
        const exps = await loadExperiments();
        openFormModal({
          title: 'استبعاد فئة',
          fields: [{ key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true }, { key: 'excludeNote', label: 'الفئة المستبعَدة (نص حر)', required: true }],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { excludeNote: v.excludeNote }); AdminToast.success('تم التسجيل كبيانات — الآلية الأساسية (نسبة عشوائية) مفعّلة فعلياً؛ استثناء فئة محدَّدة بدقة (VIP) يحتاج ربط بسيط إضافي مع streamerProfiles.vip'); }
        });
      }
    },
    {
      title: 'تنبيه عند نتيجة واضحة الفوز إحصائياً',
      keywords: 'تنبيه نتيجة واضحة فوز',
      run: async () => {
        const exps = (await loadExperiments()).filter((e) => e.status === 'active');
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'فحص دلالة النتائج', bodyEl: body, size: 'md' });
        const rows = [];
        for (const exp of exps) {
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
          const evs = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === exp.gameTag && r.uid);
          const b = evs.filter((r) => hashUidPercent(r.uid) < exp.trafficPercent).length;
          const a = evs.length - b;
          const enough = a >= 30 && b >= 30;
          rows.push({ name: exp.name, a, b, verdict: enough ? (b > a * 1.2 ? 'B أفضل بوضوح' : a > b * 1.2 ? 'A أفضل بوضوح' : 'بدون فرق واضح') : 'العيّنة لسه صغيرة' });
        }
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>التجربة</th><th>A</th><th>B</th><th>الخلاصة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="التجربة">${r.name}</td><td data-label="A">${r.a}</td><td data-label="B">${r.b}</td><td data-label="الخلاصة">${r.verdict}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تجربة نشطة</p>';
      }
    },
    {
      title: 'تشغيل أكثر من تجربة A/B متزامنة على أقسام مختلفة',
      keywords: 'تجارب متزامنة متعددة',
      meta: 'مدعوم فعلياً — كل تجربة مربوطة بلعبة (gameTag) مستقلة عن الباقي',
      run: () => AdminToast.info('مدعوم تلقائياً — أنشئ عدة تجارب A/B لألعاب مختلفة وكلها تعمل بنفس الوقت باستقلالية')
    },
    {
      title: 'توثيق ملاحظات يدوية على كل تجربة',
      keywords: 'توثيق ملاحظات يدوية تجربة',
      run: async () => {
        const exps = await loadExperiments();
        openFormModal({
          title: 'ملاحظات تجربة',
          fields: [{ key: 'expId', label: 'التجربة', type: 'select', options: exps.map((e) => ({ value: e.id, label: e.name })), required: true }, { key: 'notes', label: 'ملاحظاتك', type: 'textarea', required: true }],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'abExperiments', v.expId), { notes: v.notes }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تصدير تقرير كل التجارب ونتائجها كملف مرجعي',
      keywords: 'تصدير تقرير تجارب نتائج',
      run: async () => {
        const exps = await loadExperiments();
        csvDownload('ab-experiments.csv', [['الاسم', 'اللعبة', 'الحالة', 'النسبة', 'الفائز'], ...exps.map((e) => [e.name, e.gameTag, e.status, e.trafficPercent, e.winner])]);
        AdminToast.success(`تم تصدير ${exps.length} تجربة`);
      }
    }
  ]
});
