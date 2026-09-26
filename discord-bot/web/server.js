'use strict';

// خادم HTTP صغير مدمج بالبوت (Express):
//   GET  /health                      — فحص صحة Render (200 فقط لو البوت متصل بديسكورد)
//   POST /api/discord/stream-event    — Webhook جلسات البث من الموقع (لأمر /بث)
//   GET  /api/discord/relay/:channelId — بث لحظي (SSE) لرسائل روم ديسكورد لألعاب الموقع
//
// الأمان: الهيدر x-webhook-secret لازم يطابق STREAM_WEBHOOK_SECRET (مقارنة ثابتة
// الزمن). بدون السر بالإعدادات، الـendpoint يرجّع 503 ولا يقبل أي شي.
// يشتغل فقط لو PORT موجود (Render Web Service). مع Background Worker ما فيه
// منفذ عام، فـ/بث يعتمد على المزامنة الدورية وحدها.

const crypto = require('node:crypto');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const logger = require('../utils/logger');
const liveStreams = require('../services/liveStreams');
const discordRelay = require('../services/discordRelay');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a || '')).digest();
  const hb = crypto.createHash('sha256').update(String(b || '')).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function createApp({ client, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.get(['/', '/health'], (req, res) => {
    const ready = client.isReady();
    res.status(ready ? 200 : 503).json({
      ok: ready,
      ping: ready ? client.ws.ping : null,
      uptime: Math.floor(process.uptime()),
      liveSessions: liveStreams.size(),
      relay: discordRelay.stats(),
      db: require('../database/botDb').dialect(),
      backup: require('../services/stateBackup').status()
    });
  });

  // CORS محصور بنطاقات الموقع (لو الموقع يرسل من المتصفح مباشرة)
  const allowed = new Set(config.webhookAllowedOrigins);
  const cors = (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin.replace(/\/+$/, ''))) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');
      res.set('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  };

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message: 'طلبات كثيرة' } })
  });

  app.options('/api/discord/stream-event', cors);
  app.post('/api/discord/stream-event', cors, limiter, express.json({ limit: '4kb' }), (req, res) => {
    if (!config.streamWebhookSecret) {
      return res.status(503).json({ ok: false, error: { code: 'WEBHOOK_DISABLED', message: 'STREAM_WEBHOOK_SECRET غير مضبوط بالبوت' } });
    }
    if (!safeEqual(req.get('x-webhook-secret'), config.streamWebhookSecret)) {
      logger.warn('webhook برفض: سر غير صحيح', { ip: req.ip });
      return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'x-webhook-secret غير صحيح' } });
    }
    const v = liveStreams.validatePayload(req.body);
    if (!v.ok) return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: v.error } });

    if (v.value.ended) {
      const removed = liveStreams.end(v.value.sessionId);
      return res.json({ ok: true, data: { ended: true, existed: removed } });
    }
    const r = liveStreams.upsert({ ...v.value, source: 'webhook' });
    if (!r.ok) return res.status(422).json({ ok: false, error: { code: r.reason, message: 'الجلسة أقدم من الحد الأقصى المسموح' } });
    return res.json({ ok: true, data: { sessionId: v.value.sessionId, active: liveStreams.size() } });
  });

  // ربط روم ديسكورد بألعاب الموقع — CORS مفتوح: الموقع وتطبيقات الجوال/الكمبيوتر
  // (أصولها مختلفة)، والمحتوى رسائل روم عام أصلاً (الرومات الخاصة مرفوضة).
  const relayLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).set('Access-Control-Allow-Origin', '*').json({ ok: false, error: { code: 'RATE_LIMITED', message: 'محاولات ربط كثيرة — انتظر دقيقة' } })
  });
  app.get('/api/discord/relay/:channelId', relayLimiter, (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    try {
      const r = discordRelay.resolveChannel(client, req.params.channelId, { officialGuildId: config.officialGuildId });
      if (!r.ok) return res.status(r.status).json({ ok: false, error: { code: r.code, message: r.message } });
      const after = /^\d{17,20}$/.test(String(req.query.after || '')) ? String(req.query.after) : null;
      if (!discordRelay.subscribe(r.channel, req, res, { maxPerChannel: config.relayMaxPerChannel || 10, after })) {
        return res.status(429).json({ ok: false, error: { code: 'RELAY_FULL', message: 'الروم مربوط بمواقع كثيرة حالياً' } });
      }
    } catch (err) {
      // سبب الخطأ يطلع بالرد (بدون أسرار) عشان يتشخّص من الموقع مباشرة
      logger.error('ربط ديسكورد: خطأ بفتح الروم', { channelId: req.params.channelId, error: err });
      if (!res.headersSent) {
        return res.status(500).json({ ok: false, error: { code: 'RELAY_ERROR', message: 'خطأ بالبوت أثناء ربط الروم: ' + String((err && err.message) || err).slice(0, 200) } });
      }
    }
    return undefined;
  });

  app.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'المسار غير موجود' } }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'جسم الطلب ليس JSON صالحاً' } });
    }
    if (err && err.type === 'entity.too.large') {
      return res.status(413).json({ ok: false, error: { code: 'INVALID_INPUT', message: 'جسم الطلب كبير جداً' } });
    }
    logger.error('خطأ بخادم البوت', { path: req.path, error: err });
    if (req.path.startsWith('/api/discord/relay/')) {
      res.set('Access-Control-Allow-Origin', '*');
      return res.status(500).json({ ok: false, error: { code: 'RELAY_ERROR', message: 'خطأ بالبوت أثناء ربط الروم: ' + String((err && err.message) || err).slice(0, 200) } });
    }
    return res.status(500).json({ ok: false, error: { code: 'INTERNAL', message: 'خطأ داخلي' } });
  });
  return app;
}

// خادم الويب يقلع قبل عميل ديسكورد، فياخذ واجهة تقرأ العميل الحالي وقت كل
// طلب: الجاهزية والـping (للـhealth)، والرومات (لربط ديسكورد بألعاب الموقع).
function webClientProxy(context) {
  return {
    isReady: () => !!(context.client && context.client.isReady()),
    get ws() { return context.client ? context.client.ws : { ping: -1 }; },
    get channels() { return context.client ? context.client.channels : { cache: new Map() }; }
  };
}

function startWebServer({ client, config }) {
  if (!config.healthPort) {
    logger.info('بدون PORT: خادم البوت (health + webhook البث) غير مفعّل — /بث يعتمد على المزامنة الدورية');
    return null;
  }
  const app = createApp({ client, config });
  const server = app.listen(config.healthPort, () => {
    logger.info('خادم البوت يعمل', {
      port: config.healthPort,
      webhook: config.streamWebhookSecret ? 'مفعّل' : 'غير مفعّل (STREAM_WEBHOOK_SECRET فاضي)'
    });
  });
  server.on('error', (err) => logger.error('خطأ بخادم البوت', { error: err }));
  return server;
}

module.exports = { createApp, startWebServer, webClientProxy, safeEqual };
