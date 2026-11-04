'use strict';
// محدّد معدل عام (Token Bucket) — يمر عبره كل فحص دوري وكل محاولة اتصال، لتفادي حظر المزوّد
// بكثرة الطلبات. منفصل عن قاطع الدائرة (CircuitBreaker): هذا يحكم السرعة الكلية، وذاك يحكم
// صحة مزوّد بعينه.
export class TokenBucketRateLimiter {
  constructor({ ratePerSec = 2, burst = 5, now = Date.now } = {}) {
    this.rate = ratePerSec;
    this.burst = Math.max(1, burst);
    this.tokens = this.burst;
    this.now = now;
    this.updatedAt = this.now();
  }

  _refill() {
    const t = this.now();
    const dt = Math.max(0, t - this.updatedAt) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + dt * this.rate);
    this.updatedAt = t;
  }

  // true لو توفر رمز الآن ويُستهلك فوراً (non-blocking) — المستدعي يعيد المحاولة لاحقاً لو false.
  tryTake() {
    this._refill();
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  // ms حتى يتوفر رمز (0 = الآن). لا يستهلك شيئاً.
  waitMs() {
    this._refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000);
  }
}
