'use strict';

// النسخة الاحتياطية الدائمة لقاعدة بيانات البوت (SQLite) داخل Firestore.
//
// ليش؟ قرص Render المجاني يُمسح مع كل تحديث/إعادة تشغيل، فإعدادات البوت
// (رتب الدعم، الأدمن، التحذيرات، الترحيب، الحماية...) كانت تضيع. البوت يرسل
// نسخة كاملة من ملف القاعدة بعد كل تعديل، ويسترجعها أول ما يشتغل.
//
// التخزين: discordBotState/meta (البصمة، الحجم، عدد الأجزاء، مالك النسخة)
//          discordBotState/chunk_000.. (أجزاء ≤ 900KB — حد المستند 1MiB)
//
// منع التعارض: كل تشغيل للبوت له bootAt (وقت إقلاعه). أول ما يقلع "يستلم"
// النسخة (ownerBoot = bootAt). لو نسخة أقدم من البوت (أثناء التحديث تشتغل
// النسختين لحظات) حاولت تكتب بعدها، تُرفض بـ409 فما تمسح بيانات الأحدث.

const crypto = require('node:crypto');
const firestore = require('../../database/firestore');
const C = require('../../database/collections');
const { errors } = require('../errors');

const CHUNK_BYTES = 900 * 1024;
const MAX_BYTES = 8 * 1024 * 1024; // حد طلب Firestore الواحد 10MiB
const chunkId = (i) => `chunk_${String(i).padStart(3, '0')}`;
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function col() {
  return firestore.db().collection(C.DISCORD_BOT_STATE);
}

// يقرأ النسخة كاملة (أو null لو ما فيه نسخة بعد)
async function readSnapshot(meta) {
  if (!meta || !meta.chunks) return null;
  const refs = Array.from({ length: meta.chunks }, (_, i) => col().doc(chunkId(i)));
  const docs = await firestore.db().getAll(...refs);
  const parts = docs.map((d) => (d.exists ? d.get('data') : null));
  if (parts.some((p) => !p)) return null; // نسخة ناقصة — نتجاهلها بدل نسترجع شي تالف
  const buf = Buffer.concat(parts.map((p) => Buffer.from(p)));
  if (sha256(buf) !== meta.sha256) return null;
  return { data: buf.toString('base64'), sha256: meta.sha256, size: buf.length, updatedAt: meta.updatedAt || null };
}

/**
 * يستلم البوت النسخة عند الإقلاع ويرجّع آخر نسخة محفوظة.
 * يرفض لو فيه تشغيل أحدث استلمها قبله.
 */
async function claim(bootAt) {
  const metaRef = col().doc('meta');
  const meta = await firestore.db().runTransaction(async (tx) => {
    const snap = await tx.get(metaRef);
    const cur = snap.exists ? snap.data() : {};
    if (cur.ownerBoot && cur.ownerBoot > bootAt) throw errors.conflict('STALE_INSTANCE', 'نسخة أحدث من البوت شغالة');
    tx.set(metaRef, { ownerBoot: bootAt, claimedAt: Date.now() }, { merge: true });
    return cur;
  });
  return { snapshot: await readSnapshot(meta) };
}

/**
 * يحفظ نسخة جديدة (بالكامل) — ذرّياً: الأجزاء + meta بنفس المعاملة.
 */
async function save({ bootAt, data, sha }) {
  const buf = Buffer.from(String(data || ''), 'base64');
  if (!buf.length) throw errors.invalidInput('النسخة فاضية');
  if (buf.length > MAX_BYTES) throw errors.tooLarge('حجم قاعدة بيانات البوت تجاوز الحد');
  if (sha256(buf) !== sha) throw errors.invalidInput('بصمة النسخة غير مطابقة (نقل ناقص)');

  const metaRef = col().doc('meta');
  const chunks = Math.ceil(buf.length / CHUNK_BYTES);
  await firestore.db().runTransaction(async (tx) => {
    const snap = await tx.get(metaRef);
    const cur = snap.exists ? snap.data() : {};
    if (cur.ownerBoot && cur.ownerBoot > bootAt) throw errors.conflict('STALE_INSTANCE', 'نسخة أحدث من البوت شغالة');
    for (let i = 0; i < chunks; i++) {
      tx.set(col().doc(chunkId(i)), { data: buf.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES) });
    }
    for (let i = chunks; i < (cur.chunks || 0); i++) tx.delete(col().doc(chunkId(i)));
    tx.set(metaRef, { chunks, sha256: sha, size: buf.length, updatedAt: Date.now(), ownerBoot: Math.max(cur.ownerBoot || 0, bootAt) });
  });
  return { saved: true, size: buf.length, chunks };
}

module.exports = { claim, save, _internal: { CHUNK_BYTES, MAX_BYTES } };
