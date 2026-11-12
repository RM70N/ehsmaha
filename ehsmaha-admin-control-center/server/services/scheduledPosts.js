// نشر الإعلانات المجدولة (موقع/ديسكورد). الحالة في قاعدة اللوحة فتنجو من إعادة التشغيل،
// والحجز الذرّي (scheduled→publishing) يمنع النشر المزدوج لو تداخلت دورتان.
import { now } from '../lib/util.js';

export function createScheduledPosts(svc) {
  const col = svc.store.col('scheduledPosts');
  async function publish(job, ctx) {
    if (job.kind === 'site_broadcast') return publishSiteBroadcast(ctx.fb, job);
    if (job.kind === 'discord_message') {
      const m = await ctx.discord.sendMessage(job.channelId, { content: job.text, allowed_mentions: { parse: [] } });
      return { messageId: m.id };
    }
    throw new Error('نوع غير معروف');
  }
  return {
    publish,
    async processDue() {
      const due = col.list({ where: { status: 'scheduled', at: { lte: now() } }, orderBy: 'at', dir: 'asc', limit: 20 });
      for (const j of due) {
        const claimed = svc.store.tx(() => { const cur = col.get(j.id); if (!cur || cur.status !== 'scheduled') return false; col.merge(j.id, { status: 'publishing', startedAt: now() }); return true; });
        if (!claimed) continue;
        try {
          const r = await publish(j, svc.buildCtx({ accountId: 'SYSTEM', display: 'النظام', role: 'system' }));
          col.merge(j.id, { status: 'published', publishedAt: now(), result: r });
          svc.audit.append({ actor: 'SYSTEM', actorName: 'النظام', role: 'system', section: 'messages', action: 'messages.scheduled_publish', label: 'نشر إعلان مجدول', status: 'success', target: j.id, detail: { kind: j.kind } });
        } catch (e) {
          col.merge(j.id, { status: 'failed', error: String(e.message || e).slice(0, 200) });
          svc.alerts.raise({ key: `scheduled:${j.id}`, severity: 'warning', source: 'scheduler', title: 'فشل نشر إعلان مجدول', message: String(e.message || e).slice(0, 200) });
          svc.audit.append({ actor: 'SYSTEM', actorName: 'النظام', role: 'system', section: 'messages', action: 'messages.scheduled_publish', label: 'نشر إعلان مجدول', status: 'failed', target: j.id, error: 'PUBLISH_FAILED', errorMessage: String(e.message || e).slice(0, 200) });
        }
      }
    }
  };
}

// الكتابة بمسارَي الموقع (Firestore + RTDB الاحتياطي) تماماً كما يفعل ownerSendBroadcastMessage
export async function publishSiteBroadcast(fb, { text, position = 'center', durationSec = 10, sentBy = 'لوحة الإدارة' }) {
  const base = { text, position, durationMode: 'timed', durationSec, sentBy };
  // مسارا الموقع: Firestore + RTDB. إن نفدت حصة Firestore يكفي نجاح RTDB (الموقع يستمع للاثنين — نفس منطق ownerSendBroadcastMessage)
  const [f, r] = await Promise.allSettled([
    (async () => fb.db().collection('broadcastMessages').doc('current').set({ ...base, sentAt: fb.FieldValue.serverTimestamp() }))(),
    (async () => fb.rtdb().ref('ownerMessages/broadcast').set({ ...base, sentAt: fb.ServerValue.TIMESTAMP }))()
  ]);
  if (f.status === 'rejected' && r.status === 'rejected') throw f.reason;
  return { ok: true, firestore: f.status === 'fulfilled', rtdb: r.status === 'fulfilled' };
}
