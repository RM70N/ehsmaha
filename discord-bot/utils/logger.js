'use strict';

// سجلّ منظّم مشترك بين البوت وطبقة الـAPI (winston).
// - بالإنتاج (NODE_ENV=production): سطر JSON لكل حدث — Render يعرضه ويسهل البحث فيه.
// - بالتطوير: سطر ملوّن مقروء.
// - أي نص يشبه توكن/مفتاح يُستبدل بـ[REDACTED] قبل الكتابة، حتى لو انمرّر
//   بالغلط داخل رسالة خطأ أو كائن meta — التوكنات ما توصل للسجلات أبداً.

const winston = require('winston');

const SENSITIVE_KEYS = /^(token|discord_token|api_key|apikey|x-api-key|authorization|password|secret|private_key|privatekey|idtoken|credential|cookie)$/i;

// أنماط القيم الحساسة نفسها (مو بس المفاتيح): توكن بوت ديسكورد، Bearer، مفاتيح خاصة.
const SENSITIVE_PATTERNS = [
  /[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,40}/g, // توكن بوت ديسكورد
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
];

// قيم الأسرار الفعلية من البيئة — تُحجب حرفياً أينما ظهرت.
function secretValues() {
  return ['DISCORD_TOKEN', 'API_KEY', 'FIREBASE_SERVICE_ACCOUNT']
    .map((k) => process.env[k])
    .filter((v) => typeof v === 'string' && v.length >= 8);
}

function redactString(str) {
  let out = str;
  for (const secret of secretValues()) out = out.split(secret).join('[REDACTED]');
  for (const re of SENSITIVE_PATTERNS) out = out.replace(re, '[REDACTED]');
  return out;
}

function redact(value, depth = 0) {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message || ''), code: value.code, stack: redactString(value.stack || '') };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

const redactFormat = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (key === 'level' || typeof key === 'symbol') continue;
    info[key] = SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(info[key]);
  }
  return info;
});

const isProduction = process.env.NODE_ENV === 'production';

const devFormat = winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
  const rest = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
  return `${timestamp} [${service}] ${level}: ${message}${rest}`;
});

function createLogger(service) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    format: winston.format.combine(
      winston.format.errors({ stack: true }),
      redactFormat(),
      winston.format.timestamp()
    ),
    transports: [
      new winston.transports.Console({
        format: isProduction
          ? winston.format.json()
          : winston.format.combine(winston.format.colorize(), devFormat)
      })
    ],
    exitOnError: false
  });
}

// لوجر افتراضي للبوت؛ الـAPI ينشئ لوجر خاص فيه باسم خدمة مختلف.
const logger = createLogger('bot');

module.exports = logger;
module.exports.createLogger = createLogger;
module.exports.redact = redact;
