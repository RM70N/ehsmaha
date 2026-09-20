// ==================== القسم 2 — إدارة اللاعبين ====================
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, tsToMillis } from '../core/format.js';
import { resolveUidByUsername, getUserByUsername, searchUsersByPrefix, playerSearchBox } from '../core/players.js';

const fb = AdminFB;

function withPlayer(title, onFound) {
  const box = playerSearchBox({
    onSelect: async (row) => {
      const snap = await fb.getDoc(fb.doc(fb.db, 'users', row.uid));
      onFound(row.uid, snap.exists() ? snap.data() : row, box);
    }
  });
  openModal({ title, bodyEl: box, size: 'lg' });
  return box;
}

function appendResult(box, html) {
  let area = box.querySelector('#pl-detail-area');
  if (!area) {
    area = document.createElement('div');
    area.id = 'pl-detail-area';
    area.style.marginTop = '14px';
    box.appendChild(area);
  }
  area.innerHTML = html;
  return area;
}

defineSection({
  id: 2,
  title: 'إدارة اللاعبين',
  description: 'بحث، مراقبة، وتصرّف مباشر على أي حساب لاعب — كل تعديل يُسجَّل بسجل التدقيق.',
  tools: [
    {
      title: 'بحث فوري بالاسم/المعرّف',
      keywords: 'بحث لاعب يوزر uid',
      run: () => withPlayer('بحث عن لاعب', (uid, data, box) => {
        appendResult(box, `
          <dl class="admin-kv">
            <dt>اليوزر</dt><dd>${data.username || '—'}</dd>
            <dt>UID</dt><dd style="direction:ltr;">${uid}</dd>
            <dt>الإيميل</dt><dd>${data.email || '—'}</dd>
            <dt>تاريخ التسجيل</dt><dd>${fmtDate(data.createdAt)}</dd>
          </dl>`);
      })
    },
    {
      title: 'فلترة حسب الحالة (محظور/مجمّد)',
      keywords: 'فلترة حالة محظور مجمد',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'اللاعبون المحظورون/المجمَّدون حالياً', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const rows = snap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((r) => (r.banned && r.banned.value) || (r.frozenUntil && tsToMillis(r.frozenUntil) > Date.now()));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>الحالة</th><th>السبب/حتى</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.username}</td><td data-label="الحالة">${r.banned && r.banned.value ? 'محظور' : 'مجمَّد'}</td><td data-label="التفاصيل">${r.banned && r.banned.value ? (r.banned.reason || '—') : fmtDate(r.frozenUntil)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا حساب محظور أو مجمَّد حالياً</p>';
      }
    },
    {
      title: 'عرض بروفايل كامل',
      keywords: 'بروفايل كامل xp لفل',
      run: () => withPlayer('بروفايل اللاعب الكامل', (uid, data, box) => {
        appendResult(box, `
          <dl class="admin-kv">
            <dt>XP</dt><dd>${fmtNum(data.xp)}</dd>
            <dt>اللفل</dt><dd>${fmtNum(data.level)}</dd>
            <dt>النقاط</dt><dd>${fmtNum(data.points)}</dd>
            <dt>الإطارات المملوكة</dt><dd>${(data.ownedFrames || []).join('، ') || '—'}</dd>
            <dt>تاريخ التسجيل</dt><dd>${fmtDate(data.createdAt)}</dd>
            <dt>آخر تغيير يوزر</dt><dd>${fmtDate(data.usernameChangedAt)}</dd>
          </dl>`);
      })
    },
    {
      title: 'عرض اللعبة/الجلسة الحالية للاعب لحظياً',
      keywords: 'جلسة حالية لاعب لحظي',
      run: () => withPlayer('الجلسة الحالية للاعب', async (uid, data, box) => {
        const [presenceSnap, activeSnap] = await Promise.all([
          fb.getDoc(fb.doc(fb.db, 'presence', uid)),
          fb.getDocs(fb.query(fb.collection(fb.db, 'activeStreamers'), fb.where('uid', '==', uid)))
        ]);
        const active = activeSnap.docs.map((d) => d.data());
        appendResult(box, `
          <p>متصل الآن: ${presenceSnap.exists() ? 'نعم (آخر ظهور ' + fmtDate(presenceSnap.data().lastSeen) + ')' : 'لا'}</p>
          ${active.length ? `<p>يبث حالياً: ${active.map((a) => a.gameName).join('، ')}</p>` : '<p>ما يبث أي لعبة حالياً</p>'}
        `);
      })
    },
    {
      title: 'إرسال رسالة مباشرة للاعب',
      keywords: 'رسالة مباشرة اشعار لاعب',
      run: () => withPlayer('إرسال رسالة للاعب', (uid, data, box) => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="admin-field"><span class="admin-field__label">نص الرسالة</span><textarea class="admin-input" id="pl-msg-text" rows="3"></textarea></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="pl-msg-send" style="margin-top:8px;">إرسال</button>`;
        appendResult(box, '').appendChild(form);
        form.querySelector('#pl-msg-send').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const text = form.querySelector('#pl-msg-text').value.trim();
          if (!text) return;
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: text, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.message', actionLabel: 'رسالة مباشرة للاعب', targetType: 'user', targetId: uid, targetLabel: data.username, note: text });
          AdminToast.success('تم الإرسال');
        });
      })
    },
    {
      title: 'تجميد الحساب مؤقتاً',
      keywords: 'تجميد حساب مؤقت',
      run: () => withPlayer('تجميد حساب لاعب', (uid, data, box) => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="admin-field"><span class="admin-field__label">لعدد كم يوم</span><input class="admin-input" type="number" id="pl-freeze-days" value="3" min="1" /></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="pl-freeze-go" style="margin-top:8px;">تجميد الآن</button>`;
        appendResult(box, '').appendChild(form);
        form.querySelector('#pl-freeze-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const days = Number(form.querySelector('#pl-freeze-days').value);
          const until = new Date(Date.now() + days * 86400000);
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { frozenUntil: until });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.freeze', actionLabel: 'تجميد حساب مؤقتاً', targetType: 'user', targetId: uid, targetLabel: data.username, after: { days }, sensitive: true });
          AdminToast.success('تم التجميد');
        });
      })
    },
    {
      title: 'طرد اللاعب من الجلسة الحالية فوراً',
      keywords: 'طرد جلسة حالية',
      run: () => withPlayer('طرد من الجلسة الحالية', (uid, data, box) => {
        appendResult(box, '<p>هذا يسجّل خروج اللاعب فوراً من كل أجهزته النشطة (ينهي أي جلسة لعب مفتوحة تلقائياً).</p><button class="admin-btn admin-btn--danger" id="pl-kick-go">طرد الآن</button>')
          .querySelector('#pl-kick-go').addEventListener('click', async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            const sessSnap = await fb.getDoc(fb.doc(fb.db, 'deviceSessions', uid));
            const ids = new Set();
            if (sessSnap.exists()) {
              const sd = sessSnap.data();
              [sd.current, ...(sd.history || [])].filter(Boolean).forEach((e) => ids.add(e.deviceId));
            }
            await fb.setDoc(fb.doc(fb.db, 'deviceSessions', uid), { forceLogoutDeviceIds: [...ids] }, { merge: true });
            await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.kick', actionLabel: 'طرد من الجلسة الحالية', targetType: 'user', targetId: uid, targetLabel: data.username, sensitive: true });
            AdminToast.success('تم الطرد');
          });
      })
    },
    {
      title: 'حظر دائم مع سبب مسجَّل',
      keywords: 'حظر دائم سبب',
      run: () => withPlayer('حظر دائم', (uid, data, box) => {
        const form = document.createElement('div');
        form.innerHTML = `<div class="admin-field"><span class="admin-field__label">السبب</span><textarea class="admin-input" id="pl-ban-reason" rows="3"></textarea></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="pl-ban-go" style="margin-top:8px;">حظر نهائي</button>`;
        appendResult(box, '').appendChild(form);
        form.querySelector('#pl-ban-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const reason = form.querySelector('#pl-ban-reason').value.trim();
          if (!reason) { AdminToast.error('اكتب السبب أول'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { banned: { value: true, reason, ts: Date.now() } });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.ban', actionLabel: 'حظر دائم', targetType: 'user', targetId: uid, targetLabel: data.username, note: reason, sensitive: true });
          AdminToast.success('تم الحظر');
        });
      })
    },
    {
      title: 'حذف الحساب نهائياً',
      keywords: 'حذف حساب نهائي',
      run: () => withPlayer('حذف حساب نهائياً', (uid, data, box) => {
        appendResult(box, '<p class="admin-confirm__warn">يأخذ نسخة احتياطية من بيانات الحساب أولاً، ثم يمسح بيانات البروفايل ويحظر الحساب نهائياً (حذف حساب Firebase Auth نفسه غير ممكن من لوحة عميلية — هذا يمنعه فعلياً من استخدام أي بيانات أو الدخول لاحقاً).</p><button class="admin-btn admin-btn--danger" id="pl-del-go">حذف نهائياً</button>')
          .querySelector('#pl-del-go').addEventListener('click', () => {
            openConfirm({
              title: 'تأكيد الحذف النهائي', danger: true, doubleConfirm: true,
              message: `سيُحذف حساب "${data.username}" نهائياً بعد أخذ نسخة احتياطية.`,
              onConfirm: async () => {
                await fb.setDoc(fb.doc(fb.db, 'deletedUsersBackup', uid), { ...data, deletedAt: fb.serverTimestamp() });
                await fb.setDoc(fb.doc(fb.db, 'users', uid), { banned: { value: true, reason: 'الحساب محذوف من الإدارة' }, deleted: true, xp: 0, points: 0 });
                await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.delete', actionLabel: 'حذف حساب نهائياً', targetType: 'user', targetId: uid, targetLabel: data.username, before: data, sensitive: true, reversible: true });
                AdminToast.success('تم الحذف (نسخة احتياطية محفوظة)');
              }
            });
          });
      })
    },
    {
      title: 'تعديل XP/نقاط يدوياً مع سبب إلزامي',
      keywords: 'تعديل xp نقاط يدوي',
      run: () => withPlayer('تعديل XP/نقاط', (uid, data, box) => {
        const form = document.createElement('div');
        form.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">XP الجديد (حالياً ${data.xp || 0})</span><input class="admin-input" id="pl-xp" type="number" value="${data.xp || 0}" /></div>
          <div class="admin-field"><span class="admin-field__label">النقاط الجديدة (حالياً ${data.points || 0})</span><input class="admin-input" id="pl-points" type="number" value="${data.points || 0}" /></div>
          <div class="admin-field"><span class="admin-field__label">السبب (إلزامي)</span><input class="admin-input" id="pl-xp-reason" /></div>
          <button class="admin-btn admin-btn--primary admin-btn--sm" id="pl-xp-go" style="margin-top:8px;">حفظ</button>`;
        appendResult(box, '').appendChild(form);
        form.querySelector('#pl-xp-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const reason = form.querySelector('#pl-xp-reason').value.trim();
          if (!reason) { AdminToast.error('السبب إلزامي'); return; }
          const newXp = Number(form.querySelector('#pl-xp').value);
          const newPoints = Number(form.querySelector('#pl-points').value);
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { xp: newXp, points: newPoints });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.editXp', actionLabel: 'تعديل XP/نقاط يدوياً', targetType: 'user', targetId: uid, targetLabel: data.username, before: { xp: data.xp, points: data.points }, after: { xp: newXp, points: newPoints }, note: reason, sensitive: true });
          AdminToast.success('تم الحفظ');
        });
      })
    },
    {
      title: 'عرض سجل نشاط اللاعب الكامل',
      keywords: 'سجل نشاط كامل جلسات',
      run: () => withPlayer('سجل نشاط اللاعب', async (uid, data, box) => {
        appendResult(box, 'جارٍ التحميل...');
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.uid === uid).slice(0, 100);
        appendResult(box, rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>اللعبة</th><th>النوع</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.createdAt)}</td><td data-label="اللعبة">${r.gameName || '—'}</td><td data-label="النوع">${r.type || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا نشاط مسجَّل</p>');
      })
    },
    {
      title: 'دمج حسابين مكررين لنفس الشخص',
      keywords: 'دمج حسابات مكررة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `
          <div class="admin-field"><span class="admin-field__label">اليوزر الأساسي (يبقى)</span><input class="admin-input" id="mg-main" /></div>
          <div class="admin-field"><span class="admin-field__label">اليوزر المكرر (يُدمج ويُحظر)</span><input class="admin-input" id="mg-dup" /></div>
          <button class="admin-btn admin-btn--primary admin-btn--sm" id="mg-go" style="margin-top:8px;">دمج الآن</button>
          <p class="admin-field__hint">يجمع XP/النقاط من الحساب المكرر على الحساب الأساسي، ثم يحظر الحساب المكرر.</p>
        `;
        const modal = openModal({ title: 'دمج حسابين مكررين', bodyEl: body, size: 'md' });
        body.querySelector('#mg-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const main = await getUserByUsername(body.querySelector('#mg-main').value);
          const dup = await getUserByUsername(body.querySelector('#mg-dup').value);
          if (!main || !dup) { AdminToast.error('ما لقيت أحد الحسابين'); return; }
          const newXp = (main.xp || 0) + (dup.xp || 0);
          const newPoints = (main.points || 0) + (dup.points || 0);
          await fb.updateDoc(fb.doc(fb.db, 'users', main.uid), { xp: newXp, points: newPoints });
          await fb.updateDoc(fb.doc(fb.db, 'users', dup.uid), { banned: { value: true, reason: `تم دمجه مع ${main.username}` } });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.merge', actionLabel: 'دمج حسابين مكررين', targetType: 'user', targetId: main.uid, targetLabel: `${main.username} <- ${dup.username}`, after: { newXp, newPoints }, sensitive: true });
          AdminToast.success('تم الدمج');
          modal.close();
        });
      }
    },
    {
      title: 'إعادة تعيين كلمة المرور/رابط الحساب',
      keywords: 'اعادة تعيين كلمة مرور',
      run: () => withPlayer('إرسال رابط إعادة تعيين كلمة المرور', (uid, data, box) => {
        appendResult(box, `<p>سيُرسَل رابط إعادة تعيين كلمة المرور لإيميل: ${data.email || 'غير معروف'}</p><button class="admin-btn admin-btn--primary" id="pl-reset-go" ${!data.email ? 'disabled' : ''}>إرسال</button>`)
          .querySelector('#pl-reset-go').addEventListener('click', async () => {
            try {
              await fb.sendPasswordResetEmail(fb.auth, data.email);
              await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.resetPassword', actionLabel: 'إرسال رابط إعادة تعيين كلمة مرور', targetType: 'user', targetId: uid, targetLabel: data.username });
              AdminToast.success('تم الإرسال');
            } catch (err) { AdminToast.error('فشل: ' + err.message); }
          });
      })
    },
    {
      title: 'إضافة ملاحظة إدارية خاصة',
      keywords: 'ملاحظة ادارية خاصة',
      run: () => withPlayer('ملاحظة إدارية خاصة (تظهر لك فقط)', async (uid, data, box) => {
        const noteSnap = await fb.getDoc(fb.doc(fb.db, 'adminNotes', uid));
        const cur = noteSnap.exists() ? noteSnap.data().note : '';
        const area = appendResult(box, `<textarea class="admin-input" id="pl-note" rows="4">${cur || ''}</textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="pl-note-save" style="margin-top:8px;">حفظ</button>`);
        area.querySelector('#pl-note-save').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'adminNotes', uid), { note: area.querySelector('#pl-note').value, updatedAt: fb.serverTimestamp() });
          AdminToast.success('تم الحفظ');
        });
      })
    },
    {
      title: 'تصدير قائمة اللاعبين المفلترة كملف CSV',
      keywords: 'تصدير csv قائمة لاعبين',
      run: async () => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.orderBy('createdAt', 'desc'), fb.limit(5000)));
        const rows = snap.docs.map((d) => { const v = d.data(); return [v.username, v.email, fmtDate(v.createdAt), v.xp || 0, v.points || 0, v.banned && v.banned.value ? 'محظور' : 'عادي']; });
        csvDownload('players.csv', [['اليوزر', 'الإيميل', 'تاريخ التسجيل', 'XP', 'النقاط', 'الحالة'], ...rows]);
        AdminToast.success(`تم تصدير ${rows.length} لاعب`);
      }
    }
  ]
});
