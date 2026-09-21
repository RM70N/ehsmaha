// ==================== طبقة الصمود: Firestore أساسي، Realtime Database احتياطي ====================
// الهدف: لو خلصت حصة Firestore (الخطة المجانية لها سقف يومي للقراءات/الكتابات)
// اللوحة ما تتعطّل — تتحوّل تلقائياً لـRealtime Database وتكمل شغل عادي، وأول
// ما ترجع الحصة تتحوّل تلقائياً لـFirestore مرة ثانية.
//
// كيف يشتغل هذا فعلياً بثلاث قطع:
//
// 1) **مرآة دائمة باتجاهين**: طول ما Firestore شغّال —
//    أ) كل **كتابة** تنكتب بالقاعدتين معاً (Firestore أولاً ثم RTDB بأفضل جهد).
//    ب) كل **قراءة** ناجحة تُنسخ نتيجتها لـRTDB (مرآة عبور/read-through)،
//       بخنق زمني لكل مسار عشان ما نكرر نفس النسخ كل ثانية.
//    بدون هذي المرآة، لحظة انقطاع Firestore راح نتحوّل لقاعدة فاضية تماماً
//    فما نعرض ولا شي — التحويل لحاله بلا مرآة عديم الفائدة. والكتابة وحدها
//    ما تكفي: البيانات الموجودة **من قبل** ما تنكتب مرة ثانية أبداً، فتبقى
//    خارج النسخة الاحتياطية للأبد. القراءة هي اللي تغطيها.
//
// 2) **كشف نفاد الحصة**: خطأ Firestore بكود 'resource-exhausted' (أو رسالة
//    فيها RESOURCE_EXHAUSTED/Quota exceeded) = الحصة خلصت. نعلّم الحالة
//    "محجوبة" ونعيد المحاولة على Firestore كل 3 دقائق فقط — أول نجاح يرفع
//    الحجب فوراً. ما نعتبر أخطاء الشبكة (unavailable) نفاد حصة، لأن تلك
//    تُحلّ بإعادة المحاولة مو بتبديل القاعدة.
//
// 3) **طابور مزامنة**: أي كتابة تصير والحصة مقطوعة تُسجَّل بـRTDB تحت
//    adminSyncQueue، وأول ما يرجع Firestore تُعاد تشغيلها عليه بالترتيب. بدون
//    هذا الطابور كانت كل كتابات فترة الانقطاع تضيع من Firestore للأبد.
//
// مفاتيح RTDB ما تقبل . # $ [ ] / — بينما معرّفات مستندات Firestore تقبلها
// (يوزرات مثل ic.zx8، وعناوين IP مثل 1.2.3.4 بـadminIpBans). فنرمّز كل مقطع
// مسار وكل اسم حقل عند الكتابة ونفكّه عند القراءة، عشان ما تنكسر أي وثيقة.
//
// والتواريخ: Firestore يرجّع كائن Timestamp له toMillis()/toDate()، وRTDB ما
// يعرف إلا أرقاماً. لو خزّنّا الوقت رقماً عارياً، أي كود يستدعي ts.toMillis()
// راح ينكسر بالوضع الاحتياطي. فنخزّنه موسوماً { __ts: ملّي } ونعيد بناءه
// كائناً شبيهاً بـTimestamp عند القراءة — فالكود اللي فوق ما يشعر بأي فرق.

const RETRY_AFTER_MS = 3 * 60 * 1000;
// الطابور مقسَّم بحسب uid صاحبه، وكل جلسة تصرّف طابورها هي فقط. السبب أمني
// مباشر: لو كان الطابور مشتركاً بعقدة وحدة، يقدر أي حساب يضيف عملية كتابة
// لمسار حسّاس، وتجي جلسة المالك تصرّف الطابور فتنفّذها **بصلاحيات المالك**
// (تصعيد امتيازات كامل). التقسيم بالـuid يقفل هذا الباب من الجذر، وقواعد
// RTDB تفرضه ($uid === auth.uid).
const SYNC_QUEUE_ROOT = 'adminSyncQueue';
// كل المرآة تعيش تحت جذر خاص فيها. مهم جداً: RTDB أصلاً فيه عُقد يملكها
// الموقع الرئيسي بصيغته الخاصة (levels، framesCatalogExtra، cwOwnerSessions،
// secretCodes، bridgeEvents...). لو كتبنا المرآة على نفس الأسماء بجذر RTDB
// راح تختلط صيغتان مختلفتان بنفس العقدة وتفسد بيانات حيّة — مثلاً
// levels/{key}.activeFrameAt يقرأه الموقع رقماً ليقرر أي قاعدة تحمل أحدث
// تفعيل إطار، والمرآة تكتبه موسوماً { __ts }. الجذر المنفصل يمنع هذا تماماً.
const MIRROR_ROOT = 'fsMirror';
// خنق مرآة القراءة: ما ننسخ نفس المسار لـRTDB أكثر من مرة كل دقيقتين.
const MIRROR_THROTTLE_MS = 2 * 60 * 1000;
// سقف عدد المستندات اللي ننسخها من نتيجة قراءة واحدة — حماية من نسخ
// تجميعة ضخمة (users/levels/playEvents) بضربة وحدة على كل فتحة أداة.
const MIRROR_MAX_DOCS = 400;

// ==================== ترميز مفاتيح RTDB ====================
const ENC_MAP = { '%': '%25', '.': '%2E', '#': '%23', '$': '%24', '[': '%5B', ']': '%5D', '/': '%2F' };

export function encKey(k) {
  return String(k).replace(/[%.#$[\]/]/g, (c) => ENC_MAP[c]);
}
export function decKey(k) {
  return String(k).replace(/%2E|%23|%24|%5B|%5D|%2F|%25/gi, (m) => {
    const up = m.toUpperCase();
    if (up === '%2E') return '.';
    if (up === '%23') return '#';
    if (up === '%24') return '$';
    if (up === '%5B') return '[';
    if (up === '%5D') return ']';
    if (up === '%2F') return '/';
    return '%';
  });
}
export function encPath(path) {
  return String(path).split('/').filter(Boolean).map(encKey).join('/');
}

// مسار المرآة الكامل لأي مسار Firestore.
export function mirrorPath(path) {
  return MIRROR_ROOT + '/' + encPath(path);
}

// ==================== حالة الحصة ====================
const state = {
  blocked: false,
  blockedAt: 0,
  lastReason: '',
  usingRtdbSince: 0,
  listeners: new Set(),
};

export function isQuotaError(err) {
  if (!err) return false;
  const code = String(err.code || '').toLowerCase();
  if (code === 'resource-exhausted' || code === 'firestore/resource-exhausted') return true;
  const msg = String(err.message || err);
  return /resource[_-]?exhausted|quota exceeded|quota_exceeded/i.test(msg);
}

function notify() {
  state.listeners.forEach((fn) => { try { fn(getBackendState()); } catch (e) {} });
}

export function onBackendChange(fn) {
  state.listeners.add(fn);
  try { fn(getBackendState()); } catch (e) {}
  return () => state.listeners.delete(fn);
}

export function getBackendState() {
  return {
    backend: state.blocked ? 'rtdb' : 'firestore',
    blocked: state.blocked,
    blockedAt: state.blockedAt,
    reason: state.lastReason,
    since: state.usingRtdbSince,
  };
}

function markBlocked(err) {
  const was = state.blocked;
  state.blocked = true;
  state.blockedAt = Date.now();
  state.lastReason = String((err && err.message) || err || 'حصة Firestore انتهت');
  if (!was) {
    state.usingRtdbSince = Date.now();
    console.warn('🔁 حصة Firestore انتهت — تحوّلت اللوحة لـRealtime Database:', state.lastReason);
    notify();
  }
}

function markHealthy() {
  if (!state.blocked) return;
  state.blocked = false;
  state.blockedAt = 0;
  state.lastReason = '';
  console.info('✅ رجعت حصة Firestore — اللوحة رجعت تستخدم Firestore');
  notify();
  triggerDrain();
}

// نسمح بمحاولة استكشافية على Firestore كل RETRY_AFTER_MS حتى وهو محجوب —
// هي الطريقة الوحيدة اللي نكتشف فيها رجوع الحصة بدون ما ينتظر المستخدم.
function shouldProbeFirestore() {
  return !state.blocked || (Date.now() - state.blockedAt) > RETRY_AFTER_MS;
}

// ==================== قيم خاصة (FieldValue) محايدة بين القاعدتين ====================
// نرجّع كائنات وصفية بدل sentinels فَيرستور مباشرة، عشان نقدر نطبّقها يدوياً
// على RTDB كمان (RTDB ما يعرف increment/arrayUnion بهذي الصيغة).
export function fvIncrement(n) { return { __fv: 'increment', value: Number(n) || 0 }; }
export function fvArrayUnion(...values) { return { __fv: 'arrayUnion', values }; }
export function fvArrayRemove(...values) { return { __fv: 'arrayRemove', values }; }
export function fvServerTimestamp() { return { __fv: 'serverTimestamp' }; }
export function fvDeleteField() { return { __fv: 'deleteField' }; }

function isFv(v) { return v && typeof v === 'object' && typeof v.__fv === 'string'; }

// ==================== محوّلات البيانات ====================
function toFirestoreValue(v, fsApi) {
  if (isFv(v)) {
    if (v.__fv === 'increment') return fsApi.increment(v.value);
    if (v.__fv === 'arrayUnion') return fsApi.arrayUnion(...v.values);
    if (v.__fv === 'arrayRemove') return fsApi.arrayRemove(...v.values);
    if (v.__fv === 'serverTimestamp') return fsApi.serverTimestamp();
    if (v.__fv === 'deleteField') return fsApi.deleteField();
  }
  if (Array.isArray(v)) return v.map((x) => toFirestoreValue(x, fsApi));
  if (v && typeof v === 'object' && !(v instanceof Date) && typeof v.toDate !== 'function') {
    const out = {};
    Object.keys(v).forEach((k) => { out[k] = toFirestoreValue(v[k], fsApi); });
    return out;
  }
  return v;
}

// تحويل قيمة للتخزين بـRTDB: التوابع الخاصة تُطبَّق على القيمة الحالية،
// والتواريخ تصير أرقام ملّي (fmtDate/tsToMillis باللوحة يفهمان الرقم أصلاً).
function toRtdbValue(v, current) {
  if (isFv(v)) {
    if (v.__fv === 'increment') return (Number(current) || 0) + v.value;
    if (v.__fv === 'arrayUnion') {
      const arr = Array.isArray(current) ? current.slice() : [];
      v.values.forEach((x) => { if (!arr.some((y) => JSON.stringify(y) === JSON.stringify(x))) arr.push(x); });
      return arr;
    }
    if (v.__fv === 'arrayRemove') {
      const arr = Array.isArray(current) ? current.slice() : [];
      return arr.filter((y) => !v.values.some((x) => JSON.stringify(y) === JSON.stringify(x)));
    }
    if (v.__fv === 'serverTimestamp') return { __ts: Date.now() };
    if (v.__fv === 'deleteField') return null;
  }
  if (v === undefined) return null;
  if (v instanceof Date) return { __ts: v.getTime() };
  if (v && typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (v && typeof v.toDate === 'function') return { __ts: v.toDate().getTime() };
  if (Array.isArray(v)) return v.map((x) => toRtdbValue(x, undefined));
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v).forEach((k) => {
      const nv = toRtdbValue(v[k], current && typeof current === 'object' ? current[encKey(k)] : undefined);
      if (nv !== undefined) out[encKey(k)] = nv;
    });
    return out;
  }
  return v;
}

// كائن شبيه بـTimestamp فَيرستور — نفس الواجهة اللي يستخدمها الكود فوق
// (toMillis/toDate/seconds)، عشان الوضع الاحتياطي ما يكسر أي تنسيق تاريخ.
export function makeTs(ms) {
  const n = Number(ms) || 0;
  return {
    __ts: n,
    seconds: Math.floor(n / 1000),
    nanoseconds: (n % 1000) * 1e6,
    toMillis: () => n,
    toDate: () => new Date(n),
    valueOf: () => n,
  };
}

function fromRtdbValue(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(fromRtdbValue);
  if (typeof v === 'object') {
    if (typeof v.__ts === 'number') return makeTs(v.__ts);
    const out = {};
    Object.keys(v).forEach((k) => { out[decKey(k)] = fromRtdbValue(v[k]); });
    return out;
  }
  return v;
}

// ==================== بناء الطبقة ====================
export function buildResilientFB(base) {
  const { db, rtdb } = base;
  const fsApi = base;

  const queryDesc = new WeakMap();   // Query الحقيقي -> وصف القيود
  const constraintDesc = new WeakMap(); // قيد حقيقي -> وصفه

  function rtdbRefFor(path) {
    return base.rtdbRef(rtdb, mirrorPath(path));
  }

  // -------- قراءة/كتابة RTDB بشكل مستند واحد --------
  async function rtdbReadDoc(path) {
    const snap = await base.rtdbGet(rtdbRefFor(path));
    const raw = snap.exists() ? snap.val() : null;
    const id = decKey(String(path).split('/').filter(Boolean).pop());
    return {
      id,
      exists: () => raw !== null && raw !== undefined,
      data: () => (raw === null || raw === undefined ? undefined : fromRtdbValue(raw)),
    };
  }

  async function rtdbReadCollection(path) {
    const snap = await base.rtdbGet(rtdbRefFor(path));
    const val = snap.exists() ? snap.val() : {};
    return Object.keys(val || {}).map((k) => {
      const d = fromRtdbValue(val[k]);
      return { id: decKey(k), exists: () => true, data: () => d, __data: d };
    });
  }

  async function rtdbWriteDoc(path, data, { merge }) {
    const ref = rtdbRefFor(path);
    let current = null;
    // نحتاج القيمة الحالية لتطبيق increment/arrayUnion/arrayRemove صح.
    const needsCurrent = JSON.stringify(data || {}).includes('"__fv"');
    if (merge || needsCurrent) {
      try { const s = await base.rtdbGet(ref); current = s.exists() ? s.val() : null; } catch (e) { current = null; }
    }
    const converted = toRtdbValue(data, current);
    if (merge) {
      // update يكتب الحقول المذكورة فقط ويسيب الباقي — نفس معنى merge:true.
      // القيم null تحذف الحقل بـRTDB، وهذا بالضبط سلوك deleteField.
      if (converted && typeof converted === 'object' && !Array.isArray(converted) && Object.keys(converted).length) {
        await base.rtdbUpdate(ref, converted);
      }
    } else {
      await base.rtdbSet(ref, converted);
    }
  }

  // -------- مرآة العبور: ننسخ نتيجة كل قراءة ناجحة لـRTDB --------
  const mirroredAt = new Map();

  function shouldMirror(path) {
    const last = mirroredAt.get(path) || 0;
    if (Date.now() - last < MIRROR_THROTTLE_MS) return false;
    mirroredAt.set(path, Date.now());
    return true;
  }

  // نحوّل قيم Firestore (Timestamp/GeoPoint/DocumentReference) لصيغة يفهمها
  // RTDB. Timestamp -> ملّي (fmtDate/tsToMillis باللوحة يفهمان الرقم).
  function plainify(v) {
    if (v === undefined || v === null) return null;
    if (typeof v.toMillis === 'function') return { __ts: v.toMillis() };
    if (typeof v.toDate === 'function') return { __ts: v.toDate().getTime() };
    if (v instanceof Date) return { __ts: v.getTime() };
    if (Array.isArray(v)) return v.map(plainify);
    if (typeof v === 'object') {
      if (typeof v.path === 'string' && typeof v.id === 'string') return v.path; // DocumentReference
      const out = {};
      Object.keys(v).forEach((k) => { const nv = plainify(v[k]); if (nv !== undefined) out[encKey(k)] = nv; });
      return out;
    }
    return v;
  }

  function mirrorDocSnap(path, snap) {
    if (!rtdb || !path || !snap || !snap.exists || !snap.exists()) return;
    if (!shouldMirror(path)) return;
    try { base.rtdbSet(rtdbRefFor(path), plainify(snap.data())).catch(() => {}); } catch (e) {}
  }

  function mirrorQuerySnap(path, snap) {
    if (!rtdb || !path || !snap || !snap.docs) return;
    if (!shouldMirror('col:' + path)) return;
    // ننسخ مستنداً مستنداً (update مو set) عشان ما نمسح مستندات موجودة
    // بالمرآة مو داخلة بنتيجة هذا الاستعلام المحدود (limit/where).
    try {
      const patch = {};
      snap.docs.slice(0, MIRROR_MAX_DOCS).forEach((d) => { patch[encKey(d.id)] = plainify(d.data()); });
      if (Object.keys(patch).length) base.rtdbUpdate(rtdbRefFor(path), patch).catch(() => {});
    } catch (e) {}
  }

  // نسخ احتياطي كامل عند الطلب (أداة بقسم 25/30) — يمرّ على التجميعات
  // المذكورة وينسخها كلها لـRTDB، عشان النسخة الاحتياطية تكون جاهزة قبل أي
  // انقطاع بدل ما تتكوّن بالتدريج من الاستخدام.
  async function backfillCollections(names, onProgress) {
    const report = [];
    for (const name of names) {
      try {
        const snap = await base.getDocs(base.collection(db, name));
        const patch = {};
        snap.docs.forEach((d) => { patch[encKey(d.id)] = plainify(d.data()); });
        if (Object.keys(patch).length) await base.rtdbUpdate(rtdbRefFor(name), patch);
        mirroredAt.set('col:' + name, Date.now());
        report.push({ name, count: snap.docs.length, ok: true });
      } catch (err) {
        report.push({ name, count: 0, ok: false, error: String((err && err.message) || err) });
        if (isQuotaError(err)) { markBlocked(err); break; }
      }
      if (onProgress) { try { onProgress(report[report.length - 1], report); } catch (e) {} }
    }
    return report;
  }

  // -------- طابور المزامنة --------
  function myQueuePath() {
    const uid = (base.auth && base.auth.currentUser && base.auth.currentUser.uid) || null;
    return uid ? SYNC_QUEUE_ROOT + '/' + uid : null;
  }

  async function enqueueSync(op) {
    const qp = myQueuePath();
    if (!rtdb || !qp) return;
    try {
      const id = 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
      await base.rtdbSet(base.rtdbRef(rtdb, qp + '/' + id), {
        ...op,
        ts: Date.now(),
        data: op.data === undefined ? null : JSON.stringify(op.data),
      });
    } catch (e) { /* أفضل جهد */ }
  }

  let draining = false;
  async function drainSyncQueue() {
    if (draining || !rtdb || state.blocked) return;
    const qp = myQueuePath();
    if (!qp) return;
    draining = true;
    try {
      const snap = await base.rtdbGet(base.rtdbRef(rtdb, qp));
      const all = snap.exists() ? snap.val() : {};
      const ids = Object.keys(all || {}).sort((a, b) => (all[a].ts || 0) - (all[b].ts || 0));
      for (const id of ids) {
        const item = all[id];
        try {
          const data = reviveTs(item.data ? JSON.parse(item.data) : undefined);
          const ref = pathToDocRef(item.path);
          if (item.op === 'delete') await base.deleteDoc(ref);
          else if (item.op === 'update') await base.updateDoc(ref, toFirestoreValue(data, fsApi));
          else await base.setDoc(ref, toFirestoreValue(data, fsApi), item.merge ? { merge: true } : undefined);
          await base.rtdbRemove(base.rtdbRef(rtdb, qp + '/' + id));
        } catch (err) {
          if (isQuotaError(err)) { markBlocked(err); break; }
          // عملية معطوبة (مستند محذوف مثلاً) — نشيلها بدل ما تعلّق الطابور للأبد.
          try { await base.rtdbRemove(base.rtdbRef(rtdb, qp + '/' + id)); } catch (e) {}
        }
      }
    } catch (e) { /* أفضل جهد */ } finally { draining = false; }
  }

  // الطابور يُخزَّن JSON، فكائنات Timestamp تضيع — نعيد بناءها من الوسم
  // قبل إعادة تشغيل العملية على Firestore.
  function reviveTs(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(reviveTs);
    if (typeof v === 'object') {
      if (typeof v.__ts === 'number') return new Date(v.__ts);
      const out = {};
      Object.keys(v).forEach((k) => { out[k] = reviveTs(v[k]); });
      return out;
    }
    return v;
  }

  function pathToDocRef(path) {
    const segs = String(path).split('/').filter(Boolean);
    return base.doc(db, ...segs);
  }

  // -------- استعلامات: تطبيق القيود يدوياً على نتائج RTDB --------
  function applyDesc(rows, desc) {
    let out = rows.slice();
    (desc.wheres || []).forEach((w) => {
      out = out.filter((r) => matchWhere(r.__data, w));
    });
    (desc.orderBys || []).slice().reverse().forEach((o) => {
      out.sort((a, b) => cmp(getField(a.__data, o.field), getField(b.__data, o.field)) * (o.dir === 'desc' ? -1 : 1));
    });
    if (desc.startAfter !== undefined && desc.orderBys && desc.orderBys.length) {
      const o = desc.orderBys[0];
      const idx = out.findIndex((r) => cmp(getField(r.__data, o.field), desc.startAfter) === 0);
      if (idx >= 0) out = out.slice(idx + 1);
    }
    if (typeof desc.limitN === 'number') out = out.slice(0, desc.limitN);
    return out;
  }

  function getField(data, field) {
    if (!data) return undefined;
    return String(field).split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
  }

  function cmp(a, b) {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a) < String(b) ? -1 : 1;
  }

  function matchWhere(data, w) {
    const v = getField(data, w.field);
    switch (w.op) {
      case '==': return v === w.value;
      case '!=': return v !== w.value;
      case '>': return cmp(v, w.value) > 0;
      case '>=': return cmp(v, w.value) >= 0;
      case '<': return cmp(v, w.value) < 0;
      case '<=': return cmp(v, w.value) <= 0;
      case 'in': return Array.isArray(w.value) && w.value.includes(v);
      case 'not-in': return Array.isArray(w.value) && !w.value.includes(v);
      case 'array-contains': return Array.isArray(v) && v.includes(w.value);
      case 'array-contains-any': return Array.isArray(v) && Array.isArray(w.value) && w.value.some((x) => v.includes(x));
      default: return true;
    }
  }

  // -------- الواجهة المغلَّفة --------
  const api = {
    ...base,

    // القيم الخاصة صارت محايدة بين القاعدتين
    increment: fvIncrement,
    arrayUnion: fvArrayUnion,
    arrayRemove: fvArrayRemove,
    serverTimestamp: fvServerTimestamp,
    deleteField: fvDeleteField,

    where(field, op, value) {
      const c = base.where(field, op, value);
      constraintDesc.set(c, { kind: 'where', field, op, value });
      return c;
    },
    orderBy(field, dir) {
      const c = base.orderBy(field, dir);
      constraintDesc.set(c, { kind: 'orderBy', field, dir: dir || 'asc' });
      return c;
    },
    limit(n) {
      const c = base.limit(n);
      constraintDesc.set(c, { kind: 'limit', n });
      return c;
    },
    startAfter(v) {
      const c = base.startAfter(v);
      constraintDesc.set(c, { kind: 'startAfter', value: v });
      return c;
    },
    query(ref, ...constraints) {
      const q = base.query(ref, ...constraints);
      const desc = { path: ref && ref.path ? ref.path : (queryDesc.get(ref) || {}).path, wheres: [], orderBys: [], limitN: undefined, startAfter: undefined };
      const inherited = queryDesc.get(ref);
      if (inherited) {
        desc.wheres = inherited.wheres.slice();
        desc.orderBys = inherited.orderBys.slice();
        desc.limitN = inherited.limitN;
        desc.startAfter = inherited.startAfter;
      }
      constraints.forEach((c) => {
        const d = constraintDesc.get(c);
        if (!d) return;
        if (d.kind === 'where') desc.wheres.push(d);
        else if (d.kind === 'orderBy') desc.orderBys.push(d);
        else if (d.kind === 'limit') desc.limitN = d.n;
        else if (d.kind === 'startAfter') desc.startAfter = d.value;
      });
      queryDesc.set(q, desc);
      return q;
    },

    async getDoc(ref) {
      if (shouldProbeFirestore()) {
        try { const s = await base.getDoc(ref); markHealthy(); mirrorDocSnap(ref.path, s); return s; }
        catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      return rtdbReadDoc(ref.path);
    },

    async getDocs(refOrQuery) {
      if (shouldProbeFirestore()) {
        try {
          const s = await base.getDocs(refOrQuery);
          markHealthy();
          const d = queryDesc.get(refOrQuery) || { path: refOrQuery.path };
          mirrorQuerySnap(d.path, s);
          return s;
        } catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      const desc = queryDesc.get(refOrQuery) || { path: refOrQuery.path, wheres: [], orderBys: [] };
      if (!desc.path) throw new Error('تعذّر تحديد مسار الاستعلام للوضع الاحتياطي');
      const rows = applyDesc(await rtdbReadCollection(desc.path), desc);
      return { docs: rows, size: rows.length, empty: rows.length === 0, forEach: (fn) => rows.forEach(fn) };
    },

    async getCountFromServer(refOrQuery) {
      if (shouldProbeFirestore()) {
        try { const s = await base.getCountFromServer(refOrQuery); markHealthy(); return s; }
        catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      const snap = await api.getDocs(refOrQuery);
      return { data: () => ({ count: snap.size }) };
    },

    async setDoc(ref, data, options) {
      const merge = !!(options && options.merge);
      if (shouldProbeFirestore()) {
        try {
          await base.setDoc(ref, toFirestoreValue(data, fsApi), options);
          markHealthy();
          // المرآة: بدونها الوضع الاحتياطي يقرأ من قاعدة فاضية.
          rtdbWriteDoc(ref.path, data, { merge }).catch(() => {});
          return;
        } catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      await rtdbWriteDoc(ref.path, data, { merge });
      await enqueueSync({ op: 'set', path: ref.path, data, merge });
    },

    async updateDoc(ref, data) {
      if (shouldProbeFirestore()) {
        try {
          await base.updateDoc(ref, toFirestoreValue(data, fsApi));
          markHealthy();
          rtdbWriteDoc(ref.path, data, { merge: true }).catch(() => {});
          return;
        } catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      await rtdbWriteDoc(ref.path, data, { merge: true });
      await enqueueSync({ op: 'update', path: ref.path, data });
    },

    async deleteDoc(ref) {
      if (shouldProbeFirestore()) {
        try {
          await base.deleteDoc(ref);
          markHealthy();
          base.rtdbRemove(rtdbRefFor(ref.path)).catch(() => {});
          return;
        } catch (err) { if (!isQuotaError(err)) throw err; markBlocked(err); }
      }
      await base.rtdbRemove(rtdbRefFor(ref.path));
      await enqueueSync({ op: 'delete', path: ref.path });
    },

    // الاستماع الحي: نبدأ بـFirestore، وأول خطأ حصة نتحوّل لنفس المسار بـRTDB
    // بلا ما يشعر القسم المستدعي بأي فرق (نفس شكل اللقطة بالضبط).
    onSnapshot(refOrQuery, onNext, onError) {
      let stopped = false;
      let unsubFs = null;
      let rtdbUnsub = null;
      const isDocRef = !!(refOrQuery && refOrQuery.path && refOrQuery.type === 'document');
      const desc = queryDesc.get(refOrQuery) || { path: refOrQuery && refOrQuery.path, wheres: [], orderBys: [] };

      function startRtdb() {
        if (stopped || rtdbUnsub || !rtdb || !desc.path) return;
        const r = rtdbRefFor(desc.path);
        const cb = base.rtdbOnValue(r, (snap) => {
          if (stopped) return;
          const val = snap.exists() ? snap.val() : null;
          if (isDocRef) {
            const id = decKey(String(desc.path).split('/').filter(Boolean).pop());
            onNext({ id, exists: () => val !== null, data: () => (val === null ? undefined : fromRtdbValue(val)) });
          } else {
            const rows = applyDesc(Object.keys(val || {}).map((k) => {
              const d = fromRtdbValue(val[k]);
              return { id: decKey(k), exists: () => true, data: () => d, __data: d };
            }), desc);
            onNext({ docs: rows, size: rows.length, empty: rows.length === 0, forEach: (fn) => rows.forEach(fn) });
          }
        }, (err) => { if (onError) onError(err); });
        rtdbUnsub = () => { try { base.rtdbOff(r, 'value', cb); } catch (e) {} };
      }

      if (state.blocked) {
        startRtdb();
      } else {
        unsubFs = base.onSnapshot(refOrQuery, (snap) => {
          markHealthy();
          if (isDocRef) mirrorDocSnap(desc.path, snap); else mirrorQuerySnap(desc.path, snap);
          if (!stopped) onNext(snap);
        }, (err) => {
          if (isQuotaError(err)) {
            markBlocked(err);
            try { if (unsubFs) unsubFs(); } catch (e) {}
            unsubFs = null;
            startRtdb();
            return;
          }
          if (onError) onError(err);
        });
      }

      return () => {
        stopped = true;
        try { if (unsubFs) unsubFs(); } catch (e) {}
        try { if (rtdbUnsub) rtdbUnsub(); } catch (e) {}
      };
    },

    // أدوات تشخيص/تحكم يدوي (قسم 30 يستعملها)
    __resilient: {
      getBackendState,
      onBackendChange,
      drainSyncQueue,
      backfillCollections,
      forceRtdb(on) {
        if (on) markBlocked(new Error('تحويل يدوي من لوحة الإدارة'));
        else { state.blocked = false; state.blockedAt = 0; state.lastReason = ''; notify(); drainSyncQueue(); }
      },
      async pendingSyncCount() {
        const qp = myQueuePath();
        if (!rtdb || !qp) return 0;
        try {
          const s = await base.rtdbGet(base.rtdbRef(rtdb, qp));
          return s.exists() ? Object.keys(s.val() || {}).length : 0;
        } catch (e) { return 0; }
      },
      encPath,
    },
  };

  // markHealthy() معرَّفة فوق (خارج هذي الدالة) فما تقدر تشوف drainSyncQueue
  // المحلية — نمرّرها عبر هذا المرجع بدل ما نكرّر المنطق.
  drainRef = drainSyncQueue;
  return api;
}

let drainRef = null;
function triggerDrain() { if (drainRef) drainRef(); }
