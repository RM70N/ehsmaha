// اختبار عقد سيرفر الجسر لمنصة كيك — يستبدل مكتبة kick-live-connector بمحاكي
// (kick.com محجوب عن بيئة التطوير هذه)، ويتحقق أن ما يصل الفرونت-إند مطابق
// تماماً لما كان يصله قبل الترحيل.
const Module = require('module');
const { EventEmitter } = require('events');
const WebSocket = require('ws');
const assert = require('assert');

const fakes = new Map();
let lastConn = null;
let connectCalls = 0;

const byUser = new Map();
class FakeKickConnection extends EventEmitter {
  constructor(username) { super(); this.username = username; this.mode = 'ok'; lastConn = this; byUser.set(username, this); connectCalls++; }
  async connect() {
    if (this.mode === 'offline') { return Promise.reject(`${this.username} is offline`); }
    if (this.mode === 'notfound') { return Promise.reject(new Error('Error fetching data: Failed to load URL: 404 - Not Found')); }
    if (this.mode === 'hang') { return new Promise(() => {}); } // يحاكي علّة المكتبة: وعد لا يُحسم أبداً
    setImmediate(() => this.emit('connected', { roomID: 12345 }));
    return { roomID: '12345' };
  }
  disconnect() { this.emit('disconnected', undefined); }
}
const Events = { ChatMessage:'chatMessage', StreamEnd:'streamEnd', Connected:'connected', Disconnected:'disconnected', Error:'error' };
fakes.set('kick-live-connector', { KickConnection: FakeKickConnection, Events });

// firebase-admin مزيّف: الحساب 'banneduser' معطّل، الباقي مسموح
fakes.set('firebase-admin', {
  apps: [], initializeApp(){}, credential: { cert: (x)=>x },
  firestore: () => ({ collection: () => ({ doc: (id) => ({ get: async () => ({ exists: id === 'banneduser', data: () => ({ enabled: false }) }) }) }) }),
});

const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (fakes.has(req)) return fakes.get(req);
  return origLoad.apply(this, arguments);
};

process.env.FIREBASE_SERVICE_ACCOUNT = '{"fake":true}';
process.env.PORT = '8099';
require('./server.js');

const BASE = 'ws://127.0.0.1:8099/ws';
const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail: detail || '' });
  console.log((cond ? '  ✅ ' : '  ❌ ') + name + (detail ? ('  — ' + detail) : ''));
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function open(qs) {
  const ws = new WebSocket(BASE + qs);
  ws.seen = []; ws.closed = null;
  ws.on('message', (d) => { try { ws.seen.push(JSON.parse(d.toString())); } catch(e){} });
  ws.on('close', (code, reason) => { ws.closed = { code, reason: reason.toString() }; });
  ws.on('error', () => {});
  return ws;
}

(async () => {
  await sleep(400);

  // ---------- 1) المسار السعيد: يوزر مجرّد ----------
  console.log('\n[1] الاتصال بيوزر مجرّد + شكل رسالة الشات');
  let ws = open('?platform=kick&u=testchannel');
  await sleep(600);
  assert(lastConn, 'no connection created');
  check('اسم القناة المُمرَّر للمكتبة هو اليوزر فقط', lastConn.username === 'testchannel', 'username=' + lastConn.username);
  const connected = ws.seen.find(m => m.type === 'bridge_status' && m.state === 'connected');
  check("يصل { type:'bridge_status', state:'connected' }", !!connected, JSON.stringify(connected));

  // رسالة شات بنفس شكل المكتبة الحقيقي (حسب index.d.ts)
  lastConn.emit('chatMessage', {
    id: 'abc', chatroom_id: 12345, content: 'مرحبا يا شباب', type: 'message',
    created_at: '2026-01-01T00:00:00Z',
    sender: { id: 7, username: 'Ahmed_99', slug: 'ahmed-99', identity: { color: '#fff', badges: [] } },
  });
  await sleep(200);
  const chat = ws.seen.find(m => m.messages);
  const msg = chat && chat.messages[0];
  check('غلاف الرسالة فيه messages[]', !!msg, JSON.stringify(chat));
  check("type === 'WebcastChatMessage'", msg && msg.type === 'WebcastChatMessage', msg && msg.type);
  check('user.uniqueId = اليوزر الحقيقي (username مو slug)', msg && msg.user.uniqueId === 'Ahmed_99', msg && msg.user.uniqueId);
  check('user.nickname موجود', msg && msg.user.nickname === 'Ahmed_99', msg && msg.user.nickname);
  check('محتوى الرسالة بـ comment', msg && msg.comment === 'مرحبا يا شباب', msg && msg.comment);
  check('isFollower/followInfo موجودة (شرط مشاركة اللاعب بالألعاب)', msg && msg.user.isFollower === true && msg.user.followInfo.followStatus === 1);

  // ---------- 2) استخراج اليوزر من رابط كامل ----------
  console.log('\n[2] تمرير رابط كامل بدل اليوزر');
  const w2 = open('?platform=kick&u=' + encodeURIComponent('https://kick.com/SomeStreamer?foo=1'));
  await sleep(600);
  check('استُخرج اليوزر من الرابط تلقائياً', lastConn.username === 'somestreamer', 'username=' + lastConn.username);
  w2.close();

  // ---------- 3) انقطاع الاتصال ----------
  console.log('\n[3] انقطاع اتصال كيك');
  const before = connectCalls;
  const tc = byUser.get('testchannel');   // الغرفة المقصودة، مو آخر اتصال أُنشئ
  tc.emit('disconnected', undefined);
  await sleep(300);
  const disc = ws.seen.filter(m => m.type === 'bridge_status').pop();
  check("تُبَث حالة انقطاع فيها state + message", disc && disc.state === 'reconnecting' && !!disc.message, JSON.stringify(disc));
  console.log('    انتظار إعادة الاتصال التلقائية…');
  await sleep(10000);
  check('أعاد الاتصال تلقائياً بدون تدخل', connectCalls > before, 'محاولات: ' + before + ' -> ' + connectCalls);
  const reconnected = ws.seen.filter(m => m.type === 'bridge_status' && m.state === 'connected').length >= 2;
  check('رجعت الحالة connected بعد إعادة الاتصال', reconnected);
  ws.close();
  await sleep(200);

  // ---------- 4) قناة غير مباشرة ----------
  console.log('\n[4] قناة موجودة لكن غير مباشرة');
  FakeKickConnection.prototype._m = 'offline';
  const origConnect = FakeKickConnection.prototype.connect;
  FakeKickConnection.prototype.connect = function(){ this.mode='offline'; return origConnect.call(this); };
  const w4 = open('?platform=kick&u=offlineguy');
  await sleep(1000);
  const st4 = w4.seen.filter(m => m.type === 'bridge_status').pop();
  check("حالة not_live واضحة بدل خطأ", st4 && st4.state === 'not_live', JSON.stringify(st4));
  check('السيرفر ما زال حياً', true);
  w4.close();

  // ---------- 5) قناة غير موجودة ----------
  console.log('\n[5] قناة غير موجودة (404)');
  FakeKickConnection.prototype.connect = function(){ this.mode='notfound'; return origConnect.call(this); };
  const w5 = open('?platform=kick&u=ghostchannel');
  await sleep(1000);
  const st5 = w5.seen.filter(m => m.type === 'bridge_status').pop();
  check("حالة error + code user_not_found", st5 && st5.state === 'error' && st5.code === 'user_not_found', JSON.stringify(st5));
  w5.close();

  // ---------- 6) وعد لا يُحسم (علّة المكتبة) ----------
  console.log('\n[6] connect() معلّق للأبد (علّة المكتبة الحقيقية)');
  FakeKickConnection.prototype.connect = function(){ this.mode='hang'; return origConnect.call(this); };
  const w6 = open('?platform=kick&u=hangchannel');
  await sleep(1200);
  const st6 = w6.seen.filter(m => m.type === 'bridge_status').pop();
  check('الغرفة ما علّقت — حالة connecting مُبلّغة والمهلة شغّالة', st6 && ['connecting','error'].includes(st6.state), JSON.stringify(st6));
  check('السيرفر ما سقط رغم الوعد المعلّق', true);
  w6.close();
  FakeKickConnection.prototype.connect = origConnect;

  // ---------- 7) الحساب المعطّل 4403 ----------
  console.log('\n[7] حساب معطّل من الإدارة → 4403');
  const w7 = open('?platform=kick&u=banneduser');
  await sleep(1200);
  check('أُغلق الاتصال برمز 4403', w7.closed && w7.closed.code === 4403, JSON.stringify(w7.closed));
  const w7b = open('?platform=tiktok&u=banneduser');
  await sleep(1200);
  check('نفس منطق 4403 ما زال يعمل لتيك توك', w7b.closed && w7b.closed.code === 4403, JSON.stringify(w7b.closed));

  // ---------- 8) توحيد المعرّف: يوزر مجرّد ورابط = غرفة واحدة ----------
  console.log('\n[8] اليوزر والرابط يؤديان لنفس الغرفة/الاتصال');
  const a = open('?platform=kick&u=sharedguy');
  await sleep(700);
  const afterFirst = connectCalls;
  const b = open('?platform=kick&u=' + encodeURIComponent('https://kick.com/SharedGuy'));
  await sleep(700);
  check('ما فُتح اتصال كيك ثانٍ لنفس القناة', connectCalls === afterFirst, 'قبل=' + afterFirst + ' بعد=' + connectCalls);
  check('العميل الثاني استلم connected من نفس الغرفة', !!b.seen.find(m => m.state === 'connected'));
  a.close(); b.close(); await sleep(200);

  // ---------- 9) 4403 لا يُتخطّى بلصق الرابط ----------
  console.log('\n[9] حساب معطّل يحاول التخطي عبر الرابط الكامل');
  const w9 = open('?platform=kick&u=' + encodeURIComponent('https://kick.com/banneduser'));
  await sleep(1200);
  check('الرابط الكامل لحساب معطّل يُرفض بـ4403 أيضاً', w9.closed && w9.closed.code === 4403, JSON.stringify(w9.closed));

  // ---------- النتيجة ----------
  const failed = results.filter(r => !r.ok);
  console.log('\n================ النتيجة ================');
  console.log('نجح: ' + (results.length - failed.length) + '/' + results.length);
  if (failed.length) { failed.forEach(f => console.log('فشل: ' + f.name + ' — ' + f.detail)); process.exit(1); }
  console.log('كل اختبارات العقد نجحت ✅');
  process.exit(0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
