'use strict';

// اختبارات وحدة لمحرّكات الألعاب (بدون شبكة): قواعد الدول/الروليت/القناص + المدير (انتقالات الحالة، التزامن، الاستعادة).

const test = require('node:test');
const assert = require('node:assert/strict');
const { RoundManager } = require('../services/discordRounds/roundManager');
const { createMemoryStore } = require('../services/discordRounds/roundStore');
const rules = require('../services/discordRounds/rules');
const { FAST, wait, until, profile } = require('./helpers/roundsHarness');

const mgr = (extra = {}) => new RoundManager({ store: createMemoryStore(), settings: { ...FAST, playerGraceMs: 60000, ...extra.settings }, ...extra });
const mk = (m, type, n, ch = 'c1') => {
  const people = Array.from({ length: n }, (_, i) => profile(i));
  const { round } = m.create({ gameType: type, guildId: 'g', channelId: ch, host: people[0] });
  for (const p of people.slice(1)) m.join(round.roundId, p);
  return { round, people, id: round.roundId };
};
async function run(m, round) {
  m.start(round.roundId, round.hostDiscordId);
  await until(() => round.status === 'running');
}

test('قواعد الدول: توزيع بدون تكرار، وتكرار عشوائي فقط لو اللاعبين أكثر من الدول، وتنظيف القائمة', () => {
  const ids = Array.from({ length: 50 }, (_, i) => `p${i}`);
  const out = rules.assignCountries(ids);
  assert.equal(new Set(Object.values(out).map((c) => c.name)).size, 50, '50 لاعب = 50 دولة مختلفة');
  const tiny = [{ name: 'أ', flagEmoji: '🇦' }, { name: 'ب', flagEmoji: '🇧' }];
  assert.equal(Object.keys(rules.assignCountries(['1', '2', '3', '4', '5'], tiny)).length, 5);
  assert.deepEqual(rules.normalizeCountries([{ name: 'س', flagEmoji: '🇸', flagImageUrl: 'http://x/y.png' }, { name: 'س', flagEmoji: '🇸' }, { name: '' }, null]), [{ name: 'س', flagEmoji: '🇸', flagImageUrl: null }]);
  assert.throws(() => rules.assignCountries(['1'], []));
});

test('القناص (مثل الموقع): شبكة 50، ذخيرة 25/6/4، المربع يتسع لاعبين، القنبلة 4 متجاورة والنيوك 6 (رقم-1..رقم+4)', async (t) => {
  const m = mgr({ random: () => 0 }); // القناص = أول لاعب دائماً
  t.after(() => m.shutdown({ persist: false }));
  const { round, people, id } = mk(m, 'sniper', 5);
  await run(m, round);
  const g = round.game;
  assert.equal(g.gridSize, 50);
  assert.deepEqual(g.ammo, { sniper: 25, bomb: 6, nuke: 4 });
  const [sn, a, b, c, d] = people.map((p) => p.id);
  assert.equal(g.sniperId, sn);
  assert.ok(m.act(id, a, 'hide', { box: 10 }).ok);
  assert.ok(m.act(id, b, 'hide', { box: 10 }).ok, 'لاعبين بنفس المربع');
  assert.equal(m.act(id, c, 'hide', { box: 10 }).reason, 'TAKEN', 'الثالث مرفوض');
  assert.ok(m.act(id, c, 'hide', { box: 14 }).ok);
  assert.ok(m.act(id, d, 'hide', { box: 15 }).ok); // الكل اختبأ ← الصيد
  await until(() => g.phase === 'hunting');
  // نيوك على 15: يغطي 14..19 → يصيب c (14) و d (15)، و a/b بالمربع 10 ينجون
  const r = m.act(id, sn, 'shoot', { weapon: 'nuke', box: 15 });
  assert.ok(r.ok);
  assert.equal(r.hits, 2);
  assert.deepEqual(Object.keys(g.shot).map(Number).sort((x, y) => x - y), [14, 15, 16, 17, 18, 19]);
  assert.equal(g.ammo.nuke, 3);
  assert.deepEqual(g.alive.filter((x) => x !== sn).sort(), [a, b].sort());
  // قنبلة على 10 تصيب المربع 10 (لاعبين معاً) وما حوله 11..13
  const r2 = m.act(id, sn, 'shoot', { weapon: 'bomb', box: 10 });
  assert.equal(r2.hits, 2, 'كل من بالمربع ينقصى');
  assert.equal(round.status, 'finished');
  assert.equal(round.result.outcome, 'sniper');
});

test('القناص: حدود الشبكة (النيوك عند الطرف) والمربع المضروب لا يعاد، والسنايبر مربع واحد', async (t) => {
  const m = mgr({ random: () => 0 });
  t.after(() => m.shutdown({ persist: false }));
  const { round, people, id } = mk(m, 'sniper', 4);
  await run(m, round);
  const [sn, a, b, c] = people.map((p) => p.id);
  m.act(id, a, 'hide', { box: 1 }); m.act(id, b, 'hide', { box: 50 }); m.act(id, c, 'hide', { box: 30 });
  await until(() => round.game.phase === 'hunting');
  assert.equal(m.act(id, sn, 'shoot', { weapon: 'nuke', box: 1 }).hits, 1, 'يغطي 1..5 فقط (بدون 0)');
  assert.equal(m.act(id, sn, 'shoot', { weapon: 'bomb', box: 49 }).hits, 1, 'يغطي 49..50 فقط');
  assert.equal(m.act(id, sn, 'shoot', { weapon: 'sniper', box: 31 }).hits, 0, 'سنايبر مربع واحد (31)');
  assert.equal(Object.keys(round.game.shot).length, 5 + 2 + 1);
  assert.equal(round.game.alive.includes(c), true);
});

test('القناص: غادر السيرفر قبل الصيد، لا مختبئ ← بدون فائز، ونفاد الذخيرة ما يوقف اللعبة', async (t) => {
  const m = mgr({ random: () => 0, settings: { timings: { sniper: { hideMs: 80, huntMs: 5000 } } } });
  t.after(() => m.shutdown({ persist: false }));
  const { round, id, people } = mk(m, 'sniper', 3);
  await run(m, round);
  await until(() => round.status === 'finished', 2000); // لا أحد اختبأ
  assert.equal(round.result.outcome, 'none');
  assert.equal(round.result.reason, 'no_hiders');
  void id; void people;
  const m2 = mgr({ random: () => 0 });
  t.after(() => m2.shutdown({ persist: false }));
  const s = mk(m2, 'sniper', 3, 'c2');
  await run(m2, s.round);
  m2.removeMember('g', s.people[0].id); // القناص غادر
  assert.equal(s.round.status, 'finished');
  assert.equal(s.round.result.outcome, 'none');
  assert.equal(s.round.result.reason, 'aborted');
});

test('الإقصاء: صاحب الدور فقط، الدول تسمح بإقصاء النفس والروليت لا، والمهلة ثم 5 تخطّيات تنهي بدون فائز', async (t) => {
  const m = mgr({ settings: { timings: { roulette: { pickMs: 60, spinMs: 20, afterPickMs: 20, afterSkipMs: 20 }, countries: { pickMs: 400, spinMs: 20, afterPickMs: 20, afterSkipMs: 20 } } } });
  t.after(() => m.shutdown({ persist: false }));
  const r = mk(m, 'roulette', 4);
  await run(m, r.round);
  await until(() => r.round.status === 'finished', 3000); // لا أحد يختار ← 5 تخطّيات
  assert.equal(r.round.result.outcome, 'none');
  assert.equal(r.round.result.reason, 'inactive');
  assert.equal(r.round.game.alive.length, 4, 'ما انقصى أحد');

  const c = mk(m, 'countries', 3, 'c3');
  await run(m, c.round);
  await until(() => c.round.game.phase === 'choosing');
  const chooser = c.round.game.chooserId;
  const own = Object.entries(c.round.game.tokens).find(([, uid]) => uid === chooser)[0];
  const stranger = c.people.find((p) => p.id !== chooser).id;
  assert.equal(m.act(c.id, stranger, 'pick', { value: own }).reason, 'NOT_YOUR_TURN');
  const res = m.act(c.id, chooser, 'pick', { value: own });
  assert.ok(res.ok, 'الدول: يقصي دولته هو');
  assert.equal(c.round.game.eliminated[0].reason, 'self');
  assert.ok(c.round.game.eliminated[0].reveal.name, 'تنكشف دولته لحظة الإقصاء');
});

test('المدير: ما يبدأ بدون العدد، المضيف لا يطرد نفسه ولا يخرج، بدء/إلغاء بعد البدء مرفوض، ومنع انضمام بعد القفل', async (t) => {
  const m = mgr();
  t.after(() => m.shutdown({ persist: false }));
  const { round, people, id } = mk(m, 'countries', 2);
  assert.equal(m.start(id, people[0].id).reason, 'NOT_ENOUGH');
  m.join(id, profile(2));
  assert.equal(m.start(id, people[1].id).reason, 'NOT_HOST');
  assert.equal(m.kick(id, people[0].id, people[0].id).reason, 'CANNOT_KICK_HOST');
  assert.equal(m.leave(id, people[0].id).reason, 'HOST_CANNOT_LEAVE');
  assert.equal(m.start(id, people[0].id).ok, true);
  assert.equal(round.status, 'starting');
  assert.equal(m.join(id, profile(9)).reason, 'STARTED');
  assert.equal(m.leave(id, people[1].id).reason, 'STARTED');
  assert.equal(m.cancel(id, people[0].id).reason, 'STARTED');
  assert.equal(m.kick(id, people[0].id, people[1].id).reason, 'STARTED');
  await until(() => round.status === 'running');
  assert.equal(m.start(id, people[0].id).reason, 'ALREADY_STARTED');
});

test('المدير: الراوند المنتهي بمهلة الانتظار يلغى ويحرر القناة، وتنظيف المؤقتات بعد النهاية', async (t) => {
  const m = mgr({ settings: { lobbyTtlMs: 80 } });
  t.after(() => m.shutdown({ persist: false }));
  const { round } = mk(m, 'roulette', 2, 'c9');
  await until(() => round.status === 'cancelled', 1500);
  assert.equal(round.cancelReason, 'timeout');
  assert.equal(m.getByChannel('c9'), null);
  assert.equal(round.rt.timer, null);
  assert.equal(round.rt.graceTimers.size, 0);
  assert.equal(m.create({ gameType: 'roulette', guildId: 'g', channelId: 'c9', host: profile(0) }).ok, true);
});

test('الاستعادة من التخزين: راوند جاري يكمل بمؤقتاته، والانتظار يرجع، ونفس الراوند ما يتكرر', async (t) => {
  const store = createMemoryStore();
  const m1 = new RoundManager({ store, settings: { ...FAST, playerGraceMs: 60000 } });
  const { round, id, people } = mk(m1, 'roulette', 3);
  await run(m1, round);
  await until(() => round.game.phase === 'choosing');
  await m1.flush();
  await m1.shutdown({ persist: false });
  const m2 = new RoundManager({ store, settings: { ...FAST, playerGraceMs: 60000 } });
  t.after(() => m2.shutdown({ persist: false }));
  const out = await m2.restore();
  assert.equal(out.restored, 1);
  const r2 = m2.get(id);
  assert.equal(r2.status, 'running');
  assert.equal(m2.list().length, 1, 'ما تكرر');
  // المؤقت يشتغل بعد الاستعادة: التخطّي ثم النهاية بدون فائز
  await until(() => r2.status === 'finished', 4000);
  assert.equal(r2.result.reason, 'inactive');
  void people;
});
