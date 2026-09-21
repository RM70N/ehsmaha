// ==================== القسم 37 — لعبة دائرة الإقصاء (rou) ====================
import { defineSection } from '../core/section-kit.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'rou';
const NAME = 'دائرة الإقصاء';

defineSection({
  id: 37,
  title: 'لعبة دائرة الإقصاء',
  description: 'لعبة حظ وإقصاء (data-category: luck، الاسم بالكود Roulette) — الجلسات والنتائج من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'eliminationCount', label: 'عدد المقصيين كل دورة', type: 'number', value: 1 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
