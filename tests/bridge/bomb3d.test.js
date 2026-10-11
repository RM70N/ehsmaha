'use strict';
// القنبلة المتحركة 3D — من الكرت إلى نهاية اللعبة عبر سيرفر الجسر الحقيقي (fake connector) وindex.html الحقيقي:
// الكرت والإعداد · الانضمام بالكلمة (صيغ، فولو، طرد) · التمرير بكتابة رقم اللاعب فقط (المنشن/الاسم/النص يُتجاهل) ·
// الانفجار والإقصاء والفائز وتسجيله · الحصانة والإنعاش بالهدايا · «لاعب متأخر» (زر داخل اللعبة ← نافذة المنصة الموحّدة) ·
// إعادة الضبط والخروج وإعادة التشغيل بلا تكرار معالجات · بدون أخطاء JS.
//   tests/bridge/servers.sh start
//   PLAYWRIGHT_PATH=/opt/node22/lib/node_modules/playwright node tests/bridge/bomb3d.test.js
const H = require('./harness');
const STREAMER = 'streamer1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail).slice(0, 360) : '')); };
const ctl = (o) => H.ctl(H.PRIMARY, Object.assign({ user: STREAMER, identity: { isFollowerOfAnchor: true } }, o));
const say = (viewer, text, extra) => ctl(Object.assign({ cmd: 'chat', viewer, nickname: viewer, text }, extra || {}));
async function waitFor(page, fn, arg, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { if (await page.evaluate(fn, arg)) return true; } catch (e) {} await sleep(120); }
  return false;
}
const st = (page) => page.evaluate(() => bombApi().getState());
const num = async (page, viewer) => { const s = await st(page); const p = s.players.find((x) => x.id === 'tiktok:' + viewer); return p ? p.num : null; };
const holderViewer = async (page) => { const s = await st(page); return s.holder ? s.holder.id.replace('tiktok:', '') : null; };

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, { query: '?debug=1' });
  await page.setViewportSize({ width: 1280, height: 800 });
  page.on('dialog', (d) => d.accept().catch(() => {}));
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; });
  const consoleErr = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::|firebase|gstatic|googleapis|cdn|fonts/i.test(m.text())) consoleErr.push(m.text().slice(0, 200)); });

  // ===== 1) الكرت والمكتبة =====
  await page.evaluate(() => show('home')); await sleep(700);
  const card = await page.evaluate(() => { const c = document.querySelector('#hlob-grid .hlob-card[data-tag="bomb"]'); const reg = document.querySelector('.hlob-registry .gcard[data-tag="bomb"]'); return c ? { cmd: c.querySelector('.hlob-cmd').innerText.replace(/\s+/g, ' ').trim(), h3: c.querySelector('h3').textContent, full: reg.querySelector('.gcard-desc').textContent, n: document.querySelectorAll('#hlob-grid .hlob-card').length } : null; });
  check('كرت القنبلة: أمر البطاقة «رقم لاعب» والوصف الكامل يذكر الرقم لا «منشن»', card && card.h3 === 'القنبلة المتحركة' && /رقم لاعب/.test(card.cmd) && /رقم لاعب/.test(card.full) && !/منشن/.test(card.full), card);
  await page.evaluate(() => homeApplyFilter('3d')); await sleep(300);
  const f3d = await page.evaluate(() => [...document.querySelectorAll('#hlob-grid .hlob-card')].map((c) => c.dataset.tag));
  check('فلتر ثلاثية الأبعاد يعرض القنبلة ضمن ألعاب 3D', f3d.includes('bomb') && f3d.includes('cannon'), f3d);
  await page.evaluate(() => homeApplyFilter('all')); await sleep(200);

  // ===== 2) الإعداد =====
  await page.evaluate(() => goSetupBomb()); await sleep(300);
  const su = await page.evaluate(() => ({ active: document.querySelector('.page.active').id, how: document.querySelector('#pg-setup-bomb .b3s-how').innerText, kw: document.getElementById('bomb-kw').value, mention: /منشن/.test(document.querySelector('#pg-setup-bomb .b3s-how b').parentElement.firstChild.textContent) }));
  check('شاشة الإعداد: شرح التمرير بالرقم فقط + كلمة الانضمام الافتراضية', su.active === 'pg-setup-bomb' && /رقم لاعب آخر فقط/.test(su.how) && su.kw === 'دخول', { active: su.active, kw: su.kw });
  await page.evaluate(() => launchBomb()); await sleep(300);
  check('بدون بث مربوط: رسالة «اربط بثك» ولا تبدأ اللعبة', await page.evaluate(() => /اربط بثك/.test(document.getElementById('bomb-status').textContent) && document.querySelector('.page.active').id === 'pg-setup-bomb'));
  await H.linkAccount(page, STREAMER);
  await page.evaluate(() => { document.getElementById('bomb-kw').value = ''; launchBomb(); }); await sleep(300);
  check('كلمة انضمام فارغة تُرفض برسالة', await page.evaluate(() => /الكلمة المفتاحية/.test(document.getElementById('bomb-status').textContent) && document.querySelector('.page.active').id === 'pg-setup-bomb'));

  // ===== 3) التشغيل =====
  await page.evaluate(() => { document.getElementById('bomb-kw').value = 'دخول'; launchBomb(); });
  const ready = await waitFor(page, () => { try { return !!(bombApi() && bombApi().getState().screen === 'waiting'); } catch (e) { return false; } }, null, 60000);
  const L = await page.evaluate(() => ({ pg: document.querySelector('.page.active').id, listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate'), kw: bombApi().settings().keyword, status: bombApi().getState().status }));
  check('اللعبة تعمل: شاشة الانتظار داخل الإطار، معالج واحد مسجّل، الكلمة من الإعداد', ready && L.pg === 'pg-bomb' && L.listeners.join() === 'bomb' && L.kw === 'دخول' && L.status === 'waiting', L);

  // ===== 4) الانضمام =====
  for (const t of ['دخول', 'دخول😍', '‏دخول', 'دخول!!']) await say('b_form_' + t.length + Math.random().toString(36).slice(2, 5), t);
  await say('b_other', 'مرحبا'); await say('b_a', 'دخول'); await say('b_b', 'دخول'); await say('b_c', 'دخول');
  for (let i = 0; i < 4; i++) await say('b_a', 'دخول'); // تكرار
  await sleep(1200);
  let s = await st(page);
  const nums = s.players.map((p) => p.num);
  check('الانضمام بصيغ الكلمة وبلا تكرار، وغير الكلمة لا ينضم، والأرقام فريدة ١..ن',
    s.players.length === 7 && !s.players.some((p) => p.id === 'tiktok:b_other') && new Set(nums).size === nums.length && Math.min(...nums) === 1 && Math.max(...nums) === 7, { n: s.players.length, nums });
  // شرط الفولو
  await ctl({ cmd: 'chat', viewer: 'b_nf', nickname: 'b_nf', text: 'دخول', identity: { isFollowerOfAnchor: false } }); await sleep(800);
  s = await st(page);
  check('غير المتابع ينتظر بصمت (لا يدخل)', !s.players.some((p) => p.id === 'tiktok:b_nf') && s.pending.includes('tiktok:b_nf'), { pending: s.pending });
  await ctl({ cmd: 'follow', viewer: 'b_nf' });
  check('بعد المتابعة يدخل تلقائياً', await waitFor(page, () => bombApi().getState().players.some((p) => p.id === 'tiktok:b_nf'), null, 6000));
  check('الأرقام تظهر في شاشة الانتظار (مجسّم + لافتة رقم لكل لاعب)', await page.evaluate(() => { const d = document.getElementById('pg-bomb').querySelector('iframe').contentDocument; return d.querySelectorAll('.bomb3d-lbl, [class*="lbl"]').length >= 1 || bombApi().getState().players.length >= 8; }));
  // لاعب واحد لا يكفي
  const kicked0 = await page.evaluate(() => bombApi().kick('tiktok:b_nf'));
  s = await st(page);
  check('الطرد قبل الراوند يُخرج اللاعب', kicked0 === true && !s.players.some((p) => p.id === 'tiktok:b_nf'));

  // ===== 5) بدء الراوند + التمرير بالرقم فقط =====
  await page.evaluate(() => bombApi().settings({ times: '30,30,30', minP: 2 }));
  const r = await page.evaluate(() => bombApi().start());
  s = await st(page);
  check('بدء الراوند: حالة نشطة وقنبلة عند لاعب واحد', r.ok && s.status === 'active' && !!s.holder && s.passCount === 0, { holder: s.holder && s.holder.name });
  let H0 = await holderViewer(page); const others = s.players.map((p) => p.id.replace('tiktok:', '')).filter((v) => v !== H0);
  const target = others[0], tNum = await num(page, target), hNum = await num(page, H0);
  const unchanged = async (label, who, text) => { await say(who, text); await sleep(450); const x = await st(page); return x.holder && x.holder.id === 'tiktok:' + H0 && x.passCount === 0; };
  check('غير الحامل يكتب رقماً صحيحاً: يُتجاهل', await unchanged('nonholder', others[1], String(tNum)));
  check('الحامل يكتب منشن @اسم: يُتجاهل', await unchanged('mention', H0, '@' + target));
  check('الحامل يكتب منشن مع رقم «@' + tNum + '»: يُتجاهل', await unchanged('mention-num', H0, '@' + tNum));
  check('الحامل يكتب اسم اللاعب كلاماً: يُتجاهل', await unchanged('name', H0, target));
  check('الحامل يكتب كلاماً مع الرقم «مرر ' + tNum + '»: يُتجاهل', await unchanged('text', H0, 'مرر ' + tNum));
  check('الحامل يكتب رقمه هو: يُتجاهل', await unchanged('self', H0, String(hNum)));
  check('الحامل يكتب رقماً غير موجود (99): يُتجاهل', await unchanged('nonexist', H0, '99'));
  check('الحامل يكتب رقماً من ٥ خانات: يُتجاهل', await unchanged('long', H0, '00005'));
  check('الحامل يكتب رقمين «' + tNum + ' ' + tNum + '»: يُتجاهل', await unchanged('two', H0, tNum + ' ' + tNum));
  await say(H0, String(tNum)); await sleep(700);
  s = await st(page);
  check('الحامل يكتب رقم لاعب آخر: تنتقل القنبلة له وتزيد التمريرات', s.holder && s.holder.id === 'tiktok:' + target && s.passCount === 1, { holder: s.holder && s.holder.id, passCount: s.passCount });
  // أرقام عربية
  const H1 = target, t2 = others[1], t2Num = await num(page, t2);
  const ar = String(t2Num).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  await say(H1, ar); await sleep(700);
  s = await st(page);
  check('الأرقام العربية ' + ar + ' تُقبل', s.holder && s.holder.id === 'tiktok:' + t2 && s.passCount === 2, { holder: s.holder && s.holder.id });
  // مسافات حول الرقم
  const t3 = others[2], t3Num = await num(page, t3);
  await say(t2, '  ' + t3Num + '  '); await sleep(700);
  s = await st(page);
  check('الرقم وحده مع مسافات جانبية يُقبل', s.holder && s.holder.id === 'tiktok:' + t3, { holder: s.holder && s.holder.id });
  // منصات أخرى (نفس المستقبل)
  const t4 = others[3], t4Num = await num(page, t4);
  const viaPlat = await page.evaluate(([uid, txt]) => { const a = bombApi(); a.chat({ uid, name: uid }, txt, 'kick'); return a.getState().holder.id; }, ['tiktok:' + t3, String(t4Num)]);
  check('نفس قاعدة الرقم على باقي المنصات (كيك)', viaPlat === 'tiktok:' + t4, viaPlat);

  // ===== 6) الانفجار والإقصاء والتحويل =====
  await page.evaluate(() => bombApi().settings({ times: '3,3,3' }));
  await page.evaluate(() => bombApi().reset()); await sleep(500);
  for (const v of ['e_a', 'e_b', 'e_c']) await say(v, 'دخول');
  await sleep(900);
  await page.evaluate(() => { const h = bombApi(); h.setHooks && 0; });
  await page.evaluate(() => bombApi().start());
  const exploded = await waitFor(page, () => bombApi().getState().stats.explosions >= 1, null, 12000);
  await sleep(2200);
  s = await st(page);
  check('انتهاء الوقت: انفجار عند الحامل وإقصاؤه وبقاء ٢، وتنتقل القنبلة للباقين', exploded && s.players.length === 2 && s.eliminated.length === 1 && !!s.holder && s.holder.id !== s.eliminated[0], { left: s.players.length, elim: s.eliminated, holder: s.holder && s.holder.id });
  const out = s.eliminated[0].replace('tiktok:', '');
  await say(out, 'دخول'); await sleep(600);
  check('المُقصى لا يعود بالكلمة داخل الراوند', !(await st(page)).players.some((p) => p.id === 'tiktok:' + out));
  const hv = await holderViewer(page); const rest = (await st(page)).players.map((p) => p.id.replace('tiktok:', '')).filter((v) => v !== hv)[0];
  const p0 = (await st(page)).stats.passes;
  await say(out, String(await num(page, rest))); await sleep(500);
  check('المُقصى لا يمرّر ولا يؤثر (عدّاد التمريرات لم يتغيّر)', (await st(page)).stats.passes === p0);
  const winned = await waitFor(page, () => bombApi().getState().status === 'finished', null, 14000);
  await sleep(1500);
  s = await st(page);
  check('آخر لاعب ينجو فيفوز: الحالة finished وشاشة الفوز', winned && s.winner && s.screen === 'win', { winner: s.winner && s.winner.name, screen: s.screen });

  // شاشة الفوز الجديدة (EhsemhaWin) داخل إطار القنبلة: الشاشة القديمة محذوفة
  const fwin = await page.evaluate(() => { const d = document.querySelector('#bomb-frame').contentDocument, r = d.getElementById('ehsemha-win'); return { vis: !!r && !r.hidden, name: d.getElementById('ehsemha-win-name').textContent, tag: d.getElementById('ehsemha-win-tag').textContent, meta: d.getElementById('ehsemha-win-meta').textContent, oldHidden: d.getElementById('b3d-win').hidden, btns: [...d.querySelectorAll('#ehsemha-win-actions button')].map((b) => b.textContent), full: r && Math.round(r.getBoundingClientRect().width) === d.defaultView.innerWidth }; });
  check('القنبلة: شاشة الفوز الجديدة تظهر باسم الفائز وشعار «حسمها!» والأزرار، والشاشة القديمة مخفية', fwin.vis && fwin.name === s.winner.name && fwin.tag === 'حسمها!' && fwin.oldHidden && fwin.btns.length === 2 && fwin.full && /نجا من القنبلة/.test(fwin.meta), fwin);
  await page.evaluate(() => { document.querySelector('#bomb-frame').contentDocument.querySelector('#ehsemha-win-actions button').click(); }); await sleep(700);
  const afterAgain = await page.evaluate(() => ({ st: bombApi().getState().status, hidden: document.querySelector('#bomb-frame').contentDocument.getElementById('ehsemha-win').hidden }));
  check('القنبلة: «العب مجددًا» يعيد للانتظار ويخفي شاشة الفوز', afterAgain.st === 'waiting' && afterAgain.hidden, afterAgain);

  // ===== 7) إعادة الضبط وجولة جديدة =====
  await page.evaluate(() => bombApi().reset()); await sleep(600);
  s = await st(page);
  check('ريست: رجوع للانتظار بقائمة فارغة وبلا مُقصين', s.status === 'waiting' && s.players.length === 0 && s.eliminated.length === 0, { status: s.status, n: s.players.length });

  // ===== 8) الحصانة والإنعاش (ربط الموقع) =====
  await page.evaluate(() => bombApi().settings({ times: '3,3,3' }));
  for (const v of ['r_a', 'r_b', 'r_c']) await say(v, 'دخول');
  await sleep(900);
  await page.evaluate(() => { window.__imm = new Set(); window.__origImm = window.checkAndConsumeImmunity; window.checkAndConsumeImmunity = function (uid, nm) { if (window.__imm.has(uid)) { window.__imm.delete(uid); return true; } return false; }; });
  await page.evaluate(() => bombApi().start());
  const h1 = await page.evaluate(() => bombApi().getState().holder.id);
  await page.evaluate((h) => { window.__imm.add(h); }, h1);
  const immune = await waitFor(page, () => !window.__imm.size, null, 9000);
  await sleep(600);
  s = await st(page);
  check('الحصانة: القنبلة لا تقصي المحصّن ويبقى ٣ لاعبين وتعود لوقت جديد', immune && s.players.length === 3 && s.eliminated.length === 0, { n: s.players.length });
  await page.evaluate(() => { window.checkAndConsumeImmunity = window.__origImm; });
  const ex2 = await waitFor(page, () => bombApi().getState().eliminated.length >= 1, null, 12000);
  s = await st(page);
  const gone = s.eliminated[0];
  await page.evaluate(([uid]) => { bombApi().settings({}); }, [gone]);
  const giftRes = await page.evaluate(([uid]) => bombApi().gift(uid, uid.replace('tiktok:', ''), '', 'Rose', 5), [gone]);
  await sleep(4200);
  s = await st(page);
  check('الإنعاش بالهدية: المُقصى يرجع برقم جديد (مرة وفق الإعداد)', ex2 && giftRes === true && s.players.some((p) => p.id === gone), { gift: giftRes, back: s.players.some((p) => p.id === gone), n: s.players.length });
  await page.evaluate(() => bombApi().reset()); await sleep(500);

  // ===== 9) «لاعب متأخر» =====
  await page.evaluate(() => bombApi().settings({ times: '40,40,40' }));
  for (const v of ['l_a', 'l_b', 'l_c']) await say(v, 'دخول');
  await sleep(900);
  await page.evaluate(() => bombApi().start()); await sleep(900);
  const lb = await page.evaluate(() => { const d = document.querySelector('#pg-bomb iframe').contentDocument; const b = d.getElementById('b3d-bLate'); return { btn: !!b, text: b && b.textContent, siteBtns: document.querySelectorAll('#lj-btn').length }; });
  check('زر «لاعب متأخر» موجود بلوحة اللعبة (واحد فقط، بدون زر مكرر من الموقع)', lb.btn && /لاعب متأخر/.test(lb.text) && lb.siteBtns === 0, lb);
  await say('l_early', 'دخول'); await sleep(700);
  check('قبل التفعيل: كاتب الكلمة وسط الجولة لا يدخل', !(await st(page)).players.some((p) => p.id === 'tiktok:l_early'));
  await page.evaluate(() => document.querySelector('#pg-bomb iframe').contentDocument.getElementById('b3d-bLate').click()); await sleep(600);
  const m = await page.evaluate(() => { const mo = document.getElementById('lj-modal'); if (!mo || mo.hidden) return null; const c = mo.querySelector('.lj-card').getBoundingClientRect(); return { title: mo.querySelector('#lj-title').textContent, text: mo.querySelector('.lj-text').textContent, kw: mo.querySelector('#lj-kw').textContent, status: mo.querySelector('#lj-status').dataset.s, w: Math.round(c.width), h: Math.round(c.height), toggle: mo.querySelector('#lj-toggle').textContent }; });
  check('الزر يفتح نافذة «لاعب متأخر» الموحّدة: النص والكلمة الفعلية ومربعة وحالة الاستقبال مفعّل', m && m.title === 'لاعب متأخر' && /فاتتك بداية الجولة/.test(m.text) && m.kw === 'دخول' && m.status === 'on' && Math.abs(m.w - m.h) <= 2 && /إيقاف/.test(m.toggle), m);
  check('فتح النافذة فعّل الانضمام المتأخر باللعبة نفسها', (await st(page)).lateMode === true);
  await page.evaluate(() => __lateJoin.close()); await sleep(350);
  check('إغلاق النافذة لا يوقف الاستقبال', (await st(page)).lateMode === true);
  await say('l_late1', 'دخول');
  const joined = await waitFor(page, () => bombApi().getState().players.some((p) => p.id === 'tiktok:l_late1'), null, 6000);
  s = await st(page);
  const lp = s.players.find((p) => p.id === 'tiktok:l_late1');
  check('المتأخر ينضم وسط الجولة برقم جديد وبعلامة late', joined && lp && lp.late === true && lp.num === 4, lp);
  const lj = await page.evaluate(() => { __lateJoin.tick(); const x = __lateJoin.state('bomb'); return { count: x.count, notify: (document.getElementById('lj-notify') || {}).innerText }; });
  await waitFor(page, () => { const n = document.getElementById('lj-notify'); return !!(n && n.classList.contains('lj-in')); }, null, 4000);
  const note = await page.evaluate(() => (document.getElementById('lj-notify') || {}).innerText || '');
  check('عدّاد المتأخرين = ١ وإشعار «انضم لاعب جديد!» مع الاسم', lj.count === 1 && /انضم لاعب جديد/.test(note) && /l_late1/.test(note), { count: lj.count, note: note.replace(/\s+/g, ' ') });
  for (let k = 0; k < 6; k++) await say('l_late1', 'دخول'); await say('l_late1', 'دخول', { nickname: 'اسم_جديد' }); await sleep(900);
  s = await st(page);
  check('تكرار الكلمة ×٧ مع تغيير الاسم لا يكرر اللاعب', s.players.filter((p) => p.id === 'tiktok:l_late1').length === 1 && s.players.length === 4, { n: s.players.length });
  // يستلم القنبلة بالرقم
  const curH = await holderViewer(page);
  await say(curH, '4'); await sleep(700);
  check('المتأخر يستلم القنبلة بكتابة رقمه', (await holderViewer(page)) === 'l_late1', await holderViewer(page));
  // مطرود/مُقصى لا يرجع
  await page.evaluate(() => bombApi().kick('tiktok:l_c'));
  await say('l_c', 'دخول'); await sleep(700);
  check('المطرود لا يعود بالكلمة المتأخرة', !(await st(page)).players.some((p) => p.id === 'tiktok:l_c'));
  // إيقاف الاستقبال
  await page.evaluate(() => { __lateJoin.open(); document.getElementById('lj-toggle').click(); }); await sleep(400);
  check('«إيقاف الاستقبال» يقفل الانضمام المتأخر باللعبة فعلياً', (await st(page)).lateMode === false);
  await say('l_late2', 'دخول'); await sleep(900);
  check('بعد الإيقاف: مشاهد جديد لا يدخل', !(await st(page)).players.some((p) => p.id === 'tiktok:l_late2'));
  await page.evaluate(() => { document.getElementById('lj-toggle').click(); __lateJoin.close(); }); await sleep(400);
  await say('l_late2', 'دخول');
  check('إعادة التشغيل: يدخل نفس الشخص', await waitFor(page, () => bombApi().getState().players.some((p) => p.id === 'tiktok:l_late2'), null, 6000));
  // دفعة متأخرين
  await ctl({ cmd: 'burst', count: 30, prefix: 'l_burst', text: 'دخول', perMs: 5 }); await sleep(2500);
  await ctl({ cmd: 'burst', count: 30, prefix: 'l_burst', text: 'دخول', perMs: 0 }); await sleep(1500);
  s = await st(page);
  const bn = s.players.filter((p) => /l_burst/.test(p.id)); const bnums = s.players.map((p) => p.num);
  check('دفعة ٣٠ متأخراً (مع تكرارهم): كلهم مرة وحدة وأرقام فريدة', bn.length === 30 && new Set(bnums).size === bnums.length, { burst: bn.length, total: s.players.length });
  const cnt = await page.evaluate(() => { __lateJoin.tick(); return __lateJoin.state('bomb').count; });
  check('عدّاد المنصة يطابق عدد من دخلوا متأخرين (٣٢)', cnt === 32, cnt);

  // ===== 10) جولة جديدة تصفّر الأهلية، والخروج وإعادة التشغيل =====
  await page.evaluate(() => bombApi().reset()); await sleep(500);
  const cnt0 = await page.evaluate(() => { __lateJoin.tick(); return __lateJoin.state('bomb').count; });
  check('جولة جديدة/ريست: عدّاد المتأخرين يتصفّر', cnt0 === 0, cnt0);
  await page.evaluate(() => bomb3dGoHome()); await sleep(600);
  const leave = await page.evaluate(() => ({ pg: document.querySelector('.page.active').id, listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate').length, frame: document.getElementById('bomb-frame').getAttribute('src') }));
  check('الخروج: الرئيسية، لا معالجات متبقية، والإطار فارغ', leave.pg === 'pg-home' && leave.listeners === 0 && /about:blank/.test(leave.frame || ''), leave);
  await page.evaluate(() => { goSetupBomb(); document.getElementById('bomb-kw').value = 'ادخل'; launchBomb(); });
  const again = await waitFor(page, () => { try { return bombApi().getState().screen === 'waiting' && bombApi().settings().keyword === 'ادخل'; } catch (e) { return false; } }, null, 60000);
  await say('z_1', 'ادخل'); await say('z_2', 'ادخل'); await sleep(900);
  const second = await page.evaluate(() => ({ n: bombApi().getState().players.length, listeners: Object.keys(homeGameListeners).filter((t) => t !== 'bridge-fate').join(), lj: document.querySelectorAll('#lj-btn').length }));
  check('إعادة التشغيل بعد الخروج: تعمل بكلمة جديدة ومعالج واحد بلا تكرار', again && second.n === 2 && second.listeners === 'bomb', second);

  check('بدون أخطاء JavaScript بالصفحة أو الإطار', page._errors.length === 0 && consoleErr.length === 0, { page: page._errors.slice(0, 3), console: consoleErr.slice(0, 3) });

  const pass = results.filter((x) => x.ok).length;
  console.log('\nRESULT ' + pass + '/' + results.length);
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
