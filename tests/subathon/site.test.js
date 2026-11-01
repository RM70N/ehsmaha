'use strict';
// السابثون على الموقع الحقيقي + جسر وهمي: الأزرار، التفعيل، الأوامر الحية، الصلاحيات، الاستعادة.
const H = require('../bridge/harness');
const res = []; const check = (n, ok, d) => { res.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 400) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const U = 'sbstreamer';
(async () => {
  await H.serveSite(); const b = await H.launchBrowser(); const page = await H.newPage(b, { query: '?debug=0' });
  await page.setViewportSize({ width: 1280, height: 800 }); await sleep(2500);
  const say = async (viewer, text) => { await H.ctl(H.PRIMARY, { cmd: 'chat', user: U, viewer, text, identity: { isFollowerOfAnchor: true } }); await sleep(450); };
  const ev = (f, a) => page.evaluate(f, a);
  // الأزرار
  const nav = await ev(() => ({ top: document.getElementById('topnav-tab-subathon') && document.getElementById('topnav-tab-subathon').innerText.trim(), home: document.getElementById('home-subathon-btn') && document.getElementById('home-subathon-btn').innerText.trim(), old: /سباق الأكواد/.test(document.getElementById('topnav').innerText + document.getElementById('pg-home').innerText), svg: !!document.querySelector('#home-subathon-btn svg') }));
  check('زرّا «السابثون» يستبدلان «سباق الأكواد» (مع أيقونة SVG)', nav.top === 'السابثون' && nav.home === 'السابثون' && !nav.old && nav.svg, nav);
  check('ملفات سباق الأكواد باقية', (await ev(() => typeof openCodeRace === 'function')));
  await ev(() => document.getElementById('home-subathon-btn').click()); await sleep(600);
  check('فتح الصفحة والمقدمة السينمائية قابلة للتخطي', await ev(() => document.getElementById('pg-subathon').classList.contains('active') && !!document.querySelector('#subathon-intro .skip')));
  await ev(() => document.querySelector('#subathon-intro .skip').click()); await sleep(700);
  check('لا حالة «متصل» وهمية قبل الربط + زر التفعيل لا يفعّل', await ev(() => { const l = document.getElementById('sb-conn-label').innerText; Subathon.activate(); return /لا يوجد بث/.test(l) && !Subathon._session().active; }));
  // ربط حقيقي عبر الجسر الوهمي
  await H.linkAccount(page, U); await sleep(800);
  await ev(() => Subathon.render()); await sleep(200);
  check('بعد الربط: الحالة الفعلية من الجسر (متصل)', await ev(() => /متصل/.test(document.getElementById('sb-conn-label').innerText)), await ev(() => document.getElementById('sb-conn-label').innerText));
  check('لا تفعيل بدون متحكم متحقق', await ev(() => { Subathon.activate(); return !Subathon._session().active; }));
  // مشاهد يظهر في الشات ثم يُضاف من القائمة المتعرف عليها
  await say('ali_v', 'مرحبا');
  await ev(() => { document.getElementById('sb-add').click(); }); await sleep(200);
  check('المشاهد المرصود من الشات يظهر في القائمة', await ev(() => !!document.querySelector('#subathon-modal .viewer')));
  await ev(() => { document.querySelector('#subathon-modal .viewer').click(); document.querySelector('input[name=sbm-lv][value="2"]').checked = true; document.getElementById('sbm-ok').click(); }); await sleep(200);
  // متحكم يدوي لم يظهر بعد = بانتظار التحقق
  await ev(() => { Subathon._store().add({ platform: 'tiktok', username: 'ghost_v', level: 1, verified: false }); Subathon.render(); });
  check('المتحكم المختار من الشات متحقق، واليدوي بانتظار التحقق', await ev(() => { const l = Subathon._store().list(); return l.length === 2 && l[0].verified && !l[1].verified; }));
  const act = await ev(() => Subathon.activate()); await sleep(300); await ev(() => { const h = document.querySelector('#subathon-handoff .skip'); if (h) h.click(); }); await sleep(400);
  check('التفعيل ناجح والـHUD ظاهر وزر الاستعادة موجود', act.ok && await ev(() => document.getElementById('subathon-hud').classList.contains('on') && !!document.getElementById('sbh-restore')), act);
  check('بعد التسليم ينتقل الموقع للرئيسية', await ev(() => document.getElementById('pg-home').classList.contains('active')));
  // أوامر
  await say('rando', 'تحت');
  check('مشاهد عادي لا يؤثر', await ev(() => !Subathon._session().metrics.accepted));
  await ev(() => Subathon._session().submit({ platform: 'tiktok', uniqueId: 'ghost_v', text: 'تحت' }));
  check('متحكم غير متحقق مرفوض في البوابة', await ev(() => Subathon._session().metrics.reasons.unverified >= 1));
  await say('ghost_v', 'تحت');
  check('تعليق التحقق الأول يوثّق الهوية ولا يُنفَّذ كأمر', await ev(() => Subathon._store().get('tiktok:ghost_v').verified && Subathon._session().metrics.accepted === 0));
  await say('ali_v', 'تحت'); await say('ali_v', 'اضغط'); 
  const st1 = await ev(() => ({ stats: Subathon._session().stats(), ptr: !!document.querySelector('#subathon-pointer.on') }));
  check('«تحت» يحرّك المؤشر، «اضغط» ينفّذ فعلياً', st1.stats.ok >= 2, st1);
  await say('ali_v', 'ابدأ اللعبة');
  check('المستوى ٢ لا يتجاوز: ابدأ في الرئيسية يفشل بسبب «لا لعبة» لا بسبب الصلاحية', await ev(() => !Subathon._session().metrics.reasons.level));
  await ev(() => Subathon._store().setLevel('tiktok:ali_v', 1)); await say('ali_v', 'ابدأ اللعبة');
  check('تخفيض الصلاحية إلى ١ يرفض ابدأ', await ev(() => Subathon._session().metrics.reasons.level >= 1));
  await ev(() => Subathon._store().setLevel('tiktok:ali_v', 2));
  // فتح لعبة بالاسم
  await say('ali_v', 'افتح الروليت');
  const op = await ev(() => ({ page: document.querySelector('.page.active').id, game: SubathonEngine.openedGame(), res: Subathon._session().audit.slice(-3).map((e) => e.status + ':' + (e.detail || e.reason || '')) }));
  check('«افتح الروليت» يفتح صفحة إعداد اللعبة فعلاً', /setup/.test(op.page), op);
  await say('ali_v', 'رجوع'); await say('ali_v', 'الألعاب');
  check('رجوع/الألعاب يعيدان للرئيسية', await ev(() => document.getElementById('pg-home').classList.contains('active')), await ev(() => document.querySelector('.page.active').id));
  // استعادة
  await ev(() => document.getElementById('sbh-restore').click()); await sleep(200);
  await say('ali_v', 'فوق');
  check('استعادة التحكم: لا تنفيذ بعدها والـHUD يختفي', await ev(() => { const s = Subathon._session(); return !s.active && !document.getElementById('subathon-hud').classList.contains('on'); }));
  // مظهر
  await page.setViewportSize({ width: 390, height: 800 }); await ev(() => show('subathon')); await sleep(300);
  check('الجوال: لا تمرير أفقي', await ev(() => document.documentElement.scrollWidth <= innerWidth + 2), await ev(() => [document.documentElement.scrollWidth, innerWidth]));
  console.log(res.filter(Boolean).length + '/' + res.length + ' passed'); await b.close(); process.exit(res.every(Boolean) ? 0 : 1);
})().catch((e) => { console.log('FATAL', e.message); process.exit(2); });
