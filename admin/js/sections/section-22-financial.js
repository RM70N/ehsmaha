// ==================== القسم 22 — التقارير المالية والإعلانية ====================
// حسب قرارك: ما فيه نظام إيرادات/إعلانات فعلي مربوط بالمشروع حالياً — هذا
// القسم هيكل كامل فوق كولكشن حقيقي جديد (financialTransactions) بدون أي
// رقم وهمي؛ كل الأرقام أدناه حقيقية وستكون صفر لحد ما تُدخل أول معاملة فعلية.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, printReport, tsToMillis } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;
async function loadTx(limitN) { const s = await fb.getDocs(fb.query(fb.collection(fb.db, 'financialTransactions'), fb.orderBy('date', 'desc'), fb.limit(limitN || 5000))); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }

defineSection({
  id: 22,
  title: 'التقارير المالية',
  description: 'ما فيه نظام دفع/إعلانات فعلي مربوط حالياً — هيكل حقيقي كامل بدون أرقام وهمية، جاهز بمجرد إدخال أول معاملة.',
  tools: [
    {
      title: 'إجمالي الإيرادات هذا الشهر',
      keywords: 'اجمالي ايرادات شهر',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.type === 'revenue' && tsToMillis(t.date) >= Date.now() - 30 * 86400000);
        const total = tx.reduce((s, t) => s + (t.amount || 0), 0);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">إجمالي الإيرادات (آخر 30 يوم)</div><div class="admin-stat-card__value">${fmtNum(total)}</div></div>`;
        openModal({ title: 'إجمالي الإيرادات', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'مصدر كل إيراد (إعلانات، رعايات، اشتراكات)',
      keywords: 'مصدر ايراد اعلانات رعايات',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.type === 'revenue');
        const counts = new Map();
        tx.forEach((t) => counts.set(t.source || 'غير محدد', (counts.get(t.source || 'غير محدد') || 0) + (t.amount || 0)));
        const body = document.createElement('div');
        body.innerHTML = counts.size ? `<table class="admin-table"><tbody>${[...counts.entries()].map(([s, a]) => `<tr><td class="is-primary" data-label="المصدر">${s}</td><td data-label="المبلغ">${fmtNum(a)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا معاملة إيراد مسجَّلة بعد</p>';
        openModal({ title: 'الإيرادات حسب المصدر', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'مقارنة الإيرادات بين شهرين',
      keywords: 'مقارنة ايرادات شهرين',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.type === 'revenue');
        const thisMonth = tx.filter((t) => tsToMillis(t.date) >= Date.now() - 30 * 86400000).reduce((s, t) => s + t.amount, 0);
        const lastMonth = tx.filter((t) => tsToMillis(t.date) >= Date.now() - 60 * 86400000 && tsToMillis(t.date) < Date.now() - 30 * 86400000).reduce((s, t) => s + t.amount, 0);
        const body = document.createElement('div');
        body.innerHTML = renderBarChart({ labels: ['الشهر الماضي', 'هذا الشهر'], values: [lastMonth, thisMonth], height: 180 });
        openModal({ title: 'مقارنة الإيرادات', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تكلفة تشغيل الخدمات (Firebase، Render، Netlify) الشهرية',
      keywords: 'تكلفة تشغيل خدمات شهرية',
      run: () => {
        openFormModal({
          title: 'تسجيل تكلفة خدمة',
          fields: [
            { key: 'category', label: 'الخدمة', type: 'select', options: [{ value: 'Firebase', label: 'Firebase' }, { value: 'Render', label: 'Render' }, { value: 'Netlify', label: 'Netlify' }, { value: 'API', label: 'API خارجية' }, { value: 'Other', label: 'أخرى' }] },
            { key: 'amount', label: 'المبلغ', type: 'number', required: true },
            { key: 'date', label: 'التاريخ', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'financialTransactions')), { type: 'expense', category: v.category, amount: Number(v.amount), date: new Date(v.date), createdAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 22, sectionTitle: 'التقارير المالية', actionKey: 'finance.expense', actionLabel: 'تسجيل تكلفة خدمة', after: v });
            AdminToast.success('تم التسجيل');
          }
        });
      }
    },
    {
      title: 'صافي الربح/الخسارة التقديري',
      keywords: 'صافي ربح خسارة تقديري',
      run: async () => {
        const tx = (await loadTx()).filter((t) => tsToMillis(t.date) >= Date.now() - 30 * 86400000);
        const revenue = tx.filter((t) => t.type === 'revenue').reduce((s, t) => s + t.amount, 0);
        const expense = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const net = revenue - expense;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card ${net >= 0 ? 'admin-stat-card--good' : 'admin-stat-card--danger'}"><div class="admin-stat-card__label">صافي آخر 30 يوم (إيرادات ${fmtNum(revenue)} - نفقات ${fmtNum(expense)})</div><div class="admin-stat-card__value">${fmtNum(net)}</div></div>`;
        openModal({ title: 'صافي الربح/الخسارة', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'عرض أداء كل حملة إعلانية إن وجدت',
      keywords: 'اداء حملة اعلانية',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.campaign);
        const counts = new Map();
        tx.forEach((t) => counts.set(t.campaign, (counts.get(t.campaign) || 0) + (t.amount || 0)));
        const body = document.createElement('div');
        body.innerHTML = counts.size ? `<table class="admin-table"><tbody>${[...counts.entries()].map(([c, a]) => `<tr><td class="is-primary" data-label="الحملة">${c}</td><td data-label="الصافي">${fmtNum(a)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا حملة إعلانية مسجَّلة بعد</p>';
        openModal({ title: 'أداء الحملات الإعلانية', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'جدولة تقرير مالي تلقائي يصلني شهرياً',
      keywords: 'جدولة تقرير مالي شهري',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'financialReportSchedule'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'جدولة تقرير مالي',
          fields: [{ key: 'enabled', label: 'مفعّل (يحتاج فتح اللوحة شهرياً لعدم وجود Cloud Functions)', type: 'checkbox', value: cur.enabled }, { key: 'email', label: 'إيميل الاستلام', value: cur.email || '' }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'financialReportSchedule'), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تتبع نفقات API الخارجية (تيك توك، ذكاء اصطناعي)',
      keywords: 'نفقات api خارجية',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.type === 'expense' && t.category === 'API');
        const total = tx.reduce((s, t) => s + t.amount, 0);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">إجمالي نفقات API المسجَّلة</div><div class="admin-stat-card__value">${fmtNum(total)}</div></div>`;
        openModal({ title: 'نفقات API', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'توقّع ميزانية الشهر القادم بناءً على الاتجاه الحالي',
      keywords: 'توقع ميزانية شهر قادم',
      run: async () => {
        const tx = await loadTx();
        const last30 = tx.filter((t) => t.type === 'expense' && tsToMillis(t.date) >= Date.now() - 30 * 86400000).reduce((s, t) => s + t.amount, 0);
        const body = document.createElement('div');
        body.innerHTML = `<p>نفقات آخر 30 يوم: ${fmtNum(last30)}</p><p>توقّع الشهر القادم (بافتراض استمرار نفس المعدّل): <strong>${fmtNum(last30)}</strong></p>`;
        openModal({ title: 'توقّع الميزانية', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'سجل كل معاملة مالية بتفاصيلها',
      keywords: 'سجل معاملة مالية تفاصيل',
      run: async () => {
        const tx = await loadTx();
        const body = document.createElement('div');
        body.innerHTML = tx.length ? `<table class="admin-table"><thead><tr><th>النوع</th><th>الفئة/المصدر</th><th>المبلغ</th><th>التاريخ</th></tr></thead><tbody>${tx.map((t) => `<tr><td data-label="النوع">${t.type === 'revenue' ? 'إيراد' : 'مصروف'}</td><td data-label="الفئة">${t.category || t.source || '—'}</td><td data-label="المبلغ" class="is-primary">${fmtNum(t.amount)}</td><td data-label="التاريخ">${fmtDate(t.date)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا معاملة مسجَّلة بعد</p>';
        openModal({ title: 'كل المعاملات المالية', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'تحديد حد إنذار عند اقتراب النفقات من الميزانية المحددة',
      keywords: 'حد انذار نفقات ميزانية',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'financialAlerts'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'حد الإنذار المالي',
          fields: [{ key: 'monthlyBudgetLimit', label: 'الحد الشهري للنفقات', type: 'number', value: cur.monthlyBudgetLimit || '' }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'financialAlerts'), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'مقارنة العائد من كل منصة بث',
      keywords: 'مقارنة عائد منصة بث',
      run: async () => {
        const tx = (await loadTx()).filter((t) => t.type === 'revenue' && t.platform);
        const counts = new Map();
        tx.forEach((t) => counts.set(t.platform, (counts.get(t.platform) || 0) + t.amount));
        const body = document.createElement('div');
        body.innerHTML = counts.size ? renderBarChart({ labels: [...counts.keys()], values: [...counts.values()], height: 180 }) : '<p>ولا بيانات مرتبطة بمنصة بث بعد</p>';
        openModal({ title: 'العائد حسب المنصة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير تقرير مالي كامل بصيغة تناسب المحاسبة',
      keywords: 'تصدير تقرير مالي محاسبة',
      run: async () => {
        const tx = await loadTx();
        csvDownload('financial-report.csv', [['النوع', 'الفئة/المصدر', 'المبلغ', 'التاريخ'], ...tx.map((t) => [t.type, t.category || t.source, t.amount, fmtDate(t.date)])]);
        printReport('التقرير المالي الكامل', `<p>عدد المعاملات: ${tx.length}</p>`);
      }
    },
    {
      title: 'إدارة أسعار/باقات الاشتراك لو أضفتها مستقبلاً',
      keywords: 'ادارة اسعار باقات اشتراك',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'subscriptionPlans'));
        const plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-table-wrap">${plans.map((p) => `<div style="padding:6px;border-bottom:1px solid var(--border);">${p.name} — ${p.price}</div>`).join('') || '<p>ولا باقة بعد</p>'}</div>
        <div class="admin-form" style="margin-top:10px;"><input class="admin-input" id="pl-name" placeholder="اسم الباقة" /><input class="admin-input" id="pl-price" type="number" placeholder="السعر" style="margin-top:6px;" /><button class="admin-btn admin-btn--primary admin-btn--sm" id="pl-add" style="margin-top:6px;">إضافة</button></div>`;
        openModal({ title: 'باقات الاشتراك', bodyEl: body, size: 'md' });
        body.querySelector('#pl-add').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const name = body.querySelector('#pl-name').value.trim();
          const price = Number(body.querySelector('#pl-price').value);
          if (!name) return;
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'subscriptionPlans')), { name, price });
          AdminToast.success('تم الحفظ');
        });
      }
    },
    {
      title: 'عرض قيمة كل مستخدم (LTV تقديري) بناءً على نشاطه',
      keywords: 'قيمة مستخدم ltv تقديري',
      run: async () => {
        const [tx, usersCountSnap] = await Promise.all([loadTx(), fb.getCountFromServer(fb.collection(fb.db, 'users'))]);
        const totalRevenue = tx.filter((t) => t.type === 'revenue').reduce((s, t) => s + t.amount, 0);
        const usersCount = usersCountSnap.data().count;
        const ltv = usersCount ? (totalRevenue / usersCount).toFixed(2) : 0;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">LTV تقديري (إجمالي الإيرادات ÷ عدد المستخدمين)</div><div class="admin-stat-card__value">${ltv}</div></div>`;
        openModal({ title: 'قيمة المستخدم التقديرية', bodyEl: body, size: 'sm' });
      }
    }
  ]
});
