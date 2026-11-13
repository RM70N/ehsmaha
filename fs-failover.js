/* fs-failover.js — تحويل تلقائي من Firestore إلى Realtime Database عند انتهاء حصة Firestore.
 *
 * الفكرة:
 *  - الوضع العادي: كل القراءات والكتابات تذهب إلى Firestore كما كانت، وكل كتابة ناجحة تُنسخ أيضاً
 *    (write-through) إلى Realtime Database تحت fsMirror/<collection>/<docId> (والمجموعات الفرعية تحت
 *    __sub_<name>). المستندات الصغيرة المشتركة (config…) تُزرع تلقائياً بالنسخة الاحتياطية عند أول قراءة
 *    ناجحة إذا كانت ناقصة (seed-if-missing).
 *  - أول خطأ حصة (resource-exhausted / quota) يقلب الوضع إلى rtdb: القراءات والاستماع الحي (onSnapshot)
 *    والكتابات تذهب إلى Realtime Database بنفس الواجهة، والكتابات تُسجَّل بطابور محلي (localStorage).
 *  - كل 5 دقائق (أثناء الوضع rtdb) نفحص Firestore: إذا رجع يشتغل، يرجع الوضع إلى firestore وتُعاد
 *    كتابات الطابور إلى Firestore، ويُعاد ربط المستمعين الأحياء تلقائياً.
 *
 * الملف لا يستورد شيئاً: installFsFailover(fb, opts) يغلّف دوال fb الموجودة، فيعمل على كل الصفحات التي
 * تستخدم window.__fb بلا تعديل أي استدعاء.
 */

/* ---------- أدوات خالصة (قابلة للاختبار) ---------- */

const ILLEGAL = /[.$#\[\]\/%]/g;
export function encKey(k) {
  return String(k).replace(ILLEGAL, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}
export function decKey(k) {
  return String(k).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

const SUB = '__sub_';

/* مسار مستند/مجموعة Firestore -> مسار RTDB */
export function mirrorPathOf(fsPath, root) {
  const segs = String(fsPath).split('/').filter(Boolean);
  let out = (root || 'fsMirror');
  for (let i = 0; i < segs.length; i++) {
    const isSubCollection = i >= 2 && i % 2 === 0;
    out += '/' + (isSubCollection ? SUB : '') + encKey(segs[i]);
  }
  return out;
}

export function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

/* ---------- معرّفات sentinel (serverTimestamp/increment/…) ---------- */
const SENT = new WeakMap();
export function sentinelInfo(v) { return v && typeof v === 'object' ? SENT.get(v) : undefined; }

function isTsLike(v) {
  return v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.seconds === 'number';
}

/* يحوّل قيمة JS (قد تحوي sentinel/Timestamp/Date) إلى قيمة تتخزّن في RTDB. cur = القيمة الحالية بنفس الموضع */
export function resolveValue(v, cur, now) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = sentinelInfo(v);
  if (s) {
    if (s.t === 'ts') return { __ts: now };
    if (s.t === 'inc') return (typeof cur === 'number' ? cur : 0) + s.n;
    if (s.t === 'au') {
      const base = Array.isArray(cur) ? cur.slice() : (cur && typeof cur === 'object' ? Object.values(cur) : []);
      for (const e of s.els) { const re = resolveValue(e, undefined, now); if (!base.some((b) => same(b, re))) base.push(re); }
      return base;
    }
    if (s.t === 'ar') {
      const base = Array.isArray(cur) ? cur : (cur && typeof cur === 'object' ? Object.values(cur) : []);
      const rem = s.els.map((e) => resolveValue(e, undefined, now));
      return base.filter((b) => !rem.some((r) => same(b, r)));
    }
    if (s.t === 'del') return undefined;
  }
  if (isTsLike(v)) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map((x) => { const r = resolveValue(x, undefined, now); return r === undefined ? null : r; });
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      const r = resolveValue(v[k], cur && typeof cur === 'object' ? cur[k] : undefined, now);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  if (typeof v === 'number' && !isFinite(v)) return null;
  return v;
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function splitSubs(node) {
  const fields = {}, subs = {};
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) (k.indexOf(SUB) === 0 ? subs : fields)[k] = node[k];
  }
  return { fields, subs };
}

function setPath(obj, parts, val) {
  let o = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== 'object' || Array.isArray(o[parts[i]])) o[parts[i]] = {};
    o = o[parts[i]];
  }
  if (val === undefined) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = val;
}
function getPath(obj, parts) {
  let o = obj;
  for (const p of parts) { if (o == null || typeof o !== 'object') return undefined; o = o[p]; }
  return o;
}

function deepMerge(cur, data, now) {
  const out = isPlainObject(cur) ? Object.assign({}, cur) : {};
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (v !== null && typeof v === 'object' && !sentinelInfo(v) && !isTsLike(v) && !(v instanceof Date) && !Array.isArray(v)) {
      out[k] = deepMerge(out[k], v, now);
    } else {
      const r = resolveValue(v, out[k], now);
      if (r === undefined) delete out[k]; else out[k] = r;
    }
  }
  return out;
}

/* يطبّق عملية كتابة بمعنى Firestore على نسخة المستند الحالية (حقول فقط، من غير __sub_). null = غير موجود */
export function applyWrite(curFields, op, now) {
  now = now || Date.now();
  const cur = curFields && Object.keys(curFields).length ? curFields : null;
  if (op.k === 'delete') return null;
  if (op.k === 'set') return resolveValue(op.d, null, now) || {};
  if (op.k === 'merge') return deepMerge(cur || {}, op.d, now);
  if (op.k === 'update') {
    const out = cur ? JSON.parse(JSON.stringify(cur)) : {};
    for (const key of Object.keys(op.d)) {
      const parts = key.split('.');
      const r = resolveValue(op.d[key], getPath(out, parts), now);
      setPath(out, parts, r);
    }
    return out;
  }
  throw new Error('unknown op ' + op.k);
}

/* RTDB لا يحفظ كائنات فارغة/مصفوفات فارغة، ويمنع بعض الرموز بالمفاتيح */
export function encodeForRtdb(v) {
  if (Array.isArray(v)) return v.map(encodeForRtdb);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v)) { const r = encodeForRtdb(v[k]); if (r !== undefined) out[encKey(k)] = r; }
    return out;
  }
  return v;
}
function looksLikeArray(o) {
  const ks = Object.keys(o);
  if (!ks.length) return false;
  for (let i = 0; i < ks.length; i++) { if (!(String(i) in o)) return false; }
  return ks.length === ks.length; // كل المفاتيح 0..n-1
}
export function decodeFromRtdb(v, mkTs) {
  if (Array.isArray(v)) return v.map((x) => decodeFromRtdb(x == null ? null : x, mkTs));
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__ts' && typeof v.__ts === 'number') return mkTs ? mkTs(v.__ts) : v.__ts;
    const out = {};
    for (const k of keys) out[decKey(k)] = decodeFromRtdb(v[k], mkTs);
    return out;
  }
  return v;
}

/* ---------- مطابقة where ---------- */
function norm(v) {
  if (v && typeof v === 'object') {
    if (isTsLike(v)) return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v.__ts === 'number') return v.__ts;
  }
  return v;
}
export function matchesWhere(data, w) {
  const [field, op, rawVal] = w;
  const parts = String(field).split('.');
  const dv = norm(getPath(data, parts));
  const val = norm(rawVal);
  switch (op) {
    case '==': return same(dv === undefined ? null : dv, val) && dv !== undefined;
    case '!=': return dv !== undefined && !same(dv, val);
    case '<': return dv !== undefined && dv < val;
    case '<=': return dv !== undefined && dv <= val;
    case '>': return dv !== undefined && dv > val;
    case '>=': return dv !== undefined && dv >= val;
    case 'in': return Array.isArray(val) && val.some((x) => same(norm(x), dv));
    case 'not-in': return dv !== undefined && Array.isArray(val) && !val.some((x) => same(norm(x), dv));
    case 'array-contains': return Array.isArray(dv) && dv.some((x) => same(norm(x), val));
    case 'array-contains-any': return Array.isArray(dv) && Array.isArray(val) && dv.some((x) => val.some((y) => same(norm(x), norm(y))));
    default: return false;
  }
}

/* ---------- التركيب ---------- */

const DEFAULTS = {
  root: 'fsMirror',
  tripMs: 5 * 60 * 1000,          // مدة بقاء الوضع rtdb بعد خطأ حصة قبل أول فحص
  softTripMs: 30 * 1000,          // بعد خطأ "unavailable"
  probePath: ['config', '__failover_probe'],
  storageKey: 'ehs_fs_failover',  // localStorage
  maxPending: 300,
  pendingMaxAgeMs: 7 * 24 * 3600 * 1000,
  replayEveryMs: 60 * 1000,
  // مجموعات ما نكتبها بنسخة write-through (عالية التكرار أو لها مسار RTDB خاص بها)
  skipWriteThrough: ['activeStreamers', 'presence', 'giftShareLog', 'playEvents', 'liveCommands', 'liveRounds'],
  // مجموعات صغيرة مشتركة تُزرع بالنسخة الاحتياطية عند القراءة إذا ناقصة
  seedCollections: ['config', 'levels', 'shopProducts', 'siteUpdates', 'framesCatalogExtra', 'storeSales',
    'storeNewAnnouncements', 'ahsemhaCategories', 'ahsemhaSettings', 'eventAccess', 'ghnamSpecial', 'devSpecial',
    'alfawzanSpecial', 'gameBadges', 'moderators', 'ahsemhaEditors', 'broadcastMessages',
    'streamerBroadcastMessages', 'f100WinMultiplier', 'f100OnlinePointsMultiplier', 'strongestStreamer',
    'gameConfig', 'siteContent', 'siteFlags', 'uiText', 'badgeDefs', 'subscriptionPlans', 'specialEvents'],
  now: () => Date.now(),
  setTimeout: (...a) => setTimeout(...a),
  clearTimeout: (...a) => clearTimeout(...a),
  storage: (() => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } })(),
  log: (...a) => { try { console.warn('[fs-failover]', ...a); } catch (e) {} }
};

export function isQuotaError(err) {
  if (!err) return false;
  if (err.code === 'resource-exhausted' || err.code === 'firestore/resource-exhausted') return true;
  return /quota|resource.exhausted/i.test(String(err.message || ''));
}
export function isSoftError(err) {
  return !!err && (err.code === 'unavailable' || err.code === 'firestore/unavailable');
}

export function installFsFailover(fb, userOpts) {
  const O = Object.assign({}, DEFAULTS, userOpts || {});
  try { if (O.storage && O.storage.getItem('ehs_fs_failover_off') === '1') return null; } catch (e) {}   // مفتاح إيقاف يدوي
  const real = {};
  const names = ['doc', 'collection', 'getDoc', 'getDocFromServer', 'setDoc', 'updateDoc', 'deleteDoc', 'getDocs',
    'onSnapshot', 'runTransaction', 'query', 'where', 'getCountFromServer', 'serverTimestamp', 'increment',
    'arrayUnion', 'arrayRemove', 'deleteField'];
  names.forEach((n) => { real[n] = fb[n]; });
  const Timestamp = O.Timestamp || null;
  const mkTs = Timestamp && Timestamp.fromMillis ? (ms) => Timestamp.fromMillis(ms) : (ms) => ({
    seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6,
    toMillis: () => ms, toDate: () => new Date(ms), valueOf: () => ms
  });

  const hasRtdb = () => !!fb.rtdb;
  /* لو النسخة الاحتياطية نفسها ما ردّت: نرجّع خطأ حصة (يعرضه الموقع كـ«الخادم مزدحم» بدل خطأ غامض) */
  const viaRt = async (fn, origErr) => {
    try { return await fn(); } catch (e) {
      if (e && (isQuotaError(e) || e.code === 'permission-denied')) throw e;
      throw Object.assign(new Error('Quota exceeded (fallback unavailable): ' + ((e && e.message) || e)), { code: 'resource-exhausted', cause: e, origin: origErr });
    }
  };
  const listeners = new Set();     // دوال تُستدعى عند تغيّر الوضع
  const seeded = new Set();
  let mode = 'firestore';
  let tripUntil = 0;
  let probeTimer = null;
  let replaying = null;

  /* حالة مخزّنة (تبقى بعد إعادة تحميل الصفحة) */
  function store() {
    try { return JSON.parse((O.storage && O.storage.getItem(O.storageKey)) || '{}'); } catch (e) { return {}; }
  }
  function save(st) { try { O.storage && O.storage.setItem(O.storageKey, JSON.stringify(st)); } catch (e) {} }
  function getPending() { return Array.isArray(store().pending) ? store().pending : []; }
  function setPending(p) { const st = store(); st.pending = p.slice(-O.maxPending); save(st); }
  function persistTrip() { const st = store(); st.tripUntil = tripUntil; save(st); }

  /* RTDB helpers */
  const rtRef = (fsPath) => fb.rtdbRef(fb.rtdb, mirrorPathOf(fsPath, O.root));
  const pathOf = (ref) => ref.path;

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('fs-failover-mode', { detail: { mode: m } })); } catch (e) {}
    Array.from(listeners).forEach((f) => { try { f(m); } catch (e) { O.log('listener error', e); } });
  }

  function trip(err, soft) {
    if (!hasRtdb()) return false;
    const ms = soft ? O.softTripMs : O.tripMs;
    tripUntil = O.now() + ms;
    persistTrip();
    O.log('Firestore ' + (soft ? 'غير متاح' : 'حصة منتهية') + ' — التحويل إلى Realtime Database', err && err.code);
    setMode('rtdb');
    scheduleProbe(ms);
    return true;
  }

  function scheduleProbe(ms) {
    if (probeTimer) O.clearTimeout(probeTimer);
    probeTimer = O.setTimeout(probe, Math.max(1000, ms));
    if (probeTimer && probeTimer.unref) probeTimer.unref();
  }

  async function probe() {
    probeTimer = null;
    try {
      await real.getDocFromServer(real.doc(fb.db, ...O.probePath));
    } catch (e) {
      if (isQuotaError(e) || isSoftError(e)) { tripUntil = O.now() + O.tripMs; persistTrip(); scheduleProbe(O.tripMs); return false; }
      /* permission-denied / not-found وغيرها: Firestore يرد، يعني رجعت الحصة */
    }
    tripUntil = 0; persistTrip();
    O.log('Firestore رجع يشتغل — العودة إلى الوضع العادي');
    setMode('firestore');
    await replayPending();
    scheduleReplayLoop();
    return true;
  }

  /* ---------- طابور الكتابات ---------- */
  function ser(v) {
    const s = sentinelInfo(v);
    if (s) return { __fv: s.t, n: s.n, els: s.els ? s.els.map(ser) : undefined };
    if (isTsLike(v)) return { __ts: v.toMillis() };
    if (v instanceof Date) return { __ts: v.getTime() };
    if (Array.isArray(v)) return v.map(ser);
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) { if (v[k] !== undefined) o[k] = ser(v[k]); } return o; }
    return v;
  }
  function deser(v, at) {
    if (v && typeof v === 'object') {
      if (v.__fv) {
        if (v.__fv === 'ts') return mkTs(at);
        if (v.__fv === 'inc') return real.increment(v.n);
        if (v.__fv === 'au') return real.arrayUnion(...(v.els || []).map((e) => deser(e, at)));
        if (v.__fv === 'ar') return real.arrayRemove(...(v.els || []).map((e) => deser(e, at)));
        if (v.__fv === 'del') return real.deleteField();
      }
      if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return mkTs(v.__ts);
      if (Array.isArray(v)) return v.map((x) => deser(x, at));
      const o = {}; for (const k of Object.keys(v)) o[k] = deser(v[k], at); return o;
    }
    return v;
  }
  const curUid = () => (fb.auth && fb.auth.currentUser && fb.auth.currentUser.uid) || null;
  function enqueue(op) {
    const p = getPending();
    p.push({ k: op.k, p: op.p, d: op.d === undefined ? undefined : ser(op.d), t: O.now(), u: curUid() });
    setPending(p);
  }
  let replayTimer = null;
  function scheduleReplayLoop() {
    if (replayTimer || !getPending().length) return;
    replayTimer = O.setTimeout(() => {
      replayTimer = null;
      if (mode === 'firestore') replayPending().catch(() => {}).then(scheduleReplayLoop);
      else scheduleReplayLoop();
    }, O.replayEveryMs);
    if (replayTimer && replayTimer.unref) replayTimer.unref();
  }
  /* كل مستخدم يرحّل عملياته هو فقط (قواعد Firestore تمنع تعديل مستندات غيره)؛ عمليات غيره تبقى بالطابور */
  async function replayPending() {
    if (replaying) return replaying;
    replaying = (async () => {
      const uid = curUid();
      const keep = [];
      let p = getPending().filter((it) => O.now() - it.t < O.pendingMaxAgeMs);
      for (let i = 0; i < p.length; i++) {
        const it = p[i];
        if (it.u && it.u !== uid) { keep.push(it); continue; }
        try {
          const ref = real.doc(fb.db, it.p);
          const data = it.d === undefined ? undefined : deser(it.d, it.t);
          if (it.k === 'set') await real.setDoc(ref, data);
          else if (it.k === 'merge') await real.setDoc(ref, data, { merge: true });
          else if (it.k === 'update') await real.updateDoc(ref, data);
          else if (it.k === 'delete') await real.deleteDoc(ref);
        } catch (e) {
          if (isQuotaError(e) || isSoftError(e)) { setPending(keep.concat(p.slice(i))); return; }
          O.log('تعذّر ترحيل عملية من الطابور — تُتجاهل', it.k, it.p, e && e.code);
        }
      }
      setPending(keep);
    })().finally(() => { replaying = null; });
    return replaying;
  }

  /* ---------- لقطات (Snapshot) مُحاكاة ---------- */
  function lastSeg(path) { const s = path.split('/'); return s[s.length - 1]; }
  function mkDocSnap(path, fields) {
    const exists = fields != null && Object.keys(fields).length > 0;
    const ref = real.doc(fb.db, path);
    return {
      id: lastSeg(path), ref, exists: () => exists,
      data: () => (exists ? fields : undefined),
      get: (f) => (exists ? getPath(fields, String(f).split('.')) : undefined),
      metadata: { fromCache: false, hasPendingWrites: false, isEqual: () => true }
    };
  }
  function mkQuerySnap(colPath, entries, prev) {
    const docs = entries.map(([id, fields]) => {
      const s = mkDocSnap(colPath + '/' + id, fields); return s;
    });
    const changes = () => {
      const out = [];
      const prevMap = prev || new Map();
      const cur = new Map(docs.map((d) => [d.id, d]));
      docs.forEach((d, i) => {
        if (!prevMap.has(d.id)) out.push({ type: 'added', doc: d, oldIndex: -1, newIndex: i });
        else if (!same(prevMap.get(d.id).data(), d.data())) out.push({ type: 'modified', doc: d, oldIndex: i, newIndex: i });
      });
      prevMap.forEach((d, id) => { if (!cur.has(id)) out.push({ type: 'removed', doc: d, oldIndex: 0, newIndex: -1 }); });
      return out;
    };
    return {
      docs, size: docs.length, empty: docs.length === 0,
      forEach: (cb, thisArg) => docs.forEach((d, i) => cb.call(thisArg, d, i)),
      docChanges: changes,
      metadata: { fromCache: false, hasPendingWrites: false, isEqual: () => true }
    };
  }
  function nodeToDoc(node) {
    const { fields } = splitSubs(node);
    return decodeFromRtdb(fields, mkTs);
  }
  function colEntriesFromNode(node, wheres) {
    const out = [];
    if (node && typeof node === 'object') {
      Object.keys(node).forEach((k) => {
        if (k.indexOf(SUB) === 0) return;
        const v = node[k];
        if (!v || typeof v !== 'object') return;
        const f = nodeToDoc(v);
        if (!Object.keys(f).length) return;
        if (wheres && wheres.some((w) => !matchesWhere(f, w))) return;
        out.push([decKey(k), f]);
      });
    }
    return out;
  }

  /* ---------- كتابة إلى النسخة (RTDB) ---------- */
  function applyToMirror(path, op) {
    const ref = rtRef(path);
    const now = O.now();
    return fb.rtdbRunTransaction(ref, (curNode) => {
      const { fields, subs } = splitSubs(curNode);
      const curFields = decodeFromRtdb(fields, null);
      const next = applyWrite(curFields, op, now);
      const enc = next == null ? {} : encodeForRtdb(next);
      const merged = Object.assign({}, enc, subs);
      return Object.keys(merged).length ? merged : null;
    });
  }
  function skipMirror(path) { return O.skipWriteThrough.indexOf(path.split('/')[0]) >= 0; }

  async function mirrorWrite(op) {
    if (!hasRtdb() || skipMirror(op.p)) return;
    try { await applyToMirror(op.p, op); } catch (e) { /* النسخة best-effort */ }
  }

  /* زرع مستند بالنسخة إذا غير موجود */
  function seedDoc(path, data) {
    if (!hasRtdb() || seeded.has(path)) return;
    const top = path.split('/')[0];
    const uid = fb.auth && fb.auth.currentUser && fb.auth.currentUser.uid;
    const ok = O.seedCollections.indexOf(top) >= 0 ||
      (top === 'users' && uid && path === 'users/' + uid) ||
      (top === 'usernames' && uid && data && data.uid === uid);
    if (!ok || !uid) return;
    seeded.add(path);
    const now = O.now();
    const ref = rtRef(path);
    try {
      const enc = encodeForRtdb(resolveValue(data, null, now));
      Promise.resolve(fb.rtdbRunTransaction(ref, (cur) => (cur == null ? enc : undefined))).catch(() => {});
    } catch (e) {}
  }

  /* ---------- القراءات ---------- */
  async function rtGetDoc(ref) {
    const snap = await fb.rtdbGet(rtRef(pathOf(ref)));
    const v = snap.exists() ? snap.val() : null;
    return mkDocSnap(pathOf(ref), v ? nodeToDoc(v) : null);
  }
  function queryInfo(target) {
    if (target && target.__fo) return target.__fo;
    return { path: target.path, wheres: [] };
  }
  async function rtGetDocs(target) {
    const qi = queryInfo(target);
    const snap = await fb.rtdbGet(rtRef(qi.path));
    return mkQuerySnap(qi.path, colEntriesFromNode(snap.exists() ? snap.val() : null, qi.wheres));
  }

  async function getDocGeneric(realFn, ref) {
    if (mode === 'rtdb' && hasRtdb()) return viaRt(() => rtGetDoc(ref));
    try {
      const s = await realFn(ref);
      try { if (s && s.exists && s.exists()) seedDoc(pathOf(ref), s.data()); } catch (e) {}
      return s;
    } catch (e) {
      if (hasRtdb() && (isQuotaError(e) || isSoftError(e))) { trip(e, !isQuotaError(e)); return viaRt(() => rtGetDoc(ref), e); }
      throw e;
    }
  }

  fb.getDoc = (ref) => getDocGeneric(real.getDoc, ref);
  fb.getDocFromServer = (ref) => getDocGeneric(real.getDocFromServer, ref);

  fb.getDocs = async (target) => {
    if (mode === 'rtdb' && hasRtdb()) return viaRt(() => rtGetDocs(target));
    try {
      const s = await real.getDocs(target);
      try { const p = queryInfo(target).path; if (!(target.__fo && target.__fo.wheres.length)) s.forEach((d) => seedDoc(p + '/' + d.id, d.data())); } catch (e) {}
      return s;
    } catch (e) {
      if (hasRtdb() && (isQuotaError(e) || isSoftError(e))) { trip(e, !isQuotaError(e)); return viaRt(() => rtGetDocs(target), e); }
      throw e;
    }
  };

  fb.getCountFromServer = async (target) => {
    if (mode === 'rtdb' && hasRtdb()) { const s = await viaRt(() => rtGetDocs(target)); return { data: () => ({ count: s.size }) }; }
    try { return await real.getCountFromServer(target); } catch (e) {
      if (hasRtdb() && (isQuotaError(e) || isSoftError(e))) { trip(e, !isQuotaError(e)); const s = await viaRt(() => rtGetDocs(target), e); return { data: () => ({ count: s.size }) }; }
      throw e;
    }
  };

  /* where/query تحمل معلومات القيود للمحاكاة */
  fb.where = (f, op, v) => { const c = real.where(f, op, v); try { c.__w = [f, op, v]; } catch (e) {} return c; };
  fb.query = (ref, ...cs) => {
    const q = real.query(ref, ...cs);
    try { q.__fo = { path: pathOf(ref), wheres: cs.map((c) => c && c.__w).filter(Boolean) }; } catch (e) {}
    return q;
  };

  /* sentinels */
  fb.serverTimestamp = () => { const s = real.serverTimestamp(); SENT.set(s, { t: 'ts' }); return s; };
  fb.increment = (n) => { const s = real.increment(n); SENT.set(s, { t: 'inc', n }); return s; };
  fb.arrayUnion = (...els) => { const s = real.arrayUnion(...els); SENT.set(s, { t: 'au', els }); return s; };
  fb.arrayRemove = (...els) => { const s = real.arrayRemove(...els); SENT.set(s, { t: 'ar', els }); return s; };
  fb.deleteField = () => { const s = real.deleteField(); SENT.set(s, { t: 'del' }); return s; };

  /* ---------- الكتابات ---------- */
  async function write(op, realCall) {
    if (mode === 'rtdb' && hasRtdb()) return viaRt(() => rtWrite(op));
    try {
      const res = await realCall();
      mirrorWrite(op);
      return res;
    } catch (e) {
      if (hasRtdb() && (isQuotaError(e) || isSoftError(e))) { trip(e, !isQuotaError(e)); return viaRt(() => rtWrite(op), e); }
      throw e;
    }
  }
  async function rtWrite(op) {
    await applyToMirror(op.p, op);   // أخطاء الصلاحيات تظهر للمستدعي كما بـ Firestore
    enqueue(op);
  }

  fb.setDoc = (ref, data, options) => {
    const merge = !!(options && options.merge);
    return write({ k: merge ? 'merge' : 'set', p: pathOf(ref), d: data }, () => real.setDoc(ref, data, options));
  };
  fb.updateDoc = (ref, ...args) => {
    let data;
    if (args.length === 1) data = args[0];
    else { data = {}; for (let i = 0; i + 1 < args.length; i += 2) data[args[i]] = args[i + 1]; }
    return write({ k: 'update', p: pathOf(ref), d: data }, () => real.updateDoc(ref, ...args));
  };
  fb.deleteDoc = (ref) => write({ k: 'delete', p: pathOf(ref) }, () => real.deleteDoc(ref));

  /* ---------- المعاملات ---------- */
  fb.runTransaction = async (db, fn, options) => {
    if (mode === 'rtdb' && hasRtdb()) return rtTransactionSafe(fn);
    let ops = [];
    try {
      const res = await real.runTransaction(db, (tx) => {
        ops = [];
        return fn(wrapTx(tx, ops));
      }, options);
      ops.forEach((o) => mirrorWrite(o));
      return res;
    } catch (e) {
      if (hasRtdb() && (isQuotaError(e) || isSoftError(e))) { trip(e, !isQuotaError(e)); return rtTransactionSafe(fn, e); }
      throw e;
    }
  };
  function wrapTx(tx, ops) {
    const rec = (k, ref, d, merge) => ops.push({ k: k === 'set' && merge ? 'merge' : k, p: pathOf(ref), d });
    return {
      get: (ref) => tx.get(ref),
      set: (ref, data, options) => { rec('set', ref, data, !!(options && options.merge)); return tx.set(ref, data, options); },
      update: (ref, ...a) => {
        let d; if (a.length === 1) d = a[0]; else { d = {}; for (let i = 0; i + 1 < a.length; i += 2) d[a[i]] = a[i + 1]; }
        rec('update', ref, d); return tx.update(ref, ...a);
      },
      delete: (ref) => { rec('delete', ref); return tx.delete(ref); }
    };
  }
  async function rtTransactionSafe(fn, origErr) {
    // أخطاء منطق المستدعي (مثل USERNAME_TAKEN) تمرّ كما هي؛ فقط فشل النسخة نفسها يتحوّل لخطأ حصة
    let userErr = null;
    const wrapped = async (tx) => { try { return await fn(tx); } catch (e) { userErr = e; throw e; } };
    try { return await rtTransaction(wrapped); } catch (e) {
      if (userErr) throw userErr;
      return viaRt(() => Promise.reject(e), origErr);
    }
  }
  async function rtTransaction(fn) {
    const ops = [];
    const tx = {
      get: (ref) => viaRt(() => rtGetDoc(ref)),
      set: (ref, data, options) => { ops.push({ k: options && options.merge ? 'merge' : 'set', p: pathOf(ref), d: data }); return tx; },
      update: (ref, ...a) => {
        let d; if (a.length === 1) d = a[0]; else { d = {}; for (let i = 0; i + 1 < a.length; i += 2) d[a[i]] = a[i + 1]; }
        ops.push({ k: 'update', p: pathOf(ref), d }); return tx;
      },
      delete: (ref) => { ops.push({ k: 'delete', p: pathOf(ref) }); return tx; }
    };
    const res = await fn(tx);
    for (const o of ops) await rtWrite(o);
    return res;
  }

  /* ---------- الاستماع الحي ---------- */
  fb.onSnapshot = (target, ...rest) => {
    let next = null, onErr = null;
    const a = rest.slice();
    if (a.length && a[0] && typeof a[0] === 'object' && typeof a[0].next !== 'function' && typeof a[0] !== 'function') a.shift(); // options
    if (a.length && a[0] && typeof a[0] === 'object' && typeof a[0].next === 'function') { next = (s) => a[0].next(s); onErr = a[0].error ? (e) => a[0].error(e) : null; }
    else { next = a[0]; onErr = a[1] || null; }
    const isDoc = target && target.type === 'document';
    let stopped = false, unsubReal = null, unsubRt = null, firstFs = true, prevMap = null;

    function stopAll() {
      if (unsubReal) { try { unsubReal(); } catch (e) {} unsubReal = null; }
      if (unsubRt) { try { unsubRt(); } catch (e) {} unsubRt = null; }
    }
    function startFs() {
      firstFs = true;
      unsubReal = real.onSnapshot(target, (snap) => {
        if (stopped) return;
        if (firstFs) {
          firstFs = false;
          try {
            if (isDoc) { if (snap.exists()) seedDoc(pathOf(target), snap.data()); }
            else if (!(target.__fo && target.__fo.wheres.length)) { const p = queryInfo(target).path; snap.forEach((d) => seedDoc(p + '/' + d.id, d.data())); }
          } catch (e) {}
        }
        next && next(snap);
      }, (err) => {
        if (stopped) return;
        if (hasRtdb() && (isQuotaError(err) || isSoftError(err))) {
          if (unsubReal) { try { unsubReal(); } catch (e) {} unsubReal = null; }
          trip(err, !isQuotaError(err));   // يستدعي onMode → startRt
          if (!unsubRt && !stopped) startRt();
          return;
        }
        onErr && onErr(err);
      });
    }
    function startRt() {
      prevMap = null;
      const path = isDoc ? pathOf(target) : queryInfo(target).path;
      const ref = rtRef(path);
      unsubRt = fb.rtdbOnValue(ref, (snap) => {
        if (stopped) return;
        const v = snap.exists() ? snap.val() : null;
        if (isDoc) { next && next(mkDocSnap(path, v ? nodeToDoc(v) : null)); return; }
        const ents = colEntriesFromNode(v, queryInfo(target).wheres);
        const qs = mkQuerySnap(path, ents, prevMap);
        prevMap = new Map(qs.docs.map((d) => [d.id, d]));
        next && next(qs);
      }, (err) => { if (!stopped && onErr) onErr(err); });
    }
    function start() {
      if (stopped) return;
      stopAll();
      if (mode === 'rtdb' && hasRtdb()) startRt(); else startFs();
    }
    const onMode = () => start();
    listeners.add(onMode);
    start();
    return () => { stopped = true; listeners.delete(onMode); stopAll(); };
  };

  /* ---------- حالة أولية + واجهة للفحص ---------- */
  const st = store();
  if (hasRtdb() && st.tripUntil && st.tripUntil > O.now()) {
    tripUntil = st.tripUntil; mode = 'rtdb';
    scheduleProbe(tripUntil - O.now());
  } else if (hasRtdb() && getPending().length) {
    // بقي طابور من جلسة سابقة: نرحّله عند أول فرصة
    O.setTimeout(() => { replayPending().catch(() => {}).then(scheduleReplayLoop); }, 3000);
  }

  const api = {
    mode: () => mode,
    pending: () => getPending().length,
    trip: (err) => trip(err || { code: 'resource-exhausted' }),
    probe, replayPending,
    _real: real
  };
  fb.__failover = api;
  return api;
}
