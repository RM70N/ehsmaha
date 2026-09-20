// ==================== القسم 12 — مراقبة المحتوى ====================
// نظام بلاغات جديد بالكامل contentReports (ما فيه نظام بلاغات لاعبين
// بالموقع الرئيسي حالياً) — البنية والأدوات جاهزة 100%، تمتلئ فوراً بمجرد
// إضافة زر "إبلاغ" بواجهة اللاعبين مستقبلاً. القائمة السوداء (11.12) فعّالة
// فعلياً الآن على التسجيل.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { resolveUidByUsername } from '../core/players.js';

const fb = AdminFB;

async function loadReports(statusFilter) {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'contentReports'), fb.orderBy('createdAt', 'desc'), fb.limit(1000)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return statusFilter ? rows.filter((r) => (r.status || 'pending') === statusFilter) : rows;
}

defineSection({
  id: 12,
  title: 'مراقبة المحتوى',
  description: 'نظام بلاغات جديد (contentReports) جاهز بالكامل — يمتلئ فعلياً بمجرد إضافة زر "إبلاغ" لواجهة اللاعبين.',
  tools: [
    {
      title: 'قائمة الأسماء/الرسائل المبلّغ عنها من المستخدمين',
      keywords: 'بلاغات اسماء رسائل',
      run: async () => {
        const rows = await loadReports('pending');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>المُبلَّغ عنه</th><th>السبب</th><th>الوقت</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="المستخدم">${r.reportedUsername || '—'}</td><td data-label="السبب">${r.reason || '—'}</td><td data-label="الوقت">${fmtDate(r.createdAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بلاغ بانتظار المراجعة</p>';
        openModal({ title: 'البلاغات غير المراجَعة', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'مراجعة سريعة (موافقة/رفض) بضغطة واحدة',
      keywords: 'مراجعة سريعة موافقة رفض بلاغ',
      run: async () => {
        const rows = await loadReports('pending');
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = rows.length ? rows.map((r) => `
            <div class="admin-panel"><div class="admin-panel__head"><h3>${r.reportedUsername} — ${r.reason}</h3></div>
              <button class="admin-btn admin-btn--danger admin-btn--sm" data-act="${r.id}">تأكيد المخالفة</button>
              <button class="admin-btn admin-btn--ghost admin-btn--sm" data-dismiss="${r.id}">رفض البلاغ</button>
            </div>`).join('') : '<p>ولا بلاغ بانتظار المراجعة</p>';
          body.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const id = btn.getAttribute('data-act');
            await fb.updateDoc(fb.doc(fb.db, 'contentReports', id), { status: 'confirmed' });
            rows.splice(rows.findIndex((r) => r.id === id), 1);
            AdminToast.success('تم تأكيد المخالفة');
            draw();
          }));
          body.querySelectorAll('[data-dismiss]').forEach((btn) => btn.addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const id = btn.getAttribute('data-dismiss');
            await fb.updateDoc(fb.doc(fb.db, 'contentReports', id), { status: 'dismissed' });
            rows.splice(rows.findIndex((r) => r.id === id), 1);
            AdminToast.success('تم رفض البلاغ');
            draw();
          }));
        }
        draw();
        openModal({ title: 'مراجعة سريعة للبلاغات', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'قائمة كلمات محظورة قابلة للتعديل والإضافة',
      keywords: 'كلمات محظورة قائمة',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'contentBlacklist'));
        const words = (snap.exists() && snap.data().words) || [];
        const body = document.createElement('div');
        function draw() {
          body.innerHTML = `<div>${words.map((w, i) => `<span class="admin-badge admin-badge--pink" style="margin:3px;display:inline-block">${w} <button data-rm="${i}" style="border:none;background:none;color:inherit;cursor:pointer;">×</button></span>`).join('') || '<p>القائمة فاضية</p>'}</div>
          <div class="admin-form" style="margin-top:10px;"><input class="admin-input" id="cb-new" placeholder="كلمة جديدة" /><button class="admin-btn admin-btn--primary admin-btn--sm" id="cb-add" style="margin-top:6px;">إضافة</button></div>`;
          body.querySelectorAll('[data-rm]').forEach((btn) => btn.addEventListener('click', async () => {
            words.splice(Number(btn.getAttribute('data-rm')), 1);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'contentBlacklist'), { words }, { merge: true });
            draw();
          }));
          body.querySelector('#cb-add').addEventListener('click', async () => {
            const v = body.querySelector('#cb-new').value.trim();
            if (!v) return;
            words.push(v);
            await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'contentBlacklist'), { words }, { merge: true });
            draw();
          });
        }
        draw();
        openModal({ title: 'الكلمات المحظورة', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'فلترة تلقائية تمنع اسم مستخدم مخالف عند التسجيل',
      keywords: 'فلترة تلقائية اسم مستخدم مخالف',
      meta: 'مفعّلة فعلياً — نفس القائمة السوداء بقسم 11.12، تُفحص وقت كل تسجيل جديد',
      run: () => AdminToast.info('مفعّل فعلياً بالموقع الرئيسي — راجع/عدّل القائمة من قسم 11 (القائمة السوداء لأسماء المستخدمين)')
    },
    {
      title: 'سجل كل الأسماء التي غُيّرت لمخالفتها القواعد',
      keywords: 'سجل اسماء غيرت مخالفة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<p class="admin-field__hint">غيّر يوزر مخالف قسرياً — يُسجَّل تلقائياً بسجل التدقيق (قسم 16) كإجراء حسّاس، وهذا هو "السجل" الفعلي المطلوب.</p>
        <div class="admin-field"><span class="admin-field__label">اليوزر الحالي</span><input class="admin-input" id="rn-old" /></div>
        <div class="admin-field"><span class="admin-field__label">اليوزر الجديد</span><input class="admin-input" id="rn-new" /></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="rn-go" style="margin-top:8px;">تغيير قسري</button>`;
        const modal = openModal({ title: 'تغيير يوزر لمخالفة القواعد', bodyEl: body, size: 'sm' });
        body.querySelector('#rn-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const oldName = body.querySelector('#rn-old').value.trim();
          const newName = body.querySelector('#rn-new').value.trim();
          const uid = await resolveUidByUsername(oldName);
          if (!uid) { AdminToast.error('ما لقيت هذا المستخدم'); return; }
          const newLower = newName.toLowerCase();
          const takenSnap = await fb.getDoc(fb.doc(fb.db, 'usernames', newLower));
          if (takenSnap.exists()) { AdminToast.error('اليوزر الجديد مستخدم'); return; }
          await fb.deleteDoc(fb.doc(fb.db, 'usernames', oldName.toLowerCase()));
          await fb.setDoc(fb.doc(fb.db, 'usernames', newLower), { uid });
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { username: newName, usernameLower: newLower, usernameChangedAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 12, sectionTitle: 'مراقبة المحتوى', actionKey: 'moderation.forceRename', actionLabel: 'تغيير يوزر قسري لمخالفة القواعد', targetType: 'user', targetId: uid, before: { username: oldName }, after: { username: newName }, sensitive: true });
          AdminToast.success('تم التغيير');
          modal.close();
        });
      }
    },
    {
      title: 'حظر مؤقت من الدردشة لمستخدم مخالف',
      keywords: 'حظر مؤقت دردشة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="cm-user" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="cm-go" style="margin-top:8px;">تبديل حظر الدردشة</button>`;
        const modal = openModal({ title: 'حظر من الدردشة', bodyEl: body, size: 'sm' });
        body.querySelector('#cm-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = await resolveUidByUsername(body.querySelector('#cm-user').value);
          if (!uid) { AdminToast.error('ما لقيت هذا المستخدم'); return; }
          const snap = await fb.getDoc(fb.doc(fb.db, 'users', uid));
          const cur = snap.data().gameChatBlocked;
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { gameChatBlocked: !cur });
          await AdminAudit.log({ section: 12, sectionTitle: 'مراقبة المحتوى', actionKey: 'moderation.chatBlock', actionLabel: cur ? 'إلغاء حظر دردشة' : 'حظر مؤقت من الدردشة', targetType: 'user', targetId: uid, sensitive: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'مراجعة صور بروفايل/أفتار مبلّغ عنها',
      keywords: 'مراجعة صور بروفايل مبلغ عنها',
      run: async () => {
        const rows = (await loadReports()).filter((r) => r.targetType === 'avatar');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="المستخدم">${r.reportedUsername}</td><td data-label="الحالة">${r.status || 'pending'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بلاغ على صور بروفايل حالياً</p>';
        openModal({ title: 'بلاغات صور البروفايل', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'تصنيف شدة المخالفة (تحذير/تجميد/حظر)',
      keywords: 'تصنيف شدة مخالفة',
      run: async () => {
        const rows = await loadReports();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">البلاغ</span><select class="admin-input" id="sv-select">${rows.map((r) => `<option value="${r.id}">${r.reportedUsername} — ${r.reason}</option>`).join('')}</select></div>
        <div class="admin-field"><span class="admin-field__label">الشدة</span><select class="admin-input" id="sv-level"><option value="warning">تحذير</option><option value="freeze">تجميد</option><option value="ban">حظر</option></select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="sv-go" style="margin-top:8px;">حفظ</button>`;
        const modal = openModal({ title: 'تصنيف شدة المخالفة', bodyEl: body, size: 'sm' });
        body.querySelector('#sv-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'contentReports', body.querySelector('#sv-select').value), { severity: body.querySelector('#sv-level').value });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'إرسال تحذير تلقائي للمخالف قبل اتخاذ إجراء',
      keywords: 'تحذير تلقائي مخالف',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="wn-user" /></div><textarea class="admin-input" id="wn-text" rows="2" placeholder="نص التحذير"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="wn-go" style="margin-top:8px;">إرسال</button>`;
        const modal = openModal({ title: 'إرسال تحذير', bodyEl: body, size: 'sm' });
        body.querySelector('#wn-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = await resolveUidByUsername(body.querySelector('#wn-user').value);
          if (!uid) { AdminToast.error('ما لقيت هذا المستخدم'); return; }
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: 'تحذير: ' + body.querySelector('#wn-text').value, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 12, sectionTitle: 'مراقبة المحتوى', actionKey: 'moderation.warn', actionLabel: 'تحذير مخالف', targetType: 'user', targetId: uid });
          AdminToast.success('تم الإرسال');
          modal.close();
        });
      }
    },
    {
      title: 'سجل تاريخ مخالفات كل مستخدم مجتمعة',
      keywords: 'سجل مخالفات مستخدم',
      run: async () => {
        const rows = await loadReports();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="hist-user" /></div><div id="hist-result" style="margin-top:8px;"></div>`;
        openModal({ title: 'سجل مخالفات مستخدم', bodyEl: body, size: 'lg' });
        body.querySelector('#hist-user').addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          const filtered = rows.filter((r) => (r.reportedUsername || '').toLowerCase() === q);
          body.querySelector('#hist-result').innerHTML = filtered.length ? `<table class="admin-table"><tbody>${filtered.map((r) => `<tr><td data-label="السبب">${r.reason}</td><td data-label="الحالة">${r.status || 'pending'}</td><td data-label="الوقت">${fmtDate(r.createdAt)}</td></tr>`).join('')}</tbody></table>` : '<p class="admin-field__hint">اكتب اسم مستخدم مطابق</p>';
        });
      }
    },
    {
      title: 'استثناء مستخدمين موثوقين من الفلترة التلقائية',
      keywords: 'استثناء موثوقين فلترة',
      run: async () => {
        const snap = await fb.getDoc(fb.doc(fb.db, 'siteFlags', 'trustedUsers'));
        const list = (snap.exists() && snap.data().usernames) || [];
        const body = document.createElement('div');
        body.innerHTML = `<p>${list.join('، ') || 'ولا مستخدم مستثنى بعد'}</p><div class="admin-field" style="margin-top:8px;"><span class="admin-field__label">إضافة يوزر</span><input class="admin-input" id="tr-add" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="tr-go" style="margin-top:8px;">إضافة</button>`;
        const modal = openModal({ title: 'مستخدمون مستثنون', bodyEl: body, size: 'sm' });
        body.querySelector('#tr-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          list.push(body.querySelector('#tr-add').value.trim().toLowerCase());
          await fb.setDoc(fb.doc(fb.db, 'siteFlags', 'trustedUsers'), { usernames: list }, { merge: true });
          AdminToast.success('تم');
          modal.close();
        });
      }
    },
    {
      title: 'تقرير أكثر أنواع المخالفات تكراراً',
      keywords: 'تقرير اكثر مخالفات تكرارا',
      run: async () => {
        const rows = await loadReports();
        const counts = new Map();
        rows.forEach((r) => counts.set(r.reason || 'غير محدد', (counts.get(r.reason || 'غير محدد') || 0) + 1));
        const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        const body = document.createElement('div');
        body.innerHTML = sorted.length ? `<table class="admin-table"><tbody>${sorted.map(([r, c]) => `<tr><td class="is-primary" data-label="السبب">${r}</td><td data-label="العدد">${c}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بلاغات بعد</p>';
        openModal({ title: 'أكثر أنواع المخالفات', bodyEl: body, size: 'md' });
      }
    },
    {
      title: 'مراجعة محتوى مولّد بالذكاء الاصطناعي قبل النشر',
      keywords: 'مراجعة محتوى ذكاء اصطناعي',
      meta: 'أداة المراجعة الكاملة بقسم 13 (اصنع لعبتك)',
      run: () => AdminToast.info('راجع قسم 13 (اصنع لعبتك) — فيه أداة معاينة/موافقة/رفض كاملة')
    },
    {
      title: 'أرشفة البلاغات المحلولة',
      keywords: 'ارشفة بلاغات محلولة',
      run: async () => {
        const rows = (await loadReports()).filter((r) => r.status === 'confirmed' || r.status === 'dismissed');
        if (!rows.length) { AdminToast.info('ولا بلاغ محلول بانتظار الأرشفة'); return; }
        openConfirm({
          title: 'أرشفة البلاغات المحلولة', message: `أرشفة ${rows.length} بلاغ محلول.`,
          onConfirm: async () => { await Promise.all(rows.map((r) => fb.updateDoc(fb.doc(fb.db, 'contentReports', r.id), { status: 'archived' }))); AdminToast.success('تم'); }
        });
      }
    },
    {
      title: 'تصدير سجل المخالفات الشهري',
      keywords: 'تصدير سجل مخالفات شهري',
      run: async () => {
        const rows = await loadReports();
        csvDownload('moderation-log.csv', [['المستخدم', 'السبب', 'الحالة', 'الوقت'], ...rows.map((r) => [r.reportedUsername, r.reason, r.status || 'pending', fmtDate(r.createdAt)])]);
        AdminToast.success(`تم تصدير ${rows.length} بلاغ`);
      }
    }
  ]
});
