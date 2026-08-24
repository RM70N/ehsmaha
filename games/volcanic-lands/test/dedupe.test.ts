// اختبار منطق منع تكرار الأسئلة عبر جلسات متعددة الخروج/الدخول — §9 و§13.

import { describe, expect, it } from 'vitest';
import { QuestionBank } from '../src/question-bank.js';
import { MemoryStorage } from '../src/storage.js';
import { seededRandom } from '../src/random.js';
import { difficultyForRound } from '../src/config.js';
import { BANK, makeBank } from './helpers.js';

/** بنك جديد على نفس التخزين ونفس الستريمر — يحاكي إعادة تحميل الصفحة. */
function reopen(storage: MemoryStorage, seedBase: number): QuestionBank {
  let n = seedBase;
  return new QuestionBank(BANK.questions, storage, 'streamer-1', () => seededRandom(n++));
}

describe('منع التكرار داخل الجلسة الواحدة', () => {
  it('لا يكرر أي سؤال عبر 60 جولة متتالية', () => {
    const bank = makeBank();
    const seen = new Set<string>();
    for (let round = 1; round <= 60; round++) {
      const q = bank.next(round);
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
    }
    expect(seen.size).toBe(60);
    expect(bank.usedCount).toBe(60);
  });

  it('يُعلّم السؤال مستخدَماً بمجرد العرض لا بعد الإجابة', () => {
    const bank = makeBank();
    expect(bank.usedCount).toBe(0);
    const q = bank.next(1);
    // لم تُسجَّل أي إجابة، ومع ذلك السؤال محسوب.
    expect(bank.usedCount).toBe(1);
    expect(bank.usedIds()).toContain(q.id);
  });

  it('يستأنف نفس الجلسة بعد إعادة تحميل الصفحة بلا تصفير', () => {
    const storage = new MemoryStorage();
    const first = reopen(storage, 100);
    const sessionId = first.sessionId;
    const seen = new Set<string>();
    for (let r = 1; r <= 10; r++) seen.add(first.next(r).id);

    // إعادة تحميل: كائن جديد تماماً على نفس التخزين.
    const second = reopen(storage, 500);
    expect(second.sessionId).toBe(sessionId);
    expect(second.usedCount).toBe(10);
    for (let r = 11; r <= 20; r++) {
      const q = second.next(r);
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
    }
    expect(seen.size).toBe(20);
  });
});

describe('12 جولة ثم إيقاف وبدء 5 مرات بلا «جلسة جديدة»', () => {
  it('لا يتكرر أي سؤال عبر كل هذه المرات مجتمعة', () => {
    const storage = new MemoryStorage();
    const seen = new Set<string>();
    let seedBase = 1000;

    for (let attempt = 0; attempt < 6; attempt++) {
      // كل «إيقاف ثم بدء» = كائن بنك جديد على نفس التخزين ونفس الستريمر،
      // ببذرة عشوائية مختلفة تماماً — بالضبط ما يحدث بعد إعادة التحميل.
      const bank = reopen(storage, seedBase);
      seedBase += 777;
      for (let round = 1; round <= 12; round++) {
        const q = bank.next(round);
        expect(seen.has(q.id), `تكرر السؤال ${q.id} في المحاولة ${attempt + 1}`).toBe(false);
        seen.add(q.id);
      }
    }

    expect(seen.size).toBe(6 * 12);
    expect(reopen(storage, 1).usedCount).toBe(72);
  });
});

describe('زر «جلسة جديدة»', () => {
  it('هو الوحيد الذي يصفّر منع التكرار', () => {
    const storage = new MemoryStorage();
    const bank = reopen(storage, 42);
    const oldSession = bank.sessionId;
    for (let r = 1; r <= 15; r++) bank.next(r);
    expect(bank.usedCount).toBe(15);

    const newSession = bank.startNewSession();
    expect(newSession).not.toBe(oldSession);
    expect(bank.usedCount).toBe(0);

    // التصفير محفوظ فعلاً — إعادة التحميل بعده لا تُرجع القديم.
    const after = reopen(storage, 99);
    expect(after.usedCount).toBe(0);
    expect(after.sessionId).toBe(newSession);
  });
});

describe('الاختيار عشوائي لا بترتيب الملف', () => {
  it('جلستان مختلفتان تعطيان تسلسلين مختلفين', () => {
    const a = makeBank(new MemoryStorage(), 's-a', 11);
    const b = makeBank(new MemoryStorage(), 's-b', 999);
    const seqA = Array.from({ length: 12 }, (_, i) => a.next(i + 1).id);
    const seqB = Array.from({ length: 12 }, (_, i) => b.next(i + 1).id);
    expect(seqA).not.toEqual(seqB);
  });

  it('لا يبدأ من أول سؤال في الملف كل مرة', () => {
    const firstIds = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      firstIds.add(makeBank(new MemoryStorage(), 's' + seed, seed).next(1).id);
    }
    expect(firstIds.size).toBeGreaterThan(5);
  });
});

describe('الصعوبة والفئات', () => {
  it('يحترم صعوبة الجولة ما دامت متوفرة', () => {
    const bank = makeBank();
    for (let round = 1; round <= 20; round++) {
      const q = bank.next(round);
      expect(q.difficulty).toBe(difficultyForRound(round));
    }
  });

  it('يسحب من الصعوبة الأقرب بدل التكرار عند نفاد صعوبة', () => {
    const bank = makeBank(new MemoryStorage(), 'drain', 7);
    // صعوبة 3 فيها 45 سؤالاً فقط؛ نطلب 60 جولة كلها من الجولة 5+.
    const seen = new Set<string>();
    const difficulties: number[] = [];
    for (let i = 0; i < 60; i++) {
      const q = bank.next(5); // كل الجولات تطلب صعوبة 3
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
      difficulties.push(q.difficulty);
    }
    expect(difficulties.filter((d) => d === 3)).toHaveLength(45);
    // الباقي جاء من الصعوبة الأقرب (2) لا من تكرار.
    expect(difficulties.filter((d) => d === 2).length).toBeGreaterThan(0);
    expect(seen.size).toBe(60);
  });

  it('لا تتكرر فئة واحدة أكثر من جولتين متتاليتين', () => {
    const bank = makeBank(new MemoryStorage(), 'balance', 3);
    let streak = 1;
    let previous: string | null = null;
    let maxStreak = 1;
    for (let round = 1; round <= 40; round++) {
      const q = bank.next(round);
      streak = q.category === previous ? streak + 1 : 1;
      previous = q.category;
      maxStreak = Math.max(maxStreak, streak);
    }
    expect(maxStreak).toBeLessThanOrEqual(2);
  });
});

describe('إعادة التدوير بعد استهلاك الـ300 كاملة', () => {
  it('لا تحدث قبل استهلاك الملف بالكامل، ثم تبدأ بترتيب عشوائي جديد', () => {
    const bank = makeBank(new MemoryStorage(), 'recycle', 4);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const q = bank.next((i % 12) + 1);
      expect(seen.has(q.id)).toBe(false);
      seen.add(q.id);
    }
    expect(seen.size).toBe(300);
    expect(bank.recycleCount).toBe(0);

    // السؤال 301 هو أول إعادة تدوير مسموحة.
    bank.next(1);
    expect(bank.recycleCount).toBe(1);
    expect(bank.usedCount).toBe(1);
  });
});

describe('صمود التخزين', () => {
  it('تخزين تالف لا يُسقط اللعبة بل يبدأ جلسة نظيفة', () => {
    const storage = new MemoryStorage();
    storage.setItem('volcanicLands:session:streamer-1', '{ نص تالف ');
    const bank = reopen(storage, 1);
    expect(bank.usedCount).toBe(0);
    expect(() => bank.next(1)).not.toThrow();
  });

  it('يتجاهل المعرّفات التي لم تعد موجودة في الملف', () => {
    const storage = new MemoryStorage();
    storage.setItem('volcanicLands:session:streamer-1', JSON.stringify({
      sessionId: 'old', usedQuestionIds: ['gk_001', 'لا-وجود-له'], recentCategories: [], recycleCount: 0,
    }));
    const bank = reopen(storage, 1);
    expect(bank.usedCount).toBe(1);
    expect(bank.usedIds()).toEqual(['gk_001']);
  });
});
