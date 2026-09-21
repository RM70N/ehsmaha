// ==================== القسم 55 — لوحة الفائزين العامة ====================
// نظام "الفائزين" الحقيقي (مرتبط بفعالية "100" f100): leaderboards/{streamerUsername}
// = { [uid]: { nickname, wins, games } } — قائمة فوزات لكل ستريمر يبث. هذا
// منفصل عن "الفائزين والمسابقات" بقسم 14 (مسابقات موسمية على users.xp).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum, csvDownload } from '../core/format.js';

const fb = AdminFB;

async function loadBoard(username) {
  const snap = await fb.getDoc(fb.doc(fb.db, 'leaderboards', username));
  return snap.exists() ? snap.data() : {};
}

defineSection({
  id: 55,
  title: 'لوحة الفائزين العامة',
  description: 'قوائم فوزات حقيقية لكل ستريمر (leaderboards/{username}) من فعالية "100" — مستقلة عن مسابقات قسم 14.',
  tools: [
    {
      title: 'عرض لوحة فائزين ستريمر معيّن',
      keywords: 'عرض لوحة فائزين ستريمر',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم الستريمر</span><input class="admin-input" id="lb-username" /></div><div id="lb-result" style="margin-top:10px;"></div>';
        openModal({ title: 'لوحة فائزين ستريمر', bodyEl: body, size: 'lg' });
        body.querySelector('#lb-username').addEventListener('change', async (e) => {
          const board = await loadBoard(e.target.value.trim());
          const rows = Object.entries(board).sort((a, b) => (b[1].wins || 0) - (a[1].wins || 0));
          body.querySelector('#lb-result').innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الاسم</th><th>الفوزات</th></tr></thead><tbody>${rows.map(([uid, v]) => `<tr><td class="is-primary" data-label="الاسم">${v.nickname || uid}</td><td data-label="الفوزات">${fmtNum(v.wins || 0)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا لوحة فائزين لهذا الستريمر بعد</p>';
        });
      }
    },
    {
      title: 'تعديل عدد فوزات شخص معيّن يدوياً',
      keywords: 'تعديل فوزات شخص يدوي',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">يوزرنيم الستريمر</span><input class="admin-input" id="lb-e-streamer" /></div><div class="admin-field"><span class="admin-field__label">معرّف اللاعب (uid)</span><input class="admin-input" id="lb-e-uid" /></div><div class="admin-field"><span class="admin-field__label">عدد الفوزات الجديد</span><input class="admin-input" type="number" id="lb-e-wins" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="lb-e-go" style="margin-top:8px;">حفظ</button>`;
        const modal = openModal({ title: 'تعديل فوزات', bodyEl: body, size: 'sm' });
        body.querySelector('#lb-e-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const streamer = body.querySelector('#lb-e-streamer').value.trim();
          const uid = body.querySelector('#lb-e-uid').value.trim();
          const wins = Number(body.querySelector('#lb-e-wins').value);
          if (!streamer || !uid) return;
          const board = await loadBoard(streamer);
          const cur = board[uid] || { nickname: uid, wins: 0, games: {} };
          board[uid] = { ...cur, wins };
          await fb.setDoc(fb.doc(fb.db, 'leaderboards', streamer), board);
          await AdminAudit.log({ section: 55, sectionTitle: 'لوحة الفائزين العامة', actionKey: 'leaderboard.editWins', actionLabel: 'تعديل فوزات لاعب', targetType: 'leaderboardEntry', targetId: `${streamer}/${uid}`, after: { wins }, sensitive: true });
          AdminToast.success('تم الحفظ');
          modal.close();
        });
      }
    },
    {
      title: 'حذف شخص من لوحة فائزين ستريمر معيّن',
      keywords: 'حذف شخص لوحة فائزين',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">يوزرنيم الستريمر</span><input class="admin-input" id="lb-d-streamer" /></div><div class="admin-field"><span class="admin-field__label">معرّف اللاعب (uid)</span><input class="admin-input" id="lb-d-uid" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="lb-d-go" style="margin-top:8px;">حذف</button>`;
        const modal = openModal({ title: 'حذف شخص من اللوحة', bodyEl: body, size: 'sm' });
        body.querySelector('#lb-d-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const streamer = body.querySelector('#lb-d-streamer').value.trim();
          const uid = body.querySelector('#lb-d-uid').value.trim();
          if (!streamer || !uid) return;
          const board = await loadBoard(streamer);
          delete board[uid];
          await fb.setDoc(fb.doc(fb.db, 'leaderboards', streamer), board);
          await AdminAudit.log({ section: 55, sectionTitle: 'لوحة الفائزين العامة', actionKey: 'leaderboard.removeEntry', actionLabel: 'حذف شخص من لوحة فائزين', targetType: 'leaderboardEntry', targetId: `${streamer}/${uid}`, sensitive: true });
          AdminToast.success('تم الحذف');
          modal.close();
        });
      }
    },
    {
      title: 'تصفير لوحة فائزين ستريمر بالكامل',
      keywords: 'تصفير لوحة فائزين ستريمر كامل',
      run: () => {
        const body = document.createElement('div');
        body.innerHTML = '<div class="admin-field"><span class="admin-field__label">يوزرنيم الستريمر</span><input class="admin-input" id="lb-r-streamer" /></div><button class="admin-btn admin-btn--danger admin-btn--sm" id="lb-r-go" style="margin-top:8px;">تصفير اللوحة بالكامل</button>';
        const modal = openModal({ title: 'تصفير لوحة فائزين', bodyEl: body, size: 'sm' });
        body.querySelector('#lb-r-go').addEventListener('click', () => {
          const streamer = body.querySelector('#lb-r-streamer').value.trim();
          if (!streamer) return;
          openConfirm({
            title: 'تصفير اللوحة', danger: true,
            message: `سيمسح كل فوزات كل الأشخاص بلوحة "${streamer}" نهائياً.`,
            onConfirm: async () => {
              if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
              await fb.deleteDoc(fb.doc(fb.db, 'leaderboards', streamer));
              await AdminAudit.log({ section: 55, sectionTitle: 'لوحة الفائزين العامة', actionKey: 'leaderboard.resetBoard', actionLabel: 'تصفير لوحة فائزين ستريمر', targetType: 'leaderboard', targetId: streamer, sensitive: true });
              AdminToast.success('تم التصفير');
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'عرض قائمة كل الستريمرز الذين لديهم لوحة فائزين',
      keywords: 'قائمة ستريمرز لوحة فائزين',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'كل لوحات الفائزين', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.collection(fb.db, 'leaderboards'));
        const rows = snap.docs.map((d) => ({ username: d.id, count: Object.keys(d.data() || {}).length }));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الستريمر</th><th>عدد الأشخاص باللوحة</th></tr></thead><tbody>${rows.map((r) => `<tr><td class="is-primary" data-label="الستريمر">${r.username}</td><td data-label="العدد">${fmtNum(r.count)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا لوحة فائزين موجودة بعد</p>';
      }
    },
    {
      title: 'تصدير كل لوحات الفائزين كنسخة احتياطية',
      keywords: 'تصدير لوحات فائزين نسخة احتياطية',
      run: async () => {
        const snap = await fb.getDocs(fb.collection(fb.db, 'leaderboards'));
        const rows = [];
        snap.docs.forEach((d) => Object.entries(d.data() || {}).forEach(([uid, v]) => rows.push([d.id, uid, v.nickname, v.wins])));
        csvDownload('leaderboards-export.csv', [['الستريمر', 'المعرّف', 'الاسم', 'الفوزات'], ...rows]);
        AdminToast.success(`تم تصدير ${rows.length} سطر`);
      }
    }
  ]
});
