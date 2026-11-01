/* سجل ألعاب الستريمر لطبقة العمليات: دالة التشغيل، حقول الإعداد، متغير المشاركين، دالة الانضمام/الشات.
 * مُشتق من خريطة الألعاب المستخدمة باختبارات الدمج (tests/bridge/games.js) — يُحدَّث معها. */
window.EHS_OPS_GAMES = [
 {
  "tag": "main",
  "title": "اوجد الكلمة",
  "launch": "launchGame",
  "inputs": {
   "inp-kw": "ادخل",
   "inp-word": "قمر"
  },
  "pmap": "participants",
  "st": "gameStatus",
  "kw": "ادخل",
  "chat": "addChatMsg",
  "join": "joinParticipant",
  "pre": null,
  "connect": "connectTikTok"
 },
 {
  "tag": "gw",
  "title": "خمّن الموضوع",
  "launch": "gwLaunchGame",
  "inputs": {
   "gw-inp-user": "streamer1",
   "gw-inp-kw": "ادخل",
   "gw-inp-word": "زرافة150"
  },
  "pmap": "gwParticipants",
  "st": "gwGameStatus",
  "kw": "ادخل",
  "chat": "gwAddChatMsg",
  "join": "gwJoinParticipant",
  "pre": "gamePlatform['gw']='tiktok'; document.getElementById('gw-mode-ai').checked=false;",
  "connect": "gwConnectTikTok"
 },
 {
  "tag": "battery",
  "title": "الزر المشحون",
  "launch": "launchBattery",
  "inputs": {},
  "pmap": null,
  "st": null,
  "kw": null,
  "chat": "addBatteryChatMsg",
  "join": "batteryApplyCharge",
  "pre": null,
  "connect": "connectBatteryTikTok"
 },
 {
  "tag": "sniper",
  "title": "القناص",
  "launch": "launchSniper",
  "inputs": {
   "sniper-kw": "ادخل"
  },
  "pmap": "sniperParticipants",
  "st": "sniperGameStatus",
  "kw": "ادخل",
  "chat": "addSniperChatMsg",
  "join": "sniperJoinParticipant",
  "pre": null,
  "connect": "connectSniperTikTok"
 },
 {
  "tag": "hz",
  "title": "ضربة الحظ",
  "launch": "launchHz",
  "inputs": {
   "hz-kw": "ادخل"
  },
  "pmap": "hzParticipants",
  "st": "hzGameStatus",
  "kw": "ادخل",
  "chat": "addHzChatMsg",
  "join": "hzJoinParticipant",
  "pre": null,
  "connect": null
 },
 {
  "tag": "rou",
  "title": "دائرة الإقصاء",
  "launch": "launchRoulette",
  "inputs": {
   "rou-kw": "ادخل"
  },
  "pmap": "rouParticipants",
  "st": "rouGameStatus",
  "kw": "ادخل",
  "chat": "addRouChatMsg",
  "join": "rouJoinParticipant",
  "pre": null,
  "connect": "connectRouletteTikTok"
 },
 {
  "tag": "tmr",
  "title": "لعبة التوقيت",
  "launch": "launchTimer",
  "inputs": {
   "tmr-kw": "ادخل",
   "tmr-secret": "5"
  },
  "pmap": "tmrParticipants",
  "st": "tmrGameStatus",
  "kw": "ادخل",
  "chat": "addTmrChatMsg",
  "join": "tmrJoinParticipant",
  "pre": null,
  "connect": "connectTimerTikTok"
 },
 {
  "tag": "bomb",
  "title": "القنبلة المتحركة",
  "launch": "launchBomb",
  "inputs": {
   "bomb-kw": "ادخل"
  },
  "pmap": "new Map((bombApi()?bombApi().getState().players:[]).map(p=>[p.id,p]))",
  "st": "(bombApi()?bombApi().getState().status:'loading')",
  "kw": "ادخل",
  "chat": null,
  "join": "bombJoinParticipant",
  "pre": null,
  "connect": null
 },
 {
  "tag": "box",
  "title": "الصندوق العشوائي",
  "launch": "launchBox",
  "inputs": {
   "box-kw": "ادخل"
  },
  "pmap": "boxParticipants",
  "st": "boxGameStatus",
  "kw": "ادخل",
  "chat": "addBoxChatMsg",
  "join": "boxJoinParticipant",
  "pre": null,
  "connect": "connectBoxTikTok"
 },
 {
  "tag": "cr",
  "title": "لعبة التاج",
  "launch": "launchCr",
  "inputs": {
   "cr-kw": "ادخل"
  },
  "pmap": "crParticipants",
  "st": "crGameStatus",
  "kw": "ادخل",
  "chat": "addCrChatMsg",
  "join": "crJoinParticipant",
  "pre": null,
  "connect": "connectCrTikTok"
 },
 {
  "tag": "mz",
  "title": "المتاهة",
  "launch": "launchMz",
  "inputs": {
   "mz-kw": "ادخل"
  },
  "pmap": "mzParticipants",
  "st": "mzGameStatus",
  "kw": "ادخل",
  "chat": "addMzChatMsg",
  "join": "mzJoinParticipant",
  "pre": null,
  "connect": "connectMzTikTok"
 },
 {
  "tag": "ev",
  "title": "فعالية الستريمر",
  "launch": "launchEv",
  "inputs": {
   "ev-kw": "ادخل"
  },
  "pmap": "evParticipants",
  "st": "evGameStatus",
  "kw": "ادخل",
  "chat": "addEvChatMsg",
  "join": "evJoinParticipant",
  "pre": null,
  "connect": "connectEvTikTok"
 },
 {
  "tag": "ll",
  "title": "آخر حرف",
  "launch": "launchLastLetter",
  "inputs": {
   "ll-kw": "ادخل",
   "ll-startword": "سلام"
  },
  "pmap": "llParticipants",
  "st": "llGameStatus",
  "kw": "ادخل",
  "chat": "addLLChatMsg",
  "join": "llJoinParticipant",
  "pre": null,
  "connect": "connectLLTikTok"
 },
 {
  "tag": "wai",
  "title": "من أنا؟",
  "launch": "launchWhoAmI",
  "inputs": {
   "wai-kw": "ادخل",
   "wai-charname": "نابليون",
   "wai-desc": "قائد فرنسي"
  },
  "pmap": "waiParticipants",
  "st": "waiGameStatus",
  "kw": "ادخل",
  "chat": "waiAddChatMsg",
  "join": "waiJoinParticipant",
  "pre": null,
  "connect": "connectWAITikTok"
 },
 {
  "tag": "ig",
  "title": "خمن الصورة",
  "launch": "launchIG",
  "inputs": {
   "ig-kw": "ادخل"
  },
  "pmap": "igParticipants",
  "st": "igGameStatus",
  "kw": "ادخل",
  "chat": "igAddChatMsg",
  "join": "igJoinParticipant",
  "pre": null,
  "connect": "connectIGTikTok"
 },
 {
  "tag": "rw",
  "title": "عكس الكلمة",
  "launch": "launchReverseWord",
  "inputs": {
   "rw-kw": "ادخل",
   "rw-word": "مدرسة"
  },
  "pmap": "rwParticipants",
  "st": "rwGameStatus",
  "kw": "ادخل",
  "chat": "rwAddChatMsg",
  "join": "rwJoinParticipant",
  "pre": null,
  "connect": "connectRWTikTok"
 },
 {
  "tag": "pgs",
  "title": "تخمين السعر",
  "launch": "launchPriceGuess",
  "inputs": {
   "pgs-kw": "ادخل",
   "pgs-product": "جوال",
   "pgs-price": "1500"
  },
  "pmap": "pgsParticipants",
  "st": "pgsGameStatus",
  "kw": "ادخل",
  "chat": "pgsAddChatMsg",
  "join": "pgsJoinParticipant",
  "pre": null,
  "connect": "connectPGSTikTok"
 },
 {
  "tag": "lsc",
  "title": "ترتيب الحروف",
  "launch": "launchLetterScramble",
  "inputs": {
   "lsc-kw": "ادخل",
   "lsc-word": "برتقال"
  },
  "pmap": "lscParticipants",
  "st": "lscGameStatus",
  "kw": "ادخل",
  "chat": "lscAddChatMsg",
  "join": "lscJoinParticipant",
  "pre": null,
  "connect": "connectLSCTikTok"
 },
 {
  "tag": "wr",
  "title": "سباق الكلمات السريع",
  "launch": "launchWordRace",
  "inputs": {
   "wr-kw": "ادخل",
   "wr-word": "سباق الكلمات"
  },
  "pmap": "wrParticipants",
  "st": "wrGameStatus",
  "kw": "ادخل",
  "chat": "wrAddChatMsg",
  "join": "wrJoinParticipant",
  "pre": null,
  "connect": "connectWRTikTok"
 },
 {
  "tag": "draw",
  "title": "خمن الرسمة",
  "launch": "launchDraw",
  "inputs": {
   "draw-thing": "قطة"
  },
  "pmap": "drawParticipants",
  "st": "drawGameStatus",
  "kw": "مرحبا",
  "chat": "drawAddChatMsg",
  "join": "drawJoinParticipant",
  "pre": null,
  "connect": "connectDrawTikTok"
 },
 {
  "tag": "cw",
  "title": "حرب الدول",
  "launch": "launchCountryWar",
  "inputs": {
   "cw-kw": "ادخل"
  },
  "pmap": "cwParticipants",
  "st": "cwGameStatus",
  "kw": "ادخل",
  "chat": "cwAddChatMsg",
  "join": "cwJoinParticipant",
  "pre": null,
  "connect": "connectCWTikTok"
 },
 {
  "tag": "cs",
  "title": "سرقة التاج",
  "launch": "launchCrownSteal",
  "inputs": {
   "cs-kw": "ادخل"
  },
  "pmap": "csParticipants",
  "st": "csGameStatus",
  "kw": "ادخل",
  "chat": "csAddChatMsg",
  "join": "csJoinParticipant",
  "pre": null,
  "connect": "connectCSTikTok"
 },
 {
  "tag": "findball",
  "title": "أين الكرة",
  "launch": "launchFindball",
  "inputs": {
   "findball-kw": "ادخل"
  },
  "pmap": "findballParticipants",
  "st": "findballGameStatus",
  "kw": "ادخل",
  "chat": "findballAddChatMsg",
  "join": "findballJoinParticipant",
  "pre": null,
  "connect": "connectFindballTikTok"
 },
 {
  "tag": "chairs",
  "title": "الكراسي",
  "launch": "launchChairs",
  "inputs": {
   "chairs-kw": "ادخل"
  },
  "pmap": "chairsParticipants",
  "st": "chairsGameStatus",
  "kw": "ادخل",
  "chat": "chairsAddChatMsg",
  "join": "chairsJoinParticipant",
  "pre": null,
  "connect": "connectChairsTikTok"
 },
 {
  "tag": "tug",
  "title": "شد الحبل",
  "launch": "launchTug",
  "inputs": {
   "tug-team-a-name": "الأحمر",
   "tug-team-b-name": "الأزرق",
   "tug-team-a-kw": "احمر",
   "tug-team-b-kw": "ازرق",
   "tug-pull-kw": "شد"
  },
  "pmap": "new Map([...tugTeamA,...tugTeamB])",
  "st": "tugGameStatus",
  "kw": "احمر",
  "chat": null,
  "join": "tugJoinTeam",
  "pre": null,
  "connect": null
 },
 {
  "tag": "rlgl",
  "title": "إشارة المرور",
  "launch": "launchRlgl",
  "inputs": {
   "rlgl-join-kw": "ادخل",
   "rlgl-move-kw": "امش"
  },
  "pmap": "rlglParticipants",
  "st": "rlglGameStatus",
  "kw": "ادخل",
  "chat": "rlglAddChatMsg",
  "join": "rlglJoinParticipant",
  "pre": null,
  "connect": "connectRlglTikTok"
 },
 {
  "tag": "tt10",
  "title": "تيك 10",
  "launch": "tt10Launch",
  "inputs": {},
  "pmap": "tt10Participants",
  "st": "tt10GameStatus",
  "kw": "مرحبا",
  "chat": null,
  "join": null,
  "pre": null,
  "connect": "tt10ConnectTikTok"
 },
 {
  "tag": "glz",
  "title": "الجسر الزجاجي",
  "launch": "glzLaunch",
  "inputs": {
   "glz-join-kw": "زجاج"
  },
  "pmap": "glzParticipants",
  "st": "glzGameStatus",
  "kw": "زجاج",
  "chat": null,
  "join": "glzAddParticipant",
  "pre": null,
  "connect": "glzConnectTikTok"
 },
 {
  "tag": "volcanic-lands",
  "title": "الأراضي البركانية",
  "launch": "launchVolcanicLands",
  "inputs": {},
  "pmap": null,
  "st": null,
  "kw": null,
  "chat": null,
  "join": null,
  "pre": null,
  "connect": null
 },
 {
  "tag": "cannon",
  "title": "المدفع البشري",
  "launch": "launchCannon",
  "inputs": {
   "cannon-s-kw": "انضم"
  },
  "pmap": "cannonParticipants",
  "st": "cannonStatus",
  "kw": "انضم",
  "chat": null,
  "join": "cannonJoin",
  "pre": null,
  "connect": null
 }
];
