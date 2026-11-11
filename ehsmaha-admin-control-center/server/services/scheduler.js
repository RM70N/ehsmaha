// المهام الخلفية: فحوصات الصحة الدورية، إنهاء الحظر المؤقت، نشر الإعلانات المجدولة.
// كل مهمة آمنة للتكرار (idempotent) وتنجو من إعادة التشغيل لأن حالتها في قاعدة اللوحة.
import { now } from '../lib/util.js';
import { log } from '../lib/logger.js';

export function createScheduler(svc) {
  const { store, fb, audit, alerts, cfg } = svc;
  const temp = store.col('tempActions');
  const timers = [];

  // رفع الحظر المؤقت المنتهي: نعيد تفعيل حساب Firebase فعلياً ونتحقق، وإلا نبقيه ونرفع تنبيهاً
  async function processTempBans() {
    if (!fb.available) return { processed: 0 };
    const due = temp.list({ where: { type: 'ban', status: 'active', expiresAt: { lte: now() } }, limit: 50 });
    let n = 0;
    for (const j of due) {
      try {
        await fb.auth().updateUser(j.uid, { disabled: false });
        const u = await fb.auth().getUser(j.uid);
        if (u.disabled) throw new Error('verify failed');
        temp.merge(j.id, { status: 'expired', endedAt: now() });
        audit.append({ actor: 'SYSTEM', actorName: 'النظام', role: 'system', section: 'players', action: 'players.ban_expire', label: 'انتهاء حظر مؤقت', status: 'success', target: j.username, detail: { uid: j.uid } });
        alerts.resolveKey(`tempban:${j.uid}`, 'system');
        n++;
      } catch (e) {
        alerts.raise({ key: `tempban:${j.uid}`, severity: 'warning', source: 'scheduler', title: 'تعذّر رفع حظر مؤقت منتهي', message: `${j.username}: ${e.code || e.message}` });
      }
    }
    // إيقاف الربط المؤقت للستريمرز: نعيد enabled=true ونتحقق بالقراءة
    for (const j of temp.list({ where: { type: 'bridge', status: 'active', expiresAt: { lte: now() } }, limit: 50 })) {
      try {
        const ref = fb.db().collection('bridgeStreamers').doc(j.uid);
        await ref.set({ enabled: true, updatedAt: fb.FieldValue.serverTimestamp(), updatedBy: 'admin-center:scheduler' }, { merge: true });
        if ((await ref.get()).data()?.enabled !== true) throw new Error('verify failed');
        temp.merge(j.id, { status: 'expired', endedAt: now() });
        audit.append({ actor: 'SYSTEM', actorName: 'النظام', role: 'system', section: 'streamers', action: 'streamers.bridge_expire', label: 'انتهاء إيقاف ربط مؤقت', status: 'success', target: j.username });
        n++;
      } catch (e) { alerts.raise({ key: `tempbridge:${j.uid}`, severity: 'warning', source: 'scheduler', title: 'تعذّر إعادة تفعيل ربط ستريمر منتهٍ', message: `${j.username}: ${e.code || e.message}` }); }
    }
    return { processed: n };
  }

  async function tick() { try { await processTempBans(); } catch (e) { log.error('scheduler tick', { error: e }); } try { await svc.scheduledPosts?.processDue(); } catch (e) { log.error('scheduled posts', { error: e }); } }

  return {
    processTempBans, tick,
    start() {
      if (!cfg.startBackground) return;
      let stopped = false;
      const loopHealth = () => { if (stopped) return; svc.health.runAll().catch(() => {}).finally(() => { try { svc.health.prune(svc.settings.get('healthRetentionDays') * 86400_000); } catch { /* */ } const t = setTimeout(loopHealth, svc.settings.get('healthIntervalSec') * 1000); t.unref?.(); timers.push(t); }); };
      const s = setInterval(tick, cfg.schedulerIntervalSec * 1000);
      s.unref?.(); timers.push(s);
      const prevStop = () => { stopped = true; };
      this._stopFlag = prevStop;
      setTimeout(loopHealth, 1500).unref?.();
      setTimeout(tick, 3000).unref?.();
    },
    stop() { this._stopFlag?.(); while (timers.length) { const t = timers.pop(); clearInterval(t); clearTimeout(t); } }
  };
}
