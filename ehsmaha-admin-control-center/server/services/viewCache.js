// تخفيف استهلاك حصة Firestore: ذاكرة مؤقتة لنتائج العروض (القراءات المتكررة من الواجهة لا تصل Firestore)،
// وتُبطَل فوراً بعد أي عملية كتابة ناجحة في نفس القسم. عند نفاد الحصة تُقدَّم آخر نسخة محفوظة مع وسم stale.
import { now } from '../lib/util.js';

export function createViewCache({ defaultTtlSec = 90, max = 400 } = {}) {
  const m = new Map(); // key -> { at, value, section, ttl }
  const stats = { hits: 0, misses: 0, stale: 0, invalidations: 0 };
  const prune = () => { if (m.size > max) { for (const k of [...m.keys()].slice(0, m.size - max)) m.delete(k); } };
  return {
    stats, defaultTtlSec,
    get(key, ttlSec, { allowStale = false } = {}) {
      const e = m.get(key); if (!e) { stats.misses++; return null; }
      const age = now() - e.at;
      if (age <= (ttlSec ?? e.ttl) * 1000) { stats.hits++; return { ...e.value, cached: true, cachedAt: e.at }; }
      if (allowStale) { stats.stale++; return { ...e.value, cached: true, stale: true, cachedAt: e.at }; }
      stats.misses++; return null;
    },
    set(key, value, section, ttl) { m.set(key, { at: now(), value, section, ttl }); prune(); },
    clearSection(section) { for (const [k, e] of m) if (e.section === section) { m.delete(k); stats.invalidations++; } },
    clear() { m.clear(); },
    get size() { return m.size; }
  };
}
