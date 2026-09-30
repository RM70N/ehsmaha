'use strict';
// محدّد معدل تكيّفي (Token Bucket + AIMD) لطلبات الاتصال لمزود واحد.
//   - يسمح بـ rate طلب/ثانية بدفعة burst، وبحد أقصى inFlightMax طلب جارٍ.
//   - عند 429: يخفّض المعدل للنصف (حتى minRate) — لأن حد المزود الحقيقي مجهول ويختلف بالخطة.
//   - عند كل نجاح: يرفع المعدل تدريجياً (additive) حتى maxRate، فيتعافى بعد زوال الضغط.
class RateLimiter {
  constructor(opts) {
    const o = Object.assign({ maxRatePerSec: 1.5, minRatePerSec: 0.1, burst: 5, inFlightMax: 4, increasePerSuccess: 0.05, decreaseFactor: 0.5, now: Date.now }, opts || {});
    this.maxRate = o.maxRatePerSec;
    this.minRate = Math.min(o.minRatePerSec, o.maxRatePerSec);
    this.burst = Math.max(1, o.burst);
    this.inFlightMax = Math.max(1, o.inFlightMax);
    this.inc = o.increasePerSuccess;
    this.dec = o.decreaseFactor;
    this.now = o.now;
    this.rate = this.maxRate;
    this.tokens = this.burst;
    this.updatedAt = this.now();
    this.inFlight = 0;
    this.penalties = 0;
  }

  _refill() {
    const t = this.now();
    const dt = Math.max(0, t - this.updatedAt) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + dt * this.rate);
    this.updatedAt = t;
  }

  // ms حتى يتوفر طلب (0 = الآن). لا يستهلك شيئاً.
  waitMs() {
    if (this.inFlight >= this.inFlightMax) return 250; // يُعاد فحصه عند انتهاء طلب (pump) أو بهذا التأخير كحد أقصى
    this._refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil(((1 - this.tokens) / this.rate) * 1000);
  }

  take() {
    this._refill();
    this.tokens -= 1;
    this.inFlight++;
  }

  release() { this.inFlight = Math.max(0, this.inFlight - 1); }

  onSuccess() { this.rate = Math.min(this.maxRate, this.rate + this.inc); }

  onRateLimited() {
    this.penalties++;
    this.rate = Math.max(this.minRate, this.rate * this.dec);
    this.tokens = Math.min(this.tokens, 0); // لا دفعة فورية بعد 429
  }
}

module.exports = { RateLimiter };
