'use strict';

// معالج الأخطاء الأخير: AppError → كوده ورسالته، أي شي ثاني → 500 برسالة عامة
// (التفاصيل التقنية تنكتب بالسجل فقط، ما ترجع للعميل أبداً).

const { AppError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } });
}

function createErrorHandler(logger) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return;

    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: { code: 'TOO_LARGE', message: 'جسم الطلب كبير جداً' } });
    }
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'جسم الطلب ليس JSON صالحاً' } });
    }

    // رابط فيه ترميز % غير صالح (مثلاً يوزر عربي مقصوص بنص الترميز)
    if (err && (err instanceof URIError || (err.status === 400 && !(err instanceof AppError)))) {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'ترميز اليوزرنيم بالرابط غير صالح' } });
    }

    if (err instanceof AppError) {
      if (err.status >= 500) logger.error('AppError', { path: req.path, code: err.code, error: err });
      return res.status(err.status).json({
        ok: false,
        error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) }
      });
    }

    logger.error('خطأ داخلي بالـAPI', { method: req.method, path: req.path, error: err });
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'حصل خطأ مؤقت، جرّب بعد قليل' } });
  };
}

module.exports = { notFoundHandler, createErrorHandler };
