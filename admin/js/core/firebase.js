// ==================== Firebase init — لوحة "ادمن احسمها" ====================
// نفس مشروع Firebase الخاص بـehsmaha.com بالضبط (قراءة/كتابة فعلية على نفس
// قاعدة البيانات) — القيم منسوخة حرفياً من index.html الموقع الرئيسي حتى
// تبقى اللوحتان متزامنتين دائماً على نفس المصدر.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, serverTimestamp, collection, onSnapshot, query, where, orderBy,
  limit, startAfter, getDocs, getCountFromServer, increment, arrayUnion, arrayRemove,
  deleteField, writeBatch, documentId
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  getDatabase, ref as rtdbRef, get as rtdbGet, set as rtdbSet, update as rtdbUpdate,
  remove as rtdbRemove, onValue as rtdbOnValue, off as rtdbOff, serverTimestamp as rtdbServerTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

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
// جسر المصير (bridgeEvents) وframesCatalogExtra يستخدمان Realtime Database
// كنظام احتياطي/أساسي منفصل تماماً عن Firestore — نحتاجه لقسم 34.
let rtdb;
try { rtdb = getDatabase(app); } catch (err) { rtdb = undefined; }

// الحساب الوحيد المصرَّح له بدخول هذي اللوحة — نفس isOwner() المستخدم أصلاً
// بقواعد Firestore الحالية (firestore.rules) للموقع الرئيسي.
export const OWNER_EMAIL = 'malshaifan1@gmail.com';

export const AdminFB = {
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

window.AdminFB = AdminFB;
