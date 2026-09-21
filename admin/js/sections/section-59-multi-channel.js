// ==================== القسم 59 — قنوات الستريمر المتعددة ====================
// وضع "أكثر من منصة" (tiktok/twitch/kick/youtube بنفس الجلسة) منطق عميل
// بالكامل (اختيار منصات + يوزر لكل وحدة بنافذة الربط السريع) — لا كولكشن
// Firestore مخصَّص له. أقرب أثر حقيقي قابل للمراقبة: activeStreamers.platform
// وبادئة "platform:username" باليوزر عند تفعيل الوضع.
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate } from '../core/format.js';

const fb = AdminFB;

defineSection({
  id: 59,
  title: 'قنوات الستريمر المتعددة',
  description: 'وضع "أكثر من منصة" منطق عميل بالكامل — لا يوجد كولكشن مخصَّص له، المراقبة هنا عبر activeStreamers فقط.',
  tools: [
    {
      title: 'عرض الجلسات النشطة حالياً بأكثر من منصة',
      keywords: 'جلسات نشطة اكثر من منصة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'جلسات متعددة المنصات الآن', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'activeStreamers'));
        const rows = snap.docs.map((d) => d.data()).filter((r) => /^(tiktok|twitch|kick|youtube):/.test(r.username || ''));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>اللعبة</th><th>المنصة:يوزر</th><th>آخر تحديث</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="اللعبة">${r.gameTag}</td><td class="is-primary" data-label="المنصة">${r.username}</td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا جلسة نشطة الآن بوضع أكثر من منصة (يُكتشف من بادئة "منصة:يوزر")</p>';
      }
    },
    {
      title: 'إحصائية المنصات الأكثر استخداماً بالوضع المتعدد',
      keywords: 'احصائية منصات اكثر استخداما متعدد',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'المنصات الأكثر استخداماً (وضع متعدد)', bodyEl: body, size: 'sm' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const counts = new Map();
        snap.docs.forEach((d) => {
          const u = d.data().username || '';
          const m = u.match(/^(tiktok|twitch|kick|youtube):/);
          if (m) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
        });
        const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        body.innerHTML = rows.length ? `<table class="admin-table"><tbody>${rows.map(([p, c]) => `<tr><td class="is-primary" data-label="المنصة">${p}</td><td data-label="العدد">${c}</td></tr>`).join('')}</tbody></table>` : '<p>ولا استخدام مسجَّل لوضع أكثر من منصة بآخر 3000 حدث</p>';
      }
    },
    {
      title: 'تفعيل/تعطيل وضع "أكثر من منصة" بالكامل من الموقع',
      keywords: 'تفعيل تعطيل وضع اكثر من منصة',
      badge: 'غير مدعوم بكود الموقع',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>ما فيه مفتاح siteFlags يعطّل وضع "أكثر من منصة" بالكامل حالياً — الميزة متاحة دائماً بنافذة الربط السريع لكل مستخدم.</p>'; openModal({ title: 'تفعيل/تعطيل الوضع المتعدد', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'إضافة منصة بث جديدة لخيارات الوضع المتعدد',
      keywords: 'اضافة منصة بث جديدة وضع متعدد',
      meta: 'إدارة منصات البث نفسها (الحالة/المفاتيح) بقسم 17',
      run: () => AdminToast.info('قائمة المنصات المدعومة (tiktok/twitch/kick/youtube) ثابتة بالكود — إضافة منصة جديدة تحتاج تعديل كود الموقع مباشرة. حالة اتصال كل منصة تُدار من قسم 17')
    }
  ]
});
