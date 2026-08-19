const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n = 0;
conn.on(WebcastEvent.CHAT, (data) => {
  n++;
  if (n === 1) {
    console.log('comment field:', JSON.stringify(data.comment));
    console.log('user keys:', Object.keys(data.user));
    console.log('user.uniqueId:', data.user.uniqueId);
    console.log('user.secUid:', data.user.secUid);
    console.log('user.id:', data.user.id);
    console.log('followInfo:', JSON.stringify(data.user.followInfo));
    console.log('full user (no avatar):', JSON.stringify({...data.user, avatarThumb: undefined, profilePicture: undefined}, null, 2));
  }
  if (n >= 1) process.exit(0);
});
conn.connect().catch(e => { console.log('connect error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(0); }, 30000);
