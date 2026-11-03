'use strict';

// غلاف Gemini (@google/generative-ai) — كل استدعاءات الذكاء الاصطناعي تمر من هنا:
//   • عدة مفاتيح (GEMINI_API_KEY ثم GEMINI_API_KEY_2..6): نستخدم المفتاح النشط لين يخلص
//     حده (429) أو يطلع غلط، وبعدها نتحول تلقائياً للي بعده بنفس الطلب — المستخدم ما يحس.
//   • لو كل المفاتيح خلصت على النموذج الأساسي (GEMINI_MODEL) نجرب النماذج الاحتياطية
//     (GEMINI_FALLBACK_MODELS) — حصة كل نموذج منفصلة عند جوجل.
//   • كل مفتاح تعبان "يرتاح" مدة (حسب الخطأ) وبعدها يرجع للدور تلقائياً.
//   • مهلة لكل طلب، وتصنيف الأخطاء، وسطر بالسجل لكل استدعاء (رقم المفتاح فقط — المفتاح نفسه ما ينطبع أبداً).
// ما يرمي أخطاء أبداً — يرجع { ok, text } أو { ok:false, code }.

const { GoogleGenerativeAI, GoogleGenerativeAIFetchError, GoogleGenerativeAIResponseError } = require('@google/generative-ai');
const { loadConfig } = require('../config');
const logger = require('../utils/logger');

const clients = new Map(); // apiKey -> GoogleGenerativeAI
// `${keyIndex}|${model}` (حد/ضغط) · `${keyIndex}|*` (مفتاح غلط) · `*|${model}` (نموذج مو موجود) -> { until, code }
const cooldowns = new Map();
let activeKey = 0;
let override = null; // للاختبارات: async ({ systemInstruction, contents, generationConfig, model, keyIndex }) => نص

// أخطاء نجرب بعدها مفتاح/نموذج ثاني بنفس الطلب
const ROTATE_CODES = new Set(['RATE_LIMIT', 'AUTH', 'SERVER', 'MODEL_NOT_FOUND']);
const MAX_ATTEMPTS = 8;
const HOUR = 60 * 60 * 1000;

function clientFor(apiKey) {
  let c = clients.get(apiKey);
  if (!c) {
    c = new GoogleGenerativeAI(apiKey);
    clients.set(apiKey, c);
  }
  return c;
}

/** للاختبارات: بديل لـGemini (null ← يرجع الحقيقي) */
function setGenerator(fn) {
  override = fn;
}

function generationConfigFor(model, { maxOutputTokens, temperature, json = false }) {
  const gc = { maxOutputTokens, temperature };
  if (json) gc.responseMimeType = 'application/json'; // مخرجات JSON منظمة (نظام تنفيذ أوامر المالك)
  // نماذج 2.5 flash "تفكّر" قبل الرد ويحسب التفكير من حد الرد — للدعم الفوري نطفيه
  // (أسرع وأرخص، وما يطلع رد فاضي لو التفكير أكل الحد)
  if (/2\.5-flash/.test(model)) gc.thinkingConfig = { thinkingBudget: 0 };
  return gc;
}

function classify(err) {
  if (!err) return 'UNKNOWN';
  if (err.code === 'TIMEOUT' || err.name === 'AbortError' || /timeout|aborted/i.test(err.message || '')) return 'TIMEOUT';
  if (err instanceof GoogleGenerativeAIResponseError || /SAFETY|blocked/i.test(err.message || '')) return 'BLOCKED';
  const status = err.status || (err instanceof GoogleGenerativeAIFetchError ? err.status : null);
  if (status === 429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(err.message || '')) return 'RATE_LIMIT';
  if (status === 400 && /API key/i.test(err.message || '')) return 'AUTH';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status >= 500) return 'SERVER';
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/i.test(err.message || '')) return 'NETWORK';
  return 'UNKNOWN';
}

// كم يرتاح المفتاح/النموذج بعد الخطأ
function cooldownMs(code, err) {
  const msg = String((err && err.message) || '');
  if (code === 'AUTH' || code === 'MODEL_NOT_FOUND') return 6 * HOUR;
  if (code === 'SERVER') return 20 * 1000;
  if (code === 'RATE_LIMIT') {
    // Reason: الحد اليومي يرجع بعد منتصف الليل بتوقيت جوجل — نعيد التجربة كل ساعة بدل ما نحسب المنطقة الزمنية
    if (/per ?day|PerDay|daily/i.test(msg)) return HOUR;
    const m = msg.match(/retry (?:in|after) ([\d.]+)\s*s/i) || msg.match(/"retryDelay"\s*:\s*"(\d+)s"/);
    return m ? Math.min(Math.ceil(Number(m[1]) * 1000) + 500, 10 * 60 * 1000) : 60 * 1000;
  }
  return 0;
}

function cooldownKey(code, keyIndex, model) {
  if (code === 'AUTH') return `${keyIndex}|*`;
  if (code === 'MODEL_NOT_FOUND') return `*|${model}`;
  return `${keyIndex}|${model}`;
}

// null = جاهز، وإلا { until, code } لأقرب قيد
function coolingFor(keyIndex, model, now = Date.now()) {
  let hit = null;
  for (const k of [`${keyIndex}|${model}`, `${keyIndex}|*`, `*|${model}`]) {
    const v = cooldowns.get(k);
    if (!v) continue;
    if (v.until <= now) {
      cooldowns.delete(k);
      continue;
    }
    if (!hit || v.until > hit.until) hit = v;
  }
  return hit;
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => (t = setTimeout(() => rej(Object.assign(new Error('Gemini timeout'), { code: 'TIMEOUT' })), ms)))
  ]).finally(() => clearTimeout(t));
}

// رسالة ← محتوى Gemini: نص + صور (inlineData base64) لو موجودة
function toContent(m) {
  const parts = [];
  for (const img of Array.isArray(m.images) ? m.images : []) {
    if (img && img.mimeType && img.data) parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
  }
  const text = String(m.text || '');
  if (text || !parts.length) parts.push({ text });
  return { role: m.role === 'model' ? 'model' : 'user', parts };
}

// ترتيب التجارب: النموذج الأساسي بكل المفاتيح (من النشط وطالع)، بعدها النماذج الاحتياطية
function plan(cfg, now) {
  const keys = cfg.geminiApiKeys && cfg.geminiApiKeys.length ? cfg.geminiApiKeys : [cfg.geminiApiKey];
  const models = [cfg.geminiModel, ...(cfg.geminiFallbackModels || []).filter((m) => m !== cfg.geminiModel)];
  const all = [];
  for (const model of models) {
    for (let i = 0; i < keys.length; i++) {
      const keyIndex = (activeKey + i) % keys.length;
      all.push({ model, keyIndex, apiKey: keys[keyIndex], cooling: coolingFor(keyIndex, model, now) });
    }
  }
  const ready = all.filter((a) => !a.cooling);
  if (ready.length) return ready.slice(0, MAX_ATTEMPTS);
  // كل شي يرتاح ← نجرب الأقرب انتهاءً من الحد المؤقت (التقدير ممكن يكون متحفظ) بدل ما نسكت
  const soonest = all
    .filter((a) => a.cooling.code === 'RATE_LIMIT' || a.cooling.code === 'SERVER')
    .sort((a, b) => a.cooling.until - b.cooling.until)[0];
  return soonest ? [soonest] : [];
}

async function callOnce({ apiKey, keyIndex, model, systemInstruction, contents, generationConfig, timeoutMs }) {
  if (override) {
    return withTimeout(Promise.resolve(override({ systemInstruction, contents, generationConfig, model, keyIndex })), timeoutMs);
  }
  const m = clientFor(apiKey).getGenerativeModel({ model, systemInstruction, generationConfig }, { timeout: timeoutMs });
  const res = await withTimeout(m.generateContent({ contents }), timeoutMs);
  return res.response.text(); // يرمي لو الرد انحجب بفلاتر الأمان
}

/**
 * @param {object} p
 * @param {string} p.systemInstruction
 * @param {{role:'user'|'model', text:string, images?:{mimeType:string,data:string}[]}[]} p.messages  المحادثة كاملة (آخرها رسالة المستخدم)
 * @param {boolean} [p.json]  رد بصيغة JSON (responseMimeType) — لنظام تنفيذ أوامر المالك
 * @param {object} [p.meta]  { context, guildId, userId, channelId } — للسجل فقط
 * @returns {Promise<{ok:true,text:string}|{ok:false,code:string}>}
 */
async function generate({ systemInstruction, messages, maxOutputTokens = 1024, temperature = 0.6, json = false, meta = {} }) {
  const cfg = loadConfig();
  const started = Date.now();
  const contents = messages.map(toContent);
  const attempts = plan(cfg, started);
  let result = { ok: false, code: attempts.length ? 'UNKNOWN' : 'RATE_LIMIT' };
  let used = null;
  let tries = 0;

  for (const a of attempts) {
    if (coolingFor(a.keyIndex, a.model) && attempts.length > 1) continue; // انحظر أثناء هالطلب (نموذج مو موجود مثلاً)
    tries += 1;
    used = a;
    try {
      const text = String(
        (await callOnce({
          ...a,
          systemInstruction,
          contents,
          generationConfig: generationConfigFor(a.model, { maxOutputTokens, temperature, json }),
          timeoutMs: cfg.geminiTimeoutMs
        })) || ''
      ).trim();
      result = text ? { ok: true, text } : { ok: false, code: 'EMPTY' };
      if (a.keyIndex !== activeKey) {
        logger.info('🔑 Gemini: تحويل تلقائي لمفتاح ثاني', { from: activeKey + 1, to: a.keyIndex + 1, model: a.model });
        activeKey = a.keyIndex;
      }
      break;
    } catch (err) {
      const code = classify(err);
      result = { ok: false, code };
      logger.warn('🤖 Gemini: فشل الطلب', { ...meta, key: a.keyIndex + 1, model: a.model, code, status: err.status, error: String(err.message || err).slice(0, 600) });
      if (!ROTATE_CODES.has(code)) break;
      const ms = cooldownMs(code, err);
      if (ms > 0) cooldowns.set(cooldownKey(code, a.keyIndex, a.model), { until: Date.now() + ms, code });
    }
  }

  logger.info('🤖 تفاعل ذكاء اصطناعي', {
    ...meta,
    model: used ? used.model : cfg.geminiModel,
    key: used ? used.keyIndex + 1 : undefined,
    tries,
    ok: result.ok,
    code: result.ok ? undefined : result.code,
    ms: Date.now() - started,
    turns: messages.length
  });
  return result;
}

/** حالة المفاتيح (للوحة الإدارة) — بدون المفاتيح نفسها */
function status() {
  const cfg = loadConfig();
  const keys = cfg.geminiApiKeys && cfg.geminiApiKeys.length ? cfg.geminiApiKeys : [cfg.geminiApiKey];
  const now = Date.now();
  return {
    model: cfg.geminiModel,
    fallbackModels: [...(cfg.geminiFallbackModels || [])],
    activeKey: activeKey + 1,
    keys: keys.map((_, i) => {
      const c = coolingFor(i, cfg.geminiModel, now);
      return { index: i + 1, active: i === activeKey, cooling: c ? { code: c.code, seconds: Math.ceil((c.until - now) / 1000) } : null };
    })
  };
}

function _reset() {
  cooldowns.clear();
  clients.clear();
  activeKey = 0;
}

module.exports = { generate, setGenerator, classify, status, _internal: { generationConfigFor, toContent, cooldownMs, cooldowns, plan, reset: _reset } };
