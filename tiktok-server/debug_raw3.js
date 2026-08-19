const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n = 0;
conn.on(WebcastEvent.CHAT, (data) => {
  n++;
  if (n === 1) {
    console.log('TOP LEVEL KEYS:', Object.keys(data));
    console.log('content field:', JSON.stringify(data.content));
    console.log('common:', JSON.stringify(data.common));
    console.log('emotes:', data.emotes);
    console.log('rtfContent:', data.rtfContent);
    console.log('visibleToSender:', data.visibleToSender);
  }
  if (n >= 1) process.exit(0);
});
conn.connect().catch(e => { console.log('connect error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(0); }, 30000);
