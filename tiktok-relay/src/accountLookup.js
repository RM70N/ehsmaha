// يوزر/إيميل → uid. الإيميل عبر Firebase Auth (مستقل عن Firestore). اليوزر عبر Firestore ثم RTDB الاحتياطي
// (pendingUsernames، يكتبه الموقع عند انتهاء الحصة)، مع كاش بالذاكرة. لو تعذّرت كل المصادر بسبب الحصة
// نرمي lookup_unavailable (ليظهر للمستخدم «جرّب بالإيميل أو لاحقاً») بدل خطأ عام.
export function isQuota(e) {
  const m = String((e && (e.message || e.code)) || '');
  return /RESOURCE_EXHAUSTED|Quota exceeded|resource-exhausted/i.test(m) || (e && e.code === 8);
}

// دليل احتياطي من Firebase Auth: الموقع يحفظ اليوزر كـ displayName للحساب عند التسجيل/تغيير اليوزر، وAuth لا يتأثر
// بحصة Firestore. نبني خريطة displayName(lower) → uid بقراءة listUsers على دفعات ونحدّثها كل 10 دقائق.
const DIR_TTL = 10 * 60e3;
const DIR_MAX_PAGES = 50; // ≤ 50,000 حساب

export function createAccountResolver({ admin, db, now = Date.now, log = () => {} }) {
  const cache = new Map();
  let dir = null; // { map, exp }
  let dirLoading = null;
  async function authDirectory() {
    if (dir && dir.exp > now()) return dir.map;
    if (!dirLoading) {
      dirLoading = (async () => {
        const map = new Map();
        let token;
        for (let i = 0; i < DIR_MAX_PAGES; i++) {
          const page = await admin.auth().listUsers(1000, token);
          for (const u of page.users || []) {
            const n = u && typeof u.displayName === 'string' ? u.displayName.trim().toLowerCase() : '';
            if (n && !map.has(n)) map.set(n, u.uid);
          }
          token = page.pageToken;
          if (!token) break;
        }
        dir = { map, exp: now() + DIR_TTL };
        return map;
      })().finally(() => { dirLoading = null; });
    }
    return dirLoading;
  }
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
    } catch (e) { log('warn', 'lookup_rtdb_failed', { message: e && e.message }); }
    if (quota) {
      try {
        const map = await authDirectory();
        const uid = map.get(key.toLowerCase());
        if (uid) { cache.set(key, { uid, exp: now() + 3600e3 }); return uid; }
        log('warn', 'lookup_not_in_auth_directory', { size: map.size });
        // لا نجزم بعدم الوجود: حسابات قديمة قد لا تحمل displayName ⇒ نكمل إلى lookup_unavailable
      } catch (e) { log('warn', 'lookup_auth_directory_failed', { message: e && e.message }); }
    }
    if (quota) { const err = new Error('lookup_unavailable'); err.code = 'lookup_unavailable'; throw err; }
    return null;
  };
}
