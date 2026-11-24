'use strict';

// رتب الإنذار الثلاث (إنذار أول / ثاني / ثالث). **ما ننشئ أي رتبة جديدة أبداً** — نستخدم الرتب الموجودة بالسيرفر:
//   1) معرّفات صريحة من WARNING_ROLE_IDS (3 معرّفات بالترتيب) لو محددة
//   2) البحث بالاسم بعد تنظيفه من الزخرفة (الإيموجي والتطويل والتشكيل): "⚠️ انـذار اول⛔" ← "انذار اول"
//      (يقبل: اول/اولى/1 · ثاني/ثانيه/2 · ثالث/ثالثه/3)
//   3) الأسماء القديمة من WARNING_ROLE_NAMES (تحذير1/2/3) لو موجودة أصلاً
// الرتبة المطلوبة غير موجودة ← خطأ واضح يسمّيها (بدون إنشاء).

const { loadConfig } = require('../config');

/** تنظيف اسم رتبة للمقارنة: بدون تشكيل/تطويل/رموز، والهمزات والتاء المربوطة موحّدة */
function normName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LABELS = ['إنذار أول', 'إنذار ثاني', 'إنذار ثالث'];
const PATTERNS = [
  /(^|\s)انذار\s*(اول|اولي|الاول|1)(\s|$)/,
  /(^|\s)انذار\s*(ثاني|ثانيه|الثاني|2)(\s|$)/,
  /(^|\s)انذار\s*(ثالث|ثالثه|الثالث|3)(\s|$)/
];

function findLevelRole(guild, level, cfg) {
  const ids = cfg.warningRoleIds || [];
  if (ids[level]) {
    const byId = guild.roles.cache.get(ids[level]);
    if (byId) return byId;
  }
  const all = [...guild.roles.cache.values()];
  const byPattern = all.find((r) => PATTERNS[level].test(normName(r.name)));
  if (byPattern) return byPattern;
  const legacy = (cfg.warningRoleNames || [])[level];
  if (legacy) return all.find((r) => normName(r.name) === normName(legacy)) || null;
  return null;
}

/**
 * يرجّع { roles: [r1, r2, r3], created: [] } أو { error }
 * (created دايماً فاضي — ما ننشئ رتب.)
 */
async function ensureWarningRoles(guild) {
  const cfg = loadConfig();
  const roles = [];
  const missing = [];
  for (let i = 0; i < 3; i++) {
    const role = findLevelRole(guild, i, cfg);
    if (!role) missing.push(LABELS[i]);
    else roles.push(role);
  }
  if (missing.length) {
    return { error: `ما لقيت رتبة (${missing.join('، ')}) بالسيرفر. ما أنشئ رتب جديدة — سمّ الرتب الموجودة «انذار اول» و«انذار ثاني» و«انذار ثالث»، أو حدد معرّفاتها بمتغير \`WARNING_ROLE_IDS\`.` };
  }
  for (const role of roles) {
    if (!role.editable) {
      return { error: `رتبة البوت لازم تكون **فوق** رتبة **${role.name}** حتى يقدر يمنحها ويزيلها — عدّل ترتيب الرتب من إعدادات السيرفر.` };
    }
  }
  return { roles, created: [] };
}

module.exports = { ensureWarningRoles, findLevelRole, normName, LABELS };
