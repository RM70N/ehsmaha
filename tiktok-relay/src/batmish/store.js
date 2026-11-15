'use strict';
// تخزين إعدادات BATMISH. المفتاح دائماً uid الموثَّق من التوكن (لا يصل من الواجهة) → عزل تام بين الحسابات.
// FirestoreStore: batmish/{uid} (مستند واحد لكل ستريمر) + batmishAccess/streamer (تثبيت هوية _zvd4).

// _zvd4 يحتفظ بمستند التثبيت القديم 'streamer' (لا ترحيل)؛ غيره 'streamer_<id>'.
const pinDoc = (sid) => (sid === '_zvd4' ? 'streamer' : 'streamer_' + sid);

export class MemoryStore {
  constructor() { this.docs = new Map(); this.pin = null; }
  async load(uid) { const d = this.docs.get(uid); return d ? JSON.parse(JSON.stringify(d)) : null; }
  async save(uid, doc) { this.docs.set(uid, JSON.parse(JSON.stringify(doc))); }
  async getPin(sid = '_zvd4') { const p = this.pins && this.pins[sid]; return p || null; }
  async setPin(pin, sid = '_zvd4') { this.pins = this.pins || {}; if (pin) this.pins[sid] = { ...pin }; else delete this.pins[sid]; }
}

export class FirestoreStore {
  constructor(db) { this.db = db; }
  async load(uid) {
    const s = await this.db.collection('batmish').doc(uid).get();
    return s.exists ? s.data() : null;
  }
  async save(uid, doc) { await this.db.collection('batmish').doc(uid).set(doc); }
  async getPin(sid = '_zvd4') {
    const s = await this.db.collection('batmishAccess').doc(pinDoc(sid)).get();
    return s.exists ? s.data() : null;
  }
  async setPin(pin, sid = '_zvd4') {
    const ref = this.db.collection('batmishAccess').doc(pinDoc(sid));
    if (!pin) await ref.delete(); else await ref.set(pin);
  }
}

// تخزين مرن: Firestore هو الأساس، وRealtime Database مرآة احتياطية (نص JSON واحد لكل uid لتفادي قيود مفاتيح RTDB).
// السبب: حصة Firestore قد تنفد (حدث سابقاً) فتفشل قراءة /batmish/bootstrap بـ500. هنا القراءة والكتابة تنجحان إن نجح أحد المخزنين.
// عند توفر الاثنين تُعتمد النسخة الأحدث (بحسب updatedAt) حتى لا ترجع بيانات قديمة بعد تعافي Firestore.
// Firestore عند نفاد الحصة قد «يعلّق» ويعيد المحاولة لدقائق بدل أن يرمي خطأ فوراً → كل عملية لها مهلة قصيرة.
const withTimeout = (p, ms, what) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout:' + what)), ms);
  Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
});
const OP_TIMEOUT_MS = 3500;

export class ResilientStore {
  constructor({ db, rtdb, log = () => {}, timeoutMs = OP_TIMEOUT_MS }) { this.fs = new FirestoreStore(db); this.rtdb = rtdb; this.log = log; this.ms = timeoutMs; }
  async _rtGet(path) { const s = await this.rtdb.ref(path).get(); if (!s.exists()) return null; const v = s.val(); try { return JSON.parse(v.json); } catch (e) { return null; } }
  async _rtSet(path, val) { if (val == null) await this.rtdb.ref(path).remove(); else await this.rtdb.ref(path).set({ json: JSON.stringify(val), at: Date.now() }); }
  async _both(fsFn, rtFn, what) {
    const [a, b] = await Promise.allSettled([withTimeout(fsFn(), this.ms, 'fs'), withTimeout(rtFn(), this.ms, 'rtdb')]);
    if (a.status === 'rejected') this.log('warn', 'batmish_fs_failed', { what, message: a.reason && a.reason.message });
    if (b.status === 'rejected') this.log('warn', 'batmish_rtdb_failed', { what, message: b.reason && b.reason.message });
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
    return [a.status === 'fulfilled' ? a.value : undefined, b.status === 'fulfilled' ? b.value : undefined];
  }
  async load(uid) {
    const [f, r] = await this._both(() => this.fs.load(uid), () => this._rtGet('batmishDocs/' + uid), 'load');
    if (f && r) return (r.updatedAt || 0) > (f.updatedAt || 0) ? r : f;
    return f || r || null;
  }
  // الحفظ ينجح بأول مخزن ينجح (لا ننتظر المخزن البطيء)؛ الآخر يكمل بالخلفية ويُسجَّل فشله فقط.
  async save(uid, doc) {
    const one = (p, tag) => withTimeout(p, 20000, tag).then(() => tag, (e) => { this.log('warn', 'batmish_' + tag + '_save_failed', { message: e && e.message }); throw e; });
    const ps = [one(this.fs.save(uid, doc), 'fs'), one(this._rtSet('batmishDocs/' + uid, doc), 'rtdb')];
    ps.forEach((p) => p.catch(() => {}));
    await Promise.any(ps).catch((e) => { throw (e && e.errors && e.errors[0]) || e; });
  }
  async getPin(sid = '_zvd4') {
    const [f, r] = await this._both(() => this.fs.getPin(sid), () => this._rtGet('batmishPins/' + sid), 'getPin');
    if (f && r) return (r.at || 0) > (f.at || 0) ? r : f;
    return f || r || null;
  }
  async setPin(pin, sid = '_zvd4') {
    const ps = [withTimeout(this.fs.setPin(pin, sid), 20000, 'fs'), withTimeout(this._rtSet('batmishPins/' + sid, pin), 20000, 'rtdb')];
    ps.forEach((p) => p.catch(() => {}));
    await Promise.any(ps).catch((e) => { throw (e && e.errors && e.errors[0]) || e; });
  }
}

// يعيد استخدام نفس التخزين (Firestore/RTDB/ذاكرة) بمفتاح مسبوق ببادئة: لا نظام تخزين موازٍ.
export class PrefixedStore {
  constructor(inner, prefix) { this.inner = inner; this.prefix = prefix; }
  load(uid) { return this.inner.load(this.prefix + uid); }
  save(uid, doc) { return this.inner.save(this.prefix + uid, doc); }
}
