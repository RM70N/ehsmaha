// ==================== القسم 19 — إدارة الفعاليات الخاصة ====================
// "جسر المصير" مبني فعلياً على Realtime Database (bridgeEvents/*) — نستخدم
// نفس القاعدة والمسارات الحقيقية اللي يستخدمها كود اللعبة نفسه بالضبط.
// إعدادات جسر المصير المتقدّمة بالتفصيل بقسم 34 المخصَّص لها.
import { AdminFB } from '../core/firebase.js';
import { AdminAuth } from '../core/auth.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, csvDownload } from '../core/format.js';

const fb = AdminFB;
const rtdbReady = () => !!fb.rtdb;

async function getCurrentBridge() {
  if (!rtdbReady()) return null;
  const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'));
  return snap.exists() ? snap.val() : null;
}

defineSection({
  id: 19,
  title: 'الفعاليات الخاصة',
  description: 'جسر المصير حقيقي عبر Realtime Database (bridgeEvents) — التفاصيل الكاملة بقسم 34.',
  tools: [
    {
      title: 'قائمة كل الفعاليات الخاصة المتاحة حالياً',
      keywords: 'قائمة فعاليات خاصة متاحة',
      run: async () => {
        const body = document.createElement('div');
        if (!rtdbReady()) { body.innerHTML = '<p>Realtime Database غير مهيَّأة بهذا المتصفح</p>'; openModal({ title: 'الفعاليات المتاحة', bodyEl: body, size: 'sm' }); return; }
        const current = await getCurrentBridge();
        body.innerHTML = `<p>جسر المصير: ${current ? `الحالة "${current.status}" (${current.eventId})` : 'ما فيه فعالية مفتوحة حالياً'}</p><p class="admin-field__hint">الأراضي البركانية ومصيرك تُدار كألعاب دائمة (أقسام 33/35/39) لا كفعالية موسمية مجدولة.</p>`;
        openModal({ title: 'الفعاليات الخاصة المتاحة', bodyEl: body, size: 'md' });
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
            { key: 'scheduledAt', label: 'تاريخ ووقت البدء', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'specialEvents')), { ...v, scheduledAt: new Date(v.scheduledAt), status: 'scheduled', interestedUids: [], createdAt: fb.serverTimestamp() });
            AdminToast.success('تم الجدولة');
          }
        });
      }
    },
    {
      title: 'عدد المسجَّلين/المهتمين بفعالية قادمة',
      keywords: 'عدد مسجلين مهتمين فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'specialEvents'), fb.where('status', '==', 'scheduled')));
        const body = document.createElement('div');
        body.innerHTML = snap.docs.length ? `<table class="admin-table"><tbody>${snap.docs.map((d) => `<tr><td class="is-primary" data-label="الفعالية">${d.data().name}</td><td data-label="المهتمون">${(d.data().interestedUids || []).length}</td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية مجدولة حالياً</p>';
        openModal({ title: 'اهتمام الفعاليات القادمة', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'بدء الفعالية يدوياً فوراً',
      keywords: 'بدء فعالية يدوي فورا',
      run: async () => {
        if (!rtdbReady()) { AdminToast.error('Realtime Database غير مهيَّأة'); return; }
        const current = await getCurrentBridge();
        if (current && current.status !== 'ended') { AdminToast.error('فيه فعالية جسر مصير مفتوحة أصلاً — أنهها أول من أداة "إيقاف فعالية"'); return; }
        openConfirm({
          title: 'فتح فعالية جسر المصير',
          message: 'يفتح فعالية جسر مصير جديدة بإعدادات افتراضية (30 جولة، 10 ثواني لكل جولة) — عدّل التفاصيل الكاملة من قسم 34 بعد الفتح.',
          onConfirm: async () => {
            const eventId = 'bridge_' + Date.now();
            const payload = { type: 'bridgeFate', status: 'lobby', title: 'جسر المصير', settings: { roundDuration: 10, maxRounds: 30, totalPlanks: 30, joinUntilRound: 3, allowLateJoin: true }, round: { no: 0, phase: 'idle', question: '', options: [], correctIndex: -1, startAtMs: 0 }, usedQids: [], globalFx: [], playerCount: 0, createdAt: fb.rtdbServerTimestamp(), createdByUid: AdminAuth.currentAdmin.uid, endedAt: null, winnerName: null, winnerKey: null };
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + eventId), payload);
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { eventId, status: 'lobby', updatedAt: fb.rtdbServerTimestamp() });
            await AdminAudit.log({ section: 19, sectionTitle: 'الفعاليات الخاصة', actionKey: 'events.start', actionLabel: 'بدء فعالية جسر المصير', targetType: 'bridgeEvent', targetId: eventId, sensitive: true });
            AdminToast.success('تم فتح الفعالية — أعدل الإعدادات التفصيلية من قسم 34');
          }
        });
      }
    },
    {
      title: 'إيقاف فعالية جارية عن بُعد عند مشكلة',
      keywords: 'ايقاف فعالية جارية',
      run: async () => {
        if (!rtdbReady()) { AdminToast.error('Realtime Database غير مهيَّأة'); return; }
        const current = await getCurrentBridge();
        if (!current || current.status === 'ended') { AdminToast.info('ولا فعالية جارية حالياً'); return; }
        openConfirm({
          title: 'إيقاف فعالية جسر المصير', danger: true,
          message: `إيقاف الفعالية الجارية (${current.eventId}) فوراً.`,
          onConfirm: async () => {
            await fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + current.eventId), { status: 'ended', endedAt: fb.rtdbServerTimestamp() });
            await fb.rtdbUpdate(fb.rtdbRef(fb.rtdb, 'bridgeEvents/current'), { status: 'ended' });
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
      run: () => AdminToast.info('راجع قسم 34 (فعالية جسر المصير) للإعدادات التفصيلية الكاملة')
    },
    {
      title: 'تعديل إعدادات فعالية "مصيرك"',
      keywords: 'تعديل اعدادات مصيرك',
      meta: 'التفاصيل الكاملة بقسم 35',
      run: () => AdminToast.info('راجع قسم 35 (لعبة مصيرك) للإعدادات التفصيلية')
    },
    {
      title: 'تعديل إعدادات فعالية "الأراضي البركانية"',
      keywords: 'تعديل اعدادات اراضي بركانية',
      meta: 'التفاصيل الكاملة بقسم 39',
      run: () => AdminToast.info('راجع قسم 39 (الأراضي البركانية) للإعدادات التفصيلية')
    },
    {
      title: 'عرض نتائج فعالية سابقة كاملة',
      keywords: 'نتائج فعالية سابقة',
      run: async () => {
        if (!rtdbReady()) { AdminToast.error('Realtime Database غير مهيَّأة'); return; }
        const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeEvents'));
        const all = snap.exists() ? snap.val() : {};
        const ended = Object.entries(all).filter(([k, v]) => k !== 'current' && v && v.status === 'ended');
        const body = document.createElement('div');
        body.innerHTML = ended.length ? `<table class="admin-table"><thead><tr><th>المعرّف</th><th>الفائز</th></tr></thead><tbody>${ended.map(([k, v]) => `<tr><td class="is-primary" data-label="المعرّف">${k}</td><td data-label="الفائز">${v.winnerName || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا فعالية منتهية بعد</p>';
        openModal({ title: 'فعاليات جسر مصير سابقة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تحديد الحد الأقصى للمشاركين في فعالية معيّنة',
      keywords: 'حد اقصى مشاركين فعالية',
      meta: 'يُضبَط ضمن إعدادات جسر المصير بقسم 34 (totalPlanks/maxRounds)',
      run: () => AdminToast.info('يُضبَط من قسم 34 عند فتح/تعديل الفعالية')
    },
    {
      title: 'إرسال دعوة/إشعار جماعي لفعالية قادمة',
      keywords: 'دعوة اشعار جماعي فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'specialEvents'), fb.where('status', '==', 'scheduled')));
        const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        openFormModal({
          title: 'دعوة جماعية لفعالية',
          fields: [{ key: 'eventId', label: 'الفعالية', type: 'select', options: events.map((e) => ({ value: e.id, label: e.name })), required: true }],
          onSubmit: async (v) => {
            const ev = events.find((e) => e.id === v.eventId);
            const usersSnap = await fb.getDocs(fb.collection(fb.db, 'users'));
            await Promise.all(usersSnap.docs.map((d) => fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', d.id, 'items')), { type: 'adminMessage', message: `فعالية قادمة: ${ev.name}!`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() })));
            AdminToast.success(`تم إرسال الدعوة لـ${usersSnap.size}`);
          }
        });
      }
    },
    {
      title: 'أرشفة فعالية منتهية مع كل بياناتها',
      keywords: 'ارشفة فعالية منتهية بيانات',
      run: async () => {
        if (!rtdbReady()) { AdminToast.error('Realtime Database غير مهيَّأة'); return; }
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">معرّف الفعالية (bridge_...)</span><input class="admin-input" id="ar-id" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="ar-go" style="margin-top:8px;">أرشفة الآن</button>`;
        const modal = openModal({ title: 'أرشفة فعالية', bodyEl: body, size: 'sm' });
        body.querySelector('#ar-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = body.querySelector('#ar-id').value.trim();
          const snap = await fb.rtdbGet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + id));
          if (!snap.exists()) { AdminToast.error('ما فيه فعالية بهذا المعرّف'); return; }
          await fb.setDoc(fb.doc(fb.db, 'specialEventsArchive', id), { data: snap.val(), archivedAt: fb.serverTimestamp() });
          AdminToast.success('تمت الأرشفة');
          modal.close();
        });
      }
    },
    {
      title: 'تكرار إعدادات فعالية ناجحة لإنشاء نسخة جديدة منها',
      keywords: 'تكرار اعدادات فعالية ناجحة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEventsArchive'));
        const archives = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        openFormModal({
          title: 'تكرار فعالية أرشيفية',
          fields: [{ key: 'archiveId', label: 'الفعالية الأرشيفية', type: 'select', options: archives.map((a) => ({ value: a.id, label: a.id })), required: true }],
          onSubmit: async (v) => {
            const a = archives.find((x) => x.id === v.archiveId);
            const newId = 'bridge_' + Date.now();
            await fb.rtdbSet(fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + newId), { ...a.data.data, status: 'lobby', round: { no: 0, phase: 'idle', question: '', options: [], correctIndex: -1, startAtMs: 0 }, playerCount: 0, endedAt: null, winnerName: null, createdAt: fb.rtdbServerTimestamp() });
            AdminToast.success(`تم إنشاء نسخة جديدة: ${newId} — فعّلها بأداة "بدء فعالية"`);
          }
        });
      }
    },
    {
      title: 'مراقبة الفعالية لحظياً أثناء تشغيلها',
      keywords: 'مراقبة فعالية لحظيا تشغيل',
      run: async () => {
        if (!rtdbReady()) { AdminToast.error('Realtime Database غير مهيَّأة'); return; }
        const current = await getCurrentBridge();
        if (!current) { AdminToast.info('ولا فعالية جارية حالياً'); return; }
        const body = document.createElement('div');
        body.textContent = 'جارٍ المراقبة...';
        let listenerRef = null;
        openModal({ title: 'مراقبة حية — ' + current.eventId, bodyEl: body, size: 'md', onClose: () => { if (listenerRef) fb.rtdbOff(listenerRef); } });
        listenerRef = fb.rtdbRef(fb.rtdb, 'bridgeEvents/' + current.eventId);
        fb.rtdbOnValue(listenerRef, (snap) => {
          const v = snap.val();
          if (!v) return;
          body.innerHTML = `<dl class="admin-kv"><dt>الحالة</dt><dd>${v.status}</dd><dt>الجولة</dt><dd>${v.round ? v.round.no : 0}</dd><dt>عدد اللاعبين</dt><dd>${v.playerCount || 0}</dd></dl>`;
        });
      }
    },
    {
      title: 'تصدير تقرير أداء الفعالية بعد انتهائها',
      keywords: 'تصدير تقرير اداء فعالية',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'specialEventsArchive'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data().data }));
        csvDownload('special-events.csv', [['المعرّف', 'الحالة', 'الفائز'], ...rows.map((r) => [r.id, r.status, r.winnerName])]);
        AdminToast.success(`تم تصدير ${rows.length} فعالية`);
      }
    }
  ]
});
