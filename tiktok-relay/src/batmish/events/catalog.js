'use strict';
// BATMISH SPECIAL EVENTS — كتالوج الأحداث (مصدر واحد للحقيقة). لكل لعبة موجودة فعلاً في الموقع خمسة أحداث مطلوبة.
// الحدث لا يصير «قابلاً للتفعيل» إلا إذا كان له تنفيذ فعلي مربوط بمحرك اللعبة (IMPLEMENTED)، وإلا يظهر «غير مربوط بعد».
// ألعاب ذكرها الطلب ولا توجد في الموقع (لا تُنشأ ولا تُربط): «لعبة التاج»، «فعالية الستريمر».

export const MODES = ['manual', 'random', 'scheduled', 'hybrid'];
export const INTENSITIES = ['low', 'normal', 'high', 'extreme'];
export const EVENT_TYPES = ['random', 'scheduled', 'milestone', 'final', 'manual'];

// [tag, اسم اللعبة، [[اسم الحدث، وصف]...]]
const SRC = [
  ['bomb', 'القنبلة المتحركة', [['القنبلة المجنونة', 'تغيير اتجاه انتقال القنبلة بشكل مفاجئ.'], ['التمرير المزدوج', 'إلزام حامل القنبلة بتمريرها مرتين وفق آلية اللعبة.'], ['القنبلة المتخفية', 'إخفاء هوية حامل القنبلة مؤقتًا عن بقية اللاعبين.'], ['العد التنازلي المفاجئ', 'تقليص المهلة وإظهار إنذار للجميع.'], ['فرصة النجاة', 'منح لاعب مؤهل حماية من انفجار واحد.']]],
  ['hz', 'ضربة الحظ', [['الصندوق الأسطوري', 'صندوق نادر يحتوي على مكافأة.'], ['الصندوق المزدوج', 'الكشف عن صندوقين في اختيار واحد.'], ['الصندوق المقلوب', 'تبديل مواقع الصناديق قبل الاختيار.'], ['فرصة أخيرة', 'منح لاعب مؤهل فرصة نجاة إضافية.'], ['الصندوق الغامض', 'صندوق لا يُكشف محتواه إلا بعد الاختيار.']]],
  ['rou', 'دائرة الإقصاء', [['الدوران المجنون', 'تغيير سرعة دوران العجلة.'], ['الإقصاء المزدوج', 'اختيار لاعبين في دورة واحدة.'], ['منطقة النجاة', 'قطاع يمنح حصانة مؤقتة.'], ['العودة المفاجئة', 'فرصة عودة لاعب مقصى وفق شروط اللعبة.'], ['اللفة الأخيرة', 'مرحلة نهائية خاصة عند بقاء ثلاثة لاعبين.']]],
  ['box', 'الصندوق العشوائي', [['الصندوق الأسطوري', ''], ['صندوق التضحية', 'الاختيار بين الاحتفاظ بالحماية أو منحها للاعب آخر.'], ['الصندوق المزدوج', ''], ['الصناديق المتبدلة', ''], ['الاختيار الأخير', 'صندوق حاسم في المرحلة النهائية.']]],
  ['roulette3d', 'الروليت الروسي', [['اللفة الغامضة', ''], ['الحظ المعكوس', ''], ['فرصة الحصانة', ''], ['الروليت السريع', ''], ['المواجهة النهائية', '']]],
  ['chairs', 'الكراسي', [['الكرسي الذهبي', ''], ['الكرسي المتنقل', ''], ['جولة بدون موسيقى', ''], ['الكرسي المحصّن', ''], ['الكرسي الأخير', '']]],
  ['glz', 'الجسر الزجاجي', [['الخطوة المزدوجة', ''], ['الزجاج المتشابه', ''], ['المسار المتوهج', ''], ['الوقت المحدود', ''], ['العبور الأخير', '']]],
  ['volcanic-lands', 'الأراضي البركانية', [['ثوران مفاجئ', ''], ['الصخور المتحركة', ''], ['المنطقة الذهبية', ''], ['الحمم المتصاعدة', ''], ['النجاة الأخيرة', '']]],
  ['cannon', 'المدفع البشري', [['الهدف المتحرك', ''], ['الهدف الذهبي', ''], ['الرياح المتغيرة', ''], ['التحدي العكسي', ''], ['الجولة المثالية', '']]],
  ['sniper', 'القناص', [['المنطقة المتحركة', ''], ['المربع المحصّن', ''], ['الهدف الوهمي', ''], ['المواجهة الذهبية', ''], ['الذخيرة المحدودة', '']]],
  ['tmr', 'لعبة التوقيت', [['الوقت المعكوس', ''], ['المنطقة الذهبية', ''], ['الساعة المخفية', ''], ['التوقيت المزدوج', ''], ['آخر جزء من الثانية', '']]],
  ['findball', 'أين الكرة', [['الخلط السريع', ''], ['الكأس المتخفي', ''], ['تبديل مفاجئ', ''], ['الكرة الذهبية', ''], ['ذاكرة اللاعب', '']]],
  ['rlgl', 'إشارة المرور', [['الإشارة الخاطفة', ''], ['الإشارة المزدوجة', ''], ['الضوء الأصفر', ''], ['الطريق الطويل', ''], ['السباق النهائي', '']]],
  ['tug', 'شد الحبل', [['دفعة الجمهور', ''], ['الحبل الثقيل', ''], ['الشد المفاجئ', ''], ['جولة التعادل', ''], ['قوة الفريق', '']]],
  ['main', 'أوجد الكلمة', [['الحرف الذهبي', ''], ['الكلمة المزدوجة', ''], ['التلميح المسروق', ''], ['سباق أول إجابة', ''], ['الكلمة المتغيرة', '']]],
  ['ll', 'آخر حرف', [['الحرف الممنوع', ''], ['السرعة القصوى', ''], ['حرف العودة', ''], ['الكلمة الطويلة', ''], ['تحدي السلسلة', '']]],
  ['wai', 'من أنا؟', [['التلميح المشفر', ''], ['كشف تدريجي', ''], ['تلميح الجمهور', ''], ['شخصية مزدوجة', ''], ['الإجابة المبكرة', '']]],
  ['rw', 'عكس الكلمة', [['العكس المزدوج', ''], ['حروف مشتتة', ''], ['الوقت الذهبي', ''], ['الكلمة الطويلة', ''], ['التحدي السري', '']]],
  ['lsc', 'ترتيب الحروف', [['حرف مخفي', ''], ['التلميح المتأخر', ''], ['كلمتان متداخلتان', ''], ['سباق السرعة', ''], ['الحرف الإضافي', '']]],
  ['guessword', 'خمن الموضوع', [['الموضوع المزدوج', ''], ['التلميح المحظور', ''], ['التصنيف السري', ''], ['التلميح المتدرج', ''], ['الاختيار الجماعي', '']]],
  ['harfnajat', 'حرف النجاة', [['الحرف النادر', ''], ['الوقت المتقلص', ''], ['حرفان متتاليان', ''], ['الكلمة الذهبية', ''], ['النجاة الأخيرة', '']]],
  ['ig', 'خمن الصورة', [['الصورة المموهة', ''], ['كشف جزء جديد', ''], ['الصورة المكبرة', ''], ['صورتان متشابهتان', ''], ['الصورة الخاطفة', '']]],
  ['pgs', 'تخمين السعر', [['السعر السري', ''], ['السوق المتغير', ''], ['تخمين جماعي', ''], ['أقرب سعر يفوز', ''], ['السعر المضاعف', '']]],
  ['fastans', 'سؤال وجواب سريع', [['السؤال الخاطف', ''], ['السؤال المزدوج', ''], ['فرصة السرقة', ''], ['المضاعف السري', ''], ['النهائي السريع', '']]],
  ['cs', 'سرقة التاج', [['التاج الساخن', ''], ['الحماية الملكية', ''], ['التاج المزدوج', ''], ['المطاردة', ''], ['العرش الأخير', '']]],
  ['battery', 'الزر المشحون', [['الشحن المضاعف', ''], ['انقطاع الطاقة', ''], ['الشحن الخاطف', ''], ['البطارية الذهبية', ''], ['الانفجار النهائي', '']]],
  ['maze', 'المتاهة', [['المتاهة المتغيرة', ''], ['الباب السري', ''], ['الطريق المظلم', ''], ['المخرج الوهمي', ''], ['سباق الانهيار', '']]],
  ['wr', 'سباق الكلمات السريع', [['تبديل الفئة', ''], ['الحرف المفاجئ', ''], ['الكلمة الممنوعة', ''], ['سباق السلسلة', ''], ['المرحلة البرقية', '']]],
  ['draw', 'خمن الرسمة', [['الرسم السريع', ''], ['القلم المحدود', ''], ['الكشف التدريجي', ''], ['الرسم المعكوس', ''], ['الموضوع المزدوج', '']]],
  ['cw', 'حرب الدول', [['التحالف السري', 'تحالف خفي بين دولتين عشوائيتين: لا يقدر أحدهما يقصي الآخر وقت دوره.'], ['الدولة الذهبية', 'دولة عشوائية تنجو من أول محاولة إقصاء لها.'], ['الانقلاب', 'يُسحب الدور من صاحبه ويُمنح للاعب آخر عشوائي.'], ['التهديد المزدوج', 'صاحب الدور الحالي يقدر يقصي دولتين في دوره.'], ['الحرب الأخيرة', 'عند بقاء عدد قليل من الدول: يتقلص وقت الدور ويصير الإقصاء المزدوج متاحاً.']]],
  ['tt10', 'توب 10', [['القائمة المخفية', ''], ['المركز الذهبي', ''], ['تحدي المراكز الأخيرة', ''], ['الإجابة المسروقة', ''], ['النهائي المقلوب', '']]],
];

// الأحداث المربوطة فعلاً بمحرك لعبتها (تُحدَّث كلما أُضيف Adapter + اختبار). المفتاح = معرف الحدث.
// الحقول: type نوع التشغيل، group مجموعة التعارض، durationSec المدة الافتراضية (إن وجدت)، fields حقول خاصة بالحدث.
export const IMPLEMENTED = {
  'tt10.e2': { type: 'random', group: 'tt10.bonus', fields: [] },
  'tt10.e3': { type: 'random', group: 'tt10.bonus', fields: [{ key: 'fromRank', type: 'number', label: 'تُضاعَف نقاط المراكز من هذا الرقم فما فوق', hint: 'الحالي: 7', default: 7, min: 2, max: 10 }] },
  'tt10.e5': { type: 'final', group: 'tt10.rank', fields: [{ key: 'whenLeft', type: 'number', label: 'يبدأ لما يتبقى هذا العدد من الإجابات أو أقل', hint: 'الحالي: 3', default: 3, min: 2, max: 6 }] },
  'findball.e1': { type: 'random', group: 'findball.speed', planAtStart: true, fields: [] },
  'findball.e2': { type: 'milestone', group: 'findball.cup', fields: [] },
  'findball.e3': { type: 'random', group: 'findball.swaps', planAtStart: true, fields: [] },
  'maze.e1': { type: 'random', group: 'maze.layout', fields: [{ key: 'changes', type: 'number', label: 'عدد الجدران التي تتغير (تُفتح وتُغلق)', hint: 'الحالي: 3', default: 3, min: 1, max: 8 }] },
  'maze.e2': { type: 'random', group: 'maze.layout', fields: [] },
  'maze.e3': { type: 'random', group: 'maze.dark', fields: [{ key: 'durationSec', type: 'number', label: 'مدة العتمة (بالثواني)', hint: 'الحالي: 10', default: 10, min: 3, max: 60 }] },
  'glz.e2': { type: 'random', group: 'glz.display', fields: [] },
  'glz.e3': { type: 'random', group: 'glz.hint', fields: [] },
  'glz.e4': { type: 'random', group: 'glz.time', fields: [{ key: 'secondsLeft', type: 'number', label: 'يبقى من الوقت (بالثواني)', hint: 'الحالي: 5', default: 5, min: 2, max: 12 }] },
  'glz.e5': { type: 'final', group: 'glz.time', fields: [{ key: 'whenAlive', type: 'number', label: 'يبدأ لما يبقى هذا العدد من اللاعبين أو أقل', hint: 'الحالي: 3', default: 3, min: 2, max: 10 }, { key: 'secondsLeft', type: 'number', label: 'يبقى من الوقت (بالثواني)', hint: 'الحالي: 6', default: 6, min: 2, max: 12 }] },
  'battery.e1': { type: 'random', group: 'battery.mul', fields: [{ key: 'durationSec', type: 'number', label: 'مدة الشحن المضاعف (بالثواني)', hint: 'الحالي: 12', default: 12, min: 3, max: 60 }] },
  'battery.e2': { type: 'random', group: 'battery.drain', fields: [{ key: 'dropPercent', type: 'number', label: 'نسبة هبوط الشحن (٪)', hint: 'الحالي: 25', default: 25, min: 5, max: 60 }] },
  'battery.e3': { type: 'random', group: 'battery.drain', fields: [{ key: 'jumpPercent', type: 'number', label: 'قفزة الشحن الخاطفة (٪)', hint: 'الحالي: 15', default: 15, min: 5, max: 40 }] },
  'battery.e4': { type: 'random', group: 'battery.oneshot', fields: [] },
  'battery.e5': { type: 'final', group: 'battery.oneshot', fields: [{ key: 'whenAbove', type: 'number', label: 'يبدأ لما يتجاوز الشحن (٪)', hint: 'الحالي: 80', default: 80, min: 50, max: 98 }] },
  'sniper.e1': { type: 'random', group: 'sniper.golden', fields: [{ key: 'intervalSec', type: 'number', label: 'تنتقل المنطقة كل (بالثواني)', hint: 'الحالي: 6', default: 6, min: 2, max: 30 }] },
  'sniper.e2': { type: 'random', group: 'sniper.shield', fields: [] },
  'sniper.e4': { type: 'random', group: 'sniper.golden', fields: [] },
  'sniper.e5': { type: 'random', group: 'sniper.ammo', fields: [{ key: 'cutPercent', type: 'number', label: 'نسبة خصم ذخيرة القناص المتبقية (٪)', hint: 'الحالي: 40', default: 40, min: 10, max: 80 }] },
  'chairs.e1': { type: 'random', group: 'chairs.golden', fields: [] },
  'chairs.e4': { type: 'random', group: 'chairs.immune', fields: [] },
  'rlgl.e1': { type: 'random', group: 'rlgl.light', fields: [{ key: 'flashMs', type: 'number', label: 'مدة الإشارة الحمراء الخاطفة (بالملّي ثانية)', hint: 'الحالي: 1500', default: 1500, min: 600, max: 5000 }] },
  'rlgl.e2': { type: 'random', group: 'rlgl.light', fields: [{ key: 'flashMs', type: 'number', label: 'مدة كل وميض أحمر (بالملّي ثانية)', hint: 'الحالي: 1200', default: 1200, min: 600, max: 4000 }] },
  'rlgl.e5': { type: 'final', group: 'rlgl.speed', fields: [{ key: 'stepsLeft', type: 'number', label: 'يبدأ لما يبقى لأحدهم هذا العدد من الخطوات للفوز', hint: 'الحالي: 2', default: 2, min: 1, max: 6 }] },
  'hz.e1': { type: 'random', group: 'hz.bonus', fields: [] },
  'hz.e2': { type: 'random', group: 'hz.double', fields: [] },
  'hz.e3': { type: 'random', group: 'hz.shuffle', fields: [] },
  'hz.e4': { type: 'random', group: 'hz.shield', fields: [] },
  'box.e1': { type: 'random', group: 'box.layout', fields: [] },
  'box.e3': { type: 'random', group: 'box.layout', fields: [] },
  'box.e5': { type: 'final', group: 'box.layout', fields: [] },
  'ig.e1': { type: 'random', group: 'ig.visual', fields: [{ key: 'blurPx', type: 'number', label: 'قوة التمويه (بكسل)', hint: 'الحالي: 8', default: 8, min: 2, max: 20 }] },
  'ig.e2': { type: 'random', group: 'ig.visual', fields: [{ key: 'intervalSec', type: 'number', label: 'يزول جزء من التمويه كل (بالثواني)', hint: 'الحالي: 3', default: 3, min: 1, max: 15 }] },
  'ig.e3': { type: 'random', group: 'ig.visual', fields: [{ key: 'zoomPercent', type: 'number', label: 'نسبة التكبير (٪)', hint: 'الحالي: 260', default: 260, min: 150, max: 500 }] },
  'ig.e5': { type: 'random', group: 'ig.visual', fields: [{ key: 'showSeconds', type: 'number', label: 'مدة ظهور الصورة قبل أن تختفي (بالثواني)', hint: 'الحالي: 3', default: 3, min: 1, max: 15 }] },
  'guessword.e2': { type: 'random', group: 'gw.hint', fields: [{ key: 'durationSec', type: 'number', label: 'مدة إخفاء التلميح (بالثواني)', hint: 'الحالي: 20', default: 20, min: 5, max: 120 }] },
  'guessword.e4': { type: 'random', group: 'gw.hint', fields: [{ key: 'intervalSec', type: 'number', label: 'كشف كلمة جديدة من التلميح كل (بالثواني)', hint: 'الحالي: 6', default: 6, min: 2, max: 30 }] },
  'wr.e5': { type: 'random', group: 'wr.display', fields: [{ key: 'showSeconds', type: 'number', label: 'مدة ظهور الجملة قبل أن تختفي (بالثواني)', hint: 'الحالي: 4', default: 4, min: 2, max: 15 }] },
  'fastans.e1': { type: 'random', group: 'fastans.timer', fields: [] },
  'fastans.e4': { type: 'random', group: 'fastans.bonus', fields: [] },
  'fastans.e5': { type: 'final', group: 'fastans.timer', fields: [] },
  'wai.e1': { type: 'random', group: 'wai.hint', fields: [] },
  'wai.e2': { type: 'random', group: 'wai.hint', fields: [{ key: 'intervalSec', type: 'number', label: 'كشف حرف جديد كل (بالثواني)', hint: 'الحالي: 8', default: 8, min: 3, max: 30 }] },
  'wai.e3': { type: 'random', group: 'wai.hint', fields: [] },
  'rw.e2': { type: 'random', group: 'rw.display', fields: [] },
  'rw.e3': { type: 'random', group: 'rw.bonus', fields: [{ key: 'durationSec', type: 'number', label: 'مدة الوقت الذهبي (بالثواني)', hint: 'الحالي: 20', default: 20, min: 5, max: 120 }] },
  'rw.e5': { type: 'random', group: 'rw.lucky', fields: [] },
  'lsc.e1': { type: 'random', group: 'lsc.display', fields: [] },
  'lsc.e2': { type: 'random', group: 'lsc.hint', fields: [] },
  'lsc.e4': { type: 'random', group: 'lsc.bonus', fields: [] },
  'lsc.e5': { type: 'random', group: 'lsc.display', fields: [] },
  'cs.e1': { type: 'random', group: 'cs.hold', fields: [{ key: 'durationSec', type: 'number', label: 'مدة السخونة (بالثواني)', hint: 'الحالي: 15', default: 15, min: 5, max: 120 }] },
  'cs.e2': { type: 'random', group: 'cs.immunity', fields: [{ key: 'durationSec', type: 'number', label: 'مدة الحماية (بالثواني)', hint: 'الحالي: 6', default: 6, min: 2, max: 30 }] },
  'cs.e4': { type: 'random', group: 'cs.attempts', fields: [] },
  'cs.e5': { type: 'final', group: 'cs.hold', fields: [{ key: 'afterPercent', type: 'number', label: 'يبدأ لما يقضي الملك هذه النسبة من مدة الحمل (٪)', hint: 'الحالي: 70', default: 70, min: 30, max: 95 }] },
  'main.e1': { type: 'random', group: 'main.hint', fields: [] },
  'main.e4': { type: 'random', group: 'main.bonus', fields: [] },
  'll.e2': { type: 'random', group: 'll.speed', fields: [{ key: 'durationSec', type: 'number', label: 'مدة السرعة القصوى (بالثواني)', hint: 'الحالي: 30', default: 30, min: 10, max: 180 }] },
  'rou.e1': { type: 'random', group: 'rou.spin', fields: [
    { key: 'speedPercent', type: 'number', label: 'مدة الدوران كنسبة من الطبيعي (٪)', hint: 'الحالي: 40 — أقل = أسرع، أكثر من 100 = أبطأ', default: 40, min: 20, max: 300 },
    { key: 'durationSec', type: 'number', label: 'مدة الحدث (بالثواني)', hint: 'الحالي: 45', default: 45, min: 10, max: 180 }] },
  'rou.e2': { type: 'random', group: 'rou.double', fields: [] },
  'rou.e3': { type: 'random', group: 'rou.immunity', fields: [] },
  'rou.e5': { type: 'final', group: 'rou.spin', fields: [{ key: 'slowPercent', type: 'number', label: 'إبطاء الدوران في اللفة الأخيرة (٪ من الطبيعي)', hint: 'الحالي: 250', default: 250, min: 100, max: 400 }] },
  'tmr.e1': { type: 'random', group: 'tmr.display', fields: [] },
  'tmr.e2': { type: 'random', group: 'tmr.golden', fields: [] },
  'tmr.e3': { type: 'random', group: 'tmr.display', fields: [
    { key: 'hideSeconds', type: 'number', label: 'مدة إخفاء الساعة (بالثواني)', hint: 'الحالي: 8', default: 8, min: 2, max: 25 },
  ] },
  'cw.e1': { type: 'random', group: 'cw.alliance', fields: [
    { key: 'durationSec', type: 'number', label: 'مدة التحالف (بالثواني)', hint: 'ينتهي أيضاً إذا أُقصيت إحدى الدولتين. الحالي: 60', default: 60, min: 10, max: 300 },
  ] },
  'cw.e2': { type: 'random', group: 'cw.golden', fields: [
    { key: 'durationSec', type: 'number', label: 'مدة الحماية (بالثواني)', hint: 'تنتهي أيضاً عند استهلاكها. الحالي: 90', default: 90, min: 10, max: 300 },
  ] },
  'cw.e3': { type: 'random', group: 'cw.turn', fields: [] },
  'cw.e4': { type: 'random', group: 'cw.double', fields: [] },
  'cw.e5': { type: 'final', group: 'cw.double', durationSec: 0, fields: [
    { key: 'whenLeft', type: 'number', label: 'يبدأ لما تبقى هذا العدد من الدول أو أقل', hint: 'الحالي: 3', default: 3, min: 2, max: 20 },
    { key: 'turnSeconds', type: 'number', label: 'مدة الدور في الحرب الأخيرة (بالثواني)', hint: 'الحالي: 8', default: 8, min: 3, max: 60 },
  ] },
};

// حقول مشتركة لكل حدث (الحقول الخاصة تُضاف فوقها). type: toggle | number | select
export const COMMON_FIELDS = [
  { key: 'enabled', type: 'toggle', label: 'تفعيل الحدث', default: false },
  { key: 'probability', type: 'number', label: 'احتمالية الظهور (٪)', hint: 'فرصة ظهور الحدث عند كل نقطة فحص مناسبة', default: 30, min: 1, max: 100 },
  { key: 'maxPerRound', type: 'number', label: 'أقصى عدد مرات ظهور بالراوند', default: 1, min: 1, max: 5 },
  { key: 'fromSec', type: 'number', label: 'أبكر وقت للظهور بعد بداية الراوند (بالثواني)', default: 5, min: 0, max: 600 },
  { key: 'toSec', type: 'number', label: 'أخر وقت للظهور بعد بداية الراوند (بالثواني)', hint: '0 = حتى نهاية الراوند', default: 0, min: 0, max: 3600 },
  { key: 'announce', type: 'toggle', label: 'إظهار إعلان الحدث على الشاشة', default: true },
  { key: 'sfx', type: 'toggle', label: 'تفعيل المؤثرات الصوتية', default: true },
  { key: 'vfx', type: 'toggle', label: 'تفعيل المؤثرات البصرية', default: true },
];

export const GAME_FIELDS = [
  { key: 'mode', type: 'select', label: 'نمط التشغيل', options: MODES, default: 'random' },
  { key: 'intensity', type: 'select', label: 'قوة الأحداث', options: INTENSITIES, default: 'normal' },
  { key: 'minGapSec', type: 'number', label: 'أقل فاصل بين حدثين (بالثواني)', default: 20, min: 0, max: 600 },
  { key: 'maxPerRound', type: 'number', label: 'أقصى عدد أحداث بالراوند', default: 3, min: 1, max: 20 },
];

// معامل القوة على التأثيرات القابلة للتدرّج فقط (لا يغيّر ما لا يناسب ميكانيكية اللعبة)
export const INTENSITY_FACTOR = { low: 0.5, normal: 1, high: 1.5, extreme: 2 };

export const EVENT_GAMES = {};
for (const [tag, name, evs] of SRC) {
  EVENT_GAMES[tag] = { tag, name, events: evs.map(([ename, desc], i) => {
    const id = tag + '.e' + (i + 1), impl = IMPLEMENTED[id];
    return {
      id, tag, index: i + 1, name: ename, desc: desc || '', implemented: !!impl,
      type: impl ? impl.type : 'random', group: impl ? impl.group : null, durationSec: impl ? (impl.durationSec ?? null) : null,
      fields: impl ? [...COMMON_FIELDS, ...impl.fields] : [],
    };
  }) };
}
export const EVENT_BY_ID = {};
for (const g of Object.values(EVENT_GAMES)) for (const e of g.events) EVENT_BY_ID[e.id] = e;
export const NOT_FOUND_GAMES = ['لعبة التاج', 'فعالية الستريمر'];
