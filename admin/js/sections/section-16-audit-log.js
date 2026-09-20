// ==================== القسم 16 — سجل الأحداث الشامل (Audit Log) ====================
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;

// خريطة targetType -> اسم الكولكشن الفعلي، تُستخدم فقط للإجراءات القابلة
// فعلياً للتراجع التلقائي والآمن (16.10) — أي إجراء ثاني يبقى بدون تراجع
// تلقائي بدل ما نخمّن ونكسر بيانات.
const UNDOABLE_TARGET_COLLECTIONS = { siteFlag: 'siteFlags', ip: 'adminIpBans' };

function rowActionLabel(r) {
  return `${r.actionLabel || r.actionKey || '—'}`;
}

function detailModal(r) {
  const body = document.createElement('div');
  body.innerHTML = `
    <dl class="admin-kv">
      <dt>الوقت</dt><dd>${fmtDate(r.tsClient)}</dd>
      <dt>القسم</dt><dd>${r.sectionTitle || r.section || '—'}</dd>
      <dt>الإجراء</dt><dd>${rowActionLabel(r)}</dd>
      <dt>الهدف</dt><dd>${r.targetLabel || r.targetId || '—'} (${r.targetType || '—'})</dd>
      <dt>بواسطة</dt><dd>${r.actorEmail || '—'}</dd>
      <dt>الجهاز</dt><dd>${r.userAgent || '—'}</dd>
      <dt>ملاحظة</dt><dd>${r.note || '—'}</dd>
    </dl>
    <div class="admin-grid-2" style="margin-top:14px;">
      <div><h4 style="color:var(--text-secondary);font-size:12px;">قبل</h4><pre style="white-space:pre-wrap;font-size:11.5px;background:var(--bg-panel-alt);padding:10px;border-radius:8px;">${JSON.stringify(r.before, null, 2) || '—'}</pre></div>
      <div><h4 style="color:var(--text-secondary);font-size:12px;">بعد</h4><pre style="white-space:pre-wrap;font-size:11.5px;background:var(--bg-panel-alt);padding:10px;border-radius:8px;">${JSON.stringify(r.after, null, 2) || '—'}</pre></div>
    </div>
  `;
  const actions = document.createElement('div');
  actions.className = 'admin-modal__actions';
  actions.style.marginTop = '14px';
  const reviewBtn = document.createElement('button');
  reviewBtn.className = 'admin-btn admin-btn--ghost admin-btn--sm';
  reviewBtn.textContent = r.reviewed ? 'إلغاء وسم "مُراجَع"' : 'وسم كـ"مُراجَع"';
  reviewBtn.addEventListener('click', async () => {
    await AdminAudit.markReviewed(r.id, !r.reviewed);
    r.reviewed = !r.reviewed;
    reviewBtn.textContent = r.reviewed ? 'إلغاء وسم "مُراجَع"' : 'وسم كـ"مُراجَع"';
    AdminToast.success('تم التحديث');
  });
  actions.appendChild(reviewBtn);

  const undoCollection = r.targetType && UNDOABLE_TARGET_COLLECTIONS[r.targetType];
  if (undoCollection && !r.undone && r.before !== undefined) {
    const undoBtn = document.createElement('button');
    undoBtn.className = 'admin-btn admin-btn--danger admin-btn--sm';
    undoBtn.textContent = 'تراجع عن هذا الإجراء';
    undoBtn.addEventListener('click', async () => {
      try {
        if (r.before === null) await fb.deleteDoc(fb.doc(fb.db, undoCollection, r.targetId));
        else await fb.setDoc(fb.doc(fb.db, undoCollection, r.targetId), r.before);
        await AdminAudit.markUndone(r.id);
        AdminToast.success('تم التراجع');
      } catch (err) { AdminToast.error('فشل التراجع: ' + err.message); }
    });
    actions.appendChild(undoBtn);
  }
  body.appendChild(actions);
  openModal({ title: 'تفاصيل الإجراء', bodyEl: body, size: 'lg' });
}

function renderLogTable(rows) {
  return `
    <table class="admin-table"><thead><tr><th>الوقت</th><th>القسم</th><th>الإجراء</th><th>الهدف</th><th>حسّاس؟</th><th></th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td data-label="الوقت">${fmtDate(r.tsClient)}</td>
      <td data-label="القسم">${r.sectionTitle || r.section || '—'}</td>
      <td data-label="الإجراء" class="is-primary">${rowActionLabel(r)}</td>
      <td data-label="الهدف">${r.targetLabel || r.targetId || '—'}</td>
      <td data-label="حسّاس؟">${r.sensitive ? `<span class="admin-badge admin-badge--pink">${r.reviewed ? 'حسّاس - مُراجَع' : 'حسّاس'}</span>` : '—'}</td>
      <td><button class="admin-btn admin-btn--ghost admin-btn--sm" data-detail="${r.id}">تفاصيل</button></td>
    </tr>`).join('') || '<tr><td colspan="6">لا يوجد شي</td></tr>'}</tbody></table>
  `;
}

function wireDetailButtons(container, rows) {
  container.querySelectorAll('[data-detail]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = rows.find((x) => x.id === btn.getAttribute('data-detail'));
      if (r) detailModal(r);
    });
  });
}

defineSection({
  id: 16,
  title: 'سجل الأحداث الشامل (Audit Log)',
  description: 'كل إجراء إداري بأي قسم يُسجَّل هنا تلقائياً بدون استثناء.',
  tools: [
    {
      title: 'سجل زمني لكل إجراء إداري بلا استثناء',
      keywords: 'سجل زمني كل الاجراءات',
      run: () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        let allRows = [];
        let unsub = () => {};
        const modal = openModal({ title: 'السجل الزمني الكامل', bodyEl: body, size: 'xl', onClose: () => unsub() });
        unsub = AdminAudit.subscribeRecent(300, (rows) => {
          allRows = rows;
          const more = document.createElement('div');
          more.style.marginTop = '10px';
          more.innerHTML = '<button class="admin-btn admin-btn--ghost admin-btn--sm" id="audit-load-more">تحميل 200 أقدم</button>';
          body.innerHTML = renderLogTable(rows);
          body.appendChild(more);
          wireDetailButtons(body, allRows);
          body.querySelector('#audit-load-more').addEventListener('click', async () => {
            const last = allRows[allRows.length - 1];
            if (!last) return;
            const older = await AdminAudit.loadOlder(last.tsClient, 200);
            allRows = allRows.concat(older);
            body.innerHTML = renderLogTable(allRows);
            body.appendChild(more);
            wireDetailButtons(body, allRows);
          });
        });
      }
    },
    {
      title: 'فلترة حسب نوع الإجراء (حذف/تعديل/منح/حظر)',
      keywords: 'فلترة نوع اجراء',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const types = { حذف: /delete|remove|ban|حظر|حذف/i, منح: /grant|add|منح|إضاف/i, تعديل: /edit|update|change|تعديل/i, حظر: /ban|freeze|حظر|تجميد/i };
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">نوع الإجراء</span>
            <select class="admin-input" id="audit-type-filter">${Object.keys(types).map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
          </div>
          <div id="audit-type-results" style="margin-top:12px;"></div>
        `;
        const modal = openModal({ title: 'فلترة حسب نوع الإجراء', bodyEl: body, size: 'xl' });
        function draw() {
          const t = body.querySelector('#audit-type-filter').value;
          const filtered = rows.filter((r) => types[t].test(r.actionKey || '') || types[t].test(r.actionLabel || ''));
          const target = body.querySelector('#audit-type-results');
          target.innerHTML = renderLogTable(filtered.slice(0, 200));
          wireDetailButtons(target, filtered);
        }
        body.querySelector('#audit-type-filter').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'فلترة حسب القسم الذي حدث فيه الإجراء',
      keywords: 'فلترة حسب قسم',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const sections = [...new Set(rows.map((r) => r.section).filter((s) => s != null))].sort((a, b) => a - b);
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">القسم</span>
            <select class="admin-input" id="audit-section-filter">${sections.map((s) => `<option value="${s}">${s} — ${rows.find((r) => r.section === s).sectionTitle || ''}</option>`).join('') || '<option>لا يوجد بعد</option>'}</select>
          </div>
          <div id="audit-section-results" style="margin-top:12px;"></div>
        `;
        openModal({ title: 'فلترة حسب القسم', bodyEl: body, size: 'xl' });
        function draw() {
          const s = Number(body.querySelector('#audit-section-filter').value);
          const filtered = rows.filter((r) => r.section === s);
          const target = body.querySelector('#audit-section-results');
          target.innerHTML = renderLogTable(filtered.slice(0, 200));
          wireDetailButtons(target, filtered);
        }
        if (sections.length) { body.querySelector('#audit-section-filter').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'البحث عن كل الإجراءات التي طالت مستخدم معيّن',
      keywords: 'بحث اجراءات مستخدم',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">اسم المستخدم / المعرّف</span><input class="admin-input" id="audit-user-search" placeholder="اكتب واضغط بحث" /></div>
          <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary admin-btn--sm" id="audit-user-go">بحث</button></div>
          <div id="audit-user-results" style="margin-top:12px;"></div>
        `;
        openModal({ title: 'بحث بإجراءات مستخدم', bodyEl: body, size: 'xl' });
        body.querySelector('#audit-user-go').addEventListener('click', () => {
          const q = body.querySelector('#audit-user-search').value.trim().toLowerCase();
          const filtered = rows.filter((r) => (r.targetId || '').toLowerCase().includes(q) || (r.targetLabel || '').toLowerCase().includes(q));
          const target = body.querySelector('#audit-user-results');
          target.innerHTML = renderLogTable(filtered.slice(0, 200));
          wireDetailButtons(target, filtered);
        });
      }
    },
    {
      title: 'عرض تفاصيل كاملة لإجراء واحد (القيمة قبل وبعد)',
      keywords: 'تفاصيل قبل بعد',
      meta: 'افتح أي إجراء من أي أداة ثانية بهذا القسم — زر "تفاصيل" بكل صف',
      run: () => AdminToast.info('افتح "السجل الزمني الكامل" واضغط تفاصيل على أي صف')
    },
    {
      title: 'تصدير السجل الكامل كملف',
      keywords: 'تصدير csv سجل',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        csvDownload('audit-log-full.csv', [
          ['الوقت', 'القسم', 'الإجراء', 'الهدف', 'بواسطة', 'حسّاس'],
          ...rows.map((r) => [fmtDate(r.tsClient), r.sectionTitle || r.section, rowActionLabel(r), r.targetLabel || r.targetId, r.actorEmail, r.sensitive])
        ]);
        AdminToast.success(`تم تصدير ${rows.length} إجراء`);
      }
    },
    {
      title: 'تنبيه عند إجراء حسّاس',
      keywords: 'تنبيه حساس',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const sensitive = rows.filter((r) => r.sensitive && !r.reviewed);
        const body = document.createElement('div');
        body.innerHTML = sensitive.length ? renderLogTable(sensitive.slice(0, 100)) : '<p>ولا إجراء حسّاس بانتظار المراجعة</p>';
        openModal({ title: `إجراءات حسّاسة غير مُراجَعة (${sensitive.length})`, bodyEl: body, size: 'xl' });
        wireDetailButtons(body, sensitive);
      }
    },
    {
      title: 'أرشفة السجلات الأقدم من فترة معيّنة تلقائياً',
      keywords: 'ارشفة سجلات قديمة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">أرشف كل ما هو أقدم من (يوم)</span><input class="admin-input" id="archive-days" type="number" value="180" min="30" /></div>
        <div class="admin-modal__actions"><button class="admin-btn admin-btn--danger admin-btn--sm" id="archive-go">تصدير ثم حذف</button></div>`;
        const modal = openModal({ title: 'أرشفة السجلات القديمة', bodyEl: body, size: 'sm' });
        body.querySelector('#archive-go').addEventListener('click', async () => {
          const days = Number(body.querySelector('#archive-days').value);
          const cutoff = Date.now() - days * 86400000;
          const rows = (await AdminAudit.fetchAllForExport()).filter((r) => r.tsClient < cutoff);
          if (!rows.length) { AdminToast.info('ولا سجل أقدم من هالفترة'); return; }
          openConfirm({
            title: 'تأكيد الأرشفة',
            message: `بيصدَّر ${rows.length} سجل كملف CSV ثم يُحذف نهائياً من قاعدة البيانات.`,
            danger: true, doubleConfirm: true, confirmText: 'أرشف واحذف',
            onConfirm: async () => {
              csvDownload(`audit-archive-before-${days}d.csv`, [['الوقت', 'الإجراء', 'الهدف'], ...rows.map((r) => [fmtDate(r.tsClient), rowActionLabel(r), r.targetLabel || r.targetId])]);
              await Promise.all(rows.map((r) => fb.deleteDoc(fb.doc(fb.db, 'adminAuditLog', r.id))));
              AdminToast.success(`تمت أرشفة ${rows.length} سجل`);
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'إحصائية بعدد الإجراءات المتخذة يومياً/أسبوعياً',
      keywords: 'احصائية اجراءات يومية',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const days = 14;
        const buckets = new Array(days).fill(0);
        const startOfWindow = new Date(new Date().setHours(0, 0, 0, 0)).getTime() - (days - 1) * 86400000;
        rows.forEach((r) => {
          const idx = Math.floor((r.tsClient - startOfWindow) / 86400000);
          if (idx >= 0 && idx < days) buckets[idx]++;
        });
        const labels = buckets.map((_, i) => new Date(startOfWindow + i * 86400000).toLocaleDateString('ar', { day: 'numeric', month: 'numeric' }));
        const body = document.createElement('div');
        body.innerHTML = renderBarChart({ labels, values: buckets, height: 200 });
        openModal({ title: 'الإجراءات الإدارية آخر 14 يوم', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'التراجع (Undo) عن إجراء قابل للعكس',
      keywords: 'تراجع undo',
      meta: 'متاح تلقائياً على الإجراءات القابلة للعكس (حظر/فك حظر IP، أعلام النظام) من داخل نافذة التفاصيل',
      run: () => AdminToast.info('افتح تفاصيل أي إجراء قابل للتراجع — زر "تراجع عن هذا الإجراء" يظهر تلقائياً إذا كان مدعوماً')
    },
    {
      title: 'مقارنة نشاطي الإداري بين فترتين زمنيتين',
      keywords: 'مقارنة فترتين نشاط',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-grid-2">
            <label class="admin-field"><span class="admin-field__label">الفترة الأولى — من</span><input class="admin-input" type="date" id="cmp-a-from" /></label>
            <label class="admin-field"><span class="admin-field__label">إلى</span><input class="admin-input" type="date" id="cmp-a-to" /></label>
            <label class="admin-field"><span class="admin-field__label">الفترة الثانية — من</span><input class="admin-input" type="date" id="cmp-b-from" /></label>
            <label class="admin-field"><span class="admin-field__label">إلى</span><input class="admin-input" type="date" id="cmp-b-to" /></label>
          </div>
          <div class="admin-modal__actions" style="margin-top:12px;"><button class="admin-btn admin-btn--primary admin-btn--sm" id="cmp-go">قارن</button></div>
          <div id="cmp-result" style="margin-top:14px;"></div>
        `;
        openModal({ title: 'مقارنة نشاط بين فترتين', bodyEl: body, size: 'md' });
        body.querySelector('#cmp-go').addEventListener('click', () => {
          const range = (fromId, toId) => {
            const from = new Date(body.querySelector(fromId).value).getTime();
            const to = new Date(body.querySelector(toId).value).getTime() + 86400000;
            return rows.filter((r) => r.tsClient >= from && r.tsClient < to).length;
          };
          const a = range('#cmp-a-from', '#cmp-a-to');
          const b = range('#cmp-b-from', '#cmp-b-to');
          body.querySelector('#cmp-result').innerHTML = `
            <div class="admin-stat-row">
              <div class="admin-stat-card"><div class="admin-stat-card__label">الفترة الأولى</div><div class="admin-stat-card__value">${fmtNum(a)}</div></div>
              <div class="admin-stat-card"><div class="admin-stat-card__label">الفترة الثانية</div><div class="admin-stat-card__value">${fmtNum(b)}</div></div>
            </div>`;
        });
      }
    },
    {
      title: 'وسم إجراء معيّن كـ"مراجَع" بعد التحقق منه',
      keywords: 'وسم مراجع',
      meta: 'من داخل نافذة تفاصيل أي إجراء',
      run: () => AdminToast.info('افتح تفاصيل أي إجراء — زر "وسم كـمُراجَع" بالأسفل')
    },
    {
      title: 'عرض أكثر الأقسام التي تشهد إجراءات إدارية',
      keywords: 'اكثر الاقسام نشاطا',
      run: async () => {
        const rows = await AdminAudit.fetchAllForExport();
        const counts = new Map();
        rows.forEach((r) => { const k = r.sectionTitle || String(r.section || 'غير محدد'); counts.set(k, (counts.get(k) || 0) + 1); });
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        const body = document.createElement('div');
        body.innerHTML = sorted.length ? renderBarChart({ labels: sorted.map((s) => s[0]), values: sorted.map((s) => s[1]), height: 200 }) : '<p>لا يوجد بيانات كافية بعد</p>';
        openModal({ title: 'أكثر الأقسام نشاطاً إدارياً', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'تنبيه إذا حدث إجراء إداري من جهاز/IP غير معتاد',
      keywords: 'جهاز غير معتاد تنبيه',
      run: async () => {
        const [rows, ownSessions] = await Promise.all([
          AdminAudit.fetchAllForExport(),
          fb.getDocs(fb.collection(fb.db, 'adminOwnSessions'))
        ]);
        const knownUAs = new Set(ownSessions.docs.map((d) => d.data().userAgent).filter(Boolean));
        const unusual = rows.filter((r) => r.userAgent && !knownUAs.has(r.userAgent)).slice(0, 100);
        const body = document.createElement('div');
        body.innerHTML = unusual.length ? renderLogTable(unusual) : '<p>كل الإجراءات صادرة من أجهزة معروفة</p>';
        openModal({ title: 'إجراءات من أجهزة غير معتادة', bodyEl: body, size: 'xl' });
        wireDetailButtons(body, unusual);
      }
    },
    {
      title: 'طباعة تقرير إجراءات شهر معيّن',
      keywords: 'طباعة تقرير شهري',
      run: async () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الشهر</span><input class="admin-input" type="month" id="report-month" value="${new Date().toISOString().slice(0, 7)}" /></div>
        <div class="admin-modal__actions"><button class="admin-btn admin-btn--primary admin-btn--sm" id="report-go">إنشاء التقرير</button></div>`;
        const modal = openModal({ title: 'تقرير شهري مطبوع', bodyEl: body, size: 'sm' });
        body.querySelector('#report-go').addEventListener('click', async () => {
          const [y, m] = body.querySelector('#report-month').value.split('-').map(Number);
          const from = new Date(y, m - 1, 1).getTime();
          const to = new Date(y, m, 1).getTime();
          const rows = (await AdminAudit.fetchAllForExport()).filter((r) => r.tsClient >= from && r.tsClient < to);
          printReport(`تقرير الإجراءات الإدارية — ${m}/${y}`, `
            <p>إجمالي الإجراءات: ${rows.length}</p>
            <table><thead><tr><th>الوقت</th><th>القسم</th><th>الإجراء</th><th>الهدف</th></tr></thead>
            <tbody>${rows.map((r) => `<tr><td>${fmtDate(r.tsClient)}</td><td>${r.sectionTitle || r.section}</td><td>${rowActionLabel(r)}</td><td>${r.targetLabel || r.targetId || '—'}</td></tr>`).join('') || '<tr><td colspan="4">لا يوجد</td></tr>'}</tbody></table>
          `);
          modal.close();
        });
      }
    }
  ]
});
