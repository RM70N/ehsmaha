// مركز التنبيهات: إزالة التكرار بمفتاح ثابت (تنبيه مفتوح واحد لكل مصدر/مشكلة) + حالة معالجة + سجل إجراءات.
import { now } from '../lib/util.js';

export function createAlerts({ store }) {
  const col = store.col('alerts');
  const SEV = ['info', 'warning', 'critical'];
  return {
    SEV,
    // يرجّع { created, alert }. لو يوجد تنبيه مفتوح بنفس المفتاح: يزيد العدّاد فقط (لا تنبيه مكرر)
    raise({ key, severity = 'warning', source, title, message }) {
      const cur = col.get(key);
      const t = now();
      if (cur && cur.status !== 'resolved') {
        const next = col.merge(key, { count: (cur.count || 1) + 1, lastAt: t, message: message ?? cur.message, severity: SEV.indexOf(severity) > SEV.indexOf(cur.severity) ? severity : cur.severity });
        return { created: false, alert: { id: key, ...next } };
      }
      const doc = { key, severity, source, title, message, status: 'open', count: 1, createdAt: t, lastAt: t, history: [{ ts: t, by: 'system', action: 'opened' }] };
      col.set(key, doc);
      return { created: true, alert: { id: key, ...doc } };
    },
    resolveKey(key, by = 'system', note) {
      const cur = col.get(key);
      if (!cur || cur.status === 'resolved') return false;
      col.merge(key, { status: 'resolved', resolvedAt: now(), history: [...(cur.history || []), { ts: now(), by, action: 'resolved', note }].slice(-30) });
      return true;
    },
    ack(key, by) {
      const cur = col.get(key);
      if (!cur || cur.status !== 'open') return null;
      return col.merge(key, { status: 'acknowledged', ackBy: by, ackAt: now(), history: [...(cur.history || []), { ts: now(), by, action: 'acknowledged' }].slice(-30) });
    },
    get: (id) => col.get(id),
    list: (o = {}) => col.list({ orderBy: 'lastAt', ...o }),
    count: (where) => col.count(where),
    openCount: () => col.count({ status: 'open' })
  };
}
