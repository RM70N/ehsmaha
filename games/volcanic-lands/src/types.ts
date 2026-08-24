// أنواع لعبة «الأراضي البركانية» — مصدر الحقيقة الوحيد لكل شكل بيانات.

/**
 * فئة السؤال كما هي في data/questions.ar.json — نص عربي حر (ديني، جغرافيا،
 * رياضة، …). لا تُقيَّد بقائمة ثابتة حتى لا يكسر الكودُ الملفَّ إذا أُضيفت فئة.
 */
export type QuestionCategory = string;

/** مستوى الصعوبة كما هو مكتوب في الملف. */
export type QuestionDifficultyName = 'easy' | 'medium' | 'hard';

/** المستوى الرقمي الداخلي المستخدم في تصاعد الجولات: 1 سهل، 2 متوسط، 3 صعب. */
export type DifficultyLevel = 1 | 2 | 3;

/**
 * سؤال خام بنفس حقول الملف حرفياً (snake_case ومعرّف رقمي) — الملف هو مصدر
 * الحقيقة ولا يُعدَّل إطلاقاً؛ التطبيع يحدث في presentQuestion فقط.
 */
export interface RawQuestion {
  readonly id: number;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct_answer: string;
  /** فهرس الإجابة الصحيحة داخل options الأصلية (0-3). */
  readonly correct_index: number;
  readonly difficulty: QuestionDifficultyName;
  readonly category: QuestionCategory;
}

/** ملف بنك الأسئلة بالكامل. */
export interface QuestionBankFile {
  readonly total_questions: number;
  readonly questions: readonly RawQuestion[];
}

/**
 * سؤال بعد التطبيع وخلط مواضع الخيارات للعرض. الملف الأصلي لا يُمسّ إطلاقاً —
 * الخلط يحدث على نسخة، و`correctIndex` هنا هو الفهرس بعد الخلط.
 */
export interface PresentedQuestion {
  /** معرّف نصّي (من الرقم في الملف) — التخزين ومنع التكرار يعملان على نصوص. */
  readonly id: string;
  readonly category: QuestionCategory;
  readonly difficulty: DifficultyLevel;
  /** الصعوبة كما وردت في الملف — للعرض والتشخيص. */
  readonly difficultyName: QuestionDifficultyName;
  readonly text: string;
  /** الخيارات بترتيب العرض (مخلوطة). */
  readonly options: readonly string[];
  /** فهرس الإجابة الصحيحة بعد الخلط (0-3). رقم الشات = correctIndex + 1. */
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
  /** كم مرة أُنعش هذا اللاعب بهدية — يحدّه maxRevivesPerPlayer. */
  revivedCount: number;
}

/** حدث هدية تيك توك موحَّد كما يصل من جسر البث. */
export interface GiftEvent {
  readonly userId: string;
  readonly nickname: string;
  readonly avatarUrl: string;
  readonly giftName: string;
  /** إجمالي العملات = diamondCount × repeatCount. */
  readonly diamonds: number;
}

/** نتيجة محاولة إنعاش بهدية. */
export type ReviveOutcome =
  | { readonly kind: 'revived'; readonly player: Player }
  | { readonly kind: 'rejected'; readonly reason:
      'disabled' | 'not-playing' | 'still-alive' | 'too-few-diamonds' | 'limit-reached' | 'match-over' };

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
