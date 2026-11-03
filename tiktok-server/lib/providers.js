'use strict';
// مزودو توقيع اتصال تيك توك (Euler Stream أو سيرفر توقيع متوافق) + مسارات الخروج (مباشر/بروكسي).
//
// المزود = { مفتاح API (اختياري) + عنوان سيرفر التوقيع + مسار (مباشر أو بروكسي) }.
// لكل مزود: محدّد معدل تكيّفي مستقل (حصة Euler لكل مفتاح/IP) وقاطع دائرة مستقل.
// المزودات مرتبة بطبقات (tier). الاستراتيجية الافتراضية "متسلسلة" (TIKTOK_KEY_STRATEGY=sequential):
// المفتاح الأول وحده يعمل ما دام سليماً، ولو "خلص" (429 حصة/معدل، أو 402 رفض، أو تعطّل) ينتقل الاتصال
// تلقائياً للثاني، ثم الثالث… ويرجع للأول تلقائياً أول ما يتعافى قاطعه. الترتيب:
//   المفتاح 1 (tier 0) ← المفتاح 2 (tier 1) ← … ← عناوين توقيع بديلة ← الطبقة المجانية كملاذ أخير.
// الاستراتيجية "متوازنة" (balanced): كل المفاتيح بنفس الطبقة وتتقاسم الحمل بالتساوي.
// الطبقة الأدنى ما تُستخدم إلا لو كل مزودي الطبقة الأعلى معطّلين (قاطع مفتوح) — مو لمجرد ازدحام لحظي.
//
// لا أسرار هنا: كل شيء من متغيرات البيئة، والأسماء الظاهرة (name) عامة بلا مفاتيح ولا عناوين بروكسي.

const { CircuitBreaker } = require('./circuit-breaker');
const { RateLimiter } = require('./rate-limiter');

const MAX_PROVIDERS = 16;

function splitList(raw) {
  return String(raw || '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
}

// يقرأ إعداد المزودات من env. legacyKeyNames: أسماء قديمة مقبولة للمفتاح الأول.
function loadProviderDefs(env, defaults) {
  const d = Object.assign({ signUrl: 'https://api.eulerstream.com' }, defaults || {});
  const e = env || process.env;
  const keys = [];
  const sources = [];
  // يقبل مفتاحاً واحداً أو عدة مفاتيح بفواصل/فواصل منقوطة/أسطر/مسافات بأي متغيّر من الأسماء أدناه — لصق ٦ مفاتيح داخل
  // EULER_SIGN_API_KEY كان يُقرأ «مفتاحاً واحداً» عملاقاً (فيرفضه Euler ويبقى السيرفر على الطبقة المجانية).
  const addKeys = (raw, src) => {
    String(raw || '').split(/[,;\s]+/).map((k) => k.trim()).filter(Boolean).forEach((k) => { if (!keys.includes(k)) { keys.push(k); if (src && !sources.includes(src)) sources.push(src); } });
  };
  // ترتيب الأولوية: المفتاح الأول من الأسماء القديمة ← قوائم ← المرقّمة (EULER_API_KEY_2…، EULER_SIGN_API_KEY_2…، …)
  ['EULER_API_KEY', 'EULER_SIGN_API_KEY', 'SIGN_API_KEY'].forEach((n) => addKeys(e[n], n));
  ['EULER_API_KEYS', 'EULER_SIGN_API_KEYS', 'SIGN_API_KEYS'].forEach((n) => addKeys(e[n], n));
  ['EULER_API_KEY_', 'EULER_SIGN_API_KEY_', 'SIGN_API_KEY_'].forEach((pre) => { for (let i = 1; i <= 16; i++) addKeys(e[pre + i], pre + 'N'); });

  const primaryUrl = String(e.SIGN_API_URL || d.signUrl).trim();
  const fallbackUrls = splitList(e.TIKTOK_SIGN_FALLBACK_URLS);
  const proxies = splitList(e.TIKTOK_PROXIES);
  const freeFallback = String(e.TIKTOK_FREE_FALLBACK == null ? '1' : e.TIKTOK_FREE_FALLBACK) !== '0';
  const sequential = String(e.TIKTOK_KEY_STRATEGY || 'sequential').trim().toLowerCase() !== 'balanced';

  const routes = [{ id: 'direct', proxyUrl: '' }].concat(proxies.map((p, i) => ({ id: 'proxy' + (i + 1), proxyUrl: p })));
  const defs = [];
  const push = (def) => { if (defs.length < MAX_PROVIDERS) defs.push(def); };

  if (keys.length) {
    keys.forEach((key, ki) => routes.forEach((r) => push({ name: 'key' + (ki + 1) + '/' + r.id, tier: sequential ? ki : 0, apiKey: key, signUrl: primaryUrl, route: r.id, proxyUrl: r.proxyUrl, free: false })));
  } else {
    // بلا مفاتيح: الطبقة المجانية هي الأساس، وكل بروكسي = IP مستقل بحصته المجانية.
    routes.forEach((r) => push({ name: 'free/' + r.id, tier: 0, apiKey: '', signUrl: primaryUrl, route: r.id, proxyUrl: r.proxyUrl, free: true }));
  }
  const fbTier = sequential ? Math.max(1, keys.length) : 1;
  fallbackUrls.forEach((url, i) => push({ name: 'fallback' + (i + 1) + '/direct', tier: fbTier, apiKey: keys[0] || '', signUrl: url, route: 'direct', proxyUrl: '', free: !keys[0] }));
  if (keys.length && freeFallback) push({ name: 'free/direct', tier: fbTier + (fallbackUrls.length ? 1 : 0), apiKey: '', signUrl: primaryUrl, route: 'direct', proxyUrl: '', free: true });
  return { defs, keyCount: keys.length, proxyCount: proxies.length, fallbackCount: fallbackUrls.length, sequential, keySource: sources.join('+'), keyTails: keys.map((k) => '…' + k.slice(-4)) };
}

class ProviderPool {
  // defs: [{name, tier, apiKey, signUrl, route, proxyUrl, free}]
  constructor(defs, opts) {
    const o = Object.assign({
      now: Date.now, ratePerMin: 90, freeRatePerMin: 30, minRatePerMin: 6, burst: 6, inFlight: 4,
      breakerThreshold: 3, breakerCooldownMs: 30000, breakerMaxCooldownMs: 300000, deniedCooldownMs: 600000, dailyCooldownMs: 1800000, decreaseFactor: 0.6,
    }, opts || {});
    this.now = o.now;
    this.deniedCooldownMs = o.deniedCooldownMs;
    this.dailyCooldownMs = o.dailyCooldownMs;
    this.providers = defs.map((def, i) => {
      const rate = (def.free ? o.freeRatePerMin : o.ratePerMin) / 60;
      return {
        id: i, name: def.name, tier: def.tier || 0, route: def.route || 'direct', def,
        breaker: new CircuitBreaker({ failureThreshold: o.breakerThreshold, cooldownMs: o.breakerCooldownMs, maxCooldownMs: o.breakerMaxCooldownMs, now: o.now }),
        limiter: new RateLimiter({ maxRatePerSec: rate, minRatePerSec: o.minRatePerMin / 60, burst: o.burst, inFlightMax: o.inFlight, decreaseFactor: o.decreaseFactor, now: o.now }),
        lastUsedAt: 0, attempts: 0, successes: 0, failures: {},
        client: null, agent: null,
      };
    });
  }

  get size() { return this.providers.length; }

  byRoute(route) { return this.providers.filter((p) => p.route === route); }

  // يختار مزوداً متاحاً الآن. الناتج: {provider} | {waitMs} (أقرب وقت محتمل) | {waitMs:null} (كلهم مستبعدون).
  pick(exclude) {
    const ex = exclude || new Set();
    const tiers = [...new Set(this.providers.map((p) => p.tier))].sort((a, b) => a - b);
    let minWait = Infinity;
    let anyCandidate = false;
    for (const tier of tiers) {
      const inTier = this.providers.filter((p) => p.tier === tier && !ex.has(p.id));
      if (!inTier.length) continue;
      anyCandidate = true;
      const usable = inTier.filter((p) => p.breaker.waitMs() === 0 || p.breaker.state === 'half_open');
      const ready = inTier.filter((p) => p.breaker.waitMs() === 0 && p.limiter.waitMs() === 0);
      if (ready.length) {
        ready.sort((a, b) => (a.limiter.inFlight - b.limiter.inFlight) || (a.lastUsedAt - b.lastUsedAt));
        return { provider: ready[0] };
      }
      const waits = inTier.map((p) => Math.max(p.breaker.waitMs(), p.limiter.waitMs()));
      minWait = Math.min(minWait, ...waits);
      // طبقة فيها مزود قاطعه غير مفتوح = مجرد ازدحام لحظي: ننتظره ولا ننزل لطبقة أدنى.
      if (usable.length) return { waitMs: Math.max(1, minWait) };
    }
    if (!anyCandidate) return { waitMs: null };
    return { waitMs: Math.max(1, Number.isFinite(minWait) ? minWait : 1000) };
  }

  begin(provider) {
    provider.limiter.take();
    provider.breaker.onDispatch();
    provider.lastUsedAt = this.now();
    provider.attempts++;
  }

  // outcome: {ok:true} | {kind, retryAfterMs}
  // يرجع { opened, recovered, cooldownMs } لتسجيل "المفتاح خلص/رجع" باللوغ.
  end(provider, outcome) {
    provider.limiter.release();
    const wasOpen = provider.breaker.state !== 'closed';
    const info = { opened: false, recovered: false, cooldownMs: 0 };
    if (outcome && outcome.ok) {
      provider.successes++;
      provider.breaker.onSuccess();
      provider.limiter.onSuccess();
      info.recovered = wasOpen;
      return info;
    }
    const kind = (outcome && outcome.kind) || 'transient';
    provider.failures[kind] = (provider.failures[kind] || 0) + 1;
    if (kind === 'rate_limited' && outcome.daily) {
      // الحد اليومي انتهى: نُسكت المزود فترة طويلة (retry-after إن وصل وإلا dailyCooldownMs) بدل طرق الباب كل 5 دقائق
      provider.limiter.onRateLimited();
      provider.breaker.trip(outcome.retryAfterMs > 0 ? Math.min(outcome.retryAfterMs, 3600000) : this.dailyCooldownMs, true);
    } else if (kind === 'rate_limited') {
      provider.limiter.onRateLimited();
      provider.breaker.trip(outcome.retryAfterMs > 0 ? outcome.retryAfterMs : 0);
    } else if (kind === 'provider_denied') {
      provider.breaker.trip(this.deniedCooldownMs, true);
    } else if (kind === 'sign_failed') {
      provider.breaker.onFailure();
    }
    // user_not_found / offline / blocked / timeout / transient: لا تُحسب ضد سلامة مزود التوقيع
    // (المهلة قد تكون من تيك توك نفسه؛ حكم القاطع فقط على أخطاء التوقيع الصريحة).
    info.opened = !wasOpen && provider.breaker.state === 'open';
    info.cooldownMs = Math.max(0, provider.breaker.waitMs());
    return info;
  }

  // مجموع معدل الاتصال (طلب/ثانية) للمزودين المتاحين الآن — لتقدير زمن الانتظار بالطابور.
  totalRatePerSec() {
    return this.providers.filter((p) => p.breaker.waitMs() === 0).reduce((sum, p) => sum + p.limiter.rate, 0);
  }

  // أقرب وقت (ms) يصير فيه أي مزود جاهزاً — للعرض للمستخدم (retryInSec).
  earliestReadyMs(exclude) {
    const r = this.pick(exclude);
    return r.provider ? 0 : (r.waitMs == null ? 0 : r.waitMs);
  }

  snapshot() {
    // الدور: active = يخدم الآن (أدنى طبقة فيها مزود سليم)، standby = احتياطي ينتظر، cooling = "خلص"/معطّل مؤقتاً
    const healthy = this.providers.filter((p) => p.breaker.state !== 'open');
    const activeTier = healthy.length ? Math.min(...healthy.map((p) => p.tier)) : null;
    return this.providers.map((p) => ({
      name: p.name,
      tier: p.tier,
      route: p.route,
      role: p.breaker.state === 'open' ? 'cooling' : (p.tier === activeTier ? 'active' : 'standby'),
      breaker: p.breaker.state,
      cooldownSec: Math.ceil(Math.max(0, p.breaker.waitMs()) / 1000),
      ratePerMin: Math.round(p.limiter.rate * 60 * 10) / 10,
      inFlight: p.limiter.inFlight,
      attempts: p.attempts,
      successes: p.successes,
      failures: p.failures,
      rateLimitPenalties: p.limiter.penalties,
    }));
  }
}

// خيارات TikTokLiveConnection لمزود معيّن. deps = { lib (tiktok-live-connector), sdk (tiktok-live-api-sdk) }.
function buildConnectionOptions(provider, deps) {
  const def = provider.def;
  if (!provider.client) {
    const SignConfig = (deps.lib && deps.lib.SignConfig) || {};
    const baseHeaders = Object.assign({}, (SignConfig.baseOptions && SignConfig.baseOptions.headers) || {});
    const baseOptions = {
      headers: baseHeaders,
      // المكتبة تفحص response.status بنفسها (429/402...) فلازم axios ما يرمي على الحالات غير 200.
      validateStatus: () => true,
      // بدون مهلة يعلّق طلب التوقيع للأبد لو السيرفر ما رد (المكتبة ما تضع مهلة).
      timeout: deps.signTimeoutMs || 15000,
    };
    if (def.proxyUrl) {
      provider.agent = provider.agent || new deps.HttpsProxyAgent(def.proxyUrl);
      baseOptions.httpAgent = provider.agent;
      baseOptions.httpsAgent = provider.agent;
      baseOptions.proxy = false; // ما نترك axios يقرأ HTTP(S)_PROXY من البيئة فوق وكيلنا
    }
    const Client = deps.sdk.default || deps.sdk;
    const cfg = { basePath: def.signUrl, baseOptions };
    if (def.apiKey) cfg.apiKey = def.apiKey;
    provider.client = new Client(cfg);
  }
  const options = { processInitialData: false, eulerApiInstance: provider.client };
  if (deps.fetchRoomInfoOnConnect === false) options.fetchRoomInfoOnConnect = false;
  if (def.proxyUrl) {
    provider.agent = provider.agent || new deps.HttpsProxyAgent(def.proxyUrl);
    options.webClientOptions = { agent: { http: provider.agent, https: provider.agent } };
    options.wsClientOptions = { agent: provider.agent };
  }
  return options;
}

module.exports = { ProviderPool, loadProviderDefs, buildConnectionOptions, splitList, MAX_PROVIDERS };
