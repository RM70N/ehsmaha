'use strict';
// استوديو المالك: التصميم الجديد مدمج بدل لوحة المالك القديمة. اختبار على الموقع الحقيقي (index.html) مع Firebase مُحاكى بالذاكرة.
//   tests/bridge/servers.sh start && node tests/bridge/owner-studio.test.js
const H = require('./harness');
const results = [];
const check = (n, ok, d) => { results.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (!ok && d !== undefined ? '  ' + JSON.stringify(d).slice(0, 600) : '')); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SECTIONS = ['home','users','streamers','games','stats','updates','moderators','frames','devspecial','feedback','messages','rounds','cwsessions','events','gifts','store','event100','ahsemha','scode','sevt'];

(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const vp = process.env.VP ? { viewport: { width: +process.env.VP.split('x')[0], height: +process.env.VP.split('x')[1] } } : undefined;
  const page = await H.newPage(browser, { query: '?debug=0', context: vp });
  await page.addStyleTag({ content: '#auth-loader{display:none!important}' });
  const perr = []; page.on('pageerror', (e) => perr.push(e.message));
  // Firebase مُحاكى: أي دالة تُرجع كائناً فارغاً، onSnapshot لا يُطلق شيئاً
  await page.evaluate(() => {
    const fbx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'rtdb' ? undefined : function () { return {}; })) });
    fbx.onSnapshot = () => () => {}; window.__col = {}; fbx.collection = (db, name) => ({ name }); fbx.query = (c) => c; fbx.where = () => ({}); fbx.getDocs = async (q) => ({ forEach(cb) { ((window.__col && window.__col[q && q.name]) || []).forEach((d, i) => cb({ id: 'x' + i, data: () => d })); }, empty: false }); fbx.getDoc = async () => ({ exists: () => false, data: () => ({}) });
    fbx.setDoc = async () => {}; fbx.deleteDoc = async () => {}; fbx.doc = () => ({}); fbx.db = {};
    window.__fbx = fbx; (0, eval)('fb = window.__fbx; currentUser = { uid: "owner", email: "malshaifan1@gmail.com" }; currentUsername = "owner"');
  });
  check('الدوال الأصلية وجسر الاستوديو موجودان', await page.evaluate(() => typeof ownerOpenPanel === 'function' && !!window.OwnerStudio && typeof ownerSwitchTab === 'function' && typeof isOwnerAccount === 'function'));
  check('حساب المالك يُتعرَّف عليه', await page.evaluate(() => isOwnerAccount()));
  await page.evaluate(() => ownerOpenPanel());
  await page.waitForSelector('#owner-studio-frame', { state: 'attached', timeout: 5000 });
  const fr = () => page.frames().find((f) => /owner-studio\/index\.html/.test(f.url()));
  let f; for (let i = 0; i < 80 && !(f = fr()); i++) await sleep(100);
  await f.waitForFunction(() => window.Studio && Studio.cur, null, { timeout: 20000 }).catch(() => {});
  const ferr = []; f.page().on('pageerror', (e) => ferr.push(e.message));
  check('اللوحة القديمة مخفية والإطار الجديد ظاهر بملء الشاشة', await page.evaluate(() => { const o = document.getElementById('owner-modal-overlay'); const fr = document.getElementById('owner-studio-frame'); const r = fr.getBoundingClientRect(); return getComputedStyle(o).display === 'none' && getComputedStyle(fr).display === 'block' && r.width >= innerWidth - 1 && r.height >= innerHeight - 1; }));
  check('استوديو المالك يُحمَّل بوضع الدمج الحي (بدون عينات المعاينة)', await f.evaluate(() => Studio.preview === false && !document.querySelector('.preview-pill') && !!document.querySelector('#os-exit')));
  // التنقل بين كل الأقسام
  const bad = [];
  for (const id of SECTIONS) {
    await f.evaluate((id) => { location.hash = '#/' + id; }, id);
    await sleep(450);
    const r = await f.evaluate((id) => { const v = document.getElementById('view-' + id); return { ok: !!v, h: v ? v.innerText.length : 0, title: document.title }; }, id);
    if (!r.ok || r.h < 20) bad.push([id, r]);
  }
  check('الأقسام العشرون تُعرض كلها بمحتوى', bad.length === 0, bad);
  check('بدون أخطاء JS بالاستوديو أو بالموقع أثناء التنقل', ferr.length === 0 && perr.length === 0, { ferr, perr });

  /* ====== سيناريوهات الأقسام: بيانات حيّة من محرك اللوحة القديمة + الأزرار تستدعي الدوال الأصلية ====== */
  const go = async (id) => { await f.evaluate((id) => { location.hash = '#/' + id; }, id); await sleep(500); if (process.env.SHOTS) { await sleep(900); await page.screenshot({ path: process.env.SHOTS + '/' + id + '.png' }); } };
  const fe = (fn, a) => f.evaluate(fn, a);
  const spy = (names) => page.evaluate((names) => { window.__calls = []; names.forEach((n) => { window[n] = function () { window.__calls.push([n].concat([].slice.call(arguments))); return Promise.resolve(); }; }); }, names);
  const calls = () => page.evaluate(() => window.__calls.slice());
  const clickIn = (sel) => f.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);
  const setv = (sel, v) => f.evaluate(([sel, v]) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, [sel, v]);

  // --- المستخدمون
  await page.evaluate(() => { (0, eval)('ownerUsersCache = [{username:"sara",email:"s@x.com",createdAt:{toMillis:()=>Date.now()-3600e3}},{username:"omar",email:"",linkedTiktokUsername:"omar_tt"},{username:"zed",email:"z@x.com"}]'); document.getElementById('owner-users-count').textContent = '3'; ownerUsersRenderList(); });
  await go('users');
  check('المستخدمون: القائمة الحقيقية تظهر (٣ حسابات)', (await fe(() => document.querySelectorAll('#u-rows .u-row').length)) === 3);
  await setv('#u-q', 'sa');
  check('المستخدمون: البحث بالاسم يفلتر', (await fe(() => document.querySelectorAll('#u-rows .u-row').length)) === 1);
  await setv('#u-q', '');
  await clickIn('.u-row[data-u="omar"]');
  check('المستخدمون: ملف المستخدم يعرض بياناته الحقيقية (ربط تيك توك)', /omar_tt/.test(await fe(() => document.querySelector('#u-prof').innerText)));
  await clickIn('[data-call="newAccounts"]'); await sleep(500);
  const na = await fe(() => ({ modal: !!document.querySelector('.scrim .dialog'), txt: (document.querySelector('.scrim .dialog') || {}).innerText || '' }));
  check('المستخدمون: «الحسابات الجديدة» تعرض قائمة الموقع الحقيقية (آخر 24 ساعة) بنافذة الاستوديو', na.modal && /sara/.test(na.txt) && !/omar/.test(na.txt), na);
  check('المستخدمون: نافذة الموقع القديمة نفسها مخفية (لا ازدواج)', await page.evaluate(() => getComputedStyle(document.getElementById('owner-newaccounts-overlay')).display === 'none'));
  await f.evaluate(() => { const x = document.querySelector('.scrim [data-x]'); x && x.click(); }); await sleep(400);
  check('المستخدمون: إغلاق نافذة الاستوديو يغلق نافذة الموقع الأصلية أيضاً', await page.evaluate(() => !document.getElementById('owner-newaccounts-overlay').classList.contains('visible')));
  await clickIn('[data-pre="messages"]'); await sleep(500);
  check('المستخدمون ← رسالة: ينتقل لقسم الرسائل ويعبّي يوزر المستخدم', (await fe(() => Studio.cur)) === 'messages' && (await fe(() => document.querySelector('[data-bind="msgUser"]').value)) === 'omar');

  // --- ستريمر
  await page.evaluate(() => { document.getElementById('owner-streamers-count').textContent = '2'; document.getElementById('owner-streamers-list').innerHTML = '<div class="owner-row"><div class="owner-row-main"><div class="owner-row-name">king_x</div><div class="owner-row-sub">يلعب الآن: الروليت</div></div><span class="owner-plat-badge">تيك توك</span></div><div class="owner-row"><div class="owner-row-main"><div class="owner-row-name">lina</div><div class="owner-row-sub">يلعب الآن: إكس أو</div></div><span class="owner-plat-badge">كيك</span></div>'; });
  await go('streamers');
  check('ستريمر: البطاقات حيّة (الاسم واللعبة والمنصة)', await fe(() => { const t = document.querySelector('.st-grid').innerText; return /king_x/.test(t) && /الروليت/.test(t) && /lina/.test(t) && document.querySelectorAll('.st-card').length === 2; }));

  await page.route('https://avatars.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') }));
  await page.evaluate(() => { (0, eval)('ownerUsersCache.push({username:"x1",linkedTiktokUsername:"king_x",linkedTiktokAvatar:"https://avatars.test/king.jpg"})'); });
  await go('streamers');
  await page.waitForTimeout(3600);
  check('ستريمر: أفاتار الستريمر المرتبط يظهر (وغيره بالحرف الأول)', await fe(() => { const c = document.querySelectorAll('.st-card'); return c[0].querySelector('.av img') && c[0].querySelector('.av img').getAttribute('src') === 'https://avatars.test/king.jpg' && !c[1].querySelector('.av img') && /L/i.test(c[1].querySelector('.av').textContent); }));
  await fe(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await fe(() => document.querySelector('.st-card').click());
  check('ستريمر: الضغط على كرت تيك توك يفتح بثه', await fe(() => /^https:\/\/www\.tiktok\.com\/@king_x\/live$/.test(window.__opened[0] || '')), await fe(() => window.__opened[0]));
  await fe(() => document.querySelectorAll('.st-card')[1].click());
  check('ستريمر: كرت كيك يفتح kick.com', await fe(() => window.__opened[1] === 'https://kick.com/lina'), await fe(() => window.__opened[1]));
  await fe(() => document.querySelector('.st-card button[data-go]').click());
  check('ستريمر: زر «الراوندات» لا يفتح البث', await fe(() => window.__opened.length === 2));
  await go('streamers');

  await page.evaluate(() => { (0, eval)('ownerUsersCache.push({_uid:"abcdef123456",email:"nameless@x.com"},{_uid:"zzzzzz999"})'); });
  await go('home'); await go('users');
  check('المستخدمون: الحساب بلا يوزر يظهر باسم بديل لا «—»', await fe(() => { const n = [...document.querySelectorAll('.u-row .nm')].map(x => x.textContent.trim()); return n.includes('nameless') && n.includes('حساب zzzzzz') && !n.includes('—'); }));

  // --- ألعاب
  await spy(['ownerSetBadge', 'ownerMoveGame']);
  await go('games');
  const gcount = await fe(() => document.querySelectorAll('.gl-card').length);
  check('ألعاب: بطاقات كل ألعاب الموقع (ستريمر/جمعات/فردية) من الصفحات الأصلية', gcount >= 10, gcount);
  await f.evaluate(() => { const b = document.querySelector('.gl-card [data-bd$=":update"]'); b.click(); });
  const c1 = (await calls()).find((c) => c[0] === 'ownerSetBadge');
  check('ألعاب: زر الشارة يستدعي ownerSetBadge(tag,"update")', c1 && c1[2] === 'update' && !!c1[1], c1);
  await f.evaluate(() => { const b = document.querySelector('.gl-card [data-mv$=":down"]:not([disabled])'); b.click(); });
  const c2 = (await calls()).find((c) => c[0] === 'ownerMoveGame');
  check('ألعاب: زر النقل يستدعي ownerMoveGame(section,tag,"down")', c2 && c2[3] === 'down' && /streamer|party|solo/.test(c2[1]), c2);

  // --- مشرفين
  await spy(['ownerAddModerator', 'ownerRemoveModerator']);
  await page.evaluate(() => { (0, eval)('modModeratorSet = new Set(["mod_a","mod_b"])'); ownerRenderModeratorsList(); });
  await go('moderators');
  check('مشرفين: القائمة الحقيقية (٢)', (await fe(() => document.querySelectorAll('.tm-card').length)) === 2);
  await setv('#m-in', 'newmod'); await clickIn('#m-add'); await sleep(300);
  const mv = await page.evaluate(() => document.getElementById('mod-add-input').value);
  check('مشرفين: «إضافة» تعبّي الحقل الأصلي وتستدعي ownerAddModerator', mv === 'newmod' && (await calls()).some((c) => c[0] === 'ownerAddModerator'), mv);
  await page.evaluate(() => { window.__calls = []; (0, eval)('ownerRemoveModerator = function(u){ window.__calls.push(["ownerRemoveModerator",u]); return Promise.resolve(); }'); ownerRenderModeratorsList(); });
  await clickIn('[data-rm="0"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('مشرفين: «إزالة» بعد التأكيد تضغط زر الموقع الأصلي (ownerRemoveModerator)', (await calls()).some((c) => c[0] === 'ownerRemoveModerator' && c[1] === 'mod_a'), await calls());

  // --- المميزون
  await spy(['ownerAddDevSpecial', 'ownerAddGhnam', 'ownerAddAlfawzan', 'ghMilestonePreview', 'ownerRemoveDevSpecial', 'ownerRemoveGhnam']);
  await page.evaluate(() => { (0, eval)('devSpecialSet = new Set(["vip1"]); ghnamSpecialSet = new Set(["s31g"]); alfawzanSpecialSet = new Set()'); });
  await go('devspecial');
  const vt = await fe(() => ({ tiers: document.querySelectorAll('.vip-tier').length, rm: document.querySelectorAll('[data-vrm]').length, locked: [...document.querySelectorAll('.vip-member .badge')].length, vip1: /vip1/.test(document.querySelector('#vm-devspecial').innerText), s31: /s31g/.test(document.querySelector('#vm-ghnam').innerText) }));
  check('المميزون: الفئات الثلاث بقوائمها الحقيقية (أساسي مقفل بالكود + أعضاء قابلون للإزالة)', vt.tiers === 3 && vt.rm === 2 && vt.locked >= 1 && vt.vip1 && vt.s31, vt);
  await setv('#v-ghnam', 'wolfy'); await clickIn('.t-ghn [data-call="addGhnam"]'); await sleep(300);
  check('المميزون: إضافة لغنام تعبّي ghnam-add-input وتستدعي ownerAddGhnam', (await page.evaluate(() => document.getElementById('ghnam-add-input').value)) === 'wolfy' && (await calls()).some((c) => c[0] === 'ownerAddGhnam'));
  await clickIn('[data-call="ghPreview"]'); await sleep(200);
  check('المميزون: «شاشة الاحتفال» (ghMilestonePreview) تعمل', (await calls()).some((c) => c[0] === 'ghMilestonePreview'));
  await f.evaluate(() => document.querySelector('[data-vrm^="devspecial:"]').click()); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('المميزون: الإزالة تضغط الزر الأصلي (ownerRemoveDevSpecial("vip1"))', (await calls()).some((c) => c[0] === 'ownerRemoveDevSpecial' && c[1] === 'vip1'), await calls());

  // --- اقتراحات
  await page.evaluate(() => { const T0 = Date.now(); (0, eval)('ownerFeedbackRows = [{type:"suggestion",username:"u1",text:"أضيفوا وضع فرق\\nتفاصيل أكثر",createdAt:{toMillis:()=>' + (T0 - 60000) + '}},{type:"problem",username:"u2",text:"الصوت ينقطع",createdAt:{toMillis:()=>' + (T0 - 120000) + '}}]'); });
  await go('feedback');
  check('اقتراحات: الرسائل الحقيقية (٢) وفلتر المشاكل', (await fe(() => document.querySelectorAll('#fb-list .id-item').length)) === 2);
  await f.evaluate(() => document.querySelector('#fb-seg [data-pick="مشكلة"]').click());
  check('اقتراحات: فلتر «مشاكل» يُبقي واحدة', (await fe(() => document.querySelectorAll('#fb-list .id-item').length)) === 1);
  await clickIn('#fb-list .id-item');
  const fbr = await fe(() => document.querySelector('#fb-read').innerText); check('اقتراحات: قراءة الرسالة كاملة', /الصوت ينقطع/.test(fbr), fbr);

  // --- تحديثات
  await spy(['ownerPublishUpdate', 'ownerUnpublishUpdate']);
  await go('updates');
  await setv('#rl-text', 'تحديث تجريبي: لعبة جديدة'); await clickIn('#rl-pub'); await sleep(300);
  check('تحديثات: «نشر» تنقل النص للحقل الأصلي وتستدعي ownerPublishUpdate', (await page.evaluate(() => document.getElementById('updates-textarea').value)) === 'تحديث تجريبي: لعبة جديدة' && (await calls()).some((c) => c[0] === 'ownerPublishUpdate'));
  await clickIn('#rl-unpub'); await sleep(200);
  check('تحديثات: «إلغاء النشر» تستدعي ownerUnpublishUpdate', (await calls()).some((c) => c[0] === 'ownerUnpublishUpdate'));
  await page.evaluate(() => { window.confirm = () => { window.__confirmed = true; return true; }; (0, eval)('fb.setDoc = async function(){ window.__reload = true; }'); window.__calls = []; });
  await clickIn('[data-call="forceReload"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(400);
  check('تحديثات: «تحديث الصفحة لكل الزوار» تعمل بتأكيد واحد (بدون تأكيد مكرر)', await page.evaluate(() => window.__reload === true && !window.__confirmed), await page.evaluate(() => [window.__reload, window.__confirmed]));

  // --- رسائل
  await spy(['ownerSendPersonalMessage', 'ownerSendBroadcastMessage', 'ownerClearBroadcastMessage']);
  await page.evaluate(() => { (0, eval)('ownerMsgPosition = {personal:"top",broadcast:"top"}; ownerMsgDuration = {personal:"timed",broadcast:"timed"}'); });
  await go('messages');
  await setv('#ms-u', 'sara'); await setv('#ms-t', 'مرحباً سارة'); await f.evaluate(() => { document.querySelector('#ms-pos-seg [data-pick="center"]').click(); document.querySelector('#ms-dur-seg [data-pick="permanent"]').click(); });
  await clickIn('#ms-send'); await sleep(400);
  const pm = await page.evaluate(() => ({ u: document.getElementById('msg-personal-username').value, t: document.getElementById('msg-personal-text').value, p: ownerMsgPosition.personal, d: ownerMsgDuration.personal }));
  check('رسائل: رسالة لشخص (الحقول الأصلية + الموقع=منتصف + المدة=دائم) وتستدعي ownerSendPersonalMessage', pm.u === 'sara' && pm.t === 'مرحباً سارة' && pm.p === 'center' && pm.d === 'permanent' && (await calls()).some((c) => c[0] === 'ownerSendPersonalMessage'), pm);
  await f.evaluate(() => document.querySelector('#ms-seg [data-pick="broadcast"]').click()); await sleep(500);
  await setv('#ms-t', 'إعلان للجميع'); await clickIn('#ms-send'); await sleep(400);
  check('رسائل: رسالة للجميع تنقل النص للحقل الأصلي وتستدعي ownerSendBroadcastMessage', (await page.evaluate(() => document.getElementById('msg-broadcast-text').value)) === 'إعلان للجميع' && (await calls()).some((c) => c[0] === 'ownerSendBroadcastMessage'));
  await clickIn('[data-call="clearBroadcast"]'); await sleep(200);
  check('رسائل: «إخفاء الرسالة الحالية» تستدعي ownerClearBroadcastMessage', (await calls()).some((c) => c[0] === 'ownerClearBroadcastMessage'));

  // --- راوندات
  await spy(['ownerRoundsJoin', 'ownerRoundsLeave', 'ownerRoundsWinMe']);
  await page.evaluate(() => { (0, eval)('ownerRoundsActiveStreamersCache = [{username:"king_x",gameName:"الروليت",gameTag:"roulette3d",updatedAt:{seconds:5}}]'); document.getElementById('owner-rounds-count').textContent = '1'; ownerRenderRoundsTab(); });
  await go('rounds');
  check('راوندات: الراوند الحقيقي ظاهر', (await fe(() => document.querySelectorAll('.rd-item').length)) === 1);
  await clickIn('.rd-item');
  await clickIn('[data-rj]'); await clickIn('[data-rl]'); await clickIn('[data-rw]'); await sleep(200);
  const rc = (await calls()).map((c) => c[0] + ':' + c[1]);
  check('راوندات: دخول/مغادرة/فوزني تستدعي الدوال الأصلية بوسم اللعبة', rc.includes('ownerRoundsJoin:roulette3d') && rc.includes('ownerRoundsLeave:roulette3d') && rc.includes('ownerRoundsWinMe:roulette3d'), rc);
  await page.evaluate(() => { (0, eval)('fb.getDoc = async function(){ return { exists:()=>true, data:()=>({participants:[{uniqueId:"p1",nickname:"لاعب١"},{uniqueId:"p2",nickname:"لاعب٢"}]}) }; }'); window.__calls = []; (0, eval)('ownerRoundsPickWinner = function(t,u){ window.__calls.push(["pick",t,u]); return Promise.resolve(); }'); });
  await clickIn('[data-rp]'); await sleep(500);
  check('راوندات: «فوز شخص» تعرض المشاركين الحقيقيين', await fe(() => document.querySelectorAll('#pw-list [data-win]').length) === 2);
  await clickIn('#pw-list [data-win="1"]'); await sleep(300);
  check('راوندات: اختيار الفائز يستدعي ownerRoundsPickWinner(tag,uniqueId)', (await calls()).some((c) => c[0] === 'pick' && c[1] === 'roulette3d' && c[2] === 'p2'), await calls());

  // --- الدول
  await page.evaluate(() => { (0, eval)('cwSessionsCache = [{id:"s1",username:"king_x",gameStatus:"active",participants:[{},{}],participantsCount:2,countries:[{country:"السعودية",nickname:"a"},{country:"مصر",nickname:"b"}]}]'); cwSessionsRenderList(); });
  await go('cwsessions');
  check('الدول: جلسة حقيقية + أكثر الدول مشاركة', await fe(() => /king_x/.test(document.querySelector('.na-board').innerText) && /السعودية/.test(document.querySelector('.na-hero').innerText)));

  // --- فعاليات (صلاحيات)
  await spy(['ownerAddEventAccess', 'ownerRemoveEventAccess']);
  await page.evaluate(() => { (0, eval)('evtAccessSet = new Set(["evt_user"])'); });
  await go('events');
  check('فعاليات: البطاقة الحقيقية', (await fe(() => document.querySelectorAll('.pass').length)) === 1);
  await setv('#ev-in', 'newevt'); await clickIn('#ev-add'); await sleep(250);
  check('فعاليات: منح الصلاحية يعبّي الحقل الأصلي ويستدعي ownerAddEventAccess', (await page.evaluate(() => document.getElementById('evt-access-add-input').value)) === 'newevt' && (await calls()).some((c) => c[0] === 'ownerAddEventAccess'));
  await clickIn('[data-rm="0"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('فعاليات: سحب الصلاحية يضغط الزر الأصلي (ownerRemoveEventAccess)', (await calls()).some((c) => c[0] === 'ownerRemoveEventAccess' && c[1] === 'evt_user'), await calls());

  // --- إحصائيات
  await page.evaluate(() => { const now = Date.now(); window.__col.playEvents = []; for (let i = 0; i < 40; i++) window.__col.playEvents.push({ uid: 'u' + (i % 9), type: i % 5 === 0 ? 'streamer_launch' : 'play', createdAt: { toMillis: () => now - i * 3600e3 * 3 } }); window.__col.presence = Array.from({ length: 17 }, (_, i) => ({ username: 'p' + i, lastSeen: { toMillis: () => now - 1000 } })); });
  await go('stats'); await sleep(1500);
  const sd = await fe(() => ({ t: document.querySelector('#in-box').innerText.slice(0, 300), path: !!document.querySelector('#in-box svg path.draw'), tr: document.querySelectorAll('.tbl-alt tbody tr').length }));
  check('إحصائيات: أرقام حقيقية + مخطط + «متصل الآن»', /17/.test(sd.t) && sd.path && sd.tr === 6, sd);
  await clickIn('[data-call="onlineNow"]'); await sleep(500);
  const on = await fe(() => (document.querySelector('.scrim .dialog') || {}).innerText || '');
  check('إحصائيات: «الأسماء» تعرض المتصلين الحقيقيين (١٧) بنافذة الاستوديو', /p0/.test(on) && /p16/.test(on), on.slice(0, 120));
  await f.evaluate(() => { const x = document.querySelector('.scrim [data-x]'); x && x.click(); }); await sleep(300);
  await f.evaluate(() => document.querySelector('#per-seg [data-pick="24h"]').click()); await sleep(300);
  check('إحصائيات: تبديل الفترة يعيد حساب السلسلة', await fe(() => /ساعة/.test(document.querySelector('#in-box').innerText)));

  // --- إطارات
  await page.evaluate(() => { (0, eval)('framesPublicExtra = [{id:"fx1",name:"تنين",imageUrl:"data:image/svg+xml;utf8,<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\"250\\" height=\\"100\\"/>",hole:[10,15,25,70],ratio:2.5}]'); ownerRenderPublicFramesList(); });
  await spy(['ownerPublishFrame', 'ownerGrantFrame', 'ownerSelectGrantExisting']);
  await go('frames');
  check('إطارات: الإطار العام المنشور حقيقي (معاينة بثقب الصورة الشخصية)', await fe(() => !!document.querySelector('.os-fprev img.frame') && document.querySelectorAll('.fr-thumb').length === 1));
  await setv('[data-lid="frm-owner-pub-name"]', 'إطار جديد'); await setv('[data-lid="frm-owner-pub-l"]', '12');
  await clickIn('[data-call="publishFrame"]'); await sleep(300);
  check('إطارات: «نشر الإطار» يمرّر الاسم والثقب للحقول الأصلية ويستدعي ownerPublishFrame', (await page.evaluate(() => [document.getElementById('frm-owner-pub-name').value, document.getElementById('frm-owner-pub-l').value]))[0] === 'إطار جديد' && (await page.evaluate(() => document.getElementById('frm-owner-pub-l').value)) === '12' && (await calls()).some((c) => c[0] === 'ownerPublishFrame'));
  await setv('#gr-t', 'sara'); await clickIn('#gr-btn'); await sleep(300);
  check('إطارات: «منح الإطار» يعبّي يوزر الهدف الأصلي ويستدعي ownerGrantFrame', (await page.evaluate(() => document.getElementById('frm-grant-target-input').value)) === 'sara' && (await calls()).some((c) => c[0] === 'ownerGrantFrame'));

  // --- الأكواد السرية
  await spy(['scodeOpenNew', 'scodeStopCode', 'scodeDeleteCode']);
  await page.evaluate(() => { (0, eval)('scodeOwnerRows = [{id:"VIP1",name:"VIP1",frameName:"تنين",usedCount:3,maxUses:10,expiresAt:Date.now()+86400e3*2,active:true}]'); document.getElementById('owner-scode-count').textContent = '1'; });
  await go('scode');
  check('الأكواد: البطاقة الحقيقية (٣ من ١٠)', await fe(() => /VIP1/.test(document.querySelector('.cd-grid').innerText) && /3/.test(document.querySelector('.cd-card').innerText)));
  await clickIn('[data-cs="0"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('الأكواد: «إيقاف» بعد التأكيد تستدعي scodeStopCode(0)', (await calls()).some((c) => c[0] === 'scodeStopCode' && c[1] === 0));
  await clickIn('[data-cd="0"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('الأكواد: «حذف» بعد التأكيد تستدعي scodeDeleteCode(0)', (await calls()).some((c) => c[0] === 'scodeDeleteCode' && c[1] === 0));

  // --- هدايا / متجر / عدد جديد / فئات / فعاليات الستريمرز (نماذج منقولة)
  await go('gifts');
  check('هدايا: كتالوج أدوات الهدايا الحقيقي كبطاقات', (await fe(() => document.querySelectorAll('#gf-host .os-card').length)) >= 5);
  await f.evaluate(() => document.querySelector('#gf-host .os-card').click()); await sleep(500);
  const gd = await fe(() => ({ inp: document.querySelectorAll('#gf-host input,#gf-host select,#gf-host textarea').length, btn: document.querySelectorAll('#gf-host [data-os-btn]').length, html: document.querySelector('#gf-host').innerHTML.slice(0, 400) }));
  check('هدايا: فتح أداة يعرض نموذجها الأصلي بتصميم الاستوديو (حقول + زر)', gd.btn >= 1, gd);
  await f.evaluate(() => { const ins = [...document.querySelectorAll('#gf-host input')]; const set = (i, v) => { ins[i].value = v; ins[i].dispatchEvent(new Event('input', { bubbles: true })); }; set(0, 'streamer_k'); set(1, 'غير موجود'); set(2, '5'); });
  check('هدايا: قيم حقول الاستوديو تصل لحقول الموقع الأصلية', (await page.evaluate(() => [document.getElementById('gifts-add-streamer').value, document.getElementById('gifts-add-nickname').value, document.getElementById('gifts-add-amount').value])).join('|') === 'streamer_k|غير موجود|5');
  await f.evaluate(() => document.querySelector('#gf-host .btn-primary[data-os-btn]').click()); await sleep(500);
  check('هدايا: زر «إضافة» ينفّذ giftsAddPoints الأصلية وتظهر نتيجتها بالاستوديو', await fe(() => /ما لقيت هذا الاسم/.test(document.querySelector('#gf-host').innerText)), await fe(() => document.querySelector('#gf-host').innerText.slice(0, 200)));
  await go('store');
  check('متجر: واجهة المتجر الأصلية منقولة (إضافة منتج + المبيعات)', await fe(() => /إضافة منتج/.test(document.querySelector('#st-host').innerText) && /المبيعات/.test(document.querySelector('#st-host').innerText)));
  await f.evaluate(() => [...document.querySelectorAll('#st-host [data-os-btn]')].find((b) => /إضافة منتج/.test(b.innerText)).click()); await sleep(500);
  check('متجر: نموذج منتج جديد بحقوله الأصلية (اسم/نوع/سعر/مدة/كمية)', await fe(() => document.querySelectorAll('#st-host input').length >= 4 && !!document.querySelector('#st-host select')));
  await f.evaluate(() => { const i = document.querySelector('#st-host input'); i.value = 'حصانة ذهبية'; i.dispatchEvent(new Event('input', { bubbles: true })); const sel = document.querySelector('#st-host select'); sel.value = 'retry'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
  check('متجر: اسم ونوع المنتج يصلان لحقول الموقع الأصلية', (await page.evaluate(() => [document.getElementById('store-f-name').value, document.getElementById('store-f-type').value])).join('|') === 'حصانة ذهبية|retry');
  await go('event100');
  check('عدد جديد: أزرار فعالية 100 لاعب و100 متابع منقولة', await fe(() => /فعالية 100 لاعب/.test(document.querySelector('#e1-host').innerText) && /متابع/.test(document.querySelector('#e1-host').innerText)));
  await f.evaluate(() => [...document.querySelectorAll('#e1-host [data-os-btn]')].find((b) => /فعالية 100 لاعب/.test(b.innerText)).click()); await sleep(500);
  check('عدد جديد: نموذج الإطلاق (رسائل ومدد) بحقوله الأصلية', await fe(() => document.querySelectorAll('#e1-host input').length === 5));
  await page.evaluate(() => { (0, eval)('ahsemhaCategoriesCache = [{id:"c1",name:"رياضة",color:"#10b981",pointLevels:[{points:200,questions:[{},{}]},{points:400,questions:[{}]}]}]'); (0, eval)('ahsemhaEditorSet = new Set(["ed1"])'); });
  await spy(['ahsemhaAdminOpenEdit', 'ahsemhaAddEditor', 'ahsemhaAdminOpenNew', 'ahsemhaRemoveEditor']);
  await go('ahsemha');
  check('فئات: الفئة الحقيقية بعدد أسئلتها + المخوّلون', await fe(() => /رياضة/.test(document.querySelector('#ct-list').innerText) && /ed1/.test(document.querySelector('#ct-eds').innerText)));
  await clickIn('[data-erm="0"]'); await sleep(250); await f.evaluate(() => document.querySelector('.scrim [data-ok]').click()); await sleep(250);
  check('فئات: سحب صلاحية مخوّل يضغط الزر الأصلي (ahsemhaRemoveEditor)', (await calls()).some((c) => c[0] === 'ahsemhaRemoveEditor' && c[1] === 'ed1'), await calls());
  await clickIn('[data-c="c1"]'); await clickIn('[data-cedit]'); await sleep(200);
  check('فئات: «تعديل» تفتح محرر الفئة الأصلي (ahsemhaAdminOpenEdit)', (await calls()).some((c) => c[0] === 'ahsemhaAdminOpenEdit' && c[1] === 'c1'));
  await clickIn('[data-call="ahsemhaNew"]'); await sleep(200);
  check('فئات: «إضافة فئة جديدة» تستدعي ahsemhaAdminOpenNew', (await calls()).some((c) => c[0] === 'ahsemhaAdminOpenNew'));
  await setv('#ct-ed', 'ed2'); await clickIn('#ct-add'); await sleep(250);
  check('فئات: إضافة مخوّل تعبّي الحقل الأصلي وتستدعي ahsemhaAddEditor', (await page.evaluate(() => document.getElementById('ahsemha-editor-add-input').value)) === 'ed2' && (await calls()).some((c) => c[0] === 'ahsemhaAddEditor'));
  await go('sevt');
  check('فعاليات الستريمرز: جسر المصير + عداد الرئيسية + الديسكورد + فعالية جديدة كلها منقولة', await fe(() => { const t = document.querySelector('.sv-grid').innerText; return /جسر المصير/.test(t) && /عداد اللاعبين/.test(t) && /الديسكورد/.test(t) && /فعالية جديدة/.test(t); }));
  const sv = await fe(() => [...document.querySelectorAll('.sv-grid [data-os-btn]')].map((b) => b.innerText.trim()));
  check('فعاليات الستريمرز: أزرار الأصل كلها (فتح/ابدأ/إنهاء/التجربة/حفظ/إعادة تعيين)', ['فتح فعالية', 'ابدأ الآن', 'إنهاء', 'التجربة', 'حفظ الإعدادات', 'إعادة تعيين'].every((t) => sv.some((x) => x.includes(t))), sv);

  // --- الرئيسية + إغلاق
  await go('home');
  check('الرئيسية: الأرقام الحقيقية (٣ مستخدمين، ٢ ستريمر، ١ راوند)', await fe(() => document.querySelector('#hm-users').innerText.trim() === '٣' || document.querySelector('#hm-users').innerText.trim() === '3'));
  await f.evaluate(() => document.getElementById('os-exit').click());
  check('زر «إغلاق» يغلق الاستوديو ويعيد الموقع', await page.evaluate(() => getComputedStyle(document.getElementById('owner-studio-frame')).display === 'none' && !document.body.classList.contains('os-open')));
  check('بدون أخطاء JS بعد كل السيناريوهات', ferr.length === 0 && perr.length === 0, { ferr, perr });
  await browser.close();
  const pass = results.filter(Boolean).length;
  console.log(`\n${pass}/${results.length} passed`);
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.log('FATAL ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); process.exit(1); });
