// ==================== القسم 36 — لعبة حرب الدول (cw) ====================
// ملاحظة: كولكشن "cwOwnerSessions" مذكور بـfirestore.rules لكنه غير مستخدم
// فعلياً بكود index.html حالياً (بحث كامل بالملف ما لقى أي قراءة/كتابة له) —
// حالة اللعبة الحية الفعلية تُقرأ من liveRounds/cw (مشتركة مع كل الألعاب،
// أداة "المشاركون بالراوند الجاري" أدناه) بدل الاعتماد على كولكشن ميت.
import { openModal } from '../core/modal.js';
import { defineSection } from '../core/section-kit.js';
import { liveSessionsTool, recentResultsTool, liveRoundParticipantsTool, toggleEnabledTool, topStreamersTool, errorLogTool, monthlyExportTool, gameConfigTool } from '../core/game-admin-kit.js';

const TAG = 'cw';
const NAME = 'حرب الدول';

defineSection({
  id: 36,
  title: 'لعبة حرب الدول',
  description: 'لعبة حظ وإقصاء (data-category: luck) — توزيع الدول على اللاعبين محلي بمتصفح الستريمر (ما ينكتب Firestore)، الأدوات هنا تغطي ما هو حقيقي فعلاً: الجلسات، المشاركون، النتائج.',
  tools: [
    liveSessionsTool(TAG, NAME),
    liveRoundParticipantsTool(TAG, NAME),
    recentResultsTool(TAG, NAME, 20),
    toggleEnabledTool(TAG, NAME),
    topStreamersTool(TAG, NAME),
    gameConfigTool(TAG, NAME, [
      { key: 'roundDurationSec', label: 'مدة الجولة (ثانية)', type: 'number', value: 40 }
    ]),
    errorLogTool(TAG, NAME),
    {
      title: 'عرض توزيع الدول الحالي لبث معيّن',
      keywords: 'توزيع دول بث حالي',
      badge: 'بيانات غير متوفرة',
      run: () => { const b = document.createElement('div'); b.innerHTML = '<p>توزيع الدول على اللاعبين يُحسب ويُخزَّن بذاكرة متصفح الستريمر مباشرة (مو Firestore) — ما فيه طريقة لقراءته من لوحة إدارة خارجية بالوضع الحالي، إلا لو تغيّر منطق اللعبة ليسجّله بقاعدة البيانات.</p>'; openModal({ title: 'توزيع الدول', bodyEl: b, size: 'sm' }); }
    },
    monthlyExportTool(TAG, NAME)
  ]
});
