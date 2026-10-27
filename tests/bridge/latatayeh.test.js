'use strict';
// لا تطيّحه (la-tatayeh3d.html — لعبة مستقلة مضمّنة بإطار) داخل الموقع الحقيقي عبر جسر تيك توك المزيّف:
//   - الملف المنسوخ مطابق حرفياً للأصل (SHA-256) بدون أي تعديل.
//   - الكرت (تسجيل + رسم + أمر الشات) وصفحة الإعداد، وبث غير مربوط، وإطلاق اللعبة وربط الشات.
//   - انضمام المتابعين بالكلمة (صيغ، تكرار، شرط الفولو، دفعة كبيرة)، واللعب بالشات (رقم / «اسحب N»)، والانهيار والقرار والفوز الرسمي.
//   - الخروج يرجع للرئيسية ويفرّغ الإطار، وبلا أخطاء JavaScript.
//   tests/bridge/servers.sh start   (أو servers.sh بالمستودع)
//   PLAYWRIGHT_PATH=... node tests/bridge/latatayeh.test.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const STREAMER = 'streamer1';
const ORIGINAL_SHA256 = '2688fe0f7d2ed6cd'; // بداية بصمة الملف الأصلي المرسل (الملف كله يُقارن بعد فك الأمر)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const frame = (page) => page.frames().find((x) => /la-tatayeh3d\.html/.test(x.url()));
const F = (page, fn, arg) => { const f = frame(page); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
async function fwait(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await F(page, fn, arg)) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const state = (page) => F(page, () => window.LaTatayehGame.getState());
const clickBtn = (page, text) => F(page, (t) => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === t && !x.disabled); if (b) { b.click(); return true; } return false; }, text);
const wins = (page) => page.evaluate(() => window.__wins.slice());

(async () => {
  // ===== 0) الملف مطابق حرفياً للأصل =====
  const file = fs.readFileSync(path.join(__dirname, '..', '..', 'la-tatayeh3d.html'));
  const sha = crypto.createHash('sha256').update(file).digest('hex');
  check('الملف المنسوخ مطابق للأصل بدون أي تعديل (SHA-256 + الحجم ٢٬٧٣٣٬٧٠٠ بايت)', sha.startsWith(ORIGINAL_SHA256) && file.length === 2733700, { sha: sha.slice(0, 16), size: file.length });

  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });

  // ===== 1) الكرت والتسجيل =====
  await page.evaluate(() => show('home')); await sleep(600);
  const reg = await page.evaluate(() => {
    const card = document.querySelector('.gcard[data-tag="latatayeh"]');
    const lib = [...document.querySelectorAll('#hlob-grid .hlob-card')].find((n) => n.getAttribute('data-tag') === 'latatayeh');
    return {
      gcard: !!card, name: card && card.querySelector('.gcard-name').textContent, num: card && card.querySelector('.gcard-num').textContent,
      lib: !!lib, art: !!(lib && lib.querySelector('svg')), artRich: !!(lib && lib.querySelectorAll('svg rect').length > 25),
      cmd: lib ? lib.innerText.replace(/\s+/g, ' ') : '', reg: !!TST_GAME_REGISTRY['latatayeh'],
      fns: ['launchLatatayeh', 'goSetupLatatayeh', 'ehsLtgGoHome', 'ehsLtgOnShow'].filter((f) => typeof window[f] !== 'function'),
      others: ['xo', 'tug', 'bomb', 'roulette3d', 'wesh', 'hq', 'cannon'].filter((t) => !document.querySelector('.gcard[data-tag="' + t + '"]')),
    };
  });
  check('الكرت مسجّل بالمكتبة باسم «لا تطيّحه» ورسم غني (برج خشبي) وأمر الشات، ودوالها معرّفة، وبقية الألعاب سليمة', reg.gcard && reg.name === 'لا تطيّحه' && reg.lib && reg.art && reg.artRich && /رقم القطعة/.test(reg.cmd) && reg.reg && reg.fns.length === 0 && reg.others.length === 0, reg);
  await page.evaluate(() => homeApplyFilter('3d')); await sleep(300);
  const f3d = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('فلتر ثلاثية الأبعاد يعرض «لا تطيّحه»', f3d.includes('latatayeh') && f3d.includes('bomb') && f3d.includes('cannon'), f3d);
  await page.evaluate(() => homeApplyFilter('all')); await sleep(200);

  // ===== 2) صفحة الإعداد (الدخول للعبة) =====
  await page.evaluate(() => goSetupLatatayeh()); await sleep(500);
  const su = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, hero: !!document.querySelector('#ltg-hero svg'), txt: document.getElementById('pg-setup-latatayeh').innerText, btn: !!document.getElementById('btn-latatayeh-launch') }));
  check('صفحة الإعداد: صورة البرج + شرح التشغيل + كلمة «برج» + زر ابدأ اللعبة', su.active === 'pg-setup-latatayeh' && su.hero && su.btn && /برج/.test(su.txt) && /اختيار اللاعب/.test(su.txt) && /رقم القطعة/.test(su.txt), { active: su.active, hero: su.hero });

  // ===== 3) بث غير مربوط =====
  await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = await page.evaluate(() => { launchLatatayeh(); return { t: document.getElementById('latatayeh-status').textContent, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» ولا تفتح اللعبة', /اربط بثك/.test(unl.t) && unl.a === 'pg-setup-latatayeh', unl);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);
  await page.evaluate(() => followGateSetRequired(false));

  // ===== 4) الإطلاق =====
  await page.evaluate(() => { goSetupLatatayeh(); launchLatatayeh(); });
  const ready = await waitFor(page, () => { const a = window.latatayehApi && window.latatayehApi(); return !!a && document.querySelector('.page.active').id === 'pg-latatayeh'; }, null, 90000);
  check('الإطلاق: فتح صفحة اللعبة وجهوزية واجهة LaTatayehGame داخل الإطار', ready);
  const L = await page.evaluate(() => ({ listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), user: document.getElementById('latatayeh-live-user').textContent, src: document.getElementById('latatayeh-frame').src }));
  check('معالج شات واحد مسجّل للعبة، ويوزر الستريمر ظاهر، والإطار يحمّل الملف المنسوخ', L.listeners.join() === 'latatayeh' && L.user === '@' + STREAMER && /la-tatayeh3d\.html/.test(L.src), L);
  // شاشة التحميل («جاري بناء البرج») تغطي اللعبة حتى يكتمل بناء البرج الأول؛ المستخدم ما يضغط قبلها
  check('شاشة اللعبة الأولى (عنوان «لا تطيّحه») وزر ابدأ بعد اكتمال بناء البرج وزوال شاشة التحميل', await fwait(page, () => !document.querySelector('.loading') && window.LaTatayehGame.getState().phase === 'title' && !!document.querySelector('.wordmark') && [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'ابدأ'), null, 120000));

  // ===== 5) الإعداد داخل اللعبة وفتح الانتظار =====
  await clickBtn(page, 'ابدأ'); await sleep(400);
  check('إعداد المباراة داخل اللعبة: كلمة الانضمام الافتراضية «برج»', await F(page, () => [...document.querySelectorAll('input')].some((i) => i.value === 'برج')));
  await clickBtn(page, 'فتح الانتظار'); await sleep(500);
  const lobby = await state(page);
  check('الانتظار مفتوح (lobby) ولا لاعبين بعد', lobby && lobby.phase === 'lobby' && lobby.players.length === 0, lobby);

  // ===== 6) الانضمام بالشات =====
  for (const [i, t] of ['برج', 'برج😍', '‏برج', 'برج!!', 'بُرْج', ' برج '].entries()) await say('lt_form_' + i, t);
  await say('lt_other', 'مرحبا'); await say('lt_a', 'برج'); await say('lt_b', 'برج'); await say('lt_c', 'برج');
  for (let i = 0; i < 4; i++) await say('lt_a', 'برج'); // تكرار
  await sleep(1500);
  let s = await state(page);
  check('الانضمام بصيغ الكلمة (إيموجي/علامات/تشكيل/رمز مخفي/مسافات) وبلا تكرار، وغير الكلمة لا ينضم (٩ لاعبين)', s.players.length === 9 && !s.players.some((p) => p.userId === 'tiktok:lt_other') && new Set(s.players.map((p) => p.userId)).size === 9, { n: s.players.length, ids: s.players.map((p) => p.userId) });
  check('شارة «الشات مربوط» ظهرت داخل اللعبة (بث حقيقي لا تجريبي)', await F(page, () => [...document.querySelectorAll('.chip')].some((c) => /الشات مربوط/.test(c.textContent))));

  // شرط الفولو
  await page.evaluate(() => followGateSetRequired(true));
  await say('lt_nf', 'برج', 'lt_nf', false); await sleep(900);
  s = await state(page);
  check('شرط الفولو مفعّل: غير المتابع لا ينضم', !s.players.some((p) => p.userId === 'tiktok:lt_nf'), s.players.length);
  await say('lt_fol', 'برج', 'lt_fol', true); await sleep(900);
  s = await state(page);
  check('شرط الفولو مفعّل: المتابع ينضم', s.players.some((p) => p.userId === 'tiktok:lt_fol'), s.players.length);
  await page.evaluate(() => followGateSetRequired(false));
  await say('lt_nf', 'برج', 'lt_nf', false); await sleep(900);
  s = await state(page);
  check('شرط الفولو مطفي: غير المتابع ينضم', s.players.some((p) => p.userId === 'tiktok:lt_nf'), s.players.length);

  // دفعة كبيرة من المتابعين
  const before = s.players.length;
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: 60, prefix: 'lt_p', text: 'برج', identity: { isFollowerOfAnchor: true }, perMs: 40 });
  await waitFor(page, () => window.latatayehApi().getState().players.length >= before + 60, null, 40000);
  s = await state(page);
  check('دفعة ٦٠ متابعاً بالكلمة: دخلوا كلهم', s.players.length === before + 60, { before, now: s.players.length });

  // ===== 7) بدء المباراة واللعب بالشات =====
  check('زر «بدء اللعبة» يعمل (انتقال لمرحلة ready)', (await clickBtn(page, 'بدء اللعبة')) && await fwait(page, () => window.LaTatayehGame.getState().phase === 'ready', null, 20000));
  check('زر «اختيار اللاعب» يختار صاحب الدور (picking) بمؤقت', (await clickBtn(page, 'اختيار اللاعب')) && await fwait(page, () => window.LaTatayehGame.getState().phase === 'picking', null, 30000));
  s = await state(page);
  const cur = s.current && s.current.userId;
  check('صاحب الدور من اللاعبين الحقيقيين', !!cur && s.players.some((p) => p.userId === cur), s.current);
  // غير صاحب الدور: يُتجاهل
  const other = s.players.find((p) => p.userId !== cur).userId.replace('tiktok:', '');
  await say(other, '25'); await sleep(700);
  s = await state(page);
  check('رقم من غير صاحب الدور يُتجاهل (يبقى picking والقطع كلها متاحة)', s.phase === 'picking' && s.taken.length === 0, { phase: s.phase, taken: s.taken });
  // رقم غير صالح
  await say(cur.replace('tiktok:', ''), '99'); await sleep(600);
  s = await state(page);
  check('رقم خارج المدى (٩٩) يُرفض ويبقى الدور', s.phase === 'picking', s.phase);
  // سحب صحيح بصيغة «اسحب N» من الطبقات السفلية الأمن
  const pieceA = s.availablePieces.find((n) => n >= 20 && n <= 40) || s.availablePieces[0];
  await say(cur.replace('tiktok:', ''), 'اسحب ' + pieceA);
  await fwait(page, () => ['pulling', 'settling', 'ready', 'collapsed', 'decision'].includes(window.LaTatayehGame.getState().phase), null, 8000);
  s = await state(page);
  check('صاحب الدور يكتب «اسحب ' + pieceA + '»: تبدأ عملية السحب (pulling)', ['pulling', 'settling', 'ready', 'collapsed', 'decision'].includes(s.phase) && s.taken.includes(pieceA) || s.phase !== 'picking', s);
  // انتظار الحكم الفيزيائي: ثبت (ready) أو انهار (decision/collapsed)
  const outcome = await waitFor(page, () => ['ready', 'collapsed', 'decision', 'nomoves'].includes(window.latatayehApi().getState().phase), null, 90000);
  s = await state(page);
  check('الفيزياء تحكم: ثبت البرج أو انهار (النتيجة وصلت بلا تعليق)', outcome && ['ready', 'collapsed', 'decision'].includes(s.phase), s.phase);

  // ===== 8) الانهيار والقرار والفوز الرسمي =====
  if (s.phase === 'ready') {
    await clickBtn(page, 'اختيار اللاعب');
    await fwait(page, () => window.LaTatayehGame.getState().phase === 'picking', null, 30000);
  }
  await F(page, () => window.LaTatayehGame.__test.forceCollapse());
  const dec = await fwait(page, () => window.LaTatayehGame.getState().phase === 'decision', null, 90000);
  s = await state(page);
  check('انهيار البرج يوصل لشاشة القرار ومعروف الخاسر', dec && !!s.loser, { phase: s.phase, loser: s.loser });
  const loser = s.loser;
  await clickBtn(page, 'الكل يفوز عدا الخسران'); await sleep(1500);
  s = await state(page);
  const w = await wins(page);
  check('قرار «الكل يفوز عدا الخسران»: مرحلة الفوز، والفوز سُجّل رسمياً لكل الباقين مرة وحدة باسم اللعبة وبدون الخسران', s.phase === 'win' && w.length === s.players.length - 1 && w.every((x) => x.g === 'لا تطيّحه') && !w.some((x) => x.id === loser) && new Set(w.map((x) => x.id)).size === w.length, { phase: s.phase, wins: w.length, players: s.players.length });

  // ===== 9) الخروج =====
  check('لا أخطاء JS بالصفحة والإطار', page._errors.length === 0, page._errors.slice(0, 3));
  await page.evaluate(() => ehsLtgGoHome()); await sleep(600);
  const ex = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, src: document.getElementById('latatayeh-frame').getAttribute('src'), listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate') }));
  check('الخروج: يرجع للرئيسية ويفرّغ الإطار ويفكّ معالج الشات', ex.active === 'pg-home' && /about:blank/.test(ex.src || '') && ex.listeners.length === 0, ex);

  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
