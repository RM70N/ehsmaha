// ==================== القسم 32 — لعبة الضوء الأخضر الضوء الأحمر (rlgl) ====================
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum } from '../core/format.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const fb = AdminFB;
const TAG = 'rlgl';
const NAME = 'الضوء الأخضر الضوء الأحمر';

defineSection({
  id: 32,
  title: 'لعبة الضوء الأخضر الضوء الأحمر',
  description: 'لعبة حظ وإقصاء (data-category: luck) مدعومة أيضاً بتوزيع A/B من قسم 27 — الجلسات والنتائج من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    {
      title: 'متوسط عدد الناجين لكل جولة',
      keywords: 'متوسط ناجين جولة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'متوسط الناجين — الضوء الأحمر والأخضر', bodyEl: body, size: 'sm' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(2000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === TAG && typeof r.survivorsCount === 'number');
        const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.survivorsCount, 0) / rows.length) : null;
        body.innerHTML = avg != null ? `<div class="admin-stat-card"><div class="admin-stat-card__label">متوسط الناجين لكل جولة (${fmtNum(rows.length)} جولة مسجَّلة)</div><div class="admin-stat-card__value">${avg}</div></div>` : '<p>ما فيه حقل survivorsCount مسجَّل بـplayEvents لهذي اللعبة حالياً — يحتاج تسجيله من كود اللعبة نفسه.</p>';
      }
    },
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'roundDurationSec', label: 'مدة الجولة (ثانية)', type: 'number', value: 45 },
      { key: 'redLightMinMs', label: 'أقل مدة ضوء أحمر (مللي ثانية)', type: 'number', value: 1500 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
