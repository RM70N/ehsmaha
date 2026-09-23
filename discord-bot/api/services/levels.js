'use strict';

// نسخة مطابقة لمنطق اللفلات بالموقع (index.html → LEVELS_CONFIG /
// levelsRequiredXpFor / levelsProgressFromXp / levelsKey).
// ⚠️ لو تغيّر منحنى الصعوبة بالموقع، عدّل نفس الأرقام هنا حتى يطابق البوت الموقع.

const LEVELS_CONFIG = Object.freeze({
  BASE_XP: 30,
  CURVE_EXPONENT: 1.5, // requiredXP(level) = BASE_XP * level^CURVE_EXPONENT
  MAX_LEVEL: 100,
  START_LEVEL: 1
});

// XP المطلوب للانتقال من level إلى level+1
function requiredXpFor(level) {
  return Math.max(1, Math.round(LEVELS_CONFIG.BASE_XP * Math.pow(Math.max(1, level), LEVELS_CONFIG.CURVE_EXPONENT)));
}

// XP تراكمي → لفل + التقدّم داخل اللفل الحالي
function progressFromXp(totalXp) {
  const xp = Math.max(0, Number(totalXp) || 0);
  let level = LEVELS_CONFIG.START_LEVEL;
  let spent = 0;
  while (level < LEVELS_CONFIG.MAX_LEVEL) {
    const need = requiredXpFor(level);
    if (xp - spent < need) break;
    spent += need;
    level += 1;
  }
  const isMax = level >= LEVELS_CONFIG.MAX_LEVEL;
  const into = xp - spent;
  const need = isMax ? 0 : requiredXpFor(level);
  return {
    level,
    xp,
    xpIntoLevel: into,
    xpForNextLevel: need,
    percent: isMax ? 100 : Math.max(0, Math.min(100, Math.round((into / need) * 100))),
    isMax
  };
}

// نفس تنظيف المعرّف بالموقع: بادئة المنصة + @ + أحرف صغيرة
function levelsKey(idOrUsername) {
  if (!idOrUsername) return '';
  return String(idOrUsername)
    .replace(/^(tiktok|twitch|kick|youtube):/, '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
}

// Firestore يرفض معرّف مستند فيه "/" أو "." / ".." فقط — نتجنّب استعلامها
function isValidDocId(key) {
  return !!key && key.length <= 1500 && !key.includes('/') && key !== '.' && key !== '..' && !/^__.*__$/.test(key);
}

module.exports = { LEVELS_CONFIG, requiredXpFor, progressFromXp, levelsKey, isValidDocId };
