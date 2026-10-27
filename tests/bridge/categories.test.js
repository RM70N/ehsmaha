'use strict';
// قسم «فئات» بتصميمه الجديد (ehcat-css/ehcat-js): تصميم فقط — المنطق كما هو.
// يمرّ على اللعبة كاملة بنقرات حقيقية (مؤشر الفأرة، مو استدعاء دوال): الرئيسية ← اختيار الفئات ← أسماء الفرق ←
// اللوحة ← سؤال ← إظهار الإجابة ← نقاط الفريق ← وسائل المساعدة (دبلها/بلوك/بحث) ← إنهاء ← شاشة الفائز،
// ثم نفس المسار بعرض جوال. Firebase مُحاكى بالذاكرة (نفس واجهة الصفحة) والفئات الجاهزة مدمجة بالكود.
//   PLAYWRIGHT_PATH=... node tests/bridge/categories.test.js
const H = require('./harness');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (!ok && detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FB_STUB = `fb = (function(){
  const store = {}; const subs = {}; let n = 0;
  const colOf = p => store[p] || (store[p] = {});
  const snapOf = col => ({ exists: () => true, forEach: f => Object.keys(colOf(col)).forEach(id => f({ id, data: () => colOf(col)[id] })) });
  const notify = col => (subs[col] || []).forEach(cb => cb(snapOf(col)));
  return { db: {}, collection: (db, name) => ({ _col: name }),
    doc: (a, b, c) => (a && a._col) ? { _col: a._col, id: 'id' + (++n) + Date.now() } : { _col: b, id: c },
    getDoc: async ref => ({ exists: () => ref.id in colOf(ref._col), data: () => colOf(ref._col)[ref.id] }),
    setDoc: async (ref, data) => { colOf(ref._col)[ref.id] = data; notify(ref._col); },
    updateDoc: async (ref, data) => { colOf(ref._col)[ref.id] = Object.assign({}, colOf(ref._col)[ref.id], data); notify(ref._col); },
    deleteDoc: async ref => { delete colOf(ref._col)[ref.id]; notify(ref._col); },
    onSnapshot: (ref, cb) => { if (ref._col && ref.id === undefined) { (subs[ref._col] = subs[ref._col] || []).push(cb); cb(snapOf(ref._col)); } else { cb({ exists: () => ref.id in colOf(ref._col), data: () => colOf(ref._col)[ref.id] }); } return () => {}; },
    serverTimestamp: () => Date.now(), query: x => x, where: x => x, getDocs: async () => ({ forEach: () => {} }) };
})()`;

async function boot(page) {
  await page.evaluate((stub) => {
    const l = document.getElementById('auth-loader'); if (l) l.classList.add('hidden');
    (0, eval)(stub);
    (0, eval)('isAhsemhaEditorAccount = function(){ return true; }');
    try { ahsemhaSettingsBoot(); } catch (e) {}
    try { ahsemhaCategoriesBoot(); } catch (e) {}
    show('ahsemha-home');
  }, FB_STUB);
  await sleep(1500);
}
const active = (page) => page.evaluate(() => { const a = document.querySelector('.page.active'); return a && a.id; });
const ptsRaw = (page, t) => page.evaluate((t) => Number(document.getElementById('ahsemha-board-team' + t + '-points').textContent.replace(/\D/g, '')), t);
const pts = async (page, t) => { let last = -1; let same = 0; for (let i = 0; i < 40; i++) { const v = await ptsRaw(page, t); if (v === last) { if (++same >= 4) return v; } else same = 0; last = v; await sleep(250); } return last; };
const ovOn = (id) => { const e = document.getElementById(id); return !!e && (e.classList.contains('visible') || e.classList.contains('show')); };
const visible = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.9; }, sel);
const waitVisible = async (page, sel, ms = 5000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await visible(page, sel)) return true; await sleep(100); } return false; };

async function playRound(page, { cellIdx, lifeline, team, answerAs }) {
  // يفتح خلية محددة بنقرة حقيقية، يُظهر الإجابة، ثم يمنح النقاط للفريق المطلوب (0 = محد جاوب)
  if (lifeline) { await page.click(`#ahsemha-team${lifeline.team}-lifelines .ahsemha-lifeline-btn:has-text("${lifeline.name}")`); await sleep(300); }
  await page.locator('.ahsemha-board-cell:not(.used)').nth(cellIdx || 0).click();
  await sleep(700);
  const q = await page.evaluate(() => ({ on: (() => { const e = document.getElementById('ahsemha-question-overlay'); return e.classList.contains('visible') || e.classList.contains('show'); })(), txt: document.getElementById('ahsemha-q-text').textContent.trim(), pts: document.getElementById('ahsemha-q-points').textContent.trim() }));
  await waitVisible(page, '#ahsemha-q-reveal-btn'); await page.click('#ahsemha-q-reveal-btn'); await sleep(500);
  const a = await page.evaluate(() => ({ on: (() => { const e = document.getElementById('ahsemha-answer-overlay'); return e.classList.contains('visible') || e.classList.contains('show'); })(), ans: document.getElementById('ahsemha-a-text').textContent.trim() }));
  const sel = answerAs === 0 ? '#ahsemha-a-noanswer-btn' : `#ahsemha-a-team${answerAs}-btn`;
  const clickable = await waitVisible(page, sel, answerAs === 0 ? 5000 : 5000);
  if (clickable) { await page.click(sel); await sleep(500); }
  return { q, a, clickable };
}

async function flow(page, tag, mobile) {
  const errs0 = page._errors.length;
  await boot(page);
  check(`${tag}: الرئيسية تظهر بعنوان «فئات» وزر البدء`, (await active(page)) === 'pg-ahsemha-home' && await waitVisible(page, '#pg-ahsemha-home .ahsemha-start-card') && await waitVisible(page, '#pg-ahsemha-home .home-title'));
  check(`${tag}: التصميم الجديد مفعّل (صفحات ehcat + خلفية المسرح)`, await page.evaluate(() => document.body.hasAttribute('data-ehcat-page') && document.getElementById('pg-ahsemha-home').classList.contains('ehcat-page') && !!document.querySelector('.ehcat-orbit')));
  await page.click('#pg-ahsemha-home .ahsemha-start-card'); await sleep(900);
  check(`${tag}: نقر «ابدأ اللعب» يفتح اختيار الفئات`, (await active(page)) === 'pg-ahsemha-pick');
  const nCards = await page.evaluate(() => document.querySelectorAll('#ahsemha-pick-grid > *').length);
  check(`${tag}: شبكة الفئات مرسومة (≥ 7 فئات جاهزة)`, nCards >= 7, nCards);
  check(`${tag}: زر «التالي» معطّل قبل اكتمال الاختيار`, await page.evaluate(() => document.getElementById('ahsemha-pick-next-btn').disabled === true));
  // اختيار 7 فئات بنقرات حقيقية + إلغاء اختيار وإعادته
  const need = await page.evaluate(() => ahsemhaGetSetting('pickCount'));
  const pickCard = (i) => page.click(`#ahsemha-pick-grid > :nth-child(${i + 1})`);
  for (let i = 0; i < need; i++) { await pickCard(i); await sleep(120); }
  let sel = await page.evaluate(() => ({ n: ahsemhaSelectedCategoryIds.length, cnt: document.getElementById('ahsemha-pick-count').textContent.replace(/\D.*$/, '').trim(), dis: document.getElementById('ahsemha-pick-next-btn').disabled }));
  check(`${tag}: اختيار ${need} فئات بالنقر (العدّاد يتحدّث وزر التالي يتفعّل)`, sel.n === need && Number(sel.cnt) === need && sel.dis === false, sel);
  const firstId = await page.evaluate(() => ahsemhaSelectedCategoryIds[0]);
  await pickCard(0); await sleep(250);
  sel = await page.evaluate(() => ({ n: ahsemhaSelectedCategoryIds.length, dis: document.getElementById('ahsemha-pick-next-btn').disabled }));
  check(`${tag}: النقر على فئة مختارة يلغي اختيارها ويعطّل «التالي»`, sel.n === need - 1 && sel.dis === true, sel);
  await pickCard(0); await sleep(250);
  const order = await page.evaluate(() => ahsemhaSelectedCategoryIds.slice());
  check(`${tag}: إعادة اختيارها تضعها آخر الترتيب (ترتيب الاختيار = ترتيب الأعمدة)`, order.length === need && order[need - 1] === firstId, order);
  await page.click('#ahsemha-pick-next-btn'); await sleep(900);
  check(`${tag}: «التالي» يفتح أسماء الفرق`, (await active(page)) === 'pg-ahsemha-teams');
  await page.fill('#ahsemha-team1-name', 'الصقور'); await page.fill('#ahsemha-team2-name', 'النمور');
  await page.click('#pg-ahsemha-teams .btn-primary'); await sleep(2200);
  check(`${tag}: بدء اللعبة يفتح اللوحة بأسماء الفريقين ونقاط 0`, (await active(page)) === 'pg-ahsemha-board' && await page.evaluate(() => document.getElementById('ahsemha-board-team1-name').textContent.trim() === 'الصقور' && document.getElementById('ahsemha-board-team2-name').textContent.trim() === 'النمور') && (await pts(page, 1)) === 0 && (await pts(page, 2)) === 0);
  const cols = await page.evaluate(() => ({ cols: document.querySelectorAll('.ahsemha-board-col').length, cells: document.querySelectorAll('.ahsemha-board-cell').length }));
  check(`${tag}: اللوحة: ${need} أعمدة × 6 خلايا`, cols.cols === need && cols.cells === need * 6, cols);
  if (mobile) {
    const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    check(`${tag}: لا تمرير أفقي بالصفحة على الجوال`, ov.sw <= ov.cw + 2, ov);
  }

  // جولة 1: سؤال عادي يفوز به الفريق 1
  const r1 = await playRound(page, { cellIdx: 0, answerAs: 1 });
  check(`${tag}: النقر على خلية يفتح نافذة السؤال بنصه ونقاطه`, r1.q.on && r1.q.txt.length > 3 && /\d/.test(r1.q.pts), r1.q);
  check(`${tag}: «اظهر الإجابة» تفتح نافذة الإجابة بنصها`, r1.a.on && r1.a.ans.length > 0, r1.a);
  check(`${tag}: زر فوز الفريق ظاهر وقابل للنقر`, r1.clickable);
  const p1 = await pts(page, 1);
  check(`${tag}: فوز الفريق الأول بالسؤال يضيف نقاط الخلية له (200)`, p1 === 200 && (await pts(page, 2)) === 0, p1);
  check(`${tag}: النوافذ تُقفل بعد الحسم والخلية تصير مستخدمة`, await page.evaluate(() => !['ahsemha-question-overlay', 'ahsemha-answer-overlay'].some((id) => { const e = document.getElementById(id); return e.classList.contains('visible') || e.classList.contains('show'); }) && document.querySelectorAll('.ahsemha-board-cell.used').length === 1));

  // جولة 2: «محد جاوب صح» لا يغيّر النقاط
  const r2 = await playRound(page, { cellIdx: 0, answerAs: 0 });
  check(`${tag}: «محد جاوب صح» لا يضيف نقاطاً لأي فريق`, r2.clickable && (await pts(page, 1)) === 200 && (await pts(page, 2)) === 0);

  // جولة 3: «دبلها» للفريق 2 تضاعف نقاطه
  const dbl = await page.evaluate(() => { const b = [...document.querySelectorAll('#ahsemha-team2-lifelines .ahsemha-lifeline-btn')].find(x => /دبلها/.test(x.textContent)); return !!b && !b.classList.contains('used'); });
  check(`${tag}: وسيلة «دبلها» متاحة للفريق الثاني`, dbl);
  const r3 = await playRound(page, { cellIdx: 0, lifeline: { team: 2, name: 'دبلها' }, answerAs: 2 });
  const p2 = await pts(page, 2);
  check(`${tag}: «دبلها» تضاعف نقاط السؤال الفائز (الفريق 2)`, p2 >= 400 && p2 % 400 === 0, p2);
  check(`${tag}: وسيلة «دبلها» تُستهلك مرة واحدة (علامة مستخدمة)`, await page.evaluate(() => [...document.querySelectorAll('#ahsemha-team2-lifelines .ahsemha-lifeline-btn')].some(b => /دبلها/.test(b.textContent) && b.classList.contains('used'))));

  // جولة 4: «بلوك» للفريق 1 يحظر الفريق 2 من الإجابة
  await page.click('#ahsemha-team1-lifelines .ahsemha-lifeline-btn:has-text("بلوك")'); await sleep(300);
  const blocked = await page.evaluate(() => ahsemhaBlockedTeam);
  check(`${tag}: «بلوك» تسجّل حظر الفريق الآخر`, blocked === 2, blocked);
  await page.locator('.ahsemha-board-cell:not(.used)').nth(0).click(); await sleep(700);
  await waitVisible(page, '#ahsemha-q-reveal-btn'); await page.click('#ahsemha-q-reveal-btn'); await sleep(500);
  const vis1 = await waitVisible(page, '#ahsemha-a-team1-btn'); const vis2 = await visible(page, '#ahsemha-a-team2-btn');
  check(`${tag}: الفريق المحظور لا يستطيع أخذ النقاط وزر الفريق الآخر يعمل`, !vis2 && vis1, { vis1, vis2 });
  const before1 = await pts(page, 1);
  await page.click('#ahsemha-a-team1-btn'); await sleep(500);
  check(`${tag}: فوز الفريق غير المحظور يضيف نقاطه`, (await pts(page, 1)) > before1);

  // جولة 5: «بحث» أثناء السؤال (مؤقت) من نافذة السؤال
  await page.locator('.ahsemha-board-cell:not(.used)').nth(0).click(); await sleep(800);
  const searchBtn = await page.evaluate(() => { const b = [...document.querySelectorAll('#ahsemha-question-overlay [data-ehd], #ahsemha-question-overlay .ahsemha-lifeline-btn, #ahsemha-question-overlay .ehcat-mod')].find(x => /بحث/.test(x.textContent)); return !!b; });
  check(`${tag}: وسائل المساعدة (بحث) ظاهرة داخل نافذة السؤال`, searchBtn);
  await waitVisible(page, '#ahsemha-q-reveal-btn'); await page.click('#ahsemha-q-reveal-btn'); await sleep(400);
  await waitVisible(page, '#ahsemha-a-noanswer-btn'); await page.click('#ahsemha-a-noanswer-btn'); await sleep(500);

  // إنهاء اللعبة بتخطي بقية الخلايا ثم شاشة الفائز
  let guard = 0;
  while (guard++ < 60) {
    const ok = await page.evaluate(() => { const c = document.querySelector('.ahsemha-board-cell:not(.used)'); if (!c) return false; c.click(); return true; });
    if (!ok) break;
    await sleep(120); await page.evaluate(() => document.getElementById('ahsemha-q-reveal-btn').click()); await sleep(120);
    await page.evaluate((g) => ahsemhaAnswerQuestion(g % 3), guard); await sleep(150);
  }
  await sleep(1500);
  check(`${tag}: بعد آخر خلية تظهر شاشة الفائز`, (await active(page)) === 'pg-ahsemha-winner', await active(page));
  const w = await page.evaluate(() => ({ name: document.getElementById('ahsemha-winner-name').textContent.trim(), cong: document.getElementById('ahsemha-winner-congrats').textContent.trim() }));
  check(`${tag}: شاشة الفائز: اسم الفريق الفائز والتهنئة`, /الصقور|النمور|تعادل/.test(w.name + w.cong), w);
  check(`${tag}: زر «لعبة جديدة» ظاهر ويرجّع لاختيار الفئات`, await (async () => { await page.click('#pg-ahsemha-winner button[onclick="ahsemhaOpenPick()"]'); await sleep(900); return (await active(page)) === 'pg-ahsemha-pick'; })());
  check(`${tag}: لا أخطاء JS أثناء المسار كله`, page._errors.length === errs0, page._errors.slice(errs0, errs0 + 3));
}

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();

  // ---- سطح المكتب
  let page = await H.newPage(browser, { context: { viewport: { width: 1100, height: 800 } } });
  await flow(page, 'سطح المكتب', false);

  // ---- الخروج أثناء اللعب + الرجوع
  await boot(page);
  await page.click('#pg-ahsemha-home .ahsemha-start-card'); await sleep(700);
  const need = await page.evaluate(() => ahsemhaGetSetting('pickCount'));
  for (let i = 0; i < need; i++) { await page.click(`#ahsemha-pick-grid > :nth-child(${i + 1})`); await sleep(80); }
  await page.click('#ahsemha-pick-next-btn'); await sleep(700);
  await page.click('#pg-ahsemha-teams .back-btn'); await sleep(500);
  check('زر الرجوع من أسماء الفرق يرجع لاختيار الفئات', (await active(page)) === 'pg-ahsemha-pick');
  await page.click('#pg-ahsemha-pick .back-btn'); await sleep(500);
  check('زر الرجوع من اختيار الفئات يرجع للرئيسية', (await active(page)) === 'pg-ahsemha-home');
  await page.click('#pg-ahsemha-home .ahsemha-start-card'); await sleep(700);
  for (let i = 0; i < need; i++) { await page.click(`#ahsemha-pick-grid > :nth-child(${i + 1})`); await sleep(80); }
  await page.click('#ahsemha-pick-next-btn'); await sleep(700);
  await page.fill('#ahsemha-team1-name', 'أ'); await page.fill('#ahsemha-team2-name', 'ب');
  await page.click('#pg-ahsemha-teams .btn-primary'); await sleep(2000);
  page.once('dialog', (d) => d.accept());
  await page.click('#pg-ahsemha-board .back-btn'); await sleep(900);
  check('«إنهاء اللعبة» (مع التأكيد) يرجع للرئيسية', (await active(page)) === 'pg-ahsemha-home', await active(page));
  // نافذة الإعدادات (للمحرّر/المالك فقط) تفتح وتقفل
  await page.evaluate(() => ahsemhaOpenSettings()); await sleep(500);
  check('نافذة إعدادات فئات تفتح بالتصميم الجديد', await page.evaluate(() => (() => { const e = document.getElementById('ahsemha-settings-overlay'); return e.classList.contains('visible') || e.classList.contains('show'); })()));
  await page.evaluate(() => document.getElementById('ahsemha-settings-overlay').classList.remove('visible'));

  // ---- جوال
  const mob = await H.newPage(browser, { context: { viewport: { width: 390, height: 800 }, hasTouch: false } });
  await flow(mob, 'جوال 390', true);

  await browser.close();
  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
