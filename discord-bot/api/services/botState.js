'use strict';

// النسخة الاحتياطية الدائمة لقاعدة بيانات البوت (SQLite).
//
// ليش؟ قرص Render المجاني يُمسح مع كل تحديث/إعادة تشغيل، فالبوت يرسل نسخة
// كاملة من ملف قاعدته بعد كل تعديل، ويسترجعها أول ما يشتغل.
//
// وين تنحفظ؟ مخزنين بنفس الشكل:
//   1) Realtime Database (الأساسي) — ما لها حد قراءات يومي، فتشتغل حتى لو
//      خلصت حصة Firestore.
//   2) Firestore (احتياطي) — يُستخدم تلقائياً لو Realtime Database غير متاحة.
// عند الاسترجاع نقرأ من الاثنين ونختار الأحدث. عند الحفظ نكتب بالأساسي، ولو
// فشل ننتقل تلقائياً للثاني.
//
// الخصوصية: المحتوى مشفّر (AES-256-GCM بمفتاح مشتق من API_KEY) — حتى لو قواعد
// أمان Realtime Database مفتوحة، ما أحد يقدر يقرأ إعدادات البوت.
//
// منع التعارض: كل تشغيل للبوت له bootAt. أول ما يقلع "يستلم" النسخة
// (ownerBoot = bootAt)، وأي كتابة من نسخة أقدم بعدها تُرفض (409).

const crypto = require('node:crypto');
const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const { errors } = require('../errors');

const MAX_BYTES = 8 * 1024 * 1024;
const FS_CHUNK_BYTES = 900 * 1024; // حد مستند Firestore 1MiB
const RT_CHUNK_CHARS = 1024 * 1024; // نص base64 لكل جزء بـRealtime Database
const RTDB_ROOT = 'discordBotState';
const chunkId = (i) => `chunk_${String(i).padStart(3, '0')}`;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// ---------------- التشفير ----------------
let keyCache = null;
function key() {
  if (!keyCache) keyCache = crypto.createHash('sha256').update('ehsmaha-bot-state:' + String(process.env.API_KEY || '')).digest();
  return keyCache;
}
function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}
function decrypt(blob) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(12, 28));
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]);
}

// يرمي STALE_INSTANCE (409) — ما يُعتبر فشل مخزن
const stale = () => errors.conflict('STALE_INSTANCE', 'نسخة أحدث من البوت شغالة');
const isStale = (err) => err && err.code === 'STALE_INSTANCE';

// Realtime Database ما ترمي خطأ لو ما قدرت تتصل — تحط الطلب بطابور وتنتظر
// للأبد. المهلة تخلي الفشل واضح فننتقل للمخزن الثاني تلقائياً.
const RTDB_TIMEOUT_MS = 10 * 1000;
function withTimeout(promise, ms = RTDB_TIMEOUT_MS) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      t = setTimeout(() => reject(Object.assign(new Error('Realtime Database ما ردت'), { code: 'RTDB_TIMEOUT' })), ms);
    })
  ]).finally(() => clearTimeout(t));
}

// ---------------- Realtime Database ----------------
const rtdbStore = {
  name: 'rtdb',
  available: () => !!firestore.rtdb(),
  ref: (path) => firestore.rtdb().ref(`${RTDB_ROOT}/${path}`),
  async claim(bootAt) {
    const r = await withTimeout(rtdbStore.ref('ownerBoot').transaction((cur) => (cur && cur > bootAt ? undefined : bootAt)));
    if (!r.committed) throw stale();
  },
  async readMeta() {
    const snap = await withTimeout(rtdbStore.ref('meta').get());
    return snap.exists() ? snap.val() : null;
  },
  async readBlob(meta) {
    const snap = await withTimeout(rtdbStore.ref('chunks').get());
    const parts = snap.exists() ? snap.val() : null;
    if (!parts) return null;
    const list = Array.isArray(parts) ? parts : Object.keys(parts).sort((a, b) => a - b).map((k) => parts[k]);
    if (list.length !== meta.chunks || list.some((p) => typeof p !== 'string')) return null;
    return Buffer.from(list.join(''), 'base64');
  },
  async write(bootAt, blob, meta) {
    await rtdbStore.claim(bootAt); // يرفض لو فيه نسخة أحدث
    const text = blob.toString('base64');
    const chunks = {};
    let n = 0;
    for (let i = 0; i < text.length; i += RT_CHUNK_CHARS) chunks[n++] = text.slice(i, i + RT_CHUNK_CHARS);
    // كتابة ذرّية متعددة المسارات: الأجزاء + meta مع بعض
    await withTimeout(firestore.rtdb().ref(RTDB_ROOT).update({ chunks, meta: { ...meta, chunks: n } }), 30 * 1000);
    return n;
  }
};

// ---------------- Firestore ----------------
const fsStore = {
  name: 'firestore',
  available: () => true,
  col: () => firestore.db().collection(C.DISCORD_BOT_STATE),
  async claim(bootAt) {
    const metaRef = fsStore.col().doc('meta');
    await firestore.db().runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      const cur = snap.exists ? snap.data() : {};
      if (cur.ownerBoot && cur.ownerBoot > bootAt) throw stale();
      tx.set(metaRef, { ownerBoot: bootAt, claimedAt: Date.now() }, { merge: true });
    });
  },
  async readMeta() {
    const snap = await fsStore.col().doc('meta').get();
    return snap.exists ? snap.data() : null;
  },
  async readBlob(meta) {
    const refs = Array.from({ length: meta.chunks }, (_, i) => fsStore.col().doc(chunkId(i)));
    const docs = await firestore.db().getAll(...refs);
    const parts = docs.map((d) => (d.exists ? d.get('data') : null));
    if (parts.some((p) => !p)) return null;
    return Buffer.concat(parts.map((p) => Buffer.from(p)));
  },
  async write(bootAt, blob, meta) {
    const metaRef = fsStore.col().doc('meta');
    const chunks = Math.ceil(blob.length / FS_CHUNK_BYTES);
    await firestore.db().runTransaction(async (tx) => {
      const snap = await tx.get(metaRef);
      const cur = snap.exists ? snap.data() : {};
      if (cur.ownerBoot && cur.ownerBoot > bootAt) throw stale();
      for (let i = 0; i < chunks; i++) tx.set(fsStore.col().doc(chunkId(i)), { data: blob.subarray(i * FS_CHUNK_BYTES, (i + 1) * FS_CHUNK_BYTES) });
      for (let i = chunks; i < (cur.chunks || 0); i++) tx.delete(fsStore.col().doc(chunkId(i)));
      tx.set(metaRef, { ...meta, chunks, ownerBoot: Math.max(cur.ownerBoot || 0, bootAt) });
    });
    return chunks;
  }
};

const stores = () => [rtdbStore, fsStore].filter((s) => s.available());

// يفك ويتحقق من نسخة مخزن — null لو ناقصة/تالفة/مفتاح مختلف
async function readSnapshot(store) {
  const meta = await store.readMeta();
  if (!meta || !meta.chunks || !meta.sha256) return null;
  const blob = await store.readBlob(meta);
  if (!blob) return null;
  let plain;
  try {
    plain = meta.encrypted ? decrypt(blob) : blob;
  } catch (_) {
    return null; // API_KEY تغيّر أو بيانات تالفة
  }
  if (sha256(plain) !== meta.sha256) return null;
  return { data: plain.toString('base64'), sha256: meta.sha256, size: plain.length, updatedAt: meta.updatedAt || null, store: store.name };
}

/**
 * يستلم البوت النسخة عند الإقلاع ويرجّع أحدث نسخة محفوظة بأي مخزن.
 * يكفي نجاح مخزن واحد؛ يرفض (409) لو فيه تشغيل أحدث استلمها قبله.
 */
async function claim(bootAt) {
  let best = null;
  let okCount = 0;
  let lastErr = null;
  for (const store of stores()) {
    try {
      await store.claim(bootAt);
      okCount += 1;
      const snap = await readSnapshot(store);
      if (snap && (!best || (snap.updatedAt || 0) > (best.updatedAt || 0))) best = snap;
    } catch (err) {
      if (isStale(err)) throw err;
      lastErr = err;
    }
  }
  if (!okCount) throw lastErr || new Error('لا يوجد مخزن متاح');
  return { snapshot: best };
}

/**
 * يحفظ نسخة جديدة كاملة: بالمخزن الأساسي، ولو فشل ينتقل تلقائياً للاحتياطي.
 */
async function save({ bootAt, data, sha }) {
  const plain = Buffer.from(String(data || ''), 'base64');
  if (!plain.length) throw errors.invalidInput('النسخة فاضية');
  if (plain.length > MAX_BYTES) throw errors.tooLarge('حجم قاعدة بيانات البوت تجاوز الحد');
  if (sha256(plain) !== sha) throw errors.invalidInput('بصمة النسخة غير مطابقة (نقل ناقص)');

  const blob = encrypt(plain);
  const meta = { sha256: sha, size: plain.length, encrypted: true, updatedAt: Date.now() };
  let lastErr = null;
  for (const store of stores()) {
    try {
      const chunks = await store.write(bootAt, blob, meta);
      return { saved: true, size: plain.length, chunks, store: store.name };
    } catch (err) {
      if (isStale(err)) throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('لا يوجد مخزن متاح');
}

module.exports = { claim, save, _internal: { encrypt, decrypt, rtdbStore, fsStore, MAX_BYTES } };
