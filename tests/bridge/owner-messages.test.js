'use strict';
// رسائل المالك (رسالة لشخص / رسالة للجميع): Firestore مُحاكى يعلّق الكتابة للأبد (مثل امتلاء الحصة)
// وRealtime Database مُحاكى بالذاكرة — الرسالة لازم توصل وتظهر عبر المسار الاحتياطي.
//   node tests/bridge/owner-messages.test.js
const H = require('./harness');
const results = [];
const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  for (const mode of ['hang', 'ok']) {
    const page = await H.newPage(browser, { query: '?debug=0' });
    await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
    await page.evaluate((fsMode) => {
      const rt = {}, rtLs = {}, fs = {}, fsLs = {};
      window.__toasts = []; window.toast = (m) => { window.__toasts.push(String(m)); };
      const notify = (p) => (rtLs[p] || []).forEach((cb) => cb({ exists: () => p in rt, val: () => rt[p] }));
      const hang = fsMode === 'hang';
      window.__fbx = {
        db: {}, doc: (db, col, key) => ({ path: col + '/' + key }), serverTimestamp: () => ({ __ts: 1 }),
        getDoc: (ref) => hang ? new Promise(() => {}) : Promise.resolve({ exists: () => true }),
        setDoc: (ref, d) => { if (hang) return new Promise(() => {}); fs[ref.path] = Object.assign({}, d, { sentAt: { toMillis: () => Date.now() } }); (fsLs[ref.path] || []).forEach((cb) => cb({ exists: () => true, data: () => fs[ref.path] })); return Promise.resolve(); },
        deleteDoc: (ref) => { if (hang) return new Promise(() => {}); delete fs[ref.path]; (fsLs[ref.path] || []).forEach((cb) => cb({ exists: () => false, data: () => null })); return Promise.resolve(); },
        onSnapshot: (ref, cb) => { (fsLs[ref.path] = fsLs[ref.path] || []).push(cb); },
        rtdb: {}, rtdbRef: (db, p) => ({ p }), rtdbServerTimestamp: () => ({ __ts: 1 }),
        rtdbSet: async (ref, d) => { rt[ref.p] = Object.assign({}, d, { sentAt: Date.now() }); notify(ref.p); },
        rtdbRemove: async (ref) => { delete rt[ref.p]; notify(ref.p); },
        rtdbOnValue: (ref, cb) => { (rtLs[ref.p] = rtLs[ref.p] || []).push(cb); cb({ exists: () => ref.p in rt, val: () => rt[ref.p] }); },
      };
      window.__rt = rt;
      (0, eval)('fb = window.__fbx; currentUser = { uid: "owner", email: "malshaifan1@gmail.com" }; currentUsername = "Aixo.58"');
      broadcastMessageBoot(); personalMessageBoot();
    }, mode);
    const tag = '[فايرستور ' + (mode === 'hang' ? 'معلّق' : 'سليم') + '] ';
    // --- رسالة للجميع
    await page.evaluate(() => { document.getElementById('msg-broadcast-text').value = 'مرحبا بالجميع'; });
    const t0 = Date.now();
    await page.evaluate(() => ownerSendBroadcastMessage());
    const took = Date.now() - t0;
    check(tag + 'إرسال للجميع يرجع سريعاً (' + took + 'ms) وبتوست نجاح', took < 3000 && (await page.evaluate(() => window.__toasts)).some((t) => t.includes('وصلت الرسالة للجميع')), await page.evaluate(() => window.__toasts));
    await sleep(300);
    check(tag + 'بانر الجميع ظاهر بنص الشاشة وبالنص الصحيح', await page.evaluate(() => { const b = document.getElementById('msg-broadcast-banner'); return b.classList.contains('visible') && b.classList.contains('pos-center') && document.getElementById('msg-broadcast-banner-text').textContent === 'مرحبا بالجميع'; }));
    check(tag + 'الخلفية المعتمة ظاهرة', await page.evaluate(() => document.getElementById('msg-banner-backdrop').classList.contains('visible')));
    await page.evaluate(() => ownerClearBroadcastMessage()); await sleep(300);
    check(tag + 'إخفاء الرسالة الحالية يزيل البانر', await page.evaluate(() => !document.getElementById('msg-broadcast-banner').classList.contains('visible')));
    // --- رسالة لشخص
    await page.evaluate(() => { document.getElementById('msg-personal-username').value = '@Aixo.58'; document.getElementById('msg-personal-text').value = 'مبروك 6000 متالع'; ownerMsgSetPosition('personal', 'center'); ownerMsgSetDuration('personal', 'permanent'); });
    const t1 = Date.now();
    await page.evaluate(() => ownerSendPersonalMessage());
    check(tag + 'إرسال لشخص يرجع (' + (Date.now() - t1) + 'ms) بتوست نجاح', (await page.evaluate(() => window.__toasts)).some((t) => t.includes('تم إرسال الرسالة إلى')), await page.evaluate(() => window.__toasts));
    await sleep(300);
    check(tag + 'المفتاح مُرمّز (النقطة) بمسار RTDB', await page.evaluate(() => Object.keys(window.__rt).some((k) => k === 'ownerMessages/personal/aixo%2e58')) || mode === 'ok', await page.evaluate(() => Object.keys(window.__rt)));
    check(tag + 'الرسالة الشخصية ظهرت للمستلم بالنص والموقع', await page.evaluate(() => { const b = document.getElementById('msg-personal-banner'); return b.classList.contains('visible') && b.classList.contains('pos-center') && document.getElementById('msg-personal-banner-text').textContent === 'مبروك 6000 متالع'; }));
    await page.evaluate(() => personalMessageDismiss()); await sleep(300);
    check(tag + 'إغلاق الرسالة يحذفها من RTDB', await page.evaluate(() => !Object.keys(window.__rt).some((k) => k.startsWith('ownerMessages/personal/'))));
    check(tag + 'بدون أخطاء JS', (page._errors || []).length === 0, page._errors);
    await page.context().close();
  }
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
