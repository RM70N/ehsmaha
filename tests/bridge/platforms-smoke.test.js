'use strict';
// دخان تويتش/كيك/يوتيوب/ديسكورد (انضمام ولعب فقط). الشبكة لهذه المنصات محجوبة
// ببيئة الاختبار، فنستبدل دوال الفتح (twitchOpenIRC/kickBridgeOpenWS/...) بمحاكي
// يرسل نفس شكل الرسائل الحقيقي (twitchEventShape / buildKickComment بالسيرفر /
// discordRelayEventShape)، والباقي حقيقي: platformConnect يوسم المنصة ويوزّع للناقل.
//   node tests/bridge/platforms-smoke.test.js
const H = require('./harness');
const games = require('./games');
(async () => {
  await H.serveSite();
  const b = await H.launchBrowser();
  const page = await H.newPage(b);
  const r = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
    const emitters = {};
    const fake = (platform) => function (user, onEvent, onOpen) {
      emitters[platform] = onEvent;
      setTimeout(onOpen, 10);
      return { close() {}, send() {}, readyState: 1 };
    };
    window.kickBridgeOpenWS = fake('kick');
    window.youtubeBridgeOpenWS = fake('youtube');
    window.discordRelayOpenStream = fake('discord');
    window.twitchOpenIRC = function (ch, onChat, onOpen) { emitters.twitch = (d, u, m) => onChat(d, u, m); setTimeout(onOpen, 10); return { close() {}, send() {}, readyState: 1 }; };
    ['kick', 'youtube', 'discord', 'twitch'].forEach((p) => platformConnect(p, { username: 'chan' }, homeDispatchToGameListeners, () => {}));
    await sleep(100);
    localStorage.setItem(STREAMER_USER_STORAGE_KEY, 'chan');
    document.getElementById('box-kw').value = 'ادخل';
    launchBox();
    await sleep(200);
    const kick = (u, t) => emitters.kick({ messages: [{ type: 'WebcastChatMessage', comment: t, user: { uniqueId: u, nickname: u, profilePictureUrl: '', followRole: 1, isFollower: true, followInfo: { followStatus: 1 } } }] });
    const yt = (u, t) => emitters.youtube({ messages: [{ type: 'WebcastChatMessage', comment: t, user: { uniqueId: u, nickname: u, profilePictureUrl: '', isFollower: true } }] });
    const dc = (u, t) => emitters.discord({ messages: [{ type: 'WebcastChatMessage', comment: t, user: { uniqueId: u, nickname: u, profilePictureUrl: '', isFollower: true } }] });
    kick('kuser', 'ادخل'); yt('yuser', 'ادخل😍'); dc('duser', 'ادخل'); emitters.twitch('TUser', 'tuser', 'ادخل');
    await sleep(300);
    const joined = [...boxParticipants.keys()];
    const out = { joined, connState: Object.fromEntries(Object.keys(homeConnState).map((p) => [p, homeConnState[p].state])), listeners: Object.keys(homeGameListeners) };
    try { startBoxRound(); } catch (e) { out.roundErr = e.message; }
    await sleep(300);
    kick('kuser', '1'); emitters.twitch('TUser', 'tuser', '٢');
    await sleep(300);
    out.statusAfterPlay = boxGameStatus;
    return out;
  });
  const want = ['kick:kuser', 'youtube:yuser', 'discord:duser', 'twitch:tuser'];
  let bad = 0;
  want.forEach((w) => { const ok = r.joined.includes(w); if (!ok) bad++; console.log((ok ? 'PASS ' : 'FAIL ') + 'joined ' + w); });
  const okState = Object.values(r.connState).every((s) => s === 'connected');
  if (!okState) bad++;
  console.log((okState ? 'PASS ' : 'FAIL ') + 'all platforms connected ' + JSON.stringify(r.connState));
  if (r.roundErr) { bad++; console.log('FAIL round ' + r.roundErr); } else console.log('PASS round started, status=' + r.statusAfterPlay);
  if (page._errors.length) { bad++; console.log('PAGE ERRORS', page._errors); }
  console.log(bad ? bad + ' FAILED' : 'ALL PASSED');
  await b.close(); process.exit(bad ? 1 : 0);
})();
