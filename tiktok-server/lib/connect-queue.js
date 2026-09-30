'use strict';
// طابور اتصال مركزي: كل محاولة اتصال بتيك توك (أول اتصال أو إعادة اتصال) تمر من هنا.
//   - الطلبات الزائدة تنتظر بالطابور ولا تفشل؛ المعدل والتزامن يحكمهما محدّد كل مزود (ProviderPool).
//   - dedupe: طلب واحد فقط لكل مفتاح (غرفة) — طلب مكرر يعيد نفس الوعد.
//   - أولوية: 0 = إعادة اتصال لغرفة كانت متصلة (ستريمر بالبث الآن)، 1 = اتصال جديد. FIFO داخل كل أولوية.
//   - front: إعادة المحاولة الفورية بمزود بديل تقفز أمام الجميع (لا تعيد صفها).
//   - cancel(key): غرفة أُغلقت وهي بالانتظار لا تستهلك طلب توقيع.
class ConnectQueue {
  constructor(pool, opts) {
    const o = Object.assign({ now: Date.now, setTimer: setTimeout, clearTimer: clearTimeout, onDispatch: null, onSettle: null }, opts || {});
    this.pool = pool;
    this.now = o.now;
    this.setTimer = o.setTimer;
    this.clearTimer = o.clearTimer;
    this.onDispatch = o.onDispatch; // (entry, waitedMs, provider)
    this.onSettle = o.onSettle;     // (entry, outcome, provider, tookMs, info{opened,recovered,cooldownMs})
    this.waiting = [];              // entries (مرتبة)
    this.running = new Map();       // key -> entry
    this.timer = null;
    this.seq = 0;
    this.stopped = false;
    this.pumping = false;
  }

  // dispatch(provider) -> Promise<outcome>. الناتج: وعد بـ {outcome, provider} أو {cancelled:true}.
  request(key, { dispatch, priority = 1, exclude = null, front = false } = {}) {
    const existing = this.running.get(key) || this.waiting.find((e) => e.key === key);
    if (existing) return existing.promise;
    const entry = { key, dispatch, priority: front ? -1 : priority, exclude: exclude ? new Set(exclude) : new Set(), enqueuedAt: this.now(), seq: ++this.seq };
    entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
    this.waiting.push(entry);
    this.waiting.sort((a, b) => (a.priority - b.priority) || (a.seq - b.seq));
    this.pump();
    return entry.promise;
  }

  cancel(key) {
    const i = this.waiting.findIndex((e) => e.key === key);
    if (i === -1) return false;
    const [entry] = this.waiting.splice(i, 1);
    entry.resolve({ cancelled: true });
    this.pump();
    return true;
  }

  // موقع الغرفة بالانتظار (1 = التالية)، 0 = تعمل الآن أو غير موجودة.
  position(key) {
    const i = this.waiting.findIndex((e) => e.key === key);
    return i === -1 ? 0 : i + 1;
  }

  has(key) { return this.running.has(key) || this.waiting.some((e) => e.key === key); }

  stats() {
    const t = this.now();
    return {
      waiting: this.waiting.length,
      running: this.running.size,
      oldestWaitMs: this.waiting.length ? t - Math.min(...this.waiting.map((e) => e.enqueuedAt)) : 0,
    };
  }

  stop() {
    this.stopped = true;
    if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
    this.waiting.splice(0).forEach((e) => e.resolve({ cancelled: true }));
  }

  pump() {
    if (this.stopped || this.pumping) return;
    this.pumping = true;
    try {
      if (this.timer) { this.clearTimer(this.timer); this.timer = null; }
      let wake = Infinity;
      for (let i = 0; i < this.waiting.length;) {
        const entry = this.waiting[i];
        const r = this.pool.pick(entry.exclude);
        if (r.provider) {
          this.waiting.splice(i, 1);
          this._run(entry, r.provider);
          continue; // نفس الفهرس صار للعنصر التالي
        }
        if (r.waitMs == null) { entry.exclude.clear(); continue; } // كل المزودين مستبعدون: نبدأ جولة جديدة
        wake = Math.min(wake, r.waitMs);
        i++;
      }
      if (this.waiting.length && Number.isFinite(wake)) {
        this.timer = this.setTimer(() => { this.timer = null; this.pump(); }, Math.max(20, wake));
        if (this.timer && this.timer.unref) this.timer.unref();
      }
    } finally {
      this.pumping = false;
    }
  }

  _run(entry, provider) {
    const startedAt = this.now();
    this.pool.begin(provider);
    this.running.set(entry.key, entry);
    if (this.onDispatch) { try { this.onDispatch(entry, startedAt - entry.enqueuedAt, provider); } catch (e) { /* metrics فقط */ } }
    let p;
    try { p = Promise.resolve(entry.dispatch(provider)); } catch (e) { p = Promise.reject(e); }
    p.catch((e) => ({ kind: 'transient', error: e })).then((outcome) => {
      this.running.delete(entry.key);
      const info = this.pool.end(provider, outcome);
      if (this.onSettle) { try { this.onSettle(entry, outcome, provider, this.now() - startedAt, info); } catch (e) { /* metrics فقط */ } }
      entry.resolve({ outcome, provider });
      this.pump();
    });
  }
}

module.exports = { ConnectQueue };
