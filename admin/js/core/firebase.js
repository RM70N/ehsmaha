// ==================== Firebase init — لوحة "ادمن احسمها" ====================
// نفس مشروع Firebase الخاص بـehsmaha.com بالضبط (قراءة/كتابة فعلية على نفس
// قاعدة البيانات) — القيم منسوخة حرفياً من index.html الموقع الرئيسي حتى
// تبقى اللوحتان متزامنتين دائماً على نفس المصدر.
import { buildResilientFB } from './fb-resilient.js';

// ==================== تحميل Firebase SDK بمصادر بديلة ====================
// المشكلة الواقعية: الاستيراد الثابت من gstatic.com وحده يعني إن اللوحة كلها
// تموت لو كان gstatic بطيئاً أو محجوباً (شبكة جوال ضعيفة، إضافة حظر إعلانات،
// مزوّد يحجب نطاقات جوجل) — تطلع شاشة "تعذّر تحميل اللوحة" بلا أي بديل.
// الحل: استيراد ديناميكي يجرّب أكثر من شبكة توصيل بالترتيب، وأول وحدة تنجح
// تُستخدم. نستعمل top-level await فالوحدات اللي تستورد AdminFB تنتظر تلقائياً
// بدون أي تعديل على الأقسام الستين.
const SDK_VERSION = '12.15.0';
const CDNS = [
  (m) => `https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-${m}.js`,
  (m) => `https://cdn.jsdelivr.net/npm/firebase@${SDK_VERSION}/firebase-${m}.js`,
  (m) => `https://unpkg.com/firebase@${SDK_VERSION}/firebase-${m}.js`,
];

function bootNote(text) {
  try {
    const el = document.getElementById('admin-boot-note');
    if (el) el.textContent = text;
  } catch (err) {}
}

// مهلة لكل محاولة: بدونها محاولة معلّقة على شبكة بطيئة تمنعنا من تجربة
// المصدر البديل أصلاً، فننتظر للأبد على أول مصدر فاشل.
const PER_CDN_TIMEOUT_MS = 12000;

async function loadFirebaseModule(name) {
  let lastErr = null;
  for (let i = 0; i < CDNS.length; i++) {
    const url = CDNS[i](name);
    try {
      bootNote(`جارٍ تحميل ${name}${i ? ` (مصدر بديل ${i + 1})` : ''}...`);
      // مهم: نعلّق .catch على الاستيراد نفسه. لو انتهت المهلة وفزنا بالسباق
      // ثم فشل الاستيراد متأخراً، يصير رفضاً غير معالَج (unhandledrejection)
      // — وشبكة الأمان بـindex.html تلتقطه وتعرض "تعذّر تحميل اللوحة" **وإحنا
      // بالأصل ناجحين بالمصدر البديل**. هذا الـcatch يبتلع الرفض المتأخر فقط.
      const importing = import(/* @vite-ignore */ url);
      importing.catch(() => {});
      let timer;
      const mod = await Promise.race([
        importing,
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('مهلة التحميل انتهت (' + (PER_CDN_TIMEOUT_MS / 1000) + ' ثانية)')), PER_CDN_TIMEOUT_MS); }),
      ]);
      clearTimeout(timer);
      if (mod) return mod;
    } catch (err) {
      lastErr = err;
      console.warn('تعذّر تحميل ' + url + ' — ' + ((err && err.message) || err));
    }
  }
  throw new Error(`تعذّر تحميل مكتبة Firebase (${name}) من كل المصادر المتاحة. آخر خطأ: ${(lastErr && lastErr.message) || lastErr}`);
}

// نحمّل app أولاً (الأصغر) — لو نجح فالشبكة سالكة، ثم الباقي بالتوازي.
const appMod = await loadFirebaseModule('app');
const [authMod, fsMod, dbMod] = await Promise.all([
  loadFirebaseModule('auth'),
  loadFirebaseModule('firestore'),
  loadFirebaseModule('database'),
]);
bootNote('تم تحميل المكتبات — جارٍ تجهيز اللوحة...');

const { initializeApp } = appMod;
const {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, sendPasswordResetEmail
} = authMod;
const {
  getFirestore, initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, serverTimestamp, collection, onSnapshot, query, where, orderBy,
  limit, startAfter, getDocs, getCountFromServer, increment, arrayUnion, arrayRemove,
  deleteField, writeBatch, documentId
} = fsMod;
const {
  getDatabase, ref: rtdbRef, get: rtdbGet, set: rtdbSet, update: rtdbUpdate,
  remove: rtdbRemove, onValue: rtdbOnValue, off: rtdbOff, serverTimestamp: rtdbServerTimestamp
} = dbMod;

const firebaseConfig = {
  apiKey: "AIzaSyCo37Dpu-tYccZcfgHqttJfh9vgOj0bTEE",
  authDomain: "streamgame-180b8.firebaseapp.com",
  projectId: "streamgame-180b8",
  storageBucket: "streamgame-180b8.firebasestorage.app",
  messagingSenderId: "149723106437",
  appId: "1:149723106437:web:b17b83b755f086998d2dec",
  measurementId: "G-1QEFDGRFT9",
  databaseURL: "https://streamgame-180b8-default-rtdb.europe-west1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// نفس سبب الفرض بالموقع الرئيسي: بعض الشبكات (خصوصاً بالجوال) تقطع اتصال
// gRPC الصامد بصمت فتُعلَّق كل القراءات/الكتابات الحيّة بدون أي خطأ ظاهر.
const db = initializeFirestore(app, { experimentalForceLongPolling: true });
// Realtime Database: مصدر أساسي لبعض الأنظمة (جسر المصير bridgeEvents،
// framesCatalogExtra) **وكمان** القاعدة الاحتياطية الكاملة للوحة كلها لو
// خلصت حصة Firestore — راجع fb-resilient.js.
let rtdb;
try { rtdb = getDatabase(app); } catch (err) { rtdb = undefined; }

// الحساب الوحيد المصرَّح له بدخول هذي اللوحة — نفس isOwner() المستخدم أصلاً
// بقواعد Firestore الحالية (firestore.rules) للموقع الرئيسي.
export const OWNER_EMAIL = 'malshaifan1@gmail.com';

// الواجهة الخام (Firestore مباشرة) — ما تُستخدم إلا من داخل طبقة الصمود.
const RawFB = {
  app, auth, db, rtdb,
  setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, sendPasswordResetEmail,
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, onSnapshot, query, where, orderBy, limit, startAfter, getDocs,
  getCountFromServer, increment, arrayUnion, arrayRemove, deleteField, writeBatch,
  documentId,
  rtdbRef, rtdbGet, rtdbSet, rtdbUpdate, rtdbRemove, rtdbOnValue, rtdbOff, rtdbServerTimestamp
};

// كل الأقسام الستين تستورد AdminFB وتستدعي fb.getDoc/fb.setDoc/... بنفس
// الأسماء — فنلفّها هنا بطبقة الصمود بدل ما نعدّل 60 ملفاً. النتيجة: أي قسم
// يشتغل تلقائياً على Firestore أو RTDB حسب توفّر الحصة بلا أي تغيير بكوده.
export const AdminFB = buildResilientFB(RawFB);

window.AdminFB = AdminFB;
window.AdminFBRaw = RawFB;
