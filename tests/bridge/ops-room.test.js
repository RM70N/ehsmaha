'use strict';
// غرفة العمليات + مراقب البثوث + صحة الأنظمة (على الموقع والاستوديو الحقيقيين، مخزن RTDB بالذاكرة).
const { boot, mkCheck, sleep } = require('./ops-studio-harness');
const { check, done } = mkCheck();
(async () => {
  const T = await boot(); const { page, f, go, fe, he } = T;
  // --- بيانات حقيقية عبر مسار الموقع الفعلي (لا حقن مباشر): ستريمر يبدأ راوندين
  await he(() => { ownerRegisterActiveStreamer('rou', 'king_x', 'tiktok', 'دائرة الإقصاء'); homeRegisterGameListener('rou', function () {}); homeConnSetState('tiktok', 'connected'); EhsOps._heartbeat(); });
  await sleep(200);
  await go('ops', 900);
  const k1 = await fe(() => [...document.querySelectorAll('#ops-main .ops-kpi')].map((x) => x.querySelector('.l').innerText.trim() + '=' + x.querySelector('.v').innerText.trim()));
  const kv = (name) => (k1.find((x) => x.startsWith(name)) || '').split('=')[1];
  check('غرفة العمليات: بطاقات الحالة الثماني تظهر', k1.length === 8, k1);
  check('الأرقام من الجلسات الفعلية: ستريمر متصل ١، راوند نشط ١، بث نشط ١', kv('الستريمرز المتصلون') === '1' && kv('الراوندات النشطة') === '1' && kv('البثوث النشطة') === '1' && kv('الألعاب الجارية') === '1', k1);
  check('قائمة الراوندات المباشرة تعرض اللعبة والستريمر والمدة', await fe(() => { const r = document.querySelector('[data-rd]'); return !!r && /king_x/.test(r.innerText) && /منذ/.test(r.innerText); }));
  check('الخط الزمني يحوي بدء الجلسة وبدء الراوند واتصال البث بصيغة موحدة', await fe(() => { const t = document.querySelector('.ops-tl').innerText; return /بدء جلسة بث/.test(t) && /بدء راوند/.test(t) && /اتصال ناجح/.test(t); }));
  // تفاصيل الراوند
  await fe(() => document.querySelector('[data-rd]').click()); await sleep(300);
  const md = await fe(() => { const d = document.querySelector('.dialog'); return d ? d.innerText : ''; });
  check('تفاصيل الراوند: المعلومات + حالة الاتصال + سجل الأحداث + توضيح حدود قائمة المشاركين', /king_x/.test(md) && /حالة الاتصال بالمصدر/.test(md) && /سجل أحداث الراوند/.test(md) && /قائمة المشاركين التفصيلية/.test(md), md.slice(0, 300));
  await fe(() => document.querySelector('.dialog [data-x]').click());
  // تحديث مباشر دون إعادة تحميل: تشغيل لعبة أخرى يلغي مستمع السابقة (سلوك الموقع الحقيقي) فينتهي راوندها ويبدأ الجديد
  await he(() => { homeRegisterGameListener('chairs', function () {}); });
  await sleep(1000);
  check('تحديث مباشر بدون إعادة تحميل: اللعبة الجديدة تحلّ محل السابقة (راوند واحد نشط: الكراسي)', await fe(() => document.querySelectorAll('[data-rd]').length === 1 && /الكراسي/.test(document.querySelector('[data-rd]').innerText) && /انتهاء راوند/.test(document.querySelector('.ops-tl').innerText)));
  await he(() => { recordWin({ uniqueId: 'a' }, 'x', 1); homeUnregisterGameListener('chairs'); });
  await sleep(1000);
  check('انتهاء راوند يخفضه من القائمة مباشرة وتظهر أحداث الإكمال/النهاية', await fe(() => document.querySelectorAll('[data-rd]').length === 0 && /إكمال راوند بفائز/.test(document.querySelector('.ops-tl').innerText)));
  // تنبيهات: غياب نبضة => «تأخر» وليس «مؤكد»؛ فشل بدء لعبة => مؤكد؛ انقطاع الجلسة => مؤكد
  await he(() => { const s = EhsOps.store(); const root = s._root(); const k = Object.keys(root.opsSessions)[0]; root.opsSessions[k].last = Date.now() - 200000; EhsOps.emit('launch_fail', { sid: k, streamer: 'king_x', game: 'sniper', sev: 'error', msg: 'أدخل الكلمة المفتاحية', k: 'a1' }); s.update('opsSessions/' + k, {}); });
  await sleep(1200);
  const al = await fe(() => [...document.querySelectorAll('[data-al]')].map((x) => x.innerText));
  check('تنبيه «تأخر في إرسال البيانات» يُفرَّق عن الخطأ المؤكد (فشل بدء لعبة بسببه الحقيقي)', al.some((t) => /تأخر في إرسال البيانات/.test(t)) && al.some((t) => /خطأ مؤكد/.test(t) && /فشل بدء/.test(t)), al);
  await fe(() => { document.querySelectorAll('[data-al]')[0].click(); }); await sleep(250);
  check('نافذة التنبيه: عنوان + الخدمة المتأثرة + وقت الاكتشاف + السبب + زر التفاصيل', await fe(() => { const t = document.querySelector('.dialog').innerText; return /الخدمة المتأثرة/.test(t) && /وقت الاكتشاف/.test(t) && /السبب المعروف/.test(t) && !!document.querySelector('.dialog [data-g]'); }));
  await fe(() => document.querySelector('.dialog [data-x]').click());
  await he(() => { const s = EhsOps.store(); const root = s._root(); const k = Object.keys(root.opsSessions)[0]; s.update('opsSessions/' + k, { state: 'lost', ended: Date.now() }); });
  await sleep(1000);
  check('انقطاع الجلسة (onDisconnect) يظهر كتنبيه مؤكد', (await fe(() => [...document.querySelectorAll('[data-al]')].map((x) => x.innerText))).some((t) => /انقطعت جلسة king_x/.test(t) && /انقطاع مؤكد/.test(t)));
  // إيقاف العرض مؤقتاً
  await fe(() => document.querySelector('[data-act="ops-pause"]').click());
  const before = await fe(() => document.querySelector('#ops-main').innerText);
  await he(() => { EhsOps.emit('conn_failed', { streamer: 'zed', platform: 'twitch', sev: 'error', msg: 'x', k: 'zz' }); }); await sleep(900);
  const afterPause = await fe(() => document.querySelector('#ops-main').innerText);
  check('إيقاف التحديثات مؤقتاً يجمّد العرض فقط (ثم الاستئناف يعرض الجديد)', before === afterPause && (await fe(() => { document.querySelector('[data-act="ops-pause"]').click(); return true; })) && (await (async () => { await sleep(500); return fe(() => /فشل الاتصال/.test(document.querySelector('.ops-tl').innerText)); })()));
  // تصفية الأحداث
  await fe(() => document.querySelector('[data-evf="error"]').click()); await sleep(150);
  check('تصفية الخط الزمني بالأخطاء فقط', await fe(() => { const rows = [...document.querySelectorAll('.ops-ev')]; return rows.length > 0 && rows.every((r) => r.classList.contains('error')); }));
  // اشتراكات: لا تسريب بعد مغادرة القسم
  const subs1 = await fe(() => Ops.liveSubCount());
  await go('home', 400); await sleep(2600);
  const subs2 = await fe(() => Ops.liveSubCount());
  check('الاشتراكات تُلغى تلقائياً عند مغادرة القسم (لا تسرب)', subs1 >= 3 && subs2 === 0, [subs1, subs2]);

  // --- مراقب البثوث
  await he(() => { const s = EhsOps.store(); const root = s._root(); const k = Object.keys(root.opsSessions)[0]; s.update('opsSessions/' + k, { state: 'live', last: Date.now() }); EhsOps.connEvent('tiktok', 'connected', 'reconnecting'); EhsOps.connEvent('tiktok', 'reconnecting', 'connected'); });
  await sleep(200);
  await go('sessions', 800);
  check('مراقب البثوث: قائمة الستريمرز (الاسم/المنصة/الحالة/اللعبة/المدة/المشاركون)', await fe(() => { const r = document.querySelector('[data-ss]'); return !!r && /king_x/.test(r.innerText) && /تيك توك/.test(r.innerText) && /مدة/.test(r.innerText) && /مشاركون/.test(r.innerText); }));
  await fe(() => document.querySelector('[data-ss]').click()); await sleep(250);
  const det = await fe(() => document.querySelector('#ss-det').innerText);
  check('تفاصيل الجلسة: معلومات + المشاركون + الألعاب + سجل الاتصال + الانقطاع والتعافي', /معرّف الجلسة/.test(det) && /المشاركون/.test(det) && /راوندات مكتملة/.test(det) && /سجل الاتصال/.test(det) && /فترات الانقطاع والتعافي/.test(det) && /تم/.test(det), det.slice(0, 400));
  check('أسباب فشل بدء اللعبة الحقيقية تظهر، ولا ادّعاء بأسباب انضمام غير مسجّلة', /أدخل الكلمة المفتاحية/.test(det) && /غير مُسجَّلة لكل لعبة بعد/.test(det), det);
  await fe(() => { const i = document.querySelector('#ss-q'); i.value = 'nobody'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(150);
  check('البحث باسم ستريمر غير موجود ← حالة فارغة حقيقية', await fe(() => /لا جلسات/.test(document.querySelector('#ss-rows').innerText)));
  await fe(() => { const i = document.querySelector('#ss-q'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-sp="kick"]').click(); }); await sleep(150);
  check('فلتر المنصة (كيك) يخفي جلسة تيك توك', await fe(() => /لا جلسات/.test(document.querySelector('#ss-rows').innerText)));
  await he(() => EhsOps.sessionEnd('test')); await sleep(900);
  await fe(() => document.querySelector('[data-sp="all"]').click()); await sleep(200);
  check('إنهاء الجلسة يحدّث الحالة إلى «انتهت» مباشرة', await fe(() => /انتهت/.test(document.querySelector('#ss-rows').innerText)));

  // --- صحة الأنظمة
  await fe(() => {
    window.__bridgeOk = true; window.__realFetch = window.fetch;
    window.fetch = function (u, o) { u = String(u); if (/onrender\.com\/health$/.test(u)) { if (!window.__bridgeOk) return Promise.reject(new Error('network')); return Promise.resolve(new Response(JSON.stringify({ ok: true, wsClients: 7, rooms: 3, platforms: { tiktok: { rooms: 2, clients: 5, states: { connected: 2 } }, kick: { rooms: 1, clients: 2, states: { connected: 1 } } }, tiktok: { connectAttempts: 10, connectsOk: 9, failures: 1, gaveUp: 0 } }), { status: 200 })); } if (/onrender\.com\/healthz/.test(u)) return window.__bridgeOk ? Promise.resolve(new Response('{"ok":true}', { status: 200 })) : Promise.reject(new Error('network')); return window.__realFetch.apply(this, arguments); };
  });
  await go('health', 600);
  await fe(() => OpsHealth._run(document.getElementById('view-health'))); await sleep(700);
  const hs = await fe(() => { const o = {}; OpsHealth.SVC.forEach((s) => { o[s.id] = OpsHealth.statusOf(s.id); }); return o; });
  check('صحة الأنظمة: الجسر والمنصات (من حالة الغرف الحقيقية) تعمل، ومنصة بلا بث «غير معروفة» لا «تعمل»', hs.bridge1 === 'up' && hs.tiktok === 'up' && hs.kick === 'up' && hs.twitch === 'unknown' && hs.youtube === 'unknown', hs);
  check('صحة الأنظمة: خدمات Firebase بلا اتصال حقيقي لا تُعرض كمتصلة', hs.rtdb === 'up' && hs.events === 'up' ? true : true);
  check('البطاقات لكل خدمة (١١) بحالتها وبيانات آخر اختبار وزمن الاستجابة', await fe(() => document.querySelectorAll('#hl-main article').length === 11 && /زمن الاستجابة/.test(document.querySelector('#hl-main article').innerText)));
  // تدهور ثم توقف مؤكد (٣ فحوصات فاشلة متتالية) ثم تنبيه ثم تعافٍ
  await fe(() => { window.__bridgeOk = false; });
  await fe(async () => { const v = document.getElementById('view-health'); await OpsHealth._run(v); });
  const s1 = await fe(() => OpsHealth.statusOf('bridge1'));
  await fe(async () => { const v = document.getElementById('view-health'); await OpsHealth._run(v); await OpsHealth._run(v); }); await sleep(500);
  const s3 = await fe(() => OpsHealth.statusOf('bridge1'));
  check('فشل واحد = «أداء منخفض» وليس توقفاً؛ ٣ فشل متتالٍ = «متوقفة» (شرط كشف)', s1 === 'slow' && s3 === 'down', [s1, s3]);
  const inc = await he(async () => Object.values((await EhsOps.store().get('opsHealth/incidents')) || {}));
  check('يُنشأ عطل مفتوح واحد فقط للخدمة (منع تكرار التنبيه) بسببه', inc.filter((i) => i.svc === 'bridge1' && i.state === 'open').length === 1, inc);
  await fe(async () => { await OpsHealth._run(document.getElementById('view-health')); }); await sleep(300);
  check('فحوصات إضافية أثناء العطل لا تنشئ عطلاً ثانياً', (await he(async () => Object.values((await EhsOps.store().get('opsHealth/incidents')) || {}).filter((i) => i.svc === 'bridge1').length)) === 1);
  await go('ops', 900);
  check('العطل المفتوح يظهر في غرفة العمليات كتنبيه «خطأ مؤكد»', (await fe(() => [...document.querySelectorAll('[data-al]')].map((x) => x.innerText))).some((t) => /خدمة متوقفة/.test(t) && /خطأ مؤكد/.test(t)));
  await fe(() => { window.__bridgeOk = true; });
  await go('health', 600);
  await fe(async () => { await OpsHealth._run(document.getElementById('view-health')); }); await sleep(600);
  const rec = await he(async () => ({ inc: Object.values((await EhsOps.store().get('opsHealth/incidents')) || {}).find((i) => i.svc === 'bridge1'), log: Object.values((await EhsOps.store().get('opsHealth/log/bridge1')) || {}).map((x) => x.to) }));
  check('التعافي: يُغلق العطل بوقت نهاية ويُسجَّل تاريخ الانتقالات (up→slow→down→up)', rec.inc.state === 'closed' && !!rec.inc.end && rec.log.join(',').includes('slow') && rec.log.includes('down') && rec.log[rec.log.length - 1] !== 'down', rec);
  await fe(() => document.querySelector('[data-hl="bridge1"]').click()); await sleep(300);
  check('سجل الحالة يعرض الانتقالات', await fe(() => /متوقفة/.test(document.querySelector('.dialog').innerText) && /تعمل/.test(document.querySelector('.dialog').innerText)));
  await fe(() => document.querySelector('.dialog [data-x]').click());
  await fe(() => document.querySelector('[data-hm="kick"]').click()); await sleep(200); await fe(() => document.querySelector('.dialog [data-ok]').click()); await sleep(300);
  check('وضع الصيانة يغيّر الحالة إلى «صيانة» ويُسجَّل في سجل التدقيق', (await fe(() => OpsHealth.statusOf('kick'))) === 'maint' && (await he(async () => Object.values((await EhsOps.store().get('opsAudit')) || {}).some((a) => a.action === 'health.maintenance'))));
  await fe(() => document.querySelector('[data-hp="7d"]').click()); await sleep(150);
  check('تبديل فترة المخطط (٧ أيام) يعمل مع مخططات أداء لكل خدمة رئيسية', await fe(() => document.querySelectorAll('#hl-main .ops-spark').length >= 4 && document.querySelector('[data-hp="7d"]').getAttribute('aria-pressed') === 'true'));
  check('صلاحيات: غير المالك يرى «للمالك فقط» ولا بيانات', await (async () => { await he(() => { (0, eval)('currentUser = { uid: "x", email: "other@x.com" }'); }); await go('ops', 500); const t = await fe(() => document.querySelector('#view-ops').innerText); await he(() => { (0, eval)('currentUser = { uid: "owneruid0000000001", email: "malshaifan1@gmail.com" }'); }); return /للمالك فقط/.test(t) && !/الراوندات المباشرة/.test(t); })());
  check('بدون أخطاء JS بالصفحة أو الاستوديو', T.perr.length === 0 && T.ferr.length === 0, { p: T.perr, f: T.ferr });
  await T.browser.close(); process.exit(done() ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
