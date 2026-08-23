// أنواع لعبة «الأراضي البركانية» — مصدر الحقيقة الوحيد لكل شكل بيانات.

/** فئة السؤال كما هي في data/questions.ar.json — لا تُعدَّل. */
export type QuestionCategory = 'math' | 'general';

/** مستوى صعوبة السؤال كما هو في الملف: 1 سهل، 2 متوسط، 3 صعب. */
export type QuestionDifficulty = 1 | 2 | 3;

/** سؤال خام كما يُقرأ من الملف — بنفس الحقول تماماً. */
export interface RawQuestion {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly subcategory: string;
  readonly difficulty: QuestionDifficulty;
  readonly text: string;
  readonly options: readonly string[];
  /** فهرس الإجابة الصحيحة داخل options الأصلية (0..3). */
  readonly correctIndex: number;
  readonly answer: string;
}

/** ملف بنك الأسئلة بالكامل. */
export interface QuestionBankFile {
  readonly name: string;
  readonly version: string;
  readonly language: string;
  readonly total: number;
  readonly questions: readonly RawQuestion[];
}

/**
 * سؤال بعد خلط مواضع الخيارات للعرض. الملف الأصلي لا يُمسّ إطلاقاً —
 * الخلط يحدث على نسخة، و`correctIndex` هنا هو الفهرس بعد الخلط.
 */
export interface PresentedQuestion {
  readonly id: string;
  readonly category: QuestionCategory;
  readonly subcategory: string;
  readonly difficulty: QuestionDifficulty;
  readonly text: string;
  /** الخيارات بترتيب العرض (مخلوطة). */
  readonly options: readonly string[];
  /** فهرس الإجابة الصحيحة بعد الخلط (0..3). رقم الشات = correctIndex + 1. */
  readonly correctIndex: number;
  readonly answer: string;
}

/** حالات آلة الحالة — §4. */
export type GamePhase =
  | 'IDLE'
  | 'LOBBY'
  | 'COUNTDOWN'
  | 'ROUND_INTRO'
  | 'QUESTION'
  | 'REVEAL'
  | 'BUILD'
  | 'LAVA_RISE'
  | 'BURN'
  | 'GAME_OVER';

/** رقم الخيار الذي يكتبه المشاهد في الشات (1..4). */
export type AnswerChoice = 1 | 2 | 3 | 4;

/** لاعب داخل المباراة. */
export interface Player {
  readonly userId: string;
  nickname: string;
  avatarUrl: string;
  /** ارتفاع البرج بالبلوكات — يبدأ من startHeight. */
  height: number;
  points: number;
  alive: boolean;
  /** رقم الجولة التي احترق فيها (null إذا ما زال حياً). */
  burnedAtRound: number | null;
  /** رقم الجولة التي انضم فيها. */
  joinedAtRound: number;
  // ---- حالة الجولة الحالية (تُصفَّر كل جولة) ----
  answeredThisRound: boolean;
  /** ثوانٍ من لحظة عرض السؤال حتى وصول أول إجابة. */
  answerTime: number | null;
  choice: AnswerChoice | null;
  /** مجموع أزمنة الإجابة الصحيحة — لفض التعادل. */
  totalAnswerTime: number;
  correctAnswers: number;
}

/** حدث شات موحَّد كما يصل من جسر البث (نفس شكل extractUser في الموقع). */
export interface ChatEvent {
  readonly userId: string;
  readonly nickname: string;
  readonly avatarUrl: string;
  readonly comment: string;
  /** ملّي ثانية — وقت وصول الرسالة. */
  readonly timestamp: number;
  /** تأخير الشات المعروف بالملّي ثانية إن كان متوفراً في الحدث. */
  readonly chatLatencyMs?: number;
}

/** طبقة زمنية للنقاط — §5. */
export interface ScoreTier {
  readonly maxTime: number;
  readonly points: number;
  readonly blocks: number;
  readonly label: string;
}

/** نتيجة معالجة رسالة شات واحدة. */
export type ChatOutcome =
  | { readonly kind: 'ignored'; readonly reason: string }
  | { readonly kind: 'joined'; readonly player: Player }
  | { readonly kind: 'answered'; readonly player: Player; readonly choice: AnswerChoice };

/** صف واحد في لوحة الترتيب. */
export interface LeaderboardRow {
  readonly userId: string;
  readonly nickname: string;
  readonly avatarUrl: string;
  readonly points: number;
  readonly height: number;
  readonly alive: boolean;
  readonly rank: number;
}
