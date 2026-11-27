'use strict';

// إعدادات نظام الحماية التلقائي — عدّل القيم هنا (أو بمتغيرات البيئة المذكورة).

const int = (name, def, min, max) => {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return def;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n >= min && n <= max ? n : def;
};

module.exports = Object.freeze({
  spam: Object.freeze({
    // سبام = عدد رسائل كبير بوقت قصير...
    maxMessages: int('AUTOMOD_SPAM_MAX_MESSAGES', 7, 3, 30), // 7 رسائل نصية فعلية
    windowMs: int('AUTOMOD_SPAM_WINDOW_SECONDS', 8, 2, 60) * 1000, // خلال 8 ثوانٍ
    // ...أو نفس الرسالة بالضبط تتكرر متتالية
    duplicateCount: int('AUTOMOD_SPAM_DUPLICATES', 4, 2, 20), // 4 مرات متتالية (نفس النص الفعلي)
    // رسائل "خفيفة" (ضحك، إيموجي، ملصقات، صور/GIF بدون نص، تكرار حروف): ما تنحسب بالسبام العادي — بس لو إغراق شديد
    lightFloodMultiplier: 3,
    duplicateWindowMs: 60 * 1000, // التكرار يُحسب لو الرسائل خلال دقيقة
    // تنظيف ذاكرة التتبّع
    sweepIntervalMs: 60 * 1000,
    idleTtlMs: 5 * 60 * 1000
  }),

  // مدد الكتم التصاعدية لكل نوع مخالفة (مستقل): الأولى، الثانية، الثالثة فأكثر
  // مخففة: كتم كتابي (مو Timeout): الأولى دقيقتين، الثانية 10 دقائق، الثالثة فأكثر ساعة
  escalationMs: Object.freeze([2 * 60 * 1000, 10 * 60 * 1000, 60 * 60 * 1000]),

  // نوع العقوبة: 'textmute' (افتراضي) = منع الكتابة بالروم فقط · 'timeout' = Timeout السيرفر الكامل (القديم، يمنع حتى الصوت)
  action: () => (String(process.env.AUTOMOD_ACTION || 'textmute').trim().toLowerCase() === 'timeout' ? 'timeout' : 'textmute'),

  // نقطة توسعة معلّقة: باند تلقائي بعد عدد مخالفات معيّن من نفس النوع.
  // null = معطّل. لو فعّلته، أضف منطق الحظر بـservices/autoMod.js عند التعليق "AUTO-BAN".
  autoBanAfter: null,

  // بعد عقوبة، رسائل نفس النوع خلال هذي المدة تنحذف بدون زيادة العدّاد
  // (يمنع قفز العضو من 10 دقائق لـ24 ساعة بثانية لو لصق 3 روابط ورا بعض)
  punishCooldownMs: 15 * 1000,

  // إشعار القناة يُحذف تلقائياً بعد
  noticeTtlMs: 5000,

  // نطاقات مسموحة دائماً لكل السيرفرات (إضافة لقائمة /اضافة_رابط_مسموح)
  builtinAllowedDomains: Object.freeze(['ehsmaha.com'])
});
