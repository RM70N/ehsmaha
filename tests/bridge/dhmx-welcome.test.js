'use strict';
// ترحيب dh_mx (تصميم جاهز مدمج كما هو + ملف ربط مستقل dhmx-welcome-integration.js).
// يختبر التكامل الحقيقي مع سيرفر الجسر المحلي (tests/bridge/servers.sh — بديل tiktok-live-connector): ربط فعلي عبر
// نافذة «ربط الحساب» ومركز الربط السريع وزر إعادة الربط، لا استدعاء مباشر للترحيب. Firestore مُحاكى بخلفية ذرّية
// مشتركة بين نافذتين (جهازين) لاختبار العدّاد المركزي. ما يحتاج بث تيك توك حقيقي لكن الربط الحقيقي ما زال مطلوباً.
//   PLAYWRIGHT_PATH=... node tests/bridge/dhmx-welcome.test.js
const H = require('./harness');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '../..');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = Date.now().toString(36);
const TARGET = 'dh_mx';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');
// بصمة ملفَّي التصميم كما وصلا (نسخة حرفية من الملف المرسل بلا أي تعديل)
const DESIGN_SHA = { 'dhmx-welcome/dhmx-welcome.css': '841d7d5a5904cdd72d0756957ada9a67833c92c5362ef704a4a51837df54f3c0', 'dhmx-welcome/dhmx-welcome.js': '6bec7a18d923626da42e1558deacd240f7029827fa39307738febfcb489665aa' };

const AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#e11d48"/><circle cx="100" cy="80" r="40" fill="#fff"/></svg>');
const tt = (u, mode) => H.ctl(H.PRIMARY, { cmd: 'mode', user: u, mode });

// ---------- Firestore مُحاكى: خلفية ذرّية بإصدارات (مثل معاملة Firestore الحقيقية) مشتركة بين الصفحات ----------
const backend = new Map();
async function attachCentral(page, { delayMs = 0 } = {}) {
  if (!page._fsBound) {
    page._fsBound = true;
    await page.exposeBinding('__fsGet', async (_s, p) => { if (delayMs) await sleep(delayMs); const r = backend.get(p); return r ? { exists: true, data: r.data, ver: r.ver } : { exists: false, ver: 0 }; });
    await page.exposeBinding('__fsCommit', (_s, p, data, ver) => { const r = backend.get(p); const cur = r ? r.ver : 0; if (cur !== ver) return { ok: false }; backend.set(p, { data, ver: cur + 1 }); return { ok: true }; });
  }
  await page.evaluate(() => {
    (0, eval)('currentUser = { uid: "u-test" }');
    window.__fb = {
      db: {}, doc: (db, col, key) => ({ path: col + '/' + key }), serverTimestamp: () => Date.now(),
      runTransaction: async (db, fn) => {
        for (let i = 0; i < 12; i++) {
          const reads = {}, writes = [];
          const tx = { get: async (ref) => { const r = await window.__fsGet(ref.path); reads[ref.path] = r.ver; return { exists: () => r.exists, data: () => r.data }; }, set: (ref, data) => { writes.push([ref.path, data]); } };
          const out = await fn(tx);
          let ok = true;
          for (const [p, d] of writes) { const res = await window.__fsCommit(p, d, reads[p] || 0); if (!res.ok) { ok = false; break; } }
          if (ok) return out;
        }
        throw new Error('contention');
      }
    };
  });
}
const central = () => (backend.get('dhmxWelcome/u_dh_mx') || { data: { count: 0 } }).data.count;

async function newSitePage(browser, { central: useCentral = true, viewport, delayMs } = {}) {
  const page = await H.newPage(browser, {
    query: '?debug=0',
    context: viewport ? { viewport } : undefined,
    init: () => {
      window.__dmLog = [];
      new MutationObserver((ms) => {
        for (const m of ms) {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('dhmx-welcome-root')) window.__dmLog.push({ ev: 'add', t: performance.now() }); });
          m.removedNodes.forEach((n) => { if (n.nodeType === 1 && n.classList && n.classList.contains('dhmx-welcome-root')) window.__dmLog.push({ ev: 'remove', t: performance.now() }); });
        }
      }).observe(document, { childList: true, subtree: true });
    },
  });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });   // Firebase محجوب ببيئة الاختبار
  await page.route(/\/profile\?u=/, async (route) => {
    const u = new URL(route.request().url()).searchParams.get('u');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, uniqueId: u, nickname: u, avatar: AVATAR }) });
  });
  if (useCentral) await attachCentral(page, { delayMs });
  return page;
}
const shows = (page) => page.evaluate(() => window.__dmLog.filter((e) => e.ev === 'add').length);
const logOf = (page) => page.evaluate(() => window.__dmLog.slice());
const rootNow = (page) => page.evaluate(() => !!document.querySelector('.dhmx-welcome-root'));
const waitShown = async (page, n, ms = 12000) => { const t = Date.now(); while (Date.now() - t < ms) { if ((await shows(page)) >= n) return true; await sleep(100); } return false; };
const waitGone = async (page, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (!(await rootNow(page))) return true; await sleep(100); } return false; };
const disconnect = (page) => page.evaluate(() => { try { platformDisconnectAll(); } catch (e) {} });
async function linkModal(page, user) {   // نافذة «ربط الحساب» الحقيقية
  await page.evaluate((u) => { tiktokConnectModalOpen(); document.getElementById('tiktok-connect-username').value = u; tiktokConnectModalStart(); }, user);
  await page.waitForFunction((u) => typeof homeConnState !== 'undefined' && homeConnState.tiktok && homeConnState.tiktok.state === 'connected' && homeConnections.tiktok && homeConnections.tiktok.username.toLowerCase() === u, user, { timeout: 20000 }).catch(() => {});
  await page.evaluate(() => { try { tiktokConnectModalClose(); } catch (e) {} });
}
const connectedNow = (page) => page.evaluate(() => typeof homeConnState !== 'undefined' && !!homeConnState.tiktok && homeConnState.tiktok.state === 'connected');

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();

  // ---- 0) الملفات: نسخة حرفية من التصميم + ملف الربط المستقل + لا صفحة معاينة بالموقع
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  check('ملفا التصميم (CSS/JS) كما وصلا بالضبط (بصمة SHA-256 مطابقة)', Object.keys(DESIGN_SHA).every((f) => sha(f) === DESIGN_SHA[f]), Object.keys(DESIGN_SHA).map((f) => sha(f).slice(0, 12)));
  check('ملف الربط المستقل موجود ومحمّل بعد ملف التصميم', fs.existsSync(path.join(ROOT, 'dhmx-welcome/dhmx-welcome-integration.js')) && html.indexOf('/dhmx-welcome/dhmx-welcome.js') > 0 && html.indexOf('/dhmx-welcome/dhmx-welcome-integration.js') > html.indexOf('/dhmx-welcome/dhmx-welcome.js') && html.includes('href="/dhmx-welcome/dhmx-welcome.css"'));
  check('صفحة المعاينة غير موجودة بالموقع (لا أزرار «محاكاة/تصفير» ولا عنوان المعاينة)', !/معاينة ترحيب dh_mx|b-sim|محاكاة ربط dh_mx|تصفير العدّاد/.test(html) && !fs.existsSync(path.join(ROOT, 'dhmx-welcome/preview.html')));
  const wf = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');
  check('النشر (Pages) يشمل مجلد dhmx-welcome', /dhmx-welcome\/\*\*/.test(wf) && /cp -r dhmx-welcome _site\/dhmx-welcome/.test(wf));
  const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  check('قواعد Firestore: عدّاد الترحيب يزيد 1 فقط حتى 3 ولا حذف', /match \/dhmxWelcome\/\{key\}/.test(rules) && /resource\.data\.count \+ 1/.test(rules) && /count <= 3/.test(rules) && /allow delete: if false/.test(rules.slice(rules.indexOf('dhmxWelcome'))));

  // ---- A) حساب آخر يربط: لا شيء + فشل الاتصال: لا شيء
  let page = await newSitePage(browser);
  const readOk = await page.evaluate(() => typeof DhmxWelcome !== 'undefined' && DhmxWelcome.target === 'dh_mx' && DhmxWelcome.maxShows === 3 && DhmxWelcome.duration === 4000 && typeof dhmxWelcomeOnConnected === 'function');
  check('DhmxWelcome محمّل (target=dh_mx، 3 مرات، 4000ms) وملف الربط جاهز', readOk);
  await linkModal(page, 'other_' + RUN);
  await sleep(1500);
  check('حساب TikTok مختلف يربط بثه: لا ترحيب ولا عدّاد', (await connectedNow(page)) && (await shows(page)) === 0 && central() === 0);
  await disconnect(page);
  await page.evaluate(() => { try { tiktokConnectModalClose(); } catch (e) {} });
  // كتابة dh_mx بحقل نصي لا تشغّل شيئاً (بدون اتصال فعلي)
  await page.evaluate((u) => { const i = document.getElementById('tiktok-connect-username'); if (i) i.value = u; }, TARGET);
  await sleep(600);
  check('كتابة dh_mx بحقل نصي فقط (بدون اتصال ناجح) لا تشغّل الترحيب', (await shows(page)) === 0 && central() === 0);
  // إعادة اتصال/ربط تلقائي صامت (بدون نية مستخدم) لحساب dh_mx: لا ترحيب
  await page.evaluate((u) => { homeConnSetState && platformConnect('tiktok', { username: u }, homeDispatchToGameListeners, function () {}); }, TARGET);
  await page.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 15000 }).catch(() => {});
  await sleep(1500);
  check('ربط تلقائي صامت (بدون ضغط ربط من المستخدم) لـ dh_mx: لا ترحيب ولا عدّاد', (await connectedNow(page)) && (await shows(page)) === 0 && central() === 0);
  await disconnect(page);

  // ---- B) الحساب المحدد: ثلاث مرات (نافذة الربط الحقيقية) والرابعة لا
  const firstLink = await (async () => {
    await linkModal(page, TARGET);
    return waitShown(page, 1);
  })();
  check('الربط الأول لـ dh_mx: يظهر الترحيب', firstLink && (await connectedNow(page)));

  // تصميم الترحيب الأصلي: عناصره وصورة الحساب والأنيميشن والمدة
  const d1 = await page.evaluate(() => {
    const r = document.querySelector('.dhmx-welcome-root');
    if (!r) return null;
    const q = (s) => r.querySelector(s);
    const img = q('.dm-avatar img');
    const box = r.getBoundingClientRect();
    const em = q('.dm-emblem').getBoundingClientRect();
    return {
      fixed: getComputedStyle(r).position === 'fixed', full: box.width >= innerWidth - 1 && box.height >= innerHeight - 1, z: getComputedStyle(r).zIndex, pe: getComputedStyle(r).pointerEvents,
      parts: ['.dm-dim', '.dm-core', '.dm-rays', '.dm-floor', '.dm-shards-far', '.dm-shards-near', '.dm-streaks', '.dm-hud-c.tl', '.dm-hud-c.br', '.dm-rail.l', '.dm-hline.t', '.dm-stage', '.dm-emblem', '.dm-rings', '.dm-wave', '.dm-avatar', '.dm-sheen', '.dm-handle', '.dm-hello', '.dm-plate-wrap', '.dm-plate', '.dm-orn'].filter((s) => !q(s)),
      pts: r.querySelectorAll('.dm-pt').length, words: [...r.querySelectorAll('.dm-w')].map((x) => x.textContent), name: q('.dm-name').textContent, plate: q('.dm-txt').textContent,
      avatar: img ? { src: img.getAttribute('src') === decodeURI(img.getAttribute('src')) ? img.getAttribute('src') : img.getAttribute('src'), nw: img.naturalWidth, rect: img.getBoundingClientRect().width } : null,
      fallback: !!q('.dm-fallback'), play: r.classList.contains('dm-play'),
      anims: r.getAnimations ? r.getAnimations({ subtree: true }).length : -1,
      emblemInside: em.left >= 0 && em.right <= innerWidth && em.top >= 0 && em.bottom <= innerHeight,
    };
  });
  check('الترحيب: الطبقة ثابتة بملء الشاشة وفوق كل النوافذ ولا تعترض النقر', d1 && d1.fixed && d1.full && Number(d1.z) >= 2147483000 && d1.pe === 'none', d1 && { f: d1.fixed, full: d1.full, z: d1.z, pe: d1.pe });
  check('كل عناصر التصميم الأصلي حاضرة (خلفية/أشعة/أرضية/شظايا/حلقات/صورة/اسم/ترحيب/لوحة)', d1 && d1.parts.length === 0, d1 && d1.parts);
  check('النصوص كما بالتصميم: dh_mx + خمس كلمات ترحيب + «أفضل واقوى ستريمر»', d1 && d1.name === 'dh_mx' && JSON.stringify(d1.words) === JSON.stringify(['ياهلا', 'ومرحبا', 'ارحب', 'تراحيب', 'المطر']) && d1.plate === 'أفضل واقوى ستريمر', d1 && { n: d1.name, w: d1.words, p: d1.plate });
  check('جسيمات الموشن حاضرة (30 على الكمبيوتر)', d1 && d1.pts === 30, d1 && d1.pts);
  check('صورة حساب TikTok الحقيقية (من خدمة الجسر) داخل مكانها ولا بديل «DH»', d1 && d1.avatar && d1.avatar.nw > 0 && d1.avatar.rect > 20 && !d1.fallback, d1 && { a: d1.avatar && { nw: d1.avatar.nw, rect: d1.avatar.rect }, fb: d1.fallback });
  check('الأنيميشن يعمل (CSS animations جارية على الطبقات) والأيقونة/الإطار داخل الشاشة', d1 && d1.play && d1.anims > 20 && d1.emblemInside, d1 && { anims: d1.anims, inside: d1.emblemInside });

  // أثناء الترحيب: التعليقات تصل + الموقع يستجيب + الطبقة لا تحجب النقر
  const got = [];
  await page.evaluate(() => { window.__chat = []; homeRegisterGameListener('dhmxtest', (evt) => { window.__chat.push(JSON.stringify(evt).slice(0, 200)); }); });
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: TARGET, viewer: 'viewer_' + RUN, text: 'تعليق أثناء الترحيب', identity: { isFollowerOfAnchor: true } });
  await sleep(700);
  const during = await page.evaluate(() => {
    const r = document.querySelector('.dhmx-welcome-root');
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return { still: !!r, hitInside: !!(r && hit && r.contains(hit)), chat: window.__chat.length, conn: homeConnState.tiktok && homeConnState.tiktok.state };
  });
  check('التعليقات تستمر بالوصول أثناء الترحيب والاتصال مستمر', during.still && during.chat >= 1 && during.conn === 'connected', during);
  check('الطبقة لا تحجب النقر على الموقع أثناء العرض', during.still && !during.hitInside, during);
  await page.evaluate(() => homeUnregisterGameListener && homeUnregisterGameListener('dhmxtest'));

  check('الترحيب يختفي تلقائياً وتُزال كل طبقاته', await waitGone(page));
  const lg = await logOf(page);
  const dur = lg.length >= 2 ? Math.round(lg[1].t - lg[0].t) : -1;
  check('مدة الترحيب 4 ثوانٍ كاملة تشمل الدخول والخروج (±250ms)', Math.abs(dur - 4000) <= 250, dur);
  const after = await page.evaluate(() => ({ roots: document.querySelectorAll('.dhmx-welcome-root,[data-dhmx-welcome]').length, bodyStyle: document.body.getAttribute('style') || '', ov: !!document.querySelector('.dm-dim'), conn: homeConnState.tiktok.state, anims: document.getAnimations().filter((a) => /dm-/.test(a.animationName || '')).length }));
  check('بعد الانتهاء: لا طبقة ولا خلفية معتمة ولا حركات تعمل، والاتصال مستمر', after.roots === 0 && !after.ov && after.conn === 'connected' && after.anims === 0, after);
  const usable = await page.evaluate(() => { try { show('ahsemha-home'); show('home'); return document.querySelector('.page.active').id; } catch (e) { return e.message; } });
  check('الموقع يعمل بصورة طبيعية بعد الترحيب (التنقل بين الصفحات)', usable === 'pg-home', usable);
  check('العدّاد المركزي = 1 بعد الظهور الأول (Firestore)', central() === 1, central());

  // الربط الثاني والثالث (نفس الحساب): نافذة الربط، ثم مركز الربط السريع، ثم زر إعادة الربط
  await disconnect(page);
  await linkModal(page, TARGET);
  check('الربط الثاني لـ dh_mx (نافذة الربط): يظهر الترحيب', await waitShown(page, 2) && central() === 2, central());
  await waitGone(page);
  await disconnect(page);
  await page.evaluate((u) => { try { tiktokSavedUsersUpsert(u); } catch (e) {} tiktokQuickReconnect(u); }, TARGET);
  await page.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 20000 }).catch(() => {});
  check('الربط الثالث لـ dh_mx (زر إعادة الربط): يظهر الترحيب', await waitShown(page, 3) && central() === 3, central());
  await waitGone(page);
  await disconnect(page);
  await linkModal(page, TARGET);
  await sleep(2000);
  check('الربط الرابع لـ dh_mx: لا يظهر نهائياً', (await shows(page)) === 3 && central() === 3 && !(await rootNow(page)), { shows: await shows(page), c: central() });
  // مركز الربط السريع (زر «ابدأ بثاً سريعاً» الرئيسي): نفس السلوك (الرابعة لا تظهر)
  await disconnect(page);
  await page.evaluate(() => homeOpenQuickConnect());
  await page.waitForSelector('.eh-connect-pick-row[data-p="tiktok"]', { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('.eh-connect-pick-row[data-p="tiktok"]'); b && b.click(); });
  await sleep(600);
  await page.evaluate((u) => { const i = document.getElementById('eh-f'); if (i) { i.value = u; i.dispatchEvent(new Event('input', { bubbles: true })); } }, TARGET);
  await page.evaluate(() => { const b = document.querySelector('.eh-connect-formcol button[type=submit]'); b && b.click(); });
  await page.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 20000 }).catch(() => {});
  await sleep(1500);
  check('مركز الربط السريع بعد استنفاد الثلاث: لا ترحيب والاتصال شغّال', (await connectedNow(page)) && (await shows(page)) === 3 && central() === 3);

  // ---- C) تحديث الصفحة + انقطاع/إعادة اتصال: لا يُحتسب
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof DhmxWelcome !== 'undefined', null, { timeout: 15000 });
  await attachCentral(page);
  await sleep(2500);
  check('تحديث الصفحة: العدّاد باقٍ 3 (لا يُصفَّر) ولا ترحيب (ربط تلقائي صامت)', central() === 3 && (await shows(page)) === 0);

  // جهاز جديد: عدّاد مركزي = 3 لكن مخزن الجهاز فارغ → لا يظهر (التخزين المركزي هو المرجع)
  const dev2 = await newSitePage(browser);
  await linkModal(dev2, TARGET);
  await sleep(2500);
  check('جهاز آخر/نافذة جديدة بعد 3 مرات: لا يظهر (العدّاد مركزي)', (await shows(dev2)) === 0 && central() === 3);
  await dev2.context().close();

  // انقطاع الشبكة وإعادة الاتصال التلقائية لا تحسب ظهوراً (نستخدم حساباً لم يستنفد عدّاده: عدّاد جديد)
  backend.clear();
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  const net = await newSitePage(browser);
  await linkModal(net, TARGET);
  check('(عدّاد جديد) الربط الأول: يظهر', await waitShown(net, 1) && central() === 1);
  await waitGone(net);
  await H.ctl(H.PRIMARY, { cmd: 'dropUpstream', user: TARGET });
  await net.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state !== 'connected', null, { timeout: 15000 }).catch(() => {});
  await net.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  check('انقطاع الاتصال من السيرفر ثم عودته تلقائياً: لا ظهور جديد ولا عدّاد جديد', (await connectedNow(net)) && (await shows(net)) === 1 && central() === 1, { shows: await shows(net), c: central() });
  await net.evaluate(() => { try { homeConnections.tiktok.ws.close(4000); } catch (e) {} });
  await net.waitForFunction(() => homeConnState.tiktok && homeConnState.tiktok.state === 'connected', null, { timeout: 40000 }).catch(() => {});
  await sleep(1500);
  check('قطع اتصال الجهاز (WebSocket) وإعادة الاتصال التلقائية: لا ظهور جديد', (await connectedNow(net)) && (await shows(net)) === 1 && central() === 1, { shows: await shows(net), c: central() });
  // حدث «connected» مكرر + استدعاء الربط مرتين متتاليتين: ترحيب واحد فقط
  await disconnect(net);
  await net.evaluate((u) => { dhmxWelcomeNoteIntent(); homeConnections.tiktok = { username: u, ws: null, attempts: 0 }; homeConnSetState('tiktok', 'connecting'); homeConnSetState('tiktok', 'connected'); homeConnSetState('tiktok', 'connected'); dhmxWelcomeOnConnected('tiktok'); dhmxWelcomeOnConnected('tiktok'); }, TARGET);
  check('حدث الاتصال مكرر (×4 نداءات): ترحيب واحد فقط والعدّاد +1', await waitShown(net, 2) && (await sleep(1200), (await shows(net)) === 2) && central() === 2, { shows: await shows(net), c: central() });
  await waitGone(net);
  await net.context().close();

  // ---- D) سباق بين جهازين (نافذتين) على آخر مرتين: لا يتجاوز 3 إجمالاً
  backend.clear();
  backend.set('dhmxWelcome/u_dh_mx', { data: { count: 2, attempts: ['x1', 'x2'] }, ver: 1 });
  const A = await newSitePage(browser, { delayMs: 150 });
  const B = await newSitePage(browser, { delayMs: 150 });
  const fire = (p) => p.evaluate((u) => { dhmxWelcomeNoteIntent(); homeConnections.tiktok = { username: u, ws: null, attempts: 0 }; homeConnSetState('tiktok', 'connecting'); homeConnSetState('tiktok', 'connected'); }, TARGET);
  await Promise.all([fire(A), fire(B)]);
  await sleep(2500);
  const tot = (await shows(A)) + (await shows(B));
  check('نافذتان (جهازان) تربطان معاً وبقي ظهور واحد: يظهر مرة واحدة فقط ولا يتجاوز 3', tot === 1 && central() === 3, { tot, c: central() });
  await waitGone(A); await waitGone(B);
  await A.context().close(); await B.context().close();

  // ---- E) الجوال: لا عناصر مقصوصة + جسيمات أقل
  backend.clear();
  const mob = await newSitePage(browser, { viewport: { width: 390, height: 780 } });
  await linkModal(mob, TARGET);
  check('الجوال: الربط الأول يظهر الترحيب', await waitShown(mob, 1));
  await sleep(2300);
  const m = await mob.evaluate(() => {
    const r = document.querySelector('.dhmx-welcome-root'); if (!r) return null;
    const inV = (e) => { const b = e.getBoundingClientRect(); return b.left >= -1 && b.right <= innerWidth + 1 && b.top >= -1 && b.bottom <= innerHeight + 1; };
    const sel = ['.dm-emblem', '.dm-handle', '.dm-hello', '.dm-plate-wrap'];
    return { out: sel.filter((s) => !inV(r.querySelector(s))), pts: r.querySelectorAll('.dm-pt').length, vw: innerWidth };
  });
  check('الجوال 390px: الأيقونة والاسم والترحيب واللوحة داخل الشاشة بلا قص (وجسيمات أقل)', m && m.out.length === 0 && m.pts === 12, m);
  await waitGone(mob);
  check('الجوال: الترحيب يختفي ويعود الموقع طبيعياً', !(await rootNow(mob)) && (await connectedNow(mob)));

  // ---- G) فشل اتصال TikTok للحساب المحدد (آخر اختبار: السيرفر يخزّن «غير موجود» للحساب)
  backend.clear();
  const bad = await newSitePage(browser);
  await H.ctl(H.PRIMARY, { cmd: 'streamEnd', user: TARGET }); await sleep(800);
  await tt(TARGET, 'user_not_found');
  await bad.evaluate((u) => { tiktokConnectModalOpen(); document.getElementById('tiktok-connect-username').value = u; tiktokConnectModalStart(); }, TARGET);
  await sleep(5000);
  check('فشل اتصال TikTok (الحساب المحدد غير موجود/البث منتهٍ): لا ترحيب ولا عدّاد ولا اتصال', !(await connectedNow(bad)) && (await shows(bad)) === 0 && central() === 0);
  await tt(TARGET, 'live');
  await bad.context().close();

  // ---- F) أخطاء الصفحة
  const errs = [].concat(page._errors, mob._errors).filter((e) => !/Failed to load resource|ERR_/.test(e));
  check('لا أخطاء JS/Console جديدة أثناء كل المسارات', errs.length === 0 && page._consoleErrors.length === 0 && mob._consoleErrors.length === 0, { errs, c: page._consoleErrors.concat(mob._consoleErrors).slice(0, 3) });

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
