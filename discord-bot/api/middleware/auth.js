'use strict';

// مصادقة البوت ← الـAPI: الهيدر x-api-key يطابق API_KEY (مقارنة ثابتة الزمن).

const crypto = require('node:crypto');
const { errors } = require('../errors');

function safeEqual(a, b) {
  // نقارن الـhash حتى لا يتسرب طول المفتاح عبر زمن المقارنة
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireApiKey(apiKey) {
  return (req, res, next) => {
    const provided = req.get('x-api-key');
    if (!provided || !safeEqual(provided, apiKey)) return next(errors.unauthorized('مفتاح API غير صالح'));
    return next();
  };
}

module.exports = { requireApiKey, safeEqual };
