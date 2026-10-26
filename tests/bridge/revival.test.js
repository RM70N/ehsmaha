'use strict';
// اختبار مشهد الإنعاش الجديد (revival-system/) داخل الموقع الحقيقي، لكل الألعاب اللي فيها إنعاش بهدايا تيك توك:
//   - التصميم القديم محذوف (#gift-revival-overlay ما يظهر أبداً)، والجديد (.rv-*) يظهر باسم اللاعب وصورته فقط.
//   - التجميد 3 ثوانٍ لكل لعبة يبدأ وينتهي مع المشهد، ولا شي يبقى معلّق.
//   - نفس الشخص ما يتكرر مشهده؛ وإنعاش عدة أشخاص يمشي بالتتابع بلا تداخل ولا بقايا.
//   PLAYWRIGHT_PATH=... node tests/bridge/revival.test.js
const H = require('./harness');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const AV = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0f0"/></svg>');

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser);
  await page.goto('http://localhost:8765/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.RevivalPresentationManager && typeof triggerGiftRevivalFreeze === 'function', null, { timeout: 60000 });
  await sleep(1500);

  // مراقب: يسجّل كل مشهد ظهر (اسم/صورة/نص/مصدر) ويكتشف التصميم القديم
  await page.evaluate(() => {
    window.__scenes = []; window.__oldSeen = false;
    const grab = (n) => {
      if (n.nodeType !== 1) return;
      if (n.id === 'gift-revival-overlay' || n.querySelector && n.querySelector('.gift-revival-card')) window.__oldSeen = true;
      const roots = n.matches && n.matches('.rv-root, [class*="rv-root"]') ? [n] : (n.querySelectorAll ? [...n.querySelectorAll('.rv-root, [class*="rv-root"]')] : []);
      roots.forEach((r) => {
        window.__scenes.push({ at: Date.now(), r,
          name: () => (r.querySelector('.rv-name') || {}).textContent, photo: () => (r.querySelector('.rv-photo') || {}).src || '', via: () => (r.querySelector('.rv-via') || {}).textContent, chip: () => (r.querySelector('.rv-chip-v') || {}).textContent });
      });
    };
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(grab))).observe(document.body, { childList: true, subtree: true });
  });
  const live = () => page.evaluate(() => document.querySelectorAll('.rv-root, [class*="rv-root"]').length);
  const info = () => page.evaluate(() => window.__scenes.map((s) => ({ name: s.name(), photo: s.photo().slice(0, 40), via: s.via(), chip: s.chip() })));
  const reset = async () => { await page.evaluate(() => { RevivalPresentationManager.cancelAll(); RevivalPresentationManager.resetCounts(); window.__scenes = []; Object.keys(revivalRecentShown).forEach((k) => delete revivalRecentShown[k]); }); await sleep(400); };

  // 1) تأكد ما فيه كود قديم
  const oldCode = await page.evaluate(() => ({ css: !![...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /gift-revival/.test(r.cssText)); } catch (e) { return false; } }), fn: typeof buildGiftSparkles }));
  check('التصميم القديم محذوف من الصفحة (CSS + buildGiftSparkles)', !oldCode.css && oldCode.fn === 'undefined', oldCode);

  // 2) كل لعبة فيها إنعاش: التجميد + المشهد الجديد + الاسم والصورة
  const tags = ['findball', 'chairs', 'sniper', 'hz', 'rou', 'box', 'll', 'cw', 'bomb'];
  for (const tag of tags) {
    await reset();
    const t0 = Date.now();
    await page.evaluate(([t, av]) => triggerGiftRevivalFreeze(t, 'لاعب ' + t, 'وردة', null, { uid: 'u_' + t, avatar: av }), [tag, AV]);
    await sleep(500);
    const paused = await page.evaluate((t) => isGamePausedForRevival(t), tag);
    const sc = await info();
    check('[' + tag + '] المشهد الجديد ظهر بالاسم والصورة والهدية، والتجميد شغّال', paused && sc.length === 1 && sc[0].name === 'لاعب ' + tag && /^data:image\/svg/.test(sc[0].photo) && /هدية/.test(sc[0].via) && sc[0].chip === 'وردة', { paused, sc });
    await sleep(3100 - (Date.now() - t0) + 300);
    const after = await page.evaluate((t) => ({ p: isGamePausedForRevival(t), n: document.querySelectorAll('.rv-root, [class*="rv-root"]').length }), tag);
    check('[' + tag + '] انتهى التجميد والمشهد بعد ٣ ثوانٍ بلا بقايا', after.p === false && after.n === 0, after);
  }
  check('ما ظهر التصميم القديم بأي لعبة', (await page.evaluate(() => window.__oldSeen)) === false);

  // 3) المسار الحقيقي: checkAndConsumeRevival (إنعاش من هدية مسبقة) بلعبة
  await reset();
  await page.evaluate((av) => {
    fb = fb || { updateDoc: () => Promise.resolve(), doc: () => ({}), db: {} };
    if (!fb.updateDoc) fb.updateDoc = () => Promise.resolve(); if (!fb.doc) fb.doc = () => ({});
    try { sniperParticipants.set('real1', { uid: 'real1', nickname: 'سعد الحقيقي', profilePictureUrl: av }); } catch (e) { window.__noMap = true; }
    sniperRevivalMap.set('real1', { docId: 'd1', usesRemaining: 1 });
    window.__r = checkAndConsumeRevival('real1', 'سعد الحقيقي', sniperRevivalMap, 'sniper');
  }, AV);
  await sleep(500);
  let sc = await info();
  check('checkAndConsumeRevival الحقيقي: مشهد واحد باسم المُنعَش وصورته من المشاركين', (await page.evaluate(() => window.__r)) === true && sc.length === 1 && sc[0].name === 'سعد الحقيقي' && /^data:image\/svg/.test(sc[0].photo), { sc });


  // 3ب) مسار الهدية الحقيقي بكل ألعاب الإنعاش (دالة الهدية الفعلية، لاعب مُقصى سابقاً): مشهد واحد فقط، حتى لو نفس الهدية وصلت مرتين
  for (const tag of ['findball', 'chairs', 'sniper', 'hz', 'rou', 'box', 'll', 'cw']) {
    await reset();
    const r = await page.evaluate(([t, av]) => {
      const u = { uniqueId: 'rg_' + t, nickname: 'مُنعَش ' + t, profilePictureUrl: av };
      const code = `${t}RevivalEnabled = true; ${t}GameStatus = 'active'; ${t}RevivalMaxUses = 2; ${t}RevivalCounts.clear(); ${t}Participants.delete(u.uniqueId); ${t}EliminatedHistory.add(u.uniqueId); ${t}HandleGift(u, 'Rose', 5); ${t}HandleGift(u, 'Rose', 5);`;
      try { (new Function('u', code))(u); } catch (e) { return { err: String(e) }; }
      return { ok: true };
    }, [tag, AV]);
    await sleep(700);
    const sc2 = await info();
    check('[' + tag + '] دالة الهدية الحقيقية: مشهد واحد باسم المُنعَش وصورته (حتى لو الهدية وصلت مرتين)', sc2.length === 1 && sc2[0].name === 'مُنعَش ' + tag && /^data:image\/svg/.test(sc2[0].photo), { r, sc2 });
    await sleep(3000);
  }

  // 4) نفس الشخص مرتين بسرعة = مشهد واحد (والتجميد يبقى)
  await reset();
  await page.evaluate((av) => { for (let i = 0; i < 5; i++) triggerGiftRevivalFreeze('findball', 'مكرر', 'وردة', null, { uid: 'dup1', avatar: av }); }, AV);
  await sleep(600);
  sc = await info();
  check('نفس الشخص ٥ مرات متتالية: مشهد واحد فقط', sc.length === 1 && (await page.evaluate(() => RevivalPresentationManager.pending)) === 1, { n: sc.length });
  await sleep(3600);
  check('بعدها ما يبقى شي ولا يعيد المشهد', (await live()) === 0 && (await info()).length === 1);

  // 5) عدة أشخاص: بالتتابع بدون تداخل (مشهد واحد حيّ بأي لحظة) وكلهم يكتمل
  await reset();
  await page.evaluate((av) => { for (let i = 0; i < 4; i++) triggerGiftRevivalFreeze('chairs', 'شخص' + i, 'وردة', null, { uid: 'p' + i, avatar: av }); }, AV);
  let maxLive = 0; const seenNames = new Set();
  for (let i = 0; i < 70; i++) { await sleep(200); maxLive = Math.max(maxLive, await live()); (await info()).forEach((s) => seenNames.add(s.name)); }
  check('٤ أشخاص: مشهد واحد حيّ بأي لحظة، ظهروا كلهم، ولا بقايا', maxLive === 1 && seenNames.size === 4 && (await live()) === 0, { maxLive, seen: [...seenNames] });
  check('التجميد انفك بعد آخر إنعاش', (await page.evaluate(() => isGamePausedForRevival('chairs'))) === false || (await sleep(3500), (await page.evaluate(() => isGamePausedForRevival('chairs'))) === false));

  // 6) إنعاش إداري + بدون صورة (أفاتار احتياطي، وما نعرض صورة غيره)
  await reset();
  await page.evaluate(() => { triggerAdminReviveFreeze('box', 'مدير نعش'); });
  await sleep(500);
  sc = await info();
  check('إنعاش إداري: «عن طريق الإدارة» بلا شريحة هدية', sc.length === 1 && /الإدارة/.test(sc[0].via) && !sc[0].chip, sc);
  check('بدون صورة معروفة: ما نعرض صورة لاعب آخر', sc.length === 1 && !/^data:image\/svg\+xml;utf8,%3Csvg/.test(sc[0].photo) && !sc[0].photo.includes('%3Crect%20width%3D%2264%22%20height%3D%2264%22%20fill%3D%22%230f0'), sc);
  await sleep(3500);

  check('بلا أخطاء JS بالصفحة', page._errors.length === 0, page._errors.slice(0, 3));
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
