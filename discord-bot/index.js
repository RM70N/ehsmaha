'use strict';

// نقطة تشغيل بوت "احسمها".
// الترتيب: معالجات الأخطاء العامة ← التحقق من البيئة ← تحميل الأوامر والأحداث
// ديناميكياً ← (اختياري) خادم فحص صحة لـRender ← تسجيل الدخول لـDiscord.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const logger = require('./utils/logger');

// ---- معالجات الأخطاء العامة: تسجّل ولا توقف العملية ----
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { error: reason instanceof Error ? reason : { value: String(reason) } });
});
process.on('uncaughtException', (error, origin) => {
  logger.error('uncaughtException', { error, origin });
});
process.on('warning', (warning) => {
  logger.warn('process warning', { name: warning.name, detail: warning.message });
});

// ---- التحقق من البيئة ----
const { loadConfig } = require('./config');
let config;
try {
  config = loadConfig();
} catch (err) {
  // رسالة واضحة ثم خروج — ما فيه معنى نكمل بإعدادات ناقصة
  console.error('\n❌ ' + err.message + '\n\nراجع ملف .env (انسخ .env.example كبداية).\n');
  process.exit(1);
}

const { loadCommands } = require('./utils/commandLoader');

// الأوامر كلها Slash، فيكفينا intent واحد (Guilds) — بدون MessageContent أو
// أي Privileged Intent يحتاج موافقة خاصة.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
  allowedMentions: { parse: [], repliedUser: false } // ما نمنشن أحد بالغلط أبداً
});

let loaded;
try {
  loaded = loadCommands();
} catch (err) {
  logger.error('فشل تحميل الأوامر', { error: err });
  process.exit(1);
}

const ctx = {
  client,
  config,
  logger,
  commands: loaded.commands,
  buttons: loaded.buttons,
  definitions: loaded.definitions
};

// ---- تحميل الأحداث ديناميكياً من /events ----
function registerEvents() {
  const dir = path.join(__dirname, 'events');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  let count = 0;
  for (const file of files) {
    const mod = require(path.join(dir, file));
    const handlers = Array.isArray(mod) ? mod : [mod];
    for (const h of handlers) {
      if (!h || !h.name || typeof h.execute !== 'function') {
        logger.warn('ملف حدث غير صالح — تم تجاهله', { file });
        continue;
      }
      // كل معالج محاط بحماية حتى لو نسي معالج معيّن try/catch داخله
      const safe = async (...args) => {
        try {
          await h.execute(ctx, ...args);
        } catch (err) {
          logger.error('خطأ داخل معالج حدث', { event: h.name, file, error: err });
        }
      };
      if (h.once) client.once(h.name, safe);
      else client.on(h.name, safe);
      count += 1;
    }
  }
  logger.info('تم تحميل الأحداث', { count });
}

// ---- خادم فحص صحة اختياري ----
// Render "Web Service" يتطلب منفذ مفتوح؛ لو شغّلت البوت كـ"Background Worker"
// ما تحتاجه (اترك PORT فاضي). /health يرجّع 200 فقط لو البوت متصل فعلاً.
function startHealthServer() {
  if (!config.healthPort) return null;
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      const ready = client.isReady();
      res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: ready, ping: ready ? client.ws.ping : null, uptime: process.uptime() }));
      return;
    }
    res.writeHead(404).end();
  });
  server.on('error', (err) => logger.error('خطأ بخادم فحص الصحة', { error: err }));
  server.listen(config.healthPort, () => logger.info('خادم فحص الصحة يعمل', { port: config.healthPort }));
  return server;
}

// ---- إيقاف نظيف (Render يرسل SIGTERM عند إعادة النشر) ----
let shuttingDown = false;
function shutdown(signal, healthServer) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`استلام ${signal} — إيقاف البوت بهدوء`);
  const force = setTimeout(() => process.exit(0), 8000);
  force.unref();
  Promise.resolve()
    .then(() => healthServer && new Promise((r) => healthServer.close(r)))
    .then(() => client.destroy())
    .catch((err) => logger.error('خطأ أثناء الإيقاف', { error: err }))
    .finally(() => process.exit(0));
}

async function main() {
  logger.info('تشغيل بوت احسمها', { commands: loaded.commands.size, buttons: loaded.buttons.size, env: process.env.NODE_ENV || 'development' });
  registerEvents();
  const healthServer = startHealthServer();
  process.once('SIGTERM', () => shutdown('SIGTERM', healthServer));
  process.once('SIGINT', () => shutdown('SIGINT', healthServer));

  try {
    await client.login(config.token);
  } catch (err) {
    // توكن خاطئ أو Intents مرفوضة — ما يفيد نكمل
    logger.error('❌ فشل تسجيل الدخول لـDiscord — تأكد من DISCORD_TOKEN', { code: err.code, reason: err.message });
    process.exit(1);
  }
}

main();
