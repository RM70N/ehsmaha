'use strict';
// كيك من واجهة الستريمر الحقيقية (نافذة الربط السريع) عبر: المتصفح ← server.js ← kichat.js الحقيقية ← محاكي كيك.
//   PORT=18081 CTL_PORT=19081 KICK_CHANNELS=streamer1,sleepyone node tests/bridge/start-server-kick.js &   (والاحتياطي 18082 بـ start-server.js)
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/kick-connect.test.js
const H = require('./harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
async function waitFor(page, fn, arg, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); } return false; }
const kickCtl = (cmd) => fetch('http://127.0.0.1:19181/' + cmd).then((r) => r.json());
const say = (user, viewer, text) => H.ctl(H.PRIMARY, { cmd: 'chat', user, viewer, nickname: viewer, text, identity: { isFollowerOfAnchor: true } });
const connect = (page, raw) => page.evaluate((raw) => { try { platformDisconnectAll(); } catch (e) {} document.getElementById('toast') && (document.getElementById('toast').textContent = ''); homeOpenQuickConnect(); homeQcPickPlatform('kick'); document.getElementById('qc-main-input').value = raw; homeStartQuickConnect(); }, raw);
const st = (page) => page.evaluate(() => ({ s: homeConnState.kick && homeConnState.kick.state, ev: homeConnState.kick && homeConnState.kick.evCount, att: homeConnections.kick && homeConnections.kick.attempts, ws: !!(homeConnections.kick && homeConnections.kick.ws) }));
const toastText = (page) => page.evaluate(() => [...document.querySelectorAll('.toast, #toast, [class*="toast"]')].map((e) => e.textContent).join('|'));

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.evaluate(() => { window.__msgs = []; });

  // 1) مدخل متسخ → اتصال ناجح
  await connect(page, '  @STREAMER1 ');
  check('مدخل متسخ («  @STREAMER1 ») يتصل: حالة connected', await waitFor(page, () => homeConnState.kick && homeConnState.kick.state === 'connected', null, 60000), await st(page));
  await page.evaluate(() => { homeRegisterGameListener('probe', (d) => { (d.messages || []).forEach((m) => { if (m.type === 'WebcastChatMessage') window.__msgs.push({ u: m.user.uniqueId, t: m.comment }); }); }); });
  await say('streamer1', 'ali', 'يمين ١ ٤');
  check('رسالة عربية بأرقام هندية تصل للّعبة باسم kick:ali', await waitFor(page, () => window.__msgs.some((m) => m.u === 'kick:ali' && m.t === 'يمين ١ ٤'), null, 8000), await page.evaluate(() => window.__msgs));

  // 2) انقطاع TCP → reconnecting → connected + الشات يعمل
  await kickCtl('dropAll');
  check('قطع الاتصال: الواجهة تمر بحالة إعادة الاتصال ثم تعود connected تلقائياً', await waitFor(page, () => homeConnState.kick.state === 'connected' && homeConnState.kick.evCount > 3, null, 25000), await st(page));
  await sleep(500); await say('streamer1', 'sara', 'بعد الانقطاع');
  check('الشات يعمل بعد الانقطاع', await waitFor(page, () => window.__msgs.some((m) => m.u === 'kick:sara'), null, 8000));

  // 3) قناة غير موجودة: رسالة عربية واضحة، فشل نهائي، بلا إعادة محاولة أبدية
  await connect(page, 'https://kick.com/NoSuchChannel_xyz');
  check('قناة غير موجودة: الحالة failed', await waitFor(page, () => homeConnState.kick && homeConnState.kick.state === 'failed', null, 30000), await st(page));
  const tt = await toastText(page);
  check('رسالة عربية واضحة بالتوست (غير موجودة + اكتب اسم قناتك)', /غير موجودة/.test(tt) && /kick\.com/.test(tt), tt);
  check('نافذة «جاري الربط» اختفت (لا تعليق)', await page.evaluate(() => !document.getElementById('qc-connecting-overlay').classList.contains('visible')));
  const before = await kickCtl('stats');
  await sleep(12000);
  const after = await kickCtl('stats');
  check('لا محاولات اتصال متكررة بعد الفشل النهائي (لا حمل على السيرفر)', after.infoCalls === before.infoCalls, { before, after });
  check('الزر/المقبس لا يزالان سليمين: إعادة الضغط بقناة صحيحة تنجح', (await connect(page, 'streamer1'), await waitFor(page, () => homeConnState.kick && homeConnState.kick.state === 'connected', null, 30000)));

  // 4) قناة غير مباشرة
  await connect(page, 'sleepyone');
  check('قناة غير مباشرة: حالة not_live (تنتظر البث)', await waitFor(page, () => homeConnState.kick && homeConnState.kick.state === 'not_live', null, 30000), await st(page));
  await kickCtl('live?slug=sleepyone');
  check('بدأ البث: connected بدون أي تدخل', await waitFor(page, () => homeConnState.kick.state === 'connected', null, 10000), await st(page));

  // 5) قطع الإنترنت لدقيقة ثم عودته
  await connect(page, 'streamer1');
  await waitFor(page, () => homeConnState.kick.state === 'connected', null, 30000);
  await kickCtl('down');          // rejectNew + dropAll + info 500
  check('انقطاع الإنترنت عن كيك: reconnecting (بلا انهيار)', await waitFor(page, () => ['reconnecting', 'connecting'].includes(homeConnState.kick.state), null, 15000), await st(page));
  await sleep(4000);
  await kickCtl('up');
  check('عودة الإنترنت: connected تلقائياً', await waitFor(page, () => homeConnState.kick.state === 'connected', null, 40000), await st(page));
  await say('streamer1', 'noura', 'رجعت');
  check('الشات يعمل بعد عودة الإنترنت', await waitFor(page, () => window.__msgs.some((m) => m.u === 'kick:noura'), null, 8000));

  check('لا أخطاء JS بالصفحة', page._errors.length === 0, page._errors);
  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
