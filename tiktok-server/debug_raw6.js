const { TikTokLiveConnection, WebcastEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n=0, gotGift=false;
conn.on(WebcastEvent.LIKE, (data) => {
  n++;
  if (n===1) console.log('LIKE full:', JSON.stringify({...data, icon:undefined,icons:undefined}, null, 2));
});
conn.on(WebcastEvent.GIFT, (data) => {
  if (gotGift) return; gotGift = true;
  console.log('GIFT full (minus images):', JSON.stringify({...data, giftImage:undefined, giftDetails: data.giftDetails ? {...data.giftDetails, giftImage: undefined} : data.giftDetails}, null, 2).slice(0, 2000));
});
conn.connect().catch(e => { console.log(e.message); process.exit(1); });
setTimeout(()=>{console.log('timeout. gotGift=', gotGift);process.exit(0);}, 60000);
