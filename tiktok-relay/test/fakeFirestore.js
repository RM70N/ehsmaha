'use strict';
// محاكاة طفيفة لواجهة Firestore Admin المستخدمة في src/linking.js فقط (للاختبار، بلا شبكة).
export class FakeFirestore {
  constructor() {
    this.store = new Map(); // "collection/doc" -> data
  }

  collection(name) {
    const self = this;
    return {
      doc(id) {
        const key = name + '/' + id;
        return {
          id,
          __key: key,
          async get() {
            const data = self.store.get(key);
            return { exists: data !== undefined, data: () => data };
          },
        };
      },
      async get() {
        const docs = [];
        for (const [key, data] of self.store) {
          if (key.startsWith(name + '/')) docs.push({ id: key.slice(name.length + 1), data: () => data });
        }
        return { docs };
      },
    };
  }

  async runTransaction(fn) {
    // محاكاة كافية لاختبارات الوحدة: قراءة/كتابة متزامنة (Node أحادي الخيط، لا تزامن فعلي هنا).
    const self = this;
    const tx = {
      async get(ref) { return ref.get(); },
      set(ref, data, opts) {
        const key = ref.id; // سنعيد بناء المفتاح من doc().id + أسماء المجموعة؛ أبسط: خزّن عبر ref نفسه
        self._write(ref, data, opts);
      },
      delete(ref) { self._delete(ref); },
    };
    return fn(tx);
  }

  _write(ref, data, opts) {
    const key = ref.__key;
    if (opts && opts.merge) {
      const prev = this.store.get(key) || {};
      this.store.set(key, { ...prev, ...data });
    } else {
      this.store.set(key, data);
    }
  }

  _delete(ref) {
    this.store.delete(ref.__key);
  }
}
