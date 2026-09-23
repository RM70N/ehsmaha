'use strict';

// إعدادات البوت — كلها من متغيرات البيئة (.env محلياً، Environment بـRender).
// عند الإقلاع نتحقق من المتغيرات المطلوبة؛ لو ناقص شي نطبع رسالة واضحة
// ونوقف العملية فوراً بدل ما يشتغل البوت نصف شغّال ويفشل لاحقاً بصمت.

require('dotenv').config({ quiet: true });

const REQUIRED = {
  DISCORD_TOKEN: 'توكن البوت من Discord Developer Portal → Bot → Token',
  CLIENT_ID: 'Application ID للبوت (1552260327008247879)',
  API_BASE_URL: 'رابط طبقة الـAPI، مثال: https://ehsmaha-discord-api.onrender.com',
  API_KEY: 'المفتاح السري المشترك بين البوت والـAPI (نفس قيمة API_KEY بخدمة الـAPI)'
};

function readInt(name, fallback, { min = -Infinity, max = Infinity } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new Error(`قيمة ${name} غير صالحة ("${raw}") — المتوقع رقم صحيح بين ${min} و${max}`);
  }
  return n;
}

function readList(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}

// يبني كائن الإعدادات أو يرمي خطأ فيه كل المشاكل دفعة وحدة.
function buildConfig() {
  const problems = [];

  for (const [key, hint] of Object.entries(REQUIRED)) {
    if (!process.env[key] || !String(process.env[key]).trim()) problems.push(`- ${key} مفقود: ${hint}`);
  }

  if (process.env.CLIENT_ID && !isSnowflake(process.env.CLIENT_ID)) {
    problems.push('- CLIENT_ID لازم يكون رقم Discord صالح (17-20 خانة)');
  }
  if (process.env.GUILD_ID && !isSnowflake(process.env.GUILD_ID)) {
    problems.push('- GUILD_ID (اختياري) لازم يكون رقم سيرفر صالح إذا تم تعبئته');
  }
  if (process.env.API_BASE_URL && !/^https?:\/\//i.test(process.env.API_BASE_URL)) {
    problems.push('- API_BASE_URL لازم يبدأ بـ http:// أو https://');
  }
  if (process.env.API_KEY && String(process.env.API_KEY).length < 24) {
    problems.push('- API_KEY قصير جداً — استخدم مفتاح عشوائي 32 حرف على الأقل');
  }

  const adminIds = readList('ADMIN_IDS');
  const badAdmins = adminIds.filter((id) => !isSnowflake(id));
  if (badAdmins.length) problems.push(`- ADMIN_IDS فيه معرّفات غير صالحة: ${badAdmins.join(', ')}`);

  let numeric = {};
  try {
    numeric = {
      commandCooldownMs: readInt('COMMAND_COOLDOWN_MS', 3000, { min: 0, max: 60000 }),
      buttonCooldownMs: readInt('BUTTON_COOLDOWN_MS', 1000, { min: 0, max: 60000 }),
      apiTimeoutMs: readInt('API_TIMEOUT_MS', 5000, { min: 1000, max: 30000 }),
      leaderboardCacheSeconds: readInt('LEADERBOARD_CACHE_SECONDS', 90, { min: 0, max: 600 }),
      healthPort: readInt('PORT', 0, { min: 0, max: 65535 }),
      streamPollSeconds: readInt('STREAM_POLL_SECONDS', 30, { min: 10, max: 600 }),
      streamMaxHours: readInt('STREAM_MAX_HOURS', 6, { min: 1, max: 48 }),
      ticketDeleteDelaySeconds: readInt('TICKET_DELETE_DELAY_SECONDS', 10, { min: 3, max: 300 })
    };
  } catch (err) {
    problems.push('- ' + err.message);
  }

  const ticketCloseMode = String(process.env.TICKET_CLOSE_MODE || 'archive').trim().toLowerCase();
  if (!['archive', 'delete'].includes(ticketCloseMode)) problems.push('- TICKET_CLOSE_MODE لازم يكون archive أو delete');
  if (process.env.TICKET_CATEGORY_ID && !isSnowflake(process.env.TICKET_CATEGORY_ID)) problems.push('- TICKET_CATEGORY_ID لازم يكون معرّف تصنيف صالح');
  const membersIntent = String(process.env.MEMBERS_INTENT || 'auto').trim().toLowerCase();
  if (!['auto', 'on', 'off'].includes(membersIntent)) problems.push('- MEMBERS_INTENT لازم يكون auto أو on أو off');
  if (process.env.DATABASE_URL && !/^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)) {
    problems.push('- DATABASE_URL لازم يبدأ بـ postgres:// (رابط قاعدة PostgreSQL)');
  }
  const warningRoleNames = readList('WARNING_ROLE_NAMES');
  if (warningRoleNames.length && warningRoleNames.length !== 3) problems.push('- WARNING_ROLE_NAMES لازم تكون 3 أسماء مفصولة بفاصلة (تحذير1,تحذير2,تحذير3)');

  if (problems.length) {
    const error = new Error('إعدادات البيئة ناقصة أو غير صالحة:\n' + problems.join('\n'));
    error.code = 'CONFIG_INVALID';
    throw error;
  }

  const siteUrl = stripTrailingSlash(process.env.SITE_URL || 'https://ehsmaha.com');
  // تسجيل الأوامر تلقائياً عند كل تشغيل (افتراضياً مفعّل) — يغني عن تشغيل
  // deploy-commands يدوياً. اكتب false لتعطيله.
  const autoRegister = !/^(false|0|no|off)$/i.test(String(process.env.AUTO_REGISTER_COMMANDS || 'true').trim());

  return Object.freeze({
    token: process.env.DISCORD_TOKEN.trim(),
    clientId: process.env.CLIENT_ID.trim(),
    guildId: (process.env.GUILD_ID || '').trim() || null,
    apiBaseUrl: stripTrailingSlash(process.env.API_BASE_URL.trim()),
    apiKey: process.env.API_KEY.trim(),
    adminIds: Object.freeze(adminIds),
    siteUrl,
    autoRegisterCommands: autoRegister,
    profileUrl: siteUrl + '/profile',
    logoUrl: process.env.LOGO_URL || siteUrl + '/discord-logo.png',
    ...numeric,
    // قاعدة بيانات البوت: PostgreSQL لو DATABASE_URL موجود، وإلا SQLite محلي
    databaseUrl: (process.env.DATABASE_URL || '').trim() || null,
    sqlitePath: process.env.SQLITE_PATH || './data/bot.sqlite',
    // Webhook جلسات البث (/بث) — بدونه يعتمد /بث على المزامنة الدورية فقط
    streamWebhookSecret: (process.env.STREAM_WEBHOOK_SECRET || '').trim() || null,
    webhookAllowedOrigins: Object.freeze(
      (readList('WEBHOOK_ALLOWED_ORIGINS').length ? readList('WEBHOOK_ALLOWED_ORIGINS') : [siteUrl, 'https://www.ehsmaha.com']).map(stripTrailingSlash)
    ),
    // التكتات
    ticketCloseMode,
    ticketArchiveCategoryName: (process.env.TICKET_ARCHIVE_CATEGORY_NAME || 'تكتات مغلقة').trim(),
    ticketCategoryId: (process.env.TICKET_CATEGORY_ID || '').trim() || null,
    // رتب التحذير الثلاث (بالترتيب) — تنشأ تلقائياً لو ناقصة
    warningRoleNames: Object.freeze(warningRoleNames.length ? warningRoleNames : ['تحذير1', 'تحذير2', 'تحذير3']),
    // Intent أعضاء السيرفر (لعدّ أعضاء كل رتبة بـ/عرض_الرتب): auto = يجرّبه ويرجع بدونه لو مو مفعّل
    membersIntent,
    // الهوية البصرية — مكان واحد لكل الألوان
    colors: Object.freeze({
      primary: 0x1a0d33,  // بنفسجي غامق (الأساسي)
      deep: 0x0d0620,     // بنفسجي أغمق (خلفيات/رسائل هادئة)
      gold: 0xf5b301,     // ذهبي (عناوين/متصدرين/إنجازات)
      pink: 0xf472b6,     // وردي ناعم (ثانوي/تنبيهات لطيفة)
      success: 0x34d399,
      danger: 0xef4444,
      muted: 0x4b4658     // رمادي باهت (حالات فاضية مثل: لا يوجد بث)
    })
  });
}

let cached = null;

// يُستدعى من index.js و deploy-commands.js عند الإقلاع.
function loadConfig() {
  if (!cached) cached = buildConfig();
  return cached;
}

module.exports = { loadConfig, buildConfig, isSnowflake };
