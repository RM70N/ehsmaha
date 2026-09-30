'use strict';
// اختبار عقد الجسر + سياسة التعافي (بدون متصفح) على server.js الحقيقي مع محاكي المكتبة:
//   EULER_API_KEY=dummy-test-key PORT=18095 CTL_PORT=19095 node tests/bridge/start-server.js &
//   T_PORT=18095 T_CTL=19095 node tests/bridge/bridge-contract.test.js
//
// يتحقق من: غلاف {messages:[...]}، أفتار https صالح في user.profilePictureUrl (+avatar/avatarUrl)،
// uniqueId/nickname، اتصال مكتبة واحد لعميلين على نفس اليوزر، /health، تمرير signApiKey،
// وتصنيف الأخطاء + التراجع (لا حلقة سريعة) + بوابة 429 المشتركة.
const path = require('path');
const WebSocket = require(path.join(__dirname, '../../tiktok-server/node_modules/ws'));
const PORT = Number(process.env.T_PORT || 18095), CTL = Number(process.env.T_CTL || 19095);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ctl = (b) => fetch('http://127.0.0.1:' + CTL + '/ctl', { method: 'POST', body: JSON.stringify(b) }).then((r) => r.json());
const stats = () => fetch('http://127.0.0.1:' + CTL + '/stats').then((r) => r.json());
const health = () => fetch('http://127.0.0.1:' + PORT + '/health').then((r) => r.json()).catch(() => ({ platforms: { tiktok: {} }, tiktok: {} }));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

function open(user) {
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?u=' + encodeURIComponent(user));
  ws.msgs = [];
  ws.statuses = [];
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    ws.msgs.push(m);
    if (m.type === 'bridge_status') ws.statuses.push(m);
  });
  return new Promise((r, j) => { ws.on('open', () => r(ws)); ws.on('error', j); });
}
async function waitFor(fn, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(50); }
  return fn();
}
const eventsOf = (ws) => ws.msgs.filter((m) => Array.isArray(m.messages)).flatMap((m) => m.messages);
const lastStatus = (ws) => ws.statuses[ws.statuses.length - 1] || {};
const codes2 = (w) => w.statuses.map((s) => s.state + (s.code ? ':' + s.code : ''));
const isHttps = (u) => { try { return new URL(u).protocol === 'https:'; } catch (e) { return false; } };
const gapsOf = (times) => (times || []).slice(1).map((t, i) => Math.round((t - times[i]) / 100) / 10);

(async () => {
  // ---------------------------------------------------------------- 1) العقد + المشاركة
  await ctl({ cmd: 'defaultMode', mode: 'live' });
  const a = await open('Contract1');
  const b = await open('contract1');
  await waitFor(() => lastStatus(a).state === 'connected' && lastStatus(b).state === 'connected', 3000);
  check('both clients connected', lastStatus(a).state === 'connected' && lastStatus(b).state === 'connected');
  let st = await stats();
  check('two clients share ONE library connection', st.connectCallsByUser.contract1 === 1 && st.upstreamLive === 1, { calls: st.connectCallsByUser.contract1, upstreamLive: st.upstreamLive });
  check('signApiKey passed to library from EULER_API_KEY', st.signKeyUsed.length > 0 && st.signKeyUsed.every(Boolean), st.signKeyUsed);

  const cases = [
    { viewer: 'v_https', avatars: { avatarThumb: ['https://p16.example.com/thumb.webp', 'https://p16.example.com/thumb.jpeg'], avatarMedium: ['https://p16.example.com/medium.webp'] }, expect: 'https://p16.example.com/thumb.webp' },
    { viewer: 'v_http', avatars: { avatarThumb: ['', 'http://p16.example.com/insecure.jpeg'] }, expect: 'https://p16.example.com/insecure.jpeg' },
    { viewer: 'v_medium', avatars: { avatarThumb: [], avatarMedium: ['https://p16.example.com/medium.jpeg'] }, expect: 'https://p16.example.com/medium.jpeg' },
    { viewer: 'v_none', avatars: {}, expect: '' },
  ];
  for (const c of cases) await ctl({ cmd: 'chat', user: 'contract1', viewer: c.viewer, nickname: 'Nick ' + c.viewer, text: 'مرحبا ' + c.viewer, avatars: c.avatars, identity: { isFollowerOfAnchor: true } });
  await ctl({ cmd: 'gift', user: 'contract1', viewer: 'v_gift', nickname: 'Gifter', giftName: 'Rose', diamondCount: 1, avatars: { avatarThumb: ['https://p16.example.com/gift.webp'] } });
  await ctl({ cmd: 'follow', user: 'contract1', viewer: 'v_follow' });
  await waitFor(() => eventsOf(a).length >= 6 && eventsOf(b).length >= 6, 3000);

  check('every event arrives inside {messages:[...]}', a.msgs.filter((m) => m.type !== 'bridge_status' && m.type !== 'bridge_ping').every((m) => Array.isArray(m.messages)));
  const chats = eventsOf(a).filter((e) => e.type === 'WebcastChatMessage');
  for (const c of cases) {
    const e = chats.find((x) => x.user.uniqueId === c.viewer);
    const u = e && e.user;
    const ok = !!u && u.profilePictureUrl === c.expect && u.avatar === c.expect && u.avatarUrl === c.expect && (c.expect === '' || isHttps(u.profilePictureUrl));
    check('avatar ' + c.viewer + ' -> ' + (c.expect || '(empty)'), ok, u && u.profilePictureUrl);
  }
  check('chat has uniqueId + nickname + comment', chats.length === 4 && chats.every((e) => e.user.uniqueId && e.user.nickname.startsWith('Nick ') && e.comment.startsWith('مرحبا')));
  check('follower flags kept (followRole/isFollower/followInfo.followStatus)', chats.every((e) => e.user.followRole === 1 && e.user.isFollower === true && e.user.followInfo.followStatus === 1 && e.user.followKnown === true));
  const gift = eventsOf(a).find((e) => e.type === 'WebcastGiftMessage');
  check('gift event: https avatar + uniqueId + nickname', !!gift && gift.user.uniqueId === 'v_gift' && gift.user.nickname === 'Gifter' && isHttps(gift.user.profilePictureUrl) && gift.giftName === 'Rose', gift && gift.user);
  const follow = eventsOf(a).find((e) => e.type === 'WebcastSocialMessage');
  check('follow event: WebcastSocialMessage + uniqueId + isFollower', !!follow && follow.user.uniqueId === 'v_follow' && follow.user.isFollower === true && 'profilePictureUrl' in follow.user);
  check('second client got the same events', eventsOf(b).length === eventsOf(a).length);

  const h = await health();
  check('/health reports rooms/clients/key/lib version', h.ok === true && h.platforms.tiktok.clients === 2 && h.eulerApiKey === 'set' && h.tiktokLiveConnector === '2.5.0' && Array.isArray(h.providers) && !JSON.stringify(h).includes('contract1') && !JSON.stringify(h).includes('dummy-test-key'), { rooms: h.rooms, clients: h.wsClients, key: h.eulerApiKey, lib: h.tiktokLiveConnector });
  const hz = await fetch('http://127.0.0.1:' + PORT + '/healthz');
  check('/healthz unchanged (200 + {ok,rooms})', hz.status === 200 && (await hz.json()).ok === true);

  a.close(1000); b.close(1000);
  await sleep(6500);
  st = await stats();
  check('library connection closed after last client left (grace 5s)', st.upstreamLive === 0, { upstreamLive: st.upstreamLive });

  // ---------------------------------------------------------------- 2) الأعطال (بالتوازي) — دلالات الطابور الجديد
  // (تفاصيل السيناريوهات الكاملة: queue-resilience.test.js). هنا نتأكد أن العقد مع الواجهة سليم لكل نوع خطأ.
  const scen = {
    nl1: 'not_live', nf1: 'user_not_found', cnf1: 'composite_not_found', cb1: 'composite_blocked',
    cnr1: 'composite_no_room', sf1: 'sign_failed', qd1: 'quick_drop', se1: 'live', dr1: 'live',
  };
  for (const [u, mode] of Object.entries(scen)) await ctl({ cmd: 'mode', user: u, mode });
  const t0 = Date.now();
  const ws = {};
  for (const u of Object.keys(scen)) ws[u] = await open(u);
  await waitFor(() => lastStatus(ws.se1).state === 'connected' && lastStatus(ws.dr1).state === 'connected', 3000);
  await ctl({ cmd: 'streamEnd', user: 'se1' });
  await ctl({ cmd: 'dropUpstream', user: 'dr1' });
  await sleep(Math.max(0, 17000 - (Date.now() - t0)));
  st = await stats();
  const calls = (u) => st.connectCallsByUser[u] || 0;
  const codes = (u) => ws[u].statuses.map((s) => s.state + (s.code ? ':' + s.code : ''));
  const reasons = (u) => ws[u].statuses.map((s) => s.reason).filter(Boolean);
  const noError = (u) => !ws[u].statuses.some((s) => s.state === 'error');

  const nlGaps = gapsOf(st.connectTimesByUser.nl1);
  check('offline user -> not_live, re-check only every >=14s (20s +-25%)', codes('nl1').includes('not_live') && calls('nl1') <= 2 && nlGaps.every((g) => g >= 14), { calls: calls('nl1'), gaps: nlGaps });
  check('missing user -> user_not_found, no retry within 17s (60s base)', codes('nf1').includes('error:user_not_found') && calls('nf1') === 1, { calls: calls('nf1') });
  check('composite (api-live 19881007) -> user_not_found', codes('cnf1').includes('error:user_not_found'));
  check('composite (captcha/blocked) -> retrying(reason=blocked), never user_not_found, no error state', reasons('cb1').includes('blocked') && !codes('cb1').includes('error:user_not_found') && noError('cb1'), codes('cb1').slice(0, 4));
  check('composite (no room id anywhere) -> not_live', codes('cnr1').includes('not_live') && !codes('cnr1').includes('error:user_not_found'));
  check('sign failure -> keeps trying with visible attempt numbers (no error/fatal shown to the user)', reasons('sf1').includes('sign_failed') && noError('sf1') && ws.sf1.statuses.some((s) => s.attempt >= 3 && /محاولة/.test(s.message || '')) && !ws.sf1.statuses.some((s) => s.fatal), { attempts: Math.max(...ws.sf1.statuses.map((s) => s.attempt || 0)), calls: calls('sf1') });
  const sfGaps = gapsOf(st.connectTimesByUser.sf1).filter((g) => g > 0.5);
  check('sign failure: bounded attempts (<=8 in 17s), rounds spaced >=1.5s, then the breaker holds traffic (never a fast loop)', calls('sf1') <= 8 && sfGaps.length >= 1 && sfGaps.every((g) => g >= 1.5), { calls: calls('sf1'), roundGaps: sfGaps });
  const qdGaps = gapsOf(st.connectTimesByUser.qd1);
  check('connect-then-instant-drop does NOT loop fast (<=4 calls in 17s, gaps grow)', calls('qd1') <= 4 && qdGaps[qdGaps.length - 1] > qdGaps[0], { calls: calls('qd1'), gaps: qdGaps });
  check('stream end -> not_live and waits (no 1.5s reconnect)', lastStatus(ws.se1).state === 'not_live' && !codes('se1').slice(codes('se1').lastIndexOf('connected')).some((x) => x.startsWith('reconnecting')) && calls('se1') === 1, { calls: calls('se1'), states: codes('se1') });
  const drGaps = gapsOf(st.connectTimesByUser.dr1);
  check('network drop -> reconnecting -> reconnected after ~2s', codes('dr1').some((x) => x.startsWith('reconnecting')) && lastStatus(ws.dr1).state === 'connected' && calls('dr1') === 2, { gaps: drGaps });
  for (const u of Object.keys(ws)) ws[u].close(1000);

  // ---------------------------------------------------------------- 3) 429 (مزودان: مفتاح + الطبقة المجانية كملاذ أخير)
  await ctl({ cmd: 'retryAfter', sec: 45 });
  await ctl({ cmd: 'mode', user: 'rl1', mode: 'rate_limited_typed' });
  const rl1 = await open('rl1');
  await waitFor(() => rl1.statuses.some((s) => s.reason === 'rate_limited'), 3000);
  const rlStatus = rl1.statuses.find((s) => s.reason === 'rate_limited') || {};
  check('429 -> user sees "connecting" (retrying/queued) with attempt info, never an error', ['connecting', 'reconnecting'].includes(rlStatus.state) && ['retrying', 'queued'].includes(rlStatus.code) && !rl1.statuses.some((s) => s.state === 'error'), { state: rlStatus.state, code: rlStatus.code, message: rlStatus.message });
  await waitFor(() => rl1.statuses.some((s) => s.retryInSec >= 30 || s.etaSec >= 30), 4000);
  check('429 -> retry time comes from retry-after (45s) and is shown', rl1.statuses.some((s) => (s.retryInSec >= 30 || s.etaSec >= 30)), rl1.statuses.map((s) => s.retryInSec || s.etaSec).filter(Boolean).slice(0, 4));
  const rl2 = await open('rl2'); // يوزر سليم أثناء تعطّل كل المزودين بـ429
  await sleep(1500);
  st = await stats();
  check('all providers cooling down: healthy room waits in queue instead of burning quota', (st.connectCallsByUser.rl2 || 0) === 0 && rl2.statuses.some((s) => s.code === 'queued' && s.queuePosition > 0) && !rl2.statuses.some((s) => s.state === 'error'), { rl2Calls: st.connectCallsByUser.rl2 || 0, states: rl2.states ? undefined : codes2(rl2) });
  const h2 = await health();
  check('/health shows breakers open + queue length', h2.providers.every((p) => p.breaker === 'open') && h2.queue.waiting >= 1, { breakers: h2.providers.map((p) => p.name + ':' + p.breaker), queue: h2.queue });
  rl1.close(1000); rl2.close(1000);

  const bad = results.filter((r) => !r.ok).length;
  console.log(bad ? bad + ' FAILED / ' + results.length : 'ALL PASSED (' + results.length + ')');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
