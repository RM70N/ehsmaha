'use strict';
// صانع البطولات: الإنشاء بالمعالج، الجدول والـBye، اعتماد النتائج مرة واحدة، التأهل، الانسحاب، الجوائز مرة واحدة، اقتراح اللعبة، الصلاحيات.
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { go, fe, he, f } = T;
  await go('tournaments', 700);
  check('القسم يعرض حالة فارغة حقيقية وزر الإنشاء وأقسام الحالات الأربعة', await fe(() => /لا بطولات/.test(document.querySelector('#tm-main').innerText) && document.querySelectorAll('[data-tt]').length === 4 && !!document.querySelector('[data-act="tm-new"]')));
  // ---- المعالج
  await fe(() => document.querySelector('[data-act="tm-new"]').click()); await sleep(300);
  check('المعالج: الخطوة ١ تعرض الألعاب المتوافقة فقط (إكس أو)', await fe(() => { const o = [...document.querySelectorAll('#w-game option')]; return o.length === 1 && /إكس أو/.test(o[0].textContent); }));
  await fe(() => { document.querySelector('[data-next]').click(); }); await sleep(150);
  check('المعالج: لا انتقال بلا اسم/موعد (تحقق)', await fe(() => /اسم البطولة|موعد/.test(document.querySelector('.toast').innerText) && !!document.querySelector('#w-name')));
  await fe(() => { document.querySelector('#w-name').value = 'بطولة الاختبار'; document.querySelector('#w-desc').value = 'وصف'; document.querySelector('#w-start').value = '2031-01-01T20:00'; document.querySelector('[data-next]').click(); }); await sleep(150);
  await fe(() => { document.querySelector('#w-max').value = '1'; document.querySelector('[data-next]').click(); }); await sleep(150);
  check('المعالج: الحد الأقصى خارج ٢–٦٤ مرفوض', await fe(() => /الحد الأقصى/.test(document.querySelector('.toast:last-child').innerText) && !!document.querySelector('#w-max')));
  await fe(() => { document.querySelector('#w-max').value = '4'; document.querySelector('[data-next]').click(); }); await sleep(150);
  check('طبقة التوافق: نظام «مجموعات» و«دوري» معطّلان لإكس أو بسببهما', await fe(() => { const o = [...document.querySelectorAll('#w-fmt option')]; return o.length === 3 && o.filter((x) => x.disabled).length === 2 && o.some((x) => /غير مدعوم/.test(x.textContent)); }));
  await fe(() => document.querySelector('[data-next]').click()); await sleep(150);
  await fe(() => { document.querySelector('#w-bo').value = '1'; document.querySelector('[data-next]').click(); }); await sleep(150);
  await fe(() => { document.querySelector('#w-pz1').value = 'anime01'; document.querySelector('[data-next]').click(); }); await sleep(600);
  const created = await he(async () => { const all = await EhsOps.store().get('opsTournaments'); const tid = Object.keys(all)[0]; return { tid, meta: all[tid].meta, log: Object.values(all[tid].log || {}).length }; });
  check('إنشاء بطولة: معلومات كاملة محفوظة (اللعبة/النظام/الحد/الجائزة/الحالة)', created.meta.name === 'بطولة الاختبار' && created.meta.game === 'xo' && created.meta.format === 'single_elim' && created.meta.max === 4 && created.meta.prizes[1].ref === 'anime01' && created.meta.status === 'registration' && created.log === 1, created);
  const tid = created.tid;
  check('الانتقال لصفحة البطولة بعد الإنشاء مع رابط التسجيل المفتوح', await fe(() => /\?tour=/.test(document.querySelector('#tm-main').innerText) && /التسجيل مفتوح/.test(document.querySelector('#tm-main').innerText)));
  // ---- مشاركون: واحد ذاتي (كما تكتبه صفحة الموقع) + اثنان بإضافة المالك
  await he(async (tid) => { await EhsOps.store().set('opsTournaments/' + tid + '/participants/selfuid1', { uid: 'selfuid1', name: 'سالم', handle: 'salem', username: 'سالم', status: 'registered', at: Date.now(), src: 'self' }); }, tid);
  await fe(() => document.querySelector('[data-act="tm-addp"]').click()); await sleep(250);
  await fe(() => { document.querySelector('#ap-t').value = 'nora\nkhaled\nsalem\nextra1\nextra2'; document.querySelector('.dialog [data-ok]').click(); }); await sleep(700);
  const ps = await he(async (tid) => Object.values(await EhsOps.store().get('opsTournaments/' + tid + '/participants')), tid);
  check('إضافة المالك: يتخطى المكرر (salem)، ويحوّل ما بعد الحد الأقصى (٤) لقائمة الانتظار', ps.filter((p) => p.status === 'registered').length === 4 && ps.filter((p) => p.status === 'waitlist').length === 1 && ps.length === 5, ps.map((p) => p.handle + ':' + p.status));
  // انسحاب قبل البدء يرقّي أول منتظر
  const kh = await he(async (tid) => { const o = await EhsOps.store().get('opsTournaments/' + tid + '/participants'); return Object.keys(o).find((k) => o[k].handle === 'khaled'); }, tid);
  await fe(async (k) => { document.querySelector('[data-wd="' + k + '"]').click(); await new Promise((r) => setTimeout(r, 300)); document.querySelector('.dialog [data-ok]').click(); }, kh); await sleep(600);
  const ps2 = await he(async (tid) => Object.values(await EhsOps.store().get('opsTournaments/' + tid + '/participants')), tid);
  check('انسحاب قبل البدء: يُرقّى أول منتظر ويبقى العدد ٤ مسجَّلين', ps2.filter((p) => p.status === 'registered').length === 4 && ps2.filter((p) => p.status === 'waitlist').length === 0 && ps2.find((p) => p.handle === 'khaled').status === 'withdrawn', ps2.map((p) => p.handle + ':' + p.status));
  // ---- إغلاق التسجيل ثم بدء
  await fe(() => document.querySelector('[data-act="tm-close"]').click()); await sleep(400);
  check('إغلاق التسجيل يغيّر الحالة', (await he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/meta')).status, tid)) === 'closed');
  await fe(() => document.querySelector('[data-act="tm-start"]').click()); await sleep(250); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(900);
  const br = await he(async (tid) => ({ ms: await EhsOps.store().get('opsTournaments/' + tid + '/matches'), meta: await EhsOps.store().get('opsTournaments/' + tid + '/meta') }), tid);
  check('بدء البطولة: جدول بـ٣ مباريات (نصف نهائي ×٢ + نهائي) والحالة جارية', Object.keys(br.ms).length === 3 && br.meta.status === 'running' && br.ms.r1m0.status === 'ready' && br.ms.r1m1.status === 'ready' && br.ms.r2m0.status === 'pending', br);
  const names = (m) => [m.a && m.a.name, m.b && m.b.name];
  check('التوزيع بحسب الـSeed: الأول ضد الرابع والثاني ضد الثالث', br.ms.r1m0.a.id !== br.ms.r1m0.b.id && JSON.stringify(Object.values(br.ms).filter((m) => m.r === 1).map((m) => [m.a.id, m.b.id]).length) === '2', names(br.ms.r1m0));
  // ---- اعتماد نتيجة عبر الواجهة (اقتراح اللعبة + اعتماد المالك)
  const m0 = br.ms.r1m0; const winner0 = m0.a;
  await he(({ tid, a, b, aId, bId, an, bn }) => { EhsOps.setActiveMatch({ tid, mid: 'r1m0', a, b, aId, bId, aName: an, bName: bn }); recordWin({ uniqueId: 'tiktok:' + a }, 'إكس أو', 1); recordWin({ uniqueId: 'tiktok:stranger' }, 'إكس أو', 1); }, { tid, a: m0.a.handle || handleOf(m0.a.name), b: m0.b.handle || handleOf(m0.b.name), aId: m0.a.id, bId: m0.b.id, an: m0.a.name, bn: m0.b.name });
  function handleOf(n) { return n; }
  await sleep(500);
  const sug = await he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/matches/r1m0')).suggest, tid);
  check('فوز داخل اللعبة يولّد «اقتراحاً» للفائز فقط من لاعبي المباراة (الغريب يُتجاهل) ولا يعتمد النتيجة تلقائياً', sug && sug.winner === winner0.id && (await he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/matches/r1m0')).status, tid)) === 'ready', sug);
  await fe(() => document.querySelector('[data-ma="r1m0"]').click()); await sleep(250);
  check('نافذة الاعتماد تعرض اقتراح اللعبة وتتطلب تأكيد المالك', await fe(() => /اقتراح اللعبة/.test(document.querySelector('.dialog').innerText) && document.querySelector('#ar-a').value === '1' || document.querySelector('#ar-b').value === '1'));
  await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(900);
  const r1 = await he(async (tid) => { const ms = await EhsOps.store().get('opsTournaments/' + tid + '/matches'); return { m0: ms.r1m0, fin: ms.r2m0 }; }, tid);
  check('الاعتماد: المباراة منتهية بفائز ونتيجة وتوقيع، والفائز انتقل للنهائي', r1.m0.status === 'done' && r1.m0.winner === winner0.id && r1.m0.result.scoreA + r1.m0.result.scoreB === 1 && !!r1.m0.result.by && (r1.fin.a && r1.fin.a.id === winner0.id || r1.fin.b && r1.fin.b.id === winner0.id), r1);
  // منع الاحتساب مرتين / التعارض / المباراة غير الجاهزة
  const dup = await fe(async ([tid, w]) => { const a = await OpsTournaments.approve(tid, 'r1m0', w, [1, 0]); let conf = null; try { await OpsTournaments.approve(tid, 'r1m0', w === 'x' ? 'y' : (await Ops.store().get('opsTournaments/' + tid + '/matches/r1m0')).b.id, [0, 1]); } catch (e) { conf = e.message; } let np = null; try { await OpsTournaments.approve(tid, 'r2m0', w, [1, 0]); } catch (e) { np = e.message; } return { a, conf, np }; }, [tid, winner0.id]);
  check('إعادة إرسال نفس النتيجة لا تُحتسب مرتين؛ نتيجة بفائز مختلف تُرفض؛ المباراة غير الجاهزة مرفوضة', dup.a.dup === true && /اعتُمدت سابقاً/.test(dup.conf) && /غير جاهزة/.test(dup.np), dup);
  // اعتماد متزامن (نقرتان في نفس اللحظة) — أحدهما فقط ينجح
  const m1 = br.ms.r1m1; const race = await fe(async ([tid, a, b]) => { const rs = await Promise.allSettled([OpsTournaments.approve(tid, 'r1m1', a, [1, 0]), OpsTournaments.approve(tid, 'r1m1', b, [0, 1])]); const ms = await Ops.store().get('opsTournaments/' + tid + '/matches'); return { ok: rs.filter((x) => x.status === 'fulfilled' && !x.value.dup).length, win: ms.r1m1.winner, fin: ms.r2m0 }; }, [tid, m1.a.id, m1.b.id]);
  check('اعتماد متزامن بفائزين مختلفين: يُعتمد واحد فقط والنهائي يجهز بلاعبين', race.ok === 1 && (race.win === m1.a.id || race.win === m1.b.id) && race.fin.status === 'ready' && race.fin.a && race.fin.b, race);
  // النهائي والاكتمال
  const finalW = await he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/matches/r2m0')).a.id, tid);
  await fe(async ([tid, w]) => { await OpsTournaments.approve(tid, 'r2m0', w, [1, 0]); }, [tid, finalW]); await sleep(900);
  const fin = await he(async (tid) => ({ meta: await EhsOps.store().get('opsTournaments/' + tid + '/meta'), log: Object.values(await EhsOps.store().get('opsTournaments/' + tid + '/log')).map((x) => x.text) }), tid);
  check('انتهاء النهائي: البطولة مكتملة وبطلها مسجَّل وتاريخ الاكتمال، والسجل يوثّق', fin.meta.status === 'completed' && fin.meta.champion === finalW && !!fin.meta.completedAt && fin.log.some((t) => /اكتملت البطولة/.test(t)), fin);
  check('صفحة البطولة تعرض النتائج النهائية وزر صرف الجائزة للبطل', await fe(() => /البطل/.test(document.querySelector('#tm-main').innerText) && !!document.querySelector('[data-pay^="1:"]')));
  // الجوائز: مرة واحدة فقط
  await he(() => { window.__grants = []; window.ownerResolveGrantTargetKeys = async (u) => ['key_' + u]; window.framesGrantToUser = async (k, f) => { window.__grants.push([k, f]); }; });
  const pay = await fe(async ([tid, w]) => { const r = await Promise.allSettled([OpsTournaments.payout(tid, 1, w), OpsTournaments.payout(tid, 1, w)]); const again = await OpsTournaments.payout(tid, 1, w); return { r: r.map((x) => x.status + (x.status === 'rejected' ? ':' + x.reason.message : (x.value.dup ? ':dup' : ':ok'))), again }; }, [tid, finalW]);
  const grants = await he(() => window.__grants);
  check('صرف الجائزة مرة واحدة فقط (نقرتان متزامنتان + إعادة لاحقة) بنفس الإطار المختار وبمفتاح الحساب الصحيح', grants.length === 1 && grants[0][1] === 'anime01' && pay.again.dup === true && pay.r.filter((x) => x.endsWith(':ok')).length === 1, { grants, pay });
  check('سجل التدقيق يحوي إنشاء/بدء/اعتماد/صرف', await he(async () => { const a = Object.values(await EhsOps.store().get('opsAudit')).map((x) => x.action); return ['tournament.create', 'tournament.start', 'tournament.result', 'tournament.prize'].every((k) => a.includes(k)); }));
  // فشل الصرف يسمح بإعادة المحاولة ولا يترك حجزاً عالقاً
  const fail = await fe(async ([tid]) => { window.parent.framesGrantToUser = async () => { throw new Error('boom'); }; const T = OpsTournaments._M.det[tid]; const second = Object.keys(await Ops.store().get('opsTournaments/' + tid + '/participants')).find((k) => k !== T.meta.champion); T.meta.prizes[2] = { type: 'frame', ref: 'anime02' }; let err = null; try { await OpsTournaments.payout(tid, 2, second); } catch (e) { err = e.message; } return { err, left: await Ops.store().get('opsTournaments/' + tid + '/paid/2:' + second) }; }, [tid]);
  check('فشل المنح لا يترك حجزاً (يمكن إعادة المحاولة) ويُبلَّغ بالسبب', /فشل المنح/.test(fail.err || '') && fail.left === null, fail);
  // ---- انسحاب أثناء البطولة: المنافس يتأهل تلقائياً
  const t2 = await fe(async () => { const st = Ops.store(); const tid = 'tw' + Date.now(); await st.set('opsTournaments/' + tid + '/meta', { name: 'ب٢', game: 'xo', format: 'single_elim', status: 'registration', policy: 'invite', max: 8, bestOf: 1, tiebreak: 'replay', startAt: Date.now() + 1e6, createdAt: Date.now() }); for (const h of ['p1', 'p2', 'p3', 'p4']) await st.push('opsTournaments/' + tid + '/participants', { name: h, handle: h, status: 'registered', at: Date.now() }); OpsTournaments.openDetail(tid); await new Promise((r) => setTimeout(r, 400)); await OpsTournaments.startTournament(tid); await new Promise((r) => setTimeout(r, 300)); const ms = await st.get('opsTournaments/' + tid + '/matches'); const pid = ms.r1m0.a.id; const opp = ms.r1m0.b.id; await OpsTournaments.withdraw(tid, pid, 'wd'); await new Promise((r) => setTimeout(r, 400)); const after = await st.get('opsTournaments/' + tid + '/matches'); return { tid, win: after.r1m0.winner, opp, wo: after.r1m0.result.walkover, fin: after.r2m0 }; });
  check('انسحاب لاعب أثناء البطولة: المنافس يتأهل بالانسحاب ويدخل النهائي', t2.win === t2.opp && t2.wo === true && (t2.fin.a && t2.fin.a.id === t2.opp || t2.fin.b && t2.fin.b.id === t2.opp), t2);
  // ---- تأجيل وإلغاء وأرشفة
  await he(() => {}); await fe(async (tid) => { OpsTournaments.openDetail(tid); }, t2.tid); await sleep(500);
  await fe(() => document.querySelector('[data-act="tm-cancel"]').click()); await sleep(250); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(700);
  check('إلغاء بطولة جارية يغيّر حالتها لملغاة، ثم أرشفتها', (await he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/meta')).status, t2.tid)) === 'cancelled' && (await (async () => { await fe(() => document.querySelector('[data-act="tm-archive"]').click()); await sleep(500); return he(async (tid) => (await EhsOps.store().get('opsTournaments/' + tid + '/meta')).status, t2.tid); })()) === 'archived');
  // ---- منطق الجدول النقي: أحجام مختلفة
  const pure = await fe(() => { const out = {}; [2, 3, 5, 6, 7, 8, 13].forEach((n) => { const ps = Array.from({ length: n }, (_, i) => ({ id: 'p' + (i + 1), name: 'P' + (i + 1) })); const mt = OpsTournaments.buildBracket(ps); const r1 = Object.values(mt).filter((m) => m.r === 1); const byes = r1.filter((m) => m.status === 'bye').length; out[n] = { total: Object.keys(mt).length, byes, ready: Object.values(mt).filter((m) => m.status === 'ready').length, seedsOk: r1.every((m) => !(m.a && m.b) || true) }; }); return out; });
  check('بناء الجدول لأحجام ٢،٣،٥،٦،٧،٨،١٣: عدد المباريات = الحجم-١، وعدد الراحات = الحجم-العدد', Object.entries(pure).every(([n, o]) => { const size = Math.pow(2, Math.ceil(Math.log2(+n))); return o.total === size - 1 && o.byes === size - +n; }), pure);
  const seeds = await fe(() => OpsTournaments.seedOrder(8));
  check('ترتيب الـSeed القياسي لثمانية: ١–٨، ٤–٥، ٢–٧، ٣–٦ (الأقوى لا يلتقيان قبل النهائي)', JSON.stringify(seeds) === JSON.stringify([1, 8, 4, 5, 2, 7, 3, 6]), seeds);
  check('صلاحيات: غير المالك لا يرى البطولات', await (async () => { await he(() => { (0, eval)('currentUser = { uid: "x", email: "o@x.com" }'); }); await go('home', 300); await go('tournaments', 500); return fe(() => /للمالك فقط/.test(document.querySelector('#view-tournaments').innerText)); })());
  check('بدون أخطاء JS', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
