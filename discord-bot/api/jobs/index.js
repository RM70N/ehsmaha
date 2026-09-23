'use strict';

// المهام الدورية لطبقة الـAPI:
//   • التأكد من وجود لقطة XP الأسبوعية كل 10 دقائق (تُبنى تلقائياً مع بداية كل أسبوع).
//   • حفظ عدّادات الاستدعاءات (apiStats يدير مؤقّته بنفسه).
// كل مهمة محمية: فشلها يتسجل ويُعاد بالدورة الجاية، وما يوقف السيرفر.

const leaderboard = require('../services/leaderboard');

const BASELINE_MS = 10 * 60 * 1000;

function every(ms, name, fn, logger) {
  let running = false;
  const run = async () => {
    if (running) return; // لا تشغيلين متداخلين لنفس المهمة
    running = true;
    try {
      await fn();
    } catch (err) {
      logger.error(`فشلت المهمة الدورية: ${name}`, { error: err });
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, ms);
  timer.unref();
  // أول تشغيل بعد الإقلاع بقليل (ما نأخر جاهزية السيرفر)
  setTimeout(run, 5000).unref();
  return timer;
}

function startJobs(config, logger) {
  const timers = [every(BASELINE_MS, 'weeklyBaseline', () => leaderboard.ensureBaseline(config), logger)];
  return () => timers.forEach(clearInterval);
}

module.exports = { startJobs };
