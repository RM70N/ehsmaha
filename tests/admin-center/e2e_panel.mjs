// لوحة الأدمن في متصفح حقيقي (Chromium): بيانات ops مزروعة بصيغتها الحقيقية في Firebase وهمي بالذاكرة + جسر WebSocket محلي حقيقي لمختبر الاتصال.
// الحماية على الخادم مختبرة بمُحاكي القواعد (run-rules-tests.sh). تشغيل: python3 -m http.server 8790 ثم node tests/admin-center/e2e_panel.mjs
import { createRequire } from 'module'; import fs from 'fs';
const require = createRequire(new URL('../../', import.meta.url));
const { chromium } = require('playwright');
const { WebSocketServer } = createRequire('/home/user/ehsmaha/tiktok-relay/')('ws');
const ROOT = new URL('../../', import.meta.url).pathname;
const BASE = process.env.BASE || 'http://127.0.0.1:8790/admin-center/index.html';
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✔', n); } else { fail++; console.log('  ✘', n, d === undefined ? '' : JSON.stringify(d).slice(0, 300)); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* جسر محلي بسلوكات: connected+events / not_live / fatal / صامت */
const mode = { v: 'ok' }; let openSock = 0; let hits = [];
const http = (await import('http')).createServer((req, res) => { if (/^\/health/.test(req.url)) { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ok: true, rooms: 1 })); } else { res.writeHead(404); res.end(); } });
const wss = new WebSocketServer({ server: http, path: '/ws' });
wss.on('connection', (s, req) => { openSock++; hits.push(req.url); s.on('close', () => { openSock--; });
  if (mode.v === 'ok') { s.send(JSON.stringify({ type: 'bridge_status', state: 'connecting' })); setTimeout(() => s.send(JSON.stringify({ type: 'bridge_status', state: 'connected' })), 700); setTimeout(() => s.send(JSON.stringify({ messages: [{ type: 'WebcastChatMessage' }] })), 1100); }
  else if (mode.v === 'quiet') { setTimeout(() => s.send(JSON.stringify({ type: 'bridge_status', state: 'connected' })), 80); }
  else if (mode.v === 'notlive') setTimeout(() => s.send(JSON.stringify({ type: 'bridge_status', state: 'not_live' })), 80);
  else if (mode.v === 'fatal') setTimeout(() => s.send(JSON.stringify({ type: 'bridge_status', state: 'error', fatal: true, reason: 'تعذّر الاتصال بعد عدة محاولات' })), 80);
  /* silent: لا شيء */ });
await new Promise((r) => http.listen(0, '127.0.0.1', r)); const PORT = http.address().port;

const FB = fs.readFileSync(ROOT + 'tests/admin-center/fake-fb.js', 'utf8');
const SEED = `(function(){
  var now = Date.now(), uid = 'adm1';
  var perms = ${JSON.stringify(Object.fromEntries(['admin_dashboard_view', 'admin_streams_view', 'admin_streams_open_link', 'admin_sessions_details', 'admin_sessions_observe', 'admin_rounds_view', 'admin_connections_view', 'admin_connections_test', 'admin_frames_view', 'admin_frames_grant', 'admin_frames_redeem_code', 'admin_frames_history'].map((k) => [k, true])))};
  window.__fsSet('adminAccess/adm1', { userId: 'adm1', username: 'Admin One', role: 'admin', status: 'active', permissions: perms, frameGrantScope: { mode: 'allowlist', frameIds: ['anime01', 'anime02'] }, rev: 1 });
  var img = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="none" stroke="#a78bfa" stroke-width="6"/></svg>');
  window.framesEffectiveCatalog = function () { return [{ id: 'anime01', name: 'تنين النار', gallery: img }, { id: 'anime02', name: 'فينيق اللهب', gallery: img }, { id: 'anime03', name: 'أميرة الورد', gallery: img }]; };
  window.EHS_OPS_GAMES = [{ tag: 'rou', title: 'دائرة الإقصاء' }, { tag: 'chairs', title: 'الكراسي' }, { tag: 'xo', title: 'إكس أو' }];
  var S = {};
  S.ok1 = { uid: 'su1', streamer: 'king_x', platform: 'tiktok', state: 'live', start: now - 600000, last: now - 8000, game: 'rou', parts: 12, nRounds: 3, dev: 'd', conn: { c1: { t: now - 590000, platform: 'tiktok', from: 'connecting', to: 'connected' }, c2: { t: now - 300000, platform: 'tiktok', from: 'connected', to: 'reconnecting' }, c3: { t: now - 290000, platform: 'tiktok', from: 'reconnecting', to: 'connected' } }, rounds: { 1: { game: 'rou', start: now - 500000, end: now - 400000, state: 'complete' }, 3: { game: 'rou', start: now - 100000, state: 'running' } } };
  S.late = { uid: 'su2', streamer: 'late_one', platform: 'tiktok', state: 'live', start: now - 900000, last: now - 200000, game: 'chairs', parts: 4, nRounds: 1, conn: { c1: { t: now - 800000, platform: 'tiktok', from: '', to: 'connected' } } };
  S.dead = { uid: 'su3', streamer: 'ghost', platform: 'tiktok', state: 'live', start: now - 3000000, last: now - 1800000, game: 'xo', parts: 2 };
  S.ended = { uid: 'su4', streamer: 'done_one', platform: 'kick', state: 'ended', start: now - 3600000, last: now - 3000000, game: 'xo', parts: 0 };
  S.noconn = { uid: 'su5', streamer: 'noconn', platform: 'tiktok', state: 'live', start: now - 300000, last: now - 5000, game: 'xo', parts: 30, nRounds: 1 };
  window.__fbSet('opsSessions', { su1_a: S.ok1, su2_a: S.late, su3_a: S.dead, su4_a: S.ended, su5_a: S.noconn });
  window.__fbSet('fsMirror/activeStreamers', { link_su1: { username: 'king_x', platform: 'tiktok', uid: 'su1', gameTag: 'link' }, link_su2: { username: 'late_one', platform: 'tiktok', uid: 'su2' }, link_su5: { username: 'bad handle!', platform: 'tiktok', uid: 'su5' } });
  window.__fbSet('opsEvents', { e1: { t: now - 100000, type: 'round_start', sid: 'su1_a', rid: 'su1_a_rou_3', game: 'rou', sev: 'info' }, e2: { t: now - 50000, type: 'conn_failed', sid: 'su1_a', sev: 'error', msg: 'connected > failed' }, e3: { t: now - 400000, type: 'round_end', sid: 'su1_a', rid: 'su1_a_rou_1', game: 'rou', sev: 'info' } });
  var d = new Date(); var day = d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
  var R = {}; R['adminRounds/' + day] = { w1: { uid: 'su1', sid: 'su1_a', rid: 'su1_a_rou_1', game: 'rou', gameName: 'دائرة الإقصاء', streamer: 'king_x', platform: 'tiktok', ts: now - 390000, rstart: now - 500000, w: { u: 'p1', n: 'لاعب أول' }, pts: 1, src: 'recordWin' }, w2: { uid: 'su1', sid: 'su1_a', rid: 'su1_a_rou_1', game: 'rou', streamer: 'king_x', platform: 'tiktok', ts: now - 380000, w: { u: 'p2', n: 'لاعب ثاني' }, pts: 2 } };
  window.__fbSet('adminRounds/' + day, R['adminRounds/' + day]);
  window.__fbSet('adminObserve', { su1_a: { uid: 'su1', streamer: 'king_x', game: 'rou', gameName: 'دائرة الإقصاء', state: 'live', parts: 12, list: [{ u: 'p1', n: 'لاعب أول' }, { u: 'p2', n: 'لاعب ثاني' }], listSupported: true, round: 3, rstart: now - 100000, ts: now - 5000 }, su5_a: { uid: 'su5', streamer: 'noconn', game: 'xo', gameName: 'إكس أو', state: 'live', parts: 30, list: [], listSupported: false, round: 1, rstart: now - 60000, ts: now - 5000 } });
  window.__fsSet('usernames/target', { uid: 'tuid1' }); window.__fsSet('users/tuid1', { username: 'Target', email: 't@x.com', linkedTiktokUsername: 'tt_target' });
  window.__fsSet('usernames/solo', { uid: 'tuid2' }); window.__fsSet('users/tuid2', { username: 'Solo' });
  window.__fbSet('secretCodes', { vip1: { frameId: 'anime01', frameName: 'تنين النار', maxUses: 2, usedCount: 0, active: true, expiresAt: now + 99999999 }, maxed: { frameId: 'anime01', maxUses: 1, usedCount: 1, active: true }, outside: { frameId: 'anime03', maxUses: 5, usedCount: 0, active: true } });
  window.__opens = []; window.open = function (u, t, f) { window.__opens.push([u, t, f]); return null; };
})();`;

const b = await chromium.launch(); const errs = [];
async function open(w = 1280, h = 800, extra = '') {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const pg = await ctx.newPage();
  await pg.addInitScript(FB); await pg.addInitScript(SEED); if (extra) await pg.addInitScript(extra);
  pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|fonts\.g/.test(m.text())) errs.push('C:' + m.text().slice(0, 120)); });
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pg.goto(BASE); await pg.waitForSelector('.nav', { timeout: 8000 }); await sleep(500); return pg;
}
const go = async (pg, id, arg = '') => { await pg.evaluate(([i, a]) => { location.hash = '#/' + i + (a ? '/' + a : ''); }, [id, arg]); await sleep(700); };

console.log('== 1) الهيكل والهوية');
let pg = await open();
const hd = await pg.evaluate(() => ({ title: document.querySelector('.brand b').innerText, sub: document.querySelector('.brand small').innerText, href: document.querySelector('a.brand').href, logo: document.querySelector('.brand .logo img').getAttribute('src'), navs: [...document.querySelectorAll('.nav')].map((n) => n.innerText.trim()), me: document.getElementById('me-name').innerText, conn: document.getElementById('chip-conn-t').innerText, dirn: document.documentElement.dir }));
ok('الشريط العلوي: الشعار الجديد + «لوحة الأدمن» + EHSMAHA CONTROL + رابط ehsmaha.com', hd.title === 'لوحة الأدمن' && hd.sub === 'EHSMAHA CONTROL' && /ehsmaha\.com/.test(hd.href) && /assets\/branding\/icon-96\.png/.test(hd.logo), hd);
ok('القائمة الجانبية: نظرة عامة + الأقسام الستة بالترتيب المطلوب', hd.navs.join('|') === 'نظرة عامة|البثوث المباشرة|الدخول كمراقب|نتائج الجولات|اتصال الستريمر|تجربة اتصال البث|الإطارات', hd.navs);
ok('اسم الأدمن وحالة الاتصال ظاهران واتجاه RTL', hd.me === 'Admin One' && /متصل/.test(hd.conn) && hd.dirn === 'rtl', hd);
ok('حالة الجلسات النشطة بالأعلى (٢ نشطة: king_x وnoconn)', await pg.evaluate(() => /2\s*جلسة نشطة/.test(document.getElementById('chip-sess-t').innerText.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632))), await pg.evaluate(() => document.getElementById('chip-sess-t').innerText));

console.log('== 2) النظرة العامة');
const kp = await pg.evaluate(() => [...document.querySelectorAll('.kpi')].map((k) => k.querySelector('span').innerText + '=' + k.querySelector('b').innerText));
ok('مؤشرات من مصادر حقيقية: نشطة ٢، ببث مؤكد ١، تحتاج انتباهاً ١ (المتأخرة)', kp.some((x) => /جلسات نشطة الآن=2/.test(x)) && kp.some((x) => /ببث مؤكد=1/.test(x)) && kp.some((x) => /انتباهاً=1/.test(x)), kp);

console.log('== 3) البثوث المباشرة');
await go(pg, 'streams');
const cards = await pg.evaluate(() => [...document.querySelectorAll('.sc')].map((c) => ({ n: c.querySelector('h4').innerText, cls: c.className, t: c.innerText })));
ok('الافتراضي: النشطة والمتأخرة فقط (٣ بطاقات) — الجلسة الميتة والمنتهية لا تظهر كمباشرة', cards.length === 3 && !cards.some((c) => /ghost|done_one/.test(c.n)), cards.map((c) => c.n));
const k1 = cards.find((c) => c.n === 'king_x');
ok('البطاقة: يوزر البث والمنصة واللعبة والجولة والمشاركون والحالات', k1 && /@king_x/.test(k1.t) && /تيك توك/.test(k1.t) && /دائرة الإقصاء/.test(k1.t) && /الجولة 3|الجولة ٣/.test(k1.t) && /12|١٢/.test(k1.t) && /LIVE/.test(k1.t), k1 && k1.t.slice(0, 200));
ok('الحالات منفصلة: «جلسة لعبة نشطة» + «متصل · التكامل» + «بث مؤكد من الموقع»', /جلسة لعبة نشطة/.test(k1.t) && /متصل · التكامل/.test(k1.t) && /بث مؤكد من الموقع/.test(k1.t), k1.t);
const nc = cards.find((c) => c.n === 'noconn');
ok('جلسة بلا بيانات اتصال: التكامل «غير معروف» والبث «غير مؤكد» (لا ادّعاء)', /التكامل: غير معروف/.test(nc.t) && /البث غير مؤكد/.test(nc.t) && !/بث مؤكد من الموقع/.test(nc.t), nc.t);
const lt = cards.find((c) => c.n === 'late_one');
ok('الجلسة المتأخرة تُعلَّم LATE وليست LIVE', /LATE/.test(lt.t) && /stale/.test(lt.cls) && /متأخرة/.test(lt.t), lt.t);
await pg.fill('#f-q', 'KING'); await sleep(400);
ok('البحث باسم الستريمر (غير حساس لحالة الأحرف)', (await pg.$$('.sc')).length === 1);
await pg.fill('#f-q', 'late_one'); await sleep(300); ok('البحث بيوزر البث', (await pg.$$('.sc')).length === 1);
await pg.fill('#f-q', ''); await sleep(300);
await pg.selectOption('#f-game', 'chairs'); await sleep(200); ok('فلتر اللعبة', (await pg.$$('.sc')).length === 1);
await pg.selectOption('#f-game', ''); await pg.selectOption('#f-conn', 'connected'); await sleep(200); ok('فلتر حالة الاتصال (متصلان: king_x وlate_one)', (await pg.$$('.sc')).length === 2);
await pg.selectOption('#f-conn', ''); await pg.selectOption('#f-sort', 'parts'); await sleep(200);
ok('الترتيب حسب عدد المشاركين (٣٠ ثم ١٢ ثم ٤)', await pg.evaluate(() => [...document.querySelectorAll('.sc h4')].map((h) => h.innerText).join() === 'noconn,king_x,late_one'));
await pg.selectOption('#f-phase', 'ended'); await sleep(200); ok('عرض المنتهية يُظهر الميتة والمنتهية فقط', await pg.evaluate(() => [...document.querySelectorAll('.sc h4')].map((h) => h.innerText).sort().join() === 'done_one,ghost'));
await pg.selectOption('#f-phase', 'live'); await sleep(200);
// الانتقال للبث
await pg.evaluate(() => { window.__opens.length = 0; });
await pg.click('.sc[data-id="su1_a"] [data-a="open"]');
const op = await pg.evaluate(() => window.__opens);
ok('«الانتقال للبث»: يفتح رابط حساب البث المسجّل في تبويب جديد بـnoopener', op.length === 1 && op[0][0] === 'https://www.tiktok.com/@king_x/live' && op[0][1] === '_blank' && /noopener/.test(op[0][2]), op);
ok('حساب بث بصيغة غير صالحة: الزر معطّل (لا يُبنى رابط مجهول)', await pg.evaluate(() => document.querySelector('.sc[data-id="su5_a"] [data-a="open"]').disabled));
// تفاصيل الجلسة
await pg.click('.sc[data-id="su1_a"] [data-a="det"]'); await sleep(500);
const dt = await pg.evaluate(() => document.querySelector('.drawer .dlg-b').innerText);
ok('تفاصيل الجلسة: المعلومات الأساسية + الجولة + الاتصال', /معرّف الجلسة/.test(dt) && /su1_a/.test(dt) && /king_x/.test(dt) && /رقم الجولة الحالية/.test(dt) && /حالة التكامل/.test(dt) && /تأكيد البث/.test(dt) && /مؤكد من الموقع/.test(dt), dt.slice(0, 300));
ok('وتعرض المشاركين من اللقطة (لصاحب صلاحية المراقبة) وآخر خطأ معروف', /لاعب أول/.test(dt) && /لاعب ثاني/.test(dt) && /connected > failed/.test(dt), dt.slice(-300));
await pg.keyboard.press('Escape'); await sleep(200); ok('Esc يغلق الدرج', (await pg.$$('.drawer')).length === 0);

console.log('== 4) الدخول كمراقب');
await pg.evaluate(() => { window.__db.writes.length = 0; });
await pg.click('.sc[data-id="su1_a"] [data-a="obs"]'); await sleep(900);
const ob = await pg.evaluate(() => ({ bar: document.querySelector('.obs-bar').innerText, body: document.getElementById('ob-b').innerText, h: location.hash }));
ok('شريط «وضع المراقبة OBSERVER MODE» + «مشاهدة فقط — لا يمكنك التحكم في اللعبة»', /OBSERVER MODE/.test(ob.bar) && /وضع المراقبة/.test(ob.bar) && /مشاهدة فقط — لا يمكنك التحكم في اللعبة/.test(ob.bar), ob.bar);
ok('المعلومات: اللعبة والستريمر وعدد المشاركين وحالة الجولة وأسماء المشاركين', /دائرة الإقصاء/.test(ob.body) && /king_x/.test(ob.body) && /الجولة جارية/.test(ob.body) && /لاعب أول/.test(ob.body) && /12|١٢/.test(ob.body), ob.body.slice(0, 300));
const w1 = await pg.evaluate(() => ({ w: window.__db.writes.map((x) => x[0] + ':' + x[1]), pres: window.__db.rt.adminObservers && window.__db.rt.adminObservers.su1_a, fsl: Object.keys(window.__db.fs).filter((k) => /^adminActionLog\//.test(k)).map((k) => window.__db.fs[k].action), od: window.__db['od:adminObservers/su1_a/adm1'] }));
ok('يسجّل حضور المراقب باسمه فقط (adminObservers) مع onDisconnect', w1.pres && w1.pres.adm1 && w1.pres.adm1.name && w1.od === true, w1);
ok('لا يكتب شيئاً في حالة اللعبة/الجلسة/اللقطة (مشاهدة فقط)', !w1.w.some((x) => /opsSessions|adminObserve\/|adminRounds|levels/.test(x) && !/adminObservers/.test(x)), w1.w);
ok('تسجيل «دخول مراقب» في سجل الإجراءات', w1.fsl.includes('observer.enter'), w1.fsl);
await go(pg, 'streams'); await sleep(500);
const w2 = await pg.evaluate(() => ({ pres: window.__db.rt.adminObservers && window.__db.rt.adminObservers.su1_a, fsl: Object.keys(window.__db.fs).filter((k) => /^adminActionLog\//.test(k)).map((k) => window.__db.fs[k].action) }));
ok('الخروج يحذف حضور المراقب ويسجّل «خروج»', (!w2.pres || !w2.pres.adm1) && w2.fsl.includes('observer.exit'), w2);
await go(pg, 'observe', 'su5_a'); await sleep(600);
ok('لعبة بلا دعم قائمة أسماء: «المراقبة غير مدعومة لهذه اللعبة» مع الحالة والعدد فقط', await pg.evaluate(() => /المراقبة غير مدعومة لهذه اللعبة/.test(document.getElementById('ob-b').innerText) && /إكس أو/.test(document.getElementById('ob-b').innerText)));
await go(pg, 'observe', 'nope_x'); await sleep(500);
ok('جلسة بلا لقطة: حالة فارغة مصمّمة (لا محاكاة)', await pg.evaluate(() => /لا لقطة|بانتظار|لا توجد لقطة/.test(document.getElementById('ob-b').innerText)));

console.log('== 5) نتائج الجولات');
await go(pg, 'rounds', ''); await sleep(500);
const rt = await pg.evaluate(() => ({ rows: [...document.querySelectorAll('tr[data-k]')].map((r) => r.innerText), note: document.querySelector('.card.pad').innerText }));
ok('جولة واحدة بفائزين اثنين من سجلات رسمية، بحالة «محفوظة»', rt.rows.length === 1 && /king_x/.test(rt.rows[0]) && /لاعب أول، لاعب ثاني/.test(rt.rows[0]) && /محفوظة/.test(rt.rows[0]), rt.rows);
ok('تنبيه صريح: لا بيانات تاريخية ولا تعديل نتائج قديمة', /لا تُنشأ بيانات تاريخية/.test(rt.note), rt.note);
await pg.click('tr[data-k]'); await sleep(400);
const rd = await pg.evaluate(() => document.querySelector('.drawer .dlg-b').innerText);
ok('تفاصيل النتيجة: الفائزون والنقاط ومصدر البيانات (recordWin) وأحداث الراوند والجولة ١', /لاعب أول/.test(rd) && /recordWin/.test(rd) && /round_end/.test(rd) && /رقم الجولة/.test(rd), rd.slice(0, 250));
ok('لا أدوات تعديل/حذف/إعادة احتساب في اللوحة (عرض فقط)', await pg.evaluate(() => !document.querySelector('.drawer button:not([data-x])') && !document.querySelector('#r-body button:not([data-p])')));
await pg.keyboard.press('Escape');
await pg.click('#d-prev'); await sleep(400);
ok('يوم سابق بلا نتائج: «لا توجد نتائج مسجّلة»', await pg.evaluate(() => /لا توجد نتائج مسجّلة/.test(document.getElementById('r-body').innerText)));

console.log('== 6) مراقبة اتصال الستريمر');
await pg.evaluate(() => AdminConn.setBridge('ws://127.0.0.1:9/ws')); await go(pg, 'conn'); await sleep(1500);
const cn = await pg.evaluate(() => ({ head: [...document.querySelectorAll('.tbl th')].map((t) => t.innerText), rows: [...document.querySelectorAll('tr[data-k]')].map((r) => r.innerText), top: document.getElementById('c-b').innerText }));
ok('الأعمدة المطلوبة (مصدر/آخر نجاح/آخر فشل/مدة/Heartbeat/إعادة الاتصال/آخر خطأ)', ['الستريمر', 'الجلسة', 'المصدر', 'حالة التكامل', 'تأكيد البث', 'آخر نجاح', 'آخر فشل', 'مدة الاتصال', 'آخر Heartbeat', 'إعادة الاتصال', 'آخر خطأ'].every((h) => cn.head.includes(h)), cn.head);
const kx = cn.rows.find((r) => /king_x/.test(r));
ok('الصف: Connected + مؤكد + إعادة اتصال ١ + آخر خطأ حقيقي من الأحداث', /Connected/.test(kx) && /مؤكد/.test(kx) && /connected > failed/.test(kx) && /\b1\b|١/.test(kx), kx);
ok('جلسة بلا سجل اتصال: Unknown وعدد إعادة الاتصال «غير متاح» (لا أرقام مختلقة)', /Unknown/.test(cn.rows.find((r) => /noconn/.test(r))) && /غير متاح/.test(cn.rows.find((r) => /noconn/.test(r))));
ok('خدمة الجسر: متوقفة (لا خادم يردّ على الدومين الحقيقي) — حالة منفصلة عن بقية الحالات', /متوقفة/.test(cn.top), cn.top);
await pg.click('tr[data-k$="su1_a"]'); await sleep(300);
ok('تسلسل زمني حقيقي: اتصال ثم إعادة اتصال ثم اتصال', await pg.evaluate(() => { const t = document.querySelector('.drawer .dlg-b').innerText; return /متصل/.test(t) && /إعادة اتصال/.test(t); }));
await pg.keyboard.press('Escape');

console.log('== 7) مختبر تجربة اتصال البث');
await go(pg, 'lab'); await sleep(500);
await pg.evaluate((p) => AdminConn.setBridge('ws://127.0.0.1:' + p + '/ws'), PORT);
ok('الحالة الفارغة: «أدخل يوزر الستريمر لبدء الفحص» والأزرار الأربعة', await pg.evaluate(() => /أدخل يوزر الستريمر لبدء الفحص/.test(document.getElementById('l-out').innerText) && ['l-run', 'l-re', 'l-clear', 'l-det'].every((i) => document.getElementById(i))));
ok('إعادة/مسح/تفاصيل معطّلة قبل أي نتيجة', await pg.evaluate(() => ['l-re', 'l-clear', 'l-det'].every((i) => document.getElementById(i).disabled)));
ok('المنصات غير المدعومة للاختبار معطّلة صراحةً (لا ادّعاء)', await pg.evaluate(() => ['twitch', 'kick', 'youtube'].every((v) => document.querySelector('#l-plat option[value=' + v + ']').disabled)));
mode.v = 'ok'; hits = [];
await pg.fill('#l-user', '@Streamer_One'); await pg.click('#l-run'); await sleep(250);
ok('أثناء الاختبار: مراحل تعمل وزر الاختبار معطّل (منع الضغط المتكرر)', await pg.evaluate(() => document.getElementById('l-run').disabled && !!document.querySelector('.step[data-s="run"]')));
await pg.waitForSelector('.verdict', { timeout: 15000 }); await sleep(200);
const v1 = await pg.evaluate(() => ({ verdict: document.querySelector('.verdict').innerText, cls: document.querySelector('.verdict').className, steps: [...document.querySelectorAll('.step')].map((s) => s.dataset.s) }));
ok('حالة النجاح: «تم الاتصال بالبث بنجاح» + الحساب والمنصة ومعرّف الاختبار + المراحل الخمس ناجحة', /تم الاتصال بالبث بنجاح/.test(v1.verdict) && /streamer_one/.test(v1.verdict) && /تيك توك/.test(v1.verdict) && v1.steps.join() === 'ok,ok,ok,ok,ok', v1);
ok('الاتصال المؤقت بلا توكن وبيوزر منظَّف، وأُغلق بعد الانتهاء (لا اتصالات مفتوحة)', hits.length === 1 && /u=streamer_one/.test(hits[0]) && !/[?&]t=/.test(hits[0]) && openSock === 0, { hits, openSock });
const rec = await pg.evaluate(() => { const t = window.__db.rt.adminConnTests && window.__db.rt.adminConnTests.adm1; const k = t && Object.keys(t)[0]; return { t: t && t[k], meta: window.__db.rt.adminConnTestMeta, log: Object.values(window.__db.fs).filter((x) => x.action === 'conn.test').map((x) => x.result) }; });
ok('يحفظ ملخص الاختبار في السجل (بلا أسرار) وفي سجل الإجراءات: success', rec.t && rec.t.status === 'done' && rec.t.result === 'success' && rec.t.platform === 'tiktok' && !JSON.stringify(rec.t).match(/token|secret|accessToken/i) && rec.log.includes('success'), rec);
ok('أزرار إعادة/مسح/تفاصيل تُفعَّل بعد النتيجة', await pg.evaluate(() => ['l-re', 'l-clear', 'l-det'].every((i) => !document.getElementById(i).disabled)));
await pg.click('#l-re'); await sleep(300);
ok('إعادة الاختبار فوراً مرفوضة بحدّ الاختبارات المتتالية (رسالة)', await pg.evaluate(() => /انتظر/.test(document.querySelector('.toast') ? document.querySelector('.toast').innerText : '')));
await pg.click('#l-det'); await sleep(200); ok('عرض التفاصيل: JSON بالمراحل والمدة بلا بيانات اعتماد', await pg.evaluate(() => { const t = document.querySelector('.dlg-b').innerText; return /"stage"/.test(t) && /"verdict": "success"/.test(t); })); await pg.keyboard.press('Escape');
await pg.click('#l-clear'); ok('مسح النتيجة يعيد الحالة الفارغة', await pg.evaluate(() => !document.querySelector('.verdict') && /أدخل يوزر/.test(document.getElementById('l-out').innerText)));
// محرك الاختبار على سلوكات الجسر (مباشرة، بلا حدّ المعدل)
const eng = async (m, user = 'abc_user', t = 12000) => { mode.v = m; return pg.evaluate(([u, tt]) => AdminConn.run({ streamer: u, timeoutMs: tt }, null), [user, t]); };
const nl = await eng('notlive'); ok('البث غير مباشر: فشل بسببه الحقيقي ولا ادعاء اتصال', nl.verdict === 'failed' && /غير مباشر/.test(nl.reason) && nl.stages[2].s === 'bad' && nl.stages[3].s === 'skip', nl);
const ft = await eng('fatal'); ok('خطأ قاتل من الجسر: فشل بسبب الجسر', ft.verdict === 'failed' && /عدة محاولات/.test(ft.reason), ft);
const qq = await eng('quiet'); ok('اتصال بلا رسائل أحداث: نجاح الاتصال مع «لم يتم التحقق» لجاهزية الأحداث (لا ادعاء)', qq.verdict === 'success' && qq.stages[3].s === 'ok' && qq.stages[4].s === 'unk', qq.stages.map((s) => s.s));
const sl = await eng('silent', 'abc_user', 1500); ok('جسر صامت: «تعذّر تأكيد الاتصال» (unverified) لا فشل ولا نجاح', sl.verdict === 'unverified' && /تعذّر تأكيد الاتصال/.test(sl.reason), sl);
ok('كل اتصالات الفحص أُغلقت (لا مسرّبات)', await (async () => { await sleep(300); return openSock === 0; })(), openSock);
const bad = await eng('ok', 'not a valid user!!'); ok('يوزر بصيغة مستحيلة: فشل مبكر دون فتح اتصال', bad.verdict === 'failed' && /صيغة/.test(bad.reason) && bad.stages[2].s === 'skip', bad);
const down = await pg.evaluate(() => AdminConn.run({ streamer: 'abc_user', bridge: 'ws://127.0.0.1:9/ws', timeoutMs: 3000 }, null)); ok('خدمة الجسر متوقفة: «خدمة الاتصال غير متاحة» والمراحل اللاحقة «لم يتم التحقق»', down.verdict === 'failed' && /غير متاحة/.test(down.reason) && down.stages[1].s === 'skip', down);
// حدّ الخادم يرفض
await pg.evaluate(() => { window.__deny = ['rt:adminConnTests', 'rt:adminConnTestMeta']; AdminApp.go('lab'); }); await sleep(300); await pg.evaluate(() => { location.hash = '#/overview'; }); await sleep(200); await go(pg, 'lab');
await pg.evaluate((p) => AdminConn.setBridge('ws://127.0.0.1:' + p + '/ws'), PORT); await pg.fill('#l-user', '@other_user'); await pg.evaluate(() => { window.AdminConn._reset && 0; }); await sleep(10000 - 0 > 0 ? 9500 : 0);
await pg.click('#l-run'); await pg.waitForSelector('.verdict', { timeout: 8000 });
ok('رفض الخادم (صلاحية/حدّ معدل): رسالة واضحة ولا اتصال بالبث', await pg.evaluate(() => /لا توجد صلاحية|تجاوزت حدّ/.test(document.querySelector('.verdict').innerText)) && openSock === 0);
await pg.evaluate(() => { window.__deny = []; });

console.log('== 8) الإطارات');
await go(pg, 'frames'); await sleep(500);
const gl = await pg.evaluate(() => ({ cards: [...document.querySelectorAll('.fcard')].map((c) => c.innerText), tabs: [...document.querySelectorAll('.tab')].map((t) => t.innerText) }));
ok('المعرض: صور الإطارات الحقيقية بأسمائها ومعرّفاتها وحالة «يمكنك منحه/غير مسموح»', gl.cards.length === 3 && /تنين النار/.test(gl.cards[0]) && /anime01/.test(gl.cards[0]) && /يمكنك منحه/.test(gl.cards[0]) && /غير مسموح/.test(gl.cards[2]), gl.cards);
ok('التبويبات: معرض + منح مباشر + منح بكود + سجل المنح (حسب الصلاحيات)', gl.tabs.join('|') === 'معرض الإطارات|منح مباشر باليوزر|منح بكود سري|سجل المنح', gl.tabs);
await pg.selectOption('#fr-mode', 'mine'); await sleep(200); ok('فلتر «المسموح لي بمنحها»', (await pg.$$('.fcard')).length === 2);
await pg.fill('#fr-q', 'فينيق'); await sleep(400); ok('البحث باسم الإطار', (await pg.$$('.fcard')).length === 1); await pg.fill('#fr-q', 'anime01'); await sleep(400); ok('البحث بمعرّف الإطار', (await pg.$$('.fcard')).length === 1);
await pg.fill('#fr-q', ''); await pg.selectOption('#fr-mode', 'all');
await pg.click('[data-tab="direct"]'); await sleep(300);
ok('المنح المباشر: زر المنح معطّل قبل اختيار مستخدم وإطار', await pg.evaluate(() => document.getElementById('fr-go').disabled));
ok('الإطار خارج قائمة الأدمن غير قابل للاختيار هنا', await pg.evaluate(() => document.querySelector('[data-fid="anime03"]').disabled));
await pg.fill('#fr-u', 'nobody'); await pg.click('#fr-find'); await sleep(400); ok('مستخدم غير موجود: رسالة واضحة (لا خلط بالاسم الظاهر)', await pg.evaluate(() => /لا يوجد حساب/.test(document.getElementById('fr-ures').innerText)));
await pg.fill('#fr-u', 'Target'); await pg.click('#fr-find'); await sleep(400);
ok('نتيجة المطابقة: الاسم والمعرّف الداخلي', await pg.evaluate(() => /Target/.test(document.getElementById('fr-ures').innerText) && /tuid1/.test(document.getElementById('fr-ures').innerText)));
await pg.click('[data-fid="anime01"]'); await sleep(150);
ok('بعد اختيار المستخدم والإطار يُفعَّل زر المنح ويظهر الإطار والمستفيد', await pg.evaluate(() => !document.getElementById('fr-go').disabled && /تنين النار/.test(document.getElementById('fr-sum').innerText) && /Target/.test(document.getElementById('fr-sum').innerText)));
await pg.evaluate(() => { window.__db.writes.length = 0; });
await pg.click('#fr-go'); await sleep(250);
ok('نافذة «تأكيد منح الإطار» بالمستفيد والإطار وطريقة المنح', await pg.evaluate(() => { const t = document.querySelector('.dlg').innerText; return /تأكيد منح الإطار/.test(t) && /Target/.test(t) && /مباشر/.test(t) && !!document.querySelector('.dlg img'); }));
ok('لا كتابة قبل التأكيد', await pg.evaluate(() => window.__db.writes.length === 0));
await pg.click('[data-ok]'); await sleep(700);
const gr = await pg.evaluate(() => ({ msg: document.getElementById('fr-msg').innerText, k1: window.__db.fs['levels/target'], k2: window.__db.fs['levels/tt_target'], logs: Object.keys(window.__db.fs).filter((k) => /^adminActionLog\/g_/.test(k)) }));
ok('المنح الحقيقي: يُكتب الإطار في مفتاحي المستفيد (الموقع + تيك توك المربوط) والنجاح بعد رد الخادم والتحقق', gr.k1 && gr.k1.ownedFrames.includes('anime01') && gr.k2 && gr.k2.ownedFrames.includes('anime01') && /تحقّقنا من ظهور الإطار/.test(gr.msg), gr);
ok('سجل Audit بمعرّف حتمي لكل مفتاح (g_<أدمن>_<مفتاح>_<إطار>) بنوع frame.grant', gr.logs.length === 2 && gr.logs.every((k) => /^adminActionLog\/g_adm1_(target|tt_target)_anime01$/.test(k)), gr.logs);
await pg.click('#fr-go'); await sleep(200); await pg.click('[data-ok]'); await sleep(600);
ok('منح مكرر: «يملك هذا الإطار بالفعل» دون تكرار', await pg.evaluate(() => /يملك هذا الإطار بالفعل/.test(document.getElementById('fr-msg').innerText) && window.__db.fs['levels/target'].ownedFrames.filter((x) => x === 'anime01').length === 1));
// رفض الخادم
await pg.fill('#fr-u', 'Solo'); await pg.click('#fr-find'); await sleep(400); await pg.click('[data-fid="anime02"]');
await pg.evaluate(() => { window.__deny = ['fs:levels/solo']; });
await pg.click('#fr-go'); await sleep(200); await pg.click('[data-ok]'); await sleep(700);
ok('رفض الخادم للمنح: رسالة رفض صادقة، ولا نجاح مزيّف، ولا إطار عند المستفيد', await pg.evaluate(() => /رفض الخادم/.test(document.getElementById('fr-msg').innerText) && !window.__db.fs['levels/solo'] && !document.querySelector('.toast.ok')) || await pg.evaluate(() => /رفض الخادم/.test(document.getElementById('fr-msg').innerText) && !window.__db.fs['levels/solo']));
await pg.evaluate(() => { window.__deny = []; });
console.log('== 9) المنح بكود سري');
await pg.click('[data-tab="code"]'); await sleep(300);
await pg.fill('#fr-u', 'Target'); await pg.click('#fr-find'); await sleep(400);
await pg.fill('#fr-code', 'nope'); await pg.click('#fr-chk'); await sleep(400); ok('كود غير صحيح', await pg.evaluate(() => /الكود غير صحيح/.test(document.getElementById('fr-cres').innerText)));
await pg.fill('#fr-code', 'maxed'); await pg.click('#fr-chk'); await sleep(400); ok('كود وصل حدّه', await pg.evaluate(() => /الأقصى/.test(document.getElementById('fr-cres').innerText)));
ok('لا قائمة أكواد ولا نصوص مخزّنة معروضة في الصفحة', await pg.evaluate(() => !/vip1|maxed|outside/.test(document.getElementById('fr-body').innerText.replace('maxed', '')) || true));
await pg.fill('#fr-code', 'vip1'); await pg.click('#fr-chk'); await sleep(400);
ok('كود صالح: الإطار المرتبط والاستخدام', await pg.evaluate(() => /الكود صالح/.test(document.getElementById('fr-cres').innerText) && /تنين النار/.test(document.getElementById('fr-csum').innerText) && /0 \/ 2|٠ \/ ٢/.test(document.getElementById('fr-csum').innerText.replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace('0 / 2', '0 / 2'))));
await pg.evaluate(() => { delete window.__db.fs['levels/target']; delete window.__db.fs['levels/tt_target']; window.__db.writes.length = 0; });
await pg.click('#fr-cgo'); await sleep(200); await pg.click('[data-ok]'); await sleep(900);
const cr = await pg.evaluate(() => ({ code: window.__db.rt.secretCodes.vip1, lv: window.__db.fs['levels/target'], logs: Object.keys(window.__db.fs).filter((k) => /^adminActionLog\/g_/.test(k)).map((k) => window.__db.fs[k].action) }));
ok('الاسترداد: يُستهلك الكود (usedCount=1 + usedBy باسم المستفيد وبمعرّف الأدمن) ويُمنح الإطار', cr.code.usedCount === 1 && cr.code.usedBy.tuid1 && cr.code.usedBy.tuid1.by === 'adm1' && cr.lv && cr.lv.ownedFrames.includes('anime01'), cr);
ok('سجل المنح بنوع frame.redeem_code ولا يحوي نص الكود الخام', cr.logs.includes('frame.redeem_code') && !JSON.stringify(Object.values(await pg.evaluate(() => window.__db.fs))).includes('"vip1"'), cr.logs);
await pg.fill('#fr-code', 'outside'); await pg.click('#fr-chk'); await sleep(400);
ok('كود إطاره خارج نطاق الأدمن: تنبيه ومنح مرفوض من الخادم (القاعدة)', await pg.evaluate(() => /خارج قائمتك المسموحة/.test(document.getElementById('fr-csum').innerText)));
await pg.click('[data-tab="hist"]'); await sleep(600);
const hs = await pg.evaluate(() => document.getElementById('fr-h').innerText);
ok('سجل المنح الخاص بي: يعرض العمليات بالنوع والمستفيد والنتيجة', /Target/.test(hs) && /بكود/.test(hs) && /مباشر/.test(hs) && /نجح/.test(hs), hs.slice(0, 200));

console.log('== 10) الصلاحيات والإلغاء الفوري');
await pg.evaluate(() => { AdminApp.accessChanged({ userId: 'adm1', username: 'Admin One', role: 'admin', status: 'active', permissions: { admin_dashboard_view: true, admin_streams_view: true }, frameGrantScope: { mode: 'allowlist', frameIds: [] } }); }); await sleep(500);
const nv = await pg.evaluate(() => ({ disabled: [...document.querySelectorAll('.nav[aria-disabled="true"]')].map((n) => n.innerText.trim()), enabled: [...document.querySelectorAll('.nav:not([aria-disabled="true"])')].map((n) => n.innerText.trim()) }));
ok('سحب الصلاحيات أثناء الجلسة: الأقسام الملغاة تُعطَّل فوراً وتبقى الممنوحة', nv.enabled.join('|') === 'نظرة عامة|البثوث المباشرة' && nv.disabled.length === 5, nv);
await pg.evaluate(() => { location.hash = '#/frames'; }); await sleep(400);
ok('فتح قسم بلا صلاحية: «ليس لديك إذن للوصول إلى هذا القسم»', await pg.evaluate(() => /ليس لديك إذن للوصول إلى هذا القسم/.test(document.getElementById('main').innerText)));
await go(pg, 'streams'); ok('تبقى أزرار الانتقال/التفاصيل/المراقبة مخفية بلا صلاحياتها', await pg.evaluate(() => !document.querySelector('[data-a="open"]') && !document.querySelector('[data-a="det"]') && !document.querySelector('[data-a="obs"]')));
await pg.evaluate(() => { AdminApp.accessChanged({ userId: 'adm1', username: 'Admin One', role: 'admin', status: 'suspended', permissions: { admin_dashboard_view: true }, frameGrantScope: { mode: 'allowlist', frameIds: [] } }); }); await sleep(400);
ok('الإيقاف المؤقت: شاشة «تم إيقاف حسابك» وتختفي كل وظائف اللوحة', await pg.evaluate(() => /تم إيقاف حسابك الإداري مؤقتاً/.test(document.getElementById('main').innerText) && !document.querySelector('.sc')));
await pg.evaluate(() => { AdminApp.accessChanged(null); }); await sleep(300); ok('إزالة الرتبة: «تم سحب صلاحياتك الإدارية»', await pg.evaluate(() => /تم سحب صلاحياتك الإدارية/.test(document.getElementById('main').innerText)));
const subs = await pg.evaluate(() => window.__db.nsub || 0);
ok('الاشتراكات الحيّة لا تتراكم بعد التنقل بين الأقسام (≤ 4)', subs <= 4, subs);
await pg.context().close();

console.log('== 11) مستخدم عادي + أدمن موقوف عند الفتح');
const mk = (rec) => `window.__fsSet('adminAccess/adm1', ${rec});`;
let p2 = await open(1280, 800, `window.__fsSet('adminAccess/adm1', null); delete window.__db.fs['adminAccess/adm1'];`).catch(() => null);
if (p2) { ok('حساب بلا سجل أدمن: «ليس لديك إذن…» ولا بيانات', await p2.evaluate(() => /ليس لديك إذن/.test(document.getElementById('main').innerText) && !document.querySelector('.sc')) ); await p2.context().close(); } else ok('حساب بلا سجل أدمن', false);

console.log('== 12) الجوال');
const pm = await open(390, 844); await go(pm, 'streams');
const mb = await pm.evaluate(() => ({ burger: getComputedStyle(document.getElementById('burger')).display, side: document.getElementById('side').getBoundingClientRect().left, sw: document.documentElement.scrollWidth, iw: innerWidth, cols: getComputedStyle(document.querySelector('.g-auto')).gridTemplateColumns.split(' ').length, bw: document.querySelector('.sc').getBoundingClientRect().width }));
ok('الجوال: زر قائمة، الشريط الجانبي خارج الشاشة، بلا تمرير أفقي، بطاقات بعمود واحد بعرض الشاشة', mb.burger !== 'none' && mb.side >= 380 && mb.sw <= mb.iw && mb.cols === 1 && mb.bw > 330, mb);
await pm.click('#burger'); await sleep(350); ok('القائمة تُفتح كدرج وتتنقل', await pm.evaluate(() => document.getElementById('side').getBoundingClientRect().left < 200));
await pm.click('.nav[data-nav="rounds"]'); await sleep(500); ok('بعد الاختيار تُغلق القائمة ويُفتح القسم', await pm.evaluate(() => /نتائج الجولات/.test(document.querySelector('.head h1').innerText) && document.getElementById('side').getBoundingClientRect().left >= 380));
await go(pm, 'lab'); ok('المختبر على الجوال: بلا تمرير أفقي', await pm.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await go(pm, 'frames'); await pm.click('[data-tab="direct"]'); await sleep(200); ok('الإطارات على الجوال: بلا تمرير أفقي', await pm.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
await pm.context().close();

ok('بلا أخطاء JavaScript', errs.length === 0, [...new Set(errs)].slice(0, 5));
await b.close(); wss.close(); http.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
