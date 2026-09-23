'use strict';

// طبقة API "احسمها ↔ ديسكورد" (Express).
// تشتغل كخدمة Web مستقلة على Render، وتتصل مباشرة بقاعدة بيانات الموقع
// (Firebase) عبر Admin SDK. البوت هو العميل الوحيد، ويكلمها بـx-api-key.

const express = require('express');
const helmet = require('helmet');
const { createLogger } = require('../utils/logger');

const logger = createLogger('api');

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { error: reason instanceof Error ? reason : { value: String(reason) } });
});
process.on('uncaughtException', (error, origin) => {
  logger.error('uncaughtException', { error, origin });
});

const { loadApiConfig } = require('./config');
let config;
try {
  config = loadApiConfig();
} catch (err) {
  console.error('\n❌ ' + err.message + '\n\nراجع متغيرات البيئة (انسخ .env.example كبداية).\n');
  process.exit(1);
}

const firestore = require('../database/firestore');
const C = require('../database/collections');
try {
  firestore.init({ databaseURL: config.firebaseDatabaseUrl });
} catch (err) {
  console.error('\n❌ ' + err.message + '\n');
  process.exit(1);
}

const apiStats = require('./services/apiStats');
const leaderboard = require('./services/leaderboard');
const { createDiscordRouter } = require('./routes/discord');
const { notFoundHandler, createErrorHandler } = require('./middleware/errorHandler');
const { startJobs } = require('./jobs');

leaderboard.setLogger(logger);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // Render أمام السيرفر بـproxy واحد — عشان IP الحقيقي بمحدد المعدل

app.use(helmet());

// سجل مختصر لكل طلب (بدون أي هيدرات — ما نسجل المفاتيح أو التوكنات)
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    // 404 (لاعب غير موجود) طبيعية جداً — ما نزعج السجل فيها
    if (level === 'warn' && res.statusCode === 404) return;
    logger[level]('request', { method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started });
  });
  next();
});

// فحص الصحة (Render Health Check) — يتأكد إن Firestore يستجيب فعلاً
app.get('/health', async (req, res) => {
  try {
    await Promise.race([
      firestore.db().collection(C.DISCORD_API_STATS).limit(1).get(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('firestore timeout')), 4000))
    ]);
    res.json({ ok: true, data: { status: 'ok', uptime: Math.floor(process.uptime()) } });
  } catch (err) {
    logger.warn('health check: Firestore لا يستجيب', { error: err });
    res.status(503).json({ ok: false, error: { code: 'UNAVAILABLE', message: 'قاعدة البيانات لا تستجيب' } });
  }
});

app.use('/api/discord', apiStats.middleware, createDiscordRouter(config));
app.use(notFoundHandler);
app.use(createErrorHandler(logger));

apiStats.start(logger);
const stopJobs = startJobs(config, logger);

const server = app.listen(config.port, () => {
  logger.info('✅ طبقة API احسمها-ديسكورد تعمل', { port: config.port });
});
server.on('error', (err) => {
  logger.error('فشل تشغيل السيرفر', { error: err });
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`استلام ${signal} — إيقاف الـAPI بهدوء`);
  setTimeout(() => process.exit(0), 8000).unref();
  stopJobs();
  server.close();
  await apiStats.stop().catch(() => {});
  process.exit(0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
