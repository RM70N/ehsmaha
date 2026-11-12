// Firestore + Realtime Database وهميان بالذاكرة (لاختبار fs-failover.js)
export class FakeTimestamp {
  constructor(ms) { this.ms = ms; this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; }
  toMillis() { return this.ms; }
  toDate() { return new Date(this.ms); }
  static fromMillis(ms) { return new FakeTimestamp(ms); }
}

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (k, x) => (x instanceof FakeTimestamp ? { __T: x.ms } : x)), (k, x) => (x && typeof x === 'object' && '__T' in x ? new FakeTimestamp(x.__T) : x)));

export function makeFakeFirestore() {
  const S = { docs: new Map(), quota: false, reads: 0, writes: 0, listeners: new Set(), down: false };
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const guard = () => {
    if (S.quota) throw err('resource-exhausted', 'Quota exceeded.');
    if (S.down) throw err('unavailable', 'offline');
  };
  const sent = (m, extra) => Object.assign({ _methodName: m }, extra);
  const isS = (v) => v && typeof v === 'object' && v._methodName;
  function res(v, cur, now) {
    if (isS(v)) {
      if (v._methodName === 'serverTimestamp') return new FakeTimestamp(now);
      if (v._methodName === 'increment') return (typeof cur === 'number' ? cur : 0) + v.n;
      if (v._methodName === 'arrayUnion') { const b = Array.isArray(cur) ? cur.slice() : []; v.els.forEach((e) => { if (!b.some((x) => JSON.stringify(x) === JSON.stringify(e))) b.push(e); }); return b; }
      if (v._methodName === 'arrayRemove') return (Array.isArray(cur) ? cur : []).filter((x) => !v.els.some((e) => JSON.stringify(e) === JSON.stringify(x)));
      if (v._methodName === 'deleteField') return undefined;
    }
    if (v instanceof FakeTimestamp) return v;
    if (Array.isArray(v)) return v.map((x) => res(x, undefined, now));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const r = res(v[k], cur && cur[k], now); if (r !== undefined) o[k] = r; } return o; }
    return v;
  }
  function merge(cur, d, now) {
    const o = Object.assign({}, cur || {});
    for (const k of Object.keys(d)) {
      const v = d[k];
      if (v && typeof v === 'object' && !isS(v) && !Array.isArray(v) && !(v instanceof FakeTimestamp)) o[k] = merge(o[k], v, now);
      else { const r = res(v, o[k], now); if (r === undefined) delete o[k]; else o[k] = r; }
    }
    return o;
  }
  function setIn(o, parts, val) { let x = o; for (let i = 0; i < parts.length - 1; i++) { if (!x[parts[i]] || typeof x[parts[i]] !== 'object') x[parts[i]] = {}; x = x[parts[i]]; } if (val === undefined) delete x[parts[parts.length - 1]]; else x[parts[parts.length - 1]] = val; }
  function getIn(o, parts) { let x = o; for (const p of parts) { if (x == null) return undefined; x = x[p]; } return x; }
  const mkSnap = (path) => {
    const d = S.docs.get(path);
    return { id: path.split('/').pop(), exists: () => !!d, data: () => (d ? clone(d) : undefined), ref: { type: 'document', path, id: path.split('/').pop() }, metadata: { fromCache: false, hasPendingWrites: false } };
  };
  const inCol = (colPath) => [...S.docs.keys()].filter((p) => p.startsWith(colPath + '/') && p.split('/').length === colPath.split('/').length + 1);
  const wmatch = (d, [f, op, v]) => { const x = getIn(d, f.split('.')); const nx = x instanceof FakeTimestamp ? x.ms : x; if (op === '==') return JSON.stringify(nx) === JSON.stringify(v); if (op === '>') return nx > v; if (op === '<') return nx < v; if (op === 'array-contains') return Array.isArray(nx) && nx.includes(v); if (op === 'in') return v.includes(nx); return false; };
  const mkQ = (target) => {
    const path = target.path; const ws = (target._w || []);
    const ids = inCol(path).filter((p) => ws.every((w) => wmatch(S.docs.get(p), w)));
    const docs = ids.map(mkSnap);
    return { docs, size: docs.length, empty: !docs.length, forEach: (cb) => docs.forEach(cb), docChanges: () => [] };
  };
  const notify = () => { S.listeners.forEach((l) => l.fire()); };

  const api = {
    doc: (db, ...segs) => { const path = segs.join('/'); return { type: 'document', path, id: path.split('/').pop() }; },
    collection: (db, ...segs) => ({ type: 'collection', path: segs.join('/') }),
    where: (f, op, v) => ({ _w: [f, op, v] }),
    query: (col, ...cs) => ({ type: 'query', path: col.path, _w: cs.map((c) => c._w) }),
    serverTimestamp: () => sent('serverTimestamp'),
    increment: (n) => sent('increment', { n }),
    arrayUnion: (...els) => sent('arrayUnion', { els }),
    arrayRemove: (...els) => sent('arrayRemove', { els }),
    deleteField: () => sent('deleteField'),
    getDoc: async (ref) => { guard(); S.reads++; return mkSnap(ref.path); },
    getDocFromServer: async (ref) => { guard(); S.reads++; return mkSnap(ref.path); },
    getDocs: async (t) => { guard(); S.reads++; return mkQ(t); },
    getCountFromServer: async (t) => { guard(); return { data: () => ({ count: mkQ(t).size }) }; },
    setDoc: async (ref, data, opts) => {
      guard(); S.writes++;
      const now = Date.now();
      S.docs.set(ref.path, opts && opts.merge ? merge(S.docs.get(ref.path), data, now) : res(data, undefined, now));
      notify();
    },
    updateDoc: async (ref, data) => {
      guard(); S.writes++;
      const cur = S.docs.get(ref.path);
      if (!cur) throw err('not-found', 'No document to update');
      const o = clone(cur);
      for (const k of Object.keys(data)) setIn(o, k.split('.'), res(data[k], getIn(o, k.split('.')), Date.now()));
      S.docs.set(ref.path, o); notify();
    },
    deleteDoc: async (ref) => { guard(); S.writes++; S.docs.delete(ref.path); notify(); },
    runTransaction: async (db, fn) => {
      guard();
      const writes = [];
      const tx = {
        get: async (ref) => mkSnap(ref.path),
        set: (ref, data, o) => { writes.push(['set', ref, data, o]); return tx; },
        update: (ref, data) => { writes.push(['update', ref, data]); return tx; },
        delete: (ref) => { writes.push(['delete', ref]); return tx; }
      };
      const r = await fn(tx);
      for (const w of writes) await api[w[0] === 'set' ? 'setDoc' : w[0] === 'update' ? 'updateDoc' : 'deleteDoc'](w[1], w[2], w[3]);
      return r;
    },
    onSnapshot: (target, next, errCb) => {
      const l = {
        fire: () => {
          try { guard(); } catch (e) { S.listeners.delete(l); errCb && errCb(e); return; }
          next(target.type === 'document' ? mkSnap(target.path) : mkQ(target));
        }
      };
      S.listeners.add(l);
      queueMicrotask(() => l.fire());
      return () => S.listeners.delete(l);
    }
  };
  return { api, S };
}

export function makeFakeRtdb() {
  const R = { tree: {}, watchers: new Set(), connected: true };
  const parts = (p) => String(p).split('/').filter(Boolean);
  const canon = (v) => { // نفس سلوك RTDB: لا null ولا كائنات فارغة
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) { const a = v.map((x) => canon(x)); return a.every((x) => x === null) ? null : a; }
    if (typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { const c = canon(v[k]); if (c !== null) o[k] = c; } return Object.keys(o).length ? o : null; }
    return v;
  };
  const bad = (k) => /[.$#\[\]\/]/.test(k);
  const checkKeys = (v) => { if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (!Array.isArray(v) && bad(k)) throw new Error('Invalid key ' + k); checkKeys(v[k]); } };
  const get = (p) => { let x = R.tree; for (const s of parts(p)) { if (x == null || typeof x !== 'object') return null; x = x[s]; } return x === undefined ? null : x; };
  const put = (p, v) => {
    checkKeys(v);
    const ps = parts(p); let x = R.tree;
    for (let i = 0; i < ps.length - 1; i++) { if (x[ps[i]] == null || typeof x[ps[i]] !== 'object') x[ps[i]] = {}; x = x[ps[i]]; }
    const c = canon(JSON.parse(JSON.stringify(v === undefined ? null : v)));
    if (c === null) delete x[ps[ps.length - 1]]; else x[ps[ps.length - 1]] = c;
    // نظّف الآباء الفارغة
    for (let n = ps.length - 1; n > 0; n--) { const par = get(ps.slice(0, n).join('/')); if (par && typeof par === 'object' && !Object.keys(par).length) { const gp = ps.slice(0, n - 1); let y = R.tree; for (const s of gp) y = y[s]; delete y[ps[n - 1]]; } }
  };
  const snapOf = (p) => { const v = get(p); return { exists: () => v !== null, val: () => (v === null ? null : JSON.parse(JSON.stringify(v))), key: parts(p).pop() }; };
  const fire = () => R.watchers.forEach((w) => w());
  const api = {
    rtdb: {},
    rtdbRef: (db, path) => ({ path }),
    rtdbGet: async (ref) => snapOf(ref.path),
    rtdbSet: async (ref, v) => { put(ref.path, v); fire(); },
    rtdbUpdate: async (ref, m) => { for (const k of Object.keys(m)) put(ref.path + '/' + k, m[k]); fire(); },
    rtdbRemove: async (ref) => { put(ref.path, null); fire(); },
    rtdbRunTransaction: async (ref, fn) => {
      const cur = get(ref.path);
      const out = fn(cur === null ? null : JSON.parse(JSON.stringify(cur)));
      if (out === undefined) return { committed: false, snapshot: snapOf(ref.path) };
      put(ref.path, out); fire();
      return { committed: true, snapshot: snapOf(ref.path) };
    },
    rtdbOnValue: (ref, cb) => {
      let last = null;
      const w = () => { const s = JSON.stringify(get(ref.path)); if (s !== last) { last = s; cb(snapOf(ref.path)); } };
      R.watchers.add(w); queueMicrotask(() => { last = undefined; w(); });
      return () => R.watchers.delete(w);
    }
  };
  return { api, R, get };
}

export function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
