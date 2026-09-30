'use strict';
// عدّادات وقياسات خفيفة (بلا اعتماديات): counters + عيّنات زمنية (آخر N) + gauges عبر دوال.
// تُعرض بـ/health (JSON) و/metrics (صيغة Prometheus النصية).
class Metrics {
  constructor(opts) {
    this.maxSamples = (opts && opts.maxSamples) || 500;
    this.counters = new Map();   // "name{k=v}" -> number
    this.samples = new Map();    // name -> number[]
    this.gauges = new Map();     // name -> () => number
  }

  _key(name, labels) {
    if (!labels) return name;
    const parts = Object.keys(labels).sort().map((k) => k + '="' + String(labels[k]).replace(/"/g, '') + '"');
    return parts.length ? name + '{' + parts.join(',') + '}' : name;
  }

  inc(name, labels, by) {
    const k = this._key(name, labels);
    this.counters.set(k, (this.counters.get(k) || 0) + (by == null ? 1 : by));
  }

  observe(name, value) {
    let arr = this.samples.get(name);
    if (!arr) { arr = []; this.samples.set(name, arr); }
    arr.push(value);
    if (arr.length > this.maxSamples) arr.shift();
  }

  gauge(name, fn) { this.gauges.set(name, fn); }

  static summarize(arr) {
    if (!arr || !arr.length) return { count: 0, avg: 0, p95: 0, max: 0 };
    const sorted = arr.slice().sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    return { count: sorted.length, avg: Math.round(sum / sorted.length), p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))], max: sorted[sorted.length - 1] };
  }

  snapshot() {
    const counters = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const timings = {};
    for (const [k, arr] of this.samples) timings[k] = Metrics.summarize(arr);
    const gauges = {};
    for (const [k, fn] of this.gauges) { try { gauges[k] = fn(); } catch (e) { gauges[k] = null; } }
    return { counters, timings, gauges };
  }

  prometheus() {
    const lines = [];
    for (const [k, v] of this.counters) lines.push('bridge_' + k + ' ' + v);
    for (const [k, arr] of this.samples) {
      const s = Metrics.summarize(arr);
      lines.push('bridge_' + k + '_ms_avg ' + s.avg, 'bridge_' + k + '_ms_p95 ' + s.p95, 'bridge_' + k + '_ms_max ' + s.max, 'bridge_' + k + '_count ' + s.count);
    }
    for (const [k, fn] of this.gauges) { let v = 0; try { v = Number(fn()) || 0; } catch (e) { v = 0; } lines.push('bridge_' + k + ' ' + v); }
    return lines.join('\n') + '\n';
  }
}

module.exports = { Metrics };
