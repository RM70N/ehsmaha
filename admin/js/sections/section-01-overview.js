// ==================== القسم 1 — نظرة عامة (Dashboard) ====================
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, tsToMillis, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;
const BRIDGE_HTTP_ORIGIN = 'https://ehsmaha.onrender.com';

function liveCountModal(title, collectionName, renderRow) {
  const body = document.createElement('div');
  body.innerHTML = '<p class="admin-kv">جارٍ التحميل...</p>';
  let unsub = () => {};
  openModal({ title, bodyEl: body, size: 'lg', onClose: () => unsub() });
  unsub = fb.onSnapshot(fb.collection(fb.db, collectionName), (snap) => {
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    body.innerHTML = `
      <div class="admin-stat-card" style="margin-bottom:14px;">
        <div class="admin-stat-card__label">العدد الحي الآن</div>
        <div class="admin-stat-card__value">${fmtNum(rows.length)}</div>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr>${renderRow.headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>
            ${rows.slice(0, 300).map((r) => `<tr>${renderRow.cells(r).map((c, i) => `<td data-label="${renderRow.headers[i]}">${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${renderRow.headers.length}">لا يوجد شي حالياً</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }, () => { body.innerHTML = '<p>تعذّر تحميل البيانات</p>'; });
}

async function computeTop(collectionName, sinceMs, typeFilter, groupField) {
  let qy = fb.query(fb.collection(fb.db, collectionName), fb.where('createdAt', '>=', new Date(sinceMs)));
  const snap = await fb.getDocs(qy);
  const counts = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (typeFilter && data.type !== typeFilter) return;
    const key = data[groupField];
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

defineSection({
  id: 1,
  title: 'نظرة عامة',
  description: 'ملخص حي لكل ما يحصل على منصة احسمها الآن — كل رقم هنا مقروء مباشرة من Firestore.',
  tools: [
    {
      title: 'عدد المستخدمين المتصلين الآن لحظياً',
      keywords: 'اونلاين متصل presence',
      run: () => liveCountModal('المستخدمون المتصلون الآن', 'presence', {
        headers: ['اليوزر', 'آخر ظهور'],
        cells: (r) => [r.username || '—', fmtDate(r.lastSeen)]
      })
    },
    {
      title: 'عدد جلسات البث النشطة حالياً',
      keywords: 'ستريمر بث نشط',
      run: () => liveCountModal('جلسات البث النشطة الآن', 'activeStreamers', {
        headers: ['اللعبة', 'الستريمر', 'المنصة', 'آخر تحديث'],
        cells: (r) => [r.gameName || r.gameTag || '—', r.username || '—', r.platform || '—', fmtDate(r.updatedAt)]
      })
    },
    {
      title: 'عدد الألعاب الجارية الآن مع اسم كل لعبة',
      keywords: 'العاب جارية الان',
      run: () => liveCountModal('الألعاب الجارية الآن', 'activeStreamers', {
        headers: ['اسم اللعبة', 'الوسم', 'الستريمر'],
        cells: (r) => [r.gameName || '—', r.gameTag || '—', r.username || '—']
      })
    },
    {
      title: 'آخر 10 أحداث حرجة',
      keywords: 'احداث تنبيهات سجل',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        const modal = openModal({ title: 'آخر 10 أحداث حرجة', bodyEl: body, size: 'lg' });
        try {
          const [auditRows, feedbackSnap, usersSnap] = await Promise.all([
            AdminAudit.loadRecentSensitive ? AdminAudit.loadRecentSensitive() : Promise.resolve([]),
            fb.getDocs(fb.query(fb.collection(fb.db, 'feedback'), fb.orderBy('createdAt', 'desc'), fb.limit(10))),
            fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.orderBy('createdAt', 'desc'), fb.limit(10)))
          ]);
          const events = [...auditRows];
          feedbackSnap.docs.forEach((d) => {
            const v = d.data();
            events.push({ ts: tsToMillis(v.createdAt), label: `${v.type === 'problem' ? 'مشكلة مُبلَّغة' : 'اقتراح'} من ${v.username || 'مجهول'}`, detail: v.text });
          });
          usersSnap.docs.forEach((d) => {
            const v = d.data();
            events.push({ ts: tsToMillis(v.createdAt), label: `تسجيل حساب جديد: ${v.username || d.id}`, detail: '' });
          });
          events.sort((a, b) => b.ts - a.ts);
          const top10 = events.slice(0, 10);
          body.innerHTML = top10.length ? `
            <table class="admin-table"><thead><tr><th>الوقت</th><th>الحدث</th><th>تفاصيل</th></tr></thead>
            <tbody>${top10.map((e) => `<tr><td data-label="الوقت">${fmtDate(e.ts)}</td><td data-label="الحدث" class="is-primary">${e.label}</td><td data-label="تفاصيل">${(e.detail || '').slice(0, 80)}</td></tr>`).join('')}</tbody></table>
          ` : '<p>ولا حدث حالياً</p>';
        } catch (err) {
          body.textContent = 'تعذّر التحميل: ' + err.message;
        }
      }
    },
    {
      title: 'رسم بياني لنمو المستخدمين آخر 30 يوم',
      keywords: 'نمو مستخدمين تسجيلات رسم',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        const modal = openModal({ title: 'نمو المستخدمين — آخر 30 يوم', bodyEl: body, size: 'xl' });
        try {
          const since = Date.now() - 30 * 86400000;
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('createdAt', '>=', new Date(since))));
          const buckets = new Array(30).fill(0);
          const dayMs = 86400000;
          const startOfWindow = new Date(new Date(since).setHours(0, 0, 0, 0)).getTime();
          snap.docs.forEach((d) => {
            const t = tsToMillis(d.data().createdAt);
            const idx = Math.floor((t - startOfWindow) / dayMs);
            if (idx >= 0 && idx < 30) buckets[idx]++;
          });
          const labels = buckets.map((_, i) => new Date(startOfWindow + i * dayMs).toLocaleDateString('ar', { day: 'numeric', month: 'numeric' }));
          body.innerHTML = `<p class="admin-field__hint">إجمالي تسجيلات جديدة بالفترة: ${fmtNum(snap.size)}</p>${renderBarChart({ labels, values: buckets, height: 220 })}`;
        } catch (err) {
          body.textContent = 'تعذّر التحميل: ' + err.message;
        }
      }
    },
    {
      title: 'أكثر 5 ألعاب لعباً اليوم',
      keywords: 'اكثر العاب اليوم شعبية',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر 5 ألعاب لعباً اليوم', bodyEl: body, size: 'md' });
        try {
          const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).getTime();
          const top = await computeTop('playEvents', dayStart, null, 'gameName');
          body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>عدد مرات اللعب</th></tr></thead><tbody>${top.map(([g, c]) => `<tr><td class="is-primary" data-label="اللعبة">${g}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا لعبة اتلعبت اليوم لين الحين</p>';
        } catch (err) { body.textContent = 'تعذّر التحميل: ' + err.message; }
      }
    },
    {
      title: 'أكثر 5 ستريمرز نشاطاً هذا الأسبوع',
      keywords: 'ستريمرز نشاط اسبوع',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر 5 ستريمرز نشاطاً هذا الأسبوع', bodyEl: body, size: 'md' });
        try {
          const weekStart = Date.now() - 7 * 86400000;
          const top = await computeTop('playEvents', weekStart, 'streamer_launch', 'username');
          body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>الستريمر</th><th>عدد جلسات البث</th></tr></thead><tbody>${top.map(([u, c]) => `<tr><td class="is-primary" data-label="الستريمر">${u}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا ستريمر بث هالأسبوع لين الحين</p>';
        } catch (err) { body.textContent = 'تعذّر التحميل: ' + err.message; }
      }
    },
    {
      title: 'حالة الاتصال بكل منصة بث',
      keywords: 'تيك توك تويتش كيك يوتيوب اتصال',
      run: async () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>جارٍ فحص الاتصال المباشر بكل منصة...</p>';
        openModal({ title: 'حالة الاتصال بمنصات البث', bodyEl: body, size: 'md' });
        const rows = [];
        try {
          const res = await fetch(BRIDGE_HTTP_ORIGIN + '/healthz', { cache: 'no-store' });
          rows.push({ name: 'تيك توك (عبر سيرفر الجسر)', ok: res.ok });
          rows.push({ name: 'كيك (عبر سيرفر الجسر)', ok: res.ok });
          rows.push({ name: 'يوتيوب (عبر سيرفر الجسر)', ok: res.ok });
        } catch (err) {
          rows.push({ name: 'تيك توك (عبر سيرفر الجسر)', ok: false });
          rows.push({ name: 'كيك (عبر سيرفر الجسر)', ok: false });
          rows.push({ name: 'يوتيوب (عبر سيرفر الجسر)', ok: false });
        }
        // تويتش يتصل مباشرة من متصفح المستخدم (IRC WebSocket) بدون سيرفر جسر —
        // نفحصه بفتح اتصال حقيقي فوري بنفس نقطة الاتصال المستخدمة باللعبة.
        const twitchOk = await new Promise((resolve) => {
          try {
            const sock = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
            const timer = setTimeout(() => { try { sock.close(); } catch (e) {} resolve(false); }, 4000);
            sock.onopen = () => { clearTimeout(timer); try { sock.close(); } catch (e) {} resolve(true); };
            sock.onerror = () => { clearTimeout(timer); resolve(false); };
          } catch (err) { resolve(false); }
        });
        rows.push({ name: 'تويتش (اتصال مباشر)', ok: twitchOk });
        body.innerHTML = `<table class="admin-table"><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="المنصة">${r.name}</td><td data-label="الحالة"><span class="admin-badge ${r.ok ? 'admin-badge--on' : 'admin-badge--off'}">${r.ok ? 'متصل' : 'منقطع'}</span></td></tr>`).join('')}</table>`;
      }
    },
    {
      title: 'عدد التذاكر المفتوحة في الدعم الفني',
      keywords: 'تذاكر دعم فني',
      meta: 'من نظام الملاحظات الحالي — قسم 9 يبني نظام تذاكر كامل بمرحلة قادمة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'التذاكر / الملاحظات المفتوحة', bodyEl: body, size: 'sm' });
        try {
          const snap = await fb.getDocs(fb.collection(fb.db, 'feedback'));
          body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">إجمالي ملاحظات المستخدمين (مشاكل + اقتراحات)</div><div class="admin-stat-card__value">${fmtNum(snap.size)}</div><div class="admin-stat-card__sub">إدارة كل تذكرة على حدة (رد/إغلاق/أرشفة) متوفرة بقسم 9 لاحقاً</div></div>`;
        } catch (err) { body.textContent = 'تعذّر التحميل: ' + err.message; }
      }
    },
    {
      title: 'عدد البلاغات غير المراجَعة',
      keywords: 'بلاغات مراجعة',
      badge: 'بانتظار قسم 12',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>ما فيه نظام بلاغات لاعبين مفعّل بالموقع الرئيسي حالياً — راح يُبنى ضمن قسم 12 (مراقبة المحتوى) بمرحلة قادمة، وبمجرد تفعيله بيظهر هنا رقم حقيقي بدل هذي الرسالة.</p>';
        openModal({ title: 'البلاغات غير المراجَعة', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'متوسط مدة الجلسة للمستخدم اليوم',
      keywords: 'متوسط مدة جلسة',
      badge: 'بيانات غير متوفرة بعد',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>الموقع الرئيسي حالياً يسجّل "آخر ظهور" بس (presence.lastSeen) بدون وقت بداية/نهاية الجلسة، فمتوسط المدة الحقيقي مو محسوب. يحتاج إضافة تسجيل بداية/نهاية جلسة بالموقع الرئيسي أول — أخبرني إذا تبيني أضيفها بمرحلة قادمة.</p>';
        openModal({ title: 'متوسط مدة الجلسة اليوم', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تنبيه فوري لو تجاوز معدل الأخطاء حد معين',
      keywords: 'اخطاء تنبيه معدل',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'معدل الأخطاء بالساعة الأخيرة', bodyEl: body, size: 'sm' });
        try {
          const since = Date.now() - 3600000;
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.where('ts', '>=', since)));
          const threshold = 20;
          const over = snap.size > threshold;
          body.innerHTML = `
            <div class="admin-stat-card ${over ? 'admin-stat-card--danger' : 'admin-stat-card--good'}">
              <div class="admin-stat-card__label">أخطاء العميل بآخر ساعة (الحد: ${threshold})</div>
              <div class="admin-stat-card__value">${fmtNum(snap.size)}</div>
              <div class="admin-stat-card__sub">${over ? 'تجاوز الحد المسموح — راجع سجل الأخطاء' : 'ضمن المعدل الطبيعي'}</div>
            </div>`;
        } catch (err) { body.textContent = 'تعذّر التحميل: ' + err.message; }
      }
    },
    {
      title: 'إيقاف طارئ لكل الجلسات النشطة',
      keywords: 'ايقاف طارئ emergency stop',
      run: () => {
        openConfirm({
          title: 'إيقاف طارئ — كل الجلسات النشطة',
          message: 'هذا الإجراء بينهي كل غرف اللعب النشطة (rooms) ويصفّر كل جلسات البث النشطة (activeStreamers) فوراً لكل اللاعبين على المنصة. لا يمكن التراجع عنه.',
          danger: true,
          doubleConfirm: true,
          confirmText: 'إيقاف كل شي الآن',
          onConfirm: async () => {
            const [roomsSnap, activeSnap] = await Promise.all([
              fb.getDocs(fb.collection(fb.db, 'rooms')),
              fb.getDocs(fb.collection(fb.db, 'activeStreamers'))
            ]);
            const batchOps = [];
            roomsSnap.docs.forEach((d) => batchOps.push(fb.deleteDoc(fb.doc(fb.db, 'rooms', d.id))));
            activeSnap.docs.forEach((d) => batchOps.push(fb.deleteDoc(fb.doc(fb.db, 'activeStreamers', d.id))));
            await Promise.all(batchOps);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'emergencyStop'), { active: true, ts: fb.serverTimestamp() }, { merge: true });
            await AdminAudit.log({
              section: 1, sectionTitle: 'نظرة عامة', actionKey: 'overview.emergencyStop',
              actionLabel: 'إيقاف طارئ لكل الجلسات النشطة', targetType: 'platform', targetId: 'all',
              after: { roomsClosed: roomsSnap.size, sessionsCleared: activeSnap.size }, sensitive: true
            });
            AdminToast.success(`تم إيقاف ${roomsSnap.size} غرفة و${activeSnap.size} جلسة بث`);
          }
        });
      }
    },
    {
      title: 'ملخص يومي/أسبوعي/شهري قابل للتصدير PDF',
      keywords: 'تقرير يومي اسبوعي شهري تصدير pdf',
      run: async () => {
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">الفترة</span>
            <select class="admin-input" id="summary-period">
              <option value="1">اليوم</option>
              <option value="7">آخر أسبوع</option>
              <option value="30">آخر شهر</option>
            </select>
          </div>
          <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary" id="summary-export">تصدير PDF</button></div>
        `;
        const modal = openModal({ title: 'ملخص قابل للتصدير', bodyEl: body, size: 'sm' });
        body.querySelector('#summary-export').addEventListener('click', async () => {
          const days = Number(body.querySelector('#summary-period').value);
          const since = Date.now() - days * 86400000;
          const [usersSnap, top, activeSnap] = await Promise.all([
            fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('createdAt', '>=', new Date(since)))),
            computeTop('playEvents', since, null, 'gameName'),
            fb.getDocs(fb.collection(fb.db, 'activeStreamers'))
          ]);
          printReport(`ملخص منصة احسمها — آخر ${days} يوم`, `
            <h2>مستخدمون جدد</h2><p>${fmtNum(usersSnap.size)}</p>
            <h2>جلسات بث نشطة الآن</h2><p>${fmtNum(activeSnap.size)}</p>
            <h2>أكثر الألعاب لعباً</h2>
            <table><thead><tr><th>اللعبة</th><th>عدد مرات اللعب</th></tr></thead>
            <tbody>${top.map(([g, c]) => `<tr><td>${g}</td><td>${c}</td></tr>`).join('') || '<tr><td colspan="2">لا يوجد</td></tr>'}</tbody></table>
          `);
          modal.close();
        });
      }
    },
    {
      title: 'اختصارات مخصّصة لآخر 6 أدوات استخدمتها',
      keywords: 'اختصارات سريعة',
      run: async () => {
        const body = document.createElement('div');
        const settingsSnap = await fb.getDoc(fb.doc(fb.db, 'adminSettings', 'panel'));
        const shortcuts = (settingsSnap.data() && settingsSnap.data().shortcuts) || [];
        body.innerHTML = shortcuts.length ? `
          <div class="admin-tool-grid">
            ${shortcuts.map((s) => `<div class="admin-tool-card" style="cursor:default"><span class="admin-tool-card__no">${s.sectionNo}</span><span class="admin-tool-card__title">${s.title}</span></div>`).join('')}
          </div>
        ` : '<p>ما فيه أدوات مستخدمة لين الحين — أول أداة تفتحها بتظهر هنا تلقائياً.</p>';
        openModal({ title: 'آخر 6 أدوات استخدمتها', bodyEl: body, size: 'md' });
      }
    }
  ]
});
