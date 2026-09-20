// ==================== القسم 9 — نظام التذاكر والدعم الفني ====================
// مبني فوق كولكشن feedback الحقيقي (type, text, username, uid, createdAt)
// + حقول إدارية جديدة (status/priority/category/response) نضيفها نحن.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, tsToMillis } from '../core/format.js';

const fb = AdminFB;
const PRIORITY_LABEL = { urgent: 'عاجل', normal: 'عادي' };

async function loadTickets() {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'feedback'), fb.orderBy('createdAt', 'desc'), fb.limit(2000)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
function ticketRow(t) {
  return `<tr><td class="is-primary" data-label="اليوزر">${t.username || '—'}</td><td data-label="النوع">${t.type === 'problem' ? 'مشكلة' : 'اقتراح'}</td><td data-label="النص">${(t.text || '').slice(0, 60)}</td><td data-label="الأولوية">${PRIORITY_LABEL[t.priority] || 'عادي'}</td><td data-label="الحالة">${t.status || 'مفتوحة'}</td></tr>`;
}

defineSection({
  id: 9,
  title: 'نظام التذاكر والدعم الفني',
  description: 'كل ملاحظات/مشاكل المستخدمين الحقيقية (feedback) — بحقول إدارية جديدة للتصنيف والرد والحالة.',
  tools: [
    {
      title: 'قائمة كل التذاكر المفتوحة مرتّبة بالأولوية',
      keywords: 'تذاكر مفتوحة اولوية',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.status !== 'closed' && t.status !== 'archived');
        tickets.sort((a, b) => (a.priority === 'urgent' ? -1 : 0) - (b.priority === 'urgent' ? -1 : 0));
        const body = document.createElement('div');
        body.innerHTML = tickets.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>النوع</th><th>النص</th><th>الأولوية</th><th>الحالة</th></tr></thead><tbody>${tickets.map(ticketRow).join('')}</tbody></table>` : '<p>ولا تذكرة مفتوحة</p>';
        openModal({ title: `التذاكر المفتوحة (${tickets.length})`, bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'الرد المباشر على تذكرة من داخل اللوحة',
      keywords: 'رد مباشر تذكرة',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.status !== 'archived');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="tk-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div>
        <textarea class="admin-input" id="tk-reply" rows="3" placeholder="نص الرد"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="tk-go" style="margin-top:8px;">إرسال الرد</button>`;
        const modal = openModal({ title: 'الرد على تذكرة', bodyEl: body, size: 'md' });
        body.querySelector('#tk-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = body.querySelector('#tk-select').value;
          const reply = body.querySelector('#tk-reply').value.trim();
          const t = tickets.find((x) => x.id === id);
          await fb.updateDoc(fb.doc(fb.db, 'feedback', id), { response: reply, respondedAt: fb.serverTimestamp() });
          if (t.uid) await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', t.uid, 'items')), { type: 'adminMessage', message: `رد على ملاحظتك: ${reply}`, fromLabel: 'الدعم الفني', read: false, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 9, sectionTitle: 'نظام التذاكر والدعم الفني', actionKey: 'tickets.reply', actionLabel: 'رد على تذكرة', targetType: 'ticket', targetId: id, note: reply });
          AdminToast.success('تم الإرسال');
          modal.close();
        });
      }
    },
    {
      title: 'تصنيف تذكرة (تقني/حساب/اقتراح/شكوى)',
      keywords: 'تصنيف تذكرة',
      run: async () => {
        const tickets = await loadTickets();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="cat-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div>
        <div class="admin-field"><span class="admin-field__label">التصنيف</span><select class="admin-input" id="cat-value"><option value="تقني">تقني</option><option value="حساب">حساب</option><option value="اقتراح">اقتراح</option><option value="شكوى">شكوى</option></select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="cat-go" style="margin-top:8px;">حفظ</button>`;
        const modal = openModal({ title: 'تصنيف تذكرة', bodyEl: body, size: 'sm' });
        body.querySelector('#cat-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'feedback', body.querySelector('#cat-select').value), { category: body.querySelector('#cat-value').value });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'تحويل تذكرة لأولوية "عاجل"',
      keywords: 'تحويل تذكرة عاجل',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.priority !== 'urgent');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="urg-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="urg-go" style="margin-top:8px;">تحويل لعاجل</button>`;
        const modal = openModal({ title: 'تحويل لعاجل', bodyEl: body, size: 'sm' });
        body.querySelector('#urg-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'feedback', body.querySelector('#urg-select').value), { priority: 'urgent' });
          AdminToast.success('تم');
          modal.close();
        });
      }
    },
    {
      title: 'إغلاق تذكرة مع ملاحظة حل',
      keywords: 'اغلاق تذكرة ملاحظة حل',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.status !== 'closed');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="cl-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div>
        <textarea class="admin-input" id="cl-note" rows="2" placeholder="ملاحظة الحل"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="cl-go" style="margin-top:8px;">إغلاق</button>`;
        const modal = openModal({ title: 'إغلاق تذكرة', bodyEl: body, size: 'sm' });
        body.querySelector('#cl-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = body.querySelector('#cl-select').value;
          await fb.updateDoc(fb.doc(fb.db, 'feedback', id), { status: 'closed', resolutionNote: body.querySelector('#cl-note').value, closedAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 9, sectionTitle: 'نظام التذاكر والدعم الفني', actionKey: 'tickets.close', actionLabel: 'إغلاق تذكرة', targetType: 'ticket', targetId: id });
          AdminToast.success('تم الإغلاق');
          modal.close();
        });
      }
    },
    {
      title: 'إعادة فتح تذكرة مغلقة',
      keywords: 'اعادة فتح تذكرة',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.status === 'closed');
        const body = document.createElement('div');
        body.innerHTML = tickets.length ? `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="rp-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="rp-go" style="margin-top:8px;">إعادة فتح</button>` : '<p>ولا تذكرة مغلقة</p>';
        const modal = openModal({ title: 'إعادة فتح تذكرة', bodyEl: body, size: 'sm' });
        const btn = body.querySelector('#rp-go');
        if (btn) btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'feedback', body.querySelector('#rp-select').value), { status: 'open' });
          AdminToast.success('تم');
          modal.close();
        });
      }
    },
    {
      title: 'أرشفة التذاكر القديمة',
      keywords: 'ارشفة تذاكر قديمة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">أرشف المغلقة الأقدم من (يوم)</span><input class="admin-input" id="ar-days" type="number" value="30" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="ar-go" style="margin-top:8px;">أرشفة</button>`;
        const modal = openModal({ title: 'أرشفة التذاكر القديمة', bodyEl: body, size: 'sm' });
        body.querySelector('#ar-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const days = Number(body.querySelector('#ar-days').value);
          const cutoff = Date.now() - days * 86400000;
          const tickets = (await loadTickets()).filter((t) => t.status === 'closed' && tsToMillis(t.closedAt || t.createdAt) < cutoff);
          await Promise.all(tickets.map((t) => fb.updateDoc(fb.doc(fb.db, 'feedback', t.id), { status: 'archived' })));
          AdminToast.success(`تمت أرشفة ${tickets.length} تذكرة`);
          modal.close();
        });
      }
    },
    {
      title: 'رد سريع بقوالب جاهزة (Canned Responses)',
      keywords: 'رد سريع قوالب جاهزة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'feedbackCannedResponses'));
        const templates = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `
            <div class="admin-table-wrap">${templates.map((t) => `<div style="padding:6px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;"><span>${t.title}</span><button class="admin-btn admin-btn--ghost admin-btn--sm" data-del="${t.id}">حذف</button></div>`).join('') || '<p class="admin-field__hint">ولا قالب بعد</p>'}</div>
            <div class="admin-form" style="margin-top:12px;"><input class="admin-input" id="ct-title" placeholder="عنوان القالب" /><textarea class="admin-input" id="ct-text" rows="2" placeholder="النص" style="margin-top:6px;"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="ct-add" style="margin-top:6px;">إضافة قالب</button></div>
          `;
          body.querySelectorAll('[data-del]').forEach((btn) => btn.addEventListener('click', async () => {
            await fb.deleteDoc(fb.doc(fb.db, 'feedbackCannedResponses', btn.getAttribute('data-del')));
            templates.splice(templates.findIndex((t) => t.id === btn.getAttribute('data-del')), 1);
            draw();
          }));
          body.querySelector('#ct-add').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const title = body.querySelector('#ct-title').value.trim();
            const text = body.querySelector('#ct-text').value.trim();
            if (!title || !text) return;
            const ref = fb.doc(fb.collection(fb.db, 'feedbackCannedResponses'));
            await fb.setDoc(ref, { title, text });
            templates.push({ id: ref.id, title, text });
            draw();
          });
        }
        draw();
        openModal({ title: 'قوالب الرد السريع', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'عرض متوسط زمن الرد على التذاكر',
      keywords: 'متوسط زمن رد تذاكر',
      run: async () => {
        const tickets = (await loadTickets()).filter((t) => t.respondedAt);
        const diffs = tickets.map((t) => tsToMillis(t.respondedAt) - tsToMillis(t.createdAt)).filter((d) => d > 0);
        const avgH = diffs.length ? (diffs.reduce((a, b) => a + b, 0) / diffs.length / 3600000).toFixed(1) : 0;
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">متوسط زمن الرد (ساعة)</div><div class="admin-stat-card__value">${avgH}</div><div class="admin-stat-card__sub">من أصل ${diffs.length} تذكرة تم الرد عليها</div></div>`;
        openModal({ title: 'متوسط زمن الرد', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تعيين تذكرة لمراجعة لاحقة بتذكير',
      keywords: 'تعيين مراجعة لاحقة تذكير',
      run: async () => {
        const tickets = await loadTickets();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="rv-select">${tickets.map((t) => `<option value="${t.id}">${t.username} — ${(t.text || '').slice(0, 40)}</option>`).join('')}</select></div>
        <div class="admin-field"><span class="admin-field__label">تاريخ المراجعة</span><input class="admin-input" type="date" id="rv-date" /></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="rv-go" style="margin-top:8px;">حفظ</button>`;
        const modal = openModal({ title: 'مراجعة لاحقة', bodyEl: body, size: 'sm' });
        body.querySelector('#rv-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'feedback', body.querySelector('#rv-select').value), { reviewAt: new Date(body.querySelector('#rv-date').value) });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'ربط تذكرة بحساب اللاعب مباشرة لعرض بياناته',
      keywords: 'ربط تذكرة حساب لاعب',
      run: async () => {
        const tickets = await loadTickets();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">التذكرة</span><select class="admin-input" id="lk-select">${tickets.map((t) => `<option value="${t.id}">${t.username}</option>`).join('')}</select></div><div id="lk-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'بيانات صاحب التذكرة', bodyEl: body, size: 'md' });
        async function draw() {
          const t = tickets.find((x) => x.id === body.querySelector('#lk-select').value);
          if (!t || !t.uid) { body.querySelector('#lk-result').innerHTML = '<p>ما فيه uid مرتبط</p>'; return; }
          const userSnap = await fb.getDoc(fb.doc(fb.db, 'users', t.uid));
          const u = userSnap.data() || {};
          body.querySelector('#lk-result').innerHTML = `<dl class="admin-kv"><dt>اليوزر</dt><dd>${u.username}</dd><dt>XP</dt><dd>${u.xp || 0}</dd><dt>تاريخ التسجيل</dt><dd>${fmtDate(u.createdAt)}</dd></dl>`;
        }
        body.querySelector('#lk-select').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'تقرير أكثر المشاكل تكراراً هذا الشهر',
      keywords: 'اكثر مشاكل تكرارا شهر',
      run: async () => {
        const since = Date.now() - 30 * 86400000;
        const tickets = (await loadTickets()).filter((t) => tsToMillis(t.createdAt) >= since);
        const counts = new Map();
        tickets.forEach((t) => { const k = t.category || 'غير مصنَّف'; counts.set(k, (counts.get(k) || 0) + 1); });
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const body = document.createElement('div');
        body.innerHTML = sorted.length ? `<table class="admin-table"><tbody>${sorted.map(([c, n]) => `<tr><td class="is-primary" data-label="التصنيف">${c}</td><td data-label="العدد">${n}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات</p>';
        openModal({ title: 'أكثر المشاكل تكراراً هذا الشهر', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تقييم رضا المستخدم بعد إغلاق التذكرة',
      keywords: 'تقييم رضا مستخدم تذكرة',
      badge: 'يحتاج واجهة تقييم من اللاعب',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<p>الحقل satisfactionRating جاهز على مستند التذكرة لاستقبال تقييم (1-5) — لكن ما فيه واجهة بالموقع الرئيسي تطلب من اللاعب التقييم بعد الإغلاق حالياً. أخبرني إذا تبيني أضيفها.</p>';
        openModal({ title: 'تقييم الرضا', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'البحث الشامل داخل كل التذاكر السابقة',
      keywords: 'بحث شامل تذاكر',
      run: async () => {
        const tickets = await loadTickets();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">بحث</span><input class="admin-input" id="sr-q" /></div><div id="sr-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'بحث بالتذاكر', bodyEl: body, size: 'xl' });
        body.querySelector('#sr-q').addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          const rows = q ? tickets.filter((t) => (t.text || '').toLowerCase().includes(q) || (t.username || '').toLowerCase().includes(q)) : [];
          body.querySelector('#sr-result').innerHTML = rows.length ? `<table class="admin-table"><tbody>${rows.map(ticketRow).join('')}</tbody></table>` : '<p class="admin-field__hint">اكتب للبحث</p>';
        });
      }
    },
    {
      title: 'تصدير كل التذاكر كسجل شهري',
      keywords: 'تصدير تذاكر سجل شهري',
      run: async () => {
        const tickets = await loadTickets();
        csvDownload('tickets.csv', [['اليوزر', 'النوع', 'النص', 'الحالة', 'الأولوية', 'تاريخ الإنشاء'], ...tickets.map((t) => [t.username, t.type, t.text, t.status || 'مفتوحة', t.priority || 'عادي', fmtDate(t.createdAt)])]);
        AdminToast.success(`تم تصدير ${tickets.length} تذكرة`);
      }
    }
  ]
});
