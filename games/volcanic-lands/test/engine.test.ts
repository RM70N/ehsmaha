// اختبارات آلة الحالة والمحرّك والحالات الحدّية — §4 و§6 و§12.

import { describe, expect, it, vi } from 'vitest';
import { VolcanicLandsEngine } from '../src/engine.js';
import { StateMachine } from '../src/state-machine.js';
import { VOLCANIC_LANDS_CONFIG } from '../src/config.js';
import { MemoryStorage } from '../src/storage.js';
import { FakeClock, chat, makeBank } from './helpers.js';

function makeEngine(clock = new FakeClock()) {
  const engine = new VolcanicLandsEngine(makeBank(new MemoryStorage()), {}, undefined, clock);
  return { engine, clock };
}

/** ينضم N لاعباً ثم تبدأ المباراة وتصل لأول سؤال. */
function startWith(count: number) {
  const clock = new FakeClock();
  const { engine } = makeEngine(clock);
  engine.openLobby();
  for (let i = 0; i < count; i++) engine.enqueueChat(chat('u' + i, 'بركان', clock.now()));
  engine.drainChat();
  engine.start();
  clock.runUntil(() => engine.phase === 'QUESTION');
  return { engine, clock };
}

describe('آلة الحالة', () => {
  it('ترفض الانتقالات غير المسموحة', () => {
    const m = new StateMachine(new FakeClock());
    expect(m.current).toBe('IDLE');
    expect(m.go('QUESTION')).toBe(false);
    expect(m.go('LOBBY')).toBe(true);
    expect(m.go('BURN')).toBe(false);
    expect(m.go('COUNTDOWN')).toBe(true);
  });

  it('تلغي مؤقّتات الحالة السابقة عند أي انتقال — لا setTimeout يتيمة', () => {
    const clock = new FakeClock();
    const m = new StateMachine(clock);
    const spy = vi.fn();
    m.go('LOBBY');
    m.after(1000, spy);
    m.go('COUNTDOWN'); // الانتقال يلغي مؤقّت اللوبي
    clock.runUntil(() => false, 50);
    expect(spy).not.toHaveBeenCalled();
  });

  it('لا ينفّذ المؤقّت إذا تغيّرت الحالة قبل موعده', () => {
    const clock = new FakeClock();
    const m = new StateMachine(clock);
    const spy = vi.fn();
    m.go('LOBBY');
    m.after(500, spy);
    m.go('IDLE');
    m.go('LOBBY');
    clock.runUntil(() => false, 50);
    expect(spy).not.toHaveBeenCalled();
  });

  it('تبلّغ المستمعين بالانتقال', () => {
    const m = new StateMachine(new FakeClock());
    const seen: string[] = [];
    m.onChange((to, from) => seen.push(from + '→' + to));
    m.go('LOBBY');
    m.go('COUNTDOWN');
    expect(seen).toEqual(['IDLE→LOBBY', 'LOBBY→COUNTDOWN']);
  });
});

describe('الانضمام', () => {
  it('كلمة الانضمام تضيف اللاعب مرة واحدة فقط', () => {
    const { engine, clock } = makeEngine();
    engine.openLobby();
    engine.enqueueChat(chat('a', 'بركان', clock.now()));
    engine.enqueueChat(chat('a', 'بركان', clock.now() + 1));
    const outcomes = engine.drainChat();
    expect(outcomes[0]!.kind).toBe('joined');
    expect(outcomes[1]!.kind).toBe('ignored');
    expect(engine.allPlayers()).toHaveLength(1);
  });

  it('إزالة التكرار حسب userId لا حسب الاسم', () => {
    const { engine, clock } = makeEngine();
    engine.openLobby();
    engine.enqueueChat({ userId: 'a', nickname: 'سلطان', avatarUrl: '', comment: 'بركان', timestamp: clock.now() });
    engine.enqueueChat({ userId: 'b', nickname: 'سلطان', avatarUrl: '', comment: 'بركان', timestamp: clock.now() });
    engine.drainChat();
    expect(engine.allPlayers()).toHaveLength(2);
  });

  it('يحترم الحد الأقصى للاعبين', () => {
    const { engine, clock } = makeEngine();
    engine.updateSettings({ maxPlayers: 3 });
    engine.openLobby();
    for (let i = 0; i < 10; i++) engine.enqueueChat(chat('u' + i, 'بركان', clock.now()));
    engine.drainChat();
    expect(engine.allPlayers()).toHaveLength(3);
  });

  it('الانضمام المتأخر يبدأ فوق اللافا الحالية', () => {
    const { engine, clock } = startWith(4);
    // ندفع اللعبة جولة كاملة حتى ترتفع اللافا.
    clock.runUntil(() => engine.lava > 0);
    clock.runUntil(() => engine.phase === 'QUESTION');
    engine.enqueueChat(chat('late', 'بركان', clock.now()));
    engine.drainChat();
    const late = engine.allPlayers().find((p) => p.userId === 'late');
    expect(late).toBeDefined();
    expect(late!.height).toBe(engine.lava + VOLCANIC_LANDS_CONFIG.lateJoinLavaMargin);
    expect(late!.alive).toBe(true);
  });

  it('يمنع الانضمام المتأخر عند إطفاء المفتاح', () => {
    const { engine, clock } = startWith(4);
    engine.updateSettings({ allowLateJoin: false });
    engine.enqueueChat(chat('late', 'بركان', clock.now()));
    engine.drainChat();
    expect(engine.allPlayers().find((p) => p.userId === 'late')).toBeUndefined();
  });
});

describe('الإجابات', () => {
  it('أول إجابة فقط تُحتسب — لا تراجع', () => {
    const { engine, clock } = startWith(3);
    const correct = engine.question!.correctIndex + 1;
    const wrong = (correct % 4) + 1;
    engine.enqueueChat(chat('u0', String(wrong), clock.now() + 1000));
    engine.enqueueChat(chat('u0', String(correct), clock.now() + 2000));
    const out = engine.drainChat();
    expect(out[0]!.kind).toBe('answered');
    expect(out[1]!.kind).toBe('ignored');
    const player = engine.allPlayers().find((p) => p.userId === 'u0')!;
    expect(player.choice).toBe(wrong);
  });

  it('لا يكشف إجابة أي لاعب قبل REVEAL — فقط عدّاد «أجاب N»', () => {
    const { engine, clock } = startWith(5);
    engine.enqueueChat(chat('u0', '1', clock.now() + 500));
    engine.enqueueChat(chat('u1', '2', clock.now() + 600));
    engine.drainChat();
    expect(engine.answered).toBe(2);
    expect(engine.phase).toBe('QUESTION');
  });

  it('نص ليس إجابة يُتجاهل بلا احتساب', () => {
    const { engine, clock } = startWith(3);
    engine.enqueueChat(chat('u0', 'أعتقد 3', clock.now() + 500));
    engine.drainChat();
    expect(engine.answered).toBe(0);
  });

  it('يحسب الزمن من لحظة عرض السؤال ويخصم تأخير الشات المعروف', () => {
    const { engine, clock } = startWith(3);
    const start = clock.now();
    engine.enqueueChat({
      userId: 'u0', nickname: 'x', avatarUrl: '', comment: '1',
      timestamp: start + 12000, chatLatencyMs: 4000,
    });
    engine.drainChat();
    const player = engine.allPlayers().find((p) => p.userId === 'u0')!;
    expect(player.answerTime).toBeCloseTo(8, 5);
  });

  it('يتجاهل ما يزيد على 5 رسائل من نفس المستخدم في الثانية', () => {
    const { engine, clock } = startWith(3);
    const now = clock.now();
    for (let i = 0; i < 8; i++) engine.enqueueChat(chat('u0', 'نص' + i, now + i));
    const out = engine.drainChat();
    const flooded = out.filter((o) => o.kind === 'ignored' && o.reason === 'flood');
    expect(flooded.length).toBe(3);
  });

  it('الطابور لا يُعالَج إلا عند التفريغ', () => {
    const { engine, clock } = startWith(3);
    engine.enqueueChat(chat('u0', '1', clock.now() + 100));
    expect(engine.answered).toBe(0);
    engine.drainChat();
    expect(engine.answered).toBe(1);
  });
});

describe('الحالات الحدّية', () => {
  it('لاعب واحد فقط في اللوبي → لا تبدأ', () => {
    const { engine, clock } = makeEngine();
    engine.openLobby();
    engine.enqueueChat(chat('only', 'بركان', clock.now()));
    engine.drainChat();
    expect(engine.start()).toBe(false);
    expect(engine.phase).toBe('LOBBY');
  });

  it('المباراة تنتهي حتماً ويوجد فائز واحد', () => {
    const { engine, clock } = startWith(6);
    clock.runUntil(() => engine.phase === 'GAME_OVER');
    expect(engine.phase).toBe('GAME_OVER');
    expect(engine.winner()).not.toBeNull();
    expect(engine.alivePlayers().length).toBeLessThanOrEqual(1);
  });

  it('«إعادة تشغيل» لا يصفّر الأسئلة المستخدمة', () => {
    const { engine, clock } = startWith(4);
    clock.runUntil(() => engine.phase === 'GAME_OVER');
    const used = engine.usedQuestionCount;
    const session = engine.sessionId;
    expect(used).toBeGreaterThan(0);
    engine.restart();
    expect(engine.usedQuestionCount).toBe(used);
    expect(engine.sessionId).toBe(session);
    expect(engine.phase).toBe('LOBBY');
  });

  it('«جلسة جديدة» يصفّر الأسئلة المستخدمة ويغيّر المعرّف', () => {
    const { engine, clock } = startWith(4);
    clock.runUntil(() => engine.phase === 'GAME_OVER');
    const session = engine.sessionId;
    engine.startNewSession();
    expect(engine.usedQuestionCount).toBe(0);
    expect(engine.sessionId).not.toBe(session);
    expect(engine.allPlayers()).toHaveLength(0);
  });

  it('«تخطّي السؤال» ينهي السؤال فوراً', () => {
    const { engine } = startWith(4);
    expect(engine.phase).toBe('QUESTION');
    expect(engine.skipQuestion()).toBe(true);
    expect(engine.phase).toBe('REVEAL');
  });

  it('«إيقاف مؤقت» يوقف احتساب الإجابات ويستأنف بعدها', () => {
    const { engine, clock } = startWith(4);
    engine.pause();
    engine.enqueueChat(chat('u0', '1', clock.now() + 100));
    engine.drainChat();
    expect(engine.answered).toBe(0);
    engine.resume();
    engine.enqueueChat(chat('u0', '1', clock.now() + 200));
    engine.drainChat();
    expect(engine.answered).toBe(1);
  });

  it('«اطرد لاعب» يزيله فعلاً', () => {
    const { engine } = startWith(4);
    expect(engine.removePlayer('u1')).toBe(true);
    expect(engine.allPlayers().find((p) => p.userId === 'u1')).toBeUndefined();
  });

  it('انقطاع الشات ينبّه الستريمر ولا يوقف اللعبة', () => {
    const clock = new FakeClock();
    const spy = vi.fn();
    const engine = new VolcanicLandsEngine(makeBank(new MemoryStorage()), { onChatDisconnect: spy }, undefined, clock);
    engine.openLobby();
    engine.notifyChatDisconnect();
    expect(spy).toHaveBeenCalledOnce();
    expect(engine.phase).toBe('LOBBY');
  });

  it('لا يبقى أي مؤقّت بعد dispose', () => {
    const { engine, clock } = startWith(4);
    engine.dispose();
    const before = engine.phase;
    clock.runUntil(() => false, 200);
    expect(engine.phase).toBe(before);
  });

  it('تحذير اللافا القادمة يسبق ارتفاعها فعلاً', () => {
    const { engine, clock } = startWith(4);
    const predicted = engine.nextLavaRise();
    const before = engine.lava;
    clock.runUntil(() => engine.lava !== before);
    expect(engine.lava - before).toBe(predicted);
  });
});
