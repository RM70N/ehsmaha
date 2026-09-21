// ==================== القسم 33 — لعبة سرقة التاج (cs) ====================
// تصحيح مهم: هذا القسم كان مسجَّلاً بخطة العمل الأولى باسم "نجاة من اللافا"
// — تبيّن لاحقاً إن "نجاة من اللافا" وصف بديل لنفس لعبة "الأراضي البركانية"
// (tag: volcanic-lands، قسم 39 أصلاً) لا لعبة منفصلة، فكان راح يصير تكرار
// كامل لنفس القسم برقمين مختلفين. استبدلناه بلعبة حقيقية منفصلة تماماً
// وناقصة تغطية (data-tag="cs"، "سرقة التاج") بدل تكرار محتوى قسم 39.
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum } from '../core/format.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const fb = AdminFB;
const TAG = 'cs';
const NAME = 'سرقة التاج';

defineSection({
  id: 33,
  title: 'لعبة سرقة التاج',
  description: 'لعبة دردشة (data-category: chat) — الجلسات والنتائج من activeStreamers/playEvents الحقيقية بفلترة gameTag=cs.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    {
      title: 'أكثر اللاعبين نجاحاً بسرقة التاج',
      keywords: 'اكثر لاعبين نجاحا سرقة تاج',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر اللاعبين نجاحاً — سرقة التاج', bodyEl: body, size: 'md' });
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === TAG && r.winnerUsername);
        const counts = new Map();
        rows.forEach((r) => counts.set(r.winnerUsername, (counts.get(r.winnerUsername) || 0) + 1));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>اللاعب</th><th>عدد مرات الفوز بالتاج</th></tr></thead><tbody>${top.map(([u, c]) => `<tr><td class="is-primary" data-label="اللاعب">${u}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ما فيه حقل winnerUsername مسجَّل بـplayEvents لهذي اللعبة حالياً.</p>';
      }
    },
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'roundDurationSec', label: 'مدة الجولة (ثانية)', type: 'number', value: 30 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
