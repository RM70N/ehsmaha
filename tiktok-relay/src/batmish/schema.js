'use strict';
// BATMISH — كتالوج الإعدادات القابلة للتخصيص. كل حقل هنا مرتبط فعلياً بكود اللعبة في index.html عبر
// modGetSetting(tag, key, default) (تُقرأ عند بداية كل راوند → تُطبَّق من الراوند التالي).
// الاختبار test/batmish.test.js يقارن هذا الكتالوج بـMOD_SETTINGS_SCHEMA في index.html حتى لا ينفصلا.
export const STREAMER_ID = '_zvd4';
// الستريمرات المسموح لهم باللوحة (يوزر تيك توك بعد التطبيع). لكل واحد تثبيت حساب مستقل وإعدادات معزولة بحسب uid.
export const STREAMERS = ['_zvd4'];
// حسابات احسمها (اسم المستخدم بالموقع) المسموح لها باللوحة بمجرد الدخول بحسابها — بدون ربط بث. الخادم يتحقق أن uid التوكن = uid هذا الحساب.
export const SITE_USERS = ['mish'];
export const CATEGORIES = ['round', 'players', 'difficulty', 'scoring', 'interaction', 'balance', 'audiovisual', 'advanced'];
export const TABS = ['GENERAL', 'GAMEPLAY', 'PLAYERS', 'DIFFICULTY', 'SCORING', 'ADVANCED'];
export const SITE_TAG = '__site';

export const GAMES = {
 "bomb": {
  "name": "القنبلة المتحركة",
  "desc": "القنبلة تنتقل بين اللاعبين، ومن تنفجر عنده يخرج.",
  "fields": [
   {
    "key": "times",
    "type": "numberArray",
    "label": "مدة العد لكل تمريرة (بالثواني)",
    "hint": "من الأولى إلى السادسة — كل قيمة أقل أو تساوي اللي قبلها عادة",
    "length": 6,
    "default": [
     15,
     12,
     10,
     7,
     5,
     4
    ],
    "min": 1,
    "max": 60,
    "cat": "round",
    "tab": "GENERAL",
    "monotonic": "desc"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "sniper": {
  "name": "القناص",
  "desc": "شبكة أهداف يختار فيها الجمهور خانات، والذخيرة تحدد قوة الإقصاء.",
  "fields": [
   {
    "key": "gridSize",
    "type": "number",
    "label": "عدد المربعات في الشبكة",
    "hint": "الحالي: 50",
    "default": 50,
    "min": 1,
    "max": 100,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "cellCapacity",
    "type": "number",
    "label": "عدد اللاعبين المسموح بنفس المربع",
    "hint": "الحالي: 2",
    "default": 2,
    "min": 1,
    "max": 50,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "ammoSniper",
    "type": "number",
    "label": "عدد طلقات القناص",
    "hint": "الحالي: 25",
    "default": 25,
    "min": 1,
    "max": 99,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "ammoBomb",
    "type": "number",
    "label": "عدد استخدامات القنبلة",
    "hint": "الحالي: 6 — تضرب 4 مربعات متجاورة",
    "default": 6,
    "min": 0,
    "max": 30,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "ammoNuke",
    "type": "number",
    "label": "عدد استخدامات النووية",
    "hint": "الحالي: 4 — تضرب 6 مربعات",
    "default": 4,
    "min": 0,
    "max": 30,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "shieldEnabled",
    "type": "toggle",
    "label": "تفعيل الدرع الواقي",
    "hint": "3 مربعات عشوائية فيها درع — يمتص ضربة واحدة فقط لمن يختبئ فيها",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "goldenZoneEnabled",
    "type": "toggle",
    "label": "تفعيل منطقة الانفجار الذهبية",
    "hint": "منطقة عشوائية — القضاء عليها من فيها يمنحه نقاط/مفاجأة إضافية",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "hz": {
  "name": "ضربة الحظ",
  "desc": "ضربة حظ على شبكة خانات، ومن يفتح خانة مفخخة يخرج.",
  "fields": [
   {
    "key": "gridSize",
    "type": "number",
    "label": "عدد صناديق الحظ في الشبكة",
    "hint": "الحالي: 60",
    "default": 60,
    "min": 1,
    "max": 100,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "maxClicks",
    "type": "number",
    "label": "عدد الضغطات المسموحة للستريمر",
    "hint": "الحالي: 15 — بعد ما تخلص كل الباقين ناجين وفايزين!",
    "default": 15,
    "min": 1,
    "max": 100,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "crownsteal": {
  "name": "سرقة التاج",
  "desc": "تاج واحد يُسرق من حامله، ومن يحتفظ به المدة المطلوبة يفوز.",
  "fields": [
   {
    "key": "holdDuration",
    "type": "number",
    "label": "مدة حمل التاج للفوز (بالثواني)",
    "hint": "الحالي: 5",
    "default": 5,
    "min": 2,
    "max": 30,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "maxStealAttempts",
    "type": "number",
    "label": "عدد محاولات السرقة لكل لاعب",
    "hint": "الحالي: 2",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "immunityEnabled",
    "type": "toggle",
    "label": "تفعيل الحماية المؤقتة",
    "hint": "فرصة عشوائية لحامل التاج تمنع السرقة لمدة قصيرة",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "speedupEnabled",
    "type": "toggle",
    "label": "تفعيل تسارع السرقة",
    "hint": "كل ما انسرق التاج أكثر، مدة الحمل المطلوبة للفوز تقل قليلاً (يزيد التوتر)",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   }
  ]
 },
 "lastletter": {
  "name": "آخر حرف",
  "desc": "كل لاعب يجاوب بكلمة تبدأ بآخر حرف من الكلمة السابقة قبل نهاية دوره.",
  "fields": [
   {
    "key": "turnSeconds",
    "type": "number",
    "label": "مدة دور اللاعب (بالثواني)",
    "hint": "الحالي: 10",
    "default": 10,
    "min": 3,
    "max": 60,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "box": {
  "name": "الصندوق العشوائي",
  "desc": "صناديق عشوائية، بعضها يخرج صاحبه وبعضها ينجيه.",
  "fields": [
   {
    "key": "boxCount",
    "type": "number",
    "label": "عدد الصناديق بكل دور",
    "hint": "الحالي: 3 (إقصاءان + حصانة) — تتوزع المحتويات تلقائياً كل ما زاد العدد",
    "default": 3,
    "min": 3,
    "max": 9,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "timeLimit",
    "type": "number",
    "label": "مدة اختيار الصندوق (بالثواني)",
    "hint": "الحالي: 15",
    "default": 15,
    "min": 5,
    "max": 60,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "goldenBoxEnabled",
    "type": "toggle",
    "label": "تفعيل الصندوق الذهبي والصندوق الإقصاء الثنائي",
    "hint": "فرصة 60% كل دور تضيف صندوق ذهبي (جائزة مضاعفة) وصندوق إقصاء ثنائي (يقصي شخصين) بدل صندوقين عاديين",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "doubleImmunityEnabled",
    "type": "toggle",
    "label": "تفعيل ظهور صندوقين حصانة",
    "hint": "فرصة عشوائية كل دور يكون فيه صندوقا حصانة بدل صندوق واحد",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "whoami": {
  "name": "من أنا؟",
  "desc": "تخمين شخصية من تلميحات يكتبها الستريمر.",
  "fields": [
   {
    "key": "maxAttempts",
    "type": "number",
    "label": "عدد المحاولات لكل متابع",
    "hint": "الحالي: 3",
    "default": 3,
    "min": 1,
    "max": 10,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "hintOnFailEnabled",
    "type": "toggle",
    "label": "تفعيل تلميح إضافي بعد محاولة فاشلة",
    "hint": "يحتاج الستريمر يكتب تلميح ثاني عند إنشاء اللعبة",
    "default": false,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "timerEnabled",
    "type": "toggle",
    "label": "تفعيل وقت محدد للراوند",
    "hint": "إذا خلص الوقت بدون إجابة صحيحة، ينتهي الراوند بدون فائز",
    "default": false,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "timerSeconds",
    "type": "number",
    "label": "مدة الراوند (بالثواني) — إذا الوقت مفعّل",
    "hint": "الحالي: 30",
    "default": 30,
    "min": 10,
    "max": 120,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "أول إجابة صحيحة تأخذ نقطتين بلوحة المتصدرين بدل نقطة واحدة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "ig": {
  "name": "خمن الصورة",
  "desc": "تخمين صورة تُكشف تدريجياً.",
  "fields": [
   {
    "key": "timerEnabled",
    "type": "toggle",
    "label": "تفعيل وقت محدد للراوند",
    "hint": "إذا خلص الوقت بدون إجابة صحيحة، ينتهي الراوند بدون فائز وتنكشف الإجابة",
    "default": false,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "timerSeconds",
    "type": "number",
    "label": "مدة الراوند (بالثواني) — إذا الوقت مفعّل",
    "hint": "الحالي: 25",
    "default": 25,
    "min": 8,
    "max": 90,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "أول متابع يخمّن صح يأخذ نقطتين بلوحة المتصدرين بدل نقطة واحدة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "priceguess": {
  "name": "تخمين السعر",
  "desc": "تخمين سعر منتج بأقرب رقم.",
  "fields": [
   {
    "key": "maxAttempts",
    "type": "number",
    "label": "عدد المحاولات لكل متابع",
    "hint": "الحالي: 2",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "doubleWinEnabled",
    "type": "toggle",
    "label": "تفعيل مضاعفة الفوز للإجابة الأولى المضبوطة",
    "hint": "أول متابع يجاوب السعر بالضبط من أول محاولة يأخذ نقطتين بدل نقطة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "harfnajat": {
  "name": "حرف النجاة",
  "desc": "لاعب وفئة وحرف، والإجابة من الشات والستريمر يقبلها أو يرفضها.",
  "fields": [
   {
    "key": "answerSeconds",
    "type": "number",
    "label": "وقت الإجابة لكل لاعب (بالثواني)",
    "hint": "الحالي: 20",
    "default": 20,
    "min": 5,
    "max": 600,
    "cat": "round",
    "tab": "GENERAL"
   }
  ]
 },
 "countrywar": {
  "name": "الدول",
  "desc": "قرعة تختار لاعباً يقصي دولة، والدول المتبقية تقل كل جولة.",
  "fields": [
   {
    "key": "spinMinMs",
    "type": "number",
    "label": "أقل مدة للف الروليت (بالميلي ثانية)",
    "hint": "الحالي: 4000",
    "default": 4000,
    "min": 1000,
    "max": 15000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "spinRandomMs",
    "type": "number",
    "label": "مدة عشوائية إضافية للف (بالميلي ثانية)",
    "hint": "الحالي: 1500",
    "default": 1500,
    "min": 0,
    "max": 10000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "turnSeconds",
    "type": "number",
    "label": "مدة دور اللاعب لاختيار دولة (بالثواني، 0 = بدون وقت)",
    "hint": "الحالي: 15 — إذا انتهى الوقت دون اختيار يروح دوره ويلف الدور على غيره",
    "default": 15,
    "min": 0,
    "max": 3600,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "allianceEnabled",
    "type": "toggle",
    "label": "تفعيل تحالف مؤقت",
    "hint": "فرصة عشوائية تربط دولتين كتحالف — ما يقدر أحد يقصي الثانية طول ما التحالف قائم",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "goldenCountryEnabled",
    "type": "toggle",
    "label": "تفعيل دولة محصّنة ذهبية",
    "hint": "دولة واحدة عشوائية بكل راوند تنجو من أول محاولة إقصاء لها",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "endgameMultiplierEnabled",
    "type": "toggle",
    "label": "تفعيل مضاعفة الخطر بالنهاية",
    "hint": "في آخر 3 دول متبقية، فرصة الإقصاء تزيد (مرتين كل دور)",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "reverseword": {
  "name": "عكس الكلمة",
  "desc": "عكس كلمة تظهر على الشاشة قبل غيرك.",
  "fields": [
   {
    "key": "maxAttempts",
    "type": "number",
    "label": "عدد المحاولات لكل متابع (0 = بدون حد)",
    "hint": "الحالي: بدون حد",
    "default": 0,
    "min": 0,
    "max": 10,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "timerSeconds",
    "type": "number",
    "label": "مدة الراوند (بالثواني، 0 = بدون وقت)",
    "hint": "الحالي: بدون وقت",
    "default": 0,
    "min": 0,
    "max": 120,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "luckyPlayerEnabled",
    "type": "toggle",
    "label": "تفعيل لاعب محظوظ",
    "hint": "لاعب عشوائي يأخذ محاولة إضافية (يحتاج تفعيل حد المحاولات)",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "الفائز يأخذ نقطتين بلوحة المتصدرين بدل نقطة واحدة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "letterscramble": {
  "name": "ترتيب الحروف",
  "desc": "ترتيب حروف مبعثرة لتكوين كلمة.",
  "fields": [
   {
    "key": "minLength",
    "type": "number",
    "label": "أقل عدد حروف مسموح للكلمة",
    "hint": "الحالي: 3",
    "default": 3,
    "min": 2,
    "max": 15,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "maxLength",
    "type": "number",
    "label": "أكثر عدد حروف مسموح للكلمة",
    "hint": "الحالي: 10",
    "default": 10,
    "min": 2,
    "max": 20,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "timerSeconds",
    "type": "number",
    "label": "مدة الراوند (بالثواني، 0 = بدون وقت)",
    "hint": "الحالي: بدون وقت",
    "default": 0,
    "min": 0,
    "max": 120,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "letterHintEnabled",
    "type": "toggle",
    "label": "تفعيل تلميح موضع حرف",
    "hint": "يكشف مكان حرف واحد عشوائي بعد مدة معيّنة",
    "default": false,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "hintAfterSeconds",
    "type": "number",
    "label": "مدة ظهور التلميح (بالثواني) — إذا مفعّل",
    "hint": "الحالي: 10",
    "default": 10,
    "min": 3,
    "max": 60,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "الفائز يأخذ نقطتين بلوحة المتصدرين بدل نقطة واحدة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "roulette": {
  "name": "دائرة الإقصاء",
  "desc": "دائرة تقصي لاعباً في كل دوران حتى يبقى فائز.",
  "fields": [
   {
    "key": "spinMinMs",
    "type": "number",
    "label": "أقل مدة للف الروليت (بالميلي ثانية)",
    "hint": "الحالي: 4000",
    "default": 4000,
    "min": 1000,
    "max": 15000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "spinRandomMs",
    "type": "number",
    "label": "مدة عشوائية إضافية للف (بالميلي ثانية)",
    "hint": "الحالي: 1500",
    "default": 1500,
    "min": 0,
    "max": 10000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "immunityEnabled",
    "type": "toggle",
    "label": "تفعيل حصانة عشوائية",
    "hint": "لاعب عشوائي واحد ينجو من أول محاولة إقصاء له بكل راوند",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "doubleElimEnabled",
    "type": "toggle",
    "label": "تفعيل إقصاء مزدوج",
    "hint": "فرصة عشوائية 30% كل لفة تسمح بإقصاء لاعبين بدل واحد (منشن اثنين)",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "timer": {
  "name": "لعبة التوقيت",
  "desc": "إيقاف مؤقت على رقم هدف بأقرب توقيت.",
  "fields": [
   {
    "key": "maxSeconds",
    "type": "number",
    "label": "أقصى مدة للراوند (بالثواني)",
    "hint": "الحالي: 30",
    "default": 30,
    "min": 5,
    "max": 120,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "goldenZoneEnabled",
    "type": "toggle",
    "label": "تفعيل منطقة ذهبية",
    "hint": "منطقة عشوائية من الوقت (0.3 ثانية) — الوقوف فيها يفوز فوراً بغض النظر عن القرب من الوقت السري",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "الفائز (الأقرب للوقت السري أو المنطقة الذهبية) يأخذ نقطتين دائماً",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "main": {
  "name": "اوجد الكلمة",
  "desc": "إيجاد كلمة مخفية بكتابة حروفها في الشات.",
  "fields": [
   {
    "key": "minLength",
    "type": "number",
    "label": "أقل عدد حروف مسموح للكلمة السرية",
    "hint": "الحالي: 2",
    "default": 2,
    "min": 2,
    "max": 15,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "maxLength",
    "type": "number",
    "label": "أكثر عدد حروف مسموح للكلمة السرية",
    "hint": "الحالي: 10",
    "default": 10,
    "min": 2,
    "max": 20,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "timerSeconds",
    "type": "number",
    "label": "مدة الراوند (بالثواني، 0 = بدون وقت)",
    "hint": "الحالي: بدون وقت",
    "default": 0,
    "min": 0,
    "max": 180,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "letterHintEnabled",
    "type": "toggle",
    "label": "تفعيل تلميح موضع حرف",
    "hint": "يكشف مكان حرف واحد عشوائي من الكلمة السرية بعد مدة معيّنة",
    "default": false,
    "cat": "difficulty",
    "tab": "DIFFICULTY"
   },
   {
    "key": "hintAfterSeconds",
    "type": "number",
    "label": "مدة ظهور التلميح (بالثواني) — إذا مفعّل",
    "hint": "الحالي: 15",
    "default": 15,
    "min": 3,
    "max": 90,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "speedBonusEnabled",
    "type": "toggle",
    "label": "تفعيل نقاط مكافأة",
    "hint": "أول متابع يخمّن الكلمة بالضبط من أول محاولة له يأخذ نقطتين بدل نقطة",
    "default": false,
    "cat": "scoring",
    "tab": "SCORING"
   }
  ]
 },
 "chairs": {
  "name": "الكرسي المتحرك",
  "desc": "كراسي أقل من اللاعبين، ومن لا يجلس يخرج.",
  "fields": [
   {
    "key": "spinMinMs",
    "type": "number",
    "unitDivisor": 1000,
    "unitStep": 0.1,
    "label": "أقل مدة لدوران الدائرة (بالثواني)",
    "hint": "كم أقل وقت ممكن تدور فيه الدائرة قبل ما تبدأ تبطئ وتوقف — الحالي: 8",
    "default": 8000,
    "min": 1000,
    "max": 15000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "spinRandomMs",
    "type": "number",
    "unitDivisor": 1000,
    "unitStep": 0.1,
    "label": "مدة عشوائية إضافية للدوران (بالثواني)",
    "hint": "وقت إضافي عشوائي يُضاف فوق الحد الأدنى، عشان كل دورة تحس بمدة مختلفة شوي — الحالي: 3",
    "default": 3000,
    "min": 0,
    "max": 10000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "chairReductionPercent",
    "type": "number",
    "label": "نسبة عدد الكراسي من الجدول الأصلي (%)",
    "hint": "مثلاً 70 = تقليل عدد الكراسي 30% لزيادة الصعوبة (كل جولة كراسيها أقل من العادة). 100 = بدون تغيير — لا يؤثر على الجولة الأخيرة (شخصان، كرسي واحد) ولا ينزل عن كرسي واحد. الحالي: 100",
    "default": 100,
    "min": 10,
    "max": 100,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "immunityEnabled",
    "type": "toggle",
    "label": "تفعيل حصانة عشوائية",
    "hint": "لاعب عشوائي واحد بكل جولة ينجو تلقائياً حتى لو ما أخذ كرسي",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "goldenChairEnabled",
    "type": "toggle",
    "label": "تفعيل الكرسي الذهبي",
    "hint": "فرصة عشوائية كل جولة تخلي أحد الكراسي ذهبي — من يحجزه يفوز بنقطتين بدل نقطة بلوحة المتصدرين",
    "default": false,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   }
  ]
 },
 "findball": {
  "name": "اعثر على الكورة",
  "desc": "تتبع كورة تحت كوب أثناء خلط الأكواب.",
  "fields": [
   {
    "key": "shuffleMinMs",
    "type": "number",
    "unitDivisor": 1000,
    "unitStep": 0.1,
    "label": "أقل مدة خلط الأكواب بالجولة الأولى (بالثواني)",
    "hint": "الحالي: 6 — تقل تلقائياً مع كل جولة جديدة",
    "default": 6000,
    "min": 1500,
    "max": 15000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "shuffleSpeedupPercent",
    "type": "number",
    "label": "نسبة تسريع الخلط كل جولة (%)",
    "hint": "مثلاً 15 = كل جولة جديدة تصير مدة الخلط أسرع بـ15% من اللي قبلها. الحالي: 15",
    "default": 15,
    "min": 0,
    "max": 50,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "shuffleMinFloorMs",
    "type": "number",
    "unitDivisor": 1000,
    "unitStep": 0.1,
    "label": "أقل حد لمدة الخلط مهما زادت الجولات (بالثواني)",
    "hint": "يمنع اللعبة تصير مستحيلة بالجولات المتأخرة — الحالي: 1.8",
    "default": 1800,
    "min": 500,
    "max": 8000,
    "cat": "round",
    "tab": "GENERAL"
   },
   {
    "key": "swapCount",
    "type": "number",
    "label": "عدد مرات تبديل الأكواب بالجولة الأولى",
    "hint": "الحالي: 6 — يزيد قليلاً مع الجولات",
    "default": 6,
    "min": 3,
    "max": 20,
    "cat": "round",
    "tab": "GAMEPLAY"
   },
   {
    "key": "revivalEnabled",
    "type": "toggle",
    "label": "تفعيل إنعاش عبر هدايا تيك توك",
    "hint": "أي متابع مُقصى يرجع للعبة فوراً إذا أرسل أي هدية عملات أثناء البث",
    "default": true,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "revivalMaxUses",
    "type": "number",
    "label": "عدد مرات الانعاش المسموحة لكل شخص بالراوند",
    "hint": "الحالي: 2 — بعدها ما يقدر يرجع بالانعاش لين يبدأ راوند جديد",
    "default": 2,
    "min": 1,
    "max": 10,
    "cat": "players",
    "tab": "PLAYERS"
   },
   {
    "key": "guessTimerEnabled",
    "type": "toggle",
    "label": "تفعيل وقت محدد للتخمين",
    "hint": "إذا خلص الوقت ولم يخمّن المشارك، يُقصى تلقائياً حتى لو كان سيختار صح",
    "default": true,
    "cat": "balance",
    "tab": "ADVANCED"
   },
   {
    "key": "guessTimerSeconds",
    "type": "number",
    "label": "مدة التخمين (بالثواني) — إذا الوقت مفعّل",
    "hint": "الحالي: 10",
    "default": 10,
    "min": 3,
    "max": 60,
    "cat": "balance",
    "tab": "ADVANCED"
   }
  ]
 }
};

GAMES.rlgl = {
  name: 'الإشارة الحمراء والخضراء',
  desc: 'سباق على المسار: تحرّك عند الأخضر وتجمّد عند الأحمر.',
  fields: [
    { key: 'graceMs', type: 'number', label: 'مهلة السماح بعد تغيّر الإشارة (بالملّي ثانية)', hint: 'الحالي: 400 — تحمي اللاعب من الإقصاء لحظة تحوّل الإشارة', default: 400, min: 0, max: 1500, cat: 'difficulty', tab: 'DIFFICULTY' },
    { key: 'rateLimitMs', type: 'number', label: 'أقل فاصل بين خطوتين للاعب (بالملّي ثانية)', hint: 'الحالي: 250 — يمنع الضغط المتتابع السريع جداً', default: 250, min: 50, max: 2000, cat: 'balance', tab: 'ADVANCED' },
  ],
};
GAMES.fastans = {
  name: 'سؤال وجواب سريع',
  desc: 'قنبلة تمرّ بين اللاعبين مع أسئلة سريعة قبل ما تنفجر.',
  fields: [
    { key: 'minSeconds', type: 'number', label: 'أقل مدة عدّاد القنبلة (بالثواني)', hint: 'الحالي: 15', default: 15, min: 5, max: 60, cat: 'round', tab: 'GENERAL' },
    { key: 'maxSeconds', type: 'number', label: 'أكثر مدة عدّاد القنبلة (بالثواني)', hint: 'الحالي: 45 — تُطبَّق إذا كانت أكبر من الأقل', default: 45, min: 5, max: 120, cat: 'round', tab: 'GENERAL' },
    { key: 'winScore', type: 'number', label: 'نقاط الفوز', hint: 'الحالي: 5 — أول لاعب يوصلها يفوز', default: 5, min: 1, max: 20, cat: 'scoring', tab: 'SCORING' },
  ],
};
GAMES.tt10 = {
  name: 'توب 10',
  desc: 'جولات أسئلة «اذكر أفضل ١٠» تُحسب نقاطها بين المشاركين.',
  fields: [
    { key: 'totalRounds', type: 'number', label: 'عدد الجولات', hint: 'الحالي: 3 — تُطبَّق عند بدء لعبة جديدة', default: 3, min: 1, max: 10, cat: 'round', tab: 'GENERAL' },
  ],
};

// إعدادات الموقع نفسه (صوت/مؤثرات) — تُطبَّق مركزياً من batmish-core.js على كل ألعاب الصفحة الرئيسية
// التي تستخدم WebAudio (لا تشمل ألعاب 3D داخل iframe لأن لها سياق صوت مستقل).
GAMES[SITE_TAG] = {
  name: 'الصوت والمؤثرات',
  desc: 'تحكم مركزي بصوت المؤثرات وكثافة الحركة البصرية في ألعاب الصفحة الرئيسية.',
  fields: [
    { key: 'masterVolume', type: 'number', label: 'مستوى صوت المؤثرات', hint: 'الافتراضي 100، يطبّق على أصوات WebAudio في ألعاب الصفحة', default: 100, min: 0, max: 100, cat: 'audiovisual', tab: 'GENERAL', unit: '%' },
    { key: 'muteEffects', type: 'toggle', label: 'كتم مؤثرات الألعاب', hint: 'يكتم كل أصوات المؤثرات (لا يلمس صوت البث ولا أصوات الفيديو)', default: false, cat: 'audiovisual', tab: 'GENERAL' },
    { key: 'reduceEffects', type: 'toggle', label: 'تخفيف المؤثرات البصرية', hint: 'يوقف الانتقالات والحركات الزخرفية في الصفحة (مناسب للأجهزة الضعيفة)', default: false, cat: 'audiovisual', tab: 'GENERAL' },
  ],
};
