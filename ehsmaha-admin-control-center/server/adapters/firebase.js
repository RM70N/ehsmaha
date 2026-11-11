// Firebase Admin Adapter: Firestore + Realtime Database + Auth — من الخادم فقط (الأسرار لا تصل المتصفح).
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, ServerValue } from 'firebase-admin/database';

function parseServiceAccount(raw) {
  if (!raw) return null;
  const txt = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const j = JSON.parse(txt);
  if (j.private_key) j.private_key = j.private_key.replace(/\\n/g, '\n');
  return j;
}

export function createFirebase(cfg) {
  const fb = cfg.firebase;
  const state = { available: false, reason: '', app: null };
  try {
    const sa = parseServiceAccount(fb.serviceAccount);
    if (!sa && !fb.emulator && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      state.reason = 'لم تُضبط بيانات Firebase (FIREBASE_SERVICE_ACCOUNT)';
    } else {
      const opts = { projectId: fb.projectId, databaseURL: fb.databaseURL };
      if (sa) opts.credential = cert(sa);
      state.app = initializeApp(opts, 'ecc-' + Math.random().toString(36).slice(2, 8));
      state.available = true;
    }
  } catch (e) {
    state.reason = 'فشل تهيئة Firebase: ' + (e.code || e.message);
  }

  const need = () => { if (!state.available) { const err = new Error(state.reason || 'Firebase غير متاح'); err.code = 'FIREBASE_UNAVAILABLE'; throw err; } };
  const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' تجاوز ' + ms + 'ms')), ms))]);

  const api = {
    get available() { return state.available; },
    get reason() { return state.reason; },
    FieldValue, Timestamp, ServerValue,
    db() { need(); return getFirestore(state.app); },
    auth() { need(); return getAuth(state.app); },
    rtdb() { need(); return getDatabase(state.app); },
    withTimeout,
    // فحوصات حقيقية بزمن استجابة فعلي — لا نجاح بلا قراءة فعلية
    async pingFirestore() { const t = Date.now(); await withTimeout(api.db().collection('config').doc('homeStats').get(), 6000, 'Firestore'); return { ok: true, ms: Date.now() - t }; },
    async pingRtdb() { const t = Date.now(); await withTimeout(api.rtdb().ref('opsConfig/current').limitToFirst(1).get(), 6000, 'RTDB'); return { ok: true, ms: Date.now() - t }; },
    async pingAuth() { const t = Date.now(); await withTimeout(api.auth().listUsers(1), 6000, 'Auth'); return { ok: true, ms: Date.now() - t }; },
    async close() { if (state.app) await deleteApp(state.app).catch(() => {}); }
  };
  return api;
}
