// ==================== القسم 31 — لعبة شد الحبل (tug) ====================
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum } from '../core/format.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const fb = AdminFB;
const TAG = 'tug';
const NAME = 'شد الحبل';

defineSection({
  id: 31,
  title: 'لعبة شد الحبل',
  description: 'لعبة فرق (data-category: teams) — الجلسات والنتائج من activeStreamers/playEvents الحقيقية بفلترة gameTag=tug.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    {
      title: 'إحصائية الفرق الأكثر فوزاً',
      keywords: 'فرق اكثر فوزا شد الحبل',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر الفرق فوزاً — شد الحبل', bodyEl: body, size: 'md' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === TAG && r.winningTeam);
        const counts = new Map();
        rows.forEach((r) => counts.set(r.winningTeam, (counts.get(r.winningTeam) || 0) + 1));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>الفريق</th><th>عدد الفوز</th></tr></thead><tbody>${top.map(([t, c]) => `<tr><td class="is-primary" data-label="الفريق">${t}</td><td data-label="الفوز">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ما فيه تسجيل اسم فريق فائز ببيانات playEvents الحالية لهذي اللعبة — يحتاج تسجيل حقل winningTeam من كود اللعبة نفسه.</p>';
      }
    },
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'roundDurationSec', label: 'مدة الجولة (ثانية)', type: 'number', value: 60 },
      { key: 'pointsPerWin', label: 'نقاط الفوز', type: 'number', value: 10 }
    ]),
    errorLogTool(TAG, NAME),
    {
      title: 'إعادة ضبط جلسة شد حبل عالقة يدوياً',
      keywords: 'اعادة ضبط جلسة عالقة',
      meta: 'استخدم زر "إنهاء الجلسة" بأداة مراقبة الجلسات الجارية أعلاه',
      run: () => AdminToast.info('استخدم "مراقبة جلسات شد الحبل الجارية الآن" أعلاه — زر إنهاء الجلسة يحذف الجلسة العالقة فوراً')
    },
    monthlyExportTool(TAG, NAME)
  ]
});
