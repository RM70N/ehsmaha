'use strict';
// ركز باللون (color-rush3d.html — لعبة مستقلة مضمّنة بإطار) داخل الموقع الحقيقي عبر جسر تيك توك المزيّف
// (سيرفر tiktok-server الحقيقي + fake-connector: أحداث الشات بترميز Protobuf حقيقي — ليس بثاً حياً فعلياً):
//   - الملف المنسوخ مطابق حرفياً للمرجع المعتمد (SHA-256 + الحجم) بدون أي تعديل.
//   - الكرت (تسجيل + غلاف + تفاصيل + فلاتر) وصفحة الإعداد، وبث غير مربوط، والإطلاق وانتظار حدث ready الحقيقي.
//   - انضمام المتابعين بالشات (اسم + أفتار + بلا تكرار + شرط الفولو + دفعة كبيرة).
//   - مباراة كاملة بالاختيارات من الشات (اسم اللون / رقم المنصة / أرقام عربية / تغيير الاختيار / صمت) والإقصاء والفوز.
//   - انقطاع الاتصال وعودته، وخروج وإعادة دخول متكررة دون تسرّب، وبلا أخطاء JavaScript.
//   PLAYWRIGHT_PATH=... node tests/bridge/colorrush.test.js   (بعد: tests/bridge/servers.sh start)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const STREAMER = 'crstreamer';
const ORIGINAL_SHA256 = 'ff056b6a1a507a30afb92e72281e3bea1d101152d03618a8cedad286e505f2b8';
const ORIGINAL_SIZE = 822644;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 700) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await Promise.race([page.evaluate(fn, arg), sleep(8000).then(() => false)])) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const frame = (page) => page.frames().find((x) => /color-rush3d\.html/.test(x.url()));
const F = (page, fn, arg) => { const f = frame(page); return f ? Promise.race([f.evaluate(fn, arg), sleep(20000).then(() => null)]) : Promise.resolve(null); };
async function fwait(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await F(page, fn, arg)) return true; } catch (e) { /* */ } await sleep(100); }
  return false;
}
const state = (page) => F(page, () => window.EhsemhaColorRush3D.getState());
// قراءة (فقط) من واجهة التصحيح الداخلية لمعرفة الإجابة الصحيحة للجولة الحالية — لا نستخدمها للتحكم بالمباراة
const roundInfo = (page) => F(page, () => {
  const D = window.EhsemhaColorRush3D._debug, R = D.G.R; if (!R) return null;
  const ok = R.cellsOfG[R.answerG], bad = []; R.cellsOfG.forEach((l, g) => { if (g !== R.answerG) l.forEach((c) => bad.push(c)); });
  return { no: R.no, colorAr: D.COLORS[R.groups[R.answerG].ci].ar, okNums: ok.map((c) => R.cellNum[c]), badNums: bad.map((c) => R.cellNum[c]), answerG: R.answerG };
});
const players = (page) => F(page, () => { const o = {}; window.EhsemhaColorRush3D._debug.PL.map.forEach((p, k) => { o[k] = { alive: p.alive, kicked: p.kicked, name: p.name, avatar: p.avatar }; }); return o; });
const wins = (page) => page.evaluate(() => window.__wins.slice());
const id = (v) => 'tiktok:' + v;
const toAr = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
async function waitSelect(page, afterRound, timeout = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await state(page).catch(() => null);
    if (s && s.state === 'select' && s.round > afterRound) return s;
    if (s && s.state === 'winner') return s;
    await sleep(150);
  }
  return null;
}

(async () => {
  // ===== 0) الملف مطابق حرفياً للمرجع =====
  const file = fs.readFileSync(path.join(__dirname, '..', '..', 'color-rush3d.html'));
  const sha = crypto.createHash('sha256').update(file).digest('hex');
  check('الملف مطابق للمرجع المعتمد (SHA-256 + الحجم)', sha === ORIGINAL_SHA256 && file.length === ORIGINAL_SIZE, { sha, size: file.length });
  check('صورة الغلاف WebP موجودة وبحجم مناسب للويب', (() => { const b = fs.readFileSync(path.join(__dirname, '..', '..', 'color-rush3d-cover.webp')); return b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP' && b.length < 200 * 1024; })());

  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 480, height: 300 }); // الرسم البرمجي ببيئة الاختبار بطيء: نافذة صغيرة
  // إعدادات اللعبة (تُحفظ بمفتاحها الخاص) للاختبار فقط: جودة منخفضة + أزمنة جولات أطول من الافتراضية لتحمّل بطء الرسم البرمجي
  await page.addInitScript(() => { try { localStorage.setItem('ehsmaha:colorrush3d:settings:v1', JSON.stringify({ quality: 'low', skipIntro: true, rounds: [28, 28, 28, 28, 28, 28], prep: 2 })); } catch (e) { /* */ } });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });
  await page.evaluate(() => { window.__lsBefore = JSON.stringify(Object.keys(localStorage).filter((k) => k !== 'ehsmaha:colorrush3d:settings:v1').sort()); });

  // ===== 1) الكرت والتسجيل =====
  await page.evaluate(() => show('home')); await sleep(600);
  const reg = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.gcard[data-tag="colorrush"]')];
    const card = cards[0];
    const lib = [...document.querySelectorAll('#hlob-grid .hlob-card')].find((n) => n.getAttribute('data-tag') === 'colorrush');
    return {
      n: cards.length, name: card && card.querySelector('.gcard-name').textContent, num: card && card.querySelector('.gcard-num').textContent,
      desc: card && card.querySelector('.gcard-desc').textContent, cat: card && card.dataset.category + '|' + card.dataset.extraCats,
      lib: !!lib, cover: !!(lib && lib.querySelector('svg image[href="/color-rush3d-cover.webp"]')), cmd: lib ? lib.innerText.replace(/\s+/g, ' ') : '', reg: !!TST_GAME_REGISTRY['colorrush'],
      fns: ['launchColorRush', 'goSetupColorRush', 'ehsCrGoHome', 'ehsCrOnShow', 'colorrushHandleEvent'].filter((f) => typeof window[f] !== 'function'),
      others: ['xo', 'tug', 'bomb', 'roulette3d', 'wesh', 'hq', 'cannon', 'latatayeh', 'harfnajat', 'spaceodyssey', 'findball'].filter((t) => !document.querySelector('.gcard[data-tag="' + t + '"]')),
    };
  });
  check('الكرت مسجّل مرة وحدة بالمكتبة باسم «ركز باللون» ووصفه المعتمد وغلاف WebP ورسم، ودوالها معرّفة، وبقية الألعاب سليمة', reg.n === 1 && reg.name === 'ركز باللون' && /آخر لاعب متبقٍ/.test(reg.desc) && reg.lib && reg.cover && /الشات يكتب/.test(reg.cmd) && /اسم اللون أو رقم المنصة/.test(reg.cmd) && reg.reg && reg.fns.length === 0 && reg.others.length === 0, reg);
  await page.evaluate(() => homeApplyFilter('3d')); await sleep(300);
  const f3d = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('فلتر ثلاثية الأبعاد يعرض «ركز باللون» مع ألعاب 3D الأخرى', f3d.includes('colorrush') && f3d.includes('harfnajat') && f3d.includes('bomb'), f3d);
  await page.evaluate(() => homeApplyFilter('luck')); await sleep(300);
  const fluck = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('فلتر «حظ وإقصاء» يعرضها (إقصاء جماعي)', fluck.includes('colorrush'), fluck);
  await page.evaluate(() => homeApplyFilter('all')); await sleep(200);
  const srch = await page.evaluate(() => { const i = document.getElementById('hlob-q'); i.value = 'ركز باللون'; i.dispatchEvent(new Event('input', { bubbles: true })); return null; }); await sleep(500);
  const sres = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('البحث «ركز باللون» يجدها', sres.includes('colorrush'), sres);
  await page.evaluate(() => { const i = document.getElementById('hlob-q'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(300);

  // ===== 2) نافذة التفاصيل =====
  await page.evaluate(() => { const c = [...document.querySelectorAll('#hlob-grid .hlob-card')].find((n) => n.dataset.tag === 'colorrush'); c.querySelector('[data-hlob="open"]').click(); }); await sleep(500);
  const dlg = await page.evaluate(() => ({ on: document.getElementById('hlob-dlg-ov').classList.contains('on'), title: document.getElementById('dlg-title').textContent, info: document.getElementById('hlob-dlg-info').innerText, cover: !!document.querySelector('#hlob-dlg-art-in image[href="/color-rush3d-cover.webp"]'), bubbles: document.querySelectorAll('#hlob-dlg-art-in .hcr-b').length, start: document.getElementById('hlob-dlg-start').textContent }));
  check('زر «تفاصيل»: يفتح النافذة بالاسم والفكرة وطريقة الانضمام واختيار اللون وأرقام المنصات والإقصاء والفوز والأوضاع الأربعة وأوقات الجولات', dlg.on && dlg.title === 'ركز باللون' && dlg.cover && dlg.bubbles === 3 && /انضم/.test(dlg.info) && /رقم المنصة/.test(dlg.info) && /يُقصى/.test(dlg.info) && /آخر لاعب متبقٍ/.test(dlg.info) && /الكلاسيكي/.test(dlg.info) && /خداع الألوان/.test(dlg.info) && /ذاكرة الألوان/.test(dlg.info) && /التركيز الاحترافي/.test(dlg.info) && /10 ثم 6 ثم 4/.test(dlg.info), dlg);
  await page.evaluate(() => document.querySelector('[data-hlob="dlg-close"]').click()); await sleep(300);

  // ===== 3) صفحة الإعداد =====
  await page.evaluate(() => goSetupColorRush()); await sleep(500);
  const su = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, hero: !!document.querySelector('#crl-hero svg image'), txt: document.getElementById('pg-setup-colorrush').innerText, btn: !!document.getElementById('btn-colorrush-launch') }));
  check('صفحة الإعداد: صورة الغلاف + شرح الأوضاع الأربعة + كلمة «انضم» + زر ابدأ اللعبة', su.active === 'pg-setup-colorrush' && su.hero && su.btn && /انضم/.test(su.txt) && /الكلاسيكي/.test(su.txt) && /التركيز الاحترافي/.test(su.txt), { active: su.active, hero: su.hero });

  // ===== 4) بث غير مربوط =====
  await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = await page.evaluate(() => { launchColorRush(); return { t: document.getElementById('colorrush-status').textContent, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» ولا تفتح اللعبة', /اربط بثك/.test(unl.t) && unl.a === 'pg-setup-colorrush', unl);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);
  await page.evaluate(() => followGateSetRequired(false));

  // ===== 5) الإطلاق + المصافحة (ready) =====
  await page.evaluate(() => { goSetupColorRush(); launchColorRush(); });
  const opened = await waitFor(page, () => { const a = window.colorrushApi && window.colorrushApi(); return !!a && document.querySelector('.page.active').id === 'pg-colorrush'; }, null, 120000);
  check('الإطلاق: فتح صفحة اللعبة وجهوزية واجهة EhsemhaColorRush3D داخل الإطار', opened);
  const L = await page.evaluate(() => ({ listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), user: document.getElementById('colorrush-live-user').textContent, src: document.getElementById('colorrush-frame').src }));
  check('معالج شات واحد مسجّل للعبة، ويوزر الستريمر ظاهر، والإطار يحمّل الملف المنسوخ بوضع embed', L.listeners.join() === 'colorrush' && L.user === '@' + STREAMER && /color-rush3d\.html\?embed=1/.test(L.src), L);
  check('وضع الربط الحقيقي (link) لا التجريبي، وحالة الاتصال دُفعت من الموقع (متصل)', await fwait(page, () => { const D = window.EhsemhaColorRush3D._debug; return D.LINK.mode === 'link' && D.LINK.explicitDown === false; }, null, 20000), await F(page, () => { const D = window.EhsemhaColorRush3D._debug; return { m: D.LINK.mode, d: D.LINK.explicitDown }; }));
  check('الهيدر الأصلي للعبة مفرد (بلا هيدر موقع مزدوج) وفيه الأزرار الأربعة', await F(page, () => document.querySelectorAll('.ehsmaha-stream-header').length === 1 && ['home', 'kick', 'late', 'reset'].every((k) => document.querySelector('.eh-btn[data-act="' + k + '"]'))));
  check('لا عنصر لعبة مسرّب للصفحة المضيفة (CSS/ids معزولة بالإطار)', await page.evaluate(() => !document.getElementById('stage') && !document.getElementById('hdr') && !document.querySelector('canvas#c')));
  await sleep(1500);

  // ===== 6) الانضمام الحقيقي بالشات =====
  await say('cr_a', 'انضم', 'أحمد'); await say('cr_b', ' انضم ', 'بدر'); await say('cr_c', 'انضم', 'سارة'); await say('cr_d', 'انضم', 'دانة');
  await say('cr_e', 'انضم', 'عمر'); await say('cr_f', 'انضم', 'فهد'); await say('cr_g', 'انضم', 'غادة');
  await say('cr_other', 'مرحبا'); await say('cr_x', 'انضمام'); // ليست كلمة الانضمام
  for (let i = 0; i < 4; i++) await say('cr_a', 'انضم'); // تكرار
  await fwait(page, () => window.EhsemhaColorRush3D.getState().players >= 7, null, 40000); await sleep(1000);
  let s = await state(page), pl = await players(page);
  check('الانضمام بكلمة «انضم»: ٧ لاعبين بلا تكرار، وغير الكلمة لا ينضم', s.players === 7 && Object.keys(pl).length === 7 && !pl[id('cr_other')] && !pl[id('cr_x')] && Object.keys(pl).every((k) => /^tiktok:cr_[a-g]$/.test(k)), { s, keys: Object.keys(pl) });
  check('اسم المتابع الحقيقي (nickname) وافتاره الحقيقي (من الحدث) وصلا للعبة', pl[id('cr_a')] && pl[id('cr_a')].name === 'أحمد' && /cr_a/.test(pl[id('cr_a')].avatar || ''), pl[id('cr_a')]);
  check('أحداث البث الحقيقية وصلت للعبة (LINK.live وعدّاد الرسائل > 0) وأنها بوضع الربط لا الوهمي', await fwait(page, () => { const L = window.EhsemhaColorRush3D._debug.LINK; return L.live === true && L.count >= 7 && L.mode === 'link'; }, null, 15000), await F(page, () => { const L = window.EhsemhaColorRush3D._debug.LINK; return { live: L.live, count: L.count, mode: L.mode }; }));

  // شرط الفولو
  await page.evaluate(() => followGateSetRequired(true));
  await say('cr_nf', 'انضم', 'cr_nf', false); await sleep(2500);
  pl = await players(page);
  check('شرط الفولو مفعّل: غير المتابع لا ينضم', !pl[id('cr_nf')], Object.keys(pl).length);
  await say('cr_fol', 'انضم', 'cr_fol', true); await fwait(page, () => window.EhsemhaColorRush3D.getState().players >= 8, null, 15000);
  pl = await players(page);
  check('شرط الفولو مفعّل: المتابع ينضم', !!pl[id('cr_fol')], Object.keys(pl).length);
  await page.evaluate(() => followGateSetRequired(false));

  // دفعة كبيرة
  const before = (await state(page)).players;
  await H.ctl(H.PRIMARY, { cmd: 'burst', user: STREAMER, count: 24, prefix: 'cr_p', text: 'انضم', identity: { isFollowerOfAnchor: true }, perMs: 30 });
  await fwait(page, (b) => window.EhsemhaColorRush3D.getState().players >= b + 24, before, 60000);
  s = await state(page);
  check('دفعة ٢٤ متابعاً بالكلمة: دخلوا كلهم دون تكرار', s.players === before + 24, { before, now: s.players });

  // أوضاع اللعب الأربعة
  const modes = []; for (const m of ['trick', 'memory', 'master', 'classic']) { modes.push(await F(page, (mm) => { const a = window.EhsemhaColorRush3D; return a.setMode(mm) && a.getState().mode === mm; }, m)); }
  check('أوضاع اللعب الأربعة تُضبط من اللوبي (trick/memory/master/classic)', modes.every(Boolean), modes);

  // الرسالة نفسها لا تُدخل اللاعب مرتين (receive لا join): نحذف الدفعة بالطرد ونُبقي ٨ لاعبين للمباراة
  await F(page, () => { const a = window.EhsemhaColorRush3D, D = a._debug; [...D.PL.map.keys()].filter((k) => /^tiktok:cr_p/.test(k)).forEach((k) => a.kick(k)); });
  await sleep(1200);
  s = await state(page); pl = await players(page);
  check('طرد لاعبين محددين (kick) لا يمسّ بقية اللاعبين', s.players === 8 && Object.keys(pl).every((k) => !/cr_p/.test(k)) && ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'fol'].every((k) => pl[id('cr_' + k)]), { players: s.players, keys: Object.keys(pl) });
  await say('cr_p1', 'انضم'); await sleep(1500);
  check('المطرود لا يعود بالانضمام (قائمة المنع)', !(await players(page))[id('cr_p1')]);

  // ===== 7) المباراة بالاختيارات من الشات =====
  check('زر ابدأ المباراة (start) يبدأ الجولة الأولى', await F(page, () => window.EhsemhaColorRush3D.start()) !== false);
  let sel = await waitSelect(page, 0, 120000);
  check('الجولة الأولى وصلت مرحلة الاختيار (select)', !!sel && sel.state === 'select', sel);
  let ri = await roundInfo(page);
  const goodNum = ri.okNums[0], goodNum2 = ri.okNums[ri.okNums.length - 1], badNum = ri.badNums[0];
  await say('cr_a', ri.colorAr, 'أحمد');                  // صحيح بالاسم
  await say('cr_b', String(goodNum), 'بدر');              // صحيح بالرقم
  await say('cr_c', String(badNum), 'سارة');              // خاطئ برقم منصة لون آخر
  /* cr_d صامت */
  await say('cr_e', toAr(goodNum2), 'عمر');               // صحيح برقم بالأرقام العربية
  await say('cr_f', String(badNum), 'فهد'); await sleep(400); await say('cr_f', String(goodNum), 'فهد'); // يغيّر إلى الصحيح
  await say('cr_g', String(goodNum), 'غادة'); await sleep(400); await say('cr_g', String(badNum), 'غادة'); // يغيّر إلى الخاطئ
  await say('cr_fol', 'كلام عادي لا علاقة له باللون', 'cr_fol'); // رسالة عادية لا تُحتسب
  await sleep(1500);
  const picks = await F(page, () => { const o = {}; window.EhsemhaColorRush3D._debug.PL.map.forEach((p, k) => { o[k] = p.pick ? { g: p.pick.g } : null; }); return o; });
  check('اختيارات الشات وصلت: بالاسم وبالرقم وبالأرقام العربية وتغيير الاختيار، ولا اختيار لمن صمت أو كتب كلاماً عادياً', picks[id('cr_a')] && picks[id('cr_b')] && picks[id('cr_c')] && !picks[id('cr_d')] && picks[id('cr_e')] && picks[id('cr_f')] && picks[id('cr_g')] && !picks[id('cr_fol')], picks);
  // إنهاء الجولة: ننتظر انتهاء المؤقت فعلياً
  check('بعد انتهاء المؤقت: الإقصاء والتأهل وفق قواعد اللعبة (أ، ب، هـ، و يتأهلون؛ ج، د، ز، المتابع الصامت يُقصون)', await fwait(page, () => { const D = window.EhsemhaColorRush3D._debug; return D.G.state === 'result' || D.G.state === 'rebuild' || D.G.state === 'winner'; }, null, 120000));
  pl = await players(page);
  check('نتيجة الجولة ١ مطابقة: الناجون {a,b,e,f} والمقصون {c,d,g,fol}', ['a', 'b', 'e', 'f'].every((k) => pl[id('cr_' + k)].alive) && ['c', 'd', 'g', 'fol'].every((k) => !pl[id('cr_' + k)].alive), pl);

  // الجولة ٢: a فقط يجيب صح → الفائز
  sel = await waitSelect(page, 1, 120000);
  check('الجولة الثانية وصلت مرحلة الاختيار للناجين', !!sel && sel.state === 'select' && sel.round === 2, sel);
  ri = await roundInfo(page);
  await say('cr_a', ri.colorAr, 'أحمد');
  await say('cr_b', String(ri.badNums[0]), 'بدر');
  await say('cr_e', String(ri.badNums[1] || ri.badNums[0]), 'عمر');
  /* f صامت */
  const wn = await fwait(page, () => window.EhsemhaColorRush3D.getState().state === 'winner', null, 120000);
  s = await state(page);
  check('الفائز الأخير (cr_a) يُعلن، وهو الوحيد المتبقي', wn && s.winner && s.winner.uniqueId === id('cr_a') && s.alive === 1, s);
  await sleep(1500);
  const w = await wins(page);
  check('الفوز سُجّل رسمياً مرة وحدة باسم اللعبة للفائز الحقيقي', w.length === 1 && w[0].g === 'ركز باللون' && w[0].id === id('cr_a'), w);

  // إعادة المباراة وريست
  check('زر «إعادة المباراة» (rematch) يرجع للوبي ويحتفظ باللاعبين', await F(page, () => { const a = window.EhsemhaColorRush3D; a.rematch(); return true; }) && await fwait(page, () => { const s = window.EhsemhaColorRush3D.getState(); return s.state === 'lobby' && s.players >= 1; }, null, 30000), await state(page));
  const connsBefore = await H.stats(H.PRIMARY);
  await F(page, () => window.EhsemhaColorRush3D.reset()); await sleep(800);
  s = await state(page);
  const connsAfter = await H.stats(H.PRIMARY);
  check('ريست: يفرّغ اللاعبين ويرجع للوبي دون إعادة تحميل الإطار ولا اتصال جديد بالبث', s.state === 'lobby' && s.players === 0 && JSON.stringify(connsBefore.connectCalls) === JSON.stringify(connsAfter.connectCalls) && (await page.evaluate(() => document.querySelector('.page.active').id)) === 'pg-colorrush', { s, a: connsBefore.connectCalls, b: connsAfter.connectCalls });

  // ===== 8) انقطاع الاتصال وعودته =====
  await fwait(page, () => window.EhsemhaColorRush3D._debug.FL.exp.state === 'lobby', null, 30000); // اللعبة تنتظر اكتمال عودة الساحة للوبي بعد الريست قبل قبول الانضمام
  await sleep(1500);
  await say('cr_h', 'انضم', 'هدى'); await say('cr_i', 'انضم', 'ياسر'); await say('cr_j', 'انضم', 'جود');
  await fwait(page, () => window.EhsemhaColorRush3D.getState().players >= 3, null, 40000);
  const startedOk = await F(page, () => window.EhsemhaColorRush3D.start());
  const sel3 = await waitSelect(page, 0, 120000);
  check('مباراة جديدة بثلاثة لاعبين وصلت مرحلة الاختيار قبل اختبار الانقطاع', !!sel3 && sel3.state === 'select' && sel3.players === 3, { startedOk, sel3 });
  await H.ctl(H.PRIMARY, { cmd: 'mode', user: STREAMER, mode: 'fail' }); // إعادة الاتصال تفشل ← انقطاع مستمر (لا ارتجاج لحظي)
  await H.ctl(H.PRIMARY, { cmd: 'dropUpstream', user: STREAMER }); // انقطاع البث الأصلي عن السيرفر
  const down = await waitFor(page, () => homeConnOverall() !== 'connected', null, 30000);
  const paused = await fwait(page, () => window.EhsemhaColorRush3D.getState().paused === true, null, 30000);
  check('انقطاع الاتصال: الموقع يكتشفه واللعبة تتوقف بأمان (إيقاف تلقائي)', down && paused, { down, paused, st: await state(page) });
  await H.ctl(H.PRIMARY, { cmd: 'mode', user: STREAMER, mode: 'live' }); // عودة البث
  const back = await waitFor(page, () => homeConnOverall() === 'connected', null, 120000);
  const resumed = await fwait(page, () => window.EhsemhaColorRush3D.getState().paused === false, null, 60000);
  check('إعادة الاتصال: الحالة تتزامن وتستأنف المباراة تلقائياً', back && resumed, { back, resumed });
  await F(page, () => window.EhsemhaColorRush3D.reset());

  // ===== 9) الخروج والتنظيف =====
  check('لا أخطاء JS بالصفحة والإطار', page._errors.length === 0, page._errors.slice(0, 3));
  await F(page, () => document.querySelector('.eh-btn[data-act="home"]').click()); await sleep(900);
  const ex = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, src: document.getElementById('colorrush-frame').getAttribute('src'), listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), ls: JSON.stringify(Object.keys(localStorage).filter((k) => k !== 'ehsmaha:colorrush3d:settings:v1').sort()), before: window.__lsBefore, cr: !!localStorage.getItem('ehsmaha:colorrush3d:settings:v1') }));
  check('زر «الرئيسية» داخل اللعبة يرجع لمكتبة ألعاب الستريمر ويفرّغ الإطار ويفكّ معالج الشات', ex.active === 'pg-home' && /about:blank/.test(ex.src || '') && ex.listeners.length === 0, ex);
  check('إعدادات اللعبة بمفتاحها الخاص باقية، ولم يُحذف أي مفتاح تخزين آخر للموقع', ex.cr && JSON.parse(ex.before).every((k) => JSON.parse(ex.ls).includes(k)), { before: ex.before, now: ex.ls });

  // خروج وإعادة دخول عدة مرات: بلا تكرار اشتراكات
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { goSetupColorRush(); launchColorRush(); });
    await waitFor(page, () => !!window.colorrushApi() && document.querySelector('.page.active').id === 'pg-colorrush', null, 120000);
    await sleep(800);
    await page.evaluate(() => ehsCrGoHome()); await sleep(500);
  }
  const re = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), frames: document.querySelectorAll('iframe[src*="color-rush3d"]').length, api: !!window.colorrushApi() }));
  check('٣ مرات دخول/خروج: لا معالج شات مكرر ولا إطار عالق ولا واجهة لعبة حية بالخلفية', re.active === 'pg-home' && re.listeners.length === 0 && re.frames === 0 && !re.api, re);
  // الانتقال لصفحة لعبة أخرى أثناء اللعب ينظّف
  await page.evaluate(() => { goSetupColorRush(); launchColorRush(); });
  await waitFor(page, () => !!window.colorrushApi() && document.querySelector('.page.active').id === 'pg-colorrush', null, 120000);
  await page.evaluate(() => show('home')); await sleep(700);
  const sw = await page.evaluate(() => ({ listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), src: document.getElementById('colorrush-frame').getAttribute('src') }));
  check('مغادرة صفحة اللعبة بأي طريقة (show) تنظّف الإطار والاشتراك', sw.listeners.length === 0 && /about:blank/.test(sw.src || ''), sw);
  check('لا أخطاء JS نهائية', page._errors.length === 0, page._errors.slice(0, 3));

  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
