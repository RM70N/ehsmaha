'use strict';
// «انصب علي» (مركز الاتصالات 3D) كلعبة فردية بالموقع: البطاقة ← الصفحة ← الإطار ← سيرفرا Render (/cc/v1 + Gemini) — من المتصفح الحقيقي.
// يحتاج: محاكي Gemini + السيرفران (الأساسي 18081 والاحتياطي 18082) بنفس المفتاح الوهمي:
//   MOCK_GEMINI_PORT=19500 node tests/bridge/mock-gemini.js &
//   GEMINI_API_BASE=http://127.0.0.1:19500 GEMINI_API_KEY=AIzaSyDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD444 PORT=18081 CTL_PORT=19081 node tests/bridge/start-server.js &
//   GEMINI_API_BASE=http://127.0.0.1:19500 GEMINI_API_KEY=AIzaSyDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD444 PORT=18082 CTL_PORT=19082 node tests/bridge/start-server.js &
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/callcenter.test.js   (SHOTS=/dir للقطات)
const H = require('./harness');
const fs = require('fs');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const SHOTS = process.env.SHOTS; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const MOCK = 'http://127.0.0.1:' + (process.env.MOCK_GEMINI_PORT || 19500);
const PORTS = { 'ehsmaha-wbkn.onrender.com': 18081, 'ehsmaha.onrender.com': 18082 };
const mockCtl = (mode) => fetch(MOCK + '/__mode', { method: 'POST', body: JSON.stringify({ mode }) });
const mockCalls = () => fetch(MOCK + '/__calls').then((r) => r.json());

async function newGamePage(browser, opts) {
  opts = opts || {};
  const page = await H.newPage(browser, { query: '?debug=0' });
  const hits = []; page._cc = hits; page._ccMode = Object.assign({ down: {}, noChat: {} }, opts.mode || {});
  await page.route(/onrender\.com\/cc\/v1\//, async (route) => {
    const req = route.request(), u = new URL(req.url()), port = PORTS[u.host];
    hits.push(u.host + u.pathname);
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Content-Type, Authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS' } });
    if (page._ccMode.down[u.host]) return route.abort('connectionrefused');
    if (page._ccMode.noChat[u.host] && /config$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, stage: 'public', caps: { chat: false, stt: false, tts: false } }) });
    try {
      const r = await fetch('http://127.0.0.1:' + port + u.pathname, { method: req.method(), headers: req.headers(), body: req.method() === 'POST' ? req.postData() : undefined });
      const buf = Buffer.from(await r.arrayBuffer()); const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      await route.fulfill({ status: r.status, headers: h, body: buf });
    } catch (e) { await route.abort('connectionrefused'); }
  });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  await page.setViewportSize({ width: 1280, height: 800 });
  return page;
}
const frameOf = (page) => page.frames().find((f) => /callcenter3d\.html/.test(f.url()));
async function waitPhase(page, phase, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 60000)) { const f = frameOf(page); const ph = f && await f.evaluate(() => window.CC && CC.state && CC.state.phase).catch(() => null); if (ph === phase) return true; await sleep(300); } return false; }
async function waitFrame(page, fn, arg, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms || 20000)) { const f = frameOf(page); if (f) { const v = await f.evaluate(fn, arg).catch(() => null); if (v) return v; } await sleep(200); } return null; }

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  await mockCtl('ok');

  // ================= 1) البطاقة بالألعاب الفردية =================
  let page = await newGamePage(browser);
  const card = await page.evaluate(() => { const c = document.querySelector('#pg-solo-home .gcard[data-tag="callcenter"]'); return c && { name: c.querySelector('.gcard-name').textContent.trim(), desc: c.querySelector('.gcard-desc').textContent.length, svg: !!c.querySelector('.gcard-icon svg'), onclick: c.getAttribute('onclick'), firstOfGrid: c.parentElement.querySelector('.gcard') === c }; });
  check('بطاقة «انصب علي» ضمن الألعاب الفردية بأيقونة ووصف', card && card.name === 'انصب علي' && card.svg && card.desc > 20 && card.onclick === 'goCallCenter()', card);
  check('اللعبة ليست بمكتبة ألعاب الستريمر (فردية فقط)', await page.evaluate(() => !document.querySelector('#pg-home .gcard[data-tag="callcenter"]')));
  check('ملف اللعبة الرئيسي فيه واجهة «نصب» الجديدة (صفحة لكل طريقة) وربط reqId', (() => { const g = fs.readFileSync(__dirname + '/../../callcenter3d.html', 'utf8'); return g.includes('data-card=') && g.includes('K.collect = function (input, reqIdIn)') && g.includes('drawMethodPage'); })());

  // ================= 2) الفتح بالضغط ← إطار ← خادم Render ← محادثة حية =================
  await page.evaluate(() => document.querySelector('#pg-solo-home .gcard[data-tag="callcenter"]').click());
  check('الضغط على البطاقة يفتح صفحة اللعبة بملء الشاشة', await page.evaluate(() => document.getElementById('pg-callcenter').classList.contains('active') && getComputedStyle(document.getElementById('pg-callcenter')).position === 'fixed'));
  check('اللعبة تقلع داخل الإطار وتصل للقائمة', await waitPhase(page, 'menu', 90000));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/01-menu.png' });
  let st = await frameOf(page).evaluate(() => ({ kind: CC.auth.kind, caps: CC.auth.caps, base: CC.apiBase(), mode: CC.settings.mode, hostReady: CC.host.ready, sid: !!CC.auth.sessionId }));
  check('المرجع «خادم» والمحادثة الحية (Gemini) الافتراضية أول مرة', st.kind === 'remote' && st.mode === 'live' && st.sid, st);
  check('صلاحيات الخادم: محادثة + صوت→نص + نص→صوت', st.caps.chat && st.caps.stt && st.caps.tts, st.caps);
  check('الإطار يتصل بسيرفر Render الأساسي (https://ehsmaha-wbkn.onrender.com)', st.base === 'https://ehsmaha-wbkn.onrender.com' && page._cc.some((h) => /ehsmaha-wbkn\.onrender\.com\/cc\/v1\/session/.test(h)), { st, hits: page._cc.slice(0, 6) });
  check('القائمة تعرض «محادثة حية» (Gemini) مفعّلة', await frameOf(page).evaluate(() => /محادثة حية/.test(document.getElementById('cc').textContent) && !/ما انضبطت|غير متاح الحين/.test(document.getElementById('cc').textContent)));

  // ================= 3) يوم كامل بالواجهة الحقيقية: دوام ← مكالمة ← رسالة بـGemini ← إنهاء =================
  await frameOf(page).evaluate(() => document.getElementById('mn-play').click());
  check('ابدأ أول يوم ← شاشة اليوم', await waitPhase(page, 'intro', 15000));
  await frameOf(page).evaluate(() => document.getElementById('di-go').click());
  check('ابدأ الدوام ← المكتب (shift)', await waitPhase(page, 'shift', 20000));
  if (SHOTS) await page.screenshot({ path: SHOTS + '/02-office.png' });
  await frameOf(page).evaluate(() => { CC.calls.ring(); });
  check('رنّة الهاتف ← المكالمة تُجاب', await waitFrame(page, () => { if (CC.calls.state === 'ringing') { CC.calls.answer(); } return CC.calls.state === 'active' || CC.calls.state === 'connecting'; }, null, 15000));
  await waitFrame(page, () => CC.calls.state === 'active' && !!CC.calls.call, null, 15000);
  const callInfo = await frameOf(page).evaluate(() => ({ id: CC.calls.call && CC.calls.call.id, caller: CC.calls.call && CC.calls.call.caller && CC.calls.call.caller.name, log: CC.calls.log.length }));
  check('المكالمة بدأت من الخادم (متصل بشخصية واسم وافتتاحية)', callInfo.id && callInfo.caller && callInfo.log >= 1, callInfo);
  const before = (await mockCalls()).n;
  await frameOf(page).evaluate(() => { CC.calls.send('السلام عليكم معك سعد من شركة الاتصالات'); });
  const replied = await waitFrame(page, () => { const l = CC.calls.log[CC.calls.log.length - 1]; return l && /أهلين فيك/.test(JSON.stringify(l)) ? JSON.stringify(l).slice(0, 200) : null; }, null, 20000);
  check('رسالة اللاعب ← الخادم ← Gemini ← رد المتصل يظهر بسجل المكالمة', !!replied, await frameOf(page).evaluate(() => CC.calls.log.slice(-3).map((l) => JSON.stringify(l).slice(0, 120))));
  const after = await mockCalls();
  check('طلب Gemini فعلي وصل المحاكي بنموذج الدردشة', after.n > before && after.calls.some((c) => c.kind === 'chat' && /gemini/.test(c.model)), after.calls.slice(-3));
  // الصوت: نص→صوت (TTS) بعد الرد، والمتصفح يفك الـWAV
  const tts = await frameOf(page).evaluate(async () => { const l = CC.calls.log[CC.calls.log.length - 1]; const id = l && (l.id || (l.line && l.line.id) || (l.reply && l.reply.id)); const r = await CC.auth.tts({ replyId: id || 'x' }); if (!r || !r.audio) return { ok: false, id }; const ctx = new (window.AudioContext || window.webkitAudioContext)(); const buf = await ctx.decodeAudioData(r.audio.slice(0)); ctx.close(); return { ok: true, dur: buf.duration, id }; });
  check('نص→صوت: الخادم يرجع WAV صالح يفكه المتصفح', tts.ok && tts.dur > 0.1, tts);
  const stt = await frameOf(page).evaluate(async () => { const r = await CC.auth.stt(new Blob([new Uint8Array(3000)], { type: 'audio/webm' }), 'audio/webm', 1500); return r; });
  check('صوت→نص: الخادم يرجع النص المفرّغ', stt && stt.ok && /السلام عليكم/.test(stt.text), stt);
  await frameOf(page).evaluate(() => { CC.calls.hangup(); });
  check('إنهاء المكالمة ← تسوية من الخادم', await waitFrame(page, () => CC.calls.state === 'ended' || CC.calls.state === 'idle', null, 15000));
  const cp = await frameOf(page).evaluate(() => { const v = CC.store.get('cc3d.remote.cp.v1', null); return v && { sig: typeof v.s === 'string', hasProfile: !!(v.d && v.d.profile) }; });
  check('نقطة حفظ موقّعة من الخادم بجهاز اللاعب', cp && cp.sig && cp.hasProfile, cp);

  // ================= 4) أعطال Gemini: رسالة عربية، ثم تعافٍ =================
  await mockCtl('503');
  const errR = await frameOf(page).evaluate(async () => { const s = await CC.auth.call('call/start', {}); if (!s.call) return { noCall: s }; const r = await CC.auth.call('call/turn', { callId: s.call.id, msgId: 'e1', text: 'مرحبا' }); return { ok: r.ok, retryable: r.retryable, msg: r.msg, callId: s.call.id }; });
  check('Gemini واقع: خطأ عربي قابل للإعادة (بلا رد مخترع)', errR && errR.ok === false && errR.retryable === true && /[؀-ۿ]/.test(errR.msg || ''), errR);
  await mockCtl('ok');
  const okR = await frameOf(page).evaluate(async (cid) => { const r = await CC.auth.call('call/turn', { callId: cid, msgId: 'e2', text: 'مرحبا' }); return { ok: r.ok, text: r.reply && r.reply.text }; }, errR.callId);
  check('رجوع Gemini: نفس المكالمة تكمل بعد إعادة الإرسال', okR.ok && okR.text, okR);
  await frameOf(page).evaluate((cid) => CC.auth.call('call/end', { callId: cid, reason: 'hangup' }), errR.callId);

  // ================= 5) استعادة بعد تحديث الصفحة (نقطة حفظ موقّعة) =================
  const walletBefore = await frameOf(page).evaluate(() => CC.state.snap.profile.wallet);
  await page.evaluate(() => { const f = document.getElementById('callcenter-frame'); f.src = f.src; });
  check('إعادة تحميل اللعبة تعود للقائمة', await waitPhase(page, 'menu', 90000));
  const rest = await frameOf(page).evaluate(() => ({ kind: CC.auth.kind, wallet: CC.state.snap.profile.wallet, day: CC.state.snap.profile.day }));
  check('التقدم محفوظ ويُستعاد من الخادم (الرصيد نفسه)', rest.kind === 'remote' && rest.wallet === walletBefore, { rest, walletBefore });
  check('جلسة منتهية بالخادم (410) تُستعاد تلقائياً من آخر نقطة', await frameOf(page).evaluate(async () => { const old = CC.auth.sessionId; CC.auth.sessionId = 'ccs_gone'; const r = await CC.auth.call('state', {}); return CC.auth.sessionId !== 'ccs_gone' && CC.auth.sessionId !== old; }).catch(() => false));

  // ================= 6) الخروج من اللعبة يرجع للألعاب الفردية ويفرّغ الإطار =================
  await frameOf(page).evaluate(() => document.getElementById('mn-exit').click());
  check('زر «خروج» باللعبة يرجع لصفحة الألعاب الفردية', await page.evaluate(() => new Promise((res) => { const t0 = Date.now(); (function w() { if (document.getElementById('pg-solo-home').classList.contains('active')) return res(true); if (Date.now() - t0 > 6000) return res(false); setTimeout(w, 100); })(); })));
  check('الإطار يُفرَّغ عند المغادرة (يوقف الصوت وWebGL)', await page.evaluate(() => document.getElementById('callcenter-frame').getAttribute('src') === 'about:blank'));
  await page.close();

  // ================= 7) اختيار السيرفر: الأساسي بلا Gemini ← الاحتياطي، والأساسي واقع ← الاحتياطي =================
  page = await newGamePage(browser, { mode: { noChat: { 'ehsmaha-wbkn.onrender.com': true } } });
  await page.evaluate(() => goCallCenter());
  check('الأساسي مفاتيح Gemini عنده غير منضبطة ← يُختار الاحتياطي', await waitPhase(page, 'menu', 90000) && await frameOf(page).evaluate(() => CC.auth.kind === 'remote' && CC.apiBase() === 'https://ehsmaha.onrender.com'));
  await page.close();
  page = await newGamePage(browser, { mode: { down: { 'ehsmaha-wbkn.onrender.com': true } } });
  await page.evaluate(() => goCallCenter());
  check('الأساسي واقع تماماً ← الاحتياطي يخدم المحادثة', await waitPhase(page, 'menu', 90000) && await frameOf(page).evaluate(() => CC.auth.kind === 'remote' && CC.apiBase() === 'https://ehsmaha.onrender.com'));
  await page.close();

  // ================= 8) السيرفران واقعان: وضع التدريب المحلي تلقائياً مع رسالة =================
  page = await newGamePage(browser, { mode: { down: { 'ehsmaha-wbkn.onrender.com': true, 'ehsmaha.onrender.com': true } } });
  await page.evaluate(() => goCallCenter());
  check('السيرفران واقعان: اللعبة تشتغل بوضع التدريب المحلي', await waitPhase(page, 'menu', 90000) && await frameOf(page).evaluate(() => CC.auth.kind === 'local'));
  await frameOf(page).evaluate(() => document.getElementById('mn-play').click());
  check('وضع التدريب: اليوم يبدأ بلا خادم', await waitPhase(page, 'intro', 15000));
  check('بلا أخطاء JS بالصفحة المضيفة', page._errors.length === 0, page._errors);
  await page.close();

  // ================= 9) الإنتاج بلا ملف اللعبة (الموقع يرد بـindex.html بدل 404): رسالة واضحة + إعادة محاولة، بلا تحميل الموقع داخل الإطار =================
  page = await newGamePage(browser);
  let broken = true;
  await page.route(/\/callcenter3d\.html/, async (route) => {
    if (!broken) return route.continue();
    await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(__dirname + '/../../index.html', 'utf8') });
  });
  await page.evaluate(() => goCallCenter());
  await sleep(3000);
  const bs = await page.evaluate(() => ({ src: document.getElementById('callcenter-frame').getAttribute('src'), loaderHidden: document.getElementById('callcenter-loader').hidden, retryShown: !document.getElementById('callcenter-retry').hidden, msg: document.getElementById('callcenter-loader-msg').textContent, active: document.getElementById('pg-callcenter').classList.contains('active') }));
  check('ملف اللعبة مفقود: لا يُحمَّل الموقع داخل الإطار (بلا src)', !bs.src && bs.active, bs);
  check('تظهر رسالة خطأ واضحة + زر «إعادة المحاولة» بدل دوران بلا نهاية', !bs.loaderHidden && bs.retryShown && /تعذر تحميل ملف اللعبة/.test(bs.msg), bs);
  check('لا تحويل لصفحة «من نحن» ولا تسجيل خروج', await page.evaluate(() => document.getElementById('pg-callcenter').classList.contains('active') && !document.getElementById('pg-landing').classList.contains('active')));
  broken = false;
  await page.evaluate(() => document.getElementById('callcenter-retry').click());
  check('بعد توفّر الملف «إعادة المحاولة» تشغّل اللعبة', await waitPhase(page, 'menu', 90000));
  await page.close();

  await browser.close();
  const bad = results.filter((x) => !x).length;
  console.log('\n' + (results.length - bad) + '/' + results.length + ' passed');
  process.exit(bad ? 1 : 0);
})();
