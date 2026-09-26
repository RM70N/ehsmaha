// بديل Firebase للاختبار بالمتصفح فقط — بدون أي اتصال حقيقي بقاعدة الموقع.
// مستخدم مسجّل وهمي، وكل القراءات فاضية، وكل الكتابات تنجح بصمت.
const user = { uid: 'uidE2E', email: 'streamer@e2e.local', displayName: 'e2e', emailVerified: true, providerData: [], getIdToken: async () => 'token', reload: async () => {} };
const docSnap = (ref, data) => ({ id: ref && ref.id, ref, exists: () => !!data, data: () => data, get: (k) => (data ? data[k] : undefined) });
const querySnap = () => ({ docs: [], empty: true, size: 0, forEach() {}, docChanges: () => [] });
const userDoc = { username: 'e2e', usernameLower: 'e2e', createdAt: { toMillis: () => 0, toDate: () => new Date(0) } };
const dataFor = (ref) => (ref && ref.path === 'users/uidE2E' ? userDoc : ref && ref.path === 'usernames/e2e' ? { uid: 'uidE2E' } : null);
const noop = () => {};
const ok = async () => {};
// app
export const initializeApp = () => ({});
// auth
export const getAuth = () => ({ currentUser: user });
export const setPersistence = ok;
export const browserLocalPersistence = {};
export const onAuthStateChanged = (_a, cb) => { setTimeout(() => cb(user), 0); return noop; };
export const createUserWithEmailAndPassword = async () => ({ user });
export const signInWithEmailAndPassword = async () => ({ user });
export class GoogleAuthProvider { setCustomParameters() {} addScope() {} }
export const signInWithPopup = async () => ({ user });
export const signInWithRedirect = ok;
export const getRedirectResult = async () => null;
export const signOut = ok;
export const updateProfile = ok;
export const deleteUser = ok;
// firestore
export const getFirestore = () => ({});
export const initializeFirestore = () => ({});
export const doc = (_db, ...p) => { const path = (_db && _db.path ? [_db.path, ...p] : p).join('/'); return { path, id: path.split('/').pop(), type: 'doc' }; };
export const collection = (_db, ...p) => ({ path: (_db && _db.path ? [_db.path, ...p] : p).join('/'), type: 'collection' });
export const query = (ref) => ({ ...ref, type: 'query' });
export const where = () => ({});
export const getDoc = async (ref) => docSnap(ref, dataFor(ref));
export const getDocFromServer = getDoc;
export const setDoc = ok;
export const updateDoc = ok;
export const deleteDoc = ok;
// نفس الاسم لـFirestore و Realtime Database: مرجع RTDB فيه path
export const runTransaction = async (a, fn) => {
  if (a && typeof a.path === 'string') { const v = fn(null); return { committed: v !== undefined, snapshot: { exists: () => v != null, val: () => v } }; }
  return fn({ get: getDoc, set: noop, update: noop, delete: noop });
};
export const serverTimestamp = () => ({ __ts: true });
export const onSnapshot = (ref, next) => { setTimeout(() => { try { next(ref && ref.type === 'doc' ? docSnap(ref, dataFor(ref)) : querySnap()); } catch (e) {} }, 0); return noop; };
export const getDocs = async () => querySnap();
export const getCountFromServer = async () => ({ data: () => ({ count: 0 }) });
export const increment = (n) => ({ __inc: n });
export const arrayUnion = (...v) => ({ __union: v });
export const arrayRemove = (...v) => ({ __remove: v });
export const deleteField = () => ({ __delete: true });
// realtime database
const rtSnap = () => ({ exists: () => false, val: () => null, key: null, forEach() {} });
export const getDatabase = () => ({});
export const ref = (_db, path) => ({ path: path || '', key: String(path || '').split('/').pop() });
export const set = ok;
export const get = async () => rtSnap();
export const remove = ok;
export const update = ok;
export const onValue = (_r, cb) => { setTimeout(() => { try { cb(rtSnap()); } catch (e) {} }, 0); return noop; };
export const off = noop;
export const push = (r) => ({ path: (r && r.path) + '/k' + Math.random().toString(36).slice(2), key: 'k' + Date.now() });
export const child = (r, p) => ({ path: r.path + '/' + p, key: p });
export const onDisconnect = () => ({ set: ok, update: ok, remove: ok, cancel: ok });
