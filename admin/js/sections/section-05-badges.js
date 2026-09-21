// ==================== القسم 5 — الشارات والإنجازات ====================
// تعريف الشارات: badgeDefs/{id}. حيازة اللاعب: users/{uid}.badges.
//
// صراحة مهمة (مُراجَعة من كود الموقع الرئيسي): نظام "الإنجازات" الحقيقي
// بالموقع (PROFILE_ACHIEVEMENTS، 14 إنجازاً) **محسوب لحظياً بالمتصفح** من
// levels/{key} + users.soloWinCount/onlineWinCount — ما يُخزَّن بأي كولكشن،
// وما فيه حقل users.badges يقرأه الموقع إطلاقاً. يعني: منح شارة من هنا
// يُسجَّل فعلياً بقاعدة البيانات لكنه **لا يظهر ببروفايل اللاعب** حتى تُربط
// قراءة users.badges بواجهة البروفايل بالموقع الرئيسي. أداة "الإنجازات
// الحقيقية" أدناه تعرض النظام الفعلي الشغّال الآن بدل الإيهام بغيره.
// المكافآت المربوطة (إطار/نقاط) تُطبَّق فعلياً وتصل للاعب: الإطار يُكتب على
// levels/{key}.ownedFrames (المسار الحقيقي) والنقاط على users/{uid}.points.
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload } from '../core/format.js';
import { resolveUidByUsername, framesGrant, levelsKey } from '../core/players.js';

const fb = AdminFB;
const RARE_HOLDER_THRESHOLD = 20;

async function listBadges() {
  const snap = await fb.getDocs(fb.collection(fb.db, 'badgeDefs'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function countHolders(badgeId) {
  const snap = await fb.getCountFromServer(fb.query(fb.collection(fb.db, 'users'), fb.where('badges', 'array-contains', badgeId)));
  return snap.data().count;
}

defineSection({
  id: 5,
  title: 'الشارات والإنجازات',
  description: 'badgeDefs + users.badges يُداران هنا بالكامل — لكن بروفايل الموقع يعرض حالياً نظام الإنجازات المحسوب تلقائياً فقط (أداة \'الإنجازات الحقيقية\' أدناه).',
  tools: [
    {
      title: 'إنشاء شارة جديدة (اسم، أيقونة، وصف)',
      keywords: 'انشاء شارة جديدة',
      run: () => {
        openFormModal({
          title: 'شارة جديدة',
          fields: [
            { key: 'id', label: 'معرّف الشارة (إنجليزي)', required: true },
            { key: 'name', label: 'الاسم', required: true },
            { key: 'icon', label: 'رابط الأيقونة' },
            { key: 'description', label: 'الوصف', type: 'textarea' }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'badgeDefs', v.id), { name: v.name, icon: v.icon || null, description: v.description || null, priority: 0, createdAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.create', actionLabel: 'إنشاء شارة جديدة', targetType: 'badge', targetId: v.id });
            AdminToast.success('تم الإنشاء');
          }
        });
      }
    },
    {
      title: 'تحديد شرط الحصول التلقائي على شارة',
      keywords: 'شرط حصول تلقائي شارة xp',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'شرط الحصول التلقائي',
          fields: [
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true },
            { key: 'conditionType', label: 'نوع الشرط', type: 'select', options: [{ value: 'xp', label: 'XP معيّن' }, { value: 'gamesPlayed', label: 'عدد ألعاب' }] },
            { key: 'conditionValue', label: 'القيمة', type: 'number' }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'badgeDefs', v.badgeId), { condition: { type: v.conditionType, value: Number(v.conditionValue) } });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.condition', actionLabel: 'تحديد شرط حصول تلقائي', targetType: 'badge', targetId: v.badgeId, after: { type: v.conditionType, value: v.conditionValue } });
            AdminToast.success('تم الحفظ — يُستخدم كمرجع للمنح اليدوي حالياً (منح تلقائي فوري يحتاج مرحلة قادمة)');
          }
        });
      }
    },
    {
      title: 'منح شارة يدوياً لاعب محدد',
      keywords: 'منح شارة يدوي لاعب',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'منح شارة',
          fields: [
            { key: 'username', label: 'اسم المستخدم', required: true },
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true }
          ],
          onSubmit: async (v) => {
            const badge = badges.find((b) => b.id === v.badgeId);
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            if (badge.limitedCount) {
              const holders = await countHolders(v.badgeId);
              if (holders >= badge.limitedCount) throw new Error(`هذي شارة محدودة (${badge.limitedCount}) واكتمل العدد`);
            }
            await fb.updateDoc(fb.doc(fb.db, 'users', uid), { badges: fb.arrayUnion(v.badgeId) });
            if (badge.rewardFrameId) await framesGrant(v.username, badge.rewardFrameId);
            if (badge.rewardPoints) await fb.updateDoc(fb.doc(fb.db, 'users', uid), { points: fb.increment(Number(badge.rewardPoints)) });
            const holdersAfter = await countHolders(v.badgeId);
            if (holdersAfter <= RARE_HOLDER_THRESHOLD) {
              await fb.setDoc(fb.doc(fb.collection(fb.db, 'notifications', uid, 'items')), { type: 'adminMessage', message: `مبروك! حصلت على شارة نادرة: ${badge.name}`, fromLabel: 'إدارة المنصة', read: false, createdAt: fb.serverTimestamp() });
            }
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.grant', actionLabel: 'منح شارة يدوياً', targetType: 'user', targetId: uid, targetLabel: v.username, after: { badgeId: v.badgeId } });
            AdminToast.success('تم المنح' + (badge.rewardFrameId || badge.rewardPoints ? ' + المكافآت المربوطة' : ''));
          }
        });
      }
    },
    {
      title: 'سحب شارة من لاعب',
      keywords: 'سحب شارة لاعب',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'سحب شارة',
          fields: [
            { key: 'username', label: 'اسم المستخدم', required: true },
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true }
          ],
          onSubmit: async (v) => {
            const uid = await resolveUidByUsername(v.username);
            if (!uid) throw new Error('ما لقيت هذا المستخدم');
            await fb.updateDoc(fb.doc(fb.db, 'users', uid), { badges: fb.arrayRemove(v.badgeId) });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.revoke', actionLabel: 'سحب شارة من لاعب', targetType: 'user', targetId: uid, targetLabel: v.username, after: { badgeId: v.badgeId }, sensitive: true });
            AdminToast.success('تم السحب');
          }
        });
      }
    },
    {
      title: 'عرض كل الشارات وعدد من يملك كل واحدة',
      keywords: 'كل الشارات عدد ملاك',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'كل الشارات', bodyEl: body, size: 'lg' });
        const badges = await listBadges();
        const counts = await Promise.all(badges.map((b) => countHolders(b.id)));
        body.innerHTML = badges.length ? `<table class="admin-table"><thead><tr><th>الشارة</th><th>عدد الحائزين</th></tr></thead><tbody>${badges.map((b, i) => `<tr><td class="is-primary" data-label="الشارة">${b.name}</td><td data-label="العدد">${fmtNum(counts[i])}</td></tr>`).join('')}</tbody></table>` : '<p>ولا شارة بعد</p>';
      }
    },
    {
      title: 'ترتيب أولوية عرض الشارات في البروفايل',
      keywords: 'ترتيب اولوية شارات',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'أولوية عرض شارة',
          fields: [
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true },
            { key: 'priority', label: 'الأولوية (رقم أكبر = أول بالعرض)', type: 'number', value: 0 }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'badgeDefs', v.badgeId), { priority: Number(v.priority) });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.priority', actionLabel: 'تعديل أولوية عرض شارة', targetType: 'badge', targetId: v.badgeId, after: { priority: v.priority } });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تعديل تصميم شارة موجودة',
      keywords: 'تعديل تصميم شارة',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'تعديل تصميم شارة',
          fields: [
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true },
            { key: 'icon', label: 'رابط الأيقونة الجديد', required: true }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'badgeDefs', v.badgeId), { icon: v.icon });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.editIcon', actionLabel: 'تعديل تصميم شارة', targetType: 'badge', targetId: v.badgeId });
            AdminToast.success('تم التحديث');
          }
        });
      }
    },
    {
      title: 'حذف شارة نهائياً من النظام',
      keywords: 'حذف شارة نهائي',
      run: async () => {
        const badges = await listBadges();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الشارة</span><select class="admin-input" id="bd-del">${badges.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></div>
        <button class="admin-btn admin-btn--danger admin-btn--sm" id="bd-del-go" style="margin-top:8px;">حذف نهائياً</button>`;
        const modal = openModal({ title: 'حذف شارة', bodyEl: body, size: 'sm' });
        body.querySelector('#bd-del-go').addEventListener('click', () => {
          const badgeId = body.querySelector('#bd-del').value;
          openConfirm({
            title: 'تأكيد الحذف', danger: true, doubleConfirm: true,
            message: 'يحذف الشارة من التعريف ومن كل من يملكها.',
            onConfirm: async () => {
              const holdersSnap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('badges', 'array-contains', badgeId)));
              await Promise.all(holdersSnap.docs.map((d) => fb.updateDoc(fb.doc(fb.db, 'users', d.id), { badges: fb.arrayRemove(badgeId) })));
              await fb.deleteDoc(fb.doc(fb.db, 'badgeDefs', badgeId));
              await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.delete', actionLabel: 'حذف شارة نهائياً', targetType: 'badge', targetId: badgeId, sensitive: true });
              AdminToast.success('تم الحذف');
              modal.close();
            }
          });
        });
      }
    },
    {
      title: 'ربط شارة بمكافأة (نقاط إضافية، إطار، لقب)',
      keywords: 'ربط شارة مكافأة نقاط اطار',
      run: async () => {
        const [badges, framesSnap] = await Promise.all([listBadges(), fb.getDocs(fb.collection(fb.db, 'framesCatalogExtra'))]);
        const frames = framesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        openFormModal({
          title: 'ربط مكافأة بشارة',
          fields: [
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true },
            { key: 'rewardPoints', label: 'نقاط إضافية عند المنح', type: 'number' },
            { key: 'rewardFrameId', label: 'إطار يُمنح تلقائياً معها', type: 'select', options: [{ value: '', label: '(بدون)' }, ...frames.map((f) => ({ value: f.id, label: f.name }))] },
            { key: 'rewardTitle', label: 'لقب يُمنح مع الشارة' }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'badgeDefs', v.badgeId), { rewardPoints: Number(v.rewardPoints) || 0, rewardFrameId: v.rewardFrameId || null, rewardTitle: v.rewardTitle || null });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.reward', actionLabel: 'ربط مكافأة بشارة', targetType: 'badge', targetId: v.badgeId, after: v });
            AdminToast.success('تم الحفظ — تُطبَّق تلقائياً بأداة "منح شارة يدوياً"');
          }
        });
      }
    },
    {
      title: 'تفعيل شارة "محدودة" تُمنح لأول 100 لاعب فقط',
      keywords: 'شارة محدودة اول 100',
      run: async () => {
        const badges = await listBadges();
        openFormModal({
          title: 'تحديد شارة محدودة',
          fields: [
            { key: 'badgeId', label: 'الشارة', type: 'select', options: badges.map((b) => ({ value: b.id, label: b.name })), required: true },
            { key: 'limitedCount', label: 'الحد الأقصى لعدد الحائزين', type: 'number', value: 100, required: true }
          ],
          onSubmit: async (v) => {
            await fb.updateDoc(fb.doc(fb.db, 'badgeDefs', v.badgeId), { limitedCount: Number(v.limitedCount) });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.limited', actionLabel: 'تفعيل شارة محدودة', targetType: 'badge', targetId: v.badgeId, after: { limitedCount: v.limitedCount } });
            AdminToast.success('تم — أداة المنح اليدوي ترفض المنح تلقائياً بعد اكتمال العدد');
          }
        });
      }
    },
    {
      title: 'تقرير بأندر الشارات وأكثرها شيوعاً',
      keywords: 'تقرير اندر شارات اكثرها شيوعا',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أندر/أشيع الشارات', bodyEl: body, size: 'lg' });
        const badges = await listBadges();
        const counts = await Promise.all(badges.map((b) => countHolders(b.id)));
        const sorted = badges.map((b, i) => ({ ...b, count: counts[i] })).sort((a, b) => a.count - b.count);
        body.innerHTML = sorted.length ? `<table class="admin-table"><thead><tr><th>الشارة</th><th>عدد الحائزين</th></tr></thead><tbody>${sorted.map((b) => `<tr><td class="is-primary" data-label="الشارة">${b.name}</td><td data-label="العدد">${fmtNum(b.count)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا بيانات</p>';
      }
    },
    {
      title: 'إنشاء شارة موسمية بتاريخ بداية ونهاية',
      keywords: 'شارة موسمية بداية نهاية',
      run: () => {
        openFormModal({
          title: 'شارة موسمية جديدة',
          fields: [
            { key: 'id', label: 'معرّف الشارة', required: true },
            { key: 'name', label: 'الاسم', required: true },
            { key: 'startDate', label: 'تاريخ البداية', type: 'date', required: true },
            { key: 'endDate', label: 'تاريخ النهاية', type: 'date', required: true }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(fb.doc(fb.db, 'badgeDefs', v.id), { name: v.name, seasonal: true, startDate: new Date(v.startDate), endDate: new Date(v.endDate), createdAt: fb.serverTimestamp() });
            await AdminAudit.log({ section: 5, sectionTitle: 'الشارات والإنجازات', actionKey: 'badges.seasonal', actionLabel: 'إنشاء شارة موسمية', targetType: 'badge', targetId: v.id });
            AdminToast.success('تم الإنشاء');
          }
        });
      }
    },
    {
      title: 'إرسال إشعار تلقائي عند حصول لاعب على شارة نادرة',
      keywords: 'اشعار تلقائي شارة نادرة',
      meta: `يعمل تلقائياً بأداة "منح شارة يدوياً" — أي شارة يقل حائزوها عن ${RARE_HOLDER_THRESHOLD} تُرسل إشعاراً فوراً`,
      run: () => AdminToast.info(`مفعّل تلقائياً: أي منح لشارة عدد حائزيها ≤ ${RARE_HOLDER_THRESHOLD} يرسل إشعار تهنئة تلقائي`)
    },
    {
      title: 'معاينة الشارة كما ستظهر في البروفايل قبل النشر',
      keywords: 'معاينة شارة بروفايل',
      run: async () => {
        const badges = await listBadges();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الشارة</span><select class="admin-input" id="bd-prev">${badges.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></div>
        <div id="bd-prev-box" style="margin-top:14px;display:flex;align-items:center;gap:10px;"></div>`;
        openModal({ title: 'معاينة الشارة', bodyEl: body, size: 'sm' });
        function draw() {
          const b = badges.find((x) => x.id === body.querySelector('#bd-prev').value);
          body.querySelector('#bd-prev-box').innerHTML = b ? `${b.icon ? `<img src="${b.icon}" style="width:32px;height:32px;" />` : ''}<span>${b.name}</span>` : '';
        }
        body.querySelector('#bd-prev').addEventListener('change', draw);
        draw();
      }
    },
    {
      title: 'تصدير قائمة اللاعبين الحاصلين على شارة معيّنة',
      keywords: 'تصدير لاعبين حاصلين شارة',
      run: async () => {
        const badges = await listBadges();
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">الشارة</span><select class="admin-input" id="bd-exp">${badges.map((b) => `<option value="${b.id}">${b.name}</option>`).join('')}</select></div>
        <button class="admin-btn admin-btn--primary admin-btn--sm" id="bd-exp-go" style="margin-top:8px;">تصدير</button>`;
        const modal = openModal({ title: 'تصدير حائزي شارة', bodyEl: body, size: 'sm' });
        body.querySelector('#bd-exp-go').addEventListener('click', async () => {
          const badgeId = body.querySelector('#bd-exp').value;
          const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'users'), fb.where('badges', 'array-contains', badgeId)));
          csvDownload(`${badgeId}-holders.csv`, [['اليوزر', 'تاريخ التسجيل'], ...snap.docs.map((d) => [d.data().username, fmtDate(d.data().createdAt)])]);
          AdminToast.success(`تم تصدير ${snap.size} لاعب`);
          modal.close();
        });
      }
    },
    {
      title: 'الإنجازات الحقيقية المعروضة ببروفايل اللاعبين (14 إنجازاً)',
      keywords: 'انجازات حقيقية بروفايل محسوبة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ الحساب من levels + users...';
        openModal({ title: 'الإنجازات الحقيقية — محسوبة كما يحسبها الموقع', bodyEl: body, size: 'xl' });
        const [levelsSnap, usersSnap] = await Promise.all([
          fb.getDocs(fb.collection(fb.db, 'levels')),
          fb.getDocs(fb.collection(fb.db, 'users'))
        ]);
        // users مفهرسة بيوزرنيم مطبَّع عشان نطابقها بمفاتيح levels.
        const byName = new Map();
        usersSnap.docs.forEach((d) => {
          const v = d.data() || {};
          if (v.username) byName.set(levelsKey(v.username), v);
        });
        // نفس قائمة PROFILE_ACHIEVEMENTS الحرفية بالموقع الرئيسي ونفس شروطها.
        const ACHV = [
          ['lvl5', 'الخطوة الأولى', (d) => d.level >= 5], ['lvl10', 'لاعب نشيط', (d) => d.level >= 10],
          ['lvl20', 'محترف', (d) => d.level >= 20], ['lvl30', 'أسطورة', (d) => d.level >= 30],
          ['rounds10', 'بداية الطريق', (d) => d.roundsPlayed >= 10], ['rounds50', 'مدمن ألعاب', (d) => d.roundsPlayed >= 50],
          ['rounds200', 'محترف الراوندات', (d) => d.roundsPlayed >= 200],
          ['solo5', 'بطل الفردي', (d) => d.soloWinCount >= 5], ['solo20', 'أسطورة الفردي', (d) => d.soloWinCount >= 20],
          ['online5', 'بطل الأونلاين', (d) => d.onlineWinCount >= 5], ['online20', 'أسطورة الأونلاين', (d) => d.onlineWinCount >= 20],
          ['frames1', 'مزيّن', (d) => d.ownedFramesCount >= 1],
          ['games3', 'متنوع', (d) => d.gamesVariety >= 3], ['games8', 'مستكشف الألعاب', (d) => d.gamesVariety >= 8]
        ];
        const counts = new Map(ACHV.map(([id]) => [id, 0]));
        let scanned = 0;
        levelsSnap.docs.forEach((ld) => {
          const l = ld.data() || {};
          const u = byName.get(levelsKey(l.username || ld.id)) || {};
          const d = {
            level: Number(l.level) || 1,
            roundsPlayed: Number(l.roundsPlayed) || 0,
            soloWinCount: Number(u.soloWinCount) || 0,
            onlineWinCount: Number(u.onlineWinCount) || 0,
            ownedFramesCount: Array.isArray(l.ownedFrames) ? l.ownedFrames.length : 0,
            gamesVariety: Object.keys(l.gamesPlayCount || {}).length
          };
          scanned++;
          ACHV.forEach(([id, , check]) => { if (check(d)) counts.set(id, counts.get(id) + 1); });
        });
        body.innerHTML = `
          <p class="admin-field__hint">محسوبة الآن من ${fmtNum(levelsSnap.size)} سجل مستويات — بنفس شروط PROFILE_ACHIEVEMENTS بالموقع الرئيسي حرفياً. هذي هي الإنجازات الوحيدة اللي يشوفها اللاعب فعلاً ببروفايله.</p>
          <table class="admin-table"><thead><tr><th>الإنجاز</th><th>المعرّف</th><th>عدد من حققه</th></tr></thead>
          <tbody>${ACHV.map(([id, name]) => `<tr><td class="is-primary" data-label="الإنجاز">${name}</td><td data-label="المعرّف">${id}</td><td data-label="العدد">${fmtNum(counts.get(id))}</td></tr>`).join('')}</tbody></table>`;
      }
    }
  ]
});
