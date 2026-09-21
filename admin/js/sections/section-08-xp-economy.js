// ==================== القسم 8 — الاقتصاد الداخلي (XP) ====================
// تصحيح جوهري (مُراجَع من كود الموقع الرئيسي): XP واللفل وroundsPlayed
// **ليست** على users/{uid} — الموقع يخزّنها على levels/{key} (المفتاح =
// levelsKey(username))، ويكتبها حصرياً بـlevelsCommit() كمعاملة. حقول users
// الحقيقية المرتبطة بالنقاط هي onlinePoints/onlineWinCount/soloWinCount فقط.
// كانت كل أدوات هذا القسم تقرأ users.xp (حقل غير موجود) فتعرض أصفاراً
// دائماً، وتكتب عليه فما يتأثر شي بالموقع. الآن كلها على levels/{key}.
// إعدادات المعادلة/العتبات/المضاعفة تُحفظ بـgameConfig/xpEconomy — الموقع
// لا يقرأها بعد (معلَّم بوضوح على كل أداة منها).
import { AdminFB } from '../core/firebase.js';
import { AdminAudit } from '../core/audit.js';
import { openModal, openConfirm, openFormModal, isReadOnly } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtDate, fmtNum, csvDownload, printReport } from '../core/format.js';
import { renderBarChart } from '../core/chart.js';
import { resolveUidByUsername, levelsKeysForUsername, xpSetForKeys } from '../core/players.js';

const fb = AdminFB;
const CFG = () => fb.doc(fb.db, 'gameConfig', 'xpEconomy');

async function getCfg() { const s = await fb.getDoc(CFG()); return s.exists() ? s.data() : {}; }
// سجلات المستويات الحقيقية — مصدر XP/اللفل الوحيد بالموقع.
async function loadLevelsCapped(limitN) {
  const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'levels'), fb.limit(limitN || 5000)));
  return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
}

defineSection({
  id: 8,
  title: 'الاقتصاد الداخلي (XP)',
  description: 'XP واللفل الحقيقيان من levels/{key} (نفس مصدر الموقع) — إعدادات المعادلة بـgameConfig/xpEconomy لا يقرأها الموقع بعد.',
  tools: [
    {
      title: 'منحنى توزيع اللاعبين حسب اللفل الحالي',
      keywords: 'توزيع لاعبين لفل',
      run: async () => {
        const rows = await loadLevelsCapped();
        const buckets = new Map();
        rows.forEach((u) => { const lvl = u.level || 0; buckets.set(lvl, (buckets.get(lvl) || 0) + 1); });
        const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
        const body = document.createElement('div');
        body.innerHTML = sorted.length ? renderBarChart({ labels: sorted.map((s) => 'لفل ' + s[0]), values: sorted.map((s) => s[1]), height: 220 }) : '<p>ولا بيانات</p>';
        openModal({ title: 'توزيع اللاعبين حسب اللفل', bodyEl: body, size: 'xl' });
      }
    },
    {
      title: 'متوسط XP المكتسب يومياً لكل لاعب',
      keywords: 'متوسط xp يومي',
      badge: 'بيانات غير متوفرة بعد',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>يحتاج سجل تغييرات XP اليومي (delta log) غير موجود حالياً — الموجود فقط هو الرصيد الحالي.</p>'; openModal({ title: 'متوسط XP يومي', bodyEl: b, size: 'sm' }); }
    },
    {
      title: 'تعديل معادلة تحويل النقاط إلى XP',
      keywords: 'معادلة تحويل نقاط xp',
      run: async () => {
        const cfg = await getCfg();
        openFormModal({
          title: 'معادلة تحويل النقاط إلى XP',
          fields: [{ key: 'pointsToXpRate', label: 'كل نقطة تساوي كم XP', type: 'number', value: cfg.pointsToXpRate || 1, step: '0.1' }],
          onSubmit: async (v) => {
            await fb.setDoc(CFG(), { pointsToXpRate: Number(v.pointsToXpRate) }, { merge: true });
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.rate', actionLabel: 'تعديل معادلة تحويل النقاط', after: v, sensitive: true });
            AdminToast.success('تم الحفظ — القيمة محفوظة بـgameConfig/xpEconomy، استخدم "محاكاة" لمعاينة الأثر');
          }
        });
      }
    },
    {
      title: 'تعديل عتبات اللفل',
      keywords: 'عتبات لفل تعديل',
      run: async () => {
        const cfg = await getCfg();
        openFormModal({
          title: 'عتبات اللفل',
          fields: [{ key: 'levelThresholds', label: 'XP لكل لفل (مفصولة بفاصلة، بالترتيب)', type: 'textarea', value: (cfg.levelThresholds || []).join(', '), placeholder: '100, 300, 700, 1500' }],
          onSubmit: async (v) => {
            const arr = v.levelThresholds.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n));
            await fb.setDoc(CFG(), { levelThresholds: arr }, { merge: true });
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.thresholds', actionLabel: 'تعديل عتبات اللفل', after: { levelThresholds: arr }, sensitive: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'حدث "مضاعفة XP" مؤقت لفترة زمنية محددة',
      keywords: 'مضاعفة xp حدث مؤقت',
      run: async () => {
        const cfg = await getCfg();
        openFormModal({
          title: 'مضاعفة XP مؤقتة',
          fields: [
            { key: 'multiplier', label: 'المضاعف', type: 'number', value: cfg.doubleXpMultiplier || 2, step: '0.5' },
            { key: 'untilDate', label: 'حتى تاريخ', type: 'date' }
          ],
          onSubmit: async (v) => {
            await fb.setDoc(CFG(), { doubleXpMultiplier: Number(v.multiplier), doubleXpUntil: v.untilDate ? new Date(v.untilDate) : null }, { merge: true });
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.multiplier', actionLabel: 'تفعيل مضاعفة XP', after: v });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'تقرير أعلى 50 لاعب من حيث XP',
      keywords: 'اعلى 50 لاعب xp',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أعلى 50 لاعب XP', bodyEl: body, size: 'lg' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'levels'), fb.orderBy('xp', 'desc'), fb.limit(50)));
        const rows = snap.docs.map((d) => ({ key: d.id, ...d.data() }));
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>#</th><th>المفتاح/اليوزر</th><th>اللفل</th><th>XP</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td data-label="#">${i + 1}</td><td class="is-primary" data-label="اليوزر">${r.username || r.key}</td><td data-label="اللفل">${fmtNum(r.level || 1)}</td><td data-label="XP">${fmtNum(r.xp || 0)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا سجل مستويات بعد</p>';
      }
    },
    {
      title: 'تصحيح خطأ في رصيد XP للاعب معيّن يدوياً',
      keywords: 'تصحيح خطأ رصيد xp',
      run: () => {
        openFormModal({
          title: 'تصحيح رصيد XP',
          fields: [
            { key: 'username', label: 'اسم المستخدم', required: true },
            { key: 'newXp', label: 'الرصيد الصحيح', type: 'number', required: true },
            { key: 'reason', label: 'سبب التصحيح', required: true }
          ],
          onSubmit: async (v) => {
            const keys = await levelsKeysForUsername(v.username);
            if (!keys.length) throw new Error('ما لقيت هذا المستخدم');
            const beforeSnap = await fb.getDoc(fb.doc(fb.db, 'levels', keys[0]));
            const beforeXp = beforeSnap.exists() ? (beforeSnap.data().xp || 0) : 0;
            // نكتب xp و level معاً بنفس معادلة الموقع — كتابة xp لحالها كانت
            // تخلّي حقل level قديماً بالبروفايل وقائمة المستويات لحد ما يلعب
            // الشخص راوند جديد (لأن الموقع ما يعيد حسابه إلا داخل levelsCommit).
            const res = await xpSetForKeys(keys, Number(v.newXp));
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.correct', actionLabel: 'تصحيح رصيد XP', targetType: 'levels', targetId: keys.join(','), targetLabel: v.username, before: { xp: beforeXp }, after: { xp: res.xp, level: res.level }, note: v.reason, sensitive: true });
            AdminToast.success('تم التصحيح على ' + keys.length + ' مفتاح — XP ' + res.xp + ' واللفل ' + res.level);
          }
        });
      }
    },
    {
      title: 'عرض إجمالي XP الممنوح في النظام كله',
      keywords: 'اجمالي xp نظام',
      run: async () => {
        const rows = await loadLevelsCapped();
        const total = rows.reduce((s, u) => s + (u.xp || 0), 0);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-stat-card"><div class="admin-stat-card__label">إجمالي XP (${fmtNum(rows.length)} سجل مستويات)</div><div class="admin-stat-card__value">${fmtNum(total)}</div></div>`;
        openModal({ title: 'إجمالي XP بالنظام', bodyEl: body, size: 'sm' });
      }
    },
    {
      title: 'تجميد نظام XP مؤقتاً أثناء الصيانة',
      keywords: 'تجميد نظام xp صيانة',
      run: async () => {
        const cfg = await getCfg();
        openConfirm({
          title: cfg.frozen ? 'إلغاء تجميد XP' : 'تجميد نظام XP',
          message: cfg.frozen ? 'يعيد السماح بمنح/خصم XP بشكل طبيعي.' : 'يسجّل حالة تجميد بـgameConfig/xpEconomy.frozen — يحتاج قراءة هذا الحقل من كود منح XP بالموقع الرئيسي لإيقافه فعلياً هناك.',
          onConfirm: async () => {
            await fb.setDoc(CFG(), { frozen: !cfg.frozen }, { merge: true });
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.freeze', actionLabel: cfg.frozen ? 'إلغاء تجميد XP' : 'تجميد نظام XP', sensitive: true });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'ربط مكافأة تلقائية عند الوصول للفل معيّن',
      keywords: 'مكافأة تلقائية لفل',
      run: async () => {
        const cfg = await getCfg();
        openFormModal({
          title: 'مكافأة عند الوصول للفل',
          fields: [
            { key: 'level', label: 'اللفل', type: 'number', required: true },
            { key: 'points', label: 'نقاط مكافأة' }
          ],
          onSubmit: async (v) => {
            const rewards = cfg.levelRewards || {};
            rewards[v.level] = { points: Number(v.points) || 0 };
            await fb.setDoc(CFG(), { levelRewards: rewards }, { merge: true });
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.levelReward', actionLabel: 'ربط مكافأة بلفل', after: v });
            AdminToast.success('تم الحفظ');
          }
        });
      }
    },
    {
      title: 'سجل كل التعديلات اليدوية على XP/النقاط مع السبب',
      keywords: 'سجل تعديلات يدوية xp',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => (r.actionKey || '').includes('xp') || r.actionKey === 'players.editXp');
        const body = document.createElement('div');
        body.innerHTML = rows.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الإجراء</th><th>الهدف</th><th>السبب</th></tr></thead><tbody>${rows.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td data-label="الإجراء" class="is-primary">${r.actionLabel}</td><td data-label="الهدف">${r.targetLabel || r.targetId || '—'}</td><td data-label="السبب">${r.note || '—'}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تعديل مسجَّل بعد</p>';
        openModal({ title: 'سجل تعديلات XP/النقاط', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'محاكاة (simulation) تأثير تغيير معادلة قبل تطبيقها فعلياً',
      keywords: 'محاكاة تاثير معادلة xp',
      run: async () => {
        const rows = await loadLevelsCapped(500);
        const body = document.createElement('div');
        body.innerHTML = `<div class="admin-field"><span class="admin-field__label">معدّل تحويل تجريبي</span><input class="admin-input" id="sim-rate" type="number" value="1" step="0.1" /></div><button class="admin-btn admin-btn--primary admin-btn--sm" id="sim-go" style="margin-top:8px;">محاكاة</button><div id="sim-result" style="margin-top:10px;"></div>`;
        openModal({ title: 'محاكاة تغيير المعادلة (عينة 500 حساب)', bodyEl: body, size: 'md' });
        body.querySelector('#sim-go').addEventListener('click', () => {
          const rate = Number(body.querySelector('#sim-rate').value);
          const before = rows.reduce((s, u) => s + (u.xp || 0), 0);
          const after = rows.reduce((s, u) => s + (u.xp || 0) * rate, 0);
          body.querySelector('#sim-result').innerHTML = `<p>XP الحالي الإجمالي (العينة): ${fmtNum(before)}</p><p>XP لو طبّقنا المعدّل الجديد على النقاط الحالية: ${fmtNum(Math.round(after))}</p>`;
        });
      }
    },
    {
      title: 'تصدير تقرير اقتصادي شامل للفريق أو للمراجعة',
      keywords: 'تصدير تقرير اقتصادي شامل',
      run: async () => {
        const rows = await loadLevelsCapped();
        const total = rows.reduce((s, u) => s + (u.xp || 0), 0);
        const avgLevel = rows.length ? (rows.reduce((s, u) => s + (u.level || 0), 0) / rows.length).toFixed(1) : 0;
        printReport('التقرير الاقتصادي الشامل', `<p>عدد سجلات المستويات: ${rows.length}</p><p>إجمالي XP: ${total}</p><p>متوسط اللفل: ${avgLevel}</p>`);
      }
    },
    {
      title: 'تنبيه عند اكتشاف نمط غير طبيعي (تضخم XP مفاجئ)',
      keywords: 'نمط غير طبيعي تضخم xp',
      run: async () => {
        const rows = (await AdminAudit.fetchAllForExport()).filter((r) => r.actionKey === 'xp.correct' || r.actionKey === 'players.editXp');
        const suspicious = rows.filter((r) => {
          const before = r.before && r.before.xp || 0;
          const after = (r.after && r.after.xp) || 0;
          return after - before > 10000;
        });
        const body = document.createElement('div');
        body.innerHTML = suspicious.length ? `<table class="admin-table"><thead><tr><th>الوقت</th><th>الهدف</th><th>الفرق</th></tr></thead><tbody>${suspicious.map((r) => `<tr><td data-label="الوقت">${fmtDate(r.tsClient)}</td><td class="is-primary" data-label="الهدف">${r.targetLabel}</td><td data-label="الفرق">+${(r.after.xp || 0) - (r.before.xp || 0)}</td></tr>`).join('')}</tbody></table>` : '<p>ولا تضخم غير طبيعي مكتشف بسجل التعديلات اليدوية</p>';
        openModal({ title: 'كشف تضخم XP غير طبيعي', bodyEl: body, size: 'lg' });
      }
    },
    {
      title: 'إعادة ضبط XP لموسم جديد مع أرشفة الموسم السابق',
      keywords: 'اعادة ضبط xp موسم جديد ارشفة',
      run: () => {
        openConfirm({
          title: 'إعادة ضبط XP لموسم جديد', danger: true, doubleConfirm: true,
          message: 'يؤرشف XP/اللفل الحالي لكل الحسابات بمجموعة xpSeasonsArchive، ثم يصفّرها للجميع. لا يمكن التراجع عنه.',
          onConfirm: async () => {
            const rows = await loadLevelsCapped(5000);
            const seasonId = 'season-' + Date.now();
            await Promise.all(rows.map((u) => fb.setDoc(fb.doc(fb.db, 'xpSeasonsArchive', seasonId, 'players', u.key), { username: u.username || u.key, xp: u.xp || 0, level: u.level || 1, roundsPlayed: u.roundsPlayed || 0 })));
            await Promise.all(rows.map((u) => fb.setDoc(fb.doc(fb.db, 'levels', u.key), { xp: 0, level: 1 }, { merge: true })));
            await AdminAudit.log({ section: 8, sectionTitle: 'الاقتصاد الداخلي (XP)', actionKey: 'xp.seasonReset', actionLabel: 'إعادة ضبط XP لموسم جديد', after: { seasonId, count: rows.length }, sensitive: true });
            AdminToast.success(`تمت الأرشفة (${seasonId}) وإعادة الضبط لـ${rows.length} سجل`);
          }
        });
      }
    }
  ]
});
