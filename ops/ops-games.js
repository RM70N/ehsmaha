/* سجل ألعاب الستريمر لطبقة العمليات: دالة التشغيل، حقول الإعداد، متغير المشاركين، دالة الانضمام/الشات.
 * مع حقول المختبر (lab) المشتقة من اختبار اللاعب المتأخر. مُشتق من خريطة الألعاب المستخدمة باختبارات الدمج (tests/bridge/games.js) — يُحدَّث معها. */
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
  "connect": "connectTikTok",
  "lab": {
   "isIn": "participants.has(uid)",
   "start": "startRound()",
   "elim": "participants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "keyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": [
    "شمس"
   ],
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "gwConnectTikTok",
  "lab": {
   "isIn": "gwParticipants.has(uid)",
   "start": "gwBeginNewRound()",
   "elim": "gwParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "gwKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectBatteryTikTok",
  "lab": {
   "isIn": "__lateJoin.adapters.battery._in.has(uid)",
   "start": "void 0",
   "elim": null,
   "lobby": "batteryNewRound()",
   "kwVar": null,
   "n": 0,
   "heavy": false,
   "kind": "native",
   "afterJoin": false,
   "play": [],
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "skip": {
    "start": "لعبة بلا زر بدء جولة (شحن مستمر)",
    "late-new": "لا جولة محدّدة تُقبل فيها المشاركة المتأخرة",
    "late-excl": "لا جولة محدّدة",
    "end": "لا إجراء إنهاء راوند"
   }
  }
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
  "connect": "connectSniperTikTok",
  "lab": {
   "isIn": "sniperParticipants.has(uid)",
   "start": "startSniperRound()",
   "elim": "sniperParticipants.delete(uid), sniperEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "sniperKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": true,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": null,
  "lab": {
   "isIn": "hzParticipants.has(uid)",
   "start": "startHzRound()",
   "elim": "hzParticipants.delete(uid), hzEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "hzKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectRouletteTikTok",
  "lab": {
   "isIn": "rouParticipants.has(uid)",
   "start": "startRouletteRound()",
   "elim": "rouParticipants.delete(uid), rouEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "rouKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectTimerTikTok",
  "lab": {
   "isIn": "tmrParticipants.has(uid)",
   "start": "startTimerClock()",
   "elim": null,
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "tmrKeyword",
   "heavy": false,
   "kind": "native",
   "afterJoin": false,
   "play": [
    "وقف"
   ],
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": null,
  "lab": {
   "isIn": "bombApi().getState().players.some(p => p.id === uid)",
   "start": "(bombApi().settings({ times: '600,600,600' }), bombApi().start())",
   "elim": "bombApi().kick(uid)",
   "lobby": "bombApi().reset()",
   "kwVar": null,
   "n": 4,
   "heavy": true,
   "kind": "native",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": "document.querySelector('#bomb-frame').contentDocument.getElementById('b3d-bLate')"
  }
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
  "connect": "connectBoxTikTok",
  "lab": {
   "isIn": "boxParticipants.has(uid)",
   "start": "startBoxRound()",
   "elim": "boxParticipants.delete(uid), boxEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "boxKeyword",
   "n": 4,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectCrTikTok",
  "lab": {
   "isIn": "crParticipants.has(uid)",
   "start": "startCrRound()",
   "elim": "crParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "crKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": [
    "يلا"
   ],
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "cr-maxracers",
    30
   ]
  }
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
  "connect": "connectMzTikTok",
  "lab": {
   "isIn": "mzParticipants.has(uid)",
   "start": "startMzRound()",
   "elim": "mzParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "mzKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "mz-maxplayers",
    30
   ]
  }
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
  "connect": "connectEvTikTok",
  "lab": {
   "isIn": "evParticipants.has(uid)",
   "start": "startEvRound()",
   "elim": "evParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "evKeyword",
   "n": 4,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "ev-maxplayers",
    40
   ]
  }
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
  "connect": "connectLLTikTok",
  "lab": {
   "isIn": "llParticipants.has(uid)",
   "start": "startLastLetterRound()",
   "elim": "llParticipants.delete(uid), llEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "llKeyword",
   "n": 4,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectWAITikTok",
  "lab": {
   "isIn": "waiParticipants.has(uid)",
   "start": "startWAIRound()",
   "elim": "waiParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "waiKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectIGTikTok",
  "lab": {
   "isIn": "igParticipants.has(uid)",
   "start": "startIGRound()",
   "elim": "igParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "igKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectRWTikTok",
  "lab": {
   "isIn": "rwParticipants.has(uid)",
   "start": "startRWRound()",
   "elim": "rwParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "rwKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectPGSTikTok",
  "lab": {
   "isIn": "pgsParticipants.has(uid)",
   "start": "startPGRound()",
   "elim": "pgsParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "pgsKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": [
    "900"
   ],
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectLSCTikTok",
  "lab": {
   "isIn": "lscParticipants.has(uid)",
   "start": "startLSCRound()",
   "elim": "lscParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "lscKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectWRTikTok",
  "lab": {
   "isIn": "wrParticipants.has(uid)",
   "start": "startWRRound()",
   "elim": "wrParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "wrKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectDrawTikTok",
  "lab": {
   "isIn": "drawParticipants.has(uid)",
   "start": "startDrawRound()",
   "elim": null,
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click(), (document.getElementById('gd-modal-yes') || { click() {} }).click()",
   "kwVar": null,
   "n": 0,
   "heavy": false,
   "kind": "native",
   "afterJoin": false,
   "play": null,
   "noKw": true,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectCWTikTok",
  "lab": {
   "isIn": "cwActiveCountries.some(c => c.uid === uid)",
   "start": "startCountryWarRound()",
   "elim": "cwActiveCountries.splice(cwActiveCountries.findIndex(c => c.uid === uid), 1), cwEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "cwKeyword",
   "n": 4,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectCSTikTok",
  "lab": {
   "isIn": "csParticipants.has(uid)",
   "start": "startCrownStealRound()",
   "elim": "csParticipants.delete(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "csKeyword",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": [
    "اسرق"
   ],
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectFindballTikTok",
  "lab": {
   "isIn": "findballParticipants.has(uid)",
   "start": "findballStartRoundClick()",
   "elim": "findballParticipants.delete(uid), findballEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "findballKeyword",
   "n": 4,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null
  }
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
  "connect": "connectChairsTikTok",
  "lab": {
   "isIn": "chairsParticipants.has(uid)",
   "start": "chairsStartRoundClick()",
   "elim": "chairsParticipants.delete(uid), chairsEliminatedHistory.add(uid)",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "chairsKeyword",
   "n": 5,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "lateStaged": true
  }
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
  "connect": null,
  "lab": {
   "isIn": "!!tugTeamOf(uid)",
   "start": "startTugRound()",
   "elim": null,
   "lobby": "tugApi().reset()",
   "kwVar": null,
   "heavy": true,
   "kind": "native",
   "afterJoin": true,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": "document.querySelector('#tug-frame').contentDocument.getElementById('eht-late')",
   "skip": {
    "start": "تتطلب توزيع المشاركين على فريقين (أحمر/أزرق) بأوامر خاصة لا يغطيها المشغّل العام بعد",
    "late-new": "يعتمد على بدء الجولة",
    "late-excl": "يعتمد على بدء الجولة",
    "end": "يعتمد على بدء الجولة"
   }
  }
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
  "connect": "connectRlglTikTok",
  "lab": {
   "isIn": "rlglParticipants.has(uid)",
   "start": "startRlglRound()",
   "elim": "rlglEliminatePlayer(uid, 'red-light')",
   "lobby": "document.querySelector('.page.active .btn-reset:not(.lj-btn)').click()",
   "kwVar": "rlglJoinKw",
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "rlgl-max-players",
    50
   ],
   "elimCheck": "rlglEliminated.has(uid)"
  }
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
  "connect": "tt10ConnectTikTok",
  "lab": {
   "isIn": "tt10Participants.has(uid)",
   "start": "tt10StartRound()",
   "elim": null,
   "lobby": "tt10EndRound('test'), tt10NextRound()",
   "kwVar": null,
   "n": 2,
   "heavy": false,
   "kind": "native",
   "afterJoin": false,
   "play": null,
   "noKw": true,
   "kwVal": null,
   "openBtn": null,
   "skip": {
    "end": "إنهاء الجولة مرتبط بدورة داخلية لا يغطيها المشغّل العام بعد"
   }
  }
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
  "connect": "glzConnectTikTok",
  "lab": {
   "isIn": "glzAlive.has(uid)",
   "start": "glzStartFirstRound()",
   "elim": "glzAlive.delete(uid)",
   "lobby": null,
   "kwVar": "glzJoinKeyword",
   "n": 6,
   "heavy": false,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "glz-maxplayers",
    40
   ]
  }
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
  "connect": null,
  "lab": {
   "isIn": "vlLateApi.players().has(uid)",
   "start": "vlStart()",
   "elim": null,
   "lobby": null,
   "kwVar": null,
   "n": 3,
   "heavy": false,
   "kind": "native",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": "بركان",
   "openBtn": null,
   "cap": [
    "volcanic-lands-maxplayers",
    60
   ]
  }
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
  "connect": null,
  "lab": {
   "isIn": "cannonParticipants.has(uid)",
   "start": "cannonStartRound()",
   "elim": null,
   "lobby": null,
   "kwVar": null,
   "n": 2,
   "heavy": true,
   "kind": "native",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": null,
   "openBtn": null,
   "cap": [
    "cannon-s-max",
    100
   ],
   "lateStaged": true
  }
 },
 {
  "tag": "roulette3d",
  "title": "الروليت الروسي",
  "launch": "launchRoulette3d",
  "inputs": {
   "roulette3d-join-kw": "دخول",
   "roulette3d-reg": "0"
  },
  "pmap": null,
  "st": null,
  "kw": "دخول",
  "chat": null,
  "join": null,
  "pre": null,
  "connect": null,
  "lab": {
   "isIn": "(() => { try { return document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.getState().players.some(p => p.id === uid); } catch (e) { return false; } })()",
   "start": "document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.start()",
   "elim": null,
   "lobby": "document.getElementById('roulette3d-frame').contentWindow.EhsemhaRoulette.newMatch()",
   "kwVar": null,
   "n": 3,
   "heavy": true,
   "kind": "managed",
   "afterJoin": false,
   "play": null,
   "noKw": false,
   "kwVal": "دخول",
   "openBtn": null,
   "skip": {
    "late-new": "القبول المتأخر يُدار بطابور داخل اللعبة الثلاثية ولا يُختبر آلياً بعد"
   }
  }
 }
];
