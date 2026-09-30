'use strict';
// ساعة ومؤقتات وهمية: تقدّم الوقت يدوياً بدون انتظار حقيقي.
class FakeClock {
  constructor() { this.t = 1000000; this.timers = []; this.seq = 0; }
  now = () => this.t;
  setTimer = (fn, ms) => { const h = { id: ++this.seq, at: this.t + ms, fn, unref() {} }; this.timers.push(h); return h; };
  clearTimer = (h) => { this.timers = this.timers.filter((x) => x !== h); };
  // يقدّم الوقت ms ويُنفّذ المؤقتات المستحقة بالترتيب، مع إفراغ الوعود بين كل خطوة.
  async advance(ms) {
    const end = this.t + ms;
    for (;;) {
      await flush();
      const next = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x !== next);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = end;
    await flush();
  }
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); await new Promise((r) => setImmediate(r)); };
module.exports = { FakeClock, flush };
