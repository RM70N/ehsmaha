'use strict';
// طابور محدود الحجم لكل قناة (ستريمر): عند الامتلاء نُسقط الأقدم غير الحرج أولاً (like/join)،
// ثم الأقدم مطلقاً إن لزم — لحماية الذاكرة وتقليل التأخير بدل تضخم الطابور بلا حد.
const LOW_PRIORITY_TYPES = new Set(['like', 'join']);

export class BoundedQueue {
  constructor({ maxSize = 500 } = {}) {
    this.maxSize = maxSize;
    this.items = [];
    this.dropped = 0;
  }

  push(item) {
    this.items.push(item);
    while (this.items.length > this.maxSize) {
      let idx = this.items.findIndex((e) => LOW_PRIORITY_TYPES.has(e.type));
      if (idx === -1) idx = 0;
      this.items.splice(idx, 1);
      this.dropped++;
    }
  }

  drain() {
    const out = this.items;
    this.items = [];
    return out;
  }

  get size() { return this.items.length; }
}
