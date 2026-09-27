'use strict';

// طبقة API "احسمها ↔ ديسكورد" (Express).
// تتصل مباشرة بقاعدة بيانات الموقع (Firebase) عبر Admin SDK. البوت هو العميل
// الوحيد، ويكلمها بـx-api-key. تشتغل بطريقتين:
//   • مدمجة داخل البوت (الافتراضي — خدمة Render وحدة): البوت يشغّلها على منفذ
//     داخلي (127.0.0.1) عبر startApiServer() لو API_BASE_URL فاضي.
//   • خدمة مستقلة: `npm run start:api` (نفس السلوك القديم).

const express = require('express');
const helmet = require('helmet');
const { createLogger } = require('../utils/logger');

const logger = createLogger('api');

const firestore = require('../database/firestore');
const C = require('../database/collections');

// فحص الصحة (Render Health Check) — ما يقرأ Firestore مع كل طلب (كان يستهلك
// آلاف القراءات باليوم من حصة الموقع). فحص Firestore الفعلي مرة كل 10 دقائق
// بالكثير، ونتيجته تنعرض بالرد فقط: مشكلة بـFirestore (مثل تجاوز الحصة
// اليومية) ما توقف الخدمة ولا تفشّل نشر التحديثات.
const FIRESTORE_PROBE_MS = 10 * 60 * 1000;
const probe = { at: 0, ok: null, code: null, running: null };
function probeFirestore() {
  if (probe.running || Date.now() - probe.at < FIRESTORE_PROBE_MS) return;
  probe.running = Promise.race([
    firestore.db().collection(C.DISCORD_API_STATS).limit(1).get(),
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('firestore timeout'), { code: 'TIMEOUT' })), 4000))
  ])
    .then(() => {
      probe.ok = true;
      probe.code = null;
    })
    .catch((err) => {
      probe.ok = false;
      probe.code = err.code === 8 ? 'QUOTA_EXCEEDED' : String(err.code || err.message).slice(0, 40);
      logger.warn('health check: Firestore لا يستجيب', { code: probe.code });
    })
    .finally(() => {
      probe.at = Date.now();
      probe.running = null;
    });
}

function createApiApp(config) {
  const apiStats = require('./services/apiStats');
  const { createDiscordRouter } = require('./routes/discord');
  const { notFoundHandler, createErrorHandler } = require('./middleware/errorHandler');

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

  app.get('/health', (req, res) => {
    probeFirestore();
    res.json({ ok: true, data: { status: 'ok', uptime: Math.floor(process.uptime()), firestore: probe.ok === null ? 'checking' : probe.ok ? 'ok' : probe.code } });
  });

  app.use('/api/discord', apiStats.middleware, createDiscordRouter(config));
  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));
  return app;
}

/**
 * يشغّل طبقة الـAPI (Firebase + المسارات + المهام الدورية) على منفذ.
 * يرمي خطأ CONFIG_INVALID لو ناقص FIREBASE_SERVICE_ACCOUNT/API_KEY.
 * @returns {Promise<{ server, port, stop: () => Promise<void> }>}
 */
async function startApiServer({ port, host } = {}) {
  const { loadApiConfig } = require('./config');
  const config = loadApiConfig();
  firestore.init({ databaseURL: config.firebaseDatabaseUrl });

  const apiStats = require('./services/apiStats');
  const leaderboard = require('./services/leaderboard');
  const { startJobs } = require('./jobs');
  leaderboard.setLogger(logger);

  const app = createApiApp(config);
  apiStats.start(logger);
  const stopJobs = startJobs(config, logger);

  const listenPort = port === undefined ? config.port : port;
  const server = await new Promise((resolve, reject) => {
    const srv = app.listen(listenPort, host, () => resolve(srv));
    srv.once('error', reject);
  });
  logger.info('✅ طبقة API احسمها-ديسكورد تعمل', { port: server.address().port, host: host || 'all' });

  let stopped = false;
  async function stop() {
    if (stopped) return;
    stopped = true;
    stopJobs();
    require('./services/activeStreams').stopListener();
    await new Promise((r) => server.close(() => r()));
    await apiStats.stop().catch(() => {});
  }
  return { server, port: server.address().port, stop };
}

module.exports = { createApiApp, startApiServer };

// ---- تشغيل كخدمة مستقلة: node api/server.js ----
if (require.main === module) {
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', { error: reason instanceof Error ? reason : { value: String(reason) } });
  });
  process.on('uncaughtException', (error, origin) => {
    logger.error('uncaughtException', { error, origin });
  });

  startApiServer()
    .then(({ stop }) => {
      let shuttingDown = false;
      const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`استلام ${signal} — إيقاف الـAPI بهدوء`);
        setTimeout(() => process.exit(0), 8000).unref();
        await stop().catch(() => {});
        process.exit(0);
      };
      process.once('SIGTERM', () => shutdown('SIGTERM'));
      process.once('SIGINT', () => shutdown('SIGINT'));
    })
    .catch((err) => {
      console.error('\n❌ ' + err.message + '\n\nراجع متغيرات البيئة (انسخ .env.example كبداية).\n');
      process.exit(1);
    });
}
