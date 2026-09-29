'use strict';
// اختبار الواجهة الحقيقية (Playwright) لشكوى "خدمة تيك توك مزدحمة… انتظر دقيقة":
// يشغّل سيرفر الجسر الحقيقي (بمحاكي المكتبة) ويضغط "ابدأ بثاً سريعاً" بالمسارات الثلاثة، ويثبت:
//   - أثناء أي فشل مؤقت (429 لفترة أطول من 30ث القديمة) لا تظهر رسالة فشل/"مزدحمة"، ويظهر تقدّم الطابور/المحاولة،
//     ثم يتصل تلقائياً لما يرجع المزود.
//   - الفشل النهائي فقط بعد استنفاد المحاولات، بسبب واضح + زر "إعادة المحاولة" الذي يعمل.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/frontend-resilience.test.js
const path = require('path');
const { spawn } = require('child_process');
const H = require('./harness');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const BAD = /مزدحمة|انتظر دقيقة/;

const children = [];
const byPort = new Map();
async function restartBridge(port, ctlPort, env) {
  const old = byPort.get(port);
  if (old) { try { old.kill('SIGKILL'); } catch (e) { /* ignore */ } await sleep(300); }
  const c = startBridge(port, ctlPort, env);
  byPort.set(port, c);
  await waitHealthy(port);
  return c;
}
function startBridge(port, ctlPort, env) {
  const child = spawn(process.execPath, [path.join(__dirname, 'start-server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), CTL_PORT: String(ctlPort), BRIDGE_HEARTBEAT_MS: '5000', EULER_API_KEY: '', EULER_SIGN_API_KEY: '', SIGN_API_KEY: '' }, env || {}),
    stdio: 'ignore',
  });
  children.push(child);
  return child;
}
async function waitHealthy(port) {
  for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/healthz'); if (r.ok) return; } catch (e) { /* not yet */ } await sleep(100); }
  throw new Error('bridge did not start on ' + port);
}

// يجمع كل ما يراه المستخدم: نصوص toast، نص الشاشة والشارة، وحالة أزرار الفشل، مع الزمن.
async function instrument(page) {
  await page.evaluate(() => {
    window.__seen = [];
    const rec = (kind, text) => window.__seen.push({ t: Date.now(), kind, text });
    const t = window.toast;
    window.toast = function (m) { rec('toast', String(m)); return t.apply(this, arguments); };
    const sub = document.getElementById('qc-connecting-sub');
    const title = document.querySelector('#qc-connecting-overlay .qc-connecting-text');
    const badge = document.getElementById('home-conn-badge-text');
    const obs = (el, kind) => { if (el) new MutationObserver(() => rec(kind, el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); };
    obs(sub, 'overlay-sub'); obs(title, 'overlay-title'); obs(badge, 'badge');
  });
}
const seen = (page) => page.evaluate(() => window.__seen.slice());
const ui = (page) => page.evaluate(() => ({
  overlayVisible: document.getElementById('qc-connecting-overlay').classList.contains('visible'),
  title: document.querySelector('#qc-connecting-overlay .qc-connecting-text').textContent,
  sub: document.getElementById('qc-connecting-sub').textContent,
  actionsVisible: getComputedStyle(document.getElementById('qc-connecting-actions')).display !== 'none',
  badge: document.getElementById('home-conn-badge-text').textContent,
  connected: typeof homeConnState !== 'undefined' && !!homeConnState.tiktok && homeConnState.tiktok.state === 'connected',
}));

(async () => {
  // ---------------------------------------------------------------- سيرفر احتياطي عادي (الأساسي يُعاد تشغيله بإعداد كل سيناريو: حالة مزودين نظيفة)
  await restartBridge(18082, 19082, {});
  await H.serveSite();
  const browser = await H.launchBrowser();

  // ================================================================ 1) "ابدأ بثاً سريعاً — @يوزر" (tiktokQuickReconnect) مع 429 طويل
  {
    const user = 'ux429';
    await restartBridge(18081, 19081, { TIKTOK_PROGRESS_TICK_MS: '1000', TIKTOK_BREAKER_COOLDOWN_MS: '2000', TIKTOK_RETRY_BASE_MS: '400', TIKTOK_RETRY_MAX_MS: '1500', TIKTOK_PARKED_RETRY_MS: '600000' });
    await H.ctl(H.PRIMARY, { cmd: 'retryAfter', sec: 8 });
    await H.ctl(H.PRIMARY, { cmd: 'mode', user, mode: 'rate_limited_typed' });
    const page = await H.newPage(browser);
    await instrument(page);
    await page.evaluate((u) => { tiktokSavedUsersUpsert(u); homeQuickReconnectClick(); }, user);
    const t0 = Date.now();
    await sleep(36000); // أطول من مهلة الـ30ث القديمة التي كانت تُظهر رسالة "مزدحمة"
    const mid = await ui(page);
    const seenMid = await seen(page);
    check('[1] بعد 36ث من 429 متواصل: لا رسالة فشل ولا "مزدحمة" (كانت تظهر عند 30ث)', !seenMid.some((x) => BAD.test(x.text) || (x.kind === 'toast' && /⚠️|⛔/.test(x.text))) && !mid.actionsVisible, seenMid.filter((x) => x.kind === 'toast').map((x) => x.text));
    check('[1] الشاشة تعرض التقدم (طابور/محاولة) بدل الصمت', seenMid.some((x) => x.kind === 'overlay-sub' && /محاولة رقم|الطابور/.test(x.text)), seenMid.filter((x) => x.kind === 'overlay-sub').map((x) => x.text).slice(-3));
    check('[1] الواجهة غير محجوبة بعد 25ث (يكمل بالخلفية) والشارة "جاري الاتصال…" — لا "غير متصل" ولا أزرار فشل', !mid.overlayVisible && !mid.actionsVisible && /جاري الاتصال/.test(mid.badge) && !mid.connected, { overlay: mid.overlayVisible, badge: mid.badge });
    await H.ctl(H.PRIMARY, { cmd: 'mode', user, mode: 'live' }); // المزود رجع
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { await sleep(1000); up = (await ui(page)).connected; }
    const fin = await ui(page);
    const seenEnd = await seen(page);
    check('[1] المزود رجع ← يتصل تلقائياً بلا أي ضغطة', up, { afterSec: Math.round((Date.now() - t0) / 1000) });
    check('[1] الشاشة أُغلقت والشارة "متصل" والمستخدم ما شاف أي فشل', !fin.overlayVisible && /متصل/.test(fin.badge) && !seenEnd.some((x) => BAD.test(x.text)) && !seenEnd.some((x) => x.kind === 'toast' && /⚠️|⛔/.test(x.text)), { badge: fin.badge, toasts: seenEnd.filter((x) => x.kind === 'toast').map((x) => x.text) });
    await page.context().close();
  }

  // ================================================================ 2) فشل نهائي حقيقي ← سبب واضح + "إعادة المحاولة" تعمل
  {
    const user = 'uxfail';
    await restartBridge(18081, 19081, { TIKTOK_PROGRESS_TICK_MS: '1000', TIKTOK_MAX_ATTEMPTS: '4', TIKTOK_RETRY_BASE_MS: '300', TIKTOK_RETRY_MAX_MS: '800', TIKTOK_BREAKER_THRESHOLD: '100', TIKTOK_PARKED_RETRY_MS: '600000' });
    await H.ctl(H.PRIMARY, { cmd: 'mode', user, mode: 'sign_failed' });
    const page = await H.newPage(browser);
    await instrument(page);
    await page.evaluate((u) => { tiktokSavedUsersUpsert(u); homeQuickReconnectClick(); }, user);
    let failed = false;
    for (let i = 0; i < 60 && !failed; i++) { await sleep(1000); failed = (await ui(page)).actionsVisible; }
    const f = await ui(page);
    const s1 = await seen(page);
    check('[2] بعد استنفاد المحاولات: شاشة فشل واضحة بسبب + زر "إعادة المحاولة"', failed && /تعذّر الربط/.test(f.title) && /توقيع/.test(f.sub) && /إعادة المحاولة/.test(f.sub), { title: f.title, sub: f.sub });
    check('[2] لا "مزدحمة/انتظر دقيقة" حتى بالفشل النهائي', !s1.some((x) => BAD.test(x.text)));
    check('[2] قبل الفشل النهائي ما ظهر أي toast فشل', !s1.some((x) => x.kind === 'toast' && /⚠️|⛔/.test(x.text) && !/تعذّر الربط/.test(x.text)), s1.filter((x) => x.kind === 'toast').map((x) => x.text));
    await H.ctl(H.PRIMARY, { cmd: 'mode', user, mode: 'live' }); // المشكلة زالت
    await page.evaluate(() => document.getElementById('qc-retry-btn').click()); // (Firebase محجوب بالاختبار فيبقى auth-loader فوق الصفحة، فنضغط الزر برمجياً)
    let up = false;
    for (let i = 0; i < 20 && !up; i++) { await sleep(500); up = (await ui(page)).connected; }
    const r = await ui(page);
    check('[2] زر "إعادة المحاولة" يعمل: يتصل ويُغلق شاشة الفشل', up && !r.overlayVisible && !r.actionsVisible && /متصل/.test(r.badge), r);
    await page.context().close();
  }

  // ================================================================ 3) نافذة "ابدأ بثاً سريعاً" (homeStartQuickConnect) مع طابور + 429
  {
    const user = 'uxmodal';
    await restartBridge(18081, 19081, { TIKTOK_PROGRESS_TICK_MS: '1000', TIKTOK_BREAKER_COOLDOWN_MS: '2000', TIKTOK_RETRY_BASE_MS: '400', TIKTOK_RETRY_MAX_MS: '1500' });
    await H.ctl(H.PRIMARY, { cmd: 'retryAfter', sec: 6 });
    await H.ctl(H.PRIMARY, { cmd: 'script', user, modes: ['rate_limited_typed', 'rate_limited_typed', 'rate_limited_typed', 'live'] });
    const page = await H.newPage(browser);
    await instrument(page);
    await page.evaluate((u) => { homeOpenQuickConnect(); document.getElementById('qc-main-input').value = u; homeStartQuickConnect(); }, user);
    let up = false;
    for (let i = 0; i < 90 && !up; i++) { await sleep(1000); up = (await ui(page)).connected; }
    const seen3 = await seen(page);
    const fin = await ui(page);
    check('[3] "ابدأ بثاً سريعاً" (النافذة) مع 3×429: يتصل تلقائياً', up, { badge: fin.badge });
    check('[3] لا رسالة فشل/"مزدحمة" ظهرت للمستخدم', !seen3.some((x) => BAD.test(x.text)) && !seen3.some((x) => x.kind === 'toast' && /⚠️|⛔/.test(x.text)), seen3.filter((x) => x.kind === 'toast').map((x) => x.text));
    check('[3] الشارة عرضت "جاري الاتصال…" (لا "غير متصل" الموحية بالفشل) أثناء المحاولات', seen3.some((x) => x.kind === 'badge' && /جاري الاتصال/.test(x.text)), seen3.filter((x) => x.kind === 'badge').map((x) => x.text).slice(0, 4));
    check('[3] عُرض رقم المحاولة/الطابور', seen3.some((x) => (x.kind === 'overlay-sub' || x.kind === 'badge') && /محاولة|الطابور/.test(x.text)), seen3.filter((x) => /محاولة|الطابور/.test(x.text)).slice(0, 2));
    await page.context().close();
  }

  // ================================================================ 4) عدم وجود أخطاء JS
  {
    const page = await H.newPage(browser);
    await page.waitForTimeout(1500);
    check('[4] لا أخطاء JavaScript بالصفحة', page._errors.length === 0, page._errors.slice(0, 3));
    await page.context().close();
  }

  await browser.close();
  children.forEach((c) => { try { c.kill('SIGKILL'); } catch (e) { /* ignore */ } });
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED / ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); children.forEach((c) => { try { c.kill('SIGKILL'); } catch (x) { /* ignore */ } }); process.exit(1); });
