// ==================== القسم 3 — إدارة الستريمرز ====================
// "ستريمر" = أي حساب ظهر بحدث playEvents من نوع streamer_launch. بيانات
// إدارية إضافية (توثيق/VIP/حد لاعبين/تعطيل) تُحفظ بكولكشن جديد
// streamerProfiles/{usernameLower} لأنه مو موجود بالموقع الرئيسي أصلاً.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { getUserByUsername } from '../core/players.js';

const fb = AdminFB;

async function loadStreamerEvents(limitN) {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(limitN || 5000)));
  return snap.docs.map((d) => d.data()).filter((r) => r.type === 'streamer_launch' && r.username);
}

function withStreamer(title, onFound) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="admin-field"><span class="admin-field__label">اسم الستريمر</span><input class="admin-input" id="st-name" /></div>
  <button class="admin-btn admin-btn--primary admin-btn--sm" id="st-go">بحث</button><div id="st-result" style="margin-top:12px;"></div>`;
  openModal({ title, bodyEl: body, size: 'lg' });
  body.querySelector('#st-go').addEventListener('click', async () => {
    const uname = body.querySelector('#st-name').value.trim();
    if (!uname) return;
    const usernameLower = uname.toLowerCase();
    const [profileSnap, user] = await Promise.all([
      fb.getDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower)),
      getUserByUsername(uname)
    ]);
    onFound(usernameLower, profileSnap.exists() ? profileSnap.data() : {}, user, body.querySelector('#st-result'));
  });
}

defineSection({
  id: 3,
  title: 'إدارة الستريمرز',
  description: 'كل ستريمر ظهر بحدث بث حقيقي — إحصائياته من playEvents، وبياناته الإدارية (توثيق/VIP/حظر) من streamerProfiles.',
  tools: [
    {
      title: 'قائمة كل الستريمرز المسجَّلين مع حالة كل واحد',
      keywords: 'قائمة ستريمرز حالة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'كل الستريمرز', bodyEl: body, size: 'xl' });
        const events = await loadStreamerEvents();
        const byUser = new Map();
        events.forEach((e) => { if (!byUser.has(e.username)) byUser.set(e.username, { count: 0, last: 0 }); const v = byUser.get(e.username); v.count++; v.last = Math.max(v.last, e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : 0); });
        const rows = [...byUser.entries()].sort((a, b) => b[1].last - a[1].last);
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الستريمر</th><th>عدد الجلسات</th><th>آخر بث</th></tr></thead>
          <tbody>${rows.map(([u, v]) => `<tr><td class="is-primary" data-label="الستريمر">${u}</td><td data-label="العدد">${fmtNum(v.count)}</td><td data-label="آخر بث">${fmtDate(v.last)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا ستريمر بث بعد</p>';
      }
    },
    {
      title: 'عرض المنصة المرتبطة بآخر بث لكل ستريمر',
      keywords: 'ربط منصة بث ستريمر',
      run: () => withStreamer('المنصة المرتبطة', async (usernameLower, profile, user, resultEl) => {
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'activeStreamers'), fb.where('username', '==', user && user.username)));
        const rows = snap.docs.map((d) => d.data());
        resultEl.innerHTML = rows.length ? rows.map((r) => `<p>${r.gameName}: ${r.platform || '—'}</p>`).join('') : '<p>ما يبث حالياً — راجع قسم 50 لتفاصيل الربط التاريخي</p>';
      })
    },
    {
      title: 'تفعيل أوفرلاي مخصّص لستريمر محدد',
      keywords: 'تفعيل اوفرلاي مخصص',
      run: () => withStreamer('تفعيل أوفرلاي مخصّص', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = `<p>الحالة: ${profile.customOverlay ? 'مفعّل' : 'غير مفعّل'}</p><button class="admin-btn admin-btn--primary admin-btn--sm" id="ov-toggle">${profile.customOverlay ? 'تعطيل' : 'تفعيل'}</button>`;
        resultEl.querySelector('#ov-toggle').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { customOverlay: !profile.customOverlay }, { merge: true });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.overlay', actionLabel: 'تبديل أوفرلاي مخصّص', targetType: 'streamer', targetId: usernameLower });
          AdminToast.success('تم');
        });
      })
    },
    {
      title: 'تعطيل مؤقت لصلاحيات ستريمر مخالف',
      keywords: 'تعطيل صلاحيات ستريمر',
      run: () => withStreamer('تعطيل مؤقت', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = `<p>الحالة: ${profile.disabled ? 'معطَّل' : 'نشط'}</p><button class="admin-btn admin-btn--danger admin-btn--sm" id="dis-toggle">${profile.disabled ? 'إعادة التفعيل' : 'تعطيل'}</button>`;
        resultEl.querySelector('#dis-toggle').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { disabled: !profile.disabled }, { merge: true });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.disable', actionLabel: profile.disabled ? 'إعادة تفعيل ستريمر' : 'تعطيل ستريمر مؤقتاً', targetType: 'streamer', targetId: usernameLower, sensitive: true });
          AdminToast.success('تم');
        });
      })
    },
    {
      title: 'عرض إحصائيات بث كل ستريمر',
      keywords: 'احصائيات بث ستريمر',
      run: () => withStreamer('إحصائيات البث', async (usernameLower, profile, user, resultEl) => {
        const events = (await loadStreamerEvents()).filter((e) => e.username.toLowerCase() === usernameLower);
        resultEl.innerHTML = `<p>عدد جلسات البث: ${fmtNum(events.length)}</p><p class="admin-field__hint">متوسط عدد المشاهدين المشاركين: غير متتبَّع بالموقع الرئيسي حالياً.</p>`;
      })
    },
    {
      title: 'منح شارة "ستريمر موثّق" يدوياً',
      keywords: 'شارة موثق ستريمر',
      run: () => withStreamer('منح توثيق', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = `<p>الحالة: ${profile.verified ? 'موثَّق' : 'غير موثَّق'}</p><button class="admin-btn admin-btn--primary admin-btn--sm" id="vf-toggle">${profile.verified ? 'سحب التوثيق' : 'منح التوثيق'}</button>`;
        resultEl.querySelector('#vf-toggle').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { verified: !profile.verified }, { merge: true });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.verify', actionLabel: profile.verified ? 'سحب توثيق' : 'منح توثيق', targetType: 'streamer', targetId: usernameLower });
          AdminToast.success('تم');
        });
      })
    },
    {
      title: 'تعديل حد عدد اللاعبين المسموح بجلسات الستريمر',
      keywords: 'حد عدد لاعبين جلسة',
      run: () => withStreamer('حد عدد اللاعبين', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = `<div class="admin-field"><span class="admin-field__label">الحد الأقصى (فارغ = افتراضي اللعبة)</span><input class="admin-input" id="mx" type="number" value="${profile.maxPlayers || ''}" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="mx-save" style="margin-top:8px;">حفظ</button>`;
        resultEl.querySelector('#mx-save').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const v = Number(resultEl.querySelector('#mx').value) || null;
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { maxPlayers: v }, { merge: true });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.maxPlayers', actionLabel: 'تعديل حد عدد اللاعبين', targetType: 'streamer', targetId: usernameLower, after: { maxPlayers: v } });
          AdminToast.success('تم الحفظ');
        });
      })
    },
    {
      title: 'مراجعة طلبات ستريمرز جدد ينتظرون الموافقة',
      keywords: 'طلبات ستريمرز جدد موافقة',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'streamerApplications'));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((r) => !r.decided);
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اليوزر</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="اليوزر">${r.username}</td><td data-label="التاريخ">${fmtDate(r.createdAt)}</td><td><button class="admin-btn admin-btn--primary admin-btn--sm" data-approve="${r.id}">موافقة</button> <button class="admin-btn admin-btn--danger admin-btn--sm" data-reject="${r.id}">رفض</button></td></tr>`).join('')}</tbody></table>` : '<p>ولا طلب بانتظار المراجعة — لا يوجد واجهة تقديم طلب لدى اللاعبين حالياً بالموقع الرئيسي، فهذي القائمة تُملأ فقط لو أُضيفت مستقبلاً.</p>';
        openModal({ title: 'طلبات ستريمرز جدد', bodyEl: body, size: 'lg' });
        body.querySelectorAll('[data-approve],[data-reject]').forEach((btn) => btn.addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const id = btn.getAttribute('data-approve') || btn.getAttribute('data-reject');
          const approved = !!btn.getAttribute('data-approve');
          await fb.updateDoc(fb.doc(fb.db, 'streamerApplications', id), { decided: true, approved });
          AdminToast.success('تم');
        }));
      }
    },
    {
      title: 'إرسال رسالة جماعية لكل الستريمرز',
      keywords: 'رسالة جماعية ستريمرز',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<textarea class="admin-input" id="bc-text" rows="3" placeholder="نص الرسالة"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="bc-go" style="margin-top:8px;">إرسال للكل</button>`;
        const modal = openModal({ title: 'رسالة جماعية لكل الستريمرز', bodyEl: body, size: 'md' });
        body.querySelector('#bc-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const text = body.querySelector('#bc-text').value.trim();
          if (!text) return;
          const events = await loadStreamerEvents();
          const uids = new Set(events.map((e) => e.uid).filter(Boolean));
          await Promise.all([...uids].map((uid) => fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: text, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() })));
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.broadcast', actionLabel: 'رسالة جماعية للستريمرز', targetType: 'broadcast', targetId: 'all-streamers', note: text, after: { count: uids.size } });
          AdminToast.success(`تم الإرسال لـ${uids.size} ستريمر`);
          modal.close();
        });
      }
    },
    {
      title: 'عرض سجل مشاكل تقنية واجهها ستريمر معيّن',
      keywords: 'مشاكل تقنية ستريمر',
      run: () => withStreamer('مشاكل تقنية', async (usernameLower, profile, user, resultEl) => {
        if (!user) { resultEl.innerHTML = '<p>ما لقيت الحساب</p>'; return; }
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'clientErrorLog'), fb.orderBy('ts', 'desc'), fb.limit(1000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.uid === user.uid);
        resultEl.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الخطأ</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.ts)}</td><td data-label="الخطأ">${(r.message || '').slice(0, 100)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا خطأ مسجَّل لهذا الحساب</p>';
      })
    },
    {
      title: 'تحديد ستريمرز VIP بمزايا إضافية',
      keywords: 'ستريمر vip',
      run: () => withStreamer('تحديد VIP', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = `<p>الحالة: ${profile.vip ? 'VIP' : 'عادي'}</p><button class="admin-btn admin-btn--primary admin-btn--sm" id="vip-toggle">${profile.vip ? 'إلغاء VIP' : 'ترقية إلى VIP'}</button>`;
        resultEl.querySelector('#vip-toggle').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { vip: !profile.vip }, { merge: true });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.vip', actionLabel: profile.vip ? 'إلغاء VIP' : 'ترقية VIP', targetType: 'streamer', targetId: usernameLower });
          AdminToast.success('تم');
        });
      })
    },
    {
      title: 'سحب صلاحية ستريمر نهائياً',
      keywords: 'سحب صلاحية نهائي ستريمر',
      run: () => withStreamer('سحب الصلاحية نهائياً', (usernameLower, profile, user, resultEl) => {
        resultEl.innerHTML = '<button class="admin-btn admin-btn--danger" id="rv-go">سحب نهائياً</button>';
        resultEl.querySelector('#rv-go').addEventListener('click', () => {
          openConfirm({
            title: 'سحب صلاحية ستريمر نهائياً', danger: true, doubleConfirm: true,
            message: `هذا يمنع "${usernameLower}" نهائياً من الظهور كستريمر بالمنصة.`,
            onConfirm: async () => {
              await fb.setDoc(fb.doc(fb.db, 'streamerProfiles', usernameLower), { revoked: true, disabled: true }, { merge: true });
              await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.revoke', actionLabel: 'سحب صلاحية ستريمر نهائياً', targetType: 'streamer', targetId: usernameLower, sensitive: true });
              AdminToast.success('تم السحب');
            }
          });
        });
      })
    },
    {
      title: 'عرض أكثر الألعاب استخداماً لكل ستريمر',
      keywords: 'اكثر العاب استخداما ستريمر',
      run: () => withStreamer('أكثر الألعاب استخداماً', async (usernameLower, profile, user, resultEl) => {
        const events = (await loadStreamerEvents()).filter((e) => e.username.toLowerCase() === usernameLower);
        const counts = new Map();
        events.forEach((e) => counts.set(e.gameName, (counts.get(e.gameName) || 0) + 1));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        resultEl.innerHTML = top.length ? `<table class="admin-table"><tbody>${top.map(([g, c]) => `<tr><td class="is-primary" data-label="اللعبة">${g}</td><td data-label="العدد">${c}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات</p>';
      })
    },
    {
      title: 'جدولة صيانة خاصة تظهر لستريمر معيّن فقط',
      keywords: 'صيانة خاصة ستريمر',
      run: () => withStreamer('جدولة صيانة خاصة', (usernameLower, profile, user, resultEl) => {
        if (!user) { resultEl.innerHTML = '<p>ما لقيت الحساب لإرسال الإشعار</p>'; return; }
        resultEl.innerHTML = `<textarea class="admin-input" id="mt-text" rows="3" placeholder="نص إشعار الصيانة"></textarea><button class="admin-btn admin-btn--primary admin-btn--sm" id="mt-go" style="margin-top:8px;">إرسال</button>`;
        resultEl.querySelector('#mt-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const text = resultEl.querySelector('#mt-text').value.trim();
          if (!text) return;
          await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', user.uid, 'items')), { type: 'adminMessage', message: text, fromLabel: 'إشعار صيانة', read: false, createdAt: fb.serverTimestamp() });
          await AdminAudit.log({ section: 3, sectionTitle: 'إدارة الستريمرز', actionKey: 'streamers.maintenanceNotice', actionLabel: 'إشعار صيانة خاص', targetType: 'streamer', targetId: usernameLower, note: text });
          AdminToast.success('تم الإرسال');
        });
      })
    },
    {
      title: 'تصدير تقرير أداء شهري لكل ستريمر',
      keywords: 'تصدير تقرير شهري ستريمر',
      run: async () => {
        const since = Date.now() - 30 * 86400000;
        const events = (await loadStreamerEvents(8000)).filter((e) => (e.createdAt && e.createdAt.toMillis ? e.createdAt.toMillis() : 0) >= since);
        const byUser = new Map();
        events.forEach((e) => byUser.set(e.username, (byUser.get(e.username) || 0) + 1));
        csvDownload('streamers-monthly.csv', [['الستريمر', 'عدد الجلسات آخر 30 يوم'], ...[...byUser.entries()]]);
        AdminToast.success('تم التصدير');
      }
    }
  ]
});
