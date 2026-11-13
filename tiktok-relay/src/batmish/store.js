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
