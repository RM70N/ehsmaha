// بنك الأسئلة ومنطق منع التكرار — §9.
//
// الضمانة الأساسية: طوال نفس الـ sessionId، لا يُعرض أي سؤال مرتين — حتى لو
// أوقف الستريمر الجولة وخرج ورجع، أو أُعيد تحميل الصفحة. المعرّف يُخزَّن
// مرتبطاً بحساب الستريمر لا بجولة اللعب الواحدة، و usedQuestionIds تُحدَّث
// بمجرد عرض السؤال (لا بعد الإجابة) وتُحفظ فوراً.

import type { PresentedQuestion, QuestionCategory, QuestionDifficulty, RawQuestion } from './types.js';
import type { KeyValueStorage } from './storage.js';
import { type RandomFn, shuffle, systemRandom } from './random.js';
import { VOLCANIC_LANDS_CONFIG, difficultyForRound } from './config.js';

const STORAGE_PREFIX = 'volcanicLands';

interface PersistedSession {
  sessionId: string;
  usedQuestionIds: string[];
  /** فئات آخر الأسئلة المعروضة — لحفظ توازن الفئتين عبر إعادة التحميل. */
  recentCategories: QuestionCategory[];
  /** عدد مرات إعادة التدوير بعد استهلاك الـ 300 كاملة. */
  recycleCount: number;
}

function newSessionId(rand: RandomFn): string {
  const stamp = Date.now().toString(36);
  const noise = Math.floor(rand() * 0xffffff).toString(36);
  return `${stamp}-${noise}`;
}

/** ترتيب الصعوبات الأقرب للصعوبة المطلوبة — لا تكرار عند نفاد صعوبة (§9). */
function difficultiesByProximity(target: QuestionDifficulty): QuestionDifficulty[] {
  const all: QuestionDifficulty[] = [1, 2, 3];
  return all
    .filter((d) => d !== target)
    .sort((a, b) => {
      const da = Math.abs(a - target);
      const db = Math.abs(b - target);
      if (da !== db) return da - db;
      return a - b; // عند التساوي: الأسهل أولاً
    });
}

export class QuestionBank {
  private readonly all: readonly RawQuestion[];
  private readonly byId: ReadonlyMap<string, RawQuestion>;
  private readonly storage: KeyValueStorage;
  private readonly streamerId: string;
  /** مصنع مولّدات — يُستدعى ليعطي مولّداً *جديداً* عند كل اختيار (§9). */
  private readonly randFactory: () => RandomFn;

  private session: PersistedSession;

  constructor(
    questions: readonly RawQuestion[],
    storage: KeyValueStorage,
    streamerId: string,
    randFactory: () => RandomFn = () => systemRandom,
  ) {
    this.all = questions;
    this.byId = new Map(questions.map((q) => [q.id, q]));
    this.storage = storage;
    this.streamerId = streamerId;
    this.randFactory = randFactory;
    this.session = this.load();
  }

  private get storageKey(): string {
    return `${STORAGE_PREFIX}:session:${this.streamerId}`;
  }

  /**
   * يستأنف الجلسة المخزّنة إن وُجدت، وإلا ينشئ واحدة جديدة. الاستئناف هو
   * السلوك الافتراضي عند فتح لوحة التحكم — زر «جلسة جديدة» وحده يصفّر.
   */
  private load(): PersistedSession {
    const raw = this.storage.getItem(this.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Partial<PersistedSession>;
        if (typeof parsed.sessionId === 'string' && Array.isArray(parsed.usedQuestionIds)) {
          return {
            sessionId: parsed.sessionId,
            // تجاهل أي معرّف لم يعد موجوداً في الملف (تغيّر بنك الأسئلة).
            usedQuestionIds: parsed.usedQuestionIds.filter((id) => this.byId.has(id)),
            recentCategories: Array.isArray(parsed.recentCategories) ? parsed.recentCategories : [],
            recycleCount: typeof parsed.recycleCount === 'number' ? parsed.recycleCount : 0,
          };
        }
      } catch {
        // تخزين تالف — نبدأ جلسة نظيفة بدل الانهيار.
      }
    }
    return this.freshSession();
  }

  private freshSession(): PersistedSession {
    return {
      sessionId: newSessionId(this.randFactory()),
      usedQuestionIds: [],
      recentCategories: [],
      recycleCount: 0,
    };
  }

  /** يُحفظ فوراً بعد كل تغيير حتى يصمد أمام إعادة التحميل وانقطاع الاتصال. */
  private persist(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.session));
    } catch {
      // امتلاء التخزين لا يوقف اللعبة — المنع يستمر في الذاكرة لهذه الجلسة.
    }
  }

  get sessionId(): string {
    return this.session.sessionId;
  }

  get usedCount(): number {
    return this.session.usedQuestionIds.length;
  }

  get totalCount(): number {
    return this.all.length;
  }

  get recycleCount(): number {
    return this.session.recycleCount;
  }

  usedIds(): readonly string[] {
    return this.session.usedQuestionIds;
  }

  /** زر «بدء بث/جلسة جديدة» — الوحيد الذي يصفّر منع التكرار (§9). */
  startNewSession(): string {
    this.session = this.freshSession();
    this.persist();
    return this.session.sessionId;
  }

  /** هل تجاوزت الفئة الحد المسموح من الجولات المتتالية؟ */
  private categoryIsOverused(category: QuestionCategory): boolean {
    const limit = VOLCANIC_LANDS_CONFIG.maxSameCategoryStreak;
    const recent = this.session.recentCategories;
    if (recent.length < limit) return false;
    return recent.slice(-limit).every((c) => c === category);
  }

  private unusedAtDifficulty(difficulty: QuestionDifficulty): RawQuestion[] {
    const used = new Set(this.session.usedQuestionIds);
    return this.all.filter((q) => q.difficulty === difficulty && !used.has(q.id));
  }

  /**
   * يبني مجموعة الأسئلة المؤهلة للجولة: الصعوبة المطلوبة أولاً، ثم الأقرب
   * فالأقرب عند النفاد — بدل تكرار سؤال سبق عرضه.
   */
  private eligiblePool(round: number): RawQuestion[] {
    const target = difficultyForRound(round);
    const ladder: QuestionDifficulty[] = [target, ...difficultiesByProximity(target)];
    for (const difficulty of ladder) {
      const pool = this.unusedAtDifficulty(difficulty);
      if (pool.length === 0) continue;
      // توازن الفئتين: إن كانت فئة قد استُهلكت في آخر جولتين، نُفضّل الأخرى —
      // ما لم يكن ذلك يُفرغ المجموعة، فحينها التوازن يتنازل لمنع التكرار.
      const balanced = pool.filter((q) => !this.categoryIsOverused(q.category));
      return balanced.length > 0 ? balanced : pool;
    }
    return [];
  }

  /**
   * السؤال التالي للجولة r. يُعلَّم مستخدَماً ويُحفظ *بمجرد العرض*، لا بعد
   * الإجابة — فحتى لو أُوقفت الجولة في منتصف السؤال لن يعود.
   */
  next(round: number): PresentedQuestion {
    let pool = this.eligiblePool(round);
    if (pool.length === 0) {
      // استُهلكت الـ300 كاملة داخل نفس الجلسة — إعادة تدوير بترتيب عشوائي جديد.
      this.session.usedQuestionIds = [];
      this.session.recentCategories = [];
      this.session.recycleCount += 1;
      this.persist();
      pool = this.eligiblePool(round);
    }

    // مولّد عشوائي جديد في كل اختيار — لا ترتيب ملف ولا تسلسل ثابت.
    const picked = shuffle(pool, this.randFactory())[0] as RawQuestion;

    this.session.usedQuestionIds.push(picked.id);
    this.session.recentCategories.push(picked.category);
    const keep = VOLCANIC_LANDS_CONFIG.maxSameCategoryStreak + 1;
    if (this.session.recentCategories.length > keep) {
      this.session.recentCategories = this.session.recentCategories.slice(-keep);
    }
    this.persist();

    return presentQuestion(picked, this.randFactory());
  }
}

/**
 * يخلط مواضع الخيارات الأربعة للعرض ويحدّث correctIndex تبعاً لذلك — الملف
 * الأصلي في التخزين لا يُمسّ إطلاقاً (§9).
 */
export function presentQuestion(question: RawQuestion, rand: RandomFn): PresentedQuestion {
  const indexed = question.options.map((text, index) => ({ text, index }));
  const shuffled = shuffle(indexed, rand);
  const correctIndex = shuffled.findIndex((o) => o.index === question.correctIndex);
  return {
    id: question.id,
    category: question.category,
    subcategory: question.subcategory,
    difficulty: question.difficulty,
    text: question.text,
    options: shuffled.map((o) => o.text),
    correctIndex,
    answer: question.answer,
  };
}
