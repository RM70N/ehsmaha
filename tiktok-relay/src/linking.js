'use strict';
// حجز حساب TikTok لحساب احسمها واحد فقط. مجموعة Firestore: tiktokLinks/{uniqueId} -> {ehsmahaUid, linkedAt}.
// معاملة Firestore (transaction) تمنع سباق الحجز المزدوج: الأول يحجز، الثاني يُرفض برسالة واضحة.
import { normalizeTikTokUsername } from './normalize.js';

export class AlreadyLinkedError extends Error {
  constructor(username) {
    super('هذا اليوزر مربوط بحساب آخر');
    this.username = username;
  }
}

export class NotOwnerError extends Error {
  constructor(username) {
    super('هذا اليوزر غير مربوط بحسابك');
    this.username = username;
  }
}

// db: أي كائن يطابق جزء Firestore Admin المستخدم هنا (collection().doc(), runTransaction).
// يُمرَّر admin.firestore() حقيقياً بالتشغيل، أو مزوّد وهمي بالاختبارات.
export class LinkingService {
  constructor(db) {
    this.db = db;
  }

  async link(rawUsername, ehsmahaUid) {
    if (!ehsmahaUid) throw new Error('ehsmahaUid مطلوب');
    const username = normalizeTikTokUsername(rawUsername);
    const ref = this.db.collection('tiktokLinks').doc(username);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      if (data && data.ehsmahaUid && data.ehsmahaUid !== ehsmahaUid) throw new AlreadyLinkedError(username);
      tx.set(ref, { ehsmahaUid, linkedAt: Date.now() }, { merge: true });
    });
    return username;
  }

  async unlink(rawUsername, ehsmahaUid) {
    const username = normalizeTikTokUsername(rawUsername);
    const ref = this.db.collection('tiktokLinks').doc(username);
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      if (!data || data.ehsmahaUid !== ehsmahaUid) throw new NotOwnerError(username);
      tx.delete(ref);
    });
    return username;
  }

  async ownerOf(rawUsername) {
    const username = normalizeTikTokUsername(rawUsername);
    const snap = await this.db.collection('tiktokLinks').doc(username).get();
    return snap.exists ? snap.data().ehsmahaUid : null;
  }

  async listLinkedUsernames() {
    const snap = await this.db.collection('tiktokLinks').get();
    const out = [];
    (snap.docs || []).forEach((d) => out.push(d.id));
    return out;
  }
}
