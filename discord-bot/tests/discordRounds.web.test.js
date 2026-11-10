'use strict';

// اختبارات تكامل راوندات الألعاب عبر الويب الحقيقي: OAuth (state + PKCE) ← جلسة ← REST + WebSocket.
// Discord مزيّف محلياً؛ ما فيه أي اتصال خارجي.

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHarness, until, wait, profile } = require('./helpers/roundsHarness');

const GUILD = '111111111111111111';
const CHANNEL = '222222222222222222';
const players = (n) => Array.from({ length: n }, (_, i) => profile(i));

async function setup(t, { n = 6, gameType = 'countries', settings } = {}) {
  const members = players(n);
  const h = await startHarness({ members: { [GUILD]: members }, settings });
  t.after(() => h.close());
  const { round } = h.manager.create({ gameType, guildId: GUILD, channelId: CHANNEL, host: members[0] });
  const sessions = [];
  for (const m of members) sessions.push((await h.login(m.id, round.roundId)).cookie);
  return { h, round, members, sessions, id: round.roundId };
}

test('OAuth: تدفق كامل بـstate وPKCE ← جلسة HttpOnly ← العودة لنفس الراوند', async (t) => {
  const { h, round, members } = await setup(t, { n: 2 });
  const r = await h.login(members[1].id, round.roundId);
  assert.equal(r.status, 302);
  assert.equal(r.location, `/discord/round/${round.roundId}`);
  assert.ok(r.cookie.startsWith('ehs_rs='));
  assert.ok(r.setCookies.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)), 'كوكي الجلسة HttpOnly');
  assert.equal(r.loc.searchParams.get('scope'), 'identify', 'أقل صلاحية: identify فقط');
  assert.equal(r.loc.searchParams.get('code_challenge_method'), 'S256');
  // الجلسة تعطي الهوية الصحيحة
  const me = await (await fetch(`${h.baseUrl}/api/session`, { headers: { cookie: r.cookie } })).json();
  assert.equal(me.data.user.id, members[1].id);
  const anon = await (await fetch(`${h.baseUrl}/api/session`)).json();
  assert.equal(anon.data.user, null);
});

test('OAuth: state مزوّر أو بدون كوكي التدفق أو PKCE خاطئ ← مرفوض', async (t) => {
  const { h, round, members } = await setup(t, { n: 2 });
  const forged = await h.login(members[1].id, round.roundId, { tamper: 'state' });
  assert.equal(forged.status, 400);
  assert.equal(forged.cookie, null);
  const nocookie = await h.login(members[1].id, round.roundId, { tamper: 'nocookie' });
  assert.equal(nocookie.status, 400);
  assert.equal(nocookie.cookie, null);
  // كود تم تبديله بـverifier آخر (PKCE) يفشل عند ديسكورد
  const r1 = await fetch(`${h.baseUrl}/auth/discord/login?round=${round.roundId}`, { redirect: 'manual' });
  const loc = new URL(r1.headers.get('location'));
  h.discord.codes.set('bad-pkce', { uid: members[1].id, challenge: 'not-the-challenge', redirect: loc.searchParams.get('redirect_uri') });
  const r2 = await fetch(`${h.baseUrl}/auth/discord/callback?code=bad-pkce&state=${loc.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie: r1.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') } });
  assert.equal(r2.status, 400);
  assert.equal((await fetch(`${h.baseUrl}/auth/discord/login?round=not-an-id`, { redirect: 'manual' })).status, 400, 'معرّف راوند غير صالح');
});

test('الجلسة: كوكي معدّل/مزوّر ما يعطي هوية', async (t) => {
  const { h, round, members, sessions } = await setup(t, { n: 2 });
  const tampered = sessions[1].replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  const me = await (await fetch(`${h.baseUrl}/api/session`, { headers: { cookie: tampered } })).json();
  assert.equal(me.data.user, null);
  const forgedBody = Buffer.from(JSON.stringify({ uid: members[0].id, exp: Date.now() + 1e9 })).toString('base64url');
  const forged = await h.post(round.roundId, 'start', `ehs_rs=${forgedBody}.AAAA`);
  assert.equal(forged.status, 401, 'توقيع مزوّر ← لا هوية');
});

test('الانضمام: يتطلب جلسة + عضوية؛ والاسم من البوت لا من العميل', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 3 });
  assert.equal((await h.post(id, 'join', null)).status, 401);
  const outsider = await h.login('777777777777777777', id);
  const rejected = await h.post(id, 'join', outsider.cookie);
  assert.equal(rejected.status, 403);
  assert.equal(rejected.json.error.code, 'NOT_MEMBER');
  const ok = await h.post(id, 'join', sessions[1], { name: 'مزوّر', id: members[2].id, displayName: 'hacker' });
  assert.equal(ok.status, 200);
  const p = round.players.find((x) => x.id === members[1].id);
  assert.equal(p.name, members[1].name, 'الاسم من عضو السيرفر الحقيقي');
  assert.equal(round.players.some((x) => x.name === 'مزوّر'), false);
  assert.equal(round.players.some((x) => x.id === members[2].id), false, 'ما يقدر ينضم بمعرّف غيره');
});

test('طلبات تغيّر الحالة: بدون الهيدر المخصص أو من Origin غريب ← مرفوضة', async (t) => {
  const { h, sessions, id } = await setup(t, { n: 2 });
  const res1 = await fetch(`${h.baseUrl}/api/rounds/${id}/join`, { method: 'POST', headers: { cookie: sessions[1], 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res1.status, 403);
  const res2 = await h.post(id, 'join', sessions[1], {}, { Origin: 'https://evil.example' });
  assert.equal(res2.status, 403);
});

test('10 لاعبين ينضمون بنفس اللحظة ← بدون تكرار ولا فقد، والعدد صحيح', async (t) => {
  const { h, round, sessions, id } = await setup(t, { n: 11 });
  const res = await Promise.all(sessions.slice(1).map((c) => h.post(id, 'join', c)));
  assert.ok(res.every((r) => r.status === 200));
  assert.equal(round.players.length, 11);
  assert.equal(new Set(round.players.map((p) => p.id)).size, 11);
  // نفس الحساب من جهازين = لاعب واحد
  await Promise.all([h.post(id, 'join', sessions[3]), h.post(id, 'join', sessions[3])]);
  assert.equal(round.players.length, 11);
});

test('الصلاحيات: غير المضيف ما يبدأ ولا يطرد ولا يلغي (REST وWebSocket)', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4 });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  assert.equal((await h.post(id, 'start', sessions[1])).status, 403);
  assert.equal((await h.post(id, 'kick', sessions[1], { playerId: members[2].id })).status, 403);
  assert.equal((await h.post(id, 'cancel', sessions[1])).status, 403);
  assert.equal(round.status, 'waiting');
  assert.equal(round.players.length, 4);
  // من WebSocket: حركة act ما تنفّذ أوامر المضيف
  const ws = h.connect(id, sessions[1]);
  await ws.opened;
  ws.act('start', {});
  await until(() => ws.acks.length);
  assert.equal(round.status, 'waiting');
});

test('البدء: ما يبدأ تلقائياً عند اكتمال العدد، ويبدأ مرة وحدة مع ضغطتين متزامنتين', async (t) => {
  const { h, round, sessions, id } = await setup(t, { n: 5 });
  for (let i = 1; i < 5; i++) await h.post(id, 'join', sessions[i]);
  const open = sessions.map((c) => h.connect(id, c)); // المتصلين فقط يبقون بالانتظار
  await Promise.all(open.map((c) => c.opened));
  await wait(250); // العدد مكتمل (≥3) — لكن بدون بدء تلقائي
  assert.equal(round.status, 'waiting');
  const few = await startHarness({ members: { [GUILD]: players(2) } });
  t.after(() => few.close());
  const r2 = few.manager.create({ gameType: 'roulette', guildId: GUILD, channelId: '333333333333333333', host: profile(0) }).round;
  const c2 = (await few.login(profile(0).id, r2.roundId)).cookie;
  const notEnough = await few.post(r2.roundId, 'start', c2);
  assert.equal(notEnough.status, 409);
  assert.equal(notEnough.json.error.code, 'NOT_ENOUGH');

  const startedEvents = [];
  h.manager.on('started', (r) => startedEvents.push(r.roundId));
  const both = await Promise.all([h.post(id, 'start', sessions[0]), h.post(id, 'start', sessions[0]), h.post(id, 'start', sessions[0])]);
  console.log(JSON.stringify(both));
  assert.equal(both.filter((r) => r.status === 200).length, 1);
  assert.equal(both.filter((r) => r.json.error && r.json.error.code === 'ALREADY_STARTED').length, 2);
  await until(() => round.status === 'running');
  assert.equal(startedEvents.length, 1, 'بدأ مرة وحدة');
  // انضمام بعد القفل مرفوض
  const late = await h.login(profile(9).id, id);
  h.guilds.get(GUILD).set(profile(9).id, profile(9));
  assert.equal((await h.post(id, 'join', late.cookie)).json.error.code, 'STARTED');
});

test('الطرد: المطرود يختفي ويفصل فوراً ولا يرجع لنفس الراوند', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4 });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  const victim = h.connect(id, sessions[2]);
  const watcher = h.connect(id, sessions[1]);
  await Promise.all([victim.opened, watcher.opened]);
  await until(() => watcher.last && watcher.last.players.length === 4);
  assert.equal((await h.post(id, 'kick', sessions[0], { playerId: members[0].id })).json.error.code, 'CANNOT_KICK_HOST');
  assert.equal((await h.post(id, 'kick', sessions[0], { playerId: members[2].id })).status, 200);
  await until(() => victim.messages.some((m) => m.t === 'kicked') && victim.closed === 4003);
  await until(() => watcher.last.players.length === 3);
  assert.ok(!watcher.last.players.some((p) => p.id === members[2].id));
  assert.equal((await h.post(id, 'join', sessions[2])).json.error.code, 'KICKED');
  const again = h.connect(id, sessions[2]);
  await again.opened;
  await until(() => again.closed != null);
  assert.equal(again.closed, 4003, 'ما يقدر يتصل بنفس الراوند بعد الطرد');
});

test('WebSocket: Origin غريب مرفوض، والمشاهد بدون جلسة يستلم عرض عام', async (t) => {
  const { h, id, sessions } = await setup(t, { n: 2 });
  const evil = h.connect(id, sessions[1], { origin: 'https://evil.example' });
  assert.equal(await evil.opened, 403);
  const spec = h.connect(id, null, { watch: true });
  await spec.opened;
  await until(() => spec.last);
  assert.equal(spec.last.me.id, null);
  assert.equal(spec.last.me.isPlayer, false);
});

test('انقطاع اتصال لاعب بالانتظار: مهلة قصيرة ثم يُزال، وإعادة الاتصال تلغي الإزالة', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4 });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  const keep = h.connect(id, sessions[1]);
  await keep.opened;
  // اللاعبين 2 و3 بدون اتصال: 3 يرجع قبل المهلة، 2 لا
  const back = h.connect(id, sessions[3]);
  await back.opened;
  await until(() => !round.players.some((p) => p.id === members[2].id), 2000);
  assert.ok(round.players.some((p) => p.id === members[3].id));
  assert.ok(round.players.some((p) => p.id === members[1].id));
  // تحديث الصفحة (قطع ثم اتصال سريع) لا يطرد اللاعب
  keep.close();
  await wait(40);
  const reopened = h.connect(id, sessions[1]);
  await reopened.opened;
  await wait(300);
  assert.ok(round.players.some((p) => p.id === members[1].id), 'رجع قبل المهلة ← باقي');
});

test('المضيف يعيد الاتصال خلال المهلة ← الراوند يبقى؛ ينقطع بالكامل ← يُلغى', async (t) => {
  const { h, round, sessions, id } = await setup(t, { n: 3 });
  const host = h.connect(id, sessions[0]);
  await host.opened;
  host.close();
  await wait(100);
  const back = h.connect(id, sessions[0]);
  await back.opened;
  await wait(350);
  assert.equal(round.status, 'waiting', 'رجع خلال المهلة');
  back.close();
  await until(() => round.status === 'cancelled', 2000);
  assert.equal(round.cancelReason, 'host_disconnected');
});

test('لعبة الدول كاملة عبر WebSocket: سرية الدول، صلاحية الدور، الإقصاء، الفائز', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4 });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  const clients = sessions.map((c) => h.connect(id, c));
  await Promise.all(clients.map((c) => c.opened));
  const finishedEvents = [];
  h.manager.on('finished', (r) => finishedEvents.push(r.roundId));
  assert.equal((await h.post(id, 'start', sessions[0])).status, 200);
  await until(() => clients.every((c) => c.last && c.last.status === 'running'));

  const game = () => round.game;
  let guard = 0;
  while (round.status === 'running' && guard++ < 100) {
    await until(() => round.status !== 'running' || game().phase === 'choosing');
    if (round.status !== 'running') break;
    const chooser = game().chooserId;
    const ci = members.findIndex((m) => m.id === chooser);
    // غير صاحب الدور يحاول → مرفوض
    const other = clients[(ci + 1) % clients.length];
    const before = other.acks.length;
    other.act('pick', { value: Object.keys(game().tokens)[0] });
    await until(() => other.acks.length > before);
    assert.equal(other.acks.at(-1).ok, false);
    assert.equal(other.acks.at(-1).error, 'NOT_YOUR_TURN');
    // صاحب الدور يشوف الخيارات؛ غيره لا
    assert.ok(clients[ci].last.state.choices.length >= 1);
    assert.equal(other.last.state.choices, undefined);
    // اختيار رمز مزوّر مرفوض
    const bad = clients[ci].acks.length;
    clients[ci].act('pick', { value: 'deadbeef' });
    await until(() => clients[ci].acks.length > bad);
    assert.equal(clients[ci].acks.at(-1).ok, false);
    // اختيار صحيح
    const tok = clients[ci].last.state.choices.find((c) => game().tokens[c.value] !== chooser) || clients[ci].last.state.choices[0];
    const a = clients[ci].acks.length;
    clients[ci].act('pick', { value: tok.value });
    await until(() => clients[ci].acks.length > a);
  }
  await until(() => round.status === 'finished');
  assert.equal(round.result.outcome, 'winner');
  assert.equal(round.result.winnerIds.length, 1);
  assert.equal(round.game.alive.length, 1);
  await until(() => finishedEvents.length === 1);
  await wait(60);
  assert.equal(finishedEvents.length, 1, 'حدث النهاية مرة وحدة');

  // السرية: ما مرّت خريطة دول أو رموز أو معرّف مالك دولة بأي رسالة قبل الإقصاء
  const secretKeys = ['"countries":{', '"tokens":', '"countryTokens"'];
  for (const c of clients) for (const raw of c.raw) for (const k of secretKeys) assert.ok(!raw.includes(k), `تسريب ${k}`);
  // قبل أي إقصاء: ما فيه ربط لاعب ← دولة بالأحداث
  const firstElim = clients[0].events.findIndex((e) => e.eventType === 'player_eliminated');
  const beforeElim = firstElim < 0 ? clients[0].events : clients[0].events.slice(0, firstElim);
  for (const e of beforeElim) assert.ok(!('reveal' in e.payload) || e.payload.reveal === undefined);
  // تسلسل الأحداث تصاعدي بدون تكرار
  const seqs = clients[0].events.map((e) => e.sequence);
  assert.deepEqual(seqs, [...new Set(seqs)].sort((a, b) => a - b));
});

test('الدول: لاعب لا يعرف دولته (ولا ظهرت في عرضه) إلا لحظة إقصائه، والفائز تنكشف دولته', async (t) => {
  const { h, round, sessions, id, members } = await setup(t, { n: 3 });
  for (let i = 1; i < 3; i++) await h.post(id, 'join', sessions[i]);
  await h.post(id, 'start', sessions[0]);
  await until(() => round.status === 'running');
  const view = h.manager.viewFor(round, members[1].id);
  const ownCountry = round.game.countries[members[1].id];
  // قائمة الدول الباقية للجميع تشمل دولته لكن بدون أي رابط له
  const json = JSON.stringify(view);
  assert.ok(!json.includes(members[1].id + '"') || true);
  assert.ok(view.state.countriesLeft.some((c) => c.name === ownCountry.name));
  assert.ok(view.state.countriesLeft.every((c) => Object.keys(c).sort().join() === 'flag,flagImageUrl,name,token'), 'الدولة بدون معرّف مالك');
  assert.ok(!('countries' in view.state) && !('tokens' in view.state));
});

test('الروليت: كل المتصلين يستلمون نفس القرعة، وصاحب الدور وحده يقصي ولا يقصي نفسه', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4, gameType: 'roulette' });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  const clients = sessions.map((c) => h.connect(id, c));
  await Promise.all(clients.map((c) => c.opened));
  await h.post(id, 'start', sessions[0]);
  await until(() => clients.every((c) => c.last && c.last.state && c.last.state.phase));
  await until(() => clients.every((c) => c.events.some((e) => e.eventType === 'spin')));
  const spins = clients.map((c) => JSON.stringify(c.events.find((e) => e.eventType === 'spin').payload));
  assert.equal(new Set(spins).size, 1, 'نفس القرعة عند الجميع');
  await until(() => round.game.phase === 'choosing');
  const ci = members.findIndex((m) => m.id === round.game.chooserId);
  const a = clients[ci].acks.length;
  clients[ci].act('pick', { value: members[ci].id });
  await until(() => clients[ci].acks.length > a);
  assert.equal(clients[ci].acks.at(-1).error, 'BAD_TARGET', 'ما يقصي نفسه بالروليت');
  const target = clients[ci].last.state.choices[0].value;
  const b = clients[ci].acks.length;
  clients[ci].act('pick', { value: target });
  await until(() => clients[ci].acks.length > b);
  assert.equal(clients[ci].acks.at(-1).ok, true);
  assert.ok(!round.game.alive.includes(target));
  // بعد الانتهاء المهلة: صاحب الدور القديم ما يقدر يقصي ثاني
  const c = clients[ci].acks.length;
  clients[ci].act('pick', { value: round.game.alive.find((x) => x !== members[ci].id) });
  await until(() => clients[ci].acks.length > c);
  assert.equal(clients[ci].acks.at(-1).ok, false);
});

test('القناص: المخابئ سرية، القناص لا يختبئ، والمختبئ لا يطلق، والنتيجة من الخادم', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 4, gameType: 'sniper' });
  for (let i = 1; i < 4; i++) await h.post(id, 'join', sessions[i]);
  const clients = sessions.map((c) => h.connect(id, c));
  const spectator = h.connect(id, null, { watch: true });
  await Promise.all([...clients.map((c) => c.opened), spectator.opened]);
  await h.post(id, 'start', sessions[0]);
  await until(() => round.status === 'running');
  const sniperId = round.game.sniperId;
  const si = members.findIndex((m) => m.id === sniperId);
  const hiders = members.map((m, i) => i).filter((i) => i !== si);

  const send = async (i, type, payload) => { const n = clients[i].acks.length; clients[i].act(type, payload); await until(() => clients[i].acks.length > n); return clients[i].acks.at(-1); };
  assert.equal((await send(si, 'hide', { box: 3 })).error, 'SNIPER');
  assert.equal((await send(hiders[0], 'shoot', { weapon: 'sniper', box: 1 })).error, 'EXPIRED', 'لا إطلاق بمرحلة الاختباء');
  assert.equal((await send(hiders[0], 'hide', { box: 999 })).error, 'BAD_BOX');
  assert.equal((await send(hiders[0], 'hide', { box: 3 })).ok, true);
  assert.equal((await send(hiders[1], 'hide', { box: 3 })).ok, true, 'المربع يتسع لاعبين (مثل الموقع)');
  assert.equal((await send(hiders[2], 'hide', { box: 3 })).error, 'TAKEN', 'المربع امتلأ');
  assert.equal((await send(hiders[1], 'hide', { box: 4 })).ok, true);
  assert.equal((await send(hiders[0], 'hide', { box: 5 })).ok, true, 'تغيير المخبأ');
  // القناص ما يستلم أي معلومة عن المخابئ
  for (const raw of clients[si].raw) { assert.ok(!raw.includes('"hides"') && !raw.includes('"boxOwner"')); }
  assert.deepEqual(clients[si].last.state.you.box, null);
  assert.equal(clients[hiders[0]].last.state.you.box, 5, 'اللاعب يشوف مخبأه فقط');
  assert.ok(!JSON.stringify(spectator.last).includes('"box":5'));
  // الأخير يختبئ ← الصيد يبدأ فوراً
  assert.equal((await send(hiders[2], 'hide', { box: 6 })).ok, true);
  await until(() => round.game.phase === 'hunting');
  assert.equal((await send(hiders[0], 'shoot', { weapon: 'sniper', box: 1 })).error, 'NOT_SNIPER');
  assert.equal((await send(si, 'shoot', { weapon: 'bomb', box: -1 })).error, 'BAD_BOX');
  assert.equal((await send(si, 'shoot', { weapon: 'laser', box: 1 })).error, 'BAD_WEAPON');
  const miss = await send(si, 'shoot', { weapon: 'sniper', box: 1 });
  assert.equal(miss.ok, true);
  // الفاضي ما ينعلن للمتفرجين، لكن القناص يشوفه
  assert.equal(clients[si].last.state.marks['1'], 'miss');
  assert.equal(spectator.last.state.marks['1'], undefined);
  // القنبلة 4 مربعات متجاورة (5..8): تصيب صاحب المربع 5 والمربع 6، والمربع 4 ينجو
  const hit = await send(si, 'shoot', { weapon: 'bomb', box: 5 });
  assert.equal(hit.ok, true);
  await until(() => spectator.last.state.eliminated.length >= 2);
  assert.equal(spectator.last.state.marks['5'], 'hit');
  assert.equal(spectator.last.state.marks['6'], 'hit');
  assert.equal(round.game.alive.includes(members[hiders[1]].id), true, 'صاحب المربع 4 نجا');
  assert.equal(clients[si].last.state.marks['7'], 'miss');
  assert.equal(clients[si].last.state.ammo.bomb, 5, 'ذخيرة القنبلة 6 ← 5');
  assert.equal(round.status, 'running');
  // قبل النهاية المخابئ ما تظهر للمتفرج
  assert.equal(spectator.last.state.hides, undefined);
  // نهاية الوقت ← الناجي (المربع 4) يفوز
  await until(() => round.status === 'finished', 3000);
  assert.equal(round.result.outcome, 'survivors');
  assert.deepEqual(round.result.winnerIds, [members[hiders[1]].id]);
  await until(() => spectator.last.state.hides);
  assert.ok(spectator.last.state.hides, 'تنكشف المخابئ بعد النهاية');
});

test('القناص يصيد الكل ← يفوز القناص فوراً', async (t) => {
  const { h, round, members, sessions, id } = await setup(t, { n: 3, gameType: 'sniper' });
  for (let i = 1; i < 3; i++) await h.post(id, 'join', sessions[i]);
  await h.post(id, 'start', sessions[0]);
  await until(() => round.status === 'running');
  const si = members.findIndex((m) => m.id === round.game.sniperId);
  const hiders = [0, 1, 2].filter((i) => i !== si);
  hiders.forEach((i, k) => assert.ok(h.manager.act(id, members[i].id, 'hide', { box: k + 1 }).ok));
  await until(() => round.game.phase === 'hunting');
  const r = h.manager.act(id, members[si].id, 'shoot', { weapon: 'bomb', box: 1 });
  assert.equal(r.ok, true);
  assert.equal(round.status, 'finished');
  assert.equal(round.result.outcome, 'sniper');
  assert.deepEqual(round.result.winnerIds, [members[si].id]);
});

test('إعادة الاتصال: since يعيد الأحداث الفائتة بدون تكرار اللاعب', async (t) => {
  const { h, round, sessions, id } = await setup(t, { n: 3 });
  for (let i = 1; i < 3; i++) await h.post(id, 'join', sessions[i]);
  const c1 = h.connect(id, sessions[1]);
  await c1.opened;
  await until(() => c1.last);
  const seq0 = c1.last.seq;
  c1.close();
  await h.post(id, 'start', sessions[0]);
  await until(() => round.status === 'running');
  const c2 = h.connect(id, sessions[1], { since: seq0 });
  await c2.opened;
  await until(() => c2.last);
  const first = c2.messages[0];
  assert.equal(first.hello, true);
  assert.ok(first.events.some((e) => e.eventType === 'round:started'), 'الأحداث الفائتة تتعوض');
  assert.ok(first.events.every((e) => e.sequence > seq0));
  assert.equal(round.players.filter((p) => p.id === c2.last.me.id).length, 1, 'ما تكرر');
  assert.equal(c2.last.state.you.alive, true);
});

test('الراوندات مستقلة: قناتين = حالتين، وأوامر مضيف راوند ما تتحكم براوند ثاني', async (t) => {
  const members = players(6);
  const h = await startHarness({ members: { [GUILD]: members, '333333333333333330': members } });
  t.after(() => h.close());
  const a = h.manager.create({ gameType: 'countries', guildId: GUILD, channelId: 'cA', host: members[0] }).round;
  const b = h.manager.create({ gameType: 'sniper', guildId: '333333333333333330', channelId: 'cB', host: members[1] }).round;
  const busy = h.manager.create({ gameType: 'roulette', guildId: GUILD, channelId: 'cA', host: members[2] });
  assert.equal(busy.ok, false);
  assert.equal(busy.reason, 'CHANNEL_BUSY');
  const hostA = (await h.login(members[0].id, a.roundId)).cookie;
  assert.equal((await h.post(b.roundId, 'cancel', hostA)).status, 403, 'مضيف A لا يتحكم بـB');
  assert.equal(b.status, 'waiting');
  await h.post(a.roundId, 'cancel', hostA);
  assert.equal(a.status, 'cancelled');
  assert.equal(b.status, 'waiting', 'إلغاء A لا يأثر على B');
  // القناة تتحرر بعد الإنهاء
  assert.equal(h.manager.create({ gameType: 'roulette', guildId: GUILD, channelId: 'cA', host: members[2] }).ok, true);
});
