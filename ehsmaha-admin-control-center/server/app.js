import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppError, E } from './lib/errors.js';
import { uid, safeEqual } from './lib/util.js';
import { log } from './lib/logger.js';
import { explain } from './actions/engine.js';
import { apiRouter } from './routes/api.js';

export function createApp(svc) {
  const { cfg, sessions } = svc;
  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', 1);

  // الواجهة ملف HTML واحد (CSS + JS + خطوط مضمّنة): نسمح بسكربتاتها المضمّنة **بالبصمة SHA-256 فقط** (أي سكربت آخر محظور)،
  // والأنماط المضمّنة (لا تنفّذ شيفرة)، والخطوط data:.
  const scriptHashes = [];
  try {
    const html = fs.readFileSync(path.join(cfg.root, 'web', 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/type="application\/json"/i.test(m[1])) scriptHashes.push(`'sha256-${crypto.createHash('sha256').update(m[2]).digest('base64')}'`);
  } catch { /* بدون واجهة */ }
  app.use(helmet({
    contentSecurityPolicy: { useDefaults: false, directives: { 'default-src': ["'self'"], 'script-src': ["'self'", ...scriptHashes], 'style-src': ["'self'", "'unsafe-inline'"], 'img-src': ["'self'", 'data:', 'https:'], 'font-src': ["'self'", 'data:'], 'connect-src': ["'self'"], 'object-src': ["'none'"], 'base-uri': ["'none'"], 'form-action': ["'self'"], 'frame-ancestors': ["'none'"] } },
    crossOriginEmbedderPolicy: false, referrerPolicy: { policy: 'no-referrer' },
    hsts: cfg.prod ? { maxAge: 31536000, includeSubDomains: true } : false
  }));
  app.use(cookieParser());
  app.use(express.json({ limit: '200kb' }));

  app.use((req, res, next) => { req.id = uid(8); res.setHeader('x-request-id', req.id); next(); });
  app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // المصادقة: تُحمَّل الجلسة من الكوكي في كل طلب /api (ما عدا الدخول)
  app.use('/api', (req, res, next) => {
    try {
      const token = req.cookies?.[cfg.session.cookieName];
      const s = sessions.resolve(token);
      if (s) req.auth = { accountId: s.account, role: s.role, display: s.role === 'owner' ? 'المالك' : 'الأدمن', sessionId: s.id, csrf: s.csrf, createdAt: s.createdAt };
      next();
    } catch (e) { if (e.code === 'SESSION_EXPIRED') { req.sessionExpired = true; return next(); } next(e); } // الدخول بعد انتهاء الجلسة يجب أن ينجح من أول مرة
  });

  // CSRF: كل طلب يغيّر حالة يحتاج ترويسة مطابقة لرمز الجلسة + فحص Origin (ومع SameSite=Strict)
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let ok = false;
      try { const o = new URL(origin); ok = o.host === req.get('host') || (cfg.publicOrigin && origin === cfg.publicOrigin); } catch { /* */ }
      if (!ok) return next(E.csrf());
    }
    if (req.path === '/auth/login') return next(); // قبل وجود جلسة (محمي بـOrigin + SameSite + حدّ المحاولات)
    if (!req.auth) return next(req.sessionExpired ? E.sessionExpired() : E.unauthenticated());
    if (!safeEqual(req.get('x-csrf-token'), req.auth.csrf)) return next(E.csrf());
    next();
  });

  app.use('/api', apiRouter(svc));
  app.use('/api', (req, res, next) => next(E.notFound('المسار غير موجود')));

  app.use(express.static(path.join(cfg.root, 'web'), { index: 'index.html', maxAge: cfg.prod ? '1h' : 0, setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-store'); } }));

  app.use((err, req, res, _next) => { // eslint-disable-line no-unused-vars
    if (err?.type === 'entity.parse.failed') err = E.invalid('JSON غير صالح');
    if (err?.type === 'entity.too.large') err = E.invalid('حجم الطلب كبير');
    const ex = explain(err);
    if (ex.status === 500) log.error('request failed', { path: req.path, error: err }); else if (ex.status >= 502) log.warn('upstream unavailable', { path: req.path, code: ex.code });
    res.status(ex.status).json({ ok: false, code: ex.code, message: ex.message, requestId: req.id, ...(err instanceof AppError ? err.extra : {}) });
  });
  return app;
}
