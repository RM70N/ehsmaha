'use strict';
// مركز ربط البث (تصميم «ابدأ بثاً سريعاً» الجديد) من الواجهة الحقيقية: ضغطات فعلية على عناصر التصميم الجديد،
// والاتصال خلفها هو المسار الأصلي بلا تعديل (سيرفر الجسر الحقيقي + موصل تيك توك المزيّف + kichat.js ← محاكي كيك).
//   KICK_CHANNELS=streamer1,sleepyone:offline PORT=18081 CTL_PORT=19081 node tests/bridge/start-server-kick.js &
//   PORT=18082 CTL_PORT=19082 node tests/bridge/start-server.js &
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/connect-center.test.js   (SHOTS=/dir لحفظ اللقطات)
const H = require('./harness');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
async function waitFor(page, fn, arg, timeout = 15000) { const t0 = Date.now(); while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); } return false; }
const RUN = Date.now().toString(36).slice(-5);   // أسماء فريدة بكل تشغيل (السيرفر يحتفظ بالغرف/النتائج)
const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + '/' + name + '.png' }); };
const tt = (u, mode) => H.ctl(H.PRIMARY, { cmd: 'mode', user: u, mode });
const hubOpen = (page) => page.evaluate(() => document.getElementById('eh-connect-overlay').dataset.open === 'true');
const rowTone = (page, p) => page.evaluate((p) => { const r = document.querySelector('.eh-connect-row[data-key="' + p + '"]'); return r ? { tone: r.dataset.tone, lane: r.querySelector('.eh-connect-lane').dataset.s, status: r.querySelector('.eh-connect-status').textContent.trim(), detail: (r.querySelector('.eh-connect-detail') || {}).textContent || '', btns: [...r.querySelectorAll('[data-act]')].map((b) => b.dataset.act) } : null; }, p);
const clickAct = (page, sel) => page.evaluate((sel) => { const b = document.querySelector(sel); b && b.click(); return !!b; }, sel);
const fillForm = async (page, p, v) => { await page.evaluate(() => homeOpenQuickConnect()); await page.waitForSelector('.eh-connect-pick-row[data-p="' + p + '"]', { timeout: 8000 }).catch(async (e) => { console.log('DIAG', await page.evaluate(() => JSON.stringify({ conn: EhConnect.state, st: Object.fromEntries(Object.keys(homeConnState).map((k) => [k, homeConnState[k].state])), slots: Object.keys(homeConnections), open: document.getElementById('eh-connect-overlay').dataset.open, screen: (document.querySelector('.eh-connect-screen') || {}).dataset && document.querySelector('.eh-connect-screen').dataset.screen }))); throw e; }); await clickAct(page, '.eh-connect-pick-row[data-p="' + p + '"]'); await page.waitForSelector('#eh-f'); await page.fill('#eh-f', v); };
const sw = (page, p) => page.evaluate((p) => { const b = document.querySelector('[data-act="sw"][data-p="' + p + '"]'); if (b.getAttribute('aria-checked') !== 'true') b.click(); }, p);   // المفاتيح تبقى مفعّلة بين الفتحات
const submit = (page) => clickAct(page, '.eh-connect-formcol button[type=submit]');
const reset = async (page) => { await page.evaluate(() => { try { platformDisconnectAll(); } catch (e) {} const c = window.EhConnect; Object.keys(c.state).forEach((k) => delete c.state[k]); document.getElementById('eh-connect-overlay').dataset.open = 'false'; }); await H.ctl(H.PRIMARY, { cmd: 'reset' }); await sleep(300); };

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });   // Firebase محجوب ببيئة الاختبار فيبقى مُحمّل الدخول فوق الصفحة
  await page.setViewportSize({ width: 1366, height: 800 });

  // ---- A) الفتح والاختيار
  await page.evaluate(() => { const b = document.querySelector('.hlob-btn-lg'); b && b.scrollIntoView(); });
  const realBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /ابدأ بثاً سريعاً/.test(x.textContent)); if (!b) return false; b.click(); return true; });
  check('زر «ابدأ بثاً سريعاً» الحقيقي يفتح المركز الجديد', realBtn && await waitFor(page, () => document.getElementById('eh-connect-overlay').dataset.open === 'true', null, 3000));
  await sleep(600); await shot(page, '01-pick');
  check('شاشة الاختيار: ٥ منصات + «ربط عدة منصات»', await page.evaluate(() => document.querySelectorAll('.eh-connect-pick-row').length === 5 && !!document.querySelector('.eh-connect-multi-entry')));
  check('النافذة القديمة (تبويبات تيك توك/تويتش…) مخفية بالكامل', await page.evaluate(() => getComputedStyle(document.getElementById('qc-overlay')).display === 'none' && getComputedStyle(document.getElementById('qc-connecting-overlay')).display === 'none'));
  await page.keyboard.press('Escape');
  check('Escape يغلق المركز', !(await hubOpen(page)));

  // ---- B) نجاح مباشر مع شاشة «جاري الربط» (تأخير اتصال) ثم إغلاق تلقائي + مؤشر خلفي
  await H.ctl(H.PRIMARY, { cmd: 'connectDelay', ms: 2500 });
  await fillForm(page, 'tiktok', 'streamer1'); await shot(page, '02-form');
  await submit(page); await sleep(500); await shot(page, '03-connecting');
  let r = await rowTone(page, 'tiktok');
  check('أثناء الاتصال: صف تيك توك بحالة «جارٍ…» وبدون أزرار فشل', r && r.tone === 'live' && /جارٍ/.test(r.status) && !r.btns.includes('retry'), r);
  check('الاتصال الحقيقي بدأ فعلاً (homeConnections.tiktok)', await page.evaluate(() => !!homeConnections.tiktok));
  check('تيك توك: حالة connected الحقيقية ثم الصف «متصل»', await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, 20000) && await waitFor(page, () => { const r = document.querySelector('.eh-connect-row[data-key="tiktok"]'); return !r || r.dataset.tone === 'ok'; }, null, 3000));
  await sleep(300); await shot(page, '04-connected');
  check('نجاح كامل: المركز ينزل تلقائياً بعد لحظات', await waitFor(page, () => document.getElementById('eh-connect-overlay').dataset.open === 'false', null, 6000));
  check('المؤشر الخلفي يظهر «الشات متصل»', await page.evaluate(() => { const d = document.getElementById('eh-connect-dock'); return d.dataset.show === 'true' && /متصل/.test(d.textContent); }));
  await shot(page, '05-dock');
  check('اليوزر انحفظ بنفس آلية الموقع (streamerSavedUsername)', await page.evaluate(() => localStorage.getItem('streamerSavedUsername') === 'streamer1'));
  await H.ctl(H.PRIMARY, { cmd: 'connectDelay', ms: 0 });
  await reset(page);

  // ---- C) البث غير مفتوح
  await tt(('sleepy'+RUN), 'not_live');
  await fillForm(page, 'tiktok', ('sleepy'+RUN)); await submit(page);
  check('بث غير مفتوح: صف «البث غير مباشر» بنبرة تحذير وبلا فشل', await waitFor(page, () => { const r = document.querySelector('.eh-connect-row[data-key="tiktok"]'); return r && r.dataset.tone === 'warn' && /غير مباشر/.test(r.textContent); }, null, 25000), await rowTone(page, 'tiktok'));
  await shot(page, '06-offline');
  await tt(('sleepy'+RUN), 'live');
  check('يفتح البث لاحقاً → يربط تلقائياً ويتحول «متصل»', await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, 40000), await page.evaluate(() => homeConnState.tiktok && homeConnState.tiktok.state));
  await reset(page);

  // ---- D) يوزر غير موجود → شاشة الفشل → تعديل/إعادة محاولة
  await tt(('ghost'+RUN), 'user_not_found');
  await fillForm(page, 'tiktok', ('ghost'+RUN)); await submit(page);
  check('يوزر غير موجود: شاشة الفشل (تعذر الربط + إعادة المحاولة/تعديل/إزالة)', await waitFor(page, () => { const r = document.querySelector('.eh-connect-row[data-key="tiktok"]'); return r && r.dataset.tone === 'bad'; }, null, 60000), await rowTone(page, 'tiktok'));
  r = await rowTone(page, 'tiktok'); await shot(page, '07-failed');
  check('رسالة الفشل عربية وواضحة والأزرار الثلاثة موجودة', r && /غير موجود|تعذّر|تعذر/.test(r.detail) && ['retry', 'edit', 'remove'].every((a) => r.btns.includes(a)), r);
  const wsBefore = await page.evaluate(() => 0) + (await page.evaluate(() => 1)) && page._wsLog.length;
  await clickAct(page, '[data-act="retry"][data-p="tiktok"]');
  check('«إعادة المحاولة» تعيد الربط فعلاً (اتصال WebSocket جديد عبر المسار الأصلي)', await (async () => { const t0 = Date.now(); while (Date.now() - t0 < 15000) { if (page._wsLog.length > wsBefore) return true; await sleep(100); } return false; })(), [wsBefore, page._wsLog.length]);
  await waitFor(page, () => { const r = document.querySelector('.eh-connect-row[data-key="tiktok"]'); return r && r.dataset.tone === 'bad'; }, null, 30000);
  await clickAct(page, '[data-act="edit"][data-p="tiktok"]'); await sleep(400);
  await tt(('ghost'+RUN), 'live'); await page.fill('#eh-f', 'streamer1'); await submit(page);
  check('تصحيح اليوزر بعد الفشل («تعديل البيانات») يربط وينجح', await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, 40000), await rowTone(page, 'tiktok'));
  await reset(page);
  await tt(('ghost2'+RUN), 'user_not_found');
  await fillForm(page, 'tiktok', ('ghost2'+RUN)); await submit(page);
  await waitFor(page, () => { const r = document.querySelector('.eh-connect-row[data-key="tiktok"]'); return r && r.dataset.tone === 'bad'; }, null, 60000);
  await clickAct(page, '[data-act="edit"][data-p="tiktok"]'); await sleep(500);
  check('«تعديل البيانات» يرجع لنموذج المنصة بنفس اليوزر', await page.evaluate((want) => { const i = document.getElementById('eh-f'); return !!i && i.value === want; }, 'ghost2' + RUN));
  await reset(page);

  // ---- E) تحقق الإدخال ورفض المنطق الأصلي
  await fillForm(page, 'tiktok', ''); await submit(page); await sleep(200);
  check('حقل فارغ: رسالة داخل التصميم الجديد والبقاء بالنموذج', await page.evaluate(() => document.getElementById('eh-f-e').dataset.show === 'true' && !!document.getElementById('eh-f')));
  await page.evaluate(() => { tiktokSavedUsersUpsert('offacc'); tiktokSavedUsersSetEnabled('offacc', false); });
  await page.fill('#eh-f', 'offacc'); await submit(page); await sleep(200);
  check('حساب تيك توك معطّل: يُرفض برسالة ولا يبدأ اتصال', await page.evaluate(() => /معطل/.test(document.getElementById('eh-f-e').textContent) && !homeConnections.tiktok));
  await page.evaluate(() => { tiktokSavedUsersSetEnabled('offacc', true); });
  await page.evaluate(() => { document.querySelector('[data-act="to-pick"]').click(); }); await sleep(300);
  await clickAct(page, '.eh-connect-pick-row[data-p="discord"]'); await page.fill('#eh-f', '123'); await submit(page); await sleep(200);
  check('ديسكورد: ID خاطئ يُرفض برسالة', await page.evaluate(() => document.getElementById('eh-f-e').dataset.show === 'true' && !homeConnections.discord));
  await reset(page);

  // ---- F) أكثر من منصة: تيك توك + كيك، ثم كيك غير موجودة (نجاح جزئي)
  await page.evaluate(() => homeOpenQuickConnect()); await page.waitForSelector('.eh-connect-multi-entry');
  await clickAct(page, '.eh-connect-multi-entry'); await sleep(500);
  await sw(page, 'tiktok'); await sw(page, 'kick'); await sleep(500);
  await page.fill('#eh-m-tiktok', 'streamer1'); await page.fill('#eh-m-kick', 'kick.com/streamer1'); await shot(page, '08-multi-form');
  await clickAct(page, '#eh-multi-form button[type=submit]');
  check('أكثر من منصة: الاثنتان متصلتان فعلياً', await waitFor(page, () => homeConnState.tiktok && homeConnState.tiktok.state === 'connected' && homeConnState.kick && homeConnState.kick.state === 'connected', null, 60000), await page.evaluate(() => Object.fromEntries(Object.keys(homeConnState).map((p) => [p, homeConnState[p].state]))));
  await sleep(500); await shot(page, '09-multi-ok');
  await reset(page);
  await page.evaluate(() => homeOpenQuickConnect()); await page.waitForSelector('.eh-connect-multi-entry'); await clickAct(page, '.eh-connect-multi-entry'); await sleep(400);
  await sw(page, 'tiktok'); await sw(page, 'kick'); await sleep(400);
  await page.fill('#eh-m-tiktok', 'streamer1'); await page.fill('#eh-m-kick', 'nosuchchannel_zz');
  await clickAct(page, '#eh-multi-form button[type=submit]');
  check('نجاح جزئي: تيك توك متصل وكيك فشلت (لا تقطع إحداهما الأخرى)', await waitFor(page, () => { const t = document.querySelector('.eh-connect-row[data-key="tiktok"]'), k = document.querySelector('.eh-connect-row[data-key="kick"]'); return t && k && t.dataset.tone === 'ok' && k.dataset.tone === 'bad'; }, null, 60000), [await rowTone(page, 'tiktok'), await rowTone(page, 'kick')]);
  await sleep(300); await shot(page, '10-multi-partial');
  check('ملخص الشاشة «نجاح جزئي»', await page.evaluate(() => /نجاح جزئي/.test(document.getElementById('eh-connect-title').textContent)), await page.evaluate(() => document.getElementById('eh-connect-title').textContent));
  check('المركز لا يقفل نفسه وفيه فشل يحتاج إجراء', await hubOpen(page));
  check('زر «فصل الاتصال» بصف المتصل يفصل المنصة الحقيقية', await (async () => { await clickAct(page, '[data-act="disconnect"][data-p="tiktok"]'); return waitFor(page, () => !homeConnections.tiktok, null, 4000); })());
  await reset(page);

  // ---- G) جوال
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => homeOpenQuickConnect()); await sleep(900); await shot(page, '11-m-pick');
  const noHScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.getElementById('eh-connect-body').scrollWidth <= window.innerWidth + 1);
  check('جوال: بلا تمرير أفقي', noHScroll);
  await clickAct(page, '.eh-connect-pick-row[data-p="kick"]'); await sleep(500); await page.fill('#eh-f', 'streamer1'); await shot(page, '12-m-form');
  await submit(page); await sleep(500); await shot(page, '13-m-prog');
  check('جوال: كيك تتصل', await waitFor(page, () => homeConnState.kick && homeConnState.kick.state === 'connected', null, 40000));
  await sleep(300); await shot(page, '14-m-ok');

  check('بلا أخطاء JS بالصفحة', page._errors.length === 0, page._errors);
  await browser.close();
  const bad = results.filter((x) => !x.ok).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})();
