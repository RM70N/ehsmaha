// ==================== القسم 38 — لعبة الكرسي المتحرك (chairs) ====================
import { defineSection } from '../core/section-kit.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'chairs';
const NAME = 'الكرسي المتحرك';

defineSection({
  id: 38,
  title: 'لعبة الكرسي المتحرك',
  description: 'لعبة حظ وإقصاء (data-category: luck) — الجلسات والنتائج من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'chairsRemovedPerRound', label: 'عدد الكراسي المُزالة كل جولة', type: 'number', value: 1 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
