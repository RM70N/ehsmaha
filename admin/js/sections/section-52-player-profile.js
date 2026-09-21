// ==================== القسم 52 — بروفايل اللاعب ====================
// هذا عن صفحة البروفايل نفسها (#pg-profile) وميزاتها على مستوى كل اللاعبين
// — لا تكرار قصدي مع قسم 2 (بحث/إجراء على حساب لاعب واحد محدَّد) ولا قسم
// 12 (تغيير يوزر قسري لمخالفة). التركيز هنا: كوليدون إعادة التسمية الذاتية
// (usernameChangedAt، 7 أيام)، وإحصاءات مجمَّعة عن استخدام صفحة البروفايل.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';

const fb = AdminFB;

async function resolveUidByUsername(usernameRaw) {
  const lower = usernameRaw.trim().toLowerCase();
  const snap = await fb.getDoc(fb.doc(fb.db, 'usernames', lower));
  return snap.exists() ? snap.data().uid : null;
}

defineSection({
  id: 52,
  title: 'بروفايل اللاعب',
  description: 'صفحة #pg-profile نفسها (كوليدون إعادة التسمية، إحصائيات مجمَّعة) — إدارة حساب لاعب واحد بقسم 2، التغيير القسري بقسم 12.',
  tools: [
    {
      title: 'إعادة تعيين كوليدون تغيير اليوزر (السماح بتغيير مبكر)',
      keywords: 'كوليدون تغيير يوزر مبكر',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">اسم المستخدم</span><input class="admin-input" id="pp-username" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="pp-reset-go" style="margin-top:8px;">السماح بتغيير مبكر الآن</button>';
        const modal = openModal({ title: 'إعادة تعيين كوليدون التسمية', bodyEl: body, size: 'sm' });
        body.querySelector('#pp-reset-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const uid = await resolveUidByUsername(body.querySelector('#pp-username').value);
          if (!uid) { AdminToast.error('ما فيه مستخدم بهذا الاسم'); return; }
          await fb.updateDoc(fb.doc(fb.db, 'users', uid), { usernameChangedAt: fb.deleteField() });
          await AdminAudit.log({ section: 52, sectionTitle: 'بروفايل اللاعب', actionKey: 'profile.resetRenameCooldown', actionLabel: 'إعادة تعيين كوليدون تغيير اليوزر', targetType: 'user', targetId: uid });
          AdminToast.success('تم — يقدر يغيّر يوزره الآن قبل انتهاء الـ7 أيام');
          modal.close();
        });
      }
    },
    {
      title: 'عرض توزيع مستويات اللاعبين (لفل) على البروفايلات',
      keywords: 'توزيع مستويات لفل بروفايلات',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'توزيع المستويات', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.limit(2000)));
        const buckets = new Map();
        snap.docs.forEach((d) => {
          const lvl = (d.data().level) || 1;
          const bucket = `${Math.floor((lvl - 1) / 5) * 5 + 1}-${Math.floor((lvl - 1) / 5) * 5 + 5}`;
          buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        });
        const sorted = [...buckets.entries()].sort((a, b) => Number(a[0].split('-')[0]) - Number(b[0].split('-')[0]));
        body.innerHTML = sorted.length ? renderBarChart({ labels: sorted.map((s) => s[0]), values: sorted.map((s) => s[1]), height: 220 }) : '<p>ولا بيانات كافية</p>';
      }
    },
    {
      title: 'تفعيل/تعطيل ميزة تغيير اليوزر الذاتي من صفحة البروفايل',
      keywords: 'تفعيل تعطيل تغيير يوزر ذاتي بروفايل',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ميزة "تغيير الاسم" بصفحة البروفايل مفعّلة دائماً بمنطق الموقع الحالي — ما فيه مفتاح siteFlags يعطّلها بالكامل، فقط الكوليدون الأسبوعي الطبيعي.</p>'; openModal({ title: 'تفعيل/تعطيل التغيير الذاتي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إحصائية عدد اللاعبين الذين ربطوا حساب تيك توك ببروفايلهم',
      keywords: 'احصائية ربط تيك توك بروفايل',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'ربط تيك توك بالبروفايل', bodyEl: body, size: 'sm' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.limit(3000)));
        const linked = snap.docs.filter((d) => !!d.data().linkedTiktokUsername).length;
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">عدد اللاعبين الرابطين تيك توك (أول ${fmtNum(snap.size)} حساب مفحوص)</div><div class="admin-stat-card__value">${fmtNum(linked)}</div></div>`;
      }
    }
  ]
});
