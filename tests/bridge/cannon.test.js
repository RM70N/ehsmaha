'use strict';
// المدفع البشري — من ربط البث إلى نهاية اللعبة، عبر سيرفر الجسر الحقيقي (fake connector) وindex.html الحقيقي:
// الكرت أول لعبة بالمكتبة · شاشة الإعداد · الربط (استئناف تلقائي بعد نافذة الربط السريع) · الانتظار والانضمام
// (كلمة، متابعة، طرد، ريست، مؤقّت) · الراوند (Three.js داخل iframe): أوامر "زاوية قوة"، هدايا، رميات متعددة،
// انضمام متأخر، فائز يُسجَّل، رجوع لجولة جديدة · الخروج · فشل تحميل Three.js.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/cannon.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const ctl = (o) => H.ctl(H.PRIMARY, Object.assign({ user: STREAMER, identity: { isFollowerOfAnchor: true } }, o));
const say = (viewer, text, extra) => ctl(Object.assign({ cmd: 'chat', viewer, nickname: viewer, text }, extra || {}));
async function waitFor(page, fn, arg, timeout = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(150); }
  return false;
}
const hc = (page, expr) => page.evaluate((e) => { const w = document.getElementById('cannon-w-frame').contentWindow; return (0, w.eval)(e); }, expr);
const frameInfo = (page) => page.evaluate(() => { const f = document.getElementById('cannon-w-frame'); return f && f.contentWindow.HC ? f.contentWindow.HC.info() : null; });
const newGamePage = async (browser, extra) => {
  const page = await H.newPage(browser, { init: 'window.CANNON_ENTRY_SECONDS=4; window.CANNON_TICK_MS=100;' + (extra || '') });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; });
  return page;
};
const setChip = (page, group, v) => page.evaluate(([g, v]) => { const b = [...document.querySelectorAll('#cannon-s-' + g + ' button')].find((x) => x.dataset.v === v); b.click(); return b.getAttribute('aria-pressed'); }, [group, v]);
const setToggle = (page, k, on) => page.evaluate(([k, on]) => { const i = document.querySelector('#pg-setup-cannon input[data-k="' + k + '"]'); if (i.checked !== on) i.click(); return i.checked; }, [k, on]);

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();

  // ============ 1) الكرت: أول لعبة بالمكتبة بتصميم ملف الكرت ============
  let page = await newGamePage(browser);
  await page.evaluate(() => show('home'));
  await sleep(600);
  const lib = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#hlob-grid .hlob-card')];
    const c = cards[0];
    const q = (s) => c && c.querySelector(s);
    return {
      n: cards.length, first: c && c.dataset.tag, tag: q('.hlob-tag') && q('.hlob-tag').textContent, tagCls: q('.hlob-tag') && q('.hlob-tag').className,
      cmd: q('.hlob-cmd') && q('.hlob-cmd').innerText.replace(/\s+/g, ' ').trim(), cat: q('.hlob-cat') && q('.hlob-cat').textContent.trim(),
      h3: q('h3') && q('h3').textContent, p: q('p') && q('p').textContent, btns: [...c.querySelectorAll('.hlob-card-acts button')].map((b) => b.textContent.trim()),
      svg: !!q('.hlob-art svg'), anim: !!q('.hlob-art .hcn-barrel') && !!q('.hlob-art .hcn-fly') && !!q('.hlob-art .hcn-mark'), pin: !!q('.hlob-pin'),
      cats: [...document.querySelectorAll('.home-lib-filter')].map((b) => b.textContent.replace(/[٠-٩]+$/, '').trim()),
      barrelAnim: getComputedStyle(c.querySelector('.hcn-barrel')).animationName,
    };
  });
  check('المدفع البشري أول بطاقة بمكتبة الستريمر (٣٨ لعبة)', lib.first === 'cannon' && lib.n === 38, { first: lib.first, n: lib.n });
  check('الكرت بنفس ملف التصميم: شارة جديد · أمر "اكتب 45 80" · فئة ثلاثية الأبعاد · العنوان والوصف الكامل · زرّان',
    lib.tag === 'جديد' && /new/.test(lib.tagCls) && lib.cmd === 'اكتب 45 80' && lib.cat === 'ثلاثية الأبعاد' && lib.h3 === 'المدفع البشري' &&
    lib.p === 'اكتب زاوية وقوة وانطلق من المدفع. الستريمر يرمي عوائق في السماء والهدايا تحميك. الأبعد يفوز.' && lib.btns.join('|') === 'ابدأ اللعبة|التفاصيل' && lib.pin, lib);
  check('رسم الكرت (SVG المدفع) بحركته: المدفع/الارتداد/المقذوف/العلامة', lib.svg && lib.anim && lib.barrelAnim === 'hcn-aim', { svg: lib.svg, anim: lib.anim, a: lib.barrelAnim });
  check('فئة «ثلاثية الأبعاد» ضمن فلاتر المكتبة', lib.cats.includes('ثلاثية الأبعاد'), lib.cats);
  await page.evaluate(() => homeApplyFilter('3d')); await sleep(300);
  check('فلتر ثلاثية الأبعاد يعرض المدفع أولاً (ومعه القنبلة وشد الحبل والروليت 3D والميزان ووش تغيّر ولا تطيّحه وحرف النجاة)', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag))) === '["cannon","bomb","tug","roulette3d","almeezan","wesh","latatayeh","harfnajat"]');
  await page.evaluate(() => homeApplyFilter('all')); await sleep(200);
  await page.evaluate(() => document.querySelector('#hlob-grid .hlob-card[data-tag="cannon"] [data-hlob="open"]').click()); await sleep(300);
  const dlg = await page.evaluate(() => ({ on: document.getElementById('hlob-dlg-ov').classList.contains('on'), title: document.getElementById('dlg-title').textContent, art: !!document.querySelector('#hlob-dlg-art-in .hcn-barrel'), cmd: document.getElementById('hlob-dlg-cmd').innerText.replace(/\s+/g, ' ').trim() }));
  check('نافذة التفاصيل: العنوان والرسم والأمر', dlg.on && dlg.title === 'المدفع البشري' && dlg.art && dlg.cmd === 'اكتب 45 80', dlg);
  await page.evaluate(() => document.getElementById('hlob-dlg-start').click()); await sleep(400);
  check('«ابدأ الإعداد» من التفاصيل يفتح شاشة إعداد المدفع', await page.evaluate(() => document.querySelector('.page.active').id === 'pg-setup-cannon'));

  // ============ 2) شاشة الإعداد ============
  const setup = await page.evaluate(() => {
    const p = document.getElementById('pg-setup-cannon'), g = (id) => document.getElementById('cannon-s-' + id);
    const pressed = (id) => g(id).querySelector('[aria-pressed="true"]').dataset.v;
    return {
      title: p.querySelector('.hcs-ttl').textContent, kw: g('kw').value, join: pressed('join'), shots: pressed('shots'), wind: pressed('wind'), energy: pressed('energy'), angle: pressed('angle'), mult: pressed('mult'),
      max: g('max').value, pen: g('pen').value, minp: g('minp').value, toggles: [...p.querySelectorAll('.hcs-tg input')].map((i) => i.dataset.k + '=' + i.checked).join(),
      preview: !!p.querySelector('.hcs-flyer') && !!p.querySelector('.hcs-bar'), sum: [g('s1').textContent, g('s2').textContent, g('s3').textContent].join('|'), adv: !!g('adv'),
      font: getComputedStyle(p.querySelector('.hcs-ttl')).fontFamily.slice(0, 20), bg: getComputedStyle(p).backgroundColor, go: g('go').textContent.trim(),
    };
  });
  check('الإعداد: العنوان والقيم الافتراضية من الملف (انضم · ٦٠ث · رميتان · ٣٠ لاعب · رياح خفيفة…)',
    setup.title === 'إعداد المدفع البشري' && setup.kw === 'انضم' && setup.join === '60' && setup.shots === '2' && setup.wind === '1' && setup.energy === 'mid' && setup.angle === '80' && setup.mult === '1' &&
    setup.max === '30' && setup.pen === '3' && setup.minp === '2' && setup.toggles === 'obs=true,pen=true,gift=true,auto=true,late=false' && setup.adv && setup.go === 'ابدأ اللعبة', setup);
  check('الإعداد: معاينة مباشرة (مدفع وطائر) وملخص ٦٠|٣٠|٢', setup.preview && setup.sum === '٦٠|٣٠|٢', setup.sum);
  await setChip(page, 'join', '0'); await setChip(page, 'shots', '3'); await setChip(page, 'wind', '0'); await setToggle(page, 'obs', false); await setToggle(page, 'late', true);
  await page.evaluate(() => { const m = document.getElementById('cannon-s-max'); m.value = '45'; m.dispatchEvent(new Event('input', { bubbles: true })); });
  const prev = await page.evaluate(() => ({ sum: ['s1', 's2', 's3'].map((i) => document.getElementById('cannon-s-' + i).textContent).join('|'), obsOn: document.getElementById('cannon-s-o-obs').classList.contains('hcs-on'), penOn: document.getElementById('cannon-s-o-pen').classList.contains('hcs-on'), tags: [...document.querySelectorAll('#cannon-s-tags .hcs-tag')].map((t) => t.textContent).join(), flag: document.getElementById('cannon-s-flag').style.opacity }));
  check('تغيير أي إعداد ينعكس تلقائياً بالمعاينة والملخص والوسوم', prev.sum === '∞|٤٥|٣' && !prev.obsOn && prev.penOn && /انضمام متأخر/.test(prev.tags) && !/عوائق/.test(prev.tags) && /بدون رياح/.test(prev.tags) && prev.flag === '0.25', prev);
  await setChip(page, 'join', '60'); await setChip(page, 'shots', '1'); await setChip(page, 'wind', '1'); await setToggle(page, 'obs', true); await setToggle(page, 'late', false);
  await page.evaluate(() => { const m = document.getElementById('cannon-s-max'); m.value = '30'; m.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => { document.getElementById('cannon-s-kw').value = ''; document.getElementById('cannon-s-go').click(); });
  check('كلمة انضمام فارغة تُرفض برسالة', /كلمة الانضمام/.test(await page.evaluate(() => document.getElementById('cannon-s-status').textContent)));
  await page.evaluate(() => { document.getElementById('cannon-s-kw').value = 'انضم'; });

  // ============ 3) من غير ربط بث: رسالة + نافذة الربط السريع، وبعد الربط تكمل اللعبة تلقائياً ============
  await page.evaluate(() => document.getElementById('cannon-s-go').click()); await sleep(400);
  const noConn = await page.evaluate(() => ({ msg: document.getElementById('cannon-s-status').textContent, qc: document.getElementById('qc-overlay').classList.contains('visible'), active: document.querySelector('.page.active').id, st: cannonStatus }));
  check('بدون بث مربوط: رسالة «اربط بثك» + تُفتح نافذة الربط السريع ولا تبدأ اللعبة', /اربط بثك/.test(noConn.msg) && noConn.qc && noConn.active === 'pg-setup-cannon' && noConn.st === 'idle', noConn);
  await page.evaluate((u) => { document.getElementById('qc-main-input').value = u; homeStartQuickConnect(); }, STREAMER);
  const resumed = await waitFor(page, () => cannonStatus === 'waiting' && document.querySelector('.page.active').id === 'pg-cannon', null, 20000);
  check('بعد نجاح الربط تكمل اللعبة تلقائياً إلى شاشة الانتظار (استئناف الربط السريع)', resumed, await page.evaluate(() => ({ st: cannonStatus, active: document.querySelector('.page.active').id })));
  await sleep(500);

  // ============ 4) شاشة الانتظار والانضمام ============
  const w0 = await page.evaluate(() => {
    const g = (id) => document.getElementById('cannon-w-' + id);
    return {
      user: g('user').textContent, plt: g('plt').textContent, dotOff: g('dot').classList.contains('hcw-off'), kw: g('kw').textContent, mx: g('mx').textContent, tm: g('tm').textContent, start: g('start').disabled,
      steps: g('steps').children.length, listeners: Object.keys(homeGameListeners), gname: document.querySelector('#pg-cannon .hcw-gname').textContent, frame: !!document.getElementById('cannon-w-frame'),
      bg: getComputedStyle(document.getElementById('pg-cannon')).backgroundColor, ty: g('ty').textContent !== undefined,
    };
  });
  check('الانتظار: @يوزر البث · متصل · كلمة الانضمام · ٣٠ لاعب · سلّم ٨ هدايا · زر البدء معطّل', w0.user === '@' + STREAMER && /متصل/.test(w0.plt) && !w0.dotOff && w0.kw === 'انضم' && w0.mx === '٣٠' && w0.steps === 8 && w0.start && w0.gname === 'المدفع البشري', w0);
  check('معالج البث مسجّل للعبة، واللعبة ثلاثية الأبعاد لا تُحمَّل أثناء الانتظار (شاشة خفيفة لا تزاحم الشات)', w0.listeners.includes('cannon') && !w0.frame, { l: w0.listeners, frame: w0.frame });

  await say('p0', 'انضم'); await say('p1', 'انضم😍'); await say('p2', '‏انضم!!'); await say('p0', 'انضم'); await say('p3', 'مرحبا');
  await sleep(900);
  const j1 = await page.evaluate(() => ({ n: cannonParticipants.size, keys: [...cannonParticipants.keys()].sort().join(), count: document.getElementById('cannon-w-n').textContent, start: document.getElementById('cannon-w-start').disabled }));
  const fd1 = await page.evaluate(() => [...document.querySelectorAll('#cannon-w-feed div')].map((d) => d.textContent));
  check('الانضمام بصيغ الكلمة (إيموجي/علامات/مسافة خفية) وبلا تكرار، وغير الكلمة لا ينضم', j1.n === 3 && j1.keys === 'tiktok:p0,tiktok:p1,tiktok:p2' && j1.count === '٣' && !j1.start, j1);
  // شرط الفولو: غير متابع معروف يتعلّق حتى يتابع
  await say('nf1', 'انضم', { identity: { isFollowerOfAnchor: false } }); await sleep(500);
  const nf1 = await page.evaluate(() => cannonParticipants.has('tiktok:nf1'));
  await ctl({ cmd: 'follow', viewer: 'nf1' }); await sleep(600);
  const nf2 = await page.evaluate(() => cannonParticipants.has('tiktok:nf1'));
  const fd2 = await page.evaluate(() => [...document.querySelectorAll('#cannon-w-feed div')].map((d) => d.textContent));
  check('شرط الفولو: غير المتابع لا ينضم، وينضم تلقائياً بعد المتابعة', !nf1 && nf2, { before: nf1, after: nf2 });
  check('سجل الشات المباشر بشاشة الانتظار: يظهر الانضمام، والرسالة التي لا تطابق الكلمة، وسبب رفض غير المتابع', fd1.some((t) => /مرحبا/.test(t) && /ليست كلمة الانضمام/.test(t)), fd1);
  check('سجل الشات يوضّح سبب الرفض (لازم يتابعك أولاً)', fd2.some((t) => /يتابعك/.test(t)), fd2);
  await ctl({ cmd: 'burst', count: 12, prefix: 'b', text: 'انضم', identity: { isFollowerOfAnchor: true }, perMs: 30 }); await sleep(1800);
  const j2 = await page.evaluate(() => ({ n: cannonParticipants.size, count: document.getElementById('cannon-w-n').textContent, crowd: document.getElementById('cannon-w-crowd').children.length, list: document.getElementById('cannon-w-list').children.length, start: document.getElementById('cannon-w-start').disabled, crowdNames: [...document.querySelectorAll('#cannon-w-crowd .hcw-nm')].length }));
  check('١٦ منضم: العدّاد ١٦ · دائرة الجمهور ٨ شخصيات · قائمة الجاهزين ١٢ · زر البدء مفعّل', j2.n === 16 && j2.count === '١٦' && j2.crowd === 8 && j2.list === 12 && !j2.start && j2.crowdNames === 8, j2);
  // أمر زاوية/قوة قبل بدء الجولة يُحفظ
  await say('p0', '45 80'); await say('p1', '٣٥ ٩٠'); await say('nf1', '50 70'); await say('stranger', '40 60'); await sleep(500);
  // طرد
  await page.evaluate(() => document.getElementById('cannon-w-kick').click()); await sleep(300);
  const kd = await page.evaluate(() => ({ on: document.getElementById('cannon-w-ov').classList.contains('hcw-on'), rows: document.querySelectorAll('#cannon-w-dl li').length }));
  await page.evaluate(() => document.querySelector('#cannon-w-dl .hcw-kb[data-uid="tiktok:b3"]').click()); await sleep(300);
  await page.evaluate(() => document.getElementById('cannon-w-kx').click());
  await say('b3', 'انضم'); await sleep(500);
  const kd2 = await page.evaluate(() => ({ n: cannonParticipants.size, has: cannonParticipants.has('tiktok:b3') }));
  check('كتابة أمر «زاوية قوة» مباشرة بلا كلمة انضمام تُدخل صاحبها (وأمره محفوظ)', await page.evaluate(() => cannonParticipants.has('tiktok:stranger')));
  check('نافذة الطرد: تعرض المنضمين، تطرد لاعباً، والمطرود لا يعود بالكلمة', kd.on && kd.rows === 17 && kd2.n === 16 && !kd2.has, { kd, kd2 });
  // ريست
  await page.evaluate(() => document.getElementById('cannon-w-reset').click()); await sleep(400);
  check('ريست: يصفّر المنضمين ويرجع العدّاد', await page.evaluate(() => cannonParticipants.size === 0 && document.getElementById('cannon-w-n').textContent === '٠' && document.getElementById('cannon-w-start').disabled && cannonStatus === 'waiting'));

  // ============ 5) مؤقّت الانضمام: لاعب وحيد → يعيد العدّ، لاعبان → يبدأ تلقائياً ============
  await page.evaluate(() => goHome());
  await page.evaluate(() => { goSetupCannon(); }); await setChip(page, 'join', '30'); await setChip(page, 'shots', '1'); await setToggle(page, 'pen', false);
  await page.evaluate(() => launchCannon()); await sleep(700);
  await say('t0', 'انضم'); await sleep(500);
  const t30 = await page.evaluate(() => document.getElementById('cannon-w-tm').textContent);
  await sleep(3800);
  const stillWaiting = await page.evaluate(() => cannonStatus === 'waiting');
  check('المؤقّت لا يبدأ الجولة بلاعب واحد (أقل من الحد الأدنى) ويعيد العدّ', stillWaiting && /[٣٠٢١]/.test(t30), { t30, stillWaiting });
  await say('t1', 'انضم'); await say('t2', 'انضم');
  const auto = await waitFor(page, () => cannonStatus === 'round' || cannonStatus === 'launching', null, 12000);
  check('عند انتهاء المؤقّت بوجود لاعبين كفاية تبدأ الجولة تلقائياً', auto);
  await waitFor(page, () => cannonStatus === 'round', null, 8000);
  await page.evaluate(() => cannonReset()); await sleep(500);

  // ============ 6) الراوند الكامل (رمية وحدة، عقوبات مطفأة) ============
  await page.evaluate(() => goHome());
  await page.evaluate(() => goSetupCannon()); await setChip(page, 'join', '0'); await setChip(page, 'shots', '1'); await setToggle(page, 'pen', false); await setChip(page, 'energy', 'fast');
  await page.evaluate(() => launchCannon()); await sleep(700);
  for (const v of ['r0', 'r1', 'r2']) await say(v, 'انضم'); await sleep(600);
  await say('r0', '45 80'); await say('r1', '35 100'); await sleep(300);
  await page.setViewportSize({ width: 480, height: 270 }); // تصيير WebGL البرمجي ببيئة الاختبار بطيء؛ نصغّر النافذة ليكمل الراوند بوقت معقول
  await page.evaluate(() => cannonStartRound());
  const overlay = await page.evaluate(() => document.getElementById('cannon-w-gof').classList.contains('hcw-on'));
  check('«انطلقنا!» تظهر عند بدء الجولة', overlay);
  const live = await waitFor(page, () => cannonStatus === 'round' && document.body.classList.contains('hc-live'), null, 10000);
  await sleep(1200);
  const rd = await page.evaluate(() => {
    const f = document.getElementById('cannon-w-frame'), d = f.contentDocument, r = f.getBoundingClientRect();
    return {
      wrapHidden: document.getElementById('cannon-w-live').hidden, full: r.width === innerWidth && r.height === innerHeight, waitHidden: getComputedStyle(document.querySelector('#pg-cannon .hcw-wrap')).display === 'none',
      info: f.contentWindow.HC.info(), cfg: f.contentWindow.HC.cfg(), rows: d.querySelectorAll('#rows li').length, canvas: !!d.getElementById('gl') && d.getElementById('gl').width > 100,
      hud: ['phase', 'wind', 'deck', 'ladder'].map((i) => d.getElementById(i) && !d.getElementById(i).hidden).join(),
      fixedVisible: [...document.querySelectorAll('body *')].filter((e) => { const cs = getComputedStyle(e); return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden' && e.offsetWidth > 0 && !e.closest('#cannon-w-live') && !e.closest('.hcw-ov') && cs.opacity !== '0' && cs.pointerEvents !== 'none'; }).map((e) => e.id || e.className).slice(0, 8),
    };
  });
  check('الراوند: الشاشة كاملة (iframe بملء النافذة) ولا يبقى غير اللعبة', live && !rd.wrapHidden && rd.full && rd.waitHidden && rd.canvas, { live, full: rd.full, wait: rd.waitHidden, canvas: rd.canvas });
  check('اللاعبون الثلاثة داخل اللعبة وأوامر ما قبل الجولة محفوظة (2 بأوامر)', rd.info.state === 'entry' && rd.info.players === 3 && rd.info.aimed === 2 && rd.rows === 3, rd.info);
  check('الإعدادات وصلت للعبة (رميات/طاقة/رياح/حد الزاوية/عوائق/هدايا/عقوبات)', rd.cfg.shots === 1 && rd.cfg.energyRate === 2 && rd.cfg.wind === 1 && rd.cfg.maxAngle === 80 && rd.cfg.obs && rd.cfg.gift && !rd.cfg.pen && rd.cfg.auto && !rd.cfg.late && rd.cfg.max === 30, rd.cfg);
  check('لا عناصر ثابتة من الموقع فوق الراوند (مؤشرات/أزرار عائمة مخفية)', rd.fixedVisible.length === 0, rd.fixedVisible);
  // انضمام أثناء نافذة الأوامر + أمر جديد + هدية قبل الإطلاق (تُتجاهل) + تجاهل غير المنضم
  await say('r3', 'انضم'); await sleep(500); await say('r3', '60 100'); await say('r2', '٥٠ ٧٠'); await say('r0', '85 90'); await say('direct1', '30 50'); await say('chatter', 'مرحبا يا شباب');
  await waitFor(page, () => { const w = document.getElementById('cannon-w-frame').contentWindow; const t = [...w.document.querySelectorAll('#rows li')].map((li) => li.innerText.replace(/\s+/g, ' ')); return t.length === 5 && t.some((x) => /r0/.test(x) && /80° · 90/.test(x)) && t.some((x) => /r2/.test(x) && /50° · 70/.test(x)); }, null, 15000);
  const inRound = await page.evaluate(() => { const w = document.getElementById('cannon-w-frame').contentWindow; return { info: w.HC.info(), r0: [...w.document.querySelectorAll('#rows li')].map((li) => li.innerText.replace(/\s+/g, ' ')), joined: cannonParticipants.has('tiktok:r3') }; });
  check('انضمام أثناء نافذة الأوامر: بالكلمة، وبكتابة الأمر مباشرة (زاوية قوة بلا كلمة)، ومن يكتب كلاماً عادياً لا ينضم', inRound.joined && inRound.info.players === 5 && inRound.info.aimed === 5 && inRound.r0.some((t) => /direct1/.test(t)) && !inRound.r0.some((t) => /chatter/.test(t)), inRound);
  check('الزاوية الأعلى من الحد (85 > 80) تُقصّ إلى 80', inRound.r0.some((t) => /r0/.test(t) && /80° · 90/.test(t)), inRound.r0);
  // الإطلاق + هدايا
  check('تبدأ مرحلة الإطلاق بعد نافذة الأوامر', await waitFor(page, () => document.getElementById('cannon-w-frame').contentWindow.HC.info().state === 'firing', null, 15000));
  await sleep(2200);
  await ctl({ cmd: 'gift', viewer: 'gf1', nickname: 'مهدي', giftName: 'Galaxy', diamondCount: 1000 });
  await ctl({ cmd: 'gift', viewer: 'gf2', nickname: 'نجد', giftName: 'Rose', diamondCount: 1, repeatCount: 3 });
  await ctl({ cmd: 'gift', viewer: 'gf3', nickname: 'سعد', giftName: 'هدية غريبة', diamondCount: 299 });
  await sleep(900);
  const gifts = await page.evaluate(() => { const d = document.getElementById('cannon-w-frame').contentDocument; return { fx: d.getElementById('fxRow').innerText.replace(/\s+/g, ' '), stage: d.getElementById('sTag').textContent, energy: d.getElementById('enV').textContent }; });
  check('هدايا البث تظهر كقوى للاعب الطائر: جالاكسي = حصانة كاملة، كورجي بالسعر = مظلة، ووردة = دعم', /حصانة كاملة/.test(gifts.fx) && /مظلة/.test(gifts.fx) && /دعم/.test(gifts.fx), gifts);
  // طرد لاعب أثناء الجولة
  await page.evaluate(() => { const u = [...cannonParticipants.keys()].find((k) => k === 'tiktok:r2'); document.getElementById('cannon-w-bar-kick').click(); document.querySelector('#cannon-w-dl .hcw-kb[data-uid="' + u + '"]').click(); document.getElementById('cannon-w-kx').click(); });
  check('طرد لاعب أثناء الجولة يخرجه من اللعبة', await waitFor(page, () => { const w = document.getElementById('cannon-w-frame').contentWindow; return w.HC.info().players === 4 && ![...w.document.querySelectorAll('#rows .nm')].some((n) => n.textContent === 'r2'); }, null, 15000));
  const res = await waitFor(page, () => !!cannonLastResult, null, 360000);
  const result = await page.evaluate(() => cannonLastResult);
  check('انتهت الجولة بنتيجة: فائز بأبعد مسافة وترتيب كامل للاعبين الذين أطلقوا', res && result.winner && result.results.length >= 2 && result.results[0].key === result.winner.key && result.results.every((r, i, a) => i === 0 || a[i - 1].dist >= r.dist) && result.winner.dist > 0, result);
  const score = await page.evaluate((key) => { const db = JSON.parse(localStorage.getItem('streamer_games_scores') || '{}'); const s = db['streamer1'] || db[Object.keys(db)[0]] || {}; return Object.values(s).filter((u) => u.games && u.games['المدفع البشري']).map((u) => [u.nickname, u.games['المدفع البشري']]); }, null);
  check('الفوز مسجّل بلوحة المتصدرين باسم اللعبة', score.length === 1 && score[0][1] === 1, score);
  const back = await waitFor(page, () => cannonStatus === 'waiting' && !document.body.classList.contains('hc-live') && document.getElementById('cannon-w-live').hidden, null, 60000);
  const after = await page.evaluate(() => ({ n: cannonParticipants.size, tm: document.getElementById('cannon-w-tm').textContent, active: document.querySelector('.page.active').id, frame: !!document.getElementById('cannon-w-frame') }));
  check('بعد الفوز ترجع لشاشة الانتظار بجولة جديدة (قائمة فارغة، اللعبة محرَّرة من الذاكرة)', back && after.n === 0 && after.active === 'pg-cannon' && !after.frame, after);

  // ============ 7) جولة ثانية بعدة رميات وانضمام متأخر + عقوبات (النافذة) ============
  await page.evaluate(() => goHome());
  await page.evaluate(() => goSetupCannon()); await setChip(page, 'join', '0'); await setChip(page, 'shots', '2'); await setToggle(page, 'late', true); await setToggle(page, 'pen', true); await setToggle(page, 'obs', false); await setToggle(page, 'gift', false);
  await page.evaluate(() => { const p = document.getElementById('cannon-s-pen'); p.value = '2'; p.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => launchCannon()); await sleep(700);
  await say('s0', 'انضم'); await say('s1', 'انضم'); await sleep(500); await say('s0', '40 90'); await sleep(300); // s1 ينضم بلا أمر: ما يطلق
  await page.setViewportSize({ width: 480, height: 270 });
  await page.evaluate(() => cannonStartRound());
  await waitFor(page, () => cannonStatus === 'round', null, 10000); await sleep(1000);
  const cfg2 = await hc(page, 'HC.cfg()');
  const hid = await page.evaluate(() => { const d = document.getElementById('cannon-w-frame').contentDocument; return { ladder: d.getElementById('ladder').hidden, obs: d.getElementById('obsBtns').hidden, auto: d.getElementById('autoBtn').hidden }; });
  check('إعدادات الجولة الثانية: رميتان · انضمام متأخر · عوائق وهدايا مطفأة تُخفي لوحتها وسلّم الهدايا', cfg2.shots === 2 && cfg2.late && !cfg2.obs && !cfg2.gift && cfg2.pen && cfg2.penSec === 2 && hid.ladder && hid.obs && hid.auto, { cfg2, hid });
  await waitFor(page, () => document.getElementById('cannon-w-frame').contentWindow.HC.info().state === 'firing', null, 15000);
  await sleep(1500);
  await say('late1', 'انضم'); await sleep(600); await say('late1', '30 95'); await sleep(400);
  const lateIn = await page.evaluate(() => { const w = document.getElementById('cannon-w-frame').contentWindow; return { info: w.HC.info(), joined: cannonParticipants.has('tiktok:late1') }; });
  check('انضمام متأخر أثناء الإطلاق (بعد تفعيله) يدخل اللاعب بدوره', lateIn.joined && lateIn.info.players === 3 && lateIn.info.aimed === 2, lateIn);

  // نافذة العقوبة: الستريمر الآلي يختارها أو يضغطها الستريمر يدوياً
  const pen = await waitFor(page, () => !document.getElementById('cannon-w-frame').contentDocument.getElementById('penBtns').hidden, null, 40000);
  check('نافذة عقوبة اللاعب تظهر قبل الرمية', pen);
  const res2 = await waitFor(page, () => !!cannonLastResult && cannonLastResult.round >= 1 && cannonLastResult.results.length === 2, null, 600000);
  const r2 = await page.evaluate(() => cannonLastResult);
  check('رميتان لكل لاعب: النتيجة تعدّ أفضل مسافة، واللاعب المتأخر دخل الطابور (لاعبان بالنتيجة، ومن لم يرسل أمراً لا يُطلَق)', res2 && r2.results.length === 2 && r2.winner.dist === Math.max(...r2.results.map((x) => x.dist)), r2);
  await waitFor(page, () => cannonStatus === 'waiting', null, 25000);

  // ============ 8) الخروج للرئيسية: إيقاف كل شيء ============
  await page.evaluate(() => document.getElementById('cannon-w-home').click()); await sleep(500);
  const out = await page.evaluate(() => ({ st: cannonStatus, listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), frame: !!document.getElementById('cannon-w-frame'), live: document.body.classList.contains('hc-live'), active: document.querySelector('.page.active').id }));
  check('«رئيسية»: تُنهى اللعبة (المعالج والـiframe وكلاس الراوند) وتفتح الرئيسية', out.st === 'idle' && out.listeners.length === 0 && !out.frame && !out.live && out.active === 'pg-home', out);
  // مغادرة صفحة اللعبة بأي طريق (غير زر رئيسية) تنهيها كذلك
  await page.evaluate(() => goSetupCannon()); await page.evaluate(() => launchCannon()); await sleep(600);
  await page.evaluate(() => show('solo-home')); await sleep(300);
  check('الانتقال لأي صفحة أخرى أثناء الانتظار ينهي اللعبة ويحرر المعالج', await page.evaluate(() => cannonStatus === 'idle' && !Object.keys(homeGameListeners).includes('cannon') && !document.getElementById('cannon-w-frame')));
  check('لا أخطاء JS ولا أخطاء كونسول طوال الرحلة الكاملة', page._errors.length === 0 && page._consoleErrors.length === 0, { e: page._errors, c: page._consoleErrors });

  // ============ 8.5) كلمة انضمام بمسافة (جملة) + انقطاع الشات وعودته: الانضمام يستمر بعد العودة ============
  await page.evaluate(() => { goSetupCannon(); document.getElementById('cannon-s-kw').value = 'السلام عليكم'; launchCannon(); }); await sleep(900);
  await say('k1', 'السلام عليكم'); await say('k2', ' السلام  عليكم '); await say('k3', 'السلام عليكم ورحمة الله'); await sleep(900);
  const kwj = await page.evaluate(() => [...cannonParticipants.keys()].sort().join());
  check('كلمة انضمام جملة («السلام عليكم»): تطابق الكلمة (ولو مسافات زائدة) وتتجاهل الجملة الأطول', kwj === 'tiktok:k1,tiktok:k2', kwj);
  await ctl({ cmd: 'dropUpstream' }); await sleep(2500);
  await say('k4', 'السلام عليكم'); await sleep(1500);
  check('بعد انقطاع الشات من تيك توك وعودته يستمر الانضمام بنفس الكلمة', await page.evaluate(() => cannonParticipants.has('tiktok:k4') && homeConnOverall() === 'connected'), await page.evaluate(() => ({ o: homeConnOverall(), n: cannonParticipants.size })));
  await page.evaluate(() => cannonTeardown());

  // ============ 9) فشل تحميل Three.js: رسالة واضحة ورجوع للانتظار بدل التعليق ============
  const bad = await newGamePage(browser);
  await bad.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js|cdn\.jsdelivr\.net\/npm\/three@|unpkg\.com\/three@/, (r) => r.abort());
  await H.linkAccount(bad, STREAMER);
  await bad.evaluate(() => { goSetupCannon(); launchCannon(); }); await sleep(2500);
  await say('x0', 'انضم'); await say('x1', 'انضم'); await sleep(600);
  await bad.evaluate(() => cannonStartRound());
  const failed = await waitFor(bad, () => cannonStatus === 'waiting' && !document.body.classList.contains('hc-live') && !document.getElementById('cannon-w-gof').classList.contains('hcw-on'), null, 20000);
  check('تعذّر تحميل Three.js: ما تعلّق اللعبة، ترجع للانتظار مع رسالة', failed && /تعذّر/.test(await bad.evaluate(() => document.getElementById('cannon-w-note').textContent + document.getElementById('toast').textContent)), await bad.evaluate(() => ({ st: cannonStatus, note: document.getElementById('cannon-w-note').textContent, toast: document.getElementById('toast').textContent })));
  await bad.evaluate(() => cannonTeardown());

  await browser.close();
  const failedChecks = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failedChecks.length) + '/' + results.length + ' passed');
  process.exit(failedChecks.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
