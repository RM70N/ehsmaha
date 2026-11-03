'use strict';
// قاطع دائرة لكل مزود (سيرفر توقيع/مفتاح/بروكسي).
//   closed    : يمرّر الطلبات؛ فشل متتالٍ = failureThreshold يفتح القاطع.
//   open      : يرفض الطلبات حتى openUntil (مدة الفتح: retry-after من المزود إن وصل، وإلا cooldownMs).
//   half_open : بعد انتهاء المدة يُسمح بطلب تجريبي واحد؛ نجاحه يُغلق القاطع، وفشله يفتحه من جديد
//               بمدة أطول (تتضاعف حتى maxCooldownMs) حتى لا نغرق مزوداً منهاراً.
class CircuitBreaker {
  constructor(opts) {
    const o = Object.assign({ failureThreshold: 3, cooldownMs: 30000, maxCooldownMs: 300000, now: Date.now }, opts || {});
    this.failureThreshold = o.failureThreshold;
    this.baseCooldownMs = o.cooldownMs;
    this.maxCooldownMs = o.maxCooldownMs;
    this.now = o.now;
    this.failures = 0;
    this.openUntil = 0;
    this.trips = 0;          // عدد مرات الفتح المتتالية (يضاعف المدة)
    this.probing = false;    // طلب تجريبي جارٍ بحالة half_open
    this.lastTripAt = 0;
  }

  get state() {
    if (this.openUntil === 0) return 'closed';
    return this.now() < this.openUntil ? 'open' : 'half_open';
  }

  // ms حتى يسمح القاطع بطلب (0 = الآن).
  waitMs() {
    const s = this.state;
    if (s === 'closed') return 0;
    if (s === 'open') return this.openUntil - this.now();
    return this.probing ? 1000 : 0; // half_open: طلب تجريبي واحد فقط بنفس الوقت
  }

  canRequest() { return this.waitMs() === 0; }

  // يُستدعى عند بدء الطلب؛ يعلّم الطلب التجريبي.
  onDispatch() { if (this.state === 'half_open') this.probing = true; }

  onSuccess() {
    this.failures = 0;
    this.openUntil = 0;
    this.trips = 0;
    this.probing = false;
  }

  // فشل عادي (5xx/انقطاع/رفض توقيع). يفتح القاطع عند بلوغ العتبة، أو فوراً لو كان الطلب تجريبياً.
  onFailure() {
    const wasProbe = this.state === 'half_open';
    this.probing = false;
    this.failures++;
    if (wasProbe || this.failures >= this.failureThreshold) this._trip(0);
  }

  // فتح فوري بمدة يحددها المزود (429 مع retry-after). uncapped=true لمدة أطول من maxCooldownMs
  // (مثل رفض المفتاح 402: إعادة المحاولة كل 5 دقائق عبث، فنتركه ساكتاً فترة أطول).
  trip(ms, uncapped) {
    this.probing = false;
    this.failures = Math.max(this.failures, this.failureThreshold);
    this._trip(ms, uncapped);
  }

  _trip(explicitMs, uncapped) {
    this.trips++;
    const escalated = Math.min(this.maxCooldownMs, this.baseCooldownMs * Math.pow(2, Math.max(0, this.trips - 1)));
    const cap = uncapped ? Infinity : this.maxCooldownMs;
    const ms = explicitMs > 0 ? Math.min(Math.max(explicitMs, 1000), cap) : escalated;
    this.openUntil = this.now() + ms;
    this.lastTripAt = this.now();
  }
}

module.exports = { CircuitBreaker };
