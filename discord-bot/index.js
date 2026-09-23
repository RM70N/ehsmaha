'use strict';

// نقطة تشغيل بوت "احسمها".
// الترتيب: معالجات الأخطاء العامة ← التحقق من البيئة ← تحميل الأوامر والأحداث
// ديناميكياً ← قاعدة بيانات البوت (migrations تلقائية) ← خادم HTTP (health +
// webhook البث) ← تسجيل الدخول لـDiscord.

const fs = require('node:fs');
const path = require('node:path');
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
const botDb = require('./database/botDb');
const liveStreams = require('./services/liveStreams');
const { startWebServer } = require('./web/server');

let loaded;
try {
  loaded = loadCommands();
} catch (err) {
  logger.error('فشل تحميل الأوامر', { error: err });
  process.exit(1);
}

const ctx = {
  client: null,
  config,
  logger,
  commands: loaded.commands,
  buttons: loaded.buttons,
  definitions: loaded.definitions,
  membersIntent: false
};

// ---- العميل ----
// Guilds يكفي لكل الأوامر. GuildMembers (Privileged — يُفعَّل من Developer Portal
// → Bot → Server Members Intent) نحتاجه فقط لعدّ أعضاء كل رتبة بـ/عرض_الرتب.
// MEMBERS_INTENT=auto: نجرّبه، ولو ديسكورد رفضه (غير مفعّل) نرجع بدونه تلقائياً
// بدل ما يطيح البوت كامل.
function createClient(withMembers) {
  const intents = [GatewayIntentBits.Guilds];
  if (withMembers) intents.push(GatewayIntentBits.GuildMembers);
  return new Client({
    intents,
    partials: [Partials.Channel],
    allowedMentions: { parse: [], repliedUser: false } // ما نمنشن أحد بالغلط أبداً
  });
}

// ---- تحميل الأحداث ديناميكياً من /events ----
function registerEvents(client) {
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

const isDisallowedIntents = (err) =>
  !!err && (err.code === 'DisallowedIntents' || err.code === 4014 || /disallowed intent/i.test(String(err.message || '')));

async function login() {
  const wantMembers = config.membersIntent !== 'off';
  ctx.client = createClient(wantMembers);
  registerEvents(ctx.client);
  try {
    await ctx.client.login(config.token);
    ctx.membersIntent = wantMembers;
  } catch (err) {
    if (wantMembers && config.membersIntent === 'auto' && isDisallowedIntents(err)) {
      logger.warn('Server Members Intent غير مفعّل بـDeveloper Portal — التشغيل بدونه (عدد أعضاء الرتب بـ/عرض_الرتب ما يظهر)');
      await ctx.client.destroy().catch(() => {});
      ctx.client = createClient(false);
      registerEvents(ctx.client);
      await ctx.client.login(config.token);
      ctx.membersIntent = false;
      return;
    }
    throw err;
  }
}

// ---- إيقاف نظيف (Render يرسل SIGTERM عند إعادة النشر) ----
let shuttingDown = false;
function shutdown(signal, webServer) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`استلام ${signal} — إيقاف البوت بهدوء`);
  const force = setTimeout(() => process.exit(0), 8000);
  force.unref();
  liveStreams.stopPolling();
  Promise.resolve()
    .then(() => webServer && new Promise((r) => webServer.close(r)))
    .then(() => ctx.client && ctx.client.destroy())
    .then(() => botDb.close())
    .catch((err) => logger.error('خطأ أثناء الإيقاف', { error: err }))
    .finally(() => process.exit(0));
}

async function main() {
  logger.info('تشغيل بوت احسمها', { commands: loaded.commands.size, components: loaded.buttons.size, env: process.env.NODE_ENV || 'development' });

  // قاعدة بيانات البوت: فشلها ما يوقف البوت كامل — أوامر اللاعبين تستمر،
  // والأوامر الإدارية/التكتات ترد برسالة واضحة لين تنحل المشكلة.
  try {
    await botDb.init({ databaseUrl: config.databaseUrl, sqlitePath: config.sqlitePath });
    if (!config.databaseUrl && process.env.RENDER) {
      logger.warn('⚠️ قاعدة البوت SQLite على Render بدون قرص دائم تنمسح مع كل نشر — اضبط DATABASE_URL (PostgreSQL) للإنتاج');
    }
  } catch (_) {
    /* مسجّل داخل init */
  }

  liveStreams.configure({ maxHours: config.streamMaxHours });
  const webServer = startWebServer({ client: { isReady: () => !!(ctx.client && ctx.client.isReady()), get ws() { return ctx.client ? ctx.client.ws : { ping: -1 }; } }, config });
  process.once('SIGTERM', () => shutdown('SIGTERM', webServer));
  process.once('SIGINT', () => shutdown('SIGINT', webServer));

  try {
    await login();
  } catch (err) {
    // توكن خاطئ أو Intents مرفوضة — ما يفيد نكمل
    logger.error('❌ فشل تسجيل الدخول لـDiscord — تأكد من DISCORD_TOKEN', { code: err.code, reason: err.message });
    process.exit(1);
  }
}

main();
