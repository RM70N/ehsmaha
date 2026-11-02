'use strict';
// نظام الإطارات: إطار المتابع يظهر على بطاقته في شاشة الانتظار، وتغييره من جهازه ينعكس عند الستريمر بلا إعادة تحميل.
// قاعدة بيانات وهمية مشتركة (Firestore + RTDB) تمثّل «جهاز اللاعب» و«جهاز الستريمر» كمصدر واحد.
const H = require('./harness');
const results = []; const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 400) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const U = 'frmstreamer';
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' }); await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await page.evaluate(() => {
    const fs = {}, rt = {}, ls = {}; window.__fakeDb = { fs, rt, ls };
    const clone = (o) => JSON.parse(JSON.stringify(o));
    const getPath = (p) => p.split('/').reduce((o, k) => (o == null ? o : o[k]), rt);
    const setPath = (p, v, merge) => { const ks = p.split('/'); let o = rt; ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; }); const k = ks[ks.length - 1]; o[k] = merge ? Object.assign(o[k] || {}, clone(v)) : clone(v); };
    const notify = (p) => (ls[p] || []).forEach((cb) => cb({ exists: () => getPath(p) != null, val: () => clone(getPath(p) || null) }));
    const fbx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'rtdb' ? t.rtdb : function () { return {}; })) });
    fbx.db = { name: 'fakefs' }; fbx.rtdb = { name: 'fakert' };
    fbx.doc = (db, col, id) => ({ col, id }); fbx.getDoc = async (r) => { const d = (fs[r.col] || {})[r.id]; return { exists: () => !!d, data: () => clone(d || {}) }; };
    fbx.setDoc = async (r, data) => { fs[r.col] = fs[r.col] || {}; const cur = fs[r.col][r.id] || {}; Object.keys(data).forEach((k) => { const v = data[k]; if (v && v.__au) { cur[k] = Array.from(new Set((cur[k] || []).concat([v.__au]))); } else cur[k] = v; }); fs[r.col][r.id] = cur; };
    fbx.arrayUnion = (x) => ({ __au: x }); fbx.onSnapshot = () => () => {}; fbx.collection = (db, name) => ({ name }); fbx.query = (c) => c; fbx.where = () => ({}); fbx.getDocs = async () => ({ forEach() {}, size: 0 });
    fbx.rtdbRef = (db, p) => ({ path: p }); fbx.rtdbGet = async (r) => { const v = getPath(r.path); return { exists: () => v != null, val: () => clone(v || null) }; };
    fbx.rtdbUpdate = async (r, d) => { setPath(r.path, d, true); notify(r.path); }; fbx.rtdbSet = async (r, d) => { setPath(r.path, d, false); notify(r.path); };
    fbx.rtdbOnValue = (r, cb) => { (ls[r.path] = ls[r.path] || []).push(cb); setTimeout(() => cb({ exists: () => getPath(r.path) != null, val: () => clone(getPath(r.path) || null) }), 0); return () => { ls[r.path] = (ls[r.path] || []).filter((x) => x !== cb); }; };
    fbx.rtdbOff = () => {}; fbx.auth = { currentUser: { uid: 'streameruid0001', email: 's@x.com' } }; fbx.onAuthStateChanged = () => () => {};
    window.__fbx = fbx; (0, eval)('fb = window.__fbx'); window.__fb = fbx;
    // «جهاز اللاعب البعيد»: يكتب بنفس دالة الموقع ثم يمرّر الإشعار (RTDB) كما يصل عبر الشبكة
    window.__remoteSet = async (key, frameId) => { await framesWriteKV(key, { activeFrame: frameId || '', activeFrameAt: Date.now() }); };
  });
  await H.linkAccount(page, U); await sleep(500);
  const ids = await page.evaluate(() => FRAMES_CATALOG.slice(0, 3).map((f) => f.id));
  const imgOf = (id) => page.evaluate((id) => { const f = framesEffectiveCatalog().find((x) => x.id === id); return (f.gallery || f.imageUrl || '').slice(-80); }, id);
  const [A, Bf, Cf] = ids; const tailA = await imgOf(A), tailB = await imgOf(Bf);
  // اللاعب «zezo» يملك إطارين ومفعّل الأول (مكتوب مسبقاً من جهازه)
  await page.evaluate(([A, Bf]) => { const t = Date.now() - 60000; window.__fakeDb.fs.levels = { zezo: { ownedFrames: [A, Bf], activeFrame: A, activeFrameAt: t } }; window.__fakeDb.rt.levels = { zezo: { ownedFrames: [A, Bf], activeFrame: A, activeFrameAt: t } }; }, [A, Bf]);
  // الستريمر يشغّل لعبة «اوجد الكلمة» ويدخل اللاعب
  await page.evaluate(() => { document.querySelector('.gcard[data-tag="main"]').click(); document.getElementById('inp-kw').value = 'ادخل'; document.getElementById('inp-word').value = 'قمر'; });
  await page.evaluate(() => launchGame()); await sleep(1500);
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: 'zezo', text: 'ادخل', identity: { isFollowerOfAnchor: true } }); await sleep(1800);
  const chip = () => page.evaluate(() => { const t = [...document.querySelectorAll('.p-username-tag')].find((x) => /zezo/i.test(x.title || x.textContent)); return t ? { full: t.classList.contains('p-has-full-frame'), bg: t.style.backgroundImage || '' } : null; });
  let c = await chip();
  check('1) اللاعب دخل شاشة الانتظار وبطاقته تلبس إطاره المفعَّل (A)', c && c.full && c.bg.includes(tailA.slice(-40)), c && { full: c.full, bg: c.bg.slice(-60) });
  // اللاعب يغيّر إطاره من جهازه (بعيد عن جهاز الستريمر)
  await page.evaluate((B) => window.__remoteSet('zezo', B), Bf); await sleep(2500);
  c = await chip(); check('2) تغيير الإطار من جهاز اللاعب ينعكس على بطاقته عند الستريمر خلال ثوانٍ (B)', c && c.full && c.bg.includes(tailB.slice(-40)), c && { full: c.full, bg: c.bg.slice(-60) });
  await page.evaluate(() => window.__remoteSet('zezo', '')); await sleep(2500);
  c = await chip(); check('3) إلغاء الإطار ينزعه من البطاقة', c && !c.full && !c.bg, c);
  await page.evaluate((A) => window.__remoteSet('zezo', A), A); await sleep(2500);
  c = await chip(); check('4) إعادة تفعيل إطار تظهر من جديد', c && c.full && c.bg.includes(tailA.slice(-40)), c && { full: c.full });
  // مشارك جديد بإطار مفعّل مسبقاً يظهر فوراً
  await page.evaluate(([B]) => { const t = Date.now(); window.__fakeDb.fs.levels.sara = { ownedFrames: [B], activeFrame: B, activeFrameAt: t }; window.__fakeDb.rt.levels = Object.assign(window.__fakeDb.rt.levels || {}, { sara: { ownedFrames: [B], activeFrame: B, activeFrameAt: t } }); }, [Bf]);
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer: 'sara', text: 'ادخل', identity: { isFollowerOfAnchor: true } }); await sleep(1800);
  const sara = await page.evaluate(() => { const t = [...document.querySelectorAll('.p-username-tag')].find((x) => /sara/i.test(x.title || x.textContent)); return t ? { full: t.classList.contains('p-has-full-frame') } : null; });
  check('5) مشارك جديد بإطار مفعّل مسبقاً يظهر إطاره عند انضمامه', sara && sara.full, sara);
  // تبديل الإطار على جهاز اللاعب نفسه (framesSetActive) ينعكس فوراً
  const selfOk = await page.evaluate(async ([A, Bf]) => { try { framesSelfOwned = [A, Bf]; framesSelfActive = A; (0, eval)('currentUsername = "zezo"; playerTiktokLinkGet = function () { return { username: "zezo" }; }; framesRequireLinkedOrRedirect = function () { return true; }'); await framesSetActive(Bf); return framesSelfActive === Bf; } catch (e) { return 'err ' + e.message; } }, [A, Bf]);
  check('6) framesSetActive على جهاز اللاعب يُحفظ ويحدّث الإطار المفعَّل', selfOk === true, selfOk);
  await sleep(800); const stored = await page.evaluate(() => ({ fs: (window.__fakeDb.fs.levels.zezo || {}).activeFrame, rt: ((window.__fakeDb.rt.levels || {}).zezo || {}).activeFrame }));
  check('7) الحفظ تم بالقاعدتين (Firestore وRTDB) بنفس القيمة', stored.fs === Bf && stored.rt === Bf, stored);
  // احتياط: لو تعذّرت كتابة RTDB من جهاز اللاعب (Firestore فقط) يلتقطها الفحص الدوري خلال ~٢٠ ثانية
  await page.evaluate(([Cf]) => { const t = Date.now() + 5000; window.__fakeDb.fs.levels.zezo = Object.assign(window.__fakeDb.fs.levels.zezo || {}, { activeFrame: Cf, activeFrameAt: t, ownedFrames: [Cf] }); }, [Cf]);
  const tailC = await imgOf(Cf); let got = false;
  for (let i = 0; i < 40 && !got; i++) { await sleep(1000); const cc = await chip(); got = !!(cc && cc.full && cc.bg.includes(tailC.slice(-40))); }
  check('8) احتياط: تغيير مكتوب بـFirestore فقط يظهر بالفحص الدوري (≤٤٠ث)', got);
  console.log(results.filter(Boolean).length + '/' + results.length + ' passed'); await b.close(); process.exit(results.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
