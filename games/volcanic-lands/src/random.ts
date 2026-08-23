// عشوائية قابلة للحقن — الاختبارات تحتاج بذرة ثابتة، اللعبة الحقيقية تحتاج
// مولّداً جديداً كل مرة (§9).

export type RandomFn = () => number;

/** المولّد الافتراضي في اللعبة الحقيقية. */
export const systemRandom: RandomFn = () => Math.random();

/**
 * مولّد mulberry32 ببذرة — حتمي وسريع، يُستخدم في الاختبارات والمحاكاة
 * حتى تكون النتائج قابلة لإعادة الإنتاج.
 */
export function seededRandom(seed: number): RandomFn {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * خلط Fisher–Yates على نسخة — لا يمسّ المصفوفة الأصلية إطلاقاً،
 * وهذا شرط لأن مصفوفة الأسئلة تأتي من الملف المستورد.
 */
export function shuffle<T>(items: readonly T[], rand: RandomFn): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
