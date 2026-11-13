'use strict';
// تخزين إعدادات BATMISH. المفتاح دائماً uid الموثَّق من التوكن (لا يصل من الواجهة) → عزل تام بين الحسابات.
// FirestoreStore: batmish/{uid} (مستند واحد لكل ستريمر) + batmishAccess/streamer (تثبيت هوية _zvd4).

export class MemoryStore {
  constructor() { this.docs = new Map(); this.pin = null; }
  async load(uid) { const d = this.docs.get(uid); return d ? JSON.parse(JSON.stringify(d)) : null; }
  async save(uid, doc) { this.docs.set(uid, JSON.parse(JSON.stringify(doc))); }
  async getPin() { return this.pin; }
  async setPin(pin) { this.pin = pin ? { ...pin } : null; }
}

export class FirestoreStore {
  constructor(db) { this.db = db; }
  async load(uid) {
    const s = await this.db.collection('batmish').doc(uid).get();
    return s.exists ? s.data() : null;
  }
  async save(uid, doc) { await this.db.collection('batmish').doc(uid).set(doc); }
  async getPin() {
    const s = await this.db.collection('batmishAccess').doc('streamer').get();
    return s.exists ? s.data() : null;
  }
  async setPin(pin) {
    const ref = this.db.collection('batmishAccess').doc('streamer');
    if (!pin) await ref.delete(); else await ref.set(pin);
  }
}
