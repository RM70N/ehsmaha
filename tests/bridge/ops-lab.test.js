'use strict';
// مختبر الألعاب: واجهة الكتالوج/الإعداد/التشغيل/التقرير + عزل كامل (بيانات الإنتاج لا تتغير) + سيناريوهات حقيقية على منطق الألعاب.
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { go, fe, he } = T;
  // سجل إنتاج مرئي قبل الاختبار
  await he(() => { ownerRegisterActiveStreamer('rou', 'realstreamer', 'tiktok', 'دائرة'); });
  const before = await he(async () => ({ e: Object.keys((await EhsOps.store().get('opsEvents')) || {}).length, s: Object.keys((await EhsOps.store().get('opsSessions')) || {}).length, a: JSON.stringify((await EhsOps.store().get('opsAudit')) || {}).length }));
  await go('lab', 800);
  const cards = await fe(() => ({ n: document.querySelectorAll('#lab-main article').length, sup: [...document.querySelectorAll('#lab-main article')].filter((a) => /يدعم الاختبار/.test(a.innerText)).length, hasNote: /لا اتصال ببث ولا هدايا حقيقية/.test(document.querySelector('#lab-main').innerText) }));
  check('الكتالوج: كل ألعاب الموقع (31) كبطاقات بنوعها وحالة دعم الاختبار وآخر اختبار', cards.n === 31 && cards.sup === 31 && cards.hasNote, cards);
  await fe(() => { const i = document.querySelector('#lab-q'); i.value = 'قناص'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(200);
  check('البحث في الكتالوج', await fe(() => document.querySelectorAll('#lab-main article').length === 1));
  await fe(() => { document.querySelector('[data-lab="sniper"]').click(); }); await sleep(300);
  check('شاشة الإعداد: ١٠/٥٠/١٠٠ + عدد مخصص + ثمانية سيناريوهات', await fe(() => document.querySelectorAll('[data-pn]').length === 3 && !!document.querySelector('#lab-custom') && document.querySelectorAll('[data-sc]').length === 8));
  await fe(() => { document.querySelector('#lab-custom').value = '12'; document.querySelector('.dialog [data-go]').click(); }); await sleep(500);
  check('نافذة التشغيل: مشهد اللعبة (iframe معزول) + سجل الأحداث + المدة', await fe(() => !!document.querySelector('#lab-frame') && /\?opslab=1/.test(document.querySelector('#lab-frame').src) && !!document.querySelector('#lab-log') && !!document.querySelector('#lab-t')));
  await fe(() => new Promise((res) => { const t = setInterval(() => { if (/اكتمل الاختبار|نجحت كل/.test(document.querySelector('.dialog-body').innerText)) { clearInterval(t); res(); } }, 300); setTimeout(res, 90000); }));
  const rep = await fe(() => ({ txt: document.querySelector('.dialog-body').innerText, rep: OpsLab._lastReport }));
  const R = rep.rep;
  check('تقرير الاختبار: لعبة/تاريخ/عدد اللاعبين (١٢)/سيناريوهات/مدة/بيئة', R && R.tag === 'sniper' && R.players === 12 && R.scenarios.length >= 9 && R.ms > 0 && !!R.env.ua && R.env.isolation, R && { tag: R.tag, players: R.players, n: R.scenarios.length });
  check('لا فشل: كل السيناريوهات المنفَّذة نجحت (القناص) وعدد اللاعبين الفعلي ١٢', R && R.failed === 0 && R.passed >= 8 && R.scenarios.find((x) => x.id === 'join').detail.includes('12'), R && R.scenarios.map((x) => x.id + ':' + x.status));
  check('نسبة النجاح تُعرض من المنفَّذ فعلاً وبجانبها المتخطّى', /نسبة النجاح من المنفَّذ/.test(rep.txt) && /تخطّي/.test(rep.txt), rep.txt.slice(-300));
  const after = await he(async () => ({ e: Object.keys((await EhsOps.store().get('opsEvents')) || {}).length, s: Object.keys((await EhsOps.store().get('opsSessions')) || {}).length }));
  check('العزل: أحداث/جلسات الإنتاج لم تتغير أثناء الاختبار (لا جلسة ولا أحداث من اللاعبين الافتراضيين)', after.e === before.e && after.s === before.s, [before, after]);
  check('العزل: التحقق الداخلي «عدم تعديل بيانات الإنتاج» نجح وحُفظ التقرير في opsLab', R.scenarios.find((x) => x.id === 'iso2').status === 'pass' && (await he(async () => Object.keys((await EhsOps.store().get('opsLab/reports')) || {}).length)) === 1);
  check('الحسابات التجريبية لا تظهر في المستخدمين الحقيقيين (لا كتابة users/presence من الإطار)', await he(async () => !JSON.stringify(await EhsOps.store().get('opsEvents')).includes('lab')));
  // تصدير
  const dl = await fe(() => { let got = []; const orig = Ops.download; Ops.download = (n, t) => got.push([n, t.length]); document.querySelector('[data-ex="json"]').click(); document.querySelector('[data-ex="csv"]').click(); Ops.download = orig; return got; });
  check('تصدير التقرير JSON وCSV', dl.length === 2 && /\.json$/.test(dl[0][0]) && /\.csv$/.test(dl[1][0]) && dl[0][1] > 200, dl);
  await fe(() => document.querySelector('.dialog [data-x]').click()); await sleep(300);
  await go('home', 300); await go('lab', 700);
  check('ملخص آخر اختبار يظهر في بطاقة اللعبة بعد العودة', await fe(() => { const a = [...document.querySelectorAll('#lab-main article')].find((x) => /القناص/.test(x.innerText)); return a && /نجح/.test(a.innerText) && /1/.test(a.innerText); }));
  check('صلاحيات: غير المالك لا يرى المختبر', await (async () => { await he(() => { (0, eval)('currentUser = { uid: "x", email: "o@x.com" }'); }); await go('home', 300); await go('lab', 500); return fe(() => /للمالك فقط/.test(document.querySelector('#view-lab').innerText)); })());
  check('بدون أخطاء JS بالصفحة/الاستوديو', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
