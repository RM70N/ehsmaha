// اختبارات «جمعتنا»: اتصالات WebSocket حقيقية متعددة على خادم محلي (ليست محاكاة للاعبين داخل العميل).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { Jam3atnaServer } from '../src/jam3atna/server.js';
import { genCity, uniqueFindables, lightState, CITY, roadAt } from '../src/jam3atna/shared/city-sim.js';
import { MAPS, MAP_IDS, genLayout, KINDS, PROP } from '../src/jam3atna/shared/prop-sim.js';
import { CityGame } from '../src/jam3atna/city-game.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(cfg) {
  const j = new Jam3atnaServer({ cfg });
  const server = http.createServer(); server.on('upgrade', (q, s, h) => j.handleUpgrade(q, s, h));
  await new Promise((r) => server.listen(0, r));
  const url = 'ws://127.0.0.1:' + server.address().port + '/jam3atna/ws';
  const clients = [];
  const conn = async () => {
    const ws = new WebSocket(url); const c = { ws, log: [], closed: false };
    ws.on('message', (d) => c.log.push(JSON.parse(String(d)))); ws.on('close', () => { c.closed = true; });
    await new Promise((r, x) => { ws.on('open', r); ws.on('error', x); });
    c.send = (m) => ws.send(JSON.stringify(m)); c.g = (d) => c.send({ t: 'g', d });
    c.wait = async (pred, ms = 3000) => { const t0 = Date.now(); for (;;) { const m = c.log.find(pred); if (m) return m; if (Date.now() - t0 > ms) throw new Error('timeout waiting; last=' + JSON.stringify(c.log.slice(-3)).slice(0, 400)); await sleep(5); } };
    c.gw = (k, ms) => c.wait((m) => m.t === 'g' && m.d.k === k, ms).then((m) => m.d);
    c.last = (t) => [...c.log].reverse().find((m) => m.t === t);
    clients.push(c); return c;
  };
  const room = async (game, n) => {
    const host = await conn(); host.send({ t: 'create', game }); const jd = await host.wait((m) => m.t === 'joined'); const ps = [];
    for (let i = 0; i < n; i++) { const p = await conn(); p.send({ t: 'join', code: jd.code, name: 'لاعب' + (i + 1), avatar: String(i) }); p.me = (await p.wait((m) => m.t === 'joined')).you; ps.push(p); }
    return { host, ps, code: jd.code, r: j.rooms.get(jd.code) };
  };
  const close = async () => { clients.forEach((c) => { try { c.ws.terminate(); } catch (e) {} }); j.closeAll(); await new Promise((r) => server.close(r)); };
  return { j, conn, room, close };
}

function listFiles(dir, base = dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(new URL(e.name + '/', dir), base) : [new URL(e.name, dir).pathname.slice(base.pathname.length)])); }
test('نسخة المحاكاة المشتركة بالخادم مطابقة لنسخة الموقع (كل الملفات)', () => {
  const A = new URL('../src/jam3atna/shared/', import.meta.url), B = new URL('../../jam3atna/shared/', import.meta.url); const fa = listFiles(A).sort(), fb = listFiles(B).filter((f) => !/audio\.js|three-kit\.js/.test(f)).sort();
  assert.deepEqual(fa, fb);
  for (const f of fa) assert.equal(fs.readFileSync(new URL(f, A), 'utf8'), fs.readFileSync(new URL(f, B), 'utf8'), f);
});

test('الغرف: إنشاء/دخول/أخطاء/صلاحيات المضيف', async () => {
  const b = await boot({ min: { city: 2 } });
  try {
    const { host, ps, code, r } = await b.room('city', 2);
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    await host.wait((m) => m.t === 'room' && m.players.length === 2);
    assert.equal(host.last('room').players.some((p) => 'token' in p), false, 'لا يُبث الرمز السري');
    // اسم مكرر (مع اختلاف مسافات/تشكيل)
    const d = await b.conn(); d.send({ t: 'join', code, name: ' لاعب1 ' }); assert.equal((await d.wait((m) => m.t === 'error')).code, 'name_taken');
    const e = await b.conn(); e.send({ t: 'join', code: 'ZZZZZZ', name: 'سالم' }); assert.equal((await e.wait((m) => m.t === 'error')).code, 'not_found');
    const pk = await b.conn(); pk.send({ t: 'peek', code: code.toLowerCase() }); assert.equal((await pk.wait((m) => m.t === 'peek')).game, 'city');
    // لاعب يحاول أوامر المضيف يدويًا
    ps[0].send({ t: 'kick', id: ps[1].me.id }); ps[0].send({ t: 'start' }); ps[0].send({ t: 'settings', s: { rounds: 7 } }); ps[0].send({ t: 'cancel' });
    await sleep(60); assert.equal(r.players.size, 3); assert.equal(r.phase, 'lobby'); assert.equal(r.settings.rounds, 5);
    // إعدادات: قيم غير مسموحة تُرفض
    host.send({ t: 'settings', s: { rounds: 999, missionSec: 30 } }); await host.wait((m) => m.t === 'room' && m.settings.missionSec === 30); assert.equal(r.settings.rounds, 5);
    ps[1].send({ t: 'ready', v: true }); await host.wait((m) => m.t === 'room' && m.players.some((p) => p.ready));
    host.send({ t: 'kick', id: ps[1].me.id }); assert.equal((await ps[1].wait((m) => m.t === 'removed')).why, 'kicked');
    host.send({ t: 'start' }); assert.equal((await host.wait((m) => m.t === 'error')).code, 'need_players');
    host.send({ t: 'cancel' }); assert.equal((await ps[0].wait((m) => m.t === 'closed')).why, 'cancelled'); assert.equal(b.j.rooms.size, 0);
  } finally { await b.close(); }
});

test('الغرف: الحد الأدنى الافتراضي 4 والحد الأقصى', async () => {
  const b = await boot({});
  try {
    const { host, r, code } = await b.room('prop', 3);
    host.send({ t: 'start' }); assert.equal((await host.wait((m) => m.t === 'error')).min, 4); assert.equal(r.phase, 'lobby');
    for (let i = 3; i < 16; i++) { const p = await b.conn(); p.send({ t: 'join', code, name: 'ضيف' + i }); await p.wait((m) => m.t === 'joined'); }
    const x = await b.conn(); x.send({ t: 'join', code, name: 'زايد' }); assert.equal((await x.wait((m) => m.t === 'error')).code, 'full');
  } finally { await b.close(); }
});

test('الاتصال: إعادة الدخول بالرمز، تبويبان، انتهاء المهلة، خروج المضيف', async () => {
  const b = await boot({ min: { city: 2 }, lobbyGraceMs: 120, hostGraceMs: 150 });
  try {
    const { host, ps, code, r } = await b.room('city', 2);
    const tok = ps[0].me.token; ps[0].ws.terminate(); await host.wait((m) => m.t === 'room' && m.players.some((p) => !p.on));
    const again = await b.conn(); again.send({ t: 'join', code, token: tok, name: 'x' }); const jd = await again.wait((m) => m.t === 'joined');
    assert.equal(jd.rejoin, true); assert.equal(jd.you.id, ps[0].me.id); assert.equal(r.players.size, 3);
    const tab2 = await b.conn(); tab2.send({ t: 'join', code, token: tok }); await tab2.wait((m) => m.t === 'joined'); await again.wait((m) => m.t === 'replaced'); assert.equal(r.players.size, 3);
    ps[1].ws.terminate(); await sleep(220); assert.equal(r.players.size, 2, 'انتهت مهلة اللوبي فأُزيل');
    host.ws.terminate(); assert.equal((await tab2.wait((m) => m.t === 'closed', 1000)).why, 'host_left');
  } finally { await b.close(); }
});

const FAST_CITY = { min: { city: 2, prop: 2 }, city: { introMs: 10, revealMs: 25, memorizeMs: 20, actorMs: 15, timeScale: 0.04 } };
test('المدينة: مباراة كاملة — نقاط، منع التكرار، سرّية الهدف، التعادل', async () => {
  const b = await boot(FAST_CITY);
  try {
    const { host, ps, r } = await b.room('city', 3);
    host.send({ t: 'settings', s: { rounds: 3, missionSec: 60 } }); await sleep(20);
    host.send({ t: 'start' }); host.send({ t: 'start' }); // ضغطتان سريعتان
    const init = await ps[0].gw('init'); assert.ok(init.seed > 0); const inst = r.inst;
    assert.equal(host.log.filter((m) => m.t === 'g' && m.d.k === 'init').length, 1, 'البدء مرة واحدة فقط');
    const m1 = await ps[0].gw('mission'); assert.equal(m1.type, 'find'); assert.ok(m1.text.length > 8);
    const rd = inst.round; const targets = ps.map((p) => rd.per.get(p.me.id).target);
    assert.equal(new Set(targets).size, 3, 'هدف مختلف لكل لاعب');
    const leaked = (c) => c.log.some((m) => m.t === 'g' && m.d.k !== 'reveal' && targets.some((t) => JSON.stringify(m.d).includes('"' + t + '"')));
    assert.equal(leaked(ps[0]) || leaked(host), false, 'معرّف الهدف لا يُرسل قبل نهاية الجولة');
    // خطأ: خصم لا ينزل تحت الصفر
    const wrongId = init && genCity(init.seed).ents.find((e) => !targets.includes(e.id)).id;
    ps[0].g({ k: 'pick', id: wrongId, round: 1 }); let pk = await ps[0].gw('picked'); assert.equal(pk.ok, false); assert.equal(pk.score, 0); assert.equal(pk.left, 2);
    // صحيح مرتين بسرعة: يُحتسب مرة واحدة
    ps[1].g({ k: 'pick', id: targets[1], round: 1 }); ps[1].g({ k: 'pick', id: targets[1], round: 1 });
    await sleep(40); assert.equal(r.players.get(ps[1].me.id).score, 125, '100 + 25 قبل نصف الوقت، بلا مكافأة «الأول» في المهمات الشخصية');
    // جولة قديمة / مبنى في مهمة عناصر
    ps[2].g({ k: 'pick', id: targets[2], round: 99 }); ps[2].g({ k: 'pick', id: 'b0', round: 1 }); await sleep(30); assert.equal(r.players.get(ps[2].me.id).score, 0);
    ps[0].g({ k: 'pick', id: targets[0], round: 1 }); ps[2].g({ k: 'pick', id: targets[2], round: 1 });
    const rv = await host.gw('reveal'); assert.equal(rv.results.length, 3); assert.equal(rv.results.find((x) => x.id === ps[0].me.id).pts, 125);
    // الجولات المشتركة: الأول +50، وتزامن لاعبين على نفس الهدف
    for (let n = 2; n <= 3; n++) {
      await host.wait((m) => m.t === 'g' && m.d.k === 'round' && m.d.round === n); const rr = inst.round; assert.ok(rr.shared, 'للمهمة المشتركة هدف');
      if (rr.openAt > Date.now()) await sleep(rr.openAt - Date.now() + 5);
      const before = ps.map((p) => r.players.get(p.me.id).score);
      ps[0].g({ k: 'pick', id: rr.shared, round: n }); ps[1].g({ k: 'pick', id: rr.shared, round: n });
      await host.wait((m) => m.t === 'g' && m.d.k === 'reveal' && m.d.round === n, 4000).catch(() => {});
      const gain = ps.map((p, i) => r.players.get(p.me.id).score - before[i]);
      assert.ok(gain[0] === 150 || gain[0] === 175, 'الأول: 100+50 (+25) = ' + gain[0]); assert.ok(gain[1] === 100 || gain[1] === 125, 'الثاني بلا مكافأة الأول = ' + gain[1]);
    }
    // بعد 3 جولات: لاعب0 و لاعب1 … نتحقق من وجود نهاية بفائز واحد؛ ونفرض تعادلاً بتحدٍ فاصل
    const fin = await host.gw('final', 6000); assert.equal(fin.ranking[0].id, ps[0].me.id); assert.equal(r.phase, 'ended');
    ps[0].send({ t: 'again' }); await sleep(30); assert.equal(r.phase, 'ended', 'غير المضيف لا يعيد المباراة');
    host.log.length = 0; host.send({ t: 'again' }); await host.wait((m) => m.t === 'room' && m.phase === 'lobby'); assert.equal(r.players.get(ps[0].me.id).score, 0);
  } finally { await b.close(); }
});

test('المدينة: التعادل على الأول يفتح تحديًا فاصلاً، والوقت المنتهي يرفض الإجابة', async () => {
  const b = await boot(FAST_CITY);
  try {
    const { host, ps, r } = await b.room('city', 2);
    host.send({ t: 'settings', s: { rounds: 3, missionSec: 30 } }); await sleep(15); host.send({ t: 'start' });
    await host.gw('init'); const inst = r.inst;
    await host.wait((m) => m.t === 'g' && m.d.k === 'round' && m.d.type === 'tie', 8000); // لا أحد أجاب → 0:0 → فاصل
    const rr = inst.round; assert.equal(rr.per.size, 2);
    // إجابة تصل بعد نهاية الوقت الرسمي تُرفض
    const end = rr.endAt; rr.endAt = Date.now() - 1; ps[1].g({ k: 'pick', id: rr.shared, round: rr.n }); await sleep(30); assert.equal(r.players.get(ps[1].me.id).score, 0); rr.endAt = end;
    ps[0].g({ k: 'pick', id: rr.shared, round: rr.n });
    const fin = await host.gw('final', 5000); assert.equal(fin.ranking[0].id, ps[0].me.id);
  } finally { await b.close(); }
});

test('المدينة: آلاف المهمات المولّدة كلها لها إجابة صحيحة موجودة فعلاً', () => {
  const srv = { sendTo() {}, broadcast() {}, pushRoom() {}, endMatch() {} };
  let n = 0; let g = null;
  try {
  for (let i = 0; i < 400; i++) {
    const room = { players: new Map([['h', { id: 'h', isHost: true }], ['a', { id: 'a', score: 0 }], ['b', { id: 'b', score: 0 }]]), hostId: 'h', settings: { rounds: 6, missionSec: 45, knockout: false } };
    g = new CityGame(srv, room, { introMs: 1e9 }); g.start();
    const ids = new Set(g.world.ents.map((e) => e.id)); const bids = new Map(g.world.buildings.map((x) => [x.id, x]));
    for (let k = 0; k < 6; k++) {
      g._nextRound(); const r = g.round; n++;
      for (const s of r.per.values()) {
        assert.ok(s.target && s.text, r.type);
        if (r.pickKind === 'building') { assert.ok(bids.get(s.target).h > 0, 'مبنى حقيقي'); }
        else assert.ok(ids.has(s.target) || r.actors.some((a) => a.def.id === s.target), r.type + ' الهدف موجود');
      }
      if (r.type === 'follow') { const last = r.actors[0].kf.at(-1); assert.ok(last[0] < (r.endAt - r.startAt) * 0.9, 'الهارب يدخل المبنى قبل نهاية الوقت'); const bd = bids.get(r.shared); assert.ok(Math.hypot(last[1] - bd.x, last[2] - bd.z) < 0.01); }
      if (r.type === 'watch') { const cnt = new Map(); for (const a of r.actors) { const e = a.kf.at(-1); const bd = [...bids.values()].find((x) => Math.hypot(x.x - e[1], x.z - e[2]) < 0.01); cnt.set(bd.id, (cnt.get(bd.id) || 0) + 1); assert.ok(e[0] < (r.endAt - r.startAt), 'يدخل قبل نهاية الوقت'); } const top = [...cnt.entries()].sort((x, y) => y[1] - x[1]); assert.equal(top[0][0], r.shared); assert.ok(top[0][1] > top[1][1], 'الأكثر فريد'); }
      if (r.type === 'violation') {
        // السيارة المخالفة فقط هي التي تدخل تقاطعًا والإشارة ليست لصالحها
        const runs = r.actors.map((a) => { let ran = false; const kf = a.kf; for (let q = 2; q < kf.length; q++) { const p0 = kf[q - 1], p1 = kf[q]; const ns = p0[1] === p1[1]; const from = ns ? p0[2] : p0[1], to = ns ? p1[2] : p1[1]; if (from === to) continue; for (let c = 0; c <= CITY.N; c++) { const line = roadAt(c) - CITY.ROAD / 2; if (from < line && to > line) { const tm = p0[0] + (line - from) / (to - from) * (p1[0] - p0[0]); const li = ns ? Math.round((p0[1] + CITY.LANE - roadAt(0)) / (roadAt(1) - roadAt(0))) : c; const lj = ns ? c : Math.round((p0[2] - CITY.LANE - roadAt(0)) / (roadAt(1) - roadAt(0))); if (lightState(li, lj, g.simT(r.startAt + p0[0])) !== (ns ? 'ns' : 'ew')) ran = true; /* الحكم لحظة مغادرة خط الوقوف */ } } } return ran; });
        const bad = r.actors.findIndex((a) => a.def.id === r.shared); assert.equal(runs[bad], true, 'المخالفة تقطع فعلاً على الأحمر'); assert.equal(runs.filter(Boolean).length, 1, 'ولا سيارة غيرها تقطع');
      }
      if (r.event && ['jam', 'closure', 'rush'].includes(r.event.type)) { assert.equal(r.event.dur, CITY.CYCLE * 1000); assert.ok(Array.isArray(r.event.ids) && typeof r.event.t0 === 'number', 'حدث توقف: معرّفات السيارات ووقت البدء'); }
      if (r.event && r.event.type === 'convoy') assert.ok(r.event.road >= 0 && r.event.road <= CITY.N && (r.event.axis === 0 || r.event.axis === 1));
      if (r.event) assert.ok(['blackout', 'rain', 'train', 'jam', 'rush', 'convoy', 'festival', 'market', 'closure'].includes(r.event.type) && r.event.dur >= 9000);
      r.done = true; clearInterval(g.actorTimer);
    }
    g.stop();
  }
  } finally { if (g) { clearInterval(g.actorTimer); g.stop(); } }
  assert.equal(n, 2400);
  for (let s = 1; s < 300; s++) assert.ok(uniqueFindables(genCity(s)).length >= 20, 'أهداف فريدة كافية لـ20 لاعبًا');
});

test('المدينة: خروج المغلوب يستبعد الأقل نقاطًا بعد كل جولتين', async () => {
  const b = await boot(FAST_CITY);
  try {
    const { host, ps, r } = await b.room('city', 3);
    host.send({ t: 'settings', s: { rounds: 4, knockout: true, missionSec: 30 } }); await sleep(15); host.send({ t: 'start' }); await host.gw('init'); const inst = r.inst;
    for (let n = 1; n <= 2; n++) {
      await host.wait((m) => m.t === 'g' && m.d.k === 'round' && m.d.round === n, 5000); const rr = inst.round; if (rr.openAt > Date.now()) await sleep(rr.openAt - Date.now() + 5);
      ps[0].g({ k: 'pick', id: rr.per.get(ps[0].me.id).target, round: n }); if (n === 1) ps[1].g({ k: 'pick', id: rr.per.get(ps[1].me.id).target, round: n });
    }
    const rv = await host.wait((m) => m.t === 'g' && m.d.k === 'reveal' && m.d.round === 2, 5000); assert.equal(rv.d.eliminated.id, ps[2].me.id);
    const m3 = await ps[2].wait((m) => m.t === 'g' && m.d.k === 'mission' && m.d.round === 3, 5000); assert.equal(m3.d.watching, true); assert.equal(m3.d.text, null);
  } finally { await b.close(); }
});

const FAST_PROP = { min: { prop: 2 }, prop: { hideMs: 400000, introMs: 0, loadMaxMs: 40, resultMs: 30, timeScale: 0.02, stillMs: 40 } };
test('المتنكر: الأدوار، سرّية مرحلة الاختباء، الفحص والنقاط، فوز المفتشين', async () => {
  const b = await boot(FAST_PROP);
  try {
    const { host, ps, r } = await b.room('prop', 5);
    host.send({ t: 'settings', s: { rounds: 2, seekSec: 300, map: 'hospital' } }); await sleep(15); host.send({ t: 'start' });
    const setups = await Promise.all(ps.map((p) => p.gw('setup'))); const inst = r.inst; const rs = inst.rs;
    const seekers = ps.filter((p, i) => setups[i].you.role === 'seek'), hiders = ps.filter((p, i) => setups[i].you.role === 'hide');
    assert.equal(seekers.length, 1); assert.equal(hiders.length, 4);
    assert.equal(setups[ps.indexOf(seekers[0])].props, null, 'المفتش لا يستلم أي أغراض أثناء الاختباء');
    assert.equal((await host.gw('setup')).props, null);
    const hpids = hiders.map((p) => rs.st.get(p.me.id).pid);
    const sees = (c) => c.log.some((m) => m.t === 'g' && hpids.some((id) => JSON.stringify(m.d).includes(id)));
    await sleep(120); assert.equal(sees(seekers[0]), false, 'لا تسريب لمعرّفات المتنكرين للمفتش قبل البحث'); assert.equal(sees(host), false);
    // حد السرعة: إدخال مبالغ فيه لا يتجاوز السرعة الرسمية
    const h0 = rs.st.get(hiders[0].me.id); const x0 = h0.x, z0 = h0.z; hiders[0].g({ k: 'in', x: 50, z: 50 }); await sleep(300); hiders[0].g({ k: 'in', x: 0, z: 0 });
    assert.ok(Math.hypot(h0.x - x0, h0.z - z0) <= PROP.SPEED_HIDER * 0.42, 'حد السرعة مفروض من الخادم');
    // التبديل: غرض بعيد يُرفض، غرض وهمي يُتجاهل، قريب يُقبل ثم فترة انتظار
    const far = rs.statics.reduce((a, o) => (Math.hypot(o.x - h0.x, o.z - h0.z) > Math.hypot(a.x - h0.x, a.z - h0.z) ? o : a));
    hiders[0].g({ k: 'swap', pid: far.pid }); assert.equal((await hiders[0].gw('deny')).why, 'far');
    hiders[0].g({ k: 'swap', pid: 'nope' });
    const near = rs.statics.reduce((a, o) => (Math.hypot(o.x - h0.x, o.z - h0.z) < Math.hypot(a.x - h0.x, a.z - h0.z) ? o : a)); h0.x = near.x + near.r + h0.r + 0.3; h0.z = near.z;
    hiders[0].g({ k: 'swap', pid: near.pid }); const you = await hiders[0].gw('you'); assert.equal(you.kind, near.kind);
    hiders[0].log.length = 0; hiders[0].g({ k: 'swap', pid: near.pid }); assert.equal((await hiders[0].gw('deny')).why, 'cooldown');
    // المفتش مجمّد أثناء الاختباء، ولا يقدر يفحص
    const sk = rs.st.get(seekers[0].me.id); const sx = sk.x; seekers[0].g({ k: 'in', x: 1, z: 0 }); seekers[0].g({ k: 'inspect', pid: hpids[0] }); await sleep(120); assert.equal(sk.x, sx); assert.equal(h0.found, false);
    seekers[0].g({ k: 'in', x: 0, z: 0 });
    inst._startSeek(); const s2 = await seekers[0].wait((m) => m.t === 'g' && m.d.k === 'setup' && m.d.phase === 'seek');
    const list = s2.d.props; assert.ok(list.length > 40); for (const id of hpids) { const e = list.find((o) => o.pid === id); assert.deepEqual(Object.keys(e).sort(), ['kind', 'lv', 'pid', 'rot', 'x', 'z'], 'المتنكر بنفس صيغة الأثاث تمامًا'); }
    // فحص بعيد يُرفض بلا خصم
    const st0 = rs.statics[0]; sk.x = st0.x + 30; seekers[0].g({ k: 'inspect', pid: st0.pid }); assert.equal((await seekers[0].gw('deny')).why, 'far'); assert.equal(sk.att, 5);
    // فحص غرض عادي: -محاولة، والنقاط لا تنزل تحت الصفر
    sk.x = st0.x + 1; sk.z = st0.z; sk.inspAt = 0; seekers[0].g({ k: 'inspect', pid: st0.pid }); let ins = await seekers[0].gw('insp'); assert.equal(ins.ok, false); assert.equal(ins.att, 4); assert.equal(ins.score, 0);
    // كشف متنكر: +75 واسترجاع محاولة (بحد أقصى 5)
    const reveal = async (hp) => { const h = rs.st.get(hp.me.id); sk.x = h.x + 1; sk.z = h.z; sk.inspAt = 0; seekers[0].log.length = 0; seekers[0].g({ k: 'inspect', pid: h.pid }); return seekers[0].gw('insp'); };
    ins = await reveal(hiders[0]); assert.equal(ins.ok, true); assert.equal(ins.att, 5); assert.equal(ins.score, 75);
    assert.equal((await hiders[0].wait((m) => m.t === 'g' && m.d.k === 'setup' && m.d.you.role === 'watch')).d.you.role, 'watch', 'المكشوف يتحول لمشاهد');
    // نفس الغرض مرة ثانية (سباق مفتشين): «انكشف قبلك» بلا عقوبة
    sk.inspAt = 0; seekers[0].log.length = 0; seekers[0].g({ k: 'inspect', pid: hpids[0] }); ins = await seekers[0].gw('insp'); assert.equal(ins.gone, true); assert.equal(sk.att, 5);
    ins = await reveal(hiders[1]); ins = await reveal(hiders[2]); await host.gw('lasthider'); assert.equal(rs.st.get(hiders[3].me.id).extra, true);
    ins = await reveal(hiders[3]);
    const over = await host.gw('over'); assert.equal(over.winner, 'seek'); assert.equal(over.why, 'all_found');
    assert.equal(over.results.find((x) => x.id === seekers[0].me.id).score, 75 * 4 + 100);
    assert.equal(over.results.find((x) => x.id === hiders[0].me.id).score, 0, 'المتنكر المكشوف فورًا بلا نقاط فريق');
    // الجولة الثانية: المفتش السابق لا يتكرر (توازن الأدوار)
    await host.wait((m) => m.t === 'g' && m.d.k === 'setup' && m.d.round === 2, 4000);
    assert.equal(r.inst.rs.st.get(seekers[0].me.id).role, 'hide');
  } finally { await b.close(); }
});

test('المتنكر: انتهاء المحاولات = فوز المتنكرين، الرادار والطعم، انتهاء الوقت والمتنكر الأخير', async () => {
  const b = await boot(FAST_PROP);
  try {
    const { host, ps, r } = await b.room('prop', 3);
    host.send({ t: 'settings', s: { rounds: 2, seekSec: 120, map: 'hospital' } }); await sleep(15); host.send({ t: 'start' });
    await Promise.all(ps.map((p) => p.gw('setup'))); let inst = r.inst, rs = inst.rs;
    const role = (p) => rs.st.get(p.me.id).role; let seeker = ps.find((p) => role(p) === 'seek'), hiders = ps.filter((p) => role(p) === 'hide');
    hiders[0].g({ k: 'decoy' }); assert.equal((await hiders[0].gw('deny')).why, 'cooldown', 'لا طعم أثناء الاختباء');
    inst._startSeek(); await seeker.wait((m) => m.t === 'g' && m.d.k === 'phase');
    const sk = rs.st.get(seeker.me.id); const h0 = rs.st.get(hiders[0].me.id);
    // الرادار: لا يكشف معرّفًا ولا موقعًا دقيقًا، وله فترة انتظار
    sk.x = h0.x + 2; sk.z = h0.z; h0.stillAt = Date.now(); seeker.g({ k: 'radar' }); const rd = await seeker.gw('radar');
    assert.ok(Array.isArray(rd.blips)); assert.equal(JSON.stringify(rd).includes(h0.pid), false); for (const bl of rd.blips) assert.equal(Math.abs(bl[0] % 2), 0, 'موضع مقرّب لشبكة خشنة');
    seeker.g({ k: 'radar' }); assert.equal((await seeker.gw('deny')).why, 'cooldown');
    // الطعم: يظهر للمفتش كغرض عادي، وفحصه يخصم محاولة ولا يمنح نقاط كشف
    hiders[0].g({ k: 'decoy' }); await sleep(120); assert.equal(rs.decoys.length, 1); const dc = rs.decoys[0];
    await seeker.wait((m) => m.t === 'g' && m.d.k === 'snap' && m.d.mv.some((v) => v[0] === dc.pid));
    sk.x = dc.x + 0.5; sk.z = dc.z; sk.inspAt = 0; seeker.g({ k: 'inspect', pid: dc.pid }); const ins = await seeker.gw('insp'); assert.equal(ins.ok, false); assert.equal(ins.decoy, true); assert.equal(ins.att, 4);
    // استهلاك كل المحاولات → فوز المتنكرين فورًا
    for (let i = 1; i <= 4; i++) { const o = rs.statics[i]; sk.x = o.x + 0.8; sk.z = o.z; sk.inspAt = 0; seeker.g({ k: 'inspect', pid: o.pid }); await sleep(40); }
    const over = await host.gw('over'); assert.equal(over.why, 'no_attempts'); assert.equal(over.winner, 'hide');
    assert.ok(over.results.filter((x) => x.role === 'hide').every((x) => x.lines.some((l) => l[0] === 'فوز الفريق')));
    // الجولة 2: نكشف واحدًا ثم ينتهي الوقت → المتنكر الأخير +100 + فريق + صمود
    await host.wait((m) => m.t === 'g' && m.d.k === 'setup' && m.d.round === 2, 4000); inst = r.inst; rs = inst.rs;
    seeker = ps.find((p) => role(p) === 'seek'); hiders = ps.filter((p) => role(p) === 'hide'); const before = hiders.map((p) => r.players.get(p.me.id).score);
    inst._startSeek(); await sleep(30); const s2 = rs.st.get(seeker.me.id), hh = rs.st.get(hiders[0].me.id); s2.x = hh.x + 1; s2.z = hh.z; seeker.g({ k: 'inspect', pid: hh.pid }); await host.gw('found');
    const o2 = await host.wait((m) => m.t === 'g' && m.d.k === 'over' && m.d.round === 2, 6000); assert.equal(o2.d.why, 'time'); assert.equal(o2.d.winner, 'hide');
    const gain = r.players.get(hiders[1].me.id).score - before[1]; assert.equal(gain, 100 + 100 + Math.floor(120 / 30) * 20, 'فريق + الأخير + صمود 4×20');
    const fin = await host.gw('final', 4000); assert.ok(fin.ranking.length === 3 && fin.tieRule);
  } finally { await b.close(); }
});

test('المتنكر: كل خريطة جاهزة تجتاز الفحص المعماري (اتصال الغرف، وصول المفتش، لا تداخل)', async () => {
  const { analyze } = await import('../../tests/jam3atna/mapcheck.mjs'); let n = 0;
  for (const id of MAP_IDS) { if (!MAPS[id].ready) continue; n++; const r = analyze(id); assert.deepEqual(r.issues, [], id); assert.ok(r.stats.props >= 60 && r.stats.rooms >= 4, id + ' كثافة'); for (let s = 1; s <= 30; s++) { const L = genLayout(id, s); assert.ok(L.length >= r.stats.props * 0.85); for (const a of L) assert.ok(KINDS[a.kind]); } }
  assert.ok(n >= 1);
});

// ---------------------------------------------------------------- خرائط مين المتنكر: التدوير والدرج
test('المتنكر: تدوير الخرائط الست — لا تكرار قبل اكتمال الدورة، والدورة الجديدة لا تبدأ بآخر خريطة', async () => {
  const { PropGame } = await import('../src/jam3atna/prop-game.js');
  const ready = MAP_IDS.filter((id) => MAPS[id].ready); assert.equal(ready.length, 6);
  for (let trial = 0; trial < 40; trial++) {
    const g = new PropGame({}, { settings: { map: 'rotate' }, players: new Map() }, {}); g.mapQueue = []; g.lastMap = null;
    const seq = []; for (let i = 0; i < 18; i++) seq.push(g._nextMap());
    for (let c = 0; c < 3; c++) assert.equal(new Set(seq.slice(c * 6, c * 6 + 6)).size, 6, 'كل دورة تضم الست خرائط مرة واحدة');
    assert.notEqual(seq[6], seq[5]); assert.notEqual(seq[12], seq[11]);
  }
});

test('المتنكر: الدرج يبدّل الطابق تدريجيًا ولا قفز بين الطوابق (المنزل والفندق)', async () => {
  const { stepMove, updateLevel } = await import('../src/jam3atna/shared/prop-sim.js');
  const { levelY, LH } = await import('../src/jam3atna/shared/prop-core.js');
  const walk = (map, from, to, steps) => { const p = { x: from[0], z: from[1], lv: 0 }; const seen = new Set(); let prevY = levelY(map, p.x, p.z, p.lv), maxJump = 0;
    for (let i = 0; i < steps; i++) { const dx = (to[0] - p.x), dz = (to[1] - p.z), d = Math.hypot(dx, dz); if (d < 0.1) break; const m = stepMove(map, p.x, p.z, dx / d * 0.1, dz / d * 0.1, 0.3, [], null, p.lv); p.x = m.x; p.z = m.z; updateLevel(map, p); seen.add(p.lv); const y = levelY(map, p.x, p.z, p.lv); maxJump = Math.max(maxJump, Math.abs(y - prevY)); prevY = y; }
    return { p, seen, maxJump }; };
  const hotel = MAPS.hotel; let r = walk(hotel, [-14, 0], [-3, 0], 400); assert.equal(r.p.lv, 1, 'صعود درج الفندق'); assert.ok(r.maxJump < 0.25, 'لا قفزة ارتفاع: ' + r.maxJump);
  r = walk(hotel, [-3, 0], [-14, 0], 400); // من الأعلى نبدأ بطابق 1
  const house = MAPS.house; r = walk(house, [11, -5], [11, -15], 500); assert.equal(r.p.lv, 1, 'صعود درج المنزل'); assert.ok(r.maxJump < 0.25);
  // لا يصعد لاعب عبر جدار/خارج الدرج: من الصالة مباشرة إلى فوق نفس النقطة يبقى طابقه
  const q = { x: 0, z: 10, lv: 0 }; updateLevel(hotel, q); assert.equal(q.lv, 0);
});

test('المدينة: كل أنواع الأحداث التسعة تتولد وتُحترم قواعدها (لا تعطّل المهمات)', async () => {
  const seen = new Set(); const g = new CityGame({ players: new Map(), settings: { rounds: 5 } }, { timeScale: 1 }, {});
  g.world = (await import('../src/jam3atna/shared/city-sim.js')).genCity(12345);
  g.simT = () => 0; for (let i = 0; i < 600; i++) { const ev = g._ambient({ startAt: 1000 }); seen.add(ev.type); assert.ok(ev.at >= 3000 && ev.at <= 9000); }
  assert.equal(seen.size, 9, [...seen].join());
});

// ---------------------------------------------------------------- المضيف يلعب معهم
test('المضيف يلعب: يدخل تلقائيًا كلاعب، يبدأ مع لاعب واحد، يستلم مهمته ويقدر يطلع من اللعب', async () => {
  const b = await boot({ min: { city: 2 }, city: { introMs: 100, revealMs: 100, timeScale: 0.3 } });
  try {
    const host = await b.conn(); host.send({ t: 'create', game: 'city', plays: true, name: 'أبو فهد', avatar: '3' });
    const jd = await host.wait((m) => m.t === 'joined'); assert.equal(jd.you.host, true); assert.equal(jd.you.plays, true); assert.equal(jd.you.name, 'أبو فهد');
    const room = b.j.rooms.get(jd.code);
    const rv = await host.wait((m) => m.t === 'room' && m.players.length === 1); assert.equal(rv.players[0].name, 'أبو فهد');
    // لاعب ثاني بنفس الاسم يُرفض، ويُحسب المضيف ضمن العدد
    const dup = await b.conn(); dup.send({ t: 'join', code: jd.code, name: 'أبو فهد' }); assert.equal((await dup.wait((m) => m.t === 'error')).code, 'name_taken');
    const p = await b.conn(); p.send({ t: 'join', code: jd.code, name: 'سارة', avatar: '1' }); await p.wait((m) => m.t === 'joined');
    const pk = await b.conn(); pk.send({ t: 'peek', code: jd.code }); assert.equal((await pk.wait((m) => m.t === 'peek')).count, 2);
    // المضيف يلغي اللعب ثم يفعّله من جديد
    host.send({ t: 'hostplay', v: false }); await host.wait((m) => m.t === 'room' && m.players.length === 1);
    host.send({ t: 'hostplay', v: true, name: 'أبو فهد' }); await host.wait((m) => m.t === 'room' && m.players.length === 2);
    host.send({ t: 'start' }); await sleep(50); assert.equal(room.phase, 'playing');
    const mis = await host.gw('mission', 4000); assert.ok(typeof mis.text === 'string' || mis.watching, 'المضيف اللاعب يستلم مهمة لاعب وليس شاشة مضيف');
    assert.equal(host.log.some((m) => m.t === 'g' && m.d.k === 'round'), false, 'لا يستلم رسائل شاشة المضيف');
    // يطلع من اللعب: الغرفة تبقى ويصير مشاهدًا
    host.send({ t: 'hostquit' }); await host.wait((m) => m.t === 'you' && m.plays === false); await sleep(80);
    assert.equal(room.phase, 'playing'); assert.equal(room.players.get(room.hostId).plays, false); assert.ok(host.log.some((m) => m.t === 'g' && m.d.k === 'round'), 'يتحول لشاشة مشاهدة');
  } finally { await b.close(); }
});
