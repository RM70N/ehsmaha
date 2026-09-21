// ==================== القسم 39 — لعبة الأراضي البركانية (volcanic-lands) ====================
// هذي هي اللعبة اللي وصفها الرسمي بالموقع الرئيسي "نجاة من اللافا" حرفياً
// (سؤال بأربعة خيارات، اللافا تصعد كل جولة حتى يبقى ناجٍ واحد) — لا توجد
// لعبة منفصلة باسم "لافا" غيرها؛ راجع ملاحظة قسم 33 لتفاصيل تصحيح الترقيم.
import { defineSection } from '../core/section-kit.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'volcanic-lands';
const NAME = 'الأراضي البركانية';

defineSection({
  id: 39,
  title: 'لعبة الأراضي البركانية',
  description: 'سؤال بأربعة خيارات — اللافا تصعد كل جولة حتى يبقى ناجٍ واحد ("نجاة من اللافا" هو نفس هذي اللعبة). الجلسات والنتائج من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'lavaRiseSpeed', label: 'سرعة صعود اللافا', type: 'number', value: 1 },
      { key: 'questionTimeSec', label: 'وقت الإجابة (ثانية)', type: 'number', value: 15 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
