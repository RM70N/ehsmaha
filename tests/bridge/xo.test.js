'use strict';
// إكس أو (xo.html داخل iframe) — دمج مع احسمها عبر جسر تيك توك المحلي المزيّف (بروتوكول حقيقي، رسائل محاكاة):
// الكرت والإعداد والتحقق، الانضمام بالشات والمتابعة، المتأخر، اللعب برسائل الشات، الفوز الرسمي مرة واحدة، الإزالة، الريست، الخروج.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/xo.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 600) : '')); };
const say = (viewer, text, nick, follower = true) => H.ctl(H.PRIMARY, { cmd: 'chat', user: STREAMER, viewer, nickname: nick || viewer, text, identity: { isFollowerOfAnchor: follower } });
async function waitFor(page, fn, arg, timeout = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(60); }
  return false;
}
const S = (page) => page.evaluate(() => { const a = xoApi(); return a ? a.getState() : null; });
const frameEval = (page, fn, arg) => { const f = page.frames().find((x) => /xo\.html/.test(x.url())); return f ? f.evaluate(fn, arg) : Promise.resolve(null); };
const FAST = () => { const K = xoApi()._t.K; K.INTRO_MS = 250; K.FINAL_INTRO_MS = 300; K.REMATCH_MS = 200; K.RESULT_MS = 400; K.TIE_MS = 300; K.LOT_MS = 700; K.REMOVE_MS = 250; K.STAGE_MS = 300; };
async function launch(page, kw = 'العب', turn = 20, lot = true) {
  await page.evaluate(() => { try { goHome(); } catch (e) {} }); await sleep(200);
  await page.evaluate(([kw, turn, lot]) => { goSetupXo(); document.getElementById('xo-join-kw').value = kw; document.getElementById('xo-turn-sec').value = turn; document.getElementById('xo-opt-lot').checked = lot; launchXo(); }, [kw, turn, lot]);
  const ok = await waitFor(page, () => { const a = window.xoApi && xoApi(); return !!a && a.getState().phase === 'waiting'; }, null, 15000);
  if (ok) await page.evaluate(FAST);
  return ok;
}
const viewerOf = (uid) => uid.replace(/^tiktok:/, '');
async function playCells(page, cells) {
  for (let i = 0; i < cells.length; i++) {
    const okTurn = await waitFor(page, (n) => { const s = xoApi().getState(); return s.phase === 'active' && s.cur && s.cur.state === 'active' && s.cur.board.filter(Boolean).length === n; }, i, 8000);
    if (!okTurn) return false;
    const s = await S(page); await say(viewerOf(s.cur.turn), String(cells[i]), 'p');
    await waitFor(page, ([n, t]) => { const s = xoApi().getState(); return s.phase !== 'active' || (s.cur && (s.cur.board.filter(Boolean).length > n || s.cur.turn !== t)); }, [i, s.cur.turn], 4000);
  }
  return true;
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=0' });
  await page.setViewportSize({ width: 1366, height: 800 });
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.remove(); });
  await page.evaluate(() => { window.__wins = []; const o = window.recordWin; window.recordWin = function (u, g) { window.__wins.push({ id: u && u.uniqueId, g }); return o.apply(this, arguments); }; });

  // ===== 1) وجود اللعبة دون مساس بغيرها =====
  const reg = await page.evaluate(() => ({
    card: !!document.querySelector('.gcard[data-tag="xo"]'), cards: document.querySelectorAll('.games-grid.hlob-registry .gcard[data-tag]').length,
    tug: !!document.querySelector('.gcard[data-tag="tug"]'), bomb: !!document.querySelector('.gcard[data-tag="bomb"]'), r3: !!document.querySelector('.gcard[data-tag="roulette3d"]'),
    fns: ['goSetupXo', 'launchXo', 'xoGoHome', 'xoHandleEvent', 'startXo', 'resetXo', 'xoRemoveParticipant', 'xoOpenKickModal', 'xoApi'].filter((f) => typeof window[f] !== 'function'),
    registry: TST_GAME_REGISTRY.xo && TST_GAME_REGISTRY.xo.handleFn, tugFn: typeof window.launchTug, bombFn: typeof window.launchBomb, wrapped: !!window.show.__xoWrapped,
    lib: [...document.querySelectorAll('#hlob-grid [data-tag]')].some((n) => n.getAttribute('data-tag') === 'xo')
  }));
  check('كرت إكس أو موجود ودوال الربط كلها معرّفة وسجل الألعاب يشير لمعالجه', reg.card && reg.fns.length === 0 && reg.registry === 'xoHandleEvent', reg);
  check('بقية الألعاب لم تتأثر (شد الحبل/القنبلة/الروليت: كروت ودوال)', reg.tug && reg.bomb && reg.r3 && reg.tugFn === 'function' && reg.bombFn === 'function', reg);
  check('الكرت يظهر في مكتبة الألعاب (الشبكة الرئيسية)', reg.lib, reg.lib);
  const served = await page.evaluate(async () => { const r = await fetch('/xo.html', { cache: 'no-store' }); const t = await r.text(); return { st: r.status, api: /window\.EhsemhaXO=api/.test(t), ext: /<script[^>]+src=/.test(t) }; });
  check('xo.html يُخدَّم من جذر الموقع وفيه الواجهة البرمجية وبلا سكربتات خارجية', served.st === 200 && served.api && !served.ext, served);

  // ===== 2) الإعداد والتحقق =====
  const bad = [];
  for (const [label, kw, turn, re] of [['كلمة فارغة', '', 20, /الكلمة المفتاحية/], ['رموز فقط', '!!!', 20, /رموز/], ['رقم 5', '5', 20, /رقماً/], ['رقم هندي ٣', '٣', 20, /رقماً/]]) {
    await page.evaluate(([kw, turn]) => { goSetupXo(); document.getElementById('xo-join-kw').value = kw; document.getElementById('xo-turn-sec').value = turn; launchXo(); }, [kw, turn]);
    const r = await page.evaluate(() => ({ t: document.getElementById('xo-status').textContent, a: document.querySelector('.page.active').id, src: document.getElementById('xo-frame').getAttribute('src') }));
    if (!(re.test(r.t) && r.a === 'pg-setup-xo' && (!r.src || /about:blank/.test(r.src)))) bad.push([label, r]);
  }
  check('التحقق: كلمة فارغة/رموز/رقم 1–9 تُرفض برسالة ولا تفتح اللعبة', bad.length === 0, bad);
  await page.evaluate(() => { document.getElementById('xo-turn-sec').value = 5; document.getElementById('xo-join-kw').value = 'العب'; });
  const clampA = await page.evaluate(() => { localStorage.removeItem(STREAMER_USER_STORAGE_KEY); launchXo(); return { t: document.getElementById('xo-status').textContent, v: document.getElementById('xo-turn-sec').value, a: document.querySelector('.page.active').id }; });
  check('بث غير مربوط: رسالة «اربط بثك» وبقاء الإعداد، ومدة الدور تُقيَّد (5 → 10)', /اربط بثك/.test(clampA.t) && clampA.a === 'pg-setup-xo' && clampA.v === '10', clampA);
  await page.evaluate((u) => localStorage.setItem(STREAMER_USER_STORAGE_KEY, u), STREAMER);

  // ===== 3) الإطلاق =====
  check('الإطلاق: صفحة pg-xo + إطار xo.html + غرفة الانتظار', await launch(page) && await page.evaluate(() => document.querySelector('.page.active').id === 'pg-xo'));
  const emb = await frameEval(page, () => ({ embed: document.getElementById('xo').classList.contains('xo-embed'), setupHidden: getComputedStyle(document.getElementById('xo-setup')).display === 'none' || document.getElementById('xo-setup').hidden, sim: getComputedStyle(document.getElementById('xo-p-sim')).display, simChip: getComputedStyle(document.getElementById('xo-chip-sim')).display, kw: document.getElementById('xo-wkw').textContent }));
  check('وضع التضمين: الإعداد والمحاكي مخفيان والكلمة المفتاحية معروضة', emb && emb.embed && emb.setupHidden && emb.sim === 'none' && emb.kw === 'العب', emb);
  const st0 = await S(page);
  check('الحالة: وضع الربط، مدة الدور 20، القرعة مفعّلة', st0.mode === 'link' && st0.turnSec === 20 && st0.lotAfter3 === true && st0.phase === 'waiting', st0);

  // ===== 4) الانضمام بالشات =====
  await say('j1', 'العب', 'سالم'); await say('j2', 'العب!', 'ليلى'); await say('j3', 'العـب', 'ماجد'); await say('j4', 'مرحبا', 'غريب'); await say('j5', '5', 'رقم');
  await say('j1', 'العب', 'سالم'); await say('j6', '  العب  ', 'نورة');
  await waitFor(page, () => xoApi().getState().players.length === 4, null, 6000);
  let s = await S(page);
  check('الانضمام: الكلمة بتشكيل/رمز/مسافات تُدخل، وكلام آخر ورقم يُتجاهلان، والتكرار لا يضيف', s.players.length === 4 && ['j1', 'j2', 'j3', 'j6'].every((j) => s.players.includes('tiktok:' + j)) && !s.players.includes('tiktok:j4') && !s.players.includes('tiktok:j5'), s.players);
  const mirror = await page.evaluate(() => ({ st: xoGameStatus, n: xoParticipants.size, kw: xoKeyword }));
  check('مرآة حالة الموقع: xoGameStatus/xoParticipants/xoKeyword', mirror.st === 'waiting' && mirror.n === 4 && mirror.kw === 'العب', mirror);
  // الصورة والاسم من هوية الحساب لا من الاسم الظاهر
  await say('j1', 'العب', 'اسم جديد'); await sleep(300);
  check('الهوية uniqueId لا الاسم: تغيير الاسم لا ينشئ لاعباً ثانياً', (await S(page)).players.length === 4);
  check('لا تبدأ بلاعب واحد (أقل من 2)', await page.evaluate(() => { xoApi().reset(); return true; }) && (await say('solo', 'العب', 'وحيد'), await waitFor(page, () => xoApi().getState().players.length === 1, null, 4000)) && (await page.evaluate(() => startXo())) === false && (await S(page)).phase === 'waiting');

  // ===== 5) المتابعة =====
  await page.evaluate(() => { xoApi().reset(); window.__fg = { block: new Set(['tiktok:fw1']), calls: [] }; window.__origFG = window.followGateAllows; window.followGateAllows = function (tag, u) { window.__fg.calls.push([tag, u.uniqueId]); return !(tag === 'xo' && window.__fg.block.has(u.uniqueId) && !u.isFollower); }; });
  await sleep(300);
  await say('fw1', 'العب', 'متابع', false); await sleep(700);
  let sf = await S(page);
  check('بوابة المتابعة: غير المتابع يُحجز معلّقاً (والبوابة استُدعيت بوسم xo)', !sf.players.includes('tiktok:fw1') && sf.pending.includes('tiktok:fw1') && (await page.evaluate(() => window.__fg.calls.some((c) => c[0] === 'xo'))), sf);
  await page.evaluate(() => { window.__fg.block.clear(); });
  await H.ctl(H.PRIMARY, { cmd: 'follow', user: STREAMER, viewer: 'fw1' }); await sleep(700);
  sf = await S(page);
  check('بعد المتابعة: ينضم المعلّق تلقائياً', sf.players.includes('tiktok:fw1') && !sf.pending.includes('tiktok:fw1'), sf);
  await page.evaluate(() => { window.followGateAllows = window.__origFG; });

  // ===== 6) بطولة 4 لاعبين: لعب كامل بالشات =====
  await page.evaluate(() => xoApi().reset()); await sleep(250);
  for (let i = 1; i <= 4; i++) await say('t' + i, 'العب', 'لاعب' + i);
  check('انضمام 4 لاعبين', await waitFor(page, () => xoApi().getState().players.length === 4, null, 6000));
  await say('late0', 'العب', 'متأخر0'); // قبل البدء: يدخل
  await waitFor(page, () => xoApi().getState().players.length === 5, null, 4000);
  await page.evaluate(() => xoApi().removePlayer('tiktok:late0')); await sleep(150);
  check('إزالة مشارك قبل البدء: يُحذف من القائمة', (await S(page)).players.length === 4 && !(await S(page)).players.includes('tiktok:late0'));
  check('بدء البطولة', await page.evaluate(() => startXo()) && await waitFor(page, () => ['intro', 'active'].includes(xoApi().getState().phase), null, 3000));
  s = await S(page);
  check('المرحلة 1: مواجهتان بلا تكرار لاعب والتأهل فارغ', s.stageNo === 1 && s.stageTotal === 2 && s.qualified.length === 0 && new Set([s.cur.a, s.cur.b]).size === 2, s);
  await say('late1', 'العب', 'متأخر1'); await sleep(400);
  s = await S(page);
  check('متأخر بعد البداية: لا يدخل الجدول الجاري ويُسجَّل بقائمة البطولة التالية', !s.players.includes('tiktok:late1') && s.queued.includes('tiktok:late1'), s);
  // أثناء التقديم لا تُقبل حركات
  await waitFor(page, () => xoApi().getState().phase === 'intro' || xoApi().getState().phase === 'active', null, 2000);
  // مواجهة 1: X يفوز 1-2-3 مع تشويش (غير دور/غريب/مستخدم/خارج النطاق)
  await waitFor(page, () => xoApi().getState().phase === 'active', null, 4000);
  s = await S(page);
  const xs = s.cur.x, os = s.cur.o, other = s.players.find((p) => p !== s.cur.a && p !== s.cur.b);
  await say(viewerOf(os), '5', 'ليس دوري'); await say('stranger', '5', 'غريب'); await say(viewerOf(xs), 'مرحبا'); await say(viewerOf(xs), '0'); await say(viewerOf(xs), '10'); await say(viewerOf(xs), '@x 5'); await say(viewerOf(other), '5', 'لاعب من مواجهة أخرى');
  await sleep(500);
  s = await S(page);
  check('رسائل غير صحيحة/غير الدور/غير اللاعبَين/صفر/10/منشن: لا تغيّر اللوحة ولا الدور', s.cur.board.every((b) => !b) && s.cur.turn === xs, s.cur);
  await say(viewerOf(xs), '٥', 'x'); // رقم هندي = 5 (X يلعب 5)
  await waitFor(page, () => xoApi().getState().cur.board[4] === 'X', null, 3000);
  s = await S(page);
  check('الأرقام الهندية مقبولة: ٥ → المربع 5 بالرمز X والدور للخصم', s.cur.board[4] === 'X' && s.cur.turn === os, s.cur);
  await say(viewerOf(os), '5', 'o'); await sleep(350);
  s = await S(page);
  check('مربع مستخدم: لا يغيّر اللوحة ولا الدور', s.cur.board.filter(Boolean).length === 1 && s.cur.turn === os, s.cur);
  await say(viewerOf(os), ' 1 ', 'o'); await waitFor(page, () => xoApi().getState().cur.board[0] === 'O', null, 3000);
  await say(viewerOf(xs), '4', 'x'); await waitFor(page, () => xoApi().getState().cur.board[3] === 'X', null, 3000);
  await say(viewerOf(os), '2', 'o'); await waitFor(page, () => xoApi().getState().cur.board[1] === 'O', null, 3000);
  await say(viewerOf(xs), '6', 'x');   // X: 5,4,6 → خط 4-5-6
  await waitFor(page, () => xoApi().getState().phase === 'result', null, 3000);
  s = await S(page);
  check('الفوز بخط 4-5-6: المتأهل X بقائمة «فائز مؤقت» والخاسر مُقصى', s.qualified.length === 1 && s.qualified[0].uid === xs && s.qualified[0].kind === 'win' && s.eliminated.includes(os), s);
  const tmpUi = await frameEval(page, () => ({ n: document.querySelectorAll('#xo-tmp-l .xo-ti').length, title: document.querySelector('.xo-tmp-h h2').textContent, right: document.querySelector('.xo-tmp').getBoundingClientRect().right, w: window.innerWidth, top: document.querySelector('.xo-tmp').getBoundingClientRect().top }));
  check('قائمة «فائز مؤقت» أعلى يمين الشاشة فعلياً وفيها بطاقة واحدة', tmpUi && tmpUi.title === 'فائز مؤقت' && tmpUi.n === 1 && tmpUi.w - tmpUi.right < 40 && tmpUi.top < 40, tmpUi);
  // المواجهة الثانية
  await waitFor(page, () => { const s = xoApi().getState(); return s.phase === 'active' && s.cur.no === 2; }, null, 5000);
  s = await S(page);
  check('انتقال للمواجهة الثانية بلاعبين لم يلعبا في المرحلة', s.cur.a !== xs && s.cur.b !== xs && s.cur.a !== os && s.cur.b !== os, s.cur);
  // انتهاء الوقت: قصّر مدة الدور بالمحرك ثم لا ترسل شيئاً
  await page.evaluate(() => { xoApi()._t.core.S().turnSec = 10; });
  const tl = await S(page); const loser = tl.cur.turn, winner = tl.cur.a === loser ? tl.cur.b : tl.cur.a;
  await page.evaluate(() => { const c = xoApi()._t.core, st = c.S(); st.phaseEndsAt = c.now() + 400; });
  await waitFor(page, () => xoApi().getState().phase === 'result', null, 3000);
  s = await S(page);
  check('انتهاء وقت اللاعب: يتأهل المنافس بسبب «انتهاء وقت» ويُقصى صاحب الوقت', s.qualified.some((q) => q.uid === winner && q.kind === 'timeout') && s.eliminated.includes(loser), s);
  await waitFor(page, () => ['intro', 'active'].includes(xoApi().getState().phase) && xoApi().getState().stageNo === 2, null, 6000);
  s = await S(page);
  check('المرحلة 2 = النهائي: المتأهلان فقط وقائمة المتأهلين صُفّرت', s.stageNo === 2 && s.isFinal && s.stageTotal === 1 && s.qualified.length === 0 && new Set([s.cur.a, s.cur.b]).size === 2 && s.cur.a !== loser && s.cur.b !== loser, s);
  // النهائي: تعادلات ثلاثية → قرعة → بطل
  await page.evaluate(() => { window.__wins.length = 0; });
  for (let k = 0; k < 3; k++) { await playCells(page, [1, 2, 3, 5, 4, 6, 8, 7, 9]); await waitFor(page, ([k]) => { const s = xoApi().getState(); return k < 2 ? (s.phase === 'result' || s.phase === 'intro') : s.phase === 'result'; }, [k], 3000); await sleep(150); }
  await waitFor(page, () => xoApi().getState().phase === 'finished', null, 8000);
  s = await S(page);
  check('3 تعادلات بالنهائي → قرعة → بطل واحد وانتهاء البطولة', s.phase === 'finished' && s.champion && s.alive.length === 1 && s.alive[0] === s.champion, s);
  const wins = await page.evaluate(() => window.__wins.slice());
  check('الفوز الرسمي (recordWin) للبطل فقط ومرة واحدة وباسم اللعبة', wins.length === 1 && 'tiktok:' + wins[0].id.replace(/^tiktok:/, '') === s.champion && wins[0].g === 'إكس أو', wins);
  const champUi = await frameEval(page, () => ({ on: document.getElementById('xo-champ').classList.contains('on'), t: document.getElementById('xo-champ-t').textContent, n: document.getElementById('xo-champ-n').textContent, crown: !!document.querySelector('.xo-crown') && getComputedStyle(document.querySelector('.xo-crown')).display !== 'none', btn: [...document.querySelectorAll('#xo-champ button')].map((b) => b.textContent) }));
  check('شاشة التتويج: «بطل إكس أو» + تاج + اسم + زرا «بطولة جديدة» و«الرئيسية»', champUi && champUi.on && champUi.t === 'بطل إكس أو' && champUi.crown && champUi.btn.join('|') === 'بطولة جديدة|الرئيسية', champUi);
  await sleep(600);
  check('بعد التتويج بفترة: لا تسجيل ثانٍ للفوز', (await page.evaluate(() => window.__wins.length)) === 1);
  // بطولة جديدة: المتأخر المسجّل ينتقل لقائمة الانتظار
  await frameEval(page, () => document.getElementById('xo-champ-new').click()); await sleep(300);
  s = await S(page);
  check('«بطولة جديدة»: قائمة انتظار جديدة، ومن كتب الكلمة متأخراً انتقل إليها، وقائمة المتأهلين فارغة', s.phase === 'waiting' && s.players.length === 1 && s.players[0] === 'tiktok:late1' && s.qualified.length === 0 && s.queued.length === 0, s);

  // ===== 7) الإيقاف/الاستئناف + انقطاع الربط + الإزالة + الريست =====
  for (let i = 1; i <= 3; i++) await say('v' + i, 'العب', 'ف' + i);
  await waitFor(page, () => xoApi().getState().players.length === 4, null, 5000);
  await page.evaluate(() => startXo()); await waitFor(page, () => xoApi().getState().phase === 'active', null, 5000);
  await page.evaluate(() => { xoApi().pause(); }); await sleep(120);
  s = await S(page); const left1 = s.left;
  await sleep(700); const s2 = await S(page);
  check('الإيقاف المؤقت يحفظ الوقت المتبقي ولا يستمر المؤقّت', s.status === 'paused' && s2.status === 'paused' && Math.abs(s2.left - left1) < 0.02 && s.phase === 'active', [left1, s2.left]);
  await say(viewerOf(s2.cur.turn), '5', 'x'); await sleep(300);
  check('أثناء الإيقاف: الحركات لا تُقبل', (await S(page)).cur.board.every((b) => !b));
  await page.evaluate(() => xoApi().resume()); await sleep(150);
  check('الاستئناف يعيد المؤقّت من الوقت المحفوظ', await page.evaluate((l) => { const s = xoApi().getState(); return s.status === 'active' && s.left <= l + 0.05 && s.left > l - 1; }, left1));
  // إزالة لاعب من مواجهة جارية
  s = await S(page); const rem = s.cur.a, opp = s.cur.b;
  await page.evaluate((u) => xoRemoveParticipant(u), rem); await sleep(200);
  s = await S(page);
  check('إزالة لاعب من مواجهة جارية: منافسه يتأهل (سبب: انسحاب) والمُزال لا يعود', s.qualified.some((q) => q.uid === opp && q.kind === 'removed') && s.eliminated.includes(rem), s);
  await say(viewerOf(rem), 'العب', 'عائد'); await sleep(300);
  check('المُزال/المقصي لا يعود بالكلمة أثناء البطولة (ولا يدخل قائمة المتأخرين)', !(await S(page)).queued.includes(rem));
  // انقطاع الربط يوقف البطولة
  await waitFor(page, () => { const s = xoApi().getState(); return s.phase === 'active'; }, null, 5000);
  await frameEval(page, () => { const a = window.EhsemhaXO; a.setLinkStatus(false, 'الشات غير متصل'); a._t.K.LINK_GRACE = 300; });
  await waitFor(page, () => xoApi().getState().paused, null, 3000);
  s = await S(page);
  check('انقطاع البث: توقف تلقائي واضح (pauseReason=link) مع حفظ الوقت', s.paused && s.pauseReason === 'link' && s.left > 0, s);
  const bar = await frameEval(page, () => ({ vis: !document.getElementById('xo-pausebar').hidden, t: document.getElementById('xo-pausebar-t').textContent }));
  check('شريط الإيقاف يشرح السبب ويحفظ الوقت', bar && bar.vis && /انقطع الاتصال/.test(bar.t), bar);
  // ريست أثناء المواجهة
  await frameEval(page, () => { document.getElementById('xo-reset').click(); });
  await sleep(100);
  const cf = await frameEval(page, () => !document.getElementById('xo-confirm').hidden);
  check('إعادة الضبط تطلب تأكيداً', cf === true);
  await frameEval(page, () => document.getElementById('xo-cf-yes').click()); await sleep(400);
  s = await S(page);
  check('الريست: عودة للانتظار بلا لاعبين ولا مؤقّت ولا متأهلين', s.phase === 'waiting' && !s.paused && s.qualified.length === 0 && s.cur === null, s);
  const t2 = await frameEval(page, () => ({ flights: document.querySelectorAll('.xo-flight').length, champ: document.getElementById('xo-champ').classList.contains('on') }));
  check('الريست: لا بقايا حركة/تتويج', t2 && t2.flights === 0 && !t2.champ, t2);

  // ===== 8) أوامر المالك =====
  for (let i = 1; i <= 2; i++) await say('o' + i, 'العب', 'م' + i);
  await waitFor(page, () => xoApi().getState().players.length === 2, null, 4000);
  await page.evaluate(() => xoLiveCommandHandlers.join({ uniqueId: 'tiktok:owner9', nickname: 'مضاف' })); await sleep(200);
  check('أمر المالك join يضيف لاعباً للانتظار', (await S(page)).players.includes('tiktok:owner9'));
  await page.evaluate(() => xoLiveCommandHandlers.leave({ uniqueId: 'tiktok:owner9' })); await sleep(150);
  check('أمر المالك leave يزيله', !(await S(page)).players.includes('tiktok:owner9'));
  await page.evaluate(() => startXo()); await waitFor(page, () => xoApi().getState().phase === 'active', null, 4000);
  s = await S(page); const fw = s.cur.a;
  await page.evaluate((u) => xoLiveCommandHandlers.forceWinOther({ uniqueId: u }), fw); await sleep(300);
  s = await S(page);
  check('أمر المالك forceWin يحسم المواجهة لصالح اللاعب المحدد', s.phase !== 'active' && (s.champion === fw || s.qualified.some((q) => q.uid === fw)), s);

  // ===== 9) الخروج بلا بقايا =====
  await page.evaluate(() => xoGoHome()); await sleep(400);
  const gone = await page.evaluate(() => ({ api: xoApi(), src: document.getElementById('xo-frame').getAttribute('src'), active: document.querySelector('.page.active').id, lst: Object.keys(homeGameListeners).includes('xo') }));
  check('الخروج: الإطار يُفرَّغ والمستمع يُزال والعودة للرئيسية', gone.api === null && /about:blank/.test(gone.src) && !gone.lst && gone.active !== 'pg-xo', gone);
  check('إعادة التشغيل بعد الخروج بلا تكرار مستمعات', await launch(page, 'ابدا', 25, false) && (await page.evaluate(() => Object.keys(homeGameListeners).filter((k) => k === 'xo').length)) === 1 && (await S(page)).lotAfter3 === false && (await S(page)).turnSec === 25);
  // تنقّل بغير الأزرار
  await page.evaluate(() => show('home')); await sleep(300);
  check('التنقّل بـshow() يفرّغ الإطار تلقائياً', (await page.evaluate(() => xoApi())) === null);

  // ===== 10) الجوال =====
  await page.setViewportSize({ width: 390, height: 844 });
  check('الإطلاق على الجوال', await launch(page));
  await say('mm1', 'العب', 'جوال1'); await say('mm2', 'العب', 'جوال2');
  await waitFor(page, () => xoApi().getState().players.length === 2, null, 4000);
  await page.evaluate(() => startXo()); await waitFor(page, () => xoApi().getState().phase === 'active', null, 4000);
  const mob = await frameEval(page, () => { const r = (id) => document.getElementById(id).getBoundingClientRect(); const b = r('xo-board'), t = r('xo-tmpwrap'); return { vw: innerWidth, boardW: Math.round(b.width), boardR: Math.round(b.right), boardL: Math.round(b.left), tmpTop: Math.round(t.top), noHScroll: document.documentElement.scrollWidth <= innerWidth + 1, ov: [...document.querySelectorAll('#xo-main .xo-pc')].every((c) => c.getBoundingClientRect().bottom <= document.getElementById('xo-center').getBoundingClientRect().top + 2) }; });
  check('الجوال: لوحة داخل العرض وبلا تمرير أفقي وقائمة الفائز المؤقت بالأعلى والبطاقات لا تغطي اللوحة', mob && mob.boardL >= 0 && mob.boardR <= mob.vw && mob.noHScroll && mob.tmpTop < 120 && mob.ov, mob);

  const errs = page._errors.concat(page._consoleErrors).filter((e) => !/Failed to load|net::|firebase/i.test(e));
  check('بلا أخطاء JS بالصفحة الرئيسية أثناء كل ما سبق', errs.length === 0, errs);
  const frameErrs = [];
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' PASS');
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(2); });
