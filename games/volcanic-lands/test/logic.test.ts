// اختبارات الوحدة — §13: الطبقات الزمنية، صيغة اللافا، شروط الخروج،
// تحليل رسائل الشات، ومنطق التعادل.

import { describe, expect, it } from 'vitest';
import { VOLCANIC_LANDS_CONFIG, difficultyForRound, lavaRiseForRound } from '../src/config.js';
import { matchAlias, matchesJoinKeyword, normalize, truncateNickname } from '../src/normalize.js';
import {
  averageAnswerTime, cumulativeLavaLevel, isDrowned, lateJoinHeight,
  rankPlayers, rewardFor, tierForAnswerTime,
} from '../src/scoring.js';
import type { Player } from '../src/types.js';
import { presentQuestion } from '../src/question-bank.js';
import { seededRandom } from '../src/random.js';
import { BANK } from './helpers.js';

function makePlayer(over: Partial<Player> & { userId: string }): Player {
  return {
    nickname: over.userId, avatarUrl: '', height: 5, points: 0, alive: true,
    burnedAtRound: null, joinedAtRound: 0, answeredThisRound: false,
    answerTime: null, choice: null, totalAnswerTime: 0, correctAnswers: 0, revivedCount: 0,
    ...over,
  };
}

describe('الطبقات الزمنية', () => {
  it('يمنح طبقة «سريع» حتى 10 ثوانٍ شاملةً', () => {
    expect(tierForAnswerTime(0).label).toBe('سريع');
    expect(tierForAnswerTime(9.99).label).toBe('سريع');
    expect(tierForAnswerTime(10).label).toBe('سريع');
    expect(tierForAnswerTime(10).blocks).toBe(4);
    expect(tierForAnswerTime(10).points).toBe(10);
  });

  it('يمنح «جيد» بين 10 و15، و«متأخر» بعدها', () => {
    expect(tierForAnswerTime(10.01).label).toBe('جيد');
    expect(tierForAnswerTime(15).label).toBe('جيد');
    expect(tierForAnswerTime(15).blocks).toBe(3);
    expect(tierForAnswerTime(15.01).label).toBe('متأخر');
    expect(tierForAnswerTime(19.9).blocks).toBe(2);
  });

  it('الإجابة الخاطئة لا تعطي نقاطاً ولا بلوكات', () => {
    const r = rewardFor(2, 0, 3);
    expect(r.correct).toBe(false);
    expect(r.points).toBe(0);
    expect(r.blocks).toBe(0);
  });

  it('عدم الإجابة إطلاقاً لا يعطي شيئاً', () => {
    expect(rewardFor(null, 1, null).blocks).toBe(0);
  });

  it('الإجابة الصحيحة تُطابق correctIndex + 1', () => {
    const r = rewardFor(3, 2, 4);
    expect(r.correct).toBe(true);
    expect(r.blocks).toBe(4);
  });
});

describe('صيغة اللافا', () => {
  it('تصاعد خطّي 2، 3، 4، 5، 6 في الوضع العادي', () => {
    expect([1, 2, 3, 4, 5].map((r) => lavaRiseForRound(r, 'normal'))).toEqual([2, 3, 4, 5, 6]);
  });

  it('ليست تصاعداً مضاعفاً (2، 4، 6، 8)', () => {
    expect(lavaRiseForRound(2, 'normal')).not.toBe(4);
    expect(lavaRiseForRound(3, 'normal')).not.toBe(6);
  });

  it('سهل أبطأ من عادي، وجحيم أسرع', () => {
    for (let r = 1; r <= 8; r++) {
      expect(lavaRiseForRound(r, 'easy')).toBeLessThanOrEqual(lavaRiseForRound(r, 'normal'));
      expect(lavaRiseForRound(r, 'hell')).toBeGreaterThan(lavaRiseForRound(r, 'normal'));
    }
  });

  it('المستوى التراكمي يساوي مجموع الارتفاعات', () => {
    expect(cumulativeLavaLevel(3, 'normal')).toBe(2 + 3 + 4);
    expect(cumulativeLavaLevel(5, 'normal')).toBe(20);
  });

  it('مرحلة الحسم بعد الجولة 12 تضاعف الارتفاع كل جولة', () => {
    const atCap = lavaRiseForRound(12, 'normal');
    expect(lavaRiseForRound(13, 'normal')).toBe((13 + 1) * 2);
    expect(lavaRiseForRound(14, 'normal')).toBe((14 + 1) * 4);
    expect(lavaRiseForRound(13, 'normal')).toBeGreaterThan(atCap);
  });

  it('أسرع لاعب ممكن لا ينجو للأبد — المباراة تنتهي حتماً', () => {
    const best = (r: number) => VOLCANIC_LANDS_CONFIG.startHeight + 4 * r;
    let died = 0;
    for (let r = 1; r <= 12; r++) {
      if (best(r) <= cumulativeLavaLevel(r, 'normal')) { died = r; break; }
    }
    expect(died).toBeGreaterThan(0);
    expect(died).toBeLessThanOrEqual(8);
  });
});

describe('شروط الخروج', () => {
  it('يحترق اللاعب عندما تصل اللافا لسطح برجه', () => {
    const p = makePlayer({ userId: 'a', height: 9 });
    expect(isDrowned(p, 8)).toBe(false);
    expect(isDrowned(p, 9)).toBe(true);
    expect(isDrowned(p, 10)).toBe(true);
  });

  it('اللاعب المتأخر يبدأ فوق اللافا بهامش ثابت', () => {
    expect(lateJoinHeight(14)).toBe(14 + VOLCANIC_LANDS_CONFIG.lateJoinLavaMargin);
    expect(isDrowned(makePlayer({ userId: 'a', height: lateJoinHeight(14) }), 14)).toBe(false);
  });
});

describe('تحليل رسائل الشات', () => {
  it('يقبل الأرقام اللاتينية والعربية', () => {
    expect(matchAlias('1')).toBe(1);
    expect(matchAlias('٢')).toBe(2);
    expect(matchAlias('٣')).toBe(3);
    expect(matchAlias('٤')).toBe(4);
  });

  it('يقبل الحروف اللاتينية والعربية كبديل', () => {
    expect(matchAlias('a')).toBe(1);
    expect(matchAlias('B')).toBe(2);
    expect(matchAlias('ج')).toBe(3);
    expect(matchAlias('د')).toBe(4);
  });

  it('يتجاهل المسافات الزائدة والحركات والرموز غير المرئية', () => {
    expect(matchAlias('  3  ')).toBe(3);
    expect(matchAlias('‏٢‎')).toBe(2);
    expect(matchAlias('١َ')).toBe(1);
  });

  it('مطابقة تامة فقط — «أعتقد 3» لا تُحتسب', () => {
    expect(matchAlias('أعتقد 3')).toBeNull();
    expect(matchAlias('الجواب ٢')).toBeNull();
    expect(matchAlias('33')).toBeNull();
    expect(matchAlias('5')).toBeNull();
    expect(matchAlias('')).toBeNull();
  });

  it('يوحّد أشكال الألف في كلمة الانضمام', () => {
    expect(matchesJoinKeyword('بركان', 'بركان')).toBe(true);
    expect(matchesJoinKeyword('  بُركان ', 'بركان')).toBe(true);
    expect(matchesJoinKeyword('البركان', 'بركان')).toBe(false);
    expect(matchesJoinKeyword('بركان!', 'بركان')).toBe(true);
  });

  it('التطبيع يزيل الإيموجي ويُبقي الحروف', () => {
    expect(normalize('بركان🌋')).toBe('بركان');
    expect(normalize('  ')).toBe('');
  });

  it('قصّ الاسم يحترم الإيموجي ولا يكسرها', () => {
    const name = '👑👑👑👑👑👑👑👑👑👑👑👑👑👑';
    const cut = truncateNickname(name, 3);
    expect(Array.from(cut).length).toBe(4); // 3 محارف + «…»
    expect(truncateNickname('سلطان', 12)).toBe('سلطان');
    expect(truncateNickname('   ', 12)).toBe('؟');
  });
});

describe('منطق التعادل', () => {
  it('من نجا أطول يتقدّم أولاً', () => {
    const board = rankPlayers([
      makePlayer({ userId: 'a', alive: false, burnedAtRound: 3, points: 100 }),
      makePlayer({ userId: 'b', alive: false, burnedAtRound: 5, points: 10 }),
    ]);
    expect(board[0]!.userId).toBe('b');
  });

  it('عند تساوي النجاة تحسمها النقاط', () => {
    const board = rankPlayers([
      makePlayer({ userId: 'a', alive: false, burnedAtRound: 4, points: 30 }),
      makePlayer({ userId: 'b', alive: false, burnedAtRound: 4, points: 55 }),
    ]);
    expect(board[0]!.userId).toBe('b');
  });

  it('عند تساوي النقاط يحسمها أسرع متوسط زمن إجابة', () => {
    const board = rankPlayers([
      makePlayer({ userId: 'a', alive: false, burnedAtRound: 4, points: 40, correctAnswers: 4, totalAnswerTime: 40 }),
      makePlayer({ userId: 'b', alive: false, burnedAtRound: 4, points: 40, correctAnswers: 4, totalAnswerTime: 20 }),
    ]);
    expect(board[0]!.userId).toBe('b');
    expect(averageAnswerTime(board[0]!.userId === 'b'
      ? makePlayer({ userId: 'b', correctAnswers: 4, totalAnswerTime: 20 })
      : makePlayer({ userId: 'a' }))).toBe(5);
  });

  it('اللاعب الحي يتقدّم على كل من احترق', () => {
    const board = rankPlayers([
      makePlayer({ userId: 'dead', alive: false, burnedAtRound: 11, points: 999 }),
      makePlayer({ userId: 'alive', alive: true, points: 1 }),
    ]);
    expect(board[0]!.userId).toBe('alive');
  });

  it('من لم يجب صحيحاً إطلاقاً متوسطه لانهائي فيتأخر', () => {
    expect(averageAnswerTime(makePlayer({ userId: 'x' }))).toBe(Infinity);
  });
});

describe('ربط الصعوبة بالجولات', () => {
  it('جولات 1-2 صعوبة 1، و3-4 صعوبة 2، و5+ صعوبة 3', () => {
    expect([1, 2, 3, 4, 5, 9].map(difficultyForRound)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('خلط الخيارات للعرض', () => {
  it('يحافظ على الإجابة الصحيحة ويحدّث correctIndex', () => {
    const raw = BANK.questions[0]!;
    for (let seed = 1; seed <= 50; seed++) {
      const shown = presentQuestion(raw, seededRandom(seed));
      expect(shown.options).toHaveLength(4);
      expect([...shown.options].sort()).toEqual([...raw.options].sort());
      expect(shown.options[shown.correctIndex]).toBe(raw.correct_answer);
    }
  });

  it('لا يمسّ السؤال الأصلي في التخزين', () => {
    const raw = BANK.questions[5]!;
    const before = raw.options.join('|');
    presentQuestion(raw, seededRandom(9));
    expect(raw.options.join('|')).toBe(before);
    expect(raw.options[raw.correct_index]).toBe(raw.correct_answer);
  });

  it('يطبّع الحقول: معرّف نصّي، ونصّ السؤال، وصعوبة رقمية', () => {
    const raw = BANK.questions[3]!;
    const shown = presentQuestion(raw, seededRandom(4));
    expect(shown.id).toBe(String(raw.id));
    expect(shown.text).toBe(raw.question);
    expect(shown.answer).toBe(raw.correct_answer);
    expect(shown.category).toBe(raw.category);
    expect(shown.difficultyName).toBe(raw.difficulty);
    expect({ easy: 1, medium: 2, hard: 3 }[raw.difficulty]).toBe(shown.difficulty);
  });
});

describe('سلامة بنك الأسئلة', () => {
  it('500 سؤال بمعرّفات فريدة وبنية صحيحة', () => {
    expect(BANK.total_questions).toBe(500);
    expect(BANK.questions).toHaveLength(500);
    expect(new Set(BANK.questions.map((q) => q.id)).size).toBe(500);
    for (const q of BANK.questions) {
      expect(q.options).toHaveLength(4);
      expect(q.correct_index).toBeGreaterThanOrEqual(0);
      expect(q.correct_index).toBeLessThanOrEqual(3);
      expect(q.options[q.correct_index]).toBe(q.correct_answer);
      expect(['easy', 'medium', 'hard']).toContain(q.difficulty);
      expect(typeof q.category).toBe('string');
      expect(q.category.length).toBeGreaterThan(0);
      expect(typeof q.question).toBe('string');
      expect(q.question.length).toBeGreaterThan(0);
    }
  });

  it('لا أثر لمخطّط البنك القديم', () => {
    for (const q of BANK.questions) {
      const raw = q as unknown as Record<string, unknown>;
      expect(raw['text']).toBeUndefined();
      expect(raw['answer']).toBeUndefined();
      expect(raw['correctIndex']).toBeUndefined();
      expect(raw['subcategory']).toBeUndefined();
    }
  });

  it('كل صعوبة فيها مخزون كافٍ لجولات المباراة', () => {
    const byLevel = { easy: 0, medium: 0, hard: 0 };
    for (const q of BANK.questions) byLevel[q.difficulty] += 1;
    expect(byLevel.easy).toBeGreaterThan(50);
    expect(byLevel.medium).toBeGreaterThan(50);
    expect(byLevel.hard).toBeGreaterThan(50);
  });
});
