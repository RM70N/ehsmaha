'use strict';

// قواعد الألعاب الثلاث (نفس قواعد الألعاب القديمة بدون تغيير) كدوال نقية:
// توزيع الدول، حجم شبكة القناص، الذخيرة. المحرّك الجديد (games/*) يعتمد عليها.

const COUNTRIES = require('../../config/countries');
const SNIPER = require('../../config/sniper');

const isHttpsUrl = (u) => {
  try {
    return new URL(u).protocol === 'https:';
  } catch {
    return false;
  }
};

// تنظيف قائمة الدول: بدون ناقص أو مكرر، والصورة فقط لو https صالح
function normalizeCountries(list) {
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || typeof c.name !== 'string' || !c.name.trim() || typeof c.flagEmoji !== 'string' || !c.flagEmoji) continue;
    const name = c.name.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ name, flagEmoji: c.flagEmoji, flagImageUrl: isHttpsUrl(c.flagImageUrl) ? c.flagImageUrl : null });
  }
  return out;
}

/** سحب بدون إرجاع (Fisher–Yates): playerId -> country. لو اللاعبين أكثر من الدول نكمل بخلطة جديدة. */
function assignCountries(playerIds, list = COUNTRIES, random = Math.random) {
  const pool = normalizeCountries(list);
  if (!pool.length) throw new Error('قائمة الدول فاضية');
  const shuffled = () => {
    const a = pool.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const out = {};
  let bag = [];
  for (const id of playerIds) {
    if (!bag.length) bag = shuffled();
    out[id] = bag.pop();
  }
  return out;
}

function gridSizeFor(playerCount, thresholds = SNIPER.GRID_SIZE_THRESHOLDS) {
  const sorted = [...thresholds].sort((a, b) => b.minPlayers - a.minPlayers);
  const hit = sorted.find((t) => playerCount >= t.minPlayers);
  return (hit || sorted[sorted.length - 1]).boxes;
}

function ammoFor(size, table = SNIPER.AMMO_BY_GRID) {
  const sizes = Object.keys(table).map(Number).sort((a, b) => a - b);
  const key = table[size] ? size : sizes.filter((s) => s <= size).pop() || sizes[0];
  return { ...table[key] };
}

// رمز عشوائي غير قابل للتخمين
const token = (crypto, bytes = 4) => crypto.randomBytes(bytes).toString('hex');

module.exports = { COUNTRIES, SNIPER, normalizeCountries, assignCountries, gridSizeFor, ammoFor, token };
