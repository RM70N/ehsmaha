/* BATMISH UI — تصميم «Gotham Noir» (منسوخ من النموذج المعتمد) موصول بالخادم الحقيقي عبر B.controller.request.
   يُحمَّل فقط بعد موافقة الخادم على الوصول. لا كتالوج ثابت هنا: الإعدادات والقيم الافتراضية من /batmish/bootstrap. */
(function () {
'use strict';
const B = window.Batmish;
if (!B || B.ui) return;
const STREAMER = B.STREAMER;
let GAMES = {};
const CATEGORIES = ['round', 'players', 'difficulty', 'scoring', 'interaction', 'balance', 'audiovisual', 'advanced'];
const TABS = ['GENERAL', 'GAMEPLAY', 'PLAYERS', 'DIFFICULTY', 'SCORING', 'ADVANCED']; /* مفاتيح داخلية فقط؛ تُعرض بالعربية عبر TAB_AR */
const TAB_AR = { GENERAL: 'عام', GAMEPLAY: 'اللعب', PLAYERS: 'اللاعبون', DIFFICULTY: 'الصعوبة', SCORING: 'النقاط', ADVANCED: 'متقدم' };
const CAT_INFO = {
  round: ['', 'توقيت الجولة'], players: ['', 'قواعد اللاعبين'], difficulty: ['', 'الصعوبة'],
  scoring: ['', 'النقاط'], balance: ['', 'الموازنة'], interaction: ['', 'التفاعل'], audiovisual: ['', 'الصوت والمرئيات'], advanced: ['', 'متقدم']
};
const AUTO_RE = /^(timerEnabled|turnSeconds|answerSeconds|timerSeconds|timeLimit|maxSeconds|hintAfterSeconds|holdDuration|revival.*|speedupEnabled|chairReductionPercent|shuffleSpeedupPercent)$/;

/* ---------- تصنيف الألعاب (يحدد شخصية البطاقة) ---------- */
const ARCH = {
  guess: { en: 'تخمين', ar: 'تخمين' }, word: { en: 'كلمات', ar: 'كلمات' }, speed: { en: 'سرعة', ar: 'سرعة' },
  elim: { en: 'إقصاء', ar: 'إقصاء' }, luck: { en: 'حظ', ar: 'حظ' }, info: { en: 'معلومات', ar: 'معلومات' }
};
const ARCH_OF = { bomb: 'elim', sniper: 'elim', chairs: 'elim', hz: 'luck', box: 'luck', roulette: 'luck', whoami: 'guess', ig: 'guess', findball: 'guess',
  lastletter: 'word', harfnajat: 'word', letterscramble: 'word', main: 'word', timer: 'speed', crownsteal: 'speed', reverseword: 'speed', priceguess: 'info', countrywar: 'info', __site: 'info' };

/* ---------- أيقونات النظام (SVG مخصص، نفس الشبكة 24 ونفس السماكة) ---------- */
const BAT_PATH = 'M100 31 L103 23 L108 9 L112 25 C120 24 126 28 132 26 C150 12 178 14 194 30 C186 32 180 38 178 49 C172 43 164 43 160 53 C154 47 146 49 142 61 C136 55 126 55 118 67 C114 73 110 81 100 95 C90 81 86 73 82 67 C74 55 64 55 58 61 C54 49 46 47 40 53 C36 43 28 43 22 49 C20 38 14 32 6 30 C22 14 50 12 68 26 C74 28 80 24 88 25 L92 9 L97 23 Z';
const BAT_SVG = '<svg viewBox="0 0 200 100" aria-hidden="true" focusable="false"><path d="' + BAT_PATH + '"/></svg>';
const ICONS = {
  cmd: '<path d="M12 3.2l7.8 4.4v8.8L12 20.8l-7.8-4.4V7.6z"/><path d="M12 9.4l1 .9 1.9-1.4-.4 2.6 1.6.7-1.9.7L12 15l-2.2-2.4-1.9-.7 1.6-.7-.4-2.6 1.9 1.4z" fill="currentColor" stroke="none"/>',
  db: '<path d="M4 7.5L12 3l8 4.5v9L12 21l-8-4.5z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  settings: '<path d="M5 4v16M12 4v16M19 4v16"/><path d="M3 9h4v3H3zM10 13h4v3h-4zM17 7h4v3h-4z" fill="currentColor" fill-opacity=".25"/>',
  round: '<circle cx="12" cy="12.5" r="7.5"/><path d="M12 12.5l3.6-3.6M9.5 3h5M12 3v2.2M12 17.6v1.4M6.4 12.5H5M19 12.5h-1.4"/>',
  players: '<circle cx="12" cy="8" r="3.1"/><path d="M6.2 19.5c.5-3.6 2.8-5.4 5.8-5.4s5.3 1.8 5.8 5.4"/><circle cx="5.2" cy="10" r="2"/><circle cx="18.8" cy="10" r="2"/><path d="M2.2 17.5c.2-2 1.2-3.2 3-3.5M21.8 17.5c-.2-2-1.2-3.2-3-3.5"/>',
  stream: '<circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M8.2 8.2a5.4 5.4 0 0 0 0 7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 5.4a9.4 9.4 0 0 0 0 13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2"/>',
  balance: '<path d="M12 4v16M7.5 20h9M4.5 7.5h15"/><path d="M4.5 7.5L2.2 13.5a2.9 2.9 0 0 0 4.6 0zM19.5 7.5l-2.3 6a2.9 2.9 0 0 0 4.6 0z"/>',
  av: '<path d="M3.5 10v4M7.5 7v10M11.5 4v16M15.5 8v8M19.5 10.5v3"/>',
  auto: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M13 7.5L9 12.7h3L11 16.5l4-5.2h-3z" fill="currentColor" stroke="none"/>',
  presets: '<path d="M5 3.5h10l4 4V20.5H5z"/><path d="M14.5 3.5v4.5H19M8.5 12h7M8.5 15.5h7M8.5 8.5h3"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.6-5.9"/><path d="M4 3.8v4.4h4.4"/><path d="M12 7.6V12l3 1.9"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', check: '<path d="M4.5 12.5l5 5L19.5 7"/>', reset: '<path d="M4 12a8 8 0 1 1 2.5 5.8"/><path d="M4 18.5V13h5.5"/>',
  copy: '<rect x="8" y="8" width="11.5" height="12"/><path d="M5 16V4h10.5"/>', trash: '<path d="M4.5 7h15M9 7V4h6v3M6.5 7l1 13h9l1-13M10.2 10.5v6M13.8 10.5v6"/>',
  star: '<path d="M12 3.5l2.5 5.3 5.7.8-4.2 4 1 5.7L12 16.5l-5 2.8 1-5.7-4.2-4 5.7-.8z"/>', save: '<path d="M4.5 4h11.5l3.5 3.5V20h-15z"/><path d="M8 4v5h7V4M8 20v-6.5h8V20"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>', back: '<path d="M9 5l7 7-7 7"/>', warn: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v5M12 17.2v.6"/>', edit: '<path d="M4 20h4.2L19.5 8.7l-4.2-4.2L4 15.8z"/><path d="M13 6.8l4.2 4.2"/>',
  play: '<path d="M7 4.5l12 7.5-12 7.5z"/>', search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>', grid: '<rect x="4" y="4" width="6.5" height="6.5"/><rect x="13.5" y="4" width="6.5" height="6.5"/><rect x="4" y="13.5" width="6.5" height="6.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/><path d="M4 6h1.5M4 12h1.5M4 18h1.5" stroke-width="3"/>', dense: '<rect x="4" y="4" width="4" height="4"/><rect x="10" y="4" width="4" height="4"/><rect x="16" y="4" width="4" height="4"/><rect x="4" y="10" width="4" height="4"/><rect x="10" y="10" width="4" height="4"/><rect x="16" y="10" width="4" height="4"/><rect x="4" y="16" width="4" height="4"/><rect x="10" y="16" width="4" height="4"/><rect x="16" y="16" width="4" height="4"/>',
  minus: '<path d="M6 12h12"/>', plus: '<path d="M6 12h12M12 6v12"/>', chev: '<path d="M6 9l6 6 6-6"/>', info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.6"/>',
  more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>', shield: '<path d="M12 3l7.5 3v6c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9V6z"/>',
  gift: '<rect x="4" y="9" width="16" height="11"/><path d="M3 9h18M12 9v11M12 9c-3 0-4.5-1-4.5-2.5S9 4 12 9c3-5 4.5-3.5 4.5-2S15 9 12 9z"/>', skull: '<path d="M5 11a7 7 0 0 1 14 0v4l-2 1v3.5h-3V17h-4v2.5H7V16l-2-1z"/><circle cx="9.3" cy="11.5" r="1.4"/><circle cx="14.7" cy="11.5" r="1.4"/>',
  heart: '<path d="M12 20S4 14.8 4 9.2A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 8 1.8C20 14.8 12 20 12 20z"/>'
};
function ic(n, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (ICONS[n] || '') + '</svg>'; }
/* رموز الألعاب */
const GLYPH = {
  bomb: '<circle cx="10.5" cy="14.5" r="6.5"/><path d="M15 9.6c1.4-2.2 3-2.8 4.6-2.2"/><path d="M20.4 3.2v2.2M22.6 5.6h-2.2M21.8 3.9l-1.4 1.5M19 3.9l1.4 1.5"/><path d="M7 14.2a3.6 3.6 0 0 1 2.4-2.6"/>',
  sniper: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v6M12 15.5v6M2.5 12h6M15.5 12h6"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  hz: '<rect x="4" y="4" width="16" height="16"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/>',
  crownsteal: '<path d="M3.5 19h17M4.5 19L3.5 8.5l5 4 3.5-6.5 3.5 6.5 5-4-1 10.5z"/>',
  lastletter: '<rect x="3.5" y="4.5" width="9" height="9"/><rect x="11.5" y="10.5" width="9" height="9"/><path d="M6.5 9h3M14.5 15h3"/>',
  box: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12L4 7.5M12 12v9"/>',
  whoami: '<circle cx="12" cy="7.5" r="3.4"/><path d="M5 20.5c.7-4 3.5-6.2 7-6.2s6.3 2.2 7 6.2"/><path d="M10.8 6.2c.1-1.3 2.4-1.3 2.4 0 0 1-1.2 1.1-1.2 2"/>',
  ig: '<rect x="3.5" y="5" width="17" height="14"/><circle cx="9" cy="10.5" r="1.8"/><path d="M3.5 17l5-4.5 4 3.5 3-2.5 5 4"/>',
  priceguess: '<path d="M3.5 12.5l8.5-8.5H20v8l-8.5 8.5z"/><circle cx="16" cy="8" r="1.4"/>',
  harfnajat: '<path d="M12 3l7.5 3v6c0 4.6-3.2 7.8-7.5 9-4.3-1.2-7.5-4.4-7.5-9V6z"/><path d="M9.3 15.5L12 8l2.7 7.5M10.2 13h3.6"/>',
  countrywar: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3.2 2.6 3.2 14.4 0 17M12 3.5c-3.2 2.6-3.2 14.4 0 17"/>',
  reverseword: '<path d="M4 8h14.5l-3.2-3.2M20 16H5.5l3.2 3.2"/>',
  letterscramble: '<rect x="3.5" y="4" width="7" height="7"/><rect x="13.5" y="7" width="7" height="7" transform="rotate(10 17 10.5)"/><rect x="5.5" y="14" width="7" height="7" transform="rotate(-8 9 17.5)"/>',
  roulette: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 3.5v6.3M12 14.2v6.3M3.5 12h6.3M14.2 12h6.3M6 6l4.4 4.4M13.6 13.6L18 18M18 6l-4.4 4.4M10.4 13.6L6 18"/>',
  timer: '<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V9M9.5 3h5M12 3v3.5M18.5 6.5L20 5"/>',
  main: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5M7.8 10.5h5.4"/>',
  chairs: '<path d="M7 3.5h10l-1.2 8.5H8.2zM8 12v8M16 12v8M6.5 16h11"/>',
  findball: '<path d="M4.5 6h10l-1.7 12H6.2z"/><circle cx="19" cy="16.5" r="2.2"/><path d="M7 10h5"/>',
  __site: '<path d="M3.5 10v4M7.5 7v10M11.5 4v16M15.5 8v8M19.5 10.5v3"/>'
};
function glyph(tag) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (GLYPH[tag] || GLYPH.main) + '</svg>'; }

/* ---------- رسوم خلفية البطاقات (حسب الفئة) ---------- */
const ART = {
  guess: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"><circle cx="170" cy="120" r="28"/><circle cx="170" cy="120" r="58"/><circle cx="170" cy="120" r="90"/><circle cx="170" cy="120" r="124" stroke-dasharray="3 8"/><path d="M170 0v250M45 120h255M146 96l48 48M194 96l-48 48" opacity=".6"/><path d="M118 60a80 80 0 0 1 104 0" stroke-width="3" opacity=".7"/></svg>',
  word: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"><rect x="110" y="30" width="86" height="86"/><rect x="150" y="70" width="86" height="86" transform="rotate(8 193 113)"/><rect x="90" y="96" width="86" height="86" transform="rotate(-6 133 139)"/><g fill="currentColor" stroke="none" font-family="IBM Plex Sans Arabic,Tajawal,serif" font-size="50" opacity=".55"><text x="125" y="92">ح</text><text x="172" y="140">A</text><text x="108" y="162">ب</text></g></svg>',
  speed: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"><path d="M30 50h170M90 80h210M10 110h150M120 140h170M60 170h140M150 200h150M20 230h120" opacity=".55"/><path d="M0 270h300" stroke-width="1"/><path d="M10 262v8M40 258v12M70 262v8M100 258v12M130 262v8M160 258v12M190 262v8M220 258v12M250 262v8M280 258v12" stroke-width="1"/><circle cx="200" cy="120" r="46" stroke-dasharray="2 6"/><path d="M200 120V84M200 120l24 14" stroke-width="2"/></svg>',
  elim: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"><path d="M170 20l130 224H40z" stroke-dasharray="7 6"/><path d="M170 78l82 142H88z" opacity=".8"/><path d="M170 130v46M170 196v6" stroke-width="5" opacity=".9"/><path d="M60 40l30 30M90 40L60 70" opacity=".5"/></svg>',
  luck: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"><circle cx="170" cy="130" r="30"/><circle cx="170" cy="130" r="66" stroke-dasharray="2 7"/><circle cx="170" cy="130" r="104"/><circle cx="170" cy="130" r="140" stroke-dasharray="8 10" opacity=".6"/><g fill="currentColor" stroke="none"><circle cx="170" cy="64" r="5"/><circle cx="270" cy="130" r="4"/><circle cx="96" cy="182" r="5"/><circle cx="226" cy="222" r="3.5"/><circle cx="104" cy="52" r="3"/></g></svg>',
  info: '<svg viewBox="0 0 300 300" fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"><rect x="70" y="30" width="150" height="40"/><rect x="70" y="84" width="104" height="40"/><rect x="188" y="84" width="76" height="40"/><rect x="70" y="138" width="190" height="40"/><g fill="currentColor" stroke="none" opacity=".55"><rect x="80" y="44" width="70" height="4"/><rect x="80" y="54" width="40" height="4"/><rect x="80" y="98" width="50" height="4"/><rect x="198" y="98" width="30" height="4"/><rect x="80" y="152" width="110" height="4"/><rect x="80" y="162" width="64" height="4"/></g><path d="M70 200h190M70 214h130M70 228h160" opacity=".5"/></svg>'
};
/* رسوم بطاقات الوصول السريع */
const QART = {
  db: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.3)"><path d="M220 0v200M280 0v200M340 0v200M400 0v200M160 40h240M160 100h240M160 160h240"/><g fill="rgba(143,180,230,.7)" stroke="none"><circle cx="280" cy="100" r="4"/><circle cx="340" cy="40" r="4"/><circle cx="220" cy="160" r="4"/></g><rect x="260" y="80" width="40" height="40" stroke="rgba(143,180,230,.7)"/></svg>',
  settings: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.3)"><path d="M250 20v160M310 20v160M370 20v160"/><rect x="238" y="60" width="24" height="16" fill="rgba(143,180,230,.5)"/><rect x="298" y="110" width="24" height="16" fill="rgba(143,180,230,.5)"/><rect x="358" y="80" width="24" height="16" fill="rgba(143,180,230,.5)"/></svg>',
  round: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.3)"><circle cx="330" cy="100" r="70"/><circle cx="330" cy="100" r="46" stroke-dasharray="3 6"/><path d="M330 100V50M330 100l34 20" stroke="rgba(143,180,230,.8)" stroke-width="2"/><path d="M330 22v10M330 168v10M252 100h10M398 100h-10"/></svg>',
  players: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="rgba(143,180,230,.25)" stroke="rgba(143,180,230,.4)"><circle cx="270" cy="70" r="14"/><circle cx="320" cy="60" r="14"/><circle cx="370" cy="76" r="14"/><circle cx="296" cy="116" r="14"/><circle cx="346" cy="122" r="14"/><path d="M270 70L320 60 370 76M296 116l24-56M346 122L320 60M296 116l50 6" fill="none"/></svg>',
  stream: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.35)"><circle cx="330" cy="150" r="30"/><circle cx="330" cy="150" r="60"/><circle cx="330" cy="150" r="90"/><circle cx="330" cy="150" r="120" stroke-dasharray="3 7"/></svg>',
  balance: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="rgba(143,180,230,.35)" stroke="none"><rect x="240" y="110" width="22" height="70"/><rect x="274" y="70" width="22" height="110"/><rect x="308" y="130" width="22" height="50"/><rect x="342" y="40" width="22" height="140" fill="rgba(229,200,75,.45)"/><rect x="376" y="90" width="22" height="90"/></svg>',
  av: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="rgba(143,180,230,.4)" stroke="none"><rect x="220" y="90" width="8" height="40"/><rect x="238" y="60" width="8" height="100"/><rect x="256" y="30" width="8" height="160"/><rect x="274" y="70" width="8" height="80"/><rect x="292" y="50" width="8" height="120"/><rect x="310" y="80" width="8" height="60"/><rect x="328" y="40" width="8" height="140"/><rect x="346" y="75" width="8" height="70"/><rect x="364" y="95" width="8" height="30"/></svg>',
  auto: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.35)"><path d="M250 50h60v50h60M310 100v50h60M250 50v-30"/><rect x="236" y="36" width="28" height="28" fill="rgba(143,180,230,.2)"/><rect x="296" y="86" width="28" height="28" fill="rgba(143,180,230,.2)"/><rect x="356" y="86" width="28" height="28" fill="rgba(143,180,230,.45)"/><rect x="356" y="136" width="28" height="28" fill="rgba(143,180,230,.2)"/></svg>',
  presets: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.35)"><rect x="262" y="50" width="90" height="110"/><rect x="278" y="36" width="90" height="110"/><rect x="294" y="22" width="90" height="110" fill="rgba(143,180,230,.1)"/></svg>',
  history: '<svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" stroke="rgba(143,180,230,.35)"><path d="M220 160h40v-40h40v-50h40v30h40"/><circle cx="260" cy="120" r="5" fill="rgba(143,180,230,.6)"/><circle cx="340" cy="70" r="5" fill="rgba(229,200,75,.8)"/></svg>'
};

/* ---------- أدوات ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ESC[c]);
const $ = (sel, root) => (root || document).querySelector(sel);
const $all = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function ago(ts) {
  const d = Math.max(0, Date.now() - ts), m = Math.round(d / 60000);
  if (m < 1) return 'الآن'; if (m < 60) return 'قبل ' + m + ' دقيقة'; const h = Math.round(m / 60); if (h < 24) return 'قبل ' + h + ' ساعة';
  return 'قبل ' + Math.round(h / 24) + ' يوم';
}
function clock(ts) { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0'); }
function dayKey(ts) { const d = new Date(ts), n = new Date(); const diff = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5); return diff === 0 ? 'اليوم' : diff === 1 ? 'أمس' : d.toISOString().slice(0, 10); }
function fmtVal(f, v) {
  if (f && f.type === 'toggle') return v ? 'تشغيل' : 'إيقاف';
  if (Array.isArray(v)) return v.join(' / ');
  return String(v) + (f && f.unit ? f.unit : '');
}
function fieldOf(tag, key) { const g = GAMES[tag]; if (!g) return null; for (const f of g.fields) if (f.key === key) return f; return null; }
function shortLabel(f, key) { return f ? f.label.replace(/\s*[—-].*$/, '') : key; }
function archOf(tag) { return ARCH_OF[tag] || 'info'; }
function gameTags() { return Object.keys(GAMES).filter(t => t.indexOf('__') !== 0); }

/* =====================================================================
   [3] الخدمات والمدراء — نفس منطق batmish-ui.js الحالي (تحقق، مسودات، حفظ، تعارض، مجموعات، سجل)
   ===================================================================== */
const ValidationService = {
  check(f, v) {
    if (f.type === 'toggle') return typeof v === 'boolean' ? { ok: true, v } : { ok: false, msg: 'قيمة غير صالحة' };
    if (f.type === 'number') {
      if (typeof v !== 'number' || !isFinite(v)) return { ok: false, msg: 'أدخل رقماً' };
      if (!Number.isInteger(v)) return { ok: false, msg: 'أدخل رقماً صحيحاً بدون كسور' };
      if (v < f.min || v > f.max) return { ok: false, msg: 'القيمة لازم تكون بين ' + f.min + ' و ' + f.max };
      return { ok: true, v };
    }
    if (f.type === 'numberArray') {
      if (!Array.isArray(v) || v.length !== f.length) return { ok: false, msg: 'لازم ' + f.length + ' قيم' };
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== 'number' || !isFinite(v[i]) || !Number.isInteger(v[i])) return { ok: false, msg: 'كل القيم أرقام صحيحة' };
        if (v[i] < f.min || v[i] > f.max) return { ok: false, msg: 'كل قيمة بين ' + f.min + ' و ' + f.max };
        if (f.monotonic === 'desc' && i && v[i] > v[i - 1]) return { ok: false, msg: 'كل قيمة أقل من أو تساوي اللي قبلها' };
      }
      return { ok: true, v };
    }
    return { ok: false, msg: 'نوع غير مدعوم' };
  }
};
const ERR_AR = {
  out_of_range: 'القيمة خارج المدى المسموح', invalid_type: 'نوع القيمة غير صحيح', not_integer: 'لازم رقم صحيح', not_descending: 'الترتيب لازم يكون تنازلياً',
  invalid_length: 'عدد القيم غير صحيح', unknown_setting: 'إعداد غير معروف', unknown_game: 'لعبة غير معروفة', duplicate_name: 'الاسم مستخدم من قبل',
  invalid_name: 'اسم غير صالح (حتى 40 حرفاً)', too_many_presets: 'وصلت الحد الأقصى للمجموعات لهذي اللعبة', conflict: 'تغيّرت الإعدادات من مكان آخر',
  forbidden: 'ما عندك صلاحية — تأكد من ربط البث', rate_limited: 'طلبات كثيرة، انتظر قليلاً', not_found: 'غير موجود', already_reverted: 'تم التراجع عنه من قبل', internal: 'خطأ في الخادم'
};
function errMsg(e) {
  if (e && e.offline) return 'ما قدرنا نوصل للخادم. تعديلاتك محفوظة كمسودة على جهازك — جرّب مرة ثانية.';
  let base = (e && ERR_AR[e.code]) || 'تعذّر تنفيذ العملية';
  if (e && e.detail && e.detail.min != null) base += ' (' + e.detail.min + ' – ' + e.detail.max + ')';
  return base;
}
/* في الدمج الحقيقي: B.controller.request. هنا: MockServer.request */
const Transport = { request: (m, p, b) => B.controller.request(m, p, b) };
const ConfigurationService = {
  call(method, path, body) {
    return Transport.request(method, path, body).then(r => {
      if (r.status >= 200 && r.status < 300) return r.body;
      const e = new Error((r.body && r.body.error) || 'http_' + r.status); e.status = r.status; e.code = r.body && r.body.error; e.detail = r.body && r.body.detail; e.rev = r.body && r.body.rev; throw e;
    });
  },
  bootstrap() { return this.call('GET', '/batmish/bootstrap'); },
  save(tag, values, baseRev) { return this.call('POST', '/batmish/config', { tag, values, baseRev }); },
  reset(tag, key, baseRev) { return this.call('POST', '/batmish/reset', { tag, key, baseRev }); },
  preset(op, p) { return this.call('POST', '/batmish/presets', Object.assign({ op }, p)); },
  history(tag) { return this.call('GET', '/batmish/history?limit=200' + (tag ? '&tag=' + encodeURIComponent(tag) : '')); },
  revert(id, baseRev) { return this.call('POST', '/batmish/history/revert', { id, baseRev }); },
  restoreGame(tag, baseRev) { return this.call('POST', '/batmish/history/restore-game', { tag, baseRev }); }
};

class SettingsManager {
  constructor() { this.games = {}; this.rev = 0; this.config = {}; this.presets = {}; this.defaultPresets = {}; this.drafts = {}; this.saveState = 'saved'; this.listeners = []; this.uid = null; this.autosave = false; this.timer = null; this.lastChange = null; this.lastSaved = []; }
  on(fn) { this.listeners.push(fn); }
  emit(w) { this.listeners.forEach(fn => { try { fn(w); } catch (e) {} }); }
  draftKey() { return 'batmish:draft:' + (this.uid || 'x'); }
  load(boot, uid) {
    this.games = boot.games; GAMES = boot.games; this.uid = uid; this.applyServerState(boot.state); try { B.resolver.set(this.rev, clone(this.config), uid); } catch (e) {}
    try { this.drafts = this.sanitizeDrafts(JSON.parse(localStorage.getItem(this.draftKey()) || '{}')); } catch (e) { this.drafts = {}; }
    try { this.autosave = localStorage.getItem('batmish:autosave') === '1'; } catch (e) {}
    this.saveState = this.dirtyCount() ? 'dirty' : 'saved';
  }
  applyServerState(st) { this.rev = st.rev | 0; this.config = st.config || {}; this.presets = st.presets || {}; this.defaultPresets = st.defaultPresets || {}; this.lastChange = null; }
  sanitizeDrafts(d) {
    const out = {};
    for (const tag in d) { if (!this.games[tag]) continue; for (const k in d[tag]) { const f = this.field(tag, k); if (f && ValidationService.check(f, d[tag][k]).ok && !same(d[tag][k], this.serverValue(tag, k))) (out[tag] = out[tag] || {})[k] = d[tag][k]; } }
    return out;
  }
  persistDrafts() { try { const k = this.draftKey(); if (this.dirtyCount()) localStorage.setItem(k, JSON.stringify(this.drafts)); else localStorage.removeItem(k); } catch (e) {} }
  field(tag, key) { const g = this.games[tag]; if (!g) return null; for (const f of g.fields) if (f.key === key) return f; return null; }
  defaultOf(tag, key) { return this.field(tag, key).default; }
  serverValue(tag, key) { const c = this.config[tag]; return c && c[key] !== undefined ? c[key] : this.defaultOf(tag, key); }
  value(tag, key) { const d = this.drafts[tag]; return d && d[key] !== undefined ? d[key] : this.serverValue(tag, key); }
  isModified(tag, key) { return !same(this.value(tag, key), this.defaultOf(tag, key)); }
  isDirty(tag, key) { const d = this.drafts[tag]; return !!(d && d[key] !== undefined); }
  dirtyTags() { return Object.keys(this.drafts).filter(t => Object.keys(this.drafts[t]).length); }
  dirtyCount(tag) { let n = 0; (tag ? [tag] : Object.keys(this.drafts)).forEach(t => { n += Object.keys(this.drafts[t] || {}).length; }); return n; }
  customizedCount(tag) { const c = this.config[tag]; return c ? Object.keys(c).length : 0; }
  totalCustomized() { let n = 0; for (const t in this.config) n += Object.keys(this.config[t]).length; return n; }
  modifiedCount(tag) { const g = this.games[tag]; if (!g) return 0; return g.fields.filter(f => this.isModified(tag, f.key)).length; }
  setDraft(tag, key, v) {
    if (same(v, this.serverValue(tag, key))) { if (this.drafts[tag]) { delete this.drafts[tag][key]; if (!Object.keys(this.drafts[tag]).length) delete this.drafts[tag]; } }
    else (this.drafts[tag] = this.drafts[tag] || {})[key] = clone(v);
    this.persistDrafts(); this.setState(this.dirtyCount() ? 'dirty' : 'saved');
    if (this.autosave && this.dirtyCount()) this.scheduleAutosave();
  }
  discard(tag) { if (tag) delete this.drafts[tag]; else this.drafts = {}; this.persistDrafts(); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); this.emit('drafts'); }
  setState(s) { if (this.saveState !== s) { this.saveState = s; this.emit('state'); } }
  setAutosave(on) { this.autosave = !!on; try { localStorage.setItem('batmish:autosave', on ? '1' : '0'); } catch (e) {} if (on && this.dirtyCount()) this.scheduleAutosave(); this.emit('state'); }
  scheduleAutosave() { clearTimeout(this.timer); this.timer = setTimeout(() => this.saveAll(true), 1400); }
  applyChanges(rev, changes) {
    (changes || []).forEach(c => {
      const def = this.defaultOf(c.tag, c.key);
      if (same(c.new, def)) { if (this.config[c.tag]) { delete this.config[c.tag][c.key]; if (!Object.keys(this.config[c.tag]).length) delete this.config[c.tag]; } }
      else (this.config[c.tag] = this.config[c.tag] || {})[c.key] = clone(c.new);
      if (this.drafts[c.tag]) { delete this.drafts[c.tag][c.key]; if (!Object.keys(this.drafts[c.tag]).length) delete this.drafts[c.tag]; }
      this.lastSaved.push(c.tag + '.' + c.key);
    });
    if (changes && changes.length) { this.rev = rev; this.lastChange = changes[changes.length - 1]; try { B.resolver.set(this.rev, clone(this.config)); } catch (e) {} }
    this.persistDrafts();
  }
  save(tag) {
    const d = this.drafts[tag]; if (!d || !Object.keys(d).length) return Promise.resolve({ changes: [] });
    return ConfigurationService.save(tag, clone(d), this.rev).then(r => { this.applyChanges(r.rev, r.changes); return r; });
  }
  saveAll() {
    const tags = this.dirtyTags(); if (!tags.length) return Promise.resolve(true);
    this.setState('saving'); this.lastSaved = [];
    return tags.reduce((p, t) => p.then(() => this.save(t)), Promise.resolve()).then(() => { this.setState(this.dirtyCount() ? 'dirty' : 'saved'); this.emit('saved'); return true; }, e => {
      this.setState('error'); this.lastError = e;
      if (e && e.code === 'conflict') return this.refresh().then(() => { this.setState('dirty'); this.emit('conflict'); return false; });
      this.emit('error', e); return false;
    });
  }
  refresh() { return ConfigurationService.bootstrap().then(b => { this.games = b.games; GAMES = b.games; this.applyServerState(b.state); try { B.resolver.set(this.rev, clone(this.config)); } catch (e) {} this.drafts = this.sanitizeDrafts(this.drafts); this.persistDrafts(); this.emit('refreshed'); }); }
  resetGame(tag) { delete this.drafts[tag]; this.persistDrafts(); return ConfigurationService.reset(tag, null, this.rev).then(r => { this.applyChanges(r.rev, r.changes); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); return r; }); }
  resetKey(tag, key) {
    if (this.isDirty(tag, key) && same(this.serverValue(tag, key), this.defaultOf(tag, key))) { this.setDraft(tag, key, this.defaultOf(tag, key)); return Promise.resolve({ changes: [] }); }
    if (this.isDirty(tag, key)) delete this.drafts[tag][key];
    if (same(this.serverValue(tag, key), this.defaultOf(tag, key))) { if (this.drafts[tag] && !Object.keys(this.drafts[tag]).length) delete this.drafts[tag]; this.persistDrafts(); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); return Promise.resolve({ changes: [] }); }
    return ConfigurationService.reset(tag, key, this.rev).then(r => { this.applyChanges(r.rev, r.changes); this.setState(this.dirtyCount() ? 'dirty' : 'saved'); return r; });
  }
  effectiveOverrides(tag) { const out = {}, g = this.games[tag]; if (!g) return out; g.fields.forEach(f => { const v = this.value(tag, f.key); if (!same(v, f.default)) out[f.key] = clone(v); }); return out; }
}
class PresetManager {
  constructor(sm) { this.sm = sm; }
  forGame(tag) { return Object.values(this.sm.presets).filter(p => p.tag === tag).sort((a, b) => a.createdAt - b.createdAt); }
  create(tag, name, values) { return ConfigurationService.preset('create', { tag, name, values }).then(r => (this.sm.presets[r.preset.id] = r.preset)); }
  rename(id, name) { return ConfigurationService.preset('update', { id, name }).then(r => (this.sm.presets[id] = r.preset)); }
  overwrite(id, values) { return ConfigurationService.preset('update', { id, values }).then(r => (this.sm.presets[id] = r.preset)); }
  duplicate(id) { return ConfigurationService.preset('duplicate', { id }).then(r => (this.sm.presets[r.preset.id] = r.preset)); }
  remove(id) { return ConfigurationService.preset('delete', { id }).then(() => { const t = this.sm.presets[id] && this.sm.presets[id].tag; delete this.sm.presets[id]; if (t && this.sm.defaultPresets[t] === id) delete this.sm.defaultPresets[t]; }); }
  setDefault(id) { return ConfigurationService.preset('default', { id }).then(r => { this.sm.defaultPresets[r.tag] = id; }); }
  apply(id) { const s = this.sm; s.discard(s.presets[id] && s.presets[id].tag); return ConfigurationService.preset('apply', { id, baseRev: s.rev }).then(r => { s.applyChanges(r.rev, r.changes); return r; }); }
}
class HistoryManager {
  constructor(sm) { this.sm = sm; this.items = []; }
  load(tag) { return ConfigurationService.history(tag).then(r => (this.items = r.history || [])); }
  revert(id) { const s = this.sm; return ConfigurationService.revert(id, s.rev).then(r => { s.applyChanges(r.rev, r.changes); return r; }); }
  restoreGame(tag) { const s = this.sm; return ConfigurationService.restoreGame(tag, s.rev).then(r => { s.applyChanges(r.rev, r.changes); return r; }); }
}

/* =====================================================================
   [4] مكونات الواجهة
   BatmishAtmosphere · BatmishTacticalControls · BatmishSettingsPanel · BatmishHeader · BatmishNavigation · BatmishMobileNavigation
   BatmishActivityTimeline · BatmishGameCard · BatmishGameArchive · BatmishGameSettings · BatmishCommandCenter · BatmishDashboard
   ===================================================================== */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

const BatmishAtmosphere = {
  skyline(seed, H, hMin, hMax, fill, wins, detail) {
    const r = rng(seed); let x = -30, d = 'M-30 ' + H, w3 = '', nw = 0;
    while (x < 1640) {
      const w = 36 + Math.floor(r() * 74), h = hMin + Math.floor(r() * (hMax - hMin)), top = H - h, k = r();
      d += ' L' + x + ' ' + top;
      if (k < .2 && detail) d += ' L' + (x + w * .5 - 6) + ' ' + top + ' L' + (x + w * .5) + ' ' + (top - 44 - Math.floor(r() * 46)) + ' L' + (x + w * .5 + 6) + ' ' + top;
      else if (k < .38) d += ' L' + (x + w * .14) + ' ' + top + ' L' + (x + w * .14) + ' ' + (top - 14) + ' L' + (x + w * .86) + ' ' + (top - 14) + ' L' + (x + w * .86) + ' ' + top;
      else if (k < .5 && detail) d += ' L' + (x + w * .5) + ' ' + top + ' L' + (x + w * .5) + ' ' + (top - 52) + ' L' + (x + w * .5 + 2) + ' ' + (top - 52) + ' L' + (x + w * .5 + 2) + ' ' + top;
      else if (k < .6) d += ' L' + (x + w * .5) + ' ' + (top - 26);
      d += ' L' + (x + w) + ' ' + top; x += w;
      if (wins && nw < wins) {
        const cols = Math.max(1, Math.floor(w / 14)), rows = Math.min(6, Math.floor(h / 22));
        for (let cI = 0; cI < cols; cI++) for (let rI = 0; rI < rows; rI++) if (r() < .09 && nw < wins) { nw++; w3 += '<rect class="win" x="' + (x - w + 6 + cI * 14) + '" y="' + (top + 12 + rI * 22) + '" width="3" height="5" fill="' + (r() < .7 ? '#f1deA0' : '#8fb4e6') + '" opacity=".6" style="--d:' + (5 + Math.floor(r() * 8)) + 's;--dl:-' + Math.floor(r() * 9) + 's"/>'; }
      }
    }
    d += ' L1640 ' + H + ' Z';
    return '<svg viewBox="0 0 1600 ' + H + '" aria-hidden="true"><path d="' + d + '" fill="' + fill + '"/>' + w3 + '</svg>';
  },
  html() {
    if (this._h) return this._h;
    const r = rng(77); let stars = '';
    for (let i = 0; i < 56; i++) stars += '<i style="left:' + (r() * 100).toFixed(1) + '%;top:' + (r() * 58).toFixed(1) + '%;--d:' + (3 + r() * 6).toFixed(1) + 's;--dl:-' + (r() * 6).toFixed(1) + 's;width:' + (r() < .15 ? 3 : 2) + 'px;height:' + (r() < .15 ? 3 : 2) + 'px"></i>';
    const signal = '<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>' +
      '<linearGradient id="bmBeam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#cfe0ff" stop-opacity="0"/><stop offset=".55" stop-color="#cfe0ff" stop-opacity=".07"/><stop offset="1" stop-color="#f3e6a8" stop-opacity=".2"/></linearGradient>' +
      '<radialGradient id="bmDisc"><stop offset="0" stop-color="#f3e6a8" stop-opacity=".34"/><stop offset=".72" stop-color="#e5c84b" stop-opacity=".16"/><stop offset="1" stop-color="#e5c84b" stop-opacity=".06"/></radialGradient></defs>' +
      '<g class="beam"><path d="M700 900L960 900L1360 330L1030 150Z" fill="url(#bmBeam)"/></g>' +
      '<circle cx="1190" cy="248" r="150" fill="url(#bmDisc)"/><circle cx="1190" cy="248" r="150" fill="none" stroke="#f3e6a8" stroke-opacity=".22"/><circle cx="1190" cy="248" r="168" fill="none" stroke="#8fb4e6" stroke-opacity=".12" stroke-dasharray="3 9"/>' +
      '<g transform="translate(1066 190) scale(1.24)"><path d="' + BAT_PATH + '" fill="#080B12" fill-opacity=".72"/></g></svg>';
    let fog = ''; for (let i = 0; i < 3; i++) fog += '<i style="left:' + (i * 30 - 20) + '%;--d:' + (36 + i * 9) + 's;--dl:-' + (i * 13) + 's"></i>';
    this._h = '<div class="bm-atmo" aria-hidden="true"><div class="atmo-stars">' + stars + '</div><div class="atmo-signal">' + signal + '</div>' +
      '<div class="atmo-sk atmo-sk3">' + this.skyline(3, 340, 150, 300, '#101b2f', 0, true) + '</div>' +
      '<div class="atmo-fog">' + fog + '</div>' +
      '<div class="atmo-sk atmo-sk2">' + this.skyline(11, 300, 100, 230, '#0b1423', 70, true) + '</div>' +
      '<div class="atmo-sk atmo-sk1">' + this.skyline(29, 240, 50, 160, '#070b13', 50, true) + '</div>' +
      '<div class="atmo-grid"></div><div class="atmo-scan"></div><div class="atmo-veil"></div><div class="atmo-corner"></div></div>';
    return this._h;
  }
};

/* ---------------------- عناصر التحكم التكتيكية ---------------------- */
const BatmishTacticalControls = {
  pct(f, v) { return f.max > f.min ? Math.max(0, Math.min(100, ((v - f.min) / (f.max - f.min)) * 100)) : 0; },
  step(f) { const r = f.max - f.min; return r > 200 ? Math.round(r / 100) : 1; },
  toggle(fk, id, v, small) {
    return '<label class="bm-tsw' + (small ? ' is-sm' : '') + '"><input type="checkbox" id="' + id + '" data-k="' + fk + '"' + (v ? ' checked' : '') + ' role="switch"><span class="tsw-body"></span><span class="tsw-lbl on">تشغيل</span><span class="tsw-lbl off">إيقاف</span><span class="tsw-knob"><i></i></span></label>';
  },
  range(fk, id, f, v) {
    const st = Math.max(1, Math.round((f.max - f.min) / 160));
    return '<div class="fp-ctl"><div class="bm-rng" style="--p:' + this.pct(f, v) + '%;--d:' + this.pct(f, f.default) + '%"><span class="trk"></span><span class="fill"></span><span class="tick"></span><span class="dmk"></span>' +
      '<input type="range" min="' + f.min + '" max="' + f.max + '" step="' + st + '" value="' + esc(v) + '" data-k="' + fk + '" data-r="1" aria-label="' + esc(f.label) + '"><span class="thumb"></span><span class="mn">' + f.min + '</span><span class="mx">' + f.max + '</span></div>' +
      '<div class="bm-num"><button type="button" data-step="-1" data-k="' + fk + '" aria-label="إنقاص">' + ic('minus') + '</button><input type="number" inputmode="numeric" id="' + id + '" min="' + f.min + '" max="' + f.max + '" step="1" value="' + esc(v) + '" data-k="' + fk + '" data-n="1" aria-label="' + esc(f.label) + '">' + (f.unit ? '<span class="u">' + esc(f.unit) + '</span>' : '') + '<button type="button" data-step="1" data-k="' + fk + '" aria-label="زيادة">' + ic('plus') + '</button></div></div>';
  },
  seq(fk, id, f, v) {
    return '<div class="bm-seq" style="--n:' + v.length + '">' + v.map((x, i) =>
      '<div class="cell"><div class="col"><i style="--h:' + this.pct(f, x).toFixed(0) + '%"></i></div><input type="number" inputmode="numeric" min="' + f.min + '" max="' + f.max + '" value="' + esc(x) + '" data-k="' + fk + '" data-i="' + i + '" aria-label="' + esc(f.label) + ' ' + (i + 1) + '"' + (i === 0 ? ' id="' + id + '"' : '') + '><span class="nm">#' + (i + 1) + '</span></div>').join('') + '</div>';
  },
  /* مزامنة عناصر التحكم مع القيمة (دون لمس الحقل الذي يكتب فيه المستخدم) */
  sync(row, f, v, active) {
    if (f.type === 'toggle') { const c = $('input[type=checkbox]', row); if (c && c !== active) c.checked = !!v; return; }
    if (f.type === 'number') {
      const rng = $('.bm-rng', row); if (rng) rng.style.setProperty('--p', this.pct(f, v) + '%');
      const r = $('input[data-r]', row), n = $('input[data-n]', row); if (r && r !== active) r.value = v; if (n && n !== active) n.value = v; return;
    }
    $all('.bm-seq .cell', row).forEach((c, i) => { const bar = $('.col i', c), inp = $('input', c); if (bar) bar.style.setProperty('--h', this.pct(f, v[i]).toFixed(0) + '%'); if (inp && inp !== active) inp.value = v[i]; });
  }
};

/* ---------------------- لوحة إعداد واحد ---------------------- */
const BatmishSettingsPanel = {
  html(sm, errs, tag, f) {
    const v = sm.value(tag, f.key), mod = sm.isModified(tag, f.key), dirty = sm.isDirty(tag, f.key), fk = tag + '.' + f.key, id = 'bmf-' + tag + '-' + f.key, bad = errs[fk];
    const kind = f.type === 'toggle' ? 'toggle' : f.type === 'number' ? 'range' : 'seq';
    const head = '<div class="fp-head"><h5 class="fp-name"><label for="' + id + '">' + esc(f.label) + '</label></h5><div class="fp-hint">' + esc(f.hint || '') + '</div></div>';
    const foot = '<div class="fp-foot"><span class="fp-def">الافتراضي: <b>' + esc(fmtVal(f, f.default)) + '</b></span><span data-state>' + this.stateTag(mod, dirty) + '</span><span class="sp"></span>' +
      '<button type="button" class="fp-rst" data-resetkey="' + fk + '"' + (mod || dirty ? '' : ' disabled') + '>' + ic('reset') + 'استعادة الأصلي</button></div><div class="fp-err" role="alert" data-err>' + esc(bad || '') + '</div>';
    let ctl;
    if (kind === 'toggle') ctl = BatmishTacticalControls.toggle(fk, id, v);
    else if (kind === 'range') ctl = BatmishTacticalControls.range(fk, id, f, v);
    else ctl = BatmishTacticalControls.seq(fk, id, f, v);
    const body = kind === 'toggle' ? '<div class="txt">' + head + foot + '</div>' + ctl : head + ctl + foot;
    return '<div class="bm-fp bm-plate f-' + kind + (mod || dirty ? ' is-mod' : '') + (dirty ? ' is-dirty' : '') + (bad ? ' is-bad' : '') + '" data-fk="' + fk + '"><i class="bm-glow"></i>' + body + '</div>';
  },
  stateTag(mod, dirty) { return dirty ? '<span class="bm-tag t-sig">غير محفوظ</span>' : mod ? '<span class="bm-tag t-elec">مخصص</span>' : ''; },
  refresh(root, sm, errs, fk) {
    const i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), f = sm.field(tag, key); if (!f) return;
    const mod = sm.isModified(tag, key), dirty = sm.isDirty(tag, key), bad = errs[fk], v = sm.value(tag, key);
    $all('.bm-fp[data-fk="' + fk + '"]', root).forEach(row => {
      row.classList.toggle('is-mod', mod || dirty); row.classList.toggle('is-dirty', dirty); row.classList.toggle('is-bad', !!bad);
      $('[data-err]', row).textContent = bad || '';
      $('[data-state]', row).innerHTML = this.stateTag(mod, dirty);
      $('[data-resetkey]', row).disabled = !(mod || dirty);
      if (!bad) BatmishTacticalControls.sync(row, f, v, document.activeElement);
    });
  }
};

/* ---------------------- الهيدر والتنقل ---------------------- */
const NAV = [
  ['cmd', 'نظرة عامة', 'مركز القيادة', 'cmd', 'الأساسي'], ['db', 'أرشيف كامل', 'قاعدة الألعاب', 'db'], ['settings', 'كل المعاملات', 'إعدادات الألعاب', 'settings'],
  ['round', 'الأوقات والمحاولات', 'التحكم بالجولات', 'round', 'العمليات'], ['players', 'قواعد اللاعبين', 'تجربة اللاعبين', 'players'], ['stream', 'الجمهور والتفاعل', 'تفاعل البث', 'stream'],
  ['balance', 'النقاط والتوازن', 'موازنة الألعاب', 'balance'], ['av', 'الصوت والحركة', 'الصوت والمرئيات', 'av'], ['auto', 'سلوكيات تلقائية', 'الأتمتة', 'auto'],
  ['presets', 'مجموعاتك المحفوظة', 'المجموعات', 'presets', 'المحفوظات'], ['history', 'سجل التعديلات', 'السجل', 'history']
];
const NAV_BY = {}; NAV.forEach(n => { NAV_BY[n[0]] = n; });
const SECTION_INFO = {
  round: { cats: ['round'] }, players: { cats: ['players'] }, balance: { cats: ['scoring', 'balance', 'difficulty'] }
};

const BatmishHeader = {
  html() {
    return '<header class="bm-head"><button type="button" class="bm-btn b-ghost b-icon bm-menu-btn" data-act="menu" aria-label="القائمة">' + ic('menu') + '</button>' +
      '<div class="bm-brand"><div class="bm-brand-mark bm-plate p-x is-pulse">' + BAT_SVG + '</div><div class="bm-brand-txt"><b>BATMISH</b><i>نظام الفارس المظلم</i></div></div>' +
      '<div class="bm-crumb"><span class="en" id="bm-crumb-en">نظرة عامة</span><b id="bm-crumb">مركز القيادة</b></div><div class="bm-head-sp"></div>' +
      '<div class="bm-hmod m-stream bm-plate"><div class="bm-sig"><i></i><i></i><i></i><i></i><i></i></div><div class="lbl"><span class="en">ربط البث</span><b>مربوط</b></div></div>' +
      '<div class="bm-hmod m-user bm-plate"><div class="lbl"><span class="en">الستريمر</span><b class="mono">@' + STREAMER + '</b></div></div>' +
      '<div class="bm-save-chip bm-plate" id="bm-status" data-s="saved" role="status" aria-live="polite"><i></i><span id="bm-status-t">تم الحفظ</span></div>' +
      '<button type="button" class="bm-close bm-plate" data-act="close" aria-label="إغلاق اللوحة">' + ic('x') + '</button></header>';
  }
};
const BatmishNavigation = {
  html() {
    let out = '';
    NAV.forEach((n, i) => {
      if (n[4]) out += '<div class="bm-rail-lbl">// ' + n[4] + '</div>';
      out += '<button type="button" class="bm-nav-item" data-nav="' + n[0] + '" style="--i:' + i + '"><span class="bm-nav-bg"></span><span class="bm-node">' + ic(n[3]) + '</span><span class="bm-nav-txt"><span class="en">' + n[1] + '</span><span class="ar">' + n[2] + '</span></span><span class="bm-nav-idx">' + String(i + 1).padStart(2, '0') + '</span></button>';
    });
    return '<nav class="bm-rail bm-plate" aria-label="التنقل الرئيسي"><i class="bm-glow"></i><div class="bm-rail-in bm-scroll">' + out + '</div>' +
      '<div class="bm-rail-foot"><div class="row"><span class="en" style="font-size:9.5px;letter-spacing:0;color:#6f7f98">الستريمر</span><b class="mono">@' + STREAMER + '</b></div><div class="row"><span class="en" style="font-size:9.5px;letter-spacing:0;color:#6f7f98">النظام</span><b id="bm-foot-rev">—</b></div></div></nav>';
  }
};
const BatmishMobileNavigation = {
  items: [['cmd', 'القيادة', 'cmd'], ['db', 'الألعاب', 'db'], ['settings', 'الإعدادات', 'settings'], ['round', 'الجولات', 'round']],
  html() {
    return '<nav class="bm-mnav" aria-label="تنقل الجوال">' + this.items.map(i => '<button type="button" data-nav="' + i[0] + '">' + ic(i[2]) + '<span>' + i[1] + '</span></button>').join('') +
      '<button type="button" data-act="menu" data-more="1">' + ic('more') + '<span>المزيد</span></button></nav>';
  }
};

/* ---------------------- سجل النشاط (مراقبة العمليات) ---------------------- */
const BatmishActivityTimeline = {
  html(items, sm, gameName, limit) {
    const rows = items.slice(0, limit || 6).map(e => {
      const f = sm.field(e.tag, e.key);
      return '<div class="bm-op"><span class="t">' + clock(e.ts) + '</span><span class="nd"><i></i></span><div class="w"><b>' + esc(gameName(e.tag)) + ' › ' + esc(shortLabel(f, e.key)) + '</b><small>' + ago(e.ts) + (e.preset ? ' · ' + esc(e.preset) : '') + '</small></div><span class="bm-diff"><s>' + esc(fmtVal(f, e.old)) + '</s><em>→</em><i>' + esc(fmtVal(f, e.new)) + '</i></span></div>';
    }).join('');
    return '<div class="bm-ops bm-plate"><i class="bm-glow"></i><div class="bm-ops-h"><span class="rec"></span><span>سجل العمليات المباشر</span><span class="sp"></span><span>' + items.length + ' حدث</span></div>' +
      (rows ? '<div class="bm-ops-l">' + rows + '</div>' : '<div class="bm-empty">' + ic('history') + '<h4>لا توجد عمليات مسجّلة</h4><p>كل تعديل تحفظه يظهر هنا لحظة حدوثه.</p></div>') + '</div>';
  }
};

/* ---------------------- بطاقة لعبة + أرشيف + وحدة إعدادات اللعبة ---------------------- */
const BatmishGameCard = {
  html(g, sm, idx) {
    const a = archOf(g.tag), cust = sm.customizedCount(g.tag), dirty = sm.dirtyCount(g.tag), can = g.fields > 0;
    return '<article class="bm-gc bm-plate a-' + a + (cust ? ' is-custom' : '') + '" ' + (can ? 'tabindex="0" role="button" data-game="' + g.tag + '"' : 'aria-disabled="true"') + ' aria-label="' + esc(g.name) + '" style="--i:' + idx + '"><i class="bm-glow"></i>' +
      '<div class="gc-art">' + ART[a] + '</div><div class="gc-top"><span class="gc-code">G-' + String(idx + 1).padStart(2, '0') + '</span><span class="bm-tag">' + ARCH[a].en + '</span></div>' +
      '<div class="gc-glyph">' + glyph(g.tag) + '</div><div class="txt"><h4>' + esc(g.name) + '</h4><p>' + esc(g.desc) + '</p></div>' +
      '<div class="gc-meta">' + (can ? '<span class="bm-tag">' + g.fields + ' إعداد</span>' : '<span class="bm-tag t-warn">غير قابلة للتخصيص بعد</span>') +
      (cust ? '<span class="bm-tag t-sig">مخصصة · ' + cust + '</span>' : can ? '<span class="bm-tag t-ok">افتراضية</span>' : '') + (dirty ? '<span class="bm-tag t-elec">غير محفوظ · ' + dirty + '</span>' : '') + '</div>' +
      (can ? '<div class="gc-cta"><span class="bm-btn b-prime b-sm"><span class="en">تعديل الإعدادات</span>' + ic('back') + '</span></div>' : '') + '</article>';
  }
};
const BatmishGameArchive = {
  list(d) {
    const sm = d.sm, q = d.q.trim().toLowerCase();
    return d.games.filter(g => {
      if (d.arch !== 'all' && archOf(g.tag) !== d.arch) return false;
      if (d.status === 'custom' && !sm.customizedCount(g.tag)) return false;
      if (d.status === 'default' && sm.customizedCount(g.tag)) return false;
      if (q && (g.name + ' ' + g.desc + ' ' + g.tag).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  },
  grid(d) {
    const list = this.list(d);
    return list.length ? '<div class="bm-gamegrid v-' + d.vm + '" id="bm-grid">' + list.map(g => BatmishGameCard.html(g, d.sm, d.games.indexOf(g))).join('') + '</div>'
      : '<div class="bm-plate bm-box" id="bm-grid"><div class="bm-empty">' + ic('search') + '<h4>لا نتائج مطابقة</h4><p>ما فيه ألعاب تطابق البحث أو التصفية الحالية.</p></div></div>';
  },
  html(d) {
    const sm = d.sm, total = d.games.length, can = d.games.filter(g => g.fields > 0).length, cust = d.games.filter(g => sm.customizedCount(g.tag)).length;
    const chips = ['all'].concat(Object.keys(ARCH)).map(k => {
      const n = k === 'all' ? total : d.games.filter(g => archOf(g.tag) === k).length; if (!n && k !== 'all') return '';
      return '<button type="button" class="bm-chip" data-arch="' + k + '" aria-pressed="' + (d.arch === k) + '">' + (k === 'all' ? 'الكل' : ARCH[k].ar) + '<span class="n">' + n + '</span></button>';
    }).join('');
    const st = [['all', 'الكل'], ['custom', 'المعدلة'], ['default', 'الافتراضية']].map(x => '<button type="button" class="bm-chip" data-status="' + x[0] + '" aria-pressed="' + (d.status === x[0]) + '">' + x[1] + '</button>').join('');
    const vm = [['grid', 'grid', 'شبكة'], ['list', 'list', 'قائمة'], ['compact', 'dense', 'مضغوط']].map(x => '<button type="button" data-vm="' + x[0] + '" aria-pressed="' + (d.vm === x[0]) + '" aria-label="' + x[2] + '" title="' + x[2] + '">' + ic(x[1]) + '</button>').join('');
    return '<div class="bm-pagehead"><div><span class="bm-eyebrow">أرشيف غوثام التكتيكي</span><h2>أرشيف الألعاب</h2><p>أرشيف الألعاب القابلة للتخصيص. اختر لعبة لتدخل وحدة التحكم الخاصة بها.</p></div></div>' +
      '<div class="bm-arch-bar bm-plate"><i class="bm-glow"></i><div class="bm-arch-row"><div class="bm-search">' + ic('search') + '<input class="bm-input" data-q type="search" value="' + esc(d.q) + '" placeholder="ابحث باسم اللعبة أو وصفها…" aria-label="بحث في الألعاب" autocomplete="off"><kbd>/</kbd></div>' +
      '<div class="bm-seg">' + st + '</div><div class="bm-vm" role="group" aria-label="طريقة العرض">' + vm + '</div></div>' +
      '<div class="bm-arch-row"><div class="bm-chips" role="group" aria-label="التصنيفات">' + chips + '</div></div>' +
      '<div class="bm-count"><span><b>' + total + '</b> لعبة</span><span><b>' + can + '</b> قابلة للتخصيص</span><span class="y"><b>' + cust + '</b> مخصصة</span></div></div>' + this.grid(d);
  }
};
const BatmishGameSettings = {
  groups(d, tag) {
    const sm = d.sm, g = sm.games[tag], fields = g.fields.filter(f => f.tab === d.tab); if (!fields.length) return '';
    const cats = []; fields.forEach(f => { if (cats.indexOf(f.cat) < 0) cats.push(f.cat); });
    const adv = d.tab === 'ADVANCED';
    return cats.map(c => {
      const fl = fields.filter(f => f.cat === c), key = tag + '.' + d.tab + '.' + c, anyMod = fl.some(f => sm.isModified(tag, f.key) || sm.isDirty(tag, f.key));
      const coll = key in d.xs ? d.xs[key] : (adv && !anyMod && cats.length > 1 && cats.indexOf(c) > 0);
      const info = CAT_INFO[c] || [c.toUpperCase(), c];
      return '<section class="bm-grp cat-' + c + (coll ? ' is-x' : '') + '"><button type="button" class="bm-grp-h" data-grp="' + key + '" aria-expanded="' + (!coll) + '"><span class="bar"></span><span class="en">' + info[0] + '</span><span class="ar">' + info[1] + '</span><span class="ln"></span><span class="cnt">' + fl.length + '</span>' + ic('chev', 'chev') + '</button>' +
        '<div class="bm-fields">' + fl.map(f => BatmishSettingsPanel.html(sm, d.errs, tag, f)).join('') + '</div></section>';
    }).join('');
  },
  html(d, tag) {
    const sm = d.sm, g = sm.games[tag], gi = d.gameInfo(tag); if (!g || !gi) return d.empty('warn', 'اللعبة غير موجودة', 'اللعبة غير موجودة في الكتالوج.');
    const a = archOf(tag), mod = sm.modifiedCount(tag), dirty = sm.dirtyCount(tag), n = g.fields.length;
    const present = TABS.filter(t => g.fields.some(f => f.tab === t));
    if (present.indexOf(d.tab) < 0) d.tab = present[0];
    const segs = g.fields.map(f => '<i class="' + (sm.isDirty(tag, f.key) ? 'un' : sm.isModified(tag, f.key) ? 'on' : '') + '"></i>').join('');
    const tabs = TABS.map(t => {
      const cnt = g.fields.filter(f => f.tab === t).length, dd = g.fields.some(f => f.tab === t && sm.isDirty(tag, f.key));
      return '<button type="button" class="bm-tab" role="tab" data-tab="' + t + '" aria-selected="' + (d.tab === t) + '"' + (cnt ? '' : ' disabled') + '><span class="ar">' + TAB_AR[t] + '</span><span class="n">' + cnt + '</span>' + (dd ? '<span class="d"></span>' : '') + '</button>';
    }).join('');
    return '<div class="bm-pagehead" style="margin-bottom:14px;padding-bottom:12px"><button type="button" class="bm-btn b-ghost b-sm" data-nav="db"><span style="display:inline-flex;transform:scaleX(-1)">' + ic('back') + '</span><span class="en">العودة للأرشيف</span></button><div class="act"><button type="button" class="bm-btn b-ghost b-sm" data-resetgame="' + tag + '"' + (sm.customizedCount(tag) ? '' : ' disabled') + '>' + ic('reset') + 'إعادة اللعبة للافتراضي</button></div></div>' +
      '<section class="bm-gh bm-plate a-' + a + '"><i class="bm-glow"></i><div class="gc-art">' + ART[a] + '</div><div class="glyph">' + glyph(tag) + '</div>' +
      '<div><span class="bm-eyebrow">وحدة إعدادات اللعبة · ' + ARCH[a].ar + '</span><h2>' + esc(gi.name) + '</h2><p>' + esc(gi.desc) + '</p><div class="tags"><span class="bm-tag">' + n + ' إعداد</span>' + (mod ? '<span class="bm-tag t-sig">مخصصة</span>' : '<span class="bm-tag t-ok">افتراضية</span>') + (dirty ? '<span class="bm-tag t-elec">غير محفوظ · ' + dirty + '</span>' : '') + '</div></div>' +
      '<div class="side"><div class="bm-meter"><div class="top"><span>المعدّل</span><span><b>' + mod + '</b> / ' + n + '</span></div><div class="bar">' + segs + '</div></div></div></section>' +
      '<div class="bm-tabs" role="tablist" aria-label="أقسام الإعدادات">' + tabs + '</div>' + this.groups(d, tag);
  }
};

/* ---------------------- مركز القيادة ---------------------- */
const BatmishCommandCenter = {
  html(d) {
    const sm = d.sm, games = d.games, canN = games.filter(g => g.fields > 0).length, custG = games.filter(g => sm.customizedCount(g.tag)).length;
    const tf = d.totalFields(), cu = sm.totalCustomized(), presetsN = Object.keys(sm.presets).length, last = d.hist.items[0];
    const frac = tf ? cu / tf : 0, CI = 119.4;
    const lastTxt = last ? ago(last.ts) : (sm.lastChange ? 'الآن' : 'لا يوجد تعديل');
    const lastSub = last ? shortLabel(sm.field(last.tag, last.key), last.key) : 'لم يُسجَّل أي تعديل بعد';
    const segs = games.map(g => '<i class="' + (sm.customizedCount(g.tag) ? 'on' : '') + '"></i>').join('');
    const unit = (viz, en, big, small) => '<div class="bm-unit"><div class="viz">' + viz + '</div><div class="lbl"><span class="en">' + en + '</span><b>' + big + '</b><small>' + small + '</small></div></div>';
    const status = '<aside class="bm-status bm-plate"><i class="bm-glow"></i><div class="bm-status-h"><span class="en">حالة النظام</span><span class="bm-tag t-ok">يعمل</span></div>' +
      unit('<div class="bm-sig" style="height:26px"><i></i><i></i><i></i><i></i><i></i></div>', 'ربط البث', 'مربوط', 'مؤكد من الخادم · @' + STREAMER) +
      unit('<svg class="bm-ring" viewBox="0 0 46 46"><circle class="bg" cx="23" cy="23" r="19"/><circle class="fg" cx="23" cy="23" r="19" stroke-dasharray="' + CI + '" stroke-dashoffset="' + (CI * (1 - Math.max(frac, .02))).toFixed(1) + '"/></svg><span class="bm-ring-n">' + cu + '</span>', 'الإعدادات النشطة', '<span class="mono">' + cu + ' <span style="font-size:12px;color:#7e8ea8">/ ' + tf + '</span></span>', 'إعدادات مغيّرة عن الافتراضي') +
      unit('<div class="bm-segs">' + segs + '</div>', 'الألعاب المخصصة', '<span class="mono">' + custG + ' <span style="font-size:12px;color:#7e8ea8">/ ' + canN + '</span></span>', 'ألعاب لها تخصيص نشط') +
      unit('<div class="bm-cards-stack"><i></i><i></i><i></i></div>', 'المجموعات المحفوظة', presetsN, 'مجموعات محفوظة') +
      unit('<svg class="bm-pulse-line" viewBox="0 0 54 30"><path d="M0 18h12l4-12 6 22 5-16 4 6h23"/></svg>', 'آخر تعديل', esc(lastTxt), esc(lastSub)) + '</aside>';
    const hero = '<section class="bm-hero"><div class="bm-hero-main bm-plate"><i class="bm-glow"></i><div class="bm-hero-emblem"><span class="bm-radar"></span><span class="bm-radar r2"></span><span class="bm-radar r3"></span><span class="bm-radar-x"></span><span class="bm-radar-y"></span><span class="bm-radar-sweep"></span>' +
      '<svg class="bat" viewBox="0 0 200 100"><path d="' + BAT_PATH + '"/></svg></div><div class="bm-hero-body"><span class="bm-eyebrow">غوثام · كهف الخفاش</span><h1>BATMISH</h1><h2>مركز قيادة الفارس المظلم</h2>' +
      '<div class="bm-welcome">أهلاً بعودتك، <b class="mono">@' + STREAMER + '</b></div><div class="bm-hero-tags"><span class="bm-tag t-ok">الربط مؤكد</span><span class="bm-tag t-elec">إصدار ' + sm.rev + '</span><span class="bm-tag">' + canN + ' لعبة مجهّزة</span></div></div></div>' + status + '</section>';
    const cnt = c => d.countCats(c);
    const Q = [
      ['db', 'قاعدة الألعاب', 'أرشيف كل الألعاب وإعداداتها', canN + ' لعبة', 'c5 tall sq-a hot', ''], ['round', 'التحكم بالجولات', 'مدد وعدّادات ومحاولات الجولات', cnt(['round']) + ' إعداد', 'c4 tall sq-b', ''], ['players', 'تجربة اللاعبين', 'الإنعاش وعدد المرات المسموحة', cnt(['players']) + ' إعداد', 'c3 tall sq-c', ''],
      ['settings', 'إعدادات الألعاب', 'كل الإعدادات في مكان واحد', tf + ' إعداد', 'c3 sq-d', ''], ['balance', 'موازنة الألعاب', 'النقاط والصعوبة والموازنة', cnt(['scoring', 'balance', 'difficulty']) + ' إعداد', 'c4 sq-e', ''], ['av', 'الصوت والمرئيات', 'مستوى الصوت وكثافة المؤثرات', d.countTag('__site') + ' إعداد', 'c5 sq-a hot', ''],
      ['stream', 'تفاعل البث', 'تفاعل جمهور البث', 'غير موصول بعد', 'c4 sq-c dim', 'warn'], ['auto', 'الأتمتة', 'سلوكيات تلقائية قابلة للضبط', d.autoFields().length + ' سلوك', 'c4 sq-b', ''], ['presets', 'المجموعات', 'مجموعات محفوظة', presetsN + ' محفوظة', 'c2 sq-d', ''], ['history', 'السجل', 'سجل وتراجع', 'السجل الكامل', 'c2 sq-e', '']
    ];
    const quick = '<div class="bm-quick">' + Q.map((q, i) => {
      const n = NAV_BY[q[0]], cls = q[4];
      return '<button type="button" class="bm-qc bm-plate ' + cls + '" data-nav="' + q[0] + '"><i class="bm-glow"></i><span class="art">' + QART[q[0]] + '</span><span class="num">' + String(i + 2).padStart(2, '0') + '</span><span class="ico">' + ic(n[3]) + '</span>' +
        '<h4>' + n[1] + '</h4><p>' + q[2] + '</p><span class="meta"><span class="bm-tag ' + (q[5] === 'warn' ? 't-warn' : '') + '">' + q[3] + '</span></span></button>';
    }).join('') + '</div>';
    return hero + '<div class="bm-sec"><h3>وصول سريع</h3><span class="ar"></span></div>' + quick +
      '<div class="bm-sec"><h3>آخر العمليات</h3><span class="ar"></span><span class="cnt">' + d.hist.items.length + '</span></div>' + BatmishActivityTimeline.html(d.hist.items, sm, t => d.gameName(t), 6);
  }
};

/* =====================================================================
   BatmishDashboard — المتحكم الرئيسي (يربط كل المكونات بالمدراء)
   ===================================================================== */
class Dashboard {
  constructor() {
    this.root = null; this.sm = new SettingsManager(); this.presets = new PresetManager(this.sm); this.hist = new HistoryManager(this.sm);
    this.ready = false; this.loadError = null; this.games = []; this.view = 'cmd'; this.arg = null; this.tab = 'GENERAL'; this.q = ''; this.arch = 'all'; this.status = 'all';
    this.vm = 'grid'; try { this.vm = localStorage.getItem('batmish:vm') || 'grid'; } catch (e) {}
    this.errs = {}; this.xs = {}; this.sq = ''; this.scat = 'all'; this.presetTag = null; this.histTag = ''; this.lastView = null;
    this.sm.on(w => this.onSm(w));
  }
  /* ---------- دورة الحياة ---------- */
  open() {
    if (!this.root) this.build();
    document.body.classList.add('bm-lock');
    this.root.classList.add('is-open', 'is-booting'); this.root.classList.remove('is-closing');
    clearTimeout(this._bt); this._bt = setTimeout(() => this.root.classList.remove('is-booting'), 1700);
    this.render('first'); this.loadAll();
    setTimeout(() => { const b = $('.bm-nav-item.is-active', this.root); if (b && window.innerWidth > 860) b.focus({ preventScroll: true }); }, 900);
  }
  close(o) {
    if (!this.root || !this.root.classList.contains('is-open')) return;
    const fin = () => { this.root.classList.remove('is-open', 'is-closing', 'is-nav'); document.body.classList.remove('bm-lock'); if (window.Batmish && Batmish.onClose) Batmish.onClose(); };
    if (o && o.silent) return fin();
    this.root.classList.add('is-closing'); setTimeout(fin, 420);
  }
  requestClose() {
    const n = this.sm.dirtyCount();
    if (!n) return this.close();
    this.confirm({ title: 'تعديلات غير محفوظة', text: 'عندك ' + n + ' تعديل غير محفوظ. تقدر تغلق اللوحة — المسودة تبقى محفوظة على جهازك لين ترجع.', ok: 'إغلاق', danger: false }).then(y => { if (y) this.close(); });
  }
  loadAll() {
    this.ready = false; this.loadError = null;
    ConfigurationService.bootstrap().then(boot => {
      this.sm.load(boot, (B.controller.user() || {}).uid); this.games = this.discover(boot.games); this.ready = true;
      return this.hist.load().catch(() => []);
    }).then(() => { this.ready = true; this.render(this._first ? 'soft' : 'first'); this.updateStatus(); this.updateSavebar(); }, e => { this.loadError = e; this.render('soft'); });
  }
  discover(games) {
    // كل ألعاب الموقع: سجل البطاقات الفعلي في الصفحة (.gcard[data-tag]) + ما يعلنه الخادم من حقول موصولة. اللعبة بلا حقول تظهر «غير قابلة للتخصيص بعد».
    // بعض بطاقات الموقع تحمل وسماً مختلفاً عن وسم الإعدادات الموصولة (نفس اللعبة) — نوحّدها.
    const ALIAS = { rou: 'roulette', ll: 'lastletter', wai: 'whoami', tmr: 'timer', cw: 'countrywar', pgs: 'priceguess', cs: 'crownsteal', lsc: 'letterscramble', rw: 'reverseword' };
    const seen = {}, out = [];
    $all('.gcard[data-tag]').forEach(c => {
      const raw = c.getAttribute('data-tag'), tag = ALIAS[raw] || raw; if (!tag || seen[tag] || tag.indexOf('__') === 0) return; seen[tag] = 1;
      const nm = c.querySelector('.gcard-name'), ds = c.querySelector('.gcard-desc'), g = games[tag];
      out.push({ tag, name: (nm && nm.textContent.trim()) || (g && g.name) || tag, desc: c.getAttribute('data-short') || (ds && ds.textContent.trim()) || (g && g.desc) || '', fields: g ? g.fields.length : 0 });
    });
    Object.keys(games).forEach(t => { if (seen[t] || t.indexOf('__') === 0) return; out.push({ tag: t, name: games[t].name, desc: games[t].desc || '', fields: games[t].fields.length }); });
    return out.sort((a, b) => (b.fields > 0) - (a.fields > 0));
  }
  onSm(w) {
    if (w === 'state' || w === 'drafts') { this.updateStatus(); this.updateSavebar(); }
    if (w === 'saved') { this.toast('تم الحفظ — يُطبَّق من الراوند التالي.', 'ok'); this.hist.load(this.histTag).then(() => this.soft(true)); this.updateStatus(); this.updateSavebar(); }
    if (w === 'conflict') this.toast(errMsg({ code: 'conflict' }) + '. حدّثناها، راجع تعديلاتك.', 'err');
    if (w === 'error') this.toast(errMsg(this.sm.lastError), 'err');
    if (w === 'drafts') this.soft();
  }
  /* ---------- البناء ---------- */
  build() {
    const r = document.createElement('div'); r.className = 'bm'; r.id = 'batmish-root'; r.setAttribute('dir', 'rtl'); r.setAttribute('lang', 'ar'); r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true'); r.setAttribute('aria-label', 'BATMISH — لوحة التحكم');
    r.innerHTML = BatmishAtmosphere.html() + '<div class="bm-boot"><div class="bm-boot-line"></div><div class="bm-boot-txt"><div>&gt; الاتصال بكهف الخفاش ........ تم</div><div>&gt; الستريمر @' + STREAMER + ' ... تم التحقق</div><div>&gt; وحدات الإعدادات ..... تعمل</div><div>&gt; أهلاً بك في غوثام</div></div></div>' +
      BatmishHeader.html() + BatmishNavigation.html() + '<div class="bm-scrim" data-act="menu"></div>' +
      '<main class="bm-main bm-scroll" id="bm-main"><div class="bm-view" id="bm-view"></div>' +
      '<div class="bm-savebar bm-plate" id="bm-savebar"><div class="bm-savebar-in"><div class="msg" id="bm-savebar-msg"></div><div class="act" id="bm-savebar-act"></div></div></div></main>' +
      BatmishMobileNavigation.html() + '<div class="bm-toasts" id="bm-toasts" aria-live="polite"></div>';
    document.body.appendChild(r); this.root = r;
    r.addEventListener('click', e => this.onClick(e)); r.addEventListener('input', e => this.onInput(e)); r.addEventListener('change', e => this.onChange(e));
    r.addEventListener('keydown', e => this.onKey(e));
    let raf = 0;
    r.addEventListener('pointermove', e => {
      if (raf) return; const x = e.clientX, y = e.clientY, t = e.target; raf = requestAnimationFrame(() => {
        raf = 0; const at = $('.bm-atmo', r); if (at) { at.style.setProperty('--px', (x / innerWidth * 2 - 1).toFixed(3)); at.style.setProperty('--py', (y / innerHeight * 2 - 1).toFixed(3)); }
        const pl = t.closest && t.closest('.bm-plate'); if (pl) { const b = pl.getBoundingClientRect(); pl.style.setProperty('--mx', ((x - b.left) / b.width).toFixed(3)); pl.style.setProperty('--my', ((y - b.top) / b.height).toFixed(3)); }
      });
    });
    document.addEventListener('keydown', this._esc = e => { if (e.key !== 'Escape' || !this.root.classList.contains('is-open')) return; if ($('.bm-modal', this.root)) return; if (this.root.classList.contains('is-nav')) { this.root.classList.remove('is-nav'); return; } this.requestClose(); });
    document.addEventListener('focusin', this._trap = e => { if (this.root.classList.contains('is-open') && !this.root.contains(e.target) && !e.target.closest('.bm-warp')) { const f = $('.bm-nav-item', this.root); if (f) f.focus(); } });
    if (window.matchMedia && matchMedia('(max-width:860px)').matches) r.classList.add('is-calm');
  }
  /* ---------- مساعدات بيانات ---------- */
  gameInfo(tag) { for (const g of this.games) if (g.tag === tag) return g; const g = this.sm.games[tag]; return g ? { tag, name: g.name, desc: g.desc, fields: g.fields.length } : null; }
  gameName(tag) { const g = this.gameInfo(tag); return g ? g.name : tag; }
  totalFields() { let n = 0; for (const t in this.sm.games) if (t.indexOf('__') !== 0) n += this.sm.games[t].fields.length; return n; }
  countTag(tag) { const g = this.sm.games[tag]; return g ? g.fields.length : 0; }
  countCats(cats) { let n = 0; for (const t in this.sm.games) { if (t.indexOf('__') === 0) continue; this.sm.games[t].fields.forEach(f => { if (cats.indexOf(f.cat) >= 0) n++; }); } return n; }
  autoFields() { const out = []; for (const t in this.sm.games) { if (t.indexOf('__') === 0) continue; this.sm.games[t].fields.forEach(f => { if (AUTO_RE.test(f.key)) out.push({ tag: t, f }); }); } return out; }
  fieldsOf(cats) { const out = []; for (const t in this.sm.games) { if (t.indexOf('__') === 0) continue; const fl = this.sm.games[t].fields.filter(f => cats.indexOf(f.cat) >= 0); if (fl.length) out.push({ tag: t, fields: fl }); } return out; }
  /* ---------- التنقل والعرض ---------- */
  go(view, arg) {
    if (view === 'game') { if (this.view !== 'game' || this.arg !== arg) this.tab = 'GENERAL'; }
    this.view = view; this.arg = arg || null; this.root.classList.remove('is-nav');
    if (view === 'history' && this.ready) this.hist.load(this.histTag).then(() => this.render('nav'), () => this.render('nav')); else this.render('nav');
  }
  crumb() { const v = this.view === 'game' ? 'db' : this.view, n = NAV_BY[v]; return this.view === 'game' ? ['قاعدة الألعاب', this.gameName(this.arg)] : [n[1], n[2]]; }
  activeNav() { return this.view === 'game' ? 'db' : this.view; }
  render(mode) {
    const main = $('#bm-main', this.root), v = $('#bm-view', this.root); if (!v) return;
    let html;
    if (this.loadError) html = this.vError(); else if (!this.ready) html = this.vSkeleton();
    else { const fn = { cmd: 'vCmd', db: 'vDb', game: 'vGame', settings: 'vSettings', round: 'vRound', players: 'vPlayers', stream: 'vStream', balance: 'vBalance', av: 'vAv', auto: 'vAuto', presets: 'vPresets', history: 'vHistory' }[this.view]; html = this[fn](); }
    const scroll = main.scrollTop;
    v.classList.remove('is-in', 'is-flip'); v.innerHTML = html;
    if (mode === 'nav' || mode === 'first') {
      Array.prototype.forEach.call(v.children, (el, i) => el.style.setProperty('--i', Math.min(i, 10))); void v.offsetWidth; v.classList.add('is-in'); if (mode === 'nav' && this.lastView && this.lastView !== this.view) v.classList.add('is-flip');
      main.scrollTop = 0;
    } else main.scrollTop = scroll;
    this.lastView = this.view;
    const act = this.activeNav();
    $all('.bm-nav-item', this.root).forEach(b => { const on = b.getAttribute('data-nav') === act; if (on && !b.classList.contains('is-active')) { b.classList.add('is-active'); } else if (!on) b.classList.remove('is-active'); b.setAttribute('aria-current', on ? 'page' : 'false'); });
    $all('.bm-mnav button[data-nav]', this.root).forEach(b => b.classList.toggle('is-active', b.getAttribute('data-nav') === act));
    const c = this.crumb(); $('#bm-crumb', this.root).textContent = c[1]; $('#bm-crumb-en', this.root).textContent = c[0];
    this.updateStatus(); this.updateSavebar();
    if (this.view === 'av') this.updateMixer();
    this._first = true;
  }
  soft(flash) {
    const keys = this.sm.lastSaved.slice(); this.render('soft');
    if (flash) keys.forEach(fk => $all('.bm-fp[data-fk="' + fk + '"]', this.root).forEach(el => { el.classList.add('is-flash'); setTimeout(() => el.classList.remove('is-flash'), 1100); }));
  }
  panel(inner, cls) { return '<div class="bm-plate bm-box ' + (cls || '') + '"><i class="bm-glow"></i>' + inner + '</div>'; }
  empty(icon, title, text, extra) { return this.panel('<div class="bm-empty">' + ic(icon) + '<h4>' + esc(title) + '</h4><p>' + text + '</p>' + (extra || '') + '</div>'); }
  vSkeleton() { return '<div class="bm-pagehead"><div><span class="bm-eyebrow">جارٍ تحميل الوحدات</span><h2>BATMISH</h2></div></div><div class="bm-gamegrid">' + [1, 2, 3, 4, 5, 6].map(() => '<div class="bm-skel"></div>').join('') + '</div>'; }
  vError() { return this.empty('warn', 'تعذّر الاتصال', errMsg(this.loadError), '<button type="button" class="bm-btn b-prime" data-act="retry">إعادة المحاولة</button>'); }
  pageHead(en, ar, desc, act) { return '<div class="bm-pagehead"><div><span class="bm-eyebrow">' + en.eyebrow + '</span><h2>' + en.title + '</h2><p>' + desc + '</p></div>' + (act ? '<div class="act">' + act + '</div>' : '') + '</div>'; }
  fieldsByGame(rows) {
    return rows.map(r => '<div class="bm-gname"><span class="gl">' + glyph(r.tag) + '</span><h4>' + esc(this.gameName(r.tag)) + '</h4><span class="bm-tag">' + r.fields.length + '</span><span class="ln"></span><button type="button" class="bm-btn b-ghost b-sm" data-game="' + r.tag + '"><span class="en">فتح الوحدة</span></button></div><div class="bm-fields">' +
      r.fields.map(f => BatmishSettingsPanel.html(this.sm, this.errs, r.tag, f)).join('') + '</div>').join('');
  }
  /* ---------- الصفحات ---------- */
  vCmd() { return BatmishCommandCenter.html(this); }
  vDb() { return BatmishGameArchive.html(this); }
  vGame() { return BatmishGameSettings.html(this, this.arg); }
  vSettings() {
    const q = this.sq.trim().toLowerCase(), cat = this.scat, rows = [];
    for (const t in this.sm.games) { if (t.indexOf('__') === 0) continue; const gi = this.gameInfo(t);
      const fl = this.sm.games[t].fields.filter(f => (cat === 'all' || f.cat === cat) && (!q || (f.label + ' ' + f.hint + ' ' + f.key + ' ' + (gi ? gi.name : '')).toLowerCase().indexOf(q) >= 0)); if (fl.length) rows.push({ tag: t, fields: fl }); }
    const cats = ['all', 'round', 'players', 'difficulty', 'scoring', 'balance'];
    const chips = cats.map(c => '<button type="button" class="bm-chip" data-scat="' + c + '" aria-pressed="' + (cat === c) + '">' + (c === 'all' ? 'الكل' : (CAT_INFO[c] || [c, c])[1]) + '</button>').join('');
    const total = rows.reduce((n, r) => n + r.fields.length, 0);
    return this.pageHead({ eyebrow: 'مستكشف المعاملات الشامل', title: 'إعدادات الألعاب' }, '', 'كل إعدادات كل الألعاب في مكان واحد، قابلة للبحث والتصفية.') +
      '<div class="bm-arch-bar bm-plate"><i class="bm-glow"></i><div class="bm-arch-row"><div class="bm-search">' + ic('search') + '<input class="bm-input" data-sq type="search" value="' + esc(this.sq) + '" placeholder="ابحث في الإعدادات…" aria-label="بحث في الإعدادات" autocomplete="off"></div></div><div class="bm-arch-row"><div class="bm-chips">' + chips + '</div></div><div class="bm-count"><span><b>' + total + '</b> معامل</span><span><b>' + rows.length + '</b> لعبة</span></div></div>' +
      (rows.length ? this.fieldsByGame(rows) : this.empty('search', 'لا معاملات مطابقة', 'ما فيه إعدادات تطابق بحثك.'));
  }
  vRound() {
    const rows = this.fieldsByGame(this.fieldsOf(['round'])), n = this.countCats(['round']);
    const mods = this.fieldsOf(['round']).reduce((a, r) => a + r.fields.filter(f => this.sm.isModified(r.tag, f.key)).length, 0);
    const st = [['التجهيز', 'اللعبة جاهزة', 'bolt'], ['بداية الراوند', 'تُقرأ القيم المحفوظة', 'play', 1], ['اللعب', 'الراوند يعمل بقيمه', 'stream'], ['الإقصاء', 'إقصاء اللاعبين', 'skull'], ['النتيجة', 'إعلان الفائز', 'star'], ['التالي', 'حفظ جديد يسري هنا', 'round']];
    const pipe = '<div class="bm-pipe bm-plate"><i class="bm-glow"></i><div class="bm-pipe-h"><span class="bm-eyebrow">مسار الراوند · لقطة عند البداية</span><span class="bm-tag t-sig">القيم تُثبَّت عند بداية الراوند</span></div><div class="bm-pipe-t" style="--n:' + st.length + '">' +
      st.map(s => '<div class="bm-stage' + (s[3] ? ' is-key' : '') + '"><span class="nd">' + ic(s[2]) + '</span><b>' + s[0] + '</b><small>' + s[1] + '</small></div>').join('') + '</div></div>';
    const kp = '<div class="bm-kpis"><div class="bm-kpi bm-plate"><i class="bm-glow"></i><span class="v">' + n + '</span><span class="l"><span class="en">إعدادات الجولة</span>إعداد توقيت وجولات</span></div><div class="bm-kpi bm-plate"><i class="bm-glow"></i><span class="v">' + mods + '</span><span class="l"><span class="en">مخصصة</span>مخصصة حالياً</span></div><div class="bm-kpi bm-plate"><i class="bm-glow"></i><span class="v">' + this.fieldsOf(['round']).length + '</span><span class="l"><span class="en">الألعاب</span>ألعاب لها إعدادات جولة</span></div></div>';
    return this.pageHead({ eyebrow: 'مراقبة الجولات', title: 'التحكم بالجولات' }, '', 'مدد الجولات والمحاولات والعدّادات. أي حفظ يسري من الراوند التالي ولا يلمس راوندًا جاريًا.') + pipe + kp + rows;
  }
  vPlayers() {
    const rows = this.fieldsOf(['players']); let on = 0, tot = 0, uses = 0, un = 0;
    rows.forEach(r => r.fields.forEach(f => { if (f.key === 'revivalEnabled') { tot++; if (this.sm.value(r.tag, f.key)) on++; } if (f.key === 'revivalMaxUses') { uses += this.sm.value(r.tag, f.key); un++; } }));
    const rr = rng(5); let dots = ''; for (let i = 0; i < 14 * 5; i++) { const x = rr(); dots += '<i class="' + (x < .55 ? 'a' : x < .8 ? 'e' : x < .9 ? 'r' : '') + '"></i>'; }
    const mon = '<div class="bm-mon bm-plate"><i class="bm-glow"></i><div class="screen"><div class="scan"></div><div class="dots">' + dots + '</div><div class="leg"><span>■ في اللعب</span><span>■ مُقصى</span><span>■ مُنعَش</span></div></div><div class="bm-flow">' +
      [['01', 'يُقصى', 'اللاعب يخرج من الراوند'], ['02', 'هدية', 'يرسل هدية عملات أثناء البث'], ['03', 'يُنعَش', 'يرجع للعبة فوراً'], ['04', 'الحد', 'حتى حد الإنعاش المسموح بالراوند']].map(s => '<div class="st"><span class="mk">' + s[0] + '</span><div><b class="en" style="font-size:12px">' + s[1] + '</b><small>' + s[2] + '</small></div></div>').join('') + '</div></div>';
    const kp = '<div class="bm-kpis"><div class="bm-kpi bm-plate"><i class="bm-glow"></i><span class="v">' + on + '<small>/' + tot + '</small></span><span class="l"><span class="en">الإنعاش مفعّل</span>ألعاب الإنعاش فيها مفعّل</span></div><div class="bm-kpi bm-plate"><i class="bm-glow"></i><span class="v">' + (un ? (uses / un).toFixed(1) : '—') + '</span><span class="l"><span class="en">متوسط مرات الإنعاش</span>متوسط مرات الإنعاش</span></div></div>';
    return this.pageHead({ eyebrow: 'مراقبة اللاعبين', title: 'تجربة اللاعبين' }, '', 'ما يخص اللاعبين: الإنعاش وإعادة الانضمام وعدد المرات المسموحة. الشاشة أدناه رسم توضيحي للمخطط.') + mon + kp + this.fieldsByGame(rows);
  }
  vStream() {
    const wave = '<div class="wave"><svg viewBox="0 0 600 90" preserveAspectRatio="none"><path class="flat" d="M0 45H600"/><path d="M0 45H180l8-26 10 52 10-40 8 14H600" opacity=".25"/></svg></div>';
    const dish = '<div class="dish"><svg viewBox="0 0 230 200"><path d="M60 170h110M115 170v-54"/><path d="M70 116a64 64 0 0 1 90-62l-18 38z"/><circle cx="118" cy="88" r="3" fill="currentColor"/><g class="wv"><path d="M150 60a60 60 0 0 1 36 40"/></g><g class="wv"><path d="M164 44a84 84 0 0 1 52 60"/></g><g class="wv"><path d="M178 28a108 108 0 0 1 66 78"/></g></svg></div>';
    return this.pageHead({ eyebrow: 'قنوات التواصل', title: 'تفاعل البث' }, '', 'واجهة اتصالات البث. هنا ستظهر إعدادات تفاعل الجمهور فور ربطها بمنطق الألعاب.') +
      '<div class="bm-comms bm-plate"><i class="bm-glow"></i><div><span class="bm-tag t-warn">في الانتظار · لا قنوات موصولة</span><h3 style="margin:14px 0 6px;font-family:var(--bm-f-ar);font-size:22px">لا توجد إعدادات تفاعل موصولة بعد</h3><p class="bm-sub" style="margin:0;max-width:56ch">لا توجد حاليًا إعدادات تفاعل (رسائل بداية الجولة وغيرها) موصولة بمنطق الألعاب، فنعرض ذلك بصراحة بدل تزييف إعدادات لا تعمل.</p>' + wave +
      '<div class="bm-chan"><span class="bm-tag t-ok">الربط · @' + STREAMER + '</span><span class="bm-tag">الشات · غير موصول</span><span class="bm-tag">رسائل الجولة · غير موصولة</span></div></div>' + dish + '</div>' +
      '<div class="bm-note">' + ic('info') + '<div>الإنعاش عبر الهدايا يظهر حاليًا ضمن <b>تجربة اللاعبين</b> لأنه موصول فعليًا بمنطق الألعاب.</div></div>';
  }
  vBalance() {
    const sm = this.sm, games = this.games, rows = this.fieldsOf(['scoring', 'balance', 'difficulty']);
    const max = Math.max(1, ...games.map(g => g.fields));
    const bars = games.map(g => { const m = sm.modifiedCount(g.tag); return '<div class="r"><span>' + esc(g.name) + '</span><div class="tr"><i class="' + (m ? 'y' : '') + '" style="width:' + (Math.max(m ? 6 : 0, m / max * 100)) + '%"></i></div><span class="v">' + m + '/' + g.fields + '</span></div>'; }).join('');
    const cc = {}; let tot = 0; games.forEach(g => (sm.games[g.tag] ? sm.games[g.tag].fields : []).forEach(f => { cc[f.cat] = (cc[f.cat] || 0) + 1; tot++; }));
    const col = { round: '#8FB4E6', players: '#A39BE0', balance: '#E5C84B', scoring: '#C3CEDF', difficulty: '#5279A9' }; let off = 0; const C = 2 * Math.PI * 54;
    const arcs = Object.keys(cc).map(k => { const len = cc[k] / tot * C; const s = '<circle cx="75" cy="75" r="54" stroke="' + (col[k] || '#27364A') + '" stroke-dasharray="' + Math.max(0, len - 2).toFixed(1) + ' ' + C.toFixed(1) + '" stroke-dashoffset="' + (-off).toFixed(1) + '"/>'; off += len; return s; }).join('');
    const leg = Object.keys(cc).map(k => '<div><i style="background:' + (col[k] || '#27364A') + '"></i>' + (CAT_INFO[k] ? CAT_INFO[k][1] : k) + '<b>' + cc[k] + '</b></div>').join('');
    let tOn = 0, tAll = 0; games.forEach(g => (sm.games[g.tag] ? sm.games[g.tag].fields : []).forEach(f => { if (f.type === 'toggle') { tAll++; if (sm.value(g.tag, f.key)) tOn++; } }));
    const ana = '<div class="bm-ana"><div class="bm-box bm-plate"><i class="bm-glow"></i><h5>التخصيص حسب اللعبة</h5><div class="bm-hbar">' + bars + '</div></div><div class="bm-box bm-plate"><i class="bm-glow"></i><h5>توزيع المعاملات</h5><div class="bm-donut"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="54" stroke="rgba(169,182,200,.1)"/>' + arcs + '</svg><div class="bm-legend">' + leg + '</div></div>' +
      '<div class="bm-hbar" style="margin-top:18px"><div class="r" style="grid-template-columns:104px minmax(0,1fr) 46px"><span>المفاتيح المفعّلة</span><div class="tr"><i style="width:' + (tAll ? tOn / tAll * 100 : 0) + '%"></i></div><span class="v">' + tOn + '/' + tAll + '</span></div></div></div></div>';
    return this.pageHead({ eyebrow: 'وحدة التحليل', title: 'موازنة الألعاب' }, '', 'النقاط والصعوبة والحصانة والمضاعفات، مع قراءة سريعة لمدى تخصيص كل لعبة.') + ana + this.fieldsByGame(rows);
  }
  vAv() {
    const f = this.sm.games.__site.fields, row = f.map(x => BatmishSettingsPanel.html(this.sm, this.errs, '__site', x)).join('');
    const bars = [...Array(34)].map((_, i) => '<i style="--h:' + (22 + Math.round(Math.abs(Math.sin(i * 1.7) * 78))) + '%;--d:' + (0.7 + (i % 7) * .17).toFixed(2) + 's;animation-delay:-' + ((i % 9) * .13).toFixed(2) + 's"></i>').join('');
    let vu = ''; for (let i = 0; i < 24; i++) vu += '<i></i>';
    return this.pageHead({ eyebrow: 'وحدة الصوت والمرئيات', title: 'الصوت والمرئيات' }, '', 'تحكم مركزي بصوت المؤثرات وكثافة الحركة البصرية في ألعاب الصفحة الرئيسية.') +
      '<div class="bm-mixer bm-plate"><i class="bm-glow"></i><div><span class="bm-eyebrow">ناقل الصوت الرئيسي</span><div class="bm-eq" id="bm-eq" style="margin-top:14px">' + bars + '</div></div><div class="bm-vu" id="bm-vu"><div class="row">' + vu + '</div><div class="vl"><span>-∞</span><span id="bm-vu-n" class="mono">100%</span><span>0dB</span></div></div></div>' +
      '<div class="bm-note">' + ic('info') + '<div>يغطي ألعاب الصفحة الرئيسية التي تستخدم WebAudio فقط — ليس ألعاب 3D داخل iframe ولا عناصر الفيديو.</div></div><div class="bm-fields">' + row + '</div>';
  }
  updateMixer() {
    const sm = this.sm; if (!sm.games.__site) return; const vol = sm.value('__site', 'masterVolume'), mute = sm.value('__site', 'muteEffects');
    const eq = $('#bm-eq', this.root), vu = $('#bm-vu', this.root); if (!eq || !vu) return;
    eq.classList.toggle('is-mute', !!mute); const lvl = mute ? 0 : Math.round(vol / 100 * 24);
    $all('.row i', vu).forEach((i, k) => { i.className = k < lvl ? (k > 19 ? 'on hot' : 'on') : ''; }); $('#bm-vu-n', this.root).textContent = mute ? 'مكتوم' : vol + '%';
    eq.style.opacity = mute ? .5 : (.35 + vol / 100 * .65);
  }
  vAuto() {
    const by = {}; this.autoFields().forEach(x => (by[x.tag] = by[x.tag] || []).push(x.f));
    const tags = Object.keys(by);
    return this.pageHead({ eyebrow: 'الوحدات الموصولة', title: 'الأتمتة' }, '', 'السلوكيات التلقائية الموجودة فعلاً (مهلات، تمرير الدور، الإنعاش) القابلة للضبط، مرتبة كوحدات متصلة.') +
      '<div class="bm-note">' + ic('info') + '<div>محرّك قواعد «إذا X فافعل Y» غير مبني بعد — لا توجد نقاط ربط آمنة داخل الألعاب. المعروض هنا سلوكيات حقيقية فقط.</div></div>' +
      '<div class="bm-chain">' + tags.map(t => '<div class="bm-modw"><span class="nd"></span><div class="bm-mod bm-plate"><i class="bm-glow"></i><div class="bm-mod-h"><span class="gl">' + glyph(t) + '</span><h4>' + esc(this.gameName(t)) + '</h4><span class="bm-tag">' + by[t].length + ' سلوك</span><span class="sp"></span><button type="button" class="bm-btn b-ghost b-sm" data-game="' + t + '"><span class="en">فتح الوحدة</span></button></div><div class="bm-fields">' + by[t].map(f => BatmishSettingsPanel.html(this.sm, this.errs, t, f)).join('') + '</div></div></div>').join('') + '</div>';
  }
  vPresets() {
    const sm = this.sm, tags = this.games.map(g => g.tag); if (!this.presetTag || tags.indexOf(this.presetTag) < 0) this.presetTag = tags[0];
    const tag = this.presetTag, list = this.presets.forGame(tag), def = sm.defaultPresets[tag];
    const chips = tags.map(t => { const n = this.presets.forGame(t).length; return '<button type="button" class="bm-chip" data-ptag="' + t + '" aria-pressed="' + (t === tag) + '">' + esc(this.gameName(t)) + '<span class="n">' + n + '</span></button>'; }).join('');
    const form = '<div class="bm-pbar"><input class="bm-input" id="bm-pname" maxlength="40" placeholder="اسم المجموعة الجديدة (من إعدادات اللعبة المحفوظة)" aria-label="اسم المجموعة" style="flex:1 1 260px"><button type="button" class="bm-btn b-prime" data-act="newpreset">' + ic('presets') + 'إنشاء مجموعة</button></div>';
    const cards = list.length ? '<div class="bm-pgrid">' + list.map(p => {
      const ks = Object.keys(p.values), vals = ks.map(k => { const f = sm.field(tag, k); return f && f.type === 'number' ? '<i style="height:' + Math.max(12, BatmishTacticalControls.pct(f, p.values[k])) + '%"></i>' : '<i style="height:' + (f && f.type === 'toggle' ? (p.values[k] ? 100 : 30) : 60) + '%"></i>'; }).join('');
      return '<div class="bm-pm bm-plate' + (def === p.id ? ' is-def' : '') + '"><i class="bm-glow"></i><h4>' + esc(p.name) + (def === p.id ? '<span class="bm-tag t-sig">الافتراضية</span>' : '') + '</h4><div class="vals">' + (vals || '<span class="m">لا قيم مخصصة</span>') + '</div><div class="m">' + ks.length + ' إعداد مخصص · ' + ago(p.updatedAt) + '</div><div class="acts">' +
        '<button type="button" class="bm-btn b-prime b-sm" data-presetact="apply" data-id="' + p.id + '">' + ic('play') + 'تطبيق</button>' +
        [['overwrite', 'save', 'تحديث'], ['rename', 'edit', 'تسمية'], ['duplicate', 'copy', 'نسخ']].map(a => '<button type="button" class="bm-btn b-ghost b-sm" data-presetact="' + a[0] + '" data-id="' + p.id + '">' + ic(a[1]) + a[2] + '</button>').join('') +
        '<button type="button" class="bm-btn b-ghost b-sm" data-presetact="default" data-id="' + p.id + '"' + (def === p.id ? ' disabled' : '') + '>' + ic('star') + 'افتراضية</button><button type="button" class="bm-btn b-ghost b-danger b-sm b-icon" data-presetact="delete" data-id="' + p.id + '" aria-label="حذف">' + ic('trash') + '</button></div></div>';
    }).join('') + '</div>' : this.empty('presets', 'لا توجد وحدات إعدادات', 'ما أنشأت مجموعات للعبة هذي بعد. عدّل إعداداتها واحفظها ثم أنشئ مجموعة.');
    return this.pageHead({ eyebrow: 'محفوظات الإعدادات', title: 'المجموعات' }, '', 'المجموعة تحفظ تخصيصك للعبة واحدة فقط، وتطبيقها لا يمس إعدادات أي لعبة ثانية.') +
      '<div class="bm-chips bm-scroll" style="margin-bottom:16px;flex-wrap:wrap">' + chips + '</div>' + form + cards;
  }
  vHistory() {
    const sm = this.sm, items = this.hist.items.filter(e => !this.histTag || e.tag === this.histTag);
    const sel = '<select class="bm-input" data-histtag aria-label="تصفية حسب اللعبة" style="max-width:260px"><option value="">كل الألعاب</option>' + Object.keys(sm.games).map(t => '<option value="' + t + '"' + (t === this.histTag ? ' selected' : '') + '>' + esc(this.gameName(t)) + '</option>').join('') + '</select>';
    const bar = '<div class="bm-pbar">' + sel + '<button type="button" class="bm-btn b-ghost" data-act="histrefresh">' + ic('reset') + 'تحديث</button>' + (this.histTag && sm.customizedCount(this.histTag) ? '<button type="button" class="bm-btn b-ghost b-danger" data-act="restoregame">' + ic('reset') + 'استرجاع افتراضي اللعبة</button>' : '') + '</div>';
    const stAr = { saved: 'محفوظ', reset: 'إعادة', reverted: 'تراجع' }; let lastDay = '';
    const rows = items.map(e => { const f = sm.field(e.tag, e.key), dk = dayKey(e.ts); let h = ''; if (dk !== lastDay) { lastDay = dk; h = '<div class="bm-datehead">' + dk + '<span style="flex:1;max-width:80px;height:1px;background:var(--bm-line-hi)"></span></div>'; }
      return h + '<div class="bm-tlw' + (e.reverted ? ' is-rev' : '') + '"><span class="nd"></span><div class="bm-tle bm-plate' + (e.reverted ? ' is-rev' : '') + '"><i class="bm-glow"></i><div class="w"><b>' + esc(this.gameName(e.tag)) + ' › ' + esc(shortLabel(f, e.key)) + '</b><small>' + clock(e.ts) + ' · ' + ago(e.ts) + (e.preset ? ' · ' + esc(e.preset) : '') + ' · <span class="en">' + (stAr[e.status] || e.status) + (e.reverted ? ' · تم التراجع عنه لاحقاً' : '') + '</span></small></div>' +
        '<span class="bm-diff"><s>' + esc(fmtVal(f, e.old)) + '</s><em>→</em><i>' + esc(fmtVal(f, e.new)) + '</i></span><button type="button" class="bm-btn b-ghost b-sm" data-revert="' + e.id + '"' + (e.reverted || !f ? ' disabled' : '') + '>' + ic('reset') + 'تراجع</button></div></div>'; }).join('');
    return this.pageHead({ eyebrow: 'الخط الزمني للعمليات', title: 'السجل' }, '', 'التراجع يرجّع إعداداً لقيمته القديمة للراوندات القادمة فقط، ولا يلمس جولات انتهت.') + bar +
      (items.length ? '<div class="bm-tl">' + rows + '</div>' : this.empty('history', 'لا توجد عمليات بعد', 'لسا ما عدّلت أي إعداد. كل تعديل تحفظه يظهر هنا.'));
  }

  /* ---------- الحالة وشريط الحفظ ---------- */
  updateStatus() {
    const s = this.sm, el = $('#bm-status', this.root), t = $('#bm-status-t', this.root); if (!el) return;
    const map = { saved: ['تم الحفظ', 'saved'], dirty: ['غير محفوظ · ' + s.dirtyCount(), 'dirty'], saving: ['جارٍ الحفظ', 'saving'], error: ['فشل الحفظ', 'error'] }, m = map[s.saveState] || map.saved;
    el.setAttribute('data-s', m[1]); t.textContent = m[0];
    const rev = $('#bm-foot-rev', this.root); if (rev) rev.textContent = this.ready ? 'فعّال · إصدار ' + s.rev : 'جارٍ التحميل';
    const dot = $all('.bm-nav-dot', this.root); dot.forEach(d => d.remove());
    if (s.dirtyCount()) { const tgt = $('.bm-nav-item[data-nav="' + (this.view === 'game' ? 'db' : (this.view === 'cmd' ? 'db' : this.view)) + '"]', this.root); if (tgt) { const d = document.createElement('i'); d.className = 'bm-nav-dot'; tgt.appendChild(d); } }
  }
  hasBad(tag) { for (const k in this.errs) { if (!this.errs[k]) continue; if (!tag || k.indexOf(tag + '.') === 0) return true; } return false; }
  updateSavebar() {
    const s = this.sm, bar = $('#bm-savebar', this.root); if (!bar) return;
    const scope = this.view === 'game' ? this.arg : null, n = s.dirtyCount(scope), nAll = s.dirtyCount(), bad = this.hasBad(scope), saving = s.saveState === 'saving';
    const shown = this.view === 'game' ? n : nAll;
    bar.classList.toggle('is-on', shown > 0); bar.classList.toggle('is-saving', saving);
    const msg = $('#bm-savebar-msg', this.root), act = $('#bm-savebar-act', this.root);
    msg.innerHTML = '<i></i><span>' + (s.saveState === 'error' ? '<b>فشل الحفظ.</b> مسودتك محفوظة على جهازك. ' : '') + '<b>' + shown + '</b> تعديل غير محفوظ. يُطبَّق من <b>الراوند التالي</b>، والراوند الجاري يكمل بإعداداته.</span>';
    if (act.getAttribute('data-n') === String(shown) + (saving ? 's' : '') + (bad ? 'b' : '') + this.view + s.autosave) return;
    act.setAttribute('data-n', String(shown) + (saving ? 's' : '') + (bad ? 'b' : '') + this.view + s.autosave);
    act.innerHTML = '<label class="bm-auto"><span class="bm-tsw is-sm" style="display:block"><input type="checkbox" data-act="autosave"' + (s.autosave ? ' checked' : '') + ' role="switch" aria-label="حفظ تلقائي"><span class="tsw-body"></span><span class="tsw-lbl on">تشغيل</span><span class="tsw-lbl off">إيقاف</span><span class="tsw-knob"><i></i></span></span>حفظ تلقائي</label>' +
      '<button type="button" class="bm-btn b-ghost" data-act="discard"' + (saving ? ' disabled' : '') + '>' + ic('reset') + 'تجاهل</button>' +
      (this.view === 'game' ? '<button type="button" class="bm-btn b-ghost" data-act="savepreset"' + (bad || saving ? ' disabled' : '') + '>' + ic('presets') + 'حفظ كمجموعة</button>' : '') +
      '<button type="button" class="bm-btn b-prime" data-act="save"' + (bad || saving ? ' disabled' : '') + '>' + ic('save') + '<span>' + (saving ? 'جارٍ الحفظ…' : 'حفظ وتطبيق') + '</span></button>';
  }
  /* ---------- الأحداث ---------- */
  applyField(fk, v, active) {
    const i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), f = this.sm.field(tag, key); if (!f) return;
    const r = ValidationService.check(f, v);
    if (!r.ok) { this.errs[fk] = r.msg; BatmishSettingsPanel.refresh(this.root, this.sm, this.errs, fk); this.updateSavebar(); return; }
    delete this.errs[fk]; this.sm.setDraft(tag, key, r.v);
    $all('.bm-fp[data-fk="' + fk + '"]', this.root).forEach(row => BatmishTacticalControls.sync(row, f, r.v, active));
    BatmishSettingsPanel.refresh(this.root, this.sm, this.errs, fk); this.updateSavebar(); this.updateStatus(); if (tag === '__site') this.updateMixer(); this.refreshHeadMeter();
  }
  refreshHeadMeter() {
    if (this.view !== 'game') return; const tag = this.arg, sm = this.sm, g = sm.games[tag]; if (!g) return;
    const bar = $('.bm-meter .bar', this.root); if (!bar) return;
    bar.innerHTML = g.fields.map(f => '<i class="' + (sm.isDirty(tag, f.key) ? 'un' : sm.isModified(tag, f.key) ? 'on' : '') + '"></i>').join('');
    const b = $('.bm-meter .top b', this.root); if (b) b.textContent = sm.modifiedCount(tag);
    $all('.bm-tab', this.root).forEach(t => { const tb = t.getAttribute('data-tab'), dd = g.fields.some(f => f.tab === tb && sm.isDirty(tag, f.key)); let d = $('.d', t); if (dd && !d) { d = document.createElement('span'); d.className = 'd'; t.appendChild(d); } else if (!dd && d) d.remove(); });
  }
  onInput(e) {
    const t = e.target;
    if (t.matches('[data-q]')) { this.q = t.value; const g = $('#bm-grid', this.root); if (g) g.outerHTML = BatmishGameArchive.grid(this); const c = $('.bm-count', this.root); return; }
    if (t.matches('[data-sq]')) { this.sq = t.value; const pos = t.selectionStart; this.soft(); const n = $('[data-sq]', this.root); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} } return; }
    const fk = t.getAttribute && t.getAttribute('data-k'); if (!fk || t.matches('[data-step]')) return;
    const i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), f = this.sm.field(tag, key); if (!f) return; let v;
    if (f.type === 'toggle') v = !!t.checked;
    else if (f.type === 'number') v = t.value === '' ? NaN : Number(t.value);
    else v = $all('[data-k="' + fk + '"]', t.closest('.bm-fp')).map(x => x.value === '' ? NaN : Number(x.value));
    this.applyField(fk, v, f.type === 'number' && t.matches('[data-n]') ? t : (f.type === 'numberArray' ? t : (f.type === 'number' ? t : null)));
  }
  onChange(e) {
    const t = e.target;
    if (t.matches('[data-act="autosave"]')) { this.sm.setAutosave(t.checked); return; }
    if (t.matches('[data-histtag]')) { this.histTag = t.value; this.hist.load(this.histTag).then(() => this.soft(), er => this.toast(errMsg(er), 'err')); return; }
    if (t.matches('[data-n]')) { const fk = t.getAttribute('data-k'); BatmishSettingsPanel.refresh(this.root, this.sm, this.errs, fk); }
  }
  onKey(e) {
    if (e.key === '/' && this.view === 'db' && !/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { e.preventDefault(); const q = $('[data-q]', this.root); if (q) q.focus(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.bm-gc[data-game]')) { e.preventDefault(); this.go('game', e.target.getAttribute('data-game')); return; }
    if (e.key === 'Enter' && e.target.matches && e.target.matches('#bm-pname')) { this.act('newpreset'); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (this.sm.dirtyCount() && !this.hasBad()) this.act('save'); }
  }
  onClick(e) {
    const t = e.target; let el;
    if ((el = t.closest('[data-nav]'))) { this.go(el.getAttribute('data-nav')); return; }
    if ((el = t.closest('[data-game]'))) { this.go('game', el.getAttribute('data-game')); return; }
    if ((el = t.closest('[data-tab]'))) { if (el.disabled) return; this.tab = el.getAttribute('data-tab'); this.render('soft'); const v = $('#bm-view', this.root); v.classList.add('is-in'); return; }
    if ((el = t.closest('[data-grp]'))) { const k = el.getAttribute('data-grp'), g = el.closest('.bm-grp'); this.xs[k] = !g.classList.contains('is-x'); g.classList.toggle('is-x', this.xs[k]); el.setAttribute('aria-expanded', String(!this.xs[k])); return; }
    if ((el = t.closest('[data-arch]'))) { this.arch = el.getAttribute('data-arch'); this.soft(); return; }
    if ((el = t.closest('[data-status]'))) { this.status = el.getAttribute('data-status'); this.soft(); return; }
    if ((el = t.closest('[data-scat]'))) { this.scat = el.getAttribute('data-scat'); this.soft(); return; }
    if ((el = t.closest('[data-ptag]'))) { this.presetTag = el.getAttribute('data-ptag'); this.soft(); return; }
    if ((el = t.closest('[data-vm]'))) { this.vm = el.getAttribute('data-vm'); try { localStorage.setItem('batmish:vm', this.vm); } catch (er) {} this.soft(); return; }
    if ((el = t.closest('[data-step]'))) {
      const fk = el.getAttribute('data-k'), i = fk.indexOf('.'), tag = fk.slice(0, i), key = fk.slice(i + 1), f = this.sm.field(tag, key); if (!f) return;
      let cur = this.sm.value(tag, key); const inp = $('input[data-n]', el.closest('.bm-fp')); if (inp && inp.value !== '' && isFinite(Number(inp.value))) cur = Number(inp.value);
      const nv = Math.max(f.min, Math.min(f.max, cur + Number(el.getAttribute('data-step')) * BatmishTacticalControls.step(f))); this.applyField(fk, nv, null); return;
    }
    if ((el = t.closest('[data-resetkey]'))) {
      const fk = el.getAttribute('data-resetkey'), i = fk.indexOf('.'); delete this.errs[fk];
      this.run(this.sm.resetKey(fk.slice(0, i), fk.slice(i + 1)), 'تمت إعادة الإعداد للافتراضي.').then(() => { this.soft(); $all('.bm-fp[data-fk="' + fk + '"]', this.root).forEach(r => { r.classList.add('is-rst'); setTimeout(() => r.classList.remove('is-rst'), 800); }); this.hist.load(this.histTag).catch(() => 0); }); return;
    }
    if ((el = t.closest('[data-resetgame]'))) {
      const tag = el.getAttribute('data-resetgame'); this.confirm({ title: 'إعادة اللعبة للافتراضي', text: 'ترجيع كل إعدادات «' + this.gameName(tag) + '» للافتراضي؟ تقدر تتراجع عن أي إعداد من السجل.', ok: 'إعادة', danger: true }).then(y => { if (y) this.run(this.sm.resetGame(tag), 'تمت إعادة اللعبة للافتراضي.').then(() => { this.errs = {}; return this.hist.load(this.histTag).catch(() => 0); }).then(() => this.soft()); }); return;
    }
    if ((el = t.closest('[data-presetact]'))) { this.presetAction(el.getAttribute('data-presetact'), el.getAttribute('data-id')); return; }
    if ((el = t.closest('[data-revert]'))) { this.run(this.hist.revert(el.getAttribute('data-revert')), 'تم التراجع عن التعديل.').then(() => this.hist.load(this.histTag)).then(() => this.soft(), () => 0); return; }
    if ((el = t.closest('[data-act]')) && !el.matches('input')) this.act(el.getAttribute('data-act'));
  }
  act(a) {
    const s = this.sm;
    if (a === 'close') return this.requestClose();
    if (a === 'menu') { this.root.classList.toggle('is-nav'); return; }
    if (a === 'retry') return this.loadAll();
    if (a === 'discard') { s.discard(this.view === 'game' ? this.arg : null); this.errs = {}; this.soft(); return; }
    if (a === 'save') { s.saveAll(); return; }
    if (a === 'savepreset') { this.prompt({ title: 'حفظ كمجموعة', label: 'اسم المجموعة', value: '' }).then(name => { if (name == null) return; const tag = this.arg; this.run(this.presets.create(tag, name, s.effectiveOverrides(tag)), 'تم حفظ المجموعة «' + name + '».'); }); return; }
    if (a === 'newpreset') { const nm = $('#bm-pname', this.root).value.trim(); if (!nm) { this.toast('اكتب اسماً للمجموعة.', 'err'); return; } this.run(this.presets.create(this.presetTag, nm, s.config[this.presetTag] ? clone(s.config[this.presetTag]) : {}), 'تم إنشاء المجموعة.').then(() => this.soft()); return; }
    if (a === 'histrefresh') { this.hist.load(this.histTag).then(() => this.soft(), er => this.toast(errMsg(er), 'err')); return; }
    if (a === 'restoregame') { const tag = this.histTag; this.confirm({ title: 'استرجاع إعدادات اللعبة', text: 'استرجاع إعدادات هذي اللعبة كاملة للافتراضي؟ ما يأثر على جولات انتهت.', ok: 'استرجاع', danger: true }).then(y => { if (y) this.run(this.hist.restoreGame(tag), 'تم استرجاع إعدادات اللعبة.').then(() => this.hist.load(this.histTag)).then(() => this.soft(), () => 0); }); }
  }
  presetAction(op, id) {
    const s = this.sm, p = s.presets[id]; if (!p) return;
    if (op === 'apply') return void this.confirm({ title: 'تطبيق المجموعة', text: 'تطبيق «' + p.name + '» يغيّر إعدادات هذي اللعبة فقط، ويسري من الراوند التالي.', ok: 'تطبيق' }).then(y => { if (y) this.run(this.presets.apply(id), 'تم تطبيق المجموعة.').then(() => this.hist.load().catch(() => 0)).then(() => this.soft()); });
    if (op === 'overwrite') return void this.confirm({ title: 'تحديث المجموعة', text: 'استبدال محتوى «' + p.name + '» بإعدادات اللعبة الحالية المحفوظة؟', ok: 'تحديث' }).then(y => { if (y) this.run(this.presets.overwrite(id, s.config[p.tag] ? clone(s.config[p.tag]) : {}), 'تم تحديث المجموعة.').then(() => this.soft()); });
    if (op === 'rename') return void this.prompt({ title: 'تسمية المجموعة', label: 'الاسم الجديد', value: p.name }).then(n => { if (n != null) this.run(this.presets.rename(id, n), 'تمت التسمية.').then(() => this.soft()); });
    if (op === 'duplicate') return void this.run(this.presets.duplicate(id), 'تم نسخ المجموعة.').then(() => this.soft());
    if (op === 'default') return void this.run(this.presets.setDefault(id), 'صارت المجموعة الافتراضية للعبة.').then(() => this.soft());
    if (op === 'delete') this.confirm({ title: 'حذف المجموعة', text: 'حذف «' + p.name + '» نهائياً؟', ok: 'حذف', danger: true }).then(y => { if (y) this.run(this.presets.remove(id), 'تم الحذف.').then(() => this.soft()); });
  }
  run(p, okMsg) {
    return p.then(r => { if (okMsg) this.toast(okMsg, 'ok'); this.updateStatus(); return r; }, e => {
      if (e && e.code === 'conflict') return this.sm.refresh().then(() => { this.toast(errMsg(e) + '. حدّثناها، أعد المحاولة.', 'err'); });
      this.toast(errMsg(e), 'err');
    });
  }
  /* ---------- حوارات وتنبيهات ---------- */
  modal(html) { const m = document.createElement('div'); m.className = 'bm-modal'; m.innerHTML = '<div class="bm-dlg bm-plate" role="alertdialog">' + html + '</div>'; this.root.appendChild(m); return m; }
  confirm(o) {
    return new Promise(res => {
      const m = this.modal('<h4>' + esc(o.title) + '</h4><p>' + esc(o.text) + '</p><div class="act"><button type="button" class="bm-btn ' + (o.danger ? 'b-danger' : 'b-prime') + '" data-ok>' + esc(o.ok || 'موافق') + '</button><button type="button" class="bm-btn b-ghost" data-no>إلغاء</button></div>');
      const done = v => { m.remove(); res(v); };
      $('[data-ok]', m).addEventListener('click', () => done(true)); $('[data-no]', m).addEventListener('click', () => done(false));
      m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }); m.addEventListener('click', e => { if (e.target === m) done(false); });
      $('[data-no]', m).focus();
    });
  }
  prompt(o) {
    return new Promise(res => {
      const m = this.modal('<h4>' + esc(o.title) + '</h4><p><label for="bm-pin">' + esc(o.label) + '</label></p><input id="bm-pin" class="bm-input" maxlength="40" value="' + esc(o.value || '') + '"><div class="act" style="margin-top:18px"><button type="button" class="bm-btn b-prime" data-ok>حفظ</button><button type="button" class="bm-btn b-ghost" data-no>إلغاء</button></div>');
      const inp = $('#bm-pin', m), done = v => { m.remove(); res(v); };
      $('[data-ok]', m).addEventListener('click', () => { const v = inp.value.trim(); if (v) done(v); else inp.focus(); }); $('[data-no]', m).addEventListener('click', () => done(null));
      m.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.trim(); if (v) done(v); } });
      inp.focus(); inp.select();
    });
  }
  toast(msg, kind) {
    const box = $('#bm-toasts', this.root); const t = document.createElement('div'); t.className = 'bm-toast bm-plate' + (kind === 'err' ? ' is-err' : ''); t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    t.innerHTML = ic(kind === 'err' ? 'warn' : 'check') + '<span>' + esc(msg) + '</span>'; box.appendChild(t); while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 400); }, kind === 'err' ? 5200 : 3200);
  }
}


/* =====================================================================
   [5] الربط بالنظام الحقيقي: زر الإطلاق والانتقال والصلاحية في batmish-core.js (BatmishAccessController).
   هنا فقط واجهة الفتح/الإغلاق. الخادم هو من يقرر الوصول؛ فقدان الصلاحية يغلق اللوحة (close({silent:true})).
   ===================================================================== */
const dash = new Dashboard();
B.onClose = function () { try { const b = B.controller && B.controller.btn; if (b) b.focus({ preventScroll: true }); } catch (e) {} };
B.ui = { open() { ensureFonts(); dash.open(); }, close(o) { dash.close(o); if (o && o.silent) { try { if (typeof toast === 'function') toast('أُغلقت لوحة BATMISH: تأكد من ربط البث. تعديلاتك غير المحفوظة محفوظة كمسودة.'); } catch (e) {} } }, _dash: dash };
function ensureFonts() {
  if (document.getElementById('batmish-fonts')) return;
  const l = document.createElement('link'); l.id = 'batmish-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Oxanium:wght@500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap';
  document.head.appendChild(l);
}
})();
