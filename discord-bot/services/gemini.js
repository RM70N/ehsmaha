'use strict';

// غلاف Gemini (@google/generative-ai) — كل استدعاءات الذكاء الاصطناعي تمر من هنا:
//   • المفتاح من GEMINI_API_KEY فقط، والنموذج من GEMINI_MODEL (افتراضي gemini-2.5-flash)
//   • مهلة لكل طلب، وتصنيف الأخطاء (حد جوجل، شبكة، فلاتر الأمان، مفتاح غلط…)
//   • سطر بالسجل لكل استدعاء: السياق، من سأل، المدة، نجح أو فشل (بدون المحتوى)
// ما يرمي أخطاء أبداً — يرجع { ok, text } أو { ok:false, code }.

const { GoogleGenerativeAI, GoogleGenerativeAIFetchError, GoogleGenerativeAIResponseError } = require('@google/generative-ai');
const { loadConfig } = require('../config');
const logger = require('../utils/logger');

let client = null;
let override = null; // للاختبارات: async ({ systemInstruction, contents, generationConfig }) => نص

function getClient() {
  if (!client) client = new GoogleGenerativeAI(loadConfig().geminiApiKey);
  return client;
}

/** للاختبارات: بديل لـGemini (null ← يرجع الحقيقي) */
function setGenerator(fn) {
  override = fn;
}

function generationConfigFor(model, { maxOutputTokens, temperature }) {
  const gc = { maxOutputTokens, temperature };
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
  if (status === 429) return 'RATE_LIMIT';
  if (status === 400 && /API key/i.test(err.message || '')) return 'AUTH';
  if (status === 401 || status === 403) return 'AUTH';
  if (status === 404) return 'MODEL_NOT_FOUND';
  if (status >= 500) return 'SERVER';
  if (/fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|network/i.test(err.message || '')) return 'NETWORK';
  return 'UNKNOWN';
}

function withTimeout(promise, ms) {
  let t;
  return Promise.race([
    promise,
    new Promise((_, rej) => (t = setTimeout(() => rej(Object.assign(new Error('Gemini timeout'), { code: 'TIMEOUT' })), ms)))
  ]).finally(() => clearTimeout(t));
}

/**
 * @param {object} p
 * @param {string} p.systemInstruction
 * @param {{role:'user'|'model', text:string}[]} p.messages  المحادثة كاملة (آخرها رسالة المستخدم)
 * @param {object} [p.meta]  { context, guildId, userId, channelId } — للسجل فقط
 * @returns {Promise<{ok:true,text:string}|{ok:false,code:string}>}
 */
async function generate({ systemInstruction, messages, maxOutputTokens = 1024, temperature = 0.6, meta = {} }) {
  const cfg = loadConfig();
  const started = Date.now();
  const contents = messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text || '') }] }));
  const generationConfig = generationConfigFor(cfg.geminiModel, { maxOutputTokens, temperature });
  let result;
  try {
    let text;
    if (override) {
      text = await withTimeout(Promise.resolve(override({ systemInstruction, contents, generationConfig, model: cfg.geminiModel })), cfg.geminiTimeoutMs);
    } else {
      const model = getClient().getGenerativeModel(
        { model: cfg.geminiModel, systemInstruction, generationConfig },
        { timeout: cfg.geminiTimeoutMs }
      );
      const res = await withTimeout(model.generateContent({ contents }), cfg.geminiTimeoutMs);
      text = res.response.text(); // يرمي لو الرد انحجب بفلاتر الأمان
    }
    text = String(text || '').trim();
    result = text ? { ok: true, text } : { ok: false, code: 'EMPTY' };
  } catch (err) {
    result = { ok: false, code: classify(err) };
    logger.warn('🤖 Gemini: فشل الطلب', { ...meta, code: result.code, status: err.status, error: String(err.message || err).slice(0, 300) });
  }
  logger.info('🤖 تفاعل ذكاء اصطناعي', {
    ...meta,
    model: cfg.geminiModel,
    ok: result.ok,
    code: result.ok ? undefined : result.code,
    ms: Date.now() - started,
    turns: messages.length
  });
  return result;
}

module.exports = { generate, setGenerator, classify, _internal: { generationConfigFor } };
