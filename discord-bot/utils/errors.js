'use strict';

// ترجمة الأخطاء لرسائل ودّية بالعربي — المستخدم ما يشوف أي تفاصيل تقنية أبداً.

const { ApiError } = require('./apiClient');

const MESSAGES = {
  TIMEOUT: 'الموقع تأخر بالرد، جرّب بعد قليل ⏳',
  NETWORK_ERROR: 'حصل خطأ مؤقت بالاتصال بالموقع، جرّب بعد قليل.',
  SERVER_ERROR: 'حصل خطأ مؤقت، جرّب بعد قليل.',
  INTERNAL: 'حصل خطأ مؤقت، جرّب بعد قليل.',
  RATE_LIMITED: 'فيه ضغط كبير الحين، جرّب بعد دقيقة 🙏',
  QUOTA_EXCEEDED: 'بيانات الموقع وصلت حدها اليومي — ترجع تلقائياً خلال ساعات (10 الصبح بتوقيت السعودية كحد أقصى) 🙏',
  UNAUTHORIZED: 'حصل خطأ مؤقت، جرّب بعد قليل.', // مشكلة إعداد عندنا — ما نحمّل المستخدم تفاصيلها
  INVALID_INPUT: 'اليوزرنيم المكتوب غير صالح — اكتبه كما هو مسجل بالموقع.',
  NOT_FOUND: 'ما لقينا البيانات المطلوبة.',
  PLAYER_NOT_FOUND: 'لم يتم العثور على لاعب بهذا الاسم، تأكد من كتابته بشكل صحيح كما هو مسجل بالموقع'
};

const GENERIC = 'حصل خطأ مؤقت، جرّب بعد قليل.';

function friendlyMessage(err) {
  if (err instanceof ApiError) return MESSAGES[err.code] || GENERIC;
  return GENERIC;
}

module.exports = { friendlyMessage, GENERIC };
