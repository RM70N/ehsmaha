'use strict';

// خطأ منطقي معروف يرجع للعميل بكود ثابت ورسالة عربية آمنة.
// أي خطأ آخر (غير AppError) = خطأ داخلي → يرجع 500 برسالة عامة فقط.

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const errors = {
  invalidInput: (msg = 'البيانات المرسلة غير صحيحة', details) => new AppError(400, 'INVALID_INPUT', msg, details),
  unauthorized: (msg = 'غير مصرّح') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'ممنوع') => new AppError(403, 'FORBIDDEN', msg),
  playerNotFound: () => new AppError(404, 'PLAYER_NOT_FOUND', 'لم يتم العثور على لاعب بهذا الاسم'),
  notFound: (msg = 'غير موجود') => new AppError(404, 'NOT_FOUND', msg),
  rateLimited: (msg = 'محاولات كثيرة، جرّب بعد قليل') => new AppError(429, 'RATE_LIMITED', msg)
};

module.exports = { AppError, errors };
