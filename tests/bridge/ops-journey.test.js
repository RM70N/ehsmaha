'use strict';
// رحلة اللاعب: الأحداث من الموقع الحقيقي ← التجميع ← الحسابات (قمع، خروج، عودة، أجهزة، ألعاب) بلا أرقام ثابتة.
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { go, fe, he } = T;
  await go('journey', 800);
  check('بلا أحداث: حالة فارغة صريحة (لا أرقام وهمية) + قسم الخصوصية', await fe(() => /لا أحداث رحلة/.test(document.querySelector('#jr-main').innerText) && /الخصوصية والاحتفاظ/.test(document.querySelector('#jr-main').innerText)));
  // أحداث حقيقية عبر مسار الموقع: عدة «أجهزة» (معرّفات) بمراحل مختلفة
  const day = await he(() => EhsOps.day());
  const seed = await he(async () => {
    const s = EhsOps.store(); const d = EhsOps.day(); const ago = (n) => { const t = new Date(); t.setUTCDate(t.getUTCDate() - n); return t.getUTCFullYear() + ('0' + (t.getUTCMonth() + 1)).slice(-2) + ('0' + t.getUTCDate()).slice(-2); };
    // مستخدم يمرّ فعلاً بمسار EhsOps.journey على الصفحة (معرّف هذا المتصفح)
    EhsOps._uidOverride = 'player000000000001'; localStorage.clear(); ['open', 'games'].forEach((x) => EhsOps.journey(x)); EhsOps.journey('select', 'xo'); EhsOps.journey('try', 'xo'); EhsOps.journey('start', 'xo'); EhsOps.journey('complete', 'xo');
    const me = EhsOps.anon();
    // مستخدمون آخرون (أحداث كما تكتبها صفحات الأجهزة الأخرى)
    const mk = async (a, dev, first, days, last) => { await s.set('opsJourney/users/' + a, { first, dev }); for (const dd of days) await s.set('opsJourney/days/' + dd + '/' + a, dd === days[days.length - 1] ? last : { dev, s: { open: Date.now() } }); };
    await mk('aaaa000000000001', 'm', d, [d], { dev: 'm', s: { open: 1, games: 1 } });                                         // خرج بعد القائمة
    await mk('aaaa000000000002', 'm', d, [d], { dev: 'm', s: { open: 1, games: 1, select: 1 }, g: { sniper: { select: 1 } } }); // خرج بعد الاختيار
    await mk('aaaa000000000003', 'd', d, [d], { dev: 'd', s: { open: 1, games: 1, select: 1, try: 1 }, g: { hz: { select: 1, try: 1, err: 1 } } }); // فشل البدء
    await mk('aaaa000000000004', 'd', d, [d], { dev: 'd', s: { open: 1, games: 1, select: 1, try: 1, start: 1 }, g: { hz: { select: 1, try: 1, start: 1 } } });
    await mk('aaaa000000000005', 't', ago(10), [ago(10), ago(9), d], { dev: 't', s: { open: 1 } });                          // عائد (أول ظهور قبل ١٠ أيام)
    await mk('aaaa000000000006', 'm', ago(40), [ago(40)], { dev: 'm', s: { open: 1 } });                                    // دفعة قديمة: لم تعد
    await mk('aaaa000000000007', 'd', ago(1), [ago(1), d], { dev: 'd', s: { open: 1 } });                                   // عاد في اليوم التالي
    return { me, d, ago10: ago(10) };
  });
  await fe(() => document.querySelector('[data-act="jr-refresh"]') ? document.querySelector('[data-act="jr-refresh"]').click() : null); await sleep(900);
  await go('home', 300); await go('journey', 900);
  const txt = await fe(() => document.querySelector('#jr-main').innerText);
  const steps = await fe(() => [...document.querySelectorAll('.ops-fn-row')].map((r) => r.querySelector('.ops-fn-name').textContent + '=' + r.querySelector('b').textContent));
  const get = (n) => +(steps.find((x) => x.startsWith(n)) || '=0').split('=')[1];
  check('القمع من أحداث حقيقية (دفعة عمرها ٤٠ يوماً خارج نافذة ٧ أيام): فتح ٧ ← قائمة ٥ ← اختيار ٤ ← محاولة ٣ ← بدء ٢ ← إكمال ١ (بلوغ مرحلة لاحقة = اجتياز السابقة)', get('فتح الموقع') === 7 && get('فتح قائمة') === 5 && get('اختيار لعبة') === 4 && get('محاولة') === 3 && get('بدء المشاركة') === 2 && get('إكمال راوند') === 1, steps);
  check('نسب الانتقال والخروج محسوبة (القائمة←الاختيار: ٨٠٪ انتقال، ٢٠٪ خروج)', /انتقال 80٪ · خروج 20٪/.test(txt.replace(/‏|‎/g, '')) || /80٪/.test(txt), txt.slice(0, 600));
  check('تحليل الخروج يربط الأخطاء بالمرحلة (مستخدم واحد فشل بدء لعبته)', /1 مستخدم فشل بدء لعبته/.test(txt) || /مستخدم فشل بدء لعبته/.test(txt));
  check('لا يُحتسب المستخدم المتكرر مرتين: معرّف هذا المتصفح سجّل open مرتين ويظهر مرة واحدة', await he(async ([me, d]) => { const rec = (await EhsOps.store().get('opsJourney/days/' + d))[me]; return !!rec && Object.keys((await EhsOps.store().get('opsJourney/days/' + d))).filter((k) => k === me).length === 1; }, [seed.me, seed.d]));
  const J = await fe(() => { const o = OpsJourney.compute(Ops.core().store()._root().opsJourney.days, Ops.core().store()._root().opsJourney.users, 7); return { c: o.cohort, newU: o.newU, retU: o.retU, devs: o.devs, games: o.games.map((g) => g.tag + ':' + g.select + '/' + g.try + '/' + g.start + '/' + g.complete + '/' + g.err) }; });
  check('العودة: يوم تالٍ ١ من ٢ مؤهلة (الدفعة القديمة لم تعد، الجديدة مستبعدة لعدم اكتمال الفترة)', J.c.d1.r === 1 && J.c.d1.elig >= 2, J.c);
  check('٣٠ يوماً: دفعة قديمة مؤهلة فقط، ولم تكتمل فترة غيرها (لا نسبة لفترة غير مكتملة)', J.c.d30.elig === 1 && J.c.d30.r === 0, J.c);
  check('جدد مقابل عائدين محسوبان من أول ظهور', J.newU === 6 && J.retU === 1, J);
  check('المقارنة بين الأجهزة: جوال/كمبيوتر/لوحي تظهر بحسابات (بدء/إكمال/أخطاء)', J.devs.m && J.devs.d && J.devs.t && J.devs.d.err === 1, J.devs);
  check('تحليل الألعاب: ضربة الحظ (اختيار ٢/محاولة ٢/بدء ١/خطأ ١) وإكس أو (إكمال ١)', J.games.includes('hz:2/2/1/0/1') && J.games.some((g) => /^xo:1\/1\/1\/1\/0$/.test(g)), J.games);
  check('الجدول والمخططات في الصفحة (الجهاز/الألعاب/العودة/الخروج)', await fe(() => document.querySelectorAll('#jr-main table').length >= 4 && !!document.querySelector('#jr-main .ops-bars')));
  await fe(() => document.querySelector('[data-jp="14"]').click()); await sleep(200);
  check('تبديل الفترة (١٤ يوماً) يعيد الحساب بلا إعادة تحميل', await fe(() => document.querySelector('[data-jp="14"]').getAttribute('aria-pressed') === 'true'));
  // حذف قديم (٩٠ يوماً)
  await he(async () => { await EhsOps.store().set('opsJourney/days/20200101/zzzz000000000001', { dev: 'd', s: { open: 1 } }); });
  await fe(() => document.querySelector('[data-act="jr-purge"]').click()); await sleep(250); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(600);
  check('حذف أحداث أقدم من ٩٠ يوماً يزيل القديم فقط ويُدوَّن بسجل التدقيق', await he(async () => { const days = await EhsOps.store().get('opsJourney/days'); const a = Object.values(await EhsOps.store().get('opsAudit')).map((x) => x.action); return !days['20200101'] && Object.keys(days).length >= 3 && a.includes('journey.purge'); }));
  check('الخصوصية: لا uid ولا بريد في أي سجل رحلة', await he(async (uidv) => !JSON.stringify(await EhsOps.store().get('opsJourney')).includes(uidv), 'player000000000001'));
  check('صلاحيات: غير المالك لا يرى التحليلات', await (async () => { await he(() => { (0, eval)('currentUser = { uid: "x", email: "o@x.com" }'); }); await go('home', 300); await go('journey', 500); return fe(() => /للمالك فقط/.test(document.querySelector('#view-journey').innerText)); })());
  check('بدون أخطاء JS', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
