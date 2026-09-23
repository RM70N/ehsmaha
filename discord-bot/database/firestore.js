'use strict';

// الاتصال بقاعدة بيانات الموقع الفعلية (Firebase — مشروع streamgame-180b8).
//
// الموقع يخزن كل بياناته في Cloud Firestore (+ Realtime Database كنسخة
// احتياطية لبعض الحقول). هذي الطبقة تستخدم Firebase Admin SDK بصلاحيات
// Service Account، فهي **تتجاوز قواعد الأمان (firestore.rules)** — لذلك تعمل
// من السيرفر فقط، ومجموعات البوت الخاصة (discordApiStats...) تبقى مقفلة
// تماماً أمام المتصفحات بالقاعدة العامة "match /{document=**} → false".

const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath, Timestamp, AggregateField } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

function parseServiceAccount(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  // يقبل JSON مباشرة أو base64 (أسهل للصق بواجهة Render بسطر واحد)
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  const parsed = JSON.parse(json);
  if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT ناقص: يلزم project_id و client_email و private_key');
  }
  return parsed;
}

let app = null;

function init({ databaseURL } = {}) {
  if (app) return app;
  let credential;
  let projectId;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let account;
    try {
      account = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
      const e = new Error('تعذّر قراءة FIREBASE_SERVICE_ACCOUNT: ' + err.message);
      e.code = 'CONFIG_INVALID';
      throw e;
    }
    credential = cert(account);
    projectId = account.project_id;
  } else {
    // GOOGLE_APPLICATION_CREDENTIALS (مسار ملف) — مفيد محلياً
    credential = applicationDefault();
  }
  app = initializeApp({ credential, projectId, ...(databaseURL ? { databaseURL } : {}) });
  getFirestore(app).settings({ ignoreUndefinedProperties: true });
  return app;
}

function db() {
  if (!app) throw new Error('Firestore غير مهيأ — استدعِ init() أولاً');
  return getFirestore(app);
}

// Realtime Database اختيارية: الموقع يكتب بعض حقول levels/{key} هناك كفولباك
function rtdb() {
  if (!app || !app.options.databaseURL) return null;
  return getDatabase(app);
}

module.exports = {
  init,
  db,
  rtdb,
  auth: () => getAuth(app),
  FieldValue,
  FieldPath,
  Timestamp,
  AggregateField,
  parseServiceAccount
};
