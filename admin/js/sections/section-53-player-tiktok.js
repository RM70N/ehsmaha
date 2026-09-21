// ==================== القسم 53 — ربط حساب تيك توك للاعبين ====================
// حقول حقيقية على users/{uid}: linkedTiktokUsername/linkedTiktokNickname/
// linkedTiktokAvatar/linkedTiktokAt — منفصل تماماً عن ربط حساب البث
// بالستريمر (قسم 50، bridgeStreamers).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;

async function resolveUidByUsername(usernameRaw) {
  const lower = usernameRaw.trim().toLowerCase();
  const snap = await fb.getDoc(fb.doc(fb.db, 'usernames', lower));
  return snap.exists() ? snap.data().uid : null;
}

defineSection({
  id: 53,
  title: 'ربط حساب تيك توك للاعبين',
  description: 'ربط حساب تيك توك الشخصي للاعب (users.linkedTiktokUsername) — منفصل عن ربط بث الستريمر بقسم 50.',
  tools: [
    {
      title: 'عرض حساب تيك توك المربوط للاعب معيّن',
      keywords: 'عرض حساب تيك توك لاعب',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="pt-username" /></div><div id="pt-result" style="margin-top:10px;"></div>';
        openModal({ title: 'حساب تيك توك المربوط', bodyEl: body, size: 'md' });
        body.querySelector('#pt-username').addEventListener('change', async (e) => {
          const uid = await resolveUidByUsername(e.target.value);
          const result = body.querySelector('#pt-result');
          if (!uid) { result.innerHTML = '<p>ما فيه مستخدم بهذا الاسم</p>'; return; }
          const snap = await fb.getDoc(fb.doc(fb.db, 'users', uid));
          const d = snap.data() || {};
          result.innerHTML = d.linkedTiktokUsername ? `<dl class="admin-kv"><dt>يوزرنيم تيك توك</dt><dd>@${d.linkedTiktokUsername}</dd><dt>الاسم المعروض</dt><dd>${d.linkedTiktokNickname || '—'}</dd><dt>تاريخ الربط</dt><dd>${fmtDate(d.linkedTiktokAt)}</dd></dl>` : '<p>ما ربط حساب تيك توك بعد</p>';
        });
      }
    },
    {
      title: 'فك ربط حساب تيك توك للاعب معيّن',
      keywords: 'فك ربط حساب تيك توك لاعب',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="pt-unlink-username" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="pt-unlink-go" style="margin-top:8px;">فك الربط الآن</button>';
        const modal = openModal({ title: 'فك ربط تيك توك', bodyEl: body, size: 'sm' });
        body.querySelector('#pt-unlink-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = await resolveUidByUsername(body.querySelector('#pt-unlink-username').value);
          if (!uid) { AdminToast.error('ما فيه مستخدم بهذا الاسم'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), {
            linkedTiktokUsername: fb.deleteField(), linkedTiktokNickname: fb.deleteField(),
            linkedTiktokAvatar: fb.deleteField(), linkedTiktokAt: fb.deleteField()
          });
          await AdminAudit.log({ section: 53, sectionTitle: 'ربط حساب تيك توك للاعبين', actionKey: 'playerTiktok.unlink', actionLabel: 'فك ربط تيك توك لاعب', targetType: 'user', targetId: uid, sensitive: true });
          AdminToast.success('تم فك الربط');
          modal.close();
        });
      }
    },
    {
      title: 'البحث عن لاعب بيوزرنيم تيك توك المربوط',
      keywords: 'بحث لاعب يوزرنيم تيك توك مربوط',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم تيك توك (بدون @)</span><input class="admin-input" id="pt-search-tt" /></div><div id="pt-search-result" style="margin-top:10px;"></div><p class="admin-field__hint">البحث يفحص أول 3000 حساب — يكفي للمواقع بحجم متوسط، قد يفوّت لاعبين إذا تجاوز عدد الحسابات هذا الرقم.</p>';
        openModal({ title: 'بحث بيوزرنيم تيك توك', bodyEl: body, size: 'md' });
        body.querySelector('#pt-search-tt').addEventListener('change', async (e) => {
          const target = e.target.value.trim().replace(/^@/, '').toLowerCase();
          if (!target) return;
          const result = body.querySelector('#pt-search-result');
          result.textContent = 'جارٍ البحث...';
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.limit(3000)));
          const match = snap.docs.find((d) => (d.data().linkedTiktokUsername || '').toLowerCase() === target);
          result.innerHTML = match ? `<p>الحساب: <b>${match.data().username || match.id}</b></p>` : '<p>ما لقيت لاعب بهذا اليوزرنيم مربوط (ضمن العيّنة المفحوصة)</p>';
        });
      }
    },
    {
      title: 'إحصائية عدد اللاعبين الرابطين تيك توك',
      keywords: 'احصائية عدد لاعبين رابطين تيك توك',
      meta: 'مطابق لأداة موجودة بقسم 52 — بروفايل اللاعب',
      run: () => AdminToast.info('استخدم "إحصائية عدد اللاعبين الذين ربطوا حساب تيك توك" بقسم 52 — نفس البيانات بالضبط')
    }
  ]
});
