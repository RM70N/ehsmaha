// أدوات الاختبار: ساعة وهمية تشغّل المؤقّتات فوراً، ولاعبون آليون.

import type { Clock } from '../src/state-machine.js';
import type { ChatEvent } from '../src/types.js';
import { VolcanicLandsEngine } from '../src/engine.js';
import { QuestionBank } from '../src/question-bank.js';
import { MemoryStorage, type KeyValueStorage } from '../src/storage.js';
import { type RandomFn, seededRandom } from '../src/random.js';
import questionBankFile from '../data/questions.ar.json' with { type: 'json' };
import type { QuestionBankFile } from '../src/types.js';

export const BANK = questionBankFile as unknown as QuestionBankFile;

interface Timer { id: number; at: number; fn: () => void }

/** ساعة افتراضية — تقدّم الزمن يدوياً بدل الانتظار الحقيقي. */
export class FakeClock implements Clock {
  private t = 0;
  private nextId = 1;
  private timers: Timer[] = [];

  now(): number { return this.t; }

  setTimeout(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.timers.push({ id, at: this.t + ms, fn });
    return id;
  }

  clearTimeout(handle: number): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  /** ينفّذ المؤقّت التالي زمنياً. يُرجع false إذا لم يبقَ شيء. */
  step(): boolean {
    if (this.timers.length === 0) return false;
    this.timers.sort((a, b) => (a.at - b.at) || (a.id - b.id));
    const next = this.timers.shift() as Timer;
    this.t = Math.max(this.t, next.at);
    next.fn();
    return true;
  }

  /** يشغّل المؤقّتات حتى تنتهي أو يتحقق شرط التوقف. */
  runUntil(done: () => boolean, maxSteps = 100000): void {
    let steps = 0;
    while (!done() && steps < maxSteps) {
      if (!this.step()) break;
      steps++;
    }
  }
}

export function makeBank(
  storage: KeyValueStorage = new MemoryStorage(),
  streamerId = 'streamer-test',
  seed = 12345,
): QuestionBank {
  let n = seed;
  const factory = (): RandomFn => seededRandom(n++);
  return new QuestionBank(BANK.questions, storage, streamerId, factory);
}

export function chat(userId: string, comment: string, timestamp: number): ChatEvent {
  return { userId, nickname: 'لاعب ' + userId, avatarUrl: '', comment, timestamp };
}

export interface BotProfile {
  /** احتمال أن يجيب اللاعب أصلاً. */
  readonly answerRate: number;
  /** احتمال أن تكون إجابته صحيحة إذا أجاب. */
  readonly accuracy: number;
  /** متوسط زمن الإجابة بالثواني. */
  readonly meanSeconds: number;
}

export interface MatchStats {
  readonly rounds: number;
  readonly massDeath: boolean;
  readonly winnerId: string | null;
  readonly survivors: number;
}

/**
 * مباراة كاملة بلا واجهة: لاعبون آليون ينضمون ثم يجيبون بأزمنة عشوائية،
 * والساعة الوهمية تشغّل كل مراحل آلة الحالة فوراً.
 */
export function simulateMatch(
  playerCount: number,
  seed: number,
  profile: BotProfile = { answerRate: 0.85, accuracy: 0.68, meanSeconds: 9 },
): MatchStats {
  const rand = seededRandom(seed);
  const clock = new FakeClock();
  let bankSeed = seed * 7919;
  const bank = new QuestionBank(
    BANK.questions,
    new MemoryStorage(),
    'sim-' + seed,
    () => seededRandom(bankSeed++),
  );

  let maxRoundReached = 0;
  let burnedPerRound = new Map<number, number>();

  const engine = new VolcanicLandsEngine(bank, {
    onQuestion: (question, round) => {
      maxRoundReached = Math.max(maxRoundReached, round);
      const startAt = clock.now();
      for (const player of engine.alivePlayers()) {
        if (rand() > profile.answerRate) continue;
        // زمن الإجابة: توزيع بسيط حول المتوسط، مقصوص على مدة الجولة.
        const jitter = (rand() + rand() + rand()) / 3; // تجميع نحو المنتصف
        const seconds = Math.min(
          engine.getSettings().roundSeconds - 0.5,
          Math.max(0.5, profile.meanSeconds * (0.35 + 1.3 * jitter)),
        );
        const correct = rand() < profile.accuracy;
        const choice = correct
          ? question.correctIndex + 1
          : ((question.correctIndex + 1 + Math.floor(rand() * 3)) % 4) + 1;
        engine.enqueueChat({
          userId: player.userId,
          nickname: player.nickname,
          avatarUrl: '',
          comment: String(choice),
          timestamp: startAt + seconds * 1000,
        });
      }
      engine.drainChat();
    },
    onBurn: (burned) => {
      if (burned.length > 0) {
        burnedPerRound.set(engine.currentRound, burned.length);
      }
    },
  }, undefined, clock);

  engine.openLobby();
  for (let i = 0; i < playerCount; i++) {
    engine.enqueueChat(chat('u' + i, 'بركان', clock.now() + i));
  }
  engine.drainChat();
  engine.start();
  clock.runUntil(() => engine.phase === 'GAME_OVER');

  const total = playerCount;
  // «وفاة جماعية»: أكثر من نصف اللاعبين احترقوا في جولة واحدة.
  let massDeath = false;
  for (const count of burnedPerRound.values()) {
    if (count > total / 2) { massDeath = true; break; }
  }

  const winner = engine.winner();
  const stats: MatchStats = {
    rounds: maxRoundReached,
    massDeath,
    winnerId: winner ? winner.userId : null,
    survivors: engine.alivePlayers().length,
  };
  engine.dispose();
  return stats;
}
