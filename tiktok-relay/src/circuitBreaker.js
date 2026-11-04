'use strict';
// قاطع دائرة لكل مزوّد: فشل متتالٍ يفتح القاطع فترة (تتضاعف مع تكرار الفتح)، وبعدها طلب
// تجريبي واحد (half_open) يقرر: ينجح فيُغلق، يفشل فيفتح من جديد بمدة أطول.
export class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 30000, maxCooldownMs = 300000, now = Date.now } = {}) {
    this.failureThreshold = failureThreshold;
    this.baseCooldownMs = cooldownMs;
    this.maxCooldownMs = maxCooldownMs;
    this.now = now;
    this.failures = 0;
    this.openUntil = 0;
    this.trips = 0;
    this.probing = false;
  }

  get state() {
    if (this.openUntil === 0) return 'closed';
    return this.now() < this.openUntil ? 'open' : 'half_open';
  }

  canRequest() {
    const s = this.state;
    if (s === 'closed') return true;
    if (s === 'open') return false;
    return !this.probing; // half_open: طلب تجريبي واحد فقط
  }

  onDispatch() {
    if (this.state === 'half_open') this.probing = true;
  }

  onSuccess() {
    this.failures = 0;
    this.openUntil = 0;
    this.trips = 0;
    this.probing = false;
  }

  onFailure() {
    const wasProbe = this.state === 'half_open';
    this.probing = false;
    this.failures++;
    if (wasProbe || this.failures >= this.failureThreshold) this._trip();
  }

  // فتح فوري بمدة محددة (حظر/معدّل صريح من المزوّد)
  tripWithCooldown(ms) {
    this.probing = false;
    this.failures = Math.max(this.failures, this.failureThreshold);
    this._trip(ms);
  }

  _trip(explicitMs) {
    this.trips++;
    const escalated = Math.min(this.maxCooldownMs, this.baseCooldownMs * Math.pow(2, Math.max(0, this.trips - 1)));
    const ms = explicitMs > 0 ? explicitMs : escalated;
    this.openUntil = this.now() + ms;
  }

  waitMs() {
    const s = this.state;
    if (s === 'closed') return 0;
    if (s === 'open') return this.openUntil - this.now();
    return 0;
  }
}
