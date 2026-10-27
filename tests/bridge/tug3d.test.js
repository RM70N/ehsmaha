'use strict';
// شد الحبل 3D (tug3d.html داخل iframe) — دمج كامل مع احسمها: حذف النسخة القديمة، الإعداد/التحقق، الانضمام والسحب بالشات
// (جسر تيك توك المحلي المزيّف: بروتوكول حقيقي ورسائل محاكاة)، المتابعة، الفوز ونقاط كل عضو مرة واحدة، التعادل، شاشة النتيجة،
// اللاعب المتأخر، أوامر المالك، الطرد، الريست، الخروج بلا بقايا، الجوال، والملف المستقل.
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/tug3d.test.js
const fs = require('fs');
const path = require('path');
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 500) : '')); };
const say = (viewer, text, nick) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: true } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(80); }
  return false;
}
const S = (page) => page.evaluate(() => { const a = tugApi(); return a ? a.getState() : null; });
const frameEval = (page, fn, arg) => { const f = page.frames().find((x) => /tug3d\.html/.test(x.url())); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
const SETUP = { 'tug-team-a-name': 'الصقور', 'tug-team-b-name': 'النمور', 'tug-team-a-kw': 'صقر', 'tug-team-b-kw': 'نمر', 'tug-pull-kw': 'شد' };
async function fillSetup(page, over = {}, opts = {}) {
  await page.evaluate(([v, o]) => {
    show('setup-tug');
    Object.entries(v).forEach(([id, val]) => { document.getElementById(id).value = val; });
    ['rubberband', 'goldenpull', 'streak', 'teambalance', 'latejoin'].forEach((k) => { document.getElementById('tug-opt-' + k).checked = !!o[k]; });
  }, [Object.assign({}, SETUP, over), opts]);
}
async function launch(page, over, opts) {
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
  await fillSetup(page, over, opts);
  await page.evaluate(() => launchTug());
  return waitFor(page, () => { const a = tugApi(); return !!a && a.getState().status === 'waiting'; }, null, 15000);
}
async function join(page, a, b, prefix = 'u') {
  for (let i = 0; i < a; i++) await say(prefix + 'a' + i, 'صقر', 'صقر' + i);
  for (let i = 0; i < b; i++) await say(prefix + 'b' + i, 'نمر', 'نمر' + i);
  return waitFor(page, ([a, b]) => { const s = tugApi().getState(); return s.teamA.length === a && s.teamB.length === b; }, [a, b], 10000);
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  const dialogs = []; page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });

  // ===== 1) حذف شد الحبل القديم بالكامل =====
  const old = await page.evaluate(() => ({
    ids: ['pg-tug-winner', 'tug-arena', 'tug-teams-wrap', 'tug-rope-track', 'tug-knot', 'tug-timer', 'tug-balance-bar', 'tug-btn-round', 'tugw-team-name'].filter((i) => document.getElementById(i)),
    fns: ['tugPhysicsStep', 'tugFinishRound', 'tugApplyPullForce', 'tugGameLoop', 'tugRegisterPull', 'tugShowWinner', 'connectTugTikTok', 'initTugDashboard', 'tugUpdateBalanceBar'].filter((f) => typeof window[f] === 'function'),
    pv: !!document.querySelector('#pg-setup-tug .gs-pv-stage'), gs: !!document.querySelector('#pg-tug .gs-main'),
    newFns: ['launchTug', 'goSetupTug', 'tugHandleEvent', 'startTugRound', 'resetTug', 'tugOpenKickModal', 'tugRemoveParticipant', 'tugTeamOf', 'tugGoHome'].filter((f) => typeof window[f] !== 'function')
  }));
  check('شد الحبل القديم محذوف: لا عناصر ولا دوال فيزياء/فوز/ساحة قديمة ولا معاينة gs', old.ids.length === 0 && old.fns.length === 0 && !old.pv && !old.gs, old);
  check('الواجهة البرمجية الجديدة موجودة (launch/goSetup/handleEvent/start/reset/kick/…)', old.newFns.length === 0, old.newFns);
  const files = await page.evaluate(async () => { const r = await fetch('/tug3d.html', { cache: 'no-store' }); const t = await r.text(); return { st: r.status, len: t.length, api: /window\.EhsemhaTug3D=api/.test(t), three: /THREE/.test(t.slice(0, 60000)) }; });
  check('ملف tug3d.html يُخدَّم وفيه Three.js مضمّناً (بلا CDN) وواجهة EhsemhaTug3D', files.st === 200 && files.len > 500000 && files.api && files.three, files);
  const wf = fs.readFileSync(path.join(H.ROOT, '.github/workflows/pages.yml'), 'utf8');
  check('workflow النشر ينشر tug3d.html (paths + cp)', /-\s*tug3d\.html/.test(wf) && /cp [^\n]*tug3d\.html/.test(wf), wf.match(/cp [^\n]*/));

  // ===== 2) البطاقة والإعداد والتحقق =====
  const card = await page.evaluate(() => { const c = document.querySelector('.gcard[data-tag="tug"]'); return { ok: !!c, extra: c && c.getAttribute('data-extra-cats'), tags: c ? [...c.querySelectorAll('.gcard-tag')].map((t) => t.textContent) : [], desc: c ? c.querySelector('.gcard-desc').textContent : '' }; });
  check('بطاقة شد الحبل: موسومة 3D بفئة إضافية وشارة ٣D ووصف محدَّث', card.ok && card.extra === '3d' && card.tags.includes('٣D') && /ثلاثي/.test(card.desc), card);
  await page.evaluate(() => show('setup-tug')); await sleep(200);
  const setupInfo = await page.evaluate(() => ({ title: document.querySelector('#pg-setup-tug .setup-title').textContent, ids: ['tug-team-a-name', 'tug-team-a-kw', 'tug-team-b-name', 'tug-team-b-kw', 'tug-pull-kw', 'tug-opt-rubberband', 'tug-opt-goldenpull', 'tug-opt-streak', 'tug-opt-teambalance', 'tug-opt-latejoin', 'btn-tug-launch', 'tug-status'].filter((i) => !document.getElementById(i)) }));
  check('صفحة الإعداد: عنوان 3D وكل الحقول والخيارات الخمسة وزر الإطلاق', /3D/.test(setupInfo.title) && setupInfo.ids.length === 0, setupInfo);
  const errs = [];
  for (const [label, over, re] of [
    ['اسم الفريق الأول فارغ', { 'tug-team-a-name': '' }, /اسم الفريق الأول/],
    ['كلمة الفريق الثاني فارغة', { 'tug-team-b-kw': '' }, /للفريق الثاني/],
    ['كلمة السحب فارغة', { 'tug-pull-kw': '' }, /كلمة السحب/],
    ['كلمتا الانضمام متطابقتان', { 'tug-team-b-kw': 'صقر' }, /تطابق/],
    ['متطابقتان بعد التوحيد (صقر / صقـر!)', { 'tug-team-b-kw': 'صقـر!' }, /تطابق/],
    ['كلمة السحب = كلمة فريق', { 'tug-pull-kw': 'نمر' }, /سحب/],
    ['رموز فقط', { 'tug-team-a-kw': '!!!' }, /رموز/]
  ]) {
    await fillSetup(page, over); await page.evaluate(() => launchTug());
    const r = await page.evaluate(() => ({ t: document.getElementById('tug-status').textContent, active: document.querySelector('.page.active').id, f: !!document.getElementById('tug-frame').getAttribute('src') && !/about:blank/.test(document.getElementById('tug-frame').getAttribute('src')) }));
    if (!(re.test(r.t) && r.active === 'pg-setup-tug' && !r.f)) errs.push([label, r]);
  }
  check('التحقق: 7 أخطاء إعداد تُعرض بنص ثابت في الصفحة ولا تفتح اللعبة ولا الإطار', errs.length === 0, errs);
  await fillSetup(page); await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); });
  const unl = await page.evaluate(() => { launchTug(); return { t: document.getElementById('tug-status').textContent, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» وبقاء الإعداد', /اربط بثك/.test(unl.t) && unl.a === 'pg-setup-tug', unl);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);

  // ===== 3) الإطلاق =====
  const L = await launch(page, {}, { latejoin: false });
  check('الإطلاق: صفحة اللعبة + إطار tug3d + غرفة الانتظار مفتوحة بالأسماء والكلمات', L && await page.evaluate(() => document.querySelector('.page.active').id === 'pg-tug'), await page.evaluate(() => document.querySelector('.page.active').id));
  const emb = await frameEval(page, () => ({ embed: document.getElementById('eht').classList.contains('eht-embed'), setupHidden: document.getElementById('eht-setup').hidden || getComputedStyle(document.getElementById('eht-setup')).display === 'none', sim: getComputedStyle(document.getElementById('eht-sim')).display, modeChip: getComputedStyle(document.getElementById('eht-chip-mode')).display, late: !document.getElementById('eht-late').hidden, home: document.getElementById('eht-home').hidden, na: document.getElementById('eht-sa-n').textContent, nb: document.getElementById('eht-sb-n').textContent, ka: document.getElementById('eht-sa-k').textContent, kb: document.getElementById('eht-sb-k').textContent, pk: document.getElementById('eht-pk-w').textContent, view: window.EhsemhaTug3D.getState().view }));
  check('وضع التضمين: الإعداد والمحاكي مخفيان، زر «لاعب متأخر» ظاهر (والخروج من شريط الموقع)، والأسماء/الكلمات من إعداد الموقع', emb && emb.embed && emb.setupHidden && emb.sim === 'none' && emb.modeChip === 'none' && emb.late && emb.home && emb.na === 'الصقور' && emb.nb === 'النمور' && emb.ka === 'صقر' && emb.kb === 'نمر' && /شد/.test(emb.pk), emb);
  const kind = await page.evaluate(() => tugApi().getState().view);
  check('العرض ثلاثي الأبعاد (WebGL) يعمل', kind === '3d', kind);
  check('وضع الربط مفعّل تلقائياً بالموقع', await page.evaluate(() => tugApi().getState().mode === 'link'));

  // ===== 4) الانضمام بالشات =====
  await say('j1', 'صقر', 'سالم'); await say('j2', 'نمر', 'ليلى'); await say('j3', 'صقر!', 'ماجد'); await say('j4', 'نمـر', 'نورة');
  await say('j5', 'مرحبا', 'غريب'); await say('j6', 'شد', 'قبل الانضمام');
  await waitFor(page, () => tugApi().getState().teamA.length === 2 && tugApi().getState().teamB.length === 2, null, 8000);
  let s = await S(page);
  check('الانضمام: كلمة الفريق ولو بتشكيل/رمز تُدخل الفريق الصحيح، وكلام آخر وكلمة السحب قبل الانضمام تُتجاهل', s.teamA.length === 2 && s.teamB.length === 2 && !s.teamA.concat(s.teamB).some((u) => /j5|j6/.test(u)), s);
  await say('j1', 'نمر', 'سالم');
  await sleep(500);
  s = await S(page);
  check('ممنوع تبديل الفريق: كتابة كلمة الفريق الآخر لا تنقل العضو', s.teamA.includes('tiktok:j1') && !s.teamB.includes('tiktok:j1') && s.teamA.length === 2);
  const mirror = await page.evaluate(() => ({ gs: tugGameStatus, a: [...tugTeamA.keys()], b: [...tugTeamB.keys()], tt: tugTeamOf('tiktok:j2') }));
  check('مرآة حالة الموقع: tugTeamA/B وtugGameStatus وtugTeamOf تتبع اللعبة', mirror.gs === 'waiting' && mirror.a.length === 2 && mirror.b.length === 2 && mirror.tt === 'b', mirror);
  const regs = await page.evaluate(() => { const r = TST_GAME_REGISTRY && TST_GAME_REGISTRY.tug; return r && r.handleFn === 'tugHandleEvent' && typeof window[r.handleFn] === 'function'; });
  check('سجل ألعاب الموقع يشير لمعالج الشد الجديد', regs);
  // البدء بلا فريق مكتمل
  await page.evaluate(() => { tugApi().reset(); }); await sleep(300);
  await say('k1', 'صقر', 'وحيد'); await waitFor(page, () => tugApi().getState().teamA.length === 1, null, 5000);
  check('لا يبدأ الراوند وفريق فارغ', (await page.evaluate(() => startTugRound())) === false && (await S(page)).status === 'waiting');

  // ===== 5) المتابعة: بوابة الموقع =====
  await page.evaluate(() => { tugApi().reset(); window.__fg = { block: new Set(['tiktok:fw1']), calls: [] }; window.__origFG = window.followGateAllows; window.followGateAllows = function (tag, u) { window.__fg.calls.push([tag, u.uniqueId]); return !(tag === 'tug' && window.__fg.block.has(u.uniqueId) && !u.isFollower); }; });
  await sleep(300);
  await H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer: 'fw1', nickname: 'متابع', text: 'صقر', identity: { isFollowerOfAnchor: false } }); await sleep(700);
  let st1 = await S(page);
  check('بوابة المتابعة: غير المتابع يُحجز معلّقاً ولا يدخل (والبوابة استُدعيت بوسم tug)', !st1.teamA.includes('tiktok:fw1') && st1.pending.includes('tiktok:fw1') && (await page.evaluate(() => window.__fg.calls.some((c) => c[0] === 'tug'))), st1);
  await page.evaluate(() => { window.__fg.block.clear(); });
  await H.ctl(H.PRIMARY, { cmd: 'follow', user: STREAMER, viewer: 'fw1' }); await sleep(700);
  st1 = await S(page);
  check('بعد المتابعة: ينضم المعلّق لفريقه تلقائياً', st1.teamA.includes('tiktok:fw1') && !st1.pending.includes('tiktok:fw1'), st1);
  await page.evaluate(() => { window.followGateAllows = window.__origFG; });

  // ===== 6) راوند كامل: سحب، حدود، فوز بالعقدة، نقاط كل عضو مرة واحدة =====
  await page.evaluate(() => { tugApi().reset(); }); await sleep(300);
  check('انضمام 12 عضواً للأول و3 للثاني', await join(page, 12, 3, 'r'));
  await say('r_out', 'شد', 'دخيل'); await sleep(300);
  check('البدء: يقبل الراوند بفريقين غير فارغين وتتحوّل الحالة لـ active', (await page.evaluate(() => startTugRound())) === true && (await waitFor(page, () => tugApi().getState().status === 'active', null, 3000)));
  const hudA = await frameEval(page, () => document.getElementById('eht-pk').hidden === false && document.getElementById('eht-start').hidden);
  check('أثناء الراوند: شعار «اكتب في الشات «شد»» ظاهر وزر البدء مخفي', hudA);
  const p0 = (await S(page)).pulls;
  await say('r_out', 'شد', 'دخيل'); await sleep(250);
  check('غير العضو يكتب كلمة السحب: يُتجاهل (لا سحبات)', (await S(page)).pulls === p0);
  await say('ra0', 'شد', 'صقر0'); await sleep(120); await say('ra0', 'شد', 'صقر0'); await sleep(500);
  const p1 = (await S(page)).pulls;
  check('سحب العضو يُحسب وتكراره خلال 400ms يُرفض (سبام)', p1 - p0 === 1 && (await S(page)).rejected >= 1, { p0, p1, rej: (await S(page)).rejected });
  const w0 = await page.evaluate(() => window.__wins.length);
  for (let round = 0; round < 6; round++) {
    for (let i = 0; i < 12; i++) await say('ra' + i, 'شد', 'صقر' + i);
    await sleep(180);
    if ((await S(page)).status === 'finished') break;
  }
  await waitFor(page, () => tugApi().getState().status === 'finished', null, 20000);
  s = await S(page);
  check('الفوز بوصول العقدة: فاز الفريق الأول وحالة finished ومعلومات النتيجة', s.status === 'finished' && s.result && s.result.winner === 'a' && s.result.winnerName === 'الصقور' && s.result.members.length === 12 && s.knot <= -99.9, s.result);
  await sleep(400);
  const wins = await page.evaluate((w0) => window.__wins.slice(w0), w0);
  const winIds = wins.map((w) => w.id).sort();
  check('النقاط: recordWin مرة واحدة لكل عضو بالفريق الفائز (12) بلعبة «شد الحبل» ولا شيء للخاسرين/المنضمين المتأخرين', wins.length === 12 && new Set(winIds).size === 12 && wins.every((w) => w.g === 'شد الحبل') && !winIds.some((id) => /rb|r_out/.test(id)), { n: wins.length, sample: winIds.slice(0, 3) });
  check('مرآة الموقع بعد الفوز: tugGameStatus=finished', (await page.evaluate(() => tugGameStatus)) === 'finished');
  const resShown = await waitFor(page, () => { const fr = document.getElementById('tug-frame').contentDocument; return fr && !fr.getElementById('eht-result').hidden; }, null, 6000);
  const res = await frameEval(page, () => ({ shown: !document.getElementById('eht-result').hidden, name: (document.getElementById('eht-rn') || {}).textContent, tag: (document.querySelector('.eht-rt') || {}).textContent, btns: [...document.querySelectorAll('.eht-ra button')].map((b) => b.textContent) }));
  check('شاشة النتيجة (من الملف المرسل): اسم الفريق الفائز و«حسمها!» وأزرار العب مجددا/نفس الفرق/الإعداد', resShown && res.name === 'الصقور' && res.tag === 'حسمها!' && res.btns.length === 3, res);
  await page.screenshot({ path: process.env.TUG_SHOT || '/tmp/tug-result.png' });
  // نفس الفرق
  await frameEval(page, () => document.querySelector('.eht-ra button[data-act=same]').click()); await sleep(600);
  s = await S(page);
  check('«نفس الفرق»: عودة للانتظار بنفس الأعضاء وبلا نتيجة', s.status === 'waiting' && s.teamA.length === 12 && s.teamB.length === 3 && !s.result, s);
  check('يعمل راوند ثانٍ بنفس الفرق (بدء + سحب + مرآة active)', (await page.evaluate(() => startTugRound())) && (await waitFor(page, () => tugGameStatus === 'active', null, 8000)));

  // ===== 7) انتهاء الوقت: المتقدم يفوز / تعادل =====
  await say('rb0', 'شد', 'نمر0'); await sleep(300);
  await page.evaluate(() => { const a = tugApi(); window.__fake = Date.now(); a._t.setClock(() => Date.now() + 61000); });
  await waitFor(page, () => tugApi().getState().status === 'finished', null, 6000);
  s = await S(page);
  check('انتهاء الـ60 ثانية: يفوز الفريق المتقدم (الثاني سحب أولاً فتقدّم)', s.status === 'finished' && s.result.winner === 'b' && !s.result.tie, s.result);
  await page.evaluate(() => { tugApi()._t.setClock(null); tugApi().reset(); }); await sleep(400);
  await join(page, 0, 0, 'z');
  await say('t1', 'صقر', 'تعادل1'); await say('t2', 'نمر', 'تعادل2');
  await waitFor(page, () => tugApi().getState().teamA.length === 1 && tugApi().getState().teamB.length === 1, null, 5000);
  const wBefore = await page.evaluate(() => window.__wins.length);
  await page.evaluate(() => { startTugRound(); tugApi()._t.setClock(() => Date.now() + 61000); });
  await waitFor(page, () => tugApi().getState().status === 'finished', null, 6000);
  s = await S(page);
  await waitFor(page, () => { const fr = document.getElementById('tug-frame').contentDocument; return fr && !fr.getElementById('eht-result').hidden; }, null, 6000);
  const tieUI = await frameEval(page, () => ({ rn: (document.getElementById('eht-rn') || {}).textContent }));
  check('تعادل (لا سحب): نتيجة «تعادل» بلا فائز ولا recordWin', s.result && s.result.tie === true && s.result.winner === null && (await page.evaluate(() => window.__wins.length)) === wBefore && tieUI.rn === 'تعادل', { r: s.result, tieUI });
  await page.evaluate(() => { tugApi()._t.setClock(null); });

  // ===== 8) الخيارات: الانضمام أثناء الجولة (لاعب متأخر) =====
  check('إطلاق مع «الانضمام أثناء الجولة»', await launch(page, {}, { latejoin: true }));
  check('خيار الإعداد ينعكس: getLateMode=true وزر «لاعب متأخر: مفتوح»', (await page.evaluate(() => tugApi().getLateMode())) && /مفتوح/.test(await frameEval(page, () => document.getElementById('eht-late').textContent)));
  await join(page, 2, 2, 'l'); await page.evaluate(() => startTugRound());
  await waitFor(page, () => tugApi().getState().status === 'active', null, 4000);
  await say('late1', 'نمر', 'متأخر'); await sleep(500);
  s = await S(page);
  check('لاعب متأخر بكلمة الفريق أثناء الجولة: يدخل فريقه (بوابة النظام المركزي)', s.teamB.includes('tiktok:late1'), s);
  const pl = s.pulls;
  await say('late1', 'شد', 'متأخر'); await sleep(400);
  check('المتأخر ينضم بلا سحبة مجانية، وسحبته التالية تُحسب', (await S(page)).pulls === pl + 1);
  await page.evaluate(() => { window.__lateJoin.sync('tug'); window.__lateJoin.setMode('tug', false); }); await sleep(300);
  check('إيقاف الاستقبال من النظام المركزي يغلق انضمام الجدد فعلياً (بوابة اللعبة)', (await page.evaluate(() => tugApi().getLateMode())) === false);
  await say('late2', 'صقر', 'متأخر2'); await sleep(400);
  check('بعد الإيقاف: متأخر جديد لا يدخل', !(await S(page)).teamA.includes('tiktok:late2'));
  await frameEval(page, () => document.getElementById('eht-late').click()); await sleep(400);
  check('زر «لاعب متأخر» داخل الإطار يفتح نافذة النظام المركزي', await page.evaluate(() => { const m = document.getElementById('lj-modal'); return !!(m && !m.hidden); }));
  await page.evaluate(() => __lateJoin.close());

  // ===== 9) أوامر المالك والإدارة والطرد =====
  await launch(page, {});
  await join(page, 3, 3, 'o');
  await page.evaluate(() => tugLiveCommandHandlers.join({ uniqueId: 'tiktok:adm1', nickname: 'مضاف', avatar: '' }));
  await sleep(300);
  s = await S(page);
  check('أمر المالك «انضمام»: يدخل الفريق الأقل عدداً (أ عند التعادل)', s.teamA.includes('tiktok:adm1') && s.teamA.length === 4, s);
  await page.evaluate(() => tugLiveCommandHandlers.join({ uniqueId: 'tiktok:adm2', nickname: 'مضاف2' })); await sleep(300);
  check('الأمر التالي يدخل الفريق الأقل (ب)', (await S(page)).teamB.includes('tiktok:adm2'));
  await page.evaluate(() => tugLiveCommandHandlers.leave({ uniqueId: 'tiktok:adm1' })); await sleep(300);
  check('أمر المالك «مغادرة»: يُزال العضو ويتحدّث العدّاد', !(await S(page)).teamA.includes('tiktok:adm1') && (await frameEval(page, () => document.getElementById('eht-sa-c').textContent)) === '3');
  await page.evaluate(() => tugOpenKickModal()); await sleep(300);
  const km = await page.evaluate(() => [...document.querySelectorAll('[id*="kick"],[class*="kick-modal"]')].some((e) => e.offsetParent !== null && /طرد|اطرد/.test(e.textContent)));
  await page.keyboard.press('Escape'); await page.evaluate(() => { document.querySelectorAll('[id*="kick-modal"],[class*="kick-modal"]').forEach((e) => { e.style.display = 'none'; e.classList.remove('show', 'open'); }); });
  await page.evaluate(() => tugRemoveParticipant('tiktok:ob0')); await sleep(300);
  s = await S(page);
  check('الطرد: tugRemoveParticipant يزيل العضو من اللعبة', !s.teamB.includes('tiktok:ob0'), s);
  check('مودال «اطرد لاعب» المشترك يعرض لاعبي الفريقين', km, km);
  await page.evaluate(() => startTugRound()); await waitFor(page, () => tugApi().getState().status === 'active', null, 4000);
  const pk = (await S(page)).pulls; await say('ob0', 'شد', 'مطرود'); await sleep(300);
  check('المطرود لا يسحب بعد إزالته', (await S(page)).pulls === pk);
  const w1 = await page.evaluate(() => window.__wins.length);
  await page.evaluate(() => tugLiveCommandHandlers.forceWinOther({ uniqueId: 'tiktok:oa0' }));
  await waitFor(page, () => tugApi().getState().status === 'finished', null, 4000); await sleep(400);
  const wf2 = await page.evaluate((w) => window.__wins.slice(w).map((x) => x.id), w1);
  check('فوز إجباري من المالك لفريق عضو: يفوز فريقه وتُسجَّل نقاط أعضائه مرة واحدة', (await S(page)).result.winner === 'a' && wf2.length === 3 && new Set(wf2).size === 3, wf2);
  await waitFor(page, () => { const fr = document.getElementById('tug-frame').contentDocument; return fr && !fr.getElementById('eht-result').hidden; }, null, 6000);
  await frameEval(page, () => document.querySelector('.eht-ra button[data-act=again]').click()); await sleep(500);
  s = await S(page);
  check('«العب مجددا»: غرفة انتظار فارغة', s.status === 'waiting' && s.teamA.length === 0 && s.teamB.length === 0, s);
  await join(page, 1, 1, 'q'); await page.evaluate(() => tugApi().reset()); await sleep(300);
  check('«إعادة ضبط»: تفرغ الغرفة', (await S(page)).teamA.length === 0);
  // من غير عضو: forceWinSelf يدخله ثم يفوز
  await join(page, 1, 2, 'f'); await page.evaluate(() => startTugRound()); await waitFor(page, () => tugApi().getState().status === 'active', null, 4000);
  const w3 = await page.evaluate(() => window.__wins.length);
  await page.evaluate(() => tugLiveCommandHandlers.forceWinSelf({ uniqueId: 'tiktok:selfw', nickname: 'ذاتي' }));
  await waitFor(page, () => tugApi().getState().status === 'finished', null, 4000); await sleep(400);
  const w4 = await page.evaluate((w) => window.__wins.slice(w).map((x) => x.id), w3);
  check('forceWinSelf لغير عضو: يدخل فريقاً ثم يفوز فريقه (ذاتي ضمن الفائزين)', w4.includes('tiktok:selfw'), w4);

  // ===== 10) الخروج والتنظيف وعدم تكرار المعالجات =====
  const listenersBefore = await page.evaluate(() => Object.keys(homeGameListeners));
  check('أثناء اللعبة: مستمع الشات «tug» مسجَّل', listenersBefore.includes('tug'), listenersBefore);
  await page.evaluate(() => document.querySelector('#pg-tug .b3s-bar button').click()); await sleep(600);
  const out = await page.evaluate(() => ({ pg: document.querySelector('.page.active').id, src: document.getElementById('tug-frame').getAttribute('src'), api: !!tugApi(), ls: Object.keys(homeGameListeners), gs: tugGameStatus, a: tugTeamA.size }));
  check('زر «خروج» (شريط الموقع): يرجع للرئيسية ويفرغ الإطار ويزيل المستمع ويصفّر المرآة', out.pg === 'pg-home' && /about:blank/.test(out.src) && !out.api && !out.ls.includes('tug') && out.gs === 'waiting' && out.a === 0, out);
  // الخروج بأي تنقّل غير الأزرار
  await launch(page, {}); await page.evaluate(() => show('home')); await sleep(500);
  const out2 = await page.evaluate(() => ({ src: document.getElementById('tug-frame').getAttribute('src'), api: !!tugApi() }));
  check('مغادرة الصفحة بأي تنقّل (show) تنظّف الإطار تلقائياً', /about:blank/.test(out2.src) && !out2.api, out2);
  // «العودة للإعداد» ترجع لصفحة إعداد الموقع
  await launch(page, {}); await frameEval(page, () => document.getElementById('eht-back').click()); await sleep(600);
  const out3 = await page.evaluate(() => ({ pg: document.querySelector('.page.active').id, src: document.getElementById('tug-frame').getAttribute('src'), v: document.getElementById('tug-team-a-name').value }));
  check('«العودة للإعداد» داخل الإطار ترجع لصفحة الإعداد بالموقع وتحفظ الحقول', out3.pg === 'pg-setup-tug' && /about:blank/.test(out3.src) && out3.v === 'الصقور', out3);
  // 3 دورات إطلاق/خروج: رسالة واحدة = انضمام واحد، ونقاط مرة واحدة
  for (let i = 0; i < 3; i++) { await launch(page, {}); await page.evaluate(() => tugGoHome()); await sleep(150); }
  await launch(page, {});
  await say('dup1', 'صقر', 'مكرر'); await say('dup2', 'نمر', 'مكرر2'); await sleep(700);
  s = await S(page);
  check('بعد 3 دورات إطلاق/خروج: رسالة انضمام واحدة تُدخل اللاعب مرة واحدة (لا معالجات مكرّرة)', s.teamA.length === 1 && s.teamB.length === 1, s);
  const w5 = await page.evaluate(() => window.__wins.length);
  await page.evaluate(() => startTugRound()); await waitFor(page, () => tugApi().getState().status === 'active', null, 4000);
  for (let i = 0; i < 10; i++) { await say('dup1', 'شد', 'مكرر'); await sleep(450); if ((await S(page)).status === 'finished') break; }
  await page.evaluate(() => tugLiveCommandHandlers.forceWinOther({ uniqueId: 'tiktok:dup1' })); await sleep(500);
  check('نقطة واحدة فقط للفائز الوحيد (لا تضاعف من معالجات مكرّرة)', (await page.evaluate((w) => window.__wins.slice(w).length, w5)) === 1);

  // ===== 11) الجوال والدوران =====
  await launch(page, {}); await join(page, 3, 3, 'm');
  for (const [w, h, label] of [[390, 844, 'جوال عمودي'], [844, 390, 'جوال أفقي'], [360, 640, 'جوال صغير'], [1366, 800, 'سطح مكتب']]) {
    await page.setViewportSize({ width: w, height: h }); await sleep(600);
    const m = await page.evaluate(() => { const f = document.getElementById('tug-frame').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, iw: innerWidth, fw: Math.round(f.width), fh: Math.round(f.height), ih: innerHeight, pg: document.querySelector('.page.active').id }; });
    const inner = await frameEval(page, () => { const bs = [...document.querySelectorAll('#eht-tools button:not([hidden])')].map((b) => b.getBoundingClientRect()); const c = document.querySelector('canvas'); return { btnIn: bs.every((b) => b.left >= -1 && b.right <= innerWidth + 1 && b.top >= 0 && b.bottom <= innerHeight + 1), n: bs.length, cv: !!c && c.clientWidth > 100, sw: document.documentElement.scrollWidth, iw: innerWidth }; });
    check(label + ' ' + w + '×' + h + ': الإطار يملأ الشاشة بلا تمرير أفقي وأزرار التحكم داخل الشاشة والـcanvas ظاهر', m.pg === 'pg-tug' && m.fw === m.iw && m.fh === m.ih && m.sw <= m.iw && inner.btnIn && inner.cv && inner.sw <= inner.iw, { m, inner });
    if (w === 390) await page.screenshot({ path: process.env.TUG_SHOT_M || '/tmp/tug-mobile.png' });
  }
  await page.setViewportSize({ width: 390, height: 844 }); await sleep(500);
  const ov = await frameEval(page, () => { const t = document.getElementById('eht-tools').getBoundingClientRect(), a = document.getElementById('eht-sa').getBoundingClientRect(), b = document.getElementById('eht-sb').getBoundingClientRect(); return { toolsTop: t.top, sideBottom: Math.max(a.bottom, b.bottom) }; });
  check('جوال عمودي: شريط الأدوات لا يغطي لوحتي الفريقين', ov && ov.toolsTop >= ov.sideBottom - 1, ov);
  await page.setViewportSize({ width: 1366, height: 800 }); await sleep(400);
  check('بعد كل التدوير ما زالت الفرق والحالة سليمة', (await S(page)).teamA.length === 3 && (await S(page)).teamB.length === 3);

  // ===== 12) الملف المستقل (بلا embed) =====
  const solo = await browser.newPage();
  const soloErrs = []; solo.on('pageerror', (e) => soloErrs.push(e.message));
  await solo.goto('http://localhost:8765/tug3d.html?auto=1', { waitUntil: 'domcontentloaded' }); await sleep(2500);
  const sd = await solo.evaluate(() => ({ api: !!window.EhsemhaTug3D, st: window.EhsemhaTug3D && window.EhsemhaTug3D.getState().status, mode: window.EhsemhaTug3D && window.EhsemhaTug3D.getState().mode, embed: document.getElementById('eht').classList.contains('eht-embed') }));
  check('الملف المستقل يعمل كما أُرسل (تجربة سريعة بلاعبين وهميين، بلا وضع التضمين) وبلا أخطاء', sd.api && sd.st !== 'setup' && sd.mode === 'demo' && !sd.embed && soloErrs.length === 0, { sd, soloErrs });
  await solo.close();

  check('لا أخطاء JS ولا نوافذ متصفح طوال الاختبار', page._errors.length === 0 && dialogs.length === 0, { e: page._errors.slice(0, 3), d: dialogs });
  const pass = results.filter((r) => r.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  results.filter((r) => !r.ok).forEach((r) => console.log('  ✗ ' + r.name));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
