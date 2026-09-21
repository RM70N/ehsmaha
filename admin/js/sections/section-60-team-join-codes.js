// ==================== القسم 60 — كلمات الدخول للفرق ====================
// صراحة: "كود الغرفة" بالألعاب الأونلاين (اللي يشاركه اللاعب مع أصدقائه)
// هو نفسه معرّف مستند rooms/{roomId} حرفياً — لا يوجد حقل "كلمة سر" منفصل
// مخزَّن. الإدارة هنا حقيقية على مستوى الغرف نفسها (rooms + members).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum } from '../core/format.js';

const fb = AdminFB;

defineSection({
  id: 60,
  title: 'كلمات الدخول للفرق',
  description: '"كود الغرفة" هو معرّف مستند rooms/{roomId} نفسه (لا كلمة سر منفصلة مخزَّنة) — الإدارة هنا على مستوى الغرف الحقيقية.',
  tools: [
    {
      title: 'عرض كل الغرف المفتوحة حالياً (أكواد نشطة)',
      keywords: 'عرض غرف مفتوحة اكواد نشطة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'الغرف المفتوحة الآن', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'rooms'), fb.limit(200)));
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>كود الغرفة</th><th>اللعبة</th><th>آخر تحديث</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الكود">${r.id}</td><td data-label="اللعبة">${r.gameTag || '—'}</td><td data-label="آخر تحديث">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا غرفة مفتوحة حالياً</p>';
      }
    },
    {
      title: 'عرض أعضاء غرفة معيّنة بكودها',
      keywords: 'عرض اعضاء غرفة كود',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">كود الغرفة</span><input class="admin-input" id="rm-code" /></div><div id="rm-members-result" style="margin-top:10px;"></div>';
        openModal({ title: 'أعضاء غرفة', bodyEl: body, size: 'lg' });
        body.querySelector('#rm-code').addEventListener('change', async (e) => {
          const roomId = e.target.value.trim();
          if (!roomId) return;
          const snap = await fb.getDocs(fb.collection(fb.db, 'rooms', roomId, 'members'));
          const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
          body.querySelector('#rm-members-result').innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>آخر نبض اتصال</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الاسم">${r.nickname || r.id}</td><td data-label="آخر نبض">${fmtDate(r.updatedAt)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا عضو بهذي الغرفة (أو الكود غير صحيح)</p>';
        });
      }
    },
    {
      title: 'إغلاق غرفة قسرياً (إبطال الكود فوراً)',
      keywords: 'اغلاق غرفة قسري ابطال كود',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">كود الغرفة</span><input class="admin-input" id="rm-close-code" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="rm-close-go" style="margin-top:8px;">إغلاق الغرفة الآن</button>';
        const modal = openModal({ title: 'إغلاق غرفة قسرياً', bodyEl: body, size: 'sm' });
        body.querySelector('#rm-close-go').addEventListener('click', () => {
          const roomId = body.querySelector('#rm-close-code').value.trim();
          if (!roomId) return;
          openConfirm({
            title: 'تأكيد إغلاق الغرفة', danger: true,
            message: `سيُحذف مستند الغرفة "${roomId}" — الكود يصير غير صالح فوراً لكل من بداخلها.`,
            onConfirm: async () => {
              if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
              await fb.deleteDoc(fb.doc(fb.db, 'rooms', roomId));
              await AdminAudit.log({ section: 60, sectionTitle: 'كلمات الدخول للفرق', actionKey: 'roomCode.forceClose', actionLabel: 'إغلاق غرفة قسرياً', targetType: 'room', targetId: roomId, sensitive: true });
              AdminToast.success('تم الإغلاق — الكود غير صالح الآن');
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'طرد عضو معيّن من غرفة',
      keywords: 'طرد عضو غرفة',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">كود الغرفة</span><input class="admin-input" id="rm-kick-code" /></div><div class="admin-field"><span class="admin-field__label">معرّف العضو</span><input class="admin-input" id="rm-kick-member" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="rm-kick-go" style="margin-top:8px;">طرد</button>`;
        const modal = openModal({ title: 'طرد عضو من غرفة', bodyEl: body, size: 'sm' });
        body.querySelector('#rm-kick-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const roomId = body.querySelector('#rm-kick-code').value.trim();
          const memberId = body.querySelector('#rm-kick-member').value.trim();
          if (!roomId || !memberId) return;
          await fb.deleteDoc(fb.doc(fb.db, 'rooms', roomId, 'members', memberId));
          await AdminAudit.log({ section: 60, sectionTitle: 'كلمات الدخول للفرق', actionKey: 'roomCode.kickMember', actionLabel: 'طرد عضو من غرفة', targetType: 'roomMember', targetId: `${roomId}/${memberId}`, sensitive: true });
          AdminToast.success('تم الطرد');
          modal.close();
        });
      }
    },
    {
      title: 'إحصائية عدد الغرف المفتوحة حسب اللعبة',
      keywords: 'احصائية عدد غرف مفتوحة لعبة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'الغرف حسب اللعبة', bodyEl: body, size: 'sm' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'rooms'), fb.limit(500)));
        const counts = new Map();
        snap.docs.forEach((d) => { const t = d.data().gameTag || 'غير محدَّد'; counts.set(t, (counts.get(t) || 0) + 1); });
        const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
        body.innerHTML = rows.length ? `<table class="admin-table"><tbody>${rows.map(([t, c]) => `<tr><td class="is-primary" data-label="اللعبة">${t}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا غرف مفتوحة حالياً</p>';
      }
    },
    {
      title: 'تنظيف الغرف الخاملة (بدون نشاط لفترة طويلة)',
      keywords: 'تنظيف غرف خاملة نشاط طويل',
      run: async () => {
        const staleMs = 3 * 3600000;
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'rooms'), fb.limit(500)));
        const stale = snap.docs.filter((d) => {
          const u = d.data().updatedAt;
          const ms = u && u.toMillis ? u.toMillis() : 0;
          return ms && (Date.now() - ms) > staleMs;
        });
        if (!stale.length) { AdminToast.info('ولا غرفة خاملة الآن (أكثر من 3 ساعات بدون نشاط)'); return; }
        openConfirm({
          title: 'تنظيف الغرف الخاملة', danger: true,
          message: `سيُحذف ${stale.length} غرفة خاملة (بدون تحديث لأكثر من 3 ساعات).`,
          onConfirm: async () => {
            if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
            for (const d of stale) await fb.deleteDoc(d.ref);
            await AdminAudit.log({ section: 60, sectionTitle: 'كلمات الدخول للفرق', actionKey: 'roomCode.cleanStale', actionLabel: 'تنظيف غرف خاملة', after: { count: stale.length }, sensitive: true });
            AdminToast.success(`تم حذف ${stale.length} غرفة خاملة`);
          }
        });
      }
    }
  ]
});
