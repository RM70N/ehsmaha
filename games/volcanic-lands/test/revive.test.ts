// اختبارات الإنعاش بهدايا تيك توك — §11.

import { describe, expect, it, vi } from 'vitest';
import { VolcanicLandsEngine } from '../src/engine.js';
import { VOLCANIC_LANDS_CONFIG, defaultStreamerSettings } from '../src/config.js';
import { MemoryStorage } from '../src/storage.js';
import type { GiftEvent } from '../src/types.js';
import { FakeClock, chat, makeBank } from './helpers.js';

function gift(userId: string, diamonds: number): GiftEvent {
  return { userId, nickname: 'م ' + userId, avatarUrl: '', giftName: 'وردة', diamonds };
}

/** مباراة وصلت لمرحلة احتراق فعلي، فيها لاعب ميت واحد على الأقل. */
function matchWithADeadPlayer(reviveOnGift = true) {
  const clock = new FakeClock();
  const revived: string[] = [];
  const engine = new VolcanicLandsEngine(
    makeBank(new MemoryStorage()),
    { onRevive: (p) => revived.push(p.userId) },
    { ...defaultStreamerSettings(), reviveOnGift },
    clock,
  );
  engine.openLobby();
  for (let i = 0; i < 6; i++) engine.enqueueChat(chat('u' + i, 'بركان', clock.now()));
  engine.drainChat();
  engine.start();
  // لا أحد يجيب إطلاقاً → الجميع يحترقون في أول جولة تصل فيها اللافا لأبراجهم
  clock.runUntil(() => engine.allPlayers().some((p) => !p.alive));
  return { engine, clock, revived };
}

describe('الإنعاش بهدايا تيك توك', () => {
  it('يعيد اللاعب المحترق فوق سطح اللافا مباشرة', () => {
    const { engine, revived } = matchWithADeadPlayer();
    const dead = engine.allPlayers().find((p) => !p.alive);
    expect(dead).toBeDefined();

    const out = engine.reviveByGift(gift(dead!.userId, 5));
    expect(out.kind).toBe('revived');
    expect(dead!.alive).toBe(true);
    expect(dead!.burnedAtRound).toBeNull();
    expect(dead!.height).toBe(engine.lava + VOLCANIC_LANDS_CONFIG.revive.heightAboveLava);
    expect(dead!.height).toBeGreaterThan(engine.lava);   // لا يحترق فوراً مرة أخرى
    expect(revived).toContain(dead!.userId);
  });

  it('لا يعمل إطلاقاً والمفتاح مطفأ', () => {
    const { engine } = matchWithADeadPlayer(false);
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    const out = engine.reviveByGift(gift(dead.userId, 100));
    expect(out).toEqual({ kind: 'rejected', reason: 'disabled' });
    expect(dead.alive).toBe(false);
  });

  it('يرفض الهدية الأقل من الحد الأدنى', () => {
    const { engine } = matchWithADeadPlayer();
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    const out = engine.reviveByGift(gift(dead.userId, VOLCANIC_LANDS_CONFIG.revive.minDiamonds - 1));
    expect(out).toEqual({ kind: 'rejected', reason: 'too-few-diamonds' });
    expect(dead.alive).toBe(false);
  });

  it('يرفض إنعاش لاعب ما زال حياً', () => {
    const { engine } = matchWithADeadPlayer();
    const alive = engine.alivePlayers()[0];
    if (!alive) return;
    expect(engine.reviveByGift(gift(alive.userId, 50))).toEqual({ kind: 'rejected', reason: 'still-alive' });
  });

  it('يرفض من لم ينضم للعبة أصلاً', () => {
    const { engine } = matchWithADeadPlayer();
    expect(engine.reviveByGift(gift('غريب', 50))).toEqual({ kind: 'rejected', reason: 'not-playing' });
  });

  it('يحدّ عدد مرات الإنعاش لكل لاعب', () => {
    const { engine } = matchWithADeadPlayer();
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    expect(engine.reviveByGift(gift(dead.userId, 10)).kind).toBe('revived');
    expect(dead.revivedCount).toBe(VOLCANIC_LANDS_CONFIG.revive.maxPerPlayer);

    // نقتله مرة ثانية ثم نحاول إنعاشه من جديد
    dead.alive = false;
    const out = engine.reviveByGift(gift(dead.userId, 10));
    expect(out).toEqual({ kind: 'rejected', reason: 'limit-reached' });
    expect(dead.alive).toBe(false);
  });

  it('لا يعمل بعد انتهاء المباراة', () => {
    const { engine, clock } = matchWithADeadPlayer();
    clock.runUntil(() => engine.phase === 'GAME_OVER');
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    expect(engine.reviveByGift(gift(dead.userId, 99))).toEqual({ kind: 'rejected', reason: 'match-over' });
  });

  it('اللاعب المُنعش يعود لعداد الصامدين ويقدر يجيب الجولة التالية', () => {
    const { engine, clock } = matchWithADeadPlayer();
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    const before = engine.alivePlayers().length;
    engine.reviveByGift(gift(dead.userId, 10));
    expect(engine.alivePlayers().length).toBe(before + 1);

    // نصل لسؤال جديد ونتأكد أن إجابته تُحتسب
    clock.runUntil(() => engine.phase === 'QUESTION');
    if (engine.phase !== 'QUESTION' || !engine.question) return;
    engine.enqueueChat(chat(dead.userId, String(engine.question.correctIndex + 1), clock.now() + 500));
    engine.drainChat();
    expect(dead.answeredThisRound).toBe(true);
  });

  it('«إعادة تشغيل» تصفّر عدّاد الإنعاش', () => {
    const { engine } = matchWithADeadPlayer();
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    engine.reviveByGift(gift(dead.userId, 10));
    expect(dead.revivedCount).toBe(1);
    engine.restart();
    expect(dead.revivedCount).toBe(0);
  });

  it('يُبلّغ الواجهة مرة واحدة لكل إنعاش ناجح فقط', () => {
    const clock = new FakeClock();
    const spy = vi.fn();
    const engine = new VolcanicLandsEngine(
      makeBank(new MemoryStorage()), { onRevive: spy },
      { ...defaultStreamerSettings(), reviveOnGift: true }, clock,
    );
    engine.openLobby();
    for (let i = 0; i < 5; i++) engine.enqueueChat(chat('p' + i, 'بركان', clock.now()));
    engine.drainChat();
    engine.start();
    clock.runUntil(() => engine.allPlayers().some((p) => !p.alive));
    const dead = engine.allPlayers().find((p) => !p.alive)!;
    engine.reviveByGift(gift(dead.userId, 1));
    engine.reviveByGift(gift(dead.userId, 1));   // مرفوضة: حيّ الآن
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
