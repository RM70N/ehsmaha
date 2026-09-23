'use strict';

// إعدادات طبقة الـAPI (خدمة منفصلة عن البوت على Render).
// نفس مبدأ البوت: تحقق كامل عند الإقلاع ورسالة واضحة لو ناقص شي.

require('dotenv').config({ quiet: true });

function readInt(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${name} غير صالح ("${raw}") — المتوقع رقم بين ${min} و${max}`);
  return n;
}

function buildApiConfig() {
  const problems = [];

  if (!process.env.API_KEY) problems.push('- API_KEY مفقود (نفس المفتاح اللي بخدمة البوت)');
  else if (process.env.API_KEY.length < 24) problems.push('- API_KEY قصير جداً — 32 حرف عشوائي على الأقل');

  const hasServiceAccount = !!(process.env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  if (!hasServiceAccount) {
    problems.push('- FIREBASE_SERVICE_ACCOUNT مفقود: محتوى ملف Service Account JSON (أو base64 له) من Firebase Console → Project settings → Service accounts');
  }

  let numbers = {};
  try {
    numbers = {
      port: readInt('PORT', 3000, 1, 65535),
      leaderboardCacheSeconds: readInt('API_LEADERBOARD_CACHE_SECONDS', 120, 0, 900),
      weekStartDay: readInt('WEEK_START_DAY', 0, 0, 6), // 0 = الأحد
      timezoneOffsetMinutes: readInt('TIMEZONE_OFFSET_MINUTES', 180, -720, 840) // توقيت السعودية UTC+3
    };
  } catch (err) {
    problems.push('- ' + err.message);
  }

  if (problems.length) {
    const error = new Error('إعدادات طبقة الـAPI ناقصة أو غير صالحة:\n' + problems.join('\n'));
    error.code = 'CONFIG_INVALID';
    throw error;
  }

  const siteUrl = String(process.env.SITE_URL || 'https://ehsmaha.com').replace(/\/+$/, '');

  return Object.freeze({
    apiKey: process.env.API_KEY,
    siteUrl,
    profileUrl: siteUrl + '/profile',
    firebaseDatabaseUrl: process.env.FIREBASE_DATABASE_URL || '',
    ...numbers
  });
}

let cached = null;
function loadApiConfig() {
  if (!cached) cached = buildApiConfig();
  return cached;
}

module.exports = { loadApiConfig };
