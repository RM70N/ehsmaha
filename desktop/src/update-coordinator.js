'use strict';

/**
 * ينسّق تطبيق تحديث المحتوى بأمان:
 *  - إن وُجد إصدار جاهز (pending) ولا شيء نشط → يطبّقه فوراً بإعادة تحميل هادئة.
 *  - إن كانت هناك جولة/بث/لعبة → لا يلمس الصفحة؛ يعرض Toast واحداً ويعيد الفحص
 *    كل بضع ثوانٍ، ويطبّق عند أول عودة للخمول أو بموافقة المستخدم الصريحة.
 *  - بعد التطبيق: فحص صحة للصفحة؛ فشل ⇒ rollback تلقائي للإصدار السابق.
 *
 * كل الاعتماديات (probe/reload/toast/server) تُحقن لتسهيل الاختبار.
 */

const { classify } = require('./safe-point');

const DEFER_TOAST = 'وصل تحديث جديد لأحسمها، بيصير جاهز بعد الجولة';

class UpdateCoordinator {
  /**
   * @param {object} d
   * @param {import('./content-store').ContentStore} d.store
   * @param {() => Promise<object|null>} d.probe     يرجع لقطة الصفحة
   * @param {(dir:string) => void} d.setServeDir
   * @param {() => Promise<boolean>} d.reloadAndCheck يعيد تحميل الصفحة ويرجع true إن سلمت
   * @param {(msg:string, kind?:string) => void} d.toast
   * @param {(m:string)=>void} [d.log]
   * @param {number} [d.pollMs]
   */
  constructor(d) {
    Object.assign(this, { log: () => {}, pollMs: 8000 }, d);
    this.timer = null;
    this.toastShown = false;
    this.applying = false;
    this.listeners = new Set();
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(ev) { for (const fn of this.listeners) { try { fn(ev); } catch (e) { /* */ } } }

  hasPending() { return this.store.hasPending(); }

  async isIdle() {
    let snap = null;
    try { snap = await this.probe(); } catch (e) { snap = null; }
    return classify(snap);
  }

  /** يُستدعى بعد تجهيز إصدار جديد أو عند الإقلاع/تغير الصفحة. */
  async consider() {
    if (this.applying || !this.hasPending()) { this._stopPoll(); return { action: 'none' }; }
    const idle = await this.isIdle();
    if (idle.idle) return this.applyNow('auto');
    if (!this.toastShown) {
      this.toastShown = true;
      this.toast(DEFER_TOAST, 'info');
      this._emit({ type: 'deferred', reason: idle.reason });
    }
    this._startPoll();
    return { action: 'deferred', reason: idle.reason };
  }

  /** تطبيق فوري بموافقة المستخدم (يتجاوز فحص الخمول). */
  async applyByConsent() { return this.applyNow('consent'); }

  _startPoll() {
    if (this.timer) return;
    this.timer = setInterval(() => { this.consider().catch(() => {}); }, this.pollMs);
    if (this.timer.unref) this.timer.unref();
  }
  _stopPoll() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }

  async applyNow(trigger) {
    if (this.applying) return { action: 'busy' };
    this.applying = true;
    this._stopPoll();
    try {
      const prevVersion = this.store.activeVersion();
      const resolved = this.store.promotePending();
      if (!resolved) return { action: 'none' };
      this.setServeDir(resolved.dir);
      this.toastShown = false;
      let ok = false;
      try { ok = await this.reloadAndCheck(); } catch (e) { ok = false; }
      if (!ok) {
        this.log('فشل الإصدار الجديد ' + resolved.version + ' — تراجع إلى ' + prevVersion);
        const back = this.store.rollback('health-check-failed');
        this.setServeDir(back.dir);
        try { await this.reloadAndCheck(); } catch (e) { /* */ }
        this.toast('تعذّر تطبيق التحديث، رجعنا للنسخة السابقة', 'error');
        this._emit({ type: 'rolled-back', from: resolved.version, to: back.version });
        return { action: 'rolled-back', version: back.version };
      }
      this.toast('تم تحديث أحسمها', 'success');
      this._emit({ type: 'applied', version: resolved.version, trigger });
      return { action: 'applied', version: resolved.version, trigger };
    } finally {
      this.applying = false;
    }
  }

  /** عند الإقلاع: إصدار جاهز + لا صفحة بعد = تطبيق مباشر بلا إعادة تحميل (الصفحة لم تُحمَّل). */
  promoteAtBoot() {
    if (!this.store.hasPending()) return null;
    const r = this.store.promotePending();
    return r;
  }

  dispose() { this._stopPoll(); this.listeners.clear(); }
}

module.exports = { UpdateCoordinator, DEFER_TOAST };
