#!/usr/bin/env node
// اختبار حي على قناة كيك حقيقية — يشغّل نفس كود الإنتاج (KickChatSession + kichat.js) ويسجّل الرسائل والانقطاعات.
//   node live-kick-probe.js <قناة نشطة> [دقائق=5]
//   مثال: node live-kick-probe.js xqc 5
// يحتاج إنترنت يصل لـ kick.com و ws-us2.pusher.com (لا يعمل خلف بروكسي يمنعهما). Node ≥ 22.
// الناتج: سطر لكل دقيقة + ملخص JSON نهائي (عدد الرسائل المستقبلة/المسلّمة، المحجوب بالمرشّح، الانقطاعات، أطول صمت).
const { KickChatSession, checkChannel } = require('./lib/kichat-session');

const channel = process.argv[2];
const minutes = Number(process.argv[3] || 5);
if (!channel) { console.error('usage: node live-kick-probe.js <channel> [minutes=5]'); process.exit(2); }

(async () => {
  const pre = await checkChannel(channel);
  console.log('[preflight]', JSON.stringify({ ok: pre.ok, code: pre.code, detail: pre.detail, slug: pre.slug, live: pre.live }));
  if (!pre.ok) { console.log(pre.code === 'blocked' ? 'كيك حجب الطلب (Cloudflare/403) — هذا ما سيحوّل السيرفر للناقل الاحتياطي' : 'فشل الفحص: ' + pre.code); process.exit(1); }
  const s = new KickChatSession(channel);
  const t0 = Date.now(); let lastMsgAt = Date.now(), longestGap = 0, perMin = 0, minuteNo = 0; const log = { states: [], disconnects: 0, samples: [] };
  s.on('state', (x) => { log.states.push({ t: Math.round((Date.now() - t0) / 1000), state: x.state, detail: x.detail }); if (x.state === 'reconnecting') log.disconnects++; console.log('[state]', JSON.stringify(x)); });
  s.on('messages', (b) => { for (const m of b) { perMin++; longestGap = Math.max(longestGap, Date.now() - lastMsgAt); lastMsgAt = Date.now(); if (log.samples.length < 5) log.samples.push({ user: m.username, text: m.text.slice(0, 40), mod: m.isMod, sub: m.isSub }); } });
  for (const e of ['fatal', 'blocked', 'gaveup']) s.on(e, (x) => console.log('[' + e + ']', JSON.stringify(x)));
  const tick = setInterval(() => { minuteNo++; console.log('[دقيقة ' + minuteNo + '] رسائل=' + perMin + ' الإجمالي المسلّم=' + s.counters.delivered); perMin = 0; }, 60000);
  await s.start();
  await new Promise((r) => setTimeout(r, minutes * 60000));
  clearInterval(tick); s.stop();
  console.log('[ملخص]', JSON.stringify({ channel, minutes, counters: s.counters, disconnects: log.disconnects, longestGapSec: Math.round(longestGap / 1000), samples: log.samples, states: log.states.slice(-8) }, null, 1));
  process.exit(0);
})();
