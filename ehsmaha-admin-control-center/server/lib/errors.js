// أخطاء التطبيق: رسالة عربية آمنة للعرض + كود ثابت للآلات. لا تتسرب تفاصيل داخلية.
export class AppError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const E = {
  unauthenticated: () => new AppError(401, 'UNAUTHENTICATED', 'سجّل الدخول أولاً'),
  sessionExpired: () => new AppError(401, 'SESSION_EXPIRED', 'انتهت الجلسة — سجّل الدخول من جديد'),
  forbidden: (m = 'ليست لديك صلاحية لتنفيذ هذه العملية') => new AppError(403, 'FORBIDDEN', m),
  csrf: () => new AppError(403, 'CSRF', 'طلب غير موثوق (CSRF) — حدّث الصفحة وحاول مجدداً'),
  invalid: (m = 'مدخلات غير صحيحة', fields) => new AppError(422, 'INVALID_INPUT', m, { fields }),
  notFound: (m = 'العنصر غير موجود') => new AppError(404, 'NOT_FOUND', m),
  conflict: (m) => new AppError(409, 'CONFLICT', m),
  unavailable: (m, extra) => new AppError(503, 'UNAVAILABLE', m, extra),
  rateLimited: (retryAfterSec) => new AppError(429, 'RATE_LIMITED', `محاولات كثيرة — حاول بعد ${retryAfterSec} ثانية`, { retryAfterSec }),
  upstream: (m, extra) => new AppError(502, 'UPSTREAM_FAILED', m, extra),
  verifyFailed: (m, extra) => new AppError(500, 'VERIFY_FAILED', m, extra)
};
