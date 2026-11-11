'use strict';

// Streamer Live Announcer — إعلان تلقائي بروم ديسكورد لما ستريمر مسجّل يربط بثه بأحسمها.
//
// المصدر: liveStreams.onChange()/list() (نفس نظام /بث — بدون أي مراقبة منفصلة). المحفّز = ظهور جلسة للحساب
// (منصة + يوزر) بالقائمة، سواء "متصل بالبث" أو "يلعب" — مستقل عن بدء أي لعبة.
//
// "حلقة بث" (episode) = ظهور فعلي للحساب: تبدأ لما يظهر ويثبت (confirmMs) وتنتهي لما يغيب أكثر من مهلة السماح
// (absentGraceMs). الإعلان مرة وحدة لكل حلقة، والحلقات محفوظة بقاعدة البيانات (فهرس فريد جزئي = حلقة مفتوحة
// واحدة لكل حساب)، فما يتكرر الإعلان مع تحديثات متكررة، تغيير لعبة، Webhook + مزامنة، انقطاع لحظي، أو إعادة تشغيل
// البوت (الحلقة المفتوحة تُتبنّى لو آخر ظهور لها خلال restartToleranceMs).
//
// الإرسال: حجز ذرّي بالقاعدة (pending/failed → sending) ثم الإرسال. فشل مؤكد من ديسكورد ← إعادة محدودة مع Backoff،
// ونتيجة غير واضحة (مهلة/شبكة) ← unknown بدون إعادة (منع التكرار قدر الإمكان).

const logger = require('../utils/logger');
const formatter = require('./streamAnnouncementFormatter');
const linkResolver = require('./streamLinkResolver');

const DEFAULTS = Object.freeze({
  confirmMs: 8000,
  absentGraceMs: 3 * 60 * 1000,
  restartToleranceMs: 30 * 60 * 1000,
  touchEveryMs: 5 * 60 * 1000,
  retryDelaysMs: [30_000, 2 * 60_000, 5 * 60_000],
  sendTimeoutMs: 15_000,
  unresolvedRetryMs: 60_000,
  dbRetryMs: [5_000, 30_000, 5 * 60_000]
});

const keyOf = (platform, normalized) => `${platform}:${normalized}`;

function createAnnouncer({ liveStreams, store, getClient, channelId, settings = {}, resolver = linkResolver, now = Date.now }) {
  const cfg = { ...DEFAULTS, ...settings };
  const registry = new Map(); // key -> [records]
  const tracked = new Map(); // key -> { phase:'confirming'|'live', event, confirmTimer, absentTimer, retryTimer }
  const unresolvedAt = new Map();
  const locks = new Map();
  let unsubscribe = null;
  let touchTimer = null;
  let loadTimer = null;
  let started = false;
  let ready = false; // السجل انحمّل من القاعدة (بدونه ما ننشر شي)
  let adopted = new Map(); // key -> event row (حلقات مفتوحة من قبل إعادة التشغيل)
  const stats = { announced: 0, failed: 0, skippedDuplicate: 0 };

  // مفتاح واحد = عملية وحدة بنفس اللحظة (منع إعلانين متزامنين)
  function withLock(key, fn) {
    const prev = locks.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    locks.set(key, next);
    next.finally(() => { if (locks.get(key) === next) locks.delete(key); }).catch(() => {});
    return next;
  }

  const clear = (t) => t && clearTimeout(t);
  function dropTracked(key) {
    const st = tracked.get(key);
    if (!st) return;
    clear(st.confirmTimer); clear(st.absentTimer); clear(st.retryTimer);
    tracked.delete(key);
  }

  // ---------------- السجل ----------------
  async function loadRegistry() {
    const rows = await store.streamers.listEnabled();
    registry.clear();
    for (const r of rows) {
      const k = keyOf(r.platform, r.normalized_username);
      if (!registry.has(k)) registry.set(k, []);
      registry.get(k).push(r);
    }
    return rows.length;
  }

  async function bootstrap(attempt = 0) {
    try {
      await loadRegistry();
      await store.events.settleStuckSending().catch(() => 0);
      adopted = new Map();
      for (const ev of await store.events.listOpen()) {
        const k = keyOf(ev.platform, ev.normalized_username);
        if (!registry.has(k) || now() - ev.last_seen_at > cfg.restartToleranceMs) await store.events.close(ev.id, now());
        else adopted.set(k, ev);
      }
      ready = true;
      logger.info('📣 إعلانات الستريمرز: جاهزة', { registered: registry.size, adoptedOpenSessions: adopted.size, channelId });
      evaluate();
    } catch (err) {
      // القاعدة غير متاحة: ما نفترض إن الستريمرز غير مسجلين ولا ننشر — نعيد المحاولة بتباعد
      ready = false;
      const delay = cfg.dbRetryMs[Math.min(attempt, cfg.dbRetryMs.length - 1)];
      logger.error('إعلانات الستريمرز: تعذّر تحميل التسجيل من قاعدة البيانات — إعادة محاولة', { error: err && err.message, retryInMs: delay });
      loadTimer = setTimeout(() => bootstrap(attempt + 1), delay);
      if (loadTimer.unref) loadTimer.unref();
    }
  }

  // ---------------- التقييم (يُستدعى مع كل تغيير بقائمة البث) ----------------
  function currentPresence() {
    const map = new Map();
    for (const s of liveStreams.list()) {
      if (!s.platform || !s.platformUsername) continue;
      const n = resolver.normalizeUsername(s.platformUsername);
      if (n) map.set(keyOf(s.platform, n.normalized), s);
    }
    return map;
  }

  function evaluate() {
    if (!ready || !started) return;
    const present = currentPresence();
    for (const key of registry.keys()) {
      const stream = present.get(key);
      if (stream) onPresent(key, stream);
      else onAbsent(key);
    }
    for (const key of [...tracked.keys()]) if (!registry.has(key)) dropTracked(key);
  }

  function onPresent(key, stream) {
    const st = tracked.get(key);
    if (st) {
      if (st.absentTimer) { clear(st.absentTimer); st.absentTimer = null; } // رجع قبل نهاية المهلة = نفس الحلقة
      return;
    }
    const ev = adopted.get(key);
    if (ev) { // حلقة مفتوحة من قبل إعادة التشغيل ← نتبنّاها بدون إعلان جديد
      adopted.delete(key);
      tracked.set(key, { phase: 'live', event: ev, absentTimer: null });
      stats.skippedDuplicate += 1;
      withLock(key, () => store.events.touch(ev.id)).catch(() => {});
      return;
    }
    if ((unresolvedAt.get(key) || 0) + cfg.unresolvedRetryMs > now()) return;
    const timer = setTimeout(() => withLock(key, () => confirm(key)).catch((err) => logger.error('إعلانات الستريمرز: خطأ بالتأكيد', { key, error: err })), cfg.confirmMs);
    if (timer.unref) timer.unref();
    tracked.set(key, { phase: 'confirming', confirmTimer: timer, absentTimer: null });
  }

  function onAbsent(key) {
    const st = tracked.get(key);
    const ev = adopted.get(key);
    if (!st && ev) { // حلقة قديمة والستريمر غايب: مهلة سماح من الإقلاع ثم تُغلق
      adopted.delete(key);
      const t = setTimeout(() => withLock(key, () => closeEpisode(key)).catch(() => {}), cfg.absentGraceMs);
      if (t.unref) t.unref();
      tracked.set(key, { phase: 'live', event: ev, absentTimer: t });
      return;
    }
    if (!st) return;
    if (st.phase === 'confirming') { dropTracked(key); return; } // ظهر وراح قبل التأكيد ← ولا شي
    if (!st.absentTimer) {
      st.absentTimer = setTimeout(() => withLock(key, () => closeEpisode(key)).catch((err) => logger.warn('إعلانات الستريمرز: تعذّر إغلاق حلقة', { key, error: err && err.message })), cfg.absentGraceMs);
      if (st.absentTimer.unref) st.absentTimer.unref();
    }
  }

  async function closeEpisode(key) {
    const st = tracked.get(key);
    if (!st) return;
    if (currentPresence().has(key)) { st.absentTimer = null; return; } // رجع بآخر لحظة ← نفس الحلقة
    if (st.event) await store.events.close(st.event.id, now());
    clear(st.retryTimer);
    tracked.delete(key);
    logger.info('إعلانات الستريمرز: انتهت حلقة البث', { key });
  }

  // ---------------- التأكيد ثم الإعلان ----------------
  async function confirm(key) {
    const st = tracked.get(key);
    if (!st || st.phase !== 'confirming') return;
    const recs = registry.get(key);
    const stream = currentPresence().get(key);
    if (!recs || !stream) { dropTracked(key); return; }
    const rec = recs[0];
    const r = await resolver.resolve({ platform: rec.platform, username: rec.username, stream });
    if (!r.ok) {
      // ما نرسل رابط غير مؤكد — نسجّل ونعيد التحقق لاحقاً مع بيانات جديدة
      logger.warn('إعلانات الستريمرز: ما قدرنا نحصل رابط بث مؤكد — ما انرسل إعلان', { key, reason: r.reason });
      unresolvedAt.set(key, now());
      dropTracked(key);
      return;
    }
    let ev;
    try {
      ev = await store.events.open({ platform: rec.platform, normalized: rec.normalized_username, streamerId: rec.id, linkSessionId: stream.sessionId, liveSessionId: stream.liveSessionId || null, startedAt: now() });
    } catch (err) {
      logger.error('إعلانات الستريمرز: تعذّر تسجيل الحلقة بقاعدة البيانات — ما انرسل إعلان (منعاً للتكرار)', { key, error: err && err.message });
      unresolvedAt.set(key, now());
      dropTracked(key);
      return;
    }
    if (!ev) { // فيه حلقة مفتوحة أصلاً (عملية ثانية/سجل سابق) ← ما نكرر
      stats.skippedDuplicate += 1;
      const open = await store.events.getOpen(rec.platform, rec.normalized_username).catch(() => null);
      tracked.set(key, { phase: 'live', event: open, absentTimer: null });
      return;
    }
    clear(st.confirmTimer);
    tracked.set(key, { phase: 'live', event: ev, url: r.url, absentTimer: null, retryTimer: null });
    await sendAnnouncement(key, ev, rec, r.url);
  }

  async function resolveChannel() {
    const client = getClient();
    if (!client) return { ok: false, reason: 'NO_CLIENT' };
    let ch = client.channels.cache.get(channelId);
    if (!ch) ch = await client.channels.fetch(channelId).catch(() => null);
    if (!ch) return { ok: false, reason: 'CHANNEL_NOT_FOUND' };
    if (typeof ch.send !== 'function') return { ok: false, reason: 'NOT_TEXT_CHANNEL' };
    const me = ch.guild && (ch.guild.members.me || (await ch.guild.members.fetchMe().catch(() => null)));
    const perms = me && ch.permissionsFor ? ch.permissionsFor(me) : null;
    if (!perms) return { ok: false, reason: 'NO_PERMISSIONS_INFO' };
    const missing = ['ViewChannel', 'SendMessages', 'EmbedLinks'].filter((p) => !perms.has(p));
    if (missing.length) return { ok: false, reason: 'MISSING_PERMISSIONS', missing };
    return { ok: true, channel: ch, canMention: perms.has('MentionEveryone') };
  }

  async function sendAnnouncement(key, ev, rec, url) {
    if (!(await store.events.claimSend(ev.id))) return; // طرف ثاني حجزه
    const ch = await resolveChannel();
    if (!ch.ok) {
      logger.error('إعلانات الستريمرز: روم الإعلانات غير متاح — ما انرسل الإعلان (ما نستخدم روم بديل)', { channelId, reason: ch.reason, missing: ch.missing });
      await store.events.markFailed(ev.id, 'failed', ch.reason);
      stats.failed += 1;
      return scheduleRetry(key, ev.id);
    }
    if (!ch.canMention) logger.error('إعلانات الستريمرز: البوت ما عنده صلاحية Mention Everyone — الإعلان بينرسل بدون @everyone', { channelId });
    const payload = formatter.announcementPayload({ platform: rec.platform, username: rec.username, url, mention: ch.canMention });
    try {
      const msg = await Promise.race([ch.channel.send(payload), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('send timeout'), { uncertain: true })), cfg.sendTimeoutMs))]);
      await store.events.markSent(ev.id, { messageId: msg && msg.id, streamUrl: url, status: ch.canMention ? 'sent' : 'sent_no_mention' });
      stats.announced += 1;
      logger.info('📣 تم نشر إعلان بث ستريمر', { key, messageId: msg && msg.id, mention: ch.canMention });
    } catch (err) {
      const definitive = !err.uncertain && (err.code != null || err.status != null);
      if (definitive) {
        logger.error('إعلانات الستريمرز: فشل إرسال الإعلان', { key, code: err.code, status: err.status });
        await store.events.markFailed(ev.id, 'failed', err.code || err.status);
        stats.failed += 1;
        scheduleRetry(key, ev.id);
      } else {
        // لا نعرف هل وصلت الرسالة أو لا ← ما نعيد (منع التكرار)
        logger.error('إعلانات الستريمرز: نتيجة الإرسال غير واضحة — ما نعيد المحاولة لتفادي التكرار', { key, error: err && err.message });
        await store.events.markFailed(ev.id, 'unknown', 'uncertain').catch(() => {});
      }
    }
  }

  function scheduleRetry(key, eventId) {
    const st = tracked.get(key);
    if (!st) return;
    st.retries = (st.retries || 0) + 1;
    if (st.retries > cfg.retryDelaysMs.length) return; // وصلنا الحد
    const delay = cfg.retryDelaysMs[st.retries - 1];
    clear(st.retryTimer);
    st.retryTimer = setTimeout(() => withLock(key, async () => {
      const cur = tracked.get(key);
      const stream = currentPresence().get(key);
      const recs = registry.get(key);
      if (!cur || !stream || !recs) return; // انتهى البث أو انشال التسجيل ← ما نرسل متأخر
      const ev = await store.events.get(eventId);
      if (!ev || ev.ended_at || ev.status !== 'failed') return;
      const r = await resolver.resolve({ platform: recs[0].platform, username: recs[0].username, stream });
      if (!r.ok) return;
      await sendAnnouncement(key, ev, recs[0], r.url);
    }).catch((err) => logger.error('إعلانات الستريمرز: خطأ بإعادة المحاولة', { key, error: err && err.message })), delay);
    if (st.retryTimer.unref) st.retryTimer.unref();
  }

  // ---------------- واجهة للأوامر ----------------
  /** تسجيل جديد من الأمر (الكاش يتحدّث فوراً بدون إعادة تحميل كامل) */
  function register(rec) {
    const k = keyOf(rec.platform, rec.normalized_username);
    const list = registry.get(k) || [];
    if (!list.some((r) => r.id === rec.id)) list.push(rec);
    registry.set(k, list);
    evaluate();
  }

  /** إزالة: يوقف الإعلان فوراً ويقفل الحلقة؛ ما يمس جلسة البث ولا /بث */
  async function unregister({ guildId, platform, normalized }) {
    const k = keyOf(platform, normalized);
    const list = (registry.get(k) || []).filter((r) => r.guild_id !== guildId);
    if (list.length) { registry.set(k, list); return; }
    registry.delete(k);
    const st = tracked.get(k);
    dropTracked(k);
    adopted.delete(k);
    unresolvedAt.delete(k);
    const evId = st && st.event && st.event.id;
    const open = evId ? { id: evId } : await store.events.getOpen(platform, normalized).catch(() => null);
    if (open) await store.events.close(open.id, now()).catch(() => {});
  }

  function start() {
    if (started) return;
    started = true;
    unsubscribe = liveStreams.onChange(() => evaluate());
    touchTimer = setInterval(() => {
      for (const [key, st] of tracked) {
        if (st.phase === 'live' && st.event && !st.absentTimer) withLock(key, () => store.events.touch(st.event.id)).catch(() => {});
      }
    }, cfg.touchEveryMs);
    if (touchTimer.unref) touchTimer.unref();
    return bootstrap();
  }

  function stop() {
    started = false;
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    clear(touchTimer); clear(loadTimer);
    touchTimer = null; loadTimer = null;
    for (const key of [...tracked.keys()]) dropTracked(key);
  }

  return { start, stop, register, unregister, evaluate, stats, _internal: { registry, tracked, adopted, bootstrap, isReady: () => ready, cfg } };
}

// ---------------- كائن وحيد للعملية ----------------
let instance = null;
function init(opts) {
  if (instance) return instance;
  instance = createAnnouncer(opts);
  return instance;
}
const get = () => instance;
function _reset() {
  if (instance) instance.stop();
  instance = null;
}

module.exports = { createAnnouncer, init, get, _reset, DEFAULTS };
