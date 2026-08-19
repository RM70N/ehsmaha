const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n=0;
conn.on(WebcastEvent.CHAT, (data) => {
  n++;
  console.log(n, '| displayId:', data.user.displayId, '| nickname:', data.user.nickname, '| id:', data.user.id);
  if (n>=8) process.exit(0);
});
conn.connect().catch(e => { console.log(e.message); process.exit(1); });
setTimeout(()=>{console.log('timeout');process.exit(0);}, 30000);
