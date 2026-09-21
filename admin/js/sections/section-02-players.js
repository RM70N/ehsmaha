// ==================== القسم 2 — إدارة اللاعبين ====================
// تنبيه مهم على مصادر البيانات: users/{uid} يخزّن الهوية والحالة (username,
// email, createdAt, banned, frozenUntil, soloWinCount, onlineWinCount...)،
// أما XP واللفل وعدد الراوندات وملكية الإطارات فكلها على **levels/{key}**
// (المفتاح = levelsKey(username)) — الموقع ما يقرأ users.xp ولا users.points
// إطلاقاً. لهذا كل أداة تلمس XP هنا تمرّ من xpSetForUsername/getLevelsDocForUsername
// اللي تكتب على المكان الحقيقي وتعيد حساب حقل level معه.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, tsToMillis } from '../core/format.js';
import { resolveUidByUsername, getUserByUsername, searchUsersByPrefix, playerSearchBox, levelsKey, levelsKeysForUsername, xpSetForUsername, getLevelsDocForUsername } from '../core/players.js';

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
      run: () => withPlayer('بروفايل اللاعب الكامل', async (uid, data, box) => {
        appendResult(box, 'جارٍ التحميل...');
        // XP/اللفل/الإطارات من levels/{key} (المصدر الحقيقي)، والباقي من users/{uid}.
        const lv = await getLevelsDocForUsername(data.username);
        const d = (lv && lv.data) || {};
        appendResult(box, `
          <dl class="admin-kv">
            <dt>اليوزر</dt><dd>${data.username || '—'}</dd>
            <dt>الإيميل</dt><dd>${data.email || '—'}</dd>
            <dt>XP</dt><dd>${fmtNum(d.xp || 0)}</dd>
            <dt>اللفل</dt><dd>${fmtNum(d.level || 1)}</dd>
            <dt>الراوندات الملعوبة</dt><dd>${fmtNum(d.roundsPlayed || 0)}</dd>
            <dt>فوزات فردية</dt><dd>${fmtNum(data.soloWinCount || 0)}</dd>
            <dt>فوزات أونلاين</dt><dd>${fmtNum(data.onlineWinCount || 0)}</dd>
            <dt>الإطارات المملوكة</dt><dd>${(d.ownedFrames || []).join('، ') || '—'}</dd>
            <dt>الإطار المفعَّل</dt><dd>${d.activeFrame || '—'}</dd>
            <dt>يوزر تيك توك المربوط</dt><dd>${data.linkedTiktokUsername || '—'}</dd>
            <dt>مفاتيح levels</dt><dd>${(lv && lv.keys || []).join('، ') || '—'}</dd>
            <dt>الحالة</dt><dd>${data.banned && data.banned.value ? ('محظور — ' + (data.banned.reason || '')) : 'عادي'}</dd>
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
                await fb.setDoc(fb.doc(fb.db, 'users', uid), { banned: { value: true, reason: 'الحساب محذوف من الإدارة' }, deleted: true }, { merge: true });
                // التصفير الفعلي يكون على levels/{key} — مكان XP/اللفل/الإطارات الحقيقي.
                for (const k of await levelsKeysForUsername(data.username)) {
                  await fb.setDoc(fb.doc(fb.db, 'levels', k), { xp: 0, level: 1, ownedFrames: [], levelFrames: [], activeFrame: '' }, { merge: true });
                }
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
      run: () => withPlayer('تعديل XP اللاعب', async (uid, data, box) => {
        appendResult(box, 'جارٍ التحميل...');
        const lv = await getLevelsDocForUsername(data.username);
        const curXp = Math.max(0, Number(lv && lv.data.xp) || 0);
        const curLevel = Math.max(1, Number(lv && lv.data.level) || 1);
        const form = document.createElement('div');
        form.innerHTML = `
          <p class="admin-field__hint">المصدر الحقيقي: levels/${(lv && lv.keys || []).join('، ') || '—'} — يُكتب على كل مفاتيح اللاعب (يوزر الموقع + يوزر تيك توك المربوط) عشان يوصل التعديل فعلاً.</p>
          <div class="admin-field"><span class="admin-field__label">XP الجديد (حالياً ${fmtNum(curXp)} — لفل ${fmtNum(curLevel)})</span><input class="admin-input" id="pl-xp" type="number" min="0" value="${curXp}" /></div>
          <div class="admin-field"><span class="admin-field__label">السبب (إلزامي)</span><input class="admin-input" id="pl-xp-reason" /></div>
          <button class="admin-btn admin-btn--primary admin-btn--sm" id="pl-xp-go" style="margin-top:8px;">حفظ</button>`;
        appendResult(box, '').appendChild(form);
        form.querySelector('#pl-xp-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const reason = form.querySelector('#pl-xp-reason').value.trim();
          if (!reason) { AdminToast.error('السبب إلزامي'); return; }
          const newXp = Number(form.querySelector('#pl-xp').value);
          const res = await xpSetForUsername(data.username, newXp);
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.editXp', actionLabel: 'تعديل XP يدوياً', targetType: 'levels', targetId: (res.keys || []).join(','), targetLabel: data.username, before: { xp: curXp, level: curLevel }, after: { xp: res.xp, level: res.level }, note: reason, sensitive: true });
          AdminToast.success(`تم الحفظ — XP ${fmtNum(res.xp)} ولفل ${fmtNum(res.level)}`);
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
          <p class="admin-field__hint">يجمع XP الحقيقي (levels/{key}) من الحساب المكرر على الحساب الأساسي ويعيد حساب اللفل، ثم يحظر الحساب المكرر.</p>
        `;
        const modal = openModal({ title: 'دمج حسابين مكررين', bodyEl: body, size: 'md' });
        body.querySelector('#mg-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const main = await getUserByUsername(body.querySelector('#mg-main').value);
          const dup = await getUserByUsername(body.querySelector('#mg-dup').value);
          if (!main || !dup) { AdminToast.error('ما لقيت أحد الحسابين'); return; }
          const mainLv = await getLevelsDocForUsername(main.username);
          const dupLv = await getLevelsDocForUsername(dup.username);
          const newXp = (Number(mainLv && mainLv.data.xp) || 0) + (Number(dupLv && dupLv.data.xp) || 0);
          const res = await xpSetForUsername(main.username, newXp);
          // نصفّر سجل المكرر عشان ما يظهر مرتين بقوائم المستويات/الترتيب.
          if (dupLv && dupLv.keys.length) {
            for (const k of dupLv.keys) await fb.setDoc(fb.doc(fb.db, 'levels', k), { xp: 0, level: 1 }, { merge: true });
          }
          await fb.updateDoc(fb.doc(fb.db, 'users', dup.uid), { banned: { value: true, reason: `تم دمجه مع ${main.username}` } });
          await AdminAudit.log({ section: 2, sectionTitle: 'إدارة اللاعبين', actionKey: 'players.merge', actionLabel: 'دمج حسابين مكررين', targetType: 'user', targetId: main.uid, targetLabel: `${main.username} <- ${dup.username}`, after: { xp: res.xp, level: res.level }, sensitive: true });
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
        // نقرأ levels مرة وحدة ونضم XP/اللفل الحقيقيين على كل صف بدل حقول
        // users.xp/users.points اللي كانت تطلع أصفاراً دايماً لأنها غير موجودة.
        const [snap, lvSnap] = await Promise.all([
          fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.orderBy('createdAt', 'desc'), fb.limit(5000))),
          fb.getDocs(fb.collection(fb.db, 'levels'))
        ]);
        const lvByKey = new Map(lvSnap.docs.map((d) => [d.id, d.data()]));
        const rows = snap.docs.map((d) => {
          const v = d.data();
          const lv = lvByKey.get(levelsKey(v.username)) || {};
          return [v.username, v.email, fmtDate(v.createdAt), lv.xp || 0, lv.level || 1, lv.roundsPlayed || 0, v.banned && v.banned.value ? 'محظور' : 'عادي'];
        });
        csvDownload('players.csv', [['اليوزر', 'الإيميل', 'تاريخ التسجيل', 'XP', 'اللفل', 'الراوندات', 'الحالة'], ...rows]);
        AdminToast.success(`تم تصدير ${rows.length} لاعب`);
      }
    }
  ]
});
