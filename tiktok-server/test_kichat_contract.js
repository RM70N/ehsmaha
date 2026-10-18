// عقد سيرفر الجسر لمسار kichat.js: السيرفر الحقيقي (server.js بلا تعديل) + مكتبة kichat.js الحقيقية + محاكي كيك محلي (HTTP+Pusher/TLS).
// عملاء WebSocket هنا = نفس بروتوكول المتصفح (?platform=kick&u=...). لا شيء من هذا يتصل بكيك الحقيقي.
//   node test_kichat_contract.js
const Module = require('module');
const { EventEmitter } = require('events');
const assert = require('assert');
const WebSocket = require('ws');
const { startKickMock } = require('./test/kick-mock');

// الناقل القديم مزيّف (للتأكد من الرجوع إليه عند الحجب) + firebase-admin مزيّف كما بالاختبار القديم
const legacy = { connects: [] };
class FakeKickConnection extends EventEmitter {
  constructor(username) { super(); this.username = username; legacy.connects.push(username); }
  async connect() { setImmediate(() => this.emit('connected', { roomID: 777 })); return { roomID: '777' }; }
  disconnect() { this.emit('disconnected', undefined); }
}
const fakes = new Map();
fakes.set('kick-live-connector', { KickConnection: FakeKickConnection, Events: { ChatMessage: 'chatMessage', StreamEnd: 'streamEnd', Connected: 'connected', Disconnected: 'disconnected', Error: 'error' } });
fakes.set('firebase-admin', { apps: [], initializeApp() {}, credential: { cert: (x) => x },
  firestore: () => ({ collection: () => ({ doc: (id) => ({ get: async () => ({ exists: id === 'banneduser', data: () => ({ enabled: false }) }) }) }) }) });
const origLoad = Module._load;
Module._load = function (req) { if (fakes.has(req)) return fakes.get(req); return origLoad.apply(this, arguments); };
process.env.FIREBASE_SERVICE_ACCOUNT = '{"fake":true}';
process.env.PORT = '8098';
process.env.KICK_TRANSPORT = process.env.KICK_TRANSPORT || 'auto';

const BASE = 'ws://127.0.0.1:8098/ws';
const results = [];
function check(name, cond, detail) { results.push({ name, ok: !!cond }); console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? '  — ' + detail : '')); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(30); } return false; }
function open(qs, since) {
  const ws = new WebSocket(BASE + qs + (since ? '&since=' + since : ''));
  ws.seen = []; ws.closed = null;
  ws.on('message', (d) => { try { ws.seen.push(JSON.parse(d.toString())); } catch (e) { /* ignore */ } });
  ws.on('close', (code, reason) => { ws.closed = { code, reason: reason.toString() }; });
  ws.on('error', () => {});
  return ws;
}
const status = (ws) => ws.seen.filter((m) => m.type === 'bridge_status').map((m) => m.state);
const lastStatus = (ws) => ws.seen.filter((m) => m.type === 'bridge_status').pop();
const chats = (ws) => ws.seen.filter((m) => m.messages).flatMap((m) => m.messages).filter((m) => m.type === 'WebcastChatMessage');
const sender = (id, name, badges) => ({ id, username: name, slug: name.toLowerCase().replace(/_/g, '-'), identity: { color: '#fff', badges: (badges || []).map((type) => ({ type, text: type })) } });

(async () => {
  const M = await startKickMock();
  require('./server.js');
  await sleep(500);

  console.log('\n[1] المسار السعيد عبر kichat.js الحقيقية: اتصال + رسائل بنفس عقد الفرونت إند');
  M.setChannel('streamerone');
  const ws = open('?platform=kick&u=' + encodeURIComponent('  @StreamerOne '));
  check('الحالة connected', await until(() => status(ws).includes('connected')), JSON.stringify(status(ws)));
  check('لا استخدام للناقل القديم (kick-live-connector) مع kichat سليمة', legacy.connects.length === 0);
  check('اشتراك Pusher واحد فقط لقناة الدردشة (بلا حاجة لمتصفح Chromium)', M.connectionsTotal === 1, 'connections=' + M.connectionsTotal);
  M.chat('streamerone', { id: 'r1', content: 'انضمّ 😍 ١٢٣', dual: true, sender: sender(7, 'Ahmed_99', ['subscriber']) });
  check('وصلت الرسالة مرة واحدة (رغم قناتَي الاشتراك)', await until(() => chats(ws).length === 1) && (await sleep(200), chats(ws).length === 1), 'n=' + chats(ws).length);
  const msg = chats(ws)[0] || {};
  check("type='WebcastChatMessage' و comment كما كتبه المشاهد (عربي+تشكيل+إيموجي)", msg.type === 'WebcastChatMessage' && msg.comment === 'انضمّ 😍 ١٢٣', msg.comment);
  check('user.uniqueId = اسم المستخدم (username لا slug)، isFollower وfollowInfo موجودان', msg.user && msg.user.uniqueId === 'Ahmed_99' && msg.user.isFollower === true && msg.user.followInfo.followStatus === 1);
  check('الحقول الموحّدة: unified + isSubscriber + badges', msg.unified && msg.unified.platform === 'kick' && msg.unified.isSub === true && msg.user.isSubscriber === true && msg.user.badges[0] === 'subscriber', JSON.stringify(msg.unified));
  check('معرّف الحدث id بصيغة السيرفر (للـ replay وإزالة التكرار بالفرونت)', /^[a-z0-9]+\.\d+$/.test(msg.id || ''), msg.id);

  console.log('\n[2] عميلان لنفس القناة = اتصال Pusher واحد');
  const ws2 = open('?platform=kick&u=streamerone');
  await until(() => status(ws2).includes('connected'));
  check('الاتصال الثاني ما فتح اتصال كيك ثانياً', M.connectionsTotal === 1 && M.infoCalls.filter((s) => s === 'streamerone').length === 1, 'conns=' + M.connectionsTotal + ' info=' + M.infoCalls.length);
  M.chat('streamerone', { id: 'r2', content: 'للجميع', sender: sender(8, 'second') });
  check('الرسالة وصلت للعميلين', await until(() => chats(ws).some((m) => m.comment === 'للجميع') && chats(ws2).some((m) => m.comment === 'للجميع')));

  console.log('\n[3] إعادة الاتصال بعد قطع الشبكة + إعادة إرسال ما فات (replay)');
  const lastId = chats(ws).pop().id;
  ws.close(); await sleep(100);
  M.chat('streamerone', { id: 'r3', content: 'فاتتك', sender: sender(9, 'missed') });
  await sleep(150);
  const ws3 = open('?platform=kick&u=streamerone', lastId);
  check('العميل العائد يستلم ما فاته (replay)', await until(() => chats(ws3).some((m) => m.comment === 'فاتتك')), JSON.stringify(chats(ws3).map((m) => m.comment)));
  const conn0 = M.connectionsTotal;
  M.dropAll();
  check('قطع الاتصال: reconnecting ثم connected تلقائياً', await until(() => status(ws2).includes('reconnecting') && lastStatus(ws2).state === 'connected', 8000), JSON.stringify(status(ws2)));
  check('اتصال جديد واحد فقط (بلا تكرار)', M.connectionsTotal === conn0 + 1 && M.openCount() === 1, 'delta=' + (M.connectionsTotal - conn0));
  M.chat('streamerone', { id: 'r4', content: 'بعد الانقطاع', sender: sender(10, 'after') });
  check('الشات يعمل بعد الانقطاع', await until(() => chats(ws2).some((m) => m.comment === 'بعد الانقطاع')));

  console.log('\n[4] قناة غير موجودة / مدخل غير صالح');
  const w4 = open('?platform=kick&u=nobody_here_xyz');
  check('error + code user_not_found', await until(() => lastStatus(w4) && lastStatus(w4).state === 'error'), JSON.stringify(lastStatus(w4)));
  check('رسالة عربية واضحة', /غير موجودة/.test((lastStatus(w4) || {}).message || ''), (lastStatus(w4) || {}).message);
  check('user_not_found بالكود', (lastStatus(w4) || {}).code === 'user_not_found');
  const w4b = open('?platform=kick&u=' + encodeURIComponent('اسم عربي'));
  check('مدخل غير صالح (عربي/مسافات): user_not_found بلا اتصال', await until(() => lastStatus(w4b) && lastStatus(w4b).code === 'user_not_found'));
  w4.close(1000); w4b.close(1000);

  console.log('\n[5] قناة غير مباشرة');
  M.setChannel('sleeper', { live: false });
  const w5 = open('?platform=kick&u=sleeper');
  check('not_live (والمقبس مفتوح ينتظر البث)', await until(() => status(w5).includes('not_live')), JSON.stringify(status(w5)));
  M.event('sleeper', 'App\\Events\\StreamerIsLive', {});
  check('البث يبدأ ← connected بدون إعادة اتصال', await until(() => lastStatus(w5).state === 'connected'));
  w5.close(1000);

  console.log('\n[6] كيك يحجب الطلبات (403 / تحدّي Cloudflare) ← رجوع تلقائي للناقل القديم');
  M.setChannel('shielded', { status: 403 });
  const w6 = open('?platform=kick&u=shielded');
  check('اتصل عبر kick-live-connector الاحتياطي', await until(() => legacy.connects.includes('shielded') && status(w6).includes('connected')), JSON.stringify(status(w6)));
  M.setChannel('shield2', { status: 'html' });
  const w6b = open('?platform=kick&u=shield2');
  check('صفحة HTML بدل JSON = حجب ← رجوع للقديم أيضاً', await until(() => legacy.connects.includes('shield2')));
  w6.close(1000); w6b.close(1000);

  console.log('\n[7] انقطاع الإنترنت عن كيك ثم عودته');
  M.setChannel('netdown');
  const w7 = open('?platform=kick&u=netdown');
  await until(() => status(w7).includes('connected'));
  M.setChannel('netdown', { status: 'throw' }); M.rejectNew = true; M.dropAll();
  check('أثناء الانقطاع: reconnecting (لا انهيار)', await until(() => lastStatus(w7).state === 'reconnecting', 5000));
  await sleep(2500);
  M.rejectNew = false; M.setChannel('netdown', { status: 200 });
  check('عودة الإنترنت: connected تلقائياً', await until(() => lastStatus(w7).state === 'connected', 20000), JSON.stringify(status(w7).slice(-4)));
  M.chat('netdown', { id: 'n1', content: 'رجعنا', sender: sender(11, 'back') });
  check('الشات يعمل بعد عودة الإنترنت', await until(() => chats(w7).some((m) => m.comment === 'رجعنا')));

  console.log('\n[8] خروج الستريمر: إغلاق نظيف بلا اتصالات شبح');
  ws.close(1000); ws2.close(1000); ws3.close(1000); w7.close(1000); w5.close(1000); await sleep(100);
  check('كل الغرف تُغلق بعد المهلة ولا يبقى اتصال Pusher', await until(() => M.openCount() === 0, 40000), 'open=' + M.openCount());
  const total = M.connectionsTotal; await sleep(1500);
  check('لا إعادة اتصال بعد الإغلاق', M.connectionsTotal === total);

  console.log('\n[9] ضغط: ٢٠٠٠ رسالة/ثانية من ٣٠٠ مشاهد');
  M.setChannel('crowd');
  const w9 = open('?platform=kick&u=crowd'); await until(() => status(w9).includes('connected'));
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) M.chat('crowd', { id: 'c' + i, content: String(1 + (i % 3)), sender: sender(1000 + (i % 300), 'fan' + (i % 300)) });
  await sleep(1500);
  const got = chats(w9); const users = new Set(got.map((m) => m.user.uniqueId));
  check('السيرفر حيّ وكل مشاهد من الـ٣٠٠ وصل صوته على الأقل مرة', users.size === 300 && got.length <= 2000 && got.length >= 300, 'users=' + users.size + ' msgs=' + got.length);
  check('زمن المعالجة معقول (< 3ث)', Date.now() - t0 < 3000, (Date.now() - t0) + 'ms');
  w9.close(1000);

  const bad = results.filter((r) => !r.ok);
  console.log('\n================ النتيجة ================\nنجح: ' + (results.length - bad.length) + '/' + results.length);
  await M.stop(); process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
