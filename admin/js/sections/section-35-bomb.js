// ==================== القسم 35 — لعبة القنبلة المتحركة (bomb) ====================
// تصحيح مهم: هذا القسم كان مسجَّلاً بخطة العمل الأولى باسم "لعبة مصيرك" —
// تبيّن إن "مصيرك" مجرد جملة نص داخل واجهة "جسر المصير" (قسم 34) نفسها،
// مو لعبة منفصلة أصلاً. استبدلناه بلعبة حقيقية منفصلة تماماً وناقصة تغطية
// (data-tag="bomb"، "القنبلة المتحركة") بدل تكرار قسم 34.
import { AdminFB } from '../core/firebase.js';
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { fmtNum } from '../core/format.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const fb = AdminFB;
const TAG = 'bomb';
const NAME = 'القنبلة المتحركة';

defineSection({
  id: 35,
  title: 'لعبة القنبلة المتحركة',
  description: 'لعبة حظ وإقصاء (data-category: luck) — نفس اللعبة لها نسخة أونلاين مستقلة (obomb) بقسم 42. الجلسات والنتائج من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    {
      title: 'أكثر اللاعبين "انفجاراً" (إقصاءً) هذا الشهر',
      keywords: 'اكثر لاعبين انفجارا اقصاء قنبلة',
      run: async () => {
        const body = document.createElement('div');
        body.textContent = 'جارٍ التحميل...';
        openModal({ title: 'أكثر اللاعبين إقصاءً — القنبلة المتحركة', bodyEl: body, size: 'md' });
        const since = Date.now() - 30 * 86400000;
        const snap = await fb.getDocs(fb.query(fb.collection(fb.db, 'playEvents'), fb.orderBy('createdAt', 'desc'), fb.limit(3000)));
        const rows = snap.docs.map((d) => d.data()).filter((r) => r.gameTag === TAG && r.eliminatedUsername);
        const counts = new Map();
        rows.forEach((r) => counts.set(r.eliminatedUsername, (counts.get(r.eliminatedUsername) || 0) + 1));
        const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        body.innerHTML = top.length ? `<table class="admin-table"><thead><tr><th>اللاعب</th><th>عدد مرات الإقصاء</th></tr></thead><tbody>${top.map(([u, c]) => `<tr><td class="is-primary" data-label="اللاعب">${u}</td><td data-label="العدد">${fmtNum(c)}</td></tr>`).join('')}</tbody></table>` : '<p>ما فيه حقل eliminatedUsername مسجَّل بـplayEvents لهذي اللعبة حالياً.</p>';
      }
    },
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'passSpeedMs', label: 'سرعة تمرير القنبلة (مللي ثانية)', type: 'number', value: 3000 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
