// ==================== القسم 14 — لوحة الفائزين والمسابقات ====================
// كولكشن جديد contests/{id} — نظام مسابقات إداري كامل فوق **levels/{key}**،
// وهو المكان الحقيقي الوحيد اللي يخزّن فيه الموقع XP واللفل وعدد الراوندات
// وملكية الإطارات. (كان هذا القسم يقرأ ويكتب users.xp / users.points /
// users.ownedFrames — كلها حقول غير موجودة أصلاً بالموقع، فكان الترتيب يطلع
// فاضي والجوائز ما توصل لأحد.) الحقول الحقيقية المتاحة كمعيار فوز:
// xp، level، roundsPlayed.
// "الإعلان التلقائي" هنا يعني زر حساب+تطبيق فوري (بدون Cloud Functions/Cron
// لا يوجد تنفيذ مجدول حقيقي بالخلفية).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { resolveUidByUsername, levelsKey, framesGrant } from '../core/players.js';

const fb = AdminFB;

async function loadContests() {
  const snap = await fb.getDocs(fb.collection(fb.db, 'contests'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
// الترتيب يُحسب من levels/{key} — نجيب أكثر من المطلوب بشوي عشان الاستبعاد
// ما يقلّص القائمة تحت العدد المطلوب، ثم نقصّها بعد الفلترة.
async function computeLeaderboard(contest, limitN) {
  const want = limitN || 50;
  const field = contest.criterionField || 'xp';
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'levels'), fb.orderBy(field, 'desc'), fb.limit(want + 20)));
  const excluded = new Set((contest.excludedKeys || []).map((k) => levelsKey(k)));
  return snap.docs
    .map((d) => ({ key: d.id, username: (d.data().username || d.id), ...d.data() }))
    .filter((u) => !excluded.has(levelsKey(u.key)) && !excluded.has(levelsKey(u.username)))
    .slice(0, want);
}

// الإشعارات تُكتب على notifications/{uid}/items — و levels مفهرس باليوزر مو
// بالـuid، فنترجم اليوزر لـuid قبل الإرسال (ونتخطى بهدوء أي مفتاح ما له حساب
// موقع، مثل مفاتيح تيك توك المربوطة).
async function uidForRow(row) {
  try { return await resolveUidByUsername(row.username || row.key); } catch (err) { return null; }
}

defineSection({
  id: 14,
  title: 'الفائزين والمسابقات',
  description: 'مسابقات حقيقية فوق أرصدة اللاعبين الفعلية (contests + levels/{key}: xp/level/roundsPlayed).',
  tools: [
    {
      title: 'إنشاء مسابقة موسمية جديدة',
      keywords: 'انشاء مسابقة موسمية',
      run: () => {
        openFormModal({
          title: 'مسابقة جديدة',
          fields: [
            { key: 'name', label: 'الاسم', required: true },
            { key: 'startAt', label: 'تاريخ البداية', type: 'date', required: true },
            { key: 'endAt', label: 'تاريخ النهاية', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            const ref = fb.doc(fb.collection(fb.db, 'contests'));
            await fb.setDoc(ref, { name: v.name, startAt: new Date(v.startAt), endAt: new Date(v.endAt), status: 'active', criterionField: 'xp', createdAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 14, sectionTitle: 'الفائزين والمسابقات', actionKey: 'contests.create', actionLabel: 'إنشاء مسابقة جديدة', targetType: 'contest', targetId: ref.id, targetLabel: v.name });
            AdminToast.success('تم الإنشاء');
          }
        });
      }
    },
    {
      title: 'تحديد معيار الفوز',
      keywords: 'معيار فوز مسابقة',
      run: async () => {
        const contests = await loadContests();
        openFormModal({
          title: 'معيار الفوز',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'criterionField', label: 'المعيار', type: 'select', options: [{ value: 'xp', label: 'أعلى XP' }, { value: 'level', label: 'أعلى لفل' }, { value: 'roundsPlayed', label: 'أكثر راوندات ملعوبة' }] }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { criterionField: v.criterionField }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'تحديد الجوائز (إطار، شارة، نقاط إضافية)',
      keywords: 'تحديد جوائز مسابقة',
      run: async () => {
        const [contests, framesSnap, badgesSnap] = await Promise.all([loadContests(), fb.getDocs(fb.collection(fb.db, 'framesCatalog')), fb.getDocs(fb.collection(fb.db, 'badgeDefs'))]);
        const frames = framesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const badges = badgesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        openFormModal({
          title: 'جوائز المسابقة',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'prizeFrameId', label: 'إطار الجائزة', type: 'select', options: [{ value: '', label: '(بدون)' }, ...frames.map((f) => ({ value: f.id, label: f.name }))] },
            { key: 'prizeBadgeId', label: 'شارة إدارية (سجل داخلي فقط — البروفايل يعرض إنجازاته المحسوبة تلقائياً)', type: 'select', options: [{ value: '', label: '(بدون)' }, ...badges.map((b) => ({ value: b.id, label: b.name }))] },
            { key: 'prizeXp', label: 'XP إضافي للفائز', type: 'number' }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { prizeFrameId: v.prizeFrameId || null, prizeBadgeId: v.prizeBadgeId || null, prizeXp: Number(v.prizeXp) || 0 }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'إعلان الفائزين تلقائياً عند انتهاء المسابقة',
      keywords: 'اعلان فائزين مسابقة',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.status === 'active');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">المسابقة</span><select class="admin-input" id="an-select">${contests.map((c) => `<option value="${c.id}">${c.name}</option>`).join('') || '<option>ولا مسابقة نشطة</option>'}</select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="an-go" style="margin-top:8px;" ${!contests.length ? 'disabled' : ''}>احسب وأعلن الفائزين الآن</button><div id="an-result" style="margin-top:10px;"></div>`;
        const modal = openModal({ title: 'إعلان الفائزين', bodyEl: body, size: 'md' });
        body.querySelector('#an-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const contest = contests.find((c) => c.id === body.querySelector('#an-select').value);
          const top3 = await computeLeaderboard(contest, 3);
          for (const w of top3) {
            // XP يُزاد على levels/{key} نفسه (نفس مكان حساب اللفل بالموقع، فيرتفع
            // لفل الفائز تلقائياً بأول قراءة)، والإطار عبر framesGrant اللي يمنحه
            // بمفتاحي اللاعب (يوزر الموقع + يوزر تيك توك المربوط) عشان يوصل فعلاً.
            if (contest.prizeXp) await fb.setDoc(fb.doc(fb.db, 'levels', w.key), { xp: fb.increment(contest.prizeXp) }, { merge: true });
            if (contest.prizeFrameId) await framesGrant(w.username || w.key, contest.prizeFrameId);
            const uid = await uidForRow(w);
            if (uid) {
              if (contest.prizeBadgeId) await fb.setDoc(fb.doc(fb.db, 'users', uid), { adminBadges: fb.arrayUnion(contest.prizeBadgeId) }, { merge: true });
              await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: `مبروك! فزت بمسابقة "${contest.name}"`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
            }
          }
          await fb.updateDoc(fb.doc(fb.db, 'contests', contest.id), { status: 'finished', winners: top3.map((w) => ({ key: w.key, username: w.username })) });
          await AdminAudit.log({ section: 14, sectionTitle: 'الفائزين والمسابقات', actionKey: 'contests.announce', actionLabel: 'إعلان فائزين مسابقة', targetType: 'contest', targetId: contest.id, after: { winners: top3.map((w) => w.username) }, sensitive: true });
          body.querySelector('#an-result').innerHTML = `<p>الفائزون: ${top3.map((w) => w.username).join('، ')}</p>`;
          AdminToast.success('تم الإعلان وتطبيق الجوائز');
        });
      }
    },
    {
      title: 'عرض الترتيب الحي (Live Leaderboard) أثناء المسابقة',
      keywords: 'ترتيب حي مسابقة',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.status === 'active');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">المسابقة</span><select class="admin-input" id="lb-select">${contests.map((c) => `<option value="${c.id}">${c.name}</option>`).join('') || '<option>ولا مسابقة نشطة</option>'}</select></div><div id="lb-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'الترتيب الحي', bodyEl: body, size: 'lg' });
        async function draw() {
          const contest = contests.find((c) => c.id === body.querySelector('#lb-select').value);
          if (!contest) return;
          const top = await computeLeaderboard(contest, 20);
          body.querySelector('#lb-result').innerHTML = `<table class="admin-table"><thead><tr><th>#</th><th>اليوزر</th><th>${contest.criterionField}</th></tr></thead><tbody>${top.map((u, i) => `<tr><td data-label="#">${i + 1}</td><td class="is-primary" data-label="اليوزر">${u.username}</td><td data-label="القيمة">${fmtNum(u[contest.criterionField])}</td></tr>`).join('')}</tbody></table>`;
        }
        if (contests.length) { body.querySelector('#lb-select').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'تمديد مدة مسابقة قائمة',
      keywords: 'تمديد مدة مسابقة',
      run: async () => {
        const contests = await loadContests();
        openFormModal({
          title: 'تمديد مسابقة',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'newEndAt', label: 'تاريخ نهاية جديد', type: 'date', required: true }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { endAt: new Date(v.newEndAt) }); AdminToast.success('تم التمديد'); }
        });
      }
    },
    {
      title: 'إلغاء مسابقة قبل انتهائها مع سبب',
      keywords: 'الغاء مسابقة سبب',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.status === 'active');
        openFormModal({
          title: 'إلغاء مسابقة',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'reason', label: 'السبب', required: true }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { status: 'cancelled', cancelReason: v.reason });
            await AdminAudit.log({ section: 14, sectionTitle: 'الفائزين والمسابقات', actionKey: 'contests.cancel', actionLabel: 'إلغاء مسابقة', targetType: 'contest', targetId: v.contestId, note: v.reason, sensitive: true });
            AdminToast.success('تم الإلغاء');
          }
        });
      }
    },
    {
      title: 'أرشيف كل المسابقات السابقة وفائزيها',
      keywords: 'ارشيف مسابقات سابقة فائزين',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.status === 'finished');
        const body = document.createElement('div');
        body.innerHTML = contests.length ? `<table class="admin-table"><thead><tr><th>المسابقة</th><th>الفائزون</th></tr></thead><tbody>${contests.map((c) => `<tr><td class="is-primary" data-label="المسابقة">${c.name}</td><td data-label="الفائزون">${(c.winners || []).map((w) => w.username).join('، ') || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا مسابقة منتهية بعد</p>';
        openModal({ title: 'أرشيف المسابقات', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'إرسال إشعار تلقائي للمتصدرين بتقدمهم',
      keywords: 'اشعار متصدرين تقدم',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.status === 'active');
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">المسابقة</span><select class="admin-input" id="nt-select">${contests.map((c) => `<option value="${c.id}">${c.name}</option>`).join('') || '<option>ولا مسابقة نشطة</option>'}</select></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="nt-go" style="margin-top:8px;" ${!contests.length ? 'disabled' : ''}>إشعار أعلى 10</button>`;
        const modal = openModal({ title: 'إشعار المتصدرين', bodyEl: body, size: 'sm' });
        body.querySelector('#nt-go').addEventListener('click', async () => {
          if (isReadOnly()) { AdminToast.warn('اللوحة بوضع قراءة فقط'); return; }
          const contest = contests.find((c) => c.id === body.querySelector('#nt-select').value);
          const top = await computeLeaderboard(contest, 10);
          let sent = 0;
          for (let i = 0; i < top.length; i++) {
            const uid = await uidForRow(top[i]);
            if (!uid) continue;
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: `أنت بالمركز ${i + 1} بمسابقة "${contest.name}"!`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
            sent++;
          }
          AdminToast.success(`تم إشعار ${sent} من ${top.length}`);
          modal.close();
        });
      }
    },
    {
      title: 'استبعاد لاعب من مسابقة عند الاشتباه بالغش',
      keywords: 'استبعاد لاعب مسابقة غش',
      run: async () => {
        const contests = await loadContests();
        openFormModal({
          title: 'استبعاد لاعب',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'username', label: 'اسم اللاعب', required: true }
          ],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            // الترتيب مبني على levels/{key} فالاستبعاد لازم يُخزَّن بنفس المفتاح
            // (نحتفظ بالـuid كمان للسجل والتتبّع).
            await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { excludedUids: fb.arrayUnion(uid), excludedKeys: fb.arrayUnion(levelsKey(v.username)) });
            await AdminAudit.log({ section: 14, sectionTitle: 'الفائزين والمسابقات', actionKey: 'contests.exclude', actionLabel: 'استبعاد لاعب من مسابقة', targetType: 'contest', targetId: v.contestId, targetLabel: v.username, sensitive: true });
            AdminToast.success('تم الاستبعاد');
          }
        });
      }
    },
    {
      title: 'تخصيص مسابقة لفئة معيّنة',
      keywords: 'تخصيص مسابقة فئة ستريمرز لاعبين',
      run: async () => {
        const contests = await loadContests();
        openFormModal({
          title: 'تخصيص فئة المسابقة',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'targetCategory', label: 'الفئة المستهدفة', type: 'select', options: [{ value: 'all', label: 'الكل' }, { value: 'streamers', label: 'ستريمرز فقط' }, { value: 'players', label: 'لاعبون فقط' }] }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { targetCategory: v.targetCategory }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'عرض إحصائيات مشاركة المسابقة',
      keywords: 'احصائيات مشاركة مسابقة',
      run: async () => {
        const contests = await loadContests();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">المسابقة</span><select class="admin-input" id="st-select">${contests.map((c) => `<option value="${c.id}">${c.name}</option>`).join('') || '<option>ولا مسابقة</option>'}</select></div><div id="st-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'إحصائيات المشاركة', bodyEl: body, size: 'sm' });
        async function draw() {
          const contest = contests.find((c) => c.id === body.querySelector('#st-select').value);
          if (!contest) return;
          const countSnap = await fb.getCountFromServer(fb.query(fb.collection(fb.db, 'levels'), fb.where(contest.criterionField || 'xp', '>', 0)));
          body.querySelector('#st-result').innerHTML = `<p>عدد المشاركين المؤهَّلين (لديهم ${contest.criterionField} > 0): ${fmtNum(countSnap.data().count)}</p>`;
        }
        if (contests.length) { body.querySelector('#st-select').addEventListener('change', draw); draw(); }
      }
    },
    {
      title: 'تصميم بانر إعلان المسابقة من داخل اللوحة',
      keywords: 'تصميم بانر اعلان مسابقة',
      run: async () => {
        const contests = await loadContests();
        openFormModal({
          title: 'بانر المسابقة',
          fields: [
            { key: 'contestId', label: 'المسابقة', type: 'select', options: contests.map((c) => ({ value: c.id, label: c.name })), required: true },
            { key: 'bannerText', label: 'نص البانر', type: 'textarea' },
            { key: 'bannerImageUrl', label: 'رابط صورة البانر' }
          ],
          onSubmit: async (v) => { await fb.updateDoc(fb.doc(fb.db, 'contests', v.contestId), { bannerText: v.bannerText, bannerImageUrl: v.bannerImageUrl }); AdminToast.success('تم الحفظ'); }
        });
      }
    },
    {
      title: 'جدولة مسابقات متكررة تلقائياً (أسبوعية/شهرية)',
      keywords: 'جدولة مسابقات متكررة',
      run: () => {
        openFormModal({
          title: 'مسابقة متكررة',
          fields: [
            { key: 'name', label: 'اسم القالب', required: true },
            { key: 'interval', label: 'التكرار', type: 'select', options: [{ value: 'weekly', label: 'أسبوعي' }, { value: 'monthly', label: 'شهري' }] }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.collection(fb.db, 'recurringContestTemplates')), v);
            AdminToast.success('تم الحفظ — إنشاء المسابقة الفعلية بكل دورة يحتاج تشغيل يدوي من أداة "إنشاء مسابقة" حالياً (بدون Cloud Functions)');
          }
        });
      }
    },
    {
      title: 'تصدير قائمة الفائزين التاريخية كاملة',
      keywords: 'تصدير فائزين تاريخي',
      run: async () => {
        const contests = (await loadContests()).filter((c) => c.winners && c.winners.length);
        const rows = [];
        contests.forEach((c) => (c.winners || []).forEach((w) => rows.push([c.name, w.username])));
        csvDownload('contest-winners.csv', [['المسابقة', 'الفائز'], ...rows]);
        AdminToast.success(`تم تصدير ${rows.length} فائز`);
      }
    }
  ]
});
