// فحوصات صحة حقيقية: كل خدمة تُفحص باتصال فعلي وزمن استجابة فعلي. لا "نجاح" بلا فحص.
// الحالة: up | down | unconfigured. التنبيهات تُرفع عند الانتقال لـdown وتُغلق عند العودة.
import { now } from '../lib/util.js';

export function createHealth(svc) {
  const { store, fb, discord, botDb, botApi, cfg, alerts } = svc;
  const latest = store.col('healthLatest');
  const hist = store.col('healthHistory');

  async function timed(fn) { const t = Date.now(); try { const r = await fn(); return { ok: true, ms: r && r.ms != null ? r.ms : Date.now() - t, detail: r && r.detail }; } catch (e) { return { ok: false, ms: Date.now() - t, error: String(e && (e.code || e.message) || e).slice(0, 160) }; } }

  const CHECKS = {
    site: { label: 'الموقع الرئيسي', run: async () => { const c = new AbortController(); const tm = setTimeout(() => c.abort(), 8000); try { const t = Date.now(); const r = await fetch(cfg.siteUrl, { method: 'GET', signal: c.signal, redirect: 'follow' }); if (!r.ok) throw new Error('HTTP ' + r.status); return { ms: Date.now() - t }; } finally { clearTimeout(tm); } }, configured: () => !!cfg.siteUrl },
    firebaseAuth: { label: 'Firebase Authentication', run: () => fb.pingAuth(), configured: () => fb.available },
    firestore: { label: 'Cloud Firestore', run: () => fb.pingFirestore(), configured: () => fb.available },
    rtdb: { label: 'Realtime Database', run: () => fb.pingRtdb(), configured: () => fb.available },
    discordApi: { label: 'Discord API', run: () => discord.ping(), configured: () => discord.available },
    bot: { label: 'بوت ديسكورد', run: async () => { const r = await botApi.health(); if (!r.ok) throw new Error(r.error || 'HTTP ' + r.status); return { ms: r.ms, detail: r.json }; }, configured: () => botApi.healthConfigured },
    botDb: { label: 'قاعدة بيانات البوت', run: () => botDb.ping(), configured: () => botDb.available },
    botControl: { label: 'قناة التحكم داخل البوت', run: async () => { const r = await svc.botControl.status(); if (!r.detail?.ready) throw new Error('البوت غير جاهز'); return { ms: 0, detail: { ping: r.detail.ping } }; }, configured: () => svc.botControl.configured },
    botApi: { label: 'API البوت الداخلي', run: async () => { const r = await botApi.api('/admin/stats'); if (!r.ok) throw new Error(r.error || 'HTTP ' + r.status); return { ms: r.ms, detail: r.json && (r.json.data || r.json) }; }, configured: () => botApi.apiConfigured },
    streamBridge: { label: 'خدمة ربط البث', run: async () => { const c = new AbortController(); const tm = setTimeout(() => c.abort(), 8000); try { const t = Date.now(); const r = await fetch(cfg.bridgeHealthUrl, { signal: c.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return { ms: Date.now() - t }; } finally { clearTimeout(tm); } }, configured: () => !!cfg.bridgeHealthUrl },
    adminStore: { label: 'قاعدة اللوحة', run: async () => { store.ping(); return { ms: 0 }; }, configured: () => true }
  };

  async function runOne(id) {
    const c = CHECKS[id];
    const t = now();
    const prev = latest.get(id) || {};
    let rec;
    if (!c.configured()) rec = { id, label: c.label, status: 'unconfigured', checkedAt: t, lastOkAt: prev.lastOkAt || null, lastFailAt: prev.lastFailAt || null, downSince: null };
    else {
      const r = await timed(c.run);
      rec = r.ok
        ? { id, label: c.label, status: 'up', ms: r.ms, checkedAt: t, lastOkAt: t, lastFailAt: prev.lastFailAt || null, downSince: null, detail: r.detail }
        : { id, label: c.label, status: 'down', ms: r.ms, error: r.error, checkedAt: t, lastOkAt: prev.lastOkAt || null, lastFailAt: t, downSince: prev.status === 'down' ? prev.downSince : t };
    }
    latest.set(id, rec);
    if (rec.status !== 'unconfigured') hist.set(`${id}-${t}`, { id, ts: t, status: rec.status, ms: rec.ms ?? null, error: rec.error || null });
    if (rec.status === 'down') alerts.raise({ key: `health:${id}`, severity: id === 'bot' || id === 'firestore' ? 'critical' : 'warning', source: 'health', title: `${c.label} لا يستجيب`, message: rec.error });
    else if (rec.status === 'up') alerts.resolveKey(`health:${id}`, 'system', 'عادت الخدمة للعمل');
    return rec;
  }

  return {
    ids: Object.keys(CHECKS),
    runOne,
    async runAll() { return Promise.all(Object.keys(CHECKS).map(runOne)); },
    latest: () => Object.keys(CHECKS).map((id) => latest.get(id) || { id, label: CHECKS[id].label, status: CHECKS[id].configured() ? 'unknown' : 'unconfigured', checkedAt: null }),
    history: (id, sinceMs = now() - 24 * 3600_000, limit = 500) => hist.list({ where: { id, ts: { gte: sinceMs } }, orderBy: 'ts', dir: 'asc', limit }),
    incidents: (limit = 50) => hist.list({ where: { status: 'down' }, orderBy: 'ts', limit }),
    prune: (olderThanMs = 7 * 86400_000) => hist.deleteWhere({ ts: { lt: now() - olderThanMs } })
  };
}
