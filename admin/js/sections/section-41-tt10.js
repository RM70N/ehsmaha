// ==================== القسم 41 — لعبة توب 10 (tt10) ====================
// إدارة بنك المواضيع موجودة بقسم 21 كاملة — هذا القسم يركّز على إدارة
// الجلسات/النتائج/الإعدادات، مع رابط سريع لبنك المواضيع بدل تكراره.
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { AdminRouter } from '../core/router.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'tt10';
const NAME = 'توب 10';

defineSection({
  id: 41,
  title: 'لعبة توب 10',
  description: 'اللاعبون يخمّنون عناصر قائمة توب 10 — بنك المواضيع (200+ موضوع) يُدار كاملاً من قسم 21. الجلسات والنتائج هنا من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    {
      title: 'إدارة بنك مواضيع توب 10',
      keywords: 'بنك مواضيع توب 10',
      meta: 'ينقلك لقسم 21 — بنوك الأسئلة والمواضيع',
      run: () => { AdminToast.info('انتقل لقسم 21 (بنوك الأسئلة والمواضيع) — فيه إدارة كاملة لبنك مواضيع توب 10'); AdminRouter.goTo(21); }
    },
    gameConfigTool(TAG, NAME, [
      { key: 'answerTimeSec', label: 'وقت الإجابة لكل عنصر (ثانية)', type: 'number', value: 20 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
