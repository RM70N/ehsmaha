'use strict';

// قناة التحكم الإدارية: /admin-control/* — العميل الوحيد لوحة EHSEMHA Admin Control Center.
//   • مصادقة: x-admin-key = ADMIN_CONTROL_KEY (32+ حرف، مقارنة ثابتة الزمن، مستقل عن API_KEY). بدون المتغير: 503 لكل المسارات.
//   • حدّ معدل 30/دقيقة، وقائمة IP اختيارية (ADMIN_CONTROL_ALLOWED_IPS).
//   • Idempotency: x-idempotency-key — النتيجة تُحفظ 10 دقائق، وإعادة نفس المفتاح تعيد الرد نفسه بدون إعادة التنفيذ.
//   • الرد الموحّد: { ok, applied, verified, detail, at } — verified لا تكون true إلا بعد قراءة الحالة الفعلية من مصدر الحقيقة.
//   • كل عملية تغيّر شيئاً تُسجَّل بـmoderation_log (action='admin_control:<op>', moderator_id='admin-center').

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const logger = require('../../utils/logger');
const { safeEqual } = require('../../api/middleware/auth');
const runtime = require('./runtime');
const { OPS, AdminError } = require('./ops');

const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:-]{8,128}$/;
const MIN_KEY_LENGTH = 32;

const publicError = (res, status, code, error) => res.status(status).json({ ok: false, code, error, at: Date.now() });

function createAdminControlRouter({ getConfig, getContext = runtime.getContext, now = Date.now } = {}) {
  const router = express.Router();
  const idem = new Map(); // key -> { at, fingerprint, promise }

  const sweep = () => {
    const t = now();
    for (const [k, v] of idem) if (t - v.at > IDEMPOTENCY_TTL_MS) idem.delete(k);
  };

  // 1) القناة غير مفعّلة ← 503 قبل أي شي
  router.use((req, res, next) => {
    const key = getConfig().adminControlKey;
    if (!key || key.length < MIN_KEY_LENGTH) return publicError(res, 503, 'ADMIN_CONTROL_DISABLED', 'القناة غير مفعّلة');
    return next();
  });

  // 2) قائمة IP اختيارية
  router.use((req, res, next) => {
    const allowed = getConfig().adminControlAllowedIps;
    if (allowed && allowed.length) {
      const ip = String(req.ip || '').replace(/^::ffff:/, '');
      if (!allowed.includes(ip)) {
        logger.warn('admin-control: IP غير مسموح', { ip });
        return publicError(res, 403, 'IP_NOT_ALLOWED', 'غير مسموح');
      }
    }
    return next();
  });

  // 3) حدّ المعدل (قبل فحص المفتاح: يحمي من التخمين)
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: () => Number(getConfig().adminControlRateLimit) || 30,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => publicError(res, 429, 'RATE_LIMITED', 'طلبات كثيرة — انتظر دقيقة')
    })
  );

  // 4) المصادقة
  router.use((req, res, next) => {
    const provided = req.get('x-admin-key');
    if (!provided || !safeEqual(provided, getConfig().adminControlKey)) {
      logger.warn('admin-control: مفتاح غير صالح', { path: req.path, ip: req.ip });
      return publicError(res, 401, 'UNAUTHORIZED', 'مفتاح غير صالح');
    }
    return next();
  });

  router.use(express.json({ limit: '16kb' }));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => publicError(res, 400, 'INVALID_JSON', 'جسم الطلب ليس JSON صالحاً'));

  // تنفيذ عملية واحدة + معالجة الأخطاء + Idempotency
  async function execute(op, req, res) {
    const run = async () => {
      try {
        const ctx = getContext();
        if (!ctx) throw new AdminError('NOT_READY', 'البوت لسا يجهز.', 503);
        const out = await op.handler({ req, ctx, config: getConfig() });
        return { status: 200, body: { ok: true, applied: !!out.applied, verified: !!out.verified, detail: out.detail || {}, at: now() } };
      } catch (err) {
        if (err instanceof AdminError) return { status: err.status, body: { ok: false, code: err.code, error: err.message, detail: err.detail, at: now() } };
        // لا نسرّب stack ولا نص الاستثناء — رمز عام فقط (والتفاصيل بالسجل)
        logger.error('admin-control: خطأ غير متوقع', { op: op.name, error: err });
        const code = err && err.code === 'DB_UNAVAILABLE' ? 'DB_UNAVAILABLE' : 'INTERNAL';
        return { status: code === 'DB_UNAVAILABLE' ? 503 : 500, body: { ok: false, code, error: code === 'DB_UNAVAILABLE' ? 'قاعدة بيانات البوت غير متاحة.' : 'خطأ داخلي.', at: now() } };
      }
    };

    const key = req.get('x-idempotency-key');
    if (op.mutating && key) {
      if (!IDEMPOTENCY_KEY_RE.test(key)) return publicError(res, 400, 'INVALID_IDEMPOTENCY_KEY', 'x-idempotency-key غير صالح (8-128 حرف/رقم).');
      sweep();
      const fingerprint = crypto.createHash('sha256').update(`${req.method} ${req.path} ${JSON.stringify(req.body || {})}`).digest('hex');
      const hit = idem.get(key);
      if (hit) {
        if (hit.fingerprint !== fingerprint) return publicError(res, 422, 'IDEMPOTENCY_MISMATCH', 'نفس مفتاح التكرار استُخدم لطلب مختلف.');
        const r = await hit.promise; // نفس الرد بدون إعادة التنفيذ (حتى لو الأول لسا جارٍ)
        return res.status(r.status).set('x-idempotent-replay', 'true').json(r.body);
      }
      const promise = run();
      idem.set(key, { at: now(), fingerprint, promise });
      const r = await promise;
      if (r.status >= 500) idem.delete(key); // الأعطال المؤقتة ما تُخزَّن
      return res.status(r.status).json(r.body);
    }
    const r = await run();
    return res.status(r.status).json(r.body);
  }

  for (const op of OPS) {
    router[op.method](op.path, (req, res) => execute(op, req, res));
  }
  router.use((req, res) => publicError(res, 404, 'NOT_FOUND', 'المسار غير موجود'));

  router._internal = { idem };
  return router;
}

module.exports = { createAdminControlRouter, runtime, MIN_KEY_LENGTH };
