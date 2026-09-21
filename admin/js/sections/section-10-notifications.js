// ==================== القسم 10 — الرسائل والإشعارات الجماعية ====================
// كل الإرسال الفعلي عبر notifications/{uid}/items (type: adminMessage) —
// نفس القناة الحقيقية المعروضة الآن بلوحة إشعارات المستخدم بالموقع الرئيسي.
import { AdminFB } from '../core/firebase.js';
import { AdminAuth } from '../core/auth.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { resolveUidByUsername, levelsKey } from '../core/players.js';

const fb = AdminFB;

async function sendToUids(uids, payload, campaignLabel) {
  const limitSnap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'notificationLimits'));
  const maxPerDay = limitSnap.exists() ? limitSnap.data().maxPerDay : null;
  let sent = 0, skipped = 0;
  for (const uid of uids) {
    if (maxPerDay) {
      const since = Date.now() - 86400000;
      const todaySnap = await fb.getDocs(fb.query(fb.collection(fb.db, 'notifications', uid, 'items')));
      const todayCount = todaySnap.docs.filter((d) => (d.data().createdAt && d.data().createdAt.toMillis ? d.data().createdAt.toMillis() : 0) >= since).length;
      if (todayCount >= maxPerDay) { skipped++; continue; }
    }
    await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', read: false, createdAt: fb.serverTimestamp(), ...payload });
    sent++;
  }
  await fb.setDoc(fb.doc(fb.collection(fb.db, 'broadcastCampaigns')), { label: campaignLabel, payload, recipientCount: sent, skippedCount: skipped, sentAt: fb.serverTimestamp() });
  return { sent, skipped };
}

defineSection({
  id: 10,
  title: 'الرسائل والإشعارات الجماعية',
  description: 'إرسال حقيقي عبر notifications — نفس القناة المعروضة لكل مستخدم بالموقع الرئيسي.',
  tools: [
    {
      title: 'إرسال إشعار لكل المستخدمين دفعة واحدة',
      keywords: 'اشعار جماعي كل المستخدمين',
      run: () => {
        openFormModal({
          title: 'إشعار لكل المستخدمين', size: 'md',
          fields: [{ key: 'message', label: 'نص الإشعار', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
            const uids = snap.docs.map((d) => d.id);
            const { sent, skipped } = await sendToUids(uids, { message: v.message, fromLabel: 'إدارة المنصة' }, 'بث لكل المستخدمين');
            await AdminAudit.log({ section: 10, sectionTitle: 'الرسائل والإشعارات', actionKey: 'notif.broadcastAll', actionLabel: 'إشعار لكل المستخدمين', after: { sent, skipped } });
            AdminToast.success(`تم الإرسال لـ${sent} (تخطّي ${skipped} بسبب الحد اليومي)`);
          }
        });
      }
    },
    {
      title: 'إرسال إشعار لفئة محددة (حسب اللفل/النشاط/نوع الحساب)',
      keywords: 'اشعار فئة محددة لفل',
      run: () => {
        openFormModal({
          title: 'إشعار لفئة محددة', size: 'md',
          fields: [
            { key: 'minLevel', label: 'أقل لفل (اختياري)', type: 'number' },
            { key: 'provider', label: 'نوع الحساب', type: 'select', options: [{ value: '', label: 'الكل' }, { value: 'password', label: 'إيميل/كلمة مرور' }, { value: 'google.com', label: 'Google' }] },
            { key: 'message', label: 'نص الإشعار', type: 'textarea', required: true }
          ],
          onSubmit: async (v) => {
            // اللفل مو على users — هو على levels/{key}. كان الفلتر يقارن
            // u.level (حقل غير موجود) فيطلع 0 للجميع، فإما يرسل للكل أو
            // ما يرسل لأحد حسب الرقم المكتوب. نضم levels على users بالمفتاح.
            const [snap, lvSnap] = await Promise.all([
              fb.getDocs(fb.collection(fb.db, 'users')),
              fb.getDocs(fb.collection(fb.db, 'levels'))
            ]);
            const lvByKey = new Map(lvSnap.docs.map((d) => [d.id, d.data()]));
            const uids = snap.docs.filter((d) => {
              const u = d.data();
              if (v.minLevel) {
                const lv = lvByKey.get(levelsKey(u.username)) || {};
                if ((Number(lv.level) || 1) < Number(v.minLevel)) return false;
              }
              if (v.provider && u.provider !== v.provider) return false;
              return true;
            }).map((d) => d.id);
            const { sent, skipped } = await sendToUids(uids, { message: v.message, fromLabel: 'إدارة المنصة' }, 'بث لفئة محددة');
            AdminToast.success(`تم الإرسال لـ${sent} (تخطّي ${skipped})`);
          }
        });
      }
    },
    {
      title: 'إرسال رسالة للاعب واحد بالاسم',
      keywords: 'رسالة لاعب واحد اسم',
      run: () => {
        openFormModal({
          title: 'رسالة للاعب واحد',
          fields: [{ key: 'username', label: 'اسم المستخدم', required: true }, { key: 'message', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            await sendToUids([uid], { message: v.message, fromLabel: 'إدارة المنصة' }, `رسالة فردية: ${v.username}`);
            AdminToast.success('تم الإرسال');
          }
        });
      }
    },
    {
      title: 'إرسال لكل ستريمرز فئة معيّنة فقط',
      keywords: 'اشعار ستريمرز فئة منصة',
      run: () => {
        openFormModal({
          title: 'إشعار للستريمرز حسب المنصة',
          fields: [
            { key: 'platform', label: 'المنصة', type: 'select', options: [{ value: 'tiktok', label: 'تيك توك' }, { value: 'twitch', label: 'تويتش' }, { value: 'kick', label: 'كيك' }, { value: 'youtube', label: 'يوتيوب' }] },
            { key: 'message', label: 'النص', type: 'textarea', required: true }
          ],
          onSubmit: async (v) => {
            const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
            const uids = [...new Set(snap.docs.map((d) => d.data()).filter((e) => e.type === 'streamer_launch' && e.platform === v.platform && e.uid).map((e) => e.uid))];
            const { sent, skipped } = await sendToUids(uids, { message: v.message, fromLabel: 'إدارة المنصة' }, `ستريمرز ${v.platform}`);
            AdminToast.success(`تم الإرسال لـ${sent} (تخطّي ${skipped})`);
          }
        });
      }
    },
    {
      title: 'جدولة إشعار ليُرسَل تلقائياً بوقت مستقبلي',
      keywords: 'جدولة اشعار مستقبلي',
      run: () => {
        openFormModal({
          title: 'جدولة إشعار',
          fields: [{ key: 'message', label: 'النص', type: 'textarea', required: true }, { key: 'sendAt', label: 'وقت الإرسال', type: 'date', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'scheduledNotifications')), { message: v.message, sendAt: new Date(v.sendAt), sent: false, createdAt: fb.serverTimestamp() });
            AdminToast.success('تم الجدولة — يُرسَل فعلياً بمجرد فتح لوحة الإدارة بعد موعده (لا يوجد مُشغّل خلفي مستقل بدون Cloud Functions) عبر أداة "تحقق وأرسل المستحق"');
          }
        });
      }
    },
    {
      title: 'إنشاء قالب إشعار قابل لإعادة الاستخدام',
      keywords: 'قالب اشعار اعادة استخدام',
      run: () => {
        openFormModal({
          title: 'قالب إشعار جديد',
          fields: [{ key: 'title', label: 'اسم القالب', required: true }, { key: 'message', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifTemplates')), v);
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'معاينة شكل الإشعار قبل الإرسال',
      keywords: 'معاينة اشعار قبل ارسال',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<textarea class="admin-input" id="pv-text" rows="3" placeholder="اكتب النص هنا"></textarea><div id="pv-box" style="margin-top:14px;background:var(--bg-panel-alt);border:1px solid var(--border);border-radius:10px;padding:14px;"></div>`;
        openModal({ title: 'معاينة الإشعار', bodyEl: body, size: 'sm' });
        function draw() { body.querySelector('#pv-box').innerHTML = `<strong>إدارة المنصة</strong><p style="margin:6px 0 0;">${body.querySelector('#pv-text').value || '—'}</p>`; }
        body.querySelector('#pv-text').addEventListener('input', draw);
        draw();
      }
    },
    {
      title: 'إلغاء إشعار مجدول لم يُرسَل بعد',
      keywords: 'الغاء اشعار مجدول',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'scheduledNotifications'), fb.where('sent', '==', false)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>النص</th><th>وقت الإرسال</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="النص">${(r.message || '').slice(0, 40)}</td><td data-label="الوقت">${fmtDate(r.sendAt)}</td><td><button class="admin-btn admin-btn--danger admin-btn--sm" data-cancel="${r.id}">إلغاء</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا إشعار مجدول بانتظار الإرسال</p>';
        openModal({ title: 'إشعارات مجدولة', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-cancel]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.deleteDoc(fb.doc(fb.db, 'scheduledNotifications', btn.getAttribute('data-cancel')));
          AdminToast.success('تم الإلغاء');
        }));
      }
    },
    {
      title: 'عرض معدل فتح/قراءة الإشعارات المرسلة',
      keywords: 'معدل فتح قراءة اشعارات',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'broadcastCampaigns'), fb.orderBy('sentAt', 'desc'), fb.limit(20)));
        const rows = snap.docs.map((d) => d.data());
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الحملة</th><th>عدد المستلمين</th><th>الوقت</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الحملة">${r.label}</td><td data-label="المستلمون">${fmtNum(r.recipientCount)}</td><td data-label="الوقت">${fmtDate(r.sentAt)}</td></tr>`).join('')}</tbody></table><p class="admin-field__hint">معدل القراءة الفعلي (read=true) يحتاج فحص كل مستلم على حدة — غير مجمَّع تلقائياً حالياً لتفادي قراءات مكلفة على حملات كبيرة.</p>` : '<p>ولا حملة مرسلة بعد</p>';
        openModal({ title: 'أداء الحملات', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'إرسال إشعار مرفق برابط أو صورة',
      keywords: 'اشعار رابط صورة مرفق',
      run: () => {
        openFormModal({
          title: 'إشعار مع رابط/صورة',
          fields: [
            { key: 'message', label: 'النص', type: 'textarea', required: true },
            { key: 'link', label: 'رابط (اختياري)' },
            { key: 'imageUrl', label: 'رابط صورة (اختياري)' },
            { key: 'username', label: 'اسم المستخدم المستهدف', required: true }
          ],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            await sendToUids([uid], { message: v.message, link: v.link || null, imageUrl: v.imageUrl || null, fromLabel: 'إدارة المنصة' }, 'إشعار مرفق');
            AdminToast.success('تم الإرسال');
          }
        });
      }
    },
    {
      title: 'استهداف إشعار حسب المنصة',
      keywords: 'استهداف اشعار منصة',
      meta: 'مطابق لأداة "إرسال لكل ستريمرز فئة معيّنة" أعلاه',
      run: () => AdminToast.info('استخدم أداة "إرسال لكل ستريمرز فئة معيّنة فقط" أعلاه — تفلتر فعلياً حسب المنصة (platform الحقيقي من playEvents)')
    },
    {
      title: 'سجل كامل لكل الإشعارات المرسلة تاريخياً',
      keywords: 'سجل اشعارات مرسلة تاريخيا',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'broadcastCampaigns'), fb.orderBy('sentAt', 'desc'), fb.limit(200)));
        const rows = snap.docs.map((d) => d.data());
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الحملة</th><th>النص</th><th>المستلمون</th><th>الوقت</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الحملة">${r.label}</td><td data-label="النص">${(r.payload && r.payload.message || '').slice(0, 40)}</td><td data-label="المستلمون">${r.recipientCount}</td><td data-label="الوقت">${fmtDate(r.sentAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل بعد</p>';
        openModal({ title: 'سجل الإشعارات المرسلة', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'إشعار طارئ يتجاوز إعدادات كتم الإشعارات',
      keywords: 'اشعار طارئ تجاوز كتم',
      meta: 'ما فيه نظام كتم إشعارات لدى المستخدم بالموقع الرئيسي حالياً — كل إشعار يصل فعلياً بأي حال',
      run: () => {
        openFormModal({
          title: 'إشعار طارئ لكل المستخدمين',
          fields: [{ key: 'message', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            const snap = await fb.getDocs(fb.collection(fb.db, 'users'));
            const uids = snap.docs.map((d) => d.id);
            const { sent } = await sendToUids(uids, { message: v.message, fromLabel: 'تنبيه عاجل', urgent: true }, 'إشعار طارئ');
            await AdminAudit.log({ section: 10, sectionTitle: 'الرسائل والإشعارات', actionKey: 'notif.urgent', actionLabel: 'إشعار طارئ', after: { sent }, sensitive: true });
            AdminToast.success(`تم الإرسال لـ${sent}`);
          }
        });
      }
    },
    {
      title: 'اختبار إرسال لحسابي الشخصي فقط قبل الإرسال الجماعي',
      keywords: 'اختبار ارسال شخصي',
      run: () => {
        openFormModal({
          title: 'اختبار إرسال شخصي',
          fields: [{ key: 'message', label: 'النص', type: 'textarea', required: true }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', AdminAuth.currentAdmin.uid, 'items')), { type: 'adminMessage', message: v.message, fromLabel: '(اختبار)', read: false, createdAt: fb.serverTimestamp() });
            AdminToast.success('تم إرسال نسخة اختبارية لحسابك');
          }
        });
      }
    },
    {
      title: 'تحديد حد أقصى لعدد الإشعارات اليومية لكل مستخدم',
      keywords: 'حد اقصى اشعارات يومي',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'notificationLimits'));
        const cur = snap.exists() ? snap.data() : {};
        openFormModal({
          title: 'الحد اليومي للإشعارات',
          fields: [{ key: 'maxPerDay', label: 'أقصى عدد إشعارات باليوم لكل مستخدم (فارغ = بلا حد)', type: 'number', value: cur.maxPerDay || '' }],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'notificationLimits'), { maxPerDay: v.maxPerDay ? Number(v.maxPerDay) : null }, { merge: true });
            AdminToast.success('تم الحفظ — يُطبَّق فعلياً على كل حملات هذا القسم');
          }
        });
      }
    }
  ]
});
