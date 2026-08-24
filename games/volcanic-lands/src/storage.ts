// طبقة تخزين مجرّدة — تسمح باختبار منطق منع التكرار بلا متصفح (§13).

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** تخزين في الذاكرة — يُستخدم في الاختبارات وكبديل آمن عند تعطّل localStorage. */
export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

/**
 * يُرجع localStorage إن كان متاحاً وقابلاً للكتابة فعلاً، وإلا تخزيناً في
 * الذاكرة. الوضع الخاص في بعض المتصفحات يرمي عند الكتابة لا عند القراءة،
 * لذلك نتحقق بكتابة فعلية — بدون هذا تُفقد الأسئلة المستخدمة بصمت.
 */
export function resolveStorage(): KeyValueStorage {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return new MemoryStorage();
    const probe = '__vl_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStorage();
  }
}
