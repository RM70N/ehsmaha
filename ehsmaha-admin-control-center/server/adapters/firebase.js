// Firebase Admin Adapter: Firestore + Realtime Database + Auth — من الخادم فقط (الأسرار لا تصل المتصفح).
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase, ServerValue } from 'firebase-admin/database';
const now = () => Date.now();

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

  // قاطع حصة Firestore: عند نفادها (RESOURCE_EXHAUSTED) نتوقف عن إرسال طلبات Firestore (لا فائدة منها وتُبطئ) ونجرّب مرة كل 15 دقيقة.
  // الحصة تتجدد يومياً (منتصف الليل بتوقيت المحيط الهادئ).
  const quota = { until: 0, since: 0, trips: 0 };
  const quotaErr = () => { const e = new Error('8 RESOURCE_EXHAUSTED: Quota exceeded (قاطع اللوحة: نجرّب لاحقاً)'); e.code = 8; return e; };
  const api = {
    get available() { return state.available; },
    quota,
    noteError(e) { if (e && (e.code === 8 || /RESOURCE_EXHAUSTED|Quota exceeded/i.test(String(e.message || ''))) && now() >= quota.until) { if (!quota.since) quota.since = now(); quota.until = now() + 15 * 60_000; quota.trips++; } },
    noteOk() { quota.until = 0; quota.since = 0; },
    get reason() { return state.reason; },
    FieldValue, Timestamp, ServerValue,
    db() { need(); if (now() < quota.until) throw quotaErr(); return getFirestore(state.app); },
    auth() { need(); return getAuth(state.app); },
    rtdb() { need(); return getDatabase(state.app); },
    withTimeout,
    // فحوصات حقيقية بزمن استجابة فعلي — لا نجاح بلا قراءة فعلية
    async pingFirestore() { const t = Date.now(); try { await withTimeout(api.db().collection('config').doc('homeStats').get(), 6000, 'Firestore'); } catch (e) { api.noteError(e); throw e; } api.noteOk(); return { ok: true, ms: Date.now() - t }; },
    async pingRtdb() { const t = Date.now(); await withTimeout(api.rtdb().ref('opsConfig/current').limitToFirst(1).get(), 6000, 'RTDB'); return { ok: true, ms: Date.now() - t }; },
    async pingAuth() { const t = Date.now(); await withTimeout(api.auth().listUsers(1), 6000, 'Auth'); return { ok: true, ms: Date.now() - t }; },
    async close() { if (state.app) await deleteApp(state.app).catch(() => {}); }
  };
  return api;
}
