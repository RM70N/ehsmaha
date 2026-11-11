// إعدادات اللوحة القابلة للتعديل وقت التشغيل: قيم محدودة الحدود + إصدارات + سجل (تراجع آمن). تُحفظ في قاعدة اللوحة.
import { now } from '../lib/util.js';

export const SETTING_DEFS = {
  sessionIdleMinutes: { label: 'مهلة خمول الجلسة (دقائق)', min: 5, max: 240, ownerOnly: true },
  sessionMaxHours: { label: 'أقصى عمر للجلسة (ساعات)', min: 1, max: 72, ownerOnly: true },
  loginFreeFails: { label: 'محاولات الدخول الفاشلة قبل القفل', min: 1, max: 10, ownerOnly: true },
  loginMaxLockSec: { label: 'أقصى مدة قفل بعد الفشل (ثوانٍ)', min: 30, max: 3600, ownerOnly: true },
  loginIpMax: { label: 'أقصى محاولات دخول لكل IP في النافذة', min: 5, max: 200, ownerOnly: true },
  healthIntervalSec: { label: 'فترة فحص صحة الخدمات (ثوانٍ)', min: 30, max: 3600 },
  healthRetentionDays: { label: 'مدة الاحتفاظ بسجل الفحوصات (أيام)', min: 1, max: 30 }
};

export function createSettings({ store, cfg }) {
  const col = store.col('settings');
  const defaults = {
    sessionIdleMinutes: cfg.session.idleMinutes, sessionMaxHours: cfg.session.maxHours, loginFreeFails: cfg.loginRate.freeFails,
    loginMaxLockSec: cfg.loginRate.maxLockSec, loginIpMax: cfg.loginRate.ipMax, healthIntervalSec: cfg.healthIntervalSec, healthRetentionDays: 7
  };
  const doc = () => col.get('app') || { version: 0, values: {}, history: [] };
  return {
    defs: SETTING_DEFS, defaults,
    get: (k) => doc().values[k] ?? defaults[k],
    all() { const d = doc(); return { version: d.version, values: Object.fromEntries(Object.keys(defaults).map((k) => [k, d.values[k] ?? defaults[k]])), overrides: d.values, history: d.history.slice(-30).reverse() }; },
    // تحديث بإصدار متفائل + سجل قبل/بعد
    set(key, value, by, expectedVersion) {
      const def = SETTING_DEFS[key]; if (!def) throw new Error('unknown');
      return store.tx(() => {
        const d = doc();
        if (expectedVersion != null && expectedVersion !== d.version) return { conflict: true };
        const prev = d.values[key] ?? defaults[key];
        const next = { version: d.version + 1, values: { ...d.values, [key]: value }, history: [...d.history, { version: d.version + 1, key, from: prev, to: value, by, at: now() }].slice(-100) };
        col.set('app', next);
        return { conflict: false, prev, version: next.version };
      });
    },
    reset(key, by) { return store.tx(() => { const d = doc(); const { [key]: _, ...rest } = d.values; const next = { version: d.version + 1, values: rest, history: [...d.history, { version: d.version + 1, key, from: d.values[key] ?? defaults[key], to: defaults[key], by, at: now(), reset: true }].slice(-100) }; col.set('app', next); return { version: next.version }; }); },
    rollbackTo(version, by) {
      return store.tx(() => {
        const d = doc(); const h = d.history.find((x) => x.version === version); if (!h) return { notFound: true };
        const next = { version: d.version + 1, values: { ...d.values, [h.key]: h.from }, history: [...d.history, { version: d.version + 1, key: h.key, from: d.values[h.key] ?? defaults[h.key], to: h.from, by, at: now(), rollbackOf: version }].slice(-100) };
        col.set('app', next); return { version: next.version, key: h.key, value: h.from };
      });
    }
  };
}
