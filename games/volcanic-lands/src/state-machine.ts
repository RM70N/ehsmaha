// آلة حالة صريحة — §4. لا `if` متناثرة، ولا setTimeout يتيمة:
// كل مؤقّت مربوط بالحالة التي أنشأته ويُلغى تلقائياً عند أي انتقال.

import type { GamePhase } from './types.js';

/** الانتقالات المسموحة فقط — أي انتقال خارجها يُرفض. */
const ALLOWED: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  IDLE:        ['LOBBY'],
  LOBBY:       ['COUNTDOWN', 'IDLE'],
  COUNTDOWN:   ['ROUND_INTRO', 'LOBBY', 'IDLE'],
  ROUND_INTRO: ['QUESTION', 'LOBBY', 'IDLE'],
  QUESTION:    ['REVEAL', 'LOBBY', 'IDLE'],
  REVEAL:      ['BUILD', 'LOBBY', 'IDLE'],
  BUILD:       ['LAVA_RISE', 'LOBBY', 'IDLE'],
  LAVA_RISE:   ['BURN', 'LOBBY', 'IDLE'],
  // بعد الحرق: جولة جديدة (ROUND_INTRO) أو نهاية المباراة.
  BURN:        ['ROUND_INTRO', 'GAME_OVER', 'LOBBY', 'IDLE'],
  GAME_OVER:   ['LOBBY', 'IDLE'],
};

export type PhaseListener = (to: GamePhase, from: GamePhase) => void;

/** ساعة قابلة للحقن — تجعل المباراة كاملةً قابلة للاختبار بلا انتظار حقيقي. */
export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): number;
  clearTimeout(handle: number): void;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
};

export class StateMachine {
  private phase: GamePhase = 'IDLE';
  private readonly listeners: PhaseListener[] = [];
  private readonly clock: Clock;
  /** المؤقّتات الحيّة للحالة الحالية — تُلغى كلها عند أي انتقال. */
  private timers: number[] = [];
  /** يمنع أي تداخل بين الجولات: انتقال أثناء انتقال يُرفض. */
  private transitioning = false;
  private enteredAt: number;

  constructor(clock: Clock = systemClock) {
    this.clock = clock;
    this.enteredAt = clock.now();
  }

  get current(): GamePhase {
    return this.phase;
  }

  /** ملّي ثانية منذ دخول الحالة الحالية. */
  get elapsed(): number {
    return this.clock.now() - this.enteredAt;
  }

  onChange(listener: PhaseListener): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i > -1) this.listeners.splice(i, 1);
    };
  }

  canGo(to: GamePhase): boolean {
    return ALLOWED[this.phase].includes(to);
  }

  /**
   * ينتقل للحالة المطلوبة. يُرجع false إذا كان الانتقال غير مسموح أو كان
   * انتقال آخر جارياً — لا استثناءات، فاللعبة يجب ألا تتوقف أثناء بث حي.
   */
  go(to: GamePhase): boolean {
    if (this.transitioning) return false;
    if (!this.canGo(to)) return false;

    this.transitioning = true;
    const from = this.phase;
    this.clearTimers();
    this.phase = to;
    this.enteredAt = this.clock.now();
    this.transitioning = false;

    for (const listener of this.listeners.slice()) {
      listener(to, from);
    }
    return true;
  }

  /**
   * مؤقّت مملوك للحالة الحالية: يُلغى تلقائياً عند أي انتقال، ولا ينفّذ
   * إن كانت الحالة قد تغيّرت قبل موعده.
   */
  after(ms: number, fn: () => void): void {
    const phaseAtSchedule = this.phase;
    const handle = this.clock.setTimeout(() => {
      if (this.phase !== phaseAtSchedule) return;
      fn();
    }, ms);
    this.timers.push(handle);
  }

  private clearTimers(): void {
    for (const handle of this.timers) this.clock.clearTimeout(handle);
    this.timers = [];
  }

  /** تنظيف كامل عند مغادرة المكوّن — §13. */
  dispose(): void {
    this.clearTimers();
    this.listeners.length = 0;
  }
}
