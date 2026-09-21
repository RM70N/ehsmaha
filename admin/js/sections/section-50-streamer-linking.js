// ==================== القسم 50 — ربط حسابات الستريمر ====================
// هذا عن ربط حساب البث نفسه (تيك توك) بسيرفر الجسر الحي للشات —
// bridgeStreamers/{uniqueId} = { enabled, uid, updatedAt } — نفس المستند
// اللي يفحصه tiktok-server/server.js قبل قبول أي اتصال (تعطيل هنا = رفض
// فوري على مستوى السيرفر، لا مجرد إخفاء بالواجهة). ربط حساب اللاعبين
// (لا الستريمرز) بتيك توك موجود بقسم 53 منفصل.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, csvDownload } from '../core/format.js';

const fb = AdminFB;

async function loadAll() {
  const snap = await fb.getDocs(fb.collection(fb.db, 'bridgeStreamers'));
  return snap.docs.map((d) => ({ uniqueId: d.id, ...d.data() }));
}

defineSection({
  id: 50,
  title: 'ربط حسابات الستريمر',
  description: 'ربط حساب البث (تيك توك) بسيرفر الجسر — bridgeStreamers/{uniqueId}.enabled كولكشن حقيقي 100%، تعطيله يرفض اتصال ذلك اليوزر من السيرفر مباشرة.',
  tools: [
    {
      title: 'عرض كل حسابات الستريمرز المربوطة بسيرفر الجسر',
      keywords: 'عرض حسابات ستريمرز مربوطة',
      run: async () => {
        const rows = await loadAll();
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>يوزرنيم تيك توك</th><th>الحالة</th><th>آخر تحديث</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزرنيم">@${r.uniqueId}</td><td data-label="الحالة"><span class="admin-badge ${r.enabled !== false ? 'admin-badge--on' : 'admin-badge--off'}">${r.enabled !== false ? 'مفعّل' : 'معطّل'}</span></td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا ستريمر ربط حسابه بعد</p>';
        openModal({ title: 'حسابات الستريمرز المربوطة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'تعطيل ربط حساب ستريمر معيّن فوراً (رفض من السيرفر)',
      keywords: 'تعطيل ربط حساب ستريمر رفض سيرفر',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم تيك توك (بدون @)</span><input class="admin-input" id="bs-username" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="bs-disable-go" style="margin-top:8px;">تعطيل الآن</button>';
        const modal = openModal({ title: 'تعطيل ربط ستريمر', bodyEl: body, size: 'sm' });
        body.querySelector('#bs-disable-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = body.querySelector('#bs-username').value.trim().replace(/^@/, '').toLowerCase();
          if (!uid) return;
          await fb.setDoc(fb.doc(fb.db, 'bridgeStreamers', uid), { enabled: false, updatedAt: fb.serverTimestamp() }, { merge: true });
          await AdminAudit.log({ section: 50, sectionTitle: 'ربط حسابات الستريمر', actionKey: 'streamerLink.disable', actionLabel: 'تعطيل ربط ستريمر', targetType: 'bridgeStreamer', targetId: uid, sensitive: true });
          AdminToast.success('تم التعطيل — السيرفر يرفض اتصال هذا اليوزر الآن');
          modal.close();
        });
      }
    },
    {
      title: 'إعادة تفعيل ربط حساب ستريمر معطَّل',
      keywords: 'اعادة تفعيل ربط ستريمر معطل',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم تيك توك (بدون @)</span><input class="admin-input" id="bs-username-en" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="bs-enable-go" style="margin-top:8px;">تفعيل الآن</button>';
        const modal = openModal({ title: 'إعادة تفعيل ربط ستريمر', bodyEl: body, size: 'sm' });
        body.querySelector('#bs-enable-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = body.querySelector('#bs-username-en').value.trim().replace(/^@/, '').toLowerCase();
          if (!uid) return;
          await fb.setDoc(fb.doc(fb.db, 'bridgeStreamers', uid), { enabled: true, updatedAt: fb.serverTimestamp() }, { merge: true });
          await AdminAudit.log({ section: 50, sectionTitle: 'ربط حسابات الستريمر', actionKey: 'streamerLink.enable', actionLabel: 'إعادة تفعيل ربط ستريمر', targetType: 'bridgeStreamer', targetId: uid });
          AdminToast.success('تم التفعيل');
          modal.close();
        });
      }
    },
    {
      title: 'عرض كل الحسابات المعطَّلة حالياً',
      keywords: 'عرض حسابات معطلة حالياً',
      run: async () => {
        const rows = (await loadAll()).filter((r) => r.enabled === false);
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزرنيم</th><th>آخر تحديث</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزرنيم">@${r.uniqueId}</td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا حساب معطَّل حالياً</p>';
        openModal({ title: 'الحسابات المعطَّلة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'حذف ربط حساب ستريمر نهائياً من السجل',
      keywords: 'حذف ربط ستريمر نهائي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم تيك توك (بدون @)</span><input class="admin-input" id="bs-del-username" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="bs-del-go" style="margin-top:8px;">حذف نهائياً</button>';
        const modal = openModal({ title: 'حذف ربط ستريمر', bodyEl: body, size: 'sm' });
        body.querySelector('#bs-del-go').addEventListener('click', () => {
          const uid = body.querySelector('#bs-del-username').value.trim().replace(/^@/, '').toLowerCase();
          if (!uid) return;
          openConfirm({
            title: 'حذف ربط نهائياً', danger: true,
            message: `سيُحذف مستند ربط @${uid} نهائياً — الستريمر يقدر يربط من جديد بأي وقت.`,
            onConfirm: async () => {
              if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
              await fb.deleteDoc(fb.doc(fb.db, 'bridgeStreamers', uid));
              await AdminAudit.log({ section: 50, sectionTitle: 'ربط حسابات الستريمر', actionKey: 'streamerLink.delete', actionLabel: 'حذف ربط ستريمر نهائياً', targetType: 'bridgeStreamer', targetId: uid, sensitive: true });
              AdminToast.success('تم الحذف');
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'تصدير كل حسابات الستريمرز المربوطة',
      keywords: 'تصدير حسابات ستريمرز مربوطة',
      run: async () => {
        const rows = await loadAll();
        csvDownload('bridge-streamers.csv', [['اليوزرنيم', 'الحالة', 'آخر تحديث'], ...rows.map((r) => [r.uniqueId, r.enabled !== false ? 'مفعّل' : 'معطّل', fmtDate(r.updatedAt)])]);
        AdminToast.success(`تم تصدير ${rows.length} حساب`);
      }
    }
  ]
});
