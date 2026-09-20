// ==================== Firebase init — لوحة "ادمن احسمها" ====================
// نفس مشروع Firebase الخاص بـehsmaha.com بالضبط (قراءة/كتابة فعلية على نفس
// قاعدة البيانات) — القيم منسوخة حرفياً من index.html الموقع الرئيسي حتى
// تبقى اللوحتان متزامنتين دائماً على نفس المصدر.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, initializeFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  runTransaction, serverTimestamp, collection, onSnapshot, query, where, orderBy,
  limit, startAfter, getDocs, getCountFromServer, increment, arrayUnion, arrayRemove,
  deleteField, writeBatch, documentId
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

// الحساب الوحيد المصرَّح له بدخول هذي اللوحة — نفس isOwner() المستخدم أصلاً
// بقواعد Firestore الحالية (firestore.rules) للموقع الرئيسي.
export const OWNER_EMAIL = 'malshaifan1@gmail.com';

export const AdminFB = {
  app, auth, db,
  setPersistence, browserLocalPersistence, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider,
  doc, getDoc, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
  collection, onSnapshot, query, where, orderBy, limit, startAfter, getDocs,
  getCountFromServer, increment, arrayUnion, arrayRemove, deleteField, writeBatch,
  documentId
};

window.AdminFB = AdminFB;
