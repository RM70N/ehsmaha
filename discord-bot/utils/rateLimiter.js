'use strict';

// محدِّد معدل بسيط على مستوى المستخدم: أمر واحد كل COMMAND_COOLDOWN_MS لكل مستخدم.
// الأزرار لها مهلة أقصر مستقلة (BUTTON_COOLDOWN_MS) حتى ما يتعطل التنقل بين الصفحات.
// الحالة بالذاكرة فقط — مناسبة لنسخة بوت واحدة (وهذا وضع Render العادي).

class RateLimiter {
  constructor() {
    this.hits = new Map(); // `${bucket}:${userId}` -> آخر وقت سُمح فيه
    // تنظيف دوري حتى ما تكبر الخريطة للأبد مع كثرة المستخدمين
    this.sweeper = setInterval(() => this.sweep(), 60_000);
    this.sweeper.unref();
  }

  /**
   * يفحص ويسجّل محاولة.
   * @returns {{ allowed: boolean, retryAfterMs: number }}
   */
  consume(bucket, userId, windowMs) {
    if (!windowMs || windowMs <= 0) return { allowed: true, retryAfterMs: 0 };
    const key = `${bucket}:${userId}`;
    const now = Date.now();
    const last = this.hits.get(key);
    if (last !== undefined && now - last < windowMs) {
      return { allowed: false, retryAfterMs: windowMs - (now - last) };
    }
    this.hits.set(key, now);
    return { allowed: true, retryAfterMs: 0 };
  }

  sweep(maxAgeMs = 10 * 60_000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, at] of this.hits) if (at < cutoff) this.hits.delete(key);
  }
}

module.exports = new RateLimiter();
module.exports.RateLimiter = RateLimiter;
