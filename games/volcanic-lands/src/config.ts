// ملف الإعدادات الوحيد — §5. لا رقم واحد من أرقام اللعبة مكتوب خارج هذا الملف.

import type { AnswerChoice, ScoreTier } from './types.js';

/** معرّف مستوى الصعوبة الذي يضبطه الستريمر. */
export type DifficultyMode = 'easy' | 'normal' | 'hell';

export interface DifficultyPreset {
  readonly id: DifficultyMode;
  readonly label: string;
  /**
   * ارتفاع اللافا (بالبلوكات) في نهاية الجولة r — تصاعد خطّي وليس مضاعفاً.
   * التصاعد المضاعف (2،4،6،8) يجعل اللافا تتجاوز أسرع لاعب في الجولة الثالثة
   * فيحترق الجميع دفعة واحدة؛ الصيغة الخطية تعطي 5-8 جولات ≈ 4 دقائق.
   */
  readonly lavaRise: (round: number) => number;
}

export const DIFFICULTY_PRESETS: Readonly<Record<DifficultyMode, DifficultyPreset>> = {
  easy:   { id: 'easy',   label: 'سهل',  lavaRise: (r: number): number => Math.floor(r / 2) + 1 },
  normal: { id: 'normal', label: 'عادي', lavaRise: (r: number): number => r + 1 },
  hell:   { id: 'hell',   label: 'جحيم', lavaRise: (r: number): number => r + 2 },
};

export const VOLCANIC_LANDS_CONFIG = {
  roundSeconds: 20,
  startHeight: 5,          // بلوكات هدية لكل لاعب
  maxRounds: 12,

  // العتبات بالثواني من لحظة ظهور السؤال
  tiers: [
    { maxTime: 10,       points: 10, blocks: 4, label: 'سريع'  },
    { maxTime: 15,       points: 8,  blocks: 3, label: 'جيد'   },
    { maxTime: Infinity, points: 5,  blocks: 2, label: 'متأخر' },
  ] as readonly ScoreTier[],
  wrongAnswer: { points: 0, blocks: 0 } as const,

  /** الافتراضي هو المتوازن — §5. */
  difficulty: 'normal' as DifficultyMode,

  joinKeyword: 'بركان',      // يضبطه الستريمر
  answerAliases: {           // ما يُقبل كإجابة
    1: ['1', '١', 'a', 'A', 'أ', 'ا'],
    2: ['2', '٢', 'b', 'B', 'ب'],
    3: ['3', '٣', 'c', 'C', 'ج'],
    4: ['4', '٤', 'd', 'D', 'د'],
  } as Readonly<Record<AnswerChoice, readonly string[]>>,
  allowLateJoin: true,       // الانضمام أثناء اللعب: يبدأ بارتفاع اللافا الحالي + 2
  lateJoinLavaMargin: 2,
  maxPlayers: 60,

  // ---- مدد الحالات بالملّي ثانية — §4 ----
  timings: {
    COUNTDOWN: 3000,
    ROUND_INTRO: 2000,
    REVEAL: 3000,
    BUILD: 2500,
    LAVA_RISE: 3000,
    BURN: 2000,
  } as const,

  // ---- حماية الشات — §6 ----
  chat: {
    /** أقصى عدد رسائل من نفس المستخدم في الثانية قبل التجاهل. */
    floodMaxPerSecond: 5,
    floodWindowMs: 1000,
    /** أقصى طول اسم يُعرض قبل القص بـ«…» — §7. */
    nicknameMaxChars: 12,
  } as const,

  // ---- ربط الصعوبة بالجولات — §9 ----
  /** جولات 1-2 صعوبة 1، 3-4 صعوبة 2، 5+ صعوبة 3. */
  difficultyByRound: [
    { untilRound: 2, difficulty: 1 },
    { untilRound: 4, difficulty: 2 },
    { untilRound: Infinity, difficulty: 3 },
  ] as readonly { readonly untilRound: number; readonly difficulty: 1 | 2 | 3 }[],
  /** لا فئة (رياضيات/عام) تتكرر أكثر من هذا العدد من الجولات متتالية. */
  maxSameCategoryStreak: 2,

  // ---- مرحلة الحسم بعد maxRounds — §12 ----
  suddenDeath: {
    /** اللافا ترتفع مضاعفة كل جولة حتى يبقى واحد. */
    multiplier: 2,
  } as const,

  // ---- الأداء — §12 ----
  perf: {
    /** يُفعَّل وضع 2D الاحتياطي إذا نزلت الإطارات تحت هذا الحد هذه المدة. */
    fallbackFpsThreshold: 30,
    fallbackFpsDurationMs: 5000,
    /** تتابع بين اللاعبين عند بناء البلوكات — §8. */
    buildStaggerMs: 60,
  } as const,
} as const;

export type VolcanicLandsConfig = typeof VOLCANIC_LANDS_CONFIG;

/** الإعدادات التي يضبطها الستريمر من لوحة التحكم — §11. */
export interface StreamerSettings {
  roundSeconds: number;
  joinKeyword: string;
  difficulty: DifficultyMode;
  maxPlayers: number;
  allowLateJoin: boolean;
}

export function defaultStreamerSettings(): StreamerSettings {
  return {
    roundSeconds: VOLCANIC_LANDS_CONFIG.roundSeconds,
    joinKeyword: VOLCANIC_LANDS_CONFIG.joinKeyword,
    difficulty: VOLCANIC_LANDS_CONFIG.difficulty,
    maxPlayers: VOLCANIC_LANDS_CONFIG.maxPlayers,
    allowLateJoin: VOLCANIC_LANDS_CONFIG.allowLateJoin,
  };
}

/** صعوبة السؤال المطلوبة في الجولة r — §9. */
export function difficultyForRound(round: number): 1 | 2 | 3 {
  for (const band of VOLCANIC_LANDS_CONFIG.difficultyByRound) {
    if (round <= band.untilRound) return band.difficulty;
  }
  return 3;
}

/**
 * ارتفاع اللافا في نهاية الجولة r لمستوى صعوبة معيّن.
 * بعد maxRounds تدخل مرحلة الحسم فيتضاعف الارتفاع كل جولة إضافية — §12.
 */
export function lavaRiseForRound(round: number, mode: DifficultyMode): number {
  const base = DIFFICULTY_PRESETS[mode].lavaRise(round);
  if (round <= VOLCANIC_LANDS_CONFIG.maxRounds) return base;
  const extra = round - VOLCANIC_LANDS_CONFIG.maxRounds;
  return base * Math.pow(VOLCANIC_LANDS_CONFIG.suddenDeath.multiplier, extra);
}
