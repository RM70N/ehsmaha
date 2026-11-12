// تحويل تلقائي Firestore → Realtime Database لقراءات/كتابات اللوحة، متوافق مع طبقة الموقع `fs-failover.js`:
//   كل مستند Firestore ينعكس في RTDB تحت fsMirror/<collection>/<docId> (والمجموعات الفرعية تحت __sub_<name>)،
//   والطوابع الزمنية تُخزَّن {__ts: ms}، والمفاتيح تُرمَّز (% + hex). فما تكتبه اللوحة يقرؤه الموقع عند نفاد حصته، والعكس.
// الوضع العادي: Firestore أولاً ثم نسخ write-through للنسخة. عند RESOURCE_EXHAUSTED: يتحول تلقائياً للنسخة
// (يُعاد اختبار Firestore كل 15 دقيقة عبر قاطع firebase.js).
import crypto from 'node:crypto';

const ROOT = 'fsMirror';
const SUB = '__sub_';
// مجموعات لا نكتبها بنسخة write-through (نفس قائمة الموقع) — لها مسار RTDB خاص بها
const SKIP_WT = new Set(['activeStreamers', 'presence', 'giftShareLog', 'playEvents', 'liveCommands', 'liveRounds']);
// مجموعات كبيرة/غير مكتملة بالنسخة: القراءة منها عند نفاد الحصة تُرفض بخطأ الحصة لتعمل بدائل Auth/RTDB القديمة
const NO_MIRROR_READ = new Set(['users', 'usernames']);
// مجموعات تُزرع بالنسخة (seed-if-missing) عند قراءة ناجحة من Firestore
const SEED = new Set(['config', 'levels', 'shopProducts', 'siteUpdates', 'framesCatalogExtra', 'storeSales', 'storeNewAnnouncements', 'ahsemhaCategories', 'ahsemhaSettings', 'eventAccess', 'gameBadges', 'moderators', 'broadcastMessages', 'streamerBroadcastMessages', 'gameConfig', 'siteContent', 'siteFlags', 'subscriptionPlans', 'specialEvents', 'bridgeStreamers', 'streamerEvents', 'streamerEventAnnouncements', 'streamerApplications', 'event100', 'personalMessages']);

const ILLEGAL = /[.$#[\]/%]/g;
export const encKey = (k) => String(k).replace(ILLEGAL, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
export const decKey = (k) => String(k).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
export function mirrorPathOf(fsPath) {
  const segs = String(fsPath).split('/').filter(Boolean);
  let out = ROOT;
  for (let i = 0; i < segs.length; i++) out += '/' + (i >= 2 && i % 2 === 0 ? SUB : '') + encKey(segs[i]);
  return out;
}
const isTsLike = (v) => v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.seconds === 'number';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

// ---- sentinels (FieldValue) — تُسجَّل عند إنشائها لنعرف معناها عند الكتابة للنسخة ----
const SENT = new WeakMap();
export const sentinelInfo = (v) => (v && typeof v === 'object' ? SENT.get(v) : undefined);
export function wrapFieldValue(FV) {
  const reg = (s, info) => { SENT.set(s, info); return s; };
  return {
    serverTimestamp: () => reg(FV.serverTimestamp(), { t: 'ts' }),
    increment: (n) => reg(FV.increment(n), { t: 'inc', n }),
    arrayUnion: (...els) => reg(FV.arrayUnion(...els), { t: 'au', els }),
    arrayRemove: (...els) => reg(FV.arrayRemove(...els), { t: 'ar', els }),
    delete: () => reg(FV.delete(), { t: 'del' })
  };
}

export function resolveValue(v, cur, now) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = sentinelInfo(v);
  if (s) {
    if (s.t === 'ts') return { __ts: now };
    if (s.t === 'inc') return (typeof cur === 'number' ? cur : 0) + s.n;
    if (s.t === 'au') { const base = Array.isArray(cur) ? cur.slice() : cur && typeof cur === 'object' ? Object.values(cur) : []; for (const e of s.els) { const re = resolveValue(e, undefined, now); if (!base.some((b) => same(b, re))) base.push(re); } return base; }
    if (s.t === 'ar') { const base = Array.isArray(cur) ? cur : cur && typeof cur === 'object' ? Object.values(cur) : []; const rem = s.els.map((e) => resolveValue(e, undefined, now)); return base.filter((b) => !rem.some((r) => same(b, r))); }
    if (s.t === 'del') return undefined;
  }
  if (isTsLike(v)) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map((x) => { const r = resolveValue(x, undefined, now); return r === undefined ? null : r; });
  if (typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) { const r = resolveValue(v[k], cur && typeof cur === 'object' ? cur[k] : undefined, now); if (r !== undefined) out[k] = r; } return out; }
  if (typeof v === 'number' && !Number.isFinite(v)) return null;
  return v;
}
function getPath(obj, parts) { let o = obj; for (const p of parts) { if (o == null || typeof o !== 'object') return undefined; o = o[p]; } return o; }
function setPath(obj, parts, val) { let o = obj; for (let i = 0; i < parts.length - 1; i++) { if (!o[parts[i]] || typeof o[parts[i]] !== 'object' || Array.isArray(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; } if (val === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val; }
function deepMerge(cur, data, now) {
  const out = isPlain(cur) ? { ...cur } : {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !sentinelInfo(v) && !isTsLike(v) && !(v instanceof Date) && !Array.isArray(v)) out[k] = deepMerge(out[k], v, now);
    else { const r = resolveValue(v, out[k], now); if (r === undefined) delete out[k]; else out[k] = r; }
  }
  return out;
}
const NOT_FOUND = () => Object.assign(new Error('5 NOT_FOUND: no document to update (النسخة الاحتياطية لا تحوي المستند)'), { code: 5 });
export function applyWrite(curFields, op, now = Date.now()) {
  const cur = curFields && Object.keys(curFields).length ? curFields : null;
  if (op.k === 'delete') return null;
  if (op.k === 'set') return resolveValue(op.d, null, now) || {};
  if (op.k === 'merge') return deepMerge(cur || {}, op.d, now);
  if (op.k === 'update') {
    if (!cur) throw NOT_FOUND();
    const out = JSON.parse(JSON.stringify(cur));
    for (const key of Object.keys(op.d)) { const parts = key.split('.'); setPath(out, parts, resolveValue(op.d[key], getPath(out, parts), now)); }
    return out;
  }
  throw new Error('unknown op ' + op.k);
}
export function encodeForRtdb(v) {
  if (Array.isArray(v)) return v.map(encodeForRtdb);
  if (v && typeof v === 'object') { const out = {}; for (const k of Object.keys(v)) { const r = encodeForRtdb(v[k]); if (r !== undefined) out[encKey(k)] = r; } return out; }
  return v;
}
export function decodeFromRtdb(v, mkTs) {
  if (Array.isArray(v)) return v.map((x) => decodeFromRtdb(x == null ? null : x, mkTs));
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__ts' && typeof v.__ts === 'number') return mkTs ? mkTs(v.__ts) : v.__ts;
    const out = {}; for (const k of keys) out[decKey(k)] = decodeFromRtdb(v[k], mkTs); return out;
  }
  return v;
}
function splitSubs(node) { const fields = {}, subs = {}; if (node && typeof node === 'object') for (const k of Object.keys(node)) (k.startsWith(SUB) ? subs : fields)[k] = node[k]; return { fields, subs }; }
const norm = (v) => { if (v && typeof v === 'object') { if (isTsLike(v)) return v.toMillis(); if (v instanceof Date) return v.getTime(); if (typeof v.__ts === 'number') return v.__ts; } return v; };
export function matchesWhere(data, [field, op, raw]) {
  const dv = norm(getPath(data, String(field).split('.'))); const val = norm(raw);
  switch (op) {
    case '==': return dv !== undefined && same(dv, val);
    case '!=': return dv !== undefined && !same(dv, val);
    case '<': return dv !== undefined && dv < val; case '<=': return dv !== undefined && dv <= val;
    case '>': return dv !== undefined && dv > val; case '>=': return dv !== undefined && dv >= val;
    case 'in': return Array.isArray(val) && val.some((x) => same(norm(x), dv));
    case 'not-in': return dv !== undefined && Array.isArray(val) && !val.some((x) => same(norm(x), dv));
    case 'array-contains': return Array.isArray(dv) && dv.some((x) => same(norm(x), val));
    case 'array-contains-any': return Array.isArray(dv) && Array.isArray(val) && dv.some((x) => val.some((y) => same(norm(x), norm(y))));
    default: return false;
  }
}
const isQuota = (e) => !!e && (e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e.message || '')));
const autoId = () => crypto.randomBytes(15).toString('base64url').slice(0, 20);
const cmp = (a, b) => { const x = norm(a), y = norm(b); if (x === y) return 0; if (x === undefined || x === null) return -1; if (y === undefined || y === null) return 1; return x < y ? -1 : 1; };

// ============================================================================
export function createFsFacade(api) {
  const Timestamp = api.Timestamp;
  const mkTs = (ms) => Timestamp.fromMillis(ms);
  const seeded = new Set();
  const inMirror = () => Date.now() < api.quota.until;
  const rt = () => api.rtdb();
  const quotaErr = () => Object.assign(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded (النسخة الاحتياطية في RTDB غير متاحة)'), { code: 8 });
  const viaRt = async (fn) => { try { return await fn(); } catch (e) { if (e && e.code === 5) throw Object.assign(quotaErr(), { message: '8 RESOURCE_EXHAUSTED: Quota exceeded — المستند غير موجود بالنسخة الاحتياطية (RTDB) فلا يمكن تعديله الآن', cause: e }); if (isQuota(e)) throw e; throw Object.assign(quotaErr(), { cause: e }); } };

  async function mirrorApply(path, op) {
    await rt().ref(mirrorPathOf(path)).transaction((curNode) => {
      const { fields, subs } = splitSubs(curNode);
      const next = applyWrite(decodeFromRtdb(fields, null), op, Date.now());
      const merged = { ...(next == null ? {} : encodeForRtdb(next)), ...subs };
      return Object.keys(merged).length ? merged : null;
    }, undefined, false);
  }
  const skipWT = (path) => SKIP_WT.has(path.split('/')[0]);
  async function mirrorWrite(op) { if (skipWT(op.p)) return; try { await mirrorApply(op.p, op); } catch { /* النسخة best-effort */ } }
  function seedDoc(path, data) {
    const top = path.split('/')[0]; if (!SEED.has(top) || seeded.has(path)) return; seeded.add(path);
    try { const enc = encodeForRtdb(resolveValue(data, null, Date.now())); Promise.resolve(rt().ref(mirrorPathOf(path)).transaction((cur) => (cur == null ? enc : undefined), undefined, false)).catch(() => {}); } catch { /* */ }
  }

  // ---- لقطات من النسخة ----
  const nodeToDoc = (node) => decodeFromRtdb(splitSubs(node).fields, mkTs);
  const mkSnap = (path, fields) => {
    const exists = fields != null && Object.keys(fields).length > 0;
    return { id: path.split('/').pop(), exists, data: () => (exists ? fields : undefined), get: (f) => (exists ? getPath(fields, String(f).split('.')) : undefined), ref: docRef(path), fromMirror: true };
  };
  const mkQSnap = (path, entries) => { const docs = entries.map(([id, f]) => mkSnap(path + '/' + id, f)); return { docs, size: docs.length, empty: !docs.length, forEach: (cb) => docs.forEach(cb), fromMirror: true }; };
  const noMirrorRead = (path) => { if (NO_MIRROR_READ.has(path.split('/')[0])) throw quotaErr(); };
  async function mirrorGetDoc(path) { noMirrorRead(path); const s = await viaRt(() => rt().ref(mirrorPathOf(path)).get()); return mkSnap(path, s.exists() ? nodeToDoc(s.val()) : null); }
  async function mirrorColEntries(path, wheres) {
    noMirrorRead(path);
    const s = await viaRt(() => rt().ref(mirrorPathOf(path)).get()); const node = s.exists() ? s.val() : null; const out = [];
    if (node && typeof node === 'object') for (const k of Object.keys(node)) { if (k.startsWith(SUB)) continue; const v = node[k]; if (!v || typeof v !== 'object') continue; const f = nodeToDoc(v); if (!Object.keys(f).length) continue; if (wheres.some((w) => !matchesWhere(f, w))) continue; out.push([decKey(k), f]); }
    return out;
  }

  // ---- قراءة/كتابة عامة بمنطق التحويل ----
  async function read(realFn, mirrorFn) {
    if (inMirror()) return mirrorFn();
    try { return await realFn(); } catch (e) { if (isQuota(e)) { api.noteError(e); return mirrorFn(); } throw e; }
  }
  async function write(op, realFn) {
    if (inMirror()) { await viaRt(() => mirrorApply(op.p, op)); queue(op); return { mirror: true }; }
    let r; try { r = await realFn(); } catch (e) { if (isQuota(e)) { api.noteError(e); await viaRt(() => mirrorApply(op.p, op)); queue(op); return { mirror: true }; } throw e; }
    await mirrorWrite(op); api.noteOk?.(); if (pendingCount()) replayPending().catch(() => {}); return r;
  }
  const realRef = (path) => api.rawDb().doc(path);

  // ---- طابور الكتابات التي تمت أثناء نفاد الحصة (تُرحَّل إلى Firestore تلقائياً عند عودته) ----
  const pend = () => api.pendingStore || null;
  const ser = (v) => { const s = sentinelInfo(v); if (s) return { __fv: s.t, n: s.n, els: s.els ? s.els.map(ser) : undefined }; if (isTsLike(v)) return { __ts: v.toMillis() }; if (v instanceof Date) return { __ts: v.getTime() }; if (Array.isArray(v)) return v.map(ser); if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = ser(v[k]); return o; } return v; };
  const deser = (v) => {
    if (v && typeof v === 'object') {
      const FV = api.rawFieldValue;
      if (v.__fv) { if (v.__fv === 'ts') return FV.serverTimestamp(); if (v.__fv === 'inc') return FV.increment(v.n); if (v.__fv === 'au') return FV.arrayUnion(...(v.els || []).map(deser)); if (v.__fv === 'ar') return FV.arrayRemove(...(v.els || []).map(deser)); if (v.__fv === 'del') return FV.delete(); }
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return mkTs(v.__ts);
      if (Array.isArray(v)) return v.map(deser);
      const o = {}; for (const k of Object.keys(v)) o[k] = deser(v[k]); return o;
    }
    return v;
  };
  function queue(op) { const col = pend(); if (!col || skipWT(op.p)) return; col.set(`${String(Date.now()).padStart(14, '0')}-${autoId().slice(0, 6)}`, { k: op.k, p: op.p, d: op.d === undefined ? undefined : ser(op.d), t: Date.now() }); }
  const pendingCount = () => { try { return pend() ? pend().count() : 0; } catch { return 0; } };
  let replaying = null;
  function replayPending() {
    if (replaying) return replaying; const col = pend(); if (!col) return Promise.resolve({ replayed: 0, dropped: 0, left: 0 });
    replaying = (async () => {
      let replayed = 0, dropped = 0;
      for (const it of col.list({ orderBy: 'created_at', dir: 'asc', limit: 500 })) {
        try {
          const ref = api.rawDb().doc(it.p); const d = it.d === undefined ? undefined : deser(it.d);
          if (it.k === 'set') await ref.set(d); else if (it.k === 'merge') await ref.set(d, { merge: true }); else if (it.k === 'update') await ref.update(d); else if (it.k === 'delete') await ref.delete();
          col.del(it.id); replayed++;
        } catch (e) { if (isQuota(e)) { api.noteError(e); break; } col.del(it.id); dropped++; }
      }
      return { replayed, dropped, left: pendingCount() };
    })().finally(() => { replaying = null; });
    return replaying;
  }

  function docRef(path) {
    const segs = path.split('/');
    const self = {
      id: segs[segs.length - 1], path, __facade: true,
      collection: (name) => colRef(path + '/' + name),
      get: () => read(async () => { const s = await realRef(path).get(); if (s.exists) seedDoc(path, s.data()); return s; }, () => mirrorGetDoc(path)),
      set: (data, options) => write({ k: options && options.merge ? 'merge' : 'set', p: path, d: data }, () => realRef(path).set(data, options)),
      update: (data, ...rest) => { let d = data; if (typeof data === 'string') { d = {}; const a = [data, ...rest]; for (let i = 0; i + 1 < a.length; i += 2) d[a[i]] = a[i + 1]; } return write({ k: 'update', p: path, d }, () => realRef(path).update(d)); },
      delete: () => write({ k: 'delete', p: path }, () => realRef(path).delete()),
      create: async (data) => {
        if (inMirror()) { const s = await mirrorGetDoc(path); if (s.exists) throw Object.assign(new Error('6 ALREADY_EXISTS'), { code: 6 }); return write({ k: 'set', p: path, d: data }, null); }
        return write({ k: 'set', p: path, d: data }, () => realRef(path).create(data));
      }
    };
    return self;
  }

  function colRef(path) { return makeQuery(path, { wheres: [], orders: [], limit: null, offset: 0, startAt: null, startAfter: null, endAt: null }, true); }

  function makeQuery(path, q, isCol) {
    const next = (patch) => makeQuery(path, { ...q, ...patch }, false);
    const build = () => {
      let r = api.rawDb().collection(path);
      for (const w of q.wheres) r = r.where(...w);
      for (const o of q.orders) r = r.orderBy(o[0], o[1]);
      if (q.startAt) r = r.startAt(...q.startAt); if (q.startAfter) r = r.startAfter(...q.startAfter); if (q.endAt) r = r.endAt(...q.endAt);
      if (q.offset) r = r.offset(q.offset); if (q.limit != null) r = r.limit(q.limit);
      return r;
    };
    const mirrorEntries = async () => {
      let ents = await mirrorColEntries(path, q.wheres);
      const ord = q.orders.length ? q.orders : [['__name__', 'asc']];
      const val = (id, f, k) => (k === '__name__' ? id : getPath(f, String(k).split('.')));
      ents = ents.filter(([id, f]) => q.orders.every((o) => o[0] === '__name__' || val(id, f, o[0]) !== undefined));
      ents.sort((a, b) => { for (const [k, d] of ord) { const c = cmp(val(a[0], a[1], k), val(b[0], b[1], k)); if (c) return d === 'desc' ? -c : c; } return 0; });
      const k0 = ord[0][0]; const desc = ord[0][1] === 'desc';
      const cutBy = (cursor, strict) => { if (!cursor) return; const cv = cursor[0]; ents = ents.filter(([id, f]) => { const c = cmp(val(id, f, k0), cv); return strict ? (desc ? c < 0 : c > 0) : (desc ? c <= 0 : c >= 0); }); };
      cutBy(q.startAt, false); cutBy(q.startAfter, true);
      if (q.endAt) { const cv = q.endAt[0]; ents = ents.filter(([id, f]) => { const c = cmp(val(id, f, k0), cv); return desc ? c >= 0 : c <= 0; }); }
      if (q.offset) ents = ents.slice(q.offset); if (q.limit != null) ents = ents.slice(0, q.limit);
      return ents;
    };
    const self = {
      where: (f, op, v) => next({ wheres: [...q.wheres, [f, op, v]] }),
      orderBy: (f, d = 'asc') => next({ orders: [...q.orders, [f, d]] }),
      limit: (n) => next({ limit: n }), offset: (n) => next({ offset: n }),
      startAt: (...v) => next({ startAt: v }), startAfter: (...v) => next({ startAfter: v }), endAt: (...v) => next({ endAt: v }),
      select: () => self,
      get: () => read(async () => { const s = await build().get(); try { if (!q.wheres.length) s.forEach((d) => seedDoc(path + '/' + d.id, d.data())); } catch { /* */ } return s; }, async () => mkQSnap(path, await mirrorEntries())),
      count: () => ({ get: () => read(() => build().count().get(), async () => { const n = (await mirrorEntries()).length; return { data: () => ({ count: n }) }; }) })
    };
    if (isCol) {
      self.id = path.split('/').pop(); self.path = path;
      self.doc = (id) => docRef(path + '/' + (id || autoId()));
      self.add = async (data) => { const ref = self.doc(); await ref.set(data); return ref; };
    }
    return self;
  }

  // ---- المعاملات ----
  async function runTransaction(fn) {
    const mirrorTx = async () => {
      const ops = [];
      const tx = { get: (ref) => ref.get(), set: (ref, data, o) => { ops.push({ k: o && o.merge ? 'merge' : 'set', p: ref.path, d: data }); return tx; }, update: (ref, d) => { ops.push({ k: 'update', p: ref.path, d }); return tx; }, delete: (ref) => { ops.push({ k: 'delete', p: ref.path }); return tx; } };
      const res = await fn(tx);
      for (const o of ops) { await viaRt(() => mirrorApply(o.p, o)); queue(o); }
      return res;
    };
    if (inMirror()) return mirrorTx();
    const ops = [];
    try {
      const res = await api.rawDb().runTransaction(async (tx) => {
        ops.length = 0;
        const w = { get: (ref) => tx.get(realRef(ref.path)), set: (ref, d, o) => { ops.push({ k: o && o.merge ? 'merge' : 'set', p: ref.path, d }); return tx.set(realRef(ref.path), d, o); }, update: (ref, d) => { ops.push({ k: 'update', p: ref.path, d }); return tx.update(realRef(ref.path), d); }, delete: (ref) => { ops.push({ k: 'delete', p: ref.path }); return tx.delete(realRef(ref.path)); } };
        return fn(w);
      });
      for (const o of ops) await mirrorWrite(o);
      return res;
    } catch (e) { if (isQuota(e)) { api.noteError(e); return mirrorTx(); } throw e; }
  }

  return {
    collection: (name) => colRef(name), doc: (p) => docRef(p), runTransaction,
    inMirror, mirrorWrite, mirrorGetDoc, queue, replayPending, pendingCount,
    mirror: { apply: (path, op) => mirrorApply(path, op), read: mirrorGetDoc }
  };
}
