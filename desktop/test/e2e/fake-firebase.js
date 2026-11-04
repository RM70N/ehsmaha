'use strict';
/**
 * Firebase وهمي لاختبارات E2E بلا إنترنت: يولّد وحدات ES بنفس أسماء التصدير التي
 * يستوردها index.html، ويكشف window.__fakeFs لحقن مستندات onSnapshot وفحص
 * signInWithCredential. هذا يختبر التطبيق (جسر الإشعارات، تسليم الدخول، نقاط
 * الأمان) — لا يختبر Firebase الحقيقي.
 */
const fs = require('fs');
const path = require('path');

function importedNames(html, moduleFile) {
  const re = new RegExp('import\\s*\\{([^}]*)\\}\\s*from\\s*"https://www\\.gstatic\\.com/firebasejs/[\\d.]+/' + moduleFile.replace('.', '\\.') + '"', 'g');
  const names = new Set();
  let m;
  while ((m = re.exec(html))) {
    m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((s) => names.add(s.split(/\s+as\s+/)[0].trim()));
  }
  return [...names];
}

const IMPL = {
  initializeApp: '() => ({})', getAuth: '() => ({ currentUser: window.__fakeUser || null })',
  onAuthStateChanged: '(a, cb) => { setTimeout(() => cb(window.__fakeUser || null), 30); return () => {}; }',
  setPersistence: 'async () => {}', browserLocalPersistence: '{}',
  signInWithCredential: 'async (auth, cred) => { (window.__fakeFs.signins = window.__fakeFs.signins || []).push({ hasId: !!cred.idToken, hasAccess: !!cred.accessToken }); return { user: { uid: "u1" } }; }',
  signInWithCustomToken: 'async (auth, tok) => { (window.__fakeFs.customSignins = window.__fakeFs.customSignins || []).push(tok); return { user: { uid: "u1" } }; }',
  getRedirectResult: 'async () => null', signOut: 'async () => {}',
  getFirestore: '() => ({})', initializeFirestore: '() => ({})',
  doc: '(db, ...p) => ({ __path: p.join("/") })', collection: '(db, ...p) => ({ __path: p.join("/") })',
  onSnapshot: '(ref, cb) => { const k = ref.__path; (window.__fakeFs.l[k] = window.__fakeFs.l[k] || []).push(cb); window.__fakeFs.subs.push(k); return () => {}; }',
  getDoc: 'async () => ({ exists: () => false, data: () => null })', getDocFromServer: 'async () => ({ exists: () => false, data: () => null })',
  getDocs: 'async () => ({ docs: [], empty: true, size: 0, forEach() {} })', getCountFromServer: 'async () => ({ data: () => ({ count: 0 }) })',
  setDoc: 'async () => {}', updateDoc: 'async () => {}', deleteDoc: 'async () => {}', runTransaction: 'async () => {}',
  serverTimestamp: '() => null', increment: '(n) => n', arrayUnion: '() => null', arrayRemove: '() => null', deleteField: '() => null',
  query: '(...a) => a[0]', where: '() => ({})',
  getDatabase: '() => ({})', rtdbRef: '() => ({})', ref: '() => ({})', child: '() => ({})', push: '() => ({})',
  set: 'async () => {}', get: 'async () => ({ exists: () => false, val: () => null })', remove: 'async () => {}', update: 'async () => {}',
  onValue: '() => () => {}', off: '() => {}', onDisconnect: '() => ({ remove: async () => {}, set: async () => {} })',
  limitToLast: '() => ({})', orderByChild: '() => ({})', startAt: '() => ({})',
};

function moduleSource(names, isAuth) {
  const lines = ["window.__fakeFs = window.__fakeFs || { l: {}, subs: [], emit(path, data) { const conv = (v) => (v && typeof v === 'object' ? (v.__ms !== undefined ? { toMillis: () => v.__ms, seconds: v.__ms / 1000 } : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, conv(x)]))) : v); data = conv(data); (this.l[path] || []).forEach((cb) => cb({ exists: () => true, data: () => data })); } };"];
  for (const n of names) {
    if (n === 'GoogleAuthProvider') {
      lines.push('export class GoogleAuthProvider { static credential(idToken, accessToken) { return { idToken, accessToken }; } static credentialFromResult() { return null; } }');
    } else if (n === 'signInWithPopup' || n === 'signInWithRedirect') {
      lines.push(`export const ${n} = async () => { throw Object.assign(new Error('popup'), { code: 'auth/popup-blocked' }); };`);
    } else if (IMPL[n]) {
      lines.push(`export const ${n} = ${IMPL[n]};`);
    } else {
      lines.push(`export const ${n} = async () => ({});`);
    }
  }
  return lines.join('\n');
}

/** يركّب route على صفحة Playwright لإحلال وحدات Firebase بنسخ وهمية وحجب باقي الشبكة الخارجية. */
async function installFakeFirebase(page, indexHtmlPath) {
  const html = fs.readFileSync(indexHtmlPath || path.join(__dirname, '..', '..', 'site', 'index.html'), 'utf8');
  const mods = {
    'firebase-app.js': importedNames(html, 'firebase-app.js'),
    'firebase-auth.js': importedNames(html, 'firebase-auth.js'),
    'firebase-firestore.js': importedNames(html, 'firebase-firestore.js'),
    'firebase-database.js': importedNames(html, 'firebase-database.js'),
  };
  mods['firebase-auth.js'] = [...new Set([...mods['firebase-auth.js'], 'signInWithCredential', 'signInWithCustomToken', 'GoogleAuthProvider'])];
  await page.context().route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    const m = url.match(/\/firebasejs\/[\d.]+\/(firebase-[a-z]+\.js)/);
    if (m && mods[m[1]]) return route.fulfill({ status: 200, contentType: 'text/javascript', body: moduleSource(mods[m[1]], m[1] === 'firebase-auth.js') });
    return route.abort();
  });
  return mods;
}

module.exports = { installFakeFirebase, importedNames };
