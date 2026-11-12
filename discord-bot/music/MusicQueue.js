'use strict';

// قائمة تشغيل سيرفر واحد (منطق صرف بدون ديسكورد/صوت — سهل الاختبار).
// الأوضاع: normal · repeatTrack (تكرار الأغنية) · repeatQueue (إعادة القائمة) · shuffle (عشوائي).

const MODES = Object.freeze(['normal', 'repeatTrack', 'repeatQueue', 'shuffle']);

class QueueError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // FULL | DUPLICATE
  }
}

const keyOf = (t) => `${t.source}:${t.id}`;

class MusicQueue {
  constructor({ maxSize = 50, duplicateWindowMs = 30_000, now = Date.now, random = Math.random } = {}) {
    this.maxSize = maxSize;
    this.duplicateWindowMs = duplicateWindowMs;
    this.now = now;
    this.random = random;
    this.current = null; // الأغنية الجارية (ليست ضمن upcoming)
    this.upcoming = [];
    this.played = []; // اللي انتهت — تُستخدم عند repeatQueue
    this.mode = 'normal';
    this.recent = new Map(); // key -> وقت آخر إضافة
  }

  get size() {
    return this.upcoming.length;
  }

  setMode(mode) {
    if (!MODES.includes(mode)) throw new Error(`وضع غير معروف: ${mode}`);
    this.mode = mode;
    return this.mode;
  }

  // يبدّل وضعاً (نفس الوضع مرة ثانية = رجوع لـnormal)
  toggleMode(mode) {
    return this.setMode(this.mode === mode ? 'normal' : mode);
  }

  add(track) {
    const t = this.now();
    for (const [k, at] of this.recent) if (t - at > Math.max(this.duplicateWindowMs, 1)) this.recent.delete(k);
    const key = keyOf(track);
    if (this.duplicateWindowMs > 0 && this.recent.has(key)) {
      throw new QueueError('DUPLICATE', 'الأغنية انطلبت قبل قليل');
    }
    if (this.upcoming.length >= this.maxSize) throw new QueueError('FULL', `قائمة الانتظار ممتلئة (${this.maxSize})`);
    this.upcoming.push(track);
    this.recent.set(key, t);
    return this.upcoming.length;
  }

  // أغنية تبدأ مباشرة (قائمة فاضية)
  setCurrent(track) {
    this.current = track;
    this.recent.set(keyOf(track), this.now());
  }

  /**
   * ينقل للأغنية التالية.
   * @param {{manual?: boolean}} opts manual=تخطي يدوي (ما يكرر الأغنية حتى لو وضع repeatTrack)
   * @returns {object|null} الأغنية الجديدة أو null لو انتهت القائمة
   */
  advance({ manual = false } = {}) {
    const prev = this.current;
    if (prev && this.mode === 'repeatTrack' && !manual) return prev;
    if (prev) this.played.push(prev);
    this.current = null;
    if (this.mode === 'repeatQueue' && this.upcoming.length === 0 && this.played.length) {
      this.upcoming = this.played.splice(0, this.played.length);
    }
    if (!this.upcoming.length) return null;
    const idx = this.mode === 'shuffle' ? Math.floor(this.random() * this.upcoming.length) : 0;
    this.current = this.upcoming.splice(idx, 1)[0];
    return this.current;
  }

  // الأغنية القادمة المعروفة (بالعشوائي ما نعرف)
  peekNext() {
    if (this.mode === 'shuffle') return null;
    if (this.mode === 'repeatTrack' && this.current) return this.current;
    if (this.upcoming.length) return this.upcoming[0];
    if (this.mode === 'repeatQueue') return this.played[0] || this.current || null;
    return null;
  }

  remove(index) {
    if (!Number.isInteger(index) || index < 0 || index >= this.upcoming.length) return null;
    return this.upcoming.splice(index, 1)[0];
  }

  clear() {
    const n = this.upcoming.length;
    this.upcoming = [];
    this.played = [];
    return n;
  }

  totalSeconds() {
    return this.upcoming.reduce((s, t) => s + (t.duration || 0), 0);
  }
}

module.exports = { MusicQueue, QueueError, MODES, keyOf };
