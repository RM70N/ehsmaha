// ==================== القسم 24 — مراقبة الأداء التقني ====================
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;
const BRIDGE = 'https://ehsmaha.onrender.com';

async function loadErrors(limitN) { const s = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(limitN || 1000))); return s.docs.map((d) => d.data()); }

defineSection({
  id: 24,
  title: 'مراقبة الأداء التقني',
  description: 'زمن استجابة حقيقي، سجل أخطاء العميل الفعلي، وفحوصات حية للسيرفر الجسر — بعض المقاييس (حصة Firebase، Render API) تحتاج ربط خارجي.',
  tools: [
    {
      title: 'زمن استجابة Firebase لحظياً',
      keywords: 'زمن استجابة firebase لحظي',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ القياس...';
        openModal({ title: 'زمن استجابة Firestore الآن', bodyEl: body, size: 'sm' });
        const times = [];
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          try { await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'registration')); times.push(performance.now() - start); } catch (e) {}
        }
        const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
        body.innerHTML = avg != null ? `<div class="admin-stat-card"><div class="admin-stat-card__label">متوسط 3 قراءات الآن</div><div class="admin-stat-card__value">${avg} ms</div></div>` : '<p>تعذّر القياس</p>';
      }
    },
    {
      title: 'معدل الأخطاء (Error Rate) في آخر ساعة/يوم',
      keywords: 'معدل اخطاء ساعة يوم',
      run: async () => {
        const errs = await loadErrors(3000);
        const hour = errs.filter((e) => e.ts >= Date.now() - 3600000).length;
        const day = errs.filter((e) => e.ts >= Date.now() - 86400000).length;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-row"><div class="admin-stat-card"><div class="admin-stat-card__label">آخر ساعة</div><div class="admin-stat-card__value">${fmtNum(hour)}</div></div><div class="admin-stat-card"><div class="admin-stat-card__label">آخر يوم</div><div class="admin-stat-card__value">${fmtNum(day)}</div></div></div>`;
        openModal({ title: 'معدل الأخطاء', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'قائمة آخر 50 خطأ مسجَّل مع تفاصيلها التقنية',
      keywords: 'قائمة اخطاء تفاصيل تقنية',
      run: async () => {
        const errs = await loadErrors(50);
        const body = document.createElement('div');
        body.innerHTML = errs.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الرسالة</th><th>الصفحة</th></tr></thead><tbody>${errs.map((e) => `<tr><td data-label="الوقت">${fmtDate(e.ts)}</td><td data-label="الرسالة" class="is-primary">${(e.message || '').slice(0, 60)}</td><td data-label="الصفحة">${(e.url || '').slice(0, 40)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مسجَّل بعد</p>';
        openModal({ title: 'آخر 50 خطأ', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'متوسط زمن تحميل كل صفحة رئيسية في الموقع',
      keywords: 'متوسط زمن تحميل صفحة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ القياس (عينة لحظية واحدة، مو متوسط تاريخي)...';
        openModal({ title: 'زمن تحميل ehsmaha.com الآن', bodyEl: body, size: 'sm' });
        const start = performance.now();
        try { await fetch('https://ehsmaha.com/', { mode: 'no-cors', cache: 'no-store' }); body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">زمن الاستجابة الآن (من متصفحك)</div><div class="admin-stat-card__value">${Math.round(performance.now() - start)} ms</div></div>`; } catch (e) { body.textContent = 'تعذّر القياس'; }
      }
    },
    {
      title: 'استخدام حصة Firebase الحالية (قراءات/كتابات/تخزين)',
      keywords: 'حصة firebase استخدام',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج Firebase Management API + مفتاح خدمة (service account) — غير متاح من عميل ويب عادي بأمان.</p>'; openModal({ title: 'حصة Firebase', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تنبيه عند اقتراب استهلاك Firebase من الحد الشهري',
      keywords: 'تنبيه استهلاك firebase حد شهري',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>نفس اعتماد الأداة السابقة على Firebase Management API.</p>'; openModal({ title: 'تنبيه الحصة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'حالة خدمة Render (uptime، آخر إعادة تشغيل)',
      keywords: 'حالة خدمة render uptime',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'حالة سيرفر الجسر على Render', bodyEl: body, size: 'sm' });
        try {
          const r = await fetch(BRIDGE + '/healthz', { cache: 'no-store' });
          body.innerHTML = `<p>الحالة: <span class="admin-badge ${r.ok ? 'admin-badge--on' : 'admin-badge--off'}">${r.ok ? 'يعمل' : 'متعطّل'}</span></p><p class="admin-field__hint">uptime وتفاصيل آخر إعادة تشغيل تحتاج Render API + مفتاح — غير مربوط حالياً.</p>`;
        } catch (e) { body.innerHTML = '<p>تعذّر الوصول للخدمة</p>'; }
      }
    },
    {
      title: 'عرض Environment Variables الحالية على Render',
      keywords: 'environment variables render',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج مفتاح Render API — لن نعرض قيم حسّاسة بأي حال حتى بعد الربط، فقط أسماء المتغيرات.</p>'; openModal({ title: 'Environment Variables', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'سجل عمليات النشر (deployments) الأخيرة على Netlify/Render',
      keywords: 'سجل عمليات نشر deployments',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج مفتاح Netlify API و/أو Render API.</p>'; openModal({ title: 'سجل النشر', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'اختبار سرعة تحميل الموقع من مواقع جغرافية مختلفة',
      keywords: 'اختبار سرعة تحميل جغرافي',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج خدمة خارجية مثل WebPageTest API.</p>'; openModal({ title: 'اختبار السرعة الجغرافي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'مراقبة استهلاك الذاكرة/المعالج للخدمة الخلفية',
      keywords: 'استهلاك ذاكرة معالج خدمة خلفية',
      badge: 'يحتاج ربط خارجي',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج Render API لعرض مقاييس الموارد.</p>'; openModal({ title: 'استهلاك الموارد', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تنبيه عند تعطل أي خدمة (downtime alert)',
      keywords: 'تنبيه تعطل خدمة downtime',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'فحص تعطل الخدمات', bodyEl: body, size: 'sm' });
        const bridgeOk = await fetch(BRIDGE + '/healthz', { cache: 'no-store' }).then((r) => r.ok).catch(() => false);
        body.innerHTML = bridgeOk ? '<div class="admin-stat-card admin-stat-card--good"><div class="admin-stat-card__label">كل الخدمات المفحوصة تعمل</div></div>' : '<div class="admin-stat-card admin-stat-card--danger"><div class="admin-stat-card__label">سيرفر الجسر متعطّل!</div></div>';
      }
    },
    {
      title: 'عرض رسم بياني لاستقرار الأداء آخر 7 أيام',
      keywords: 'رسم بياني استقرار اداء اسبوع',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'apiHealthLog'), fb.orderBy('ts', 'desc'), fb.limit(500)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.ts >= Date.now() - 7 * 86400000 && r.bridgeMs != null);
        const body = document.createElement('div');
        body.innerHTML = rows.length ? renderBarChart({ labels: rows.slice(0, 30).reverse().map((r) => new Date(r.ts).toLocaleTimeString('ar', { hour: '2-digit' })), values: rows.slice(0, 30).reverse().map((r) => r.bridgeMs), height: 200 }) : '<p>ولا قياس مسجَّل آخر 7 أيام — استخدم أداة "سجل زمن استجابة API" بقسم 17 لتسجيل قياسات</p>';
        openModal({ title: 'استقرار الأداء آخر 7 أيام', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'تشغيل فحص صحة شامل (Health Check) بضغطة زر',
      keywords: 'فحص صحة شامل health check',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص الشامل...';
        openModal({ title: 'فحص صحة شامل', bodyEl: body, size: 'md' });
        const start = performance.now();
        const [bridgeOk, fireDocOk] = await Promise.all([
          fetch(BRIDGE + '/healthz', { cache: 'no-store' }).then((r) => r.ok).catch(() => false),
          fb.getDoc(fb.doc(fb.db, 'siteFlags', 'registration')).then(() => true).catch(() => false)
        ]);
        const ms = Math.round(performance.now() - start);
        const errs = await loadErrors(200);
        const recentErrCount = errs.filter((e) => e.ts >= Date.now() - 3600000).length;
        body.innerHTML = `<table class="admin-table"><tbody>
          <tr><td class="is-primary" data-label="الفحص">السيرفر الجسر</td><td data-label="النتيجة"><span class="admin-badge ${bridgeOk ? 'admin-badge--on' : 'admin-badge--off'}">${bridgeOk ? 'سليم' : 'معطّل'}</span></td></tr>
          <tr><td class="is-primary" data-label="الفحص">الاتصال بـFirestore</td><td data-label="النتيجة"><span class="admin-badge ${fireDocOk ? 'admin-badge--on' : 'admin-badge--off'}">${fireDocOk ? `سليم (${ms}ms)` : 'فشل'}</span></td></tr>
          <tr><td class="is-primary" data-label="الفحص">أخطاء العميل بآخر ساعة</td><td data-label="النتيجة">${fmtNum(recentErrCount)}</td></tr>
        </tbody></table>`;
      }
    },
    {
      title: 'تصدير تقرير أداء تقني أسبوعي',
      keywords: 'تصدير تقرير اداء تقني اسبوعي',
      run: async () => {
        const errs = (await loadErrors(2000)).filter((e) => e.ts >= Date.now() - 7 * 86400000);
        csvDownload('tech-performance-weekly.csv', [['الوقت', 'الرسالة', 'الصفحة'], ...errs.map((e) => [fmtDate(e.ts), e.message, e.url])]);
        printReport('تقرير الأداء التقني الأسبوعي', `<p>عدد الأخطاء آخر 7 أيام: ${errs.length}</p>`);
      }
    }
  ]
});
