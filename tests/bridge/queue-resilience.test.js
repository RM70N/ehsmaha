'use strict';
// اختبار تكامل: طابور الاتصال + إعادة المحاولة الذكية + المزودون الاحتياطيون + منع التكرار + التعافي.
// يشغّل server.js الحقيقي (مع محاكي المكتبة) بعدة إعدادات، ويتحقق من تجربة المستخدم:
//   - عند أي فشل مؤقت (429 / 5xx / مهلة / سيرفر توقيع واقع / رفض) ما تصل الواجهة أي حالة error ولا نص "مزدحمة".
//   - الفشل النهائي فقط بعد استنفاد المحاولات، مع سبب واضح وقابل للتعافي بـ"إعادة المحاولة".
//   node tests/bridge/queue-resilience.test.js
const path = require('path');
const { spawn } = require('child_process');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

let nextPort = 18200;
async function startBridge(env) {
  const port = nextPort++, ctlPort = port + 1000;
  const child = spawn(process.execPath, [path.join(__dirname, 'start-server.js')], {
    env: Object.assign({}, process.env, { PORT: String(port), CTL_PORT: String(ctlPort), BRIDGE_HEARTBEAT_MS: '5000',
      EULER_API_KEY: '', EULER_SIGN_API_KEY: '', SIGN_API_KEY: '', EULER_API_KEYS: '', TIKTOK_PROXIES: '', TIKTOK_SIGN_FALLBACK_URLS: '' }, env || {}),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch('http://127.0.0.1:' + port + '/healthz'); if (r.ok) break; } catch (e) { /* not yet */ }
    await sleep(100);
  }
  const b = {
    port, ctlPort, child, log: () => log,
    ctl: (body) => fetch('http://127.0.0.1:' + ctlPort + '/ctl', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json()),
    stats: () => fetch('http://127.0.0.1:' + ctlPort + '/stats').then((r) => r.json()),
    health: () => fetch('http://127.0.0.1:' + port + '/health').then((r) => r.json()),
    stop: () => { try { child.kill('SIGKILL'); } catch (e) { /* ignore */ } },
  };
  return b;
}

// عميل يسجّل كل bridge_status بزمنه، تماماً كما تراها الواجهة.
function client(bridge, user, opts) {
  const ws = new WebSocket('ws://127.0.0.1:' + bridge.port + '/ws?u=' + encodeURIComponent(user) + ((opts && opts.query) || ''));
  const c = { ws, statuses: [], events: [], t0: Date.now(), closed: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.type === 'bridge_status') c.statuses.push(Object.assign({ at: Date.now() - c.t0 }, m));
    else if (Array.isArray(m.messages)) c.events.push(...m.messages);
  });
  ws.on('close', (code) => { c.closed = code; });
  c.opened = new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  c.close = (code) => { try { ws.close(code == null ? 1000 : code); } catch (e) { /* ignore */ } };
  c.states = () => c.statuses.map((s) => s.state + (s.code ? ':' + s.code : ''));
  c.connectedAt = () => { const s = c.statuses.find((x) => x.state === 'connected'); return s ? s.at : null; };
  c.last = () => c.statuses[c.statuses.length - 1] || {};
  return c;
}
async function until(fn, ms) { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return true; await sleep(50); } return !!fn(); }
const BAD_TEXT = /مزدحمة|انتظر دقيقة/;
const noUserFacingFailure = (c) => !c.statuses.some((s) => s.state === 'error' || s.fatal === true || BAD_TEXT.test(s.message || ''));

const bridges = [];
const mk = async (env) => { const b = await startBridge(env); bridges.push(b); return b; };

(async () => {
  // ============================================================ A) مزود واحد: أعطال مؤقتة ثم نجاح
  const A = await mk({ TIKTOK_RETRY_BASE_MS: '400', TIKTOK_RETRY_MAX_MS: '2000', TIKTOK_CONNECT_TIMEOUT_MS: '2500', TIKTOK_BREAKER_COOLDOWN_MS: '1000', TIKTOK_BREAKER_THRESHOLD: '2', TIKTOK_PROGRESS_TICK_MS: '500' });
  await A.ctl({ cmd: 'retryAfter', sec: 2 });

  const scenarios = [
    ['429 x3 ثم نجاح', ['rate_limited_typed', 'rate_limited_typed', 'rate_limited_typed', 'live'], 3],
    ['خطأ 5xx من سيرفر التوقيع x2 ثم نجاح', ['http500', 'http500', 'live'], 2],
    ['سيرفر التوقيع واقع (ECONNREFUSED) x2 ثم نجاح', ['sign_down', 'sign_down', 'live'], 2],
    ['مهلة الويب سوكيت x2 ثم نجاح', ['ws_timeout', 'ws_timeout', 'live'], 2],
    ['طلب يعلّق (بلا رد) ثم نجاح', ['hang', 'live'], 1],
    ['حجب تيك توك للمسار x2 ثم نجاح', ['composite_blocked', 'composite_blocked', 'live'], 2],
    ['رفض الربط (fail) x2 ثم نجاح', ['fail', 'fail', 'live'], 2],
  ];
  for (const [name, modes, fails] of scenarios) {
    const user = 'a' + Math.random().toString(36).slice(2, 8);
    await A.ctl({ cmd: 'script', user, modes });
    const c = client(A, user); await c.opened;
    const ok = await until(() => c.connectedAt() != null, 40000);
    const st = await A.stats();
    check('[A] ' + name + ' → يتصل تلقائياً', ok, { connectedAfterSec: ok ? Math.round(c.connectedAt() / 100) / 10 : null, connectCalls: st.connectCallsByUser[user] });
    check('[A] ' + name + ' → المستخدم لا يرى error ولا "مزدحمة"', noUserFacingFailure(c), c.states().slice(0, 8));
    check('[A] ' + name + ' → تُعرض محاولة/انتظار بدل الصمت', c.statuses.some((s) => (s.code === 'retrying' || s.code === 'queued') && (s.attempt >= 1)) && c.statuses.some((s) => /محاولة|الطابور/.test(s.message || '')), c.statuses.filter((s) => s.code === 'retrying').slice(0, 1).map((s) => s.message));
    check('[A] ' + name + ' → عدد المحاولات = الأعطال + 1', st.connectCallsByUser[user] === fails + 1, { calls: st.connectCallsByUser[user], expected: fails + 1 });
    c.close(1000);
  }

  // ============================================================ B) استنفاد المحاولات → فشل نهائي واضح + تعافٍ بـ"إعادة المحاولة"
  const B = await mk({ TIKTOK_MAX_ATTEMPTS: '4', TIKTOK_RETRY_BASE_MS: '300', TIKTOK_RETRY_MAX_MS: '500', TIKTOK_PARKED_RETRY_MS: '600000', TIKTOK_PROGRESS_TICK_MS: '500', TIKTOK_BREAKER_THRESHOLD: '100' });
  await B.ctl({ cmd: 'mode', user: 'giveup1', mode: 'sign_failed' });
  const g1 = client(B, 'giveup1'); await g1.opened;
  const gaveUp = await until(() => g1.statuses.some((s) => s.fatal), 30000);
  const fatal = g1.statuses.find((s) => s.fatal) || {};
  check('[B] بعد استنفاد المحاولات: حالة نهائية fatal/gave_up', gaveUp && fatal.state === 'error' && fatal.code === 'gave_up' && fatal.reason === 'sign_failed', { state: fatal.state, code: fatal.code, reason: fatal.reason, attempt: fatal.attempt });
  check('[B] الرسالة النهائية واضحة (سبب + "إعادة المحاولة") وبلا "انتظر دقيقة"', /إعادة المحاولة/.test(fatal.message || '') && /توقيع/.test(fatal.message || '') && !BAD_TEXT.test(fatal.message || ''), fatal.message);
  check('[B] لا حالة error/fatal قبل استنفاد المحاولات', g1.statuses.filter((s) => s.state === 'error' && !s.fatal).length === 0 && g1.statuses.filter((s) => s.fatal).length === 1);
  const callsAtGiveUp = (await B.stats()).connectCallsByUser.giveup1;
  check('[B] عدد المحاولات = الحد (لا حلقة سريعة بعده)', callsAtGiveUp === 4, { calls: callsAtGiveUp });
  await sleep(2500);
  check('[B] بعد الاستسلام لا محاولات جديدة قبل الاستيقاظ (5 دقائق)', (await B.stats()).connectCallsByUser.giveup1 === callsAtGiveUp);
  // "إعادة المحاولة": المزود رجع سليماً، والعميل يعيد فتح الاتصال
  await B.ctl({ cmd: 'mode', user: 'giveup1', mode: 'live' });
  g1.close(1000);
  await sleep(200);
  const g2 = client(B, 'giveup1'); await g2.opened;
  const revived = await until(() => g2.connectedAt() != null, 15000);
  check('[B] زر "إعادة المحاولة" (عميل جديد) يوقظ الغرفة ويتصل', revived, { connectedAfterSec: revived ? Math.round(g2.connectedAt() / 100) / 10 : null });
  g2.close(1000);

  // ميزانية الوقت: كل المزودين معطّلون (قاطع مفتوح) ← لا محاولات جديدة، ومع ذلك الفشل النهائي يصل بعد الميزانية
  const B2 = await mk({ TIKTOK_GIVE_UP_MS: '4000', TIKTOK_MAX_ATTEMPTS: '50', TIKTOK_RETRY_BASE_MS: '300', TIKTOK_BREAKER_THRESHOLD: '2', TIKTOK_BREAKER_COOLDOWN_MS: '120000', TIKTOK_PARKED_RETRY_MS: '600000', TIKTOK_PROGRESS_TICK_MS: '500' });
  await B2.ctl({ cmd: 'mode', user: 'budget1', mode: 'http500' });
  const b1 = client(B2, 'budget1'); await b1.opened;
  const bGave = await until(() => b1.statuses.some((s) => s.fatal), 20000);
  const bFatal = b1.statuses.find((s) => s.fatal) || {};
  check('[B2] القاطع مفتوح + ميزانية الوقت انتهت ← فشل نهائي بسبب واضح (بلا انتظار للأبد)', bGave && bFatal.code === 'gave_up' && bFatal.reason === 'sign_failed', { afterSec: Math.round((bFatal.at || 0) / 100) / 10, calls: (await B2.stats()).connectCallsByUser.budget1 });
  check('[B2] قبلها: فقط حالات "جاري الاتصال" بلا error', b1.statuses.filter((s) => !s.fatal).every((s) => s.state === 'connecting' || s.state === 'reconnecting'), b1.states());
  b1.close(1000);

  // ============================================================ C) مزودون احتياطيون: مفتاح A منهار → تبديل فوري لـB
  const C = await mk({ EULER_API_KEY: 'KEY-A', EULER_API_KEYS: 'KEY-B', TIKTOK_FREE_FALLBACK: '0', TIKTOK_BREAKER_COOLDOWN_MS: '60000', TIKTOK_PROGRESS_TICK_MS: '500' });
  const ch0 = await C.health();
  check('[C] مزودان مضبوطان من متغيرات البيئة (بلا كشف المفاتيح)', ch0.providers.length === 2 && ch0.eulerApiKey === 'set' && !JSON.stringify(ch0).includes('KEY-'), ch0.providers.map((p) => p.name));
  await C.ctl({ cmd: 'provider', key: 'KEY-A', mode: 'rate_limited_typed' });
  const t0 = Date.now();
  const cs = [];
  for (let i = 0; i < 6; i++) { const c = client(C, 'fo' + i); cs.push(c); await c.opened; }
  const allUp = await until(() => cs.every((c) => c.connectedAt() != null), 20000);
  check('[C] كل الغرف تتصل عبر المزود البديل رغم 429 من الأساسي', allUp, { maxSec: Math.round(Math.max(...cs.map((c) => c.connectedAt() || 0)) / 100) / 10 });
  check('[C] لا error/fatal/"مزدحمة" لأي عميل', cs.every(noUserFacingFailure));
  const ch1 = await C.health();
  const pA = ch1.providers.find((p) => p.name.startsWith('key1'));
  const pB = ch1.providers.find((p) => p.name.startsWith('key2'));
  check('[C] قاطع المزود الأول مفتوح، والثاني سليم ويحمل النجاحات', pA.breaker === 'open' && pB.breaker === 'closed' && pB.successes >= 6, { a: pA.breaker, b: pB.breaker, bSuccess: pB.successes });
  check('[C] عدّاد تبديل المزود ≥ 1 ومعدل الأول انخفض (AIMD)', ch1.tiktok.providerSwitches >= 1 && pA.ratePerMin < 90, { switches: ch1.tiktok.providerSwitches, rateA: pA.ratePerMin });
  const st = await C.stats();
  check('[C] المزود الأول ما أُغرق: طلبات قليلة قبل فتح قاطعه', (st.euler429['KEY-A'] || 0) <= 3, { calls429: st.euler429['KEY-A'] || 0 });
  cs.forEach((c) => c.close(1000));

  // ============================================================ D) اتصال واحد لكل يوزر
  const D = await mk({ BRIDGE_ROOM_IDLE_GRACE_MS: '800', BRIDGE_ROOM_RELOAD_GRACE_MS: '3000' });
  await D.ctl({ cmd: 'euler', perSec: 0, latencyMs: 300 }); // اتصال بطيء ليتراكب الضغط
  const user = 'dup1';
  const d1 = client(D, user), d2 = client(D, user), d3 = client(D, user); // ضغطتان + تبويب ثالث بنفس اللحظة
  await Promise.all([d1.opened, d2.opened, d3.opened]);
  await until(() => [d1, d2, d3].every((c) => c.connectedAt() != null), 8000);
  let s = await D.stats();
  check('[D] ضغطتان/ثلاثة تبويبات بنفس اللحظة = اتصال مكتبة واحد', s.connectCallsByUser[user] === 1 && s.upstreamLive === 1, { calls: s.connectCallsByUser[user], live: s.upstreamLive });
  // ريفرش أثناء الاتصال: يقفل ويفتح فوراً (1001) والغرفة تبقى
  await D.ctl({ cmd: 'mode', user: 'dup2', mode: 'live' });
  const r1 = client(D, 'dup2'); await r1.opened; r1.close(1001);
  await sleep(150);
  const r2 = client(D, 'dup2'); await r2.opened;
  await until(() => r2.connectedAt() != null, 8000);
  s = await D.stats();
  check('[D] ريفرش أثناء الاتصال: نفس الاتصال (بلا طلب توقيع ثانٍ)', s.connectCallsByUser.dup2 === 1 && (s.maxActiveByUser.dup2 || 0) === 1, { calls: s.connectCallsByUser.dup2, maxActive: s.maxActiveByUser.dup2 });
  // إغلاق مقصود ثم إعادة فتح سريعة بعد انتهاء المهلة تماماً: لا اتصالان متزامنان
  d1.close(1000); d2.close(1000); d3.close(1000);
  await sleep(1000); // ≈ انتهاء مهلة الإغلاق (0.8ث) — الإغلاق جارٍ
  const d4 = client(D, user); await d4.opened;
  await until(() => d4.connectedAt() != null, 10000);
  s = await D.stats();
  check('[D] إغلاق ثم إعادة فتح سريعة: لا اتصالان لنفس اليوزر بنفس الوقت أبداً', (s.maxActiveByUser[user] || 0) === 1, { maxActive: s.maxActiveByUser[user], calls: s.connectCallsByUser[user] });
  d4.close(1000); r2.close(1000);

  // ============================================================ E) انقطاع أثناء البث + اتصال ميت بصمت
  const E = await mk({ TIKTOK_RETRY_BASE_MS: '500', TIKTOK_UPSTREAM_SILENCE_MS: '2500', TIKTOK_MAINTENANCE_MS: '500', TIKTOK_PROGRESS_TICK_MS: '500' });
  await E.ctl({ cmd: 'pulse', ms: 400 });
  const e1 = client(E, 'live1'); await e1.opened;
  await until(() => e1.connectedAt() != null, 8000);
  await E.ctl({ cmd: 'dropUpstream', user: 'live1' });
  const back = await until(() => e1.states().filter((x) => x === 'connected').length >= 2, 15000);
  check('[E] انقطاع upstream أثناء البث ← يرجع تلقائياً بدون تدخل', back && e1.states().includes('reconnecting:retrying'), e1.states());
  check('[E] أثناء الانقطاع لا error/"مزدحمة"', noUserFacingFailure(e1));
  await E.ctl({ cmd: 'silent', on: true });
  const silentDetected = await until(() => /upstream_silent/.test(E.log()), 12000);
  await E.ctl({ cmd: 'silent', on: false });
  const backAgain = await until(() => e1.states().filter((x) => x === 'connected').length >= 3, 15000);
  check('[E] اتصال ميت بصمت (لا بيانات) ← يُكشف ويُعاد ربطه', silentDetected && backAgain, { detected: silentDetected, reconnected: backAgain });
  e1.close(1000);

  // ============================================================ F) الطابور: 40 ستريمر دفعة واحدة بحد معدل منخفض
  const F = await mk({ TIKTOK_CONNECT_RATE_PER_MIN: '600', TIKTOK_FREE_RATE_PER_MIN: '600', TIKTOK_CONNECT_BURST: '3', TIKTOK_CONNECT_INFLIGHT: '3', TIKTOK_PROGRESS_TICK_MS: '400' });
  await F.ctl({ cmd: 'euler', perSec: 12, burst: 3, latencyMs: 80, retryAfterSec: 1 });
  const fc = [];
  for (let i = 0; i < 40; i++) { const c = client(F, 'q' + i); fc.push(c); }
  await Promise.all(fc.map((c) => c.opened));
  await sleep(700);
  const midHealth = await F.health();
  const allConnected = await until(() => fc.every((c) => c.connectedAt() != null), 40000);
  const times = fc.map((c) => c.connectedAt() || 99999).sort((a, b) => a - b);
  check('[F] 40 ستريمر دفعة واحدة: الكل يتصل (بلا رفض)', allConnected, { maxSec: times[times.length - 1] / 1000 });
  check('[F] الطابور استُخدم فعلاً (طول > 0 وسط الضغط)', midHealth.queue.waiting > 0, midHealth.queue);
  check('[F] المستخدمون رأوا موقعهم بالطابور، وبلا error/"مزدحمة"', fc.some((c) => c.statuses.some((s) => s.code === 'queued' && s.queuePosition > 0 && /الطابور/.test(s.message || ''))) && fc.every(noUserFacingFailure));
  const positions = fc.map((c) => c.statuses.filter((s) => s.queuePosition).map((s) => s.queuePosition));
  check('[F] موقع الطابور لا يرتفع أثناء الانتظار (يتناقص فقط)', positions.every((ps) => ps.every((p, i) => i === 0 || p <= ps[i - 1])), positions.find((ps) => ps.some((p, i) => i > 0 && p > ps[i - 1])));
  const fs = await F.stats();
  check('[F] لم يُتجاوز حد المزود المحاكى (0 طلب 429)', (fs.euler429[''] || 0) === 0, { calls: fs.eulerCalls[''], rejected429: fs.euler429[''] || 0, maxInflight: fs.eulerInflightMax });
  fc.forEach((c) => c.close(1000));

  // ============================================================ G) مغادرة الستريمرز أثناء الانتظار لا تستهلك حصة
  const G = await mk({ TIKTOK_CONNECT_RATE_PER_MIN: '300', TIKTOK_FREE_RATE_PER_MIN: '300', TIKTOK_CONNECT_BURST: '2', TIKTOK_CONNECT_INFLIGHT: '2', BRIDGE_ROOM_IDLE_GRACE_MS: '300', TIKTOK_PROGRESS_TICK_MS: '400' });
  await G.ctl({ cmd: 'euler', perSec: 0, latencyMs: 50 });
  const gc = [];
  for (let i = 0; i < 40; i++) gc.push(client(G, 'gone' + i));
  await Promise.all(gc.map((c) => c.opened));
  await sleep(600);
  gc.slice(20).forEach((c) => c.close(1000)); // نصفهم يغلق الصفحة وهم بالطابور
  await until(() => gc.slice(0, 20).every((c) => c.connectedAt() != null), 30000);
  await sleep(1500);
  const gs = await G.stats();
  const gcalls = Object.values(gs.eulerCalls).reduce((a, x) => a + x, 0);
  check('[G] 20 من 40 غادروا وهم بالطابور: الباقون اتصلوا، والغائبون ما استهلكوا طلبات توقيع', gc.slice(0, 20).every((c) => c.connectedAt() != null) && gcalls <= 30, { providerCalls: gcalls, stayed: 20, left: 20 });
  gc.slice(0, 20).forEach((c) => c.close(1000));

  // ============================================================ H) سبعة مفاتيح (الأول + 6 إضافية): تحويل تلقائي متسلسل عند "خلص المفتاح"
  const KEYS = ['K1', 'K2', 'K3', 'K4', 'K5', 'K6', 'K7'];
  const Hb = await mk({ EULER_API_KEY: 'K1', EULER_API_KEYS: 'K2,K3,K4,K5,K6,K7', TIKTOK_FREE_FALLBACK: '0', BRIDGE_DIAG_TOKEN: 'diag-secret', TIKTOK_PROGRESS_TICK_MS: '400' });
  await Hb.ctl({ cmd: 'retryAfter', sec: 3 });
  const hs = await Hb.health();
  check('[H] سبعة مزودين بالترتيب، الأول active والباقي standby', hs.providers.map((p) => p.name).join(',') === KEYS.map((_, i) => 'key' + (i + 1) + '/direct').join(',') && hs.providers[0].role === 'active' && hs.providers.slice(1).every((p) => p.role === 'standby'), hs.providers.map((p) => p.name + ':' + p.role));
  const hopen = [];
  const connectRoom = async (name) => { const c = client(Hb, name); hopen.push(c); await c.opened; await until(() => c.connectedAt() != null, 15000); return c; };
  for (let i = 0; i < 5; i++) await connectRoom('h1_' + i);
  let hst = await Hb.stats();
  check('[H] المفتاح الأول وحده يخدم ما دام سليماً (الباقي 0 طلب)', hst.eulerCalls.K1 === 5 && KEYS.slice(1).every((k) => !hst.eulerCalls[k]), hst.eulerCalls);
  // "خلص" الأول والثاني: 429
  await Hb.ctl({ cmd: 'provider', key: 'K1', mode: 'rate_limited_typed' });
  await Hb.ctl({ cmd: 'provider', key: 'K2', mode: 'rate_limited_typed' });
  const r3 = await connectRoom('h2_0');
  await connectRoom('h2_1');
  hst = await Hb.stats();
  const hh = await Hb.health();
  check('[H] الأول والثاني خلصا ← الاتصال يمر تلقائياً للثالث، والرابع…السابع ما لُمست', r3.connectedAt() != null && hst.eulerCalls.K3 >= 2 && KEYS.slice(3).every((k) => !hst.eulerCalls[k]) && hh.providers[0].role === 'cooling' && hh.providers[1].role === 'cooling' && hh.providers[2].role === 'active', hh.providers.map((p) => p.name + ':' + p.role));
  check('[H] المستخدم ما شاف error/"مزدحمة" أثناء التحويل', hopen.every(noUserFacingFailure));
  check('[H] باللوغ: سطر provider_down للمفتاح الأول مع المفتاح التالي', /event=provider_down provider=key1\/direct kind=rate_limited/.test(Hb.log()) && /next=key2\/direct/.test(Hb.log()), (Hb.log().split('\n').find((l) => /provider_down/.test(l)) || '').slice(28, 200));
  // "خلص" الثالث..السادس: يبقى السابع
  for (const k of ['K3', 'K4', 'K5', 'K6']) await Hb.ctl({ cmd: 'provider', key: k, mode: 'denied' });
  await connectRoom('h3_0');
  hst = await Hb.stats();
  const h7 = await Hb.health();
  check('[H] حتى لو خلصت ستة مفاتيح: السابع يخدم والمستخدم يتصل', hst.eulerCalls.K7 >= 1 && h7.providers[6].role === 'active' && h7.providers.slice(0, 6).every((p) => p.role === 'cooling'), h7.providers.map((p) => p.name + ':' + p.role));
  // رجوع الأول تلقائياً بعد انتهاء retry-after
  await Hb.ctl({ cmd: 'provider', key: 'K1', mode: 'live' });
  await sleep(3500);
  const before = (await Hb.stats()).eulerCalls.K1;
  await connectRoom('h4_0');
  const after = (await Hb.stats()).eulerCalls.K1;
  const h8 = await Hb.health();
  check('[H] المفتاح الأول تعافى ← الاتصالات ترجع له تلقائياً (recovered باللوغ)', after > before && h8.providers[0].role === 'active' && /event=provider_recovered provider=key1\/direct/.test(Hb.log()), { callsBefore: before, callsAfter: after, role: h8.providers[0].role });
  // /diag: مغلق بلا كلمة سر، ومفتوح بها، وبلا مفاتيح
  const noTok = await fetch('http://127.0.0.1:' + Hb.port + '/diag');
  const badTok = await fetch('http://127.0.0.1:' + Hb.port + '/diag?token=wrong');
  const okTok = await fetch('http://127.0.0.1:' + Hb.port + '/diag?token=diag-secret');
  const dj = await okTok.json();
  check('[H] /diag: 404 بلا/بخطأ كلمة السر؛ ومع الصحيحة يعرض آخر الأعطال بأسبابها بلا مفاتيح', noTok.status === 404 && badTok.status === 404 && okTok.status === 200 && dj.recentFailures.length >= 2 && dj.recentFailures.some((f) => f.kind === 'rate_limited') && !JSON.stringify(dj).match(/"K[1-7]"|apiKey/), { failures: dj.recentFailures.length, kinds: [...new Set(dj.recentFailures.map((f) => f.kind))] });
  hopen.forEach((c) => c.close(1000));
  const noDiag = await mk({});
  check('[H] بدون BRIDGE_DIAG_TOKEN نقطة /diag مغلقة تماماً', (await fetch('http://127.0.0.1:' + noDiag.port + '/diag?token=')).status === 404);

  // ============================================================ I) الحد اليومي (rate_limit_account_day) كما ظهر بلوغات Render
  const I1 = await mk({ TIKTOK_PROGRESS_TICK_MS: '400' }); // مزود واحد (الطبقة المجانية) بلا مفاتيح
  await I1.ctl({ cmd: 'mode', user: 'daily1', mode: 'daily_limit' });
  const d1c = client(I1, 'daily1'); await d1c.opened;
  const dGave = await until(() => d1c.statuses.some((s) => s.fatal), 15000);
  const dFatal = d1c.statuses.find((s) => s.fatal) || {};
  const dCalls = (await I1.stats()).connectCallsByUser.daily1;
  check('[I] الحد اليومي بلا بديل: يعلن السبب فوراً (بلا انتظار دقائق) بعد محاولة واحدة', dGave && dFatal.code === 'gave_up' && dFatal.reason === 'daily_limit' && dCalls === 1 && (dFatal.at || 99999) < 5000, { afterMs: dFatal.at, calls: dCalls });
  check('[I] رسالة واضحة للمستخدم (الحد اليومي، تجدد/مفتاح جديد، إعادة المحاولة) بلا "مزدحمة"', /حدها اليومي/.test(dFatal.message || '') && /إعادة المحاولة/.test(dFatal.message || '') && !BAD_TEXT.test(dFatal.message || ''), dFatal.message);
  await sleep(1500);
  check('[I] بعد الإعلان لا طلبات جديدة تحرق الحصة (المزود مسكَّت لفترة طويلة)', (await I1.stats()).connectCallsByUser.daily1 === 1 && (await I1.health()).providers[0].cooldownSec > 1000, (await I1.health()).providers[0]);
  d1c.close(1000);
  // مع مفتاحين: الأول خلص يومياً ← الثاني يخدم والمستخدم لا يرى شيئاً
  const I2 = await mk({ EULER_API_KEY: 'D1', EULER_API_KEYS: 'D2', TIKTOK_FREE_FALLBACK: '0' });
  await I2.ctl({ cmd: 'provider', key: 'D1', mode: 'daily_limit' });
  const d2c = client(I2, 'daily2'); await d2c.opened;
  const d2ok = await until(() => d2c.connectedAt() != null, 10000);
  const h2i = await I2.health();
  check('[I] مفتاحان: الأول خلص حده اليومي ← الثاني يخدم فوراً، والأول مسكَّت ساعات، بلا error للمستخدم', d2ok && noUserFacingFailure(d2c) && h2i.providers[0].role === 'cooling' && h2i.providers[0].cooldownSec >= 1700 && h2i.providers[1].role === 'active', h2i.providers.map((p) => p.name + ':' + p.role + ':' + p.cooldownSec));
  d2c.close(1000);

  bridges.forEach((b) => b.stop());
  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED / ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); bridges.forEach((b) => b.stop()); process.exit(1); });
