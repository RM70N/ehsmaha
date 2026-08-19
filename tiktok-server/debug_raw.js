const { TikTokLiveConnection, WebcastEvent, ControlEvent } = require('tiktok-live-connector');
const conn = new TikTokLiveConnection('tv_asahi_news', { processInitialData: false });
let n = 0;
conn.on(WebcastEvent.CHAT, (data) => {
  n++;
  if (n <= 3) {
    console.log('RAW CHAT #' + n, JSON.stringify(data, null, 2).slice(0, 1500));
  }
  if (n >= 3) process.exit(0);
});
conn.on(ControlEvent.CONNECTED, () => console.log('connected'));
conn.connect().catch(e => { console.log('connect error', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout, no chat received'); process.exit(0); }, 30000);
