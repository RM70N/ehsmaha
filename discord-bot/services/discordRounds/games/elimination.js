'use strict';

// محرّك الإقصاء بالدوران (روليت الإقصاء + لعبة الدول) — مصدر الحقيقة الوحيد لحالة الراوند.
// نفس القواعد القديمة: الروليت يختار صاحب دور، يختار خلال 15 ثانية (أو ما يختار = دوران جديد
// بدون إقصاء، وبعد 5 مرات ورا بعض تنتهي اللعبة)، لين يبقى واحد.
//
// كل الحالة JSON خالص داخل round.game (تنحفظ وتنستعاد). كل مرحلة لها deadline والمدير
// يشغّل مؤقت واحد فقط عليه — فما يوجد توقيتين لنفس الراوند.
//
// المراحل:  spinning (الروليت يدور) → choosing (صاحب الدور يختار) → reveal (إعلان الإقصاء/التخطي)
//            → spinning … → done

const DEFAULT_TIMINGS = Object.freeze({ pickMs: 15000, spinMs: 4200, afterPickMs: 3500, afterSkipMs: 2500, maxSkips: 5 });

function createElimination(spec) {
  const S = {
    key: 'elimination',
    selfPick: false,
    timings: {},
    onStart() {},
    // الخيارات اللي يشوفها صاحب الدور: [{value, label, ...}]
    choices: () => [],
    // قيمة الخيار → معرّف اللاعب المُقصى (أو null لو غير صالح)
    resolve: (round, value) => value,
    // بيانات إضافية عند الإقصاء (مثل دولة اللاعب) — تنكشف وقت الإقصاء فقط
    revealOf: () => null,
    publicExtra: () => ({}),
    resultExtra: () => ({}),
    ...spec
  };
  const T = (env) => ({ ...DEFAULT_TIMINGS, ...S.timings, ...((env && env.timings) || {}) });
  const alive = (round) => round.game.alive;

  function emitSpin(round, env) {
    const g = round.game;
    if (g.alive.length <= 1) return finish(round, env, 'last_standing');
    g.round += 1;
    const landIndex = Math.floor(env.random() * g.alive.length);
    g.chooserId = g.alive[landIndex];
    g.phase = 'spinning';
    g.spin = { startsAt: env.now(), durationMs: g.timings.spinMs, order: [...g.alive], landIndex };
    g.deadline = env.now() + g.timings.spinMs;
    g.pickEndsAt = null;
    g.reveal = null;
    env.emit('spin', { round: g.round, durationMs: g.timings.spinMs, order: [...g.alive], landIndex, chooserId: g.chooserId });
  }

  function finish(round, env, reason) {
    const g = round.game;
    g.phase = 'done';
    g.deadline = null;
    g.chooserId = null;
    g.winnerId = g.alive.length === 1 ? g.alive[0] : null;
    env.finish({
      outcome: g.winnerId ? 'winner' : 'none',
      winnerIds: g.winnerId ? [g.winnerId] : [],
      reason,
      ...S.resultExtra(round)
    });
  }

  function eliminate(round, env, targetId, { by = null, reason = 'picked' }) {
    const g = round.game;
    g.alive = g.alive.filter((id) => id !== targetId);
    const entry = { id: targetId, by, reason, round: g.round, reveal: S.revealOf(round, targetId) };
    g.eliminated.push(entry);
    return entry;
  }

  const api = {
    key: S.key,

    start(round, env) {
      const ids = round.players.map((p) => p.id);
      round.game = {
        phase: 'starting',
        timings: T(env),
        alive: ids,
        eliminated: [],
        round: 0,
        chooserId: null,
        spin: null,
        pickEndsAt: null,
        deadline: null,
        skips: 0,
        reveal: null,
        winnerId: null
      };
      S.onStart(round, env);
      env.emit('game_started', { players: ids.length });
      emitSpin(round, env);
    },

    nextDeadline: (round) => (round.game && round.game.phase !== 'done' ? round.game.deadline : null),

    tick(round, env) {
      const g = round.game;
      if (!g || g.phase === 'done') return;
      if (g.phase === 'spinning') {
        g.phase = 'choosing';
        g.pickEndsAt = env.now() + g.timings.pickMs;
        g.deadline = g.pickEndsAt;
        env.emit('chooser_selected', { chooserId: g.chooserId, pickEndsAt: g.pickEndsAt, round: g.round });
      } else if (g.phase === 'choosing') {
        g.skips += 1;
        if (g.skips >= g.timings.maxSkips) return finish(round, env, 'inactive');
        g.phase = 'reveal';
        g.reveal = { type: 'skip', chooserId: g.chooserId };
        g.deadline = env.now() + g.timings.afterSkipMs;
        env.emit('pick_skipped', { chooserId: g.chooserId, skips: g.skips });
      } else if (g.phase === 'reveal') {
        if (g.alive.length <= 1) return finish(round, env, 'last_standing');
        emitSpin(round, env);
      }
    },

    act(round, userId, type, payload, env) {
      const g = round.game;
      if (!g || type !== 'pick') return { ok: false, reason: 'BAD_ACTION' };
      if (g.phase !== 'choosing') return { ok: false, reason: 'EXPIRED' };
      if (userId !== g.chooserId) return { ok: false, reason: 'NOT_YOUR_TURN' };
      if (env.now() > g.pickEndsAt) return { ok: false, reason: 'EXPIRED' };
      const targetId = S.resolve(round, payload && payload.value, userId);
      if (!targetId || !g.alive.includes(targetId) || (targetId === userId && !S.selfPick)) return { ok: false, reason: 'BAD_TARGET' };
      const self = targetId === userId;
      const entry = eliminate(round, env, targetId, { by: self ? null : userId, reason: self ? 'self' : 'picked' });
      g.skips = 0;
      g.phase = 'reveal';
      g.reveal = { type: 'eliminated', targetId, byId: entry.by, reason: entry.reason, data: entry.reveal };
      g.deadline = env.now() + g.timings.afterPickMs;
      env.emit('player_eliminated', { playerId: targetId, byId: entry.by, reason: entry.reason, reveal: entry.reveal, remaining: g.alive.length });
      return { ok: true };
    },

    // لاعب غادر السيرفر أثناء الجولة
    removePlayer(round, id, env) {
      const g = round.game;
      if (!g || g.phase === 'done' || !g.alive.includes(id)) return;
      const wasChooser = g.chooserId === id && (g.phase === 'spinning' || g.phase === 'choosing');
      const entry = eliminate(round, env, id, { reason: 'left' });
      env.emit('player_eliminated', { playerId: id, byId: null, reason: 'left', reveal: entry.reveal, remaining: g.alive.length });
      if (g.alive.length <= 1) {
        g.phase = 'reveal';
        g.reveal = { type: 'eliminated', targetId: id, byId: null, reason: 'left', data: entry.reveal };
        g.deadline = env.now() + g.timings.afterSkipMs;
      } else if (wasChooser) {
        g.phase = 'reveal';
        g.reveal = { type: 'eliminated', targetId: id, byId: null, reason: 'left', data: entry.reveal };
        g.deadline = env.now() + g.timings.afterSkipMs;
        g.chooserId = null;
      }
    },

    view(round, viewerId) {
      const g = round.game;
      const isChooser = !!viewerId && g.chooserId === viewerId;
      const out = {
        phase: g.phase,
        round: g.round,
        alive: g.alive,
        eliminated: g.eliminated.map((e) => ({ id: e.id, by: e.by, reason: e.reason, round: e.round, reveal: e.reveal })),
        chooserId: g.phase === 'spinning' ? null : g.chooserId, // اللي بيطلع ما ينكشف قبل ما الروليت يوقف
        spin: g.phase === 'spinning' ? { startsAt: g.spin.startsAt, durationMs: g.spin.durationMs, order: g.spin.order, landIndex: g.spin.landIndex } : null,
        pickEndsAt: g.phase === 'choosing' ? g.pickEndsAt : null,
        deadline: g.deadline,
        skips: g.skips,
        reveal: g.reveal,
        winnerId: g.winnerId,
        you: viewerId ? { alive: g.alive.includes(viewerId), isChooser } : null,
        ...S.publicExtra(round, viewerId)
      };
      // خيارات الاختيار لصاحب الدور فقط (والمتفرجين ما يحتاجونها)
      if (isChooser && g.phase === 'choosing') out.choices = S.choices(round, viewerId);
      return out;
    },

    summary(round) {
      const g = round.game;
      return { remaining: g.alive.length, roundNo: g.round, turnId: g.phase === 'choosing' ? g.chooserId : null, phase: g.phase };
    }
  };
  return api;
}

module.exports = { createElimination, DEFAULT_TIMINGS };
