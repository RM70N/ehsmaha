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
  try {
    ownSessionId = localStorage.getItem('ehsmaha_admin_session_id') || genId('s');
    localStorage.setItem('ehsmaha_admin_session_id', ownSessionId);
  } catch (err) {
    // تخزين محلي محجوب (تصفّح خاص/إعدادات صارمة) — نكمل بمعرّف مؤقت بدل ما نرمي.
    ownSessionId = ownSessionId || genId('s');
  }
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

// resolveReady معرَّف بمتغيّر منفصل خارج الكائن — تمريره داخل executor
// الـPromise ووصوله لخاصية على AdminAuth نفسه (AdminAuth._resolveReady) كان
// يحاول يقرأ AdminAuth وهو لسه بمنطقة "temporal dead zone" (const لسه ما
// خلص تعريفه)، فيرمي "Cannot access 'AdminAuth' before initialization" ويوقف
// تحميل كل اللوحة فوراً — هذا بالضبط سبب الشاشة الفاضية بدون أي كتابة خطأ
// ظاهرة قبل إضافة شبكة الأمان بـindex.html.
let resolveReady;
const readyPromise = new Promise((resolve) => { resolveReady = resolve; });

// سطر التقدّم بشاشة الإقلاع — نكمل الحكاية من حيث وقّفتها firebase.js.
function bootNote(text) {
  try {
    const el = document.getElementById('admin-boot-note');
    if (el) el.textContent = text;
  } catch (err) {}
}

// بوابة واحدة لحلّ ready — تُنادى من أكثر من مكان (حالة المصادقة، وحارس
// المهلة) فلازم تكون آمنة للتكرار.
let readyDone = false;
function markAuthReady() {
  if (readyDone) return;
  readyDone = true;
  authResolved = true;
  resolveReady();
}

// حارس المهلة — أهم سطر بهذا الملف. app.js يبدأ بـ`await AdminAuth.ready`،
// فأي تعليق قبل حلّها = دوران لا نهائي بشاشة الإقلاع بلا أي خطأ ظاهر
// (وهذا بالضبط العطل اللي صار: المكتبات حمّلت، ثم وقف كل شي).
// سببان معروفان يعلّقان بلا ما يرموا خطأ:
//   • setPersistence ما يستقر (تخزين محجوب/مقسَّم بالمتصفح).
//   • onAuthStateChanged ما ينطلق لأن Auth ما قدر يحسم الحالة الأولية.
// بدل ما ننتظرهم للأبد، بعد 8 ثواني نعتبر المستخدم "غير مسجَّل دخول"
// ونعرض شاشة الدخول — أسوأ حالة يضغط دخول ويشوف خطأ واضح، بدل شاشة تدور.
const AUTH_READY_TIMEOUT_MS = 8000;
setTimeout(() => {
  if (readyDone) return;
  console.warn('⚠️ حالة تسجيل الدخول ما انحسمت خلال ' + (AUTH_READY_TIMEOUT_MS / 1000) + ' ثواني — نعرض شاشة الدخول.');
  bootNote('تعذّر تأكيد حالة تسجيل الدخول — جارٍ عرض شاشة الدخول...');
  markAuthReady();
  listeners.forEach((cb) => { try { cb(AdminAuth.currentAdmin); } catch (err) {} });
}, AUTH_READY_TIMEOUT_MS);

export const AdminAuth = {
  currentAdmin: null,
  sessionId: null,
  ready: readyPromise,

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

// setPersistence بمهلة: لو ما استقر (تخزين محجوب مثلاً) ما نعلّق تسجيل
// المستمع عليه للأبد — نكمل بدونه، والجلسة تصير جلسة تبويب بس وهذا مقبول
// جداً مقابل لوحة تشتغل. و.catch لازم عشان رفض متأخر ما يطلع غير معالَج.
bootNote('جارٍ التحقق من تسجيل الدخول...');
const persistence = fb.setPersistence(fb.auth, fb.browserLocalPersistence);
persistence.catch(() => {});
Promise.race([
  persistence,
  new Promise((resolve) => setTimeout(resolve, 4000)),
]).catch(() => {}).finally(() => {
  fb.onAuthStateChanged(fb.auth, (user) => {
    if (user && user.email === OWNER_EMAIL) {
      AdminAuth.currentAdmin = user;
      AdminAuth.sessionId = ownSessionId;
      // **بدون await**: هذي كتابة Firestore، وكتابات Firestore وهو مقطوع عن
      // الشبكة **ما ترفض** — تبقى معلّقة بالطابور المحلي للأبد لين يرجع
      // الاتصال. انتظارها هنا كان يمنع حلّ ready، يعني اللوحة تدور بلا نهاية
      // لمجرد إن تسجيل جلسة (بيانات تتبّع ثانوية) ما وصل الخادم.
      registerOwnSession().then(() => { AdminAuth.sessionId = ownSessionId; }).catch(() => {});
    } else {
      if (user) {
        // احتياط إضافي فقط — login() أصلاً يسجّل خروج أي حساب غير مصرَّح له
        // قبل ما توصل الحالة هنا بمعظم الحالات.
        try { fb.signOut(fb.auth); } catch (err) {}
      }
      teardownOwnSession();
      AdminAuth.currentAdmin = null;
      AdminAuth.sessionId = null;
    }
    markAuthReady();
    listeners.forEach((cb) => { try { cb(AdminAuth.currentAdmin); } catch (err) {} });
  }, (err) => {
    // حتى لو فشل مستمع المصادقة نفسه — نعرض شاشة الدخول بدل ما نعلّق.
    console.warn('onAuthStateChanged فشل:', err);
    markAuthReady();
    listeners.forEach((cb) => { try { cb(null); } catch (e) {} });
  });
});

window.AdminAuth = AdminAuth;
