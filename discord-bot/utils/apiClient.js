'use strict';

// عميل HTTP الوحيد للتواصل مع طبقة API الموقع.
// - كل طلب يحمل x-api-key السري.
// - مهلة محددة (API_TIMEOUT_MS، افتراضياً 5 ثوانٍ).
// - إعادة محاولة واحدة فقط للأخطاء المؤقتة (انقطاع شبكة، مهلة، 5xx، 429)،
//   ولا إعادة لأخطاء 4xx المنطقية (لاعب غير موجود، مدخل خاطئ...) لأن تكرارها ما يغيّر النتيجة.
// - كل الأخطاء تتحول لـApiError بكود موحّد؛ الأوامر تقرر الرسالة الودّية
//   للمستخدم بناءً على الكود فقط، بدون أي تفاصيل تقنية.

const axios = require('axios');
const { loadConfig } = require('../config');
const logger = require('./logger');

const RETRY_DELAY_MS = 400;

class ApiError extends Error {
  constructor(code, message, { status = 0, retryable = false, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.details = details;
  }
}

// عدّاد استدعاءات اليوم من جهة البوت (يظهر بأمر الإدارة) — يتصفّر مع تغيّر اليوم (UTC).
const usage = { day: new Date().toISOString().slice(0, 10), calls: 0, failures: 0 };
function trackUsage(failed) {
  const today = new Date().toISOString().slice(0, 10);
  if (usage.day !== today) { usage.day = today; usage.calls = 0; usage.failures = 0; }
  usage.calls += 1;
  if (failed) usage.failures += 1;
}

let http = null;
function client() {
  if (http) return http;
  const config = loadConfig();
  http = axios.create({
    baseURL: config.apiBaseUrl,
    timeout: config.apiTimeoutMs,
    headers: {
      'x-api-key': config.apiKey,
      'User-Agent': 'EhsmahaDiscordBot/1.0'
    },
    // نتعامل مع كل الأكواد بأنفسنا بدل ما يرمي axios على أي 4xx/5xx
    validateStatus: () => true,
    maxRedirects: 0,
    // النسخة الاحتياطية لقاعدة البوت (base64) ممكن توصل ميقابايتات
    maxBodyLength: 16 * 1024 * 1024,
    maxContentLength: 16 * 1024 * 1024
  });
  return http;
}

function isRetryableNetworkError(err) {
  return ['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'ERR_NETWORK']
    .includes(err && err.code);
}

// يحوّل رد الـAPI (ناجح/فاشل) لقيمة أو ApiError.
function interpret(res) {
  const body = res.data && typeof res.data === 'object' ? res.data : {};
  if (res.status >= 200 && res.status < 300 && body.ok !== false) return body.data !== undefined ? body.data : body;

  const apiCode = body.error && body.error.code;
  const apiMessage = (body.error && body.error.message) || `HTTP ${res.status}`;
  // الحصة اليومية خلصت: إعادة المحاولة ما تفيد (وتستهلك أكثر)
  const retryable = (res.status >= 500 || res.status === 429) && apiCode !== 'QUOTA_EXCEEDED';
  let code = apiCode;
  if (!code) {
    if (res.status === 401 || res.status === 403) code = 'UNAUTHORIZED';
    else if (res.status === 404) code = 'NOT_FOUND';
    else if (res.status === 429) code = 'RATE_LIMITED';
    else if (res.status >= 500) code = 'SERVER_ERROR';
    else code = 'BAD_REQUEST';
  }
  return new ApiError(code, apiMessage, { status: res.status, retryable, details: body.error && body.error.details });
}

async function request(method, url, { data, params, timeout, retries = 1 } = {}) {
  let lastError = null;
  const attempts = 1 + retries;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now();
    try {
      const res = await client().request({ method, url, data, params, ...(timeout ? { timeout } : {}) });
      const result = interpret(res);
      if (!(result instanceof ApiError)) {
        trackUsage(false);
        logger.debug('API ok', { method, url, status: res.status, ms: Date.now() - started });
        return result;
      }
      lastError = result;
      if (!result.retryable) break;
      logger.warn('API returned retryable error', { method, url, status: res.status, attempt });
    } catch (err) {
      lastError = new ApiError(
        err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'NETWORK_ERROR',
        err.message,
        { retryable: isRetryableNetworkError(err) }
      );
      logger.warn('API request failed', { method, url, code: err.code, attempt, ms: Date.now() - started });
      if (!lastError.retryable) break;
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }
  trackUsage(true);
  // أخطاء "منطقية" متوقعة (لاعب غير موجود...) ما تستاهل warn — باقي الأخطاء نسجلها
  const expected = ['PLAYER_NOT_FOUND', 'NOT_FOUND', 'INVALID_INPUT'].includes(lastError.code);
  logger[expected ? 'debug' : 'error']('API call failed', { method, url, code: lastError.code, status: lastError.status });
  throw lastError;
}

const enc = encodeURIComponent;

module.exports = {
  ApiError,
  usage: () => ({ ...usage }),

  // اليوزرنيم يُشفَّر بـencodeURIComponent (UTF-8) — يدعم العربي وأي رموز بأمان
  getProfileByUsername: (username) => request('get', `/api/discord/profile-by-username/${enc(username)}`),
  getStatsByUsername: (username) => request('get', `/api/discord/stats-by-username/${enc(username)}`),
  // للـAutocomplete: Discord يعطي 3 ثوانٍ فقط للرد — مهلة قصيرة وبدون إعادة محاولة
  searchUsernames: (q, limit = 20) =>
    request('get', '/api/discord/search-usernames', { params: { q, limit }, timeout: 2000, retries: 0 }),
  getLeaderboard: (period = 'global', limit = 50) =>
    request('get', '/api/discord/leaderboard', { params: { period, limit } }),
  getWinners: (streamer, limit = 50) =>
    request('get', '/api/discord/winners', { params: { ...(streamer ? { streamer } : {}), limit } }),
  searchStreamers: (q) =>
    request('get', '/api/discord/winners/streamers', { params: { q }, timeout: 2000, retries: 0 }),
  getEvents: () => request('get', '/api/discord/events'),
  // المزامنة الدورية لـ/بث — بدون إعادة محاولة (المحاولة الجاية بعد 30 ثانية أصلاً)
  getActiveStreams: () => request('get', '/api/discord/active-streams', { retries: 0 }),
  getAdminStats: () => request('get', '/api/discord/admin/stats'),
  // النسخة الاحتياطية لقاعدة بيانات البوت — مهلة طويلة (الـAPI المجاني ممكن يكون نايم ~50 ثانية)
  claimBotState: (bootAt) => request('post', '/api/discord/bot-state/claim', { data: { bootAt }, timeout: 75_000, retries: 1 }),
  saveBotState: (payload) => request('put', '/api/discord/bot-state', { data: payload, timeout: 75_000, retries: 1 }),
  health: () => request('get', '/health')
};
