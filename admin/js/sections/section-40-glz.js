// ==================== القسم 40 — لعبة الطريق الزجاجي (glz) ====================
// إدارة بنك الأسئلة (500 سؤال) موجودة بقسم 21 كاملة — هذا القسم يركّز على
// إدارة الجلسات/النتائج/الإعدادات، مع رابط سريع لبنك الأسئلة بدل تكراره.
import { AdminToast } from '../core/toast.js';
import { defineSection } from '../core/section-kit.js';
import { AdminRouter } from '../core/router.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'glz';
const NAME = 'الطريق الزجاجي';

defineSection({
  id: 40,
  title: 'لعبة الطريق الزجاجي',
  description: 'شبكة أسئلة صح/خطأ لترقية البرج — بنك الأسئلة (500 سؤال) يُدار كاملاً من قسم 21. الجلسات والنتائج هنا من activeStreamers/playEvents الحقيقية.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    {
      title: 'إدارة بنك أسئلة الطريق الزجاجي',
      keywords: 'بنك اسئلة طريق زجاجي',
      meta: 'ينقلك لقسم 21 — بنوك الأسئلة والمواضيع',
      run: () => { AdminToast.info('انتقل لقسم 21 (بنوك الأسئلة والمواضيع) — فيه إدارة كاملة لبنك أسئلة الطريق الزجاجي'); AdminRouter.goTo(21); }
    },
    gameConfigTool(TAG, NAME, [
      { key: 'questionTimeSec', label: 'وقت الإجابة (ثانية)', type: 'number', value: 10 }
    ]),
    errorLogTool(TAG, NAME),
    monthlyExportTool(TAG, NAME)
  ]
});
