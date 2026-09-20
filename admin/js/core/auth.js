// ==================== المصادقة الحصرية — لوحة "ادمن احسمها" ====================
// حساب واحد فقط مصرَّح له بدخول اللوحة (نفس isOwner() المستخدم بقواعد
// Firestore للموقع الرئيسي). أي حساب Firebase Auth آخر ينجح بتسجيل الدخول
// (حساب حقيقي موجود لكنه غير مصرَّح له) يُرفض فوراً ويُسجَّل في
// adminLoginAttempts — وكذلك أي محاولة فاشلة (كلمة مرور خاطئة) على نفس
// إيميل الأدمن. هذا يغطي القسم 11 (الأمان) بند 1، والقسم 30 بند 3، 15.
import { AdminFB, OWNER_EMAIL } from './firebase.js';

const fb = AdminFB;
const listeners = [];
let authResolved = false;
let ownSessionId = null;
let ownSessionUnsub = null;
let ownSessionInterval = null;

function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

// موقع تقريبي (IP/مدينة/دولة) عبر خدمة عامة بلا مفتاح — أفضل مجهود فقط،
// يُستخدم لسجل محاولات الدخول (11.7) وجلسات الأدمن، ما يوقف أي شي لو فشل.
async function fetchApproxGeo() {
  try {
    const res = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!res.ok) throw new Error('geo lookup failed');
    const data = await res.json();
    return { ip: data.ip || null, city: data.city || null, country: data.country_name || null };
  } catch (err) {
    return { ip: null, city: null, country: null };
  }
}

async function logAttempt({ emailAttempted, success, reason }) {
  try {
    const geo = await fetchApproxGeo();
    await fb.setDoc(fb.doc(fb.db, 'adminLoginAttempts', genId('a')), {
      ts: fb.serverTimestamp(),
      emailAttempted: emailAttempted || null,
      success: !!success,
      reason: reason || null,
      userAgent: navigator.userAgent || null,
      ip: geo.ip, city: geo.city, country: geo.country
    });
  } catch (err) { /* best-effort — لا يوقف تدفق تسجيل الدخول */ }
}

async function registerOwnSession() {
  ownSessionId = localStorage.getItem('ehsmaha_admin_session_id') || genId('s');
  localStorage.setItem('ehsmaha_admin_session_id', ownSessionId);
  try {
    await fb.setDoc(fb.doc(fb.db, 'adminOwnSessions', ownSessionId), {
      userAgent: navigator.userAgent || null,
      platform: navigator.platform || null,
      startedAt: fb.serverTimestamp(),
      lastSeen: fb.serverTimestamp(),
      forceLogout: false
    }, { merge: true });
  } catch (err) { /* best-effort */ }
  if (!ownSessionInterval) {
    ownSessionInterval = setInterval(() => {
      try {
        fb.updateDoc(fb.doc(fb.db, 'adminOwnSessions', ownSessionId), { lastSeen: fb.serverTimestamp() });
      } catch (err) {}
    }, 120000);
  }
  if (ownSessionUnsub) ownSessionUnsub();
  ownSessionUnsub = fb.onSnapshot(fb.doc(fb.db, 'adminOwnSessions', ownSessionId), (snap) => {
    const data = snap.data();
    // 30.15 / 11.14: تسجيل خروج بعيد لهذي الجلسة بالذات من جلسة أدمن ثانية.
    if (data && data.forceLogout) AdminAuth.signOut();
  });
}

function teardownOwnSession() {
  if (ownSessionUnsub) { ownSessionUnsub(); ownSessionUnsub = null; }
  if (ownSessionInterval) { clearInterval(ownSessionInterval); ownSessionInterval = null; }
}

export const AdminAuth = {
  currentAdmin: null,
  sessionId: null,
  ready: new Promise((resolve) => { AdminAuth._resolveReady = resolve; }),

  onAuthChange(cb) {
    listeners.push(cb);
    if (authResolved) cb(AdminAuth.currentAdmin);
  },

  async login(email, pass) {
    try {
      const cred = await fb.signInWithEmailAndPassword(fb.auth, email, pass);
      if (cred.user.email !== OWNER_EMAIL) {
        await logAttempt({ emailAttempted: cred.user.email, success: false, reason: 'حساب حقيقي لكنه غير مصرَّح له بدخول اللوحة' });
        try { await fb.signOut(fb.auth); } catch (err) {}
        return { ok: false, reason: 'هذا الحساب غير مصرَّح له بدخول لوحة "ادمن احسمها".' };
      }
      await logAttempt({ emailAttempted: email, success: true, reason: null });
      return { ok: true };
    } catch (err) {
      const code = err && err.code;
      const reason = code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found'
        ? 'إيميل أو كلمة مرور خاطئة'
        : code === 'auth/too-many-requests' ? 'محاولات كثيرة جداً — انتظر شوي وحاول مرة ثانية'
        : 'تعذّر تسجيل الدخول';
      await logAttempt({ emailAttempted: email, success: false, reason: `${reason} (${code || 'unknown'})` });
      return { ok: false, reason };
    }
  },

  async signOut() {
    teardownOwnSession();
    try { await fb.signOut(fb.auth); } catch (err) {}
  },

  // يفتح 2FA (TOTP حقيقي مطبَّق بطبقة التطبيق — راجع core/totp.js وقسم 30.2)
  // بعد التحقق من كلمة المرور فقط، إعادة المصادقة لعمليات حساسة (تغيير كلمة
  // المرور مثلاً) تُستخدم من قسم 30.1 مباشرة عبر reauthenticate أدناه.
  async reauthenticate(pass) {
    if (!AdminAuth.currentAdmin) throw new Error('NOT_LOGGED_IN');
    const credential = fb.EmailAuthProvider.credential(OWNER_EMAIL, pass);
    await fb.reauthenticateWithCredential(AdminAuth.currentAdmin, credential);
  }
};

fb.setPersistence(fb.auth, fb.browserLocalPersistence).finally(() => {
  fb.onAuthStateChanged(fb.auth, async (user) => {
    if (user && user.email === OWNER_EMAIL) {
      AdminAuth.currentAdmin = user;
      await registerOwnSession();
      AdminAuth.sessionId = ownSessionId;
    } else {
      if (user) {
        // احتياط إضافي فقط — login() أصلاً يسجّل خروج أي حساب غير مصرَّح له
        // قبل ما توصل الحالة هنا بمعظم الحالات.
        try { await fb.signOut(fb.auth); } catch (err) {}
      }
      teardownOwnSession();
      AdminAuth.currentAdmin = null;
      AdminAuth.sessionId = null;
    }
    authResolved = true;
    AdminAuth._resolveReady();
    listeners.forEach((cb) => { try { cb(AdminAuth.currentAdmin); } catch (err) {} });
  });
});

window.AdminAuth = AdminAuth;
