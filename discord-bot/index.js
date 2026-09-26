'use strict';

// نقطة تشغيل بوت "احسمها".
// الترتيب: معالجات الأخطاء العامة ← التحقق من البيئة ← تحميل الأوامر والأحداث
// ديناميكياً ← قاعدة بيانات البوت (migrations تلقائية) ← خادم HTTP (health +
// webhook البث) ← تسجيل الدخول لـDiscord.

const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
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
const { startWebServer, webClientProxy } = require('./web/server');
const stateBackup = require('./services/stateBackup');
const api = require('./utils/apiClient');

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
  membersIntent: false,
  messageContentIntent: false
};

// ---- العميل ----
// Guilds + GuildMessages تكفي للأوامر وعدّ رسائل السبام. الـIntents المميزة
// (Privileged — تُفعَّل من Developer Portal → Bot):
//   • Server Members Intent: الترحيب (حدث انضمام عضو) + عدّ أعضاء الرتب.
//   • Message Content Intent: الحماية من الروابط والرسائل المكررة (قراءة النص).
// auto: نسأل ديسكورد وش المفعّل بالبورتال ونطلبه فقط — ولو رفض، نرجع بدونها
// بدل ما يطيح البوت كامل.
function createClient({ members, content }) {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
  if (members) intents.push(GatewayIntentBits.GuildMembers);
  if (content) intents.push(GatewayIntentBits.MessageContent);
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

// أعلام التطبيق: 1<<14/1<<15 = Server Members، 1<<18/1<<19 = Message Content
// مهلة: لو ديسكورد ما رد (أشهرها على Render: IP الخادم الجديد محظور مؤقتاً من
// ديسكورد) ما نعلّق هنا للأبد — نكمل ونجرّب تسجيل الدخول مباشرة.
const PORTAL_TIMEOUT_MS = 10 * 1000;
async function portalIntents() {
  try {
    const rest = new REST({ version: '10', timeout: PORTAL_TIMEOUT_MS, retries: 1 }).setToken(config.token);
    rest.on('rateLimited', (info) => logger.warn('⚠️ ديسكورد حدّد سرعة طلبات البوت', { global: info.global, retryAfterMs: info.retryAfter, route: info.route }));
    let timer;
    const app = await Promise.race([
      rest.get(Routes.currentApplication()),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('ديسكورد ما رد'), { code: 'PORTAL_TIMEOUT' })), PORTAL_TIMEOUT_MS + 2000);
      })
    ]).finally(() => clearTimeout(timer));
    const f = Number(app.flags || 0);
    return { known: true, members: !!(f & (1 << 14) || f & (1 << 15)), content: !!(f & (1 << 18) || f & (1 << 19)) };
  } catch (err) {
    logger.warn('تعذّر قراءة الـIntents المفعّلة من Developer Portal — بنجرّب مباشرة', { code: err.code || err.status });
    return { known: false };
  }
}

function decide(mode, portalValue) {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return portalValue === undefined ? true : portalValue;
}

async function login() {
  const portal = await portalIntents();
  const want = {
    members: decide(config.membersIntent, portal.known ? portal.members : undefined),
    content: decide(config.messageContentIntent, portal.known ? portal.content : undefined)
  };
  const tryLogin = async (w) => {
    ctx.client = createClient(w);
    registerEvents(ctx.client);
    ctx.client.rest.on('rateLimited', (info) => {
      if (info.global || info.retryAfter > 10000) logger.warn('⚠️ ديسكورد حدّد سرعة طلبات البوت', { global: info.global, retryAfterMs: info.retryAfter, route: info.route });
    });
    logger.info('🔌 جاري الاتصال بديسكورد...', { intents: w });
    // لو ما اتصل خلال دقيقتين: سجل واضح بالسبب الأرجح والحل (بدل صمت تام)
    const slow = setTimeout(() => {
      logger.error('⚠️ البوت ما قدر يتصل بديسكورد خلال دقيقتين — غالباً IP خادم Render محظور مؤقتاً من ديسكورد (مشكلة معروفة بعد نقل/إنشاء خدمة). الحل: Render → الخدمة → Manual Deploy → Clear build cache & deploy (يعطيك خادم جديد)، وتأكد إن DISCORD_TOKEN صحيح');
    }, 2 * 60 * 1000);
    if (typeof slow.unref === 'function') slow.unref();
    try {
      await ctx.client.login(config.token);
    } finally {
      clearTimeout(slow);
    }
    ctx.membersIntent = w.members;
    ctx.messageContentIntent = w.content;
  };
  // لو ديسكورد رفض: نجرّب نشيل واحد واحد (المضبوط على on ما ينشال أبداً)
  const keepM = config.membersIntent === 'on';
  const keepC = config.messageContentIntent === 'on';
  const candidates = [
    want,
    { members: want.members, content: keepC },
    { members: keepM, content: want.content },
    { members: keepM, content: keepC }
  ].filter((c, i, arr) => arr.findIndex((o) => o.members === c.members && o.content === c.content) === i);
  for (let i = 0; i < candidates.length; i++) {
    try {
      await tryLogin(candidates[i]);
      if (i > 0) logger.warn('ديسكورد رفض Intent مميز — التشغيل بدونه', candidates[i]);
      break;
    } catch (err) {
      await ctx.client.destroy().catch(() => {});
      if (!isDisallowedIntents(err) || i === candidates.length - 1) throw err;
    }
  }
  if (!ctx.membersIntent) {
    logger.warn('⚠️ Server Members Intent غير مفعّل — الترحيب بالأعضاء الجدد وعدّ أعضاء الرتب ما يشتغلون. فعّله: Developer Portal → Bot → Server Members Intent');
  }
  if (!ctx.messageContentIntent) {
    logger.warn('⚠️ Message Content Intent غير مفعّل — الحماية من الروابط والرسائل المكررة ما تشتغل (سبام السرعة يشتغل). فعّله: Developer Portal → Bot → Message Content Intent');
  }
}

// ---- نبضة إبقاء الخدمة صاحية (Render المجاني يوقف أي Web Service بعد 15
// دقيقة بدون طلبات HTTP خارجية — الاتصال الدائم بديسكورد لا يمنع هذا لأنه
// مو طلب HTTP للخدمة نفسها). لو البوت Web Service على Render (فيه PORT ورابط
// خارجي)، يرسل لنفسه طلب GET /health كل 10 دقائق فيبقى صاحياً بدل ما ينام
// وينقطع فجأة. هذا لا يغني عن خطة مدفوعة لضمان 24/7 كامل بدون أي انقطاع
// (إعادة نشر/صيانة من Render توقفه لحظياً بأي الحالتين).
function startSelfPing(webServer) {
  if (!webServer) return null; // Background Worker (ما فيه PORT ولا رابط عام) — لا فائدة
  const externalUrl = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (!externalUrl) return null; // مو على Render، أو الرابط الخارجي غير متاح
  const url = `${externalUrl}/health`;
  const intervalMs = 10 * 60 * 1000; // أقل من حد الخمول (15 دقيقة) بهامش أمان
  const ping = async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      logger.info('نبضة إبقاء البوت صاحياً', { status: res.status });
    } catch (err) {
      logger.warn('فشلت نبضة إبقاء البوت صاحياً', { error: err.message });
    }
  };
  const timer = setInterval(ping, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  const first = setTimeout(ping, 60 * 1000); // نبضة أولى مبكرة
  if (typeof first.unref === 'function') first.unref();
  return timer;
}

// ---- إيقاف نظيف (Render يرسل SIGTERM عند إعادة النشر) ----
let shuttingDown = false;
function shutdown(signal, webServer) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`استلام ${signal} — إيقاف البوت بهدوء`);
  const force = setTimeout(() => process.exit(0), 20000);
  force.unref();
  liveStreams.stopPolling();
  clearInterval(shutdown.selfPingTimer);
  require('./services/discordRelay').closeAll(); // اتصالات SSE المفتوحة تمنع إغلاق الخادم
  Promise.resolve()
    .then(() => webServer && new Promise((r) => webServer.close(r)))
    .then(() => ctx.client && ctx.client.destroy())
    .then(() => stateBackup.shutdown()) // آخر نسخة احتياطية قبل ما يطفي
    .then(() => botDb.close())
    .catch((err) => logger.error('خطأ أثناء الإيقاف', { error: err }))
    .finally(() => process.exit(0));
}

// قاعدة بيانات البوت: PostgreSQL لو DATABASE_URL موجود، وإلا SQLite محلي —
// وعلى Render يُسترجع من النسخة الاحتياطية الدائمة (Firestore عبر الـAPI) ويُحفظ
// فيها بعد كل تعديل، فما ينمسح شي مع التحديثات. فشلها ما يوقف البوت كامل.
async function initDatabase() {
  const backup = stateBackup.shouldEnable(config);
  try {
    let degraded = false;
    if (backup) {
      stateBackup.configure({ api, getBuffer: () => botDb.serialize() });
      // حد أقصى ~90 ثانية — بعدها البوت يشتغل عادي والاسترجاع يكمل بالخلفية
      degraded = !!(await stateBackup.restore(config.sqlitePath)).degraded;
    }
    await botDb.init({ databaseUrl: config.databaseUrl, sqlitePath: config.sqlitePath });
    if (backup && degraded) {
      // لما يرد الـAPI: نبدّل القاعدة بالنسخة المحفوظة (هي الأصل)
      stateBackup.startRecovery({
        file: config.sqlitePath,
        swap: async (writeFile) => {
          await botDb.close();
          try {
            writeFile();
          } finally {
            await botDb.init({ sqlitePath: config.sqlitePath });
            require('./utils/adminPermissions').invalidateAll();
            require('./services/autoMod')._internal.guildCache.clear();
          }
        }
      });
    }
    if (backup) {
      botDb.onWrite(() => stateBackup.markDirty());
      stateBackup.startSafetyFlush();
      stateBackup.markDirty(); // أول نسخة (تشمل أي جداول جديدة من الـmigrations)
      logger.info('✅ الحفظ الدائم مفعّل — إعدادات البوت محفوظة سحابياً ولا تنمسح مع التحديثات');
    } else if (!config.databaseUrl && process.env.RENDER) {
      logger.warn('⚠️ قاعدة البوت SQLite على Render بدون حفظ دائم (BOT_STATE_BACKUP=off) — تنمسح مع كل نشر');
    }
    await require('./database/botStore').moderationLog.prune(180).catch(() => {});
    return true;
  } catch (err) {
    logger.error('❌ تعذّر تجهيز قاعدة بيانات البوت', { error: err });
    return false;
  }
}

async function main() {
  logger.info('تشغيل بوت احسمها', { commands: loaded.commands.size, components: loaded.buttons.size, env: process.env.NODE_ENV || 'development' });

  // قاعدة بيانات البوت تتجهّز بالتوازي مع تسجيل الدخول (الاسترجاع ممكن ياخذ
  // دقيقة لو الـAPI نايم). لين تجهز، الأوامر الإدارية ترد برسالة ودّية.
  ctx.dbReady = initDatabase();

  liveStreams.configure({ maxHours: config.streamMaxHours });
  const webServer = startWebServer({ client: webClientProxy(ctx), config });
  shutdown.selfPingTimer = startSelfPing(webServer);
  process.once('SIGTERM', () => shutdown('SIGTERM', webServer));
  process.once('SIGINT', () => shutdown('SIGINT', webServer));

  // فحص عنوان خدمة الـAPI من أول ثانية (مستقل عن ديسكورد): بعد نقل الخدمات لحساب
  // Render جديد، العنوان يتغيّر (ينضاف له لاحقة) — ونبيّن هذا بوضوح بالسجلات.
  api.health()
    .then(() => logger.info('طبقة الـAPI تستجيب ✅', { baseUrl: config.apiBaseUrl }))
    .catch((err) => logger.error('⚠️ خدمة الـAPI ما ترد على API_BASE_URL — تأكد إن الرابط هو رابط خدمة ehsmaha-discord-api الحالية بـRender (الرابط يتغيّر لو انتقلت لحساب جديد) وإن API_KEY نفسه بالخدمتين', {
      baseUrl: config.apiBaseUrl,
      code: err.code,
      status: err.status
    }));

  try {
    await login();
  } catch (err) {
    // توكن خاطئ أو Intents مرفوضة — ما يفيد نكمل
    logger.error('❌ فشل تسجيل الدخول لـDiscord — تأكد من DISCORD_TOKEN', { code: err.code, reason: err.message });
    process.exit(1);
  }
}

main();
