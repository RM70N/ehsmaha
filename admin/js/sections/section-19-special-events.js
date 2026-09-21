// ==================== القسم 19 — إدارة الفعاليات الخاصة ====================
// تصحيح مهم (مُراجَع من كود الموقع الحقيقي نفسه): "جسر المصير" يخزّن بيانات
// فعاليته الحية بـRealtime Database لا Firestore — المسارات الفعلية:
//   bridgeEvents/current        = { eventId, status }
//   bridgeEvents/{eventId}      = { type, status, title, startedAt, endedAt, winnerName, settings... }
//   bridgePlayers/{eventId}/... = كل متصفح مشارك
// كانت هذي الأدوات تكتب/تقرأ نفس الأسماء لكن على Firestore، فكانت تفشل
// بصمت (المسار غير موجود أصلاً بفَيرستور، والقواعد ترفضه الآن بعد تنظيفها).
// الإعدادات التفصيلية الكاملة لجسر المصير بقسم 34.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, csvDownload } from '../core/format.js';

const fb = AdminFB;

async function rtdbGetVal(path) {
  const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, path));
  return snap.exists() ? snap.val() : null;
}
async function getCurrentBridge() {
  const v = await rtdbGetVal('bridgeEvents/current');
  return v && v.eventId ? v : null;
}
// كل الفعاليات المخزَّنة (عقدة bridgeEvents كاملة عدا مؤشر current) — عددها
// بالعادة قليل جداً (فعالية أو اثنتين بالشهر) فقراءتها دفعة وحدة آمنة.
async function getAllBridgeEvents() {
  const all = await rtdbGetVal('bridgeEvents');
  if (!all || typeof all !== 'object') return [];
  return Object.entries(all)
    .filter(([id, v]) => id !== 'current' && v && typeof v === 'object')
    .map(([id, v]) => ({ id, ...v }));
}

defineSection({
  id: 19,
  title: 'الفعاليات الخاصة',
  description: 'جسر المصير حقيقي عبر Realtime Database (bridgeEvents/bridgePlayers) — الإعدادات التفصيلية بقسم 34. الفعاليات المجدولة العامة بـspecialEvents.',
  tools: [
    {
      title: 'قائمة كل الفعاليات الخاصة المتاحة حالياً',
      keywords: 'قائمة فعاليات خاصة متاحة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'الفعاليات الخاصة المتاحة', bodyEl: body, size: 'md' });
        const current = await getCurrentBridge();
        const ev = current ? await rtdbGetVal('bridgeEvents/' + current.eventId) : null;
        body.innerHTML = `
          <dl class="admin-kv">
            <dt>جسر المصير</dt>
            <dd>${current ? `<span class="admin-badge admin-badge--on">${(ev && ev.status) || current.status}</span> — ${current.eventId}` : 'ما فيه فعالية مفتوحة حالياً'}</dd>
          </dl>
          <p class="admin-field__hint">"الأراضي البركانية" (قسم 39) لعبة دائمة لا فعالية موسمية. الفعاليات المجدولة العامة تُدار بأدوات هذا القسم أدناه (specialEvents).</p>`;
      }
    },
    {
      title: 'جدولة فعالية جديدة بتاريخ ووقت بدء محدد',
      keywords: 'جدولة فعالية جديدة تاريخ',
      run: () => {
        openFormModal({
          title: 'جدولة فعالية',
          fields: [
            { key: 'name', label: 'اسم الفعالية', required: true },
            { key: 'scheduledAt', label: 'تاريخ ووقت البدء', type: 'datetime-local', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'specialEvents')), { name: v.name, scheduledAt: new Date(v.scheduledAt), status: 'scheduled', interestedUids: [], createdAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.schedule', actionLabel: 'جدولة فعالية جديدة', targetLabel: v.name });
            AdminToast.success('تم الجدولة');
          }
        });
      }
    },
    {
      title: 'عدد المسجَّلين/المهتمين بفعالية قادمة',
      keywords: 'عدد مسجلين مهتمين فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEvents'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'scheduled');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الفعالية</th><th>المهتمون</th><th>موعد البدء</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الفعالية">${r.name}</td><td data-label="المهتمون">${(r.interestedUids || []).length}</td><td data-label="الموعد">${fmtDate(r.scheduledAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية مجدولة حالياً</p>';
        openModal({ title: 'اهتمام الفعاليات القادمة', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'بدء فعالية جسر المصير يدوياً فوراً',
      keywords: 'بدء فعالية يدوي فورا جسر',
      run: async () => {
        const current = await getCurrentBridge();
        if (current) { AdminToast.error('فيه فعالية جسر مصير مفتوحة أصلاً — أنهها أول من أداة "إيقاف فعالية"'); return; }
        openConfirm({
          title: 'فتح فعالية جسر المصير',
          message: 'يفتح فعالية جسر مصير جديدة بإعدادات افتراضية — عادةً تُفتح من الموقع الرئيسي مباشرة، استخدم هذا لو الفتح الطبيعي تعطّل.',
          onConfirm: async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const eventId = 'bridge_' + Date.now();
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + eventId), {
              type: 'bridgeFate', status: 'lobby', title: 'جسر المصير',
              createdAt: fb.rtdbServerTimestamp(), createdBy: 'admin-panel',
              endedAt: null, winnerName: null
            });
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId, status: 'lobby' });
            await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.start', actionLabel: 'بدء فعالية جسر المصير', targetType: 'bridgeEvent', targetId: eventId, sensitive: true });
            AdminToast.success('تم فتح الفعالية — التفاصيل والمشاركون بقسم 34');
          }
        });
      }
    },
    {
      title: 'إيقاف فعالية جارية عن بُعد عند مشكلة',
      keywords: 'ايقاف فعالية جارية',
      run: async () => {
        const current = await getCurrentBridge();
        if (!current) { AdminToast.info('ولا فعالية جارية حالياً'); return; }
        openConfirm({
          title: 'إيقاف فعالية جسر المصير', danger: true,
          message: `إيقاف الفعالية الجارية (${current.eventId}) فوراً لكل المشاركين.`,
          onConfirm: async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            await fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + current.eventId), { status: 'ended', endedAt: fb.rtdbServerTimestamp(), endedBy: 'admin-panel' });
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId: null, status: 'ended' });
            await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.stop', actionLabel: 'إيقاف فعالية جسر المصير', targetType: 'bridgeEvent', targetId: current.eventId, sensitive: true });
            AdminToast.success('تم الإيقاف');
          }
        });
      }
    },
    {
      title: 'تعديل إعدادات فعالية "جسر المصير"',
      keywords: 'تعديل اعدادات جسر المصير',
      meta: 'التفاصيل الكاملة بقسم 34',
      run: () => AdminToast.info('راجع قسم 34 (فعالية جسر المصير) — فيه الحالة الحية والمشاركون والطرد والإنهاء الطارئ')
    },
    {
      title: 'عرض نتائج فعالية سابقة كاملة',
      keywords: 'نتائج فعالية سابقة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'فعاليات جسر مصير سابقة', bodyEl: body, size: 'lg' });
        const all = await getAllBridgeEvents();
        const ended = all.filter((e) => e.status === 'ended');
        body.innerHTML = ended.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الفائز</th><th>انتهت</th></tr></thead><tbody>${ended.map((e) => `<tr><td class="is-primary" data-label="المعرّف">${e.id}</td><td data-label="الفائز">${e.winnerName || '—'}</td><td data-label="انتهت">${e.endedAt ? fmtDate(e.endedAt) : '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية منتهية بعد</p>';
      }
    },
    {
      title: 'عرض المشاركين بالفعالية الجارية',
      keywords: 'مشاركون فعالية جارية',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'مشاركو الفعالية الجارية', bodyEl: body, size: 'lg' });
        const current = await getCurrentBridge();
        if (!current) { body.innerHTML = '<p>ولا فعالية جارية حالياً</p>'; return; }
        const players = (await rtdbGetVal('bridgePlayers/' + current.eventId)) || {};
        const rows = Object.entries(players);
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الحالة</th><th>عدد لاعبيه</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td class="is-primary" data-label="المعرّف">${k}</td><td data-label="الحالة">${(v && v.status) || '—'}</td><td data-label="اللاعبون">${(v && v.playerCount) != null ? v.playerCount : '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا مشارك حالياً</p>';
      }
    },
    {
      title: 'إلغاء فعالية مجدولة قبل موعدها',
      keywords: 'الغاء فعالية مجدولة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEvents'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => r.status === 'scheduled');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الفعالية</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الفعالية">${r.name}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-cancel="${r.id}">إلغاء</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية مجدولة</p>';
        openModal({ title: 'إلغاء فعالية مجدولة', bodyEl: body, size: 'md' });
        body.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = btn.getAttribute('data-cancel');
          await fb.updateDoc(fb.doc(fb.db, 'specialEvents', id), { status: 'cancelled' });
          await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.cancel', actionLabel: 'إلغاء فعالية مجدولة', targetId: id });
          AdminToast.success('تم الإلغاء');
          btn.closest('tr').remove();
        }));
      }
    },
    {
      title: 'إرسال دعوة/إشعار جماعي لفعالية قادمة',
      keywords: 'دعوة اشعار جماعي فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEvents'));
        const events = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.status === 'scheduled');
        if (!events.length) { AdminToast.info('ولا فعالية مجدولة — أنشئ وحدة أول من أداة "جدولة فعالية جديدة"'); return; }
        openFormModal({
          title: 'دعوة جماعية لفعالية',
          fields: [{ key: 'eventId', label: 'الفعالية', type: 'select', options: events.map((e) => ({ value: e.id, label: e.name })), required: true }],
          onSubmit: async (v) => {
            const ev = events.find((e) => e.id === v.eventId);
            const usersSnap = await fb.getDocs(fb.collection(fb.db, 'users'));
            await Promise.all(usersSnap.docs.map((d) => fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', d.id, 'items')), { type: 'adminMessage', message: `فعالية قادمة: ${ev.name}!`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() })));
            await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.invite', actionLabel: 'دعوة جماعية لفعالية', targetLabel: ev.name, sensitive: true });
            AdminToast.success(`تم إرسال الدعوة لـ${usersSnap.size}`);
          }
        });
      }
    },
    {
      title: 'أرشفة فعالية جسر مصير منتهية مع كل بياناتها',
      keywords: 'ارشفة فعالية منتهية بيانات',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أرشفة فعالية منتهية', bodyEl: body, size: 'lg' });
        const ended = (await getAllBridgeEvents()).filter((e) => e.status === 'ended');
        body.innerHTML = ended.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الفائز</th><th></th></tr></thead><tbody>${ended.map((e) => `<tr><td class="is-primary" data-label="المعرّف">${e.id}</td><td data-label="الفائز">${e.winnerName || '—'}</td><td><button class="admin-btn admin-btn--primary admin-btn--sm" data-arch="${e.id}">أرشفة</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية منتهية بعد</p>';
        body.querySelectorAll('[data-arch]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = btn.getAttribute('data-arch');
          const ev = ended.find((e) => e.id === id);
          const players = (await rtdbGetVal('bridgePlayers/' + id)) || {};
          const board = (await rtdbGetVal('bridgeBoard/' + id)) || null;
          await fb.setDoc(fb.doc(fb.db, 'specialEventsArchive', id), { data: ev, players, board, archivedAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.archive', actionLabel: 'أرشفة فعالية جسر مصير', targetId: id });
          AdminToast.success('تمت الأرشفة');
        }));
      }
    },
    {
      title: 'عرض الأرشيف الكامل للفعاليات المؤرشَفة',
      keywords: 'عرض ارشيف فعاليات مؤرشفة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEventsArchive'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الفائز</th><th>تاريخ الأرشفة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="المعرّف">${r.id}</td><td data-label="الفائز">${(r.data && r.data.winnerName) || '—'}</td><td data-label="الأرشفة">${fmtDate(r.archivedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية مؤرشَفة بعد</p>';
        openModal({ title: 'أرشيف الفعاليات', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'مراقبة الفعالية لحظياً أثناء تشغيلها',
      keywords: 'مراقبة فعالية لحظيا تشغيل',
      run: async () => {
        const current = await getCurrentBridge();
        if (!current) { AdminToast.info('ولا فعالية جارية حالياً'); return; }
        const body = document.createElement('div');
        body.textContent = 'جارٍ المراقبة...';
        let unsub = () => {};
        openModal({ title: 'مراقبة حية — ' + current.eventId, bodyEl: body, size: 'md', onClose: () => unsub() });
        unsub = fb.rtdbOnValue(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + current.eventId), (snap) => {
          const v = snap.val();
          if (!v) { body.innerHTML = '<p>الفعالية غير موجودة</p>'; return; }
          body.innerHTML = `<dl class="admin-kv"><dt>الحالة</dt><dd>${v.status || '—'}</dd><dt>العنوان</dt><dd>${v.title || '—'}</dd><dt>الفائز</dt><dd>${v.winnerName || '—'}</dd></dl>`;
        }, () => { body.innerHTML = '<p>تعذّر الاتصال بـRealtime Database</p>'; });
      }
    },
    {
      title: 'تصدير تقرير أداء الفعاليات المؤرشَفة',
      keywords: 'تصدير تقرير اداء فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEventsArchive'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data().data || {}) }));
        csvDownload('special-events.csv', [['المعرّف', 'الحالة', 'الفائز'], ...rows.map((r) => [r.id, r.status, r.winnerName])]);
        AdminToast.success(`تم تصدير ${rows.length} فعالية`);
      }
    }
  ]
});
