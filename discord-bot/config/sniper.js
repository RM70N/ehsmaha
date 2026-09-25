'use strict';

// إعدادات "لعبة القناص" (/قناص) — عدّل هنا بدون لمس منطق اللعبة.

// حجم الشبكة حسب عدد المشاركين الكلي (مع القناص) — أول سطر ينطبق من فوق:
//   20 لاعب فأكثر ← 50 مربع · أقل من 20 ← 20 مربع
const GRID_SIZE_THRESHOLDS = [
  { minPlayers: 20, boxes: 50 },
  { minPlayers: 0, boxes: 20 }
];

// الأسلحة: targets = كم مربع تصيب الطلقة الوحدة دفعة وحدة
const WEAPONS = {
  sniper: { name: 'سنايبر', emoji: '🔫', targets: 1 },
  bomb: { name: 'قنبلة', emoji: '💣', targets: 3 },
  nuke: { name: 'نيوك', emoji: '☢️', targets: 5 }
};

// الذخيرة حسب حجم الشبكة (كل سلاح بذخيرة منفصلة). حجم مو موجود هنا ← يستخدم
// أقرب حجم أصغر منه (أو الأصغر لو ما فيه).
const AMMO_BY_GRID = {
  20: { sniper: 10, bomb: 5, nuke: 3 },
  50: { sniper: 20, bomb: 10, nuke: 6 }
};

// التوقيتات
const TIMINGS = {
  hideMs: 30 * 1000, // مرحلة الاختباء (تنتهي أبكر لو اختبأ الكل)
  huntMs: 4 * 60 * 1000, // مرحلة الصيد
  statusEveryMs: 15 * 1000 // تحديث رسالة الحالة العامة (الوقت المتبقي + الأحياء)
};

module.exports = { GRID_SIZE_THRESHOLDS, WEAPONS, AMMO_BY_GRID, TIMINGS };
