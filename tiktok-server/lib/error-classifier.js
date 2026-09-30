'use strict';
// تصنيف أخطاء tiktok-live-connector (2.5.x) — دالة نقية قابلة للاختبار.
//
// الأصناف (kind) وما يُفعل بكل منها (راجع TikTokRoom.handleAttemptFailure):
//   permanent  : user_not_found            → لا تُعاد بسرعة؛ رسالة واضحة للمستخدم.
//   waiting    : offline                   → ليست فشلاً؛ ننتظر فتح البث.
//   provider   : rate_limited | sign_failed | provider_denied
//                                          → عطل عند مزود التوقيع: نبدّل المزود فوراً ونفتح قاطعه.
//   route      : blocked                   → تيك توك يحجب مسار الاتصال (IP/بروكسي): نبدّل المسار.
//   transient  : timeout | transient       → فشل عابر: تراجع أسّي على مستوى الغرفة.
//
// مصادر التحقق (المكتبة 2.5.0 المثبتة):
//   - SignatureRateLimitError: رد 429 من Euler، و retryAfter بالمللي ثانية (من ترويسة retry-after).
//   - SignAPIError.reason: 'Rate Limited' | 'Sign Error' (حالة غير 200/429/402) | 'Empty Cookies' |
//     'Connect Error' (تعذّر الوصول لسيرفر التوقيع: ECONNREFUSED/مهلة/DNS) | 'Premium Feature' (402/403).
//   - InvalidResponseCompositeError "Failed to retrieve Room ID from all sources": الأسباب الحقيقية
//     في err.config.requestErrs (صفحة HTML ← api-live ← Euler).

const RATE_LIMIT_RE = /retry-after|rate.?limit|too many|\b429\b/i;
const NOT_FOUND_RE = /user[ _-]?not[ _-]?(found|exist)|doesn'?t exist|does not exist|19881007/i;
const BLOCKED_RE = /captcha|might be blocked|\bblocked\b|access denied|\b403\b/i;
// نص احتياطي فقط: أخطاء التوقيع الحقيقية تأتي كـSignAPIError؛ أخطاء الشبكة العامة (ECONNREFUSED...) عابرة لا عطل مزود.
const SIGN_RE = /sign server|signature|eulerstream|euler stream/i;
// حد يومي على حساب Euler (limit_label = rate_limit_account_day …): لا يتجدد قبل ساعات، فلا معنى لإعادة المحاولة كل ثوانٍ.
const DAILY_LIMIT_RE = /account_day|_day\b|per day|daily/i;
const TIMEOUT_RE = /timed? ?out|ETIMEDOUT|ESOCKETTIMEDOUT|انتهت مهلة/i;

function errText(err) {
  if (!err) return 'خطأ غير معروف';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

function makeIsErr(lib) {
  return (err, name) => {
    const Cls = lib && lib[name];
    return typeof Cls === 'function' && err instanceof Cls;
  };
}

// lib = صادرات tiktok-live-connector (أو محاكيها بالاختبارات).
function classifyTikTokError(err, lib) {
  const isErr = makeIsErr(lib);
  const retryAfterOf = (e) => Number(e && e.retryAfter) || 0;

  if (isErr(err, 'UserOfflineError')) return { kind: 'offline' };
  if (isErr(err, 'SignatureRateLimitError') || (err && err.reason === 'Rate Limited')) {
    return { kind: 'rate_limited', retryAfterMs: retryAfterOf(err), daily: DAILY_LIMIT_RE.test(errText(err)) };
  }
  if (isErr(err, 'InvalidUniqueIdError')) return { kind: 'user_not_found' };
  if (isErr(err, 'PremiumFeatureError') || (err && err.reason === 'Premium Feature')) return { kind: 'provider_denied' };
  if (isErr(err, 'ConnectTimeoutError')) return { kind: 'timeout' };
  if (isErr(err, 'SignAPIError') || (err && typeof err.reason === 'string' && /^(Sign Error|Empty Cookies|Connect Error|Empty Payload|Authenticated WS)$/.test(err.reason))) {
    return { kind: 'sign_failed' };
  }

  const inner = err && err.config && Array.isArray(err.config.requestErrs) ? err.config.requestErrs : null;
  if (inner && inner.length) {
    const texts = inner.map(errText);
    const rl = inner.find((e) => isErr(e, 'SignatureRateLimitError'));
    if (rl) return { kind: 'rate_limited', retryAfterMs: retryAfterOf(rl), daily: DAILY_LIMIT_RE.test(errText(rl)) };
    if (texts.some((t) => RATE_LIMIT_RE.test(t))) return { kind: 'rate_limited', retryAfterMs: 0 };
    if (texts.some((t) => NOT_FOUND_RE.test(t))) return { kind: 'user_not_found' };
    if (texts.some((t) => BLOCKED_RE.test(t))) return { kind: 'blocked' };
    // الحساب موجود لكن ما له غرفة بث (ما فتح لايف) — هذا "مو لايف"، مو خطأ.
    if (texts.some((t) => /extract room id/i.test(t))) return { kind: 'offline' };
    if (texts.some((t) => TIMEOUT_RE.test(t))) return { kind: 'timeout' };
    return { kind: 'transient' };
  }

  const text = errText(err);
  if (RATE_LIMIT_RE.test(text)) return { kind: 'rate_limited', retryAfterMs: retryAfterOf(err), daily: DAILY_LIMIT_RE.test(text) };
  if (NOT_FOUND_RE.test(text)) return { kind: 'user_not_found' };
  if (TIMEOUT_RE.test(text)) return { kind: 'timeout' };
  if (SIGN_RE.test(text)) return { kind: 'sign_failed' };
  if (BLOCKED_RE.test(text)) return { kind: 'blocked' };
  return { kind: 'transient' };
}

const PROVIDER_KINDS = new Set(['rate_limited', 'sign_failed', 'provider_denied']);
const isProviderFault = (kind) => PROVIDER_KINDS.has(kind);
const isPermanent = (kind) => kind === 'user_not_found';

module.exports = { classifyTikTokError, errText, isProviderFault, isPermanent };
