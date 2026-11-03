'use strict';
// المدير: يحتفظ بقائمة الحسابات المربوطة، يفحص دورياً (connect() نفسه يكشف "غير مباشر" كخطأ
// مصنَّف، فلا حاجة لاستدعاء فحص منفصل قبل كل محاولة — نفس نهج tiktok-server الحالي)، يمنع
// الاتصال المزدوج لنفس اليوزر، يمرّ كل فحص/اتصال عبر محدّد المعدل العام، ويطبّق قاطع الدائرة
// والتراجع الأسّي وfailover بين المزوّدين.
import { CircuitBreaker } from './circuitBreaker.js';
import { TokenBucketRateLimiter } from './rateLimiter.js';
import { backoffDelay, pollDelay } from './backoff.js';

export class ConnectionManager {
  constructor({
    primaryProvider,
    fallbackProvider = null,
    enableFallback = false,
    pollIntervalMinMs = 30000,
    pollIntervalMaxMs = 60000,
    pollMaxConcurrency = 5,
    globalRatePerSec = 2,
    globalRateBurst = 5,
    breakerOpts = {},
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    rng = Math.random,
    log = () => {},
    onEvent = () => {},
  } = {}) {
    if (!primaryProvider) throw new Error('primaryProvider مطلوب');
    this.primaryProvider = primaryProvider;
    this.fallbackProvider = fallbackProvider;
    this.enableFallback = enableFallback;
    this.pollMin = pollIntervalMinMs;
    this.pollMax = pollIntervalMaxMs;
    this.pollMaxConcurrency = pollMaxConcurrency;
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rng = rng;
    this.log = log;
    this.onEvent = onEvent;

    this.limiter = new TokenBucketRateLimiter({ ratePerSec: globalRatePerSec, burst: globalRateBurst, now });
    this.breakers = {
      [primaryProvider.name]: new CircuitBreaker({ now, ...breakerOpts }),
    };
    if (fallbackProvider) this.breakers[fallbackProvider.name] = new CircuitBreaker({ now, ...breakerOpts });

    this.tracked = new Set();   // كل اليوزرات المربوطة المتابَعة
    this.active = new Map();    // يوزر -> { disconnect, providerName } — متصل الآن فعلاً
    this.connecting = new Set(); // يوزر قيد محاولة اتصال حالياً (يمنع التزامن لنفس اليوزر)
    this.timers = new Map();    // يوزر -> معرّف المؤقّت القادم
    this.attempts = new Map();  // يوزر -> عدد محاولات الفشل المتتالية الحالية (للتراجع الأسّي)
    this.stopped = false;
    this.inFlightPolls = 0;
    this.waitingPolls = [];
  }

  // -------------------------------------------------------------- تتبّع الحسابات
  track(username) {
    if (this.tracked.has(username)) return;
    this.tracked.add(username);
    this._scheduleCheck(username, pollDelay(0, this.pollMin, this.rng)); // أول فحص بلا انتظار طويل
  }

  untrack(username) {
    this.tracked.delete(username);
    this._clearTimer(username);
    this.attempts.delete(username);
    const a = this.active.get(username);
    if (a) { try { a.disconnect(); } catch (e) { /* best-effort */ } this.active.delete(username); }
  }

  isActive(username) { return this.active.has(username); }

  // -------------------------------------------------------------- الجدولة
  _clearTimer(username) {
    const t = this.timers.get(username);
    if (t) { this.clearTimer(t); this.timers.delete(username); }
  }

  _scheduleCheck(username, delayMs) {
    if (!this.tracked.has(username) || this.stopped) return;
    this._clearTimer(username);
    const t = this.setTimer(() => this._runCheck(username), Math.max(0, delayMs));
    if (t && t.unref) t.unref();
    this.timers.set(username, t);
  }

  async _runCheck(username) {
    this.timers.delete(username);
    if (!this.tracked.has(username) || this.stopped) return;
    if (this.active.has(username) || this.connecting.has(username)) return; // اتصال مزدوج ممنوع

    if (this.inFlightPolls >= this.pollMaxConcurrency) {
      // تجاوزنا حد التزامن: ننتظر دورنا بدل استهلاك مؤقتات بلا فائدة
      this.waitingPolls.push(username);
      return;
    }
    if (!this.limiter.tryTake()) {
      this._scheduleCheck(username, this.limiter.waitMs() + 50);
      return;
    }

    this.inFlightPolls++;
    this.connecting.add(username);
    try {
      await this._attemptConnect(username);
    } finally {
      this.connecting.delete(username);
      this.inFlightPolls--;
      this._pumpWaiting();
    }
  }

  _pumpWaiting() {
    while (this.inFlightPolls < this.pollMaxConcurrency && this.waitingPolls.length) {
      const u = this.waitingPolls.shift();
      if (this.tracked.has(u) && !this.active.has(u) && !this.connecting.has(u)) this._scheduleCheck(u, 0);
    }
  }

  // -------------------------------------------------------------- اختيار المزوّد ومحاولة الاتصال
  _pickProvider() {
    const primaryBreaker = this.breakers[this.primaryProvider.name];
    if (primaryBreaker.canRequest()) return { provider: this.primaryProvider, breaker: primaryBreaker };
    if (this.enableFallback && this.fallbackProvider) {
      const fb = this.breakers[this.fallbackProvider.name];
      if (fb.canRequest()) return { provider: this.fallbackProvider, breaker: fb };
    }
    return null;
  }

  async _attemptConnect(username) {
    const picked = this._pickProvider();
    if (!picked) {
      // كل المزوّدين مقفلين الآن (قاطع مفتوح) — أعد الجدولة بعد أقصر مدة انتظار بينهما
      const waits = [this.breakers[this.primaryProvider.name].waitMs()];
      if (this.enableFallback && this.fallbackProvider) waits.push(this.breakers[this.fallbackProvider.name].waitMs());
      this._scheduleCheck(username, Math.max(1000, Math.min(...waits)));
      return;
    }
    const { provider, breaker } = picked;
    breaker.onDispatch();
    this.log('info', 'connect_attempt', { username, provider: provider.name });
    // liveEnded: الاتصال يغلق من طرف تيك توك — نلتقطه هنا لتنظيف active والعودة للفحص الدوري،
    // بالإضافة لبثّه كأي حدث آخر للمستهلكين عبر onEvent العام.
    const onEventWrapped = (ev) => {
      this.onEvent(ev);
      if (ev && ev.type === 'liveEnded' && ev.streamer === username) this._handleDisconnected(username);
    };
    try {
      const handle = await provider.connect(username, { onEvent: onEventWrapped });
      breaker.onSuccess();
      this.attempts.delete(username);
      this.active.set(username, { disconnect: handle.disconnect, providerName: provider.name });
      this.log('info', 'connected', { username, provider: provider.name });
    } catch (err) {
      const cls = provider.classify(err);
      this._handleFailure(username, provider, breaker, cls);
    }
  }

  _handleDisconnected(username) {
    const a = this.active.get(username);
    if (!a) return;
    this.active.delete(username);
    this.log('info', 'disconnected', { username, provider: a.providerName });
    if (this.tracked.has(username)) this._scheduleCheck(username, pollDelay(this.pollMin, this.pollMax, this.rng));
  }

  _handleFailure(username, provider, breaker, cls) {
    const kind = cls.kind;
    this.log(kind === 'offline' ? 'info' : 'warn', 'connect_fail', { username, provider: provider.name, kind });

    if (kind === 'offline') {
      this.attempts.delete(username);
      this._scheduleCheck(username, pollDelay(this.pollMin, this.pollMax, this.rng));
      return;
    }
    if (kind === 'permanent') {
      // يوزر غير موجود/جلسة مطلوبة: لا فائدة بإعادة سريعة — نفحص على فترة بعيدة جداً فقط احتياطاً.
      this.attempts.delete(username);
      this._scheduleCheck(username, this.pollMax * 20);
      return;
    }
    if (kind === 'blocked') {
      const ms = cls.retryAfterMs > 0 ? cls.retryAfterMs : undefined;
      breaker.tripWithCooldown(ms || 0);
      // failover فوري للاحتياطي لو متاح، وإلا انتظار فتح القاطع
      this._scheduleCheck(username, 0);
      return;
    }
    // network: تراجع أسّي بعدد المحاولات المتتالية لهذا اليوزر
    const n = (this.attempts.get(username) || 0) + 1;
    this.attempts.set(username, n);
    breaker.onFailure();
    this._scheduleCheck(username, backoffDelay(n, { rng: this.rng }));
  }

  // -------------------------------------------------------------- إغلاق نظيف
  async shutdown() {
    this.stopped = true;
    for (const t of this.timers.values()) this.clearTimer(t);
    this.timers.clear();
    for (const [username, a] of this.active) {
      try { a.disconnect(); } catch (e) { /* best-effort */ }
      this.active.delete(username);
    }
  }

  snapshot() {
    return {
      tracked: this.tracked.size,
      active: this.active.size,
      breakers: Object.fromEntries(Object.entries(this.breakers).map(([k, b]) => [k, b.state])),
    };
  }
}
