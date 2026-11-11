// سجل التدقيق: إضافة فقط (append-only) + سلسلة تجزئة للكشف عن أي تلاعب خارجي بالقاعدة.
// لا توجد أي دالة تعديل/حذف مُصدَّرة، ولا مسار API لذلك.
import { now, uid, sha256, stable, scrub } from '../lib/util.js';

export function createAudit(store) {
  const c = store.col('audit');
  const meta = store.col('auditMeta');

  function append(entry) {
    return store.tx(() => {
      const head = meta.get('head') || { seq: 0, hash: 'GENESIS' };
      const id = `${String(head.seq + 1).padStart(10, '0')}-${uid(4)}`;
      const { undo, ...rest } = entry; // undo يبنيه الخادم نفسه (بلا أسرار) فلا يُقتطع/يُحجب
      const body = JSON.parse(JSON.stringify({ ...scrub({ ...rest, ts: entry.ts || now(), seq: head.seq + 1 }), ...(undo ? { undo } : {}) }));
      const hash = sha256(head.hash + '|' + id + '|' + stable(body));
      c.create(id, { ...body, prevHash: head.hash, hash });
      meta.set('head', { seq: head.seq + 1, hash });
      return { id, ...body, hash };
    });
  }

  function verifyChain(limit = 5000) {
    const rows = c.list({ orderBy: 'seq', dir: 'asc', limit });
    let prev = null, ok = true, brokenAt = null, checked = 0;
    for (const r of rows) {
      const { id, prevHash, hash, ...rest } = r;
      if (prev !== null && prevHash !== prev) { ok = false; brokenAt = id; break; }
      const calc = sha256(prevHash + '|' + id + '|' + stable(rest));
      if (calc !== hash) { ok = false; brokenAt = id; break; }
      prev = hash; checked++;
    }
    return { ok, checked, brokenAt, total: c.count() };
  }

  return {
    append,
    verifyChain,
    get: (id) => c.get(id),
    list: (opts) => c.list({ orderBy: 'seq', ...opts }),
    count: (where, search) => c.count(where, search)
  };
}
