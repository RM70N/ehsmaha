// ==================== القسم 11 — الأمان والحماية ====================
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, tsToMillis, csvDownload, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;

async function getFlagDoc(id) {
  const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', id));
  return snap.exists() ? snap.data() : {};
}

function tableModal(title, rows, headers, cellsFn, emptyMsg) {
  const body = document.createElement('div');
  body.className = 'admin-table-wrap';
  body.innerHTML = rows.length ? `
    <table class="admin-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${cellsFn(r).map((c, i) => `<td data-label="${headers[i]}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>
  ` : `<p>${emptyMsg || 'لا يوجد شي حالياً'}</p>`;
  return openModal({ title, bodyEl: body, size: 'lg' });
}

defineSection({
  id: 11,
  title: 'الأمان والحماية',
  description: 'حماية دخول اللوحة والمنصة — محاولات الدخول، حظر IP، رصد الحسابات المتعددة، والتسجيل الجديد.',
  tools: [
    {
      title: 'سجل كل محاولات الدخول الفاشلة على اللوحة',
      keywords: 'محاولات دخول فاشلة',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'adminLoginAttempts'), fb.orderBy('ts', 'desc'), fb.limit(200)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => !r.success);
        tableModal('محاولات الدخول الفاشلة', rows, ['الوقت', 'الإيميل', 'السبب', 'IP', 'الدولة'],
          (r) => [fmtDate(r.ts), r.emailAttempted || '—', r.reason || '—', r.ip || '—', r.country || '—'],
          'ولا محاولة فاشلة مسجّلة، الحمدلله');
      }
    },
    {
      title: 'حظر عنوان IP معيّن فوراً',
      keywords: 'حظر IP',
      run: () => {
        openFormModal({
          title: 'حظر عنوان IP',
          fields: [
            { key: 'ip', label: 'عنوان IP', required: true, placeholder: '1.2.3.4' },
            { key: 'reason', label: 'السبب', type: 'textarea', required: true }
          ],
          submitText: 'حظر الآن',
          onSubmit: async (v) => {
            const ip = v.ip.trim();
            await fb.setDoc(fb.doc(fb.db, 'adminIpBans', ip), { reason: v.reason, ts: fb.serverTimestamp(), by: 'admin' });
            await AdminAudit.log({ section: 11, sectionTitle: 'الأمان والحماية', actionKey: 'security.banIp', actionLabel: 'حظر IP', targetType: 'ip', targetId: ip, after: { reason: v.reason }, sensitive: true });
            AdminToast.success('تم حظر العنوان');
          }
        });
      }
    },
    {
      title: 'قائمة عناوين IP المحظورة حالياً مع خيار فك الحظر',
      keywords: 'قائمة محظورين فك حظر',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'adminIpBans'));
        const body = document.createElement('div');
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        body.className = 'admin-table-wrap';
        function draw() {
          body.innerHTML = rows.length ? `
            <table class="admin-table"><thead><tr><th>IP</th><th>السبب</th><th>تاريخ الحظر</th><th></th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="IP">${r.id}</td><td data-label="السبب">${r.reason || '—'}</td><td data-label="التاريخ">${fmtDate(r.ts)}</td><td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-unban="${r.id}">فك الحظر</button></td></tr>`).join('')}</tbody></table>
          ` : '<p>ما فيه عناوين محظورة حالياً</p>';
          body.querySelectorAll('[data-unban]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const ip = btn.getAttribute('data-unban');
            await fb.deleteDoc(fb.doc(fb.db, 'adminIpBans', ip));
            await AdminAudit.log({ section: 11, sectionTitle: 'الأمان والحماية', actionKey: 'security.unbanIp', actionLabel: 'فك حظر IP', targetType: 'ip', targetId: ip, sensitive: true });
            rows.splice(rows.findIndex((r) => r.id === ip), 1);
            draw();
            AdminToast.success('تم فك الحظر');
          }));
        }
        draw();
        openModal({ title: 'عناوين IP المحظورة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'كشف الحسابات المتعددة من نفس الجهاز',
      keywords: 'حسابات متعددة multi accounting جهاز',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص (يقرأ كل سجلات الأجهزة)...';
        openModal({ title: 'حسابات متعددة على نفس الجهاز', bodyEl: body, size: 'lg' });
        try {
          const snap = await fb.getDocs(fb.collection(fb.db, 'deviceSessions'));
          const byDevice = new Map();
          snap.docs.forEach((d) => {
            const data = d.data();
            const deviceIds = new Set();
            if (data.current && data.current.deviceId) deviceIds.add(data.current.deviceId);
            (data.history || []).forEach((h) => h && h.deviceId && deviceIds.add(h.deviceId));
            deviceIds.forEach((devId) => {
              if (!byDevice.has(devId)) byDevice.set(devId, new Set());
              byDevice.get(devId).add(data.username || d.id);
            });
          });
          const suspicious = [...byDevice.entries()].filter(([, users]) => users.size > 1);
          body.innerHTML = suspicious.length ? `
            <table class="admin-table"><thead><tr><th>معرّف الجهاز</th><th>الحسابات المرتبطة</th></tr></thead>
            <tbody>${suspicious.map(([devId, users]) => `<tr><td data-label="الجهاز">${devId}</td><td data-label="الحسابات">${[...users].join('، ')}</td></tr>`).join('')}</tbody></table>
          ` : '<p>ما فيه أجهزة مشتركة بين أكثر من حساب حالياً</p>';
        } catch (err) { body.textContent = 'تعذّر الفحص: ' + err.message; }
      }
    },
    {
      title: 'تفعيل حد معدل الطلبات (Rate Limiting)',
      keywords: 'rate limiting معدل طلبات',
      run: async () => {
        const cur = await getFlagDoc('rateLimiting');
        openFormModal({
          title: 'حد معدل الطلبات على التسجيل',
          fields: [
            { key: 'enabled', label: 'مفعّل', type: 'checkbox', value: cur.enabled },
            { key: 'maxPerWindow', label: 'أقصى عدد تسجيلات', type: 'number', value: cur.maxPerWindow || 5, min: 1 },
            { key: 'windowMinutes', label: 'خلال كم دقيقة (لكل IP)', type: 'number', value: cur.windowMinutes || 10, min: 1 }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'rateLimiting'), v, { merge: true });
            await AdminAudit.log({ section: 11, sectionTitle: 'الأمان والحماية', actionKey: 'security.rateLimit', actionLabel: 'تعديل حد معدل الطلبات', targetType: 'siteFlag', targetId: 'rateLimiting', after: v });
            AdminToast.success('تم الحفظ — يُطبَّق على تسجيلات الحسابات الجديدة');
          }
        });
      }
    },
    {
      title: 'تنبيه فوري عند نشاط غير طبيعي (تسجيلات جماعية سريعة)',
      keywords: 'تسجيلات جماعية نشاط غير طبيعي',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الفحص...';
        openModal({ title: 'كشف نشاط تسجيل غير طبيعي', bodyEl: body, size: 'sm' });
        const since = Date.now() - 10 * 60000;
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('createdAt', '>=', new Date(since))));
        const threshold = 15;
        const over = snap.size > threshold;
        body.innerHTML = `<div class="admin-stat-card ${over ? 'admin-stat-card--danger' : 'admin-stat-card--good'}">
          <div class="admin-stat-card__label">تسجيلات جديدة بآخر 10 دقايق (حد التنبيه: ${threshold})</div>
          <div class="admin-stat-card__value">${fmtNum(snap.size)}</div>
          <div class="admin-stat-card__sub">${over ? 'نشاط غير طبيعي — راجع سجل التسجيلات وفعّل Rate Limiting لو يلزم' : 'ضمن المعدل الطبيعي'}</div>
        </div>`;
      }
    },
    {
      title: 'عرض خريطة جغرافية لمصادر تسجيل الدخول',
      keywords: 'خريطة جغرافية دول تسجيل دخول',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'مصادر تسجيل الدخول حسب الدولة (آخر 200 محاولة)', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'adminLoginAttempts'), fb.orderBy('ts', 'desc'), fb.limit(200)));
        const counts = new Map();
        snap.docs.forEach((d) => {
          const c = d.data().country || 'غير معروف';
          counts.set(c, (counts.get(c) || 0) + 1);
        });
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        body.innerHTML = sorted.length ? renderBarChart({ labels: sorted.map((s) => s[0]), values: sorted.map((s) => s[1]), height: 200 }) : '<p>لا يوجد بيانات كافية بعد</p>';
      }
    },
    {
      title: 'تفعيل/تعطيل التسجيل الجديد مؤقتاً',
      keywords: 'تعطيل تسجيل جديد',
      run: async () => {
        const cur = await getFlagDoc('registration');
        const enabled = cur.enabled !== false;
        openConfirm({
          title: enabled ? 'تعطيل التسجيل الجديد' : 'إعادة تفعيل التسجيل الجديد',
          message: enabled ? 'هذا يمنع أي حساب جديد من التسجيل بالموقع الرئيسي فوراً — الحسابات الحالية ما تتأثر.' : 'هذا يعيد السماح بتسجيل حسابات جديدة بالموقع الرئيسي.',
          confirmText: enabled ? 'عطّل التسجيل' : 'فعّل التسجيل',
          danger: enabled,
          onConfirm: async () => {
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'registration'), { enabled: !enabled }, { merge: true });
            await AdminAudit.log({ section: 11, sectionTitle: 'الأمان والحماية', actionKey: 'security.toggleRegistration', actionLabel: enabled ? 'تعطيل التسجيل الجديد' : 'تفعيل التسجيل الجديد', targetType: 'siteFlag', targetId: 'registration', sensitive: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'فحص قواعد Firebase Security Rules الحالية',
      keywords: 'firestore rules قواعد امان',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الجلب من الريبو...';
        openModal({ title: 'قواعد Firestore الحالية (من GitHub)', bodyEl: body, size: 'xl' });
        try {
          const res = await fetch('https://raw.githubusercontent.com/RM70N/ehsmaha/main/firestore.rules', { cache: 'no-store' });
          const text = await res.text();
          const pre = document.createElement('pre');
          pre.style.cssText = 'white-space:pre-wrap;font-size:12px;max-height:60vh;overflow:auto;color:var(--text-secondary)';
          pre.textContent = text;
          body.innerHTML = '';
          body.appendChild(pre);
        } catch (err) { body.textContent = 'تعذّر الجلب من GitHub: ' + err.message; }
      }
    },
    {
      title: 'سجل كل تغيير حصل على صلاحيات النظام',
      keywords: 'صلاحيات تغيير سجل',
      meta: 'يمتلئ تلقائياً بمجرد تفعيل قسم 26 (صلاحيات المشرفين)',
      run: async () => {
        const all = await AdminAudit.fetchAllForExport();
        const rows = all.filter((r) => r.section === 26 || /permission|role|moderator/i.test(r.actionKey || ''));
        tableModal('تغييرات الصلاحيات', rows, ['الوقت', 'الإجراء', 'الهدف', 'بواسطة'],
          (r) => [fmtDate(r.tsClient), r.actionLabel || r.actionKey, r.targetLabel || r.targetId || '—', r.actorEmail || '—'],
          'ولا تغيير صلاحيات مسجّل لين الحين');
      }
    },
    {
      title: 'كشف محاولات حقن أو استغلال بحقول الإدخال',
      keywords: 'حقن injection استغلال',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'adminSecurityAlerts'), fb.orderBy('ts', 'desc'), fb.limit(200)));
        const rows = snap.docs.map((d) => d.data());
        tableModal('محاولات حقن/استغلال مكتشفة', rows, ['الوقت', 'الحقل', 'المصدر', 'المحتوى المشبوه'],
          (r) => [fmtDate(r.ts), r.field || '—', r.username || r.uid || '—', (r.snippet || '').slice(0, 80)],
          'ولا محاولة مشبوهة مكتشفة');
      }
    },
    {
      title: 'قائمة سوداء لكلمات/أنماط أسماء مستخدمين محظورة',
      keywords: 'قائمة سوداء يوزرات محظورة',
      run: async () => {
        const cur = await getFlagDoc('usernameBlacklist');
        const patterns = cur.patterns || [];
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `
            <div class="admin-table-wrap">${patterns.length ? patterns.map((p) => `<span class="admin-badge admin-badge--pink" style="margin:3px;display:inline-block">${p}</span>`).join('') : '<p>القائمة فاضية حالياً</p>'}</div>
            <div class="admin-form" style="margin-top:14px;">
              <label class="admin-field"><span class="admin-field__label">أضف نمط/كلمة جديدة</span><input class="admin-input" id="bl-new" placeholder="مثال: admin" /></label>
              <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary" id="bl-add">إضافة</button></div>
            </div>
          `;
          body.querySelector('#bl-add').addEventListener('click', async () => {
            const val = body.querySelector('#bl-new').value.trim().toLowerCase();
            if (!val || patterns.includes(val)) return;
            patterns.push(val);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'usernameBlacklist'), { patterns }, { merge: true });
            await AdminAudit.log({ section: 11, sectionTitle: 'الأمان والحماية', actionKey: 'security.blacklistAdd', actionLabel: 'إضافة نمط للقائمة السوداء', targetType: 'username-pattern', targetId: val });
            draw();
          });
        }
        draw();
        openModal({ title: 'القائمة السوداء لأسماء المستخدمين', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تفعيل تنبيه بريدي فوري عند حدث أمني حرج',
      keywords: 'تنبيه بريد ايميل امني',
      badge: 'يحتاج ربط خارجي',
      run: () => {
        openFormModal({
          title: 'تنبيه بريدي عند حدث أمني حرج',
          fields: [
            { key: 'enabled', label: 'مفعّل', type: 'checkbox' },
            { key: 'targetEmail', label: 'الإيميل المستقبِل', type: 'email', placeholder: 'malshaifan1@gmail.com' },
            { key: 'serviceKey', label: 'مفتاح خدمة الإرسال (EmailJS/Resend)', placeholder: 'يُضاف لاحقاً', hint: 'بدون هذا المفتاح، التنبيه يُسجَّل بالسجل الأمني فقط ولا يُرسَل بريد فعلي.' }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'adminSettings', 'securityEmailAlert'), v, { merge: true });
            AdminToast.success('تم الحفظ' + (v.serviceKey ? '' : ' — بدون مفتاح خدمة، الإرسال الفعلي معطّل حالياً'));
          }
        });
      }
    },
    {
      title: 'عرض قائمة الجلسات النشطة للوحة الإدارة نفسها',
      keywords: 'جلسات نشطة اجهزة الادمن',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'adminOwnSessions'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = rows.length ? `
            <table class="admin-table"><thead><tr><th>الجهاز</th><th>آخر ظهور</th><th></th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td data-label="الجهاز">${(r.userAgent || '—').slice(0, 60)}</td><td data-label="آخر ظهور">${fmtDate(r.lastSeen)}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-kill="${r.id}">${r.id === localStorage.getItem('ehsmaha_admin_session_id') ? 'هذه الجلسة' : 'تسجيل خروج'}</button></td></tr>`).join('')}</tbody></table>
          ` : '<p>لا يوجد سجل جلسات بعد</p>';
          body.querySelectorAll('[data-kill]').forEach((btn) => btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-kill');
            if (id === localStorage.getItem('ehsmaha_admin_session_id')) return;
            await fb.updateDoc(fb.doc(fb.db, 'adminOwnSessions', id), { forceLogout: true });
            AdminToast.success('تم إرسال أمر تسجيل الخروج لتلك الجلسة');
          }));
        }
        draw();
        openModal({ title: 'جلسات دخول اللوحة النشطة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تصدير تقرير أمني شهري كامل',
      keywords: 'تقرير امني شهري تصدير',
      run: async () => {
        const since = Date.now() - 30 * 86400000;
        const [attemptsSnap, bansSnap, alertsSnap] = await Promise.all([
          fb.getDocs(fb.query(fb.collection(fb.db, 'adminLoginAttempts'), fb.orderBy('ts', 'desc'), fb.limit(1000))),
          fb.getDocs(fb.collection(fb.db, 'adminIpBans')),
          fb.getDocs(fb.query(fb.collection(fb.db, 'adminSecurityAlerts'), fb.orderBy('ts', 'desc'), fb.limit(500)))
        ]);
        const attempts = attemptsSnap.docs.map((d) => d.data()).filter((r) => tsToMillis(r.ts) >= since);
        const failedCount = attempts.filter((r) => !r.success).length;
        printReport('التقرير الأمني الشهري', `
          <h2>محاولات الدخول (آخر 30 يوم)</h2>
          <p>الإجمالي: ${attempts.length} — الفاشلة: ${failedCount}</p>
          <h2>عناوين IP المحظورة حالياً</h2>
          <p>${bansSnap.size}</p>
          <h2>تنبيهات حقن/استغلال</h2>
          <p>${alertsSnap.size}</p>
        `);
        csvDownload('security-report.csv', [
          ['الوقت', 'الإيميل', 'ناجح؟', 'السبب', 'IP', 'الدولة'],
          ...attempts.map((r) => [fmtDate(r.ts), r.emailAttempted, r.success, r.reason, r.ip, r.country])
        ]);
      }
    }
  ]
});
