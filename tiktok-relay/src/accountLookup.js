// يوزر/إيميل → uid. الإيميل عبر Firebase Auth (مستقل عن Firestore). اليوزر عبر Firestore ثم RTDB الاحتياطي
// (pendingUsernames، يكتبه الموقع عند انتهاء الحصة)، مع كاش بالذاكرة. لو تعذّرت كل المصادر بسبب الحصة
// نرمي lookup_unavailable (ليظهر للمستخدم «جرّب بالإيميل أو لاحقاً») بدل خطأ عام.
export function isQuota(e) {
  const m = String((e && (e.message || e.code)) || '');
  return /RESOURCE_EXHAUSTED|Quota exceeded|resource-exhausted/i.test(m) || (e && e.code === 8);
}

export function createAccountResolver({ admin, db, now = Date.now }) {
  const cache = new Map();
  return async function resolveAccountUid(key) {
    if (key.includes('@')) {
      try { return (await admin.auth().getUserByEmail(key)).uid; }
      catch (e) { if (e && e.code === 'auth/user-not-found') return null; throw e; }
    }
    const hit = cache.get(key);
    if (hit && hit.exp > now()) return hit.uid;
    let quota = false;
    try {
      const d = await db.collection('usernames').doc(key).get();
      if (d.exists && d.data() && d.data().uid) {
        const uid = String(d.data().uid);
        cache.set(key, { uid, exp: now() + 6 * 3600e3 });
        if (cache.size > 5000) cache.delete(cache.keys().next().value);
        return uid;
      }
      return null;
    } catch (e) { if (!isQuota(e)) throw e; quota = true; }
    try {
      const snap = await admin.database().ref('pendingUsernames/' + key.replace(/[.#$\[\]\/]/g, '_')).get();
      if (snap.exists() && snap.val() && snap.val().uid) return String(snap.val().uid);
    } catch (e) { /* الحكم بالأسفل */ }
    if (quota) { const err = new Error('lookup_unavailable'); err.code = 'lookup_unavailable'; throw err; }
    return null;
  };
}
