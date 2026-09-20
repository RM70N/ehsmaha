// ==================== القسم 18 — تحليلات الاستحواذ والاحتفاظ ====================
// كله محسوب حقيقياً من users.createdAt + playEvents. لا يوجد تتبع مصدر
// زيارة/حملة تسويقية (UTM) بالموقع الرئيسي حالياً — موضَّح بوضوح بالأداتين
// المعنيتين بدل رقم وهمي.
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;
function ts(x) { return x && x.toMillis ? x.toMillis() : (x instanceof Date ? x.getTime() : 0); }

async function loadUsers(limitN) { const s = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.limit(limitN || 8000))); return s.docs.map((d) => ({ uid: d.id, ...d.data() })); }
async function loadEvents(limitN) { const s = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(limitN || 10000))); return s.docs.map((d) => d.data()); }

defineSection({
  id: 18,
  title: 'تحليلات النمو',
  description: 'كله محسوب من users.createdAt وplayEvents الحقيقيَين — لا يوجد تتبع UTM/حملات تسويقية حالياً.',
  tools: [
    {
      title: 'مصدر المستخدمين الجدد',
      keywords: 'مصدر مستخدمين جدد',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه تتبع مصدر تسجيل (UTM/رابط إحالة) على users حالياً.</p>'; openModal({ title: 'مصدر المستخدمين', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'معدل الاحتفاظ اليومي (Day-1 Retention)',
      keywords: 'معدل احتفاظ يومي retention',
      run: async () => {
        const [users, events] = await Promise.all([loadUsers(), loadEvents()]);
        const uidsWithEvent = new Set(events.map((e) => e.uid));
        const cohortStart = Date.now() - 8 * 86400000, cohortEnd = Date.now() - 2 * 86400000;
        const cohort = users.filter((u) => ts(u.createdAt) >= cohortStart && ts(u.createdAt) <= cohortEnd);
        const retained = cohort.filter((u) => events.some((e) => e.uid === u.uid && ts(e.createdAt) - ts(u.createdAt) <= 86400000 && ts(e.createdAt) >= ts(u.createdAt)));
        const rate = cohort.length ? Math.round((retained.length / cohort.length) * 100) : 0;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">Day-1 Retention (عيّنة ${cohort.length} حساب)</div><div class="admin-stat-card__value">${rate}%</div></div>`;
        openModal({ title: 'معدل الاحتفاظ اليومي', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'معدل الاحتفاظ الأسبوعي والشهري',
      keywords: 'معدل احتفاظ اسبوعي شهري',
      run: async () => {
        const [users, events] = await Promise.all([loadUsers(), loadEvents()]);
        function retention(daysAgoStart, daysAgoEnd, windowMs) {
          const cohort = users.filter((u) => ts(u.createdAt) >= Date.now() - daysAgoStart * 86400000 && ts(u.createdAt) <= Date.now() - daysAgoEnd * 86400000);
          const retained = cohort.filter((u) => events.some((e) => e.uid === u.uid && ts(e.createdAt) - ts(u.createdAt) <= windowMs));
          return cohort.length ? Math.round((retained.length / cohort.length) * 100) : 0;
        }
        const week = retention(21, 7, 7 * 86400000);
        const month = retention(60, 30, 30 * 86400000);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-row"><div class="admin-stat-card"><div class="admin-stat-card__label">Week-1 Retention</div><div class="admin-stat-card__value">${week}%</div></div><div class="admin-stat-card"><div class="admin-stat-card__label">Month-1 Retention</div><div class="admin-stat-card__value">${month}%</div></div></div>`;
        openModal({ title: 'الاحتفاظ الأسبوعي/الشهري', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'قمع التحويل (من التسجيل إلى أول لعبة)',
      keywords: 'قمع تحويل تسجيل اول لعبة',
      run: async () => {
        const [users, events] = await Promise.all([loadUsers(), loadEvents()]);
        const played = new Set(events.map((e) => e.uid));
        const playedCount = users.filter((u) => played.has(u.uid)).length;
        const body = document.createElement('div');
        body.innerHTML = `<p>التسجيلات: ${fmtNum(users.length)}</p><p>لعبوا لعبة واحدة على الأقل: ${fmtNum(playedCount)} (${users.length ? Math.round((playedCount / users.length) * 100) : 0}%)</p><p class="admin-field__hint">مرحلة "الزيارة قبل التسجيل" غير متتبَّعة حالياً.</p>`;
        openModal({ title: 'قمع التحويل', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'عدد المستخدمين الجدد اليوم/الأسبوع/الشهر',
      keywords: 'عدد مستخدمين جدد يوم اسبوع شهر',
      run: async () => {
        const users = await loadUsers();
        const now = Date.now();
        const c = (days) => users.filter((u) => ts(u.createdAt) >= now - days * 86400000).length;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-row">
          <div class="admin-stat-card"><div class="admin-stat-card__label">اليوم</div><div class="admin-stat-card__value">${fmtNum(c(1))}</div></div>
          <div class="admin-stat-card"><div class="admin-stat-card__label">الأسبوع</div><div class="admin-stat-card__value">${fmtNum(c(7))}</div></div>
          <div class="admin-stat-card"><div class="admin-stat-card__label">الشهر</div><div class="admin-stat-card__value">${fmtNum(c(30))}</div></div>
        </div>`;
        openModal({ title: 'مستخدمون جدد', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'معدل تسرّب المستخدمين (Churn Rate)',
      keywords: 'معدل تسرب churn',
      run: async () => {
        const [users, events] = await Promise.all([loadUsers(), loadEvents(15000)]);
        const wasActive = new Set(events.filter((e) => ts(e.createdAt) >= Date.now() - 60 * 86400000 && ts(e.createdAt) < Date.now() - 30 * 86400000).map((e) => e.uid));
        const stillActive = new Set(events.filter((e) => ts(e.createdAt) >= Date.now() - 30 * 86400000).map((e) => e.uid));
        const churned = [...wasActive].filter((uid) => !stillActive.has(uid));
        const rate = wasActive.size ? Math.round((churned.length / wasActive.size) * 100) : 0;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card admin-stat-card--danger"><div class="admin-stat-card__label">معدل التسرّب (كانوا نشطين قبل 30-60 يوم وما رجعوا)</div><div class="admin-stat-card__value">${rate}%</div></div>`;
        openModal({ title: 'معدل التسرّب', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'مقارنة نمو المستخدمين بين شهرين',
      keywords: 'مقارنة نمو مستخدمين شهرين',
      run: async () => {
        const users = await loadUsers();
        const thisMonth = users.filter((u) => ts(u.createdAt) >= Date.now() - 30 * 86400000).length;
        const lastMonth = users.filter((u) => ts(u.createdAt) >= Date.now() - 60 * 86400000 && ts(u.createdAt) < Date.now() - 30 * 86400000).length;
        const diff = lastMonth ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
        const body = document.createElement('div');
        body.innerHTML = renderBarChart({ labels: ['الشهر الماضي', 'هذا الشهر'], values: [lastMonth, thisMonth], height: 180 }) + `<p style="margin-top:8px;">التغيّر: ${diff > 0 ? '+' : ''}${diff}%</p>`;
        openModal({ title: 'نمو شهرين', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تحديد المستخدمين "في خطر" (نشاط متراجع)',
      keywords: 'مستخدمين خطر نشاط متراجع',
      run: async () => {
        const events = await loadEvents(15000);
        const lastPlay = new Map();
        events.forEach((e) => { if (!e.uid) return; const t = ts(e.createdAt); if (!lastPlay.has(e.uid) || t > lastPlay.get(e.uid)) lastPlay.set(e.uid, t); });
        const atRisk = [...lastPlay.entries()].filter(([, t]) => t < Date.now() - 14 * 86400000 && t > Date.now() - 60 * 86400000);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">لاعبون كانوا نشطين وتراجعوا (14-60 يوم بدون لعب)</div><div class="admin-stat-card__value">${fmtNum(atRisk.length)}</div></div>`;
        openModal({ title: 'مستخدمون في خطر', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تقرير أداء كل حملة تسويقية',
      keywords: 'تقرير حملة تسويقية اداء',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه نظام حملات/روابط تتبع مربوط حالياً.</p>'; openModal({ title: 'الحملات التسويقية', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تحليل أكثر أوقات اليوم/الأسبوع نشاطاً',
      keywords: 'اوقات نشاط يوم اسبوع',
      run: async () => {
        const events = await loadEvents();
        const byHour = new Array(24).fill(0);
        events.forEach((e) => { const d = e.createdAt && e.createdAt.toDate ? e.createdAt.toDate() : null; if (d) byHour[d.getHours()]++; });
        const body = document.createElement('div');
        body.innerHTML = renderBarChart({ labels: byHour.map((_, i) => i + '') , values: byHour, height: 200 });
        openModal({ title: 'النشاط حسب ساعة اليوم', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'متوسط عدد الألعاب لكل مستخدم جديد في أول أسبوع',
      keywords: 'متوسط العاب مستخدم جديد اول اسبوع',
      run: async () => {
        const [users, events] = await Promise.all([loadUsers(), loadEvents()]);
        const recentUsers = users.filter((u) => ts(u.createdAt) >= Date.now() - 60 * 86400000 && ts(u.createdAt) <= Date.now() - 7 * 86400000);
        const counts = recentUsers.map((u) => events.filter((e) => e.uid === u.uid && ts(e.createdAt) - ts(u.createdAt) <= 7 * 86400000).length);
        const avg = counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1) : 0;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">متوسط الألعاب بأول أسبوع (عيّنة ${counts.length})</div><div class="admin-stat-card__value">${avg}</div></div>`;
        openModal({ title: 'متوسط الألعاب بأول أسبوع', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تحديد "أبطال المنصة" (Power Users) الأكثر تفاعلاً',
      keywords: 'ابطال منصة power users',
      run: async () => {
        const events = await loadEvents();
        const counts = new Map();
        events.forEach((e) => { if (e.username) counts.set(e.username, (counts.get(e.username) || 0) + 1); });
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        const body = document.createElement('div');
        body.innerHTML = top.length ? `<table class="admin-table"><tbody>${top.map(([u, c]) => `<tr><td class="is-primary" data-label="اليوزر">${u}</td><td data-label="النشاط">${c}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات</p>';
        openModal({ title: 'أبطال المنصة', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تنبؤ بسيط بنمو المستخدمين للشهر القادم',
      keywords: 'تنبؤ نمو مستخدمين شهر قادم',
      run: async () => {
        const users = await loadUsers();
        const last30 = users.filter((u) => ts(u.createdAt) >= Date.now() - 30 * 86400000).length;
        const prev30 = users.filter((u) => ts(u.createdAt) >= Date.now() - 60 * 86400000 && ts(u.createdAt) < Date.now() - 30 * 86400000).length;
        const growthRate = prev30 ? (last30 - prev30) / prev30 : 0;
        const forecast = Math.round(last30 * (1 + growthRate));
        const body = document.createElement('div');
        body.innerHTML = `<p>تسجيلات آخر 30 يوم: ${last30}</p><p>توقّع الشهر القادم (بافتراض استمرار نفس معدل النمو): <strong>${fmtNum(forecast)}</strong></p><p class="admin-field__hint">تنبؤ خطي بسيط بناءً على الاتجاه الحالي فقط.</p>`;
        openModal({ title: 'تنبؤ النمو', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'مقارنة أداء المستخدمين القادمين من كل منصة بث',
      keywords: 'مقارنة اداء منصة بث',
      run: async () => {
        const events = await loadEvents();
        const firstPlatformByUid = new Map();
        [...events].reverse().forEach((e) => { if (e.uid && e.platform && !firstPlatformByUid.has(e.uid)) firstPlatformByUid.set(e.uid, e.platform); });
        const counts = new Map();
        firstPlatformByUid.forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
        const body = document.createElement('div');
        body.innerHTML = counts.size ? renderBarChart({ labels: [...counts.keys()], values: [...counts.values()], height: 200 }) + '<p class="admin-field__hint">تقدير بناءً على أول منصة لعب منها المستخدم — التسجيل نفسه لا يرتبط بمنصة محدَّدة.</p>' : '<p>ولا بيانات</p>';
        openModal({ title: 'أداء المستخدمين حسب أول منصة لعب', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير تقرير نمو شامل قابل للمشاركة',
      keywords: 'تصدير تقرير نمو شامل',
      run: async () => {
        const users = await loadUsers();
        printReport('تقرير النمو الشامل', `<p>إجمالي المستخدمين: ${users.length}</p><p>جدد آخر 30 يوم: ${users.filter((u) => ts(u.createdAt) >= Date.now() - 30 * 86400000).length}</p>`);
      }
    }
  ]
});
