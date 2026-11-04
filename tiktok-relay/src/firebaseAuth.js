'use strict';
// التحقق من توكن Firebase لعميل اللعبة — نفس نمط tiktok-server/server.js (verifyFirebaseToken):
// admin SDK لو متاح، وإلا استعلام REST بمفتاح الويب العام. مخزَّن مؤقتاً 5 دقائق لكل توكن.
export function createTokenVerifier({ admin, firebaseWebApiKey, fetchImpl = fetch } = {}) {
  const cache = new Map();
  return async function verifyFirebaseToken(token) {
    if (!token || token.length > 4096) return null;
    const hit = cache.get(token);
    if (hit && hit.exp > Date.now()) return hit.user;
    let user = null;
    try {
      if (admin) {
        const d = await admin.auth().verifyIdToken(token);
        user = { uid: d.uid, email: d.email || '' };
      } else if (firebaseWebApiKey) {
        const r = await fetchImpl('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(firebaseWebApiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: token }),
        });
        const j = await r.json();
        const u = r.ok && j && Array.isArray(j.users) && j.users[0];
        if (u && u.localId) user = { uid: u.localId, email: u.email || '' };
      }
    } catch (e) { user = null; }
    if (user) { cache.set(token, { user, exp: Date.now() + 5 * 60 * 1000 }); if (cache.size > 500) cache.delete(cache.keys().next().value); }
    return user;
  };
}
