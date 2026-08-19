const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let gotFollow = false, gotLike = false, gotRoomUser = false, gotGift = false;
function maybeExit() { if (gotFollow && gotLike && gotRoomUser) process.exit(0); }
conn.on(WebcastEvent.FOLLOW, (data) => {
  if (gotFollow) return; gotFollow = true;
  console.log('FOLLOW top keys:', Object.keys(data));
  console.log('FOLLOW user.id/nickname:', data.user.id, data.user.nickname);
  maybeExit();
});
conn.on(WebcastEvent.LIKE, (data) => {
  if (gotLike) return; gotLike = true;
  console.log('LIKE top keys:', Object.keys(data));
  console.log('LIKE likeCount/total:', data.likeCount, data.totalLikeCount);
  maybeExit();
});
conn.on(WebcastEvent.ROOM_USER, (data) => {
  if (gotRoomUser) return; gotRoomUser = true;
  console.log('ROOM_USER keys:', Object.keys(data));
  console.log('ROOM_USER viewerCount:', data.viewerCount);
  maybeExit();
});
conn.on(WebcastEvent.GIFT, (data) => {
  if (gotGift) return; gotGift = true;
  console.log('GIFT top keys:', Object.keys(data));
  console.log('GIFT giftId/repeatCount/repeatEnd:', data.giftId, data.repeatCount, data.repeatEnd);
  console.log('GIFT giftDetails:', JSON.stringify(data.giftDetails));
});
conn.connect().catch(e => { console.log('connect error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout, got:', {gotFollow,gotLike,gotRoomUser,gotGift}); process.exit(0); }, 45000);
