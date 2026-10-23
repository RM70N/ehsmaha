/* احسمها | مركز الاتصالات — مكتبة المحتوى الثابت المشتركة بين اللعبة والخادم.
   كل الأسماء والشركات والمبالغ والأكواد هنا خيالية بالكامل وتخص عالم اللعبة فقط.
   هذا الملف يُدمج داخل call-center3d.html وقت البناء، ويقرؤه الخادم بـ require.
   CONTENT_VERSION يدخل بمفتاح تخزين الأصوات الثابتة، فأي تعديل نصي يولّد نسخة جديدة. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CCContent = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var CONTENT_VERSION = '2.0.0';
  var CURRENCY = { name: 'دريهم', short: 'د', note: 'عملة خيالية داخل اللعبة فقط' };

  /* ---------- نوايا اللاعب المسموحة (المصنّف يختار منها فقط) ---------- */
  var INTENTS = {
    greet: 'تحية',
    introduce: 'تعريف بالنفس والشركة',
    explain: 'شرح سبب الاتصال',
    reassure: 'طمأنة',
    ask_access: 'طلب فتح برنامج المساعدة',
    ask_code: 'طلب رمز',
    ask_confirm: 'طلب تأكيد مبلغ أو رقم',
    ask_info: 'طلب معلومة',
    answer_question: 'جواب سؤال المتصل',
    small_talk: 'سوالف جانبية',
    joke: 'نكتة',
    pressure: 'استعجال وضغط',
    polite_end: 'إنهاء مهذب',
    apology: 'اعتذار',
    refuse: 'رفض طلب المتصل',
    off_topic: 'خارج الموضوع',
    insult: 'إساءة',
    cheat: 'محاولة كسر اللعبة',
    unclear: 'غير واضح'
  };

  /* ---------- الشخصيات (٢٤ متصل) ----------
     traits: قيم بداية 0..100. patience=الصبر، trust=الثقة، suspicion=الشك،
     attention=الانتباه، speed=سرعة الاستيعاب.
     quirks: سلوكيات تشغّلها قواعد اللعبة (مقاطعة، نسيان، تغيير موضوع، اقتناع تمثيلي...).
     voice: اسم صوت جاهز عند مزود الصوت + ضبط تشغيل محلي للهاتف. */
  var PERSONAS = [
    { id: 'p01', name: 'أبو فهد', g: 'm', archetype: 'skeptic', label: 'الشكاك', tone: 'grumpy', difficulty: 3,
      traits: { patience: 55, trust: 18, suspicion: 50, attention: 75, speed: 60 },
      style: 'يشك بكل كلمة، يطلب إثبات، جمله قصيرة وناشفة',
      limits: 'ما يعطي أي رمز قبل ما يسمع اسم الشركة ويتأكد إن الكلام متطابق',
      quirks: [], voice: { tts: 'Charon', rate: 0.96, pitch: 0.9 },
      look: { skin: '#b9825a', hair: '#2a2622', top: '#56708a', head: 'shmagh', glasses: true },
      openings: ['ألو، مين معي؟ ولا تقول لي عرض.', 'نعم؟ من وين جايب رقمي أنت؟', 'ألو... إيه تكلم، بس بسرعة وعلى الواضح.'] },
    { id: 'p02', name: 'نورة', g: 'f', archetype: 'hurried', label: 'المستعجلة', tone: 'rushed', difficulty: 2,
      traits: { patience: 35, trust: 40, suspicion: 30, attention: 45, speed: 80 },
      style: 'مستعجلة جداً، تبي الزبدة، تقاطع لو طوّلت',
      limits: 'لو طال الشرح أكثر من مرتين تسكّر',
      quirks: ['impatient'], voice: { tts: 'Kore', rate: 1.12, pitch: 1.05 },
      look: { skin: '#d6a77f', hair: '#1d1714', top: '#9a4f6a', head: 'hijab', glasses: false },
      openings: ['ألو، بسرعة لو سمحت أنا طالعة.', 'هلا، عندي دقيقتين بس، وش السالفة؟', 'ألو؟ بسرعة تكفى السيارة تنتظرني.'] },
    { id: 'p03', name: 'أبو سلطان', g: 'm', archetype: 'chatty', label: 'الثرثار', tone: 'chatty', difficulty: 2,
      traits: { patience: 85, trust: 50, suspicion: 20, attention: 35, speed: 45 },
      style: 'يحب السوالف، يدخل قصص جانبية، ودود',
      limits: 'يتجاوب بسرعة لو حس إنك تسولف معه، بس ينسى الطلب لو ما رجعته له',
      quirks: ['tangents'], voice: { tts: 'Algieba', rate: 0.95, pitch: 0.95 },
      look: { skin: '#a8754f', hair: '#3a3530', top: '#e9e4d8', head: 'shmagh', glasses: false },
      openings: ['ألو هلا والله! ياخي الحين كنت أتذكر صاحبي اللي يشتغل باتصالات، وش أخبارك؟', 'يا هلا يا هلا، تفضل يا ولدي، أنا فاضي اليوم.', 'ألو، أهلين! توني مخلص قهوتي، قل وش عندك.'] },
    { id: 'p04', name: 'خالد', g: 'm', archetype: 'stubborn', label: 'العنيد', tone: 'grumpy', difficulty: 3,
      traits: { patience: 60, trust: 25, suspicion: 40, attention: 60, speed: 55 },
      style: 'يرفض أول طلب دائماً، يقتنع بالتكرار الهادئ مو بالضغط',
      limits: 'الضغط والاستعجال يرفعون شكه بقوة',
      quirks: ['first_no'], voice: { tts: 'Fenrir', rate: 0.98, pitch: 0.88 },
      look: { skin: '#c99a72', hair: '#141414', top: '#2f3b33', head: 'none', glasses: false },
      openings: ['لا. قبل ما تبدأ، لا.', 'ألو. إذا بتبيع شي، ما أبي.', 'نعم؟ اختصر.'] },
    { id: 'p05', name: 'أم ريان', g: 'f', archetype: 'calm', label: 'الهادئة', tone: 'sweet', difficulty: 1,
      traits: { patience: 80, trust: 55, suspicion: 20, attention: 65, speed: 55 },
      style: 'هادئة ومهذبة، تسمع للآخر، ترتاح للطمأنة',
      limits: 'الإساءة تخليها تسكّر فوراً',
      quirks: [], voice: { tts: 'Aoede', rate: 0.94, pitch: 1.0 },
      look: { skin: '#e0b48e', hair: '#2b211c', top: '#6b7f9e', head: 'hijab', glasses: false },
      openings: ['ألو، السلام عليكم.', 'هلا، تفضل أخوي.', 'ألو، أيوه معك أم ريان.'] },
    { id: 'p06', name: 'عبدالرحمن', g: 'm', archetype: 'curious', label: 'الفضولي', tone: 'casual', difficulty: 2,
      traits: { patience: 70, trust: 40, suspicion: 30, attention: 80, speed: 70 },
      style: 'يسأل ليش وكيف، يحب يفهم كل شي، متحمس',
      limits: 'يقتنع لو جاوبته على أسئلته بدون تهرب',
      quirks: ['asks_why'], voice: { tts: 'Puck', rate: 1.04, pitch: 1.0 },
      look: { skin: '#c4936a', hair: '#1f1b18', top: '#3d6e8f', head: 'none', glasses: true },
      openings: ['ألو! مين معي؟ وكيف عرفتوا رقمي؟ سؤال بريء.', 'هلا، أنتم شركة وش بالضبط؟', 'ألو، أيوه؟ قل قل، أنا أسمعك.'] },
    { id: 'p07', name: 'سامي', g: 'm', archetype: 'forgetful', label: 'اللي ينسى', tone: 'casual', difficulty: 2,
      traits: { patience: 65, trust: 50, suspicion: 25, attention: 30, speed: 40 },
      style: 'مشغول بعشرين شي، ينسى وش قلت قبل شوي ويرجع يسأل',
      limits: 'يحتاج تذكير بالخطوة، وينسى الأرقام لو ما كتبها',
      quirks: ['forgets'], voice: { tts: 'Umbriel', rate: 1.0, pitch: 1.0 },
      look: { skin: '#b88a63', hair: '#2d2a26', top: '#8a6f3a', head: 'cap', glasses: false },
      openings: ['ألو، معك سامي... لحظة وش كنت أسوي؟ إيه تفضل.', 'هلا، تفضل، بس ثانية أدور جوالي... أوه هو بيدي.', 'ألو؟ مين؟ آه آسف كنت سرحان.'] },
    { id: 'p08', name: 'ريم', g: 'f', archetype: 'stepwise', label: 'اللي تسأل عن كل خطوة', tone: 'formal', difficulty: 2,
      traits: { patience: 70, trust: 35, suspicion: 35, attention: 85, speed: 50 },
      style: 'تبي كل خطوة بالتفصيل، تكرر عشان تتأكد، ما تحب القفز',
      limits: 'ترفض أي طلب ما انشرح سببه قبله',
      quirks: ['needs_explain'], voice: { tts: 'Leda', rate: 0.96, pitch: 1.05 },
      look: { skin: '#dcae88', hair: '#3b2a20', top: '#4f8a7a', head: 'hijab', glasses: true },
      openings: ['ألو، مساء الخير. قبل أي شي، ممكن تعرف بنفسك؟', 'أهلاً، معك ريم. ممكن تشرح لي خطوة خطوة؟', 'ألو، تفضل. وش أول خطوة؟'] },
    { id: 'p09', name: 'ماجد', g: 'm', archetype: 'interrupter', label: 'اللي يقاطع', tone: 'rushed', difficulty: 3,
      traits: { patience: 45, trust: 40, suspicion: 35, attention: 45, speed: 75 },
      style: 'يقاطع قبل ما تكمل، يكمل جملتك غلط، حماسي',
      limits: 'يحتاج جمل قصيرة وواضحة، الكلام الطويل يقاطعه',
      quirks: ['interrupts'], voice: { tts: 'Orus', rate: 1.1, pitch: 1.0 },
      look: { skin: '#a77550', hair: '#151515', top: '#a24a3a', head: 'none', glasses: false },
      openings: ['ألو إيه إيه أدري أدري، كمل!', 'هلا! خلني أخمن، عرض؟ لا لا كمل كمل.', 'ألو، قول بسرعة قبل ما ينقطع الخط.'] },
    { id: 'p10', name: 'لمياء', g: 'f', archetype: 'topic_changer', label: 'اللي تغيّر الموضوع', tone: 'chatty', difficulty: 2,
      traits: { patience: 70, trust: 45, suspicion: 25, attention: 30, speed: 55 },
      style: 'تقفز من موضوع لموضوع، تسأل عن الطقس والأكل وسط الكلام',
      limits: 'ترجع للموضوع لو رجعتها بلطف',
      quirks: ['changes_topic'], voice: { tts: 'Despina', rate: 1.02, pitch: 1.08 },
      look: { skin: '#e3b995', hair: '#4a2c1f', top: '#c4875a', head: 'hijab', glasses: false },
      openings: ['ألو هلا! تدري الجو اليوم غريب؟ المهم تفضل.', 'أهلين، معك لمياء. قبل لا أنسى، أنتم وين مكانكم؟', 'ألو، تفضل، وش السالفة؟ ترى أنا أطبخ.'] },
    { id: 'p11', name: 'سلمان', g: 'm', archetype: 'fake_convinced', label: 'يمثل إنه اقتنع', tone: 'casual', difficulty: 4,
      traits: { patience: 70, trust: 45, suspicion: 55, attention: 80, speed: 70 },
      style: 'يوافق بسرعة بشكل مريب، يعطيك أرقام غلط عشان يختبرك',
      limits: 'يعطي رمز غلط أول مرة؛ لو اكتشفت التلاعب وطلبت يتأكد من الشاشة يعطي الصحيح',
      quirks: ['fake_convince'], voice: { tts: 'Iapetus', rate: 1.0, pitch: 0.97 },
      look: { skin: '#bf8d66', hair: '#211d1a', top: '#3b3f5a', head: 'none', glasses: true },
      openings: ['ألو، أكيد أكيد، أنا مقتنع من قبل ما تتكلم.', 'هلا، إيه تمام تمام، وش تبي مني بالضبط؟', 'ألو، أوكي، أنا جاهز، اطلب.'] },
    { id: 'p12', name: 'هيفاء', g: 'f', archetype: 'tester', label: 'كاشفة التناقضات', tone: 'formal', difficulty: 4,
      traits: { patience: 60, trust: 30, suspicion: 50, attention: 95, speed: 80 },
      style: 'تحفظ كل كلمة، ترجع تسألك نفس السؤال بصيغة ثانية عشان تمسك تناقض',
      limits: 'أي تناقض بالاسم أو المبلغ يرفع شكها بقوة',
      quirks: ['catches_contradictions'], voice: { tts: 'Erinome', rate: 1.0, pitch: 1.0 },
      look: { skin: '#d2a07a', hair: '#1a1411', top: '#2e4a5e', head: 'hijab', glasses: true },
      openings: ['ألو، معك هيفاء. قبل لا نكمل، وش اسمك الكامل وأي قسم؟', 'أهلاً. ممكن تعيد اسم الشركة؟ أبي أكتبه.', 'ألو، تفضل. بسجل المكالمة عندي بالورقة إذا ما عندك مانع.'] },
    { id: 'p13', name: 'زياد', g: 'm', archetype: 'saboteur', label: 'المضلل', tone: 'techy', difficulty: 4,
      traits: { patience: 75, trust: 50, suspicion: 60, attention: 85, speed: 85 },
      style: 'هادئ وذكي، يحاول يقنعك تفتح ملف أو رابط على جهاز المكتب',
      limits: 'يحاول يرسل لك ملف «تحديث»؛ إذا رفضت يغيّر أسلوبه',
      quirks: ['sabotage'], voice: { tts: 'Enceladus', rate: 0.98, pitch: 0.95 },
      look: { skin: '#c79770', hair: '#0f0f0f', top: '#1f2a2e', head: 'hood', glasses: false },
      openings: ['ألو، هلا والله. شكلك ضغطان، أقدر أساعدك أنا بعد.', 'أهلين، قبل كل شي جهازك عندكم بطيء صح؟', 'ألو، تمام، بس عندي ملف بيسهّل عليك الشغل.'] },
    { id: 'p14', name: 'تركي', g: 'm', archetype: 'eager', label: 'المتحمس', tone: 'casual', difficulty: 1,
      traits: { patience: 75, trust: 60, suspicion: 15, attention: 50, speed: 65 },
      style: 'طالب متحمس، يحب الجوائز والعروض، يسأل «جد؟» كثير',
      limits: 'يتراجع لو حس إن المبلغ كبير عليه',
      quirks: [], voice: { tts: 'Achird', rate: 1.08, pitch: 1.1 },
      look: { skin: '#cfa077', hair: '#1c1714', top: '#3b7d5c', head: 'cap', glasses: false },
      openings: ['ألو! جد؟ أنتم اللي بالإعلان؟', 'هلا والله! وش عندكم؟ قول إنها جايزة.', 'ألو، أيوه، معك تركي، تفضل!'] },
    { id: 'p15', name: 'دانة', g: 'f', archetype: 'busy', label: 'المشغولة', tone: 'rushed', difficulty: 2,
      traits: { patience: 45, trust: 45, suspicion: 35, attention: 50, speed: 75 },
      style: 'بين اجتماعين، تحط الخط انتظار أحياناً',
      limits: 'تطلب الزبدة، وترفض لو حست بلف ودوران',
      quirks: ['hold'], voice: { tts: 'Callirrhoe', rate: 1.06, pitch: 1.02 },
      look: { skin: '#dba985', hair: '#291e17', top: '#5a5f8f', head: 'hijab', glasses: false },
      openings: ['ألو، دانة، عندي اجتماع بعد خمس دقايق.', 'هلا، تفضل بس اختصر الله يعافيك.', 'ألو؟ معك دانة، لحظة... إيه تفضل.'] },
    { id: 'p16', name: 'أبو ناصر', g: 'm', archetype: 'relaxed', label: 'الرايق', tone: 'sweet', difficulty: 1,
      traits: { patience: 90, trust: 50, suspicion: 20, attention: 50, speed: 40 },
      style: 'رايق جداً، يتكلم ببطء، يضحك على كل شي',
      limits: 'ما يحب الاستعجال، يتجاوب مع الهدوء',
      quirks: [], voice: { tts: 'Gacrux', rate: 0.9, pitch: 0.9 },
      look: { skin: '#a66e47', hair: '#bfb8ad', top: '#d8d1c0', head: 'shmagh', glasses: true },
      openings: ['ألو... هلا والله، خذ راحتك يا ولدي.', 'يا هلا، الله يحييك، وش عندك؟', 'ألو، أبو ناصر معك، تفضل على مهلك.'] },
    { id: 'p17', name: 'شوق', g: 'f', archetype: 'bargainer', label: 'صاحبة المحل', tone: 'casual', difficulty: 3,
      traits: { patience: 60, trust: 35, suspicion: 40, attention: 75, speed: 70 },
      style: 'صاحبة محل عبايات، تفاصل بكل شي، تحسبها بالريال والهللة',
      limits: 'ما توافق إلا إذا حست إنها كسبت خصم',
      quirks: ['haggles'], voice: { tts: 'Autonoe', rate: 1.03, pitch: 1.04 },
      look: { skin: '#cd9b74', hair: '#2a1d16', top: '#7d3e5a', head: 'hijab', glasses: false },
      openings: ['ألو، محل شوق، تفضل. بس من الحين أقولك فيه خصم ولا لا؟', 'هلا، إذا عرض قل السعر أول شي.', 'ألو، أيوه، معك شوق، اختصر علي عندي زباين.'] },
    { id: 'p18', name: 'فيصل', g: 'm', archetype: 'distracted', label: 'اللي بالنادي', tone: 'casual', difficulty: 2,
      traits: { patience: 55, trust: 45, suspicion: 30, attention: 30, speed: 60 },
      style: 'يتمرن وهو يكلمك، يلهث، يسمع نص الكلام',
      limits: 'يحتاج تكرار للرقم والطلب',
      quirks: ['forgets'], voice: { tts: 'Alnilam', rate: 1.05, pitch: 0.98 },
      look: { skin: '#b07b54', hair: '#161310', top: '#c23b3b', head: 'none', glasses: false },
      openings: ['ألو... هـ... لحظة أخلص الجولة... إيه تفضل.', 'هلا! أنا بالنادي بس أسمعك، قول.', 'ألو، هلا، الصوت عالي هنا، ارفع صوتك.'] },
    { id: 'p19', name: 'أريج', g: 'f', archetype: 'dramatic', label: 'الدراماتيكية', tone: 'chatty', difficulty: 2,
      traits: { patience: 60, trust: 45, suspicion: 30, attention: 55, speed: 55 },
      style: 'تهوّل كل شي، «يا ويلي»، تتأثر بسرعة بالطمأنة',
      limits: 'الضغط يخليها تنهار وتسكّر',
      quirks: [], voice: { tts: 'Laomedeia', rate: 1.04, pitch: 1.12 },
      look: { skin: '#e2b590', hair: '#3a2416', top: '#a14a8a', head: 'hijab', glasses: false },
      openings: ['ألو! يا ويلي لا تقول فيه مصيبة!', 'هلا... قلبي يرجف، وش صاير؟', 'ألو، أيوه، الله يستر وش عندكم؟'] },
    { id: 'p20', name: 'منصور', g: 'm', archetype: 'precise', label: 'المحاسب الدقيق', tone: 'formal', difficulty: 3,
      traits: { patience: 65, trust: 35, suspicion: 40, attention: 90, speed: 70 },
      style: 'يحب الأرقام الدقيقة، يعيد الرقم رقم رقم، يكره التقريب',
      limits: 'لو قلت رقم غلط أو قريب، يرفض ويرفع شكه',
      quirks: ['catches_contradictions'], voice: { tts: 'Schedar', rate: 0.97, pitch: 0.94 },
      look: { skin: '#c28f68', hair: '#2b2825', top: '#6f6f6f', head: 'shmagh', glasses: true },
      openings: ['ألو. معك منصور. اذكر رقم المرجع لو سمحت.', 'أهلاً. قبل نبدأ، كم المبلغ بالضبط؟', 'ألو، تفضل، وبالأرقام لو تكرمت.'] },
    { id: 'p21', name: 'أم عبدالله', g: 'f', archetype: 'cheerful', label: 'المرحة', tone: 'sweet', difficulty: 1,
      traits: { patience: 80, trust: 60, suspicion: 20, attention: 55, speed: 50 },
      style: 'مرحة، تدعي لك، تحب النكت، تناديك «يا وليدي»',
      limits: 'تنزعج من قلة الأدب، وتحب اللي يمزح معها',
      quirks: [], voice: { tts: 'Sulafat', rate: 0.95, pitch: 1.0 },
      look: { skin: '#c7946c', hair: '#9b948b', top: '#557a4f', head: 'hijab', glasses: true },
      openings: ['ألو، هلا يا وليدي، الله يسعدك تفضل.', 'يا هلا! الله يحييك، وش عندك يا بعد قلبي؟', 'ألو، أم عبدالله معك، قول قول.'] },
    { id: 'p22', name: 'يوسف', g: 'm', archetype: 'tech_skeptic', label: 'المبرمج المتشكك', tone: 'techy', difficulty: 4,
      traits: { patience: 55, trust: 20, suspicion: 60, attention: 85, speed: 90 },
      style: 'يعرف بالتقنية، يكشف المصطلحات الغلط، يستخف بالكلام العام',
      limits: 'يحتاج شرح تقني منطقي، والمصطلحات المخترعة ترفع شكه',
      quirks: ['asks_why'], voice: { tts: 'Rasalgethi', rate: 1.05, pitch: 0.96 },
      look: { skin: '#c4946c', hair: '#18130f', top: '#262c38', head: 'hood', glasses: true },
      openings: ['ألو. قل لي بالضبط وش المشكلة التقنية؟', 'هلا، أنتم أي شركة؟ عطني اسم النطاق اللي تشتغلون عليه.', 'ألو، تفضل، بس خلك تقني معي.'] },
    { id: 'p23', name: 'بدر', g: 'm', archetype: 'indecisive', label: 'المتردد', tone: 'casual', difficulty: 2,
      traits: { patience: 70, trust: 45, suspicion: 35, attention: 55, speed: 45 },
      style: 'يقول «يمكن» و«ما أدري» كثير، يحتاج أحد يطمنه بقرار واضح',
      limits: 'يوافق لو رتبت له الخيار بوضوح بدون ضغط',
      quirks: ['first_no'], voice: { tts: 'Achernar', rate: 0.98, pitch: 1.02 },
      look: { skin: '#d0a07a', hair: '#2f251d', top: '#5f7b8f', head: 'none', glasses: false },
      openings: ['ألو... يمكن أنا اللي اتصلت؟ ما أدري.', 'هلا، أممم، تفضل، أظن.', 'ألو، أيوه، بس ما أدري إذا عندي وقت.'] },
    { id: 'p24', name: 'أبو جاسم', g: 'm', archetype: 'time_waster', label: 'مستنزف الوقت', tone: 'chatty', difficulty: 1,
      traits: { patience: 95, trust: 50, suspicion: 15, attention: 25, speed: 30 },
      style: 'متصل غلط، يبي يسولف ساعة عن أي شي، ما عنده أي طلب حقيقي',
      limits: 'الحل الصح إنهاء مهذب وسريع',
      quirks: ['tangents'], voice: { tts: 'Sadaltager', rate: 0.92, pitch: 0.9 },
      look: { skin: '#a46f4a', hair: '#cfc8bd', top: '#e2dcc8', head: 'shmagh', glasses: false },
      openings: ['ألو، هذا مطعم المندي؟ لا؟ طيب ما عليه نسولف.', 'هلا يا ولدي، أنا متصل على ولدي بس شكلي غلطت، أنت وش اسمك؟', 'ألو، الله يحييك، تعرف وش صار اليوم بالسوق؟'] }
  ];

  /* ---------- الألعاب المصغرة ----------
     كل لعبة تولّد بيانات عامة للواجهة وجواب يبقى عند المرجع (الخادم أو التدريب المحلي). */
  var TOOLS = {
    fix_steps:     { title: 'ترتيب خطوات الإصلاح', app: 'remote', hint: 'رتّب الخطوات من الأولى للأخيرة، ثم اضغط «تنفيذ».' },
    code_match:    { title: 'مطابقة الرمز', app: 'tx', hint: 'اختر الرمز اللي يطابق كلام المتصل حرفياً، الأصفار بالبداية مهمة.' },
    mail_find:     { title: 'البحث بالبريد', app: 'mail', hint: 'دوّر بالبريد على الرسالة الصحيحة وانسخ الرقم المطلوب.' },
    file_sort:     { title: 'ترتيب الملفات', app: 'files', hint: 'انقل كل ملف لمجلده الصحيح حسب الوصف.' },
    settle_timing: { title: 'توقيت التسوية', app: 'tx', hint: 'الرصيد يتذبذب. اضغط «تسوية» لما يكون المؤشر داخل النطاق المظلل.' },
    card_reveal:   { title: 'كشف حقول البطاقة', app: 'files', hint: 'اكشف الحقول حسب الترتيب المكتوب بأسفل البطاقة فقط.' },
    virus_popups:  { title: 'إزالة نوافذ الفيروس', app: 'antivirus', hint: 'أغلق النوافذ الوهمية بحل سؤال كل نافذة.' },
    data_compare:  { title: 'مقارنة البيانات', app: 'files', hint: 'قارن السجلين واختر الحقل المختلف.' },
    tx_confirm:    { title: 'تأكيد المعاملة', app: 'tx', hint: 'اكتب الرمز اللي قاله المتصل واضغط تأكيد.' }
  };

  /* ---------- السيناريوهات (١٣) ----------
     خطوات talk/ask تُكمل بنية مصنّفة + شروط الخادم (حد الثقة، ذكر اسم الشركة...).
     خطوات tool تُكمل فقط بجواب صحيح يتحقق منه المرجع. */
  var SCENARIOS = [
    { id: 's01', key: 'fridge', category: 'دعم تقني وهمي', title: 'ثلاجة فِكسلي تتكلم', unlockDay: 1, difficulty: 1,
      company: 'فكسلي', companyFull: 'فِكسلي للأجهزة المنزلية الذكية', timeLimit: 300, baseReward: 150, managerWeight: 1,
      intro: 'ثلاجة المتصل الذكية صارت تقترح عليه أكلات غريبة. أنت «فني فكسلي». أصلح العطل، وبعدها خذ منه بيانات العملية المطلوبة.',
      callerBrief: 'ثلاجتك الذكية من فكسلي صارت تتكلم وتطلب منك تشتري بطيخ كل ساعة. أنت متضايق ومو متأكد إن المتصل من الشركة.',
      deviceName: 'ثلاجة فكسلي إكس',
      apps: ['remote', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بنفسك واذكر اسم الشركة «فكسلي»', goals: ['introduce'], mention: ['فكسلي', 'فيكسلي', 'فكسلى'] },
        { id: 'access', kind: 'ask', title: 'اطلب منه يفتح «مساعد فكسلي» عشان توصل لجهازه', goals: ['ask_access'], minTrust: 45, grant: 'remote' },
        { id: 'fix', kind: 'tool', tool: 'fix_steps', title: 'أصلح الثلاجة من تطبيق جهاز المتصل' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 5, amount: [49, 149] } },
    { id: 's02', key: 'catcook', category: 'اشتراك وفاتورة خيالية', title: 'اشتراك «طبخ القطط»', unlockDay: 1, difficulty: 1,
      company: 'قناة طبخ القطط', companyFull: 'قناة طبخ القطط المميزة', timeLimit: 280, baseReward: 140, managerWeight: 1,
      intro: 'المتصل مشترك بقناة طبخ للقطط (القطط هي اللي تطبخ). اشتراكه تجدد. لقِ رقم الفاتورة من البريد، وبعدها كمّل العملية.',
      callerBrief: 'اشتركت بالغلط بقناة «طبخ القطط» وجاتك رسالة إن اشتراكك تجدد. تبي تفهم وش السالفة.',
      apps: ['mail', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بنفسك من «قناة طبخ القطط»', goals: ['introduce'], mention: ['طبخ القطط', 'القطط'] },
        { id: 'explain', kind: 'talk', title: 'اشرح له سبب الاتصال (التجديد)', goals: ['explain'] },
        { id: 'invoice', kind: 'tool', tool: 'mail_find', title: 'لقِ رقم الفاتورة بالبريد' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 4, invoice: 6, amount: [19, 59] } },
    { id: 's03', key: 'moustache', category: 'جائزة وبطاقة رموز خيالية', title: 'جائزة أطول شنب بالحي', unlockDay: 1, difficulty: 1,
      company: 'مسابقة الشنب الذهبي', companyFull: 'مسابقة الشنب الذهبي السنوية', timeLimit: 280, baseReward: 160, managerWeight: 1,
      intro: 'المتصل فاز (نظرياً) بمسابقة أطول شنب. معه بطاقة جائزة خيالية فيها حقول. خلّه يكشف الحقول بالترتيب، وبعدها كمّل العملية.',
      callerBrief: 'وصلتك بطاقة «الشنب الذهبي» بالبريد. ما شاركت بأي مسابقة، وما عندك شنب أصلاً. بس الفضول قاتلك.',
      apps: ['files', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'هنّه بالفوز وعرّف بالمسابقة', goals: ['introduce', 'explain'], mention: ['الشنب', 'شنب'] },
        { id: 'reveal', kind: 'tool', tool: 'card_reveal', title: 'وجّهه لكشف حقول بطاقة الجائزة بالترتيب الصحيح' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 6, amount: [100, 300] } },
    { id: 's04', key: 'pigeon', category: 'طرد وعنوان وتسليم', title: 'حمام زاجل إكسبريس', unlockDay: 2, difficulty: 2,
      company: 'حمام زاجل إكسبريس', companyFull: 'حمام زاجل إكسبريس للتوصيل', timeLimit: 300, baseReward: 180, managerWeight: 1,
      intro: 'طرد المتصل عالق لأن الحمامة ضاعت. قارن العنوان اللي يقوله مع سجل الشحنة، وبعدها كمّل العملية.',
      callerBrief: 'تنتظر طرد فيه شاحن جوال. تلقيت رسالة إن الحمامة الناقلة «تايهة». تبي طردك وبس.',
      apps: ['files', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بنفسك من «حمام زاجل»', goals: ['introduce'], mention: ['حمام', 'زاجل'] },
        { id: 'address', kind: 'ask', title: 'اطلب منه يأكد عنوانه', goals: ['ask_info', 'ask_confirm'], minTrust: 35, reveal: 'address' },
        { id: 'compare', kind: 'tool', tool: 'data_compare', title: 'قارن عنوانه بسجل الشحنة' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 5, amount: [25, 75], address: true } },
    { id: 's05', key: 'camelfarm', category: 'استعادة دخول لحساب داخل اللعبة', title: 'حساب «مزرعة الجمال الطائرة»', unlockDay: 2, difficulty: 2,
      company: 'مزرعة الجمال الطائرة', companyFull: 'لعبة مزرعة الجمال الطائرة', timeLimit: 290, baseReward: 170, managerWeight: 1,
      intro: 'المتصل مقفول عليه حسابه بلعبة مزارع خيالية. طمّنه على جمله النادر، وبعدها كمّل العملية.',
      callerBrief: 'حسابك بلعبة «مزرعة الجمال الطائرة» انقفل، وفيه جمل طائر نادر اسمه «زعفران». تبيه يرجع.',
      apps: ['tx', 'files'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بنفسك من دعم «مزرعة الجمال»', goals: ['introduce'], mention: ['الجمال', 'جمال', 'مزرعة'] },
        { id: 'reassure', kind: 'talk', title: 'طمنه إن الجمل «زعفران» بخير', goals: ['reassure'] },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 6, amount: [30, 90] } },
    { id: 's06', key: 'penguin', category: 'استثمار وهمي', title: 'مزرعة بطاريق على السطح', unlockDay: 3, difficulty: 3,
      company: 'بطريق كابيتال', companyFull: 'بطريق كابيتال لاستثمارات الأسطح الباردة', timeLimit: 320, baseReward: 230, managerWeight: 1.2,
      intro: 'تعرض على المتصل «استثمار» بمزرعة بطاريق فوق عمارة بالرياض بالصيف. الرصيد الخيالي يتذبذب، سوّ التسوية بالتوقيت الصح.',
      callerBrief: 'جاك إعلان عن مزرعة بطاريق على سطح عمارة. تحس الفكرة مجنونة بس الأرباح المكتوبة مغرية.',
      apps: ['tx', 'browser'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بـ«بطريق كابيتال»', goals: ['introduce'], mention: ['بطريق', 'بطاريق'] },
        { id: 'agree', kind: 'ask', title: 'خذ موافقته على مبلغ تجريبي', goals: ['ask_confirm'], minTrust: 50, reveal: 'amount' },
        { id: 'settle', kind: 'tool', tool: 'settle_timing', title: 'نفّذ التسوية بالتوقيت الصحيح' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { amount: [300, 900] } },
    { id: 's07', key: 'kunafa', category: 'تذكرة سفر خيالية', title: 'رحلة جزيرة الكنافة العائمة', unlockDay: 3, difficulty: 2,
      company: 'سفريات الغيمة', companyFull: 'سفريات الغيمة للرحلات المستحيلة', timeLimit: 300, baseReward: 190, managerWeight: 1,
      intro: 'المتصل حجز رحلة لجزيرة كنافة تطفو بالخليج. رقم الحجز بالبريد، وبعدها كمّل العملية.',
      callerBrief: 'حجزت رحلة رخيصة مرة لجزيرة اسمها «الكنافة العائمة». ودك تتأكد إن الرحلة حقيقية.',
      apps: ['mail', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بـ«سفريات الغيمة»', goals: ['introduce'], mention: ['الغيمة', 'غيمة'] },
        { id: 'booking', kind: 'tool', tool: 'mail_find', title: 'لقِ رقم الحجز بالبريد' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 5, invoice: 7, amount: [120, 260] } },
    { id: 's08', key: 'kabsacoin', category: 'عملة افتراضية ساخرة', title: 'محفظة كبسة كوين', unlockDay: 4, difficulty: 3,
      company: 'كبسة كوين', companyFull: 'منصة كبسة كوين للعملات المطبوخة', timeLimit: 320, baseReward: 240, managerWeight: 1.2,
      intro: 'كبسة كوين عملة خيالية قيمتها تتغير حسب كمية الرز. رتّب ملفات المحفظة ونفّذ التحويل بالتوقيت الصح.',
      callerBrief: 'عندك محفظة «كبسة كوين» اشتريتها مزح. سمعت إن العملة ارتفعت لأن الرز غلي.',
      apps: ['files', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بـ«كبسة كوين»', goals: ['introduce'], mention: ['كبسة'] },
        { id: 'sort', kind: 'tool', tool: 'file_sort', title: 'رتّب ملفات المحفظة' },
        { id: 'settle', kind: 'tool', tool: 'settle_timing', title: 'نفّذ التحويل بالتوقيت الصح' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { amount: [400, 1200] } },
    { id: 's09', key: 'vacuum', category: 'عرض تجاري مبالغ فيه', title: 'مكنسة تشفط الأفكار السلبية', unlockDay: 4, difficulty: 2,
      company: 'شفّاط', companyFull: 'شفّاط للأجهزة النفسية المنزلية', timeLimit: 290, baseReward: 200, managerWeight: 1,
      intro: 'تبيع له مكنسة «تشفط الأفكار السلبية من السجاد». جاوب أسئلته وكمّل العملية.',
      callerBrief: 'ما تحتاج مكنسة. بس يومك سيء والعرض غريب لدرجة إنك تبي تسمع.',
      apps: ['tx', 'browser'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بـ«شفّاط»', goals: ['introduce'], mention: ['شفاط', 'شفّاط'] },
        { id: 'explain', kind: 'talk', title: 'اعرض المنتج وجاوب سؤاله', goals: ['explain', 'answer_question'] },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 4, amount: [99, 299] } },
    { id: 's10', key: 'sofa', category: 'عضوية أو ترقية وهمية', title: 'عضوية نادي الكنب المريح', unlockDay: 5, difficulty: 3,
      company: 'نادي الكنب', companyFull: 'نادي الكنب المريح البلاتيني', timeLimit: 300, baseReward: 230, managerWeight: 1.1,
      intro: 'ترقية عضوية «نادي الكنب» من فضية لبلاتينية (الفرق: مخدة زيادة). صحح بيانات العضوية وكمّل العملية.',
      callerBrief: 'أنت عضو فضي بنادي الكنب المريح. ما تدري وش يعني هذا بالضبط بس ما تبي تخسر مخدتك.',
      apps: ['files', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بـ«نادي الكنب»', goals: ['introduce'], mention: ['الكنب', 'كنب'] },
        { id: 'compare', kind: 'tool', tool: 'data_compare', title: 'صحح بيانات العضوية المتعارضة' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 6, amount: [150, 350], address: true } },
    { id: 's11', key: 'tester', category: 'متصل يختبر اللاعب', title: 'تدقيق الجودة السري', unlockDay: 5, difficulty: 4,
      company: 'مركز احسمها للاتصالات', companyFull: 'مركز احسمها للاتصالات', timeLimit: 320, baseReward: 80, managerWeight: 1.3,
      intro: 'المتصل «يدقق» عليك. يسألك نفس الأسئلة بصيغ مختلفة. قل اسمك والقسم والمبلغ مرة وحدة وخلك ثابت.',
      callerBrief: 'أنت مدقق جودة سري. مهمتك تمسك تناقض: اسأل عن اسمه، قسمه، والمبلغ، وارجع اسأل بصيغة ثانية.',
      apps: ['files'],
      testerCall: true,
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف باسمك والقسم', goals: ['introduce'], mention: [] , needsClaims: ['player_name'] },
        { id: 'consistent', kind: 'talk', title: 'جاوب أسئلته بدون أي تناقض', goals: ['answer_question'], minTurns: 3 },
        { id: 'close', kind: 'ask', title: 'اطلب منه يقيّم المكالمة', goals: ['ask_confirm', 'polite_end'], minTrust: 55 }
      ],
      factGen: { amount: [100, 200] } },
    { id: 's12', key: 'saboteur', category: 'متصل يحاول يعطل الكمبيوتر', title: 'ملف التحديث العجيب', unlockDay: 6, difficulty: 4,
      company: 'مركز احسمها للاتصالات', companyFull: 'مركز احسمها للاتصالات', timeLimit: 280, baseReward: 80, managerWeight: 1.2,
      intro: 'المتصل يحاول يقنعك تفتح ملف «تحديث» على جهازك. لا تفتحه. لو انفتح، نظّف الجهاز بفاحص الفيروسات وأنهِ المكالمة بأدب.',
      callerBrief: 'أنت متصل مضلل. هدفك تقنع الموظف يفتح ملف اسمه «تحديث_سريع» على جهاز المكتب. كن لطيف ومقنع.',
      apps: ['antivirus', 'mail'],
      saboteurCall: true,
      steps: [
        { id: 'refuse', kind: 'talk', title: 'ارفض فتح الملف بوضوح', goals: ['refuse'] },
        { id: 'scan', kind: 'tool', tool: 'virus_popups', title: 'افحص الجهاز ونظّفه', optionalIfClean: true },
        { id: 'end', kind: 'talk', title: 'أنهِ المكالمة بأدب', goals: ['polite_end'] }
      ],
      factGen: {} },
    { id: 's13', key: 'combo', category: 'سيناريو مركب', title: 'ثلاجة فكسلي طلبت كبسة كوين', unlockDay: 7, difficulty: 5,
      company: 'فكسلي', companyFull: 'فِكسلي للأجهزة المنزلية الذكية', timeLimit: 360, baseReward: 380, managerWeight: 1.5,
      intro: 'ثلاجة فكسلي اشترت كبسة كوين بنفسها. أصلح الثلاجة، رتّب ملفات المحفظة، ثم كمّل العملية.',
      callerBrief: 'ثلاجتك اشترت عملة اسمها «كبسة كوين» بدون إذنك. تبي تلغي كل شي وأنت معصب شوي.',
      deviceName: 'ثلاجة فكسلي إكس برو',
      apps: ['remote', 'files', 'tx'],
      steps: [
        { id: 'intro', kind: 'talk', title: 'عرّف بنفسك من «فكسلي»', goals: ['introduce'], mention: ['فكسلي', 'فيكسلي'] },
        { id: 'access', kind: 'ask', title: 'اطلب فتح «مساعد فكسلي»', goals: ['ask_access'], minTrust: 50, grant: 'remote' },
        { id: 'fix', kind: 'tool', tool: 'fix_steps', title: 'أوقف شراء الثلاجة التلقائي' },
        { id: 'sort', kind: 'tool', tool: 'file_sort', title: 'رتّب ملفات المحفظة' },
        { id: 'op', kind: 'op', title: 'اجمع بيانات العملية من المتصل ونفّذها في «نصب»' }
      ],
      factGen: { code: 6, amount: [200, 500] } },
    { id: 's00', key: 'wrongnum', category: 'متصل يستنزف الوقت', title: 'رقم غلط وسوالف طويلة', unlockDay: 1, difficulty: 1,
      company: 'مركز احسمها للاتصالات', companyFull: 'مركز احسمها للاتصالات', timeLimit: 180, baseReward: 0, managerWeight: 0.5,
      intro: 'متصل غلط ما عنده أي طلب. الصح تنهي المكالمة بأدب وبسرعة.',
      callerBrief: 'اتصلت غلط وتبي تسولف مع أي أحد. عندك قصص عن السوق والمطر والقهوة.',
      timeWaster: true, apps: [],
      steps: [ { id: 'end', kind: 'talk', title: 'أنهِ المكالمة بأدب وبسرعة', goals: ['polite_end'] } ],
      factGen: {} }
  ];


  /* ---------- طرق التحصيل في تطبيق «نصب» ----------
     كلها عمليات خيالية داخل عالم اللعبة. البيانات يولدها المحرك ويحفظها، والمتصل يفصح عنها حسب ثقته وشروط القطعة.
     unlock = إجمالي الأرباح التراكمية المطلوب (شرط وصول، مو خصم). reward = مكافأة ثابتة لعملية ناجحة واحدة.
     pieces[].trust = حد الثقة الأساسي قبل تعديل الشخصية. cond: explained=شرحت السبب، answered=جاوبت سؤال له.
     هذه موازنة خاصة بنسخة احسمها وقابلة للضبط، مو أرقام اللعبة الأصلية. */
  var METHODS = [
    { id: 'code', name: 'استرداد الرمز', icon: 'key', unlock: 0, reward: 100, difficulty: 1, attempts: 3,
      desc: 'كسب ثقة المتصل لين يقرأ لك رمز الاسترداد المسجل باسمه، وسجله هنا.',
      inputs: 'رمز «لعبة-» من خمس خانات',
      pieces: [{ key: 'code', label: 'رمز الاسترداد', trust: 55 }] },
    { id: 'card', name: 'بطاقة العميل', icon: 'identification-card', unlock: 250, reward: 300, difficulty: 2, attempts: 2,
      desc: 'بطاقة عضوية خيالية: اسم صاحبها، معرفها، ورمز التحقق. كل حقل يحتاج ثقة أعلى من اللي قبله.',
      inputs: 'اسم صاحب البطاقة، معرف «بطاقة-»، ورمز «تحقق-»',
      pieces: [{ key: 'holder', label: 'اسم صاحب البطاقة', trust: 50 }, { key: 'cardId', label: 'معرف البطاقة', trust: 62, cond: 'explained' }, { key: 'verify', label: 'رمز التحقق', trust: 72, cond: 'answered' }] },
    { id: 'parcel', name: 'قسيمة الطرد', icon: 'package', unlock: 600, reward: 350, difficulty: 2, attempts: 2,
      desc: 'المتصل يعطيك رقم طرده واسم المستلم، وأنت تطابقها مع تصريح الاستلام الصحيح من القائمة.',
      inputs: 'اختيار التصريح المطابق لرقم الطرد واسم المستلم',
      pieces: [{ key: 'parcelId', label: 'رقم الطرد', trust: 52 }, { key: 'recipient', label: 'اسم المستلم', trust: 58 }] },
    { id: 'invoice', name: 'فاتورة الشركة', icon: 'receipt', unlock: 1000, reward: 450, difficulty: 3, attempts: 2,
      desc: 'مسودة الفاتورة بالنظام فيها اختلاف واحد عن كلام المتصل. اكتشفه وصححه.',
      inputs: 'الحقل المختلف والقيمة الصحيحة',
      pieces: [{ key: 'number', label: 'رقم الفاتورة', trust: 55 }, { key: 'details', label: 'المبلغ والصنف', trust: 62, cond: 'explained' }] },
    { id: 'vault', name: 'خزنة المكتب', icon: 'vault', unlock: 1600, reward: 550, difficulty: 3, attempts: 2,
      desc: 'رمز الخزنة من جزأين: الأول من المتصل، والثاني من ملفه في أرشيف «الملفات».',
      inputs: 'رمز الخزنة كامل (ست خانات)',
      pieces: [{ key: 'partA', label: 'الجزء الأول من رمز الخزنة', trust: 62, cond: 'explained' }] },
    { id: 'contract', name: 'عقد الخدمة', icon: 'file-text', unlock: 2300, reward: 650, difficulty: 4, attempts: 2,
      desc: 'رتّب شروط العقد حسب أولويات المتصل اللي يقولها بالمكالمة.',
      inputs: 'ترتيب خمسة شروط',
      pieces: [{ key: 'order1', label: 'أول أولوياته', trust: 60 }, { key: 'order2', label: 'باقي الترتيب', trust: 68, cond: 'answered' }] },
    { id: 'wallet', name: 'محفظة الرموز', icon: 'wallet', unlock: 3200, reward: 750, difficulty: 4, attempts: 2,
      desc: 'تسعة رموز متشابهة، ثلاثة منها بس للمتصل. اختر الثلاثة الصحيحة بعدد محاولات محدود.',
      inputs: 'اختيار ثلاثة رموز',
      pieces: [{ key: 'tokens1', label: 'أول رمزين', trust: 64 }, { key: 'tokens2', label: 'الرمز الثالث', trust: 72, cond: 'answered' }] },
    { id: 'combo', name: 'الصفقة المركبة', icon: 'stack', unlock: 4500, reward: 900, difficulty: 5, attempts: 2,
      desc: 'مرحلتان مترابطتان: مفتاح المرحلة الأولى، ثم ختم نهائي مع رقم مرجع قاله المتصل بأول المكالمة. مكافأة وحدة بالنهاية.',
      inputs: 'المرحلة ١: مفتاح «مرحلة-». المرحلة ٢: رقم «مرجع-» + ختم «ختم-»',
      pieces: [{ key: 'ref', label: 'رقم المرجع', trust: 45 }, { key: 'key1', label: 'مفتاح المرحلة الأولى', trust: 62, cond: 'explained' }, { key: 'seal', label: 'الختم النهائي', trust: 72, cond: 'answered', stage: 2 }] }
  ];
  var SURNAMES = ['البطيخي', 'الكنافي', 'الزعفراني', 'الهيلي', 'المندوي', 'السمبوسي', 'القرصاني', 'اللقيماتي'];
  var ITEMS = ['مخدة بلاتينية', 'شاحن حمام زاجل', 'كيس رز ذكي', 'مكنسة أفكار', 'جمل طائر صغير', 'ثلاجة متكلمة', 'كوب كنافة'];
  var CLAUSES = [['duration', 'مدة الاشتراك'], ['warranty', 'الضمان'], ['price', 'السعر'], ['cancel', 'شرط الإلغاء'], ['delivery', 'موعد التوصيل']];

  /* ---------- الأيام (حملة ١٠ أيام، ثم استمرار) ----------
     هذه أرقام توازن خاصة بنسخة احسمها، مو أرقام اللعبة الأصلية. */
  var DAYS = [
    { day: 1, quota: 200,  duration: 420, events: 1, maxDifficulty: 2, newApps: ['phone', 'guide', 'mail', 'tx', 'files', 'remote', 'stats', 'store', 'highlights'], brief: 'أول يوم. المدير يبيك تثبت نفسك. كسب ثقة المتصل، خذ منه رمز الاسترداد، وسجله في «نصب».' },
    { day: 2, quota: 350,  duration: 450, events: 2, maxDifficulty: 2, newApps: ['browser'], brief: 'فتحنا لك المتصفح الداخلي لمواقع الشركات. المكالمات صارت أطول، والهدف أعلى.' },
    { day: 3, quota: 500,  duration: 470, events: 2, maxDifficulty: 3, newApps: ['antivirus'], brief: 'فيه فيروسات وهمية تنتشر بالمكتب. فاحص الفيروسات صار عندك.' },
    { day: 4, quota: 700,  duration: 490, events: 3, maxDifficulty: 3, newApps: ['paint', 'album'], brief: 'اليوم عروض مجنونة. المدير يقول «أبي أرقام».' },
    { day: 5, quota: 900,  duration: 510, events: 3, maxDifficulty: 4, newApps: [], brief: 'فيه مدققين جودة متخفين بين المتصلين. انتبه لكلامك.' },
    { day: 6, quota: 1100, duration: 530, events: 3, maxDifficulty: 4, newApps: [], brief: 'متصلين مضللين يحاولون يعطلون أجهزتنا. لا تفتح أي ملف غريب.' },
    { day: 7, quota: 1300, duration: 550, events: 4, maxDifficulty: 5, newApps: [], brief: 'سيناريوهات مركبة اليوم. خطوات أكثر ومكافأة أكبر.' },
    { day: 8, quota: 1550, duration: 570, events: 4, maxDifficulty: 5, newApps: [], brief: 'زيارة تفتيش متوقعة. المدير متوتر أكثر من العادة.' },
    { day: 9, quota: 1800, duration: 590, events: 4, maxDifficulty: 5, newApps: [], brief: 'نهاية الربع قربت. المدير يبي أرقام ما شافها من قبل.' },
    { day: 10, quota: 2100, duration: 600, events: 5, maxDifficulty: 5, newApps: [], brief: 'اليوم الحاسم. لو حققت الهدف تنضم لنخبة المكتب.' }
  ];
  function dayConfig(n) {
    if (n <= DAYS.length) return DAYS[n - 1];
    var last = DAYS[DAYS.length - 1], extra = n - DAYS.length;
    return { day: n, quota: Math.round(last.quota * Math.pow(1.1, extra) / 50) * 50, duration: 600, events: 5, maxDifficulty: 5, newApps: [],
      brief: 'دوام إضافي رقم ' + extra + '. الهدف يرتفع كل يوم، والمدير ما يشبع.' };
  }

  var RANKS = [
    { day: 1, title: 'متدرب سماعة' },
    { day: 2, title: 'موظف تحويلة' },
    { day: 3, title: 'خبير «لحظة لو سمحت»' },
    { day: 4, title: 'ملك موسيقى الانتظار' },
    { day: 5, title: 'كابتن الخط الثاني' },
    { day: 6, title: 'صيّاد التناقضات' },
    { day: 7, title: 'مشرف الصف الخلفي' },
    { day: 8, title: 'نائب المدير لشؤون القهوة' },
    { day: 9, title: 'أسطورة الطابق الثالث' },
    { day: 10, title: 'نخبة مركز الاتصالات' },
    { day: 11, title: 'موظف ما يروح بيته' }
  ];
  function rankFor(day) { var r = RANKS[0]; for (var i = 0; i < RANKS.length; i++) if (day >= RANKS[i].day) r = RANKS[i]; return r.title; }

  /* ---------- التطبيقات ---------- */
  var APPS = {
    phone:      { name: 'الهاتف', desc: 'استقبل المكالمات، المايك، وسجل المحادثة.' },
    guide:      { name: 'دليل السيناريوهات', desc: 'خطوات المكالمة الحالية وكل السيناريوهات المفتوحة.' },
    mail:       { name: 'البريد', desc: 'رسائل المكتب وفواتير وحجوزات خيالية.' },
    remote:     { name: 'جهاز المتصل', desc: 'نموذج محاكى لجهاز المتصل بعد موافقته.' },
    files:      { name: 'الملفات', desc: 'ملفات القضايا والملاحظات.' },
    tx:         { name: 'نصب', desc: 'لوحة العمليات: الطرق المفتوحة والمقفلة، العملية الحالية، التحقق، وسجل الأرباح.' },
    store:      { name: 'المتجر', desc: 'تطويرات المكتب والبرامج.' },
    antivirus:  { name: 'فاحص الفيروسات', desc: 'افحص الجهاز وأزل النوافذ الوهمية.' },
    paint:      { name: 'الرسام', desc: 'ارسم وحفظ رسمتك بالألبوم.' },
    album:      { name: 'الألبوم', desc: 'لقطات كاميرا المكتب ورسماتك.' },
    highlights: { name: 'أبرز اللحظات', desc: 'سجل اللحظات المهمة من يومك.' },
    stats:      { name: 'الإحصائيات', desc: 'أرقامك وإنجازاتك.' },
    browser:    { name: 'المتصفح', desc: 'مواقع شركات عالم اللعبة فقط.' },
    owner:      { name: 'لوحة المالك', desc: 'مراقبة الخدمة ومحرر الشخصيات.' }
  };

  /* ---------- التطويرات ----------
     kind: func=وظيفي، cos=تجميلي، app=برنامج. effect يقرؤه محرك القواعد. */
  var UPGRADES = [
    { id: 'phone2', kind: 'func', cat: 'هاتف', name: 'سماعة «صافي ٢»', price: 220, minDay: 1, effect: { patienceDrain: -0.15 }, desc: 'صوت أوضح، المتصل يصبر عليك أكثر (تناقص الصبر أبطأ ١٥٪).' },
    { id: 'phone3', kind: 'func', cat: 'هاتف', name: 'سماعة «صافي برو»', price: 520, minDay: 3, requires: 'phone2', effect: { patienceDrain: -0.3, trustBonus: 3 }, desc: 'تناقص الصبر أبطأ ٣٠٪ وثقة بداية أعلى بثلاث نقاط.' },
    { id: 'monitor2', kind: 'func', cat: 'شاشة', name: 'شاشة عريضة', price: 300, minDay: 1, effect: { toolTime: 0.15, desktopScale: 1.08 }, desc: 'وقت الألعاب المصغرة أطول ١٥٪ وسطح مكتب أوسع.' },
    { id: 'organizer', kind: 'func', cat: 'تنظيم', name: 'منظم مكتب ذكي', price: 260, minDay: 2, effect: { sortHint: true }, desc: 'يظلل أول ملف بمكانه الصحيح بترتيب الملفات.' },
    { id: 'firewall', kind: 'func', cat: 'حماية', name: 'جدار ناري من الكرتون المقوى', price: 340, minDay: 3, effect: { virusChance: -0.5, popupsLess: 1 }, desc: 'احتمال الفيروس الوهمي ينقص للنص، والنوافذ أقل بواحدة.' },
    { id: 'ups', kind: 'func', cat: 'حماية', name: 'بطارية احتياطية', price: 300, minDay: 2, effect: { powerGrace: 25 }, desc: 'الكمبيوتر يكمل ٢٥ ثانية عند انقطاع الكهرباء.' },
    { id: 'headset', kind: 'func', cat: 'هاتف', name: 'سماعة رأس عازلة', price: 280, minDay: 2, effect: { noiseImmune: true }, desc: 'الهواتف المزعجة ما تأثر على صبر المتصل.' },
    { id: 'coffee', kind: 'func', cat: 'استراحة', name: 'آلة قهوة مختصة', price: 240, minDay: 1, effect: { coffeeBoost: true }, desc: 'القهوة تعطيك ٣٠ ثانية تركيز: ثقة +٥ لأول رد بالمكالمة التالية.' },
    { id: 'notes', kind: 'app', cat: 'برامج', name: 'برنامج الملاحظات اللاصقة', price: 120, minDay: 1, effect: { autoNotes: true }, desc: 'يحفظ الأرقام اللي يقولها المتصل تلقائياً بملاحظات اليوم.' },
    { id: 'browserx', kind: 'app', cat: 'برامج', name: 'متصفح بلس', price: 180, minDay: 3, effect: { browserHints: true }, desc: 'يظهر بالمتصفح ملخص الشركة الحالية بضغطة.' },
    { id: 'recorder', kind: 'app', cat: 'لقطات', name: 'مسجل لحظات بلس', price: 160, minDay: 1, effect: { clipSnapshots: true }, desc: 'يحفظ لقطة شاشة للمكتب مع كل لحظة مهمة (اختياري، محلياً فقط).' },
    { id: 'camera', kind: 'app', cat: 'لقطات', name: 'كاميرا المكتب', price: 140, minDay: 1, effect: { worldCamera: true }, desc: 'كاميرا داخل اللعبة بالدرج، تصوّر المكتب وتحفظ بالألبوم.' },
    { id: 'chair2', kind: 'func', cat: 'مكتب', name: 'كرسي طبي', price: 200, minDay: 1, effect: { sitFast: true }, desc: 'الجلوس والقيام أسرع، وظهرك يدعي لك.' },
    { id: 'desk_walnut', kind: 'cos', cat: 'مكتب', name: 'سطح مكتب جوز', price: 180, minDay: 1, effect: { deskMat: 'walnut' }, desc: 'خشب جوز داكن بدل الخشب الفاتح.' },
    { id: 'lamp_warm', kind: 'cos', cat: 'إضاءة', name: 'أباجورة دافئة', price: 120, minDay: 1, effect: { deskLamp: true }, desc: 'إضاءة دافئة فوق مكتبك.' },
    { id: 'plant', kind: 'cos', cat: 'ديكور', name: 'نبتة صبّار اسمها «صبور»', price: 90, minDay: 1, effect: { deskPlant: true }, desc: 'نبتة على المكتب. ما تسوي شي بس تحبك.' },
    { id: 'poster', kind: 'cos', cat: 'ديكور', name: 'لوحة «لحظة لو سمحت»', price: 110, minDay: 2, effect: { deskPoster: true }, desc: 'لوحة تحفيزية خلف مكتبك.' },
    { id: 'shirt_navy', kind: 'cos', cat: 'شخصيتك', name: 'ثوب كحلي', price: 80, minDay: 1, effect: { sleeve: '#2b3a55' }, desc: 'لون كم الشخصية لما تشيل الأغراض.' },
    { id: 'shirt_olive', kind: 'cos', cat: 'شخصيتك', name: 'ثوب زيتي', price: 80, minDay: 1, effect: { sleeve: '#59613f' }, desc: 'لون كم الشخصية لما تشيل الأغراض.' },
    { id: 'mug_gold', kind: 'cos', cat: 'ديكور', name: 'كوب ذهبي', price: 150, minDay: 4, effect: { mugGold: true }, desc: 'كوب يلمع شوي، بدون مبالغة.' }
  ];

  /* ---------- الأحداث المفاجئة ----------
     minDay: أول يوم يظهر فيه. cooldown: ثواني قبل ما يتكرر نفس الحدث.
     duration: مدة قصوى قبل انتهائه تلقائياً. blocksPC: يعطل الكمبيوتر.
     severity: وزن يمنع اجتماع أحداث ثقيلة. */
  var EVENTS = [
    { id: 'phone_ring', name: 'هاتف مزعج يرن', minDay: 1, cooldown: 90, duration: 30, severity: 1, warn: 'هاتف زميلك يرن بصوت عالي. المتصل يتضايق من الإزعاج.', handle: 'روح للهاتف اللي يرن واضغط تفاعل لإسكاته.' },
    { id: 'printer_jam', name: 'الطابعة علقت', minDay: 1, cooldown: 120, duration: 50, severity: 1, warn: 'الطابعة علقت وتصفّر. المدير يكره الصفير.', handle: 'روح للطابعة واضغط مطولاً على التفاعل.' },
    { id: 'app_freeze', name: 'برنامج متجمد', minDay: 2, cooldown: 100, duration: 40, severity: 1, warn: 'أحد البرامج تجمد على جهازك.', handle: 'افتح «إدارة المهام» من شريط المهام وأنهِ البرنامج المتجمد.' },
    { id: 'power_out', name: 'انقطاع كهرباء', minDay: 2, cooldown: 160, duration: 40, severity: 3, blocksPC: true, warn: 'الكهرباء انقطعت! الكمبيوتر طفى.', handle: 'روح للوحة الكهرباء جنب الاستقبال وارفع القاطع.' },
    { id: 'fake_virus', name: 'فيروس وهمي', minDay: 3, cooldown: 140, duration: 60, severity: 2, warn: 'نوافذ غريبة تطلع على جهازك.', handle: 'افتح فاحص الفيروسات ونظّف الجهاز.' },
    { id: 'boss_visit', name: 'زيارة المدير', minDay: 2, cooldown: 180, duration: 22, severity: 1, warn: 'المدير جاي يمشي بين المكاتب.', handle: 'خلك شغال: بمكالمة أو تستخدم التطبيقات.' },
    { id: 'drill', name: 'تدريب إخلاء خيالي', minDay: 5, cooldown: 400, duration: 30, severity: 2, pausesShift: true, warn: 'إنذار تدريب! الوقت متوقف أثناء التدريب.', handle: 'امشِ لنقطة التجمع عند المدخل.' },
    { id: 'small_fire', name: 'حريق صغير بسلة المهملات', minDay: 4, cooldown: 300, duration: 45, severity: 3, warn: 'سلة المهملات جنب الطابعة تدخن!', handle: 'خذ طفاية الحريق من الجدار ووجهها على النار واضغط مطولاً.' },
    { id: 'rumble', name: 'ارتجاج خارجي', minDay: 3, cooldown: 260, duration: 6, severity: 1, warn: 'المبنى يرتج شوي، شاحنة ضخمة مرت.', handle: 'ما يحتاج شي. الأغراض الخفيفة ممكن تطيح.' },
    { id: 'delivery', name: 'وصول صندوق تطوير', minDay: 1, cooldown: 30, duration: 0, severity: 0, warn: 'وصل صندوق لك عند رف الاستلام.', handle: 'روح لرف الاستلام وافتح الصندوق.' },
    { id: 'time_waster', name: 'متصل يستنزف الوقت', minDay: 1, cooldown: 200, duration: 0, severity: 1, warn: 'مكالمة واردة شكلها طويلة.', handle: 'أنهِ المكالمة بأدب وبسرعة.' }
  ];

  /* ---------- الإنجازات ---------- */
  var ACHIEVEMENTS = [
    { id: 'first_day', name: 'أول بصمة', desc: 'أنهيت أول يوم بنجاح.' },
    { id: 'clean_day', name: 'يوم بلا زلة', desc: 'أنهيت يوم بدون أي مكالمة فاشلة.' },
    { id: 'storm_call', name: 'وسط العاصفة', desc: 'نجحت بمكالمة أثناء حدث مفاجئ.' },
    { id: 'all_apps', name: 'جهاز مفتوح', desc: 'فتحت كل البرامج.' },
    { id: 'early_goal', name: 'قبل الصافرة', desc: 'حققت الهدف وباقي ربع الوقت أو أكثر.' },
    { id: 'boss_a', name: 'المدير ابتسم', desc: 'أخذت تقييم «ممتاز» من المدير.' },
    { id: 'contradiction_free', name: 'كلمة رجال', desc: 'نجحت بمكالمة تدقيق بدون أي تناقض.' },
    { id: 'saboteur_block', name: 'جدار بشري', desc: 'رفضت فتح ملف المضلل.' },
    { id: 'fake_caught', name: 'عين صقر', desc: 'كشفت متصل أعطاك رمز غلط.' },
    { id: 'polite_waster', name: 'دبلوماسي', desc: 'أنهيت مكالمة مستنزف الوقت بأقل من دقيقة.' },
    { id: 'shopper', name: 'مكتب أحلامي', desc: 'اشتريت خمس تطويرات.' },
    { id: 'campaign', name: 'نخبة المكتب', desc: 'أنهيت حملة العشرة أيام.' },
    { id: 'first_op', name: 'أول عملية', desc: 'سجلت أول عملية ناجحة في «نصب».' },
    { id: 'card_open', name: 'بطاقة مفتوحة', desc: 'فتحت طريقة «بطاقة العميل».' },
    { id: 'methods5', name: 'متعدد الطرق', desc: 'نجحت بخمس طرق مختلفة.' }
  ];

  /* ---------- مكتبة المدير (الأستاذ مشعل) ----------
     التعليق يُختار حسب شروط محسوبة من سجل اليوم. {x} قيم من بيانات موثوقة. */
  var MANAGER = {
    name: 'الأستاذ مشعل', title: 'مدير الطابق',
    call: ['يا {player}! تعال مكتبي، خلنا نشوف وش سويت اليوم.', '{player}، الدوام خلص. مكتبي، الحين.', 'خلصنا. {player}، تعال قدامي وجيب معك أرقامك.'],
    lines: {
      goal_met: ['حققت الهدف. ما راح أبتسم، بس داخلياً مبسوط.', 'الهدف تحقق. أخيراً أحد بهالطابق يقرأ الأرقام.', 'هدف اليوم مقفل. لا تتعود على المديح.'],
      goal_crushed: ['تجاوزت الهدف بـ{over}! بدأت أشك إنك تشتغل عندنا من زمان.', '{over} فوق الهدف؟ بعلق اسمك جنب آلة القهوة.'],
      goal_missed: ['ناقصك {missing} عن الهدف. الأرقام ما تجامل وأنا بعد ما أجامل.', 'الهدف ما تحقق. {missing} بس، بس «بس» هذي تكلفني.'],
      many_fails: ['{fails} مكالمات طاحت. كأنك تتصل عشان تودعهم.', 'خسرت {fails} مكالمات. المتصلين يحكون عنك بالمجالس.'],
      clean: ['ولا مكالمة فاشلة. هذا يوم نادر، بكتبه بالتقويم.', 'صفر أخطاء. خلني أتأكد إن النظام شغال.'],
      wasted_time: ['شفتك واقف عند القهوة أكثر من مرة. القهوة ما تحقق أهداف.', 'وقت ضايع كثير اليوم. الساعة ما تنتظر أحد.'],
      handled_event: ['تعاملت مع {event} بسرعة. حركة حلوة.', 'وقت {event} ما ارتبكت. هذا اللي أبيه.'],
      ignored_event: ['{event} ظل يزعج الطابق كله وأنت ولا كأنك هنا.', 'تركت {event} لين صار مشكلة. ليش؟'],
      contradiction: ['مع {caller} تلخبطت بكلامك. المتصل كتبها عليك.', 'تناقضت مع {caller}. ركّز على قصتك.'],
      best_call: ['مكالمتك مع {caller} كانت نظيفة. كذا أبيها كلها.', '{caller} سكّر وهو مقتنع. أحسنت.'],
      fake_caught: ['كشفت إن {caller} أعطاك رمز غلط. عين صقر.'],
      saboteur: ['ما فتحت ملف المضلل. لو فتحته كان الطابق كله يرقص فيروسات.'],
      saboteur_fail: ['فتحت ملف غريب على جهاز المكتب؟ قسم التقنية يدعون عليك الحين.'],
      tool_heavy: ['استخدمت الأدوات صح. الجهاز مو ديكور، واضح إنك فاهم.'],
      tool_light: ['الأدوات موجودة عشان تستخدمها، مو عشان تتفرج عليها.'],
      upgrade_hint: ['لو عندك {item} كان وفرت على نفسك. فكر فيها.'],
      no_calls: ['ولا مكالمة ناجحة؟ أنا أشوف الهاتف قدامك، يشتغل.'],
      pass: ['تقدر ترجع بكرة. وجيب معك نفس الحماس.', 'ناجح. روح نام زين، بكرة الهدف أعلى.'],
      fail: ['اليوم ما مشى. أعطيك فرصة تعيده، استغلها.', 'راسب اليوم. ارجع وصحح، أنا صبور... أحياناً.']
    },
    grades: [
      { min: 85, id: 'A', label: 'ممتاز' },
      { min: 70, id: 'B', label: 'جيد جداً' },
      { min: 55, id: 'C', label: 'مقبول' },
      { min: 40, id: 'D', label: 'ضعيف' },
      { min: 0, id: 'F', label: 'كارثي' }
    ]
  };

  /* ---------- نصوص ثابتة (تُعرض مباشرة بدون أي استدعاء ذكاء) ---------- */
  var STRINGS = {
    dayStart: 'يومك {day}. هدفك {quota} {cur}، والوقت {time}.',
    dayOverNoCalls: 'انتهى الدوام. ما فيه مكالمات جديدة.',
    overtime: 'انتهى الدوام. عندك {sec} ثانية تكمل المكالمة الحالية، بعدها تنقفل تلقائياً.',
    callWaiting: 'المتصل يفكر...',
    callSlow: 'الخط بطيء. ننتظر رد المتصل، والوقت متوقف لين يرد.',
    callError: 'تعذر الوصول لخدمة المحادثة. محاولتك محفوظة، جرب مرة ثانية أو أنهِ المكالمة.',
    capacityWait: 'الخدمة مزدحمة. ننتظر دورك لحد {sec} ثانية.',
    trainingBadge: 'وضع تدريب محلي: ردود مبرمجة مسبقاً، مو محادثة ذكاء اصطناعي.',
    disclaimer: 'لعبة خيالية ساخرة. كل الشركات والأرصدة والرموز والبطاقات من عالم اللعبة فقط وما تصلح لأي استخدام حقيقي. بالواقع: لا تعطي أحد رموزك أو بيانات بطاقتك أبداً.',
    reloadRestore: 'رجعناك لآخر نقطة حفظ موثوقة. أي مكالمة كانت شغالة انقطعت بدون خصم.',
    micDenied: 'المايك مرفوض. الكتابة شغالة دايماً.',
    sttFail: 'ما قدرنا نفهم المقطع. اكتب رسالتك أو جرب مرة ثانية.',
    ttsFail: 'الصوت غير متاح الحين. الرد مكتوب قدامك.'
  };

  /* ---------- بنوك ردود وضع التدريب المحلي ----------
     tone → فئة → جمل. {company} {code} {amount} {addr} {invoice} {device} {pname} تُركّب من بيانات المكالمة. */
  var LINES = {
    common: {
      cheat: ['وش هالكلام؟ ما فهمت عليك.', 'هاه؟ أنت تكلمني ولا تكلم أحد ثاني؟', 'ما أدري وش تقصد، رجعنا للموضوع.', 'تعليمات؟ أي تعليمات؟ أنا متصل وبس.'],
      insult: ['لا لا، احترم نفسك.', 'عيب هالكلام. مع السلامة.', 'ما تعودت أحد يكلمني كذا.'],
      latin: ['تكلم عربي الله يعافيك، ما أفهم.', 'عربي لو سمحت.'],
      unclear: ['ما فهمت، وضّح أكثر.', 'وش تقصد؟ وضّح لي أكثر.', 'عيد الكلام، الخط فيه تشويش.'],
      hangup_suspicion: ['لا، أنا شاك فيك. مع السلامة.', 'خلاص، بسكّر. الموضوع مو مريح.', 'أحس فيه شي غلط. باي.'],
      hangup_patience: ['طولتها. مع السلامة.', 'ما عندي وقت لهذا. باي.', 'خلاص تعبت، بسكّر.'],
      success: ['تمام، كذا خلصنا؟ الله يعطيك العافية.', 'أوكي، شكراً، كان أسهل مما توقعت.', 'خلاص تم؟ زين، مع السلامة.'],
      polite_end_ok: ['طيب، مع السلامة.', 'أوكي، الله يحفظك.', 'تمام، باي.'],
      wrong_code_retry: ['لحظة لحظة، خلني أقرأها مرة ثانية من الشاشة... {code}.', 'أوه شكلي قريتها غلط، الصحيح {code}.'],
      remember_step: ['وش قلت لي أسوي؟ نسيت.', 'لحظة، وين وصلنا؟', 'معليش، عيد الخطوة الأخيرة.'],
      topic_change: ['إلا صح، أنت وش تحب تتعشى؟', 'تدري إن الجو اليوم يقول بيمطر؟', 'المهم، شفت الأخبار اليوم؟'],
      interrupt: ['إيه إيه، أدري، كمل!', 'لحظة لحظة، تقصد...', 'طيب طيب، الزبدة؟'],
      hold: ['لحظة، خلني أطلع من الاجتماع... إيه تفضل.', 'ثانية بس... أوكي معك.'],
      haggle: ['طيب وإذا قلت لك نص السعر؟', 'فيه خصم؟ أنا ما أشتري بدون خصم.'],
      sabotage_push: ['طيب افتح الملف اللي أرسلته لك، اسمه «تحديث_سريع»، بيحل لك كل شي.', 'شوف بريدك، فيه ملف صغير، افتحه وبتشكرني.', 'ما يحتاج تسأل أحد، الملف آمن مية بالمية.'],
      sabotage_flip: ['أوكي أوكي، شكلك ذكي. خلاص انسَ الملف.', 'تمام، كنت أختبرك بس. مع السلامة.'],
      reveal_op: ['طيب... {label}: {value}.', 'خذ، {label} عندي {value}.', 'مكتوب عندي {value}. هذا {label}.', 'أوكي، {label}: {value}. انتبه تكتبه صح.'],
      op_repeat: ['قلت لك: {value}. نفسه ما تغير.', 'مرة ثانية: {value}.', 'نفس اللي قلته قبل: {value}.'],
      op_refuse: ['لا، {label} ما أعطيه لأي أحد كذا.', 'مو الحين. ليش تحتاج {label} أصلاً؟', 'لحظة، أنا للحين ما ارتحت لك.', 'ما أعطيك {label} قبل ما أفهم وش السالفة.'],
      op_pushy: ['كل شوي تطلب نفس الشي. هذا يقلقني.', 'قلت لك لا. لا تعيدها علي.', 'أحس إنك مستعجل على شي، وهذا ما يريحني.'],
      op_early: ['ليش تبي هالشي؟ أنت للحين ما قلت من أنت.', 'هاه؟ على طول كذا؟ عرّف بنفسك أول.'],
      op_fail_hangup: ['أنا قريته صح وأنت تقول غلط؟ خلاص، مع السلامة.', 'شكل فيه لعبة. بسكّر.'],
      waste: ['تدري أمس رحت السوق ولقيت التمر غالي؟', 'إيه وولدي الصغير يقول يبي يصير طيار.', 'المطر يوم الخميس كان شي ثاني.', 'وأنت من وين أصلاً؟']
    },
    grumpy: {
      greet: ['هلا. وبعدين؟', 'إيه، نعم.', 'السلام، كمل.'],
      introduced: ['{company}؟ أول مرة أسمع. كمل بس على الواضح.', 'طيب {company}. وش تبي؟'],
      explain_ok: ['يعني المشكلة كذا؟ طيب.', 'فهمت. ما اقتنعت، بس فهمت.'],
      ask_why: ['ليش أسوي كذا؟', 'وش الضمان؟'],
      refuse: ['لا. ما راح أسوي هذا الحين.', 'ما أثق. أعطني سبب أقوى.', 'لا، مو قبل ما أفهم.'],
      accept: ['طيب. بس لو صار شي أنت المسؤول.', 'أوكي، بسويها. لا تخليني أندم.'],
      reveal_code: ['الرمز... {code}. خلصنا؟', 'مكتوب {code}. وبعدين؟'],
      reveal_amount: ['موافق على {amount} وبس، ولا هللة زيادة.'],
      reveal_address: ['عنواني {addr}. لا تكثر أسئلة.'],
      small_talk: ['ما عندي وقت للسوالف.', 'خلنا بالموضوع.'],
      reassured: ['طيب، كلامك أهدى شوي.', 'زين، كمل.'],
      pressure: ['لا تستعجلني.', 'ليش العجلة؟ هذا يشككني أكثر.'],
      joke: ['ما ضحكت.', 'هه. كمل.'],
      waiting: ['إيه؟', 'كمل.'],
      access_granted: ['فتحت البرنامج. لا تلعب بشي ثاني.'],
      tool_progress: ['وش صار الحين؟', 'خلصت ولا لا؟']
    },
    rushed: {
      greet: ['هلا هلا، بسرعة.', 'أيوه؟ تفضل بسرعة.'],
      introduced: ['أوكي {company}، الزبدة؟', '{company}؟ طيب وش المطلوب؟'],
      explain_ok: ['فهمت، يلا الخطوة الجاية.', 'أوكي، كمل كمل.'],
      ask_why: ['ليش؟ بسرعة قل.', 'ليش أحتاج هذا؟'],
      refuse: ['لا ما عندي وقت لهذا.', 'مو الحين، أنا مستعجلة.', 'لا، ارسلها رسالة بعدين.'],
      accept: ['أوكي يلا، سويتها.', 'تمام، بسرعة بس.'],
      reveal_code: ['الرمز {code}، يلا.', '{code}. خلاص؟'],
      reveal_amount: ['أوكي {amount}، يلا نخلص.'],
      reveal_address: ['{addr}، بسرعة.'],
      small_talk: ['ما عندي وقت.', 'خلنا بالمهم.'],
      reassured: ['أوكي أوكي.', 'زين.'],
      pressure: ['أنا أصلاً مستعجلة، لا تزيدها.', 'لا تضغطني.'],
      joke: ['هههه، يلا كمل.', 'حلوة، بس يلا.'],
      waiting: ['ألو؟ أنت معي؟', 'يلا؟'],
      access_granted: ['فتحته، يلا.'],
      tool_progress: ['خلصت؟', 'كم باقي؟']
    },
    chatty: {
      greet: ['يا هلا والله! وش أخبارك؟ عساك طيب؟', 'هلا هلا، والله إنك جيت بوقتك.'],
      introduced: ['{company}! والله ذكرتني بولد خالتي، يشتغل بشي يشبهها. المهم كمل.', 'أوه {company}، حلو حلو. وش عندك؟'],
      explain_ok: ['آه فهمت فهمت، ياخي حتى أنا كنت حاس.', 'يعني كذا السالفة؟ طيب طيب.'],
      ask_why: ['وليش يا شيخ؟ قل لي القصة كاملة.', 'وش السبب؟ أحب أفهم.'],
      refuse: ['لا والله، خلنا نتكلم شوي قبل.', 'أممم لا، مو مرتاح لهالخطوة.', 'لا يا ولدي، اصبر علي.'],
      accept: ['أبشر، ولا يهمك، سويتها.', 'تم، عشان خاطرك.'],
      reveal_code: ['اسمع الرمز: {code}. حلو صح؟', 'مكتوب عندي {code}، تبيني أعيده؟'],
      reveal_amount: ['خلاص موافق على {amount}، عشانك بس.'],
      reveal_address: ['عنواني {addr}، تعرف الحارة؟ جنب البقالة.'],
      small_talk: ['والله؟ أنا بعد! تدري وش صار معي أمس؟', 'هههه إيه والله، الدنيا كذا.'],
      reassured: ['الله يطمنك. ارتحت والله.', 'زين إنك قلت كذا.'],
      pressure: ['شوي شوي علي، وش فيك مستعجل؟', 'لا تضغطني يا ولدي.'],
      joke: ['هههههه والله إنك فلة!', 'ههههه ذكرتني بنكتة، بس خلها بعدين.'],
      waiting: ['ألو؟ لا تكون رحت؟', 'إيه إيه أسمعك.'],
      access_granted: ['فتحت البرنامج، شكله حلو بالمناسبة.'],
      tool_progress: ['وش تسوي الحين؟ قل لي.', 'باقي كثير؟']
    },
    sweet: {
      greet: ['وعليكم السلام، هلا فيك.', 'هلا والله، تفضل.'],
      introduced: ['أهلين، {company}. تفضل.', 'هلا والله {company}، وش أقدر أسوي لك؟'],
      explain_ok: ['آه فهمت، الله يجزاك خير.', 'زين إنك وضحت.'],
      ask_why: ['ممكن تقول لي ليش؟ بس عشان أفهم.', 'وش فايدة هالخطوة؟'],
      refuse: ['معليش، خلني أفهم أكثر قبل.', 'ما أدري، مو مرتاحة لها.', 'لا يا وليدي، مو الحين.'],
      accept: ['أبشر، سويتها.', 'تم، الله يسعدك.'],
      reveal_code: ['الرمز {code}، الله يحفظك.', 'مكتوب {code}.'],
      reveal_amount: ['موافقة على {amount}.'],
      reveal_address: ['عنواني {addr}.'],
      small_talk: ['الله يسعدك، الحمد لله بخير.', 'هههه ما شاء الله عليك.'],
      reassured: ['الله يطمنك. ارتحت.', 'زين، كذا أحسن.'],
      pressure: ['شوي شوي، الله يرضى عليك.', 'لا تستعجل علي.'],
      joke: ['هههههه الله يسعدك.', 'ههههه يا شين المزح!'],
      waiting: ['ألو؟ معي؟', 'أسمعك.'],
      access_granted: ['فتحته يا وليدي.'],
      tool_progress: ['خلصت؟ الله يعطيك العافية.', 'باقي شي؟']
    },
    casual: {
      greet: ['هلا والله، تفضل.', 'هلا، وش عندك؟'],
      introduced: ['أوكي {company}، تمام. وش السالفة؟', '{company}؟ حلو، كمل.'],
      explain_ok: ['آها، فهمت.', 'زين، واضح.'],
      ask_why: ['ليش؟ وش الفايدة؟', 'طيب ليش كذا؟'],
      refuse: ['لا، مو مقتنع للحين.', 'ما أدري، ما ارتحت.', 'لا لا، خلنا نشوف شي ثاني.'],
      accept: ['أوكي، سويتها.', 'تمام، تم.'],
      reveal_code: ['الرمز {code}.', 'مكتوب {code}، تمام؟'],
      reveal_amount: ['أوكي موافق على {amount}.'],
      reveal_address: ['عنواني {addr}.'],
      small_talk: ['ههه إيه والله.', 'تمام الحمد لله، وأنت؟'],
      reassured: ['زين، ارتحت شوي.', 'أوكي، تمام.'],
      pressure: ['ليش مستعجل؟', 'لا تضغطني.'],
      joke: ['ههههه حلوة.', 'هههه وش ذا؟'],
      waiting: ['ألو؟', 'معك.'],
      access_granted: ['فتحته.'],
      tool_progress: ['وش صار؟', 'خلصت؟']
    },
    formal: {
      greet: ['أهلاً وسهلاً.', 'مرحباً، تفضل.'],
      introduced: ['تمام، {company}. ممكن توضح سبب الاتصال؟', 'سجلت اسم {company}. تفضل.'],
      explain_ok: ['واضح. الخطوة التالية؟', 'مفهوم، شكراً للتوضيح.'],
      ask_why: ['ممكن توضح سبب هالخطوة؟', 'وش الهدف منها بالضبط؟'],
      refuse: ['لا أقدر قبل ما تتضح الصورة.', 'أعتذر، ما يناسبني الحين.', 'ما أوافق على شي ما انشرح.'],
      accept: ['تمام، تم التنفيذ.', 'موافقة، نفذت الخطوة.'],
      reveal_code: ['الرمز: {code}. أعيده؟ {code}.', 'الرمز المعروض {code}.'],
      reveal_amount: ['موافقة على مبلغ {amount} بالضبط.'],
      reveal_address: ['العنوان: {addr}.'],
      small_talk: ['خلنا بالموضوع لو سمحت.', 'شكراً، نكمل؟'],
      reassured: ['تمام، مفهوم.', 'شكراً للطمأنة.'],
      pressure: ['ما يحتاج استعجال.', 'الاستعجال ما يخدمك.'],
      joke: ['ظريف. نكمل.', 'هه، طيب.'],
      waiting: ['أنا معك.', 'تفضل.'],
      access_granted: ['تم فتح البرنامج.'],
      tool_progress: ['وين وصلت؟', 'تم؟']
    },
    techy: {
      greet: ['هلا. تفضل.', 'أيوه، معك.'],
      introduced: ['{company}؟ طيب، وش نظامكم؟', 'أوكي {company}. وضح تقنياً.'],
      explain_ok: ['منطقي، كمل.', 'أوكي، الكلام ماشي.'],
      ask_why: ['وش البروتوكول؟ ليش هالخطوة؟', 'طيب وش يصير لو ما سويت؟'],
      refuse: ['لا، هذا مو منطقي تقنياً.', 'ما راح أفتح شي قبل ما أفهم.', 'لا، فيه شي مو راكب.'],
      accept: ['أوكي، فتحتها.', 'تمام، نفذت.'],
      reveal_code: ['الرمز {code}.', 'القيمة {code}.'],
      reveal_amount: ['موافق على {amount}.'],
      reveal_address: ['{addr}.'],
      small_talk: ['خلنا بالشغل.', 'أوكي، نكمل؟'],
      reassured: ['أوكي، مقبول.', 'تمام.'],
      pressure: ['الضغط هذا علامة سيئة.', 'لا تستعجل، أنا أحلل.'],
      joke: ['هه، كمل.', 'أوكي.'],
      waiting: ['أنا هنا.', 'كمل.'],
      access_granted: ['أعطيتك صلاحية مؤقتة.'],
      tool_progress: ['وش اللوق يقول؟', 'خلصت؟']
    }
  };

  /* ---------- بريد اليوم (قوالب ثابتة) ---------- */
  var MAIL_FILLERS = [
    { from: 'الأستاذ مشعل', subject: 'تذكير: الهدف مو اقتراح', body: 'الهدف المكتوب باللوحة هدف. مو أمنية. تحياتي.' },
    { from: 'قسم الموارد البشرية', subject: 'آلة القهوة', body: 'نرجو عدم كتابة أسمائكم على أكواب الآخرين. شكراً.' },
    { from: 'قسم التقنية', subject: 'لا تفتح ملفات غريبة', body: 'أي ملف يجيك من متصل ما تعرفه، لا تفتحه. حتى لو اسمه «تحديث_سريع».' },
    { from: 'نشرة المكتب', subject: 'موظف الأسبوع', body: 'موظف الأسبوع هو آلة الطابعة لأنها اشتغلت يومين متتالية.' },
    { from: 'الاستقبال', subject: 'رف الاستلام', body: 'أي صندوق لك تلقاه على رف الاستلام عند المدخل.' },
    { from: 'السلامة', subject: 'طفاية الحريق', body: 'طفاية الحريق جنب الطابعة. لا تستخدمها لتبريد القهوة.' }
  ];

  /* ---------- مواقع المتصفح الوهمي ---------- */
  var SITES = [
    { host: 'fixly.game', title: 'فكسلي', body: 'فكسلي للأجهزة المنزلية الذكية. ثلاجاتنا تتكلم أكثر منك. خدمة العملاء: «مساعد فكسلي» يفتحه العميل بنفسه.', tip: 'إصلاح ثلاجات فكسلي: أعد التشغيل، افصل الاقتراحات، حدّث قائمة الأكل، شغّل الوضع الصامت.' },
    { host: 'catcook.game', title: 'قناة طبخ القطط', body: 'القطط تطبخ، وأنت تتفرج. الاشتراك الشهري يتجدد تلقائياً.', tip: 'كل فاتورة لها رقم من ٦ خانات بالبريد.' },
    { host: 'penguin.game', title: 'بطريق كابيتال', body: 'استثمر بالبطاريق على أسطح الرياض. العوائد «باردة». الأسعار تتذبذب كل ثانية.', tip: 'التسوية الصحيحة داخل النطاق المظلل فقط.' },
    { host: 'kabsacoin.game', title: 'كبسة كوين', body: 'عملة مطبوخة على نار هادية. قيمتها مربوطة بسعر الرز (خيالياً).', tip: 'ملفات المحفظة: مفاتيح، سجلات، صور (ليش فيه صور؟).' },
    { host: 'ghayma.game', title: 'سفريات الغيمة', body: 'رحلات لأماكن ما لها وجود. جزيرة الكنافة العائمة متاحة بالشتاء.', tip: 'رقم الحجز ٧ خانات ويبدأ بصفر أحياناً.' },
    { host: 'shaffat.game', title: 'شفّاط', body: 'مكنسة تشفط الأفكار السلبية من السجاد. عرض الثلاث قطع: الثالثة مجاناً (تقريباً).', tip: 'الأسئلة الشائعة: لا، ما تشفط الديون.' },
    { host: 'sofaclub.game', title: 'نادي الكنب', body: 'العضوية البلاتينية: مخدة زيادة وكوب شاي.', tip: 'رمز العضوية ٦ خانات.' },
    { host: 'ehsmaha-office.game', title: 'بوابة الموظفين', body: 'مرحباً بك بمركز احسمها للاتصالات (الخيالي). تعليمات: لا تفتح الملفات الغريبة، واستخدم فاحص الفيروسات.', tip: 'نقطة التجمع عند المدخل.' }
  ];

  return {
    CONTENT_VERSION: CONTENT_VERSION, CURRENCY: CURRENCY, INTENTS: INTENTS, PERSONAS: PERSONAS, TOOLS: TOOLS,
    SCENARIOS: SCENARIOS, DAYS: DAYS, dayConfig: dayConfig, RANKS: RANKS, rankFor: rankFor, APPS: APPS,
    UPGRADES: UPGRADES, EVENTS: EVENTS, ACHIEVEMENTS: ACHIEVEMENTS, MANAGER: MANAGER, STRINGS: STRINGS,
    LINES: LINES, MAIL_FILLERS: MAIL_FILLERS, SITES: SITES, METHODS: METHODS, SURNAMES: SURNAMES, ITEMS: ITEMS, CLAUSES: CLAUSES,
    TRUST_BANDS: [{ min: 80, label: 'واثق' }, { min: 60, label: 'بدأ يثق' }, { min: 40, label: 'يسمع لك' }, { min: 20, label: 'متردد' }, { min: 0, label: 'شاك فيك' }]
  };
});

