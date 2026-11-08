'use strict';

// لعبة القناص (/قناص) — نفس القواعد القديمة:
//   hiding  : لاعب عشوائي يصير القناص، والباقين يختارون مخبأ سري (مربع) خلال 30 ثانية (أو أبكر لو اختبأ
//             الكل). اللي ما اختبأ ينطرد.
//   hunting : 4 دقائق. القناص يرمي بـ3 أسلحة (سنايبر 1 مربع / قنبلة 3 / نيوك 5) بذخيرة منفصلة.
//   النهاية : القناص يصيد الكل ← يفوز · انتهى الوقت ← الناجين يفوزون · القناص غادر ← تنتهي الجولة.
// الأسرار (مخابئ اللاعبين) بحالة الخادم فقط: القناص ما يستلم عنها شي، واللاعب يستلم مخبأه هو،
// والكل يستلمها بعد النهاية. المربعات الفاضية يعرفها القناص بس، والإصابات علنية.

const rules = require('../rules');

const WEAPON_KEYS = ['sniper', 'bomb', 'nuke'];
const DEFAULT_TIMINGS = Object.freeze({ hideMs: rules.SNIPER.TIMINGS.hideMs, huntMs: rules.SNIPER.TIMINGS.huntMs });

const hidersOf = (g) => g.alive.filter((id) => id !== g.sniperId);
const allHidden = (g) => hidersOf(g).length > 0 && hidersOf(g).every((id) => g.hides[id]);
const CAP = rules.SNIPER.CELL_CAPACITY;
const occupants = (g, box) => g.boxOwner[box] || [];
// مناطق الإصابة كما بصفحة القناص بالموقع: السنايبر مربع، القنبلة 4 متجاورة، النيوك 6 متجاورة
function targetsOf(g, weapon, box) {
  const w = rules.SNIPER.WEAPONS[weapon];
  const out = [];
  for (let d = w.from; d <= w.to; d++) {
    const b = box + d;
    if (b >= 1 && b <= g.gridSize) out.push(b);
  }
  return out;
}
const removeFromBox = (g, id) => {
  const box = g.hides[id];
  if (box && g.boxOwner[box]) {
    g.boxOwner[box] = g.boxOwner[box].filter((x) => x !== id);
    if (!g.boxOwner[box].length) delete g.boxOwner[box];
  }
  delete g.hides[id];
};

function finish(round, env, outcome) {
  const g = round.game;
  g.phase = 'done';
  g.deadline = null;
  g.outcome = outcome;
  const survivors = hidersOf(g);
  const none = outcome === 'aborted' || outcome === 'no_hiders'; // القناص غادر / ما أحد اختبأ ← بدون فائز
  const sniperWon = outcome === 'sniper' || !survivors.length;
  env.finish({
    outcome: none ? 'none' : sniperWon ? 'sniper' : 'survivors',
    winnerIds: none ? [] : sniperWon ? [g.sniperId] : survivors,
    reason: outcome,
    sniperId: g.sniperId,
    shots: g.shots,
    hits: g.eliminated.filter((e) => e.reason === 'shot').length,
    hides: { ...g.hides } // تنكشف بعد النهاية
  });
}

function endHiding(round, env) {
  const g = round.game;
  if (g.phase !== 'hiding') return;
  const noHide = hidersOf(g).filter((id) => !g.hides[id]);
  for (const id of noHide) {
    g.alive = g.alive.filter((x) => x !== id);
    g.eliminated.push({ id, reason: 'no_hide' });
  }
  if (noHide.length) env.emit('players_auto_removed', { playerIds: noHide, reason: 'no_hide' });
  if (!hidersOf(g).length) return finish(round, env, 'no_hiders');
  g.phase = 'hunting';
  g.huntEndsAt = env.now() + g.timings.huntMs;
  g.deadline = g.huntEndsAt;
  env.emit('hunt_started', { sniperId: g.sniperId, huntEndsAt: g.huntEndsAt, survivors: hidersOf(g).length });
}

module.exports = {
  key: 'sniper',
  meta: {
    key: 'sniper',
    command: '/قناص',
    name: 'لعبة القناص',
    emoji: '🔫',
    minPlayers: 3,
    maxPlayers: 50,
    intro: 'واحد بالصدفة يصير القناص، والباقين يختبئون بمربعات سرية. القناص عنده 4 دقائق و3 أسلحة يصيدكم فيها.'
  },

  start(round, env) {
    const ids = round.players.map((p) => p.id);
    const sniperId = ids[Math.floor(env.random() * ids.length)];
    const gridSize = rules.gridSizeFor(ids.length);
    const timings = { ...DEFAULT_TIMINGS, ...(env.timings || {}) };
    round.game = {
      phase: 'hiding',
      timings,
      sniperId,
      gridSize,
      ammo: rules.ammoFor(gridSize),
      alive: ids,
      hides: {}, // playerId -> box (سري)
      boxOwner: {}, // box -> [playerIds] (سري) — المربع يتسع CELL_CAPACITY
      shot: {}, // box -> 'hit' | 'miss' (القناص يشوف الاثنين، والعامة الإصابات)
      shots: 0,
      eliminated: [], // { id, box?, weapon?, reason: 'shot'|'no_hide'|'left' }
      hideEndsAt: env.now() + timings.hideMs,
      huntEndsAt: null,
      deadline: env.now() + timings.hideMs,
      lastShot: null
    };
    env.emit('game_started', { players: ids.length });
    env.emit('sniper_selected', { sniperId, gridSize, hideEndsAt: round.game.hideEndsAt });
  },

  nextDeadline: (round) => (round.game && round.game.phase !== 'done' ? round.game.deadline : null),

  tick(round, env) {
    const g = round.game;
    if (!g) return;
    if (g.phase === 'hiding') endHiding(round, env);
    else if (g.phase === 'hunting') finish(round, env, 'time');
  },

  act(round, userId, type, payload, env) {
    const g = round.game;
    if (!g) return { ok: false, reason: 'EXPIRED' };
    if (type === 'hide') {
      if (g.phase !== 'hiding') return { ok: false, reason: 'EXPIRED' };
      if (userId === g.sniperId) return { ok: false, reason: 'SNIPER' };
      if (!g.alive.includes(userId)) return { ok: false, reason: 'NOT_PLAYER' };
      const n = Number(payload && payload.box);
      if (!Number.isInteger(n) || n < 1 || n > g.gridSize) return { ok: false, reason: 'BAD_BOX' };
      const others = occupants(g, n).filter((x) => x !== userId);
      if (others.length >= CAP) return { ok: false, reason: 'TAKEN' };
      removeFromBox(g, userId);
      g.hides[userId] = n;
      g.boxOwner[n] = [...others, userId];
      // الإعلان العام يعرف العدد فقط (مو وين اختبأ)
      env.emit('player_hidden', { hidden: hidersOf(g).filter((id) => g.hides[id]).length, total: hidersOf(g).length });
      if (allHidden(g)) endHiding(round, env); // الكل اختبأ ← الصيد يبدأ فوراً
      return { ok: true };
    }
    if (type === 'shoot') {
      if (g.phase !== 'hunting') return { ok: false, reason: 'EXPIRED' };
      if (userId !== g.sniperId) return { ok: false, reason: 'NOT_SNIPER' };
      const weapon = payload && payload.weapon;
      if (!WEAPON_KEYS.includes(weapon)) return { ok: false, reason: 'BAD_WEAPON' };
      if (g.ammo[weapon] <= 0) return { ok: false, reason: 'NO_AMMO' };
      const aim = Number(payload && payload.box);
      if (!Number.isInteger(aim) || aim < 1 || aim > g.gridSize) return { ok: false, reason: 'BAD_BOX' };
      const list = targetsOf(g, weapon, aim);
      g.ammo[weapon] -= 1;
      g.shots += 1;
      const hits = [];
      const misses = [];
      for (const b of list.sort((a, c) => a - c)) {
        const here = occupants(g, b).filter((id) => g.alive.includes(id));
        if (here.length) {
          g.shot[b] = 'hit';
          for (const owner of here) {
            g.alive = g.alive.filter((x) => x !== owner);
            delete g.hides[owner];
            const entry = { id: owner, box: b, weapon, reason: 'shot' };
            g.eliminated.push(entry);
            hits.push(entry);
          }
          delete g.boxOwner[b];
        } else {
          g.shot[b] = 'miss';
          misses.push(b);
        }
      }
      g.lastShot = { weapon, hits: hits.map((h) => ({ id: h.id, box: h.box })), missCount: misses.length, at: env.now() };
      // علني: الإصابات والعدد فقط (المربعات الفاضية للقناص بس)
      env.emit('shot_fired', { weapon, aim, boxes: list.length, hits: g.lastShot.hits, remaining: hidersOf(g).length });
      for (const h of hits) env.emit('player_eliminated', { playerId: h.id, byId: g.sniperId, reason: 'shot', box: h.box, weapon, remaining: hidersOf(g).length });
      if (!hidersOf(g).length) finish(round, env, 'sniper');
      return { ok: true, hits: hits.length, misses: misses.length };
    }
    return { ok: false, reason: 'BAD_ACTION' };
  },

  removePlayer(round, id, env) {
    const g = round.game;
    if (!g || g.phase === 'done' || !g.alive.includes(id)) return;
    if (id === g.sniperId) {
      env.emit('player_eliminated', { playerId: id, reason: 'left', remaining: hidersOf(g).length });
      return finish(round, env, 'aborted'); // القناص غادر السيرفر ← الجولة تنتهي بدون فائز
    }
    g.alive = g.alive.filter((x) => x !== id);
    removeFromBox(g, id);
    g.eliminated.push({ id, reason: 'left' });
    env.emit('player_eliminated', { playerId: id, reason: 'left', remaining: hidersOf(g).length });
    if (g.phase === 'hiding') {
      if (!hidersOf(g).length) return endHiding(round, env);
      if (allHidden(g)) endHiding(round, env);
    } else if (g.phase === 'hunting' && !hidersOf(g).length) {
      finish(round, env, 'sniper');
    }
  },

  view(round, viewerId) {
    const g = round.game;
    const isSniper = !!viewerId && viewerId === g.sniperId;
    const done = g.phase === 'done';
    const hitMarks = {};
    for (const [b, v] of Object.entries(g.shot)) if (v === 'hit' || isSniper || done) hitMarks[b] = v;
    const out = {
      phase: g.phase,
      sniperId: g.sniperId,
      gridSize: g.gridSize,
      hideEndsAt: g.hideEndsAt,
      huntEndsAt: g.huntEndsAt,
      deadline: g.deadline,
      alive: g.alive,
      hiders: hidersOf(g),
      hiddenCount: hidersOf(g).filter((id) => g.hides[id]).length,
      // القناص وبعد النهاية: الأسلحة الباقية (علنية بالرسالة العامة أيضاً)
      ammo: g.ammo,
      shots: g.shots,
      marks: hitMarks,
      eliminated: g.eliminated.map((e) => ({ id: e.id, reason: e.reason, box: e.box || null, weapon: e.weapon || null })),
      lastShot: g.lastShot,
      weapons: rules.SNIPER.WEAPONS,
      you: viewerId ? { isSniper, alive: g.alive.includes(viewerId), box: !isSniper && g.hides[viewerId] ? g.hides[viewerId] : null } : null
    };
    if (g.phase === 'hiding' && viewerId && !isSniper && g.alive.includes(viewerId)) {
      // المربعات المحجوزة عند غيرك (بدون ما نكشف عند مين) — تظهر معطّلة
      out.takenBoxes = Object.keys(g.boxOwner).map(Number).filter((b) => g.boxOwner[b].filter((x) => x !== viewerId).length >= CAP);
    }
    out.cellCapacity = CAP;
    if (g.phase === 'hunting' && isSniper) {
      // مناطق كل سلاح تتحسب بالعميل من نفس القاعدة (للمعاينة فقط) — القرار النهائي للخادم
      out.reach = Object.fromEntries(WEAPON_KEYS.map((w) => [w, { from: rules.SNIPER.WEAPONS[w].from, to: rules.SNIPER.WEAPONS[w].to }]));
    }
    if (done && round.result) out.hides = round.result.hides || null;
    return out;
  },

  summary(round) {
    const g = round.game;
    return { remaining: hidersOf(g).length, roundNo: null, turnId: g.sniperId, phase: g.phase };
  }
};
