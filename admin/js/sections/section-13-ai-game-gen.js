// ==================== القسم 13 — اصنع لعبتك ====================
// ملاحظة صريحة: ميزة "اصنع لعبتك" (توليد لعبة بالذكاء الاصطناعي) غير مبنية
// بالموقع الرئيسي بعد — بحثنا بكامل الكود وما لقينا أي واجهة تقديم طلب
// للاعبين. أدوات المراجعة/الموافقة أدناه جاهزة بالكامل وتعمل على كولكشن
// حقيقي (aiGameSubmissions)، وستمتلئ فوراً بمجرد إضافة واجهة التقديم.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { xpAddForUsername } from '../core/players.js';

const fb = AdminFB;

async function loadSubs(status) {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'aiGameSubmissions'), fb.orderBy('createdAt', 'desc'), fb.limit(1000)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return status ? rows.filter((r) => (r.status || 'pending') === status) : rows;
}

defineSection({
  id: 13,
  title: 'اصنع لعبتك',
  description: 'ميزة توليد الألعاب بالذكاء الاصطناعي غير موجودة بعد بالموقع الرئيسي — الأدوات أدناه جاهزة لإدارتها بمجرد إضافتها.',
  tools: [
    {
      title: 'قائمة الألعاب المقترحة من المستخدمين بانتظار المراجعة',
      keywords: 'قائمة العاب مقترحة انتظار',
      run: async () => {
        const rows = await loadSubs('pending');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المُقدِّم</th><th>الاسم</th><th>الفئة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="المُقدِّم">${r.username || '—'}</td><td data-label="الاسم">${r.name || '—'}</td><td data-label="الفئة">${r.category || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا اقتراح بانتظار المراجعة (الميزة غير مفعّلة بعد بالموقع الرئيسي)</p>';
        openModal({ title: 'ألعاب بانتظار المراجعة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'معاينة اللعبة المولَّدة قبل النشر',
      keywords: 'معاينة لعبة مولدة',
      run: async () => {
        const rows = await loadSubs();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="pv-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div><pre id="pv-content" style="margin-top:10px;white-space:pre-wrap;font-size:12px;background:var(--bg-panel-alt);padding:10px;border-radius:8px;max-height:300px;overflow:auto;"></pre>`;
        openModal({ title: 'معاينة اقتراح', bodyEl: body, size: 'lg' });
        function draw() { const r = rows.find((x) => x.id === body.querySelector('#pv-select').value); body.querySelector('#pv-content').textContent = r ? (r.description || JSON.stringify(r.content || {}, null, 2)) : ''; }
        if (rows.length) { body.querySelector('#pv-select').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'الموافقة ونشر اللعبة للجميع',
      keywords: 'موافقة نشر لعبة',
      run: async () => {
        const rows = await loadSubs('pending');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="ap-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div>
        <div class="admin-field"><span class="admin-field__label">الفئة عند النشر</span><select class="admin-input" id="ap-cat"><option value="online">أونلاين</option><option value="party">جمعات</option><option value="solo">فردي</option></select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="ap-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>موافقة ونشر</button>`;
        const modal = openModal({ title: 'الموافقة على اقتراح', bodyEl: body, size: 'md' });
        body.querySelector('#ap-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = body.querySelector('#ap-select').value;
          const r = rows.find((x) => x.id === id);
          const limitsSnap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'aiGameLimits'));
          const limits = limitsSnap.exists() ? limitsSnap.data() : {};
          await fb.updateDoc(fb.doc(fb.db, 'aiGameSubmissions', id), { status: 'approved', publishedCategory: body.querySelector('#ap-cat').value, approvedAt: fb.serverTimestamp() });
          if (r.uid) {
            // XP يُضاف على levels/{key} (مصدر XP الحقيقي بالموقع) مع إعادة حساب
            // اللفل — users.xp حقل غير موجود أصلاً وكانت الزيادة تضيع فيه.
            if (limits.rewardXp && r.username) await xpAddForUsername(r.username, Number(limits.rewardXp));
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', r.uid, 'items')), { type: 'adminMessage', message: `تم قبول لعبتك المقترحة "${r.name}" ونشرها!`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
          }
          await AdminAudit.log({ section: 13, sectionTitle: 'اصنع لعبتك', actionKey: 'aigame.approve', actionLabel: 'الموافقة على لعبة مولَّدة', targetType: 'aiGameSubmission', targetId: id, targetLabel: r.name });
          AdminToast.success('تم النشر');
          modal.close();
        });
      }
    },
    {
      title: 'رفض اللعبة مع سبب يصل لصاحبها',
      keywords: 'رفض لعبة سبب',
      run: async () => {
        const rows = await loadSubs('pending');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="rj-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div>
        <textarea class="admin-input" id="rj-reason" rows="2" placeholder="سبب الرفض"></textarea><button class="admin-btn admin-btn--danger admin-btn--sm" id="rj-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>رفض</button>`;
        const modal = openModal({ title: 'رفض اقتراح', bodyEl: body, size: 'md' });
        body.querySelector('#rj-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = body.querySelector('#rj-select').value;
          const r = rows.find((x) => x.id === id);
          const reason = body.querySelector('#rj-reason').value.trim();
          await fb.updateDoc(fb.doc(fb.db, 'aiGameSubmissions', id), { status: 'rejected', rejectReason: reason });
          if (r.uid) await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', r.uid, 'items')), { type: 'adminMessage', message: `للأسف تم رفض اقتراحك "${r.name}": ${reason}`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 13, sectionTitle: 'اصنع لعبتك', actionKey: 'aigame.reject', actionLabel: 'رفض لعبة مولَّدة', targetType: 'aiGameSubmission', targetId: id, note: reason });
          AdminToast.success('تم الرفض');
          modal.close();
        });
      }
    },
    {
      title: 'تعديل يدوي على القالب المولَّد قبل الموافقة',
      keywords: 'تعديل يدوي قالب مولد',
      run: async () => {
        const rows = await loadSubs('pending');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="ed-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div>
        <textarea class="admin-input" id="ed-desc" rows="6"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="ed-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>حفظ التعديل</button>`;
        openModal({ title: 'تعديل قالب مولَّد', bodyEl: body, size: 'lg' });
        function fill() { const r = rows.find((x) => x.id === body.querySelector('#ed-select').value); body.querySelector('#ed-desc').value = r ? (r.description || '') : ''; }
        if (rows.length) { body.querySelector('#ed-select').addEventListener('change', fill); fill(); }
        body.querySelector('#ed-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'aiGameSubmissions', body.querySelector('#ed-select').value), { description: body.querySelector('#ed-desc').value, editedByAdmin: true });
          AdminToast.success('تم الحفظ');
        });
      }
    },
    {
      title: 'تحديد حد أقصى لعدد الألعاب المقترحة شهرياً لكل مستخدم',
      keywords: 'حد اقصى العاب مقترحة شهري',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'aiGameLimits'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'حدود اقتراح الألعاب',
          fields: [
            { key: 'maxPerMonth', label: 'أقصى عدد اقتراحات شهرياً لكل مستخدم', type: 'number', value: cur.maxPerMonth || 3 },
            { key: 'rewardXp', label: 'مكافأة XP عند القبول', type: 'number', value: cur.rewardXp || 0 }
          ],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'aiGameLimits'), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'عرض القوالب الجاهزة المتاحة للتوليد وتعديلها',
      keywords: 'قوالب جاهزة توليد',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'aiGameTemplates'));
        const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `<div class="admin-table-wrap">${templates.map((t) => `<div style="padding:6px;border-bottom:1px solid var(--border);">${t.name}</div>`).join('') || '<p>ولا قالب بعد</p>'}</div>
          <div class="admin-form" style="margin-top:10px;"><input class="admin-input" id="tp-name" placeholder="اسم القالب" /><button class="admin-btn admin-btn--primary admin-btn--sm" id="tp-add" style="margin-top:6px;">إضافة</button></div>`;
          body.querySelector('#tp-add').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const name = body.querySelector('#tp-name').value.trim();
            if (!name) return;
            const ref = fb.doc(fb.collection(fb.db, 'aiGameTemplates'));
            await fb.setDoc(ref, { name });
            templates.push({ id: ref.id, name });
            draw();
          });
        }
        draw();
        openModal({ title: 'قوالب التوليد', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تعطيل خاصية "اصنع لعبتك" مؤقتاً بالكامل',
      keywords: 'تعطيل اصنع لعبتك',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'aiGameFeature'));
        const enabled = !snap.exists() || snap.data().enabled !== false;
        openConfirm({
          title: enabled ? 'تعطيل اصنع لعبتك' : 'تفعيل اصنع لعبتك',
          message: 'يحفظ الحالة بـsiteFlags/aiGameFeature — يحتاج قراءتها من الميزة نفسها بمجرد بنائها بالموقع الرئيسي.',
          onConfirm: async () => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'aiGameFeature'), { enabled: !enabled }, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تقرير أكثر أنواع الألعاب المقترحة طلباً',
      keywords: 'تقرير اكثر انواع العاب مقترحة',
      run: async () => {
        const rows = await loadSubs();
        const counts = new Map();
        rows.forEach((r) => counts.set(r.category || 'غير محدد', (counts.get(r.category || 'غير محدد') || 0) + 1));
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const body = document.createElement('div');
        body.innerHTML = sorted.length ? `<table class="admin-table"><tbody>${sorted.map(([c, n]) => `<tr><td class="is-primary" data-label="الفئة">${c}</td><td data-label="العدد">${n}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات بعد</p>';
        openModal({ title: 'أكثر أنواع الألعاب طلباً', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'منح صاحب لعبة مقبولة مكافأة تلقائية',
      keywords: 'منح مكافأة لعبة مقبولة',
      meta: 'مطبَّقة تلقائياً بأداة "الموافقة ونشر اللعبة" — تُعطي XP المحدَّد بأداة الحدود',
      run: () => AdminToast.info('تُمنح تلقائياً عند الموافقة (أداة رقم 3) حسب القيمة المحدَّدة بأداة "حد أقصى شهري"')
    },
    {
      title: 'أرشفة الألعاب المرفوضة مع سبب الرفض للرجوع له لاحقاً',
      keywords: 'ارشفة العاب مرفوضة',
      run: async () => {
        const rows = await loadSubs('rejected');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>السبب</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الاسم">${r.name}</td><td data-label="السبب">${r.rejectReason || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا لعبة مرفوضة بعد</p>';
        openModal({ title: 'أرشيف الألعاب المرفوضة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'اختبار تشغيل اللعبة المولَّدة داخل بيئة معزولة قبل النشر',
      keywords: 'اختبار تشغيل بيئة معزولة',
      run: async () => {
        const rows = await loadSubs();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="sb-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div><iframe id="sb-frame" sandbox="allow-scripts" style="width:100%;height:300px;border:1px solid var(--border);border-radius:8px;margin-top:10px;background:#fff;"></iframe>`;
        openModal({ title: 'بيئة اختبار معزولة (iframe sandbox)', bodyEl: body, size: 'lg' });
        function draw() { const r = rows.find((x) => x.id === body.querySelector('#sb-select').value); body.querySelector('#sb-frame').srcdoc = r ? (r.htmlPreview || `<p style="font-family:sans-serif;padding:20px;">${r.description || 'ولا معاينة HTML متاحة لهذا الاقتراح'}</p>`) : ''; }
        if (rows.length) { body.querySelector('#sb-select').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'تحديد تكلفة/حد استخدام API الذكاء الاصطناعي شهرياً',
      keywords: 'تكلفة حد api ذكاء اصطناعي',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'aiGameLimits'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'ميزانية API الذكاء الاصطناعي',
          fields: [{ key: 'monthlyApiBudget', label: 'الميزانية الشهرية (بالدولار)', type: 'number', value: cur.monthlyApiBudget || '' }],
          onSubmit: async (v) => { await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'aiGameLimits'), v, { merge: true }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'سجل كامل لكل عمليات التوليد الناجحة والفاشلة',
      keywords: 'سجل عمليات توليد',
      run: async () => {
        const rows = await loadSubs();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>الحالة</th><th>الوقت</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الاسم">${r.name}</td><td data-label="الحالة">${r.status || 'pending'}</td><td data-label="الوقت">${fmtDate(r.createdAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل بعد</p>';
        openModal({ title: 'سجل كل عمليات التوليد', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'تصنيف الألعاب المولَّدة حسب الفئة',
      keywords: 'تصنيف العاب مولدة فئة',
      run: async () => {
        const rows = await loadSubs();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الاقتراح</span><select class="admin-input" id="cg-select">${rows.map((r) => `<option value="${r.id}">${r.name}</option>`).join('') || '<option>ولا اقتراح</option>'}</select></div>
        <select class="admin-input" id="cg-value" style="margin-top:6px;"><option value="streamer">ستريمر</option><option value="online">أونلاين</option><option value="party">جمعات</option><option value="solo">فردي</option></select>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="cg-go" style="margin-top:8px;" ${!rows.length ? 'disabled' : ''}>حفظ</button>`;
        const modal = openModal({ title: 'تصنيف حسب الفئة', bodyEl: body, size: 'sm' });
        body.querySelector('#cg-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'aiGameSubmissions', body.querySelector('#cg-select').value), { category: body.querySelector('#cg-value').value });
          AdminToast.success('تم');
          modal.close();
        });
      }
    }
  ]
});
