'use strict';
// طبقة العمليات (ops-core): تسجيل الجلسات/الراوندات/الاتصال/الرحلة بمخزن ذاكرة (لا Firebase حقيقي).
const H = require('./harness');
const results = []; const check = (n, ok, d) => { results.push({ name: n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 500) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' });
  await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  const boot = await page.evaluate(() => ({ core: !!window.EhsOps, games: (window.EHS_OPS_GAMES || []).length, installed: !!EhsOps._installed, wrapped: ['homeRegisterGameListener', 'homeUnregisterGameListener', 'homeConnSetState', 'recordWin', 'ownerRegisterActiveStreamer', 'goHome'].filter((n) => window[n] && window[n].__ops), lab: EhsOps.lab }));
  check('طبقة ops-core تُحمَّل وتغلّف دوال الموقع (ست دوال) وسجل الألعاب 30', boot.core && boot.games === 31 && boot.installed && boot.wrapped.length === 6 && !boot.lab, boot);
  await page.evaluate(() => { EhsOps._useMemoryStore(); EhsOps._uidOverride = 'uidstreamer1234567'; });
  // راوند: يُسجَّل مرة واحدة حتى لو بُلّغ بوسمين (تسجيل الستريمر ثم مستمع الأحداث)
  await page.evaluate(() => { ownerRegisterActiveStreamer('rou', 'streamer1', 'tiktok', 'دائرة الإقصاء'); homeRegisterGameListener('rou', function () {}); });
  await sleep(150);
  const r1 = await page.evaluate(async () => { const s = EhsOps.store(); const ev = await s.get('opsEvents'); const ss = await s.get('opsSessions'); return { ev: Object.values(ev || {}), ss }; });
  const starts = r1.ev.filter((e) => e.type === 'round_start'); const sids = Object.keys(r1.ss || {});
  check('بدء راوند واحد فقط رغم إشعارين (منع التكرار) + حدث جلسة', starts.length === 1 && r1.ev.some((e) => e.type === 'session_start'), r1.ev.map((e) => e.type));
  const sess = r1.ss && r1.ss[sids[0]];
  check('جلسة الستريمر: الحالة live واسم الستريمر والمنصة ومعرّف يبدأ بمعرّف الحساب', sids.length === 1 && sess.state === 'live' && sess.streamer === 'streamer1' && sess.platform === 'tiktok' && sids[0].startsWith('uidstreame'), sess);
  check('الراوند مسجَّل داخل الجلسة بحالة running ولعبته', sess.rounds && sess.rounds['1'] && sess.rounds['1'].state === 'running' && sess.rounds['1'].game === 'rou', sess.rounds);
  // اتصال
  await page.evaluate(() => { homeConnSetState('tiktok', 'connected'); homeConnSetState('tiktok', 'reconnecting'); homeConnSetState('tiktok', 'connected'); });
  await sleep(100);
  const c1 = await page.evaluate(async () => { const s = EhsOps.store(); const ss = await s.get('opsSessions'); const k = Object.keys(ss)[0]; const ev = Object.values(await s.get('opsEvents')); return { conn: Object.values(ss[k].conn || {}), ev: ev.filter((e) => /^conn_/.test(e.type)).map((e) => e.type + ':' + e.sev) }; });
  check('أحداث الاتصال تُسجَّل في سجل الجلسة (اتصال/إعادة اتصال/عودة) بدرجات خطورة صحيحة', c1.conn.length >= 3 && c1.ev.includes('conn_reconnecting:warn') && c1.ev.includes('conn_connected:info'), c1);
  // إكمال
  await page.evaluate(() => { recordWin({ uniqueId: 'x' }, 'rou', 1); recordWin({ uniqueId: 'y' }, 'rou', 1); });
  await sleep(100);
  const done1 = await page.evaluate(async () => Object.values(await EhsOps.store().get('opsEvents')).filter((e) => e.type === 'round_complete').length);
  check('إكمال الراوند يُسجَّل مرة واحدة حتى مع فائزين متتاليين', done1 === 1, done1);
  await page.evaluate(() => homeUnregisterGameListener('rou')); await sleep(100);
  const e1 = await page.evaluate(async () => { const s = EhsOps.store(); const ss = await s.get('opsSessions'); const k = Object.keys(ss)[0]; return { r: ss[k].rounds['1'], ev: Object.values(await s.get('opsEvents')).map((e) => e.type) }; });
  check('نهاية الراوند: الحالة complete ووقت النهاية + حدث round_end', e1.r.state === 'complete' && !!e1.r.end && e1.ev.includes('round_end'), e1);
  await page.evaluate(() => EhsOps.sessionEnd('test')); await sleep(80);
  const se = await page.evaluate(async () => { const ss = await EhsOps.store().get('opsSessions'); return ss[Object.keys(ss)[0]].state; });
  check('إنهاء الجلسة يغيّر حالتها إلى ended', se === 'ended', se);
  // رحلة اللاعب: مجمّعة، معرّف غير مباشر، لا تكرار
  await page.evaluate(() => { localStorage.clear(); EhsOps._resetJ && EhsOps._resetJ(); });
  const j = await page.evaluate(async () => { EhsOps._useMemoryStore(); EhsOps._uidOverride = 'uidplayer0000000001'; EhsOps.journey('open'); EhsOps.journey('open'); EhsOps.journey('games'); EhsOps.journey('select', 'xo'); EhsOps.journey('try', 'xo'); EhsOps.journey('start', 'xo'); EhsOps.journey('complete', 'xo'); await new Promise((r) => setTimeout(r, 50)); const j = await EhsOps.store().get('opsJourney'); return { j, anon: EhsOps.anon(), day: EhsOps.day() }; });
  const rec = j.j && j.j.days && j.j.days[j.day] && j.j.days[j.day][j.anon];
  check('رحلة اللاعب: مراحل open/games/select/try/start/complete + لعبة xo، بمعرّف عشوائي لا يحوي uid', rec && rec.s.open && rec.s.games && rec.s.select && rec.s.try && rec.s.start && rec.s.complete && rec.g.xo.select && rec.g.xo.complete && !JSON.stringify(j.j).includes('uidplayer'), rec);
  check('سجل المستخدم الأول بيوم الظهور الأول (للاحتفاظ/الدفعات)', j.j.users && j.j.users[j.anon] && j.j.users[j.anon].first === j.day, j.j.users);
  // إعدادات الألعاب
  const cfg = await page.evaluate(async () => { const s = EhsOps.store(); await s.set('opsConfig/current/xo', { v: 3, values: { turnSec: 25 } }); EhsOps._clearCfg(); const a = await EhsOps.gameConfig('xo'); const none = await EhsOps.gameConfig('nogame'); return { a, none, sync: EhsOps.gameConfigSync('xo') }; });
  check('قراءة إعدادات لعبة من المصدر (والفارغ للعبة بلا إعدادات) + نسخة متزامنة', cfg.a.turnSec === 25 && Object.keys(cfg.none).length === 0 && cfg.sync.turnSec === 25, cfg);
  // العزل: التعطيل
  await page.evaluate(() => { EhsOps._useMemoryStore(); localStorage.setItem('ehs_ops_off', '1'); });
  // مختبر: ?opslab=1 يحجب الكتابة
  const lab = await H.newPage(b, { query: '?debug=0&opslab=1', init: () => { window.__fb = { db: {}, rtdb: {}, doc: (db, ...p) => ({ path: p.join('/') }), rtdbRef: (r, p) => ({ path: p }), getDoc: () => Promise.resolve({}), setDoc: () => { window.__REAL_WRITE = (window.__REAL_WRITE || 0) + 1; return Promise.resolve(); }, rtdbSet: () => { window.__REAL_WRITE = (window.__REAL_WRITE || 0) + 1; return Promise.resolve(); } }; } }); await sleep(2500);
  const L = await lab.evaluate(async () => { const f = window.__fb; let thrown = null; try { await f.setDoc(f.doc(f.db, 'users', 'x'), { a: 1 }); await f.rtdbSet(f.rtdbRef(f.rtdb, 'opsEvents/test'), { a: 1 }); localStorage.setItem('zzz', '1'); new WebSocket('wss://example.invalid/ws'); await fetch('/x', { method: 'POST', body: '{}' }); } catch (e) { thrown = String(e); } return { thrown, blocked: window.__opsLab.blocked.map((x) => x.fn), socks: window.__opsLab.sockets.length, net: window.__opsLab.net.length, lab: EhsOps.lab, fnOk: typeof f.getDoc === 'function', real: window.__REAL_WRITE || 0 }; });
  check('وضع المختبر: كتابات Firestore/RTDB محجوبة ومسجَّلة، والمقابس والطلبات غير GET محجوبة، والقراءة سليمة', !L.thrown && L.blocked.includes('setDoc') && L.blocked.includes('rtdbSet') && L.socks >= 1 && L.net === 1 && L.lab && L.fnOk && L.real === 0, L);
  const leak = await page.evaluate(() => { try { return localStorage.getItem('zzz'); } catch (e) { return 'err'; } });
  check('وضع المختبر: التخزين معزول عن الصفحة الأم (لا تسريب لمفتاح مكتوب داخل المختبر)', leak === null, leak);
  await b.close();
  const f = results.filter((r) => !r.ok); console.log('\n' + (results.length - f.length) + '/' + results.length + ' passed'); process.exit(f.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
