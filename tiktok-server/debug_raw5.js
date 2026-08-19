const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n=0;
conn.on(WebcastEvent.ROOM_USER, (data) => {
  n++;
  if (n===1) console.log('ROOM_USER full (minus ranks/seats):', JSON.stringify({...data, ranks: undefined, seats: undefined}, null, 2));
  if (n>=1) process.exit(0);
});
conn.connect().catch(e => { console.log(e.message); process.exit(1); });
setTimeout(()=>{console.log('timeout');process.exit(0);}, 30000);
