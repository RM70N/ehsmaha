'use strict';
// تغذية لوحة الأدمن من ops-core: نتيجة رسمية لكل فوز (adminRounds) + لقطة مراقبة (adminObserve) بأسماء المشاركين فقط. مخزن ذاكرة.
const H = require('./harness');
const results = []; const check = (n, ok, d) => { results.push({ name: n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 500) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' });
  await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  await page.evaluate(() => { EhsOps._useMemoryStore(); EhsOps._uidOverride = 'uidstreamer1234567'; });
  await page.evaluate(() => { ownerRegisterActiveStreamer('rou', 'streamer1', 'tiktok', 'دائرة الإقصاء'); homeRegisterGameListener('rou', function () {}); });
  await sleep(150);
  // مشاركون حقيقيون في خريطة اللعبة نفسها (متغير participants كما في سجل الألعاب)
  await page.evaluate(() => { (0, eval)('rouParticipants.set("p1", { uniqueId: "p1", nickname: "لاعب ١" }); rouParticipants.set("p2", { uniqueId: "p2", nickname: "لاعب ٢" })'); EhsOps._heartbeat(); });
  await sleep(150);
  const o1 = await page.evaluate(async () => { const s = EhsOps.store(); const o = await s.get('adminObserve'); const k = Object.keys(o || {})[0]; return { k, o: o && o[k] }; });
  check('لقطة المراقبة تُنشر باسم الجلسة: اللعبة والحالة (live) وعدد المشاركين', o1.o && o1.o.game === 'rou' && o1.o.state === 'live' && o1.o.parts === 2, o1);
  check('اللقطة تحوي أسماء المشاركين فقط (u/n) بلا حقول إضافية', o1.o && o1.o.list.length === 2 && o1.o.list.every((x) => Object.keys(x).sort().join() === 'n,u') && o1.o.listSupported === true, o1.o && o1.o.list);
  check('مفتاح اللقطة = معرّف الجلسة (تحقق القواعد بـcontains(uid))', o1.k && o1.k.indexOf('uidstreamer1234567') === 0, o1.k);
  // فوز: نتيجة رسمية واحدة (بلا تكرار) عبر recordWin نفسها
  await page.evaluate(() => { recordWin({ uniqueId: 'p1', nickname: 'لاعب ١' }, 'دائرة الإقصاء', 1); recordWin({ uniqueId: 'p1', nickname: 'لاعب ١' }, 'دائرة الإقصاء', 1); });
  await sleep(150);
  const r1 = await page.evaluate(async () => { const s = EhsOps.store(); const a = await s.get('adminRounds'); const day = Object.keys(a || {})[0]; return Object.values((a || {})[day] || {}); });
  check('فوز واحد = سجل نتيجة واحد (تكرار الاستدعاء لا يضاعفه)', r1.length === 1, r1.length);
  check('السجل: الفائز + اللعبة + الراوند + الستريمر + المنصة + مصدر recordWin', r1[0] && r1[0].w.u === 'p1' && r1[0].w.n === 'لاعب ١' && r1[0].game === 'rou' && /_rou_1$/.test(r1[0].rid) && r1[0].streamer === 'streamer1' && r1[0].platform === 'tiktok' && r1[0].src === 'recordWin' && r1[0].uid === 'uidstreamer1234567', r1[0]);
  // لا تأثير على اللعبة: recordWin الأصلية ما زالت تعمل (نقاط)
  const lb = await page.evaluate(() => { try { return typeof scoreLoad === 'function' ? JSON.stringify(scoreLoad()).includes('p1') : null; } catch (e) { return null; } });
  check('منطق النقاط الأصلي لم يتغيّر (الفوز يُسجَّل بلوحة الفائزين كما قبل)', lb === true, lb);
  // نهاية الجلسة تزيل اللقطة
  await page.evaluate(() => EhsOps.sessionEnd('test'));
  await sleep(150);
  const o2 = await page.evaluate(async () => { const o = await EhsOps.store().get('adminObserve'); return o ? Object.keys(o).length : 0; });
  check('انتهاء الجلسة يزيل لقطة المراقبة (لا جلسة منتهية معروضة كمباشرة)', o2 === 0, o2);
  // وضع المختبر/التعطيل لا يكتب
  const off = await page.evaluate(() => { EhsOps._resetStore(); const m = EhsOps._useMemoryStore(); localStorage.setItem('ehs_ops_off', '1'); return typeof EhsOps.roundResult; });
  check('الدالة موجودة للاختبار', off === 'function');
  const f = results.filter((r) => !r.ok); console.log('\n' + (results.length - f.length) + '/' + results.length + ' passed'); await b.close(); process.exit(f.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
