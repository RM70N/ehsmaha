'use strict';
// زر «🌐 أكثر من منصة» بنافذة الربط السريع — من الواجهة الحقيقية:
//   تيك توك وكيك عبر السيرفر الحقيقي (موصل تيك توك المزيّف + kichat.js الحقيقية ← محاكي كيك)، وتويتش/يوتيوب/ديسكورد بمحاكيات دوال الفتح (شبكتها محجوبة).
//   PORT=18081 CTL_PORT=19081 KICK_CHANNELS=streamer1,sleepyone:offline node tests/bridge/start-server-kick.js &
//   PORT=18082 CTL_PORT=19082 node tests/bridge/start-server.js &
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/multi-platform.test.js
const H = require('./harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
async function waitFor(page, fn, arg, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); } return false; }
const kickCtl = (cmd) => fetch('http://127.0.0.1:19181/' + cmd).then((r) => r.json());
const say = (platform, viewer, text, user = 'streamer1') => H.ctl(H.PRIMARY, { cmd: 'chat', user, viewer, nickname: viewer, text, platform, identity: { isFollowerOfAnchor: true } });
const states = (page) => page.evaluate(() => Object.fromEntries(Object.keys(homeConnections).map((p) => [p, homeConnState[p] && homeConnState[p].state])));
const keys = ['tiktok', 'twitch', 'kick', 'youtube', 'discord'];
async function stubs(page) {
  await page.evaluate(() => {
    window.__em = window.__em || {};
    const fake = (platform) => function (user, onEvent, onOpen) { window.__em[platform] = onEvent; setTimeout(onOpen, 20); return { close() { delete window.__em[platform]; }, send() {}, readyState: 1 }; };
    window.youtubeBridgeOpenWS = fake('youtube');
    window.discordRelayOpenStream = fake('discord');
    window.twitchOpenIRC = function (ch, onChat, onOpen) { window.__em.twitch = (d, u, m) => onChat(d, u, m); setTimeout(onOpen, 20); return { close() { delete window.__em.twitch; }, send() {}, readyState: 1 }; };
  });
}
const shape = (u, t) => ({ messages: [{ type: 'WebcastChatMessage', comment: t, user: { uniqueId: u, nickname: u, profilePictureUrl: '', followRole: 1, isFollower: true, followInfo: { followStatus: 1 } } }] });
// ينفّذ الضغطة الحقيقية: يفتح النافذة، يفعّل وضع «أكثر من منصة»، يملأ الحقول ويضغط «ابدأ الربط»
async function multiConnect(page, spec) {
  await page.evaluate((spec) => {
    try { platformDisconnectAll(); } catch (e) {}
    homeOpenQuickConnect(); homeQcToggleMulti(true);
    for (const p of ['tiktok', 'twitch', 'kick', 'youtube', 'discord']) {
      const cb = document.getElementById('qc-multi-check-' + p); cb.checked = p in spec; homeQcToggleCheck(p, cb.checked);
      if (p in spec) document.getElementById('qc-multi-user-' + p).value = spec[p];
    }
    homeStartQuickConnect();
  }, spec);
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=1' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); window.__wins = []; });
  await stubs(page);
  await page.evaluate(() => { window.__probe = []; const orig = window.homeDispatchToGameListeners; window.homeDispatchToGameListeners = function (d) { try { (d.messages || []).forEach((m) => { if (m.type === 'WebcastChatMessage') window.__probe.push(m.user.uniqueId + '|' + m.comment); }); } catch (e) {} return orig.apply(this, arguments); }; });

  // ===== 1) واجهة الزر والتحقق من المدخلات =====
  const ui = await page.evaluate(() => {
    homeOpenQuickConnect();
    const out = { switchBtn: !!document.querySelector('.qc-multi-switch'), multiHidden: getComputedStyle(document.getElementById('qc-multi-wrap')).display === 'none' };
    homeQcToggleMulti(true);
    out.multiShown = getComputedStyle(document.getElementById('qc-multi-wrap')).display !== 'none';
    out.checks = ['tiktok', 'twitch', 'kick', 'youtube', 'discord'].every((p) => !!document.getElementById('qc-multi-check-' + p));
    return out;
  });
  check('زر «أكثر من منصة» موجود ويفتح الوضع المتعدد (٥ خيارات)', ui.switchBtn && ui.multiHidden && ui.multiShown && ui.checks, ui);
  const val = async (spec) => { await page.evaluate((spec) => { homeOpenQuickConnect(); homeQcToggleMulti(true); for (const p of ['tiktok', 'twitch', 'kick', 'youtube', 'discord']) { const cb = document.getElementById('qc-multi-check-' + p); cb.checked = p in spec; homeQcToggleCheck(p, cb.checked); if (p in spec) document.getElementById('qc-multi-user-' + p).value = spec[p]; } homeStartQuickConnect(); }, spec); return page.evaluate(() => ({ s: document.getElementById('qc-status').textContent, conns: Object.keys(homeConnections).length, overlay: document.getElementById('qc-connecting-overlay').classList.contains('visible') })); };
  let v = await val({});
  check('بدون اختيار: «اختر منصتين على الأقل» ولا اتصال', /منصتين/.test(v.s) && v.conns === 0, v);
  v = await val({ kick: 'streamer1' });
  check('منصة واحدة فقط بالوضع المتعدد مرفوضة', /منصتين/.test(v.s) && v.conns === 0, v);
  v = await val({ kick: 'streamer1', tiktok: '   ' });
  check('يوزر فارغ لمنصة مختارة مرفوض برسالة باسم المنصة', /يوزر/.test(v.s) && /تيك توك/.test(v.s) && v.conns === 0, v);
  v = await val({ kick: 'streamer1', discord: '123' });
  check('ID ديسكورد غير صالح مرفوض', /ديسكورد/.test(v.s) && v.conns === 0, v);

  // ===== 2) تيك توك + كيك (سيرفر حقيقي) =====
  await multiConnect(page, { tiktok: '  @Streamer1 ', kick: '  https://kick.com/Streamer1 ' });
  check('تيك توك + كيك: الاثنان connected', await waitFor(page, () => ['tiktok', 'kick'].every((p) => homeConnState[p] && homeConnState[p].state === 'connected'), null, 60000), await states(page));
  await sleep(500);
  const s2 = await page.evaluate(() => ({
    plats: localStorage.getItem(HOME_CONNECTED_PLATFORMS_KEY), main: localStorage.getItem(HOME_CONNECTED_PLATFORM_KEY), user: localStorage.getItem(STREAMER_USER_STORAGE_KEY),
    badge: (document.getElementById('home-conn-badge-text') || document.querySelector('[id*="conn-badge"]') || {}).textContent, chips: document.querySelectorAll('.home-plat-chip').length,
    overlay: document.getElementById('qc-connecting-overlay').classList.contains('visible'), active: homeHasActiveConnection()
  }));
  check('حفظ المنصات: القائمة «tiktok,kick» والأساسية tiktok ويوزر الستريمر نظيف', s2.plats === 'tiktok,kick' && s2.main === 'tiktok' && s2.user === 'streamer1', s2);
  check('شريط الحالة: نقطتان (واحدة لكل منصة) والشارة تذكر منصتين، ونافذة الربط أُغلقت', s2.chips === 2 && /2|منصت/.test(s2.badge || '') && !s2.overlay && s2.active, s2);

  // ===== 3) راوند واحد: لاعبون من المنصتين، وكل لعبة ترى الاثنين =====
  await page.evaluate(() => { document.getElementById('box-kw').value = 'ادخل'; launchBox(); });
  await sleep(500);
  await say('tiktok', 'ali', 'ادخل'); await say('kick', 'ali', 'ادخل'); await say('tiktok', 'sara', 'ادخل'); await say('kick', 'omar', 'ادخل 😍');
  await sleep(700);
  let joined = await page.evaluate(() => [...boxParticipants.keys()].sort());
  check('نفس الاسم على المنصتين = لاعبان مختلفان، وكل المنضمين موجودون', JSON.stringify(joined) === JSON.stringify(['kick:ali', 'kick:omar', 'tiktok:ali', 'tiktok:sara']), joined);
  await page.evaluate(() => startBoxRound());
  await sleep(400);
  await say('tiktok', 'ali', '1'); await say('kick', 'ali', '2'); await sleep(300);
  check('راوند واحد شغّال بلاعبي منصتين (الحالة active)', await page.evaluate(() => boxGameStatus === 'active'), await page.evaluate(() => boxGameStatus));

  // ===== 4) انقطاع كيك أثناء الراوند: تيك توك يكمل، وكيك يرجع للراوند نفسه =====
  const part0 = await page.evaluate(() => boxParticipants.size);
  await kickCtl('dropAll');
  await sleep(300);
  await say('tiktok', 'during_t', 'مرحبا'); await sleep(400);
  check('أثناء انقطاع كيك: رسائل تيك توك تصل للّعبة والراوند لا يتأثر', await page.evaluate(() => window.__probe.includes('tiktok:during_t|مرحبا') && boxGameStatus === 'active'), await states(page));
  check('كيك يعود connected تلقائياً', await waitFor(page, () => homeConnState.kick.state === 'connected', null, 30000), await states(page));
  await sleep(400);
  await say('kick', 'afterdrop', 'بعد العودة'); await sleep(500);
  const after = await page.evaluate(() => ({ st: boxGameStatus, got: window.__probe.includes('kick:afterdrop|بعد العودة'), listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate') }));
  check('بعد العودة: نفس الراوند يعمل (active) ورسائل كيك تصل لنفس اللعبة بلا مستمعين مكرّرين', after.st === 'active' && after.got && after.listeners.length === 1, { after, part0 });

  // ===== 5) فصل منصة يدوياً (من لعبة جارية) =====
  await page.evaluate(() => platformDisconnect('kick'));
  await sleep(300);
  await say('tiktok', 'still_here', 'حي'); await say('kick', 'ghost', 'شبح'); await sleep(500);
  const d5 = await page.evaluate(() => ({ t: window.__probe.includes('tiktok:still_here|حي'), k: window.__probe.some((x) => x.startsWith('kick:ghost')), conns: Object.keys(homeConnections), st: boxGameStatus }));
  check('بعد فصل كيك: تيك توك يشتغل وكيك لا يوصّل رسائل والراوند مستمر', d5.t && !d5.k && JSON.stringify(d5.conns) === '["tiktok"]' && d5.st === 'active', d5);
  await page.evaluate(() => { try { goHome(); } catch (e) {} });

  // ===== 6) فشل جزئي: كيك قناة غير موجودة + تيك توك سليم =====
  await multiConnect(page, { tiktok: 'streamer1', kick: 'no_such_channel_zz' });
  check('تيك توك connected وكيك failed (منصة فاشلة ما تُسقط الأخرى)', await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected' && homeConnState.kick && homeConnState.kick.state === 'failed', null, 60000), await states(page));
  await sleep(500);
  const f6 = await page.evaluate(() => ({ overlay: document.getElementById('qc-connecting-overlay').classList.contains('visible'), active: homeHasActiveConnection(), list: platformConnectedList(), toast: [...document.querySelectorAll('[class*="toast"],#toast')].map((e) => e.textContent).join('|') }));
  check('نافذة الربط أُغلقت، التيك توك وحده نشط، ورسالة كيك العربية ظهرت', !f6.overlay && f6.active && JSON.stringify(f6.list) === '["tiktok"]' && /غير موجودة/.test(f6.toast), f6);
  await page.evaluate(() => { document.getElementById('box-kw').value = 'ادخل'; launchBox(); }); await sleep(400);
  await say('tiktok', 'solo', 'ادخل'); await sleep(400);
  check('اللعبة تشتغل بالمنصة السليمة', await page.evaluate(() => boxParticipants.has('tiktok:solo')));
  await page.evaluate(() => { try { goHome(); } catch (e) {} });

  // ===== 7) خمس منصات معاً =====
  await multiConnect(page, { tiktok: 'streamer1', twitch: 'chan', kick: 'streamer1', youtube: 'chan', discord: '123456789012345678' });
  check('الخمس منصات connected', await waitFor(page, (ks) => ks.every((p) => homeConnState[p] && homeConnState[p].state === 'connected'), keys, 60000), await states(page));
  // keys غير معرّفة داخل الصفحة — نمرّرها كوسيط
  await page.evaluate(() => { document.getElementById('box-kw').value = 'ادخل'; launchBox(); }); await sleep(500);
  await say('tiktok', 'tt', 'ادخل'); await say('kick', 'kk', 'ادخل');
  await page.evaluate((shapeSrc) => { const sh = (u, t) => ({ messages: [{ type: 'WebcastChatMessage', comment: t, user: { uniqueId: u, nickname: u, profilePictureUrl: '', followRole: 1, isFollower: true, followInfo: { followStatus: 1 } } }] }); window.__em.youtube(sh('yy', 'ادخل😍')); window.__em.discord(sh('dd', 'ادخل')); window.__em.twitch('TW', 'tw', 'ادخل'); }, null);
  await sleep(700);
  joined = await page.evaluate(() => [...boxParticipants.keys()].sort());
  check('لاعب من كل منصة من الخمس دخل نفس اللعبة', JSON.stringify(joined) === JSON.stringify(['discord:dd', 'kick:kk', 'tiktok:tt', 'twitch:tw', 'youtube:yy']), joined);
  check('مستمع واحد للعبة (لا تكرار) والشارة تذكر ٥ منصات', await page.evaluate(() => Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate').length === 1 && /5/.test((document.getElementById('home-conn-badge-text') || { textContent: '' }).textContent)), await page.evaluate(() => Object.keys(homeGameListeners)));

  // ===== 8) التنقل بين الألعاب لا يعيد الاتصال =====
  const c0 = await kickCtl('stats');
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(300);
  await page.evaluate(() => { document.getElementById('sniper-kw').value = 'ادخل'; launchSniper(); }); await sleep(500);
  await say('kick', 'k2', 'ادخل'); await say('tiktok', 't2', 'ادخل'); await sleep(500);
  const c1 = await kickCtl('stats');
  check('لعبة ثانية بنفس الجلسة: الاتصالات باقية (بلا اتصال كيك جديد) واللاعبون من المنصتين يدخلون', c1.connectionsTotal === c0.connectionsTotal && await page.evaluate(() => sniperParticipants.has('kick:k2') && sniperParticipants.has('tiktok:t2')), { c0, c1 });

  // ===== 9) تحديث الصفحة أثناء جلسة متعددة: تعود كل منصاتها =====
  await multiConnect(page, { tiktok: 'streamer1', kick: 'streamer1' });
  await waitFor(page, () => ['tiktok', 'kick'].every((p) => homeConnState[p] && homeConnState[p].state === 'connected'), null, 60000);
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  check('بعد تحديث الصفحة: تيك توك وكيك يعودان تلقائياً معاً', await waitFor(page, () => homeConnState.tiktok && homeConnState.kick && homeConnState.tiktok.state === 'connected' && homeConnState.kick.state === 'connected', null, 60000), await states(page));
  await page.evaluate(() => { window.__probe = []; const orig = window.homeDispatchToGameListeners; });
  await sleep(300);
  check('شارة الاتصال بعد التحديث تذكر منصتين', await page.evaluate(() => /2/.test((document.getElementById('home-conn-badge-text') || { textContent: '' }).textContent)));
  // جلسة منصة واحدة لا تستعيد منصات قديمة
  await page.evaluate(() => { platformDisconnectAll(); homeOpenQuickConnect(); homeQcPickPlatform('tiktok'); document.getElementById('qc-main-input').value = 'streamer1'; homeStartQuickConnect(); });
  await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, 60000);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, 60000);
  await sleep(1500);
  check('جلسة منصة واحدة (تيك توك) بعد التحديث: لا تُستعاد كيك القديمة', await page.evaluate(() => Object.keys(homeConnections).join() === 'tiktok'), await states(page));

  check('لا أخطاء JS بالصفحة', page._errors.length === 0, page._errors);
  const bad = results.filter((r) => !r.ok);
  console.log('RESULT ' + (results.length - bad.length) + '/' + results.length);
  await browser.close();
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
