// ==================== القسم 6 — إحصائيات الألعاب ====================
// كل الأرقام هنا من playEvents الحقيقي: type يكون streamer_launch (بث) أو
// party_play (جمعات) أو solo_play (فردي/أونلاين) — هذي الأنواع الثلاثة فقط
// موجودة فعلياً بالكود، فنعرضها كما هي بدل تصنيف مفترض.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;
const TYPE_LABELS = { streamer_launch: 'جلسة بث', party_play: 'جمعات', solo_play: 'فردي/أونلاين' };

async function loadEvents(limitN) {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(limitN || 5000)));
  return snap.docs.map((d) => d.data());
}
function ts(e) { return e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : 0; }
function topBy(events, sinceMs, key) {
  const counts = new Map();
  events.forEach((e) => { if (ts(e) >= sinceMs && e[key]) counts.set(e[key], (counts.get(e[key]) || 0) + 1); });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

defineSection({
  id: 6,
  title: 'إحصائيات الألعاب',
  description: 'إحصائيات حقيقية من playEvents لكل الألعاب — 41 لعبة موزّعة على 3 أنواع أحداث فعلية.',
  tools: [
    {
      title: 'جدول شامل بكل الألعاب وعدد مرات اللعب لكل واحدة',
      keywords: 'جدول شامل العاب عدد مرات',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'جدول الألعاب الشامل', bodyEl: body, size: 'xl' });
        const events = await loadEvents(10000);
        const top = topBy(events, 0, 'gameName');
        body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>عدد مرات اللعب</th></tr></thead><tbody>${top.map(([g, c]) => `<tr><td class="is-primary" data-label="اللعبة">${g}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات بعد</p>';
      }
    },
    {
      title: 'متوسط مدة الجولة لكل لعبة',
      keywords: 'متوسط مدة جولة',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>playEvents يسجّل لحظة بدء اللعبة فقط بدون وقت انتهاء — يحتاج تسجيل حدث "نهاية جولة" إضافي بالموقع الرئيسي لحساب هذا فعلياً.</p>'; openModal({ title: 'متوسط مدة الجولة', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'معدل إكمال اللعبة مقابل الخروج المبكر',
      keywords: 'معدل اكمال خروج مبكر',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج تسجيل حدث "إكمال/خروج مبكر" منفصل بالموقع الرئيسي — غير موجود حالياً.</p>'; openModal({ title: 'معدل الإكمال', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'اللعبة الأكثر شعبية بالساعة الحالية',
      keywords: 'اكثر شعبية ساعة حالية',
      run: async () => {
        const events = await loadEvents(3000);
        const top = topBy(events, Date.now() - 3600000, 'gameName');
        const body = document.createElement('div');
        body.innerHTML = top.length ? `<p><strong>${top[0][0]}</strong> — ${top[0][1]} مرة بآخر ساعة</p>` : '<p>ولا لعبة اتلعبت بآخر ساعة</p>';
        openModal({ title: 'الأكثر شعبية الآن', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'اللعبة الأكثر شعبية اليوم/الأسبوع/الشهر',
      keywords: 'اكثر شعبية يوم اسبوع شهر',
      run: async () => {
        const events = await loadEvents(10000);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الفترة</span><select class="admin-input" id="pp-period"><option value="1">اليوم</option><option value="7">الأسبوع</option><option value="30">الشهر</option></select></div><div id="pp-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'الأكثر شعبية بالفترة', bodyEl: body, size: 'sm' });
        function draw() {
          const days = Number(body.querySelector('#pp-period').value);
          const top = topBy(events, Date.now() - days * 86400000, 'gameName').slice(0, 5);
          body.querySelector('#pp-result').innerHTML = top.length ? `<ol>${top.map(([g, c]) => `<li>${g} — ${c}</li>`).join('')}</ol>` : '<p>ولا بيانات</p>';
        }
        body.querySelector('#pp-period').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'مقارنة أداء بين فئات الألعاب',
      keywords: 'مقارنة فئات ستريمر اونلاين جمعات فردي',
      run: async () => {
        const events = await loadEvents(10000);
        const counts = new Map();
        events.forEach((e) => counts.set(e.type, (counts.get(e.type) || 0) + 1));
        const body = document.createElement('div');
        const labels = [...counts.keys()].map((k) => TYPE_LABELS[k] || k);
        const values = [...counts.values()];
        body.innerHTML = values.length ? renderBarChart({ labels, values, height: 200 }) : '<p>ولا بيانات</p>';
        openModal({ title: 'مقارنة الفئات (حسب نوع الحدث الفعلي المسجَّل)', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'متوسط عدد المشاركين لكل جولة لكل لعبة',
      keywords: 'متوسط مشاركين جولة',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج تسجيل عدد المشاركين ضمن كل playEvent — غير مسجَّل حالياً لمعظم الألعاب.</p>'; openModal({ title: 'متوسط المشاركين', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'معدل الأخطاء التقنية المسجَّلة لكل لعبة',
      keywords: 'معدل اخطاء تقنية لعبة',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(1000)));
        const rows = snap.docs.map((d) => d.data());
        const byUrl = new Map();
        rows.forEach((r) => { const key = (r.url || '').split('#')[0] || 'غير محدد'; byUrl.set(key, (byUrl.get(key) || 0) + 1); });
        const top = [...byUrl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
        const body = document.createElement('div');
        body.innerHTML = top.length ? `<table class="admin-table"><tbody>${top.map(([u, c]) => `<tr><td data-label="الصفحة">${u}</td><td data-label="عدد الأخطاء">${c}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مسجَّل بعد</p>';
        openModal({ title: 'أخطاء تقنية حسب الصفحة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تقييم رضا تقديري بناءً على معدل إعادة اللعب',
      keywords: 'تقييم رضا اعادة لعب',
      run: async () => {
        const events = await loadEvents(10000);
        const byGameUser = new Map();
        events.forEach((e) => { if (!e.gameName || !e.uid) return; const k = e.gameName + '|' + e.uid; byGameUser.set(k, (byGameUser.get(k) || 0) + 1); });
        const perGame = new Map();
        byGameUser.forEach((count, key) => { const game = key.split('|')[0]; if (!perGame.has(game)) perGame.set(game, { repeats: 0, total: 0 }); const v = perGame.get(game); v.total++; if (count > 1) v.repeats++; });
        const rows = [...perGame.entries()].map(([g, v]) => ({ game: g, rate: v.total ? Math.round((v.repeats / v.total) * 100) : 0 })).sort((a, b) => b.rate - a.rate);
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>معدل إعادة اللعب التقديري</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اللعبة">${r.game}</td><td data-label="المعدل">${r.rate}%</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات كافية</p>';
        openModal({ title: 'تقييم رضا تقديري (معدل إعادة اللعب)', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'رسم بياني لاتجاه شعبية لعبة معيّنة عبر الزمن',
      keywords: 'اتجاه شعبية لعبة رسم بياني',
      run: async () => {
        const events = await loadEvents(10000);
        const games = [...new Set(events.map((e) => e.gameName).filter(Boolean))];
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اللعبة</span><select class="admin-input" id="trend-game">${games.map((g) => `<option>${g}</option>`).join('')}</select></div><div id="trend-chart" style="margin-top:10px;"></div>`;
        openModal({ title: 'اتجاه الشعبية (آخر 14 يوم)', bodyEl: body, size: 'xl' });
        function draw() {
          const game = body.querySelector('#trend-game').value;
          const days = 14;
          const buckets = new Array(days).fill(0);
          const start = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (days - 1) * 86400000;
          events.filter((e) => e.gameName === game).forEach((e) => { const idx = Math.floor((ts(e) - start) / 86400000); if (idx >= 0 && idx < days) buckets[idx]++; });
          const labels = buckets.map((_, i) => new Date(start + i * 86400000).toLocaleDateString('ar', { day: 'numeric', month: 'numeric' }));
          body.querySelector('#trend-chart').innerHTML = renderBarChart({ labels, values: buckets, height: 200 });
        }
        body.querySelector('#trend-game').addEventListener('change', draw);
        if (games.length) draw();
      }
    },
    {
      title: 'تحديد لعبة "في الترند" تلقائياً حسب النمو المفاجئ',
      keywords: 'لعبة ترند نمو مفاجئ',
      run: async () => {
        const events = await loadEvents(10000);
        const today = topBy(events, Date.now() - 86400000, 'gameName');
        const prevWeek = topBy(events, Date.now() - 8 * 86400000, 'gameName').filter((r) => !today.find((t) => t[0] === r[0]) || true);
        const prevMap = new Map(topBy(events, Date.now() - 8 * 86400000, 'gameName'));
        const trending = today.map(([g, c]) => ({ g, c, prevAvg: (prevMap.get(g) || 0) / 7 })).filter((r) => r.prevAvg > 0 ? r.c > r.prevAvg * 2 : r.c >= 5).sort((a, b) => b.c - a.c);
        const body = document.createElement('div');
        body.innerHTML = trending.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>اليوم</th><th>متوسط سابق/يوم</th></tr></thead><tbody>${trending.map((r) => `<tr><td class="is-primary" data-label="اللعبة">${r.g}</td><td data-label="اليوم">${r.c}</td><td data-label="متوسط سابق">${r.prevAvg.toFixed(1)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا لعبة بترند واضح حالياً</p>';
        openModal({ title: 'ألعاب في الترند الآن', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تعطيل لعبة مؤقتاً من الموقع كاملاً (صيانة)',
      keywords: 'تعطيل لعبة صيانة',
      run: async () => {
        const events = await loadEvents(3000);
        const tags = [...new Map(events.map((e) => [e.gameTag, e.gameName])).entries()].filter(([t]) => t);
        const flagSnap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'));
        const toggles = flagSnap.exists() ? flagSnap.data() : {};
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اللعبة</span><select class="admin-input" id="gt-select">${tags.map(([t, n]) => `<option value="${t}">${n} (${toggles[t] === false ? 'معطَّلة' : 'مفعّلة'})</option>`).join('')}</select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="gt-go" style="margin-top:8px;">تبديل الحالة</button>
        <p class="admin-field__hint">التعطيل مُفعَّل فعلياً (يمنع بدء اللعبة) لثمانِ ألعاب مؤكَّدة حالياً: شد الحبل، الضوء الأخضر/الأحمر، دائرة الإقصاء، الكرسي المتحرك، الأراضي البركانية، الطريق الزجاجي، حرب الدول، توب 10. باقي الألعاب: المفتاح يُسجَّل لكن يحتاج ربط شاشة إعداد كل لعبة لاحقاً.</p>`;
        const modal = openModal({ title: 'تعطيل/تفعيل لعبة', bodyEl: body, size: 'md' });
        body.querySelector('#gt-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const tag = body.querySelector('#gt-select').value;
          const newVal = toggles[tag] === false;
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'gameToggles'), { [tag]: newVal }, { merge: true });
          await AdminAudit.log({ section: 6, sectionTitle: 'إحصائيات الألعاب', actionKey: 'games.toggle', actionLabel: newVal ? 'تفعيل لعبة' : 'تعطيل لعبة', targetType: 'gameTag', targetId: tag, sensitive: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'تفعيل/تعطيل لعبة لفئة مستخدمين معيّنة فقط (A/B)',
      keywords: 'تفعيل تعطيل فئة مستخدمين ab',
      meta: 'أداة اختبار A/B الكاملة بقسم 27',
      run: () => AdminToast.info('اختبار A/B الكامل (استهداف نسبة/فئة من المستخدمين) موجود بقسم 27')
    },
    {
      title: 'عرض آخر 20 جولة لعبت من لعبة معيّنة بتفاصيلها',
      keywords: 'اخر 20 جولة لعبة تفاصيل',
      run: async () => {
        const events = await loadEvents(10000);
        const games = [...new Set(events.map((e) => e.gameName).filter(Boolean))];
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اللعبة</span><select class="admin-input" id="last20-game">${games.map((g) => `<option>${g}</option>`).join('')}</select></div><div id="last20-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'آخر 20 جولة', bodyEl: body, size: 'lg' });
        function draw() {
          const game = body.querySelector('#last20-game').value;
          const rows = events.filter((e) => e.gameName === game).slice(0, 20);
          body.querySelector('#last20-result').innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>اللاعب/الستريمر</th><th>النوع</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.createdAt)}</td><td data-label="اللاعب">${r.username || '—'}</td><td data-label="النوع">${TYPE_LABELS[r.type] || r.type}</td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل</p>';
        }
        body.querySelector('#last20-game').addEventListener('change', draw);
        if (games.length) draw();
      }
    },
    {
      title: 'تصدير تقرير أداء كل الألعاب كملف',
      keywords: 'تصدير تقرير اداء العاب',
      run: async () => {
        const events = await loadEvents(10000);
        const top = topBy(events, 0, 'gameName');
        csvDownload('games-performance.csv', [['اللعبة', 'عدد مرات اللعب'], ...top]);
        AdminToast.success('تم التصدير');
      }
    }
  ]
});
